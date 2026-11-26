import 'dotenv/config';
import crypto from 'crypto';
import http from 'http';
import path from 'path';
import express from 'express';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import {
  clearSessionCookie,
  clearSignedOutCookie,
  createRateLimiter,
  requireAuth,
  requireRole,
  resolveSessionFromRequest,
  setSessionCookie,
  setSignedOutCookie,
} from './server/auth.ts';
import {
  broadcastPolicyOrSync,
  broadcastReadState,
  buildUserNotificationsPayload,
  canUserAccessNotification,
  emitAppNotification,
  getOwnedTenantIdsForUser,
  initNotificationWsServer,
  resolvePaymentRentNotifications,
  syncDateBasedRentNotifications,
} from './server/notifications.ts';
import {
  dispatchReminder,
  renderReminderTemplate,
  triggerVerificationCall,
} from './server/providers.ts';
import {
  ALLOWED_AVATAR_MIME_TYPES,
  ALLOWED_MIME_TYPES,
  hashPassword,
  MAX_AVATAR_BYTES,
  MAX_DOCUMENT_BYTES,
  maskIdNumber,
  maskPhone,
  sanitizeUser,
  store,
  verifyPassword,
} from './server/store.ts';
import {
  ROOM_TYPES,
  ROOM_TYPE_DEFAULT_TARIFF,
  type AdminAnnouncementRecord,
  type AdminOverviewPayload,
  type AdminOwnerSummary,
  type AdminPendingDueItem,
  type AdminPlanBreakdownItem,
  type AdminRecentCheckInItem,
  type AdminRecentPaymentItem,
  type AdminWardenRecord,
  type AdminWorkspaceSummary,
  type Bed,
  type ComplaintRecord,
  type DashboardNotification,
  type DashboardSummary,
  type Deposit,
  type DocumentRole,
  type EnrichedBed,
  type EnrichedDeposit,
  type EnrichedDocument,
  type EnrichedPayment,
  type EnrichedStay,
  type Expense,
  type ExpenseCategory,
  type Guest,
  type IdentityDocument,
  type IdDocumentType,
  type MaintenanceRequestRecord,
  type NotificationCategory,
  type NotificationFilterCategory,
  type OwnerOverviewPayload,
  type OwnerPropertySummary,
  type OwnerWardenRecord,
  type PaginationMeta,
  type Payment,
  type PaymentMode,
  type PaymentStatus,
  type ReminderChannel,
  type ReminderLog,
  type ReminderType,
  type ReportsPayload,
  type Room,
  type RoomStatus,
  type RoomType,
  type Stay,
  type StayStatus,
  type Tenant,
  type TenantPlanTier,
  type TenantStatus,
  type UserRole,
  type VisitorEntryRecord,
} from './src/types/domain.ts';

const PORT = 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_DOCUMENT_BYTES,
    files: 4,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error('Unsupported file type. Allowed: JPEG, PNG, WebP, PDF.'));
      return;
    }
    cb(null, true);
  },
});

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_AVATAR_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_AVATAR_MIME_TYPES.has(file.mimetype)) {
      cb(new Error('Unsupported profile photo format. Allowed: JPEG, PNG, WebP.'));
      return;
    }
    cb(null, true);
  },
});

const authLimiter = createRateLimiter({
  keyPrefix: 'auth',
  windowMs: 60_000,
  maxRequests: 40,
});

const outboundActionLimiter = createRateLimiter({
  keyPrefix: 'outbound',
  windowMs: 60_000,
  maxRequests: 30,
});

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function daysAgoYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function diffDays(fromIso: string, toIso: string): number {
  const start = new Date(fromIso).getTime();
  const end = new Date(toIso).getTime();
  return Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
}

function isWithinNextDays(ymd: string, days: number): boolean {
  if (!ymd) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(`${ymd}T00:00:00`);
  const diff = (target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
}

function addOneMonthYmd(dateTimeOrYmd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateTimeOrYmd.trim());
  if (!match) return todayYmd();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const targetYear = month === 12 ? year + 1 : year;
  const targetMonth = month === 12 ? 1 : month + 1;
  const daysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
  const clampedDay = Math.min(day, daysInTargetMonth);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${targetYear}-${pad(targetMonth)}-${pad(clampedDay)}`;
}

function getEffectiveStayStatus(stay: Stay, today = todayYmd()): StayStatus {
  if (stay.status === 'checked_out' || stay.status === 'cancelled' || stay.status === 'upcoming') {
    return stay.status;
  }
  if (stay.expectedCheckoutDate && stay.expectedCheckoutDate < today) {
    return 'overdue';
  }
  return 'active';
}

function getEffectivePaymentStatus(payment: Payment, today = todayYmd()): PaymentStatus {
  if (payment.status === 'refunded' || payment.status === 'paid') {
    return payment.status;
  }
  const paid = payment.paidAmount ?? 0;
  if (paid >= payment.amount) return 'paid';
  if (paid > 0) {
    return payment.dueDate < today ? 'overdue' : 'partially_paid';
  }
  return payment.dueDate < today ? 'overdue' : 'unpaid';
}

function hasBedDateConflict(
  tenantId: string,
  bedId: string,
  checkInYmd: string,
  expectedCheckoutYmd: string,
  excludeStayId?: string
): Stay | undefined {
  const stays = store.getStays(tenantId);
  const newEnd = expectedCheckoutYmd || '9999-12-31';
  return stays.find((s) => {
    if (s.id === excludeStayId) return false;
    if (s.bedId !== bedId) return false;
    const eff = getEffectiveStayStatus(s);
    if (eff === 'checked_out' || eff === 'cancelled') return false;
    const existingStart = s.checkInAt.slice(0, 10);
    const existingEnd = s.expectedCheckoutDate || '9999-12-31';
    return existingStart <= newEnd && checkInYmd <= existingEnd;
  });
}

function computeRoomStatus(room: Room, roomBeds: Bed[]): RoomStatus {
  if (room.status === 'maintenance') return 'maintenance';
  if (roomBeds.length > 0 && roomBeds.every((b) => b.status === 'maintenance')) {
    return 'maintenance';
  }
  if (roomBeds.some((b) => b.status === 'vacant')) {
    return 'available';
  }
  return roomBeds.some((b) => b.status === 'occupied') ? 'occupied' : 'available';
}

function enrichStays(tenantId: string): EnrichedStay[] {
  const guests = store.getGuests(tenantId);
  const rooms = store.getRooms(tenantId);
  const beds = store.getBeds(tenantId);
  const stays = store.getStays(tenantId);
  const payments = store.getPayments(tenantId);
  const today = todayYmd();

  const guestMap = new Map(guests.map((g) => [g.id, g]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const bedMap = new Map(beds.map((b) => [b.id, b]));

  return stays
    .map((stay) => {
      const guest = guestMap.get(stay.guestId);
      const room = roomMap.get(stay.roomId);
      const bed = bedMap.get(stay.bedId);
      const stayPayments = payments.filter((p) => p.stayId === stay.id);
      const nonRefunded = stayPayments.filter((p) => p.status !== 'refunded');
      const totalCharged = nonRefunded.reduce((sum, p) => sum + p.amount, 0);
      const totalPaid = nonRefunded.reduce((sum, p) => sum + (p.paidAmount ?? (p.status === 'paid' ? p.amount : 0)), 0);
      const balanceDue = Math.max(0, totalCharged - totalPaid);
      const openPayments = nonRefunded
        .filter((p) => (p.paidAmount ?? (p.status === 'paid' ? p.amount : 0)) < p.amount)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
      const endRef = stay.actualCheckoutAt || new Date().toISOString();
      const effectiveStatus = getEffectiveStayStatus(stay, today);

      return {
        ...stay,
        status: effectiveStatus,
        guestName: guest?.fullName || 'Unknown Guest',
        guestPhone: guest?.primaryPhone || '',
        guestAltPhoneVerified: guest?.altPhoneVerified || 'pending',
        roomNumber: room?.roomNumber || '—',
        floor: room?.floor || '',
        bedLabel: bed?.bedLabel || '—',
        durationDays: diffDays(stay.checkInAt, endRef),
        totalCharged,
        totalPaid,
        balanceDue,
        nextDueDate: openPayments[0]?.dueDate || null,
      };
    })
    .sort((a, b) => b.checkInAt.localeCompare(a.checkInAt));
}

function enrichPayments(tenantId: string): EnrichedPayment[] {
  const guests = store.getGuests(tenantId);
  const stays = store.getStays(tenantId);
  const rooms = store.getRooms(tenantId);
  const beds = store.getBeds(tenantId);
  const payments = store.getPayments(tenantId);
  const reminderLogs = store.getReminderLogs(tenantId);
  const today = todayYmd();

  const guestMap = new Map(guests.map((g) => [g.id, g]));
  const stayMap = new Map(stays.map((s) => [s.id, s]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const bedMap = new Map(beds.map((b) => [b.id, b]));

  return payments
    .map((p) => {
      const guest = guestMap.get(p.guestId);
      const stay = stayMap.get(p.stayId);
      const room = stay ? roomMap.get(stay.roomId) : undefined;
      const bed = stay ? bedMap.get(stay.bedId) : undefined;
      const latestRem = reminderLogs.find(
        (r) =>
          r.paymentId === p.id &&
          (r.status === 'sent' || r.status === 'mocked')
      );
      const paidAmt = p.paidAmount ?? (p.status === 'paid' ? p.amount : 0);
      const effectiveStatus = getEffectivePaymentStatus({ ...p, paidAmount: paidAmt }, today);
      const outstandingAmount =
        effectiveStatus === 'refunded' ? 0 : Math.max(0, p.amount - paidAmt);

      return {
        ...p,
        paidAmount: paidAmt,
        status: effectiveStatus,
        guestName: guest?.fullName || 'Unknown Guest',
        guestPhone: guest?.primaryPhone || '',
        roomNumber: room?.roomNumber || '—',
        bedLabel: bed?.bedLabel || '—',
        outstandingAmount,
        isOverdue: effectiveStatus === 'overdue',
        lastReminderAt: latestRem?.createdAt || null,
      };
    })
    .sort((a, b) => {
      const rank = (s: PaymentStatus) =>
        s === 'overdue' ? 0 : s === 'unpaid' ? 1 : s === 'partially_paid' ? 2 : s === 'paid' ? 3 : 4;
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return b.createdAt.localeCompare(a.createdAt);
    });
}

function enrichDeposits(tenantId: string): EnrichedDeposit[] {
  const guests = store.getGuests(tenantId);
  const stays = store.getStays(tenantId);
  const rooms = store.getRooms(tenantId);
  const beds = store.getBeds(tenantId);
  const deposits = store.getDeposits(tenantId);

  const guestMap = new Map(guests.map((g) => [g.id, g]));
  const stayMap = new Map(stays.map((s) => [s.id, s]));
  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const bedMap = new Map(beds.map((b) => [b.id, b]));

  return deposits
    .map((d) => {
      const guest = guestMap.get(d.guestId);
      const stay = stayMap.get(d.stayId);
      const room = stay ? roomMap.get(stay.roomId) : undefined;
      const bed = stay ? bedMap.get(stay.bedId) : undefined;
      const remainingHeld = Math.max(0, d.amount - d.adjustedAmount - d.refundedAmount);
      return {
        ...d,
        guestName: guest?.fullName || 'Unknown Guest',
        guestPhone: guest?.primaryPhone || '',
        roomNumber: room?.roomNumber || '—',
        bedLabel: bed?.bedLabel || '—',
        remainingHeld,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function enrichBeds(tenantId: string): EnrichedBed[] {
  const rooms = store.getRooms(tenantId);
  const beds = store.getBeds(tenantId);
  const stays = store.getStays(tenantId);
  const guests = store.getGuests(tenantId);
  const today = todayYmd();

  const roomMap = new Map(rooms.map((r) => [r.id, r]));
  const stayMap = new Map(stays.map((s) => [s.id, s]));
  const guestMap = new Map(guests.map((g) => [g.id, g]));

  return beds.map((bed) => {
    const room = roomMap.get(bed.roomId);
    const activeStay = bed.currentStayId ? stayMap.get(bed.currentStayId) : undefined;
    const occupant = activeStay ? guestMap.get(activeStay.guestId) : undefined;
    const nextUpcoming = stays
      .filter((s) => s.bedId === bed.id && s.status === 'upcoming')
      .sort((a, b) => a.checkInAt.localeCompare(b.checkInAt))[0];
    const upcomingGuest = nextUpcoming ? guestMap.get(nextUpcoming.guestId) : undefined;

    return {
      ...bed,
      roomNumber: room?.roomNumber || '—',
      floor: room?.floor || '',
      roomType: room?.roomType || '2-Sharing',
      monthlyTariff: room?.monthlyTariff || 0,
      occupantGuestId: occupant?.id,
      occupantGuestName: occupant?.fullName,
      occupantStayId: activeStay?.id,
      occupantExpectedCheckoutDate: activeStay?.expectedCheckoutDate,
      occupantStayStatus: activeStay ? getEffectiveStayStatus(activeStay, today) : undefined,
      upcomingReservation: nextUpcoming
        ? {
            stayId: nextUpcoming.id,
            guestId: nextUpcoming.guestId,
            guestName: upcomingGuest?.fullName || 'Reserved Guest',
            checkInAt: nextUpcoming.checkInAt,
            expectedCheckoutDate: nextUpcoming.expectedCheckoutDate,
          }
        : null,
    };
  });
}

function generateReceiptNumber(tenant: Tenant): string {
  const prefix =
    tenant.receiptPrefix?.trim().toUpperCase() ||
    tenant.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') ||
    'PG';
  const year = new Date().getFullYear();
  const seq = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${year}-${seq}`;
}

