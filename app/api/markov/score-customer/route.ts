// app/api/markov/score-customer/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
 
export async function POST(request: NextRequest) {
  try {
    // Create client INSIDE the function (runtime, not build time)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
 
    const { user_id, venue_id } = await request.json();
 
    if (!user_id || !venue_id) {
      return NextResponse.json(
        { error: 'Missing user_id or venue_id' },
        { status: 400 }
      );
    }
 
    // Get customer score
    const { data: score, error } = await supabase
      .from('customer_scores')
      .select('*')
      .eq('user_id', user_id)
      .eq('venue_id', venue_id)
      .single();
 
    if (error || !score) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }
 
    // Calculate risk segment
    const gapRatio = score.gap_ratio || 0;
    let riskSegment = 'loyal';
    let action = 'appreciation_only';
    let urgency = 'low';
 
    if (gapRatio > 2.5) {
      riskSegment = 'churned';
      action = 'win_back_campaign';
      urgency = 'medium';
    } else if (gapRatio > 1.3 && score.current_state === 'R') {
      riskSegment = 'at_risk';
      action = 'urgent_sms_with_discount';
      urgency = 'high';
    } else if (gapRatio > 1.0) {
      riskSegment = 'on_fence';
      action = 'gentle_nudge_no_discount';
      urgency = 'medium';
    }
 
    return NextResponse.json({
      user_id,
      venue_id,
      risk_segment: riskSegment,
      recommended_action: action,
      urgency,
      metrics: {
        current_state: score.current_state,
        total_visits: score.total_visits,
        days_since_last_visit: score.days_since_last_visit,
        avg_visit_gap_days: score.avg_visit_gap_days,
        gap_ratio: gapRatio,
      },
      last_updated: score.updated_at,
    });
  } catch (error) {
    console.error('Score customer error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
 