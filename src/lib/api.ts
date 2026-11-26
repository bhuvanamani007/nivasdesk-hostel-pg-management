import type {
  AdminAnnouncementRecord,
  AdminNotificationPolicy,
  AdminOverviewPayload,
  AdminReportsPayload,
  CallAttempt,
  ComplaintRecord,
  DashboardNotification,
  DashboardSummary,
  Deposit,
  EnrichedBed,
  EnrichedDeposit,
  EnrichedDocument,
  EnrichedPayment,
  EnrichedStay,
  Expense,
  ExpenseCategory,
  Guest,
  GuestStatus,
  GuestsSummary,
  IdDocumentType,
  MaintenanceRequestRecord,
  NotificationFilterCategory,
  NotificationsPayload,
  OwnerOverviewPayload,
  PaginationMeta,
  Payment,
  PaymentMode,
  PortalPaymentsPayload,
  PortalRoomItem,
  PortalTenantItem,
  PreferredLanguage,
  ReminderChannel,
  ReminderLog,
  ReminderType,
  ReportsPayload,
  Room,
  RoomStatus,
  RoomType,
  RoomsSummary,
  Tenant,
  TenantPlanTier,
  TenantStatus,
  User,
  UserNotificationPreferences,
  UserRole,
  VisitorEntryRecord,
  WorkspaceBootstrap,
} from '../types/domain';

const SESSION_TOKEN_KEY = 'nivas_session_token';
const SIGNED_OUT_KEY = 'nivas_signed_out';

