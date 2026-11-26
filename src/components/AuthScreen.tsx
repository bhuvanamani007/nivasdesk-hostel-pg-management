import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../lib/LanguageContext';
import type { Tenant, User, UserRole } from '../types/domain';
import { LanguageToggle } from './LanguageToggle';

interface AuthScreenProps {
  initialTab?: 'login' | 'register';
  onTabChange?: (tab: 'login' | 'register') => void;
  sampleWorkspaces: Array<{
    tenantId: string;
    name: string;
    city: string;
    wardenEmail: string;
  }>;
  onAuthenticated: (user: User, tenant: Tenant) => void;
  onBackToLanding?: () => void;
}

const REMEMBER_KEY = 'nivasdesk_remembered_login';

export function AuthScreen({
  initialTab = 'login',
  onTabChange,
  sampleWorkspaces,
  onAuthenticated,
  onBackToLanding,
}: AuthScreenProps) {
  const { uiLanguage, setUiLanguage, tr } = useLanguage();
  const [tab, setTab] = useState<'login' | 'register'>(initialTab);

  // Login state
  const [identifier, setIdentifier] = useState(() => {
    if (typeof window === 'undefined') return 'owner@cauverypg.example';
    return window.localStorage.getItem(REMEMBER_KEY) || 'owner@cauverypg.example';
  });
  const [password, setPassword] = useState('warden123');
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showForgotBox, setShowForgotBox] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState<string | null>(null);

  // Register state
  const [name, setName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [hostelName, setHostelName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTab(initialTab);
    setError(null);
    setShowForgotBox(false);
    setForgotStatus(null);
  }, [initialTab]);

  const switchTab = (nextTab: 'login' | 'register') => {
    setTab(nextTab);
    setError(null);
    setShowForgotBox(false);
    setForgotStatus(null);
    onTabChange?.(nextTab);
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedIdentifier = identifier.trim();
    if (!trimmedIdentifier) {
      setError('Please enter your email address or username.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setBusy(true);
    try {
      const res = await api.login(trimmedIdentifier, password);
      if (typeof window !== 'undefined') {
        if (rememberMe) {
          window.localStorage.setItem(REMEMBER_KEY, trimmedIdentifier);
        } else {
          window.localStorage.removeItem(REMEMBER_KEY);
        }
      }
      onAuthenticated(res.user, res.tenant);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email/username or password.');
    } finally {
      setBusy(false);
    }
  };

  const handleForgotSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = forgotEmail.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setForgotStatus('Enter a valid email address to receive reset instructions.');
      return;
    }
    setForgotStatus(
      `If ${trimmed} matches a registered NivasDesk account, reset instructions have been queued. Contact your PG workspace owner or support@nivasdesk.example for immediate staff resets.`
    );
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    const trimmedEmail = regEmail.trim();
    const trimmedPhone = phone.trim();
    const phoneDigits = trimmedPhone.replace(/\D/g, '');

    if (!trimmedName) {
      setError('Full name is required.');
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (phoneDigits.length < 10) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (regPassword !== confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }

    setBusy(true);
    try {
      const res = await api.registerWorkspace({
        name: trimmedName,
        wardenName: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
        hostelName: hostelName.trim() || `${trimmedName}'s PG`,
        city: 'Chennai',
        district: 'Chennai',
        password: regPassword,
      });
      onAuthenticated(res.user, res.tenant);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleDemoEnter = async (tenantId: string, role?: UserRole) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.demoSwitch(tenantId, role);
      onAuthenticated(res.user, res.tenant);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enter sample workspace.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Navbar consistent with Dashboard & Landing Theme */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={onBackToLanding}
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 text-left"
          >
            NivasDesk
          </button>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <LanguageToggle size="sm" language={uiLanguage} onChange={setUiLanguage} />
            {onBackToLanding && (
              <button
                type="button"
                onClick={onBackToLanding}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 typo-btn text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors whitespace-nowrap"
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tr('Home')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => switchTab('login')}
              className={`min-h-9 rounded-md border px-3.5 py-1.5 typo-btn font-semibold transition-colors whitespace-nowrap shrink-0 ${
                tab === 'login'
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50'
              }`}
            >
              {tr('Login')}
            </button>
            <button
              type="button"
              onClick={() => switchTab('register')}
              className={`min-h-9 rounded-md px-3.5 py-1.5 typo-btn font-semibold transition-colors whitespace-nowrap shrink-0 ${
                tab === 'register'
                  ? 'bg-teal-800 text-white ring-2 ring-teal-700/30'
                  : 'bg-teal-700 text-white hover:bg-teal-800'
              }`}
            >
              {tr('Register')}
            </button>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-5xl grid grid-cols-1 gap-10 lg:grid-cols-12 items-start">
          {/* Left Context & Sample Workspaces */}
          <div className="space-y-6 lg:col-span-6 lg:pt-2">
            <div>
              {onBackToLanding && (
                <button
                  type="button"
                  onClick={onBackToLanding}
                  className="mb-3 inline-flex items-center gap-1.5 typo-btn text-slate-600 hover:text-slate-900 underline underline-offset-4"
                >
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tr('Back to NivasDesk Home')}</span>
                </button>
              )}
              <h1 className="typo-dashboard-title text-slate-900">
                {tr(
                  tab === 'login'
                    ? 'Sign in to your PG workspace.'
                    : 'Create your NivasDesk account.'
                )}
              </h1>
              <p className="mt-2.5 typo-body text-slate-600">
                {tr(
                  'Manage rooms, vacant beds, tenant check-ins, masked Aadhaar records, and monthly rent from one clean dashboard.'
                )}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-xs">
              <div className="flex items-center gap-2 typo-helper font-semibold uppercase tracking-wide text-slate-500">
                <ShieldCheck className="h-4 w-4 text-teal-700" aria-hidden="true" />
                <span>{tr('Three-Tier Role Sites (Quick Enter)')}</span>
              </div>
              <p className="typo-helper text-slate-600">
                {tr(
                  'Enter any role portal directly to inspect platform administration, multi-PG ownership, or daily warden operations.'
                )}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    handleDemoEnter(sampleWorkspaces[0]?.tenantId || 'ten_lakshmi_pg', 'overall_admin')
                  }
                  className="rounded-lg border border-slate-900 bg-slate-900 p-3 text-left text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4 text-teal-400" aria-hidden="true" />
                  <p className="mt-2 typo-btn font-bold">{tr('Overall Admin Dashboard')}</p>
                  <p className="mt-0.5 typo-helper text-slate-300">{tr('All Owners & PGs')}</p>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    handleDemoEnter(sampleWorkspaces[0]?.tenantId || 'ten_lakshmi_pg', 'owner')
                  }
                  className="rounded-lg border border-teal-700/30 bg-teal-50/60 p-3 text-left text-slate-900 hover:border-teal-700 transition-colors disabled:opacity-50"
                >
                  <Briefcase className="h-4 w-4 text-teal-700" aria-hidden="true" />
                  <p className="mt-2 typo-btn font-bold">{tr('Owner Dashboard')}</p>
                  <p className="mt-0.5 typo-helper text-slate-600">{tr('Branches & Wardens')}</p>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    handleDemoEnter(sampleWorkspaces[0]?.tenantId || 'ten_lakshmi_pg', 'warden')
                  }
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-left text-slate-900 hover:border-teal-700 transition-colors disabled:opacity-50"
                >
                  <UserCheck className="h-4 w-4 text-slate-700" aria-hidden="true" />
                  <p className="mt-2 typo-btn font-bold">{tr('Warden Dashboard')}</p>
                  <p className="mt-0.5 typo-helper text-slate-600">{tr('Beds, Guests & Rent')}</p>
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-xs">
              <div className="flex items-center gap-2 typo-helper font-semibold uppercase tracking-wide text-slate-500">
                <Building2 className="h-4 w-4 text-teal-700" aria-hidden="true" />
                <span>{tr('Sample PG Workspaces')}</span>
              </div>
              <p className="typo-helper text-slate-600">
                {tr('Explore pre-populated PG workspaces with isolated guest, bed, and payment records.')}
              </p>
              <div className="space-y-2.5 pt-1">
                {sampleWorkspaces.map((ws) => (
                  <button
                    key={ws.tenantId}
                    type="button"
                    disabled={busy}
                    onClick={() => handleDemoEnter(ws.tenantId)}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-left hover:border-teal-700 hover:bg-teal-50/40 transition-colors disabled:opacity-50"
                  >
                    <div className="min-w-0 pr-3">
                      <p className="truncate typo-card-title font-semibold text-slate-900">{ws.name}</p>
                      <p className="truncate typo-helper text-slate-500">
                        {ws.city} · {ws.wardenEmail}
                      </p>
                    </div>
                    <span className="typo-btn font-semibold text-teal-700 whitespace-nowrap shrink-0">
                      {tr('Open Demo →')}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-2.5 typo-helper text-slate-500">
              <ShieldCheck className="h-4 w-4 shrink-0 text-teal-700 mt-0.5" aria-hidden="true" />
              <span>
                {tr(
                  'Hostel operations management software only — does not obtain government licences or guarantee regulatory compliance.'
                )}
              </span>
            </div>
          </div>

          {/* Right Auth Form Card */}
          <div className="lg:col-span-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
              <div className="mb-6">
                <h2 className="typo-page-title text-slate-900">
                  {tr(tab === 'login' ? 'Login' : 'Create Account')}
                </h2>
                <p className="mt-1 typo-body text-slate-600">
                  {tr(
                    tab === 'login'
                      ? 'Enter your email address or username and password.'
                      : 'Fill in your details below to register your PG workspace.'
                  )}
                </p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mb-4 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 typo-body font-medium text-red-800"
                >
                  {tr(error)}
                </div>
              )}

              {tab === 'login' ? (
                <div className="space-y-4">
                  <form onSubmit={handleLogin} noValidate className="space-y-4">
                    <div>
                      <label
                        htmlFor="auth-identifier"
                        className="block typo-label font-semibold text-slate-700"
                      >
                        {tr('Email address or username')}
                      </label>
                      <input
                        id="auth-identifier"
                        type="text"
                        required
                        autoComplete="username"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder={tr('owner@cauverypg.example or username')}
                        className="mt-1.5 block w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 typo-input text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="auth-password"
                        className="block typo-label font-semibold text-slate-700"
                      >
                        {tr('Password')}
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          id="auth-password"
                          type={showLoginPassword ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={tr('Enter your password')}
                          className="block w-full rounded-md border border-slate-300 bg-white py-2.5 pl-3.5 pr-10 typo-input text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword((prev) => !prev)}
                          aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-900"
                        >
                          {showLoginPassword ? (
                            <EyeOff className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <Eye className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                      <label className="inline-flex items-center gap-2 typo-label text-slate-700 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 accent-teal-700"
                        />
                        <span>{tr('Remember me')}</span>
                      </label>

                      <button
                        type="button"
                        onClick={() => {
                          setShowForgotBox((prev) => !prev);
                          setForgotStatus(null);
                        }}
                        className="typo-btn font-semibold text-teal-700 hover:text-teal-800 hover:underline underline-offset-4"
                      >
                        {tr('Forgot password?')}
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={busy}
                      className="flex w-full min-h-11 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2.5 typo-btn font-semibold text-white hover:bg-teal-800 transition-colors disabled:opacity-50"
                    >
                      <KeyRound className="h-4 w-4" aria-hidden="true" />
                      <span>{tr(busy ? 'Logging in...' : 'Login')}</span>
                    </button>
                  </form>

                  {showForgotBox && (
                    <form
                      onSubmit={handleForgotSubmit}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 space-y-2.5"
                    >
                      <p className="typo-label font-semibold text-slate-900">{tr('Reset Password')}</p>
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          placeholder={tr('Enter account email')}
                          aria-label="Reset password email"
                          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 typo-input text-slate-900 focus:border-teal-700 focus:outline-none"
                        />
                        <button
                          type="submit"
                          className="rounded-md bg-slate-900 px-3 py-1.5 typo-btn font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                        >
                          {tr('Send Link')}
                        </button>
                      </div>
                      {forgotStatus && (
                        <p className="typo-helper text-slate-700 leading-relaxed">{tr(forgotStatus)}</p>
                      )}
                    </form>
                  )}

                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 typo-helper text-slate-600 space-y-1">
                    <p className="font-semibold text-slate-800">
                      {tr('Sample login')} ({tr('Password')}: <span className="font-mono">warden123</span>):
                    </p>
                    <p className="font-mono typo-helper break-all">
                      admin@nivasdesk.example ({tr('Overall Admin')}) · owner@cauverypg.example ({tr('Owner')}) · warden@cauverypg.example ({tr('Warden')}) · staff@cauverypg.example ({tr('Staff')})
                    </p>
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <button
                      type="button"
                      onClick={() => switchTab('register')}
                      className="flex w-full min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn font-semibold text-slate-900 hover:bg-slate-50 transition-colors"
                    >
                      {tr('Create an Account')}
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleRegister} noValidate className="space-y-3.5">
                  <div>
                    <label htmlFor="reg-name" className="block typo-label font-semibold text-slate-700">
                      {tr('Full Name')}
                    </label>
                    <input
                      id="reg-name"
                      type="text"
                      required
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Aravindhan S"
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3.5 py-2 typo-input text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="reg-email" className="block typo-label font-semibold text-slate-700">
                        {tr('Email Address')}
                      </label>
                      <input
                        id="reg-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        placeholder="owner@vaigaipg.in"
                        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3.5 py-2 typo-input text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-phone" className="block typo-label font-semibold text-slate-700">
                        {tr('Phone Number')}
                      </label>
                      <input
                        id="reg-phone"
                        type="tel"
                        required
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3.5 py-2 typo-input text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reg-hostel" className="block typo-label font-semibold text-slate-700">
                      {tr('Hostel / PG Name')}{' '}
                      <span className="font-normal text-slate-500">({tr('optional')})</span>
                    </label>
                    <input
                      id="reg-hostel"
                      type="text"
                      value={hostelName}
                      onChange={(e) => setHostelName(e.target.value)}
                      placeholder="e.g., Vaigai Men's PG"
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3.5 py-2 typo-input text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="reg-pass" className="block typo-label font-semibold text-slate-700">
                      {tr('Password')}{' '}
                      <span className="font-normal text-slate-500">({tr('min 6 characters')})</span>
                    </label>
                    <div className="relative mt-1">
                      <input
                        id="reg-pass"
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder={tr('Create a password')}
                        className="block w-full rounded-md border border-slate-300 bg-white py-2 pl-3.5 pr-10 typo-input text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPassword((prev) => !prev)}
                        aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-900"
                      >
                        {showRegPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="reg-confirm-pass"
                      className="block typo-label font-semibold text-slate-700"
                    >
                      {tr('Confirm Password')}
                    </label>
                    <div className="relative mt-1">
                      <input
                        id="reg-confirm-pass"
                        type={showConfirmPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={tr('Re-enter your password')}
                        className="block w-full rounded-md border border-slate-300 bg-white py-2 pl-3.5 pr-10 typo-input text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-900"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="flex w-full min-h-11 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 py-2.5 typo-btn font-semibold text-white hover:bg-teal-800 transition-colors disabled:opacity-50"
                  >
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    <span>{tr(busy ? 'Creating account...' : 'Create Account')}</span>
                  </button>

                  <p className="pt-2 text-center typo-body text-slate-600">
                    {tr('Already have an account?')}{' '}
                    <button
                      type="button"
                      onClick={() => switchTab('login')}
                      className="typo-btn font-semibold text-teal-700 hover:text-teal-800 hover:underline underline-offset-4"
                    >
                      {tr('Login')}
                    </button>
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
