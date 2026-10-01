import type { SupabaseClient } from "@supabase/supabase-js";
import type { UiAction, CampaignDraft, SegFilter, SmsFilter, DashboardSection } from "@/lib/ai/types";
import { getCustomers, filterCustomers, sortCustomers, summarise, SMS_COST_AUD, type CustomerFilter, type SortKey } from "@/lib/ai/customers";

export type ToolCtx = {
  supabase: SupabaseClient;
  venueId: string;
  businessId: string;
  actions: UiAction[];
  drafts: CampaignDraft[];
};

// ─── Tool definitions (Anthropic tool-use schema) ────────────────────────────
// Design rule: NO tool sends a message. Tools read data, stage drafts, or move the UI.
// Sending is always a human click in the SMS composer, re-checked server-side by /api/sms/send.

const filterProps = {
  risk_segment: { type: "string", enum: ["Churned", "At Risk", "Stable"], description: "Dashboard risk segment." },
  markov_state: { type: "string", enum: ["C", "X", "R_at_risk", "R_on_fence", "R_loyal"], description: "C = first timer (1 visit), X = churned, R_at_risk, R_on_fence, R_loyal." },
  sms: { type: "string", enum: ["messageable", "blocked", "held", "invalid_number", "opted_out"], description: "SMS eligibility. Default to 'messageable' when the goal is to contact people." },
  min_days_since_visit: { type: "number" },
  max_days_since_visit: { type: "number" },
  min_clv: { type: "number", description: "Minimum lifetime value in AUD." },
  min_visits: { type: "number" },
  max_visits: { type: "number" },
  search: { type: "string", description: "Case-insensitive name search." },
};

export const TOOLS = [
  {
    name: "get_business_summary",
    description: "Headline numbers for the whole client base: totals, counts per segment and SMS eligibility, total lifetime value, total intervention value. Use for overviews and health checks.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "query_customers",
    description: "Find and rank clients. Returns up to 25 clients plus the total number matching. Phone numbers and emails are never returned.",
    input_schema: {
      type: "object",
      properties: {
        ...filterProps,
        sort_by: { type: "string", enum: ["intervention_value", "clv", "churn_score", "days_since_visit", "visits"] },
        direction: { type: "string", enum: ["desc", "asc"] },
        limit: { type: "number", description: "1-25, default 10." },
      },
      required: [],
    },
  },
  {
    name: "get_sms_history",
    description: "Aggregate results of past outreach texts (counts by status, spend, breakdown by client type). No names or numbers.",
    input_schema: { type: "object", properties: { days: { type: "number", description: "Look-back window, 1-90, default 30." } }, required: [] },
  },
  {
    name: "get_barber_stats",
    description: "Barber roster and performance rows, if available.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "create_campaign_draft",
    description:
      "Stage a campaign draft card for the owner to review. Computes the real audience size (messageable clients only) and estimated cost. Does NOT send anything. The message must be plain ASCII, at most 80 characters, with no links, no prices and no discounts. A booking link and opt-out line are added automatically at send time.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        message: { type: "string", description: "Message text, max 80 chars, must include the first-name placeholder {first_name}." },
        ...filterProps,
      },
      required: ["name", "message"],
    },
  },
  {
    name: "navigate",
    description: "Take the owner to another tab.",
    input_schema: { type: "object", properties: { page: { type: "string", enum: ["dashboard", "outreach", "campaign", "clients", "barbers"] } }, required: ["page"] },
  },
  {
    name: "set_dashboard_filters",
    description: "Apply filters to the dashboard client table (switches to the dashboard if needed). Use after answering so the owner can see the same list.",
    input_schema: {
      type: "object",
      properties: {
        segment: { type: "string", enum: ["all", "Churned", "At Risk", "Stable"] },
        sms_status: { type: "string", enum: ["all", "ok", "blocked", "held", "invalid_number", "opted_out"] },
        search: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "scroll_dashboard",
    description: "Scroll the dashboard to a section.",
    input_schema: { type: "object", properties: { section: { type: "string", enum: ["kpis", "recovery", "heatmap", "brief", "ai", "charts", "clients"] } }, required: ["section"] },
  },
  {
    name: "open_sms_composer",
    description: "Open the SMS composer for one client, optionally pre-filled with a draft. The owner reviews and presses Send themselves. Only works for clients with sms_status 'ok'.",
    input_schema: {
      type: "object",
      properties: {
        user_id: { type: "string", description: "user_id exactly as returned by query_customers." },
        draft: { type: "string", description: "Optional message text, max 80 chars, no links or discounts." },
      },
      required: ["user_id"],
    },
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const PAGES: Record<string, { path: string; label: string }> = {
  dashboard: { path: "/merchant/dashboard", label: "Dashboard" },
  outreach: { path: "/merchant/outreach", label: "Outreach" },
  campaign: { path: "/merchant/campaign", label: "Campaign" },
  clients: { path: "/merchant/clients", label: "Clients" },
  barbers: { path: "/merchant/barber", label: "Barbers" },
};

export const ascii = (s: string) =>
  s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();

export function messageProblem(msg: string): string | null {
  if (!msg) return "message is empty";
  if (msg.length > 80) return `message is ${msg.length} characters; the limit is 80`;
  if (/https?:|www\.|\.com|\.app|\[|\]/i.test(msg)) return "message must not contain links or placeholders other than {first_name}";
  if (/[$%]|\bdiscount\b|\boff\b|\bfree\b/i.test(msg.replace(/\{first_name\}/g, ""))) return "message must not mention prices, discounts or offers";
  return null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : undefined);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);

function readFilter(i: Record<string, unknown>): CustomerFilter {
  return {
    risk_segment: oneOf(i.risk_segment, ["Churned", "At Risk", "Stable"] as const),
    markov_state: oneOf(i.markov_state, ["C", "X", "R_at_risk", "R_on_fence", "R_loyal"] as const),
    sms: oneOf(i.sms, ["messageable", "blocked", "held", "invalid_number", "opted_out"] as const),
    min_days_since_visit: num(i.min_days_since_visit),
    max_days_since_visit: num(i.max_days_since_visit),
    min_clv: num(i.min_clv),
    min_visits: num(i.min_visits),
    max_visits: num(i.max_visits),
    search: str(i.search),
  };
}

function describeFilter(f: CustomerFilter): string {
  const parts: string[] = [];
  if (f.risk_segment) parts.push(f.risk_segment);
  if (f.markov_state) parts.push(`state ${f.markov_state}`);
  if (f.min_days_since_visit != null) parts.push(`${f.min_days_since_visit}+ days since visit`);
  if (f.max_days_since_visit != null) parts.push(`under ${f.max_days_since_visit} days since visit`);
  if (f.min_visits != null) parts.push(`${f.min_visits}+ visits`);
  if (f.max_visits != null) parts.push(`up to ${f.max_visits} visits`);
  if (f.min_clv != null) parts.push(`CLV $${f.min_clv}+`);
  if (f.search) parts.push(`name contains "${f.search}"`);
  return parts.join(", ") || "all clients";
}

const stripSensitive = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).filter(([k]) => !/email|phone|password|token|secret|key/i.test(k)));

