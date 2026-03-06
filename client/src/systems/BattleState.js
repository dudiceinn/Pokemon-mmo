/**
 * BattleState.js
 * src/client/systems/BattleState.js
 *
 * Phase 1 — all battle logic runs locally in the browser.
 * Phase 2 — swap submitAction() to send WebSocket message; onResult() callback
 *           stays identical so BattleScene never changes.
 *
 * Public interface (consumed by BattleScene):
 *   battleState.submitAction({ type, slot, itemId })
 *   battleState.onResult(callback)   // callback receives a BattleResult object
 *   battleState.playerPokemon        // PokemonInstance
 *   battleState.enemyPokemon         // PokemonInstance
 *   battleState.phase                // see PHASE constants below
 */

import { PokemonInstance } from './PokemonInstance.js';

// ── Phase constants ───────────────────────────────────────────────────────
export const PHASE = {
  INTRO:        'intro',
  PLAYER_TURN:  'player_turn',
  ENEMY_TURN:   'enemy_turn',
  RESOLVE:      'resolve',
  VICTORY:      'victory',
  FAINTED:      'fainted',
  CAUGHT:       'caught',
  FLED:         'fled',
  BLACKED_OUT:  'blacked_out',
  BATTLE_END:   'battle_end',
};

// ── Type effectiveness chart ──────────────────────────────────────────────
// TYPE_CHART[attackType][defenderType] → multiplier (0 | 0.5 | 1 | 2)
const TYPE_CHART = {
  normal:   { rock:0.5, ghost:0, steel:0.5 },
  fire:     { fire:0.5, water:0.5, grass:2, ice:2, bug:2, rock:0.5, dragon:0.5, steel:2 },
  water:    { fire:2, water:0.5, grass:0.5, ground:2, rock:2, dragon:0.5 },
  grass:    { fire:0.5, water:2, grass:0.5, poison:0.5, ground:2, flying:0.5, bug:0.5, rock:2, dragon:0.5, steel:0.5 },
  electric: { water:2, electric:0.5, grass:0.5, ground:0, flying:2, dragon:0.5 },
  ice:      { fire:0.5, water:0.5, grass:2, ice:0.5, ground:2, flying:2, dragon:2, steel:0.5 },
  fighting: { normal:2, ice:2, poison:0.5, flying:0.5, psychic:0.5, bug:0.5, rock:2, ghost:0, dark:2, steel:2, fairy:0.5 },
  poison:   { grass:2, poison:0.5, ground:0.5, rock:0.5, ghost:0.5, steel:0, fairy:2 },
  ground:   { fire:2, electric:2, grass:0.5, poison:2, flying:0, bug:0.5, rock:2, steel:2 },
  flying:   { electric:0.5, grass:2, fighting:2, bug:2, rock:0.5, steel:0.5 },
  psychic:  { fighting:2, poison:2, psychic:0.5, dark:0, steel:0.5 },
  bug:      { fire:0.5, grass:2, fighting:0.5, flying:0.5, psychic:2, ghost:0.5, dark:2, steel:0.5, fairy:0.5 },
  rock:     { fire:2, ice:2, fighting:0.5, ground:0.5, flying:2, bug:2, steel:0.5 },
  ghost:    { normal:0, psychic:2, ghost:2, dark:0.5 },
  dragon:   { dragon:2, steel:0.5, fairy:0 },
  dark:     { fighting:0.5, psychic:2, ghost:2, dark:0.5, fairy:0.5 },
  fairy:    { fire:0.5, fighting:2, poison:0.5, dragon:2, dark:2, steel:0.5 },
  steel:    { fire:0.5, water:0.5, electric:0.5, ice:2, rock:2, steel:0.5, fairy:2 },
};

function typeMultiplier(moveType, defenderTypes) {
  let mult = 1;
  for (const dt of defenderTypes) {
    mult *= TYPE_CHART[moveType]?.[dt] ?? 1;
  }
  return mult;
}

// ── Ball bonus table ──────────────────────────────────────────────────────
const BALL_BONUS = {
  pokeball:    1.0,
  great_ball:  1.5,
  ultra_ball:  2.0,
  master_ball: 255,
};

// ── Item heal amounts ─────────────────────────────────────────────────────
const ITEM_HEAL = {
  potion:       20,
  super_potion: 50,
  hyper_potion: 200,
  max_potion:   Infinity,
};

