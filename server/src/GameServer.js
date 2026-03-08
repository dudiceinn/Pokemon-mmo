import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { MSG, MOVE_DURATION } from '@pokemon-mmo/shared';
import { PlayerState } from './PlayerState.js';
import { register, login, verifyToken } from './auth.js';
import { getPlayerState, getDisplayName, savePlayerState } from './db.js';
import { EncounterManager } from './EncounterManager.js';
import { CatchManager } from './CatchManager.js';
import { CollisionManager } from './CollisionManager.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, '../../client/public');

let nextId = 1;

export class GameServer {
  constructor(port) {
    this.port = port;
    this.players = new Map(); // ws → PlayerState
    this.encounterManager = new EncounterManager();
    this.catchManager = new CatchManager();
    this.collisionManager = new CollisionManager();
    this.wss = null;
    this.httpServer = null;
  }

  start() {
    this.httpServer = createServer((req, res) => this._handleHTTP(req, res));

    this.wss = new WebSocketServer({ server: this.httpServer });
    this.wss.on('connection', (ws) => this.handleConnection(ws));

    this.httpServer.listen(this.port, () => {
      console.log(`[GameServer] HTTP + WebSocket server listening on port ${this.port}`);
    });
  }

  // ─── HTTP routing ───────────────────────────────────────────────────────────

  _handleHTTP(req, res) {
    // CORS headers for all responses
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    if (req.method === 'POST') {
      switch (req.url) {
        case '/api/register': return this._handleAuth(req, res, 'register');
        case '/api/login':    return this._handleAuth(req, res, 'login');
        case '/api/save-map': return this._handleSaveMap(req, res);
      }
    }

    res.writeHead(404).end('Not found');
  }

  // ─── Auth endpoints ─────────────────────────────────────────────────────────

  async _handleAuth(req, res, mode) {
    res.setHeader('Content-Type', 'application/json');
    try {
      const body = await this._readBody(req);
      const { username, password, displayName } = JSON.parse(body);

      const result = mode === 'register'
        ? register(username, displayName, password)
        : login(username, password);

      if (result.error) {
        res.writeHead(400).end(JSON.stringify({ ok: false, error: result.error }));
        return;
      }

      console.log(`[Auth] ${mode}: ${username} (id=${result.playerId})`);
      res.writeHead(200).end(JSON.stringify({
        ok: true,
        token: result.token,
        displayName: result.displayName,
        state: result.state,
      }));
    } catch (err) {
      console.error(`[Auth] ${mode} error:`, err.message);
      res.writeHead(500).end(JSON.stringify({ ok: false, error: 'Server error' }));
    }
  }

  // ─── Save-map API (map editor) ─────────────────────────────────────────────

  async _handleSaveMap(req, res) {
    res.setHeader('Content-Type', 'application/json');
    try {
      const body = await this._readBody(req);
      const { mapKey, data: mapData, npcs, spawns } = JSON.parse(body);
      if (!mapKey) throw new Error('Missing mapKey');

      const mapPath = path.join(ASSETS_DIR, 'maps', `${mapKey}.json`);
      await fs.writeFile(mapPath, JSON.stringify(mapData, null, 2));

      const npcsDir = path.join(ASSETS_DIR, 'npcs');
      await fs.mkdir(npcsDir, { recursive: true });
      await fs.writeFile(path.join(npcsDir, `${mapKey}.json`), JSON.stringify(npcs ?? [], null, 2));

      const spawnsDir = path.join(ASSETS_DIR, 'spawns');
      await fs.mkdir(spawnsDir, { recursive: true });
      await fs.writeFile(path.join(spawnsDir, `${mapKey}.json`), JSON.stringify(spawns ?? [], null, 2));

      // Invalidate cached collision data so server uses updated map
      this.collisionManager.invalidateMap(mapKey);

      console.log(`[GameServer] Saved ${mapKey}: ${npcs?.length ?? 0} NPCs, ${spawns?.length ?? 0} spawn tiles`);
      res.writeHead(200).end(JSON.stringify({ ok: true }));
    } catch (err) {
      console.error('[GameServer] save-map error:', err.message);
      res.writeHead(500).end(JSON.stringify({ ok: false, error: err.message }));
    }
  }

