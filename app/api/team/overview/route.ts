import { NextRequest, NextResponse } from "next/server";
import { loadTeam } from "@/lib/barbers/data";
import { teamInsights, yearVisits, rebookPointValue } from "@/lib/barbers/insights";
import { guard, env, db } from "@/lib/campaigns/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const g = guard(req); if (g) return g;
  const e = env(); if (!e) return NextResponse.json({ error: "Server misconfigured: ALKAMI_VENUE_ID or ALKAMI_BUSINESS_ID missing." }, { status: 503 });
  try {
    const team = await loadTeam(db(), e.venueId, e.businessId, req.nextUrl.searchParams.get("refresh") === "1");
    // The book (client lists) is only sent on each barber's own page.
    const barbers = team.barbers.map((b) => ({ ...b, metrics: b.metrics ? { ...b.metrics, book: [] } : null, yearVisits: yearVisits(b), pointValue: Math.round(rebookPointValue(b)) }));
    return NextResponse.json({ ...team, barbers, insights: teamInsights(team) });
  } catch (err: any) { console.error("[team/overview]", err); return NextResponse.json({ error: "Could not load the team." }, { status: 500 }); }
}
