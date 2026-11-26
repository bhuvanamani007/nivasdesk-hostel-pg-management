import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type {
  AdminAnnouncementRecord,
  AdminNotificationPolicy,
  AppNotification,
  Bed,
  CallAttempt,
  ComplaintRecord,
  Deposit,
  Expense,
  Guest,
  IdentityDocument,
  IdDocumentType,
  MaintenanceRequestRecord,
  Payment,
  ReminderLog,
  Room,
  Stay,
  Tenant,
  User,
  UserNotificationPreferences,
  VisitorEntryRecord,
} from '../src/types/domain.ts';

export interface StoredUser extends User {
  passwordHash: string;
  avatarObjectKey?: string | null;
  avatarMimeType?: string | null;
  avatarUpdatedAt?: string | null;
}

export function sanitizeUser(u: StoredUser): User {
  const {
    passwordHash: _ignoredHash,
    avatarObjectKey,
    avatarMimeType: _ignoredMime,
    avatarUpdatedAt,
    ...rest
  } = u;
  return {
    ...rest,
    phone: u.phone || '',
    avatarUrl: avatarObjectKey
      ? `/api/profile/avatar/${encodeURIComponent(u.id)}?v=${encodeURIComponent(
          avatarUpdatedAt || '1'
        )}`
      : null,
  };
}

export interface DatabaseState {
  seedVersion?: number;
  tenants: Tenant[];
  users: StoredUser[];
  rooms: Room[];
  beds: Bed[];
  guests: Guest[];
  stays: Stay[];
  payments: Payment[];
  deposits: Deposit[];
  expenses: Expense[];
  documents: IdentityDocument[];
  callAttempts: CallAttempt[];
  reminderLogs: ReminderLog[];
  notifications?: AppNotification[];
  notificationPolicy?: AdminNotificationPolicy;
  userNotificationPreferences?: Record<string, UserNotificationPreferences>;
  complaints?: ComplaintRecord[];
  maintenanceRequests?: MaintenanceRequestRecord[];
  visitorEntries?: VisitorEntryRecord[];
  announcements?: AdminAnnouncementRecord[];
}

export function createDefaultNotificationPolicy(): AdminNotificationPolicy {
  return {
    rentRemindersEnabled: true,
    overdueAlertsEnabled: true,
    paymentAlertsEnabled: true,
    residentUpdatesEnabled: true,
    complaintsEnabled: true,
    maintenanceAlertsEnabled: true,
    systemAlertsEnabled: true,
    rentReminderDaysBefore: [5, 2, 0],
    updatedAt: new Date().toISOString(),
    updatedBy: 'System',
  };
}

export function createDefaultUserNotificationPreferences(
  userId: string
): UserNotificationPreferences {
  return {
    userId,
    categories: {
      rent_reminders: true,
      payment_alerts: true,
      resident_updates: true,
      complaints: true,
      maintenance_alerts: true,
      system_alerts: true,
    },
    realTimeSound: false,
    updatedAt: new Date().toISOString(),
  };
}

const CURRENT_SEED_VERSION = 3;
const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'store.json');
export const OBJECT_STORAGE_DIR = path.resolve(
  process.env.STORAGE_DIR || path.join(DATA_DIR, 'objects')
);

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
export const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

export function hasValidImageMagic(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 12) return false;
  if (mimeType === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function maskIdNumber(
  idType: IdDocumentType,
  rawIdNumber?: string | null
): { idLast4: string | null; idMasked: string | null } {
  if (!rawIdNumber || idType === 'none') return { idLast4: null, idMasked: null };
  const cleaned = rawIdNumber.replace(/[\s-]/g, '').toUpperCase();
  if (!cleaned) return { idLast4: null, idMasked: null };
  const last4 = cleaned.slice(-4);
  if (idType === 'aadhaar') {
    return {
      idLast4: last4,
      idMasked: `XXXX-XXXX-${last4}`,
    };
  }
  const maskedPrefix = 'X'.repeat(Math.max(4, cleaned.length - 4));
  return {
    idLast4: last4,
    idMasked: `${maskedPrefix}-${last4}`,
  };
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return 'XXXX';
  return `XXXXXX${digits.slice(-4)}`;
}

function isoDaysOffset(daysOffset: number, hour = 10): string {
  const d = new Date();
  d.setHours(hour, 15, 0, 0);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString();
}

function ymdDaysOffset(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(OBJECT_STORAGE_DIR)) {
    fs.mkdirSync(OBJECT_STORAGE_DIR, { recursive: true });
  }
}

function createSampleSvgDocument(
  title: string,
  guestName: string,
  maskedId: string,
  docLabel: string
): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="520" viewBox="0 0 840 520">
  <rect width="840" height="520" fill="#f8fafc" />
  <rect x="28" y="28" width="784" height="464" rx="14" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" />
  <rect x="28" y="28" width="784" height="72" rx="14" fill="#0f766e" />
  <rect x="28" y="84" width="784" height="16" fill="#0f766e" />
  <text x="56" y="72" font-family="sans-serif" font-size="22" font-weight="700" fill="#ffffff">${title}</text>
  <text x="56" y="142" font-family="sans-serif" font-size="15" font-weight="600" fill="#475569">SAMPLE PROTOTYPE DOCUMENT (MASKED)</text>
  <rect x="56" y="170" width="148" height="180" rx="8" fill="#e2e8f0" stroke="#cbd5e1" />
  <circle cx="130" cy="234" r="32" fill="#94a3b8" />
  <path d="M84 328c8-30 30-46 46-46s38 16 46 46" fill="#94a3b8" />
  <text x="236" y="205" font-family="sans-serif" font-size="14" fill="#64748b">HOLDER NAME</text>
  <text x="236" y="232" font-family="sans-serif" font-size="24" font-weight="700" fill="#0f172a">${guestName}</text>
  <text x="236" y="276" font-family="sans-serif" font-size="14" fill="#64748b">DOCUMENT TYPE</text>
  <text x="236" y="300" font-family="sans-serif" font-size="18" font-weight="600" fill="#1e293b">${docLabel}</text>
  <text x="236" y="344" font-family="sans-serif" font-size="14" fill="#64748b">MASKED IDENTIFIER</text>
  <text x="236" y="372" font-family="monospace" font-size="24" font-weight="700" fill="#0f766e">${maskedId}</text>
  <line x1="56" y1="422" x2="784" y2="422" stroke="#e2e8f0" />
  <text x="56" y="454" font-family="sans-serif" font-size="13" fill="#64748b">Stored in tenant-isolated private storage · Accessible only via authenticated staff session</text>
