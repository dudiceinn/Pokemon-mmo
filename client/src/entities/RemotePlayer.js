import Phaser from 'phaser';
import { TILE_SIZE, MOVE_DURATION, DIR } from '@pokemon-mmo/shared';
import { NameLabel } from '../systems/NameLabel.js';

// Same frame mapping as Player.js
const DIR_FRAMES = {
  [DIR.DOWN]:  { stand: 0, walk: [1, 0, 2, 0] },
  [DIR.UP]:    { stand: 3, walk: [4, 3, 5, 3] },
  [DIR.LEFT]:  { stand: 6, walk: [7, 6, 8, 6] },
  [DIR.RIGHT]: { stand: 9, walk: [10, 9, 11, 9] },
};

export class RemotePlayer {
  constructor(scene, id, name, x, y, dir, spriteKey = 'player') {
    this.scene = scene;
    this.id = id;
    this.name = name;
    this.tileX = x;
    this.tileY = y;
    this.dir = dir || DIR.DOWN;
    this.spriteKey = spriteKey;

    this.sprite = scene.add.sprite(
      x * TILE_SIZE + TILE_SIZE / 2,
      y * TILE_SIZE + TILE_SIZE,
      spriteKey,
      DIR_FRAMES[this.dir].stand
    );
    this.sprite.setOrigin(0.5, 1);
	this.sprite.setScale(0.5); // 👈 add this
    this.sprite.setDepth(9);

    // HTML name label (crisp at any zoom)
    this.label = new NameLabel(name);

    this.createAnimations();
  }

  createAnimations() {
    const key = this.spriteKey;
    for (const [dir, mapping] of Object.entries(DIR_FRAMES)) {
      const animKey = `${key}_walk_${dir}`;
      if (this.scene.anims.exists(animKey)) return;
      this.scene.anims.create({
        key: animKey,
        frames: mapping.walk.map(f => ({ key, frame: f })),
        frameRate: 1000 / MOVE_DURATION * mapping.walk.length,
        repeat: 0,
      });
    }
  }

  moveTo(x, y, dir) {
    this.dir = dir || this.dir;
    this.tileX = x;
    this.tileY = y;

    // Play walk animation
    const animKey = `${this.spriteKey}_walk_${this.dir}`;
    if (this.scene.anims.exists(animKey)) {
      this.sprite.play(animKey);
    }

    const targetX = x * TILE_SIZE + TILE_SIZE / 2;
    const targetY = y * TILE_SIZE + TILE_SIZE;

    // Tween sprite
    this.scene.tweens.add({
      targets: this.sprite,
      x: targetX,
      y: targetY,
      duration: MOVE_DURATION,
      ease: 'Linear',
      onComplete: () => {
        this.sprite.setFrame(DIR_FRAMES[this.dir].stand);
      },
    });
  }

  updateLabel(camera) {
    this.label.update(this.sprite, camera);
  }

  setPosition(x, y, dir) {
    this.tileX = x;
    this.tileY = y;
    this.dir = dir || this.dir;
    this.sprite.setPosition(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE);
    this.sprite.setFrame(DIR_FRAMES[this.dir].stand);
  }

  destroy() {
    this.sprite.destroy();
    this.label.destroy();
  }
}