const STATUS_CURE = {
  antidote:  ['poison'],
  burn_heal: ['burn'],
  full_heal: ['poison','burn','paralysis','sleep','freeze'],
};

export class BattleState {
  /**
   * @param {object} opts
   * @param {PokemonInstance} opts.playerPokemon  - Lead pokemon from PartyManager
   * @param {object}          opts.wildData       - { speciesId, level }
   * @param {object}          opts.pokemonDefs    - Full pokemon.json
   * @param {object}          opts.moveDefs       - Full moves.json
   * @param {object}          opts.partyManager   - PartyManager instance
   * @param {object}          opts.inventoryManager - InventoryManager instance (optional)
   */
  constructor({ playerPokemon, wildData, pokemonDefs, moveDefs, partyManager, inventoryManager = null }) {
    this._pokemonDefs      = pokemonDefs;
    this._moveDefs         = moveDefs;
    this._partyManager     = partyManager;
    this._inventoryManager = inventoryManager;

    // Build live PokemonInstances
    this._playerPokemon = playerPokemon;
    this._enemyPokemon  = new PokemonInstance(
      wildData.speciesId,
      wildData.level,
      pokemonDefs,
      moveDefs
    );

    this._phase        = PHASE.INTRO;
    this._fleeAttempts = 0;
    this._resultCb     = null;

    // Reset in-battle stage modifiers
    this._playerPokemon.resetStages();

    // Entry abilities — fire on battle start
    this._entryAbilityLog = [];
    this._triggerEntryAbilities();
  }

  // ── Ability system ────────────────────────────────────────────────────────

  /**
   * Abilities that trigger when a pokemon enters battle.
   * Results stored in _entryAbilityLog, shown during intro.
   */
  _triggerEntryAbilities() {
    const log = this._entryAbilityLog;
    const say = (text) => log.push({ type: 'text', text });

    // Intimidate — lower enemy ATK by 1 stage on entry
    if (this._playerPokemon.ability === 'intimidate') {
      this._enemyPokemon.modifyStage('atk', -1);
      say(`${this._playerPokemon.name}'s Intimidate lowered ${this._enemyPokemon.name}'s Attack!`);
    }
    if (this._enemyPokemon.ability === 'intimidate') {
      this._playerPokemon.modifyStage('atk', -1);
      say(`${this._enemyPokemon.name}'s Intimidate lowered ${this._playerPokemon.name}'s Attack!`);
    }
  }

  /**
   * Apply ability-based damage modifier to a move.
   * Returns a multiplier to apply to the final damage.
   */
  _abilityDamageMultiplier(attacker, move) {
    const ability = attacker.ability;
    const hp      = attacker.hp / attacker.maxHp;
    // Torchic-line abilities: boost same-type moves at low HP
    if (ability === 'blaze'    && move.type === 'fire'     && hp <= 0.33) return 1.5;
    if (ability === 'overgrow' && move.type === 'grass'    && hp <= 0.33) return 1.5;
    if (ability === 'torrent'  && move.type === 'water'    && hp <= 0.33) return 1.5;
    if (ability === 'swarm'    && move.type === 'bug'      && hp <= 0.33) return 1.5;
    return 1;
  }

  /**
   * Check if defender's ability blocks or modifies damage.
   * Returns a multiplier (0 = immune, 1 = normal).
   */
  _abilityDefenseMultiplier(defender, move) {
    const ability = defender.ability;
    if (ability === 'levitate'      && move.type === 'ground')   return 0; // immune
    if (ability === 'flash_fire'    && move.type === 'fire')      return 0; // immune (simplification)
    if (ability === 'water_absorb'  && move.type === 'water')     return 0; // immune
    if (ability === 'volt_absorb'   && move.type === 'electric')  return 0; // immune
    if (ability === 'lightning_rod' && move.type === 'electric')  return 0; // immune
    if (ability === 'thick_fat' && (move.type === 'fire' || move.type === 'ice')) return 0.5;
    return 1;
  }

