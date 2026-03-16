import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: message } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('type', 'poll')
            .limit(1)
            .single();

        if (!message) {
            return NextResponse.json({ result: "No polls found" });
        }

        const { data: votes, error } = await supabase
            .from('poll_votes')
            .select('*')
            .eq('message_id', message.id);

        return NextResponse.json({
            pollId: message.id,
            votes,
            error
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
