/**
 * PokemonInstance.js
 * src/client/systems/PokemonInstance.js
 *
 * Runtime pokemon object built from speciesId + level.
 * Handles stat calculation, move assignment, status, and localStorage persistence.
 *
 * Usage:
 *   const p = new PokemonInstance('bulbasaur', 5, pokemonDefs, moveDefs);
 *   const p2 = PokemonInstance.deserialize(saved, pokemonDefs, moveDefs);
 */

export class PokemonInstance {
  /**
   * @param {string} speciesId   - Key into pokemonDefs (e.g. 'bulbasaur')
   * @param {number} level       - 1–100
   * @param {Object} pokemonDefs - Full parsed pokemon.json
   * @param {Object} moveDefs    - Full parsed moves.json
   * @param {string} [gender]    - 'male' | 'female' | 'none' — randomised if omitted
   */
  constructor(speciesId, level, pokemonDefs, moveDefs, gender = null) {
    const species = pokemonDefs[speciesId];
    if (!species) throw new Error(`PokemonInstance: unknown speciesId "${speciesId}"`);

    this._speciesId  = speciesId;
    this._level      = level;
    this._pokemonDefs = pokemonDefs;
    this._moveDefs   = moveDefs;
    this._species    = species;

    // ── Stats ──────────────────────────────────────────────────────────────
    this._maxHp  = PokemonInstance._calcMaxHp(species.baseStats.hp,  level);
    this._currentHp = this._maxHp;

    this._stats = {
      atk:   PokemonInstance._calcStat(species.baseStats.atk,   level),
      def:   PokemonInstance._calcStat(species.baseStats.def,   level),
      spatk: PokemonInstance._calcStat(species.baseStats.spatk, level),
      spdef: PokemonInstance._calcStat(species.baseStats.spdef, level),
      spd:   PokemonInstance._calcStat(species.baseStats.spd,   level),
    };

    // ── Moves (last 4 learned at or below current level) ──────────────────
    this._moves = PokemonInstance._buildMoveSlots(species.learnset, level, moveDefs);

    // ── Status ─────────────────────────────────────────────────────────────
    // null | 'burn' | 'poison' | 'paralysis' | 'sleep' | 'freeze'
    this._status = null;

    // ── Volatile / in-battle only ──────────────────────────────────────────
    // Stat stage modifiers (-6 to +6). Reset between battles.
    this._stages = { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0, accuracy: 0, evasion: 0 };

    // Sleep turn counter
    this._sleepTurns = 0;

    // ── Misc ───────────────────────────────────────────────────────────────
    this._gender  = gender ?? PokemonInstance._randomGender();
    this._nickname = null;
    this._ability  = species.ability ?? null;
  }

  // ── Identity ──────────────────────────────────────────────────────────────

  get speciesId()  { return this._speciesId; }
  get name() {
    const n = this._nickname ?? this._species?.name;
    // Fall back to capitalized speciesId if name is missing/empty in pokemonDefs data
    return (n && n.trim()) ? n : (this._speciesId.charAt(0).toUpperCase() + this._speciesId.slice(1));
  }
  get speciesName(){ return this._species.name; }
  get level()      { return this._level; }
  get gender()     { return this._gender; }
  get types()      { return this._species.type; }
  get sprite()     { return this._species.sprite ?? null; }
  get cry()        { return this._species.cry ?? null; }
  get ability()    { return this._ability; }

  get evolvesTo()      { return this._species.evolvesTo ?? null; }
  get evolvesAtLevel() { return this._species.evolvesAtLevel ?? null; }

  setNickname(name) { this._nickname = name || null; }

  // ── HP ────────────────────────────────────────────────────────────────────

  get maxHp()     { return this._maxHp; }
  get hp()        { return this._currentHp; }
  get isFainted() { return this._currentHp <= 0; }

