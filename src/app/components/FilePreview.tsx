'use client'

import { useState } from 'react'
import { FileText, Music, Video, Image as ImageIcon, Paperclip, ExternalLink } from 'lucide-react'

export type Attachment = {
    id: string
    file_name: string
    file_url: string
    file_type: string | null
    file_size: number | null
}

// Google Drive webViewLink → embed preview URL
export function getDrivePreviewUrl(url: string): string | null {
    const match = url.match(/\/file\/d\/([^/]+)\//)
    if (match) return `https://drive.google.com/file/d/${match[1]}/preview`
    const idMatch = url.match(/[?&]id=([^&]+)/)
    if (idMatch) return `https://drive.google.com/file/d/${idMatch[1]}/preview`
    return null
}

export function guessCategory(file_type: string | null, file_name: string) {
    const ext = file_name.split('.').pop()?.toLowerCase() || ''
    if (file_type === 'youtube') return 'youtube'
    if (file_type?.startsWith('image/') || ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(ext)) return 'image'
    if (file_type?.startsWith('video/') || ['mp4','mov','avi','mkv','webm'].includes(ext)) return 'video'
    if (file_type?.startsWith('audio/') || ['mp3','wav','aac','m4a','flac','ogg','aiff'].includes(ext)) return 'audio'
    if (['pdf'].includes(ext) || file_type === 'application/pdf') return 'pdf'
    if (['pptx','ppt'].includes(ext)) return 'pptx'
    if (['docx','doc'].includes(ext)) return 'docx'
    if (['md'].includes(ext)) return 'md'
    return 'other'
}

export function AttachmentIcon({ att }: { att: Attachment | undefined }) {
    if (!att) return <Paperclip className="w-3.5 h-3.5" />
    const cat = guessCategory(att.file_type, att.file_name)
    if (cat === 'image') return <ImageIcon className="w-3.5 h-3.5" />
    if (cat === 'video' || cat === 'youtube') return <Video className="w-3.5 h-3.5" />
    if (cat === 'audio') return <Music className="w-3.5 h-3.5" />
    return <Paperclip className="w-3.5 h-3.5" />
}

function ImagePreview({ imgSrc, alt, fallbackUrl }: { imgSrc: string; alt: string; fallbackUrl: string | null }) {
    const [useFallback, setUseFallback] = useState(false)

    if (useFallback && fallbackUrl) {
        return (
            <div className="rounded-2xl overflow-hidden border border-neutral-700 bg-neutral-900" style={{ height: '65vh' }}>
                <iframe src={fallbackUrl} className="w-full h-full" title={alt} />
            </div>
        )
    }
    return (
        <div className="rounded-2xl overflow-hidden border border-neutral-700 bg-neutral-900 flex items-center justify-center min-h-[40vh] max-h-[65vh]">
            <img
                src={imgSrc}
                alt={alt}
                className="max-h-[65vh] max-w-full w-auto object-contain rounded-xl"
                onError={() => setUseFallback(true)}
            />
        </div>
    )
}

export default function FilePreview({ att }: { att: Attachment | undefined }) {
    if (!att) return null
    const cat = guessCategory(att.file_type, att.file_name)
    const previewUrl = getDrivePreviewUrl(att.file_url)

    if (cat === 'youtube') {
        const videoId = att.file_url.split('v=')[1]?.split('&')[0] || att.file_url.split('/').pop()
        return (
            <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black aspect-video w-full h-full min-h-[50vh]">
                <iframe
                    src={`https://www.youtube.com/embed/${videoId}`}
                    className="w-full h-full"
                    allowFullScreen
                    title="YouTube Preview"
                />
            </div>
        )
    }

    if (cat === 'image') {
        const driveIdMatch = att.file_url.match(/\/file\/d\/([^/]+)\//) || att.file_url.match(/[?&]id=([^&]+)/)
        const driveFileId = driveIdMatch?.[1]
        const imgSrc = driveFileId
            ? `https://drive.google.com/uc?export=view&id=${driveFileId}`
            : att.file_url
        const fallbackUrl = driveFileId
            ? `https://drive.google.com/file/d/${driveFileId}/preview`
            : null
        return <ImagePreview key={att.id} imgSrc={imgSrc} alt={att.file_name} fallbackUrl={fallbackUrl} />
    }

    if (cat === 'video') {
        return (
            <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black flex justify-center w-full h-full items-center min-h-[50vh]">
                <video src={att.file_url} controls className="w-full max-h-[65vh]" />
            </div>
        )
    }

    if (cat === 'audio') {
        return (
            <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center gap-4 w-full h-full min-h-[40vh]">
                <div className="w-20 h-20 rounded-3xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300 flex items-center justify-center shadow-inner">
                    <Music className="w-10 h-10" />
                </div>
                <p className="font-bold text-slate-700 dark:text-slate-300 text-base text-center max-w-[80%] truncate">{att.file_name}</p>
                <audio src={att.file_url} controls className="w-full max-w-xl mt-4" />
            </div>
        )
    }

    if ((cat === 'pdf' || cat === 'pptx' || cat === 'docx' || cat === 'md') && previewUrl) {
        return (
            <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white w-full h-full min-h-[65vh]">
                <iframe
                    src={previewUrl}
                    className="w-full h-full min-h-[65vh]"
                    allow="autoplay"
                    title={att.file_name}
                />
            </div>
        )
    }

    return (
        <div className="flex items-center justify-center w-full h-full min-h-[40vh]">
            <a
                href={att.file_url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-rose-400 transition group max-w-md w-full"
            >
                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl text-rose-500 group-hover:scale-110 transition shadow-sm">
                    <FileText className="w-8 h-8" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 dark:text-white truncate lg:text-lg">{att.file_name}</p>
                    {att.file_size && <p className="text-sm text-slate-400 mt-1">{(att.file_size / 1024 / 1024).toFixed(2)} MB</p>}
                    <p className="text-xs text-rose-500 font-bold mt-2 flex items-center gap-1 group-hover:text-rose-600">클릭하여 다운로드 <ExternalLink className="w-3 h-3" /></p>
                </div>
            </a>
        </div>
    )
}
