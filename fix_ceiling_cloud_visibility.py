with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "r") as f:
    content = f.read()

old_code = """                                <button onClick={() => setCeilingCloud(!ceilingCloud)} className={`py-2 px-3 text-xs font-bold rounded-lg transition text-left col-span-2 ${ceilingCloud ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                    {ceilingCloud ? '✅ 천장 클라우드 (1차 반사 제어)' : '⬛ 천장 클라우드 (1차 반사 제어)'}
                                </button>"""

new_code = """                                {viewMode === 'side' && (
                                    <button onClick={() => setCeilingCloud(!ceilingCloud)} className={`py-2 px-3 text-xs font-bold rounded-lg transition text-left col-span-2 ${ceilingCloud ? 'bg-sky-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                                        {ceilingCloud ? '✅ 천장 클라우드 (1차 반사 제어)' : '⬛ 천장 클라우드 (1차 반사 제어)'}
                                    </button>
                                )}"""

content = content.replace(old_code, new_code)

with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "w") as f:
    f.write(content)
