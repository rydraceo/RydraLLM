// lib/markov/risk-segments.ts
/**
 * Risk Segment Classification for Beauty-Tech Customers
 * Determines: at_risk | on_the_fence | loyal | churned
 */
 
import { BeautyState } from './type.beauty';
import type { RiskSegment, RiskClassification, InterventionRule } from './type.beauty';
 
/**
 * Classify customer into risk segments based on Markov scores
 * 
 * This is the CORE PREDICTION FUNCTION that determines:
 * - Who to send SMS to
 * - What message tone to use
 * - Whether to offer a discount
 * - How urgent the intervention is
 * 
 * Segments are defined by THREE inputs:
 * 1. churn_score_5: Probability of churning in next 5 transitions
 * 2. loyalty_score: Probability of reaching Return before Churn
 * 3. gap_ratio: How overdue they are vs their personal average
 * 
 * @param current_state - Current Markov state
 * @param churn_score_5 - 5-step churn probability (0-1)
 * @param loyalty_score - Long-run loyalty probability (0-1)
 * @param gap_ratio - days_since_last / avg_visit_gap
 * @param days_since_last - Absolute days since last visit
 * @returns Risk classification with recommended action
 */
export function classifyRiskSegment(
  current_state: BeautyState,
  churn_score_5: number,
  loyalty_score: number,
  gap_ratio: number,
  days_since_last: number
): RiskClassification {
  
  // ═══════════════════════════════════════════════════════════════
  // SEGMENT 1: CHURNED
  // Already in X state OR gap_ratio > 2.5
  // These customers need win-back campaigns with concrete offers
  // ═══════════════════════════════════════════════════════════════
  
  if (current_state === 'X' || gap_ratio > 2.5) {
    return {
      segment: 'churned',
      confidence: 0.95,
      recommended_action: 
        'Win-back campaign required. Send within 24hrs with concrete offer. ' +
        'Frame as loss: "We miss seeing you at Alkami." ' +
        'Example: $25 off your next visit, valid 7 days.',
      intervention_priority: 'high'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SEGMENT 2: AT RISK
  // High churn probability + Low loyalty + Overdue
  // Urgent intervention required before they become churned
  // ═══════════════════════════════════════════════════════════════
  
  if (
    churn_score_5 >= 0.55 &&   // >55% chance of churning
    loyalty_score < 0.35 &&     // <35% chance of becoming loyal
    gap_ratio > 1.3             // 30%+ overdue
  ) {
    return {
      segment: 'at_risk',
      confidence: 0.85,
      recommended_action:
        'URGENT: Send personalized SMS within 24hrs. ' +
        'Mention specific last service and barber. ' +
        'Offer $10-$20 discount if ΔV justifies. ' +
        'Example: "Hi [Name], it\'s been 6 weeks since your fade with [Barber]. ' +
        'Ready to book? Here\'s $15 off."',
      intervention_priority: 'high'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SEGMENT 3: ON THE FENCE
  // Moderate risk, recoverable with nudge
  // THIS IS THE HIGHEST ROI SEGMENT
  // ═══════════════════════════════════════════════════════════════
  
  if (
    (churn_score_5 >= 0.30 && churn_score_5 < 0.55) &&
    (loyalty_score >= 0.35 && loyalty_score < 0.65) &&
    gap_ratio > 1.0
  ) {
    return {
      segment: 'on_the_fence',
      confidence: 0.75,
      recommended_action:
        'Gentle nudge required. NO discount needed yet. ' +
        'Simple reminder works: "It\'s been [X] weeks since your last cut. ' +
        'Ready to book with [Barber]?" ' +
        'Link to direct booking page. ' +
        'Timing: Send at avg_gap × 0.85 days to catch before habit breaks.',
      intervention_priority: 'medium'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // SEGMENT 4: LOYAL
  // Low churn risk + High loyalty + Visiting regularly
  // DO NOT DISCOUNT THESE CUSTOMERS
  // ═══════════════════════════════════════════════════════════════
  
  if (
    churn_score_5 < 0.30 &&     // <30% churn risk
    loyalty_score >= 0.65 &&     // >65% loyalty
    gap_ratio <= 1.2             // Within normal visit window
  ) {
    return {
      segment: 'loyal',
      confidence: 0.90,
      recommended_action:
        'Appreciation message only. DO NOT offer discounts. ' +
        'Example: "Thanks for being a regular at Alkami. ' +
        'Book your next appointment here: [link]" ' +
        'Consider loyalty reward at 10th visit instead.',
      intervention_priority: 'low'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // EDGE CASE 1: Slightly elevated risk (soft on_the_fence)
  // Not critical but worth monitoring
  // ═══════════════════════════════════════════════════════════════
  
  if (churn_score_5 >= 0.25 && churn_score_5 < 0.50 && gap_ratio > 0.9) {
    return {
      segment: 'on_the_fence',
      confidence: 0.60,
      recommended_action:
        'Monitor closely. Send standard reminder at avg_gap × 0.85 days. ' +
        'No discount required. ' +
        'Escalate to at_risk if gap_ratio exceeds 1.5.',
      intervention_priority: 'low'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // EDGE CASE 2: Appointment booked state (A)
  // Customer has appointment scheduled, no intervention needed
  // ═══════════════════════════════════════════════════════════════
  
  if (current_state === 'A') {
    return {
      segment: 'loyal',
      confidence: 0.85,
      recommended_action:
        'Appointment already booked. Send confirmation and reminder only. ' +
        'No additional intervention required.',
      intervention_priority: 'none'
    };
  }
  
  // ═══════════════════════════════════════════════════════════════
  // DEFAULT: Treat as loyal if no other conditions met
  // Conservative approach to avoid over-messaging
  // ═══════════════════════════════════════════════════════════════
  
  return {
    segment: 'loyal',
    confidence: 0.70,
    recommended_action:
      'Standard communication cadence. ' +
      'No special intervention required at this time.',
    intervention_priority: 'none'
  };
}
 
/**
 * Intervention rules per segment
 * Defines what actions to take for each risk category
 */
export const SEGMENT_INTERVENTION_RULES: Record<RiskSegment, InterventionRule> = {
  
  // ─── AT RISK ────────────────────────────────────────────────────
  'at_risk': {
    max_discount_cents: 2000,  // Up to $20 off
    sms_timing_days: 0,         // Send immediately
    message_tone: 
      'Loss aversion framing. Personalize with last service details. ' +
      '"We miss you at Alkami. Your usual chair is waiting."',
    include_offer: true
  },
  
  // ─── ON THE FENCE ───────────────────────────────────────────────
  'on_the_fence': {
    max_discount_cents: 1000,  // Up to $10 off (if ΔV justifies)
    sms_timing_days: 2,         // Send within 48hrs
    message_tone:
      'Gentle reminder. Reference their last visit. ' +
      '"It\'s been [X] weeks since your cut with [Barber]. Ready to book?"',
    include_offer: false  // Only offer discount if ΔV > 0
  },
  
  // ─── LOYAL ──────────────────────────────────────────────────────
  'loyal': {
    max_discount_cents: 0,     // NO DISCOUNTS
    sms_timing_days: 7,         // No urgency
    message_tone:
      'Appreciation and convenience. ' +
      '"Thanks for being a regular. Book your next appointment: [link]"',
    include_offer: false
  },
  
  // ─── CHURNED ────────────────────────────────────────────────────
  'churned': {
    max_discount_cents: 3000,  // Up to $30 for aggressive win-back
    sms_timing_days: 0,         // Send immediately
    message_tone:
      'Concrete offer with urgency. Time-limited. ' +
      '"We\'d love to have you back at Alkami. Here\'s $25 off your next visit - valid for 7 days only."',
    include_offer: true
  }
};
 
/**
 * Get recommended SMS copy for a segment
 * 
 * @param segment - Risk segment
 * @param customer_name - Customer first name
 * @param barber_name - Preferred barber name
 * @param days_since_last - Days since last visit
 * @param discount_amount - Discount in dollars (if applicable)
 * @returns SMS message copy
 */
export function generateSegmentMessage(
  segment: RiskSegment,
  customer_name: string,
  barber_name: string,
  days_since_last: number,
  discount_amount?: number
): string {
  
  const weeks = Math.floor(days_since_last / 7);
  const discount_text = discount_amount 
    ? ` Here's $${discount_amount} off your next visit.`
    : '';
  
  switch (segment) {
    case 'at_risk':
      return (
        `Hi ${customer_name}, we miss seeing you at Alkami! ` +
        `It's been ${weeks} weeks since your cut with ${barber_name}.${discount_text} ` +
        `Book here: [link]`
      );
      
    case 'on_the_fence':
      return (
        `Hi ${customer_name}, ready for your next cut? ` +
        `It's been ${weeks} weeks since your fade with ${barber_name}. ` +
        `Book with ${barber_name}: [link]`
      );
      
    case 'loyal':
      return (
        `Thanks for being a regular at Alkami, ${customer_name}! ` +
        `Book your next appointment with ${barber_name}: [link]`
      );
      
    case 'churned':
      return (
        `We'd love to have you back at Alkami, ${customer_name}!${discount_text} ` +
        `Valid for 7 days. Book now: [link]`
      );
  }
}
 
/**
 * Determine optimal SMS send time based on segment
 * 
 * @param segment - Risk segment
 * @param avg_visit_gap_days - Customer's average visit interval
 * @returns Recommended days from now to send
 */
export function getOptimalSendTiming(
  segment: RiskSegment,
  avg_visit_gap_days: number
): number {
  
  const rules = SEGMENT_INTERVENTION_RULES[segment];
  
  // For on_the_fence, use 0.85× avg gap (before habit breaks)
  if (segment === 'on_the_fence') {
    return Math.floor(avg_visit_gap_days * 0.85);
  }
  
  return rules.sms_timing_days;
}
 
/**
 * Calculate intervention ROI estimate
 * 
 * @param segment - Risk segment
 * @param clv_cents - Customer lifetime value
 * @param discount_cents - Proposed discount amount
 * @param sms_cost_cents - Cost to send SMS
 * @returns Estimated ROI ratio
 */
export function calculateInterventionROI(
  segment: RiskSegment,
  clv_cents: number,
  discount_cents: number,
  sms_cost_cents: number = 7
): number {
  
  // Total intervention cost
  const total_cost = discount_cents + sms_cost_cents;
  
  // Estimated conversion probability by segment
  const conversion_rates: Record<RiskSegment, number> = {
    'at_risk': 0.25,      // 25% convert with urgent intervention
    'on_the_fence': 0.40, // 40% convert with gentle nudge
    'loyal': 0.75,        // 75% already coming back
    'churned': 0.15       // 15% can be won back
  };
  
  const conversion_prob = conversion_rates[segment];
  const expected_value = clv_cents * conversion_prob;
  
  // ROI = (expected_value - cost) / cost
  return total_cost > 0 ? (expected_value - total_cost) / total_cost : 0;
}
 
/**
 * Validate that scores are within expected ranges
 * Useful for catching data quality issues
 */
export function validateScores(
  churn_score_5: number,
  loyalty_score: number,
  gap_ratio: number
): { valid: boolean; errors: string[] } {
  
  const errors: string[] = [];
  
  if (churn_score_5 < 0 || churn_score_5 > 1) {
    errors.push(`churn_score_5 out of range: ${churn_score_5}`);
  }
  
  if (loyalty_score < 0 || loyalty_score > 1) {
    errors.push(`loyalty_score out of range: ${loyalty_score}`);
  }
  
  if (gap_ratio < 0) {
    errors.push(`gap_ratio cannot be negative: ${gap_ratio}`);
  }
  
  // Warn if gap_ratio seems unreasonably high (>10)
  if (gap_ratio > 10) {
    errors.push(`gap_ratio unusually high: ${gap_ratio} (customer likely churned)`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}