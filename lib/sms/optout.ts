import type { SupabaseClient } from '@supabase/supabase-js';
import { toAuMobile } from '@/lib/sms/guard';

export async function applyOptOut(
  supabase: SupabaseClient, phoneRaw: string,
  source: 'link' | 'stop_reply' | 'manual', raw?: string
) {
  const phone = toAuMobile(phoneRaw) ?? phoneRaw;
  await supabase.from('sms_suppression')
    .upsert({ phone, source, raw_message: raw ?? null }, { onConflict: 'phone', ignoreDuplicates: true });
  await supabase.from('customers')
    .update({ sms_opt_out: true, sms_opt_out_at: new Date().toISOString() })
    .eq('phone', phone);
}