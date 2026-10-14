import { NextRequest, NextResponse } from "next/server";
import { ask } from "@/lib/llm/gateway";
import { runAgent, GROUNDING_RULES } from "@/lib/ai/agent";
import type { ToolCtx } from "@/lib/ai/tools";
import { ascii } from "@/lib/ai/tools";
import { parseJsonLoose } from "@/lib/ai/briefs";
import { getCustomers } from "@/lib/ai/customers";
import { loadTeam, barberFacts, num, type TeamBarber } from "@/lib/barbers/data";
import { guard, env, db } from "@/lib/campaigns/server";
import { outreachConfig } from "@/lib/outreach/data";

export const runtime = "nodejs";
export const maxDuration = 60;

// RydraCoach 2.0. Everything the coach knows about the barber is loaded here from the database. The browser only sends
// a barber slug and the conversation, so numbers can't be spoofed, and the coach can look up real clients with tools.

const SCENARIOS: Record<string, { name?: string; title: string; setup: string; mood: string; background: string; goal: string; criteria: string[]; mistakes: string[] }> = {
  rebooking: { name: "Marcus", title: "Rebooking after the cut", setup: "The cut is finished. You're looking in the mirror, happy. You're about to stand up and leave.", mood: "Happy, a bit distracted, checking your phone", background: "Regular who comes every 5-6 weeks. Has never rebooked in the chair before.", goal: "agrees to a specific next appointment before leaving",
    criteria: ["Gives a specific date, not a vague timeframe", "Offers two time options (a choice between two yeses)", "Assumes the booking rather than asking IF they want one", "Does it while still in the chair"], mistakes: ["Would you like to rebook? (yes/no question)", "See you in a few weeks", "Waiting for the client to raise it"] },
  upsell: { name: "Daniel", title: "Beard treatment add-on", setup: "Mid-cut. The beard is dry and coarse. You're sitting in the chair, scrolling your phone.", mood: "Relaxed, passive, only half listening", background: "First visit. Works in finance. Will spend if the value is clear.", goal: "accepts the beard treatment",
    criteria: ["States the problem they've noticed before offering a fix", "Names a concrete benefit", "Uses social proof (most guys do it)", "Assumes the yes (picks up the product, no 'would you like')"], mistakes: ["Asking 'want a treatment?' without a reason", "Listing too many options", "Not moving physically toward the product"] },
  win_back: { name: "James", title: "Welcoming back a lapsed client", setup: "A client who hasn't been in for 4 months walks in. They were a regular. They look a little sheepish.", mood: "Slightly guilty, expecting judgement, quietly hoping to be remembered", background: "Was a monthly regular for a year, then drifted. Hasn't booked since.", goal: "books their next appointment before leaving",
    criteria: ["Welcomes them warmly without guilt-tripping", "Acknowledges the gap briefly", "Asks warmly what's been going on", "Locks in the next appointment before they leave"], mistakes: ["Making them feel bad for being away", "Ignoring the gap completely", "Forgetting to rebook at the end"] },
  first_timer: { name: "Tom", title: "First-timer to regular", setup: "Brand new client, first time at Alkami. Just sat down and looking around a bit nervously.", mood: "Pleased but unsure whether this will be their new place", background: "Referred by a friend. Good disposable income. If impressed, becomes a regular.", goal: "books a second appointment",
    criteria: ["Puts them at ease straight away", "Asks about their style and history", "Mentions the shop's quality naturally", "Locks in a second appointment before they leave"], mistakes: ["Going straight into the cut", "Not asking about preferences", "Forgetting to rebook"] },
  retail: { name: "Ryan", title: "Product recommendation", setup: "You're finishing the style. The client touches their hair and asks what product you used.", mood: "Curious, engaged, a bit price-sensitive", background: "Mid-30s professional who has used supermarket products his whole life.", goal: "buys the product",
    criteria: ["Names the product and why it suits their hair", "Explains the benefit in plain language", "Physically hands over or shows the product", "States the price confidently with a value anchor"], mistakes: ["Just naming the product", "Hesitating on price", "Not showing the product"] },
  price: { name: "Sam", title: "Handling a price objection", setup: "You've suggested a $25 add-on. The client says 'bit pricey, I'll think about it'.", mood: "Polite but guarded", background: "Likes the shop but watches his spending.", goal: "says yes to the add-on, or to a smaller version of it",
    criteria: ["Doesn't get defensive or discount straight away", "Reframes the price as value (how long it lasts, the result)", "Offers a smaller option instead of walking away", "Stays relaxed and friendly"], mistakes: ["Dropping the price immediately", "Going quiet or backing off", "Over-explaining"] },
  complaint: { name: "Luke", title: "A cut that isn't right", setup: "You've finished. The client looks in the mirror and says 'hmm, it's a bit shorter than I wanted'.", mood: "Disappointed but trying to be polite", background: "Regular of 2 years. Has never complained before.", goal: "leaves feeling looked after and still plans to come back",
    criteria: ["Listens first and doesn't get defensive", "Acknowledges it without blaming the client", "Offers a practical fix or plan", "Rebooks or follows up so the relationship is kept"], mistakes: ["Arguing that it's what they asked for", "Making excuses", "Letting them leave unhappy"] },
};
const DIFF: Record<string, { start: number; style: string }> = {
  easy: { start: 55, style: "You are friendly and fairly easy to win over. If the barber does one or two things right, warm up quickly." },
  normal: { start: 40, style: "You are realistic. You respond well to good technique and stay noncommittal to weak technique." },
  hard: { start: 25, style: "You are tough. Vague or pushy approaches get a flat, short answer. You only agree when the barber does several things right, specifically and naturally." },
};