  /**
   * Apply damage (positive number reduces HP).
   * @param {number} amount
   * @returns {number} actual damage dealt
   */
  takeDamage(amount) {
    const dmg = Math.min(Math.max(0, Math.floor(amount)), this._currentHp);
    this._currentHp -= dmg;
    return dmg;
  }

  /**
   * Restore HP (positive number increases HP).
   * @param {number} amount  — pass Infinity or omit cap to fully heal
   * @returns {number} actual HP restored
   */
  heal(amount) {
    const before = this._currentHp;
    this._currentHp = Math.min(this._maxHp, this._currentHp + Math.max(0, Math.floor(amount)));
    return this._currentHp - before;
  }

  /** Fully restore HP (e.g. after battle or revive). */
  fullHeal() { this._currentHp = this._maxHp; }

  // ── Status ────────────────────────────────────────────────────────────────

  get status() { return this._status; }

  /**
   * @param {string|null} status  'burn'|'poison'|'paralysis'|'sleep'|'freeze'|null
   * @param {number} [sleepTurns] — randomised 1-3 if not provided
   */
  setStatus(status, sleepTurns = null) {
    this._status = status;
    this._sleepTurns = status === 'sleep'
      ? (sleepTurns ?? (1 + Math.floor(Math.random() * 3)))
      : 0;
  }

  clearStatus() { this.setStatus(null); }

  get sleepTurns()   { return this._sleepTurns; }
  tickSleep()        { this._sleepTurns = Math.max(0, this._sleepTurns - 1); }

  // ── Stats & Stages ────────────────────────────────────────────────────────

  get stats() { return { ...this._stats }; }

  get stages() { return { ...this._stages }; }

  /**
   * Modify a stat stage, clamped to [-6, +6].
   * @param {'atk'|'def'|'spatk'|'spdef'|'spd'|'accuracy'|'evasion'} stat
   * @param {number} delta  e.g. +1, -2
   * @returns {number} actual change applied (may be 0 if already at cap)
   */
  modifyStage(stat, delta) {
    const before = this._stages[stat];
    this._stages[stat] = Math.max(-6, Math.min(6, before + delta));
    return this._stages[stat] - before;
  }

  resetStages() {
    this._stages = { atk: 0, def: 0, spatk: 0, spdef: 0, spd: 0, accuracy: 0, evasion: 0 };
  }

  /**
   * Get the effective (stage-modified) value of a battle stat.
   * @param {'atk'|'def'|'spatk'|'spdef'|'spd'} stat
   * @returns {number}
   */
  effectiveStat(stat) {
    const base  = this._stats[stat];
    const stage = this._stages[stat] ?? 0;
    const mult  = PokemonInstance._stageMult(stage);
    // Burn halves physical attack
    const burnPenalty = (this._status === 'burn' && stat === 'atk') ? 0.5 : 1;
    // Paralysis halves speed
    const paralysisPenalty = (this._status === 'paralysis' && stat === 'spd') ? 0.5 : 1;
    return Math.max(1, Math.floor(base * mult * burnPenalty * paralysisPenalty));
  }

  // ── Moves ─────────────────────────────────────────────────────────────────

  /** @returns {Array<{moveId, name, type, power, accuracy, pp, maxPp, category, effect}>} */
  get moves() { return this._moves.map(m => ({ ...m })); }

  /**
   * Deduct 1 PP from a move slot.
   * @param {number} slotIndex  0–3
   * @returns {boolean} false if move has no PP left
   */
  useMove(slotIndex) {
    const move = this._moves[slotIndex];
    if (!move || move.pp <= 0) return false;
    move.pp -= 1;
    return true;
  }

  /** Restore all PP on all moves (e.g. after battle). */
  restorePP() {
    this._moves.forEach(m => { m.pp = m.maxPp; });
  }

  // ── Level & Evolution ─────────────────────────────────────────────────────

