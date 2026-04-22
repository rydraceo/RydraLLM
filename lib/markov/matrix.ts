import { TransitionMatrix, STATES, STATE_INDEX } from './type';
import { supabaseAdmin } from '@/lib/supabase/client';

const ALPHA = 1; // Laplace smoothing constant
const NUM_STATES = 6;

// Build 6x6 transition matrix from Supabase transition counts
// Formula: P_ij = (N_ij + alpha) / (N_i + alpha * |S|)
export async function buildTransitionMatrix(
  venueId: string,
  condition: 'baseline' | 'deal_active' = 'baseline'
): Promise<TransitionMatrix> {

  // Count all transitions from Supabase
  const { data: transitions } = await supabaseAdmin
    .from('state_transitions')
    .select('from_state, to_state')
    .eq('venue_id', venueId)
    .eq('deal_active', condition === 'deal_active');

  // Initialise count matrix with zeros
  const counts: number[][] = Array(NUM_STATES)
    .fill(null).map(() => Array(NUM_STATES).fill(0));

  // Count observed transitions
  for (const t of (transitions ?? [])) {
    const i = STATE_INDEX[t.from_state as keyof typeof STATE_INDEX];
    const j = STATE_INDEX[t.to_state as keyof typeof STATE_INDEX];
    if (i !== undefined && j !== undefined) counts[i][j]++;
  }

  // Apply Laplace smoothing and compute probabilities
  const P: TransitionMatrix = Array(NUM_STATES)
    .fill(null).map(() => Array(NUM_STATES).fill(0));

  for (let i = 0; i < NUM_STATES; i++) {
    // Enforce absorbing state: X stays X
    if (i === STATE_INDEX['X']) {
      P[i][STATE_INDEX['X']] = 1.0;
      continue;
    }
    const N_i = counts[i].reduce((a, b) => a + b, 0);
    const denominator = N_i + ALPHA * NUM_STATES;
    for (let j = 0; j < NUM_STATES; j++) {
      P[i][j] = (counts[i][j] + ALPHA) / denominator;
    }
    // Verify row sums to 1 (within floating point tolerance)
    const rowSum = P[i].reduce((a, b) => a + b, 0);
    console.assert(Math.abs(rowSum - 1.0) < 1e-6,
      `Row ${STATES[i]} sums to ${rowSum}`);
  }

  return P;
}
