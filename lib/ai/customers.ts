import type { SupabaseClient } from "@supabase/supabase-js";
import { toAuMobile } from "@/lib/sms/guard";

// Server-side customer loader for the Copilot.
// NOTE: this mirrors the scoring/status logic in app/api/intelligence/at-risk-customers/route.ts.
// Once stable, move both onto this one module so they can never drift apart.

export type MarkovKey = "C" | "X" | "R_at_risk" | "R_on_fence" | "R_loyal";
export type SmsStatus = "ok" | "held" | "opted_out" | "invalid_number" | "unknown";

export type CopilotCustomer = {
  user_id: string;
  name: string;
  phone_last4: string | null; // full phone numbers and emails are never given to the model
  risk_segment: string;
  markov_state: MarkovKey;
  gap_ratio: number;
  days_since_last_visit: number; // clamped at 0
  has_upcoming_booking: boolean;
  visits: number;
  clv_aud: number;
  churn_score: number; // 0..1
  intervention_value_aud: number; // 0 if the client cannot be messaged
  sms_status: SmsStatus;
  last_visit: string | null;
};

// ─── Scoring (same constants as the dashboard route) ─────────────────────────
const P: number[][] = [
  [0.0, 0.4, 0.25, 0.15, 0.2],
  [0.0, 0.75, 0.18, 0.05, 0.02],
  [0.0, 0.3, 0.35, 0.25, 0.1],
  [0.0, 0.08, 0.15, 0.35, 0.42],
  [0.0, 0.0, 0.0, 0.0, 1.0],
];
function mul(A: number[][], B: number[][]): number[][] {
  const C = Array.from({ length: 5 }, () => Array(5).fill(0) as number[]);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) for (let k = 0; k < 5; k++) C[i][j] += A[i][k] * B[k][j];
  return C;
}
const P3 = mul(mul(P, P), P);
const IDX: Record<MarkovKey, number> = { C: 0, R_loyal: 1, R_on_fence: 2, R_at_risk: 3, X: 4 };
const RATES: Record<MarkovKey, { natural: number; sms: number }> = {
  C: { natural: 0.25, sms: 0.45 },
  X: { natural: 0.03, sms: 0.15 },
  R_at_risk: { natural: 0.15, sms: 0.35 },
  R_on_fence: { natural: 0.4, sms: 0.55 },
  R_loyal: { natural: 0.65, sms: 0.7 },
};
export const SMS_COST_AUD = 0.08;

function markovKey(visits: number, gap: number, state: string): MarkovKey {
  if (visits <= 1) return "C";
  if (gap > 2.5 || state === "X") return "X";
  if (gap > 1.3) return "R_at_risk";
  if (gap > 1.0) return "R_on_fence";
  return "R_loyal";
}

// ─── Loader (cached 60s per venue) ───────────────────────────────────────────
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; rows: CopilotCustomer[] }>();

export async function getCustomers(supabase: SupabaseClient, venueId: string, businessId: string): Promise<CopilotCustomer[]> {
  const hit = cache.get(venueId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;

  let raw: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.rpc("get_customers_with_scores", { p_venue_id: venueId }).range(from, from + 999);
    if (error) throw new Error(`customers rpc: ${error.message}`);
    raw = raw.concat(data ?? []);
    if (!data || data.length < 1000) break;
  }

  const flags = new Map<string, { phone: string | null; opt: boolean; hold: boolean }>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("customers")
      .select("user_id, phone, sms_opt_out, sms_hold")
      .eq("business_id", businessId)
      .not("user_id", "is", null)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`sms flags: ${error.message}`);
    (data ?? []).forEach((r: any) => flags.set(r.user_id, { phone: r.phone, opt: !!r.sms_opt_out, hold: !!r.sms_hold }));
    if (!data || data.length < 1000) break;
  }

  const now = Date.now();
  const rows: CopilotCustomer[] = raw.map((r: any) => {
    const visits = Number(r.total_visits) || 0;
    const gap = Number(r.gap_ratio) || 0;
    const clv = (Number(r.clv_cents) || 0) / 100;
    const key = markovKey(visits, gap, r.current_state || "R");
    const dbChurn = Number(r.churn_score_10);
    const churn = dbChurn > 0 ? dbChurn : P3[IDX[key]][4];

    const fl = flags.get(r.user_id);
    const sms_status: SmsStatus = !fl ? "unknown" : fl.opt ? "opted_out" : fl.hold ? "held" : toAuMobile(fl.phone) ? "ok" : "invalid_number";

    const ivRaw = r.intervention_value_cents != null ? Number(r.intervention_value_cents) / 100 : Math.max(clv * (RATES[key].sms - RATES[key].natural) - SMS_COST_AUD, 0);
    const lastMs = r.last_event_at ? Date.parse(r.last_event_at) : NaN;
    const rawDays = Number(r.days_since_last_visit) || 0;
    const phone = fl?.phone ? fl.phone.replace(/\D/g, "").slice(-4) : null;

    return {
      user_id: r.user_id,
      name: r.customer_name || "Unknown customer",
      phone_last4: phone || null,
      risk_segment: r.risk_segment || "Unknown",
      markov_state: key,
      gap_ratio: Math.round(gap * 100) / 100,
      days_since_last_visit: Math.max(0, rawDays),
      has_upcoming_booking: Number.isFinite(lastMs) ? lastMs > now : rawDays < 0,
      visits,
      clv_aud: Math.round(clv * 100) / 100,
      churn_score: Math.round(churn * 1000) / 1000,
      intervention_value_aud: sms_status === "ok" ? Math.round(ivRaw * 100) / 100 : 0,
      sms_status,
      last_visit: r.last_event_at ? String(r.last_event_at).slice(0, 10) : null,
    };
  });

  cache.set(venueId, { at: Date.now(), rows });
  return rows;
}

