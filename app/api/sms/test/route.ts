// app/api/sms/test/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { sendSMS } from '@/lib/sms/clicksend-service';

export async function POST(request: NextRequest) {
  try {
    const { to, message } = await request.json();

    if (!to || !message) {
      return NextResponse.json(
        { error: 'Missing to or message' },
        { status: 400 }
      );
    }

    console.log(`📞 Test SMS request: ${to}`);

    const result = await sendSMS({ to, message });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Test SMS error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}