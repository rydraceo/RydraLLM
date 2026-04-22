// lib/markov/matrix.beauty.ts

import { supabaseAdmin } from '@/lib/supabase/client';
import { BeautyState, BEAUTY_STATE_INDEX } from './type.beauty';

const ALPHA = 1;  // Laplace smoothing
const NUM_STATES = 6;

export type TransitionMatrix = number[][];

/**
 * Build 6×6 transition matrix for a barbershop venue
 * Uses Laplace smoothing to handle sparse early data
 */
export async function buildBeautyTransitionMatrix(
  venueId: string,
  condition: 'baseline' | 'deal_active' = 'baseline'
): Promise<TransitionMatrix> {
  
  // Fetch transition counts from materialized view
  const { data: counts } = await supabaseAdmin
    .from('transition_counts')
    .select('from_state, to_state, transition_count')
    .eq('venue_id', venueId)
    .eq('deal_active', condition === 'deal_active');
  
  // Initialize count matrix
  const countMatrix: number[][] = Array(NUM_STATES)
    .fill(null)
    .map(() => Array(NUM_STATES).fill(0));
  
  // Populate from database
  for (const row of (counts ?? [])) {
    const i = BEAUTY_STATE_INDEX[row.from_state as BeautyState];
    const j = BEAUTY_STATE_INDEX[row.to_state as BeautyState];
    if (i !== undefined && j !== undefined) {
      countMatrix[i][j] = row.transition_count;
    }
  }
  
  // Apply Laplace smoothing and compute probabilities
  const P: TransitionMatrix = Array(NUM_STATES)
    .fill(null)
    .map(() => Array(NUM_STATES).fill(0));
  
  for (let i = 0; i < NUM_STATES; i++) {
    // Enforce absorbing state: X stays X
    if (i === BEAUTY_STATE_INDEX['X']) {
      P[i][BEAUTY_STATE_INDEX['X']] = 1.0;
      continue;
    }
    
    const N_i = countMatrix[i].reduce((a, b) => a + b, 0);
    const denominator = N_i + ALPHA * NUM_STATES;
    
    for (let j = 0; j < NUM_STATES; j++) {
      P[i][j] = (countMatrix[i][j] + ALPHA) / denominator;
    }
    
    // Verify row sums to 1.0
    const rowSum = P[i].reduce((a, b) => a + b, 0);
    if (Math.abs(rowSum - 1.0) > 1e-6) {
      console.warn(`Row ${i} sum: ${rowSum} (should be 1.0)`);
    }
  }
  
  return P;
}

/**
 * Barbershop-specific matrix constraints
 * Some transitions are impossible in beauty-tech
 */
export function enforceBeautyConstraints(P: TransitionMatrix): TransitionMatrix {
  const constrained = P.map(row => [...row]);
  
  // Browse (B) cannot directly become Return (R)
  constrained[BEAUTY_STATE_INDEX['B']][BEAUTY_STATE_INDEX['R']] = 0;
  
  // Viewing (V) cannot directly become Return (R)
  constrained[BEAUTY_STATE_INDEX['V']][BEAUTY_STATE_INDEX['R']] = 0;
  
  // Appointment (A) must go to Completed (C) or Churn (X) if no-show
  // Cannot stay in A state
  constrained[BEAUTY_STATE_INDEX['A']][BEAUTY_STATE_INDEX['A']] = 0;
  
  // Renormalize affected rows
  for (let i = 0; i < NUM_STATES; i++) {
    const sum = constrained[i].reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (let j = 0; j < NUM_STATES; j++) {
        constrained[i][j] /= sum;
      }
    }
  }
  
  return constrained;
}