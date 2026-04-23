// app/api/sms/campaign/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendBulkSMS } from '@/lib/sms/clicksend-service';
import { getSMSTemplate } from '@/lib/sms/templates';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }

  return createClient(supabaseUrl, supabaseKey);
}

export async function POST(request: NextRequest) {
  try {
    const { venue_id, segment, limit = 20 } = await request.json();

    if (!venue_id) {
      return NextResponse.json(
        { error: 'Missing venue_id' },
        { status: 400 }
      );
    }

    console.log(`🎯 Running SMS campaign for segment: ${segment || 'all'}`);

    const supabase = getSupabaseClient();

    // Fetch customers based on segment
    let query = supabase
      .from('customer_scores')
      .select(`
        user_id,
        current_state,
        total_visits,
        days_since_last_visit,
        gap_ratio
      `)
      .eq('venue_id', venue_id)
      .order('gap_ratio', { ascending: false });

    // Apply segment filters
    if (segment === 'at_risk') {
      query = query
        .gt('gap_ratio', 1.3)
        .lte('gap_ratio', 2.5)
        .eq('current_state', 'R');
    } else if (segment === 'churned') {
      query = query.or('gap_ratio.gt.2.5,current_state.eq.X');
    } else if (segment === 'on_fence') {
      query = query
        .gt('gap_ratio', 1.0)
        .lte('gap_ratio', 1.3)
        .eq('current_state', 'R');
    }

    query = query.limit(limit);

    const { data: customers, error } = await query;

    if (error || !customers) {
      throw new Error(`Failed to fetch customers: ${error?.message}`);
    }

    console.log(`📊 Found ${customers.length} customers for ${segment} segment`);

    // Get customer phone numbers from events metadata
    const { data: events } = await supabase
      .from('events')
      .select('user_id, metadata')
      .in('user_id', customers.map(c => c.user_id))
      .eq('venue_id', venue_id);

    // Build SMS messages
    const messages = customers
      .map(customer => {
        const event = events?.find(e => e.user_id === customer.user_id);
        const phone = event?.metadata?.phone;
        const name = event?.metadata?.name;

        if (!phone) {
          console.log(`⚠️  No phone for customer ${customer.user_id}`);
          return null;
        }

        // Determine risk segment
        let riskSegment = 'loyal';
        if (customer.gap_ratio > 2.5 || customer.current_state === 'X') {
          riskSegment = 'churned';
        } else if (customer.gap_ratio > 1.3) {
          riskSegment = 'at_risk';
        } else if (customer.gap_ratio > 1.0) {
          riskSegment = 'on_fence';
        }

        const template = getSMSTemplate(
          riskSegment,
          name,
          customer.days_since_last_visit
        );

        return {
          to: phone,
          message: template.message,
          userId: customer.user_id,
          venueId: venue_id,
        };
      })
      .filter(Boolean) as Array<{
        to: string;
        message: string;
        userId: string;
        venueId: string;
      }>;

    if (messages.length === 0) {
      return NextResponse.json({
        success: true,
        sent: 0,
        failed: 0,
        message: 'No customers with phone numbers found',
      });
    }

    // Send SMS messages
    const results = await sendBulkSMS(messages);

    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const totalCost = sent * 0.08;

    return NextResponse.json({
      success: true,
      sent,
      failed,
      total_cost: totalCost.toFixed(2),
      results,
    });
  } catch (error) {
    console.error('Campaign error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { error: 'Failed to run campaign', details: errorMessage },
      { status: 500 }
    );
  }
}