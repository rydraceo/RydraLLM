// scripts/diagnose-db.ts - Simplified version without schema imports
import { config } from 'dotenv';
import { resolve } from 'path';
import postgres from 'postgres';

// Force load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const VENUE_ID = 'e1a6c15d-8ccc-4f58-aefb-8bea46e39918';

async function diagnose() {
  console.log('🔍 RYDRA DATABASE DIAGNOSTIC\n');
  console.log('━'.repeat(60));

  // Check environment variables
  console.log('\n📋 ENVIRONMENT CHECK:');
  console.log('  DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Missing');
  
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
  console.log('✅ Connected successfully\n');

  try {
    // Test 1: Check customer_scores table
    console.log('━'.repeat(60));
    console.log('\n🎯 TEST 1: customer_scores table');
    console.log('━'.repeat(60));

    const countResult = await client`
      SELECT COUNT(*)::int as count 
      FROM customer_scores 
      WHERE venue_id = ${VENUE_ID}
    `;
    const totalCount = countResult[0]?.count || 0;
    console.log(`  Total records for venue:`, totalCount);

    if (totalCount > 0) {
      const sample = await client`
        SELECT 
          user_id,
          current_state,
          total_visits,
          gap_ratio,
          churn_score_10,
          clv_cents
        FROM customer_scores 
        WHERE venue_id = ${VENUE_ID}
        LIMIT 3
      `;

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
      const stateCount = await client`
        SELECT 
          current_state,
          COUNT(*)::int as count
        FROM customer_scores 
        WHERE venue_id = ${VENUE_ID}
        GROUP BY current_state
      `;

      console.log('\n  Count by state:');
      stateCount.forEach(s => {
        console.log(`    ${s.current_state}: ${s.count}`);
      });
    }

    // Test 2: Check customers table
    console.log('\n━'.repeat(60));
    console.log('\n🎯 TEST 2: customers table');
    console.log('━'.repeat(60));

    const customerCount = await client`
      SELECT COUNT(*)::int as count 
      FROM customers 
      WHERE business_id = ${VENUE_ID}
    `;
    console.log(`  Total records:`, customerCount[0]?.count || 0);

    console.log('\n━'.repeat(60));
    console.log('\n✅ DIAGNOSTIC COMPLETE!');
    console.log('\n💡 Summary:');
    console.log(`  - customer_scores: ${totalCount} records`);
    console.log(`  - customers: ${customerCount[0]?.count || 0} records`);
    console.log('\n🎉 Your API should query customer_scores table!\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await client.end();
  }
}

diagnose().catch(console.error);
