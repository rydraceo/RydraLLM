import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { customer_scores, customers, promoCodes } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { sendSMS } from '@/lib/sms/clicksend-service';
import { generatePersonalizedIntervention } from '@/lib/markov/predictions.enhanced';
 
export async function POST(request: NextRequest) {
  try {
    const { user_id, venue_id } = await request.json();
 
    if (!user_id || !venue_id) {
      return NextResponse.json(
        { error: 'user_id and venue_id required' },
        { status: 400 }
      );
    }
 
    // Fetch customer intelligence
    const intelligence = await db
      .select()
      .from(customer_scores)
      .where(eq(customer_scores.user_id, user_id))
      .limit(1);
 
    if (!intelligence.length) {
      return NextResponse.json(
        { error: 'Customer intelligence not found' },
        { status: 404 }
      );
    }
 
    const intel = intelligence[0];
 
    // Fetch customer details
    const customerData = await db
      .select()
      .from(customers)
      .where(eq(customers.user_id, user_id))
      .limit(1);
 
    if (!customerData.length) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }
 
    const customer = customerData[0];
 
    // Generate personalized intervention
    const intervention = generatePersonalizedIntervention(
      intel.current_state as any,
      parseFloat(intel.churn_score_10 as any) || 0.5,
      parseFloat(intel.loyalty_score as any) || 0.5,
      parseFloat(intel.gap_ratio as any),
      intel.days_since_last_visit || 0,
      intel.clv_cents || 5000,
      customer.name || 'Valued Customer',
      undefined
    );
 
    // Use correct property names
    const discountAmount = intervention.discount_amount_cents;
    const expectedROI = intervention.expected_roi;
 
    // Check if intervention is worth sending
    if (discountAmount > 3000) {
      return NextResponse.json(
        { error: 'Discount too high', discount: discountAmount },
        { status: 400 }
      );
    }
 
    if (expectedROI < 2.0) {
      return NextResponse.json(
        { error: 'ROI too low', roi: expectedROI },
        { status: 400 }
      );
    }
 
    // Create promo code
    const promoCode = `COMEBACK${user_id.substring(0, 6).toUpperCase()}`;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
 
await db.insert(promoCodes).values({
  code: promoCode,
  customer_id: user_id,
  user_id: user_id,
  venue_id: venue_id,
  discount_cents: discountAmount,
  expires_at: expiresAt,
});
 
    // Send SMS
    const smsMessage = `Hey ${customer.name}! We miss you at Alkami. Book now with code ${promoCode} for $${(discountAmount / 100).toFixed(0)} off! alkami.rydra.com`;
 
    await sendSMS({
      to: customer.phone || '',
      message: smsMessage,
    });
 
    return NextResponse.json({
      success: true,
      customer: customer.name,
      discount: discountAmount,
      roi: expectedROI,
      code: promoCode,
      message: smsMessage,
    });
  } catch (error) {
    console.error('❌ Send intervention error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}