import { useCallback, useEffect, useState } from 'react';
import { AddRoomModal } from './components/AddRoomModal';
import { AdminPortalView } from './components/AdminPortalView';
import { AuthScreen } from './components/AuthScreen';
import { ConfirmDialog } from './components/ConfirmDialog';
import { DashboardView } from './components/DashboardView';
import { DepositModal } from './components/DepositModal';
import { ExpensesView } from './components/ExpensesView';
import { GuestProfileDrawer } from './components/GuestProfileDrawer';
import { GuestsView } from './components/GuestsView';
import { LandingPage } from './components/LandingPage';
import {
  NotificationCenterModal,
  type NotificationCenterTab,
} from './components/NotificationCenterModal';
import { OwnerPortalView } from './components/OwnerPortalView';
import { PaymentsView } from './components/PaymentsView';
import { ReceiptModal } from './components/ReceiptModal';
import { RecordPaymentModal } from './components/RecordPaymentModal';
import { RegisterGuestModal } from './components/RegisterGuestModal';
import { RemindersView } from './components/RemindersView';
import { ReportsView } from './components/ReportsView';
import { RoomsView } from './components/RoomsView';
import { SettingsView } from './components/SettingsView';
import { Shell, type NavTab } from './components/Shell';
import { StaysView } from './components/StaysView';
import { UserProfileModal, type ProfileModalTab } from './components/UserProfileModal';
import {
  api,
  getSessionToken,
  type DashboardPayload,
  type WorkspaceOptionsPayload,
} from './lib/api';
import { tr } from './lib/i18n';
import { LanguageProvider } from './lib/LanguageContext';
import type {
  ClientNotification,
  EnrichedDeposit,
  EnrichedDocument,
  EnrichedPayment,
  EnrichedStay,
  NotificationCategory,
  NotificationFilterCategory,
  NotificationsPayload,
  PreferredLanguage,
  Room,
  Tenant,
  User,
  UserRole,
} from './types/domain';

const LANGUAGE_STORAGE_KEY = 'nivasdesk_ui_language';

function getStoredLanguage(): PreferredLanguage | null {
  try {
    const val = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return val === 'en' || val === 'ta' ? val : null;
  } catch {
    return null;
  }
}

function saveStoredLanguage(lang: PreferredLanguage) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // ignore storage errors
  }
}

function computeCategoryCounts(
  items: ClientNotification[]
): Record<NotificationFilterCategory, { total: number; unread: number }> {
  const categories: NotificationCategory[] = [
    'rent_reminders',
    'payment_alerts',
    'resident_updates',
    'complaints',
    'maintenance_alerts',
    'system_alerts',
  ];
  const counts: Record<NotificationFilterCategory, { total: number; unread: number }> = {
    all: { total: items.length, unread: items.filter((n) => !n.isRead).length },
    rent_reminders: { total: 0, unread: 0 },
    payment_alerts: { total: 0, unread: 0 },
    resident_updates: { total: 0, unread: 0 },
    complaints: { total: 0, unread: 0 },
    maintenance_alerts: { total: 0, unread: 0 },
    system_alerts: { total: 0, unread: 0 },
  };
  for (const cat of categories) {
    const matching = items.filter((n) => n.category === cat);
    counts[cat] = {
      total: matching.length,
      unread: matching.filter((n) => !n.isRead).length,
    };
  }
  return counts;
}

function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(784, ctx.currentTime);
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    // ignore autoplay restriction errors
  }
}

function defaultTabForRole(role: UserRole): NavTab {
  if (role === 'overall_admin') return 'admin-overview';
  if (role === 'owner') return 'owner-overview';
  return 'dashboard';
}

function pathForTab(tab: NavTab): string {
  if (tab === 'admin-owners') return '/admin/owners';
  if (tab === 'admin-workspaces') return '/admin/properties';
  if (tab === 'admin-tenants') return '/admin/tenants';
  if (tab === 'admin-wardens') return '/admin/staff';
  if (tab === 'admin-payments') return '/admin/payments';
  if (tab === 'admin-complaints') return '/admin/complaints';
  if (tab === 'admin-reports') return '/admin/reports';
  if (tab === 'admin-notifications') return '/admin/notifications';
  if (tab.startsWith('admin-')) return '/admin';
  if (tab === 'owner-properties') return '/owner/properties';
  if (tab === 'owner-rooms') return '/owner/rooms';
  if (tab === 'owner-tenants') return '/owner/tenants';
  if (tab === 'owner-rent') return '/owner/rent';
  if (tab === 'owner-payments') return '/owner/payments';
  if (tab === 'owner-wardens') return '/owner/staff';
  if (tab === 'owner-complaints') return '/owner/complaints';
  if (tab === 'owner-notifications') return '/owner/notifications';
  if (tab.startsWith('owner-')) return '/owner';
  return '/dashboard';
}

