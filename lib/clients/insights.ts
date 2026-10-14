// Pure client-intelligence maths. No imports from the server, so it runs in the browser too.
import type { Person } from "@/lib/campaigns/model";

export type ClientRow = Person & {
  gap_ratio: number; avgGap: number; lastVisit: string | null; nextDue: string | null; daysToDue: number | null;
  phoneLast4: string | null; smsStatus: string; tier: "VIP" | "Core" | "Regular"; at_stake: number; returnOdds: number;
};

export type Tier = ClientRow["tier"];

export const todaySyd = () => new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
export const addDaysIso = (d: string, n: number) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const diffDaysIso = (a: string, b: string) => Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000);

/** Adds tiers (top 10% by lifetime value = VIP, next 20% = Core) and value at stake. */
export function enrich(rows: Omit<ClientRow, "tier">[]): ClientRow[] {
  const sorted = [...rows].filter((r) => r.clv > 0).sort((a, b) => b.clv - a.clv);
  const vipCut = sorted[Math.max(0, Math.ceil(sorted.length * 0.1) - 1)]?.clv ?? Infinity;
  const coreCut = sorted[Math.max(0, Math.ceil(sorted.length * 0.3) - 1)]?.clv ?? Infinity;
  return rows.map((r) => ({ ...r, tier: r.clv > 0 && r.clv >= vipCut ? "VIP" : r.clv > 0 && r.clv >= coreCut ? "Core" : "Regular" }));
}

export type DueStatus = "booked" | "new" | "ontrack" | "due" | "slipping" | "overdue" | "lapsed";
export function dueStatus(r: ClientRow): DueStatus {
  if (r.booked) return "booked";
  if (r.state === "X" || r.gap_ratio > 2.5) return "lapsed";
  if (r.visits <= 1) return "new";
  if (r.gap_ratio < 0.8) return "ontrack";
  if (r.gap_ratio <= 1.1) return "due";
  if (r.gap_ratio <= 1.5) return "slipping";
  return "overdue";
}
export const DUE_META: Record<DueStatus, { label: string; color: string }> = {
  booked: { label: "Booked in", color: "#38BDF8" }, new: { label: "New", color: "#A78BFA" }, ontrack: { label: "On track", color: "#34D399" },
  due: { label: "Due now", color: "#EAB308" }, slipping: { label: "Slipping", color: "#FB923C" }, overdue: { label: "Overdue", color: "#F43F5E" }, lapsed: { label: "Lapsed", color: "#9F1239" },
};

export type Summary = {
  total: number; active: number; lapsed: number; lapsedValue: number; atRisk: number; atRiskCount: number;
  firstVisitRebook: number | null; firstVisitSample: number; ladder: { step: string; pct: number; n: number }[];
  top20Share: number; top10Share: number; pareto: { pct: number; share: number }[]; totalValue: number;
  dueWeek: number; dueWeekValue: number; avgGap: number; avgTicket: number;
};

export function summarise(rows: ClientRow[]): Summary {
  const seen = rows.filter((r) => r.visits >= 1 || r.booked);
  const lapsed = seen.filter((r) => dueStatus(r) === "lapsed");
  const active = seen.filter((r) => dueStatus(r) !== "lapsed");
  const atRiskRows = active.filter((r) => ["slipping", "overdue"].includes(dueStatus(r)) || (r.churn >= 0.4 && !r.booked));
  const totalValue = seen.reduce((s, r) => s + r.clv, 0);

  // Of everyone first seen long enough ago to have come back, how many did?
  const mature = seen.filter((r) => r.visits >= 2 || r.booked || r.daysSince > 45);
  const rebooked = mature.filter((r) => r.visits >= 2 || r.booked).length;
  const reach = (k: number) => seen.filter((r) => r.visits >= k).length;
  const base = Math.max(1, reach(1));
  const ladder = [1, 2, 3, 4, 5, 6].map((k) => ({ step: k === 1 ? "1st visit" : `${k}${k === 2 ? "nd" : k === 3 ? "rd" : "th"} visit`, pct: Math.round((reach(k) / base) * 100), n: reach(k) }));

  const byValue = [...seen].sort((a, b) => b.clv - a.clv);
  const share = (frac: number) => { const k = Math.ceil(byValue.length * frac); return totalValue ? byValue.slice(0, k).reduce((s, r) => s + r.clv, 0) / totalValue : 0; };
  const pareto = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((p) => ({ pct: Math.round(p * 100), share: Math.round(share(p) * 100) }));

  const dueWeekRows = active.filter((r) => !r.booked && r.daysToDue !== null && r.daysToDue <= 7 && r.daysToDue >= -7 && r.visits >= 2);
  const gaps = seen.filter((r) => r.avgGap > 0).map((r) => r.avgGap);
  const tickets = seen.filter((r) => r.visits > 0).map((r) => r.ticket);
  return {
    total: seen.length, active: active.length, lapsed: lapsed.length, lapsedValue: lapsed.reduce((s, r) => s + r.clv, 0),
    atRisk: atRiskRows.reduce((s, r) => s + r.clv * Math.max(r.churn, 0.2), 0), atRiskCount: atRiskRows.length,
    firstVisitRebook: mature.length >= 10 ? rebooked / mature.length : null, firstVisitSample: mature.length, ladder,
    top20Share: share(0.2), top10Share: share(0.1), pareto, totalValue,
    dueWeek: dueWeekRows.length, dueWeekValue: dueWeekRows.reduce((s, r) => s + r.ticket, 0),
    avgGap: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0, avgTicket: tickets.length ? tickets.reduce((a, b) => a + b, 0) / tickets.length : 0,
  };
}

