import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomers, type CopilotCustomer } from "@/lib/ai/customers";
import { addDaysIso, diffDaysIso, todaySyd } from "@/lib/clients/insights";
import { dowOf } from "@/lib/forecast/demand";

// Team analytics. Headline numbers come from barber_stats (the Fresha performance report). Client books, retention and
// trends come from barber_visits (Fresha appointment export, imported in the owner console) and barber_clients
// (who each client's barber is: imported or assigned by hand). dataLevel says how much is available:
// "visits" = full history, "assignments" = client books only, "stats" = headline numbers only.

export type Stats = Record<string, any>;
export type BookClient = {
  user_id: string; name: string; state: string; visitsWithMe: number; visits: number; clv: number; lastVisit: string | null; daysSince: number;
  gap_ratio: number; avgGap: number; booked: boolean; smsOk: boolean; churn: number; status: "due" | "slipping" | "overdue" | "lapsed" | "ontrack" | "booked" | "new"; atStake: number; nextDue: string | null;
};
export type BarberMetrics = {
  hasVisits: boolean;
  months: { m: string; revenue: number; visits: number }[];
  dow: number[]; visits12m: number; revenue12m: number; clients: number; regulars: number;
  return45: number | null; return45n: number; keptWithMe: number | null; firstReturn: number | null; firstReturnN: number;
  ticket90: number | null; ticketPrev90: number | null; weeklyVisits: number | null;
  book: BookClient[]; bookValue: number; atRiskCount: number; atRiskValue: number; dueSoon: number; secondVisit: number;
};
export type TeamBarber = { id: string; name: string; slug: string; role: string | null; color_from: string; color_to: string; stats: Stats | null; metrics: BarberMetrics | null };
export type Team = { barbers: TeamBarber[]; derived: boolean; dataLevel: DataLevel; tables: { visits: boolean; clients: boolean }; visitCount: number; linkCount: number; shop: { rebook_rate: number; avg_service_value: number; upsell_rate: number; avg_appt_value: number; total_revenue: number } | null; generated_at: string };

const dayOf = (v: any): string | null => { if (!v) return null; const t = Date.parse(String(v)); return Number.isFinite(t) ? new Date(t).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }) : null; };
type Ev = { user: string; date: string; barber: string; rev: number };
export type DataLevel = "visits" | "assignments" | "stats";
type Link = { customer: string; barber: string; visits: number; primary: boolean };

/** Visit history per barber. Source 1: barber_visits (imported from Fresha). Source 2: the events table, if it has barber ids. */
async function loadVisits(supabase: SupabaseClient, venueId: string): Promise<{ rows: Ev[]; table: boolean }> {
  const out: Ev[] = []; let table = true;
  for (let from = 0; from < 60000; from += 1000) {
    const { data, error } = await supabase.from("barber_visits").select("customer_id, barber_id, visit_date, revenue_cents").eq("venue_id", venueId).eq("status", "completed").order("id", { ascending: true }).range(from, from + 999);
    if (error) { table = false; break; }
    (data ?? []).forEach((r: any) => out.push({ user: r.customer_id ? String(r.customer_id) : "", date: String(r.visit_date).slice(0, 10), barber: String(r.barber_id), rev: (Number(r.revenue_cents) || 0) / 100 }));
    if (!data || data.length < 1000) break;
  }
  if (out.length) return { rows: out, table };
  for (let from = 0; from < 40000; from += 1000) {
    const { data, error } = await supabase.from("events").select("user_id, barber_id, occurred_at, appointment_datetime, event_type").eq("venue_id", venueId).not("barber_id", "is", null).order("occurred_at", { ascending: true }).range(from, from + 999);
    if (error) break;
    (data ?? []).forEach((r: any) => { if (/cancel|no.?show/i.test(String(r.event_type ?? ""))) return; const d = dayOf(r.appointment_datetime ?? r.occurred_at); if (d) out.push({ user: r.user_id ? String(r.user_id) : "", date: d, barber: String(r.barber_id), rev: 0 }); });
    if (!data || data.length < 1000) break;
  }
  return { rows: out, table };
}

/** Client <-> barber links (imported or assigned by hand). */
async function loadLinks(supabase: SupabaseClient, venueId: string): Promise<{ rows: Link[]; table: boolean }> {
  const out: Link[] = [];
  for (let from = 0; from < 60000; from += 1000) {
    const { data, error } = await supabase.from("barber_clients").select("customer_id, barber_id, visits, is_primary").eq("venue_id", venueId).order("customer_id").range(from, from + 999);
    if (error) return { rows: [], table: false };
    (data ?? []).forEach((r: any) => out.push({ customer: String(r.customer_id), barber: String(r.barber_id), visits: Number(r.visits) || 0, primary: !!r.is_primary }));
    if (!data || data.length < 1000) break;
  }
  return { rows: out, table: true };
}

