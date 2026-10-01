import { NextRequest, NextResponse } from "next/server";
import { authorize, rateLimited, DENIED_MESSAGE } from "@/lib/ai/access";
import { chat, describeGateway, GatewayError } from "@/lib/llm/gateway";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET  /api/ai/health          -> what is configured (no secrets, no LLM call)
// GET  /api/ai/health?probe=1  -> also sends a tiny prompt through Portkey and reports which model answered
export async function GET(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: DENIED_MESSAGE }, { status: 401 });
  if (rateLimited(req, 10)) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const has = (k: string) => !!process.env[k];
  const env = {
    PORTKEY_API_KEY: has("PORTKEY_API_KEY"),
    SUPABASE_URL: has("NEXT_PUBLIC_SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: has("SUPABASE_SERVICE_ROLE_KEY"),
    ALKAMI_VENUE_ID: has("ALKAMI_VENUE_ID") || has("NEXT_PUBLIC_ALKAMI_VENUE_ID"),
    ALKAMI_BUSINESS_ID: has("ALKAMI_BUSINESS_ID"),
    SMS_OPTOUT_BASE_URL: has("SMS_OPTOUT_BASE_URL"),
    CLICKSEND: has("CLICKSEND_USERNAME") && has("CLICKSEND_API_KEY"),
  };
  const out: Record<string, unknown> = {
    service: "rydra-ai", ok: Object.values(env).every(Boolean), env, gateway: describeGateway(),
    cors_allowed_origins: (process.env.AI_ALLOWED_ORIGINS || "").split(",").filter(Boolean).length || "dev defaults",
  };

  if (req.nextUrl.searchParams.get("probe") === "1") {
    const t0 = Date.now();
    try {
      const r = await chat({ messages: [{ role: "user", content: "Reply with the single word: ok" }], maxTokens: 16 });
      out.probe = { ok: true, ms: Date.now() - t0, model: r.model, reply: r.text.slice(0, 40) };
    } catch (e: any) {
      out.ok = false;
      out.probe = { ok: false, ms: Date.now() - t0, error: e instanceof GatewayError ? e.message : "probe failed" };
    }
  }
  return NextResponse.json(out);
}
