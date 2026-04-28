import re

with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "r") as f:
    content = f.read()

# Replace the state definition
content = content.replace("const [speakerAngle, setSpeakerAngle] = useState(30);", "const speakerAngle = 30;")

# Remove the Angle Slider UI block
ui_block = """                            {/* Angle Slider */}
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
                            </div>"""
content = content.replace(ui_block, "")

with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "w") as f:
    f.write(content)
