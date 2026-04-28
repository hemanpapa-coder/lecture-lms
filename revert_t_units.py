import re

with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "r") as f:
    content = f.read()

replacements = {
    "20T (": "200T (",
    "40T (": "400T (",
    "60T (": "600T (",
    "80T (": "800T (",
    "10T (": "100T (",
    "30T (": "300T (",
    "5T (": "50T (",
    "15T (": "150T (",
    "25T (": "250T ("
}

for old, new in replacements.items():
    content = content.replace(old, new)

# Update disclaimer text
old_disclaimer = "T는 두께를 나타냅니다 (T 단위는 센티(cm)와 같고 두께를 나타냅니다)."
new_disclaimer = "T는 두께를 나타냅니다 (T 단위는 밀리미터(mm)와 같고 두께를 나타냅니다)."
content = content.replace(old_disclaimer, new_disclaimer)

with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "w") as f:
    f.write(content)
