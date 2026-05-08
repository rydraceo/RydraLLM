import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
 
function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
 
// GET /api/automation/rules?venue_id=xxx
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const venue_id = searchParams.get("venue_id") || process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID;
    const supabase = db();
 
    const { data: rules, error } = await supabase
      .from("intervention_rules")
      .select("*")
      .eq("venue_id", venue_id)
      .order("created_at", { ascending: true });
 
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 
    // Attach last 7-day stats from intervention_logs
    const ruleIds = (rules || []).map(r => r.id);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
 
    const { data: recentLogs } = await supabase
      .from("intervention_logs")
      .select("rule_id, status, rebooked, revenue_attributed_cents")
      .in("rule_id", ruleIds)
      .gte("created_at", sevenDaysAgo);
 
    const logsByRule: Record<string, any[]> = {};
    (recentLogs || []).forEach(l => {
      if (!logsByRule[l.rule_id]) logsByRule[l.rule_id] = [];
      logsByRule[l.rule_id].push(l);
    });
 
    const enriched = (rules || []).map(r => {
      const logs = logsByRule[r.id] || [];
      const sent7d = logs.filter(l => l.status === "sent").length;
      const rebooked7d = logs.filter(l => l.rebooked).length;
      return {
        ...r,
        stats_7d: { sent: sent7d, rebooked: rebooked7d, conversion_rate: sent7d > 0 ? rebooked7d / sent7d : 0 },
      };
    });
 
    // Overall stats
    const { data: allLogs } = await supabase
      .from("intervention_logs")
      .select("status, rebooked, revenue_attributed_cents, created_at")
      .eq("venue_id", venue_id)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
 
    const logs30d = allLogs || [];
    const stats = {
      active_rules: (rules || []).filter(r => r.is_active && !r.is_paused).length,
      sent_30d: logs30d.filter(l => l.status === "sent").length,
      rebooked_30d: logs30d.filter(l => l.rebooked).length,
      revenue_30d: logs30d.reduce((s, l) => s + (l.revenue_attributed_cents || 0), 0) / 100,
    };
 
    return NextResponse.json({ rules: enriched, stats });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
 
// POST /api/automation/rules — create a new rule
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      venue_id, name, description, target_states, min_clv_cents,
      min_days_overdue, max_days_overdue, min_gap_ratio, cooldown_days,
      max_sends_per_run, message_template, send_time, send_days, is_active,
    } = body;
 
    if (!name || !message_template || !target_states?.length) {
      return NextResponse.json({ error: "name, message_template, and target_states are required" }, { status: 400 });
    }
 
    const supabase = db();
    const { data, error } = await supabase
      .from("intervention_rules")
      .insert({
        venue_id: venue_id || process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID,
        name, description: description || null,
        target_states: target_states || [],
        min_clv_cents: min_clv_cents || 0,
        min_days_overdue: min_days_overdue || 0,
        max_days_overdue: max_days_overdue || 9999,
        min_gap_ratio: min_gap_ratio || 0,
        cooldown_days: cooldown_days ?? 21,
        max_sends_per_run: max_sends_per_run || 50,
        message_template,
        send_time: send_time || "10:00",
        send_days: send_days || ["Monday","Tuesday","Wednesday","Thursday","Friday"],
        is_active: is_active !== false,
      })
      .select()
      .single();
 
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rule: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}