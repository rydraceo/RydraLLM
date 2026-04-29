// app/api/test-postgres/route.ts
// Test direct postgres connection without Drizzle
 
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
 
export async function GET(request: NextRequest) {
  let client;
  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    
    client = await pool.connect();
    const result = await client.query('SELECT NOW(), COUNT(*) FROM customers');
    
    await client.release();
    await pool.end();
    
    return NextResponse.json({ 
      success: true,
      result: result.rows[0],
      rowCount: result.rowCount
    });
    
  } catch (error) {
    if (client) {
      await client.release();
    }
    
    return NextResponse.json(
      { 
        error: 'Direct postgres test failed', 
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}