const status = (c: CopilotCustomer, lastVisit: string | null): BookClient["status"] => {
  if (c.has_upcoming_booking) return "booked";
  if (c.markov_state === "X" || c.gap_ratio > 2.5) return "lapsed";
  if (c.visits <= 1) return "new";
  if (c.gap_ratio > 1.5) return "overdue";
  if (c.gap_ratio > 1.1) return "slipping";
  if (c.gap_ratio >= 0.8) return "due";
  return "ontrack";
};

let cache: { at: number; key: string; team: Team } | null = null;
export const clearTeamCache = () => { cache = null; };

export async function loadTeam(supabase: SupabaseClient, venueId: string, businessId: string, fresh = false): Promise<Team> {
  const key = `${venueId}`;
  if (!fresh && cache && cache.key === key && Date.now() - cache.at < 120_000) return cache.team;

  const [{ data: bs }, { data: st }, customers, visits, links] = await Promise.all([
    supabase.from("barbers").select("id, name, slug, role, color_from, color_to").eq("venue_id", venueId).eq("is_active", true).order("created_at"),
    supabase.from("barber_stats").select("*").eq("venue_id", venueId),
    getCustomers(supabase, venueId, businessId),
    loadVisits(supabase, venueId).catch(() => ({ rows: [] as Ev[], table: false })),
    loadLinks(supabase, venueId).catch(() => ({ rows: [] as Link[], table: false })),
  ]);
  const events = visits.rows;
  const statsBy = new Map<string, Stats>(); (st ?? []).forEach((s: any) => statsBy.set(String(s.barber_id), s));
  const barbers = bs ?? [];
  const today = todaySyd();
  const byUser = new Map<string, CopilotCustomer>(customers.map((c) => [c.user_id, c]));
  const ids = new Set(barbers.map((b: any) => String(b.id)));
  const hasVisits = events.some((e) => ids.has(e.barber));
  const hasLinks = links.rows.some((l) => ids.has(l.barber));
  const derived = hasVisits || hasLinks;
  const dataLevel: DataLevel = hasVisits ? "visits" : hasLinks ? "assignments" : "stats";
  const linkVisits = new Map<string, number>(); links.rows.forEach((l) => linkVisits.set(`${l.customer}|${l.barber}`, l.visits));

  // Dedupe same client / same day / same barber.
  const seen = new Set<string>(); const evs: Ev[] = [];
  for (const e of events) { if (e.date > today) continue; if (e.user) { const k = `${e.user}|${e.date}|${e.barber}`; if (seen.has(k)) continue; seen.add(k); } evs.push(e); }
  const byUserEv = new Map<string, Ev[]>(); for (const e of evs) { if (!e.user) continue; const a = byUserEv.get(e.user) ?? []; a.push(e); byUserEv.set(e.user, a); }
  byUserEv.forEach((a) => a.sort((x, y) => x.date.localeCompare(y.date)));
  const firstOf = new Map<string, Ev>(); byUserEv.forEach((a, u) => firstOf.set(u, a[0]));

  // Primary barber per client (most visits; ties go to the most recent).
  const primary = new Map<string, string>();
  links.rows.forEach((l) => { if (l.primary) primary.set(l.customer, l.barber); });
  if (!primary.size) byUserEv.forEach((a, u) => { const n = new Map<string, number>(); a.forEach((e) => e.barber && n.set(e.barber, (n.get(e.barber) ?? 0) + 1)); let best = "", bn = 0; n.forEach((c, b) => { if (c > bn || (c === bn && a[a.length - 1].barber === b)) { best = b; bn = c; } }); if (best) primary.set(u, best); });

  const monthKeys = Array.from({ length: 12 }, (_, i) => { const d = new Date(today + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() - (11 - i), 1); return d.toISOString().slice(0, 7); });

  const out: TeamBarber[] = barbers.map((b: any) => {
    const id = String(b.id); const stats = statsBy.get(id) ?? null;
    let metrics: BarberMetrics | null = null;
    if (derived) {
      const mine = evs.filter((e) => e.barber === id);
      const mm = new Map(monthKeys.map((m) => [m, { m, revenue: 0, visits: 0 }]));
      const dow = Array(7).fill(0) as number[];
      mine.forEach((e) => { const m = mm.get(e.date.slice(0, 7)); if (m) { m.revenue += e.rev; m.visits++; } dow[dowOf(e.date)]++; });
      const months = [...mm.values()].map((m) => ({ ...m, revenue: Math.round(m.revenue) }));
      const cut12 = addDaysIso(today, -365);
      const v12 = mine.filter((e) => e.date > cut12);
      const clientsSet = new Set(mine.filter((e) => e.user).map((e) => e.user));
      const perClient = new Map<string, number>(); mine.forEach((e) => e.user && perClient.set(e.user, (perClient.get(e.user) ?? 0) + 1));
      // Do clients come back? (visits old enough to judge)
      const matureCut = addDaysIso(today, -45); let ret = 0, retN = 0, kept = 0;
      mine.filter((e) => e.date <= matureCut).forEach((e) => {
        const a = byUserEv.get(e.user) ?? []; const next = a.find((x) => x.date > e.date); retN++;
        if (next && diffDaysIso(next.date, e.date) <= 45) { ret++; if (next.barber === id) kept++; }
      });
      let fr = 0, frN = 0; const fCut = addDaysIso(today, -60);
      firstOf.forEach((f, u) => { if (f.barber !== id || f.date > fCut) return; frN++; const a = byUserEv.get(u) ?? []; const nx = a.find((x) => x.date > f.date); if (nx && diffDaysIso(nx.date, f.date) <= 60) fr++; });
      const paid = (arr: Ev[]) => arr.filter((e) => e.rev > 0);
      const t90 = paid(mine.filter((e) => e.date > addDaysIso(today, -90))), tPrev = paid(mine.filter((e) => e.date <= addDaysIso(today, -90) && e.date > addDaysIso(today, -180)));
      const avg = (a: Ev[]) => (a.length >= 5 ? a.reduce((s, e) => s + e.rev, 0) / a.length : null);
      const wk = mine.filter((e) => e.date > addDaysIso(today, -56)).length / 8;

      const book: BookClient[] = [];
      primary.forEach((pb, u) => {
        if (pb !== id) return; const c = byUser.get(u); if (!c) return; const lastVisit = byUserEv.get(u)?.slice(-1)[0]?.date ?? c.last_visit_local;
        const st = status(c, lastVisit);
        book.push({ user_id: u, name: c.name, state: c.markov_state, visitsWithMe: perClient.get(u) ?? linkVisits.get(`${u}|${id}`) ?? 0, visits: c.visits, clv: c.clv_aud, lastVisit, daysSince: c.days_since_last_visit, gap_ratio: c.gap_ratio, avgGap: c.avg_gap_days, booked: c.has_upcoming_booking, smsOk: c.sms_status === "ok", churn: c.churn_score, status: st, atStake: st === "lapsed" || st === "booked" ? 0 : Math.round(c.clv_aud * c.churn_score), nextDue: lastVisit && c.avg_gap_days > 0 && c.visits >= 2 && !c.has_upcoming_booking ? addDaysIso(lastVisit, c.avg_gap_days) : null });
      });
      book.sort((a, b2) => b2.atStake - a.atStake || b2.clv - a.clv);
      const risk = book.filter((c) => c.status === "slipping" || c.status === "overdue");
      metrics = {
        hasVisits: mine.length > 0, months, dow, visits12m: v12.length, revenue12m: Math.round(v12.reduce((s, e) => s + e.rev, 0)), clients: clientsSet.size, regulars: [...perClient.values()].filter((n) => n >= 3).length,
        return45: retN >= 20 ? ret / retN : null, return45n: retN, keptWithMe: ret >= 10 ? kept / ret : null, firstReturn: frN >= 10 ? fr / frN : null, firstReturnN: frN,
        ticket90: avg(t90), ticketPrev90: avg(tPrev), weeklyVisits: Math.round(wk * 10) / 10,
        book: book.slice(0, 80), bookValue: Math.round(book.reduce((s, c) => s + c.clv, 0)), atRiskCount: risk.length, atRiskValue: Math.round(risk.reduce((s, c) => s + c.clv * Math.max(c.churn, 0.2), 0)),
        dueSoon: book.filter((c) => c.status === "due" || (c.nextDue && diffDaysIso(c.nextDue, today) >= -3 && diffDaysIso(c.nextDue, today) <= 7 && !c.booked)).length,
        secondVisit: book.filter((c) => c.visits === 1 && !c.booked && c.daysSince >= 14 && c.daysSince <= 60).length,
      };
    }
    return { id, name: b.name, slug: b.slug, role: b.role, color_from: b.color_from || "#7c3aed", color_to: b.color_to || "#db2777", stats, metrics };
  });

  const arr = out.map((b) => b.stats).filter(Boolean) as Stats[];
  const mean = (k: string) => (arr.length ? arr.reduce((s, b) => s + (Number(b[k]) || 0), 0) / arr.length : 0);
  const team: Team = { barbers: out, derived, dataLevel, tables: { visits: visits.table, clients: links.table }, visitCount: evs.length, linkCount: links.rows.length, shop: arr.length ? { rebook_rate: mean("rebook_rate"), avg_service_value: mean("avg_service_value"), upsell_rate: mean("upsell_rate"), avg_appt_value: mean("avg_appt_value"), total_revenue: arr.reduce((s, b) => s + (Number(b.total_revenue) || 0), 0) } : null, generated_at: new Date().toISOString() };
  cache = { at: Date.now(), key, team };
  return team;
}

