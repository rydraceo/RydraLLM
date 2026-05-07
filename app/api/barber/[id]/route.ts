import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
 
// Next.js 15: params is a Promise — must be awaited
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: slug } = await context.params;
 
    const { searchParams } = new URL(request.url);
    const venue_id =
      searchParams.get("venue_id") ||
      process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID ||
      "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
 
    // Query 1: barber by slug
    const { data: barber, error: barberError } = await supabase
      .from("barbers")
      .select("id, name, slug, role, color_from, color_to")
      .eq("slug", slug)
      .maybeSingle();
 
    if (barberError) {
      return NextResponse.json({ error: barberError.message }, { status: 500 });
    }
    if (!barber) {
      return NextResponse.json({ error: "Barber not found", slug }, { status: 404 });
    }
 
    // Query 2: stats (separate — no FK join required)
    const { data: stats } = await supabase
      .from("barber_stats")
      .select("*")
      .eq("barber_id", barber.id)
      .maybeSingle();
 
    // Query 3: all stats for shop averages
    const { data: allStats } = await supabase
      .from("barber_stats")
      .select("rebook_rate, avg_service_value, upsell_rate, avg_appt_value, total_revenue");
 
    const v = (allStats || []).filter(Boolean);
    const shopAvg = v.length > 0 ? {
      rebook_rate: v.reduce((s, b) => s + (b.rebook_rate || 0), 0) / v.length,
      avg_service_value: v.reduce((s, b) => s + (b.avg_service_value || 0), 0) / v.length,
      upsell_rate: v.reduce((s, b) => s + (b.upsell_rate || 0), 0) / v.length,
      avg_appt_value: v.reduce((s, b) => s + (b.avg_appt_value || 0), 0) / v.length,
      total_revenue: v.reduce((s, b) => s + (b.total_revenue || 0), 0),
    } : null;
 
    const opportunities: any[] = [];
    if (stats) {
      const sr = shopAvg?.rebook_rate || 0.175;
      const ss = shopAvg?.avg_service_value || 70;
      if (stats.rebook_rate < 0.12) opportunities.push({ type: "rebooking", severity: "critical", label: "Low Rebook Rate", detail: `${(stats.rebook_rate * 100).toFixed(1)}% vs ${(sr * 100).toFixed(1)}% avg`, potential_extra_revenue: Math.round((stats.total_clients * 0.18 - stats.rebooked_clients) * stats.avg_appt_value * 0.6) });
      else if (stats.rebook_rate < 0.20) opportunities.push({ type: "rebooking", severity: "warning", label: "Below-Average Rebook Rate", detail: `${(stats.rebook_rate * 100).toFixed(1)}%`, potential_extra_revenue: Math.round((stats.total_clients * 0.22 - stats.rebooked_clients) * stats.avg_appt_value * 0.6) });
      if (stats.avg_service_value < ss * 0.85) opportunities.push({ type: "upsell", severity: "warning", label: "Low Avg Service Value", detail: `$${stats.avg_service_value.toFixed(0)} vs $${ss.toFixed(0)} avg`, potential_extra_revenue: Math.round((ss - stats.avg_service_value) * stats.total_appts * 0.5) });
      if (stats.upsell_rate < 0.02) opportunities.push({ type: "upsell", severity: "warning", label: "Low Upsell Rate", detail: `${(stats.upsell_rate * 100).toFixed(1)}%`, potential_extra_revenue: Math.round(stats.total_appts * 0.15 * 25 * 0.6) });
      if ((stats.pct_returning_clients || 0) < 0.18) opportunities.push({ type: "loyalty", severity: "info", label: "Low Returning Client Rate", detail: `${((stats.pct_returning_clients || 0) * 100).toFixed(1)}%`, potential_extra_revenue: Math.round((stats.total_clients || 0) * 0.05 * (stats.avg_appt_value || 70) * 0.6) });
    }
 
    return NextResponse.json({
      barber: { id: barber.id, name: barber.name, slug: barber.slug, role: barber.role, color_from: barber.color_from || "#7c3aed", color_to: barber.color_to || "#db2777" },
      stats: stats || null,
      shop_avg: shopAvg,
      opportunities,
    });
  } catch (error: any) {
    console.error("[Barber API]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}