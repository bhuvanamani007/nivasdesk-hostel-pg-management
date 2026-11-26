import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Bell, CheckCircle2, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../lib/LanguageContext';
import { USER_CATEGORY_PREF_ITEMS } from '../lib/notificationMeta';
import type {
  AdminNotificationPolicy,
  NotificationCategory,
  PreferredLanguage,
  ProviderMode,
  Tenant,
  User,
  UserNotificationPreferences,
  UserRole,
} from '../types/domain';

interface SettingsViewProps {
  tenant: Tenant;
  currentUser: User;
  onTenantUpdated: (tenant: Tenant) => void;
  onNotificationsChanged?: () => void;
}

export function SettingsView({
  tenant,
  currentUser,
  onTenantUpdated,
  onNotificationsChanged,
}: SettingsViewProps) {
  const { tr } = useLanguage();
  const canEditSettings =
    currentUser.role === 'owner' ||
    currentUser.role === 'warden' ||
    currentUser.role === 'overall_admin';
  const isOwner = currentUser.role === 'owner' || currentUser.role === 'overall_admin';

  const [name, setName] = useState(tenant.name);
  const [district, setDistrict] = useState(tenant.district || tenant.city);
  const [locality, setLocality] = useState(tenant.locality || '');
  const [pincode, setPincode] = useState(tenant.pincode || '');
  const [landmark, setLandmark] = useState(tenant.landmark || '');
  const [address, setAddress] = useState(tenant.address);
  const [wardenPhone, setWardenPhone] = useState(tenant.wardenPhone);
  const [gstinOrReg, setGstinOrReg] = useState(tenant.gstinOrReg);
  const [timezone, setTimezone] = useState(tenant.timezone || 'Asia/Kolkata');
  const [preferredLanguage, setPreferredLanguage] = useState<PreferredLanguage>(
    tenant.preferredLanguage || 'en'
  );
  const [houseRules, setHouseRules] = useState(tenant.houseRules || '');
  const [receiptPrefix, setReceiptPrefix] = useState(tenant.receiptPrefix || 'NVD');
  const [agreementNotes, setAgreementNotes] = useState(tenant.agreementNotes || '');

  const [smsProvider, setSmsProvider] = useState<ProviderMode>(tenant.settings.smsProvider);
  const [whatsappProvider, setWhatsappProvider] = useState<ProviderMode>(
    tenant.settings.whatsappProvider
  );
  const [telephonyProvider, setTelephonyProvider] = useState<ProviderMode>(
    tenant.settings.telephonyProvider
  );
  const [smsCooldownHours, setSmsCooldownHours] = useState(
    String(tenant.settings.smsCooldownHours)
  );
  const [reminderLeadDays, setReminderLeadDays] = useState(
    String(tenant.settings.reminderLeadDays)
  );
  const [unpaidReminderEnabled, setUnpaidReminderEnabled] = useState(
    tenant.settings.unpaidReminderEnabled
  );
  const [checkoutReminderEnabled, setCheckoutReminderEnabled] = useState(
    tenant.settings.checkoutReminderEnabled
  );
  const [requireIdDocument, setRequireIdDocument] = useState(
    tenant.settings.requireIdDocument
  );
  const [smsTemplate, setSmsTemplate] = useState(tenant.settings.smsTemplate);
  const [checkoutReminderTemplate, setCheckoutReminderTemplate] = useState(
    tenant.settings.checkoutReminderTemplate || ''
  );

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Staff Accounts & RBAC
  const [staff, setStaff] = useState<User[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffRole, setStaffRole] = useState<UserRole>('staff');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffMsg, setStaffMsg] = useState<string | null>(null);

  // Notification Preferences & Platform Policy
  const [notifPolicy, setNotifPolicy] = useState<AdminNotificationPolicy | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<UserNotificationPreferences | null>(null);
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifMsg, setNotifMsg] = useState<string | null>(null);

  useEffect(() => {
    setName(tenant.name);
    setDistrict(tenant.district || tenant.city);
    setLocality(tenant.locality || '');
    setPincode(tenant.pincode || '');
    setLandmark(tenant.landmark || '');
    setAddress(tenant.address);
    setWardenPhone(tenant.wardenPhone);
    setGstinOrReg(tenant.gstinOrReg);
    setTimezone(tenant.timezone || 'Asia/Kolkata');
    setPreferredLanguage(tenant.preferredLanguage || 'en');
    setHouseRules(tenant.houseRules || '');
    setReceiptPrefix(tenant.receiptPrefix || 'NVD');
    setAgreementNotes(tenant.agreementNotes || '');
    setSmsProvider(tenant.settings.smsProvider);
    setWhatsappProvider(tenant.settings.whatsappProvider);
    setTelephonyProvider(tenant.settings.telephonyProvider);
    setSmsCooldownHours(String(tenant.settings.smsCooldownHours));
    setReminderLeadDays(String(tenant.settings.reminderLeadDays));
    setUnpaidReminderEnabled(tenant.settings.unpaidReminderEnabled);
    setCheckoutReminderEnabled(tenant.settings.checkoutReminderEnabled);
    setRequireIdDocument(tenant.settings.requireIdDocument);
    setSmsTemplate(tenant.settings.smsTemplate);
    setCheckoutReminderTemplate(tenant.settings.checkoutReminderTemplate || '');
  }, [tenant]);

  const loadStaff = async () => {
    setStaffLoading(true);
    try {
      const res = await api.getStaff();
      setStaff(res.staff);
    } catch {
      // ignore if restricted
    } finally {
      setStaffLoading(false);
    }
  };

  const loadNotificationSettings = async () => {
    try {
      const res = await api.getNotificationSettings();
      setNotifPolicy(res.policy);
      setNotifPrefs(res.preferences);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadStaff();
    loadNotificationSettings();
  }, [tenant.id, currentUser.id]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!canEditSettings) return;
    setSaving(true);
    setSavedMsg(null);
    setError(null);

    try {
      const res = await api.updateSettings({
        name,
        city: district,
        district,
        locality,
        pincode,
        landmark,
        address,
        wardenPhone,
        gstinOrReg,
        timezone,
        preferredLanguage,
        houseRules,
        receiptPrefix,
        agreementNotes,
        settings: {
          smsProvider,
          whatsappProvider,
          telephonyProvider,
          smsCooldownHours: Number(smsCooldownHours) || 24,
          reminderLeadDays: Number(reminderLeadDays) || 2,
          unpaidReminderEnabled,
          checkoutReminderEnabled,
          requireIdDocument,
          smsTemplate,
          checkoutReminderTemplate,
        },
      });
      onTenantUpdated(res.tenant);
      setSavedMsg(tr('Hostel settings saved.'));
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Failed to save settings.'));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateStaff = async (e: FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;
    setStaffBusy(true);
    setError(null);
    setStaffMsg(null);
    try {
      await api.createStaff({
        name: staffName.trim(),
        email: staffEmail.trim(),
        role: staffRole,
        password: staffPassword,
      });
      setStaffName('');
      setStaffEmail('');
      setStaffPassword('');
      setStaffRole('staff');
      setStaffMsg(tr('Staff account created.'));
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Could not add staff account.'));
    } finally {
      setStaffBusy(false);
    }
  };

  const handleToggleStaffActive = async (member: User) => {
    if (!isOwner || member.id === currentUser.id) return;
    setStaffBusy(true);
    try {
      await api.updateStaff(member.id, { isActive: member.isActive === false });
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Could not update staff status.'));
    } finally {
      setStaffBusy(false);
    }
  };

  const handleChangeStaffRole = async (member: User, nextRole: UserRole) => {
    if (!isOwner || member.id === currentUser.id) return;
    setStaffBusy(true);
    try {
      await api.updateStaff(member.id, { role: nextRole });
      await loadStaff();
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Could not change staff role.'));
    } finally {
      setStaffBusy(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="typo-page-title text-slate-900">{tr('Hostel Settings & Staff')}</h1>
        <p className="mt-0.5 typo-body text-slate-600">
          {tr('Configure Tamil Nadu property details, language, house rules, receipts, reminders, and staff access roles.')}
        </p>
      </div>

      {!canEditSettings && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 typo-body text-amber-900">
          {tr('You are signed in with the Staff role. Settings are read-only; ask an Owner or Warden to update property configuration.')}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {savedMsg && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 typo-body text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{tr(savedMsg)}</span>
          </div>
        )}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 typo-body text-red-800">
            {tr(error)}
          </div>
        )}

        {/* Property & Tamil Nadu Address Profile */}
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="typo-section-heading text-slate-900">{tr('Property Profile & Tamil Nadu Address')}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="set-name" className="block typo-label text-slate-700">
                {tr('Hostel / PG Name')}
              </label>
              <input
                id="set-name"
                type="text"
                required
                disabled={!canEditSettings}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="set-phone" className="block typo-label text-slate-700">
                {tr('Warden / Desk Phone')}
              </label>
              <input
                id="set-phone"
                type="tel"
                disabled={!canEditSettings}
                value={wardenPhone}
                onChange={(e) => setWardenPhone(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="set-district" className="block typo-label text-slate-700">
                {tr('District')}
              </label>
              <input
                id="set-district"
                type="text"
                disabled={!canEditSettings}
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder="Chennai / Madurai / Coimbatore"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="set-locality" className="block typo-label text-slate-700">
                {tr('Locality / Area')}
              </label>
              <input
                id="set-locality"
                type="text"
                disabled={!canEditSettings}
                value={locality}
                onChange={(e) => setLocality(e.target.value)}
                placeholder="Adyar, Anna Nagar, RS Puram"
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="set-pincode" className="block typo-label text-slate-700">
                {tr('Pincode')}
              </label>
              <input
                id="set-pincode"
                type="text"
                maxLength={6}
                disabled={!canEditSettings}
                value={pincode}
                onChange={(e) => setPincode(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="set-landmark" className="block typo-label text-slate-700">
                {tr('Landmark')}
              </label>
              <input
                id="set-landmark"
                type="text"
                disabled={!canEditSettings}
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                placeholder={tr('Near Bus Stand / Signal')}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="set-addr" className="block typo-label text-slate-700">
                {tr('Street Address (printed on receipts)')}
              </label>
              <input
                id="set-addr"
                type="text"
                disabled={!canEditSettings}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="set-tz" className="block typo-label text-slate-700">
                {tr('Timezone')}
              </label>
              <select
                id="set-tz"
                disabled={!canEditSettings}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
              </select>
            </div>
            <div>
              <label htmlFor="set-lang" className="block typo-label text-slate-700">
                {tr('Preferred UI Language')}
              </label>
              <select
                id="set-lang"
                disabled={!canEditSettings}
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value as PreferredLanguage)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              >
                <option value="en">English (EN)</option>
                <option value="ta">தமிழ் (Tamil)</option>
              </select>
            </div>
          </div>
        </section>

        {/* House Rules, Receipt & Agreement Details */}
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="typo-section-heading text-slate-900">{tr('House Rules, Receipts & Stay Policies')}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="set-prefix" className="block typo-label text-slate-700">
                {tr('Receipt Number Prefix')}
              </label>
              <input
                id="set-prefix"
                type="text"
                maxLength={10}
                disabled={!canEditSettings}
                value={receiptPrefix}
                onChange={(e) => setReceiptPrefix(e.target.value.toUpperCase())}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="set-reg" className="block typo-label text-slate-700">
                {tr('Property Reference / GSTIN (Optional)')}
              </label>
              <input
                id="set-reg"
                type="text"
                disabled={!canEditSettings}
                value={gstinOrReg}
                onChange={(e) => setGstinOrReg(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="set-rules" className="block typo-label text-slate-700">
                {tr('Hostel House Rules')}
              </label>
              <textarea
                id="set-rules"
                rows={3}
                disabled={!canEditSettings}
                value={houseRules}
                onChange={(e) => setHouseRules(e.target.value)}
                placeholder={tr('Gate timings, visitor rules, quiet hours, notice period...')}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="set-agreement" className="block typo-label text-slate-700">
                {tr('Receipt & Stay Agreement Footer Notes')}
              </label>
              <textarea
                id="set-agreement"
                rows={2}
                disabled={!canEditSettings}
                value={agreementNotes}
                onChange={(e) => setAgreementNotes(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2.5 typo-label text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!canEditSettings}
                  checked={requireIdDocument}
                  onChange={(e) => setRequireIdDocument(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                />
                <span>{tr('Require guest ID type/reference during registration (when unchecked, ID recording is optional)')}</span>
              </label>
            </div>
          </div>
        </section>

        {/* Reminder Preferences */}
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div>
            <h2 className="typo-section-heading text-slate-900">
              {tr('Reminder Preferences & Messaging Channels')}
            </h2>
            <p className="mt-0.5 typo-helper text-slate-500">
              {tr('Live provider credentials come from server environment variables. In Mock or Disabled mode, no live messages are delivered.')}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="set-sms" className="block typo-label text-slate-700">
                {tr('SMS Provider')}
              </label>
              <select
                id="set-sms"
                disabled={!canEditSettings}
                value={smsProvider}
                onChange={(e) => setSmsProvider(e.target.value as ProviderMode)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              >
                <option value="mock">{tr('Mock (Simulated)')}</option>
                <option value="disabled">{tr('Disabled')}</option>
                <option value="configured">{tr('Configured (Env Vars)')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="set-whatsapp" className="block typo-label text-slate-700">
                {tr('WhatsApp Provider')}
              </label>
              <select
                id="set-whatsapp"
                disabled={!canEditSettings}
                value={whatsappProvider}
                onChange={(e) => setWhatsappProvider(e.target.value as ProviderMode)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              >
                <option value="mock">{tr('Mock (Simulated)')}</option>
                <option value="disabled">{tr('Disabled')}</option>
                <option value="configured">{tr('Configured (Env Vars)')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="set-telephony" className="block typo-label text-slate-700">
                {tr('Contact Call Provider')}
              </label>
              <select
                id="set-telephony"
                disabled={!canEditSettings}
                value={telephonyProvider}
                onChange={(e) => setTelephonyProvider(e.target.value as ProviderMode)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              >
                <option value="mock">{tr('Mock (Simulated)')}</option>
                <option value="disabled">{tr('Disabled (Manual Log)')}</option>
                <option value="configured">{tr('Configured (Env Vars)')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="set-cooldown" className="block typo-label text-slate-700">
                {tr('Duplicate Reminder Cooldown (hours)')}
              </label>
              <input
                id="set-cooldown"
                type="number"
                min={1}
                max={168}
                disabled={!canEditSettings}
                value={smsCooldownHours}
                onChange={(e) => setSmsCooldownHours(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="set-lead" className="block typo-label text-slate-700">
                {tr('Upcoming Checkout Lead Window (days)')}
              </label>
              <input
                id="set-lead"
                type="number"
                min={0}
                max={14}
                disabled={!canEditSettings}
                value={reminderLeadDays}
                onChange={(e) => setReminderLeadDays(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input font-mono disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 pt-1">
            <label className="flex items-center gap-2 typo-label text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canEditSettings}
                checked={unpaidReminderEnabled}
                onChange={(e) => setUnpaidReminderEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-700"
              />
              <span>{tr('Enable Unpaid Rent Reminders')}</span>
            </label>
            <label className="flex items-center gap-2 typo-label text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                disabled={!canEditSettings}
                checked={checkoutReminderEnabled}
                onChange={(e) => setCheckoutReminderEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-teal-700"
              />
              <span>{tr('Enable Upcoming / Overdue Checkout Reminders')}</span>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="set-template" className="block typo-label text-slate-700">
                {tr('Rent Due Template')} ({'{{guest}}'}, {'{{amount}}'}, {'{{room}}'}, {'{{dueDate}}'})
              </label>
              <textarea
                id="set-template"
                rows={3}
                disabled={!canEditSettings}
                value={smsTemplate}
                onChange={(e) => setSmsTemplate(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="set-checkout-template" className="block typo-label text-slate-700">
                {tr('Checkout Reminder Template')} ({'{{guest}}'}, {'{{room}}'}, {'{{checkoutDate}}'})
              </label>
              <textarea
                id="set-checkout-template"
                rows={3}
                disabled={!canEditSettings}
                value={checkoutReminderTemplate}
                onChange={(e) => setCheckoutReminderTemplate(e.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input disabled:bg-slate-50 focus:border-teal-700 focus:outline-none"
              />
            </div>
          </div>
        </section>

        {canEditSettings && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="min-h-10 rounded-md bg-teal-700 px-5 py-2 typo-btn text-white hover:bg-teal-800 disabled:opacity-50"
            >
              {saving ? tr('Saving...') : tr('Save Hostel Settings')}
            </button>
          </div>
        )}
      </form>

      {/* Staff Accounts & Role-Based Permissions */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 typo-section-heading text-slate-900">
              <Users className="h-4 w-4 text-teal-700" aria-hidden="true" />
              <span>{tr('Staff Accounts & Role Permissions')}</span>
            </h2>
            <p className="mt-0.5 typo-helper text-slate-500">
              {tr('Owner: full access including staff, guest purge & room deletion · Warden: operations & settings · Staff: daily front-desk check-in, payments, expenses & reminders.')}
            </p>
          </div>
        </div>

        {staffMsg && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 typo-body text-emerald-800">
            {tr(staffMsg)}
          </div>
        )}

        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-left typo-table-td">
            <thead className="border-b border-slate-200 bg-slate-50 typo-table-th text-slate-600">
              <tr>
                <th className="px-3 py-2">{tr('Name')}</th>
                <th className="px-3 py-2">{tr('Email')}</th>
                <th className="px-3 py-2">{tr('Role')}</th>
                <th className="px-3 py-2">{tr('Status')}</th>
                {isOwner && <th className="px-3 py-2 text-right">{tr('Actions')}</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staffLoading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center typo-body text-slate-500">
                    {tr('Loading staff accounts...')}
                  </td>
                </tr>
              ) : (
                staff.map((m) => (
                  <tr key={m.id}>
                    <td className="px-3 py-2.5 font-medium text-slate-900">
                      {m.name} {m.id === currentUser.id ? tr('(You)') : ''}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-slate-600">{m.email}</td>
                    <td className="px-3 py-2.5">
                      {isOwner && m.id !== currentUser.id ? (
                        <select
                          value={m.role}
                          disabled={staffBusy}
                          onChange={(e) => handleChangeStaffRole(m, e.target.value as UserRole)}
                          aria-label={`${tr('Role for')} ${m.name}`}
                          className="rounded border border-slate-300 bg-white px-2 py-1 typo-input capitalize"
                        >
                          <option value="owner">{tr('Owner')}</option>
                          <option value="warden">{tr('Warden')}</option>
                          <option value="staff">{tr('Staff')}</option>
                        </select>
                      ) : (
                        <span className="capitalize font-medium text-slate-700">{tr(m.role)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`font-medium ${
                          m.isActive === false ? 'text-red-700' : 'text-emerald-700'
                        }`}
                      >
                        {m.isActive === false ? tr('Inactive') : tr('Active')}
                      </span>
                    </td>
                    {isOwner && (
                      <td className="px-3 py-2.5 text-right">
                        {m.id !== currentUser.id && (
                          <button
                            type="button"
                            disabled={staffBusy}
                            onClick={() => handleToggleStaffActive(m)}
                            className="rounded border border-slate-300 bg-white px-2 py-1 typo-btn text-slate-700 hover:bg-slate-50"
                          >
                            {m.isActive === false ? tr('Reactivate') : tr('Deactivate')}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {isOwner && (
          <form onSubmit={handleCreateStaff} className="grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 sm:grid-cols-5 items-end">
            <div>
              <label htmlFor="st-name" className="block typo-label text-slate-700">
                {tr('Staff Name')}
              </label>
              <input
                id="st-name"
                type="text"
                required
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="Karthik Raja"
                className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 typo-input"
              />
            </div>
            <div>
              <label htmlFor="st-email" className="block typo-label text-slate-700">
                {tr('Email')}
              </label>
              <input
                id="st-email"
                type="email"
                required
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                placeholder="karthik@pg.in"
                className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 typo-input"
              />
            </div>
            <div>
              <label htmlFor="st-role" className="block typo-label text-slate-700">
                {tr('Role')}
              </label>
              <select
                id="st-role"
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value as UserRole)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 typo-input"
              >
                <option value="staff">{tr('Staff')}</option>
                <option value="warden">{tr('Warden')}</option>
                <option value="owner">{tr('Owner')}</option>
              </select>
            </div>
            <div>
              <label htmlFor="st-pass" className="block typo-label text-slate-700">
                {tr('Password')}
              </label>
              <input
                id="st-pass"
                type="password"
                required
                minLength={6}
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                placeholder={tr('Min 6 chars')}
                className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-1.5 typo-input"
              />
            </div>
            <button
              type="submit"
              disabled={staffBusy}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 typo-btn text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Add Staff')}</span>
            </button>
          </form>
        )}
      </section>

      {/* In-App Notification Preferences & Policy */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 typo-section-heading text-slate-900">
              <Bell className="h-4 w-4 text-teal-700" aria-hidden="true" />
              <span>{tr('In-App Notification Preferences')}</span>
            </h2>
            <p className="mt-0.5 typo-helper text-slate-500">
              {tr('Manage which real-time bell notifications appear for your account')} ({currentUser.name}).
            </p>
          </div>
          {notifMsg && (
            <span className="typo-helper font-medium text-emerald-700">{tr(notifMsg)}</span>
          )}
        </div>

        {notifPrefs && (
          <div className="divide-y divide-slate-100 rounded-md border border-slate-200 px-3.5">
            {USER_CATEGORY_PREF_ITEMS.map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between gap-4 py-2.5 cursor-pointer"
              >
                <div>
                  <p className="typo-label text-slate-900">{tr(item.label)}</p>
                  <p className="typo-helper text-slate-500">{tr(item.description)}</p>
                </div>
                <input
                  type="checkbox"
                  disabled={notifBusy}
                  checked={notifPrefs.categories[item.key] !== false}
                  onChange={async () => {
                    setNotifBusy(true);
                    setNotifMsg(null);
                    try {
                      const res = await api.updateUserNotificationPreferences({
                        categories: {
                          [item.key]: !(notifPrefs.categories[item.key] !== false),
                        } as Partial<Record<NotificationCategory, boolean>>,
                      });
                      setNotifPrefs(res.preferences);
                      setNotifMsg(tr('Preference saved.'));
                      onNotificationsChanged?.();
                    } catch (err) {
                      setError(
                        err instanceof Error ? tr(err.message) : tr('Failed to save preference.')
                      );
                    } finally {
                      setNotifBusy(false);
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                />
              </label>
            ))}
          </div>
        )}

        {notifPolicy && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 typo-helper text-slate-600">
            <p className="font-semibold text-slate-800">
              {tr('Platform Alert Policy (Overall Admin):')}
            </p>
            <p className="mt-1">
              {tr('Rent Reminders')}: {notifPolicy.rentRemindersEnabled ? tr('Enabled (5d, 2d & Due Day)') : tr('Disabled')} ·{' '}
              {tr('Overdue Alerts')}: {notifPolicy.overdueAlertsEnabled ? tr('Enabled') : tr('Disabled')} ·{' '}
              {tr('Payment Alerts')}: {notifPolicy.paymentAlertsEnabled ? tr('Enabled') : tr('Disabled')} ·{' '}
              {tr('Complaints')}: {notifPolicy.complaintsEnabled ? tr('Enabled') : tr('Disabled')} ·{' '}
              {tr('Maintenance')}: {notifPolicy.maintenanceAlertsEnabled ? tr('Enabled') : tr('Disabled')}
            </p>
          </div>
        )}
      </section>

      {/* Non-compliance & Privacy Scope */}
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 typo-helper text-slate-600 space-y-2">
        <div className="flex items-center gap-2 font-semibold text-slate-800">
          <AlertCircle className="h-4 w-4 text-amber-700" aria-hidden="true" />
          <span>{tr('Software Scope Disclaimer')}</span>
        </div>
        <p>
          {tr('NivasDesk is hostel operations and record-keeping software. It does not obtain Tamil Nadu hostel licences, verify government IDs automatically, or certify legal/regulatory compliance. Local building and municipal requirements vary by district and property.')}
        </p>
        <div className="flex items-center gap-2 pt-1 font-semibold text-slate-800">
          <ShieldCheck className="h-4 w-4 text-teal-700" aria-hidden="true" />
          <span>{tr('Privacy & Workspace Isolation')}</span>
        </div>
        <p>
          {tr('Workspace ID')} <span className="font-mono text-slate-800">{tenant.id}</span> {tr('is resolved server-side from your signed session. Guest documents and expense attachments are stored privately and served only after session and tenant verification.')}
        </p>
      </section>
    </div>
  );
}
