import Phaser from 'phaser';
import { TILE_SIZE, MOVE_DURATION, DIR, DIR_VECTOR } from '@pokemon-mmo/shared';

// Spritesheet frame mapping (16 frames total):
// Row 0 (frames 0-3): Down (South)
// Row 1 (frames 4-7): Left (West)
// Row 2 (frames 8-11): Right (East)
// Row 3 (frames 12-15): Up (North)
const DIR_FRAMES = {
  [DIR.DOWN]:  { 
    stand: 0,
    walk: [1, 0, 2, 0, 3, 0]
  },
  [DIR.LEFT]:  { 
    stand: 4,
    walk: [5, 4, 6, 4, 7, 4]
  },
  [DIR.RIGHT]: { 
    stand: 8,
    walk: [9, 8, 10, 8, 11, 8]
  },
  [DIR.UP]:    { 
    stand: 12,
    walk: [13, 12, 14, 12, 15, 12]
  },
};

// Scale factor to make 32x48 sprites appear as 16x32
const SPRITE_SCALE = 0.5; // 50% of original size

export class Player {
  constructor(scene, x, y, spriteKey = 'player') {
    this.scene = scene;
    this.tileX = x;
    this.tileY = y;
    this.dir = DIR.DOWN;
    this.isMoving = false;
    this.onMoveComplete = null;
    this.spriteKey = spriteKey;

    // Create sprite at half scale to match original 16x32 size
    this.sprite = scene.add.sprite(
      x * TILE_SIZE + TILE_SIZE / 2,
      y * TILE_SIZE + TILE_SIZE,
      spriteKey,
      DIR_FRAMES[DIR.DOWN].stand
    );
    this.sprite.setOrigin(0.5, 1); // Anchor at bottom center
    this.sprite.setDepth(10);
    
    // Apply scale to make it appear as 16x32
    this.sprite.setScale(SPRITE_SCALE);

    this.createAnimations();
  }

  createAnimations() {
    const key = this.spriteKey;
    
    // Delete existing animations if they exist (to avoid conflicts)
    for (const dir of [DIR.DOWN, DIR.LEFT, DIR.RIGHT, DIR.UP]) {
      const animKey = `${key}_walk_${dir}`;
      if (this.scene.anims.exists(animKey)) {
        this.scene.anims.remove(animKey);
      }
    }

    // Create new animations for each direction
    for (const [dir, mapping] of Object.entries(DIR_FRAMES)) {
      const animKey = `${key}_walk_${dir}`;
      
      this.scene.anims.create({
        key: animKey,
        frames: mapping.walk.map(f => ({ key, frame: f })),
        frameRate: 12,
        repeat: 0,
      });
    }
  }

  get pixelX() {
    return this.tileX * TILE_SIZE + TILE_SIZE / 2;
  }

  get pixelY() {
    return this.tileY * TILE_SIZE + TILE_SIZE;
  }

  faceDirection(dir) {
    this.dir = dir;
    this.sprite.setFrame(DIR_FRAMES[dir].stand);
  }

  tryMove(dir, collisionCheck) {
    if (this.isMoving) return false;

    this.dir = dir;
    const vec = DIR_VECTOR[dir];
    const newX = this.tileX + vec.x;
    const newY = this.tileY + vec.y;

    // Check collision
    if (collisionCheck && collisionCheck(newX, newY)) {
      // Face direction but don't move
      this.sprite.setFrame(DIR_FRAMES[dir].stand);
      return false;
    }

    this.isMoving = true;

    // Play walk animation
    this.sprite.play(`${this.spriteKey}_walk_${dir}`);

    // Tween to target tile (pixel positions are still based on TILE_SIZE)
    const targetX = newX * TILE_SIZE + TILE_SIZE / 2;
    const targetY = newY * TILE_SIZE + TILE_SIZE;

    this.scene.tweens.add({
      targets: this.sprite,
      x: targetX,
      y: targetY,
      duration: MOVE_DURATION,
      ease: 'Linear',
      onComplete: () => {
        this.tileX = newX;
        this.tileY = newY;
        this.isMoving = false;
        this.sprite.setFrame(DIR_FRAMES[dir].stand);
        if (this.onMoveComplete) this.onMoveComplete();
      },
    });

    return true;
  }

