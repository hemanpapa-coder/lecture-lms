import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://gqufsvzfjnreczknootc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxdWZzdnpmam5yZWN6a25vb3RjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE1MzkwMCwiZXhwIjoyMDg3NzI5OTAwfQ.zDWiLAB_AK9P3Lb36iOotZsQP5n_CNVurUa_91telIU'
);

async function test() {
  const { data, error } = await supabase.from('courses').select('id, name');
  console.log('Courses:', JSON.stringify(data, null, 2));
}
test();
