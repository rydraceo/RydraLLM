import { NextRequest, NextResponse } from "next/server";
 
const SYSTEM_PROMPT = `You are an expert at configuring automated SMS intervention rules for barbershop client retention.
 
You will be given a plain-English description of a rule and must return a complete JSON configuration.
 
MARKOV STATES (use these exact keys):
- "C" = First Timer (1 visit only, hasn't rebooked yet)
- "R_at_risk" = At Risk (loyal client drifting, gap ratio 1.3x-2.5x)
- "R_on_fence" = On the Fence (slightly overdue, gap ratio 1.0x-1.3x)
- "R_loyal" = Loyal (regular client, gap ratio < 1.0x)
- "X" = Churned (very overdue, gap ratio > 2.5x, effectively lost)
 
FIELD DEFINITIONS:
- target_states: array of state keys (e.g. ["R_at_risk", "X"])
- min_clv_cents: minimum lifetime value in CENTS (e.g. 5000 = $50)
- min_days_overdue: minimum days past their usual visit cycle (0 = any)
- max_days_overdue: maximum days overdue (9999 = no limit)
- min_gap_ratio: minimum gap ratio multiplier (0 = any, 1.3 = 30% overdue)
- cooldown_days: days before same client can be contacted again by ANY rule
- max_sends_per_run: max clients to contact per nightly run (10-100)
- message_template: the SMS template, max 160 chars, use [NAME] and [BARBER] as placeholders
- send_time: "HH:MM" in AEST (e.g. "10:00", "18:00")
- send_days: array of day names from ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
- is_active: always true
 
BARBERSHOP CONTEXT:
- Average visit cycle: 28-35 days
- CLV range: $50-$5000
- At-risk clients respond best to morning sends (9-11am) on Tue/Wed/Thu
- Churned clients respond better to Sunday/Monday evening (6-8pm)
- First timers: contact between day 35-50 of no return
- Never discount loyal clients
- Typical discount: $10-20 for at-risk, $20-30 for churned
 
Return ONLY valid JSON, no markdown, no explanation. Follow this exact schema:
{
  "name": string (concise, descriptive),
  "description": string (one sentence explaining when it fires),
  "target_states": string[],
  "min_clv_cents": number,
  "min_days_overdue": number,
  "max_days_overdue": number,
  "min_gap_ratio": number,
  "cooldown_days": number,
  "max_sends_per_run": number,
  "message_template": string (max 160 chars),
  "send_time": string,
  "send_days": string[],
  "is_active": true
}`;
 
export async function POST(request: NextRequest) {
  try {
    const { description } = await request.json();
    if (!description?.trim()) {
      return NextResponse.json({ error: "Description required" }, { status: 400 });
    }
 
    const openaiKey = process.env.OPENAI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
 
    let ruleJson: string | null = null;
 
    // Try OpenAI first
    if (openaiKey) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: `Generate a rule for: "${description}"` },
            ],
            max_tokens: 600,
            temperature: 0.3,
            response_format: { type: "json_object" },
          }),
        });
        if (res.ok) {
          const data = await res.json();
          ruleJson = data.choices[0].message.content;
        }
      } catch (e) {
        console.error("[generate-rule] OpenAI failed:", e);
      }
    }
 
    // Fallback to Anthropic
    if (!ruleJson && anthropicKey) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": anthropicKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "claude-haiku-4-5",
            max_tokens: 600,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: `Generate a rule for: "${description}"` }],
          }),
        });
        if (res.ok) {
          const data = await res.json();
          ruleJson = data.content[0].text;
        }
      } catch (e) {
        console.error("[generate-rule] Anthropic failed:", e);
      }
    }
 
    if (!ruleJson) {
      return NextResponse.json({ error: "AI generation failed — check API keys" }, { status: 500 });
    }
 
    // Parse and validate
    const cleaned = ruleJson.replace(/```json|```/g, "").trim();
    const rule = JSON.parse(cleaned);
 
    // Enforce constraints
    rule.message_template = (rule.message_template || "").slice(0, 160);
    rule.is_active = true;
    rule.min_clv_cents = Math.max(0, rule.min_clv_cents || 0);
    rule.cooldown_days = Math.max(7, Math.min(90, rule.cooldown_days || 21));
    rule.max_sends_per_run = Math.max(5, Math.min(200, rule.max_sends_per_run || 50));
 
    return NextResponse.json({ rule });
  } catch (err: any) {
    console.error("[generate-rule] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
 