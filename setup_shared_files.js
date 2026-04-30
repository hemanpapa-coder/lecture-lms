import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function setup() {
  const { error } = await supabase.rpc('exec_sql', { sql: `
    CREATE TABLE IF NOT EXISTS audio_tech_shared_files (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      course_id TEXT NOT NULL,
      uploader_id UUID REFERENCES users(id),
      uploader_name TEXT,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_size BIGINT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  `})
  
  if (error) {
    console.error('Failed using rpc:', error)
  } else {
    console.log('Success')
  }
}

setup()
