import { Suspense } from 'react';
import TreatmentClient from './TreatmentClient';

export default function TreatmentPage({ searchParams }: { searchParams: Record<string, string> }) {
    const L = parseFloat(searchParams.L || '5');
    const W = parseFloat(searchParams.W || '4');
    const H = parseFloat(searchParams.H || '3');
    const selectedFreqs = searchParams.selected
        ? searchParams.selected.split(',').map(Number).filter(f => f > 0)
        : [];

    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">로딩 중...</div>}>
            <TreatmentClient length={L} width={W} height={H} selectedFreqs={selectedFreqs} />
        </Suspense>
    );
}
