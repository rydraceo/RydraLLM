import { NextRequest, NextResponse } from "next/server";
 
// ─── Scenario definitions ─────────────────────────────────────────────────────
 
const SCENARIOS: Record<string, {
  title: string;
  setup: string;
  clientName: string;
  clientMood: string;
  clientBackground: string;
  successIndicators: string[];
  commonMistakes: string[];
}> = {
  rebooking: {
    title: "Rebooking After Service",
    setup: "You've just finished the cut. The client is looking in the mirror, happy with the result. They're about to stand up and leave.",
    clientName: "Marcus",
    clientMood: "Happy, satisfied, slightly distracted — checking phone",
    clientBackground: "Regular client, comes every 5-6 weeks. Has never rebooked in the chair before.",
    successIndicators: [
      "Barber gives a specific date, not a vague timeframe",
      "Barber offers two time options (choice between two yeses)",
      "Barber acts assumptively — doesn't ask IF they want to rebook",
    ],
    commonMistakes: [
      "'Would you like to rebook?' — yes/no question, 78.8% chance of a no",
      "Vague timeframe like 'see you in a few weeks'",
      "Waiting for the client to ask first",
    ],
  },
  upsell_beard: {
    title: "Beard Treatment Upsell",
    setup: "Mid-cut. You notice the client's beard is dry and coarse. This is your moment.",
    clientName: "Daniel",
    clientMood: "Relaxed, passive — scrolling phone between questions",
    clientBackground: "First time client. Works in finance. Willing to spend if the value is clear.",
    successIndicators: [
      "Observes and states the problem before offering the solution",
      "Mentions a concrete benefit (lasts longer, looks better)",
      "Picks up the product — assumes the yes, doesn't ask",
      "Mentions social proof ('most guys do it')",
    ],
    commonMistakes: [
      "Asking 'would you like a treatment?' without stating why",
      "Overwhelming with too many options",
      "Not picking up the product — missing the assumptive close",
    ],
  },
  win_back: {
    title: "Win Back a Lapsed Client",
    setup: "A client walks in who hasn't been in for 4 months. They were a regular before. They look slightly sheepish.",
    clientName: "James",
    clientMood: "Slightly guilty, expecting judgment. Quietly hoping you remember them.",
    clientBackground: "Was a monthly regular for a year. Went elsewhere or just got busy. Hasn't booked since.",
    successIndicators: [
      "Makes client feel welcome, not judged",
      "Acknowledges the gap without dwelling on it",
      "Asks what happened in a warm, curious way",
      "Locks in the next appointment before they leave",
    ],
    commonMistakes: [
      "Making them feel bad about being away",
      "Not addressing the absence at all — missed opportunity",
      "Failing to rebook at the end",
    ],
  },
  first_timer: {
    title: "First Timer Conversion",
    setup: "Brand new client, first time ever at Alkami. Just sat down. Looks around a bit nervously.",
    clientName: "Tom",
    clientMood: "Pleased but unsure — evaluating whether this is their new place",
    clientBackground: "Was referred by a friend. Good disposable income. If impressed, will become a regular.",
    successIndicators: [
      "Makes them feel immediately welcome and at ease",
      "Asks smart questions about their style/history",
      "Mentions the shop's quality or reputation naturally",
      "Locks in second appointment before they leave",
    ],
    commonMistakes: [
      "Going straight into the cut without building rapport",
      "Not asking enough about their preferences",
      "Forgetting to rebook — first-timers need this most",
    ],
  },
  product_retail: {
    title: "Product Retail Sale",
    setup: "You're finishing the style. The client touches their hair and asks 'what product are you using?'",
    clientName: "Ryan",
    clientMood: "Curious, engaged — clearly interested in the product",
    clientBackground: "Mid-30s professional. Has used drugstore products his whole life. Interested but price-sensitive.",
    successIndicators: [
      "Names the specific product and why you chose it for their hair",
      "Explains the benefit in their language (holds all day, looks natural)",
      "Moves toward the shelf — physical action signals the sale",
      "Gives a price anchor (worth $X, lasts 3 months)",
    ],
    commonMistakes: [
      "Just naming the product without selling the benefit",
      "Hesitating when mentioning the price",
      "Not physically showing the product",
    ],
  },
};
 
// ─── Build system prompts ─────────────────────────────────────────────────────
 
