'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useState, useEffect } from 'react';
import { Smartphone, Monitor, Download, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

export default function QRDisplay() {
    const [baseUrl, setBaseUrl] = useState('');
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        setBaseUrl(window.location.origin);
    }, []);

    const loginUrl = `${baseUrl}/auth/login`;

    return (
        <div className="bg-white dark:bg-neutral-900 rounded-3xl p-8 shadow-sm border border-neutral-200/60 dark:border-neutral-800 flex flex-col items-center">
            <div 
                className="text-center w-full cursor-pointer group flex items-start gap-4"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg dark:bg-indigo-900/30 dark:text-indigo-400 shrink-0 mt-1">
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
                <div className="text-left flex-1">
                    <h2 className="text-2xl font-black text-neutral-900 dark:text-white mb-2">홈페이지 접속용 QR 코드</h2>
                    <p className="text-neutral-500 text-sm font-medium">학생들이 스마트폰 카메라로 스캔하거나 대화면에 띄워 빠르게 접속할 수 있습니다.</p>
                </div>
            </div>

            {isExpanded && (
                <div className="mt-8 flex flex-col items-center w-full animate-in fade-in slide-in-from-top-2">

            <div className="bg-white p-6 rounded-3xl shadow-xl border border-neutral-100 dark:border-neutral-800 mb-8 print-area">
                {baseUrl ? (
                    <div className="flex flex-col items-center">
                        <QRCodeSVG
                            value={loginUrl}
                            size={256}
                            level="H"
                            includeMargin={true}
                            imageSettings={{
                                src: "/favicon.ico",
                                x: undefined,
                                y: undefined,
                                height: 40,
                                width: 40,
                                excavate: true,
                            }}
                        />
                        <p className="mt-4 text-xs font-bold text-neutral-900 hidden print:block">
                            {baseUrl}
                        </p>
                    </div>
                ) : (
                    <div className="w-[256px] h-[256px] bg-neutral-100 animate-pulse rounded-2xl flex items-center justify-center">
                        <p className="text-xs text-neutral-400">URL 생성 중...</p>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-md print:hidden">
                <button 
                    onClick={() => {
                        const baseUrlToCopy = loginUrl;
                        navigator.clipboard.writeText(baseUrlToCopy).then(() => {
                            alert('링크가 복사되었습니다. 스마트폰이나 다른 기기로 전송하여 접속하세요.');
                        });
                    }}
                    className="p-4 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-2xl border border-indigo-100 dark:border-indigo-800/50 flex flex-col items-center text-center transition cursor-pointer text-left w-full"
                >
                    <Smartphone className="w-6 h-6 text-indigo-600 mb-2" />
                    <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-300">모바일 스캔 (링크 복사)</h3>
                    <p className="text-[11px] text-indigo-700/70 dark:text-indigo-400/70 mt-1">링크를 복사하여 카카오톡 등으로 전송</p>
                </button>
                <button 
                    onClick={() => window.open(`${baseUrl}/auth/qr`, '_blank', 'width=1000,height=800,menubar=no,toolbar=no')}
                    className="p-4 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-2xl border border-emerald-100 dark:border-emerald-800/50 flex flex-col items-center text-center transition cursor-pointer text-left w-full"
                >
                    <Monitor className="w-6 h-6 text-emerald-600 mb-2" />
                    <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-300">대화면 게시 (새 창 열기)</h3>
                    <p className="text-[11px] text-emerald-700/70 dark:text-emerald-400/70 mt-1">전자교탁이나 모니터에 독립된 창으로 띄우기</p>
                </button>
            </div>

            <div className="mt-8 flex gap-3 print:hidden">
                <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
                >
                    <Download className="w-4 h-4" /> QR 코드 인쇄/저장
                </button>
                <a
                    href={loginUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-6 py-3 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-xl font-bold text-sm transition-all"
                >
                    <ExternalLink className="w-4 h-4" /> 링크 확인하기
                </a>
            </div>

            <p className="mt-6 text-[11px] text-neutral-400 font-mono print:hidden">
                접속 주소: {loginUrl}
            </p>

            <style jsx global>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .print-area, .print-area * {
                        visibility: visible;
                    }
                    .print-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        display: flex !important;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        border: none !important;
                        box-shadow: none !important;
                        padding-top: 100px;
                    }
                }
            `}</style>
                </div>
            )}
        </div>
    );
}
