import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomers, type MarkovKey } from "@/lib/ai/customers";

export type OutreachConfig = {
  daily_cap: number; cooldown_days: number; booking_link: string;
  optout_reserve: number; body_max: number; copy_max: number;
};

export function outreachConfig(): OutreachConfig {
  const num = (v: string | undefined, d: number) => { const n = parseInt(v ?? "", 10); return Number.isFinite(n) && n >= 0 ? n : d; };
  const strip = (s: string) => s.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const link = strip(process.env.ALKAMI_BOOKING_URL || "getrydra.com/alkami");
  const base = strip(process.env.SMS_OPTOUT_BASE_URL || "");
  const reserve = 10 + (base.length || 35) + 3 + 10; // "\nOpt out: " + host + "/o/" + token
  const body_max = 160 - reserve;
  return { daily_cap: Math.max(1, num(process.env.SMS_DAILY_CAP, 50)), cooldown_days: num(process.env.SMS_COOLDOWN_DAYS, 7), booking_link: link, optout_reserve: reserve, body_max, copy_max: body_max - link.length - 1 };
}

export type QueueRow = {
  user_id: string; name: string; risk_segment: string; markov_state: MarkovKey;
  days_since_last_visit: number; visits: number; clv_aud: number; intervention_value_aud: number;
  last_texted_at: string | null; cooling_down: boolean; gap_ratio: number;
};
export type LogRow = { sent_at: string; name: string; phone_last4: string | null; status: string; markov_state: string | null; cost: number };
export type OutreachOverview = {
  config: OutreachConfig;
  stats: { sent_24h: number; remaining_today: number; sent_30d: number; failed_30d: number; cost_30d: number };
  daily: { date: string; sent: number; failed: number; cost: number }[];
  queue: QueueRow[];
  candidates_total: number;
  cooling_total: number;
  blocked: { held: number; opted_out: number; invalid_number: number };
  recent: LogRow[];
};

const syd = (d: Date | string) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

export async function computeOutreach(supabase: SupabaseClient, venueId: string, businessId: string): Promise<{ overview: OutreachOverview; candidates: QueueRow[] }> {
  const config = outreachConfig();
  const rows = await getCustomers(supabase, venueId, businessId);
  const now = Date.now();

  const { data, error } = await supabase
    .from("sms_outreach")
    .select("customer_id, customer_name, phone, status, cost, markov_state, sent_at")
    .eq("venue_id", venueId)
    .gte("sent_at", new Date(now - 30 * 86400_000).toISOString())
    .order("sent_at", { ascending: false })
    .limit(3000);
  if (error) throw new Error(`sms_outreach: ${error.message}`);
  const log: any[] = data ?? [];

  const isFail = (s: unknown) => String(s ?? "").toLowerCase() === "failed";
  const lastTexted = new Map<string, string>();
  const dayMap = new Map<string, { sent: number; failed: number; cost: number }>();
  for (let i = 29; i >= 0; i--) dayMap.set(syd(new Date(now - i * 86400_000)), { sent: 0, failed: 0, cost: 0 });

  let sent24 = 0, sent30 = 0, failed30 = 0, cost30 = 0;
  for (const r of log) {
    const failed = isFail(r.status);
    const t = Date.parse(r.sent_at);
    const day = dayMap.get(syd(r.sent_at));
    if (failed) { failed30++; if (day) day.failed++; continue; }
    sent30++; cost30 += Number(r.cost) || 0;
    if (t >= now - 86400_000) sent24++;
    if (day) { day.sent++; day.cost += Number(r.cost) || 0; }
    if (r.customer_id && !lastTexted.has(r.customer_id)) lastTexted.set(r.customer_id, r.sent_at);
  }

  const coolMs = config.cooldown_days * 86400_000;
  const all: QueueRow[] = rows
    .filter((c) => c.sms_status === "ok")
    .map((c) => {
      const last = lastTexted.get(c.user_id) ?? null;
      return {
        user_id: c.user_id, name: c.name, risk_segment: c.risk_segment, markov_state: c.markov_state,
        days_since_last_visit: c.days_since_last_visit, visits: c.visits, clv_aud: c.clv_aud,
        intervention_value_aud: c.intervention_value_aud, last_texted_at: last,
        cooling_down: !!last && coolMs > 0 && now - Date.parse(last) < coolMs, gap_ratio: c.gap_ratio,
      };
    })
    .sort((a, b) => b.intervention_value_aud - a.intervention_value_aud);

  const candidates = all.filter((q) => !q.cooling_down);
  const count = (s: string) => rows.filter((c) => c.sms_status === s).length;

  return {
    candidates,
    overview: {
      config,
      stats: { sent_24h: sent24, remaining_today: Math.max(0, config.daily_cap - sent24), sent_30d: sent30, failed_30d: failed30, cost_30d: Math.round(cost30 * 100) / 100 },
      daily: [...dayMap.entries()].map(([date, v]) => ({ date, sent: v.sent, failed: v.failed, cost: Math.round(v.cost * 100) / 100 })),
      queue: all.slice(0, 500),
      candidates_total: candidates.length,
      cooling_total: all.length - candidates.length,
      blocked: { held: count("held"), opted_out: count("opted_out"), invalid_number: count("invalid_number") },
      recent: log.slice(0, 40).map((r) => ({
        sent_at: r.sent_at, name: r.customer_name || "Client", phone_last4: r.phone ? String(r.phone).replace(/\D/g, "").slice(-4) : null,
        status: isFail(r.status) ? "failed" : "sent", markov_state: r.markov_state ?? null, cost: Number(r.cost) || 0,
      })),
    },
  };
}
