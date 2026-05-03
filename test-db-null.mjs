import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://gqufsvzfjnreczknootc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxdWZzdnpmam5yZWN6a25vb3RjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE1MzkwMCwiZXhwIjoyMDg3NzI5OTAwfQ.zDWiLAB_AK9P3Lb36iOotZsQP5n_CNVurUa_91telIU'
);

async function test() {
  const { data, error } = await supabase.from('student_notes').upsert({
    user_id: 'a718b57b-586b-4573-b3c9-0b1a039d9f52', // fake UUID
    course_id: null,
    week_number: 7,
    content: 'test',
    updated_at: new Date().toISOString()
  });
  console.log('Error:', error);
}
test();
