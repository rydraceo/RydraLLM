import { NextRequest, NextResponse } from "next/server";
import { loadTeam } from "@/lib/barbers/data";
import { teamInsights, yearVisits, rebookPointValue } from "@/lib/barbers/insights";
import { outreachConfig } from "@/lib/outreach/data";
import { guard, env, db } from "@/lib/campaigns/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const g = guard(req, 60); if (g) return g;
  const e = env(); if (!e) return NextResponse.json({ error: "Server misconfigured." }, { status: 503 });
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,60}$/i.test(slug)) return NextResponse.json({ error: "Invalid barber." }, { status: 400 });
  try {
    const team = await loadTeam(db(), e.venueId, e.businessId, req.nextUrl.searchParams.get("refresh") === "1");
    const me = team.barbers.find((b) => b.slug === slug);
    if (!me) return NextResponse.json({ error: "Barber not found" }, { status: 404 });
    const peers = team.barbers.map((b) => ({ id: b.id, name: b.name, slug: b.slug, role: b.role, color_from: b.color_from, color_to: b.color_to, stats: b.stats, firstReturn: b.metrics?.firstReturn ?? null, return45: b.metrics?.return45 ?? null }));
    return NextResponse.json({ barber: me, shop: team.shop, peers, derived: team.derived, dataLevel: team.dataLevel, visitCount: team.visitCount, linkCount: team.linkCount, tables: team.tables, yearVisits: yearVisits(me), pointValue: Math.round(rebookPointValue(me)), config: { body_max: outreachConfig().body_max }, insights: teamInsights(team).filter((i) => i.slug === slug) });
  } catch (err: any) { console.error("[team/slug]", err); return NextResponse.json({ error: "Could not load this barber." }, { status: 500 }); }
}
