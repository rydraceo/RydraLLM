// lib/markov/predictions.enhanced.ts
/**
 * ENHANCED PREDICTIONS MODULE - STANDALONE VERSION
 * No dependencies on potentially mistyped helper functions
 */
 
import type { BeautyState } from './type.beauty';
import type { TransitionMatrix } from './matrix.beauty';
import type { BeautyVenueConfig } from './predictions.beauty';
import { BEAUTY_STATE_INDEX } from './type.beauty';
import { churnScore, computeBeautyCLV } from './predictions.beauty';
 
// ════════════════════════════════════════════════════════════════════
// LOCAL HELPER FUNCTIONS (to avoid type conflicts with project.ts)
// ════════════════════════════════════════════════════════════════════
 
/**
 * Create a state vector for beauty states (local version to avoid type conflicts)
 */
function beautyStateVector(state: BeautyState): number[] {
  const numStates = Object.keys(BEAUTY_STATE_INDEX).length;
  const v = Array(numStates).fill(0);
  const idx = BEAUTY_STATE_INDEX[state];
  v[idx] = 1;
  return v;
}
 
/**
 * Project state vector one step forward (local version to avoid type conflicts)
 */
function beautyProjectOneStep(v: number[], P: TransitionMatrix): number[] {
  const result = Array(v.length).fill(0);
  for (let i = 0; i < v.length; i++) {
    for (let j = 0; j < v.length; j++) {
      result[j] += v[i] * P[i][j];
    }
  }
  return result;
}
 
// ════════════════════════════════════════════════════════════════════
// ENHANCED PREDICTION TYPES
// ════════════════════════════════════════════════════════════════════
 
export interface PredictionWithConfidence {
  value: number;
  confidence_low: number;
  confidence_high: number;
  confidence_level: number;
}
 
export interface TimeToEventPrediction {
  expected_days: number;
  probability_within_7_days: number;
  probability_within_14_days: number;
  probability_within_30_days: number;
  probability_within_90_days: number;
}
 
export interface MultiHorizonScores {
  one_week: number;
  one_month: number;
  three_months: number;
  one_year: number;
}
 
export interface PersonalizedIntervention {
  segment: 'at_risk' | 'on_the_fence' | 'loyal' | 'churned';
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'none';
  recommended_action: string;
  message_template: string;
  discount_amount_cents: number;
  expected_roi: number;
  expected_conversion_rate: number;
  timing_recommendation: string;
  channel: 'sms' | 'email' | 'both';
}
 
export interface ComprehensiveCustomerIntelligence {
  current_state: BeautyState;
  churn_scores: MultiHorizonScores;
  loyalty_score: number;
  clv_cents: number;
  time_to_churn: TimeToEventPrediction;
  time_to_next_visit: TimeToEventPrediction;
  expected_visits_next_year: PredictionWithConfidence;
  expected_revenue_next_year_cents: PredictionWithConfidence;
  gap_ratio: number;
  days_since_last_visit: number;
  avg_visit_gap_days: number;
  visit_frequency_trend: 'accelerating' | 'stable' | 'declining';
  barber_loyalty_score: number;
  primary_intervention: PersonalizedIntervention;
  alternative_interventions: PersonalizedIntervention[];
  cohort_comparison: {
    percentile_rank: number;
    cohort_avg_clv: number;
    cohort_avg_churn_score: number;
  };
}
 
// ════════════════════════════════════════════════════════════════════
// HELPER: Get state indices dynamically
// ════════════════════════════════════════════════════════════════════
 
function getChurnStateIndex(): number {
  // Try common churn state names
  const stateIndex = BEAUTY_STATE_INDEX as Record<string, number>;
  
  if ('X' in stateIndex) return stateIndex['X'];
  if ('CHURN' in stateIndex) return stateIndex['CHURN'];
  
  // Fallback: assume last state is churn
  const indices = Object.values(BEAUTY_STATE_INDEX) as number[];
  return Math.max(...indices);
}
 
function getRevenueStateIndices(): number[] {
  const indices: number[] = [];
  const stateIndex = BEAUTY_STATE_INDEX as Record<string, number>;
  
  // Check for completed state
  if ('C' in stateIndex) indices.push(stateIndex['C']);
  // Check for return state  
  if ('R' in stateIndex) indices.push(stateIndex['R']);
  // Check for order state (hospitality)
  if ('O' in stateIndex) indices.push(stateIndex['O']);
  
  return indices;
}
 
