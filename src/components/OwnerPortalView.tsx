import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  BedDouble,
  Building2,
  Eye,
  IndianRupee,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import { formatDateShort, formatInr } from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';
import type {
  NotificationFilterCategory,
  NotificationsPayload,
  OwnerOverviewPayload,
  OwnerPropertySummary,
  OwnerWardenRecord,
  User,
} from '../types/domain';
import { ConfirmDialog } from './ConfirmDialog';
import type { NavTab } from './Shell';
import { OwnerRoomsPage } from './owner/OwnerRoomsPage';
import { PortalComplaintsPage } from './portal/PortalComplaintsPage';
import { PortalNotificationsPage } from './portal/PortalNotificationsPage';
import { PortalPaymentsPage } from './portal/PortalPaymentsPage';
import { PortalTenantsPage } from './portal/PortalTenantsPage';

export type OwnerSection =
  | 'owner-overview'
  | 'owner-properties'
  | 'owner-rooms'
  | 'owner-tenants'
  | 'owner-rent'
  | 'owner-payments'
  | 'owner-wardens'
  | 'owner-complaints'
  | 'owner-notifications';

interface OwnerPortalViewProps {
  section: OwnerSection;
  activeTenantId: string;
  currentUser: User;
  notificationsData: NotificationsPayload | null;
  onMarkNotificationRead: (id: string) => void | Promise<void>;
  onMarkAllNotificationsRead: (category?: NotificationFilterCategory) => void | Promise<void>;
  onRefreshNotifications: () => void | Promise<void>;
  onNavigateSection: (section: NavTab) => void;
  onSelectActiveProperty: (tenantId: string, targetTab?: NavTab) => void;
  onShowToast: (kind: 'ok' | 'error', text: string) => void;
}

