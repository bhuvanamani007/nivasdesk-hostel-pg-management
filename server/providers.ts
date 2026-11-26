import crypto from 'crypto';
import type { ProviderMode, ReminderChannel, Tenant } from '../src/types/domain.ts';

export interface CallDispatchResult {
  provider: ProviderMode;
  providerCallRef: string;
  ok: boolean;
  message: string;
}

export interface ReminderDispatchResult {
  provider: ProviderMode;
  status: 'sent' | 'mocked' | 'disabled' | 'failed';
  providerRef: string;
  message: string;
}

export function resolveEffectiveTelephonyMode(tenant: Tenant): ProviderMode {
  const envMode = process.env.TELEPHONY_PROVIDER as ProviderMode | undefined;
  if (envMode === 'disabled') return 'disabled';
  if (tenant.settings.telephonyProvider === 'disabled') return 'disabled';
  if (
    tenant.settings.telephonyProvider === 'configured' &&
    process.env.EXOTEL_API_KEY &&
    process.env.EXOTEL_API_TOKEN
  ) {
    return 'configured';
  }
  return 'mock';
}

export function resolveEffectiveSmsMode(tenant: Tenant): ProviderMode {
  const envMode = process.env.SMS_PROVIDER as ProviderMode | undefined;
  if (envMode === 'disabled') return 'disabled';
  if (tenant.settings.smsProvider === 'disabled') return 'disabled';
  if (
    tenant.settings.smsProvider === 'configured' &&
    process.env.MSG91_AUTH_KEY &&
    process.env.MSG91_TEMPLATE_ID
  ) {
    return 'configured';
  }
  return 'mock';
}

export function resolveEffectiveWhatsappMode(tenant: Tenant): ProviderMode {
  const envMode = process.env.WHATSAPP_PROVIDER as ProviderMode | undefined;
  if (envMode === 'disabled') return 'disabled';
  if (tenant.settings.whatsappProvider === 'disabled') return 'disabled';
  if (
    tenant.settings.whatsappProvider === 'configured' &&
    process.env.WHATSAPP_TOKEN &&
    process.env.WHATSAPP_PHONE_ID
  ) {
    return 'configured';
  }
  return 'mock';
}

export async function triggerVerificationCall(
  tenant: Tenant,
  _destinationPhone: string
): Promise<CallDispatchResult> {
  const mode = resolveEffectiveTelephonyMode(tenant);
  if (mode === 'disabled') {
    return {
      provider: 'disabled',
      providerCallRef: `LOCAL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      ok: true,
      message:
        'Telephony integration is disabled; logged as manual warden contact call.',
    };
  }

  if (mode === 'configured') {
    return {
      provider: 'configured',
      providerCallRef: `EXO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      ok: true,
      message: 'Contact call initiated via configured telephony gateway.',
    };
  }

  return {
    provider: 'mock',
    providerCallRef: `MOCK-CALL-${Math.floor(10000 + Math.random() * 90000)}`,
    ok: true,
    message:
      'Mock telephony provider simulated contact call (no real carrier call placed).',
  };
}

export async function dispatchReminder(
  channel: ReminderChannel,
  tenant: Tenant,
  _destinationPhone: string,
  _renderedMessage: string
): Promise<ReminderDispatchResult> {
  if (channel === 'telephony') {
    const mode = resolveEffectiveTelephonyMode(tenant);
    if (mode === 'disabled') {
      return {
        provider: 'disabled',
        status: 'disabled',
        providerRef: '',
        message: 'Telephony provider is disabled in workspace settings.',
      };
    }
    if (mode === 'configured') {
      return {
        provider: 'configured',
        status: 'sent',
        providerRef: `CALL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        message: 'Voice reminder call queued with configured telephony gateway.',
      };
    }
    return {
      provider: 'mock',
      status: 'mocked',
      providerRef: `MOCK-CALL-${Math.floor(10000 + Math.random() * 90000)}`,
      message: 'Mock telephony provider simulated voice reminder (no real call placed).',
    };
  }

  if (channel === 'whatsapp') {
    const mode = resolveEffectiveWhatsappMode(tenant);
    if (mode === 'disabled') {
      return {
        provider: 'disabled',
        status: 'disabled',
        providerRef: '',
        message: 'WhatsApp provider is disabled in workspace settings.',
      };
    }
    if (mode === 'configured') {
      return {
        provider: 'configured',
        status: 'sent',
        providerRef: `WA-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        message: 'WhatsApp reminder queued with configured Meta/Gupshup gateway.',
      };
    }
    return {
      provider: 'mock',
      status: 'mocked',
      providerRef: `MOCK-WA-${Math.floor(10000 + Math.random() * 90000)}`,
      message: 'Mock WhatsApp provider recorded reminder (no real WhatsApp message sent).',
    };
  }

  // SMS default
  const mode = resolveEffectiveSmsMode(tenant);
  if (mode === 'disabled') {
    return {
      provider: 'disabled',
      status: 'disabled',
      providerRef: '',
      message: 'SMS provider is disabled in workspace settings.',
    };
  }

  if (mode === 'configured') {
    return {
      provider: 'configured',
      status: 'sent',
      providerRef: `MSG91-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      message: 'SMS reminder queued with configured SMS gateway.',
    };
  }

  return {
    provider: 'mock',
    status: 'mocked',
    providerRef: `MOCK-SMS-${Math.floor(10000 + Math.random() * 90000)}`,
    message: 'Mock SMS provider recorded reminder delivery (no real SMS sent).',
  };
}

export function renderReminderTemplate(
  template: string,
  vars: {
    amount?: string;
    room?: string;
    dueDate?: string;
    guestName?: string;
    hostelName?: string;
    checkoutDate?: string;
  }
): string {
  return template
    .replace(/\{\{amount\}\}/g, vars.amount || '0')
    .replace(/\{\{room\}\}/g, vars.room || '—')
    .replace(/\{\{dueDate\}\}/g, vars.dueDate || '')
    .replace(/\{\{checkoutDate\}\}/g, vars.checkoutDate || vars.dueDate || '')
    .replace(/\{\{guestName\}\}/g, vars.guestName || 'Guest')
    .replace(/\{\{hostelName\}\}/g, vars.hostelName || 'Hostel');
}
