import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomers } from "@/lib/ai/customers";
import { dowOf } from "@/lib/forecast/demand";
import { addDaysIso, diffDaysIso, todaySyd, gapTrend } from "@/lib/clients/insights";

// Everything we know about one client, assembled defensively: the event and SMS tables have used
// different column names over time, so we read whichever is present rather than failing.
const dayOf = (v: any): string | null => {
  if (!v) return null; const t = Date.parse(String(v)); if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
};
const hourOf = (v: any): number | null => {
  const s = String(v ?? ""); if (s.length <= 10 || !/\d{2}:\d{2}/.test(s)) return null; const t = Date.parse(s); if (!Number.isFinite(t)) return null;
  return Number(new Date(t).toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Australia/Sydney" }));
};

export async function loadClient(supabase: SupabaseClient, venueId: string, businessId: string, userId: string) {
  const all = await getCustomers(supabase, venueId, businessId);
  const me = all.find((c) => c.user_id === userId);
  if (!me) return null;

  // Contact details (owner-only page): same RPC the list uses, filtered to one client.
  let phone: string | null = null, email: string | null = null;
  try {
    const { data } = await supabase.rpc("get_customers_with_scores", { p_venue_id: venueId }).eq("user_id", userId).limit(1);
    const r: any = (data ?? [])[0]; phone = r?.customer_phone ?? null; email = r?.customer_email ?? null;
  } catch {}

  // Visit history: barber_visits (imported from Fresha), else the events table.
  const barbers = new Map<string, string>();
  try { const { data } = await supabase.from("barbers").select("id, name").eq("venue_id", venueId); (data ?? []).forEach((b: any) => barbers.set(String(b.id), b.name)); } catch {}
  let evRows: any[] = [];
  { const { data, error } = await supabase.from("barber_visits").select("visit_date, status, revenue_cents, barber_id, service").eq("venue_id", venueId).eq("customer_id", userId).order("visit_date", { ascending: true }).limit(500);
    if (!error && data?.length) evRows = data.map((v: any) => ({ event_date: v.visit_date, event_type: v.status === "completed" ? (v.service || "appointment") : v.status, revenue_cents: v.revenue_cents, barber_id: v.barber_id })); }
  if (!evRows.length) { const { data, error } = await supabase.from("events").select("occurred_at, appointment_datetime, event_type, barber_id").eq("venue_id", venueId).eq("user_id", userId).limit(300);
    if (!error && data?.length) evRows = data.map((v: any) => ({ event_date: v.appointment_datetime ?? v.occurred_at, event_type: v.event_type, revenue_cents: 0, barber_id: v.barber_id })); }

  const today = todaySyd();
  const norm = evRows.map((e) => {
    const raw = e.event_date ?? e.date ?? e.starts_at ?? e.created_at;
    const rev = e.revenue_cents != null ? Number(e.revenue_cents) / 100 : Number(e.revenue ?? e.amount ?? 0) || 0;
    return { date: dayOf(raw), hour: hourOf(raw), type: String(e.event_type ?? e.type ?? "appointment"), revenue: rev, barber: e.barber_id ? barbers.get(String(e.barber_id)) ?? null : null };
  }).filter((e) => e.date) as { date: string; hour: number | null; type: string; revenue: number; barber: string | null }[];
  norm.sort((a, b) => a.date.localeCompare(b.date));
  const isMiss = (t: string) => /cancel|no.?show/i.test(t);
  const noShows = norm.filter((e) => /no.?show/i.test(e.type)).length;
  const cancels = norm.filter((e) => /cancel/i.test(e.type)).length;
  const done = norm.filter((e) => !isMiss(e.type) && e.date <= today);
  const dedup: typeof done = []; for (const e of done) if (!dedup.length || dedup[dedup.length - 1].date !== e.date) dedup.push(e);
  const gaps = dedup.slice(1).map((e, i) => diffDaysIso(e.date, dedup[i].date)).filter((g) => g > 0);

  // SMS history + what happened after each text
  let sms: any[] = [];
  { const { data, error } = await supabase.from("sms_outreach").select("*").eq("customer_id", userId).limit(60); if (!error) sms = data ?? []; }
  const upcoming = me.has_upcoming_booking ? me.last_visit_local : null;
  const outreach = sms.map((o) => {
    const sentDay = dayOf(o.sent_at ?? o.created_at); const failed = String(o.status ?? "").toLowerCase() === "failed";
    let days: number | null = null;
    if (sentDay && !failed) {
      const next = dedup.find((e) => e.date > sentDay) ?? null;
      const nd = next ? next.date : upcoming && upcoming > sentDay ? upcoming : null;
      if (nd) { const d = diffDaysIso(nd, sentDay); if (d <= 28) days = d; }
    }
    return { id: o.id, message: o.message, status: o.status, sent_at: o.sent_at ?? o.created_at, cost: Number(o.cost ?? o.message_cost ?? 0) || 0, markov_state: o.markov_state ?? null, rebooked_in_days: days, failed };
  }).sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)));

  // Habits
  const dow = Array(7).fill(0) as number[]; const hrs = { morning: 0, midday: 0, afternoon: 0, evening: 0 }; let hasHours = false;
  dedup.forEach((e) => { dow[dowOf(e.date)]++; if (e.hour !== null) { hasHours = true; if (e.hour < 11) hrs.morning++; else if (e.hour < 14) hrs.midday++; else if (e.hour < 17) hrs.afternoon++; else hrs.evening++; } });
  const bc = new Map<string, number>(); dedup.forEach((e) => e.barber && bc.set(e.barber, (bc.get(e.barber) ?? 0) + 1));
  const bTotal = [...bc.values()].reduce((a, b) => a + b, 0);
  const barberList = [...bc.entries()].map(([name, visits]) => ({ name, visits, share: bTotal ? visits / bTotal : 0 })).sort((a, b) => b.visits - a.visits);

  const paid = dedup.filter((e) => e.revenue > 0);
  const avgTicket = paid.length ? paid.reduce((s, e) => s + e.revenue, 0) / paid.length : me.visits ? me.clv_aud / me.visits : 0;
  const rec = paid.slice(-3), pri = paid.slice(0, -3);
  const ticketDelta = rec.length && pri.length ? rec.reduce((s, e) => s + e.revenue, 0) / rec.length - pri.reduce((s, e) => s + e.revenue, 0) / pri.length : null;
  const avgGap = gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : me.avg_gap_days;
  const lastPast = dedup.length ? dedup[dedup.length - 1].date : (!me.has_upcoming_booking ? me.last_visit_local : null);
  const nextDue = upcoming ?? (lastPast && avgGap > 0 && me.visits >= 2 ? addDaysIso(lastPast, avgGap) : null);
  const ranked = [...all].filter((c) => c.clv_aud > 0).sort((a, b) => b.clv_aud - a.clv_aud);
  const rank = ranked.findIndex((c) => c.user_id === userId) + 1;
  const first = dedup[0]?.date ?? null;

  return {
    me, contact: { phone, email },
    events: [...norm].reverse().slice(0, 80), outreach, gaps,
    trend: gapTrend(gaps),
    habits: { dow, hours: hasHours ? hrs : null, favDay: dow.some(Boolean) ? dow.indexOf(Math.max(...dow)) : null },
    barbers: barberList,
    stats: {
      avgTicket: Math.round(avgTicket * 100) / 100, ticketDelta: ticketDelta === null ? null : Math.round(ticketDelta * 100) / 100, avgGap, noShows, cancels,
      firstVisit: first, tenureDays: first ? diffDaysIso(today, first) : null, nextDue, daysToDue: nextDue ? diffDaysIso(nextDue, today) : null,
      annualValue: avgGap > 0 ? Math.round(avgTicket * (365 / avgGap)) : null, ltvRank: rank || null, of: ranked.length,
      percentile: rank && ranked.length ? Math.max(1, Math.round((rank / ranked.length) * 100)) : null,
    },
  };
}
export type ClientDetail = NonNullable<Awaited<ReturnType<typeof loadClient>>>;

