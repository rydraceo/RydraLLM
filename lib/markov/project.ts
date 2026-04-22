import { State, STATE_INDEX, TransitionMatrix, STATES } from './type';

// Create one-hot state vector
// e.g. stateVector('C') = [0, 0, 1, 0, 0, 0]
export function stateVector(state: State): number[] {
  const v = Array(6).fill(0);
  v[STATE_INDEX[state]] = 1;
  return v;
}

// Multiply state vector by transition matrix (one step)
// v_new[j] = sum over i of (v[i] * P[i][j])
// Complexity: O(36) - trivially fast for 6x6
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

// Project n steps forward: v(n) = v(0) x P^n
// This is the core of the Markov model
export function projectNSteps(
  state: State,
  P: TransitionMatrix,
  n: number
): number[] {
  let v = stateVector(state);
  for (let k = 0; k < n; k++) {
    v = projectOneStep(v, P);
  }
  return v;
}
