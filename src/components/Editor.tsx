'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import dynamic from 'next/dynamic'
import 'react-quill-new/dist/quill.snow.css'
import { createClient } from '@/utils/supabase/client'

// Disable SSR for react-quill and forward the ref properly
const ReactQuill = dynamic(async () => {
    const defaultImport = await import('react-quill-new')
    const RQ = defaultImport.default
    const Quill = (defaultImport as any).Quill || (RQ as any).Quill

    if (Quill && !Quill.imports['formats/bookmark']) {
        const BlockEmbed = Quill.import('blots/block/embed')
        class BookmarkBlot extends BlockEmbed {
            static create(value: any) {
                const node = super.create()
                node.setAttribute('contenteditable', 'false')
                // Store data using dataset so it persists on getContents
                node.dataset.url = value.url || ''
                node.dataset.title = value.title || value.domain || ''
                node.dataset.description = value.description || ''
                node.dataset.image = value.image || ''
                node.dataset.domain = value.domain || ''
                
                const titleText = value.title || value.url
                const imageUrl = value.image ? `<div style="width: 30%; min-width: 120px; max-width: 240px; background-image: url('${value.image}'); background-size: cover; background-position: center; border-left: 1px solid #e5e7eb;"></div>` : ''
                
                node.innerHTML = `
                    <a href="${value.url}" target="_blank" class="notion-bookmark" style="display: flex; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; text-decoration: none; color: inherit; margin: 1em 0; background: #fff; max-width: 100%; transition: background 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05); user-select: none; cursor: pointer;">
                        <div style="flex: 1; padding: 16px; display: flex; flex-direction: column; justify-content: center; min-width: 0;">
                            <h3 style="margin: 0 0 8px 0; font-size: 15px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${titleText}</h3>
                            <p style="margin: 0 0 12px 0; font-size: 13px; color: #4B5563; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${value.description || ''}</p>
                            <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: #6B7280;">
                                ${value.domain ? `<img src="https://www.google.com/s2/favicons?domain=${value.domain}&sz=32" style="width: 16px; height: 16px; border-radius: 2px;" alt="favicon" />` : ''}
                                <span>${value.domain || ''}</span>
                            </div>
                        </div>
                        ${imageUrl}
                    </a>
                `
                return node
            }
            static value(node: HTMLElement) {
                return {
                    url: node.dataset.url,
                    title: node.dataset.title,
                    description: node.dataset.description,
                    image: node.dataset.image,
                    domain: node.dataset.domain
                }
            }
        }
        BookmarkBlot.blotName = 'bookmark'
        BookmarkBlot.tagName = 'div'
        BookmarkBlot.className = 'bookmark-wrapper'
        Quill.register(BookmarkBlot, true)
    }

    return function Comp({ forwardedRef, ...props }: any) {
        return <RQ ref={forwardedRef} {...props} />
    }
}, { ssr: false })

