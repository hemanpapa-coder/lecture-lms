import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * Admin-only API for personal data management (개인정보보호법 준수)
 *
 * GET  ?action=list          → List students whose privacy delete period is due
 * GET  ?action=summary       → Count of consented, pending deletion, deleted
 * POST { action: 'anonymize', userIds: string[] } → Anonymize PII for given users
 * POST { action: 'set_semester_end', courseId, date } → Set semester end date for a course
 */

async function verifyAdmin(supabase: any, user: any) {
    const { data: adminRecord } = await supabase
        .from('users')
        .select('role, email')
        .eq('id', user.id)
        .single()
    return adminRecord?.role === 'admin' || user.email === 'hemanpapa@gmail.com'
}

export async function GET(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (!await verifyAdmin(supabase, user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const action = req.nextUrl.searchParams.get('action') || 'summary'

        const adminSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY
            ? createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
            : supabase

        if (action === 'summary') {
            // Count students by privacy status
            const { data: users } = await adminSupabase
                .from('users')
                .select('id, privacy_consented_at, privacy_deleted_at, course_id')
                .eq('role', 'user')

            const total = users?.length || 0
            const consented = users?.filter(u => u.privacy_consented_at).length || 0
            const deleted = users?.filter(u => u.privacy_deleted_at).length || 0

            return NextResponse.json({ total, consented, deleted })
        }

        if (action === 'list') {
            // Find students eligible for privacy deletion (semester_end + 3 years <= today)
            const { data: courses } = await adminSupabase
                .from('courses')
                .select('id, name, semester_end_date')
                .not('semester_end_date', 'is', null)

            const today = new Date()
            const eligibleCourseIds = (courses || [])
                .filter(c => {
                    const deleteDate = new Date(c.semester_end_date)
                    deleteDate.setFullYear(deleteDate.getFullYear() + 3)
                    return deleteDate <= today
                })
                .map(c => c.id)

            if (eligibleCourseIds.length === 0) {
                return NextResponse.json({ eligible: [], courses: courses || [] })
            }

            const { data: eligible } = await adminSupabase
                .from('users')
                .select('id, name, email, department, student_id, course_id, privacy_consented_at, privacy_deleted_at, created_at')
                .in('course_id', eligibleCourseIds)
                .eq('role', 'user')
                .is('privacy_deleted_at', null)

            return NextResponse.json({ eligible: eligible || [], courses: courses || [] })
        }

        if (action === 'courses') {
            const { data: courses } = await adminSupabase
                .from('courses')
                .select('id, name, semester_end_date')
                .order('name')
            return NextResponse.json({ courses: courses || [] })
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (!await verifyAdmin(supabase, user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const body = await req.json()
        const { action } = body

        const adminSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY
            ? createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
            : supabase

        if (action === 'anonymize') {
            const { userIds } = body as { userIds: string[] }
            if (!userIds?.length) return NextResponse.json({ error: 'No userIds provided' }, { status: 400 })

            const now = new Date().toISOString()
            let successCount = 0
            const errors: string[] = []

            for (const userId of userIds) {
                // Step 1: Anonymize PII in users table (keep grade-related fields)
                const { error: dbError } = await adminSupabase
                    .from('users')
                    .update({
                        name: '[삭제됨]',
                        student_id: null,
                        phone: null,
                        major: null,
                        department: '[삭제됨]',
                        // Keep: course_id, grade, evaluations linkage
                        privacy_deleted_at: now,
                        is_approved: false,
                        profile_completed: false,
                    })
                    .eq('id', userId)

                if (dbError) {
                    errors.push(`${userId}: ${dbError.message}`)
                    continue
                }

                // Step 2: Delete Supabase Auth account (removes login ability)
                if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
                    const { error: authError } = await adminSupabase.auth.admin.deleteUser(userId)
                    if (authError) {
                        console.error(`[privacy/anonymize] auth delete error for ${userId}:`, authError)
                        // Don't fail — PII is already anonymized in DB
                    }
                }

                successCount++
            }

            return NextResponse.json({
                success: true,
                anonymized: successCount,
                errors: errors.length > 0 ? errors : undefined,
            })
        }

        if (action === 'set_semester_end') {
            const { courseId, date } = body
            if (!courseId || !date) return NextResponse.json({ error: 'courseId and date are required' }, { status: 400 })

            const { error } = await adminSupabase
                .from('courses')
                .update({ semester_end_date: date })
                .eq('id', courseId)

            if (error) return NextResponse.json({ error: error.message }, { status: 500 })
            return NextResponse.json({ success: true })
        }

        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
