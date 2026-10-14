import { NextRequest, NextResponse } from "next/server";
import { loadClient } from "@/lib/clients/detail";
import { guard, env, db } from "@/lib/campaigns/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const g = guard(req, 60); if (g) return g;
  const e = env(); if (!e) return NextResponse.json({ error: "Server misconfigured." }, { status: 503 });
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: "Invalid client id." }, { status: 400 });
  try {
    const d = await loadClient(db(), e.venueId, e.businessId, id);
    if (!d) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    return NextResponse.json(d);
  } catch (err: any) {
    console.error("[clients/:id]", err);
    return NextResponse.json({ error: "Could not load this client." }, { status: 500 });
  }
}
