'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Info } from 'lucide-react';

const V = 343;
const QRD_N = 7;
const QRD_SEQ = [0, 1, 4, 2, 2, 4, 1];
const WELL_W_CM = 7;
const PANEL_MASS = 14; // kg/m² (12mm drywall)

function ProductGuide({ diyTitle, diyContent, commercialTitle, commercialContent }: { diyTitle: string, diyContent: React.ReactNode, commercialTitle: string, commercialContent: React.ReactNode }) {
    return (
        <div className="mt-8 grid md:grid-cols-2 gap-6">
            <div className="bg-slate-800/80 rounded-2xl p-6 border border-slate-700">
                <h4 className="font-extrabold text-white mb-4 flex items-center gap-2">🛠️ {diyTitle}</h4>
                <div className="text-sm text-slate-300 leading-relaxed">
                    {diyContent}
                </div>
            </div>
            <div className="bg-indigo-900/20 rounded-2xl p-6 border border-indigo-500/30">
                <h4 className="font-extrabold text-amber-400 mb-4 flex items-center gap-2">🛒 {commercialTitle}</h4>
                <div className="text-sm text-slate-300 leading-relaxed">
                    {commercialContent}
                </div>
            </div>
        </div>
    );
}

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
                            <div className="text-xs text-slate-400 mt-3 p-3 bg-slate-900/50 rounded-xl border border-slate-700/50">
                                <div className="flex items-start gap-2">
                                    <Info className="w-4 h-4 mt-0.5 text-indigo-400 shrink-0" />
                                    <div className="space-y-1">
                                        <p><b className="text-indigo-300">m = 패널 면밀도 (kg/m²):</b> 1m × 1m 면적의 무게. 진동판이 무거울수록 더 낮은 저음을 잡아냅니다. (예: 12mm 석고보드는 약 14kg/m²)</p>
                                        <p><b className="text-indigo-300">d = 에어 캐비티 (m):</b> 패널 뒤쪽의 빈 공기층 깊이. 깊을수록 더 낮은 저음을 잡습니다.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2 bg-slate-800 rounded-2xl p-5 border border-slate-700">
                            <h3 className="font-extrabold text-white">다공성 코너트랩 (Porous)</h3>
                            <p>암면·유리섬유 등 <b className="text-emerald-300">다공질 재료</b>가 음파 에너지를 열로 변환합니다. <b className="text-emerald-300">코너 설치</b> 시 유효 흡음 두께가 3배 증가해 더 낮은 주파수를 다룰 수 있습니다.</p>
                            <code className="block mt-2 bg-slate-900 px-4 py-2 rounded-xl text-emerald-300 font-mono text-xs">유효 깊이 = λ/4 (코너 시 λ/12)</code>
                            <div className="text-xs text-slate-400 mt-3 p-3 bg-slate-900/50 rounded-xl border border-slate-700/50">
                                <div className="flex items-start gap-2">
                                    <Info className="w-4 h-4 mt-0.5 text-emerald-400 shrink-0" />
                                    <div className="space-y-1">
                                        <p><b className="text-emerald-300">λ (파장):</b> 343 / 주파수. 저주파는 파장이 매우 길기 때문에 두꺼운 두께가 필요합니다. 코너에 설치하면 1/3 두께로도 동일한 효과를 냅니다.</p>
                                        <p><b className="text-emerald-300">흡음재 밀도 (kg/m³):</b> 암면(미네랄울)의 촘촘한 정도. 저음 흡수를 위해서는 <b>100kg/m³ 이상</b>의 단단한 고밀도 제품을 여러 겹 쌓아 사용하는 것을 권장합니다.</p>
                                    </div>
                                </div>
                            </div>
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
                        <div className="text-xs text-slate-400 mt-4 flex items-start gap-2 bg-slate-800/30 p-3 rounded-xl">
                            <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                            <p><b>제작 팁:</b> 멤브레인 트랩의 에어 캐비티(빈 공간) 내부에 50mm 두께의 얇은 암면을 추가로 넣으면, 공진 주파수 대역이 약간 넓어져(Broadband) 더 안정적인 흡음 효과를 얻을 수 있습니다.</p>
                        </div>
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

                    {/* DIY & Commercial Guide for Bass Trap */}
                    <ProductGuide 
                        diyTitle="다공성 코너트랩 DIY 제작 가이드"
                        diyContent={
                            <ul className="space-y-2">
                                <li><b>1. 뼈대(Frame) 제작:</b> 15mm~18mm MDF나 집성목을 사용하여 직각삼각형 구조의 프레임을 짭니다. 전면 폭은 최소 60cm 이상이어야 효과가 좋습니다.</li>
                                <li><b>2. 흡음재 충진:</b> 밀도 60K~100K의 암면(Rockwool/미네랄울)을 삼각형 모양으로 잘라 프레임 안에 층층이 쌓습니다. 빈 공간 없이 꽉 채우는 것이 중요합니다.</li>
                                <li><b>3. 마감 처리:</b> 유리섬유 가루가 날리지 않도록 얇은 비닐로 전체를 감싼 후, 소리가 잘 통과하는 통기성 패브릭(광목천이나 스피커 그릴천)으로 타카를 이용해 팽팽하게 감싸 마감합니다.</li>
                            </ul>
                        }
                        commercialTitle="베이스트랩 기성품 추천"
                        commercialContent={
                            <ul className="space-y-2">
                                <li><b>• GIK Acoustics - Tri-Trap:</b> 전 세계 스튜디오의 표준 코너트랩입니다. 50Hz 이하까지 훌륭한 흡음률을 보이며 코너에 딱 맞는 형태입니다.</li>
                                <li><b>• GIK Acoustics - Soffit Bass Trap:</b> Tri-Trap보다 더 두껍고 강력한 초저역 제어용 트랩입니다.</li>
                                <li><b>• Vicoustic - Super Bass Extreme:</b> 멤브레인(진동판) 기술이 결합되어 중고음역은 살리고 저음역만 효과적으로 잡아냅니다. 우드 마감으로 인테리어 효과가 뛰어납니다.</li>
                                <li><b>• Primacoustic - MaxTrap:</b> 멤브레인 기반의 강력한 코너형 베이스트랩입니다.</li>
                            </ul>
                        }
                    />
                </section>

                {/* ── CEILING CLOUD ── */}
                <section className="bg-slate-900 rounded-3xl p-8 border border-slate-800 space-y-8">
                    <div>
                        <h2 className="text-xl font-black text-white mb-1">☁️ 천장 어쿠스틱 클라우드 (Ceiling Cloud)</h2>
                        <p className="text-slate-400 text-sm">바닥이 딱딱한 반사체(마루, 타일 등)일 경우, 천장은 1차 반사음(First Reflection)을 제어하기 위해 필수적으로 흡음 처리해야 합니다.</p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6 text-sm text-slate-300 leading-relaxed">
                        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-2">
                            <h3 className="font-extrabold text-white">필요성과 작동 원리</h3>
                            <p>스피커에서 나온 소리가 <b>바닥과 천장을 튕기며 만들어내는 콤 필터링(Comb Filtering) 왜곡</b>을 방지합니다. 바닥에 두꺼운 카펫을 까는 것보다 천장에 클라우드를 매달아 흡음하는 것이 스튜디오 음향의 정석입니다.</p>
                            <p>클라우드는 천장과 패널 사이에 <b className="text-sky-300">에어 갭(Air Gap)</b>을 두어 매달기 때문에, 패널 두께보다 훨씬 더 낮은 저음역대까지 흡수할 수 있습니다.</p>
                        </div>
                        <div className="bg-slate-800 rounded-2xl p-5 border border-slate-700 space-y-2">
                            <h3 className="font-extrabold text-white">에어 갭 (Air Gap) 효과</h3>
                            <code className="block bg-slate-900 px-3 py-2 rounded-lg text-sky-300 font-mono text-xs">유효 흡음 깊이 = 패널 두께 + 에어 갭</code>
                            <div className="text-xs text-slate-400 mt-2 p-3 bg-slate-900/50 rounded-xl border border-slate-700/50 flex items-start gap-2">
                                <Info className="w-4 h-4 mt-0.5 text-sky-400 shrink-0" />
                                <p>천장에 딱 붙여 시공하는 것보다 10~20cm 띄워서 와이어로 매달면(Suspend), 뒤쪽 공기층이 흡음재처럼 작용하여 <b>흡음 대역폭이 중저역대까지 크게 확장</b>됩니다.</p>
                            </div>
                        </div>
                    </div>

                    {/* Diagram */}
                    <div className="rounded-2xl overflow-hidden border border-slate-700">
                        <Image src="/ceiling_cloud_diagram.png" alt="어쿠스틱 클라우드 시공 다이어그램" width={900} height={450} className="w-full h-auto" />
                    </div>

                    {/* Cloud Spec Table */}
                    <div>
                        <h3 className="font-extrabold text-white mb-3">📐 에어 갭에 따른 유효 흡음 대역 (권장: 100mm 미네랄울)</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse text-center">
                                <thead>
                                    <tr className="bg-slate-800 text-slate-300">
                                        <th className="px-4 py-3 rounded-tl-xl font-bold">패널 두께</th>
                                        <th className="px-4 py-3 font-bold">에어 갭 (천장과 거리)</th>
                                        <th className="px-4 py-3 font-bold">총 유효 깊이</th>
                                        <th className="px-4 py-3 rounded-tr-xl font-bold text-sky-300">완전 흡음 하한 주파수 (λ/4)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="bg-slate-900">
                                        <td className="px-4 py-3 text-slate-300 font-mono">100 mm</td>
                                        <td className="px-4 py-3 text-slate-300 font-mono">0 mm (밀착)</td>
                                        <td className="px-4 py-3 text-slate-400 font-mono">100 mm</td>
                                        <td className="px-4 py-3 font-mono font-bold text-slate-400">{Math.round(343 / (4 * 0.1))} Hz</td>
                                    </tr>
                                    <tr className="bg-slate-800/50">
                                        <td className="px-4 py-3 text-slate-300 font-mono font-bold">100 mm</td>
                                        <td className="px-4 py-3 text-emerald-300 font-mono font-bold">100 mm 띄움</td>
                                        <td className="px-4 py-3 text-slate-300 font-mono">200 mm</td>
                                        <td className="px-4 py-3 font-mono font-bold text-sky-300">{Math.round(343 / (4 * 0.2))} Hz</td>
                                    </tr>
                                    <tr className="bg-slate-900">
                                        <td className="px-4 py-3 text-slate-300 font-mono font-bold">100 mm</td>
                                        <td className="px-4 py-3 text-emerald-300 font-mono font-bold">200 mm 띄움</td>
                                        <td className="px-4 py-3 text-slate-300 font-mono">300 mm</td>
                                        <td className="px-4 py-3 font-mono font-bold text-sky-300">{Math.round(343 / (4 * 0.3))} Hz</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* DIY & Commercial Guide for Ceiling Cloud */}
                    <ProductGuide 
                        diyTitle="천장 클라우드 DIY 제작 가이드"
                        diyContent={
                            <ul className="space-y-2">
                                <li><b>1. 프레임 뼈대:</b> 가벼운 각재(다루끼)나 얇은 MDF를 이용해 1200mm x 600mm 사이즈의 직사각형 액자 틀을 만듭니다.</li>
                                <li><b>2. 흡음재 삽입:</b> 밀도 40K~60K의 유리섬유 또는 암면 100mm(50mm 2장 겹침)를 틀 안에 넣습니다. 천장에 매달기 때문에 너무 무거운 고밀도 100K는 위험할 수 있습니다.</li>
                                <li><b>3. 와이어 서스펜션:</b> 프레임 뒷면 4모서리에 아이후크(Eye Hook)를 단단히 박고, 천장 콘크리트 앙카에 와이어를 연결하여 스피커와 청취자 사이 1차 반사 지점 천장에 10~20cm 띄워 매답니디.</li>
                            </ul>
                        }
                        commercialTitle="천장 클라우드 기성품 추천"
                        commercialContent={
                            <ul className="space-y-2">
                                <li><b>• GIK Acoustics - 244 Bass Trap:</b> 이름은 베이스트랩이지만 118mm 두께로 천장에 매달아 클라우드로 사용하기에 가장 완벽한 제품입니다. (전용 Cloud Mounting Bracket 옵션 추가)</li>
                                <li><b>• Vicoustic - Flat Panel VMT:</b> 얇고 가벼우며 인테리어 디자인이 매우 뛰어납니다. 단, 저역 흡음보다는 중고역 에코 제어에 특화되어 있습니다.</li>
                                <li><b>• Primacoustic - Stratus:</b> 천장 전용으로 디자인된 어쿠스틱 클라우드 키트입니다. 와이어와 하드웨어가 모두 포함되어 있어 설치가 편리합니다.</li>
                            </ul>
                        }
                    />
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

                    {/* DIY & Commercial Guide for QRD */}
                    <ProductGuide 
                        diyTitle="QRD 확산체 DIY 제작 가이드"
                        diyContent={
                            <ul className="space-y-2">
                                <li><b>1. 정밀 재단:</b> 위 표에 명시된 웰 깊이(cm)에 맞게 나무 칸막이를 정확한 길이로 재단하는 것이 생명입니다. 오차가 생기면 계산된 주파수 확산에 실패합니다.</li>
                                <li><b>2. 소재 선택:</b> 무거운 하드우드나 자작나무 합판을 사용하면 소리 반사 성능이 극대화됩니다. 가벼운 스티로폼이나 스폰지로는 저주파 에너지를 튕겨낼 수 없습니다.</li>
                                <li><b>3. 밀폐 시공:</b> 칸막이(Fin)와 뒷판 사이에 틈이 생기면 소리가 새어나가 흡음이 일어나 버립니다. 목공 풀과 실리콘으로 모든 틈새를 완벽하게 밀폐해야 합니다.</li>
                            </ul>
                        }
                        commercialTitle="디퓨저 기성품 추천"
                        commercialContent={
                            <ul className="space-y-2">
                                <li><b>• Vicoustic - Multifuser Wood:</b> 2D 확산체로, 시각적으로 매우 아름다우며 단단한 원목을 사용하여 뛰어난 확산 성능을 자랑합니다.</li>
                                <li><b>• GIK Acoustics - Q7d Diffusor:</b> 정통적인 수학적 QRD 설계로 만들어진 목재 확산체입니다. 후벽에 설치하기 가장 이상적인 두께와 성능을 가집니다.</li>
                                <li><b>• RPG Diffusor Systems - Omniffusor:</b> 디퓨저의 원조격인 브랜드로, 가장 정확한 수식을 바탕으로 한 하이엔드 스튜디오의 레퍼런스 확산체입니다.</li>
                                <li><b>• Artnovion - Alps Diffuser:</b> 디자인이 수려하고 넓은 대역을 고르게 확산시켜주는 모던한 형태의 디퓨저입니다.</li>
                            </ul>
                        }
                    />
                </section>

                {/* Navigation */}
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-center pb-4">
                    <Link href={backUrl} className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition text-sm">
                        <ArrowLeft className="w-4 h-4" /> 1페이지로 돌아가기
                    </Link>
                    <Link href={`/tools/room-acoustics/resonance?L=${length}&W=${width}&H=${height}`} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition text-sm">
                        3페이지: 공간 경계와 배음(Harmonics) 특성 <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
                <div className="text-center pb-8">
                    <p className="text-slate-600 text-xs self-center">© 김한상 교수 LMS · 룸 어쿠스틱 진단 도구</p>
                </div>
            </div>
        </div>
    );
}
