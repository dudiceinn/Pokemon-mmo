import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { MSG } from '@pokemon-mmo/shared';
import { PlayerState } from './PlayerState.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Adjust this to point at your assets root (where maps/, npcs/, spawns/ live)
const ASSETS_DIR = path.resolve(__dirname, '../../client/public');

let nextId = 1;

export class GameServer {
  constructor(port) {
    this.port = port;
    this.players = new Map(); // ws → PlayerState
    this.wss = null;
    this.httpServer = null;
  }

  start() {
    // HTTP server handles /api/save-map; WS upgrades are handled by wss
    this.httpServer = createServer((req, res) => {
      // Allow preflight from the editor
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }).end();
        return;
      }
      if (req.method === 'POST' && req.url === '/api/save-map') {
        this._handleSaveMap(req, res);
      } else {
        res.writeHead(404).end('Not found');
      }
    });

    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws) => {
      this.handleConnection(ws);
    });

    this.httpServer.listen(this.port, () => {
      console.log(`[GameServer] HTTP + WebSocket server listening on port ${this.port}`);
    });
  }

  // ─── Save-map API ────────────────────────────────────────────────────────────

  async _handleSaveMap(req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    try {
      const body = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => (data += chunk));
        req.on('end', () => resolve(data));
        req.on('error', reject);
      });

      const { mapKey, data: mapData, npcs, spawns } = JSON.parse(body);
      if (!mapKey) throw new Error('Missing mapKey');

      // Save map JSON → maps/<mapKey>.json
      const mapPath = path.join(ASSETS_DIR, 'maps', `${mapKey}.json`);
      await fs.writeFile(mapPath, JSON.stringify(mapData, null, 2));

      // Save NPCs → npcs/<mapKey>.json
      const npcsDir = path.join(ASSETS_DIR, 'npcs');
      await fs.mkdir(npcsDir, { recursive: true });
      await fs.writeFile(
        path.join(npcsDir, `${mapKey}.json`),
        JSON.stringify(npcs ?? [], null, 2)
      );

      // Save spawns → spawns/<mapKey>.json
      const spawnsDir = path.join(ASSETS_DIR, 'spawns');
      await fs.mkdir(spawnsDir, { recursive: true });
      await fs.writeFile(
        path.join(spawnsDir, `${mapKey}.json`),
        JSON.stringify(spawns ?? [], null, 2)
      );

      console.log(
        `[GameServer] Saved ${mapKey}: ${npcs?.length ?? 0} NPCs, ` +
        `${spawns?.length ?? 0} spawn tiles`
      );
      res.writeHead(200).end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error('[GameServer] save-map error:', err.message);
      res.writeHead(500).end(JSON.stringify({ ok: false, error: err.message }));
    }
  }

  // ─── WebSocket handlers ───────────────────────────────────────────────────────

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