// ─── Filtering / sorting ─────────────────────────────────────────────────────
export type CustomerFilter = {
  risk_segment?: "Churned" | "At Risk" | "Stable";
  markov_state?: MarkovKey;
  sms?: "messageable" | "blocked" | "held" | "invalid_number" | "opted_out";
  min_days_since_visit?: number;
  max_days_since_visit?: number;
  min_clv?: number;
  min_visits?: number;
  max_visits?: number;
  search?: string;
};

export function filterCustomers(rows: CopilotCustomer[], f: CustomerFilter): CopilotCustomer[] {
  const q = f.search?.trim().toLowerCase();
  return rows.filter((c) => {
    if (f.risk_segment && c.risk_segment !== f.risk_segment) return false;
    if (f.markov_state && c.markov_state !== f.markov_state) return false;
    if (f.sms === "messageable" && c.sms_status !== "ok") return false;
    if (f.sms === "blocked" && c.sms_status === "ok") return false;
    if (f.sms && !["messageable", "blocked"].includes(f.sms) && c.sms_status !== f.sms) return false;
    if (f.min_days_since_visit != null && c.days_since_last_visit < f.min_days_since_visit) return false;
    if (f.max_days_since_visit != null && c.days_since_last_visit > f.max_days_since_visit) return false;
    if (f.min_clv != null && c.clv_aud < f.min_clv) return false;
    if (f.min_visits != null && c.visits < f.min_visits) return false;
    if (f.max_visits != null && c.visits > f.max_visits) return false;
    if (q && !c.name.toLowerCase().includes(q)) return false;
    return true;
  });
}

export type SortKey = "intervention_value" | "clv" | "churn_score" | "days_since_visit" | "visits";
export function sortCustomers(rows: CopilotCustomer[], key: SortKey = "intervention_value", dir: "desc" | "asc" = "desc"): CopilotCustomer[] {
  const val = (c: CopilotCustomer) =>
    key === "clv" ? c.clv_aud : key === "churn_score" ? c.churn_score : key === "days_since_visit" ? c.days_since_last_visit : key === "visits" ? c.visits : c.intervention_value_aud;
  return [...rows].sort((a, b) => (dir === "desc" ? val(b) - val(a) : val(a) - val(b)));
}

export function summarise(rows: CopilotCustomer[]) {
  const by_sms: Record<string, number> = {};
  const by_state: Record<string, { count: number; avg_churn: number }> = {};
  let clv = 0, iv = 0, days = 0;
  for (const c of rows) {
    by_sms[c.sms_status] = (by_sms[c.sms_status] ?? 0) + 1;
    const s = (by_state[c.markov_state] ??= { count: 0, avg_churn: 0 });
    s.count++; s.avg_churn += c.churn_score;
    clv += c.clv_aud; iv += c.intervention_value_aud; days += c.days_since_last_visit;
  }
  Object.values(by_state).forEach((s) => (s.avg_churn = Math.round((s.avg_churn / s.count) * 1000) / 1000));
  return {
    total_clients: rows.length,
    messageable: by_sms.ok ?? 0,
    by_sms_status: by_sms,
    by_markov_state: by_state,
    total_clv_aud: Math.round(clv),
    total_intervention_value_aud: Math.round(iv),
    avg_days_since_visit: rows.length ? Math.round(days / rows.length) : 0,
    clients_with_upcoming_booking: rows.filter((c) => c.has_upcoming_booking).length,
  };
}
