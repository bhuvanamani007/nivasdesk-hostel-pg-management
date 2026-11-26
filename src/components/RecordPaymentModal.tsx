import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import { formatInr } from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';
import type { EnrichedPayment, EnrichedStay, PaymentMode } from '../types/domain';

interface RecordPaymentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  preselectedPayment?: EnrichedPayment | null;
  activeStays: EnrichedStay[];
  unpaidPayments: EnrichedPayment[];
}

export function RecordPaymentModal({
  open,
  onClose,
  onSuccess,
  preselectedPayment,
  activeStays,
  unpaidPayments,
}: RecordPaymentModalProps) {
  const { tr } = useLanguage();
  const [targetMode, setTargetMode] = useState<'settle_existing' | 'new_charge'>(
    'settle_existing'
  );
  const [paymentId, setPaymentId] = useState('');
  const [stayId, setStayId] = useState('');
  const [amount, setAmount] = useState('');
  const [paidNowAmount, setPaidNowAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('upi');
  const [status, setStatus] = useState<'paid' | 'partially_paid' | 'unpaid'>('paid');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [referenceNote, setReferenceNote] = useState('');
  const [description, setDescription] = useState('Monthly PG rent');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (preselectedPayment) {
      setTargetMode('settle_existing');
      setPaymentId(preselectedPayment.id);
      setAmount(String(preselectedPayment.outstandingAmount || preselectedPayment.amount));
      setPaidNowAmount(String(preselectedPayment.outstandingAmount || preselectedPayment.amount));
      setStatus('paid');
      setDueDate(preselectedPayment.dueDate);
      setDescription(preselectedPayment.description);
      setReferenceNote('');
    } else if (unpaidPayments.length > 0) {
      setTargetMode('settle_existing');
      const first = unpaidPayments[0];
      setPaymentId(first.id);
      setAmount(String(first.outstandingAmount || first.amount));
      setPaidNowAmount(String(first.outstandingAmount || first.amount));
      setStatus('paid');
      setDueDate(first.dueDate);
      setDescription(first.description);
      setReferenceNote('');
    } else {
      setTargetMode('new_charge');
      setPaymentId('');
      setStayId(activeStays[0]?.id || '');
      const defAmt = activeStays[0] ? String(activeStays[0].agreedAmount) : '';
      setAmount(defAmt);
      setPaidNowAmount(defAmt);
      setStatus('paid');
      setReferenceNote('');
    }
  }, [open, preselectedPayment, unpaidPayments, activeStays]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const selectedUnpaid = unpaidPayments.find((p) => p.id === paymentId) || preselectedPayment;

  const handleSelectExisting = (nextId: string) => {
    setPaymentId(nextId);
    const found = unpaidPayments.find((p) => p.id === nextId);
    if (found) {
      const due = found.outstandingAmount || found.amount;
      setAmount(String(due));
      setPaidNowAmount(String(due));
      setDueDate(found.dueDate);
      setDescription(found.description);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError(tr('Enter a valid positive amount.'));
      return;
    }

    setSubmitting(true);
    try {
      if (targetMode === 'settle_existing') {
        if (!paymentId) {
          setError(tr('Select an unpaid charge to collect.'));
          setSubmitting(false);
          return;
        }
        const outstanding = selectedUnpaid?.outstandingAmount || parsedAmount;
        const isPartial = parsedAmount < outstanding;
        await api.recordPayment({
          paymentId,
          amount: parsedAmount,
          paidAmount: parsedAmount,
          status: isPartial ? 'partially_paid' : 'paid',
          paymentMode,
          paymentDate,
          referenceNote: referenceNote.trim(),
        });
      } else {
        if (!stayId) {
          setError(tr('Select a stay for this entry.'));
          setSubmitting(false);
          return;
        }
        const partialPaid = Number(paidNowAmount);
        if (status === 'partially_paid' && (!Number.isFinite(partialPaid) || partialPaid <= 0 || partialPaid >= parsedAmount)) {
          setError(tr('Partial paid amount must be greater than 0 and less than total charge.'));
          setSubmitting(false);
          return;
        }
        await api.recordPayment({
          stayId,
          amount: parsedAmount,
          paidAmount: status === 'paid' ? parsedAmount : status === 'partially_paid' ? partialPaid : 0,
          status,
          paymentMode,
          paymentDate,
          dueDate,
          referenceNote: referenceNote.trim(),
          description: description.trim() || 'Monthly PG rent',
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Failed to record payment.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="record-payment-title"
    >
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="record-payment-title" className="typo-section-heading text-slate-900">
              {tr('Record Payment / Partial Settlement')}
            </h2>
            <p className="mt-0.5 typo-helper text-slate-500">
              {tr('Supports full or partial Cash, UPI, and Bank Transfer collections with receipts.')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label={tr('Close payment modal')}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 typo-body text-red-800">
              {tr(error)}
            </div>
          )}

          {!preselectedPayment && (
            <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 w-fit">
              <button
                type="button"
                onClick={() => setTargetMode('settle_existing')}
                disabled={unpaidPayments.length === 0}
                className={`rounded px-3 py-1.5 typo-btn whitespace-nowrap ${
                  targetMode === 'settle_existing'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 disabled:opacity-40'
                }`}
              >
                {tr('Collect Pending Due')} ({unpaidPayments.length})
              </button>
              <button
                type="button"
                onClick={() => setTargetMode('new_charge')}
                className={`rounded px-3 py-1.5 typo-btn whitespace-nowrap ${
                  targetMode === 'new_charge'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tr('New Charge / Receipt')}
              </button>
            </div>
          )}

          {targetMode === 'settle_existing' ? (
            <div className="space-y-2">
              <label htmlFor="pay-existing-select" className="block typo-label text-slate-700">
                {tr('Pending Stay Charge')}
              </label>
              <select
                id="pay-existing-select"
                value={paymentId}
                onChange={(e) => handleSelectExisting(e.target.value)}
                disabled={Boolean(preselectedPayment)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none disabled:bg-slate-50"
              >
                {unpaidPayments.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.guestName} · {tr('Room')} {p.roomNumber}-{p.bedLabel} · {tr('Bal')}{' '}
                    {formatInr(p.outstandingAmount || p.amount)} ({tr('Due')} {p.dueDate})
                  </option>
                ))}
              </select>
              {selectedUnpaid && (
                <p className="typo-helper text-slate-500 tabular-nums">
                  {tr('Total Charge')}: {formatInr(selectedUnpaid.amount)} · {tr('Already Paid')}:{' '}
                  {formatInr(selectedUnpaid.paidAmount)} · {tr('Remaining')}:{' '}
                  <span className="font-semibold text-slate-900">
                    {formatInr(selectedUnpaid.outstandingAmount)}
                  </span>
                </p>
              )}
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="pay-stay-select" className="block typo-label text-slate-700">
                  {tr('Stay / Guest')}
                </label>
                <select
                  id="pay-stay-select"
                  value={stayId}
                  onChange={(e) => setStayId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                >
                  <option value="">{tr('Select stay...')}</option>
                  {activeStays.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.guestName} · {tr('Room')} {s.roomNumber}-{s.bedLabel}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="pay-entry-status" className="block typo-label text-slate-700">
                    {tr('Entry Status')}
                  </label>
                  <select
                    id="pay-entry-status"
                    value={status}
                    onChange={(e) =>
                      setStatus(e.target.value as 'paid' | 'partially_paid' | 'unpaid')
                    }
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  >
                    <option value="paid">{tr('Paid Immediately')}</option>
                    <option value="partially_paid">{tr('Partially Paid Now')}</option>
                    <option value="unpaid">{tr('Add Unpaid Charge')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="pay-desc" className="block typo-label text-slate-700">
                    {tr('Description')}
                  </label>
                  <input
                    id="pay-desc"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="pay-amount" className="block typo-label text-slate-700">
                {targetMode === 'settle_existing' ? tr('Collecting Now (₹)') : tr('Total Charge (₹)')}{' '}
                <span className="text-red-600">*</span>
              </label>
              <input
                id="pay-amount"
                type="number"
                min={1}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
              />
            </div>

            {targetMode === 'new_charge' && status === 'partially_paid' ? (
              <div>
                <label htmlFor="pay-now-amt" className="block typo-label text-slate-700">
                  {tr('Paid Now (₹)')} <span className="text-red-600">*</span>
                </label>
                <input
                  id="pay-now-amt"
                  type="number"
                  min={1}
                  required
                  value={paidNowAmount}
                  onChange={(e) => setPaidNowAmount(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
                />
              </div>
            ) : targetMode === 'settle_existing' || status === 'paid' ? (
              <div>
                <label htmlFor="pay-mode" className="block typo-label text-slate-700">
                  {tr('Payment Mode')}
                </label>
                <select
                  id="pay-mode"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                >
                  <option value="upi">{tr('UPI')}</option>
                  <option value="cash">{tr('Cash')}</option>
                  <option value="bank_transfer">{tr('Bank Transfer')}</option>
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor="pay-due-date" className="block typo-label text-slate-700">
                  {tr('Due Date')}
                </label>
                <input
                  id="pay-due-date"
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
                />
              </div>
            )}
          </div>

          {(targetMode === 'settle_existing' || status === 'paid' || status === 'partially_paid') && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="pay-date" className="block typo-label text-slate-700">
                  {tr('Payment Date')}
                </label>
                <input
                  id="pay-date"
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
                />
              </div>
              {targetMode === 'new_charge' && status === 'partially_paid' && (
                <div>
                  <label htmlFor="pay-mode-part" className="block typo-label text-slate-700">
                    {tr('Payment Mode')}
                  </label>
                  <select
                    id="pay-mode-part"
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  >
                    <option value="upi">{tr('UPI')}</option>
                    <option value="cash">{tr('Cash')}</option>
                    <option value="bank_transfer">{tr('Bank Transfer')}</option>
                  </select>
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="pay-ref" className="block typo-label text-slate-700">
              {tr('Reference / UTR / Note')}
            </label>
            <input
              id="pay-ref"
              type="text"
              value={referenceNote}
              onChange={(e) => setReferenceNote(e.target.value)}
              placeholder={tr('e.g., GPay UTR 42910082311 or Cash receipt')}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn text-slate-700 hover:bg-slate-50"
            >
              {tr('Cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-10 rounded-md bg-teal-700 px-5 py-2 typo-btn text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {submitting
                ? tr('Saving...')
                : targetMode === 'new_charge' && status === 'unpaid'
                  ? tr('Add Charge')
                  : tr('Save & Issue Receipt')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
