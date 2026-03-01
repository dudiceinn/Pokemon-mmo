import { WebSocketServer } from 'ws';
import { MSG } from '@pokemon-mmo/shared';
import { PlayerState } from './PlayerState.js';

let nextId = 1;

export class GameServer {
  constructor(port) {
    this.port = port;
    this.players = new Map(); // ws → PlayerState
    this.wss = null;
  }

  start() {
    this.wss = new WebSocketServer({ port: this.port });

    this.wss.on('connection', (ws) => {
      this.handleConnection(ws);
    });

    console.log(`[GameServer] WebSocket server listening on port ${this.port}`);
  }

  handleConnection(ws) {
    const id = `player_${nextId++}`;
    console.log(`[GameServer] New connection: ${id}`);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        this.handleMessage(ws, msg);
      } catch (err) {
        console.error(`[GameServer] Bad message from ${id}:`, err.message);
      }
    });

    ws.on('close', () => {
      const player = this.players.get(ws);
      if (player) {
        console.log(`[GameServer] ${player.name} (${player.id}) disconnected`);
        this.players.delete(ws);
        this.broadcastToMap(player.map, {
          type: MSG.PLAYER_LEFT,
          id: player.id,
        }, ws);
      }
    });

    // Temporarily store with just the ID until they send JOIN
    ws._playerId = id;
  }

  handleMessage(ws, msg) {
    switch (msg.type) {
      case MSG.JOIN:
        this.handleJoin(ws, msg);
        break;
      case MSG.MOVE:
        this.handleMove(ws, msg);
        break;
      case MSG.MAP_CHANGE:
        this.handleMapChange(ws, msg);
        break;
      default:
        console.warn(`[GameServer] Unknown message type: ${msg.type}`);
    }
  }

  handleJoin(ws, msg) {
    const player = new PlayerState(ws._playerId, msg.name || 'Trainer');
    this.players.set(ws, player);

    console.log(`[GameServer] ${player.name} joined at ${player.map}`);

    // Send welcome with player's own state
    this.send(ws, {
      type: MSG.WELCOME,
      player: player.toJSON(),
    });

    // Send existing players on same map
    const playersOnMap = this.getPlayersOnMap(player.map, ws);
    this.send(ws, {
      type: MSG.PLAYERS_SYNC,
      players: playersOnMap.map(p => p.toJSON()),
    });

    // Notify others
    this.broadcastToMap(player.map, {
      type: MSG.PLAYER_JOINED,
      ...player.toJSON(),
    }, ws);
  }

  handleMove(ws, msg) {
    const player = this.players.get(ws);
    if (!player) return;

    player.x = msg.x;
    player.y = msg.y;
    player.dir = msg.dir;

    this.broadcastToMap(player.map, {
      type: MSG.PLAYER_MOVED,
      id: player.id,
      x: player.x,
      y: player.y,
      dir: player.dir,
    }, ws);
  }

  handleMapChange(ws, msg) {
    const player = this.players.get(ws);
    if (!player) return;

    const oldMap = player.map;

    // Notify old map that player left
    this.broadcastToMap(oldMap, {
      type: MSG.PLAYER_LEFT,
      id: player.id,
    }, ws);

    // Update player state
    player.map = msg.map;
    player.x = msg.x ?? player.x;
    player.y = msg.y ?? player.y;

    // Send players on new map
    const playersOnMap = this.getPlayersOnMap(player.map, ws);
    this.send(ws, {
      type: MSG.PLAYERS_SYNC,
      players: playersOnMap.map(p => p.toJSON()),
    });

    // Notify new map that player joined
    this.broadcastToMap(player.map, {
      type: MSG.PLAYER_JOINED,
      ...player.toJSON(),
    }, ws);

    console.log(`[GameServer] ${player.name} moved from ${oldMap} to ${player.map}`);
  }

  getPlayersOnMap(map, excludeWs = null) {
    const result = [];
    for (const [ws, player] of this.players) {
      if (player.map === map && ws !== excludeWs) {
        result.push(player);
      }
    }
    return result;
  }

  broadcastToMap(map, msg, excludeWs = null) {
    const data = JSON.stringify(msg);
    for (const [ws, player] of this.players) {
      if (player.map === map && ws !== excludeWs && ws.readyState === 1) {
        ws.send(data);
      }
    }
  }

  send(ws, msg) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(msg));
    }
  }
}
