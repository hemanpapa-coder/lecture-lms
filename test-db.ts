import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    const { data: courses } = await supabase.from('courses').select('id, name')
    console.log("Courses:", courses);

    const { data: users } = await supabase.from('users').select('id, email, name, course_id, course_ids, role, is_approved').order('created_at', { ascending: false }).limit(20)
    console.log("Users:", users?.map(u => ({...u, courseNames: courses?.filter(c => u.course_ids?.includes(c.id)).map(c => c.name)})));
}

run()
