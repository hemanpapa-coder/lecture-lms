import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

console.log("URL:", supabaseUrl, "Key length:", supabaseKey?.length)

// We can't fake a user session easily without a JWT.
