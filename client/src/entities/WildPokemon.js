import Phaser from 'phaser';
import { TILE_SIZE, MOVE_DURATION, DIR, DIR_VECTOR } from '@pokemon-mmo/shared';

const MOVE_DURATION_MS = MOVE_DURATION || 200;

// Pokemon overworld sprites are typically a single row of 4 frames:
// frame 0: stand, frame 1-3: walk cycle
// If your sheets use the same 4-row layout as NPCs, set POKEMON_FOUR_ROW = true
const POKEMON_FOUR_ROW = true;

// For single-row sheets (stand, walk1, walk2, walk3)
const POKE_FRAMES_SIMPLE = {
  stand: 0,
  walk: [1, 0, 2, 0, 3, 0],
};

// For four-row sheets (same layout as NPCs)
const POKE_DIR_FRAMES = {
  [DIR.DOWN]:  { stand: 0,  walk: [1,  0,  2,  0,  3,  0] },
  [DIR.LEFT]:  { stand: 4,  walk: [5,  4,  6,  4,  7,  4] },
  [DIR.RIGHT]: { stand: 8,  walk: [9,  8,  10, 8,  11, 8] },
  [DIR.UP]:    { stand: 12, walk: [13, 12, 14, 12, 15, 12] },
};

// How often (ms) the pokemon picks a new direction to wander
const ROAM_INTERVAL_MIN = 1500;
const ROAM_INTERVAL_MAX = 4000;

// Rendered at 75% of NPC scale — feels smaller/more wild
const POKEMON_SCALE = 0.25; // 64px frame * 0.25 = 16px on screen, fits one tile

export class WildPokemon {
  /**
   * @param {Phaser.Scene} scene
   * @param {string} speciesId  - e.g. 'pidgey'  (must match loaded spritesheet key)
   * @param {number} level
   * @param {number} tileX
   * @param {number} tileY
   * @param {number[]} spawnTileKeys - flat array of tile coords this pokemon is allowed to roam,
   *                                   format: [x0,y0, x1,y1, ...]  (built by EncounterManager)
   */
  constructor(scene, speciesId, level, tileX, tileY, allowedTiles) {
    this.scene = scene;
    this.speciesId = speciesId.toLowerCase();  // normalize so key is always e.g. poke_squirtle
    this.level = level;
    this.tileX = tileX;
    this.tileY = tileY;
    this.allowedTiles = allowedTiles; // Set of "x,y" strings for fast lookup
    this.dir = DIR.DOWN;
    this.isWalking = false;
    this._collisionCheck = null; // set by EncounterManager after construction
    this._roamTimer = Math.random() * 2000; // stagger so they don't all move at once
    this._destroyed = false;

    const spriteKey = this._spriteKey();

    // If sprite wasn't preloaded (shouldn't happen after BootScene fix),
    // lazy-load it now — but guard against missing files
    if (!scene.textures.exists(spriteKey)) {
      scene.load.spritesheet(spriteKey, `/pokemon/followers/${speciesId.toUpperCase()}.png`, {
        frameWidth: 64,
        frameHeight: 64,
      });
      scene.load.once('fileerror', (file) => {
        if (file.key === spriteKey) {
          console.warn(`[WildPokemon] Sprite not found for ${speciesId} — skipping render`);
          this._destroyed = true;
        }
      });
      scene.load.once('complete', () => {
        if (!this._destroyed) this._createSprite(scene, spriteKey);
      });
      scene.load.start();
      this.sprite = null;
      return;
    }

    this._createSprite(scene, spriteKey);
  }

  _spriteKey() {
    return `poke_${this.speciesId}`;
  }

