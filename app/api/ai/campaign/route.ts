import { NextRequest, NextResponse } from "next/server";
 
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
 
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: "SMS copywriter for barbershops. Concise, specific, effective." }, { role: "user", content: prompt }], max_tokens: 100, temperature: 0.8 }),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        return NextResponse.json({ message: data.choices[0].message.content.trim(), strategy });
      } catch (err) { console.error("[CampaignAI] OpenAI:", err); }
    }
 
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 100, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await res.json();
      return NextResponse.json({ message: data.content[0].text.trim(), strategy });
    }
 
    return NextResponse.json({ error: "No AI keys" }, { status: 503 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}