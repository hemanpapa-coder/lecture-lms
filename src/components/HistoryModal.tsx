'use client';
import { useState, useEffect } from 'react';
import { History, X, RotateCcw, Loader2, Clock, User, ChevronRight } from 'lucide-react';

// ── 마크다운 → HTML 변환 (기존 DB 데이터 호환성) ────────────────────
function ensureHtml(content: string): string {
  if (!content) return ''
  if (/<(h[1-6]|p|ul|ol|li|div|strong|em|br|table|blockquote)\b/i.test(content)) return content
  const hasMarkdown = /^#{1,6}\s|\*\*|^[-*+]\s|^\d+\.\s/m.test(content)
  if (!hasMarkdown) {
    return content.split(/\n{2,}/).map(para => {
      const line = para.trim()
      return line ? '<p>' + line.replace(/\n/g, '<br/>') + '</p>' : ''
    }).filter(Boolean).join('\n')
  }
  let html = content
  html = html.replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
  html = html.replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>')
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/(^|\n)((?:[ \t]*[-*+] .+\n?)+)/g, (_m: string, pre: string, block: string) => {
    const items = block.replace(/\n$/, '').split('\n').map((line: string) =>
      '<li>' + line.replace(/^[ \t]*[-*+] /, '') + '</li>'
    ).join('')
    return pre + '<ul>' + items + '</ul>'
  })
  html = html.replace(/(^|\n)((?:[ \t]*\d+\. .+\n?)+)/g, (_m: string, pre: string, block: string) => {
    const items = block.replace(/\n$/, '').split('\n').map((line: string) =>
      '<li>' + line.replace(/^[ \t]*\d+\. /, '') + '</li>'
    ).join('')
    return pre + '<ol>' + items + '</ol>'
  })
  html = html.replace(/^---+$/gm, '<hr/>')
  html = html.replace(/^(?!<[a-zA-Z\/])(.+)$/gm, '<p>$1</p>')
  html = html.replace(/\n{3,}/g, '\n\n').trim()
  return html
}

interface HistoryItem {
    id: string;
    content: string;
    version_label: string;
    created_at: string;
    users?: { name: string };
}

export default function HistoryModal({
    isOpen,
    onClose,
    entityId,
    entityType,
    onRestore,
}: {
    isOpen: boolean;
    onClose: () => void;
    entityId: string;
    entityType: string;
    onRestore: (content: string) => void;
}) {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [restoringId, setRestoringId] = useState<string | null>(null);
    const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchHistory();
            setSelectedItem(null);
        }
    }, [isOpen, entityId]);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/content-history?entityId=${entityId}&entityType=${entityType}`);
            const d = await res.json();
            setHistory(d.history || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleRestore = async (item: HistoryItem) => {
        if (!confirm('이 버전으로 복원하시겠습니까? 현재 내용은 새 버전으로 저장됩니다.')) return;

        setRestoringId(item.id);
        try {
            const res = await fetch('/api/content-history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ historyId: item.id }),
            });
            if (!res.ok) throw new Error();
            onRestore(item.content);
            onClose();
        } catch (err) {
            alert('복원 중 오류가 발생했습니다.');
        } finally {
            setRestoringId(null);
        }
    };

    if (!isOpen) return null;

    const hasPreview = !!selectedItem;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            {/* 모달 — 미리보기 선택시 넓어짐 */}
            <div
                className="bg-white dark:bg-neutral-900 w-full max-h-[88vh] rounded-3xl shadow-2xl overflow-hidden flex border border-neutral-200 dark:border-neutral-800 transition-all duration-300"
                style={{ maxWidth: hasPreview ? '1100px' : '640px' }}
            >
                {/* ── 왼쪽: 히스토리 목록 ── */}
                <div className="flex flex-col" style={{ minWidth: '340px', width: hasPreview ? '340px' : '100%' }}>
                    {/* 헤더 */}
                    <div className="px-6 py-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between flex-shrink-0">
                        <div className="flex items-center gap-2">
                            <History className="w-5 h-5 text-indigo-600" />
                            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">편집 히스토리</h2>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-xl transition">
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>

                    {/* 목록 */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {loading ? (
                            <div className="py-20 text-center text-slate-400"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" /> 로딩 중...</div>
                        ) : history.length === 0 ? (
                            <div className="py-20 text-center text-slate-400">저장된 히스토리가 없습니다.</div>
                        ) : (
                            history.map((item) => {
                                const isSelected = selectedItem?.id === item.id
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => setSelectedItem(isSelected ? null : item)}
                                        className={`group p-4 rounded-2xl border cursor-pointer transition-all ${
                                            isSelected
                                                ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 dark:border-indigo-600'
                                                : 'border-neutral-100 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-800/30'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="space-y-1 min-w-0 flex-1">
                                                <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-sm">
                                                    <Clock className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                                                    {new Date(item.created_at).toLocaleString()}
                                                </div>
                                                <div className="text-xs text-neutral-500 flex items-center gap-2">
                                                    <User className="w-3 h-3 flex-shrink-0" />
                                                    {item.users?.name || '시스템'} • {item.version_label}
                                                </div>
                                            </div>
                                            <ChevronRight className={`w-4 h-4 flex-shrink-0 mt-0.5 transition-transform ${isSelected ? 'rotate-90 text-indigo-500' : 'text-neutral-300'}`} />
                                        </div>
                                        {/* 미리보기 텍스트 스니펫 */}
                                        <div className="mt-2 p-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl text-[10px] text-neutral-500 font-mono line-clamp-2">
                                            {item.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)}...
                                        </div>
                                        {/* 복원 버튼 — 선택된 항목에만 표시 */}
                                        {isSelected && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleRestore(item); }}
                                                disabled={restoringId === item.id}
                                                className="mt-3 w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 dark:shadow-none disabled:opacity-60"
                                            >
                                                {restoringId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                                이 버전으로 복원
                                            </button>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>

                {/* ── 오른쪽: 콘텐츠 미리보기 패널 ── */}
                {hasPreview && (
                    <div className="flex-1 flex flex-col border-l border-neutral-200 dark:border-neutral-800 min-w-0">
                        {/* 미리보기 헤더 */}
                        <div className="px-6 py-4 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between flex-shrink-0 bg-slate-50 dark:bg-neutral-950">
                            <div>
                                <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide">미리보기</p>
                                <p className="text-sm font-semibold text-slate-800 dark:text-white mt-0.5">
                                    {new Date(selectedItem.created_at).toLocaleString()}
                                </p>
                                <p className="text-xs text-neutral-500">{selectedItem.users?.name || '시스템'} • {selectedItem.version_label}</p>
                            </div>
                        </div>

                        {/* 미리보기 본문 */}
                        <div className="flex-1 overflow-y-auto p-6">
                            <div
                                className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: ensureHtml(selectedItem.content) }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
