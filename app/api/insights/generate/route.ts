// app/api/insights/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { generateInsights } from '@/lib/llm/insights';

export async function POST(request: NextRequest) {
  try {
    const { venue_id } = await request.json();

    if (!venue_id) {
      return NextResponse.json(
        { error: 'Missing venue_id' },
        { status: 400 }
      );
    }

    console.log(`Generating insights for venue: ${venue_id}`);

    // Generate AI insights from real Supabase data
    const insights = await generateInsights(venue_id);

    return NextResponse.json(insights);
  } catch (error) {
    console.error('Generate insights error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { error: 'Failed to generate insights', details: errorMessage },
      { status: 500 }
    );
  }
}

// Optional: GET endpoint to fetch insights without needing a POST body
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const venue_id = searchParams.get('venue_id');

    if (!venue_id) {
      return NextResponse.json(
        { error: 'Missing venue_id query parameter' },
        { status: 400 }
      );
    }

    console.log(`Generating insights for venue: ${venue_id}`);

    const insights = await generateInsights(venue_id);

    return NextResponse.json(insights);
  } catch (error) {
    console.error('Generate insights error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { error: 'Failed to generate insights', details: errorMessage },
      { status: 500 }
    );
  }
}