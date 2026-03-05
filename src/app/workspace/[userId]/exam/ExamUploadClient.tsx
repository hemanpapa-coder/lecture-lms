'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle2, Image as ImageIcon, Music, Youtube, FileText, X } from 'lucide-react'

export default function ExamUploadClient({
    userId, courseId, submissions, isRealAdmin, viewType
}: {
    userId: string, courseId: string, submissions: any[], isRealAdmin: boolean, viewType?: string
}) {
    const router = useRouter()
    const midterm = submissions.find(s => s.exam_type === '중간고사')
    const finalProject = submissions.find(s => s.exam_type === '기말작품')
    const pdfSubmission = submissions.find(s => s.exam_type === '수시과제PDF')


    const [uploadingExam, setUploadingExam] = useState<string | null>(null)

    // Form states
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [youtubeUrl, setYoutubeUrl] = useState('')
    const [contentDesc, setContentDesc] = useState('')

    const handleUpload = async (examType: string) => {
        if (examType === '중간고사' && !selectedFile) {
            alert('필기 사진 파일을 선택해주세요.')
            return
        }
        if (examType === '기말작품' && !selectedFile && !youtubeUrl) {
            alert('음원 파일이나 유튜브 링크 중 하나는 필수입니다.')
            return
        }

        setUploadingExam(examType)
        try {
            const formData = new FormData()
            formData.append('userId', userId)
            formData.append('courseId', courseId)
            formData.append('examType', examType)
            formData.append('content', contentDesc)

            if (examType === '기말작품' && youtubeUrl) {
                formData.append('youtubeUrl', youtubeUrl)
            }
            if (selectedFile) {
                formData.append('file', selectedFile)
            }

            const res = await fetch('/api/recording-class/exam-upload', {
                method: 'POST',
                body: formData
            })

            const json = await res.json()
            if (!res.ok) throw new Error(json.error || '업로드 실패')

            alert('성공적으로 제출되었습니다.')
            setSelectedFile(null)
            setYoutubeUrl('')
            setContentDesc('')
            router.refresh()
        } catch (e: any) {
            alert(e.message)
        } finally {
            setUploadingExam(null)
        }
    }

    return (
        <div className="space-y-8">
            {/* Midterm Section */}
            {(!viewType || viewType === 'all' || viewType === 'midterm') && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3 mb-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div className="p-2 bg-pink-100 text-pink-600 rounded-lg dark:bg-pink-900/30">
                            <ImageIcon className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white">중간고사 필기 사진 제출</h2>
                    </div>

                    {midterm ? (
                        <div className="p-5 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                <div>
                                    <p className="font-bold text-emerald-900 dark:text-emerald-400">제출 완료</p>
                                    <a href={midterm.file_url} target="_blank" className="text-xs text-emerald-600 hover:underline">사진 보기 ({midterm.file_name})</a>
                                </div>
                            </div>
                            {isRealAdmin && (
                                <button className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40">삭제</button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-500 mb-4">음향학 오픈북 작성 필기시험지를 스캔하거나 사진으로 찍어 제출하세요. (이미지 파일)</p>
                            <input
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-pink-50 file:text-pink-700 hover:file:bg-pink-100 dark:file:bg-pink-900/20 dark:file:text-pink-400"
                            />
                            <button
                                onClick={() => handleUpload('중간고사')}
                                disabled={uploadingExam === '중간고사'}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 transition disabled:opacity-50"
                            >
                                <Upload className="w-4 h-4" /> {uploadingExam === '중간고사' ? '업로드 중...' : '제출하기'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Final Project Section */}
            {(!viewType || viewType === 'all' || viewType === 'final') && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3 mb-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div className="p-2 bg-orange-100 text-orange-600 rounded-lg dark:bg-orange-900/30">
                            <Youtube className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white">기말 작품 음원/영상 제출</h2>
                    </div>

                    {finalProject ? (
                        <div className="p-5 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl space-y-4">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                <p className="font-bold text-emerald-900 dark:text-emerald-400">제출 완료</p>
                            </div>
                            <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
                                {finalProject.content && (
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 mb-1">작품 설명</p>
                                        <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{finalProject.content.replace(/---YOUTUBE-LINK---.*/, '')}</p>
                                    </div>
                                )}

                                {finalProject.media_type === 'youtube' && finalProject.file_url ? (
                                    <div className="aspect-video w-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800">
                                        <iframe
                                            src={finalProject.file_url.replace('watch?v=', 'embed/')}
                                            className="w-full h-full"
                                            allowFullScreen
                                        ></iframe>
                                    </div>
                                ) : finalProject.file_url && finalProject.media_type === 'audio' ? (
                                    <div className="space-y-2">
                                        <p className="text-xs font-bold text-slate-400">음원 파일: {finalProject.file_name}</p>
                                        <audio controls src={finalProject.file_url} className="w-full" />
                                    </div>
                                ) : null}

                                {/* Hacky check if both Audio and Youtube were provided via content parsing */}
                                {finalProject.content && finalProject.content.includes('---YOUTUBE-LINK---') && (
                                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                                        <p className="text-xs font-bold text-slate-400 mb-2">유튜브 링크</p>
                                        {(() => {
                                            const yUrl = finalProject.content.split('---YOUTUBE-LINK---')[1].trim();
                                            return (
                                                <a href={yUrl} target="_blank" className="text-sm font-bold text-blue-500 hover:underline">{yUrl}</a>
                                            )
                                        })()}
                                    </div>
                                )}
                            </div>
                            {isRealAdmin && (
                                <button className="text-xs font-bold text-red-500 bg-red-50 px-4 py-2 rounded-lg hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40">삭제 관리</button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <p className="text-sm text-slate-500">학생 상호평가를 위해 작품(노래) 파일 또는 뮤직비디오 유튜브 링크를 제출해 주세요.</p>

                            <div>
                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2">작품 설명 (크레딧, 작업 툴, 소감 등)</label>
                                <textarea
                                    value={contentDesc}
                                    onChange={e => setContentDesc(e.target.value)}
                                    className="w-full p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none h-24 resize-none"
                                    placeholder="작품의 의도와 맡은 역할 등을 자유롭게 적어주세요."
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2 p-5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-950/50">
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2"><Youtube className="w-4 h-4 text-red-500" /> 유튜브 영상 링크 (선택)</label>
                                    <input
                                        type="url"
                                        value={youtubeUrl}
                                        onChange={e => setYoutubeUrl(e.target.value)}
                                        placeholder="https://youtube.com/watch?v=..."
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none focus:border-red-500"
                                    />
                                    <p className="text-xs text-slate-400">뮤직비디오나 리릭비디오가 있다면 링크를 넣어주세요.</p>
                                </div>

                                <div className="space-y-2 p-5 border border-slate-100 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-950/50">
                                    <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2"><Music className="w-4 h-4 text-orange-500" /> 음원 파일 첨부 (WAV, MP3)</label>
                                    <input
                                        type="file"
                                        accept="audio/*"
                                        // Make sure we select different file input via state if needed, but since it's exclusive or we can just reuse selectedFile
                                        onChange={e => setSelectedFile(e.target.files?.[0] || null)}
                                        className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 dark:file:bg-orange-900/20 dark:file:text-orange-400"
                                    />
                                    <p className="text-xs text-slate-400">최종 믹스/마스터 결과물을 업로드해 주세요.</p>
                                </div>
                            </div>

                            <button
                                onClick={() => handleUpload('기말작품')}
                                disabled={uploadingExam === '기말작품'}
                                className="w-full flex items-center justify-center gap-2 py-3 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-700 transition disabled:opacity-50 shadow-md shadow-orange-600/20"
                            >
                                <Upload className="w-4 h-4" /> {uploadingExam === '기말작품' ? '제출 중입니다...' : '기말 작품 최종 제출'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* PDF Section */}
            {(!viewType || viewType === 'all' || viewType === 'pdf') && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3 mb-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg dark:bg-blue-900/30">
                            <FileText className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white">수시/과제 자동결과물 (PDF)</h2>
                    </div>

                    {pdfSubmission ? (
                        <div className="p-5 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/50 rounded-2xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-6 h-6 text-blue-500" />
                                <div>
                                    <p className="font-bold text-blue-900 dark:text-blue-400">제출 완료</p>
                                    <a href={pdfSubmission.file_url} target="_blank" className="text-xs text-blue-600 hover:underline">PDF 보기 ({pdfSubmission.file_name})</a>
                                </div>
                            </div>
                            {isRealAdmin && (
                                <button className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40">삭제 관리</button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-slate-500">대시보드에서 '제출용 PDF 자동 변환' 버튼을 누르면 이 곳에 업로드 내역이 표시됩니다.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