// ════════════════════════════════════════════════════════════════════
// TIME-TO-EVENT PREDICTIONS
// ════════════════════════════════════════════════════════════════════
 
export function predictTimeToChurn(
  state: BeautyState,
  P: TransitionMatrix,
  avg_visit_gap_days: number,
  threshold: number = 0.50
): TimeToEventPrediction {
  const churnIdx = getChurnStateIndex();
  let v = beautyStateVector(state);
  
  const probabilities: number[] = [];
  const max_steps = 100;
  
  for (let n = 1; n <= max_steps; n++) {
    v = beautyProjectOneStep(v, P);
    probabilities.push(v[churnIdx]);
    
    if (v[churnIdx] >= threshold) break;
  }
  
  const steps_to_threshold = probabilities.findIndex(p => p >= threshold);
  const expected_days = steps_to_threshold > 0 
    ? steps_to_threshold * avg_visit_gap_days 
    : max_steps * avg_visit_gap_days;
  
  const days_to_steps = (days: number) => Math.ceil(days / avg_visit_gap_days);
  
  return {
    expected_days,
    probability_within_7_days: probabilities[days_to_steps(7) - 1] || 0,
    probability_within_14_days: probabilities[days_to_steps(14) - 1] || 0,
    probability_within_30_days: probabilities[days_to_steps(30) - 1] || 0,
    probability_within_90_days: probabilities[days_to_steps(90) - 1] || 0
  };
}
 
export function predictTimeToNextVisit(
  state: BeautyState,
  P: TransitionMatrix,
  avg_visit_gap_days: number
): TimeToEventPrediction {
  const revenueIndices = getRevenueStateIndices();
  let v = beautyStateVector(state);
  
  const visit_probs: number[] = [];
  const max_steps = 50;
  
  for (let n = 1; n <= max_steps; n++) {
    v = beautyProjectOneStep(v, P);
    const visit_prob = revenueIndices.reduce((sum, idx) => sum + v[idx], 0);
    visit_probs.push(visit_prob);
  }
  
  const expected_steps = visit_probs.reduce((sum, p, idx) => sum + p * (idx + 1), 0);
  const expected_days = Math.round(expected_steps * avg_visit_gap_days);
  
  const days_to_steps = (days: number) => Math.ceil(days / avg_visit_gap_days);
  
  return {
    expected_days,
    probability_within_7_days: visit_probs[days_to_steps(7) - 1] || 0,
    probability_within_14_days: visit_probs[days_to_steps(14) - 1] || 0,
    probability_within_30_days: visit_probs[days_to_steps(30) - 1] || 0,
    probability_within_90_days: visit_probs[days_to_steps(90) - 1] || 0
  };
}
 
// ════════════════════════════════════════════════════════════════════
// MULTI-HORIZON ANALYSIS
// ════════════════════════════════════════════════════════════════════
 
export function getMultiHorizonChurnScores(
  state: BeautyState,
  P: TransitionMatrix
): MultiHorizonScores {
  return {
    one_week: churnScore(state, P, 1),
    one_month: churnScore(state, P, 4),
    three_months: churnScore(state, P, 12),
    one_year: churnScore(state, P, 52)
  };
}
 
export function predictAnnualVisitsWithConfidence(
  state: BeautyState,
  P: TransitionMatrix
): PredictionWithConfidence {
  const revenueIndices = getRevenueStateIndices();
  
  let v = beautyStateVector(state);
  let expected_visits = 0;
  const N = 52;
  
  for (let n = 1; n <= N; n++) {
    v = beautyProjectOneStep(v, P);
    expected_visits += revenueIndices.reduce((sum, idx) => sum + v[idx], 0);
  }
  
  const variance = expected_visits * 0.3;
  const std_dev = Math.sqrt(variance);
  
  return {
    value: expected_visits,
    confidence_low: Math.max(0, expected_visits - 1.28 * std_dev),
    confidence_high: expected_visits + 1.28 * std_dev,
    confidence_level: 0.80
  };
}
 
// ════════════════════════════════════════════════════════════════════
// PERSONALIZED INTERVENTION ENGINE
// ════════════════════════════════════════════════════════════════════
 
