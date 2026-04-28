import re

with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "r") as f:
    content = f.read()

# Add saveError state
if "const [saveError, setSaveError] = useState" not in content:
    content = content.replace("const [saveStatus, setSaveStatus] = useState<'idle'|'success'|'error'>('idle');", "const [saveStatus, setSaveStatus] = useState<'idle'|'success'|'error'>('idle');\n    const [saveError, setSaveError] = useState<string>('');")

# Update catch block
old_catch = """        } catch (err: any) {
            console.error(err);
            setSaveStatus('error');
        }"""
new_catch = """        } catch (err: any) {
            console.error(err);
            setSaveError(err.message || "서버 오류로 저장에 실패했습니다.");
            setSaveStatus('error');
        }"""
content = content.replace(old_catch, new_catch)

# Update UI
old_ui = """{saveStatus === 'error' && (
                            <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-700 font-bold dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400">
                                <AlertCircle className="w-5 h-5" /> 서버 오류로 저장에 실패했습니다. 다시 시도해주세요.
                            </div>
                        )}"""
new_ui = """{saveStatus === 'error' && (
                            <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-700 font-bold dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400">
                                <AlertCircle className="w-5 h-5" /> {saveError || "서버 오류로 저장에 실패했습니다. 다시 시도해주세요."}
                            </div>
                        )}"""
content = content.replace(old_ui, new_ui)

with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "w") as f:
    f.write(content)
