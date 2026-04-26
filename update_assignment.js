const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    // 1. Get the course
    const { data: courses } = await supabase.from('courses').select('*').ilike('name', '%홈레코딩과 음향학 B%');
    if (!courses || courses.length === 0) {
        console.log("Course not found");
        return;
    }
    const course = courses[0];
    
    // 2. Get the user
    const { data: users } = await supabase.from('users').select('*').eq('course_id', course.id).ilike('name', '%전우영%');
    if (!users || users.length === 0) {
        console.log("User not found");
        return;
    }
    const user = users[0];
    console.log(`Found user: ${user.name} (${user.email}), Course: ${course.name}`);
    
    // 3. Update assignments table (week_name is string like '3주차')
    const { data: assignments, error: aErr } = await supabase
        .from('assignments')
        .update({ week_name: '6주차' })
        .eq('user_id', user.id)
        .eq('week_name', '3주차')
        .select();
    console.log("Updated assignments:", assignments ? assignments.length : 0);
    if(aErr) console.log(aErr);

    // 4. Update board_questions table (week_number might be string or number)
    const { data: boards1, error: bErr1 } = await supabase
        .from('board_questions')
        .update({ week_number: 6 })
        .eq('user_id', user.id)
        .eq('week_number', 3)
        .select();
    console.log("Updated board_questions (number):", boards1 ? boards1.length : 0);
    
    const { data: boards2, error: bErr2 } = await supabase
        .from('board_questions')
        .update({ week_number: '6주차' })
        .eq('user_id', user.id)
        .eq('week_number', '3주차')
        .select();
    console.log("Updated board_questions (string):", boards2 ? boards2.length : 0);
    
    console.log("Done");
}
run();
