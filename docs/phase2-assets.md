# Phase 2: Asset Pipeline

- Source: `pret/pokefirered` (sparse cloned into `assets/pokefirered/`)
- All source PNGs are 4-bit indexed color — palettes applied at extraction time via JASC `.pal` files

## Tileset Extraction (`assets/tools/extract-assets.js`)
- Reads 8x8 base tiles from `tiles.png`, applies palette per metatile reference, composites into 16x16 metatiles
- Each map uses 2 tilesets: primary (general/building) + secondary (location-specific)
- Metatiles have 2 layers (bottom + top), 4 tiles per layer, with hflip/vflip/palette per tile ref
- Outputs: rendered tileset PNG (16 metatiles per row) + Phaser tilemap JSON with ground and collision layers
- Collision sourced from map.bin bits 10-11 (0 = walkable, nonzero = blocked)
- Currently extracts: `pallet_town`, `route1`
- To add a new map: add entry to `MAPS` array + add tileset name → directory mapping in `resolveTilesetDir()`

## Sprite Extraction (`assets/tools/extract-sprites.js`)
- Source sprites are vertical strip PNGs, 16x32 per frame, 9 frames (down/up/left x stand/walk1/walk2)
- East frames = horizontally flipped left frames (generated at extraction)
- Output: 12-frame horizontal spritesheet (192x32) — 3 frames per direction, ordered: down, up, left, right
- Palette applied from `graphics/object_events/palettes/*.pal`
- Currently extracts: player (Red), player_green (Leaf), npc_boy, npc_woman, npc_oak

## Output Files
- `assets/tilesets/*_tileset.png` — metatile tileset images
- `assets/maps/*.json` — Phaser tilemap JSONs (ground + collision layers)
- `assets/sprites/*.png` — character spritesheets (12 frames, 16x32 each)

## Commands
- `npm run extract` — run both extractors
- `npm run extract:maps` — tilesets + tilemaps only
- `npm run extract:sprites` — character sprites only
