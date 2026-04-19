import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function checkHomework() {
  const { data, error } = await supabase
    .from('board_questions')
    .select('id, user_id, course_id, content, created_at, metadata, users(name)')
    .eq('type', 'homework')
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) console.error(error)
  else {
    console.log(JSON.stringify(data.filter(d => d.users?.name === '조수빈'), null, 2))
  }
}

checkHomework()
