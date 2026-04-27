// lib/interventions/auto-triggers.ts
 
import { generatePersonalizedIntervention } from '@/lib/markov/predictions.enhanced';  // ← Fixed path!
import { sendSMS } from '@/lib/sms/clicksend-service';  // ← Your actual function name
import { db, and, gte, eq, sql, customerIntelligence, customers, promoCodes } from '@/lib/db';
 
export async function autoTriggerInterventions(venueId: string) {
  console.log(`🎯 Auto-triggering interventions for venue ${venueId}...`);
 
  // Find at-risk customers who've hit the trigger point
  const atRiskCustomers = await db.select({
    intelligence: customerIntelligence,
    customer: customers,
  })
  .from(customerIntelligence)
  .innerJoin(customers, eq(customerIntelligence.customer_id, customers.id))
  .where(
    and(
      eq(customers.venue_id, venueId),
      gte(customerIntelligence.churn_score_30d, '0.35'), // 35%+ risk
      gte(
        customerIntelligence.days_since_last_visit,
        sql`${customerIntelligence.avg_gap_days} * 0.85` // Hit trigger point
      )
    )
  );
 
  console.log(`📱 Found ${atRiskCustomers.length} customers ready for intervention`);
 
  for (const { intelligence, customer } of atRiskCustomers) {
    try {
      // Parse stored values (Drizzle returns decimals as strings)
      const churn_score_30d = parseFloat(intelligence.churn_score_30d || '0');
      const loyalty_score = parseFloat(intelligence.loyalty_score || '0.5');
      const gap_ratio = parseFloat(intelligence.gap_ratio || '1.0');
      const avg_gap_days = parseFloat(intelligence.avg_gap_days || '28');
      const clv_cents = intelligence.clv_cents || 5000;
      
      // Generate intervention with ALL required parameters
      const intervention = generatePersonalizedIntervention(
        intelligence.current_state as any, // BeautyState
        churn_score_30d,
        loyalty_score,
        gap_ratio,
        intelligence.days_since_last_visit || 0,
        clv_cents,
        customer.name,
        undefined // preferred_barber_name - TODO: add this to schema
      );
 
      // Auto-send if ROI > 2.0x and discount < $30
      if (intervention.expected_roi > 2.0 && 
          intervention.discount_amount_cents < 3000) {
        
        // Send SMS via ClickSend (using YOUR function signature)
        const smsResult = await sendSMS({
          to: customer.phone,
          message: intervention.message_template,  // ← 'message' not 'body'
          userId: customer.id,
          venueId: venueId,
        });
 
        if (!smsResult.success) {
          console.error(`❌ Failed to send SMS to ${customer.name}:`, smsResult.error);
          continue;
        }
 
        // Create single-use promo code
        const promoCode = `COMEBACK${customer.id.slice(0, 6).toUpperCase()}`;
        
        await db.insert(promoCodes).values({
          code: promoCode,
          customer_id: customer.id,
          discount_cents: intervention.discount_amount_cents,
          max_uses: 1,
          times_used: 0,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        });
 
        console.log(
          `✅ Sent intervention to ${customer.name}: ` +
          `$${intervention.discount_amount_cents / 100} discount, ` +
          `${intervention.expected_roi.toFixed(1)}x ROI expected, ` +
          `code: ${promoCode}, ` +
          `cost: $${smsResult.cost?.toFixed(2)} AUD`
        );
      } else {
        console.log(
          `⏭️  Skipped ${customer.name}: ` +
          `ROI ${intervention.expected_roi.toFixed(1)}x or ` +
          `discount $${intervention.discount_amount_cents / 100} out of threshold`
        );
      }
    } catch (error) {
      console.error(`❌ Error processing ${customer.name}:`, error);
    }
  }
 
  console.log(`✅ Auto-trigger interventions completed`);
}