function buildRoleplayPrompt(
  scenarioId: string,
  barber: { name: string },
  stats: any,
): string {
  const scenario = SCENARIOS[scenarioId];
  const firstName = barber.name.split(" ")[0];
 
  return `You are playing ${scenario.clientName}, a client at Alkami Barbershop in Canberra, Australia.
 
SCENARIO: ${scenario.title}
SETUP: ${scenario.setup}
YOUR MOOD: ${scenario.clientMood}
YOUR BACKGROUND: ${scenario.clientBackground}
 
BARBER YOU'RE TALKING TO: ${firstName}
 
ROLEPLAY RULES:
- Stay in character as ${scenario.clientName}. Be realistic — natural reactions, not a pushover.
- If the barber says something that would genuinely work on a real client, respond positively and naturally.
- If they use the wrong approach (e.g. ask a yes/no question when they should use assumptive language), respond the way a real client would — neutral, noncommittal, or distracted.
- Keep responses SHORT — 1-3 sentences max. Real clients don't give long answers.
- Use casual Australian conversational language.
- If the barber nails it, you can say something like "Yeah sweet, lock me in" or similar.
- After every 3-4 exchanges, end your response with a line break and then:
  [COACH FEEDBACK: Give 2-3 sentences of specific coaching feedback for ${firstName}. Reference what they did well or what the better approach would have been. Be direct and specific.]
 
SUCCESS CRITERIA for this scenario:
${scenario.successIndicators.map((s, i) => `${i + 1}. ${s}`).join("\n")}
 
COMMON MISTAKES to watch for:
${scenario.commonMistakes.map((m, i) => `${i + 1}. ${m}`).join("\n")}
 
Start in character. Wait for ${firstName} to speak first.`;
}
 
function buildCoachPrompt(barber: { name: string }, stats: any, shopAvg: any): string {
  const firstName = barber.name.split(" ")[0];
  const recentRebook = (stats.rebook_rate * 100).toFixed(1);
  const shopRebook = shopAvg ? (shopAvg.rebook_rate * 100).toFixed(1) : "17.5";
  const avgVal = stats.avg_service_value?.toFixed(0) || "70";
  const shopVal = shopAvg?.avg_service_value?.toFixed(0) || "70";
 
  let primaryFocus = "general performance";
  let coachingPriority = "";
 
  if (stats.rebook_rate < 0.12) {
    primaryFocus = "rebooking — CRITICAL";
    coachingPriority = `${firstName}'s rebook rate is ${recentRebook}% vs ${shopRebook}% shop average. This is the single biggest revenue opportunity. Every 1% improvement = ~$${Math.round(stats.total_clients * stats.avg_appt_value * 0.01).toLocaleString()} revenue.`;
  } else if (stats.rebook_rate < 0.18) {
    primaryFocus = "rebooking improvement";
    coachingPriority = `${firstName}'s rebook rate is ${recentRebook}% vs ${shopRebook}% shop average. There's significant upside here.`;
  } else if (stats.avg_service_value < (shopAvg?.avg_service_value || 70) * 0.85) {
    primaryFocus = "upselling and service value";
    coachingPriority = `${firstName}'s avg service value is $${avgVal} vs $${shopVal} shop average. Upsells and add-ons are the quickest path to more revenue.`;
  } else if (stats.upsell_rate < 0.02) {
    primaryFocus = "upselling";
    coachingPriority = `${firstName}'s upsell rate is only ${(stats.upsell_rate * 100).toFixed(1)}%. Even hitting 5% would add thousands in revenue.`;
  }
 
  return `You are RydraCoach — the personal AI sales trainer for ${firstName} (${barber.name}) at Alkami Barbershop in Canberra, Australia.
 
You combine behavioural economics, consumer psychology, and real sales training to help ${firstName} make more money — by being a better barber and a smarter salesperson.
 
${firstName.toUpperCase()}'S PERFORMANCE DATA:
- Total revenue: $${stats.total_revenue?.toLocaleString()}
- Rebook rate: ${recentRebook}% (shop avg: ${shopRebook}%)
- Avg service value: $${avgVal} (shop avg: $${shopVal})
- Upsell rate: ${(stats.upsell_rate * 100).toFixed(1)}%
- Total clients: ${stats.total_clients}
- Returning clients: ${(stats.pct_returning_clients * 100).toFixed(1)}%
- Rating: ${stats.avg_rating}/5 from ${stats.review_count} reviews
 
PRIMARY COACHING FOCUS: ${primaryFocus}
PRIORITY CONTEXT: ${coachingPriority}
 
YOUR COACHING PHILOSOPHY:
- Use ${firstName}'s REAL numbers in every conversation
- Reference behavioural economics principles when relevant (loss aversion, social proof, scarcity, identity)
- Give VERBATIM scripts, not vague advice
- Be direct and conversational — like a senior barber mentor talking to a mate
- Celebrate wins, then push forward
- Use Australian English, casual tone
- Short, punchy responses unless explaining a technique in depth
 
KEY SCRIPTS YOU KNOW:
REBOOKING: "Before you head off — let's get your next appointment locked in. Four weeks from today puts you on [DATE]. I have 10am or 2pm — which works better for you?" (Two options = choice between two yeses. Never ask "would you like to rebook?")
UPSELL: Observe the problem first → state it casually → name the solution + benefit → pick up the product → assume the yes. "Your beard's looking a bit dry — I'll add a quick treatment, takes two minutes and makes it last way longer."
LOYALTY: Acknowledge returning clients by name. Small gestures = massive loyalty signals.
RETAIL: Name the product, explain WHY for their hair type, show it physically, give a price anchor.
 
RESPONSE STYLE:
- Start warm and personal — you know ${firstName}'s numbers
- Be specific to their stats — not generic
- Always end with one concrete action or target`;
}
 
