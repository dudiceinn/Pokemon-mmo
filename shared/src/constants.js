// Tile and rendering
export const TILE_SIZE = 16;
// Dynamic — computed at runtime by client config.js
// These are kept as defaults / fallbacks for server-side code
export const GAME_WIDTH = 240;
export const GAME_HEIGHT = 160;
export const SCALE = 3;

// Movement
export const MOVE_DURATION = 200; // ms to walk one tile
export const RUN_DURATION = 100;  // ms to run one tile

// Directions
export const DIR = {
  DOWN: 'down',
  UP: 'up',
  LEFT: 'left',
  RIGHT: 'right',
};

// Direction vectors
export const DIR_VECTOR = {
  [DIR.DOWN]:  { x: 0, y: 1 },
  [DIR.UP]:    { x: 0, y: -1 },
  [DIR.LEFT]:  { x: -1, y: 0 },
  [DIR.RIGHT]: { x: 1, y: 0 },
};

// Network
export const SERVER_PORT = 3000;
export const WS_PORT = 3001;
