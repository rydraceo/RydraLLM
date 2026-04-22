// import-alkami-data.js
// Import Alkami customers to Supabase using Node.js
// Run with: node import-alkami-data.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const VENUE_ID = 'e1a6c15d-8ccc-4f58-aefb-8bea46e39918';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Add these lines:');
  console.error('  NEXT_PUBLIC_SUPABASE_URL=https://tqjdwufeeqjlnudwvayj.supabase.co');
  console.error('  SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...');
  process.exit(1);
}

// Helper functions
function parseDate(dateStr) {
  if (!dateStr) return null;
  try {
    // Parse format: "01 Jul 2025, 12:00am"
    const months = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };
    const parts = dateStr.split(' ');
    const day = parseInt(parts[0]);
    const month = months[parts[1]];
    const year = parseInt(parts[2].replace(',', ''));
    return new Date(year, month, day);
  } catch (e) {
    return null;
  }
}

function generateUUID(identifier) {
  const hash = crypto.createHash('md5').update(identifier).digest('hex');
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-${hash.slice(12,16)}-${hash.slice(16,20)}-${hash.slice(20,32)}`;
}

function classifyState(totalAppts, daysSince) {
  if (totalAppts === 0) return 'X';
  if (daysSince > 112) return 'X';
  if (totalAppts === 1) return 'C';
  return 'R';
}

function calculateAvgGap(firstAppt, lastAppt, totalAppts) {
  if (totalAppts <= 1) return 45.0;
  const first = parseDate(firstAppt);
  const last = parseDate(lastAppt);
  if (!first || !last) return 45.0;
  const totalDays = Math.floor((last - first) / (1000 * 60 * 60 * 24));
  const gaps = totalAppts - 1;
  return gaps > 0 ? Math.round(totalDays / gaps * 100) / 100 : 45.0;
}

async function importCustomers() {
  console.log('='.repeat(70));
  console.log('ALKAMI DATA IMPORT TO SUPABASE');
  console.log(`Venue ID: ${VENUE_ID}`);
  console.log('='.repeat(70));

  // Read CSV file
  const csvPath = path.join(__dirname, 'Alkami Data', 'report_client-insights_2026-04-22.csv');
  
  if (!fs.existsSync(csvPath)) {
    console.error(`\n❌ Error: ${csvPath} not found`);
    console.error('Make sure "Alkami Data" folder is in the current directory');
    process.exit(1);
  }

  console.log(`\n🔄 Reading ${csvPath}...`);
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  
  let processed = 0;
  let skipped = 0;
  let eventsBatch = [];
  let scoresBatch = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    
    // Parse CSV line (handle quotes)
    const values = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ? values[idx].replace(/"/g, '').trim() : '';
    });

    if (!row['Client']) continue;

    const totalAppts = parseInt(row['Total appts.']) || 0;
    if (totalAppts === 0) {
      skipped++;
      continue;
    }

    const identifier = row['Email'] || row['Mobile number'] || row['Client'];
    const userId = generateUUID(identifier);
    const lastAppt = parseDate(row['Last appt.']);
    
    if (!lastAppt) {
      skipped++;
      continue;
    }

    const daysSince = Math.floor((new Date() - lastAppt) / (1000 * 60 * 60 * 24));
    const avgGap = calculateAvgGap(row['First appt.'], row['Last appt.'], totalAppts);
    const gapRatio = avgGap > 0 ? Math.round(daysSince / avgGap * 100) / 100 : 0;
    const currentState = classifyState(totalAppts, daysSince);
    const isReturn = totalAppts >= 2;

    eventsBatch.push({
      user_id: userId,
      venue_id: VENUE_ID,
      event_type: 'appointment_completed',
      state: currentState,
      occurred_at: lastAppt.toISOString(),
      is_return_visit: isReturn,
      metadata: {
        name: row['Client'],
        email: row['Email'],
        phone: row['Mobile number'],
        total_appts: totalAppts,
        source: row['Client source'],
        total_value: parseFloat(row['Total appt. value']) || 0
      }
    });

    scoresBatch.push({
      user_id: userId,
      venue_id: VENUE_ID,
      current_state: currentState,
      last_event_at: lastAppt.toISOString(),
      total_visits: totalAppts,
      days_since_last_visit: daysSince,
      avg_visit_gap_days: avgGap,
      gap_ratio: gapRatio
    });

    processed++;

    // Import in batches of 100
    if (eventsBatch.length >= 100) {
      console.log(`  📤 Importing batch (customers ${processed - 99} to ${processed})...`);
      
      try {
        // Insert events
        const eventsRes = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(eventsBatch)
        });

        if (!eventsRes.ok) {
          const text = await eventsRes.text();
          console.log(`  ⚠️  Events warning: ${text.slice(0, 200)}`);
        }

        // Insert scores (one by one for upsert)
        for (const score of scoresBatch) {
          await fetch(`${SUPABASE_URL}/rest/v1/customer_scores`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(score)
          });
        }
      } catch (error) {
        console.error('  ❌ Batch error:', error.message);
      }

      eventsBatch = [];
      scoresBatch = [];
    }
  }

  // Insert remaining
  if (eventsBatch.length > 0) {
    console.log(`  📤 Importing final batch...`);
    
    await fetch(`${SUPABASE_URL}/rest/v1/events`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(eventsBatch)
    });

    for (const score of scoresBatch) {
      await fetch(`${SUPABASE_URL}/rest/v1/customer_scores`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(score)
      });
    }
  }

  console.log(`\n✅ Import complete!`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Skipped: ${skipped}`);

  // Verify
  console.log('\n🔍 Verifying import...');
  
  const countRes = await fetch(
    `${SUPABASE_URL}/rest/v1/customer_scores?venue_id=eq.${VENUE_ID}&select=current_state`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  if (countRes.ok) {
    const data = await countRes.json();
    const states = {};
    data.forEach(row => {
      states[row.current_state] = (states[row.current_state] || 0) + 1;
    });

    console.log(`  ✅ Total customers: ${data.length}`);
    console.log('\n  📊 State Distribution:');
    Object.entries(states).sort((a, b) => b[1] - a[1]).forEach(([state, count]) => {
      const stateName = {
        'C': 'Completed (first visit)',
        'R': 'Return (loyal)',
        'X': 'Churned (lapsed)'
      }[state] || state;
      console.log(`    ${state} (${stateName}): ${count}`);
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ IMPORT COMPLETE!');
  console.log('='.repeat(70));
  console.log('\nNext steps:');
  console.log('  1. Go to Supabase → Table Editor → events');
  console.log('  2. You should see ~2,130 records');
  console.log('  3. Check customer_scores table');
  console.log('  4. Start taking action on at-risk customers!');
}

// Run import
importCustomers().catch(console.error);