type Msg = { role: "user" | "assistant"; content: string };
const cleanMsgs = (v: any, max = 24): Msg[] => (Array.isArray(v) ? v : []).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-max).map((m) => ({ role: m.role, content: ascii(m.content).slice(0, 700) }));

function persona(b: TeamBarber, facts: string) {
  const first = b.name.split(" ")[0];
  return `You are RydraCoach, ${first}'s personal performance coach at Alkami Barbershop in Canberra, Australia. You are warm, direct and practical, like a senior barber who has seen it all and wants ${first} to earn more. Australian English, casual, short paragraphs. Never preachy.
You know ${first}'s real numbers (below) and you can look up their real clients with tools. You can stage a short text for ${first} to review, but you can NEVER send anything yourself.
When you coach, give the exact words to say (verbatim scripts), not vague advice. Use behavioural principles (specific dates, two-option closes, social proof, loss aversion) only where they fit.
${GROUNDING_RULES}
- Never invent a client, date, price or discount. Never promise results.

${first.toUpperCase()}'S NUMBERS
${facts}`;
}

export async function POST(req: NextRequest) {
  const g = guard(req, 40); if (g) return g;
  const e = env(); if (!e) return NextResponse.json({ error: "Server misconfigured." }, { status: 503 });
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const slug = String(body?.slug ?? ""); const type = String(body?.type ?? "");
  if (!/^[a-z0-9-]{1,60}$/i.test(slug)) return NextResponse.json({ error: "A barber is required." }, { status: 400 });

  try {
    const supabase = db();
    const team = await loadTeam(supabase, e.venueId, e.businessId);
    const b = team.barbers.find((x) => x.slug === slug);
    if (!b) return NextResponse.json({ error: "Barber not found" }, { status: 404 });
    const first = b.name.split(" ")[0];
    const facts = barberFacts(b, team);
    const ctx: ToolCtx = { supabase, venueId: e.venueId, businessId: e.businessId, actions: [], drafts: [], barberSlug: slug, texts: [] };
    const sendCfg = () => { const c = outreachConfig(); return { body_max: c.body_max, booking_link: c.booking_link }; };
    const tools = ["get_barber_profile", "get_barber_clients", "suggest_text"];

    // ── Today's game plan ───────────────────────────────────────────────────
    if (type === "mission") {
      const today = new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Sydney" });
      const r = await runAgent({
        system: persona(b, facts), ctx, tools, maxTokens: 1100,
        messages: [{ role: "user", content: `Build ${first}'s game plan for today, ${today}.
1. Call get_barber_clients to see who is due, slipping or worth a personal text. Stage up to 3 short texts with suggest_text for the best clients. If it says client lists aren't available, skip this step and base the plan on the numbers. Don't mention the missing data.
2. Pick the ONE thing from ${first}'s numbers that matters most today.
Return ONLY JSON: {"headline": string (one punchy sentence), "target": string (a measurable target for today, e.g. "Rebook 4 clients in the chair"), "play": string (2-3 sentences with the exact words to use), "why": string (one sentence linking it to their real numbers or clients)}.` }],
      });
      if (!r.ok) return NextResponse.json({ error: "AI temporarily unavailable" }, { status: r.status });
      const m: any = parseJsonLoose(r.text);
      const mission = m && typeof m.headline === "string" && typeof m.target === "string" && typeof m.play === "string" ? { headline: ascii(m.headline).slice(0, 160), target: ascii(m.target).slice(0, 140), play: ascii(m.play).slice(0, 500), why: ascii(String(m.why ?? "")).slice(0, 240) } : null;
      return NextResponse.json({ mission, response: mission ? "" : r.text, texts: ctx.texts, config: sendCfg() });
    }

    // ── Free chat with tools ────────────────────────────────────────────────
    if (type === "chat") {
      const msgs = cleanMsgs(body.messages); const q = ascii(String(body.query ?? "")).slice(0, 600);
      if (!q) return NextResponse.json({ error: "Ask something." }, { status: 400 });
      const r = await runAgent({ system: persona(b, facts), ctx, tools, maxTokens: 900, messages: [...msgs.slice(-10), { role: "user", content: q }] });
      if (!r.ok) return NextResponse.json({ error: "AI temporarily unavailable" }, { status: r.status });
      return NextResponse.json({ response: r.text, texts: ctx.texts, config: sendCfg() });
    }

    // ── Roleplay (JSON turns with a live mood meter) ────────────────────────
    if (type === "roleplay" || type === "score") {
      const sid = String(body.scenario ?? ""); const diff = DIFF[String(body.difficulty)] ? String(body.difficulty) : "normal";
      let sc = SCENARIOS[sid]; let clientName = SCENARIOS[sid]?.name ?? "Marcus"; let extra = "";
      if (!sc && sid.startsWith("real:")) {
        // Rehearse with a REAL client from this barber's book.
        const uid = sid.slice(5); const rows = await getCustomers(supabase, e.venueId, e.businessId); const c = rows.find((r) => r.user_id === uid);
        if (!c) return NextResponse.json({ error: "That client wasn't found." }, { status: 404 });
        clientName = ascii(c.name).split(" ")[0] || "Client";
        const lapsed = c.markov_state === "X" || c.gap_ratio > 1.5;
        sc = { title: `Real client: ${clientName}`, setup: lapsed ? `${clientName} hasn't been in for ${c.days_since_last_visit} days and walks into the shop.` : `${clientName} is in the chair, cut finished.`, mood: lapsed ? "A bit sheepish about being away" : "Relaxed and satisfied", background: `Has visited ${c.visits} times, usually every ${c.avg_gap_days || "few"} weeks' worth of days. Spends about $${Math.round(c.clv_aud / Math.max(c.visits, 1))} a visit.`, goal: "books their next appointment", criteria: ["Remembers and uses their history naturally", "Asks about them, not just the cut", "Gives a specific date and two time options", "Keeps it warm, not pushy"], mistakes: ["Generic script with no personal touch", "Yes/no question about rebooking", "Guilt about the gap"] };
        extra = `This is a real client of ${first}'s, so be consistent with: ${c.visits} visits, ${c.days_since_last_visit} days since the last one.`;
      }
      if (!sc) return NextResponse.json({ error: "Unknown scenario." }, { status: 400 });
      const msgs = cleanMsgs(body.messages);

      if (type === "score") {
        const transcript = msgs.map((m) => `${m.role === "user" ? first : clientName}: ${m.content}`).join("\n");
        if (msgs.filter((m) => m.role === "user").length < 1) return NextResponse.json({ error: "Have a conversation first." }, { status: 400 });
        let raw: string | null = null; let j: any = null;
        for (let attempt = 0; attempt < 2 && !(j && Array.isArray(j.criteria)); attempt++) {
        raw = await ask({
          system: `You are a sharp, fair sales coach scoring a barber's role-play. Judge ONLY what the barber actually said. Return ONLY JSON: {"score": integer 0-100, "verdict": string (one sentence), "criteria": [{"name": string, "met": boolean, "note": string (max 18 words, quote their words if useful)}], "best_line": string (the best thing they said, quoted, or ""), "upgrade": string (the exact better wording for their weakest moment, max 30 words)}. Use exactly these criteria names in order: ${JSON.stringify(sc.criteria)}.`,
          user: `Scenario: ${sc.title}. Goal: client ${sc.goal}.\nCommon mistakes: ${sc.mistakes.join("; ")}\n\nTranscript:\n${transcript}\n\nKeep every note under 18 words. Output the JSON only.`, maxTokens: 1500 });
        j = raw ? parseJsonLoose(raw) : null;
        }
        if (!j || !Array.isArray(j.criteria)) { console.error("[RydraCoach score] unparseable:", String(raw).slice(0, 600)); return NextResponse.json({ error: "Couldn't score that one. Try again." }, { status: 502 }); }
        const criteria = sc.criteria.map((name, i) => ({ name, met: !!j.criteria[i]?.met, note: ascii(String(j.criteria[i]?.note ?? "")).slice(0, 140) }));
        const score = Math.min(100, Math.max(0, Math.round(Number(j.score) || criteria.filter((c) => c.met).length * 25)));
        return NextResponse.json({ score, verdict: ascii(String(j.verdict ?? "")).slice(0, 200), criteria, best_line: ascii(String(j.best_line ?? "")).slice(0, 200), upgrade: ascii(String(j.upgrade ?? "")).slice(0, 240) });
      }

      const d = DIFF[diff];
      const system = `You are playing ${clientName}, a client at Alkami Barbershop in Canberra, Australia, in a training role-play for the barber ${first}. Stay in character.
SCENE: ${sc.setup}
YOUR MOOD: ${sc.mood}. BACKGROUND: ${sc.background} ${extra}
DIFFICULTY: ${d.style}
YOUR GOAL STATE: you only say yes (the barber's goal: ${sc.goal}) if they genuinely earn it. Real clients are not pushovers and not jerks.
Reply like a real person: 1-2 short sentences, casual Australian, no stage directions.
Track "mood" = how close you are to saying yes (0-100). It starts around ${d.start}. After EVERY barber line, move it: strong technique (specific date, two options, assuming the booking, warmth, using what you said) +10 to +25; okay technique +0 to +8; weak, vague or pushy technique -5 to -20. Reaching 80+ means you're ready to say yes. Set "closed" to true ONLY once you have clearly agreed.
Return ONLY JSON: {"reply": string, "mood": integer, "closed": boolean, "tip": string|null}. "tip" is a max-14-word hint for the barber, and only on easy difficulty when they stumble; otherwise null.`;
      const last = msgs.length ? msgs[msgs.length - 1] : null;
      const turns: Msg[] = msgs.length ? msgs.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })) : [];
      const user = last && last.role === "user" ? null : "[The barber is ready. Open the scene with your first line.]";
      const raw = await ask({ system, messages: [...turns, ...(user ? [{ role: "user" as const, content: user }] : [])], maxTokens: 500 });
      if (!raw) return NextResponse.json({ error: "AI temporarily unavailable" }, { status: 503 });
      const j: any = parseJsonLoose(raw);
      const reply = j && typeof j.reply === "string" ? ascii(j.reply).slice(0, 300) : ascii(raw).slice(0, 300);
      const mood = j && Number.isFinite(Number(j.mood)) ? Math.min(100, Math.max(0, Math.round(Number(j.mood)))) : d.start;
      return NextResponse.json({ reply, mood, closed: !!(j && j.closed === true), tip: j && typeof j.tip === "string" && j.tip ? ascii(j.tip).slice(0, 100) : null, client: clientName, start: d.start });
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  } catch (err: any) {
    console.error("[RydraCoach]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
