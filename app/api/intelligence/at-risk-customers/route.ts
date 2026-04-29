// app/api/intelligence/at-risk-customers/route.ts
// Simplified - just customers table, no join
 
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { customers } from '@/lib/db/schema';
import { eq, desc, isNotNull } from 'drizzle-orm';
 
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const venue_id = searchParams.get('venue_id') || process.env.ALKAMI_VENUE_ID;
 
    if (!venue_id) {
      return NextResponse.json({ error: 'venue_id required' }, { status: 400 });
    }
 
    // Simple query - just customers table
    const results = await db
      .select({
        name: customers.name,
        phone: customers.phone,
        email: customers.email,
        current_state: customers.current_state,
        gap_ratio: customers.gap_ratio,
        total_visits: customers.total_orders,
      })
      .from(customers)
      .where(eq(customers.business_id, venue_id))
      .orderBy(desc(customers.gap_ratio))
      .limit(100);
 
    return NextResponse.json({ 
      customers: results,
      count: results.length
    });
    
  } catch (error) {
    console.error('At-risk customers error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch customers', 
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}