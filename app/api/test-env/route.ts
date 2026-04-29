// app/api/test-env/route.ts
// Check if DATABASE_URL is set
 
import { NextRequest, NextResponse } from 'next/server';
 
export async function GET(request: NextRequest) {
  const dbUrl = process.env.DATABASE_URL;
  
  return NextResponse.json({ 
    has_database_url: !!dbUrl,
    url_length: dbUrl?.length || 0,
    url_starts_with: dbUrl?.substring(0, 20) || 'NOT SET',
    alkami_venue_id: process.env.ALKAMI_VENUE_ID,
  });
}