  walkToTile(targetX, targetY, onComplete) {
    if (this.isMoving) return;
    
    this.isMoving = true;
    const steps = [];

    const dx = targetX - this.tileX;
    const dy = targetY - this.tileY;
    const xDir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
    const yDir = dy > 0 ? DIR.DOWN : DIR.UP;

    for (let i = 0; i < Math.abs(dx); i++) steps.push(xDir);
    for (let i = 0; i < Math.abs(dy); i++) steps.push(yDir);

    if (steps.length === 0) {
      this.isMoving = false;
      if (onComplete) onComplete();
      return;
    }

    let stepIdx = 0;
    const doStep = () => {
      if (stepIdx >= steps.length) {
        this.isMoving = false;
        this.sprite.setFrame(DIR_FRAMES[this.dir].stand);
        if (onComplete) onComplete();
        return;
      }

      const dir = steps[stepIdx];
      this.dir = dir;
      const vec = DIR_VECTOR[dir];
      const newX = this.tileX + vec.x;
      const newY = this.tileY + vec.y;

      // Play walk animation
      this.sprite.play(`${this.spriteKey}_walk_${dir}`);

      const targetX = newX * TILE_SIZE + TILE_SIZE / 2;
      const targetY = newY * TILE_SIZE + TILE_SIZE;

      this.scene.tweens.add({
        targets: this.sprite,
        x: targetX,
        y: targetY,
        duration: MOVE_DURATION,
        ease: 'Linear',
        onComplete: () => {
          this.tileX = newX;
          this.tileY = newY;
          stepIdx++;
          
          // Set to standing frame after step
          this.sprite.setFrame(DIR_FRAMES[dir].stand);
          
          doStep();
        },
      });
    };

    doStep();
  }

  setPosition(x, y) {
    this.tileX = x;
    this.tileY = y;
    this.sprite.setPosition(this.pixelX, this.pixelY);
  }

  /**
   * Called by OverworldScene when the player hops over a ledge tile.
   * Expects: isMoving already set to true, dir set to DOWN.
   * Moves sprite 2 tiles down with a parabolic arc (hop over ledge, land below).
   */
  startLedgeHop() {
    const startY = this.sprite.y;
    const landTileY = this.tileY + 2;
    const endY = landTileY * TILE_SIZE + TILE_SIZE;
    const hopHeight = TILE_SIZE * 0.8;
    const duration = MOVE_DURATION * 1.6;

    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      ease: 'Linear',
      onUpdate: (tween) => {
        const t = tween.getValue();
        const linearY = startY + (endY - startY) * t;
        const arc = Math.sin(t * Math.PI) * hopHeight;
        this.sprite.y = linearY - arc;
      },
      onComplete: () => {
        this.tileY = landTileY;
        this.isMoving = false;
        this.sprite.setFrame(DIR_FRAMES[DIR.DOWN].stand);
        this.sprite.y = endY;
        if (this.onMoveComplete) this.onMoveComplete();
      },
    });
  }

  /**
   * Crop the sprite so only the top portion shows.
   * Used when the player walks behind a roof/overhang (COLL_TOPBLOCK tile).
   * Pass null to restore full sprite.
   *
   * The sprite sheet is 32×48 at full res, scaled to 0.5 → rendered as 16×24.
   * We want to show only the top ~40% (the head), hiding the body.
   */
  setRoofCrop(active) {
    const tex = this.sprite.texture;
    const frameData = this.sprite.frame;
    const fw = frameData.realWidth;   // native frame width  (32px)
    const fh = frameData.realHeight;  // native frame height (48px)

    if (active) {
      // Show top 40% of the frame — just the head poking above the roof
      this.sprite.setCrop(0, 0, fw, Math.floor(fh * 0.4));
    } else {
      this.sprite.setCrop(0, 0, fw, fh); // full frame
    }
  }

  showEmoji(emoji) {
    const container = document.getElementById('name-labels');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'emoji-bubble';
    el.textContent = emoji;
    container.appendChild(el);

    const cam = this.scene.cameras.main;
    const canvas = this.scene.game.canvas;
    let elapsed = 0;
    const wobbleDuration = 800;
    const floatDuration = 1200;
    const totalDuration = wobbleDuration + floatDuration;

    const interval = setInterval(() => {
      elapsed += 16;
      const rect = canvas.getBoundingClientRect();
      const scaleX = rect.width / cam.width;
      const scaleY = rect.height / cam.height;
      const worldX = this.sprite.x;
      const worldY = this.sprite.y - this.sprite.height * this.sprite.originY * this.sprite.scaleY - 2;
      const camX = worldX - cam.scrollX;
      const camY = worldY - cam.scrollY;
      const screenX = rect.left + camX * scaleX;
      const screenY = rect.top + camY * scaleY;

      if (elapsed <= wobbleDuration) {
        // Wobble phase: shake side to side at the head
        const wobble = Math.sin(elapsed / 60 * Math.PI) * 6;
        el.style.left = `${screenX + wobble}px`;
        el.style.top = `${screenY}px`;
        el.style.opacity = '1';
      } else {
        // Float up phase
        const floatProgress = (elapsed - wobbleDuration) / floatDuration;
        el.style.left = `${screenX}px`;
        el.style.top = `${screenY - floatProgress * 40 * scaleY}px`;
        el.style.opacity = floatProgress > 0.5 ? String(1 - (floatProgress - 0.5) / 0.5) : '1';
      }

      if (elapsed >= totalDuration) {
        clearInterval(interval);
        el.remove();
      }
    }, 16);
  }

  destroy() {
    if (this.sprite) {
      this.sprite.destroy();
    }
  }
}