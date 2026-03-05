import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MessageCircle, MessagesSquare } from 'lucide-react'

export default async function BoardPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/auth/login')
    }

    // Mock list of anonymous Q&A questions
    const dummyQuestions = [
        { id: 1, title: '컴프레서 어택 타임 설정이 헷갈립니다.', comments: 2, date: '2023-10-12', isPinned: true },
        { id: 2, title: '보컬 라이딩과 오토메이션의 차이점', comments: 1, date: '2023-10-15', isPinned: false },
        { id: 3, title: 'Suno AI로 만든 마스터 음원 음질 향상 팁', comments: 4, date: '2023-10-18', isPinned: false },
    ]

    return (
        <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 p-8">
            <div className="mx-auto max-w-5xl space-y-8">

                <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl bg-white p-8 shadow-sm dark:bg-neutral-900 border border-neutral-200/60 dark:border-neutral-800">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl dark:bg-orange-900/30">
                            <MessagesSquare className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">익명 Q&A 커뮤니티</h1>
                            <p className="text-sm text-neutral-500 mt-1">학생들끼리 자유롭게 질문하고 토론하는 공간 (완전 익명)</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 transition">
                            새 질문 작성
                        </button>
                        <Link href="/" className="text-sm font-semibold text-blue-600 hover:underline shrink-0 px-2">
                            메인으로
                        </Link>
                    </div>
                </header>

                <div className="rounded-3xl bg-white shadow-sm border border-neutral-200/60 dark:bg-neutral-900 dark:border-neutral-800 overflow-hidden">
                    <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {dummyQuestions.map((q) => (
                            <li key={q.id} className={`p-6 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition cursor-pointer ${q.isPinned ? 'bg-orange-50/30 dark:bg-orange-900/10' : ''}`}>
                                <div>
                                    <h3 className="font-bold text-neutral-900 dark:text-neutral-200 flex items-center gap-2">
                                        {q.isPinned && <span className="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black">공지/FAQ</span>}
                                        {q.title}
                                    </h3>
                                    <div className="flex items-center gap-4 text-xs font-semibold text-neutral-500 mt-2">
                                        <span>익명</span>
                                        <span>{q.date}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 text-neutral-400 bg-neutral-50 dark:bg-neutral-800 px-3 py-1.5 rounded-full text-sm font-bold">
                                    <MessageCircle className="w-4 h-4" />
                                    {q.comments}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>

            </div>
        </div>
    )
}
