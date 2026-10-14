import { NextRequest, NextResponse } from "next/server";
import { ask } from "@/lib/llm/gateway";
import { guard, asciiOnly } from "@/lib/campaigns/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const ANGLES = [
  { id: "A", name: "Warm & personal", brief: "friendly, like a text from your barber; mention they have been missed" },
  { id: "B", name: "Short & direct", brief: "very short, plain, one clear nudge to book" },
  { id: "C", name: "Light urgency", brief: "gentle scarcity (limited chairs this week) without any discount or false claim" },
];

function problems(t: string, max: number): string {
  if (!t) return "empty";
  if (t.length > max) return "too long";
  if (!t.includes("{first_name}")) return "missing {first_name}";
  if (/https?:|www\.|\.com|\$|%|free|discount|reply|call/i.test(t)) return "link, price or call-to-reply";
  if ((t.match(/!/g) ?? []).length > 1) return "too many exclamation marks";
  return "";
}
const fallback = (id: string, max: number) => {
  const s: Record<string, string> = {
    A: "Hey {first_name}, it's been a while! The team at Alkami would love to see you back in the chair.",
    B: "{first_name}, time for a fresh cut? Alkami has chairs open this week.",
    C: "Hi {first_name}, Alkami's chairs fill up fast this week. Grab your spot before they go.",
  };
  return s[id].slice(0, max);
};

// POST { goal, audience: string, max_chars } -> three tone variants, each validated server-side.
export async function POST(req: NextRequest) {
  const g = guard(req, 15); if (g) return g;
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const goal = asciiOnly(String(body?.goal ?? "")).slice(0, 160);
  const audience = asciiOnly(String(body?.audience ?? "")).slice(0, 200);
  const max = Math.min(Math.max(Number(body?.max_chars) || 90, 40), 140);

  const variants = await Promise.all(ANGLES.map(async (a) => {
    const system = `You write ONE SMS for Alkami Barbershop in Canberra, Australia. Australian English, no emoji, at most one exclamation mark.
Tone: ${a.brief}.
HARD RULES: max ${max} characters. Use the literal placeholder {first_name} exactly once. Mention "Alkami" once. No links, prices, discounts, offers or phone numbers. Do not ask them to reply or call. Do not invent barber names or availability. Output only the message.`;
    const user = `Audience: ${audience || "past clients"}. ${goal ? `Goal: ${goal}.` : "Goal: get them to rebook."}`;
    let text = "", source = "ai";
    for (let i = 0; i < 2 && !text; i++) {
      const r = await ask({ system, user: i ? `${user} The previous attempt broke the rules. Follow every rule exactly.` : user, maxTokens: 120, temperature: 0.9 });
      const t = r ? asciiOnly(r).replace(/^["'`]+|["'`]+$/g, "").trim() : "";
      if (t && !problems(t, max)) text = t;
    }
    if (!text) { text = fallback(a.id, max); source = "template"; }
    return { id: a.id, name: a.name, text, source };
  }));
  return NextResponse.json({ variants, max_chars: max });
}
