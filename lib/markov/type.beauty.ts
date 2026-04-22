// lib/markov/types.beauty.ts
/**
 * Beauty-Tech / Barbershop Markov Chain Type Definitions
 * Adapted for Alkami and beauty services
 */
 
export const BEAUTY_STATES = ['B', 'V', 'A', 'C', 'R', 'X'] as const;
export type BeautyState = typeof BEAUTY_STATES[number];
 
export const BEAUTY_STATE_INDEX: Record<BeautyState, number> = {
  B: 0,  // Browse
  V: 1,  // Viewing
  A: 2,  // Appointment Booked
  C: 3,  // Completed (first visit)
  R: 4,  // Return (loyal)
  X: 5   // Churn
};
 
export const BEAUTY_STATE_NAMES: Record<BeautyState, string> = {
  B: 'Browse',
  V: 'Viewing',
  A: 'Appointment Booked',
  C: 'Completed',
  R: 'Return',
  X: 'Churn'
};
 
// 6×6 transition matrix
export type TransitionMatrix = number[][];
 
// Venue configuration for beauty-tech
export interface BeautyVenueConfig {
  venue_id: string;
  venue_type: 'beauty';
  avg_service_value_cents: number;  // e.g., 7000 for $70
  margin_percent: number;            // e.g., 60.0
  m_cents: number;                   // Computed: avg × margin
  delta: number;                     // Time discount factor: 0.88
  avg_visit_gap_days: number;        // e.g., 28 (4 weeks)
  churn_threshold_days: number;      // e.g., 70 (2.5× 28)
  sms_cost_cents: number;            // e.g., 7 ($0.07)
}
 
// Customer scores output
export interface BeautyCustomerScores {
  user_id: string;
  venue_id: string;
  current_state: BeautyState;
  last_event_at: string;
  
  // Visit pattern
  total_visits: number;
  days_since_last_visit: number;
  avg_visit_gap_days: number;
  gap_ratio: number;  // days_since / avg_gap
  
  // Markov predictions
  churn_score_5: number;   // 5-step horizon
  churn_score_10: number;  // 10-step horizon
  loyalty_score: number;
  clv_cents: number;
  intervention_value_cents: number;
  
  // Risk classification
  risk_segment: 'at_risk' | 'on_the_fence' | 'loyal' | 'churned';
  intervention_recommended: boolean;
  
  // Barber preference
  preferred_barber_id?: string;
  
  computed_at: string;
  updated_at: string;
}
 
// Event type for beauty-tech
export interface BeautyEvent {
  event_id: string;
  user_id: string;
  venue_id: string;
  event_type: string;
  state: BeautyState;
  occurred_at: string;
  
  // Beauty-specific
  barber_id?: string;
  service_id?: string;
  booking_id?: string;
  appointment_datetime?: string;
  deposit_amount_cents?: number;
  is_return_visit: boolean;
  
  session_id?: string;
  device_type?: string;
  source?: string;
  metadata?: Record<string, any>;
}
 
// State transition record
export interface StateTransition {
  transition_id: string;
  user_id: string;
  venue_id: string;
  
  from_state: BeautyState;
  to_state: BeautyState;
  
  from_event_id: string;
  to_event_id: string;
  from_at: string;
  to_at: string;
  
  gap_hours: number;
  gap_days: number;
  
  deal_active: boolean;
  barber_id?: string;
}
 
// Risk segment classification
export type RiskSegment = 'at_risk' | 'on_the_fence' | 'loyal' | 'churned';
export type InterventionPriority = 'high' | 'medium' | 'low' | 'none';
 
export interface RiskClassification {
  segment: RiskSegment;
  confidence: number;
  recommended_action: string;
  intervention_priority: InterventionPriority;
}
 
// Intervention rules per segment
export interface InterventionRule {
  max_discount_cents: number;
  sms_timing_days: number;
  message_tone: string;
  include_offer: boolean;
}