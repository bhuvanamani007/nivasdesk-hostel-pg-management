import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Ban,
  MessageSquarePlus,
  Search,
  Send,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import {
  formatDateTime,
  formatInr,
  REMINDER_CHANNEL_LABELS,
  REMINDER_TYPE_LABELS,
} from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';
import type {
  EnrichedPayment,
  EnrichedStay,
  PaginationMeta,
  ReminderChannel,
  ReminderLog,
  ReminderStatus,
  ReminderType,
  Tenant,
} from '../types/domain';
import { Pagination } from './Pagination';
import { ReminderStatusIndicator } from './StatusLabel';

interface RemindersViewProps {
  refreshKey: number;
  tenant: Tenant;
  activeStays: EnrichedStay[];
  unpaidPayments: EnrichedPayment[];
  onDataChanged: () => void;
}

const DEFAULT_PAGINATION: PaginationMeta = {
  page: 1,
  pageSize: 10,
  totalItems: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPrevPage: false,
};

export function RemindersView({
  refreshKey,
  tenant,
  activeStays,
  unpaidPayments,
  onDataChanged,
}: RemindersViewProps) {
  const { tr } = useLanguage();
  const [statusFilter, setStatusFilter] = useState<'all' | ReminderStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | ReminderType>('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [reminders, setReminders] = useState<ReminderLog[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>(DEFAULT_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Schedule Modal
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [remType, setRemType] = useState<ReminderType>('unpaid_charge');
  const [channel, setChannel] = useState<ReminderChannel>('whatsapp');
  const [selectedPaymentId, setSelectedPaymentId] = useState('');
  const [selectedStayId, setSelectedStayId] = useState('');
  const [sendNow, setSendNow] = useState(true);
  const [scheduledFor, setScheduledFor] = useState(() => new Date().toISOString().slice(0, 16));
  const [customMessage, setCustomMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      .getReminders(
        {
          page,
          pageSize,
          status: statusFilter,
          type: typeFilter,
          search: debouncedQuery || undefined,
        },
        controller.signal
      )
      .then((res) => {
        setReminders(res.reminders);
        setPagination(res.pagination);
        if (res.pagination.page !== page) setPage(res.pagination.page);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? tr(err.message) : tr('Failed to load reminders.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [page, pageSize, statusFilter, typeFilter, debouncedQuery, refreshKey, reloadTick, tr]);

  const handleRetry = useCallback(() => {
    setReloadTick((t) => t + 1);
  }, []);

  const openScheduleModal = () => {
    setError(null);
    if (unpaidPayments.length > 0) {
      setRemType('unpaid_charge');
      setSelectedPaymentId(unpaidPayments[0].id);
      setSelectedStayId(unpaidPayments[0].stayId);
    } else if (activeStays.length > 0) {
      setRemType('checkout_upcoming');
      setSelectedStayId(activeStays[0].id);
      setSelectedPaymentId('');
    }
    setCustomMessage('');
    setScheduleOpen(true);
  };

  const handleScheduleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const chosenPay = unpaidPayments.find((p) => p.id === selectedPaymentId);
    const targetStayId =
      remType === 'unpaid_charge' ? chosenPay?.stayId || selectedStayId : selectedStayId;

    if (!targetStayId) {
      setError(tr('Please select a target stay or unpaid charge.'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.scheduleReminder({
        type: remType,
        channel,
        stayId: targetStayId,
        paymentId: remType === 'unpaid_charge' ? selectedPaymentId : undefined,
        sendNow,
        scheduledFor: sendNow ? undefined : new Date(scheduledFor).toISOString(),
        message: customMessage.trim() || undefined,
      });
      setFeedback(res.message ? tr(res.message) : tr(`Reminder ${res.reminder.status}.`));
      setScheduleOpen(false);
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Failed to create reminder.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSendNow = async (rem: ReminderLog) => {
    setBusyId(rem.id);
    setError(null);
    setFeedback(null);
    try {
      const res = await api.sendReminderNow(rem.id);
      setFeedback(tr(res.message));
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Could not send reminder.'));
      onDataChanged();
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (rem: ReminderLog) => {
    setBusyId(rem.id);
    setError(null);
    try {
      await api.cancelReminder(rem.id);
      setFeedback(tr('Scheduled reminder cancelled.'));
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Could not cancel reminder.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="typo-page-title text-slate-900">
            {tr('Payment & Checkout Reminders')}
          </h1>
          <p className="mt-0.5 typo-body text-slate-600">
            {tr('Schedule or send unpaid rent, upcoming checkout, and overdue stay reminders with duplicate-send cooldown.')}
          </p>
        </div>

        <button
          type="button"
          onClick={openScheduleModal}
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-700 px-4 py-2 typo-btn text-white hover:bg-teal-800 whitespace-nowrap"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          <span>{tr('Schedule / Send Reminder')}</span>
        </button>
      </div>

      {/* Honest Provider Status Bar */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 typo-helper text-slate-700 flex flex-wrap items-center justify-between gap-2">
        <span>
          {tr('Channel Modes')} — {tr('SMS')}: <span className="font-mono font-semibold">{tr(tenant.settings.smsProvider)}</span> ·{' '}
          {tr('WhatsApp')}: <span className="font-mono font-semibold">{tr(tenant.settings.whatsappProvider)}</span> ·{' '}
          {tr('Telephony')}: <span className="font-mono font-semibold">{tr(tenant.settings.telephonyProvider)}</span> ·{' '}
          {tr('Cooldown')}: <span className="font-mono font-semibold">{tenant.settings.smsCooldownHours}h</span>
        </span>
        <span className="text-slate-500">
          {tr('Mock/Disabled channels log simulated or disabled statuses honestly without claiming real carrier delivery.')}
        </span>
      </div>

      {feedback && (
        <div className="rounded-md border border-teal-200 bg-teal-50 px-4 py-3 typo-body text-teal-900">
          {feedback}
        </div>
      )}

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
              placeholder={tr('Search guest, room, message...')}
              aria-label={tr('Search reminders')}
              className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 typo-input focus:border-teal-700 focus:outline-none"
            />
          </div>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as 'all' | ReminderType);
              setPage(1);
            }}
            aria-label={tr('Filter by reminder type')}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 typo-input text-slate-700"
          >
            <option value="all">{tr('All Types')}</option>
            <option value="unpaid_charge">{tr('Unpaid Charge')}</option>
            <option value="checkout_upcoming">{tr('Upcoming Checkout')}</option>
            <option value="checkout_overdue">{tr('Overdue Stay')}</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-white p-1 w-fit">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'scheduled', label: 'Scheduled' },
              { id: 'mocked', label: 'Mocked' },
              { id: 'sent', label: 'Sent' },
              { id: 'failed', label: 'Failed' },
              { id: 'blocked_duplicate', label: 'Blocked' },
              { id: 'cancelled', label: 'Cancelled' },
            ] as const
          ).map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => {
                setStatusFilter(st.id);
                setPage(1);
              }}
              className={`rounded px-2.5 py-1.5 typo-btn transition-colors whitespace-nowrap ${
                statusFilter === st.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tr(st.label)}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading && reminders.length === 0 ? (
          <div className="p-8 text-center typo-body text-slate-500">{tr('Loading reminders...')}</div>
        ) : reminders.length === 0 ? (
          <div className="p-10 text-center">
            <p className="typo-body font-medium text-slate-700">{tr('No reminder records match this filter.')}</p>
          </div>
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60 transition-opacity' : ''}`}>
            <table className="w-full text-left typo-table-td">
              <thead className="border-b border-slate-200 bg-slate-50 typo-table-th text-slate-600">
                <tr>
                  <th className="px-5 py-3">{tr('Resident & Recipient')}</th>
                  <th className="px-4 py-3">{tr('Type / Channel')}</th>
                  <th className="px-4 py-3">{tr('Message Preview')}</th>
                  <th className="px-4 py-3">{tr('Scheduled / Attempted')}</th>
                  <th className="px-4 py-3">{tr('Status')}</th>
                  <th className="px-5 py-3 text-right">{tr('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reminders.map((rem) => (
                  <tr key={rem.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3">
                      <p className="typo-table-td font-medium text-slate-900">{rem.guestName || tr('Resident')}</p>
                      <p className="font-mono typo-helper text-slate-500">
                        {rem.roomLabel ? `${rem.roomLabel} · ` : ''}
                        {rem.recipientMasked}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="typo-table-td font-medium text-slate-800">{tr(REMINDER_TYPE_LABELS[rem.type])}</p>
                      <p className="typo-helper text-slate-500">
                        {tr(REMINDER_CHANNEL_LABELS[rem.channel])} ({tr(rem.provider)})
                      </p>
                    </td>
                    <td className="px-4 py-3 typo-table-td text-slate-600 max-w-xs">
                      <p className="line-clamp-2">{rem.messagePreview}</p>
                      {rem.errorReason && (
                        <p className="mt-0.5 typo-helper text-red-700">{rem.errorReason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 typo-table-td text-slate-600 tabular-nums whitespace-nowrap">
                      {rem.attemptedAt
                        ? formatDateTime(rem.attemptedAt)
                        : rem.scheduledFor
                          ? `${tr('Sched')}: ${formatDateTime(rem.scheduledFor)}`
                          : formatDateTime(rem.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ReminderStatusIndicator status={rem.status} />
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {(rem.status === 'scheduled' || rem.status === 'failed') && (
                          <button
                            type="button"
                            disabled={busyId === rem.id}
                            onClick={() => handleSendNow(rem)}
                            className="inline-flex items-center gap-1 rounded-md bg-teal-700 px-2.5 py-1.5 typo-btn text-white hover:bg-teal-800 disabled:opacity-50"
                          >
                            <Send className="h-3 w-3" aria-hidden="true" />
                            <span>{rem.status === 'failed' ? tr('Retry') : tr('Send Now')}</span>
                          </button>
                        )}
                        {rem.status === 'scheduled' && (
                          <button
                            type="button"
                            disabled={busyId === rem.id}
                            onClick={() => handleCancel(rem)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 typo-btn text-slate-700 hover:bg-slate-50"
                          >
                            <Ban className="h-3 w-3" aria-hidden="true" />
                            <span>{tr('Cancel')}</span>
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
          pageSizeOptions={[10, 20, 40]}
          itemLabel="reminders"
        />
      </div>

      {/* Schedule / Send Reminder Modal */}
      {scheduleOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sched-rem-title"
        >
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 id="sched-rem-title" className="typo-section-heading text-slate-900">
                {tr('Schedule or Send Reminder')}
              </h2>
              <button
                type="button"
                onClick={() => setScheduleOpen(false)}
                aria-label={tr('Close modal')}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="rem-type" className="block typo-label text-slate-700">
                    {tr('Reminder Type')}
                  </label>
                  <select
                    id="rem-type"
                    value={remType}
                    onChange={(e) => setRemType(e.target.value as ReminderType)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    <option value="unpaid_charge">{tr('Unpaid Rent / Charge')}</option>
                    <option value="checkout_upcoming">{tr('Upcoming Checkout')}</option>
                    <option value="checkout_overdue">{tr('Overdue Stay Follow-up')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="rem-channel" className="block typo-label text-slate-700">
                    {tr('Channel')}
                  </label>
                  <select
                    id="rem-channel"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as ReminderChannel)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    <option value="whatsapp">{tr('WhatsApp')}</option>
                    <option value="sms">{tr('SMS')}</option>
                    <option value="telephony">{tr('Voice Call Log')}</option>
                  </select>
                </div>
              </div>

              {remType === 'unpaid_charge' ? (
                <div>
                  <label htmlFor="rem-pay" className="block typo-label text-slate-700">
                    {tr('Unpaid / Partial Charge')}
                  </label>
                  <select
                    id="rem-pay"
                    value={selectedPaymentId}
                    onChange={(e) => {
                      setSelectedPaymentId(e.target.value);
                      const found = unpaidPayments.find((p) => p.id === e.target.value);
                      if (found) setSelectedStayId(found.stayId);
                    }}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    {unpaidPayments.length === 0 ? (
                      <option value="">{tr('No open unpaid charges')}</option>
                    ) : (
                      unpaidPayments.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.guestName} · {tr(`Room ${p.roomNumber}`)}-{p.bedLabel} · {tr('Bal')}{' '}
                          {formatInr(p.outstandingAmount)}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              ) : (
                <div>
                  <label htmlFor="rem-stay" className="block typo-label text-slate-700">
                    {tr('Resident Stay')}
                  </label>
                  <select
                    id="rem-stay"
                    value={selectedStayId}
                    onChange={(e) => setSelectedStayId(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    {activeStays.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.guestName} · {tr(`Room ${s.roomNumber}`)}-{s.bedLabel} ({tr('Exp')} {s.expectedCheckoutDate})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-2">
                <label className="flex items-center gap-2 typo-label text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendNow}
                    onChange={(e) => setSendNow(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-teal-700"
                  />
                  <span>{tr('Dispatch immediately (respects duplicate cooldown)')}</span>
                </label>

                {!sendNow && (
                  <div>
                    <label htmlFor="rem-when" className="block typo-label text-slate-700">
                      {tr('Schedule Date & Time')}
                    </label>
                    <input
                      id="rem-when"
                      type="datetime-local"
                      value={scheduledFor}
                      onChange={(e) => setScheduledFor(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono"
                    />
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="rem-msg" className="block typo-label text-slate-700">
                  {tr('Custom Message (optional — leave blank to use workspace template)')}
                </label>
                <textarea
                  id="rem-msg"
                  rows={3}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder={tr('Optional custom reminder wording...')}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setScheduleOpen(false)}
                  className="min-h-10 rounded-md border border-slate-300 px-4 py-2 typo-btn text-slate-700"
                >
                  {tr('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-10 rounded-md bg-teal-700 px-4 py-2 typo-btn text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {submitting ? tr('Processing...') : sendNow ? tr('Send Reminder') : tr('Schedule Reminder')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
