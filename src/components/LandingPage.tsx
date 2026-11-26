import { useState } from 'react';
import {
  BedDouble,
  Check,
  IndianRupee,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { Tenant, User, UserRole } from '../types/domain';
import { formatInr } from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';
import { DashboardPreviewSection } from './DashboardPreviewSection';
import { LanguageToggle } from './LanguageToggle';
import { PaywallCheckoutModal, type PricingTier } from './PaywallCheckoutModal';

interface LandingPageProps {
  isAuthenticated: boolean;
  userRole?: UserRole;
  onEnterDashboard: () => void;
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onPaidWorkspaceActivated: (user: User, tenant: Tenant) => void;
}

const LIFETIME_TIER: PricingTier = {
  id: 'better',
  label: 'Lifetime License',
  title: 'NivasDesk Lifetime Access',
  priceInr: 8999,
  summary: 'One-time license with no monthly subscriptions.',
  bullets: [
    'One-time payment',
    'No monthly subscription',
    'All essential PG management tools',
    'Tenant and rent management',
    'Room and bed tracking',
  ],
};

const FEATURES = [
  {
    icon: Users,
    title: 'Tenant Management',
    description: 'Easily add, view, and manage tenant details.',
  },
  {
    icon: IndianRupee,
    title: 'Rent Management',
    description: 'Track paid rent, pending rent, and payment history.',
  },
  {
    icon: BedDouble,
    title: 'Room & Bed Tracking',
    description: 'See occupied and vacant beds instantly.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Tenant Records',
    description: 'Keep tenant information organized with privacy-focused data handling.',
  },
];

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Register Your PG',
    description: 'Set up your PG details.',
  },
  {
    step: '02',
    title: 'Add Rooms & Tenants',
    description: 'Manage room numbers, beds, and tenants.',
  },
  {
    step: '03',
    title: 'Track Everything',
    description: 'Monitor rent, occupancy, and pending payments through your dashboard.',
  },
];

const HERO_ACTIVITY = [
  { name: 'Karthik Reddy', room: 'Room 101-A', detail: 'Rent Pending · Due today', amount: 9500, pending: true },
  { name: 'Arjun Nair', room: 'Room 102-A', detail: 'UPI Receipt #4109', amount: 8500, pending: false },
  { name: 'Rohan Kulkarni', room: 'Room 101-B', detail: 'Checked In · Masked Aadhaar', amount: 9500, pending: false },
  { name: 'Vikram Menon', room: 'Room 204-A', detail: 'Bank Transfer #4108', amount: 9000, pending: false },
];

