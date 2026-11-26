import { useState, type FormEvent } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { formatInr } from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';

interface SandboxBed {
  id: string;
  room: string;
  bed: string;
  tariff: number;
  status: 'occupied' | 'vacant' | 'maintenance';
  guestName?: string;
  phone?: string;
  aadhaarMasked?: string;
  rentStatus?: 'paid' | 'unpaid';
  receiptNo?: string;
  smsSentAt?: string;
}

const INITIAL_BEDS: SandboxBed[] = [
  {
    id: '101-A',
    room: '101',
    bed: 'A',
    tariff: 9500,
    status: 'occupied',
    guestName: 'Karthik Reddy',
    phone: '+91 98451 22410',
    aadhaarMasked: 'XXXX-XXXX-4821',
    rentStatus: 'unpaid',
  },
  {
    id: '101-B',
    room: '101',
    bed: 'B',
    tariff: 9500,
    status: 'vacant',
  },
  {
    id: '102-A',
    room: '102',
    bed: 'A',
    tariff: 8500,
    status: 'occupied',
    guestName: 'Arjun Nair',
    phone: '+91 97390 11842',
    aadhaarMasked: 'XXXX-XXXX-9034',
    rentStatus: 'paid',
    receiptNo: 'ND-2026-4109',
  },
  {
    id: '102-B',
    room: '102',
    bed: 'B',
    tariff: 8500,
    status: 'occupied',
    guestName: 'Saurabh Joshi',
    phone: '+91 99802 66412',
    aadhaarMasked: 'XXXX-XXXX-7715',
    rentStatus: 'unpaid',
  },
  {
    id: '103-A',
    room: '103',
    bed: 'A',
    tariff: 11000,
    status: 'vacant',
  },
  {
    id: '103-B',
    room: '103',
    bed: 'B',
    tariff: 11000,
    status: 'maintenance',
  },
];

function maskAadhaarLive(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  if (!digits) return 'XXXX-XXXX-0000';
  const last4 = digits.slice(-4).padStart(4, '•');
  return `XXXX-XXXX-${last4}`;
}