  /**
   * Level up to a new level, recalculating stats.
   * HP is scaled proportionally so the pokemon doesn't suddenly have "full HP"
   * just from levelling — consistent with main-series behaviour.
   * @param {number} newLevel
   */
  levelUp(newLevel) {
    if (newLevel <= this._level) return;
    const hpRatio = this._currentHp / this._maxHp;
    this._level  = newLevel;

    const bs = this._species.baseStats;
    this._maxHp  = PokemonInstance._calcMaxHp(bs.hp,    newLevel);
    this._stats  = {
      atk:   PokemonInstance._calcStat(bs.atk,   newLevel),
      def:   PokemonInstance._calcStat(bs.def,   newLevel),
      spatk: PokemonInstance._calcStat(bs.spatk, newLevel),
      spdef: PokemonInstance._calcStat(bs.spdef, newLevel),
      spd:   PokemonInstance._calcStat(bs.spd,   newLevel),
    };
    this._currentHp = Math.max(1, Math.round(this._maxHp * hpRatio));

    // Learn any newly available moves
    const newMoves = PokemonInstance._buildMoveSlots(
      this._species.learnset, newLevel, this._moveDefs
    );
    // Add moves unlocked at exactly this level that aren't already known
    const knownIds = new Set(this._moves.map(m => m.moveId));
    for (const entry of this._species.learnset) {
      if (entry.level === newLevel && !knownIds.has(entry.move)) {
        if (this._moves.length < 4) {
          const def = this._moveDefs[entry.move];
          if (def) this._moves.push(PokemonInstance._moveSlot(entry.move, def));
        }
        // If party already has 4 moves, caller (BattleState / UI) handles
        // move-forget flow — we just surface the new move via newMovesAtLevel()
      }
    }
  }

  /**
   * Returns move defs unlocked at exactly this level (for "want to learn?" prompt).
   * @param {number} level
   * @returns {Array<{moveId, name, type, pp, maxPp, category, effect}>}
   */
  newMovesAtLevel(level) {
    return this._species.learnset
      .filter(e => e.level === level)
      .map(e => {
        const def = this._moveDefs[e.move];
        return def ? PokemonInstance._moveSlot(e.move, def) : null;
      })
      .filter(Boolean);
  }

  /**
   * Replace a move slot (used by move-forget flow).
   * @param {number} slotIndex  0–3
   * @param {string} moveId
   */
  replaceMoveSlot(slotIndex, moveId) {
    const def = this._moveDefs[moveId];
    if (!def) throw new Error(`PokemonInstance: unknown moveId "${moveId}"`);
    this._moves[slotIndex] = PokemonInstance._moveSlot(moveId, def);
  }

  /** @returns {boolean} true if species should evolve at current level */
  get shouldEvolve() {
    return this._species.evolvesTo != null
      && this._level >= (this._species.evolvesAtLevel ?? Infinity);
  }

  /**
   * Evolve into the next species in-place, recalculating stats.
   * Returns the new speciesId, or null if evolution is not available.
   * @returns {string|null}
   */
  evolve() {
    if (!this.shouldEvolve) return null;
    const newId = this._species.evolvesTo;
    const newSpecies = this._pokemonDefs[newId];
    if (!newSpecies) return null;

    const hpRatio = this._currentHp / this._maxHp;
    this._speciesId = newId;
    this._species   = newSpecies;
    this._nickname  = null; // nickname carries over only if set; species name resets

    const bs = newSpecies.baseStats;
    this._maxHp = PokemonInstance._calcMaxHp(bs.hp, this._level);
    this._stats = {
      atk:   PokemonInstance._calcStat(bs.atk,   this._level),
      def:   PokemonInstance._calcStat(bs.def,   this._level),
      spatk: PokemonInstance._calcStat(bs.spatk, this._level),
      spdef: PokemonInstance._calcStat(bs.spdef, this._level),
      spd:   PokemonInstance._calcStat(bs.spd,   this._level),
    };
    this._currentHp = Math.max(1, Math.round(this._maxHp * hpRatio));

    return newId;
  }