  /**
   * On-contact ability effects (after attacker hits defender).
   */
  _triggerContactAbilities(attacker, defender, log, say) {
    if (move?.category !== 'physical') return;
    const ability = defender.ability;
    if (ability === 'static' && !attacker.status && Math.random() < 0.30) {
      attacker.setStatus('paralysis');
      say(`${attacker.name} was paralyzed by Static!`);
    }
    if (ability === 'poison_point' && !attacker.status && Math.random() < 0.30) {
      attacker.setStatus('poison');
      say(`${attacker.name} was poisoned by Poison Point!`);
    }
    if (ability === 'flame_body' && !attacker.status && Math.random() < 0.30) {
      attacker.setStatus('burn');
      say(`${attacker.name} was burned by Flame Body!`);
    }
    if (ability === 'effect_spore' && !attacker.status && Math.random() < 0.30) {
      const roll = Math.random();
      if (roll < 0.33)      { attacker.setStatus('paralysis'); say(`${attacker.name} was paralyzed by Effect Spore!`); }
      else if (roll < 0.66) { attacker.setStatus('poison');    say(`${attacker.name} was poisoned by Effect Spore!`); }
      else                  { attacker.setStatus('sleep');     say(`${attacker.name} fell asleep from Effect Spore!`); }
    }
  }

  // ── Public getters ────────────────────────────────────────────────────────

  get playerPokemon() { return this._playerPokemon; }
  get enemyPokemon()  { return this._enemyPokemon;  }
  get phase()         { return this._phase;         }

  // ── Event registration ────────────────────────────────────────────────────

  /** BattleScene registers here to receive turn results. */
  onResult(callback) {
    this._resultCb = callback;
  }

  // ── Action entry point ────────────────────────────────────────────────────

  /**
   * Player submits an intent.
   * Phase 1: resolves locally and calls _resultCb with the result.
   * Phase 2: send MSG.BATTLE_ACTION over WebSocket instead.
   *
   * @param {{ type: 'move'|'item'|'catch'|'run', slot?: number, itemId?: string }} action
   */
  submitAction(action) {
    if (this._phase !== PHASE.PLAYER_TURN) return;
    this._phase = PHASE.RESOLVE;

    switch (action.type) {
      case 'move':  this._resolveMoveTurn(action.slot); break;
      case 'item':  this._resolveItem(action.itemId);   break;
      case 'catch': this._resolveCatch(action.itemId);  break;
      case 'run':   this._resolveRun();                 break;
      default:
        console.warn(`[BattleState] Unknown action type: ${action.type}`);
        this._phase = PHASE.PLAYER_TURN;
    }
  }

  /** Called by BattleScene once the intro animation is done. */
  startPlayerTurn() {
    this._phase = PHASE.PLAYER_TURN;
    this._emit({ type: 'turn_start', phase: PHASE.PLAYER_TURN, entryLog: this._entryAbilityLog ?? [] });
  }

  // ── Turn resolution ───────────────────────────────────────────────────────

  _resolveMoveTurn(slotIndex) {
    const log = [];

    const playerMove = this._playerPokemon.moves[slotIndex];
    if (!playerMove) {
      this._phase = PHASE.PLAYER_TURN;
      return;
    }

    // Helper — push a text line
    const say = (text) => log.push({ type: 'text', text });
    // Helper — push an HP update snapshot after a hit
    const snap = () => log.push({
      type: 'hp_update',
      playerHp:    this._playerPokemon.hp,
      playerMaxHp: this._playerPokemon.maxHp,
      enemyHp:     this._enemyPokemon.hp,
      enemyMaxHp:  this._enemyPokemon.maxHp,
    });

    // Deduct PP
    this._playerPokemon.useMove(slotIndex);

    // Speed check — who goes first
    const playerSpd = this._playerPokemon.effectiveStat('spd');
    const enemySpd  = this._enemyPokemon.effectiveStat('spd');
    const playerFirst = playerMove.effect === 'priority1'
      || playerSpd >= enemySpd
      || (playerSpd === enemySpd && Math.random() < 0.5);

    // Enemy picks a random move
    const enemyMoves  = this._enemyPokemon.moves.filter(m => m.pp > 0);
    const enemyMove   = enemyMoves.length
      ? enemyMoves[Math.floor(Math.random() * enemyMoves.length)]
      : null;
    const enemySlot   = enemyMove
      ? this._enemyPokemon.moves.findIndex(m => m.moveId === enemyMove.moveId)
      : -1;
    if (enemySlot >= 0) this._enemyPokemon.useMove(enemySlot);

    if (playerFirst) {
      this._applyMove(playerMove, this._playerPokemon, this._enemyPokemon, log, say, snap);
      if (!this._enemyPokemon.isFainted && enemyMove) {
        this._applyMove(enemyMove, this._enemyPokemon, this._playerPokemon, log, say, snap);
      }
    } else {
      if (enemyMove) this._applyMove(enemyMove, this._enemyPokemon, this._playerPokemon, log, say, snap);
      if (!this._playerPokemon.isFainted) {
        this._applyMove(playerMove, this._playerPokemon, this._enemyPokemon, log, say, snap);
      }
    }

    // Apply end-of-turn status damage (burn / poison)
    this._applyEndOfTurnStatus(this._playerPokemon, log, say, snap);
    if (!this._enemyPokemon.isFainted) {
      this._applyEndOfTurnStatus(this._enemyPokemon, log, say, snap);
    }

    // Check outcomes
    if (this._enemyPokemon.isFainted) {
      this._phase = PHASE.VICTORY;
      this._partyManager.save();
      this._emit({ type: 'turn_result', log, phase: PHASE.VICTORY });
      return;
    }

    if (this._playerPokemon.isFainted) {
      const next = this._partyManager.getParty().find(p => !p.isFainted && p !== this._playerPokemon);
      if (next) {
        this._phase = PHASE.FAINTED;
        this._partyManager.save();
        this._emit({ type: 'turn_result', log, phase: PHASE.FAINTED, nextPokemon: next });
      } else {
        this._phase = PHASE.BLACKED_OUT;
        this._partyManager.save();
        this._emit({ type: 'turn_result', log, phase: PHASE.BLACKED_OUT });
      }
      return;
    }

    this._phase = PHASE.PLAYER_TURN;
    this._partyManager.save();
    this._emit({ type: 'turn_result', log, phase: PHASE.PLAYER_TURN });
  }

