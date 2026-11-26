import { useState } from 'react';
import { BedDouble, CheckCircle2, IndianRupee, Search, Users } from 'lucide-react';
import { formatInr } from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';
import { LandingSandbox } from './LandingSandbox';

interface DashboardPreviewSectionProps {
  onSelectBuy: () => void;
  isAuthenticated: boolean;
  onEnterDashboard: () => void;
}

const REVENUE_MONTHS = [
  { month: 'Jun', amount: 312000, pct: 78 },
  { month: 'Jul', amount: 328000, pct: 82 },
  { month: 'Aug', amount: 341000, pct: 86 },
  { month: 'Sep', amount: 336000, pct: 84 },
  { month: 'Oct', amount: 359000, pct: 90 },
  { month: 'Nov', amount: 374000, pct: 94, current: true },
];

const RECENT_PAYMENTS = [
  { id: 'PAY-4109', tenant: 'Arjun Nair', room: '102-A', mode: 'UPI', amount: 8500, status: 'Paid' },
  { id: 'PAY-4108', tenant: 'Vikram Menon', room: '204-A', mode: 'Bank', amount: 9000, status: 'Paid' },
  { id: 'PAY-4107', tenant: 'Karthik Reddy', room: '101-A', mode: 'Due', amount: 9500, status: 'Pending' },
  { id: 'PAY-4106', tenant: 'Saurabh Joshi', room: '102-B', mode: 'Due', amount: 8500, status: 'Pending' },
  { id: 'PAY-4105', tenant: 'Pranav Iyer', room: '201-B', mode: 'Cash', amount: 8000, status: 'Paid' },
];

const TENANT_LIST = [
  { name: 'Karthik Reddy', room: '101-A', phone: '+91 98451 22410', aadhaar: 'XXXX-XXXX-4821', rent: 9500, status: 'Pending' },
  { name: 'Arjun Nair', room: '102-A', phone: '+91 97390 11842', aadhaar: 'XXXX-XXXX-9034', rent: 8500, status: 'Paid' },
  { name: 'Saurabh Joshi', room: '102-B', phone: '+91 99802 66412', aadhaar: 'XXXX-XXXX-7715', rent: 8500, status: 'Pending' },
  { name: 'Vikram Menon', room: '204-A', phone: '+91 98801 44190', aadhaar: 'XXXX-XXXX-3109', rent: 9000, status: 'Paid' },
  { name: 'Pranav Iyer', room: '201-B', phone: '+91 96112 73014', aadhaar: 'XXXX-XXXX-6280', rent: 8000, status: 'Paid' },
];