  // ── Serialisation ─────────────────────────────────────────────────────────

  /**
   * Serialise to a plain object safe for JSON.stringify / localStorage.
   * Does NOT include pokemonDefs / moveDefs references.
   * @returns {Object}
   */
  serialize() {
    return {
      speciesId:  this._speciesId,
      level:      this._level,
      nickname:   this._nickname,
      gender:     this._gender,
      ability:    this._ability,
      currentHp:  this._currentHp,
      status:     this._status,
      sleepTurns: this._sleepTurns,
      moves: this._moves.map(m => ({
        moveId: m.moveId,
        pp:     m.pp,
      })),
    };
  }

  /**
   * Restore a PokemonInstance from a serialised object.
   * @param {Object} obj          - Output of serialize()
   * @param {Object} pokemonDefs  - Full parsed pokemon.json
   * @param {Object} moveDefs     - Full parsed moves.json
   * @returns {PokemonInstance}
   */
  static deserialize(obj, pokemonDefs, moveDefs) {
    const inst = new PokemonInstance(obj.speciesId, obj.level, pokemonDefs, moveDefs, obj.gender);
    inst._nickname   = obj.nickname   ?? null;
    inst._ability    = obj.ability    ?? inst._ability;
    inst._currentHp  = Math.min(inst._maxHp, obj.currentHp ?? inst._maxHp);
    inst._status     = obj.status     ?? null;
    inst._sleepTurns = obj.sleepTurns ?? 0;

    // Restore saved move PP (move defs come from moveDefs for accuracy)
    if (Array.isArray(obj.moves) && obj.moves.length > 0) {
      inst._moves = obj.moves.map(saved => {
        const def = moveDefs[saved.moveId];
        if (!def) return null;
        const slot = PokemonInstance._moveSlot(saved.moveId, def);
        slot.pp = Math.min(saved.pp, slot.maxPp); // guard against stale data
        return slot;
      }).filter(Boolean);
    }

    return inst;
  }

  // ── Static helpers ────────────────────────────────────────────────────────

  /** Gen 1/2 HP formula: floor((2 * base * level) / 100) + level + 10 */
  static _calcMaxHp(base, level) {
    return Math.floor((2 * base * level) / 100) + level + 10;
  }

  /** Gen 1/2 stat formula: floor((2 * base * level) / 100) + 5 */
  static _calcStat(base, level) {
    return Math.floor((2 * base * level) / 100) + 5;
  }

  /**
   * Stage multiplier table per main-series rules:
   * stage: -6  -5  -4  -3  -2  -1   0    +1   +2   +3   +4   +5   +6
   * mult:  2/8 2/7 2/6 2/5 2/4 2/3 2/2  3/2  4/2  5/2  6/2  7/2  8/2
   */
  static _stageMult(stage) {
    if (stage >= 0) return (2 + stage) / 2;
    return 2 / (2 - stage);
  }

  /**
   * Build the 4 move slots from a learnset at a given level.
   * Takes the last 4 moves learned at or below level (mimics main-series).
   */
  static _buildMoveSlots(learnset, level, moveDefs) {
    const eligible = learnset
      .filter(e => e.level <= level)
      .slice(-4); // last 4 = most recently learned

    return eligible.map(e => {
      const def = moveDefs[e.move];
      if (!def) return null;
      return PokemonInstance._moveSlot(e.move, def);
    }).filter(Boolean);
  }

  /** Build a single move slot object with full PP. */
  static _moveSlot(moveId, def) {
    return {
      moveId,
      name:     def.name,
      type:     def.type,
      power:    def.power,
      accuracy: def.accuracy,
      pp:       def.pp,
      maxPp:    def.pp,
      category: def.category,
      effect:   def.effect ?? null,
    };
  }

  static _randomGender() {
    return Math.random() < 0.5 ? 'male' : 'female';
  }
}
