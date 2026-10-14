import { NextRequest, NextResponse } from "next/server";
import { guard, env, db, missingTable } from "@/lib/campaigns/server";
import { clearTeamCache } from "@/lib/barbers/data";

export const runtime = "nodejs";

// GET: this client's barbers. POST { barber_id | null }: assign (or clear) their barber by hand.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = guard(req, 60); if (g) return g;
  const e = env(); if (!e) return NextResponse.json({ error: "Server misconfigured." }, { status: 503 });
  const { id } = await ctx.params; if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: "Invalid client." }, { status: 400 });
  const s = db();
  const [{ data: barbers }, links] = await Promise.all([s.from("barbers").select("id, name, slug").eq("venue_id", e.venueId).eq("is_active", true).order("created_at"), s.from("barber_clients").select("barber_id, source, visits, last_visit, is_primary").eq("venue_id", e.venueId).eq("customer_id", id)]);
  return NextResponse.json({ barbers: barbers ?? [], links: links.error ? [] : links.data ?? [], available: !links.error });
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = guard(req, 60); if (g) return g;
  const e = env(); if (!e) return NextResponse.json({ error: "Server misconfigured." }, { status: 503 });
  const { id } = await ctx.params; if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: "Invalid client." }, { status: 400 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const barber = b?.barber_id ? String(b.barber_id) : null;
  if (barber && !/^[0-9a-f-]{36}$/i.test(barber)) return NextResponse.json({ error: "Invalid barber." }, { status: 400 });
  const s = db();
  if (barber) { const { data } = await s.from("barbers").select("id").eq("id", barber).eq("venue_id", e.venueId).maybeSingle(); if (!data) return NextResponse.json({ error: "Barber not found." }, { status: 404 }); }
  const { error } = await s.rpc("rydra_assign_barber", { p_venue: e.venueId, p_customer: id, p_barber: barber });
  if (error) return NextResponse.json({ error: missingTable(error) || /function/i.test(error.message) ? "Run supabase/barbers-and-wallets.sql in Supabase first." : error.message }, { status: 400 });
  clearTeamCache();
  return NextResponse.json({ ok: true });
}
