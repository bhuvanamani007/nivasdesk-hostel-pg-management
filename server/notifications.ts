import crypto from 'crypto';
import type { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { resolveSessionFromIncomingMessage } from './auth.ts';
import { maskPhone, store } from './store.ts';
import type {
  AdminNotificationPolicy,
  AppNotification,
  ClientNotification,
  NotificationCategory,
  NotificationEventType,
  NotificationFilterCategory,
  NotificationPriority,
  NotificationsPayload,
  ReminderLog,
  User,
  UserNotificationPreferences,
  UserRole,
} from '../src/types/domain.ts';

interface WsClientEntry {
  ws: WebSocket;
  user: User;
  activeTenantId: string;
}

const ALL_CATEGORIES: NotificationCategory[] = [
  'rent_reminders',
  'payment_alerts',
  'resident_updates',
  'complaints',
  'maintenance_alerts',
  'system_alerts',
];

const wsClients = new Set<WsClientEntry>();
let wssInstance: WebSocketServer | null = null;

function todayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function diffDaysBetweenYmd(targetYmd: string, baseYmd: string): number {
  const tMs = Date.parse(`${targetYmd}T00:00:00Z`);
  const bMs = Date.parse(`${baseYmd}T00:00:00Z`);
  if (Number.isNaN(tMs) || Number.isNaN(bMs)) return 9999;
  return Math.round((tMs - bMs) / 86_400_000);
}

export function getOwnedTenantIdsForUser(user: User): Set<string> {
  const db = store.getRawState();
  if (user.role === 'overall_admin') {
    return new Set(db.tenants.map((t) => t.id));
  }
  if (user.role === 'owner') {
    return new Set(
      db.tenants
        .filter((t) => t.ownerId === user.id || t.id === user.tenantId)
        .map((t) => t.id)
    );
  }
  return new Set([user.tenantId]);
}

export function isEventAllowedByPolicy(
  eventType: NotificationEventType,
  category: NotificationCategory,
  policy: AdminNotificationPolicy
): boolean {
  if (eventType === 'rent_overdue') {
    return policy.rentRemindersEnabled && policy.overdueAlertsEnabled;
  }
  if (
    eventType === 'rent_reminder_5d' ||
    eventType === 'rent_reminder_2d' ||
    eventType === 'rent_due_today'
  ) {
    return policy.rentRemindersEnabled;
  }
  switch (category) {
    case 'rent_reminders':
      return policy.rentRemindersEnabled;
    case 'payment_alerts':
      return policy.paymentAlertsEnabled;
    case 'resident_updates':
      return policy.residentUpdatesEnabled;
    case 'complaints':
      return policy.complaintsEnabled;
    case 'maintenance_alerts':
      return policy.maintenanceAlertsEnabled;
    case 'system_alerts':
      return policy.systemAlertsEnabled;
    default:
      return true;
  }
}

export function canUserAccessNotification(
  user: User,
  ownedTenantIds: Set<string>,
  notif: AppNotification,
  policy: AdminNotificationPolicy,
  prefs: UserNotificationPreferences,
  respectUserPrefs = true
): boolean {
  if (!isEventAllowedByPolicy(notif.eventType, notif.category, policy)) {
    return false;
  }
  if (!notif.targetRoles.includes(user.role)) {
    return false;
  }
  if (
    notif.assignedUserId &&
    user.role !== 'overall_admin' &&
    user.role !== 'owner' &&
    notif.assignedUserId !== user.id
  ) {
    return false;
  }
  if (user.role === 'overall_admin') {
    // Overall Admin sees platform-wide and cross-property alerts targeted to overall_admin
  } else if (user.role === 'owner') {
    if (notif.tenantId !== 'platform' && !ownedTenantIds.has(notif.tenantId)) {
      return false;
    }
  } else {
    if (notif.tenantId !== 'platform' && notif.tenantId !== user.tenantId) {
      return false;
    }
  }

  if (respectUserPrefs && prefs.categories[notif.category] === false) {
    return false;
  }

  return true;
}

function sendWsJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function broadcastNotification(notif: AppNotification) {
  const policy = store.getNotificationPolicy();
  for (const entry of wsClients) {
    if (entry.ws.readyState !== WebSocket.OPEN) continue;
    const owned = getOwnedTenantIdsForUser(entry.user);
    const prefs = store.getUserNotificationPreferences(entry.user.id);
    if (canUserAccessNotification(entry.user, owned, notif, policy, prefs, true)) {
      const clientNotif: ClientNotification = {
        ...notif,
        isRead: notif.readByUserIds.includes(entry.user.id),
      };
      sendWsJson(entry.ws, { type: 'notification:created', notification: clientNotif });
    }
  }
}

export function broadcastReadState(userId: string, notificationIds: string[] | 'all') {
  for (const entry of wsClients) {
    if (entry.user.id === userId && entry.ws.readyState === WebSocket.OPEN) {
      sendWsJson(entry.ws, {
        type: 'notification:read',
        notificationIds,
      });
    }
  }
}

export function broadcastPolicyOrSync(eventType: 'notification:sync' = 'notification:sync') {
  for (const entry of wsClients) {
    if (entry.ws.readyState === WebSocket.OPEN) {
      sendWsJson(entry.ws, { type: eventType });
    }
  }
}

export function initNotificationWsServer(httpServer: HttpServer) {
  if (wssInstance) return wssInstance;

  const wss = new WebSocketServer({ server: httpServer, path: '/ws/notifications' });
  wssInstance = wss;

  wss.on('connection', (ws, req) => {
    let token = '';
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      token = url.searchParams.get('token') || '';
    } catch {
      token = '';
    }

    const session = resolveSessionFromIncomingMessage(req, token);
    if (!session) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const clientEntry: WsClientEntry = {
      ws,
      user: session.user,
      activeTenantId: session.tenant.id,
    };
    wsClients.add(clientEntry);

    sendWsJson(ws, {
      type: 'notification:connected',
      userId: session.user.id,
      role: session.user.role,
    });

    ws.on('close', () => {
      wsClients.delete(clientEntry);
    });
    ws.on('error', () => {
      wsClients.delete(clientEntry);
    });
  });

  return wss;
}

