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

        // messageId가 임시 ID(temp-)인 경우 거부
        if (typeof messageId === 'string' && messageId.startsWith('temp-')) {
            return NextResponse.json({ error: 'Invalid poll message (temp)' }, { status: 400 });
        }

        // 1. Verify existence of the poll message
        const { data: message } = await supabase
            .from('chat_messages')
            .select('id, type, metadata')
            .eq('id', messageId)
            .single();

        if (!message || message.type !== 'poll') {
            return NextResponse.json({ error: 'Invalid poll message' }, { status: 400 });
        }

        // 투표가 이미 종료된 경우 거부
        if (message.metadata?.is_closed) {
            return NextResponse.json({ error: 'Poll is closed' }, { status: 400 });
        }

        // 2. 기존 투표 삭제 후 새 투표 삽입 (upsert conflict 제약 없이도 안전)
        await supabase
            .from('poll_votes')
            .delete()
            .eq('message_id', messageId)
            .eq('user_id', user.id);

        const { data: vote, error: voteError } = await supabase
            .from('poll_votes')
            .insert({
                message_id: messageId,
                user_id: user.id,
                option_index: optionIndex
            })
            .select()
            .single();

        if (voteError) throw voteError;

        return NextResponse.json(vote);

    } catch (error: any) {
        console.error('Poll Vote Error:', error);
        return NextResponse.json({ error: error?.message || 'Vote failed' }, { status: 500 });
    }
}
