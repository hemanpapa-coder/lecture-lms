'use client'

import { useState } from 'react'
import FilePreview, { AttachmentIcon, type Attachment } from '@/app/components/FilePreview'
import { ChevronDown, ChevronUp } from 'lucide-react'

type FileItem = {
    id: string
    file_url: string
    file_name: string
    file_type?: string | null
    exam_type: string
    created_at: string
}

function toAttachment(item: FileItem): Attachment {
    return {
        id: item.id,
        file_name: item.file_name,
        file_url: item.file_url,
        file_type: item.file_type ?? null,
        file_size: null,
    }
}

export default function AudioTechFilePreviewList({
    items,
    accentColor = 'blue',
}: {
    items: FileItem[]
    accentColor?: 'blue' | 'orange'
}) {
    const [openId, setOpenId] = useState<string | null>(null)

    if (!items || items.length === 0) return null

    const accent = accentColor === 'orange'
        ? { text: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/30' }
        : { text: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30' }

    return (
        <div className="mt-4 space-y-2">
            {items
                .sort((a, b) => a.exam_type.localeCompare(b.exam_type))
                .map((item) => {
                    const isOpen = openId === item.id
                    const att = toAttachment(item)
                    return (
                        <div
                            key={item.id}
                            className="rounded-xl border border-neutral-100 dark:border-neutral-800 overflow-hidden bg-neutral-50 dark:bg-neutral-950"
                        >
                            {/* Row */}
                            <button
                                onClick={() => setOpenId(isOpen ? null : item.id)}
                                className="w-full flex items-center justify-between p-3 text-left hover:bg-neutral-100 dark:hover:bg-neutral-900 transition"
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className={`p-1 rounded-md ${accent.bg}`}>
                                        <AttachmentIcon att={att} />
                                    </div>
                                    <div className="min-w-0">
                                        <div className={`text-[10px] font-black mb-0.5 ${accent.text}`}>{item.exam_type}</div>
                                        <p className="text-xs font-bold text-neutral-900 dark:text-white truncate max-w-[200px]">
                                            {item.file_name}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[10px] text-neutral-400">
                                        {new Date(item.created_at).toLocaleDateString()}
                                    </span>
                                    {isOpen
                                        ? <ChevronUp className="w-4 h-4 text-neutral-400" />
                                        : <ChevronDown className="w-4 h-4 text-neutral-400" />
                                    }
                                </div>
                            </button>

                            {/* Inline Preview */}
                            {isOpen && (
                                <div className="border-t border-neutral-100 dark:border-neutral-800 p-2">
                                    <FilePreview att={att} />
                                </div>
                            )}
                        </div>
                    )
                })}
        </div>
    )
}