export function OwnerPortalView({
  section,
  activeTenantId,
  currentUser,
  notificationsData,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onRefreshNotifications,
  onNavigateSection,
  onSelectActiveProperty,
  onShowToast,
}: OwnerPortalViewProps) {
  const { tr } = useLanguage();
  const [data, setData] = useState<OwnerOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [staffPropertyFilter, setStaffPropertyFilter] = useState('all');
  const [staffRoleFilter, setStaffRoleFilter] = useState<'all' | 'warden' | 'staff'>('all');

  // View Details Modals
  const [viewProperty, setViewProperty] = useState<OwnerPropertySummary | null>(null);
  const [viewStaff, setViewStaff] = useState<OwnerWardenRecord | null>(null);

  // Add Property Modal
  const [addPgOpen, setAddPgOpen] = useState(false);
  const [pgName, setPgName] = useState('');
  const [pgDistrict, setPgDistrict] = useState('Chennai');
  const [pgLocality, setPgLocality] = useState('');
  const [pgPincode, setPgPincode] = useState('');
  const [pgPhone, setPgPhone] = useState('+91 ');
  const [pgBusy, setPgBusy] = useState(false);

  // Edit Property Modal
  const [editPropTarget, setEditPropTarget] = useState<OwnerPropertySummary | null>(null);
  const [editPropName, setEditPropName] = useState('');
  const [editPropDistrict, setEditPropDistrict] = useState('');
  const [editPropLocality, setEditPropLocality] = useState('');
  const [editPropPincode, setEditPropPincode] = useState('');
  const [editPropPhone, setEditPropPhone] = useState('');
  const [editPropBusy, setEditPropBusy] = useState(false);

  // Add Staff/Warden Modal
  const [addWardenOpen, setAddWardenOpen] = useState(false);
  const [wardenTenantId, setWardenTenantId] = useState('');
  const [wardenName, setWardenName] = useState('');
  const [wardenEmail, setWardenEmail] = useState('');
  const [wardenRole, setWardenRole] = useState<'' | 'warden' | 'staff'>('');
  const [wardenPassword, setWardenPassword] = useState('');
  const [wardenBusy, setWardenBusy] = useState(false);

  // Edit Staff Modal
  const [editStaffTarget, setEditStaffTarget] = useState<OwnerWardenRecord | null>(null);
  const [editStaffName, setEditStaffName] = useState('');
  const [editStaffRole, setEditStaffRole] = useState<'warden' | 'staff'>('warden');
  const [editStaffTenantId, setEditStaffTenantId] = useState('');
  const [editStaffBusy, setEditStaffBusy] = useState(false);

  // Reset Password Modal
  const [resetTarget, setResetTarget] = useState<OwnerWardenRecord | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);

  // Delete Confirmations
  const [deletePropTarget, setDeletePropTarget] = useState<OwnerPropertySummary | null>(null);
  const [deleteStaffTarget, setDeleteStaffTarget] = useState<OwnerWardenRecord | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getOwnerOverview();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('Failed to load owner dashboard.'));
    } finally {
      setLoading(false);
    }
  }, [tr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddProperty = async (e: FormEvent) => {
    e.preventDefault();
    setPgBusy(true);
    try {
      await api.createOwnerProperty({
        name: pgName.trim(),
        district: pgDistrict.trim(),
        locality: pgLocality.trim(),
        pincode: pgPincode.trim(),
        wardenPhone: pgPhone.trim(),
      });
      setAddPgOpen(false);
      setPgName('');
      setPgLocality('');
      setPgPincode('');
      setPgPhone('+91 ');
      onShowToast('ok', tr(`${pgName.trim()} added to your properties.`));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not add property.'));
    } finally {
      setPgBusy(false);
    }
  };

  const openEditPropertyModal = (p: OwnerPropertySummary) => {
    setEditPropTarget(p);
    setEditPropName(p.name);
    setEditPropDistrict(p.district || p.city || 'Chennai');
    setEditPropLocality(p.locality || '');
    setEditPropPincode(p.pincode || '');
    setEditPropPhone(p.wardenPhone || '+91 ');
  };

  const handleSaveEditProperty = async (e: FormEvent) => {
    e.preventDefault();
    if (!editPropTarget) return;
    setEditPropBusy(true);
    try {
      await api.updateOwnerProperty(editPropTarget.id, {
        name: editPropName.trim(),
        district: editPropDistrict.trim(),
        locality: editPropLocality.trim(),
        pincode: editPropPincode.trim(),
        wardenPhone: editPropPhone.trim(),
      });
      setEditPropTarget(null);
      onShowToast('ok', tr('Property details updated.'));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not update property.'));
    } finally {
      setEditPropBusy(false);
    }
  };

  const handleAddWarden = async (e: FormEvent) => {
    e.preventDefault();
    if (!wardenTenantId) {
      onShowToast('error', tr('Please select a PG property.'));
      return;
    }
    if (wardenRole !== 'warden' && wardenRole !== 'staff') {
      onShowToast('error', tr('Please select a role.'));
      return;
    }
    setWardenBusy(true);
    try {
      await api.createOwnerWarden({
        tenantId: wardenTenantId,
        name: wardenName.trim(),
        email: wardenEmail.trim(),
        role: wardenRole,
        password: wardenPassword,
      });
      setAddWardenOpen(false);
      setWardenTenantId('');
      setWardenName('');
      setWardenEmail('');
      setWardenRole('');
      setWardenPassword('');
      onShowToast('ok', tr(`${wardenName.trim()} added.`));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not add staff.'));
    } finally {
      setWardenBusy(false);
    }
  };

  const openEditStaffModal = (w: OwnerWardenRecord) => {
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
      await api.updateOwnerWarden(editStaffTarget.id, {
        name: editStaffName.trim(),
        role: editStaffRole,
        tenantId: editStaffTenantId,
      });
      setEditStaffTarget(null);
      onShowToast('ok', tr('Staff member updated.'));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not update staff.'));
    } finally {
      setEditStaffBusy(false);
    }
  };

  const handleToggleWardenActive = async (w: OwnerWardenRecord) => {
    setBusyId(w.id);
    try {
      await api.updateOwnerWarden(w.id, { isActive: !w.isActive });
      onShowToast('ok', tr(`${w.name} ${w.isActive ? 'deactivated' : 'activated'}.`));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not update status.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleResetWardenPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetBusy(true);
    try {
      await api.updateOwnerWarden(resetTarget.id, { password: resetPassword });
      setResetTarget(null);
      setResetPassword('');
      onShowToast('ok', tr(`Password updated for ${resetTarget.name}.`));
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not update password.'));
    } finally {
      setResetBusy(false);
    }
  };

  const handleDeleteProperty = async () => {
    if (!deletePropTarget) return;
    setBusyId(deletePropTarget.id);
    try {
      await api.deleteOwnerProperty(deletePropTarget.id);
      setDeletePropTarget(null);
      onShowToast('ok', tr('Property deleted.'));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not delete property.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteStaff = async () => {
    if (!deleteStaffTarget) return;
    setBusyId(deleteStaffTarget.id);
    try {
      await api.deleteOwnerWarden(deleteStaffTarget.id);
      setDeleteStaffTarget(null);
      onShowToast('ok', tr('Staff member removed.'));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not remove staff.'));
    } finally {
      setBusyId(null);
    }
  };

  // Dedicated standalone Owner sections
  if (section === 'owner-rooms') {
    return <OwnerRoomsPage onShowToast={onShowToast} />;
  }
  if (section === 'owner-tenants') {
    return <PortalTenantsPage onShowToast={onShowToast} />;
  }
  if (section === 'owner-rent') {
    return <PortalPaymentsPage mode="rent" onShowToast={onShowToast} />;
  }
  if (section === 'owner-payments') {
    return <PortalPaymentsPage mode="history" onShowToast={onShowToast} />;
  }
  if (section === 'owner-complaints') {
    return (
      <PortalComplaintsPage
        properties={(data?.properties || []).map((p) => ({ id: p.id, name: p.name }))}
        onShowToast={onShowToast}
      />
    );
  }
  if (section === 'owner-notifications') {
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
        {tr('Loading your PG properties...')}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 flex items-center justify-between typo-body text-red-900">
        <span>{error ? tr(error) : tr('Could not load owner portal.')}</span>
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

  const s = data.summary;
  const totalTenantsCount = data.properties.reduce((sum, p) => sum + p.activeGuestsCount, 0);
  const normalizedSearch = search.trim().toLowerCase();

  const filteredProperties = data.properties.filter((p) => {
    if (!normalizedSearch) return true;
    return (
      p.name.toLowerCase().includes(normalizedSearch) ||
      p.locality.toLowerCase().includes(normalizedSearch) ||
      p.district.toLowerCase().includes(normalizedSearch)
    );
  });

  const staffOnly = data.wardens.filter((w) => w.role === 'warden' || w.role === 'staff');
  const filteredStaff = staffOnly.filter((w) => {
    if (staffPropertyFilter !== 'all' && w.tenantId !== staffPropertyFilter) return false;
    if (staffRoleFilter !== 'all' && w.role !== staffRoleFilter) return false;
    if (!normalizedSearch) return true;
    return (
      w.name.toLowerCase().includes(normalizedSearch) ||
      w.email.toLowerCase().includes(normalizedSearch) ||
      w.tenantName.toLowerCase().includes(normalizedSearch)
    );
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="typo-dashboard-title text-slate-900">
            {section === 'owner-overview'
              ? tr('Dashboard')
              : section === 'owner-properties'
                ? tr('My Properties')
                : tr('Staff Management')}
          </h1>
          <p className="mt-1 typo-body text-slate-600">
            {section === 'owner-overview'
              ? tr(`Welcome back, ${currentUser.name}. Here is a quick look at your PG properties.`)
              : section === 'owner-properties'
                ? tr('View, add, edit, or manage your PG properties.')
                : tr('Add wardens and staff members and assign them to your PG properties.')}
          </p>
        </div>

        {(section === 'owner-overview' || section === 'owner-properties') && (
          <button
            type="button"
            onClick={() => setAddPgOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3.5 py-2 typo-btn font-semibold text-white hover:bg-teal-800 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{tr('Add Property')}</span>
          </button>
        )}

        {section === 'owner-wardens' && (
          <button
            type="button"
            disabled={data.properties.length === 0}
            onClick={() => {
              setWardenTenantId('');
              setWardenRole('');
              setAddWardenOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3.5 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{tr('Add Staff / Warden')}</span>
          </button>
        )}
      </div>

      {/* SECTION 1: OWNER DASHBOARD */}
      {section === 'owner-overview' && (
        <>
          <section aria-label={tr('Owner summary')} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() => onNavigateSection('owner-properties')}
              className="rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-teal-700 transition-colors"
            >
              <div className="flex items-center justify-between text-slate-600">
                <span className="typo-card-title font-semibold">{tr('My Properties')}</span>
                <Building2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {s.totalProperties}
              </p>
              <p className="mt-1 typo-helper text-slate-500">{tr(`${s.activeProperties} active`)}</p>
            </button>

            <button
              type="button"
              onClick={() => onNavigateSection('owner-rooms')}
              className="rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-teal-700 transition-colors"
            >
              <div className="flex items-center justify-between text-slate-600">
                <span className="typo-card-title font-semibold">{tr('Rooms & Beds')}</span>
                <BedDouble className="h-4 w-4 text-slate-400" aria-hidden="true" />
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {s.occupiedBeds}/{s.totalBeds}
              </p>
              <p className="mt-1 typo-helper text-slate-500">
                {tr(`${s.totalRooms} rooms · ${s.vacantBeds} beds free`)}
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigateSection('owner-tenants')}
              className="rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-teal-700 transition-colors"
            >
              <div className="flex items-center justify-between text-slate-600">
                <span className="typo-card-title font-semibold">{tr('Tenants')}</span>
                <Users className="h-4 w-4 text-slate-400" aria-hidden="true" />
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                {totalTenantsCount}
              </p>
              <p className="mt-1 typo-helper text-slate-500">
                {tr(`${s.totalWardens + s.totalStaff} staff members`)}
              </p>
            </button>

            <button
              type="button"
              onClick={() => onNavigateSection('owner-rent')}
              className="rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-teal-700 transition-colors"
            >
              <div className="flex items-center justify-between text-slate-600">
                <span className="typo-card-title font-semibold">{tr('Pending Rent')}</span>
                <IndianRupee className="h-4 w-4 text-slate-400" aria-hidden="true" />
              </div>
              <p className="mt-2 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
                {formatInr(s.totalOutstandingDue)}
              </p>
              <p className="mt-1 typo-helper text-slate-500">
                {tr(`${formatInr(s.totalCollected)} collected`)}
              </p>
            </button>
          </section>

          {/* Short My Properties Preview Table */}
          <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 className="typo-section-heading text-slate-900">{tr('My Properties')}</h2>
              <button
                type="button"
                onClick={() => onNavigateSection('owner-properties')}
                className="typo-btn font-semibold text-teal-700 hover:underline"
              >
                {tr(`View All (${data.properties.length}) →`)}
              </button>
            </div>
            {data.properties.length === 0 ? (
              <div className="p-6 text-center typo-body text-slate-500">
                {tr('No properties added yet. Click "Add Property" to create your first PG.')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left typo-table-td">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 typo-table-th">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">{tr('PG Property')}</th>
                      <th className="px-4 py-2.5 font-semibold">{tr('Location')}</th>
                      <th className="px-4 py-2.5 font-semibold text-right">{tr('Beds')}</th>
                      <th className="px-4 py-2.5 font-semibold text-right">{tr('Pending Rent')}</th>
                      <th className="px-4 py-2.5 font-semibold text-right">{tr('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.properties.slice(0, 5).map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3 font-semibold text-slate-900">{p.name}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {[p.locality, p.district].filter(Boolean).join(', ')}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                          {p.occupiedBeds}/{p.totalBeds} ({p.occupancyPercent}%)
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700">
                          {formatInr(p.outstandingDue)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setViewProperty(p)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-800 hover:border-teal-700 hover:text-teal-800 whitespace-nowrap"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{tr('View Details')}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* SECTION 2: MY PROPERTIES */}
      {section === 'owner-properties' && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr('Search properties by name or location...')}
                className="w-full rounded-md border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-3 typo-input focus:border-teal-700 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            {filteredProperties.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Building2 className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
                <p className="typo-card-title text-slate-900">{tr('No properties found')}</p>
                <p className="typo-helper text-slate-500">{tr('Add a PG property using the button above.')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left typo-table-td">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 typo-table-th">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">{tr('Property')}</th>
                      <th className="px-4 py-2.5 font-semibold">{tr('Location')}</th>
                      <th className="px-4 py-2.5 font-semibold text-right">{tr('Rooms & Beds')}</th>
                      <th className="px-4 py-2.5 font-semibold text-right">{tr('Pending Rent')}</th>
                      <th className="px-4 py-2.5 font-semibold text-right">{tr('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProperties.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">
                            {p.name}
                            {p.id === activeTenantId && (
                              <span className="ml-2 typo-helper font-semibold text-teal-700">
                                {tr('(Selected)')}
                              </span>
                            )}
                          </p>
                          <p className="font-mono typo-helper text-slate-500">{p.wardenPhone}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {[p.locality, p.district].filter(Boolean).join(', ')}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                          {tr(`${p.roomsCount} rooms`)} · {p.occupiedBeds}/{p.totalBeds} {tr('beds')}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700">
                          {formatInr(p.outstandingDue)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setViewProperty(p)}
                              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-800 hover:border-teal-700 hover:text-teal-800 whitespace-nowrap"
                            >
                              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('View Details')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditPropertyModal(p)}
                              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Edit')}</span>
                            </button>
                            <button
                              type="button"
                              disabled={busyId === p.id || data.properties.length <= 1}
                              onClick={() => setDeletePropTarget(p)}
                              className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2.5 py-1 typo-btn text-red-700 hover:bg-red-50 disabled:opacity-40 whitespace-nowrap"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Delete')}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* SECTION 7: STAFF MANAGEMENT */}
      {section === 'owner-wardens' && (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr('Search staff by name, email, or property...')}
                className="w-full rounded-md border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-3 typo-input focus:border-teal-700 focus:bg-white focus:outline-none"
              />
            </div>
            {data.properties.length > 1 && (
              <select
                value={staffPropertyFilter}
                onChange={(e) => setStaffPropertyFilter(e.target.value)}
                aria-label={tr('Filter by property')}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 typo-input"
              >
                <option value="all">{tr('All Properties')}</option>
                {data.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
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
          </div>

          <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            {filteredStaff.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <Users className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
                <p className="typo-card-title text-slate-900">{tr('No staff members found')}</p>
                <p className="typo-helper text-slate-500">
                  {tr('Add a warden or staff member using the button above.')}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left typo-table-td">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 typo-table-th">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">{tr('Name')}</th>
                      <th className="px-4 py-2.5 font-semibold">{tr('Role')}</th>
                      <th className="px-4 py-2.5 font-semibold">{tr('PG Property')}</th>
                      <th className="px-4 py-2.5 font-semibold">{tr('Status')}</th>
                      <th className="px-4 py-2.5 font-semibold text-right">{tr('Actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStaff.map((w) => (
                      <tr key={w.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-900">{w.name}</p>
                          <p className="font-mono typo-helper text-slate-500">{w.email}</p>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {tr(w.role === 'warden' ? 'Warden' : 'Staff')}
                        </td>
                        <td className="px-4 py-3 text-slate-800">{w.tenantName}</td>
                        <td className="px-4 py-3">
                          <span className={`font-semibold ${w.isActive ? 'text-emerald-700' : 'text-red-700'}`}>
                            {tr(w.isActive ? 'Active' : 'Inactive')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setViewStaff(w)}
                              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-800 hover:border-teal-700 hover:text-teal-800 whitespace-nowrap"
                            >
                              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('View Details')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditStaffModal(w)}
                              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Edit')}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setResetTarget(w);
                                setResetPassword('');
                              }}
                              className="rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                            >
                              {tr('Reset Pass')}
                            </button>
                            <button
                              type="button"
                              disabled={busyId === w.id}
                              onClick={() => handleToggleWardenActive(w)}
                              className={`rounded border px-2.5 py-1 typo-btn whitespace-nowrap disabled:opacity-50 ${
                                w.isActive
                                  ? 'border-amber-200 bg-white text-amber-800 hover:bg-amber-50'
                                  : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              {w.isActive ? tr('Deactivate') : tr('Activate')}
                            </button>
                            <button
                              type="button"
                              disabled={busyId === w.id}
                              onClick={() => setDeleteStaffTarget(w)}
                              className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2.5 py-1 typo-btn text-red-700 hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>{tr('Delete')}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* Modal: View Property Details */}
      {viewProperty && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="owner-view-prop-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="owner-view-prop-title" className="typo-section-heading text-slate-900">
                {tr('Property Details')}
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
                  <p className="typo-helper text-slate-500">{tr('Phone')}</p>
                  <p className="font-mono text-slate-800">{viewProperty.wardenPhone}</p>
                </div>
                <div className="col-span-2">
                  <p className="typo-helper text-slate-500">{tr('Address')}</p>
                  <p className="text-slate-800">
                    {[viewProperty.locality, viewProperty.district, viewProperty.pincode]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Rooms & Beds')}</p>
                  <p className="font-mono text-slate-900">
                    {tr(`${viewProperty.roomsCount} rooms`)} · {tr(`${viewProperty.occupiedBeds}/${viewProperty.totalBeds} beds`)}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Active Tenants')}</p>
                  <p className="font-mono text-slate-900">{viewProperty.activeGuestsCount}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Collected Rent')}</p>
                  <p className="font-mono text-emerald-700">{formatInr(viewProperty.collectedTotal)}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Pending Rent')}</p>
                  <p className="font-mono text-amber-700">{formatInr(viewProperty.outstandingDue)}</p>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-2">
                <p className="typo-helper text-slate-500">{tr('Assigned Wardens')}</p>
                <p className="text-slate-800">
                  {viewProperty.wardenNames.join(', ') || tr('No wardens assigned')}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              {viewProperty.id !== activeTenantId && (
                <button
                  type="button"
                  onClick={() => {
                    const id = viewProperty.id;
                    setViewProperty(null);
                    onSelectActiveProperty(id, 'owner-properties');
                  }}
                  className="rounded-md border border-slate-300 bg-white px-3.5 py-1.5 typo-btn text-slate-800 hover:bg-slate-50"
                >
                  {tr('Select Property')}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  const target = viewProperty;
                  setViewProperty(null);
                  openEditPropertyModal(target);
                }}
                className="rounded-md border border-slate-300 bg-white px-3.5 py-1.5 typo-btn text-slate-800 hover:bg-slate-50"
              >
                {tr('Edit')}
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

      {/* Modal: View Staff Details */}
      {viewStaff && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="owner-view-staff-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="owner-view-staff-title" className="typo-section-heading text-slate-900">
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
                  <p className="text-slate-900">{viewStaff.tenantName}</p>
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
                {tr('Edit')}
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

      {/* Modal: Add Property */}
      {addPgOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="owner-add-pg-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="owner-add-pg-title" className="typo-section-heading text-slate-900">
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
            <form onSubmit={handleAddProperty} className="p-5 space-y-3">
              <div>
                <label className="block typo-label text-slate-700">
                  {tr('Property Name')} <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={pgName}
                  onChange={(e) => setPgName(e.target.value)}
                  placeholder={tr('e.g. Cauvery PG — Velachery')}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">
                    {tr('City / District')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={pgDistrict}
                    onChange={(e) => setPgDistrict(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">
                    {tr('Locality / Area')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={pgLocality}
                    onChange={(e) => setPgLocality(e.target.value)}
                    placeholder={tr('e.g. Velachery')}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">
                    {tr('Contact Phone')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={pgPhone}
                    onChange={(e) => setPgPhone(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">
                    {tr('Pincode')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    pattern="\d{6}"
                    maxLength={6}
                    value={pgPincode}
                    onChange={(e) => setPgPincode(e.target.value)}
                    placeholder="600042"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
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
                  disabled={pgBusy}
                  className="rounded-md bg-teal-700 px-4 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {pgBusy ? tr('Saving...') : tr('Add Property')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Property */}
      {editPropTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="owner-edit-pg-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="owner-edit-pg-title" className="typo-section-heading text-slate-900">
                {tr('Edit Property')}
              </h2>
              <button
                type="button"
                onClick={() => setEditPropTarget(null)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEditProperty} className="p-5 space-y-3">
              <div>
                <label className="block typo-label text-slate-700">{tr('Property Name')}</label>
                <input
                  type="text"
                  required
                  value={editPropName}
                  onChange={(e) => setEditPropName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
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
                  <label className="block typo-label text-slate-700">{tr('Locality / Area')}</label>
                  <input
                    type="text"
                    required
                    value={editPropLocality}
                    onChange={(e) => setEditPropLocality(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">{tr('Contact Phone')}</label>
                  <input
                    type="tel"
                    required
                    value={editPropPhone}
                    onChange={(e) => setEditPropPhone(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">{tr('Pincode')}</label>
                  <input
                    type="text"
                    required
                    pattern="\d{6}"
                    maxLength={6}
                    value={editPropPincode}
                    onChange={(e) => setEditPropPincode(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setEditPropTarget(null)}
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

      {/* Modal: Add Staff / Warden (Required fields preserved) */}
      {addWardenOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="owner-add-warden-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="owner-add-warden-title" className="typo-section-heading text-slate-900">
                {tr('Add Staff / Warden')}
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
                <label htmlFor="ow-pg" className="block typo-label text-slate-700">
                  {tr('PG Property')} <span className="text-red-600">*</span>
                </label>
                <select
                  id="ow-pg"
                  required
                  value={wardenTenantId}
                  onChange={(e) => setWardenTenantId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                >
                  <option value="" disabled>
                    {tr('Select PG property...')}
                  </option>
                  {data.properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ow-name" className="block typo-label text-slate-700">
                  {tr('Full Name')} <span className="text-red-600">*</span>
                </label>
                <input
                  id="ow-name"
                  type="text"
                  required
                  value={wardenName}
                  onChange={(e) => setWardenName(e.target.value)}
                  placeholder={tr('e.g. Senthil Kumar')}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ow-email" className="block typo-label text-slate-700">
                    {tr('Email')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="ow-email"
                    type="email"
                    required
                    value={wardenEmail}
                    onChange={(e) => setWardenEmail(e.target.value)}
                    placeholder="warden@pg.example"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
                <div>
                  <label htmlFor="ow-role" className="block typo-label text-slate-700">
                    {tr('Role')} <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="ow-role"
                    required
                    value={wardenRole}
                    onChange={(e) => setWardenRole(e.target.value as 'warden' | 'staff')}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    <option value="" disabled>
                      {tr('Select role...')}
                    </option>
                    <option value="warden">{tr('Warden')}</option>
                    <option value="staff">{tr('Staff')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="ow-pass" className="block typo-label text-slate-700">
                  {tr('Password (min 6 chars)')} <span className="text-red-600">*</span>
                </label>
                <input
                  id="ow-pass"
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
                  {wardenBusy ? tr('Saving...') : tr('Add Staff')}
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
          aria-labelledby="owner-edit-staff-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="owner-edit-staff-title" className="typo-section-heading text-slate-900">
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
                    {data.properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
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

      {/* Modal: Reset Staff Password */}
      {resetTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-warden-pass-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="reset-warden-pass-title" className="flex items-center gap-2 typo-section-heading text-slate-900">
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
            <form onSubmit={handleResetWardenPassword} className="p-5 space-y-3">
              <p className="typo-body text-slate-600">
                {tr(`Set a new password for ${resetTarget.name}.`)}
              </p>
              <div>
                <label htmlFor="reset-wpass" className="block typo-label text-slate-700">
                  {tr('New Password (min 6 chars)')}
                </label>
                <input
                  id="reset-wpass"
                  type="password"
                  required
                  minLength={6}
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
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
                  disabled={resetBusy || resetPassword.length < 6}
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
        open={Boolean(deletePropTarget)}
        title={tr(`Delete ${deletePropTarget?.name || 'Property'}?`)}
        description={tr('Properties with active or upcoming tenants cannot be deleted.')}
        confirmLabel={tr('Delete Property')}
        destructive
        busy={Boolean(deletePropTarget && busyId === deletePropTarget.id)}
        onConfirm={handleDeleteProperty}
        onCancel={() => setDeletePropTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteStaffTarget)}
        title={tr(`Delete ${deleteStaffTarget?.name || 'staff member'}?`)}
        description={tr('This permanently removes this staff account from your property.')}
        confirmLabel={tr('Delete Staff')}
        destructive
        busy={Boolean(deleteStaffTarget && busyId === deleteStaffTarget.id)}
        onConfirm={handleDeleteStaff}
        onCancel={() => setDeleteStaffTarget(null)}
      />
    </div>
  );
}