export function generatePersonalizedIntervention(
  state: BeautyState,
  churn_score_30_day: number,
  loyalty_score: number,
  gap_ratio: number,
  days_since_last: number,
  clv_cents: number,
  customer_name: string,
  preferred_barber_name?: string
): PersonalizedIntervention {
  
  if (churn_score_30_day >= 0.60 && gap_ratio > 1.5) {
    return {
      segment: 'at_risk',
      priority: 'urgent',
      recommended_action: 'Send loss-aversion SMS with concrete offer within 24 hours',
      message_template: `Hi ${customer_name}, we've missed you at Alkami! It's been ${days_since_last} days since ${preferred_barber_name || 'your barber'} saw you. Come back this week and get $20 off your next service. Book here: [link]`,
      discount_amount_cents: 2000,
      expected_roi: 3.5,
      expected_conversion_rate: 0.25,
      timing_recommendation: 'Send immediately',
      channel: 'sms'
    };
  }
  
  if (churn_score_30_day >= 0.35 && churn_score_30_day < 0.60) {
    const is_slightly_overdue = gap_ratio > 1.1;
    
    return {
      segment: 'on_the_fence',
      priority: is_slightly_overdue ? 'high' : 'medium',
      recommended_action: is_slightly_overdue 
        ? 'Gentle nudge with reminder, small incentive if CLV > $150'
        : 'Soft touch reminder, no discount needed yet',
      message_template: is_slightly_overdue
        ? `${customer_name}, ready for your next cut? ${preferred_barber_name || 'Your barber'} has openings this week. Book now: [link]`
        : `Hi ${customer_name}! Just a friendly reminder that ${preferred_barber_name || 'we'}'d love to see you soon. Book here when you're ready: [link]`,
      discount_amount_cents: is_slightly_overdue && clv_cents > 15000 ? 1000 : 0,
      expected_roi: is_slightly_overdue ? 4.2 : 6.0,
      expected_conversion_rate: 0.35,
      timing_recommendation: is_slightly_overdue ? 'Send within 48 hours' : 'Send in 3-5 days',
      channel: 'sms'
    };
  }
  
  if (churn_score_30_day < 0.20 && loyalty_score > 0.70) {
    return {
      segment: 'loyal',
      priority: 'low',
      recommended_action: 'Appreciation message only - DO NOT discount these customers',
      message_template: `Thanks for being a regular at Alkami, ${customer_name}! ${preferred_barber_name || 'We'} appreciate you. See you soon!`,
      discount_amount_cents: 0,
      expected_roi: 0,
      expected_conversion_rate: 0.85,
      timing_recommendation: 'Send at natural rebooking window (day 24-26)',
      channel: 'sms'
    };
  }
  
  if (gap_ratio > 2.5) {
    return {
      segment: 'churned',
      priority: 'high',
      recommended_action: 'Win-back campaign with strong offer and loss-aversion framing',
      message_template: `${customer_name}, it's been a while! We'd love to have you back at Alkami. Here's $30 off your next service with ${preferred_barber_name || 'any barber'}. Limited time: [link]`,
      discount_amount_cents: 3000,
      expected_roi: 2.8,
      expected_conversion_rate: 0.15,
      timing_recommendation: 'Send immediately',
      channel: 'sms'
    };
  }
  
  return {
    segment: 'on_the_fence',
    priority: 'medium',
    recommended_action: 'Standard reminder at typical rebooking window',
    message_template: `Hi ${customer_name}, time for a fresh cut? Book with ${preferred_barber_name || 'us'}: [link]`,
    discount_amount_cents: 0,
    expected_roi: 5.0,
    expected_conversion_rate: 0.40,
    timing_recommendation: 'Send at day 24-28',
    channel: 'sms'
  };
}
 
// ════════════════════════════════════════════════════════════════════
// COMPREHENSIVE INTELLIGENCE REPORT
// ════════════════════════════════════════════════════════════════════
 
