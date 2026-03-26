import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function HomeworkSummaryPrintPage({
    searchParams
}: {
    searchParams: { courseId?: string; week?: string }
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/auth/login')

    const courseId = searchParams.courseId
    const week = parseInt(searchParams.week || '0')

    if (!courseId || !week) return <div>Invalid parameters</div>

    const { data: archive } = await supabase
        .from('archives')
        .select('title, description')
        .eq('course_id', courseId)
        .eq('week', week)
        .eq('summary_type', 'ai_summary')
        .single()

    if (!archive) {
        return (
            <div className="min-h-screen bg-white text-black p-10 flex flex-col items-center justify-center">
                <h1 className="text-2xl font-bold mb-4">아직 생성된 종합 정리본이 없습니다.</h1>
                <p>과제 리뷰 페이지에서 'AI 자동 분석' 버튼을 눌러 먼저 생성해주세요.</p>
                <button 
                    onClick={() => window.close()} 
                    className="mt-6 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold"
                >
                    창 닫기
                </button>
            </div>
        )
    }

    return (
        <div className="bg-white text-black min-h-screen">
            <div className="max-w-4xl mx-auto p-10 print:font-serif">
                <div className="flex items-center justify-between mb-8 print:hidden">
                    <h1 className="text-xl font-bold bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg">
                        미리보기 모드
                    </h1>
                    <button 
                        onClick={() => window.print()}
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg flex items-center gap-2"
                    >
                        🖨️ PDF 프린트 (저장)
                    </button>
                </div>

                <div className="border-b-4 border-black pb-6 mb-8">
                    <h1 className="text-4xl font-black mb-4">{archive.title}</h1>
                    <p className="text-gray-600 font-medium">자동 생성된 주간 과제 종합 리뷰 가이드</p>
                </div>

                <div 
                    className="prose prose-lg max-w-none print:prose-xl prose-img:rounded-xl prose-img:shadow-md"
                    dangerouslySetInnerHTML={{ __html: archive.description || '' }}
                />
            </div>
        </div>
    )
}
