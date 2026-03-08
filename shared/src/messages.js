// Message types
export const MSG = {
  // Client → Server
  JOIN: 'join',
  MOVE: 'move',
  MAP_CHANGE: 'map_change',
  SAVE_STATE: 'save_state',
  ENCOUNTER_CHECK: 'encounter_check',
  BATTLE_START: 'battle_start',
  CATCH_ATTEMPT: 'catch_attempt',
  USE_ITEM: 'use_item',
  CHAT_SEND: 'chat_send',

  // Server → Client
  WELCOME: 'welcome',
  PLAYER_JOINED: 'player_joined',
  PLAYER_MOVED: 'player_moved',
  PLAYER_LEFT: 'player_left',
  PLAYERS_SYNC: 'players_sync',
  ENCOUNTER_RESULT: 'encounter_result',
  CATCH_RESULT: 'catch_result',
  ITEM_RESULT: 'item_result',
  MOVE_REJECT: 'move_reject',
  CHAT_MESSAGE: 'chat_message',
  CHAT_WHISPER: 'chat_whisper',
  PLAYER_COUNT: 'player_count',
  SYSTEM_MSG: 'system_msg',
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
