import { NextRequest, NextResponse } from "next/server";
 
// ─── Scripts library ──────────────────────────────────────────────────────────
 
const SCRIPTS = {
  rebooking: `
THE REBOOKING SCRIPT (use while client is still in the chair, before they get up):
"Before you head off — let's get your next appointment locked in. Four weeks from today puts you on [specific date]. I have 10am or 2pm — which works better for you?"
 
WHY THIS WORKS:
- NOT "Would you like to rebook?" — that's a yes/no question with a 78.8% chance of a no.
- A specific date + two time options = a choice between two yeses.
- Timing: while they're still in the chair, looking sharp, feeling good about themselves — peak state for a yes.
- The word "locked in" creates commitment language.`,
 
  upsell: `
THE UPSELL SEQUENCE:
Step 1 — Observe, don't ask: "Your beard's looking a bit dry — want me to add a quick beard treatment? Takes two minutes and makes the whole cut last longer."
Step 2 — Anchor the price: "$15 add-on — most guys do it." (Social proof + price anchoring)
Step 3 — Assume the yes: Pick up the product. Don't wait for a response.
 
TOP UPSELLS FOR BARBERSHOPS:
- Beard treatment: $15–20 (highest conversion)
- Hot towel + scalp treatment: $20–25
- Product retail: "What product are you using at home? I'll grab you one."
 
WHY IT WORKS:
- People follow the lead of what "most guys" do (social proof)
- Anchoring to a small number before full service price is already paid
- Assumption close: acting like it's already happening`,
 
  loyalty: `
THE LOYALTY SCRIPT (for returning clients):
"Hey [Name] — good to have you back. I noticed it's been [X] weeks. Everything good?"
 
Simple acknowledgment creates: recognition, connection, and natural conversation about why the gap happened — which opens the door to solving it.
 
For clients with 2+ visits: "You're one of my regulars — let me throw in [small extra] today."
Small gesture → massive loyalty signal.`,
};
 
// ─── Coaching analysis ────────────────────────────────────────────────────────
 
function buildCoachingContext(barber: any, stats: any, shopAvg: any) {
  const firstName = barber.name.split(" ")[0];
  const recentRate = (stats.rebook_rate * 100).toFixed(1);
  const shopRate = shopAvg ? (shopAvg.rebook_rate * 100).toFixed(1) : "18.0";
  const avgVal = stats.avg_service_value.toFixed(0);
  const shopVal = shopAvg ? shopAvg.avg_service_value.toFixed(0) : "70";
 
  // Determine primary coaching focus
  let primaryFocus = "general";
  if (stats.rebook_rate < 0.15) primaryFocus = "rebooking_critical";
  else if (stats.rebook_rate < 0.20) primaryFocus = "rebooking_warning";
  else if (stats.avg_service_value < (shopAvg?.avg_service_value || 70) * 0.85) primaryFocus = "upsell";
  else if (stats.upsell_rate < 0.02) primaryFocus = "upsell";
  else if (stats.pct_returning_clients < 0.18) primaryFocus = "loyalty";
 
  return { firstName, recentRate, shopRate, avgVal, shopVal, primaryFocus };
}
 
// ─── System prompt ────────────────────────────────────────────────────────────
 
