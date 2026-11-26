import {
  AlertTriangle,
  Bell,
  Clock,
  IndianRupee,
  Megaphone,
  MessageSquareWarning,
  UserCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type {
  NotificationCategory,
  NotificationEventType,
  NotificationFilterCategory,
} from '../types/domain';

export interface NotificationCategoryDef {
  id: NotificationFilterCategory;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
}

export const NOTIFICATION_CATEGORIES: NotificationCategoryDef[] = [
  { id: 'all', label: 'All Notifications', shortLabel: 'All', icon: Bell },
  { id: 'rent_reminders', label: 'Rent Reminders', shortLabel: 'Rent', icon: Clock },
  { id: 'payment_alerts', label: 'Payment Alerts', shortLabel: 'Payments', icon: IndianRupee },
  { id: 'resident_updates', label: 'Resident Updates', shortLabel: 'Residents', icon: UserCheck },
  { id: 'complaints', label: 'Complaints', shortLabel: 'Complaints', icon: MessageSquareWarning },
  { id: 'maintenance_alerts', label: 'Maintenance Alerts', shortLabel: 'Maint.', icon: Wrench },
  { id: 'system_alerts', label: 'System Alerts', shortLabel: 'System', icon: Megaphone },
];

export const USER_CATEGORY_PREF_ITEMS: Array<{
  key: NotificationCategory;
  label: string;
  description: string;
}> = [
  {
    key: 'rent_reminders',
    label: 'Rent Reminders & Overdue Alerts',
    description: 'Automatic reminders 5 days before, 2 days before, on due date, and overdue notices.',
  },
  {
    key: 'payment_alerts',
    label: 'Payment & Deposit Alerts',
    description: 'Rent payments received, partial collections, and security deposit updates.',
  },
  {
    key: 'resident_updates',
    label: 'Resident & Visitor Updates',
    description: 'New resident registrations, check-ins, check-outs, and visitor entries.',
  },
  {
    key: 'complaints',
    label: 'Complaints & Assignments',
    description: 'New resident complaints, priority tickets, and resolution updates.',
  },
  {
    key: 'maintenance_alerts',
    label: 'Maintenance Alerts',
    description: 'Maintenance requests, repair expenses, and room/bed maintenance status changes.',
  },
  {
    key: 'system_alerts',
    label: 'System Alerts & Announcements',
    description: 'Owner registrations, room/bed inventory changes, and Admin announcements.',
  },
];

export function getNotificationIcon(
  category: NotificationCategory,
  eventType?: NotificationEventType
): LucideIcon {
  if (eventType === 'rent_overdue') return AlertTriangle;
  if (eventType === 'admin_announcement') return Megaphone;
  switch (category) {
    case 'rent_reminders':
      return Clock;
    case 'payment_alerts':
      return IndianRupee;
    case 'resident_updates':
      return UserCheck;
    case 'complaints':
      return MessageSquareWarning;
    case 'maintenance_alerts':
      return Wrench;
    case 'system_alerts':
    default:
      return Megaphone;
  }
}

export function getNotificationIconStyle(
  category: NotificationCategory,
  eventType?: NotificationEventType,
  priority?: string
): string {
  if (eventType === 'rent_overdue' || priority === 'urgent') {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  switch (category) {
    case 'rent_reminders':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'payment_alerts':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'resident_updates':
      return 'bg-teal-50 text-teal-700 border-teal-200';
    case 'complaints':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'maintenance_alerts':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'system_alerts':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export function formatNotificationDateTime(
  iso: string,
  lang: 'en' | 'ta' = 'en'
): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString(lang === 'ta' ? 'ta-IN' : 'en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function getCategoryLabel(category: NotificationCategory): string {
  return (
    NOTIFICATION_CATEGORIES.find((c) => c.id === category)?.label || 'Notification'
  );
}
