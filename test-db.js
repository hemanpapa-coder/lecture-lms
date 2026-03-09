require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
    const { data: courses } = await supabase.from('courses').select('id, name');
    console.log("Courses:", courses);

    // find users in '홈레코딩과음향학 B' or '홈레코딩과음향학B'
    const targetCourse = courses.find(c => c.name.includes('홈레코딩') && c.name.includes('B'));
    if (targetCourse) {
        console.log("Found B course ID:", targetCourse.id);
        const { data: users } = await supabase.from('users').select('name, email, is_approved, course_id, course_ids').eq('course_id', targetCourse.id);
        console.log("Users in this course:", users);
    } else {
        console.log("B course not found");
    }
}
run();
