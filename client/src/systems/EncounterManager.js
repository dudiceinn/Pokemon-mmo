import { MSG } from '@pokemon-mmo/shared';
import { WildPokemon } from '../entities/WildPokemon.js';
import { BattleState, PHASE } from './BattleState.js';

const RESPAWN_COOLDOWN = 8000; // ms before a tile can spawn again after encounter
const MAX_WILD = 3;            // max pokemon visible at once on a map

/**
 * EncounterManager
 *
 * Flow (server-authoritative):
 *   1. Player lands on a grass tile  →  checkStep(x, y)
 *   2. Sends ENCOUNTER_CHECK to server
 *   3. Server rolls encounterRate, picks species + level → sends ENCOUNTER_RESULT
 *   4. Client spawns a WildPokemon sprite on a nearby grass tile
 *   5. Pokemon roams within grass tiles each frame via update(delta)
 *   6. If player lands on same tile as a pokemon → flash + battle, despawn
 */
export class EncounterManager {
  constructor(scene) {
    this.scene      = scene;
    this._spawnMap  = {};        // "x,y" → spawn entry (for grass tile lookup + patch flood-fill)
    this._allTiles  = [];        // [{x,y}] every grass tile on this map
    this._tileSet   = new Set(); // fast lookup set of "x,y" strings
    this._wild      = [];        // active WildPokemon[]
    this._cooldowns = {};        // "x,y" → Date.now() expiry

    // Listen for server encounter results
    this._setupNetworkHandlers();
  }

  _setupNetworkHandlers() {
    const client = this.scene.client;
    if (!client) return;

    client.on(MSG.ENCOUNTER_RESULT, (msg) => {
      if (!msg.spawn) return;
      this._spawnFromServer(msg.spawn.speciesId, msg.spawn.level);
    });
  }

  /** Called after scene.client is available (re-binds handler). */
  bindClient(client) {
    client.on(MSG.ENCOUNTER_RESULT, (msg) => {
      if (!msg.spawn) return;
      this._spawnFromServer(msg.spawn.speciesId, msg.spawn.level);
    });
  }

  // ── Load spawns for a new map ─────────────────────────────────────────────

  async loadSpawns(mapKey, rawMapJSON) {
    this.clearWild();
    this._spawnMap  = {};
    this._allTiles  = [];
    this._tileSet   = new Set();
    this._cooldowns = {};

    let list = [];
    try {
      const r = await fetch(`/spawns/${mapKey}.json`);
      if (r.ok) list = await r.json();
    } catch (_) {}

    if (!list.length && rawMapJSON?._spawns?.length) list = rawMapJSON._spawns;

    if (!list.length) {
      console.log(`[EncounterManager] No spawn tiles for ${mapKey}`);
      return;
    }

    for (const e of list) {
      this._spawnMap[`${e.x},${e.y}`] = e;
      this._allTiles.push({ x: e.x, y: e.y });
      this._tileSet.add(`${e.x},${e.y}`);
    }
    console.log(`[EncounterManager] ${list.length} spawn tile(s) loaded for ${mapKey}`);
  }

  // ── Called from OverworldScene after every player step ───────────────────

  checkStep(tileX, tileY) {
    const entry = this._spawnMap[`${tileX},${tileY}`];

    // Player left the grass — despawn all wild pokemon
    if (!entry) {
      if (this._wild.length) this.clearWild();
      return;
    }

    // Cooldown check
    if ((this._cooldowns[`${tileX},${tileY}`] || 0) > Date.now()) return;

    // Cap active pokemon
    if (this._wild.length >= MAX_WILD) return;

    // Ask server to roll the encounter
    const client = this.scene.client;
    if (client?.connected) {
      client.send({
        type: MSG.ENCOUNTER_CHECK,
        map: this.scene.currentMapKey,
        x: tileX,
        y: tileY,
      });
    }
  }

  // ── Server told us to spawn a pokemon ─────────────────────────────────────

  _spawnFromServer(speciesId, level) {
    if (this._wild.length >= MAX_WILD) return;

    const px = this.scene.player?.tileX;
    const py = this.scene.player?.tileY;
    if (px === undefined) return;

    const tile = this._pickSpawnTile(px, py);
    if (!tile) return;

    const patch = this._getPatch(px, py);
    const patchSet = new Set(patch.map(t => `${t.x},${t.y}`));

    const wp = new WildPokemon(
      this.scene,
      speciesId,
      level,
      tile.x,
      tile.y,
      patchSet
    );
    wp._collisionCheck = (x, y, self) => this._isBlocked(x, y, self);
    this._wild.push(wp);

    console.log(`[EncounterManager] Spawned ${speciesId} Lv.${level} at (${tile.x},${tile.y})`);
  }

