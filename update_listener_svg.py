import re

with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "r") as f:
    content = f.read()

old_svg = """                                    {/* Speaker and Listener */}
                                    <rect x={spkSideX - 0.15} y={spkSideY - 0.2} width="0.3" height="0.4" fill="#4f46e5" rx="0.05" className="cursor-move hover:brightness-110" />
                                    <circle cx={listSideX} cy={listSideY} r="0.15" fill="#f43f5e" className="cursor-move hover:brightness-110" />"""

new_svg = """                                    {/* Speaker and Listener */}
                                    <rect x={spkSideX - 0.15} y={spkSideY - 0.2} width="0.3" height="0.4" fill="#4f46e5" rx="0.05" className="cursor-move hover:brightness-110" />
                                    
                                    {/* Sitting Listener (Side View) */}
                                    <g transform={`translate(${listSideX}, ${listSideY}) scale(${spkSideX < listSideX ? -1 : 1}, 1)`} className="cursor-move hover:brightness-110">
                                        {/* Chair */}
                                        <rect x="-0.15" y="0.6" width="0.35" height="0.05" rx="0.02" fill="#64748b" /> {/* Seat */}
                                        <rect x="-0.15" y="0.1" width="0.05" height="0.55" rx="0.02" fill="#64748b" /> {/* Backrest */}
                                        <rect x="-0.1" y="0.65" width="0.04" height="0.55" fill="#475569" /> {/* Back leg */}
                                        <rect x="0.1" y="0.65" width="0.04" height="0.55" fill="#475569" /> {/* Front leg */}
                                        
                                        {/* Person */}
                                        {/* Calves and Feet */}
                                        <rect x="0.22" y="0.52" width="0.12" height="0.6" rx="0.06" fill="#be123c" /> {/* Calves - darker */}
                                        <rect x="0.22" y="1.06" width="0.2" height="0.14" rx="0.04" fill="#881337" /> {/* Feet */}
                                        
                                        {/* Torso & Thighs */}
                                        <rect x="-0.06" y="0.12" width="0.12" height="0.5" fill="#f43f5e" /> {/* Torso */}
                                        <rect x="-0.06" y="0.52" width="0.4" height="0.12" rx="0.06" fill="#e11d48" /> {/* Thighs */}
                                        
                                        {/* Head */}
                                        <circle cx="0" cy="0" r="0.12" fill="#f43f5e" />
                                    </g>"""

content = content.replace(old_svg, new_svg)

with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "w") as f:
    f.write(content)
