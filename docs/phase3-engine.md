# Phase 3: Core Engine

- Grid movement: player moves 1 tile (16px) per input, locked during tween (200ms), no direction change mid-move
- Walk animations: 4-frame cycle per direction (walk1 → stand → walk2 → stand), auto-plays during tween
- Sprite anchored at bottom-center (origin 0.5, 1) so feet align with tile grid
- Collision: reads `collision` layer from tilemap JSON — tile index > 0 = blocked, also blocks out-of-bounds
- Input: arrow keys + WASD, priority order: down > up > left > right
- Camera: follows player sprite, bounded to map pixel dimensions
- Spritesheet frame layout: 12 frames (0-2 down, 3-5 up, 6-8 left, 9-11 right) — stand/walk1/walk2 per direction
- Key files: `client/src/entities/Player.js`, `client/src/scenes/OverworldScene.js`
