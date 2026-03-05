'use client'

import React, { useState } from 'react'
import dynamic from 'next/dynamic'
import 'react-quill-new/dist/quill.snow.css'

// Disable SSR for react-quill
const ReactQuill = dynamic(() => import('react-quill-new'), { ssr: false })

export default function RichTextEditor({ placeholder = '내용을 입력하세요...', onChange }: { placeholder?: string, onChange?: (val: string) => void }) {
    const [value, setValue] = useState('')

    const handleChange = (content: string) => {
        setValue(content)
        if (onChange) onChange(content)
    }

    const modules = {
        toolbar: [
            [{ header: [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike', 'blockquote'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            ['link', 'image'],
            ['clean'],
        ],
    }

    const formats = [
        'header',
        'bold', 'italic', 'underline', 'strike', 'blockquote',
        'list', 'bullet',
        'link', 'image'
    ]

    return (
        <div className="bg-white text-black rounded-lg overflow-hidden border border-gray-200">
            <ReactQuill
                theme="snow"
                value={value}
                onChange={handleChange}
                placeholder={placeholder}
                modules={modules}
                formats={formats}
                className="h-64 mb-12" // mb-12 to account for quill's absolute positioned toolbar depending on layout, standard gap
            />
        </div>
    )
}
