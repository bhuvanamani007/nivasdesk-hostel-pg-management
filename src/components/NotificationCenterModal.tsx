import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  Megaphone,
  MessageSquareWarning,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  UserPlus,
  Wrench,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { useLanguage } from '../lib/LanguageContext';
import {
  NOTIFICATION_CATEGORIES,
  USER_CATEGORY_PREF_ITEMS,
  formatNotificationDateTime,
  getCategoryLabel,
  getNotificationIcon,
  getNotificationIconStyle,
} from '../lib/notificationMeta';
import type {
  AdminAnnouncementRecord,
  AdminNotificationPolicy,
  ClientNotification,
  ComplaintRecord,
  MaintenanceRequestRecord,
  NotificationCategory,
  NotificationFilterCategory,
  NotificationsPayload,
  Tenant,
  User,
  UserNotificationPreferences,
  VisitorEntryRecord,
} from '../types/domain';

export type NotificationCenterTab = 'history' | 'activity' | 'settings';
type ActivitySubTab = 'complaints' | 'maintenance' | 'visitors' | 'announcements';

interface NotificationCenterModalProps {
  open: boolean;
  initialTab?: NotificationCenterTab;
  initialCategory?: NotificationFilterCategory;
  user: User;
  tenant: Tenant;
  notificationsData: NotificationsPayload | null;
  onClose: () => void;
  onRefreshNotifications: () => Promise<void>;
  onMarkRead: (id: string) => Promise<void>;
  onMarkAllRead: (category?: NotificationFilterCategory) => Promise<void>;
  onNavigateFromNotification: (notif: ClientNotification) => void;
  onShowToast: (kind: 'ok' | 'error', text: string) => void;
}

