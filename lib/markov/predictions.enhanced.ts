export type BeautyState = 'R' | 'X' | 'C';  // Return, Churned, Completed
 
export const BEAUTY_STATE_INDEX: Record<BeautyState, number> = {
  'C': 0,  // Completed - just visited
  'R': 1,  // Return - coming back
  'X': 2,  // Churned - lost customer
};
 
export type TransitionMatrix = number[][];
 
export interface BeautyVenueConfig {
  m_cents: number;
  venue_id: string;
  avg_service_value_cents: number;
  discount_rate: number;
  retention_window_days: number;
  margin_percent: number;
  delta: number;
  avg_visit_gap_days: number;
  sms_cost_cents: number;
}
 
// Helper functions for Markov operations
export function stateVector(state: BeautyState): number[] {
  const v = [0, 0, 0];
  v[BEAUTY_STATE_INDEX[state]] = 1;
  return v;
}
 
export function projectOneStep(v: number[], P: TransitionMatrix): number[] {
  const result = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      result[i] += v[j] * P[j][i];
    }
  }
  return result;
}
 
export function churnScore(state: BeautyState, P: TransitionMatrix, steps: number): number {
  let v = stateVector(state);
  for (let i = 0; i < steps; i++) {
    v = projectOneStep(v, P);
  }
  return v[BEAUTY_STATE_INDEX['X']];  // Probability of being in churned state
}
 
export function computeBeautyCLV(
  state: BeautyState,
  P: TransitionMatrix,
  config: BeautyVenueConfig
): number {
  const avgValue = config.avg_service_value_cents;
  const discountRate = config.discount_rate;
  let v = stateVector(state);
  let clv = 0;
  
  for (let t = 0; t < 100; t++) {
    const probActive = v[BEAUTY_STATE_INDEX['C']] + v[BEAUTY_STATE_INDEX['R']];
    clv += (avgValue * probActive) / Math.pow(1 + discountRate, t);
    v = projectOneStep(v, P);
  }
  
  return clv;
}
 
// ════════════════════════════════════════════════════════════════════
// ENHANCED PREDICTION TYPES
// ════════════════════════════════════════════════════════════════════
 
export interface PredictionWithConfidence {
  value: number;
  confidence_low: number;   // 10th percentile
  confidence_high: number;  // 90th percentile
  confidence_level: number; // 0.80 for 80% confidence interval
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
  expected_roi: number;           // How many dollars returned per dollar spent
  expected_conversion_rate: number;
  timing_recommendation: string;  // "Send immediately" or "Send in 3 days"
  channel: 'sms' | 'email' | 'both';
}
 
export interface ComprehensiveCustomerIntelligence {
  // Core Markov scores
  current_state: BeautyState;
  churn_scores: MultiHorizonScores;
  loyalty_score: number;
  clv_cents: number;
  
  // Enhanced predictions
  time_to_churn: TimeToEventPrediction;
  time_to_next_visit: TimeToEventPrediction;
  expected_visits_next_year: PredictionWithConfidence;
  expected_revenue_next_year_cents: PredictionWithConfidence;
  
  // Behavioral insights
  gap_ratio: number;
  days_since_last_visit: number;
  avg_visit_gap_days: number;
  visit_frequency_trend: 'accelerating' | 'stable' | 'declining';
  barber_loyalty_score: number;  // Stick with same barber?
  
  // Intervention recommendations
  primary_intervention: PersonalizedIntervention;
  alternative_interventions: PersonalizedIntervention[];
  
  // Benchmarking
  cohort_comparison: {
    percentile_rank: number;  // Where this customer ranks (0-100)
    cohort_avg_clv: number;
    cohort_avg_churn_score: number;
  };
}
 
// ════════════════════════════════════════════════════════════════════
// TIME-TO-EVENT PREDICTIONS
// ════════════════════════════════════════════════════════════════════
 
/**
 * Estimate how many days until customer churns
 * 
 * This projects forward day-by-day and calculates when cumulative
 * churn probability exceeds threshold (e.g., 50% = median)
 */
