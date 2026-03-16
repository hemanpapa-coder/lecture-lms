import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://gqufsvzfjnreczknootc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxdWZzdnpmam5yZWN6a25vb3RjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjE1MzkwMCwiZXhwIjoyMDg3NzI5OTAwfQ.jM1HwTf4AXXm3yWk8hA_w_dYv4s46D8o6lX2gGf3WpM';

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
    const { data, error } = await supabase.from('poll_votes').select('*').limit(1);
    console.log("Data:", data, "Error:", error);
}

check().catch(console.error)