// ─── Executor ────────────────────────────────────────────────────────────────
export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolCtx): Promise<{ text: string; isError?: boolean }> {
  try {
    const out = await exec(name, input ?? {}, ctx);
    return { text: JSON.stringify(out).slice(0, 12000) };
  } catch (e: any) {
    return { text: JSON.stringify({ error: e?.message ?? "tool failed" }), isError: true };
  }
}

async function exec(name: string, i: Record<string, unknown>, ctx: ToolCtx): Promise<unknown> {
  switch (name) {
    case "get_business_summary": {
      const rows = await getCustomers(ctx.supabase, ctx.venueId, ctx.businessId);
      return summarise(rows);
    }

    case "query_customers": {
      const rows = await getCustomers(ctx.supabase, ctx.venueId, ctx.businessId);
      const matched = filterCustomers(rows, readFilter(i));
      const limit = Math.min(Math.max(Math.round(num(i.limit) ?? 10), 1), 25);
      const sorted = sortCustomers(matched, oneOf(i.sort_by, ["intervention_value", "clv", "churn_score", "days_since_visit", "visits"] as const) as SortKey | undefined, i.direction === "asc" ? "asc" : "desc");
      return {
        total_matching: matched.length,
        total_intervention_value_aud: Math.round(matched.reduce((s, c) => s + c.intervention_value_aud, 0)),
        returned: Math.min(limit, sorted.length),
        customers: sorted.slice(0, limit),
        note: "days_since_last_visit is 0 and has_upcoming_booking is true for clients with a future booking.",
      };
    }

    case "get_sms_history": {
      const days = Math.min(Math.max(Math.round(num(i.days) ?? 30), 1), 90);
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const { data, error } = await ctx.supabase
        .from("sms_outreach")
        .select("status, cost, sent_at, markov_state, risk_segment")
        .eq("venue_id", ctx.venueId)
        .gte("sent_at", since)
        .order("sent_at", { ascending: false })
        .limit(2000);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      const by_status: Record<string, number> = {};
      const by_state: Record<string, number> = {};
      let cost = 0;
      rows.forEach((r: any) => {
        by_status[r.status ?? "unknown"] = (by_status[r.status ?? "unknown"] ?? 0) + 1;
        if (r.markov_state) by_state[r.markov_state] = (by_state[r.markov_state] ?? 0) + 1;
        cost += Number(r.cost) || 0;
      });
      return { window_days: days, total_messages: rows.length, by_status, by_client_type: by_state, total_cost_aud: Math.round(cost * 100) / 100, latest_sent_at: rows[0]?.sent_at ?? null };
    }

    case "get_barber_stats": {
      const [b, s] = await Promise.all([ctx.supabase.from("barbers").select("*").limit(25), ctx.supabase.from("barber_stats").select("*").limit(50)]);
      return {
        barbers: (b.data ?? []).map((r) => stripSensitive(r as Record<string, unknown>)),
        stats: (s.data ?? []).map((r) => stripSensitive(r as Record<string, unknown>)),
        errors: [b.error?.message, s.error?.message].filter(Boolean),
      };
    }

    case "create_campaign_draft": {
      const message = ascii(String(i.message ?? ""));
      const problem = messageProblem(message);
      if (problem) return { error: problem };
      if (!message.includes("{first_name}")) return { error: "message must include {first_name}" };
      const f = readFilter(i);
      const rows = await getCustomers(ctx.supabase, ctx.venueId, ctx.businessId);
      const matched = filterCustomers(rows, { ...f, sms: undefined });
      const audience = matched.filter((c) => c.sms_status === "ok");
      const draft: CampaignDraft = {
        id: `d${Date.now().toString(36)}${ctx.drafts.length}`,
        name: (str(i.name) ?? "Campaign").slice(0, 60),
        message,
        audience_size: audience.length,
        excluded_blocked: matched.length - audience.length,
        est_cost_aud: Math.round(audience.length * SMS_COST_AUD * 100) / 100,
        segment: f.risk_segment as SegFilter | undefined,
        filters_summary: describeFilter(f),
      };
      ctx.drafts.push(draft);
      return { staged: true, audience_size: draft.audience_size, excluded_blocked: draft.excluded_blocked, est_cost_aud: draft.est_cost_aud, note: "Draft shown to the owner. Nothing has been sent." };
    }

    case "navigate": {
      const p = PAGES[String(i.page)];
      if (!p) return { error: "unknown page" };
      ctx.actions.push({ type: "navigate", path: p.path, label: p.label });
      return { ok: true, going_to: p.label };
    }

    case "set_dashboard_filters": {
      const segment = oneOf<SegFilter>(i.segment, ["all", "Churned", "At Risk", "Stable"]);
      const sms_status = oneOf<SmsFilter>(i.sms_status, ["all", "ok", "blocked", "held", "invalid_number", "opted_out"]);
      const search = typeof i.search === "string" ? i.search.slice(0, 60) : undefined;
      ctx.actions.push({ type: "set_filters", segment, sms_status, search });
      return { ok: true, applied: { segment, sms_status, search } };
    }

    case "scroll_dashboard": {
      const section = oneOf<DashboardSection>(i.section, ["kpis", "recovery", "heatmap", "brief", "ai", "charts", "clients"]);
      if (!section) return { error: "unknown section" };
      ctx.actions.push({ type: "scroll_to", section });
      return { ok: true };
    }

    case "open_sms_composer": {
      const id = String(i.user_id ?? "");
      const rows = await getCustomers(ctx.supabase, ctx.venueId, ctx.businessId);
      const c = rows.find((r) => r.user_id === id);
      if (!c) return { error: "No such client. Use a user_id returned by query_customers." };
      if (c.sms_status !== "ok") return { error: `This client cannot be messaged (${c.sms_status}).` };
      let draft: string | undefined;
      if (typeof i.draft === "string" && i.draft.trim()) {
        draft = ascii(i.draft);
        const problem = messageProblem(draft);
        if (problem) return { error: problem };
      }
      ctx.actions.push({ type: "open_sms", user_id: id, draft });
      return { ok: true, opened_for: c.name, note: "The owner must review and press Send. Nothing has been sent." };
    }

    default:
      return { error: `unknown tool ${name}` };
  }
}