export function NotificationCenterModal({
  open,
  initialTab = 'history',
  initialCategory = 'all',
  user,
  tenant,
  notificationsData,
  onClose,
  onRefreshNotifications,
  onMarkRead,
  onMarkAllRead,
  onNavigateFromNotification,
  onShowToast,
}: NotificationCenterModalProps) {
  const { uiLanguage, tr } = useLanguage();
  const [activeTab, setActiveTab] = useState<NotificationCenterTab>(initialTab);
  const [selectedCategory, setSelectedCategory] =
    useState<NotificationFilterCategory>(initialCategory);
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [includeMuted, setIncludeMuted] = useState(false);
  const [historyItems, setHistoryItems] = useState<ClientNotification[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);

  // Operational Activity State
  const [activitySubTab, setActivitySubTab] = useState<ActivitySubTab>('complaints');
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequestRecord[]>([]);
  const [visitors, setVisitors] = useState<VisitorEntryRecord[]>([]);
  const [announcements, setAnnouncements] = useState<AdminAnnouncementRecord[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityBusy, setActivityBusy] = useState(false);

  // Property options for overall_admin / owner forms
  const [propertyOptions, setPropertyOptions] = useState<Array<{ id: string; name: string }>>([]);

  // Forms
  const [cmpTitle, setCmpTitle] = useState('');
  const [cmpGuestName, setCmpGuestName] = useState('');
  const [cmpRoomLabel, setCmpRoomLabel] = useState('');
  const [cmpPriority, setCmpPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [cmpDescription, setCmpDescription] = useState('');
  const [cmpTenantId, setCmpTenantId] = useState(tenant.id);

  const [mntTitle, setMntTitle] = useState('');
  const [mntRoomLabel, setMntRoomLabel] = useState('');
  const [mntPriority, setMntPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [mntDescription, setMntDescription] = useState('');
  const [mntTenantId, setMntTenantId] = useState(tenant.id);

  const [visVisitorName, setVisVisitorName] = useState('');
  const [visPhone, setVisPhone] = useState('');
  const [visGuestName, setVisGuestName] = useState('');
  const [visRoomLabel, setVisRoomLabel] = useState('');
  const [visRelation, setVisRelation] = useState('');
  const [visPurpose, setVisPurpose] = useState('');

  const [annTitle, setAnnTitle] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annPriority, setAnnPriority] = useState<'normal' | 'urgent'>('normal');
  const [annTargetTenantId, setAnnTargetTenantId] = useState('all');

  // Settings State
  const [policy, setPolicy] = useState<AdminNotificationPolicy | null>(
    notificationsData?.policy || null
  );
  const [preferences, setPreferences] = useState<UserNotificationPreferences | null>(
    notificationsData?.preferences || null
  );
  const [settingsBusy, setSettingsBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
    setSelectedCategory(initialCategory);
  }, [open, initialTab, initialCategory]);

  useEffect(() => {
    setCmpTenantId(tenant.id);
    setMntTenantId(tenant.id);
  }, [tenant.id]);

  const loadFilteredHistory = useCallback(async () => {
    if (!open) return;
    setHistoryLoading(true);
    try {
      const res = await api.getNotifications({
        category: selectedCategory,
        status: statusFilter,
        search: searchQuery.trim() || undefined,
        includeMuted,
      });
      setHistoryItems(res.notifications);
      setPolicy(res.policy);
      setPreferences(res.preferences);
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Failed to load notifications.'));
    } finally {
      setHistoryLoading(false);
    }
  }, [open, selectedCategory, statusFilter, searchQuery, includeMuted, onShowToast, tr]);

  const loadOperationalData = useCallback(async () => {
    if (!open) return;
    setActivityLoading(true);
    try {
      const [cmpRes, mntRes, visRes, annRes] = await Promise.all([
        api.getComplaints(),
        api.getMaintenanceRequests(),
        api.getVisitors(),
        api.getAnnouncements(),
      ]);
      setComplaints(cmpRes.complaints);
      setMaintenanceRequests(mntRes.maintenanceRequests);
      setVisitors(visRes.visitors);
      setAnnouncements(annRes.announcements);

      if (user.role === 'overall_admin') {
        const adminData = await api.getAdminOverview({ period: 'all' });
        setPropertyOptions(
          adminData.workspaces.map((w) => ({ id: w.id, name: `${w.name} (${w.city})` }))
        );
      } else if (user.role === 'owner') {
        const ownerData = await api.getOwnerOverview();
        setPropertyOptions(
          ownerData.properties.map((p) => ({ id: p.id, name: `${p.name} (${p.city})` }))
        );
      } else {
        setPropertyOptions([{ id: tenant.id, name: tenant.name }]);
      }
    } catch (err) {
      onShowToast(
        'error',
        err instanceof Error ? err.message : tr('Failed to load operational alerts.')
      );
    } finally {
      setActivityLoading(false);
    }
  }, [open, user.role, tenant.id, tenant.name, onShowToast, tr]);

  const loadSettingsData = useCallback(async () => {
    if (!open) return;
    try {
      const res = await api.getNotificationSettings();
      setPolicy(res.policy);
      setPreferences(res.preferences);
    } catch {
      // ignore
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (activeTab === 'history') {
      loadFilteredHistory();
    } else if (activeTab === 'activity') {
      loadOperationalData();
    } else if (activeTab === 'settings') {
      loadSettingsData();
    }
  }, [open, activeTab, loadFilteredHistory, loadOperationalData, loadSettingsData]);

  // Keep history synced with real-time payload updates when viewing default history
  useEffect(() => {
    if (open && activeTab === 'history' && !includeMuted && !searchQuery.trim()) {
      loadFilteredHistory();
    }
  }, [notificationsData, open, activeTab, includeMuted, searchQuery, loadFilteredHistory]);

  const categoryCounts = useMemo(() => {
    return notificationsData?.categoryCounts || null;
  }, [notificationsData]);

  if (!open) return null;

  const handleSyncRent = async () => {
    setSyncBusy(true);
    try {
      const res = await api.syncRentNotifications();
      await onRefreshNotifications();
      await loadFilteredHistory();
      onShowToast(
        'ok',
        res.createdCount > 0
          ? tr(`Rent reminder check completed (${res.createdCount} new alert${res.createdCount === 1 ? '' : 's'}).`)
          : tr('Rent reminder check completed — all due alerts are up to date.')
      );
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Rent reminder sync failed.'));
    } finally {
      setSyncBusy(false);
    }
  };

  const handleCreateComplaint = async (e: FormEvent) => {
    e.preventDefault();
    if (!cmpTitle.trim()) return;
    setActivityBusy(true);
    try {
      await api.createComplaint({
        tenantId: cmpTenantId,
        guestName: cmpGuestName.trim() || 'Resident',
        roomLabel: cmpRoomLabel.trim() || 'General',
        title: cmpTitle.trim(),
        description: cmpDescription.trim(),
        priority: cmpPriority,
      });
      setCmpTitle('');
      setCmpGuestName('');
      setCmpRoomLabel('');
      setCmpDescription('');
      setCmpPriority('medium');
      await Promise.all([loadOperationalData(), onRefreshNotifications()]);
      onShowToast('ok', tr('Complaint logged and alerts sent.'));
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not log complaint.'));
    } finally {
      setActivityBusy(false);
    }
  };

  const handleUpdateComplaint = async (
    id: string,
    status: 'open' | 'in_progress' | 'resolved'
  ) => {
    setActivityBusy(true);
    try {
      await api.updateComplaintStatus(id, status);
      await Promise.all([loadOperationalData(), onRefreshNotifications()]);
      onShowToast('ok', tr(`Complaint marked ${status.replace('_', ' ')}.`));
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not update complaint.'));
    } finally {
      setActivityBusy(false);
    }
  };

  const handleCreateMaintenance = async (e: FormEvent) => {
    e.preventDefault();
    if (!mntTitle.trim()) return;
    setActivityBusy(true);
    try {
      await api.createMaintenanceRequest({
        tenantId: mntTenantId,
        roomLabel: mntRoomLabel.trim() || 'Common Area',
        title: mntTitle.trim(),
        description: mntDescription.trim(),
        priority: mntPriority,
      });
      setMntTitle('');
      setMntRoomLabel('');
      setMntDescription('');
      setMntPriority('medium');
      await Promise.all([loadOperationalData(), onRefreshNotifications()]);
      onShowToast('ok', tr('Maintenance request created and staff alerted.'));
    } catch (err) {
      onShowToast(
        'error',
        err instanceof Error ? err.message : tr('Could not create maintenance request.')
      );
    } finally {
      setActivityBusy(false);
    }
  };

  const handleUpdateMaintenance = async (
    id: string,
    status: 'open' | 'in_progress' | 'completed'
  ) => {
    setActivityBusy(true);
    try {
      await api.updateMaintenanceRequestStatus(id, status);
      await Promise.all([loadOperationalData(), onRefreshNotifications()]);
      onShowToast('ok', tr(`Maintenance request marked ${status.replace('_', ' ')}.`));
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not update maintenance.'));
    } finally {
      setActivityBusy(false);
    }
  };

  const handleCreateVisitor = async (e: FormEvent) => {
    e.preventDefault();
    if (!visVisitorName.trim() || !visGuestName.trim()) return;
    setActivityBusy(true);
    try {
      await api.createVisitorEntry({
        visitorName: visVisitorName.trim(),
        visitorPhone: visPhone.trim(),
        guestName: visGuestName.trim(),
        roomLabel: visRoomLabel.trim() || 'Reception',
        relation: visRelation.trim() || 'Visitor',
        purpose: visPurpose.trim() || 'Resident Visit',
      });
      setVisVisitorName('');
      setVisPhone('');
      setVisGuestName('');
      setVisRoomLabel('');
      setVisRelation('');
      setVisPurpose('');
      await Promise.all([loadOperationalData(), onRefreshNotifications()]);
      onShowToast('ok', tr('Visitor entry logged and warden alerted.'));
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not log visitor.'));
    } finally {
      setActivityBusy(false);
    }
  };

  const handleCreateAnnouncement = async (e: FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annMessage.trim()) return;
    setActivityBusy(true);
    try {
      await api.createAnnouncement({
        tenantId: annTargetTenantId,
        title: annTitle.trim(),
        message: annMessage.trim(),
        priority: annPriority,
      });
      setAnnTitle('');
      setAnnMessage('');
      setAnnPriority('normal');
      await Promise.all([loadOperationalData(), onRefreshNotifications()]);
      onShowToast('ok', tr('Announcement broadcast to all targeted staff.'));
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not send announcement.'));
    } finally {
      setActivityBusy(false);
    }
  };

  const handleToggleUserPref = async (key: NotificationCategory) => {
    if (!preferences) return;
    setSettingsBusy(true);
    const nextVal = !preferences.categories[key];
    try {
      const res = await api.updateUserNotificationPreferences({
        categories: { [key]: nextVal },
      });
      setPreferences(res.preferences);
      await onRefreshNotifications();
      onShowToast('ok', tr('Notification preference updated.'));
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Failed to save preference.'));
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleToggleSound = async () => {
    if (!preferences) return;
    setSettingsBusy(true);
    try {
      const res = await api.updateUserNotificationPreferences({
        realTimeSound: !preferences.realTimeSound,
      });
      setPreferences(res.preferences);
      await onRefreshNotifications();
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Failed to update sound toggle.'));
    } finally {
      setSettingsBusy(false);
    }
  };

  const handleToggleAdminPolicy = async (
    key: keyof Pick<
      AdminNotificationPolicy,
      | 'rentRemindersEnabled'
      | 'overdueAlertsEnabled'
      | 'paymentAlertsEnabled'
      | 'residentUpdatesEnabled'
      | 'complaintsEnabled'
      | 'maintenanceAlertsEnabled'
      | 'systemAlertsEnabled'
    >
  ) => {
    if (!policy || user.role !== 'overall_admin') return;
    setSettingsBusy(true);
    try {
      const res = await api.updateAdminNotificationPolicy({
        [key]: !policy[key],
      });
      setPolicy(res.policy);
      await onRefreshNotifications();
      onShowToast('ok', tr('Platform notification policy updated.'));
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not update policy.'));
    } finally {
      setSettingsBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={tr('Notification Center')}
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-teal-200 bg-teal-50 text-teal-700">
              <Bell className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="typo-section-heading text-slate-900 truncate">
                {tr('Notification Center & Alerts')}
              </h2>
              <p className="typo-helper text-slate-500 truncate">
                {tr('Real-time rent reminders, resident activity, complaints, maintenance & role preferences')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr('Close Notification Center')}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Top Primary Tabs */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-5 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`typo-btn inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-colors ${
                activeTab === 'history'
                  ? 'bg-teal-700 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Notification History')}</span>
              {(notificationsData?.unreadCount || 0) > 0 && (
                <span
                  className={`typo-helper rounded px-1.5 py-0.5 font-mono font-semibold ${
                    activeTab === 'history'
                      ? 'bg-white/20 text-white'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {notificationsData?.unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('activity')}
              className={`typo-btn inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-colors ${
                activeTab === 'activity'
                  ? 'bg-teal-700 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Log Alerts & Announcements')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className={`typo-btn inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition-colors ${
                activeTab === 'settings'
                  ? 'bg-teal-700 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Notification Settings')}</span>
            </button>
          </div>

          {activeTab === 'history' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSyncRent}
                disabled={syncBusy}
                className="typo-btn inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncBusy ? 'animate-spin' : ''}`} />
                <span>{syncBusy ? tr('Checking Due...') : tr('Sync Rent Due')}</span>
              </button>
              <button
                type="button"
                onClick={() => onMarkAllRead(selectedCategory)}
                className="typo-btn inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1.5 text-white hover:bg-slate-800"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>{tr('Mark All Read')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'history' && (
            <div className="space-y-4">
              {/* 7 Category Tabs */}
              <div className="flex flex-wrap gap-1.5">
                {NOTIFICATION_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const counts = categoryCounts?.[cat.id];
                  const isActive = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`typo-btn inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition-colors ${
                        isActive
                          ? 'border-teal-700 bg-teal-50 text-teal-900'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{tr(cat.label)}</span>
                      {counts && (
                        <span className="typo-helper font-mono text-slate-500">
                          ({counts.unread > 0 ? `${counts.unread}/` : ''}
                          {counts.total})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={tr('Search resident, PG branch, room, or message...')}
                    className="typo-input w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-slate-900 focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(e.target.value as 'all' | 'unread' | 'read')
                    }
                    aria-label={tr('Filter notifications by read status')}
                    className="typo-input rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-slate-800"
                  >
                    <option value="all">{tr('All Statuses')}</option>
                    <option value="unread">{tr('Unread Only')}</option>
                    <option value="read">{tr('Read Only')}</option>
                  </select>
                  <label className="typo-label flex items-center gap-1.5 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeMuted}
                      onChange={(e) => setIncludeMuted(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-teal-700"
                    />
                    <span>{tr('Show muted categories')}</span>
                  </label>
                </div>
              </div>

              {/* Notifications List */}
              {historyLoading ? (
                <div className="typo-body rounded-md border border-slate-200 bg-white p-8 text-center text-slate-500">
                  {tr('Loading notifications...')}
                </div>
              ) : historyItems.length === 0 ? (
                <div className="rounded-md border border-slate-200 bg-white p-8 text-center">
                  <Bell className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
                  <p className="typo-card-title mt-2 font-semibold text-slate-800">
                    {tr('No notifications match this filter')}
                  </p>
                  <p className="typo-helper mt-1 text-slate-500">
                    {tr('Real-time alerts appear automatically as rent dues, payments, check-ins, complaints, or maintenance events happen.')}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
                  {historyItems.map((n) => {
                    const Icon = getNotificationIcon(n.category, n.eventType);
                    const iconStyle = getNotificationIconStyle(
                      n.category,
                      n.eventType,
                      n.priority
                    );
                    return (
                      <li
                        key={n.id}
                        className={`flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between ${
                          !n.isRead
                            ? 'bg-teal-50/40 border-l-4 border-l-teal-700'
                            : 'bg-white'
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${iconStyle}`}
                          >
                            <Icon className="h-4 w-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="typo-notification font-semibold text-slate-900">
                                {tr(n.title)}
                              </span>
                              {!n.isRead && (
                                <span className="typo-helper rounded bg-teal-700 px-1.5 py-0.5 font-semibold text-white">
                                  {tr('Unread')}
                                </span>
                              )}
                              {(n.priority === 'urgent' || n.priority === 'high') && (
                                <span
                                  className={`typo-helper rounded px-1.5 py-0.5 font-semibold uppercase ${
                                    n.priority === 'urgent'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {tr(n.priority === 'urgent' ? 'Urgent' : 'High')}
                                </span>
                              )}
                            </div>
                            <p className="typo-notification text-slate-600">{tr(n.message)}</p>
                            <div className="typo-helper flex flex-wrap items-center gap-3 text-slate-500">
                              <span className="inline-flex items-center gap-1 font-mono">
                                <Clock className="h-3 w-3" aria-hidden="true" />
                                {formatNotificationDateTime(n.createdAt, uiLanguage)}
                              </span>
                              <span>· {tr(getCategoryLabel(n.category))}</span>
                              {n.tenantName && <span>· {n.tenantName}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
                          {!n.isRead && (
                            <button
                              type="button"
                              onClick={() => onMarkRead(n.id)}
                              className="typo-btn inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-teal-700" />
                              <span>{tr('Mark Read')}</span>
                            </button>
                          )}
                          {n.targetTab && (
                            <button
                              type="button"
                              onClick={() => {
                                if (!n.isRead) onMarkRead(n.id);
                                onNavigateFromNotification(n);
                              }}
                              className="typo-btn inline-flex items-center gap-1 rounded border border-teal-200 bg-teal-50 px-2.5 py-1 text-teal-800 hover:bg-teal-100"
                            >
                              <span>{tr('Open')}</span>
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-4">
              {/* Sub-navigation */}
              <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-3">
                <button
                  type="button"
                  onClick={() => setActivitySubTab('complaints')}
                  className={`typo-btn inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 ${
                    activitySubTab === 'complaints'
                      ? 'border-teal-700 bg-teal-50 text-teal-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <MessageSquareWarning className="h-3.5 w-3.5" />
                  <span>{tr('Complaints')} ({complaints.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActivitySubTab('maintenance')}
                  className={`typo-btn inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 ${
                    activitySubTab === 'maintenance'
                      ? 'border-teal-700 bg-teal-50 text-teal-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Wrench className="h-3.5 w-3.5" />
                  <span>{tr('Maintenance')} ({maintenanceRequests.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActivitySubTab('visitors')}
                  className={`typo-btn inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 ${
                    activitySubTab === 'visitors'
                      ? 'border-teal-700 bg-teal-50 text-teal-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>{tr('Visitor Entries')} ({visitors.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActivitySubTab('announcements')}
                  className={`typo-btn inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 ${
                    activitySubTab === 'announcements'
                      ? 'border-teal-700 bg-teal-50 text-teal-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Megaphone className="h-3.5 w-3.5" />
                  <span>{tr('Announcements')} ({announcements.length})</span>
                </button>
              </div>

              {activityLoading ? (
                <p className="typo-body py-8 text-center text-slate-500">{tr('Loading operational logs...')}</p>
              ) : (
                <>
                  {/* Complaints */}
                  {activitySubTab === 'complaints' && (
                    <div className="space-y-4">
                      <form
                        onSubmit={handleCreateComplaint}
                        className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3"
                      >
                        <h3 className="typo-card-title font-semibold text-slate-900">
                          {tr('Log Resident Complaint (Notifies Admin, Owner & Assigned Warden)')}
                        </h3>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div className="sm:col-span-2">
                            <label className="typo-label block text-slate-700">
                              {tr('Complaint Title')} <span className="text-red-600">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={cmpTitle}
                              onChange={(e) => setCmpTitle(e.target.value)}
                              placeholder={tr('e.g., Wi-Fi router down on 2nd floor')}
                              className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                            />
                          </div>
                          <div>
                            <label className="typo-label block text-slate-700">
                              {tr('Priority')}
                            </label>
                            <select
                              value={cmpPriority}
                              onChange={(e) =>
                                setCmpPriority(e.target.value as 'low' | 'medium' | 'high')
                              }
                              className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                            >
                              <option value="low">{tr('Low')}</option>
                              <option value="medium">{tr('Medium')}</option>
                              <option value="high">{tr('High (Urgent)')}</option>
                            </select>
                          </div>
                          <div>
                            <label className="typo-label block text-slate-700">
                              {tr('Resident Name')}
                            </label>
                            <input
                              type="text"
                              value={cmpGuestName}
                              onChange={(e) => setCmpGuestName(e.target.value)}
                              placeholder={tr('Resident name')}
                              className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                            />
                          </div>
                          <div>
                            <label className="typo-label block text-slate-700">
                              {tr('Room / Bed')}
                            </label>
                            <input
                              type="text"
                              value={cmpRoomLabel}
                              onChange={(e) => setCmpRoomLabel(e.target.value)}
                              placeholder={tr('e.g., Room 202-A')}
                              className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                            />
                          </div>
                          {user.role === 'overall_admin' && propertyOptions.length > 0 && (
                            <div>
                              <label className="typo-label block text-slate-700">
                                {tr('PG Property')}
                              </label>
                              <select
                                value={cmpTenantId}
                                onChange={(e) => setCmpTenantId(e.target.value)}
                                className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                              >
                                {propertyOptions.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          <div className="sm:col-span-3">
                            <label className="typo-label block text-slate-700">
                              {tr('Details')}
                            </label>
                            <input
                              type="text"
                              value={cmpDescription}
                              onChange={(e) => setCmpDescription(e.target.value)}
                              placeholder={tr('Short description of the issue...')}
                              className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={activityBusy}
                            className="typo-btn rounded-md bg-teal-700 px-3.5 py-1.5 text-white hover:bg-teal-800 disabled:opacity-50"
                          >
                            {activityBusy ? tr('Saving...') : tr('Submit Complaint')}
                          </button>
                        </div>
                      </form>

                      {complaints.length === 0 ? (
                        <p className="typo-body rounded-md border border-slate-200 p-6 text-center text-slate-500">
                          {tr('No complaints logged yet.')}
                        </p>
                      ) : (
                        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
                          {complaints.map((c) => (
                            <li
                              key={c.id}
                              className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="space-y-0.5">
                                <p className="typo-body font-semibold text-slate-900">
                                  {c.title}{' '}
                                  <span className="font-normal text-slate-500">
                                    · {c.guestName} ({c.roomLabel})
                                  </span>
                                </p>
                                {c.description && (
                                  <p className="typo-body text-slate-600">{c.description}</p>
                                )}
                                <p className="typo-helper text-slate-500">
                                  {tr('Priority')}: <span className="capitalize font-medium">{tr(c.priority)}</span> ·{' '}
                                  {tr('Status')}:{' '}
                                  <span className="capitalize font-medium">
                                    {tr(c.status.replace('_', ' '))}
                                  </span>{' '}
                                  {c.assignedToName ? `· ${tr('Assigned')}: ${c.assignedToName}` : ''} ·{' '}
                                  {formatNotificationDateTime(c.createdAt, uiLanguage)}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                {c.status !== 'in_progress' && c.status !== 'resolved' && (
                                  <button
                                    type="button"
                                    disabled={activityBusy}
                                    onClick={() => handleUpdateComplaint(c.id, 'in_progress')}
                                    className="typo-btn rounded border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50"
                                  >
                                    {tr('In Progress')}
                                  </button>
                                )}
                                {c.status !== 'resolved' && (
                                  <button
                                    type="button"
                                    disabled={activityBusy}
                                    onClick={() => handleUpdateComplaint(c.id, 'resolved')}
                                    className="typo-btn rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-emerald-800 hover:bg-emerald-100"
                                  >
                                    {tr('Mark Resolved')}
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Maintenance Requests */}
                  {activitySubTab === 'maintenance' && (
                    <div className="space-y-4">
                      <form
                        onSubmit={handleCreateMaintenance}
                        className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3"
                      >
                        <h3 className="typo-card-title font-semibold text-slate-900">
                          {tr('Log Maintenance Request (Notifies Warden, Staff, Owner & Admin)')}
                        </h3>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div className="sm:col-span-2">
                            <label className="typo-label block text-slate-700">
                              {tr('Maintenance Issue')} <span className="text-red-600">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={mntTitle}
                              onChange={(e) => setMntTitle(e.target.value)}
                              placeholder={tr('e.g., Geyser valve leakage')}
                              className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                            />
                          </div>
                          <div>
                            <label className="typo-label block text-slate-700">
                              {tr('Priority')}
                            </label>
                            <select
                              value={mntPriority}
                              onChange={(e) =>
                                setMntPriority(e.target.value as 'low' | 'medium' | 'high')
                              }
                              className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                            >
                              <option value="low">{tr('Low')}</option>
                              <option value="medium">{tr('Medium')}</option>
                              <option value="high">{tr('High (Urgent)')}</option>
                            </select>
                          </div>
                          <div>
                            <label className="typo-label block text-slate-700">
                              {tr('Room / Area')}
                            </label>
                            <input
                              type="text"
                              value={mntRoomLabel}
                              onChange={(e) => setMntRoomLabel(e.target.value)}
                              placeholder={tr('e.g., Room 104 / Corridor')}
                              className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                            />
                          </div>
                          {user.role === 'overall_admin' && propertyOptions.length > 0 && (
                            <div>
                              <label className="typo-label block text-slate-700">
                                {tr('PG Property')}
                              </label>
                              <select
                                value={mntTenantId}
                                onChange={(e) => setMntTenantId(e.target.value)}
                                className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                              >
                                {propertyOptions.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          <div className="sm:col-span-2">
                            <label className="typo-label block text-slate-700">
                              {tr('Notes')}
                            </label>
                            <input
                              type="text"
                              value={mntDescription}
                              onChange={(e) => setMntDescription(e.target.value)}
                              placeholder={tr('Technician notes or repair details...')}
                              className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={activityBusy}
                            className="typo-btn rounded-md bg-teal-700 px-3.5 py-1.5 text-white hover:bg-teal-800 disabled:opacity-50"
                          >
                            {activityBusy ? tr('Saving...') : tr('Submit Maintenance Request')}
                          </button>
                        </div>
                      </form>

                      {maintenanceRequests.length === 0 ? (
                        <p className="typo-body rounded-md border border-slate-200 p-6 text-center text-slate-500">
                          {tr('No maintenance requests logged yet.')}
                        </p>
                      ) : (
                        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
                          {maintenanceRequests.map((m) => (
                            <li
                              key={m.id}
                              className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="space-y-0.5">
                                <p className="typo-body font-semibold text-slate-900">
                                  {m.title}{' '}
                                  <span className="font-normal text-slate-500">
                                    · {m.roomLabel}
                                  </span>
                                </p>
                                {m.description && (
                                  <p className="typo-body text-slate-600">{m.description}</p>
                                )}
                                <p className="typo-helper text-slate-500">
                                  {tr('Priority')}: <span className="capitalize font-medium">{tr(m.priority)}</span> ·{' '}
                                  {tr('Status')}:{' '}
                                  <span className="capitalize font-medium">
                                    {tr(m.status.replace('_', ' '))}
                                  </span>{' '}
                                  · {tr('Reported by')} {m.reportedByName} ·{' '}
                                  {formatNotificationDateTime(m.createdAt, uiLanguage)}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5">
                                {m.status !== 'in_progress' && m.status !== 'completed' && (
                                  <button
                                    type="button"
                                    disabled={activityBusy}
                                    onClick={() => handleUpdateMaintenance(m.id, 'in_progress')}
                                    className="typo-btn rounded border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50"
                                  >
                                    {tr('In Progress')}
                                  </button>
                                )}
                                {m.status !== 'completed' && (
                                  <button
                                    type="button"
                                    disabled={activityBusy}
                                    onClick={() => handleUpdateMaintenance(m.id, 'completed')}
                                    className="typo-btn rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-emerald-800 hover:bg-emerald-100"
                                  >
                                    {tr('Mark Completed')}
                                  </button>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Visitor Log */}
                  {activitySubTab === 'visitors' && (
                    <div className="space-y-4">
                      <form
                        onSubmit={handleCreateVisitor}
                        className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3"
                      >
                        <h3 className="typo-card-title font-semibold text-slate-900">
                          {tr(`Log Visitor Entry (${tenant.name}) — Alerts Warden & Staff`)}
                        </h3>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div>
                            <label className="typo-label block text-slate-700">
                              {tr('Visitor Name')} <span className="text-red-600">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={visVisitorName}
                              onChange={(e) => setVisVisitorName(e.target.value)}
                              placeholder={tr('e.g., Senthil Kumar')}
                              className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                            />
                          </div>
                          <div>
                            <label className="typo-label block text-slate-700">
                              {tr('Resident Visiting')} <span className="text-red-600">*</span>
                            </label>
                            <input
                              type="text"
                              required
                              value={visGuestName}
                              onChange={(e) => setVisGuestName(e.target.value)}
                              placeholder={tr('Resident name')}
                              className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                            />
                          </div>
                          <div>
                            <label className="typo-label block text-slate-700">
                              {tr('Visitor Phone')}
                            </label>
                            <input
                              type="tel"
                              value={visPhone}
                              onChange={(e) => setVisPhone(e.target.value)}
                              placeholder={tr('10-digit mobile')}
                              className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono"
                            />
                          </div>
                          <div>
                            <label className="typo-label block text-slate-700">
                              {tr('Room / Gate')}
                            </label>
                            <input
                              type="text"
                              value={visRoomLabel}
                              onChange={(e) => setVisRoomLabel(e.target.value)}
                              placeholder={tr('e.g., Room 101')}
                              className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                            />
                          </div>
                          <div>
                            <label className="typo-label block text-slate-700">
                              {tr('Relation')}
                            </label>
                            <input
                              type="text"
                              value={visRelation}
                              onChange={(e) => setVisRelation(e.target.value)}
                              placeholder={tr('Parent / Friend / Delivery')}
                              className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                            />
                          </div>
                          <div>
                            <label className="typo-label block text-slate-700">
                              {tr('Purpose')}
                            </label>
                            <input
                              type="text"
                              value={visPurpose}
                              onChange={(e) => setVisPurpose(e.target.value)}
                              placeholder={tr('Parcel / Family Visit')}
                              className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={activityBusy}
                            className="typo-btn rounded-md bg-teal-700 px-3.5 py-1.5 text-white hover:bg-teal-800 disabled:opacity-50"
                          >
                            {activityBusy ? tr('Logging...') : tr('Record Visitor Entry')}
                          </button>
                        </div>
                      </form>

                      {visitors.length === 0 ? (
                        <p className="typo-body rounded-md border border-slate-200 p-6 text-center text-slate-500">
                          {tr('No visitor entries logged yet.')}
                        </p>
                      ) : (
                        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
                          {visitors.map((v) => (
                            <li key={v.id} className="p-3.5 space-y-0.5">
                              <p className="typo-body font-semibold text-slate-900">
                                {v.visitorName}{' '}
                                <span className="font-normal text-slate-500">
                                  ({v.relation}) {tr('visiting')} {v.guestName} · {v.roomLabel}
                                </span>
                              </p>
                              <p className="typo-helper text-slate-500">
                                {tr('Purpose')}: {v.purpose}{' '}
                                {v.visitorPhone ? `· ${tr('Phone')}: ${v.visitorPhone}` : ''} ·{' '}
                                {formatNotificationDateTime(v.entryAt, uiLanguage)} · {tr('Logged by')}{' '}
                                {v.createdByName}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Admin & Owner Announcements */}
                  {activitySubTab === 'announcements' && (
                    <div className="space-y-4">
                      {(user.role === 'overall_admin' || user.role === 'owner') && (
                        <form
                          onSubmit={handleCreateAnnouncement}
                          className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3"
                        >
                          <h3 className="typo-card-title font-semibold text-slate-900">
                            {tr('Broadcast Important Announcement (Real-Time Alert to Wardens & Staff)')}
                          </h3>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div className="sm:col-span-2">
                              <label className="typo-label block text-slate-700">
                                {tr('Announcement Title')} <span className="text-red-600">*</span>
                              </label>
                              <input
                                type="text"
                                required
                                value={annTitle}
                                onChange={(e) => setAnnTitle(e.target.value)}
                                placeholder={tr('e.g., Monthly Fire Drill & EB Maintenance')}
                                className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                              />
                            </div>
                            <div>
                              <label className="typo-label block text-slate-700">
                                {tr('Priority')}
                              </label>
                              <select
                                value={annPriority}
                                onChange={(e) =>
                                  setAnnPriority(e.target.value as 'normal' | 'urgent')
                                }
                                className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                              >
                                <option value="normal">{tr('Normal')}</option>
                                <option value="urgent">{tr('Urgent Broadcast')}</option>
                              </select>
                            </div>
                            <div className="sm:col-span-2">
                              <label className="typo-label block text-slate-700">
                                {tr('Message')} <span className="text-red-600">*</span>
                              </label>
                              <input
                                type="text"
                                required
                                value={annMessage}
                                onChange={(e) => setAnnMessage(e.target.value)}
                                placeholder={tr('Instructions for wardens and property staff...')}
                                className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                              />
                            </div>
                            <div>
                              <label className="typo-label block text-slate-700">
                                {tr('Target PG Property')}
                              </label>
                              <select
                                value={annTargetTenantId}
                                onChange={(e) => setAnnTargetTenantId(e.target.value)}
                                className="typo-input mt-1 w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5"
                              >
                                <option value="all">
                                  {user.role === 'owner'
                                    ? tr('All My PG Properties')
                                    : tr('All PG Properties')}
                                </option>
                                {propertyOptions.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <button
                              type="submit"
                              disabled={activityBusy}
                              className="typo-btn rounded-md bg-slate-900 px-3.5 py-1.5 text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                              {activityBusy ? tr('Broadcasting...') : tr('Send Announcement')}
                            </button>
                          </div>
                        </form>
                      )}

                      {announcements.length === 0 ? (
                        <p className="typo-body rounded-md border border-slate-200 p-6 text-center text-slate-500">
                          {tr('No announcements published yet.')}
                        </p>
                      ) : (
                        <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
                          {announcements.map((a) => (
                            <li key={a.id} className="p-3.5 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="typo-body font-semibold text-slate-900">
                                  {a.title}
                                </span>
                                {a.priority === 'urgent' && (
                                  <span className="typo-helper rounded bg-red-100 px-1.5 py-0.5 font-semibold uppercase text-red-800">
                                    {tr('Urgent')}
                                  </span>
                                )}
                              </div>
                              <p className="typo-body text-slate-600">{a.message}</p>
                              <p className="typo-helper text-slate-500">
                                {tr('Scope')}: {a.tenantName || tr('All PG Properties')} · {tr('By')}{' '}
                                {a.createdByName} · {formatNotificationDateTime(a.createdAt, uiLanguage)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Personal Notification Preferences */}
              <section className="rounded-md border border-slate-200 bg-white p-4 space-y-3">
                <div>
                  <h3 className="typo-section-heading text-slate-900">
                    {tr(`Your Notification Preferences (${user.name})`)}
                  </h3>
                  <p className="typo-helper text-slate-500">
                    {tr('Choose which notification categories appear in your bell feed and real-time alerts.')}
                  </p>
                </div>

                {preferences ? (
                  <div className="divide-y divide-slate-100">
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
                          disabled={settingsBusy}
                          checked={preferences.categories[item.key] !== false}
                          onChange={() => handleToggleUserPref(item.key)}
                          className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                        />
                      </label>
                    ))}
                    <label className="flex items-center justify-between gap-4 py-2.5 cursor-pointer">
                      <div>
                        <p className="typo-label text-slate-900">
                          {tr('Real-Time Sound Chime')}
                        </p>
                        <p className="typo-helper text-slate-500">
                          {tr('Play a subtle alert tone when a new urgent or live notification arrives.')}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        disabled={settingsBusy}
                        checked={preferences.realTimeSound}
                        onChange={handleToggleSound}
                        className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                      />
                    </label>
                  </div>
                ) : (
                  <p className="typo-body text-slate-500">{tr('Loading preferences...')}</p>
                )}
              </section>

              {/* Admin Global Policy Controls */}
              <section className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-teal-700" aria-hidden="true" />
                    <h3 className="typo-section-heading text-slate-900">
                      {tr('Platform Notification Policy (Overall Admin Controls)')}
                    </h3>
                  </div>
                  {user.role !== 'overall_admin' && (
                    <span className="typo-helper font-medium text-slate-500">
                      {tr('Managed by Overall Admin')}
                    </span>
                  )}
                </div>

                {policy && (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(
                      [
                        {
                          key: 'rentRemindersEnabled',
                          label: 'Automatic Rent Reminders (5d, 2d & Due Day)',
                        },
                        {
                          key: 'overdueAlertsEnabled',
                          label: 'Overdue Rent Alerts',
                        },
                        {
                          key: 'paymentAlertsEnabled',
                          label: 'Payment & Security Deposit Alerts',
                        },
                        {
                          key: 'residentUpdatesEnabled',
                          label: 'Resident Check-In, Check-Out & Visitor Alerts',
                        },
                        {
                          key: 'complaintsEnabled',
                          label: 'Resident Complaints & Assignments',
                        },
                        {
                          key: 'maintenanceAlertsEnabled',
                          label: 'Maintenance & Repair Alerts',
                        },
                        {
                          key: 'systemAlertsEnabled',
                          label: 'System, Room/Bed & Admin Announcements',
                        },
                      ] as const
                    ).map((row) => (
                      <label
                        key={row.key}
                        className={`typo-label flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 ${
                          user.role === 'overall_admin' ? 'cursor-pointer' : 'opacity-80'
                        }`}
                      >
                        <span className="text-slate-800">{tr(row.label)}</span>
                        <input
                          type="checkbox"
                          disabled={user.role !== 'overall_admin' || settingsBusy}
                          checked={policy[row.key]}
                          onChange={() => handleToggleAdminPolicy(row.key)}
                          className="h-4 w-4 rounded border-slate-300 text-teal-700"
                        />
                      </label>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