export default function RichTextEditor({ placeholder = '내용을 입력하세요...', value: externalValue, onChange }: { placeholder?: string, value?: string, onChange?: (val: string) => void }) {
    const [internalValue, setInternalValue] = useState(externalValue || '')
    const quillRef = useRef<any>(null)
    const [uploading, setUploading] = useState(false)
    const [aiGenerating, setAiGenerating] = useState(false)
    const [bookmarking, setBookmarking] = useState(false)
    const [katexLoaded, setKatexLoaded] = useState(false)

    // Interactive App Insertion State
    const [showAppModal, setShowAppModal] = useState(false)
    const [appCode, setAppCode] = useState('')
    const appSelectionRef = useRef<any>(null)

    // Need a unique toolbar ID if multiple editors are rendered on the same page
    const toolbarId = useMemo(() => `toolbar-${Math.random().toString(36).substring(7)}`, [])
    
    const debounceTimerRef = useRef<any>(null)
    const lastNotifiedValueRef = useRef<string>(externalValue || '')

    // ── KaTeX 주입 (수식 지원용) ──
    useEffect(() => {
        if (typeof window !== 'undefined') {
            if ((window as any).katex) {
                setKatexLoaded(true)
                return
            }

            const fontLink = document.createElement('link')
            fontLink.rel = 'stylesheet'
            fontLink.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css'
            document.head.appendChild(fontLink)

            const script = document.createElement('script')
            script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js'
            script.async = true
            script.onload = () => {
                setKatexLoaded(true)
            }
            document.head.appendChild(script)
        }
    }, [])

    useEffect(() => {
        if (externalValue !== undefined && externalValue !== lastNotifiedValueRef.current && externalValue !== internalValue) {
            setInternalValue(externalValue)
            lastNotifiedValueRef.current = externalValue
        }
    }, [externalValue, internalValue])

    const handleChange = (content: string) => {
        setInternalValue(content)
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = setTimeout(() => {
            lastNotifiedValueRef.current = content
            if (onChange) onChange(content)
        }, 500)
    }

    const formulaHandler = useCallback(() => {
        const quill = quillRef.current?.getEditor()
        if (quill) {
            const range = quill.getSelection(true)
            const value = window.prompt('수식을 입력하세요 (LaTeX):', '')
            if (value) {
                quill.insertEmbed(range.index, 'formula', value)
                quill.setSelection(range.index + 1)
            }
        }
    }, [])

    const imageHandler = useCallback(() => {
        const input = document.createElement('input')
        input.setAttribute('type', 'file')
        input.setAttribute('accept', 'image/*')
        input.click()

        input.onchange = async () => {
            const file = input.files ? input.files[0] : null
            if (!file) return

            setUploading(true)
            const formData = new FormData()
            formData.append('file', file)

            try {
                const res = await fetch('/api/editor-upload', {
                    method: 'POST',
                    body: formData
                })

                if (!res.ok) throw new Error('업로드 실패')

                const data = await res.json()
                if (data.error) throw new Error(data.error)

                const quill = quillRef.current?.getEditor()
                if (quill) {
                    const range = quill.getSelection(true) || { index: quill.getLength() }
                    quill.insertEmbed(range.index, 'image', `/api/proxy-image/${data.fileId}`)
                    quill.setSelection(range.index + 1)
                }
            } catch (error) {
                console.error(error)
                alert('이미지 업로드에 실패했습니다.')
            } finally {
                setUploading(false)
            }
        }
    }, [])

    const aiImageHandler = useCallback(async () => {
        const quill = quillRef.current?.getEditor()
        if (!quill) return
        const selection = quill.getSelection()
        let description = ''
        if (selection && selection.length > 0) {
            description = quill.getText(selection.index, selection.length).trim()
        }
        if (!description) {
            description = window.prompt('이미지로 만들 내용을 입력하세요:') || ''
        }
        if (!description.trim()) return
        setAiGenerating(true)
        try {
            const res = await fetch('/api/generate-visual', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'image', description }),
            })
            const data = await res.json()
            if (data.ok && data.html) {
                const range = selection || { index: quill.getLength() - 1 }
                const insertIndex = selection && selection.length > 0 ? selection.index + selection.length : range.index
                quill.clipboard.dangerouslyPasteHTML(insertIndex, data.html)
                quill.setSelection(insertIndex + 1)
            } else {
                alert('이미지 생성 실패: ' + (data.error || '잠시 후 다시 시도해주세요.'))
            }
        } catch (e) {
            alert('이미지 생성 중 오류가 발생했습니다.')
        } finally {
            setAiGenerating(false)
        }
    }, [])

    const bookmarkHandler = useCallback(async () => {
        const url = window.prompt('북마크로 변환할 링크(URL)를 입력하세요 (예: https://...)')
        if (!url || !url.trim().startsWith('http')) {
            if (url) alert('올바른 URL을 입력해주세요. (http:// 또는 https:// 로 시작해야 합니다)')
            return
        }

        setBookmarking(true)
        try {
            const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url.trim())}`)
            if (!res.ok) throw new Error('메타데이터 가져오기 실패')
            
            const data = await res.json()
            if (data.error) throw new Error(data.error)

            const quill = quillRef.current?.getEditor()
            if (quill) {
                const range = quill.getSelection(true) || { index: quill.getLength() }
                quill.insertEmbed(range.index, 'bookmark', data)
                quill.insertText(range.index + 1, '\n') // 다음 줄로 커서 이동
                quill.setSelection(range.index + 2)
            }
        } catch (error) {
            console.error(error)
            alert('북마크 생성에 실패했습니다. (유효하지 않은 링크이거나 접근이 차단된 사이트일 수 있습니다.)')
        } finally {
            setBookmarking(false)
        }
    }, [])

    const attachmentHandler = useCallback(() => {
        const input = document.createElement('input')
        input.setAttribute('type', 'file')
        input.click()

        input.onchange = async () => {
            const file = input.files ? input.files[0] : null
            if (!file) return

            setUploading(true)
            const formData = new FormData()
            formData.append('file', file)

            try {
                const res = await fetch('/api/editor-upload', {
                    method: 'POST',
                    body: formData
                })

                if (!res.ok) throw new Error('업로드 실패')

                const data = await res.json()
                if (data.error) throw new Error(data.error)

                const quill = quillRef.current?.getEditor()
                if (quill) {
                    const range = quill.getSelection(true) || { index: quill.getLength() }
                    quill.insertText(range.index, `📄 ${file.name}`, 'link', `/api/download/${data.fileId}`)
                    quill.setSelection(range.index + `📄 ${file.name}`.length)
                }
            } catch (error) {
                console.error(error)
                alert('파일 첨부에 실패했습니다.')
            } finally {
                setUploading(false)
            }
        }
    }, [])

    const appHandler = useCallback(() => {
        const quill = quillRef.current?.getEditor()
        if (quill) {
            appSelectionRef.current = quill.getSelection(true) || { index: quill.getLength() }
            setAppCode('')
            setShowAppModal(true)
        }
    }, [])

    const insertAppCode = () => {
        const quill = quillRef.current?.getEditor()
        if (quill && appCode.trim()) {
            const range = appSelectionRef.current
            const textToInsert = `\n\`\`\`html-app\n${appCode.trim()}\n\`\`\`\n`
            quill.insertText(range.index, textToInsert)
            quill.setSelection(range.index + textToInsert.length)
        }
        setShowAppModal(false)
    }

    const modules = useMemo(() => ({
        toolbar: {
            container: `#${toolbarId}`,
            handlers: {
                image: imageHandler,
                attachment: attachmentHandler,
                aiimage: aiImageHandler,
                bookmark: bookmarkHandler,
                formula: formulaHandler,
                app: appHandler,
            }
        },
        table: true,
        clipboard: {
            matchVisual: false
        }
    }), [imageHandler, attachmentHandler, aiImageHandler, bookmarkHandler, formulaHandler, toolbarId])

    const formats = [
        'header', 'font', 'size',
        'bold', 'italic', 'underline', 'strike', 'blockquote',
        'list', 'bullet', 'indent',
        'link', 'bookmark', 'image', 'video', 'color', 'background', 'align',
        'table', 'code-block', 'formula', 'app'
    ]

    return (
        <div className="notion-rich-editor bg-[#fbfbfa] text-neutral-900 rounded-[22px] border border-neutral-200/80 relative flex flex-col resize-y min-h-[560px] min-w-full overflow-hidden shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
            {(uploading || aiGenerating || bookmarking || !katexLoaded) && (
                <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center">
                    <span className="text-sm font-bold text-indigo-600 animate-pulse bg-white px-4 py-2 rounded-xl border border-indigo-100 shadow-sm">
                        {aiGenerating ? '🖼️ AI 이미지 생성 중...' : bookmarking ? '🔗 링크 북마크 생성 중...' : !katexLoaded ? '🧮 수식 엔진 로드 중...' : '파일 업로드 중...'}
                    </span>
                </div>
            )}

            <div id={toolbarId} className="sticky top-0 z-[20] border-b border-neutral-200/80 bg-[#fbfbfa]/95 backdrop-blur flex items-center gap-1 px-4 py-2 flex-wrap">
                <span className="ql-formats">
                    <select className="ql-header" defaultValue={""} onChange={e => Object.isExtensible(e) && e.persist()}>
                        <option value="1">제목 1</option>
                        <option value="2">제목 2</option>
                        <option value="3">제목 3</option>
                        <option value="">본문</option>
                    </select>
                </span>
                <span className="ql-formats">
                    <button className="ql-bold" />
                    <button className="ql-italic" />
                    <button className="ql-underline" />
                    <button className="ql-strike" />
                    <button className="ql-blockquote" />
                </span>
                <span className="ql-formats">
                    <button className="ql-list" value="ordered" />
                    <button className="ql-list" value="bullet" />
                </span>
                <span className="ql-formats">
                    <button className="ql-link" title="일반 링크 삽입" />
                    <button 
                        className="ql-bookmark" 
                        title="노션 스타일 링크 북마크 블록 삽입"
                        style={{ width: 'auto', padding: '0 8px', fontWeight: 600, fontSize: '12px', color: '#525252', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                    >
                        🔖 북마크
                    </button>
                    <button className="ql-image" />
                    <button className="ql-attachment" title="파일 첨부">
                        <svg viewBox="0 0 18 18"><path className="ql-fill" fill="currentColor" d="M11.5,1.5h-5c-1.1,0-2,0.9-2,2v11c0,1.1,0.9,2,2,2h7c1.1,0,2-0.9,2-2v-8L11.5,1.5z M11,3.4L13.6,6H11V3.4z M13.5,15.5h-9v-13h5.5V7h4.5V15.5z"></path></svg>
                    </button>
                    <button className="ql-formula" title="수식 삽입 (LaTeX)" />
                    <button className="ql-clean" />
                </span>
                <span className="ql-formats">
                    <button className="ql-table" title="표 삽입" />
                    <select className="ql-color" title="글자색" />
                    <select className="ql-background" title="배경색" />
                    <select className="ql-align" title="정렬" />
                </span>
                {/* AI 이미지 생성 — 선택 텍스트 기반 */}
                <span className="ql-formats">
                    <button
                        className="ql-aiimage"
                        title="선택한 텍스트로 AI 이미지 생성 후 삽입"
                        style={{ width: 'auto', padding: '0 8px', fontWeight: 700, fontSize: '12px', color: '#6d28d9', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                    >
                        🖼️ AI 이미지
                    </button>
                    <button
                        className="ql-app"
                        title="반응형 HTML/JS 앱 코드 삽입"
                        style={{ width: 'auto', padding: '0 8px', fontWeight: 700, fontSize: '12px', color: '#047857', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                    >
                        🚀 앱 삽입
                    </button>
                </span>
            </div>

            {katexLoaded && (
                <ReactQuill
                    forwardedRef={quillRef}
                    theme="snow"
                    value={internalValue}
                    onChange={handleChange}
                    placeholder={placeholder}
                    modules={modules}
                    formats={formats}
                    className="quill-no-toolbar mb-0 flex-1 flex flex-col"
                />
            )}

            {showAppModal && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 rounded-lg">
                    <div className="bg-white dark:bg-neutral-900 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-neutral-200 dark:border-neutral-800">
                        <div className="px-5 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between bg-neutral-50 dark:bg-neutral-900/50">
                            <h3 className="font-bold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
                                <span>🚀</span> HTML/JS 앱 코드 삽입
                            </h3>
                            <button onClick={() => setShowAppModal(false)} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <div className="p-5 flex-1">
                            <p className="text-xs text-neutral-500 mb-3">
                                아래 영역에 실행할 HTML, CSS, JavaScript 코드를 붙여넣어 주세요. &lt;script&gt; 태그를 사용해 외부 라이브러리(예: Chart.js)도 불러올 수 있습니다.
                            </p>
                            <textarea
                                value={appCode}
                                onChange={(e) => setAppCode(e.target.value)}
                                className="w-full h-64 p-4 font-mono text-sm bg-neutral-900 text-green-400 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                                placeholder="<canvas id='myChart'></canvas>&#10;<script src='https://cdn.jsdelivr.net/npm/chart.js'></script>&#10;<script>&#10;  new Chart(...)&#10;</script>"
                                autoFocus
                            />
                        </div>
                        <div className="px-5 py-4 border-t border-neutral-100 dark:border-neutral-800 flex justify-end gap-2 bg-neutral-50 dark:bg-neutral-900/50">
                            <button
                                onClick={() => setShowAppModal(false)}
                                className="px-4 py-2 rounded-xl text-sm font-bold text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800 transition"
                            >
                                취소
                            </button>
                            <button
                                onClick={insertAppCode}
                                className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition shadow-lg shadow-emerald-500/20"
                            >
                                삽입 및 적용
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .quill-no-toolbar .ql-container.ql-snow {
                    border: none;
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    background: #fbfbfa;
                }
                .quill-no-toolbar .ql-editor {
                    flex: 1;
                    min-height: 560px;
                    max-width: 860px;
                    width: 100%;
                    margin: 0 auto;
                    padding: 34px 44px 72px;
                    font-size: 15px;
                    line-height: 1.78;
                    color: #1f2937;
                    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                }
                .quill-no-toolbar .ql-editor h1 {
                    font-size: 2rem;
                    line-height: 1.22;
                    font-weight: 800;
                    letter-spacing: 0;
                    margin: 0.4rem 0 1rem;
                    color: #111827;
                }
                .quill-no-toolbar .ql-editor h2 {
                    font-size: 1.35rem;
                    line-height: 1.35;
                    font-weight: 750;
                    margin: 1.8rem 0 0.55rem;
                    color: #1f2937;
                }
                .quill-no-toolbar .ql-editor h3 {
                    font-size: 1.05rem;
                    line-height: 1.45;
                    font-weight: 700;
                    margin: 1.35rem 0 0.35rem;
                    color: #374151;
                }
                .quill-no-toolbar .ql-editor p {
                    margin: 0.45rem 0;
                }
                .quill-no-toolbar .ql-editor ul,
                .quill-no-toolbar .ql-editor ol {
                    padding-left: 1.4rem;
                    margin: 0.5rem 0 0.8rem;
                }
                .quill-no-toolbar .ql-editor li {
                    margin: 0.22rem 0;
                }
                .quill-no-toolbar .ql-toolbar {
                    display: none;
                }
                #${toolbarId} {
                    border: none;
                    background: #fbfbfa;
                }
                #${toolbarId} .ql-formats {
                    margin-right: 8px;
                    display: inline-flex;
                    align-items: center;
                    gap: 2px;
                }
                #${toolbarId} button,
                #${toolbarId} .ql-picker-label {
                    border-radius: 7px;
                    color: #525252;
                }
                #${toolbarId} button:hover,
                #${toolbarId} .ql-picker-label:hover {
                    background: #eeeeec;
                    color: #111827;
                }
                #${toolbarId} .ql-picker-options {
                    border-radius: 10px;
                    border-color: #e5e5e2;
                    box-shadow: 0 14px 40px rgba(15,23,42,0.12);
                }
            `}</style>
        </div>
    )
}
