import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm/gateway";
import { GatewayError } from "@/lib/llm/gateway";
import { authorize, rateLimited, DENIED_MESSAGE } from "@/lib/ai/access";

export const runtime = "nodejs";
export const maxDuration = 30;

// ─── Markov State Logic ───────────────────────────────────────────────────────

type MarkovState = "C" | "X" | "R_at_risk" | "R_on_fence" | "R_loyal";

function deriveMarkovState(customer: { visits: number; gap_ratio: number; status: string }): MarkovState {
  if (customer.visits <= 1) return "C";
  if (customer.gap_ratio > 2.5 || customer.status === "X") return "X";
  if (customer.gap_ratio > 1.3) return "R_at_risk";
  if (customer.gap_ratio > 1.0) return "R_on_fence";
  return "R_loyal";
}

// The booking link is added by the server, never written by the model.
const BOOKING_LINK = (process.env.ALKAMI_BOOKING_URL || "getrydra.com/alkami").replace(/^https?:\/\//, "").replace(/\/+$/, "");
const DEFAULT_MAX = 102; // body budget: 160 minus the opt-out line

const STATE_STRATEGY: Record<MarkovState, string> = {
  C: "First-timer follow-up. The rebook window is days 35-45 after the first visit. Warm rebook nudge with light urgency. No discount.",
  X: "Lapsed for 112+ days. Win-back tone: 'we miss you'. Mention an offer ONLY if one is provided below.",
  R_at_risk: "Regular who is overdue. Identity framing ('stay looking sharp'), light scarcity. Mention an offer ONLY if one is provided below.",
  R_on_fence: "Slightly overdue. Gentle reminder only, tied to their usual cycle. No discount.",
  R_loyal: "Loyal client. Appreciation only. No discount.",
};

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You write single SMS messages for Alkami Barbershop in Canberra, Australia.

STYLE
- Australian English. Casual, warm, not corporate.
- Address the customer by first name. Mention "Alkami" once.
- Identity framing ("stay looking sharp") beats "book now". Light scarcity is fine ("spots this week").
- At most one exclamation mark. No emoji. Plain ASCII characters only.

HARD RULES
- Do NOT include any link, URL, phone number or placeholder. A booking link is added automatically after your text.
- Do NOT ask the customer to reply, text back or call.
- Do NOT state statistics, prices, percentages or discounts, except an offer explicitly provided in the request.
- Do NOT invent barber names, slots or availability you were not given.
- Maximum length is given in the request. Count carefully.

OUTPUT
Return ONLY the message text. No quotes, no preamble, no explanation.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ascii = (s: string) =>
  s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-")
   .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
   .replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();

const clean = (s: string) => ascii(s).replace(/^["'`]+|["'`]+$/g, "").trim();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function problems(t: string, firstName: string | null, copyMax: number, offer: string, slotDay = ""): string[] {
  const p: string[] = [];
  if (slotDay && !new RegExp(esc(slotDay), "i").test(t)) p.push(`must mention the open day (${slotDay})`);
  if (!t) p.push("empty message");
  if (t.length > copyMax) p.push(`over ${copyMax} characters (was ${t.length})`);
  if (firstName && !new RegExp(`\\b${esc(firstName)}\\b`, "i").test(t)) p.push(`must use the first name "${firstName}"`);
  if (!/alkami/i.test(t)) p.push('must mention "Alkami"');
  if (/[\[\]{}<>]|https?:|www\.|\.com/i.test(t)) p.push("no links or placeholders (a link is added automatically)");
  if (/\breply\b|text back|call us/i.test(t)) p.push("do not ask them to reply or call");
  if (!offer && /[$%]|\bdiscount\b|\boff\b|\bfree\b/i.test(t)) p.push("no prices, discounts or offers");
  if (offer && (t.match(/\$\d+/g) || []).some((x) => !offer.includes(x))) p.push("only mention the provided offer");
  if ((t.match(/!/g) || []).length > 1) p.push("at most one exclamation mark");
  return p;
}

function fallbackMessage(state: MarkovState, name: string | null, slotText = ""): string {
  const n = (name || "there").slice(0, 12);
  if (slotText) return `Hi ${n}, Alkami has a spot open ${slotText}. Grab it here:`;
  switch (state) {
    case "C": return `Hi ${n}, Alkami here. Ready for your next cut? Book a spot:`;
    case "X": return `Hi ${n}, we miss you at Alkami. Grab a spot this week:`;
    case "R_at_risk": return `Hi ${n}, it's been a while! Alkami has spots this week:`;
    case "R_on_fence": return `Hi ${n}, time for a fresh cut? Alkami has spots open:`;
    default: return `Thanks for backing Alkami, ${n}. Book your next cut here:`;
  }
}

async function callModel(system: string, user: string): Promise<string> {
  const r = await chat({ messages: [{ role: "system", content: system }, { role: "user", content: user }], maxTokens: 120, temperature: 0.7 });
  return r.text;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!authorize(request)) return NextResponse.json({ error: DENIED_MESSAGE }, { status: 401 });
  if (rateLimited(request, 40)) return NextResponse.json({ error: "Slow down a little. Try again in a minute." }, { status: 429 });

  try {
    const body = await request.json();
    const { customer } = body;
    if (!customer) return NextResponse.json({ error: "customer is required" }, { status: 400 });

    // Courtesy check only. The send route is what actually enforces blocking.
    if (customer.sms_blocked) {
      return NextResponse.json({ error: "This client cannot be messaged.", reason: customer.sms_status ?? "blocked" }, { status: 409 });
    }

    const visits = Number(customer.visits) || 0;
    const gap = Number(customer.gap_ratio) || 0;
    const daysOverdue = Math.max(0, Number(customer.days_overdue) || 0);
    const state = deriveMarkovState({ visits, gap_ratio: gap, status: String(customer.status ?? "") });
    const strategy = STATE_STRATEGY[state];

    const rawFirst = ascii(String(customer.name ?? "")).split(" ")[0].replace(/[^A-Za-z'\-]/g, "");
    const firstName = rawFirst.length >= 2 ? rawFirst.slice(0, 20) : null;

    const offerRaw = typeof body.offer === "string" ? ascii(body.offer) : "";
    const offer = /^\$\d{1,3} off$/i.test(offerRaw) ? offerRaw : "";

    // An open slot to offer (from the slot-fill tool). Only a tightly validated short string is ever used.
    const slotIn = body.slot && typeof body.slot === "object" ? body.slot : null;
    const okTxt = (v: unknown, re: RegExp) => (typeof v === "string" && re.test(ascii(v)) ? ascii(v) : "");
    const slotLabel = slotIn ? okTxt(slotIn.label, /^[A-Za-z]{3,9} \d{1,2} [A-Za-z]{3}$/) : "";
    const slotTime = slotIn ? okTxt(slotIn.time, /^\d{1,2}:\d{2} (am|pm)$/) : "";
    const slotBarber = slotIn ? okTxt(slotIn.barber, /^[A-Za-z' .\-]{2,30}$/) : "";
    const slotText = slotLabel ? `${slotLabel}${slotTime ? ` at ${slotTime}` : ""}${slotBarber ? ` with ${slotBarber}` : ""}` : "";
    const slotDay = slotLabel ? slotLabel.slice(0, 3) : "";

    const maxTotal = Math.min(Math.max(Number(body.max_chars) || DEFAULT_MAX, 60), 140);
    const copyMax = maxTotal - BOOKING_LINK.length - 1; // room for " " + link

    const userPrompt = `Write one SMS for an Alkami Barbershop customer.

First name: ${firstName ?? "(unknown - open with 'Hi there')"}
Client type: ${state}
Days since last visit: ${daysOverdue} (about ${Math.round(daysOverdue / 7)} weeks)
Total visits: ${visits}
Offer you may mention: ${offer || "NONE - do not mention any discount, price or offer"}
Open spot you may offer: ${slotText || "NONE - do not mention any specific day, time or availability"}

Strategy: ${slotText ? "A specific spot has just opened up. Offer it plainly with light urgency (spots go fast). Use the day and time exactly as given. No discount." : strategy}

Maximum ${copyMax} characters. Do not include a link. Return only the message.`;

    let text = "";
    let source: "ai" | "fallback" = "ai";
    try {
      text = clean(await callModel(SYSTEM_PROMPT, userPrompt));
      let issues = problems(text, firstName, copyMax, offer, slotDay);
      if (issues.length) {
        const retry = `${userPrompt}\n\nYour previous attempt was rejected: ${issues.join("; ")}.\nPrevious attempt: "${text}"\nRewrite it fixing every issue.`;
        text = clean(await callModel(SYSTEM_PROMPT, retry));
        issues = problems(text, firstName, copyMax, offer, slotDay);
      }
      if (issues.length) throw new Error(`Rejected after retry: ${issues.join("; ")}`);
    } catch (err) {
      console.error("[SMS AI] Using fallback template:", err instanceof GatewayError ? err.message : err);
      text = fallbackMessage(state, firstName, slotText);
      if (text.length > copyMax) text = text.slice(0, copyMax).trimEnd();
      source = "fallback";
    }

    const message = `${text} ${BOOKING_LINK}`;
    return NextResponse.json({ message, markov_state: state, strategy, source, char_count: message.length });
  } catch (error: any) {
    console.error("[SMS AI] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
