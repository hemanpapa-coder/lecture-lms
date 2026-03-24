'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud, Loader2, CheckCircle2, AlertCircle, FileIcon } from 'lucide-react'

export default function AudioTechUploadClient({
    userId,
    courseId,
    type,
    title
}: {
    userId: string,
    courseId: string,
    type: '발표' | '과제물',
    title: string
}) {
    const router = useRouter()
    
    // Default to '발표 1주차' or '과제물 1회차' appropriately
    const [selectedNum, setSelectedNum] = useState<number>(1)
    
    const [isDragging, setIsDragging] = useState(false)
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState('')
    const [uploadSuccess, setUploadSuccess] = useState(false)

    // Option length configuration
    const len = type === '발표' ? 15 : 3;
    const suffix = type === '발표' ? '주차' : '회차';

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            setSelectedFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)])
        }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setSelectedFiles(prev => [...prev, ...Array.from(e.target.files as FileList)])
        }
    }

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index))
    }

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault()
        if (selectedFiles.length === 0) {
            setUploadError('업로드할 파일을 하나 이상 선택해주세요.')
            return
        }

        setUploading(true)
        setUploadError('')
        setUploadSuccess(false)

        try {
            const formData = new FormData()
            selectedFiles.forEach(f => formData.append('files', f))
            formData.append('userId', userId)
            formData.append('courseId', courseId)
            
            // Reusing Exam Upload API to save to Google drive and link to `exam_submissions` DB table
            // We set 'examType' to something like "발표 1주차" or "과제물 2회차"
            const examTypeValue = `${type} ${selectedNum}${suffix}`
            formData.append('examType', examTypeValue)
            formData.append('content', `${type} 업로드 자동 생성됨`) // simple mock content

            const res = await fetch('/api/recording-class/exam-upload', {
                method: 'POST',
                body: formData,
            })

            if (!res.ok) {
                const errData = await res.json()
                throw new Error(errData.error || '업로드 실패')
            }

            setUploadSuccess(true)
            setSelectedFiles([])
            
            alert(`${examTypeValue} 자료가 업로드 되었습니다!`)
            router.refresh()
            
        } catch (err: any) {
            setUploadError(err.message)
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="mt-6 border-t border-neutral-200 dark:border-neutral-800 pt-6">
            <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-4 flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-blue-500" /> {title} 업로드
            </h3>

            <div className="bg-neutral-50 dark:bg-neutral-950 p-5 rounded-2xl border border-neutral-100 dark:border-neutral-800">
                <form onSubmit={handleUpload} className="space-y-4">
                    
                    {/* Select Week/Order */}
                    <div>
                        <select
                            value={selectedNum}
                            onChange={(e) => setSelectedNum(Number(e.target.value))}
                            className="w-full rounded-xl border border-neutral-200 p-2.5 bg-white text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none dark:border-neutral-700 dark:bg-neutral-900"
                            required
                        >
                            {Array.from({ length: len }, (_, i) => i + 1).map(n => (
                                <option key={n} value={n}>{`${type} ${n}${suffix}`}</option>
                            ))}
                        </select>
                    </div>

                    {/* Drag and drop zone */}
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`relative border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-colors
                            ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900'}
                            ${selectedFiles.length > 0 ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-800' : ''}
                        `}
                    >
                        <input
                            type="file"
                            id={`file-upload-${type}`}
                            className="hidden"
                            onChange={handleFileChange}
                            multiple
                        />

                        {selectedFiles.length > 0 ? (
                            <div className="flex flex-col items-center gap-3 w-full max-h-48 overflow-y-auto px-2">
                                {selectedFiles.map((file, idx) => (
                                    <div key={idx} className="flex items-center justify-between w-full bg-white dark:bg-neutral-950 p-3 rounded-xl border border-neutral-100 dark:border-neutral-800 shadow-sm">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="p-2 bg-emerald-50 text-emerald-500 rounded-lg shrink-0 dark:bg-emerald-900/20">
                                                <FileIcon className="w-5 h-5" />
                                            </div>
                                            <div className="text-left overflow-hidden">
                                                <p className="font-bold text-xs text-neutral-900 dark:text-white truncate" title={file.name}>{file.name}</p>
                                                <p className="text-[10px] text-neutral-500 mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeFile(idx); }}
                                            className="text-neutral-400 hover:text-red-500 p-2 transition-colors shrink-0"
                                            aria-label="파일 삭제"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                                <label htmlFor={`file-upload-${type}`} className="text-[11px] font-bold text-blue-500 hover:text-blue-600 hover:underline cursor-pointer mt-2 bg-blue-50 dark:bg-blue-900/20 px-4 py-2 rounded-xl">
                                    + 파일 추가하기
                                </label>
                            </div>
                        ) : (
                            <label htmlFor={`file-upload-${type}`} className="cursor-pointer flex flex-col items-center w-full h-full justify-center">
                                <UploadCloud className="w-6 h-6 text-neutral-400 mb-2" />
                                <p className="font-bold text-xs text-neutral-600 dark:text-neutral-400">
                                    클릭하거나 드래그하여 파일 업로드
                                </p>
                                <p className="text-[10px] font-medium text-neutral-400 mt-1">여러 파일을 동시에 선택할 수 있습니다.</p>
                            </label>
                        )}
                    </div>

                    {uploadError && (
                        <div className="p-2.5 rounded-lg bg-red-50 border border-red-100 text-[11px] font-bold text-red-600 flex items-center gap-1.5 dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400">
                            <AlertCircle className="w-3.5 h-3.5" /> {uploadError}
                        </div>
                    )}

                    {uploadSuccess && (
                        <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-[11px] font-bold text-emerald-600 flex items-center gap-1.5 dark:bg-emerald-900/20 dark:border-emerald-900/50 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> 전송 완료!
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={selectedFiles.length === 0 || uploading}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 p-2.5 text-xs font-bold text-white hover:bg-blue-700 transition disabled:opacity-50"
                    >
                        {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> 전송 중...</> : '제출하기'}
                    </button>
                    <p className="text-[10px] text-neutral-500 text-center font-medium">* 1~2초 정도 소요될 수 있습니다. 완료 알림을 확인하세요.</p>
                </form>
            </div>
        </div>
    )
}
