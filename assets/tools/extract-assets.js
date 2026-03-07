/**
 * Asset extraction: pokefirered → Phaser 3
 *
 * Reads indexed-color tile PNGs, applies JASC palettes per metatile reference,
 * renders 16x16 metatile tileset PNGs and Phaser tilemap JSONs.
 *
 * Usage: node assets/tools/extract-assets.js
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PNG } from 'pngjs';

const FIRERED_ROOT = 'assets/pokefirered';
const OUTPUT_DIR_TILESETS = 'assets/tilesets';
const OUTPUT_DIR_MAPS = 'assets/maps';

const BASE_TILE_SIZE = 8;
const METATILE_SIZE = 16;
const SECONDARY_METATILE_OFFSET = 640;

// --- Palette parsing (JASC-PAL format) ---

function loadPalettes(tilesetDir) {
  const palDir = path.join(tilesetDir, 'palettes');
  const palettes = [];
  for (let i = 0; i < 16; i++) {
    const palFile = path.join(palDir, `${String(i).padStart(2, '0')}.pal`);
    if (fs.existsSync(palFile)) {
      const lines = fs.readFileSync(palFile, 'utf8').trim().split('\n');
      const colors = [];
      for (let j = 3; j < lines.length; j++) {
        const [r, g, b] = lines[j].trim().split(/\s+/).map(Number);
        colors.push({ r, g, b });
      }
      palettes[i] = colors;
    } else {
      palettes[i] = Array.from({ length: 16 }, (_, j) => ({
        r: j * 17, g: j * 17, b: j * 17,
      }));
    }
  }
  return palettes;
}

// --- Extract palette indices from indexed PNG ---

function extractTileIndices(pngPath) {
  const buf = fs.readFileSync(pngPath);
  const png = PNG.sync.read(buf);
  const { width, height, palette, data } = png;

  // Build RGB → palette index reverse map
  const reverseMap = new Map();
  for (let i = 0; i < palette.length; i++) {
    const [r, g, b] = palette[i];
    reverseMap.set((r << 16) | (g << 8) | b, i);
  }

  // Convert each pixel to its palette index
  const indices = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    indices[i] = reverseMap.get((r << 16) | (g << 8) | b) ?? 0;
  }

  // Split into 8x8 tiles
  const tilesPerRow = Math.floor(width / BASE_TILE_SIZE);
  const tileRows = Math.floor(height / BASE_TILE_SIZE);
  const tiles = [];

  for (let ty = 0; ty < tileRows; ty++) {
    for (let tx = 0; tx < tilesPerRow; tx++) {
      const tile = new Uint8Array(64); // 8x8
      for (let py = 0; py < BASE_TILE_SIZE; py++) {
        for (let px = 0; px < BASE_TILE_SIZE; px++) {
          tile[py * BASE_TILE_SIZE + px] =
            indices[(ty * BASE_TILE_SIZE + py) * width + (tx * BASE_TILE_SIZE + px)];
        }
      }
      tiles.push(tile);
    }
  }

  return tiles;
}

// --- Metatile parsing ---

function parseMetatiles(binPath) {
  const buf = fs.readFileSync(binPath);
  const metatiles = [];
  for (let i = 0; i < buf.length; i += 16) {
    const refs = [];
    for (let j = 0; j < 8; j++) {
      const val = buf.readUInt16LE(i + j * 2);
      refs.push({
        tileIdx: val & 0x3FF,
        hflip: (val >> 10) & 1,
        vflip: (val >> 11) & 1,
        palette: (val >> 12) & 0xF,
      });
    }
    metatiles.push(refs);
  }
  return metatiles;
}

function parseMetatileAttributes(binPath) {
  const buf = fs.readFileSync(binPath);
  const attrs = [];
  for (let i = 0; i < buf.length; i += 4) {
    attrs.push({
      behavior: buf.readUInt16LE(i),
      terrain: buf.readUInt16LE(i + 2),
    });
  }
  return attrs;
}

// --- Render a single metatile to RGBA pixels ---

function renderMetatile(refs, tilesPrimary, tilesSecondary, mergedPals) {
  const pixels = new Uint8Array(METATILE_SIZE * METATILE_SIZE * 4);

  for (let layer = 0; layer < 2; layer++) {
    for (let slot = 0; slot < 4; slot++) {
      const ref = refs[layer * 4 + slot];
      const qx = (slot % 2) * BASE_TILE_SIZE;
      const qy = Math.floor(slot / 2) * BASE_TILE_SIZE;

      // Resolve tile source: primary or secondary tileset
      let tiles;
      let idx = ref.tileIdx;
      if (idx < tilesPrimary.length) {
        tiles = tilesPrimary;
      } else {
        idx -= tilesPrimary.length;
        tiles = tilesSecondary;
      }
      if (idx < 0 || idx >= tiles.length) continue;

      const tile = tiles[idx];
      const pal = mergedPals[ref.palette] || mergedPals[0];

      for (let py = 0; py < BASE_TILE_SIZE; py++) {
        for (let px = 0; px < BASE_TILE_SIZE; px++) {
          const sx = ref.hflip ? (7 - px) : px;
          const sy = ref.vflip ? (7 - py) : py;
          const colorIdx = tile[sy * BASE_TILE_SIZE + sx];

          // Index 0 = transparent on top layer only
          if (layer === 1 && colorIdx === 0) continue;

          const color = pal[colorIdx] || { r: 0, g: 0, b: 0 };
          const dest = ((qy + py) * METATILE_SIZE + (qx + px)) * 4;
          pixels[dest] = color.r;
          pixels[dest + 1] = color.g;
          pixels[dest + 2] = color.b;
          pixels[dest + 3] = 255;
        }
      }
    }
  }

  return pixels;
}

// --- Build tileset image from primary + secondary tilesets ---

async function buildTilesetImage(primaryDir, secondaryDir) {
  const palsPrimary = loadPalettes(primaryDir);
  const palsSecondary = loadPalettes(secondaryDir);
  const tilesPrimary = extractTileIndices(path.join(primaryDir, 'tiles.png'));
  const tilesSecondary = extractTileIndices(path.join(secondaryDir, 'tiles.png'));
  const metaPrimary = parseMetatiles(path.join(primaryDir, 'metatiles.bin'));
  const metaSecondary = parseMetatiles(path.join(secondaryDir, 'metatiles.bin'));

  // GBA FRLG merged palette: 0-6 from primary, 7-12 from secondary, 13-15 secondary
  const mergedPals = [];
  const NUM_PALS_IN_PRIMARY = 7;
  for (let i = 0; i < 16; i++) {
    mergedPals[i] = i < NUM_PALS_IN_PRIMARY ? palsPrimary[i] : palsSecondary[i];
  }

  const total = metaPrimary.length + metaSecondary.length;
  const cols = 16;
  const rows = Math.ceil(total / cols);
  const w = cols * METATILE_SIZE;
  const h = rows * METATILE_SIZE;
  const img = new Uint8Array(w * h * 4);

  const allMeta = [...metaPrimary, ...metaSecondary];
  for (let i = 0; i < total; i++) {
    const px = renderMetatile(allMeta[i], tilesPrimary, tilesSecondary, mergedPals);
    const col = i % cols;
    const row = Math.floor(i / cols);
    for (let py = 0; py < METATILE_SIZE; py++) {
      for (let ppx = 0; ppx < METATILE_SIZE; ppx++) {
        const si = (py * METATILE_SIZE + ppx) * 4;
        const di = ((row * METATILE_SIZE + py) * w + col * METATILE_SIZE + ppx) * 4;
        img[di] = px[si]; img[di + 1] = px[si + 1];
        img[di + 2] = px[si + 2]; img[di + 3] = px[si + 3];
      }
    }
  }

  return {
    buffer: Buffer.from(img), width: w, height: h, cols, total,
    primaryCount: metaPrimary.length,
  };
}

// --- Map parsing ---

function parseMapBin(binPath) {
  const buf = fs.readFileSync(binPath);
  const tiles = [];
  for (let i = 0; i < buf.length; i += 2) {
    const val = buf.readUInt16LE(i);
    tiles.push({ metatileId: val & 0x3FF, collision: (val >> 10) & 0x3 });
  }
  return tiles;
}

// --- Phaser tilemap JSON ---

function buildTilemapJSON(key, mapTiles, width, height, ts) {
  const ground = [];
  const collision = [];

  for (const t of mapTiles) {
    const idx = t.metatileId < SECONDARY_METATILE_OFFSET
      ? t.metatileId
      : ts.primaryCount + (t.metatileId - SECONDARY_METATILE_OFFSET);
    ground.push(idx + 1); // Phaser: 0 = empty
    collision.push(t.collision > 0 ? 1 : 0);
  }

  return {
    compressionlevel: -1, width, height, infinite: false,
    orientation: 'orthogonal', renderorder: 'right-down',
    tilewidth: METATILE_SIZE, tileheight: METATILE_SIZE,
    type: 'map', version: '1.10', tiledversion: '1.10.0',
    layers: [
      { id: 1, name: 'ground', type: 'tilelayer', width, height,
        x: 0, y: 0, opacity: 1, visible: true, data: ground },
      { id: 2, name: 'collision', type: 'tilelayer', width, height,
        x: 0, y: 0, opacity: 0, visible: false, data: collision },
    ],
    tilesets: [{
      firstgid: 1, columns: ts.cols,
      image: `../tilesets/${key}_tileset.png`,
      imagewidth: ts.width, imageheight: ts.height,
      margin: 0, name: `${key}_tileset`, spacing: 0,
      tilecount: ts.total, tilewidth: METATILE_SIZE, tileheight: METATILE_SIZE,
    }],
  };
}

// --- Tileset name → directory mapping ---

function resolveTilesetDir(name) {
  const map = {
    gTileset_General: 'data/tilesets/primary/general',
    gTileset_Building: 'data/tilesets/primary/building',
    gTileset_PalletTown: 'data/tilesets/secondary/pallet_town',
    gTileset_Viridian: 'data/tilesets/secondary/viridian',
    gTileset_ViridianCity: 'data/tilesets/secondary/viridian_city',
    gTileset_ViridianGym: 'data/tilesets/secondary/viridian_gym',
    gTileset_PewterCity: 'data/tilesets/secondary/pewter',
    gTileset_Route1: 'data/tilesets/secondary/route1',
    gTileset_GenericBuilding1: 'data/tilesets/secondary/generic_building_1',
    gTileset_GenericBuilding2: 'data/tilesets/secondary/generic_building_2',
    gTileset_Lab: 'data/tilesets/secondary/lab',
  };
  return path.join(FIRERED_ROOT, map[name] || '');
}

// --- Extract one map ---

async function extractMap({ key, layoutId }) {
  const layouts = JSON.parse(
    fs.readFileSync(path.join(FIRERED_ROOT, 'data/layouts/layouts.json'), 'utf8')
  );
  const layout = layouts.layouts.find(l => l.id === layoutId);
  if (!layout) { console.error(`Layout ${layoutId} not found`); return; }

  console.log(`\n[${key}] ${layout.name} (${layout.width}x${layout.height})`);

  const primaryDir = resolveTilesetDir(layout.primary_tileset);
  const secondaryDir = resolveTilesetDir(layout.secondary_tileset);
  if (!fs.existsSync(primaryDir) || !fs.existsSync(secondaryDir)) {
    console.error(`  Tileset dir missing: ${primaryDir} or ${secondaryDir}`);
    return;
  }

  // Build tileset
  console.log('  Rendering tileset...');
  const ts = await buildTilesetImage(primaryDir, secondaryDir);
  fs.mkdirSync(OUTPUT_DIR_TILESETS, { recursive: true });
  const tsPath = path.join(OUTPUT_DIR_TILESETS, `${key}_tileset.png`);
  await sharp(ts.buffer, { raw: { width: ts.width, height: ts.height, channels: 4 } })
    .png().toFile(tsPath);
  console.log(`  Tileset: ${tsPath} (${ts.total} metatiles)`);

  // Build map
  console.log('  Building tilemap...');
  const mapTiles = parseMapBin(path.join(FIRERED_ROOT, layout.blockdata_filepath));
  const tilemap = buildTilemapJSON(key, mapTiles, layout.width, layout.height, ts);
  fs.mkdirSync(OUTPUT_DIR_MAPS, { recursive: true });
  const mapPath = path.join(OUTPUT_DIR_MAPS, `${key}.json`);
  fs.writeFileSync(mapPath, JSON.stringify(tilemap, null, 2));
  console.log(`  Map: ${mapPath}`);
}

// --- Layout discovery ---

/** Convert pokefirered layout ID to a friendly map key.
 *  LAYOUT_PALLET_TOWN → pallet_town
 *  LAYOUT_VIRIDIAN_CITY_POKEMON_CENTER_1F → viridian_city_pokemon_center_1f */
