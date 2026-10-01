import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { authorize, rateLimited, DENIED_MESSAGE } from "@/lib/ai/access";
import { computeOutreach } from "@/lib/outreach/data";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: DENIED_MESSAGE }, { status: 401 });
  if (rateLimited(req, 60)) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const venueId = process.env.ALKAMI_VENUE_ID || process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID;
  const businessId = process.env.ALKAMI_BUSINESS_ID;
  if (!venueId || !businessId) return NextResponse.json({ error: "Server misconfigured: ALKAMI_VENUE_ID or ALKAMI_BUSINESS_ID missing." }, { status: 503 });

  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { overview } = await computeOutreach(supabase, venueId, businessId);
    return NextResponse.json(overview);
  } catch (e: any) {
    console.error("[outreach/overview]", e);
    return NextResponse.json({ error: "Could not load outreach data.", details: e?.message }, { status: 500 });
  }
}
