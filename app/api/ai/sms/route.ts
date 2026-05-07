import { NextRequest, NextResponse } from "next/server";
 
// ─── Markov State Logic ───────────────────────────────────────────────────────
 
type MarkovState = "C" | "X" | "R_at_risk" | "R_on_fence" | "R_loyal";
 
function deriveMarkovState(customer: {
  visits: number;
  gap_ratio: number;
  status: string;
  days_overdue: number;
}): MarkovState {
  if (customer.visits <= 1) return "C";
  if (customer.gap_ratio > 2.5 || customer.status === "X") return "X";
  if (customer.gap_ratio > 1.3) return "R_at_risk";
  if (customer.gap_ratio > 1.0) return "R_on_fence";
  return "R_loyal";
}
 
const STATE_STRATEGY: Record<MarkovState, string> = {
  C: "First-timer follow-up. Critical window is days 35–45 after first visit before the habit breaks. NO discount — just a warm rebook nudge with urgency framing (barber availability). Reference their specific barber if known.",
  X: "Churned customer (112+ days lapsed). Aggressive win-back required. Use $20–30 discount. Lead with loss aversion — 'We miss you' outperforms discount-first by 2.3x. Include anchoring: show full price then discount. Add scarcity (limited slots).",
  R_at_risk: "At-risk loyal customer (gap_ratio 1.3–2.5). Send $10–20 discount. High ROI. Use loss aversion framing — focus on 'looking sharp' identity, not the discount. Barber personalisation increases response 3x. Act urgently.",
  R_on_fence: "On the fence (gap_ratio 1.0–1.3). Gentle reminder ONLY. Do NOT offer a discount — they may rebook without it and you'll destroy margin. Use scarcity and habit prompts. Reference their regular cycle.",
  R_loyal: "Loyal customer (gap_ratio < 1.0). Appreciation message only. Never offer a discount — they are already coming back. A discount here costs pure margin with zero behaviour change.",
};
 
// ─── System Prompt ────────────────────────────────────────────────────────────
 
const SYSTEM_PROMPT = `You are RydraAI, an SMS copywriter specialising in barbershop customer recovery for Alkami Barbershop in Canberra, Australia.
 
You combine Markov chain customer behaviour modelling with behavioural economics to write SMS messages that convert.
 
MARKOV CHAIN STATES:
- C (Completed): First-time customer. Habit-formation window is days 35–45.
- R (Return): Loyal repeat customer. Sub-states: loyal (gap<1.0), on-fence (1.0–1.3), at-risk (1.3–2.5).
- X (Churned): Lapsed 112+ days. Requires aggressive win-back.
 
BEHAVIOURAL ECONOMICS RULES:
- Loss aversion: "We miss you" beats "Come back for a discount" by 2.3x conversion
- Habit formation: Customers who rebook within 50 days have 89% retention
- Social proof: "Your barber [name] has an opening" → 3x more effective than generic SMS
- Scarcity: "Only 2 slots left this week" drives urgency without discounting
- Anchoring: Always show "$70 service, $20 off = $50" NOT just "$50 special"
- Peak-end rule: Send at 11am–2pm (40% higher response than 6pm–9pm)
- Identity framing: "Stay looking sharp" beats "Book now" — ties to self-image
 
DISCOUNT RULES (CRITICAL):
- gap_ratio < 1.0 (loyal): NEVER discount. They're already coming back.
- gap_ratio 1.0–1.3 (on fence): NO discount. Gentle nudge only.
- gap_ratio 1.3–2.5 (at risk): $10–20 discount. High ROI.
- gap_ratio > 2.5 (churned): $20–30 win-back offer.
- First timers (C state): NO discount. Just rebook prompt.
 
ALKAMI BARBERSHOP CONTEXT:
- Location: Canberra, Australia
- Average service: $70 (haircut + beard trim)
- Profit margin: 60% ($42 per service)
- Average visit cycle: 45 days (6 weeks)
- Churn threshold: 112 days
- Best rebook window: 38–42 days after last visit
- Peak booking: Thursday–Saturday 10am–4pm
- Booking link: [Rydra booking link]
 
SMS COPY RULES (NON-NEGOTIABLE):
- MAXIMUM 160 characters (count carefully)
- Australian English — casual and warm, not corporate
- Always include the customer's first name
- Include a clear call to action (reply BOOK, tap link, or call)
- Personalise with specific data (days since visit, their regular barber if known)
- Good: "Hey Jack! 6 weeks since your last trim. Dave has a slot this Sat — lock it in: [link]"
- Bad: "Get 20% off your next visit! Limited time offer."
- Do not use exclamation marks more than once
- Do not include emoji (poor deliverability on some carriers)
 
RESPONSE FORMAT:
Return ONLY a raw SMS message. No explanation, no preamble, no quotes around it. Just the message text itself. Maximum 160 characters.`;
 
// ─── Handler ──────────────────────────────────────────────────────────────────
 
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customer } = body;
 
    if (!customer) {
      return NextResponse.json({ error: "customer is required" }, { status: 400 });
    }
 
    const markovState = deriveMarkovState(customer);
    const strategy = STATE_STRATEGY[markovState];
 
    const weeksOverdue = Math.round(customer.days_overdue / 7);
    const firstName = customer.name?.split(" ")[0] || customer.name;
 
    const userPrompt = `Write an SMS for this specific Alkami Barbershop customer:
 
Customer: ${customer.name} (first name: ${firstName})
Phone: ${customer.phone}
Markov State: ${markovState}
Gap Ratio: ${customer.gap_ratio.toFixed(2)}x
Days Since Last Visit: ${customer.days_overdue} days (approx ${weeksOverdue} weeks)
Total Visits: ${customer.visits}
CLV: $${customer.potential_value}
Churn Score: ${customer.churn_score ? (customer.churn_score * 10).toFixed(1) + "/10" : "unknown"}
Risk Segment: ${customer.risk_segment}
 
STRATEGY FOR THIS CUSTOMER:
${strategy}
 
Write the SMS now. Remember: maximum 160 characters, Australian English, use first name (${firstName}), clear CTA. Return ONLY the message text.`;
 
    // ── OpenAI Primary ──────────────────────────────────────────────────────
    const openaiKey = process.env.OPENAI_API_KEY;
 
    if (openaiKey) {
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: userPrompt },
            ],
            max_tokens: 100,
            temperature: 0.7,
          }),
        });
 
        if (!response.ok) throw new Error(`OpenAI error: ${response.status}`);
        const data = await response.json();
        const message = data.choices[0].message.content.trim();
 
        return NextResponse.json({
          message,
          markov_state: markovState,
          strategy,
          char_count: message.length,
        });
      } catch (err) {
        console.error("[SMS AI] OpenAI failed, trying Anthropic:", err);
      }
    }
 
    // ── Anthropic Fallback ─────────────────────────────────────────────────
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json({ error: "No AI keys configured" }, { status: 503 });
    }
 
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 100,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
 
    if (!response.ok) throw new Error(`Anthropic error: ${response.status}`);
    const data = await response.json();
    const message = data.content[0].text.trim();
 
    return NextResponse.json({
      message,
      markov_state: markovState,
      strategy,
      char_count: message.length,
    });
  } catch (error: any) {
    console.error("[SMS AI] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}