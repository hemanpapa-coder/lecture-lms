'use client';

import { useEffect, useState } from 'react';

export default function BookletClient({ courseName, pages }: {
    courseName: string,
    pages: any[]
}) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        // Add a slight delay to ensure fonts and styles are loaded before printing
        const timer = setTimeout(() => {
            window.print();
        }, 1500);
        return () => clearTimeout(timer);
    }, []);

    if (!mounted) return null;

    return (
        <div className="min-h-screen bg-white text-black p-8 print:p-0">
            {/* Global print styles */}
            <style jsx global>{`
                @media print {
                    @page {
                        margin: 15mm 10mm;
                    }
                    body {
                        background: white;
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                    }
                    /* Hide everything except this booklet container if needed */
                    nav, header, footer {
                        display: none !important;
                    }
                    .page-break-before {
                        page-break-before: always;
                    }
                    .avoid-break-inside {
                        page-break-inside: avoid;
                    }
                }
            `}</style>

            {/* Cover Page */}
            <div className="flex flex-col items-center justify-center min-h-[90vh] text-center page-break-before">
                <h1 className="text-5xl font-extrabold text-neutral-900 mb-6 tracking-tight">
                    {courseName}
                </h1>
                <p className="text-xl text-neutral-600 font-medium">
                    강의 소책자 (1주차 ~ 15주차)
                </p>
                <div className="mt-20 text-neutral-400">
                    <p>본 자료는 AI가 정리한 강의 요약본입니다.</p>
                </div>
            </div>

            {/* Content Pages */}
            {pages.map((page) => (
                <div key={page.week_number} className="page-break-before py-12 print:py-0">
                    <div className="mb-10 pb-4 border-b-2 border-neutral-200">
                        <span className="text-emerald-600 font-black tracking-widest uppercase text-sm mb-2 block">
                            Week {page.week_number}
                        </span>
                        <h2 className="text-3xl font-bold text-neutral-900">
                            {page.title || `${page.week_number}주차 강의 자료`}
                        </h2>
                    </div>

                    <div 
                        className="prose prose-neutral max-w-none prose-headings:font-bold prose-a:text-blue-600 print:prose-p:text-black print:prose-headings:text-black"
                        dangerouslySetInnerHTML={{ __html: page.ai_summary_html || '<p>요약 내용이 없습니다.</p>' }}
                    />
                </div>
            ))}
        </div>
    );
}
