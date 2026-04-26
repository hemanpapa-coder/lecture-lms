'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight } from 'lucide-react';

const V = 343;
const QRD_N = 7;
const QRD_SEQ = [0, 1, 4, 2, 2, 4, 1];
const WELL_W_CM = 7;
const PANEL_MASS = 14; // kg/m² (12mm drywall)

export default function TreatmentClient({ length, width, height, selectedFreqs = [] }: {
    length: number; width: number; height: number; selectedFreqs?: number[];
}) {
    const modes = useMemo(() => {
        const c = (d: number) => d > 0 ? [1,2,3].map(n => Math.round(n * V / (2 * d) * 10) / 10) : [0,0,0];
        return { L: c(length), W: c(width), H: c(height) };
    }, [length, width, height]);

    const trapSpecs = useMemo(() => {
        if (selectedFreqs.length > 0) {
            // 선택된 공진음 기준으로 계산
            return selectedFreqs.sort((a,b)=>a-b).map(freq => {
                const memD = Math.round(((60 / freq) ** 2 / PANEL_MASS) * 100) / 100;
                const porousD = Math.round(V / (4 * freq) * 100) / 100;
                const cornerD = Math.round(porousD / 3 * 100) / 100;
                return { label: `${freq} Hz`, dim: '선택된 공진음', freq, memD, porousD, cornerD };
            });
        }
        // 선택 없으면 기본 펀더멘털 모드 기준
        return [
            { label: '가로 (L)', dim: `${length}m`, freq: modes.L[0] },
            { label: '세로 (W)', dim: `${width}m`, freq: modes.W[0] },
            { label: '높이 (H)', dim: `${height}m`, freq: modes.H[0] },
        ].map(r => {
            const memD = Math.round(((60 / r.freq) ** 2 / PANEL_MASS) * 100) / 100;
            const porousD = Math.round(V / (4 * r.freq) * 100) / 100;
            const cornerD = Math.round(porousD / 3 * 100) / 100;
            return { ...r, memD, porousD, cornerD };
        });
    }, [modes, length, width, height, selectedFreqs]);

    const w = WELL_W_CM / 100;
    const qrdFMin = Math.round(V / (2 * QRD_N * w));
    const qrdFMax = Math.round(V / (2 * w));
    const wellDepths = QRD_SEQ.map(s => Math.round(s * WELL_W_CM));
    const maxD = Math.max(...wellDepths);
    const totalW = QRD_N * WELL_W_CM;

    const backUrl = `/tools/room-acoustics?L=${length}&W=${width}&H=${height}`;

    return (
        <div className="min-h-screen bg-slate-950 text-white p-6 sm:p-8 font-sans">
            <div className="max-w-4xl mx-auto space-y-10">

                {/* Header */}
                <header className="flex items-center justify-between bg-slate-900 p-6 rounded-3xl border border-slate-800">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-2xl font-black text-white">흡음 · 확산 설계 가이드</h1>
                            <span className="px-3 py-1 bg-indigo-900/50 text-indigo-300 text-xs font-bold rounded-full border border-indigo-800">2페이지</span>
                        </div>
                        <p className="text-slate-400 text-sm">룸 치수 {length}×{width}×{height}m 기반 · 베이스트랩 &amp; QRD 설계</p>
                    {selectedFreqs.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                            <span className="text-xs text-amber-400 font-bold self-center">★ 선택된 공진음 기준:</span>
                            {selectedFreqs.sort((a,b)=>a-b).map(f => (
                                <span key={f} className="px-3 py-1 bg-amber-500/20 text-amber-300 text-xs font-bold rounded-full border border-amber-500/40">{f} Hz</span>
                            ))}
                        </div>
                    )}
                    {selectedFreqs.length === 0 && (
                        <p className="mt-2 text-[11px] text-slate-500">💡 1페이지에서 공진음을 선택하면 해당 주파수 기준으로 설계됩니다</p>
                    )}
                    </div>
                    <Link href={backUrl} className="flex items-center gap-2 text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 px-4 rounded-xl transition">
                        <ArrowLeft className="w-4 h-4" /> 1페이지
                    </Link>
                </header>

                {/* ── BASS TRAP ── */}
                <section className="bg-slate-900 rounded-3xl p-8 border border-slate-800 space-y-8">
                    <div>
                        <h2 className="text-xl font-black text-white mb-1">🔇 베이스트랩 (Bass Trap)</h2>
                        <p className="text-slate-400 text-sm">저주파 정재파(Room Mode)를 흡수하여 부밍(Booming)을 제거하는 음향 처리재입니다.</p>
                    </div>

                    {/* Theory */}
                    <div className="grid md:grid-cols-2 gap-6 text-sm text-slate-300 leading-relaxed">
                        <div className="space-y-2 bg-slate-800 rounded-2xl p-5 border border-slate-700">
                            <h3 className="font-extrabold text-white">멤브레인 트랩 (Membrane)</h3>
                            <p>얇은 <b className="text-indigo-300">진동판(패널)</b>이 저주파 음파를 흡수해 진동 에너지로 변환합니다. 공진 주파수는 패널 질량(m)과 에어 캐비티 깊이(d)로 결정됩니다.</p>
                            <code className="block mt-2 bg-slate-900 px-4 py-2 rounded-xl text-indigo-300 font-mono text-xs">f = 60 / √(m × d)</code>
                            <p className="text-xs text-slate-400">m = 패널 면밀도(kg/m²) · d = 에어 캐비티(m)</p>
                        </div>
                        <div className="space-y-2 bg-slate-800 rounded-2xl p-5 border border-slate-700">
                            <h3 className="font-extrabold text-white">다공성 코너트랩 (Porous)</h3>
                            <p>암면·유리섬유 등 <b className="text-emerald-300">다공질 재료</b>가 음파 에너지를 열로 변환합니다. <b className="text-emerald-300">코너 설치</b> 시 유효 흡음 두께가 3배 증가해 더 낮은 주파수를 다룰 수 있습니다.</p>
                            <code className="block mt-2 bg-slate-900 px-4 py-2 rounded-xl text-emerald-300 font-mono text-xs">유효 깊이 = λ/4 (코너 시 λ/12)</code>
                            <p className="text-xs text-slate-400">λ = 343 / f · 코너 설치 시 1/3 두께로 동일 효과</p>
                        </div>
                    </div>

                    {/* Diagram */}
                    <div className="rounded-2xl overflow-hidden border border-slate-700">
                        <Image src="/bass_trap_diagram.png" alt="베이스트랩 구조 다이어그램" width={900} height={450} className="w-full h-auto" />
                    </div>

                    {/* Spec Table */}
                    <div>
                        <h3 className="font-extrabold text-white mb-3">📐 내 공간 베이스트랩 설계 규격</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="bg-slate-800 text-slate-300">
                                        <th className="px-4 py-3 text-left rounded-tl-xl font-bold">공진 방향</th>
                                        <th className="px-4 py-3 text-center font-bold">1배수 주파수</th>
                                        <th className="px-4 py-3 text-center font-bold">멤브레인 에어 캐비티<br/><span className="text-xs font-normal text-slate-400">12mm 석고보드 기준</span></th>
                                        <th className="px-4 py-3 text-center font-bold">다공성 λ/4 깊이<br/><span className="text-xs font-normal text-slate-400">단독 설치</span></th>
                                        <th className="px-4 py-3 text-center rounded-tr-xl font-bold">다공성 코너 깊이<br/><span className="text-xs font-normal text-slate-400">코너 설치 (권장)</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {trapSpecs.map((r, i) => (
                                        <tr key={i} className={i % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/50'}>
                                            <td className="px-4 py-3 font-bold text-white">{r.label} <span className="text-slate-400 font-normal text-xs">{r.dim}</span></td>
                                            <td className="px-4 py-3 text-center font-mono font-bold text-amber-300">{r.freq} Hz</td>
                                            <td className="px-4 py-3 text-center font-mono text-indigo-300 font-bold">{r.memD} m</td>
                                            <td className="px-4 py-3 text-center font-mono text-slate-300">{r.porousD} m</td>
                                            <td className="px-4 py-3 text-center font-mono text-emerald-300 font-bold">{r.cornerD} m</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-xs text-slate-500 mt-3">* 멤브레인: 에어 캐비티 내부에 선택적으로 50mm 암면 삽입 시 광대역 흡음 효과 증가 · 다공성: 100kg/m³ 이상 암면 권장</p>
                    </div>

                    {/* Corner placement SVG */}
                    <div>
                        <h3 className="font-extrabold text-white mb-3">🏠 코너 배치 권장 위치</h3>
                        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                            <svg viewBox="0 0 400 245" className="w-full max-w-lg mx-auto">
                                {/* Legend */}
                                <rect x="20" y="6" width="14" height="14" fill="#6366f1" rx="2"/>
                                <text x="40" y="18" fill="#a5b4fc" fontSize="11">베이스트랩 권장 위치 (4코너)</text>

                                {/* Room outline */}
                                <rect x="60" y="35" width="280" height="180" fill="none" stroke="#475569" strokeWidth="2" rx="4"/>

                                {/* Corner traps */}
                                <polygon points="60,35 96,35 60,71"  fill="#6366f1" opacity="0.85"/>
                                <polygon points="340,35 304,35 340,71"  fill="#6366f1" opacity="0.85"/>
                                <polygon points="60,215 96,215 60,179"  fill="#6366f1" opacity="0.85"/>
                                <polygon points="340,215 304,215 340,179" fill="#6366f1" opacity="0.85"/>

                                {/* Center label */}
                                <text x="200" y="123" textAnchor="middle" fill="#94a3b8" fontSize="13" fontWeight="bold">스튜디오 공간</text>
                                <text x="200" y="141" textAnchor="middle" fill="#64748b" fontSize="11">{length}m × {width}m</text>
                            </svg>
                        </div>
                    </div>
                </section>

                {/* ── QRD ── */}
                <section className="bg-slate-900 rounded-3xl p-8 border border-slate-800 space-y-8">
                    <div>
                        <h2 className="text-xl font-black text-white mb-1">🎛 QRD 확산체 (Quadratic Residue Diffuser)</h2>
                        <p className="text-slate-400 text-sm">이차잉여수열(Quadratic Residue Sequence)을 기반으로 웰(Well) 깊이를 설계하여, 반사음을 넓은 각도로 고르게 확산시키는 음향 패널입니다.</p>
                    </div>

                    {/* Theory */}
                    <div className="grid md:grid-cols-2 gap-6 text-sm text-slate-300 leading-relaxed">
                        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-2">
                            <h3 className="font-extrabold text-white">작동 원리</h3>
                            <p>각 웰(Well)의 깊이 차이로 인해 반사음의 <b className="text-purple-300">위상(Phase)이 달라지고</b>, 이 위상차가 서로 상쇄·간섭하여 에너지를 넓은 범위로 확산시킵니다.</p>
                            <p>이차잉여수열(s<sub>n</sub> = n² mod N)을 사용하면 이론적으로 <b className="text-purple-300">완전 균일한 에너지 분포</b>를 달성할 수 있습니다.</p>
                        </div>
                        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-2">
                            <h3 className="font-extrabold text-white">설계 공식</h3>
                            <code className="block bg-slate-900 px-3 py-2 rounded-lg text-purple-300 font-mono text-xs">sₙ = n² mod N (N = 소수)</code>
                            <code className="block bg-slate-900 px-3 py-2 rounded-lg text-purple-300 font-mono text-xs">웰 깊이 dₙ = sₙ × w</code>
                            <code className="block bg-slate-900 px-3 py-2 rounded-lg text-purple-300 font-mono text-xs">f_min = c / (2·N·w) · f_max = c / (2·w)</code>
                            <p className="text-xs text-slate-400">N = 소수(7 또는 11) · w = 웰 폭(m) · c = 343m/s</p>
                        </div>
                    </div>

                    {/* Diagram */}
                    <div className="rounded-2xl overflow-hidden border border-slate-700">
                        <Image src="/qrd_diffuser_diagram.png" alt="QRD 확산체 구조 다이어그램" width={900} height={450} className="w-full h-auto" />
                    </div>

                    {/* QRD Spec Table */}
                    <div>
                        <h3 className="font-extrabold text-white mb-1">📐 QRD-7 설계 규격 <span className="text-sm text-slate-400 font-normal">(웰 폭 {WELL_W_CM}cm 기준)</span></h3>
                        <p className="text-xs text-slate-400 mb-4">확산 유효 범위: <span className="text-purple-300 font-bold">{qrdFMin} Hz ~ {qrdFMax} Hz</span> · 전체 폭: <span className="text-white font-bold">{totalW} cm</span> · 최대 깊이: <span className="text-white font-bold">{maxD} cm</span></p>

                        <div className="overflow-x-auto mb-6">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="bg-slate-800 text-slate-300">
                                        <th className="px-3 py-3 text-center font-bold rounded-tl-xl">웰 번호</th>
                                        {QRD_SEQ.map((_,i) => <th key={i} className={`px-3 py-3 text-center font-bold ${i===QRD_N-1?'rounded-tr-xl':''}`}>{i+1}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="bg-slate-900">
                                        <td className="px-3 py-3 text-center text-slate-400 font-bold">수열값 sₙ</td>
                                        {QRD_SEQ.map((s,i) => <td key={i} className="px-3 py-3 text-center font-mono text-amber-300 font-bold">{s}</td>)}
                                    </tr>
                                    <tr className="bg-slate-800/50">
                                        <td className="px-3 py-3 text-center text-slate-400 font-bold">깊이 (cm)</td>
                                        {wellDepths.map((d,i) => <td key={i} className="px-3 py-3 text-center font-mono text-purple-300 font-bold">{d}</td>)}
                                    </tr>
                                    <tr className="bg-slate-900">
                                        <td className="px-3 py-3 text-center text-slate-400 font-bold">폭 (cm)</td>
                                        {QRD_SEQ.map((_,i) => <td key={i} className="px-3 py-3 text-center font-mono text-slate-300">{WELL_W_CM}</td>)}
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Dynamic well depth bar chart SVG */}
                        <h4 className="text-sm font-bold text-slate-300 mb-3">웰 깊이 단면도 (실제 비율)</h4>
                        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                            <svg viewBox={`0 0 ${QRD_N * 60 + 40} 200`} className="w-full max-w-2xl mx-auto">
                                {wellDepths.map((d, i) => {
                                    const barH = maxD > 0 ? Math.round((d / maxD) * 140) : 0;
                                    const x = 20 + i * 60;
                                    const y = 160 - barH;
                                    const colors = ['#818cf8','#a78bfa','#c084fc','#e879f9','#c084fc','#a78bfa','#818cf8'];
                                    return (
                                        <g key={i}>
                                            <rect x={x} y={y} width="50" height={barH} fill={colors[i]} opacity="0.85" rx="3"/>
                                            <text x={x+25} y="175" textAnchor="middle" fill="#e2e8f0" fontSize="11" fontWeight="bold">{d}cm</text>
                                            <text x={x+25} y="190" textAnchor="middle" fill="#64748b" fontSize="10">W{i+1}</text>
                                        </g>
                                    );
                                })}
                                <line x1="20" y1="160" x2={20 + QRD_N * 60} y2="160" stroke="#475569" strokeWidth="1.5"/>
                            </svg>
                        </div>

                        {/* Material guide */}
                        <div className="mt-6 grid md:grid-cols-2 gap-4">
                            <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 text-sm">
                                <p className="font-extrabold text-white mb-2">🪵 제작 재료 (권장)</p>
                                <ul className="space-y-1 text-slate-300">
                                    <li>• <b>격막(Fin):</b> 9mm 합판 또는 MDF</li>
                                    <li>• <b>바닥/뒷판:</b> 18mm MDF</li>
                                    <li>• <b>마감:</b> 검정 패브릭 래핑 또는 오크 무늬목</li>
                                    <li>• <b>패널 크기:</b> {totalW}cm(폭) × {maxD}cm(깊이) × 가변(높이)</li>
                                </ul>
                            </div>
                            <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700 text-sm">
                                <p className="font-extrabold text-white mb-2">📍 설치 위치 권장</p>
                                <ul className="space-y-1 text-slate-300">
                                    <li>• <b>리스닝 포인트 후벽:</b> 주 반사면 확산</li>
                                    <li>• <b>측벽 첫 반사점:</b> 스테레오 이미지 개선</li>
                                    <li>• 베이스트랩(코너)과 조합 시 최적</li>
                                    <li>• 귀 높이 중심으로 설치</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Navigation */}
                <div className="flex justify-between pb-4">
                    <Link href={backUrl} className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition text-sm">
                        <ArrowLeft className="w-4 h-4" /> 1페이지로 돌아가기
                    </Link>
                    <p className="text-slate-600 text-xs self-center">© 김한상 교수 LMS · 룸 어쿠스틱 진단 도구</p>
                </div>
            </div>
        </div>
    );
}