function resolveInitialRoute(): {
  viewMode: 'landing' | 'auth' | 'dashboard';
  authTab: 'login' | 'register';
  initialTab?: NavTab;
} {
  if (typeof window === 'undefined') {
    return { viewMode: 'landing', authTab: 'login' };
  }
  const rawPath = window.location.pathname.toLowerCase();
  const path = rawPath.length > 1 && rawPath.endsWith('/') ? rawPath.slice(0, -1) : rawPath;
  if (path === '/login') {
    return { viewMode: 'auth', authTab: 'login' };
  }
  if (path === '/register') {
    return { viewMode: 'auth', authTab: 'register' };
  }
  if (path === '/admin/owners') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'admin-owners' };
  }
  if (path === '/admin/properties' || path === '/admin/workspaces') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'admin-workspaces' };
  }
  if (path === '/admin/tenants') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'admin-tenants' };
  }
  if (path === '/admin/wardens' || path === '/admin/staff') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'admin-wardens' };
  }
  if (path === '/admin/payments') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'admin-payments' };
  }
  if (path === '/admin/complaints') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'admin-complaints' };
  }
  if (path === '/admin/reports') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'admin-reports' };
  }
  if (path === '/admin/notifications') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'admin-notifications' };
  }
  if (path === '/admin') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'admin-overview' };
  }
  if (path === '/owner/properties') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'owner-properties' };
  }
  if (path === '/owner/rooms') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'owner-rooms' };
  }
  if (path === '/owner/tenants') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'owner-tenants' };
  }
  if (path === '/owner/rent') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'owner-rent' };
  }
  if (path === '/owner/payments') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'owner-payments' };
  }
  if (path === '/owner/wardens' || path === '/owner/staff') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'owner-wardens' };
  }
  if (path === '/owner/complaints') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'owner-complaints' };
  }
  if (path === '/owner/notifications') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'owner-notifications' };
  }
  if (path === '/owner') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'owner-overview' };
  }
  if (path === '/dashboard') {
    return { viewMode: 'dashboard', authTab: 'login', initialTab: 'dashboard' };
  }
  return { viewMode: 'landing', authTab: 'login' };
}

