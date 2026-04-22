import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { supabaseAdmin } = await import('./client');

  console.log('Testing Supabase connection...\n');

  const { data, error } = await supabaseAdmin
    .from('venues')
    .select('*')
    .limit(1);

  if (error) {
    // Table probably doesn't exist yet — that's fine
    // What matters is whether we connected
    if (error.code === '42P01') {
      console.log('SUCCESS — Supabase connected.');
      console.log('Note: venues table does not exist yet — Paarth needs to create it.');
    } else {
      console.error('FAILED:', error.message);
    }
    return;
  }

  console.log('SUCCESS — Supabase connected and venues table exists.');
  console.log('Data:', data);
}

main();