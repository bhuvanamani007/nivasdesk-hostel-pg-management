import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Eye, IndianRupee, Plus, Search, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateShort, formatInr } from '../../lib/format';
import { useLanguage } from '../../lib/LanguageContext';
import type { PaymentMode, PortalPaymentItem, PortalPaymentsPayload } from '../../types/domain';
import { ConfirmDialog } from '../ConfirmDialog';

interface PortalPaymentsPageProps {
  mode: 'all' | 'rent' | 'history';
  onShowToast: (kind: 'ok' | 'error', text: string) => void;
}

export function PortalPaymentsPage({ mode, onShowToast }: PortalPaymentsPageProps) {
  const { tr } = useLanguage();
  const [payload, setPayload] = useState<PortalPaymentsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState(
    mode === 'rent' ? 'pending' : mode === 'history' ? 'paid' : 'all'
  );
  const [search, setSearch] = useState('');

  const [viewTarget, setViewTarget] = useState<PortalPaymentItem | null>(null);
  const [collectTarget, setCollectTarget] = useState<PortalPaymentItem | null>(null);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectMode, setCollectMode] = useState<PaymentMode>('upi');
  const [collectDate, setCollectDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [collectNote, setCollectNote] = useState('');
  const [collectBusy, setCollectBusy] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [newStayId, setNewStayId] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newMode, setNewMode] = useState<PaymentMode>('upi');
  const [newDueDate, setNewDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newStatus, setNewStatus] = useState<'paid' | 'unpaid'>('paid');
  const [newDescription, setNewDescription] = useState('Monthly Rent');
  const [addBusy, setAddBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<PortalPaymentItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    setStatusFilter(mode === 'rent' ? 'pending' : mode === 'history' ? 'paid' : 'all');
  }, [mode]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const effectiveStatus =
        mode === 'rent'
          ? statusFilter === 'overdue'
            ? 'overdue'
            : 'pending'
          : mode === 'history'
            ? 'paid'
            : statusFilter;

      const res = await api.getPortalPayments({
        tenantId: propertyFilter,
        status: effectiveStatus,
        search: search.trim() || undefined,
      });
      setPayload(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load payment records.');
    } finally {
      setLoading(false);
    }
  }, [mode, propertyFilter, statusFilter, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const openCollectModal = (item: PortalPaymentItem) => {
    setCollectTarget(item);
    setCollectAmount(String(item.outstandingAmount || item.amount));
    setCollectMode('upi');
    setCollectDate(new Date().toISOString().slice(0, 10));
    setCollectNote('');
  };

  const openAddModal = () => {
    const firstStay = payload?.activeStays[0];
    setNewStayId(firstStay?.id || '');
    setNewAmount(firstStay ? String(firstStay.agreedAmount) : '');
    setNewMode('upi');
    setNewDueDate(new Date().toISOString().slice(0, 10));
    setNewStatus(mode === 'rent' ? 'unpaid' : 'paid');
    setNewDescription('Monthly Rent');
    setAddOpen(true);
  };

  const handleCollect = async (e: FormEvent) => {
    e.preventDefault();
    if (!collectTarget) return;
    setCollectBusy(true);
    try {
      await api.createOrCollectPortalPayment({
        paymentId: collectTarget.id,
        amount: Number(collectAmount),
        paymentMode: collectMode,
        paymentDate: collectDate,
        referenceNote: collectNote.trim() || undefined,
      });
      setCollectTarget(null);
      onShowToast('ok', tr('Rent payment recorded.'));
      await loadData();
    } catch (err) {
      onShowToast('error', tr(err instanceof Error ? err.message : 'Could not record payment.'));
    } finally {
      setCollectBusy(false);
    }
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAddBusy(true);
    try {
      await api.createOrCollectPortalPayment({
        stayId: newStayId,
        amount: Number(newAmount),
        paymentMode: newMode,
        dueDate: newDueDate,
        paymentDate: new Date().toISOString().slice(0, 10),
        status: newStatus,
        description: newDescription.trim() || 'Monthly Rent',
      });
      setAddOpen(false);
      onShowToast('ok', tr(newStatus === 'paid' ? 'Payment recorded.' : 'Rent due added.'));
      await loadData();
    } catch (err) {
      onShowToast('error', tr(err instanceof Error ? err.message : 'Could not save rent record.'));
    } finally {
      setAddBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.deletePortalPayment(deleteTarget.id);
      setDeleteTarget(null);
      onShowToast('ok', tr('Record deleted.'));
      await loadData();
    } catch (err) {
      onShowToast('error', tr(err instanceof Error ? err.message : 'Could not delete record.'));
    } finally {
      setDeleteBusy(false);
    }
  };

  const title =
    mode === 'rent'
      ? tr('Rent Collection')
      : mode === 'history'
        ? tr('Payment History')
        : tr('Payments & Rent');

  const subtitle =
    mode === 'rent'
      ? tr('Pending and overdue rent waiting to be collected.')
      : mode === 'history'
        ? tr('Completed rent payments and receipt records.')
        : tr('Track collected rent and pending dues across all PG properties.');

  const rows = payload?.payments || [];
  const summary = payload?.summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="typo-dashboard-title text-slate-900">{title}</h1>
          <p className="mt-1 typo-body text-slate-600">{subtitle}</p>
        </div>
        {mode !== 'history' && (
          <button
            type="button"
            onClick={openAddModal}
            disabled={!payload || payload.activeStays.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3.5 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{tr(mode === 'rent' ? 'Add Rent Charge' : 'Record Payment')}</span>
          </button>
        )}
      </div>

      {/* Simple Summary Cards */}
      {summary && (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {mode !== 'rent' && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="typo-card-title text-slate-600">{tr('Total Collected')}</p>
              <p className="mt-1.5 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
                {formatInr(summary.totalCollected)}
              </p>
              <p className="mt-1 typo-helper text-slate-500">{tr(`${summary.paidCount} paid receipts`)}</p>
            </div>
          )}
          {mode !== 'history' && (
            <>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="typo-card-title text-slate-600">{tr('Pending Rent')}</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
                  {formatInr(summary.totalPending)}
                </p>
                <p className="mt-1 typo-helper text-slate-500">{tr(`${summary.pendingCount} pending entries`)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="typo-card-title text-slate-600">{tr('Overdue Rent')}</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold text-red-700 tabular-nums">
                  {summary.overdueCount}
                </p>
                <p className="mt-1 typo-helper text-slate-500">{tr('Tenants past due date')}</p>
              </div>
            </>
          )}
          {mode === 'history' && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="typo-card-title text-slate-600">{tr('Completed Payments')}</p>
              <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {summary.paidCount}
              </p>
              <p className="mt-1 typo-helper text-slate-500">{tr('All settled rent transactions')}</p>
            </div>
          )}
        </section>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr('Search by tenant name, room, or receipt...')}
            className="w-full rounded-md border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-3 typo-input focus:border-teal-700 focus:bg-white focus:outline-none"
          />
        </div>
        {payload && payload.properties.length > 1 && (
          <select
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            aria-label={tr('Filter by PG property')}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 typo-input"
          >
            <option value="all">{tr(`All Properties (${payload.properties.length})`)}</option>
            {payload.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {mode === 'all' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label={tr('Filter by payment status')}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 typo-input"
          >
            <option value="all">{tr('All Status')}</option>
            <option value="pending">{tr('Pending Rent')}</option>
            <option value="overdue">{tr('Overdue')}</option>
            <option value="paid">{tr('Paid')}</option>
          </select>
        )}
        {mode === 'rent' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label={tr('Filter pending rent')}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 typo-input"
          >
            <option value="pending">{tr('All Pending')}</option>
            <option value="overdue">{tr('Overdue Only')}</option>
          </select>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 typo-body text-red-900">
          <span>{tr(error)}</span>
          <button
            type="button"
            onClick={loadData}
            className="rounded border border-red-300 bg-white px-3 py-1 typo-btn text-red-800 hover:bg-red-100"
          >
            {tr('Retry')}
          </button>
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="p-8 text-center typo-body text-slate-500">{tr('Loading payments...')}</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <IndianRupee className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
            <p className="typo-card-title text-slate-900">{tr('No records found')}</p>
            <p className="typo-helper text-slate-500">
              {mode === 'rent'
                ? tr('Great! No pending rent dues match this filter.')
                : tr('No payment records match the selected filters.')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left typo-table-td">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 typo-table-th">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">{tr('Tenant & Property')}</th>
                  <th className="px-4 py-2.5 font-semibold text-right">{tr('Amount')}</th>
                  <th className="px-4 py-2.5 font-semibold">
                    {mode === 'history' ? tr('Paid On') : tr('Due Date')}
                  </th>
                  <th className="px-4 py-2.5 font-semibold">{tr('Status')}</th>
                  <th className="px-4 py-2.5 font-semibold text-right">{tr('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((item) => {
                  const isPending =
                    item.status === 'unpaid' ||
                    item.status === 'partially_paid' ||
                    item.status === 'overdue';
                  const statusLabel =
                    item.isOverdue && item.status !== 'paid'
                      ? 'Overdue'
                      : item.status === 'partially_paid'
                        ? 'Partially Paid'
                        : item.status === 'paid'
                          ? 'Paid'
                          : item.status === 'overdue'
                            ? 'Overdue'
                            : 'Unpaid';
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{item.guestName}</p>
                        <p className="typo-helper text-slate-500">
                          {item.tenantName} · {tr(item.roomLabel)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        <p className="font-semibold text-slate-900">
                          {formatInr(isPending ? item.outstandingAmount : item.paidAmount)}
                        </p>
                        {item.receiptNumber && (
                          <p className="typo-helper text-slate-500">{item.receiptNumber}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 typo-body text-slate-700">
                        {mode === 'history'
                          ? formatDateShort(item.paymentDate || item.dueDate)
                          : formatDateShort(item.dueDate)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-semibold ${
                            item.status === 'paid'
                              ? 'text-emerald-700'
                              : item.status === 'overdue' || item.isOverdue
                                ? 'text-red-700'
                                : 'text-amber-700'
                          }`}
                        >
                          {tr(statusLabel)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          {isPending && (
                            <button
                              type="button"
                              onClick={() => openCollectModal(item)}
                              className="rounded border border-teal-700 bg-teal-700 px-2.5 py-1 typo-btn font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                            >
                              {tr('Collect Rent')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setViewTarget(item)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-800 hover:border-teal-700 hover:text-teal-800 whitespace-nowrap"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{tr('View Details')}</span>
                          </button>
                          {isPending && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(item)}
                              className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2.5 py-1 typo-btn text-red-700 hover:bg-red-50 whitespace-nowrap"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Delete')}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
          aria-labelledby="view-payment-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="view-payment-title" className="typo-section-heading text-slate-900">
                {tr('Payment Details')}
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
            <div className="p-5 space-y-3 typo-body">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="typo-helper text-slate-500">{tr('Tenant')}</p>
                  <p className="font-semibold text-slate-900">{viewTarget.guestName}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Property')}</p>
                  <p className="font-medium text-slate-800">{viewTarget.tenantName}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Room')}</p>
                  <p className="text-slate-800">{tr(viewTarget.roomLabel)}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Status')}</p>
                  <p className="font-semibold text-slate-900">
                    {tr(
                      viewTarget.status === 'partially_paid'
                        ? 'Partially Paid'
                        : viewTarget.status === 'paid'
                          ? 'Paid'
                          : viewTarget.status === 'overdue'
                            ? 'Overdue'
                            : 'Unpaid'
                    )}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Total Amount')}</p>
                  <p className="font-mono font-semibold text-slate-900">
                    {formatInr(viewTarget.amount)}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Paid Amount')}</p>
                  <p className="font-mono font-semibold text-emerald-700">
                    {formatInr(viewTarget.paidAmount)}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Due Date')}</p>
                  <p className="text-slate-800">{formatDateShort(viewTarget.dueDate)}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Payment Mode')}</p>
                  <p className="uppercase text-slate-800">
                    {viewTarget.paymentMode
                      ? tr(
                          viewTarget.paymentMode === 'bank_transfer'
                            ? 'Bank Transfer'
                            : viewTarget.paymentMode === 'upi'
                              ? 'UPI'
                              : viewTarget.paymentMode === 'cash'
                                ? 'Cash'
                                : 'Card'
                        )
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Receipt No.')}</p>
                  <p className="font-mono text-slate-800">{viewTarget.receiptNumber || '—'}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Paid Date')}</p>
                  <p className="text-slate-800">
                    {viewTarget.paymentDate ? formatDateShort(viewTarget.paymentDate) : '—'}
                  </p>
                </div>
              </div>
              {viewTarget.referenceNote && (
                <div className="border-t border-slate-100 pt-2">
                  <p className="typo-helper text-slate-500">{tr('Note')}</p>
                  <p className="text-slate-700">{viewTarget.referenceNote}</p>
                </div>
              )}
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

      {/* Collect Rent Modal */}
      {collectTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="collect-rent-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="collect-rent-title" className="typo-section-heading text-slate-900">
                {tr('Collect Rent')}
              </h2>
              <button
                type="button"
                onClick={() => setCollectTarget(null)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCollect} className="p-5 space-y-3">
              <p className="typo-body text-slate-700">
                {tr('Tenant')}: <span className="font-semibold text-slate-900">{collectTarget.guestName}</span> ({tr(collectTarget.roomLabel)})
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">{tr('Amount (INR)')}</label>
                  <input
                    type="number"
                    min={1}
                    max={collectTarget.outstandingAmount || collectTarget.amount}
                    required
                    value={collectAmount}
                    onChange={(e) => setCollectAmount(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">{tr('Payment Mode')}</label>
                  <select
                    value={collectMode}
                    onChange={(e) => setCollectMode(e.target.value as PaymentMode)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    <option value="upi">{tr('UPI')}</option>
                    <option value="cash">{tr('Cash')}</option>
                    <option value="bank_transfer">{tr('Bank Transfer')}</option>
                    <option value="card">{tr('Card')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block typo-label text-slate-700">{tr('Payment Date')}</label>
                <input
                  type="date"
                  required
                  value={collectDate}
                  onChange={(e) => setCollectDate(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>
              <div>
                <label className="block typo-label text-slate-700">{tr('Reference Note (optional)')}</label>
                <input
                  type="text"
                  value={collectNote}
                  onChange={(e) => setCollectNote(e.target.value)}
                  placeholder={tr('UPI transaction ID or note')}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setCollectTarget(null)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  {tr('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={collectBusy}
                  className="rounded-md bg-teal-700 px-4 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {collectBusy ? tr('Saving...') : tr('Confirm Payment')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Payment / Rent Charge Modal */}
      {addOpen && payload && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-payment-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="add-payment-title" className="typo-section-heading text-slate-900">
                {mode === 'rent' ? tr('Add Rent Charge') : tr('Record Payment')}
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
            <form onSubmit={handleAdd} className="p-5 space-y-3">
              <div>
                <label className="block typo-label text-slate-700">{tr('Tenant')}</label>
                <select
                  required
                  value={newStayId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setNewStayId(id);
                    const stay = payload.activeStays.find((s) => s.id === id);
                    if (stay) setNewAmount(String(stay.agreedAmount));
                  }}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                >
                  {payload.activeStays.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.guestName} · {s.tenantName} ({tr(s.roomLabel)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">{tr('Amount (INR)')}</label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">{tr('Status')}</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as 'paid' | 'unpaid')}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    <option value="paid">{tr('Paid Now')}</option>
                    <option value="unpaid">{tr('Mark as Pending Due')}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">{tr('Due Date')}</label>
                  <input
                    type="date"
                    required
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
                {newStatus === 'paid' && (
                  <div>
                    <label className="block typo-label text-slate-700">{tr('Mode')}</label>
                    <select
                      value={newMode}
                      onChange={(e) => setNewMode(e.target.value as PaymentMode)}
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                    >
                      <option value="upi">{tr('UPI')}</option>
                      <option value="cash">{tr('Cash')}</option>
                      <option value="bank_transfer">{tr('Bank Transfer')}</option>
                      <option value="card">{tr('Card')}</option>
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className="block typo-label text-slate-700">{tr('Description')}</label>
                <input
                  type="text"
                  required
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
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
                  {addBusy ? tr('Saving...') : tr('Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={tr('Delete Rent Record?')}
        description={tr(`Remove the pending rent entry for ${deleteTarget?.guestName || ''}?`)}
        confirmLabel={tr('Delete')}
        destructive
        busy={deleteBusy}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
