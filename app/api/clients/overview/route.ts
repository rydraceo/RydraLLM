import { NextRequest, NextResponse } from "next/server";
import { getCustomers } from "@/lib/ai/customers";
import { computeOutreach } from "@/lib/outreach/data";
import { dowOf } from "@/lib/forecast/demand";
import { ticketOf } from "@/lib/campaigns/model";
import { addDaysIso, diffDaysIso, todaySyd, enrich, type ClientRow } from "@/lib/clients/insights";
import { guard, env, db } from "@/lib/campaigns/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// One enriched row per client for the Clients page. No full phone numbers or emails leave the server here.
export async function GET(req: NextRequest) {
  const g = guard(req); if (g) return g;
  const e = env(); if (!e) return NextResponse.json({ error: "Server misconfigured: ALKAMI_VENUE_ID or ALKAMI_BUSINESS_ID missing." }, { status: 503 });
  try {
    const supabase = db();
    const [rows, out] = await Promise.all([getCustomers(supabase, e.venueId, e.businessId), computeOutreach(supabase, e.venueId, e.businessId)]);
    const cooling = new Set(out.overview.queue.filter((q) => q.cooling_down).map((q) => q.user_id));
    const today = todaySyd();
    const base = rows.map((c) => {
      const lastPast = !c.has_upcoming_booking && c.last_visit_local ? c.last_visit_local : null;
      const nextDue = c.has_upcoming_booking ? c.last_visit_local : lastPast && c.avg_gap_days > 0 && c.visits >= 2 ? addDaysIso(lastPast, c.avg_gap_days) : null;
      const row: Omit<ClientRow, "tier"> = {
        user_id: c.user_id, name: c.name, state: c.markov_state, clv: c.clv_aud, visits: c.visits, churn: c.churn_score, daysSince: c.days_since_last_visit,
        habitDow: c.last_visit_local ? dowOf(c.last_visit_local) : null, smsOk: c.sms_status === "ok", cooling: cooling.has(c.user_id), booked: c.has_upcoming_booking,
        ticket: ticketOf(c.clv_aud, c.visits), gap_ratio: c.gap_ratio, avgGap: c.avg_gap_days, lastVisit: c.last_visit_local, nextDue,
        daysToDue: nextDue ? diffDaysIso(nextDue, today) : null, phoneLast4: c.phone_last4, smsStatus: c.sms_status,
        at_stake: c.markov_state === "X" ? 0 : Math.round(c.clv_aud * c.churn_score), returnOdds: Math.round((1 - c.churn_score) * 100),
      };
      return row;
    });
    const cfg = out.overview.config;
    return NextResponse.json({ clients: enrich(base), config: { copy_max: cfg.copy_max, body_max: cfg.body_max, booking_link: cfg.booking_link }, remaining_today: Math.max(0, out.overview.stats.remaining_today), generated_at: new Date().toISOString() });
  } catch (err: any) {
    console.error("[clients/overview]", err);
    return NextResponse.json({ error: "Could not load clients." }, { status: 500 });
  }
}