function paginateItems<T>(
  items: T[],
  rawPage: unknown,
  rawPageSize: unknown,
  defaultPageSize = 8
): { items: T[]; pagination: PaginationMeta } {
  const parsedSize = Number(rawPageSize);
  const pageSize =
    Number.isFinite(parsedSize) && parsedSize >= 1
      ? Math.min(100, Math.floor(parsedSize))
      : defaultPageSize;
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const parsedPage = Number(rawPage);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : 1;
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
    },
  };
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Bootstrap / Auth session inspection
  app.get('/api/auth/session', (req, res) => {
    const db = store.getRawState();
    const sampleWorkspaces = db.tenants
      .filter((t) => t.isSample)
      .map((t) => {
        const owner = db.users.find((u) => u.tenantId === t.id && u.role === 'owner');
        return {
          tenantId: t.id,
          name: t.name,
          city: `${t.locality || t.city}, ${t.district || 'Tamil Nadu'}`,
          wardenEmail: owner?.email || '',
        };
      });

    let ctx = resolveSessionFromRequest(req);
    const cookiesHeader = req.headers.cookie || '';
    const explicitlySignedOut =
      cookiesHeader.includes('nivas_signed_out=1') || req.query.signedOut === '1';

    if (!ctx && !explicitlySignedOut) {
      const defaultTenant =
        db.tenants.find((t) => t.id === 'ten_lakshmi_pg' && t.status !== 'suspended') ||
        db.tenants.find((t) => t.isSample && t.status !== 'suspended');
      const defaultUser = defaultTenant
        ? db.users.find(
            (u) => u.tenantId === defaultTenant.id && u.role === 'owner' && u.isActive !== false
          ) ||
          db.users.find((u) => u.role === 'overall_admin' && u.isActive !== false)
        : undefined;
      if (defaultUser && defaultTenant) {
        const token = setSessionCookie(req, res, defaultUser.id, defaultTenant.id);
        ctx = { user: sanitizeUser(defaultUser), tenant: defaultTenant, token };
      }
    }

    res.json({
      authenticated: Boolean(ctx),
      tenant: ctx?.tenant || null,
      user: ctx?.user || null,
      sessionToken: ctx?.token || null,
      sampleWorkspaces,
    });
  });

  app.post('/api/auth/login', authLimiter, (req, res) => {
    const identifier = String(req.body?.email || req.body?.username || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');

    if (!identifier || !password) {
      res.status(400).json({ error: 'Email/username and password are required.' });
      return;
    }

    const db = store.getRawState();
    const user = db.users.find((u) => {
      const emailLower = u.email.toLowerCase();
      const nameLower = u.name.toLowerCase();
      const localPart = emailLower.split('@')[0];
      return emailLower === identifier || nameLower === identifier || localPart === identifier;
    });
    if (!user || user.isActive === false || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid credentials or deactivated account.' });
      return;
    }

    const tenant = db.tenants.find((t) => t.id === user.tenantId);
    if (!tenant) {
      res.status(401).json({ error: 'Workspace not found.' });
      return;
    }
    if (tenant.status === 'suspended' && user.role !== 'overall_admin') {
      res.status(403).json({
        error: 'This PG workspace is currently suspended. Contact Overall Admin.',
      });
      return;
    }

    clearSignedOutCookie(req, res);
    const sessionToken = setSessionCookie(req, res, user.id, tenant.id);
    res.json({ user: sanitizeUser(user), tenant, sessionToken });
  });

  app.post('/api/auth/demo-switch', authLimiter, (req, res) => {
    const tenantId = String(req.body?.tenantId || '').trim();
    const requestedRole = String(req.body?.role || 'owner').trim() as UserRole;
    const db = store.getRawState();

    const tenant = tenantId
      ? db.tenants.find((t) => t.id === tenantId && t.isSample && t.status !== 'suspended')
      : db.tenants.find((t) => t.isSample && t.status !== 'suspended');

    let user;
    if (requestedRole === 'overall_admin') {
      user = db.users.find((u) => u.role === 'overall_admin' && u.isActive !== false);
    } else if (tenant && requestedRole === 'warden') {
      user =
        db.users.find((u) => u.tenantId === tenant.id && u.role === 'warden' && u.isActive !== false) ||
        db.users.find((u) => u.tenantId === tenant.id && u.isActive !== false);
    } else if (tenant) {
      user =
        db.users.find((u) => u.id === tenant.ownerId && u.isActive !== false) ||
        db.users.find((u) => u.tenantId === tenant.id && u.role === 'owner' && u.isActive !== false) ||
        db.users.find((u) => u.tenantId === tenant.id && u.isActive !== false);
    }

    if (!tenant || !user) {
      res.status(404).json({ error: 'Sample workspace or role account not found.' });
      return;
    }

    clearSignedOutCookie(req, res);
    const sessionToken = setSessionCookie(req, res, user.id, tenant.id);
    res.json({ user: sanitizeUser(user), tenant, sessionToken });
  });

  app.post('/api/auth/register-workspace', authLimiter, (req, res) => {
    const wardenName = String(req.body?.wardenName || req.body?.name || '').trim();
    const rawHostelName = String(req.body?.hostelName || '').trim();
    const hostelName = rawHostelName || (wardenName ? `${wardenName}'s PG` : '');
    const district = String(req.body?.district || req.body?.city || 'Chennai').trim();
    const locality = String(req.body?.locality || '').trim();
    const pincode = String(req.body?.pincode || '').trim();
    const phone = String(req.body?.phone || req.body?.wardenPhone || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!wardenName || !email || password.length < 6) {
      res.status(400).json({
        error: 'Name, email, and a password (6+ chars) are required.',
      });
      return;
    }

    const db = store.getRawState();
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const tenantId = `ten_${crypto.randomUUID().slice(0, 8)}`;
    const userId = `usr_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const prefix = hostelName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('');

    const newTenant: Tenant = {
      id: tenantId,
      name: hostelName,
      city: district,
      district,
      locality,
      pincode,
      landmark: '',
      address: [locality, district, 'Tamil Nadu', pincode].filter(Boolean).join(', '),
      wardenPhone: phone || '+91 90000 00000',
      gstinOrReg: '',
      timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
      preferredLanguage: 'en',
      houseRules:
        '1. Quiet hours after 10:30 PM.\n2. Inform warden in advance for late arrivals or extended stays.',
      receiptPrefix: prefix || 'PG',
      agreementNotes: 'Terms configurable by hostel management.',
      isSample: false,
      ownerId: userId,
      status: 'active',
      planTier: 'standard',
      settings: {
        smsProvider: 'mock',
        whatsappProvider: 'mock',
        telephonyProvider: 'mock',
        smsCooldownHours: 24,
        reminderLeadDays: 3,
        smsTemplate:
          'Reminder from {{hostelName}}: Payment of ₹{{amount}} for Room {{room}} is due on {{dueDate}}.',
        checkoutReminderTemplate:
          'Hello {{guestName}}, your stay at {{hostelName}} (Room {{room}}) is scheduled for checkout on {{checkoutDate}}.',
        unpaidReminderEnabled: true,
        checkoutReminderEnabled: true,
        requireIdDocument: false,
      },
      createdAt: now,
    };

    db.tenants.push(newTenant);
    db.users.push({
      id: userId,
      tenantId,
      name: wardenName,
      email,
      role: 'owner',
      isActive: true,
      passwordHash: hashPassword(password),
      createdAt: now,
    });
    store.save();

    emitAppNotification({
      tenantId: newTenant.id,
      tenantName: newTenant.name,
      category: 'system_alerts',
      eventType: 'owner_registered',
      priority: 'normal',
      title: `New PG Owner Registered: ${wardenName}`,
      message: `${wardenName} registered "${newTenant.name}" (${newTenant.district}).`,
      targetRoles: ['overall_admin'],
      targetTab: 'admin-owners',
      targetId: userId,
    });

    clearSignedOutCookie(req, res);
    const sessionToken = setSessionCookie(req, res, userId, tenantId);
    res.status(201).json({
      tenant: newTenant,
      user: {
        id: userId,
        tenantId,
        name: wardenName,
        email,
        role: 'owner',
        isActive: true,
        createdAt: now,
      },
      sessionToken,
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    setSignedOutCookie(req, res);
    res.json({ ok: true });
  });

  // --- User Profile, Avatar & Password Management (Authenticated Current User) ---
  app.get('/api/profile', requireAuth, (req, res) => {
    const db = store.getRawState();
    const storedUser = db.users.find((u) => u.id === req.sessionCtx!.user.id);
    if (!storedUser) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }
    res.json({ user: sanitizeUser(storedUser) });
  });

  app.patch('/api/profile', requireAuth, (req, res) => {
    const db = store.getRawState();
    const storedUser = db.users.find((u) => u.id === req.sessionCtx!.user.id);
    if (!storedUser) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }

    if (typeof req.body?.name === 'string') {
      const nextName = req.body.name.trim();
      if (!nextName || nextName.length > 80) {
        res.status(400).json({ error: 'Full name must be between 1 and 80 characters.' });
        return;
      }
      storedUser.name = nextName;
    }

    if (typeof req.body?.email === 'string') {
      const nextEmail = req.body.email.trim().toLowerCase();
      if (!nextEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }
      if (db.users.some((u) => u.id !== storedUser.id && u.email.toLowerCase() === nextEmail)) {
        res.status(409).json({ error: 'Another account already uses this email address.' });
        return;
      }
      storedUser.email = nextEmail;
    }

    if (typeof req.body?.phone === 'string') {
      const nextPhone = req.body.phone.trim();
      if (nextPhone.length > 24) {
        res.status(400).json({ error: 'Phone number cannot exceed 24 characters.' });
        return;
      }
      if (nextPhone && !/^[+\d\s()-]{6,24}$/.test(nextPhone)) {
        res.status(400).json({ error: 'Please enter a valid phone number.' });
        return;
      }
      storedUser.phone = nextPhone;
    }

    store.save();
    res.json({ user: sanitizeUser(storedUser) });
  });

  app.patch('/api/account/language', requireAuth, (req, res) => {
    const db = store.getRawState();
    const storedUser = db.users.find((u) => u.id === req.sessionCtx!.user.id);
    if (!storedUser) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }
    const nextLang = req.body?.preferredLanguage;
    if (nextLang !== 'en' && nextLang !== 'ta') {
      res.status(400).json({ error: 'preferredLanguage must be en or ta.' });
      return;
    }
    storedUser.preferredLanguage = nextLang;
    const tenant = db.tenants.find((t) => t.id === req.sessionCtx!.tenant.id);
    if (
      tenant &&
      (storedUser.role === 'owner' ||
        storedUser.role === 'warden' ||
        storedUser.role === 'overall_admin')
    ) {
      tenant.preferredLanguage = nextLang;
    }
    store.save();
    res.json({
      user: sanitizeUser(storedUser),
      tenant: tenant || req.sessionCtx!.tenant,
      preferredLanguage: nextLang,
    });
  });

  app.post('/api/profile/avatar', requireAuth, avatarUpload.single('avatar'), (req, res) => {
    const db = store.getRawState();
    const storedUser = db.users.find((u) => u.id === req.sessionCtx!.user.id);
    if (!storedUser) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Please select a JPEG, PNG, or WebP image file.' });
      return;
    }

    try {
      const nextKey = store.saveUserAvatarObject(req.file.buffer, req.file.mimetype);
      const prevKey = storedUser.avatarObjectKey;
      storedUser.avatarObjectKey = nextKey;
      storedUser.avatarMimeType = req.file.mimetype;
      storedUser.avatarUpdatedAt = new Date().toISOString();
      store.save();
      if (prevKey) {
        store.deleteUserAvatarObject(prevKey);
      }
      res.json({ user: sanitizeUser(storedUser) });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Could not save profile picture.',
      });
    }
  });

  app.delete('/api/profile/avatar', requireAuth, (req, res) => {
    const db = store.getRawState();
    const storedUser = db.users.find((u) => u.id === req.sessionCtx!.user.id);
    if (!storedUser) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }
    if (storedUser.avatarObjectKey) {
      store.deleteUserAvatarObject(storedUser.avatarObjectKey);
    }
    storedUser.avatarObjectKey = null;
    storedUser.avatarMimeType = null;
    storedUser.avatarUpdatedAt = null;
    store.save();
    res.json({ user: sanitizeUser(storedUser) });
  });

  app.get('/api/profile/avatar/:userId', requireAuth, (req, res) => {
    const db = store.getRawState();
    const targetUser = db.users.find((u) => u.id === req.params.userId);
    if (!targetUser || !targetUser.avatarObjectKey || !targetUser.avatarMimeType) {
      res.status(404).json({ error: 'Profile picture not found.' });
      return;
    }
    if (!ALLOWED_AVATAR_MIME_TYPES.has(targetUser.avatarMimeType)) {
      res.status(404).json({ error: 'Invalid profile picture format.' });
      return;
    }
    const buf = store.readUserAvatarObject(targetUser.avatarObjectKey);
    if (!buf) {
      res.status(404).json({ error: 'Profile picture file missing.' });
      return;
    }
    res.setHeader('Content-Type', targetUser.avatarMimeType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buf);
  });

  app.post('/api/profile/change-password', requireAuth, authLimiter, (req, res) => {
    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    const confirmPassword =
      req.body?.confirmPassword !== undefined ? String(req.body.confirmPassword) : newPassword;

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Current password and new password are required.' });
      return;
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
      res.status(400).json({ error: 'New password must be between 6 and 128 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      res.status(400).json({ error: 'New password and confirmation do not match.' });
      return;
    }
    if (newPassword === currentPassword) {
      res.status(400).json({ error: 'New password must be different from your current password.' });
      return;
    }

    const db = store.getRawState();
    const storedUser = db.users.find((u) => u.id === req.sessionCtx!.user.id);
    if (!storedUser) {
      res.status(404).json({ error: 'User account not found.' });
      return;
    }
    if (!verifyPassword(currentPassword, storedUser.passwordHash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    storedUser.passwordHash = hashPassword(newPassword);
    store.save();
    res.json({ ok: true, message: 'Password updated successfully.' });
  });

  // --- Helper builders for Overall Admin & Owner Portals ---
  const computeWorkspaceMetrics = (tenant: Tenant) => {
    const db = store.getRawState();
    const rooms = store.getRooms(tenant.id);
    const beds = enrichBeds(tenant.id);
    const stays = enrichStays(tenant.id);
    const payments = enrichPayments(tenant.id);
    const deposits = enrichDeposits(tenant.id);
    const expenses = store.getExpenses(tenant.id);
    const tenantUsers = store.getUsers(tenant.id);

    const occupiedBeds = beds.filter((b) => b.status === 'occupied').length;
    const vacantBeds = beds.filter((b) => b.status === 'vacant').length;
    const maintenanceBeds = beds.filter((b) => b.status === 'maintenance').length;
    const totalBeds = beds.length;
    const occupancyPercent = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;
    const activeGuestsCount = stays.filter(
      (s) => s.status === 'active' || s.status === 'overdue'
    ).length;

    const collectedTotal = payments
      .filter((p) => p.status !== 'refunded' && p.paidAmount > 0)
      .reduce((sum, p) => sum + p.paidAmount, 0);
    const expensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
    const outstandingDue = payments
      .filter((p) => p.status === 'unpaid' || p.status === 'partially_paid' || p.status === 'overdue')
      .reduce((sum, p) => sum + p.outstandingAmount, 0);
    const depositsHeld = deposits.reduce((sum, d) => sum + d.remainingHeld, 0);

    const ownerUser =
      (tenant.ownerId ? db.users.find((u) => u.id === tenant.ownerId) : undefined) ||
      tenantUsers.find((u) => u.role === 'owner');
    const wardens = tenantUsers.filter((u) => u.role === 'warden');
    const staffMembers = tenantUsers.filter((u) => u.role === 'staff');

    return {
      roomsCount: rooms.length,
      totalBeds,
      occupiedBeds,
      vacantBeds,
      maintenanceBeds,
      occupancyPercent,
      activeGuestsCount,
      collectedTotal,
      expensesTotal,
      outstandingDue,
      depositsHeld,
      ownerUser,
      wardens,
      staffMembers,
    };
  };

  const getOwnedTenantsForSession = (user: { id: string; tenantId: string; role: UserRole }) => {
    const db = store.getRawState();
    if (user.role === 'overall_admin') {
      return db.tenants;
    }
    return db.tenants.filter(
      (t) => (t.ownerId === user.id || t.id === user.tenantId) && t.status !== 'suspended'
    );
  };

  // --- Overall Admin Site Routes (overall_admin only) ---
  app.get('/api/admin/overview', requireAuth, requireRole('overall_admin'), (req, res) => {
    const db = store.getRawState();
    const period = String(req.query.period || 'all');
    let from = String(req.query.from || '').trim();
    const to = String(req.query.to || todayYmd()).trim();

    if (!from) {
      if (period === 'month') {
        from = monthStartYmd();
      } else if (period === '30d') {
        from = daysAgoYmd(30);
      } else {
        from = '2000-01-01';
      }
    }
    if (from > to) {
      res.status(400).json({ error: 'From date cannot be later than To date.' });
      return;
    }

    let collectedInPeriod = 0;
    let expensesInPeriod = 0;
    let overdueStaysCount = 0;
    let maintenanceBeds = 0;
    let activeGuestsCount = 0;

    const allRecentPayments: AdminRecentPaymentItem[] = [];
    const allPendingDues: AdminPendingDueItem[] = [];
    const allRecentCheckIns: AdminRecentCheckInItem[] = [];

    const workspaces: AdminWorkspaceSummary[] = db.tenants.map((t) => {
      const m = computeWorkspaceMetrics(t);
      const tPayments = enrichPayments(t.id);
      const tStays = enrichStays(t.id);
      const tExpenses = store.getExpenses(t.id);

      maintenanceBeds += m.maintenanceBeds;
      activeGuestsCount += m.activeGuestsCount;
      overdueStaysCount += tStays.filter((s) => s.status === 'overdue').length;

      const wsCollectedInPeriod = tPayments
        .filter(
          (p) =>
            p.status !== 'refunded' &&
            p.paidAmount > 0 &&
            p.paymentDate &&
            p.paymentDate >= from &&
            p.paymentDate <= to
        )
        .reduce((sum, p) => sum + p.paidAmount, 0);
      const wsExpensesInPeriod = tExpenses
        .filter((e) => e.expenseDate >= from && e.expenseDate <= to)
        .reduce((sum, e) => sum + e.amount, 0);

      collectedInPeriod += wsCollectedInPeriod;
      expensesInPeriod += wsExpensesInPeriod;

      for (const p of tPayments) {
        if (p.paidAmount > 0 && p.status !== 'refunded') {
          allRecentPayments.push({
            id: p.id,
            tenantId: t.id,
            tenantName: t.name,
            guestId: p.guestId,
            guestName: p.guestName,
            roomLabel: `Room ${p.roomNumber}-${p.bedLabel}`,
            amount: p.amount,
            paidAmount: p.paidAmount,
            status: p.status,
            paymentMode: p.paymentMode,
            paymentDate: p.paymentDate,
            dueDate: p.dueDate,
          });
        }
        if (
          (p.status === 'unpaid' || p.status === 'partially_paid' || p.status === 'overdue') &&
          p.outstandingAmount > 0
        ) {
          allPendingDues.push({
            id: p.id,
            tenantId: t.id,
            tenantName: t.name,
            ownerName: m.ownerUser?.name || 'Unassigned Owner',
            guestId: p.guestId,
            guestName: p.guestName,
            roomLabel: `Room ${p.roomNumber}-${p.bedLabel}`,
            outstandingAmount: p.outstandingAmount,
            dueDate: p.dueDate,
            isOverdue: p.isOverdue,
          });
        }
      }

      for (const s of tStays) {
        if (s.status !== 'cancelled') {
          allRecentCheckIns.push({
            id: s.id,
            tenantId: t.id,
            tenantName: t.name,
            guestId: s.guestId,
            guestName: s.guestName,
            roomLabel: `Room ${s.roomNumber}-${s.bedLabel}`,
            checkInAt: s.checkInAt,
            status: s.status,
            agreedAmount: s.agreedAmount,
          });
        }
      }

      return {
        id: t.id,
        name: t.name,
        city: t.city,
        district: t.district,
        locality: t.locality,
        wardenPhone: t.wardenPhone,
        status: t.status || 'active',
        planTier: t.planTier || 'lifetime',
        isSample: t.isSample,
        ownerId: m.ownerUser?.id || null,
        ownerName: m.ownerUser?.name || 'Unassigned Owner',
        ownerEmail: m.ownerUser?.email || '',
        roomsCount: m.roomsCount,
        totalBeds: m.totalBeds,
        occupiedBeds: m.occupiedBeds,
        vacantBeds: m.vacantBeds,
        occupancyPercent: m.occupancyPercent,
        activeGuestsCount: m.activeGuestsCount,
        wardenCount: m.wardens.length,
        staffCount: m.staffMembers.length,
        collectedTotal: period === 'all' ? m.collectedTotal : wsCollectedInPeriod,
        expensesTotal: period === 'all' ? m.expensesTotal : wsExpensesInPeriod,
        outstandingDue: m.outstandingDue,
        depositsHeld: m.depositsHeld,
        createdAt: t.createdAt,
      };
    });

    const ownerUsers = db.users.filter((u) => u.role === 'owner');
    const owners: AdminOwnerSummary[] = ownerUsers.map((owner) => {
      const ownedWorkspaces = workspaces.filter(
        (w) => w.ownerId === owner.id || (!w.ownerId && w.id === owner.tenantId)
      );
      const totalBeds = ownedWorkspaces.reduce((sum, w) => sum + w.totalBeds, 0);
      const occupiedBeds = ownedWorkspaces.reduce((sum, w) => sum + w.occupiedBeds, 0);
      return {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        isActive: owner.isActive !== false,
        primaryTenantId: owner.tenantId,
        propertyCount: ownedWorkspaces.length,
        propertyNames: ownedWorkspaces.map((w) => w.name),
        totalBeds,
        occupiedBeds,
        occupancyPercent: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
        wardenCount: ownedWorkspaces.reduce((sum, w) => sum + w.wardenCount, 0),
        staffCount: ownedWorkspaces.reduce((sum, w) => sum + w.staffCount, 0),
        collectedTotal: ownedWorkspaces.reduce((sum, w) => sum + w.collectedTotal, 0),
        outstandingDue: ownedWorkspaces.reduce((sum, w) => sum + w.outstandingDue, 0),
        createdAt: owner.createdAt,
      };
    });

    const wardensAndStaff: AdminWardenRecord[] = db.users
      .filter((u) => u.role === 'warden' || u.role === 'staff')
      .map((u) => {
        const ws = workspaces.find((w) => w.id === u.tenantId);
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          isActive: u.isActive !== false,
          tenantId: u.tenantId,
          tenantName: ws?.name || 'Unknown PG',
          ownerName: ws?.ownerName || '—',
          createdAt: u.createdAt,
        };
      });

    const totalBeds = workspaces.reduce((sum, w) => sum + w.totalBeds, 0);
    const occupiedBeds = workspaces.reduce((sum, w) => sum + w.occupiedBeds, 0);
    const totalCollected = workspaces.reduce((sum, w) => sum + w.collectedTotal, 0);
    const totalExpenses = workspaces.reduce((sum, w) => sum + w.expensesTotal, 0);

    const planTiers: TenantPlanTier[] = ['lifetime', 'standard', 'trial'];
    const planBreakdown: AdminPlanBreakdownItem[] = planTiers.map((tier) => {
      const matching = workspaces.filter((w) => w.planTier === tier);
      return {
        planTier: tier,
        workspacesCount: matching.length,
        activeCount: matching.filter((w) => w.status === 'active').length,
        totalBeds: matching.reduce((sum, w) => sum + w.totalBeds, 0),
        occupiedBeds: matching.reduce((sum, w) => sum + w.occupiedBeds, 0),
        collectedTotal: matching.reduce((sum, w) => sum + w.collectedTotal, 0),
      };
    });

    const recentPayments = allRecentPayments
      .filter((p) =>
        period === 'all' ? true : Boolean(p.paymentDate && p.paymentDate >= from && p.paymentDate <= to)
      )
      .sort((a, b) => (b.paymentDate || b.dueDate).localeCompare(a.paymentDate || a.dueDate))
      .slice(0, 20);

    const pendingDues = allPendingDues
      .sort((a, b) => {
        if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
        return a.dueDate.localeCompare(b.dueDate);
      })
      .slice(0, 25);

    const recentCheckIns = allRecentCheckIns
      .sort((a, b) => b.checkInAt.localeCompare(a.checkInAt))
      .slice(0, 20);

    const payload: AdminOverviewPayload = {
      period: { period, from, to },
      summary: {
        totalWorkspaces: workspaces.length,
        activeWorkspaces: workspaces.filter((w) => w.status === 'active').length,
        suspendedWorkspaces: workspaces.filter((w) => w.status === 'suspended').length,
        totalOwners: owners.length,
        activeOwners: owners.filter((o) => o.isActive).length,
        totalWardens: wardensAndStaff.filter((w) => w.role === 'warden').length,
        totalStaff: wardensAndStaff.filter((w) => w.role === 'staff').length,
        totalRooms: workspaces.reduce((sum, w) => sum + w.roomsCount, 0),
        totalBeds,
        occupiedBeds,
        vacantBeds: workspaces.reduce((sum, w) => sum + w.vacantBeds, 0),
        maintenanceBeds,
        occupancyPercent: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
        activeGuestsCount,
        overdueStaysCount,
        collectedInPeriod,
        expensesInPeriod,
        netSurplusInPeriod: collectedInPeriod - expensesInPeriod,
        totalCollected,
        totalExpenses,
        totalOutstandingDue: workspaces.reduce((sum, w) => sum + w.outstandingDue, 0),
        totalDepositsHeld: workspaces.reduce((sum, w) => sum + w.depositsHeld, 0),
      },
      planBreakdown,
      owners,
      workspaces,
      wardensAndStaff,
      recentPayments,
      pendingDues,
      recentCheckIns,
    };

    res.json(payload);
  });

  app.post('/api/admin/owners', requireAuth, requireRole('overall_admin'), (req, res) => {
    const ownerName = String(req.body?.ownerName || req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const hostelName = String(req.body?.hostelName || '').trim();
    const district = String(req.body?.district || req.body?.city || '').trim();
    const locality = String(req.body?.locality || '').trim();
    const pincode = String(req.body?.pincode || '').trim();
    const phone = String(req.body?.wardenPhone || req.body?.phone || '').trim();
    const planTierRaw = String(req.body?.planTier || '').trim();

    if (!ownerName) {
      res.status(400).json({ error: 'Owner full name is required.' });
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please enter a valid owner email address.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Initial password (min 6 characters) is required.' });
      return;
    }
    if (planTierRaw !== 'lifetime' && planTierRaw !== 'standard' && planTierRaw !== 'trial') {
      res.status(400).json({ error: 'Plan tier is required.' });
      return;
    }
    const planTier: TenantPlanTier = planTierRaw;
    if (!hostelName) {
      res.status(400).json({ error: 'Initial PG property name is required.' });
      return;
    }
    if (!district) {
      res.status(400).json({ error: 'City / District is required.' });
      return;
    }
    if (!locality) {
      res.status(400).json({ error: 'Locality / Area is required.' });
      return;
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (!phone || phone === '+91' || phoneDigits.length < 10) {
      res.status(400).json({ error: 'Valid contact phone (at least 10 digits) is required.' });
      return;
    }
    if (!/^\d{6}$/.test(pincode)) {
      res.status(400).json({ error: 'Pincode is required and must be a 6-digit number.' });
      return;
    }

    const db = store.getRawState();
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const tenantId = `ten_${crypto.randomUUID().slice(0, 8)}`;
    const ownerId = `usr_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const prefix =
      hostelName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 4)
        .map((w) => w[0]?.toUpperCase() || '')
        .join('') || 'PG';

    const newTenant: Tenant = {
      id: tenantId,
      name: hostelName,
      city: district,
      district,
      locality,
      pincode,
      landmark: '',
      address: [locality, district, 'Tamil Nadu', pincode].filter(Boolean).join(', '),
      wardenPhone: phone,
      gstinOrReg: '',
      timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
      preferredLanguage: 'en',
      houseRules:
        '1. Quiet hours after 10:30 PM.\n2. Inform warden in advance for late arrivals.',
      receiptPrefix: prefix,
      agreementNotes: 'Terms configurable by property owner.',
      isSample: false,
      ownerId,
      status: 'active',
      planTier,
      settings: {
        smsProvider: 'mock',
        whatsappProvider: 'mock',
        telephonyProvider: 'mock',
        smsCooldownHours: 24,
        reminderLeadDays: 3,
        smsTemplate:
          'Reminder from {{hostelName}}: Payment of ₹{{amount}} for Room {{room}} is due on {{dueDate}}.',
        checkoutReminderTemplate:
          'Hello {{guestName}}, your stay at {{hostelName}} (Room {{room}}) is scheduled for checkout on {{checkoutDate}}.',
        unpaidReminderEnabled: true,
        checkoutReminderEnabled: true,
        requireIdDocument: false,
      },
      createdAt: now,
    };

    const newOwner = {
      id: ownerId,
      tenantId,
      name: ownerName,
      email,
      role: 'owner' as UserRole,
      isActive: true,
      passwordHash: hashPassword(password),
      createdAt: now,
    };

    db.tenants.push(newTenant);
    db.users.push(newOwner);
    store.save();

    emitAppNotification({
      tenantId: newTenant.id,
      tenantName: newTenant.name,
      category: 'system_alerts',
      eventType: 'owner_registered',
      priority: 'normal',
      title: `New PG Owner Onboarded: ${ownerName}`,
      message: `${ownerName} (${email}) onboarded with PG "${newTenant.name}".`,
      targetRoles: ['overall_admin'],
      targetTab: 'admin-owners',
      targetId: ownerId,
    });

    res.status(201).json({ owner: sanitizeUser(newOwner), tenant: newTenant });
  });

  app.patch('/api/admin/owners/:userId', requireAuth, requireRole('overall_admin'), (req, res) => {
    const db = store.getRawState();
    const owner = db.users.find((u) => u.id === req.params.userId && u.role === 'owner');
    if (!owner) {
      res.status(404).json({ error: 'Owner account not found.' });
      return;
    }
    if (typeof req.body?.email === 'string') {
      const nextEmail = req.body.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }
      if (db.users.some((u) => u.id !== owner.id && u.email.toLowerCase() === nextEmail)) {
        res.status(409).json({ error: 'Another account already uses this email address.' });
        return;
      }
      owner.email = nextEmail;
    }
    if (typeof req.body?.password === 'string') {
      if (req.body.password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }
      owner.passwordHash = hashPassword(req.body.password);
    }
    if (typeof req.body?.isActive === 'boolean') {
      owner.isActive = req.body.isActive;
    }
    if (typeof req.body?.name === 'string') {
      const nextName = req.body.name.trim();
      if (!nextName) {
        res.status(400).json({ error: 'Owner name cannot be empty.' });
        return;
      }
      owner.name = nextName;
    }
    store.save();
    res.json({ owner: sanitizeUser(owner) });
  });

  app.post('/api/admin/workspaces', requireAuth, requireRole('overall_admin'), (req, res) => {
    const db = store.getRawState();
    const ownerId = String(req.body?.ownerId || '').trim();
    const name = String(req.body?.name || req.body?.hostelName || '').trim();
    const district = String(req.body?.district || req.body?.city || 'Chennai').trim() || 'Chennai';
    const locality = String(req.body?.locality || '').trim();
    const pincode = String(req.body?.pincode || '').trim();
    const rawPhone = String(req.body?.wardenPhone || req.body?.phone || '').trim();
    const phone = rawPhone && rawPhone !== '+91' ? rawPhone : '+91 90000 00000';
    const planTierRaw = String(req.body?.planTier || 'lifetime');
    const planTier: TenantPlanTier =
      planTierRaw === 'standard' || planTierRaw === 'trial' ? planTierRaw : 'lifetime';

    if (!ownerId || !name) {
      res.status(400).json({ error: 'PG owner and property name are required.' });
      return;
    }
    const owner = db.users.find((u) => u.id === ownerId && u.role === 'owner');
    if (!owner) {
      res.status(404).json({ error: 'Selected PG owner account was not found.' });
      return;
    }
    if (pincode && !/^\d{6}$/.test(pincode)) {
      res.status(400).json({ error: 'Pincode must be a 6-digit number.' });
      return;
    }

    const tenantId = `ten_${crypto.randomUUID().slice(0, 8)}`;
    const prefix =
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 4)
        .map((w) => w[0]?.toUpperCase() || '')
        .join('') || 'PG';

    const newTenant: Tenant = {
      id: tenantId,
      name,
      city: district,
      district,
      locality,
      pincode,
      landmark: '',
      address: [locality, district, 'Tamil Nadu', pincode].filter(Boolean).join(', '),
      wardenPhone: phone,
      gstinOrReg: '',
      timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
      preferredLanguage: 'en',
      houseRules:
        '1. Quiet hours after 10:30 PM.\n2. Inform warden in advance for late arrivals.',
      receiptPrefix: prefix,
      agreementNotes: 'Terms configurable by property owner.',
      isSample: false,
      ownerId: owner.id,
      status: 'active',
      planTier,
      settings: {
        smsProvider: 'mock',
        whatsappProvider: 'mock',
        telephonyProvider: 'mock',
        smsCooldownHours: 24,
        reminderLeadDays: 3,
        smsTemplate:
          'Reminder from {{hostelName}}: Payment of ₹{{amount}} for Room {{room}} is due on {{dueDate}}.',
        checkoutReminderTemplate:
          'Hello {{guestName}}, your stay at {{hostelName}} (Room {{room}}) is scheduled for checkout on {{checkoutDate}}.',
        unpaidReminderEnabled: true,
        checkoutReminderEnabled: true,
        requireIdDocument: false,
      },
      createdAt: new Date().toISOString(),
    };

    db.tenants.push(newTenant);
    store.save();
    res.status(201).json({ tenant: newTenant });
  });

  app.patch(
    '/api/admin/workspaces/:tenantId',
    requireAuth,
    requireRole('overall_admin'),
    (req, res) => {
      const db = store.getRawState();
      const tenant = db.tenants.find((t) => t.id === req.params.tenantId);
      if (!tenant) {
        res.status(404).json({ error: 'Workspace not found.' });
        return;
      }
      if (req.body?.status === 'active' || req.body?.status === 'suspended') {
        tenant.status = req.body.status as TenantStatus;
      }
      if (
        req.body?.planTier === 'standard' ||
        req.body?.planTier === 'lifetime' ||
        req.body?.planTier === 'trial'
      ) {
        tenant.planTier = req.body.planTier as TenantPlanTier;
      }
      if (typeof req.body?.name === 'string') {
        const nextName = req.body.name.trim();
        if (!nextName) {
          res.status(400).json({ error: 'PG property name cannot be empty.' });
          return;
        }
        tenant.name = nextName;
      }
      if (typeof req.body?.district === 'string' && req.body.district.trim()) {
        tenant.district = req.body.district.trim();
        tenant.city = tenant.district;
      }
      if (typeof req.body?.locality === 'string') {
        tenant.locality = req.body.locality.trim();
      }
      if (typeof req.body?.pincode === 'string') {
        const nextPin = req.body.pincode.trim();
        if (nextPin && !/^\d{6}$/.test(nextPin)) {
          res.status(400).json({ error: 'Pincode must be a 6-digit number.' });
          return;
        }
        tenant.pincode = nextPin;
      }
      if (typeof req.body?.wardenPhone === 'string' && req.body.wardenPhone.trim()) {
        tenant.wardenPhone = req.body.wardenPhone.trim();
      }
      if (typeof req.body?.ownerId === 'string' && req.body.ownerId.trim()) {
        const nextOwner = db.users.find(
          (u) => u.id === req.body.ownerId.trim() && u.role === 'owner'
        );
        if (!nextOwner) {
          res.status(404).json({ error: 'Selected PG owner was not found.' });
          return;
        }
        tenant.ownerId = nextOwner.id;
      }
      tenant.address = [tenant.locality, tenant.district, 'Tamil Nadu', tenant.pincode]
        .filter(Boolean)
        .join(', ');
      store.save();
      res.json({ tenant });
    }
  );

  app.post('/api/admin/wardens', requireAuth, requireRole('overall_admin'), (req, res) => {
    const db = store.getRawState();
    const tenantId = String(req.body?.tenantId || '').trim();
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const roleRaw = String(req.body?.role || 'warden').trim();
    const role: UserRole = roleRaw === 'staff' ? 'staff' : 'warden';
    const password = String(req.body?.password || '');

    const targetTenant = db.tenants.find((t) => t.id === tenantId);
    if (!targetTenant) {
      res.status(404).json({ error: 'Selected PG property was not found.' });
      return;
    }
    if (!name || !email || password.length < 6) {
      res.status(400).json({
        error: 'Name, email, PG property, and password (6+ chars) are required.',
      });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const newUser = {
      id: `usr_${crypto.randomUUID().slice(0, 8)}`,
      tenantId: targetTenant.id,
      name,
      email,
      role,
      isActive: true,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    db.users.push(newUser);
    store.save();

    res.status(201).json({ warden: sanitizeUser(newUser) });
  });

  app.patch(
    '/api/admin/wardens/:userId',
    requireAuth,
    requireRole('overall_admin'),
    (req, res) => {
      const db = store.getRawState();
      const target = db.users.find(
        (u) => u.id === req.params.userId && (u.role === 'warden' || u.role === 'staff')
      );
      if (!target) {
        res.status(404).json({ error: 'Warden or staff account not found.' });
        return;
      }
      if (typeof req.body?.tenantId === 'string' && req.body.tenantId.trim()) {
        const nextTid = req.body.tenantId.trim();
        if (!db.tenants.some((t) => t.id === nextTid)) {
          res.status(404).json({ error: 'Target PG property not found.' });
          return;
        }
        target.tenantId = nextTid;
      }
      if (req.body?.role === 'warden' || req.body?.role === 'staff') {
        target.role = req.body.role;
      }
      if (typeof req.body?.isActive === 'boolean') {
        target.isActive = req.body.isActive;
      }
      if (typeof req.body?.name === 'string') {
        const nextName = req.body.name.trim();
        if (!nextName) {
          res.status(400).json({ error: 'Name cannot be empty.' });
          return;
        }
        target.name = nextName;
      }
      if (typeof req.body?.password === 'string') {
        if (req.body.password.length < 6) {
          res.status(400).json({ error: 'Password must be at least 6 characters.' });
          return;
        }
        target.passwordHash = hashPassword(req.body.password);
      }

      store.save();
      res.json({ warden: sanitizeUser(target) });
    }
  );

  app.delete('/api/admin/owners/:userId', requireAuth, requireRole('overall_admin'), (req, res) => {
    const db = store.getRawState();
    const targetIdx = db.users.findIndex(
      (u) => u.id === req.params.userId && u.role === 'owner'
    );
    if (targetIdx === -1) {
      res.status(404).json({ error: 'Owner account not found.' });
      return;
    }
    const target = db.users[targetIdx];
    const ownedPgs = db.tenants.filter(
      (t) => t.ownerId === target.id || (!t.ownerId && t.id === target.tenantId)
    );
    if (ownedPgs.length > 0) {
      res.status(409).json({
        error: `Cannot delete owner while ${ownedPgs.length} PG ${ownedPgs.length === 1 ? 'property is' : 'properties are'} assigned. Reassign or remove their PG properties first.`,
      });
      return;
    }
    db.users.splice(targetIdx, 1);
    store.save();
    res.json({ ok: true });
  });

  app.delete('/api/admin/workspaces/:tenantId', requireAuth, requireRole('overall_admin'), (req, res) => {
    const db = store.getRawState();
    const tenantIdx = db.tenants.findIndex((t) => t.id === req.params.tenantId);
    if (tenantIdx === -1) {
      res.status(404).json({ error: 'PG property not found.' });
      return;
    }
    const target = db.tenants[tenantIdx];
    const hasOccupiedOrOpenStay =
      db.beds.some((b) => b.tenantId === target.id && b.status === 'occupied') ||
      db.stays.some(
        (s) =>
          s.tenantId === target.id &&
          (s.status === 'active' || s.status === 'overdue' || s.status === 'upcoming')
      );
    if (hasOccupiedOrOpenStay) {
      res.status(409).json({
        error: 'Cannot delete a PG property with active, overdue, or upcoming tenant stays. Check out or cancel stays first.',
      });
      return;
    }
    if (db.tenants.length <= 1) {
      res.status(409).json({ error: 'Cannot delete the last remaining PG property on the platform.' });
      return;
    }
    db.tenants.splice(tenantIdx, 1);
    db.rooms = db.rooms.filter((r) => r.tenantId !== target.id);
    db.beds = db.beds.filter((b) => b.tenantId !== target.id);
    db.users = db.users.filter((u) => !(u.tenantId === target.id && (u.role === 'warden' || u.role === 'staff')));
    store.save();
    res.json({ ok: true });
  });

  app.delete('/api/admin/wardens/:userId', requireAuth, requireRole('overall_admin'), (req, res) => {
    const db = store.getRawState();
    const idx = db.users.findIndex(
      (u) => u.id === req.params.userId && (u.role === 'warden' || u.role === 'staff')
    );
    if (idx === -1) {
      res.status(404).json({ error: 'Staff member not found.' });
      return;
    }
    db.users.splice(idx, 1);
    store.save();
    res.json({ ok: true });
  });

  app.get('/api/admin/reports', requireAuth, requireRole('overall_admin'), (_req, res) => {
    const db = store.getRawState();
    const complaints = store.getComplaints();
    const properties = db.tenants.map((t) => {
      const m = computeWorkspaceMetrics(t);
      const tGuests = store.getGuests(t.id);
      const openComplaints = complaints.filter(
        (c) => c.tenantId === t.id && c.status !== 'resolved'
      ).length;
      return {
        tenantId: t.id,
        tenantName: t.name,
        ownerName: m.ownerUser?.name || 'Unassigned Owner',
        city: t.district || t.city,
        status: t.status || 'active',
        roomsCount: m.roomsCount,
        totalBeds: m.totalBeds,
        occupiedBeds: m.occupiedBeds,
        vacantBeds: m.vacantBeds,
        occupancyPercent: m.occupancyPercent,
        tenantsCount: tGuests.length,
        collectedTotal: m.collectedTotal,
        pendingRent: m.outstandingDue,
        openComplaints,
      };
    });

    const totalBeds = properties.reduce((s, p) => s + p.totalBeds, 0);
    const occupiedBeds = properties.reduce((s, p) => s + p.occupiedBeds, 0);
    const totalOwners = db.users.filter((u) => u.role === 'owner').length;

    res.json({
      summary: {
        totalProperties: properties.length,
        totalOwners,
        totalRooms: properties.reduce((s, p) => s + p.roomsCount, 0),
        totalBeds,
        occupiedBeds,
        occupancyPercent: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
        totalTenants: properties.reduce((s, p) => s + p.tenantsCount, 0),
        collectedTotal: properties.reduce((s, p) => s + p.collectedTotal, 0),
        pendingRent: properties.reduce((s, p) => s + p.pendingRent, 0),
        openComplaints: properties.reduce((s, p) => s + p.openComplaints, 0),
      },
      properties,
    });
  });

  app.post(
    '/api/admin/switch-workspace',
    requireAuth,
    requireRole('overall_admin'),
    (req, res) => {
      const tenantId = String(req.body?.tenantId || '').trim();
      const db = store.getRawState();
      const tenant = db.tenants.find((t) => t.id === tenantId);
      if (!tenant) {
        res.status(404).json({ error: 'Workspace not found.' });
        return;
      }
      const sessionToken = setSessionCookie(req, res, req.sessionCtx!.user.id, tenant.id);
      res.json({ user: req.sessionCtx!.user, tenant, sessionToken });
    }
  );

  // --- Owner Site Routes (owner & overall_admin) ---
  app.get('/api/owner/overview', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const db = store.getRawState();
    const user = req.sessionCtx!.user;
    const requestedOwnerId = String(req.query.ownerId || '').trim();

    let ownedTenants = getOwnedTenantsForSession(user);
    if (user.role === 'overall_admin' && requestedOwnerId) {
      ownedTenants = ownedTenants.filter((t) => t.ownerId === requestedOwnerId);
    }

    const properties: OwnerPropertySummary[] = ownedTenants.map((t) => {
      const m = computeWorkspaceMetrics(t);
      return {
        id: t.id,
        name: t.name,
        city: t.city,
        district: t.district,
        locality: t.locality,
        pincode: t.pincode,
        wardenPhone: t.wardenPhone,
        receiptPrefix: t.receiptPrefix,
        status: t.status || 'active',
        planTier: t.planTier || 'lifetime',
        isSample: t.isSample,
        roomsCount: m.roomsCount,
        totalBeds: m.totalBeds,
        occupiedBeds: m.occupiedBeds,
        vacantBeds: m.vacantBeds,
        maintenanceBeds: m.maintenanceBeds,
        occupancyPercent: m.occupancyPercent,
        activeGuestsCount: m.activeGuestsCount,
        collectedTotal: m.collectedTotal,
        expensesTotal: m.expensesTotal,
        netSurplus: m.collectedTotal - m.expensesTotal,
        outstandingDue: m.outstandingDue,
        depositsHeld: m.depositsHeld,
        wardenCount: m.wardens.length,
        staffCount: m.staffMembers.length,
        wardenNames: m.wardens.map((w) => w.name),
        createdAt: t.createdAt,
      };
    });

    const ownedIds = new Set(ownedTenants.map((t) => t.id));
    const tenantNameMap = new Map(ownedTenants.map((t) => [t.id, t.name]));

    const wardens: OwnerWardenRecord[] = db.users
      .filter(
        (u) =>
          ownedIds.has(u.tenantId) &&
          (u.role === 'warden' || u.role === 'staff' || (u.role === 'owner' && u.id !== user.id))
      )
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive !== false,
        tenantId: u.tenantId,
        tenantName: tenantNameMap.get(u.tenantId) || 'Unknown PG',
        createdAt: u.createdAt,
      }));

    const totalBeds = properties.reduce((sum, p) => sum + p.totalBeds, 0);
    const occupiedBeds = properties.reduce((sum, p) => sum + p.occupiedBeds, 0);
    const totalCollected = properties.reduce((sum, p) => sum + p.collectedTotal, 0);
    const totalExpenses = properties.reduce((sum, p) => sum + p.expensesTotal, 0);

    const payload: OwnerOverviewPayload = {
      summary: {
        totalProperties: properties.length,
        activeProperties: properties.filter((p) => p.status === 'active').length,
        totalRooms: properties.reduce((sum, p) => sum + p.roomsCount, 0),
        totalBeds,
        occupiedBeds,
        vacantBeds: properties.reduce((sum, p) => sum + p.vacantBeds, 0),
        occupancyPercent: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
        totalCollected,
        totalExpenses,
        netSurplus: totalCollected - totalExpenses,
        totalOutstandingDue: properties.reduce((sum, p) => sum + p.outstandingDue, 0),
        totalDepositsHeld: properties.reduce((sum, p) => sum + p.depositsHeld, 0),
        totalWardens: wardens.filter((w) => w.role === 'warden').length,
        totalStaff: wardens.filter((w) => w.role === 'staff').length,
      },
      properties,
      wardens,
    };

    res.json(payload);
  });

  app.post('/api/owner/properties', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const user = req.sessionCtx!.user;
    const db = store.getRawState();

    const name = String(req.body?.name || '').trim();
    const district = String(req.body?.district || req.body?.city || '').trim();
    const locality = String(req.body?.locality || '').trim();
    const pincode = String(req.body?.pincode || '').trim();
    const wardenPhone = String(req.body?.wardenPhone || '').trim();
    const receiptPrefixRaw = String(req.body?.receiptPrefix || '').trim().toUpperCase();

    if (!name) {
      res.status(400).json({ error: 'PG property name is required.' });
      return;
    }
    if (!district) {
      res.status(400).json({ error: 'District / City is required.' });
      return;
    }
    if (!locality) {
      res.status(400).json({ error: 'Locality / Area is required.' });
      return;
    }
    const phoneDigits = wardenPhone.replace(/\D/g, '');
    if (!wardenPhone || wardenPhone === '+91' || phoneDigits.length < 10) {
      res.status(400).json({ error: 'Valid PG contact phone (at least 10 digits) is required.' });
      return;
    }
    if (!/^\d{6}$/.test(pincode)) {
      res.status(400).json({ error: 'Pincode is required and must be a 6-digit number.' });
      return;
    }

    const prefix =
      receiptPrefixRaw ||
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 4)
        .map((w) => w[0]?.toUpperCase() || '')
        .join('') ||
      'PG';

    const ownerId =
      user.role === 'owner'
        ? user.id
        : req.sessionCtx!.tenant.ownerId || user.id;

    const newTenant: Tenant = {
      id: `ten_${crypto.randomUUID().slice(0, 8)}`,
      name,
      city: district,
      district,
      locality,
      pincode,
      landmark: String(req.body?.landmark || '').trim(),
      address: [locality, district, 'Tamil Nadu', pincode].filter(Boolean).join(', '),
      wardenPhone,
      gstinOrReg: String(req.body?.gstinOrReg || '').trim(),
      timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
      preferredLanguage: req.body?.preferredLanguage === 'ta' ? 'ta' : 'en',
      houseRules:
        '1. Quiet hours after 10:30 PM.\n2. Inform warden in advance for late arrivals.',
      receiptPrefix: prefix,
      agreementNotes: 'Terms configurable by hostel owner.',
      isSample: false,
      ownerId,
      status: 'active',
      planTier: 'lifetime',
      settings: {
        smsProvider: 'mock',
        whatsappProvider: 'mock',
        telephonyProvider: 'mock',
        smsCooldownHours: 24,
        reminderLeadDays: 3,
        smsTemplate:
          'Reminder from {{hostelName}}: Payment of ₹{{amount}} for Room {{room}} is due on {{dueDate}}.',
        checkoutReminderTemplate:
          'Hello {{guestName}}, your stay at {{hostelName}} (Room {{room}}) is scheduled for checkout on {{checkoutDate}}.',
        unpaidReminderEnabled: true,
        checkoutReminderEnabled: true,
        requireIdDocument: false,
      },
      createdAt: new Date().toISOString(),
    };

    db.tenants.push(newTenant);
    store.save();
    res.status(201).json({ tenant: newTenant });
  });

  app.post('/api/owner/wardens', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const user = req.sessionCtx!.user;
    const db = store.getRawState();
    const ownedTenants = getOwnedTenantsForSession(user);

    const tenantId = String(req.body?.tenantId || '').trim();
    if (!tenantId) {
      res.status(400).json({ error: 'Assigned PG property is required.' });
      return;
    }
    const targetTenant = ownedTenants.find((t) => t.id === tenantId);
    if (!targetTenant) {
      res.status(403).json({ error: 'You do not have permission to assign wardens to this PG property.' });
      return;
    }

    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const roleRaw = String(req.body?.role || '').trim();
    const password = String(req.body?.password || '');

    if (!name) {
      res.status(400).json({ error: 'Full name is required.' });
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Valid email address is required.' });
      return;
    }
    if (roleRaw !== 'warden' && roleRaw !== 'staff') {
      res.status(400).json({ error: 'Role must be either warden or staff.' });
      return;
    }
    const role: UserRole = roleRaw;
    if (password.length < 6) {
      res.status(400).json({ error: 'Password (min 6 characters) is required.' });
      return;
    }
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const newUser = {
      id: `usr_${crypto.randomUUID().slice(0, 8)}`,
      tenantId: targetTenant.id,
      name,
      email,
      role,
      isActive: true,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    db.users.push(newUser);
    store.save();

    res.status(201).json({ warden: sanitizeUser(newUser) });
  });

  app.patch(
    '/api/owner/wardens/:userId',
    requireAuth,
    requireRole('owner', 'overall_admin'),
    (req, res) => {
      const user = req.sessionCtx!.user;
      const db = store.getRawState();
      const ownedTenants = getOwnedTenantsForSession(user);
      const ownedIds = new Set(ownedTenants.map((t) => t.id));

      const target = db.users.find(
        (u) => u.id === req.params.userId && ownedIds.has(u.tenantId)
      );
      if (!target || target.role === 'overall_admin') {
        res.status(404).json({ error: 'Warden or staff account not found in your properties.' });
        return;
      }
      if (target.id === user.id && req.body?.isActive === false) {
        res.status(400).json({ error: 'Cannot deactivate your own active account.' });
        return;
      }

      if (req.body?.tenantId) {
        const nextTid = String(req.body.tenantId).trim();
        if (!ownedIds.has(nextTid)) {
          res.status(403).json({ error: 'Target PG property is not owned by you.' });
          return;
        }
        target.tenantId = nextTid;
      }
      if (req.body?.role === 'warden' || req.body?.role === 'staff') {
        target.role = req.body.role;
      }
      if (typeof req.body?.isActive === 'boolean') {
        target.isActive = req.body.isActive;
      }
      if (typeof req.body?.name === 'string' && req.body.name.trim()) {
        target.name = req.body.name.trim();
      }
      if (typeof req.body?.password === 'string' && req.body.password.length >= 6) {
        target.passwordHash = hashPassword(req.body.password);
      }

      store.save();
      res.json({ warden: sanitizeUser(target) });
    }
  );

  app.post(
    '/api/owner/switch-property',
    requireAuth,
    requireRole('owner', 'overall_admin'),
    (req, res) => {
      const user = req.sessionCtx!.user;
      const tenantId = String(req.body?.tenantId || '').trim();
      const ownedTenants = getOwnedTenantsForSession(user);
      const tenant = ownedTenants.find((t) => t.id === tenantId);
      if (!tenant) {
        res.status(403).json({ error: 'Property not found or not authorized for this owner.' });
        return;
      }

      const sessionToken = setSessionCookie(req, res, user.id, tenant.id);
      res.json({ user, tenant, sessionToken });
    }
  );

  app.patch('/api/owner/properties/:tenantId', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const user = req.sessionCtx!.user;
    const ownedTenants = getOwnedTenantsForSession(user);
    const target = ownedTenants.find((t) => t.id === req.params.tenantId);
    if (!target) {
      res.status(403).json({ error: 'Property not found or not owned by you.' });
      return;
    }
    if (typeof req.body?.name === 'string') {
      const nextName = req.body.name.trim();
      if (!nextName) {
        res.status(400).json({ error: 'Property name cannot be empty.' });
        return;
      }
      target.name = nextName;
    }
    if (typeof req.body?.district === 'string') {
      const nextDistrict = req.body.district.trim();
      if (!nextDistrict) {
        res.status(400).json({ error: 'City / District cannot be empty.' });
        return;
      }
      target.district = nextDistrict;
      target.city = nextDistrict;
    }
    if (typeof req.body?.locality === 'string') {
      const nextLocality = req.body.locality.trim();
      if (!nextLocality) {
        res.status(400).json({ error: 'Locality / Area cannot be empty.' });
        return;
      }
      target.locality = nextLocality;
    }
    if (typeof req.body?.pincode === 'string') {
      const nextPin = req.body.pincode.trim();
      if (!/^\d{6}$/.test(nextPin)) {
        res.status(400).json({ error: 'Pincode must be a 6-digit number.' });
        return;
      }
      target.pincode = nextPin;
    }
    if (typeof req.body?.wardenPhone === 'string') {
      const nextPhone = req.body.wardenPhone.trim();
      if (nextPhone.replace(/\D/g, '').length < 10) {
        res.status(400).json({ error: 'Valid contact phone (at least 10 digits) is required.' });
        return;
      }
      target.wardenPhone = nextPhone;
    }
    target.address = [target.locality, target.district, 'Tamil Nadu', target.pincode]
      .filter(Boolean)
      .join(', ');
    store.save();
    res.json({ tenant: target });
  });

  app.delete('/api/owner/properties/:tenantId', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const user = req.sessionCtx!.user;
    const db = store.getRawState();
    const ownedTenants = getOwnedTenantsForSession(user);
    const target = ownedTenants.find((t) => t.id === req.params.tenantId);
    if (!target) {
      res.status(403).json({ error: 'Property not found or not owned by you.' });
      return;
    }
    if (ownedTenants.length <= 1) {
      res.status(409).json({ error: 'Cannot delete your only remaining PG property.' });
      return;
    }
    const hasOccupiedOrOpenStay =
      db.beds.some((b) => b.tenantId === target.id && b.status === 'occupied') ||
      db.stays.some(
        (s) =>
          s.tenantId === target.id &&
          (s.status === 'active' || s.status === 'overdue' || s.status === 'upcoming')
      );
    if (hasOccupiedOrOpenStay) {
      res.status(409).json({
        error: 'Cannot delete a property with active, overdue, or upcoming tenants.',
      });
      return;
    }
    db.tenants = db.tenants.filter((t) => t.id !== target.id);
    db.rooms = db.rooms.filter((r) => r.tenantId !== target.id);
    db.beds = db.beds.filter((b) => b.tenantId !== target.id);
    db.users = db.users.filter((u) => !(u.tenantId === target.id && (u.role === 'warden' || u.role === 'staff')));
    store.save();
    res.json({ ok: true });
  });

  app.delete('/api/owner/wardens/:userId', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const user = req.sessionCtx!.user;
    const db = store.getRawState();
    const ownedIds = new Set(getOwnedTenantsForSession(user).map((t) => t.id));
    const idx = db.users.findIndex(
      (u) =>
        u.id === req.params.userId &&
        ownedIds.has(u.tenantId) &&
        (u.role === 'warden' || u.role === 'staff')
    );
    if (idx === -1) {
      res.status(404).json({ error: 'Staff member not found in your properties.' });
      return;
    }
    if (db.users[idx].id === user.id) {
      res.status(400).json({ error: 'Cannot delete your own account.' });
      return;
    }
    db.users.splice(idx, 1);
    store.save();
    res.json({ ok: true });
  });

  // --- Multi-Property Portal Routes (Overall Admin & Owner Sites) ---
  app.get('/api/portal/rooms', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const user = req.sessionCtx!.user;
    const filterTenantId = String(req.query.tenantId || 'all').trim();
    const search = String(req.query.search || '').trim().toLowerCase();
    const ownedTenants = getOwnedTenantsForSession(user);
    const scopedTenants =
      filterTenantId !== 'all'
        ? ownedTenants.filter((t) => t.id === filterTenantId)
        : ownedTenants;

    const roomsList = scopedTenants.flatMap((t) => {
      const enrichedBeds = enrichBeds(t.id);
      return store.getRooms(t.id).map((room) => {
        const rBeds = enrichedBeds.filter((b) => b.roomId === room.id);
        return {
          id: room.id,
          tenantId: t.id,
          tenantName: t.name,
          roomNumber: room.roomNumber,
          floor: room.floor,
          roomType: room.roomType,
          capacity: room.capacity || rBeds.length,
          monthlyTariff: room.monthlyTariff,
          facilities: room.facilities || [],
          status: computeRoomStatus(room, rBeds),
          totalBeds: rBeds.length,
          occupiedBeds: rBeds.filter((b) => b.status === 'occupied').length,
          vacantBeds: rBeds.filter((b) => b.status === 'vacant').length,
          maintenanceBeds: rBeds.filter((b) => b.status === 'maintenance').length,
          beds: rBeds.map((b) => ({
            id: b.id,
            bedLabel: b.bedLabel,
            status: b.status,
            occupantGuestName: b.occupantGuestName || null,
          })),
          createdAt: room.createdAt,
        };
      });
    });

    const filtered = roomsList
      .filter((r) => {
        if (!search) return true;
        return (
          r.roomNumber.toLowerCase().includes(search) ||
          r.tenantName.toLowerCase().includes(search) ||
          r.floor.toLowerCase().includes(search) ||
          r.roomType.toLowerCase().includes(search)
        );
      })
      .sort((a, b) => a.tenantName.localeCompare(b.tenantName) || a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));

    res.json({
      rooms: filtered,
      properties: ownedTenants.map((t) => ({ id: t.id, name: t.name })),
    });
  });

  app.post('/api/portal/rooms', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const user = req.sessionCtx!.user;
    const db = store.getRawState();
    const ownedTenants = getOwnedTenantsForSession(user);
    const tenantId = String(req.body?.tenantId || '').trim();
    const targetTenant = ownedTenants.find((t) => t.id === tenantId);
    if (!targetTenant) {
      res.status(403).json({ error: 'Please select a valid PG property you manage.' });
      return;
    }

    const roomNumber = String(req.body?.roomNumber || '').trim();
    const floor = String(req.body?.floor || '1st Floor').trim();
    const rawRoomType = String(req.body?.roomType || '2-Sharing').trim();
    if (!ROOM_TYPES.includes(rawRoomType as RoomType)) {
      res.status(400).json({ error: `Invalid room type: ${rawRoomType}` });
      return;
    }
    const roomType = rawRoomType as RoomType;
    const defaultTariff = ROOM_TYPE_DEFAULT_TARIFF[roomType] ?? 8000;
    const rawTariff = Number(req.body?.monthlyTariff);
    const monthlyTariff = Number.isFinite(rawTariff) && rawTariff > 0 ? rawTariff : defaultTariff;
    const bedCount = Math.min(30, Math.max(1, Number(req.body?.bedCount || req.body?.capacity || 2)));
    const status: RoomStatus = req.body?.status === 'maintenance' ? 'maintenance' : 'available';

    if (!roomNumber) {
      res.status(400).json({ error: 'Room number is required.' });
      return;
    }
    if (
      db.rooms.some(
        (r) => r.tenantId === tenantId && r.roomNumber.toLowerCase() === roomNumber.toLowerCase()
      )
    ) {
      res.status(409).json({ error: `Room ${roomNumber} already exists in ${targetTenant.name}.` });
      return;
    }

    const roomId = `rm_${crypto.randomUUID().slice(0, 8)}`;
    const room: Room = {
      id: roomId,
      tenantId,
      roomNumber,
      floor,
      roomType,
      capacity: bedCount,
      monthlyTariff,
      facilities: Array.isArray(req.body?.facilities)
        ? req.body.facilities.map((f: unknown) => String(f).trim()).filter(Boolean)
        : ['Wi-Fi', 'RO Water'],
      status,
      createdAt: new Date().toISOString(),
    };
    db.rooms.push(room);

    const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    for (let i = 0; i < bedCount; i++) {
      db.beds.push({
        id: `bed_${crypto.randomUUID().slice(0, 8)}`,
        tenantId,
        roomId,
        bedLabel: labels[i] || `B${i + 1}`,
        status: status === 'maintenance' ? 'maintenance' : 'vacant',
        currentStayId: null,
      });
    }
    store.save();
    res.status(201).json({ room });
  });

  app.patch('/api/portal/rooms/:roomId', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const user = req.sessionCtx!.user;
    const db = store.getRawState();
    const ownedIds = new Set(getOwnedTenantsForSession(user).map((t) => t.id));
    const room = db.rooms.find((r) => r.id === req.params.roomId && ownedIds.has(r.tenantId));
    if (!room) {
      res.status(404).json({ error: 'Room not found in your properties.' });
      return;
    }

    const roomBeds = db.beds.filter((b) => b.roomId === room.id && b.tenantId === room.tenantId);
    if (typeof req.body?.roomNumber === 'string' && req.body.roomNumber.trim()) {
      const nextNum = req.body.roomNumber.trim();
      if (
        db.rooms.some(
          (r) =>
            r.tenantId === room.tenantId &&
            r.id !== room.id &&
            r.roomNumber.toLowerCase() === nextNum.toLowerCase()
        )
      ) {
        res.status(409).json({ error: `Room ${nextNum} already exists in this property.` });
        return;
      }
      room.roomNumber = nextNum;
    }
    if (typeof req.body?.floor === 'string' && req.body.floor.trim()) {
      room.floor = req.body.floor.trim();
    }
    if (req.body?.roomType && ROOM_TYPES.includes(String(req.body.roomType) as RoomType)) {
      room.roomType = String(req.body.roomType) as RoomType;
    }
    if (typeof req.body?.monthlyTariff === 'number' && req.body.monthlyTariff > 0) {
      room.monthlyTariff = req.body.monthlyTariff;
    }
    if (req.body?.status === 'maintenance' || req.body?.status === 'available') {
      if (req.body.status === 'maintenance' && roomBeds.some((b) => b.status === 'occupied')) {
        res.status(409).json({ error: 'Cannot mark room under maintenance while beds are occupied.' });
        return;
      }
      room.status = req.body.status;
      for (const b of roomBeds) {
        if (req.body.status === 'maintenance' && b.status === 'vacant') b.status = 'maintenance';
        if (req.body.status === 'available' && b.status === 'maintenance') b.status = 'vacant';
      }
    }
    store.save();
    res.json({ room });
  });

  app.delete('/api/portal/rooms/:roomId', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const user = req.sessionCtx!.user;
    const db = store.getRawState();
    const ownedIds = new Set(getOwnedTenantsForSession(user).map((t) => t.id));
    const roomIdx = db.rooms.findIndex((r) => r.id === req.params.roomId && ownedIds.has(r.tenantId));
    if (roomIdx === -1) {
      res.status(404).json({ error: 'Room not found in your properties.' });
      return;
    }
    const room = db.rooms[roomIdx];
    const roomBeds = db.beds.filter((b) => b.roomId === room.id && b.tenantId === room.tenantId);
    if (roomBeds.some((b) => b.status === 'occupied')) {
      res.status(409).json({ error: 'Cannot delete a room with occupied beds.' });
      return;
    }
    if (db.stays.some((s) => s.tenantId === room.tenantId && s.roomId === room.id && s.status === 'upcoming')) {
      res.status(409).json({ error: 'Cannot delete a room with upcoming bookings.' });
      return;
    }
    db.rooms.splice(roomIdx, 1);
    db.beds = db.beds.filter((b) => !(b.roomId === room.id && b.tenantId === room.tenantId));
    store.save();
    res.json({ ok: true });
  });

  app.get('/api/portal/tenants', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const user = req.sessionCtx!.user;
    const filterTenantId = String(req.query.tenantId || 'all').trim();
    const statusFilter = String(req.query.status || 'all').trim();
    const search = String(req.query.search || '').trim().toLowerCase();
    const ownedTenants = getOwnedTenantsForSession(user);
    const scopedTenants =
      filterTenantId !== 'all'
        ? ownedTenants.filter((t) => t.id === filterTenantId)
        : ownedTenants;

    const tenants = scopedTenants.flatMap((t) => {
      const tGuests = store.getGuests(t.id);
      const tStays = enrichStays(t.id);
      const tPayments = enrichPayments(t.id);

      return tGuests.map((g) => {
        const activeStay =
          tStays.find((s) => s.guestId === g.id && (s.status === 'active' || s.status === 'overdue')) ||
          tStays.find((s) => s.guestId === g.id && s.status === 'upcoming') ||
          null;
        const guestPayments = tPayments.filter((p) => p.guestId === g.id);
        const balanceDue = guestPayments
          .filter((p) => p.status === 'unpaid' || p.status === 'partially_paid' || p.status === 'overdue')
          .reduce((sum, p) => sum + p.outstandingAmount, 0);

        return {
          id: g.id,
          tenantId: t.id,
          tenantName: t.name,
          fullName: g.fullName,
          primaryPhone: g.primaryPhone,
          alternativePhone: g.alternativePhone,
          currentAddress: g.currentAddress,
          permanentAddress: g.permanentAddress,
          emergencyContactName: g.emergencyContactName,
          emergencyContactRelation: g.emergencyContactRelation,
          emergencyContactPhone: g.emergencyContactPhone,
          idType: g.idType,
          idMasked: g.idMasked,
          status: g.status,
          notes: g.notes,
          activeStayId: activeStay?.id || null,
          roomLabel: activeStay ? `Room ${activeStay.roomNumber}-${activeStay.bedLabel}` : 'Unassigned',
          checkInAt: activeStay?.checkInAt || null,
          monthlyRent: activeStay?.agreedAmount || 0,
          balanceDue,
          createdAt: g.createdAt,
        };
      });
    });

    const filtered = tenants
      .filter((item) => {
        if (statusFilter !== 'all' && item.status !== statusFilter) return false;
        if (!search) return true;
        return (
          item.fullName.toLowerCase().includes(search) ||
          item.primaryPhone.toLowerCase().includes(search) ||
          item.tenantName.toLowerCase().includes(search) ||
          item.roomLabel.toLowerCase().includes(search)
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const vacantBeds = scopedTenants.flatMap((t) =>
      enrichBeds(t.id)
        .filter((b) => b.status === 'vacant')
        .map((b) => ({
          id: b.id,
          tenantId: t.id,
          tenantName: t.name,
          roomNumber: b.roomNumber,
          bedLabel: b.bedLabel,
          monthlyTariff: b.monthlyTariff,
        }))
    );

    res.json({
      tenants: filtered,
      properties: ownedTenants.map((t) => ({ id: t.id, name: t.name })),
      vacantBeds,
    });
  });

  app.post('/api/portal/tenants', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const user = req.sessionCtx!.user;
    const db = store.getRawState();
    const ownedTenants = getOwnedTenantsForSession(user);
    const tenantId = String(req.body?.tenantId || '').trim();
    const targetTenant = ownedTenants.find((t) => t.id === tenantId);
    if (!targetTenant) {
      res.status(403).json({ error: 'Please select a valid PG property you manage.' });
      return;
    }

    const fullName = String(req.body?.fullName || '').trim();
    const primaryPhone = String(req.body?.primaryPhone || '').trim();
    const permanentAddress = String(req.body?.permanentAddress || '').trim();
    const emergencyContactName = String(req.body?.emergencyContactName || '').trim();
    const emergencyContactPhone = String(req.body?.emergencyContactPhone || '').trim();
    const idType = (req.body?.idType || 'aadhaar') as IdDocumentType;
    const rawIdNumber = String(req.body?.idNumber || '').trim();
    const bedId = String(req.body?.bedId || '').trim();

    if (!fullName || primaryPhone.replace(/\D/g, '').length < 10) {
      res.status(400).json({ error: 'Tenant full name and valid 10-digit phone are required.' });
      return;
    }
    if (!permanentAddress) {
      res.status(400).json({ error: 'Address is required.' });
      return;
    }
    if (!emergencyContactName || emergencyContactPhone.replace(/\D/g, '').length < 10) {
      res.status(400).json({ error: 'Emergency contact name and 10-digit phone are required.' });
      return;
    }
    if (!rawIdNumber || rawIdNumber.replace(/[\s-]/g, '').length < 4) {
      res.status(400).json({ error: 'Valid ID number (at least 4 characters) is required.' });
      return;
    }

    const { idLast4, idMasked } = maskIdNumber(idType, rawIdNumber);
    const guestId = `gst_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const guest: Guest = {
      id: guestId,
      tenantId,
      fullName,
      primaryPhone,
      alternativePhone: '',
      currentAddress: String(req.body?.currentAddress || permanentAddress).trim(),
      permanentAddress,
      emergencyContactName,
      emergencyContactRelation: String(req.body?.emergencyContactRelation || 'Family').trim(),
      emergencyContactPhone,
      idType,
      idLast4,
      idMasked,
      consentGiven: true,
      consentNotes: 'Recorded via portal',
      status: 'active',
      altPhoneVerified: 'pending',
      notes: String(req.body?.notes || '').trim(),
      createdAt: now,
    };
    db.guests.push(guest);

    if (bedId) {
      const bed = db.beds.find((b) => b.id === bedId && b.tenantId === tenantId);
      if (!bed || bed.status !== 'vacant') {
        db.guests.pop();
        res.status(409).json({ error: 'Selected bed is not vacant or not in the selected property.' });
        return;
      }
      const room = db.rooms.find((r) => r.id === bed.roomId);
      const rent = Number(req.body?.monthlyRent) > 0 ? Number(req.body.monthlyRent) : room?.monthlyTariff || 8000;
      const stayId = `sty_${crypto.randomUUID().slice(0, 8)}`;
      const checkIn = todayYmd();
      db.stays.push({
        id: stayId,
        tenantId,
        guestId,
        roomId: bed.roomId,
        bedId: bed.id,
        purposeOfStay: 'Work / Study',
        checkInAt: checkIn,
        expectedCheckoutDate: addOneMonthYmd(checkIn),
        actualCheckoutAt: null,
        status: 'active',
        agreedAmount: rent,
        createdAt: now,
      });
      bed.status = 'occupied';
      bed.currentStayId = stayId;

      db.payments.push({
        id: `pay_${crypto.randomUUID().slice(0, 8)}`,
        tenantId,
        stayId,
        guestId,
        amount: rent,
        paidAmount: 0,
        status: 'unpaid',
        paymentMode: null,
        paymentDate: null,
        dueDate: addOneMonthYmd(checkIn),
        referenceNote: 'Monthly rent due',
        receiptNumber: null,
        description: 'Monthly Rent',
        createdAt: now,
      });
    }

    store.save();
    res.status(201).json({ guest });
  });

  app.patch('/api/portal/tenants/:guestId', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const user = req.sessionCtx!.user;
    const db = store.getRawState();
    const ownedIds = new Set(getOwnedTenantsForSession(user).map((t) => t.id));
    const guest = db.guests.find((g) => g.id === req.params.guestId && ownedIds.has(g.tenantId));
    if (!guest) {
      res.status(404).json({ error: 'Tenant not found in your properties.' });
      return;
    }
    if (typeof req.body?.fullName === 'string' && req.body.fullName.trim()) {
      guest.fullName = req.body.fullName.trim();
    }
    if (typeof req.body?.primaryPhone === 'string') {
      if (req.body.primaryPhone.replace(/\D/g, '').length < 10) {
        res.status(400).json({ error: 'Primary phone must have at least 10 digits.' });
        return;
      }
      guest.primaryPhone = req.body.primaryPhone.trim();
    }
    if (typeof req.body?.permanentAddress === 'string' && req.body.permanentAddress.trim()) {
      guest.permanentAddress = req.body.permanentAddress.trim();
    }
    if (typeof req.body?.emergencyContactName === 'string' && req.body.emergencyContactName.trim()) {
      guest.emergencyContactName = req.body.emergencyContactName.trim();
    }
    if (typeof req.body?.emergencyContactPhone === 'string' && req.body.emergencyContactPhone.replace(/\D/g, '').length >= 10) {
      guest.emergencyContactPhone = req.body.emergencyContactPhone.trim();
    }
    if (req.body?.status === 'active' || req.body?.status === 'former' || req.body?.status === 'inactive') {
      guest.status = req.body.status;
    }
    if (typeof req.body?.notes === 'string') {
      guest.notes = req.body.notes.trim();
    }
    store.save();
    res.json({ guest });
  });

  app.delete('/api/portal/tenants/:guestId', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const user = req.sessionCtx!.user;
    const db = store.getRawState();
    const ownedIds = new Set(getOwnedTenantsForSession(user).map((t) => t.id));
    const guest = db.guests.find((g) => g.id === req.params.guestId && ownedIds.has(g.tenantId));
    if (!guest) {
      res.status(404).json({ error: 'Tenant not found in your properties.' });
      return;
    }
    const result = store.deleteGuestCascade(guest.tenantId, guest.id);
    if (!result.ok) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  });

  app.get('/api/portal/payments', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const user = req.sessionCtx!.user;
    const filterTenantId = String(req.query.tenantId || 'all').trim();
    const statusFilter = String(req.query.status || 'all').trim();
    const search = String(req.query.search || '').trim().toLowerCase();
    const ownedTenants = getOwnedTenantsForSession(user);
    const scopedTenants =
      filterTenantId !== 'all'
        ? ownedTenants.filter((t) => t.id === filterTenantId)
        : ownedTenants;

    const allRows = scopedTenants.flatMap((t) => {
      const enriched = enrichPayments(t.id);
      const guestMap = new Map(store.getGuests(t.id).map((g) => [g.id, g]));
      return enriched.map((p) => ({
        id: p.id,
        tenantId: t.id,
        tenantName: t.name,
        stayId: p.stayId,
        guestId: p.guestId,
        guestName: p.guestName,
        guestPhone: guestMap.get(p.guestId)?.primaryPhone || '',
        roomLabel: `Room ${p.roomNumber}-${p.bedLabel}`,
        amount: p.amount,
        paidAmount: p.paidAmount,
        outstandingAmount: p.outstandingAmount,
        status: p.status,
        paymentMode: p.paymentMode,
        paymentDate: p.paymentDate,
        dueDate: p.dueDate,
        isOverdue: p.isOverdue,
        receiptNumber: p.receiptNumber,
        description: p.description,
        referenceNote: p.referenceNote,
        createdAt: p.createdAt,
      }));
    });

    const filtered = allRows
      .filter((p) => {
        if (statusFilter === 'pending') {
          if (p.status !== 'unpaid' && p.status !== 'partially_paid' && p.status !== 'overdue') return false;
        } else if (statusFilter === 'paid') {
          if (p.status !== 'paid') return false;
        } else if (statusFilter === 'overdue') {
          if (p.status !== 'overdue' && !p.isOverdue) return false;
        } else if (statusFilter !== 'all') {
          if (p.status !== statusFilter) return false;
        }
        if (!search) return true;
        return (
          p.guestName.toLowerCase().includes(search) ||
          p.tenantName.toLowerCase().includes(search) ||
          p.roomLabel.toLowerCase().includes(search) ||
          (p.receiptNumber || '').toLowerCase().includes(search)
        );
      })
      .sort((a, b) => (b.paymentDate || b.dueDate).localeCompare(a.paymentDate || a.dueDate));

    const summary = {
      totalCollected: allRows
        .filter((p) => p.status !== 'refunded')
        .reduce((sum, p) => sum + (p.paidAmount || 0), 0),
      totalPending: allRows
        .filter((p) => p.status === 'unpaid' || p.status === 'partially_paid' || p.status === 'overdue')
        .reduce((sum, p) => sum + p.outstandingAmount, 0),
      overdueCount: allRows.filter((p) => p.status === 'overdue' || p.isOverdue).length,
      paidCount: allRows.filter((p) => p.status === 'paid').length,
      pendingCount: allRows.filter(
        (p) => p.status === 'unpaid' || p.status === 'partially_paid' || p.status === 'overdue'
      ).length,
    };

    const activeStays = scopedTenants.flatMap((t) =>
      enrichStays(t.id)
        .filter((s) => s.status === 'active' || s.status === 'overdue')
        .map((s) => ({
          id: s.id,
          tenantId: t.id,
          tenantName: t.name,
          guestId: s.guestId,
          guestName: s.guestName,
          roomLabel: `Room ${s.roomNumber}-${s.bedLabel}`,
          agreedAmount: s.agreedAmount,
        }))
    );

    res.json({
      payments: filtered,
      summary,
      properties: ownedTenants.map((t) => ({ id: t.id, name: t.name })),
      activeStays,
    });
  });

  app.post('/api/portal/payments', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const user = req.sessionCtx!.user;
    const db = store.getRawState();
    const ownedTenants = getOwnedTenantsForSession(user);
    const ownedMap = new Map(ownedTenants.map((t) => [t.id, t]));

    const paymentId = String(req.body?.paymentId || '').trim();
    const stayId = String(req.body?.stayId || '').trim();
    const amount = Number(req.body?.amount || 0);
    const paymentMode = (req.body?.paymentMode || 'upi') as PaymentMode;
    const paymentDate = String(req.body?.paymentDate || todayYmd());
    const dueDate = String(req.body?.dueDate || todayYmd());
    const description = String(req.body?.description || 'Monthly Rent').trim();
    const referenceNote = String(req.body?.referenceNote || '').trim();
    const markPaid = req.body?.status !== 'unpaid';

    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Valid positive amount is required.' });
      return;
    }

    if (paymentId) {
      const existing = db.payments.find((p) => p.id === paymentId && ownedMap.has(p.tenantId));
      if (!existing) {
        res.status(404).json({ error: 'Rent record not found in your properties.' });
        return;
      }
      const targetTenant = ownedMap.get(existing.tenantId)!;
      const prevPaid = existing.paidAmount ?? (existing.status === 'paid' ? existing.amount : 0);
      const nextPaid = Math.min(existing.amount, prevPaid + amount);
      existing.paidAmount = nextPaid;
      existing.paymentMode = paymentMode;
      existing.paymentDate = paymentDate;
      existing.status = nextPaid >= existing.amount ? 'paid' : 'partially_paid';
      existing.referenceNote = referenceNote || existing.referenceNote;
      if (!existing.receiptNumber) {
        existing.receiptNumber = generateReceiptNumber(targetTenant);
      }
      store.save();
      if (existing.status === 'paid') {
        resolvePaymentRentNotifications(existing.id);
      }
      const gPaid = db.guests.find((g) => g.id === existing.guestId);
      emitAppNotification({
        tenantId: targetTenant.id,
        tenantName: targetTenant.name,
        category: 'payment_alerts',
        eventType: 'payment_received',
        priority: 'normal',
        title: `Rent Payment Received: ₹${amount.toLocaleString('en-IN')}`,
        message: `${gPaid?.fullName || 'Tenant'} paid ₹${amount.toLocaleString('en-IN')} at ${targetTenant.name}.`,
        targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
        targetTab: 'payments',
        targetId: existing.id,
      });
      res.json({ payment: existing });
      return;
    }

    const stay = db.stays.find((s) => s.id === stayId && ownedMap.has(s.tenantId));
    if (!stay) {
      res.status(404).json({ error: 'Please select an active tenant stay in your properties.' });
      return;
    }
    const targetTenant = ownedMap.get(stay.tenantId)!;
    const paidAmount = markPaid ? amount : 0;
    const payment: Payment = {
      id: `pay_${crypto.randomUUID().slice(0, 8)}`,
      tenantId: stay.tenantId,
      stayId: stay.id,
      guestId: stay.guestId,
      amount,
      paidAmount,
      status: markPaid ? 'paid' : 'unpaid',
      paymentMode: markPaid ? paymentMode : null,
      paymentDate: markPaid ? paymentDate : null,
      dueDate,
      referenceNote,
      receiptNumber: markPaid ? generateReceiptNumber(targetTenant) : null,
      description,
      createdAt: new Date().toISOString(),
    };
    db.payments.push(payment);
    store.save();
    if (markPaid) {
      const gNew = db.guests.find((g) => g.id === stay.guestId);
      emitAppNotification({
        tenantId: targetTenant.id,
        tenantName: targetTenant.name,
        category: 'payment_alerts',
        eventType: 'payment_received',
        priority: 'normal',
        title: `Rent Payment Received: ₹${paidAmount.toLocaleString('en-IN')}`,
        message: `${gNew?.fullName || 'Tenant'} paid ₹${paidAmount.toLocaleString('en-IN')} (${description}).`,
        targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
        targetTab: 'payments',
        targetId: payment.id,
      });
    }
    res.status(201).json({ payment });
  });

  app.delete('/api/portal/payments/:paymentId', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const user = req.sessionCtx!.user;
    const db = store.getRawState();
    const ownedIds = new Set(getOwnedTenantsForSession(user).map((t) => t.id));
    const idx = db.payments.findIndex(
      (p) => p.id === req.params.paymentId && ownedIds.has(p.tenantId)
    );
    if (idx === -1) {
      res.status(404).json({ error: 'Payment record not found.' });
      return;
    }
    db.payments.splice(idx, 1);
    store.save();
    res.json({ ok: true });
  });

  // --- Protected Tenant-Scoped Routes ---

  // Dashboard with configurable date range & live metric aggregation
  app.get('/api/dashboard', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const period = String(req.query.period || 'month');
    let from = String(req.query.from || '').trim();
    let to = String(req.query.to || todayYmd()).trim();

    if (!from) {
      if (period === '30d') {
        from = daysAgoYmd(30);
      } else if (period === 'all') {
        from = '2000-01-01';
      } else {
        from = monthStartYmd();
      }
    }

    const stays = enrichStays(tenantId);
    const beds = enrichBeds(tenantId);
    const payments = enrichPayments(tenantId);
    const deposits = enrichDeposits(tenantId);
    const expenses = store
      .getExpenses(tenantId)
      .slice()
      .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
    const guests = store.getGuests(tenantId);
    const rooms = store.getRooms(tenantId).map((r) => ({
      ...r,
      status: computeRoomStatus(
        r,
        beds.filter((b) => b.roomId === r.id)
      ),
    }));

    const occupiedStays = stays.filter((s) => s.status === 'active' || s.status === 'overdue');
    const overdueStays = stays.filter((s) => s.status === 'overdue');
    const upcomingCheckouts = occupiedStays
      .filter((s) => isWithinNextDays(s.expectedCheckoutDate, 7))
      .sort((a, b) => a.expectedCheckoutDate.localeCompare(b.expectedCheckoutDate));

    const collectedInPeriod = payments
      .filter(
        (p) =>
          p.status !== 'refunded' &&
          p.paidAmount > 0 &&
          p.paymentDate &&
          p.paymentDate >= from &&
          p.paymentDate <= to
      )
      .reduce((sum, p) => sum + p.paidAmount, 0);

    const expensesInPeriod = expenses
      .filter((e) => e.expenseDate >= from && e.expenseDate <= to)
      .reduce((sum, e) => sum + e.amount, 0);

    const depositsHeldAmount = deposits.reduce((sum, d) => sum + d.remainingHeld, 0);

    const unpaidList = payments.filter(
      (p) => p.status === 'unpaid' || p.status === 'partially_paid' || p.status === 'overdue'
    );

    const occupiedBeds = beds.filter((b) => b.status === 'occupied').length;
    const vacantBeds = beds.filter((b) => b.status === 'vacant').length;
    const maintenanceBeds = beds.filter((b) => b.status === 'maintenance').length;
    const totalBeds = beds.length;
    const occupancyPercent = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    const summary: DashboardSummary = {
      totalGuestsStaying: occupiedStays.length,
      occupiedBeds,
      vacantBeds,
      maintenanceBeds,
      totalBeds,
      occupancyPercent,
      collectedInPeriod,
      depositsHeldAmount,
      expensesInPeriod,
      unpaidChargesCount: unpaidList.length,
      unpaidTotalAmount: unpaidList.reduce((sum, p) => sum + p.outstandingAmount, 0),
      upcomingCheckoutsCount: upcomingCheckouts.length,
      overdueStaysCount: overdueStays.length,
    };

    const notifications: DashboardNotification[] = [];
    for (const stay of overdueStays.slice(0, 3)) {
      notifications.push({
        id: `notif_od_${stay.id}`,
        type: 'stay_overdue',
        title: `Overdue stay: ${stay.guestName}`,
        detail: `Room ${stay.roomNumber}-${stay.bedLabel} · Expected ${stay.expectedCheckoutDate}`,
        targetTab: 'stays',
        targetId: stay.id,
      });
    }
    for (const stay of upcomingCheckouts.slice(0, 3)) {
      notifications.push({
        id: `notif_co_${stay.id}`,
        type: 'checkout_due',
        title: `Checkout due: ${stay.guestName}`,
        detail: `Room ${stay.roomNumber}-${stay.bedLabel} · Expected ${stay.expectedCheckoutDate}`,
        targetTab: 'stays',
        targetId: stay.id,
      });
    }
    for (const pay of unpaidList.filter((p) => p.isOverdue).slice(0, 3)) {
      notifications.push({
        id: `notif_pay_${pay.id}`,
        type: 'payment_overdue',
        title: `Overdue due: ${pay.guestName}`,
        detail: `₹${pay.outstandingAmount.toLocaleString('en-IN')} · Due ${pay.dueDate}`,
        targetTab: 'payments',
        targetId: pay.id,
      });
    }
    for (const g of guests.filter((g) => g.altPhoneVerified !== 'verified').slice(0, 2)) {
      notifications.push({
        id: `notif_ver_${g.id}`,
        type: 'verification_pending',
        title: `Contact follow-up: ${g.fullName}`,
        detail: `Alt phone status: ${g.altPhoneVerified}`,
        targetTab: 'guests',
        targetId: g.id,
      });
    }

    const recentCheckIns = occupiedStays.slice(0, 10);
    const recentCheckouts = stays
      .filter((s) => s.status === 'checked_out')
      .sort((a, b) => (b.actualCheckoutAt || '').localeCompare(a.actualCheckoutAt || ''))
      .slice(0, 8);
    const recentPayments = payments
      .filter((p) => p.paidAmount > 0)
      .sort((a, b) => (b.paymentDate || b.createdAt).localeCompare(a.paymentDate || a.createdAt))
      .slice(0, 8);
    const recentExpenses = expenses.slice(0, 8);

    res.json({
      period: { period, from, to },
      summary,
      recentRegistrations: occupiedStays,
      recentCheckIns,
      recentCheckouts,
      recentPayments,
      recentExpenses,
      upcomingCheckouts,
      overdueStays,
      unpaidList,
      rooms,
      beds,
      notifications,
    });
  });

  app.get('/api/workspace-options', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const guests = store
      .getGuests(tenantId)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const stays = enrichStays(tenantId).filter(
      (s) => s.status === 'active' || s.status === 'overdue' || s.status === 'upcoming'
    );
    const unpaidPayments = enrichPayments(tenantId).filter(
      (p) => p.status === 'unpaid' || p.status === 'partially_paid' || p.status === 'overdue'
    );
    const beds = enrichBeds(tenantId);
    const vacantBeds = beds.filter((b) => b.status === 'vacant');

    res.json({
      guests,
      activeStays: stays,
      unpaidPayments,
      vacantBeds,
      allBeds: beds,
    });
  });

  app.get('/api/search', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) {
      res.json({ results: [] });
      return;
    }

    const guests = store.getGuests(tenantId);
    const stays = enrichStays(tenantId);

    const results = guests
      .filter((g) => {
        const activeStay = stays.find(
          (s) => s.guestId === g.id && (s.status === 'active' || s.status === 'overdue')
        );
        return (
          g.fullName.toLowerCase().includes(q) ||
          g.primaryPhone.toLowerCase().includes(q) ||
          (g.idLast4 && g.idLast4.includes(q)) ||
          (activeStay && activeStay.roomNumber.toLowerCase().includes(q))
        );
      })
      .slice(0, 8)
      .map((g) => {
        const activeStay = stays.find(
          (s) => s.guestId === g.id && (s.status === 'active' || s.status === 'overdue')
        );
        return {
          guestId: g.id,
          fullName: g.fullName,
          primaryPhone: g.primaryPhone,
          idMasked: g.idMasked,
          roomLabel: activeStay
            ? `Room ${activeStay.roomNumber}-${activeStay.bedLabel}`
            : 'No active stay',
        };
      });

    res.json({ results });
  });

  // --- Staff Management (RBAC) ---
  app.get('/api/staff', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const staff = store.getUsers(tenantId).map((u) => sanitizeUser(u));
    res.json({ staff });
  });

  app.post('/api/staff', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = (req.body?.role || 'staff') as UserRole;
    const password = String(req.body?.password || 'warden123');

    if (!name || !email || password.length < 6) {
      res.status(400).json({ error: 'Staff name, email, and 6+ char password are required.' });
      return;
    }
    if (role !== 'owner' && role !== 'warden' && role !== 'staff') {
      res.status(400).json({ error: 'Invalid staff role.' });
      return;
    }
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const newUser = {
      id: `usr_${crypto.randomUUID().slice(0, 8)}`,
      tenantId,
      name,
      email,
      role,
      isActive: true,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    db.users.push(newUser);
    store.save();
    res.status(201).json({ staffMember: sanitizeUser(newUser) });
  });

  app.patch('/api/staff/:userId', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const target = db.users.find(
      (u) => u.id === req.params.userId && u.tenantId === tenantId
    );
    if (!target) {
      res.status(404).json({ error: 'Staff account not found.' });
      return;
    }
    if (target.id === req.sessionCtx!.user.id && req.body?.isActive === false) {
      res.status(400).json({ error: 'You cannot deactivate your own active owner account.' });
      return;
    }
    if (req.body?.role === 'owner' || req.body?.role === 'warden' || req.body?.role === 'staff') {
      target.role = req.body.role;
    }
    if (typeof req.body?.isActive === 'boolean') {
      target.isActive = req.body.isActive;
    }
    if (typeof req.body?.name === 'string' && req.body.name.trim()) {
      target.name = req.body.name.trim();
    }
    store.save();
    res.json({ staffMember: sanitizeUser(target) });
  });

  // --- Guests CRUD & Optional Documents ---
  app.get('/api/guests', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const guests = store.getGuests(tenantId);
    const stays = enrichStays(tenantId);
    const deposits = enrichDeposits(tenantId);
    const documents = store.getDocuments(tenantId);
    const calls = store.getCallAttempts(tenantId);

    const search = String(req.query.search || '').trim().toLowerCase();
    const guestStatusFilter = String(req.query.guestStatus || 'all').trim();
    const verifyStatusFilter = String(req.query.status || 'all').trim();
    const duesFilter = String(req.query.dues || 'all').trim();
    const sortBy = String(req.query.sortBy || 'newest').trim();

    const enrichedAll = guests.map((g) => {
      const guestStays = stays.filter((s) => s.guestId === g.id);
      const activeStay =
        guestStays.find((s) => s.status === 'active' || s.status === 'overdue') || null;
      const upcomingStay = guestStays.find((s) => s.status === 'upcoming') || null;
      const balanceDue = guestStays.reduce((sum, s) => sum + (s.balanceDue || 0), 0);
      const depositsHeld = deposits
        .filter((d) => d.guestId === g.id)
        .reduce((sum, d) => sum + (d.remainingHeld || 0), 0);
      const docCount = documents.filter((d) => d.guestId === g.id).length;
      const guestCalls = calls.filter((c) => c.guestId === g.id);
      return {
        ...g,
        activeStay,
        upcomingStay,
        balanceDue,
        depositsHeld,
        totalStaysCount: guestStays.length,
        docCount,
        lastCallAttempt: guestCalls[0] || null,
      };
    });

    const summary = {
      totalGuests: enrichedAll.length,
      activeResidents: enrichedAll.filter((g) => g.status === 'active').length,
      formerOrInactive: enrichedAll.filter((g) => g.status !== 'active').length,
      pendingContactCalls: enrichedAll.filter((g) => g.altPhoneVerified === 'pending').length,
      guestsWithBalanceDue: enrichedAll.filter((g) => g.balanceDue > 0).length,
      totalOutstandingDue: enrichedAll.reduce((sum, g) => sum + g.balanceDue, 0),
      totalDocumentsCount: documents.length,
    };

    const filtered = enrichedAll
      .filter((g) => {
        if (guestStatusFilter !== 'all' && g.status !== guestStatusFilter) {
          return false;
        }
        if (verifyStatusFilter !== 'all' && g.altPhoneVerified !== verifyStatusFilter) {
          return false;
        }
        if (duesFilter === 'due' && g.balanceDue <= 0) {
          return false;
        }
        if (duesFilter === 'consent_pending' && g.consentGiven) {
          return false;
        }
        if (!search) return true;
        return (
          g.fullName.toLowerCase().includes(search) ||
          g.primaryPhone.toLowerCase().includes(search) ||
          g.alternativePhone.toLowerCase().includes(search) ||
          g.emergencyContactName.toLowerCase().includes(search) ||
          (g.idMasked && g.idMasked.toLowerCase().includes(search)) ||
          (g.activeStay && g.activeStay.roomNumber.toLowerCase().includes(search)) ||
          (g.upcomingStay && g.upcomingStay.roomNumber.toLowerCase().includes(search))
        );
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          return a.fullName.localeCompare(b.fullName);
        }
        if (sortBy === 'balance_desc') {
          if (b.balanceDue !== a.balanceDue) return b.balanceDue - a.balanceDue;
          return a.fullName.localeCompare(b.fullName);
        }
        return b.createdAt.localeCompare(a.createdAt);
      });

    const defaultSize = req.query.page || req.query.pageSize ? 8 : 100;
    const paged = paginateItems(
      filtered,
      req.query.page,
      req.query.pageSize,
      defaultSize
    );

    res.json({ guests: paged.items, summary, pagination: paged.pagination });
  });

  app.get('/api/guests/:guestId', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const guest = store.getGuests(tenantId).find((g) => g.id === req.params.guestId);
    if (!guest) {
      res.status(404).json({ error: 'Guest not found.' });
      return;
    }

    const stays = enrichStays(tenantId).filter((s) => s.guestId === guest.id);
    const payments = enrichPayments(tenantId).filter((p) => p.guestId === guest.id);
    const deposits = enrichDeposits(tenantId).filter((d) => d.guestId === guest.id);
    const documents = store
      .getDocuments(tenantId)
      .filter((d) => d.guestId === guest.id);
    const callAttempts = store.getCallAttempts(tenantId, guest.id);
    const reminderLogs = store
      .getReminderLogs(tenantId)
      .filter((r) => r.guestId === guest.id);

    res.json({
      guest,
      stays,
      payments,
      deposits,
      documents,
      callAttempts,
      reminderLogs,
    });
  });

  app.post('/api/guests', requireAuth, (req, res) => {
    const tenant = req.sessionCtx!.tenant;
    const db = store.getRawState();

    const fullName = String(req.body?.fullName || '').trim();
    const primaryPhone = String(req.body?.primaryPhone || '').trim();
    const alternativePhone = String(req.body?.alternativePhone || '').trim();
    const currentAddress = String(req.body?.currentAddress || '').trim();
    const permanentAddress = String(req.body?.permanentAddress || '').trim();
    const emergencyContactName = String(req.body?.emergencyContactName || '').trim();
    const emergencyContactRelation = String(req.body?.emergencyContactRelation || '').trim();
    const emergencyContactPhone = String(req.body?.emergencyContactPhone || '').trim();
    const idType = (req.body?.idType || 'none') as IdDocumentType;
    const rawIdNumber = String(req.body?.idNumber || '').trim();

    if (!fullName || primaryPhone.replace(/\D/g, '').length < 10) {
      res.status(400).json({ error: 'Guest full name and a valid 10-digit primary phone are required.' });
      return;
    }
    if (!currentAddress) {
      res.status(400).json({ error: 'Local workplace / college address is required.' });
      return;
    }
    if (!permanentAddress) {
      res.status(400).json({ error: 'Permanent / native address is required.' });
      return;
    }
    if (
      !emergencyContactName ||
      !emergencyContactRelation ||
      emergencyContactPhone.replace(/\D/g, '').length < 10
    ) {
      res.status(400).json({
        error: 'Emergency contact name, relation, and a valid 10-digit emergency phone are required.',
      });
      return;
    }
    if (idType === 'none' || !rawIdNumber) {
      res.status(400).json({
        error: 'Guest government ID type and ID number are required.',
      });
      return;
    }
    if (idType === 'aadhaar' && !/^\d{12}$/.test(rawIdNumber.replace(/[\s-]/g, ''))) {
      res.status(400).json({
        error: 'Aadhaar number must be 12 digits (only last 4 digits are stored).',
      });
      return;
    }
    if (idType !== 'aadhaar' && rawIdNumber.replace(/[\s-]/g, '').length < 4) {
      res.status(400).json({
        error: 'Guest ID number must be at least 4 characters.',
      });
      return;
    }

    const { idLast4, idMasked } = maskIdNumber(idType, rawIdNumber);
    const guest: Guest = {
      id: `gst_${crypto.randomUUID().slice(0, 8)}`,
      tenantId: tenant.id,
      fullName,
      primaryPhone,
      alternativePhone,
      currentAddress,
      permanentAddress,
      emergencyContactName,
      emergencyContactRelation,
      emergencyContactPhone,
      idType,
      idLast4,
      idMasked,
      consentGiven: Boolean(req.body?.consentGiven),
      consentNotes: String(req.body?.consentNotes || '').trim(),
      status: (req.body?.status as Guest['status']) || 'active',
      altPhoneVerified: 'pending',
      notes: String(req.body?.notes || '').trim(),
      createdAt: new Date().toISOString(),
    };
    db.guests.push(guest);
    store.save();

    emitAppNotification({
      tenantId: tenant.id,
      tenantName: tenant.name,
      category: 'resident_updates',
      eventType: 'resident_registered',
      priority: 'normal',
      title: `New Resident Registered: ${guest.fullName}`,
      message: `${guest.fullName} added to ${tenant.name}.`,
      targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
      targetTab: 'guests',
      targetId: guest.id,
    });

    res.status(201).json({ guest });
  });

  app.patch('/api/guests/:guestId', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const guest = db.guests.find(
      (g) => g.id === req.params.guestId && g.tenantId === tenantId
    );
    if (!guest) {
      res.status(404).json({ error: 'Guest not found.' });
      return;
    }

    if (typeof req.body?.fullName === 'string') {
      if (!req.body.fullName.trim()) {
        res.status(400).json({ error: 'Full name cannot be empty.' });
        return;
      }
      guest.fullName = req.body.fullName.trim();
    }
    if (typeof req.body?.primaryPhone === 'string') {
      if (req.body.primaryPhone.replace(/\D/g, '').length < 10) {
        res.status(400).json({ error: 'Primary phone must contain at least 10 digits.' });
        return;
      }
      guest.primaryPhone = req.body.primaryPhone.trim();
    }
    if (typeof req.body?.alternativePhone === 'string') {
      guest.alternativePhone = req.body.alternativePhone.trim();
    }
    if (typeof req.body?.currentAddress === 'string') {
      if (!req.body.currentAddress.trim()) {
        res.status(400).json({ error: 'Local workplace / college address cannot be empty.' });
        return;
      }
      guest.currentAddress = req.body.currentAddress.trim();
    }
    if (typeof req.body?.permanentAddress === 'string') {
      if (!req.body.permanentAddress.trim()) {
        res.status(400).json({ error: 'Permanent address cannot be empty.' });
        return;
      }
      guest.permanentAddress = req.body.permanentAddress.trim();
    }
    if (typeof req.body?.emergencyContactName === 'string') {
      if (!req.body.emergencyContactName.trim()) {
        res.status(400).json({ error: 'Emergency contact name cannot be empty.' });
        return;
      }
      guest.emergencyContactName = req.body.emergencyContactName.trim();
    }
    if (typeof req.body?.emergencyContactRelation === 'string') {
      if (!req.body.emergencyContactRelation.trim()) {
        res.status(400).json({ error: 'Emergency contact relation cannot be empty.' });
        return;
      }
      guest.emergencyContactRelation = req.body.emergencyContactRelation.trim();
    }
    if (typeof req.body?.emergencyContactPhone === 'string') {
      if (req.body.emergencyContactPhone.replace(/\D/g, '').length < 10) {
        res.status(400).json({ error: 'Emergency contact phone must contain at least 10 digits.' });
        return;
      }
      guest.emergencyContactPhone = req.body.emergencyContactPhone.trim();
    }
    if (typeof req.body?.notes === 'string') {
      guest.notes = req.body.notes.trim();
    }
    if (typeof req.body?.consentGiven === 'boolean') {
      guest.consentGiven = req.body.consentGiven;
    }
    if (typeof req.body?.consentNotes === 'string') {
      guest.consentNotes = req.body.consentNotes.trim();
    }
    if (
      req.body?.status === 'active' ||
      req.body?.status === 'former' ||
      req.body?.status === 'inactive'
    ) {
      guest.status = req.body.status;
    }
    if (req.body?.idType) {
      if (req.body.idType === 'none') {
        res.status(400).json({ error: 'A valid government ID document type is required.' });
        return;
      }
      guest.idType = req.body.idType as IdDocumentType;
    }
    if (typeof req.body?.idNumber === 'string' && req.body.idNumber.trim()) {
      const rawId = req.body.idNumber.trim();
      if (guest.idType === 'aadhaar' && !/^\d{12}$/.test(rawId.replace(/[\s-]/g, ''))) {
        res.status(400).json({
          error: 'Aadhaar number must be 12 digits (only last 4 digits are stored).',
        });
        return;
      }
      if (guest.idType !== 'aadhaar' && rawId.replace(/[\s-]/g, '').length < 4) {
        res.status(400).json({ error: 'ID number must be at least 4 characters.' });
        return;
      }
      const masked = maskIdNumber(guest.idType, rawId);
      guest.idLast4 = masked.idLast4;
      guest.idMasked = masked.idMasked;
    } else if (guest.idType === 'none' || !guest.idMasked) {
      res.status(400).json({ error: 'Guest government ID type and ID number are required.' });
      return;
    }

    store.save();
    res.json({ guest });
  });

  app.delete('/api/guests/:guestId', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const result = store.deleteGuestCascade(tenantId, req.params.guestId);
    if (!result.ok) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.json({ ok: true, deletedDocs: result.deletedDocs });
  });

  // Register Guest + Assign Bed (Active or Upcoming) + Optional ID Uploads + Optional Deposit
  app.post(
    '/api/registrations',
    requireAuth,
    upload.fields([
      { name: 'idFront', maxCount: 1 },
      { name: 'idBack', maxCount: 1 },
      { name: 'additionalId', maxCount: 1 },
    ]),
    (req, res) => {
      const tenant = req.sessionCtx!.tenant;
      const tenantId = tenant.id;
      const db = store.getRawState();

      const existingGuestId = String(req.body?.existingGuestId || '').trim();
      const bedId = String(req.body?.bedId || '').trim();
      const purposeOfStay = String(req.body?.purposeOfStay || '').trim();
      const checkInAt = String(req.body?.checkInAt || '').trim();
      const expectedCheckoutDate = String(req.body?.expectedCheckoutDate || '').trim();
      const stayType = req.body?.stayStatus === 'upcoming' ? 'upcoming' : 'active';
      const agreedAmount = Number(req.body?.agreedAmount || 0);
      const initialPaymentStatus = String(req.body?.initialPaymentStatus || 'unpaid');
      const initialPaidAmount = Number(req.body?.initialPaidAmount || 0);
      const initialPaymentMode = (req.body?.initialPaymentMode || 'upi') as PaymentMode;
      const rawInitialDueDate = String(req.body?.initialDueDate || '').trim();
      const initialDueDate =
        rawInitialDueDate || (checkInAt ? addOneMonthYmd(checkInAt) : '');
      const initialReferenceNote = String(req.body?.initialReferenceNote || '').trim();
      const depositAmount = Number(req.body?.depositAmount || 0);
      const depositMode = (req.body?.depositMode || 'upi') as PaymentMode;
      const stayNotes = String(req.body?.stayNotes || '').trim();

      if (!bedId || !purposeOfStay || !checkInAt) {
        res.status(400).json({
          error: 'Bed selection, purpose of stay, and check-in date are required.',
        });
        return;
      }
      if (!Number.isFinite(agreedAmount) || agreedAmount <= 0) {
        res.status(400).json({ error: 'Stay rent / fee greater than ₹0 is required.' });
        return;
      }
      if (
        initialPaymentStatus === 'partially_paid' &&
        (!Number.isFinite(initialPaidAmount) ||
          initialPaidAmount <= 0 ||
          initialPaidAmount >= agreedAmount)
      ) {
        res.status(400).json({
          error: 'Advance collected must be greater than ₹0 and less than total stay rent.',
        });
        return;
      }
      if (initialPaymentStatus === 'unpaid' && !initialDueDate) {
        res.status(400).json({ error: 'Rent due date is required when rent status is unpaid.' });
        return;
      }

      const checkInYmd = checkInAt.slice(0, 10);
      if (Number.isNaN(Date.parse(checkInAt))) {
        res.status(400).json({ error: 'Check-in date must be a valid date.' });
        return;
      }
      if (expectedCheckoutDate && expectedCheckoutDate < checkInYmd) {
        res.status(400).json({
          error: 'Expected checkout date must be a valid date on or after check-in date.',
        });
        return;
      }

      const bed = db.beds.find((b) => b.id === bedId && b.tenantId === tenantId);
      if (!bed) {
        res.status(404).json({ error: 'Selected bed was not found in this workspace.' });
        return;
      }
      if (bed.status === 'maintenance') {
        res.status(409).json({
          error: `Bed ${bed.bedLabel} is currently under maintenance and cannot be assigned.`,
        });
        return;
      }
      if (stayType === 'active' && bed.status === 'occupied') {
        res.status(409).json({ error: `Bed ${bed.bedLabel} is currently occupied.` });
        return;
      }

      const conflict = hasBedDateConflict(tenantId, bedId, checkInYmd, expectedCheckoutDate);
      if (conflict) {
        res.status(409).json({
          error: `Double-booking prevented: Bed ${bed.bedLabel} already has a ${conflict.status} stay overlapping ${checkInYmd}${expectedCheckoutDate ? ` to ${expectedCheckoutDate}` : ''}.`,
        });
        return;
      }

      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      let guest: Guest | undefined;
      if (existingGuestId) {
        guest = db.guests.find((g) => g.id === existingGuestId && g.tenantId === tenantId);
        if (!guest) {
          res.status(404).json({ error: 'Selected guest not found.' });
          return;
        }
        guest.status = 'active';
      } else {
        const fullName = String(req.body?.fullName || '').trim();
        const primaryPhone = String(req.body?.primaryPhone || '').trim();
        const alternativePhone = String(req.body?.alternativePhone || '').trim();
        const currentAddress = String(req.body?.currentAddress || '').trim();
        const permanentAddress = String(req.body?.permanentAddress || '').trim();
        const emergencyContactName = String(req.body?.emergencyContactName || '').trim();
        const emergencyContactRelation = String(req.body?.emergencyContactRelation || '').trim();
        const emergencyContactPhone = String(req.body?.emergencyContactPhone || '').trim();
        const idType = (req.body?.idType || 'none') as IdDocumentType;
        const rawIdNumber = String(req.body?.idNumber || '').trim();
        const consentGiven = req.body?.consentGiven === 'true' || req.body?.consentGiven === true;
        const consentNotes = String(req.body?.consentNotes || '').trim();
        const notes = String(req.body?.notes || '').trim();

        if (!fullName || primaryPhone.replace(/\D/g, '').length < 10) {
          res.status(400).json({
            error: 'Full name and a valid 10-digit primary phone are required.',
          });
          return;
        }
        if (!currentAddress) {
          res.status(400).json({ error: 'Local workplace / college address is required.' });
          return;
        }
        if (!permanentAddress) {
          res.status(400).json({ error: 'Permanent / native address is required.' });
          return;
        }
        if (
          !emergencyContactName ||
          !emergencyContactRelation ||
          emergencyContactPhone.replace(/\D/g, '').length < 10
        ) {
          res.status(400).json({
            error: 'Emergency contact name, relation, and a valid 10-digit emergency phone are required.',
          });
          return;
        }
        if (idType === 'none' || !rawIdNumber) {
          res.status(400).json({
            error: 'Guest government ID type and ID number are required.',
          });
          return;
        }
        if (idType === 'aadhaar' && !/^\d{12}$/.test(rawIdNumber.replace(/[\s-]/g, ''))) {
          res.status(400).json({
            error: 'Aadhaar number must be 12 digits (only last 4 digits are stored).',
          });
          return;
        }
        if (idType !== 'aadhaar' && rawIdNumber.replace(/[\s-]/g, '').length < 4) {
          res.status(400).json({ error: 'ID number must be at least 4 characters.' });
          return;
        }
        if (tenant.settings.requireIdDocument && !files?.idFront?.[0]) {
          res.status(400).json({
            error: 'Workspace settings require an ID front scan upload at check-in.',
          });
          return;
        }

        const { idLast4, idMasked } = maskIdNumber(idType, rawIdNumber);
        guest = {
          id: `gst_${crypto.randomUUID().slice(0, 8)}`,
          tenantId,
          fullName,
          primaryPhone,
          alternativePhone,
          currentAddress,
          permanentAddress,
          emergencyContactName,
          emergencyContactRelation,
          emergencyContactPhone,
          idType,
          idLast4,
          idMasked,
          consentGiven,
          consentNotes,
          status: 'active',
          altPhoneVerified: 'pending',
          notes,
          createdAt: new Date().toISOString(),
        };
        db.guests.push(guest);
      }

      const stayId = `sty_${crypto.randomUUID().slice(0, 8)}`;
      const stay: Stay = {
        id: stayId,
        tenantId,
        guestId: guest.id,
        roomId: bed.roomId,
        bedId: bed.id,
        purposeOfStay,
        checkInAt,
        expectedCheckoutDate,
        actualCheckoutAt: null,
        status: stayType,
        agreedAmount: Number.isFinite(agreedAmount) && agreedAmount > 0 ? agreedAmount : 0,
        notes: stayNotes || undefined,
        createdAt: new Date().toISOString(),
      };
      db.stays.push(stay);

      if (stayType === 'active') {
        bed.status = 'occupied';
        bed.currentStayId = stayId;
      }

      if (stay.agreedAmount > 0) {
        const isPaid = initialPaymentStatus === 'paid';
        const isPartial =
          initialPaymentStatus === 'partially_paid' &&
          initialPaidAmount > 0 &&
          initialPaidAmount < stay.agreedAmount;
        const paidAmt = isPaid ? stay.agreedAmount : isPartial ? initialPaidAmount : 0;

        const payment: Payment = {
          id: `pay_${crypto.randomUUID().slice(0, 8)}`,
          tenantId,
          stayId,
          guestId: guest.id,
          amount: stay.agreedAmount,
          paidAmount: paidAmt,
          status: isPaid ? 'paid' : isPartial ? 'partially_paid' : 'unpaid',
          paymentMode: paidAmt > 0 ? initialPaymentMode : null,
          paymentDate: paidAmt > 0 ? todayYmd() : null,
          dueDate: initialDueDate || todayYmd(),
          referenceNote:
            initialReferenceNote ||
            (isPaid
              ? 'Collected at check-in'
              : isPartial
                ? `Advance ₹${paidAmt.toLocaleString('en-IN')} paid`
                : 'Initial stay charge due'),
          receiptNumber: paidAmt > 0 ? generateReceiptNumber(tenant) : null,
          description: `Stay registration fee`,
          createdAt: new Date().toISOString(),
        };
        db.payments.push(payment);
      }

      if (Number.isFinite(depositAmount) && depositAmount > 0) {
        const dep: Deposit = {
          id: `dep_${crypto.randomUUID().slice(0, 8)}`,
          tenantId,
          stayId,
          guestId: guest.id,
          amount: depositAmount,
          adjustedAmount: 0,
          refundedAmount: 0,
          status: 'held',
          paymentMode: depositMode,
          collectedDate: todayYmd(),
          referenceNote: 'Collected at registration',
          notes: 'Refundable security deposit.',
          createdAt: new Date().toISOString(),
        };
        db.deposits.push(dep);
      }

      const roleMap: Array<{ field: string; docRole: DocumentRole }> = [
        { field: 'idFront', docRole: 'id_front' },
        { field: 'idBack', docRole: 'id_back' },
        { field: 'additionalId', docRole: 'additional_id' },
      ];

      const uploadedDocs: IdentityDocument[] = [];
      if (files) {
        for (const item of roleMap) {
          const f = files[item.field]?.[0];
          if (!f) continue;
          const objectKey = store.saveUploadedDocumentObject(
            tenantId,
            f.buffer,
            f.mimetype
          );
          const doc: IdentityDocument = {
            id: `doc_${crypto.randomUUID().slice(0, 8)}`,
            tenantId,
            guestId: guest.id,
            stayId,
            docRole: item.docRole,
            idType: guest.idType === 'none' ? 'other' : guest.idType,
            originalFileName: path.basename(f.originalname),
            mimeType: f.mimetype,
            sizeBytes: f.size,
            objectKey,
            uploadedAt: new Date().toISOString(),
          };
          db.documents.push(doc);
          uploadedDocs.push(doc);
        }
      }

      store.save();

      const roomRec = db.rooms.find((r) => r.id === bed.roomId);
      const roomLabel = roomRec ? `${roomRec.roomNumber}-${bed.bedLabel}` : bed.bedLabel;
      if (!existingGuestId) {
        emitAppNotification({
          tenantId: tenant.id,
          tenantName: tenant.name,
          category: 'resident_updates',
          eventType: 'resident_registered',
          priority: 'normal',
          title: `New Resident Registered: ${guest.fullName}`,
          message: `${guest.fullName} registered at ${tenant.name} (${roomLabel}).`,
          targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
          targetTab: 'guests',
          targetId: guest.id,
        });
      }
      if (stayType === 'active') {
        emitAppNotification({
          tenantId: tenant.id,
          tenantName: tenant.name,
          category: 'resident_updates',
          eventType: 'resident_checkin',
          priority: 'normal',
          title: `Resident Check-In: ${guest.fullName}`,
          message: `${guest.fullName} checked into Room ${roomLabel} at ${tenant.name}.`,
          targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
          targetTab: 'stays',
          targetId: stay.id,
        });
      }
      if (Number.isFinite(depositAmount) && depositAmount > 0) {
        emitAppNotification({
          tenantId: tenant.id,
          tenantName: tenant.name,
          category: 'payment_alerts',
          eventType: 'deposit_updated',
          priority: 'normal',
          title: `Security Deposit Collected: ${guest.fullName}`,
          message: `₹${depositAmount.toLocaleString('en-IN')} security deposit held for Room ${roomLabel}.`,
          targetRoles: ['overall_admin', 'owner', 'warden'],
          targetTab: 'payments',
          targetId: stay.id,
        });
      }
      syncDateBasedRentNotifications({ broadcast: true });

      res.status(201).json({ guest, stay, documents: uploadedDocs });
    }
  );

  // --- Stays Lifecycle ---
  app.get('/api/stays', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const search = String(req.query.search || '').trim().toLowerCase();
    const filter = String(req.query.filter || 'all').trim();
    const sortBy = String(req.query.sortBy || 'checkInAt').trim();
    const sortDir = String(req.query.sortDir || 'desc').trim() === 'asc' ? 1 : -1;

    const filtered = enrichStays(tenantId)
      .filter((s) => {
        if (filter === 'upcoming' && s.status !== 'upcoming') return false;
        if (filter === 'active' && s.status !== 'active') return false;
        if (filter === 'overdue' && s.status !== 'overdue') return false;
        if (filter === 'checked_out' && s.status !== 'checked_out') return false;
        if (filter === 'cancelled' && s.status !== 'cancelled') return false;
        if (filter === 'due_soon') {
          if (s.status !== 'active' && s.status !== 'overdue') return false;
          if (!isWithinNextDays(s.expectedCheckoutDate, 7) && s.status !== 'overdue') {
            return false;
          }
        }
        if (!search) return true;
        return (
          s.guestName.toLowerCase().includes(search) ||
          s.guestPhone.toLowerCase().includes(search) ||
          s.roomNumber.toLowerCase().includes(search) ||
          s.purposeOfStay.toLowerCase().includes(search)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'expectedCheckoutDate') {
          return (
            (a.expectedCheckoutDate || '9999-12-31').localeCompare(
              b.expectedCheckoutDate || '9999-12-31'
            ) * sortDir
          );
        }
        if (sortBy === 'guestName') {
          return a.guestName.localeCompare(b.guestName) * sortDir;
        }
        if (sortBy === 'balanceDue') {
          return (a.balanceDue - b.balanceDue) * sortDir;
        }
        return a.checkInAt.localeCompare(b.checkInAt) * sortDir;
      });

    const defaultSize = req.query.page || req.query.pageSize ? 8 : 100;
    const paged = paginateItems(
      filtered,
      req.query.page,
      req.query.pageSize,
      defaultSize
    );

    res.json({ stays: paged.items, pagination: paged.pagination });
  });

  app.post('/api/stays', requireAuth, (req, res) => {
    const tenant = req.sessionCtx!.tenant;
    const tenantId = tenant.id;
    const db = store.getRawState();

    const guestId = String(req.body?.guestId || '').trim();
    const bedId = String(req.body?.bedId || '').trim();
    const purposeOfStay = String(req.body?.purposeOfStay || 'Working Professional').trim();
    const checkInAt = String(req.body?.checkInAt || new Date().toISOString());
    const expectedCheckoutDate = String(req.body?.expectedCheckoutDate || '').trim();
    const status = req.body?.status === 'upcoming' ? 'upcoming' : 'active';
    const agreedAmount = Number(req.body?.agreedAmount || 0);
    const notes = String(req.body?.notes || '').trim();

    const guest = db.guests.find((g) => g.id === guestId && g.tenantId === tenantId);
    if (!guest) {
      res.status(404).json({ error: 'Guest not found.' });
      return;
    }
    const bed = db.beds.find((b) => b.id === bedId && b.tenantId === tenantId);
    if (!bed) {
      res.status(404).json({ error: 'Bed not found.' });
      return;
    }
    if (bed.status === 'maintenance') {
      res.status(409).json({ error: `Bed ${bed.bedLabel} is under maintenance.` });
      return;
    }
    if (status === 'active' && bed.status === 'occupied') {
      res.status(409).json({ error: `Bed ${bed.bedLabel} is currently occupied.` });
      return;
    }
    const checkInYmd = checkInAt.slice(0, 10);
    if (!expectedCheckoutDate || expectedCheckoutDate < checkInYmd) {
      res.status(400).json({ error: 'Valid expected checkout date is required.' });
      return;
    }
    const conflict = hasBedDateConflict(tenantId, bedId, checkInYmd, expectedCheckoutDate);
    if (conflict) {
      res.status(409).json({
        error: `Double-booking prevented: Bed ${bed.bedLabel} overlaps stay ${conflict.id}.`,
      });
      return;
    }

    const stayId = `sty_${crypto.randomUUID().slice(0, 8)}`;
    const stay: Stay = {
      id: stayId,
      tenantId,
      guestId: guest.id,
      roomId: bed.roomId,
      bedId: bed.id,
      purposeOfStay,
      checkInAt,
      expectedCheckoutDate,
      actualCheckoutAt: null,
      status,
      agreedAmount: Number.isFinite(agreedAmount) && agreedAmount > 0 ? agreedAmount : 0,
      notes: notes || undefined,
      createdAt: new Date().toISOString(),
    };
    db.stays.push(stay);
    guest.status = 'active';
    if (status === 'active') {
      bed.status = 'occupied';
      bed.currentStayId = stayId;
    }
    store.save();
    if (status === 'active') {
      const roomRec = db.rooms.find((r) => r.id === bed.roomId);
      const roomLabel = roomRec ? `${roomRec.roomNumber}-${bed.bedLabel}` : bed.bedLabel;
      emitAppNotification({
        tenantId,
        tenantName: tenant.name,
        category: 'resident_updates',
        eventType: 'resident_checkin',
        priority: 'normal',
        title: `Resident Check-In: ${guest.fullName}`,
        message: `${guest.fullName} checked into Room ${roomLabel}.`,
        targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
        targetTab: 'stays',
        targetId: stay.id,
      });
    }
    res.status(201).json({ stay });
  });

  // Extend stay, update notes, or transfer room/bed
  app.patch('/api/stays/:stayId', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const stay = db.stays.find(
      (s) => s.id === req.params.stayId && s.tenantId === tenantId
    );
    if (!stay) {
      res.status(404).json({ error: 'Stay not found.' });
      return;
    }
    if (stay.status === 'checked_out' || stay.status === 'cancelled') {
      res.status(409).json({ error: 'Cannot modify a checked-out or cancelled stay.' });
      return;
    }

    const nextCheckout = String(
      req.body?.expectedCheckoutDate || stay.expectedCheckoutDate
    ).trim();
    const checkInYmd = stay.checkInAt.slice(0, 10);
    if (nextCheckout < checkInYmd) {
      res.status(400).json({ error: 'Checkout date cannot precede check-in date.' });
      return;
    }

    const newBedId = String(req.body?.newBedId || '').trim();
    const targetBedId = newBedId || stay.bedId;

    if (newBedId && newBedId !== stay.bedId) {
      const targetBed = db.beds.find((b) => b.id === newBedId && b.tenantId === tenantId);
      if (!targetBed) {
        res.status(404).json({ error: 'Target bed not found.' });
        return;
      }
      if (targetBed.status === 'maintenance') {
        res.status(409).json({ error: `Bed ${targetBed.bedLabel} is under maintenance.` });
        return;
      }
      if (stay.status === 'active' && targetBed.status === 'occupied') {
        res.status(409).json({ error: `Bed ${targetBed.bedLabel} is already occupied.` });
        return;
      }
      const conflict = hasBedDateConflict(
        tenantId,
        targetBedId,
        checkInYmd,
        nextCheckout,
        stay.id
      );
      if (conflict) {
        res.status(409).json({
          error: `Transfer blocked: Target bed has an overlapping stay (${conflict.expectedCheckoutDate}).`,
        });
        return;
      }

      const oldBed = db.beds.find((b) => b.id === stay.bedId && b.tenantId === tenantId);
      if (oldBed && oldBed.currentStayId === stay.id) {
        oldBed.status = 'vacant';
        oldBed.currentStayId = null;
      }
      stay.bedId = targetBed.id;
      stay.roomId = targetBed.roomId;
      if (stay.status === 'active') {
        targetBed.status = 'occupied';
        targetBed.currentStayId = stay.id;
      }
    } else {
      const conflict = hasBedDateConflict(
        tenantId,
        targetBedId,
        checkInYmd,
        nextCheckout,
        stay.id
      );
      if (conflict) {
        res.status(409).json({
          error: 'Extension conflicts with an upcoming reservation on the same bed.',
        });
        return;
      }
    }

    stay.expectedCheckoutDate = nextCheckout;
    if (typeof req.body?.purposeOfStay === 'string' && req.body.purposeOfStay.trim()) {
      stay.purposeOfStay = req.body.purposeOfStay.trim();
    }
    if (typeof req.body?.notes === 'string') {
      stay.notes = req.body.notes.trim();
    }
    if (typeof req.body?.agreedAmount === 'number' && req.body.agreedAmount >= 0) {
      stay.agreedAmount = req.body.agreedAmount;
    }

    store.save();
    res.json({ stay });
  });

  app.post('/api/stays/:stayId/check-in', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const stay = db.stays.find(
      (s) => s.id === req.params.stayId && s.tenantId === tenantId
    );
    if (!stay) {
      res.status(404).json({ error: 'Stay not found.' });
      return;
    }
    if (stay.status !== 'upcoming') {
      res.status(400).json({ error: 'Only upcoming reservations can be checked in.' });
      return;
    }
    const bed = db.beds.find((b) => b.id === stay.bedId && b.tenantId === tenantId);
    if (!bed || bed.status !== 'vacant') {
      res.status(409).json({
        error: `Cannot check in: assigned bed is currently ${bed?.status || 'unavailable'}. Transfer bed first.`,
      });
      return;
    }

    stay.status = 'active';
    stay.checkInAt = new Date().toISOString();
    bed.status = 'occupied';
    bed.currentStayId = stay.id;

    const guest = db.guests.find((g) => g.id === stay.guestId && g.tenantId === tenantId);
    if (guest) guest.status = 'active';

    store.save();
    const roomIn = db.rooms.find((r) => r.id === stay.roomId);
    const roomLabelIn = roomIn ? `${roomIn.roomNumber}-${bed.bedLabel}` : bed.bedLabel;
    emitAppNotification({
      tenantId,
      category: 'resident_updates',
      eventType: 'resident_checkin',
      priority: 'normal',
      title: `Resident Check-In: ${guest?.fullName || 'Resident'}`,
      message: `${guest?.fullName || 'Resident'} checked into Room ${roomLabelIn}.`,
      targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
      targetTab: 'stays',
      targetId: stay.id,
    });
    res.json({ stay });
  });

  app.post('/api/stays/:stayId/checkout', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const stay = db.stays.find(
      (s) => s.id === req.params.stayId && s.tenantId === tenantId
    );
    if (!stay) {
      res.status(404).json({ error: 'Stay not found.' });
      return;
    }
    if (stay.status === 'checked_out' || stay.status === 'cancelled') {
      res.status(400).json({ error: 'Stay is already closed.' });
      return;
    }

    const actualCheckoutAt = req.body?.actualCheckoutAt || new Date().toISOString();
    stay.status = 'checked_out';
    stay.actualCheckoutAt = actualCheckoutAt;

    const bed = db.beds.find((b) => b.id === stay.bedId && b.tenantId === tenantId);
    if (bed && bed.currentStayId === stay.id) {
      bed.status = 'vacant';
      bed.currentStayId = null;
    }

    const stillActive = db.stays.some(
      (s) =>
        s.tenantId === tenantId &&
        s.guestId === stay.guestId &&
        s.id !== stay.id &&
        (s.status === 'active' || s.status === 'overdue' || s.status === 'upcoming')
    );
    const guest = db.guests.find((g) => g.id === stay.guestId && g.tenantId === tenantId);
    if (!stillActive && guest) {
      guest.status = 'former';
    }

    store.save();
    const roomOut = db.rooms.find((r) => r.id === stay.roomId);
    const roomLabelOut = roomOut && bed ? `${roomOut.roomNumber}-${bed.bedLabel}` : 'Bed';
    emitAppNotification({
      tenantId,
      category: 'resident_updates',
      eventType: 'resident_checkout',
      priority: 'normal',
      title: `Resident Check-Out: ${guest?.fullName || 'Resident'}`,
      message: `${guest?.fullName || 'Resident'} checked out of Room ${roomLabelOut}. Bed is now vacant.`,
      targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
      targetTab: 'stays',
      targetId: stay.id,
    });
    res.json({ stay });
  });

  app.post('/api/stays/:stayId/cancel', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const stay = db.stays.find(
      (s) => s.id === req.params.stayId && s.tenantId === tenantId
    );
    if (!stay) {
      res.status(404).json({ error: 'Stay not found.' });
      return;
    }
    if (stay.status !== 'upcoming') {
      res.status(400).json({ error: 'Only upcoming stays can be cancelled.' });
      return;
    }

    stay.status = 'cancelled';
    stay.cancelledAt = new Date().toISOString();
    stay.cancellationReason = String(req.body?.reason || 'Cancelled by staff').trim();

    const bed = db.beds.find((b) => b.id === stay.bedId && b.tenantId === tenantId);
    if (bed && bed.currentStayId === stay.id) {
      bed.status = 'vacant';
      bed.currentStayId = null;
    }

    store.save();
    res.json({ stay });
  });

  // --- Rooms & Beds ---
  app.get('/api/rooms', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const statusFilter = String(req.query.status || 'all').trim();
    const floorFilter = String(req.query.floor || 'all').trim();
    const roomTypeFilter = String(req.query.roomType || 'all').trim();
    const search = String(req.query.search || '').trim().toLowerCase();
    const allBeds = enrichBeds(tenantId);
    const allRooms = store
      .getRooms(tenantId)
      .map((room) => {
        const roomBeds = allBeds.filter((b) => b.roomId === room.id);
        return {
          ...room,
          capacity: room.capacity || roomBeds.length,
          facilities: room.facilities || [],
          status: computeRoomStatus(room, roomBeds),
        };
      })
      .sort((a, b) =>
        a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })
      );

    const floors = Array.from(
      new Set(allRooms.map((r) => r.floor).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const occupiedBedsCount = allBeds.filter((b) => b.status === 'occupied').length;
    const vacantBedsCount = allBeds.filter((b) => b.status === 'vacant').length;
    const maintenanceBedsCount = allBeds.filter((b) => b.status === 'maintenance').length;
    const totalBedsCount = allBeds.length;
    const summary = {
      totalRooms: allRooms.length,
      totalBeds: totalBedsCount,
      occupiedBeds: occupiedBedsCount,
      vacantBeds: vacantBedsCount,
      maintenanceBeds: maintenanceBedsCount,
      occupancyPercent:
        totalBedsCount > 0 ? Math.round((occupiedBedsCount / totalBedsCount) * 100) : 0,
      occupiedMonthlyRent: allBeds
        .filter((b) => b.status === 'occupied')
        .reduce((sum, b) => sum + (b.monthlyTariff || 0), 0),
      vacantMonthlyPotential: allBeds
        .filter((b) => b.status === 'vacant')
        .reduce((sum, b) => sum + (b.monthlyTariff || 0), 0),
    };

    const filteredRooms = allRooms.filter((room) => {
      const roomBeds = allBeds.filter((b) => b.roomId === room.id);
      if (floorFilter !== 'all' && room.floor !== floorFilter) {
        return false;
      }
      if (roomTypeFilter !== 'all' && room.roomType !== roomTypeFilter) {
        return false;
      }
      if (statusFilter === 'available' || statusFilter === 'vacant') {
        if (!roomBeds.some((b) => b.status === 'vacant') || room.status === 'maintenance') {
          return false;
        }
      } else if (statusFilter === 'occupied') {
        if (!roomBeds.some((b) => b.status === 'occupied')) return false;
      } else if (statusFilter === 'maintenance') {
        if (room.status !== 'maintenance' && !roomBeds.some((b) => b.status === 'maintenance')) {
          return false;
        }
      }
      if (!search) return true;
      return (
        room.roomNumber.toLowerCase().includes(search) ||
        room.floor.toLowerCase().includes(search) ||
        room.roomType.toLowerCase().includes(search) ||
        room.facilities.some((f) => f.toLowerCase().includes(search)) ||
        roomBeds.some((b) => (b.occupantGuestName || '').toLowerCase().includes(search))
      );
    });

    const defaultSize = req.query.page || req.query.pageSize ? 6 : 100;
    const paged = paginateItems(
      filteredRooms,
      req.query.page,
      req.query.pageSize,
      defaultSize
    );
    const visibleRoomIds = new Set(paged.items.map((r) => r.id));

    res.json({
      rooms: paged.items,
      beds: allBeds.filter((b) => visibleRoomIds.has(b.roomId)),
      floors,
      summary,
      pagination: paged.pagination,
    });
  });

  app.get('/api/beds', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const statusFilter = String(req.query.status || 'all').trim();
    const floorFilter = String(req.query.floor || 'all').trim();
    const roomTypeFilter = String(req.query.roomType || 'all').trim();
    const search = String(req.query.search || '').trim().toLowerCase();

    const allBeds = enrichBeds(tenantId).sort((a, b) => {
      const rCmp = a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
      if (rCmp !== 0) return rCmp;
      return a.bedLabel.localeCompare(b.bedLabel, undefined, { numeric: true });
    });

    const filteredBeds = allBeds.filter((bed) => {
      if (floorFilter !== 'all' && bed.floor !== floorFilter) return false;
      if (roomTypeFilter !== 'all' && bed.roomType !== roomTypeFilter) return false;
      if (statusFilter === 'available' || statusFilter === 'vacant') {
        if (bed.status !== 'vacant') return false;
      } else if (statusFilter === 'occupied') {
        if (bed.status !== 'occupied') return false;
      } else if (statusFilter === 'maintenance') {
        if (bed.status !== 'maintenance') return false;
      }
      if (!search) return true;
      return (
        bed.roomNumber.toLowerCase().includes(search) ||
        bed.bedLabel.toLowerCase().includes(search) ||
        bed.floor.toLowerCase().includes(search) ||
        bed.roomType.toLowerCase().includes(search) ||
        (bed.occupantGuestName || '').toLowerCase().includes(search) ||
        (bed.upcomingReservation?.guestName || '').toLowerCase().includes(search)
      );
    });

    const defaultSize = req.query.page || req.query.pageSize ? 10 : 100;
    const paged = paginateItems(
      filteredBeds,
      req.query.page,
      req.query.pageSize,
      defaultSize
    );
    res.json({
      beds: paged.items,
      pagination: paged.pagination,
    });
  });

  app.post('/api/rooms', requireAuth, requireRole('owner', 'warden', 'overall_admin'), (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const roomNumber = String(req.body?.roomNumber || '').trim();
    const floor = String(req.body?.floor || '1st Floor').trim();
    const rawRoomType = String(req.body?.roomType || '2-Sharing').trim();
    if (!ROOM_TYPES.includes(rawRoomType as RoomType)) {
      res.status(400).json({ error: `Invalid room type: ${rawRoomType}` });
      return;
    }
    const roomType = rawRoomType as RoomType;
    const defaultTariff = ROOM_TYPE_DEFAULT_TARIFF[roomType] ?? 8000;
    const rawTariff = Number(req.body?.monthlyTariff);
    const monthlyTariff = Number.isFinite(rawTariff) && rawTariff > 0 ? rawTariff : defaultTariff;
    const bedCount = Math.min(30, Math.max(1, Number(req.body?.bedCount || req.body?.capacity || 2)));
    const capacity = Math.min(30, Math.max(bedCount, Number(req.body?.capacity || bedCount)));
    const facilities = Array.isArray(req.body?.facilities)
      ? req.body.facilities.map((f: unknown) => String(f).trim()).filter(Boolean)
      : [];
    const status: RoomStatus = req.body?.status === 'maintenance' ? 'maintenance' : 'available';

    if (!roomNumber) {
      res.status(400).json({ error: 'Room number is required.' });
      return;
    }

    if (
      db.rooms.some(
        (r) =>
          r.tenantId === tenantId &&
          r.roomNumber.toLowerCase() === roomNumber.toLowerCase()
      )
    ) {
      res.status(409).json({ error: `Room ${roomNumber} already exists.` });
      return;
    }

    const roomId = `rm_${crypto.randomUUID().slice(0, 8)}`;
    const room: Room = {
      id: roomId,
      tenantId,
      roomNumber,
      floor,
      roomType,
      capacity,
      monthlyTariff,
      facilities,
      status,
      createdAt: new Date().toISOString(),
    };
    db.rooms.push(room);

    const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const newBeds: Bed[] = [];
    for (let i = 0; i < bedCount; i++) {
      const bed: Bed = {
        id: `bed_${crypto.randomUUID().slice(0, 8)}`,
        tenantId,
        roomId,
        bedLabel: labels[i] || `B${i + 1}`,
        status: status === 'maintenance' ? 'maintenance' : 'vacant',
        currentStayId: null,
      };
      db.beds.push(bed);
      newBeds.push(bed);
    }

    store.save();
    emitAppNotification({
      tenantId,
      category: status === 'maintenance' ? 'maintenance_alerts' : 'system_alerts',
      eventType: 'room_bed_availability',
      priority: 'normal',
      title: `New Room Added: Room ${room.roomNumber}`,
      message: `Room ${room.roomNumber} (${room.roomType}, ${newBeds.length} beds) added (${status}).`,
      targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
      targetTab: 'rooms',
      targetId: room.id,
    });
    res.status(201).json({ room, beds: newBeds });
  });

  app.patch('/api/rooms/:roomId', requireAuth, requireRole('owner', 'warden', 'overall_admin'), (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const room = db.rooms.find(
      (r) => r.id === req.params.roomId && r.tenantId === tenantId
    );
    if (!room) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }

    const roomBeds = db.beds.filter((b) => b.roomId === room.id && b.tenantId === tenantId);

    if (typeof req.body?.roomNumber === 'string' && req.body.roomNumber.trim()) {
      const nextNum = req.body.roomNumber.trim();
      const dup = db.rooms.some(
        (r) =>
          r.tenantId === tenantId &&
          r.id !== room.id &&
          r.roomNumber.toLowerCase() === nextNum.toLowerCase()
      );
      if (dup) {
        res.status(409).json({ error: `Room ${nextNum} already exists.` });
        return;
      }
      room.roomNumber = nextNum;
    }
    if (typeof req.body?.floor === 'string' && req.body.floor.trim()) {
      room.floor = req.body.floor.trim();
    }
    if (req.body?.roomType) {
      const nextType = String(req.body.roomType).trim();
      if (!ROOM_TYPES.includes(nextType as RoomType)) {
        res.status(400).json({ error: `Invalid room type: ${nextType}` });
        return;
      }
      const prevRoomType = room.roomType;
      room.roomType = nextType as RoomType;
      if (prevRoomType !== room.roomType && req.body?.monthlyTariff === undefined) {
        room.monthlyTariff = ROOM_TYPE_DEFAULT_TARIFF[room.roomType] ?? room.monthlyTariff;
      }
    }
    if (typeof req.body?.monthlyTariff === 'number' && req.body.monthlyTariff > 0) {
      room.monthlyTariff = req.body.monthlyTariff;
    }
    if (Array.isArray(req.body?.facilities)) {
      room.facilities = req.body.facilities.map((f: unknown) => String(f).trim()).filter(Boolean);
    }
    if (typeof req.body?.capacity === 'number' && req.body.capacity >= 1 && req.body.capacity <= 30) {
      if (req.body.capacity < roomBeds.length) {
        res.status(409).json({
          error: `Capacity cannot be reduced below the ${roomBeds.length} existing beds.`,
        });
        return;
      }
      room.capacity = Math.round(req.body.capacity);
    }
    const prevStatus = room.status;
    if (req.body?.status === 'maintenance' || req.body?.status === 'available') {
      if (req.body.status === 'maintenance' && roomBeds.some((b) => b.status === 'occupied')) {
        res.status(409).json({
          error: 'Cannot place room under maintenance while beds are occupied.',
        });
        return;
      }
      room.status = req.body.status;
      if (req.body.status === 'maintenance') {
        for (const b of roomBeds) {
          if (b.status === 'vacant') b.status = 'maintenance';
        }
      } else {
        for (const b of roomBeds) {
          if (b.status === 'maintenance') b.status = 'vacant';
        }
      }
    }

    store.save();
    if (prevStatus !== room.status) {
      emitAppNotification({
        tenantId,
        category: room.status === 'maintenance' ? 'maintenance_alerts' : 'system_alerts',
        eventType: 'room_bed_availability',
        priority: room.status === 'maintenance' ? 'high' : 'normal',
        title:
          room.status === 'maintenance'
            ? `Room Under Maintenance: Room ${room.roomNumber}`
            : `Room Available: Room ${room.roomNumber}`,
        message: `Room ${room.roomNumber} (${room.roomType}) status updated to ${room.status}.`,
        targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
        targetTab: 'rooms',
        targetId: room.id,
      });
    }
    res.json({ room });
  });

  app.post('/api/rooms/:roomId/beds', requireAuth, requireRole('owner', 'warden', 'overall_admin'), (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const room = db.rooms.find(
      (r) => r.id === req.params.roomId && r.tenantId === tenantId
    );
    if (!room) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }
    const existingBeds = db.beds.filter((b) => b.roomId === room.id && b.tenantId === tenantId);
    const maxCap = room.capacity || 30;
    if (existingBeds.length >= maxCap) {
      res.status(409).json({
        error: `Room ${room.roomNumber} has reached its configured bed capacity (${maxCap}). Increase room capacity first.`,
      });
      return;
    }
    const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const used = new Set(existingBeds.map((b) => b.bedLabel));
    const requestedLabel = String(req.body?.bedLabel || '').trim();
    const bedLabel =
      requestedLabel || labels.find((l) => !used.has(l)) || `B${existingBeds.length + 1}`;

    const bed: Bed = {
      id: `bed_${crypto.randomUUID().slice(0, 8)}`,
      tenantId,
      roomId: room.id,
      bedLabel,
      status: room.status === 'maintenance' ? 'maintenance' : 'vacant',
      currentStayId: null,
    };
    db.beds.push(bed);
    store.save();
    emitAppNotification({
      tenantId,
      category: 'system_alerts',
      eventType: 'room_bed_availability',
      priority: 'normal',
      title: `Bed Added: Room ${room.roomNumber}-${bed.bedLabel}`,
      message: `Bed ${bed.bedLabel} added to Room ${room.roomNumber} (${bed.status}).`,
      targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
      targetTab: 'rooms',
      targetId: room.id,
    });
    res.status(201).json({ bed });
  });

  app.patch('/api/beds/:bedId/status', requireAuth, requireRole('owner', 'warden', 'overall_admin'), (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const bed = db.beds.find((b) => b.id === req.params.bedId && b.tenantId === tenantId);
    if (!bed) {
      res.status(404).json({ error: 'Bed not found.' });
      return;
    }
    const nextStatus = req.body?.status;
    if (nextStatus !== 'vacant' && nextStatus !== 'maintenance') {
      res.status(400).json({ error: 'Bed can only be toggled between vacant and maintenance.' });
      return;
    }
    if (bed.status === 'occupied') {
      res.status(409).json({
        error: 'Cannot change status of an occupied bed. Check out or transfer the guest first.',
      });
      return;
    }
    const upcomingOnBed = db.stays.find(
      (s) => s.tenantId === tenantId && s.bedId === bed.id && s.status === 'upcoming'
    );
    if (nextStatus === 'maintenance' && upcomingOnBed) {
      res.status(409).json({
        error: 'Cannot mark bed under maintenance while an upcoming booking exists for it.',
      });
      return;
    }

    bed.status = nextStatus;
    store.save();
    const roomObj = db.rooms.find((r) => r.id === bed.roomId);
    const bedTitle = roomObj ? `Room ${roomObj.roomNumber}-${bed.bedLabel}` : `Bed ${bed.bedLabel}`;
    emitAppNotification({
      tenantId,
      category: 'maintenance_alerts',
      eventType: 'room_bed_availability',
      priority: nextStatus === 'maintenance' ? 'high' : 'normal',
      title:
        nextStatus === 'maintenance'
          ? `Bed Under Maintenance: ${bedTitle}`
          : `Bed Available Again: ${bedTitle}`,
      message: `${bedTitle} status updated to ${nextStatus}.`,
      targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
      targetTab: 'rooms',
      targetId: bed.roomId,
    });
    res.json({ bed });
  });

  app.delete('/api/beds/:bedId', requireAuth, requireRole('owner', 'warden', 'overall_admin'), (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const bedIdx = db.beds.findIndex(
      (b) => b.id === req.params.bedId && b.tenantId === tenantId
    );
    if (bedIdx === -1) {
      res.status(404).json({ error: 'Bed not found.' });
      return;
    }
    const bed = db.beds[bedIdx];
    if (bed.status === 'occupied') {
      res.status(409).json({
        error: 'Cannot remove an occupied bed. Check out or transfer the resident first.',
      });
      return;
    }
    const roomBeds = db.beds.filter((b) => b.roomId === bed.roomId && b.tenantId === tenantId);
    if (roomBeds.length <= 1) {
      res.status(409).json({
        error: 'A room must have at least one bed. Delete the room instead if no longer needed.',
      });
      return;
    }
    if (
      db.stays.some(
        (s) => s.tenantId === tenantId && s.bedId === bed.id && s.status === 'upcoming'
      )
    ) {
      res.status(409).json({
        error: 'Cannot remove a bed that has upcoming reservations.',
      });
      return;
    }

    const roomObj = db.rooms.find((r) => r.id === bed.roomId && r.tenantId === tenantId);
    db.beds.splice(bedIdx, 1);
    store.save();
    emitAppNotification({
      tenantId,
      category: 'system_alerts',
      eventType: 'room_bed_availability',
      priority: 'normal',
      title: `Bed Removed: ${roomObj ? `Room ${roomObj.roomNumber}-${bed.bedLabel}` : bed.bedLabel}`,
      message: `Bed ${bed.bedLabel} was removed from ${roomObj ? `Room ${roomObj.roomNumber}` : 'room'}.`,
      targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
      targetTab: 'rooms',
      targetId: bed.roomId,
    });
    res.json({ ok: true });
  });

  app.delete('/api/rooms/:roomId', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const roomIdx = db.rooms.findIndex(
      (r) => r.id === req.params.roomId && r.tenantId === tenantId
    );
    if (roomIdx === -1) {
      res.status(404).json({ error: 'Room not found.' });
      return;
    }

    const roomBeds = db.beds.filter(
      (b) => b.roomId === req.params.roomId && b.tenantId === tenantId
    );
    if (roomBeds.some((b) => b.status === 'occupied')) {
      res.status(409).json({
        error: 'Cannot delete a room with occupied beds. Check out guests first.',
      });
      return;
    }
    if (
      db.stays.some(
        (s) => s.tenantId === tenantId && s.roomId === req.params.roomId && s.status === 'upcoming'
      )
    ) {
      res.status(409).json({
        error: 'Cannot delete a room with upcoming reservations.',
      });
      return;
    }

    const removedRoom = db.rooms[roomIdx];
    db.rooms.splice(roomIdx, 1);
    db.beds = db.beds.filter(
      (b) => !(b.roomId === req.params.roomId && b.tenantId === tenantId)
    );
    store.save();
    emitAppNotification({
      tenantId,
      category: 'system_alerts',
      eventType: 'room_bed_availability',
      priority: 'normal',
      title: `Room Removed: Room ${removedRoom.roomNumber}`,
      message: `Room ${removedRoom.roomNumber} (${removedRoom.roomType}) was deleted from inventory.`,
      targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
      targetTab: 'rooms',
      targetId: removedRoom.id,
    });
    res.json({ ok: true });
  });

  // --- Payments & Refunds ---
  app.get('/api/payments', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const search = String(req.query.search || '').trim().toLowerCase();
    const filter = String(req.query.filter || 'all').trim();

    const filteredPayments = enrichPayments(tenantId).filter((p) => {
      if (filter === 'unpaid' && p.status !== 'unpaid') return false;
      if (filter === 'partially_paid' && p.status !== 'partially_paid') return false;
      if (filter === 'overdue' && p.status !== 'overdue') return false;
      if (filter === 'paid' && p.status !== 'paid') return false;
      if (filter === 'refunded' && p.status !== 'refunded') return false;
      if (filter === 'open' && p.status !== 'unpaid' && p.status !== 'partially_paid' && p.status !== 'overdue') {
        return false;
      }
      if (!search) return true;
      return (
        p.guestName.toLowerCase().includes(search) ||
        p.roomNumber.toLowerCase().includes(search) ||
        (p.receiptNumber && p.receiptNumber.toLowerCase().includes(search)) ||
        p.referenceNote.toLowerCase().includes(search) ||
        p.description.toLowerCase().includes(search)
      );
    });

    const defaultPaySize = req.query.page || req.query.pageSize ? 8 : 100;
    const pagedPayments = paginateItems(
      filteredPayments,
      req.query.page,
      req.query.pageSize,
      defaultPaySize
    );

    const allLogs = store.getReminderLogs(tenantId);
    const defaultLogSize = req.query.logPage || req.query.logPageSize ? 5 : 100;
    const pagedLogs = paginateItems(
      allLogs,
      req.query.logPage,
      req.query.logPageSize,
      defaultLogSize
    );

    res.json({
      payments: pagedPayments.items,
      pagination: pagedPayments.pagination,
      reminderLogs: pagedLogs.items,
      logsPagination: pagedLogs.pagination,
    });
  });

  app.post('/api/payments', requireAuth, (req, res) => {
    const tenant = req.sessionCtx!.tenant;
    const tenantId = tenant.id;
    const db = store.getRawState();

    const existingPaymentId = String(req.body?.paymentId || '').trim();
    const stayId = String(req.body?.stayId || '').trim();
    const amount = Number(req.body?.amount || 0);
    const status = (req.body?.status || 'paid') as 'paid' | 'unpaid' | 'partially_paid';
    const paymentMode = (req.body?.paymentMode || 'upi') as PaymentMode;
    const paymentDate = String(req.body?.paymentDate || todayYmd());
    const dueDate = String(req.body?.dueDate || todayYmd());
    const referenceNote = String(req.body?.referenceNote || '').trim();
    const description = String(req.body?.description || 'Stay rent / charge').trim();

    if (existingPaymentId) {
      const existing = db.payments.find(
        (p) => p.id === existingPaymentId && p.tenantId === tenantId
      );
      if (!existing) {
        res.status(404).json({ error: 'Payment record not found.' });
        return;
      }
      if (existing.status === 'refunded') {
        res.status(400).json({ error: 'Cannot collect on a refunded payment.' });
        return;
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ error: 'Valid positive payment amount is required.' });
        return;
      }
      const prevPaid = existing.paidAmount ?? (existing.status === 'paid' ? existing.amount : 0);
      const nextPaid = Math.min(existing.amount, prevPaid + amount);
      existing.paidAmount = nextPaid;
      existing.paymentMode = paymentMode;
      existing.paymentDate = paymentDate;
      existing.status = nextPaid >= existing.amount ? 'paid' : 'partially_paid';
      existing.referenceNote = referenceNote
        ? existing.referenceNote
          ? `${existing.referenceNote} | ${referenceNote}`
          : referenceNote
        : existing.referenceNote;
      if (!existing.receiptNumber) {
        existing.receiptNumber = generateReceiptNumber(tenant);
      }
      store.save();
      if (existing.status === 'paid') {
        resolvePaymentRentNotifications(existing.id);
      }
      const gPaid = db.guests.find((g) => g.id === existing.guestId);
      emitAppNotification({
        tenantId,
        tenantName: tenant.name,
        category: 'payment_alerts',
        eventType: 'payment_received',
        priority: 'normal',
        title: `Rent Payment Received: ₹${amount.toLocaleString('en-IN')}`,
        message: `${gPaid?.fullName || 'Resident'} paid ₹${amount.toLocaleString('en-IN')} via ${paymentMode.toUpperCase()} (${existing.status.replace('_', ' ')}).`,
        targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
        targetTab: 'payments',
        targetId: existing.id,
      });
      store.save();
      res.json({ payment: existing });
      return;
    }

    const stay = db.stays.find((s) => s.id === stayId && s.tenantId === tenantId);
    if (!stay) {
      res.status(404).json({ error: 'Stay not found in this workspace.' });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Valid positive payment amount is required.' });
      return;
    }

    const paidAmt =
      status === 'paid'
        ? amount
        : status === 'partially_paid'
          ? Math.min(amount, Math.max(0, Number(req.body?.paidAmount || 0)))
          : 0;
    const finalStatus: PaymentStatus =
      paidAmt >= amount ? 'paid' : paidAmt > 0 ? 'partially_paid' : 'unpaid';

    const payment: Payment = {
      id: `pay_${crypto.randomUUID().slice(0, 8)}`,
      tenantId,
      stayId: stay.id,
      guestId: stay.guestId,
      amount,
      paidAmount: paidAmt,
      status: finalStatus,
      paymentMode: paidAmt > 0 ? paymentMode : null,
      paymentDate: paidAmt > 0 ? paymentDate : null,
      dueDate,
      referenceNote,
      receiptNumber: paidAmt > 0 ? generateReceiptNumber(tenant) : null,
      description,
      createdAt: new Date().toISOString(),
    };
    db.payments.push(payment);
    store.save();
    if (paidAmt > 0) {
      const gNewPay = db.guests.find((g) => g.id === stay.guestId);
      emitAppNotification({
        tenantId,
        tenantName: tenant.name,
        category: 'payment_alerts',
        eventType: 'payment_received',
        priority: 'normal',
        title: `Rent Payment Received: ₹${paidAmt.toLocaleString('en-IN')}`,
        message: `${gNewPay?.fullName || 'Resident'} paid ₹${paidAmt.toLocaleString('en-IN')} (${description}).`,
        targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
        targetTab: 'payments',
        targetId: payment.id,
      });
    } else {
      syncDateBasedRentNotifications({ broadcast: true });
    }
    res.status(201).json({ payment });
  });

  app.post(
    '/api/payments/:paymentId/refund',
    requireAuth,
    requireRole('owner', 'warden', 'overall_admin'),
    (req, res) => {
      const tenantId = req.sessionCtx!.tenant.id;
      const db = store.getRawState();
      const payment = db.payments.find(
        (p) => p.id === req.params.paymentId && p.tenantId === tenantId
      );
      if (!payment) {
        res.status(404).json({ error: 'Payment not found.' });
        return;
      }
      const paidAmt = payment.paidAmount ?? (payment.status === 'paid' ? payment.amount : 0);
      if (paidAmt <= 0 || payment.status === 'refunded') {
        res.status(400).json({ error: 'Only paid or partially paid entries can be refunded.' });
        return;
      }

      const refundNote = String(req.body?.referenceNote || 'Refunded by management').trim();
      payment.status = 'refunded';
      payment.refundedAmount = paidAmt;
      payment.refundDate = String(req.body?.refundDate || todayYmd());
      payment.referenceNote = payment.referenceNote
        ? `${payment.referenceNote} | ${refundNote}`
        : refundNote;
      store.save();
      res.json({ payment });
    }
  );

  // --- Separate Refundable Deposits ---
  app.get('/api/deposits', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const search = String(req.query.search || '').trim().toLowerCase();
    const filter = String(req.query.filter || 'all').trim();

    const filtered = enrichDeposits(tenantId).filter((d) => {
      if (filter !== 'all' && d.status !== filter) return false;
      if (!search) return true;
      return (
        d.guestName.toLowerCase().includes(search) ||
        d.roomNumber.toLowerCase().includes(search) ||
        d.referenceNote.toLowerCase().includes(search) ||
        d.notes.toLowerCase().includes(search)
      );
    });

    const defaultSize = req.query.page || req.query.pageSize ? 8 : 100;
    const paged = paginateItems(filtered, req.query.page, req.query.pageSize, defaultSize);
    res.json({ deposits: paged.items, pagination: paged.pagination });
  });

  app.post('/api/deposits', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const stayId = String(req.body?.stayId || '').trim();
    const amount = Number(req.body?.amount || 0);
    const paymentMode = (req.body?.paymentMode || 'upi') as PaymentMode;
    const collectedDate = String(req.body?.collectedDate || todayYmd());
    const referenceNote = String(req.body?.referenceNote || '').trim();
    const notes = String(req.body?.notes || 'Refundable security deposit').trim();

    const stay = db.stays.find((s) => s.id === stayId && s.tenantId === tenantId);
    if (!stay) {
      res.status(404).json({ error: 'Stay not found in this workspace.' });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: 'Valid positive deposit amount is required.' });
      return;
    }

    const deposit: Deposit = {
      id: `dep_${crypto.randomUUID().slice(0, 8)}`,
      tenantId,
      stayId: stay.id,
      guestId: stay.guestId,
      amount,
      adjustedAmount: 0,
      refundedAmount: 0,
      status: 'held',
      paymentMode,
      collectedDate,
      referenceNote,
      notes,
      createdAt: new Date().toISOString(),
    };
    db.deposits.push(deposit);
    store.save();
    const gDep = db.guests.find((g) => g.id === stay.guestId);
    emitAppNotification({
      tenantId,
      category: 'payment_alerts',
      eventType: 'deposit_updated',
      priority: 'normal',
      title: `Security Deposit Collected: ₹${amount.toLocaleString('en-IN')}`,
      message: `${gDep?.fullName || 'Resident'} deposit held (₹${amount.toLocaleString('en-IN')}).`,
      targetRoles: ['overall_admin', 'owner', 'warden'],
      targetTab: 'payments',
      targetId: deposit.id,
    });
    res.status(201).json({ deposit });
  });

  app.post(
    '/api/deposits/:depositId/adjust',
    requireAuth,
    requireRole('owner', 'warden', 'overall_admin'),
    (req, res) => {
      const tenant = req.sessionCtx!.tenant;
      const tenantId = tenant.id;
      const db = store.getRawState();
      const deposit = db.deposits.find(
        (d) => d.id === req.params.depositId && d.tenantId === tenantId
      );
      if (!deposit) {
        res.status(404).json({ error: 'Deposit not found.' });
        return;
      }
      const remaining = deposit.amount - deposit.adjustedAmount - deposit.refundedAmount;
      const adjustAmount = Number(req.body?.amount || 0);
      const reason = String(req.body?.note || 'Adjusted against stay dues/repairs').trim();
      const targetPaymentId = String(req.body?.paymentId || '').trim();

      if (!Number.isFinite(adjustAmount) || adjustAmount <= 0 || adjustAmount > remaining) {
        res.status(400).json({
          error: `Adjustment amount must be between ₹1 and remaining held ₹${remaining.toLocaleString('en-IN')}.`,
        });
        return;
      }

      deposit.adjustedAmount += adjustAmount;
      const afterRemaining = deposit.amount - deposit.adjustedAmount - deposit.refundedAmount;
      deposit.status = afterRemaining === 0 ? 'adjusted' : 'partially_adjusted';
      deposit.notes = `${deposit.notes} | Adjusted ₹${adjustAmount}: ${reason}`;

      if (targetPaymentId) {
        const pay = db.payments.find(
          (p) => p.id === targetPaymentId && p.tenantId === tenantId && p.stayId === deposit.stayId
        );
        if (pay && pay.status !== 'refunded') {
          const prevPaid = pay.paidAmount ?? 0;
          pay.paidAmount = Math.min(pay.amount, prevPaid + adjustAmount);
          pay.status = pay.paidAmount >= pay.amount ? 'paid' : 'partially_paid';
          pay.paymentDate = todayYmd();
          pay.paymentMode = deposit.paymentMode;
          pay.referenceNote = pay.referenceNote
            ? `${pay.referenceNote} | Adjusted from deposit`
            : 'Adjusted from security deposit';
          if (!pay.receiptNumber) {
            pay.receiptNumber = generateReceiptNumber(tenant);
          }
          if (pay.status === 'paid') {
            resolvePaymentRentNotifications(pay.id);
          }
        }
      }

      store.save();
      const gAdj = db.guests.find((g) => g.id === deposit.guestId);
      emitAppNotification({
        tenantId,
        tenantName: tenant.name,
        category: 'payment_alerts',
        eventType: 'deposit_updated',
        priority: 'normal',
        title: `Security Deposit Adjusted: ₹${adjustAmount.toLocaleString('en-IN')}`,
        message: `${gAdj?.fullName || 'Resident'} deposit adjusted (${reason}).`,
        targetRoles: ['overall_admin', 'owner', 'warden'],
        targetTab: 'payments',
        targetId: deposit.id,
      });
      res.json({ deposit });
    }
  );

  app.post(
    '/api/deposits/:depositId/refund',
    requireAuth,
    requireRole('owner', 'warden', 'overall_admin'),
    (req, res) => {
      const tenantId = req.sessionCtx!.tenant.id;
      const db = store.getRawState();
      const deposit = db.deposits.find(
        (d) => d.id === req.params.depositId && d.tenantId === tenantId
      );
      if (!deposit) {
        res.status(404).json({ error: 'Deposit not found.' });
        return;
      }
      const remaining = deposit.amount - deposit.adjustedAmount - deposit.refundedAmount;
      if (remaining <= 0) {
        res.status(400).json({ error: 'No remaining held deposit balance to refund.' });
        return;
      }
      const refundAmount = Number(req.body?.amount || remaining);
      if (!Number.isFinite(refundAmount) || refundAmount <= 0 || refundAmount > remaining) {
        res.status(400).json({ error: 'Invalid refund amount.' });
        return;
      }

      deposit.refundedAmount += refundAmount;
      deposit.refundMode = (req.body?.refundMode || 'upi') as PaymentMode;
      deposit.refundDate = String(req.body?.refundDate || todayYmd());
      const ref = String(req.body?.referenceNote || 'Deposit refunded').trim();
      deposit.referenceNote = deposit.referenceNote
        ? `${deposit.referenceNote} | ${ref}`
        : ref;
      const afterRemaining = deposit.amount - deposit.adjustedAmount - deposit.refundedAmount;
      if (afterRemaining === 0) {
        deposit.status = 'refunded';
      }

      store.save();
      const gRef = db.guests.find((g) => g.id === deposit.guestId);
      emitAppNotification({
        tenantId,
        category: 'payment_alerts',
        eventType: 'deposit_updated',
        priority: 'normal',
        title: `Security Deposit Refunded: ₹${refundAmount.toLocaleString('en-IN')}`,
        message: `${gRef?.fullName || 'Resident'} refunded ₹${refundAmount.toLocaleString('en-IN')} (${deposit.status}).`,
        targetRoles: ['overall_admin', 'owner', 'warden'],
        targetTab: 'payments',
        targetId: deposit.id,
      });
      res.json({ deposit });
    }
  );

  // --- Expenses & Private Bill Attachments ---
  app.get('/api/expenses', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const category = String(req.query.category || 'all').trim();
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();
    const search = String(req.query.search || '').trim().toLowerCase();

    const filtered = store
      .getExpenses(tenantId)
      .filter((e) => {
        if (category !== 'all' && e.category !== category) return false;
        if (from && e.expenseDate < from) return false;
        if (to && e.expenseDate > to) return false;
        if (!search) return true;
        return (
          e.vendorName.toLowerCase().includes(search) ||
          e.note.toLowerCase().includes(search) ||
          e.category.toLowerCase().includes(search)
        );
      })
      .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));

    const totalFilteredAmount = filtered.reduce((sum, e) => sum + e.amount, 0);
    const defaultSize = req.query.page || req.query.pageSize ? 8 : 100;
    const paged = paginateItems(filtered, req.query.page, req.query.pageSize, defaultSize);

    res.json({
      expenses: paged.items,
      pagination: paged.pagination,
      totalFilteredAmount,
    });
  });

  app.post('/api/expenses', requireAuth, upload.single('attachment'), (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const user = req.sessionCtx!.user;
    const db = store.getRawState();

    const expenseDate = String(req.body?.expenseDate || todayYmd()).trim();
    const category = (req.body?.category || 'other') as ExpenseCategory;
    const amount = Number(req.body?.amount || 0);
    const paymentMode = (req.body?.paymentMode || 'upi') as PaymentMode;
    const vendorName = String(req.body?.vendorName || '').trim();
    const note = String(req.body?.note || '').trim();

    if (!Number.isFinite(amount) || amount <= 0 || !vendorName) {
      res.status(400).json({ error: 'Vendor/payee name and positive expense amount are required.' });
      return;
    }

    let attachmentObjectKey: string | null = null;
    if (req.file) {
      attachmentObjectKey = store.saveUploadedDocumentObject(
        tenantId,
        req.file.buffer,
        req.file.mimetype
      );
    }

    const expense: Expense = {
      id: `exp_${crypto.randomUUID().slice(0, 8)}`,
      tenantId,
      expenseDate,
      category,
      amount,
      paymentMode,
      vendorName,
      note,
      attachmentFileName: req.file ? path.basename(req.file.originalname) : null,
      attachmentMimeType: req.file ? req.file.mimetype : null,
      attachmentSizeBytes: req.file ? req.file.size : null,
      attachmentObjectKey,
      recordedByName: user.name,
      createdAt: new Date().toISOString(),
    };
    db.expenses.push(expense);
    store.save();
    if (category === 'repairs_maintenance') {
      emitAppNotification({
        tenantId,
        category: 'maintenance_alerts',
        eventType: 'maintenance_request',
        priority: 'normal',
        title: `Maintenance Expense Logged: ₹${amount.toLocaleString('en-IN')}`,
        message: `${vendorName}${note ? ` — ${note}` : ''} recorded by ${user.name}.`,
        targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
        targetTab: 'expenses',
        targetId: expense.id,
      });
    }
    res.status(201).json({ expense });
  });

  app.get('/api/expenses/:expenseId/attachment', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const expense = store
      .getExpenses(tenantId)
      .find((e) => e.id === req.params.expenseId);
    if (!expense || !expense.attachmentObjectKey) {
      res.status(404).json({ error: 'Expense attachment not found.' });
      return;
    }
    const buf = store.readDocumentObject(tenantId, expense.attachmentObjectKey);
    if (!buf) {
      res.status(404).json({ error: 'Attachment missing from private storage.' });
      return;
    }
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', expense.attachmentMimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${(expense.attachmentFileName || 'bill').replace(/"/g, '')}"`
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buf);
  });

  app.delete('/api/expenses/:expenseId', requireAuth, requireRole('owner', 'warden', 'overall_admin'), (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const idx = db.expenses.findIndex(
      (e) => e.id === req.params.expenseId && e.tenantId === tenantId
    );
    if (idx === -1) {
      res.status(404).json({ error: 'Expense not found.' });
      return;
    }
    const [removed] = db.expenses.splice(idx, 1);
    if (removed.attachmentObjectKey) {
      store.deleteDocumentObject(tenantId, removed.attachmentObjectKey);
    }
    store.save();
    res.json({ ok: true });
  });

  // --- Documents Vault (Authenticated Private Storage) ---
  app.get('/api/documents', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const docs = store.getDocuments(tenantId);
    const guests = store.getGuests(tenantId);
    const guestMap = new Map(guests.map((g) => [g.id, g]));

    const search = String(req.query.search || '').trim().toLowerCase();
    const idTypeFilter = String(req.query.idType || 'all').trim();
    const guestIdFilter = String(req.query.guestId || '').trim();

    const enriched: EnrichedDocument[] = docs
      .map((d) => {
        const g = guestMap.get(d.guestId);
        return {
          ...d,
          guestName: g?.fullName || 'Unknown Guest',
          guestIdMasked: g?.idMasked || null,
        };
      })
      .filter((d) => {
        if (guestIdFilter && d.guestId !== guestIdFilter) return false;
        if (idTypeFilter !== 'all' && d.idType !== idTypeFilter) return false;
        if (!search) return true;
        return (
          d.guestName.toLowerCase().includes(search) ||
          d.originalFileName.toLowerCase().includes(search) ||
          d.idType.toLowerCase().includes(search) ||
          (d.guestIdMasked && d.guestIdMasked.toLowerCase().includes(search))
        );
      })
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));

    const defaultSize = req.query.page || req.query.pageSize ? 8 : 100;
    const paged = paginateItems(
      enriched,
      req.query.page,
      req.query.pageSize,
      defaultSize
    );

    res.json({ documents: paged.items, pagination: paged.pagination });
  });

  app.post('/api/documents', requireAuth, upload.single('file'), (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const guestId = String(req.body?.guestId || '').trim();
    const docRole = (req.body?.docRole || 'additional_id') as DocumentRole;
    const idType = (req.body?.idType || 'aadhaar') as IdDocumentType;

    const guest = db.guests.find((g) => g.id === guestId && g.tenantId === tenantId);
    if (!guest) {
      res.status(404).json({ error: 'Guest not found in this workspace.' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Document file is required.' });
      return;
    }

    const objectKey = store.saveUploadedDocumentObject(
      tenantId,
      req.file.buffer,
      req.file.mimetype
    );
    const doc: IdentityDocument = {
      id: `doc_${crypto.randomUUID().slice(0, 8)}`,
      tenantId,
      guestId: guest.id,
      stayId: null,
      docRole,
      idType: idType === 'none' ? 'other' : idType,
      originalFileName: path.basename(req.file.originalname),
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      objectKey,
      uploadedAt: new Date().toISOString(),
    };
    db.documents.push(doc);
    store.save();
    res.status(201).json({ document: doc });
  });

  app.get('/api/documents/:docId/download', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const doc = store
      .getDocuments(tenantId)
      .find((d) => d.id === req.params.docId);

    if (!doc) {
      res.status(404).json({ error: 'Document not found or access denied.' });
      return;
    }

    const buf = store.readDocumentObject(tenantId, doc.objectKey);
    if (!buf) {
      res.status(404).json({ error: 'Document object missing from private storage.' });
      return;
    }

    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${doc.originalFileName.replace(/"/g, '')}"`
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buf);
  });

  app.delete('/api/documents/:docId', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const idx = db.documents.findIndex(
      (d) => d.id === req.params.docId && d.tenantId === tenantId
    );
    if (idx === -1) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    const [removed] = db.documents.splice(idx, 1);
    store.deleteDocumentObject(tenantId, removed.objectKey);
    store.save();
    res.json({ ok: true });
  });

  // --- Alternate / Emergency Contact Call Log ---
  app.post(
    '/api/guests/:guestId/verify-call',
    requireAuth,
    outboundActionLimiter,
    async (req, res) => {
      const tenant = req.sessionCtx!.tenant;
      const user = req.sessionCtx!.user;
      const db = store.getRawState();

      const guest = db.guests.find(
        (g) => g.id === req.params.guestId && g.tenantId === tenant.id
      );
      if (!guest) {
        res.status(404).json({ error: 'Guest not found.' });
        return;
      }

      const targetPhone = guest.alternativePhone || guest.emergencyContactPhone || guest.primaryPhone;
      const dispatch = await triggerVerificationCall(tenant, targetPhone);
      const attempt = {
        id: `call_${crypto.randomUUID().slice(0, 8)}`,
        tenantId: tenant.id,
        guestId: guest.id,
        targetPhoneMasked: maskPhone(targetPhone),
        initiatedByUserId: user.id,
        initiatedByName: user.name,
        provider: dispatch.provider,
        providerCallRef: dispatch.providerCallRef,
        outcome: 'initiated' as const,
        notes: String(req.body?.notes || dispatch.message),
        createdAt: new Date().toISOString(),
      };
      db.callAttempts.push(attempt);
      store.save();

      res.status(201).json({ attempt, message: dispatch.message });
    }
  );

  app.patch('/api/call-attempts/:attemptId', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const attempt = db.callAttempts.find(
      (c) => c.id === req.params.attemptId && c.tenantId === tenantId
    );
    if (!attempt) {
      res.status(404).json({ error: 'Call attempt not found.' });
      return;
    }

    const outcome = req.body?.outcome;
    if (
      outcome !== 'verified' &&
      outcome !== 'no_answer' &&
      outcome !== 'wrong_number' &&
      outcome !== 'busy'
    ) {
      res.status(400).json({ error: 'Invalid call outcome.' });
      return;
    }

    attempt.outcome = outcome;
    if (typeof req.body?.notes === 'string') {
      attempt.notes = req.body.notes.trim();
    }

    const guest = db.guests.find(
      (g) => g.id === attempt.guestId && g.tenantId === tenantId
    );
    if (guest) {
      guest.altPhoneVerified = outcome === 'verified' ? 'verified' : 'failed';
    }

    store.save();
    res.json({ attempt, guest });
  });

  // --- Reminders (Unpaid Charges & Upcoming/Overdue Checkouts) ---
  app.get('/api/reminders', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const statusFilter = String(req.query.status || 'all').trim();
    const typeFilter = String(req.query.type || 'all').trim();
    const channelFilter = String(req.query.channel || 'all').trim();
    const search = String(req.query.search || '').trim().toLowerCase();

    const filtered = store.getReminderLogs(tenantId).filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (channelFilter !== 'all' && r.channel !== channelFilter) return false;
      if (!search) return true;
      return (
        (r.guestName || '').toLowerCase().includes(search) ||
        (r.roomLabel || '').toLowerCase().includes(search) ||
        r.messagePreview.toLowerCase().includes(search)
      );
    });

    const defaultSize = req.query.page || req.query.pageSize ? 8 : 100;
    const paged = paginateItems(filtered, req.query.page, req.query.pageSize, defaultSize);
    res.json({ reminders: paged.items, pagination: paged.pagination });
  });

  app.post(
    '/api/reminders/schedule',
    requireAuth,
    outboundActionLimiter,
    async (req, res) => {
      const tenant = req.sessionCtx!.tenant;
      const user = req.sessionCtx!.user;
      const db = store.getRawState();

      const type = (req.body?.type || 'unpaid_charge') as ReminderType;
      const channel = (req.body?.channel || 'sms') as ReminderChannel;
      const stayId = String(req.body?.stayId || '').trim();
      const paymentId = String(req.body?.paymentId || '').trim();
      const scheduledFor = req.body?.scheduledFor ? String(req.body.scheduledFor) : null;
      const sendNow = req.body?.sendNow !== false && !scheduledFor;

      const stay = db.stays.find((s) => s.id === stayId && s.tenantId === tenant.id);
      if (!stay) {
        res.status(404).json({ error: 'Stay not found.' });
        return;
      }
      const guest = db.guests.find((g) => g.id === stay.guestId && g.tenantId === tenant.id);
      const room = db.rooms.find((r) => r.id === stay.roomId && r.tenantId === tenant.id);
      const bed = db.beds.find((b) => b.id === stay.bedId && b.tenantId === tenant.id);
      if (!guest) {
        res.status(404).json({ error: 'Guest not found.' });
        return;
      }

      const payment = paymentId
        ? db.payments.find((p) => p.id === paymentId && p.tenantId === tenant.id)
        : undefined;
      const outstanding = payment
        ? Math.max(0, payment.amount - (payment.paidAmount ?? 0))
        : 0;
      const roomLabel = room ? `${room.roomNumber}-${bed?.bedLabel || ''}` : '—';

      const customMsg = String(req.body?.message || '').trim();
      const rendered =
        customMsg ||
        renderReminderTemplate(
          type === 'unpaid_charge'
            ? tenant.settings.smsTemplate
            : tenant.settings.checkoutReminderTemplate,
          {
            amount: outstanding.toLocaleString('en-IN'),
            room: room?.roomNumber || '—',
            dueDate: payment?.dueDate || stay.expectedCheckoutDate,
            checkoutDate: stay.expectedCheckoutDate,
            guestName: guest.fullName,
            hostelName: tenant.name,
          }
        );

      const providerMode =
        channel === 'whatsapp'
          ? tenant.settings.whatsappProvider
          : channel === 'telephony'
            ? tenant.settings.telephonyProvider
            : tenant.settings.smsProvider;

      if (!sendNow) {
        const log: ReminderLog = {
          id: `rem_${crypto.randomUUID().slice(0, 8)}`,
          tenantId: tenant.id,
          stayId: stay.id,
          paymentId: payment?.id,
          guestId: guest.id,
          guestName: guest.fullName,
          roomLabel,
          type,
          channel,
          recipientMasked: maskPhone(guest.primaryPhone),
          messagePreview: rendered,
          provider: providerMode,
          status: 'scheduled',
          dueDate: payment?.dueDate || stay.expectedCheckoutDate,
          scheduledFor: scheduledFor || new Date(Date.now() + 3600_000).toISOString(),
          sentByName: user.name,
          createdAt: new Date().toISOString(),
        };
        db.reminderLogs.push(log);
        store.save();
        res.status(201).json({
          reminder: log,
          message: 'Reminder scheduled.',
        });
        return;
      }

      // Duplicate cooldown check
      const cooldownMs = tenant.settings.smsCooldownHours * 60 * 60 * 1000;
      const nowMs = Date.now();
      const recentSent = db.reminderLogs.find(
        (r) =>
          r.tenantId === tenant.id &&
          r.stayId === stay.id &&
          r.type === type &&
          (!paymentId || r.paymentId === paymentId) &&
          (r.status === 'sent' || r.status === 'mocked') &&
          nowMs - new Date(r.createdAt).getTime() < cooldownMs
      );

      if (recentSent) {
        const blocked: ReminderLog = {
          id: `rem_${crypto.randomUUID().slice(0, 8)}`,
          tenantId: tenant.id,
          stayId: stay.id,
          paymentId: payment?.id,
          guestId: guest.id,
          guestName: guest.fullName,
          roomLabel,
          type,
          channel,
          recipientMasked: maskPhone(guest.primaryPhone),
          messagePreview: rendered,
          provider: providerMode,
          status: 'blocked_duplicate',
          dueDate: payment?.dueDate || stay.expectedCheckoutDate,
          attemptedAt: new Date().toISOString(),
          errorReason: `Duplicate prevented within ${tenant.settings.smsCooldownHours}h cooldown window.`,
          sentByName: user.name,
          createdAt: new Date().toISOString(),
        };
        db.reminderLogs.push(blocked);
        store.save();
        res.status(409).json({
          error: `Duplicate reminder prevented within the ${tenant.settings.smsCooldownHours}-hour cooldown window.`,
          reminder: blocked,
        });
        return;
      }

      const dispatch = await dispatchReminder(channel, tenant, guest.primaryPhone, rendered);
      const log: ReminderLog = {
        id: `rem_${crypto.randomUUID().slice(0, 8)}`,
        tenantId: tenant.id,
        stayId: stay.id,
        paymentId: payment?.id,
        guestId: guest.id,
        guestName: guest.fullName,
        roomLabel,
        type,
        channel,
        recipientMasked: maskPhone(guest.primaryPhone),
        messagePreview: rendered,
        provider: dispatch.provider,
        status: dispatch.status,
        dueDate: payment?.dueDate || stay.expectedCheckoutDate,
        attemptedAt: new Date().toISOString(),
        errorReason: dispatch.status === 'disabled' ? dispatch.message : null,
        sentByName: user.name,
        createdAt: new Date().toISOString(),
      };
      db.reminderLogs.push(log);
      store.save();

      if (dispatch.status === 'disabled') {
        res.status(400).json({ error: dispatch.message, reminder: log });
        return;
      }

      res.status(201).json({ reminder: log, message: dispatch.message });
    }
  );

  app.post(
    '/api/reminders/:reminderId/send',
    requireAuth,
    outboundActionLimiter,
    async (req, res) => {
      const tenant = req.sessionCtx!.tenant;
      const db = store.getRawState();
      const rem = db.reminderLogs.find(
        (r) => r.id === req.params.reminderId && r.tenantId === tenant.id
      );
      if (!rem) {
        res.status(404).json({ error: 'Reminder not found.' });
        return;
      }
      if (rem.status === 'cancelled') {
        res.status(400).json({ error: 'Cannot send a cancelled reminder.' });
        return;
      }
      const guest = db.guests.find((g) => g.id === rem.guestId && g.tenantId === tenant.id);
      const dispatch = await dispatchReminder(
        rem.channel,
        tenant,
        guest?.primaryPhone || '',
        rem.messagePreview
      );
      rem.provider = dispatch.provider;
      rem.status = dispatch.status;
      rem.attemptedAt = new Date().toISOString();
      rem.errorReason = dispatch.status === 'disabled' ? dispatch.message : null;
      store.save();

      if (dispatch.status === 'disabled') {
        res.status(400).json({ error: dispatch.message, reminder: rem });
        return;
      }
      res.json({ reminder: rem, message: dispatch.message });
    }
  );

  app.post('/api/reminders/:reminderId/cancel', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const db = store.getRawState();
    const rem = db.reminderLogs.find(
      (r) => r.id === req.params.reminderId && r.tenantId === tenantId
    );
    if (!rem) {
      res.status(404).json({ error: 'Reminder not found.' });
      return;
    }
    rem.status = 'cancelled';
    store.save();
    res.json({ reminder: rem });
  });

  app.post(
    '/api/payments/:paymentId/remind-sms',
    requireAuth,
    outboundActionLimiter,
    async (req, res) => {
      const tenant = req.sessionCtx!.tenant;
      const user = req.sessionCtx!.user;
      const db = store.getRawState();

      const payment = db.payments.find(
        (p) => p.id === req.params.paymentId && p.tenantId === tenant.id
      );
      if (!payment) {
        res.status(404).json({ error: 'Payment record not found.' });
        return;
      }
      const paidAmt = payment.paidAmount ?? (payment.status === 'paid' ? payment.amount : 0);
      if (paidAmt >= payment.amount || payment.status === 'refunded') {
        res.status(400).json({ error: 'Payment has no remaining balance.' });
        return;
      }

      const guest = db.guests.find(
        (g) => g.id === payment.guestId && g.tenantId === tenant.id
      );
      const stay = db.stays.find(
        (s) => s.id === payment.stayId && s.tenantId === tenant.id
      );
      const room = stay
        ? db.rooms.find((r) => r.id === stay.roomId && r.tenantId === tenant.id)
        : undefined;
      const bed = stay
        ? db.beds.find((b) => b.id === stay.bedId && b.tenantId === tenant.id)
        : undefined;

      if (!guest) {
        res.status(404).json({ error: 'Guest not found.' });
        return;
      }

      const cooldownMs = tenant.settings.smsCooldownHours * 60 * 60 * 1000;
      const nowMs = Date.now();
      const recentSent = db.reminderLogs.find(
        (r) =>
          r.tenantId === tenant.id &&
          r.paymentId === payment.id &&
          (r.status === 'sent' || r.status === 'mocked') &&
          nowMs - new Date(r.createdAt).getTime() < cooldownMs
      );

      const outstanding = Math.max(0, payment.amount - paidAmt);
      const rendered = renderReminderTemplate(tenant.settings.smsTemplate, {
        amount: outstanding.toLocaleString('en-IN'),
        room: room?.roomNumber || '—',
        dueDate: payment.dueDate,
        guestName: guest.fullName,
        hostelName: tenant.name,
      });

      const roomLabel = room ? `${room.roomNumber}-${bed?.bedLabel || ''}` : '—';

      if (recentSent) {
        const blockedLog: ReminderLog = {
          id: `rem_${crypto.randomUUID().slice(0, 8)}`,
          tenantId: tenant.id,
          stayId: payment.stayId,
          paymentId: payment.id,
          guestId: guest.id,
          guestName: guest.fullName,
          roomLabel,
          type: 'unpaid_charge',
          channel: 'sms',
          recipientMasked: maskPhone(guest.primaryPhone),
          messagePreview: rendered,
          provider: tenant.settings.smsProvider,
          status: 'blocked_duplicate',
          dueDate: payment.dueDate,
          attemptedAt: new Date().toISOString(),
          errorReason: `Duplicate prevented within ${tenant.settings.smsCooldownHours}h cooldown window.`,
          sentByName: user.name,
          createdAt: new Date().toISOString(),
        };
        db.reminderLogs.push(blockedLog);
        store.save();

        res.status(409).json({
          error: `Duplicate reminder prevented: an SMS was already sent within the ${tenant.settings.smsCooldownHours}-hour cooldown window.`,
          log: blockedLog,
        });
        return;
      }

      const dispatch = await dispatchReminder(
        'sms',
        tenant,
        guest.primaryPhone,
        rendered
      );

      const log: ReminderLog = {
        id: `rem_${crypto.randomUUID().slice(0, 8)}`,
        tenantId: tenant.id,
        stayId: payment.stayId,
        paymentId: payment.id,
        guestId: guest.id,
        guestName: guest.fullName,
        roomLabel,
        type: 'unpaid_charge',
        channel: 'sms',
        recipientMasked: maskPhone(guest.primaryPhone),
        messagePreview: rendered,
        provider: dispatch.provider,
        status: dispatch.status,
        dueDate: payment.dueDate,
        attemptedAt: new Date().toISOString(),
        errorReason: dispatch.status === 'disabled' ? dispatch.message : null,
        sentByName: user.name,
        createdAt: new Date().toISOString(),
      };
      db.reminderLogs.push(log);
      store.save();

      if (dispatch.status === 'disabled') {
        res.status(400).json({ error: dispatch.message, log });
        return;
      }

      res.status(201).json({ log, message: dispatch.message });
    }
  );

  // --- Reports ---
  app.get('/api/reports', requireAuth, (req, res) => {
    const tenantId = req.sessionCtx!.tenant.id;
    const from = String(req.query.from || daysAgoYmd(90)).trim();
    const to = String(req.query.to || todayYmd()).trim();

    const rooms = store.getRooms(tenantId);
    const beds = enrichBeds(tenantId);
    const stays = enrichStays(tenantId);
    const payments = enrichPayments(tenantId);
    const deposits = enrichDeposits(tenantId);
    const expenses = store.getExpenses(tenantId);

    const occupiedBeds = beds.filter((b) => b.status === 'occupied').length;
    const vacantBeds = beds.filter((b) => b.status === 'vacant').length;
    const maintenanceBeds = beds.filter((b) => b.status === 'maintenance').length;
    const totalBeds = beds.length;
    const occupancyPercent = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    const byRoom = rooms.map((r) => {
      const rBeds = beds.filter((b) => b.roomId === r.id);
      return {
        roomNumber: r.roomNumber,
        floor: r.floor,
        roomType: r.roomType,
        capacity: r.capacity || rBeds.length,
        occupied: rBeds.filter((b) => b.status === 'occupied').length,
        vacant: rBeds.filter((b) => b.status === 'vacant').length,
        maintenance: rBeds.filter((b) => b.status === 'maintenance').length,
        monthlyTariff: r.monthlyTariff,
      };
    });

    const activeAndOverdueStays = stays.filter(
      (s) => s.status === 'active' || s.status === 'overdue'
    );
    const upcomingCheckoutsCount = activeAndOverdueStays.filter((s) =>
      isWithinNextDays(s.expectedCheckoutDate, 7)
    ).length;
    const overdueStaysCount = activeAndOverdueStays.filter((s) => s.status === 'overdue').length;

    const rangePayments = payments.filter((p) => {
      const refDate = p.paymentDate || p.dueDate;
      return refDate >= from && refDate <= to;
    });
    const byMode: Record<PaymentMode, number> = { cash: 0, upi: 0, bank_transfer: 0 };
    let collectedTotal = 0;
    let refundedTotal = 0;
    for (const p of rangePayments) {
      if (p.status === 'refunded') {
        refundedTotal += p.refundedAmount ?? p.paidAmount;
      } else if (p.paidAmount > 0) {
        collectedTotal += p.paidAmount;
        if (p.paymentMode) byMode[p.paymentMode] += p.paidAmount;
      }
    }
    const outstandingRows = payments.filter((p) => p.outstandingAmount > 0);
    const outstandingTotal = outstandingRows.reduce((sum, p) => sum + p.outstandingAmount, 0);

    const rangeExpenses = expenses
      .filter((e) => e.expenseDate >= from && e.expenseDate <= to)
      .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));

    const categoryMap = new Map<ExpenseCategory, { count: number; total: number }>([
      ['utilities', { count: 0, total: 0 }],
      ['repairs_maintenance', { count: 0, total: 0 }],
      ['supplies', { count: 0, total: 0 }],
      ['food', { count: 0, total: 0 }],
      ['other', { count: 0, total: 0 }],
    ]);
    for (const exp of rangeExpenses) {
      const entry = categoryMap.get(exp.category) || { count: 0, total: 0 };
      entry.count += 1;
      entry.total += exp.amount;
      categoryMap.set(exp.category, entry);
    }

    const monthlyMap = new Map<string, { income: number; expenses: number }>();
    for (const p of rangePayments) {
      if (p.status !== 'refunded' && p.paidAmount > 0 && p.paymentDate) {
        const m = p.paymentDate.slice(0, 7);
        const cur = monthlyMap.get(m) || { income: 0, expenses: 0 };
        cur.income += p.paidAmount;
        monthlyMap.set(m, cur);
      }
    }
    for (const exp of rangeExpenses) {
      const m = exp.expenseDate.slice(0, 7);
      const cur = monthlyMap.get(m) || { income: 0, expenses: 0 };
      cur.expenses += exp.amount;
      monthlyMap.set(m, cur);
    }

    const monthlyIncomeVsExpense = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, v]) => ({
        month,
        income: v.income,
        expenses: v.expenses,
        net: v.income - v.expenses,
      }));

    const payload: ReportsPayload = {
      from,
      to,
      occupancySummary: {
        totalRooms: rooms.length,
        totalBeds,
        occupiedBeds,
        vacantBeds,
        maintenanceBeds,
        occupancyPercent,
        byRoom,
      },
      residentsAndCheckouts: {
        currentResidentsCount: activeAndOverdueStays.length,
        upcomingCheckoutsCount,
        overdueStaysCount,
        rows: activeAndOverdueStays.map((s) => ({
          stayId: s.id,
          guestName: s.guestName,
          guestPhone: s.guestPhone,
          roomLabel: `${s.roomNumber}-${s.bedLabel}`,
          status: s.status,
          checkInAt: s.checkInAt,
          expectedCheckoutDate: s.expectedCheckoutDate,
          balanceDue: s.balanceDue,
        })),
      },
      collectionsAndOutstanding: {
        collectedTotal,
        outstandingTotal,
        refundedTotal,
        byMode,
        outstandingRows,
      },
      depositsSummary: {
        totalCollected: deposits.reduce((s, d) => s + d.amount, 0),
        totalHeld: deposits.reduce((s, d) => s + d.remainingHeld, 0),
        totalAdjusted: deposits.reduce((s, d) => s + d.adjustedAmount, 0),
        totalRefunded: deposits.reduce((s, d) => s + d.refundedAmount, 0),
        rows: deposits,
      },
      expensesByCategory: {
        totalExpenses: rangeExpenses.reduce((s, e) => s + e.amount, 0),
        categories: Array.from(categoryMap.entries()).map(([category, v]) => ({
          category,
          count: v.count,
          total: v.total,
        })),
        rows: rangeExpenses,
      },
      monthlyIncomeVsExpense,
    };

    res.json(payload);
  });

  // --- Settings ---
  app.patch(
    '/api/settings',
    requireAuth,
    requireRole('owner', 'warden', 'overall_admin'),
    (req, res) => {
      const tenantId = req.sessionCtx!.tenant.id;
      const db = store.getRawState();
      const tenant = db.tenants.find((t) => t.id === tenantId);
      if (!tenant) {
        res.status(404).json({ error: 'Workspace not found.' });
        return;
      }

      if (typeof req.body?.name === 'string' && req.body.name.trim()) {
        tenant.name = req.body.name.trim();
      }
      if (typeof req.body?.city === 'string') tenant.city = req.body.city.trim();
      if (typeof req.body?.district === 'string') tenant.district = req.body.district.trim();
      if (typeof req.body?.locality === 'string') tenant.locality = req.body.locality.trim();
      if (typeof req.body?.pincode === 'string') tenant.pincode = req.body.pincode.trim();
      if (typeof req.body?.landmark === 'string') tenant.landmark = req.body.landmark.trim();
      if (typeof req.body?.address === 'string') tenant.address = req.body.address.trim();
      if (typeof req.body?.wardenPhone === 'string') tenant.wardenPhone = req.body.wardenPhone.trim();
      if (typeof req.body?.gstinOrReg === 'string') tenant.gstinOrReg = req.body.gstinOrReg.trim();
      if (typeof req.body?.timezone === 'string' && req.body.timezone.trim()) {
        tenant.timezone = req.body.timezone.trim();
      }
      if (req.body?.preferredLanguage === 'en' || req.body?.preferredLanguage === 'ta') {
        tenant.preferredLanguage = req.body.preferredLanguage;
      }
      if (typeof req.body?.houseRules === 'string') tenant.houseRules = req.body.houseRules;
      if (typeof req.body?.receiptPrefix === 'string') {
        tenant.receiptPrefix = req.body.receiptPrefix.trim().toUpperCase();
      }
      if (typeof req.body?.agreementNotes === 'string') {
        tenant.agreementNotes = req.body.agreementNotes;
      }

      const s = req.body?.settings;
      if (s && typeof s === 'object') {
        if (
          s.smsProvider === 'disabled' ||
          s.smsProvider === 'mock' ||
          s.smsProvider === 'configured'
        ) {
          tenant.settings.smsProvider = s.smsProvider;
        }
        if (
          s.whatsappProvider === 'disabled' ||
          s.whatsappProvider === 'mock' ||
          s.whatsappProvider === 'configured'
        ) {
          tenant.settings.whatsappProvider = s.whatsappProvider;
        }
        if (
          s.telephonyProvider === 'disabled' ||
          s.telephonyProvider === 'mock' ||
          s.telephonyProvider === 'configured'
        ) {
          tenant.settings.telephonyProvider = s.telephonyProvider;
        }
        if (typeof s.smsCooldownHours === 'number' && s.smsCooldownHours >= 1) {
          tenant.settings.smsCooldownHours = Math.min(168, Math.round(s.smsCooldownHours));
        }
        if (typeof s.reminderLeadDays === 'number' && s.reminderLeadDays >= 0) {
          tenant.settings.reminderLeadDays = Math.min(14, Math.round(s.reminderLeadDays));
        }
        if (typeof s.smsTemplate === 'string' && s.smsTemplate.trim()) {
          tenant.settings.smsTemplate = s.smsTemplate.trim();
        }
        if (
          typeof s.checkoutReminderTemplate === 'string' &&
          s.checkoutReminderTemplate.trim()
        ) {
          tenant.settings.checkoutReminderTemplate = s.checkoutReminderTemplate.trim();
        }
        if (typeof s.unpaidReminderEnabled === 'boolean') {
          tenant.settings.unpaidReminderEnabled = s.unpaidReminderEnabled;
        }
        if (typeof s.checkoutReminderEnabled === 'boolean') {
          tenant.settings.checkoutReminderEnabled = s.checkoutReminderEnabled;
        }
        if (typeof s.requireIdDocument === 'boolean') {
          tenant.settings.requireIdDocument = s.requireIdDocument;
        }
      }

      store.save();
      res.json({ tenant });
    }
  );

  app.post('/api/sample-data/reset', requireAuth, (req, res) => {
    const currentTenant = req.sessionCtx!.tenant;
    if (!currentTenant.isSample) {
      res.status(403).json({ error: 'Sample data reset is only available in sample workspaces.' });
      return;
    }
    store.resetSampleData();
    syncDateBasedRentNotifications({ broadcast: true });
    const refreshedTenant = store.getTenantById(currentTenant.id) || currentTenant;
    res.json({ ok: true, tenant: refreshedTenant });
  });

  // --- Notification System, Preferences, Complaints, Maintenance, Visitors & Announcements ---
  app.get('/api/notifications', requireAuth, (req, res) => {
    syncDateBasedRentNotifications({ broadcast: false });
    const user = req.sessionCtx!.user;
    const category = String(req.query.category || 'all').trim() as NotificationFilterCategory;
    const status = String(req.query.status || 'all').trim() as 'all' | 'unread' | 'read';
    const search = String(req.query.search || '').trim();
    const includeMuted = req.query.includeMuted === '1';

    const payload = buildUserNotificationsPayload(user, {
      category,
      status,
      search,
      includeMuted,
    });
    res.json(payload);
  });

  app.post('/api/notifications/sync-rent', requireAuth, (_req, res) => {
    const created = syncDateBasedRentNotifications({ broadcast: true });
    res.json({ ok: true, createdCount: created });
  });

  app.post('/api/notifications/:id/read', requireAuth, (req, res) => {
    const user = req.sessionCtx!.user;
    const notifications = store.getNotifications();
    const notif = notifications.find((n) => n.id === req.params.id);
    if (!notif) {
      res.status(404).json({ error: 'Notification not found.' });
      return;
    }
    const owned = getOwnedTenantIdsForUser(user);
    const policy = store.getNotificationPolicy();
    const prefs = store.getUserNotificationPreferences(user.id);
    if (!canUserAccessNotification(user, owned, notif, policy, prefs, false)) {
      res.status(403).json({ error: 'Access denied to this notification.' });
      return;
    }
    if (!notif.readByUserIds.includes(user.id)) {
      notif.readByUserIds.push(user.id);
      store.save();
      broadcastReadState(user.id, [notif.id]);
    }
    res.json({ ok: true, id: notif.id });
  });

  app.post('/api/notifications/read-all', requireAuth, (req, res) => {
    const user = req.sessionCtx!.user;
    const category = String(req.body?.category || 'all').trim() as NotificationFilterCategory;
    const owned = getOwnedTenantIdsForUser(user);
    const policy = store.getNotificationPolicy();
    const prefs = store.getUserNotificationPreferences(user.id);
    const notifications = store.getNotifications();

    const updatedIds: string[] = [];
    for (const notif of notifications) {
      if (!canUserAccessNotification(user, owned, notif, policy, prefs, false)) continue;
      if (category !== 'all' && notif.category !== category) continue;
      if (!notif.readByUserIds.includes(user.id)) {
        notif.readByUserIds.push(user.id);
        updatedIds.push(notif.id);
      }
    }
    if (updatedIds.length > 0) {
      store.save();
      broadcastReadState(user.id, category === 'all' ? 'all' : updatedIds);
    }
    res.json({ ok: true, markedCount: updatedIds.length });
  });

  app.get('/api/notifications/settings', requireAuth, (req, res) => {
    const user = req.sessionCtx!.user;
    res.json({
      policy: store.getNotificationPolicy(),
      preferences: store.getUserNotificationPreferences(user.id),
    });
  });

  app.patch(
    '/api/notifications/settings/admin',
    requireAuth,
    requireRole('overall_admin'),
    (req, res) => {
      const user = req.sessionCtx!.user;
      const policy = store.getNotificationPolicy();
      const body = req.body || {};

      if (typeof body.rentRemindersEnabled === 'boolean') {
        policy.rentRemindersEnabled = body.rentRemindersEnabled;
      }
      if (typeof body.overdueAlertsEnabled === 'boolean') {
        policy.overdueAlertsEnabled = body.overdueAlertsEnabled;
      }
      if (typeof body.paymentAlertsEnabled === 'boolean') {
        policy.paymentAlertsEnabled = body.paymentAlertsEnabled;
      }
      if (typeof body.residentUpdatesEnabled === 'boolean') {
        policy.residentUpdatesEnabled = body.residentUpdatesEnabled;
      }
      if (typeof body.complaintsEnabled === 'boolean') {
        policy.complaintsEnabled = body.complaintsEnabled;
      }
      if (typeof body.maintenanceAlertsEnabled === 'boolean') {
        policy.maintenanceAlertsEnabled = body.maintenanceAlertsEnabled;
      }
      if (typeof body.systemAlertsEnabled === 'boolean') {
        policy.systemAlertsEnabled = body.systemAlertsEnabled;
      }
      policy.updatedAt = new Date().toISOString();
      policy.updatedBy = user.name;
      store.save();
      broadcastPolicyOrSync();
      res.json({ policy });
    }
  );

  app.patch('/api/notifications/settings/preferences', requireAuth, (req, res) => {
    const user = req.sessionCtx!.user;
    const db = store.getRawState();
    const prefs = store.getUserNotificationPreferences(user.id);
    const categories = req.body?.categories;
    const keys: NotificationCategory[] = [
      'rent_reminders',
      'payment_alerts',
      'resident_updates',
      'complaints',
      'maintenance_alerts',
      'system_alerts',
    ];
    if (categories && typeof categories === 'object') {
      for (const k of keys) {
        if (typeof categories[k] === 'boolean') {
          prefs.categories[k] = categories[k];
        }
      }
    }
    if (typeof req.body?.realTimeSound === 'boolean') {
      prefs.realTimeSound = req.body.realTimeSound;
    }
    prefs.updatedAt = new Date().toISOString();
    if (!db.userNotificationPreferences) {
      db.userNotificationPreferences = {};
    }
    db.userNotificationPreferences[user.id] = prefs;
    store.save();
    res.json({ preferences: prefs });
  });

  // Complaints
  app.get('/api/complaints', requireAuth, (req, res) => {
    const user = req.sessionCtx!.user;
    const tenantId = req.sessionCtx!.tenant.id;
    const owned = getOwnedTenantIdsForUser(user);
    const items =
      user.role === 'overall_admin'
        ? store.getComplaints()
        : user.role === 'owner'
          ? store.getComplaints().filter((c) => owned.has(c.tenantId))
          : store.getComplaints(tenantId);
    res.json({ complaints: items });
  });

  app.post('/api/complaints', requireAuth, (req, res) => {
    const user = req.sessionCtx!.user;
    const tenant = req.sessionCtx!.tenant;
    const db = store.getRawState();
    const targetTenantId =
      user.role === 'overall_admin' && req.body?.tenantId
        ? String(req.body.tenantId).trim()
        : tenant.id;
    const targetTenant = db.tenants.find((t) => t.id === targetTenantId) || tenant;

    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const guestName = String(req.body?.guestName || 'Resident').trim();
    const roomLabel = String(req.body?.roomLabel || 'General').trim();
    const priority =
      req.body?.priority === 'high' || req.body?.priority === 'low' ? req.body.priority : 'medium';
    const assignedToUserId = String(req.body?.assignedToUserId || '').trim() || null;

    if (!title) {
      res.status(400).json({ error: 'Complaint title is required.' });
      return;
    }

    const assignedWarden = assignedToUserId
      ? db.users.find((u) => u.id === assignedToUserId)
      : db.users.find((u) => u.tenantId === targetTenant.id && u.role === 'warden');

    const now = new Date().toISOString();
    const record: ComplaintRecord = {
      id: `cmp_${crypto.randomUUID().slice(0, 8)}`,
      tenantId: targetTenant.id,
      guestId: req.body?.guestId ? String(req.body.guestId) : null,
      guestName,
      roomLabel,
      title,
      description,
      priority,
      status: 'open',
      assignedToUserId: assignedWarden?.id || null,
      assignedToName: assignedWarden?.name,
      createdByName: user.name,
      createdAt: now,
      updatedAt: now,
    };

    if (!db.complaints) db.complaints = [];
    db.complaints.unshift(record);
    store.save();

    emitAppNotification({
      tenantId: targetTenant.id,
      tenantName: targetTenant.name,
      category: 'complaints',
      eventType: 'complaint_created',
      priority: priority === 'high' ? 'urgent' : 'high',
      title: `New Complaint: ${title}`,
      message: `${guestName} (${roomLabel}) · ${description || title}${assignedWarden ? ` · Assigned to ${assignedWarden.name}` : ''}`,
      targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
      assignedUserId: assignedWarden?.id || null,
      targetTab: 'dashboard',
      targetId: record.id,
    });

    res.status(201).json({ complaint: record });
  });

  app.patch('/api/complaints/:id', requireAuth, (req, res) => {
    const user = req.sessionCtx!.user;
    const db = store.getRawState();
    const record = (db.complaints || []).find((c) => c.id === req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }
    const owned = getOwnedTenantIdsForUser(user);
    if (user.role !== 'overall_admin' && !owned.has(record.tenantId)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    const nextStatus = req.body?.status;
    if (nextStatus === 'open' || nextStatus === 'in_progress' || nextStatus === 'resolved') {
      record.status = nextStatus;
      record.updatedAt = new Date().toISOString();
      store.save();
      emitAppNotification({
        tenantId: record.tenantId,
        category: 'complaints',
        eventType: 'complaint_updated',
        priority: 'normal',
        title: `Complaint ${nextStatus.replace('_', ' ')}: ${record.title}`,
        message: `${record.guestName} (${record.roomLabel}) marked ${nextStatus.replace('_', ' ')} by ${user.name}.`,
        targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
        targetTab: 'dashboard',
        targetId: record.id,
      });
    }
    res.json({ complaint: record });
  });

  app.delete('/api/complaints/:id', requireAuth, requireRole('owner', 'overall_admin'), (req, res) => {
    const user = req.sessionCtx!.user;
    const db = store.getRawState();
    const list = db.complaints || [];
    const idx = list.findIndex((c) => c.id === req.params.id);
    if (idx === -1) {
      res.status(404).json({ error: 'Complaint not found.' });
      return;
    }
    const owned = getOwnedTenantIdsForUser(user);
    if (user.role !== 'overall_admin' && !owned.has(list[idx].tenantId)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    list.splice(idx, 1);
    store.save();
    res.json({ ok: true });
  });

  // Maintenance Requests
  app.get('/api/maintenance', requireAuth, (req, res) => {
    const user = req.sessionCtx!.user;
    const tenantId = req.sessionCtx!.tenant.id;
    const owned = getOwnedTenantIdsForUser(user);
    const items =
      user.role === 'overall_admin'
        ? store.getMaintenanceRequests()
        : user.role === 'owner'
          ? store.getMaintenanceRequests().filter((m) => owned.has(m.tenantId))
          : store.getMaintenanceRequests(tenantId);
    res.json({ maintenanceRequests: items });
  });

  app.post('/api/maintenance', requireAuth, (req, res) => {
    const user = req.sessionCtx!.user;
    const tenant = req.sessionCtx!.tenant;
    const db = store.getRawState();
    const targetTenantId =
      user.role === 'overall_admin' && req.body?.tenantId
        ? String(req.body.tenantId).trim()
        : tenant.id;
    const targetTenant = db.tenants.find((t) => t.id === targetTenantId) || tenant;

    const title = String(req.body?.title || '').trim();
    const description = String(req.body?.description || '').trim();
    const roomLabel = String(req.body?.roomLabel || 'Common Area').trim();
    const priority =
      req.body?.priority === 'high' || req.body?.priority === 'low' ? req.body.priority : 'medium';

    if (!title) {
      res.status(400).json({ error: 'Maintenance issue title is required.' });
      return;
    }

    const now = new Date().toISOString();
    const record: MaintenanceRequestRecord = {
      id: `mnt_${crypto.randomUUID().slice(0, 8)}`,
      tenantId: targetTenant.id,
      roomId: req.body?.roomId ? String(req.body.roomId) : null,
      bedId: req.body?.bedId ? String(req.body.bedId) : null,
      roomLabel,
      title,
      description,
      priority,
      status: 'open',
      reportedByName: user.name,
      createdAt: now,
      updatedAt: now,
    };

    if (!db.maintenanceRequests) db.maintenanceRequests = [];
    db.maintenanceRequests.unshift(record);
    store.save();

    emitAppNotification({
      tenantId: targetTenant.id,
      tenantName: targetTenant.name,
      category: 'maintenance_alerts',
      eventType: 'maintenance_request',
      priority: priority === 'high' ? 'urgent' : 'high',
      title: `Maintenance Request: ${title}`,
      message: `${roomLabel} at ${targetTenant.name} · ${description || title} (Reported by ${user.name}).`,
      targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
      targetTab: 'rooms',
      targetId: record.id,
    });

    res.status(201).json({ maintenanceRequest: record });
  });

  app.patch('/api/maintenance/:id', requireAuth, (req, res) => {
    const user = req.sessionCtx!.user;
    const db = store.getRawState();
    const record = (db.maintenanceRequests || []).find((m) => m.id === req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Maintenance request not found.' });
      return;
    }
    const owned = getOwnedTenantIdsForUser(user);
    if (user.role !== 'overall_admin' && !owned.has(record.tenantId)) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
    const nextStatus = req.body?.status;
    if (nextStatus === 'open' || nextStatus === 'in_progress' || nextStatus === 'completed') {
      record.status = nextStatus;
      record.updatedAt = new Date().toISOString();
      store.save();
      emitAppNotification({
        tenantId: record.tenantId,
        category: 'maintenance_alerts',
        eventType: 'maintenance_request',
        priority: 'normal',
        title: `Maintenance ${nextStatus.replace('_', ' ')}: ${record.title}`,
        message: `${record.roomLabel} updated to ${nextStatus.replace('_', ' ')} by ${user.name}.`,
        targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
        targetTab: 'rooms',
        targetId: record.id,
      });
    }
    res.json({ maintenanceRequest: record });
  });

  // Visitor Entries
  app.get('/api/visitors', requireAuth, (req, res) => {
    const user = req.sessionCtx!.user;
    const tenantId = req.sessionCtx!.tenant.id;
    const owned = getOwnedTenantIdsForUser(user);
    const items =
      user.role === 'overall_admin'
        ? store.getVisitorEntries()
        : user.role === 'owner'
          ? store.getVisitorEntries().filter((v) => owned.has(v.tenantId))
          : store.getVisitorEntries(tenantId);
    res.json({ visitors: items });
  });

  app.post('/api/visitors', requireAuth, (req, res) => {
    const user = req.sessionCtx!.user;
    const tenant = req.sessionCtx!.tenant;
    const db = store.getRawState();

    const visitorName = String(req.body?.visitorName || '').trim();
    const visitorPhone = String(req.body?.visitorPhone || '').trim();
    const guestName = String(req.body?.guestName || '').trim();
    const roomLabel = String(req.body?.roomLabel || 'Reception').trim();
    const relation = String(req.body?.relation || 'Visitor').trim();
    const purpose = String(req.body?.purpose || 'Guest Visit').trim();

    if (!visitorName || !guestName) {
      res.status(400).json({ error: 'Visitor name and resident name are required.' });
      return;
    }

    const record: VisitorEntryRecord = {
      id: `vis_${crypto.randomUUID().slice(0, 8)}`,
      tenantId: tenant.id,
      guestId: req.body?.guestId ? String(req.body.guestId) : null,
      guestName,
      roomLabel,
      visitorName,
      visitorPhone,
      relation,
      purpose,
      entryAt: new Date().toISOString(),
      createdByName: user.name,
    };
    if (!db.visitorEntries) db.visitorEntries = [];
    db.visitorEntries.unshift(record);
    store.save();

    emitAppNotification({
      tenantId: tenant.id,
      tenantName: tenant.name,
      category: 'resident_updates',
      eventType: 'visitor_entry',
      priority: 'normal',
      title: `Visitor Entry: ${visitorName}`,
      message: `${visitorName} (${relation}) visiting ${guestName} (${roomLabel}) — ${purpose}.`,
      targetRoles: ['owner', 'warden', 'staff'],
      targetTab: 'guests',
      targetId: record.id,
    });

    res.status(201).json({ visitor: record });
  });

  // Admin & Owner Announcements
  app.get('/api/announcements', requireAuth, (req, res) => {
    const user = req.sessionCtx!.user;
    const db = store.getRawState();
    const owned = getOwnedTenantIdsForUser(user);
    const items = store.getAnnouncements().filter((a) => {
      if (user.role === 'overall_admin') return true;
      if (a.tenantId === 'all') {
        const creator = db.users.find((u) => u.id === a.createdByUserId);
        if (!creator || creator.role === 'overall_admin') return true;
        if (user.role === 'owner') return creator.id === user.id;
        const activeTenant = store.getTenantById(user.tenantId);
        return Boolean(activeTenant && activeTenant.ownerId === creator.id);
      }
      if (user.role === 'owner') return owned.has(a.tenantId);
      return a.tenantId === user.tenantId;
    });
    res.json({ announcements: items });
  });

  app.post(
    '/api/announcements',
    requireAuth,
    requireRole('overall_admin', 'owner'),
    (req, res) => {
      const user = req.sessionCtx!.user;
      const db = store.getRawState();
      const title = String(req.body?.title || '').trim();
      const message = String(req.body?.message || '').trim();
      const targetTenantId = String(req.body?.tenantId || 'all').trim();
      const priority = req.body?.priority === 'urgent' ? 'urgent' : 'normal';

      if (!title || !message) {
        res.status(400).json({ error: 'Announcement title and message are required.' });
        return;
      }

      const owned = getOwnedTenantIdsForUser(user);
      if (user.role === 'owner' && targetTenantId !== 'all' && !owned.has(targetTenantId)) {
        res.status(403).json({ error: 'Cannot announce to a property you do not own.' });
        return;
      }

      const targetTenant =
        targetTenantId === 'all'
          ? null
          : db.tenants.find((t) => t.id === targetTenantId) || null;

      const record: AdminAnnouncementRecord = {
        id: `ann_${crypto.randomUUID().slice(0, 8)}`,
        tenantId: targetTenant ? targetTenant.id : 'all',
        tenantName: targetTenant
          ? targetTenant.name
          : user.role === 'owner'
            ? 'All My PG Properties'
            : 'All PG Properties',
        title,
        message,
        priority,
        createdByUserId: user.id,
        createdByName: user.name,
        createdAt: new Date().toISOString(),
      };

      if (!db.announcements) db.announcements = [];
      db.announcements.unshift(record);
      store.save();

      if (targetTenant) {
        emitAppNotification({
          tenantId: targetTenant.id,
          tenantName: targetTenant.name,
          category: 'system_alerts',
          eventType: 'admin_announcement',
          priority: priority === 'urgent' ? 'urgent' : 'high',
          title: `Announcement: ${title}`,
          message: `${message} — ${user.name}`,
          targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
          targetTab: 'dashboard',
          targetId: record.id,
        });
      } else if (user.role === 'owner') {
        for (const tid of owned) {
          const tObj = db.tenants.find((t) => t.id === tid);
          emitAppNotification({
            tenantId: tid,
            tenantName: tObj?.name,
            category: 'system_alerts',
            eventType: 'admin_announcement',
            priority: priority === 'urgent' ? 'urgent' : 'high',
            title: `Announcement: ${title}`,
            message: `${message} — ${user.name}`,
            targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
            targetTab: 'dashboard',
            targetId: record.id,
          });
        }
      } else {
        emitAppNotification({
          tenantId: 'platform',
          tenantName: 'All PG Properties',
          category: 'system_alerts',
          eventType: 'admin_announcement',
          priority: priority === 'urgent' ? 'urgent' : 'high',
          title: `Announcement: ${title}`,
          message: `${message} — ${user.name}`,
          targetRoles: ['overall_admin', 'owner', 'warden', 'staff'],
          targetTab: 'dashboard',
          targetId: record.id,
        });
      }

      res.status(201).json({ announcement: record });
    }
  );

  // Multer & API error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      res.status(400).json({ error: err.message || 'Request failed.' });
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  initNotificationWsServer(httpServer);

  // Initial automatic date-based rent reminder check & hourly calendar check
  syncDateBasedRentNotifications({ broadcast: false });
  setInterval(() => {
    syncDateBasedRentNotifications({ broadcast: true });
  }, 60 * 60 * 1000);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`NivasDesk server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