export interface EmitNotificationInput {
  tenantId: string;
  tenantName?: string;
  category: NotificationCategory;
  eventType: NotificationEventType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  targetRoles: UserRole[];
  assignedUserId?: string | null;
  targetTab?: string;
  targetId?: string;
  dedupeKey?: string;
  skipSave?: boolean;
  skipBroadcast?: boolean;
}

export function emitAppNotification(input: EmitNotificationInput): AppNotification | null {
  const db = store.getRawState();
  const notifications = store.getNotifications();
  const policy = store.getNotificationPolicy();

  if (!isEventAllowedByPolicy(input.eventType, input.category, policy)) {
    return null;
  }

  if (input.dedupeKey && notifications.some((n) => n.dedupeKey === input.dedupeKey)) {
    return null;
  }

  const resolvedTenantName =
    input.tenantName ||
    (input.tenantId === 'platform'
      ? 'Platform Wide'
      : db.tenants.find((t) => t.id === input.tenantId)?.name || 'PG Property');

  const notif: AppNotification = {
    id: `ntf_${crypto.randomUUID().slice(0, 10)}`,
    tenantId: input.tenantId,
    tenantName: resolvedTenantName,
    category: input.category,
    eventType: input.eventType,
    priority: input.priority || 'normal',
    title: input.title,
    message: input.message,
    targetRoles: input.targetRoles,
    assignedUserId: input.assignedUserId ?? null,
    targetTab: input.targetTab,
    targetId: input.targetId,
    dedupeKey: input.dedupeKey,
    readByUserIds: [],
    resolved: false,
    createdAt: new Date().toISOString(),
  };

  notifications.unshift(notif);
  if (notifications.length > 3000) {
    notifications.length = 3000;
  }

  if (!input.skipSave) {
    store.save();
  }
  if (!input.skipBroadcast) {
    broadcastNotification(notif);
  }

  return notif;
}

export function resolvePaymentRentNotifications(paymentId: string): boolean {
  const notifications = store.getNotifications();
  let changed = false;
  for (const n of notifications) {
    if (n.category === 'rent_reminders' && n.targetId === paymentId && !n.resolved) {
      n.resolved = true;
      changed = true;
    }
  }
  return changed;
}

