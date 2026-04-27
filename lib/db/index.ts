// lib/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
 
// Supabase provides a direct PostgreSQL connection string
// Get this from: Supabase Dashboard > Project Settings > Database > Connection String (URI)
const connectionString = process.env.DATABASE_URL!;
 
// Create postgres connection
// Supabase uses connection pooling, so we can use postgres-js directly
const client = postgres(connectionString, { 
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});
 
export const db = drizzle(client, { schema });
 
// Re-export commonly used Drizzle helpers
export { eq, and, or, gte, lte, gt, lt, sql, desc, asc } from 'drizzle-orm';
 
// Re-export schema for easy access
export * from './schema';