import { NextRequest, NextResponse } from "next/server";
import { getCustomers } from "@/lib/ai/customers";
import { computeResults, type Member } from "@/lib/campaigns/stats";
import { guard, env, db, missingTable, asciiOnly } from "@/lib/campaigns/server";

export const runtime = "nodejs";
export const maxDuration = 30;
const syd = (d: Date | string) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
const UNAVAILABLE = { available: false, campaigns: [] as any[] };

// GET: past campaigns with measured results (rebooked vs the held-out control group).
export async function GET(req: NextRequest) {
  const g = guard(req); if (g) return g;
  const e = env(); if (!e) return NextResponse.json({ error: "Server misconfigured." }, { status: 503 });
  try {
    const supabase = db();
    const { data: camps, error } = await supabase.from("rydra_campaigns").select("*").eq("venue_id", e.venueId).order("created_at", { ascending: false }).limit(20);
    if (error) { if (missingTable(error)) return NextResponse.json(UNAVAILABLE); throw error; }
    if (!camps?.length) return NextResponse.json({ available: true, campaigns: [] });
    const { data: mem, error: me } = await supabase.from("rydra_campaign_members").select("campaign_id, customer_id, variant, status, sent_at").in("campaign_id", camps.map((c: any) => c.id)).limit(20000);
    if (me) throw me;
    const customers = await getCustomers(supabase, e.venueId, e.businessId);
    const last = new Map(customers.map((c) => [c.user_id, c.last_visit_local]));
    const out = camps.map((c: any) => {
      const created = syd(c.created_at);
      const members = (mem ?? []).filter((m: any) => m.campaign_id === c.id) as Member[];
      const res = computeResults(members, (id) => { const l = last.get(id); return !!l && l > created; });
      return { id: c.id, name: c.name, goal: c.goal, created_at: c.created_at, variants: c.variants, holdout_pct: c.holdout_pct, results: res };
    });
    return NextResponse.json({ available: true, campaigns: out });
  } catch (err: any) { console.error("[campaigns GET]", err); return NextResponse.json({ error: "Could not load campaigns." }, { status: 500 }); }
}

// POST: register a campaign BEFORE sending (so the control group is fixed up front).
// body: { name, goal, audience, variants:[{id,text}], holdout_pct, members:[{customer_id, variant}] }
export async function POST(req: NextRequest) {
  const g = guard(req, 10); if (g) return g;
  const e = env(); if (!e) return NextResponse.json({ error: "Server misconfigured." }, { status: 503 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const members = Array.isArray(b?.members) ? b.members.slice(0, 2000) : [];
  if (!members.length) return NextResponse.json({ error: "No clients in this campaign." }, { status: 400 });
  const ok = (v: any) => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v);
  const clean = members.filter((m: any) => ok(m?.customer_id) && ["A", "B", "C", "holdout"].includes(m?.variant));
  try {
    const supabase = db();
    const { data: camp, error } = await supabase.from("rydra_campaigns").insert({
      venue_id: e.venueId, name: asciiOnly(String(b.name ?? "Campaign")).slice(0, 80) || "Campaign", goal: asciiOnly(String(b.goal ?? "")).slice(0, 200),
      audience: b.audience ?? null, variants: Array.isArray(b.variants) ? b.variants.slice(0, 3) : null, holdout_pct: Math.min(50, Math.max(0, Math.round(Number(b.holdout_pct) || 0))),
    }).select("id").single();
    if (error) { if (missingTable(error)) return NextResponse.json({ available: false }); throw error; }
    const rows = clean.map((m: any) => ({ campaign_id: camp.id, customer_id: m.customer_id, variant: m.variant, status: m.variant === "holdout" ? "holdout" : "planned" }));
    for (let i = 0; i < rows.length; i += 500) { const { error: ie } = await supabase.from("rydra_campaign_members").insert(rows.slice(i, i + 500)); if (ie) throw ie; }
    return NextResponse.json({ available: true, id: camp.id });
  } catch (err: any) { console.error("[campaigns POST]", err); return NextResponse.json({ error: "Could not save the campaign." }, { status: 500 }); }
}

// PATCH: record the outcome of one send. body: { campaign_id, customer_id, status:'sent'|'skipped', reason? }
export async function PATCH(req: NextRequest) {
  const g = guard(req, 600); if (g) return g;
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!/^[0-9a-f-]{36}$/i.test(String(b?.campaign_id)) || !/^[A-Za-z0-9_-]{1,64}$/.test(String(b?.customer_id)) || !["sent", "skipped"].includes(b?.status)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  try {
    const { error } = await db().from("rydra_campaign_members").update({ status: b.status, sent_at: b.status === "sent" ? new Date().toISOString() : null, skip_reason: b.status === "skipped" ? String(b.reason ?? "").slice(0, 40) : null })
      .eq("campaign_id", b.campaign_id).eq("customer_id", b.customer_id).neq("status", "holdout");
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Could not update." }, { status: 500 }); }
}
