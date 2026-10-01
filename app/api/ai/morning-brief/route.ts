import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { ToolCtx } from "@/lib/ai/tools";
import { runAgent, READ_ONLY_TOOLS, GROUNDING_RULES } from "@/lib/ai/agent";
import { authorize, rateLimited, DENIED_MESSAGE } from "@/lib/ai/access";
import { getCustomers } from "@/lib/ai/customers";
import { fallbackBrief, validateBrief } from "@/lib/ai/briefs";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: DENIED_MESSAGE }, { status: 401 });
  if (rateLimited(req, 10)) return NextResponse.json({ error: "Slow down a little. Try again in a minute." }, { status: 429 });

  const venueId = process.env.ALKAMI_VENUE_ID || process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID;
  const businessId = process.env.ALKAMI_BUSINESS_ID;
  if (!venueId || !businessId) return NextResponse.json({ error: "Server misconfigured: ALKAMI_VENUE_ID or ALKAMI_BUSINESS_ID missing." }, { status: 503 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const ctx: ToolCtx = { supabase, venueId, businessId, actions: [], drafts: [] };
  const today = new Date().toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", weekday: "long", day: "numeric", month: "long", year: "numeric" });

  try {
    const r = await runAgent({
      system: `You write the daily intelligence brief for the owner of Alkami Barbershop in Canberra. Today is ${today}.\nUse the tools, then write EXACTLY four sections in this order, each starting with its emoji, a short header, a newline, then 2 to 3 plain sentences:\n📊 Revenue health\n🎯 Priority action\n👥 Clients to watch\n📈 SMS performance\nThe priority action must name a specific group, how many can be messaged, and the estimated value. Under 170 words total. No bullet points, no markdown.\n\n${GROUNDING_RULES}`,
      messages: [{ role: "user", content: "Write this morning's brief." }], ctx, tools: READ_ONLY_TOOLS, maxTokens: 900,
    });
    const ai = r.ok ? validateBrief(r.text) : null;
    if (ai) return NextResponse.json({ brief: ai, source: "ai" });

    // Data-only fallback so the panel never shows invented numbers or an error.
    const rows = await getCustomers(supabase, venueId, businessId);
    const { data } = await supabase.from("sms_outreach").select("status, cost").eq("venue_id", venueId).gte("sent_at", new Date(Date.now() - 30 * 86400_000).toISOString()).limit(3000);
    const h: any[] = data ?? [];
    const sms = { total: h.filter((x) => String(x.status).toLowerCase() !== "failed").length, failed: h.filter((x) => String(x.status).toLowerCase() === "failed").length, cost: h.reduce((s, x) => s + (Number(x.cost) || 0), 0) };
    return NextResponse.json({ brief: fallbackBrief(rows, sms), source: "data" });
  } catch (e: any) {
    console.error("[morning-brief] error", e);
    return NextResponse.json({ error: "Could not generate the brief." }, { status: 500 });
  }
}