function buildSystemPrompt(barber: any, stats: any, shopAvg: any): string {
  const { firstName, recentRate, shopRate, avgVal, shopVal, primaryFocus } = buildCoachingContext(barber, stats, shopAvg);
 
  return `You are the personal AI performance coach for ${firstName} (${barber.name}), a barber at Alkami Barbershop in Canberra, Australia.
 
You combine behavioural economics, consumer psychology, and real performance data to give ${firstName} specific, actionable coaching — never generic advice.
 
${firstName.toUpperCase()}'S PERFORMANCE DATA:
- Total revenue: $${stats.total_revenue?.toLocaleString()}
- Appointments: ${stats.total_appts} total | Avg value: $${stats.avg_appt_value?.toFixed(2)}
- Services sold: ${stats.services_sold} | Avg service value: $${stats.avg_service_value?.toFixed(2)}
- Rebook rate: ${recentRate}% (${stats.rebooked_clients} clients rebooked out of ${stats.total_clients})
- Upsell rate: ${(stats.upsell_rate * 100).toFixed(1)}% | ${stats.total_upsell_items} upsell items
- Returning clients: ${(stats.pct_returning_clients * 100).toFixed(1)}% | New clients: ${(stats.pct_new_clients * 100).toFixed(1)}%
- Occupancy: ${stats.occupancy_rate > 0 ? (stats.occupancy_rate * 100).toFixed(1) + '%' : 'N/A'}
- Rating: ${stats.avg_rating}/5 from ${stats.review_count} reviews
 
SHOP AVERAGES (compare ${firstName} against):
- Avg rebook rate: ${shopRate}%
- Avg service value: $${shopVal}
- Shop-wide rebook target: 22%
 
PRIMARY COACHING FOCUS: ${primaryFocus}
 
SCRIPTS YOU CAN REFERENCE:
${SCRIPTS.rebooking}
${SCRIPTS.upsell}
${SCRIPTS.loyalty}
 
COACHING PHILOSOPHY:
- Reference ${firstName}'s SPECIFIC numbers — never give generic advice
- Use behavioural economics principles (loss aversion, social proof, scarcity, identity)
- Be direct and conversational — like a senior barber coach talking to a mate
- Always give a specific script or action, not vague suggestions
- Celebrate wins before addressing gaps
- Frame opportunities as revenue, not criticism
- Use Australian English, casual tone
 
RESPONSE STYLE:
- Start with something personal and direct: "Hey ${firstName},"
- Reference their actual numbers
- Give the specific script or action verbatim
- End with a concrete target for today or this week`;
}
 
// ─── Handler ──────────────────────────────────────────────────────────────────
 
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { barber, stats, shop_avg, query, type } = body;
 
    if (!barber || !stats) {
      return NextResponse.json({ error: "barber and stats required" }, { status: 400 });
    }
 
    const systemPrompt = buildSystemPrompt(barber, stats, shop_avg);
 
    let userMessage = "";
 
    if (type === "daily_brief") {
      const { firstName, recentRate, shopRate, primaryFocus } = buildCoachingContext(barber, stats, shop_avg);
      userMessage = `Generate ${firstName}'s personalised daily coaching brief for today (${new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}).
 
Include:
1. A quick acknowledgment of a strength from their data
2. The ONE biggest opportunity they have right now with the specific number gap
3. The exact script or action to use today
4. A specific, measurable target for today (e.g., "rebook 3 clients today using the script below")
 
Primary focus based on their data: ${primaryFocus}
Rebook rate: ${recentRate}% vs ${shopRate}% shop avg
Keep it under 250 words. Conversational, direct, motivating.`;
    } else if (type === "chat" && query) {
      userMessage = query;
    } else {
      return NextResponse.json({ error: "type must be daily_brief or chat" }, { status: 400 });
    }
 
    // OpenAI primary
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMessage },
            ],
            max_tokens: 600,
            temperature: 0.8,
          }),
        });
        if (!res.ok) throw new Error(`OpenAI: ${res.status}`);
        const data = await res.json();
        return NextResponse.json({ response: data.choices[0].message.content });
      } catch (err) {
        console.error("[BarberCoach] OpenAI failed:", err);
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
          max_tokens: 600,
          system: systemPrompt,
          messages: [{ role: "user", content: userMessage }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic: ${res.status}`);
      const data = await res.json();
      return NextResponse.json({ response: data.content[0].text });
    }
 
    return NextResponse.json({ error: "No AI keys configured" }, { status: 503 });
  } catch (error: any) {
    console.error("[BarberCoach]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}