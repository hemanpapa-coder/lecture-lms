'use client';

import { useState } from 'react';
import { Database, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SeedDataManager() {
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleAction = async (action: 'seed' | 'reset') => {
        if (action === 'reset') {
            if (!window.confirm('모든 더미 학생 데이터와 과제 기록이 삭제됩니다. 계속하시겠습니까?')) return;
        }

        setLoading(true);
        try {
            const res = await fetch('/api/seed', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'API Error');

            alert(data.message);
            router.refresh();
        } catch (err: any) {
            alert('오류 발생: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-indigo-50 dark:bg-indigo-950/30 rounded-3xl p-6 border border-indigo-100 dark:border-indigo-900/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h4 className="font-bold text-indigo-900 dark:text-indigo-300 mb-1 flex items-center gap-2">
                        <Database className="w-5 h-5" />
                        테스트 더미 데이터 관리
                    </h4>
                    <p className="text-sm text-indigo-700 dark:text-indigo-400/80">
                        버튼을 눌러 가상의 학생 데이터 20명과 임의의 제출 과제 내역을 생성하거나 일괄 삭제할 수 있습니다.
                    </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <button
                        onClick={() => handleAction('reset')}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-white text-red-600 hover:bg-neutral-50 rounded-lg shadow-sm border border-red-100 transition disabled:opacity-50 dark:bg-neutral-900 dark:border-neutral-800"
                    >
                        <Trash2 className="w-4 h-4" /> 초기화
                    </button>
                    <button
                        onClick={() => handleAction('seed')}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg shadow-sm transition disabled:opacity-50"
                    >
                        + 더미 20명 주입
                    </button>
                </div>
            </div>
        </div>
    );
}
