import { Building2, Eye, IndianRupee, UserCheck, Users } from 'lucide-react';
import { formatDateShort, formatInr } from '../../lib/format';
import { useLanguage } from '../../lib/LanguageContext';
import type { AdminOverviewPayload, AdminWorkspaceSummary } from '../../types/domain';
import type { NavTab } from '../Shell';

interface AdminDashboardPageProps {
  data: AdminOverviewPayload;
  onNavigateSection: (section: NavTab) => void;
  onViewPropertyDetails: (ws: AdminWorkspaceSummary) => void;
}

export function AdminDashboardPage({
  data,
  onNavigateSection,
  onViewPropertyDetails,
}: AdminDashboardPageProps) {
  const { tr } = useLanguage();
  const s = data.summary;
  const topProperties = data.workspaces.slice(0, 5);
  const topDues = data.pendingDues.slice(0, 5);

  return (
    <div className="space-y-5">
      {/* 4 Simple Summary Cards */}
      <section aria-label={tr('Key numbers')} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          onClick={() => onNavigateSection('admin-owners')}
          className="rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-teal-700 transition-colors"
        >
          <div className="flex items-center justify-between text-slate-600">
            <span className="typo-card-title font-semibold">{tr('PG Owners')}</span>
            <Users className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {s.totalOwners}
          </p>
          <p className="mt-1 typo-helper text-slate-500">{tr(`${s.activeOwners} active accounts`)}</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection('admin-workspaces')}
          className="rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-teal-700 transition-colors"
        >
          <div className="flex items-center justify-between text-slate-600">
            <span className="typo-card-title font-semibold">{tr('PG Properties')}</span>
            <Building2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {s.totalWorkspaces}
          </p>
          <p className="mt-1 typo-helper text-slate-500">
            {tr(`${s.occupiedBeds}/${s.totalBeds} beds occupied (${s.occupancyPercent}%)`)}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection('admin-tenants')}
          className="rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-teal-700 transition-colors"
        >
          <div className="flex items-center justify-between text-slate-600">
            <span className="typo-card-title font-semibold">{tr('Tenants')}</span>
            <UserCheck className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {s.activeGuestsCount}
          </p>
          <p className="mt-1 typo-helper text-slate-500">
            {tr(`${s.totalWardens + s.totalStaff} staff members`)}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection('admin-payments')}
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
            {tr(`${data.pendingDues.length} pending payments`)}
          </p>
        </button>
      </section>

      {/* Short PG Properties Table */}
      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="typo-section-heading text-slate-900">{tr('PG Properties')}</h2>
          <button
            type="button"
            onClick={() => onNavigateSection('admin-workspaces')}
            className="typo-btn font-semibold text-teal-700 hover:underline"
          >
            {tr(`View All (${data.workspaces.length}) →`)}
          </button>
        </div>
        {topProperties.length === 0 ? (
          <div className="p-6 text-center typo-body text-slate-500">
            {tr('No PG properties added yet.')}
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
                {topProperties.map((ws) => (
                  <tr key={ws.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{ws.name}</p>
                      <p className="typo-helper text-slate-500">
                        {[ws.locality, ws.district].filter(Boolean).join(', ')}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{ws.ownerName}</td>
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
                      <button
                        type="button"
                        onClick={() => onViewPropertyDetails(ws)}
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

      {/* Short Pending Rent Preview */}
      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <h2 className="typo-section-heading text-slate-900">{tr('Pending Rent')}</h2>
          <button
            type="button"
            onClick={() => onNavigateSection('admin-payments')}
            className="typo-btn font-semibold text-teal-700 hover:underline"
          >
            {tr(`View All (${data.pendingDues.length}) →`)}
          </button>
        </div>
        {topDues.length === 0 ? (
          <div className="p-6 text-center typo-body text-slate-500">
            {tr('No pending rent dues right now.')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left typo-table-td">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 typo-table-th">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">{tr('Tenant')}</th>
                  <th className="px-4 py-2.5 font-semibold">{tr('PG Property')}</th>
                  <th className="px-4 py-2.5 font-semibold">{tr('Due Date')}</th>
                  <th className="px-4 py-2.5 font-semibold text-right">{tr('Pending Amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topDues.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {d.guestName}{' '}
                      <span className="typo-helper text-slate-500">({tr(d.roomLabel)})</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{d.tenantName}</td>
                    <td className="px-4 py-3">
                      <span className={d.isOverdue ? 'font-semibold text-red-700' : 'text-slate-700'}>
                        {formatDateShort(d.dueDate)}
                        {d.isOverdue ? ` (${tr('Overdue')})` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-red-700">
                      {formatInr(d.outstandingAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
