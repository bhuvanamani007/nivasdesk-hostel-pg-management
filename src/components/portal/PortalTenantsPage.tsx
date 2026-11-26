import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Eye, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateShort, formatInr } from '../../lib/format';
import { useLanguage } from '../../lib/LanguageContext';
import type { IdDocumentType, PortalTenantItem } from '../../types/domain';
import { ConfirmDialog } from '../ConfirmDialog';

interface PortalTenantsPageProps {
  onShowToast: (kind: 'ok' | 'error', text: string) => void;
}

export function PortalTenantsPage({ onShowToast }: PortalTenantsPageProps) {
  const { tr } = useLanguage();
  const [tenants, setTenants] = useState<PortalTenantItem[]>([]);
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([]);
  const [vacantBeds, setVacantBeds] = useState<
    Array<{
      id: string;
      tenantId: string;
      tenantName: string;
      roomNumber: string;
      bedLabel: string;
      monthlyTariff: number;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [viewTarget, setViewTarget] = useState<PortalTenantItem | null>(null);
  const [editTarget, setEditTarget] = useState<PortalTenantItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PortalTenantItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Add form state
  const [tenantId, setTenantId] = useState('');
  const [fullName, setFullName] = useState('');
  const [primaryPhone, setPrimaryPhone] = useState('+91 ');
  const [permanentAddress, setPermanentAddress] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('+91 ');
  const [idType, setIdType] = useState<IdDocumentType>('aadhaar');
  const [idNumber, setIdNumber] = useState('');
  const [bedId, setBedId] = useState('');
  const [monthlyRent, setMonthlyRent] = useState('');
  const [addBusy, setAddBusy] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editEmergencyName, setEditEmergencyName] = useState('');
  const [editEmergencyPhone, setEditEmergencyPhone] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'former' | 'inactive'>('active');
  const [editBusy, setEditBusy] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPortalTenants({
        tenantId: propertyFilter,
        status: statusFilter,
        search: search.trim() || undefined,
      });
      setTenants(res.tenants);
      setProperties(res.properties);
      setVacantBeds(res.vacantBeds);
      if (!tenantId && res.properties[0]) {
        setTenantId(res.properties[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load tenants.');
    } finally {
      setLoading(false);
    }
  }, [propertyFilter, statusFilter, search, tenantId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadData();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const openAddModal = () => {
    setTenantId(propertyFilter !== 'all' ? propertyFilter : properties[0]?.id || '');
    setFullName('');
    setPrimaryPhone('+91 ');
    setPermanentAddress('');
    setEmergencyContactName('');
    setEmergencyContactPhone('+91 ');
    setIdType('aadhaar');
    setIdNumber('');
    setBedId('');
    setMonthlyRent('');
    setAddOpen(true);
  };

  const openEditModal = (t: PortalTenantItem) => {
    setEditTarget(t);
    setEditName(t.fullName);
    setEditPhone(t.primaryPhone);
    setEditAddress(t.permanentAddress);
    setEditEmergencyName(t.emergencyContactName);
    setEditEmergencyPhone(t.emergencyContactPhone);
    setEditStatus(t.status);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setAddBusy(true);
    try {
      await api.createPortalTenant({
        tenantId,
        fullName,
        primaryPhone,
        permanentAddress,
        emergencyContactName,
        emergencyContactPhone,
        idType,
        idNumber,
        bedId: bedId || undefined,
        monthlyRent: monthlyRent ? Number(monthlyRent) : undefined,
      });
      setAddOpen(false);
      onShowToast('ok', tr(`Tenant ${fullName.trim()} added.`));
      await loadData();
    } catch (err) {
      onShowToast('error', tr(err instanceof Error ? err.message : 'Could not add tenant.'));
    } finally {
      setAddBusy(false);
    }
  };

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditBusy(true);
    try {
      await api.updatePortalTenant(editTarget.id, {
        fullName: editName.trim(),
        primaryPhone: editPhone.trim(),
        permanentAddress: editAddress.trim(),
        emergencyContactName: editEmergencyName.trim(),
        emergencyContactPhone: editEmergencyPhone.trim(),
        status: editStatus,
      });
      setEditTarget(null);
      onShowToast('ok', tr('Tenant details updated.'));
      await loadData();
    } catch (err) {
      onShowToast('error', tr(err instanceof Error ? err.message : 'Could not update tenant.'));
    } finally {
      setEditBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await api.deletePortalTenant(deleteTarget.id);
      setDeleteTarget(null);
      onShowToast('ok', tr(`Tenant ${deleteTarget.fullName} removed.`));
      await loadData();
    } catch (err) {
      onShowToast('error', tr(err instanceof Error ? err.message : 'Could not delete tenant.'));
    } finally {
      setBusyId(null);
    }
  };

  const propertyBeds = vacantBeds.filter((b) => b.tenantId === tenantId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="typo-dashboard-title text-slate-900">{tr('Tenants')}</h1>
          <p className="mt-1 typo-body text-slate-600">
            {tr('View, add, edit, or remove tenants across your PG properties.')}
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          disabled={properties.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3.5 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>{tr('Add Tenant')}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr('Search by tenant name, phone, or room...')}
            className="w-full rounded-md border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-3 typo-input focus:border-teal-700 focus:bg-white focus:outline-none"
          />
        </div>
        {properties.length > 1 && (
          <select
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            aria-label={tr('Filter by PG property')}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 typo-input"
          >
            <option value="all">{tr(`All Properties (${properties.length})`)}</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label={tr('Filter by status')}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 typo-input"
        >
          <option value="all">{tr('All Status')}</option>
          <option value="active">{tr('Active')}</option>
          <option value="former">{tr('Former')}</option>
          <option value="inactive">{tr('Inactive')}</option>
        </select>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 typo-body text-red-900">
          <span>{tr(error)}</span>
          <button
            type="button"
            onClick={loadData}
            className="rounded border border-red-300 bg-white px-3 py-1 typo-btn text-red-800 hover:bg-red-100"
          >
            {tr('Retry')}
          </button>
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        {loading && tenants.length === 0 ? (
          <div className="p-8 text-center typo-body text-slate-500">{tr('Loading tenants...')}</div>
        ) : tenants.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <Users className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
            <p className="typo-card-title text-slate-900">{tr('No tenants found')}</p>
            <p className="typo-helper text-slate-500">
              {tr('Try clearing your filters or add a new tenant.')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left typo-table-td">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 typo-table-th">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">{tr('Tenant')}</th>
                  <th className="px-4 py-2.5 font-semibold">{tr('Property & Room')}</th>
                  <th className="px-4 py-2.5 font-semibold text-right">{tr('Pending Rent')}</th>
                  <th className="px-4 py-2.5 font-semibold">{tr('Status')}</th>
                  <th className="px-4 py-2.5 font-semibold text-right">{tr('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{t.fullName}</p>
                      <p className="font-mono typo-helper text-slate-500">{t.primaryPhone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{t.tenantName}</p>
                      <p className="typo-helper text-slate-500">{tr(t.roomLabel)}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      <span className={t.balanceDue > 0 ? 'font-semibold text-red-700' : 'text-slate-600'}>
                        {formatInr(t.balanceDue)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-semibold capitalize ${
                          t.status === 'active' ? 'text-emerald-700' : 'text-slate-600'
                        }`}
                      >
                        {tr(t.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewTarget(t)}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-800 hover:border-teal-700 hover:text-teal-800 whitespace-nowrap"
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{tr('View Details')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(t)}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{tr('Edit')}</span>
                        </button>
                        <button
                          type="button"
                          disabled={busyId === t.id}
                          onClick={() => setDeleteTarget(t)}
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

      {/* View Details Modal */}
      {viewTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="view-tenant-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="view-tenant-title" className="typo-section-heading text-slate-900">
                {tr('Tenant Details')}
              </h2>
              <button
                type="button"
                onClick={() => setViewTarget(null)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 typo-body">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="typo-helper text-slate-500">{tr('Full Name')}</p>
                  <p className="font-semibold text-slate-900">{viewTarget.fullName}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Phone')}</p>
                  <p className="font-mono text-slate-800">{viewTarget.primaryPhone}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('PG Property')}</p>
                  <p className="font-medium text-slate-900">{viewTarget.tenantName}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Room & Bed')}</p>
                  <p className="font-medium text-slate-900">{tr(viewTarget.roomLabel)}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Monthly Rent')}</p>
                  <p className="font-mono text-slate-900">
                    {viewTarget.monthlyRent > 0 ? formatInr(viewTarget.monthlyRent) : '—'}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Pending Rent')}</p>
                  <p className={`font-mono font-semibold ${viewTarget.balanceDue > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {formatInr(viewTarget.balanceDue)}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Check-in Date')}</p>
                  <p className="text-slate-800">
                    {viewTarget.checkInAt ? formatDateShort(viewTarget.checkInAt) : '—'}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Government ID')}</p>
                  <p className="font-mono text-slate-800">
                    {viewTarget.idType.toUpperCase()} · {viewTarget.idMasked || '—'}
                  </p>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <p className="typo-helper text-slate-500">{tr('Permanent Address')}</p>
                <p className="text-slate-800">{viewTarget.permanentAddress || '—'}</p>
              </div>
              <div>
                <p className="typo-helper text-slate-500">{tr('Emergency Contact')}</p>
                <p className="text-slate-800">
                  {viewTarget.emergencyContactName} ({tr(viewTarget.emergencyContactRelation || 'Family')}) ·{' '}
                  <span className="font-mono">{viewTarget.emergencyContactPhone}</span>
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={() => {
                  const target = viewTarget;
                  setViewTarget(null);
                  openEditModal(target);
                }}
                className="rounded-md border border-slate-300 bg-white px-3.5 py-1.5 typo-btn text-slate-800 hover:bg-slate-50"
              >
                {tr('Edit Tenant')}
              </button>
              <button
                type="button"
                onClick={() => setViewTarget(null)}
                className="rounded-md bg-slate-900 px-3.5 py-1.5 typo-btn text-white hover:bg-slate-800"
              >
                {tr('Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Tenant Modal */}
      {addOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-tenant-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="add-tenant-title" className="typo-section-heading text-slate-900">
                {tr('Add Tenant')}
              </h2>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-3.5">
              <div>
                <label className="block typo-label text-slate-700">
                  {tr('PG Property')} <span className="text-red-600">*</span>
                </label>
                <select
                  required
                  value={tenantId}
                  onChange={(e) => {
                    setTenantId(e.target.value);
                    setBedId('');
                    setMonthlyRent('');
                  }}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block typo-label text-slate-700">
                    {tr('Full Name')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={tr('e.g. Arun Kumar')}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">
                    {tr('Phone Number')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={primaryPhone}
                    onChange={(e) => setPrimaryPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block typo-label text-slate-700">
                  {tr('Address')} <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={permanentAddress}
                  onChange={(e) => setPermanentAddress(e.target.value)}
                  placeholder={tr('Home city / permanent address')}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block typo-label text-slate-700">
                    {tr('Emergency Contact Name')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                    placeholder={tr('Parent / Guardian name')}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">
                    {tr('Emergency Contact Phone')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                    placeholder="+91 98765 00000"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block typo-label text-slate-700">{tr('ID Proof Type')}</label>
                  <select
                    value={idType}
                    onChange={(e) => setIdType(e.target.value as IdDocumentType)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  >
                    <option value="aadhaar">{tr('Aadhaar')}</option>
                    <option value="pan">{tr('PAN Card')}</option>
                    <option value="driving_license">{tr('Driving License')}</option>
                    <option value="passport">{tr('Passport')}</option>
                  </select>
                </div>
                <div>
                  <label className="block typo-label text-slate-700">
                    {tr('ID Number')} <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value)}
                    placeholder={tr('Enter ID number')}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-t border-slate-100 pt-3">
                <div>
                  <label className="block typo-label text-slate-700">{tr('Assign Vacant Bed (optional)')}</label>
                  <select
                    value={bedId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setBedId(nextId);
                      const matched = propertyBeds.find((b) => b.id === nextId);
                      if (matched) setMonthlyRent(String(matched.monthlyTariff));
                    }}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  >
                    <option value="">{tr('Assign later')}</option>
                    {propertyBeds.map((b) => (
                      <option key={b.id} value={b.id}>
                        {tr(`Room ${b.roomNumber}-${b.bedLabel}`)} ({formatInr(b.monthlyTariff)})
                      </option>
                    ))}
                  </select>
                </div>
                {bedId && (
                  <div>
                    <label className="block typo-label text-slate-700">{tr('Monthly Rent (INR)')}</label>
                    <input
                      type="number"
                      min={100}
                      value={monthlyRent}
                      onChange={(e) => setMonthlyRent(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  {tr('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={addBusy}
                  className="rounded-md bg-teal-700 px-4 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {addBusy ? tr('Saving...') : tr('Save Tenant')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Tenant Modal */}
      {editTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-tenant-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="edit-tenant-title" className="typo-section-heading text-slate-900">
                {tr('Edit Tenant')}
              </h2>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                aria-label={tr('Close modal')}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleUpdate} className="p-5 space-y-3">
              <div>
                <label className="block typo-label text-slate-700">{tr('Full Name')}</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block typo-label text-slate-700">{tr('Phone')}</label>
                <input
                  type="tel"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div>
                <label className="block typo-label text-slate-700">{tr('Address')}</label>
                <input
                  type="text"
                  required
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">{tr('Emergency Contact')}</label>
                  <input
                    type="text"
                    required
                    value={editEmergencyName}
                    onChange={(e) => setEditEmergencyName(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">{tr('Emergency Phone')}</label>
                  <input
                    type="tel"
                    required
                    value={editEmergencyPhone}
                    onChange={(e) => setEditEmergencyPhone(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block typo-label text-slate-700">{tr('Status')}</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as 'active' | 'former' | 'inactive')}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                >
                  <option value="active">{tr('Active')}</option>
                  <option value="former">{tr('Former')}</option>
                  <option value="inactive">{tr('Inactive')}</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  {tr('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={editBusy}
                  className="rounded-md bg-teal-700 px-4 py-2 typo-btn font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {editBusy ? tr('Saving...') : tr('Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={tr(`Delete tenant ${deleteTarget?.fullName || ''}?`)}
        description={tr('This removes the tenant profile and history. Active tenants must be checked out before deleting.')}
        confirmLabel={tr('Delete Tenant')}
        destructive
        busy={Boolean(deleteTarget && busyId === deleteTarget.id)}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
