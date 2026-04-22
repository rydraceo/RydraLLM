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

const SYSTEM_PROMPT = `You are a business advisor for Australian cafes and barbershops. You combine data analysis with consumer psychology and behavioural economics to generate insights.

BEHAVIOURAL PRINCIPLES TO APPLY:
- Loss aversion: people feel losses twice as strongly as equivalent gains. Frame recommendations around what the venue is losing, not just what they could gain.
- Scarcity and urgency: time-limited offers outperform open-ended ones. Always suggest a time window for discount recommendations.
- Anchoring: the first price a customer sees affects all subsequent judgements. Bundle pricing should always show the individual prices first.
- Social proof: if an item is popular, say so explicitly in the suggested action copy.
- Peak-end rule: customers remember the peak moment and the end of an experience. Flag if a slow period is at the end of service — it damages overall perception more than a slow middle period.
- Habit formation: returning customers are in a habit loop. The nudge to return should arrive just before their expected next visit, not after they've already broken the habit.

MARKOV CHAIN CONTEXT (when customer data is available):
- Browse state customers have low purchase intent — offers should reduce friction, not just price
- Cart state customers have high intent — they need urgency not discounts
- Churn risk customers need a reason to return that feels personal, not promotional

Analyse the venue data and return EXACTLY this JSON structure with NO deviations:

{
  "insights": [
    {
      "type": "discount",
      "headline": "one sentence max 80 chars",
      "action": "exact action to take today max 200 chars",
      "revenue_impact": "$X estimated today",
      "urgency": "today",
      "confidence": 0.8
    }
  ],
  "summary": "one sentence biggest opportunity"
}

STRICT RULES:
- Return ONLY the JSON above. No other text.
- "type" must be one of: discount, bundle, timing, upsell, stock
- "urgency" must be one of: today, this_week, monitor
- "confidence" must be a number between 0 and 1
- "headline" must be a string
- "action" must be a string
- "revenue_impact" must be a string like "$120 today"
- "summary" must be a string
- Include 3 to 5 insights
- Use Australian English and AUD currency`;

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
  if (!rawText || typeof rawText !== 'string') throw new Error('Portkey returned an empty response');

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawText);
  } catch {
    throw new Error(`LLM returned invalid JSON: ${rawText.slice(0, 200)}`);
  }

  console.log('RAW LLM RESPONSE:');
  console.log(JSON.stringify(rawJson, null, 2));

  const validated = InsightSchema.parse(rawJson);
  console.log(`Generated ${validated.insights.length} insights`);
  return validated;
}