export function LandingSandbox({ onSelectBuy }: { onSelectBuy: () => void }) {
  const { tr } = useLanguage();
  const [mode, setMode] = useState<'desk' | 'calculator'>('desk');
  const [beds, setBeds] = useState<SandboxBed[]>(INITIAL_BEDS);
  const [selectedBedId, setSelectedBedId] = useState<string>('101-B');
  const [guestName, setGuestName] = useState('Rohan Kulkarni');
  const [phone, setPhone] = useState('+91 98860 34120');
  const [aadhaarInput, setAadhaarInput] = useState('4928 7710 4821');
  const [activityNote, setActivityNote] = useState<string>(
    'Click any Vacant bed to test a check-in, or click Karthik Reddy to collect overdue rent.'
  );

  // Leakage calculator state
  const [calcBeds, setCalcBeds] = useState(48);
  const [calcRent, setCalcRent] = useState(8500);

  const selectedBed = beds.find((b) => b.id === selectedBedId) || beds[0];
  const occupiedCount = beds.filter((b) => b.status === 'occupied').length;
  const vacantCount = beds.filter((b) => b.status === 'vacant').length;
  const unpaidCount = beds.filter((b) => b.status === 'occupied' && b.rentStatus === 'unpaid').length;

  const handleQuickAddTenant = () => {
    const firstVacant = beds.find((b) => b.status === 'vacant');
    if (firstVacant) {
      setSelectedBedId(firstVacant.id);
      setActivityNote(`Ready to add a new tenant to Room ${firstVacant.room} · Bed ${firstVacant.bed}.`);
    } else {
      setActivityNote('All beds are currently occupied or under maintenance. Reset Demo to free beds.');
    }
  };

  const handleSandboxCheckIn = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedBed || selectedBed.status !== 'vacant' || !guestName.trim()) return;
    const masked = maskAadhaarLive(aadhaarInput);
    const receipt = `ND-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    setBeds((prev) =>
      prev.map((b) =>
        b.id === selectedBed.id
          ? {
              ...b,
              status: 'occupied',
              guestName: guestName.trim(),
              phone: phone.trim() || '+91 90000 00000',
              aadhaarMasked: masked,
              rentStatus: 'paid',
              receiptNo: receipt,
            }
          : b
      )
    );
    setActivityNote(
      `Checked in ${guestName.trim()} to Room ${selectedBed.room}-${selectedBed.bed}. Aadhaar masked to ${masked} and receipt ${receipt} issued.`
    );
  };

  const handleCollectRent = (bed: SandboxBed) => {
    const receipt = `ND-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    setBeds((prev) =>
      prev.map((b) =>
        b.id === bed.id ? { ...b, rentStatus: 'paid', receiptNo: receipt } : b
      )
    );
    setActivityNote(
      `Collected ${formatInr(bed.tariff)} UPI from ${bed.guestName}. Issued instant receipt ${receipt}.`
    );
  };

  const handleSendSms = (bed: SandboxBed) => {
    if (bed.smsSentAt) {
      setActivityNote(
        `Duplicate SMS blocked by 24h cooldown for ${bed.guestName}.`
      );
      return;
    }
    const stamp = new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    setBeds((prev) =>
      prev.map((b) => (b.id === bed.id ? { ...b, smsSentAt: stamp } : b))
    );
    setActivityNote(
      `SMS sent to ${bed.phone}: "Reminder: ${formatInr(bed.tariff)} for Room ${bed.room}-${bed.bed} is due today."`
    );
  };

  const handleToggleMaintenance = (bed: SandboxBed) => {
    if (bed.status === 'occupied') return;
    const next = bed.status === 'maintenance' ? 'vacant' : 'maintenance';
    setBeds((prev) =>
      prev.map((b) => (b.id === bed.id ? { ...b, status: next } : b))
    );
    setActivityNote(`Room ${bed.room}-${bed.bed} marked ${next}.`);
  };

  const handleReset = () => {
    setBeds(INITIAL_BEDS);
    setSelectedBedId('101-B');
    setActivityNote('Sandbox reset. Try adding a tenant or collecting overdue rent.');
  };

  const monthlyTurnoverLoss = Math.round((calcBeds * calcRent * 2.5) / 30);
  const monthlyUncollectedLoss = Math.round(calcBeds * calcRent * 0.028);
  const annualLeakage = (monthlyTurnoverLoss + monthlyUncollectedLoss) * 12;
  const paybackDays = Math.max(2, Math.round((8999 / Math.max(1, annualLeakage)) * 365));

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      {/* Sandbox Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3.5">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setMode('desk')}
            className={`rounded-md px-3 py-1.5 typo-btn font-semibold transition-colors whitespace-nowrap ${
              mode === 'desk'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tr('Interactive Bed Desk')}
          </button>
          <button
            type="button"
            onClick={() => setMode('calculator')}
            className={`rounded-md px-3 py-1.5 typo-btn font-semibold transition-colors whitespace-nowrap ${
              mode === 'calculator'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tr('Rent Loss Calculator')}
          </button>
        </div>

        <div className="flex items-center gap-3">
          {mode === 'desk' && (
            <button
              type="button"
              onClick={handleQuickAddTenant}
              className="rounded-md bg-teal-700 px-3 py-1.5 typo-btn font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap"
            >
              {tr('+ Add Tenant')}
            </button>
          )}
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 typo-btn text-slate-600 hover:text-slate-900 whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr('Reset')}</span>
          </button>
        </div>
      </div>

      {mode === 'desk' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Left: Interactive Bed Grid */}
          <div className="p-5 sm:p-6 lg:col-span-7 border-b border-slate-200 lg:border-b-0 lg:border-r">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <p className="typo-body font-semibold text-slate-700">
                {tr('Rooms & Beds — Click any card to inspect or assign')}
              </p>
              <div className="flex items-center gap-3 font-mono typo-helper text-slate-600 tabular-nums">
                <span>{tr(`${occupiedCount} Occupied`)}</span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-teal-700">{tr(`${vacantCount} Vacant`)}</span>
                <span aria-hidden="true">·</span>
                <span className={unpaidCount > 0 ? 'font-semibold text-red-700' : ''}>
                  {tr(`${unpaidCount} Unpaid`)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {beds.map((bed) => {
                const isSelected = bed.id === selectedBed.id;
                return (
                  <button
                    key={bed.id}
                    type="button"
                    onClick={() => setSelectedBedId(bed.id)}
                    className={`rounded-lg border p-3.5 text-left transition-colors ${
                      isSelected
                        ? 'border-teal-700 bg-teal-50/40'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono typo-body font-bold text-slate-900">
                        {tr(`Room ${bed.room}`)} · {tr(`Bed ${bed.bed}`)}
                      </span>
                      <span className="font-mono typo-helper font-medium text-slate-700 tabular-nums">
                        {formatInr(bed.tariff)}/{tr('mo')}
                      </span>
                    </div>

                    <p className="mt-1.5 typo-body font-medium text-slate-900 truncate">
                      {bed.status === 'occupied'
                        ? bed.guestName
                        : bed.status === 'vacant'
                          ? tr('Vacant — Ready to assign')
                          : tr('Under maintenance')}
                    </p>

                    <div className="mt-1 flex items-center gap-2 typo-helper text-slate-500">
                      <span
                        className={`capitalize ${
                          bed.status === 'vacant' ? 'font-medium text-teal-700' : ''
                        }`}
                      >
                        {tr(bed.status)}
                      </span>
                      {bed.status === 'occupied' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              bed.rentStatus === 'unpaid'
                                ? 'font-semibold text-red-700'
                                : 'text-teal-700 font-medium'
                            }
                          >
                            {bed.rentStatus === 'unpaid'
                              ? tr('Unpaid')
                              : tr(`Paid (${bed.receiptNo})`)}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="mt-4 border-t border-slate-200 pt-3 typo-helper text-slate-700 leading-relaxed">
              <span className="font-semibold text-slate-900">{tr('Activity:')} </span>
              {tr(activityNote)}
            </p>
          </div>

          {/* Right: Action Inspector */}
          <div className="p-5 sm:p-6 lg:col-span-5 bg-white flex flex-col justify-between">
            {selectedBed.status === 'vacant' ? (
              <form onSubmit={handleSandboxCheckIn} className="space-y-3.5">
                <div>
                  <p className="typo-helper font-semibold text-teal-700">{tr('Add Tenant')}</p>
                  <h3 className="mt-1 typo-card-title text-slate-900">
                    {tr('Assign')} {tr(`Room ${selectedBed.room}`)} · {tr(`Bed ${selectedBed.bed}`)} ({formatInr(selectedBed.tariff)}/{tr('mo')})
                  </h3>
                </div>

                <div>
                  <label htmlFor="sb-name" className="block typo-label text-slate-700">
                    {tr('Tenant Full Name')}
                  </label>
                  <input
                    id="sb-name"
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="sb-phone" className="block typo-label text-slate-700">
                    {tr('Primary Phone')}
                  </label>
                  <input
                    id="sb-phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-mono typo-input text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="sb-aadhaar" className="block typo-label text-slate-700">
                    {tr('Aadhaar Number (Auto-masked to last 4 digits)')}
                  </label>
                  <input
                    id="sb-aadhaar"
                    type="text"
                    value={aadhaarInput}
                    onChange={(e) => setAadhaarInput(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 font-mono typo-input text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                  <p className="mt-1 font-mono typo-helper text-slate-600">
                    {tr('Stored in desk as:')}{' '}
                    <span className="font-semibold text-slate-900">{maskAadhaarLive(aadhaarInput)}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="submit"
                    className="min-h-10 flex-1 rounded-md bg-teal-700 px-4 py-2 typo-btn font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
                  >
                    {tr('Check In & Assign Bed')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleMaintenance(selectedBed)}
                    className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 typo-btn text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                  >
                    {tr('Maintenance')}
                  </button>
                </div>
              </form>
            ) : selectedBed.status === 'maintenance' ? (
              <div className="space-y-4">
                <div>
                  <p className="typo-helper font-semibold uppercase tracking-wide text-slate-500">
                    {tr('Bed Under Maintenance')}
                  </p>
                  <h3 className="mt-1 typo-card-title text-slate-900">
                    {tr(`Room ${selectedBed.room}`)} · {tr(`Bed ${selectedBed.bed}`)}
                  </h3>
                  <p className="mt-1 typo-body text-slate-600">
                    {tr('Locked from new guest check-ins until plumbing or electrical work finishes.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleMaintenance(selectedBed)}
                  className="min-h-10 w-full rounded-md bg-slate-900 px-4 py-2 typo-btn font-semibold text-white hover:bg-slate-800"
                >
                  {tr('Mark Bed Vacant Now')}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="typo-helper font-semibold uppercase tracking-wide text-slate-500">
                    {tr('Active Stay Inspector')}
                  </p>
                  <h3 className="mt-1 typo-card-title text-slate-900">
                    {selectedBed.guestName}
                  </h3>
                  <p className="mt-0.5 font-mono typo-helper text-slate-600">
                    {tr(`Room ${selectedBed.room}-${selectedBed.bed}`)} · {selectedBed.phone}
                  </p>
                  <p className="mt-0.5 font-mono typo-helper text-slate-600">
                    {tr('ID Stored:')} {selectedBed.aadhaarMasked}
                  </p>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 typo-body space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">{tr('Monthly Rent')}</span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {formatInr(selectedBed.tariff)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">{tr('Status')}</span>
                    <span
                      className={`font-semibold ${
                        selectedBed.rentStatus === 'unpaid' ? 'text-red-700' : 'text-teal-700'
                      }`}
                    >
                      {selectedBed.rentStatus === 'paid'
                        ? tr(`Paid · Receipt ${selectedBed.receiptNo}`)
                        : tr('Unpaid · Due Today')}
                    </span>
                  </div>
                </div>

                {selectedBed.rentStatus === 'unpaid' ? (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => handleCollectRent(selectedBed)}
                      className="min-h-10 w-full rounded-md bg-teal-700 px-4 py-2 typo-btn font-semibold text-white hover:bg-teal-800"
                    >
                      {tr(`Collect ${formatInr(selectedBed.tariff)} UPI & Generate Receipt`)}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendSms(selectedBed)}
                      className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn text-slate-900 hover:bg-slate-50"
                    >
                      {selectedBed.smsSentAt
                        ? tr(`SMS Sent at ${selectedBed.smsSentAt} (24h Lock Active)`)
                        : tr('Send 1-Click SMS Reminder')}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-md border border-teal-200 bg-teal-50/50 px-3 py-2.5 typo-body font-medium text-teal-900">
                    <Check className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                    <span>{tr(`Settled with receipt ${selectedBed.receiptNo}. Zero dues left.`)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-12 items-center">
          <div className="space-y-5 lg:col-span-6">
            <div>
              <label htmlFor="calc-beds" className="flex justify-between typo-label font-semibold text-slate-900">
                <span>{tr('Total PG Beds You Manage')}</span>
                <span className="font-mono tabular-nums">{tr(`${calcBeds} beds`)}</span>
              </label>
              <input
                id="calc-beds"
                type="range"
                min={10}
                max={200}
                step={2}
                value={calcBeds}
                onChange={(e) => setCalcBeds(Number(e.target.value))}
                className="mt-2 w-full accent-teal-700"
              />
            </div>

            <div>
              <label htmlFor="calc-rent" className="flex justify-between typo-label font-semibold text-slate-900">
                <span>{tr('Average Rent Per Bed')}</span>
                <span className="font-mono tabular-nums">{formatInr(calcRent)}</span>
              </label>
              <input
                id="calc-rent"
                type="range"
                min={4000}
                max={20000}
                step={500}
                value={calcRent}
                onChange={(e) => setCalcRent(Number(e.target.value))}
                className="mt-2 w-full accent-teal-700"
              />
            </div>

            <p className="typo-helper text-slate-600 leading-relaxed">
              {tr(
                'Based on 2.5 unbilled turnaround days per vacant bed and 2.8% missed late-stay dues across paper registers.'
              )}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 lg:col-span-6 space-y-4">
            <div>
              <p className="typo-helper font-semibold uppercase tracking-wide text-slate-500">
                {tr('Annual Paper-Register Rent Loss')}
              </p>
              <p className="mt-1 font-mono text-3xl font-bold text-slate-900 tabular-nums">
                {formatInr(annualLeakage)} / {tr('year')}
              </p>
              <p className="mt-1 typo-helper text-slate-600 tabular-nums">
                {tr(`An ₹8,999 one-time license pays for itself in ${paybackDays} days.`)}
              </p>
            </div>

            <button
              type="button"
              onClick={onSelectBuy}
              className="min-h-10 w-full rounded-md bg-teal-700 px-4 py-2.5 typo-btn font-semibold text-white hover:bg-teal-800"
            >
              {tr(`Stop Losing ${formatInr(monthlyTurnoverLoss + monthlyUncollectedLoss)}/Month — Buy License`)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
