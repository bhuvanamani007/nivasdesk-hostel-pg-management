import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Download, Paperclip, Plus, Search, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { downloadCsv } from '../lib/csv';
import {
  EXPENSE_CATEGORY_LABELS,
  formatDateShort,
  formatInr,
  PAYMENT_MODE_LABELS,
} from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';
import type {
  Expense,
  ExpenseCategory,
  PaginationMeta,
  PaymentMode,
  UserRole,
} from '../types/domain';
import { ConfirmDialog } from './ConfirmDialog';
import { Pagination } from './Pagination';

interface ExpensesViewProps {
  refreshKey: number;
  userRole: UserRole;
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

export function ExpensesView({ refreshKey, userRole, onDataChanged }: ExpensesViewProps) {
  const { tr } = useLanguage();
  const canDelete = userRole === 'owner' || userRole === 'warden' || userRole === 'overall_admin';

  const [categoryFilter, setCategoryFilter] = useState<'all' | ExpenseCategory>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalFilteredAmount, setTotalFilteredAmount] = useState(0);
  const [pagination, setPagination] = useState<PaginationMeta>(DEFAULT_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Add Expense Modal
  const [addOpen, setAddOpen] = useState(false);
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState<ExpenseCategory>('utilities');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('upi');
  const [vendorName, setVendorName] = useState('');
  const [note, setNote] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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
      .getExpenses(
        {
          page,
          pageSize,
          category: categoryFilter,
          from: fromDate || undefined,
          to: toDate || undefined,
          search: debouncedQuery || undefined,
        },
        controller.signal
      )
      .then((res) => {
        setExpenses(res.expenses);
        setTotalFilteredAmount(res.totalFilteredAmount);
        setPagination(res.pagination);
        if (res.pagination.page !== page) setPage(res.pagination.page);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? tr(err.message) : tr('Failed to load expenses.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [page, pageSize, categoryFilter, fromDate, toDate, debouncedQuery, refreshKey, reloadTick, tr]);

  const handleRetry = useCallback(() => {
    setReloadTick((t) => t + 1);
  }, []);

  const handleCreateExpense = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const numAmt = Number(amount);
    if (!Number.isFinite(numAmt) || numAmt <= 0 || !vendorName.trim()) {
      setError(tr('Vendor name and positive amount are required.'));
      return;
    }

    const fd = new FormData();
    fd.append('expenseDate', expDate);
    fd.append('category', category);
    fd.append('amount', String(numAmt));
    fd.append('paymentMode', paymentMode);
    fd.append('vendorName', vendorName.trim());
    fd.append('note', note.trim());
    if (attachment) fd.append('attachment', attachment);

    setSubmitting(true);
    try {
      await api.createExpense(fd);
      setVendorName('');
      setAmount('');
      setNote('');
      setAttachment(null);
      setAddOpen(false);
      setPage(1);
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Could not save expense.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!expenseToDelete) return;
    setDeleteBusy(true);
    try {
      await api.deleteExpense(expenseToDelete.id);
      setExpenseToDelete(null);
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Delete failed.'));
      setExpenseToDelete(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleExportCsv = () => {
    downloadCsv(
      `nivasdesk-expenses-${new Date().toISOString().slice(0, 10)}.csv`,
      [tr('Date'), tr('Category'), tr('Vendor'), tr('Note'), tr('Mode'), tr('Amount (INR)'), tr('Recorded By')],
      expenses.map((e) => [
        e.expenseDate,
        tr(EXPENSE_CATEGORY_LABELS[e.category]),
        e.vendorName,
        e.note,
        tr(PAYMENT_MODE_LABELS[e.paymentMode]),
        e.amount,
        e.recordedByName,
      ])
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="typo-page-title text-slate-900">{tr('Operating Expenses')}</h1>
          <p className="mt-0.5 typo-body text-slate-600">
            {tr('Track EB electricity bills, water/RO, plumbing repairs, housekeeping supplies, and mess groceries with private bill attachments.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={expenses.length === 0}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 typo-btn text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr('Export CSV')}</span>
          </button>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-700 px-4 py-2 typo-btn text-white hover:bg-teal-800 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{tr('Add Expense')}</span>
          </button>
        </div>
      </div>

      {/* Filters & Total */}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder={tr('Search vendor or note...')}
              aria-label={tr('Search expenses')}
              className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 typo-input focus:border-teal-700 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={fromDate}
              aria-label={tr('Filter from date')}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 typo-input font-mono"
            />
            <span className="typo-helper text-slate-400">{tr('to')}</span>
            <input
              type="date"
              value={toDate}
              aria-label={tr('Filter to date')}
              onChange={(e) => {
                setToDate(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 typo-input font-mono"
            />
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setPage(1);
                }}
                className="typo-btn text-teal-700 hover:underline"
              >
                {tr('Clear dates')}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 w-fit">
            {(
              [
                { id: 'all', label: 'All Categories' },
                { id: 'utilities', label: 'Utilities' },
                { id: 'repairs_maintenance', label: 'Repairs' },
                { id: 'supplies', label: 'Supplies' },
                { id: 'food', label: 'Food / Mess' },
                { id: 'other', label: 'Other' },
              ] as const
            ).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCategoryFilter(c.id);
                  setPage(1);
                }}
                className={`rounded px-2.5 py-1 typo-btn transition-colors whitespace-nowrap ${
                  categoryFilter === c.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                {tr(c.label)}
              </button>
            ))}
          </div>

          <p className="typo-body text-slate-600">
            {tr('Filtered Total:')}{' '}
            <span className="font-mono typo-card-title font-semibold text-slate-900 tabular-nums">
              {formatInr(totalFilteredAmount)}
            </span>
          </p>
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

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading && expenses.length === 0 ? (
          <div className="p-8 text-center typo-body text-slate-500">{tr('Loading expenses...')}</div>
        ) : expenses.length === 0 ? (
          <div className="p-10 text-center">
            <p className="typo-body font-medium text-slate-700">{tr('No expenses match the selected filters.')}</p>
          </div>
        ) : (
          <div className={`overflow-x-auto ${loading ? 'opacity-60 transition-opacity' : ''}`}>
            <table className="w-full text-left typo-table-td">
              <thead className="border-b border-slate-200 bg-slate-50 typo-table-th text-slate-600">
                <tr>
                  <th className="px-5 py-3">{tr('Date')}</th>
                  <th className="px-4 py-3">{tr('Category')}</th>
                  <th className="px-4 py-3">{tr('Vendor & Description')}</th>
                  <th className="px-4 py-3">{tr('Mode')}</th>
                  <th className="px-4 py-3 text-right">{tr('Amount')}</th>
                  <th className="px-5 py-3 text-right">{tr('Bill / Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3 typo-table-td text-slate-600 tabular-nums whitespace-nowrap">
                      {formatDateShort(exp.expenseDate)}
                    </td>
                    <td className="px-4 py-3 typo-table-td font-medium text-slate-800 whitespace-nowrap">
                      {tr(EXPENSE_CATEGORY_LABELS[exp.category])}
                    </td>
                    <td className="px-4 py-3">
                      <p className="typo-table-td font-medium text-slate-900">{exp.vendorName}</p>
                      <p className="typo-helper text-slate-500">{exp.note || '—'}</p>
                    </td>
                    <td className="px-4 py-3 typo-table-td text-slate-700 whitespace-nowrap">
                      {tr(PAYMENT_MODE_LABELS[exp.paymentMode])}
                    </td>
                    <td className="px-4 py-3 text-right font-mono typo-table-td font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatInr(exp.amount)}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        {exp.attachmentFileName && (
                          <button
                            type="button"
                            onClick={() =>
                              api
                                .downloadExpenseAttachment(exp.id, exp.attachmentFileName!)
                                .catch((err) =>
                                  setError(err instanceof Error ? tr(err.message) : tr('Download failed.'))
                                )
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50"
                          >
                            <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{tr('Bill')}</span>
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setExpenseToDelete(exp)}
                            aria-label={tr(`Delete expense ${exp.vendorName}`)}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
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
          itemLabel="expenses"
        />
      </div>

      {/* Add Expense Modal */}
      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-expense-title"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 id="add-expense-title" className="typo-section-heading text-slate-900">
                {tr('Record Hostel Expense')}
              </h2>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                aria-label={tr('Close modal')}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="exp-date" className="block typo-label text-slate-700">
                    {tr('Expense Date')}
                  </label>
                  <input
                    id="exp-date"
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="exp-cat" className="block typo-label text-slate-700">
                    {tr('Category')}
                  </label>
                  <select
                    id="exp-cat"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    <option value="utilities">{tr('Utilities (EB / Water / Wi-Fi)')}</option>
                    <option value="repairs_maintenance">{tr('Repairs & Maintenance')}</option>
                    <option value="supplies">{tr('Housekeeping & Supplies')}</option>
                    <option value="food">{tr('Mess & Food Provisions')}</option>
                    <option value="other">{tr('Other Operating')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="exp-amt" className="block typo-label text-slate-700">
                    {tr('Amount (₹)')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="exp-amt"
                    type="number"
                    min={1}
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="exp-mode" className="block typo-label text-slate-700">
                    {tr('Payment Mode')}
                  </label>
                  <select
                    id="exp-mode"
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    <option value="upi">{tr('UPI')}</option>
                    <option value="cash">{tr('Cash')}</option>
                    <option value="bank_transfer">{tr('Bank Transfer')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="exp-vendor" className="block typo-label text-slate-700">
                  {tr('Vendor / Payee')} <span className="text-red-600">*</span>
                </label>
                <input
                  id="exp-vendor"
                  type="text"
                  required
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  placeholder={tr('e.g., TANGEDCO EB / Velan Plumbing')}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>

              <div>
                <label htmlFor="exp-note" className="block typo-label text-slate-700">
                  {tr('Note')}
                </label>
                <input
                  id="exp-note"
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={tr('Bill number, month, or room repaired')}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>

              <div>
                <label htmlFor="exp-file" className="block typo-label text-slate-700">
                  {tr('Bill Attachment (optional, JPG/PNG/PDF, max 5MB)')}
                </label>
                <input
                  id="exp-file"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                  className="mt-1 block w-full typo-helper text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
                />
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="min-h-10 rounded-md border border-slate-300 px-4 py-2 typo-btn text-slate-700"
                >
                  {tr('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-10 rounded-md bg-teal-700 px-4 py-2 typo-btn text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {submitting ? tr('Saving...') : tr('Save Expense')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(expenseToDelete)}
        title={tr(`Delete Expense (${expenseToDelete?.vendorName || ''})?`)}
        description={tr('This removes the expense entry and any attached bill file from the workspace.')}
        confirmLabel={tr('Delete Expense')}
        destructive
        busy={deleteBusy}
        onConfirm={handleConfirmDelete}
        onCancel={() => setExpenseToDelete(null)}
      />
    </div>
  );
}