export function DashboardPreviewSection({
  onSelectBuy,
  isAuthenticated,
  onEnterDashboard,
}: DashboardPreviewSectionProps) {
  const { tr } = useLanguage();
  const [tenantSearch, setTenantSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Paid' | 'Pending'>('all');

  const filteredTenants = TENANT_LIST.filter((t) => {
    const matchesQuery =
      !tenantSearch.trim() ||
      t.name.toLowerCase().includes(tenantSearch.trim().toLowerCase()) ||
      t.room.toLowerCase().includes(tenantSearch.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Main Dashboard Preview Frame */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3.5">
          <div>
            <p className="typo-card-title text-slate-900">
              {tr("Sri Lakshmi Men's PG · Operations Dashboard")}
            </p>
            <p className="typo-helper text-slate-500">
              {tr('Sample workspace metrics · Koramangala, Bengaluru')}
            </p>
          </div>

          {isAuthenticated && (
            <button
              type="button"
              onClick={onEnterDashboard}
              className="rounded-md bg-teal-700 px-3.5 py-1.5 typo-btn font-semibold text-white hover:bg-teal-800 transition-colors whitespace-nowrap"
            >
              {tr('Open Live Workspace →')}
            </button>
          )}
        </div>

        <div className="p-5 sm:p-6 space-y-6">
          {/* 5 Core Dashboard KPIs */}
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between typo-helper text-slate-500">
                <span>{tr('Total Beds')}</span>
                <BedDouble className="h-4 w-4 text-slate-400" aria-hidden="true" />
              </div>
              <p className="mt-2 font-mono typo-dashboard-title text-slate-900 tabular-nums">48</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between typo-helper text-slate-500">
                <span>{tr('Occupied Beds')}</span>
                <Users className="h-4 w-4 text-teal-700" aria-hidden="true" />
              </div>
              <p className="mt-2 font-mono typo-dashboard-title text-slate-900 tabular-nums">44</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between typo-helper text-slate-500">
                <span>{tr('Vacant Beds')}</span>
                <CheckCircle2 className="h-4 w-4 text-teal-700" aria-hidden="true" />
              </div>
              <p className="mt-2 font-mono typo-dashboard-title text-teal-700 tabular-nums">4</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between typo-helper text-slate-500">
                <span>{tr('Rent Collected')}</span>
                <IndianRupee className="h-4 w-4 text-teal-700" aria-hidden="true" />
              </div>
              <p className="mt-2 font-mono typo-dashboard-title text-slate-900 tabular-nums">
                {formatInr(374000)}
              </p>
            </div>

            <div className="col-span-2 sm:col-span-1 rounded-lg border border-red-200 bg-red-50/40 p-4">
              <div className="flex items-center justify-between typo-helper font-medium text-red-700">
                <span>{tr('Pending Rent')}</span>
                <IndianRupee className="h-4 w-4 text-red-700" aria-hidden="true" />
              </div>
              <p className="mt-2 font-mono typo-dashboard-title text-red-700 tabular-nums">
                {formatInr(26500)}
              </p>
            </div>
          </div>

          {/* Chart + Recent Payments */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Monthly Revenue Chart */}
            <div className="lg:col-span-5 rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <h3 className="typo-card-title text-slate-900">{tr('Monthly Revenue')}</h3>
                  <p className="typo-helper text-slate-500">{tr('6-month rent collection trend')}</p>
                </div>
                <span className="font-mono typo-helper font-semibold text-teal-700 tabular-nums">
                  +4.2% MoM
                </span>
              </div>

              <div className="mt-6 grid grid-cols-6 items-end gap-3 h-40 pt-4">
                {REVENUE_MONTHS.map((m) => (
                  <div key={m.month} className="flex h-full flex-col items-center justify-end gap-2">
                    <span className="font-mono typo-helper text-slate-500 tabular-nums">
                      ₹{(m.amount / 100000).toFixed(1)}L
                    </span>
                    <div className="w-full flex-1 flex items-end">
                      <div
                        className={`w-full rounded-t-md ${
                          m.current ? 'bg-teal-700' : 'bg-slate-800'
                        }`}
                        style={{ height: `${m.pct}%` }}
                        aria-label={`${m.month}: ${formatInr(m.amount)}`}
                      />
                    </div>
                    <span className="typo-helper font-medium text-slate-600">{tr(m.month)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Payments Table */}
            <div className="lg:col-span-7 rounded-lg border border-slate-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
                <h3 className="typo-card-title text-slate-900">{tr('Recent Payments')}</h3>
                <span className="typo-helper text-slate-500">{tr('November cycle')}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left typo-table-td">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-2.5 typo-table-th">{tr('Tenant')}</th>
                      <th className="px-4 py-2.5 typo-table-th">{tr('Room')}</th>
                      <th className="px-4 py-2.5 typo-table-th">{tr('Mode')}</th>
                      <th className="px-4 py-2.5 typo-table-th text-right">{tr('Amount')}</th>
                      <th className="px-4 py-2.5 typo-table-th text-right">{tr('Status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {RECENT_PAYMENTS.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                          {p.tenant}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                          {p.room}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{tr(p.mode)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatInr(p.amount)}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <span
                            className={`font-semibold ${
                              p.status === 'Pending' ? 'text-red-700' : 'text-teal-700'
                            }`}
                          >
                            {tr(p.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Searchable Tenant List */}
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="typo-card-title text-slate-900">{tr('Tenant List')}</h3>
                <p className="typo-helper text-slate-500">
                  {tr('Aadhaar numbers masked to last 4 digits')}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={tenantSearch}
                    onChange={(e) => setTenantSearch(e.target.value)}
                    placeholder={tr('Search tenant or room...')}
                    aria-label="Filter preview tenant list"
                    className="w-48 rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-3 typo-input text-slate-900 placeholder:text-slate-400 focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-0.5">
                  {(['all', 'Paid', 'Pending'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setStatusFilter(status)}
                      className={`rounded px-2.5 py-1 typo-btn transition-colors whitespace-nowrap ${
                        statusFilter === status
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tr(status === 'all' ? 'All' : status)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {filteredTenants.length === 0 ? (
              <div className="px-5 py-8 text-center typo-body text-slate-500">
                {tr('No tenants match your search filter.')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left typo-table-td">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-2.5 typo-table-th">{tr('Tenant Name')}</th>
                      <th className="px-4 py-2.5 typo-table-th">{tr('Room & Bed')}</th>
                      <th className="px-4 py-2.5 typo-table-th">{tr('Phone')}</th>
                      <th className="px-4 py-2.5 typo-table-th">{tr('Masked Aadhaar')}</th>
                      <th className="px-4 py-2.5 typo-table-th text-right">{tr('Monthly Rent')}</th>
                      <th className="px-4 py-2.5 typo-table-th text-right">{tr('Rent Status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredTenants.map((tenant) => (
                      <tr key={tenant.room} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-semibold text-slate-900 whitespace-nowrap">
                          {tenant.name}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-700 whitespace-nowrap">
                          {tr(`Room ${tenant.room}`)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                          {tenant.phone}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                          {tenant.aadhaar}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatInr(tenant.rent)}
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <span
                            className={`font-semibold ${
                              tenant.status === 'Pending' ? 'text-red-700' : 'text-teal-700'
                            }`}
                          >
                            {tr(tenant.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Room, Bed & Tenant Check-in Desk */}
      <LandingSandbox onSelectBuy={onSelectBuy} />
    </div>
  );
}
