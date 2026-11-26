import { Eye, Pencil, Trash2, Users } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';
import type { AdminOwnerSummary } from '../../types/domain';

interface AdminOwnersPageProps {
  owners: AdminOwnerSummary[];
  busyId: string | null;
  hasActiveFilters: boolean;
  onResetFilters: () => void;
  onViewOwnerDetails: (owner: AdminOwnerSummary) => void;
  onEditOwner: (owner: AdminOwnerSummary) => void;
  onResetOwnerPassword: (owner: AdminOwnerSummary) => void;
  onToggleOwnerActive: (owner: AdminOwnerSummary) => void;
  onDeleteOwner: (owner: AdminOwnerSummary) => void;
}

export function AdminOwnersPage({
  owners,
  busyId,
  hasActiveFilters,
  onResetFilters,
  onViewOwnerDetails,
  onEditOwner,
  onResetOwnerPassword,
  onToggleOwnerActive,
  onDeleteOwner,
}: AdminOwnersPageProps) {
  const { tr } = useLanguage();

  return (
    <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {owners.length === 0 ? (
        <div className="p-8 text-center space-y-2.5">
          <Users className="mx-auto h-6 w-6 text-slate-400" aria-hidden="true" />
          <p className="typo-card-title text-slate-900">{tr('No PG owners found')}</p>
          <p className="typo-helper text-slate-500">
            {tr('Try clearing your search or add a new PG owner.')}
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
                <th className="px-4 py-2.5 font-semibold">{tr('Owner')}</th>
                <th className="px-4 py-2.5 font-semibold">{tr('PG Properties')}</th>
                <th className="px-4 py-2.5 font-semibold">{tr('Status')}</th>
                <th className="px-4 py-2.5 font-semibold text-right">{tr('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {owners.map((owner) => (
                <tr key={owner.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{owner.name}</p>
                    <p className="font-mono typo-helper text-slate-500">{owner.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">
                      {owner.propertyNames.join(', ') || tr('None')}
                    </p>
                    <p className="typo-helper text-slate-500">
                      {tr(`${owner.propertyCount} ${owner.propertyCount === 1 ? 'property' : 'properties'}`)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-semibold ${
                        owner.isActive ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {tr(owner.isActive ? 'Active' : 'Suspended')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onViewOwnerDetails(owner)}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-800 hover:border-teal-700 hover:text-teal-800 whitespace-nowrap"
                      >
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{tr('View Details')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditOwner(owner)}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{tr('Edit')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onResetOwnerPassword(owner)}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 typo-btn text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        {tr('Reset Pass')}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === owner.id}
                        onClick={() => onToggleOwnerActive(owner)}
                        className={`rounded border px-2.5 py-1 typo-btn whitespace-nowrap disabled:opacity-50 ${
                          owner.isActive
                            ? 'border-amber-200 bg-white text-amber-800 hover:bg-amber-50'
                            : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
                        }`}
                      >
                        {tr(owner.isActive ? 'Suspend' : 'Activate')}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === owner.id}
                        onClick={() => onDeleteOwner(owner)}
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
