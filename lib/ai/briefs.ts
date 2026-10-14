import type { CopilotCustomer, MarkovKey } from "@/lib/ai/customers";
import { ascii } from "@/lib/ai/tools";

// Pure helpers: parsing, validation and data-only fallbacks, so the AI panels never show invented numbers.

export type Audience = "at_risk" | "churned" | "first_timers" | "on_fence" | "loyal";
export type Rec = { title: string; description: string; impact: string; actionLabel: string; confidence: number; audience: Audience };
const AUDIENCES: Audience[] = ["at_risk", "churned", "first_timers", "on_fence", "loyal"];
function inferAudience(text: string): Audience {
  const t = text.toLowerCase();
  if (/first[- ]?time|new client|second visit|rebook/.test(t)) return "first_timers";
  if (/churn|lapsed|win[- ]?back|miss you/.test(t)) return "churned";
  if (/fence|nudge/.test(t)) return "on_fence";
  if (/loyal|apprecia/.test(t)) return "loyal";
  return "at_risk";
}

export function parseJsonLoose(text: string): unknown | null {
  const a = text.indexOf("{"); const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
export const STATE_NAME: Record<MarkovKey, string> = { C: "first-timer", X: "churned", R_at_risk: "at-risk regular", R_on_fence: "on-the-fence", R_loyal: "loyal" };

// ─── SMS templates ───────────────────────────────────────────────────────────
export function templateProblem(msg: string, max: number): string | null {
  if (!msg) return "empty";
  if (msg.length > max) return `over ${max} characters (was ${msg.length})`;
  if (!msg.includes("{first_name}")) return "must include {first_name}";
  if (/[^\x20-\x7E]/.test(msg)) return "plain ASCII only";
  if (/https?:|www\.|\.com|\.app|\[|\]/i.test(msg)) return "no links or placeholders other than {first_name}";
  if (/[$%]|\bdiscount\b|\boff\b|\bfree\b/i.test(msg.replace(/\{first_name\}/g, ""))) return "no prices, discounts or offers";
  if (!/alkami/i.test(msg)) return 'must mention "Alkami"';
  if (/\breply\b|text back|call us/i.test(msg)) return "do not ask them to reply or call";
  if ((msg.match(/!/g) || []).length > 1) return "at most one exclamation mark";
  return null;
}

const FALLBACK_TEMPLATES: Record<MarkovKey | "generic", string> = {
  C: "Hi {first_name}, Alkami here. Ready for your next cut?",
  X: "Hi {first_name}, we miss you at Alkami. Grab a spot this week?",
  R_at_risk: "Hi {first_name}, it's been a while! Alkami has spots this week.",
  R_on_fence: "Hi {first_name}, time for a fresh cut? Alkami has spots open.",
  R_loyal: "Thanks for backing Alkami, {first_name}. Book your next cut?",
  generic: "Hi {first_name}, Alkami has spots open this week. Time for a cut?",
};

export function fallbackTemplate(state: MarkovKey | "generic", max: number): string {
  let t = FALLBACK_TEMPLATES[state] ?? FALLBACK_TEMPLATES.generic;
  if (t.length > max) { const cut = t.slice(0, max); t = cut.slice(0, Math.max(cut.lastIndexOf(" "), 20)).trimEnd(); }
  return t;
}

export function stateFromLabel(label?: string): MarkovKey | "generic" {
  switch (label) {
    case "Churned": case "X": return "X";
    case "At Risk": case "R_at_risk": return "R_at_risk";
    case "First timers": case "C": return "C";
    case "Stable": case "R_loyal": return "R_loyal";
    case "R_on_fence": return "R_on_fence";
    default: return "generic";
  }
}

// ─── Recommendations ─────────────────────────────────────────────────────────
function groups(rows: CopilotCustomer[]) {
  const g: Record<string, { n: number; iv: number }> = {};
  for (const c of rows) {
    if (c.sms_status !== "ok") continue;
    const x = (g[c.markov_state] ??= { n: 0, iv: 0 });
    x.n++; x.iv += c.intervention_value_aud;
  }
  return g;
}

export function fallbackRecommendations(rows: CopilotCustomer[]): Rec[] {
  const g = groups(rows);
  const pool: { key: MarkovKey; rec: (n: number, iv: number) => Omit<Rec, "impact" | "confidence"> }[] = [
    { key: "R_at_risk", rec: (n) => ({ audience: "at_risk" as Audience, title: "Win back at-risk regulars", description: `${n.toLocaleString()} regulars are past their usual cycle and can be messaged. A personal nudge before they lapse is usually the best return.`, actionLabel: "Plan campaign" }) },
    { key: "X", rec: (n) => ({ audience: "churned" as Audience, title: "Re-engage churned clients", description: `${n.toLocaleString()} long-lapsed clients can still be messaged. Lead with a warm "we miss you" and keep it short.`, actionLabel: "Plan campaign" }) },
    { key: "C", rec: (n) => ({ audience: "first_timers" as Audience, title: "Rebook first-timers", description: `${n.toLocaleString()} first-time clients haven't rebooked. One nudge around the five-to-six week mark helps build the habit.`, actionLabel: "Plan campaign" }) },
    { key: "R_on_fence", rec: (n) => ({ audience: "on_fence" as Audience, title: "Nudge on-the-fence regulars", description: `${n.toLocaleString()} regulars are slightly overdue. A gentle reminder is enough, no offer needed.`, actionLabel: "Plan campaign" }) },
  ];
  return pool
    .filter((p) => (g[p.key]?.n ?? 0) > 0)
    .sort((a, b) => g[b.key].iv - g[a.key].iv)
    .slice(0, 3)
    .map((p) => ({ ...p.rec(g[p.key].n, g[p.key].iv), impact: `est. +${money(g[p.key].iv)} recoverable`, confidence: g[p.key].n >= 25 ? 0.8 : 0.6 }));
}

export function validateRecommendations(parsed: unknown): Rec[] | null {
  const arr = (parsed as any)?.recommendations;
  if (!Array.isArray(arr) || arr.length < 1) return null;
  const out: Rec[] = [];
  for (const r of arr.slice(0, 3)) {
    const title = typeof r?.title === "string" ? r.title.trim().slice(0, 60) : "";
    const description = typeof r?.description === "string" ? r.description.trim().slice(0, 260) : "";
    const impact = typeof r?.impact === "string" ? r.impact.trim().slice(0, 50) : "";
    const actionLabel = typeof r?.actionLabel === "string" && r.actionLabel.trim() ? r.actionLabel.trim().slice(0, 24) : "Plan campaign";
    const c = Number(r?.confidence);
    if (!title || !description || !impact) return null;
    const audience: Audience = AUDIENCES.includes(r?.audience) ? r.audience : inferAudience(`${title} ${description}`);
    out.push({ title, description, impact, actionLabel, confidence: Number.isFinite(c) ? Math.min(Math.max(c, 0.3), 0.95) : 0.7, audience });
  }
  return out.length >= 1 ? out : null;
}

// ─── Morning brief ───────────────────────────────────────────────────────────
export function fallbackBrief(rows: CopilotCustomer[], sms: { total: number; failed: number; cost: number }): string {
  const ok = rows.filter((c) => c.sms_status === "ok");
  const iv = ok.reduce((s, c) => s + c.intervention_value_aud, 0);
  const clv = rows.reduce((s, c) => s + c.clv_aud, 0);
  const g = groups(rows);
  const top = (Object.keys(g) as MarkovKey[]).sort((a, b) => g[b].iv - g[a].iv)[0];
  const counts = (["R_loyal", "R_on_fence", "R_at_risk", "X", "C"] as MarkovKey[]).map((k) => `${rows.filter((c) => c.markov_state === k).length.toLocaleString()} ${STATE_NAME[k]}`).join(", ");
  return [
    `📊 Revenue health\n${rows.length.toLocaleString()} clients on file with about ${money(clv)} lifetime value. ${ok.length.toLocaleString()} can be messaged today, worth an estimated ${money(iv)} in extra revenue.`,
    `🎯 Priority action\n${top ? `Start with the ${g[top].n.toLocaleString()} ${STATE_NAME[top]} clients you can message, worth an estimated ${money(g[top].iv)}.` : "No clients are messageable right now."}`,
    `👥 Client mix\n${counts}.`,
    `📈 SMS performance\n${sms.total ? `${sms.total.toLocaleString()} texts in the last 30 days, ${sms.failed} failed, ${money(sms.cost)} spent.` : "No texts sent in the last 30 days."}`,
  ].join("\n\n");
}

export function validateBrief(text: string): string | null {
  const t = text.trim();
  const found = ["📊", "🎯", "👥", "📈"].filter((e) => t.includes(e)).length;
  return found >= 3 && t.length >= 150 && t.length <= 2200 ? t : null;
}

// ─── Outreach plan ───────────────────────────────────────────────────────────
export type PlanCandidate = { user_id: string; markov_state: MarkovKey };
export type Plan = { summary: string; segment: string; message: string; user_ids: string[] };
const SEGMENTS = ["Churned", "At Risk", "Stable", "First timers", "Mixed"];

export function validatePlan(parsed: unknown, cands: PlanCandidate[], n: number, maxChars: number): Plan | null {
  const p = parsed as any;
  if (!p || !Array.isArray(p.user_ids)) return null;
  const allowed = new Map(cands.map((c) => [c.user_id, c]));
  const ids: string[] = [];
  for (const id of p.user_ids) if (typeof id === "string" && allowed.has(id) && !ids.includes(id)) ids.push(id);
  const chosen = ids.slice(0, n);
  if (chosen.length < 1) return null;

  const tally: Record<string, number> = {};
  chosen.forEach((id) => { const k = allowed.get(id)!.markov_state; tally[k] = (tally[k] ?? 0) + 1; });
  const dominant = (Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0] ?? "generic") as MarkovKey;

  let message = typeof p.message === "string" ? ascii(p.message) : "";
  if (templateProblem(message, maxChars)) message = fallbackTemplate(dominant, maxChars);
  const summary = typeof p.summary === "string" && p.summary.trim() ? ascii(p.summary).slice(0, 300) : `Top ${chosen.length} messageable clients by estimated value.`;
  const segment = SEGMENTS.includes(p.segment) ? p.segment : "Mixed";
  return { summary, segment, message, user_ids: chosen };
}

export function fallbackPlan(cands: (PlanCandidate & { intervention_value_aud: number })[], n: number, maxChars: number): Plan {
  const top = [...cands].sort((a, b) => b.intervention_value_aud - a.intervention_value_aud).slice(0, n);
  const tally: Record<string, number> = {};
  top.forEach((c) => (tally[c.markov_state] = (tally[c.markov_state] ?? 0) + 1));
  const dominant = (Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0] ?? "generic") as MarkovKey;
  const iv = top.reduce((s, c) => s + c.intervention_value_aud, 0);
  return {
    summary: top.length ? `The ${top.length} messageable clients with the highest estimated value (about ${money(iv)} combined). Mostly ${STATE_NAME[dominant] ?? "mixed"} clients.` : "No clients are available to text right now.",
    segment: "Mixed",
    message: fallbackTemplate(dominant, maxChars),
    user_ids: top.map((c) => c.user_id),
  };
}
