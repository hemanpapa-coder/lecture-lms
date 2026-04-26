import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: courses } = await supabase.from('courses').select('*').ilike('name', '%홈레코딩과 음향학 B%');
    const course = courses[0];
    
    const { data: users } = await supabase.from('users').select('*').eq('course_id', course.id).ilike('name', '%전우영%');
    const user = users[0];
    console.log(`Found: ${user.name}`);
    
    const { data: a1 } = await supabase.from('assignments').update({ week_name: '6주차' }).eq('user_id', user.id).eq('week_name', '3주차').select();
    console.log('Assignments:', a1?.length || 0);

    const { data: b1 } = await supabase.from('board_questions').update({ week_number: '6주차' }).eq('user_id', user.id).eq('week_number', '3주차').select();
    const { data: b2 } = await supabase.from('board_questions').update({ week_number: '6주차' }).eq('user_id', user.id).eq('week_number', '3').select();
    const { data: b3 } = await supabase.from('board_questions').update({ week_number: 6 }).eq('user_id', user.id).eq('week_number', 3).select();
    
    console.log('Board (string):', b1?.length || 0);
    console.log('Board (string 3):', b2?.length || 0);
    console.log('Board (num):', b3?.length || 0);
}
run();
