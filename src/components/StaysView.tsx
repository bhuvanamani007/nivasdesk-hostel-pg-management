import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  Ban,
  LogIn,
  LogOut,
  Search,
  UserPlus,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatDateShort, formatInr } from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';
import type { EnrichedBed, EnrichedStay, PaginationMeta } from '../types/domain';
import { ConfirmDialog } from './ConfirmDialog';
import { Pagination } from './Pagination';
import { PaymentStatusIndicator, StayStatusIndicator } from './StatusLabel';
import { StayActionModal } from './StayActionModal';

interface StaysViewProps {
  refreshKey: number;
  allBeds: EnrichedBed[];
  onCheckIn: () => void;
  onCheckoutStay: (stay: EnrichedStay) => void;
  onOpenGuest: (guestId: string) => void;
  onDataChanged: () => void;
}

const DEFAULT_PAGINATION: PaginationMeta = {
  page: 1,
  pageSize: 8,
  totalItems: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

export function StaysView({
  refreshKey,
  allBeds,
  onCheckIn,
  onCheckoutStay,
  onOpenGuest,
  onDataChanged,
}: StaysViewProps) {
  const { tr } = useLanguage();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<
    'all' | 'upcoming' | 'active' | 'overdue' | 'due_soon' | 'checked_out' | 'cancelled'
  >('all');
  const [sortBy, setSortBy] = useState<'checkInAt' | 'expectedCheckoutDate' | 'balanceDue' | 'guestName'>(
    'checkInAt'
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  const [stays, setStays] = useState<EnrichedStay[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>(DEFAULT_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [editingStay, setEditingStay] = useState<EnrichedStay | null>(null);
  const [stayToCancel, setStayToCancel] = useState<EnrichedStay | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api
      .getStays(
        {
          page,
          pageSize,
          search: debouncedQuery || undefined,
          filter,
          sortBy,
          sortDir,
        },
        controller.signal
      )
      .then((res) => {
        setStays(res.stays);
        setPagination(res.pagination);
        if (res.pagination.page !== page) {
          setPage(res.pagination.page);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? tr(err.message) : tr('Failed to load stays.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [page, pageSize, debouncedQuery, filter, sortBy, sortDir, refreshKey, reloadTick, tr]);

  const handleRetry = useCallback(() => {
    setReloadTick((t) => t + 1);
  }, []);

  const handleCheckInNow = async (stay: EnrichedStay) => {
    setActionBusyId(stay.id);
    setError(null);
    try {
      await api.checkInStay(stay.id);
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Check-in failed.'));
    } finally {
      setActionBusyId(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!stayToCancel) return;
    setActionBusyId(stayToCancel.id);
    setError(null);
    try {
      await api.cancelStay(stayToCancel.id, 'Cancelled by hostel desk');
      setStayToCancel(null);
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Cancellation failed.'));
      setStayToCancel(null);
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="typo-page-title text-slate-900">{tr('Stays & Checkouts')}</h1>
          <p className="typo-body mt-0.5 text-slate-600">
            {tr('Manage upcoming reservations, active residents, overdue stays, extensions, bed transfers, and checkouts.')}
          </p>
        </div>
        <button
          type="button"
          onClick={onCheckIn}
          className="typo-btn inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-white hover:bg-teal-800 whitespace-nowrap"
        >
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          <span>{tr('Check In / Reserve')}</span>
        </button>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder={tr('Search guest, room, purpose...')}
              aria-label={tr('Search stays')}
              className="typo-input w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 focus:border-teal-700 focus:outline-none"
            />
          </div>

          <select
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [sb, sd] = e.target.value.split(':') as [typeof sortBy, 'asc' | 'desc'];
              setSortBy(sb);
              setSortDir(sd);
              setPage(1);
            }}
            aria-label={tr('Sort stays')}
            className="typo-input rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 focus:border-teal-700 focus:outline-none"
          >
            <option value="checkInAt:desc">{tr('Sort: Newest Check-in')}</option>
            <option value="expectedCheckoutDate:asc">{tr('Sort: Earliest Checkout')}</option>
            <option value="balanceDue:desc">{tr('Sort: Highest Balance Due')}</option>
            <option value="guestName:asc">{tr('Sort: Guest Name (A–Z)')}</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1 w-fit">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'upcoming', label: 'Upcoming' },
              { id: 'active', label: 'Active' },
              { id: 'overdue', label: 'Overdue' },
              { id: 'due_soon', label: 'Due Soon' },
              { id: 'checked_out', label: 'Checked Out' },
              { id: 'cancelled', label: 'Cancelled' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setFilter(item.id);
                setPage(1);
              }}
              className={`typo-btn rounded px-2.5 py-1.5 transition-colors whitespace-nowrap ${
                filter === item.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tr(item.label)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="typo-body flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-900">
          <span>{error}</span>
          <button
            type="button"
            onClick={handleRetry}
            className="typo-btn ml-4 rounded border border-red-300 bg-white px-3 py-1 text-red-800 hover:bg-red-100"
          >
            {tr('Retry')}
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading && stays.length === 0 ? (
          <div className="typo-body p-8 text-center text-slate-500">{tr('Loading stays...')}</div>
        ) : stays.length === 0 ? (
          <div className="p-10 text-center">
            <p className="typo-card-title font-semibold text-slate-700">{tr('No stays match the selected filter.')}</p>
          </div>
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60 transition-opacity' : ''}`}>
            <table className="typo-table-td w-full text-left">
              <thead className="typo-table-th border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-5 py-3">{tr('Guest')}</th>
                  <th className="px-4 py-3">{tr('Room / Bed')}</th>
                  <th className="px-4 py-3">{tr('Check-in')}</th>
                  <th className="px-4 py-3">{tr('Expected / Actual Checkout')}</th>
                  <th className="px-4 py-3 text-right">{tr('Duration')}</th>
                  <th className="px-4 py-3">{tr('Balance')}</th>
                  <th className="px-4 py-3">{tr('Status')}</th>
                  <th className="px-5 py-3 text-right">{tr('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stays.map((stay) => (
                  <tr key={stay.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => onOpenGuest(stay.guestId)}
                        className="typo-body font-medium text-slate-900 hover:text-teal-700 hover:underline text-left"
                      >
                        {stay.guestName}
                      </button>
                      <p className="typo-helper text-slate-500">{stay.purposeOfStay}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-800 whitespace-nowrap">
                      {tr(`Room ${stay.roomNumber}`)} · {stay.bedLabel}
                    </td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums whitespace-nowrap">
                      {formatDateShort(stay.checkInAt)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums whitespace-nowrap">
                      {stay.actualCheckoutAt
                        ? `${tr('Out')}: ${formatDateShort(stay.actualCheckoutAt)}`
                        : stay.expectedCheckoutDate
                          ? `${tr('Exp')}: ${formatDateShort(stay.expectedCheckoutDate)}`
                          : tr('Open-ended')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {stay.durationDays}d
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {stay.balanceDue > 0 ? (
                        <span className="font-mono font-medium text-red-700 tabular-nums">
                          {formatInr(stay.balanceDue)} {tr('due')}
                        </span>
                      ) : (
                        <PaymentStatusIndicator status="paid" />
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StayStatusIndicator status={stay.status} />
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {stay.status === 'upcoming' && (
                          <>
                            <button
                              type="button"
                              disabled={actionBusyId === stay.id}
                              onClick={() => handleCheckInNow(stay)}
                              className="typo-btn inline-flex items-center gap-1 rounded-md bg-teal-700 px-2.5 py-1.5 text-white hover:bg-teal-800 disabled:opacity-50"
                            >
                              <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Check In')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingStay(stay)}
                              className="typo-btn inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Edit')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setStayToCancel(stay)}
                              className="typo-btn inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-red-700 hover:bg-red-50"
                            >
                              <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Cancel')}</span>
                            </button>
                          </>
                        )}
                        {(stay.status === 'active' || stay.status === 'overdue') && (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditingStay(stay)}
                              className="typo-btn inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Extend / Transfer')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onCheckoutStay(stay)}
                              className="typo-btn inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50"
                            >
                              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Check Out')}</span>
                            </button>
                          </>
                        )}
                        {(stay.status === 'checked_out' || stay.status === 'cancelled') && (
                          <button
                            type="button"
                            onClick={() => onOpenGuest(stay.guestId)}
                            className="typo-btn text-teal-700 hover:underline"
                          >
                            {tr('View History')}
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
          pagination={pagination}
          onPageChange={setPage}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize);
            setPage(1);
          }}
          pageSizeOptions={[8, 15, 30]}
          itemLabel="stays"
        />
      </div>

      <StayActionModal
        stay={editingStay}
        allBeds={allBeds}
        onClose={() => setEditingStay(null)}
        onSuccess={onDataChanged}
      />

      <ConfirmDialog
        open={Boolean(stayToCancel)}
        title={tr(`Cancel Reservation for ${stayToCancel?.guestName || ''}?`)}
        description={tr('This marks the upcoming stay reservation as cancelled so the bed remains free for other guests.')}
        confirmLabel={tr('Cancel Reservation')}
        destructive
        busy={Boolean(stayToCancel && actionBusyId === stayToCancel.id)}
        onConfirm={handleConfirmCancel}
        onCancel={() => setStayToCancel(null)}
      />
    </div>
  );
}
