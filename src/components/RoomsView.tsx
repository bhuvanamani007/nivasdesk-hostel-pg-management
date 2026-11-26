import { useCallback, useEffect, useState } from 'react';
import {
  Download,
  LayoutGrid,
  Pencil,
  Plus,
  Search,
  Table2,
  Trash2,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { api } from '../lib/api';
import { downloadCsv } from '../lib/csv';
import { formatDateShort, formatInr } from '../lib/format';
import { t } from '../lib/i18n';
import { useLanguage } from '../lib/LanguageContext';
import {
  ROOM_TYPES,
  type EnrichedBed,
  type PaginationMeta,
  type PreferredLanguage,
  type Room,
  type RoomsSummary,
  type UserRole,
} from '../types/domain';
import { ConfirmDialog } from './ConfirmDialog';
import { Pagination } from './Pagination';
import { BedStatusIndicator, RoomStatusIndicator } from './StatusLabel';

interface RoomsViewProps {
  refreshKey: number;
  userRole: UserRole;
  uiLanguage?: PreferredLanguage;
  onAddRoom: () => void;
  onEditRoom: (room: Room) => void;
  onAssignBed: (bed: EnrichedBed) => void;
  onOpenGuest: (guestId: string) => void;
  onDataChanged: () => void;
}

const DEFAULT_PAGINATION: PaginationMeta = {
  page: 1,
  pageSize: 6,
  totalItems: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

const DEFAULT_BEDS_PAGINATION: PaginationMeta = {
  page: 1,
  pageSize: 10,
  totalItems: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

const DEFAULT_SUMMARY: RoomsSummary = {
  totalRooms: 0,
  totalBeds: 0,
  occupiedBeds: 0,
  vacantBeds: 0,
  maintenanceBeds: 0,
  occupancyPercent: 0,
  occupiedMonthlyRent: 0,
  vacantMonthlyPotential: 0,
};

export function RoomsView({
  refreshKey,
  userRole,
  uiLanguage = 'en',
  onAddRoom,
  onEditRoom,
  onAssignBed,
  onOpenGuest,
  onDataChanged,
}: RoomsViewProps) {
  const { tr } = useLanguage();
  const canManageRooms = userRole === 'owner' || userRole === 'warden' || userRole === 'overall_admin';
  const canDeleteRoom = userRole === 'owner' || userRole === 'overall_admin';

  const [viewLayout, setViewLayout] = useState<'rooms' | 'beds'>('rooms');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'occupied' | 'maintenance'>('all');
  const [floorFilter, setFloorFilter] = useState<string>('all');
  const [roomTypeFilter, setRoomTypeFilter] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [bedPage, setBedPage] = useState(1);
  const [bedPageSize, setBedPageSize] = useState(10);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomBeds, setRoomBeds] = useState<EnrichedBed[]>([]);
  const [floors, setFloors] = useState<string[]>([]);
  const [summary, setSummary] = useState<RoomsSummary>(DEFAULT_SUMMARY);
  const [pagination, setPagination] = useState<PaginationMeta>(DEFAULT_PAGINATION);

  const [tableBeds, setTableBeds] = useState<EnrichedBed[]>([]);
  const [bedsPagination, setBedsPagination] = useState<PaginationMeta>(DEFAULT_BEDS_PAGINATION);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [busyBedId, setBusyBedId] = useState<string | null>(null);
  const [addingBedRoomId, setAddingBedRoomId] = useState<string | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<Room | null>(null);
  const [bedToDelete, setBedToDelete] = useState<EnrichedBed | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
      setBedPage(1);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const fetchRooms = api
      .getRooms(
        {
          page,
          pageSize,
          status: statusFilter,
          floor: floorFilter,
          roomType: roomTypeFilter,
          search,
        },
        controller.signal
      )
      .then((res) => {
        setRooms(res.rooms);
        setRoomBeds(res.beds);
        setFloors(res.floors || []);
        if (res.summary) setSummary(res.summary);
        setPagination(res.pagination);
        if (res.pagination.page !== page) {
          setPage(res.pagination.page);
        }
      });

    const fetchTableBeds =
      viewLayout === 'beds'
        ? api
            .getBeds(
              {
                page: bedPage,
                pageSize: bedPageSize,
                status: statusFilter,
                floor: floorFilter,
                roomType: roomTypeFilter,
                search,
              },
              controller.signal
            )
            .then((res) => {
              setTableBeds(res.beds);
              setBedsPagination(res.pagination);
              if (res.pagination.page !== bedPage) {
                setBedPage(res.pagination.page);
              }
            })
        : Promise.resolve();

    Promise.all([fetchRooms, fetchTableBeds])
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load rooms & beds.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    viewLayout,
    page,
    pageSize,
    bedPage,
    bedPageSize,
    statusFilter,
    floorFilter,
    roomTypeFilter,
    search,
    refreshKey,
    reloadTick,
  ]);

  const handleRetry = useCallback(() => {
    setReloadTick((tick) => tick + 1);
  }, []);

  const handleResetFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatusFilter('all');
    setFloorFilter('all');
    setRoomTypeFilter('all');
    setPage(1);
    setBedPage(1);
  };

  const handleToggleMaintenance = async (bed: EnrichedBed) => {
    setError(null);
    setBusyBedId(bed.id);
    try {
      const next = bed.status === 'maintenance' ? 'vacant' : 'maintenance';
      await api.toggleBedStatus(bed.id, next);
      onDataChanged();
      setReloadTick((tick) => tick + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update bed status.');
    } finally {
      setBusyBedId(null);
    }
  };

  const handleAddBed = async (room: Room) => {
    setError(null);
    setAddingBedRoomId(room.id);
    try {
      await api.addBedToRoom(room.id);
      onDataChanged();
      setReloadTick((tick) => tick + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add bed to room.');
    } finally {
      setAddingBedRoomId(null);
    }
  };

  const handleConfirmDeleteRoom = async () => {
    if (!roomToDelete) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await api.deleteRoom(roomToDelete.id);
      setRoomToDelete(null);
      onDataChanged();
      setReloadTick((tick) => tick + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete room.');
      setRoomToDelete(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleConfirmDeleteBed = async () => {
    if (!bedToDelete) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await api.deleteBed(bedToDelete.id);
      setBedToDelete(null);
      onDataChanged();
      setReloadTick((tick) => tick + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove bed.');
      setBedToDelete(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleExportCsv = async () => {
    setExportBusy(true);
    setError(null);
    try {
      const res = await api.getBeds({
        page: 1,
        pageSize: 500,
        status: statusFilter,
        floor: floorFilter,
        roomType: roomTypeFilter,
        search,
      });
      const headers = [
        tr('Room'),
        tr('Bed'),
        tr('Floor'),
        tr('Room Type'),
        tr('Monthly Rent (INR)'),
        tr('Status'),
        tr('Current Resident'),
        tr('Expected Checkout'),
        tr('Upcoming Reservation'),
      ];
      const rows = res.beds.map((b) => [
        b.roomNumber,
        b.bedLabel,
        tr(b.floor),
        tr(b.roomType),
        b.monthlyTariff,
        tr(b.status),
        b.occupantGuestName || '',
        b.occupantExpectedCheckoutDate || '',
        b.upcomingReservation
          ? `${b.upcomingReservation.guestName} (${formatDateShort(b.upcomingReservation.checkInAt)})`
          : '',
      ]);
      downloadCsv(`rooms-beds-inventory-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export rooms and beds.');
    } finally {
      setExportBusy(false);
    }
  };

  const hasActiveFilters =
    statusFilter !== 'all' ||
    floorFilter !== 'all' ||
    roomTypeFilter !== 'all' ||
    Boolean(search);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="typo-page-title text-slate-900">
            {t(uiLanguage, 'nav.rooms')}
          </h1>
          <p className="typo-body mt-0.5 text-slate-600">
            {tr('Configure rooms, bed capacity, monthly tariffs, facilities, maintenance, and bed assignments.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={exportBusy}
            onClick={handleExportCsv}
            className="typo-btn inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>{exportBusy ? tr('Exporting...') : t(uiLanguage, 'common.exportCsv')}</span>
          </button>

          {canManageRooms && (
            <button
              type="button"
              onClick={onAddRoom}
              className="typo-btn inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{t(uiLanguage, 'action.addRoom')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary Strip */}
      <section
        aria-label={tr('Rooms and beds summary')}
        className="grid grid-cols-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white sm:grid-cols-3 lg:grid-cols-5 sm:divide-y-0 sm:divide-x"
      >
        <div className="px-4 py-3.5">
          <p className="typo-card-title font-semibold text-slate-600">{tr('Total Rooms & Beds')}</p>
          <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {tr(`${summary.totalRooms} rooms · ${summary.totalBeds} beds`)}
          </p>
        </div>
        <div className="px-4 py-3.5">
          <p className="typo-card-title font-semibold text-slate-600">{tr('Occupied Beds')}</p>
          <p className="mt-1 font-mono text-lg font-semibold text-teal-800 tabular-nums">
            {summary.occupiedBeds}{' '}
            <span className="typo-helper font-medium text-slate-500">
              ({summary.occupancyPercent}%)
            </span>
          </p>
        </div>
        <div className="px-4 py-3.5">
          <p className="typo-card-title font-semibold text-slate-600">{tr('Vacant / Ready')}</p>
          <p className="mt-1 font-mono text-lg font-semibold text-emerald-700 tabular-nums">
            {tr(`${summary.vacantBeds} beds`)}
          </p>
        </div>
        <div className="px-4 py-3.5">
          <p className="typo-card-title font-semibold text-slate-600">{tr('Maintenance')}</p>
          <p className="mt-1 font-mono text-lg font-semibold text-amber-700 tabular-nums">
            {tr(`${summary.maintenanceBeds} beds`)}
          </p>
        </div>
        <div className="col-span-2 px-4 py-3.5 sm:col-span-1">
          <p className="typo-card-title font-semibold text-slate-600">{tr('Active / Vacant Rent')}</p>
          <p className="typo-body mt-1 font-mono font-semibold text-slate-900 tabular-nums">
            {formatInr(summary.occupiedMonthlyRent)}{' '}
            <span className="typo-helper font-normal text-slate-500">
              / +{formatInr(summary.vacantMonthlyPotential)} {tr('open')}
            </span>
          </p>
        </div>
      </section>

      {error && (
        <div className="typo-body flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          <span>{tr(error)}</span>
          <button
            type="button"
            onClick={handleRetry}
            className="typo-btn ml-4 rounded border border-red-300 bg-white px-3 py-1 text-red-800 hover:bg-red-100"
          >
            {tr('Retry')}
          </button>
        </div>
      )}

      {/* Search, Filters & View Mode Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={tr('Search room, floor, facility, resident...')}
              aria-label={tr('Search rooms and beds')}
              className="typo-input w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-slate-900 focus:border-teal-700 focus:outline-none"
            />
          </div>

          <select
            value={floorFilter}
            onChange={(e) => {
              setFloorFilter(e.target.value);
              setPage(1);
              setBedPage(1);
            }}
            aria-label={tr('Filter by floor')}
            className="typo-input rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 focus:border-teal-700 focus:outline-none"
          >
            <option value="all">{tr('All Floors')}</option>
            {floors.map((fl) => (
              <option key={fl} value={fl}>
                {tr(fl)}
              </option>
            ))}
          </select>

          <select
            value={roomTypeFilter}
            onChange={(e) => {
              setRoomTypeFilter(e.target.value);
              setPage(1);
              setBedPage(1);
            }}
            aria-label={tr('Filter by sharing type')}
            className="typo-input rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 focus:border-teal-700 focus:outline-none"
          >
            <option value="all">{tr('All Types')}</option>
            {ROOM_TYPES.map((typeOption) => (
              <option key={typeOption} value={typeOption}>
                {tr(typeOption)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label={tr('Filter by availability status')}
            className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1"
          >
            {(['all', 'available', 'occupied', 'maintenance'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => {
                  setStatusFilter(status);
                  setPage(1);
                  setBedPage(1);
                }}
                className={`typo-btn rounded px-3 py-1.5 capitalize transition-colors whitespace-nowrap ${
                  statusFilter === status
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {status === 'all' ? tr('All') : tr(status)}
              </button>
            ))}
          </div>

          <div
            role="group"
            aria-label={tr('Layout view switch')}
            className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1"
          >
            <button
              type="button"
              onClick={() => setViewLayout('rooms')}
              className={`typo-btn inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 transition-colors whitespace-nowrap ${
                viewLayout === 'rooms'
                  ? 'bg-teal-700 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Rooms')}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewLayout('beds')}
              className={`typo-btn inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 transition-colors whitespace-nowrap ${
                viewLayout === 'beds'
                  ? 'bg-teal-700 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Table2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('All Beds')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {viewLayout === 'rooms' ? (
        loading && rooms.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-56 animate-pulse rounded-lg border border-slate-200 bg-white p-5"
              >
                <div className="h-4 w-28 rounded bg-slate-200" />
                <div className="mt-2 h-3 w-48 rounded bg-slate-100" />
                <div className="mt-6 space-y-3">
                  <div className="h-8 rounded bg-slate-100" />
                  <div className="h-8 rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        ) : rooms.length === 0 ? (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="p-10 text-center">
              <p className="typo-card-title font-semibold text-slate-800">
                {hasActiveFilters
                  ? tr('No rooms match the selected filters.')
                  : tr('No rooms configured in this workspace yet.')}
              </p>
              <p className="typo-helper mt-1 text-slate-500">
                {hasActiveFilters
                  ? tr('Clear your search or floor/status filters to view all rooms.')
                  : tr('Create your first room and bed layout to start assigning guests.')}
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="typo-btn rounded-md border border-slate-300 bg-white px-3.5 py-2 text-slate-700 hover:bg-slate-50"
                  >
                    {tr('Reset Filters')}
                  </button>
                )}
                {canManageRooms && (
                  <button
                    type="button"
                    onClick={onAddRoom}
                    className="typo-btn inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-4 py-2 text-white hover:bg-teal-800"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tr('Add Room')}</span>
                  </button>
                )}
              </div>
            </div>
            <Pagination
              pagination={pagination}
              onPageChange={setPage}
              onPageSizeChange={(nextSize) => {
                setPageSize(nextSize);
                setPage(1);
              }}
              pageSizeOptions={[6, 12, 24]}
              itemLabel={tr('rooms')}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className={`grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 ${
                loading ? 'opacity-60 transition-opacity' : ''
              }`}
            >
              {rooms.map((room) => {
                const bedsForRoom = roomBeds
                  .filter((b) => b.roomId === room.id)
                  .sort((a, b) =>
                    a.bedLabel.localeCompare(b.bedLabel, undefined, { numeric: true })
                  );
                const hasOccupied = bedsForRoom.some((b) => b.status === 'occupied');
                const hasUpcoming = bedsForRoom.some((b) => Boolean(b.upcomingReservation));
                const occupiedCount = bedsForRoom.filter((b) => b.status === 'occupied').length;
                const fillPct =
                  bedsForRoom.length > 0
                    ? Math.round((occupiedCount / bedsForRoom.length) * 100)
                    : 0;
                const effectiveStatus =
                  room.status === 'maintenance'
                    ? 'maintenance'
                    : bedsForRoom.length > 0 && occupiedCount === bedsForRoom.length
                      ? 'occupied'
                      : 'available';

                return (
                  <article
                    key={room.id}
                    className="flex flex-col rounded-lg border border-slate-200 bg-white"
                  >
                    <div className="border-b border-slate-200 px-5 py-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5">
                            <h2 className="typo-card-title font-mono font-semibold text-slate-900">
                              {tr('Room')} {room.roomNumber}
                            </h2>
                            <RoomStatusIndicator status={effectiveStatus} />
                          </div>
                          <p className="typo-helper mt-0.5 text-slate-500">
                            {tr(room.floor)} · {tr(room.roomType)} · {tr('Cap')} {room.capacity} ·{' '}
                            <span className="font-mono font-medium text-slate-700 tabular-nums">
                              {formatInr(room.monthlyTariff)}/{tr('bed')}
                            </span>
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {canManageRooms && (
                            <button
                              type="button"
                              onClick={() => onEditRoom(room)}
                              aria-label={tr(`Edit Room ${room.roomNumber}`)}
                              title={tr('Edit room details, capacity & facilities')}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {canDeleteRoom && (
                            <button
                              type="button"
                              disabled={hasOccupied || hasUpcoming}
                              onClick={() => setRoomToDelete(room)}
                              title={
                                hasOccupied
                                  ? tr('Cannot delete room while beds are occupied')
                                  : hasUpcoming
                                    ? tr('Cannot delete room with upcoming bookings')
                                    : tr('Delete unoccupied room')
                              }
                              aria-label={tr(`Delete Room ${room.roomNumber}`)}
                              className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {room.facilities && room.facilities.length > 0 && (
                        <p className="typo-helper mt-1.5 text-slate-500 truncate">
                          {room.facilities.map((f) => tr(f)).join(' · ')}
                        </p>
                      )}

                      <div className="mt-2.5 flex items-center gap-2.5">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full transition-all ${
                              effectiveStatus === 'maintenance'
                                ? 'bg-amber-500'
                                : 'bg-teal-700'
                            }`}
                            style={{ width: `${fillPct}%` }}
                          />
                        </div>
                        <span className="typo-helper font-mono text-slate-500 tabular-nums shrink-0">
                          {tr(`${occupiedCount}/${bedsForRoom.length} filled`)}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 divide-y divide-slate-100 px-5 py-1.5">
                      {bedsForRoom.map((bed) => (
                        <div
                          key={bed.id}
                          className="typo-body flex items-center justify-between gap-2 py-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-medium text-slate-900">
                                {tr('Bed')} {bed.bedLabel}
                              </span>
                              <BedStatusIndicator status={bed.status} />
                            </div>

                            {bed.occupantGuestId && bed.occupantGuestName ? (
                              <div className="typo-helper mt-0.5 flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onOpenGuest(bed.occupantGuestId!)}
                                  className="truncate font-medium text-teal-800 hover:underline text-left"
                                >
                                  {bed.occupantGuestName}
                                </button>
                                {bed.occupantExpectedCheckoutDate && (
                                  <span
                                    className={`font-mono tabular-nums ${
                                      bed.occupantStayStatus === 'overdue'
                                        ? 'font-medium text-red-700'
                                        : 'text-slate-500'
                                    }`}
                                  >
                                    · {tr('Out')} {formatDateShort(bed.occupantExpectedCheckoutDate)}
                                    {bed.occupantStayStatus === 'overdue' ? ` (${tr('Overdue')})` : ''}
                                  </span>
                                )}
                              </div>
                            ) : bed.upcomingReservation ? (
                              <p className="typo-helper mt-0.5 truncate text-slate-600">
                                {tr('Reserved')}: {bed.upcomingReservation.guestName} ·{' '}
                                <span className="font-mono tabular-nums">
                                  {formatDateShort(bed.upcomingReservation.checkInAt)}
                                </span>
                              </p>
                            ) : (
                              <p className="typo-helper mt-0.5 truncate text-slate-500">
                                {bed.status === 'maintenance'
                                  ? tr('Blocked for maintenance')
                                  : tr('Available for assignment')}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {bed.status === 'vacant' && (
                              <button
                                type="button"
                                onClick={() => onAssignBed(bed)}
                                className="typo-btn inline-flex items-center gap-1 rounded border border-teal-700 bg-teal-700 px-2.5 py-1 text-white hover:bg-teal-800 whitespace-nowrap"
                              >
                                <UserPlus className="h-3 w-3" aria-hidden="true" />
                                <span>{tr('Assign')}</span>
                              </button>
                            )}

                            {canManageRooms && bed.status !== 'occupied' && (
                              <button
                                type="button"
                                disabled={busyBedId === bed.id}
                                onClick={() => handleToggleMaintenance(bed)}
                                title={
                                  bed.status === 'maintenance'
                                    ? tr('Mark bed vacant & ready')
                                    : tr('Place bed under maintenance')
                                }
                                className="typo-btn inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                              >
                                <Wrench className="h-3 w-3" aria-hidden="true" />
                                <span>
                                  {bed.status === 'maintenance' ? tr('Set Vacant') : tr('Maint.')}
                                </span>
                              </button>
                            )}

                            {canManageRooms &&
                              bed.status !== 'occupied' &&
                              bedsForRoom.length > 1 &&
                              !bed.upcomingReservation && (
                                <button
                                  type="button"
                                  onClick={() => setBedToDelete(bed)}
                                  aria-label={tr(`Remove Bed ${bed.bedLabel} from Room ${room.roomNumber}`)}
                                  title={tr('Remove extra bed')}
                                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-700"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {canManageRooms && bedsForRoom.length < room.capacity && (
                      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-5 py-2.5">
                        <span className="typo-helper font-mono text-slate-500 tabular-nums">
                          {tr(`${bedsForRoom.length} of ${room.capacity} beds configured`)}
                        </span>
                        <button
                          type="button"
                          disabled={addingBedRoomId === room.id}
                          onClick={() => handleAddBed(room)}
                          className="typo-btn inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                          <span>{addingBedRoomId === room.id ? tr('Adding...') : tr('Add Bed')}</span>
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white [&>nav]:border-t-0">
              <Pagination
                pagination={pagination}
                onPageChange={setPage}
                onPageSizeChange={(nextSize) => {
                  setPageSize(nextSize);
                  setPage(1);
                }}
                pageSizeOptions={[6, 12, 24]}
                itemLabel={tr('rooms')}
              />
            </div>
          </div>
        )
      ) : (
        /* All Beds Inventory Table View */
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {loading && tableBeds.length === 0 ? (
            <div className="typo-body p-8 text-center text-slate-500">{tr('Loading bed inventory...')}</div>
          ) : tableBeds.length === 0 ? (
            <div className="p-10 text-center">
              <p className="typo-card-title font-semibold text-slate-700">{tr('No beds match this filter.')}</p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="typo-btn mt-3 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-slate-700 hover:bg-slate-50"
                >
                  {tr('Reset Filters')}
                </button>
              )}
            </div>
          ) : (
            <div className={`overflow-x-auto ${loading ? 'opacity-60 transition-opacity' : ''}`}>
              <table className="typo-table-td w-full text-left">
                <thead className="typo-table-th border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-5 py-3">{tr('Bed')}</th>
                    <th className="px-4 py-3">{tr('Floor & Sharing')}</th>
                    <th className="px-4 py-3 text-right">{tr('Monthly Rent')}</th>
                    <th className="px-4 py-3">{tr('Status')}</th>
                    <th className="px-4 py-3">{tr('Resident / Reservation')}</th>
                    <th className="px-5 py-3 text-right">{tr('Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tableBeds.map((bed) => (
                    <tr key={bed.id} className="hover:bg-slate-50/80">
                      <td className="px-5 py-3 font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {tr('Room')} {bed.roomNumber} · {bed.bedLabel}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {tr(bed.floor)} · {tr(bed.roomType)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-slate-900 tabular-nums whitespace-nowrap">
                        {formatInr(bed.monthlyTariff)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <BedStatusIndicator status={bed.status} />
                      </td>
                      <td className="px-4 py-3">
                        {bed.occupantGuestId && bed.occupantGuestName ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenGuest(bed.occupantGuestId!)}
                              className="typo-body font-medium text-teal-800 hover:underline text-left"
                            >
                              {bed.occupantGuestName}
                            </button>
                            {bed.occupantExpectedCheckoutDate && (
                              <span
                                className={`typo-helper font-mono tabular-nums ${
                                  bed.occupantStayStatus === 'overdue'
                                    ? 'font-medium text-red-700'
                                    : 'text-slate-500'
                                }`}
                              >
                                · {tr('Out')} {formatDateShort(bed.occupantExpectedCheckoutDate)}
                              </span>
                            )}
                          </div>
                        ) : bed.upcomingReservation ? (
                          <span className="text-slate-600">
                            {tr('Reserved')}: {bed.upcomingReservation.guestName} (
                            {formatDateShort(bed.upcomingReservation.checkInAt)})
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {bed.status === 'vacant' && (
                            <button
                              type="button"
                              onClick={() => onAssignBed(bed)}
                              className="typo-btn inline-flex items-center gap-1 rounded border border-teal-700 bg-teal-700 px-2.5 py-1 text-white hover:bg-teal-800"
                            >
                              <UserPlus className="h-3 w-3" aria-hidden="true" />
                              <span>{tr('Assign')}</span>
                            </button>
                          )}
                          {canManageRooms && bed.status !== 'occupied' && (
                            <button
                              type="button"
                              disabled={busyBedId === bed.id}
                              onClick={() => handleToggleMaintenance(bed)}
                              className="typo-btn inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <Wrench className="h-3 w-3" aria-hidden="true" />
                              <span>{bed.status === 'maintenance' ? tr('Set Vacant') : tr('Maint.')}</span>
                            </button>
                          )}
                          {bed.occupantGuestId && (
                            <button
                              type="button"
                              onClick={() => onOpenGuest(bed.occupantGuestId!)}
                              className="typo-btn rounded border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50"
                            >
                              {tr('Resident')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            pagination={bedsPagination}
            onPageChange={setBedPage}
            onPageSizeChange={(nextSize) => {
              setBedPageSize(nextSize);
              setBedPage(1);
            }}
            pageSizeOptions={[10, 20, 40]}
            itemLabel={tr('beds')}
          />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(roomToDelete)}
        title={tr(`Delete Room ${roomToDelete?.roomNumber || ''}?`)}
        description={tr('This removes the room and its unoccupied bed records from your workspace. This action cannot be undone.')}
        confirmLabel={tr('Delete Room')}
        destructive
        busy={deleteBusy}
        onConfirm={handleConfirmDeleteRoom}
        onCancel={() => setRoomToDelete(null)}
      />

      <ConfirmDialog
        open={Boolean(bedToDelete)}
        title={tr(`Remove Bed ${bedToDelete?.bedLabel || ''} from Room ${bedToDelete?.roomNumber || ''}?`)}
        description={tr("This permanently removes this unoccupied bed slot from the room. You can add it again later up to the room's configured capacity.")}
        confirmLabel={tr('Remove Bed')}
        destructive
        busy={deleteBusy}
        onConfirm={handleConfirmDeleteBed}
        onCancel={() => setBedToDelete(null)}
      />
    </div>
  );
}