export default function App() {
  const [bootLoading, setBootLoading] = useState(true);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [sampleWorkspaces, setSampleWorkspaces] = useState<
    Array<{ tenantId: string; name: string; city: string; wardenEmail: string }>
  >([]);

  const [initialRoute] = useState(resolveInitialRoute);
  const [viewMode, setViewMode] = useState<'landing' | 'auth' | 'dashboard'>(initialRoute.viewMode);
  const [authTab, setAuthTab] = useState<'login' | 'register'>(initialRoute.authTab);
  const [activeTab, setActiveTab] = useState<NavTab>(initialRoute.initialTab || 'dashboard');
  const [uiLanguage, setUiLanguage] = useState<PreferredLanguage>(
    () => getStoredLanguage() || 'en'
  );

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = uiLanguage === 'ta' ? 'ta' : 'en';
    }
  }, [uiLanguage]);

  const [period, setPeriod] = useState<string>('month');
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [customTo, setCustomTo] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceOptionsPayload | null>(null);
  const [notificationsData, setNotificationsData] = useState<NotificationsPayload | null>(null);
  const [notificationCenterState, setNotificationCenterState] = useState<{
    open: boolean;
    initialTab: NotificationCenterTab;
    initialCategory: NotificationFilterCategory;
  }>({ open: false, initialTab: 'history', initialCategory: 'all' });
  const [profileModalState, setProfileModalState] = useState<{
    open: boolean;
    tab: ProfileModalTab;
  }>({ open: false, tab: 'profile' });
  const [refreshKey, setRefreshKey] = useState(0);

  // Modals & Drawers
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [registerInitialFlow, setRegisterInitialFlow] = useState<'guest_only' | 'check_in'>('check_in');
  const [preselectedBedId, setPreselectedBedId] = useState<string | null>(null);
  const [preselectedGuestId, setPreselectedGuestId] = useState<string | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [preselectedPayment, setPreselectedPayment] = useState<EnrichedPayment | null>(null);
  const [addRoomModalOpen, setAddRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [depositModalState, setDepositModalState] = useState<{
    open: boolean;
    action: 'collect' | 'adjust' | 'refund';
    deposit?: EnrichedDeposit | null;
  }>({ open: false, action: 'collect', deposit: null });

  const [receiptPayment, setReceiptPayment] = useState<EnrichedPayment | null>(null);
  const [activeGuestId, setActiveGuestId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<EnrichedDocument | null>(null);
  const [checkoutTarget, setCheckoutTarget] = useState<EnrichedStay | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [smsBusyId, setSmsBusyId] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  const showToast = useCallback((kind: 'ok' | 'error', text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!user || !tenant) return;
    try {
      const notifRes = await api.getNotifications();
      setNotificationsData(notifRes);
    } catch {
      // keep existing notifications if transient error
    }
  }, [user, tenant]);

  const refreshWorkspaceData = useCallback(async () => {
    if (user?.role === 'overall_admin') {
      setDataError(null);
      setDataLoading(false);
      setRefreshKey((k) => k + 1);
      await loadNotifications();
      return;
    }
    setDataLoading(true);
    setDataError(null);
    try {
      const dashParams =
        period === 'custom'
          ? { period: 'custom', from: customFrom, to: customTo }
          : { period };
      const [dashRes, optionsRes] = await Promise.all([
        api.getDashboard(dashParams),
        api.getWorkspaceOptions(),
      ]);
      setDashboard(dashRes);
      setWorkspaceOptions(optionsRes);
      setRefreshKey((k) => k + 1);
      await loadNotifications();
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Failed to load workspace data.');
    } finally {
      setDataLoading(false);
    }
  }, [period, customFrom, customTo, user?.role, loadNotifications]);

  const navigateView = useCallback(
    (
      nextView: 'landing' | 'auth' | 'dashboard',
      nextAuthTab?: 'login' | 'register',
      nextTab?: NavTab
    ) => {
      if (nextAuthTab) setAuthTab(nextAuthTab);
      setViewMode(nextView);
      if (typeof window !== 'undefined') {
        const targetPath =
          nextView === 'landing'
            ? '/'
            : nextView === 'dashboard'
              ? pathForTab(nextTab || activeTab)
              : (nextAuthTab || authTab) === 'register'
                ? '/register'
                : '/login';
        if (window.location.pathname !== targetPath) {
          window.history.pushState({}, '', targetPath);
        }
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    [activeTab, authTab]
  );

  const handleSelectTab = useCallback(
    (nextTab: NavTab) => {
      let resolvedTab = nextTab;
      if (user?.role === 'overall_admin' && !nextTab.startsWith('admin-')) {
        resolvedTab = 'admin-overview';
      } else if (user?.role === 'owner' && !nextTab.startsWith('owner-')) {
        resolvedTab = 'owner-overview';
      }
      setActiveTab(resolvedTab);
      if (typeof window !== 'undefined' && viewMode === 'dashboard') {
        const targetPath = pathForTab(resolvedTab);
        if (window.location.pathname !== targetPath) {
          window.history.pushState({}, '', targetPath);
        }
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    [user?.role, viewMode]
  );

  useEffect(() => {
    const onPopState = () => {
      const resolved = resolveInitialRoute();
      setViewMode(resolved.viewMode);
      setAuthTab(resolved.authTab);
      if (resolved.initialTab) {
        let targetTab = resolved.initialTab;
        if (user?.role === 'overall_admin' && !targetTab.startsWith('admin-')) {
          targetTab = 'admin-overview';
        } else if (user?.role === 'owner' && !targetTab.startsWith('owner-')) {
          targetTab = 'owner-overview';
        } else if (
          user &&
          user.role !== 'overall_admin' &&
          user.role !== 'owner' &&
          (targetTab.startsWith('admin-') || targetTab.startsWith('owner-'))
        ) {
          targetTab = 'dashboard';
        }
        setActiveTab(targetTab);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [user]);

  useEffect(() => {
    (async () => {
      try {
        const session = await api.getSession();
        setSampleWorkspaces(session.sampleWorkspaces);
        const initial = resolveInitialRoute();
        const requestedTab = initial.initialTab;
        if (session.authenticated && session.tenant && session.user) {
          setTenant(session.tenant);
          setUser(session.user);
          const resolvedLang =
            session.user.preferredLanguage ||
            getStoredLanguage() ||
            session.tenant.preferredLanguage ||
            'en';
          setUiLanguage(resolvedLang);
          saveStoredLanguage(resolvedLang);
          let resolvedTab: NavTab;
          if (session.user.role === 'overall_admin') {
            resolvedTab =
              requestedTab && requestedTab.startsWith('admin-') ? requestedTab : 'admin-overview';
          } else if (session.user.role === 'owner') {
            resolvedTab =
              requestedTab && requestedTab.startsWith('owner-') ? requestedTab : 'owner-overview';
          } else {
            resolvedTab =
              requestedTab && !requestedTab.startsWith('admin-') && !requestedTab.startsWith('owner-')
                ? requestedTab
                : defaultTabForRole(session.user.role);
          }
          setActiveTab(resolvedTab);
          if (typeof window !== 'undefined' && initial.viewMode === 'dashboard') {
            const expectedPath = pathForTab(resolvedTab);
            if (window.location.pathname !== expectedPath) {
              window.history.replaceState({}, '', expectedPath);
            }
          }
        } else if (initial.viewMode === 'dashboard') {
          setAuthTab('login');
          setViewMode('auth');
          if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
            window.history.replaceState({}, '', '/login');
          }
        }
      } finally {
        setBootLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (tenant && user) {
      refreshWorkspaceData();
    }
  }, [tenant, user, refreshWorkspaceData]);

  // Real-time WebSocket Notification Subscription
  useEffect(() => {
    if (!user || !tenant) return;
    let disposed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = getSessionToken();
      const wsUrl = `${protocol}//${window.location.host}/ws/notifications${
        token ? `?token=${encodeURIComponent(token)}` : ''
      }`;
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'notification:created' && msg.notification) {
            const incoming = msg.notification as ClientNotification;
            setNotificationsData((prev) => {
              if (!prev) return prev;
              if (prev.notifications.some((n) => n.id === incoming.id)) {
                return prev;
              }
              const nextList = [incoming, ...prev.notifications];
              if (prev.preferences?.realTimeSound) {
                playNotificationChime();
              }
              return {
                ...prev,
                notifications: nextList,
                unreadCount: nextList.filter((n) => !n.isRead).length,
                categoryCounts: computeCategoryCounts(nextList),
              };
            });
            if (incoming.priority === 'urgent') {
              showToast('ok', `${incoming.title}: ${incoming.message}`);
            }
          } else if (msg.type === 'notification:read') {
            setNotificationsData((prev) => {
              if (!prev) return prev;
              const ids = msg.notificationIds;
              const nextList = prev.notifications.map((n) => {
                if (ids === 'all' || (Array.isArray(ids) && ids.includes(n.id))) {
                  return { ...n, isRead: true };
                }
                return n;
              });
              return {
                ...prev,
                notifications: nextList,
                unreadCount: nextList.filter((n) => !n.isRead).length,
                categoryCounts: computeCategoryCounts(nextList),
              };
            });
          } else if (msg.type === 'notification:sync') {
            loadNotifications();
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (!disposed) {
          reconnectTimer = window.setTimeout(connect, 4000);
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    };
  }, [user?.id, tenant?.id, loadNotifications, showToast]);

  const handleAuthenticated = (nextUser: User, nextTenant: Tenant) => {
    const nextDefaultTab = defaultTabForRole(nextUser.role);
    setDashboard(null);
    setWorkspaceOptions(null);
    setUser(nextUser);
    setTenant(nextTenant);
    const resolvedLang =
      nextUser.preferredLanguage ||
      getStoredLanguage() ||
      nextTenant.preferredLanguage ||
      'en';
    setUiLanguage(resolvedLang);
    saveStoredLanguage(resolvedLang);
    setActiveTab(nextDefaultTab);
    setActiveGuestId(null);
    navigateView('dashboard', undefined, nextDefaultTab);
  };

  const handleEnterDashboard = () => {
    if (tenant && user) {
      const target = defaultTabForRole(user.role);
      setActiveTab(target);
      navigateView('dashboard', undefined, target);
    } else {
      navigateView('auth', 'login');
    }
  };

  const handlePaidWorkspaceActivated = (nextUser: User, nextTenant: Tenant) => {
    handleAuthenticated(nextUser, nextTenant);
    showToast('ok', `Workspace activated! Welcome to ${nextTenant.name}.`);
  };

  const handleSwitchWorkspace = async (tenantId: string, role?: UserRole) => {
    try {
      const res = await api.demoSwitch(tenantId, role);
      const nextDefaultTab = defaultTabForRole(res.user.role);
      setActiveGuestId(null);
      setDashboard(null);
      setWorkspaceOptions(null);
      setTenant(res.tenant);
      setUser(res.user);
      const currentLang = getStoredLanguage() || uiLanguage;
      setUiLanguage(currentLang);
      saveStoredLanguage(currentLang);
      void api.updateAccountLanguage(currentLang).catch(() => {});
      setActiveTab(nextDefaultTab);
      if (typeof window !== 'undefined' && viewMode === 'dashboard') {
        const targetPath = pathForTab(nextDefaultTab);
        if (window.location.pathname !== targetPath) {
          window.history.pushState({}, '', targetPath);
        }
      }
      showToast(
        'ok',
        `Switched to ${res.user.role === 'overall_admin' ? 'Overall Admin Site' : res.user.role === 'owner' ? 'Owner Site' : 'Warden Site'} (${res.tenant.name}).`
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to switch workspace.');
    }
  };

  const handleOwnerSwitchProperty = async (
    tenantId: string,
    targetTab: NavTab = 'owner-overview'
  ) => {
    try {
      const res = await api.ownerSwitchProperty(tenantId);
      setActiveGuestId(null);
      setDashboard(null);
      setWorkspaceOptions(null);
      setTenant(res.tenant);
      setUser(res.user);
      const currentLang = getStoredLanguage() || uiLanguage;
      setUiLanguage(currentLang);
      handleSelectTab(targetTab);
      showToast('ok', `Active PG switched to ${res.tenant.name}.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not switch PG property.');
    }
  };

  const handleToggleLanguage = async (nextLang: PreferredLanguage) => {
    setUiLanguage(nextLang);
    saveStoredLanguage(nextLang);
    if (tenant && user) {
      try {
        const res = await api.updateAccountLanguage(nextLang);
        setUser(res.user);
        setTenant(res.tenant);
      } catch {
        // Keep local UI switch even if backend save is skipped
      }
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setTenant(null);
    setUser(null);
    setDashboard(null);
    setWorkspaceOptions(null);
    setNotificationsData(null);
    setNotificationCenterState({ open: false, initialTab: 'history', initialCategory: 'all' });
    setProfileModalState({ open: false, tab: 'profile' });
    navigateView('auth', 'login');
  };

  const handleMarkNotificationRead = useCallback(
    async (id: string) => {
      setNotificationsData((prev) => {
        if (!prev) return prev;
        const nextList = prev.notifications.map((n) =>
          n.id === id ? { ...n, isRead: true } : n
        );
        return {
          ...prev,
          notifications: nextList,
          unreadCount: nextList.filter((n) => !n.isRead).length,
          categoryCounts: computeCategoryCounts(nextList),
        };
      });
      try {
        await api.markNotificationRead(id);
      } catch {
        await loadNotifications();
      }
    },
    [loadNotifications]
  );

  const handleMarkAllNotificationsRead = useCallback(
    async (category: NotificationFilterCategory = 'all') => {
      try {
        await api.markAllNotificationsRead(category);
        await loadNotifications();
        showToast('ok', 'Notifications marked as read.');
      } catch (err) {
        showToast(
          'error',
          err instanceof Error ? err.message : 'Could not mark notifications as read.'
        );
      }
    },
    [loadNotifications, showToast]
  );

  const handleNavigateFromNotification = useCallback(
    (notif: ClientNotification) => {
      setNotificationCenterState((prev) => ({ ...prev, open: false }));
      if (!user) return;
      if (user.role === 'overall_admin') {
        if (notif.eventType === 'owner_registered') {
          handleSelectTab('admin-owners');
        } else if (notif.eventType === 'room_bed_availability') {
          handleSelectTab('admin-workspaces');
        } else if (notif.category === 'complaints') {
          handleSelectTab('admin-complaints');
        } else if (notif.category === 'payment_alerts' || notif.category === 'rent_reminders') {
          handleSelectTab('admin-payments');
        } else if (notif.category === 'resident_updates') {
          handleSelectTab('admin-tenants');
        } else {
          handleSelectTab('admin-overview');
        }
        return;
      }
      if (user.role === 'owner') {
        if (notif.targetTab === 'owner-wardens') {
          handleSelectTab('owner-wardens');
        } else if (notif.eventType === 'room_bed_availability') {
          handleSelectTab('owner-rooms');
        } else if (notif.category === 'complaints') {
          handleSelectTab('owner-complaints');
        } else if (notif.category === 'rent_reminders') {
          handleSelectTab('owner-rent');
        } else if (notif.category === 'payment_alerts') {
          handleSelectTab('owner-payments');
        } else if (notif.category === 'resident_updates') {
          handleSelectTab('owner-tenants');
        } else {
          handleSelectTab('owner-overview');
        }
        return;
      }
      const tab = notif.targetTab as NavTab | undefined;
      if (tab === 'guests' && notif.targetId && notif.targetId.startsWith('gst_')) {
        setActiveGuestId(notif.targetId);
      } else if (
        tab &&
        (tab === 'dashboard' ||
          tab === 'rooms' ||
          tab === 'guests' ||
          tab === 'stays' ||
          tab === 'payments' ||
          tab === 'expenses' ||
          tab === 'reminders' ||
          tab === 'reports' ||
          tab === 'settings')
      ) {
        handleSelectTab(tab);
      }
    },
    [user, handleSelectTab]
  );

  const handleConfirmCheckout = async () => {
    if (!checkoutTarget) return;
    setCheckoutBusy(true);
    try {
      await api.checkoutStay(checkoutTarget.id);
      showToast(
        'ok',
        `${checkoutTarget.guestName} checked out of Room ${checkoutTarget.roomNumber}-${checkoutTarget.bedLabel}. Bed marked vacant.`
      );
      setCheckoutTarget(null);
      await refreshWorkspaceData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Checkout failed.');
    } finally {
      setCheckoutBusy(false);
    }
  };

  const handleSendSmsReminder = async (payment: EnrichedPayment) => {
    setSmsBusyId(payment.id);
    try {
      const res = await api.sendPaymentReminderSms(payment.id);
      showToast('ok', res.message);
      await refreshWorkspaceData();
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not send reminder.');
      await refreshWorkspaceData();
    } finally {
      setSmsBusyId(null);
    }
  };

  const handleResetSampleData = async () => {
    setResetBusy(true);
    try {
      const res = await api.resetSampleData();
      setTenant(res.tenant);
      await refreshWorkspaceData();
      showToast('ok', 'Sample Tamil Nadu PG data restored across all modules.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to reset sample data.');
    } finally {
      setResetBusy(false);
    }
  };

  if (bootLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white typo-body text-neutral-600">
        {tr(uiLanguage, 'Loading NivasDesk...')}
      </div>
    );
  }

  return (
    <LanguageProvider language={uiLanguage} onChangeLanguage={handleToggleLanguage}>
      {viewMode === 'landing' ? (
        <LandingPage
          isAuthenticated={Boolean(tenant && user)}
          userRole={user?.role}
          onEnterDashboard={handleEnterDashboard}
          onOpenLogin={() => navigateView('auth', 'login')}
          onOpenRegister={() => navigateView('auth', 'register')}
          onPaidWorkspaceActivated={handlePaidWorkspaceActivated}
        />
      ) : viewMode === 'auth' || !tenant || !user ? (
        <AuthScreen
          initialTab={authTab}
          onTabChange={(nextTab) => navigateView('auth', nextTab)}
          sampleWorkspaces={sampleWorkspaces}
          onAuthenticated={handleAuthenticated}
          onBackToLanding={() => navigateView('landing')}
        />
      ) : (
        <Shell
      activeTab={activeTab}
      onSelectTab={handleSelectTab}
      tenant={tenant}
      user={user}
      uiLanguage={uiLanguage}
      onToggleLanguage={handleToggleLanguage}
      sampleWorkspaces={sampleWorkspaces}
      onOpenGuest={(guestId) => setActiveGuestId(guestId)}
      onOpenProfileModal={(tab) => setProfileModalState({ open: true, tab })}
      onSwitchWorkspace={handleSwitchWorkspace}
      onResetSampleData={handleResetSampleData}
      resetBusy={resetBusy}
      onLogout={handleLogout}
    >
      {toast && (
        <div
          role="status"
          className={`mb-4 flex items-center justify-between rounded-md border px-4 py-2.5 typo-body ${
            toast.kind === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          <span>{tr(uiLanguage, toast.text)}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-4 typo-btn underline"
          >
            {tr(uiLanguage, 'Dismiss')}
          </button>
        </div>
      )}

      {dataError &&
        activeTab !== 'dashboard' &&
        !activeTab.startsWith('admin-') &&
        !activeTab.startsWith('owner-') && (
          <div className="mb-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 typo-body text-red-900">
            <span>{tr(uiLanguage, dataError)}</span>
            <button
              type="button"
              onClick={refreshWorkspaceData}
              className="ml-4 rounded border border-red-300 bg-white px-3 py-1 typo-btn text-red-800 hover:bg-red-100"
            >
              {tr(uiLanguage, 'Retry')}
            </button>
          </div>
        )}

      {user.role === 'overall_admin' && (
        <AdminPortalView
          section={
            activeTab === 'admin-owners' ||
            activeTab === 'admin-workspaces' ||
            activeTab === 'admin-tenants' ||
            activeTab === 'admin-wardens' ||
            activeTab === 'admin-payments' ||
            activeTab === 'admin-complaints' ||
            activeTab === 'admin-reports' ||
            activeTab === 'admin-notifications'
              ? activeTab
              : 'admin-overview'
          }
          currentUser={user}
          refreshSignal={refreshKey}
          notificationsData={notificationsData}
          onMarkNotificationRead={handleMarkNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          onRefreshNotifications={loadNotifications}
          onNavigateSection={handleSelectTab}
          onShowToast={showToast}
        />
      )}

      {user.role === 'owner' && (
        <OwnerPortalView
          section={
            activeTab === 'owner-properties' ||
            activeTab === 'owner-rooms' ||
            activeTab === 'owner-tenants' ||
            activeTab === 'owner-rent' ||
            activeTab === 'owner-payments' ||
            activeTab === 'owner-wardens' ||
            activeTab === 'owner-complaints' ||
            activeTab === 'owner-notifications'
              ? activeTab
              : 'owner-overview'
          }
          activeTenantId={tenant.id}
          currentUser={user}
          notificationsData={notificationsData}
          onMarkNotificationRead={handleMarkNotificationRead}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
          onRefreshNotifications={loadNotifications}
          onNavigateSection={handleSelectTab}
          onSelectActiveProperty={handleOwnerSwitchProperty}
          onShowToast={showToast}
        />
      )}

      {activeTab === 'dashboard' && user.role !== 'owner' && user.role !== 'overall_admin' && (
        <DashboardView
          data={dashboard}
          loading={dataLoading}
          error={dataError}
          uiLanguage={uiLanguage}
          period={period}
          customFrom={customFrom}
          customTo={customTo}
          onPeriodChange={(nextPeriod, from, to) => {
            setPeriod(nextPeriod);
            if (from !== undefined) setCustomFrom(from);
            if (to !== undefined) setCustomTo(to);
          }}
          onRetry={refreshWorkspaceData}
          onAddGuest={() => {
            setPreselectedBedId(null);
            setPreselectedGuestId(null);
            setRegisterInitialFlow('guest_only');
            setRegisterModalOpen(true);
          }}
          onCheckIn={() => {
            setPreselectedBedId(null);
            setPreselectedGuestId(null);
            setRegisterInitialFlow('check_in');
            setRegisterModalOpen(true);
          }}
          onRecordPayment={(pay) => {
            setPreselectedPayment(pay || null);
            setPaymentModalOpen(true);
          }}
          onAddRoom={() => {
            setEditingRoom(null);
            setAddRoomModalOpen(true);
          }}
          onOpenGuest={(guestId) => setActiveGuestId(guestId)}
          onCheckoutStay={(stay) => setCheckoutTarget(stay)}
          onSendSmsReminder={handleSendSmsReminder}
          onNavigateTab={(tab) => setActiveTab(tab)}
          smsBusyId={smsBusyId}
        />
      )}

      {activeTab === 'rooms' && user.role !== 'owner' && user.role !== 'overall_admin' && (
        <RoomsView
          refreshKey={refreshKey}
          userRole={user.role}
          uiLanguage={uiLanguage}
          onAddRoom={() => {
            setEditingRoom(null);
            setAddRoomModalOpen(true);
          }}
          onEditRoom={(room) => {
            setEditingRoom(room);
            setAddRoomModalOpen(true);
          }}
          onAssignBed={(bed) => {
            setPreselectedBedId(bed.id);
            setPreselectedGuestId(null);
            setRegisterInitialFlow('check_in');
            setRegisterModalOpen(true);
          }}
          onOpenGuest={(guestId) => setActiveGuestId(guestId)}
          onDataChanged={refreshWorkspaceData}
        />
      )}

      {activeTab === 'guests' && user.role !== 'owner' && user.role !== 'overall_admin' && (
        <GuestsView
          refreshKey={refreshKey}
          userRole={user.role}
          uiLanguage={uiLanguage}
          guestOptions={workspaceOptions?.guests || []}
          previewDoc={previewDoc}
          onSetPreviewDoc={setPreviewDoc}
          onAddGuest={() => {
            setPreselectedBedId(null);
            setPreselectedGuestId(null);
            setRegisterInitialFlow('guest_only');
            setRegisterModalOpen(true);
          }}
          onCheckIn={() => {
            setPreselectedBedId(null);
            setPreselectedGuestId(null);
            setRegisterInitialFlow('check_in');
            setRegisterModalOpen(true);
          }}
          onCheckInGuest={(guestId) => {
            setPreselectedBedId(null);
            setPreselectedGuestId(guestId);
            setRegisterInitialFlow('check_in');
            setRegisterModalOpen(true);
          }}
          onOpenGuest={(guestId) => setActiveGuestId(guestId)}
          onDataChanged={refreshWorkspaceData}
        />
      )}

      {activeTab === 'stays' && user.role !== 'owner' && user.role !== 'overall_admin' && (
        <StaysView
          refreshKey={refreshKey}
          allBeds={workspaceOptions?.allBeds || []}
          onCheckIn={() => {
            setPreselectedBedId(null);
            setPreselectedGuestId(null);
            setRegisterInitialFlow('check_in');
            setRegisterModalOpen(true);
          }}
          onCheckoutStay={(stay) => setCheckoutTarget(stay)}
          onOpenGuest={(guestId) => setActiveGuestId(guestId)}
          onDataChanged={refreshWorkspaceData}
        />
      )}

      {activeTab === 'payments' && user.role !== 'owner' && user.role !== 'overall_admin' && (
        <PaymentsView
          refreshKey={refreshKey}
          userRole={user.role}
          smsBusyId={smsBusyId}
          onRecordPayment={(pay) => {
            setPreselectedPayment(pay || null);
            setPaymentModalOpen(true);
          }}
          onViewReceipt={(pay) => setReceiptPayment(pay)}
          onSendSmsReminder={handleSendSmsReminder}
          onOpenDepositModal={(action, deposit) =>
            setDepositModalState({ open: true, action, deposit: deposit || null })
          }
          onOpenGuest={(guestId) => setActiveGuestId(guestId)}
          onDataChanged={refreshWorkspaceData}
        />
      )}

      {activeTab === 'expenses' && user.role !== 'owner' && user.role !== 'overall_admin' && (
        <ExpensesView
          refreshKey={refreshKey}
          userRole={user.role}
          onDataChanged={refreshWorkspaceData}
        />
      )}

      {activeTab === 'reminders' && user.role !== 'owner' && user.role !== 'overall_admin' && (
        <RemindersView
          refreshKey={refreshKey}
          tenant={tenant}
          activeStays={workspaceOptions?.activeStays || []}
          unpaidPayments={workspaceOptions?.unpaidPayments || []}
          onDataChanged={refreshWorkspaceData}
        />
      )}

      {activeTab === 'reports' && user.role !== 'owner' && user.role !== 'overall_admin' && (
        <ReportsView refreshKey={refreshKey} />
      )}

      {activeTab === 'settings' && user.role !== 'owner' && user.role !== 'overall_admin' && (
        <SettingsView
          tenant={tenant}
          currentUser={user}
          onTenantUpdated={(updated) => {
            setTenant(updated);
            const nextLang = updated.preferredLanguage || 'en';
            setUiLanguage(nextLang);
            saveStoredLanguage(nextLang);
            showToast('ok', 'Hostel settings updated.');
          }}
          onNotificationsChanged={loadNotifications}
        />
      )}

      {/* Global Modals & Drawers */}
      <RegisterGuestModal
        open={registerModalOpen}
        initialFlow={registerInitialFlow}
        preselectedBedId={preselectedBedId}
        preselectedGuestId={preselectedGuestId}
        requireIdDocument={tenant.settings.requireIdDocument}
        onClose={() => {
          setRegisterModalOpen(false);
          setPreselectedBedId(null);
          setPreselectedGuestId(null);
        }}
        onSuccess={() => {
          showToast('ok', 'Guest record saved.');
          refreshWorkspaceData();
        }}
        vacantBeds={workspaceOptions?.vacantBeds || []}
        allBeds={workspaceOptions?.allBeds || []}
        existingGuests={workspaceOptions?.guests || []}
      />

      <RecordPaymentModal
        open={paymentModalOpen}
        onClose={() => {
          setPaymentModalOpen(false);
          setPreselectedPayment(null);
        }}
        onSuccess={() => {
          showToast('ok', 'Payment saved.');
          refreshWorkspaceData();
        }}
        preselectedPayment={preselectedPayment}
        activeStays={workspaceOptions?.activeStays || []}
        unpaidPayments={workspaceOptions?.unpaidPayments || []}
      />

      <AddRoomModal
        open={addRoomModalOpen}
        editingRoom={editingRoom}
        onClose={() => {
          setAddRoomModalOpen(false);
          setEditingRoom(null);
        }}
        onSuccess={() => {
          showToast('ok', editingRoom ? 'Room updated.' : 'Room and beds added.');
          refreshWorkspaceData();
        }}
      />

      <DepositModal
        open={depositModalState.open}
        action={depositModalState.action}
        deposit={depositModalState.deposit}
        activeStays={workspaceOptions?.activeStays || []}
        onClose={() => setDepositModalState({ open: false, action: 'collect', deposit: null })}
        onSuccess={() => {
          showToast('ok', 'Security deposit updated.');
          refreshWorkspaceData();
        }}
      />

      <ReceiptModal
        payment={receiptPayment}
        tenant={tenant}
        onClose={() => setReceiptPayment(null)}
      />

      <GuestProfileDrawer
        guestId={activeGuestId}
        userRole={user.role}
        onClose={() => setActiveGuestId(null)}
        onDataChanged={refreshWorkspaceData}
        onCheckInGuest={(guestId) => {
          setActiveGuestId(null);
          setPreselectedBedId(null);
          setPreselectedGuestId(guestId);
          setRegisterInitialFlow('check_in');
          setRegisterModalOpen(true);
        }}
        onPreviewDocument={(doc) => {
          setActiveGuestId(null);
          setActiveTab('guests');
          setPreviewDoc(doc);
        }}
      />

      <ConfirmDialog
        open={Boolean(checkoutTarget)}
        title={tr(uiLanguage, `Complete Checkout for ${checkoutTarget?.guestName || ''}?`)}
        description={
          checkoutTarget
            ? tr(
                uiLanguage,
                `This will record today's checkout for Room ${checkoutTarget.roomNumber} Bed ${checkoutTarget.bedLabel} and mark the bed vacant.${
                  checkoutTarget.balanceDue > 0
                    ? ` Note: This stay still has ₹${checkoutTarget.balanceDue.toLocaleString('en-IN')} pending balance.`
                    : ''
                }`
              )
            : ''
        }
        confirmLabel={tr(uiLanguage, 'Confirm Checkout')}
        destructive={Boolean(checkoutTarget && checkoutTarget.balanceDue > 0)}
        busy={checkoutBusy}
        onConfirm={handleConfirmCheckout}
        onCancel={() => setCheckoutTarget(null)}
      />

      <NotificationCenterModal
        open={notificationCenterState.open}
        initialTab={notificationCenterState.initialTab}
        initialCategory={notificationCenterState.initialCategory}
        user={user}
        tenant={tenant}
        notificationsData={notificationsData}
        onClose={() => setNotificationCenterState((prev) => ({ ...prev, open: false }))}
        onRefreshNotifications={loadNotifications}
        onMarkRead={handleMarkNotificationRead}
        onMarkAllRead={handleMarkAllNotificationsRead}
        onNavigateFromNotification={handleNavigateFromNotification}
        onShowToast={showToast}
      />

      <UserProfileModal
        open={profileModalState.open}
        initialTab={profileModalState.tab}
        user={user}
        tenant={tenant}
        uiLanguage={uiLanguage}
        onToggleLanguage={handleToggleLanguage}
        onClose={() => setProfileModalState((prev) => ({ ...prev, open: false }))}
        onUserUpdated={(updatedUser) => {
          setUser(updatedUser);
          setRefreshKey((k) => k + 1);
        }}
        onOpenNotificationSettings={() =>
          setNotificationCenterState({
            open: true,
            initialTab: 'settings',
            initialCategory: 'all',
          })
        }
        onOpenWorkspaceSettings={
          user.role === 'warden' || user.role === 'staff'
            ? () => handleSelectTab('settings')
            : undefined
        }
        onShowToast={showToast}
      />
    </Shell>
      )}
    </LanguageProvider>
  );
}
