// Pure campaign maths: audience filtering, the "flight simulator" (Monte Carlo) and the diminishing-returns curve.
// No imports, so it runs in the browser, on the server and in tests.
//
// The response rates are the same Markov-model constants used across Rydra: for each client state, the chance of
// rebooking on their own (nat) and with a text (sms). The lift from a text is (sms - nat) x the client's typical
// ticket. Everything here is a MODEL ESTIMATE; real results are measured afterwards against a held-out control group.

export type MarkovKey = "C" | "X" | "R_at_risk" | "R_on_fence" | "R_loyal";
export const STATES: MarkovKey[] = ["X", "R_at_risk", "R_on_fence", "C", "R_loyal"];
export const RATES: Record<MarkovKey, { nat: number; sms: number }> = {
  C: { nat: 0.25, sms: 0.45 }, X: { nat: 0.03, sms: 0.15 }, R_at_risk: { nat: 0.15, sms: 0.35 },
  R_on_fence: { nat: 0.4, sms: 0.55 }, R_loyal: { nat: 0.65, sms: 0.7 },
};
export const COST_PER_TEXT = 0.08;

export type Person = {
  user_id: string; name: string; state: MarkovKey;
  clv: number; visits: number; churn: number; daysSince: number; habitDow: number | null;
  smsOk: boolean; cooling: boolean; booked: boolean; ticket: number;
};

export type AudienceFilter = {
  states: MarkovKey[]; minClv: number; minVisits: number; minDays: number; maxDays: number;
  weekday: number | null; minChurn: number;
  /** When set, only these clients (e.g. a follow-up wave) are considered. */
  ids: string[] | null;
};
export const DEFAULT_FILTER: AudienceFilter = { states: [], minClv: 0, minVisits: 0, minDays: 0, maxDays: 999, weekday: null, minChurn: 0, ids: null };

export function ticketOf(clv: number, visits: number): number {
  const t = visits > 0 ? clv / visits : 45;
  return Math.min(200, Math.max(20, Number.isFinite(t) ? t : 45));
}

export function matches(p: Person, f: AudienceFilter): boolean {
  if (f.ids && !f.ids.includes(p.user_id)) return false;
  if (f.states.length && !f.states.includes(p.state)) return false;
  if (p.clv < f.minClv || p.visits < f.minVisits) return false;
  if (p.daysSince < f.minDays || p.daysSince > f.maxDays) return false;
  if (f.weekday !== null && p.habitDow !== f.weekday) return false;
  if (p.churn < f.minChurn) return false;
  return true;
}

export function liftPerText(p: Person, haircut = 1): number {
  const r = RATES[p.state];
  return (r.nat + (r.sms - r.nat) * haircut - r.nat) * p.ticket;
}

export type Funnel = { label: string; n: number; note: string }[];
export function funnel(all: Person[], f: AudienceFilter, cap: number): { stages: Funnel; send: Person[] } {
  const matched = all.filter((p) => matches(p, f));
  const reachable = matched.filter((p) => p.smsOk);
  const fresh = reachable.filter((p) => !p.cooling);
  const open = fresh.filter((p) => !p.booked);
  const ranked = [...open].sort((a, b) => liftPerText(b) - liftPerText(a));
  const send = ranked.slice(0, Math.max(0, cap));
  return {
    send: ranked, // full ranked list; the caller slices to the chosen send count
    stages: [
      { label: "In your database", n: all.length, note: "every client Rydra knows" },
      { label: "Match your audience", n: matched.length, note: "your filters" },
      { label: "Can be texted", n: reachable.length, note: `${matched.length - reachable.length} opted out, on hold or no valid mobile` },
      { label: "Not texted recently", n: fresh.length, note: `${reachable.length - fresh.length} still in the cooldown window` },
      { label: "Not already booked", n: open.length, note: `${fresh.length - open.length} already have a booking` },
      { label: "Within today's limit", n: send.length, note: `daily limit leaves room for ${cap}` },
    ],
  };
}

// ── Flight simulator ─────────────────────────────────────────────────────────
function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export type SimResult = {
  n: number; cost: number; meanRevenue: number; meanNet: number; p10: number; p50: number; p90: number;
  probProfit: number; expectedRebooks: number; breakEvenRebooks: number; roi: number;
  hist: { min: number; max: number; counts: number[] };
};

export function simulate(people: Person[], opts: { runs?: number; haircut?: number; seed?: number } = {}): SimResult {
  const runs = opts.runs ?? 2000, h = opts.haircut ?? 1;
  const n = people.length, cost = n * COST_PER_TEXT;
  if (!n) return { n: 0, cost: 0, meanRevenue: 0, meanNet: 0, p10: 0, p50: 0, p90: 0, probProfit: 0, expectedRebooks: 0, breakEvenRebooks: 0, roi: 0, hist: { min: 0, max: 1, counts: Array(24).fill(0) } };
  const rnd = mulberry32(opts.seed ?? 1337);
  const pn = people.map((p) => RATES[p.state].nat);
  const ps = people.map((p, i) => pn[i] + (RATES[p.state].sms - RATES[p.state].nat) * h);
  const tk = people.map((p) => p.ticket);
  const out: number[] = new Array(runs);
  let rebooksSum = 0;
  for (let r = 0; r < runs; r++) {
    let incr = 0;
    for (let i = 0; i < n; i++) {
      const a = rnd() < ps[i] ? 1 : 0, b = rnd() < pn[i] ? 1 : 0;
      incr += (a - b) * tk[i];
      rebooksSum += a - b;
    }
    out[r] = incr - cost;
  }
  const sorted = [...out].sort((x, y) => x - y);
  const q = (p: number) => sorted[Math.min(runs - 1, Math.max(0, Math.floor(p * runs)))];
  const meanNet = out.reduce((s, v) => s + v, 0) / runs;
  const avgTicket = tk.reduce((s, v) => s + v, 0) / n;
  const bins = 24, lo = sorted[0], hi = sorted[runs - 1] === lo ? lo + 1 : sorted[runs - 1];
  const counts = Array(bins).fill(0) as number[];
  for (const v of out) counts[Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo)) * bins))]++;
  return {
    n, cost, meanRevenue: meanNet + cost, meanNet, p10: q(0.1), p50: q(0.5), p90: q(0.9),
    probProfit: out.filter((v) => v > 0).length / runs, expectedRebooks: rebooksSum / runs,
    breakEvenRebooks: Math.ceil(cost / Math.max(avgTicket, 1)), roi: cost > 0 ? (meanNet + cost) / cost : 0,
    hist: { min: lo, max: hi, counts },
  };
}

/** Diminishing returns: cumulative expected net as you text further down the ranked list. */
export function returnCurve(ranked: Person[], haircut = 1, minReturnPerDollar = 5) {
  const pts: { k: number; net: number; marginal: number }[] = [];
  let cum = 0, sweet = 0;
  const step = Math.max(1, Math.floor(ranked.length / 80));
  ranked.forEach((p, i) => {
    const m = liftPerText(p, haircut);
    cum += m - COST_PER_TEXT;
    if (m >= COST_PER_TEXT * minReturnPerDollar) sweet = i + 1; // ranked best-first, so this is monotone-ish
    if (i % step === 0 || i === ranked.length - 1) pts.push({ k: i + 1, net: cum, marginal: m });
  });
  return { pts, sweet };
}
