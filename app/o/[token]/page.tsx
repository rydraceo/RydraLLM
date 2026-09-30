import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { applyOptOut } from '@/lib/sms/optout';

export const dynamic = 'force-dynamic';
const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const page = { minHeight: '100vh', background: '#0A0612', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif', color: '#F5F0FF' } as const;
const card = { width: '100%', maxWidth: 420, background: '#130C24', border: '1px solid #2A1852', borderRadius: 16, padding: '36px 28px', textAlign: 'center' } as const;

export default async function Page({ params, searchParams }: {
  params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const { done } = await searchParams;

  const { data: c } = await db().from('customers').select('id').eq('sms_optout_token', token).maybeSingle();

  async function confirm() {
    'use server';
    const supabase = db();
    const { data: row } = await supabase.from('customers').select('id, phone').eq('sms_optout_token', token).maybeSingle();
    if (row?.phone) await applyOptOut(supabase, row.phone, 'link');
    else if (row) await supabase.from('customers').update({ sms_opt_out: true, sms_opt_out_at: new Date().toISOString() }).eq('id', row.id);
    redirect(`/o/${token}?done=1`);
  }

  return (
    <main style={page}>
      <div style={card}>
        <div style={{ color: '#D4A017', letterSpacing: 6, fontSize: 13, fontWeight: 700, marginBottom: 24 }}>ALKAMI</div>
        {done ? (
          <>
            <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>You're unsubscribed</h1>
            <p style={{ color: '#A78BFA', fontSize: 14, lineHeight: 1.6, margin: 0 }}>You won't receive any more text messages from Alkami Barbershop.</p>
          </>
        ) : !c ? (
          <>
            <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>This link isn't valid</h1>
            <p style={{ color: '#A78BFA', fontSize: 14, lineHeight: 1.6, margin: 0 }}>It may have expired or been copied incorrectly. Contact Alkami Barbershop directly to opt out.</p>
          </>
        ) : (
          <form action={confirm}>
            <h1 style={{ fontSize: 22, margin: '0 0 12px' }}>Stop text messages?</h1>
            <p style={{ color: '#A78BFA', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>Tap below and Alkami Barbershop will stop texting this number.</p>
            <button type="submit" style={{ background: '#5B21B6', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 28px', fontSize: 15, fontWeight: 600, cursor: 'pointer', width: '100%' }}>Unsubscribe</button>
          </form>
        )}
        <div style={{ marginTop: 28, fontSize: 10, color: '#6B5C8A', letterSpacing: 2, textTransform: 'uppercase' }}>Powered by Rydra</div>
      </div>
    </main>
  );
}