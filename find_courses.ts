import { createClient } from './src/utils/supabase/server'

async function run() {
    const supabase = await createClient()
    const { data: courses } = await supabase.from('courses').select('id, name')
    console.log(JSON.stringify(courses, null, 2))
}

run()
