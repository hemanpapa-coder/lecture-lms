'use client'

import { useState } from 'react'
import { MonitorPlay } from 'lucide-react'
import AssignmentPresenter, { type PresentFile } from '@/app/components/AssignmentPresenter'
import AssignmentLiveViewer from '@/app/components/AssignmentLiveViewer'

interface Props {
    courseId: string
    submissions: { id: string; file_url: string; file_name: string; exam_type: string }[]
}

/**
 * 오디오테크놀러지 과제물/발표 업로드 후 보이는 발표하기 버튼.
 * page.tsx (Server Component)에서 사용하기 위한 클라이언트 래퍼.
 */
export default function AudioTechPresentButton({ courseId, submissions }: Props) {
    const [presentingFile, setPresentingFile] = useState<PresentFile | null>(null)

    if (!courseId || submissions.length === 0) return null

    // 가장 최신 과제물을 기본 발표 대상으로 제안
    const latest = submissions[submissions.length - 1]

    return (
        <>
            {/* 발표하기 플로팅 버튼 */}
            <div className="mt-4">
                <button
                    onClick={() => {
                        if (presentingFile?.id === latest.id) {
                            setPresentingFile(null)
                        } else {
                            setPresentingFile({
                                id: latest.id,
                                file_url: latest.file_url,
                                file_name: latest.file_name,
                                file_type: null,
                            })
                        }
                    }}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                        presentingFile?.id === latest.id
                            ? 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-400'
                            : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-lg shadow-violet-500/20'
                    }`}
                >
                    <MonitorPlay className={`w-4 h-4 ${presentingFile?.id === latest.id ? 'animate-pulse' : ''}`} />
                    {presentingFile?.id === latest.id ? '📍 발표 중 · 클릭하여 종료' : '🎤 내 과제 발표하기'}
                </button>
                {submissions.length > 1 && !presentingFile && (
                    <p className="text-center text-[11px] text-neutral-500 mt-1">
                        최근 제출 파일: {latest.file_name}
                    </p>
                )}
            </div>

            {/* 라이브 뷰어 (발표 중이 아닐 때 — 다른 사람이 발표 중이면 배너 표시) */}
            {!presentingFile && (
                <AssignmentLiveViewer courseId={courseId} />
            )}

            {/* 발표자 풀스크린 모달 */}
            {presentingFile && (
                <AssignmentPresenter
                    courseId={courseId}
                    studentName="나"
                    file={presentingFile}
                    onClose={() => setPresentingFile(null)}
                />
            )}
        </>
    )
}
