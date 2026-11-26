import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '../lib/api';
import { downloadCsv } from '../lib/csv';
import {
  DEPOSIT_STATUS_LABELS,
  EXPENSE_CATEGORY_LABELS,
  formatDateShort,
  formatInr,
  STAY_STATUS_LABELS,
} from '../lib/format';
import { useLanguage } from '../lib/LanguageContext';
import type { ReportsPayload } from '../types/domain';

interface ReportsViewProps {
  refreshKey: number;
}

export function ReportsView({ refreshKey }: ReportsViewProps) {
  const { tr } = useLanguage();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<ReportsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api
      .getReports({ from, to }, controller.signal)
      .then((res) => setReport(res))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? tr(err.message) : tr('Failed to load reports.'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [from, to, refreshKey]);

  useEffect(() => {
    return loadReports();
  }, [loadReports]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="typo-page-title text-slate-900">
            {tr('Operational & Financial Reports')}
          </h1>
          <p className="mt-0.5 typo-body text-slate-600">
            {tr('Live occupancy, residents, rent collections, security deposits, category expenses, and monthly cash flow with CSV exports.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
          <span className="typo-label text-slate-600">{tr('Period:')}</span>
          <input
            type="date"
            value={from}
            aria-label={tr('Report start date')}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 typo-input font-mono"
          />
          <span className="typo-helper text-slate-400">{tr('to')}</span>
          <input
            type="date"
            value={to}
            aria-label={tr('Report end date')}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1 typo-input font-mono"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 typo-body text-red-900">
          {tr(error)}
        </div>
      )}

      {loading && !report ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center typo-body text-slate-500">
          {tr('Generating reports...')}
        </div>
      ) : report ? (
        <div className="space-y-6">
          {/* 1. Occupancy Summary */}
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
              <div>
                <h2 className="typo-section-heading text-slate-900">{tr('1. Occupancy Summary')}</h2>
                <p className="typo-helper text-slate-500 tabular-nums">
                  {report.occupancySummary.totalRooms} {tr('rooms')} · {report.occupancySummary.occupiedBeds}/
                  {report.occupancySummary.totalBeds} {tr('beds occupied')} ({report.occupancySummary.occupancyPercent}%) ·{' '}
                  {report.occupancySummary.vacantBeds} {tr('vacant')} · {report.occupancySummary.maintenanceBeds} {tr('maintenance')}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    `occupancy-summary-${report.to}.csv`,
                    [
                      tr('Room'),
                      tr('Floor'),
                      tr('Type'),
                      tr('Capacity'),
                      tr('Occupied'),
                      tr('Vacant'),
                      tr('Maintenance'),
                      tr('Monthly Tariff'),
                    ],
                    report.occupancySummary.byRoom.map((r) => [
                      r.roomNumber,
                      r.floor,
                      r.roomType,
                      r.capacity,
                      r.occupied,
                      r.vacant,
                      r.maintenance,
                      r.monthlyTariff,
                    ])
                  )
                }
                className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tr('Export CSV')}</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left typo-table-td">
                <thead className="border-b border-slate-200 bg-slate-50 typo-table-th text-slate-600">
                  <tr>
                    <th className="px-5 py-2.5">{tr('Room')}</th>
                    <th className="px-4 py-2.5">{tr('Floor & Type')}</th>
                    <th className="px-4 py-2.5 text-right">{tr('Capacity')}</th>
                    <th className="px-4 py-2.5 text-right">{tr('Occupied')}</th>
                    <th className="px-4 py-2.5 text-right">{tr('Vacant')}</th>
                    <th className="px-4 py-2.5 text-right">{tr('Maint.')}</th>
                    <th className="px-5 py-2.5 text-right">{tr('Tariff')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.occupancySummary.byRoom.map((r) => (
                    <tr key={r.roomNumber}>
                      <td className="px-5 py-2.5 font-mono font-semibold text-slate-900">
                        {tr('Room')} {r.roomNumber}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {r.floor} · {tr(r.roomType)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.capacity}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-teal-800">{r.occupied}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.vacant}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-700">{r.maintenance}</td>
                      <td className="px-5 py-2.5 text-right font-mono tabular-nums">{formatInr(r.monthlyTariff)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 2. Current Residents & Checkouts */}
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
              <div>
                <h2 className="typo-section-heading text-slate-900">{tr('2. Current Residents & Checkouts')}</h2>
                <p className="typo-helper text-slate-500 tabular-nums">
                  {report.residentsAndCheckouts.currentResidentsCount} {tr('active residents')} ·{' '}
                  {report.residentsAndCheckouts.upcomingCheckoutsCount} {tr('upcoming checkouts')} ·{' '}
                  {report.residentsAndCheckouts.overdueStaysCount} {tr('overdue stays')}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    `residents-checkouts-${report.to}.csv`,
                    [
                      tr('Guest'),
                      tr('Phone'),
                      tr('Room/Bed'),
                      tr('Status'),
                      tr('Check-In'),
                      tr('Expected Checkout'),
                      tr('Balance Due'),
                    ],
                    report.residentsAndCheckouts.rows.map((r) => [
                      r.guestName,
                      r.guestPhone,
                      r.roomLabel,
                      tr(STAY_STATUS_LABELS[r.status]),
                      r.checkInAt.slice(0, 10),
                      r.expectedCheckoutDate,
                      r.balanceDue,
                    ])
                  )
                }
                className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{tr('Export CSV')}</span>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left typo-table-td">
                <thead className="border-b border-slate-200 bg-slate-50 typo-table-th text-slate-600">
                  <tr>
                    <th className="px-5 py-2.5">{tr('Resident')}</th>
                    <th className="px-4 py-2.5">{tr('Room / Bed')}</th>
                    <th className="px-4 py-2.5">{tr('Status')}</th>
                    <th className="px-4 py-2.5">{tr('Check-in')}</th>
                    <th className="px-4 py-2.5">{tr('Expected Checkout')}</th>
                    <th className="px-5 py-2.5 text-right">{tr('Balance Due')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.residentsAndCheckouts.rows.map((r) => (
                    <tr key={r.stayId}>
                      <td className="px-5 py-2.5 font-medium text-slate-900">
                        {r.guestName} <span className="font-mono typo-helper text-slate-500">({r.guestPhone})</span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-slate-700">{r.roomLabel}</td>
                      <td className="px-4 py-2.5">{tr(STAY_STATUS_LABELS[r.status])}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatDateShort(r.checkInAt)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{formatDateShort(r.expectedCheckoutDate)}</td>
                      <td className="px-5 py-2.5 text-right font-mono tabular-nums font-semibold text-red-700">
                        {r.balanceDue > 0 ? formatInr(r.balanceDue) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* 3 & 4. Collections & Outstanding + Deposits Summary */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
                <div>
                  <h2 className="typo-section-heading text-slate-900">{tr('3. Rent Collections & Outstanding')}</h2>
                  <p className="typo-helper text-slate-500 tabular-nums">
                    {tr('Collected')}: {formatInr(report.collectionsAndOutstanding.collectedTotal)} · {tr('Outstanding')}:{' '}
                    {formatInr(report.collectionsAndOutstanding.outstandingTotal)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      `outstanding-dues-${report.to}.csv`,
                      [
                        tr('Guest'),
                        tr('Room/Bed'),
                        tr('Description'),
                        tr('Due Date'),
                        tr('Total'),
                        tr('Paid'),
                        tr('Outstanding'),
                      ],
                      report.collectionsAndOutstanding.outstandingRows.map((p) => [
                        p.guestName,
                        `Room ${p.roomNumber}-${p.bedLabel}`,
                        p.description,
                        p.dueDate,
                        p.amount,
                        p.paidAmount,
                        p.outstandingAmount,
                      ])
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tr('Export CSV')}</span>
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-3 rounded-md bg-slate-50 p-3">
                  <div>
                    <p className="typo-helper text-slate-500">{tr('UPI')}</p>
                    <p className="font-mono typo-card-title font-semibold text-slate-900 tabular-nums">
                      {formatInr(report.collectionsAndOutstanding.byMode.upi || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="typo-helper text-slate-500">{tr('Cash')}</p>
                    <p className="font-mono typo-card-title font-semibold text-slate-900 tabular-nums">
                      {formatInr(report.collectionsAndOutstanding.byMode.cash || 0)}
                    </p>
                  </div>
                  <div>
                    <p className="typo-helper text-slate-500">{tr('Bank Transfer')}</p>
                    <p className="font-mono typo-card-title font-semibold text-slate-900 tabular-nums">
                      {formatInr(report.collectionsAndOutstanding.byMode.bank_transfer || 0)}
                    </p>
                  </div>
                </div>

                {report.collectionsAndOutstanding.outstandingRows.length === 0 ? (
                  <p className="typo-body text-slate-500">{tr('No open unpaid dues.')}</p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {report.collectionsAndOutstanding.outstandingRows.map((p) => (
                      <li key={p.id} className="flex items-center justify-between py-2">
                        <div>
                          <p className="typo-body font-medium text-slate-900">
                            {p.guestName} · {tr('Room')} {p.roomNumber}-{p.bedLabel}
                          </p>
                          <p className="typo-helper text-slate-500">
                            {tr('Due')} {formatDateShort(p.dueDate)}
                          </p>
                        </div>
                        <span className="font-mono typo-body font-semibold text-red-700 tabular-nums">
                          {formatInr(p.outstandingAmount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
                <div>
                  <h2 className="typo-section-heading text-slate-900">{tr('4. Deposits Held & Refunds')}</h2>
                  <p className="typo-helper text-slate-500 tabular-nums">
                    {tr('Held')}: {formatInr(report.depositsSummary.totalHeld)} · {tr('Adjusted')}:{' '}
                    {formatInr(report.depositsSummary.totalAdjusted)} · {tr('Refunded')}:{' '}
                    {formatInr(report.depositsSummary.totalRefunded)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      `deposits-ledger-${report.to}.csv`,
                      [
                        tr('Guest'),
                        tr('Room/Bed'),
                        tr('Collected Date'),
                        tr('Amount'),
                        tr('Adjusted'),
                        tr('Refunded'),
                        tr('Held'),
                        tr('Status'),
                      ],
                      report.depositsSummary.rows.map((d) => [
                        d.guestName,
                        `Room ${d.roomNumber}-${d.bedLabel}`,
                        d.collectedDate,
                        d.amount,
                        d.adjustedAmount,
                        d.refundedAmount,
                        d.remainingHeld,
                        tr(DEPOSIT_STATUS_LABELS[d.status]),
                      ])
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tr('Export CSV')}</span>
                </button>
              </div>
              <div className="divide-y divide-slate-100 px-5 py-2">
                {report.depositsSummary.rows.map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="typo-body font-medium text-slate-900">
                        {d.guestName} · {tr('Room')} {d.roomNumber}-{d.bedLabel}
                      </p>
                      <p className="typo-helper text-slate-500">
                        {tr(DEPOSIT_STATUS_LABELS[d.status])} · {tr('Collected')} {formatDateShort(d.collectedDate)}
                      </p>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <p className="typo-body font-semibold text-teal-800">
                        {formatInr(d.remainingHeld)} {tr('held')}
                      </p>
                      <p className="typo-helper text-slate-500">
                        {tr('of')} {formatInr(d.amount)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* 5 & 6. Expenses by Category + Monthly Income vs Expense */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
                <div>
                  <h2 className="typo-section-heading text-slate-900">{tr('5. Expenses by Category')}</h2>
                  <p className="typo-helper text-slate-500 tabular-nums">
                    {tr('Total in period:')} {formatInr(report.expensesByCategory.totalExpenses)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      `expenses-by-category-${report.to}.csv`,
                      [tr('Category'), tr('Entries'), tr('Total Amount')],
                      report.expensesByCategory.categories.map((c) => [
                        tr(EXPENSE_CATEGORY_LABELS[c.category]),
                        c.count,
                        c.total,
                      ])
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tr('Export CSV')}</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left typo-table-td">
                  <thead className="border-b border-slate-200 bg-slate-50 typo-table-th text-slate-600">
                    <tr>
                      <th className="px-5 py-2.5">{tr('Category')}</th>
                      <th className="px-4 py-2.5 text-right">{tr('Bills')}</th>
                      <th className="px-5 py-2.5 text-right">{tr('Total')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.expensesByCategory.categories.map((c) => (
                      <tr key={c.category}>
                        <td className="px-5 py-2.5 font-medium text-slate-900">
                          {tr(EXPENSE_CATEGORY_LABELS[c.category])}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">{c.count}</td>
                        <td className="px-5 py-2.5 text-right font-mono font-semibold tabular-nums">
                          {formatInr(c.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
                <div>
                  <h2 className="typo-section-heading text-slate-900">{tr('6. Monthly Income vs Expense')}</h2>
                  <p className="typo-helper text-slate-500">{tr('Rent receipts compared against operating expenses')}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      `monthly-income-vs-expense-${report.to}.csv`,
                      [tr('Month'), tr('Rent Income'), tr('Operating Expenses'), tr('Net')],
                      report.monthlyIncomeVsExpense.map((m) => [
                        m.month,
                        m.income,
                        m.expenses,
                        m.net,
                      ])
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1.5 typo-btn text-slate-700 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tr('Export CSV')}</span>
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left typo-table-td">
                  <thead className="border-b border-slate-200 bg-slate-50 typo-table-th text-slate-600">
                    <tr>
                      <th className="px-5 py-2.5">{tr('Month')}</th>
                      <th className="px-4 py-2.5 text-right">{tr('Rent Income')}</th>
                      <th className="px-4 py-2.5 text-right">{tr('Expenses')}</th>
                      <th className="px-5 py-2.5 text-right">{tr('Net Surplus')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {report.monthlyIncomeVsExpense.map((m) => (
                      <tr key={m.month}>
                        <td className="px-5 py-2.5 font-mono font-medium text-slate-900">{m.month}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-emerald-700 tabular-nums">
                          {formatInr(m.income)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-slate-700 tabular-nums">
                          {formatInr(m.expenses)}
                        </td>
                        <td
                          className={`px-5 py-2.5 text-right font-mono font-semibold tabular-nums ${
                            m.net >= 0 ? 'text-teal-800' : 'text-red-700'
                          }`}
                        >
                          {formatInr(m.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
