import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { messageId, optionIndex } = body;

        if (!messageId || optionIndex === undefined) {
            return NextResponse.json({ error: 'Missing messageId or optionIndex' }, { status: 400 });
        }

        // 1. Verify existence of the poll message
        const { data: message } = await supabase
            .from('chat_messages')
            .select('id, type')
            .eq('id', messageId)
            .single();

        if (!message || message.type !== 'poll') {
            return NextResponse.json({ error: 'Invalid poll message' }, { status: 400 });
        }

        // 2. Upsert vote — 동일 사용자의 기존 투표를 새 선택으로 교체
        const { data: vote, error: voteError } = await supabase
            .from('poll_votes')
            .upsert({
                message_id: messageId,
                user_id: user.id,
                option_index: optionIndex
            }, {
                onConflict: 'message_id,user_id'
            })
            .select()
            .single();

        if (voteError) throw voteError;

        return NextResponse.json(vote);

    } catch (error: any) {
        console.error('Poll Vote Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
