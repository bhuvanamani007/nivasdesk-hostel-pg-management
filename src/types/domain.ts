export type IdDocumentType =
  | 'none'
  | 'aadhaar'
  | 'passport'
  | 'driving_licence'
  | 'voter_id'
  | 'other';

export type DocumentRole = 'id_front' | 'id_back' | 'additional_id';

export type RoomStatus = 'available' | 'occupied' | 'maintenance';

export type BedStatus = 'occupied' | 'vacant' | 'maintenance';

export type GuestStatus = 'active' | 'former' | 'inactive';

export type StayStatus = 'upcoming' | 'active' | 'overdue' | 'checked_out' | 'cancelled';

export type PaymentStatus = 'paid' | 'partially_paid' | 'unpaid' | 'refunded' | 'overdue';

export type PaymentMode = 'cash' | 'upi' | 'bank_transfer';

export type DepositStatus = 'held' | 'partially_adjusted' | 'adjusted' | 'refunded';

export type ExpenseCategory =
  | 'utilities'
  | 'repairs_maintenance'
  | 'supplies'
  | 'food'
  | 'other';

export type VerificationStatus = 'pending' | 'verified' | 'failed';

export type CallOutcome = 'initiated' | 'verified' | 'no_answer' | 'wrong_number' | 'busy';

export type ProviderMode = 'disabled' | 'mock' | 'configured';

export type UserRole = 'overall_admin' | 'owner' | 'warden' | 'staff';

export type TenantStatus = 'active' | 'suspended';

export type TenantPlanTier = 'standard' | 'lifetime' | 'trial';

export type PreferredLanguage = 'en' | 'ta';

export type ReminderType = 'unpaid_charge' | 'checkout_upcoming' | 'checkout_overdue';

export type ReminderChannel = 'sms' | 'whatsapp' | 'telephony';

export type ReminderStatus =
  | 'scheduled'
  | 'sent'
  | 'mocked'
  | 'failed'
  | 'cancelled'
  | 'blocked_duplicate'
  | 'disabled';

export interface Tenant {
  id: string;
  name: string;
  city: string;
  district: string;
  locality: string;
  pincode: string;
  landmark: string;
  address: string;
  wardenPhone: string;
  gstinOrReg: string;
  timezone: string;
  preferredLanguage: PreferredLanguage;
  houseRules: string;
  receiptPrefix: string;
  agreementNotes: string;
  isSample: boolean;
  ownerId?: string;
  status?: TenantStatus;
  planTier?: TenantPlanTier;
  settings: {
    smsProvider: ProviderMode;
    whatsappProvider: ProviderMode;
    telephonyProvider: ProviderMode;
    smsCooldownHours: number;
    reminderLeadDays: number;
    smsTemplate: string;
    checkoutReminderTemplate: string;
    unpaidReminderEnabled: boolean;
    checkoutReminderEnabled: boolean;
    requireIdDocument: boolean;
  };
  createdAt: string;
}

export interface User {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string | null;
  preferredLanguage?: PreferredLanguage;
  role: UserRole;
  isActive?: boolean;
  createdAt: string;
}

export const ROOM_TYPES = [
  'Single',
  '2-Sharing',
  '3-Sharing',
  '4-Sharing',
  '5-Sharing',
  '6-Sharing',
  '7-Sharing',
  '8-Sharing',
  'Hall Sharing',
] as const;

export type RoomType = (typeof ROOM_TYPES)[number];

export const ROOM_TYPE_DEFAULT_CAPACITY: Record<RoomType, number> = {
  Single: 1,
  '2-Sharing': 2,
  '3-Sharing': 3,
  '4-Sharing': 4,
  '5-Sharing': 5,
  '6-Sharing': 6,
  '7-Sharing': 7,
  '8-Sharing': 8,
  'Hall Sharing': 10,
};

export const ROOM_TYPE_DEFAULT_TARIFF: Record<RoomType, number> = {
  Single: 14000,
  '2-Sharing': 8500,
  '3-Sharing': 7500,
  '4-Sharing': 6500,
  '5-Sharing': 5800,
  '6-Sharing': 5200,
  '7-Sharing': 4800,
  '8-Sharing': 4500,
  'Hall Sharing': 4000,
};

export interface Room {
  id: string;
  tenantId: string;
  roomNumber: string;
  floor: string;
  roomType: RoomType;
  capacity: number;
  monthlyTariff: number;
  facilities: string[];
  status: RoomStatus;
  createdAt: string;
}

export interface Bed {
  id: string;
  tenantId: string;
  roomId: string;
  bedLabel: string;
  status: BedStatus;
  currentStayId: string | null;
}

