import { useEffect, useState, type FormEvent } from 'react';
import { Upload, X } from 'lucide-react';
import { api } from '../lib/api';
import { addOneMonthYmd, formatInr, toLocalDateTimeInput } from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';
import type { EnrichedBed, Guest, IdDocumentType, PaymentMode } from '../types/domain';

interface RegisterGuestModalProps {
  open: boolean;
  initialFlow?: 'guest_only' | 'check_in';
  preselectedBedId?: string | null;
  preselectedGuestId?: string | null;
  requireIdDocument: boolean;
  onClose: () => void;
  onSuccess: () => void;
  vacantBeds: EnrichedBed[];
  allBeds?: EnrichedBed[];
  existingGuests: Guest[];
}

export function RegisterGuestModal({
  open,
  initialFlow = 'check_in',
  preselectedBedId,
  preselectedGuestId,
  requireIdDocument,
  onClose,
  onSuccess,
  vacantBeds,
  allBeds = [],
  existingGuests,
}: RegisterGuestModalProps) {
  const { tr } = useLanguage();
  const [flow, setFlow] = useState<'check_in' | 'guest_only'>(initialFlow);
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [existingGuestId, setExistingGuestId] = useState('');

  const [fullName, setFullName] = useState('');
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [alternativePhone, setAlternativePhone] = useState('');
  const [currentAddress, setCurrentAddress] = useState('');
  const [permanentAddress, setPermanentAddress] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactRelation, setEmergencyContactRelation] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [idType, setIdType] = useState<IdDocumentType>('aadhaar');
  const [idNumber, setIdNumber] = useState('');
  const [consentGiven, setConsentGiven] = useState(true);
  const [consentNotes, setConsentNotes] = useState('');
  const [notes, setNotes] = useState('');

  const [stayStatus, setStayStatus] = useState<'active' | 'upcoming'>('active');
  const [bedId, setBedId] = useState('');
  const [purposeOfStay, setPurposeOfStay] = useState('Working Professional');
  const [checkInDate, setCheckInDate] = useState(() => toLocalDateTimeInput());
  const [expectedCheckoutDate, setExpectedCheckoutDate] = useState('');

  const [agreedAmount, setAgreedAmount] = useState('');
  const [initialPaymentStatus, setInitialPaymentStatus] = useState<
    'unpaid' | 'partially_paid' | 'paid'
  >('unpaid');
  const [initialPaidAmount, setInitialPaidAmount] = useState('');
  const [initialPaymentMode, setInitialPaymentMode] = useState<PaymentMode>('upi');
  const [initialDueDate, setInitialDueDate] = useState(() =>
    addOneMonthYmd(toLocalDateTimeInput())
  );
  const [initialReferenceNote, setInitialReferenceNote] = useState('');

  const [depositAmount, setDepositAmount] = useState('');
  const [depositMode, setDepositMode] = useState<PaymentMode>('upi');

  const [idFrontFile, setIdFrontFile] = useState<File | null>(null);
  const [idBackFile, setIdBackFile] = useState<File | null>(null);
  const [additionalIdFile, setAdditionalIdFile] = useState<File | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectableBeds =
    stayStatus === 'upcoming'
      ? allBeds.filter((b) => b.status !== 'maintenance')
      : vacantBeds;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFlow(initialFlow);
    setIdType('aadhaar');
    if (preselectedGuestId) {
      setMode('existing');
      setExistingGuestId(preselectedGuestId);
    } else {
      setMode('new');
      setExistingGuestId('');
    }
    if (preselectedBedId) {
      setStayStatus('active');
      const target =
        vacantBeds.find((b) => b.id === preselectedBedId) ||
        allBeds.find((b) => b.id === preselectedBedId);
      if (target) {
        setBedId(target.id);
        setAgreedAmount(String(target.monthlyTariff));
      }
    }
  }, [
    open,
    initialFlow,
    preselectedBedId,
    preselectedGuestId,
    requireIdDocument,
    vacantBeds,
    allBeds,
  ]);

  useEffect(() => {
    if (!open) return;
    if (selectableBeds.length > 0 && !selectableBeds.some((b) => b.id === bedId)) {
      setBedId(selectableBeds[0].id);
      setAgreedAmount(String(selectableBeds[0].monthlyTariff));
    }
  }, [open, selectableBeds, bedId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const handleBedChange = (nextBedId: string) => {
    setBedId(nextBedId);
    const chosen = selectableBeds.find((b) => b.id === nextBedId);
    if (chosen) {
      setAgreedAmount(String(chosen.monthlyTariff));
    }
  };

  const resetForm = () => {
    setFullName('');
    setPrimaryPhone('');
    setAlternativePhone('');
    setCurrentAddress('');
    setPermanentAddress('');
    setEmergencyContactName('');
    setEmergencyContactRelation('');
    setEmergencyContactPhone('');
    setIdNumber('');
    setConsentNotes('');
    setNotes('');
    const freshCheckIn = toLocalDateTimeInput();
    setCheckInDate(freshCheckIn);
    setExpectedCheckoutDate('');
    setInitialDueDate(addOneMonthYmd(freshCheckIn));
    setInitialPaidAmount('');
    setInitialReferenceNote('');
    setDepositAmount('');
    setIdFrontFile(null);
    setIdBackFile(null);
    setAdditionalIdFile(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (flow === 'guest_only' || mode === 'new') {
      if (!fullName.trim() || !primaryPhone.trim()) {
        setError(tr('Guest full name and primary phone are required.'));
        return;
      }
      if (primaryPhone.replace(/\D/g, '').length < 10) {
        setError(tr('Primary phone must contain at least 10 digits.'));
        return;
      }
      if (!currentAddress.trim()) {
        setError(tr('Local workplace / college address is required.'));
        return;
      }
      if (!permanentAddress.trim()) {
        setError(tr('Permanent / native address is required.'));
        return;
      }
      if (!emergencyContactName.trim() || !emergencyContactRelation.trim() || !emergencyContactPhone.trim()) {
        setError(tr('Emergency contact name, relation, and phone number are required.'));
        return;
      }
      if (emergencyContactPhone.replace(/\D/g, '').length < 10) {
        setError(tr('Emergency contact phone must contain at least 10 digits.'));
        return;
      }
      if (idType === 'none' || !idNumber.trim()) {
        setError(tr('Guest government ID type and ID number are required.'));
        return;
      }
      if (idType === 'aadhaar') {
        const digits = idNumber.replace(/[\s-]/g, '');
        if (!/^\d{12}$/.test(digits)) {
          setError(tr('Aadhaar number must be 12 digits (only last 4 digits are stored).'));
          return;
        }
      } else if (idNumber.replace(/[\s-]/g, '').length < 4) {
        setError(tr('Please enter at least 4 characters for the ID document number.'));
        return;
      }
      if (requireIdDocument && flow === 'check_in' && !idFrontFile) {
        setError(tr('Workspace settings require an ID front scan upload at check-in.'));
        return;
      }
    }

    if (flow === 'guest_only' || mode === 'new') {
      if (!consentGiven) {
        setError(tr('Guest acknowledgment & record consent checkbox is required.'));
        return;
      }
    }

    if (flow === 'guest_only') {
      setSubmitting(true);
      try {
        await api.createGuest({
          fullName: fullName.trim(),
          primaryPhone: primaryPhone.trim(),
          alternativePhone: alternativePhone.trim(),
          currentAddress: currentAddress.trim(),
          permanentAddress: permanentAddress.trim(),
          emergencyContactName: emergencyContactName.trim(),
          emergencyContactRelation: emergencyContactRelation.trim(),
          emergencyContactPhone: emergencyContactPhone.trim(),
          idType,
          idNumber: idNumber.trim(),
          consentGiven,
          consentNotes: consentNotes.trim(),
          notes: notes.trim(),
        });
        resetForm();
        onSuccess();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? tr(err.message) : tr('Failed to create guest.'));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (mode === 'existing' && !existingGuestId) {
      setError(tr('Please select an existing guest.'));
      return;
    }
    if (!bedId) {
      setError(tr('Please select a room and bed.'));
      return;
    }
    if (!purposeOfStay.trim()) {
      setError(tr('Purpose of stay is required.'));
      return;
    }
    if (!checkInDate) {
      setError(tr('Check-in date is required.'));
      return;
    }
    if (expectedCheckoutDate && expectedCheckoutDate < checkInDate.slice(0, 10)) {
      setError(tr('Expected checkout date cannot be earlier than check-in date.'));
      return;
    }
    const parsedRent = Number(agreedAmount);
    if (!Number.isFinite(parsedRent) || parsedRent <= 0) {
      setError(tr('Stay rent / fee must be greater than ₹0.'));
      return;
    }
    if (initialPaymentStatus === 'partially_paid') {
      const parsedAdvance = Number(initialPaidAmount);
      if (!Number.isFinite(parsedAdvance) || parsedAdvance <= 0 || parsedAdvance >= parsedRent) {
        setError(tr('Advance collected must be greater than ₹0 and less than total stay rent.'));
        return;
      }
    }
    if (initialPaymentStatus === 'unpaid' && !initialDueDate.trim()) {
      setError(tr('Rent due date is required when initial rent status is unpaid.'));
      return;
    }

    const fd = new FormData();
    if (mode === 'existing') {
      fd.append('existingGuestId', existingGuestId);
    } else {
      fd.append('fullName', fullName.trim());
      fd.append('primaryPhone', primaryPhone.trim());
      fd.append('alternativePhone', alternativePhone.trim());
      fd.append('currentAddress', currentAddress.trim());
      fd.append('permanentAddress', permanentAddress.trim());
      fd.append('emergencyContactName', emergencyContactName.trim());
      fd.append('emergencyContactRelation', emergencyContactRelation.trim());
      fd.append('emergencyContactPhone', emergencyContactPhone.trim());
      fd.append('idType', idType);
      fd.append('idNumber', idNumber.trim());
      fd.append('consentGiven', String(consentGiven));
      fd.append('consentNotes', consentNotes.trim());
      fd.append('notes', notes.trim());
    }

    fd.append('stayStatus', stayStatus);
    fd.append('bedId', bedId);
    fd.append('purposeOfStay', purposeOfStay);
    fd.append('checkInAt', new Date(checkInDate).toISOString());
    fd.append('expectedCheckoutDate', expectedCheckoutDate);
    fd.append('agreedAmount', agreedAmount || '0');
    fd.append('initialPaymentStatus', initialPaymentStatus);
    if (initialPaymentStatus === 'partially_paid') {
      fd.append('initialPaidAmount', initialPaidAmount || '0');
    }
    fd.append('initialPaymentMode', initialPaymentMode);
    fd.append('initialDueDate', initialDueDate);
    fd.append('initialReferenceNote', initialReferenceNote.trim());
    if (Number(depositAmount) > 0) {
      fd.append('depositAmount', depositAmount);
      fd.append('depositMode', depositMode);
    }

    if (idFrontFile) fd.append('idFront', idFrontFile);
    if (idBackFile) fd.append('idBack', idBackFile);
    if (additionalIdFile) fd.append('additionalId', additionalIdFile);

    setSubmitting(true);
    try {
      await api.registerGuest(fd);
      resetForm();
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Registration failed.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="register-guest-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="register-guest-title" className="typo-section-heading text-slate-900">
              {flow === 'guest_only' ? tr('Add Guest Profile') : tr('Guest Check-in & Stay Assignment')}
            </h2>
            <p className="mt-0.5 typo-helper text-slate-500">
              {tr('Record required guest identity, contact details, stay schedule, and refundable security deposit.')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label={tr('Close registration modal')}
            className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-6">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 typo-body text-red-800">
              {tr(error)}
            </div>
          )}

          {/* Flow Switch: Full Check-in vs Add Guest Profile Only */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 w-fit">
              <button
                type="button"
                onClick={() => setFlow('check_in')}
                className={`rounded px-3 py-1.5 typo-btn transition-colors whitespace-nowrap ${
                  flow === 'check_in'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tr('Check In / Reserve Bed')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFlow('guest_only');
                  setMode('new');
                }}
                className={`rounded px-3 py-1.5 typo-btn transition-colors whitespace-nowrap ${
                  flow === 'guest_only'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tr('Add Guest Profile Only')}
              </button>
            </div>

            {flow === 'check_in' && (
              <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1 w-fit">
                <button
                  type="button"
                  onClick={() => setMode('new')}
                  className={`rounded px-3 py-1.5 typo-btn transition-colors whitespace-nowrap ${
                    mode === 'new'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tr('New Guest')}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('existing')}
                  className={`rounded px-3 py-1.5 typo-btn transition-colors whitespace-nowrap ${
                    mode === 'existing'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tr('Returning Guest')} ({existingGuests.length})
                </button>
              </div>
            )}
          </div>

          {flow === 'check_in' && mode === 'existing' ? (
            <div>
              <label
                htmlFor="existing-guest-select"
                className="block typo-label text-slate-800"
              >
                {tr('Select Existing Guest')} <span className="text-red-600">*</span>
              </label>
              <select
                id="existing-guest-select"
                value={existingGuestId}
                onChange={(e) => setExistingGuestId(e.target.value)}
                required
                className="mt-1.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input text-slate-900 focus:border-teal-700 focus:outline-none"
              >
                <option value="">{tr('Choose guest...')}</option>
                {existingGuests.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.fullName} · {g.primaryPhone} {g.idMasked ? `· ${g.idMasked}` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <section className="space-y-4">
                <h3 className="typo-card-title text-slate-900 border-b border-slate-100 pb-2">
                  {tr('Guest Identity & Contact')}
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="reg-full-name" className="block typo-label text-slate-700">
                      {tr('Full Name')} <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="reg-full-name"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={tr('e.g., Vigneshwaran M')}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-primary-phone" className="block typo-label text-slate-700">
                      {tr('Primary Phone')} <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="reg-primary-phone"
                      type="tel"
                      required
                      value={primaryPhone}
                      onChange={(e) => setPrimaryPhone(e.target.value)}
                      placeholder="+91 98400 00000"
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-alt-phone" className="block typo-label text-slate-700">
                      {tr('Alternate / Parent Phone (optional)')}
                    </label>
                    <input
                      id="reg-alt-phone"
                      type="tel"
                      value={alternativePhone}
                      onChange={(e) => setAlternativePhone(e.target.value)}
                      placeholder="+91 94430 00000"
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-curr-addr" className="block typo-label text-slate-700">
                      {tr('Local Workplace / College Address')} <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="reg-curr-addr"
                      type="text"
                      required
                      value={currentAddress}
                      onChange={(e) => setCurrentAddress(e.target.value)}
                      placeholder={tr('OMR, Guindy, TIDEL Park...')}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-perm-addr" className="block typo-label text-slate-700">
                      {tr('Native / Permanent Address')} <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="reg-perm-addr"
                      type="text"
                      required
                      value={permanentAddress}
                      onChange={(e) => setPermanentAddress(e.target.value)}
                      placeholder={tr('District, Tamil Nadu, PIN')}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="reg-em-name" className="block typo-label text-slate-700">
                      {tr('Emergency Contact Name')} <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="reg-em-name"
                      type="text"
                      required
                      value={emergencyContactName}
                      onChange={(e) => setEmergencyContactName(e.target.value)}
                      placeholder={tr('Parent / Guardian')}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-em-rel" className="block typo-label text-slate-700">
                      {tr('Relation')} <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="reg-em-rel"
                      type="text"
                      required
                      value={emergencyContactRelation}
                      onChange={(e) => setEmergencyContactRelation(e.target.value)}
                      placeholder={tr('Father / Mother')}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-em-phone" className="block typo-label text-slate-700">
                      {tr('Emergency Phone')} <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="reg-em-phone"
                      type="tel"
                      required
                      value={emergencyContactPhone}
                      onChange={(e) => setEmergencyContactPhone(e.target.value)}
                      placeholder="+91 98..."
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="typo-card-title text-slate-900 border-b border-slate-100 pb-2">
                  {tr('Guest Identity & Consent (Required)')}
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="reg-id-type" className="block typo-label text-slate-700">
                      {tr('ID Document Type')} <span className="text-red-600">*</span>
                    </label>
                    <select
                      id="reg-id-type"
                      required
                      value={idType}
                      onChange={(e) => setIdType(e.target.value as IdDocumentType)}
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                    >
                      <option value="aadhaar">{tr('Aadhaar Card')}</option>
                      <option value="passport">{tr('Passport')}</option>
                      <option value="driving_licence">{tr('Driving Licence')}</option>
                      <option value="voter_id">{tr('Voter ID')}</option>
                      <option value="other">{tr('Other Government ID')}</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="reg-id-num" className="block typo-label text-slate-700">
                      {tr('ID Number (only last 4 digits saved)')} <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="reg-id-num"
                      type="text"
                      required
                      value={idNumber}
                      onChange={(e) => setIdNumber(e.target.value)}
                      placeholder={
                        idType === 'aadhaar'
                          ? tr('12-digit Aadhaar number')
                          : tr('Government ID number')
                      }
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                </div>

                {flow === 'check_in' && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label htmlFor="reg-doc-front" className="block typo-label text-slate-700">
                        {tr('ID Front')} {requireIdDocument ? <span className="text-red-600">*</span> : tr('(optional)')}
                      </label>
                      <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 typo-body text-slate-700 hover:bg-slate-100">
                        <Upload className="h-4 w-4 shrink-0 text-slate-500" />
                        <span className="truncate">
                          {idFrontFile ? idFrontFile.name : tr('Choose front file')}
                        </span>
                        <input
                          id="reg-doc-front"
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,.pdf"
                          className="sr-only"
                          onChange={(e) => setIdFrontFile(e.target.files?.[0] || null)}
                        />
                      </label>
                    </div>
                    <div>
                      <label htmlFor="reg-doc-back" className="block typo-label text-slate-700">
                        {tr('ID Back (optional)')}
                      </label>
                      <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 typo-body text-slate-700 hover:bg-slate-100">
                        <Upload className="h-4 w-4 shrink-0 text-slate-500" />
                        <span className="truncate">
                          {idBackFile ? idBackFile.name : tr('Choose back file')}
                        </span>
                        <input
                          id="reg-doc-back"
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,.pdf"
                          className="sr-only"
                          onChange={(e) => setIdBackFile(e.target.files?.[0] || null)}
                        />
                      </label>
                    </div>
                    <div>
                      <label htmlFor="reg-doc-extra" className="block typo-label text-slate-700">
                        {tr('College / Office ID')}
                      </label>
                      <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 typo-body text-slate-700 hover:bg-slate-100">
                        <Upload className="h-4 w-4 shrink-0 text-slate-500" />
                        <span className="truncate">
                          {additionalIdFile ? additionalIdFile.name : tr('Choose extra file')}
                        </span>
                        <input
                          id="reg-doc-extra"
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,.pdf"
                          className="sr-only"
                          onChange={(e) => setAdditionalIdFile(e.target.files?.[0] || null)}
                        />
                      </label>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 items-center rounded-md bg-slate-50 p-3">
                  <label className="flex items-center gap-2 typo-label text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={consentGiven}
                      onChange={(e) => setConsentGiven(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-teal-700"
                    />
                    <span>
                      {tr('Guest acknowledged hostel rules & record consent')}{' '}
                      <span className="text-red-600">*</span>
                    </span>
                  </label>
                  <input
                    type="text"
                    value={consentNotes}
                    onChange={(e) => setConsentNotes(e.target.value)}
                    placeholder={tr('Consent note (e.g., Signed desk register)')}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </section>
            </>
          )}

          {/* Stay & Bed Assignment */}
          {flow === 'check_in' && (
            <section className="space-y-4">
              <h3 className="typo-card-title text-slate-900 border-b border-slate-100 pb-2">
                {tr('Stay Assignment, Rent & Security Deposit')}
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="reg-stay-status" className="block typo-label text-slate-700">
                    {tr('Stay Type')} <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="reg-stay-status"
                    required
                    value={stayStatus}
                    onChange={(e) => setStayStatus(e.target.value as 'active' | 'upcoming')}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  >
                    <option value="active">{tr('Check In Now (Active)')}</option>
                    <option value="upcoming">{tr('Upcoming Reservation')}</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="reg-bed" className="block typo-label text-slate-700">
                    {tr('Room & Bed')} <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="reg-bed"
                    required
                    value={bedId}
                    onChange={(e) => handleBedChange(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  >
                    {selectableBeds.length === 0 ? (
                      <option value="">{tr('No eligible beds available')}</option>
                    ) : (
                      selectableBeds.map((b) => (
                        <option key={b.id} value={b.id}>
                          {tr('Room')} {b.roomNumber} · {tr('Bed')} {b.bedLabel} ({tr(b.roomType)} · {formatInr(b.monthlyTariff)}
                          {b.status === 'occupied' ? ` · ${tr('Currently Occupied')}` : ''})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="reg-purpose" className="block typo-label text-slate-700">
                    {tr('Purpose of Stay')} <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="reg-purpose"
                    required
                    value={purposeOfStay}
                    onChange={(e) => setPurposeOfStay(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  >
                    <option value="Working Professional">{tr('Working Professional')}</option>
                    <option value="Student">{tr('Student')}</option>
                    <option value="Internship">{tr('Internship')}</option>
                    <option value="Job Search">{tr('Job Search')}</option>
                    <option value="Other">{tr('Other')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="reg-checkin" className="block typo-label text-slate-700">
                    {tr('Check-in Date & Time')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="reg-checkin"
                    type="datetime-local"
                    required
                    value={checkInDate}
                    onChange={(e) => {
                      const nextCheckIn = e.target.value;
                      setCheckInDate(nextCheckIn);
                      if (nextCheckIn) {
                        setInitialDueDate(addOneMonthYmd(nextCheckIn));
                      }
                    }}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="reg-checkout" className="block typo-label text-slate-700">
                    {tr('Expected Checkout Date (optional)')}
                  </label>
                  <input
                    id="reg-checkout"
                    type="date"
                    value={expectedCheckoutDate}
                    onChange={(e) => setExpectedCheckoutDate(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="reg-amount" className="block typo-label text-slate-700">
                    {tr('Stay Rent / Fee (₹)')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="reg-amount"
                    type="number"
                    required
                    min={1}
                    value={agreedAmount}
                    onChange={(e) => setAgreedAmount(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="reg-pay-status" className="block typo-label text-slate-700">
                    {tr('Initial Rent Status')} <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="reg-pay-status"
                    required
                    value={initialPaymentStatus}
                    onChange={(e) =>
                      setInitialPaymentStatus(
                        e.target.value as 'unpaid' | 'partially_paid' | 'paid'
                      )
                    }
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  >
                    <option value="unpaid">{tr('Mark Unpaid (Due Date)')}</option>
                    <option value="partially_paid">{tr('Partially Paid (Advance)')}</option>
                    <option value="paid">{tr('Paid in Full Now')}</option>
                  </select>
                </div>
                {initialPaymentStatus === 'partially_paid' ? (
                  <div>
                    <label htmlFor="reg-partial-amt" className="block typo-label text-slate-700">
                      {tr('Advance Collected (₹)')} <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="reg-partial-amt"
                      type="number"
                      required
                      min={1}
                      value={initialPaidAmount}
                      onChange={(e) => setInitialPaidAmount(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                ) : initialPaymentStatus === 'paid' ? (
                  <div>
                    <label htmlFor="reg-pay-mode" className="block typo-label text-slate-700">
                      {tr('Payment Mode')} <span className="text-red-600">*</span>
                    </label>
                    <select
                      id="reg-pay-mode"
                      required
                      value={initialPaymentMode}
                      onChange={(e) =>
                        setInitialPaymentMode(e.target.value as PaymentMode)
                      }
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                    >
                      <option value="upi">{tr('UPI')}</option>
                      <option value="cash">{tr('Cash')}</option>
                      <option value="bank_transfer">{tr('Bank Transfer')}</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label htmlFor="reg-due-date" className="block typo-label text-slate-700">
                      {tr('Rent Due Date')} <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="reg-due-date"
                      type="date"
                      required
                      value={initialDueDate}
                      onChange={(e) => setInitialDueDate(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
                    />
                    <p className="mt-1 typo-helper text-slate-500">
                      {tr('Auto-set to 1 month after check-in (editable).')}
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="reg-dep-amt" className="block typo-label text-slate-700">
                    {tr('Refundable Deposit (₹, optional)')}
                  </label>
                  <input
                    id="reg-dep-amt"
                    type="number"
                    min={0}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder={tr('e.g., 10000')}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="reg-dep-mode" className="block typo-label text-slate-700">
                    {tr('Deposit Mode')}
                  </label>
                  <select
                    id="reg-dep-mode"
                    value={depositMode}
                    onChange={(e) => setDepositMode(e.target.value as PaymentMode)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  >
                    <option value="upi">{tr('UPI')}</option>
                    <option value="cash">{tr('Cash')}</option>
                    <option value="bank_transfer">{tr('Bank Transfer')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="reg-ref-note" className="block typo-label text-slate-700">
                    {tr('Payment Reference / Note')}
                  </label>
                  <input
                    id="reg-ref-note"
                    type="text"
                    value={initialReferenceNote}
                    onChange={(e) => setInitialReferenceNote(e.target.value)}
                    placeholder={tr('UTR or desk receipt note')}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
            </section>
          )}

          {mode === 'new' && (
            <div>
              <label htmlFor="reg-notes" className="block typo-label text-slate-700">
                {tr('Warden Notes (Optional)')}
              </label>
              <input
                id="reg-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={tr('Shift timing, food preference, two-wheeler number...')}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
              />
            </div>
          )}

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
              disabled={submitting || (flow === 'check_in' && selectableBeds.length === 0)}
              className="min-h-10 rounded-md bg-teal-700 px-5 py-2 typo-btn text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {submitting
                ? tr('Saving...')
                : flow === 'guest_only'
                  ? tr('Save Guest Profile')
                  : stayStatus === 'upcoming'
                    ? tr('Save Reservation')
                    : tr('Complete Check-in')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
