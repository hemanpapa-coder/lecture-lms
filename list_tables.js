import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function listTables() {
  const { data, error } = await supabase.from('users').select('id').limit(1);
  console.log('users connected');
  
  // To list tables in REST API without postgres connection, we can't easily query information_schema, but let's try
  const { data: tables, error: err } = await supabase.rpc('get_tables')
  console.log(tables, err)
}

listTables()
