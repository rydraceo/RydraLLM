import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorize, rateLimited, DENIED_MESSAGE } from "@/lib/ai/access";
import { loadPeople, rankForSlot, dowOf, fmtTime, shortLabel, DOW_NAMES } from "@/lib/forecast/demand";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST { slot_date: "YYYY-MM-DD", slot_time?: "HH:MM", barber?: string, count?: 1..15 }
// Ranks the clients most likely to take a gap. Messages are written afterwards, in the bulk composer,
// so you can review them before anything is sent. Nobody who is opted out, on hold, recently texted
// or already booked is ever returned.
export async function POST(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: DENIED_MESSAGE }, { status: 401 });
  if (rateLimited(req, 30)) return NextResponse.json({ error: "Slow down a little. Try again in a minute." }, { status: 429 });

  const venueId = process.env.ALKAMI_VENUE_ID || process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID;
  const businessId = process.env.ALKAMI_BUSINESS_ID;
  if (!venueId || !businessId) return NextResponse.json({ error: "Server misconfigured: ALKAMI_VENUE_ID or ALKAMI_BUSINESS_ID missing." }, { status: 503 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const date = String(body?.slot_date ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return NextResponse.json({ error: "A valid slot_date (YYYY-MM-DD) is required." }, { status: 400 });
  const time = /^\d{2}:\d{2}$/.test(String(body?.slot_time ?? "")) ? String(body.slot_time) : "";
  const barber = typeof body?.barber === "string" ? body.barber.replace(/[^A-Za-z' .\-]/g, "").trim().slice(0, 30) : "";
  const count = Math.min(Math.max(Math.round(Number(body?.count) || 5), 1), 15);

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { rows, reachableIds } = await loadPeople(supabase, venueId, businessId);
    const dow = dowOf(date);
    const { ranked, total } = rankForSlot(rows, reachableIds, dow, count);
    return NextResponse.json({
      slot: { date, time: time ? fmtTime(time) : "", barber, weekday: DOW_NAMES[dow], label: shortLabel(date) },
      slot_label: `${shortLabel(date)}${time ? ` at ${fmtTime(time)}` : ""}${barber ? ` with ${barber}` : ""}`,
      clients: ranked,
      total_candidates: total,
    });
  } catch (err: any) {
    console.error("[slot-fill]", err);
    return NextResponse.json({ error: "Could not rank clients." }, { status: 500 });
  }
}
