/**
 * EncounterManager.js (Server)
 *
 * Loads spawn data per map, rolls encounter rate, picks species + level.
 * The client only renders — all randomness lives here.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, '../../assets');

export class EncounterManager {
  constructor() {
    // map key → { "x,y": spawnEntry }
    this._cache = new Map();
  }

  /**
   * Check if stepping on (map, x, y) triggers an encounter.
   * @returns {{ speciesId: string, level: number } | null}
   */
  checkStep(map, x, y) {
    const spawns = this._getSpawns(map);
    if (!spawns) return null;

    const entry = spawns[`${x},${y}`];
    if (!entry) return null;

    // Roll encounter rate
    if (Math.random() > entry.encounterRate) return null;

    // Pick species from weighted table
    const picked = this._pickPokemon(entry.pokemon);
    if (!picked) return null;

    const level = this._randomInt(picked.minLevel, picked.maxLevel);
    return { speciesId: picked.speciesId, level };
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  _getSpawns(mapKey) {
    if (this._cache.has(mapKey)) return this._cache.get(mapKey);

    // Try loading from assets/spawns/<mapKey>.json
    const spawnPath = path.join(ASSETS_DIR, 'spawns', `${mapKey}.json`);
    let list = [];

    try {
      if (fs.existsSync(spawnPath)) {
        list = JSON.parse(fs.readFileSync(spawnPath, 'utf-8'));
      }
    } catch (err) {
      console.warn(`[EncounterManager] Failed to load spawns for ${mapKey}:`, err.message);
    }

    if (!list.length) {
      this._cache.set(mapKey, null);
      return null;
    }

    // Index by "x,y"
    const map = {};
    for (const e of list) {
      map[`${e.x},${e.y}`] = e;
    }
    this._cache.set(mapKey, map);
    return map;
  }

  _pickPokemon(table) {
    if (!table?.length) return null;
    const total = table.reduce((s, p) => s + (p.weight || 1), 0);
    let roll = Math.random() * total;
    for (const e of table) {
      roll -= (e.weight || 1);
      if (roll <= 0) return e;
    }
    return table[table.length - 1];
  }

  _randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