</svg>`;
  return Buffer.from(svg, 'utf-8');
}

function writePrivateObject(tenantId: string, objectKey: string, content: Buffer) {
  const tenantDir = path.join(OBJECT_STORAGE_DIR, tenantId);
  if (!fs.existsSync(tenantDir)) {
    fs.mkdirSync(tenantDir, { recursive: true });
  }
  const resolved = path.resolve(tenantDir, objectKey);
  if (!resolved.startsWith(tenantDir + path.sep)) {
    throw new Error('Invalid object storage path');
  }
  fs.writeFileSync(resolved, content);
  return resolved;
}

function buildInitialSeedState(): DatabaseState {
  const t1 = 'ten_lakshmi_pg';
  const t2 = 'ten_vrindavan_hostel';
  const t3 = 'ten_cauvery_annex';

  const tenants: Tenant[] = [
    {
      id: t1,
      name: "Cauvery Men's Hostel & PG",
      city: 'Chennai',
      district: 'Chennai',
      locality: 'Adyar (LB Road)',
      pincode: '600020',
      landmark: 'Near Adyar Depot Signal & Indira Nagar MRTS',
      address: '24, LB Road, Adyar, Chennai, Tamil Nadu 600020',
      wardenPhone: '+91 98402 11223',
      gstinOrReg: 'TN-CHN-PG-2024-0812',
      timezone: 'Asia/Kolkata',
      preferredLanguage: 'en',
      houseRules:
        '1. Main gate closes at 10:30 PM; inform warden for late IT shift entry.\n2. Visitors allowed only in ground-floor reception between 9:00 AM and 7:00 PM.\n3. Refundable security deposit is settled within 5 working days after room inspection.',
      receiptPrefix: 'CMPG',
      agreementNotes:
        'Accommodation terms are configurable per hostel property. Guests acknowledge house rules and consent for optional ID retention during stay.',
      isSample: true,
      ownerId: 'usr_suresh',
      status: 'active',
      planTier: 'lifetime',
      settings: {
        smsProvider: 'mock',
        whatsappProvider: 'mock',
        telephonyProvider: 'mock',
        smsCooldownHours: 24,
        reminderLeadDays: 3,
        smsTemplate:
          'Reminder from {{hostelName}}: Payment of ₹{{amount}} for Room {{room}} is due on {{dueDate}}. Please pay via UPI/Cash at the warden desk.',
        checkoutReminderTemplate:
          'Hello {{guestName}}, your stay at {{hostelName}} (Room {{room}}) is scheduled for checkout on {{checkoutDate}}. Please confirm extension or settlement with the warden.',
        unpaidReminderEnabled: true,
        checkoutReminderEnabled: true,
        requireIdDocument: false,
      },
      createdAt: isoDaysOffset(-140),
    },
    {
      id: t2,
      name: "Meenakshi Women's PG",
      city: 'Madurai',
      district: 'Madurai',
      locality: 'Anna Nagar (80 Feet Road)',
      pincode: '625020',
      landmark: 'Opposite Ambiga Theatre Bus Stop',
      address: '14, 80 Feet Road, Anna Nagar, Madurai, Tamil Nadu 625020',
      wardenPhone: '+91 94430 44556',
      gstinOrReg: 'TN-MDU-PG-2023-1490',
      timezone: 'Asia/Kolkata',
      preferredLanguage: 'ta',
      houseRules:
        '1. Biometric / register sign-in mandatory after 9:30 PM.\n2. Induction & iron box usage permitted only in common utility zone.\n3. 15-day prior notice requested before vacating bed.',
      receiptPrefix: 'MWPG',
      agreementNotes:
        'Monthly PG hostel stay receipt and deposit settlement terms managed directly by the property owner.',
      isSample: true,
      ownerId: 'usr_kavitha',
      status: 'active',
      planTier: 'lifetime',
      settings: {
        smsProvider: 'mock',
        whatsappProvider: 'mock',
        telephonyProvider: 'mock',
        smsCooldownHours: 24,
        reminderLeadDays: 3,
        smsTemplate:
          '{{hostelName}} நினைவூட்டல்: அறை {{room}} கட்டணம் ₹{{amount}} ({{dueDate}}). வார்டன் மேசையில் செலுத்தவும்.',
        checkoutReminderTemplate:
          'வணக்கம் {{guestName}}, {{hostelName}} அறை {{room}} வெளியேறும் தேதி {{checkoutDate}}. நீட்டிப்பு தேவைப்பட்டால் தெரிவிக்கவும்.',
        unpaidReminderEnabled: true,
        checkoutReminderEnabled: true,
        requireIdDocument: false,
      },
      createdAt: isoDaysOffset(-150),
    },
    {
      id: t3,
      name: 'Cauvery IT Annex PG',
      city: 'Chennai',
      district: 'Chennai',
      locality: 'Velachery (100 Feet Bypass)',
      pincode: '600042',
      landmark: 'Near Vijayanagar Bus Terminus',
      address: '88, 100 Feet Bypass Road, Velachery, Chennai, Tamil Nadu 600042',
      wardenPhone: '+91 98409 77812',
      gstinOrReg: 'TN-CHN-PG-2025-0341',
      timezone: 'Asia/Kolkata',
      preferredLanguage: 'en',
      houseRules:
        '1. Gate access via smart card after 11:00 PM.\n2. Quiet hours from 11:00 PM to 6:00 AM.',
      receiptPrefix: 'CIAP',
      agreementNotes:
        'Managed under Cauvery PG Group. Monthly rent billed on check-in anniversary.',
      isSample: true,
      ownerId: 'usr_suresh',
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
      createdAt: isoDaysOffset(-95),
    },
  ];

  const adminPass = process.env.OVERALL_ADMIN_PASSWORD || 'warden123';

  const users: StoredUser[] = [
    {
      id: 'usr_overall_admin',
      tenantId: t1,
      name: 'Anand Subramanian',
      email: 'admin@nivasdesk.example',
      role: 'overall_admin',
      isActive: true,
      passwordHash: hashPassword(adminPass),
      createdAt: isoDaysOffset(-180),
    },
    {
      id: 'usr_suresh',
      tenantId: t1,
      name: 'Suresh Natarajan',
      email: 'owner@cauverypg.example',
      role: 'owner',
      isActive: true,
      passwordHash: hashPassword('warden123'),
      createdAt: isoDaysOffset(-140),
    },
    {
      id: 'usr_murugan',
      tenantId: t1,
      name: 'Murugan Vel',
      email: 'warden@cauverypg.example',
      role: 'warden',
      isActive: true,
      passwordHash: hashPassword('warden123'),
      createdAt: isoDaysOffset(-120),
    },
    {
      id: 'usr_prakash_staff',
      tenantId: t1,
      name: 'Prakash Rajendran',
      email: 'staff@cauverypg.example',
      role: 'staff',
      isActive: true,
      passwordHash: hashPassword('warden123'),
      createdAt: isoDaysOffset(-60),
    },
    {
      id: 'usr_velachery_warden',
      tenantId: t3,
      name: 'Balaji Krishnamurthy',
      email: 'warden.velachery@cauverypg.example',
      role: 'warden',
      isActive: true,
      passwordHash: hashPassword('warden123'),
      createdAt: isoDaysOffset(-90),
    },
    {
      id: 'usr_kavitha',
      tenantId: t2,
      name: 'Kavitha Selvam',
      email: 'owner@meenakshipg.example',
      role: 'owner',
      isActive: true,
      passwordHash: hashPassword('warden123'),
      createdAt: isoDaysOffset(-150),
    },
    {
      id: 'usr_revathi',
      tenantId: t2,
      name: 'Revathi Balasubramanian',
      email: 'warden@meenakshipg.example',
      role: 'warden',
      isActive: true,
      passwordHash: hashPassword('warden123'),
      createdAt: isoDaysOffset(-100),
    },
  ];

  const rooms: Room[] = [
    // Tenant 1: 7 rooms, 17 beds
    {
      id: 'rm_101',
      tenantId: t1,
      roomNumber: '101',
      floor: '1st Floor',
      roomType: '2-Sharing',
      capacity: 2,
      monthlyTariff: 9500,
      facilities: ['Wi-Fi', 'Attached Bath', 'Geyser', 'RO Water'],
      status: 'occupied',
      createdAt: isoDaysOffset(-120),
    },
    {
      id: 'rm_102',
      tenantId: t1,
      roomNumber: '102',
      floor: '1st Floor',
      roomType: '3-Sharing',
      capacity: 3,
      monthlyTariff: 7800,
      facilities: ['Wi-Fi', 'RO Water', '2-Wheeler Parking'],
      status: 'available',
      createdAt: isoDaysOffset(-120),
    },
    {
      id: 'rm_103',
      tenantId: t1,
      roomNumber: '103',
      floor: '1st Floor',
      roomType: 'Single',
      capacity: 1,
      monthlyTariff: 14500,
      facilities: ['AC', 'Wi-Fi', 'Attached Bath', 'Geyser', 'Power Backup'],
      status: 'occupied',
      createdAt: isoDaysOffset(-120),
    },
    {
      id: 'rm_201',
      tenantId: t1,
      roomNumber: '201',
      floor: '2nd Floor',
      roomType: '2-Sharing',
      capacity: 2,
      monthlyTariff: 9800,
      facilities: ['AC', 'Wi-Fi', 'Geyser', 'Laundry'],
      status: 'occupied',
      createdAt: isoDaysOffset(-100),
    },
    {
      id: 'rm_202',
      tenantId: t1,
      roomNumber: '202',
      floor: '2nd Floor',
      roomType: '3-Sharing',
      capacity: 3,
      monthlyTariff: 7800,
      facilities: ['Wi-Fi', 'RO Water', 'CCTV'],
      status: 'available',
      createdAt: isoDaysOffset(-100),
    },
    {
      id: 'rm_203',
      tenantId: t1,
      roomNumber: '203',
      floor: '2nd Floor',
      roomType: '3-Sharing',
      capacity: 3,
      monthlyTariff: 7500,
      facilities: ['Wi-Fi', 'RO Water', 'Power Backup'],
      status: 'available',
      createdAt: isoDaysOffset(-80),
    },
    {
      id: 'rm_301',
      tenantId: t1,
      roomNumber: '301',
      floor: '3rd Floor',
      roomType: '4-Sharing',
      capacity: 4,
      monthlyTariff: 6500,
      facilities: ['Wi-Fi', 'RO Water'],
      status: 'available',
      createdAt: isoDaysOffset(-60),
    },
    // Tenant 2: 5 rooms, 11 beds
    {
      id: 'rm_v101',
      tenantId: t2,
      roomNumber: 'A-101',
      floor: 'Ground Floor',
      roomType: '2-Sharing',
      capacity: 2,
      monthlyTariff: 8500,
      facilities: ['Wi-Fi', 'Attached Bath', 'RO Water', 'CCTV'],
      status: 'occupied',
      createdAt: isoDaysOffset(-120),
    },
    {
      id: 'rm_v102',
      tenantId: t2,
      roomNumber: 'A-102',
      floor: 'Ground Floor',
      roomType: 'Single',
      capacity: 1,
      monthlyTariff: 12500,
      facilities: ['AC', 'Wi-Fi', 'Geyser', 'Attached Bath'],
      status: 'occupied',
      createdAt: isoDaysOffset(-120),
    },
    {
      id: 'rm_v103',
      tenantId: t2,
      roomNumber: 'A-103',
      floor: 'Ground Floor',
      roomType: '3-Sharing',
      capacity: 3,
      monthlyTariff: 7000,
      facilities: ['Wi-Fi', 'RO Water', 'Food Included'],
      status: 'available',
      createdAt: isoDaysOffset(-90),
    },
    {
      id: 'rm_v201',
      tenantId: t2,
      roomNumber: 'B-201',
      floor: '1st Floor',
      roomType: '2-Sharing',
      capacity: 2,
      monthlyTariff: 8800,
      facilities: ['Wi-Fi', 'Geyser', 'Laundry'],
      status: 'available',
      createdAt: isoDaysOffset(-75),
    },
    {
      id: 'rm_v202',
      tenantId: t2,
      roomNumber: 'B-202',
      floor: '1st Floor',
      roomType: '3-Sharing',
      capacity: 3,
      monthlyTariff: 7200,
      facilities: ['Wi-Fi', 'RO Water', 'Power Backup'],
      status: 'available',
      createdAt: isoDaysOffset(-60),
    },
  ];

  const beds: Bed[] = [
    // Tenant 1: 18 beds (11 occupied/overdue, 5 vacant, 2 maintenance)
    { id: 'bed_101a', tenantId: t1, roomId: 'rm_101', bedLabel: 'A', status: 'occupied', currentStayId: 'sty_1' },
    { id: 'bed_101b', tenantId: t1, roomId: 'rm_101', bedLabel: 'B', status: 'occupied', currentStayId: 'sty_2' },
    { id: 'bed_102a', tenantId: t1, roomId: 'rm_102', bedLabel: 'A', status: 'occupied', currentStayId: 'sty_3' },
    { id: 'bed_102b', tenantId: t1, roomId: 'rm_102', bedLabel: 'B', status: 'occupied', currentStayId: 'sty_4' },
    { id: 'bed_102c', tenantId: t1, roomId: 'rm_102', bedLabel: 'C', status: 'vacant', currentStayId: null },
    { id: 'bed_103a', tenantId: t1, roomId: 'rm_103', bedLabel: 'A', status: 'occupied', currentStayId: 'sty_5' },
    { id: 'bed_201a', tenantId: t1, roomId: 'rm_201', bedLabel: 'A', status: 'occupied', currentStayId: 'sty_6' },
    { id: 'bed_201b', tenantId: t1, roomId: 'rm_201', bedLabel: 'B', status: 'occupied', currentStayId: 'sty_7' },
    { id: 'bed_202a', tenantId: t1, roomId: 'rm_202', bedLabel: 'A', status: 'occupied', currentStayId: 'sty_8' },
    { id: 'bed_202b', tenantId: t1, roomId: 'rm_202', bedLabel: 'B', status: 'maintenance', currentStayId: null },
    { id: 'bed_202c', tenantId: t1, roomId: 'rm_202', bedLabel: 'C', status: 'vacant', currentStayId: null },
    { id: 'bed_203a', tenantId: t1, roomId: 'rm_203', bedLabel: 'A', status: 'occupied', currentStayId: 'sty_9' },
    { id: 'bed_203b', tenantId: t1, roomId: 'rm_203', bedLabel: 'B', status: 'vacant', currentStayId: null },
    { id: 'bed_203c', tenantId: t1, roomId: 'rm_203', bedLabel: 'C', status: 'occupied', currentStayId: 'sty_10' },
    { id: 'bed_301a', tenantId: t1, roomId: 'rm_301', bedLabel: 'A', status: 'occupied', currentStayId: 'sty_11' },
    { id: 'bed_301b', tenantId: t1, roomId: 'rm_301', bedLabel: 'B', status: 'vacant', currentStayId: null },
    { id: 'bed_301c', tenantId: t1, roomId: 'rm_301', bedLabel: 'C', status: 'vacant', currentStayId: null },
    { id: 'bed_301d', tenantId: t1, roomId: 'rm_301', bedLabel: 'D', status: 'maintenance', currentStayId: null },

    // Tenant 2: 11 beds (5 occupied, 5 vacant, 1 maintenance)
    { id: 'bed_v101a', tenantId: t2, roomId: 'rm_v101', bedLabel: 'A', status: 'occupied', currentStayId: 'sty_v1' },
    { id: 'bed_v101b', tenantId: t2, roomId: 'rm_v101', bedLabel: 'B', status: 'occupied', currentStayId: 'sty_v2' },
    { id: 'bed_v102a', tenantId: t2, roomId: 'rm_v102', bedLabel: 'A', status: 'occupied', currentStayId: 'sty_v3' },
    { id: 'bed_v103a', tenantId: t2, roomId: 'rm_v103', bedLabel: 'A', status: 'occupied', currentStayId: 'sty_v4' },
    { id: 'bed_v103b', tenantId: t2, roomId: 'rm_v103', bedLabel: 'B', status: 'vacant', currentStayId: null },
    { id: 'bed_v103c', tenantId: t2, roomId: 'rm_v103', bedLabel: 'C', status: 'vacant', currentStayId: null },
    { id: 'bed_v201a', tenantId: t2, roomId: 'rm_v201', bedLabel: 'A', status: 'occupied', currentStayId: 'sty_v5' },
    { id: 'bed_v201b', tenantId: t2, roomId: 'rm_v201', bedLabel: 'B', status: 'maintenance', currentStayId: null },
    { id: 'bed_v202a', tenantId: t2, roomId: 'rm_v202', bedLabel: 'A', status: 'vacant', currentStayId: null },
    { id: 'bed_v202b', tenantId: t2, roomId: 'rm_v202', bedLabel: 'B', status: 'vacant', currentStayId: null },
    { id: 'bed_v202c', tenantId: t2, roomId: 'rm_v202', bedLabel: 'C', status: 'vacant', currentStayId: null },
  ];

  const guests: Guest[] = [
    // Tenant 1 (14 guests: active, upcoming, former, inactive)
    {
      id: 'gst_karthik',
      tenantId: t1,
      fullName: 'Karthik Subramanian',
      primaryPhone: '+91 97908 33412',
      alternativePhone: '+91 94431 22908',
      currentAddress: 'Tidel Park IT Corridor, Taramani, Chennai',
      permanentAddress: '28 VOC Street, Pollachi, Coimbatore, Tamil Nadu 642001',
      emergencyContactName: 'Raghavan Subramanian',
      emergencyContactRelation: 'Father',
      emergencyContactPhone: '+91 94431 22908',
      idType: 'aadhaar',
      idLast4: '9104',
      idMasked: 'XXXX-XXXX-9104',
      consentGiven: true,
      consentNotes: 'Guest signed paper register for masked ID copy retention.',
      status: 'active',
      altPhoneVerified: 'verified',
      notes: 'Software engineer at Taramani; 2-wheeler TN-37-AB-4410.',
      createdAt: isoDaysOffset(-42),
    },
    {
      id: 'gst_aravind',
      tenantId: t1,
      fullName: 'Aravindhan Muthu',
      primaryPhone: '+91 98422 56120',
      alternativePhone: '+91 94420 78114',
      currentAddress: 'IIT Madras Research Park, Chennai',
      permanentAddress: '14 Fairlands, Salem, Tamil Nadu 636016',
      emergencyContactName: 'Lakshmi Muthu',
      emergencyContactRelation: 'Mother',
      emergencyContactPhone: '+91 94420 78114',
      idType: 'driving_licence',
      idLast4: '7732',
      idMasked: 'TN30-XXXX-7732',
      consentGiven: true,
      consentNotes: 'Consent given for emergency contact & optional DL copy.',
      status: 'active',
      altPhoneVerified: 'verified',
      notes: 'Project associate at IITM Research Park.',
      createdAt: isoDaysOffset(-30),
    },
    {
      id: 'gst_vignesh',
      tenantId: t1,
      fullName: 'Vigneshwaran S.',
      primaryPhone: '+91 96770 88450',
      alternativePhone: '+91 94433 55320',
      currentAddress: 'Guindy Industrial Estate, Chennai',
      permanentAddress: '7 Thillai Nagar, Tiruchirappalli, Tamil Nadu 620018',
      emergencyContactName: 'Senthil Kumar',
      emergencyContactRelation: 'Brother',
      emergencyContactPhone: '+91 94433 55320',
      idType: 'aadhaar',
      idLast4: '4821',
      idMasked: 'XXXX-XXXX-4821',
      consentGiven: true,
      consentNotes: 'Verbal and register consent recorded.',
      status: 'active',
      altPhoneVerified: 'pending',
      notes: 'Checkout due in 2 days — confirm extension.',
      createdAt: isoDaysOffset(-25),
    },
    {
      id: 'gst_praveen',
      tenantId: t1,
      fullName: 'Praveen Rajkumar',
      primaryPhone: '+91 91764 66709',
      alternativePhone: '+91 94440 31882',
      currentAddress: 'OMR Perungudi, Chennai',
      permanentAddress: '112 Palayamkottai, Tirunelveli, Tamil Nadu 627002',
      emergencyContactName: 'Rajkumar P.',
      emergencyContactRelation: 'Father',
      emergencyContactPhone: '+91 94440 31882',
      idType: 'none',
      idLast4: null,
      idMasked: null,
      consentGiven: false,
      consentNotes: 'Guest chose not to submit ID file; confirmed company offer letter visually.',
      status: 'active',
      altPhoneVerified: 'failed',
      notes: 'Stay overdue by 2 days; verify renewal or departure.',
      createdAt: isoDaysOffset(-33),
    },
    {
      id: 'gst_siddharth',
      tenantId: t1,
      fullName: 'Siddharth Menon',
      primaryPhone: '+91 98470 19823',
      alternativePhone: '+91 94471 88210',
      currentAddress: 'Adyar, Chennai',
      permanentAddress: '19 Panampilly Nagar, Kochi, Kerala 682036',
      emergencyContactName: 'Meera Menon',
      emergencyContactRelation: 'Sister',
      emergencyContactPhone: '+91 94471 88210',
      idType: 'passport',
      idLast4: '6042',
      idMasked: 'XXXX-6042',
      consentGiven: true,
      consentNotes: 'Passport front page uploaded with guest consent.',
      status: 'active',
      altPhoneVerified: 'verified',
      notes: 'Single room occupant. Travels weekly.',
      createdAt: isoDaysOffset(-55),
    },
    {
      id: 'gst_naveen',
      tenantId: t1,
      fullName: 'Naveen Kumar V.',
      primaryPhone: '+91 99401 44781',
      alternativePhone: '+91 94435 91234',
      currentAddress: 'Velachery, Chennai',
      permanentAddress: '9 Gandhi Nagar, Vellore, Tamil Nadu 632006',
      emergencyContactName: 'Venkatesan R.',
      emergencyContactRelation: 'Father',
      emergencyContactPhone: '+91 94435 91234',
      idType: 'voter_id',
      idLast4: '2290',
      idMasked: 'TNX-XXXX-2290',
      consentGiven: true,
      consentNotes: 'Consent confirmed at check-in.',
      status: 'active',
      altPhoneVerified: 'verified',
      notes: 'Checking out today; inspect room key.',
      createdAt: isoDaysOffset(-20),
    },
    {
      id: 'gst_harish',
      tenantId: t1,
      fullName: 'Harish Balaji',
      primaryPhone: '+91 98409 77620',
      alternativePhone: '+91 94442 33910',
      currentAddress: 'Sholinganallur, Chennai',
      permanentAddress: '45 Suramangalam, Salem, Tamil Nadu 636005',
      emergencyContactName: 'Balaji N.',
      emergencyContactRelation: 'Father',
      emergencyContactPhone: '+91 94442 33910',
      idType: 'aadhaar',
      idLast4: '1587',
      idMasked: 'XXXX-XXXX-1587',
      consentGiven: true,
      consentNotes: 'Standard guest consent note.',
      status: 'active',
      altPhoneVerified: 'pending',
      notes: 'Checked in 5 days ago.',
      createdAt: isoDaysOffset(-5),
    },
    {
      id: 'gst_dinesh',
      tenantId: t1,
      fullName: 'Dinesh Babu K.',
      primaryPhone: '+91 90034 51289',
      alternativePhone: '+91 94437 22190',
      currentAddress: 'Adyar, Chennai',
      permanentAddress: '8 Periyar Nagar, Erode, Tamil Nadu 638001',
      emergencyContactName: 'Kalaiselvi K.',
      emergencyContactRelation: 'Mother',
      emergencyContactPhone: '+91 94437 22190',
      idType: 'aadhaar',
      idLast4: '7410',
      idMasked: 'XXXX-XXXX-7410',
      consentGiven: true,
      consentNotes: 'Masked Aadhaar retained per guest consent.',
      status: 'active',
      altPhoneVerified: 'verified',
      notes: 'GATE / TNPSC preparation.',
      createdAt: isoDaysOffset(-29),
    },
    {
      id: 'gst_saravanan',
      tenantId: t1,
      fullName: 'Saravanan P.',
      primaryPhone: '+91 97890 61102',
      alternativePhone: '+91 94438 72318',
      currentAddress: 'Adyar, Chennai',
      permanentAddress: '31 Medical College Road, Thanjavur, Tamil Nadu 613004',
      emergencyContactName: 'Palanisamy S.',
      emergencyContactRelation: 'Father',
      emergencyContactPhone: '+91 94438 72318',
      idType: 'driving_licence',
      idLast4: '8824',
      idMasked: 'TN49-XXXX-8824',
      consentGiven: true,
      consentNotes: 'Consent on file.',
      status: 'active',
      altPhoneVerified: 'verified',
      notes: 'Checked in 3 days ago.',
      createdAt: isoDaysOffset(-3),
    },
    {
      id: 'gst_balaji',
      tenantId: t1,
      fullName: 'Balaji Sundaram',
      primaryPhone: '+91 98412 20495',
      alternativePhone: '+91 94439 88231',
      currentAddress: 'Mylapore, Chennai',
      permanentAddress: '204 Alagapuram, Salem, Tamil Nadu 636016',
      emergencyContactName: 'Sundaram T.',
      emergencyContactRelation: 'Father',
      emergencyContactPhone: '+91 94439 88231',
      idType: 'aadhaar',
      idLast4: '5519',
      idMasked: 'XXXX-XXXX-5519',
      consentGiven: true,
      consentNotes: 'Consent recorded.',
      status: 'active',
      altPhoneVerified: 'verified',
      notes: 'Fintech analyst at Ascendas.',
      createdAt: isoDaysOffset(-36),
    },
    {
      id: 'gst_gokul',
      tenantId: t1,
      fullName: 'Gokul Krishnan',
      primaryPhone: '+91 95002 18930',
      alternativePhone: '+91 94432 77421',
      currentAddress: 'Adyar, Chennai',
      permanentAddress: '64 Anna Salai, Dindigul, Tamil Nadu 624001',
      emergencyContactName: 'Meenakshi K.',
      emergencyContactRelation: 'Mother',
      emergencyContactPhone: '+91 94432 77421',
      idType: 'other',
      idLast4: '6208',
      idMasked: 'EMP-XXXX-6208',
      consentGiven: true,
      consentNotes: 'Provided employee ID voluntarily.',
      status: 'active',
      altPhoneVerified: 'pending',
      notes: '6-month trainee.',
      createdAt: isoDaysOffset(-12),
    },
    {
      id: 'gst_madhan',
      tenantId: t1,
      fullName: 'Madhan Kumar R.',
      primaryPhone: '+91 98405 99123',
      alternativePhone: '+91 94431 99100',
      currentAddress: 'Tambaram, Chennai',
      permanentAddress: '12 Kamarajar Street, Hosur, Tamil Nadu 635109',
      emergencyContactName: 'Ramesh K.',
      emergencyContactRelation: 'Father',
      emergencyContactPhone: '+91 94431 99100',
      idType: 'aadhaar',
      idLast4: '3301',
      idMasked: 'XXXX-XXXX-3301',
      consentGiven: true,
      consentNotes: 'Advance booking confirmed.',
      status: 'active',
      altPhoneVerified: 'verified',
      notes: 'Upcoming reservation for next week.',
      createdAt: isoDaysOffset(-2),
    },
    {
      id: 'gst_manoj_former',
      tenantId: t1,
      fullName: 'Manoj Prabhakar',
      primaryPhone: '+91 97911 88213',
      alternativePhone: '+91 94425 19044',
      currentAddress: 'Velachery, Chennai',
      permanentAddress: '11 Ramnagar, Coimbatore, Tamil Nadu 641009',
      emergencyContactName: 'Prabhakar M.',
      emergencyContactRelation: 'Father',
      emergencyContactPhone: '+91 94425 19044',
      idType: 'aadhaar',
      idLast4: '1128',
      idMasked: 'XXXX-XXXX-1128',
      consentGiven: true,
      consentNotes: 'Deposit refunded on departure.',
      status: 'former',
      altPhoneVerified: 'verified',
      notes: 'Shifted to flat in Velachery.',
      createdAt: isoDaysOffset(-95),
    },
    {
      id: 'gst_deepan_inactive',
      tenantId: t1,
      fullName: 'Deepan Chakravarthy',
      primaryPhone: '+91 93601 55201',
      alternativePhone: '+91 94428 22871',
      currentAddress: 'Nagercoil, Tamil Nadu',
      permanentAddress: '23 Vadasery, Nagercoil, Kanyakumari, Tamil Nadu 629001',
      emergencyContactName: 'Chakravarthy V.',
      emergencyContactRelation: 'Father',
      emergencyContactPhone: '+91 94428 22871',
      idType: 'none',
      idLast4: null,
      idMasked: null,
      consentGiven: false,
      consentNotes: 'Booking was cancelled before move-in.',
      status: 'inactive',
      altPhoneVerified: 'pending',
      notes: 'Cancelled booking prior to arrival.',
      createdAt: isoDaysOffset(-40),
    },

    // Tenant 2: Madurai (6 guests)
    {
      id: 'gst_ananya',
      tenantId: t2,
      fullName: 'Keerthana Selvaraj',
      primaryPhone: '+91 98421 42100',
      alternativePhone: '+91 94430 33409',
      currentAddress: 'Anna Nagar, Madurai',
      permanentAddress: '12 Bypass Road, Karaikudi, Sivaganga, Tamil Nadu 630001',
      emergencyContactName: 'Selvaraj N.',
      emergencyContactRelation: 'Father',
      emergencyContactPhone: '+91 94430 33409',
      idType: 'aadhaar',
      idLast4: '5091',
      idMasked: 'XXXX-XXXX-5091',
      consentGiven: true,
      consentNotes: 'Verified with guardian.',
      status: 'active',
      altPhoneVerified: 'verified',
      notes: 'IT park analyst at Elcot Madurai.',
      createdAt: isoDaysOffset(-30),
    },
    {
      id: 'gst_priya',
      tenantId: t2,
      fullName: 'Priyadharshini M.',
      primaryPhone: '+91 98942 11904',
      alternativePhone: '+91 94434 51092',
      currentAddress: 'KK Nagar, Madurai',
      permanentAddress: '56 Subramaniapuram, Dindigul, Tamil Nadu 624003',
      emergencyContactName: 'Mallika M.',
      emergencyContactRelation: 'Mother',
      emergencyContactPhone: '+91 94434 51092',
      idType: 'passport',
      idLast4: '2938',
      idMasked: 'XXXX-2938',
      consentGiven: true,
      consentNotes: 'Consent on file.',
      status: 'active',
      altPhoneVerified: 'verified',
      notes: 'Medical PG student.',
      createdAt: isoDaysOffset(-15),
    },
    {
      id: 'gst_divya',
      tenantId: t2,
      fullName: 'Divya Bharathi K.',
      primaryPhone: '+91 97870 55320',
      alternativePhone: '+91 94426 19022',
      currentAddress: 'Anna Nagar, Madurai',
      permanentAddress: '19 Palani Road, Udumalpet, Tamil Nadu 642126',
      emergencyContactName: 'Kamala K.',
      emergencyContactRelation: 'Mother',
      emergencyContactPhone: '+91 94426 19022',
      idType: 'driving_licence',
      idLast4: '6412',
      idMasked: 'TN58-XXXX-6412',
      consentGiven: true,
      consentNotes: 'Consent on file.',
      status: 'active',
      altPhoneVerified: 'verified',
      notes: 'Single occupancy.',
      createdAt: isoDaysOffset(-19),
    },
    {
      id: 'gst_sneha',
      tenantId: t2,
      fullName: 'Sneha Sundari R.',
      primaryPhone: '+91 98424 77109',
      alternativePhone: '+91 94433 55812',
      currentAddress: 'Mattuthavani, Madurai',
      permanentAddress: '88 Perumalpuram, Tirunelveli, Tamil Nadu 627007',
      emergencyContactName: 'Ramesh S.',
      emergencyContactRelation: 'Father',
      emergencyContactPhone: '+91 94433 55812',
      idType: 'none',
      idLast4: null,
      idMasked: null,
      consentGiven: false,
      consentNotes: 'ID upload optional.',
      status: 'active',
      altPhoneVerified: 'pending',
      notes: 'Banking exam coaching.',
      createdAt: isoDaysOffset(-11),
    },
    {
      id: 'gst_nandhini',
      tenantId: t2,
      fullName: 'Nandhini Devi T.',
      primaryPhone: '+91 98439 34120',
      alternativePhone: '+91 94421 22901',
      currentAddress: 'Anna Nagar, Madurai',
      permanentAddress: '33 Collectorate Road, Theni, Tamil Nadu 625531',
      emergencyContactName: 'Thangavel P.',
      emergencyContactRelation: 'Father',
      emergencyContactPhone: '+91 94421 22901',
      idType: 'aadhaar',
      idLast4: '9402',
      idMasked: 'XXXX-XXXX-9402',
      consentGiven: true,
      consentNotes: 'Consent recorded.',
      status: 'active',
      altPhoneVerified: 'verified',
      notes: 'CA trainee.',
      createdAt: isoDaysOffset(-6),
    },
    {
      id: 'gst_kavya_former',
      tenantId: t2,
      fullName: 'Kavya Natarajan',
      primaryPhone: '+91 98940 41208',
      alternativePhone: '+91 94420 90124',
      currentAddress: 'Sivakasi, Tamil Nadu',
      permanentAddress: '14 Thiruthangal Road, Sivakasi, Tamil Nadu 626123',
      emergencyContactName: 'Natarajan V.',
      emergencyContactRelation: 'Father',
      emergencyContactPhone: '+91 94420 90124',
      idType: 'aadhaar',
      idLast4: '1839',
      idMasked: 'XXXX-XXXX-1839',
      consentGiven: true,
      consentNotes: 'Checked out cleanly.',
      status: 'former',
      altPhoneVerified: 'verified',
      notes: 'Former intern.',
      createdAt: isoDaysOffset(-65),
    },
  ];

  const stays: Stay[] = [
    // Tenant 1 past, cancelled, upcoming, active, overdue
    {
      id: 'sty_past_manoj',
      tenantId: t1,
      guestId: 'gst_manoj_former',
      roomId: 'rm_102',
      bedId: 'bed_102c',
      purposeOfStay: 'Working Professional',
      checkInAt: isoDaysOffset(-95, 10),
      expectedCheckoutDate: ymdDaysOffset(-35),
      actualCheckoutAt: isoDaysOffset(-35, 16),
      status: 'checked_out',
      agreedAmount: 7800,
      notes: 'Completed stay cleanly.',
      createdAt: isoDaysOffset(-95),
    },
    {
      id: 'sty_past_karthik',
      tenantId: t1,
      guestId: 'gst_karthik',
      roomId: 'rm_203',
      bedId: 'bed_203b',
      purposeOfStay: 'Internship',
      checkInAt: isoDaysOffset(-75, 11),
      expectedCheckoutDate: ymdDaysOffset(-48),
      actualCheckoutAt: isoDaysOffset(-48, 17),
      status: 'checked_out',
      agreedAmount: 7500,
      notes: 'Previous internship stay.',
      createdAt: isoDaysOffset(-75),
    },
    {
      id: 'sty_cancelled_deepan',
      tenantId: t1,
      guestId: 'gst_deepan_inactive',
      roomId: 'rm_301',
      bedId: 'bed_301b',
      purposeOfStay: 'Job Search',
      checkInAt: isoDaysOffset(-38, 10),
      expectedCheckoutDate: ymdDaysOffset(-8),
      actualCheckoutAt: null,
      status: 'cancelled',
      agreedAmount: 6500,
      cancelledAt: isoDaysOffset(-39, 14),
      cancellationReason: 'Offer location shifted to Hosur.',
      createdAt: isoDaysOffset(-40),
    },
    {
      id: 'sty_upcoming_madhan',
      tenantId: t1,
      guestId: 'gst_madhan',
      roomId: 'rm_301',
      bedId: 'bed_301c',
      purposeOfStay: 'Working Professional',
      checkInAt: isoDaysOffset(3, 10),
      expectedCheckoutDate: ymdDaysOffset(33),
      actualCheckoutAt: null,
      status: 'upcoming',
      agreedAmount: 6500,
      notes: 'Arriving from Hosur in 3 days; advance booking.',
      createdAt: isoDaysOffset(-2),
    },
    // 11 currently occupied beds (10 active + 1 overdue)
    {
      id: 'sty_1',
      tenantId: t1,
      guestId: 'gst_karthik',
      roomId: 'rm_101',
      bedId: 'bed_101a',
      purposeOfStay: 'Working Professional',
      checkInAt: isoDaysOffset(-42, 10),
      expectedCheckoutDate: ymdDaysOffset(22),
      actualCheckoutAt: null,
      status: 'active',
      agreedAmount: 9500,
      createdAt: isoDaysOffset(-42),
    },
    {
      id: 'sty_2',
      tenantId: t1,
      guestId: 'gst_aravind',
      roomId: 'rm_101',
      bedId: 'bed_101b',
      purposeOfStay: 'Working Professional',
      checkInAt: isoDaysOffset(-30, 14),
      expectedCheckoutDate: ymdDaysOffset(4),
      actualCheckoutAt: null,
      status: 'active',
      agreedAmount: 9500,
      createdAt: isoDaysOffset(-30),
    },
    {
      id: 'sty_3',
      tenantId: t1,
      guestId: 'gst_vignesh',
      roomId: 'rm_102',
      bedId: 'bed_102a',
      purposeOfStay: 'Internship',
      checkInAt: isoDaysOffset(-25, 9),
      expectedCheckoutDate: ymdDaysOffset(2),
      actualCheckoutAt: null,
      status: 'active',
      agreedAmount: 7800,
      createdAt: isoDaysOffset(-25),
    },
    {
      id: 'sty_4',
      tenantId: t1,
      guestId: 'gst_praveen',
      roomId: 'rm_102',
      bedId: 'bed_102b',
      purposeOfStay: 'Working Professional',
      checkInAt: isoDaysOffset(-33, 12),
      expectedCheckoutDate: ymdDaysOffset(-2),
      actualCheckoutAt: null,
      status: 'overdue',
      agreedAmount: 7800,
      notes: 'Expected checkout 2 days ago; call guest.',
      createdAt: isoDaysOffset(-33),
    },
    {
      id: 'sty_5',
      tenantId: t1,
      guestId: 'gst_siddharth',
      roomId: 'rm_103',
      bedId: 'bed_103a',
      purposeOfStay: 'Working Professional',
      checkInAt: isoDaysOffset(-55, 11),
      expectedCheckoutDate: ymdDaysOffset(45),
      actualCheckoutAt: null,
      status: 'active',
      agreedAmount: 14500,
      createdAt: isoDaysOffset(-55),
    },
    {
      id: 'sty_6',
      tenantId: t1,
      guestId: 'gst_naveen',
      roomId: 'rm_201',
      bedId: 'bed_201a',
      purposeOfStay: 'Working Professional',
      checkInAt: isoDaysOffset(-20, 16),
      expectedCheckoutDate: ymdDaysOffset(0),
      actualCheckoutAt: null,
      status: 'active',
      agreedAmount: 9800,
      createdAt: isoDaysOffset(-20),
    },
    {
      id: 'sty_7',
      tenantId: t1,
      guestId: 'gst_harish',
      roomId: 'rm_201',
      bedId: 'bed_201b',
      purposeOfStay: 'Working Professional',
      checkInAt: isoDaysOffset(-5, 13),
      expectedCheckoutDate: ymdDaysOffset(25),
      actualCheckoutAt: null,
      status: 'active',
      agreedAmount: 9800,
      createdAt: isoDaysOffset(-5),
    },
    {
      id: 'sty_8',
      tenantId: t1,
      guestId: 'gst_dinesh',
      roomId: 'rm_202',
      bedId: 'bed_202a',
      purposeOfStay: 'Student',
      checkInAt: isoDaysOffset(-29, 10),
      expectedCheckoutDate: ymdDaysOffset(6),
      actualCheckoutAt: null,
      status: 'active',
      agreedAmount: 7800,
      createdAt: isoDaysOffset(-29),
    },
    {
      id: 'sty_9',
      tenantId: t1,
      guestId: 'gst_saravanan',
      roomId: 'rm_203',
      bedId: 'bed_203a',
      purposeOfStay: 'Job Search',
      checkInAt: isoDaysOffset(-3, 15),
      expectedCheckoutDate: ymdDaysOffset(27),
      actualCheckoutAt: null,
      status: 'active',
      agreedAmount: 7500,
      createdAt: isoDaysOffset(-3),
    },
    {
      id: 'sty_10',
      tenantId: t1,
      guestId: 'gst_balaji',
      roomId: 'rm_203',
      bedId: 'bed_203c',
      purposeOfStay: 'Working Professional',
      checkInAt: isoDaysOffset(-36, 11),
      expectedCheckoutDate: ymdDaysOffset(18),
      actualCheckoutAt: null,
      status: 'active',
      agreedAmount: 7500,
      createdAt: isoDaysOffset(-36),
    },
    {
      id: 'sty_11',
      tenantId: t1,
      guestId: 'gst_gokul',
      roomId: 'rm_301',
      bedId: 'bed_301a',
      purposeOfStay: 'Internship',
      checkInAt: isoDaysOffset(-12, 14),
      expectedCheckoutDate: ymdDaysOffset(18),
      actualCheckoutAt: null,
      status: 'active',
      agreedAmount: 6500,
      createdAt: isoDaysOffset(-12),
    },

    // Tenant 2 Stays
    {
      id: 'sty_v_past',
      tenantId: t2,
      guestId: 'gst_kavya_former',
      roomId: 'rm_v103',
      bedId: 'bed_v103c',
      purposeOfStay: 'Internship',
      checkInAt: isoDaysOffset(-65, 11),
      expectedCheckoutDate: ymdDaysOffset(-35),
      actualCheckoutAt: isoDaysOffset(-35, 15),
      status: 'checked_out',
      agreedAmount: 7000,
      createdAt: isoDaysOffset(-65),
    },
    {
      id: 'sty_v1',
      tenantId: t2,
      guestId: 'gst_ananya',
      roomId: 'rm_v101',
      bedId: 'bed_v101a',
      purposeOfStay: 'Working Professional',
      checkInAt: isoDaysOffset(-30, 11),
      expectedCheckoutDate: ymdDaysOffset(30),
      actualCheckoutAt: null,
      status: 'active',
      agreedAmount: 8500,
      createdAt: isoDaysOffset(-30),
    },
    {
      id: 'sty_v2',
      tenantId: t2,
      guestId: 'gst_priya',
      roomId: 'rm_v101',
      bedId: 'bed_v101b',
      purposeOfStay: 'Student',
      checkInAt: isoDaysOffset(-15, 10),
      expectedCheckoutDate: ymdDaysOffset(4),
      actualCheckoutAt: null,
      status: 'active',
      agreedAmount: 8500,
      createdAt: isoDaysOffset(-15),
    },
    {
      id: 'sty_v3',
      tenantId: t2,
      guestId: 'gst_divya',
      roomId: 'rm_v102',
      bedId: 'bed_v102a',
      purposeOfStay: 'Working Professional',
      checkInAt: isoDaysOffset(-19, 10),
      expectedCheckoutDate: ymdDaysOffset(2),
      actualCheckoutAt: null,
      status: 'active',
      agreedAmount: 12500,
      createdAt: isoDaysOffset(-19),
    },
    {
      id: 'sty_v4',
      tenantId: t2,
      guestId: 'gst_sneha',
      roomId: 'rm_v103',
      bedId: 'bed_v103a',
      purposeOfStay: 'Student',
      checkInAt: isoDaysOffset(-31, 15),
      expectedCheckoutDate: ymdDaysOffset(-1),
      actualCheckoutAt: null,
      status: 'overdue',
      agreedAmount: 7000,
      createdAt: isoDaysOffset(-31),
    },
    {
      id: 'sty_v5',
      tenantId: t2,
      guestId: 'gst_nandhini',
      roomId: 'rm_v201',
      bedId: 'bed_v201a',
      purposeOfStay: 'Internship',
      checkInAt: isoDaysOffset(-6, 11),
      expectedCheckoutDate: ymdDaysOffset(24),
      actualCheckoutAt: null,
      status: 'active',
      agreedAmount: 8800,
      createdAt: isoDaysOffset(-6),
    },
  ];

  const payments: Payment[] = [
    // Tenant 1: Paid, Partially Paid, Unpaid, Overdue, Refunded
    {
      id: 'pay_1',
      tenantId: t1,
      stayId: 'sty_past_karthik',
      guestId: 'gst_karthik',
      amount: 7500,
      paidAmount: 7500,
      status: 'paid',
      paymentMode: 'upi',
      paymentDate: ymdDaysOffset(-68),
      dueDate: ymdDaysOffset(-68),
      referenceNote: 'GPay UTR-429018442110',
      receiptNumber: 'CMPG-2026-0041',
      description: 'Previous internship stay fee',
      createdAt: isoDaysOffset(-68),
    },
    {
      id: 'pay_2',
      tenantId: t1,
      stayId: 'sty_past_manoj',
      guestId: 'gst_manoj_former',
      amount: 7800,
      paidAmount: 7800,
      status: 'paid',
      paymentMode: 'cash',
      paymentDate: ymdDaysOffset(-62),
      dueDate: ymdDaysOffset(-62),
      referenceNote: 'Warden desk cash receipt',
      receiptNumber: 'CMPG-2026-0054',
      description: 'Room 102 Bed C stay settlement',
      createdAt: isoDaysOffset(-62),
    },
    {
      id: 'pay_3',
      tenantId: t1,
      stayId: 'sty_1',
      guestId: 'gst_karthik',
      amount: 9500,
      paidAmount: 9500,
      status: 'paid',
      paymentMode: 'upi',
      paymentDate: ymdDaysOffset(-12),
      dueDate: ymdDaysOffset(-10),
      referenceNote: 'PhonePe UTR-88210455',
      receiptNumber: 'CMPG-2026-0102',
      description: 'Room 101 Bed A monthly rent',
      createdAt: isoDaysOffset(-12),
    },
    {
      id: 'pay_4',
      tenantId: t1,
      stayId: 'sty_5',
      guestId: 'gst_siddharth',
      amount: 14500,
      paidAmount: 14500,
      status: 'paid',
      paymentMode: 'bank_transfer',
      paymentDate: ymdDaysOffset(-8),
      dueDate: ymdDaysOffset(-7),
      referenceNote: 'IMPS-99104821',
      receiptNumber: 'CMPG-2026-0115',
      description: 'Single AC Room 103 monthly rent',
      createdAt: isoDaysOffset(-8),
    },
    {
      id: 'pay_5',
      tenantId: t1,
      stayId: 'sty_7',
      guestId: 'gst_harish',
      amount: 9800,
      paidAmount: 9800,
      status: 'paid',
      paymentMode: 'upi',
      paymentDate: ymdDaysOffset(-5),
      dueDate: ymdDaysOffset(-5),
      referenceNote: 'GPay UTR-77412098',
      receiptNumber: 'CMPG-2026-0124',
      description: 'Room 201 Bed B check-in rent',
      createdAt: isoDaysOffset(-5),
    },
    {
      id: 'pay_6',
      tenantId: t1,
      stayId: 'sty_9',
      guestId: 'gst_saravanan',
      amount: 7500,
      paidAmount: 7500,
      status: 'paid',
      paymentMode: 'cash',
      paymentDate: ymdDaysOffset(-3),
      dueDate: ymdDaysOffset(-3),
      referenceNote: 'Cash book #418',
      receiptNumber: 'CMPG-2026-0131',
      description: 'Room 203 Bed A stay charge',
      createdAt: isoDaysOffset(-3),
    },
    {
      id: 'pay_7',
      tenantId: t1,
      stayId: 'sty_10',
      guestId: 'gst_balaji',
      amount: 7500,
      paidAmount: 7500,
      status: 'paid',
      paymentMode: 'upi',
      paymentDate: ymdDaysOffset(-1),
      dueDate: ymdDaysOffset(0),
      referenceNote: 'BHIM UTR-66420019',
      receiptNumber: 'CMPG-2026-0139',
      description: 'Room 203 Bed C monthly rent',
      createdAt: isoDaysOffset(-1),
    },
    {
      id: 'pay_partial_aravind',
      tenantId: t1,
      stayId: 'sty_2',
      guestId: 'gst_aravind',
      amount: 9500,
      paidAmount: 5000,
      status: 'partially_paid',
      paymentMode: 'upi',
      paymentDate: ymdDaysOffset(-6),
      dueDate: ymdDaysOffset(2),
      referenceNote: 'Part-paid ₹5,000 via GPay; ₹4,500 balance',
      receiptNumber: 'CMPG-2026-0128',
      description: 'Room 101 Bed B current cycle rent',
      createdAt: isoDaysOffset(-6),
    },
    {
      id: 'pay_overdue_praveen',
      tenantId: t1,
      stayId: 'sty_4',
      guestId: 'gst_praveen',
      amount: 7800,
      paidAmount: 0,
      status: 'overdue',
      paymentMode: null,
      paymentDate: null,
      dueDate: ymdDaysOffset(-5),
      referenceNote: 'Pending follow-up',
      receiptNumber: null,
      description: 'Room 102 Bed B stay charge',
      createdAt: isoDaysOffset(-10),
    },
    {
      id: 'pay_overdue_dinesh',
      tenantId: t1,
      stayId: 'sty_8',
      guestId: 'gst_dinesh',
      amount: 7800,
      paidAmount: 0,
      status: 'overdue',
      paymentMode: null,
      paymentDate: null,
      dueDate: ymdDaysOffset(-3),
      referenceNote: 'Promised transfer this evening',
      receiptNumber: null,
      description: 'Room 202 Bed A stay charge',
      createdAt: isoDaysOffset(-7),
    },
    {
      id: 'pay_unpaid_vignesh',
      tenantId: t1,
      stayId: 'sty_3',
      guestId: 'gst_vignesh',
      amount: 7800,
      paidAmount: 0,
      status: 'unpaid',
      paymentMode: null,
      paymentDate: null,
      dueDate: ymdDaysOffset(2),
      referenceNote: 'Due on renewal/checkout',
      receiptNumber: null,
      description: 'Room 102 Bed A current period',
      createdAt: isoDaysOffset(-4),
    },
    {
      id: 'pay_unpaid_gokul',
      tenantId: t1,
      stayId: 'sty_11',
      guestId: 'gst_gokul',
      amount: 6500,
      paidAmount: 0,
      status: 'unpaid',
      paymentMode: null,
      paymentDate: null,
      dueDate: ymdDaysOffset(5),
      referenceNote: 'Awaiting stipend credit',
      receiptNumber: null,
      description: 'Room 301 Bed A stay charge',
      createdAt: isoDaysOffset(-2),
    },
    {
      id: 'pay_refunded_deepan',
      tenantId: t1,
      stayId: 'sty_cancelled_deepan',
      guestId: 'gst_deepan_inactive',
      amount: 3000,
      paidAmount: 3000,
      refundedAmount: 3000,
      status: 'refunded',
      paymentMode: 'upi',
      paymentDate: ymdDaysOffset(-40),
      refundDate: ymdDaysOffset(-38),
      dueDate: ymdDaysOffset(-40),
      referenceNote: 'Advance refunded via UPI after booking cancellation',
      receiptNumber: 'CMPG-2026-0077',
      description: 'Booking advance (cancelled)',
      createdAt: isoDaysOffset(-40),
    },

    // Tenant 2 payments
    {
      id: 'pay_v1',
      tenantId: t2,
      stayId: 'sty_v1',
      guestId: 'gst_ananya',
      amount: 8500,
      paidAmount: 8500,
      status: 'paid',
      paymentMode: 'upi',
      paymentDate: ymdDaysOffset(-8),
      dueDate: ymdDaysOffset(-7),
      referenceNote: 'GPay UTR-77829012',
      receiptNumber: 'MWPG-2026-0091',
      description: 'Room A-101 Bed A rent',
      createdAt: isoDaysOffset(-8),
    },
    {
      id: 'pay_v2',
      tenantId: t2,
      stayId: 'sty_v3',
      guestId: 'gst_divya',
      amount: 12500,
      paidAmount: 6500,
      status: 'partially_paid',
      paymentMode: 'upi',
      paymentDate: ymdDaysOffset(-4),
      dueDate: ymdDaysOffset(2),
      referenceNote: 'Part-paid ₹6,500',
      receiptNumber: 'MWPG-2026-0095',
      description: 'Single room A-102 rent',
      createdAt: isoDaysOffset(-4),
    },
    {
      id: 'pay_v3',
      tenantId: t2,
      stayId: 'sty_v4',
      guestId: 'gst_sneha',
      amount: 7000,
      paidAmount: 0,
      status: 'overdue',
      paymentMode: null,
      paymentDate: null,
      dueDate: ymdDaysOffset(-2),
      referenceNote: 'Pending payment',
      receiptNumber: null,
      description: 'Room A-103 Bed A stay charge',
      createdAt: isoDaysOffset(-6),
    },
    {
      id: 'pay_v4',
      tenantId: t2,
      stayId: 'sty_v5',
      guestId: 'gst_nandhini',
      amount: 8800,
      paidAmount: 8800,
      status: 'paid',
      paymentMode: 'cash',
      paymentDate: ymdDaysOffset(-6),
      dueDate: ymdDaysOffset(-6),
      referenceNote: 'Desk cash receipt',
      receiptNumber: 'MWPG-2026-0098',
      description: 'Room B-201 Bed A check-in rent',
      createdAt: isoDaysOffset(-6),
    },
  ];

  // Separate refundable security deposits (excluded from operating revenue)
  const deposits: Deposit[] = [
    {
      id: 'dep_1',
      tenantId: t1,
      stayId: 'sty_1',
      guestId: 'gst_karthik',
      amount: 10000,
      adjustedAmount: 0,
      refundedAmount: 0,
      status: 'held',
      paymentMode: 'upi',
      collectedDate: ymdDaysOffset(-42),
      referenceNote: 'DEP-UTR-41200981',
      notes: 'Refundable security deposit held.',
      createdAt: isoDaysOffset(-42),
    },
    {
      id: 'dep_2',
      tenantId: t1,
      stayId: 'sty_5',
      guestId: 'gst_siddharth',
      amount: 15000,
      adjustedAmount: 0,
      refundedAmount: 0,
      status: 'held',
      paymentMode: 'bank_transfer',
      collectedDate: ymdDaysOffset(-55),
      referenceNote: 'IMPS-5519023',
      notes: 'AC single room refundable deposit.',
      createdAt: isoDaysOffset(-55),
    },
    {
      id: 'dep_3',
      tenantId: t1,
      stayId: 'sty_2',
      guestId: 'gst_aravind',
      amount: 10000,
      adjustedAmount: 0,
      refundedAmount: 0,
      status: 'held',
      paymentMode: 'upi',
      collectedDate: ymdDaysOffset(-30),
      referenceNote: 'GPay DEP-8812',
      notes: 'Standard 1-month refundable deposit.',
      createdAt: isoDaysOffset(-30),
    },
    {
      id: 'dep_4',
      tenantId: t1,
      stayId: 'sty_6',
      guestId: 'gst_naveen',
      amount: 10000,
      adjustedAmount: 1500,
      refundedAmount: 0,
      status: 'partially_adjusted',
      paymentMode: 'cash',
      collectedDate: ymdDaysOffset(-20),
      referenceNote: '₹1,500 adjusted toward EB / key replacement',
      notes: 'Remaining ₹8,500 ready for checkout refund.',
      createdAt: isoDaysOffset(-20),
    },
    {
      id: 'dep_5',
      tenantId: t1,
      stayId: 'sty_past_manoj',
      guestId: 'gst_manoj_former',
      amount: 8000,
      adjustedAmount: 500,
      refundedAmount: 7500,
      status: 'refunded',
      paymentMode: 'upi',
      collectedDate: ymdDaysOffset(-95),
      refundMode: 'upi',
      refundDate: ymdDaysOffset(-34),
      referenceNote: 'Refund UTR-90123881 (₹500 EB deducted)',
      notes: 'Full settlement completed after room inspection.',
      createdAt: isoDaysOffset(-95),
    },
    // Tenant 2 deposits
    {
      id: 'dep_v1',
      tenantId: t2,
      stayId: 'sty_v1',
      guestId: 'gst_ananya',
      amount: 10000,
      adjustedAmount: 0,
      refundedAmount: 0,
      status: 'held',
      paymentMode: 'upi',
      collectedDate: ymdDaysOffset(-30),
      referenceNote: 'GPay DEP-3109',
      notes: 'Refundable security deposit.',
      createdAt: isoDaysOffset(-30),
    },
    {
      id: 'dep_v2',
      tenantId: t2,
      stayId: 'sty_v_past',
      guestId: 'gst_kavya_former',
      amount: 7000,
      adjustedAmount: 0,
      refundedAmount: 7000,
      status: 'refunded',
      paymentMode: 'cash',
      collectedDate: ymdDaysOffset(-65),
      refundMode: 'upi',
      refundDate: ymdDaysOffset(-35),
      referenceNote: 'Refunded via GPay on checkout',
      notes: 'Settled cleanly.',
      createdAt: isoDaysOffset(-65),
    },
  ];

  // Operating expenses across all 5 categories
  const expenses: Expense[] = [
    {
      id: 'exp_1',
      tenantId: t1,
      expenseDate: ymdDaysOffset(-14),
      category: 'utilities',
      amount: 14850,
      paymentMode: 'upi',
      vendorName: 'TANGEDCO EB Bill (Adyar)',
      note: 'Bi-monthly electricity bill for Hostel Block A & B',
      recordedByName: 'Suresh Natarajan',
      createdAt: isoDaysOffset(-14),
    },
    {
      id: 'exp_2',
      tenantId: t1,
      expenseDate: ymdDaysOffset(-9),
      category: 'repairs_maintenance',
      amount: 3400,
      paymentMode: 'cash',
      vendorName: 'Murugan Plumbing & Electricals',
      note: 'Room 202 geyser thermostat + Bed B weld repair',
      recordedByName: 'Murugan Vel',
      createdAt: isoDaysOffset(-9),
    },
    {
      id: 'exp_3',
      tenantId: t1,
      expenseDate: ymdDaysOffset(-6),
      category: 'supplies',
      amount: 2650,
      paymentMode: 'upi',
      vendorName: 'Adyar Housekeeping Mart',
      note: 'Disinfectant, phenyl, LED bulbs, and RO sediment filter',
      recordedByName: 'Prakash Rajendran',
      createdAt: isoDaysOffset(-6),
    },
    {
      id: 'exp_4',
      tenantId: t1,
      expenseDate: ymdDaysOffset(-3),
      category: 'food',
      amount: 11200,
      paymentMode: 'bank_transfer',
      vendorName: 'Sri Annapoorna Mess Supplies',
      note: 'Weekly rice, groceries, & tiffin provisions',
      recordedByName: 'Suresh Natarajan',
      createdAt: isoDaysOffset(-3),
    },
    {
      id: 'exp_5',
      tenantId: t1,
      expenseDate: ymdDaysOffset(-1),
      category: 'other',
      amount: 1800,
      paymentMode: 'upi',
      vendorName: 'ACT Fibernet Broadband',
      note: '300 Mbps hostel Wi-Fi renewal',
      recordedByName: 'Suresh Natarajan',
      createdAt: isoDaysOffset(-1),
    },
    {
      id: 'exp_v1',
      tenantId: t2,
      expenseDate: ymdDaysOffset(-10),
      category: 'utilities',
      amount: 8200,
      paymentMode: 'upi',
      vendorName: 'TANGEDCO Madurai East',
      note: 'Hostel EB payment',
      recordedByName: 'Kavitha Selvam',
      createdAt: isoDaysOffset(-10),
    },
    {
      id: 'exp_v2',
      tenantId: t2,
      expenseDate: ymdDaysOffset(-4),
      category: 'food',
      amount: 7600,
      paymentMode: 'cash',
      vendorName: 'Madurai Central Market Vendors',
      note: 'Weekly kitchen vegetables & provisions',
      recordedByName: 'Revathi Balasubramanian',
      createdAt: isoDaysOffset(-4),
    },
  ];

  // Sample private identity documents
  const docSpecs: Array<{
    id: string;
    tenantId: string;
    guestId: string;
    stayId: string | null;
    docRole: IdentityDocument['docRole'];
    idType: IdDocumentType;
    fileName: string;
    guestName: string;
    maskedId: string;
    docLabel: string;
    uploadedAt: string;
  }> = [
    {
      id: 'doc_1',
      tenantId: t1,
      guestId: 'gst_karthik',
      stayId: 'sty_1',
      docRole: 'id_front',
      idType: 'aadhaar',
      fileName: 'karthik_aadhaar_front.svg',
      guestName: 'Karthik Subramanian',
      maskedId: 'XXXX-XXXX-9104',
      docLabel: 'Aadhaar Front (Masked Sample)',
      uploadedAt: isoDaysOffset(-42),
    },
    {
      id: 'doc_2',
      tenantId: t1,
      guestId: 'gst_aravind',
      stayId: 'sty_2',
      docRole: 'id_front',
      idType: 'driving_licence',
      fileName: 'aravind_dl_front.svg',
      guestName: 'Aravindhan Muthu',
      maskedId: 'TN30-XXXX-7732',
      docLabel: 'Driving Licence Front',
      uploadedAt: isoDaysOffset(-30),
    },
    {
      id: 'doc_3',
      tenantId: t1,
      guestId: 'gst_siddharth',
      stayId: 'sty_5',
      docRole: 'id_front',
      idType: 'passport',
      fileName: 'siddharth_passport.svg',
      guestName: 'Siddharth Menon',
      maskedId: 'XXXX-6042',
      docLabel: 'Passport Bio Page',
      uploadedAt: isoDaysOffset(-55),
    },
    {
      id: 'doc_v1',
      tenantId: t2,
      guestId: 'gst_ananya',
      stayId: 'sty_v1',
      docRole: 'id_front',
      idType: 'aadhaar',
      fileName: 'keerthana_aadhaar_front.svg',
      guestName: 'Keerthana Selvaraj',
      maskedId: 'XXXX-XXXX-5091',
      docLabel: 'Aadhaar Front (Masked Sample)',
      uploadedAt: isoDaysOffset(-30),
    },
  ];

  const documents: IdentityDocument[] = docSpecs.map((spec) => {
    const objectKey = `${spec.id}_${crypto.randomUUID().slice(0, 8)}`;
    const buf = createSampleSvgDocument(
      spec.tenantId === t1 ? "Cauvery Men's Hostel & PG" : "Meenakshi Women's PG",
      spec.guestName,
      spec.maskedId,
      spec.docLabel
    );
    writePrivateObject(spec.tenantId, objectKey, buf);
    return {
      id: spec.id,
      tenantId: spec.tenantId,
      guestId: spec.guestId,
      stayId: spec.stayId,
      docRole: spec.docRole,
      idType: spec.idType,
      originalFileName: spec.fileName,
      mimeType: 'image/png',
      sizeBytes: buf.length,
      objectKey,
      uploadedAt: spec.uploadedAt,
    };
  });

  const callAttempts: CallAttempt[] = [
    {
      id: 'call_1',
      tenantId: t1,
      guestId: 'gst_karthik',
      targetPhoneMasked: maskPhone('+91 94431 22908'),
      initiatedByUserId: 'usr_suresh',
      initiatedByName: 'Suresh Natarajan',
      provider: 'mock',
      providerCallRef: 'MOCK-CALL-40219',
      outcome: 'verified',
      notes: 'Spoke with father Raghavan in Pollachi; confirmed employment.',
      createdAt: isoDaysOffset(-41),
    },
    {
      id: 'call_2',
      tenantId: t1,
      guestId: 'gst_praveen',
      targetPhoneMasked: maskPhone('+91 94440 31882'),
      initiatedByUserId: 'usr_murugan',
      initiatedByName: 'Murugan Vel',
      provider: 'mock',
      providerCallRef: 'MOCK-CALL-41802',
      outcome: 'no_answer',
      notes: 'No answer on alternate phone; will retry tomorrow.',
      createdAt: isoDaysOffset(-2),
    },
    {
      id: 'call_v1',
      tenantId: t2,
      guestId: 'gst_ananya',
      targetPhoneMasked: maskPhone('+91 94430 33409'),
      initiatedByUserId: 'usr_kavitha',
      initiatedByName: 'Kavitha Selvam',
      provider: 'mock',
      providerCallRef: 'MOCK-CALL-77410',
      outcome: 'verified',
      notes: 'Father Selvaraj confirmed stay.',
      createdAt: isoDaysOffset(-29),
    },
  ];

  const reminderLogs: ReminderLog[] = [
    {
      id: 'rem_1',
      tenantId: t1,
      stayId: 'sty_4',
      paymentId: 'pay_overdue_praveen',
      guestId: 'gst_praveen',
      guestName: 'Praveen Rajkumar',
      roomLabel: '102-B',
      type: 'unpaid_charge',
      channel: 'sms',
      recipientMasked: maskPhone('+91 91764 66709'),
      messagePreview: `Reminder from Cauvery Men's Hostel & PG: Payment of ₹7,800 for Room 102 is due on ${ymdDaysOffset(-5)}.`,
      provider: 'mock',
      status: 'mocked',
      dueDate: ymdDaysOffset(-5),
      attemptedAt: isoDaysOffset(-2),
      sentByName: 'Suresh Natarajan',
      createdAt: isoDaysOffset(-2),
    },
    {
      id: 'rem_2',
      tenantId: t1,
      stayId: 'sty_4',
      paymentId: 'pay_overdue_praveen',
      guestId: 'gst_praveen',
      guestName: 'Praveen Rajkumar',
      roomLabel: '102-B',
      type: 'unpaid_charge',
      channel: 'sms',
      recipientMasked: maskPhone('+91 91764 66709'),
      messagePreview: `Reminder from Cauvery Men's Hostel & PG: Payment of ₹7,800 for Room 102 is due on ${ymdDaysOffset(-5)}.`,
      provider: 'mock',
      status: 'blocked_duplicate',
      dueDate: ymdDaysOffset(-5),
      attemptedAt: isoDaysOffset(-2, 14),
      errorReason: 'Duplicate blocked within 24h cooldown window.',
      sentByName: 'Murugan Vel',
      createdAt: isoDaysOffset(-2, 14),
    },
    {
      id: 'rem_3',
      tenantId: t1,
      stayId: 'sty_3',
      guestId: 'gst_vignesh',
      guestName: 'Vigneshwaran S.',
      roomLabel: '102-A',
      type: 'checkout_upcoming',
      channel: 'whatsapp',
      recipientMasked: maskPhone('+91 96770 88450'),
      messagePreview: `Hello Vigneshwaran S., your stay at Cauvery Men's Hostel & PG (Room 102) is scheduled for checkout on ${ymdDaysOffset(2)}.`,
      provider: 'mock',
      status: 'scheduled',
      dueDate: ymdDaysOffset(2),
      scheduledFor: isoDaysOffset(1, 9),
      sentByName: 'Suresh Natarajan',
      createdAt: isoDaysOffset(-1),
    },
    {
      id: 'rem_4',
      tenantId: t1,
      stayId: 'sty_8',
      paymentId: 'pay_overdue_dinesh',
      guestId: 'gst_dinesh',
      guestName: 'Dinesh Babu K.',
      roomLabel: '202-A',
      type: 'unpaid_charge',
      channel: 'whatsapp',
      recipientMasked: maskPhone('+91 90034 51289'),
      messagePreview: `Reminder from Cauvery Men's Hostel & PG: Payment of ₹7,800 for Room 202 is due on ${ymdDaysOffset(-3)}.`,
      provider: 'mock',
      status: 'failed',
      dueDate: ymdDaysOffset(-3),
      attemptedAt: isoDaysOffset(-1, 11),
      errorReason: 'Simulated WhatsApp opt-in timeout (retry available).',
      sentByName: 'Prakash Rajendran',
      createdAt: isoDaysOffset(-1, 11),
    },
    {
      id: 'rem_5',
      tenantId: t1,
      stayId: 'sty_2',
      paymentId: 'pay_partial_aravind',
      guestId: 'gst_aravind',
      guestName: 'Aravindhan Muthu',
      roomLabel: '101-B',
      type: 'unpaid_charge',
      channel: 'sms',
      recipientMasked: maskPhone('+91 98422 56120'),
      messagePreview: `Reminder from Cauvery Men's Hostel & PG: Balance of ₹4,500 for Room 101 is due on ${ymdDaysOffset(2)}.`,
      provider: 'mock',
      status: 'cancelled',
      dueDate: ymdDaysOffset(2),
      sentByName: 'Suresh Natarajan',
      createdAt: isoDaysOffset(-3),
    },
    {
      id: 'rem_v1',
      tenantId: t2,
      stayId: 'sty_v4',
      paymentId: 'pay_v3',
      guestId: 'gst_sneha',
      guestName: 'Sneha Sundari R.',
      roomLabel: 'A-103-A',
      type: 'unpaid_charge',
      channel: 'sms',
      recipientMasked: maskPhone('+91 98424 77109'),
      messagePreview: `Meenakshi Women's PG நினைவூட்டல்: அறை A-103 கட்டணம் ₹7,000 (${ymdDaysOffset(-2)}).`,
      provider: 'mock',
      status: 'mocked',
      dueDate: ymdDaysOffset(-2),
      attemptedAt: isoDaysOffset(-1),
      sentByName: 'Kavitha Selvam',
      createdAt: isoDaysOffset(-1),
    },
  ];

  return {
    seedVersion: CURRENT_SEED_VERSION,
    tenants,
    users,
    rooms,
    beds,
    guests,
    stays,
    payments,
    deposits,
    expenses,
    documents,
    callAttempts,
    reminderLogs,
    notifications: [],
    notificationPolicy: createDefaultNotificationPolicy(),
    userNotificationPreferences: {},
    complaints: [],
    maintenanceRequests: [],
    visitorEntries: [],
    announcements: [],
  };
}

