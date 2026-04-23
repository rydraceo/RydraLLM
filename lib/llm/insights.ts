import { z } from 'zod';
import { portkey } from './client';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env['https://tqjdwufeeqjlnudwvayj.supabase.co']!,
  process.env['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxamR3dWZlZXFqbG51ZHd2YXlqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjMxMDkzMywiZXhwIjoyMDkxODg2OTMzfQ.uw_Z9puHYxWJ2E9LrbTd9LHGMe8-wKwnUHoum1VGzIQ']!
);

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

const SYSTEM_PROMPT = `You are the Rydra Demand Intelligence Engine advisor for Alkami Barbershop in Canberra. You combine Markov chain customer behaviour predictions with behavioural economics to generate actionable insights.

MARKOV CHAIN CONTEXT - BEAUTY TECH STATES:
Each customer is in exactly one of 6 states:
  B=Browse (viewing services online) — churn risk 0.65
  V=Viewing (evaluating specific barber/service) — churn risk 0.48
  A=Appointment (booked but not completed) — churn risk 0.25
  C=Completed (first visit done) — churn risk 0.35
  R=Return (loyal repeat customer) — churn risk 0.18
  X=Churned (lapsed 112+ days) — churn risk 1.00

CRITICAL STATE RULES FOR BARBERSHOPS:
- NEVER discount Return (R) customers with gap_ratio < 1.0. They're coming back anyway. Discounting destroys margin.
- At Risk (R customers with gap_ratio > 1.3): Send SMS with $10-20 discount. High ROI.
- On Fence (gap_ratio 1.0-1.3): Gentle reminder SMS, NO discount. Just prompt rebooking.
- Churned (X state, gap_ratio > 2.5): Aggressive $20-30 win-back offer required.
- Completed (C state): First-time customers. Send rebook reminder at 35 days (before habit breaks at 45).
- ALWAYS include specific SMS copy in the action field.

BARBERSHOP-SPECIFIC RULES:
- Average service value: $70 (haircut + beard trim)
- Average visit gap: 45 days (6-week cycle)
- Profit margin: 60% ($42 per visit)
- Churn threshold: 112 days (2.5 × avg gap)
- Best rebook window: 38-42 days after last visit
- Peak booking times: Thursday-Saturday 10am-4pm

BEHAVIOURAL ECONOMICS FOR BEAUTY TECH:
- Loss aversion: "We miss you" beats "Come back for a discount" by 2.3x
- Habit formation: Customers who rebook within 50 days have 89% retention
- Social proof: "Your barber [name] has an opening" is 3x more effective than generic SMS
- Scarcity: "Only 2 slots left this week with your regular barber" drives urgency
- Anchoring: Show "$70 service, $20 off = $50" not just "$50 special"
- Peak-end rule: Last impression matters. SMS timing at 11am-2pm gets 40% higher response than 6pm-9pm

SMS COPY RULES:
- Maximum 160 characters
- Always include: barber name if known, specific time window, clear action
- Good: "Hey John! It's been 6 weeks. Ready for a trim? Book with Dave this Sat. Reply BOOK or call 6123 4567"
- Bad: "Get 20% off your next visit! Limited time offer."

OUTPUT RULES:
- Reference EXACT numbers from the customer data provided (gap_ratio, days_since_last_visit, total_visits)
- Every recommendation must include specific SMS copy to send
- Revenue impact in AUD (use $70 avg service × 60% margin = $42 profit per customer recovered)
- Australian English, Canberra timezone
- Include 3 to 5 insights ranked by revenue impact
- type must be one of: at_risk_sms, churned_winback, rebook_reminder, loyalty_appreciation, first_timer_followup
- urgency must be one of: today, this_week, monitor
- confidence must be between 0 and 1
- revenue_impact must be like "$840 potential this week" (show total, not per-customer)

Return ONLY valid JSON in exactly this structure:
{
  "insights": [
    {
      "type": "at_risk_sms",
      "headline": "20 at-risk customers need urgent SMS (gap_ratio 1.3-2.5)",
      "action": "Send SMS: 'Hey [Name]! It's been [X] weeks. Book with [Barber] this week, $10 off. Reply BOOK or call 6123 4567' — Target customers: [list user_ids]",
      "revenue_impact": "$840 potential (20 customers × $42 profit)",
      "urgency": "today",
      "confidence": 0.85
    }
  ],
  "summary": "biggest opportunity with specific numbers"
}`;

interface CustomerSegment {
  user_id: string;
  current_state: string;
  total_visits: number;
  days_since_last_visit: number;
  avg_visit_gap_days: number;
  gap_ratio: number;
}

