import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { resend } from '@/lib/resend';
import { sendPushNotification } from '@/lib/webpush';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { content, type, courseId, metadata, targetUserId } = body;

        if (!content || !courseId) {
            return NextResponse.json({ error: 'Missing content or courseId' }, { status: 400 });
        }

        // 1. Get sender profile to check course & role
        const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', user.id)
            .single();

        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

        // Ensure user belongs to the course or is admin. Support sub-rooms by splitting _
        const baseCourseId = courseId.split('_')[0];
        if (profile.course_id !== baseCourseId && profile.private_lesson_id !== baseCourseId && profile.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const room = courseId.includes('_') ? courseId.split('_')[1] : 'communal';
        const finalMetadata = metadata || {};
        finalMetadata.room = room;

        // 2. Insert message with baseCourseId
        const { data: message, error: insertError } = await supabase
            .from('chat_messages')
            .insert({
                course_id: baseCourseId,
                user_id: user.id,
                target_user_id: targetUserId || null,
                content,
                type: type || 'message',
                metadata: finalMetadata
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // 3. Return success to client IMMEDIATELY after DB insert.
        //    Email notifications are fired asynchronously so they can NEVER block or fail the response.
        const response = NextResponse.json(message);

        // 4. Fire-and-forget email notification (fully isolated from main response)
        void (async () => {
            try {
                let targetEmails: string[] = [];

                if (targetUserId) {
                    // 1:1 개인레슨 채팅: target 유저에게만 이메일 발송
                    if (profile.role === 'admin') {
                        const { data: targetUser } = await supabase
                            .from('users')
                            .select('email')
                            .eq('id', targetUserId)
                            .single();
                        if (targetUser?.email) targetEmails = [targetUser.email];
                    } else {
                        const { data: admins } = await supabase
                            .from('users')
                            .select('email')
                            .eq('role', 'admin');
                        if (admins) targetEmails = admins.map((a: any) => a.email);
                    }
                } else {
                    // 단체방 (targetUserId 없음): 해당하는 과목의 모든 사용자 (학생 + 교수)
                    let query = supabase.from('users').select('email').eq('course_id', baseCourseId);
                    if (room === 'engineer') {
                        query = query.eq('major', '사운드엔지니어');
                    } else if (room === 'musician') {
                        query = query.neq('major', '사운드엔지니어');
                    }
                    const { data: students } = await query;
                    if (students) targetEmails = students.map((s: any) => s.email);

                    const { data: admins } = await supabase.from('users').select('email').eq('role', 'admin');
                    if (admins) {
                        targetEmails = [...targetEmails, ...admins.map((a: any) => a.email)];
                    }
                }

                // Remove duplicates and self
                targetEmails = [...new Set(targetEmails)].filter(e => e !== user.email);

                if (targetEmails.length > 0) {
                    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lecture-lms.vercel.app';

                    const isPrivate = !!targetUserId;
                    const senderName = profile.name || profile.email || '알 수 없는 사용자';

                    const chatTarget = isPrivate
                        ? (profile.role === 'admin' ? targetUserId : user.id)
                        : null;
                    const chatLink = chatTarget ? `${appUrl}/workspace/${chatTarget}` : appUrl;

                    let subject = isPrivate
                        ? `[1:1 레슨 메시지] ${senderName}님이 메시지를 보냈습니다.`
                        : `[LMS 알림] 새로운 메시지가 도착했습니다.`;
                    if (!isPrivate && type === 'notice') subject = `[공지] ${content.substring(0, 30)}...`;
                    if (!isPrivate && type === 'poll') subject = `[투표] 새로운 투표가 등록되었습니다.`;

                    const teaser = content.substring(0, 100);

                    await resend.emails.send({
                        from: 'LMS <onboarding@resend.dev>',
                        to: targetEmails,
                        reply_to: profile.email,
                        subject: subject,
                        html: `
                            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
                                <h1 style="font-size: 20px; font-weight: bold; color: #111827;">
                                    ${isPrivate ? '💬 1:1 레슨 메시지' : `새로운 ${type === 'notice' ? '공지사항' : type === 'poll' ? '투표' : '메시지'}가 등록되었습니다`}
                                </h1>
                                <p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;"><strong>${senderName}</strong>님이 메시지를 보냈습니다.</p>
                                <p style="font-size: 16px; color: #374151; line-height: 1.6; background: #f9fafb; padding: 16px; border-radius: 8px; border-left: 4px solid #4f46e5;">${teaser}</p>
                                <div style="margin-top: 24px;">
                                    <a href="${chatLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                                        ${isPrivate ? '1:1 대화창으로 이동하기' : '대화창으로 이동하기'}
                                    </a>
                                </div>
                                <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">본 메일은 LMS 시스템에서 자동으로 발송되었습니다.<br/><strong>이 이메일에 답장하면 작성자(${senderName})에게 바로 메일이 전송됩니다.</strong></p>
                            </div>
                        `
                    });
                }
            } catch (emailErr) {
                // 이메일 전송 실패는 채팅 전송 결과에 영향을 주지 않습니다
                console.error('Email sending failed (non-blocking):', emailErr);
            }
        })();

        // 5. Web Push 알림 비동기 발송
        void (async () => {
            try {
                // 수신자 user_id 목록 결정 (이메일 대상과 동일한 로직)
                let targetUserIds: string[] = [];

                if (targetUserId) {
                    if (profile.role === 'admin') {
                        targetUserIds = [targetUserId];
                    } else {
                        const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin');
                        if (admins) targetUserIds = admins.map((a: any) => a.id);
                    }
                } else if (profile.role === 'admin') {
                    let q = supabase.from('users').select('id').eq('course_id', baseCourseId).neq('role', 'admin');
                    if (room === 'engineer') q = q.eq('major', '사운드엔지니어');
                    else if (room === 'musician') q = q.neq('major', '사운드엔지니어');
                    const { data: students } = await q;
                    if (students) targetUserIds = students.map((s: any) => s.id);
                } else {
                    const { data: admins } = await supabase.from('users').select('id').eq('role', 'admin');
                    if (admins) targetUserIds = admins.map((a: any) => a.id);
                }

                // 본인 제외
                targetUserIds = targetUserIds.filter(id => id !== user.id);
                if (!targetUserIds.length) return;

                // push_subscriptions에서 대상 구독 조회
                const { data: subs } = await supabase
                    .from('push_subscriptions')
                    .select('endpoint, keys')
                    .in('user_id', targetUserIds);

                if (!subs?.length) return;

                const senderName = profile.name || '선생님';
                const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lecture-lms.vercel.app';
                const pushPayload = {
                    title: type === 'notice' ? '📢 공지사항' : type === 'poll' ? '📊 새 투표' : `💬 ${senderName}`,
                    body: content.substring(0, 80),
                    url: targetUserId ? `${appUrl}/workspace/${targetUserId}` : appUrl,
                    tag: `lms-${baseCourseId}`,
                    messageId: message?.id,
                };

                // 모든 구독자에게 push 발송
                await Promise.allSettled(
                    subs.map(sub => sendPushNotification(
                        { endpoint: sub.endpoint, keys: sub.keys as any },
                        pushPayload
                    ))
                );
            } catch (pushErr) {
                console.error('Push notification failed (non-blocking):', pushErr);
            }
        })();

        return response;


    } catch (error: any) {
        console.error('Chat Send Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
