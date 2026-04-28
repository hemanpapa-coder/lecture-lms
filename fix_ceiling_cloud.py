import re

with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "r") as f:
    content = f.read()

# Wrap ceiling cloud and floor rug (if it exists) with viewMode === 'side'
old_ceiling = """{/* 천장 클라우드 (Ceiling Cloud) */}
                            <button 
                                onClick={() => setCeilingCloud(!ceilingCloud)}
                                className={`flex items-center gap-2 p-3 rounded-lg border font-bold text-xs transition ${
                                    ceilingCloud 
                                      ? 'bg-slate-700/80 border-slate-600 text-slate-200' 
                                      : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-800'
                                }`}
                            >
                                {ceilingCloud ? '✅ 천장 클라우드 (1차 반사 제어)' : '⬛ 천장 클라우드 (1차 반사 제어)'}
                            </button>"""

new_ceiling = """{/* 천장 클라우드 (Ceiling Cloud) - 측면도에서만 표시 */}
                            {viewMode === 'side' && (
                                <button 
                                    onClick={() => setCeilingCloud(!ceilingCloud)}
                                    className={`flex items-center gap-2 p-3 rounded-lg border font-bold text-xs transition ${
                                        ceilingCloud 
                                        ? 'bg-slate-700/80 border-slate-600 text-slate-200' 
                                        : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-800'
                                    }`}
                                >
                                    {ceilingCloud ? '✅ 천장 클라우드 (1차 반사 제어)' : '⬛ 천장 클라우드 (1차 반사 제어)'}
                                </button>
                            )}"""
                            
content = content.replace(old_ceiling, new_ceiling)

with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "w") as f:
    f.write(content)
