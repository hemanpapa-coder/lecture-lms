import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function check() {
    // 1. Get a chat message that is a poll
    const { data: message } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('type', 'poll')
        .limit(1)
        .single();
        
    if (!message) {
        console.log("No polls found.");
        return;
    }
    
    console.log("Found poll:", message.id);

    // 2. Try to query poll_votes
    const { data: votes, error } = await supabase
        .from('poll_votes')
        .select('*')
        .eq('message_id', message.id);
        
    console.log("Votes query result:", votes, error);
}

check().catch(console.error)
