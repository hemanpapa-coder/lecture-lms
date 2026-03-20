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

        // 1. poll 메시지 존재 확인 (종료 여부 체크)
        const { data: message } = await supabase
            .from('chat_messages')
            .select('id, type, metadata')
            .eq('id', messageId)
            .single();

        // 메시지가 없거나 poll 타입이 아닌 경우 - 경고만 로그하고 계속 진행
        if (!message) {
            console.warn('[vote] message not found:', messageId);
        } else if (message.type !== 'poll') {
            console.warn('[vote] message type:', message.type, 'for id:', messageId);
        }

        // 투표가 이미 종료된 경우 거부
        if (message?.metadata?.is_closed) {
            return NextResponse.json({ error: 'Poll is closed' }, { status: 400 });
        }

        // 2. 기존 투표 삭제 (오류 무시)
        const { error: deleteError } = await supabase
            .from('poll_votes')
            .delete()
            .eq('message_id', messageId)
            .eq('user_id', user.id);

        if (deleteError) {
            console.warn('[vote] delete error (ignored):', deleteError.message);
        }

        // 3. 새 투표 삽입 (select 없이)
        const { error: voteError } = await supabase
            .from('poll_votes')
            .insert({
                message_id: messageId,
                user_id: user.id,
                option_index: optionIndex
            });

        if (voteError) {
            console.error('[vote] insert error:', voteError);
            throw voteError;
        }

        return NextResponse.json({ ok: true, message_id: messageId, option_index: optionIndex });

    } catch (error: any) {
        console.error('Poll Vote Error:', error);
        return NextResponse.json({ error: error?.message || 'Vote failed' }, { status: 500 });
    }
}
