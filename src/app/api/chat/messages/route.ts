import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const courseId = searchParams.get('courseId');
        const targetUserId = searchParams.get('targetUserId');

        if (!courseId) {
            return NextResponse.json({ error: 'Missing courseId' }, { status: 400 });
        }

        // Verify user is admin or belongs to this course
        const { data: profile } = await supabase
            .from('users')
            .select('role, course_id, private_lesson_id')
            .eq('id', user.id)
            .single();

        if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

        // Extract base course ID in case of sub-rooms (e.g. courseId_engineer)
        const baseCourseId = courseId.split('_')[0];

        if (profile.role !== 'admin' && profile.course_id !== baseCourseId && profile.private_lesson_id !== baseCourseId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const room = courseId.includes('_') ? courseId.split('_')[1] : 'communal';

        // Fetch messages with user info
        let query = supabase
            .from('chat_messages')
            .select(`
                id,
                content,
                type,
                metadata,
                created_at,
                user_id,
                target_user_id,
                users:user_id (
                    name,
                    email,
                    role
                )
            `)
            .eq('course_id', baseCourseId)
            .contains('metadata', { room });

        // If targetUserId is provided (Private Lesson mode), isolate the room
        if (targetUserId) {
            query = query.or(`user_id.eq.${targetUserId},target_user_id.eq.${targetUserId}`);
        }

        const { data: messages, error } = await query
            .order('created_at', { ascending: true })
            .limit(100);

        if (error) throw error;

        return NextResponse.json(messages || []);

    } catch (error: any) {
        console.error('Chat Messages Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
