import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
 
function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
 
// PUT /api/automation/rules/[id] — update rule
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const supabase = db();
 
    const { data, error } = await supabase
      .from("intervention_rules")
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
 
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rule: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
 
// DELETE /api/automation/rules/[id]
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const supabase = db();
    const { error } = await supabase.from("intervention_rules").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
 
// POST /api/automation/rules/[id]/run — manual trigger
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
 
    // Delegate to cron route with rule_id filter
    const venue_id = searchParams.get("venue_id") || process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID;
    const base = request.url.split("/api/")[0];
    const res = await fetch(`${base}/api/cron/interventions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": process.env.CRON_SECRET || "rydra-dev",
      },
      body: JSON.stringify({ venue_id, rule_id: id, dry_run: false }),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}