export function predictTimeToChurn(
  state: BeautyState,
  P: TransitionMatrix,
  avg_visit_gap_days: number,
  threshold: number = 0.50
): TimeToEventPrediction {
  const X_IDX = BEAUTY_STATE_INDEX['X' as BeautyState];
  let v = stateVector(state);
  
  const probabilities = [];
  const max_steps = 100;  // Limit to prevent infinite loops
  
  // Project forward step by step
  for (let n = 1; n <= max_steps; n++) {
    v = projectOneStep(v, P);
    probabilities.push(v[X_IDX]);
    
    // Stop once we hit threshold
    if (v[X_IDX] >= threshold) break;
  }
  
  // Convert steps to days
  const steps_to_threshold = probabilities.findIndex(p => p >= threshold);
  const expected_days = steps_to_threshold * avg_visit_gap_days;
  
  // Calculate cumulative probabilities for specific windows
  const days_to_steps = (days: number) => Math.ceil(days / avg_visit_gap_days);
  
  const prob_7_days = probabilities[days_to_steps(7) - 1] || 0;
  const prob_14_days = probabilities[days_to_steps(14) - 1] || 0;
  const prob_30_days = probabilities[days_to_steps(30) - 1] || 0;
  const prob_90_days = probabilities[days_to_steps(90) - 1] || 0;
  
  return {
    expected_days,
    probability_within_7_days: prob_7_days,
    probability_within_14_days: prob_14_days,
    probability_within_30_days: prob_30_days,
    probability_within_90_days: prob_90_days
  };
}
 
/**
 * Estimate when customer will visit again
 * 
 * Similar to time-to-churn but tracks probability of reaching
 * Completed (C) or Return (R) states
 */
