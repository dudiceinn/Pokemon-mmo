import { TILE_SIZE, MOVE_DURATION, DIR, DIR_VECTOR } from '@pokemon-mmo/shared';
import { NameLabel } from '../systems/NameLabel.js';

const DIR_FRAMES = {
  [DIR.DOWN]:  { stand: 0, walk: [1, 0, 2, 0] },
  [DIR.UP]:    { stand: 3, walk: [4, 3, 5, 3] },
  [DIR.LEFT]:  { stand: 6, walk: [7, 6, 8, 6] },
  [DIR.RIGHT]: { stand: 9, walk: [10, 9, 11, 9] },
};

export class NPC {
  constructor(scene, data) {
    this.scene = scene;
    this.tileX = data.x;
    this.tileY = data.y;
    this.name = data.name || '';
    this.spriteKey = data.sprite || 'npc_oak';
    this.dir = data.dir || DIR.DOWN;
    this.dialog = data.dialog || [];
    this.dialogs = data.dialogs || [];
    this.type = data.type || 'npc';
    this.showFlag = data.showFlag || '';
    this.hideFlag = data.hideFlag || '';
    this.walkOnFlag = data.walkOnFlag || '';
    this.walkToDefault = data.walkTo || null;
    this.roam = data.roam || false;
    this.roamRadius = data.roamRadius || 3;
    this.autoTalk = data.autoTalk || false;
    this._originX = data.x;
    this._originY = data.y;
    this._visible = true;
    this._wasVisible = false;
    this.isWalking = false;
    this._roamTimer = 0;
    this._roamDelay = 0;
    this._collisionCheck = null;

    this.sprite = scene.add.sprite(
      data.x * TILE_SIZE + TILE_SIZE / 2,
      data.y * TILE_SIZE + TILE_SIZE,
      this.spriteKey,
      DIR_FRAMES[this.dir]?.stand || 0
    );
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setDepth(8);

    // Hide sprite and label for invisible NPC types
    if (this.type === 'sign' || this.type === 'trigger') {
      this.sprite.setVisible(false);
      this.label = null;
    } else {
      this.label = new NameLabel(this.name);
      this.createAnimations();
    }
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

  updateLabel(camera) {
    if (this.label) this.label.update(this.sprite, camera);
  }

  updateVisibility(flagManager) {
    let shouldShow = true;
    if (this.showFlag) shouldShow = flagManager.hasFlag(this.showFlag);
    if (this.hideFlag && flagManager.hasFlag(this.hideFlag)) shouldShow = false;

    const justBecameVisible = shouldShow && !this._wasVisible;
    this._wasVisible = shouldShow;
    this._visible = shouldShow;
    this._justAppeared = justBecameVisible && this.autoTalk;

    // Sign/trigger types are always invisible sprites
    if (this.type === 'sign' || this.type === 'trigger') return;

    this.sprite.setVisible(shouldShow);
    if (this.label) {
      if (shouldShow) this.label.show();
      else this.label.hide();
    }
  }

  getDialog(flagManager) {
    if (this.dialogs.length > 0) {
      // Iterate bottom-to-top: #1 is default, conditions go below
      for (let i = this.dialogs.length - 1; i >= 0; i--) {
        const entry = this.dialogs[i];
        if (!entry.condition || flagManager.hasFlag(entry.condition)) {
          return {
            lines: entry.lines,
            setFlag: entry.setFlag || '',
            clearFlag: entry.clearFlag || '',
            walkTo: entry.walkTo || null,
            teleportPlayer: entry.teleportPlayer || null,
            movePlayer: entry.movePlayer || null,
          };
        }
      }
    }
    // Fallback to simple dialog
    return { lines: this.dialog, setFlag: '', clearFlag: '', walkTo: null, teleportPlayer: null, movePlayer: null };
  }

  faceDirection(dir) {
    if (this.type === 'sign' || this.type === 'trigger') return;
    this.dir = dir;
    const frame = DIR_FRAMES[dir]?.stand;
    if (frame !== undefined) {
      this.sprite.setFrame(frame);
    }
  }

  updateRoam(delta) {
    if (!this.roam || !this._visible || this.isWalking) return;
    if (this.type === 'sign' || this.type === 'trigger') return;

    this._roamTimer += delta;
    if (this._roamTimer < this._roamDelay) return;

    // Random delay between 1.5s and 4s for next move
    this._roamTimer = 0;
    this._roamDelay = 1500 + Math.random() * 2500;

    // 30% chance to just turn in place instead of walking
    const dirs = [DIR.DOWN, DIR.UP, DIR.LEFT, DIR.RIGHT];
    const dir = dirs[Math.floor(Math.random() * dirs.length)];

    if (Math.random() < 0.3) {
      this.faceDirection(dir);
      return;
    }

    const vec = DIR_VECTOR[dir];
    const newX = this.tileX + vec.x;
    const newY = this.tileY + vec.y;

    // Stay within roam radius from origin
    if (Math.abs(newX - this._originX) > this.roamRadius ||
        Math.abs(newY - this._originY) > this.roamRadius) {
      this.faceDirection(dir);
      return;
    }

    // Check collision via scene callback
    if (this._collisionCheck && this._collisionCheck(newX, newY, this)) return;

    // Walk one tile
    this.isWalking = true;
    this.dir = dir;
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
        this.isWalking = false;
        this.sprite.setFrame(DIR_FRAMES[dir]?.stand || 0);
      },
    });
  }

  walkToTile(targetX, targetY, onComplete) {
    this.isWalking = true;
    const steps = [];

    // Build step list: X first, then Y
    const dx = targetX - this.tileX;
    const dy = targetY - this.tileY;
    const xDir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
    const yDir = dy > 0 ? DIR.DOWN : DIR.UP;

    for (let i = 0; i < Math.abs(dx); i++) steps.push(xDir);
    for (let i = 0; i < Math.abs(dy); i++) steps.push(yDir);

    if (steps.length === 0) {
      this.isWalking = false;
      if (onComplete) onComplete();
      return;
    }

    let stepIdx = 0;
    const doStep = () => {
      if (stepIdx >= steps.length) {
        this.isWalking = false;
        this.sprite.setFrame(DIR_FRAMES[this.dir]?.stand || 0);
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
          this.sprite.setFrame(DIR_FRAMES[dir]?.stand || 0);
          stepIdx++;
          doStep();
        },
      });
    };

    doStep();
  }

  destroy() {
    this.sprite.destroy();
    if (this.label) this.label.destroy();
  }
}