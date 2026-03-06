import Phaser from 'phaser';
import { TILE_SIZE, MOVE_DURATION, DIR, DIR_VECTOR } from '@pokemon-mmo/shared';
import { NameLabel } from '../systems/NameLabel.js';

// Add this fallback in case MOVE_DURATION is undefined
const MOVE_DURATION_MS = MOVE_DURATION || 200; // Use 200ms if MOVE_DURATION is undefined

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

export class NPC {
  constructor(scene, data) {
    this.scene = scene;
    this.id = data._filename || `npc_${data.x}_${data.y}`;
    this.name = data.name || '';
    this.spriteKey = data.sprite || 'NPC 01';
    this.dir = data.dir || DIR.DOWN;
    this.type = data.type || 'npc';
    this.showFlag = data.showFlag || '';
    this.hideFlag = data.hideFlag || '';
    this.walkOnFlag = data.walkOnFlag || '';
    this.walkToDefault = data.walkTo || null;
    this.roam = data.roam || false;
    this.roamRadius = data.roamRadius || 3;
    this.dialogs = data.dialogs || [];
    this._visible = true;
    this._justAppeared = false;
    this.isWalking = false;
    this._collisionCheck = null;
	this.extraTiles = data.extraTiles || [];
	
    // Original position
    this.startX = data.x;
    this.startY = data.y;
    this.tileX = data.x;
    this.tileY = data.y;

    // Create sprite
    this.sprite = scene.add.sprite(
      this.tileX * TILE_SIZE + TILE_SIZE / 2,
      this.tileY * TILE_SIZE + TILE_SIZE,
      this.spriteKey,
      DIR_FRAMES[this.dir].stand
    );
    this.sprite.setOrigin(0.5, 1);
    this.sprite.setDepth(5);
    
    // Apply scale to make it appear as 16x32
    this.sprite.setScale(SPRITE_SCALE);

// Hide sprite for invisible NPC types
if (this.type === 'sign' || this.type === 'trigger') {
  this.sprite.setVisible(false);
}

    // Create name label (only if name exists) — same HTML NameLabel as RemotePlayer
    if (this.name) {
      this.label = new NameLabel(this.name);
    }

    this.createAnimations();
  }

  createAnimations() {
    const key = this.spriteKey;
    
    // Delete existing animations if they exist
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

  updateVisibility(flagManager) {
    let shouldShow = true;
    if (this.showFlag && !flagManager.hasFlag(this.showFlag)) shouldShow = false;
    if (this.hideFlag && flagManager.hasFlag(this.hideFlag)) shouldShow = false;

    if (shouldShow !== this._visible) {
      this._visible = shouldShow;
      this._justAppeared = shouldShow;
      if (this.type !== 'sign' && this.type !== 'trigger') {
        this.sprite.setVisible(shouldShow);
      }
      if (this.label) {
        if (shouldShow) this.label.show();
        else this.label.hide();
      }
    }
  }

  getDialog(flagManager) {
    // Find first dialog with matching condition
    for (const d of this.dialogs) {
      if (!d.condition || flagManager.hasFlag(d.condition)) {
        return {
          script: d.script || '',
          setFlag: d.setFlag || '',
          clearFlag: d.clearFlag || '',
          walkTo: d.walkTo || null,
          teleportPlayer: d.teleportPlayer || null,
          movePlayer: d.movePlayer || null,
        };
      }
    }
    return { script: '' };
  }

  faceDirection(dir) {
    if (this.type === 'sign' || this.type === 'trigger') return;
    this.dir = dir;
    if (this.sprite && this._visible) {
      this.sprite.setFrame(DIR_FRAMES[dir].stand);
    }
  }

  walkToTile(targetX, targetY, onComplete) {
    if (this.isWalking || !this._visible) {
      if (onComplete) onComplete();
      return;
    }

    this.isWalking = true;
    const steps = [];

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
        if (onComplete) onComplete();
        return;
      }

      const dir = steps[stepIdx];
      this.dir = dir;
      const vec = DIR_VECTOR[dir];
      const newX = this.tileX + vec.x;
      const newY = this.tileY + vec.y;

      // Check collision if needed
      if (this._collisionCheck && this._collisionCheck(newX, newY, this)) {
        // Can't move, abort walking
        this.isWalking = false;
        if (onComplete) onComplete();
        return;
      }

      // Play walk animation
      this.sprite.play(`${this.spriteKey}_walk_${dir}`);

      const targetX = newX * TILE_SIZE + TILE_SIZE / 2;
      const targetY = newY * TILE_SIZE + TILE_SIZE;

      this.scene.tweens.add({
        targets: this.sprite,
        x: targetX,
        y: targetY,
        duration: MOVE_DURATION_MS,
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

  updateRoam(delta) {
    if (this.type === 'sign' || this.type === 'trigger') return;
    if (!this.roam || this.isWalking || !this._visible) return;

    // Simple roam: randomly move within radius every few seconds
    if (!this._roamTimer) {
      this._roamTimer = 0;
    }
    this._roamTimer += delta;

    if (this._roamTimer > 3000) { // Move every 3 seconds
      this._roamTimer = 0;

      // Pick random direction
      const dirs = [DIR.DOWN, DIR.LEFT, DIR.RIGHT, DIR.UP];
      const dir = dirs[Math.floor(Math.random() * dirs.length)];
      const vec = DIR_VECTOR[dir];
      const newX = this.tileX + vec.x;
      const newY = this.tileY + vec.y;

      // Check if within roam radius from start position
      const distFromStart = Math.abs(newX - this.startX) + Math.abs(newY - this.startY);
      if (distFromStart <= this.roamRadius) {
        // Check collision
        if (!this._collisionCheck || !this._collisionCheck(newX, newY, this)) {
          this.walkToTile(newX, newY, () => {});
        }
      }
    }
  }

  updateLabel(camera) {
    if (this.label) {
      if (this._visible) {
        this.label.update(this.sprite, camera);
        this.label.show();
      } else {
        this.label.hide();
      }
    }
  }

  destroy() {
    if (this.sprite) this.sprite.destroy();
    if (this.label) this.label.destroy();
  }
}