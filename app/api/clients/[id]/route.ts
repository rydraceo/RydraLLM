import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
 
const CONVERSION_RATES: Record<string, { natural: number; sms: number }> = {
  C:          { natural: 0.25, sms: 0.45 },
  X:          { natural: 0.03, sms: 0.15 },
  R_at_risk:  { natural: 0.15, sms: 0.35 },
  R_on_fence: { natural: 0.40, sms: 0.55 },
  R_loyal:    { natural: 0.65, sms: 0.70 },
};
 
// Markov P^3 churn probabilities per state
const CHURN_P3: Record<string, number> = {
  C: 0.442, R_loyal: 0.0785, R_on_fence: 0.2295, R_at_risk: 0.5765, X: 1.0,
};
 
function deriveMarkovState(visits: number, gap_ratio: number, state: string): string {
  if (visits <= 1) return "C";
  if (gap_ratio > 2.5 || state === "X") return "X";
  if (gap_ratio > 1.3) return "R_at_risk";
  if (gap_ratio > 1.0) return "R_on_fence";
  return "R_loyal";
}
 
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userId } = await context.params;
    const { searchParams } = new URL(request.url);
    const venue_id = searchParams.get("venue_id") ||
      process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID ||
      "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
 
    // ── Use the RPC to get the real customer name + all score data ────────────
    // This is the same source as the client list, so names always match
    const { data: rpcRows, error: rpcError } = await supabase
      .rpc("get_customers_with_scores", { p_venue_id: venue_id })
      .eq("user_id", userId)
      .limit(1);
 
    if (rpcError) {
      console.error("[ClientAPI] RPC error:", rpcError.message);
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }
 
    const row = (rpcRows || [])[0];
    if (!row) {
      return NextResponse.json({ error: "Client not found", user_id: userId }, { status: 404 });
    }
 
    // ── Derived fields ────────────────────────────────────────────────────────
    const visits     = Number(row.total_visits) || 0;
    const gap_ratio  = parseFloat((Number(row.gap_ratio) || 0).toFixed(2));
    const clv_cents  = Number(row.clv_cents) || 0;
    const clv        = clv_cents / 100;
    const state      = row.current_state || "R";
    const markov_state = deriveMarkovState(visits, gap_ratio, state);
 
    const db_churn = row.churn_score_10;
    const churn_score = db_churn != null && Number(db_churn) > 0
      ? Number(db_churn)
      : CHURN_P3[markov_state] ?? 0.23;
 
    const rates = CONVERSION_RATES[markov_state] ?? CONVERSION_RATES.R_on_fence;
    const db_iv = row.intervention_value_cents;
    const intervention_value = db_iv != null
      ? Number(db_iv) / 100
      : Math.max(clv * (rates.sms - rates.natural) - 0.08, 0);
 
    const loyalty_score = row.loyalty_score ? Number(row.loyalty_score) : 0;
 
    // ── Outreach history ──────────────────────────────────────────────────────
    const { data: outreach } = await supabase
      .from("sms_outreach")
      .select("id, message, status, markov_state, created_at, message_cost")
      .eq("customer_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
 
    // ── Visit / event history ─────────────────────────────────────────────────
    const { data: events } = await supabase
      .from("customer_events")
      .select("event_date, event_type, revenue_cents, barber_id")
      .eq("user_id", userId)
      .eq("venue_id", venue_id)
      .order("event_date", { ascending: false })
      .limit(50);
 
    // ── Visit gap analysis ────────────────────────────────────────────────────
    const sortedEvents = [...(events || [])].sort(
      (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
    );
    const gaps: number[] = [];
    for (let i = 1; i < sortedEvents.length; i++) {
      const d1 = new Date(sortedEvents[i - 1].event_date).getTime();
      const d2 = new Date(sortedEvents[i].event_date).getTime();
      gaps.push(Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
    }
    const avgGap = gaps.length > 0 ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : Number(row.avg_visit_gap_days) || 0;
    const minGap = gaps.length > 0 ? Math.min(...gaps) : 0;
    const maxGap = gaps.length > 0 ? Math.max(...gaps) : 0;
 
    // ── Revenue stats ─────────────────────────────────────────────────────────
    const totalRevenue = (events || []).reduce((s, e) => s + (Number(e.revenue_cents) || 0), 0) / 100;
    const avgRevPerVisit = visits > 0 ? totalRevenue / visits : 0;
 
    // ── Day of week preference ─────────────────────────────────────────────────
    const dayCount: Record<string, number> = {};
    (events || []).forEach(e => {
      const day = new Date(e.event_date).toLocaleDateString("en-AU", { weekday: "long" });
      dayCount[day] = (dayCount[day] || 0) + 1;
    });
    const favDay = Object.entries(dayCount).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
 
    return NextResponse.json({
      customer: {
        user_id:            userId,
        name:               row.customer_name || "Unknown Customer",
        phone:              row.customer_phone || null,
        email:              row.customer_email || null,
        total_visits:       visits,
        gap_ratio,
        days_overdue:       Number(row.days_since_last_visit) || 0,
        avg_gap_days:       avgGap,
        min_gap_days:       minGap,
        max_gap_days:       maxGap,
        last_visit:         row.last_event_at || null,
        clv,
        total_revenue:      totalRevenue,
        avg_rev_per_visit:  parseFloat(avgRevPerVisit.toFixed(2)),
        churn_score,
        loyalty_score,
        risk_segment:       row.risk_segment || "Unknown",
        markov_state,
        intervention_value: parseFloat(intervention_value.toFixed(2)),
        intervention_lift:  parseFloat((rates.sms - rates.natural).toFixed(2)),
        natural_rebook:     rates.natural,
        sms_rebook:         rates.sms,
        current_state:      state,
        fav_day:            favDay,
        gaps,
      },
      outreach: (outreach || []).map(o => ({
        id:          o.id,
        message:     o.message,
        status:      o.status,
        markov_state: o.markov_state,
        sent_at:     o.created_at,
        cost:        o.message_cost,
      })),
      events: (events || []).map(e => ({
        date:    e.event_date,
        type:    e.event_type,
        revenue: (Number(e.revenue_cents) || 0) / 100,
      })),
    });
  } catch (error: any) {
    console.error("[ClientAPI] Unexpected:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}