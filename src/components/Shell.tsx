import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BarChart3,
  BedDouble,
  Bell,
  BellRing,
  Briefcase,
  Building2,
  CalendarClock,
  Camera,
  IndianRupee,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareWarning,
  Pencil,
  ReceiptIndianRupee,
  Search,
  Settings,
  User as UserIcon,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { api, type SearchResultItem } from '../lib/api';
import { t, tr, type NavKey } from '../lib/i18n';
import type {
  PreferredLanguage,
  Tenant,
  User,
  UserRole,
} from '../types/domain';
import { LanguageToggle } from './LanguageToggle';
import { UserAvatar } from './UserAvatar';
import type { ProfileModalTab } from './UserProfileModal';

export type NavTab = NavKey;

interface ShellProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  tenant: Tenant;
  user: User;
  uiLanguage: PreferredLanguage;
  onToggleLanguage: (lang: PreferredLanguage) => void;
  sampleWorkspaces: Array<{
    tenantId: string;
    name: string;
    city: string;
    wardenEmail: string;
  }>;
  onOpenGuest: (guestId: string) => void;
  onOpenProfileModal: (tab: ProfileModalTab) => void;
  onSwitchWorkspace: (tenantId: string, role?: UserRole) => void;
  onResetSampleData?: () => void;
  resetBusy?: boolean;
  onLogout: () => void;
  children: ReactNode;
}

interface NavItemDef {
  id: NavTab;
  i18nKey: string;
  icon: typeof LayoutDashboard;
}

const ADMIN_NAV_ITEMS: NavItemDef[] = [
  { id: 'admin-overview', i18nKey: 'nav.admin-overview', icon: LayoutDashboard },
  { id: 'admin-owners', i18nKey: 'nav.admin-owners', icon: Users },
  { id: 'admin-workspaces', i18nKey: 'nav.admin-workspaces', icon: Building2 },
  { id: 'admin-tenants', i18nKey: 'nav.admin-tenants', icon: UserCheck },
  { id: 'admin-wardens', i18nKey: 'nav.admin-wardens', icon: Briefcase },
  { id: 'admin-payments', i18nKey: 'nav.admin-payments', icon: IndianRupee },
  { id: 'admin-complaints', i18nKey: 'nav.admin-complaints', icon: MessageSquareWarning },
  { id: 'admin-reports', i18nKey: 'nav.admin-reports', icon: BarChart3 },
  { id: 'admin-notifications', i18nKey: 'nav.admin-notifications', icon: Bell },
];

const OWNER_NAV_ITEMS: NavItemDef[] = [
  { id: 'owner-overview', i18nKey: 'nav.owner-overview', icon: LayoutDashboard },
  { id: 'owner-properties', i18nKey: 'nav.owner-properties', icon: Building2 },
  { id: 'owner-rooms', i18nKey: 'nav.owner-rooms', icon: BedDouble },
  { id: 'owner-tenants', i18nKey: 'nav.owner-tenants', icon: Users },
  { id: 'owner-rent', i18nKey: 'nav.owner-rent', icon: IndianRupee },
  { id: 'owner-payments', i18nKey: 'nav.owner-payments', icon: ReceiptIndianRupee },
  { id: 'owner-wardens', i18nKey: 'nav.owner-wardens', icon: UserCheck },
  { id: 'owner-complaints', i18nKey: 'nav.owner-complaints', icon: MessageSquareWarning },
  { id: 'owner-notifications', i18nKey: 'nav.owner-notifications', icon: Bell },
];

const WARDEN_NAV_ITEMS: NavItemDef[] = [
  { id: 'dashboard', i18nKey: 'nav.dashboard', icon: LayoutDashboard },
  { id: 'rooms', i18nKey: 'nav.rooms', icon: BedDouble },
  { id: 'guests', i18nKey: 'nav.guests', icon: Users },
  { id: 'stays', i18nKey: 'nav.stays', icon: CalendarClock },
  { id: 'payments', i18nKey: 'nav.payments', icon: IndianRupee },
  { id: 'expenses', i18nKey: 'nav.expenses', icon: ReceiptIndianRupee },
  { id: 'reminders', i18nKey: 'nav.reminders', icon: BellRing },
  { id: 'reports', i18nKey: 'nav.reports', icon: BarChart3 },
  { id: 'settings', i18nKey: 'nav.settings', icon: Settings },
];