export const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Plain-English facts for the AI coach. Every number the coach may quote is in here. */
export function barberFacts(b: TeamBarber, team: Team): string {
  const s = b.stats ?? {}; const m = b.metrics; const shop = team.shop; const first = b.name.split(" ")[0];
  const pct = (v: any) => `${(num(v) * 100).toFixed(1)}%`;
  const rank = (k: string) => { const sorted = [...team.barbers].filter((x) => x.stats).sort((x, y) => num(y.stats![k]) - num(x.stats![k])); const i = sorted.findIndex((x) => x.id === b.id); return i >= 0 ? `${i + 1} of ${sorted.length}` : ""; };
  const L: string[] = [`Barber: ${b.name} (${b.role ?? "barber"}) at Alkami Barbershop, Canberra`, `Team size: ${team.barbers.length}`];
  if (b.stats) L.push(
    `Total revenue: $${Math.round(num(s.total_revenue))} (rank ${rank("total_revenue")})`, `Appointments: ${num(s.total_appts)}`, `Average appointment value: $${num(s.avg_appt_value).toFixed(0)}`,
    `Average service value: $${num(s.avg_service_value).toFixed(0)} (shop average $${shop ? shop.avg_service_value.toFixed(0) : "n/a"}, rank ${rank("avg_service_value")})`,
    `Rebook rate: ${pct(s.rebook_rate)} (shop average ${shop ? pct(shop.rebook_rate) : "n/a"}, rank ${rank("rebook_rate")})`,
    `Upsell rate: ${pct(s.upsell_rate)} (shop average ${shop ? pct(shop.upsell_rate) : "n/a"})`, `Returning clients: ${pct(s.pct_returning_clients)}`, `New clients: ${pct(s.pct_new_clients)}`,
    `Rating: ${num(s.avg_rating).toFixed(2)} from ${num(s.review_count)} reviews`);
  if (m) {
    if (m.hasVisits) L.push(`Last 12 months: ${m.visits12m} visits, $${m.revenue12m} revenue`, `Active clients: ${m.clients}, of whom ${m.regulars} are regulars (3+ visits with ${first})`);
    if (m.return45 !== null) L.push(`Clients who return within 45 days of a visit: ${(m.return45 * 100).toFixed(0)}% (${m.return45n} visits measured)`);
    if (m.firstReturn !== null) L.push(`First-timers who come back within 60 days: ${(m.firstReturn * 100).toFixed(0)}% (${m.firstReturnN} measured)`);
    if (m.ticket90 !== null) L.push(`Average ticket last 90 days: $${m.ticket90.toFixed(0)}${m.ticketPrev90 !== null ? ` (previous 90 days: $${m.ticketPrev90.toFixed(0)})` : ""}`);
    L.push(`${first}'s book: ${m.book.length} clients, $${m.bookValue} lifetime value. Slipping or overdue: ${m.atRiskCount} (about $${m.atRiskValue} at risk). Due back this week: ${m.dueSoon}. One-visit clients to save: ${m.secondVisit}.`);
  } else L.push("Client lists by barber are not available yet (no visit history imported), only headline stats.");
  if (b.stats) {
    if (s.period_label) L.push(`Stats period: ${s.period_label}`);
    L.push(`Occupancy: ${pct(s.occupancy_rate)}`, `Clients who requested ${first} by name: ${pct(s.pct_requested_by_client)}`, `Booked online: ${pct(s.pct_online)}`);
    const hb = Array.isArray(s.hourly_breakdown) ? s.hourly_breakdown : [];
    if (hb.length) { const best = [...hb].sort((a: any, c: any) => num(c.gross_sales) - num(a.gross_sales))[0]; const worst = [...hb].sort((a: any, c: any) => num(a.gross_sales) - num(c.gross_sales))[0]; L.push(`Busiest hour: ${best.hour} ($${Math.round(num(best.gross_sales))} sales). Quietest hour: ${worst.hour} ($${Math.round(num(worst.gross_sales))}).`); }
  }
  return L.join("\n");
}
