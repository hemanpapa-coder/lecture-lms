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

        // 투표가 이미 종료된 경우 거부
        if (message?.metadata?.is_closed) {
            return NextResponse.json({ error: 'Poll is closed' }, { status: 400 });
        }

        // 2. UPSERT: (message_id, user_id) UNIQUE 제약 이용
        // UNIQUE 제약이 있으면 upsert로 안전하게 업데이트
        // 없더라도 먼저 delete 후 insert (폴백)
        const { error: upsertError } = await supabase
            .from('poll_votes')
            .upsert(
                {
                    message_id: messageId,
                    user_id: user.id,
                    option_index: optionIndex
                },
                {
                    onConflict: 'message_id,user_id',
                    ignoreDuplicates: false
                }
            );

        if (upsertError) {
            // upsert 실패 시 delete+insert 폴백
            console.warn('[vote] upsert failed, trying delete+insert:', upsertError.message);

            await supabase
                .from('poll_votes')
                .delete()
                .eq('message_id', messageId)
                .eq('user_id', user.id);

            const { error: insertError } = await supabase
                .from('poll_votes')
                .insert({
                    message_id: messageId,
                    user_id: user.id,
                    option_index: optionIndex
                });

            if (insertError) {
                console.error('[vote] insert error:', insertError);
                throw insertError;
            }
        }

        return NextResponse.json({ ok: true, message_id: messageId, option_index: optionIndex, user_id: user.id });

    } catch (error: any) {
        console.error('Poll Vote Error:', error);
        return NextResponse.json({ error: error?.message || 'Vote failed' }, { status: 500 });
    }
}
