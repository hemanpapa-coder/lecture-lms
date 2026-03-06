'use client';
import { useState } from 'react';
import Link from 'next/link';
import { getDirectDownloadUrl } from '@/utils/driveUtils';
import {
    FlaskConical, Wrench, Presentation, Upload, CheckCircle2, Trash2,
    Clock, Globe, FileIcon, ArrowLeft, Plus, X, Loader2, ChevronDown, ChevronUp
} from 'lucide-react';
import { useRouter } from 'next/navigation';

const TAGS = [
    { id: '실험', icon: '🧪', color: 'bg-blue-100 text-blue-700' },
    { id: '연구', icon: '📖', color: 'bg-purple-100 text-purple-700' },
    { id: '제작', icon: '🎛️', color: 'bg-emerald-100 text-emerald-700' },
    { id: '발표', icon: '🎙️', color: 'bg-orange-100 text-orange-700' },
    { id: '토론', icon: '💬', color: 'bg-pink-100 text-pink-700' },
];

type Upload = {
    id: string; user_id: string; title: string; description: string; tags: string[];
    file_url: string | null; file_name: string | null; file_size: number;
    is_published: boolean; published_at: string | null; created_at: string;
    users?: { email: string };
};

function TagBadge({ tag }: { tag: string }) {
    const t = TAGS.find(t => t.id === tag);
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${t?.color || 'bg-slate-100 text-slate-600'}`}>
            {t?.icon} {tag}
        </span>
    );
}

function UploadCard({ item, isOwn, onPublish }: { item: Upload; isOwn: boolean; onPublish?: (id: string, publish: boolean) => void }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className={`rounded-2xl border p-5 transition-all ${item.is_published
            ? 'bg-white border-emerald-200 shadow-sm dark:bg-slate-900 dark:border-emerald-800/40'
            : 'bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-800'}`}>
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {item.is_published
                            ? <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><Globe className="w-3 h-3" /> 게시됨</span>
                            : isOwn && <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" /> 검토 중</span>}
                        {item.tags?.map(t => <TagBadge key={t} tag={t} />)}
                    </div>
                    <h3 className="text-base font-extrabold text-slate-900 dark:text-white mb-1">{item.title}</h3>
                    {item.users && (
                        <p className="text-xs text-slate-400 mb-2">{item.users.email}</p>
                    )}
                    {item.description && (
                        <div>
                            <p className={`text-sm text-slate-600 dark:text-slate-400 leading-relaxed ${!expanded ? 'line-clamp-2' : ''}`}>
                                {item.description}
                            </p>
                            {item.description.length > 100 && (
                                <button onClick={() => setExpanded(!expanded)} className="text-xs text-blue-500 hover:underline mt-1 flex items-center gap-1">
                                    {expanded ? <><ChevronUp className="w-3 h-3" /> 접기</> : <><ChevronDown className="w-3 h-3" /> 더보기</>}
                                </button>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                    {onPublish && (
                        <button
                            onClick={() => onPublish(item.id, !item.is_published)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${item.is_published
                                ? 'bg-slate-100 text-slate-600 hover:bg-red-100 hover:text-red-600'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                        >
                            {item.is_published ? '게시 취소' : '게시하기'}
                        </button>
                    )}
                    {(isOwn || onPublish) && (
                        <button
                            onClick={() => {
                                if (confirm('정말 삭제하시겠습니까? 휴지통으로 이동합니다.')) {
                                    fetch('/api/research/delete', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ id: item.id })
                                    }).then(res => {
                                        if (res.ok) window.location.reload();
                                        else alert('삭제 실패');
                                    });
                                }
                            }}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                            title="삭제"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
            {item.file_url && (
                <a
                    href={getDirectDownloadUrl(item.file_url)}
                    download={item.file_name || 'research-file'}
                    target="_blank" rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:underline"
                >
                    <FileIcon className="w-3.5 h-3.5" /> {item.file_name || '첨부파일 보기'}
                    {item.file_size > 0 && <span className="text-slate-400">({(item.file_size / 1024 / 1024).toFixed(1)}MB)</span>}
                </a>
            )}
            <p className="text-xs text-slate-400 mt-2">{new Date(item.created_at).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })} 업로드</p>
        </div>
    );
}

export default function ResearchClient({
    isAdmin, courseId, courseName, myUploads, published, userId,
}: {
    isAdmin: boolean; courseId: string; courseName: string;
    myUploads: Upload[]; published: Upload[]; userId: string;
}) {
    const router = useRouter();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ title: '', description: '', tags: [] as string[], fileUrl: '', fileName: '', fileSize: 0 });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [publishedList, setPublishedList] = useState(published);
    const [myList, setMyList] = useState(myUploads);

    const toggleTag = (tag: string) => setForm(f => ({
        ...f, tags: f.tags.includes(tag) ? f.tags.filter(t => t !== tag) : [...f.tags, tag]
    }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.title.trim()) { setError('제목을 입력하세요.'); return; }
        setSubmitting(true); setError('');
        try {
            const res = await fetch('/api/research/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, courseId }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error);
            setMyList([d.data, ...myList]);
            setForm({ title: '', description: '', tags: [], fileUrl: '', fileName: '', fileSize: 0 });
            setShowForm(false);
        } catch (err: any) { setError(err.message); }
        setSubmitting(false);
    };

    const handlePublish = async (id: string, publish: boolean) => {
        const res = await fetch('/api/research/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, publish }),
        });
        if (res.ok) {
            // Refresh data
            router.refresh();
        }
    };

    // Admin sees all (my uploads = all pending uploads from everyone)
    const pendingForAdmin = isAdmin ? myList.filter(u => !u.is_published) : [];

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans">
            {/* Header */}
            <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 py-5">
                <div className="mx-auto max-w-6xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/" className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition">
                            <ArrowLeft className="w-5 h-5 text-slate-500" />
                        </Link>
                        <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl dark:bg-purple-900/30">
                            <FlaskConical className="w-6 h-6" />
                        </div>
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">오디오테크놀러지</div>
                            <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">연구 자료 레포지터리</h1>
                        </div>
                    </div>
                    {!isAdmin && (
                        <button
                            onClick={() => setShowForm(!showForm)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition text-sm"
                        >
                            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            {showForm ? '취소' : '자료 업로드'}
                        </button>
                    )}
                </div>
            </header>

            <main className="mx-auto max-w-6xl p-8 space-y-10">

                {/* Upload Form */}
                {showForm && !isAdmin && (
                    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-purple-200 dark:border-purple-800/40 p-8 shadow-lg">
                        <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mb-6">새 연구 자료 업로드</h2>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">제목 *</label>
                                <input
                                    type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                    placeholder="연구 제목을 입력하세요"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-400 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">설명 / 요약</label>
                                <textarea
                                    value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    placeholder="연구 내용, 방법, 결론 등을 자유롭게 기술하세요"
                                    rows={5}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-400 text-sm resize-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">태그</label>
                                <div className="flex gap-2 flex-wrap">
                                    {TAGS.map(t => (
                                        <button key={t.id} type="button" onClick={() => toggleTag(t.id)}
                                            className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${form.tags.includes(t.id)
                                                ? 'bg-purple-600 text-white border-purple-600'
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}>
                                            {t.icon} {t.id}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">파일 URL (Google Drive, YouTube 등)</label>
                                <input
                                    type="url" value={form.fileUrl} onChange={e => setForm(f => ({ ...f, fileUrl: e.target.value }))}
                                    placeholder="https://drive.google.com/..."
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-400 text-sm"
                                />
                                <p className="text-xs text-slate-400 mt-1">파일은 Google Drive 등 외부 링크로 첨부하거나 URL 없이 제출 가능합니다.</p>
                            </div>
                            {error && <p className="text-red-500 text-sm">{error}</p>}
                            <button type="submit" disabled={submitting}
                                className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition disabled:opacity-50">
                                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                {submitting ? '제출 중...' : '제출하기'}
                            </button>
                        </form>
                    </div>
                )}

                {/* Admin: Pending Review */}
                {isAdmin && (
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                                📥 검토 대기 중 <span className="text-purple-600">({pendingForAdmin.length})</span>
                            </h2>
                        </div>
                        {pendingForAdmin.length === 0 ? (
                            <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400">
                                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">검토 대기 중인 자료가 없습니다.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {pendingForAdmin.map(item => (
                                    <UploadCard key={item.id} item={item} isOwn={false} onPublish={handlePublish} />
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* Admin: Published management */}
                {isAdmin && publishedList.length > 0 && (
                    <section>
                        <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mb-4">
                            🌐 게시된 자료 <span className="text-emerald-600">({publishedList.length})</span>
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {publishedList.map(item => (
                                <UploadCard key={item.id} item={item} isOwn={false} onPublish={handlePublish} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Student: My Uploads */}
                {!isAdmin && (
                    <section>
                        <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mb-4">
                            내 업로드 <span className="text-slate-400 font-normal text-base">({myList.length})</span>
                        </h2>
                        {myList.length === 0 ? (
                            <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400">
                                <Upload className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">아직 업로드한 자료가 없습니다.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {myList.map(item => (
                                    <UploadCard key={item.id} item={item} isOwn={true} />
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* Published Feed */}
                {!isAdmin && (
                    <section>
                        <h2 className="text-lg font-extrabold text-slate-900 dark:text-white mb-4">
                            🌐 클래스 게시 자료 <span className="text-slate-400 font-normal text-base">({publishedList.length})</span>
                        </h2>
                        {publishedList.length === 0 ? (
                            <div className="text-center py-10 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400">
                                <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">아직 게시된 자료가 없습니다. 교수자가 검토 후 게시합니다.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {publishedList.map(item => (
                                    <UploadCard key={item.id} item={item} isOwn={item.user_id === userId} />
                                ))}
                            </div>
                        )}
                    </section>
                )}
            </main>
        </div>
    );
}
