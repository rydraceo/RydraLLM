// lib/markov/predictions.beauty.ts
 
import { BeautyState, BEAUTY_STATE_INDEX } from './type.beauty';
import { TransitionMatrix } from './matrix.beauty';
import { projectOneStep } from './project';
 
function stateVector(state: BeautyState): number[] {
  const v = Array(6).fill(0);
  v[BEAUTY_STATE_INDEX[state]] = 1;
  return v;
}
 
function projectNSteps(state: BeautyState, P: TransitionMatrix, n: number): number[] {
  let v = stateVector(state);
  for (let k = 0; k < n; k++) {
    v = projectOneStep(v, P);
  }
  return v;
}
 
export interface BeautyVenueConfig {
  venue_id: string;
  avg_service_value_cents: number;  // Alkami: 7000 ($70)
  margin_percent: number;            // 60%
  m_cents: number;                   // 4200 (7000 × 0.60)
  delta: number;                     // 0.88
  avg_visit_gap_days: number;        // 28 days
  sms_cost_cents: number;            // 7 cents
}
 
/**
 * Compute churn probability after n transitions
 * Formula: ChurnScore(i, n) = (e_i × P^n)_X
 */
export function churnScore(
  state: BeautyState,
  P: TransitionMatrix,
  n: number
): number {
  const vn = projectNSteps(state, P, n);
  return vn[BEAUTY_STATE_INDEX['X']];
}
 
/**
 * Compute probability of reaching Return before Churn
 * Formula: f_i = Σ_j P_ij × f_j
 * Boundary conditions: f_R = 1.0, f_X = 0.0
 * Solved by value iteration
 */
export function computeLoyaltyScores(
  P: TransitionMatrix
): Record<BeautyState, number> {
  const R_IDX = BEAUTY_STATE_INDEX['R'];
  const X_IDX = BEAUTY_STATE_INDEX['X'];
  
  // Initialize: boundaries fixed, others at 0.5
  let f = Array(6).fill(0.5);
  f[R_IDX] = 1.0;  // Return = certain loyalty
  f[X_IDX] = 0.0;  // Churn = zero loyalty
  
  // Value iteration
  for (let iter = 0; iter < 1000; iter++) {
    const f_new = [...f];
    
    for (let i = 0; i < 6; i++) {
      // Skip boundary conditions
      if (i === R_IDX || i === X_IDX) continue;
      
      // f_i = Σ_j P_ij × f_j
      f_new[i] = P[i].reduce((sum, pij, j) => sum + pij * f[j], 0);
    }
    
    // Check convergence
    const delta = f_new.reduce((acc, v, i) => acc + Math.abs(v - f[i]), 0);
    f = f_new;
    
    if (delta < 1e-8) {
      break;  // Converged
    }
  }
  
  // Return as named object
  return {
    B: f[BEAUTY_STATE_INDEX['B']],
    V: f[BEAUTY_STATE_INDEX['V']],
    A: f[BEAUTY_STATE_INDEX['A']],
    C: f[BEAUTY_STATE_INDEX['C']],
    R: f[BEAUTY_STATE_INDEX['R']],
    X: f[BEAUTY_STATE_INDEX['X']]
  };
}
 
/**
 * Compute CLV for barbershop client
 * Accounts for longer visit intervals (28 days vs 14 days hospitality)
 */
export function computeBeautyCLV(
  state: BeautyState,
  P: TransitionMatrix,
  config: BeautyVenueConfig,
  intervention_cost_cents: number = 0,
  N: number = 50  // 50 steps × 28 days = ~4 years projection
): number {
  const C_IDX = BEAUTY_STATE_INDEX['C'];  // Completed = order in beauty
  const R_IDX = BEAUTY_STATE_INDEX['R'];  // Return = recurring revenue
  
  let v = stateVector(state);
  let clv = 0;
  
  for (let n = 1; n <= N; n++) {
    v = projectOneStep(v, P);
    
    // Both C and R states generate revenue
    const revenue_prob = v[C_IDX] + v[R_IDX];
    
    // Discount future revenue by delta^n
    clv += Math.pow(config.delta, n) * revenue_prob * config.m_cents;
  }
  
  return Math.round(clv - intervention_cost_cents);
}
 
/**
 * Intervention Value for barbershops
 * Accounts for different discount mechanics (service-level vs product-level)
 */
export function computeBeautyInterventionValue(
  state: BeautyState,
  P_baseline: TransitionMatrix,
  P_deal: TransitionMatrix,
  config: BeautyVenueConfig,
  discount_cents: number,
  N: number = 50
): number {
  const c_i = discount_cents + config.sms_cost_cents;
  
  const C_IDX = BEAUTY_STATE_INDEX['C'];
  const R_IDX = BEAUTY_STATE_INDEX['R'];
  
  // Expected future revenue under each scenario
  const expectedRevenue = (P: TransitionMatrix): number => {
    let v = stateVector(state);
    let total = 0;
    
    for (let n = 1; n <= N; n++) {
      v = projectOneStep(v, P);
      const revenue_prob = v[C_IDX] + v[R_IDX];
      total += revenue_prob * config.m_cents;
    }
    
    return total;
  };
  
  const baseline_revenue = expectedRevenue(P_baseline);
  const deal_revenue = expectedRevenue(P_deal);
  
  const delta_revenue = deal_revenue - baseline_revenue;
  
  return Math.round(delta_revenue - c_i);
}