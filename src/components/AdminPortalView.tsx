import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Building2,
  KeyRound,
  Plus,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatDateShort, formatInr } from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';
import type {
  AdminOverviewPayload,
  AdminOwnerSummary,
  AdminWardenRecord,
  AdminWorkspaceSummary,
  NotificationFilterCategory,
  NotificationsPayload,
  TenantPlanTier,
  User,
} from '../types/domain';
import { ConfirmDialog } from './ConfirmDialog';
import type { NavTab } from './Shell';
import { AdminDashboardPage } from './admin/AdminDashboardPage';
import { AdminOwnersPage } from './admin/AdminOwnersPage';
import { AdminPropertiesPage } from './admin/AdminPropertiesPage';
import { AdminReportsPage } from './admin/AdminReportsPage';
import { AdminWardensPage } from './admin/AdminWardensPage';
import { PortalComplaintsPage } from './portal/PortalComplaintsPage';
import { PortalNotificationsPage } from './portal/PortalNotificationsPage';
import { PortalPaymentsPage } from './portal/PortalPaymentsPage';
import { PortalTenantsPage } from './portal/PortalTenantsPage';

export type AdminSection =
  | 'admin-overview'
  | 'admin-owners'
  | 'admin-workspaces'
  | 'admin-tenants'
  | 'admin-wardens'
  | 'admin-payments'
  | 'admin-complaints'
  | 'admin-reports'
  | 'admin-notifications';

interface AdminPortalViewProps {
  section: AdminSection;
  currentUser: User;
  refreshSignal?: number;
  notificationsData: NotificationsPayload | null;
  onMarkNotificationRead: (id: string) => void | Promise<void>;
  onMarkAllNotificationsRead: (category?: NotificationFilterCategory) => void | Promise<void>;
  onRefreshNotifications: () => void | Promise<void>;
  onNavigateSection: (section: NavTab) => void;
  onShowToast: (kind: 'ok' | 'error', text: string) => void;
}