  // ─── WebSocket handlers ─────────────────────────────────────────────────────

  handleConnection(ws) {
    const id = `player_${nextId++}`;
    ws._sessionId = id;

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
        // Save position to DB on disconnect
        if (player.dbId) {
          try {
            const dbState = getPlayerState(player.dbId);
            if (dbState) {
              savePlayerState(player.dbId, {
                map: player.map,
                x: player.x,
                y: player.y,
                dir: player.dir,
                party: JSON.parse(dbState.party_json),
                pc: JSON.parse(dbState.pc_json),
                bag: JSON.parse(dbState.bag_json),
                flags: JSON.parse(dbState.flags_json),
                money: dbState.money,
                badges: JSON.parse(dbState.badges_json),
              });
            }
          } catch (err) {
            console.error(`[GameServer] Failed to save position on disconnect:`, err.message);
          }
        }

        this.catchManager.endBattle(player.id);
        console.log(`[GameServer] ${player.name} (${player.id}) disconnected`);
        const playerName = player.name;
        this.players.delete(ws);
        this.broadcastToMap(player.map, { type: MSG.PLAYER_LEFT, id: player.id }, ws);

        // Broadcast leave notification + updated player count
        this.broadcastSystemMsg(`${playerName} left the game.`);
        this.broadcastPlayerCount();
      }
    });
  }

  handleMessage(ws, msg) {
    switch (msg.type) {
      case MSG.JOIN:       return this.handleJoin(ws, msg);
      case MSG.MOVE:            return this.handleMove(ws, msg);
      case MSG.MAP_CHANGE:     return this.handleMapChange(ws, msg);
      case MSG.SAVE_STATE:     return this.handleSaveState(ws, msg);
      case MSG.ENCOUNTER_CHECK: return this.handleEncounterCheck(ws, msg);
      case MSG.BATTLE_START:   return this.handleBattleStart(ws, msg);
      case MSG.CATCH_ATTEMPT:  return this.handleCatchAttempt(ws, msg);
      case MSG.USE_ITEM:       return this.handleUseItem(ws, msg);
      case MSG.CHAT_SEND:      return this.handleChat(ws, msg);
      default:
        console.warn(`[GameServer] Unknown message type: ${msg.type}`);
    }
  }

  handleJoin(ws, msg) {
    const token = msg.token;
    let player;

    if (token) {
      // Authenticated join
      const decoded = verifyToken(token);
      if (!decoded) {
        this.send(ws, { type: 'auth_error', error: 'Invalid or expired token.' });
        ws.close();
        return;
      }

      const dbState = getPlayerState(decoded.id);
      const displayName = msg.name || getDisplayName(decoded.id) || 'Trainer';
      player = PlayerState.fromDB(ws._sessionId, displayName, decoded.id, dbState);

      // Kick previous connection for same account (prevent double login)
      for (const [otherWs, otherPlayer] of this.players) {
        if (otherPlayer.dbId === decoded.id && otherWs !== ws) {
          this.send(otherWs, { type: 'auth_error', error: 'Logged in from another location.' });
          otherWs.close();
          break;
        }
      }
    } else {
      // Unauthenticated join (legacy / dev)
      player = new PlayerState(ws._sessionId, msg.name || 'Trainer');
    }

    this.players.set(ws, player);
    console.log(`[GameServer] ${player.name} joined (db=${player.dbId ?? 'none'})`);

    // Send welcome
    this.send(ws, { type: MSG.WELCOME, player: player.toJSON() });

    // Send existing players on same map
    const playersOnMap = this.getPlayersOnMap(player.map, ws);
    this.send(ws, { type: MSG.PLAYERS_SYNC, players: playersOnMap.map(p => p.toJSON()) });

    // Notify others
    this.broadcastToMap(player.map, { type: MSG.PLAYER_JOINED, ...player.toJSON() }, ws);

    // Broadcast join notification + player count
    this.broadcastSystemMsg(`${player.name} joined the game.`);
    this.broadcastPlayerCount();
  }

  handleMove(ws, msg) {
    const player = this.players.get(ws);
    if (!player) return;

    const { x, y, dir } = msg;

    // Rate limit — reject moves faster than MOVE_DURATION * 0.5 (allow some slack)
    const now = Date.now();
    const minInterval = (MOVE_DURATION || 200) * 0.5;
    if (player._lastMoveTime && (now - player._lastMoveTime) < minInterval) {
      this.send(ws, { type: MSG.MOVE_REJECT, x: player.x, y: player.y, reason: 'too_fast' });
      return;
    }

    // Validate collision
    const result = this.collisionManager.validateMove(
      player.map, player.x, player.y, x, y, dir
    );

    if (!result.valid) {
      console.log(`[Move] ${player.name} REJECTED (${result.reason}) ${player.x},${player.y} → ${x},${y}`);
      this.send(ws, { type: MSG.MOVE_REJECT, x: player.x, y: player.y, reason: result.reason });
      return;
    }

    player._lastMoveTime = now;
    player.x = x;
    player.y = y;
    player.dir = dir;

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
    this.broadcastToMap(oldMap, { type: MSG.PLAYER_LEFT, id: player.id }, ws);

    player.map = msg.map;
    player.x = msg.x ?? player.x;
    player.y = msg.y ?? player.y;

    const playersOnMap = this.getPlayersOnMap(player.map, ws);
    this.send(ws, { type: MSG.PLAYERS_SYNC, players: playersOnMap.map(p => p.toJSON()) });
    this.broadcastToMap(player.map, { type: MSG.PLAYER_JOINED, ...player.toJSON() }, ws);

    console.log(`[GameServer] ${player.name} moved from ${oldMap} to ${player.map}`);
  }

  handleSaveState(ws, msg) {
    const player = this.players.get(ws);
    if (!player?.dbId) return;

    const state = msg.state;
    if (!state) return;

    try {
      savePlayerState(player.dbId, state);
      // Also update in-memory position
      if (state.map) player.map = state.map;
      if (state.x != null) player.x = state.x;
      if (state.y != null) player.y = state.y;
      if (state.dir) player.dir = state.dir;
    } catch (err) {
      console.error(`[GameServer] Save failed for ${player.name}:`, err.message);
    }
  }

  // ─── Encounter & Catch ────────────────────────────────────────────────────

  handleEncounterCheck(ws, msg) {
    const player = this.players.get(ws);
    if (!player) return;

    const result = this.encounterManager.checkStep(msg.map || player.map, msg.x, msg.y);
    if (result) {
      console.log(`[Encounter] ${player.name} → ${result.speciesId} Lv.${result.level} on ${player.map} (${msg.x},${msg.y})`);
    }
    this.send(ws, {
      type: MSG.ENCOUNTER_RESULT,
      spawn: result,
    });
  }

  handleBattleStart(ws, msg) {
    const player = this.players.get(ws);
    if (!player) return;

    console.log(`[Battle] ${player.name} started battle vs ${msg.speciesId} Lv.${msg.level}`);
    this.catchManager.startBattle(player.id, msg.speciesId, msg.level);
  }

  handleCatchAttempt(ws, msg) {
    const player = this.players.get(ws);
    if (!player?.dbId) return;

    console.log(`[Catch] ${player.name} threw ${msg.ballId} (enemy HP: ${msg.enemyHp}/${msg.enemyMaxHp})`);

    const result = this.catchManager.resolveCatch(
      player.id, player.dbId,
      msg.ballId, msg.enemyHp, msg.enemyMaxHp
    );

    if (result.error) {
      console.log(`[Catch] ${player.name} → ERROR: ${result.error}`);
      this.send(ws, { type: MSG.CATCH_RESULT, error: result.error });
      return;
    }

    console.log(`[Catch] ${player.name} → ${result.caught ? 'CAUGHT!' : `broke free (${result.wobbles} wobbles)`}`);
    this.send(ws, {
      type: MSG.CATCH_RESULT,
      caught: result.caught,
      wobbles: result.wobbles,
      ballId: result.ballId,
    });
  }

  handleUseItem(ws, msg) {
    const player = this.players.get(ws);
    if (!player?.dbId) return;

    const { itemId, count = 1 } = msg;
    if (!itemId) return;

    const state = getPlayerState(player.dbId);
    if (!state) return;

    const bag = JSON.parse(state.bag_json || '{}');

    if (!bag[itemId] || bag[itemId] < count) {
      console.log(`[Item] ${player.name} → DENIED ${itemId} (has ${bag[itemId] || 0})`);
      this.send(ws, { type: MSG.ITEM_RESULT, ok: false, itemId, error: "You don't have that item." });
      return;
    }

    // Remove from inventory
    bag[itemId] -= count;
    if (bag[itemId] <= 0) delete bag[itemId];

    // Save updated bag to DB
    savePlayerState(player.dbId, {
      map: state.map, x: state.x, y: state.y, dir: state.dir,
      party: JSON.parse(state.party_json || '[]'),
      pc: JSON.parse(state.pc_json || '{"boxNames":[],"boxes":[]}'),
      bag,
      flags: JSON.parse(state.flags_json || '{}'),
      money: state.money || 0,
      badges: JSON.parse(state.badges_json || '[]'),
    });

    console.log(`[Item] ${player.name} used ${itemId} (${bag[itemId] ?? 0} left)`);
    this.send(ws, { type: MSG.ITEM_RESULT, ok: true, itemId });
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────

  handleChat(ws, msg) {
    const player = this.players.get(ws);
    if (!player) return;

    let text = (msg.text || '').trim();
    if (!text) return;

    // Limit length
    if (text.length > 120) text = text.slice(0, 120);

    // Rate limit — 1 message per 500ms
    const now = Date.now();
    if (player._lastChatTime && (now - player._lastChatTime) < 500) return;
    player._lastChatTime = now;

    // Whisper: /w PlayerName message
    const whisperMatch = text.match(/^\/w\s+(\S+)\s+(.+)$/i);
    if (whisperMatch) {
      const targetName = whisperMatch[1];
      const whisperText = whisperMatch[2];
      return this._handleWhisper(ws, player, targetName, whisperText);
    }

    console.log(`[Chat] ${player.name}: ${text}`);

    // Broadcast to all connected players (global chat)
    this.broadcastAll({
      type: MSG.CHAT_MESSAGE,
      name: player.name,
      text,
    });
  }

  _handleWhisper(ws, sender, targetName, text) {
    // Find target player by display name (case-insensitive)
    let targetWs = null;
    for (const [otherWs, otherPlayer] of this.players) {
      if (otherPlayer.name.toLowerCase() === targetName.toLowerCase()) {
        targetWs = otherWs;
        break;
      }
    }

    if (!targetWs) {
      this.send(ws, { type: MSG.SYSTEM_MSG, text: `Player "${targetName}" not found.` });
      return;
    }

    console.log(`[Whisper] ${sender.name} → ${targetName}: ${text}`);

    // Send to target
    this.send(targetWs, {
      type: MSG.CHAT_WHISPER,
      from: sender.name,
      text,
    });

    // Confirm to sender
    this.send(ws, {
      type: MSG.CHAT_WHISPER,
      to: targetName,
      text,
    });
  }

  // ─── Broadcast helpers ────────────────────────────────────────────────────

  broadcastAll(msg) {
    const data = JSON.stringify(msg);
    for (const [otherWs] of this.players) {
      if (otherWs.readyState === 1) otherWs.send(data);
    }
  }

  broadcastSystemMsg(text) {
    this.broadcastAll({ type: MSG.SYSTEM_MSG, text });
  }

  broadcastPlayerCount() {
    this.broadcastAll({ type: MSG.PLAYER_COUNT, count: this.players.size });
  }

  // ─── Utilities ──────────────────────────────────────────────────────────────

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

  async _readBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => (data += chunk));
      req.on('end', () => resolve(data));
      req.on('error', reject);
    });
  }
}