async function getCustomerSegments(venueId: string): Promise<string> {
  const { data: customers, error } = await supabase
    .from('customer_scores')
    .select('user_id, current_state, total_visits, days_since_last_visit, avg_visit_gap_days, gap_ratio')
    .eq('venue_id', venueId)
    .order('gap_ratio', { ascending: false });

  if (error || !customers) {
    throw new Error(`Failed to fetch customer data: ${error?.message}`);
  }

  // Segment customers
  const atRisk = customers.filter(c => c.gap_ratio > 1.3 && c.gap_ratio <= 2.5 && c.current_state === 'R');
  const onFence = customers.filter(c => c.gap_ratio > 1.0 && c.gap_ratio <= 1.3 && c.current_state === 'R');
  const churned = customers.filter(c => c.gap_ratio > 2.5 || c.current_state === 'X');
  const loyal = customers.filter(c => c.gap_ratio < 1.0 && c.current_state === 'R');
  const firstTimers = customers.filter(c => c.current_state === 'C');

  // Calculate revenue opportunities
  const atRiskRevenue = atRisk.length * 70 * 0.6; // $70 service × 60% margin
  const churnedRevenue = churned.length * 70 * 0.6 * 0.15; // 15% win-back rate
  const onFenceRevenue = onFence.length * 70 * 0.6;

  return `
ALKAMI BARBERSHOP - REAL CUSTOMER DATA (${customers.length} total customers)

URGENT SEGMENTS (HIGHEST REVENUE OPPORTUNITY):
1. AT RISK (gap_ratio 1.3-2.5): ${atRisk.length} customers
   - Potential revenue: $${atRiskRevenue.toFixed(0)} if we act this week
   - Average gap ratio: ${(atRisk.reduce((sum, c) => sum + c.gap_ratio, 0) / atRisk.length || 0).toFixed(2)}
   - Average days since visit: ${Math.round(atRisk.reduce((sum, c) => sum + c.days_since_last_visit, 0) / atRisk.length || 0)}
   - Top 5 urgent: ${atRisk.slice(0, 5).map(c => `${c.user_id.slice(0, 8)} (${c.days_since_last_visit}d, ${c.total_visits}v, ratio ${c.gap_ratio.toFixed(2)})`).join(', ')}

2. CHURNED (gap_ratio > 2.5 OR state X): ${churned.length} customers
   - Potential revenue: $${churnedRevenue.toFixed(0)} (15% win-back rate)
   - Average days since visit: ${Math.round(churned.reduce((sum, c) => sum + c.days_since_last_visit, 0) / churned.length || 0)}
   - Top 5 to win back: ${churned.slice(0, 5).map(c => `${c.user_id.slice(0, 8)} (${c.days_since_last_visit}d, ${c.total_visits}v)`).join(', ')}

3. ON FENCE (gap_ratio 1.0-1.3): ${onFence.length} customers
   - Potential revenue: $${onFenceRevenue.toFixed(0)} (gentle nudge, NO discount)
   - These customers are at the tipping point. Don't discount, just remind.

LOYAL CUSTOMERS (PROTECT, DON'T DISCOUNT):
- ${loyal.length} customers with gap_ratio < 1.0
- DO NOT send discounts to these customers. They're already coming back.
- Consider appreciation-only messages or VIP perks.

FIRST-TIMERS TO CONVERT:
- ${firstTimers.length} customers completed first visit (state C)
- Critical window: Days 35-45 for rebook reminder
- These need follow-up SMS to establish 6-week habit

VENUE CONTEXT:
- Average service: $70 (haircut + beard trim)
- Profit margin: 60% ($42 per service)
- Target visit cycle: 45 days (6 weeks)
- Churn threshold: 112 days
- SMS cost: $0.07 per message

REVENUE CALCULATION:
- Total recoverable: $${(atRiskRevenue + churnedRevenue + onFenceRevenue).toFixed(0)}
- ROI on SMS campaign: ${((atRiskRevenue + onFenceRevenue) / (atRisk.length + onFence.length) * 0.07).toFixed(0)}:1

Generate insights focusing on the HIGHEST revenue opportunities with specific actionable SMS campaigns.
`;
}

export async function generateInsights(
  venueId: string
): Promise<VenueInsights> {
  console.log(`Generating AI insights for venue: ${venueId}`);

  // Fetch real customer data from Supabase
  const dataContext = await getCustomerSegments(venueId);
  
  console.log('Customer data context:', dataContext.slice(0, 300) + '...');

  const response = await portkey.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: dataContext },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 1500,
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
  console.log(`Generated ${validated.insights.length} insights for Alkami Barbershop`);
  return validated;
}