/** Clients predicted to be due on each of the next N days (plus an "already overdue" bucket). */
export function returnRadar(rows: ClientRow[], days = 21) {
  const today = todaySyd();
  const out: { key: string; label: string; n: number; value: number; ids: string[]; overdue?: boolean }[] = [];
  const cand = rows.filter((r) => !r.booked && r.visits >= 2 && r.avgGap > 0 && r.nextDue && dueStatus(r) !== "lapsed");
  const over = cand.filter((r) => (r.daysToDue ?? 0) < 0 && dueStatus(r) !== "overdue");
  out.push({ key: "now", label: "Due", n: over.length, value: over.reduce((s, r) => s + r.ticket, 0), ids: over.map((r) => r.user_id), overdue: true });
  for (let i = 0; i < days; i++) {
    const d = addDaysIso(today, i);
    const hit = cand.filter((r) => r.nextDue === d || (i === 0 && r.daysToDue === 0));
    const dd = new Date(d + "T12:00:00Z");
    out.push({ key: d, label: i === 0 ? "Today" : dd.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", timeZone: "UTC" }), n: hit.length, value: hit.reduce((s, r) => s + r.ticket, 0), ids: hit.map((r) => r.user_id) });
  }
  return out;
}

export type SmartList = { id: string; name: string; hint: string; color: string; test: (r: ClientRow) => boolean };
export function smartLists(rows: ClientRow[]): (SmartList & { n: number; value: number })[] {
  const xClv = rows.filter((r) => r.state === "X" && r.clv > 0).map((r) => r.clv).sort((a, b) => a - b);
  const xMed = xClv.length ? xClv[Math.floor(xClv.length / 2)] : 0;
  const L: SmartList[] = [
    { id: "due", name: "Due this week", hint: "Their usual rhythm says they're about to book", color: "#EAB308", test: (r) => !r.booked && r.visits >= 2 && r.daysToDue !== null && r.daysToDue <= 7 && r.daysToDue >= -7 && dueStatus(r) !== "lapsed" },
    { id: "vip", name: "Slipping VIPs", hint: "Top spenders running late. Highest priority", color: "#F43F5E", test: (r) => r.tier === "VIP" && !r.booked && r.gap_ratio > 1.2 && dueStatus(r) !== "lapsed" },
    { id: "second", name: "Save the second visit", hint: "One visit, 2-8 weeks ago. The habit is made or lost here", color: "#A78BFA", test: (r) => r.visits === 1 && !r.booked && r.daysSince >= 14 && r.daysSince <= 60 },
    { id: "winback", name: "Win-back worth it", hint: "Lapsed but valuable (3+ visits, above-median spend)", color: "#FB923C", test: (r) => r.state === "X" && r.visits >= 3 && r.clv >= xMed },
    { id: "booked", name: "Booked ahead", hint: "Already in the diary", color: "#38BDF8", test: (r) => r.booked },
    { id: "unreach", name: "Can't be texted", hint: "Opted out, on hold or no valid mobile", color: "#6B5C8A", test: (r) => !r.smsOk && (r.visits >= 1) },
  ];
  return L.map((l) => { const m = rows.filter(l.test); return { ...l, n: m.length, value: m.reduce((s, r) => s + r.clv, 0) }; });
}

/** Gap trend from a client's own visit gaps: are they coming further apart? */
export function gapTrend(gaps: number[]): { label: string; tone: "good" | "warn" | "bad" | "flat"; delta: number } | null {
  if (gaps.length < 4) return null;
  const recent = gaps.slice(-3), prior = gaps.slice(0, -3);
  const a = recent.reduce((s, g) => s + g, 0) / recent.length, b = prior.reduce((s, g) => s + g, 0) / prior.length;
  if (!b) return null;
  const d = (a - b) / b;
  if (d > 0.25) return { label: `Visits are getting further apart (${Math.round(b)} to ${Math.round(a)} days)`, tone: "bad", delta: d };
  if (d > 0.1) return { label: `Gaps are creeping up (${Math.round(b)} to ${Math.round(a)} days)`, tone: "warn", delta: d };
  if (d < -0.1) return { label: `Coming in more often (${Math.round(b)} to ${Math.round(a)} days)`, tone: "good", delta: d };
  return { label: "Very steady rhythm", tone: "flat", delta: d };
}
