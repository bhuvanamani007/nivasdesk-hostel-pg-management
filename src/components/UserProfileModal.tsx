import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Bell,
  Building2,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  Settings,
  ShieldCheck,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { tr } from '../lib/i18n';
import type { PreferredLanguage, Tenant, User, UserRole } from '../types/domain';
import { LanguageToggle } from './LanguageToggle';
import { UserAvatar } from './UserAvatar';

export type ProfileModalTab = 'profile' | 'edit' | 'settings' | 'password';

interface UserProfileModalProps {
  open: boolean;
  initialTab: ProfileModalTab;
  user: User;
  tenant: Tenant;
  uiLanguage: PreferredLanguage;
  onToggleLanguage: (lang: PreferredLanguage) => void | Promise<void>;
  onClose: () => void;
  onUserUpdated: (updated: User) => void;
  onOpenNotificationSettings: () => void;
  onOpenWorkspaceSettings?: () => void;
  onShowToast: (kind: 'ok' | 'error', text: string) => void;
}

function formatRoleLabel(role: UserRole): string {
  if (role === 'overall_admin') return 'Overall Admin';
  if (role === 'owner') return 'Owner';
  if (role === 'warden') return 'Warden';
  return 'Staff';
}

function formatCreatedDate(iso?: string, lang: PreferredLanguage = 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(lang === 'ta' ? 'ta-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function UserProfileModal({
  open,
  initialTab,
  user,
  tenant,
  uiLanguage,
  onToggleLanguage,
  onClose,
  onUserUpdated,
  onOpenNotificationSettings,
  onOpenWorkspaceSettings,
  onShowToast,
}: UserProfileModalProps) {
  const [activeTab, setActiveTab] = useState<ProfileModalTab>(initialTab);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit profile state
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  // Avatar upload state
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
    setName(user.name);
    setEmail(user.email);
    setPhone(user.phone || '');
    setProfileError(null);
    setProfileSuccess(null);
    setAvatarError(null);
    setPasswordError(null);
    setPasswordSuccess(null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }, [open, initialTab, user]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleAvatarSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedTypes.has(file.type)) {
      setAvatarError('Please choose a JPEG, PNG, or WebP image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('Profile picture must be 2 MB or smaller.');
      return;
    }

    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const res = await api.uploadProfileAvatar(file);
      onUserUpdated(res.user);
      onShowToast('ok', 'Profile picture updated.');
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Failed to upload profile picture.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarBusy(true);
    setAvatarError(null);
    try {
      const res = await api.deleteProfileAvatar();
      onUserUpdated(res.user);
      onShowToast('ok', 'Profile picture removed.');
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Failed to remove profile picture.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      setProfileError('Full name is required.');
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setProfileError('Please enter a valid email address.');
      return;
    }
    if (trimmedPhone && !/^[+\d\s()-]{6,24}$/.test(trimmedPhone)) {
      setProfileError('Please enter a valid phone number.');
      return;
    }

    setProfileSaving(true);
    setProfileError(null);
    setProfileSuccess(null);
    try {
      const res = await api.updateProfile({
        name: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
      });
      onUserUpdated(res.user);
      setProfileSuccess('Profile details updated successfully.');
      onShowToast('ok', 'Profile updated.');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError('Please enter your current password.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('New password must be different from your current password.');
      return;
    }

    setPasswordSaving(true);
    try {
      const res = await api.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(res.message || 'Password updated successfully.');
      onShowToast('ok', 'Password changed successfully.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Could not change password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const tabs: Array<{ id: ProfileModalTab; label: string; icon: typeof UserIcon }> = [
    { id: 'profile', label: tr(uiLanguage, 'My Profile'), icon: UserIcon },
    { id: 'edit', label: tr(uiLanguage, 'Edit Profile'), icon: Pencil },
    { id: 'settings', label: tr(uiLanguage, 'Account Settings'), icon: Settings },
    { id: 'password', label: tr(uiLanguage, 'Change Password'), icon: KeyRound },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-profile-modal-title"
      onClick={onClose}
    >
      <div
        className="animate-dropdown-in flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <UserAvatar
              avatarUrl={user.avatarUrl}
              name={user.name}
              sizeClass="h-10 w-10 border border-slate-200"
              iconClass="h-5 w-5"
            />
            <div className="min-w-0">
              <h2
                id="user-profile-modal-title"
                className="typo-section-heading text-slate-900 truncate"
              >
                {user.name}
              </h2>
              <p className="typo-helper font-medium text-teal-700">
                {tr(uiLanguage, formatRoleLabel(user.role))} · {user.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile dialog"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50 px-5 pt-2.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setProfileError(null);
                  setProfileSuccess(null);
                  setAvatarError(null);
                  setPasswordError(null);
                  setPasswordSuccess(null);
                }}
                className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 typo-btn transition-colors whitespace-nowrap ${
                  active
                    ? 'border-teal-700 text-teal-800 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Hidden Shared Avatar File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleAvatarSelected}
          className="hidden"
        />

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {avatarError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 typo-body text-red-800">
              {tr(uiLanguage, avatarError)}
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-5">
              {/* Profile Avatar & Quick Photo Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <UserAvatar
                      avatarUrl={user.avatarUrl}
                      name={user.name}
                      sizeClass="h-20 w-20 border-2 border-slate-200"
                      iconClass="h-9 w-9"
                    />
                    <button
                      type="button"
                      disabled={avatarBusy}
                      onClick={() => fileInputRef.current?.click()}
                      title={tr(uiLanguage, 'Change profile picture')}
                      aria-label="Change profile picture"
                      className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-teal-700 disabled:opacity-50"
                    >
                      <Camera className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="min-w-0">
                    <h3 className="typo-card-title text-slate-900">{user.name}</h3>
                    <p className="typo-body font-medium text-teal-700">
                      {tr(uiLanguage, formatRoleLabel(user.role))}
                    </p>
                    <p className="mt-0.5 typo-helper text-slate-500">
                      {tr(uiLanguage, 'JPEG, PNG, or WebP up to 2 MB')}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={avatarBusy}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 typo-btn text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Camera className="h-4 w-4 text-slate-500" />
                    <span>{tr(uiLanguage, avatarBusy ? 'Uploading...' : 'Change Photo')}</span>
                  </button>
                  {user.avatarUrl && (
                    <button
                      type="button"
                      disabled={avatarBusy}
                      onClick={handleRemoveAvatar}
                      className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 typo-btn text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>{tr(uiLanguage, 'Remove')}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Account Details Grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
                  <p className="typo-helper font-medium uppercase tracking-wide text-slate-500">
                    {tr(uiLanguage, 'Full Name')}
                  </p>
                  <p className="mt-1 typo-body font-semibold text-slate-900">{user.name}</p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
                  <p className="typo-helper font-medium uppercase tracking-wide text-slate-500">
                    {tr(uiLanguage, 'Assigned Role')}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 typo-body font-semibold text-teal-800">
                    <ShieldCheck className="h-4 w-4 text-teal-700" />
                    <span>{tr(uiLanguage, formatRoleLabel(user.role))}</span>
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
                  <p className="typo-helper font-medium uppercase tracking-wide text-slate-500">
                    {tr(uiLanguage, 'Email Address')}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 typo-body text-slate-900 break-all">
                    <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                    <span>{user.email}</span>
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
                  <p className="typo-helper font-medium uppercase tracking-wide text-slate-500">
                    {tr(uiLanguage, 'Phone Number')}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 typo-body text-slate-900">
                    <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                    <span>{user.phone?.trim() ? user.phone : tr(uiLanguage, 'Not added yet')}</span>
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
                  <p className="typo-helper font-medium uppercase tracking-wide text-slate-500">
                    {tr(uiLanguage, 'Active Workspace')}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 typo-body text-slate-900">
                    <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                    <span>
                      {user.role === 'overall_admin'
                        ? tr(uiLanguage, 'All PG Properties (Platform Governance)')
                        : tenant.name}
                    </span>
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5">
                  <p className="typo-helper font-medium uppercase tracking-wide text-slate-500">
                    {tr(uiLanguage, 'Member Since')}
                  </p>
                  <p className="mt-1 typo-body text-slate-900">
                    {formatCreatedDate(user.createdAt, uiLanguage)} ·{' '}
                    <span className="font-medium text-emerald-700">
                      {tr(uiLanguage, user.isActive === false ? 'Inactive' : 'Active')}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('password')}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  <KeyRound className="h-4 w-4" />
                  <span>{tr(uiLanguage, 'Change Password')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('edit')}
                  className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-4 py-2 typo-btn text-white hover:bg-teal-800"
                >
                  <Pencil className="h-4 w-4" />
                  <span>{tr(uiLanguage, 'Edit Profile')}</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'edit' && (
            <form onSubmit={handleSaveProfile} className="space-y-5">
              {profileError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 typo-body text-red-800">
                  {tr(uiLanguage, profileError)}
                </div>
              )}
              {profileSuccess && (
                <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 typo-body text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                  <span>{tr(uiLanguage, profileSuccess)}</span>
                </div>
              )}

              {/* Photo Upload Row */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-3.5">
                  <UserAvatar
                    avatarUrl={user.avatarUrl}
                    name={user.name}
                    sizeClass="h-14 w-14 border border-slate-200"
                    iconClass="h-7 w-7"
                  />
                  <div>
                    <p className="typo-body font-semibold text-slate-900">
                      {tr(uiLanguage, 'Profile Picture')}
                    </p>
                    <p className="typo-helper text-slate-500">
                      {tr(uiLanguage, 'JPG, PNG, or WebP · Max size 2 MB')}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={avatarBusy}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 typo-btn text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Camera className="h-4 w-4 text-slate-500" />
                    <span>{tr(uiLanguage, avatarBusy ? 'Uploading...' : 'Upload Photo')}</span>
                  </button>
                  {user.avatarUrl && (
                    <button
                      type="button"
                      disabled={avatarBusy}
                      onClick={handleRemoveAvatar}
                      className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 typo-btn text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>{tr(uiLanguage, 'Remove')}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="profile-edit-name" className="block typo-label text-slate-700">
                    {tr(uiLanguage, 'Full Name')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="profile-edit-name"
                    type="text"
                    required
                    maxLength={80}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={tr(uiLanguage, 'Enter your full name')}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="profile-edit-email" className="block typo-label text-slate-700">
                    {tr(uiLanguage, 'Email Address')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="profile-edit-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="profile-edit-phone" className="block typo-label text-slate-700">
                    {tr(uiLanguage, 'Phone Number')}
                  </label>
                  <input
                    id="profile-edit-phone"
                    type="tel"
                    maxLength={24}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98400 00000"
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  {tr(uiLanguage, 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="rounded-md bg-teal-700 px-4 py-2 typo-btn text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {tr(uiLanguage, profileSaving ? 'Saving...' : 'Save Changes')}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-4">
              {/* Language Preference */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <Globe className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
                  <div>
                    <p className="typo-card-title text-slate-900">
                      {tr(uiLanguage, 'Display Language')}
                    </p>
                    <p className="typo-helper text-slate-500">
                      {tr(uiLanguage, 'Switch dashboard interface between English and Tamil.')}
                    </p>
                  </div>
                </div>
                <LanguageToggle
                  language={uiLanguage}
                  onChange={onToggleLanguage}
                />
              </div>

              {/* Notification Preferences */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <Bell className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
                  <div>
                    <p className="typo-card-title text-slate-900">
                      {tr(uiLanguage, 'Notification Preferences')}
                    </p>
                    <p className="typo-helper text-slate-500">
                      {tr(uiLanguage, 'Rent reminders, payment updates, tenant activity, and complaints.')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenNotificationSettings();
                  }}
                  className="shrink-0 rounded-md border border-slate-300 bg-white px-3.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  {tr(uiLanguage, 'Manage Alerts')}
                </button>
              </div>

              {/* Role & Workspace Scope */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
                  <div>
                    <p className="typo-card-title text-slate-900">
                      {tr(uiLanguage, 'Account & Workspace Scope')}
                    </p>
                    <p className="typo-helper text-slate-500">
                      {user.role === 'overall_admin'
                        ? tr(
                            uiLanguage,
                            `Signed in as ${formatRoleLabel(user.role)} with multi-property governance access.`
                          )
                        : tr(
                            uiLanguage,
                            `Signed in as ${formatRoleLabel(user.role)} for ${tenant.name}.`
                          )}
                    </p>
                  </div>
                </div>
                {onOpenWorkspaceSettings && user.role !== 'overall_admin' && user.role !== 'owner' && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenWorkspaceSettings();
                    }}
                    className="shrink-0 rounded-md border border-slate-300 bg-white px-3.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50"
                  >
                    {tr(uiLanguage, 'Hostel Settings')}
                  </button>
                )}
              </div>

              {/* Security Quick Link */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-200 p-4">
                <div className="flex items-start gap-3">
                  <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
                  <div>
                    <p className="typo-card-title text-slate-900">
                      {tr(uiLanguage, 'Password & Security')}
                    </p>
                    <p className="typo-helper text-slate-500">
                      {tr(
                        uiLanguage,
                        'Update your login password regularly to keep PG records secure.'
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('password')}
                  className="shrink-0 rounded-md border border-slate-300 bg-white px-3.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  {tr(uiLanguage, 'Change Password')}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'password' && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              {passwordError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 typo-body text-red-800">
                  {tr(uiLanguage, passwordError)}
                </div>
              )}
              {passwordSuccess && (
                <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 typo-body text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                  <span>{tr(uiLanguage, passwordSuccess)}</span>
                </div>
              )}

              <div>
                <label htmlFor="pw-current" className="block typo-label text-slate-700">
                  {tr(uiLanguage, 'Current Password')} <span className="text-red-600">*</span>
                </label>
                <div className="relative mt-1">
                  <input
                    id="pw-current"
                    type={showCurrentPw ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder={tr(uiLanguage, 'Enter current password')}
                    autoComplete="current-password"
                    className="w-full rounded-md border border-slate-300 bg-white py-2 pl-3 pr-10 typo-input text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw((v) => !v)}
                    aria-label={showCurrentPw ? 'Hide current password' : 'Show current password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                  >
                    {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="pw-new" className="block typo-label text-slate-700">
                    {tr(uiLanguage, 'New Password')} <span className="text-red-600">*</span>
                  </label>
                  <div className="relative mt-1">
                    <input
                      id="pw-new"
                      type={showNewPw ? 'text' : 'password'}
                      required
                      minLength={6}
                      maxLength={128}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={tr(uiLanguage, 'Minimum 6 characters')}
                      autoComplete="new-password"
                      className="w-full rounded-md border border-slate-300 bg-white py-2 pl-3 pr-10 typo-input text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw((v) => !v)}
                      aria-label={showNewPw ? 'Hide new password' : 'Show new password'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                    >
                      {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="pw-confirm" className="block typo-label text-slate-700">
                    {tr(uiLanguage, 'Confirm New Password')} <span className="text-red-600">*</span>
                  </label>
                  <div className="relative mt-1">
                    <input
                      id="pw-confirm"
                      type={showConfirmPw ? 'text' : 'password'}
                      required
                      minLength={6}
                      maxLength={128}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={tr(uiLanguage, 'Re-enter new password')}
                      autoComplete="new-password"
                      className="w-full rounded-md border border-slate-300 bg-white py-2 pl-3 pr-10 typo-input text-slate-900 focus:border-teal-700 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw((v) => !v)}
                      aria-label={
                        showConfirmPw ? 'Hide confirm password' : 'Show confirm password'
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                    >
                      {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <p className="typo-helper text-slate-500">
                {tr(
                  uiLanguage,
                  'Use at least 6 characters. Your session stays active after updating your password.'
                )}
              </p>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  {tr(uiLanguage, 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="rounded-md bg-teal-700 px-4 py-2 typo-btn text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {tr(uiLanguage, passwordSaving ? 'Updating...' : 'Update Password')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
