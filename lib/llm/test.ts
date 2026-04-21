import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Dynamic import MUST come after dotenv.config() runs
// Regular imports load before any code executes — that's the bug
async function main() {
  const { generateInsights } = await import('./insights');

  const FAKE_DATA = `
TODAY: Tuesday 22 April 2026

REVENUE
Today so far: $340.00
7-day daily average: $890.00

TOP SELLERS (this week vs last week)
Flat White: 47 orders (was 52)
Smashed Avo: 31 orders (was 28)
Eggs Benedict: 18 orders (was 24)
Truffle Fries: 6 orders (was 19)

DECLINING ITEMS (more than 30% drop)
Truffle Fries: 6 orders this week vs 19 last week (-68.4%)

HOURLY DEMAND PATTERN
7:00 - 4.2 orders
9:00 - 18.4 orders
14:00 - 2.3 orders

BUNDLE OPPORTUNITIES
Flat White + Smashed Avo: ordered together 28 times
Long Black + Eggs Benedict: ordered together 14 times
  `.trim();

  console.log('Testing Portkey connection...\n');

  try {
    const insights = await generateInsights('test-venue', FAKE_DATA);
    console.log('SUCCESS\n');
    console.log(`Summary: ${insights.summary}\n`);
    insights.insights.forEach((insight, i) => {
      console.log(`Insight ${i + 1}: ${insight.headline}`);
      console.log(`  Action: ${insight.action}`);
      console.log(`  Revenue: ${insight.revenue_impact}`);
      console.log(`  Urgency: ${insight.urgency}`);
      console.log('');
    });
  } catch (err) {
    console.error('FAILED:', err);
  }
}

main();