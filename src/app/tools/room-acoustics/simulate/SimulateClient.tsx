'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { ArrowLeft, Save, Play, Square, Mic, StopCircle, RefreshCw, Volume2, Calculator, Info, CheckCircle2, AlertCircle, Waves } from 'lucide-react';
import Link from 'next/link';

type FurnitureType = 'bed' | 'desk' | 'bookshelf' | 'drawers' | 'hanger' | 'vanity';

interface Furniture {
    id: string;
    type: FurnitureType;
    x: number;
    y: number;
    w: number;
    l: number;
    h: number;
    z?: number;
}

function SbriSimulator({ length, width, height, wallMaterial, selectedFreqs = [] }: { length: number; width: number; height: number; wallMaterial: string; selectedFreqs?: number[] }) {
    // Listener position
    const [center, setCenter] = useState({ x: width / 2, y: length * 0.6 });
    // Distance between speakers (m)
    const [spacing, setSpacing] = useState(Math.min(1.5, width * 0.8));
    const [speakerAngle, setSpeakerAngle] = useState(30);
    const [speakerHeight, setSpeakerHeight] = useState(1.2);
    // 0=North, 90=East, 180=South, 270=West (Listener's facing direction)
    const [rotationDeg, setRotationDeg] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [draggingFurnitureId, setDraggingFurnitureId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'top' | 'side'>('top');
    const svgRef = useRef<SVGSVGElement>(null);

    // Acoustic Treatments
    const [frontWallTraps, setFrontWallTraps] = useState(false);
    const [frontDiffuser, setFrontDiffuser] = useState(false);
    const [cornerTraps, setCornerTraps] = useState(false);
    const [rearDiffuser, setRearDiffuser] = useState(false);
    const [sideWallTraps, setSideWallTraps] = useState(false);
    const [ceilingCloud, setCeilingCloud] = useState(false);

    // Corner Bass Trap Customization
    const [trapSize, setTrapSize] = useState<number>(0.6); // 0.2m ~ 1.2m
    const [trapDensity, setTrapDensity] = useState<string>('high_density'); // 'foam', 'low_density', 'high_density'

    // Front Wall Customization
    const [frontTrapSize, setFrontTrapSize] = useState<number>(0.3); // 0.1m ~ 1.0m
    const [frontTrapDensity, setFrontTrapDensity] = useState<string>('high_density');
    const [frontDiffuserSize, setFrontDiffuserSize] = useState<number>(0.2); // 0.1m ~ 0.4m

    // Rear Wall Customization
    const [rearDiffuserSize, setRearDiffuserSize] = useState<number>(0.2); // 0.1m ~ 0.4m

    // Side Wall Customization
    const [sideWallStyle, setSideWallStyle] = useState<string>('absorb'); // 'absorb', 'diffuse', 'mix'
    const [sideTrapSize, setSideTrapSize] = useState<number>(0.1); // 0.1m ~ 0.5m
    const [sideTrapDensity, setSideTrapDensity] = useState<string>('low_density');

    // Furniture
    const [furnitures, setFurnitures] = useState<Furniture[]>([]);
    const [newFurnitureType, setNewFurnitureType] = useState<FurnitureType>('bed');
    const [newFurnitureX, setNewFurnitureX] = useState<number>(0);
    const [newFurnitureY, setNewFurnitureY] = useState<number>(0);
    const [newFurnitureW, setNewFurnitureW] = useState<number>(1.5);
    const [newFurnitureL, setNewFurnitureL] = useState<number>(2.0);
    const [newFurnitureH, setNewFurnitureH] = useState<number>(0.5);
    const [newFurnitureZ, setNewFurnitureZ] = useState<number>(0);

    const addFurniture = () => {
        const newFurn: Furniture = {
            id: Math.random().toString(36).substr(2, 9),
            type: newFurnitureType,
            x: newFurnitureX,
            y: newFurnitureY,
            w: newFurnitureW,
            l: newFurnitureL,
            h: newFurnitureH,
            z: newFurnitureZ
        };
        setFurnitures([...furnitures, newFurn]);
    };

    const removeFurniture = (id: string) => {
        setFurnitures(furnitures.filter(f => f.id !== id));
    };

    // Keep within bounds when room size changes
    useEffect(() => {
        setCenter(c => ({
            x: Math.max(0, Math.min(c.x, width)),
            y: Math.max(0, Math.min(c.y, length))
        }));
    }, [length, width]);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (svgRef.current) {
            svgRef.current.setPointerCapture(e.pointerId);
        }
        
        const target = e.target as Element;
        const furnId = target.getAttribute('data-id') || target.closest('[data-id]')?.getAttribute('data-id');
        
        if (furnId) {
            setDraggingFurnitureId(furnId);
            setIsDragging(false);
        } else {
            setIsDragging(true);
            setDraggingFurnitureId(null);
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!svgRef.current) return;
        if (!isDragging && !draggingFurnitureId) return;

        const rect = svgRef.current.getBoundingClientRect();
        
        if (viewMode === 'top') {
            const svgX = ((e.clientX - rect.left) / rect.width) * width;
            const svgY = ((e.clientY - rect.top) / rect.height) * length;
            
            if (draggingFurnitureId) {
                setFurnitures(prev => prev.map(f => {
                    if (f.id === draggingFurnitureId) {
                        return {
                            ...f,
                            x: Math.max(0, Math.min(svgX - f.w / 2, width - f.w)),
                            y: Math.max(0, Math.min(svgY - f.l / 2, length - f.l))
                        };
                    }
                    return f;
                }));
            } else if (isDragging) {
                setCenter({
                    x: Math.max(0, Math.min(svgX, width)),
                    y: Math.max(0, Math.min(svgY, length))
                });
            }
        } else {
            // Side View Mode
            const sideW = rotationDeg === 0 || rotationDeg === 180 ? length : width;
            const svgX = ((e.clientX - rect.left) / rect.width) * sideW;
            const svgY = ((e.clientY - rect.top) / rect.height) * height;

            if (draggingFurnitureId) {
                setFurnitures(prev => prev.map(f => {
                    if (f.id === draggingFurnitureId) {
                        let newX = f.x;
                        let newY = f.y;
                        const fw = rotationDeg === 0 || rotationDeg === 180 ? f.l : f.w;
                        const centerX = svgX - fw / 2;
                        
                        if (rotationDeg === 0) newY = Math.max(0, Math.min(centerX, length - f.l));
                        else if (rotationDeg === 180) newY = length - Math.max(0, Math.min(centerX + f.l, length));
                        else if (rotationDeg === 90) newX = width - Math.max(0, Math.min(centerX + f.w, width));
                        else if (rotationDeg === 270) newX = Math.max(0, Math.min(centerX, width - f.w));

                        return {
                            ...f,
                            x: newX,
                            y: newY,
                            z: Math.max(0, Math.min(height - svgY - f.h / 2, height - f.h))
                        };
                    }
                    return f;
                }));
            } else if (isDragging) {
                // Prevent rotating listener in side view
                // Optionally allow dragging listener horizontally in side view
                const newSideX = Math.max(0, Math.min(svgX, sideW));
                setCenter(prev => {
                    if (rotationDeg === 0) return { ...prev, y: newSideX };
                    if (rotationDeg === 180) return { ...prev, y: length - newSideX };
                    if (rotationDeg === 90) return { ...prev, x: width - newSideX };
                    if (rotationDeg === 270) return { ...prev, x: newSideX };
                    return prev;
                });
            }
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (svgRef.current && svgRef.current.hasPointerCapture(e.pointerId)) {
            svgRef.current.releasePointerCapture(e.pointerId);
        }
        setIsDragging(false);
        setDraggingFurnitureId(null);
    };

    // Calculate geometry
    const toeInRad = (speakerAngle * Math.PI) / 180;
    const rad = (rotationDeg * Math.PI) / 180;
    const positionRad = (30 * Math.PI) / 180; // Fixed 30 degrees for equilateral triangle position
    
    // Rotate point around center
    const rotatePoint = (px: number, py: number) => {
        const nx = Math.cos(rad) * (px - center.x) - Math.sin(rad) * (py - center.y) + center.x;
        const ny = Math.sin(rad) * (px - center.x) + Math.cos(rad) * (py - center.y) + center.y;
        return { x: nx, y: ny };
    };

    // Base positions (facing North)
    const spkL_base = { x: center.x - spacing * Math.sin(positionRad), y: center.y - spacing * Math.cos(positionRad) };
    const spkR_base = { x: center.x + spacing * Math.sin(positionRad), y: center.y - spacing * Math.cos(positionRad) };

    const spkL = rotatePoint(spkL_base.x, spkL_base.y);
    const spkR = rotatePoint(spkR_base.x, spkR_base.y);

    // SBIR Distance Calculation
    let frontWallDistL = 0, frontWallDistR = 0;
    let sideWallDistL = 0, sideWallDistR = 0;

    if (rotationDeg === 0) { // Facing North
        frontWallDistL = spkL.y; frontWallDistR = spkR.y;
        sideWallDistL = Math.min(spkL.x, width - spkL.x); sideWallDistR = Math.min(spkR.x, width - spkR.x);
    } else if (rotationDeg === 90) { // Facing East
        frontWallDistL = width - spkL.x; frontWallDistR = width - spkR.x;
        sideWallDistL = Math.min(spkL.y, length - spkL.y); sideWallDistR = Math.min(spkR.y, length - spkR.y);
    } else if (rotationDeg === 180) { // Facing South
        frontWallDistL = length - spkL.y; frontWallDistR = length - spkR.y;
        sideWallDistL = Math.min(spkL.x, width - spkL.x); sideWallDistR = Math.min(spkR.x, width - spkR.x);
    } else if (rotationDeg === 270) { // Facing West
        frontWallDistL = spkL.x; frontWallDistR = spkR.x;
        sideWallDistL = Math.min(spkL.y, length - spkL.y); sideWallDistR = Math.min(spkR.y, length - spkR.y);
    }

    const v = 343;
    const minFrontDist = Math.max(0.1, Math.min(frontWallDistL, frontWallDistR));
    const minSideDist = Math.max(0.1, Math.min(sideWallDistL, sideWallDistR));

    const sbirFront = Math.round(v / (4 * minFrontDist));
    const sbirSide = Math.round(v / (4 * minSideDist));

    // Material and Treatment Effect Logic
    let sbirSeverity = "강함 (위상 캔슬링 심각)";
    let sbirColor = "text-rose-400";
    let trapEffectText = "";
    let frontEffectText = "";
    let sideEffectText = "";
    let rearEffectText = "";

    if (wallMaterial === 'glass' || wallMaterial === 'drywall') {
        sbirSeverity = "보통 (저음 통과/흡수됨)";
        sbirColor = "text-amber-400";
    }

    if (cornerTraps || frontWallTraps) {
        if ((cornerTraps && trapDensity === 'high_density') || (frontWallTraps && frontTrapDensity === 'high_density')) {
            sbirSeverity = "완화됨 (저음역대 방어)";
            sbirColor = "text-emerald-400";
        } else {
            sbirSeverity = "부분 완화됨 (고/중역대 흡수)";
            sbirColor = "text-amber-400";
        }
    }

    if (cornerTraps) {
        if (trapDensity === 'foam') {
            trapEffectText = `코너 스펀지 폼(${trapSize.toFixed(1)}m)은 초저역대(40~80Hz) 캔슬링을 거의 방어하지 못합니다. (음량 복구 0dB)`;
        } else if (trapDensity === 'low_density') {
            if (trapSize < 0.6) {
                trapEffectText = `코너 저밀도 흡음재(${trapSize.toFixed(1)}m)는 100Hz 이상의 중저역 캔슬링을 완화하지만, 초저역대 딥(Dip)은 남아있습니다. (음량 복구 +1~2dB)`;
            } else {
                trapEffectText = `코너 저밀도 흡음재를 두껍게(${trapSize.toFixed(1)}m) 설치하여 초저역대 캔슬링이 완화되었습니다. (음량 복구 +2~3dB)`;
            }
        } else if (trapDensity === 'high_density') {
            if (trapSize < 0.4) {
                trapEffectText = `코너 고밀도 미네랄울(${trapSize.toFixed(1)}m) 적용으로 저음역대 캔슬링이 효과적으로 완화되었습니다. (음량 복구 +2~3dB)`;
            } else {
                trapEffectText = `코너 고밀도 미네랄울을 충분히 두껍게(${trapSize.toFixed(1)}m) 설치하여 초저역대(40~80Hz) 캔슬링 딥(Dip) 구간의 볼륨이 대폭 회복되었습니다. (음량 복구 +3~5dB)`;
            }
        }
    }
    
    if (frontWallTraps) {
        if (frontTrapDensity === 'foam') {
            frontEffectText = `전면벽의 스펀지 폼(${frontTrapSize.toFixed(1)}m)은 중고음역 잔향만 제어하며 스피커 후면으로 돌아나가는 초저역대 SBIR 캔슬링은 전혀 막지 못합니다. (전면 딥 회복 0dB)`;
        } else if (frontTrapDensity === 'low_density') {
            frontEffectText = `전면벽 저밀도 흡음재(${frontTrapSize.toFixed(1)}m)로 인해 100~200Hz 대역의 전면 SBIR 캔슬링이 완화됩니다. (전면 딥 회복 +1~2dB)`;
        } else if (frontTrapDensity === 'high_density') {
            frontEffectText = `고밀도 전면 흡음재(${frontTrapSize.toFixed(1)}m)가 스피커 후면 방사음을 흡수하여 Front SBIR 캔슬링을 효과적으로 억제합니다. (전면 딥 회복 +2~4dB)`;
        }
    }

    if (frontDiffuser) {
        let lowestFreq = Math.round(343 / (frontDiffuserSize * 2));
        frontEffectText += (frontEffectText ? " " : "") + `전면 디퓨저(${frontDiffuserSize.toFixed(2)}m)가 스피커 사이의 공간감을 확장시킵니다. (분산 하한 주파수 약 ${lowestFreq}Hz)`;
    }

    if (sideWallTraps) {
        if (sideWallStyle === 'absorb') {
            if (sideTrapDensity === 'foam') {
                sideEffectText = `측면 스펀지 폼(${sideTrapSize.toFixed(2)}m)은 고음역대의 플러터 에코(Flutter Echo)만 잡아주며, 중저역대 반사음은 투과됩니다.`;
            } else {
                sideEffectText = `측면 100% 흡음(${sideTrapSize.toFixed(2)}m) 적용으로 스윗스팟을 향하는 1차 반사음이 제거되어 스테레오 이미지가 극도로 칼같이 선명해집니다. (단, 방이 다소 건조해질 수 있음)`;
            }
        } else if (sideWallStyle === 'diffuse') {
            let lowestFreq = Math.round(343 / (sideTrapSize * 2));
            sideEffectText = `측면 100% 분산(${sideTrapSize.toFixed(2)}m) 적용으로 공간감이 넓어지고 라이브한 느낌이 증가합니다. (분산 하한 주파수 약 ${lowestFreq}Hz. 좁은 방에서는 위상 간섭이 생길 수 있으니 주의)`;
        } else if (sideWallStyle === 'mix') {
            sideEffectText = `측면 흡음+분산 믹스 적용: 1차 반사 지점의 강한 에코는 흡음재로 제어하고 그 주변은 디퓨저로 분산시켜, 선명한 스테레오 이미지와 자연스러운 공간감을 동시에 확보합니다. (모던 스튜디오 추천 세팅)`;
        }
    }

    if (rearDiffuser) {
        let lowestFreq = Math.round(343 / (rearDiffuserSize * 2));
        rearEffectText = `후면벽 디퓨저(${rearDiffuserSize.toFixed(2)}m)가 뒷벽에서 튕겨오는 강한 에코를 기분 좋은 잔향으로 분산시켜 스윗스팟(청취 구역)을 확장합니다. 깊이가 깊을수록 더 낮은 중음역대(약 ${lowestFreq}Hz)까지 분산할 수 있습니다.`;
    }

    let furnitureEffectText = '';
    let hasCombFilterWarning = false;
    let combFilterNullFreq = 0;
    
    // 1. Sabine RT60 & Schroeder Frequency
    const volume = length * width * height;
    let base_alpha = 0.02; // concrete
    if (wallMaterial === 'glass') base_alpha = 0.03;
    else if (wallMaterial === 'drywall') base_alpha = 0.05;
    else if (wallMaterial === 'wood') base_alpha = 0.1;

    const surface_area_walls = 2 * (length * height) + 2 * (width * height);
    const surface_area_floor_ceil = 2 * (length * width);
    let total_absorption = (surface_area_walls * base_alpha) + (surface_area_floor_ceil * 0.05);

    if (furnitures.length > 0) {
        const bedOrHanger = furnitures.find(f => f.type === 'bed' || f.type === 'hanger');
        const bookshelf = furnitures.find(f => f.type === 'bookshelf');
        const desk = furnitures.find(f => f.type === 'desk');
        
        furnitures.forEach(f => {
            const f_area = 2 * (f.w * f.l) + 2 * (f.w * f.h) + 2 * (f.l * f.h);
            if (f.type === 'bed' || f.type === 'hanger') total_absorption += f_area * 0.6;
            else if (f.type === 'bookshelf') total_absorption += f_area * 0.3;
            else total_absorption += f_area * 0.05;
        });

        if (bedOrHanger) {
            furnitureEffectText += `침대나 옷걸이는 다공성 흡음재 역할을 하여 전반적인 잔향을 줄여줍니다. `;
        }
        if (bookshelf) {
            furnitureEffectText += `책꽂이는 불규칙한 표면으로 인해 자연스러운 1D/2D 디퓨저(QRD) 역할을 수행하여 고음역대 에코를 방지합니다. `;
        }
        if (desk) {
            // Comb Filtering Ray Tracing Math
            const distDirect = Math.sqrt(Math.pow(center.x - spkL.x, 2) + Math.pow(center.y - spkL.y, 2));
            const spkHeight = 1.2;
            const deskHeight = desk.h;
            const deltaH = spkHeight - deskHeight;
            // Reflected path distance
            const distReflect = Math.sqrt(Math.pow(center.x - spkL.x, 2) + Math.pow(center.y - spkL.y, 2) + Math.pow(2 * deltaH, 2));
            const timeDelay = (distReflect - distDirect) / v; // seconds
            
            if (timeDelay > 0) {
                combFilterNullFreq = Math.round(1 / (2 * timeDelay));
            }

            const deskCenterY = desk.y + desk.l / 2;
            const listenerY = center.y;
            const speakerY = spkL.y;
            if (deskCenterY > speakerY && deskCenterY < listenerY + 1) {
                furnitureEffectText += `책상 반사로 인해 약 ${combFilterNullFreq}Hz에서 빗살모양 필터(Comb Filtering) 위상 캔슬링이 발생할 확률이 높습니다. 스피커 각도를 조절하세요. `;
                hasCombFilterWarning = true;
            } else {
                furnitureEffectText += `책상 등의 단단한 가구는 고음역대 반사를 일으킬 수 있습니다. `;
            }
        }
    }

    if (cornerTraps) total_absorption += (height * trapSize) * 4 * 0.8;
    if (frontWallTraps) total_absorption += (width * frontTrapSize) * 0.6;

    const sabineRt60 = Math.round((0.161 * volume / total_absorption) * 100) / 100;
    const schroederFreq = Math.round(2000 * Math.sqrt(sabineRt60 / volume));

    // Pass the calculated effects back to the parent component for EQ recommendation
    useEffect(() => {
        if ((window as any).updateAcousticState) {
            (window as any).updateAcousticState({
                cornerTraps, frontWallTraps, sideWallTraps, furnitures, sbirFront, sbirSide, sbirSeverity, sabineRt60, schroederFreq, combFilterNullFreq
            });
        }
    }, [cornerTraps, frontWallTraps, sideWallTraps, furnitures, sbirFront, sbirSide, sbirSeverity, sabineRt60, schroederFreq, combFilterNullFreq]);

    const getFurnitureColor = (type: FurnitureType) => {
        switch(type) {
            case 'bed': return '#ec4899'; // pink
            case 'desk': return '#f59e0b'; // amber
            case 'bookshelf': return '#10b981'; // emerald
            case 'drawers': return '#6366f1'; // indigo
            case 'hanger': return '#8b5cf6'; // violet
            case 'vanity': return '#14b8a6'; // teal
            default: return '#94a3b8';
        }
    };
    
    const getFurnitureLabel = (type: FurnitureType) => {
        switch(type) {
            case 'bed': return '침대';
            case 'desk': return '책상';
            case 'bookshelf': return '책꽂이';
            case 'drawers': return '서랍장';
            case 'hanger': return '옷걸이';
            case 'vanity': return '화장대';
            default: return '가구';
        }
    };

    return (
        <section className="bg-slate-900 rounded-3xl p-8 shadow-sm border border-slate-800 flex flex-col mb-8">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
                <Waves className="w-5 h-5 text-rose-500" /> 4. 모니터 스피커 배치 및 패널 시뮬레이션
            </h2>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                벽체 소재와 음향 보강재(베이스트랩, 디퓨저)에 따른 반사음의 특성 변화를 시뮬레이션합니다.<br/>
                평면도 위에서 <b>청취자(빨간 원)를 드래그</b>하여 스피커 위치에 따른 캔슬링(딥) 변화를 관찰하세요.
            </p>

            <div className="flex justify-center mb-4 gap-2">
                <button onClick={() => setViewMode('top')} className={`px-5 py-2 text-xs font-bold rounded-full transition-colors ${viewMode === 'top' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>평면도 (Top View)</button>
                <button onClick={() => setViewMode('side')} className={`px-5 py-2 text-xs font-bold rounded-full transition-colors ${viewMode === 'side' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>측면도 (Side View)</button>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* 2D Canvas */}
                <div className="flex-1 bg-slate-950 rounded-2xl border border-slate-800 p-4 flex flex-col items-center">
                    <p className="text-[10px] font-black text-slate-600 mb-2 tracking-widest uppercase">
                        {viewMode === 'top' ? '북쪽 벽 (North Wall)' : '천장 (Ceiling)'}
                    </p>
                    
                    {viewMode === 'top' ? (
                    <svg 
                        ref={svgRef}
                        viewBox={`0 0 ${width} ${length}`} 
                        className="w-full max-w-[400px] bg-slate-900/50 border-2 border-slate-700 rounded-lg cursor-crosshair shadow-inner select-none touch-none"
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                    >
                        {/* Grid */}
                        <defs>
                            <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
                                <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.02" />
                            </pattern>
                            <pattern id="diffuser" width="0.2" height="0.2" patternUnits="userSpaceOnUse">
                                <rect width="0.1" height="0.2" fill="#8b5cf6" />
                            </pattern>
                            <pattern id="foamPattern" width="0.1" height="0.1" patternUnits="userSpaceOnUse">
                                <rect width="0.1" height="0.1" fill="#fcd34d" fillOpacity="0.8" />
                                <circle cx="0.05" cy="0.05" r="0.02" fill="#d97706" />
                            </pattern>
                        </defs>
                        <rect width={width} height={length} fill="url(#grid)" />
                        
                        {/* Wall Material Indicator */}
                        <rect 
                            width={width} height={length} 
                            fill="none" 
                            stroke={wallMaterial === 'concrete' ? '#64748b' : wallMaterial === 'wood' ? '#b45309' : wallMaterial === 'glass' ? '#38bdf8' : '#cbd5e1'} 
                            strokeWidth="0.2" 
                        />

                        {/* Corner Bass Traps */}
                        {cornerTraps && (
                            <>
                                <polygon points={`0,0 ${trapSize},0 0,${trapSize}`} fill={trapDensity === 'foam' ? 'url(#foamPattern)' : trapDensity === 'high_density' ? '#047857' : '#34d399'} fillOpacity={trapDensity === 'foam' ? 0.8 : 0.9} />
                                <polygon points={`${width},0 ${width-trapSize},0 ${width},${trapSize}`} fill={trapDensity === 'foam' ? 'url(#foamPattern)' : trapDensity === 'high_density' ? '#047857' : '#34d399'} fillOpacity={trapDensity === 'foam' ? 0.8 : 0.9} />
                                <polygon points={`0,${length} ${trapSize},${length} 0,${length-trapSize}`} fill={trapDensity === 'foam' ? 'url(#foamPattern)' : trapDensity === 'high_density' ? '#047857' : '#34d399'} fillOpacity={trapDensity === 'foam' ? 0.8 : 0.9} />
                                <polygon points={`${width},${length} ${width-trapSize},${length} ${width},${length-trapSize}`} fill={trapDensity === 'foam' ? 'url(#foamPattern)' : trapDensity === 'high_density' ? '#047857' : '#34d399'} fillOpacity={trapDensity === 'foam' ? 0.8 : 0.9} />
                            </>
                        )}

                        {/* Front Wall Traps (Relative to Rotation) */}
                        {frontWallTraps && rotationDeg === 0 && <rect x="0.5" y="0" width={width-1} height={frontTrapSize} fill={frontTrapDensity === 'foam' ? 'url(#foamPattern)' : frontTrapDensity === 'high_density' ? '#047857' : '#34d399'} fillOpacity={frontTrapDensity === 'foam' ? 0.8 : 0.9} />}
                        {frontWallTraps && rotationDeg === 90 && <rect x={width-frontTrapSize} y="0.5" width={frontTrapSize} height={length-1} fill={frontTrapDensity === 'foam' ? 'url(#foamPattern)' : frontTrapDensity === 'high_density' ? '#047857' : '#34d399'} fillOpacity={frontTrapDensity === 'foam' ? 0.8 : 0.9} />}
                        {frontWallTraps && rotationDeg === 180 && <rect x="0.5" y={length-frontTrapSize} width={width-1} height={frontTrapSize} fill={frontTrapDensity === 'foam' ? 'url(#foamPattern)' : frontTrapDensity === 'high_density' ? '#047857' : '#34d399'} fillOpacity={frontTrapDensity === 'foam' ? 0.8 : 0.9} />}
                        {frontWallTraps && rotationDeg === 270 && <rect x="0" y="0.5" width={frontTrapSize} height={length-1} fill={frontTrapDensity === 'foam' ? 'url(#foamPattern)' : frontTrapDensity === 'high_density' ? '#047857' : '#34d399'} fillOpacity={frontTrapDensity === 'foam' ? 0.8 : 0.9} />}

                        {/* Front Diffuser (Relative to Rotation) */}
                        {frontDiffuser && rotationDeg === 0 && <rect x="1" y={frontWallTraps ? frontTrapSize : 0} width={width-2} height={frontDiffuserSize} fill="url(#diffuser)" />}
                        {frontDiffuser && rotationDeg === 90 && <rect x={width-(frontWallTraps ? frontTrapSize : 0)-frontDiffuserSize} y="1" width={frontDiffuserSize} height={length-2} fill="url(#diffuser)" />}
                        {frontDiffuser && rotationDeg === 180 && <rect x="1" y={length-(frontWallTraps ? frontTrapSize : 0)-frontDiffuserSize} width={width-2} height={frontDiffuserSize} fill="url(#diffuser)" />}
                        {frontDiffuser && rotationDeg === 270 && <rect x={frontWallTraps ? frontTrapSize : 0} y="1" width={frontDiffuserSize} height={length-2} fill="url(#diffuser)" />}

                        {/* Side Wall Traps (Relative to Rotation) */}
                        {sideWallTraps && (rotationDeg === 0 || rotationDeg === 180) && (
                            <>
                                {(sideWallStyle === 'absorb' || sideWallStyle === 'mix') && (
                                    <>
                                        <rect x="0" y={length*0.25} width={sideTrapSize} height={length*0.5} fill={sideTrapDensity === 'foam' ? 'url(#foamPattern)' : sideTrapDensity === 'high_density' ? '#047857' : '#34d399'} fillOpacity={sideTrapDensity === 'foam' ? 0.8 : 0.9} />
                                        <rect x={width-sideTrapSize} y={length*0.25} width={sideTrapSize} height={length*0.5} fill={sideTrapDensity === 'foam' ? 'url(#foamPattern)' : sideTrapDensity === 'high_density' ? '#047857' : '#34d399'} fillOpacity={sideTrapDensity === 'foam' ? 0.8 : 0.9} />
                                    </>
                                )}
                                {(sideWallStyle === 'diffuse' || sideWallStyle === 'mix') && (
                                    <>
                                        <rect x={sideWallStyle === 'mix' ? sideTrapSize : 0} y={length*0.1} width={sideTrapSize} height={length*0.15} fill="url(#diffuser)" />
                                        <rect x={sideWallStyle === 'mix' ? sideTrapSize : 0} y={length*0.75} width={sideTrapSize} height={length*0.15} fill="url(#diffuser)" />
                                        <rect x={width-sideTrapSize-(sideWallStyle === 'mix' ? sideTrapSize : 0)} y={length*0.1} width={sideTrapSize} height={length*0.15} fill="url(#diffuser)" />
                                        <rect x={width-sideTrapSize-(sideWallStyle === 'mix' ? sideTrapSize : 0)} y={length*0.75} width={sideTrapSize} height={length*0.15} fill="url(#diffuser)" />
                                        
                                        {sideWallStyle === 'diffuse' && (
                                            <>
                                                <rect x="0" y={length*0.25} width={sideTrapSize} height={length*0.5} fill="url(#diffuser)" />
                                                <rect x={width-sideTrapSize} y={length*0.25} width={sideTrapSize} height={length*0.5} fill="url(#diffuser)" />
                                            </>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                        {sideWallTraps && (rotationDeg === 90 || rotationDeg === 270) && (
                            <>
                                {(sideWallStyle === 'absorb' || sideWallStyle === 'mix') && (
                                    <>
                                        <rect x={width*0.25} y="0" width={width*0.5} height={sideTrapSize} fill={sideTrapDensity === 'foam' ? 'url(#foamPattern)' : sideTrapDensity === 'high_density' ? '#047857' : '#34d399'} fillOpacity={sideTrapDensity === 'foam' ? 0.8 : 0.9} />
                                        <rect x={width*0.25} y={length-sideTrapSize} width={width*0.5} height={sideTrapSize} fill={sideTrapDensity === 'foam' ? 'url(#foamPattern)' : sideTrapDensity === 'high_density' ? '#047857' : '#34d399'} fillOpacity={sideTrapDensity === 'foam' ? 0.8 : 0.9} />
                                    </>
                                )}
                                {(sideWallStyle === 'diffuse' || sideWallStyle === 'mix') && (
                                    <>
                                        <rect x={width*0.1} y={sideWallStyle === 'mix' ? sideTrapSize : 0} width={width*0.15} height={sideTrapSize} fill="url(#diffuser)" />
                                        <rect x={width*0.75} y={sideWallStyle === 'mix' ? sideTrapSize : 0} width={width*0.15} height={sideTrapSize} fill="url(#diffuser)" />
                                        <rect x={width*0.1} y={length-sideTrapSize-(sideWallStyle === 'mix' ? sideTrapSize : 0)} width={width*0.15} height={sideTrapSize} fill="url(#diffuser)" />
                                        <rect x={width*0.75} y={length-sideTrapSize-(sideWallStyle === 'mix' ? sideTrapSize : 0)} width={width*0.15} height={sideTrapSize} fill="url(#diffuser)" />

                                        {sideWallStyle === 'diffuse' && (
                                            <>
                                                <rect x={width*0.25} y="0" width={width*0.5} height={sideTrapSize} fill="url(#diffuser)" />
                                                <rect x={width*0.25} y={length-sideTrapSize} width={width*0.5} height={sideTrapSize} fill="url(#diffuser)" />
                                            </>
                                        )}
                                    </>
                                )}
                            </>
                        )}

                        {/* Rear Diffuser (Relative to Rotation) */}
                        {rearDiffuser && rotationDeg === 0 && <rect x="1" y={length-rearDiffuserSize} width={width-2} height={rearDiffuserSize} fill="url(#diffuser)" />}
                        {rearDiffuser && rotationDeg === 90 && <rect x="0" y="1" width={rearDiffuserSize} height={length-2} fill="url(#diffuser)" />}
                        {rearDiffuser && rotationDeg === 180 && <rect x="1" y="0" width={width-2} height={rearDiffuserSize} fill="url(#diffuser)" />}
                        {rearDiffuser && rotationDeg === 270 && <rect x={width-rearDiffuserSize} y="1" width={rearDiffuserSize} height={length-2} fill="url(#diffuser)" />}

                        {/* Furniture (Top View) */}
                        {furnitures.map(furn => (
                            <g key={`top-${furn.id}`} 
                               className={draggingFurnitureId === furn.id ? "cursor-grabbing opacity-80" : "cursor-grab"}
                            >
                                <rect 
                                    data-id={furn.id}
                                    x={furn.x} y={furn.y} width={furn.w} height={furn.l} 
                                    fill={getFurnitureColor(furn.type)} fillOpacity="0.4" 
                                    stroke={getFurnitureColor(furn.type)} strokeWidth="0.05" 
                                />
                                <text x={furn.x + furn.w/2} y={furn.y + furn.l/2 + 0.1} fontSize="0.3" fill="white" textAnchor="middle" className="font-bold opacity-80 pointer-events-none">{getFurnitureLabel(furn.type)}</text>
                            </g>
                        ))}

                        {/* Sweet Spot Highlight (Wider if diffuser enabled) */}
                        <circle cx={center.x} cy={center.y} r={rearDiffuser ? 0.6 : 0.3} fill="rgba(139, 92, 246, 0.15)" className="pointer-events-none" />

                        {/* Listener Triangle */}
                        <polygon 
                            points={`${spkL.x},${spkL.y} ${spkR.x},${spkR.y} ${center.x},${center.y}`}
                            fill="rgba(99, 102, 241, 0.05)"
                            stroke="rgba(99, 102, 241, 0.4)"
                            strokeWidth="0.05"
                            strokeDasharray="0.1, 0.1"
                            className="pointer-events-none"
                        />

                        {/* Speaker L */}
                        <g transform={`translate(${spkL.x}, ${spkL.y}) rotate(${rotationDeg + speakerAngle})`} className="pointer-events-none">
                            <rect x="-0.15" y="-0.2" width="0.3" height="0.4" fill="#4f46e5" rx="0.05" />
                            <circle cx="0" cy="0" r="0.1" fill="#312e81" />
                        </g>

                        {/* Speaker R */}
                        <g transform={`translate(${spkR.x}, ${spkR.y}) rotate(${rotationDeg - speakerAngle})`} className="pointer-events-none">
                            <rect x="-0.15" y="-0.2" width="0.3" height="0.4" fill="#4f46e5" rx="0.05" />
                            <circle cx="0" cy="0" r="0.1" fill="#312e81" />
                        </g>

                        {/* Listener */}
                        <circle cx={center.x} cy={center.y} r="0.2" fill="#f43f5e" className="pointer-events-none" />
                        <text x={center.x} y={center.y + 0.4} fontSize="0.15" fill="#f43f5e" textAnchor="middle" fontWeight="bold" className="pointer-events-none">청취자</text>
                    </svg>
                    ) : (
                    <svg 
                        viewBox={`0 0 ${rotationDeg === 0 || rotationDeg === 180 ? length : width} ${height}`} 
                        className="w-full max-w-[400px] bg-slate-900/50 border-2 border-slate-700 rounded-lg shadow-inner select-none"
                    >
                        {/* Grid & Gradients */}
                        <defs>
                            <pattern id="sidegrid" width="1" height="1" patternUnits="userSpaceOnUse">
                                <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.02" />
                            </pattern>
                            {/* Standing Wave Gradients for Side View */}
                            {selectedFreqs.map(f => {
                                const V = 343;
                                const stopsX = [], stopsZ = [];
                                let hasX = false, hasZ = false;
                                
                                const sideW = rotationDeg === 0 || rotationDeg === 180 ? length : width;
                                
                                for (let n = 1; n <= 4; n++) {
                                    if (Math.abs(f - (n * V / (2 * sideW))) < 0.5) {
                                        hasX = true;
                                        for (let k = 0; k <= n * 2; k++) {
                                            stopsX.push(<stop key={k} offset={`${(k / (n * 2)) * 100}%`} stopColor={rotationDeg === 0 || rotationDeg === 180 ? "#d946ef" : "#0ea5e9"} stopOpacity={k % 2 === 0 ? 0.25 : 0} />);
                                        }
                                    }
                                    if (Math.abs(f - (n * V / (2 * height))) < 0.5) {
                                        hasZ = true;
                                        for (let k = 0; k <= n * 2; k++) {
                                            stopsZ.push(<stop key={k} offset={`${(k / (n * 2)) * 100}%`} stopColor="#f59e0b" stopOpacity={k % 2 === 0 ? 0.25 : 0} />);
                                        }
                                    }
                                }
                                
                                return (
                                    <React.Fragment key={`side-${f}`}>
                                        {hasX && <linearGradient id={`grad-side-x-${f}`} x1="0" x2="1" y1="0" y2="0">{stopsX}</linearGradient>}
                                        {hasZ && <linearGradient id={`grad-side-z-${f}`} x1="0" x2="0" y1="0" y2="1">{stopsZ}</linearGradient>}
                                    </React.Fragment>
                                );
                            })}
                        </defs>
                        <rect x="0" y="0" width={rotationDeg === 0 || rotationDeg === 180 ? length : width} height={height} fill="url(#sidegrid)" />
                        
                        {/* Standing Wave Visualizations */}
                        {selectedFreqs.map(f => {
                            const sideW = rotationDeg === 0 || rotationDeg === 180 ? length : width;
                            return (
                                <React.Fragment key={`wave-side-${f}`}>
                                    <rect x="0" y="0" width={sideW} height={height} fill={`url(#grad-side-x-${f})`} style={{ mixBlendMode: 'screen' }} className="pointer-events-none" />
                                    <rect x="0" y="0" width={sideW} height={height} fill={`url(#grad-side-z-${f})`} style={{ mixBlendMode: 'screen' }} className="pointer-events-none" />
                                </React.Fragment>
                            );
                        })}
                        
                        {/* Calculate Side View Coordinates */}
                        {(() => {
                            const sideW = rotationDeg === 0 || rotationDeg === 180 ? length : width;
                            const spkSideX = rotationDeg === 0 ? spkL.y : rotationDeg === 180 ? length - spkL.y : rotationDeg === 90 ? width - spkL.x : spkL.x;
                            const listSideX = rotationDeg === 0 ? center.y : rotationDeg === 180 ? length - center.y : rotationDeg === 90 ? width - center.x : center.x;
                            const spkSideY = height - speakerHeight;
                            const listSideY = height - 1.2;

                            return (
                                <>
                                    {/* Acoustic Panels in Side View */}
                                    {frontWallTraps && <rect x="0" y="0" width={frontTrapSize} height={height} fill="#10b981" opacity="0.6" />}
                                    {frontDiffuser && <rect x={frontWallTraps ? frontTrapSize : 0} y={height * 0.2} width={frontDiffuserSize} height={height * 0.6} fill="#8b5cf6" opacity="0.6" />}
                                    {rearDiffuser && <rect x={sideW - rearDiffuserSize} y={height * 0.2} width={rearDiffuserSize} height={height * 0.6} fill="#8b5cf6" opacity="0.6" />}
                                    {ceilingCloud && <rect x={sideW * 0.2} y="0.05" width={sideW * 0.6} height="0.15" fill="#0ea5e9" opacity="0.8" rx="0.05" />}
                                    
                                                                        
                                                                        
                                    {/* Desk Comb Filter Reflection */}
                                    {combFilterNullFreq > 0 && (
                                        <>
                                            <rect x={(spkSideX + listSideX)/2 - 0.4} y={height - 0.75} width="0.8" height="0.75" fill="#f59e0b" opacity="0.3" rx="0.05" />
                                            <text x={(spkSideX + listSideX)/2} y={height - 0.3} fontSize="0.15" fill="#f59e0b" textAnchor="middle" fontWeight="bold">책상</text>
                                                                                    </>
                                    )}

                                    {/* Direct path */}
                                    <line x1={spkSideX} y1={spkSideY} x2={listSideX} y2={listSideY} stroke="#10b981" strokeWidth="0.03" opacity="0.8" />
                                    
                                    {/* Furnitures in Side View */}
                                    {furnitures.map(f => {
                                        const furnSideX = rotationDeg === 0 ? f.y : rotationDeg === 180 ? length - f.y - f.l : rotationDeg === 90 ? width - f.x - f.w : f.x;
                                        const furnSideW = rotationDeg === 0 || rotationDeg === 180 ? f.l : f.w;
                                        const fZ = f.z || 0;
                                        
                                        return (
                                            <rect 
                                                key={`side-furn-${f.id}`}
                                                x={furnSideX} 
                                                y={height - fZ - f.h} 
                                                width={furnSideW} 
                                                height={f.h} 
                                                fill={getFurnitureColor(f.type)} 
                                                rx="0.05" 
                                                data-id={f.id}
                                                className="cursor-move hover:brightness-110 transition-all"
                                                style={{ stroke: draggingFurnitureId === f.id ? 'white' : 'none', strokeWidth: 0.05 }}
                                            />
                                        );
                                    })}
                                    
                                    {/* Speaker and Listener */}
                                    <rect x={spkSideX - 0.15} y={spkSideY - 0.2} width="0.3" height="0.4" fill="#4f46e5" rx="0.05" className="cursor-move hover:brightness-110" />
                                    <circle cx={listSideX} cy={listSideY} r="0.15" fill="#f43f5e" className="cursor-move hover:brightness-110" />
                                    
                                    <text x={spkSideX} y={spkSideY - 0.3} fontSize="0.12" fill="white" textAnchor="middle">스피커</text>
                                    <text x={listSideX} y={listSideY - 0.3} fontSize="0.12" fill="white" textAnchor="middle">청취자</text>
                                </>
                            );
                        })()}
                    </svg>
                    )}
                    <p className="text-[10px] font-black text-slate-600 mt-2 tracking-widest uppercase">
                        {viewMode === 'top' ? '남쪽 벽 (South Wall)' : '바닥 (Floor)'}
                    </p>
                </div>

                {/* Info Panel */}
                <div className="flex-1 space-y-4">
                    <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                        <h3 className="font-extrabold text-white mb-4 text-sm">🎛️ 스피커 및 패널 조작</h3>
                        
                        <div className="space-y-4">
                            <div className="bg-slate-800/80 p-3 rounded-lg border border-slate-700/50 mb-4">
                                <p className="text-[11px] text-slate-300 leading-relaxed">
                                    <span className="font-bold text-emerald-400">※ 단위 안내:</span> T는 두께를 나타냅니다 (T 단위는 센티(cm)와 같고 두께를 나타냅니다). K는 밀도를 나타내는 단위입니다.
                                </p>
                            </div>

                            {/* Treatments Toggles */}
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <button onClick={() => setCornerTraps(!cornerTraps)} className={`py-2 px-3 text-xs font-bold rounded-lg transition text-left ${cornerTraps ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                    {cornerTraps ? '✅ 코너 베이스트랩' : '⬛ 코너 베이스트랩'}
                                </button>
                                <button onClick={() => setSideWallTraps(!sideWallTraps)} className={`py-2 px-3 text-xs font-bold rounded-lg transition text-left ${sideWallTraps ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                    {sideWallTraps ? '✅ 측면 패널 (흡음/분산)' : '⬛ 측면 패널 (흡음/분산)'}
                                </button>
                                <button onClick={() => setFrontWallTraps(!frontWallTraps)} className={`py-2 px-3 text-xs font-bold rounded-lg transition text-left ${frontWallTraps ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                    {frontWallTraps ? '✅ 전면벽 흡음재' : '⬛ 전면벽 흡음재'}
                                </button>
                                <button onClick={() => setFrontDiffuser(!frontDiffuser)} className={`py-2 px-3 text-xs font-bold rounded-lg transition text-left ${frontDiffuser ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                    {frontDiffuser ? '✅ 전면 디퓨저' : '⬛ 전면 디퓨저'}
                                </button>
                                <button onClick={() => setRearDiffuser(!rearDiffuser)} className={`py-2 px-3 text-xs font-bold rounded-lg transition text-left ${rearDiffuser ? 'bg-violet-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                    {rearDiffuser ? '✅ 후면 디퓨저' : '⬛ 후면 디퓨저'}
                                </button>
                                <button onClick={() => setCeilingCloud(!ceilingCloud)} className={`py-2 px-3 text-xs font-bold rounded-lg transition text-left col-span-2 ${ceilingCloud ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                    {ceilingCloud ? '✅ 천장 클라우드 (1차 반사 제어)' : '⬛ 천장 클라우드 (1차 반사 제어)'}
                                </button>
                            </div>

                            {/* Corner Trap Detailed Controls */}
                            {cornerTraps && (
                                <div className="bg-slate-700/50 p-3 rounded-xl border border-slate-600/50 mb-4 space-y-3">
                                    <label className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                        <Waves className="w-3 h-3 text-emerald-400" /> 코너 베이스트랩 세부 설정
                                    </label>
                                    
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs font-bold text-slate-300">재질 및 밀도</span>
                                        </div>
                                        <select 
                                            value={trapDensity}
                                            onChange={(e) => setTrapDensity(e.target.value)}
                                            className="w-full bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 outline-none cursor-pointer"
                                        >
                                            <option value="foam">폴리우레탄 폼 (스펀지)</option>
                                            <option value="low_density">저밀도 유리섬유 (24k~48k)</option>
                                            <option value="high_density">고밀도 미네랄울 (80k 이상)</option>
                                        </select>
                                    </div>
                                    
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-xs font-bold text-slate-300">두께/크기 추천 프리셋</span>
                                        </div>
                                        <select 
                                            value={trapSize}
                                            onChange={(e) => setTrapSize(parseFloat(e.target.value))}
                                            className="w-full bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 outline-none cursor-pointer"
                                        >
                                            <option value={0.2}>200T (기본형 코너 트랩)</option>
                                            <option value={0.4}>400T (표준 광대역 코너 트랩)</option>
                                            <option value={0.6}>600T (슈퍼청크 - 딥베이스 제어 탁월, 추천)</option>
                                            <option value={0.8}>800T (초대형 베이스트랩)</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* Front Wall Trap Detailed Controls */}
                            {(frontWallTraps || frontDiffuser) && (
                                <div className="bg-slate-700/50 p-3 rounded-xl border border-slate-600/50 mb-4 space-y-3">
                                    <label className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                        <Waves className="w-3 h-3 text-emerald-400" /> 전면벽 세부 설정
                                    </label>
                                    
                                    {frontWallTraps && (
                                        <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-600/50">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[10px] font-bold text-emerald-300">흡음재 재질/밀도</span>
                                            </div>
                                            <select 
                                                value={frontTrapDensity}
                                                onChange={(e) => setFrontTrapDensity(e.target.value)}
                                                className="w-full bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5 mb-2 focus:ring-1 focus:ring-emerald-500 outline-none cursor-pointer"
                                            >
                                                <option value="foam">폴리우레탄 폼 (스펀지)</option>
                                                <option value="low_density">저밀도 유리섬유 (24k~48k)</option>
                                                <option value="high_density">고밀도 미네랄울 (80k 이상)</option>
                                            </select>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[10px] font-bold text-slate-300">흡음재 두께 추천 프리셋</span>
                                            </div>
                                            <select 
                                                value={frontTrapSize}
                                                onChange={(e) => setFrontTrapSize(parseFloat(e.target.value))}
                                                className="w-full bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 outline-none cursor-pointer"
                                            >
                                                <option value={0.1}>100T (기본 고/중역 제어)</option>
                                                <option value={0.2}>200T (표준 광대역 흡음 추천)</option>
                                                <option value={0.3}>300T (강력한 전면 반사음 제어)</option>
                                            </select>
                                        </div>
                                    )}

                                    {frontDiffuser && (
                                        <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-600/50">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[10px] font-bold text-violet-300">디퓨저 깊이 추천 프리셋</span>
                                            </div>
                                            <select 
                                                value={frontDiffuserSize}
                                                onChange={(e) => setFrontDiffuserSize(parseFloat(e.target.value))}
                                                className="w-full bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-violet-500 outline-none cursor-pointer"
                                            >
                                                <option value={0.1}>100T (고역 위상 분산)</option>
                                                <option value={0.2}>200T (표준 1D QRD 추천)</option>
                                                <option value={0.3}>300T (깊은 중역대 분산)</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Side Wall Detailed Controls */}
                            {sideWallTraps && (
                                <div className="bg-slate-700/50 p-3 rounded-xl border border-slate-600/50 mb-4 space-y-3">
                                    <label className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                        <Waves className="w-3 h-3 text-emerald-400" /> 측면 패널 세부 설정
                                    </label>

                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[10px] font-bold text-slate-300">설치 방식 (Style)</span>
                                        </div>
                                        <select 
                                            value={sideWallStyle}
                                            onChange={(e) => setSideWallStyle(e.target.value)}
                                            className="w-full bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 outline-none cursor-pointer"
                                        >
                                            <option value="absorb">100% 흡음 (선명도 극대화 / 믹싱 추천)</option>
                                            <option value="diffuse">100% 분산 (잔향, 공간감 극대화 / 감상 추천)</option>
                                            <option value="mix">흡음 + 분산 혼합 (1차 반사 흡음, 주변 분산 / 밸런스 추천)</option>
                                        </select>
                                    </div>
                                    
                                    {(sideWallStyle === 'absorb' || sideWallStyle === 'mix') && (
                                        <div>
                                            <div className="flex justify-between items-center mt-2 mb-1">
                                                <span className="text-[10px] font-bold text-emerald-300">흡음재 재질/밀도</span>
                                            </div>
                                            <select 
                                                value={sideTrapDensity}
                                                onChange={(e) => setSideTrapDensity(e.target.value)}
                                                className="w-full bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 outline-none cursor-pointer"
                                            >
                                                <option value="foam">폴리우레탄 폼 (계란판 스펀지)</option>
                                                <option value="low_density">일반 유리섬유 패널</option>
                                                <option value="high_density">고밀도 어쿠스틱 패널</option>
                                            </select>
                                        </div>
                                    )}
                                    
                                    <div>
                                        <div className="flex justify-between items-center mt-2 mb-1">
                                            <span className="text-[10px] font-bold text-slate-300">패널 두께/깊이 추천 프리셋</span>
                                        </div>
                                        <select 
                                            value={sideTrapSize}
                                            onChange={(e) => setSideTrapSize(parseFloat(e.target.value))}
                                            className="w-full bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 outline-none cursor-pointer"
                                        >
                                            <option value={0.05}>50T (초기 반사음 고역 제어)</option>
                                            <option value={0.1}>100T (표준 1차 반사 제어 추천)</option>
                                            <option value={0.2}>200T (광대역 흡음 및 분산)</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* Rear Diffuser Detailed Controls */}
                            {rearDiffuser && (
                                <div className="bg-slate-700/50 p-3 rounded-xl border border-slate-600/50 mb-4 space-y-3">
                                    <label className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                                        <Waves className="w-3 h-3 text-violet-400" /> 후면 디퓨저 세부 설정
                                    </label>
                                    
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[10px] font-bold text-violet-300">디퓨저 깊이 추천 프리셋</span>
                                        </div>
                                        <select 
                                            value={rearDiffuserSize}
                                            onChange={(e) => setRearDiffuserSize(parseFloat(e.target.value))}
                                            className="w-full bg-slate-800 border border-slate-600 text-white text-xs rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-violet-500 outline-none cursor-pointer"
                                        >
                                            <option value={0.15}>150T (일반 후면 디퓨저)</option>
                                            <option value={0.25}>250T (스윗스팟 확장형, 추천)</option>
                                            <option value={0.3}>300T (하이엔드 공간감 극대화)</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* Rotation */}
                            <div className={viewMode === 'side' ? 'opacity-50 pointer-events-none' : ''}>
                                <label className="text-xs font-bold text-slate-400 block mb-2">청취자 방향 (Rotation) {viewMode === 'side' && '(측면도 불가)'}</label>
                                <div className="flex gap-2">
                                    {[0, 90, 180, 270].map(deg => (
                                        <button 
                                            key={deg} 
                                            onClick={() => setRotationDeg(deg)}
                                            className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${rotationDeg === deg ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                        >
                                            {deg === 0 ? '북(N)' : deg === 90 ? '동(E)' : deg === 180 ? '남(S)' : '서(W)'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            {/* Speaker Height Slider */}
                            {viewMode === 'side' && (
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <label className="text-xs font-bold text-slate-400">스피커 높이</label>
                                        <span className="text-xs font-mono font-bold text-indigo-400">{speakerHeight.toFixed(2)} m</span>
                                    </div>
                                    <input 
                                        type="range" min="0.2" max={height - 0.2} step="0.05" 
                                        value={speakerHeight} onChange={(e) => setSpeakerHeight(parseFloat(e.target.value))}
                                        className="w-full accent-indigo-500"
                                    />
                                </div>
                            )}
                            
                            {/* Spacing Slider */}
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-xs font-bold text-slate-400">스피커-청취자 거리</label>
                                    <span className="text-xs font-mono font-bold text-indigo-400">{spacing.toFixed(1)} m</span>
                                </div>
                                <input 
                                    type="range" min="0.5" max={Math.max(1, width)} step="0.1" 
                                    value={spacing} onChange={(e) => setSpacing(parseFloat(e.target.value))}
                                    className="w-full accent-indigo-500"
                                />
                            </div>

                            {/* Angle Slider */}
                            <div className="mt-4">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-xs font-bold text-slate-400">스피커 토인(Toe-in) 꺾임 각도 (1채널 당)</label>
                                    <span className="text-xs font-mono font-bold text-indigo-400">{speakerAngle} °</span>
                                </div>
                                <input 
                                    type="range" min="0" max="60" step="1" 
                                    value={speakerAngle} onChange={(e) => setSpeakerAngle(parseFloat(e.target.value))}
                                    className="w-full accent-indigo-500"
                                />
                                <p className="text-[10px] text-slate-500 mt-1">※ 30도가 청취자를 정확히 향하는 각도입니다 (정삼각형 배치 기준).</p>
                            </div>
                        </div>

                        {/* Furniture Controls */}
                        <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700 mt-6">
                            <h3 className="font-extrabold text-white mb-4 text-sm flex items-center gap-2">
                                가구 배치 (Furniture Layout)
                            </h3>
                            <div className="flex flex-col gap-3 mb-4">
                                <div className="flex gap-2 items-center">
                                    <select 
                                        value={newFurnitureType} 
                                        onChange={(e) => setNewFurnitureType(e.target.value as FurnitureType)}
                                        className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold text-slate-200 focus:ring-2 focus:ring-indigo-500 flex-1"
                                    >
                                        <option value="bed">침대 (Bed)</option>
                                        <option value="desk">책상 (Desk)</option>
                                        <option value="bookshelf">책꽂이 (Bookshelf)</option>
                                        <option value="drawers">서랍장 (Drawers)</option>
                                        <option value="hanger">옷걸이 (Hanger)</option>
                                        <option value="vanity">화장대 (Vanity)</option>
                                    </select>
                                    <button 
                                        onClick={addFurniture}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition"
                                    >
                                        + 추가
                                    </button>
                                </div>
                                <div className="grid grid-cols-5 gap-2">
                                    <div>
                                        <label className="text-[10px] text-slate-400 block mb-1">X좌표</label>
                                        <input type="number" step="0.1" value={newFurnitureX} onChange={e => setNewFurnitureX(parseFloat(e.target.value)||0)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-400 block mb-1">Y좌표</label>
                                        <input type="number" step="0.1" value={newFurnitureY} onChange={e => setNewFurnitureY(parseFloat(e.target.value)||0)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-400 block mb-1">W(폭)</label>
                                        <input type="number" step="0.1" value={newFurnitureW} onChange={e => setNewFurnitureW(parseFloat(e.target.value)||0)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-400 block mb-1">L(길이)</label>
                                        <input type="number" step="0.1" value={newFurnitureL} onChange={e => setNewFurnitureL(parseFloat(e.target.value)||0)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-400 block mb-1">H(높이)</label>
                                        <input type="number" step="0.1" value={newFurnitureH} onChange={e => setNewFurnitureH(parseFloat(e.target.value)||0)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                                    </div>
                                </div>
                            </div>
                            
                            {furnitures.length > 0 && (
                                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2">
                                    {furnitures.map(furn => (
                                        <div key={furn.id} className="flex items-center justify-between bg-slate-900/50 p-2 rounded-lg border border-slate-700/50">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getFurnitureColor(furn.type) }} />
                                                <span className="text-xs font-bold text-slate-300">{getFurnitureLabel(furn.type)}</span>
                                                <span className="text-[10px] text-slate-500">[{furn.w}x{furn.l}x{furn.h}]</span>
                                            </div>
                                            <button onClick={() => removeFurniture(furn.id)} className="text-[10px] text-rose-400 hover:text-rose-300 px-2">삭제</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700">
                        <h3 className="font-extrabold text-white mb-3 text-sm flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-rose-400" /> 주파수 반사 특성 분석
                        </h3>
                        
                        <div className="space-y-4">
                            <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/50">
                                <p className="text-[10px] font-bold text-slate-400 mb-1">벽체 마감 및 저음역대 캔슬링 강도</p>
                                <p className={`text-sm font-black ${sbirColor}`}>{sbirSeverity}</p>
                                {wallMaterial === 'concrete' && !frontWallTraps && !cornerTraps && <p className="text-xs text-rose-300/80 mt-1">콘크리트 벽이 저음을 강하게 반사하여 심각한 딥(Dip)을 유발합니다.</p>}
                                {wallMaterial === 'drywall' && !frontWallTraps && !cornerTraps && <p className="text-xs text-amber-300/80 mt-1">석고보드가 저음을 일부 흡수하여 캔슬링이 약간 완화됩니다.</p>}
                                {wallMaterial === 'glass' && !frontWallTraps && !cornerTraps && <p className="text-xs text-amber-300/80 mt-1">저음이 유리를 투과하여 캔슬링 딥은 약해지나 방음이 취약합니다.</p>}
                                {wallMaterial === 'wood' && !frontWallTraps && !cornerTraps && <p className="text-xs text-indigo-300/80 mt-1">목재 패널이 중저역을 흡수하여 자연스러운 잔향을 제공합니다.</p>}
                                
                                {cornerTraps && trapEffectText && (
                                    <p className="text-xs text-emerald-300/90 mt-2 font-medium bg-emerald-900/30 p-2.5 rounded-lg border border-emerald-800/50 leading-relaxed">
                                        💡 {trapEffectText}
                                    </p>
                                )}
                                
                                {frontWallTraps && frontEffectText && (
                                    <p className="text-xs text-emerald-300/90 mt-2 font-medium bg-emerald-900/30 p-2.5 rounded-lg border border-emerald-800/50 leading-relaxed">
                                        💡 {frontEffectText}
                                    </p>
                                )}

                                {sideWallTraps && sideEffectText && (
                                    <p className="text-xs text-emerald-300/90 mt-2 font-medium bg-emerald-900/30 p-2.5 rounded-lg border border-emerald-800/50 leading-relaxed">
                                        💡 {sideEffectText}
                                    </p>
                                )}

                                {frontDiffuser && (
                                    <p className="text-xs text-violet-300/90 mt-2 font-medium bg-violet-900/30 p-2.5 rounded-lg border border-violet-800/50 leading-relaxed">
                                        💡 {frontEffectText.split('전면 디퓨저')[1] ? `전면 디퓨저${frontEffectText.split('전면 디퓨저')[1]}` : ''}
                                    </p>
                                )}
                                
                                {rearDiffuser && rearEffectText && (
                                    <p className="text-xs text-violet-300/90 mt-2 font-medium bg-violet-900/30 p-2.5 rounded-lg border border-violet-800/50 leading-relaxed">
                                        💡 {rearEffectText}
                                    </p>
                                )}

                                {furnitureEffectText && (
                                    <p className="text-xs text-blue-300/90 mt-2 font-medium bg-blue-900/30 p-2.5 rounded-lg border border-blue-800/50 leading-relaxed">
                                        🪑 {furnitureEffectText}
                                    </p>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 mb-1">전면 벽 (Front) SBIR</p>
                                    <div className="flex items-end gap-1">
                                        <span className={`text-2xl font-black ${sbirColor}`}>{sbirFront}</span>
                                        <span className={`font-bold pb-1 text-xs ${sbirColor}`}>Hz</span>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 mb-1">측면 벽 (Side) SBIR</p>
                                    <div className="flex items-end gap-1">
                                        <span className={`text-2xl font-black ${sbirColor}`}>{sbirSide}</span>
                                        <span className={`font-bold pb-1 text-xs ${sbirColor}`}>Hz</span>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-slate-700/50">
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">물리 음향(Acoustics) 정밀 분석</h4>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                                        <span className="text-slate-500 block text-[9px] mb-1">슈뢰더 주파수 (Schroeder Freq)</span>
                                        <span className="font-bold text-indigo-400">{schroederFreq} Hz</span>
                                        <p className="text-[8px] text-slate-500 mt-1 leading-tight">이 대역 아래는 파동 음향(정재파) 제어가 필요합니다.</p>
                                    </div>
                                    <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                                        <span className="text-slate-500 block text-[9px] mb-1">예측 잔향 (Sabine RT60)</span>
                                        <span className="font-bold text-teal-400">{sabineRt60} s</span>
                                        <p className="text-[8px] text-slate-500 mt-1 leading-tight">마감재 및 가구 표면적을 바탕으로 계산된 이론치입니다.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <p className="text-xs text-slate-400 mt-5 bg-slate-900/50 p-4 rounded-xl leading-relaxed border border-indigo-900/30">
                            <b>💡 해결책:</b> 스피커가 벽에서 어중간하게 떨어져 있으면(1~2m) 흡음이 매우 어려운 <b>초저역대(40~80Hz)</b>에서 캔슬링이 발생합니다.<br/>
                            따라서 <b>스피커를 벽에 0.8m 이내로 바짝 붙여서(Flush Mount 효과)</b> 캔슬링 주파수를 <b>흡음이 수월한 100Hz~200Hz 이상 대역으로 밀어내고</b>, 스피커 바로 뒤(반사 지점)에 두꺼운 <b>베이스트랩이나 전면 흡음재</b>를 설치하는 것이 스튜디오 세팅의 정석입니다.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}


import { useSearchParams, useRouter } from "next/navigation";
export function SimulateClient({ userId, courseId, userName }: { userId?: string, courseId?: string | null, userName?: string }) {
    const supabase = createClient();
    
    // Room Dimensions (meters)
    const searchParams = useSearchParams();
    const router = useRouter();
    const [length, setLength] = useState<string>(searchParams.get('L') || '5.0');
    const [width, setWidth] = useState<string>(searchParams.get('W') || '4.0');
    const [height, setHeight] = useState<string>(searchParams.get('H') || '3.0');
    const [wallMaterial, setWallMaterial] = useState<string>(searchParams.get('mat') || 'concrete');

    // Calculated Frequencies
    interface Modes {
        L: number[]; W: number[]; H: number[];
        tangential: number[];
        oblique: number[];
    }
    const [modes, setModes] = useState<Modes>({ L: [], W: [], H: [], tangential: [], oblique: [] });
    
    // Audio Context State
    const audioCtxRef = useRef<AudioContext | null>(null);
    const oscRef = useRef<OscillatorNode | null>(null);
    const oscListRef = useRef<{ osc: OscillatorNode; gain: GainNode }[]>([]);
    const [playingFreq, setPlayingFreq] = useState<number | null>(null);
    const initialFreqs = new Set<number>();
    const freqsParam = searchParams?.get('freqs');
    if (freqsParam) {
        freqsParam.split(',').forEach(f => {
            if (!isNaN(parseFloat(f))) initialFreqs.add(parseFloat(f));
        });
    }
    const [selectedFreqs, setSelectedFreqs] = useState<Set<number>>(initialFreqs);

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
    const [measurementState, setMeasurementState] = useState<'idle' | 'waiting' | 'recording_decay'>('idle');
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const reqFrameRef = useRef<number | null>(null);

    // Save State
    const [saving, setSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [acousticState, setAcousticState] = useState<any>({});

    useEffect(() => {
        (window as any).updateAcousticState = (state: any) => {
            setAcousticState(state);
        };
    }, []);

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

        const tangential = [];
        const oblique = [];
        if (L > 0 && W > 0 && H > 0) {
            const tang_110 = (v / 2) * Math.sqrt(Math.pow(1/L, 2) + Math.pow(1/W, 2));
            tangential.push(Math.round(tang_110 * 10) / 10);
            const obli_111 = (v / 2) * Math.sqrt(Math.pow(1/L, 2) + Math.pow(1/W, 2) + Math.pow(1/H, 2));
            oblique.push(Math.round(obli_111 * 10) / 10);
        }

        setModes({
            L: calcModes(L),
            W: calcModes(W),
            H: calcModes(H),
            tangential,
            oblique
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
            setCurrentVolume(-100);
            
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContextClass) {
                throw new Error("브라우저가 오디오 컨텍스트를 지원하지 않습니다.");
            }

            if (!audioCtxRef.current) audioCtxRef.current = new AudioContextClass();
            if (audioCtxRef.current.state === 'suspended') {
                await audioCtxRef.current.resume();
            }

            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("브라우저에서 마이크 접근 기능을 지원하지 않거나, 보안 연결(HTTPS)이 아닙니다.");
            }

            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }});
            streamRef.current = stream;
            
            const source = audioCtxRef.current.createMediaStreamSource(stream);
            const analyser = audioCtxRef.current.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.2;
            source.connect(analyser);
            analyzerRef.current = analyser;

            setMeasuring(true);
            setMeasurementState('waiting');
            
            const dataArray = new Float32Array(analyser.fftSize);
            
            let state: 'waiting' | 'recording_decay' = 'waiting';
            let peakLevel = -Infinity;
            let peakTime = 0;
            
            const measure = () => {
                if (!analyser) return;
                
                analyser.getFloatTimeDomainData(dataArray);

                let sumSquares = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sumSquares += dataArray[i] * dataArray[i];
                }
                const rms = Math.sqrt(sumSquares / dataArray.length);
                const currentDb = 20 * Math.log10(rms || 0.00001);
                
                setCurrentVolume(currentDb);

                if (state === 'waiting') {
                    if (currentDb > -15) { // Impulse threshold met
                        state = 'recording_decay';
                        setMeasurementState('recording_decay');
                        peakLevel = currentDb;
                        peakTime = performance.now();
                    }
                } else if (state === 'recording_decay') {
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
            setMeasurementState('idle');
        }
    };

    const stopRT60Measurement = () => {
        setMeasuring(false);
        setMeasurementState('idle');
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (reqFrameRef.current) cancelAnimationFrame(reqFrameRef.current);
    };

    const getEQRecommendation = () => {
        let recs = [];
        const allFrequencies = [...modes.L, ...modes.W, ...modes.H];
        const rt60 = rt60Results['Broadband Estimation'] || acousticState.sabineRt60;
        const targetFreqs = selectedFreqs.size > 0
            ? Array.from(selectedFreqs).sort((a, b) => a - b)
            : null;

        // Acoustic treatments applied in the simulator
        const hasBassTraps = acousticState.cornerTraps || acousticState.frontWallTraps;
        const hasBroadbandAbsorber = acousticState.furnitures && acousticState.furnitures.some((f: any) => f.type === 'bed' || f.type === 'hanger');
        const hasDesk = acousticState.furnitures && acousticState.furnitures.some((f: any) => f.type === 'desk');

        if (targetFreqs && targetFreqs.length > 0) {
            targetFreqs.forEach(freq => {
                const qValue = hasBassTraps ? 4.0 : 2.5; // Narrower Q if traps already handle broadband
                const gain = hasBassTraps ? -2.0 : -5.0;
                let eqRec = `[선택된 공진음] DSP Biquad Param: [Filter: Bell, Freq: ${freq}Hz, Q: ${qValue.toFixed(1)}, Gain: ${gain.toFixed(1)}dB]`;
                if (hasBassTraps) {
                    eqRec += ` — 물리적 제어가 선행되어 EQ 보정폭을 최소화했습니다.`;
                } else {
                    eqRec += ` — 베이스트랩이 없어 정재파가 강합니다. Q값을 다소 넓게 잡고 깊게 컷합니다.`;
                }
                recs.push(eqRec);
            });
        } else if (allFrequencies.length > 0) {
            const lowest = Math.min(...allFrequencies);
            const gain = hasBassTraps ? -2.0 : -4.0;
            recs.push(`[최저역 정재파 방어] DSP Biquad Param: [Filter: Bell, Freq: ${lowest}Hz, Q: 2.0, Gain: ${gain.toFixed(1)}dB] — 가장 강한 1배수 정재파를 타겟팅합니다.`);
        }

        // SBIR Compensation
        if (acousticState.sbirFront) {
            if (acousticState.sbirSeverity?.includes('심각')) {
                recs.push(`[물리적 한계 경고] 전면벽 반사로 인한 ${acousticState.sbirFront}Hz 캔슬링 딥(Dip)은 EQ로 절대 부스트(+dB)하지 마십시오. 파동의 소멸 간섭 위치이므로 스피커 앰프에 왜곡만 초래합니다. 물리적 스피커 이동이 유일한 해답입니다.`);
            } else {
                recs.push(`[SBIR 보상] 전면벽 흡음 처리로 캔슬링이 완화됨. DSP Biquad Param: [Filter: Bell, Freq: ${acousticState.sbirFront}Hz, Q: 1.5, Gain: +1.5dB]`);
            }
        }

        // Comb Filtering Compensation
        if (hasDesk && acousticState.combFilterNullFreq) {
            recs.push(`[책상 반사음 경고] Ray Tracing 결과 ${acousticState.combFilterNullFreq}Hz 주변에서 책상 반사로 인한 콤브 필터링이 발생합니다. EQ로 해결할 수 없는 위상 문제이므로, 모니터 스피커의 각도를 귀 쪽으로(Toe-in) 숙이거나 모니터 패드를 사용해 높이를 올리세요.`);
        }

        if (rt60 !== undefined && rt60 !== null) {
            if (rt60 > 0.6) {
                if (hasBroadbandAbsorber) {
                    recs.push(`[잔향 제어] RT60: ${rt60}초. 다공성 흡음 가구가 있으나 저역 제어에 한계가 있음. DSP Biquad Param: [Filter: Low Shelf, Freq: 150Hz, Q: 0.7, Gain: -2.0dB]`);
                } else {
                    recs.push(`[잔향 제어] RT60: ${rt60}초. 방이 너무 울림. DSP Biquad Param: [Filter: High Shelf, Freq: 5000Hz, Q: 0.7, Gain: -1.5dB] — 고역을 깎아 산만한 소리를 정리하세요.`);
                }
            } else if (rt60 < 0.2) {
                recs.push(`[데드 룸 보상] RT60: ${rt60}초. 흡음이 과도함. DSP Biquad Param: [Filter: High Shelf, Freq: 10000Hz, Q: 0.7, Gain: +2.0dB] — 에어(Air) 대역을 보상하세요.`);
            } else {
                recs.push(`[잔향 최적] 잔향 시간(RT60: ${rt60}초)이 이상적인 표준 범위입니다. 별도의 쉘빙 EQ 보상이 필요하지 않습니다.`);
            }
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

            if (!courseId) {
                throw new Error("수강 중인 과목 정보가 없어 저장할 수 없습니다.");
            }

            // Fetch existing note for week 7
            const { data: existingNote } = await supabase
                .from('student_notes')
                .select('content')
                .eq('user_id', userId)
                .eq('course_id', courseId)
                .eq('week_number', 7)
                .maybeSingle();

            const newContent = (existingNote?.content ? existingNote.content + '<br/><br/><hr/><br/>' : '') + htmlContent;

            // Save to student_notes (homework submission for week 7)
            const { error } = await supabase
                .from('student_notes')
                .upsert({
                    user_id: userId,
                    course_id: courseId,
                    week_number: 7,
                    content: newContent,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id,course_id,week_number' });

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
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 sm:p-10 shadow-sm border border-slate-200 dark:border-slate-800 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-rose-500/10 dark:bg-rose-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <span className="px-3 py-1 text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 rounded-full">
                                    Acoustics Step 3
                                </span>
                                <span className="px-3 py-1 text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 rounded-full flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                    시뮬레이션 페이지
                                </span>
                            </div>
                            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                                룸 어쿠스틱 <span className="text-emerald-500">시뮬레이터</span>
                            </h1>
                            <p className="mt-3 text-slate-600 dark:text-slate-400 text-sm sm:text-base max-w-2xl">
                                스피커를 배치하고 음향 패널을 적용하여 시뮬레이션 결과를 확인하세요.
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
                    <div className="flex flex-col items-center opacity-50">
                        <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-500 flex items-center justify-center font-bold">2</div>
                        <span className="text-xs mt-2 font-semibold text-slate-500">측정</span>
                    </div>
                    <div className="w-16 h-1 bg-blue-600 rounded"></div>
                    <div className="flex flex-col items-center">
                        <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold shadow-lg shadow-emerald-500/30">3</div>
                        <span className="text-xs mt-2 font-semibold text-emerald-600 dark:text-emerald-400">시뮬레이션</span>
                    </div>
                </div>
                <SbriSimulator 
                    length={parseFloat(width) || 4} 
                    width={parseFloat(length) || 5} 
                    height={parseFloat(height) || 3}
                    wallMaterial={wallMaterial} 
                    selectedFreqs={Array.from(selectedFreqs)}
                />

                {/* Section 5: AI Recommendations & Save */}
                <section className="bg-gradient-to-br from-indigo-900 to-purple-900 rounded-3xl p-[2px] shadow-lg">
                    <div className="bg-white dark:bg-slate-900 rounded-[22px] p-8 h-full">
                        <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                            <Info className="w-6 h-6 text-indigo-500" /> 5. 마스터 모니터 EQ 추천 및 저장
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