class TenantStore {
  private state: DatabaseState;

  constructor() {
    ensureDirs();
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as DatabaseState;
        if ((parsed.seedVersion || 1) < CURRENT_SEED_VERSION) {
          this.state = buildInitialSeedState();
          this.ensureHierarchyMetadata();
          this.persist();
        } else {
          this.state = {
            ...parsed,
            deposits: parsed.deposits || [],
            expenses: parsed.expenses || [],
            notifications: parsed.notifications || [],
            notificationPolicy: parsed.notificationPolicy || createDefaultNotificationPolicy(),
            userNotificationPreferences: parsed.userNotificationPreferences || {},
            complaints: parsed.complaints || [],
            maintenanceRequests: parsed.maintenanceRequests || [],
            visitorEntries: parsed.visitorEntries || [],
            announcements: parsed.announcements || [],
          };
          if (this.ensureHierarchyMetadata()) {
            this.persist();
          }
        }
      } catch {
        this.state = buildInitialSeedState();
        this.ensureHierarchyMetadata();
        this.persist();
      }
    } else {
      this.state = buildInitialSeedState();
      this.ensureHierarchyMetadata();
      this.persist();
    }
  }

  private ensureHierarchyMetadata(): boolean {
    let changed = false;
    const defaultTenantId = this.state.tenants[0]?.id || 'ten_lakshmi_pg';

    if (!this.state.notifications) {
      this.state.notifications = [];
      changed = true;
    }
    if (!this.state.notificationPolicy) {
      this.state.notificationPolicy = createDefaultNotificationPolicy();
      changed = true;
    }
    if (!this.state.userNotificationPreferences) {
      this.state.userNotificationPreferences = {};
      changed = true;
    }
    if (!this.state.complaints) {
      this.state.complaints = [];
      changed = true;
    }
    if (!this.state.maintenanceRequests) {
      this.state.maintenanceRequests = [];
      changed = true;
    }
    if (!this.state.visitorEntries) {
      this.state.visitorEntries = [];
      changed = true;
    }
    if (!this.state.announcements) {
      this.state.announcements = [];
      changed = true;
    }

    for (const tenant of this.state.tenants) {
      if (!tenant.status) {
        tenant.status = 'active';
        changed = true;
      }
      if (!tenant.planTier) {
        tenant.planTier = 'lifetime';
        changed = true;
      }
      if (!tenant.ownerId) {
        const ownerUser = this.state.users.find(
          (u) => u.tenantId === tenant.id && u.role === 'owner'
        );
        if (ownerUser) {
          tenant.ownerId = ownerUser.id;
          changed = true;
        }
      }
    }

    if (!this.state.users.some((u) => u.role === 'overall_admin')) {
      const adminPass = process.env.OVERALL_ADMIN_PASSWORD || 'warden123';
      this.state.users.unshift({
        id: 'usr_overall_admin',
        tenantId: defaultTenantId,
        name: 'Anand Subramanian',
        email: 'admin@nivasdesk.example',
        role: 'overall_admin',
        isActive: true,
        passwordHash: hashPassword(adminPass),
        createdAt: isoDaysOffset(-180),
      });
      changed = true;
    }

    // Seed second sample PG branch for Suresh if ten_lakshmi_pg exists and ten_cauvery_annex does not
    const hasAnnex = this.state.tenants.some((t) => t.id === 'ten_cauvery_annex');
    const suresh = this.state.users.find((u) => u.id === 'usr_suresh');
    if (!hasAnnex && suresh) {
      const t3 = 'ten_cauvery_annex';
      this.state.tenants.push({
        id: t3,
        name: 'Cauvery IT Annex PG',
        city: 'Chennai',
        district: 'Chennai',
        locality: 'Velachery (100 Feet Bypass)',
        pincode: '600042',
        landmark: 'Near Vijayanagar Bus Terminus',
        address: '88, 100 Feet Bypass Road, Velachery, Chennai, Tamil Nadu 600042',
        wardenPhone: '+91 98409 77812',
        gstinOrReg: 'TN-CHN-PG-2025-0341',
        timezone: 'Asia/Kolkata',
        preferredLanguage: 'en',
        houseRules:
          '1. Gate access via smart card after 11:00 PM.\n2. Quiet hours from 11:00 PM to 6:00 AM.',
        receiptPrefix: 'CIAP',
        agreementNotes:
          'Managed under Cauvery PG Group. Monthly rent billed on check-in anniversary.',
        isSample: true,
        ownerId: suresh.id,
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
        createdAt: isoDaysOffset(-95),
      });

      if (!this.state.users.some((u) => u.email === 'warden.velachery@cauverypg.example')) {
        this.state.users.push({
          id: 'usr_velachery_warden',
          tenantId: t3,
          name: 'Balaji Krishnamurthy',
          email: 'warden.velachery@cauverypg.example',
          role: 'warden',
          isActive: true,
          passwordHash: hashPassword('warden123'),
          createdAt: isoDaysOffset(-90),
        });
      }

      this.state.rooms.push(
        {
          id: 'rm_v_301',
          tenantId: t3,
          roomNumber: '301',
          floor: '3rd Floor',
          roomType: '2-Sharing',
          capacity: 2,
          monthlyTariff: 10500,
          facilities: ['AC', 'Wi-Fi', 'Attached Bath', 'Power Backup'],
          status: 'occupied',
          createdAt: isoDaysOffset(-85),
        },
        {
          id: 'rm_v_302',
          tenantId: t3,
          roomNumber: '302',
          floor: '3rd Floor',
          roomType: '3-Sharing',
          capacity: 3,
          monthlyTariff: 8200,
          facilities: ['Wi-Fi', 'RO Water', 'Laundry'],
          status: 'available',
          createdAt: isoDaysOffset(-85),
        }
      );

      this.state.beds.push(
        { id: 'bed_v_301a', tenantId: t3, roomId: 'rm_v_301', bedLabel: 'A', status: 'occupied', currentStayId: 'sty_v_annex1' },
        { id: 'bed_v_301b', tenantId: t3, roomId: 'rm_v_301', bedLabel: 'B', status: 'occupied', currentStayId: 'sty_v_annex2' },
        { id: 'bed_v_302a', tenantId: t3, roomId: 'rm_v_302', bedLabel: 'A', status: 'vacant', currentStayId: null },
        { id: 'bed_v_302b', tenantId: t3, roomId: 'rm_v_302', bedLabel: 'B', status: 'vacant', currentStayId: null },
        { id: 'bed_v_302c', tenantId: t3, roomId: 'rm_v_302', bedLabel: 'C', status: 'vacant', currentStayId: null }
      );

      this.state.guests.push(
        {
          id: 'gst_annex_1',
          tenantId: t3,
          fullName: 'Naveen Kumar M.',
          primaryPhone: '+91 98405 11209',
          alternativePhone: '+91 98405 11210',
          currentAddress: 'TCS Siruseri Campus, Chennai',
          permanentAddress: '19, Salem Main Road, Namakkal 637001',
          emergencyContactName: 'Muthusamy K.',
          emergencyContactRelation: 'Father',
          emergencyContactPhone: '+91 98405 11210',
          idType: 'aadhaar',
          idLast4: '4419',
          idMasked: 'XXXX-XXXX-4419',
          consentGiven: true,
          consentNotes: 'Verified at Velachery Annex check-in',
          status: 'active',
          altPhoneVerified: 'verified',
          notes: 'Software Engineer',
          createdAt: isoDaysOffset(-40),
        },
        {
          id: 'gst_annex_2',
          tenantId: t3,
          fullName: 'Deepak Chandran',
          primaryPhone: '+91 97890 44123',
          alternativePhone: '+91 97890 44124',
          currentAddress: 'Tidel Park, Taramani, Chennai',
          permanentAddress: '52, Gandhipuram, Coimbatore 641012',
          emergencyContactName: 'Chandran P.',
          emergencyContactRelation: 'Father',
          emergencyContactPhone: '+91 97890 44124',
          idType: 'aadhaar',
          idLast4: '8921',
          idMasked: 'XXXX-XXXX-8921',
          consentGiven: true,
          consentNotes: 'Verified at Velachery Annex check-in',
          status: 'active',
          altPhoneVerified: 'verified',
          notes: 'Analyst',
          createdAt: isoDaysOffset(-25),
        }
      );

      this.state.stays.push(
        {
          id: 'sty_v_annex1',
          tenantId: t3,
          guestId: 'gst_annex_1',
          roomId: 'rm_v_301',
          bedId: 'bed_v_301a',
          purposeOfStay: 'IT Employment',
          checkInAt: isoDaysOffset(-25),
          expectedCheckoutDate: '',
          actualCheckoutAt: null,
          status: 'active',
          agreedAmount: 10500,
          createdAt: isoDaysOffset(-25),
        },
        {
          id: 'sty_v_annex2',
          tenantId: t3,
          guestId: 'gst_annex_2',
          roomId: 'rm_v_301',
          bedId: 'bed_v_301b',
          purposeOfStay: 'IT Employment',
          checkInAt: isoDaysOffset(-18),
          expectedCheckoutDate: '',
          actualCheckoutAt: null,
          status: 'active',
          agreedAmount: 10500,
          createdAt: isoDaysOffset(-18),
        }
      );

      this.state.payments.push(
        {
          id: 'pay_annex_1',
          tenantId: t3,
          stayId: 'sty_v_annex1',
          guestId: 'gst_annex_1',
          amount: 10500,
          paidAmount: 10500,
          status: 'paid',
          paymentMode: 'upi',
          paymentDate: ymdDaysOffset(-10),
          dueDate: ymdDaysOffset(5),
          referenceNote: 'GPay Velachery',
          receiptNumber: 'CIAP-2025-1042',
          description: 'Monthly Room Rent',
          createdAt: isoDaysOffset(-10),
        },
        {
          id: 'pay_annex_2',
          tenantId: t3,
          stayId: 'sty_v_annex2',
          guestId: 'gst_annex_2',
          amount: 10500,
          paidAmount: 0,
          status: 'unpaid',
          paymentMode: null,
          paymentDate: null,
          dueDate: ymdDaysOffset(12),
          referenceNote: '',
          receiptNumber: null,
          description: 'Monthly Room Rent',
          createdAt: isoDaysOffset(-18),
        }
      );

      this.state.expenses.push({
        id: 'exp_annex_1',
        tenantId: t3,
        expenseDate: ymdDaysOffset(-6),
        category: 'utilities',
        amount: 6400,
        paymentMode: 'upi',
        vendorName: 'TANGEDCO Velachery',
        note: 'EB bill & fiber broadband',
        recordedByName: 'Balaji Krishnamurthy',
        createdAt: isoDaysOffset(-6),
      });

      changed = true;
    }

    return changed;
  }

  private persist() {
    ensureDirs();
    const tempPath = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(this.state, null, 2), 'utf-8');
    fs.renameSync(tempPath, DB_FILE);
  }

  public getRawState(): DatabaseState {
    return this.state;
  }

  public save() {
    this.persist();
  }

  public resetSampleData() {
    this.state = buildInitialSeedState();
    this.ensureHierarchyMetadata();
    this.persist();
  }

  public getTenantById(tenantId: string): Tenant | undefined {
    return this.state.tenants.find((t) => t.id === tenantId);
  }

  public getUsers(tenantId: string): StoredUser[] {
    return this.state.users.filter((u) => u.tenantId === tenantId && u.role !== 'overall_admin');
  }

  public getRooms(tenantId: string): Room[] {
    return this.state.rooms.filter((r) => r.tenantId === tenantId);
  }

  public getBeds(tenantId: string): Bed[] {
    return this.state.beds.filter((b) => b.tenantId === tenantId);
  }

  public getGuests(tenantId: string): Guest[] {
    return this.state.guests.filter((g) => g.tenantId === tenantId);
  }

  public getStays(tenantId: string): Stay[] {
    return this.state.stays.filter((s) => s.tenantId === tenantId);
  }

  public getPayments(tenantId: string): Payment[] {
    return this.state.payments.filter((p) => p.tenantId === tenantId);
  }

  public getDeposits(tenantId: string): Deposit[] {
    return this.state.deposits.filter((d) => d.tenantId === tenantId);
  }

  public getExpenses(tenantId: string): Expense[] {
    return this.state.expenses.filter((e) => e.tenantId === tenantId);
  }

  public getDocuments(tenantId: string): IdentityDocument[] {
    return this.state.documents.filter((d) => d.tenantId === tenantId);
  }

  public getCallAttempts(tenantId: string, guestId?: string): CallAttempt[] {
    return this.state.callAttempts
      .filter((c) => c.tenantId === tenantId && (!guestId || c.guestId === guestId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public getReminderLogs(tenantId: string, stayId?: string): ReminderLog[] {
    return this.state.reminderLogs
      .filter((r) => r.tenantId === tenantId && (!stayId || r.stayId === stayId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public getNotifications(): AppNotification[] {
    if (!this.state.notifications) {
      this.state.notifications = [];
    }
    return this.state.notifications;
  }

  public getNotificationPolicy(): AdminNotificationPolicy {
    if (!this.state.notificationPolicy) {
      this.state.notificationPolicy = createDefaultNotificationPolicy();
    }
    return this.state.notificationPolicy;
  }

  public getUserNotificationPreferences(userId: string): UserNotificationPreferences {
    if (!this.state.userNotificationPreferences) {
      this.state.userNotificationPreferences = {};
    }
    const existing = this.state.userNotificationPreferences[userId];
    if (existing) {
      return existing;
    }
    return createDefaultUserNotificationPreferences(userId);
  }

  public getComplaints(tenantId?: string): ComplaintRecord[] {
    const items = this.state.complaints || [];
    return (tenantId ? items.filter((c) => c.tenantId === tenantId) : items)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public getMaintenanceRequests(tenantId?: string): MaintenanceRequestRecord[] {
    const items = this.state.maintenanceRequests || [];
    return (tenantId ? items.filter((m) => m.tenantId === tenantId) : items)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public getVisitorEntries(tenantId?: string): VisitorEntryRecord[] {
    const items = this.state.visitorEntries || [];
    return (tenantId ? items.filter((v) => v.tenantId === tenantId) : items)
      .slice()
      .sort((a, b) => b.entryAt.localeCompare(a.entryAt));
  }

  public getAnnouncements(): AdminAnnouncementRecord[] {
    return (this.state.announcements || [])
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  public deleteGuestCascade(
    tenantId: string,
    guestId: string
  ): { ok: true; deletedDocs: number } | { ok: false; error: string } {
    const guestIdx = this.state.guests.findIndex(
      (g) => g.id === guestId && g.tenantId === tenantId
    );
    if (guestIdx === -1) {
      return { ok: false, error: 'Guest not found.' };
    }

    const openStay = this.state.stays.find(
      (s) =>
        s.tenantId === tenantId &&
        s.guestId === guestId &&
        (s.status === 'active' || s.status === 'overdue' || s.status === 'upcoming')
    );
    if (openStay) {
      return {
        ok: false,
        error:
          'Cannot delete a guest with an active, overdue, or upcoming stay. Check out or cancel the stay first.',
      };
    }

    const guestDocs = this.state.documents.filter(
      (d) => d.tenantId === tenantId && d.guestId === guestId
    );
    for (const doc of guestDocs) {
      this.deleteDocumentObject(tenantId, doc.objectKey);
    }

    this.state.documents = this.state.documents.filter(
      (d) => !(d.tenantId === tenantId && d.guestId === guestId)
    );
    this.state.callAttempts = this.state.callAttempts.filter(
      (c) => !(c.tenantId === tenantId && c.guestId === guestId)
    );
    this.state.reminderLogs = this.state.reminderLogs.filter(
      (r) => !(r.tenantId === tenantId && r.guestId === guestId)
    );
    this.state.guests.splice(guestIdx, 1);
    this.persist();
    return { ok: true, deletedDocs: guestDocs.length };
  }

  public saveUploadedDocumentObject(
    tenantId: string,
    buffer: Buffer,
    mimeType: string
  ): string {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error('Unsupported document file type. Allowed: JPEG, PNG, WebP, PDF.');
    }
    if (buffer.length === 0 || buffer.length > MAX_DOCUMENT_BYTES) {
      throw new Error('File size must be between 1 byte and 5 MB.');
    }
    const objectKey = crypto.randomUUID();
    writePrivateObject(tenantId, objectKey, buffer);
    return objectKey;
  }

  public readDocumentObject(tenantId: string, objectKey: string): Buffer | null {
    const tenantDir = path.resolve(OBJECT_STORAGE_DIR, tenantId);
    const resolved = path.resolve(tenantDir, objectKey);
    if (!resolved.startsWith(tenantDir + path.sep)) {
      return null;
    }
    if (!fs.existsSync(resolved)) {
      return null;
    }
    return fs.readFileSync(resolved);
  }

  public deleteDocumentObject(tenantId: string, objectKey: string) {
    const tenantDir = path.resolve(OBJECT_STORAGE_DIR, tenantId);
    const resolved = path.resolve(tenantDir, objectKey);
    if (resolved.startsWith(tenantDir + path.sep) && fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
    }
  }

  public saveUserAvatarObject(buffer: Buffer, mimeType: string): string {
    if (!ALLOWED_AVATAR_MIME_TYPES.has(mimeType)) {
      throw new Error('Unsupported image type. Allowed: JPEG, PNG, WebP.');
    }
    if (buffer.length === 0 || buffer.length > MAX_AVATAR_BYTES) {
      throw new Error('Profile photo must be between 1 byte and 2 MB.');
    }
    if (!hasValidImageMagic(buffer, mimeType)) {
      throw new Error('Uploaded file does not match a valid JPEG, PNG, or WebP image.');
    }
    const avatarsDir = path.resolve(OBJECT_STORAGE_DIR, '_avatars');
    if (!fs.existsSync(avatarsDir)) {
      fs.mkdirSync(avatarsDir, { recursive: true });
    }
    const objectKey = crypto.randomUUID();
    const resolved = path.resolve(avatarsDir, objectKey);
    if (!resolved.startsWith(avatarsDir + path.sep)) {
      throw new Error('Invalid avatar storage path.');
    }
    fs.writeFileSync(resolved, buffer);
    return objectKey;
  }

  public readUserAvatarObject(objectKey: string): Buffer | null {
    if (!objectKey || !/^[0-9a-f-]+$/i.test(objectKey)) {
      return null;
    }
    const avatarsDir = path.resolve(OBJECT_STORAGE_DIR, '_avatars');
    const resolved = path.resolve(avatarsDir, objectKey);
    if (!resolved.startsWith(avatarsDir + path.sep)) {
      return null;
    }
    if (!fs.existsSync(resolved)) {
      return null;
    }
    return fs.readFileSync(resolved);
  }

  public deleteUserAvatarObject(objectKey?: string | null) {
    if (!objectKey || !/^[0-9a-f-]+$/i.test(objectKey)) {
      return;
    }
    const avatarsDir = path.resolve(OBJECT_STORAGE_DIR, '_avatars');
    const resolved = path.resolve(avatarsDir, objectKey);
    if (resolved.startsWith(avatarsDir + path.sep) && fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
    }
  }
}

export const store = new TenantStore();
