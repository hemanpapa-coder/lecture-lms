import { createClient } from './src/utils/supabase/server'

async function run() {
    const supabase = await createClient()
    const { data: bauUsers } = await supabase.from('users').select('id, email, name, department').ilike('email', '%@bau.ac.kr%')
    const { data: gradUsers } = await supabase.from('users').select('id, email, name, department').ilike('department', '%대학원%')
    
    console.log('BAU Users:', JSON.stringify(bauUsers, null, 2))
    console.log('Grad Users:', JSON.stringify(gradUsers, null, 2))
}

run()
