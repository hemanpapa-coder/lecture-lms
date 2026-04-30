import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function check() {
  const { data, error } = await supabase.from('archives').select('*, users(name)').limit(1)
  console.log('join test 1:', error, data)
  
  if (error) {
    const { data: data2, error: err2 } = await supabase.from('archives').select('*, uploader:users!uploaded_by(name)').limit(1)
    console.log('join test 2:', err2, data2)
  }
}
check()
