"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export function InputClient() {
    const router = useRouter();

    const [length, setLength] = useState('5.0');
    const [width, setWidth] = useState('4.0');
    const [height, setHeight] = useState('2.5');
    const [wallMaterial, setWallMaterial] = useState('concrete');
    const [floorMaterial, setFloorMaterial] = useState('concrete');
    const [ceilingMaterial, setCeilingMaterial] = useState('concrete');

    const handleNext = () => {
        router.push(`/tools/room-acoustics/measure?L=${length}&W=${width}&H=${height}&mat=${wallMaterial}&floorMat=${floorMaterial}&ceilMat=${ceilingMaterial}`);
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 sm:p-8 font-sans">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-10 shadow-sm border border-slate-200 dark:border-slate-800 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
                    
                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <span className="px-3 py-1 text-xs font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 rounded-full">
                                    Acoustics Step 1
                                </span>
                                <span className="px-3 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 rounded-full flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    입력 페이지
                                </span>
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                                룸 어쿠스틱 시뮬레이터 <span className="text-indigo-500">입력</span>
                            </h1>
                            <p className="mt-3 text-slate-600 dark:text-slate-400 text-sm sm:text-base max-w-2xl">
                                방의 물리적 크기(가로/세로/높이)와 벽면 재질을 입력하여 룸 모드 분석 및 시뮬레이션을 시작하세요.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Progress Steps UI */}
                <div className="flex items-center justify-center space-x-4 mb-8">
                    <div className="flex flex-col items-center">
                        <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold shadow-lg shadow-indigo-500/30">1</div>
                        <span className="text-xs mt-2 font-semibold text-indigo-600 dark:text-indigo-400">입력</span>
                    </div>
                    <div className="w-16 h-1 bg-slate-300 dark:bg-slate-700 rounded"></div>
                    <div className="flex flex-col items-center opacity-50">
                        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 flex items-center justify-center font-bold">2</div>
                        <span className="text-xs mt-2 font-semibold text-slate-500">측정</span>
                    </div>
                    <div className="w-16 h-1 bg-slate-300 dark:bg-slate-700 rounded"></div>
                    <div className="flex flex-col items-center opacity-50">
                        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 flex items-center justify-center font-bold">3</div>
                        <span className="text-xs mt-2 font-semibold text-slate-500">시뮬레이션</span>
                    </div>
                </div>

                {/* Section 1: Dimensions Input */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                            📏
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">공간 제원 입력 (Room Dimensions & Materials)</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex justify-between">
                                가로 (Length)
                                <span className="text-slate-400 font-normal">미터 (m)</span>
                            </label>
                            <input 
                                type="number" 
                                value={length} 
                                onChange={(e) => setLength(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-sm"
                                step="0.1"
                                min="2"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex justify-between">
                                세로 (Width)
                                <span className="text-slate-400 font-normal">미터 (m)</span>
                            </label>
                            <input 
                                type="number" 
                                value={width} 
                                onChange={(e) => setWidth(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-sm"
                                step="0.1"
                                min="2"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex justify-between">
                                높이 (Height)
                                <span className="text-slate-400 font-normal">미터 (m)</span>
                            </label>
                            <input 
                                type="number" 
                                value={height} 
                                onChange={(e) => setHeight(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-sm"
                                step="0.1"
                                min="2"
                            />
                        </div>
                    </div>

                    <div className="w-full h-px bg-slate-100 dark:bg-slate-800 my-6"></div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex justify-between">
                                벽면 재질
                                <span className="text-slate-400 font-normal">주요 마감재</span>
                            </label>
                            <select 
                                value={wallMaterial}
                                onChange={(e) => setWallMaterial(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-sm cursor-pointer"
                            >
                                <option value="wallpaper_drywall">석고보드 위 벽지 (일반 주택/아파트)</option>
                                <option value="concrete">콘크리트 (Concrete - 반사율 높음)</option>
                                <option value="wood">목재 (Wood - 부드러운 반사)</option>
                                <option value="glass">유리 (Glass - 고음역 강한 반사)</option>
                                <option value="drywall">석고보드 (Drywall - 저음역 흡수)</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex justify-between">
                                바닥재
                                <span className="text-slate-400 font-normal">주요 마감재</span>
                            </label>
                            <select 
                                value={floorMaterial}
                                onChange={(e) => setFloorMaterial(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-sm cursor-pointer"
                            >
                                <option value="laminate">강마루/강화마루 (일반 아파트/주택)</option>
                                <option value="linoleum">장판 (일반 주택/원룸)</option>
                                <option value="concrete">콘크리트/에폭시 (단단함)</option>
                                <option value="wood">원목 마루 (중간 반사)</option>
                                <option value="carpet">카펫 (고음역 흡수)</option>
                                <option value="tile">타일/대리석 (반사율 매우 높음)</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex justify-between">
                                천장재
                                <span className="text-slate-400 font-normal">주요 마감재</span>
                            </label>
                            <select 
                                value={ceilingMaterial}
                                onChange={(e) => setCeilingMaterial(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all shadow-sm cursor-pointer"
                            >
                                <option value="wallpaper_ceiling">석고보드 위 천장지 (일반 주택/아파트)</option>
                                <option value="concrete">노출 콘크리트 (반사율 높음)</option>
                                <option value="gypsum">석고 텍스 (일반 사무실)</option>
                                <option value="wood">목재 루버 (부드러운 반사)</option>
                                <option value="acoustic">흡음 텍스 (마이톤 등)</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Theory Section */}
                <div className="bg-slate-900 rounded-2xl p-6 sm:p-8 border border-slate-800 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                    <div className="relative z-10 flex flex-col lg:flex-row gap-8 items-center">
                        <div className="lg:w-2/3 space-y-4">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                💡 룸 어쿠스틱 이론 요약
                            </h3>
                            <p className="text-slate-300 text-sm leading-relaxed">
                                소리는 벽을 만나면 반사되며, 특정 파장(주파수)이 방의 크기와 맞아떨어질 때 소리가 증폭되거나 사라지는 현상이 발생합니다. 이를 <strong>룸 모드(Room Modes)</strong> 또는 정재파(Standing Wave)라고 합니다.
                            </p>
                            <ul className="text-sm text-slate-400 space-y-2 list-disc list-inside">
                                <li><strong>저음역 제어(Bass Traps):</strong> 모서리에 설치하여 부밍(Booming) 현상을 줄입니다.</li>
                                <li><strong>1차 반사음 제어(Early Reflections):</strong> 스피커와 청취자 사이의 벽면에 흡음재를 배치하여 명료도를 높입니다.</li>
                                <li><strong>후면 확산(Diffusion):</strong> 방 뒤쪽에 디퓨저를 설치하여 자연스러운 공간감을 유지합니다.</li>
                            </ul>
                        </div>
                        <div className="lg:w-1/3 flex justify-center">
                            <div className="w-full max-w-xs aspect-square rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 flex items-center justify-center p-4 relative">
                                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-500/20 via-transparent to-transparent opacity-50"></div>
                                <svg viewBox="0 0 100 100" className="w-full h-full text-blue-400">
                                    {/* Standing Wave */}
                                    <path d="M10 50 Q 30 10 50 50 T 90 50" fill="none" stroke="currentColor" strokeWidth="2" className="animate-pulse" />
                                    <path d="M10 50 Q 30 90 50 50 T 90 50" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" className="opacity-50" />
                                    
                                    {/* Nodes (Points of zero amplitude) */}
                                    <circle cx="10" cy="50" r="2" fill="#f43f5e" />
                                    <circle cx="50" cy="50" r="3" fill="#f43f5e" />
                                    <circle cx="90" cy="50" r="2" fill="#f43f5e" />
                                    
                                    {/* Labels */}
                                    <text x="50" y="60" fontSize="6" fill="#f43f5e" textAnchor="middle" fontWeight="bold">Node (0)</text>
                                    
                                    {/* Antinodes (Points of max amplitude) */}
                                    <path d="M30 20 L30 80" stroke="#f43f5e" strokeWidth="1" strokeDasharray="2 2" className="opacity-70" />
                                    <path d="M70 20 L70 80" stroke="#f43f5e" strokeWidth="1" strokeDasharray="2 2" className="opacity-70" />
                                    <text x="30" y="15" fontSize="6" fill="#94a3b8" textAnchor="middle">Antinode (Max)</text>
                                    <text x="70" y="15" fontSize="6" fill="#94a3b8" textAnchor="middle">Antinode</text>
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button 
                        onClick={handleNext}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-indigo-500/30 transition-all flex items-center gap-2"
                    >
                        측정 단계로 이동
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </button>
                </div>
            </div>
        </div>
    );
}
