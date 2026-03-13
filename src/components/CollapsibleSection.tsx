'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export default function CollapsibleSection({ 
    title, 
    subtitle, 
    headerRight, 
    children, 
    defaultExpanded = false 
}: { 
    title: React.ReactNode, 
    subtitle?: React.ReactNode, 
    headerRight?: React.ReactNode, 
    children: React.ReactNode, 
    defaultExpanded?: boolean 
}) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded)

    return (
        <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div 
                className={`p-8 flex justify-between items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${isExpanded ? 'border-b border-slate-100 dark:border-slate-800' : ''}`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="group block transition">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors">{title}</h2>
                    {subtitle && <p className="text-sm font-medium text-slate-500 mt-1">{subtitle}</p>}
                </div>
                <div className="flex items-center gap-4">
                    {headerRight && <div onClick={(e) => e.stopPropagation()}>{headerRight}</div>}
                    <div className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition">
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                    </div>
                </div>
            </div>
            
            {isExpanded && (
                <div className="animate-in slide-in-from-top-2 fade-in duration-200">
                    {children}
                </div>
            )}
        </div>
    )
}
