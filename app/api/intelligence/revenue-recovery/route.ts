import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
 
function supabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
 
// ─── GET: Return monthly stats + recent attributions ─────────────────────────
export async function GET(req: NextRequest) {
  const db = supabase();
  const venue_id = req.nextUrl.searchParams.get("venue_id");
  if (!venue_id) return NextResponse.json({ error: "venue_id required" }, { status: 400 });
 
  try {
    // Monthly summary (last 12 months)
    const { data: monthly } = await db
      .from("rydra_attributions")
      .select("attribution_month, visit_value, sms_cost, visit_date")
      .eq("venue_id", venue_id)
      .order("attribution_month", { ascending: false });
 
    // Recent attributed rebookings (last 20)
    const { data: recent } = await db
      .from("rydra_attributions")
      .select("*")
      .eq("venue_id", venue_id)
      .not("visit_date", "is", null)
      .order("visit_date", { ascending: false })
      .limit(20);
 
    // Group monthly
    const monthMap: Record<string, {
      month: string; contacted: number; rebooked: number;
      recovered: number; cost: number;
    }> = {};
 
    for (const row of (monthly || [])) {
      const m = row.attribution_month;
      if (!monthMap[m]) monthMap[m] = { month: m, contacted: 0, rebooked: 0, recovered: 0, cost: 0 };
      monthMap[m].contacted++;
      monthMap[m].cost += Number(row.sms_cost || 0.08);
      if (row.visit_date) {
        monthMap[m].rebooked++;
        monthMap[m].recovered += Number(row.visit_value || 0);
      }
    }
 
    const monthlyStats = Object.values(monthMap)
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 6)
      .map(m => ({
        ...m,
        conversion_rate: m.contacted > 0 ? Math.round(m.rebooked / m.contacted * 100) : 0,
        roi_pct: m.cost > 0 ? Math.round((m.recovered - m.cost) / m.cost * 100) : 0,
        label: new Date(m.month).toLocaleDateString("en-AU", { month: "short", year: "2-digit" }),
      }));
 
    const thisMonth = monthlyStats[0] || { contacted: 0, rebooked: 0, recovered: 0, cost: 0, conversion_rate: 0, roi_pct: 0 };
 
    // Totals all-time
    const allTime = (monthly || []).reduce((acc, row) => ({
      contacted: acc.contacted + 1,
      rebooked: acc.rebooked + (row.visit_date ? 1 : 0),
      recovered: acc.recovered + Number(row.visit_value || 0),
      cost: acc.cost + Number(row.sms_cost || 0.08),
    }), { contacted: 0, rebooked: 0, recovered: 0, cost: 0 });
 
    return NextResponse.json({
      this_month: thisMonth,
      all_time: {
        ...allTime,
        conversion_rate: allTime.contacted > 0 ? Math.round(allTime.rebooked / allTime.contacted * 100) : 0,
        roi_pct: allTime.cost > 0 ? Math.round((allTime.recovered - allTime.cost) / allTime.cost * 100) : 0,
        avg_clv: allTime.rebooked > 0 ? Math.round(allTime.recovered / allTime.rebooked) : 0,
      },
      monthly_trend: monthlyStats.reverse(), // oldest first for chart
      recent_attributions: (recent || []).slice(0, 10),
      needs_attribution_run: (monthly || []).length === 0,
    });
 
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
 
// ─── POST: Run attribution job ─────────────────────────────────────────────────
// Scans sms_outreach + customer_events and writes rydra_attributions records.
// Call this nightly or on-demand from the dashboard.
export async function POST(req: NextRequest) {
  const db = supabase();
  const { venue_id, window_days = 60 } = await req.json();
  if (!venue_id) return NextResponse.json({ error: "venue_id required" }, { status: 400 });
 
  const start = Date.now();
 
  try {
    // 1. Fetch all delivered SMSes for this venue (last 180 days)
    const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    const { data: smses, error: smsErr } = await db
      .from("sms_outreach")
      .select("id, customer_id, customer_name, customer_phone, markov_state, created_at, message_cost, source, rule_name")
      .eq("venue_id", venue_id)
      .in("status", ["delivered", "queued", "sent"])
      .gte("created_at", since);
 
    if (smsErr) throw smsErr;
    if (!smses?.length) return NextResponse.json({ attributed: 0, elapsed_ms: Date.now() - start });
 
    // 2. Fetch customer events for the same period (visits with revenue)
    const customerIds = [...new Set(smses.map(s => s.customer_id))];
 
    // Fetch in batches of 100 to avoid URL length limits
    const batchSize = 100;
    let allEvents: any[] = [];
    for (let i = 0; i < customerIds.length; i += batchSize) {
      const batch = customerIds.slice(i, i + batchSize);
      const { data: evts } = await db
        .from("customer_events")
        .select("user_id, date, revenue")
        .in("user_id", batch)
        .gte("date", since)
        .gt("revenue", 0);
      allEvents = allEvents.concat(evts || []);
    }
 
    // 3. Build event lookup: customer_id → sorted visits
    const eventsByCustomer: Record<string, { date: Date; revenue: number }[]> = {};
    for (const evt of allEvents) {
      const cid = String(evt.user_id);
      if (!eventsByCustomer[cid]) eventsByCustomer[cid] = [];
      eventsByCustomer[cid].push({ date: new Date(evt.date), revenue: Number(evt.revenue) });
    }
    for (const cid in eventsByCustomer) {
      eventsByCustomer[cid].sort((a, b) => a.date.getTime() - b.date.getTime());
    }
 
    // 4. Attribution: for each SMS, find the first visit within window_days
    const attributions: any[] = [];
    for (const sms of smses) {
      const sentAt = new Date(sms.created_at);
      const windowEnd = new Date(sentAt.getTime() + window_days * 86400_000);
      const cid = String(sms.customer_id);
      const events = eventsByCustomer[cid] || [];
 
      const matchedVisit = events.find(e => e.date > sentAt && e.date <= windowEnd);
 
      attributions.push({
        venue_id,
        sms_id: String(sms.id),
        sms_source: sms.source || "manual",
        rule_name: sms.rule_name || null,
        customer_id: cid,
        customer_name: sms.customer_name || null,
        customer_phone: sms.customer_phone || null,
        markov_state: sms.markov_state || null,
        sms_sent_at: sms.created_at,
        sms_cost: Number(sms.message_cost || 0.08),
        visit_date: matchedVisit?.date.toISOString() || null,
        visit_value: matchedVisit?.revenue || 0,
        days_to_rebook: matchedVisit
          ? Math.round((matchedVisit.date.getTime() - sentAt.getTime()) / 86400_000)
          : null,
        attribution_month: new Date(sentAt.getFullYear(), sentAt.getMonth(), 1)
          .toISOString().split("T")[0],
      });
    }
 
    // 5. Upsert attributions
    const { error: upsertErr } = await db
      .from("rydra_attributions")
      .upsert(attributions, {
        onConflict: "sms_id,customer_id,visit_date",
        ignoreDuplicates: false,
      });
 
    if (upsertErr) throw upsertErr;
 
    const attributed = attributions.filter(a => a.visit_date).length;
    const totalRecovered = attributions
      .filter(a => a.visit_value > 0)
      .reduce((s, a) => s + a.visit_value, 0);
 
    return NextResponse.json({
      processed: smses.length,
      attributed,
      total_recovered: totalRecovered,
      elapsed_ms: Date.now() - start,
    });
 
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}