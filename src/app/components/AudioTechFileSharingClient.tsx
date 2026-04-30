'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadCloud, Loader2, CheckCircle2, AlertCircle, FileIcon, Trash2, Download, Cloud } from 'lucide-react'

type SharedFile = {
    id: string;
    title: string;
    file_id: string;
    file_url: string;
    file_size: number;
    uploaded_by: string;
    created_at: string;
    uploader_name?: string; // We might need to fetch user names if not already present, or pass it in.
};

export default function AudioTechFileSharingClient({
    userId,
    courseId,
    isAdmin,
    sharedFiles
}: {
    userId: string,
    courseId: string,
    isAdmin: boolean,
    sharedFiles: SharedFile[]
}) {
    const router = useRouter()
    
    const [isDragging, setIsDragging] = useState(false)
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState('')
    const [uploadSuccess, setUploadSuccess] = useState(false)

    const [deletingId, setDeletingId] = useState<string | null>(null)

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
            const folderName = `자료공유_${courseId.slice(0, 8)}`

            // 1. Get Resumable Upload URLs
            const urlRes = await fetch('/api/recording-class/drive-upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    examType: folderName, // This creates a "자료공유_..." folder inside the exams root
                    filesInfo: selectedFiles.map(f => ({
                        name: f.name,
                        size: f.size,
                        mimeType: f.type || 'application/octet-stream'
                    }))
                })
            })

            if (!urlRes.ok) {
                const errData = await urlRes.json()
                throw new Error(errData.error || '업로드 세션 생성 실패')
            }

            const { uploadUrls } = await urlRes.json()
            const filesInfoForDb = []

            // 2. Upload directly to each Google Drive Location
            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i]
                const locationUrl = uploadUrls[i].uploadUrl

                if (!locationUrl) throw new Error('업로드 URL이 유효하지 않습니다.')

                const uploadRes = await fetch(locationUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': file.type || 'application/octet-stream' },
                    body: file
                })

                if (!uploadRes.ok) throw new Error(`${file.name} 업로드 실패`)

                const googleFileData = await uploadRes.json()
                filesInfoForDb.push({
                    name: file.name,
                    url: googleFileData.webViewLink || '',
                    fileId: googleFileData.id || '',
                    size: file.size
                })
            }

            // 3. Save Supabase Records
            const submitRes = await fetch('/api/audio-tech/share-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    courseId,
                    filesInfo: filesInfoForDb
                })
            })

            if (!submitRes.ok) {
                const errData = await submitRes.json()
                throw new Error(errData.error || 'DB 저장 실패')
            }

            setUploadSuccess(true)
            setSelectedFiles([])
            
            router.refresh()
            
            // clear success message after 3 seconds
            setTimeout(() => setUploadSuccess(false), 3000)
            
        } catch (err: any) {
            setUploadError(err.message)
        } finally {
            setUploading(false)
        }
    }

    const handleDelete = async (archiveId: string, title: string) => {
        if (!confirm(`'${title}' 파일을 정말 삭제하시겠습니까?`)) return;

        setDeletingId(archiveId);
        try {
            const res = await fetch('/api/audio-tech/share-file-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ archiveId })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || '삭제 실패');
            }

            router.refresh();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setDeletingId(null);
        }
    }

    const formatBytes = (bytes: number, decimals = 2) => {
        if (!+bytes) return '0 Bytes'
        const k = 1024
        const dm = decimals < 0 ? 0 : decimals
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
    }

    return (
        <div className="rounded-3xl bg-white p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800 dark:bg-neutral-900 w-full mt-6">
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Cloud className="w-6 h-6 text-sky-500" /> 자료 공유 공간
                    </h2>
                    <p className="text-sm text-neutral-500 mt-2 font-medium">
                        어떤 파일이든 드래그해서 업로드하고 함께 다운로드할 수 있습니다.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Upload Section */}
                <div className="bg-neutral-50 dark:bg-neutral-950 p-6 rounded-2xl border border-neutral-100 dark:border-neutral-800 h-full flex flex-col">
                    <form onSubmit={handleUpload} className="space-y-4 flex flex-col h-full">
                        {/* Drag and drop zone */}
                        <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            className={`relative border-2 border-dashed rounded-xl p-8 flex-1 flex flex-col items-center justify-center text-center transition-colors
                                ${isDragging ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20' : 'border-neutral-200 bg-white hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900'}
                                ${selectedFiles.length > 0 ? 'border-sky-500 bg-sky-50/50 dark:border-sky-800' : ''}
                            `}
                        >
                            <input
                                type="file"
                                id="file-share-upload"
                                className="hidden"
                                onChange={handleFileChange}
                                multiple
                            />

                            {selectedFiles.length > 0 ? (
                                <div className="flex flex-col items-center gap-3 w-full max-h-60 overflow-y-auto px-2">
                                    {selectedFiles.map((file, idx) => (
                                        <div key={idx} className="flex items-center justify-between w-full bg-white dark:bg-neutral-950 p-3 rounded-xl border border-neutral-100 dark:border-neutral-800 shadow-sm">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="p-2 bg-sky-50 text-sky-500 rounded-lg shrink-0 dark:bg-sky-900/20">
                                                    <FileIcon className="w-5 h-5" />
                                                </div>
                                                <div className="text-left overflow-hidden">
                                                    <p className="font-bold text-xs text-neutral-900 dark:text-white truncate" title={file.name}>{file.name}</p>
                                                    <p className="text-[10px] text-neutral-500 mt-0.5">{formatBytes(file.size)}</p>
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
                                    <label htmlFor="file-share-upload" className="text-[11px] font-bold text-sky-500 hover:text-sky-600 hover:underline cursor-pointer mt-4 bg-sky-50 dark:bg-sky-900/20 px-4 py-2 rounded-xl">
                                        + 파일 추가하기
                                    </label>
                                </div>
                            ) : (
                                <label htmlFor="file-share-upload" className="cursor-pointer flex flex-col items-center w-full h-full justify-center min-h-[160px]">
                                    <UploadCloud className="w-8 h-8 text-sky-400 mb-3" />
                                    <p className="font-bold text-sm text-neutral-600 dark:text-neutral-400">
                                        클릭하거나 드래그하여 파일 업로드
                                    </p>
                                    <p className="text-[11px] font-medium text-neutral-400 mt-2">제한 없음 · 다중 파일 선택 가능</p>
                                </label>
                            )}
                        </div>

                        {uploadError && (
                            <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-xs font-bold text-red-600 flex items-center gap-2 dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400">
                                <AlertCircle className="w-4 h-4 shrink-0" /> <span className="truncate">{uploadError}</span>
                            </div>
                        )}

                        {uploadSuccess && (
                            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-xs font-bold text-emerald-600 flex items-center gap-2 dark:bg-emerald-900/20 dark:border-emerald-900/50 dark:text-emerald-400">
                                <CheckCircle2 className="w-4 h-4 shrink-0" /> 전송이 완료되었습니다!
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={selectedFiles.length === 0 || uploading}
                            className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-500 p-3.5 text-sm font-bold text-white hover:bg-sky-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {uploading ? <><Loader2 className="w-5 h-5 animate-spin" /> 업로드 중...</> : '클라우드에 공유하기'}
                        </button>
                    </form>
                </div>

                {/* File List Section */}
                <div className="flex flex-col h-[400px] lg:h-auto border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden bg-white dark:bg-neutral-900">
                    <div className="bg-neutral-50 dark:bg-neutral-950 px-5 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                        <span className="text-xs font-bold text-neutral-500">공유된 파일 목록 ({sharedFiles.length})</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {sharedFiles.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-neutral-400">
                                <Cloud className="w-8 h-8 opacity-20 mb-3" />
                                <p className="text-sm font-bold opacity-50">아직 공유된 파일이 없습니다.</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {sharedFiles.map(file => {
                                    const isOwner = file.uploaded_by === userId;
                                    const canDelete = isAdmin || isOwner;
                                    const isDeleting = deletingId === file.id;

                                    return (
                                        <div key={file.id} className="group flex items-center justify-between p-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded-xl transition-colors">
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className="p-2.5 bg-sky-50 text-sky-500 rounded-xl dark:bg-sky-900/20 shrink-0">
                                                    <FileIcon className="w-4 h-4" />
                                                </div>
                                                <div className="overflow-hidden">
                                                    <p className="text-sm font-bold text-neutral-800 dark:text-neutral-200 truncate" title={file.title}>
                                                        {file.title}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-0.5 text-[10px] font-medium text-neutral-500">
                                                        <span>{formatBytes(file.file_size)}</span>
                                                        <span>•</span>
                                                        <span>{new Date(file.created_at).toLocaleDateString()}</span>
                                                        {file.uploader_name && (
                                                            <>
                                                                <span>•</span>
                                                                <span className={isOwner ? 'text-sky-500 font-bold' : ''}>{file.uploader_name}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <a 
                                                    href={file.file_url} 
                                                    target="_blank" 
                                                    rel="noreferrer"
                                                    className="p-2 text-neutral-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/30 rounded-lg transition-colors"
                                                    title="다운로드"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </a>
                                                {canDelete && (
                                                    <button
                                                        onClick={() => handleDelete(file.id, file.title)}
                                                        disabled={isDeleting}
                                                        className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                                                        title="파일 삭제"
                                                    >
                                                        {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
