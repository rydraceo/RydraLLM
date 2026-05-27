// app/api/barber/diary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
 
function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
 
// ─── GET: fetch diary entries ─────────────────────────────────────────────────
// ?venue_id=X                         → all entries for venue
// ?venue_id=X&barber_slug=Y           → all entries for that barber
// ?venue_id=X&customer_id=Z           → all entries for that client (any barber)
// ?venue_id=X&barber_slug=Y&customer_id=Z → entries for barber+client pair
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const venue_id     = searchParams.get("venue_id");
  const barber_slug  = searchParams.get("barber_slug");
  const customer_id  = searchParams.get("customer_id");
 
  if (!venue_id) return NextResponse.json({ error: "venue_id required" }, { status: 400 });
 
  let query = db()
    .from("barber_diary")
    .select("*")
    .eq("venue_id", venue_id)
    .order("session_date", { ascending: false })
    .order("created_at", { ascending: false });
 
  if (barber_slug) query = query.eq("barber_slug", barber_slug);
  if (customer_id) query = query.eq("customer_id", customer_id);
 
  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
 
  // Group stats: upgrade_ready count, total entries, last entry date
  const entries = data || [];
  const stats = {
    total:          entries.length,
    upgrade_ready:  entries.filter(e => e.spend_willingness === "upgrade_ready").length,
    high_spenders:  entries.filter(e => e.spend_willingness === "high").length,
    last_entry:     entries[0]?.session_date || null,
  };
 
  return NextResponse.json({ entries, stats });
}
 
// ─── POST: create new diary entry ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    venue_id, barber_slug, barber_name,
    customer_id, customer_name, session_date,
    service_performed, conversation_notes, client_preferences,
    spend_willingness = "medium", spend_notes, next_session_notes,
  } = body;
 
  if (!venue_id || !barber_slug || !customer_name) {
    return NextResponse.json({ error: "venue_id, barber_slug, customer_name required" }, { status: 400 });
  }
 
  const { data, error } = await db()
    .from("barber_diary")
    .insert({
      venue_id, barber_slug, barber_name,
      customer_id: customer_id || null,
      customer_name,
      session_date: session_date || new Date().toISOString().split("T")[0],
      service_performed: service_performed || null,
      conversation_notes: conversation_notes || null,
      client_preferences: client_preferences || null,
      spend_willingness,
      spend_notes: spend_notes || null,
      next_session_notes: next_session_notes || null,
    })
    .select()
    .single();
 
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}
 
// ─── PUT: update existing entry ───────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, venue_id, ...updates } = body;
 
  if (!id || !venue_id) return NextResponse.json({ error: "id and venue_id required" }, { status: 400 });
 
  // Strip fields that shouldn't be directly updated
  delete updates.created_at;
  delete updates.updated_at;
 
  const { data, error } = await db()
    .from("barber_diary")
    .update(updates)
    .eq("id", id)
    .eq("venue_id", venue_id) // safety check
    .select()
    .single();
 
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}
 
// ─── DELETE: remove entry ─────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const id       = searchParams.get("id");
  const venue_id = searchParams.get("venue_id");
 
  if (!id || !venue_id) return NextResponse.json({ error: "id and venue_id required" }, { status: 400 });
 
  const { error } = await db()
    .from("barber_diary")
    .delete()
    .eq("id", id)
    .eq("venue_id", venue_id);
 
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}