function formatRoleLabel(role: UserRole): string {
  if (role === 'overall_admin') return 'Overall Admin';
  if (role === 'owner') return 'Owner';
  if (role === 'warden') return 'Warden';
  return 'Staff';
}

export function Shell({
  activeTab,
  onSelectTab,
  tenant,
  user,
  uiLanguage,
  onToggleLanguage,
  sampleWorkspaces,
  onOpenGuest,
  onOpenProfileModal,
  onSwitchWorkspace,
  onResetSampleData,
  resetBusy,
  onLogout,
  children,
}: ShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const mainScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mainScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeTab]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.searchGuests(q);
        setSearchResults(res.results);
        setSearchOpen(true);
      } catch {
        setSearchResults([]);
      }
    }, 180);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (searchRef.current && !searchRef.current.contains(target)) {
        setSearchOpen(false);
      }
      if (accountRef.current && !accountRef.current.contains(target)) {
        setAccountOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setAccountOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const navSections: Array<{ label: string; items: NavItemDef[] }> = [];
  if (user.role === 'overall_admin') {
    navSections.push({ label: 'Admin Menu', items: ADMIN_NAV_ITEMS });
  } else if (user.role === 'owner') {
    navSections.push({ label: 'Owner Menu', items: OWNER_NAV_ITEMS });
  } else {
    navSections.push({ label: 'Warden Site', items: WARDEN_NAV_ITEMS });
  }

  const activeSiteLabel = activeTab.startsWith('admin-')
    ? 'Admin Portal'
    : activeTab.startsWith('owner-')
      ? 'Owner Portal'
      : 'Warden Operations';

  const navContent = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 px-5">
        <div className="min-w-0">
          <span className="typo-section-heading tracking-tight text-white whitespace-nowrap">
            NivasDesk
          </span>
          <p className="typo-helper font-semibold uppercase tracking-wider text-teal-400">
            {tr(uiLanguage, formatRoleLabel(user.role))}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close navigation menu"
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-5 px-3 py-4 overflow-y-auto" aria-label="Primary navigation">
        {navSections.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-3 pb-1 typo-helper font-semibold uppercase tracking-wider text-slate-400">
              {tr(uiLanguage, group.label)}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 typo-sidebar-item transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{t(uiLanguage, item.i18nKey)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-slate-800 p-4 typo-helper text-slate-400">
        {user.role === 'overall_admin' ? (
          <>
            <p className="typo-helper uppercase tracking-wider text-slate-500">
              {tr(uiLanguage, 'Admin Account')}
            </p>
            <p className="mt-0.5 truncate typo-body font-medium text-slate-200">{user.name}</p>
            <p className="mt-0.5 truncate typo-helper">{tr(uiLanguage, 'All PG Properties')}</p>
          </>
        ) : user.role === 'owner' ? (
          <>
            <p className="typo-helper uppercase tracking-wider text-slate-500">
              {tr(uiLanguage, 'Selected PG')}
            </p>
            <p className="mt-0.5 truncate typo-body font-medium text-slate-200">{tenant.name}</p>
            <p className="mt-0.5 truncate typo-helper">
              {[tenant.locality, tenant.district || tenant.city].filter(Boolean).join(', ')}
            </p>
          </>
        ) : (
          <>
            <p className="typo-helper uppercase tracking-wider text-slate-500">
              {tr(uiLanguage, 'Active Workspace')}
            </p>
            <p className="mt-0.5 truncate typo-body font-medium text-slate-200">{tenant.name}</p>
            <p className="mt-0.5 truncate typo-helper">
              {[tenant.locality, tenant.district || tenant.city, tenant.pincode]
                .filter(Boolean)
                .join(', ')}
            </p>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 print:h-auto print:overflow-visible">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:h-screen lg:w-64">
        {navContent}
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative h-full w-64 max-w-[80vw] shrink-0">{navContent}</aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden lg:pl-64 print:h-auto print:overflow-visible print:pl-0">
        {/* Top Bar */}
        <header className="shrink-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="typo-helper font-semibold text-teal-700 leading-none">
                {tr(uiLanguage, activeSiteLabel)}
              </p>
              <p className="mt-1 truncate typo-card-title font-semibold text-slate-900 leading-none">
                {activeTab.startsWith('admin-') || activeTab.startsWith('owner-')
                  ? t(uiLanguage, `nav.${activeTab}`)
                  : tenant.name}
              </p>
            </div>
          </div>

          {/* Global Guest Search (Warden / Staff site only) */}
          {user.role !== 'overall_admin' && user.role !== 'owner' ? (
            <div ref={searchRef} className="relative hidden flex-1 max-w-md md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onFocus={() => {
                  if (searchResults.length > 0) setSearchOpen(true);
                }}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t(uiLanguage, 'common.searchGuests')}
                aria-label="Global guest search"
                className="w-full rounded-md border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-3 typo-input text-slate-900 focus:border-teal-700 focus:bg-white focus:outline-none"
              />

              {searchOpen && searchQuery.trim() && (
                <div className="absolute left-0 right-0 top-full mt-1.5 rounded-md border border-slate-200 bg-white shadow-lg z-40">
                  {searchResults.length === 0 ? (
                    <p className="px-4 py-3 typo-helper text-slate-500">
                      {tr(uiLanguage, 'No matching guests in this workspace.')}
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {searchResults.map((item) => (
                        <li key={item.guestId}>
                          <button
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              setSearchQuery('');
                              onOpenGuest(item.guestId);
                            }}
                            className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50"
                          >
                            <div>
                              <p className="typo-body font-medium text-slate-900">{item.fullName}</p>
                              <p className="font-mono typo-helper text-slate-500">
                                {item.primaryPhone} {item.idMasked ? `· ${item.idMasked}` : ''}
                              </p>
                            </div>
                            <span className="font-mono typo-body text-slate-600">{item.roomLabel}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="hidden flex-1 md:block" />
          )}

          {/* Language Toggle & Account Menu */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <LanguageToggle
              language={uiLanguage}
              onChange={onToggleLanguage}
            />

            <div ref={accountRef} className="relative flex items-center">
              <button
                type="button"
                onClick={() => setAccountOpen((o) => !o)}
                aria-label={`Open profile menu for ${user.name}`}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                title={`${user.name} (${tr(uiLanguage, formatRoleLabel(user.role))})`}
                className={`group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-teal-700 focus:ring-offset-1 ${
                  accountOpen
                    ? 'border-teal-700 ring-4 ring-teal-700/15'
                    : 'border-slate-200 hover:border-teal-600 hover:ring-4 hover:ring-teal-600/10'
                }`}
              >
                <UserAvatar
                  avatarUrl={user.avatarUrl}
                  name={user.name}
                  sizeClass="h-full w-full"
                  iconClass="h-5 w-5 transition-transform duration-150 group-hover:scale-105"
                />
              </button>

              {accountOpen && (
                <div
                  role="menu"
                  aria-label="User profile menu"
                  className="animate-dropdown-in absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-slate-200 bg-white shadow-lg z-40 py-1.5"
                >
                  {/* Profile Header inside Dropdown */}
                  <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setAccountOpen(false);
                        onOpenProfileModal('edit');
                      }}
                      title={tr(uiLanguage, 'Change profile picture')}
                      className="group relative shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-teal-700"
                    >
                      <UserAvatar
                        avatarUrl={user.avatarUrl}
                        name={user.name}
                        sizeClass="h-12 w-12 border border-slate-200"
                        iconClass="h-6 w-6"
                      />
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-xs transition-colors group-hover:bg-teal-700 group-hover:text-white group-hover:border-teal-700">
                        <Camera className="h-3 w-3" aria-hidden="true" />
                      </span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate typo-body font-semibold text-slate-900">{user.name}</p>
                      <p className="typo-helper font-semibold text-teal-700">
                        {tr(uiLanguage, formatRoleLabel(user.role))}
                      </p>
                      <p className="truncate typo-helper text-slate-500">{user.email}</p>
                    </div>
                  </div>

                  {/* Primary Profile Actions */}
                  <div className="border-b border-slate-100 py-1.5">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountOpen(false);
                        onOpenProfileModal('profile');
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-left typo-btn text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
                    >
                      <UserIcon className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      <span>{tr(uiLanguage, 'My Profile')}</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountOpen(false);
                        onOpenProfileModal('edit');
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-left typo-btn text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
                    >
                      <Pencil className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      <span>{tr(uiLanguage, 'Edit Profile')}</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountOpen(false);
                        onOpenProfileModal('settings');
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-left typo-btn text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
                    >
                      <Settings className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      <span>{tr(uiLanguage, 'Account Settings')}</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAccountOpen(false);
                        onOpenProfileModal('password');
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-left typo-btn text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
                    >
                      <KeyRound className="h-4 w-4 text-slate-500" aria-hidden="true" />
                      <span>{tr(uiLanguage, 'Change Password')}</span>
                    </button>
                  </div>

                  {sampleWorkspaces.length > 0 && user.role !== 'overall_admin' && (
                    <div className="border-b border-slate-100 py-1.5">
                      <p className="px-4 py-1 typo-helper font-medium uppercase tracking-wide text-slate-400">
                        {tr(uiLanguage, 'Switch Sample Hostel')}
                      </p>
                      {sampleWorkspaces.map((ws) => (
                        <button
                          key={ws.tenantId}
                          type="button"
                          onClick={() => {
                            setAccountOpen(false);
                            if (ws.tenantId !== tenant.id) {
                              onSwitchWorkspace(ws.tenantId, user.role);
                            }
                          }}
                          className={`flex w-full items-center justify-between px-4 py-1.5 text-left typo-btn transition-colors hover:bg-slate-50 ${
                            ws.tenantId === tenant.id
                              ? 'font-semibold text-teal-800 bg-teal-50/50'
                              : 'text-slate-700'
                          }`}
                        >
                          <span className="truncate">{ws.name}</span>
                          {ws.tenantId === tenant.id && (
                            <span className="typo-helper">{tr(uiLanguage, 'Active')}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountOpen(false);
                      onLogout();
                    }}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-left typo-btn text-red-700 transition-colors hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    <span>{tr(uiLanguage, 'Logout')}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Main Content Area */}
        <div
          ref={mainScrollRef}
          className="flex-1 overflow-y-auto overflow-x-hidden print:overflow-visible"
        >
          {/* Prototype Sample Data Notice */}
          {tenant.isSample && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50/70 px-4 py-2 typo-body text-amber-900 sm:px-6">
              <span>
                <span className="font-semibold">{tr(uiLanguage, 'Sample PG Data:')}</span>{' '}
                {tr(uiLanguage, 'Realistic Tamil Nadu hostel records for demonstration.')}{' '}
                {t(uiLanguage, 'compliance.notice')}
              </span>
              {onResetSampleData && (
                <button
                  type="button"
                  onClick={onResetSampleData}
                  disabled={resetBusy}
                  className="rounded border border-amber-300 bg-white px-2.5 py-1 typo-btn text-amber-900 hover:bg-amber-100 disabled:opacity-50 whitespace-nowrap"
                >
                  {resetBusy
                    ? tr(uiLanguage, 'Resetting...')
                    : tr(uiLanguage, 'Reset Sample Data')}
                </button>
              )}
            </div>
          )}

          {/* Main Viewport */}
          <main className="mx-auto w-full max-w-[1320px] p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

