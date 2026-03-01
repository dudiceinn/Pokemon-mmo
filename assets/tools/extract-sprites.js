/**
 * Sprite extraction: pokefirered → Phaser 3 spritesheets
 *
 * Reads indexed-color character PNGs, applies palette, outputs RGBA PNGs.
 * Also rearranges frames into Phaser-friendly horizontal spritesheet layout.
 *
 * Frame layout in source (9 frames, each 16x32):
 *   0: face down   1: face up     2: face left
 *   3: walk down1  4: walk down2  5: walk up1
 *   6: walk up2    7: walk left1  8: walk left2
 *
 * East frames = horizontally flipped left frames.
 *
 * Usage: node assets/tools/extract-sprites.js
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { PNG } from 'pngjs';

const FIRERED_ROOT = 'assets/pokefirered';
const OUTPUT_DIR = 'assets/sprites';

const FRAME_W = 16;
const FRAME_H = 32;

// --- Parse JASC palette ---

function parsePalette(palPath) {
  const lines = fs.readFileSync(palPath, 'utf8').trim().split('\n');
  const colors = [];
  for (let i = 3; i < lines.length; i++) {
    const [r, g, b] = lines[i].trim().split(/\s+/).map(Number);
    colors.push({ r, g, b });
  }
  return colors;
}

// --- Read indexed PNG → palette indices ---

function readIndexed(pngPath) {
  const buf = fs.readFileSync(pngPath);
  const png = PNG.sync.read(buf);
  const { width, height, palette, data } = png;

  const reverseMap = new Map();
  for (let i = 0; i < palette.length; i++) {
    const [r, g, b] = palette[i];
    reverseMap.set((r << 16) | (g << 8) | b, i);
  }

  const indices = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    indices[i] = reverseMap.get((r << 16) | (g << 8) | b) ?? 0;
  }

  return { indices, width, height };
}

// --- Render sprite with palette applied ---

function applyPalette(src, palette, transparentIndex) {
  const { indices, width, height } = src;
  const rgba = new Uint8Array(width * height * 4);

  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    if (idx === transparentIndex) {
      // transparent
      rgba[i * 4 + 3] = 0;
    } else {
      const c = palette[idx] || { r: 255, g: 0, b: 255 };
      rgba[i * 4] = c.r;
      rgba[i * 4 + 1] = c.g;
      rgba[i * 4 + 2] = c.b;
      rgba[i * 4 + 3] = 255;
    }
  }

  return { rgba, width, height };
}

// --- Extract single frame from spritesheet ---

function extractFrame(rgba, sheetW, frameIdx) {
  const fx = frameIdx * FRAME_W;
  const frame = new Uint8Array(FRAME_W * FRAME_H * 4);

  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      const si = ((y) * sheetW + fx + x) * 4;
      const di = (y * FRAME_W + x) * 4;
      frame[di] = rgba[si]; frame[di + 1] = rgba[si + 1];
      frame[di + 2] = rgba[si + 2]; frame[di + 3] = rgba[si + 3];
    }
  }

  return frame;
}

// --- Flip frame horizontally ---

function flipFrameH(frame) {
  const flipped = new Uint8Array(FRAME_W * FRAME_H * 4);
  for (let y = 0; y < FRAME_H; y++) {
    for (let x = 0; x < FRAME_W; x++) {
      const si = (y * FRAME_W + x) * 4;
      const di = (y * FRAME_W + (FRAME_W - 1 - x)) * 4;
      flipped[di] = frame[si]; flipped[di + 1] = frame[si + 1];
      flipped[di + 2] = frame[si + 2]; flipped[di + 3] = frame[si + 3];
    }
  }
  return flipped;
}

// --- Build Phaser spritesheet ---
// Output: 12 frames in a row (3 per direction: stand, walk1, walk2)
// Order: down0 down1 down2 | up0 up1 up2 | left0 left1 left2 | right0 right1 right2

function buildSpritesheet(colorized) {
  const frames = [];
  const numSrcFrames = Math.floor(colorized.width / FRAME_W);
  for (let i = 0; i < numSrcFrames; i++) {
    frames.push(extractFrame(colorized.rgba, colorized.width, i));
  }

  // Source frame mapping:
  // 0=down_stand, 1=up_stand, 2=left_stand
  // 3=down_walk1, 4=down_walk2, 5=up_walk1, 6=up_walk2, 7=left_walk1, 8=left_walk2

  const outputFrames = [
    frames[0], frames[3], frames[4],   // down: stand, walk1, walk2
    frames[1], frames[5], frames[6],   // up: stand, walk1, walk2
    frames[2], frames[7], frames[8],   // left: stand, walk1, walk2
    flipFrameH(frames[2]), flipFrameH(frames[7]), flipFrameH(frames[8]), // right (flipped left)
  ];

  const outW = outputFrames.length * FRAME_W;
  const outH = FRAME_H;
  const outRgba = new Uint8Array(outW * outH * 4);

  for (let f = 0; f < outputFrames.length; f++) {
    const frame = outputFrames[f];
    for (let y = 0; y < FRAME_H; y++) {
      for (let x = 0; x < FRAME_W; x++) {
        const si = (y * FRAME_W + x) * 4;
        const di = (y * outW + f * FRAME_W + x) * 4;
        outRgba[di] = frame[si]; outRgba[di + 1] = frame[si + 1];
        outRgba[di + 2] = frame[si + 2]; outRgba[di + 3] = frame[si + 3];
      }
    }
  }

  return { rgba: Buffer.from(outRgba), width: outW, height: outH };
}

// --- Sprites to extract ---

const SPRITES = [
  { src: 'people/red_normal.png', palette: 'player.pal', out: 'player.png', transparentIdx: 0 },
  { src: 'people/green_normal.png', palette: 'player.pal', out: 'player_green.png', transparentIdx: 0 },
  { src: 'people/boy.png', palette: 'npc_blue.pal', out: 'npc_boy.png', transparentIdx: 0 },
  { src: 'people/woman_1.png', palette: 'npc_green.pal', out: 'npc_woman.png', transparentIdx: 0 },
  { src: 'people/prof_oak.png', palette: 'npc_green.pal', out: 'npc_oak.png', transparentIdx: 0 },
];

// --- Main ---

async function main() {
  console.log('=== Sprite Extractor ===\n');
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const picsDir = path.join(FIRERED_ROOT, 'graphics/object_events/pics');
  const palDir = path.join(FIRERED_ROOT, 'graphics/object_events/palettes');

  for (const sprite of SPRITES) {
    const srcPath = path.join(picsDir, sprite.src);
    if (!fs.existsSync(srcPath)) {
      console.log(`  SKIP: ${sprite.src} not found`);
      continue;
    }

    const pal = parsePalette(path.join(palDir, sprite.palette));
    const indexed = readIndexed(srcPath);
    const colorized = applyPalette(indexed, pal, sprite.transparentIdx);
    const sheet = buildSpritesheet(colorized);

    const outPath = path.join(OUTPUT_DIR, sprite.out);
    await sharp(sheet.rgba, { raw: { width: sheet.width, height: sheet.height, channels: 4 } })
      .png().toFile(outPath);
    console.log(`  ${sprite.out} (${sheet.width}x${sheet.height}, 12 frames)`);
  }

  console.log('\nDone!');
}

main().catch(console.error);
