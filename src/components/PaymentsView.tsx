import { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  IndianRupee,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  formatDateShort,
  formatInr,
  PAYMENT_MODE_LABELS,
} from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';
import type {
  EnrichedDeposit,
  EnrichedPayment,
  PaginationMeta,
  UserRole,
} from '../types/domain';
import { ConfirmDialog } from './ConfirmDialog';
import { Pagination } from './Pagination';
import { DepositStatusIndicator, PaymentStatusIndicator } from './StatusLabel';

interface PaymentsViewProps {
  refreshKey: number;
  userRole: UserRole;
  smsBusyId: string | null;
  onRecordPayment: (payment?: EnrichedPayment) => void;
  onViewReceipt: (payment: EnrichedPayment) => void;
  onSendSmsReminder: (payment: EnrichedPayment) => void;
  onOpenDepositModal: (action: 'collect' | 'adjust' | 'refund', deposit?: EnrichedDeposit) => void;
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

export function PaymentsView({
  refreshKey,
  userRole,
  smsBusyId,
  onRecordPayment,
  onViewReceipt,
  onSendSmsReminder,
  onOpenDepositModal,
  onOpenGuest,
  onDataChanged,
}: PaymentsViewProps) {
  const { tr } = useLanguage();
  const canRefund = userRole === 'owner' || userRole === 'warden' || userRole === 'overall_admin';

  const [ledgerTab, setLedgerTab] = useState<'rent' | 'deposits'>('rent');

  // Rent & Charges state
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<
    'all' | 'unpaid' | 'partially_paid' | 'overdue' | 'paid' | 'refunded'
  >('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [payments, setPayments] = useState<EnrichedPayment[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>(DEFAULT_PAGINATION);

  // Deposits state
  const [depQuery, setDepQuery] = useState('');
  const [debouncedDepQuery, setDebouncedDepQuery] = useState('');
  const [depFilter, setDepFilter] = useState<
    'all' | 'held' | 'partially_adjusted' | 'adjusted' | 'refunded'
  >('all');
  const [depPage, setDepPage] = useState(1);
  const [depPageSize, setDepPageSize] = useState(8);
  const [deposits, setDeposits] = useState<EnrichedDeposit[]>([]);
  const [depPagination, setDepPagination] = useState<PaginationMeta>(DEFAULT_PAGINATION);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [refundTarget, setRefundTarget] = useState<EnrichedPayment | null>(null);
  const [refundBusy, setRefundBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedDepQuery(depQuery.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [depQuery]);

  useEffect(() => {
    if (ledgerTab !== 'rent') return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api
      .getPayments(
        {
          page,
          pageSize,
          search: debouncedQuery || undefined,
          filter,
        },
        controller.signal
      )
      .then((res) => {
        setPayments(res.payments);
        setPagination(res.pagination);
        if (res.pagination.page !== page) setPage(res.pagination.page);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? tr(err.message) : tr('Failed to load payments.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [ledgerTab, page, pageSize, debouncedQuery, filter, refreshKey, reloadTick, tr]);

  useEffect(() => {
    if (ledgerTab !== 'deposits') return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api
      .getDeposits(
        {
          page: depPage,
          pageSize: depPageSize,
          search: debouncedDepQuery || undefined,
          filter: depFilter,
        },
        controller.signal
      )
      .then((res) => {
        setDeposits(res.deposits);
        setDepPagination(res.pagination);
        if (res.pagination.page !== depPage) setDepPage(res.pagination.page);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? tr(err.message) : tr('Failed to load deposits.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [ledgerTab, depPage, depPageSize, debouncedDepQuery, depFilter, refreshKey, reloadTick, tr]);

  const handleRetry = useCallback(() => {
    setReloadTick((t) => t + 1);
  }, []);

  const handleConfirmRefund = async () => {
    if (!refundTarget) return;
    setRefundBusy(true);
    setError(null);
    try {
      await api.refundPayment(refundTarget.id, 'Refund issued at hostel desk');
      setRefundTarget(null);
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Failed to issue refund.'));
      setRefundTarget(null);
    } finally {
      setRefundBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="typo-page-title text-slate-900">
            {tr('Payments & Security Deposits')}
          </h1>
          <p className="mt-0.5 typo-body text-slate-600">
            {tr('Track rent & charges (including partial payments & refunds) separately from refundable security deposits.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setLedgerTab('rent')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 typo-btn whitespace-nowrap ${
                ledgerTab === 'rent'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <IndianRupee className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Rent & Charges')}</span>
            </button>
            <button
              type="button"
              onClick={() => setLedgerTab('deposits')}
              className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 typo-btn whitespace-nowrap ${
                ledgerTab === 'deposits'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Security Deposits')}</span>
            </button>
          </div>

          {ledgerTab === 'rent' ? (
            <button
              type="button"
              onClick={() => onRecordPayment()}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-700 px-4 py-2 typo-btn text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <IndianRupee className="h-4 w-4" aria-hidden="true" />
              <span>{tr('Record Payment')}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenDepositModal('collect')}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-700 px-4 py-2 typo-btn text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{tr('Collect Deposit')}</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 typo-body text-red-900">
          <span>{error}</span>
          <button
            type="button"
            onClick={handleRetry}
            className="ml-4 rounded border border-red-300 bg-white px-3 py-1 typo-btn text-red-800 hover:bg-red-100"
          >
            {tr('Retry')}
          </button>
        </div>
      )}

      {ledgerTab === 'rent' ? (
        <>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="relative w-full xl:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={tr('Search guest, room, receipt, UTR...')}
                aria-label={tr('Search payments')}
                className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 typo-input focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1 w-fit">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'unpaid', label: 'Unpaid' },
                  { id: 'partially_paid', label: 'Partial' },
                  { id: 'overdue', label: 'Overdue' },
                  { id: 'paid', label: 'Paid' },
                  { id: 'refunded', label: 'Refunded' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setFilter(item.id);
                    setPage(1);
                  }}
                  className={`rounded px-2.5 py-1.5 typo-btn transition-colors whitespace-nowrap ${
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

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {loading && payments.length === 0 ? (
              <div className="p-8 text-center typo-body text-slate-500">{tr('Loading payments...')}</div>
            ) : payments.length === 0 ? (
              <div className="p-10 text-center">
                <p className="typo-body font-medium text-slate-700">{tr('No payment records found.')}</p>
              </div>
            ) : (
              <div className={`overflow-x-auto ${loading ? 'opacity-60 transition-opacity' : ''}`}>
                <table className="w-full text-left typo-table-td">
                  <thead className="border-b border-slate-200 bg-slate-50 typo-table-th text-slate-600">
                    <tr>
                      <th className="px-5 py-3">{tr('Guest & Room')}</th>
                      <th className="px-4 py-3">{tr('Description / Reference')}</th>
                      <th className="px-4 py-3">{tr('Due / Paid Date')}</th>
                      <th className="px-4 py-3 text-right">{tr('Billed / Paid')}</th>
                      <th className="px-4 py-3">{tr('Status')}</th>
                      <th className="px-5 py-3 text-right">{tr('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {payments.map((pay) => (
                      <tr key={pay.id} className="hover:bg-slate-50/80">
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            onClick={() => onOpenGuest(pay.guestId)}
                            className="typo-btn font-medium text-slate-900 hover:text-teal-700 hover:underline text-left"
                          >
                            {pay.guestName}
                          </button>
                          <p className="font-mono typo-helper text-slate-500">
                            {tr(`Room ${pay.roomNumber}`)} · {pay.bedLabel}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="typo-table-td font-medium text-slate-800">{pay.description}</p>
                          <p className="typo-helper text-slate-500">
                            {pay.paymentMode ? `${tr(PAYMENT_MODE_LABELS[pay.paymentMode])} · ` : ''}
                            {pay.referenceNote || '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-600 tabular-nums whitespace-nowrap">
                          <p className="typo-table-td">{tr('Due')}: {formatDateShort(pay.dueDate)}</p>
                          {pay.paymentDate && (
                            <p className="typo-helper text-emerald-700">{tr('Paid')}: {formatDateShort(pay.paymentDate)}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <p className="typo-table-td font-semibold text-slate-900">{formatInr(pay.amount)}</p>
                          {pay.paidAmount > 0 && pay.paidAmount < pay.amount && (
                            <p className="typo-helper text-amber-700">
                              {tr('Paid')} {formatInr(pay.paidAmount)} · {tr('Bal')} {formatInr(pay.outstandingAmount)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <PaymentStatusIndicator status={pay.status} isOverdue={pay.isOverdue} />
                        </td>
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {pay.paidAmount > 0 && (
                              <button
                                type="button"
                                onClick={() => onViewReceipt(pay)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50"
                              >
                                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>{tr('Receipt')}</span>
                              </button>
                            )}
                            {pay.status !== 'paid' && pay.status !== 'refunded' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onSendSmsReminder(pay)}
                                  disabled={smsBusyId === pay.id}
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>{smsBusyId === pay.id ? tr('Sending...') : tr('Remind')}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onRecordPayment(pay)}
                                  className="rounded-md bg-teal-700 px-2.5 py-1.5 typo-btn text-white hover:bg-teal-800"
                                >
                                  {tr('Collect')}
                                </button>
                              </>
                            )}
                            {canRefund && pay.status === 'paid' && (
                              <button
                                type="button"
                                onClick={() => setRefundTarget(pay)}
                                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1.5 typo-btn text-red-700 hover:bg-red-50"
                              >
                                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                                <span>{tr('Refund')}</span>
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
              itemLabel="payments"
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={depQuery}
                onChange={(e) => {
                  setDepQuery(e.target.value);
                  setDepPage(1);
                }}
                placeholder={tr('Search guest, room, note...')}
                aria-label={tr('Search deposits')}
                className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 typo-input focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1 w-fit">
              {(
                [
                  { id: 'all', label: 'All Deposits' },
                  { id: 'held', label: 'Held' },
                  { id: 'partially_adjusted', label: 'Part. Adjusted' },
                  { id: 'adjusted', label: 'Adjusted' },
                  { id: 'refunded', label: 'Refunded' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setDepFilter(item.id);
                    setDepPage(1);
                  }}
                  className={`rounded px-2.5 py-1.5 typo-btn transition-colors whitespace-nowrap ${
                    depFilter === item.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {tr(item.label)}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            {loading && deposits.length === 0 ? (
              <div className="p-8 text-center typo-body text-slate-500">{tr('Loading deposits...')}</div>
            ) : deposits.length === 0 ? (
              <div className="p-10 text-center">
                <p className="typo-body font-medium text-slate-700">{tr('No security deposits found.')}</p>
              </div>
            ) : (
              <div className={`overflow-x-auto ${loading ? 'opacity-60 transition-opacity' : ''}`}>
                <table className="w-full text-left typo-table-td">
                  <thead className="border-b border-slate-200 bg-slate-50 typo-table-th text-slate-600">
                    <tr>
                      <th className="px-5 py-3">{tr('Guest & Room')}</th>
                      <th className="px-4 py-3">{tr('Collected')}</th>
                      <th className="px-4 py-3 text-right">{tr('Deposit Amt')}</th>
                      <th className="px-4 py-3 text-right">{tr('Adjusted / Refunded')}</th>
                      <th className="px-4 py-3 text-right">{tr('Held Balance')}</th>
                      <th className="px-4 py-3">{tr('Status')}</th>
                      <th className="px-5 py-3 text-right">{tr('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deposits.map((dep) => (
                      <tr key={dep.id} className="hover:bg-slate-50/80">
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            onClick={() => onOpenGuest(dep.guestId)}
                            className="typo-btn font-medium text-slate-900 hover:text-teal-700 hover:underline text-left"
                          >
                            {dep.guestName}
                          </button>
                          <p className="font-mono typo-helper text-slate-500">
                            {tr(`Room ${dep.roomNumber}`)} · {dep.bedLabel}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <p className="typo-table-td tabular-nums">{formatDateShort(dep.collectedDate)}</p>
                          <p className="typo-helper text-slate-500">
                            {tr(PAYMENT_MODE_LABELS[dep.paymentMode])} · {dep.notes || dep.referenceNote || '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono typo-table-td font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatInr(dep.amount)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono typo-helper text-slate-600 tabular-nums whitespace-nowrap">
                          {tr('Adj')} {formatInr(dep.adjustedAmount)} · {tr('Ref')} {formatInr(dep.refundedAmount)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono typo-table-td font-semibold text-teal-800 tabular-nums whitespace-nowrap">
                          {formatInr(dep.remainingHeld)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <DepositStatusIndicator status={dep.status} />
                        </td>
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          {dep.remainingHeld > 0 ? (
                            <div className="inline-flex items-center gap-1.5">
                              {canRefund && (
                                <button
                                  type="button"
                                  onClick={() => onOpenDepositModal('adjust', dep)}
                                  className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50"
                                >
                                  {tr('Adjust')}
                                </button>
                              )}
                              {canRefund && (
                                <button
                                  type="button"
                                  onClick={() => onOpenDepositModal('refund', dep)}
                                  className="rounded-md bg-teal-700 px-2.5 py-1.5 typo-btn text-white hover:bg-teal-800"
                                >
                                  {tr('Refund')}
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="typo-helper text-slate-400">{tr('Settled')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Pagination
              pagination={depPagination}
              onPageChange={setDepPage}
              onPageSizeChange={(nextSize) => {
                setDepPageSize(nextSize);
                setDepPage(1);
              }}
              pageSizeOptions={[8, 15, 30]}
              itemLabel="deposits"
            />
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(refundTarget)}
        title={tr(`Mark Payment as Refunded for ${refundTarget?.guestName || ''}?`)}
        description={tr(`This records a full refund of ${
          refundTarget ? formatInr(refundTarget.paidAmount) : ''
        } on receipt ${refundTarget?.receiptNumber || ''}.`)}
        confirmLabel={tr('Confirm Refund')}
        destructive
        busy={refundBusy}
        onConfirm={handleConfirmRefund}
        onCancel={() => setRefundTarget(null)}
      />
    </div>
  );
}
