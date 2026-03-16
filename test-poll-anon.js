const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gqufsvzfjnreczknootc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxdWZzdnpmam5yZWN6a25vb3RjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNTM5MDAsImV4cCI6MjA4NzcyOTkwMH0.Us0y94dEeE-2Qdhn08TTphYNYXKw34EuMDnpOQd5dFU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase.from('poll_votes').select('*').limit(1);
    console.log("Data:", data, "Error:", error);
}

check().catch(console.error);