export interface Guest {
  id: string;
  tenantId: string;
  fullName: string;
  primaryPhone: string;
  alternativePhone: string;
  currentAddress: string;
  permanentAddress: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
  idType: IdDocumentType;
  idLast4: string | null;
  idMasked: string | null;
  consentGiven: boolean;
  consentNotes: string;
  status: GuestStatus;
  altPhoneVerified: VerificationStatus;
  notes: string;
  createdAt: string;
}

export interface Stay {
  id: string;
  tenantId: string;
  guestId: string;
  roomId: string;
  bedId: string;
  purposeOfStay: string;
  checkInAt: string;
  expectedCheckoutDate: string;
  actualCheckoutAt: string | null;
  status: StayStatus;
  agreedAmount: number;
  notes?: string;
  cancelledAt?: string | null;
  cancellationReason?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  tenantId: string;
  stayId: string;
  guestId: string;
  amount: number;
  paidAmount: number;
  refundedAmount?: number;
  status: PaymentStatus;
  paymentMode: PaymentMode | null;
  paymentDate: string | null;
  refundDate?: string | null;
  dueDate: string;
  referenceNote: string;
  receiptNumber: string | null;
  description: string;
  createdAt: string;
}

export interface Deposit {
  id: string;
  tenantId: string;
  stayId: string;
  guestId: string;
  amount: number;
  adjustedAmount: number;
  refundedAmount: number;
  status: DepositStatus;
  paymentMode: PaymentMode;
  collectedDate: string;
  refundMode?: PaymentMode | null;
  refundDate?: string | null;
  referenceNote: string;
  notes: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  tenantId: string;
  expenseDate: string;
  category: ExpenseCategory;
  amount: number;
  paymentMode: PaymentMode;
  vendorName: string;
  note: string;
  attachmentFileName?: string | null;
  attachmentMimeType?: string | null;
  attachmentSizeBytes?: number | null;
  attachmentObjectKey?: string | null;
  recordedByName: string;
  createdAt: string;
}

export interface IdentityDocument {
  id: string;
  tenantId: string;
  guestId: string;
  stayId: string | null;
  docRole: DocumentRole;
  idType: IdDocumentType;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  objectKey: string;
  uploadedAt: string;
}

export interface CallAttempt {
  id: string;
  tenantId: string;
  guestId: string;
  targetPhoneMasked: string;
  initiatedByUserId: string;
  initiatedByName: string;
  provider: ProviderMode;
  providerCallRef: string;
  outcome: CallOutcome;
  notes: string;
  createdAt: string;
}

export interface ReminderLog {
  id: string;
  tenantId: string;
  stayId: string;
  paymentId?: string;
  guestId: string;
  guestName?: string;
  roomLabel?: string;
  type: ReminderType;
  channel: ReminderChannel;
  recipientMasked: string;
  messagePreview: string;
  provider: ProviderMode;
  status: ReminderStatus;
  dueDate?: string;
  scheduledFor?: string | null;
  attemptedAt?: string | null;
  errorReason?: string | null;
  sentByName: string;
  createdAt: string;
}

export interface EnrichedBed extends Bed {
  roomNumber: string;
  floor: string;
  roomType: Room['roomType'];
  monthlyTariff: number;
  occupantGuestId?: string;
  occupantGuestName?: string;
  occupantStayId?: string;
  occupantExpectedCheckoutDate?: string;
  occupantStayStatus?: StayStatus;
  upcomingReservation?: {
    stayId: string;
    guestId: string;
    guestName: string;
    checkInAt: string;
    expectedCheckoutDate: string;
  } | null;
}

export interface RoomsSummary {
  totalRooms: number;
  totalBeds: number;
  occupiedBeds: number;
  vacantBeds: number;
  maintenanceBeds: number;
  occupancyPercent: number;
  occupiedMonthlyRent: number;
  vacantMonthlyPotential: number;
}

export interface GuestsSummary {
  totalGuests: number;
  activeResidents: number;
  formerOrInactive: number;
  pendingContactCalls: number;
  guestsWithBalanceDue: number;
  totalOutstandingDue: number;
  totalDocumentsCount: number;
}

export interface EnrichedStay extends Stay {
  guestName: string;
  guestPhone: string;
  guestAltPhoneVerified: VerificationStatus;
  roomNumber: string;
  floor: string;
  bedLabel: string;
  durationDays: number;
  totalCharged: number;
  totalPaid: number;
  balanceDue: number;
  nextDueDate: string | null;
}

