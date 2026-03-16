const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://gqufsvzfjnreczknootc.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxdWZzdnpmam5yZWN6a25vb3RjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNTM5MDAsImV4cCI6MjA4NzcyOTkwMH0.Us0y94dEeE-2Qdhn08TTphYNYXKw34EuMDnpOQd5dFU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function resolveReports() {
    // get open bug reports
    const { data: reports, error } = await supabase.from('error_reports').select('id, status');
    if (error) {
        console.error("Error fetching reports", error);
        return;
    }
    
    console.log(`Found ${reports.length} total reports. Updating all 'open' or 'in_progress' to 'resolved'...`);
    
    let updatedCount = 0;
    for (const report of reports) {
        if (report.status !== 'resolved') {
            const { error: updateError } = await supabase.from('error_reports').update({ status: 'resolved' }).eq('id', report.id);
            if (updateError) {
                console.error(`Failed to update ${report.id}`, updateError);
            } else {
                console.log(`Updated ${report.id} to resolved.`);
                updatedCount++;
            }
        }
    }
    
    console.log(`Successfully resolved ${updatedCount} reports.`);
}

resolveReports();
