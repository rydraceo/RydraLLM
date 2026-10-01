import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// The dynamic import must come after dotenv.config(), so the env vars exist
// when the Portkey client is created.
async function main() {
  const { generateInsights } = await import('./insights');
  const venueId = process.env.ALKAMI_VENUE_ID;
  if (!venueId) throw new Error('ALKAMI_VENUE_ID is not set in .env.local');

  const insights = await generateInsights(venueId);
  console.log(JSON.stringify(insights, null, 2));
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});