export interface EnrichedPayment extends Payment {
  guestName: string;
  guestPhone: string;
  roomNumber: string;
  bedLabel: string;
  outstandingAmount: number;
  isOverdue: boolean;
  lastReminderAt: string | null;
}

export interface EnrichedDeposit extends Deposit {
  guestName: string;
  guestPhone: string;
  roomNumber: string;
  bedLabel: string;
  remainingHeld: number;
}

export interface EnrichedDocument extends IdentityDocument {
  guestName: string;
  guestIdMasked: string | null;
}

export interface DashboardNotification {
  id: string;
  type: 'checkout_due' | 'stay_overdue' | 'payment_overdue' | 'verification_pending';
  title: string;
  detail: string;
  targetTab: 'stays' | 'payments' | 'guests';
  targetId: string;
}

export interface DashboardSummary {
  totalGuestsStaying: number;
  occupiedBeds: number;
  vacantBeds: number;
  maintenanceBeds: number;
  totalBeds: number;
  occupancyPercent: number;
  collectedInPeriod: number;
  depositsHeldAmount: number;
  expensesInPeriod: number;
  unpaidChargesCount: number;
  unpaidTotalAmount: number;
  upcomingCheckoutsCount: number;
  overdueStaysCount: number;
}

export interface ReportsPayload {
  from: string;
  to: string;
  occupancySummary: {
    totalRooms: number;
    totalBeds: number;
    occupiedBeds: number;
    vacantBeds: number;
    maintenanceBeds: number;
    occupancyPercent: number;
    byRoom: Array<{
      roomNumber: string;
      floor: string;
      roomType: string;
      capacity: number;
      occupied: number;
      vacant: number;
      maintenance: number;
      monthlyTariff: number;
    }>;
  };
  residentsAndCheckouts: {
    currentResidentsCount: number;
    upcomingCheckoutsCount: number;
    overdueStaysCount: number;
    rows: Array<{
      stayId: string;
      guestName: string;
      guestPhone: string;
      roomLabel: string;
      status: StayStatus;
      checkInAt: string;
      expectedCheckoutDate: string;
      balanceDue: number;
    }>;
  };
  collectionsAndOutstanding: {
    collectedTotal: number;
    outstandingTotal: number;
    refundedTotal: number;
    byMode: Record<PaymentMode, number>;
    outstandingRows: EnrichedPayment[];
  };
  depositsSummary: {
    totalCollected: number;
    totalHeld: number;
    totalAdjusted: number;
    totalRefunded: number;
    rows: EnrichedDeposit[];
  };
  expensesByCategory: {
    totalExpenses: number;
    categories: Array<{
      category: ExpenseCategory;
      count: number;
      total: number;
    }>;
    rows: Expense[];
  };
  monthlyIncomeVsExpense: Array<{
    month: string;
    income: number;
    expenses: number;
    net: number;
  }>;
}

export interface WorkspaceBootstrap {
  authenticated: boolean;
  tenant: Tenant | null;
  user: User | null;
  sessionToken?: string | null;
  sampleWorkspaces: Array<{
    tenantId: string;
    name: string;
    city: string;
    wardenEmail: string;
  }>;
}

export interface AdminWorkspaceSummary {
  id: string;
  name: string;
  city: string;
  district: string;
  locality: string;
  wardenPhone: string;
  status: TenantStatus;
  planTier: TenantPlanTier;
  isSample: boolean;
  ownerId: string | null;
  ownerName: string;
  ownerEmail: string;
  roomsCount: number;
  totalBeds: number;
  occupiedBeds: number;
  vacantBeds: number;
  occupancyPercent: number;
  activeGuestsCount: number;
  wardenCount: number;
  staffCount: number;
  collectedTotal: number;
  expensesTotal: number;
  outstandingDue: number;
  depositsHeld: number;
  createdAt: string;
}

export interface AdminOwnerSummary {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  primaryTenantId: string;
  propertyCount: number;
  propertyNames: string[];
  totalBeds: number;
  occupiedBeds: number;
  occupancyPercent: number;
  wardenCount: number;
  staffCount: number;
  collectedTotal: number;
  outstandingDue: number;
  createdAt: string;
}

export interface AdminWardenRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  tenantId: string;
  tenantName: string;
  ownerName: string;
  createdAt: string;
}

export interface AdminRecentPaymentItem {
  id: string;
  tenantId: string;
  tenantName: string;
  guestId: string;
  guestName: string;
  roomLabel: string;
  amount: number;
  paidAmount: number;
  status: PaymentStatus;
  paymentMode: PaymentMode | null;
  paymentDate: string | null;
  dueDate: string;
}

