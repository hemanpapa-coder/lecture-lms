'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useState, useEffect } from 'react';

export default function QRFullscreen() {
    const [baseUrl, setBaseUrl] = useState('');

    useEffect(() => {
        setBaseUrl(window.location.origin);
    }, []);

    const loginUrl = `${baseUrl}/auth/login`;

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8">
            <h1 className="text-4xl md:text-5xl font-black text-white mb-10 text-center tracking-tight leading-tight">
                스마트 강의실 접속
            </h1>
            
            <div className="bg-white p-6 md:p-10 rounded-[2.5rem] shadow-2xl flex flex-col items-center">
                {baseUrl ? (
                    <QRCodeSVG
                        value={loginUrl}
                        size={400}
                        level="H"
                        includeMargin={true}
                        imageSettings={{
                            src: "/favicon.ico",
                            x: undefined,
                            y: undefined,
                            height: 60,
                            width: 60,
                            excavate: true,
                        }}
                    />
                ) : (
                    <div className="w-[400px] h-[400px] bg-slate-100 animate-pulse rounded-3xl flex items-center justify-center">
                        <p className="text-xl text-slate-400 font-bold">QR 코드 생성 중...</p>
                    </div>
                )}
                
                <p className="mt-8 text-xl md:text-2xl font-bold text-slate-800 tracking-wide text-center">
                    스마트폰 기본 카메라로 화면을 스캔하세요
                </p>
                <p className="mt-3 text-lg font-medium text-slate-500 text-center">
                    {loginUrl}
                </p>
            </div>
        </div>
    );
}
