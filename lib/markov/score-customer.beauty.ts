// lib/markov/score-customer.beauty.ts

import { supabaseAdmin } from '@/lib/supabase/client';
import { buildBeautyTransitionMatrix } from './matrix.beauty';
import { churnScore, computeLoyaltyScores } from './predictions.beauty';
import { computeBeautyCLV, computeBeautyInterventionValue } from './predictions.beauty';
import { classifyRiskSegment } from './risk-segment';
import { BeautyState } from './type.beauty';

export async function scoreBeautyCustomer(
  userId: string,
  venueId: string
): Promise<void> {
  
  // 1. Fetch user's current state and visit pattern
  const { data: user } = await supabaseAdmin
    .from('users')
    .select(`
      total_visits,
      last_seen_at,
      avg_visit_gap_days,
      preferred_barber_id
    `)
    .eq('id', userId)
    .eq('venue_id', venueId)
    .single();
  
  if (!user) throw new Error(`User ${userId} not found`);
  
  // 2. Get most recent event to determine current state
  const { data: lastEvent } = await supabaseAdmin
    .from('events')
    .select('state, occurred_at')
    .eq('user_id', userId)
    .eq('venue_id', venueId)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .single();
  
  if (!lastEvent) throw new Error(`No events for user ${userId}`);
  
  const current_state = lastEvent.state as BeautyState;
  const days_since_last = Math.floor(
    (Date.now() - new Date(lastEvent.occurred_at).getTime()) / (1000 * 60 * 60 * 24)
  );
  const gap_ratio = user.avg_visit_gap_days > 0 
    ? days_since_last / user.avg_visit_gap_days 
    : 0;
  
  // 3. Build transition matrices
  const P_baseline = await buildBeautyTransitionMatrix(venueId, 'baseline');
  const P_deal = await buildBeautyTransitionMatrix(venueId, 'deal_active');
  
  // 4. Get venue config
  const { data: config } = await supabaseAdmin
    .from('venue_config')
    .select('*')
    .eq('venue_id', venueId)
    .single();
  
  if (!config) throw new Error(`Venue config not found for ${venueId}`);
  
  // 5. Compute all scores
  const churn_score_5 = churnScore(current_state, P_baseline, 5);
  const churn_score_10 = churnScore(current_state, P_baseline, 10);
  
  const loyalty_scores = computeLoyaltyScores(P_baseline);
  const loyalty_score = loyalty_scores[current_state];
  
  const clv_cents = computeBeautyCLV(current_state, P_baseline, config);
  
  // Compute intervention value (assume $15 discount)
  const discount_cents = 1500;
  const intervention_value_cents = computeBeautyInterventionValue(
    current_state,
    P_baseline,
    P_deal,
    config,
    discount_cents
  );
  
  // 6. Classify risk segment
  const risk_classification = classifyRiskSegment(
    current_state,
    churn_score_5,
    loyalty_score,
    gap_ratio,
    days_since_last
  );
  
  // 7. Write to customer_scores table
  await supabaseAdmin
    .from('customer_scores')
    .upsert({
      user_id: userId,
      venue_id: venueId,
      current_state,
      last_event_at: lastEvent.occurred_at,
      total_visits: user.total_visits,
      days_since_last_visit: days_since_last,
      avg_visit_gap_days: user.avg_visit_gap_days,
      gap_ratio,
      churn_score_5,
      churn_score_10,
      loyalty_score,
      clv_cents,
      intervention_value_cents,
      risk_segment: risk_classification.segment,
      intervention_recommended: intervention_value_cents > 0,
      preferred_barber_id: user.preferred_barber_id,
      updated_at: new Date().toISOString()
    });
  
  console.log(`✅ Scored ${userId}: ${risk_classification.segment} (churn: ${(churn_score_5 * 100).toFixed(1)}%, loyalty: ${(loyalty_score * 100).toFixed(1)}%)`);
}