/**
 * StorageManager.js
 *
 * PC Box storage system. Holds Pokemon beyond the party of 6.
 * Persists to localStorage. Access via NPC (`openpc` script command)
 * or item (future).
 *
 * Each box holds up to 30 Pokemon. Default 8 boxes = 240 total.
 */

import { PokemonInstance } from './PokemonInstance.js';

const STORAGE_KEY = 'pokemon-mmo-storage';
const NUM_BOXES   = 8;
const BOX_SIZE    = 30;

export class StorageManager {
  constructor(pokemonDefs, moveDefs) {
    this._pokemonDefs = pokemonDefs;
    this._moveDefs    = moveDefs;

    // boxes[i] = Array of length BOX_SIZE, each slot null or PokemonInstance
    this._boxes = [];
    this._boxNames = [];
    for (let i = 0; i < NUM_BOXES; i++) {
      this._boxes.push(new Array(BOX_SIZE).fill(null));
      this._boxNames.push(`Box ${i + 1}`);
    }

    this._load();
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  get numBoxes()  { return NUM_BOXES; }
  get boxSize()   { return BOX_SIZE; }

  getBoxName(boxIndex) { return this._boxNames[boxIndex] ?? `Box ${boxIndex + 1}`; }
  setBoxName(boxIndex, name) {
    if (boxIndex >= 0 && boxIndex < NUM_BOXES) {
      this._boxNames[boxIndex] = name || `Box ${boxIndex + 1}`;
      this._save();
    }
  }

  /** Get a Pokemon from a box slot. */
  getSlot(boxIndex, slotIndex) {
    return this._boxes[boxIndex]?.[slotIndex] ?? null;
  }

  /** Get all Pokemon in a box (array of length BOX_SIZE, nulls for empty). */
  getBox(boxIndex) {
    return this._boxes[boxIndex] ? [...this._boxes[boxIndex]] : [];
  }

  /** Total Pokemon stored across all boxes. */
  get totalStored() {
    let count = 0;
    for (const box of this._boxes) {
      for (const slot of box) if (slot) count++;
    }
    return count;
  }

  /** Find first empty slot across all boxes. Returns { box, slot } or null. */
  findFirstEmpty() {
    for (let b = 0; b < NUM_BOXES; b++) {
      for (let s = 0; s < BOX_SIZE; s++) {
        if (!this._boxes[b][s]) return { box: b, slot: s };
      }
    }
    return null;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Deposit a PokemonInstance into a specific box slot.
   * @returns {boolean} success
   */
  deposit(pokemon, boxIndex, slotIndex) {
    if (!pokemon) return false;
    if (boxIndex < 0 || boxIndex >= NUM_BOXES) return false;
    if (slotIndex < 0 || slotIndex >= BOX_SIZE) return false;
    if (this._boxes[boxIndex][slotIndex]) return false; // slot occupied
    this._boxes[boxIndex][slotIndex] = pokemon;
    this._save();
    return true;
  }

  /**
   * Deposit to the first available slot in any box.
   * @returns {{ box: number, slot: number }|null} where it was placed, or null if full
   */
  depositAuto(pokemon) {
    const spot = this.findFirstEmpty();
    if (!spot) return null;
    this._boxes[spot.box][spot.slot] = pokemon;
    this._save();
    return spot;
  }

  /**
   * Withdraw a Pokemon from a box slot (removes it from storage).
   * @returns {PokemonInstance|null}
   */
  withdraw(boxIndex, slotIndex) {
    const pokemon = this._boxes[boxIndex]?.[slotIndex];
    if (!pokemon) return null;
    this._boxes[boxIndex][slotIndex] = null;
    this._save();
    return pokemon;
  }

  /**
   * Move a Pokemon between two storage slots.
   * If destination is occupied, swaps them.
   */
  moveSlot(fromBox, fromSlot, toBox, toSlot) {
    if (fromBox < 0 || fromBox >= NUM_BOXES || toBox < 0 || toBox >= NUM_BOXES) return;
    if (fromSlot < 0 || fromSlot >= BOX_SIZE || toSlot < 0 || toSlot >= BOX_SIZE) return;
    const a = this._boxes[fromBox][fromSlot];
    const b = this._boxes[toBox][toSlot];
    this._boxes[toBox][toSlot] = a;
    this._boxes[fromBox][fromSlot] = b;
    this._save();
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  _save() {
    try {
      const data = {
        boxNames: this._boxNames,
        boxes: this._boxes.map(box =>
          box.map(p => p ? p.serialize() : null)
        ),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      console.error('[StorageManager] Failed to save:', err);
    }
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);

      if (Array.isArray(data.boxNames)) {
        for (let i = 0; i < NUM_BOXES && i < data.boxNames.length; i++) {
          this._boxNames[i] = data.boxNames[i] || `Box ${i + 1}`;
        }
      }

      if (Array.isArray(data.boxes)) {
        for (let b = 0; b < NUM_BOXES && b < data.boxes.length; b++) {
          const boxData = data.boxes[b];
          if (!Array.isArray(boxData)) continue;
          for (let s = 0; s < BOX_SIZE && s < boxData.length; s++) {
            if (!boxData[s]) continue;
            try {
              this._boxes[b][s] = PokemonInstance.deserialize(
                boxData[s], this._pokemonDefs, this._moveDefs
              );
            } catch (err) {
              console.warn(`[StorageManager] Skipping corrupt entry box ${b} slot ${s}:`, err);
            }
          }
        }
      }

      console.log(`[StorageManager] Loaded ${this.totalStored} stored Pokemon.`);
    } catch (err) {
      console.error('[StorageManager] Failed to load — starting fresh:', err);
    }
  }

  clearSave() {
    localStorage.removeItem(STORAGE_KEY);
    for (let i = 0; i < NUM_BOXES; i++) {
      this._boxes[i] = new Array(BOX_SIZE).fill(null);
      this._boxNames[i] = `Box ${i + 1}`;
    }
  }
}
