import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import { formatInr } from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';
import type { EnrichedDeposit, EnrichedStay, PaymentMode } from '../types/domain';

interface DepositModalProps {
  open: boolean;
  action: 'collect' | 'adjust' | 'refund';
  deposit?: EnrichedDeposit | null;
  activeStays: EnrichedStay[];
  onClose: () => void;
  onSuccess: () => void;
}

export function DepositModal({
  open,
  action,
  deposit,
  activeStays,
  onClose,
  onSuccess,
}: DepositModalProps) {
  const { tr } = useLanguage();
  const [stayId, setStayId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('upi');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [referenceNote, setReferenceNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDate(new Date().toISOString().slice(0, 10));
    setNote('');
    setReferenceNote('');
    if (action === 'collect') {
      setStayId(activeStays[0]?.id || '');
      setAmount('10000');
      setPaymentMode('upi');
    } else if (deposit) {
      setAmount(String(deposit.remainingHeld));
      setPaymentMode('bank_transfer');
    }
  }, [open, action, deposit, activeStays]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

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
      if (action === 'collect') {
        if (!stayId) {
          setError(tr('Select a stay.'));
          setSubmitting(false);
          return;
        }
        await api.collectDeposit({
          stayId,
          amount: parsedAmount,
          paymentMode,
          collectedDate: date,
          referenceNote: referenceNote.trim(),
          notes: note.trim(),
        });
      } else if (action === 'adjust' && deposit) {
        await api.adjustDeposit(deposit.id, {
          amount: parsedAmount,
          note: note.trim() || 'Adjusted toward stay dues / repairs',
        });
      } else if (action === 'refund' && deposit) {
        await api.refundDeposit(deposit.id, {
          amount: parsedAmount,
          refundMode: paymentMode,
          refundDate: date,
          referenceNote: referenceNote.trim(),
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Deposit update failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="deposit-modal-title"
    >
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="deposit-modal-title" className="typo-section-heading text-slate-900">
              {action === 'collect'
                ? tr('Collect Security Deposit')
                : action === 'adjust'
                  ? tr('Adjust Deposit Against Dues')
                  : tr('Refund Security Deposit')}
            </h2>
            {deposit && (
              <p className="mt-0.5 typo-helper text-slate-500">
                {deposit.guestName} · {tr('Held Balance:')}{' '}{formatInr(deposit.remainingHeld)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label={tr('Close deposit modal')}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
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

          {action === 'collect' && (
            <div>
              <label htmlFor="dep-stay" className="block typo-label text-slate-700">
                {tr('Stay / Guest')}
              </label>
              <select
                id="dep-stay"
                required
                value={stayId}
                onChange={(e) => setStayId(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
              >
                <option value="">{tr('Select stay...')}</option>
                {activeStays.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.guestName} · {tr('Room')} {s.roomNumber}-{s.bedLabel}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="dep-amt" className="block typo-label text-slate-700">
                {tr('Amount (₹)')} <span className="text-red-600">*</span>
              </label>
              <input
                id="dep-amt"
                type="number"
                min={1}
                max={action !== 'collect' && deposit ? deposit.remainingHeld : undefined}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono"
              />
            </div>

            {action !== 'adjust' && (
              <div>
                <label htmlFor="dep-mode" className="block typo-label text-slate-700">
                  {action === 'refund' ? tr('Refund Mode') : tr('Payment Mode')}
                </label>
                <select
                  id="dep-mode"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                >
                  <option value="upi">{tr('UPI')}</option>
                  <option value="cash">{tr('Cash')}</option>
                  <option value="bank_transfer">{tr('Bank Transfer')}</option>
                </select>
              </div>
            )}
          </div>

          {action !== 'adjust' && (
            <div>
              <label htmlFor="dep-date" className="block typo-label text-slate-700">
                {action === 'refund' ? tr('Refund Date') : tr('Collection Date')}
              </label>
              <input
                id="dep-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono"
              />
            </div>
          )}

          {action !== 'adjust' && (
            <div>
              <label htmlFor="dep-ref" className="block typo-label text-slate-700">
                {tr('Reference / UTR')}
              </label>
              <input
                id="dep-ref"
                type="text"
                value={referenceNote}
                onChange={(e) => setReferenceNote(e.target.value)}
                placeholder={tr('Transaction or receipt ref')}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
              />
            </div>
          )}

          <div>
            <label htmlFor="dep-note" className="block typo-label text-slate-700">
              {action === 'adjust' ? tr('Adjustment Reason') : tr('Notes')}
            </label>
            <input
              id="dep-note"
              type="text"
              required={action === 'adjust'}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                action === 'adjust'
                  ? tr('e.g., Adjusted against final month rent / room painting')
                  : tr('Optional note')
              }
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="min-h-10 rounded-md border border-slate-300 px-4 py-2 typo-btn text-slate-700"
            >
              {tr('Cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-10 rounded-md bg-teal-700 px-4 py-2 typo-btn text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {submitting
                ? tr('Saving...')
                : action === 'collect'
                  ? tr('Collect Deposit')
                  : action === 'adjust'
                    ? tr('Record Adjustment')
                    : tr('Issue Refund')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
