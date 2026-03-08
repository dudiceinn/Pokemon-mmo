/**
 * CatchManager.js (Server)
 *
 * Validates catch attempts and rolls the catch formula.
 * Tracks active battles per player so we know the enemy species.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPlayerState, savePlayerState } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, '../../assets');

const BALL_BONUS = {
  pokeball:    1.0,
  great_ball:  1.5,
  ultra_ball:  2.0,
  master_ball: 255,
};

let pokemonDefs = null;

function loadPokemonDefs() {
  if (pokemonDefs) return pokemonDefs;
  try {
    const raw = fs.readFileSync(path.join(ASSETS_DIR, 'data', 'pokemon.json'), 'utf-8');
    pokemonDefs = JSON.parse(raw);
  } catch (err) {
    console.error('[CatchManager] Failed to load pokemon.json:', err.message);
    pokemonDefs = {};
  }
  return pokemonDefs;
}

export class CatchManager {
  constructor() {
    // playerId (session) → { speciesId, level }
    this._activeBattles = new Map();
  }

  /** Record that a player has started a battle with a wild pokemon. */
  startBattle(sessionId, speciesId, level) {
    this._activeBattles.set(sessionId, { speciesId, level });
  }

  /** Clear battle state (on battle end, disconnect, etc.) */
  endBattle(sessionId) {
    this._activeBattles.delete(sessionId);
  }

  /** Get the active battle for a player. */
  getActiveBattle(sessionId) {
    return this._activeBattles.get(sessionId) || null;
  }

  /**
   * Resolve a catch attempt.
   * @param {string} sessionId - Player session id
   * @param {number} dbId - Player database id
   * @param {string} ballId - Ball item id
   * @param {number} enemyHp - Client-reported current HP
   * @param {number} enemyMaxHp - Client-reported max HP
   * @returns {{ error?: string, caught?: boolean, wobbles?: number, ballId?: string }}
   */
  resolveCatch(sessionId, dbId, ballId, enemyHp, enemyMaxHp) {
    const battle = this._activeBattles.get(sessionId);
    if (!battle) {
      return { error: 'No active battle.' };
    }

    // Validate ball type
    if (!(ballId in BALL_BONUS)) {
      return { error: 'Invalid ball type.' };
    }

    // Validate player has the ball in inventory
    const state = getPlayerState(dbId);
    if (!state) return { error: 'Player state not found.' };

    const bag = JSON.parse(state.bag_json || '{}');
    if (!bag[ballId] || bag[ballId] < 1) {
      return { error: 'You don\'t have that ball.' };
    }

    // Remove ball from inventory (regardless of catch success)
    bag[ballId] -= 1;
    if (bag[ballId] <= 0) delete bag[ballId];

    // Get species catch rate
    const defs = loadPokemonDefs();
    const species = defs[battle.speciesId];
    const catchRate = species?.catchRate ?? 45;

    // Catch formula (same as client BattleState)
    const ballBonus = BALL_BONUS[ballId];
    const hp = Math.max(1, enemyHp);
    const maxHp = Math.max(1, enemyMaxHp);
    const hpFactor = (3 * maxHp - 2 * hp) / (3 * maxHp);
    const catchValue = catchRate * hpFactor * ballBonus;
    const wobbles = Math.min(3, Math.floor(catchValue / 64));
    const caught = ballId === 'master_ball' || Math.random() < catchValue / 255;

    // Build updated state
    const updatedState = {
      map: state.map,
      x: state.x,
      y: state.y,
      dir: state.dir,
      party: JSON.parse(state.party_json || '[]'),
      pc: JSON.parse(state.pc_json || '{"boxNames":[],"boxes":[]}'),
      bag,
      flags: JSON.parse(state.flags_json || '{}'),
      money: state.money || 0,
      badges: JSON.parse(state.badges_json || '[]'),
    };

    if (caught) {
      // Build a minimal serialized pokemon for storage
      const caughtPokemon = this._buildCaughtPokemon(battle.speciesId, battle.level, defs);

      // Try adding to party (max 6)
      let addedToParty = false;
      if (updatedState.party.length < 6) {
        updatedState.party.push(caughtPokemon);
        addedToParty = true;
      } else {
        // Party full — try PC storage
        const pcSpot = this._findPCSlot(updatedState.pc);
        if (pcSpot) {
          if (!updatedState.pc.boxes) updatedState.pc.boxes = [];
          while (updatedState.pc.boxes.length <= pcSpot.box) {
            updatedState.pc.boxes.push(new Array(30).fill(null));
          }
          updatedState.pc.boxes[pcSpot.box][pcSpot.slot] = caughtPokemon;
          addedToParty = false; // went to PC
        }
        // If both full, pokemon is lost (matches client behavior)
      }

      this.endBattle(sessionId);
    }

    // Save updated state (ball removed, pokemon added if caught)
    savePlayerState(dbId, updatedState);

    return { caught, wobbles, ballId };
  }

  /** Build a minimal serialized pokemon matching PokemonInstance.serialize() format. */
  _buildCaughtPokemon(speciesId, level, defs) {
    const species = defs[speciesId];
    if (!species) return { speciesId, level, currentHp: 1, moves: [], movePool: [] };

    const baseStats = species.baseStats || {};
    const maxHp = Math.floor(((baseStats.hp || 45) * 2 * level) / 100) + level + 10;

    // Build move slots from learnset
    const learnset = species.learnset || [];
    const learned = learnset
      .filter(e => e.level <= level)
      .map(e => e.moveId);
    const equipped = [...new Set(learned)].slice(-4);

    // We can't build full move data without moveDefs, so just store moveIds with full PP
    const moves = equipped.map(moveId => ({ moveId, pp: 99 }));
    const movePool = learned.map(moveId => ({ moveId, pp: 99, source: 'level' }));

    const genders = ['male', 'female'];
    const gender = genders[Math.floor(Math.random() * 2)];

    return {
      speciesId,
      level,
      exp: Math.pow(level, 3),
      nickname: null,
      gender,
      ability: species.ability || null,
      currentHp: maxHp,
      status: null,
      sleepTurns: 0,
      moves,
      movePool,
    };
  }

  _findPCSlot(pc) {
    const boxes = pc?.boxes || [];
    for (let b = 0; b < 8; b++) {
      const box = boxes[b] || [];
      for (let s = 0; s < 30; s++) {
        if (!box[s]) return { box: b, slot: s };
      }
    }
    return null;
  }
}
