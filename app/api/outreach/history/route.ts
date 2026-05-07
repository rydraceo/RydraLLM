import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
 
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const venue_id = searchParams.get("venue_id");
 
    if (!venue_id) {
      return NextResponse.json({ error: "venue_id is required" }, { status: 400 });
    }
 
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
 
    const { data, error } = await supabase
      .from("sms_outreach")
      .select("*")
      .eq("venue_id", venue_id)
      .order("sent_at", { ascending: false })
      .limit(500);
 
    if (error) {
      console.error("[Outreach API] DB error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
 
    // Calculate summary stats
    const total = data?.length || 0;
    const sent = data?.filter((r) => r.status !== "failed").length || 0;
    const failed = data?.filter((r) => r.status === "failed").length || 0;
    const totalCost = data?.reduce((sum, r) => sum + (r.cost || 0), 0) || 0;
 
    const byState: Record<string, number> = {};
    data?.forEach((r) => {
      if (r.markov_state) byState[r.markov_state] = (byState[r.markov_state] || 0) + 1;
    });
 
    return NextResponse.json({
      outreach: data || [],
      stats: { total, sent, failed, totalCost, byState },
    });
  } catch (error: any) {
    console.error("[Outreach API] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
 