import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // I should use service role key but wait... if RLS allows it or if I run SQL, it's better to use SQL. Wait, let's write an SQL file instead, it's much safer.
