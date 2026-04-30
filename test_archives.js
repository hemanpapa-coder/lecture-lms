import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function check() {
  const { error } = await supabase.from('archives').insert({
    title: 'test_shared_file.txt',
    file_id: 'test_id',
    file_url: 'http://test.com',
    file_size: 100,
    uploaded_by: 'c5b3f989-c6d2-4eb1-a4d4-c5e37043b763',
    week_number: 999,
    course_id: '975cf5c9-1af1-493a-a770-757aa9d555af'
  })
  console.log('insert test:', error)
}
check()
