import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '../../lib/api';
import { formatInr } from '../../lib/format';
import { useLanguage } from '../../lib/LanguageContext';
import type { AdminReportsPayload } from '../../types/domain';

export function AdminReportsPage() {
  const { tr } = useLanguage();
  const [data, setData] = useState<AdminReportsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminReports();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleExportCsv = () => {
    if (!data) return;
    const headers = [
      'PG Property',
      'Owner',
      'City',
      'Rooms',
      'Occupied Beds',
      'Total Beds',
      'Occupancy %',
      'Tenants',
      'Rent Collected (INR)',
      'Pending Rent (INR)',
      'Open Complaints',
    ];
    const rows = data.properties.map((p) => [
      p.tenantName,
      p.ownerName,
      p.city,
      String(p.roomsCount),
      String(p.occupiedBeds),
      String(p.totalBeds),
      `${p.occupancyPercent}%`,
      String(p.tenantsCount),
      String(p.collectedTotal),
      String(p.pendingRent),
      String(p.openComplaints),
    ]);
    const csv = [headers, ...rows]
      .map((line) => line.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pg-platform-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center typo-body text-slate-500">
        {tr('Loading reports...')}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 flex items-center justify-between typo-body text-red-900">
        <span>{tr(error || 'Could not load reports.')}</span>
        <button
          type="button"
          onClick={loadReports}
          className="rounded border border-red-300 bg-white px-3 py-1 typo-btn text-red-800 hover:bg-red-100"
        >
          {tr('Retry')}
        </button>
      </div>
    );
  }

  const s = data.summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="typo-dashboard-title text-slate-900">{tr('Reports')}</h1>
          <p className="mt-1 typo-body text-slate-600">
            {tr('Simple occupancy, rent collection, and complaints summary across all PG properties.')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 typo-btn font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4 text-teal-700" aria-hidden="true" />
          <span>{tr('Export CSV')}</span>
        </button>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="typo-card-title text-slate-600">{tr('Bed Occupancy')}</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {s.occupancyPercent}%
          </p>
          <p className="mt-1 typo-helper text-slate-500">
            {tr(`${s.occupiedBeds} of ${s.totalBeds} beds occupied`)}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="typo-card-title text-slate-600">{tr('Rent Collected')}</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {formatInr(s.collectedTotal)}
          </p>
          <p className="mt-1 typo-helper text-slate-500">{tr(`Across ${s.totalProperties} properties`)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="typo-card-title text-slate-600">{tr('Pending Rent')}</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-amber-700 tabular-nums">
            {formatInr(s.pendingRent)}
          </p>
          <p className="mt-1 typo-helper text-slate-500">{tr(`${s.totalTenants} total tenants`)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="typo-card-title text-slate-600">{tr('Open Complaints')}</p>
          <p className="mt-1.5 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {s.openComplaints}
          </p>
          <p className="mt-1 typo-helper text-slate-500">{tr(`${s.totalOwners} active owners`)}</p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3.5">
          <h2 className="typo-section-heading text-slate-900">{tr('Property-wise Summary')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left typo-table-td">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 typo-table-th">
              <tr>
                <th className="px-4 py-2.5 font-semibold">{tr('PG Property')}</th>
                <th className="px-4 py-2.5 font-semibold">{tr('Owner')}</th>
                <th className="px-4 py-2.5 font-semibold text-right">{tr('Occupancy')}</th>
                <th className="px-4 py-2.5 font-semibold text-right">{tr('Collected')}</th>
                <th className="px-4 py-2.5 font-semibold text-right">{tr('Pending Rent')}</th>
                <th className="px-4 py-2.5 font-semibold text-right">{tr('Complaints')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.properties.map((row) => (
                <tr key={row.tenantId} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{row.tenantName}</p>
                    <p className="typo-helper text-slate-500">{row.city}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.ownerName}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                    {row.occupiedBeds}/{row.totalBeds} ({row.occupancyPercent}%)
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700">
                    {formatInr(row.collectedTotal)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-700">
                    {formatInr(row.pendingRent)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                    {row.openComplaints}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
