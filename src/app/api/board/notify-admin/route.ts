import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { resend } from '@/lib/resend';

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const { questionId, courseId, userId, content, type } = body;

        if (!questionId || !courseId || !userId || !content) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const { data: course } = await supabase.from('courses').select('name').eq('id', courseId).single();
        const { data: qUser } = await supabase.from('users').select('name').eq('id', userId).single();

        const courseName = course?.name || '알 수 없는 수업';
        const displayAuthor = type === 'suggestion' ? '익명 학생' : (qUser?.name || '익명 학생 (이름 없음)');
        const teaser = content.length > 100 ? content.substring(0, 100) + '...' : content;

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

        // Notify the primary admin/professor
        const adminEmail = 'heinhome@icloud.com';

        await resend.emails.send({
            from: 'LMS <onboarding@resend.dev>',
            to: adminEmail,
            subject: `[LMS 알림] ${courseName} - 새로운 ${type === 'suggestion' ? '건의사항' : '질문'}이 등록되었습니다`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 12px;">
                    <h1 style="font-size: 20px; font-weight: bold; color: #111827;">${courseName}</h1>
                    <h2 style="font-size: 16px; color: #4f46e5; margin-top: 0;">새로운 ${type === 'suggestion' ? '건의사항' : '질문'} 도착</h2>
                    
                    <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
                        <p style="font-size: 14px; font-weight: bold; color: #374151; margin-top: 0; margin-bottom: 8px;">작성자: ${displayAuthor}</p>
                        <p style="font-size: 15px; color: #1f2937; line-height: 1.6; whitespace: pre-wrap; margin: 0;">${teaser}</p>
                    </div>

                    <div style="margin-top: 24px;">
                        <a href="${appUrl}/admin/qna" style="background-color: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">관리자 페이지에서 확인하기</a>
                    </div>
                    
                    <p style="font-size: 12px; color: #9ca3af; margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
                        본 메일은 LMS 시스템에서 자동으로 발송되었습니다.
                    </p>
                </div>
            `
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Notify Admin Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