  _createSprite(scene, spriteKey) {
    if (this._destroyed) return;

    // If the texture didn't actually load (e.g. 404), mark destroyed and bail
    if (!scene.textures.exists(spriteKey) || scene.textures.get(spriteKey).key === '__MISSING') {
      console.warn(`[WildPokemon] Texture "${spriteKey}" not available — skipping`);
      this._destroyed = true;
      return;
    }

    // Auto-detect frame size: sheet is always 4 cols x 4 rows
    const tex = scene.textures.get(spriteKey);
    const src = tex.getSourceImage();
    const frameW = src.width  / 4;
    const frameH = src.height / 4;

    // Re-parse the texture with correct frame dimensions if not already sliced
    if (tex.frameTotal <= 1) {
      scene.textures.remove(spriteKey);
      scene.textures.addSpriteSheet(spriteKey, src, { frameWidth: frameW, frameHeight: frameH });
    }

    const standFrame = POKE_DIR_FRAMES[DIR.DOWN].stand;

    this.sprite = scene.add.sprite(
      this.tileX * TILE_SIZE + TILE_SIZE / 2,
      this.tileY * TILE_SIZE + TILE_SIZE,
      spriteKey,
      standFrame
    );
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setDepth(6);
    this.sprite.setScale(0.5);
    this.sprite.setTexture(spriteKey); // ensure texture is fresh after re-slice

    this._createAnimations(scene, spriteKey);
  }

  _createAnimations(scene, spriteKey) {
    if (POKEMON_FOUR_ROW) {
      for (const [dir, mapping] of Object.entries(POKE_DIR_FRAMES)) {
        const key = `${spriteKey}_walk_${dir}`;
        if (!scene.anims.exists(key)) {
          scene.anims.create({
            key,
            frames: mapping.walk.map(f => ({ key: spriteKey, frame: f })),
            frameRate: 10,
            repeat: 0,
          });
        }
      }
    } else {
      const key = `${spriteKey}_walk`;
      if (!scene.anims.exists(key)) {
        scene.anims.create({
          key,
          frames: POKE_FRAMES_SIMPLE.walk.map(f => ({ key: spriteKey, frame: f })),
          frameRate: 10,
          repeat: 0,
        });
      }
    }
  }

  _getAnimKey() {
    if (POKEMON_FOUR_ROW) return `${this._spriteKey()}_walk_${this.dir}`;
    return `${this._spriteKey()}_walk`;
  }

  _getStandFrame() {
    if (POKEMON_FOUR_ROW) return POKE_DIR_FRAMES[this.dir].stand;
    return POKE_FRAMES_SIMPLE.stand;
  }

  // Called every frame from EncounterManager (which is called from OverworldScene.update)
  update(delta) {
    if (this._destroyed || this.isWalking || !this.sprite) return;

    this._roamTimer -= delta;
    if (this._roamTimer > 0) return;

    // Reset timer with random interval
    this._roamTimer = ROAM_INTERVAL_MIN +
      Math.random() * (ROAM_INTERVAL_MAX - ROAM_INTERVAL_MIN);

    // Pick a random direction and try to step one tile
    const dirs = [DIR.DOWN, DIR.LEFT, DIR.RIGHT, DIR.UP];
    // Shuffle so we don't bias toward DOWN
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
    }

    for (const dir of dirs) {
      const vec = DIR_VECTOR[dir];
      const nx = this.tileX + vec.x;
      const ny = this.tileY + vec.y;

      // Must stay within allowed grass tiles
      if (!this.allowedTiles.has(`${nx},${ny}`)) continue;

      // Must not be blocked by collision or other entities
      if (this._collisionCheck && this._collisionCheck(nx, ny, this)) continue;

      this._stepTo(dir, nx, ny);
      break;
    }
  }

  _stepTo(dir, nx, ny) {
    if (!this.sprite) return;
    this.isWalking = true;
    this.dir = dir;

    const animKey = this._getAnimKey();
    if (this.scene.anims.exists(animKey)) {
      this.sprite.play(animKey);
    }

    this.scene.tweens.add({
      targets: this.sprite,
      x: nx * TILE_SIZE + TILE_SIZE / 2,
      y: ny * TILE_SIZE + TILE_SIZE,
      duration: MOVE_DURATION_MS * 1.5, // slightly slower than player — feels more natural
      ease: 'Linear',
      onComplete: () => {
        if (this._destroyed) return;
        this.tileX = nx;
        this.tileY = ny;
        this.isWalking = false;
        if (this.sprite) this.sprite.setFrame(this._getStandFrame());
      },
    });
  }

  destroy() {
    this._destroyed = true;
    if (this.sprite) {
      this.sprite.destroy();
      this.sprite = null;
    }
  }
}
