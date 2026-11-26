import { useCallback, useEffect, useState } from 'react';
import {
  Download,
  FileText,
  PhoneCall,
  Search,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { api, type GuestListItem } from '../lib/api';
import { downloadCsv } from '../lib/csv';
import { formatDateShort, formatInr, ID_TYPE_LABELS } from '../lib/format';
import { t } from '../lib/i18n';
import { useLanguage } from '../lib/LanguageContext';
import type {
  EnrichedDocument,
  Guest,
  GuestStatus,
  GuestsSummary,
  PaginationMeta,
  PreferredLanguage,
  UserRole,
  VerificationStatus,
} from '../types/domain';
import { DocumentsView } from './DocumentsView';
import { Pagination } from './Pagination';
import { GuestStatusIndicator, VerificationStatusIndicator } from './StatusLabel';

interface GuestsViewProps {
  refreshKey: number;
  userRole: UserRole;
  uiLanguage?: PreferredLanguage;
  guestOptions: Guest[];
  previewDoc: EnrichedDocument | null;
  onSetPreviewDoc: (doc: EnrichedDocument | null) => void;
  onAddGuest: () => void;
  onCheckIn: () => void;
  onCheckInGuest: (guestId: string) => void;
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

const DEFAULT_SUMMARY: GuestsSummary = {
  totalGuests: 0,
  activeResidents: 0,
  formerOrInactive: 0,
  pendingContactCalls: 0,
  guestsWithBalanceDue: 0,
  totalOutstandingDue: 0,
  totalDocumentsCount: 0,
};

export function GuestsView({
  refreshKey,
  userRole,
  uiLanguage = 'en',
  guestOptions,
  previewDoc,
  onSetPreviewDoc,
  onAddGuest,
  onCheckIn,
  onCheckInGuest,
  onOpenGuest,
  onDataChanged,
}: GuestsViewProps) {
  const { tr } = useLanguage();
  const [subView, setSubView] = useState<'directory' | 'documents'>('directory');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [guestStatusFilter, setGuestStatusFilter] = useState<'all' | GuestStatus>('all');
  const [verifyFilter, setVerifyFilter] = useState<'all' | VerificationStatus>('all');
  const [duesFilter, setDuesFilter] = useState<'all' | 'due' | 'consent_pending'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'balance_desc'>('newest');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  const [guests, setGuests] = useState<GuestListItem[]>([]);
  const [summary, setSummary] = useState<GuestsSummary>(DEFAULT_SUMMARY);
  const [pagination, setPagination] = useState<PaginationMeta>(DEFAULT_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [exportBusy, setExportBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (previewDoc) {
      setSubView('documents');
    }
  }, [previewDoc]);

  useEffect(() => {
    if (subView !== 'directory') return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api
      .getGuests(
        {
          page,
          pageSize,
          search: debouncedQuery || undefined,
          status: verifyFilter,
          guestStatus: guestStatusFilter,
          dues: duesFilter,
          sortBy,
        },
        controller.signal
      )
      .then((res) => {
        setGuests(res.guests);
        if (res.summary) setSummary(res.summary);
        setPagination(res.pagination);
        if (res.pagination.page !== page) {
          setPage(res.pagination.page);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load guests.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    subView,
    page,
    pageSize,
    debouncedQuery,
    verifyFilter,
    guestStatusFilter,
    duesFilter,
    sortBy,
    refreshKey,
    reloadTick,
  ]);

  const handleRetry = useCallback(() => {
    setReloadTick((tick) => tick + 1);
  }, []);

  const handleResetFilters = () => {
    setQuery('');
    setDebouncedQuery('');
    setGuestStatusFilter('all');
    setVerifyFilter('all');
    setDuesFilter('all');
    setSortBy('newest');
    setPage(1);
  };

  const handleExportCsv = async () => {
    setExportBusy(true);
    setError(null);
    try {
      const res = await api.getGuests({
        page: 1,
        pageSize: 500,
        search: debouncedQuery || undefined,
        status: verifyFilter,
        guestStatus: guestStatusFilter,
        dues: duesFilter,
        sortBy,
      });
      const headers = [
        tr('Full Name'),
        tr('Primary Phone'),
        tr('Alternate Phone'),
        tr('Emergency Contact'),
        tr('Emergency Phone'),
        tr('Guest Status'),
        tr('ID Type'),
        tr('Masked ID'),
        tr('Room / Bed'),
        tr('Total Stays'),
        tr('Balance Due (INR)'),
        tr('Deposits Held (INR)'),
        tr('Consent Recorded'),
        tr('Contact Call Status'),
      ];
      const rows = res.guests.map((g) => [
        g.fullName,
        g.primaryPhone,
        g.alternativePhone || '',
        g.emergencyContactName || '',
        g.emergencyContactPhone || '',
        tr(g.status || 'active'),
        tr(ID_TYPE_LABELS[g.idType]),
        g.idMasked || '',
        g.activeStay
          ? `${tr('Room')} ${g.activeStay.roomNumber} · ${g.activeStay.bedLabel}`
          : g.upcomingStay
            ? `${tr('Upcoming')}: ${tr('Room')} ${g.upcomingStay.roomNumber} · ${g.upcomingStay.bedLabel}`
            : tr('Not assigned'),
        g.totalStaysCount,
        g.balanceDue || 0,
        g.depositsHeld || 0,
        g.consentGiven ? tr('Yes') : tr('Pending'),
        tr(g.altPhoneVerified),
      ]);
      downloadCsv(`guests-directory-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export guests.');
    } finally {
      setExportBusy(false);
    }
  };

  const hasActiveFilters =
    guestStatusFilter !== 'all' ||
    verifyFilter !== 'all' ||
    duesFilter !== 'all' ||
    Boolean(debouncedQuery);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="typo-page-title text-slate-900">
            {t(uiLanguage, 'nav.guests')} &amp; {tr('ID Vault')}
          </h1>
          <p className="typo-body mt-0.5 text-slate-600">
            {tr('Manage resident profiles, emergency contacts, consent records, dues summary, and private ID attachments.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="group"
            aria-label={tr('Guests sub-view switch')}
            className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1"
          >
            <button
              type="button"
              onClick={() => setSubView('directory')}
              className={`typo-btn inline-flex items-center gap-1.5 rounded px-3 py-1.5 whitespace-nowrap ${
                subView === 'directory'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Guest Directory')}</span>
            </button>
            <button
              type="button"
              onClick={() => setSubView('documents')}
              className={`typo-btn inline-flex items-center gap-1.5 rounded px-3 py-1.5 whitespace-nowrap ${
                subView === 'documents'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('ID Documents')} ({summary.totalDocumentsCount})</span>
            </button>
          </div>

          {subView === 'directory' && (
            <button
              type="button"
              disabled={exportBusy}
              onClick={handleExportCsv}
              className="typo-btn inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>{exportBusy ? tr('Exporting...') : t(uiLanguage, 'common.exportCsv')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onAddGuest}
            className="typo-btn inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            <span>{t(uiLanguage, 'action.addGuest')}</span>
          </button>

          <button
            type="button"
            onClick={onCheckIn}
            className="typo-btn inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-700 px-4 py-2 text-white hover:bg-teal-800 whitespace-nowrap"
          >
            <UserCheck className="h-4 w-4" aria-hidden="true" />
            <span>{t(uiLanguage, 'action.checkIn')}</span>
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <section
        aria-label={tr('Guests summary')}
        className="grid grid-cols-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white sm:grid-cols-3 lg:grid-cols-5 sm:divide-y-0 sm:divide-x"
      >
        <div className="px-4 py-3.5">
          <p className="typo-card-title font-semibold text-slate-600">{tr('Total Guests')}</p>
          <p className="mt-1 font-mono text-lg font-semibold text-slate-900 tabular-nums">
            {summary.totalGuests}
          </p>
        </div>
        <div className="px-4 py-3.5">
          <p className="typo-card-title font-semibold text-slate-600">{tr('Active Residents')}</p>
          <p className="mt-1 font-mono text-lg font-semibold text-teal-800 tabular-nums">
            {summary.activeResidents}
          </p>
        </div>
        <div className="px-4 py-3.5">
          <p className="typo-card-title font-semibold text-slate-600">{tr('Former / Inactive')}</p>
          <p className="mt-1 font-mono text-lg font-semibold text-slate-700 tabular-nums">
            {summary.formerOrInactive}
          </p>
        </div>
        <div className="px-4 py-3.5">
          <p className="typo-card-title font-semibold text-slate-600">{tr('Pending Contact Calls')}</p>
          <p className="mt-1 font-mono text-lg font-semibold text-amber-700 tabular-nums">
            {summary.pendingContactCalls}
          </p>
        </div>
        <div className="col-span-2 px-4 py-3.5 sm:col-span-1">
          <p className="typo-card-title font-semibold text-slate-600">{tr('Outstanding Dues')}</p>
          <p className="typo-body mt-1 font-mono font-semibold text-slate-900 tabular-nums">
            {formatInr(summary.totalOutstandingDue)}{' '}
            <span className="typo-helper font-normal text-slate-500">
              ({tr(`${summary.guestsWithBalanceDue} guests`)})
            </span>
          </p>
        </div>
      </section>

      {subView === 'documents' ? (
        <DocumentsView
          refreshKey={refreshKey}
          userRole={userRole}
          guestOptions={guestOptions}
          previewDoc={previewDoc}
          onSetPreviewDoc={onSetPreviewDoc}
          onDataChanged={onDataChanged}
        />
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 flex-wrap items-center gap-2.5">
              <div className="relative min-w-[220px] flex-1 max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder={tr('Search name, phone, room, last 4 ID...')}
                  aria-label={tr('Search guests')}
                  className="typo-input w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <select
                value={verifyFilter}
                onChange={(e) => {
                  setVerifyFilter(e.target.value as 'all' | VerificationStatus);
                  setPage(1);
                }}
                aria-label={tr('Filter by contact follow-up status')}
                className="typo-input rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 focus:border-teal-700 focus:outline-none"
              >
                <option value="all">{tr('Call Log: All')}</option>
                <option value="verified">{tr('Contact Confirmed')}</option>
                <option value="pending">{tr('Pending Call')}</option>
                <option value="failed">{tr('Unreachable')}</option>
              </select>

              <select
                value={duesFilter}
                onChange={(e) => {
                  setDuesFilter(e.target.value as 'all' | 'due' | 'consent_pending');
                  setPage(1);
                }}
                aria-label={tr('Filter by dues or consent')}
                className="typo-input rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 focus:border-teal-700 focus:outline-none"
              >
                <option value="all">{tr('All Dues & Consent')}</option>
                <option value="due">{tr('Balance Due > ₹0')}</option>
                <option value="consent_pending">{tr('Consent Pending')}</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as 'newest' | 'name' | 'balance_desc');
                  setPage(1);
                }}
                aria-label={tr('Sort guests')}
                className="typo-input rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700 focus:border-teal-700 focus:outline-none"
              >
                <option value="newest">{tr('Sort: Newest Added')}</option>
                <option value="name">{tr('Sort: Name (A–Z)')}</option>
                <option value="balance_desc">{tr('Sort: Highest Balance Due')}</option>
              </select>
            </div>

            <div
              role="group"
              aria-label={tr('Filter by guest status')}
              className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1 w-fit"
            >
              {(['all', 'active', 'former', 'inactive'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setGuestStatusFilter(st);
                    setPage(1);
                  }}
                  className={`typo-btn rounded px-2.5 py-1.5 capitalize transition-colors whitespace-nowrap ${
                    guestStatusFilter === st
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {st === 'all' ? tr('All Statuses') : tr(st)}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="typo-body flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 text-red-900">
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

          {/* Table */}
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {loading && guests.length === 0 ? (
              <div className="divide-y divide-slate-100 p-4">
                {[1, 2, 3, 4].map((row) => (
                  <div key={row} className="flex items-center justify-between py-3 animate-pulse">
                    <div className="space-y-1.5">
                      <div className="h-3.5 w-36 rounded bg-slate-200" />
                      <div className="h-3 w-24 rounded bg-slate-100" />
                    </div>
                    <div className="h-3.5 w-28 rounded bg-slate-100" />
                    <div className="h-7 w-24 rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            ) : guests.length === 0 ? (
              <div className="p-10 text-center">
                <p className="typo-card-title font-semibold text-slate-800">
                  {hasActiveFilters
                    ? tr('No guests match your filter.')
                    : tr('No guests recorded in this workspace yet.')}
                </p>
                <p className="typo-helper mt-1 text-slate-500">
                  {hasActiveFilters
                    ? tr('Try clearing search terms or status filters.')
                    : tr('Add a guest profile or check in your first resident.')}
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
                  <button
                    type="button"
                    onClick={onAddGuest}
                    className="typo-btn inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-4 py-2 text-white hover:bg-teal-800"
                  >
                    <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{tr('Add Guest')}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className={`overflow-x-auto ${loading ? 'opacity-60 transition-opacity' : ''}`}>
                <table className="typo-table-td w-full text-left">
                  <thead className="typo-table-th border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-5 py-3">{tr('Guest & Emergency')}</th>
                      <th className="px-4 py-3">{tr('Phones')}</th>
                      <th className="px-4 py-3">{tr('ID & Consent')}</th>
                      <th className="px-4 py-3">{tr('Status')}</th>
                      <th className="px-4 py-3">{tr('Room / Stays')}</th>
                      <th className="px-4 py-3 text-right">{tr('Dues / Deposit')}</th>
                      <th className="px-4 py-3">{tr('Contact Call Log')}</th>
                      <th className="px-5 py-3 text-right">{tr('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {guests.map((g) => (
                      <tr key={g.id} className="hover:bg-slate-50/80">
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            onClick={() => onOpenGuest(g.id)}
                            className="typo-body font-medium text-slate-900 hover:text-teal-700 hover:underline text-left"
                          >
                            {g.fullName}
                          </button>
                          <p className="typo-helper text-slate-500">
                            {tr('Emergency')}: {g.emergencyContactName || '—'}
                            {g.emergencyContactRelation
                              ? ` (${g.emergencyContactRelation})`
                              : ''}
                            {g.emergencyContactPhone ? ` · ${g.emergencyContactPhone}` : ''}
                          </p>
                        </td>

                        <td className="px-4 py-3 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                          <p>{g.primaryPhone}</p>
                          <p className="typo-helper text-slate-500">
                            {g.alternativePhone ? `${tr('Alt')}: ${g.alternativePhone}` : tr('No alt phone')}
                          </p>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-medium text-slate-800">
                            {tr(ID_TYPE_LABELS[g.idType])}
                            {g.docCount > 0 ? ` · ${tr(`${g.docCount} file${g.docCount > 1 ? 's' : ''}`)}` : ''}
                          </p>
                          <p className="typo-helper font-mono text-slate-500">
                            {g.idMasked || tr('ID pending')} ·{' '}
                            <span
                              className={
                                g.consentGiven ? 'font-sans text-slate-600' : 'font-sans text-amber-700'
                              }
                            >
                              {g.consentGiven ? tr('Consent OK') : tr('Consent pending')}
                            </span>
                          </p>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <GuestStatusIndicator status={g.status || 'active'} />
                        </td>

                        <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                          {g.activeStay ? (
                            <p className="font-mono text-slate-900">
                              {tr('Room')} {g.activeStay.roomNumber} · {g.activeStay.bedLabel}
                            </p>
                          ) : g.upcomingStay ? (
                            <p className="font-mono text-teal-800">
                              {tr('Upcoming')}: {g.upcomingStay.roomNumber}·{g.upcomingStay.bedLabel} (
                              {formatDateShort(g.upcomingStay.checkInAt)})
                            </p>
                          ) : (
                            <p className="text-slate-500">{tr('Not assigned')}</p>
                          )}
                          <p className="typo-helper text-slate-500 tabular-nums">
                            {tr(`${g.totalStaysCount} ${g.totalStaysCount === 1 ? 'stay' : 'stays'}`)}
                          </p>
                        </td>

                        <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <p
                            className={
                              g.balanceDue > 0
                                ? 'font-semibold text-red-700'
                                : 'font-medium text-slate-700'
                            }
                          >
                            {g.balanceDue > 0 ? `${formatInr(g.balanceDue)} ${tr('due')}` : tr('Settled')}
                          </p>
                          <p className="typo-helper text-slate-500">
                            {g.depositsHeld > 0
                              ? `${tr('Dep')} ${formatInr(g.depositsHeld)}`
                              : tr('No deposit held')}
                          </p>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <VerificationStatusIndicator status={g.altPhoneVerified} />
                        </td>

                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {!g.activeStay && (
                              <button
                                type="button"
                                onClick={() => onCheckInGuest(g.id)}
                                className="typo-btn inline-flex items-center gap-1 rounded-md bg-teal-700 px-2.5 py-1.5 text-white hover:bg-teal-800"
                              >
                                <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>{tr('Check In')}</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onOpenGuest(g.id)}
                              className="typo-btn inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50"
                            >
                              <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Profile')}</span>
                            </button>
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
              itemLabel={tr('guests')}
            />
          </div>
        </>
      )}
    </div>
  );
}