function getStoredSessionToken(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getSessionToken(): string | null {
  return getStoredSessionToken();
}

function setStoredSessionToken(token: string | null | undefined) {
  try {
    if (token) {
      window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
      window.sessionStorage.removeItem(SIGNED_OUT_KEY);
    } else {
      window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // ignore storage access errors
  }
}

function isClientSignedOut(): boolean {
  try {
    return window.sessionStorage.getItem(SIGNED_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

function setClientSignedOut(val: boolean) {
  try {
    if (val) {
      window.sessionStorage.setItem(SIGNED_OUT_KEY, '1');
    } else {
      window.sessionStorage.removeItem(SIGNED_OUT_KEY);
    }
  } catch {
    // ignore
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getStoredSessionToken();
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }

  return data as T;
}

export interface DashboardPayload {
  period: { period: string; from: string; to: string };
  summary: DashboardSummary;
  recentRegistrations: EnrichedStay[];
  recentCheckIns: EnrichedStay[];
  recentCheckouts: EnrichedStay[];
  recentPayments: EnrichedPayment[];
  recentExpenses: Expense[];
  upcomingCheckouts: EnrichedStay[];
  overdueStays: EnrichedStay[];
  unpaidList: EnrichedPayment[];
  rooms: Room[];
  beds: EnrichedBed[];
  notifications: DashboardNotification[];
}

export interface GuestListItem extends Guest {
  activeStay: EnrichedStay | null;
  upcomingStay: EnrichedStay | null;
  balanceDue: number;
  depositsHeld: number;
  totalStaysCount: number;
  docCount: number;
  lastCallAttempt: CallAttempt | null;
}

export interface GuestProfilePayload {
  guest: Guest;
  stays: EnrichedStay[];
  payments: EnrichedPayment[];
  deposits: EnrichedDeposit[];
  documents: EnrichedDocument[];
  callAttempts: CallAttempt[];
  reminderLogs: ReminderLog[];
}

export interface SearchResultItem {
  guestId: string;
  fullName: string;
  primaryPhone: string;
  idMasked: string | null;
  roomLabel: string;
}

export interface WorkspaceOptionsPayload {
  guests: Guest[];
  activeStays: EnrichedStay[];
  unpaidPayments: EnrichedPayment[];
  vacantBeds: EnrichedBed[];
  allBeds: EnrichedBed[];
}

function buildQuery(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      sp.set(key, String(value));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export const api = {
  getSession: async () => {
    const qs = isClientSignedOut() ? '?signedOut=1' : '';
    const res = await request<WorkspaceBootstrap>(`/api/auth/session${qs}`);
    if (res.sessionToken) {
      setStoredSessionToken(res.sessionToken);
    } else if (!res.authenticated) {
      setStoredSessionToken(null);
    }
    return res;
  },

  login: async (identifier: string, password: string) => {
    setClientSignedOut(false);
    const res = await request<{ user: User; tenant: Tenant; sessionToken?: string }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email: identifier, username: identifier, password }),
      }
    );
    if (res.sessionToken) setStoredSessionToken(res.sessionToken);
    return res;
  },

  demoSwitch: async (tenantId: string, role?: UserRole) => {
    setClientSignedOut(false);
    const res = await request<{ user: User; tenant: Tenant; sessionToken?: string }>(
      '/api/auth/demo-switch',
      {
        method: 'POST',
        body: JSON.stringify({ tenantId, role }),
      }
    );
    if (res.sessionToken) setStoredSessionToken(res.sessionToken);
    return res;
  },

  registerWorkspace: async (payload: {
    hostelName?: string;
    district?: string;
    locality?: string;
    pincode?: string;
    city?: string;
    wardenName?: string;
    name?: string;
    phone?: string;
    wardenPhone?: string;
    email: string;
    password: string;
  }) => {
    setClientSignedOut(false);
    const res = await request<{ user: User; tenant: Tenant; sessionToken?: string }>(
      '/api/auth/register-workspace',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    if (res.sessionToken) setStoredSessionToken(res.sessionToken);
    return res;
  },

  logout: async () => {
    setStoredSessionToken(null);
    setClientSignedOut(true);
    return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },

  fetchDocumentBlobUrl: async (docId: string): Promise<string> => {
    const token = getStoredSessionToken();
    const res = await fetch(`/api/documents/${encodeURIComponent(docId)}/download`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Could not load document.');
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  fetchProtectedImageUrl: async (url: string): Promise<string> => {
    const token = getStoredSessionToken();
    const res = await fetch(url, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Could not load image.');
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  downloadDocument: async (docId: string, fileName: string) => {
    const token = getStoredSessionToken();
    const res = await fetch(
      `/api/documents/${encodeURIComponent(docId)}/download?download=1`,
      {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
    if (!res.ok) throw new Error('Could not download document.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  downloadExpenseAttachment: async (expenseId: string, fileName: string) => {
    const token = getStoredSessionToken();
    const res = await fetch(
      `/api/expenses/${encodeURIComponent(expenseId)}/attachment?download=1`,
      {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
    if (!res.ok) throw new Error('Could not download attachment.');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  getDashboard: (params?: { period?: string; from?: string; to?: string }) =>
    request<DashboardPayload>(`/api/dashboard${buildQuery(params)}`),

  getWorkspaceOptions: () => request<WorkspaceOptionsPayload>('/api/workspace-options'),

  searchGuests: (q: string) =>
    request<{ results: SearchResultItem[] }>(`/api/search?q=${encodeURIComponent(q)}`),

  // Staff RBAC
  getStaff: () => request<{ staff: User[] }>('/api/staff'),
  createStaff: (payload: { name: string; email: string; role: UserRole; password: string }) =>
    request<{ staffMember: User }>('/api/staff', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateStaff: (
    userId: string,
    payload: { role?: UserRole; isActive?: boolean; name?: string }
  ) =>
    request<{ staffMember: User }>(`/api/staff/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // Guests
  getGuests: (
    params?: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: string;
      guestStatus?: string;
      dues?: string;
      sortBy?: string;
    },
    signal?: AbortSignal
  ) =>
    request<{
      guests: GuestListItem[];
      summary: GuestsSummary;
      pagination: PaginationMeta;
    }>(`/api/guests${buildQuery(params)}`, { signal }),

  getGuestProfile: (guestId: string) =>
    request<GuestProfilePayload>(`/api/guests/${encodeURIComponent(guestId)}`),

  createGuest: (payload: {
    fullName: string;
    primaryPhone: string;
    alternativePhone?: string;
    currentAddress?: string;
    permanentAddress?: string;
    emergencyContactName?: string;
    emergencyContactRelation?: string;
    emergencyContactPhone?: string;
    idType?: IdDocumentType;
    idNumber?: string;
    consentGiven?: boolean;
    consentNotes?: string;
    notes?: string;
  }) =>
    request<{ guest: Guest }>('/api/guests', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateGuest: (
    guestId: string,
    payload: Partial<Guest> & { idNumber?: string; status?: GuestStatus }
  ) =>
    request<{ guest: Guest }>(`/api/guests/${encodeURIComponent(guestId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteGuest: (guestId: string) =>
    request<{ ok: boolean; deletedDocs: number }>(
      `/api/guests/${encodeURIComponent(guestId)}`,
      { method: 'DELETE' }
    ),

  registerGuest: (formData: FormData) =>
    request<{ guest: Guest }>('/api/registrations', {
      method: 'POST',
      body: formData,
    }),

  // Stays
  getStays: (
    params?: {
      page?: number;
      pageSize?: number;
      search?: string;
      filter?: string;
      sortBy?: string;
      sortDir?: 'asc' | 'desc';
    },
    signal?: AbortSignal
  ) =>
    request<{ stays: EnrichedStay[]; pagination: PaginationMeta }>(
      `/api/stays${buildQuery(params)}`,
      { signal }
    ),

  createStay: (payload: {
    guestId: string;
    bedId: string;
    purposeOfStay: string;
    checkInAt: string;
    expectedCheckoutDate: string;
    status: 'active' | 'upcoming';
    agreedAmount: number;
    notes?: string;
  }) =>
    request<{ stay: EnrichedStay }>('/api/stays', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateStay: (
    stayId: string,
    payload: {
      expectedCheckoutDate?: string;
      newBedId?: string;
      purposeOfStay?: string;
      notes?: string;
    }
  ) =>
    request<{ stay: EnrichedStay }>(`/api/stays/${encodeURIComponent(stayId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  checkInStay: (stayId: string) =>
    request<{ stay: EnrichedStay }>(`/api/stays/${encodeURIComponent(stayId)}/check-in`, {
      method: 'POST',
    }),

  checkoutStay: (stayId: string, actualCheckoutAt?: string) =>
    request<{ stay: EnrichedStay }>(`/api/stays/${encodeURIComponent(stayId)}/checkout`, {
      method: 'POST',
      body: JSON.stringify({ actualCheckoutAt }),
    }),

  cancelStay: (stayId: string, reason?: string) =>
    request<{ stay: EnrichedStay }>(`/api/stays/${encodeURIComponent(stayId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Rooms & Beds
  getRooms: (
    params?: {
      page?: number;
      pageSize?: number;
      status?: string;
      floor?: string;
      roomType?: string;
      search?: string;
    },
    signal?: AbortSignal
  ) =>
    request<{
      rooms: Room[];
      beds: EnrichedBed[];
      floors: string[];
      summary: RoomsSummary;
      pagination: PaginationMeta;
    }>(`/api/rooms${buildQuery(params)}`, { signal }),

  getBeds: (
    params?: {
      page?: number;
      pageSize?: number;
      status?: string;
      floor?: string;
      roomType?: string;
      search?: string;
    },
    signal?: AbortSignal
  ) =>
    request<{ beds: EnrichedBed[]; pagination: PaginationMeta }>(
      `/api/beds${buildQuery(params)}`,
      { signal }
    ),

  addRoom: (payload: {
    roomNumber: string;
    floor: string;
    roomType: Room['roomType'];
    monthlyTariff: number;
    bedCount: number;
    capacity?: number;
    facilities?: string[];
    status?: RoomStatus;
  }) =>
    request<{ room: Room }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateRoom: (
    roomId: string,
    payload: {
      roomNumber?: string;
      floor?: string;
      roomType?: Room['roomType'];
      monthlyTariff?: number;
      capacity?: number;
      facilities?: string[];
      status?: 'available' | 'maintenance';
    }
  ) =>
    request<{ room: Room }>(`/api/rooms/${encodeURIComponent(roomId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  addBedToRoom: (roomId: string, bedLabel?: string) =>
    request<{ bed: EnrichedBed }>(`/api/rooms/${encodeURIComponent(roomId)}/beds`, {
      method: 'POST',
      body: JSON.stringify({ bedLabel }),
    }),

  toggleBedStatus: (bedId: string, status: 'vacant' | 'maintenance') =>
    request<{ bed: EnrichedBed }>(`/api/beds/${encodeURIComponent(bedId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  deleteBed: (bedId: string) =>
    request<{ ok: boolean }>(`/api/beds/${encodeURIComponent(bedId)}`, {
      method: 'DELETE',
    }),

  deleteRoom: (roomId: string) =>
    request<{ ok: boolean }>(`/api/rooms/${encodeURIComponent(roomId)}`, {
      method: 'DELETE',
    }),

  // Payments & Deposits
  getPayments: (
    params?: {
      page?: number;
      pageSize?: number;
      search?: string;
      filter?: string;
      logPage?: number;
      logPageSize?: number;
    },
    signal?: AbortSignal
  ) =>
    request<{
      payments: EnrichedPayment[];
      pagination: PaginationMeta;
      reminderLogs: ReminderLog[];
      logsPagination: PaginationMeta;
    }>(`/api/payments${buildQuery(params)}`, { signal }),

  recordPayment: (payload: {
    paymentId?: string;
    stayId?: string;
    amount: number;
    paidAmount?: number;
    status?: 'paid' | 'partially_paid' | 'unpaid';
    paymentMode: PaymentMode;
    paymentDate?: string;
    dueDate?: string;
    referenceNote?: string;
    description?: string;
  }) =>
    request<{ payment: Payment }>('/api/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  refundPayment: (paymentId: string, referenceNote?: string) =>
    request<{ payment: Payment }>(`/api/payments/${encodeURIComponent(paymentId)}/refund`, {
      method: 'POST',
      body: JSON.stringify({ referenceNote }),
    }),

  getDeposits: (
    params?: { page?: number; pageSize?: number; search?: string; filter?: string },
    signal?: AbortSignal
  ) =>
    request<{ deposits: EnrichedDeposit[]; pagination: PaginationMeta }>(
      `/api/deposits${buildQuery(params)}`,
      { signal }
    ),

  collectDeposit: (payload: {
    stayId: string;
    amount: number;
    paymentMode: PaymentMode;
    collectedDate?: string;
    referenceNote?: string;
    notes?: string;
  }) =>
    request<{ deposit: Deposit }>('/api/deposits', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  adjustDeposit: (
    depositId: string,
    payload: { amount: number; note: string; paymentId?: string }
  ) =>
    request<{ deposit: Deposit }>(`/api/deposits/${encodeURIComponent(depositId)}/adjust`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  refundDeposit: (
    depositId: string,
    payload: { amount?: number; refundMode: PaymentMode; refundDate?: string; referenceNote?: string }
  ) =>
    request<{ deposit: Deposit }>(`/api/deposits/${encodeURIComponent(depositId)}/refund`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Expenses
  getExpenses: (
    params?: {
      page?: number;
      pageSize?: number;
      category?: string;
      from?: string;
      to?: string;
      search?: string;
    },
    signal?: AbortSignal
  ) =>
    request<{
      expenses: Expense[];
      pagination: PaginationMeta;
      totalFilteredAmount: number;
    }>(`/api/expenses${buildQuery(params)}`, { signal }),

  createExpense: (formData: FormData) =>
    request<{ expense: Expense }>('/api/expenses', {
      method: 'POST',
      body: formData,
    }),

  deleteExpense: (expenseId: string) =>
    request<{ ok: boolean }>(`/api/expenses/${encodeURIComponent(expenseId)}`, {
      method: 'DELETE',
    }),

  // Reminders
  getReminders: (
    params?: {
      page?: number;
      pageSize?: number;
      status?: string;
      type?: string;
      channel?: string;
      search?: string;
    },
    signal?: AbortSignal
  ) =>
    request<{ reminders: ReminderLog[]; pagination: PaginationMeta }>(
      `/api/reminders${buildQuery(params)}`,
      { signal }
    ),

  scheduleReminder: (payload: {
    type: ReminderType;
    channel: ReminderChannel;
    stayId: string;
    paymentId?: string;
    scheduledFor?: string;
    sendNow?: boolean;
    message?: string;
  }) =>
    request<{ reminder: ReminderLog; message?: string }>('/api/reminders/schedule', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  sendReminderNow: (reminderId: string) =>
    request<{ reminder: ReminderLog; message: string }>(
      `/api/reminders/${encodeURIComponent(reminderId)}/send`,
      { method: 'POST' }
    ),

  cancelReminder: (reminderId: string) =>
    request<{ reminder: ReminderLog }>(
      `/api/reminders/${encodeURIComponent(reminderId)}/cancel`,
      { method: 'POST' }
    ),

  sendPaymentReminderSms: (paymentId: string) =>
    request<{ log: ReminderLog; message: string }>(
      `/api/payments/${encodeURIComponent(paymentId)}/remind-sms`,
      { method: 'POST' }
    ),

  // Reports
  getReports: (params?: { from?: string; to?: string }, signal?: AbortSignal) =>
    request<ReportsPayload>(`/api/reports${buildQuery(params)}`, { signal }),

  // Documents
  getDocuments: (
    params?: {
      page?: number;
      pageSize?: number;
      search?: string;
      idType?: string;
      guestId?: string;
    },
    signal?: AbortSignal
  ) =>
    request<{ documents: EnrichedDocument[]; pagination: PaginationMeta }>(
      `/api/documents${buildQuery(params)}`,
      { signal }
    ),

  uploadDocument: (formData: FormData) =>
    request<{ document: EnrichedDocument }>('/api/documents', {
      method: 'POST',
      body: formData,
    }),

  deleteDocument: (docId: string) =>
    request<{ ok: boolean }>(`/api/documents/${encodeURIComponent(docId)}`, {
      method: 'DELETE',
    }),

  // Contact call log
  initiateVerificationCall: (guestId: string, notes?: string) =>
    request<{ attempt: CallAttempt; message: string }>(
      `/api/guests/${encodeURIComponent(guestId)}/verify-call`,
      {
        method: 'POST',
        body: JSON.stringify({ notes }),
      }
    ),

  updateCallAttemptOutcome: (
    attemptId: string,
    outcome: 'verified' | 'no_answer' | 'wrong_number' | 'busy',
    notes?: string
  ) =>
    request<{ attempt: CallAttempt; guest: Guest }>(
      `/api/call-attempts/${encodeURIComponent(attemptId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ outcome, notes }),
      }
    ),

  updateSettings: (payload: Partial<Tenant>) =>
    request<{ tenant: Tenant }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  resetSampleData: () =>
    request<{ ok: boolean; tenant: Tenant }>('/api/sample-data/reset', {
      method: 'POST',
    }),

  // Overall Admin Site
  getAdminOverview: (params?: { period?: string; from?: string; to?: string }) =>
    request<AdminOverviewPayload>(`/api/admin/overview${buildQuery(params)}`),

  createAdminOwner: (payload: {
    ownerName: string;
    email: string;
    password: string;
    hostelName: string;
    district: string;
    locality?: string;
    pincode?: string;
    wardenPhone?: string;
    planTier?: TenantPlanTier;
  }) =>
    request<{ owner: User; tenant: Tenant }>('/api/admin/owners', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateAdminOwner: (
    userId: string,
    payload: { isActive?: boolean; name?: string; email?: string; password?: string }
  ) =>
    request<{ owner: User }>(`/api/admin/owners/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  createAdminWorkspace: (payload: {
    ownerId: string;
    name: string;
    district: string;
    locality?: string;
    pincode?: string;
    wardenPhone?: string;
    planTier?: TenantPlanTier;
  }) =>
    request<{ tenant: Tenant }>('/api/admin/workspaces', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateAdminWorkspace: (
    tenantId: string,
    payload: {
      status?: TenantStatus;
      planTier?: TenantPlanTier;
      name?: string;
      district?: string;
      locality?: string;
      pincode?: string;
      wardenPhone?: string;
      ownerId?: string;
    }
  ) =>
    request<{ tenant: Tenant }>(`/api/admin/workspaces/${encodeURIComponent(tenantId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  createAdminWarden: (payload: {
    tenantId: string;
    name: string;
    email: string;
    role: 'warden' | 'staff';
    password: string;
  }) =>
    request<{ warden: User }>('/api/admin/wardens', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateAdminWarden: (
    userId: string,
    payload: {
      tenantId?: string;
      role?: 'warden' | 'staff';
      isActive?: boolean;
      name?: string;
      password?: string;
    }
  ) =>
    request<{ warden: User }>(`/api/admin/wardens/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteAdminOwner: (userId: string) =>
    request<{ ok: boolean }>(`/api/admin/owners/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    }),

  deleteAdminWorkspace: (tenantId: string) =>
    request<{ ok: boolean }>(`/api/admin/workspaces/${encodeURIComponent(tenantId)}`, {
      method: 'DELETE',
    }),

  deleteAdminWarden: (userId: string) =>
    request<{ ok: boolean }>(`/api/admin/wardens/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    }),

  getAdminReports: () => request<AdminReportsPayload>('/api/admin/reports'),

  adminSwitchWorkspace: async (tenantId: string) => {
    const res = await request<{ user: User; tenant: Tenant; sessionToken?: string }>(
      '/api/admin/switch-workspace',
      {
        method: 'POST',
        body: JSON.stringify({ tenantId }),
      }
    );
    if (res.sessionToken) setStoredSessionToken(res.sessionToken);
    return res;
  },

  // Owner Site
  getOwnerOverview: (ownerId?: string) =>
    request<OwnerOverviewPayload>(`/api/owner/overview${buildQuery({ ownerId })}`),

  createOwnerProperty: (payload: {
    name: string;
    district: string;
    locality?: string;
    pincode?: string;
    wardenPhone?: string;
    receiptPrefix?: string;
  }) =>
    request<{ tenant: Tenant }>('/api/owner/properties', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateOwnerProperty: (
    tenantId: string,
    payload: {
      name?: string;
      district?: string;
      locality?: string;
      pincode?: string;
      wardenPhone?: string;
    }
  ) =>
    request<{ tenant: Tenant }>(`/api/owner/properties/${encodeURIComponent(tenantId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteOwnerProperty: (tenantId: string) =>
    request<{ ok: boolean }>(`/api/owner/properties/${encodeURIComponent(tenantId)}`, {
      method: 'DELETE',
    }),

  createOwnerWarden: (payload: {
    tenantId: string;
    name: string;
    email: string;
    role: 'warden' | 'staff';
    password: string;
  }) =>
    request<{ warden: User }>('/api/owner/wardens', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateOwnerWarden: (
    userId: string,
    payload: {
      tenantId?: string;
      role?: 'warden' | 'staff';
      isActive?: boolean;
      name?: string;
      password?: string;
    }
  ) =>
    request<{ warden: User }>(`/api/owner/wardens/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteOwnerWarden: (userId: string) =>
    request<{ ok: boolean }>(`/api/owner/wardens/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    }),

  ownerSwitchProperty: async (tenantId: string) => {
    const res = await request<{ user: User; tenant: Tenant; sessionToken?: string }>(
      '/api/owner/switch-property',
      {
        method: 'POST',
        body: JSON.stringify({ tenantId }),
      }
    );
    if (res.sessionToken) setStoredSessionToken(res.sessionToken);
    return res;
  },

  // Multi-property Portal Rooms, Tenants & Payments (Admin & Owner)
  getPortalRooms: (params?: { tenantId?: string; search?: string }) =>
    request<{ rooms: PortalRoomItem[]; properties: Array<{ id: string; name: string }> }>(
      `/api/portal/rooms${buildQuery(params)}`
    ),

  createPortalRoom: (payload: {
    tenantId: string;
    roomNumber: string;
    floor: string;
    roomType: RoomType;
    bedCount: number;
    monthlyTariff: number;
    status?: RoomStatus;
  }) =>
    request<{ room: Room }>('/api/portal/rooms', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updatePortalRoom: (
    roomId: string,
    payload: {
      roomNumber?: string;
      floor?: string;
      roomType?: RoomType;
      monthlyTariff?: number;
      status?: RoomStatus;
    }
  ) =>
    request<{ room: Room }>(`/api/portal/rooms/${encodeURIComponent(roomId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deletePortalRoom: (roomId: string) =>
    request<{ ok: boolean }>(`/api/portal/rooms/${encodeURIComponent(roomId)}`, {
      method: 'DELETE',
    }),

  getPortalTenants: (params?: { tenantId?: string; status?: string; search?: string }) =>
    request<{
      tenants: PortalTenantItem[];
      properties: Array<{ id: string; name: string }>;
      vacantBeds: Array<{
        id: string;
        tenantId: string;
        tenantName: string;
        roomNumber: string;
        bedLabel: string;
        monthlyTariff: number;
      }>;
    }>(`/api/portal/tenants${buildQuery(params)}`),

  createPortalTenant: (payload: {
    tenantId: string;
    fullName: string;
    primaryPhone: string;
    permanentAddress: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    idType: IdDocumentType;
    idNumber: string;
    bedId?: string;
    monthlyRent?: number;
    notes?: string;
  }) =>
    request<{ guest: Guest }>('/api/portal/tenants', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updatePortalTenant: (
    guestId: string,
    payload: {
      fullName?: string;
      primaryPhone?: string;
      permanentAddress?: string;
      emergencyContactName?: string;
      emergencyContactPhone?: string;
      status?: GuestStatus;
      notes?: string;
    }
  ) =>
    request<{ guest: Guest }>(`/api/portal/tenants/${encodeURIComponent(guestId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deletePortalTenant: (guestId: string) =>
    request<{ ok: boolean }>(`/api/portal/tenants/${encodeURIComponent(guestId)}`, {
      method: 'DELETE',
    }),

  getPortalPayments: (params?: { tenantId?: string; status?: string; search?: string }) =>
    request<PortalPaymentsPayload>(`/api/portal/payments${buildQuery(params)}`),

  createOrCollectPortalPayment: (payload: {
    paymentId?: string;
    stayId?: string;
    amount: number;
    paymentMode?: PaymentMode;
    paymentDate?: string;
    dueDate?: string;
    description?: string;
    referenceNote?: string;
    status?: 'paid' | 'unpaid';
  }) =>
    request<{ payment: Payment }>('/api/portal/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deletePortalPayment: (paymentId: string) =>
    request<{ ok: boolean }>(`/api/portal/payments/${encodeURIComponent(paymentId)}`, {
      method: 'DELETE',
    }),

  // Notification System & Settings
  getNotifications: (params?: {
    category?: NotificationFilterCategory;
    status?: 'all' | 'unread' | 'read';
    search?: string;
    includeMuted?: boolean;
  }) =>
    request<NotificationsPayload>(
      `/api/notifications${buildQuery({
        category: params?.category,
        status: params?.status,
        search: params?.search,
        includeMuted: params?.includeMuted ? '1' : undefined,
      })}`
    ),

  syncRentNotifications: () =>
    request<{ ok: boolean; createdCount: number }>('/api/notifications/sync-rent', {
      method: 'POST',
    }),

  markNotificationRead: (id: string) =>
    request<{ ok: boolean; id: string }>(
      `/api/notifications/${encodeURIComponent(id)}/read`,
      { method: 'POST' }
    ),

  markAllNotificationsRead: (category: NotificationFilterCategory = 'all') =>
    request<{ ok: boolean; markedCount: number }>('/api/notifications/read-all', {
      method: 'POST',
      body: JSON.stringify({ category }),
    }),

  getNotificationSettings: () =>
    request<{
      policy: AdminNotificationPolicy;
      preferences: UserNotificationPreferences;
    }>('/api/notifications/settings'),

  updateAdminNotificationPolicy: (patch: Partial<AdminNotificationPolicy>) =>
    request<{ policy: AdminNotificationPolicy }>('/api/notifications/settings/admin', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  updateUserNotificationPreferences: (patch: {
    categories?: Partial<UserNotificationPreferences['categories']>;
    realTimeSound?: boolean;
  }) =>
    request<{ preferences: UserNotificationPreferences }>(
      '/api/notifications/settings/preferences',
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    ),

  // Complaints
  getComplaints: () => request<{ complaints: ComplaintRecord[] }>('/api/complaints'),

  createComplaint: (payload: {
    tenantId?: string;
    guestId?: string | null;
    guestName?: string;
    roomLabel?: string;
    title: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high';
    assignedToUserId?: string | null;
  }) =>
    request<{ complaint: ComplaintRecord }>('/api/complaints', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateComplaintStatus: (id: string, status: 'open' | 'in_progress' | 'resolved') =>
    request<{ complaint: ComplaintRecord }>(
      `/api/complaints/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    ),

  deleteComplaint: (id: string) =>
    request<{ ok: boolean }>(`/api/complaints/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  // Maintenance Requests
  getMaintenanceRequests: () =>
    request<{ maintenanceRequests: MaintenanceRequestRecord[] }>('/api/maintenance'),

  createMaintenanceRequest: (payload: {
    tenantId?: string;
    roomId?: string | null;
    bedId?: string | null;
    roomLabel?: string;
    title: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high';
  }) =>
    request<{ maintenanceRequest: MaintenanceRequestRecord }>('/api/maintenance', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateMaintenanceRequestStatus: (
    id: string,
    status: 'open' | 'in_progress' | 'completed'
  ) =>
    request<{ maintenanceRequest: MaintenanceRequestRecord }>(
      `/api/maintenance/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }
    ),

  // Visitor Entries
  getVisitors: () => request<{ visitors: VisitorEntryRecord[] }>('/api/visitors'),

  createVisitorEntry: (payload: {
    guestId?: string | null;
    guestName: string;
    roomLabel?: string;
    visitorName: string;
    visitorPhone?: string;
    relation?: string;
    purpose?: string;
  }) =>
    request<{ visitor: VisitorEntryRecord }>('/api/visitors', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Admin & Owner Announcements
  getAnnouncements: () =>
    request<{ announcements: AdminAnnouncementRecord[] }>('/api/announcements'),

  createAnnouncement: (payload: {
    tenantId?: string;
    title: string;
    message: string;
    priority?: 'normal' | 'urgent';
  }) =>
    request<{ announcement: AdminAnnouncementRecord }>('/api/announcements', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // User Profile, Avatar & Password Management
  getProfile: () => request<{ user: User }>('/api/profile'),

  updateProfile: (payload: { name?: string; email?: string; phone?: string }) =>
    request<{ user: User }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  uploadProfileAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return request<{ user: User }>('/api/profile/avatar', {
      method: 'POST',
      body: formData,
    });
  },

  deleteProfileAvatar: () =>
    request<{ user: User }>('/api/profile/avatar', {
      method: 'DELETE',
    }),

  changePassword: (payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) =>
    request<{ ok: boolean; message: string }>('/api/profile/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateAccountLanguage: (preferredLanguage: PreferredLanguage) =>
    request<{ user: User; tenant: Tenant; preferredLanguage: PreferredLanguage }>(
      '/api/account/language',
      {
        method: 'PATCH',
        body: JSON.stringify({ preferredLanguage }),
      }
    ),
};