  // ── Per-frame: tick roam + contact check ─────────────────────────────────

  update(delta) {
    if (!this._wild.length) return;

    for (const wp of this._wild) wp.update(delta);

    if (this.scene.cutsceneActive) return;

    const px = this.scene.player?.tileX;
    const py = this.scene.player?.tileY;
    if (px === undefined) return;

    const idx = this._wild.findIndex(wp => wp.tileX === px && wp.tileY === py);
    if (idx >= 0) {
      const wp = this._wild.splice(idx, 1)[0];
      this._cooldowns[`${wp.tileX},${wp.tileY}`] = Date.now() + RESPAWN_COOLDOWN;
      this._triggerEncounter(wp);
    }
  }

  // ── Clear on map change ───────────────────────────────────────────────────

  clearWild() {
    for (const wp of this._wild) wp.destroy();
    this._wild      = [];
    this._cooldowns = {};
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  _getPatch(startX, startY) {
    const patch = [];
    const visited = new Set();
    const queue = [{ x: startX, y: startY }];
    while (queue.length) {
      const { x, y } = queue.shift();
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (!this._tileSet.has(key)) continue;
      patch.push({ x, y });
      queue.push({ x: x+1, y }, { x: x-1, y }, { x, y: y+1 }, { x, y: y-1 });
    }
    return patch;
  }

  _pickSpawnTile(px, py) {
    const occupied = new Set([
      `${px},${py}`,
      ...this._wild.map(wp => `${wp.tileX},${wp.tileY}`),
    ]);

    const patch = this._getPatch(px, py);
    const free = patch.filter(t => !occupied.has(`${t.x},${t.y}`));
    return free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  _isBlocked(x, y, self) {
    const s = this.scene;
    if (x < 0 || y < 0 || x >= s.map?.width || y >= s.map?.height) return true;
    if (s.collisionLayer?.data[y]?.[x]?.index > 0) return true;
    if (s.player?.tileX === x && s.player?.tileY === y) return true;
    for (const wp of this._wild) {
      if (wp !== self && wp.tileX === x && wp.tileY === y) return true;
    }
    return false;
  }

  _triggerEncounter(wildPokemon) {
    const scene = this.scene;
    const pm    = scene.partyManager ?? window.partyManager;
    const lead  = pm?.getLeadPokemon();

    wildPokemon.destroy();
    scene.cutsceneActive = true;

    if (!lead) {
      const defs = scene.cache?.json.get('pokemonDefs');
      const raw  = wildPokemon.speciesId;
      const name = defs?.[raw]?.name ?? (raw.charAt(0).toUpperCase() + raw.slice(1));
      this._flash(() => {
        scene.dialogBox.open('', [
          `A wild ${name} (Lv.${wildPokemon.level}) appeared!`,
          `You have no Pokémon! Get one from Professor Oak first.`,
        ], () => { scene.cutsceneActive = false; });
      });
      return;
    }

    // Notify server that battle is starting (for catch tracking)
    if (scene.client?.connected) {
      scene.client.send({
        type: MSG.BATTLE_START,
        speciesId: wildPokemon.speciesId,
        level: wildPokemon.level,
      });
    }

    this._flash(() => {
      const pokemonDefs      = scene.cache.json.get('pokemonDefs');
      const moveDefs         = scene.cache.json.get('moveDefs');
      const inventoryManager = scene.inventoryManager ?? window.inventoryManager ?? null;

      const battleState = new BattleState({
        playerPokemon: lead,
        wildData:      { speciesId: wildPokemon.speciesId, level: wildPokemon.level },
        pokemonDefs,
        moveDefs,
        partyManager:      pm,
        inventoryManager,
        networkClient:     scene.client,  // Pass client for server-authoritative catch
      });

      scene.battleState = battleState;
      scene.battleWildData = { speciesId: wildPokemon.speciesId, level: wildPokemon.level };

      scene.stopOverworldBgm?.();
      scene.scene.launch('BattleScene', { battleState });
      scene.scene.pause('OverworldScene');
    });
  }

  _flash(onDone) {
    if (!document.getElementById('encounter-flash-style')) {
      const s = document.createElement('style');
      s.id = 'encounter-flash-style';
      s.textContent = `@keyframes encounter-flash {
        0%,40%,80%,100% { opacity:0; } 20%,60% { opacity:1; }
      }`;
      document.head.appendChild(s);
    }
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:100001;' +
      'pointer-events:none;animation:encounter-flash 0.5s ease forwards;';
    document.body.appendChild(el);
    setTimeout(() => { el.remove(); onDone?.(); }, 500);
  }
}
