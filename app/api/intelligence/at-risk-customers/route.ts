import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const venue_id = request.nextUrl.searchParams.get('venue_id') || 'e1a6c15d-8ccc-4f58-aefb-8bea46e39918';

    const results = await db.execute(sql`
      SELECT 
        c.user_id,
        c.name,
        c.email,
        c.phone,
        c.gap_ratio,
        c.total_orders as total_visits,
        c.current_state,
        EXTRACT(DAY FROM NOW() - c.last_order_date)::INTEGER as days_since_last_visit,
        (c.avg_visit_gap_hours / 24)::INTEGER as avg_visit_gap_days,
        COALESCE(cs.clv_cents, 0) as potential_revenue_cents,
        cs.churn_score_10
      FROM customers c
      INNER JOIN customer_scores cs ON c.user_id = cs.user_id
      WHERE cs.venue_id = ${venue_id}
      ORDER BY c.gap_ratio DESC NULLS LAST
      LIMIT 100
    `) as any[];

    const churned = results.filter(c => c.current_state === 'X').length;
    const at_risk = results.filter(c => c.gap_ratio > 1.3 && c.current_state !== 'X').length;
    const total_revenue = results.reduce((sum, c) => sum + (c.potential_revenue_cents || 0), 0);
    const avg_gap = results.length > 0 
      ? results.reduce((sum, c) => sum + (c.gap_ratio || 0), 0) / results.length 
      : 0;

    return NextResponse.json({
      customers: results,
      stats: {
        churned_customers: churned,
        at_risk_customers: at_risk,
        total_potential_revenue: total_revenue,
        avg_gap_ratio: Math.round(avg_gap * 100) / 100,
      },
    });

  } catch (error) {
    console.error('[API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch customer data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}