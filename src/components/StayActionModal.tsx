import { useEffect, useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../lib/LanguageContext';
import type { EnrichedBed, EnrichedStay } from '../types/domain';

interface StayActionModalProps {
  stay: EnrichedStay | null;
  allBeds: EnrichedBed[];
  onClose: () => void;
  onSuccess: () => void;
}

export function StayActionModal({
  stay,
  allBeds,
  onClose,
  onSuccess,
}: StayActionModalProps) {
  const { tr } = useLanguage();
  const [expectedCheckoutDate, setExpectedCheckoutDate] = useState('');
  const [newBedId, setNewBedId] = useState('');
  const [purposeOfStay, setPurposeOfStay] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stay) return;
    setExpectedCheckoutDate(stay.expectedCheckoutDate);
    setNewBedId(stay.bedId);
    setPurposeOfStay(stay.purposeOfStay);
    setNotes(stay.notes || '');
    setError(null);
  }, [stay]);

  useEffect(() => {
    if (!stay) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stay, submitting, onClose]);

  if (!stay) return null;

  const eligibleBeds = allBeds.filter(
    (b) => b.id === stay.bedId || (b.status !== 'maintenance' && (stay.status === 'upcoming' || b.status === 'vacant'))
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.updateStay(stay.id, {
        expectedCheckoutDate,
        newBedId: newBedId !== stay.bedId ? newBedId : undefined,
        purposeOfStay,
        notes,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Failed to update stay.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stay-action-title"
    >
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="stay-action-title" className="typo-section-heading text-slate-900">
              {tr('Extend Stay or Transfer Bed')}
            </h2>
            <p className="mt-0.5 typo-helper text-slate-500">
              {stay.guestName} · {tr('Current Room')} {stay.roomNumber} ({stay.bedLabel})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label={tr('Close stay action modal')}
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

          <div>
            <label htmlFor="stay-ext-date" className="block typo-label text-slate-700">
              {tr('Expected Checkout Date')}
            </label>
            <input
              id="stay-ext-date"
              type="date"
              required
              value={expectedCheckoutDate}
              onChange={(e) => setExpectedCheckoutDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="stay-bed-transfer" className="block typo-label text-slate-700">
              {tr('Assigned Room & Bed')}
            </label>
            <select
              id="stay-bed-transfer"
              value={newBedId}
              onChange={(e) => setNewBedId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
            >
              {eligibleBeds.map((b) => (
                <option key={b.id} value={b.id}>
                  {tr('Room')} {b.roomNumber} · {tr('Bed')} {b.bedLabel} ({tr(b.roomType)})
                  {b.id === stay.bedId ? ` (${tr('Current')})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="stay-purpose" className="block typo-label text-slate-700">
              {tr('Purpose of Stay')}
            </label>
            <input
              id="stay-purpose"
              type="text"
              value={purposeOfStay}
              onChange={(e) => setPurposeOfStay(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="stay-notes" className="block typo-label text-slate-700">
              {tr('Stay Notes')}
            </label>
            <textarea
              id="stay-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
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
              {submitting ? tr('Saving...') : tr('Update Stay')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
