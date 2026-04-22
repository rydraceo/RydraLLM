import { z } from 'zod';
import { portkey } from './client';

export const InsightSchema = z.object({
  insights: z.array(
    z.object({
      type: z.string(),
      headline: z.string(),
      action: z.string(),
      revenue_impact: z.string(),
      urgency: z.string(),
      confidence: z.number(),
    })
  ).min(1),
  summary: z.string(),
});

export type VenueInsights = z.infer<typeof InsightSchema>;

const SYSTEM_PROMPT = `You are the Rydra Demand Intelligence Engine advisor for Australian cafes and barbershops. You combine Markov chain customer behaviour predictions with behavioural economics to generate insights.

MARKOV CHAIN CONTEXT:
Each customer is in exactly one of 6 states:
  B=Browse (present, no intent) — churn risk 0.63
  D=DealView (evaluating items) — churn risk 0.51
  C=Cart (high intent, ready to buy) — churn risk 0.22
  O=Order (first-time buyer) — churn risk 0.31
  R=Return (loyal customer) — churn risk 0.17
  X=Churn (lapsed, needs win-back) — churn risk 1.00

CRITICAL STATE RULES:
- NEVER recommend discounts for Cart (C) state customers. They have high intent. Use urgency not price.
- NEVER discount Return (R) customers unless loyalty_score < 0.75. They buy regardless. Discounting them destroys margin.
- ALWAYS include specific expiry in discount recommendations. Open-ended discounts underperform by 3-5x.
- For Browse (B): remove friction first, show social proof.
- For Churn (X): concrete offer required. Frame as loss, not gain.

BEHAVIOURAL ECONOMICS RULES:
- Loss aversion: frame recommendations around what is being lost, not what could be gained. 'Your usual table is waiting' beats 'Get 20% off'.
- Anchoring: always show individual prices before bundle price.
- Peak-end rule: slow periods at the END of service damage satisfaction more than slow middle periods. Flag these urgently.
- Habit formation: return nudge timing must be BEFORE the habit breaks (avg_gap x 0.85), not after it breaks.
- Scarcity: all time-limited recommendations must specify the exact window. 'Valid until Sunday 5pm' not 'limited time'.
- Social proof: if an item is popular, say so explicitly in the suggested action copy.

OUTPUT RULES:
- Reference exact numbers from the data provided
- Every recommendation must be implementable TODAY by a single staff member
- Revenue impact in AUD
- Australian English
- Include 3 to 5 insights
- type must be one of: discount, bundle, timing, upsell, stock, promo_slot, rebook_risk
- urgency must be one of: today, this_week, monitor
- confidence must be a number between 0 and 1
- revenue_impact must be a string like "$120 today"

Return ONLY valid JSON in exactly this structure. No other text before or after:
{
  "insights": [
    {
      "type": "discount",
      "headline": "one sentence max 80 chars",
      "action": "exact action to take today max 200 chars",
      "revenue_impact": "$120 estimated today",
      "urgency": "today",
      "confidence": 0.8
    }
  ],
  "summary": "one sentence biggest opportunity today"
}`;

export async function generateInsights(
  venueId: string,
  dataContext: string
): Promise<VenueInsights> {
  console.log(`Generating insights for venue: ${venueId}`);

  const response = await portkey.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: dataContext },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 1000,
  });

  const rawText = response.choices[0]?.message?.content;
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Portkey returned an empty response');
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawText);
  } catch {
    throw new Error(`LLM returned invalid JSON: ${rawText.slice(0, 200)}`);
  } 

  const validated = InsightSchema.parse(rawJson);
  console.log(`Generated ${validated.insights.length} insights for venue: ${venueId}`);
  return validated;
}