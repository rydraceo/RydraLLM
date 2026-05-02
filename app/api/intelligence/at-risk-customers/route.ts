// app/api/intelligence/at-risk-customers/route.ts
// SIMPLIFIED VERSION - Works with real() numeric types
 
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { customer_scores } from '@/lib/db/schema';
import { eq, and, isNotNull, desc } from 'drizzle-orm';
 
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
 
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const venue_id = searchParams.get('venue_id');
 
    if (!venue_id) {
      return NextResponse.json(
        { error: 'venue_id parameter is required' },
        { status: 400 }
      );
    }
 
    console.log('[API] Fetching customers for venue_id:', venue_id);
 
    // Query customer_scores table
    const results = await db
      .select()
      .from(customer_scores)
      .where(
        and(
          eq(customer_scores.venue_id, venue_id),
          isNotNull(customer_scores.gap_ratio)
        )
      )
      .orderBy(desc(customer_scores.gap_ratio))
      .limit(100);
 
    console.log('[API] Found customers:', results.length);
 
    // Calculate stats
    const atRisk = results.filter(c => c.current_state === 'A').length;
    const churned = results.filter(c => c.current_state === 'X').length;
    const totalRevenue = results.reduce((sum, c) => sum + (c.clv_cents || 0), 0);
 
    // Format for frontend
    const customers = results.map(customer => ({
      customer_id: customer.user_id,
      phone: null,
      current_state: customer.current_state,
      gap_ratio: customer.gap_ratio,
      avg_visit_gap_hours: customer.avg_visit_gap_days 
        ? customer.avg_visit_gap_days * 24 
        : null,
      total_orders: customer.total_visits,
      last_order_date: customer.last_event_at,
      churn_score_5: customer.churn_score_5,
      churn_score_10: customer.churn_score_10,
      loyalty_score: customer.loyalty_score,
      clv_cents: customer.clv_cents,
      intervention_value_cents: customer.intervention_value_cents,
      risk_segment: customer.risk_segment,
    }));
 
    return NextResponse.json({
      success: true,
      data: {
        customers,
        stats: {
          atRisk,
          churned,
          totalRevenue,
          totalCustomers: results.length,
        },
      },
    });
 
  } catch (error: any) {
    console.error('[API] Error fetching customers:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch customers',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}