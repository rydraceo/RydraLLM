import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { applyOptOut } from '@/lib/sms/optout';

const STOP = /^\s*(stop|unsubscribe|opt[\s-]?out|cancel|end|quit)\b/i;

export async function POST(req: NextRequest) {
  if (req.nextUrl.searchParams.get('key') !== process.env.SMS_WEBHOOK_KEY)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const ct = req.headers.get('content-type') ?? '';
  const p: any = ct.includes('json') ? await req.json() : Object.fromEntries(await req.formData());
  const from = String(p.from ?? '');
  const text = String(p.message ?? p.body ?? '');
  if (from && STOP.test(text)) {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    await applyOptOut(supabase, from, 'stop_reply', text.slice(0, 200));
  }
  return NextResponse.json({ ok: true });
}