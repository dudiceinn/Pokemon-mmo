import Phaser from 'phaser';
import { TILE_SIZE } from '@pokemon-mmo/shared';
import { BootScene } from './scenes/BootScene.js';
import { OverworldScene } from './scenes/OverworldScene.js';
import { UIScene } from './scenes/UIScene.js';

// Pick the largest integer zoom that fits, snap game res to whole tiles.
const screenW = window.innerWidth;
const screenH = window.innerHeight;

let zoom = Math.min(Math.floor(screenW / 240), Math.floor(screenH / 160));
zoom = Math.max(2, Math.min(zoom, 5));

const gameWidth = Math.floor(screenW / zoom / TILE_SIZE) * TILE_SIZE;
const gameHeight = Math.floor(screenH / zoom / TILE_SIZE) * TILE_SIZE;

export { zoom as ZOOM, gameWidth as GAME_WIDTH, gameHeight as GAME_HEIGHT };

export const gameConfig = {
  type: Phaser.AUTO,
  width: gameWidth,
  height: gameHeight,
  pixelArt: true,
  roundPixels: true,
  zoom,
  parent: document.body,
  backgroundColor: '#000000',
  scene: [BootScene, OverworldScene, UIScene],
};
