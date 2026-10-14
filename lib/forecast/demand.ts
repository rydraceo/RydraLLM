import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomers, type CopilotCustomer } from "@/lib/ai/customers";
import { computeOutreach } from "@/lib/outreach/data";

// Demand forecast for the dashboard heatmap and the cancellation slot-fill.
//
// There is no booking-slot table in this app yet (the live diary sits in the booking system), so demand is
// PROJECTED from what we do know about every client: when they last came, how long they usually wait between
// visits, and how likely they are to come back. Confirmed future bookings (a last-visit date in the future)
// are counted as certain. The weekday shape comes from the real spread of clients' last appointments.
// The load % is an index relative to your busiest typical days, not a headcount.

const TZ = "Australia/Sydney";
const DAY_MS = 86_400_000;
export const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const GRID_DAYS = 42;

export const sydDate = (d: Date | number) => new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
const utcMs = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
export const dowOf = (s: string) => new Date(utcMs(s)).getUTCDay();
export const addDays = (s: string, n: number) => new Date(utcMs(s) + n * DAY_MS).toISOString().slice(0, 10);
const diffDays = (a: string, b: string) => Math.round((utcMs(a) - utcMs(b)) / DAY_MS);
export const shortLabel = (s: string) => { const [, m, d] = s.split("-").map(Number); return `${DOW_NAMES[dowOf(s)].slice(0, 3)} ${d} ${MON_SHORT[m - 1]}`; };
export const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
};

export type HeatDay = {
  date: string; label: string; dow: number; week_index: number;
  predicted_load: number; avg_bookings: number; confirmed: number; projected: number; typical_for_weekday: number;
  is_past: boolean; is_today: boolean; is_slow: boolean; is_opportunity: boolean; is_closed: boolean;
};
export type RankedClient = {
  user_id: string; name: string; markov_state: string; days_overdue: number; intervention_value: number;
  potential_value: string; slot_score: number; reasons: string[]; habit_match: boolean;
};
export type Opportunity = { date: string; label: string; dow: number; predicted_load: number; expected: number; reachable: number; top: RankedClient[] };
export type Forecast = {
  days: HeatDay[];
  opportunities: Opportunity[];
  profile: { dow: number; name: string; share: number; open: boolean }[];
  totals: { confirmed_next_7: number; expected_next_7: number; clients_modelled: number };
  generated_at: string;
};

const STATE_BOOST: Record<string, number> = { R_at_risk: 1.3, R_on_fence: 1.25, X: 1.1, C: 1.0, R_loyal: 0.8 };

/** Rank reachable clients for a slot on a given weekday. Pure, so it is easy to test. */
export function rankForSlot(rows: CopilotCustomer[], reachableIds: Set<string>, dow: number, limit: number): { ranked: RankedClient[]; total: number } {
  const pool = rows.filter((c) =>
    c.sms_status === "ok" && reachableIds.has(c.user_id) && !c.has_upcoming_booking &&
    c.days_since_last_visit >= 7, // just been in: not a good slot-fill target
  );
  const scored = pool.map((c) => {
    const habit = !!c.last_visit_local && dowOf(c.last_visit_local) === dow;
    const over = c.avg_gap_days > 0 ? Math.max(0, c.days_since_last_visit - c.avg_gap_days) : 0;
    const score = Math.max(c.intervention_value_aud, 0.5) * (habit ? 1.6 : 1) * (1 + Math.min(over / 60, 0.5)) * (STATE_BOOST[c.markov_state] ?? 1);
    const reasons: string[] = [];
    if (habit) reasons.push(`Last booked on a ${DOW_NAMES[dow]}`);
    if (over > 0) reasons.push(`${over} days past their usual ${c.avg_gap_days}-day cycle`);
    else reasons.push(`${c.days_since_last_visit} days since last visit`);
    reasons.push(`${c.visits} visit${c.visits === 1 ? "" : "s"}`);
    return {
      user_id: c.user_id, name: c.name, markov_state: c.markov_state, days_overdue: over || Math.max(0, c.days_since_last_visit),
      intervention_value: c.intervention_value_aud, potential_value: String(Math.round(c.clv_aud)),
      slot_score: Math.round(score * 10), reasons, habit_match: habit,
    } as RankedClient;
  }).sort((a, b) => b.slot_score - a.slot_score);
  return { ranked: scored.slice(0, limit), total: scored.length };
}

