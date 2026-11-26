import { Eye, Pencil, Trash2, UserCheck } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';
import type { AdminWardenRecord } from '../../types/domain';

interface AdminWardensPageProps {
  wardens: AdminWardenRecord[];
  busyId: string | null;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  onViewStaffDetails: (warden: AdminWardenRecord) => void;
  onEditStaff: (warden: AdminWardenRecord) => void;
  onResetWardenPassword: (warden: AdminWardenRecord) => void;
  onToggleWardenActive: (warden: AdminWardenRecord) => void;
  onDeleteWarden: (warden: AdminWardenRecord) => void;
}

export function AdminWardensPage({
  wardens,
  busyId,
  hasActiveFilters,
  onResetFilters,
  onViewStaffDetails,
  onEditStaff,
  onResetWardenPassword,
  onToggleWardenActive,
  onDeleteWarden,
}: AdminWardensPageProps) {
  const { tr } = useLanguage();

  return (
    <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {wardens.length === 0 ? (
        <div className="p-8 text-center space-y-2.5">
          <UserCheck className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
          <p className="typo-card-title text-slate-900">{tr('No staff members found')}</p>
          <p className="typo-helper text-slate-500">
            {hasActiveFilters
              ? tr('No staff members match the current search or filter.')
              : tr('Add a warden or staff member using the button above.')}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 typo-btn font-semibold text-slate-800 hover:bg-slate-50"
            >
              {tr('Clear Filters')}
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left typo-table-td">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 typo-table-th">
              <tr>
                <th className="px-4 py-2.5 font-semibold">{tr('Staff Name')}</th>
                <th className="px-4 py-2.5 font-semibold">{tr('Role')}</th>
                <th className="px-4 py-2.5 font-semibold">{tr('PG Property')}</th>
                <th className="px-4 py-2.5 font-semibold">{tr('Status')}</th>
                <th className="px-4 py-2.5 font-semibold text-right">{tr('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {wardens.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{w.name}</p>
                    <p className="font-mono typo-helper text-slate-500">{w.email}</p>
                  </td>
                  <td className="px-4 py-3 capitalize font-medium text-slate-700">
                    {tr(w.role)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{w.tenantName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-semibold ${
                        w.isActive ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {tr(w.isActive ? 'Active' : 'Inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onViewStaffDetails(w)}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-800 hover:border-teal-700 hover:text-teal-800 whitespace-nowrap"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{tr('View Details')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditStaff(w)}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{tr('Edit')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onResetWardenPassword(w)}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        {tr('Reset Pass')}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === w.id}
                        onClick={() => onToggleWardenActive(w)}
                        className={`rounded border px-2.5 py-1 typo-btn whitespace-nowrap disabled:opacity-50 ${
                          w.isActive
                            ? 'border-amber-200 bg-white text-amber-800 hover:bg-amber-50'
                            : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {tr(w.isActive ? 'Suspend' : 'Activate')}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === w.id}
                        onClick={() => onDeleteWarden(w)}
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
  );
}
