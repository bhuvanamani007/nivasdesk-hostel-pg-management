import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock,
  MinusCircle,
  RotateCcw,
  ShieldAlert,
  Wrench,
  XCircle,
} from 'lucide-react';
import type {
  BedStatus,
  DepositStatus,
  GuestStatus,
  PaymentStatus,
  ReminderStatus,
  RoomStatus,
  StayStatus,
  VerificationStatus,
} from '../types/domain';

import { useLanguage } from '../lib/LanguageContext';

export function PaymentStatusIndicator({
  status,
  isOverdue,
}: {
  status: PaymentStatus;
  isOverdue?: boolean;
}) {
  const { tr } = useLanguage();
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Paid')}</span>
      </span>
    );
  }
  if (status === 'refunded') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-slate-600">
        <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Refunded')}</span>
      </span>
    );
  }
  if (status === 'partially_paid') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-amber-700">
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr(isOverdue ? 'Partial (Overdue)' : 'Partially Paid')}</span>
      </span>
    );
  }
  if (status === 'overdue' || isOverdue) {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-red-700">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Overdue')}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-amber-700">
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{tr('Unpaid')}</span>
    </span>
  );
}

export function DepositStatusIndicator({ status }: { status: DepositStatus }) {
  const { tr } = useLanguage();
  if (status === 'held') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-teal-800">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Held')}</span>
      </span>
    );
  }
  if (status === 'partially_adjusted') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-amber-700">
        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Partially Adjusted')}</span>
      </span>
    );
  }
  if (status === 'adjusted') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-slate-700">
        <MinusCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Adjusted')}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-slate-600">
      <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{tr('Refunded')}</span>
    </span>
  );
}

export function VerificationStatusIndicator({ status }: { status: VerificationStatus }) {
  const { tr } = useLanguage();
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Verified')}</span>
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-red-700">
        <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Unreachable')}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-amber-700">
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{tr('Pending call')}</span>
    </span>
  );
}

export function RoomStatusIndicator({ status }: { status: RoomStatus }) {
  const { tr } = useLanguage();
  if (status === 'occupied') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-teal-800">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Occupied')}</span>
      </span>
    );
  }
  if (status === 'maintenance') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-amber-700">
        <Wrench className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Maintenance')}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-emerald-700">
      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{tr('Available')}</span>
    </span>
  );
}

export function BedStatusIndicator({ status }: { status: BedStatus }) {
  const { tr } = useLanguage();
  if (status === 'occupied') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-teal-800">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Occupied')}</span>
      </span>
    );
  }
  if (status === 'maintenance') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-amber-700">
        <Wrench className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Maintenance')}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-slate-600">
      <MinusCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{tr('Vacant')}</span>
    </span>
  );
}

export function StayStatusIndicator({ status }: { status: StayStatus }) {
  const { tr } = useLanguage();
  if (status === 'upcoming') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-sky-700">
        <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Upcoming')}</span>
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Active')}</span>
      </span>
    );
  }
  if (status === 'overdue') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-red-700">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Overdue')}</span>
      </span>
    );
  }
  if (status === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-slate-500">
        <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Cancelled')}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-slate-600">
      <MinusCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{tr('Checked Out')}</span>
    </span>
  );
}

export function GuestStatusIndicator({ status }: { status: GuestStatus }) {
  const { tr } = useLanguage();
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Active Resident')}</span>
      </span>
    );
  }
  if (status === 'former') {
    return (
      <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-slate-600">
        <MinusCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{tr('Former')}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-slate-500">
      <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{tr('Inactive')}</span>
    </span>
  );
}

export function ReminderStatusIndicator({ status }: { status: ReminderStatus }) {
  const { tr } = useLanguage();
  switch (status) {
    case 'sent':
      return (
        <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{tr('Sent')}</span>
        </span>
      );
    case 'mocked':
      return (
        <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-teal-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{tr('Simulated (Mock)')}</span>
        </span>
      );
    case 'scheduled':
      return (
        <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-sky-700">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{tr('Scheduled')}</span>
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-red-700">
          <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{tr('Failed')}</span>
        </span>
      );
    case 'blocked_duplicate':
      return (
        <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-amber-700">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{tr('Cooldown Blocked')}</span>
        </span>
      );
    case 'disabled':
      return (
        <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-slate-500">
          <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{tr('Provider Disabled')}</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 typo-helper font-medium text-slate-500">
          <MinusCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{tr('Cancelled')}</span>
        </span>
      );
  }
}
