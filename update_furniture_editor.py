import re

with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "r") as f:
    content = f.read()

# 1. Fix default value of L (2.0 -> 1900)
content = content.replace("const [newFurnitureL, setNewFurnitureL] = useState<number>(2.0);", "const [newFurnitureL, setNewFurnitureL] = useState<number>(1900);")

# 2. Add selectedFurnitureId state
new_state = """    const [newFurnitureH, setNewFurnitureH] = useState<number>(500);
    const [newFurnitureZ, setNewFurnitureZ] = useState<number>(0);
    const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);"""
content = content.replace("    const [newFurnitureH, setNewFurnitureH] = useState<number>(500);\n    const [newFurnitureZ, setNewFurnitureZ] = useState<number>(0);", new_state)

# 3. Update addFurniture to divide by 1000, add updateFurniture, cancelUpdate, selectFurniture
old_add_furniture = """    const addFurniture = () => {
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
    };"""

new_add_furniture = """    const addFurniture = () => {
        const newFurn: Furniture = {
            id: Math.random().toString(36).substr(2, 9),
            type: newFurnitureType,
            x: newFurnitureX / 1000,
            y: newFurnitureY / 1000,
            w: newFurnitureW / 1000,
            l: newFurnitureL / 1000,
            h: newFurnitureH / 1000,
            z: newFurnitureZ / 1000
        };
        setFurnitures([...furnitures, newFurn]);
    };

    const updateFurniture = () => {
        if (!selectedFurnitureId) return;
        setFurnitures(furnitures.map(f => f.id === selectedFurnitureId ? {
            ...f,
            type: newFurnitureType,
            x: newFurnitureX / 1000,
            y: newFurnitureY / 1000,
            w: newFurnitureW / 1000,
            l: newFurnitureL / 1000,
            h: newFurnitureH / 1000,
            z: newFurnitureZ / 1000
        } : f));
        setSelectedFurnitureId(null);
    };

    const cancelUpdate = () => {
        setSelectedFurnitureId(null);
    };

    const selectFurniture = (furn: Furniture) => {
        setSelectedFurnitureId(furn.id);
        setNewFurnitureType(furn.type);
        setNewFurnitureX(furn.x * 1000);
        setNewFurnitureY(furn.y * 1000);
        setNewFurnitureZ(furn.z * 1000);
        setNewFurnitureW(furn.w * 1000);
        setNewFurnitureL(furn.l * 1000);
        setNewFurnitureH(furn.h * 1000);
    };

    const removeFurniture = (id: string) => {
        setFurnitures(furnitures.filter(f => f.id !== id));
        if (selectedFurnitureId === id) setSelectedFurnitureId(null);
    };"""
content = content.replace(old_add_furniture, new_add_furniture)


# 4. Update UI Buttons and List Items
old_ui_buttons = """                                    <button 
                                        onClick={addFurniture}
                                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition"
                                    >
                                        + 추가
                                    </button>"""

new_ui_buttons = """                                    {selectedFurnitureId ? (
                                        <div className="flex gap-1">
                                            <button onClick={updateFurniture} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition">수정</button>
                                            <button onClick={cancelUpdate} className="bg-slate-600 hover:bg-slate-500 text-white text-xs font-bold px-3 py-2 rounded-lg transition">취소</button>
                                        </div>
                                    ) : (
                                        <button onClick={addFurniture} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition">+ 추가</button>
                                    )}"""
content = content.replace(old_ui_buttons, new_ui_buttons)


old_list_item = """                                {furnitures.map(furn => (
                                    <div key={furn.id} className="flex justify-between items-center bg-slate-900 px-3 py-2 rounded-lg border border-slate-800">
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{backgroundColor: getFurnitureColor(furn.type)}} />
                                            <span className="text-xs font-bold text-white">{getFurnitureLabel(furn.type)} <span className="text-[10px] text-slate-500">[{Math.round(furn.w*1000)}x{Math.round(furn.l*1000)}x{Math.round(furn.h*1000)}mm]</span></span>
                                        </div>
                                        <button onClick={() => removeFurniture(furn.id)} className="text-rose-500 text-[10px] font-bold hover:text-rose-400">삭제</button>
                                    </div>
                                ))}"""

new_list_item = """                                {furnitures.map(furn => (
                                    <div 
                                        key={furn.id} 
                                        onClick={() => selectFurniture(furn)}
                                        className={`flex justify-between items-center px-3 py-2 rounded-lg border cursor-pointer transition ${selectedFurnitureId === furn.id ? 'bg-indigo-900/40 border-indigo-500' : 'bg-slate-900 border-slate-800 hover:border-slate-600'}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{backgroundColor: getFurnitureColor(furn.type)}} />
                                            <span className={`text-xs font-bold ${selectedFurnitureId === furn.id ? 'text-indigo-300' : 'text-white'}`}>{getFurnitureLabel(furn.type)} <span className="text-[10px] text-slate-500">[{Math.round(furn.w*1000)}x{Math.round(furn.l*1000)}x{Math.round(furn.h*1000)}mm]</span></span>
                                        </div>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); removeFurniture(furn.id); }} 
                                            className="text-rose-500 text-[10px] font-bold hover:text-rose-400 px-2 py-1"
                                        >
                                            삭제
                                        </button>
                                    </div>
                                ))}"""
content = content.replace(old_list_item, new_list_item)


with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "w") as f:
    f.write(content)
