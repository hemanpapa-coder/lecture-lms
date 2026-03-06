'use client';
import { useState, useEffect } from 'react';
import { Trash2, RotateCcw, Loader2, AlertCircle, FileText, Upload, Database } from 'lucide-react';

export default function RecycleBin() {
    const [data, setData] = useState<{ archives: any[], assignments: any[], research: any[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionId, setActionId] = useState<string | null>(null);

    const fetchDeleted = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/recycle-bin');
            const d = await res.json();
            setData(d);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDeleted();
    }, []);

    const handleAction = async (type: string, id: string, action: 'restore' | 'purge') => {
        if (action === 'purge' && !confirm('정말 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

        setActionId(id);
        try {
            await fetch('/api/admin/recycle-bin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, type, id }),
            });
            fetchDeleted();
        } catch (err) {
            alert('처리 중 오류가 발생했습니다.');
        } finally {
            setActionId(null);
        }
    };

    if (loading && !data) return <div className="py-20 text-center text-slate-400"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" /> 로딩 중...</div>;

    const isEmpty = !data?.archives.length && !data?.assignments.length && !data?.research.length;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-3xl p-6 border border-amber-100 dark:border-amber-900/50 flex gap-4 items-start">
                <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-1" />
                <div>
                    <h4 className="font-bold text-amber-900 dark:text-amber-300 mb-1">휴지통 관리</h4>
                    <p className="text-sm text-amber-700 dark:text-amber-400/80">
                        삭제된 자료들은 여기에 임시 보관됩니다. '복구'를 누르면 원래 위치로 돌아가며, '영구 삭제' 시 구글 드라이브에서도 완전히 삭제됩니다.
                    </p>
                </div>
            </div>

            {isEmpty ? (
                <div className="py-20 text-center text-slate-400 bg-white dark:bg-neutral-900 rounded-3xl border border-dashed border-slate-200 dark:border-neutral-800">
                    <Trash2 className="w-12 h-12 mx-auto mb-4 opacity-10" />
                    <p className="font-bold">비어 있음</p>
                    <p className="text-sm">삭제된 항목이 없습니다.</p>
                </div>
            ) : (
                <div className="grid gap-6">
                    {/* Archives Section */}
                    {data.archives.length > 0 && (
                        <Section title="공용 자료" items={data.archives} type="archives" onAction={handleAction} actionId={actionId} icon={<FileText className="w-5 h-5" />} />
                    )}
                    {/* Assignments Section */}
                    {data.assignments.length > 0 && (
                        <Section title="학생 과제" items={data.assignments} type="assignments" onAction={handleAction} actionId={actionId} icon={<Upload className="w-5 h-5" />} />
                    )}
                    {/* Research Section */}
                    {data.research.length > 0 && (
                        <Section title="연구 자료" items={data.research} type="research_uploads" onAction={handleAction} actionId={actionId} icon={<Database className="w-5 h-5" />} />
                    )}
                </div>
            )}
        </div>
    );
}

function Section({ title, items, type, onAction, actionId, icon }: any) {
    return (
        <div className="bg-white dark:bg-neutral-900 rounded-3xl overflow-hidden border border-neutral-200 dark:border-neutral-800 shadow-sm">
            <div className="px-6 py-4 bg-slate-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
                {icon}
                <h3 className="font-bold text-slate-900 dark:text-white">{title} ({items.length})</h3>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-neutral-800">
                {items.map((item: any) => (
                    <div key={item.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-neutral-800/20 transition">
                        <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-900 dark:text-white truncate">{item.title || item.file_name || '이름 없음'}</div>
                            <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                                <span>{item.users?.name || '시스템'}</span>
                                <span>•</span>
                                <span>삭제일: {new Date(item.deleted_at).toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                            <button
                                onClick={() => onAction(type, item.id, 'restore')}
                                disabled={actionId === item.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 text-xs font-bold hover:bg-indigo-100 transition"
                            >
                                <RotateCcw className="w-3.5 h-3.5" /> 복구
                            </button>
                            <button
                                onClick={() => onAction(type, item.id, 'purge')}
                                disabled={actionId === item.id}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 text-xs font-bold hover:bg-red-100 transition"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> 영구 삭제
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
