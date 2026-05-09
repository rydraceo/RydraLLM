import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
 
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const venue_id = searchParams.get("venue_id") || process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID;
 
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
 
    // Query sms_outreach (manual sends from dashboard/clients/campaign)
    const { data: manualSends, error: manualError } = await supabase
      .from("sms_outreach")
      .select("*")
      .eq("venue_id", venue_id)
      .order("created_at", { ascending: false })
      .limit(500);
 
    if (manualError) {
      console.error("[outreach/history] sms_outreach error:", manualError.message);
    }
 
    // Query intervention_logs (autopilot sends)
    const { data: autoSends, error: autoError } = await supabase
      .from("intervention_logs")
      .select("*")
      .eq("venue_id", venue_id)
      .in("status", ["sent", "failed", "dry_run"])
      .order("created_at", { ascending: false })
      .limit(500);
 
    if (autoError) {
      console.error("[outreach/history] intervention_logs error:", autoError.message);
    }
 
    // Normalise manual sends
    const normalised: any[] = [];
 
    for (const m of manualSends || []) {
      normalised.push({
        id: m.id,
        source: "manual",
        source_label: "Manual",
        customer_id: m.customer_id || null,
        customer_name: m.customer_name || "Unknown",
        customer_phone: m.customer_phone || m.to_number || "",
        message: m.message || m.body || "",
        status: m.status || "queued",
        markov_state: m.markov_state || null,
        gap_ratio: m.gap_ratio ? Number(m.gap_ratio) : null,
        days_overdue: m.days_overdue ? Number(m.days_overdue) : null,
        message_cost: m.message_cost || m.cost || "0.08",
        created_at: m.created_at,
        rule_name: null,
      });
    }
 
    // Normalise autopilot sends
    for (const l of autoSends || []) {
      normalised.push({
        id: l.id,
        source: "autopilot",
        source_label: l.rule_name || "Autopilot",
        customer_id: l.customer_id || null,
        customer_name: l.customer_name || "Unknown",
        customer_phone: l.customer_phone || "",
        message: l.message_sent || "",
        status: l.status === "sent" ? "delivered" : l.status,
        markov_state: l.markov_state || null,
        gap_ratio: l.gap_ratio ? Number(l.gap_ratio) : null,
        days_overdue: l.days_overdue ? Number(l.days_overdue) : null,
        message_cost: l.sms_cost_cents ? (l.sms_cost_cents / 100).toFixed(2) : "0.08",
        created_at: l.created_at,
        rule_name: l.rule_name || null,
      });
    }
 
    // Sort merged by date desc
    normalised.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
 
    const totalCost = normalised.reduce((s, m) => s + parseFloat(m.message_cost || "0"), 0);
    const delivered = normalised.filter(m => ["delivered","queued","sent"].includes(m.status)).length;
    const failed    = normalised.filter(m => m.status === "failed").length;
    const autoCount = normalised.filter(m => m.source === "autopilot").length;
    const manCount  = normalised.filter(m => m.source === "manual").length;
 
    return NextResponse.json({
      messages: normalised,
      stats: {
        total: normalised.length,
        delivered,
        failed,
        total_cost: totalCost,
        autopilot: autoCount,
        manual: manCount,
      },
    });
  } catch (err: any) {
    console.error("[outreach/history] unexpected error:", err);
    return NextResponse.json({ messages: [], stats: {}, error: err.message }, { status: 500 });
  }
}