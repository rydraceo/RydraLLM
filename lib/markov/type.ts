// The 6 states of the Rydra Demand Intelligence Engine

export const STATES = ['B', 'D', 'C', 'O', 'R', 'X'] as const;
export type State = typeof STATES[number];

// Map state letter to array index (0-5)
export const STATE_INDEX: Record<State, number> = {
  B: 0, D: 1, C: 2, O: 3, R: 4, X: 5
};

// 6x6 matrix stored as flat array of 36 numbers
export type TransitionMatrix = number[][];

// Venues config for CLV calculation
export interface VenueConfig {
  venue_id: string;
  venue_type: 'hospitality' | 'beauty';
  m_cents: number;      // profit per order in cents
  delta: number;        // discount factor (0.92 hospitality, 0.88 beauty)
  avg_visit_gap_days: number;
}

// Customer scores output
export interface CustomerScores {
  user_id: string;
  venue_id: string;
  current_state: State;
  churn_score_5: number;
  churn_score_10: number;
  loyalty_score: number;
  clv_cents: number;
  intervention_value_cents: number;
}