export function factsOf(d: ClientDetail): string {
  const c = d.me, s = d.stats, last = d.outreach[0];
  return [
    `Name: ${c.name}`, `Visits: ${c.visits}`, `Lifetime spend: $${Math.round(c.clv_aud)}`, `Typical spend per visit: $${Math.round(s.avgTicket)}`,
    `Usual gap between visits: ${s.avgGap} days`, `Days since last visit: ${c.days_since_last_visit}`, `Gap ratio: ${c.gap_ratio}`,
    `Chance they stop coming: ${Math.round(c.churn_score * 100)}%`, c.has_upcoming_booking ? `Already booked for ${c.last_visit_local}` : "No booking in the diary",
    d.habits.favDay !== null ? `Usually comes on ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.habits.favDay]}s` : "", d.barbers[0] ? `Usually sees ${d.barbers[0].name} (${Math.round(d.barbers[0].share * 100)}% of visits)` : "",
    d.trend ? `Rhythm: ${d.trend.label}` : "", s.noShows || s.cancels ? `No-shows: ${s.noShows}, cancellations: ${s.cancels}` : "",
    s.ltvRank ? `Spend rank: ${s.ltvRank} of ${s.of}` : "", last ? `Last text: ${new Date(last.sent_at).toLocaleDateString("en-AU")}${last.rebooked_in_days !== null ? `, they came back ${last.rebooked_in_days} days later` : ", no visit since"}` : "Never texted",
    `Texts sent: ${d.outreach.filter((o) => !o.failed).length}`, `SMS status: ${c.sms_status}`,
  ].filter(Boolean).join("\n");
}

export type Brief = { headline: string; points: string[]; move: string; why: string; source: "ai" | "data" };

export function dataBrief(d: ClientDetail): Brief {
  const c = d.me, s = d.stats; const first = c.name.split(" ")[0];
  const points: string[] = [];
  points.push(`${first} has been in ${c.visits} time${c.visits === 1 ? "" : "s"} and spent $${Math.round(c.clv_aud)} in total, about $${Math.round(s.avgTicket)} a visit.`);
  if (s.avgGap > 0 && c.visits >= 2) points.push(`They usually come every ${s.avgGap} days. It has been ${c.days_since_last_visit}.`);
  if (d.trend) points.push(d.trend.label + ".");
  if (d.barbers[0]) points.push(`Usually sees ${d.barbers[0].name}.`);
  let headline = "", move = "", why = "";
  if (c.has_upcoming_booking) { headline = `${first} is booked in.`; move = "No text needed."; why = "They are already in the diary. A message now adds nothing."; }
  else if (c.visits <= 1) { headline = `${first} has only been once.`; move = "Send a friendly rebook nudge."; why = "The second visit decides whether this becomes a regular."; }
  else if (c.markov_state === "X") { headline = `${first} has gone quiet for a long time.`; move = "Send a personal win-back text."; why = `They were worth $${Math.round(c.clv_aud)} to the shop, so they're worth one text.`; }
  else if (c.gap_ratio > 1.1) { headline = `${first} is running late for a cut.`; move = "Send a gentle reminder this week."; why = `They are past their usual ${s.avgGap}-day rhythm.`; }
  else { headline = `${first} is on track.`; move = "Nothing to do right now."; why = "They are inside their usual rhythm. Leave them be."; }
  return { headline, points: points.slice(0, 4), move, why, source: "data" };
}
