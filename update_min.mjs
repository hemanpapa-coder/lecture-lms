import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gqufsvzfjnreczknootc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxdWZzdnpmam5yZWN6a25vb3RjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE1MzkwMCwiZXhwIjoyMDg3NzI5OTAwfQ.zDWiLAB_AK9P3Lb36iOotZsQP5n_CNVurUa_91telIU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: courses } = await supabase.from('courses').select('*').eq('name', '홈레코딩과 음향학B');
    if (!courses || !courses.length) { console.log('no course'); return; }
    const course = courses[0];
    
    // 민예원 학생 찾기
    const { data: users } = await supabase.from('users').select('*').eq('course_id', course.id).ilike('name', '%민예원%');
    if (!users || !users.length) { console.log('no user'); return; }
    const user = users[0];
    console.log(`Found: ${user.name}`);
    
    const { data: a1, error: e1 } = await supabase.from('assignments').update({ week_number: 6 }).eq('user_id', user.id).eq('week_number', 8).select();
    if(e1) console.error(e1);
    console.log('Assignments updated:', a1?.length || 0);

    const { data: b1 } = await supabase.from('board_questions').update({ week_number: 6 }).eq('user_id', user.id).eq('week_number', 8).select();
    const { data: b2 } = await supabase.from('board_questions').update({ week_number: 6 }).eq('user_id', user.id).eq('week_number', '8주차').select();
    
    console.log('Board (num) updated:', b1?.length || 0);
}
run();
