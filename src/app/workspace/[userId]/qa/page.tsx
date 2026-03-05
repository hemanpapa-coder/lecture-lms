import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Editor from '@/components/Editor'

export default async function WorkspaceQAPage({ params }: { params: Promise<{ userId: string }> }) {
    const { userId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/auth/login')
    }

    // Permissions check
    const { data: userRecord } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

    const isAdmin = userRecord?.role === 'admin'

    if (user.id !== userId && !isAdmin) {
        redirect('/')
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-8">
            <div className="mx-auto max-w-5xl space-y-8">

                <header className="flex items-center justify-between rounded-2xl bg-white p-6 shadow-sm dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Q&A 및 노트 필기
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">질문을 작성하거나 학습 노트를 보관하세요.</p>
                    </div>
                    <Link href={`/workspace/${userId}`} className="text-sm font-semibold text-blue-600 hover:underline">
                        ← 과제 제출 탭으로 이동
                    </Link>
                </header>

                <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100 dark:border-gray-800 dark:bg-gray-900">
                    <form className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                제목
                            </label>
                            <input
                                type="text"
                                placeholder="질문 또는 노트 제목"
                                className="w-full rounded-md border border-gray-300 p-2 dark:border-gray-700 dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                내용 (사진, 오디오 링크 첨부 가능)
                            </label>
                            {/* Client component for Rich Text */}
                            <Editor placeholder="여기에 내용을 작성하세요..." />
                        </div>

                        <div className="pt-4">
                            <button type="button" className="w-full sm:w-auto rounded-md bg-blue-600 px-6 py-2.5 text-white font-semibold hover:bg-blue-700 transition">
                                저장하기
                            </button>
                        </div>
                    </form>
                </div>

            </div>
        </div>
    )
}
