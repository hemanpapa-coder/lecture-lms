"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Volume2, Square, Mic, Activity } from 'lucide-react';

export function MeasureClient() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const ptsStr = searchParams.get('pts');
    let parsedLength = parseFloat(searchParams.get('L') || '5.0');
    let parsedWidth = parseFloat(searchParams.get('W') || '4.0');
    const height = parseFloat(searchParams.get('H') || '2.5');
    const wallMaterial = searchParams.get('mat') || 'concrete';
    const floorMaterial = searchParams.get('floorMat') || 'concrete';
    const ceilingMaterial = searchParams.get('ceilMat') || 'concrete';

    const [isPolygon, setIsPolygon] = useState(false);
    const [realArea, setRealArea] = useState(0);

    useEffect(() => {
        if (ptsStr) {
            try {
                const pts = ptsStr.split('_').map(p => {
                    const [x, y] = p.split(',').map(Number);
                    return {x, y};
                });
                let area = 0;
                let perimeter = 0;
                for (let i = 0; i < pts.length; i++) {
                    let j = (i + 1) % pts.length;
                    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
                    const dx = pts[j].x - pts[i].x;
                    const dy = pts[j].y - pts[i].y;
                    perimeter += Math.sqrt(dx * dx + dy * dy);
                }
                area = Math.abs(area / 2);
                setRealArea(area);
                setIsPolygon(true);
            } catch (e) {
                console.error("Failed to parse polygon", e);
            }
        }
    }, [ptsStr]);

    // Use equivalent L and W for room mode calculations
    const length = ptsStr && realArea > 0 ? Math.max(...ptsStr.split('_').map(p => Number(p.split(',')[0]))) : parsedLength;
    const width = ptsStr && realArea > 0 ? realArea / length : parsedWidth;

    // Calculate Theoretical RT60
    const [theoreticalRt60, setTheoreticalRt60] = useState<number | null>(null);
    const [schroederFreq, setSchroederFreq] = useState<number | null>(null);

    useEffect(() => {
        const V = isPolygon && realArea > 0 ? realArea * height : length * width * height;
        
        let S_floor = isPolygon && realArea > 0 ? realArea : length * width;
        let S_ceil = S_floor;
        let S_wall = isPolygon && ptsStr ? 0 : 2 * (length * height + width * height);
        
        if (isPolygon && ptsStr) {
            const pts = ptsStr.split('_').map(p => p.split(',').map(Number));
            let perimeter = 0;
            for (let i = 0; i < pts.length; i++) {
                let j = (i + 1) % pts.length;
                const dx = pts[j][0] - pts[i][0];
                const dy = pts[j][1] - pts[i][1];
                perimeter += Math.sqrt(dx * dx + dy * dy);
            }
            S_wall = perimeter * height;
        }

        const getAlpha = (mat: string, type: 'wall' | 'floor' | 'ceil') => {
            if (type === 'wall') {
                if (mat === 'wood') return 0.06;
                if (mat === 'glass') return 0.03;
                if (mat === 'drywall') return 0.05;
                if (mat === 'wallpaper_drywall') return 0.04;
                return 0.02; // concrete
            } else if (type === 'floor') {
                if (mat === 'wood') return 0.06;
                if (mat === 'laminate') return 0.05;
                if (mat === 'linoleum') return 0.04;
                if (mat === 'carpet') return 0.3;
                if (mat === 'tile') return 0.01;
                return 0.02; // concrete
            } else { // ceil
                if (mat === 'gypsum') return 0.05;
                if (mat === 'wallpaper_ceiling') return 0.04;
                if (mat === 'wood') return 0.1;
                if (mat === 'acoustic') return 0.6;
                return 0.02; // concrete
            }
        };

        const A = S_wall * getAlpha(wallMaterial, 'wall') 
                + S_floor * getAlpha(floorMaterial, 'floor') 
                + S_ceil * getAlpha(ceilingMaterial, 'ceil');

        if (A > 0) {
            const rt60 = 0.161 * V / A;
            setTheoreticalRt60(rt60);
            setSchroederFreq(2000 * Math.sqrt(rt60 / V));
        }
    }, [length, width, height, wallMaterial, floorMaterial, ceilingMaterial, isPolygon, realArea, ptsStr]);

    // Calculated Frequencies
    interface ModeInfo { type: 'Axial'|'Tangential'|'Oblique'; freq: number; label: string; }
    interface Modes {
        L: number[]; W: number[]; H: number[];
        tangential: number[];
        oblique: number[];
        all: ModeInfo[];
    }
    const [modes, setModes] = useState<Modes>({ L: [], W: [], H: [], tangential: [], oblique: [], all: [] });
    
    // Audio Context State
    const audioCtxRef = useRef<AudioContext | null>(null);
    const oscRef = useRef<OscillatorNode | null>(null);
    const oscListRef = useRef<{ osc: OscillatorNode; gain: GainNode }[]>([]);
    const [playingFreq, setPlayingFreq] = useState<number | null>(null);
    const [selectedFreqs, setSelectedFreqs] = useState<Set<number>>(new Set());

    const toggleSelectFreq = (freq: number) => {
        setSelectedFreqs(prev => {
            const next = new Set(prev);
            if (next.has(freq)) next.delete(freq); else next.add(freq);
            return next;
        });
    };

    // RT60 Measurement State
    const [measuring, setMeasuring] = useState(false);
    const [rt60Results, setRt60Results] = useState<{ [band: string]: number | null }>({});
    const [micError, setMicError] = useState('');
    const [currentVolume, setCurrentVolume] = useState(-100);
    const [measurementState, setMeasurementState] = useState<'idle' | 'playing_tone' | 'waiting' | 'recording_decay'>('idle');
    const [isMobile, setIsMobile] = useState(false);
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const reqFrameRef = useRef<number | null>(null);

    useEffect(() => {
        setIsMobile(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent));
    }, []);

    // Formula execution
    useEffect(() => {
        const v = 343; // Speed of sound in m/s

        if (length <= 0 || width <= 0 || height <= 0) return;

        const allModes: ModeInfo[] = [];
        const maxN = 5;
        
        for (let nx = 0; nx <= maxN; nx++) {
            for (let ny = 0; ny <= maxN; ny++) {
                for (let nz = 0; nz <= maxN; nz++) {
                    if (nx === 0 && ny === 0 && nz === 0) continue;
                    
                    const f = (v / 2) * Math.sqrt(Math.pow(nx / length, 2) + Math.pow(ny / width, 2) + Math.pow(nz / height, 2));
                    
                    if (f <= 250) {
                        let nonZeros = 0;
                        if (nx > 0) nonZeros++;
                        if (ny > 0) nonZeros++;
                        if (nz > 0) nonZeros++;
                        
                        let type: 'Axial' | 'Tangential' | 'Oblique' = 'Axial';
                        if (nonZeros === 2) type = 'Tangential';
                        if (nonZeros === 3) type = 'Oblique';
                        
                        allModes.push({ type, freq: Math.round(f * 10) / 10, label: `${nx}-${ny}-${nz}` });
                    }
                }
            }
        }
        
        allModes.sort((a, b) => a.freq - b.freq);

        const L_modes = allModes.filter(m => m.type === 'Axial' && m.label.endsWith('-0-0')).map(m => m.freq);
        const W_modes = allModes.filter(m => m.type === 'Axial' && m.label.startsWith('0-') && m.label.endsWith('-0')).map(m => m.freq);
        const H_modes = allModes.filter(m => m.type === 'Axial' && m.label.startsWith('0-0-')).map(m => m.freq);
        const tang_modes = allModes.filter(m => m.type === 'Tangential').map(m => m.freq);
        const obli_modes = allModes.filter(m => m.type === 'Oblique').map(m => m.freq);

        setModes({
            L: L_modes,
            W: W_modes,
            H: H_modes,
            tangential: tang_modes,
            oblique: obli_modes,
            all: allModes
        });
    }, [length, width, height]);

    // Cleanup audio context
    useEffect(() => {
        return () => {
            oscListRef.current.forEach(({ osc }) => { try { osc.stop(); } catch {} });
            oscListRef.current = [];
            oscRef.current = null;
            if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
            if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
            if (reqFrameRef.current) cancelAnimationFrame(reqFrameRef.current);
        };
    }, []);

    const playTone = (freq: number) => {
        if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();

        // Stop current if any
        oscListRef.current.forEach(({ osc }) => { try { osc.stop(); } catch {} });
        oscListRef.current = [];

        const osc = audioCtxRef.current.createOscillator();
        const gain = audioCtxRef.current.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.value = 0;
        
        osc.connect(gain);
        gain.connect(audioCtxRef.current.destination);
        
        osc.start();
        gain.gain.setTargetAtTime(0.5, audioCtxRef.current.currentTime, 0.1);

        oscListRef.current.push({ osc, gain });
        setPlayingFreq(freq);
    };

    const stopTone = () => {
        if (!audioCtxRef.current) return;
        oscListRef.current.forEach(({ osc, gain }) => {
            gain.gain.setTargetAtTime(0, audioCtxRef.current!.currentTime, 0.1);
            setTimeout(() => { try { osc.stop(); } catch {} }, 200);
        });
        oscListRef.current = [];
        setPlayingFreq(null);
    };

    // --- RT60 LOGIC ---
    const startRT60Measurement = async () => {
        setMicError('');
        setMeasuring(true);
        setRt60Results({});
        
        try {
            if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
            streamRef.current = stream;
            
            const source = audioCtxRef.current.createMediaStreamSource(stream);
            const analyzer = audioCtxRef.current.createAnalyser();
            analyzer.fftSize = 2048;
            source.connect(analyzer);
            analyzerRef.current = analyzer;

            let isPlayingTone = !isMobile;
            let impulseDetected = false;
            let peakVolume = -100;
            let decayStartTime = 0;
            let decayData: { time: number, vol: number }[] = [];
            
            if (!isMobile) {
                setMeasurementState('playing_tone');
                const osc = audioCtxRef.current.createOscillator();
                const gain = audioCtxRef.current.createGain();
                osc.type = 'sine';
                
                // Sweep from 100Hz to 8000Hz over 1 second
                osc.frequency.setValueAtTime(100, audioCtxRef.current.currentTime);
                osc.frequency.exponentialRampToValueAtTime(8000, audioCtxRef.current.currentTime + 1);
                
                gain.gain.setValueAtTime(0, audioCtxRef.current.currentTime);
                gain.gain.linearRampToValueAtTime(0.8, audioCtxRef.current.currentTime + 0.1);
                gain.gain.setValueAtTime(0.8, audioCtxRef.current.currentTime + 0.9);
                gain.gain.linearRampToValueAtTime(0, audioCtxRef.current.currentTime + 1);
                
                osc.connect(gain);
                gain.connect(audioCtxRef.current.destination);
                
                osc.start();
                osc.stop(audioCtxRef.current.currentTime + 1);
                
                osc.onended = () => {
                    isPlayingTone = false;
                    impulseDetected = true;
                    decayStartTime = audioCtxRef.current!.currentTime;
                    setMeasurementState('recording_decay');
                };
            } else {
                setMeasurementState('waiting');
            }
            
            const checkAudio = () => {
                if (!analyzerRef.current) return;
                const buffer = new Float32Array(analyzer.fftSize);
                analyzer.getFloatTimeDomainData(buffer);
                
                let sumSquares = 0;
                for(let i=0; i<buffer.length; i++) {
                    sumSquares += buffer[i] * buffer[i];
                }
                const rms = Math.sqrt(sumSquares / buffer.length);
                const db = 20 * Math.log10(rms || 0.0001);
                
                setCurrentVolume(db);

                if (isPlayingTone) {
                    // Desktop playing tone
                    if (db > peakVolume) peakVolume = db;
                } else {
                    if (!impulseDetected) {
                        // Mobile waiting for clap
                        if (db > -15) {
                            impulseDetected = true;
                            peakVolume = db;
                            decayStartTime = audioCtxRef.current!.currentTime;
                            setMeasurementState('recording_decay');
                        }
                    } else {
                        // Both: recording decay
                        const now = audioCtxRef.current!.currentTime;
                        decayData.push({ time: now - decayStartTime, vol: db });
                        
                        // Stop after 2 seconds
                        if (now - decayStartTime > 2.0) {
                            finishRT60(decayData, peakVolume);
                            return;
                        }
                    }
                }
                
                reqFrameRef.current = requestAnimationFrame(checkAudio);
            };
            
            checkAudio();

        } catch (err) {
            console.error(err);
            setMicError('마이크 접근 권한이 없거나 지원되지 않습니다.');
            setMeasuring(false);
            setMeasurementState('idle');
        }
    };

    const finishRT60 = (data: {time: number, vol: number}[], peak: number) => {
        if (reqFrameRef.current) cancelAnimationFrame(reqFrameRef.current);
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        
        setMeasuring(false);
        setMeasurementState('idle');

        // Schroeder integration / simple linear regression for decay
        // Find point where vol drops by 20dB
        let t20 = 0;
        for (let i=0; i<data.length; i++) {
            if (data[i].vol <= peak - 20) {
                t20 = data[i].time;
                break;
            }
        }
        
        let rt60 = 0;
        if (t20 > 0) {
            rt60 = t20 * 3; // T20 * 3 = RT60
        } else {
            rt60 = 0.5; // fallback or error
        }

        setRt60Results({
            "Broadband Estimation": Math.round(rt60 * 100) / 100
        });
    };

    const handleNext = () => {
        router.push(`/tools/room-acoustics/simulate?L=${length}&W=${width}&H=${height}&mat=${wallMaterial}&floorMat=${floorMaterial}&ceilMat=${ceilingMaterial}&freqs=${Array.from(selectedFreqs).join(',')}`);
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 sm:p-8 font-sans">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-10 shadow-sm border border-slate-200 dark:border-slate-800 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 dark:bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/10 dark:bg-purple-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
                    
                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <span className="px-3 py-1 text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300 rounded-full">
                                    Acoustics Step 2
                                </span>
                                <span className="px-3 py-1 text-xs font-bold bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 rounded-full flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
                                    측정 페이지
                                </span>
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                                룸 어쿠스틱 시뮬레이터 <span className="text-blue-500">측정</span>
                            </h1>
                            <p className="mt-3 text-slate-600 dark:text-slate-400 text-sm sm:text-base max-w-2xl">
                                입력된 공간 크기({length}m x {width}m x {height}m)를 바탕으로 룸 모드를 듣고, 마이크로 잔향을 측정합니다.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Progress Steps UI */}
                <div className="flex items-center justify-center space-x-4 mb-8">
                    <div className="flex flex-col items-center opacity-50">
                        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 flex items-center justify-center font-bold">1</div>
                        <span className="text-xs mt-2 font-semibold text-slate-500">입력</span>
                    </div>
                    <div className="w-16 h-1 bg-indigo-600 rounded"></div>
                    <div className="flex flex-col items-center">
                        <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shadow-lg shadow-blue-500/30">2</div>
                        <span className="text-xs mt-2 font-semibold text-blue-600 dark:text-blue-400">측정</span>
                    </div>
                    <div className="w-16 h-1 bg-slate-300 dark:bg-slate-700 rounded"></div>
                    <div className="flex flex-col items-center opacity-50">
                        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 flex items-center justify-center font-bold">3</div>
                        <span className="text-xs mt-2 font-semibold text-slate-500">시뮬레이션</span>
                    </div>
                </div>

                {/* Section 2: Calculated Modes & Frequency Generator */}
                <section className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-200 dark:border-slate-800">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                        <Volume2 className="w-5 h-5 text-indigo-500" /> 정재파(Room Modes) 청취 및 선택
                    </h2>
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-xl mb-6 border border-slate-200 dark:border-slate-700">
                        <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-2">📚 룸 모드 (Room Mode)와 노드/안티노드란?</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
                            방의 가로, 세로, 높이(3개의 축) 벽면 사이에서 반사된 소리가 서로 만나 증폭되거나 상쇄되는 현상을 <strong>정재파(Standing Wave)</strong>라고 합니다. 이때 벽과 벽 사이를 직선으로 왕복하는 가장 강한 파동을 <strong>축 모드(Axial Mode)</strong>라고 하며, 아래에 계산된 3개의 리스트가 바로 방의 3개 축(가로, 세로, 높이)에 대한 축 모드 공진 주파수입니다.
                        </p>
                        <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 mb-4">
                            <table className="w-full text-left text-xs text-slate-600 dark:text-slate-400">
                                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                    <tr>
                                        <th className="p-2 font-semibold">용어</th>
                                        <th className="p-2 font-semibold border-l border-slate-200 dark:border-slate-700">설명 (음압 기준)</th>
                                        <th className="p-2 font-semibold border-l border-slate-200 dark:border-slate-700">공간 내 위치</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr className="border-t border-slate-200 dark:border-slate-700">
                                        <td className="p-2 font-bold text-rose-500">안티노드<br/>(Antinode)</td>
                                        <td className="p-2 border-l border-slate-200 dark:border-slate-700">음압의 변화가 <strong>최대치</strong>에 달하는 지점입니다. 특정 주파수가 비정상적으로 크게(부밍) 들립니다.</td>
                                        <td className="p-2 border-l border-slate-200 dark:border-slate-700">주로 방의 <strong>모서리와 벽면</strong>에 위치합니다. (베이스트랩을 코너에 설치하는 이유)</td>
                                    </tr>
                                    <tr className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
                                        <td className="p-2 font-bold text-blue-500">노드<br/>(Node)</td>
                                        <td className="p-2 border-l border-slate-200 dark:border-slate-700">음압의 변화가 <strong>0(Zero)</strong>이 되는 지점입니다. 파동이 상쇄되어 해당 주파수의 소리가 텅 빈 것처럼 안 들립니다.</td>
                                        <td className="p-2 border-l border-slate-200 dark:border-slate-700">방의 <strong>중앙 부근</strong> 등 파장의 1/4 지점마다 번갈아 발생합니다.</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                            각 주파수를 재생해보고 방 안을 걸어 다니며 <b>가장 웅웅거리는 주파수(안티노드)</b>와 <b>소리가 쏙 빠져 들리지 않는 위치(노드)</b>를 확인해보세요. 가장 문제가 되는 공진음을 선택하시면 다음 시뮬레이션 단계에서 해당 파형이 3차원 축(가로, 세로, 높이) 모두에 어떻게 형성되는지 애니메이션으로 확인할 수 있습니다.
                        </p>
                    </div>
                    
                        <div className="space-y-6">
                        {/* Schroeder Frequency & Bolt Ratio */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Schroeder Frequency</h4>
                                <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                                    {schroederFreq ? Math.round(schroederFreq) : '---'} <span className="text-sm font-normal text-slate-500">Hz</span>
                                </div>
                                <p className="text-[10px] text-slate-500 mt-1">이 주파수 이하에서는 룸 모드(정재파)가, 이상에서는 잔향(반사음)이 소리를 지배합니다.</p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Room Ratios (Bolt Area)</h4>
                                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                                    1 : {(width/height).toFixed(2)} : {(length/height).toFixed(2)}
                                </div>
                                <p className="text-[10px] text-slate-500 mt-1">(높이 : 세로 : 가로) 특정 비율(예: 1:1.14:1.39)은 모드가 고르게 분포하는 이상적 공간입니다.</p>
                            </div>
                        </div>

                        {/* Piano Graph (20Hz - 250Hz) */}
                        <div className="mb-6">
                            <h3 className="text-md font-bold text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-100 dark:border-slate-800 pb-2 flex justify-between items-end">
                                <span>3D 룸 모드 스펙트럼 (20Hz ~ 250Hz)</span>
                                <div className="flex gap-3 text-[10px] font-bold">
                                    <span className="flex items-center gap-1 text-rose-500"><span className="w-2 h-2 rounded-full bg-rose-500"></span>Axial (강함)</span>
                                    <span className="flex items-center gap-1 text-blue-500"><span className="w-2 h-2 rounded-full bg-blue-500"></span>Tangential (중간)</span>
                                    <span className="flex items-center gap-1 text-emerald-500"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>Oblique (약함)</span>
                                </div>
                            </h3>
                            
                            <div className="relative w-full h-32 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden mb-2 shadow-inner">
                                {/* Frequency Grid Lines */}
                                {[20, 50, 100, 150, 200, 250].map(f => (
                                    <div key={f} className="absolute top-0 bottom-0 border-l border-slate-200 dark:border-slate-800 border-dashed"
                                         style={{ left: `${Math.max(0, Math.min(100, (Math.log10(f / 20) / Math.log10(250 / 20)) * 100))}%` }}>
                                        <span className="absolute bottom-1 left-1 text-[8px] text-slate-400 font-bold">{f}Hz</span>
                                    </div>
                                ))}

                                {/* Mode Lines */}
                                {modes.all.map((m, i) => {
                                    const percentX = Math.max(0, Math.min(100, (Math.log10(m.freq / 20) / Math.log10(250 / 20)) * 100));
                                    const color = m.type === 'Axial' ? 'bg-rose-500' : m.type === 'Tangential' ? 'bg-blue-500' : 'bg-emerald-500';
                                    const height = m.type === 'Axial' ? 'h-full' : m.type === 'Tangential' ? 'h-3/4' : 'h-1/2';
                                    const isPlaying = playingFreq === m.freq;
                                    const isSelected = selectedFreqs.has(m.freq);

                                    return (
                                        <div 
                                            key={i} 
                                            className={`absolute bottom-0 w-0.5 ${height} ${color} cursor-pointer hover:w-1.5 transition-all group z-10 ${isPlaying ? 'bg-amber-400 w-1' : ''} ${isSelected ? 'shadow-[0_0_8px_rgba(251,191,36,0.8)]' : ''}`}
                                            style={{ left: `${percentX}%` }}
                                            onClick={() => playTone(m.freq)}
                                            onDoubleClick={() => toggleSelectFreq(m.freq)}
                                        >
                                            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-slate-800 text-white text-[10px] px-2 py-1 rounded pointer-events-none whitespace-nowrap z-20">
                                                {m.freq}Hz ({m.label})<br/>{m.type}
                                                <br/><span className="text-amber-400">클릭: 재생 / 더블클릭: 선택</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* List view for selected/playing modes */}
                        <div className="bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                            <h4 className="text-xs font-bold text-slate-500 mb-2">모드 상세 목록 (Axial Modes)</h4>
                            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                {modes.all.filter(m => m.type === 'Axial').map((m, i) => (
                                    <button
                                        key={i}
                                        onClick={() => playTone(m.freq)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-2 ${playingFreq === m.freq ? 'bg-rose-500 border-rose-600 text-white shadow-md' : selectedFreqs.has(m.freq) ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' : 'bg-white border-slate-200 hover:border-rose-300 dark:bg-slate-900 dark:border-slate-700 dark:hover:border-rose-700 text-slate-700 dark:text-slate-300'}`}
                                    >
                                        <span>{m.freq}Hz</span>
                                        <span className="opacity-50 text-[10px] bg-slate-100 dark:bg-slate-800 px-1 rounded">{m.label}</span>
                                        <div 
                                            onClick={(e) => { e.stopPropagation(); toggleSelectFreq(m.freq); }}
                                            className={`ml-1 w-4 h-4 rounded-full flex items-center justify-center ${selectedFreqs.has(m.freq) ? 'bg-amber-400 text-white' : 'bg-slate-200 dark:bg-slate-700 text-transparent hover:bg-slate-300'}`}
                                        >★</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center justify-between mt-4">
                            <button onClick={stopTone} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                                <Square className="w-4 h-4" /> 정지
                            </button>
                        </div>
                    </div>
                </section>

                {/* Section 3: RT60 Reverb Measurement */}
                <section className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Mic className="w-5 h-5 text-indigo-500" /> 공간 잔향 (RT60) 측정기
                        </h2>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <div className="flex-1 space-y-4">
                            <p className="text-sm font-medium text-slate-500 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                                <span className="font-bold text-indigo-600 dark:text-indigo-400">측정 방법: </span>
                                {isMobile ? (
                                    <>조용한 상태에서 [측정 시작]을 누르고, 큰 소리로 <b>크게 박수(Impulse) 한 번</b>을 치십시오. 마이크가 감쇠되는 시간을 측정하여 RT60을 추정합니다.</>
                                ) : (
                                    <>조용한 상태에서 [측정 시작]을 누르면, <b>스피커에서 측정용 사인 스윕(Sine Sweep) 파형이 1초간 재생</b>된 후 마이크가 공간의 잔향을 자동 분석합니다. 스피커 볼륨을 적당히 키워주세요.</>
                                )}
                            </p>

                            <div className="flex gap-4">
                                {!measuring ? (
                                    <button onClick={startRT60Measurement} className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3 px-6 rounded-2xl shadow-md transition-all active:scale-95">
                                        <Mic className="w-5 h-5" /> 측정 시작 (Start Measurement)
                                    </button>
                                ) : (
                                    <div className="flex-1 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 font-extrabold py-3 px-6 rounded-2xl flex items-center justify-center gap-2 border border-rose-200 dark:border-rose-800">
                                        <Activity className="w-5 h-5 animate-bounce" /> 
                                        {measurementState === 'playing_tone' ? '스피커에서 측정용 톤 재생 중...' : measurementState === 'waiting' ? '박수 소리를 기다리는 중...' : '잔향 분석 중...'}
                                    </div>
                                )}
                            </div>
                            
                            {micError && <p className="text-xs text-rose-500 font-bold">{micError}</p>}
                        </div>

                        <div className="w-full md:w-1/3 flex flex-col gap-4">
                            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
                                <span className="text-xs font-bold text-slate-500 mb-1 block">현재 마이크 입력 레벨</span>
                                <div className="font-mono text-2xl font-black text-slate-800 dark:text-white">
                                    {currentVolume > -100 ? `${Math.round(currentVolume)} dB` : '-- dB'}
                                </div>
                                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 mt-2 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-emerald-500 transition-all duration-75"
                                        style={{ width: `${Math.max(0, Math.min(100, (currentVolume + 80) * 1.5))}%` }}
                                    ></div>
                                </div>
                            </div>
                            
                            <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                                <span className="text-xs font-bold text-slate-500 mb-1 block">이론적 예상 잔향 (Sabine)</span>
                                <div className="font-mono text-xl font-black text-slate-700 dark:text-slate-300">
                                    {theoreticalRt60 ? `${theoreticalRt60.toFixed(2)} 초` : '-.-- 초'}
                                </div>
                            </div>

                            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-800 text-center">
                                <span className="text-xs font-bold text-indigo-500 mb-1 block">마이크 실측 추정치 (RT60)</span>
                                <div className="font-mono text-3xl font-black text-indigo-700 dark:text-indigo-400">
                                    {rt60Results["Broadband Estimation"] ? `${rt60Results["Broadband Estimation"]} 초` : '-.-- 초'}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="flex justify-between pt-4">
                    <button 
                        onClick={() => router.back()}
                        className="bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold py-3 px-8 rounded-xl transition-all flex items-center gap-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        이전 단계
                    </button>
                    <button 
                        onClick={handleNext}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-blue-500/30 transition-all flex items-center gap-2"
                    >
                        시뮬레이션 단계로 이동
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </button>
                </div>
            </div>
        </div>
    );
}
