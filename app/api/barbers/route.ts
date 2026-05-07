import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
 
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const venue_id =
      searchParams.get("venue_id") ||
      process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID ||
      "e1a6c15d-8ccc-4f58-aefb-8bea46e39918";
 
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
 
    // Query 1: all barbers (no join — works without FK)
    const { data: barbersRaw, error: barbersError } = await supabase
      .from("barbers")
      .select("id, name, slug, role, color_from, color_to, venue_id, is_active")
      .eq("venue_id", venue_id)
      .eq("is_active", true)
      .order("created_at");
 
    if (barbersError) {
      console.error("[Barbers API] Error:", barbersError.message);
      return NextResponse.json({ error: barbersError.message }, { status: 500 });
    }
 
    const barbersList = barbersRaw || [];
 
    // Query 2: all stats (separate query)
    const { data: allStats } = await supabase
      .from("barber_stats")
      .select("*")
      .eq("venue_id", venue_id);
 
    const statsMap: Record<string, any> = {};
    (allStats || []).forEach(s => { statsMap[s.barber_id] = s; });
 
    // Merge in JS — no FK needed
    const barbers = barbersList.map(b => ({
      id: b.id,
      name: b.name,
      slug: b.slug,
      role: b.role,
      color_from: b.color_from || "#7c3aed",
      color_to: b.color_to || "#db2777",
      stats: statsMap[b.id] || null,
    }));
 
    const statsArr = barbers.map(b => b.stats).filter(Boolean);
    const shop_avg = statsArr.length > 0 ? {
      rebook_rate: statsArr.reduce((s, b) => s + (b.rebook_rate || 0), 0) / statsArr.length,
      avg_service_value: statsArr.reduce((s, b) => s + (b.avg_service_value || 0), 0) / statsArr.length,
      total_revenue: statsArr.reduce((s, b) => s + (b.total_revenue || 0), 0),
    } : null;
 
    return NextResponse.json({ barbers, shop_avg });
  } catch (error: any) {
    console.error("[Barbers API]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}