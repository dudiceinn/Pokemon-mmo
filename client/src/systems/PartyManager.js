/**
 * PartyManager.js
 * src/client/systems/PartyManager.js
 *
 * Manages the player's party of up to 6 PokemonInstance objects.
 * Handles localStorage persistence and fires 'pokemon-party-changed'
 * whenever the party is mutated so any UI (party panel, HP bars, etc.)
 * can re-render reactively.
 *
 * ScriptRunner already looks for this on:
 *   this.scene.partyManager  ← primary
 *   window.partyManager      ← fallback
 *
 * OverworldScene should do:
 *   this.partyManager = new PartyManager(pokemonDefs, moveDefs);
 *   window.partyManager = this.partyManager;  // fallback for ScriptRunner
 */

import { PokemonInstance } from './PokemonInstance.js';

const PARTY_KEY = 'pokemon-mmo-party';
const MAX_PARTY = 6;

export class PartyManager {
  /**
   * @param {Object} pokemonDefs  - Full parsed pokemon.json
   * @param {Object} moveDefs     - Full parsed moves.json
   */
  constructor(pokemonDefs, moveDefs) {
    this._pokemonDefs = pokemonDefs;
    this._moveDefs    = moveDefs;
    this._party       = [];   // Array<PokemonInstance>, max 6

    this._load();
  }

  // ── Read ────────────────────────────────────────────────────────────────

  /**
   * Returns a shallow copy of the party array.
   * @returns {PokemonInstance[]}
   */
  getParty() {
    return [...this._party];
  }

  /** @returns {number} 0–6 */
  get size() { return this._party.length; }

  /** @returns {boolean} */
  get isFull() { return this._party.length >= MAX_PARTY; }

  /** @returns {boolean} */
  get isEmpty() { return this._party.length === 0; }

  /**
   * Get a specific party slot (0-indexed).
   * @param {number} index
   * @returns {PokemonInstance|null}
   */
  getSlot(index) {
    return this._party[index] ?? null;
  }

  /**
   * The first non-fainted pokemon — used by BattleState as the lead.
   * @returns {PokemonInstance|null}
   */
  getLeadPokemon() {
    return this._party.find(p => !p.isFainted) ?? null;
  }

  /** @returns {boolean} true if ALL party members are fainted */
  isBlackedOut() {
    return this._party.length > 0 && this._party.every(p => p.isFainted);
  }

  // ── Write ────────────────────────────────────────────────────────────────

  /**
   * Add a new PokemonInstance to the party (max 6).
   * Called by ScriptRunner's `givepokemon` command.
   *
   * @param {string} speciesId
   * @param {number} level
   * @returns {PokemonInstance|null}  The new instance, or null if party is full.
   */
  addPokemon(speciesId, level = 5) {
    if (this.isFull) return null;
    if (!this._pokemonDefs[speciesId]) {
      console.warn(`[PartyManager] addPokemon: unknown speciesId "${speciesId}"`);
      return null;
    }
    const pokemon = new PokemonInstance(speciesId, level, this._pokemonDefs, this._moveDefs);
    this._party.push(pokemon);
    this._save();
    this._notify();
    return pokemon;
  }

  /**
   * Add an already-constructed PokemonInstance directly (e.g. after catch).
   * @param {PokemonInstance} instance
   * @returns {boolean} false if party is full
   */
  addInstance(instance) {
    if (this.isFull) return false;
    this._party.push(instance);
    this._save();
    this._notify();
    return true;
  }

  /**
   * Remove a pokemon by slot index.
   * @param {number} index
   * @returns {PokemonInstance|null} The removed pokemon, or null if index invalid.
   */
  removeSlot(index) {
    if (index < 0 || index >= this._party.length) return null;
    const [removed] = this._party.splice(index, 1);
    this._save();
    this._notify();
    return removed;
  }

  /**
   * Swap two party slots (e.g. for party reordering UI).
   * @param {number} a
   * @param {number} b
   */
  swapSlots(a, b) {
    if (a < 0 || b < 0 || a >= this._party.length || b >= this._party.length) return;
    [this._party[a], this._party[b]] = [this._party[b], this._party[a]];
    this._save();
    this._notify();
  }

  /**
   * Mutate a party member in-place and persist.
   * Called by ScriptRunner's `healparty` (and anything else that changes state
   * on a PokemonInstance but needs the change persisted + UI notified).
   *
   * In most cases you should mutate the PokemonInstance directly, then call
   * partyManager.save() explicitly — but this helper covers the ScriptRunner
   * pattern of passing a plain patch object.
   *
   * @param {PokemonInstance} pokemon   - Reference to the instance in the party
   * @param {Object}          patch     - Plain object of properties to apply
   *   Supported: { currentHp, status, level }
   */
  updatePokemon(pokemon, patch) {
    const inst = typeof pokemon === 'number'
      ? this._party[pokemon]   // accept slot index too
      : pokemon;

    if (!inst) return;

    if (patch.currentHp !== undefined) {
      // Apply via heal/takeDamage to keep value clamped
      const delta = patch.currentHp - inst.hp;
      if (delta > 0) inst.heal(delta);
      else if (delta < 0) inst.takeDamage(-delta);
    }
    if (patch.status !== undefined) inst.setStatus(patch.status);
    if (patch.level  !== undefined) inst.levelUp(patch.level);

    this._save();
    this._notify();
  }

  /**
   * Heal every party member to full HP and clear all status conditions.
   * Used by ScriptRunner's `healparty` and Pokemon Center NPCs.
   */
  healAll() {
    for (const p of this._party) {
      p.fullHeal();
      p.clearStatus();
      p.restorePP();
    }
    this._save();
    this._notify();
  }

  /**
   * Persist the current party state manually.
   * Call this after direct mutations on PokemonInstance objects
   * (e.g. after battle damage, level-up, evolution).
   * @param {boolean} [silent=false]  If true, suppresses the UI event.
   */
  save(silent = false) {
    this._save();
    if (!silent) this._notify();
  }

  // ── Starters ─────────────────────────────────────────────────────────────

  /**
   * Returns true if the player has not yet received a starter.
   * Checked by OverworldScene / Oak NPC before running the starter script.
   * @returns {boolean}
   */
  hasStarter() {
    return this._party.length > 0;
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  _save() {
    try {
      const data = this._party.map(p => p.serialize());
      localStorage.setItem(PARTY_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('[PartyManager] Failed to save party:', err);
    }
  }

  _load() {
    try {
      const raw = localStorage.getItem(PARTY_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return;

      this._party = data
        .map(obj => {
          try {
            return PokemonInstance.deserialize(obj, this._pokemonDefs, this._moveDefs);
          } catch (err) {
            console.warn('[PartyManager] Skipping corrupt party entry:', err);
            return null;
          }
        })
        .filter(Boolean)
        .slice(0, MAX_PARTY);

      console.log(`[PartyManager] Loaded ${this._party.length} party member(s) from localStorage.`);
    } catch (err) {
      console.error('[PartyManager] Failed to load party — starting fresh:', err);
      this._party = [];
    }
  }

  /**
   * Wipe saved party data (use with caution — mainly for dev/testing).
   */
  clearSave() {
    localStorage.removeItem(PARTY_KEY);
    this._party = [];
    this._notify();
  }

  // ── Event ─────────────────────────────────────────────────────────────────

  _notify() {
    window.dispatchEvent(new CustomEvent('pokemon-party-changed', {
      detail: { party: this.getParty() }
    }));
  }
}
