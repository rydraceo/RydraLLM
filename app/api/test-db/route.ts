// app/api/test-db/route.ts
 
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { customers } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
 
export async function GET(request: NextRequest) {
  try {
    // Test 1: Can we connect?
    const test1 = await db.execute(sql`SELECT 1 as test`);
    
    // Test 2: Can we count customers?
    const test2 = await db.execute(sql`SELECT COUNT(*) FROM customers`);
    
    // Test 3: Can we get one customer?
    const test3 = await db.execute(sql`SELECT * FROM customers LIMIT 1`);
    
    // Test 4: What venue_ids exist?
    const test4 = await db.execute(sql`SELECT DISTINCT business_id FROM customers LIMIT 10`);
 
    return NextResponse.json({ 
      connection: test1,
      count: test2,
      sample: test3,
      venue_ids: test4,
    });
    
  } catch (error) {
    console.error('Database test error:', error);
    return NextResponse.json(
      { 
        error: 'Database test failed', 
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
