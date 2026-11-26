import { useState } from 'react';
import {
  AlertTriangle,
  BedDouble,
  CalendarClock,
  IndianRupee,
  MessageSquare,
  Plus,
  ReceiptIndianRupee,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import type { DashboardPayload } from '../lib/api';
import {
  daysUntilYmd,
  EXPENSE_CATEGORY_LABELS,
  formatDateShort,
  formatInr,
} from '../lib/format';
import { t, type NavKey } from '../lib/i18n';
import { useLanguage } from '../lib/LanguageContext';
import type {
  EnrichedPayment,
  EnrichedStay,
  PaginationMeta,
  PreferredLanguage,
} from '../types/domain';
import { Pagination } from './Pagination';
import {
  BedStatusIndicator,
  PaymentStatusIndicator,
  StayStatusIndicator,
} from './StatusLabel';

const LIST_PAGE_SIZE = 5;
const ROOM_PAGE_SIZE = 4;

function paginateSlice<T>(
  items: T[],
  requestedPage: number,
  pageSize: number
): { rows: T[]; pagination: PaginationMeta } {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (page - 1) * pageSize;
  return {
    rows: items.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
    },
  };
}

interface DashboardViewProps {
  data: DashboardPayload | null;
  loading: boolean;
  error: string | null;
  uiLanguage: PreferredLanguage;
  period: string;
  customFrom: string;
  customTo: string;
  onPeriodChange: (period: string, from?: string, to?: string) => void;
  onRetry: () => void;
  onAddGuest: () => void;
  onCheckIn: () => void;
  onRecordPayment: (payment?: EnrichedPayment) => void;
  onAddRoom: () => void;
  onOpenGuest: (guestId: string) => void;
  onCheckoutStay: (stay: EnrichedStay) => void;
  onSendSmsReminder: (payment: EnrichedPayment) => void;
  onNavigateTab: (tab: NavKey) => void;
  smsBusyId: string | null;
}