export interface AdminPendingDueItem {
  id: string;
  tenantId: string;
  tenantName: string;
  ownerName: string;
  guestId: string;
  guestName: string;
  roomLabel: string;
  outstandingAmount: number;
  dueDate: string;
  isOverdue: boolean;
}

export interface AdminRecentCheckInItem {
  id: string;
  tenantId: string;
  tenantName: string;
  guestId: string;
  guestName: string;
  roomLabel: string;
  checkInAt: string;
  status: StayStatus;
  agreedAmount: number;
}

export interface AdminPlanBreakdownItem {
  planTier: TenantPlanTier;
  workspacesCount: number;
  activeCount: number;
  totalBeds: number;
  occupiedBeds: number;
  collectedTotal: number;
}

export interface AdminOverviewPayload {
  period: { period: string; from: string; to: string };
  summary: {
    totalWorkspaces: number;
    activeWorkspaces: number;
    suspendedWorkspaces: number;
    totalOwners: number;
    activeOwners: number;
    totalWardens: number;
    totalStaff: number;
    totalRooms: number;
    totalBeds: number;
    occupiedBeds: number;
    vacantBeds: number;
    maintenanceBeds: number;
    occupancyPercent: number;
    activeGuestsCount: number;
    overdueStaysCount: number;
    collectedInPeriod: number;
    expensesInPeriod: number;
    netSurplusInPeriod: number;
    totalCollected: number;
    totalExpenses: number;
    totalOutstandingDue: number;
    totalDepositsHeld: number;
  };
  planBreakdown: AdminPlanBreakdownItem[];
  owners: AdminOwnerSummary[];
  workspaces: AdminWorkspaceSummary[];
  wardensAndStaff: AdminWardenRecord[];
  recentPayments: AdminRecentPaymentItem[];
  pendingDues: AdminPendingDueItem[];
  recentCheckIns: AdminRecentCheckInItem[];
}

export interface OwnerPropertySummary {
  id: string;
  name: string;
  city: string;
  district: string;
  locality: string;
  pincode: string;
  wardenPhone: string;
  receiptPrefix: string;
  status: TenantStatus;
  planTier: TenantPlanTier;
  isSample: boolean;
  roomsCount: number;
  totalBeds: number;
  occupiedBeds: number;
  vacantBeds: number;
  maintenanceBeds: number;
  occupancyPercent: number;
  activeGuestsCount: number;
  collectedTotal: number;
  expensesTotal: number;
  netSurplus: number;
  outstandingDue: number;
  depositsHeld: number;
  wardenCount: number;
  staffCount: number;
  wardenNames: string[];
  createdAt: string;
}

export interface OwnerWardenRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  tenantId: string;
  tenantName: string;
  createdAt: string;
}