export function predictTimeToNextVisit(
  state: BeautyState,
  P: TransitionMatrix,
  avg_visit_gap_days: number
): TimeToEventPrediction {
  const C_IDX = BEAUTY_STATE_INDEX['C'];
  const R_IDX = BEAUTY_STATE_INDEX['R'];
  let v = stateVector(state);
  
  const visit_probs = [];
  const max_steps = 50;
  
  for (let n = 1; n <= max_steps; n++) {
    v = projectOneStep(v, P);
    const visit_prob = v[C_IDX] + v[R_IDX];
    visit_probs.push(visit_prob);
  }
  
  // Expected value = weighted sum of steps
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
 
/**
 * Calculate churn scores across multiple time horizons
 * Helps identify both immediate and long-term risk
 */
export function getMultiHorizonChurnScores(
  state: BeautyState,
  P: TransitionMatrix
): MultiHorizonScores {
  // Convert horizons to steps (assuming 28-day avg gap)
  const one_week_steps = 1;    // ~7 days
  const one_month_steps = 4;   // ~28 days
  const three_month_steps = 12; // ~84 days
  const one_year_steps = 52;    // ~364 days
  
  return {
    one_week: churnScore(state, P, one_week_steps),
    one_month: churnScore(state, P, one_month_steps),
    three_months: churnScore(state, P, three_month_steps),
    one_year: churnScore(state, P, one_year_steps)
  };
}
 
/**
 * Predict expected visits in next year with confidence interval
 */
export function predictAnnualVisitsWithConfidence(
  state: BeautyState,
  P: TransitionMatrix
): PredictionWithConfidence {
  const C_IDX = BEAUTY_STATE_INDEX['C'];
  const R_IDX = BEAUTY_STATE_INDEX['R'];
  
  let v = stateVector(state);
  let expected_visits = 0;
  const N = 52;  // 52 steps × 28 days ≈ 1 year
  
  for (let n = 1; n <= N; n++) {
    v = projectOneStep(v, P);
    expected_visits += v[C_IDX] + v[R_IDX];
  }
  
  // Confidence intervals (simplified - using variance estimation)
  // Real implementation would use bootstrap or analytical variance
  const variance = expected_visits * 0.3;  // Rough estimate
  const std_dev = Math.sqrt(variance);
  
  return {
    value: expected_visits,
    confidence_low: Math.max(0, expected_visits - 1.28 * std_dev),  // 10th percentile
    confidence_high: expected_visits + 1.28 * std_dev,  // 90th percentile
    confidence_level: 0.80
  };
}
 
// ════════════════════════════════════════════════════════════════════
// PERSONALIZED INTERVENTION ENGINE
// ════════════════════════════════════════════════════════════════════
 
/**
 * Generate personalized intervention recommendations
 * 
 * This is the AI that decides:
 * - What message to send
 * - When to send it
 * - How much discount to offer
 * - Expected ROI
 */
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
  
  // SEGMENT 1: URGENT - At Risk of Imminent Churn
  if (churn_score_30_day >= 0.60 && gap_ratio > 1.5) {
    return {
      segment: 'at_risk',
      priority: 'urgent',
      recommended_action: 'Send loss-aversion SMS with concrete offer within 24 hours',
      message_template: `Hi ${customer_name}, we've missed you at Alkami! It's been ${days_since_last} days since ${preferred_barber_name || 'your barber'} saw you. Come back this week and get $20 off your next service. Book here: [link]`,
      discount_amount_cents: 2000,
      expected_roi: 3.5,  // Every $1 spent returns $3.50
      expected_conversion_rate: 0.25,  // 25% of at-risk customers convert
      timing_recommendation: 'Send immediately',
      channel: 'sms'
    };
  }
  
  // SEGMENT 2: HIGH RISK - On the Fence
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
  
  // SEGMENT 3: LOYAL - Low churn risk
  if (churn_score_30_day < 0.20 && loyalty_score > 0.70) {
    return {
      segment: 'loyal',
      priority: 'low',
      recommended_action: 'Appreciation message only - DO NOT discount these customers',
      message_template: `Thanks for being a regular at Alkami, ${customer_name}! ${preferred_barber_name || 'We'} appreciate you. See you soon!`,
      discount_amount_cents: 0,
      expected_roi: 0,  // No intervention needed
      expected_conversion_rate: 0.85,  // They'll return anyway
      timing_recommendation: 'Send at natural rebooking window (day 24-26)',
      channel: 'sms'
    };
  }
  
  // SEGMENT 4: CHURNED - Already lost
  if (gap_ratio > 2.5 || state === 'X') {
    return {
      segment: 'churned',
      priority: 'high',
      recommended_action: 'Win-back campaign with strong offer and loss-aversion framing',
      message_template: `${customer_name}, it's been a while! We'd love to have you back at Alkami. Here's $30 off your next service with ${preferred_barber_name || 'any barber'}. Limited time: [link]`,
      discount_amount_cents: 3000,
      expected_roi: 2.8,
      expected_conversion_rate: 0.15,  // Harder to win back
      timing_recommendation: 'Send immediately',
      channel: 'sms'
    };
  }
  
  // DEFAULT: Medium priority
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
 
/**
 * Generate complete customer intelligence report
 * 
 * This is the "master function" that pulls together ALL predictions
 * into one comprehensive view
 */
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
    last_3_visit_gaps_days: number[];  // For trend analysis
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
  
  // Core Markov scores
  const churn_scores = getMultiHorizonChurnScores(current_state, P_baseline);
  const loyalty_score = 0.61;  // Would come from computeLoyaltyScores
  const clv_cents = computeBeautyCLV(current_state, P_baseline, config);
  
  // Enhanced predictions
  const time_to_churn = predictTimeToChurn(current_state, P_baseline, user_data.avg_visit_gap_days);
  const time_to_next_visit = predictTimeToNextVisit(current_state, P_baseline, user_data.avg_visit_gap_days);
  const expected_visits = predictAnnualVisitsWithConfidence(current_state, P_baseline);
  
  // Visit frequency trend analysis
  const visit_frequency_trend = analyzeVisitFrequencyTrend(user_data.last_3_visit_gaps_days);
  
  // Barber loyalty
  const barber_loyalty_score = user_data.preferred_barber_id ? 0.85 : 0.40;
  
  // Generate intervention recommendation
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
  
  // Percentile ranking
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
    alternative_interventions: [],  // Could add A/B test variants here
    
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
  
  if (trend < -3) return 'accelerating';  // Getting shorter gaps = visiting more often
  if (trend > 3) return 'declining';      // Getting longer gaps = visiting less often
  return 'stable';
}
 
function calculatePercentileRank(value: number, cohort_avg: number): number {
  // Simplified percentile calculation
  // Real implementation would use full cohort distribution
  const z_score = (value - cohort_avg) / (cohort_avg * 0.3);
  const percentile = 50 + (z_score * 20);  // Rough approximation
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
 
/**
 * Project revenue impact of intervention campaign
 * 
 * Example: "If we send $15 discounts to 100 at-risk customers,
 * what's the expected revenue impact?"
 */
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
    
    // Only count converted customers
    intervention_total += (intervention_clv * expected_conversion_rate) + 
                         (baseline_clv * (1 - expected_conversion_rate));
  }
  
  const total_intervention_cost = target_customers.length * intervention_cost_per_customer_cents;
  const incremental_revenue = intervention_total - baseline_total;
  const net_impact = incremental_revenue - total_intervention_cost;
  const roi_multiple = net_impact / total_intervention_cost;
  
  return {
    baseline_revenue_cents: baseline_total,
    with_intervention_revenue_cents: intervention_total,
    incremental_revenue_cents: incremental_revenue,
    intervention_cost_cents: total_intervention_cost,
    net_impact_cents: net_impact,
    roi_multiple
  };
}