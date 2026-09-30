import type { SupabaseClient } from '@supabase/supabase-js';
import { sendSMS } from '@/lib/sms/clicksend-service';

export const AU_MOBILE = /^\+614\d{8}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toAuMobile(raw?: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, '');
  const e =
    d.length === 11 && d.startsWith('614') ? `+${d}` :
    d.length === 10 && d.startsWith('04') ? `+61${d.slice(1)}` :
    d.length === 9 && d.startsWith('4') ? `+61${d}` : null;
  return e && AU_MOBILE.test(e) ? e : null;
}

export type SkipReason =
  | 'not_found' | 'invalid_number' | 'opted_out' | 'held' | 'no_optout_token' | 'send_failed';

export type Recipient =
  | { ok: true; customerId: string; to: string; token: string }
  | { ok: false; reason: SkipReason };

// Looks up the customer by customers.id OR customers.user_id (imported clients have id = user_id),
// then applies every send rule. The single source of truth for "can we text this person?"
export async function resolveRecipient(supabase: SupabaseClient, key: string): Promise<Recipient> {
  if (!UUID.test(key)) return { ok: false, reason: 'not_found' };

  let q = supabase.from('customers')
    .select('id, phone, sms_opt_out, sms_hold, sms_optout_token')
    .or(`id.eq.${key},user_id.eq.${key}`);
  const businessId = process.env.ALKAMI_BUSINESS_ID;
  if (businessId) q = q.eq('business_id', businessId);

  const { data: c } = await q.limit(1).maybeSingle();
  if (!c) return { ok: false, reason: 'not_found' };
  if (c.sms_opt_out) return { ok: false, reason: 'opted_out' };
  if (c.sms_hold) return { ok: false, reason: 'held' };

  const to = toAuMobile(c.phone);
  if (!to) return { ok: false, reason: 'invalid_number' };

  const { data: sup } = await supabase.from('sms_suppression').select('phone').eq('phone', to).maybeSingle();
  if (sup) return { ok: false, reason: 'opted_out' };

  if (!c.sms_optout_token) return { ok: false, reason: 'no_optout_token' };
  return { ok: true, customerId: c.id, to, token: c.sms_optout_token };
}

// Adds the mandatory opt-out line. Returns null if SMS_OPTOUT_BASE_URL is not configured.
export function appendOptOut(message: string, token: string): string | null {
  const base = process.env.SMS_OPTOUT_BASE_URL?.replace(/\/+$/, '');
  if (!base) return null;
  const host = base.replace(/^https?:\/\//, '');
  return `${message.trimEnd()}\nOpt out: ${host}/o/${token}`;
}

// Used by cron / campaign routes.
export async function sendGuardedSMS(
  supabase: SupabaseClient,
  opts: { customerId: string; message: string }
): Promise<{ sent: true } | { sent: false; reason: SkipReason; detail?: string }> {
  const r = await resolveRecipient(supabase, opts.customerId);
  if (!r.ok) return { sent: false, reason: r.reason };

  const body = appendOptOut(opts.message, r.token);
  if (!body) return { sent: false, reason: 'send_failed', detail: 'SMS_OPTOUT_BASE_URL not set' };

  try {
    const res: any = await sendSMS({ to: r.to, message: body });
    if (res?.success === false) return { sent: false, reason: 'send_failed', detail: String(res.error ?? '') };
    return { sent: true };
  } catch (e: any) {
    return { sent: false, reason: 'send_failed', detail: e.message };
  }
}

export async function resolveRecipientByPhone(supabase: SupabaseClient, phoneRaw: string): Promise<Recipient> {
  const to = toAuMobile(phoneRaw);
  if (!to) return { ok: false, reason: 'invalid_number' };

  const variants = [to, `0${to.slice(3)}`, to.slice(1)];
  let q = supabase.from('customers')
    .select('id, sms_opt_out, sms_hold, sms_optout_token')
    .in('phone', variants);
  const businessId = process.env.ALKAMI_BUSINESS_ID;
  if (businessId) q = q.eq('business_id', businessId);

  const { data } = await q.limit(10);
  if (!data || data.length === 0) return { ok: false, reason: 'not_found' };
  if (data.some((c: any) => c.sms_opt_out)) return { ok: false, reason: 'opted_out' };
  if (data.some((c: any) => c.sms_hold)) return { ok: false, reason: 'held' };

  const { data: sup } = await supabase.from('sms_suppression').select('phone').eq('phone', to).maybeSingle();
  if (sup) return { ok: false, reason: 'opted_out' };

  const c: any = data.find((x: any) => x.sms_optout_token);
  if (!c) return { ok: false, reason: 'no_optout_token' };
  return { ok: true, customerId: c.id, to, token: c.sms_optout_token };
}