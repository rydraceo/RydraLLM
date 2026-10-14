import { NextRequest, NextResponse } from "next/server";
import { getCustomers } from "@/lib/ai/customers";
import { computeOutreach } from "@/lib/outreach/data";
import { dowOf } from "@/lib/forecast/demand";
import { ticketOf, type Person } from "@/lib/campaigns/model";
import { guard, env, db } from "@/lib/campaigns/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// Everything the Studio needs to plan locally: one row per client (no phone numbers), plus today's allowance.
export async function GET(req: NextRequest) {
  const g = guard(req); if (g) return g;
  const e = env(); if (!e) return NextResponse.json({ error: "Server misconfigured: ALKAMI_VENUE_ID or ALKAMI_BUSINESS_ID missing." }, { status: 503 });
  try {
    const supabase = db();
    const [rows, out] = await Promise.all([getCustomers(supabase, e.venueId, e.businessId), computeOutreach(supabase, e.venueId, e.businessId)]);
    const cooling = new Set(out.overview.queue.filter((q) => q.cooling_down).map((q) => q.user_id));
    const people: Person[] = rows.map((c) => ({
      user_id: c.user_id, name: c.name, state: c.markov_state, clv: c.clv_aud, visits: c.visits, churn: c.churn_score,
      daysSince: c.days_since_last_visit, habitDow: c.last_visit_local ? dowOf(c.last_visit_local) : null,
      smsOk: c.sms_status === "ok", cooling: cooling.has(c.user_id), booked: c.has_upcoming_booking, ticket: ticketOf(c.clv_aud, c.visits),
    }));
    const cfg = out.overview.config;
    return NextResponse.json({
      people, remaining_today: Math.max(0, out.overview.stats.remaining_today), daily_cap: cfg.daily_cap, cooldown_days: cfg.cooldown_days,
      body_max: cfg.body_max, copy_max: cfg.copy_max, booking_link: cfg.booking_link,
    });
  } catch (err: any) {
    console.error("[campaigns/people]", err);
    return NextResponse.json({ error: "Could not load clients." }, { status: 500 });
  }
}