function layoutIdToKey(id) {
  if (!id) return '';
  return id.replace(/^LAYOUT_/, '').toLowerCase();
}

/** Load all layouts from layouts.json */
function getAllLayouts() {
  const file = path.join(FIRERED_ROOT, 'data/layouts/layouts.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return data.layouts || [];
}

/** List all available maps that can be extracted. */
function listMaps() {
  const layouts = getAllLayouts();
  console.log(`\n=== Available Maps (${layouts.length} total) ===\n`);
  for (const l of layouts) {
    const key = layoutIdToKey(l.id);
    const exists = fs.existsSync(path.join(OUTPUT_DIR_MAPS, `${key}.json`)) ? '  ✅' : '';
    console.log(`  ${key.padEnd(45)} ${l.width}x${l.height}${exists}`);
  }
  console.log(`\nUsage:`);
  console.log(`  node extract-assets.js <map_key>          Extract a single map`);
  console.log(`  node extract-assets.js <key1> <key2> ...  Extract multiple maps`);
  console.log(`  node extract-assets.js --all              Extract ALL maps (slow)`);
  console.log(`  node extract-assets.js --list             Show this list`);
  console.log(`  node extract-assets.js                    Extract default set\n`);
}

// --- Predefined map set (original) ---

const DEFAULT_MAPS = [
  { key: 'pallet_town', layoutId: 'LAYOUT_PALLET_TOWN' },
  { key: 'route1', layoutId: 'LAYOUT_ROUTE1' },
  { key: 'players_house_1f', layoutId: 'LAYOUT_PALLET_TOWN_PLAYERS_HOUSE_1F' },
  { key: 'players_house_2f', layoutId: 'LAYOUT_PALLET_TOWN_PLAYERS_HOUSE_2F' },
  { key: 'rivals_house', layoutId: 'LAYOUT_PALLET_TOWN_RIVALS_HOUSE' },
  { key: 'oaks_lab', layoutId: 'LAYOUT_PALLET_TOWN_PROFESSOR_OAKS_LAB' },
  { key: 'viridian_city', layoutId: 'LAYOUT_VIRIDIAN_CITY' },
];

// --- Main ---

const args = process.argv.slice(2);

console.log('=== Pokemon MMO Asset Extractor ===');

if (args.includes('--list')) {
  listMaps();
} else if (args.includes('--all')) {
  const layouts = getAllLayouts();
  for (const l of layouts) {
    await extractMap({ key: layoutIdToKey(l.id), layoutId: l.id });
  }
} else if (args.length > 0) {
  // Extract specific maps by key
  const layouts = getAllLayouts();
  for (const arg of args) {
    const key = arg.toLowerCase();
    // Try exact layout match first, then search by key
    const layout = layouts.find(l => l.id && layoutIdToKey(l.id) === key)
                || layouts.find(l => l.id && l.id === `LAYOUT_${key.toUpperCase()}`);
    if (layout) {
      await extractMap({ key, layoutId: layout.id });
    } else {
      console.error(`\n❌ Map "${arg}" not found. Run with --list to see available maps.`);
    }
  }
} else {
  // Default set
  for (const m of DEFAULT_MAPS) await extractMap(m);
}

console.log('\nDone!');
console.log('\nDone!');
