import Phaser from 'phaser';
import { TILE_SIZE, MOVE_DURATION, DIR, DIR_VECTOR } from '@pokemon-mmo/shared';

// Spritesheet frame mapping (12 frames total):
// 0-2: down (stand, walk1, walk2)
// 3-5: up (stand, walk1, walk2)
// 6-8: left (stand, walk1, walk2)
// 9-11: right (stand, walk1, walk2)
const DIR_FRAMES = {
  [DIR.DOWN]:  { stand: 0, walk: [1, 0, 2, 0] },
  [DIR.UP]:    { stand: 3, walk: [4, 3, 5, 3] },
  [DIR.LEFT]:  { stand: 6, walk: [7, 6, 8, 6] },
  [DIR.RIGHT]: { stand: 9, walk: [10, 9, 11, 9] },
};

export class Player {
  constructor(scene, x, y, spriteKey = 'player') {
    this.scene = scene;
    this.tileX = x;
    this.tileY = y;
    this.dir = DIR.DOWN;
    this.isMoving = false;
    this.onMoveComplete = null;
    this.spriteKey = spriteKey;

    // Sprite is 16x32, anchored at bottom-center so feet align with tile
    this.sprite = scene.add.sprite(
      x * TILE_SIZE + TILE_SIZE / 2,
      y * TILE_SIZE + TILE_SIZE,
      spriteKey,
      DIR_FRAMES[DIR.DOWN].stand
    );
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setDepth(10);

    this.createAnimations();
  }

  createAnimations() {
    const key = this.spriteKey;
    for (const [dir, mapping] of Object.entries(DIR_FRAMES)) {
      const animKey = `${key}_walk_${dir}`;
      if (this.scene.anims.exists(animKey)) continue;
      this.scene.anims.create({
        key: animKey,
        frames: mapping.walk.map(f => ({ key, frame: f })),
        frameRate: 1000 / MOVE_DURATION * mapping.walk.length,
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

    // Tween to target tile
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

      this.sprite.play(`${this.spriteKey}_walk_${dir}`);

      const pixelX = newX * TILE_SIZE + TILE_SIZE / 2;
      const pixelY = newY * TILE_SIZE + TILE_SIZE;

      this.scene.tweens.add({
        targets: this.sprite,
        x: pixelX,
        y: pixelY,
        duration: MOVE_DURATION,
        ease: 'Linear',
        onComplete: () => {
          this.tileX = newX;
          this.tileY = newY;
          this.sprite.setFrame(DIR_FRAMES[dir].stand);
          stepIdx++;
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

  destroy() {
    this.sprite.destroy();
  }
}
