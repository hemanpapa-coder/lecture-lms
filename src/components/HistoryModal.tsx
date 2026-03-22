'use client';
import { useState, useEffect } from 'react';
import { History, X, RotateCcw, Loader2, Clock, User } from 'lucide-react';

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

    useEffect(() => {
        if (isOpen) {
            fetchHistory();
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
        if (!confirm('이 버전으로 복구하시겠습니까? 현재 내용은 새 버전으로 저장됩니다.')) return;

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
            alert('복구 중 오류가 발생했습니다.');
        } finally {
            setRestoringId(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-neutral-900 w-full max-w-2xl max-h-[80vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-neutral-200 dark:border-neutral-800">
                <div className="px-6 py-5 border-b border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <History className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">편집 히스토리</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-neutral-800 rounded-xl transition">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {loading ? (
                        <div className="py-20 text-center text-slate-400"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" /> 로딩 중...</div>
                    ) : history.length === 0 ? (
                        <div className="py-20 text-center text-slate-400">저장된 히스토리가 없습니다.</div>
                    ) : (
                        history.map((item) => (
                            <div key={item.id} className="group p-4 rounded-2xl border border-neutral-100 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-800/30 transition flex items-start justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                        <Clock className="w-3.5 h-3.5 text-neutral-400" />
                                        {new Date(item.created_at).toLocaleString()}
                                    </div>
                                    <div className="text-xs text-neutral-500 flex items-center gap-2">
                                        <User className="w-3 h-3" />
                                        {item.users?.name || '시스템'} • {item.version_label}
                                    </div>
                                    <div className="mt-2 p-3 bg-neutral-100 dark:bg-neutral-800 rounded-xl text-[10px] text-neutral-500 font-mono line-clamp-2 overflow-hidden">
                                        {item.content.replace(/<[^>]*>/g, '').slice(0, 100)}...
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleRestore(item)}
                                    disabled={restoringId === item.id}
                                    className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 dark:shadow-none"
                                >
                                    {restoringId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                    복원
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
