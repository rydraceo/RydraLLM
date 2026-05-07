import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function test() {
  const { data, error } = await supabase
    .from('customer_scores')
    .select('*')
    .eq('venue_id', 'e1a6c15d-8ccc-4f58-aefb-8bea46e39918')
    .limit(5)
  
  if (error) {
    console.error('❌ Error:', error)
  } else {
    console.log('✅ Success! Found', data.length, 'records')
    console.log(data[0])
  }
}

test()