  _resolveItem(itemId) {
    const log = [];
    const say  = (text) => log.push({ type: 'text', text });
    const snap = () => log.push({ type: 'hp_update', playerHp: this._playerPokemon.hp, playerMaxHp: this._playerPokemon.maxHp, enemyHp: this._enemyPokemon.hp, enemyMaxHp: this._enemyPokemon.maxHp });

    if (ITEM_HEAL[itemId] !== undefined) {
      const amount = ITEM_HEAL[itemId];
      const healed = this._playerPokemon.heal(amount);
      say(`Used ${itemId.replace(/_/g,' ')}! ${this._playerPokemon.name} restored ${healed} HP.`);
      snap();
      this._removeItem(itemId);
    } else if (STATUS_CURE[itemId]) {
      const cures = STATUS_CURE[itemId];
      if (this._playerPokemon.status && cures.includes(this._playerPokemon.status)) {
        const old = this._playerPokemon.status;
        this._playerPokemon.clearStatus();
        say(`${this._playerPokemon.name} was cured of ${old}!`);
      } else {
        say(`It had no effect...`);
      }
      this._removeItem(itemId);
    } else {
      say(`Can't use that here!`);
      this._phase = PHASE.PLAYER_TURN;
      this._emit({ type: 'turn_result', log, phase: PHASE.PLAYER_TURN });
      return;
    }

    this._enemyTakesFreeTurn(log, say, snap);
  }

  _resolveCatch(ballId = 'pokeball') {
    const log  = [];
    const say  = (text) => log.push({ type: 'text', text });
    const snap = () => log.push({ type: 'hp_update', playerHp: this._playerPokemon.hp, playerMaxHp: this._playerPokemon.maxHp, enemyHp: this._enemyPokemon.hp, enemyMaxHp: this._enemyPokemon.maxHp });
    const enemy   = this._enemyPokemon;
    const species = this._pokemonDefs[enemy.speciesId];
    const catchRate = species?.catchRate ?? 45;

    const ballBonus  = BALL_BONUS[ballId] ?? 1.0;
    const hpFactor   = (3 * enemy.maxHp - 2 * enemy.hp) / (3 * enemy.maxHp);
    const catchValue = catchRate * hpFactor * ballBonus;
    const wobbles    = Math.min(3, Math.floor(catchValue / 64));
    const caught     = ballId === 'master_ball' || Math.random() < catchValue / 255;

    this._removeItem(ballId);

    if (caught) {
      this._phase = PHASE.CAUGHT;
      enemy.resetStages();
      const added = this._partyManager.addInstance(enemy);
      say(`Gotcha! ${enemy.name} was caught!`);
      this._emit({ type: 'catch_result', caught: true, wobbles, log, phase: PHASE.CAUGHT, addedToParty: added });
      return;
    }

    say(`Oh no! ${enemy.name} broke free!`);
    this._enemyTakesFreeTurn(log, say, snap);
  }

