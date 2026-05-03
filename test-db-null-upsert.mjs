import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://gqufsvzfjnreczknootc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxdWZzdnpmam5yZWN6a25vb3RjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE1MzkwMCwiZXhwIjoyMDg3NzI5OTAwfQ.zDWiLAB_AK9P3Lb36iOotZsQP5n_CNVurUa_91telIU'
);

async function test() {
  const { data, error } = await supabase.from('student_notes').upsert({
    user_id: '40b551e6-e96a-4650-b0ca-446232243dda', // test user
    course_id: null,
    week_number: 7,
    content: 'test null'
  }, { onConflict: 'user_id,course_id,week_number' });
  console.log('Error:', error);
}
test();
