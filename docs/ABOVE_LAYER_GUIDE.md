# Above Layer — Z-Ordering Guide

## Problem
Player walks ON TOP of buildings/roofs instead of BEHIND them. Single 16x16 tiles contain both roof (top) and grass (bottom), making simple layering impossible.

## Solution
Render the **bottom 8px** of above-layer tiles as individual sprites at depth 20 (above player at depth 10). Skip the top 8px so the player's head/face stays visible while body/legs are hidden behind the building.

### Depth Hierarchy
| Layer | Depth |
|-------|-------|
| Ground | 0 |
| NPC | 5 |
| WildPokemon | 6 |
| RemotePlayer | 9 |
| **Player** | **10** |
| **Above sprites** | **20** |

### Visual Result
```
  ┌──────┐
  │ HAT  │  ← visible (above the crop strip)
  │ FACE │  ← visible (above the crop strip)
  ├──────┤  ← roof line (above sprite starts here)
  │ BODY │  ← hidden behind above sprite
  │ LEGS │  ← hidden behind above sprite
  └──────┘
```

## How to Add Above Tiles to Any Map

### Step 1 — Identify Roof-Edge Rows
Look at the map and find the row where the roof meets the walkable area. This is usually the row directly above the first collision-blocked wall row.

```
Example (pallet_town):
  Row 2: roof ridge (full roof, blocked or walkable)
  Row 3: roof bottom edge  ← THIS ROW gets above tiles
  Row 4: building wall (collision=1)
```

### Step 2 — Paint in Collision Editor
1. Open `assets/tools/collision-editor.html`
2. Load the map
3. Click **"Above ▲"** button (cyan)
4. Paint ONLY the roof-edge tiles at building columns
5. Save

### Step 3 — Verify
- Walk next to the building — head peeks above roof, body hidden
- Walk away from building — player fully visible
- No grass tiles covering the player on open ground

### Rules for Marking Above Tiles
| Mark | Don't Mark |
|------|-----------|
| Roof bottom-edge tiles (where roof meets walkable area) | Pure grass tiles (e.g. tile 663) |
| Tree canopy edges | Full roof body tiles (interior rows) |
| Shelf/counter tops (interiors) | Wall tiles (already collision-blocked) |

### Per-Map Checklist
For each building/structure on the map:
1. Find the **lowest roof row** that overlaps walkable area
2. Mark tiles at that row for the building's column range only
3. Do NOT mark tiles between buildings (open grass)
4. Test walking behind the structure

## Generating New Maps with Above Layer

When creating a new map in the collision editor:

1. **Ground layer** — paint all tiles normally (grass, buildings, paths, etc.)
2. **Collision layer** — mark blocked tiles (walls, water, objects)
3. **Above layer** — mark roof-edge tiles at building columns:
   - Only the row where roof overhangs the walkable area
   - Only at columns where the building exists
   - Never mark grass/path tiles

### Example: Adding a New Building
```
Map layout:
  Row 5: grass grass ROOF ROOF ROOF grass    ← roof ridge
  Row 6: grass grass EDGE EDGE EDGE grass    ← mark these in above layer
  Row 7: grass grass WALL WALL WALL grass    ← collision blocked
  Row 8: grass grass WALL DOOR WALL grass    ← collision blocked

Above layer: mark (2,6), (3,6), (4,6) only
```

### Template for New Map JSON
The above layer in the JSON is a standard Tiled tilelayer:
```json
{
  "id": 3,
  "name": "above",
  "type": "tilelayer",
  "width": <map_width>,
  "height": <map_height>,
  "x": 0, "y": 0,
  "opacity": 1,
  "visible": true,
  "data": [0, 0, 0, ... ]
}
```
- `data` is a flat array (width × height), row-major
- Non-zero values = tile GID (same as ground layer uses)
- Zero = no above tile (transparent)

## Key Code Reference
- **File**: `client/src/scenes/OverworldScene.js`
- **Method**: `_buildAboveSprites(key)`
- **Config**: `skipTop = 8` (pixels skipped from tile top)
- **Config**: `drawH = TILE_SIZE - skipTop` (8px rendered strip)
- **Cleanup**: `this._aboveSprites.forEach(s => s.destroy())` in `loadMap()`

## Troubleshooting
| Issue | Cause | Fix |
|-------|-------|-----|
| Player invisible | Big canvas overlay or error in sprite creation | Use per-tile sprites with try/catch |
| Face/eyes cut off | `skipTop` too small | Increase `skipTop` |
| Hat hidden | Above tiles on wrong row (too high) | Move above tiles one row down |
| Below grass | Grass tile in above layer | Remove grass tiles from above data |
| No effect at all | No above layer in map JSON | Add above layer via collision editor |
| Covers open areas | Above tiles at non-building columns | Only mark building columns |