function buildMissionPrompt(barber: { name: string }, stats: any, shopAvg: any): string {
  const firstName = barber.name.split(" ")[0];
  const today = new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
 
  return `Generate ${firstName}'s personalised RydraCoach daily mission for ${today}.
 
THEIR DATA:
- Rebook rate: ${(stats.rebook_rate * 100).toFixed(1)}% (shop avg: ${shopAvg ? (shopAvg.rebook_rate * 100).toFixed(1) : "17.5"}%)
- Avg service: $${stats.avg_service_value?.toFixed(0)} (shop avg: $${shopAvg?.avg_service_value?.toFixed(0) || "70"})
- Upsell rate: ${(stats.upsell_rate * 100).toFixed(1)}%
- Total appts: ${stats.total_appts}
- Returning clients: ${(stats.pct_returning_clients * 100).toFixed(1)}%
 
FORMAT YOUR RESPONSE EXACTLY LIKE THIS:
 
🎯 TODAY'S MISSION
[One punchy sentence about what ${firstName} is focusing on today]
 
📊 YOUR TARGET
[Specific measurable number - e.g. "Rebook 4 clients today" or "Upsell 3 beard treatments"]
 
💡 THE PLAY
[2-3 sentences on exactly HOW to hit the target. Be specific. Include the verbatim script if relevant.]
 
⚡ WHY THIS MATTERS
[1-2 sentences connecting today's target to their annual revenue impact. Use their actual numbers.]
 
Keep the whole thing under 150 words. Direct, energising, specific to ${firstName}'s actual numbers.`;
}
 
// ─── Handler ──────────────────────────────────────────────────────────────────
 
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { barber, stats, shop_avg, type, scenario_id, messages, query } = body;
 
    if (!barber || !stats) {
      return NextResponse.json({ error: "barber and stats required" }, { status: 400 });
    }
 
    let systemPrompt = "";
    let userMessage = "";
    let conversationHistory: { role: string; content: string }[] = [];
 
    if (type === "daily_mission") {
      systemPrompt = buildCoachPrompt(barber, stats, shop_avg);
      userMessage = buildMissionPrompt(barber, stats, shop_avg);
    } else if (type === "roleplay" && scenario_id) {
      systemPrompt = buildRoleplayPrompt(scenario_id, barber, stats);
      conversationHistory = messages || [];
      userMessage = query || "Start the scenario.";
    } else if (type === "coach_chat") {
      systemPrompt = buildCoachPrompt(barber, stats, shop_avg);
      conversationHistory = messages || [];
      userMessage = query || "";
    } else if (type === "scenario_feedback") {
      systemPrompt = buildCoachPrompt(barber, stats, shop_avg);
      userMessage = `Review this roleplay conversation and give ${barber.name.split(" ")[0]} detailed feedback on their sales technique. Scenario: ${scenario_id}.\n\nConversation:\n${(messages || []).map((m: any) => `${m.role === "user" ? barber.name.split(" ")[0] : "Client"}: ${m.content}`).join("\n")}\n\nGive specific feedback on: what they did well, what could be improved, and the exact wording they should use next time. Be direct and reference their actual numbers where relevant.`;
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
 
    const openaiMessages = [
      ...conversationHistory.map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: userMessage },
    ];
 
    // OpenAI primary
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }, ...openaiMessages],
            max_tokens: 500,
            temperature: type === "roleplay" ? 0.9 : 0.75,
          }),
        });
        if (!res.ok) throw new Error(`OpenAI: ${res.status}`);
        const data = await res.json();
        return NextResponse.json({ response: data.choices[0].message.content });
      } catch (err) {
        console.error("[RydraCoach] OpenAI failed:", err);
      }
    }
 
    // Anthropic fallback
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 500,
          system: systemPrompt,
          messages: openaiMessages,
        }),
      });
      if (!res.ok) throw new Error(`Anthropic: ${res.status}`);
      const data = await res.json();
      return NextResponse.json({ response: data.content[0].text });
    }
 
    return NextResponse.json({ error: "No AI keys configured" }, { status: 503 });
  } catch (error: any) {
    console.error("[RydraCoach]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}