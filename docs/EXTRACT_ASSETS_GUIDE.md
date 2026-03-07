# Map Extraction Guide

Converts pokefirered map data into Phaser 3 tilesets and tilemaps.

**Tool:** `assets/tools/extract-assets.js`
**Source data:** `assets/pokefirered/` (decompiled pokefirered repo)

## Quick Start

Run from the project root (`D:\pokemon-mmo`):

```bash
# List all available maps (shows which are already extracted)
node assets/tools/extract-assets.js --list

# Extract a single map
node assets/tools/extract-assets.js viridian_city

# Extract multiple maps
node assets/tools/extract-assets.js pallet_town route1 viridian_city

# Extract the default set (pallet_town, route1, houses, lab, viridian)
node assets/tools/extract-assets.js

# Extract ALL maps (slow, some may fail if tileset not mapped)
node assets/tools/extract-assets.js --all
```

## What It Produces

For each map (e.g. `viridian_city`):

| Output | Path |
|--------|------|
| Tileset PNG | `assets/tilesets/viridian_city_tileset.png` |
| Tilemap JSON | `assets/maps/viridian_city.json` |

- **Tileset PNG** — every 16x16 metatile rendered with correct palettes, laid out in a 16-column grid
- **Tilemap JSON** — Phaser 3 compatible tilemap with `ground` and `collision` layers

## Wiring Up a New Map

After extracting, you need to register the map so the game loads it:

### 1. Add to `shared/src/maps.js`

```js
viridian_city: {
  key: 'viridian_city',
  name: 'Viridian City',
  bgm: 'Pixel Dawn Over Maple Town',  // or null for indoor
  width: 48,    // from extraction output
  height: 40,
  connections: [
    { direction: 'down', map: 'route1', offset: -12 },
  ],
  warps: [],
  spawnX: 24,
  spawnY: 38,
},
```

- `width` / `height` — shown in extraction output as `(48x40)`
- `connections` — link to adjacent maps. `offset` shifts the x (or y) axis alignment
- `warps` — door/stair tiles that teleport to interior maps
- `bgm` — overworld music key (filename without `.mp3`), or `null` for indoor

### 2. Update connections on neighboring maps

If Route 1 connects up to Viridian City, add the reverse connection:

```js
route1: {
  connections: [
    { direction: 'down', map: 'pallet_town', offset: 0 },
    { direction: 'up', map: 'viridian_city', offset: 12 },  // add this
  ],
},
```

The offset must be the **negative** of the other map's offset for the reverse direction.

### 3. Paint collisions

Open `assets/tools/collision-editor.html` in a browser. Select the new map from the dropdown, paint collision tiles, and save. The collision data is embedded in the tilemap JSON.

### 4. Add NPCs (optional)

Create `assets/npcs/<map_key>/npc_name.json`. See existing NPCs for format.

## How It Works (Technical)

### Source Data Structure

```
assets/pokefirered/
  data/layouts/layouts.json          # Master list of all map layouts
  data/layouts/<LayoutName>/
    map.bin                          # Map grid: metatile IDs + collision flags
  data/tilesets/primary/general/     # Primary tileset (shared across maps)
    tiles.png                        # Indexed-color tile sheet (8x8 tiles)
    metatiles.bin                    # Metatile definitions (16 bytes each)
    palettes/00.pal - 15.pal        # JASC-PAL palette files
  data/tilesets/secondary/<name>/    # Secondary tileset (map-specific)
    tiles.png / metatiles.bin / palettes/
```

### Extraction Pipeline

1. **Load palettes** — Parse JASC-PAL files (16 palettes x 16 colors each)
2. **Merge palettes** — GBA uses a merged set: palettes 0-6 from primary, 7-12 from secondary
3. **Extract tiles** — Read indexed-color PNG, split into 8x8 tiles (palette indices)
4. **Parse metatiles** — Each metatile = 16 bytes = 8 tile refs (2 layers x 4 quadrants). Each ref has: tileIdx (10 bits), hflip, vflip, palette (4 bits)
5. **Render metatiles** — For each 16x16 metatile, resolve tile refs against primary/secondary tilesets, apply merged palette colors, composite 2 layers
6. **Build tileset PNG** — All metatiles in a 16-column grid image
7. **Build tilemap JSON** — Map grid references metatile IDs, converted to Phaser tile indices. Collision flags become a separate layer

### Palette Merging (Important)

The GBA hardware loads 16 palettes into a single palette RAM. For FRLG:
- **Palettes 0-6** come from the **primary** tileset (general)
- **Palettes 7-12** come from the **secondary** tileset (map-specific)
- **Palettes 13-15** are typically shared/unused

This means a secondary tileset metatile referencing palette 0 uses the *primary* palette 0, while palette 11 uses the *secondary* palette 11. The extractor merges these correctly.

### Tile Index Resolution

- Tile indices below `tilesPrimary.length` resolve to the primary tileset
- Tile indices above that threshold resolve to the secondary tileset (offset subtracted)

### Metatile ID Resolution

- IDs below 640 (`SECONDARY_METATILE_OFFSET`) are primary metatiles
- IDs 640+ are secondary metatiles (offset to come after primary in the tileset image)

## Adding New Tileset Mappings

If extraction fails with "Tileset dir missing", the tileset name isn't mapped yet. Add it to `resolveTilesetDir()` in `extract-assets.js`:

```js
function resolveTilesetDir(name) {
  const map = {
    gTileset_General: 'data/tilesets/primary/general',
    gTileset_Building: 'data/tilesets/primary/building',
    gTileset_PalletTown: 'data/tilesets/secondary/pallet_town',
    gTileset_ViridianCity: 'data/tilesets/secondary/viridian_city',
    // Add new ones here:
    // gTileset_CeladonCity: 'data/tilesets/secondary/celadon',
  };
}
```

To find the correct directory name, check `assets/pokefirered/data/tilesets/secondary/` for available folders.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "Tileset dir missing" | Tileset not in `resolveTilesetDir()` | Add the mapping (see above) |
| Black tiles on buildings | Palette merging issue | Should be fixed — palettes 7-12 come from secondary |
| Map doesn't load in game | Not registered in `maps.js` | Add entry to `MAPS` object |
| Player walks through walls | Collision not painted | Use collision editor |
| ENOENT on tiles.png | pokefirered data incomplete | Check the tileset folder has tiles.png |
