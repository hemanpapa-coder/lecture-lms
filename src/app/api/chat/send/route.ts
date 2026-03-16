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
        
        if (user.user_metadata?.role === 'admin') {
            // Admin sent a message -> Notify students in this room
            let query = supabase.from('users').select('email').eq('course_id', baseCourseId).neq('role', 'admin');
            if (room === 'engineer') {
                query = query.eq('major', '사운드엔지니어');
            } else if (room === 'musician') {
                query = query.neq('major', '사운드엔지니어');
            }
            const { data: students } = await query;
            if (students) targetEmails = students.map((s: any) => s.email);
            
        } else {
            // Student sent a message -> Notify admins of this course
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
            
            let subject = `[LMS 알림] 새로운 메시지가 도착했습니다.`;
            if (type === 'notice') subject = `[공지] ${content.substring(0, 30)}...`;
            if (type === 'poll') subject = `[투표] 새로운 투표가 등록되었습니다.`;
            
            const teaser = content.substring(0, 100);

            try {
                await resend.emails.send({
                    from: 'LMS <onboarding@resend.dev>', // User MUST verify a domain or use onboarding for testing
                    to: targetEmails,
                    subject: subject,
                    html: `
                        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
                            <h1 style="font-size: 20px; font-weight: bold; color: #111827;">새로운 ${type === 'notice' ? '공지사항' : type === 'poll' ? '투표' : '메시지'}가 등록되었습니다</h1>
                            <p style="font-size: 16px; color: #374151; line-height: 1.6;">${teaser}</p>
                            <div style="margin-top: 24px;">
                                <a href="${appUrl}" style="background-color: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">대화창으로 이동하기</a>
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
