// lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
 
let supabaseInstance: SupabaseClient | null = null;
let supabaseAdminInstance: SupabaseClient | null = null;
 
function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) {
    return supabaseInstance;
  }
 
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 
  // During build, env vars might not be available - return a dummy client
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase env vars not available - creating placeholder client');
    // Create a placeholder that will work during build but fail at runtime if actually used
    return createClient('https://placeholder.supabase.co', 'placeholder-key');
  }
 
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseInstance;
}
 
function getSupabaseAdminClient(): SupabaseClient {
  if (supabaseAdminInstance) {
    return supabaseAdminInstance;
  }
 
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 
  // During build, env vars might not be available - return a dummy client
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('Supabase admin env vars not available - creating placeholder client');
    return createClient('https://placeholder.supabase.co', 'placeholder-key');
  }
 
  supabaseAdminInstance = createClient(supabaseUrl, supabaseServiceKey);
  return supabaseAdminInstance;
}
 
// For backwards compatibility - export as objects with getters
export const supabase = {
  get from() { return getSupabaseClient().from; },
  get auth() { return getSupabaseClient().auth; },
  get storage() { return getSupabaseClient().storage; },
  get rpc() { return getSupabaseClient().rpc; },
};
 
export const supabaseAdmin = {
  get from() { return getSupabaseAdminClient().from; },
  get auth() { return getSupabaseAdminClient().auth; },
  get storage() { return getSupabaseAdminClient().storage; },
  get rpc() { return getSupabaseAdminClient().rpc; },
};
 
// Also export the functions for explicit usage
export { getSupabaseClient, getSupabaseAdminClient };