import { NextRequest, NextResponse } from "next/server";
import { ask } from "@/lib/llm/gateway";
import { DEFAULT_FILTER, STATES, type AudienceFilter, type MarkovKey } from "@/lib/campaigns/model";
import { guard, asciiOnly } from "@/lib/campaigns/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Strictly validates whatever the model (or the keyword fallback) produced. Nothing unvalidated reaches the client. */
function sanitise(raw: any): AudienceFilter {
  const n = (v: any, lo: number, hi: number, d: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  const states = Array.isArray(raw?.states) ? (raw.states.filter((s: any) => (STATES as string[]).includes(s)) as MarkovKey[]) : [];
  const wd = raw?.weekday === null || raw?.weekday === undefined ? null : Math.round(n(raw.weekday, 0, 6, -1));
  return {
    ...DEFAULT_FILTER, states: [...new Set(states)], minClv: n(raw?.minClv, 0, 5000, 0), minVisits: Math.round(n(raw?.minVisits, 0, 200, 0)),
    minDays: Math.round(n(raw?.minDays, 0, 999, 0)), maxDays: Math.round(n(raw?.maxDays, 0, 999, 999)),
    weekday: wd !== null && wd >= 0 ? wd : null, minChurn: n(raw?.minChurn, 0, 1, 0),
  };
}

// Offline fallback so the box still does something sensible if the AI is down.
function keywords(t: string): AudienceFilter {
  const s = t.toLowerCase(); const f: AudienceFilter = { ...DEFAULT_FILTER, states: [] };
  if (/(lapsed|lost|churn|gone|win.?back|haven.?t been)/.test(s)) f.states.push("X");
  if (/(at.?risk|slipping|drifting)/.test(s)) f.states.push("R_at_risk");
  if (/(fence|due|overdue)/.test(s)) f.states.push("R_on_fence");
  if (/(first.?tim|new client|second visit)/.test(s)) f.states.push("C");
  if (/(loyal|regular|vip)/.test(s)) f.states.push("R_loyal");
  const m = s.match(/(\d+)\s*\+?\s*(visits|cuts)/); if (m) f.minVisits = Math.min(200, Number(m[1]));
  const sp = s.match(/\$\s?(\d{2,5})/); if (sp) f.minClv = Number(sp[1]);
  const d = DAYS.findIndex((x) => s.includes(x)); if (d >= 0) f.weekday = d;
  const dd = s.match(/(\d+)\s*(days|weeks|months)/);
  if (dd) { const k = Number(dd[1]) * (dd[2] === "weeks" ? 7 : dd[2] === "months" ? 30 : 1); if (/(more than|over|longer|since|haven)/.test(s)) f.minDays = k; else f.maxDays = k; }
  return f;
}

export async function POST(req: NextRequest) {
  const g = guard(req, 20); if (g) return g;
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const text = asciiOnly(String(body?.text ?? "")).slice(0, 300);
  if (text.length < 3) return NextResponse.json({ error: "Describe who you want to reach." }, { status: 400 });

  const system = `You turn a barbershop owner's plain-English description of an audience into a JSON filter. Output ONLY JSON, no prose.
Schema: {"states":[...],"minClv":number,"minVisits":number,"minDays":number,"maxDays":number,"weekday":number|null,"minChurn":number,"summary":string}
states may contain: "X" (lapsed/lost, long overdue), "R_at_risk" (slipping, overdue), "R_on_fence" (a little overdue), "C" (first-timers / new), "R_loyal" (regulars on schedule). Empty array = everyone.
minClv = lifetime spend in AUD. minDays/maxDays = days since last visit (maxDays 999 = no limit). weekday: 0=Sunday..6=Saturday, the day they usually come. minChurn 0..1 = chance of being lost.
summary: one plain sentence (max 140 chars) restating the audience. Never invent facts.`;
  const raw = await ask({ system, user: text, maxTokens: 300, temperature: 0 });
  let parsed: any = null;
  if (raw) { try { parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { parsed = null; } }
  const filter = parsed ? sanitise(parsed) : keywords(text);
  const summary = parsed && typeof parsed.summary === "string" ? asciiOnly(parsed.summary).slice(0, 160) : "";
  return NextResponse.json({ filter, summary, source: parsed ? "ai" : "keywords" });
}
