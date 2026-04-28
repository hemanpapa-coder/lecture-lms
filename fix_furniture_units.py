import re

with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "r") as f:
    content = f.read()

# 1. Update initial states from meters to mm
content = content.replace("useState<number>(1.5);", "useState<number>(1500);")
content = content.replace("useState<number>(1.9);", "useState<number>(1900);")
content = content.replace("useState<number>(0.5);", "useState<number>(500);")

# 2. Update addFurniture to convert mm to meters
old_add = """        const newFurn: FurnitureItem = {
            id: Date.now().toString(),
            type: newFurnitureType,
            x: newFurnitureX,
            y: newFurnitureY,
            z: newFurnitureZ,
            w: newFurnitureW,
            l: newFurnitureL,
            h: newFurnitureH
        };"""
new_add = """        const newFurn: FurnitureItem = {
            id: Date.now().toString(),
            type: newFurnitureType,
            x: newFurnitureX / 1000,
            y: newFurnitureY / 1000,
            z: newFurnitureZ / 1000,
            w: newFurnitureW / 1000,
            l: newFurnitureL / 1000,
            h: newFurnitureH / 1000
        };"""
content = content.replace(old_add, new_add)

# 3. Update the inputs in the UI
old_grid = """                                <div className="grid grid-cols-5 gap-2">
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
                                </div>"""

new_grid = """                                <div className="grid grid-cols-6 gap-2">
                                    <div>
                                        <label className="text-[10px] text-slate-400 block mb-1">X(mm)</label>
                                        <input type="number" step="1" value={newFurnitureX} onChange={e => setNewFurnitureX(parseFloat(e.target.value)||0)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-400 block mb-1">Y(mm)</label>
                                        <input type="number" step="1" value={newFurnitureY} onChange={e => setNewFurnitureY(parseFloat(e.target.value)||0)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-400 block mb-1">Z(바닥,mm)</label>
                                        <input type="number" step="1" value={newFurnitureZ} onChange={e => setNewFurnitureZ(parseFloat(e.target.value)||0)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-400 block mb-1">W(폭,mm)</label>
                                        <input type="number" step="1" value={newFurnitureW} onChange={e => setNewFurnitureW(parseFloat(e.target.value)||0)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-400 block mb-1">L(길이,mm)</label>
                                        <input type="number" step="1" value={newFurnitureL} onChange={e => setNewFurnitureL(parseFloat(e.target.value)||0)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-400 block mb-1">H(높이,mm)</label>
                                        <input type="number" step="1" value={newFurnitureH} onChange={e => setNewFurnitureH(parseFloat(e.target.value)||0)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-white" />
                                    </div>
                                </div>"""

content = content.replace(old_grid, new_grid)

# 4. Update the display in the list to also show mm instead of meters
# Old: <span className="text-[10px] text-slate-500">[{furn.w}x{furn.l}x{furn.h}]</span>
# New: <span className="text-[10px] text-slate-500">[{Math.round(furn.w*1000)}x{Math.round(furn.l*1000)}x{Math.round(furn.h*1000)}mm]</span>
old_list = """<span className="text-[10px] text-slate-500">[{furn.w}x{furn.l}x{furn.h}]</span>"""
new_list = """<span className="text-[10px] text-slate-500">[{Math.round(furn.w*1000)}x{Math.round(furn.l*1000)}x{Math.round(furn.h*1000)}mm]</span>"""
content = content.replace(old_list, new_list)

with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "w") as f:
    f.write(content)
