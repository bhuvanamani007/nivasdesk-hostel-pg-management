import { useEffect, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Pencil,
  PhoneCall,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { api, type GuestProfilePayload } from '../lib/api';
import {
  formatBytes,
  formatDateShort,
  formatDateTime,
  formatInr,
  ID_TYPE_LABELS,
} from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';
import type {
  DocumentRole,
  EnrichedDocument,
  GuestStatus,
  IdDocumentType,
  UserRole,
} from '../types/domain';
import { ConfirmDialog } from './ConfirmDialog';
import {
  DepositStatusIndicator,
  GuestStatusIndicator,
  PaymentStatusIndicator,
  StayStatusIndicator,
  VerificationStatusIndicator,
} from './StatusLabel';

interface GuestProfileDrawerProps {
  guestId: string | null;
  userRole: UserRole;
  onClose: () => void;
  onDataChanged: () => void;
  onCheckInGuest?: (guestId: string) => void;
  onPreviewDocument: (doc: EnrichedDocument) => void;
}

export function GuestProfileDrawer({
  guestId,
  userRole,
  onClose,
  onDataChanged,
  onCheckInGuest,
  onPreviewDocument,
}: GuestProfileDrawerProps) {
  const { tr } = useLanguage();
  const isOwner = userRole === 'owner' || userRole === 'overall_admin';

  const [profile, setProfile] = useState<GuestProfilePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPrimaryPhone, setEditPrimaryPhone] = useState('');
  const [editAltPhone, setEditAltPhone] = useState('');
  const [editCurrentAddr, setEditCurrentAddr] = useState('');
  const [editPermanentAddr, setEditPermanentAddr] = useState('');
  const [editEmName, setEditEmName] = useState('');
  const [editEmRel, setEditEmRel] = useState('');
  const [editEmPhone, setEditEmPhone] = useState('');
  const [editIdType, setEditIdType] = useState<IdDocumentType>('none');
  const [editIdNumber, setEditIdNumber] = useState('');
  const [editStatus, setEditStatus] = useState<GuestStatus>('active');
  const [editConsentGiven, setEditConsentGiven] = useState(false);
  const [editConsentNotes, setEditConsentNotes] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);

  const [callBusy, setCallBusy] = useState(false);
  const [callFeedback, setCallFeedback] = useState<string | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState('');

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [uploadDocOpen, setUploadDocOpen] = useState(false);
  const [uploadIdType, setUploadIdType] = useState<IdDocumentType>('aadhaar');
  const [uploadDocRole, setUploadDocRole] = useState<DocumentRole>('id_front');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  const syncEditFields = (res: GuestProfilePayload) => {
    const g = res.guest;
    setEditFullName(g.fullName);
    setEditPrimaryPhone(g.primaryPhone);
    setEditAltPhone(g.alternativePhone || '');
    setEditCurrentAddr(g.currentAddress || '');
    setEditPermanentAddr(g.permanentAddress || '');
    setEditEmName(g.emergencyContactName || '');
    setEditEmRel(g.emergencyContactRelation || '');
    setEditEmPhone(g.emergencyContactPhone || '');
    setEditIdType(g.idType === 'none' ? 'aadhaar' : g.idType || 'aadhaar');
    setEditIdNumber('');
    setEditStatus(g.status || 'active');
    setEditConsentGiven(Boolean(g.consentGiven));
    setEditConsentNotes(g.consentNotes || '');
    setEditNotes(g.notes || '');
  };

  const loadProfile = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getGuestProfile(id);
      setProfile(res);
      syncEditFields(res);
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Failed to load guest profile.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!guestId) {
      setProfile(null);
      setEditing(false);
      return;
    }
    setCallFeedback(null);
    setEditing(false);
    loadProfile(guestId);
  }, [guestId]);

  useEffect(() => {
    if (!guestId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [guestId, onClose]);

  if (!guestId) return null;

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    if (!editFullName.trim() || editPrimaryPhone.replace(/\D/g, '').length < 10) {
      setError(tr('Full name and a valid 10-digit primary phone are required.'));
      return;
    }
    if (!editCurrentAddr.trim()) {
      setError(tr('Local workplace / college address is required.'));
      return;
    }
    if (!editPermanentAddr.trim()) {
      setError(tr('Permanent address is required.'));
      return;
    }
    if (!editEmName.trim() || !editEmRel.trim() || editEmPhone.replace(/\D/g, '').length < 10) {
      setError(tr('Emergency contact name, relation, and 10-digit emergency phone are required.'));
      return;
    }
    if (editIdType === 'none') {
      setError(tr('Please select a government ID document type.'));
      return;
    }
    const needsIdNumber =
      !profile.guest.idMasked || profile.guest.idType === 'none' || editIdType !== profile.guest.idType;
    if (needsIdNumber && !editIdNumber.trim()) {
      setError(tr('ID number is required for the selected identity document.'));
      return;
    }
    if (editIdNumber.trim()) {
      if (editIdType === 'aadhaar' && !/^\d{12}$/.test(editIdNumber.replace(/[\s-]/g, ''))) {
        setError(tr('Aadhaar number must be 12 digits (only last 4 digits are saved).'));
        return;
      }
      if (editIdType !== 'aadhaar' && editIdNumber.replace(/[\s-]/g, '').length < 4) {
        setError(tr('ID number must be at least 4 characters.'));
        return;
      }
    }
    setSaveBusy(true);
    try {
      await api.updateGuest(profile.guest.id, {
        fullName: editFullName.trim(),
        primaryPhone: editPrimaryPhone.trim(),
        alternativePhone: editAltPhone.trim(),
        currentAddress: editCurrentAddr.trim(),
        permanentAddress: editPermanentAddr.trim(),
        emergencyContactName: editEmName.trim(),
        emergencyContactRelation: editEmRel.trim(),
        emergencyContactPhone: editEmPhone.trim(),
        idType: editIdType,
        idNumber: editIdNumber.trim() || undefined,
        status: editStatus,
        consentGiven: editConsentGiven,
        consentNotes: editConsentNotes.trim(),
        notes: editNotes.trim(),
      });
      setEditing(false);
      await loadProfile(profile.guest.id);
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Failed to update guest.'));
    } finally {
      setSaveBusy(false);
    }
  };

  const handleDeleteGuest = async () => {
    if (!profile || !isOwner) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await api.deleteGuest(profile.guest.id);
      setConfirmDeleteOpen(false);
      onDataChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Could not delete guest.'));
      setConfirmDeleteOpen(false);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleInitiateCall = async () => {
    if (!profile) return;
    setCallBusy(true);
    setCallFeedback(null);
    try {
      const res = await api.initiateVerificationCall(profile.guest.id, outcomeNotes.trim());
      setCallFeedback(tr(res.message));
      await loadProfile(profile.guest.id);
      onDataChanged();
    } catch (err) {
      setCallFeedback(err instanceof Error ? tr(err.message) : tr('Call initiation failed.'));
    } finally {
      setCallBusy(false);
    }
  };

  const handleUploadDoc = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || !uploadFile) return;
    setUploadBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('guestId', profile.guest.id);
      fd.append('idType', uploadIdType);
      fd.append('docRole', uploadDocRole);
      fd.append('file', uploadFile);
      await api.uploadDocument(fd);
      setUploadFile(null);
      setUploadDocOpen(false);
      await loadProfile(profile.guest.id);
      onDataChanged();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Failed to upload ID document.'));
    } finally {
      setUploadBusy(false);
    }
  };

  const handleUpdateCallOutcome = async (
    attemptId: string,
    outcome: 'verified' | 'no_answer' | 'wrong_number' | 'busy'
  ) => {
    if (!profile) return;
    setCallBusy(true);
    try {
      await api.updateCallAttemptOutcome(attemptId, outcome, outcomeNotes.trim() || undefined);
      setOutcomeNotes('');
      await loadProfile(profile.guest.id);
      onDataChanged();
    } catch (err) {
      setCallFeedback(err instanceof Error ? tr(err.message) : tr('Failed to update outcome.'));
    } finally {
      setCallBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-900/40"
      role="dialog"
      aria-modal="true"
      aria-label={tr('Guest profile')}
    >
      <div className="flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="truncate typo-section-heading text-slate-900">
                {profile ? profile.guest.fullName : tr('Guest Profile')}
              </h2>
              {profile && <GuestStatusIndicator status={profile.guest.status || 'active'} />}
            </div>
            {profile && (
              <p className="mt-0.5 typo-helper text-slate-500">
                {tr(ID_TYPE_LABELS[profile.guest.idType])} ·{' '}
                <span className="font-mono">{profile.guest.idMasked || tr('No ID number recorded')}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {profile &&
              onCheckInGuest &&
              !profile.stays.some((s) => s.status === 'active' || s.status === 'overdue') && (
                <button
                  type="button"
                  onClick={() => onCheckInGuest(profile.guest.id)}
                  className="inline-flex items-center gap-1 rounded-md bg-teal-700 px-2.5 py-1.5 typo-btn text-white hover:bg-teal-800 whitespace-nowrap"
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tr('Check In')}</span>
                </button>
              )}
            {profile && (
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{editing ? tr('Cancel Edit') : tr('Edit Profile')}</span>
              </button>
            )}
            {profile && isOwner && (
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                title={tr('Delete guest and purge private ID documents (Owner only)')}
                aria-label={tr('Delete guest')}
                className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={tr('Close guest profile')}
              className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading && !profile && (
            <div className="space-y-4">
              <div className="h-24 animate-pulse rounded-md bg-slate-100" />
              <div className="h-32 animate-pulse rounded-md bg-slate-100" />
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 typo-body text-red-800">
              {tr(error)}
            </div>
          )}

          {profile && editing && (
            <form
              onSubmit={handleSaveProfile}
              className="rounded-lg border border-teal-200 bg-teal-50/30 p-4 space-y-3"
            >
              <h3 className="typo-card-title text-teal-900">
                {tr('Edit Guest Details & Consent')}
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block typo-label text-slate-700">
                    {tr('Full Name')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="mt-1 block w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-input"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">{tr('Guest Status')}</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as GuestStatus)}
                    className="mt-1 block w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-input"
                  >
                    <option value="active">{tr('Active Resident')}</option>
                    <option value="former">{tr('Former')}</option>
                    <option value="inactive">{tr('Inactive')}</option>
                  </select>
                </div>
                <div>
                  <label className="block typo-label text-slate-700">
                    {tr('Primary Phone')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={editPrimaryPhone}
                    onChange={(e) => setEditPrimaryPhone(e.target.value)}
                    className="mt-1 block w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-input font-mono"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">{tr('Alternate Phone')}</label>
                  <input
                    type="tel"
                    value={editAltPhone}
                    onChange={(e) => setEditAltPhone(e.target.value)}
                    className="mt-1 block w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-input font-mono"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">
                    {tr('Local Workplace / College Address')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editCurrentAddr}
                    onChange={(e) => setEditCurrentAddr(e.target.value)}
                    className="mt-1 block w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-input"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">
                    {tr('Permanent Address')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editPermanentAddr}
                    onChange={(e) => setEditPermanentAddr(e.target.value)}
                    className="mt-1 block w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-input"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">
                    {tr('Emergency Contact')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editEmName}
                    onChange={(e) => setEditEmName(e.target.value)}
                    className="mt-1 block w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-input"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block typo-label text-slate-700">
                      {tr('Relation')} <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={editEmRel}
                      onChange={(e) => setEditEmRel(e.target.value)}
                      className="mt-1 block w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-input"
                    />
                  </div>
                  <div>
                    <label className="block typo-label text-slate-700">
                      {tr('Em. Phone')} <span className="text-red-600">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      value={editEmPhone}
                      onChange={(e) => setEditEmPhone(e.target.value)}
                      className="mt-1 block w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-input font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block typo-label text-slate-700">
                    {tr('ID Type')} <span className="text-red-600">*</span>
                  </label>
                  <select
                    required
                    value={editIdType}
                    onChange={(e) => setEditIdType(e.target.value as IdDocumentType)}
                    className="mt-1 block w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-input"
                  >
                    <option value="aadhaar">{tr('Aadhaar')}</option>
                    <option value="passport">{tr('Passport')}</option>
                    <option value="driving_licence">{tr('Driving Licence')}</option>
                    <option value="voter_id">{tr('Voter ID')}</option>
                    <option value="other">{tr('Other')}</option>
                  </select>
                </div>
                <div>
                  <label className="block typo-label text-slate-700">
                    {tr('ID Number')}{' '}
                    {(!profile.guest.idMasked || editIdType !== profile.guest.idType) && (
                      <span className="text-red-600">*</span>
                    )}
                  </label>
                  <input
                    type="text"
                    required={!profile.guest.idMasked || editIdType !== profile.guest.idType}
                    value={editIdNumber}
                    onChange={(e) => setEditIdNumber(e.target.value)}
                    placeholder={
                      profile.guest.idMasked && editIdType === profile.guest.idType
                        ? tr('Leave blank to keep existing')
                        : editIdType === 'aadhaar'
                          ? tr('Enter 12-digit Aadhaar')
                          : tr('Enter ID number')
                    }
                    className="mt-1 block w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-input font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 items-center pt-1">
                <label className="flex items-center gap-2 typo-label text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editConsentGiven}
                    onChange={(e) => setEditConsentGiven(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-teal-700"
                  />
                  <span>{tr('Consent Recorded')}</span>
                </label>
                <input
                  type="text"
                  value={editConsentNotes}
                  onChange={(e) => setEditConsentNotes(e.target.value)}
                  placeholder={tr('Consent notes...')}
                  className="rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-input"
                />
              </div>

              <div>
                <label className="block typo-label text-slate-700">{tr('Warden Notes')}</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="mt-1 block w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-input"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 typo-btn text-slate-700"
                >
                  {tr('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saveBusy}
                  className="rounded bg-teal-700 px-3.5 py-1.5 typo-btn text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {saveBusy ? tr('Saving...') : tr('Save Changes')}
                </button>
              </div>
            </form>
          )}

          {profile && (
            <>
              {/* Identity & Emergency Contact */}
              <section className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="typo-card-title text-slate-700">
                    {tr('Identity, Contact & Consent Details')}
                  </h3>
                  <VerificationStatusIndicator status={profile.guest.altPhoneVerified} />
                </div>

                <div className="grid grid-cols-1 gap-3 typo-body sm:grid-cols-2">
                  <div>
                    <p className="typo-helper text-slate-500">{tr('Identity Document')}</p>
                    <p className="typo-body font-medium text-slate-900">
                      {tr(ID_TYPE_LABELS[profile.guest.idType])}
                    </p>
                    <p className="font-mono typo-helper text-slate-600">
                      {profile.guest.idMasked || tr('ID number pending — click Edit to complete')}
                    </p>
                  </div>
                  <div>
                    <p className="typo-helper text-slate-500">{tr('Primary Phone')}</p>
                    <p className="font-mono text-slate-900">{profile.guest.primaryPhone}</p>
                  </div>
                  <div>
                    <p className="typo-helper text-slate-500">{tr('Alternate / Parent Phone')}</p>
                    <p className="font-mono text-slate-900">
                      {profile.guest.alternativePhone || tr('Not provided')}
                    </p>
                  </div>
                  <div>
                    <p className="typo-helper text-slate-500">{tr('Emergency Contact')}</p>
                    <p className="text-slate-900">
                      {profile.guest.emergencyContactName || '—'}{' '}
                      {profile.guest.emergencyContactRelation
                        ? `(${profile.guest.emergencyContactRelation})`
                        : ''}
                    </p>
                    <p className="font-mono typo-helper text-slate-600">
                      {profile.guest.emergencyContactPhone || ''}
                    </p>
                  </div>
                  <div>
                    <p className="typo-helper text-slate-500">{tr('Permanent Address')}</p>
                    <p className="typo-body leading-relaxed text-slate-700">
                      {profile.guest.permanentAddress || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="typo-helper text-slate-500">{tr('Local Workplace / College')}</p>
                    <p className="typo-body leading-relaxed text-slate-700">
                      {profile.guest.currentAddress || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="typo-helper text-slate-500">{tr('Record Consent')}</p>
                    <p className="typo-body text-slate-800">
                      {profile.guest.consentGiven ? tr('Consent recorded') : tr('Pending consent')}
                      {profile.guest.consentNotes ? ` — ${profile.guest.consentNotes}` : ''}
                    </p>
                  </div>
                  <div>
                    <p className="typo-helper text-slate-500">{tr('Notes')}</p>
                    <p className="typo-body text-slate-700">{profile.guest.notes || '—'}</p>
                  </div>
                </div>
              </section>

              {/* Alternate / Emergency Contact Call Log */}
              <section className="rounded-lg border border-slate-200 p-4 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="typo-card-title text-slate-900">
                      {tr('Alternate / Emergency Contact Call Log')}
                    </h3>
                    <p className="typo-helper text-slate-500">
                      {tr('Log a confirmation call to')} {profile.guest.alternativePhone || profile.guest.emergencyContactPhone || tr('alternate contact')}.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleInitiateCall}
                    disabled={
                      callBusy ||
                      (!profile.guest.alternativePhone &&
                        !profile.guest.emergencyContactPhone &&
                        !profile.guest.primaryPhone)
                    }
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-teal-700 px-3.5 py-2 typo-btn text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
                  >
                    <PhoneCall className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{callBusy ? tr('Logging...') : tr('Log / Initiate Call')}</span>
                  </button>
                </div>

                {callFeedback && (
                  <p className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 typo-body text-teal-900">
                    {tr(callFeedback)}
                  </p>
                )}

                {profile.callAttempts.length > 0 && (
                  <div className="space-y-2.5 border-t border-slate-100 pt-3">
                    {profile.callAttempts.map((attempt) => (
                      <div
                        key={attempt.id}
                        className="rounded-md border border-slate-200 bg-slate-50/70 p-3 typo-body space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-slate-800">
                            {attempt.providerCallRef} · {attempt.targetPhoneMasked}
                          </span>
                          <span className="typo-helper text-slate-500 tabular-nums">
                            {formatDateTime(attempt.createdAt)}
                          </span>
                        </div>
                        <p className="text-slate-600">
                          {tr('Outcome:')}{' '}
                          <span className="font-semibold text-slate-900">
                            {tr(attempt.outcome.replace('_', ' '))}
                          </span>
                          {attempt.notes ? ` — ${attempt.notes}` : ''}
                        </p>
                        {attempt.outcome === 'initiated' && (
                          <div className="space-y-2 pt-1">
                            <input
                              type="text"
                              value={outcomeNotes}
                              onChange={(e) => setOutcomeNotes(e.target.value)}
                              placeholder={tr('Optional call note...')}
                              className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-input"
                            />
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleUpdateCallOutcome(attempt.id, 'verified')}
                                disabled={callBusy}
                                className="inline-flex items-center gap-1 rounded bg-emerald-700 px-2.5 py-1 typo-btn text-white hover:bg-emerald-800"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                {tr('Contact Confirmed')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateCallOutcome(attempt.id, 'no_answer')}
                                disabled={callBusy}
                                className="rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-700 hover:bg-slate-100"
                              >
                                {tr('No Answer')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateCallOutcome(attempt.id, 'wrong_number')}
                                disabled={callBusy}
                                className="rounded border border-red-200 bg-white px-2.5 py-1 typo-btn text-red-700 hover:bg-red-50"
                              >
                                {tr('Wrong Number')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Stay History */}
              <section className="space-y-2.5">
                <h3 className="typo-card-title text-slate-900">
                  {tr('Stay History')} ({profile.stays.length})
                </h3>
                <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                  {profile.stays.length === 0 ? (
                    <p className="p-3.5 typo-body text-slate-500">{tr('No stays recorded yet.')}</p>
                  ) : (
                    profile.stays.map((stay) => (
                      <div key={stay.id} className="flex items-center justify-between gap-4 p-3.5 typo-body">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-slate-900">
                              {tr('Room')} {stay.roomNumber} · {tr('Bed')} {stay.bedLabel}
                            </span>
                            <StayStatusIndicator status={stay.status} />
                          </div>
                          <p className="mt-1 typo-helper text-slate-500 tabular-nums">
                            {formatDateShort(stay.checkInAt)} →{' '}
                            {stay.actualCheckoutAt
                              ? formatDateShort(stay.actualCheckoutAt)
                              : stay.expectedCheckoutDate
                                ? `${tr('Exp.')} ${formatDateShort(stay.expectedCheckoutDate)}`
                                : tr('Ongoing')}{' '}
                            · {stay.durationDays} {tr('days')} · {tr(stay.purposeOfStay)}
                          </p>
                        </div>
                        <div className="text-right tabular-nums">
                          <p className="font-mono font-semibold text-slate-900">
                            {formatInr(stay.agreedAmount)}
                          </p>
                          {stay.balanceDue > 0 && (
                            <p className="font-mono typo-helper text-red-700">
                              {formatInr(stay.balanceDue)} {tr('due')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* Security Deposits */}
              <section className="space-y-2.5">
                <h3 className="typo-card-title text-slate-900">
                  {tr('Refundable Security Deposits')} ({profile.deposits?.length || 0})
                </h3>
                {!profile.deposits || profile.deposits.length === 0 ? (
                  <p className="typo-body text-slate-500">{tr('No security deposits recorded.')}</p>
                ) : (
                  <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                    {profile.deposits.map((dep) => (
                      <div key={dep.id} className="flex items-center justify-between gap-3 p-3.5 typo-body">
                        <div>
                          <p className="font-medium text-slate-900">
                            {tr('Room')} {dep.roomNumber} · {tr('Bed')} {dep.bedLabel}
                          </p>
                          <p className="mt-0.5 typo-helper text-slate-500 tabular-nums">
                            {tr('Collected')} {formatDateShort(dep.collectedDate)} · {tr('Held')} {formatInr(dep.remainingHeld)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-semibold text-slate-900 tabular-nums">
                            {formatInr(dep.amount)}
                          </p>
                          <DepositStatusIndicator status={dep.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Identity Documents */}
              <section className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="typo-card-title text-slate-900">
                    {tr('Private ID Documents')} ({profile.documents.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setUploadDocOpen((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-700 hover:bg-slate-50"
                  >
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{uploadDocOpen ? tr('Cancel') : tr('Upload ID')}</span>
                  </button>
                </div>

                {uploadDocOpen && (
                  <form
                    onSubmit={handleUploadDoc}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-3"
                  >
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div>
                        <label className="block typo-label text-slate-700">{tr('ID Type')}</label>
                        <select
                          value={uploadIdType}
                          onChange={(e) => setUploadIdType(e.target.value as IdDocumentType)}
                          className="mt-1 block w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-input"
                        >
                          <option value="aadhaar">{tr('Aadhaar')}</option>
                          <option value="passport">{tr('Passport')}</option>
                          <option value="driving_licence">{tr('Driving Licence')}</option>
                          <option value="voter_id">{tr('Voter ID')}</option>
                          <option value="other">{tr('Other')}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block typo-label text-slate-700">{tr('Side / Role')}</label>
                        <select
                          value={uploadDocRole}
                          onChange={(e) => setUploadDocRole(e.target.value as DocumentRole)}
                          className="mt-1 block w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-input"
                        >
                          <option value="id_front">{tr('ID Front')}</option>
                          <option value="id_back">{tr('ID Back')}</option>
                          <option value="additional_id">{tr('Additional ID')}</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,.pdf"
                        required
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        className="typo-helper text-slate-600 file:mr-2.5 file:rounded file:border-0 file:bg-white file:px-2.5 file:py-1 file:typo-btn file:text-slate-700"
                      />
                      <button
                        type="submit"
                        disabled={uploadBusy || !uploadFile}
                        className="rounded-md bg-teal-700 px-3 py-1.5 typo-btn text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
                      >
                        {uploadBusy ? tr('Uploading...') : tr('Save File')}
                      </button>
                    </div>
                  </form>
                )}

                {profile.documents.length === 0 ? (
                  <p className="typo-body text-slate-500">{tr('No ID documents uploaded.')}</p>
                ) : (
                  <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                    {profile.documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between gap-3 p-3.5 typo-body">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">
                              {doc.originalFileName}
                            </p>
                            <p className="typo-helper text-slate-500">
                              {tr(ID_TYPE_LABELS[doc.idType])} · {tr(doc.docRole.replace('_', ' '))} ·{' '}
                              {formatBytes(doc.sizeBytes)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              onPreviewDocument({
                                ...doc,
                                guestName: profile.guest.fullName,
                                guestIdMasked: profile.guest.idMasked,
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>{tr('Preview')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              api.downloadDocument(doc.id, doc.originalFileName).catch((err) =>
                                setError(err instanceof Error ? tr(err.message) : tr('Download failed.'))
                              )
                            }
                            aria-label={`${tr('Download')} ${doc.originalFileName}`}
                            className="rounded-md border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Payments */}
              <section className="space-y-2.5">
                <h3 className="typo-card-title text-slate-900">
                  {tr('Rent & Charges')} ({profile.payments.length})
                </h3>
                <div className="divide-y divide-slate-200 rounded-lg border border-slate-200">
                  {profile.payments.map((pay) => (
                    <div key={pay.id} className="flex items-center justify-between gap-3 p-3.5 typo-body">
                      <div>
                        <p className="font-medium text-slate-900">{tr(pay.description)}</p>
                        <p className="mt-0.5 typo-helper text-slate-500 tabular-nums">
                          {tr('Due')} {formatDateShort(pay.dueDate)}
                          {pay.paymentDate ? ` · ${tr('Paid')} ${formatDateShort(pay.paymentDate)}` : ''}
                          {pay.paidAmount > 0 && pay.paidAmount < pay.amount
                            ? ` · ${tr('Paid')} ${formatInr(pay.paidAmount)}`
                            : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-semibold text-slate-900 tabular-nums">
                          {formatInr(pay.amount)}
                        </p>
                        <PaymentStatusIndicator status={pay.status} isOverdue={pay.isOverdue} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={tr(`Delete ${profile?.guest.fullName || 'Guest'} & Purge Documents?`)}
        description={tr('This permanently deletes the guest record and all uploaded private ID files. Guests with active or overdue stays cannot be deleted until checked out.')}
        confirmLabel={tr('Delete Guest')}
        destructive
        busy={deleteBusy}
        onConfirm={handleDeleteGuest}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}
