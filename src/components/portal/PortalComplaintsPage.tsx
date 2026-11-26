import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Eye, MessageSquareWarning, Plus, Search, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { formatDateShort } from '../../lib/format';
import { useLanguage } from '../../lib/LanguageContext';
import type { ComplaintRecord } from '../../types/domain';
import { ConfirmDialog } from '../ConfirmDialog';

interface PortalComplaintsPageProps {
  properties: Array<{ id: string; name: string }>;
  onShowToast: (kind: 'ok' | 'error', text: string) => void;
}

export function PortalComplaintsPage({ properties, onShowToast }: PortalComplaintsPageProps) {
  const { tr } = useLanguage();
  const [complaints, setComplaints] = useState<ComplaintRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [viewTarget, setViewTarget] = useState<ComplaintRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ComplaintRecord | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const [newTenantId, setNewTenantId] = useState('');
  const [newGuestName, setNewGuestName] = useState('');
  const [newRoomLabel, setNewRoomLabel] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [addBusy, setAddBusy] = useState(false);

  const propNameMap = new Map(properties.map((p) => [p.id, p.name]));

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getComplaints();
      setComplaints(res.complaints);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('Could not load complaints.'));
    } finally {
      setLoading(false);
    }
  }, [tr]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openAddModal = () => {
    setNewTenantId(propertyFilter !== 'all' ? propertyFilter : properties[0]?.id || '');
    setNewGuestName('');
    setNewRoomLabel('');
    setNewTitle('');
    setNewDescription('');
    setNewPriority('medium');
    setAddOpen(true);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setAddBusy(true);
    try {
      await api.createComplaint({
        tenantId: newTenantId || undefined,
        guestName: newGuestName.trim() || 'Tenant',
        roomLabel: newRoomLabel.trim() || 'General',
        title: newTitle.trim(),
        description: newDescription.trim(),
        priority: newPriority,
      });
      setAddOpen(false);
      onShowToast('ok', tr('Complaint added.'));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not add complaint.'));
    } finally {
      setAddBusy(false);
    }
  };

  const handleStatusChange = async (
    item: ComplaintRecord,
    nextStatus: 'open' | 'in_progress' | 'resolved'
  ) => {
    setBusyId(item.id);
    try {
      await api.updateComplaintStatus(item.id, nextStatus);
      setComplaints((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, status: nextStatus } : c))
      );
      onShowToast('ok', tr(`Complaint marked ${nextStatus.replace('_', ' ')}.`));
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not update status.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await api.deleteComplaint(deleteTarget.id);
      setDeleteTarget(null);
      onShowToast('ok', tr('Complaint deleted.'));
      await loadData();
    } catch (err) {
      onShowToast('error', err instanceof Error ? err.message : tr('Could not delete complaint.'));
    } finally {
      setBusyId(null);
    }
  };

  const filtered = complaints.filter((c) => {
    if (propertyFilter !== 'all' && c.tenantId !== propertyFilter) return false;
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.title.toLowerCase().includes(q) ||
      c.guestName.toLowerCase().includes(q) ||
      c.roomLabel.toLowerCase().includes(q) ||
      (propNameMap.get(c.tenantId) || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="typo-dashboard-title text-slate-900">{tr('Complaints')}</h1>
          <p className="mt-1 typo-body text-slate-600">
            {tr('Track and resolve tenant complaints across your PG properties.')}
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3.5 py-2 typo-btn font-semibold text-white hover:bg-teal-800"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>{tr('Add Complaint')}</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr('Search complaints by issue, tenant, or room...')}
            className="w-full rounded-md border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-3 typo-input focus:border-teal-700 focus:bg-white focus:outline-none"
          />
        </div>
        {properties.length > 1 && (
          <select
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            aria-label={tr('Filter by property')}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 typo-input"
          >
            <option value="all">{tr('All Properties')}</option>
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
          <option value="open">{tr('Open')}</option>
          <option value="in_progress">{tr('In Progress')}</option>
          <option value="resolved">{tr('Resolved')}</option>
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
        {loading && complaints.length === 0 ? (
          <div className="p-8 text-center typo-body text-slate-500">{tr('Loading complaints...')}</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <MessageSquareWarning className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
            <p className="typo-card-title text-slate-900">{tr('No complaints found')}</p>
            <p className="typo-helper text-slate-500">
              {tr('All clear or adjust your filters to see complaints.')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left typo-table-td">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 typo-table-th">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">{tr('Issue')}</th>
                  <th className="px-4 py-2.5 font-semibold">{tr('Tenant & Property')}</th>
                  <th className="px-4 py-2.5 font-semibold">{tr('Priority')}</th>
                  <th className="px-4 py-2.5 font-semibold">{tr('Status')}</th>
                  <th className="px-4 py-2.5 font-semibold text-right">{tr('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  const priorityLabel =
                    c.priority === 'high' ? 'High' : c.priority === 'medium' ? 'Medium' : 'Low';
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{c.title}</p>
                        <p className="typo-helper text-slate-500">{formatDateShort(c.createdAt)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800">{c.guestName}</p>
                        <p className="typo-helper text-slate-500">
                          {propNameMap.get(c.tenantId) || tr('PG Property')} · {tr(c.roomLabel)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-semibold ${
                            c.priority === 'high'
                              ? 'text-red-700'
                              : c.priority === 'medium'
                                ? 'text-amber-700'
                                : 'text-slate-600'
                          }`}
                        >
                          {tr(priorityLabel)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={c.status}
                          disabled={busyId === c.id}
                          onChange={(e) =>
                            handleStatusChange(c, e.target.value as 'open' | 'in_progress' | 'resolved')
                          }
                          aria-label={tr(`Status for ${c.title}`)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 typo-input"
                        >
                          <option value="open">{tr('Open')}</option>
                          <option value="in_progress">{tr('In Progress')}</option>
                          <option value="resolved">{tr('Resolved')}</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewTarget(c)}
                            className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-800 hover:border-teal-700 hover:text-teal-800 whitespace-nowrap"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{tr('View Details')}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(c)}
                            className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2.5 py-1 typo-btn text-red-700 hover:bg-red-50 whitespace-nowrap"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{tr('Delete')}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
          aria-labelledby="view-complaint-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="view-complaint-title" className="typo-section-heading text-slate-900">
                {tr('Complaint Details')}
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
              <div>
                <p className="typo-helper text-slate-500">{tr('Issue')}</p>
                <p className="font-semibold text-slate-900">{viewTarget.title}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="typo-helper text-slate-500">{tr('PG Property')}</p>
                  <p className="text-slate-800">{propNameMap.get(viewTarget.tenantId) || tr('PG Property')}</p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Tenant & Room')}</p>
                  <p className="text-slate-800">
                    {viewTarget.guestName} · {tr(viewTarget.roomLabel)}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Priority')}</p>
                  <p className="font-medium text-slate-900">
                    {tr(viewTarget.priority === 'high' ? 'High' : viewTarget.priority === 'medium' ? 'Medium' : 'Low')}
                  </p>
                </div>
                <div>
                  <p className="typo-helper text-slate-500">{tr('Status')}</p>
                  <p className="font-medium text-slate-900">
                    {tr(
                      viewTarget.status === 'in_progress'
                        ? 'In Progress'
                        : viewTarget.status === 'resolved'
                          ? 'Resolved'
                          : 'Open'
                    )}
                  </p>
                </div>
              </div>
              <div>
                <p className="typo-helper text-slate-500">{tr('Description')}</p>
                <p className="text-slate-700">{viewTarget.description || tr('No description provided.')}</p>
              </div>
            </div>
            <div className="flex justify-end border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={() => setViewTarget(null)}
                className="rounded-md bg-slate-900 px-4 py-1.5 typo-btn text-white hover:bg-slate-800"
              >
                {tr('Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Complaint Modal */}
      {addOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-complaint-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 id="add-complaint-title" className="typo-section-heading text-slate-900">
                {tr('Add Complaint')}
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
            <form onSubmit={handleCreate} className="p-5 space-y-3">
              {properties.length > 0 && (
                <div>
                  <label className="block typo-label text-slate-700">{tr('PG Property')}</label>
                  <select
                    required
                    value={newTenantId}
                    onChange={(e) => setNewTenantId(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block typo-label text-slate-700">
                  {tr('Issue Title')} <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={tr('e.g. Bathroom tap leaking')}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block typo-label text-slate-700">{tr('Tenant Name')}</label>
                  <input
                    type="text"
                    value={newGuestName}
                    onChange={(e) => setNewGuestName(e.target.value)}
                    placeholder={tr('e.g. Karthik')}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
                <div>
                  <label className="block typo-label text-slate-700">{tr('Room')}</label>
                  <input
                    type="text"
                    value={newRoomLabel}
                    onChange={(e) => setNewRoomLabel(e.target.value)}
                    placeholder={tr('e.g. Room 101')}
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                  />
                </div>
              </div>
              <div>
                <label className="block typo-label text-slate-700">{tr('Priority')}</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as 'low' | 'medium' | 'high')}
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 typo-input"
                >
                  <option value="low">{tr('Low')}</option>
                  <option value="medium">{tr('Medium')}</option>
                  <option value="high">{tr('High')}</option>
                </select>
              </div>
              <div>
                <label className="block typo-label text-slate-700">{tr('Description')}</label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder={tr('Short details about the issue...')}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 typo-input"
                />
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
                  {addBusy ? tr('Saving...') : tr('Submit Complaint')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={tr('Delete Complaint?')}
        description={tr(`Delete complaint "${deleteTarget?.title || ''}"?`)}
        confirmLabel={tr('Delete')}
        destructive
        busy={Boolean(deleteTarget && busyId === deleteTarget.id)}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
