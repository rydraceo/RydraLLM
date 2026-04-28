// app/api/intelligence/at-risk-customers/route.ts
// FINAL CORRECT VERSION - Uses actual schema: user_id and venue_id
 
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { customers, customer_scores } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
 
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
 
    console.log('[API] Fetching customers for venue:', venue_id);
 
    // Query with CORRECT column names:
    // - customers.user_id = customer_scores.user_id (JOIN)
    // - customer_scores.venue_id (FILTER)
    const results = await db
      .select({
        user_id: customers.user_id,
        name: customers.name,
        email: customers.email,
        phone: customers.phone,
        current_state: customer_scores.current_state,
        gap_ratio: customers.gap_ratio,
        days_since_last_visit: sql<number>`
          CASE 
            WHEN ${customers.last_order_date} IS NOT NULL 
            THEN EXTRACT(DAY FROM NOW() - ${customers.last_order_date})::INTEGER
            ELSE 0
          END
        `,
        avg_visit_gap_days: sql<number>`
          COALESCE((${customers.avg_visit_gap_hours} / 24)::INTEGER, 0)
        `,
        total_visits: customers.total_orders,
        potential_revenue_cents: sql<number>`
          COALESCE(${customer_scores.clv_cents}, 0)
        `,
        churn_score_10: customer_scores.churn_score_10,
      })
      .from(customers)
      .innerJoin(
        customer_scores, 
        eq(customers.user_id, customer_scores.user_id)  // ← FIXED: user_id join
      )
      .where(eq(customer_scores.venue_id, venue_id))    // ← FIXED: venue_id filter
      .orderBy(sql`${customers.gap_ratio} DESC NULLS LAST`)
      .limit(100);
 
    console.log('[API] Found customers:', results.length);
 
    // Calculate stats
    const churned_customers = results.filter(c => c.current_state === 'X').length;
    const at_risk_customers = results.filter(c => 
      c.gap_ratio && c.gap_ratio > 1.3 && c.current_state !== 'X'
    ).length;
    const total_potential_revenue = results.reduce((sum, c) => 
      sum + (c.potential_revenue_cents || 0), 0
    );
    const avg_gap_ratio = results.length > 0 
      ? results.reduce((sum, c) => sum + (c.gap_ratio || 0), 0) / results.length
      : 0;
 
    return NextResponse.json({
      customers: results,
      stats: {
        churned_customers,
        at_risk_customers,
        total_potential_revenue,
        avg_gap_ratio: Math.round(avg_gap_ratio * 100) / 100,
      },
    });
 
  } catch (error) {
    console.error('[API] Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch customer data',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}