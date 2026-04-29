// app/api/intelligence/at-risk-customers/route.ts
 
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
 
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const venue_id = searchParams.get('venue_id') || process.env.ALKAMI_VENUE_ID;
 
    if (!venue_id) {
      return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
    }
 
    const query = sql`
      SELECT 
        c.name,
        c.phone,
        c.email,
        c.current_state,
        EXTRACT(DAY FROM NOW() - c.last_order_date)::INTEGER as days_since_last_visit,
        c.total_visits,
        c.gap_ratio,
        COALESCE(cs.clv_cents, 0) as potential_revenue_cents,
        cs.churn_score_10
      FROM customers c
      INNER JOIN customer_scores cs ON c.user_id = cs.user_id
      WHERE cs.venue_id = ${venue_id}
      ORDER BY c.gap_ratio DESC NULLS LAST
      LIMIT 100
    `;
 
    const results = await db.execute(query);
    
    return NextResponse.json({ 
  customers: results || []
});
    
  } catch (error) {
    console.error('At-risk customers error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customers', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}