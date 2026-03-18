import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { resend } from '@/lib/resend';

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

        // 3. Email Notifications (Smart approach)
        // To avoid spam, we can check if there was a recent message in the last 10 minutes.
        // For simplicity in serverless, we'll just send it but target the recipients carefully.
        
        // Determine recipients
        let targetEmails: string[] = [];
        
        if (targetUserId) {
            // 1:1 개인레슨 채팅: target 유저에게만 이메일 발송
            if (profile.role === 'admin') {
                // 관리자가 학생에게 메시지 → 해당 학생 이메일로 발송
                const { data: targetUser } = await supabase
                    .from('users')
                    .select('email')
                    .eq('id', targetUserId)
                    .single();
                if (targetUser?.email) targetEmails = [targetUser.email];
            } else {
                // 학생이 메시지 → 관리자 이메일로 발송
                const { data: admins } = await supabase
                    .from('users')
                    .select('email')
                    .eq('role', 'admin');
                if (admins) targetEmails = admins.map((a: any) => a.email);
            }
        } else if (profile.role === 'admin') {
            // 단체방: 관리자가 메시지 → 해당 방 학생들에게 발송
            let query = supabase.from('users').select('email').eq('course_id', baseCourseId).neq('role', 'admin');
            if (room === 'engineer') {
                query = query.eq('major', '사운드엔지니어');
            } else if (room === 'musician') {
                query = query.neq('major', '사운드엔지니어');
            }
            const { data: students } = await query;
            if (students) targetEmails = students.map((s: any) => s.email);
            
        } else {
            // 단체방: 학생이 메시지 → 관리자 및 반장에게 발송
            const { data: admins } = await supabase.from('users').select('email').eq('role', 'admin');
            if (admins) targetEmails = admins.map((a: any) => a.email);
            
            // Also notify the class representatives (반장)
            const { data: reps } = await supabase.from('users')
                .select('email')
                .eq('course_id', baseCourseId)
                .in('role', ['반장', 'class_rep']);
            if (reps) {
                targetEmails = [...targetEmails, ...reps.map(r => r.email)];
            }
        }

        // Remove duplicates and self
        targetEmails = [...new Set(targetEmails)].filter(e => e !== user.email);

        if (targetEmails.length > 0) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://lecture-lms.vercel.app';
            
            // 개인레슨 1:1 채팅 여부에 따라 제목과 링크 분기
            const isPrivate = !!targetUserId;
            const senderName = profile.name || profile.email || '알 수 없는 사용자';
            
            // 1:1 채팅이면 해당 학생의 워크스페이스 링크, 단체방이면 메인 링크
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

            try {
                await resend.emails.send({
                    from: 'LMS <onboarding@resend.dev>',
                    to: targetEmails,
                    subject: subject,
                    html: `
                        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
                            <h1 style="font-size: 20px; font-weight: bold; color: #111827;">
                                ${isPrivate ? '💬 1:1 레슨 메시지' : `새로운 ${type === 'notice' ? '공지사항' : type === 'poll' ? '투표' : '메시지'}가 등록되었습니다`}
                            </h1>
                            ${isPrivate ? `<p style="font-size: 13px; color: #6b7280; margin-bottom: 8px;"><strong>${senderName}</strong>님이 메시지를 보냈습니다.</p>` : ''}
                            <p style="font-size: 16px; color: #374151; line-height: 1.6; background: #f9fafb; padding: 16px; border-radius: 8px; border-left: 4px solid #4f46e5;">${teaser}</p>
                            <div style="margin-top: 24px;">
                                <a href="${chatLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
                                    ${isPrivate ? '1:1 대화창으로 이동하기 →' : '대화창으로 이동하기'}
                                </a>
                            </div>
                            <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">본 메일은 LMS 시스템에서 자동으로 발송되었습니다.</p>
                        </div>
                    `
                });
            } catch (emailErr) {
                console.error('Email sending failed:', emailErr);
            }
        }

        return NextResponse.json(message);

    } catch (error: any) {
        console.error('Chat Send Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