  _resolveRun() {
    const log  = [];
    const say  = (text) => log.push({ type: 'text', text });
    const snap = () => log.push({ type: 'hp_update', playerHp: this._playerPokemon.hp, playerMaxHp: this._playerPokemon.maxHp, enemyHp: this._enemyPokemon.hp, enemyMaxHp: this._enemyPokemon.maxHp });
    this._fleeAttempts++;

    const playerSpd = this._playerPokemon.effectiveStat('spd');
    const enemySpd  = this._enemyPokemon.effectiveStat('spd');
    const fleeRate  = Math.floor(playerSpd * 32 / Math.max(Math.floor(enemySpd / 4), 1))
                      + 30 * this._fleeAttempts;
    const fled      = Math.random() < fleeRate / 255;

    if (fled) {
      this._phase = PHASE.FLED;
      say(`Got away safely!`);
      this._emit({ type: 'flee_result', fled: true, log, phase: PHASE.FLED });
      return;
    }

    say(`Can't escape!`);
    this._enemyTakesFreeTurn(log, say, snap);
  }

  // ── Move application ──────────────────────────────────────────────────────

  _applyMove(move, attacker, defender, log, say, snap) {
    const attackerName = attacker === this._playerPokemon
      ? this._playerPokemon.name
      : this._enemyPokemon.name;
    const defenderName = defender === this._playerPokemon
      ? this._playerPokemon.name
      : this._enemyPokemon.name;

    // Status condition checks on attacker
    if (attacker.status === 'sleep') {
      attacker.tickSleep();
      if (attacker.sleepTurns > 0) { say(`${attackerName} is fast asleep!`); return; }
      attacker.clearStatus();
      say(`${attackerName} woke up!`);
    }

    if (attacker.status === 'freeze') {
      if (Math.random() < 0.8) { say(`${attackerName} is frozen solid!`); return; }
      attacker.clearStatus();
      say(`${attackerName} thawed out!`);
    }

    if (attacker.status === 'paralysis' && Math.random() < 0.25) {
      say(`${attackerName} is paralyzed! It can't move!`);
      return;
    }

    say(`${attackerName} used ${move.name}!`);

    // Status-only moves
    if (move.category === 'status') {
      this._applyEffect(move.effect, attacker, defender, 0, log, say, snap);
      return;
    }

    // Accuracy check
    if (move.effect !== 'never_miss' && move.accuracy > 0) {
      const accStage  = attacker.stages.accuracy ?? 0;
      const evaStage  = defender.stages.evasion  ?? 0;
      const accMult   = PokemonInstance._stageMult(accStage);
      const evaMult   = PokemonInstance._stageMult(evaStage);
      const hitChance = (move.accuracy / 100) * accMult / evaMult;
      if (Math.random() > hitChance) { say(`${attackerName}'s attack missed!`); return; }
    }

    // Damage calculation
    const level    = attacker.level;
    const power    = move.power;
    const isSpecial = move.category === 'special';
    const atk      = attacker.effectiveStat(isSpecial ? 'spatk' : 'atk');
    const def      = defender.effectiveStat(isSpecial ? 'spdef' : 'def');
    const typeMult = typeMultiplier(move.type, defender.types);
    const random   = 0.85 + Math.random() * 0.15;
    const isCrit   = move.effect === 'high_crit' ? Math.random() < 0.125 : Math.random() < 0.0625;
    const critMult = isCrit ? 1.5 : 1;

    const atkAbilityMult = this._abilityDamageMultiplier(attacker, move);
    const defAbilityMult = this._abilityDefenseMultiplier(defender, move);

    // Ability immunity check
    if (defAbilityMult === 0) {
      const defName2 = defender === this._playerPokemon ? this._playerPokemon.name : this._enemyPokemon.name;
      say(`${defName2}'s ${defender.ability.replace(/_/g,' ')} made it immune!`);
      return;
    }

    let damage = Math.floor(
      ((2 * level / 5 + 2) * power * (atk / def) / 50 + 2)
      * typeMult * random * critMult * atkAbilityMult * defAbilityMult
    );
    damage = Math.max(1, damage);

    // Announce ability boost if active
    if (atkAbilityMult > 1) {
      say(`${attackerName}'s ${attacker.ability.replace(/_/g,' ')} powered up the move!`);
    }

    if (typeMult === 0)    say(`It doesn't affect ${defenderName}...`);
    else if (typeMult > 1) say(`It's super effective!`);
    else if (typeMult < 1) say(`It's not very effective...`);
    if (isCrit) say(`A critical hit!`);

    const hits = move.effect === 'hit_twice' ? 2 : 1;
    let totalDamage = 0;
    for (let i = 0; i < hits; i++) {
      totalDamage += defender.takeDamage(damage);
    }
    snap(); // ← HP update after defender takes damage

    // Contact ability triggers
    if (move.category === 'physical') {
      const defAbility = defender.ability;
      if (defAbility === 'static' && !attacker.status && Math.random() < 0.30) {
        attacker.setStatus('paralysis');
        say(`${attackerName} was paralyzed by ${defenderName}'s Static!`);
      } else if (defAbility === 'poison_point' && !attacker.status && Math.random() < 0.30) {
        attacker.setStatus('poison');
        say(`${attackerName} was poisoned by ${defenderName}'s Poison Point!`);
      } else if (defAbility === 'flame_body' && !attacker.status && Math.random() < 0.30) {
        attacker.setStatus('burn');
        say(`${attackerName} was burned by ${defenderName}'s Flame Body!`);
      } else if (defAbility === 'effect_spore' && !attacker.status && Math.random() < 0.30) {
        const roll = Math.random();
        if (roll < 0.33)      { attacker.setStatus('paralysis'); say(`${attackerName} was paralyzed by ${defenderName}'s Effect Spore!`); }
        else if (roll < 0.66) { attacker.setStatus('poison');    say(`${attackerName} was poisoned by ${defenderName}'s Effect Spore!`); }
        else                  { attacker.setStatus('sleep');     say(`${attackerName} fell asleep from ${defenderName}'s Effect Spore!`); }
      }
    }

    if (move.effect === 'drain_half') {
      const drained = Math.floor(totalDamage / 2);
      attacker.heal(drained);
      say(`${attackerName} absorbed ${drained} HP!`);
      snap(); // ← HP update after attacker heals
    }

    if (move.effect === 'recoil_33pct') {
      const recoil = Math.max(1, Math.floor(totalDamage / 3));
      attacker.takeDamage(recoil);
      say(`${attackerName} was hurt by recoil!`);
      snap(); // ← HP update after recoil
    }

    this._applyEffect(move.effect, attacker, defender, totalDamage, log, say, snap);
  }

