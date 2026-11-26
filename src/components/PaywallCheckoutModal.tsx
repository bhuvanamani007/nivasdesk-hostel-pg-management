import { useEffect, useState, type FormEvent } from 'react';
import { Check, Lock, X } from 'lucide-react';
import { api } from '../lib/api';
import { formatInr } from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';
import type { Tenant, User } from '../types/domain';

export interface PricingTier {
  id: 'good' | 'better' | 'best';
  label: string;
  title: string;
  priceInr: number;
  summary: string;
  bullets: string[];
}

interface PaywallCheckoutModalProps {
  tier: PricingTier | null;
  onClose: () => void;
  onActivated: (user: User, tenant: Tenant) => void;
}

export function PaywallCheckoutModal({
  tier,
  onClose,
  onActivated,
}: PaywallCheckoutModalProps) {
  const { tr } = useLanguage();
  const [step, setStep] = useState<'pay' | 'setup'>('pay');
  const [payMethod, setPayMethod] = useState<'upi' | 'card' | 'netbanking'>('upi');
  const [billingName, setBillingName] = useState('');
  const [email, setEmail] = useState('');
  const [upiOrCard, setUpiOrCard] = useState('');
  const [licenseKey, setLicenseKey] = useState('');

  // Step 2: Unlocked only AFTER payment
  const [hostelName, setHostelName] = useState('');
  const [city, setCity] = useState('Bengaluru');
  const [password, setPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tier) return;
    setStep('pay');
    setError(null);
    setBusy(false);
  }, [tier]);

  useEffect(() => {
    if (!tier) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tier, busy, onClose]);

  if (!tier) return null;

  const handleCompletePayment = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!billingName.trim() || !email.trim() || !upiOrCard.trim()) {
      setError('Enter your billing name, email, and payment detail to unlock setup.');
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      const code = `ND-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      setLicenseKey(code);
      setStep('setup');
      setBusy(false);
    }, 350);
  };

  const handleProvisionWorkspace = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!hostelName.trim() || !city.trim() || password.length < 6) {
      setError('Hostel name, city, and a 6+ character password are required.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.registerWorkspace({
        hostelName: hostelName.trim(),
        city: city.trim(),
        wardenName: billingName.trim(),
        email: email.trim(),
        password,
      });
      onActivated(res.user, res.tenant);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workspace activation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
    >
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <p className="typo-helper font-semibold uppercase tracking-wide text-slate-500">
              {tr(step === 'pay' ? 'Step 1 of 2 · Checkout' : 'Step 2 of 2 · License Activated')}
            </p>
            <h2 id="paywall-title" className="mt-0.5 typo-section-heading text-slate-900">
              {tr(tier.title)} — {formatInr(tier.priceInr)} {tr('One-Time')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close checkout"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 typo-body font-medium text-red-800">
              {tr(error)}
            </div>
          )}

          {step === 'pay' ? (
            <form onSubmit={handleCompletePayment} className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 typo-body text-slate-700">
                <span className="font-semibold text-slate-900">{tr('One-time lifetime access.')} </span>
                {tr('Pay the license fee to unlock your private hostel workspace and warden login.')}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'upi', label: 'UPI' },
                    { id: 'card', label: 'Card' },
                    { id: 'netbanking', label: 'NetBanking' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPayMethod(m.id)}
                    className={`rounded-md border py-2 typo-btn font-semibold transition-colors ${
                      payMethod === m.id
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    {tr(m.label)}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="pw-name" className="block typo-label text-slate-700">
                    {tr('Owner Full Name')}
                  </label>
                  <input
                    id="pw-name"
                    type="text"
                    required
                    value={billingName}
                    onChange={(e) => setBillingName(e.target.value)}
                    placeholder="e.g., Ramesh Gowda"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="pw-email" className="block typo-label text-slate-700">
                    {tr('Receipt & Login Email')}
                  </label>
                  <input
                    id="pw-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner@yourpg.in"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="pw-detail" className="block typo-label text-slate-700">
                  {tr(
                    payMethod === 'upi'
                      ? 'UPI ID (PhonePe / GPay / BHIM)'
                      : payMethod === 'card'
                        ? 'Card Number (Last 4 or Sandbox Card)'
                        : 'Bank Name / Account Reference'
                  )}
                </label>
                <input
                  id="pw-detail"
                  type="text"
                  required
                  value={upiOrCard}
                  onChange={(e) => setUpiOrCard(e.target.value)}
                  placeholder={
                    payMethod === 'upi'
                      ? 'owner@okicici'
                      : payMethod === 'card'
                        ? '4242 •••• •••• 4242'
                        : 'HDFC Corporate NetBanking'
                  }
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-mono typo-input text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={busy}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-5 py-2.5 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                <Lock className="h-4 w-4" aria-hidden="true" />
                <span>
                  {busy
                    ? tr('Confirming Payment...')
                    : tr(`Pay ${formatInr(tier.priceInr)} Once & Unlock Hostel Setup`)}
                </span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleProvisionWorkspace} className="space-y-4">
              <div className="flex items-center gap-2.5 rounded-md border border-teal-200 bg-teal-50/50 px-3.5 py-2.5 typo-body text-teal-900">
                <Check className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                <span>
                  {tr(`Payment verified. Lifetime License ${licenseKey} activated for ${email}.`)}
                </span>
              </div>

              <div>
                <label htmlFor="pw-hostel" className="block typo-label text-slate-700">
                  {tr('Your Hostel / PG Name')}
                </label>
                <input
                  id="pw-hostel"
                  type="text"
                  required
                  value={hostelName}
                  onChange={(e) => setHostelName(e.target.value)}
                  placeholder="e.g., Sai Krupa Men's PG"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input text-slate-900 focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="pw-city" className="block typo-label text-slate-700">
                    {tr('City')}
                  </label>
                  <input
                    id="pw-city"
                    type="text"
                    required
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="pw-pass" className="block typo-label text-slate-700">
                    {tr('Set Warden Password (6+ chars)')}
                  </label>
                  <input
                    id="pw-pass"
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={tr('Minimum 6 characters')}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="flex min-h-11 w-full items-center justify-center rounded-md bg-teal-700 px-5 py-2.5 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {tr(busy ? 'Creating Private Desk...' : 'Open My Paid Hostel Desk')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
