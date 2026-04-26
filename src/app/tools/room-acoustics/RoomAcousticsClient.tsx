'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Save, Play, Square, Mic, StopCircle, RefreshCw, Volume2, Calculator, Info, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function RoomAcousticsClient({ userId, courseId, userName }: { userId: string, courseId: string | null, userName: string }) {
    const supabase = createClient();
    
    // Room Dimensions (meters)
    const [length, setLength] = useState<string>('5.0');
    const [width, setWidth] = useState<string>('4.0');
    const [height, setHeight] = useState<string>('3.0');

    // Calculated Frequencies
    const [modes, setModes] = useState<{ L: number[], W: number[], H: number[] }>({ L: [], W: [], H: [] });
    
    // Audio Context State
    const audioCtxRef = useRef<AudioContext | null>(null);
    const oscRef = useRef<OscillatorNode | null>(null);
    const oscListRef = useRef<{ osc: OscillatorNode; gain: GainNode }[]>([]);
    const [playingFreq, setPlayingFreq] = useState<number | null>(null);

    // RT60 Measurement State
    const [measuring, setMeasuring] = useState(false);
    const [rt60Results, setRt60Results] = useState<{ [band: string]: number | null }>({});
    const [micError, setMicError] = useState('');
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const reqFrameRef = useRef<number | null>(null);

    // Save State
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

    // Formula execution
    useEffect(() => {
        const L = parseFloat(length) || 0;
        const W = parseFloat(width) || 0;
        const H = parseFloat(height) || 0;
        const v = 343; // Speed of sound in m/s

        const calcModes = (dim: number) => {
            if (dim <= 0) return [];
            const f1 = v / (2 * dim);
            return [Math.round(f1 * 10) / 10, Math.round(f1 * 2 * 10) / 10, Math.round(f1 * 3 * 10) / 10];
        };

        setModes({
            L: calcModes(L),
            W: calcModes(W),
            H: calcModes(H)
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

        // 토글: 같은 주파수면 정지
        if (playingFreq === freq) {
            stopTone();
            return;
        }

        // 기존 사운드 정리
        oscListRef.current.forEach(({ osc }) => { try { osc.stop(); } catch {} });
        oscListRef.current = [];
        oscRef.current = null;

        const ctx = audioCtxRef.current;
        const ATTACK  = 0.05;   // 50ms fade in
        const SUSTAIN = 1.0;    // 1초 톤
        const RELEASE = 0.05;   // 50ms fade out
        const REST    = 0.5;    // 500ms 무음
        const CYCLE   = ATTACK + SUSTAIN + RELEASE + REST; // 1.6s
        const REPEATS = 4;
        const PEAK    = 0.5;    // 최대 게인

        setPlayingFreq(freq);

        for (let i = 0; i < REPEATS; i++) {
            const t0 = ctx.currentTime + i * CYCLE;
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.value = freq;

            // 엔벨로프 스케줄
            gain.gain.setValueAtTime(0, t0);
            gain.gain.linearRampToValueAtTime(PEAK, t0 + ATTACK);                   // fade in
            gain.gain.setValueAtTime(PEAK, t0 + ATTACK + SUSTAIN);                  // sustain hold
            gain.gain.linearRampToValueAtTime(0.0001, t0 + ATTACK + SUSTAIN + RELEASE); // fade out

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(t0);
            osc.stop(t0 + ATTACK + SUSTAIN + RELEASE + 0.002);

            oscListRef.current.push({ osc, gain });

            // 마지막 사이클 종료시 상태 초기화
            if (i === REPEATS - 1) {
                osc.onended = () => {
                    setPlayingFreq(null);
                    oscListRef.current = [];
                };
            }
        }

        oscRef.current = oscListRef.current[0].osc;
    };

    const stopTone = () => {
        oscListRef.current.forEach(({ osc }) => { try { osc.stop(); } catch {} });
        oscListRef.current = [];
        oscRef.current = null;
        setPlayingFreq(null);
    };

    // Simplified RT60 logic: Watch mic levels, wait for impulse spike, track decay.
    const startRT60Measurement = async () => {
        try {
            setMicError('');
            setRt60Results({});
            if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }});
            streamRef.current = stream;
            
            const source = audioCtxRef.current.createMediaStreamSource(stream);
            const analyser = audioCtxRef.current.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.2;
            source.connect(analyser);
            analyzerRef.current = analyser;

            setMeasuring(true);
            
            // Simplified measurement: Wait for clap, then measure time to drop.
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Float32Array(bufferLength);
            
            let state: 'waiting' | 'recording_decay' = 'waiting';
            let peakLevel = -Infinity;
            let peakTime = 0;
            let lastUpdate = Date.now();

            const measure = () => {
                if (!measuring) return; // effectively stops the loop if component unmounts or manually stopped
                if (analyser) analyser.getFloatFrequencyData(dataArray);

                // calculate overall RMS roughly from FFT (in dB)
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const db = dataArray[i];
                    const linear = Math.pow(10, db / 20);
                    sum += linear * linear;
                }
                const rms = Math.sqrt(sum / bufferLength);
                const currentDb = 20 * Math.log10(rms || 0.0001);

                if (state === 'waiting') {
                    if (currentDb > -15) { // Impulse threshold met
                        state = 'recording_decay';
                        peakLevel = currentDb;
                        peakTime = performance.now();
                    }
                } else if (state === 'recording_decay') {
                    // Try to measure T20 directly (time to drop 20dB) and multiply by 3
                    const drop = peakLevel - currentDb;
                    if (drop >= 20) {
                        const t20Time = (performance.now() - peakTime) / 1000; // in seconds
                        const estimatedRT60 = t20Time * 3;
                        
                        setRt60Results({ 'Broadband Estimation': Math.round(estimatedRT60 * 100) / 100 });
                        stopRT60Measurement();
                        return;
                    }

                    // Timeout after 5 seconds to prevent hanging
                    if (performance.now() - peakTime > 5000) {
                        setMicError('측정 시간 초과. 잔향을 분석할 만큼 소리가 떨어지지 않았거나 소음이 있습니다.');
                        stopRT60Measurement();
                        return;
                    }
                }

                reqFrameRef.current = requestAnimationFrame(measure);
            };

            reqFrameRef.current = requestAnimationFrame(measure);

        } catch (err: any) {
            setMicError(`마이크 접근 실패: ${err.message}`);
            setMeasuring(false);
        }
    };

    const stopRT60Measurement = () => {
        setMeasuring(false);
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (reqFrameRef.current) cancelAnimationFrame(reqFrameRef.current);
    };

    const getEQRecommendation = () => {
        let recs = [];
        const allFrequencies = [...modes.L, ...modes.W, ...modes.H];
        const rt60 = rt60Results['Broadband Estimation'];

        if (allFrequencies.length > 0) {
            const lowest = Math.min(...allFrequencies);
            recs.push(`룸에서 가장 강력하게 발생하는 공진 주파수는 ${lowest}Hz (보통 가로/세로 중 가장 긴 쪽의 1배수 정재파)입니다. 마스터 모니터 EQ에서 ${lowest}Hz를 중심으로 Q값을 2.0 정도로 좁게 설정하고 -2dB ~ -4dB 정도 컷(Cut) 하는 것을 추천합니다.`);
        }

        if (rt60 !== undefined && rt60 !== null) {
            if (rt60 > 0.6) {
                recs.push(`현재 측정된 잔향 시간(RT60)이 약 ${rt60}초로 공간이 다소 울리는 편입니다. 저음역대 부밍 컨트롤을 위해 로우 쉘프(Low Shelf) 필터로 150Hz 이하를 -2dB 정도 조절하세요.`);
            } else if (rt60 < 0.2) {
                recs.push(`현재 잔향 시간(RT60)이 약 ${rt60}초로 방이 다소 데드(Dead)한 상태입니다. 명료도는 좋으나 답답하게 들릴 수 있으니, 상단 고주파수(High Shelf 10kHz 이상)를 1~2dB 올려 모니터링 환경을 보상해 주세요.`);
            } else {
                recs.push(`잔향 시간(RT60: ${rt60}초)이 훌륭한 수준(표준 홈레코딩 0.3~0.5초 범위 내)입니다. 공진 대역(펀더멘털)만 가볍게 컷하고 전체 밸런스를 유지하세요.`);
            }
        } else {
            recs.push('잔향(RT60) 측정 버튼을 눌러 박수 소리를 내어 방의 상태를 분석해 보세요.');
        }

        return recs;
    };

    const handleSaveWorkspace = async () => {
        setSaving(true);
        setSaveStatus('idle');

        try {
            const reportLines = [
                `# 룸 어쿠스틱 분석 리포트 (Room Acoustics Report)`,
                `=============================================`,
                ``,
                `## 1. 공간 평면도 및 제원`,
                `* 가로 (Length): ${length} m`,
                `* 세로 (Width): ${width} m`,
                `* 높이 (Height): ${height} m`,
                ``,
                `## 2. 룸 모드 (정재파 주파수 - Fundamental Frequencies)`,
                `* 가로 공진 (Length): 1배수=${modes.L[0]}Hz / 2배수=${modes.L[1]}Hz / 3배수=${modes.L[2]}Hz`,
                `* 세로 공진 (Width): 1배수=${modes.W[0]}Hz / 2배수=${modes.W[1]}Hz / 3배수=${modes.W[2]}Hz`,
                `* 높이 공진 (Height): 1배수=${modes.H[0]}Hz / 2배수=${modes.H[1]}Hz / 3배수=${modes.H[2]}Hz`,
                `\n*(공식: 주파수(f) = 343 / (2 * 길이), 343은 음속)*`,
                ``,
                `## 3. 잔향 측정 결과 (Reverberation Time - RT60)`,
                Object.keys(rt60Results).length > 0 
                  ? `측정된 RT60 감쇠 시간: ${rt60Results['Broadband Estimation']}초` 
                  : `측정되지 않음.`,
                ``,
                `## 4. 마스터 모니터 이퀄라이저 설정 추천값`,
                ...getEQRecommendation().map(r => `* ${r}`)
            ];

            const htmlContent = reportLines.map(line => {
                if (line.startsWith('#')) {
                    const depth = line.match(/^#+/)?.[0].length || 1;
                    return `<h${depth}>${line.replace(/^#+\s/, '')}</h${depth}>`;
                }
                return line ? `<p>${line}</p>` : '<br/>';
            }).join('');

            // Save to board_questions (homework submission for week 7)
            const { error } = await supabase
                .from('board_questions')
                .insert({
                    course_id: courseId || '',
                    user_id: userId,
                    type: 'homework',
                    title: `[7주차] 룸 어쿠스틱 정재파 분석 및 EQ 추천 - ${userName}`,
                    content: htmlContent,
                    week_number: 7, // Week 7 assignment
                    metadata: {
                        fundamental_modes: modes,
                        rt60: rt60Results,
                        room_dims: { length, width, height }
                    }
                });

            if (error) throw error;
            setSaveStatus('success');

        } catch (err: any) {
            console.error(err);
            setSaveStatus('error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 sm:p-8 font-sans">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Header */}
                <header className="flex items-center justify-between bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-2xl font-black text-slate-900 dark:text-white">룸 어쿠스틱 진단 도구</h1>
                            <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full dark:bg-indigo-900/40 dark:text-indigo-400">7주차 실습 과정</span>
                        </div>
                        <p className="text-slate-500 text-sm font-medium mt-2">
                            공간의 가로, 세로, 높이를 기반으로 펀더멘털 정재파를 구하고, 잔향을 측정하여 <br />마스터 모니터 스피커의 권장 EQ 설정을 도출합니다.
                        </p>
                    </div>
                    <Link href="/" className="flex items-center gap-2 text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 px-4 rounded-xl transition dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                        <ArrowLeft className="w-4 h-4" /> 뒤로 이동
                    </Link>
                </header>

                {/* Theory Section */}
                <section className="bg-indigo-50/50 dark:bg-indigo-900/10 rounded-3xl p-8 border border-indigo-100 dark:border-indigo-900/30">
                    <h2 className="text-lg font-black text-indigo-900 dark:text-indigo-200 mb-4 flex items-center gap-2">
                        <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        룸 어쿠스틱(Room Acoustics) 핵심 이론
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                        <div className="space-y-2">
                            <h3 className="font-extrabold text-slate-900 dark:text-white border-b border-indigo-200 dark:border-indigo-800/50 pb-2">1. 공진 주파수(Standing Wave & Room Modes)</h3>
                            <p>
                                밀폐된 직육면체 방 안에서는 벽과 벽 사이를 소리(음파)가 오가며 서로 부딪쳐 <b>증폭(Constructive Interference)</b>되거나 <b>상쇄(Destructive Interference)</b>되는 현상이 발생합니다. 이를 정재파(Standing Wave)라고 합니다.
                            </p>
                            <p>
                                그 중 가장 낮은 주파수를 <b>1차 공진(Fundamental Mode)</b>이라고 하며, 이후 2배, 3배수에서 추가적인 공진이 나타납니다. 보통 작은 컨트롤 룸일수록 주파수가 낮아 저음역대에서 심한 "부밍(Booming)" 사운드를 유발합니다.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <h3 className="font-extrabold text-slate-900 dark:text-white border-b border-indigo-200 dark:border-indigo-800/50 pb-2">2. 잔향 시간(RT60, Reverberation Time)</h3>
                            <p>
                                소리가 발생한 공간에서 그 소스(원음)가 멈춘 후, 공간에 남은 소리 에너지가 <b>60dB 만큼 줄어드는 데 걸리는 시간</b>을 의미합니다. 
                            </p>
                            <p>
                                스튜디오나 컨트롤 룸의 이상적인 <b>RT60은 0.3초 ~ 0.5초</b> 사이입니다. 이보다 짧으면 소리가 부자연스럽게 마르고("데드" 상태), 너무 길면 소리가 번져서("라이브" 상태) 믹싱 디테일을 모니터링하기 매우 힘들어집니다. 흡음재 및 베이스트랩을 사방에 설치하여 이 잔향을 줄여야 합니다.
                            </p>
                        </div>
                    </div>
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Section 1: Dimensions Input */}
                    <section className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-6">
                            <Calculator className="w-5 h-5 text-indigo-500" /> 1. 공간 제원 (평면도) 입력
                        </h2>
                        
                        <div className="space-y-5">
                            <div className="flex items-center gap-4">
                                <label className="w-16 font-bold text-slate-600 dark:text-slate-400">가로 (L)</label>
                                <input type="number" step="0.1" value={length} onChange={(e) => setLength(e.target.value)} className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="미터(m)" />
                                <span className="font-bold text-slate-400">m</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <label className="w-16 font-bold text-slate-600 dark:text-slate-400">세로 (W)</label>
                                <input type="number" step="0.1" value={width} onChange={(e) => setWidth(e.target.value)} className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="미터(m)" />
                                <span className="font-bold text-slate-400">m</span>
                            </div>
                            <div className="flex items-center gap-4">
                                <label className="w-16 font-bold text-slate-600 dark:text-slate-400">높이 (H)</label>
                                <input type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} className="flex-1 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 font-mono font-bold focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="미터(m)" />
                                <span className="font-bold text-slate-400">m</span>
                            </div>
                        </div>

                        <div className="mt-8 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl p-4 border border-indigo-100 dark:border-indigo-900/50">
                            <h3 className="text-xs font-black tracking-widest text-indigo-500 uppercase mb-2">공진 주파수 산출 공식</h3>
                            <pre className="font-mono text-sm text-indigo-700 dark:text-indigo-300 font-bold">
                                f = 343 / (2 * 거리)
                            </pre>
                            <p className="text-xs text-indigo-600/70 dark:text-indigo-400 mt-2 font-medium">
                                * 343m/s : 실온에서의 소리의 속도. 방 안에서 파장이 마주치며 정재파(Standing Wave)가 발생합니다.
                            </p>
                        </div>
                    </section>

                    {/* Section 2: Calculated Modes & Frequency Generator */}
                    <section className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-200 dark:border-slate-800">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-6">
                            <Volume2 className="w-5 h-5 text-indigo-500" /> 2. 룸 모드 펀더멘털 청취
                        </h2>
                        
                        <div className="space-y-6">
                            {/* Length Modes */}
                            <div>
                                <h3 className="text-md font-bold text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">가로 공진 주파수 (Length)</h3>
                                <div className="grid grid-cols-3 gap-2">
                                    {(modes.L.length > 0 ? modes.L : [0,0,0]).map((freq, i) => (
                                        <button 
                                            key={`l-${i}`} 
                                            onClick={() => playTone(freq)}
                                            className={`p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all border ${playingFreq === freq ? 'bg-indigo-600 border-indigo-700 text-white shadow-md scale-105' : 'bg-slate-50 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 dark:bg-slate-950 dark:border-slate-800 dark:hover:border-indigo-700 text-slate-700 dark:text-slate-300'}`}
                                        >
                                            <span className="text-[10px] uppercase font-black opacity-70 border-b border-current pb-1 w-full text-center">{i+1}배수</span>
                                            <span className="font-mono font-bold text-lg flex items-center gap-1">{freq} <span className="text-[10px] opacity-70">Hz</span></span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Width Modes */}
                            <div>
                                <h3 className="text-md font-bold text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">세로 공진 주파수 (Width)</h3>
                                <div className="grid grid-cols-3 gap-2">
                                    {(modes.W.length > 0 ? modes.W : [0,0,0]).map((freq, i) => (
                                        <button 
                                            key={`w-${i}`} 
                                            onClick={() => playTone(freq)}
                                            className={`p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all border ${playingFreq === freq ? 'bg-blue-600 border-blue-700 text-white shadow-md scale-105' : 'bg-slate-50 border-slate-200 hover:border-blue-300 hover:bg-blue-50 dark:bg-slate-950 dark:border-slate-800 dark:hover:border-blue-700 text-slate-700 dark:text-slate-300'}`}
                                        >
                                            <span className="text-[10px] uppercase font-black opacity-70 border-b border-current pb-1 w-full text-center">{i+1}배수</span>
                                            <span className="font-mono font-bold text-lg flex items-center gap-1">{freq} <span className="text-[10px] opacity-70">Hz</span></span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            {/* Height Modes */}
                            <div>
                                <h3 className="text-md font-bold text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-100 dark:border-slate-800 pb-2">높이 공진 주파수 (Height)</h3>
                                <div className="grid grid-cols-3 gap-2">
                                    {(modes.H.length > 0 ? modes.H : [0,0,0]).map((freq, i) => (
                                        <button 
                                            key={`h-${i}`} 
                                            onClick={() => playTone(freq)}
                                            className={`p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all border ${playingFreq === freq ? 'bg-purple-600 border-purple-700 text-white shadow-md scale-105' : 'bg-slate-50 border-slate-200 hover:border-purple-300 hover:bg-purple-50 dark:bg-slate-950 dark:border-slate-800 dark:hover:border-purple-700 text-slate-700 dark:text-slate-300'}`}
                                        >
                                            <span className="text-[10px] uppercase font-black opacity-70 border-b border-current pb-1 w-full text-center">{i+1}배수</span>
                                            <span className="font-mono font-bold text-lg flex items-center gap-1">{freq} <span className="text-[10px] opacity-70">Hz</span></span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <button onClick={stopTone} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
                                    <Square className="w-4 h-4" /> 정지
                                </button>
                            </div>
                        </div>
                    </section>
                </div>

                {/* Section 3: RT60 Reverb Measurement (Full Width) */}
                <section className="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Mic className="w-5 h-5 text-indigo-500" /> 3. 공간 잔향 (RT60) 측정기
                        </h2>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <div className="flex-1 space-y-4">
                            <p className="text-sm font-medium text-slate-500 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                                <span className="font-bold text-indigo-600 dark:text-indigo-400">측정 방법: </span>
                                조용한 상태에서 [측정 시작]을 누르고, 큰 소리로 <b>크게 박수(Impulse) 한 번</b>을 치십시오. 
                                마이크가 소리 에너지가 감쇠되는 시간(20dB 감쇠 기준 외삽)을 측정하여 RT60을 추정합니다.
                            </p>

                            <div className="flex gap-4">
                                {!measuring ? (
                                    <button onClick={startRT60Measurement} className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3 px-6 rounded-2xl shadow-md transition-all active:scale-95">
                                        <Play className="w-5 h-5" /> 측정 시작 (마이크 권한 필요)
                                    </button>
                                ) : (
                                    <div className="flex-1 flex flex-col sm:flex-row gap-4">
                                        <div className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 text-white font-extrabold py-3 px-6 rounded-2xl shadow-md animate-pulse pointer-events-none">
                                            <Mic className="w-5 h-5" /> 큰 소리로 손뼉을 차세요! (대기중)
                                        </div>
                                        <button onClick={stopRT60Measurement} className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-2xl transition dark:bg-slate-800 dark:text-slate-300">
                                            <StopCircle className="w-5 h-5" /> 취소
                                        </button>
                                    </div>
                                )}
                            </div>

                            {micError && (
                                <div className="p-3 bg-red-50 text-red-600 text-sm font-bold rounded-xl border border-red-100 flex items-center gap-2 dark:bg-red-900/20 dark:border-red-900/50">
                                    <AlertCircle className="w-4 h-4" /> {micError}
                                </div>
                            )}
                        </div>

                        <div className="md:w-1/3 flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl min-h-[160px]">
                            <h3 className="text-xs uppercase font-black tracking-widest text-slate-400 mb-2">잔향 결과 (RT60)</h3>
                            {rt60Results['Broadband Estimation'] !== undefined ? (
                                <div className="text-center">
                                    <p className="text-4xl font-mono font-black text-slate-900 dark:text-white">
                                        {rt60Results['Broadband Estimation']?.toFixed(2)}<span className="text-lg text-slate-400 ml-1">sec</span>
                                    </p>
                                    <p className="mt-2 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full dark:bg-emerald-900/30 dark:text-emerald-400">
                                        측정 완료 (성공)
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm font-bold text-slate-400">대기 중...</p>
                            )}
                        </div>
                    </div>
                </section>

                {/* Section 4: AI Recommendations & Save */}
                <section className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-3xl p-[2px] shadow-lg">
                    <div className="bg-white dark:bg-slate-900 rounded-[22px] p-8 h-full">
                        <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                            <Info className="w-6 h-6 text-indigo-500" /> 4. 마스터 모니터 EQ 추천 및 저장
                        </h2>
                        
                        <div className="space-y-4 mb-8">
                            {getEQRecommendation().map((rec, i) => (
                                <div key={i} className="flex gap-4 items-start p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800">
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex justify-center items-center font-black shrink-0 dark:bg-indigo-900/40 dark:text-indigo-400">
                                        {i+1}
                                    </div>
                                    <p className="text-sm font-bold leading-relaxed text-slate-700 dark:text-slate-300">
                                        {rec}
                                    </p>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-4 justify-between border-t border-slate-100 dark:border-slate-800 pt-6">
                            <p className="text-sm text-slate-500 font-medium">
                                이 리포트를 <span className="font-bold text-slate-700 dark:text-slate-300">내 학습 공간</span>에 제출하여 교수님에게 검토 받으세요. (7주차 과제로 자동 분류됩니다.)
                            </p>
                            
                            <button 
                                onClick={handleSaveWorkspace}
                                disabled={saving}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-2xl shadow-xl shadow-indigo-600/20 transition-all disabled:opacity-50 active:scale-95"
                            >
                                {saving ? <><RefreshCw className="w-5 h-5 animate-spin" /> 저장 중...</> : <><Save className="w-5 h-5" /> 내 페이지로 과제 저장</>}
                            </button>
                        </div>
                        
                        {saveStatus === 'success' && (
                            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-700 font-bold dark:bg-emerald-900/20 dark:border-emerald-900/50 dark:text-emerald-400">
                                <CheckCircle2 className="w-5 h-5" /> 7주차 과제로 분석 리포트 제출이 완료되었습니다!
                            </div>
                        )}
                        {saveStatus === 'error' && (
                            <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-700 font-bold dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400">
                                <AlertCircle className="w-5 h-5" /> 서버 오류로 저장에 실패했습니다. 다시 시도해주세요.
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
