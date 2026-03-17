import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // Check if admin
        const { data: adminRecord } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()

        const isRealAdmin = adminRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
        if (!isRealAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const formData = await req.formData()
        const targetUserId = formData.get('userId') as string
        const action = formData.get('action') as string

        if (!targetUserId || !action) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
        }

        // Use service role client if available (bypasses RLS)
        const adminSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY
            ? createAdminClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY
            )
            : supabase

        if (action === 'approve') {
            // 승인 전 학생 정보 조회 (개인레슨 여부 확인)
            const { data: targetUserData } = await adminSupabase
                .from('users')
                .select('name, email, private_lesson_id, course_id')
                .eq('id', targetUserId)
                .single()

            let updates: Record<string, any> = { is_approved: true }

            // 개인레슨 학생이고 private_lesson_id가 있는 경우 → 전용 course 자동 생성
            if (targetUserData?.private_lesson_id) {
                // 해당 course가 공유 개인레슨 코스인지 확인 (is_private_lesson=true이면서 이미 다른 학생도 쓰는 경우)
                const { data: existingCourse } = await adminSupabase
                    .from('courses')
                    .select('id, name, is_private_lesson')
                    .eq('id', targetUserData.private_lesson_id)
                    .single()

                // 공유 코스를 가리키고 있으면 학생 전용 코스 새로 생성
                if (existingCourse?.is_private_lesson) {
                    // 이미 이 학생만을 위한 개인 코스인지 확인 (course name에 이메일이나 이름 포함 여부)
                    const studentName = targetUserData.name || targetUserData.email.split('@')[0]
                    const personalCourseName = `${studentName}의 레슨`

                    // 학생 전용 course 생성
                    const { data: newCourse, error: courseErr } = await adminSupabase
                        .from('courses')
                        .insert({
                            name: personalCourseName,
                            is_private_lesson: true,
                            description: `${studentName} 개인 레슨 전용 아카이브`,
                        })
                        .select('id')
                        .single()

                    if (!courseErr && newCourse) {
                        updates.private_lesson_id = newCourse.id
                        console.log(`[approve] Created personal lesson course: ${personalCourseName} (${newCourse.id}) for user ${targetUserId}`)
                    }
                }
            }

            const { error } = await adminSupabase
                .from('users')
                .update(updates)
                .eq('id', targetUserId)

            if (error) {
                console.error('[admin/approve] error:', error)
                throw error
            }

        } else if (action === 'delete') {
            // Hard delete: permanently remove from users table AND Supabase Auth
            // Step 1: Delete from users table
            const { error: dbError } = await adminSupabase
                .from('users')
                .delete()
                .eq('id', targetUserId)

            if (dbError) {
                console.error('[admin/delete] db error:', dbError)
                throw dbError
            }

            // Step 2: Delete from Supabase Auth (only possible with service role key)
            if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
                const { error: authError } = await adminSupabase.auth.admin.deleteUser(targetUserId)
                if (authError) {
                    // Log but don't fail - the users row is already gone
                    console.error('[admin/delete] auth error:', authError)
                }
            }
        } else if (action === 'move_course') {
            const newCourseId = formData.get('newCourseId') as string
            const isPrivateLesson = formData.get('isPrivateLesson') === 'true'

            if (!newCourseId) {
                return NextResponse.json({ error: 'Missing newCourseId' }, { status: 400 })
            }

            const updateField = isPrivateLesson ? { private_lesson_id: newCourseId } : { course_id: newCourseId }

            // Instantly transfer to the new course. Keep them approved.
            const { error } = await adminSupabase
                .from('users')
                .update({
                    ...updateField,
                    is_approved: true, // Auto-approve them in the new course for convenience
                    course_role: 'student' // Reset special roles when switching courses
                })
                .eq('id', targetUserId)

            if (error) {
                console.error('[admin/move_course] error:', error)
                throw error
            }
        } else if (action === 'toggle_auditor') {
            // Fetch current status first
            const { data: targetUser } = await adminSupabase
                .from('users')
                .select('is_auditor')
                .eq('id', targetUserId)
                .single()

            const newStatus = !targetUser?.is_auditor

            const { error } = await adminSupabase
                .from('users')
                .update({ is_auditor: newStatus })
                .eq('id', targetUserId)

            if (error) {
                console.error('[admin/toggle_auditor] error:', error)
                throw error
            }
        } else if (action === 'end_lesson') {
            const { error } = await adminSupabase
                .from('users')
                .update({ private_lesson_ended: true })
                .eq('id', targetUserId)

            if (error) {
                console.error('[admin/end_lesson] error:', error)
                throw error
            }
        } else if (action === 'resume_lesson') {
            const { error } = await adminSupabase
                .from('users')
                .update({ private_lesson_ended: false })
                .eq('id', targetUserId)

            if (error) {
                console.error('[admin/resume_lesson] error:', error)
                throw error
            }
        }

        // Redirect back to admin page
        return NextResponse.redirect(new URL('/admin?tab=students', req.url), 303)
    } catch (err: any) {
        console.error('Admin action error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

