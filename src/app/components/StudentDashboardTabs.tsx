'use client'

import { useState } from 'react'
import { BookOpen, MessagesSquare, Mic2, Music } from 'lucide-react'
import ChatRoom from '@/components/ChatRoom'
import Link from 'next/link'

export default function StudentDashboardTabs({
    children,
    courseId,
    courseName,
    userId,
    isAdmin,
    userMajor = '',
    isPrivateLesson = false,
    lessonArchivePages = [],
    lessonCourseId = '',
}: {
    children: React.ReactNode;
    courseId: string;
    courseName?: string;
    userId: string;
    isAdmin: boolean;
    userMajor?: string;
    isPrivateLesson?: boolean;
    lessonArchivePages?: { week_number: number; title: string; updated_at: string | null }[];
    lessonCourseId?: string;
}) {
    const [activeTab, setActiveTab] = useState<'log' | 'chat_communal' | 'chat_engineer' | 'chat_musician'>('log')

    // 특정 수업(홈레코딩, 오디오테크놀러지 등)은 엔지니어/뮤지션 분리 탭을 표시하지 않음
    const isSpecialCourse = courseName?.includes('홈레코딩') || courseName?.includes('오디오테크놀러지')

    // 엔지니어/뮤지션 전공 구분 (RecordingDashboardClient 기준과 동일)
    const isEngineer = userMajor?.includes('엔지니어') || userMajor?.includes('engineer') || userMajor?.includes('Engineer')
    const isMusician = !isEngineer && !isAdmin

    // 학생에게 보이는 채팅 탭: 특별 과정이 아닐 때만 공동 + 본인 전공 (또는 어드민은 전체)
    const showEngineerTab = !isSpecialCourse && (isAdmin || isEngineer)
    const showMusicianTab = !isSpecialCourse && (isAdmin || isMusician)

    // ── 개인레슨: 탭 없이 레슨자료 + 1:1 채팅만 바로 표시 ──
    if (isPrivateLesson) {
        return (
            <div className="lg:col-span-2 space-y-6">
                {/* 학습 대시보드 내용 */}
                <div className="space-y-8">
                    {children}
                </div>

                {/* 레슨 일지 (15주 박스 그리드) */}
                {lessonCourseId && (
                    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 px-5 py-3 bg-violet-50 dark:bg-violet-950/30 border-b border-violet-100 dark:border-violet-900/50">
                            <BookOpen className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                            <span className="font-bold text-violet-900 dark:text-violet-300 text-sm">15주차 레슨 일지</span>
                        </div>
                        <div className="p-4 grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-15 gap-2">
                            {Array.from({ length: 15 }, (_, i) => i + 1).map(week => {
                                const hasContent = lessonArchivePages.some(p => p.week_number === week)
                                return (
                                    <Link
                                        key={week}
                                        href={`/archive/${week}?course=${lessonCourseId}`}
                                        className={`flex items-center justify-center aspect-square rounded-xl border text-sm font-bold transition
                                            ${hasContent
                                                ? 'border-violet-400 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 hover:bg-violet-600 hover:text-white hover:border-violet-600'
                                                : 'border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-violet-400 dark:text-violet-600 hover:bg-violet-600 hover:text-white hover:border-violet-600'
                                            }`}
                                    >
                                        {week}
                                    </Link>
                                )
                            })}
                        </div>
                        <div className="px-5 pb-4">
                            <Link
                                href={`/archive?course=${lessonCourseId}`}
                                className="inline-flex items-center gap-2 text-xs font-bold text-violet-600 dark:text-violet-400 hover:underline"
                            >
                                <BookOpen className="w-3.5 h-3.5" /> 전체 레슨 아카이브 보기
                            </Link>
                        </div>
                    </div>
                )}

                {/* 교수와 1:1 대화창 */}
                <ChatRoom
                    courseId={courseId}
                    userId={userId}
                    isAdmin={isAdmin}
                    isPrivateMode={true}
                    title="교수와 1:1 대화창"
                    subtitle="담당 교수와 나누는 개인 대화창입니다."
                />
            </div>
        )
    }

    return (
        <div className="lg:col-span-2 space-y-6">
            {/* Tab Switcher */}
            <div className="flex flex-wrap gap-1 bg-white dark:bg-slate-900 p-1 rounded-2xl w-fit shadow-sm border border-slate-200 dark:border-slate-800">
                <button
                    onClick={() => setActiveTab('log')}
                    className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'log' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                    <BookOpen className="w-4 h-4" /> 학습 대시보드
                </button>
                <button
                    onClick={() => setActiveTab('chat_communal')}
                    className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'chat_communal' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                    <MessagesSquare className="w-4 h-4" /> 공동 대화창
                    {activeTab !== 'chat_communal' && <span className="flex h-2 w-2 rounded-full bg-red-500" />}
                </button>
                {showEngineerTab && (
                    <button
                        onClick={() => setActiveTab('chat_engineer')}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'chat_engineer' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                        <Mic2 className="w-4 h-4" /> 엔지니어
                        {activeTab !== 'chat_engineer' && <span className="flex h-2 w-2 rounded-full bg-emerald-500" />}
                    </button>
                )}
                {showMusicianTab && (
                    <button
                        onClick={() => setActiveTab('chat_musician')}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'chat_musician' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                        <Music className="w-4 h-4" /> 뮤지션
                        {activeTab !== 'chat_musician' && <span className="flex h-2 w-2 rounded-full bg-violet-500" />}
                    </button>
                )}
            </div>

            {/* Content */}
            {activeTab === 'log' && (
                <div className="space-y-8">
                    {children}
                </div>
            )}
            {activeTab === 'chat_communal' && (
                <ChatRoom
                    courseId={courseId}
                    userId={userId}
                    isAdmin={isAdmin}
                    title="공동 대화창"
                    subtitle="모든 학생과 강사가 참여하는 대화창입니다."
                />
            )}
            {activeTab === 'chat_engineer' && (
                <ChatRoom
                    courseId={`${courseId}_engineer`}
                    userId={userId}
                    isAdmin={isAdmin}
                    isPrivateMode={true}
                    title="엔지니어 대화창"
                    subtitle="엔지니어 파트 학생들과 강사 전용 대화창입니다."
                />
            )}
            {activeTab === 'chat_musician' && (
                <ChatRoom
                    courseId={`${courseId}_musician`}
                    userId={userId}
                    isAdmin={isAdmin}
                    isPrivateMode={true}
                    title="뮤지션 대화창"
                    subtitle="뮤지션 전공 학생들과 강사 전용 대화창입니다."
                />
            )}
        </div>
    )
}