export function LandingPage({
  isAuthenticated,
  userRole,
  onEnterDashboard,
  onOpenLogin,
  onOpenRegister,
  onPaidWorkspaceActivated,
}: LandingPageProps) {
  const { uiLanguage, setUiLanguage, tr } = useLanguage();
  const [checkoutTier, setCheckoutTier] = useState<PricingTier | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Slim Dashboard-Themed Navbar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            NivasDesk
          </a>

          <div className="flex items-center gap-4 sm:gap-6 shrink-0">
            <nav
              aria-label="Primary navigation"
              className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
            >
              <a
                href="#top"
                className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
              >
                {tr('Home')}
              </a>
              <a
                href="#features"
                className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
              >
                {tr('Features')}
              </a>
              <a
                href="#dashboard-preview"
                className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
              >
                {tr('Dashboard')}
              </a>
              <a
                href="#pricing"
                className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
              >
                {tr('Pricing')}
              </a>
            </nav>

            <LanguageToggle size="sm" language={uiLanguage} onChange={setUiLanguage} />

            <div className="hidden md:flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onOpenLogin}
                className="min-h-9 rounded-md border border-slate-300 bg-white px-4 py-1.5 typo-btn font-semibold text-slate-900 hover:border-slate-400 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                {tr('Login')}
              </button>
              <button
                type="button"
                onClick={onOpenRegister}
                className="min-h-9 rounded-md bg-teal-700 px-4 py-1.5 typo-btn font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
              >
                {tr('Register')}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileNavOpen}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 md:hidden"
            >
              {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileNavOpen && (
          <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
            <nav aria-label="Mobile navigation" className="flex flex-col space-y-1 typo-body font-medium text-slate-700">
              <a
                href="#top"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-md px-3 py-2 hover:bg-slate-50"
              >
                {tr('Home')}
              </a>
              <a
                href="#features"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-md px-3 py-2 hover:bg-slate-50"
              >
                {tr('Features')}
              </a>
              <a
                href="#dashboard-preview"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-md px-3 py-2 hover:bg-slate-50"
              >
                {tr('Dashboard')}
              </a>
              <a
                href="#pricing"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-md px-3 py-2 hover:bg-slate-50"
              >
                {tr('Pricing')}
              </a>
            </nav>

            <div className="mt-3 grid grid-cols-2 gap-2.5 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  onOpenLogin();
                }}
                className="min-h-10 rounded-md border border-slate-300 bg-white px-3 py-2 typo-btn font-semibold text-slate-900 hover:bg-slate-50"
              >
                {tr('Login')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileNavOpen(false);
                  onOpenRegister();
                }}
                className="min-h-10 rounded-md bg-teal-700 px-3 py-2 typo-btn font-semibold text-white hover:bg-teal-800"
              >
                {tr('Register')}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section id="top" className="border-b border-slate-200 bg-white py-14 sm:py-20 lg:py-24 scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 items-center">
            {/* Left Copy */}
            <div className="lg:col-span-5 space-y-5">
              <p className="typo-helper font-semibold tracking-wider text-teal-700">
                {tr('SMART PG MANAGEMENT')}
              </p>

              <h1
                className="font-display font-extrabold tracking-tight text-slate-900 leading-[1.08]"
                style={{
                  fontSize: 'clamp(2.1rem, 3.8vw, 3.1rem)',
                  textWrap: 'balance',
                }}
              >
                {tr('Your PG. All in One Place.')}
              </h1>

              <p className="text-base leading-relaxed text-slate-600 sm:text-[17px]">
                {tr(
                  'Manage tenants, rooms, beds, monthly rent, and pending payments from one simple dashboard. No spreadsheets. No confusion.'
                )}
              </p>

              <div className="flex flex-wrap items-center gap-3.5 pt-2">
                <button
                  type="button"
                  onClick={onOpenRegister}
                  className="inline-flex min-h-11 items-center justify-center rounded-md bg-teal-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap"
                >
                  {tr('Get Started')}
                </button>
                <a
                  href="#dashboard-preview"
                  className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:border-slate-400 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  {tr('View Dashboard')}
                </a>
              </div>
            </div>

            {/* Right: Dashboard-Themed App Window Preview */}
            <div className="lg:col-span-7">
              <div className="rounded-xl border border-slate-200 bg-slate-50 shadow-sm overflow-hidden grid grid-cols-1 sm:grid-cols-12">
                {/* Mini Slate-900 Sidebar matching Shell.tsx */}
                <div className="hidden sm:flex sm:col-span-4 flex-col justify-between bg-slate-900 p-4 text-slate-100">
                  <div className="space-y-4">
                    <p className="font-display text-sm font-bold tracking-tight text-white border-b border-slate-800 pb-3">
                      NivasDesk
                    </p>
                    <div className="space-y-1 typo-sidebar-item">
                      <div className="flex items-center gap-2 rounded-md bg-teal-700 px-2.5 py-2 text-white">
                        <LayoutDashboard className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{tr('Dashboard')}</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-md px-2.5 py-2 text-slate-300">
                        <BedDouble className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{tr('Rooms & Beds')}</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-md px-2.5 py-2 text-slate-300">
                        <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{tr('Guests')}</span>
                      </div>
                      <div className="flex items-center gap-2 rounded-md px-2.5 py-2 text-slate-300">
                        <IndianRupee className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>{tr('Payments')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-slate-800 pt-3 typo-helper text-slate-400">
                    <p className="font-medium text-slate-200 truncate">Sri Lakshmi Men’s PG</p>
                    <p className="truncate">Koramangala, Bengaluru</p>
                  </div>
                </div>

                {/* Main Dashboard Preview Canvas */}
                <div className="sm:col-span-8 bg-slate-50">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
                    <p className="typo-body font-bold text-slate-900">{tr('Monthly Overview')}</p>
                    {isAuthenticated ? (
                      <button
                        type="button"
                        onClick={onEnterDashboard}
                        className="typo-btn font-semibold text-teal-700 hover:underline underline-offset-4 whitespace-nowrap"
                      >
                        {tr('Open Live App →')}
                      </button>
                    ) : (
                      <a
                        href="#dashboard-preview"
                        className="typo-btn font-semibold text-teal-700 hover:underline underline-offset-4 whitespace-nowrap"
                      >
                        {tr('Interactive Desk →')}
                      </a>
                    )}
                  </div>

                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="typo-helper text-slate-500">{tr('Total Rooms')}</p>
                        <p className="mt-1 font-mono typo-section-heading text-slate-900 tabular-nums">16</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="typo-helper text-slate-500">{tr('Occupied Beds')}</p>
                        <p className="mt-1 font-mono typo-section-heading text-slate-900 tabular-nums">44/48</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="typo-helper text-slate-500">{tr('Vacant Beds')}</p>
                        <p className="mt-1 font-mono typo-section-heading text-teal-700 tabular-nums">4</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3 sm:col-span-2">
                        <p className="typo-helper text-slate-500">{tr('Monthly Revenue')}</p>
                        <p className="mt-1 font-mono typo-section-heading text-slate-900 tabular-nums">
                          {formatInr(374000)}
                        </p>
                      </div>
                      <div className="col-span-2 sm:col-span-1 rounded-lg border border-red-200 bg-red-50/40 p-3">
                        <p className="typo-helper font-medium text-red-700">{tr('Rent Pending')}</p>
                        <p className="mt-1 font-mono typo-section-heading text-red-700 tabular-nums">
                          {formatInr(26500)}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white">
                      <div className="flex items-center justify-between border-b border-slate-200 px-3.5 py-2">
                        <p className="typo-body font-semibold text-slate-900">
                          {tr('Recent Tenant Activity')}
                        </p>
                        <span className="typo-helper text-slate-500">{tr('Today')}</span>
                      </div>
                      <div className="divide-y divide-slate-200">
                        {HERO_ACTIVITY.map((item) => (
                          <div
                            key={item.room}
                            className="flex items-center justify-between gap-2 px-3.5 py-2 typo-body"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 truncate">{item.name}</p>
                              <p className="typo-helper text-slate-500 truncate">
                                <span className="font-mono">{tr(item.room)}</span> · {tr(item.detail)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-mono font-semibold text-slate-900 tabular-nums">
                                {formatInr(item.amount)}
                              </p>
                              <p
                                className={`typo-helper font-semibold ${
                                  item.pending ? 'text-red-700' : 'text-teal-700'
                                }`}
                              >
                                {tr(item.pending ? 'Pending' : 'Paid')}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard Preview Section */}
      <section
        id="dashboard-preview"
        className="border-b border-slate-200 bg-slate-50 py-16 sm:py-20 scroll-mt-16"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl space-y-2 mb-8">
            <p className="typo-helper font-semibold tracking-wider text-teal-700">
              {tr('DASHBOARD PREVIEW')}
            </p>
            <h2
              className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
              style={{ textWrap: 'balance' }}
            >
              {tr('See your entire PG at a glance.')}
            </h2>
            <p className="typo-body text-slate-600">
              {tr(
                'Monitor occupancy, monthly rent collections, pending dues, and tenant records—plus try assigning a bed live below.'
              )}
            </p>
          </div>

          <DashboardPreviewSection
            onSelectBuy={() => setCheckoutTier(LIFETIME_TIER)}
            isAuthenticated={isAuthenticated}
            onEnterDashboard={onEnterDashboard}
          />
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="border-b border-slate-200 bg-white py-16 sm:py-20 scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl space-y-2">
            <p className="typo-helper font-semibold tracking-wider text-teal-700">
              {tr('FEATURES')}
            </p>
            <h2
              className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
              style={{ textWrap: 'balance' }}
            >
              {tr('Everything Your PG Needs')}
            </h2>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-4 typo-card-title text-slate-900">
                    {tr(item.title)}
                  </h3>
                  <p className="mt-2 typo-body text-slate-600">
                    {tr(item.description)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="border-b border-slate-200 bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl space-y-2">
            <p className="typo-helper font-semibold tracking-wider text-teal-700">
              {tr('HOW IT WORKS')}
            </p>
            <h2
              className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
              style={{ textWrap: 'balance' }}
            >
              {tr('Up and running in minutes.')}
            </h2>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
            {HOW_IT_WORKS.map((item) => (
              <div
                key={item.step}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs"
              >
                <p className="font-mono typo-body font-bold text-teal-700 tabular-nums">
                  {item.step}
                </p>
                <h3 className="mt-3 typo-card-title text-slate-900">
                  {tr(item.title)}
                </h3>
                <p className="mt-2 typo-body text-slate-600">
                  {tr(item.description)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="border-b border-slate-200 bg-white py-16 sm:py-20 scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-xl text-center space-y-2">
            <p className="typo-helper font-semibold tracking-wider text-teal-700">
              {tr('PRICING')}
            </p>
            <h2
              className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
              style={{ textWrap: 'balance' }}
            >
              {tr('Simple one-time payment.')}
            </h2>
          </div>

          <div className="mx-auto mt-10 max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <p className="typo-helper font-semibold text-teal-700">{tr('One-time payment')}</p>
            <h3 className="mt-2 typo-page-title text-slate-900">
              {tr('NivasDesk Lifetime Access')}
            </h3>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="font-mono text-4xl font-extrabold text-slate-900 tabular-nums">
                {formatInr(LIFETIME_TIER.priceInr)}
              </span>
              <span className="typo-body text-slate-500">{tr('one-time')}</span>
            </div>

            <ul className="mt-6 space-y-3 border-t border-slate-200 pt-6 typo-body text-slate-700">
              {LIFETIME_TIER.bullets.map((bullet) => (
                <li key={bullet} className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                  <span>{tr(bullet)}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setCheckoutTier(LIFETIME_TIER)}
              className="mt-8 w-full min-h-11 rounded-md bg-teal-700 px-5 py-3 typo-btn font-semibold text-white hover:bg-teal-800 transition-colors"
            >
              {tr('Buy Lifetime License')}
            </button>
          </div>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="bg-slate-900 text-slate-300 py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1.5">
              <a
                href="#top"
                className="font-display text-lg font-bold tracking-tight text-white inline-block"
              >
                NivasDesk
              </a>
              <p className="max-w-md typo-body text-slate-400">
                {tr('Simple PG management software to track tenants, rooms, beds, and monthly rent.')}
              </p>
            </div>

            <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-6 typo-body font-medium text-slate-300">
              <a href="#top" className="hover:text-white">
                {tr('Home')}
              </a>
              <a href="#features" className="hover:text-white">
                {tr('Features')}
              </a>
              <a href="#pricing" className="hover:text-white">
                {tr('Pricing')}
              </a>
              <button
                type="button"
                onClick={onOpenLogin}
                className="hover:text-white"
              >
                {tr('Login')}
              </button>
              <button
                type="button"
                onClick={onOpenRegister}
                className="hover:text-white"
              >
                {tr('Register')}
              </button>
            </nav>
          </div>

          <div className="mt-8 flex flex-col gap-2 border-t border-slate-800 pt-6 typo-helper text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>
              © {new Date().getFullYear()} NivasDesk. {tr('All rights reserved.')}
            </span>
            {isAuthenticated && (
              <button
                type="button"
                onClick={onEnterDashboard}
                className="typo-btn font-semibold text-teal-400 hover:text-teal-300 hover:underline underline-offset-4 text-left sm:text-right"
              >
                {tr(
                  userRole === 'overall_admin'
                    ? 'Open Overall Admin Dashboard'
                    : userRole === 'owner'
                      ? 'Open Owner Dashboard'
                      : 'Open Warden Dashboard'
                )}
              </button>
            )}
          </div>
        </div>
      </footer>

      <PaywallCheckoutModal
        tier={checkoutTier}
        onClose={() => setCheckoutTier(null)}
        onActivated={(activatedUser, activatedTenant) => {
          setCheckoutTier(null);
          onPaidWorkspaceActivated(activatedUser, activatedTenant);
        }}
      />
    </div>
  );
}
