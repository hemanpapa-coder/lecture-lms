import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import MidtermRecoveryClient from './MidtermRecoveryClient'

const HUB_RECORDING_PRACTICE_COURSE_ID = 'cmphjgfy4000xowv42d8p9424'

export default async function MidtermRecoveryPage(props: { searchParams: Promise<{ course?: string }> }) {
  const searchParams = await props.searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: userRecord } = await supabase
    .from('users')
    .select('id,email,name,student_id,major,department,course_id')
    .eq('id', user.id)
    .single()

  if (!userRecord) {
    redirect('/auth/login')
  }

  const legacyCourseId = searchParams.course || userRecord.course_id || ''
  if (!legacyCourseId) {
    redirect('/auth/select-course')
  }
  const [{ data: submission }, { data: evaluation }] = await Promise.all([
    supabase
      .from('exam_submissions')
      .select('file_name,content,created_at,updated_at')
      .eq('user_id', user.id)
      .eq('course_id', legacyCourseId)
      .eq('exam_type', '중간고사')
      .maybeSingle(),
    supabase
      .from('evaluations')
      .select('midterm_score,updated_at')
      .eq('user_id', user.id)
      .eq('course_id', legacyCourseId)
      .maybeSingle(),
  ])

  const serverSubmission = submission || (evaluation?.midterm_score != null
    ? { file_name: 'evaluations.midterm_score', content: JSON.stringify({ score: evaluation.midterm_score }), updated_at: evaluation.updated_at }
    : null)

  return (
    <MidtermRecoveryClient
      user={{
        id: user.id,
        name: userRecord.name || user.user_metadata?.full_name || '',
        email: userRecord.email || user.email || '',
        studentId: userRecord.student_id || '',
      }}
      legacyCourseId={legacyCourseId}
      hubCourseId={HUB_RECORDING_PRACTICE_COURSE_ID}
      serverSubmission={serverSubmission}
      serverScore={evaluation?.midterm_score ?? null}
    />
  )
}
