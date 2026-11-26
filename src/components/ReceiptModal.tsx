import { useEffect } from 'react';
import { Printer, X } from 'lucide-react';
import { formatDateShort, formatInr, PAYMENT_MODE_LABELS } from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';
import type { EnrichedPayment, Tenant } from '../types/domain';

interface ReceiptModalProps {
  payment: EnrichedPayment | null;
  tenant: Tenant;
  onClose: () => void;
}

export function ReceiptModal({ payment, tenant, onClose }: ReceiptModalProps) {
  const { uiLanguage, tr } = useLanguage();

  useEffect(() => {
    if (!payment) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [payment, onClose]);

  if (!payment) return null;

  const isTa = uiLanguage === 'ta';
  const locationLine = [tenant.address, tenant.locality, tenant.district, tenant.pincode]
    .filter(Boolean)
    .join(', ');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-title"
    >
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="receipt-title" className="typo-section-heading text-slate-900">
            {isTa ? 'கட்டண ரசீது (Payment Receipt)' : 'Payment Receipt'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt modal"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div id="printable-receipt" className="p-6 space-y-5">
          <div className="flex items-start justify-between border-b border-slate-200 pb-4">
            <div className="pr-4">
              <h3 className="typo-section-heading text-slate-900">{tenant.name}</h3>
              <p className="mt-1 typo-helper text-slate-600">{locationLine}</p>
              {tenant.landmark && (
                <p className="mt-0.5 typo-helper text-slate-500">
                  {tr('Landmark:')} {tenant.landmark}
                </p>
              )}
              <p className="mt-0.5 typo-helper text-slate-500">
                {tenant.gstinOrReg ? `${tr('Ref:')} ${tenant.gstinOrReg} · ` : ''}
                {tr('Warden')}: {tenant.wardenPhone}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="typo-helper font-medium text-slate-500">
                {tr('Receipt No.')}
              </p>
              <p className="mt-0.5 font-mono typo-body font-semibold text-slate-900">
                {payment.receiptNumber || tr('PENDING')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 typo-body">
            <div>
              <p className="typo-helper text-slate-500">
                {tr('Received From')}
              </p>
              <p className="mt-0.5 font-semibold text-slate-900">{payment.guestName}</p>
              <p className="font-mono typo-helper text-slate-600">{payment.guestPhone}</p>
            </div>
            <div className="text-right">
              <p className="typo-helper text-slate-500">
                {tr('Accommodation')}
              </p>
              <p className="mt-0.5 font-medium text-slate-900">
                {tr(`Room ${payment.roomNumber}`)} · {tr(`Bed ${payment.bedLabel}`)}
              </p>
              <p className="typo-helper text-slate-600">
                {tr('Date:')} {formatDateShort(payment.paymentDate || payment.dueDate)}
              </p>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-2">
            <div className="flex items-center justify-between typo-body">
              <span className="text-slate-700">{tr(payment.description)}</span>
              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                {formatInr(payment.amount)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-2.5">
              <span className="typo-body font-semibold text-slate-900">
                {payment.status === 'refunded'
                  ? tr('Refunded Amount')
                  : tr('Amount Paid')}
              </span>
              <span className="font-mono typo-section-heading text-teal-800 tabular-nums">
                {formatInr(payment.paidAmount)}
              </span>
            </div>
            {payment.outstandingAmount > 0 && payment.status !== 'refunded' && (
              <div className="flex items-center justify-between typo-helper text-red-700">
                <span>{tr('Remaining Balance Due')}</span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatInr(payment.outstandingAmount)}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 typo-helper text-slate-600">
            <div>
              <span className="text-slate-500">{tr('Payment Mode')}: </span>
              <span className="font-medium text-slate-800">
                {payment.paymentMode ? tr(PAYMENT_MODE_LABELS[payment.paymentMode]) : '—'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-slate-500">{tr('Reference:')} </span>
              <span className="font-mono text-slate-800">
                {payment.referenceNote || '—'}
              </span>
            </div>
          </div>

          {tenant.agreementNotes && (
            <p className="border-t border-slate-100 pt-3 typo-helper leading-relaxed text-slate-500">
              {tenant.agreementNotes}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn text-slate-700 hover:bg-slate-50"
          >
            {tr('Close')}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-teal-700 px-4 py-2 typo-btn text-white hover:bg-teal-800"
          >
            <Printer className="h-4 w-4" />
            <span>{tr('Print Receipt')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
