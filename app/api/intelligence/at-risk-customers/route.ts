// app/api/intelligence/at-risk-customers/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { customer_scores, customers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
 
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const venueId = searchParams.get('venue_id');
 
    if (!venueId) {
      return NextResponse.json(
        { error: 'venue_id required' },
        { status: 400 }
      );
    }
 
    // Fetch at-risk customers with names
    const results = await db
      .select({
        user_id: customer_scores.user_id,
        current_state: customer_scores.current_state,
        gap_ratio: customer_scores.gap_ratio,
        days_since_last_visit: customer_scores.days_since_last_visit,
        avg_visit_gap_days: customer_scores.avg_visit_gap_days,
        total_visits: customer_scores.total_visits,
        potential_revenue_cents: customer_scores.potential_revenue_cents,
        churn_score_10: customer_scores.churn_score_10,
        name: customers.name,
        email: customers.email,
        phone: customers.phone,
      })
      .from(customer_scores)
      .leftJoin(customers, eq(customer_scores.user_id, customers.user_id))
      .where(
        and(
          eq(customer_scores.venue_id, venueId),
          eq(customer_scores.current_state, 'X')
        )
      )
      .limit(50);
 
    // Transform decimals to numbers
    const customers_list = results.map((r) => ({
      user_id: r.user_id || '',
      name: r.name || 'Unknown',
      email: r.email || '',
      phone: r.phone || '',
      current_state: r.current_state || 'X',
      gap_ratio: parseFloat(r.gap_ratio as string) || 0,
      days_since_last_visit: r.days_since_last_visit || 0,
      avg_visit_gap_days: parseFloat(r.avg_visit_gap_days as string) || 0,
      total_visits: r.total_visits || 0,
      potential_revenue_cents: r.potential_revenue_cents || 0,
      churn_score_10: r.churn_score_10 ? parseFloat(r.churn_score_10 as string) : null,
    }));
 
    // Calculate stats
    const total_revenue = customers_list.reduce((sum, c) => sum + c.potential_revenue_cents, 0);
    const avg_gap = customers_list.reduce((sum, c) => sum + c.gap_ratio, 0) / (customers_list.length || 1);
 
    const stats = {
      churned_customers: customers_list.filter(c => c.current_state === 'X').length,
      at_risk_customers: customers_list.filter(c => c.gap_ratio > 1.3).length,
      total_potential_revenue: total_revenue,
      avg_gap_ratio: avg_gap,
    };
 
    return NextResponse.json({
      customers: customers_list,
      stats,
    });
  } catch (error) {
    console.error('Error fetching at-risk customers:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}