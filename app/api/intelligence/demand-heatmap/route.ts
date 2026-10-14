import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ask } from "@/lib/llm/gateway";
import { authorize, rateLimited, DENIED_MESSAGE } from "@/lib/ai/access";
import { buildForecast, fallbackInsight, insightFacts, type Forecast } from "@/lib/forecast/demand";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/intelligence/demand-heatmap            -> the 6-week forecast (cached 5 min)
// GET /api/intelligence/demand-heatmap?part=insight -> a short AI read of it (cached 30 min)
// Add &refresh=1 to bypass the cache.

const FORECAST_TTL = 5 * 60_000;
const INSIGHT_TTL = 30 * 60_000;
let forecastCache: { at: number; key: string; data: Forecast } | null = null;
let insightCache: { at: number; key: string; text: string; source: "ai" | "data" } | null = null;

async function getForecast(venueId: string, businessId: string, refresh: boolean): Promise<Forecast> {
  const key = `${venueId}:${businessId}`;
  if (!refresh && forecastCache && forecastCache.key === key && Date.now() - forecastCache.at < FORECAST_TTL) return forecastCache.data;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const data = await buildForecast(supabase, venueId, businessId);
  forecastCache = { at: Date.now(), key, data };
  return data;
}

// Every number in the AI's answer must come from the facts we gave it; otherwise we use the data-only text.
function numbersAreGrounded(text: string, facts: unknown): boolean {
  const allowed = new Set((JSON.stringify(facts).match(/\d+(?:\.\d+)?/g) ?? []));
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).every((n) => allowed.has(n));
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: DENIED_MESSAGE }, { status: 401 });
  if (rateLimited(req, 30)) return NextResponse.json({ error: "Slow down a little. Try again in a minute." }, { status: 429 });

  const venueId = process.env.ALKAMI_VENUE_ID || process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID;
  const businessId = process.env.ALKAMI_BUSINESS_ID;
  if (!venueId || !businessId) return NextResponse.json({ error: "Server misconfigured: ALKAMI_VENUE_ID or ALKAMI_BUSINESS_ID missing." }, { status: 503 });

  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  try {
    const f = await getForecast(venueId, businessId, refresh);

    if (req.nextUrl.searchParams.get("part") === "insight") {
      const key = `${venueId}:${f.generated_at}`;
      if (!refresh && insightCache && insightCache.key.startsWith(`${venueId}:`) && Date.now() - insightCache.at < INSIGHT_TTL)
        return NextResponse.json({ ai_insight: insightCache.text, source: insightCache.source });
      const facts = insightFacts(f);
      let text = "", source: "ai" | "data" = "ai";
      const raw = await ask({
        system: "You are the demand analyst for Alkami Barbershop in Canberra. Write 2 or 3 short sentences for the owner: which days are quiet, which clients could fill them, and one specific action. Use ONLY the facts provided. Do not invent numbers, names or causes. Plain text, Australian English, no markdown, no emoji.",
        user: `Facts (JSON):\n${JSON.stringify(facts)}`, maxTokens: 220, temperature: 0.4,
      });
      if (raw && raw.length <= 600 && numbersAreGrounded(raw, facts)) text = raw.replace(/\s+/g, " ").trim();
      else { text = fallbackInsight(f); source = "data"; }
      insightCache = { at: Date.now(), key, text, source };
      return NextResponse.json({ ai_insight: text, source });
    }

    return NextResponse.json({
      heatmap: f.days, opportunities: f.opportunities, profile: f.profile, totals: f.totals, generated_at: f.generated_at,
    });
  } catch (err: any) {
    console.error("[demand-heatmap]", err);
    return NextResponse.json({ error: "Could not build the forecast." }, { status: 500 });
  }
}