export async function generateComprehensiveIntelligence(
  userId: string,
  venueId: string,
  current_state: BeautyState,
  P_baseline: TransitionMatrix,
  config: BeautyVenueConfig,
  user_data: {
    total_visits: number;
    days_since_last_visit: number;
    avg_visit_gap_days: number;
    last_3_visit_gaps_days: number[];
    preferred_barber_id?: string;
    preferred_barber_name?: string;
    customer_name: string;
  },
  cohort_benchmarks: {
    avg_clv: number;
    avg_churn_score: number;
  }
): Promise<ComprehensiveCustomerIntelligence> {
  
  const gap_ratio = user_data.days_since_last_visit / user_data.avg_visit_gap_days;
  
  const churn_scores = getMultiHorizonChurnScores(current_state, P_baseline);
  const loyalty_score = 0.61;
  const clv_cents = computeBeautyCLV(current_state, P_baseline, config);
  
  const time_to_churn = predictTimeToChurn(current_state, P_baseline, user_data.avg_visit_gap_days);
  const time_to_next_visit = predictTimeToNextVisit(current_state, P_baseline, user_data.avg_visit_gap_days);
  const expected_visits = predictAnnualVisitsWithConfidence(current_state, P_baseline);
  
  const visit_frequency_trend = analyzeVisitFrequencyTrend(user_data.last_3_visit_gaps_days);
  const barber_loyalty_score = user_data.preferred_barber_id ? 0.85 : 0.40;
  
  const primary_intervention = generatePersonalizedIntervention(
    current_state,
    churn_scores.one_month,
    loyalty_score,
    gap_ratio,
    user_data.days_since_last_visit,
    clv_cents,
    user_data.customer_name,
    user_data.preferred_barber_name
  );
  
  const percentile_rank = calculatePercentileRank(clv_cents, cohort_benchmarks.avg_clv);
  
  return {
    current_state,
    churn_scores,
    loyalty_score,
    clv_cents,
    time_to_churn,
    time_to_next_visit,
    expected_visits_next_year: expected_visits,
    expected_revenue_next_year_cents: {
      value: expected_visits.value * config.m_cents,
      confidence_low: expected_visits.confidence_low * config.m_cents,
      confidence_high: expected_visits.confidence_high * config.m_cents,
      confidence_level: 0.80
    },
    gap_ratio,
    days_since_last_visit: user_data.days_since_last_visit,
    avg_visit_gap_days: user_data.avg_visit_gap_days,
    visit_frequency_trend,
    barber_loyalty_score,
    primary_intervention,
    alternative_interventions: [],
    cohort_comparison: {
      percentile_rank,
      cohort_avg_clv: cohort_benchmarks.avg_clv,
      cohort_avg_churn_score: cohort_benchmarks.avg_churn_score
    }
  };
}
 
// ════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════════════
 
function analyzeVisitFrequencyTrend(last_3_gaps: number[]): 'accelerating' | 'stable' | 'declining' {
  if (last_3_gaps.length < 2) return 'stable';
  
  const trend = last_3_gaps[last_3_gaps.length - 1] - last_3_gaps[0];
  
  if (trend < -3) return 'accelerating';
  if (trend > 3) return 'declining';
  return 'stable';
}
 
function calculatePercentileRank(value: number, cohort_avg: number): number {
  const z_score = (value - cohort_avg) / (cohort_avg * 0.3);
  const percentile = 50 + (z_score * 20);
  return Math.max(0, Math.min(100, percentile));
}
 
// ════════════════════════════════════════════════════════════════════
// REVENUE IMPACT PROJECTIONS
// ════════════════════════════════════════════════════════════════════
 
export interface RevenueImpactProjection {
  baseline_revenue_cents: number;
  with_intervention_revenue_cents: number;
  incremental_revenue_cents: number;
  intervention_cost_cents: number;
  net_impact_cents: number;
  roi_multiple: number;
}
 
export function projectCampaignRevenue(
  target_customers: {
    state: BeautyState;
    current_clv_cents: number;
  }[],
  intervention_cost_per_customer_cents: number,
  expected_conversion_rate: number,
  P_baseline: TransitionMatrix,
  P_with_intervention: TransitionMatrix,
  config: BeautyVenueConfig
): RevenueImpactProjection {
  
  let baseline_total = 0;
  let intervention_total = 0;
  
  for (const customer of target_customers) {
    const baseline_clv = computeBeautyCLV(customer.state, P_baseline, config);
    const intervention_clv = computeBeautyCLV(customer.state, P_with_intervention, config);
    
    baseline_total += baseline_clv;
    intervention_total += (intervention_clv * expected_conversion_rate) + 
                         (baseline_clv * (1 - expected_conversion_rate));
  }
  
  const total_intervention_cost = target_customers.length * intervention_cost_per_customer_cents;
  const incremental_revenue = intervention_total - baseline_total;
  const net_impact = incremental_revenue - total_intervention_cost;
  const roi_multiple = total_intervention_cost > 0 ? net_impact / total_intervention_cost : 0;
  
  return {
    baseline_revenue_cents: baseline_total,
    with_intervention_revenue_cents: intervention_total,
    incremental_revenue_cents: incremental_revenue,
    intervention_cost_cents: total_intervention_cost,
    net_impact_cents: net_impact,
    roi_multiple
  };
}