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
    const userId = '987ed17f-70a3-4020-a160-09f15804cfaa' // 이재연 
    const courseId = '7d706975-b8f0-491f-85fa-81e4e9c6376a' // 홈레코딩과 음향학B

    console.log('Finding week 7 submissions for 이재연...')
    
    // Check assignments
    const { data: assigns } = await supabase.from('assignments')
        .select('*')
        .eq('user_id', userId)
        .eq('course_id', courseId)
        .eq('week_number', 7) // Only week 7!
        
    console.log('Assignments to update:', assigns?.map(a => a.id))
    
    // Check board_questions
    const { data: boards } = await supabase.from('board_questions')
        .select('*')
        .eq('user_id', userId)
        .eq('course_id', courseId)
        .eq('week_number', 7)
        
    console.log('Board Questions to update:', boards?.map(b => b.id))
    
    // Move logic
    if (assigns && assigns.length > 0) {
        const { error } = await supabase.from('assignments')
            .update({ week_number: 6 })
            .in('id', assigns.map(a => a.id))
        if (error) console.error('Error assigning:', error)
        else console.log('Moved assigns to week 6!')
    }
    
    if (boards && boards.length > 0) {
        const { error } = await supabase.from('board_questions')
            .update({ week_number: 6 })
            .in('id', boards.map(b => b.id))
        if (error) console.error('Error updating boards:', error)
        else console.log('Moved boards to week 6!')
    }

    console.log('Done.')
}

run()