/**
 * Automatic Date-Based Rent Reminder Engine:
 * - 5 days before due date
 * - 2 days before due date
 * - On the due date (0 days)
 * - Overdue alert after due date
 * Stops automatically when payment is completed (outstanding <= 0).
 * Uses deterministic dedupeKeys to prevent duplicate rent reminders.
 */
export function syncDateBasedRentNotifications(options?: { broadcast?: boolean }): number {
  const db = store.getRawState();
  const policy = store.getNotificationPolicy();
  const today = todayYmd();

  const tenantMap = new Map(db.tenants.map((t) => [t.id, t]));
  const guestMap = new Map(db.guests.map((g) => [g.id, g]));
  const stayMap = new Map(db.stays.map((s) => [s.id, s]));
  const roomMap = new Map(db.rooms.map((r) => [r.id, r]));
  const bedMap = new Map(db.beds.map((b) => [b.id, b]));

  let createdCount = 0;
  let mutated = false;
  const newlyCreated: AppNotification[] = [];

  for (const payment of db.payments) {
    const outstanding = Math.max(0, payment.amount - (payment.paidAmount ?? 0));
    if (
      payment.status === 'paid' ||
      payment.status === 'refunded' ||
      outstanding <= 0
    ) {
      if (resolvePaymentRentNotifications(payment.id)) {
        mutated = true;
      }
      continue;
    }

    const stay = stayMap.get(payment.stayId);
    if (stay && stay.status === 'cancelled') {
      continue;
    }

    const tenant = tenantMap.get(payment.tenantId);
    const guest = guestMap.get(payment.guestId);
    if (!tenant || !guest || !payment.dueDate) {
      continue;
    }

    const room = stay ? roomMap.get(stay.roomId) : undefined;
    const bed = stay ? bedMap.get(stay.bedId) : undefined;
    const roomLabel = room ? `${room.roomNumber}${bed ? `-${bed.bedLabel}` : ''}` : 'Room';
    const diffDays = diffDaysBetweenYmd(payment.dueDate, today);

    let stageKey: '5d' | '2d' | '0d' | 'overdue' | null = null;
    let eventType: NotificationEventType | null = null;
    let priority: NotificationPriority = 'normal';
    let title = '';
    let message = '';
    let targetRoles: UserRole[] = ['owner', 'warden', 'staff'];

    if (diffDays < 0) {
      if (payment.status === 'unpaid') {
        payment.status = 'overdue';
        mutated = true;
      }
      stageKey = 'overdue';
      eventType = 'rent_overdue';
      priority = 'urgent';
      const overdueDays = Math.abs(diffDays);
      title = `Overdue Rent Alert: ${guest.fullName}`;
      message = `₹${outstanding.toLocaleString('en-IN')} overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'} (Due ${payment.dueDate}) · ${tenant.name} (${roomLabel}).`;
      targetRoles = ['overall_admin', 'owner', 'warden', 'staff'];
    } else if (diffDays === 0) {
      stageKey = '0d';
      eventType = 'rent_due_today';
      priority = 'high';
      title = `Rent Due Today: ${guest.fullName}`;
      message = `Monthly rent of ₹${outstanding.toLocaleString('en-IN')} is due today (${payment.dueDate}) for ${roomLabel} at ${tenant.name}.`;
      targetRoles = ['overall_admin', 'owner', 'warden', 'staff'];
    } else if (diffDays <= 2) {
      stageKey = '2d';
      eventType = 'rent_reminder_2d';
      priority = 'high';
      title = `Rent Due in ${diffDays} Day${diffDays === 1 ? '' : 's'}: ${guest.fullName}`;
      message = `2-day rent reminder sent for ${guest.fullName} (${roomLabel}) · ₹${outstanding.toLocaleString('en-IN')} due ${payment.dueDate}.`;
      targetRoles = ['owner', 'warden', 'staff'];
    } else if (diffDays <= 5) {
      stageKey = '5d';
      eventType = 'rent_reminder_5d';
      priority = 'normal';
      title = `Rent Due in ${diffDays} Days: ${guest.fullName}`;
      message = `5-day advance rent reminder sent for ${guest.fullName} (${roomLabel}) · ₹${outstanding.toLocaleString('en-IN')} due ${payment.dueDate}.`;
      targetRoles = ['owner', 'warden', 'staff'];
    }

    if (!stageKey || !eventType) {
      continue;
    }

    const dedupeKey = `rent_${stageKey}:${payment.id}:${payment.dueDate}`;
    const created = emitAppNotification({
      tenantId: tenant.id,
      tenantName: tenant.name,
      category: 'rent_reminders',
      eventType,
      priority,
      title,
      message,
      targetRoles,
      targetTab: 'payments',
      targetId: payment.id,
      dedupeKey,
      skipSave: true,
      skipBroadcast: true,
    });

    if (created) {
      createdCount += 1;
      mutated = true;
      newlyCreated.push(created);

      // Also log resident reminder dispatch record without duplicating
      if (tenant.settings.unpaidReminderEnabled && stay) {
        const logExists = db.reminderLogs.some(
          (r) =>
            r.paymentId === payment.id &&
            r.dueDate === payment.dueDate &&
            r.errorReason === `auto_stage:${stageKey}`
        );
        if (!logExists) {
          const log: ReminderLog = {
            id: `rem_${crypto.randomUUID().slice(0, 8)}`,
            tenantId: tenant.id,
            stayId: stay.id,
            paymentId: payment.id,
            guestId: guest.id,
            guestName: guest.fullName,
            roomLabel,
            type: 'unpaid_charge',
            channel: 'sms',
            recipientMasked: maskPhone(guest.primaryPhone),
            messagePreview: `${title} — ${message}`,
            provider: tenant.settings.smsProvider,
            status: tenant.settings.smsProvider === 'disabled' ? 'disabled' : 'mocked',
            dueDate: payment.dueDate,
            attemptedAt: new Date().toISOString(),
            errorReason: `auto_stage:${stageKey}`,
            sentByName: 'Auto Rent Scheduler',
            createdAt: new Date().toISOString(),
          };
          db.reminderLogs.push(log);
        }
      }
    }
  }

  // Also ensure existing notifications respect policy flag changes cleanly
  void policy;

  if (mutated) {
    store.save();
    if (options?.broadcast) {
      for (const n of newlyCreated) {
        broadcastNotification(n);
      }
    }
  }

  return createdCount;
}

