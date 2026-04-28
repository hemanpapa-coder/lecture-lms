import re

with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "r") as f:
    content = f.read()

replacements = {
    "200T": "20T",
    "400T": "40T",
    "600T": "60T",
    "800T": "80T",
    "100T": "10T",
    "300T": "30T",
    "50T": "5T",
    "150T": "15T",
    "250T": "25T"
}

for old, new in replacements.items():
    content = content.replace(f"{old} (", f"{new} (")

with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "w") as f:
    f.write(content)
