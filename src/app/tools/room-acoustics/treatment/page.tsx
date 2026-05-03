import { Suspense } from 'react';
import TreatmentClient from './TreatmentClient';

export default async function TreatmentPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
    const resolvedParams = await searchParams;
    const L = parseFloat(resolvedParams.L || '5');
    const W = parseFloat(resolvedParams.W || '4');
    const H = parseFloat(resolvedParams.H || '3');
    const selectedFreqs = resolvedParams.selected
        ? resolvedParams.selected.split(',').map(Number).filter(f => f > 0)
        : [];

    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">로딩 중...</div>}>
            <TreatmentClient length={L} width={W} height={H} selectedFreqs={selectedFreqs} />
        </Suspense>
    );
}