export function AdminPortalView({
  section,
  currentUser,
  refreshSignal = 0,
  notificationsData,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onRefreshNotifications,
  onNavigateSection,
  onShowToast,
}: AdminPortalViewProps) {
  const { tr } = useLanguage();
  const [data, setData] = useState<AdminOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [staffRoleFilter, setStaffRoleFilter] = useState<'all' | 'warden' | 'staff'>('all');

  // View Details Modals
  const [viewOwner, setViewOwner] = useState<AdminOwnerSummary | null>(null);
  const [viewProperty, setViewProperty] = useState<AdminWorkspaceSummary | null>(null);
  const [viewStaff, setViewStaff] = useState<AdminWardenRecord | null>(null);

  // Onboard Owner + PG Modal
  const [onboardOpen, setOnboardOpen] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [pgName, setPgName] = useState('');
  const [pgDistrict, setPgDistrict] = useState('Chennai');
  const [pgLocality, setPgLocality] = useState('');
  const [pgPincode, setPgPincode] = useState('');
  const [pgPhone, setPgPhone] = useState('+91 ');
  const [pgPlan, setPgPlan] = useState<TenantPlanTier>('lifetime');
  const [onboardBusy, setOnboardBusy] = useState(false);

  // Add PG Property Modal
  const [addPgOpen, setAddPgOpen] = useState(false);
  const [addPgOwnerId, setAddPgOwnerId] = useState('');
  const [addPgName, setAddPgName] = useState('');
  const [addPgDistrict, setAddPgDistrict] = useState('Chennai');
  const [addPgLocality, setAddPgLocality] = useState('');
  const [addPgPincode, setAddPgPincode] = useState('');
  const [addPgPhone, setAddPgPhone] = useState('+91 ');
  const [addPgPlan, setAddPgPlan] = useState<TenantPlanTier>('lifetime');
  const [addPgBusy, setAddPgBusy] = useState(false);

  // Add Staff Modal
  const [addWardenOpen, setAddWardenOpen] = useState(false);
  const [wardenTenantId, setWardenTenantId] = useState('');
  const [wardenName, setWardenName] = useState('');
  const [wardenEmail, setWardenEmail] = useState('');
  const [wardenRole, setWardenRole] = useState<'warden' | 'staff'>('warden');
  const [wardenPassword, setWardenPassword] = useState('');
  const [wardenBusy, setWardenBusy] = useState(false);

  // Edit Owner Modal
  const [editOwnerTarget, setEditOwnerTarget] = useState<AdminOwnerSummary | null>(null);
  const [editOwnerName, setEditOwnerName] = useState('');
  const [editOwnerEmail, setEditOwnerEmail] = useState('');
  const [editOwnerBusy, setEditOwnerBusy] = useState(false);

  // Edit Property Modal
  const [editPropertyTarget, setEditPropertyTarget] = useState<AdminWorkspaceSummary | null>(null);
  const [editPropName, setEditPropName] = useState('');
  const [editPropOwnerId, setEditPropOwnerId] = useState('');
  const [editPropDistrict, setEditPropDistrict] = useState('');
  const [editPropLocality, setEditPropLocality] = useState('');
  const [editPropPincode, setEditPropPincode] = useState('');
  const [editPropPhone, setEditPropPhone] = useState('');
  const [editPropPlan, setEditPropPlan] = useState<TenantPlanTier>('lifetime');
  const [editPropBusy, setEditPropBusy] = useState(false);

  // Edit Staff Modal
  const [editStaffTarget, setEditStaffTarget] = useState<AdminWardenRecord | null>(null);
  const [editStaffName, setEditStaffName] = useState('');
  const [editStaffRole, setEditStaffRole] = useState<'warden' | 'staff'>('warden');
  const [editStaffTenantId, setEditStaffTenantId] = useState('');
  const [editStaffBusy, setEditStaffBusy] = useState(false);

  // Reset Password Modal
  const [resetTarget, setResetTarget] = useState<{
    kind: 'owner' | 'warden';
    id: string;
    name: string;
    email: string;
  } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  // Delete Confirmations
  const [deleteOwnerTarget, setDeleteOwnerTarget] = useState<AdminOwnerSummary | null>(null);
  const [deletePropTarget, setDeletePropTarget] = useState<AdminWorkspaceSummary | null>(null);
  const [deleteStaffTarget, setDeleteStaffTarget] = useState<AdminWardenRecord | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminOverview({ period: 'all' });
      setData(res);
      if (!addPgOwnerId && res.owners[0]) setAddPgOwnerId(res.owners[0].id);
      if (!wardenTenantId && res.workspaces[0]) setWardenTenantId(res.workspaces[0].id);
    } catch (err) {
      setError(err instanceof Error ? tr(err.message) : tr('Failed to load admin data.'));
    } finally {
      setLoading(false);
    }
  }, [addPgOwnerId, wardenTenantId, tr]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshSignal]);

  const handleOnboardOwner = async (e: FormEvent) => {
    e.preventDefault();
    setOnboardBusy(true);
    try {
      await api.createAdminOwner({
        ownerName: ownerName.trim(),
        email: ownerEmail.trim(),
        password: ownerPassword,
        hostelName: pgName.trim(),
        district: pgDistrict.trim(),
        locality: pgLocality.trim(),
        pincode: pgPincode.trim(),
        wardenPhone: pgPhone.trim(),
        planTier: pgPlan,
      });
      setOnboardOpen(false);
      setOwnerName('');
      setOwnerEmail('');
      setOwnerPassword('');
      setPgName('');
      setPgLocality('');
      setPgPincode('');
      setPgPhone('+91 ');
      onShowToast('ok', tr(`Owner ${ownerName.trim()} and PG ${pgName.trim()} created.`));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? tr(err.message) : tr('Could not add owner.'));
    } finally {
      setOnboardBusy(false);
    }
  };

  const handleAddPg = async (e: FormEvent) => {
    e.preventDefault();
    setAddPgBusy(true);
    try {
      await api.createAdminWorkspace({
        ownerId: addPgOwnerId,
        name: addPgName.trim(),
        district: addPgDistrict.trim(),
        locality: addPgLocality.trim(),
        pincode: addPgPincode.trim(),
        wardenPhone: addPgPhone.trim(),
        planTier: addPgPlan,
      });
      setAddPgOpen(false);
      setAddPgName('');
      setAddPgLocality('');
      setAddPgPincode('');
      setAddPgPhone('+91 ');
      onShowToast('ok', tr(`PG property ${addPgName.trim()} added.`));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? tr(err.message) : tr('Could not add PG property.'));
    } finally {
      setAddPgBusy(false);
    }
  };

  const handleAddWarden = async (e: FormEvent) => {
    e.preventDefault();
    setWardenBusy(true);
    try {
      await api.createAdminWarden({
        tenantId: wardenTenantId,
        name: wardenName.trim(),
        email: wardenEmail.trim(),
        role: wardenRole,
        password: wardenPassword,
      });
      setAddWardenOpen(false);
      setWardenName('');
      setWardenEmail('');
      setWardenPassword('');
      onShowToast('ok', tr(`Staff account created for ${wardenName.trim()}.`));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? tr(err.message) : tr('Could not add staff.'));
    } finally {
      setWardenBusy(false);
    }
  };

  const openEditOwnerModal = (owner: AdminOwnerSummary) => {
    setEditOwnerTarget(owner);
    setEditOwnerName(owner.name);
    setEditOwnerEmail(owner.email);
  };

  const handleSaveEditOwner = async (e: FormEvent) => {
    e.preventDefault();
    if (!editOwnerTarget) return;
    setEditOwnerBusy(true);
    try {
      await api.updateAdminOwner(editOwnerTarget.id, {
        name: editOwnerName.trim(),
        email: editOwnerEmail.trim(),
      });
      setEditOwnerTarget(null);
      onShowToast('ok', tr('Owner details updated.'));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? tr(err.message) : tr('Could not update owner.'));
    } finally {
      setEditOwnerBusy(false);
    }
  };

  const openEditPropertyModal = (ws: AdminWorkspaceSummary) => {
    setEditPropertyTarget(ws);
    setEditPropName(ws.name);
    setEditPropOwnerId(ws.ownerId || data?.owners[0]?.id || '');
    setEditPropDistrict(ws.district || ws.city || 'Chennai');
    setEditPropLocality(ws.locality || '');
    setEditPropPincode('');
    setEditPropPhone(ws.wardenPhone || '+91 ');
    setEditPropPlan(ws.planTier);
  };

  const handleSaveEditProperty = async (e: FormEvent) => {
    e.preventDefault();
    if (!editPropertyTarget) return;
    setEditPropBusy(true);
    try {
      await api.updateAdminWorkspace(editPropertyTarget.id, {
        name: editPropName.trim(),
        ownerId: editPropOwnerId || undefined,
        district: editPropDistrict.trim(),
        locality: editPropLocality.trim(),
        pincode: editPropPincode.trim() || undefined,
        wardenPhone: editPropPhone.trim(),
        planTier: editPropPlan,
      });
      setEditPropertyTarget(null);
      onShowToast('ok', tr('PG property updated.'));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? tr(err.message) : tr('Could not update PG property.'));
    } finally {
      setEditPropBusy(false);
    }
  };

  const openEditStaffModal = (w: AdminWardenRecord) => {
    setEditStaffTarget(w);
    setEditStaffName(w.name);
    setEditStaffRole(w.role === 'staff' ? 'staff' : 'warden');
    setEditStaffTenantId(w.tenantId);
  };

  const handleSaveEditStaff = async (e: FormEvent) => {
    e.preventDefault();
    if (!editStaffTarget) return;
    setEditStaffBusy(true);
    try {
      await api.updateAdminWarden(editStaffTarget.id, {
        name: editStaffName.trim(),
        role: editStaffRole,
        tenantId: editStaffTenantId,
      });
      setEditStaffTarget(null);
      onShowToast('ok', tr('Staff member updated.'));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? tr(err.message) : tr('Could not update staff.'));
    } finally {
      setEditStaffBusy(false);
    }
  };

  const handleToggleOwnerActive = async (owner: AdminOwnerSummary) => {
    setBusyId(owner.id);
    try {
      await api.updateAdminOwner(owner.id, { isActive: !owner.isActive });
      onShowToast('ok', tr(`${owner.name} ${owner.isActive ? 'suspended' : 'activated'}.`));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? tr(err.message) : tr('Action failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleWorkspaceStatus = async (ws: AdminWorkspaceSummary) => {
    const nextStatus = ws.status === 'active' ? 'suspended' : 'active';
    setBusyId(ws.id);
    try {
      await api.updateAdminWorkspace(ws.id, { status: nextStatus });
      onShowToast('ok', tr(`${ws.name} marked ${nextStatus}.`));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? tr(err.message) : tr('Action failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleWardenActive = async (w: AdminWardenRecord) => {
    setBusyId(w.id);
    try {
      await api.updateAdminWarden(w.id, { isActive: !w.isActive });
      onShowToast('ok', tr(`${w.name} ${w.isActive ? 'suspended' : 'activated'}.`));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? tr(err.message) : tr('Action failed.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleResetPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetBusy(true);
    try {
      if (resetTarget.kind === 'owner') {
        await api.updateAdminOwner(resetTarget.id, { password: newPassword });
      } else {
        await api.updateAdminWarden(resetTarget.id, { password: newPassword });
      }
      setResetTarget(null);
      setNewPassword('');
      onShowToast('ok', tr(`Password updated for ${resetTarget.name}.`));
    } catch (err) {
      onShowToast('error', err instanceof Error ? tr(err.message) : tr('Could not update password.'));
    } finally {
      setResetBusy(false);
    }
  };

  const handleConfirmDeleteOwner = async () => {
    if (!deleteOwnerTarget) return;
    setBusyId(deleteOwnerTarget.id);
    try {
      await api.deleteAdminOwner(deleteOwnerTarget.id);
      setDeleteOwnerTarget(null);
      onShowToast('ok', tr('Owner deleted.'));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? tr(err.message) : tr('Could not delete owner.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDeleteProperty = async () => {
    if (!deletePropTarget) return;
    setBusyId(deletePropTarget.id);
    try {
      await api.deleteAdminWorkspace(deletePropTarget.id);
      setDeletePropTarget(null);
      onShowToast('ok', tr('PG property deleted.'));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? tr(err.message) : tr('Could not delete PG property.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDeleteStaff = async () => {
    if (!deleteStaffTarget) return;
    setBusyId(deleteStaffTarget.id);
    try {
      await api.deleteAdminWarden(deleteStaffTarget.id);
      setDeleteStaffTarget(null);
      onShowToast('ok', tr('Staff member deleted.'));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? tr(err.message) : tr('Could not delete staff member.'));
    } finally {
      setBusyId(null);
    }
  };

  // Dedicated standalone admin sections
  if (section === 'admin-tenants') {
    return <PortalTenantsPage onShowToast={onShowToast} />;
  }
  if (section === 'admin-payments') {
    return <PortalPaymentsPage mode="all" onShowToast={onShowToast} />;
  }
  if (section === 'admin-complaints') {
    return (
      <PortalComplaintsPage
        properties={(data?.workspaces || []).map((w) => ({ id: w.id, name: w.name }))}
        onShowToast={onShowToast}
      />
    );
  }
  if (section === 'admin-reports') {
    return <AdminReportsPage />;
  }
  if (section === 'admin-notifications') {
    return (
      <PortalNotificationsPage
        user={currentUser}
        notificationsData={notificationsData}
        onMarkRead={onMarkNotificationRead}
        onMarkAllRead={onMarkAllNotificationsRead}
        onRefresh={onRefreshNotifications}
        onShowToast={onShowToast}
      />
    );
  }

  if (loading && !data) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center typo-body text-slate-500">
        {tr('Loading dashboard...')}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 flex items-center justify-between typo-body text-red-900">
        <span>{error || tr('Could not load admin data.')}</span>
        <button
          type="button"
          onClick={loadData}
          className="rounded border border-red-300 bg-white px-3 py-1 typo-btn text-red-800 hover:bg-red-100"
        >
          {tr('Retry')}
        </button>
      </div>
    );
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredOwners = data.owners.filter((o) => {
    if (statusFilter === 'active' && !o.isActive) return false;
    if (statusFilter === 'suspended' && o.isActive) return false;
    if (!normalizedQuery) return true;
    return (
      o.name.toLowerCase().includes(normalizedQuery) ||
      o.email.toLowerCase().includes(normalizedQuery) ||
      o.propertyNames.some((n) => n.toLowerCase().includes(normalizedQuery))
    );
  });

  const filteredWorkspaces = data.workspaces.filter((ws) => {
    if (statusFilter === 'active' && ws.status !== 'active') return false;
    if (statusFilter === 'suspended' && ws.status !== 'suspended') return false;
    if (!normalizedQuery) return true;
    return (
      ws.name.toLowerCase().includes(normalizedQuery) ||
      ws.ownerName.toLowerCase().includes(normalizedQuery) ||
      ws.district.toLowerCase().includes(normalizedQuery) ||
      ws.locality.toLowerCase().includes(normalizedQuery)
    );
  });

  const filteredWardens = data.wardensAndStaff.filter((w) => {
    if (statusFilter === 'active' && !w.isActive) return false;
    if (statusFilter === 'suspended' && w.isActive) return false;
    if (staffRoleFilter !== 'all' && w.role !== staffRoleFilter) return false;
    if (!normalizedQuery) return true;
    return (
      w.name.toLowerCase().includes(normalizedQuery) ||
      w.email.toLowerCase().includes(normalizedQuery) ||
      w.tenantName.toLowerCase().includes(normalizedQuery)
    );
  });

  const headerMeta: Record<
    'admin-overview' | 'admin-owners' | 'admin-workspaces' | 'admin-wardens',
    { title: string; subtitle: string }
  > = {
    'admin-overview': {
      title: tr('Dashboard'),
      subtitle: tr('Quick summary of PG owners, properties, tenants, and pending rent.'),
    },
    'admin-owners': {
      title: tr('PG Owners'),
      subtitle: tr('Manage PG owner accounts and their assigned properties.'),
    },
    'admin-workspaces': {
      title: tr('PG Properties'),
      subtitle: tr('View, add, edit, or manage all PG properties.'),
    },
    'admin-wardens': {
      title: tr('Staff'),
      subtitle: tr('Manage wardens and staff members across all PG properties.'),
    },
  };

  const activeHeader = headerMeta[section];
  const hasFilters = Boolean(normalizedQuery || statusFilter !== 'all' || staffRoleFilter !== 'all');

  return (
    <div className="space-y-4">
      {/* Clean Single Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="typo-dashboard-title text-slate-900">{activeHeader.title}</h1>
          <p className="mt-1 typo-body text-slate-600">{activeHeader.subtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(section === 'admin-overview' || section === 'admin-owners') && (
            <button
              type="button"
              onClick={() => setOnboardOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3.5 py-2 typo-btn font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              <span>{tr('Add Owner & PG')}</span>
            </button>
          )}
          {section === 'admin-workspaces' && (
            <button
              type="button"
              disabled={data.owners.length === 0}
              onClick={() => {
                if (!addPgOwnerId && data.owners[0]) setAddPgOwnerId(data.owners[0].id);
                setAddPgOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3.5 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
            >
              <Building2 className="h-4 w-4" aria-hidden="true" />
              <span>{tr('Add PG Property')}</span>
            </button>
          )}
          {section === 'admin-wardens' && (
            <button
              type="button"
              disabled={data.workspaces.length === 0}
              onClick={() => {
                if (!wardenTenantId && data.workspaces[0]) setWardenTenantId(data.workspaces[0].id);
                setAddWardenOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3.5 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{tr('Add Staff')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Directory Search & Filter Bar */}
      {section !== 'admin-overview' && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                section === 'admin-owners'
                  ? tr('Search owners by name, email, or PG...')
                  : section === 'admin-workspaces'
                    ? tr('Search PG properties by name, owner, or city...')
                    : tr('Search staff by name, email, or PG...')
              }
              className="w-full rounded-md border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-3 typo-input focus:border-teal-700 focus:bg-white focus:outline-none"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'suspended')}
            aria-label={tr('Filter by status')}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 typo-input"
          >
            <option value="all">{tr('All Status')}</option>
            <option value="active">{tr('Active')}</option>
            <option value="suspended">{tr('Suspended')}</option>
          </select>

          {section === 'admin-wardens' && (
            <select
              value={staffRoleFilter}
              onChange={(e) => setStaffRoleFilter(e.target.value as 'all' | 'warden' | 'staff')}
              aria-label={tr('Filter by role')}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 typo-input"
            >
              <option value="all">{tr('All Roles')}</option>
              <option value="warden">{tr('Warden')}</option>
              <option value="staff">{tr('Staff')}</option>
            </select>
          )}
        </div>
      )}

      {section === 'admin-overview' && (
        <AdminDashboardPage
          data={data}
          onNavigateSection={onNavigateSection}
          onViewPropertyDetails={setViewProperty}
        />
      )}

      {section === 'admin-owners' && (
        <AdminOwnersPage
          owners={filteredOwners}
          busyId={busyId}
          hasActiveFilters={hasFilters}
          onResetFilters={() => {
            setSearchQuery('');
            setStatusFilter('all');
          }}
          onViewOwnerDetails={setViewOwner}
          onEditOwner={openEditOwnerModal}
          onResetOwnerPassword={(owner) => {
            setResetTarget({
              kind: 'owner',
              id: owner.id,
              name: owner.name,
              email: owner.email,
            });
            setNewPassword('');
          }}
          onToggleOwnerActive={handleToggleOwnerActive}
          onDeleteOwner={setDeleteOwnerTarget}
        />
      )}

      {section === 'admin-workspaces' && (
        <AdminPropertiesPage
          workspaces={filteredWorkspaces}
          busyId={busyId}
          hasActiveFilters={hasFilters}
          onResetFilters={() => {
            setSearchQuery('');
            setStatusFilter('all');
          }}
          onViewPropertyDetails={setViewProperty}
          onEditProperty={openEditPropertyModal}
          onToggleWorkspaceStatus={handleToggleWorkspaceStatus}
          onDeleteProperty={setDeletePropTarget}
        />
      )}

      {section === 'admin-wardens' && (
        <AdminWardensPage
          wardens={filteredWardens}
          busyId={busyId}
          hasActiveFilters={hasFilters}
          onResetFilters={() => {
            setSearchQuery('');
            setStatusFilter('all');
            setStaffRoleFilter('all');
          }}
          onViewStaffDetails={setViewStaff}
          onEditStaff={openEditStaffModal}
          onResetWardenPassword={(w) => {
            setResetTarget({
              kind: 'warden',
              id: w.id,
              name: w.name,
              email: w.email,
            });
            setNewPassword('');
          }}
          onToggleWardenActive={handleToggleWardenActive}
          onDeleteWarden={setDeleteStaffTarget}
        />
      )}

      {/* View Owner Details Modal */}
      {viewOwner && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-owner-details-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="view-owner-details-title" className="typo-section-heading text-slate-900">
                {tr('Owner Details')}
              </h2>
              <button
                type="button"
                onClick={() => setViewOwner(null)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 typo-body">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="typo-helper text-slate-500">{tr('Full Name')}</p>
                  <p className="font-semibold text-slate-900">{viewOwner.name}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Status')}</p>
                  <p className={`font-semibold ${viewOwner.isActive ? 'text-emerald-700' : 'text-red-700'}`}>
                    {viewOwner.isActive ? tr('Active') : tr('Suspended')}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="typo-helper text-slate-500">{tr('Email')}</p>
                  <p className="font-mono text-slate-800">{viewOwner.email}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('PG Properties')}</p>
                  <p className="font-semibold text-slate-900">{viewOwner.propertyCount}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Beds Occupied')}</p>
                  <p className="font-mono text-slate-900">
                    {viewOwner.occupiedBeds}/{viewOwner.totalBeds}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Total Collected')}</p>
                  <p className="font-mono text-emerald-700">{formatInr(viewOwner.collectedTotal)}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Pending Rent')}</p>
                  <p className="font-mono text-amber-700">{formatInr(viewOwner.outstandingDue)}</p>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-2">
                <p className="typo-helper text-slate-500">{tr('Owned Properties')}</p>
                <p className="text-slate-800">{viewOwner.propertyNames.join(', ') || tr('None')}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  const o = viewOwner;
                  setViewOwner(null);
                  setAddPgOwnerId(o.id);
                  setAddPgOpen(true);
                }}
                className="rounded-md border border-slate-300 bg-white px-3.5 py-1.5 typo-btn text-slate-800 hover:bg-slate-50"
              >
                {tr('+ Add PG for Owner')}
              </button>
              <button
                type="button"
                onClick={() => setViewOwner(null)}
                className="rounded-md bg-slate-900 px-4 py-1.5 typo-btn text-white hover:bg-slate-800"
              >
                {tr('Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View PG Property Details Modal */}
      {viewProperty && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-prop-details-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="view-prop-details-title" className="typo-section-heading text-slate-900">
                {tr('PG Property Details')}
              </h2>
              <button
                type="button"
                onClick={() => setViewProperty(null)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 typo-body">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="typo-helper text-slate-500">{tr('Property Name')}</p>
                  <p className="font-semibold text-slate-900">{viewProperty.name}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Status')}</p>
                  <p className={`font-semibold capitalize ${viewProperty.status === 'active' ? 'text-emerald-700' : 'text-red-700'}`}>
                    {tr(viewProperty.status)}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Owner')}</p>
                  <p className="text-slate-900">{viewProperty.ownerName}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Contact Phone')}</p>
                  <p className="font-mono text-slate-800">{viewProperty.wardenPhone}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Location')}</p>
                  <p className="text-slate-800">
                    {[viewProperty.locality, viewProperty.district].filter(Boolean).join(', ')}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Rooms & Beds')}</p>
                  <p className="font-mono text-slate-900">
                    {tr(`${viewProperty.roomsCount} rooms`)} · {tr(`${viewProperty.occupiedBeds}/${viewProperty.totalBeds} beds`)}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Collected')}</p>
                  <p className="font-mono text-emerald-700">{formatInr(viewProperty.collectedTotal)}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Pending Rent')}</p>
                  <p className="font-mono text-amber-700">{formatInr(viewProperty.outstandingDue)}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Staff Count')}</p>
                  <p className="text-slate-800">
                    {tr(`${viewProperty.wardenCount} wardens`)} · {tr(`${viewProperty.staffCount} staff`)}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Added On')}</p>
                  <p className="text-slate-800">{formatDateShort(viewProperty.createdAt)}</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  const target = viewProperty;
                  setViewProperty(null);
                  openEditPropertyModal(target);
                }}
                className="rounded-md border border-slate-300 bg-white px-3.5 py-1.5 typo-btn text-slate-800 hover:bg-slate-50"
              >
                {tr('Edit Property')}
              </button>
              <button
                type="button"
                onClick={() => setViewProperty(null)}
                className="rounded-md bg-slate-900 px-4 py-1.5 typo-btn text-white hover:bg-slate-800"
              >
                {tr('Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Staff Details Modal */}
      {viewStaff && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-staff-details-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="view-staff-details-title" className="typo-section-heading text-slate-900">
                {tr('Staff Details')}
              </h2>
              <button
                type="button"
                onClick={() => setViewStaff(null)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 typo-body">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="typo-helper text-slate-500">{tr('Name')}</p>
                  <p className="font-semibold text-slate-900">{viewStaff.name}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Role')}</p>
                  <p className="capitalize font-medium text-slate-900">{tr(viewStaff.role)}</p>
                </div>
                <div className="col-span-2">
                  <p className="typo-helper text-slate-500">{tr('Email')}</p>
                  <p className="font-mono text-slate-800">{viewStaff.email}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('PG Property')}</p>
                  <p className="font-medium text-slate-900">{viewStaff.tenantName}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('PG Owner')}</p>
                  <p className="text-slate-800">{viewStaff.ownerName}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Status')}</p>
                  <p className={`font-semibold ${viewStaff.isActive ? 'text-emerald-700' : 'text-red-700'}`}>
                    {viewStaff.isActive ? tr('Active') : tr('Inactive')}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Added On')}</p>
                  <p className="text-slate-800">{formatDateShort(viewStaff.createdAt)}</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  const target = viewStaff;
                  setViewStaff(null);
                  openEditStaffModal(target);
                }}
                className="rounded-md border border-slate-300 bg-white px-3.5 py-1.5 typo-btn text-slate-800 hover:bg-slate-50"
              >
                {tr('Edit Staff')}
              </button>
              <button
                type="button"
                onClick={() => setViewStaff(null)}
                className="rounded-md bg-slate-900 px-4 py-1.5 typo-btn text-white hover:bg-slate-800"
              >
                {tr('Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Onboard Owner & Initial PG */}
      {onboardOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboard-owner-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="onboard-owner-title" className="typo-section-heading text-slate-900">
                {tr('Add PG Owner & Property')}
              </h2>
              <button
                type="button"
                onClick={() => setOnboardOpen(false)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleOnboardOwner} className="p-5 space-y-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="adm-own-name" className="block typo-label text-slate-700">
                    {tr('Owner Full Name')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="adm-own-name"
                    type="text"
                    required
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder={tr('e.g. Karthik Raja')}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="adm-own-email" className="block typo-label text-slate-700">
                    {tr('Owner Email')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="adm-own-email"
                    type="email"
                    required
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="owner@pg.example"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="adm-own-pass" className="block typo-label text-slate-700">
                    {tr('Password (min 6 chars)')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="adm-own-pass"
                    type="password"
                    required
                    minLength={6}
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="adm-own-plan" className="block typo-label text-slate-700">
                    {tr('Plan')} <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="adm-own-plan"
                    required
                    value={pgPlan}
                    onChange={(e) => setPgPlan(e.target.value as TenantPlanTier)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  >
                    <option value="lifetime">{tr('Lifetime')}</option>
                    <option value="standard">{tr('Standard')}</option>
                    <option value="trial">{tr('Trial')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="adm-pg-name" className="block typo-label text-slate-700">
                  {tr('PG Property Name')} <span className="text-red-600">*</span>
                </label>
                <input
                  id="adm-pg-name"
                  type="text"
                  required
                  value={pgName}
                  onChange={(e) => setPgName(e.target.value)}
                  placeholder={tr("e.g. Sri Balaji Men's PG")}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="adm-pg-dist" className="block typo-label text-slate-700">
                    {tr('City / District')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="adm-pg-dist"
                    type="text"
                    required
                    value={pgDistrict}
                    onChange={(e) => setPgDistrict(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="adm-pg-loc" className="block typo-label text-slate-700">
                    {tr('Locality / Area')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="adm-pg-loc"
                    type="text"
                    required
                    value={pgLocality}
                    onChange={(e) => setPgLocality(e.target.value)}
                    placeholder={tr('e.g. Guindy')}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="adm-pg-phone" className="block typo-label text-slate-700">
                    {tr('Contact Phone')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="adm-pg-phone"
                    type="tel"
                    required
                    value={pgPhone}
                    onChange={(e) => setPgPhone(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="adm-pg-pin" className="block typo-label text-slate-700">
                    {tr('Pincode')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="adm-pg-pin"
                    type="text"
                    required
                    pattern="\d{6}"
                    maxLength={6}
                    value={pgPincode}
                    onChange={(e) => setPgPincode(e.target.value)}
                    placeholder="600032"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setOnboardOpen(false)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  {tr('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={onboardBusy}
                  className="rounded-md bg-teal-700 px-4 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {onboardBusy ? tr('Creating...') : tr('Create Owner & PG')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add PG Property */}
      {addPgOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-pg-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="add-pg-title" className="typo-section-heading text-slate-900">
                {tr('Add PG Property')}
              </h2>
              <button
                type="button"
                onClick={() => setAddPgOpen(false)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddPg} className="p-5 space-y-3">
              <div>
                <label className="block typo-label text-slate-700">{tr('PG Owner')}</label>
                <select
                  required
                  value={addPgOwnerId}
                  onChange={(e) => setAddPgOwnerId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                >
                  {data.owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.email})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block typo-label text-slate-700">{tr('PG Property Name')}</label>
                <input
                  type="text"
                  required
                  value={addPgName}
                  onChange={(e) => setAddPgName(e.target.value)}
                  placeholder={tr('e.g. Cauvery PG — Adyar')}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">{tr('City / District')}</label>
                  <input
                    type="text"
                    required
                    value={addPgDistrict}
                    onChange={(e) => setAddPgDistrict(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">{tr('Locality')}</label>
                  <input
                    type="text"
                    required
                    value={addPgLocality}
                    onChange={(e) => setAddPgLocality(e.target.value)}
                    placeholder={tr('e.g. Adyar')}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">{tr('Phone')}</label>
                  <input
                    type="tel"
                    required
                    value={addPgPhone}
                    onChange={(e) => setAddPgPhone(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">{tr('Plan')}</label>
                  <select
                    value={addPgPlan}
                    onChange={(e) => setAddPgPlan(e.target.value as TenantPlanTier)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    <option value="lifetime">{tr('Lifetime')}</option>
                    <option value="standard">{tr('Standard')}</option>
                    <option value="trial">{tr('Trial')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block typo-label text-slate-700">{tr('Pincode (6 digits)')}</label>
                <input
                  type="text"
                  pattern="\d{6}"
                  maxLength={6}
                  value={addPgPincode}
                  onChange={(e) => setAddPgPincode(e.target.value)}
                  placeholder="600020"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setAddPgOpen(false)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  {tr('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={addPgBusy}
                  className="rounded-md bg-teal-700 px-4 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {addPgBusy ? tr('Adding...') : tr('Add PG Property')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Staff */}
      {addWardenOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-warden-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="add-warden-title" className="typo-section-heading text-slate-900">
                {tr('Add Staff Member')}
              </h2>
              <button
                type="button"
                onClick={() => setAddWardenOpen(false)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAddWarden} className="p-5 space-y-3">
              <div>
                <label className="block typo-label text-slate-700">{tr('PG Property')}</label>
                <select
                  required
                  value={wardenTenantId}
                  onChange={(e) => setWardenTenantId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                >
                  {data.workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name} ({ws.ownerName})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">{tr('Full Name')}</label>
                  <input
                    type="text"
                    required
                    value={wardenName}
                    onChange={(e) => setWardenName(e.target.value)}
                    placeholder={tr('e.g. Ramesh Kumar')}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">{tr('Role')}</label>
                  <select
                    value={wardenRole}
                    onChange={(e) => setWardenRole(e.target.value as 'warden' | 'staff')}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    <option value="warden">{tr('Warden')}</option>
                    <option value="staff">{tr('Staff')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block typo-label text-slate-700">{tr('Email')}</label>
                <input
                  type="email"
                  required
                  value={wardenEmail}
                  onChange={(e) => setWardenEmail(e.target.value)}
                  placeholder="warden@pg.example"
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>
              <div>
                <label className="block typo-label text-slate-700">{tr('Password (min 6 chars)')}</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={wardenPassword}
                  onChange={(e) => setWardenPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setAddWardenOpen(false)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  {tr('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={wardenBusy}
                  className="rounded-md bg-teal-700 px-4 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {wardenBusy ? tr('Creating...') : tr('Create Staff')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Owner */}
      {editOwnerTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-owner-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="edit-owner-title" className="typo-section-heading text-slate-900">
                {tr('Edit Owner')}
              </h2>
              <button
                type="button"
                onClick={() => setEditOwnerTarget(null)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEditOwner} className="p-5 space-y-3">
              <div>
                <label className="block typo-label text-slate-700">{tr('Owner Full Name')}</label>
                <input
                  type="text"
                  required
                  value={editOwnerName}
                  onChange={(e) => setEditOwnerName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>
              <div>
                <label className="block typo-label text-slate-700">{tr('Email')}</label>
                <input
                  type="email"
                  required
                  value={editOwnerEmail}
                  onChange={(e) => setEditOwnerEmail(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setEditOwnerTarget(null)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  {tr('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={editOwnerBusy}
                  className="rounded-md bg-teal-700 px-4 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {editOwnerBusy ? tr('Saving...') : tr('Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit PG Property */}
      {editPropertyTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-prop-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="edit-prop-title" className="typo-section-heading text-slate-900">
                {tr('Edit PG Property')}
              </h2>
              <button
                type="button"
                onClick={() => setEditPropertyTarget(null)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEditProperty} className="p-5 space-y-3">
              <div>
                <label className="block typo-label text-slate-700">{tr('PG Property Name')}</label>
                <input
                  type="text"
                  required
                  value={editPropName}
                  onChange={(e) => setEditPropName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>
              <div>
                <label className="block typo-label text-slate-700">{tr('Owner')}</label>
                <select
                  value={editPropOwnerId}
                  onChange={(e) => setEditPropOwnerId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                >
                  {data.owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">{tr('City / District')}</label>
                  <input
                    type="text"
                    required
                    value={editPropDistrict}
                    onChange={(e) => setEditPropDistrict(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">{tr('Locality')}</label>
                  <input
                    type="text"
                    value={editPropLocality}
                    onChange={(e) => setEditPropLocality(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">{tr('Phone')}</label>
                  <input
                    type="tel"
                    required
                    value={editPropPhone}
                    onChange={(e) => setEditPropPhone(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">{tr('Plan')}</label>
                  <select
                    value={editPropPlan}
                    onChange={(e) => setEditPropPlan(e.target.value as TenantPlanTier)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    <option value="lifetime">{tr('Lifetime')}</option>
                    <option value="standard">{tr('Standard')}</option>
                    <option value="trial">{tr('Trial')}</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setEditPropertyTarget(null)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  {tr('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={editPropBusy}
                  className="rounded-md bg-teal-700 px-4 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {editPropBusy ? tr('Saving...') : tr('Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Staff */}
      {editStaffTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-staff-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="edit-staff-title" className="typo-section-heading text-slate-900">
                {tr('Edit Staff Member')}
              </h2>
              <button
                type="button"
                onClick={() => setEditStaffTarget(null)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEditStaff} className="p-5 space-y-3">
              <div>
                <label className="block typo-label text-slate-700">{tr('Full Name')}</label>
                <input
                  type="text"
                  required
                  value={editStaffName}
                  onChange={(e) => setEditStaffName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">{tr('Role')}</label>
                  <select
                    value={editStaffRole}
                    onChange={(e) => setEditStaffRole(e.target.value as 'warden' | 'staff')}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    <option value="warden">{tr('Warden')}</option>
                    <option value="staff">{tr('Staff')}</option>
                  </select>
                </div>
                <div>
                  <label className="block typo-label text-slate-700">{tr('PG Property')}</label>
                  <select
                    value={editStaffTenantId}
                    onChange={(e) => setEditStaffTenantId(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    {data.workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setEditStaffTarget(null)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  {tr('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={editStaffBusy}
                  className="rounded-md bg-teal-700 px-4 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {editStaffBusy ? tr('Saving...') : tr('Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reset Password */}
      {resetTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-pass-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="reset-pass-title" className="flex items-center gap-2 typo-section-heading text-slate-900">
                <KeyRound className="h-4 w-4 text-teal-700" aria-hidden="true" />
                <span>{tr('Reset Password')}</span>
              </h2>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleResetPasswordSubmit} className="p-5 space-y-3">
              <p className="typo-body text-slate-600">
                {tr(`New password for ${resetTarget.name}.`)}
              </p>
              <div>
                <label htmlFor="adm-reset-pass" className="block typo-label text-slate-700">
                  {tr('New Password (min 6 chars)')}
                </label>
                <input
                  id="adm-reset-pass"
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="rounded-md border border-slate-300 bg-white px-3.5 py-2 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  {tr('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={resetBusy || newPassword.length < 6}
                  className="rounded-md bg-slate-900 px-3.5 py-2 typo-btn font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {resetBusy ? tr('Updating...') : tr('Update Password')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmations */}
      <ConfirmDialog
        open={Boolean(deleteOwnerTarget)}
        title={tr(`Delete owner ${deleteOwnerTarget?.name || ''}?`)}
        description={tr('Owners can only be deleted once all of their PG properties are reassigned or deleted.')}
        confirmLabel={tr('Delete Owner')}
        destructive
        busy={Boolean(deleteOwnerTarget && busyId === deleteOwnerTarget.id)}
        onConfirm={handleConfirmDeleteOwner}
        onCancel={() => setDeleteOwnerTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deletePropTarget)}
        title={tr(`Delete ${deletePropTarget?.name || 'PG Property'}?`)}
        description={tr('Properties with active or upcoming tenant stays cannot be deleted.')}
        confirmLabel={tr('Delete Property')}
        destructive
        busy={Boolean(deletePropTarget && busyId === deletePropTarget.id)}
        onConfirm={handleConfirmDeleteProperty}
        onCancel={() => setDeletePropTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteStaffTarget)}
        title={tr(`Delete ${deleteStaffTarget?.name || 'staff member'}?`)}
        description={tr('This permanently removes this staff account from the platform.')}
        confirmLabel={tr('Delete Staff')}
        destructive
        busy={Boolean(deleteStaffTarget && busyId === deleteStaffTarget.id)}
        onConfirm={handleConfirmDeleteStaff}
        onCancel={() => setDeleteStaffTarget(null)}
      />
    </div>
  );
}
