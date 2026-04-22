// lib/markov/project.beauty.ts
/**
 * Core Markov Chain matrix projection functions
 * Used by all prediction formulas
 */
 
import { BeautyState, BEAUTY_STATE_INDEX } from './type.beauty';
import type { TransitionMatrix } from './type.beauty';
 
/**
 * Create a one-hot state vector
 * Example: stateVector('C') = [0, 0, 1, 0, 0, 0]
 * 
 * @param state - The Markov state (B, V, A, C, R, X)
 * @returns Array of length 6 with 1 at the state index, 0 elsewhere
 */
export function stateVector(state: BeautyState): number[] {
  const v = Array(6).fill(0);
  v[BEAUTY_STATE_INDEX[state]] = 1;
  return v;
}
 
/**
 * Multiply state vector by transition matrix (one step)
 * Formula: v_new[j] = sum over i of (v[i] * P[i][j])
 * 
 * This is the fundamental Markov chain operation
 * 
 * @param v - Current state probability distribution
 * @param P - Transition probability matrix (6x6)
 * @returns New state probability distribution after one transition
 */
export function projectOneStep(
  v: number[],
  P: TransitionMatrix
): number[] {
  const n = 6;
  const result = Array(n).fill(0);
  
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      result[j] += v[i] * P[i][j];
    }
  }
  
  return result;
}
 
/**
 * Project n steps forward
 * Formula: v(n) = v(0) × P^n
 * 
 * This computes the probability distribution after n transitions
 * 
 * @param state - Starting Markov state
 * @param P - Transition probability matrix
 * @param n - Number of steps to project forward
 * @returns Probability distribution after n steps
 */
export function projectNSteps(
  state: BeautyState,
  P: TransitionMatrix,
  n: number
): number[] {
  let v = stateVector(state);
  
  for (let k = 0; k < n; k++) {
    v = projectOneStep(v, P);
  }
  
  return v;
}
 
/**
 * Verify that a transition matrix is valid
 * - All entries between 0 and 1
 * - All rows sum to 1.0
 * 
 * @param P - Transition matrix to validate
 * @returns Object with validation results
 */
export function validateMatrix(P: TransitionMatrix): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  for (let i = 0; i < 6; i++) {
    // Check row sum
    const rowSum = P[i].reduce((a, b) => a + b, 0);
    if (Math.abs(rowSum - 1.0) > 1e-6) {
      errors.push(`Row ${i} sums to ${rowSum} (should be 1.0)`);
    }
    
    // Check all entries are probabilities
    for (let j = 0; j < 6; j++) {
      if (P[i][j] < 0 || P[i][j] > 1) {
        errors.push(`P[${i}][${j}] = ${P[i][j]} (should be between 0 and 1)`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}