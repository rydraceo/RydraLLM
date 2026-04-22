import { State, STATE_INDEX, TransitionMatrix, VenueConfig } from './type';
import { projectNSteps, stateVector, projectOneStep } from './project';

// ─── FORMULA 1: CHURN SCORE ────────────────────────────────────────────
// ChurnScore(i, n) = (e_i x P^n)_X
// Probability of being in Churn state after n transitions
export function churnScore(
  state: State,
  P: TransitionMatrix,
  n: number
): number {
  const vn = projectNSteps(state, P, n);
  return vn[STATE_INDEX['X']];
}

// ─── FORMULA 2: LOYALTY SCORE ──────────────────────────────────────────
// f_i = sum_j P_ij * f_j, with f_R = 1.0, f_X = 0.0
// Solved by value iteration (1000 iterations, converges < 1e-8)
export function computeLoyaltyScores(
  P: TransitionMatrix
): Record<State, number> {
  const R_IDX = STATE_INDEX['R'];
  const X_IDX = STATE_INDEX['X'];

  // Initialise: boundaries are fixed, others start at 0.5
  let f = Array(6).fill(0.5);
  f[R_IDX] = 1.0;  // Boundary: Return = certain loyalty
  f[X_IDX] = 0.0;  // Boundary: Churn = zero loyalty

  // Value iteration
  for (let iter = 0; iter < 1000; iter++) {
    const f_new = [...f];
    for (let i = 0; i < 6; i++) {
      if (i === R_IDX || i === X_IDX) continue; // Skip boundaries
      f_new[i] = P[i].reduce((sum, pij, j) => sum + pij * f[j], 0);
    }
    const delta = f_new.reduce((acc, v, i) => acc + Math.abs(v - f[i]), 0);
    f = f_new;
    if (delta < 1e-8) break; // Converged
  }

  return Object.fromEntries(
    ['B','D','C','O','R','X'].map((s, i) => [s, f[i]])
  ) as Record<State, number>;
}

// ─── FORMULA 3: CLV ────────────────────────────────────────────────────
// CLV(i) = m x sum_n(delta^n x P(O at step n | start=i)) - c_i
export function computeCLV(
  state: State,
  P: TransitionMatrix,
  config: VenueConfig,
  intervention_cost_cents: number = 0,
  N: number = 50
): number {
  const O_IDX = STATE_INDEX['O'];
  let v = stateVector(state);
  let clv = 0;
  for (let n = 1; n <= N; n++) {
    v = projectOneStep(v, P);
    // Weight future orders by discount factor (time value)
    clv += Math.pow(config.delta, n) * v[O_IDX] * config.m_cents;
  }
  return Math.round(clv - intervention_cost_cents);
}

// ─── FORMULA 4: INTERVENTION VALUE (ΔV) ──────────────────────────────
// ΔV_i = [q_i(deal) - q_i(baseline)] x m - c_i
export function computeInterventionValue(
  state: State,
  P_baseline: TransitionMatrix,
  P_deal: TransitionMatrix,
  config: VenueConfig,
  discount_cents: number,
  N: number = 50
): number {
  const sms_cost_cents = 7; // $0.07 AUD
  const c_i = discount_cents + sms_cost_cents;
  const O_IDX = STATE_INDEX['O'];

  // Expected future orders under each matrix
  const q = (P: TransitionMatrix) => {
    let v = stateVector(state);
    let total = 0;
    for (let n = 1; n <= N; n++) {
      v = projectOneStep(v, P);
      total += v[O_IDX];
    }
    return total;
  };

  const delta_q = q(P_deal) - q(P_baseline);
  return Math.round(delta_q * config.m_cents - c_i);
}
