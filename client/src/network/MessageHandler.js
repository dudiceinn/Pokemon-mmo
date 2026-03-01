import { MSG } from '@pokemon-mmo/shared';

export function setupMessageHandlers(client, scene) {
  client.on(MSG.WELCOME, (msg) => {
    client.playerId = msg.player.id;
    console.log(`[Game] Welcome! You are ${msg.player.name} (${msg.player.id})`);
  });

  client.on(MSG.PLAYERS_SYNC, (msg) => {
    console.log(`[Game] Synced ${msg.players.length} players on map`);
    // Will create RemotePlayer entities in Phase 5
  });

  client.on(MSG.PLAYER_JOINED, (msg) => {
    console.log(`[Game] ${msg.name} joined`);
    // Will create RemotePlayer entity
  });

  client.on(MSG.PLAYER_MOVED, (msg) => {
    // Will update RemotePlayer position
  });

  client.on(MSG.PLAYER_LEFT, (msg) => {
    console.log(`[Game] Player ${msg.id} left`);
    // Will remove RemotePlayer entity
  });
}
