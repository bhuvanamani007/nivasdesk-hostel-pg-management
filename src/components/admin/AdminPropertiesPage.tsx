import { Building2, Eye, Pencil, Trash2 } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';
import type { AdminWorkspaceSummary } from '../../types/domain';

interface AdminPropertiesPageProps {
  workspaces: AdminWorkspaceSummary[];
  busyId: string | null;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  onViewPropertyDetails: (ws: AdminWorkspaceSummary) => void;
  onEditProperty: (ws: AdminWorkspaceSummary) => void;
  onToggleWorkspaceStatus: (ws: AdminWorkspaceSummary) => void;
  onDeleteProperty: (ws: AdminWorkspaceSummary) => void;
}

export function AdminPropertiesPage({
  workspaces,
  busyId,
  hasActiveFilters,
  onResetFilters,
  onViewPropertyDetails,
  onEditProperty,
  onToggleWorkspaceStatus,
  onDeleteProperty,
}: AdminPropertiesPageProps) {
  const { tr } = useLanguage();

  return (
    <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {workspaces.length === 0 ? (
        <div className="p-8 text-center space-y-2.5">
          <Building2 className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
          <p className="typo-card-title text-slate-900">{tr('No PG properties found')}</p>
          <p className="typo-helper text-slate-500">
            {hasActiveFilters
              ? tr('No PG properties match the active filter.')
              : tr('Add a new PG property using the button above.')}
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
                <th className="px-4 py-2.5 font-semibold">{tr('PG Property')}</th>
                <th className="px-4 py-2.5 font-semibold">{tr('Owner')}</th>
                <th className="px-4 py-2.5 font-semibold text-right">{tr('Beds')}</th>
                <th className="px-4 py-2.5 font-semibold">{tr('Status')}</th>
                <th className="px-4 py-2.5 font-semibold text-right">{tr('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workspaces.map((ws) => (
                <tr key={ws.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{ws.name}</p>
                    <p className="typo-helper text-slate-500">
                      {[ws.locality, ws.district].filter(Boolean).join(', ')}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{ws.ownerName}</p>
                    <p className="font-mono typo-helper text-slate-500">{ws.wardenPhone}</p>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                    {ws.occupiedBeds}/{ws.totalBeds} ({ws.occupancyPercent}%)
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-semibold capitalize ${
                        ws.status === 'active' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {tr(ws.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onViewPropertyDetails(ws)}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-800 hover:border-teal-700 hover:text-teal-800 whitespace-nowrap"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{tr('View Details')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditProperty(ws)}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{tr('Edit')}</span>
                      </button>
                      <button
                        type="button"
                        disabled={busyId === ws.id}
                        onClick={() => onToggleWorkspaceStatus(ws)}
                        className={`rounded border px-2.5 py-1 typo-btn whitespace-nowrap disabled:opacity-50 ${
                          ws.status === 'active'
                            ? 'border-amber-200 bg-white text-amber-800 hover:bg-amber-50'
                            : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {tr(ws.status === 'active' ? 'Suspend' : 'Activate')}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === ws.id}
                        onClick={() => onDeleteProperty(ws)}
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