export async function loadPeople(supabase: SupabaseClient, venueId: string, businessId: string) {
  const [rows, out] = await Promise.all([getCustomers(supabase, venueId, businessId), computeOutreach(supabase, venueId, businessId)]);
  return { rows, reachableIds: new Set(out.candidates.map((c) => c.user_id)) };
}

export async function buildForecast(supabase: SupabaseClient, venueId: string, businessId: string): Promise<Forecast> {
  const { rows, reachableIds } = await loadPeople(supabase, venueId, businessId);
  const today = sydDate(Date.now());
  const todayDow = dowOf(today);
  const start = addDays(today, -((todayDow + 6) % 7)); // Monday of this week
  const dates = Array.from({ length: GRID_DAYS }, (_, i) => addDays(start, i));
  const idx = (d: string) => diffDays(d, start);

  // Weekday shape from the spread of real last appointments (past ones only).
  const counts = Array(7).fill(0) as number[];
  for (const c of rows) if (c.last_visit_local && c.last_visit_local <= today) counts[dowOf(c.last_visit_local)]++;
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  const open = counts.map((n) => n / total >= 0.02);
  const openMean = counts.filter((_, i) => open[i]).reduce((a, b) => a + b, 0) / Math.max(1, open.filter(Boolean).length);
  const w = counts.map((n, i) => (open[i] && openMean > 0 ? Math.max(0.35, n / openMean) : 0));

  const confirmed = Array(GRID_DAYS).fill(0) as number[];
  const projected = Array(GRID_DAYS).fill(0) as number[];
  let steadyDaily = 0; // long-run visits per day from all clients, used to settle the far weeks

  for (const c of rows) {
    if (!c.last_visit_local) continue;
    if (c.has_upcoming_booking) { const k = idx(c.last_visit_local); if (k >= 0 && k < GRID_DAYS) confirmed[k] += 1; continue; }
    const churn = Math.min(Math.max(c.churn_score, 0.02), 0.97);
    let mass = (1 - churn) * (c.markov_state === "X" ? 0.1 : c.markov_state === "C" ? 0.5 : 0.9);
    const cycle = Math.max(10, c.avg_gap_days > 0 ? c.avg_gap_days : 35);
    steadyDaily += ((1 - churn) * (c.markov_state === "X" ? 0.1 : c.markov_state === "C" ? 0.5 : 0.9)) / cycle;
    const spread = Math.min(10, Math.max(3, Math.round(cycle * 0.2)));
    const retain = Math.min(Math.max(1 - churn, 0.3), 0.95);
    const dueFirst = addDays(c.last_visit_local, cycle);

    // Overdue clients: a smaller chance they come back soon, spread over the next three weeks.
    if (diffDays(dueFirst, today) < 0) {
      const m = (1 - churn) * (c.markov_state === "X" ? 0.05 : 0.45);
      let norm = 0; const ws: [number, number][] = [];
      for (let d = 0; d < 21; d++) { const k = idx(addDays(today, d)); const wt = Math.exp(-d / 8) * w[dowOf(addDays(today, d))]; if (wt > 0 && k >= 0 && k < GRID_DAYS) { ws.push([k, wt]); } norm += wt; }
      if (norm > 0) for (const [k, wt] of ws) projected[k] += m * (wt / norm);
      continue;
    }

    // Upcoming expected visits (they may be due more than once in six weeks).
    for (let n = 0; n < 6; n++, mass *= retain) {
      const centre = addDays(dueFirst, n * cycle);
      if (diffDays(centre, start) > GRID_DAYS + spread) break;
      let norm = 0; const ws: [number, number][] = [];
      for (let o = -spread; o <= spread; o++) {
        const d = addDays(centre, o);
        if (d < today) continue; // can't be in the past
        const wt = (1 - Math.abs(o) / (spread + 1)) * w[dowOf(d)];
        if (wt <= 0) continue;
        norm += wt;
        const k = idx(d);
        if (k >= 0 && k < GRID_DAYS) ws.push([k, wt]);
      }
      if (norm > 0) for (const [k, wt] of ws) projected[k] += mass * (wt / norm);
    }
  }

  // Near days use each client's own due date; far days settle toward the long-run weekday pattern, because
  // nobody can say who will be overdue in five weeks. The blend moves from 0% to 100% over four weeks.
  const sumW = w.reduce((a, b) => a + b, 0) || 1;
  dates.forEach((d, i) => {
    const h = Math.max(0, diffDays(d, today));
    const alpha = Math.min(1, h / 28);
    const steady = (steadyDaily * 7 * w[dowOf(d)]) / sumW;
    projected[i] = (1 - alpha) * projected[i] + alpha * steady;
  });
  const expected = dates.map((_, i) => confirmed[i] + projected[i]);
  const futureOpen = dates.map((d, i) => ({ d, e: expected[i] })).filter((x) => x.d >= today && open[dowOf(x.d)]);
  const sorted = futureOpen.map((x) => x.e).sort((a, b) => a - b);
  const ref = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.85))] : 0;

  const byDow: number[][] = Array.from({ length: 7 }, () => []);
  futureOpen.forEach((x) => byDow[dowOf(x.d)].push(x.e));
  const typical = byDow.map((a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0));

  const days: HeatDay[] = dates.map((date, i) => {
    const dow = dowOf(date);
    const closed = !open[dow];
    const past = date < today;
    const load = closed || past || ref <= 0 ? 0 : Math.min(100, Math.round((85 * expected[i]) / ref));
    return {
      date, label: shortLabel(date), dow, week_index: Math.floor(i / 7),
      predicted_load: load, avg_bookings: Math.round(expected[i] * 10) / 10,
      confirmed: confirmed[i], projected: Math.round(projected[i] * 10) / 10, typical_for_weekday: Math.round(typical[dow] * 10) / 10,
      is_past: past, is_today: date === today, is_closed: closed,
      is_slow: !closed && !past && load < 50, is_opportunity: !closed && !past && load < 40,
    };
  });

  // Best days to fill in the next three weeks, each with the clients most likely to take the spot.
  const horizon = addDays(today, 21);
  const opportunities: Opportunity[] = days
    .filter((d) => d.is_slow && d.date <= horizon)
    .sort((a, b) => a.predicted_load - b.predicted_load || (a.date < b.date ? -1 : 1))
    .slice(0, 4)
    .map((d) => {
      const r = rankForSlot(rows, reachableIds, d.dow, 3);
      return { date: d.date, label: d.label, dow: d.dow, predicted_load: d.predicted_load, expected: d.avg_bookings, reachable: r.total, top: r.ranked };
    });

  const next7 = days.filter((d) => d.date >= today && d.date < addDays(today, 7));
  return {
    days, opportunities,
    profile: counts.map((n, i) => ({ dow: i, name: DOW_NAMES[i], share: Math.round((n / total) * 1000) / 10, open: open[i] })),
    totals: {
      confirmed_next_7: next7.reduce((s, d) => s + d.confirmed, 0),
      expected_next_7: Math.round(next7.reduce((s, d) => s + d.avg_bookings, 0) * 10) / 10,
      clients_modelled: rows.length,
    },
    generated_at: new Date().toISOString(),
  };
}

