import { Suspense } from 'react';
import ResonanceClient from './ResonanceClient';

export default function ResonancePage({ searchParams }: { searchParams: Record<string, string> }) {
    const L = parseFloat(searchParams.L || '5');
    const W = parseFloat(searchParams.W || '4');
    const H = parseFloat(searchParams.H || '3');

    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">로딩 중...</div>}>
            <ResonanceClient length={L} width={W} height={H} />
        </Suspense>
    );
}
