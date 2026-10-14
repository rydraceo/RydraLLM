import { NextRequest, NextResponse } from "next/server";
import { ask } from "@/lib/llm/gateway";
 
export async function POST(request: NextRequest) {
  try {
    const { segment, markov_state, audience_size, avg_clv, avg_days_overdue, campaign_goal } = await request.json();
 
    const stateStrategies: Record<string, string> = {
      X: "Win-back message. Use loss aversion ('We miss you'). Offer $20-25 discount. Urgent but warm.",
      R_at_risk: "Recovery message. Personalised, use barber name. $10-15 discount. Scarcity ('limited spots this week').",
      R_on_fence: "Gentle nudge only. No discount. Simple rebooking prompt. Two time options.",
      C: "First-timer retention. Warm and welcoming. Lock in second appointment. No discount needed.",
      R_loyal: "Appreciation message. No discount. Recognition of loyalty. Optional upgrade offer.",
    };
 
    const strategy = stateStrategies[markov_state] || stateStrategies["R_at_risk"];
 
    const prompt = `Write a bulk SMS campaign message for Alkami Barbershop, Canberra.
 
AUDIENCE: ${audience_size} customers
SEGMENT: ${segment}
MARKOV STATE: ${markov_state}
AVG CLV: $${avg_clv}
AVG DAYS OVERDUE: ${avg_days_overdue} days
CAMPAIGN GOAL: ${campaign_goal || "Re-engage and rebook"}
 
STRATEGY FOR THIS STATE: ${strategy}
 
RULES:
- Max 160 characters
- Australian English
- Use [NAME] as placeholder for personalisation
- Use [BARBER] as placeholder for barber name
- No emojis unless naturally fitting
- End with a clear call to action (link or reply)
- Never mention competitors
 
Write ONLY the SMS message. Nothing else.`;
 
    const message = await ask({
      system: "SMS copywriter for barbershops. Concise, specific, effective.",
      user: prompt,
      maxTokens: 100,
      temperature: 0.8,
    });
    if (!message) return NextResponse.json({ error: "AI temporarily unavailable" }, { status: 503 });
    return NextResponse.json({ message: message.replace(/^["']|["']$/g, ""), strategy });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}