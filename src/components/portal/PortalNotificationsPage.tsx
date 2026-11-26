import { useState } from 'react';
import { Bell, CheckCheck, CheckCircle2, Settings } from 'lucide-react';
import { api } from '../../lib/api';
import { useLanguage } from '../../lib/LanguageContext';
import {
  NOTIFICATION_CATEGORIES,
  formatNotificationDateTime,
  getNotificationIcon,
  getNotificationIconStyle,
} from '../../lib/notificationMeta';
import type {
  NotificationCategory,
  NotificationFilterCategory,
  NotificationsPayload,
  User,
} from '../../types/domain';

interface PortalNotificationsPageProps {
  user: User;
  notificationsData: NotificationsPayload | null;
  onMarkRead: (id: string) => void | Promise<void>;
  onMarkAllRead: (category?: NotificationFilterCategory) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onShowToast: (kind: 'ok' | 'error', text: string) => void;
}

export function PortalNotificationsPage({
  user,
  notificationsData,
  onMarkRead,
  onMarkAllRead,
  onRefresh,
  onShowToast,
}: PortalNotificationsPageProps) {
  const { uiLanguage, tr } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<NotificationFilterCategory>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [savingPref, setSavingPref] = useState(false);

  const items = notificationsData?.notifications || [];
  const unreadCount = notificationsData?.unreadCount || 0;
  const filtered =
    selectedCategory === 'all'
      ? items
      : items.filter((n) => n.category === selectedCategory);

  const preferences = notificationsData?.preferences;
  const policy = notificationsData?.policy;

  const toggleUserCategory = async (category: NotificationCategory) => {
    if (!preferences) return;
    setSavingPref(true);
    try {
      await api.updateUserNotificationPreferences({
        categories: { [category]: !preferences.categories[category] },
      });
      await onRefresh();
      onShowToast('ok', tr('Notification preference updated.'));
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not save preference.'));
    } finally {
      setSavingPref(false);
    }
  };

  const toggleAdminRule = async (
    key:
      | 'rentRemindersEnabled'
      | 'overdueAlertsEnabled'
      | 'paymentAlertsEnabled'
      | 'residentUpdatesEnabled'
      | 'complaintsEnabled'
  ) => {
    if (!policy) return;
    setSavingPref(true);
    try {
      await api.updateAdminNotificationPolicy({ [key]: !policy[key] });
      await onRefresh();
      onShowToast('ok', tr('Platform alert rule updated.'));
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not save rule.'));
    } finally {
      setSavingPref(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="typo-dashboard-title text-slate-900">{tr('Notifications')}</h1>
          <p className="mt-1 typo-body text-slate-600">
            {tr('Recent rent reminders, payment updates, tenant activity, and complaints.')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => onMarkAllRead(selectedCategory)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 typo-btn font-semibold text-slate-700 hover:bg-slate-50"
            >
              <CheckCheck className="h-4 w-4 text-teal-700" aria-hidden="true" />
              <span>{tr('Mark All Read')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSettings((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 typo-btn font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Settings className="h-4 w-4 text-slate-600" aria-hidden="true" />
            <span>{showSettings ? tr('Back to Alerts') : tr('Preferences')}</span>
          </button>
        </div>
      </div>

      {showSettings && preferences ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-5">
          <div>
            <h2 className="typo-section-heading text-slate-900">{tr('My Alert Preferences')}</h2>
            <p className="mt-1 typo-helper text-slate-500">
              {tr('Choose which notifications appear in your feed.')}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {NOTIFICATION_CATEGORIES.filter((c) => c.id !== 'all').map((cat) => {
                const key = cat.id as NotificationCategory;
                const enabled = preferences.categories[key] !== false;
                return (
                  <label
                    key={cat.id}
                    className="flex items-center justify-between rounded-md border border-slate-200 px-3.5 py-2.5 cursor-pointer hover:bg-slate-50"
                  >
                    <span className="typo-body font-medium text-slate-800">{tr(cat.label)}</span>
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={savingPref}
                      onChange={() => toggleUserCategory(key)}
                      className="h-4 w-4 accent-teal-700"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          {user.role === 'overall_admin' && policy && (
            <div className="border-t border-slate-200 pt-4">
              <h2 className="typo-section-heading text-slate-900">{tr('Platform Alert Rules')}</h2>
              <p className="mt-1 typo-helper text-slate-500">
                {tr('Enable or disable automatic alerts across all PG properties.')}
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {(
                  [
                    { key: 'rentRemindersEnabled', label: 'Automatic Rent Reminders' },
                    { key: 'overdueAlertsEnabled', label: 'Overdue Rent Alerts' },
                    { key: 'paymentAlertsEnabled', label: 'Payment Alerts' },
                    { key: 'residentUpdatesEnabled', label: 'Tenant Check-in & Check-out' },
                    { key: 'complaintsEnabled', label: 'Complaint Alerts' },
                  ] as const
                ).map((rule) => (
                  <label
                    key={rule.key}
                    className="flex items-center justify-between rounded-md border border-slate-200 px-3.5 py-2.5 cursor-pointer hover:bg-slate-50"
                  >
                    <span className="typo-body font-medium text-slate-800">{tr(rule.label)}</span>
                    <input
                      type="checkbox"
                      checked={policy[rule.key]}
                      disabled={savingPref}
                      onChange={() => toggleAdminRule(rule.key)}
                      className="h-4 w-4 accent-teal-700"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2.5">
            {NOTIFICATION_CATEGORIES.map((cat) => {
              const counts = notificationsData?.categoryCounts?.[cat.id];
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`rounded px-3 py-1.5 typo-btn transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-teal-700 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {tr(cat.shortLabel)}
                  {counts && counts.unread > 0 ? ` (${counts.unread})` : ''}
                </button>
              );
            })}
          </div>

          <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            {filtered.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Bell className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
                <p className="typo-card-title text-slate-900">{tr('No notifications')}</p>
                <p className="typo-helper text-slate-500">
                  {tr('You are all caught up in this category.')}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {filtered.slice(0, 40).map((notif) => {
                  const Icon = getNotificationIcon(notif.category, notif.eventType);
                  const styleClass = getNotificationIconStyle(
                    notif.category,
                    notif.eventType,
                    notif.priority
                  );
                  return (
                    <li
                      key={notif.id}
                      className={`flex items-start justify-between gap-4 px-5 py-3.5 ${
                        notif.isRead ? 'bg-white' : 'bg-teal-50/40'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${styleClass}`}
                        >
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="typo-body font-semibold text-slate-900">{tr(notif.title)}</p>
                          <p className="mt-0.5 typo-body text-slate-600">{tr(notif.message)}</p>
                          <p className="mt-1 typo-helper text-slate-500">
                            {notif.tenantName ? `${notif.tenantName} · ` : ''}
                            {formatNotificationDateTime(notif.createdAt, uiLanguage)}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {!notif.isRead ? (
                          <button
                            type="button"
                            onClick={() => onMarkRead(notif.id)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 text-teal-700" aria-hidden="true" />
                            <span>{tr('Mark Read')}</span>
                          </button>
                        ) : (
                          <span className="typo-helper text-slate-400">{tr('Read')}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