export function DashboardView({
  data,
  loading,
  error,
  uiLanguage,
  period,
  customFrom,
  customTo,
  onPeriodChange,
  onRetry,
  onAddGuest,
  onCheckIn,
  onRecordPayment,
  onAddRoom,
  onOpenGuest,
  onCheckoutStay,
  onSendSmsReminder,
  onNavigateTab,
  smsBusyId,
}: DashboardViewProps) {
  const { tr } = useLanguage();
  const [activityTab, setActivityTab] = useState<'checkins' | 'checkouts' | 'payments' | 'expenses'>('checkins');
  const [activityPage, setActivityPage] = useState(1);
  const [checkoutPage, setCheckoutPage] = useState(1);
  const [unpaidPage, setUnpaidPage] = useState(1);
  const [roomPage, setRoomPage] = useState(1);

  if (loading && !data) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-white p-4" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="h-72 animate-pulse rounded-lg border border-slate-200 bg-white lg:col-span-2" />
          <div className="h-72 animate-pulse rounded-lg border border-slate-200 bg-white" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-6 text-center">
        <p className="typo-body font-medium text-red-800">{tr(error)}</p>
        <button
          type="button"
          onClick={onRetry}
          className="typo-btn mt-3 min-h-10 rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
        >
          {tr('Retry Loading Dashboard')}
        </button>
      </div>
    );
  }

  if (!data) return null;

  const {
    summary,
    recentCheckIns,
    recentCheckouts,
    recentPayments,
    recentExpenses,
    upcomingCheckouts,
    overdueStays,
    unpaidList,
    rooms,
    beds,
  } = data;

  const combinedStayWatch = [
    ...overdueStays,
    ...upcomingCheckouts.filter((u) => !overdueStays.some((o) => o.id === u.id)),
  ];

  const checkinsPaged = paginateSlice(recentCheckIns, activityPage, LIST_PAGE_SIZE);
  const checkoutsHistPaged = paginateSlice(recentCheckouts, activityPage, LIST_PAGE_SIZE);
  const recPayPaged = paginateSlice(recentPayments, activityPage, LIST_PAGE_SIZE);
  const recExpPaged = paginateSlice(recentExpenses, activityPage, LIST_PAGE_SIZE);

  const watchPaged = paginateSlice(combinedStayWatch, checkoutPage, LIST_PAGE_SIZE);
  const unpaidPaged = paginateSlice(unpaidList, unpaidPage, LIST_PAGE_SIZE);
  const roomsPaged = paginateSlice(rooms, roomPage, ROOM_PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header & Quick Actions */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="typo-dashboard-title text-slate-900">
            {t(uiLanguage, 'dash.title')}
          </h1>
          <p className="typo-body mt-0.5 text-slate-600">{t(uiLanguage, 'dash.subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAddGuest}
            className="typo-btn inline-flex min-h-10 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <UserPlus className="h-4 w-4 text-slate-600" aria-hidden="true" />
            <span>{t(uiLanguage, 'action.addGuest')}</span>
          </button>
          <button
            type="button"
            onClick={onCheckIn}
            className="typo-btn inline-flex min-h-10 items-center gap-1.5 rounded-md bg-teal-700 px-3.5 py-2 text-white hover:bg-teal-800 whitespace-nowrap"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            <span>{t(uiLanguage, 'action.checkIn')}</span>
          </button>
          <button
            type="button"
            onClick={() => onRecordPayment()}
            className="typo-btn inline-flex min-h-10 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <IndianRupee className="h-4 w-4 text-slate-600" aria-hidden="true" />
            <span>{t(uiLanguage, 'action.recordPayment')}</span>
          </button>
          <button
            type="button"
            onClick={onAddRoom}
            className="typo-btn inline-flex min-h-10 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <Plus className="h-4 w-4 text-slate-600" aria-hidden="true" />
            <span>{t(uiLanguage, 'action.addRoom')}</span>
          </button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              { id: 'month', label: 'This Month' },
              { id: '30d', label: 'Last 30 Days' },
              { id: 'all', label: 'All Time' },
              { id: 'custom', label: 'Custom Range' },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPeriodChange(p.id, customFrom, customTo)}
              className={`typo-btn rounded px-3 py-1.5 transition-colors whitespace-nowrap ${
                period === p.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {tr(p.label)}
            </button>
          ))}
        </div>

        {period === 'custom' ? (
          <div className="typo-helper flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={customFrom}
              aria-label={tr('From date')}
              onChange={(e) => onPeriodChange('custom', e.target.value, customTo)}
              className="typo-input rounded border border-slate-300 px-2 py-1 font-mono"
            />
            <span className="text-slate-400">{tr('to')}</span>
            <input
              type="date"
              value={customTo}
              aria-label={tr('To date')}
              onChange={(e) => onPeriodChange('custom', customFrom, e.target.value)}
              className="typo-input rounded border border-slate-300 px-2 py-1 font-mono"
            />
          </div>
        ) : (
          <p className="typo-helper text-slate-500 font-mono tabular-nums">
            {tr('Period:')} {formatDateShort(data.period.from)} – {formatDateShort(data.period.to)}
          </p>
        )}
      </div>

      {/* 8 Live Calculated KPI Cards */}
      <section aria-label={tr('Key metrics')} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="typo-card-title font-semibold flex items-center justify-between text-slate-600">
            <span>{t(uiLanguage, 'kpi.currentResidents')}</span>
            <Users className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {summary.totalGuestsStaying}
          </p>
          <p className="typo-helper mt-1 text-slate-500">{tr('Active & overdue stays')}</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="typo-card-title font-semibold flex items-center justify-between text-slate-600">
            <span>{t(uiLanguage, 'kpi.bedsOccupied')}</span>
            <BedDouble className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {summary.occupiedBeds}
            <span className="text-base font-normal text-slate-400"> / {summary.totalBeds}</span>
            <span className="typo-body ml-2 font-semibold text-teal-800">
              ({summary.occupancyPercent}%)
            </span>
          </p>
          <p className="typo-helper mt-1 text-slate-600 tabular-nums">
            {tr(`${summary.vacantBeds} available · ${summary.maintenanceBeds} maintenance`)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="typo-card-title font-semibold flex items-center justify-between text-slate-600">
            <span>{t(uiLanguage, 'kpi.collectedPeriod')}</span>
            <IndianRupee className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {formatInr(summary.collectedInPeriod)}
          </p>
          <p className="typo-helper mt-1 text-slate-500">{tr('Rent & stay receipts')}</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="typo-card-title font-semibold flex items-center justify-between text-slate-600">
            <span>{t(uiLanguage, 'kpi.depositsHeld')}</span>
            <ShieldCheck className="h-4 w-4 text-teal-700 shrink-0" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-teal-800 tabular-nums">
            {formatInr(summary.depositsHeldAmount)}
          </p>
          <p className="typo-helper mt-1 text-slate-500">{tr('Refundable balance held')}</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="typo-card-title font-semibold flex items-center justify-between text-slate-600">
            <span>{t(uiLanguage, 'kpi.unpaidCharges')}</span>
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-red-700 tabular-nums">
            {formatInr(summary.unpaidTotalAmount)}
          </p>
          <p className="typo-helper mt-1 text-slate-600 tabular-nums">
            {tr(`Across ${summary.unpaidChargesCount} open charge${summary.unpaidChargesCount === 1 ? '' : 's'}`)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="typo-card-title font-semibold flex items-center justify-between text-slate-600">
            <span>{t(uiLanguage, 'kpi.upcomingCheckouts')}</span>
            <CalendarClock className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {summary.upcomingCheckoutsCount}
          </p>
          <p className="typo-helper mt-1 text-slate-500">{tr('Scheduled within 7 days')}</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="typo-card-title font-semibold flex items-center justify-between text-slate-600">
            <span>{t(uiLanguage, 'kpi.overdueStays')}</span>
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-red-700 tabular-nums">
            {summary.overdueStaysCount}
          </p>
          <p className="typo-helper mt-1 text-slate-500">{tr('Past expected checkout')}</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="typo-card-title font-semibold flex items-center justify-between text-slate-600">
            <span>{t(uiLanguage, 'kpi.expensesPeriod')}</span>
            <ReceiptIndianRupee className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {formatInr(summary.expensesInPeriod)}
          </p>
          <p className="typo-helper mt-1 text-slate-500">{tr('EB, maintenance & mess')}</p>
        </div>
      </section>

      {/* Main Split: Recent Activity Tabs + Upcoming & Overdue Checkouts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
              {(
                [
                  { id: 'checkins', label: 'Recent Check-ins' },
                  { id: 'checkouts', label: 'Checkouts' },
                  { id: 'payments', label: 'Payments' },
                  { id: 'expenses', label: 'Expenses' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActivityTab(item.id);
                    setActivityPage(1);
                  }}
                  className={`typo-btn rounded px-2.5 py-1 whitespace-nowrap ${
                    activityTab === item.id
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tr(item.label)}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                onNavigateTab(
                  activityTab === 'payments'
                    ? 'payments'
                    : activityTab === 'expenses'
                      ? 'expenses'
                      : 'stays'
                )
              }
              className="typo-btn text-teal-700 hover:underline whitespace-nowrap"
            >
              {tr('Open full list')}
            </button>
          </div>

          {activityTab === 'checkins' && (
            <>
              <div className="flex-1 overflow-x-auto">
                <table className="typo-table-td w-full text-left">
                  <thead className="typo-table-th border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-5 py-2.5">{tr('Resident')}</th>
                      <th className="px-4 py-2.5">{tr('Room / Bed')}</th>
                      <th className="px-4 py-2.5">{tr('Check-in')}</th>
                      <th className="px-4 py-2.5">{tr('Status')}</th>
                      <th className="px-5 py-2.5 text-right">{tr('Due')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {checkinsPaged.rows.map((stay) => (
                      <tr key={stay.id} className="hover:bg-slate-50/80">
                        <td className="px-5 py-3">
                          <button
                            type="button"
                            onClick={() => onOpenGuest(stay.guestId)}
                            className="typo-body font-medium text-slate-900 hover:text-teal-700 hover:underline text-left"
                          >
                            {stay.guestName}
                          </button>
                          <p className="typo-helper font-mono text-slate-500">{stay.guestPhone}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap">
                          {tr('Room')} {stay.roomNumber} · {stay.bedLabel}
                        </td>
                        <td className="px-4 py-3 text-slate-600 tabular-nums whitespace-nowrap">
                          {formatDateShort(stay.checkInAt)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <StayStatusIndicator status={stay.status} />
                        </td>
                        <td className="px-5 py-3 text-right whitespace-nowrap">
                          {stay.balanceDue > 0 ? (
                            <span className="font-mono font-medium text-red-700 tabular-nums">
                              {formatInr(stay.balanceDue)}
                            </span>
                          ) : (
                            <PaymentStatusIndicator status="paid" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                compact
                pagination={checkinsPaged.pagination}
                onPageChange={setActivityPage}
                itemLabel={tr('check-ins')}
              />
            </>
          )}

          {activityTab === 'checkouts' && (
            <>
              <div className="flex-1 overflow-x-auto">
                {checkoutsHistPaged.rows.length === 0 ? (
                  <p className="typo-body p-6 text-center text-slate-500">{tr('No recent checkouts.')}</p>
                ) : (
                  <table className="typo-table-td w-full text-left">
                    <thead className="typo-table-th border-b border-slate-200 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-5 py-2.5">{tr('Resident')}</th>
                        <th className="px-4 py-2.5">{tr('Room / Bed')}</th>
                        <th className="px-4 py-2.5">{tr('Checked Out')}</th>
                        <th className="px-5 py-2.5 text-right">{tr('Stay Fee')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {checkoutsHistPaged.rows.map((stay) => (
                        <tr key={stay.id} className="hover:bg-slate-50/80">
                          <td className="px-5 py-3">
                            <button
                              type="button"
                              onClick={() => onOpenGuest(stay.guestId)}
                              className="typo-body font-medium text-slate-900 hover:underline text-left"
                            >
                              {stay.guestName}
                            </button>
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-700">
                            {tr('Room')} {stay.roomNumber} · {stay.bedLabel}
                          </td>
                          <td className="px-4 py-3 text-slate-600 tabular-nums">
                            {formatDateShort(stay.actualCheckoutAt)}
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-slate-900 tabular-nums">
                            {formatInr(stay.agreedAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <Pagination
                compact
                pagination={checkoutsHistPaged.pagination}
                onPageChange={setActivityPage}
                itemLabel={tr('checkouts')}
              />
            </>
          )}

          {activityTab === 'payments' && (
            <>
              <div className="flex-1 overflow-x-auto">
                <table className="typo-table-td w-full text-left">
                  <thead className="typo-table-th border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-5 py-2.5">{tr('Guest')}</th>
                      <th className="px-4 py-2.5">{tr('Description')}</th>
                      <th className="px-4 py-2.5">{tr('Date')}</th>
                      <th className="px-4 py-2.5 text-right">{tr('Collected')}</th>
                      <th className="px-5 py-2.5">{tr('Status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recPayPaged.rows.map((pay) => (
                      <tr key={pay.id} className="hover:bg-slate-50/80">
                        <td className="px-5 py-3 font-medium text-slate-900">{pay.guestName}</td>
                        <td className="px-4 py-3 text-slate-600">{tr(pay.description)}</td>
                        <td className="px-4 py-3 text-slate-600 tabular-nums">
                          {formatDateShort(pay.paymentDate || pay.dueDate)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                          {formatInr(pay.paidAmount)}
                        </td>
                        <td className="px-5 py-3">
                          <PaymentStatusIndicator status={pay.status} isOverdue={pay.isOverdue} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                compact
                pagination={recPayPaged.pagination}
                onPageChange={setActivityPage}
                itemLabel={tr('payments')}
              />
            </>
          )}

          {activityTab === 'expenses' && (
            <>
              <div className="flex-1 overflow-x-auto">
                <table className="typo-table-td w-full text-left">
                  <thead className="typo-table-th border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-5 py-2.5">{tr('Date')}</th>
                      <th className="px-4 py-2.5">{tr('Category')}</th>
                      <th className="px-4 py-2.5">{tr('Vendor / Note')}</th>
                      <th className="px-5 py-2.5 text-right">{tr('Amount')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recExpPaged.rows.map((exp) => (
                      <tr key={exp.id} className="hover:bg-slate-50/80">
                        <td className="px-5 py-3 text-slate-600 tabular-nums">
                          {formatDateShort(exp.expenseDate)}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {tr(EXPENSE_CATEGORY_LABELS[exp.category])}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {exp.vendorName} {exp.note ? `· ${exp.note}` : ''}
                        </td>
                        <td className="px-5 py-3 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {formatInr(exp.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                compact
                pagination={recExpPaged.pagination}
                onPageChange={setActivityPage}
                itemLabel={tr('expenses')}
              />
            </>
          )}
        </section>

        {/* Upcoming & Overdue Checkouts */}
        <section className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <div>
              <h2 className="typo-section-heading text-slate-900">
                {tr('Upcoming & Overdue Checkouts')}
              </h2>
              <p className="typo-helper text-slate-500">{tr('Departures due soon or past due')}</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('stays')}
              className="typo-btn text-teal-700 hover:underline whitespace-nowrap"
            >
              {tr('All stays')}
            </button>
          </div>

          {combinedStayWatch.length === 0 ? (
            <div className="typo-body p-6 text-center text-slate-500">
              {tr('No overdue or upcoming checkouts in the next 7 days.')}
            </div>
          ) : (
            <>
              <ul className="flex-1 divide-y divide-slate-100">
                {watchPaged.rows.map((stay) => {
                  const daysLeft = daysUntilYmd(stay.expectedCheckoutDate);
                  return (
                    <li key={stay.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onOpenGuest(stay.guestId)}
                          className="typo-body truncate font-medium text-slate-900 hover:text-teal-700 hover:underline block text-left"
                        >
                          {stay.guestName}
                        </button>
                        <p className="typo-helper mt-0.5 text-slate-500 tabular-nums">
                          {tr('Room')} {stay.roomNumber}-{stay.bedLabel} ·{' '}
                          <span className={daysLeft < 0 ? 'font-semibold text-red-700' : daysLeft <= 1 ? 'font-medium text-amber-700' : ''}>
                            {daysLeft < 0
                              ? tr(`${Math.abs(daysLeft)}d overdue`)
                              : daysLeft === 0
                                ? tr('Due today')
                                : tr(`In ${daysLeft}d (${formatDateShort(stay.expectedCheckoutDate)})`)}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onCheckoutStay(stay)}
                        className="typo-btn shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        {tr('Check Out')}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <Pagination
                compact
                pagination={watchPaged.pagination}
                onPageChange={setCheckoutPage}
                itemLabel={tr('checkouts')}
              />
            </>
          )}
        </section>
      </div>

      {/* Bottom Row: Unpaid Charges + Room Occupancy Overview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <div>
              <h2 className="typo-section-heading text-slate-900">{tr('Unpaid & Partial Charges')}</h2>
              <p className="typo-helper text-slate-500">{tr('Open dues with quick collect and reminder triggers')}</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('payments')}
              className="typo-btn text-teal-700 hover:underline whitespace-nowrap"
            >
              {tr('Open ledger')}
            </button>
          </div>

          {unpaidList.length === 0 ? (
            <div className="typo-body p-6 text-center text-slate-500">
              {tr('All stay charges are currently settled.')}
            </div>
          ) : (
            <>
              <ul className="flex-1 divide-y divide-slate-100">
                {unpaidPaged.rows.map((pay) => (
                  <li
                    key={pay.id}
                    className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => onOpenGuest(pay.guestId)}
                          className="typo-body truncate font-medium text-slate-900 hover:text-teal-700 hover:underline"
                        >
                          {pay.guestName}
                        </button>
                        <PaymentStatusIndicator status={pay.status} isOverdue={pay.isOverdue} />
                      </div>
                      <p className="typo-helper mt-0.5 text-slate-500 tabular-nums">
                        {tr('Room')} {pay.roomNumber}-{pay.bedLabel} · {tr('Due')} {formatDateShort(pay.dueDate)} ·{' '}
                        <span className="font-mono font-semibold text-slate-800">
                          {formatInr(pay.outstandingAmount)} {tr('bal')}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSendSmsReminder(pay)}
                        disabled={smsBusyId === pay.id}
                        className="typo-btn inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                      >
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{smsBusyId === pay.id ? tr('Sending...') : tr('Remind')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRecordPayment(pay)}
                        className="typo-btn rounded-md bg-teal-700 px-3 py-1.5 text-white hover:bg-teal-800 whitespace-nowrap"
                      >
                        {tr('Collect')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination
                compact
                pagination={unpaidPaged.pagination}
                onPageChange={setUnpaidPage}
                itemLabel={tr('dues')}
              />
            </>
          )}
        </section>

        <section className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
            <div>
              <h2 className="typo-section-heading text-slate-900">{tr('Room Occupancy Overview')}</h2>
              <p className="typo-helper text-slate-500">{tr('Live bed status across rooms')}</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('rooms')}
              className="typo-btn text-teal-700 hover:underline whitespace-nowrap"
            >
              {tr('Manage rooms')}
            </button>
          </div>

          {rooms.length === 0 ? (
            <div className="p-6 text-center">
              <p className="typo-body text-slate-500">{tr('No rooms configured yet.')}</p>
              <button
                type="button"
                onClick={onAddRoom}
                className="typo-btn mt-3 min-h-10 rounded-md bg-teal-700 px-4 py-2 text-white"
              >
                {tr('Add First Room')}
              </button>
            </div>
          ) : (
            <>
              <div className="flex-1 grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 content-start">
                {roomsPaged.rows.map((room) => {
                  const roomBeds = beds.filter((b) => b.roomId === room.id);
                  const occCount = roomBeds.filter((b) => b.status === 'occupied').length;
                  return (
                    <div
                      key={room.id}
                      className="rounded-md border border-slate-200 bg-slate-50/60 p-3.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="typo-card-title font-mono font-semibold text-slate-900">
                          {tr('Room')} {room.roomNumber}
                        </span>
                        <span className="typo-helper text-slate-500 tabular-nums">
                          {tr(`${occCount}/${roomBeds.length} occupied`)}
                        </span>
                      </div>
                      <p className="typo-helper mt-0.5 text-slate-500">
                        {tr(room.floor)} · {tr(room.roomType)}
                      </p>
                      <div className="mt-2.5 space-y-1.5 border-t border-slate-200/80 pt-2">
                        {roomBeds.map((bed) => (
                          <div key={bed.id} className="typo-helper flex items-center justify-between">
                            <span className="text-slate-700 truncate pr-2">
                              <span className="font-mono font-medium">{tr('Bed')} {bed.bedLabel}</span>
                              {bed.occupantGuestName ? ` · ${bed.occupantGuestName}` : ''}
                            </span>
                            <BedStatusIndicator status={bed.status} />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <Pagination
                compact
                pagination={roomsPaged.pagination}
                onPageChange={setRoomPage}
                itemLabel={tr('rooms')}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
