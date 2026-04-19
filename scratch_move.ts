import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const envPath = path.join(process.cwd(), '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const env: Record<string, string> = {}
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)="?(.*?)"?$/)
    if (match) env[match[1]] = match[2]
})

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL']
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY']

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    const userId = '68bf0208-5bdb-43a1-9d30-8ea627ae7ddd'
    const courseId = '68daf40d-8479-4c89-9248-a7e08ffe7610'

    const { data: assigns } = await supabase.from('assignments')
        .select('*')
        .eq('user_id', userId)
        .eq('course_id', courseId)
        
    console.log('Assignments ai_feedback:', assigns?.map(a => a.ai_feedback))

    const { data: boards } = await supabase.from('board_questions')
        .select('*')
        .eq('user_id', userId)
        .eq('course_id', courseId)
        
    console.log('Board Questions ai_feedback meta:', boards?.map(b => b.metadata?.ai_feedback))
}

run()
