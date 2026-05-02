// scripts/diagnose-db.ts
// Run this locally: npx tsx scripts/diagnose-db.ts
// This will tell you exactly what's in your database
 
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { customer_scores, customers } from '../lib/db/schema';
import { eq, sql } from 'drizzle-orm';
 
const VENUE_ID = 'e1a6c15d-8ccc-4f58-aefb-8bea46e39918';
 
async function diagnose() {
  console.log('🔍 RYDRA DATABASE DIAGNOSTIC\n');
  console.log('━'.repeat(60));
 
  // Check environment variables
  console.log('\n📋 ENVIRONMENT CHECK:');
  console.log('  DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Missing');
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    console.log('  Host:', url.host);
    console.log('  Port:', url.port);
    console.log('  Database:', url.pathname.slice(1));
    console.log('  Username:', url.username);
    console.log('  Password:', url.password ? '***' + url.password.slice(-4) : '❌ Missing');
  }
 
  if (!process.env.DATABASE_URL) {
    console.error('\n❌ DATABASE_URL not found. Aborting.');
    process.exit(1);
  }
 
  // Connect to database
  console.log('\n🔌 CONNECTING TO DATABASE...');
  const client = postgres(process.env.DATABASE_URL, { 
    prepare: false,
    max: 1,
  });
  const db = drizzle(client);
  console.log('✅ Connected successfully\n');
 
  try {
    // Test 1: Check customer_scores table
    console.log('━'.repeat(60));
    console.log('\n🎯 TEST 1: customer_scores table');
    console.log('━'.repeat(60));
 
    try {
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(customer_scores)
        .where(eq(customer_scores.venue_id, VENUE_ID));
 
      const totalCount = countResult[0]?.count || 0;
      console.log(`  Total records for venue ${VENUE_ID}:`, totalCount);
 
      if (totalCount > 0) {
        const sample = await db
          .select()
          .from(customer_scores)
          .where(eq(customer_scores.venue_id, VENUE_ID))
          .limit(3);
 
        console.log('\n  Sample records:');
        sample.forEach((record, i) => {
          console.log(`\n  Record ${i + 1}:`);
          console.log('    user_id:', record.user_id);
          console.log('    current_state:', record.current_state);
          console.log('    total_visits:', record.total_visits);
          console.log('    gap_ratio:', record.gap_ratio);
          console.log('    churn_score_10:', record.churn_score_10);
          console.log('    clv_cents:', record.clv_cents);
        });
 
        // Count by state
        const stateCount = await db
          .select({
            state: customer_scores.current_state,
            count: sql<number>`count(*)::int`,
          })
          .from(customer_scores)
          .where(eq(customer_scores.venue_id, VENUE_ID))
          .groupBy(customer_scores.current_state);
 
        console.log('\n  Count by state:');
        stateCount.forEach(s => {
          console.log(`    ${s.state}: ${s.count}`);
        });
      }
    } catch (error: any) {
      console.error('  ❌ Error querying customer_scores:', error.message);
    }
 
    // Test 2: Check customers table
    console.log('\n━'.repeat(60));
    console.log('\n🎯 TEST 2: customers table');
    console.log('━'.repeat(60));
 
    try {
      const customerCountResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(customers)
        .where(eq(customers.business_id, VENUE_ID));
 
      const customerCount = customerCountResult[0]?.count || 0;
      console.log(`  Total records for business_id ${VENUE_ID}:`, customerCount);
 
      if (customerCount > 0) {
        const customerSample = await db
          .select()
          .from(customers)
          .where(eq(customers.business_id, VENUE_ID))
          .limit(3);
 
        console.log('\n  Sample records:');
        customerSample.forEach((record, i) => {
          console.log(`\n  Record ${i + 1}:`);
          console.log('    user_id:', record.user_id);
          console.log('    phone:', record.phone);
          console.log('    name:', record.name);
          console.log('    current_state:', record.current_state);
        });
      } else {
        console.log('  ⚠️  No records found in customers table');
        console.log('  ℹ️  This is likely why your dashboard is empty!');
      }
    } catch (error: any) {
      console.error('  ❌ Error querying customers:', error.message);
    }
 
    // Test 3: Raw SQL to check all tables
    console.log('\n━'.repeat(60));
    console.log('\n🎯 TEST 3: List all tables in database');
    console.log('━'.repeat(60));
 
    try {
      const tables = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
 
      console.log('\n  Available tables:');
      tables.forEach((t: any) => {
        console.log(`    - ${t.table_name}`);
      });
    } catch (error: any) {
      console.error('  ❌ Error listing tables:', error.message);
    }
 
    // Recommendations
    console.log('\n━'.repeat(60));
    console.log('\n💡 RECOMMENDATIONS:');
    console.log('━'.repeat(60));
    console.log('\n  Based on the results above:\n');
    console.log('  1. If customer_scores has data but customers is empty:');
    console.log('     → Your API should query customer_scores table');
    console.log('     → Use the FIXED-at-risk-customers-route.ts file\n');
    console.log('  2. If both tables are empty:');
    console.log('     → Check if data was imported to the right database');
    console.log('     → Verify DATABASE_URL points to correct Supabase project\n');
    console.log('  3. If tables don\'t exist:');
    console.log('     → Run: npx drizzle-kit push');
    console.log('     → Or create tables manually in Supabase dashboard\n');
 
  } catch (error: any) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
  } finally {
    await client.end();
    console.log('\n✅ Connection closed');
  }
}
 
diagnose().catch(console.error);