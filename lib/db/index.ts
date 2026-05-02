// lib/db/index.ts
// CORRECT SETUP for Supabase Transaction pooler (port 6543)
// Uses postgres-js package (NOT pg) with { prepare: false }
 
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
 
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}
 
// Supabase requires { prepare: false } with Transaction pooler
const client = postgres(process.env.DATABASE_URL, { 
  prepare: false,
  max: 10, // Connection pool size
});
 
export const db = drizzle(client, { schema });
export * from './schema';
 