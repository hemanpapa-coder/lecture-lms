import re

with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "r") as f:
    content = f.read()

# Top view SVG viewBox
old_top_svg = """                    <svg 
                        ref={svgRef}
                        viewBox={`0 0 ${width} ${length}`} """
new_top_svg = """                    <svg 
                        ref={svgRef}
                        viewBox={`-0.2 -0.2 ${width + 0.4} ${length + 0.4}`} """
content = content.replace(old_top_svg, new_top_svg)

# Top view Grid background
old_top_grid = """                        <rect width={width} height={length} fill="url(#grid)" />"""
new_top_grid = """                        <rect x="0" y="0" width={width} height={length} fill="#0f172a" />
                        <rect x="0" y="0" width={width} height={length} fill="url(#grid)" />"""
content = content.replace(old_top_grid, new_top_grid)

# Top view Wall Indicator
old_top_wall = """                        {/* Wall Material Indicator */}
                        <rect 
                            width={width} height={length} 
                            fill="none" 
                            stroke={wallMaterial === 'concrete' ? '#64748b' : wallMaterial === 'wood' ? '#b45309' : wallMaterial === 'glass' ? '#38bdf8' : '#cbd5e1'} 
                            strokeWidth="0.2" 
                        />"""
new_top_wall = """                        {/* Wall Material Indicator */}
                        <rect 
                            x="-0.1" y="-0.1"
                            width={width + 0.2} height={length + 0.2} 
                            fill="none" 
                            stroke={wallMaterial === 'concrete' ? '#64748b' : wallMaterial === 'wood' ? '#b45309' : wallMaterial === 'glass' ? '#38bdf8' : '#cbd5e1'} 
                            strokeWidth="0.2" 
                        />"""
content = content.replace(old_top_wall, new_top_wall)

# Side view SVG viewBox
old_side_svg = """                    <svg 
                        ref={svgRef}
                        viewBox={`0 0 ${rotationDeg === 0 || rotationDeg === 180 ? length : width} ${height}`} """
new_side_svg = """                    <svg 
                        ref={svgRef}
                        viewBox={`-0.2 -0.2 ${(rotationDeg === 0 || rotationDeg === 180 ? length : width) + 0.4} ${height + 0.4}`} """
content = content.replace(old_side_svg, new_side_svg)

# Side view background (add inside the SVG just like Top View)
# We find the <svg ...> block and add it right after
old_side_bg = """                                <defs>
                                    <pattern id="grid-side" width="1" height="1" patternUnits="userSpaceOnUse">
                                        <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.02" />
                                    </pattern>"""
new_side_bg = """                                <rect x="0" y="0" width={sideW} height={height} fill="#0f172a" />
                                <rect x="-0.1" y="-0.1" width={sideW + 0.2} height={height + 0.2} fill="none" stroke={wallMaterial === 'concrete' ? '#64748b' : wallMaterial === 'wood' ? '#b45309' : wallMaterial === 'glass' ? '#38bdf8' : '#cbd5e1'} strokeWidth="0.2" />
                                <defs>
                                    <pattern id="grid-side" width="1" height="1" patternUnits="userSpaceOnUse">
                                        <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.02" />
                                    </pattern>"""
content = content.replace(old_side_bg, new_side_bg)

# Update Side View Grid rect to be explicit about x=0 y=0
old_side_grid_rect = """                                <rect width={sideW} height={height} fill="url(#grid-side)" />"""
new_side_grid_rect = """                                <rect x="0" y="0" width={sideW} height={height} fill="url(#grid-side)" />"""
content = content.replace(old_side_grid_rect, new_side_grid_rect)


with open("src/app/tools/room-acoustics/simulate/SimulateClient.tsx", "w") as f:
    f.write(content)