/** Data-only insight, used when the AI is unavailable or its answer fails the number check. */
export function fallbackInsight(f: Forecast): string {
  const open = f.profile.filter((p) => p.open).sort((a, b) => b.share - a.share);
  const busiest = open[0], quietest = open[open.length - 1];
  const opp = f.opportunities[0];
  const parts: string[] = [];
  if (busiest && quietest && busiest.dow !== quietest.dow) parts.push(`${busiest.name}s are your busiest day and ${quietest.name}s your quietest.`);
  if (opp) parts.push(`${opp.label} looks slowest (${opp.predicted_load}% load) with ${opp.reachable} reachable clients who could fill it.`);
  else parts.push("No slow days stand out in the next three weeks.");
  parts.push(`${f.totals.confirmed_next_7} bookings are already confirmed for the next 7 days.`);
  return parts.join(" ");
}

export function insightFacts(f: Forecast) {
  const open = f.profile.filter((p) => p.open).sort((a, b) => b.share - a.share);
  return {
    busiest_weekday: open[0]?.name ?? null,
    quietest_open_weekday: open[open.length - 1]?.name ?? null,
    closed_weekdays: f.profile.filter((p) => !p.open).map((p) => p.name),
    confirmed_bookings_next_7_days: f.totals.confirmed_next_7,
    slow_days_next_3_weeks: f.opportunities.map((o) => ({ day: o.label, load_percent: o.predicted_load, reachable_clients: o.reachable, top_client: o.top[0]?.name ?? null })),
  };
}
