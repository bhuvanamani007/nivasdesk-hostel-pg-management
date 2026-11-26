import type {
  DepositStatus,
  ExpenseCategory,
  IdDocumentType,
  PaymentMode,
  PaymentStatus,
  ReminderChannel,
  ReminderType,
  StayStatus,
} from '../types/domain';

export function formatInr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDateShort(isoOrYmd: string | null | undefined): string {
  if (!isoOrYmd) return '—';
  const date = isoOrYmd.length === 10 ? new Date(`${isoOrYmd}T00:00:00`) : new Date(isoOrYmd);
  if (Number.isNaN(date.getTime())) return isoOrYmd;
  return date.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function daysUntilYmd(ymd: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(`${ymd}T00:00:00`);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function toLocalDateTimeInput(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function addOneMonthYmd(dateTimeOrYmd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateTimeOrYmd.trim());
  if (!match) {
    const fallback = new Date();
    fallback.setMonth(fallback.getMonth() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${fallback.getFullYear()}-${pad(fallback.getMonth() + 1)}-${pad(fallback.getDate())}`;
  }
  const year = Number(match[1]);
  const month = Number(match[2]); // 1-12
  const day = Number(match[3]);
  const targetYear = month === 12 ? year + 1 : year;
  const targetMonth = month === 12 ? 1 : month + 1;
  const daysInTargetMonth = new Date(targetYear, targetMonth, 0).getDate();
  const clampedDay = Math.min(day, daysInTargetMonth);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${targetYear}-${pad(targetMonth)}-${pad(clampedDay)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const ID_TYPE_LABELS: Record<IdDocumentType, string> = {
  none: 'No ID Recorded',
  aadhaar: 'Aadhaar',
  passport: 'Passport',
  driving_licence: 'Driving Licence',
  voter_id: 'Voter ID',
  other: 'Other ID',
};

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: 'Paid',
  partially_paid: 'Partially Paid',
  unpaid: 'Unpaid',
  overdue: 'Overdue',
  refunded: 'Refunded',
};

export const DEPOSIT_STATUS_LABELS: Record<DepositStatus, string> = {
  held: 'Held',
  partially_adjusted: 'Partially Adjusted',
  adjusted: 'Adjusted',
  refunded: 'Refunded',
};

export const STAY_STATUS_LABELS: Record<StayStatus, string> = {
  upcoming: 'Upcoming',
  active: 'Active',
  overdue: 'Overdue',
  checked_out: 'Checked Out',
  cancelled: 'Cancelled',
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  utilities: 'Utilities (EB / Water / Wi-Fi)',
  repairs_maintenance: 'Repairs & Maintenance',
  supplies: 'Housekeeping & Supplies',
  food: 'Mess & Food Provisions',
  other: 'Other Operating',
};

export const REMINDER_TYPE_LABELS: Record<ReminderType, string> = {
  unpaid_charge: 'Unpaid Charge',
  checkout_upcoming: 'Upcoming Checkout',
  checkout_overdue: 'Overdue Stay',
};

export const REMINDER_CHANNEL_LABELS: Record<ReminderChannel, string> = {
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  telephony: 'Call',
};

export const FACILITY_OPTIONS = [
  'Wi-Fi',
  'AC',
  'Attached Bath',
  'Geyser',
  'RO Water',
  'Power Backup',
  'Laundry',
  'CCTV',
  '2-Wheeler Parking',
  'Food Included',
] as const;
