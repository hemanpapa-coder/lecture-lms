import { createClient as createAdminClient } from '@supabase/supabase-js'
import Link from 'next/link'

export const revalidate = 0

export default async function ReportsPage() {
  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: reports } = await supabase
    .from('ai_reports')
    .select('id, course_id, report_type, period_label, content, stats, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  const { data: courses } = await supabase.from('courses').select('id, name')
  const courseMap = Object.fromEntries((courses || []).map((c: any) => [c.id, c.name]))

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-10 px-4">
      <div className="mx-auto max-w-4xl space-y-8">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">📊 AI 학습 분석 리포트</h1>
            <p className="text-sm text-slate-500 mt-1">Gemini AI가 매주 자동으로 생성하는 학습 패턴 분석 보고서</p>
          </div>
          <Link href="/" className="px-4 py-2 text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition dark:bg-slate-800 dark:text-slate-300">
            ← 홈으로
          </Link>
        </div>

        {/* 수동 트리거 안내 */}
        <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-2xl p-5">
          <p className="text-sm font-bold text-violet-700 dark:text-violet-300">⚡ 자동 실행 일정</p>
          <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-violet-600 dark:text-violet-400">
            <div className="bg-white/60 dark:bg-white/5 rounded-xl p-3">
              <p className="font-bold">🌅 매일 오전 9시</p>
              <p className="text-violet-500 mt-1">승인 대기 학생 · 과제 미제출 알림</p>
            </div>
            <div className="bg-white/60 dark:bg-white/5 rounded-xl p-3">
              <p className="font-bold">📊 매주 월요일 8시</p>
              <p className="text-violet-500 mt-1">AI 주간 학습 패턴 분석 리포트</p>
            </div>
          </div>
        </div>

        {/* 리포트 목록 */}
        {!reports?.length ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-16 text-center">
            <p className="text-4xl mb-4">📭</p>
            <p className="font-bold text-slate-700 dark:text-slate-300">아직 생성된 리포트가 없습니다</p>
            <p className="text-sm text-slate-400 mt-2">다음 월요일 오전 8시에 첫 번째 리포트가 자동으로 생성됩니다</p>
          </div>
        ) : (
          <div className="space-y-6">
            {reports.map((report: any) => {
              const stats = report.stats || {}
              return (
                <div key={report.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                  {/* 리포트 헤더 */}
                  <div className="px-6 py-4 bg-gradient-to-r from-violet-600 to-indigo-600 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-violet-200 uppercase tracking-widest">
                        {report.report_type === 'weekly' ? '주간 리포트' : '일간 리포트'} · {report.period_label}
                      </p>
                      <h2 className="text-lg font-extrabold text-white mt-0.5">
                        {courseMap[report.course_id] || report.course_id}
                      </h2>
                    </div>
                    <p className="text-xs text-violet-300">
                      {new Date(report.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* 통계 카드 */}
                  {stats.totalStudents && (
                    <div className="grid grid-cols-4 divide-x divide-slate-100 dark:divide-slate-800 border-b border-slate-100 dark:border-slate-800">
                      {[
                        { label: '총 학생', value: `${stats.totalStudents}명`, color: 'text-slate-700 dark:text-slate-300' },
                        { label: '과제 제출', value: `${stats.submitted}명`, color: 'text-emerald-600 dark:text-emerald-400' },
                        { label: '미제출', value: `${stats.notSubmitted}명`, color: stats.notSubmitted > 0 ? 'text-red-500' : 'text-slate-400' },
                        { label: '제출률', value: `${stats.submissionRate}%`, color: stats.submissionRate >= 80 ? 'text-emerald-600' : stats.submissionRate >= 50 ? 'text-amber-500' : 'text-red-500' },
                      ].map((item, i) => (
                        <div key={i} className="px-5 py-3 text-center">
                          <p className={`text-xl font-extrabold ${item.color}`}>{item.value}</p>
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">{item.label}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AI 리포트 본문 */}
                  <div
                    className="px-6 py-5 prose prose-sm max-w-none dark:prose-invert prose-headings:text-slate-900 dark:prose-headings:text-white prose-p:text-slate-600 dark:prose-p:text-slate-300"
                    dangerouslySetInnerHTML={{ __html: report.content }}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
