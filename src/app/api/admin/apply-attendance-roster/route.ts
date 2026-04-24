import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
    try {
        const { courseId, students, weekDates, fileUrl } = await req.json()
        if (!courseId || !students?.length) {
            return NextResponse.json({ error: '필수 데이터 누락' }, { status: 400 })
        }

        // 1. settings에 roster 저장
        const rosterData: any = {
            course_id: courseId,
            roster: students.map((s: any) => ({
                order: s.order,
                studentId: s.studentId,
                name: s.name,
            })),
            updated_at: new Date().toISOString(),
        }
        if (fileUrl) rosterData.file_url = fileUrl

        const rosterKey = `course_${courseId}_roster`
        const { data: existingRoster } = await adminClient
            .from('settings')
            .select('key')
            .eq('key', rosterKey)
            .single()

        if (existingRoster) {
            await adminClient.from('settings').update({ value: JSON.stringify(rosterData) }).eq('key', rosterKey)
        } else {
            await adminClient.from('settings').insert({ key: rosterKey, value: JSON.stringify(rosterData) })
        }

        // 2. 주차별 날짜를 settings에 저장
        if (weekDates?.length) {
            const datesKey = `course_${courseId}_week_dates`
            const datesData = { course_id: courseId, weekDates, updated_at: new Date().toISOString() }
            const { data: existingDates } = await adminClient
                .from('settings')
                .select('key')
                .eq('key', datesKey)
                .single()

            if (existingDates) {
                await adminClient.from('settings').update({ value: JSON.stringify(datesData) }).eq('key', datesKey)
            } else {
                await adminClient.from('settings').insert({ key: datesKey, value: JSON.stringify(datesData) })
            }
        }

        // 3. 각 학생의 student_id와 is_auditor 업데이트
        const rosterStudentIds = new Set(students.map((s: any) => s.studentId).filter(Boolean))
        let updatedCount = 0
        let notFoundCount = 0
        const results: any[] = []

        for (const s of students) {
            if (!s.studentId) continue
            // student_id로 user 찾기
            const { data: matchedUsers } = await adminClient
                .from('users')
                .select('id, name, student_id')
                .eq('course_id', courseId)
                .eq('student_id', s.studentId)
                .is('deleted_at', null)

            if (matchedUsers && matchedUsers.length > 0) {
                await adminClient
                    .from('users')
                    .update({ is_auditor: false })
                    .eq('id', matchedUsers[0].id)
                results.push({ studentId: s.studentId, name: s.name, status: 'matched' })
                updatedCount++
            } else {
                // 이름으로 재시도
                const { data: nameMatched } = await adminClient
                    .from('users')
                    .select('id, name, student_id')
                    .eq('course_id', courseId)
                    .eq('name', s.name)
                    .is('deleted_at', null)

                if (nameMatched && nameMatched.length > 0) {
                    await adminClient
                        .from('users')
                        .update({ is_auditor: false, student_id: s.studentId })
                        .eq('id', nameMatched[0].id)
                    results.push({ studentId: s.studentId, name: s.name, status: 'matched_by_name' })
                    updatedCount++
                } else {
                    results.push({ studentId: s.studentId, name: s.name, status: 'not_found' })
                    notFoundCount++
                }
            }
        }

        // 4. 명단에 없는 수강생 → 청강생 처리
        const { data: allCourseUsers } = await adminClient
            .from('users')
            .select('id, name, student_id')
            .eq('course_id', courseId)
            .is('deleted_at', null)

        let auditorCount = 0
        for (const u of allCourseUsers || []) {
            if (!rosterStudentIds.has(u.student_id)) {
                await adminClient.from('users').update({ is_auditor: true }).eq('id', u.id)
                auditorCount++
            }
        }

        return NextResponse.json({
            success: true,
            updatedCount,
            notFoundCount,
            auditorCount,
            weekDatesCount: weekDates?.length || 0,
            results,
        })

    } catch (err: any) {
        console.error('[apply-attendance-roster] Error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
