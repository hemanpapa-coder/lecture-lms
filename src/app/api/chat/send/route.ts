import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { resend } from '@/lib/resend';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { content, type, courseId, metadata } = body;

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

        // Ensure user belongs to the course or is admin
        if (profile.course_id !== courseId && profile.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // 2. Insert message
        const { data: message, error: insertError } = await supabase
            .from('chat_messages')
            .insert({
                course_id: courseId,
                user_id: user.id,
                content,
                type: type || 'message',
                metadata: metadata || {}
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // 3. If notice or poll, send email notifications
        if (type === 'notice' || type === 'poll') {
            // Fetch all students in this course
            const { data: students } = await supabase
                .from('users')
                .select('email')
                .eq('course_id', courseId);

            if (students && students.length > 0) {
                const emails = students.map(s => s.email);
                const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

                // Chunk emails for Resend if needed (Resend allows many recipients but batches are safer)
                // For this scale, a single send is fine if we use bcc or just send multiple.
                // We'll use multiple one-by-one or bcc for better deliverability.

                const subject = type === 'notice' ? `[공지] ${content.substring(0, 30)}...` : `[투표] 새로운 투표가 등록되었습니다.`;
                const teaser = content.substring(0, 100);

                try {
                    await resend.emails.send({
                        from: 'LMS <onboarding@resend.dev>', // Use onboarding@resend.dev for initial testing
                        to: emails,
                        subject: subject,
                        html: `
                            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
                                <h1 style="font-size: 20px; font-weight: bold; color: #111827;">새로운 ${type === 'notice' ? '공지사항' : '투표'}이 등록되었습니다</h1>
                                <p style="font-size: 16px; color: #374151; line-height: 1.6;">${teaser}</p>
                                <div style="margin-top: 24px;">
                                    <a href="${appUrl}/recording-class" style="background-color: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">대화창으로 이동하기</a>
                                </div>
                                <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">본 메일은 LMS 시스템에서 자동으로 발송되었습니다.</p>
                            </div>
                        `
                    });
                } catch (emailErr) {
                    console.error('Email sending failed:', emailErr);
                    // Don't fail the message insertion if email fails
                }
            }
        }

        return NextResponse.json(message);

    } catch (error: any) {
        console.error('Chat Send Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
