import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve('/Users/hansangmacpro/Documents/Program Dev/Lecture-management(Mac)/lecture-lms/.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const userId = "some-user-id"; // We can't know the exact user_id, but let's just see the schema.
    // actually let's fetch a real student user_id.
    const { data: users, error } = await supabase.from('users').select('id, email').limit(5);
    console.log("Users:", users);
    
    if (users && users.length > 0) {
        const student = users.find(u => u.email === 'liltonymaserati@bau.ac.kr') || users[0];
        console.log("Testing with student:", student);
        
        // Try inserting into student_notes with hardcoded course ID
        const testCourseId = '68daf40d-8479-4c89-9248-a7e08ffe7610';
        const { error: upsertError } = await supabase
            .from('student_notes')
            .upsert({
                user_id: student.id,
                course_id: testCourseId,
                week_number: 8,
                content: "Test Content",
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id,course_id,week_number' });
            
        console.log("Upsert Error:", upsertError);
    }
}
test();
