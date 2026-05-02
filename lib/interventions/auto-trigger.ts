// lib/interventions/auto-triggers.ts
// FIXED: Removed duplicate user_id field and fixed type conversions
 
import { generatePersonalizedIntervention } from '@/lib/markov/predictions.enhanced';
import { sendSMS } from '@/lib/sms/clicksend-service';
import { db } from '@/lib/db';
import { customer_scores, customers, promoCodes } from '@/lib/db/schema';
import { and, gte, eq, sql } from 'drizzle-orm';
 
export async function autoTriggerInterventions(venueId: string) {
  console.log(`🎯 Auto-triggering interventions for venue ${venueId}...`);
 
  // Find at-risk customers who've hit the trigger point
  const atRiskCustomers = await db
    .select({
      score: customer_scores,
      customer: customers,
    })
    .from(customer_scores)
    .innerJoin(customers, eq(customer_scores.user_id, customers.user_id))
    .where(
      and(
        eq(customer_scores.venue_id, venueId),
        gte(customer_scores.churn_score_10, 0.35), // ✅ Works with real()
        gte(
          customer_scores.days_since_last_visit,
          sql`${customer_scores.avg_visit_gap_days} * 0.85` // Hit trigger point
        )
      )
    );
 
  console.log(`📱 Found ${atRiskCustomers.length} customers ready for intervention`);
 
  let sent = 0;
  let skipped = 0;
 
  for (const row of atRiskCustomers) {
    const { score, customer } = row;
 
    try {
      // Generate personalized intervention
      const intervention = generatePersonalizedIntervention(
        score.current_state as any,
        (score.churn_score_10 ?? 0.5) as number,
        (score.loyalty_score ?? 0.5) as number,
        (score.gap_ratio ?? 0) as number,
        score.days_since_last_visit ?? 0,
        score.clv_cents ?? 5000,
        customer.name || 'Valued Customer',
        undefined
      );
 
      const discountAmount = intervention.discount_amount_cents;
      const expectedROI = intervention.expected_roi;
 
      // Check ROI and discount thresholds
      if (discountAmount > 3000 || expectedROI < 2.0) {
        console.log(`⏭️  Skipping ${customer.name}: discount=${discountAmount}, ROI=${expectedROI}`);
        skipped++;
        continue;
      }
 
      // Create promo code
      const promoCode = `COMEBACK${score.user_id.substring(0, 6).toUpperCase()}`;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);
 
      // ✅ FIXED: Only customer_id, NOT user_id
      await db.insert(promoCodes).values({
        code: promoCode,
        customer_id: score.user_id,
        venue_id: venueId,
        discount_cents: discountAmount,
        expires_at: expiresAt,
      });
 
      // Send SMS
      const message = `Hey ${customer.name}! We miss you at Alkami. Book now with code ${promoCode} for $${(discountAmount / 100).toFixed(0)} off! alkami.rydra.com`;
 
      await sendSMS({
        to: customer.phone || '',
        message,
      });
 
      console.log(`✅ Sent intervention to ${customer.name}: $${discountAmount / 100} discount, ${expectedROI.toFixed(1)}x ROI expected, code: ${promoCode}`);
      sent++;
    } catch (error) {
      console.error(`❌ Failed to send intervention to ${customer.name}:`, error);
    }
  }
 
  console.log(`✨ Intervention run complete: ${sent} sent, ${skipped} skipped`);
  return { sent, skipped };
}