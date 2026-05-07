import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
 
// ─── Markov Chain ─────────────────────────────────────────────────────────────
// ChurnScore(i,n) = (e_i × P^n)_X  |  n=3 ≈ 4.5 months @ 45-day avg cycle
 
const TRANSITION_MATRIX: number[][] = [
  [0.00, 0.40, 0.25, 0.15, 0.20], // C (First Timer)
  [0.00, 0.75, 0.18, 0.05, 0.02], // R_loyal
  [0.00, 0.30, 0.35, 0.25, 0.10], // R_on_fence
  [0.00, 0.08, 0.15, 0.35, 0.42], // R_at_risk
  [0.00, 0.00, 0.00, 0.00, 1.00], // X (absorbing)
];
 
function multiplyMatrix(A: number[][], B: number[][]): number[][] {
  const C: number[][] = [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      for (let k = 0; k < 5; k++) {
        C[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return C;
}
 
function matrixPower(M: number[][], n: number): number[][] {
  let result: number[][] = [
    [1, 0, 0, 0, 0],
    [0, 1, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 0, 1, 0],
    [0, 0, 0, 0, 1],
  ];
  for (let i = 0; i < n; i++) {
    result = multiplyMatrix(result, M);
  }
  return result;
}
 
// Pre-computed once at module load — immutable, safe for serverless
const Pn3: number[][] = matrixPower(TRANSITION_MATRIX, 3);
 
const STATE_IDX: Record<string, number> = {
  C: 0, R_loyal: 1, R_on_fence: 2, R_at_risk: 3, X: 4,
};
 
const CONVERSION_RATES: Record<string, { natural: number; sms: number }> = {
  C:          { natural: 0.25, sms: 0.45 },
  X:          { natural: 0.03, sms: 0.15 },
  R_at_risk:  { natural: 0.15, sms: 0.35 },
  R_on_fence: { natural: 0.40, sms: 0.55 },
  R_loyal:    { natural: 0.65, sms: 0.70 },
};
 
const SMS_COST_AUD = 0.08;
 
function deriveMarkovKey(visits: number, gap_ratio: number, state: string): string {
  if (visits <= 1) return "C";
  if (gap_ratio > 2.5 || state === "X") return "X";
  if (gap_ratio > 1.3) return "R_at_risk";
  if (gap_ratio > 1.0) return "R_on_fence";
  return "R_loyal";
}
 
function computeChurnScore(markov_key: string): number {
  const idx = STATE_IDX[markov_key] ?? 2;
  return parseFloat(Pn3[idx][4].toFixed(4));
}
 
function calcInterventionValue(clv_aud: number, markov_key: string): number {
  const rates = CONVERSION_RATES[markov_key] ?? CONVERSION_RATES["R_on_fence"];
  return Math.max(clv_aud * (rates.sms - rates.natural) - SMS_COST_AUD, 0);
}
 
// ─── Handler ──────────────────────────────────────────────────────────────────
 
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const venue_id = searchParams.get("venue_id");
 
    if (!venue_id) {
      return NextResponse.json({ error: "venue_id is required" }, { status: 400 });
    }
 
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
 
    const BATCH_SIZE = 1000;
    let allCustomers: any[] = [];
    let from = 0;
    let hasMore = true;
 
    while (hasMore) {
      const { data, error } = await supabase
        .rpc("get_customers_with_scores", { p_venue_id: venue_id })
        .range(from, from + BATCH_SIZE - 1);
 
      if (error) {
        console.error("[at-risk-customers] RPC error:", error.message);
        return NextResponse.json(
          { error: "Database query failed", details: error.message },
          { status: 500 }
        );
      }
 
      const batch = data || [];
      allCustomers = [...allCustomers, ...batch];
      hasMore = batch.length === BATCH_SIZE;
      from += BATCH_SIZE;
    }
 
    console.log(`[at-risk-customers] Loaded ${allCustomers.length} customers`);
 
    const customers = allCustomers.map((row: any) => {
      const clv_cents = Number(row.clv_cents) || 0;
      const clv_aud = clv_cents / 100;
      const visits = Number(row.total_visits) || 0;
      const gap_ratio = parseFloat((Number(row.gap_ratio) || 0).toFixed(2));
      const state = row.current_state || "R";
      const markov_state = deriveMarkovKey(visits, gap_ratio, state);
 
      const db_churn = row.churn_score_10;
      const churn_score =
        db_churn != null && Number(db_churn) > 0
          ? parseFloat(Number(db_churn).toFixed(4))
          : computeChurnScore(markov_state);
 
      const db_iv = row.intervention_value_cents;
      const intervention_value =
        db_iv != null
          ? parseFloat((Number(db_iv) / 100).toFixed(2))
          : parseFloat(calcInterventionValue(clv_aud, markov_state).toFixed(2));
 
      return {
        score_id:                 row.score_id,
        user_id:                  row.user_id,
        name:                     row.customer_name || "Unknown Customer",
        phone:                    row.customer_phone || "No phone",
        email:                    row.customer_email || null,
        status:                   state,
        gap_ratio,
        days_overdue:             Number(row.days_since_last_visit) || 0,
        visits,
        potential_value:          clv_aud.toFixed(2),
        churn_score,
        loyalty_score:            row.loyalty_score ? parseFloat(Number(row.loyalty_score).toFixed(2)) : null,
        last_visit:               row.last_event_at || null,
        avg_gap_days:             Number(row.avg_visit_gap_days) || 0,
        risk_segment:             row.risk_segment || "Unknown",
        intervention_recommended: Boolean(row.intervention_recommended),
        intervention_value,
        markov_state,
      };
    });
 
    const totalIV = customers.reduce((s, c) => s + c.intervention_value, 0);
    const avgChurn = customers.reduce((s, c) => s + c.churn_score, 0) / (customers.length || 1);
 
    const churnByState: Record<string, { count: number; avg_churn: number }> = {};
    customers.forEach((c) => {
      if (!churnByState[c.markov_state]) {
        churnByState[c.markov_state] = { count: 0, avg_churn: 0 };
      }
      churnByState[c.markov_state].count++;
      churnByState[c.markov_state].avg_churn += c.churn_score;
    });
    Object.keys(churnByState).forEach((k) => {
      const s = churnByState[k];
      s.avg_churn = parseFloat((s.avg_churn / s.count).toFixed(4));
    });
 
    return NextResponse.json({
      customers,
      summary: {
        total:                    customers.length,
        intervention_ready:       customers.filter((c) => c.intervention_value > 0).length,
        total_intervention_value: parseFloat(totalIV.toFixed(2)),
        avg_churn_score:          parseFloat(avgChurn.toFixed(4)),
        churn_by_state:           churnByState,
        sms_cost_per_message:     SMS_COST_AUD,
        markov_n_steps:           3,
      },
    });
  } catch (error: any) {
    console.error("[at-risk-customers] Unexpected error:", error);
    return NextResponse.json(
      { error: "Failed to fetch customers", details: error.message },
      { status: 500 }
    );
  }
}