export interface OwnerOverviewPayload {
  summary: {
    totalProperties: number;
    activeProperties: number;
    totalRooms: number;
    totalBeds: number;
    occupiedBeds: number;
    vacantBeds: number;
    occupancyPercent: number;
    totalCollected: number;
    totalExpenses: number;
    netSurplus: number;
    totalOutstandingDue: number;
    totalDepositsHeld: number;
    totalWardens: number;
    totalStaff: number;
  };
  properties: OwnerPropertySummary[];
  wardens: OwnerWardenRecord[];
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export type NotificationCategory =
  | 'rent_reminders'
  | 'payment_alerts'
  | 'resident_updates'
  | 'complaints'
  | 'maintenance_alerts'
  | 'system_alerts';

export type NotificationFilterCategory = 'all' | NotificationCategory;

export type NotificationEventType =
  | 'rent_reminder_5d'
  | 'rent_reminder_2d'
  | 'rent_due_today'
  | 'rent_overdue'
  | 'payment_received'
  | 'deposit_updated'
  | 'owner_registered'
  | 'resident_registered'
  | 'resident_checkin'
  | 'resident_checkout'
  | 'visitor_entry'
  | 'complaint_created'
  | 'complaint_updated'
  | 'maintenance_request'
  | 'room_bed_availability'
  | 'admin_announcement';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface AppNotification {
  id: string;
  tenantId: string;
  tenantName?: string;
  category: NotificationCategory;
  eventType: NotificationEventType;
  priority: NotificationPriority;
  title: string;
  message: string;
  targetRoles: UserRole[];
  assignedUserId?: string | null;
  targetTab?: string;
  targetId?: string;
  dedupeKey?: string;
  readByUserIds: string[];
  resolved?: boolean;
  createdAt: string;
}

export interface ClientNotification extends AppNotification {
  isRead: boolean;
}

export interface AdminNotificationPolicy {
  rentRemindersEnabled: boolean;
  overdueAlertsEnabled: boolean;
  paymentAlertsEnabled: boolean;
  residentUpdatesEnabled: boolean;
  complaintsEnabled: boolean;
  maintenanceAlertsEnabled: boolean;
  systemAlertsEnabled: boolean;
  rentReminderDaysBefore: number[];
  updatedAt: string;
  updatedBy?: string;
}

export interface UserNotificationPreferences {
  userId: string;
  categories: Record<NotificationCategory, boolean>;
  realTimeSound: boolean;
  updatedAt: string;
}

export interface NotificationsPayload {
  notifications: ClientNotification[];
  unreadCount: number;
  categoryCounts: Record<NotificationFilterCategory, { total: number; unread: number }>;
  policy: AdminNotificationPolicy;
  preferences: UserNotificationPreferences;
}

export interface ComplaintRecord {
  id: string;
  tenantId: string;
  guestId?: string | null;
  guestName: string;
  roomLabel: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'resolved';
  assignedToUserId?: string | null;
  assignedToName?: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceRequestRecord {
  id: string;
  tenantId: string;
  roomId?: string | null;
  bedId?: string | null;
  roomLabel: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'completed';
  reportedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface VisitorEntryRecord {
  id: string;
  tenantId: string;
  guestId?: string | null;
  guestName: string;
  roomLabel: string;
  visitorName: string;
  visitorPhone: string;
  relation: string;
  purpose: string;
  entryAt: string;
  createdByName: string;
}

export interface AdminAnnouncementRecord {
  id: string;
  tenantId: string; // 'all' or specific tenantId
  tenantName?: string;
  title: string;
  message: string;
  priority: 'normal' | 'urgent';
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
}

export interface PortalRoomBedItem {
  id: string;
  bedLabel: string;
  status: BedStatus;
  occupantGuestName?: string | null;
}

export interface PortalRoomItem {
  id: string;
  tenantId: string;
  tenantName: string;
  roomNumber: string;
  floor: string;
  roomType: RoomType;
  capacity: number;
  monthlyTariff: number;
  facilities: string[];
  status: RoomStatus;
  totalBeds: number;
  occupiedBeds: number;
  vacantBeds: number;
  maintenanceBeds: number;
  beds: PortalRoomBedItem[];
  createdAt: string;
}

export interface PortalTenantItem {
  id: string;
  tenantId: string;
  tenantName: string;
  fullName: string;
  primaryPhone: string;
  alternativePhone: string;
  currentAddress: string;
  permanentAddress: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
  idType: IdDocumentType;
  idMasked: string;
  status: GuestStatus;
  notes: string;
  activeStayId: string | null;
  roomLabel: string;
  checkInAt: string | null;
  monthlyRent: number;
  balanceDue: number;
  createdAt: string;
}

export interface PortalPaymentItem {
  id: string;
  tenantId: string;
  tenantName: string;
  stayId: string;
  guestId: string;
  guestName: string;
  guestPhone: string;
  roomLabel: string;
  amount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: PaymentStatus;
  paymentMode: PaymentMode | null;
  paymentDate: string | null;
  dueDate: string;
  isOverdue: boolean;
  receiptNumber: string | null;
  description: string;
  referenceNote: string;
  createdAt: string;
}

export interface PortalPaymentsPayload {
  payments: PortalPaymentItem[];
  summary: {
    totalCollected: number;
    totalPending: number;
    overdueCount: number;
    paidCount: number;
    pendingCount: number;
  };
  properties: Array<{ id: string; name: string }>;
  activeStays: Array<{
    id: string;
    tenantId: string;
    tenantName: string;
    guestId: string;
    guestName: string;
    roomLabel: string;
    agreedAmount: number;
  }>;
}

export interface AdminReportPropertyRow {
  tenantId: string;
  tenantName: string;
  ownerName: string;
  city: string;
  status: TenantStatus;
  roomsCount: number;
  totalBeds: number;
  occupiedBeds: number;
  vacantBeds: number;
  occupancyPercent: number;
  tenantsCount: number;
  collectedTotal: number;
  pendingRent: number;
  openComplaints: number;
}

export interface AdminReportsPayload {
  summary: {
    totalProperties: number;
    totalOwners: number;
    totalRooms: number;
    totalBeds: number;
    occupiedBeds: number;
    occupancyPercent: number;
    totalTenants: number;
    collectedTotal: number;
    pendingRent: number;
    openComplaints: number;
  };
  properties: AdminReportPropertyRow[];
}
