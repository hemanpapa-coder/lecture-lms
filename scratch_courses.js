// test script to run checking courses table
require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    const { data: courses, error } = await supabase.from('courses').select('*').limit(1)
    if (error) {
        console.error("courses error:", error)
    } else {
        console.log("courses columns:", courses && courses.length > 0 ? Object.keys(courses[0]) : "table exists but empty")
    }
}

run()