  // ── Effect resolver ───────────────────────────────────────────────────────

  _applyEffect(effect, attacker, defender, damage, log, say, snap) {
    if (!effect) return;
    const defName = defender === this._playerPokemon
      ? this._playerPokemon.name : this._enemyPokemon.name;
    const attName = attacker === this._playerPokemon
      ? this._playerPokemon.name : this._enemyPokemon.name;

    const tryStatus = (status, chance, label) => {
      if (defender.status) return;
      if (Math.random() < chance) {
        defender.setStatus(status);
        say(`${defName} was ${label}!`);
      }
    };

    switch (effect) {
      case 'burn':          tryStatus('burn',      1.00, 'burned'); break;
      case 'paralyze':      tryStatus('paralysis', 1.00, 'paralyzed'); break;
      case 'poison':        tryStatus('poison',    1.00, 'poisoned'); break;
      case 'sleep':         tryStatus('sleep',     1.00, 'put to sleep'); break;
      case 'freeze':        tryStatus('freeze',    1.00, 'frozen solid'); break;
      case 'confuse':       say(`${defName} became confused!`); break;

      case 'burn_10pct':    tryStatus('burn',      0.10, 'burned'); break;
      case 'freeze_10pct':  tryStatus('freeze',    0.10, 'frozen solid'); break;
      case 'paralyze_30pct':tryStatus('paralysis', 0.30, 'paralyzed'); break;
      case 'poison_30pct':  tryStatus('poison',    0.30, 'poisoned'); break;
      case 'confuse_10pct': break;

      case 'flinch_30pct': break;

      case 'lower_atk':   { const d = defender.modifyStage('atk',  -1); if(d) say(`${defName}'s Attack fell!`); break; }
      case 'lower_def':   { const d = defender.modifyStage('def',  -1); if(d) say(`${defName}'s Defense fell!`); break; }
      case 'lower_def2':  { const d = defender.modifyStage('def',  -2); if(d) say(`${defName}'s Defense sharply fell!`); break; }
      case 'lower_spatk2':{ const d = defender.modifyStage('spatk',-2); if(d) say(`${defName}'s Sp. Atk sharply fell!`); break; }
      case 'spd_down_10pct':  { if(Math.random()<0.10){ const d=defender.modifyStage('spd',-1);   if(d) say(`${defName}'s Speed fell!`); } break; }
      case 'spdef_down_10pct':{ if(Math.random()<0.10){ const d=defender.modifyStage('spdef',-1); if(d) say(`${defName}'s Sp. Def fell!`); } break; }
      case 'spdef_down_20pct':{ if(Math.random()<0.20){ const d=defender.modifyStage('spdef',-1); if(d) say(`${defName}'s Sp. Def fell!`); } break; }

      case 'raise_atk':   { const d = attacker.modifyStage('atk',  +1); if(d) say(`${attName}'s Attack rose!`); break; }
      case 'raise_def':   { const d = attacker.modifyStage('def',  +1); if(d) say(`${attName}'s Defense rose!`); break; }
      case 'raise_spatk2':{ const d = attacker.modifyStage('spatk',+2); if(d) say(`${attName}'s Sp. Atk sharply rose!`); break; }
      case 'raise_spd2':  { const d = attacker.modifyStage('spd',  +2); if(d) say(`${attName}'s Speed sharply rose!`); break; }
      case 'raise_def_spdef': {
        attacker.modifyStage('def',   +1);
        attacker.modifyStage('spdef', +1);
        say(`${attName}'s Defense and Sp. Def rose!`);
        break;
      }
      case 'raise_atk_def_acc': {
        attacker.modifyStage('atk', +1);
        attacker.modifyStage('def', +1);
        say(`${attName}'s Attack and Defense rose!`);
        break;
      }
      case 'raise_eva': { attacker.modifyStage('evasion', +1); say(`${attName} became harder to hit!`); break; }

      case 'two_turn':
      case 'disable_last_move':
      case 'double_if_hurt':
      case 'heal_party_status':
      case 'never_miss':
      case 'high_crit':
      case 'priority1':
      case 'hit_twice':
      case 'drain_half':
      case 'recoil_33pct':
        break;

      default: break;
    }
  }

