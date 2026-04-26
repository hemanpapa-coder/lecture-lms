'use client';

import { useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Play, Square, Music, Volume2, DoorOpen, Waves } from 'lucide-react';

const V = 343; // 음속 (m/s)

export default function ResonanceClient({ length, width, height }: { length: number; width: number; height: number }) {
    // 룸의 가장 긴 변(일반적으로 Length)을 기준으로 파이프 모델 계산
    const baseLength = length;
    
    // 닫힌 관 (일반적인 방) 주파수: f = n * v / 2L (n = 1, 2, 3...)
    const closedFreqs = useMemo(() => [1, 2, 3, 4, 5].map(n => Math.round(n * V / (2 * baseLength) * 10) / 10), [baseLength]);
    
    // 열린 관 (문/창문이 열린 방) 주파수: f = (2n-1) * v / 4L (n = 1, 2, 3...)
    const openFreqs = useMemo(() => [1, 2, 3, 4, 5].map(n => Math.round((2 * n - 1) * V / (4 * baseLength) * 10) / 10), [baseLength]);

    // Audio Context State
    const audioCtxRef = useRef<AudioContext | null>(null);
    const oscListRef = useRef<{ osc: OscillatorNode; gain: GainNode }[]>([]);
    const [playingType, setPlayingType] = useState<string | null>(null);

    const playHarmonics = async (type: 'closed' | 'open' | 'even' | 'odd', baseFreq: number) => {
        stopAudio();
        
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioCtxRef.current.state === 'suspended') {
            await audioCtxRef.current.resume();
        }

        const ctx = audioCtxRef.current;
        const t0 = ctx.currentTime;
        setPlayingType(type);

        // 배음 구성 결정
        let multipliers = [1];
        let weights = [1.0]; // 진폭 비율
        
        if (type === 'closed') {
            // 닫힌 관: 정수 배음 (1, 2, 3, 4...)
            multipliers = [1, 2, 3, 4];
            weights = [1.0, 0.5, 0.3, 0.2];
        } else if (type === 'open') {
            // 열린 관: 홀수 배음 (1, 3, 5...)
            multipliers = [1, 3, 5];
            weights = [1.0, 0.4, 0.2];
        } else if (type === 'even') {
            // 짝수 배음만 강하게 강조 (2, 4, 6) - 음악적이고 따뜻함
            multipliers = [1, 2, 4, 6];
            weights = [1.0, 0.8, 0.5, 0.3];
        } else if (type === 'odd') {
            // 홀수 배음만 강하게 강조 (3, 5, 7) - 차갑고 공허함(Square wave 성향)
            multipliers = [1, 3, 5, 7];
            weights = [1.0, 0.8, 0.5, 0.3];
        }

        // 전체 볼륨을 위해 개별 gain 조절
        const totalWeight = weights.reduce((a, b) => a + b, 0);

        multipliers.forEach((mult, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.value = baseFreq * mult;
            
            const peakGain = (weights[i] / totalWeight) * 0.4; // 전체 마스터 게인 0.4로 제한

            gain.gain.setValueAtTime(0, t0);
            gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.1); // Attack
            gain.gain.setValueAtTime(peakGain, t0 + 2.0); // Sustain
            gain.gain.linearRampToValueAtTime(0.0001, t0 + 2.5); // Release

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(t0);
            osc.stop(t0 + 2.6);

            oscListRef.current.push({ osc, gain });

            if (i === 0) {
                osc.onended = () => {
                    setPlayingType(null);
                    oscListRef.current = [];
                };
            }
        });
    };

    const stopAudio = () => {
        oscListRef.current.forEach(({ osc }) => { try { osc.stop(); } catch {} });
        oscListRef.current = [];
        setPlayingType(null);
    };

    const backUrl = `/tools/room-acoustics/treatment?L=${length}&W=${width}&H=${height}`;

    return (
        <div className="min-h-screen bg-slate-950 text-white p-6 sm:p-8 font-sans">
            <div className="max-w-4xl mx-auto space-y-10">

                {/* Header */}
                <header className="flex items-center justify-between bg-slate-900 p-6 rounded-3xl border border-slate-800">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h1 className="text-2xl font-black text-white">공간 경계면과 배음(Harmonics) 분석</h1>
                            <span className="px-3 py-1 bg-fuchsia-900/50 text-fuchsia-300 text-xs font-bold rounded-full border border-fuchsia-800">3페이지</span>
                        </div>
                        <p className="text-slate-400 text-sm">문을 열었을 때의 주파수 변화와 배음 구조(Timbre)의 음향학적 특성</p>
                    </div>
                    <Link href={backUrl} className="flex items-center gap-2 text-sm font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 px-4 rounded-xl transition">
                        <ArrowLeft className="w-4 h-4" /> 2페이지
                    </Link>
                </header>

                {/* ── Section 1: Pipe Models ── */}
                <section className="bg-slate-900 rounded-3xl p-8 border border-slate-800 space-y-8">
                    <div>
                        <h2 className="text-xl font-black text-white mb-2 flex items-center gap-2"><DoorOpen className="w-6 h-6 text-fuchsia-400" /> 문/창문 개방 시의 음향적 변화</h2>
                        <p className="text-slate-400 text-sm leading-relaxed">
                            방문을 닫았을 때는 양쪽 벽이 막힌 <b>'닫힌 관(Closed-Closed Pipe)'</b>처럼 작동하지만, 방문이나 창문을 활짝 열면 한쪽이 뚫린 <b>'열린 관(Closed-Open Pipe)'</b>처럼 작동합니다. 
                            열린 곳에서는 공기 압력이 0(Node)이 되기 때문에, 파장의 형태가 완전히 바뀌며 공진 주파수(Fundamental)가 절반으로 떨어집니다.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Closed Pipe */}
                        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                            <div className="flex items-center justify-between mb-4 border-b border-slate-700 pb-3">
                                <h3 className="font-extrabold text-white text-lg">사면이 막힌 구조 <span className="text-sm font-normal text-slate-400">(문 닫힘)</span></h3>
                                <button onClick={() => playingType === 'closed' ? stopAudio() : playHarmonics('closed', closedFreqs[0])} className={`p-2 rounded-lg transition ${playingType === 'closed' ? 'bg-fuchsia-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                                    {playingType === 'closed' ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                </button>
                            </div>
                            <code className="block bg-slate-900 px-3 py-2 rounded-lg text-fuchsia-300 font-mono text-xs mb-4">f_n = n × v / 2L</code>
                            <ul className="space-y-2 text-sm text-slate-300 mb-4">
                                <li>• 파장의 절반(λ/2)이 방 길이에 맞물립니다.</li>
                                <li>• <b>정수 배수(1, 2, 3, 4배수...)</b>의 배음이 모두 생성됩니다.</li>
                            </ul>
                            <div className="grid grid-cols-4 gap-2">
                                {closedFreqs.slice(0, 4).map((f, i) => (
                                    <div key={i} className="bg-slate-900 p-2 rounded-xl text-center border border-slate-700">
                                        <span className="block text-[10px] text-slate-500 mb-1">{i+1}배수</span>
                                        <span className="font-mono font-bold text-fuchsia-300">{f}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Open Pipe */}
                        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                            <div className="flex items-center justify-between mb-4 border-b border-slate-700 pb-3">
                                <h3 className="font-extrabold text-white text-lg">한쪽이 뚫린 구조 <span className="text-sm font-normal text-slate-400">(문 개방)</span></h3>
                                <button onClick={() => playingType === 'open' ? stopAudio() : playHarmonics('open', openFreqs[0])} className={`p-2 rounded-lg transition ${playingType === 'open' ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>
                                    {playingType === 'open' ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                </button>
                            </div>
                            <code className="block bg-slate-900 px-3 py-2 rounded-lg text-sky-300 font-mono text-xs mb-4">f_n = (2n-1) × v / 4L</code>
                            <ul className="space-y-2 text-sm text-slate-300 mb-4">
                                <li>• 파장의 1/4(λ/4)이 방 길이에 맞물려 파장이 2배 길어집니다.</li>
                                <li>• <b className="text-sky-300">홀수 배수(1, 3, 5배수...)</b>의 배음만 생성됩니다.</li>
                            </ul>
                            <div className="grid grid-cols-4 gap-2">
                                {openFreqs.slice(0, 4).map((f, i) => (
                                    <div key={i} className="bg-slate-900 p-2 rounded-xl text-center border border-slate-700">
                                        <span className="block text-[10px] text-slate-500 mb-1">{2*i+1}배수</span>
                                        <span className="font-mono font-bold text-sky-300">{f}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── Section 2: Harmonics Timbre ── */}
                <section className="bg-slate-900 rounded-3xl p-8 border border-slate-800 space-y-8">
                    <div>
                        <h2 className="text-xl font-black text-white mb-2 flex items-center gap-2"><Waves className="w-6 h-6 text-amber-400" /> 짝배수(Even) vs 홀배수(Odd) 음향적 특성 청취</h2>
                        <p className="text-slate-400 text-sm leading-relaxed">
                            어떤 배음(Harmonics) 구조를 갖느냐에 따라 소리의 음색(Timbre)이 완전히 달라집니다. 
                            스튜디오 룸 어쿠스틱에서 특정 주파수 대역이 강조되거나 캔슬될 때 발생하는 소리의 질감 차이를 직접 들어보세요. 
                            (기준 주파수: 1배수 {closedFreqs[0]}Hz)
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Even Harmonics */}
                        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                            <h3 className="font-extrabold text-white text-lg mb-2 text-amber-300">🎵 짝배수 (Even Harmonics)</h3>
                            <p className="text-sm text-slate-300 mb-6 h-10">2, 4, 6배수 성분이 강조된 소리. 옥타브(Octave) 관계를 형성하여 화성적으로 안정적이고, 따뜻하며 꽉 찬(Warm & Full) 느낌을 줍니다.</p>
                            
                            <button 
                                onClick={() => playingType === 'even' ? stopAudio() : playHarmonics('even', closedFreqs[0])} 
                                className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-bold transition shadow-md ${playingType === 'even' ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
                            >
                                {playingType === 'even' ? <Square className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                                {playingType === 'even' ? '정지' : '짝배수 합성음 청취'}
                            </button>
                        </div>

                        {/* Odd Harmonics */}
                        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                            <h3 className="font-extrabold text-white text-lg mb-2 text-emerald-300">🔪 홀배수 (Odd Harmonics)</h3>
                            <p className="text-sm text-slate-300 mb-6 h-10">3, 5, 7배수 성분이 강조된 소리. 사각파(Square Wave) 성향을 띠며, 날카롭고 차갑거나 공허한(Edgy & Hollow) 느낌을 줍니다.</p>
                            
                            <button 
                                onClick={() => playingType === 'odd' ? stopAudio() : playHarmonics('odd', closedFreqs[0])} 
                                className={`w-full py-4 rounded-xl flex items-center justify-center gap-2 font-bold transition shadow-md ${playingType === 'odd' ? 'bg-emerald-500 text-slate-900' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
                            >
                                {playingType === 'odd' ? <Square className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                                {playingType === 'odd' ? '정지' : '홀배수 합성음 청취'}
                            </button>
                        </div>
                    </div>
                </section>

                {/* Navigation */}
                <div className="flex justify-between pb-4">
                    <Link href={backUrl} className="flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition text-sm">
                        <ArrowLeft className="w-4 h-4" /> 2페이지로 돌아가기
                    </Link>
                    <p className="text-slate-600 text-xs self-center">© 김한상 교수 LMS · 룸 어쿠스틱 진단 도구</p>
                </div>
            </div>
        </div>
    );
}