export function buildUserNotificationsPayload(
  user: User,
  options?: {
    category?: NotificationFilterCategory;
    status?: 'all' | 'unread' | 'read';
    search?: string;
    includeMuted?: boolean;
  }
): NotificationsPayload {
  const owned = getOwnedTenantIdsForUser(user);
  const policy = store.getNotificationPolicy();
  const prefs = store.getUserNotificationPreferences(user.id);
  const allNotifications = store.getNotifications();

  const baseVisible = allNotifications
    .filter((n) =>
      canUserAccessNotification(user, owned, n, policy, prefs, !options?.includeMuted)
    )
    .map<ClientNotification>((n) => ({
      ...n,
      isRead: n.readByUserIds.includes(user.id),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const categoryCounts: Record<NotificationFilterCategory, { total: number; unread: number }> = {
    all: { total: baseVisible.length, unread: 0 },
    rent_reminders: { total: 0, unread: 0 },
    payment_alerts: { total: 0, unread: 0 },
    resident_updates: { total: 0, unread: 0 },
    complaints: { total: 0, unread: 0 },
    maintenance_alerts: { total: 0, unread: 0 },
    system_alerts: { total: 0, unread: 0 },
  };

  for (const item of baseVisible) {
    if (!item.isRead) categoryCounts.all.unread += 1;
    categoryCounts[item.category].total += 1;
    if (!item.isRead) {
      categoryCounts[item.category].unread += 1;
    }
  }

  const categoryFilter = options?.category || 'all';
  const statusFilter = options?.status || 'all';
  const q = (options?.search || '').trim().toLowerCase();

  const filtered = baseVisible.filter((item) => {
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
    if (statusFilter === 'unread' && item.isRead) return false;
    if (statusFilter === 'read' && !item.isRead) return false;
    if (q) {
      const hay = `${item.title} ${item.message} ${item.tenantName || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  return {
    notifications: filtered,
    unreadCount: categoryCounts.all.unread,
    categoryCounts,
    policy,
    preferences: prefs,
  };
}

export { ALL_CATEGORIES };