  // ── End-of-turn status damage ─────────────────────────────────────────────

  _applyEndOfTurnStatus(pokemon, log, say, snap) {
    const name = pokemon === this._playerPokemon
      ? this._playerPokemon.name : this._enemyPokemon.name;

    if (pokemon.status === 'burn') {
      const dmg = Math.max(1, Math.floor(pokemon.maxHp / 8));
      pokemon.takeDamage(dmg);
      say(`${name} is hurt by its burn!`);
      snap();
    }
    if (pokemon.status === 'poison') {
      const dmg = Math.max(1, Math.floor(pokemon.maxHp / 8));
      pokemon.takeDamage(dmg);
      say(`${name} is hurt by poison!`);
      snap();
    }
  }

  // ── Enemy free turn (after item use / failed catch / failed flee) ─────────

  _enemyTakesFreeTurn(log, say, snap) {
    const enemyMoves = this._enemyPokemon.moves.filter(m => m.pp > 0);
    if (enemyMoves.length && !this._enemyPokemon.isFainted) {
      const move = enemyMoves[Math.floor(Math.random() * enemyMoves.length)];
      const slot = this._enemyPokemon.moves.findIndex(m => m.moveId === move.moveId);
      if (slot >= 0) this._enemyPokemon.useMove(slot);
      this._applyMove(move, this._enemyPokemon, this._playerPokemon, log, say, snap);
    }

    this._partyManager.save();

    if (this._playerPokemon.isFainted) {
      const next = this._partyManager.getParty().find(p => !p.isFainted && p !== this._playerPokemon);
      if (next) {
        this._phase = PHASE.FAINTED;
        this._emit({ type: 'turn_result', log, phase: PHASE.FAINTED, nextPokemon: next });
      } else {
        this._phase = PHASE.BLACKED_OUT;
        this._emit({ type: 'turn_result', log, phase: PHASE.BLACKED_OUT });
      }
      return;
    }

    this._phase = PHASE.PLAYER_TURN;
    this._emit({ type: 'turn_result', log, phase: PHASE.PLAYER_TURN });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _removeItem(itemId) {
    if (!this._inventoryManager) return;
    try { this._inventoryManager.removeItem(itemId, 1); } catch {}
  }

  _emit(result) {
    if (this._resultCb) this._resultCb(result);
  }
}
