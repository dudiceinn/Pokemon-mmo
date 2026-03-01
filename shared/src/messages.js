// Message types
export const MSG = {
  // Client → Server
  JOIN: 'join',
  MOVE: 'move',
  MAP_CHANGE: 'map_change',

  // Server → Client
  WELCOME: 'welcome',
  PLAYER_JOINED: 'player_joined',
  PLAYER_MOVED: 'player_moved',
  PLAYER_LEFT: 'player_left',
  PLAYERS_SYNC: 'players_sync',
};

// Message factories
export function createJoinMsg(name) {
  return { type: MSG.JOIN, name };
}

export function createMoveMsg(x, y, dir) {
  return { type: MSG.MOVE, x, y, dir };
}

export function createMapChangeMsg(map) {
  return { type: MSG.MAP_CHANGE, map };
}
