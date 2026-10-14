import { NextRequest, NextResponse } from "next/server";
import { ask } from "@/lib/llm/gateway";
import { loadClient, factsOf, dataBrief, type Brief } from "@/lib/clients/detail";
import { parseJsonLoose } from "@/lib/ai/briefs";
import { guard, env, db, asciiOnly } from "@/lib/campaigns/server";

export const runtime = "nodejs";
export const maxDuration = 30;

// Every number the model writes must already appear in the facts we gave it. Otherwise we use the data-only brief.
const nums = (s: string) => (s.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));
function valid(b: any, facts: string): Brief | null {
  if (!b || typeof b.headline !== "string" || !Array.isArray(b.points) || typeof b.move !== "string" || typeof b.why !== "string") return null;
  const t = (v: string, n: number) => asciiOnly(v).slice(0, n);
  const out: Brief = { headline: t(b.headline, 110), points: b.points.filter((p: any) => typeof p === "string").slice(0, 4).map((p: string) => t(p, 160)), move: t(b.move, 110), why: t(b.why, 160), source: "ai" };
  if (!out.headline || !out.points.length || !out.move) return null;
  const allowed = new Set(nums(facts)); ["0", "1", "2", "3", "4", "5", "6", "7"].forEach((n) => allowed.add(n));
  const text = [out.headline, ...out.points, out.move, out.why].join(" ");
  if (nums(text).some((n) => !allowed.has(n))) return null;
  if (/[$%]\s?\d+\s?(off|discount)|\bdiscount\b|\bfree\b/i.test(text)) return null;
  return out;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const g = guard(req, 30); if (g) return g;
  const e = env(); if (!e) return NextResponse.json({ error: "Server misconfigured." }, { status: 503 });
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: "Invalid client id." }, { status: 400 });
  try {
    const d = await loadClient(db(), e.venueId, e.businessId, id);
    if (!d) return NextResponse.json({ error: "Client not found" }, { status: 404 });
    const facts = factsOf(d);
    const system = `You brief a barbershop owner about ONE client in plain, friendly Australian English. Use ONLY the facts provided. Never invent numbers, dates, names or offers. Do not suggest discounts.
Return ONLY JSON: {"headline": string (one sentence, the single most important thing),"points": [2-4 short observations],"move": string (the single best next action, imperative),"why": string (one sentence of reasoning)}.
If they are already booked or on track, the right move is to do nothing. Say so.`;
    const raw = await ask({ system, user: facts, maxTokens: 450, temperature: 0.3 });
    const parsed = raw ? valid(parseJsonLoose(raw), facts) : null;
    return NextResponse.json(parsed ?? dataBrief(d));
  } catch (err: any) {
    console.error("[clients/:id/brief]", err);
    return NextResponse.json({ error: "Could not build the brief." }, { status: 500 });
  }
}
