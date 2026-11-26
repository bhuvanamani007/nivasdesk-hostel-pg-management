import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BedDouble, Eye, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { formatInr } from '../../lib/format';
import { useLanguage } from '../../lib/LanguageContext';
import {
  ROOM_TYPES,
  ROOM_TYPE_DEFAULT_CAPACITY,
  ROOM_TYPE_DEFAULT_TARIFF,
  type PortalRoomItem,
  type RoomStatus,
  type RoomType,
} from '../../types/domain';
import { ConfirmDialog } from '../ConfirmDialog';

interface OwnerRoomsPageProps {
  onShowToast: (kind: 'ok' | 'error', text: string) => void;
}

export function OwnerRoomsPage({ onShowToast }: OwnerRoomsPageProps) {
  const { tr } = useLanguage();
  const [rooms, setRooms] = useState<PortalRoomItem[]>([]);
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [viewTarget, setViewTarget] = useState<PortalRoomItem | null>(null);
  const [editTarget, setEditTarget] = useState<PortalRoomItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PortalRoomItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Add room state
  const [tenantId, setTenantId] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [floor, setFloor] = useState('1st Floor');
  const [roomType, setRoomType] = useState<RoomType>('2-Sharing');
  const [bedCount, setBedCount] = useState('2');
  const [monthlyTariff, setMonthlyTariff] = useState('8500');
  const [addBusy, setAddBusy] = useState(false);

  // Edit room state
  const [editRoomNumber, setEditRoomNumber] = useState('');
  const [editFloor, setEditFloor] = useState('');
  const [editRoomType, setEditRoomType] = useState<RoomType>('2-Sharing');
  const [editTariff, setEditTariff] = useState('');
  const [editStatus, setEditStatus] = useState<RoomStatus>('available');
  const [editBusy, setEditBusy] = useState(false);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPortalRooms({
        tenantId: propertyFilter,
        search: search.trim() || undefined,
      });
      setRooms(res.rooms);
      setProperties(res.properties);
      if (!tenantId && res.properties[0]) {
        setTenantId(res.properties[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load rooms.');
    } finally {
      setLoading(false);
    }
  }, [propertyFilter, search, tenantId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadRooms();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [loadRooms]);

  const openAddModal = () => {
    setTenantId(propertyFilter !== 'all' ? propertyFilter : properties[0]?.id || '');
    setRoomNumber('');
    setFloor('1st Floor');
    setRoomType('2-Sharing');
    setBedCount('2');
    setMonthlyTariff('8500');
    setAddOpen(true);
  };

  const openEditModal = (r: PortalRoomItem) => {
    setEditTarget(r);
    setEditRoomNumber(r.roomNumber);
    setEditFloor(r.floor);
    setEditRoomType(r.roomType);
    setEditTariff(String(r.monthlyTariff));
    setEditStatus(r.status === 'maintenance' ? 'maintenance' : 'available');
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setAddBusy(true);
    try {
      await api.createPortalRoom({
        tenantId,
        roomNumber: roomNumber.trim(),
        floor: floor.trim(),
        roomType,
        bedCount: Number(bedCount) || 2,
        monthlyTariff: Number(monthlyTariff) || 8500,
      });
      setAddOpen(false);
      onShowToast('ok', tr(`Room ${roomNumber.trim()} added.`));
      await loadRooms();
    } catch (err) {
      onShowToast('error', tr(err instanceof Error ? err.message : 'Could not add room.'));
    } finally {
      setAddBusy(false);
    }
  };

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditBusy(true);
    try {
      await api.updatePortalRoom(editTarget.id, {
        roomNumber: editRoomNumber.trim(),
        floor: editFloor.trim(),
        roomType: editRoomType,
        monthlyTariff: Number(editTariff) || editTarget.monthlyTariff,
        status: editStatus,
      });
      setEditTarget(null);
      onShowToast('ok', tr('Room updated.'));
      await loadRooms();
    } catch (err) {
      onShowToast('error', tr(err instanceof Error ? err.message : 'Could not update room.'));
    } finally {
      setEditBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await api.deletePortalRoom(deleteTarget.id);
      setDeleteTarget(null);
      onShowToast('ok', tr(`Room ${deleteTarget.roomNumber} deleted.`));
      await loadRooms();
    } catch (err) {
      onShowToast('error', tr(err instanceof Error ? err.message : 'Could not delete room.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="typo-dashboard-title text-slate-900">{tr('Rooms')}</h1>
          <p className="mt-1 typo-body text-slate-600">
            {tr('Manage rooms, beds, and monthly rent across your properties.')}
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          disabled={properties.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3.5 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>{tr('Add Room')}</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr('Search by room number, floor, or property...')}
            className="w-full rounded-md border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-3 typo-input focus:border-teal-700 focus:bg-white focus:outline-none"
          />
        </div>
        {properties.length > 1 && (
          <select
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            aria-label={tr('Filter by property')}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 typo-input"
          >
            <option value="all">{tr(`All Properties (${properties.length})`)}</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 typo-body text-red-900">
          <span>{tr(error)}</span>
          <button
            type="button"
            onClick={loadRooms}
            className="rounded border border-red-300 bg-white px-3 py-1 typo-btn text-red-800 hover:bg-red-100"
          >
            {tr('Retry')}
          </button>
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {loading && rooms.length === 0 ? (
          <div className="p-8 text-center typo-body text-slate-500">{tr('Loading rooms...')}</div>
        ) : rooms.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <BedDouble className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
            <p className="typo-card-title text-slate-900">{tr('No rooms found')}</p>
            <p className="typo-helper text-slate-500">{tr('Add a room to get started.')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left typo-table-td">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 typo-table-th">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">{tr('Room')}</th>
                  <th className="px-4 py-2.5 font-semibold">{tr('Property')}</th>
                  <th className="px-4 py-2.5 font-semibold">{tr('Beds')}</th>
                  <th className="px-4 py-2.5 font-semibold text-right">{tr('Monthly Rent')}</th>
                  <th className="px-4 py-2.5 font-semibold">{tr('Status')}</th>
                  <th className="px-4 py-2.5 font-semibold text-right">{tr('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rooms.map((room) => (
                  <tr key={room.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{tr(`Room ${room.roomNumber}`)}</p>
                      <p className="typo-helper text-slate-500">
                        {tr(room.floor)} · {tr(room.roomType)}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{room.tenantName}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-700">
                      {tr(`${room.occupiedBeds}/${room.totalBeds} occupied`)}
                      <span className="ml-1.5 typo-helper text-emerald-700">
                        ({tr(`${room.vacantBeds} free`)})
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900">
                      {formatInr(room.monthlyTariff)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-semibold capitalize ${
                          room.status === 'maintenance'
                            ? 'text-amber-700'
                            : room.vacantBeds > 0
                              ? 'text-emerald-700'
                              : 'text-slate-600'
                        }`}
                      >
                        {room.status === 'maintenance'
                          ? tr('Maintenance')
                          : room.vacantBeds > 0
                            ? tr('Available')
                            : tr('Full')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewTarget(room)}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-800 hover:border-teal-700 hover:text-teal-800 whitespace-nowrap"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{tr('View Details')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(room)}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{tr('Edit')}</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === room.id}
                          onClick={() => setDeleteTarget(room)}
                          className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2.5 py-1 typo-btn text-red-700 hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{tr('Delete')}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* View Details Modal */}
      {viewTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-room-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="view-room-title" className="typo-section-heading text-slate-900">
                {tr(`Room ${viewTarget.roomNumber} Details`)}
              </h2>
              <button
                type="button"
                onClick={() => setViewTarget(null)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 typo-body">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="typo-helper text-slate-500">{tr('PG Property')}</p>
                  <p className="font-semibold text-slate-900">{viewTarget.tenantName}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Floor & Sharing')}</p>
                  <p className="text-slate-800">
                    {tr(viewTarget.floor)} · {tr(viewTarget.roomType)}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Monthly Rent / Bed')}</p>
                  <p className="font-mono font-semibold text-slate-900">
                    {formatInr(viewTarget.monthlyTariff)}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Bed Summary')}</p>
                  <p className="text-slate-800">
                    {tr(`${viewTarget.occupiedBeds} occupied`)} · {tr(`${viewTarget.vacantBeds} free`)}
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <p className="typo-label text-slate-700 mb-2">{tr(`Beds in Room ${viewTarget.roomNumber}`)}</p>
                <div className="space-y-1.5">
                  {viewTarget.beds.map((bed) => (
                    <div
                      key={bed.id}
                      className="flex items-center justify-between rounded border border-slate-200 px-3 py-2"
                    >
                      <span className="font-medium text-slate-900">{tr(`Bed ${bed.bedLabel}`)}</span>
                      <span className="typo-helper text-slate-600">
                        {bed.status === 'occupied'
                          ? bed.occupantGuestName || tr('Occupied')
                          : bed.status === 'maintenance'
                            ? tr('Maintenance')
                            : tr('Vacant')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={() => setViewTarget(null)}
                className="rounded-md bg-slate-900 px-4 py-1.5 typo-btn text-white hover:bg-slate-800"
              >
                {tr('Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Room Modal */}
      {addOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-room-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="add-room-title" className="typo-section-heading text-slate-900">
                {tr('Add Room')}
              </h2>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-3">
              <div>
                <label className="block typo-label text-slate-700">
                  {tr('PG Property')} <span className="text-red-600">*</span>
                </label>
                <select
                  required
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">
                    {tr('Room Number')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    placeholder={tr('e.g. 302')}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">{tr('Floor')}</label>
                  <input
                    type="text"
                    required
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                    placeholder={tr('e.g. 1st Floor')}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">{tr('Sharing Type')}</label>
                  <select
                    value={roomType}
                    onChange={(e) => {
                      const next = e.target.value as RoomType;
                      setRoomType(next);
                      setBedCount(String(ROOM_TYPE_DEFAULT_CAPACITY[next] || 2));
                      setMonthlyTariff(String(ROOM_TYPE_DEFAULT_TARIFF[next] || 8500));
                    }}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    {ROOM_TYPES.map((rt) => (
                      <option key={rt} value={rt}>
                        {tr(rt)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block typo-label text-slate-700">{tr('Number of Beds')}</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    required
                    value={bedCount}
                    onChange={(e) => setBedCount(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
              </div>
              <div>
                <label className="block typo-label text-slate-700">{tr('Monthly Rent per Bed (INR)')}</label>
                <input
                  type="number"
                  min={500}
                  required
                  value={monthlyTariff}
                  onChange={(e) => setMonthlyTariff(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  {tr('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={addBusy}
                  className="rounded-md bg-teal-700 px-4 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {addBusy ? tr('Adding...') : tr('Add Room')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Room Modal */}
      {editTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-room-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="edit-room-title" className="typo-section-heading text-slate-900">
                {tr(`Edit Room ${editTarget.roomNumber}`)}
              </h2>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleUpdate} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">{tr('Room Number')}</label>
                  <input
                    type="text"
                    required
                    value={editRoomNumber}
                    onChange={(e) => setEditRoomNumber(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">{tr('Floor')}</label>
                  <input
                    type="text"
                    required
                    value={editFloor}
                    onChange={(e) => setEditFloor(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">{tr('Sharing Type')}</label>
                  <select
                    value={editRoomType}
                    onChange={(e) => setEditRoomType(e.target.value as RoomType)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    {ROOM_TYPES.map((rt) => (
                      <option key={rt} value={rt}>
                        {tr(rt)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block typo-label text-slate-700">{tr('Monthly Rent (INR)')}</label>
                  <input
                    type="number"
                    min={500}
                    required
                    value={editTariff}
                    onChange={(e) => setEditTariff(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
              </div>
              <div>
                <label className="block typo-label text-slate-700">{tr('Room Status')}</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as RoomStatus)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                >
                  <option value="available">{tr('Available')}</option>
                  <option value="maintenance">{tr('Under Maintenance')}</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  {tr('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={editBusy}
                  className="rounded-md bg-teal-700 px-4 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {editBusy ? tr('Saving...') : tr('Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={tr(`Delete Room ${deleteTarget?.roomNumber || ''}?`)}
        description={tr('Rooms with occupied beds or upcoming bookings cannot be deleted.')}
        confirmLabel={tr('Delete Room')}
        destructive
        busy={Boolean(deleteTarget && busyId === deleteTarget.id)}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
