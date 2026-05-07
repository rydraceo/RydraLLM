import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testUsers() {
  // Check if users table exists and what data it has
  const { data, error } = await supabase
    .from('users')
    .select('id, phone, full_name, email')
    .limit(3)
  
  console.log('\n=== USERS TABLE TEST ===')
  if (error) {
    console.log('❌ Error:', error.message)
  } else if (data && data.length > 0) {
    console.log(`✅ Found ${data.length} users:`)
    data.forEach(u => console.log(u))
  } else {
    console.log('⚠️  Table exists but is empty')
  }
}

testUsers()
