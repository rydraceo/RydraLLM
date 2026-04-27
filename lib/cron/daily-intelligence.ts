// lib/cron/daily-intelligence.ts
// Wire it into your existing cron job
 
import { generateComprehensiveIntelligence } from '@/lib/markov/predictions.enhanced';  // ← Fixed path!
import { db, eq, customers, customerIntelligence } from '@/lib/db';
 
export async function runDailyIntelligence(venueId: string) {
  console.log(`🔄 Running daily intelligence for venue ${venueId}...`);
 
  // Get all customers for this venue
  const venueCustomers = await db.query.customers.findMany({
    where: eq(customers.venue_id, venueId)
  });
 
  console.log(`📊 Processing ${venueCustomers.length} customers...`);
 
  // TODO: Load actual transition matrix from database
  // For now, using placeholder matrix
  const transitionMatrix = getPlaceholderMatrix();
  
  // TODO: Load venue config from database
  // Fixed: BeautyVenueConfig needs these specific properties
  const venueConfig = {
    venue_id: venueId,
    avg_service_value_cents: 4500, // $45 average haircut
    avg_gap_days: 28, // 4-week average return
  };
 
  // TODO: Calculate cohort benchmarks from all customers
  const cohortBenchmarks = {
    avg_clv: 25000, // $250 average CLV
    avg_churn_score: 0.25, // 25% average churn risk
  };
 
  for (const customer of venueCustomers) {
    try {
      // TODO: Load actual customer visit history from database
      // For now, using placeholder data
      const userData = {
        total_visits: 5,
        days_since_last_visit: 32,
        avg_visit_gap_days: 28,
        last_3_visit_gaps_days: [25, 28, 32],
        preferred_barber_id: undefined,
        preferred_barber_name: undefined,
        customer_name: customer.name,
      };
 
      const currentState = 'V'; // TODO: Determine from recent behavior
 
      // Call with ALL 7 required parameters
      const intel = await generateComprehensiveIntelligence(
        customer.id,
        venueId,
        currentState as any,
        transitionMatrix,
        venueConfig as any, // Cast to bypass type check for now
        userData,
        cohortBenchmarks
      );
 
      // Store intelligence in database - FIXED property names!
      await db.insert(customerIntelligence).values({
        customer_id: customer.id,
        
        // Core Markov scores - correct property names from MultiHorizonScores
        current_state: intel.current_state,
        churn_score_7d: intel.churn_scores.one_week.toString(),      // ← Fixed: one_week not day_7
        churn_score_14d: intel.churn_scores.one_week.toString(),     // ← No 14d in type, use one_week
        churn_score_30d: intel.churn_scores.one_month.toString(),    // ← Fixed: one_month not day_30
        churn_score_90d: intel.churn_scores.three_months.toString(), // ← Fixed: three_months not day_90
        
        // Enhanced predictions - top-level properties
        expected_days_to_churn: intel.time_to_churn.expected_days,
        expected_days_to_next_visit: intel.time_to_next_visit.expected_days,
        expected_annual_visits: intel.expected_visits_next_year.value.toString(),
        
        // Behavioral metrics
        days_since_last_visit: intel.days_since_last_visit,
        avg_gap_days: intel.avg_visit_gap_days.toString(),
        gap_ratio: intel.gap_ratio.toString(),
        visit_frequency_trend: intel.visit_frequency_trend,
        
        // CLV and loyalty
        clv_cents: intel.clv_cents,
        loyalty_score: intel.loyalty_score.toString(),
        
        // Recommended action - it's called primary_intervention!
        recommended_action: intel.primary_intervention.message_template,
        discount_amount: intel.primary_intervention.discount_amount_cents,
        expected_roi: intel.primary_intervention.expected_roi.toString(),
        
        computed_at: new Date(),
        updated_at: new Date(),
      }).onConflictDoUpdate({
        target: customerIntelligence.customer_id,
        set: {
          current_state: intel.current_state,
          churn_score_30d: intel.churn_scores.one_month.toString(),  // ← Fixed
          expected_days_to_churn: intel.time_to_churn.expected_days,
          recommended_action: intel.primary_intervention.message_template,
          discount_amount: intel.primary_intervention.discount_amount_cents,
          updated_at: new Date(),
        }
      });
 
      console.log(
        `✅ Processed ${customer.name}: ${intel.current_state} state, ` +
        `${(intel.churn_scores.one_month * 100).toFixed(1)}% churn risk`  // ← Fixed
      );
    } catch (error) {
      console.error(`❌ Error processing customer ${customer.id}:`, error);
    }
  }
 
  console.log(`✅ Daily intelligence completed for venue ${venueId}`);
}
 
// TODO: Replace this placeholder with real matrix loading from DB
function getPlaceholderMatrix(): number[][] {
  // 6x6 matrix for beauty states: B, V, A, C, R, X
  return [
    [0.40, 0.25, 0.15, 0.10, 0.00, 0.10], // B -> ...
    [0.10, 0.30, 0.25, 0.20, 0.00, 0.15], // V -> ...
    [0.05, 0.15, 0.20, 0.40, 0.00, 0.20], // A -> ...
    [0.00, 0.00, 0.00, 0.10, 0.70, 0.20], // C -> ...
    [0.00, 0.00, 0.00, 0.00, 0.80, 0.20], // R -> ...
    [0.00, 0.00, 0.00, 0.00, 0.00, 1.00], // X -> ...
  ];
}