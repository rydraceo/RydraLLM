// app/api/intelligence/at-risk-customers/route.ts
 
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { customers, customer_scores } from '@/lib/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
 
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const venue_id = searchParams.get('venue_id') || process.env.ALKAMI_VENUE_ID;
 
    if (!venue_id) {
      return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
    }
 
    // Query using Drizzle query builder
    const results = await db
      .select({
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        current_state: customers.current_state,
        days_since_last_visit: sql<number>`EXTRACT(DAY FROM NOW() - ${customers.last_order_date})::INTEGER`,
        total_visits: customers.total_orders,
        gap_ratio: customers.gap_ratio,
        potential_revenue_cents: sql<number>`COALESCE(${customer_scores.clv_cents}, 0)`,
        churn_score_10: customer_scores.churn_score_10,
      })
      .from(customers)
      .innerJoin(customer_scores, eq(customers.user_id, customer_scores.user_id))
      .where(eq(customer_scores.venue_id, venue_id))
      .orderBy(desc(customers.gap_ratio))
      .limit(100);
 
    return NextResponse.json({ 
      customers: results
    });
    
  } catch (error) {
    console.error('At-risk customers error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customers', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}