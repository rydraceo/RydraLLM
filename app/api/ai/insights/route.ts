import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { ToolCtx } from "@/lib/ai/tools";
import { ascii } from "@/lib/ai/tools";
import { runAgent, READ_ONLY_TOOLS, GROUNDING_RULES } from "@/lib/ai/agent";
import { authorize, rateLimited, DENIED_MESSAGE } from "@/lib/ai/access";
import { getCustomers } from "@/lib/ai/customers";
import { computeOutreach, outreachConfig } from "@/lib/outreach/data";
import { parseJsonLoose, validateRecommendations, fallbackRecommendations, templateProblem, fallbackTemplate, stateFromLabel, validatePlan, fallbackPlan } from "@/lib/ai/briefs";

export const runtime = "nodejs";
export const maxDuration = 60;

const today = () => new Date().toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const persona = () => `You are RydraAI, the analyst inside the Rydra demand-intelligence dashboard for Alkami Barbershop in Canberra, Australia. Today is ${today()}.`;

export async function POST(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: DENIED_MESSAGE }, { status: 401 });
  if (rateLimited(req)) return NextResponse.json({ error: "Slow down a little. Try again in a minute." }, { status: 429 });

  const venueId = process.env.ALKAMI_VENUE_ID || process.env.NEXT_PUBLIC_ALKAMI_VENUE_ID;
  const businessId = process.env.ALKAMI_BUSINESS_ID;
  if (!venueId || !businessId) return NextResponse.json({ error: "Server misconfigured: ALKAMI_VENUE_ID or ALKAMI_BUSINESS_ID missing." }, { status: 503 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const type = String(body?.type ?? "");

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const ctx: ToolCtx = { supabase, venueId, businessId, actions: [], drafts: [] };

  try {
    // ── Chat: read-only Q&A ────────────────────────────────────────────────
    if (type === "chat") {
      const q = typeof body.query === "string" ? body.query.trim().slice(0, 500) : "";
      if (!q) return NextResponse.json({ error: "query is required" }, { status: 400 });
      const r = await runAgent({
        system: `${persona()}\nAnswer the owner's question using the tools. Lead with the answer. For rankings use a numbered list in the form "1. **Name** - detail". Bold only key figures. No headers, no emoji. Keep it under 180 words.\n\n${GROUNDING_RULES}`,
        messages: [{ role: "user", content: q }], ctx, tools: READ_ONLY_TOOLS,
      });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
      return NextResponse.json({ response: r.text || "I couldn't work that out. Try rephrasing." });
    }

    // ── Recommendations: three data-backed actions ──────────────────────────
    if (type === "recommendations") {
      const rows = await getCustomers(supabase, venueId, businessId);
      let recs = null;
      const r = await runAgent({
        system: `${persona()}\nReturn ONLY a JSON object, no other text: {"recommendations":[{"title":string,"description":string,"impact":string,"actionLabel":string,"confidence":number}]}\nExactly 3 recommendations, highest estimated value first.\n- title: max 6 words.\n- description: max 220 characters. Say who, why, and what to do, using numbers from the tools.\n- impact: max 40 characters, like "est. +$1,240 recoverable", using intervention values from the tools.\n- actionLabel: max 3 words.\n- confidence: 0 to 1, higher when the audience is large.\n- Only recommend messaging clients who are messageable. No discounts for loyal or on-the-fence clients. Never invent statistics.\n\n${GROUNDING_RULES}`,
        messages: [{ role: "user", content: "Give me today's three best recommended actions." }], ctx, tools: READ_ONLY_TOOLS, maxTokens: 900,
      });
      if (r.ok) recs = validateRecommendations(parseJsonLoose(r.text));
      else console.error("[insights] recommendations agent failed:", r.error);
      return NextResponse.json({ recommendations: recs ?? fallbackRecommendations(rows), source: recs ? "ai" : "data" });
    }

    // ── SMS template with {first_name} placeholder ──────────────────────────
    if (type === "sms_template") {
      const cfg = outreachConfig();
      const max = Math.min(Math.max(Number(body.max_chars) || cfg.copy_max, 40), 140);
      const state = stateFromLabel(typeof body.segment === "string" ? body.segment : undefined);
      const goal = typeof body.goal === "string" ? ascii(body.goal).slice(0, 120) : "";
      const sys = `You write one SMS template for Alkami Barbershop in Canberra, Australia.\nSTYLE: Australian English, casual and warm. Use the literal placeholder {first_name} once. Mention "Alkami" once. At most one exclamation mark. No emoji.\nHARD RULES: maximum ${max} characters. No links, URLs or other placeholders (a booking link is added automatically). No prices, discounts or offers. Do not ask them to reply or call. Do not invent barber names or availability.\nOUTPUT: only the message text.`;
      const user = `Client type: ${state}. ${goal ? `Goal: ${goal}.` : ""} Write the template.`;
      let message = "";
      for (let attempt = 0; attempt < 2 && !message; attempt++) {
        const r = await runAgent({ system: sys, messages: [{ role: "user", content: attempt ? `${user} The previous attempt broke the rules. Follow every rule exactly.` : user }], ctx, tools: "none", maxTokens: 150 });
        if (!r.ok) break;
        const t = ascii(r.text).replace(/^["'`]+|["'`]+$/g, "").trim();
        if (!templateProblem(t, max)) message = t;
      }
      return NextResponse.json({ message: message || fallbackTemplate(state, max), source: message ? "ai" : "template", max_chars: max });
    }

    // ── Outreach plan: who to text today, and what to say ───────────────────
    if (type === "outreach_plan") {
      const { overview, candidates } = await computeOutreach(supabase, venueId, businessId);
      const cfg = overview.config;
      const n = Math.min(Math.max(Number(body.max_clients) || 25, 1), 100, Math.max(overview.stats.remaining_today, 1));
      const max = cfg.copy_max;
      const cand = candidates.map((c) => ({ user_id: c.user_id, markov_state: c.markov_state, intervention_value_aud: c.intervention_value_aud }));

      let plan = null;
      if (cand.length) {
        const r = await runAgent({
          system: `${persona()}\nPick up to ${n} clients for the owner to text today, and write the message.\n- Use query_customers with sms="messageable", sorted by intervention_value, to find them. Skip anyone with has_upcoming_booking.\n- Prefer high estimated value, but a mix of client types is fine if it makes sense. Explain the choice briefly.\n- The server removes anyone texted in the last ${cfg.cooldown_days} days, so extra candidates are fine.\nReturn ONLY a JSON object: {"summary":string (max 280 chars, plain, quote numbers from tools),"segment":"Churned"|"At Risk"|"Stable"|"First timers"|"Mixed","message":string,"user_ids":[string]}\nmessage: max ${max} characters, includes {first_name}, mentions Alkami, no links, no prices or offers, no emoji. user_ids: exactly as returned by query_customers.\n\n${GROUNDING_RULES}`,
          messages: [{ role: "user", content: `Build today's outreach list of up to ${n} clients.` }], ctx, tools: READ_ONLY_TOOLS, maxTokens: 1800,
        });
        if (r.ok) plan = validatePlan(parseJsonLoose(r.text), cand, n, max);
        else console.error("[insights] plan agent failed:", r.error);
      }
      return NextResponse.json({ ...(plan ?? fallbackPlan(cand, n, max)), source: plan ? "ai" : "data" });
    }

    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e: any) {
    console.error("[insights] error", e);
    return NextResponse.json({ error: "AI request failed. Try again." }, { status: 500 });
  }
}
