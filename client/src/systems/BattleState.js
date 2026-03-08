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
import {
  triggerEntryAbilities,
  triggerContactAbilities,
  triggerEndOfTurnAbility,
  triggerBattleEndAbility,
  abilityAtkMultiplier,
  abilityDefMultiplier,
  abilityBlocksStatus,
  abilityBlocksFlinch,
  abilityBlocksConfusion,
  abilityBlocksRecoil,
  abilityHasPressure,
  abilitySynchronizes,
  abilityName,
} from './AbilityReader.js';

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

export function typeMultiplier(moveType, defenderTypes) {
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

// Map stat-only effects to { stat, delta, target:'self'|'foe' }
const STAT_EFFECT_MAP = {
  raise_atk:        { stats: [['atk', +1]],              target: 'self' },
  raise_def:        { stats: [['def', +1]],              target: 'self' },
  raise_spatk2:     { stats: [['spatk', +2]],            target: 'self' },
  raise_spd2:       { stats: [['spd', +2]],              target: 'self' },
  raise_def_spdef:  { stats: [['def', +1], ['spdef', +1]], target: 'self' },
  raise_atk_def_acc:{ stats: [['atk', +1], ['def', +1]], target: 'self' },
  raise_eva:        { stats: [['evasion', +1]],          target: 'self' },
  lower_atk:        { stats: [['atk', -1]],              target: 'foe' },
  lower_def:        { stats: [['def', -1]],              target: 'foe' },
  lower_def2:       { stats: [['def', -2]],              target: 'foe' },
  lower_spatk2:     { stats: [['spatk', -2]],            target: 'foe' },
};

// Effects that inflict a primary status on the foe (100% chance, status-category moves)
const STATUS_INFLICT_EFFECTS = new Set([
  'burn', 'paralyze', 'poison', 'sleep', 'freeze',
]);

/** Returns true if a status move's stat effect would be completely wasted. */
function isStatMoveUseless(move, user, foe) {
  if (move.category !== 'status') return false;
  const info = STAT_EFFECT_MAP[move.effect];
  if (!info) return false;
  const target = info.target === 'self' ? user : foe;
  return info.stats.every(([stat, delta]) => {
    const cur = target.stages[stat];
    return delta > 0 ? cur >= 6 : cur <= -6;
  });
}

/** Returns true if a status move would fail because foe already has a status. */
function isStatusMoveUseless(move, foe) {
  if (move.category !== 'status') return false;
  if (!STATUS_INFLICT_EFFECTS.has(move.effect)) return false;
  return !!foe.status;
}

export class BattleState {
  /**
   * @param {object} opts
   * @param {PokemonInstance} opts.playerPokemon  - Lead pokemon from PartyManager
   * @param {object}          opts.wildData       - { speciesId, level }
   * @param {object}          opts.pokemonDefs    - Full pokemon.json
   * @param {object}          opts.moveDefs       - Full moves.json
   * @param {object}          opts.partyManager   - PartyManager instance
   * @param {object}          opts.inventoryManager - InventoryManager instance (optional)
   * @param {object}          opts.networkClient    - Client instance for server-authoritative catch (optional)
   */
  constructor({ playerPokemon, wildData, pokemonDefs, moveDefs, partyManager, inventoryManager = null, networkClient = null }) {
    this._pokemonDefs      = pokemonDefs;
    this._moveDefs         = moveDefs;
    this._partyManager     = partyManager;
    this._inventoryManager = inventoryManager;
    this._networkClient    = networkClient;
    this._pendingCatch     = false; // true while waiting for server catch result

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
    this._entryAbilityLog = triggerEntryAbilities(this._playerPokemon, this._enemyPokemon);

    // Listen for server results
    if (this._networkClient) {
      this._networkClient.on('catch_result', (msg) => {
        if (!this._pendingCatch) return;
        this._pendingCatch = false;
        this._handleServerCatchResult(msg);
      });
      this._networkClient.on('item_result', (msg) => {
        if (!this._pendingItem) return;
        this._handleServerItemResult(msg);
      });
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

    // Clear per-turn flags
    this._playerPokemon._flinched = false;
    this._enemyPokemon._flinched  = false;

    // Deduct PP (Pressure: enemy's move costs 2 PP if player has Pressure)
    this._playerPokemon.useMove(slotIndex);
    if (abilityHasPressure(this._enemyPokemon)) {
      this._playerPokemon.useMove(slotIndex);
    }

    // Speed check — who goes first
    const playerSpd = this._playerPokemon.effectiveStat('spd');
    const enemySpd  = this._enemyPokemon.effectiveStat('spd');
    const playerFirst = playerMove.effect === 'priority1'
      || playerSpd >= enemySpd
      || (playerSpd === enemySpd && Math.random() < 0.5);

    // Enemy picks a random move (prefer moves that aren't wasted stat boosts)
    const enemyMovesAll = this._enemyPokemon.moves.filter(m => m.pp > 0);
    const enemyMovesUseful = enemyMovesAll.filter(m =>
      !isStatMoveUseless(m, this._enemyPokemon, this._playerPokemon)
      && !isStatusMoveUseless(m, this._playerPokemon)
    );
    const enemyMovePool = enemyMovesUseful.length ? enemyMovesUseful : enemyMovesAll;
    const enemyMove   = enemyMovePool.length
      ? enemyMovePool[Math.floor(Math.random() * enemyMovePool.length)]
      : null;
    const enemySlot   = enemyMove
      ? this._enemyPokemon.moves.findIndex(m => m.moveId === enemyMove.moveId)
      : -1;
    if (enemySlot >= 0) {
      this._enemyPokemon.useMove(enemySlot);
      if (abilityHasPressure(this._playerPokemon)) {
        this._enemyPokemon.useMove(enemySlot);
      }
    }

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

    // Tick screens down each turn
    if (this._screens) {
      for (const side of ['player', 'enemy']) {
        if (!this._screens[side]) continue;
        for (const screen of ['reflect', 'lightScreen', 'safeguard', 'mist']) {
          if (this._screens[side][screen] > 0) this._screens[side][screen]--;
        }
      }
    }

    // Check outcomes
    if (this._enemyPokemon.isFainted) {
      this._phase = PHASE.VICTORY;

      // ── Award EXP ────────────────────────────────────────────────────────
      const enemySpecies  = this._pokemonDefs[this._enemyPokemon.speciesId];
      const expGained     = PokemonInstance.calcExpReward(enemySpecies, this._enemyPokemon.level);
      const expBefore     = this._playerPokemon.exp;
      const levelBefore   = this._playerPokemon.level;
      const levelsGained  = this._playerPokemon.gainExp(expGained);
      const expAfter      = this._playerPokemon.exp;
      const levelAfter    = this._playerPokemon.level;
      const statDeltas    = this._playerPokemon._lastGainStatDeltas ?? {};

      say(`${this._playerPokemon.name} gained ${expGained} EXP. Points!`);
      for (const lv of levelsGained) {
        say(`${this._playerPokemon.name} grew to Lv. ${lv}!`);
      }
      // ── End EXP ──────────────────────────────────────────────────────────

      this._partyManager.save();
      this._applyBattleEndAbilities();
      this._emit({
        type:               'turn_result',
        log,
        phase:              PHASE.VICTORY,
        expGained,
        expBefore,
        expAfter,
        levelBefore,
        levelAfter,
        levelsGained,
        playerSpeciesId:    this._playerPokemon.speciesId,
        statDeltas,
        expForCurrentLevel: PokemonInstance.expForLevel(levelAfter),
        expForNextLevel:    PokemonInstance.expForLevel(levelAfter + 1),
      });
      return;
    }

    if (this._playerPokemon.isFainted) {
      const next = this._partyManager.getParty().find(p => !p.isFainted && p !== this._playerPokemon);
      if (next) {
        this._phase = PHASE.FAINTED;
        this._partyManager.save();
        this._applyBattleEndAbilities();
        this._emit({ type: 'turn_result', log, phase: PHASE.FAINTED, nextPokemon: next });
      } else {
        this._phase = PHASE.BLACKED_OUT;
        this._partyManager.save();
        this._applyBattleEndAbilities();
        this._emit({ type: 'turn_result', log, phase: PHASE.BLACKED_OUT });
      }
      return;
    }

    this._phase = PHASE.PLAYER_TURN;
    this._partyManager.save();
    this._emit({ type: 'turn_result', log, phase: PHASE.PLAYER_TURN });
  }

  _resolveItem(itemId) {
    // Server-authoritative: validate item exists before using
    if (this._networkClient?.connected) {
      this._pendingItem = true;
      this._pendingItemId = itemId;
      this._networkClient.send({ type: 'use_item', itemId, count: 1 });
      return;
    }

    // Offline fallback
    this._resolveItemLocal(itemId);
  }

  /** Handle server's item validation result. */
  _handleServerItemResult(msg) {
    if (!this._pendingItem) return;
    this._pendingItem = false;

    const itemId = msg.itemId || this._pendingItemId;

    if (!msg.ok) {
      // Server rejected — item doesn't exist
      this._phase = PHASE.PLAYER_TURN;
      this._emit({ type: 'turn_result', log: [{ type: 'text', text: msg.error || "Can't use that item." }], phase: PHASE.PLAYER_TURN });
      return;
    }

    // Server approved — apply effect locally
    this._resolveItemLocal(itemId, true);
  }

  /** Apply item effect locally. If serverValidated, skip _removeItem (server already removed). */
  _resolveItemLocal(itemId, serverValidated = false) {
    const log = [];
    const say  = (text) => log.push({ type: 'text', text });
    const snap = () => log.push({ type: 'hp_update', playerHp: this._playerPokemon.hp, playerMaxHp: this._playerPokemon.maxHp, enemyHp: this._enemyPokemon.hp, enemyMaxHp: this._enemyPokemon.maxHp });

    if (ITEM_HEAL[itemId] !== undefined) {
      const amount = ITEM_HEAL[itemId];
      const healed = this._playerPokemon.heal(amount);
      say(`Used ${itemId.replace(/_/g,' ')}! ${this._playerPokemon.name} restored ${healed} HP.`);
      snap();
      if (!serverValidated) this._removeItem(itemId);
      else this._removeItemLocal(itemId);
    } else if (STATUS_CURE[itemId]) {
      const cures = STATUS_CURE[itemId];
      if (this._playerPokemon.status && cures.includes(this._playerPokemon.status)) {
        const old = this._playerPokemon.status;
        this._playerPokemon.clearStatus();
        say(`${this._playerPokemon.name} was cured of ${old}!`);
      } else {
        say(`It had no effect...`);
      }
      if (!serverValidated) this._removeItem(itemId);
      else this._removeItemLocal(itemId);
    } else {
      say(`Can't use that here!`);
      this._phase = PHASE.PLAYER_TURN;
      this._emit({ type: 'turn_result', log, phase: PHASE.PLAYER_TURN });
      return;
    }

    this._enemyTakesFreeTurn(log, say, snap);
  }

  _resolveCatch(ballId = 'pokeball') {
    const enemy = this._enemyPokemon;

    // Server-authoritative catch: send attempt to server, wait for result
    if (this._networkClient?.connected) {
      this._pendingCatch = true;
      this._pendingCatchBallId = ballId;
      this._networkClient.send({
        type: 'catch_attempt',
        ballId,
        enemyHp: enemy.hp,
        enemyMaxHp: enemy.maxHp,
      });
      // Remove item locally for immediate UI feedback
      this._removeItem(ballId);
      return;
    }

    // Offline fallback: same local logic as before
    this._resolveCatchLocal(ballId);
  }

  /** Handle server's catch result. */
  _handleServerCatchResult(msg) {
    if (msg.error) {
      console.warn('[BattleState] Catch error:', msg.error);
      this._phase = PHASE.PLAYER_TURN;
      this._emit({ type: 'catch_result', caught: false, wobbles: 0, log: [msg.error], phase: PHASE.PLAYER_TURN, ballId: this._pendingCatchBallId });
      return;
    }

    const enemy = this._enemyPokemon;
    const ballId = msg.ballId || this._pendingCatchBallId;

    if (msg.caught) {
      this._phase = PHASE.CAUGHT;
      enemy.resetStages();
      // Server already added pokemon to party/PC in DB.
      // Add locally so the client state matches.
      let added = this._partyManager.addInstance(enemy);
      const log = [];
      if (!added) {
        const storage = window.storageManager;
        const spot = storage?.depositAuto(enemy);
        if (spot) {
          log.push({ type: 'text', text: `Gotcha! ${enemy.name} was caught!` });
          log.push({ type: 'text', text: `Party is full — ${enemy.name} was sent to ${storage.getBoxName(spot.box)}.` });
          added = true;
        } else {
          log.push({ type: 'text', text: `Gotcha! ${enemy.name} was caught!` });
          log.push({ type: 'text', text: `But your party and PC are both full! ${enemy.name} had to be released...` });
        }
      } else {
        log.push({ type: 'text', text: `Gotcha! ${enemy.name} was caught!` });
      }
      this._applyBattleEndAbilities();
      this._emit({ type: 'catch_result', caught: true, wobbles: 3, log, phase: PHASE.CAUGHT, addedToParty: added, ballId });
    } else {
      this._emit({ type: 'catch_result', caught: false, wobbles: msg.wobbles, log: [`Oh no! ${enemy.name} broke free!`], phase: PHASE.PLAYER_TURN, ballId });
    }
  }

  /** Local catch resolution (offline / legacy fallback). */
  _resolveCatchLocal(ballId = 'pokeball') {
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
      let added = this._partyManager.addInstance(enemy);
      if (!added) {
        const storage = window.storageManager;
        const spot = storage?.depositAuto(enemy);
        if (spot) {
          say(`Gotcha! ${enemy.name} was caught!`);
          say(`Party is full — ${enemy.name} was sent to ${storage.getBoxName(spot.box)}.`);
          added = true;
        } else {
          say(`Gotcha! ${enemy.name} was caught!`);
          say(`But your party and PC are both full! ${enemy.name} had to be released...`);
        }
      } else {
        say(`Gotcha! ${enemy.name} was caught!`);
      }
      this._applyBattleEndAbilities();
      this._emit({ type: 'catch_result', caught: true, wobbles: 3, log, phase: PHASE.CAUGHT, addedToParty: added, ballId });
      return;
    }

    this._emit({ type: 'catch_result', caught: false, wobbles, log: [`Oh no! ${enemy.name} broke free!`], phase: PHASE.PLAYER_TURN, ballId });
  }

  /** Called by UI after failed catch ball animation finishes. Enemy gets a free turn. */
  resolveFailedCatch() {
    const log  = [];
    const say  = (text) => log.push({ type: 'text', text });
    const snap = () => log.push({ type: 'hp_update', playerHp: this._playerPokemon.hp, playerMaxHp: this._playerPokemon.maxHp, enemyHp: this._enemyPokemon.hp, enemyMaxHp: this._enemyPokemon.maxHp });
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
      this._applyBattleEndAbilities();
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

    // Flinch (set by flinch_30pct on the previous hit this turn)
    if (attacker._flinched) {
      attacker._flinched = false;
      say(`${attackerName} flinched and couldn't move!`);
      return;
    }

    // ── Status-only moves ─────────────────────────────────────────────────────
    if (move.category === 'status') {
      this._applyEffect(move.effect, attacker, defender, 0, log, say, snap);
      return;
    }

    // ── Accuracy check ────────────────────────────────────────────────────────
    if (move.effect !== 'never_miss' && move.effect !== 'ohko' && move.accuracy > 0) {
      const accStage  = attacker.stages.accuracy ?? 0;
      const evaStage  = defender.stages.evasion  ?? 0;
      const accMult   = PokemonInstance._stageMult(accStage);
      const evaMult   = PokemonInstance._stageMult(evaStage);
      const hitChance = (move.accuracy / 100) * accMult / evaMult;
      if (Math.random() > hitChance) { say(`${attackerName}'s attack missed!`); return; }
    }

    // ── OHKO moves ────────────────────────────────────────────────────────────
    if (move.effect === 'ohko') {
      // Accuracy = attacker level - defender level + 30; fails if attacker level < defender
      if (attacker.level < defender.level) {
        say(`${defenderName} is unaffected!`);
        return;
      }
      const ohkoAcc = (attacker.level - defender.level + 30) / 100;
      if (Math.random() > ohkoAcc) { say(`${attackerName}'s attack missed!`); return; }
      defender.takeDamage(defender.hp);
      say(`It's a one-hit KO!`);
      snap();
      return;
    }

    // ── Fixed-damage moves ────────────────────────────────────────────────────
    if (move.effect === 'fixed_40dmg') {
      // Type immunity still applies (e.g. Dragon Rage vs Normal-immune Ghost)
      const tMult = typeMultiplier(move.type, defender.types);
      if (tMult === 0) { say(`It doesn't affect ${defenderName}...`); return; }
      defender.takeDamage(40);
      snap();
      return;
    }

    if (move.effect === 'fixed_20dmg') {
      const tMult = typeMultiplier(move.type, defender.types);
      if (tMult === 0) { say(`It doesn't affect ${defenderName}...`); return; }
      defender.takeDamage(20);
      snap();
      return;
    }

    if (move.effect === 'level_damage') {
      // Night Shade / Seismic Toss — damage = attacker level
      const tMult = typeMultiplier(move.type, defender.types);
      if (tMult === 0) { say(`It doesn't affect ${defenderName}...`); return; }
      defender.takeDamage(attacker.level);
      snap();
      return;
    }

    if (move.effect === 'psywave') {
      const tMult = typeMultiplier(move.type, defender.types);
      if (tMult === 0) { say(`It doesn't affect ${defenderName}...`); return; }
      const dmg = Math.max(1, Math.floor(attacker.level * (0.5 + Math.random())));
      defender.takeDamage(dmg);
      snap();
      return;
    }

    if (move.effect === 'halve_hp') {
      // Super Fang — deal exactly half of current HP
      const dmg = Math.max(1, Math.floor(defender.hp / 2));
      defender.takeDamage(dmg);
      snap();
      return;
    }

    if (move.effect === 'final_gambit') {
      // Deals damage equal to user's current HP, then user faints
      const dmg = attacker.hp;
      defender.takeDamage(dmg);
      attacker.takeDamage(attacker.hp);
      snap();
      return;
    }

    // ── Standard damage calculation ───────────────────────────────────────────
    const level    = attacker.level;
    const power    = move.power;
    const isSpecial = move.category === 'special';
    const atk      = attacker.effectiveStat(isSpecial ? 'spatk' : 'atk');
    const def      = defender.effectiveStat(isSpecial ? 'spdef' : 'def');
    const typeMult = typeMultiplier(move.type, defender.types);
    const random   = 0.85 + Math.random() * 0.15;
    const isCrit   = move.effect === 'high_crit' ? Math.random() < 0.125 : Math.random() < 0.0625;
    const critMult = isCrit ? 1.5 : 1;

    const atkAbilityMult = abilityAtkMultiplier(attacker, move);
    const defAbilityMult = abilityDefMultiplier(defender, move);

    // Ability immunity check
    if (defAbilityMult === 0) {
      const defSide = defender === this._playerPokemon ? 'player' : 'enemy';
      const defName2 = defender === this._playerPokemon ? this._playerPokemon.name : this._enemyPokemon.name;
      log.push({ type: 'ability_active', side: defSide });
      say(`${defName2}'s ${abilityName(defender.ability)} made it immune!`);
      return;
    }

    // Screen multiplier (Reflect / Light Screen)
    const defSide = defender === this._playerPokemon ? 'player' : 'enemy';
    const screens = this._screens?.[defSide] ?? {};
    const screenMult = (!isCrit && isSpecial  && screens.lightScreen > 0) ? 0.5
                     : (!isCrit && !isSpecial && screens.reflect     > 0) ? 0.5
                     : 1;

    let damage = Math.floor(
      ((2 * level / 5 + 2) * power * (atk / def) / 50 + 2)
      * typeMult * random * critMult * atkAbilityMult * defAbilityMult * screenMult
    );
    damage = Math.max(1, damage);

    // Announce ability boost if active
    if (atkAbilityMult > 1) {
      const side = attacker === this._playerPokemon ? 'player' : 'enemy';
      log.push({ type: 'ability_active', side });
      say(`${attackerName}'s ${abilityName(attacker.ability)} powered up the move!`);
    }

    if (typeMult === 0)    say(`It doesn't affect ${defenderName}...`);
    else if (typeMult > 1) say(`It's super effective!`);
    else if (typeMult < 1) say(`It's not very effective...`);
    if (isCrit) say(`A critical hit!`);

    // ── Hit count ─────────────────────────────────────────────────────────────
    let hits;
    if (move.effect === 'hit_twice' || move.effect === 'hit_twice_poison_20pct') {
      hits = 2;
    } else if (move.effect === 'hit_2to5') {
      // Gen 4+ distribution: 2×(35%), 3×(35%), 4×(15%), 5×(15%)
      const r = Math.random();
      hits = r < 0.35 ? 2 : r < 0.70 ? 3 : r < 0.85 ? 4 : 5;
    } else {
      hits = 1;
    }

    let totalDamage = 0;
    for (let i = 0; i < hits; i++) {
      totalDamage += defender.takeDamage(damage);
    }
    if (hits > 1) say(`Hit ${hits} time(s)!`);
    snap(); // ← HP update after defender takes damage

    // Contact ability triggers
    if (move.category === 'physical') {
      triggerContactAbilities(attacker, defender, say);
    }

    if (move.effect === 'drain_half') {
      const drained = Math.floor(totalDamage / 2);
      attacker.heal(drained);
      say(`${attackerName} absorbed ${drained} HP!`);
      snap(); // ← HP update after attacker heals
    }

    if (move.effect === 'recoil_33pct' && !abilityBlocksRecoil(attacker)) {
      const recoil = Math.max(1, Math.floor(totalDamage / 3));
      attacker.takeDamage(recoil);
      say(`${attackerName} was hurt by recoil!`);
      snap(); // ← HP update after recoil
    }

    if (move.effect === 'hit_twice_poison_20pct' && !defender.status && Math.random() < 0.20) {
      defender.setStatus('poison');
      const dName = defender === this._playerPokemon ? this._playerPokemon.name : this._enemyPokemon.name;
      say(`${dName} was poisoned!`);
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
      if (defender.status) {
        if (chance >= 1.0) say(`But it failed! ${defName} already has a status condition!`);
        return;
      }
      // Immunity abilities
      if (abilityBlocksStatus(defender, status)) {
        const blockerSide = defender === this._playerPokemon ? 'player' : 'enemy';
        log.push({ type: 'ability_active', side: blockerSide });
        say(`${defName} is protected by its ${abilityName(defender.ability)}!`);
        return;
      }
      // Safeguard blocks external status moves
      const defSideKey = defender === this._playerPokemon ? 'player' : 'enemy';
      if (this._screens?.[defSideKey]?.safeguard > 0) {
        say(`${defName} is protected by Safeguard!`);
        return;
      }
      if (Math.random() < chance) {
        defender.setStatus(status);
        say(`${defName} was ${label}!`);
        // Synchronize — reflect burn / poison / paralysis back to attacker
        // Synchronize — reflect burn / poison / paralysis back to attacker
        if (abilitySynchronizes(defender)
            && !attacker.status
            && (status === 'burn' || status === 'poison' || status === 'paralysis')) {
          attacker.setStatus(status);
          say(`${attName}'s Synchronize reflected the ${status} back!`);
        }
      }
    };

    switch (effect) {
      case 'burn':          tryStatus('burn',      1.00, 'burned'); break;
      case 'paralyze':      tryStatus('paralysis', 1.00, 'paralyzed'); break;
      case 'poison':        tryStatus('poison',    1.00, 'poisoned'); break;
      case 'sleep':         tryStatus('sleep',     1.00, 'put to sleep'); break;
      case 'freeze':        tryStatus('freeze',    1.00, 'frozen solid'); break;
      case 'confuse': {
        if (abilityBlocksConfusion(defender)) {
          say(`${defName}'s ${abilityName(defender.ability)} prevents confusion!`);
        } else {
          say(`${defName} became confused!`);
        }
        break;
      }

      case 'burn_10pct':    tryStatus('burn',      0.10, 'burned'); break;
      case 'freeze_10pct':  tryStatus('freeze',    0.10, 'frozen solid'); break;
      case 'paralyze_30pct':tryStatus('paralysis', 0.30, 'paralyzed'); break;
      case 'poison_30pct':  tryStatus('poison',    0.30, 'poisoned'); break;
      case 'confuse_10pct': break;

      case 'flinch_30pct': {
        if (!abilityBlocksFlinch(defender) && Math.random() < 0.30) {
          defender._flinched = true;
          say(`${defName} flinched!`);
        }
        break;
      }

      case 'lower_atk':   { const d = defender.modifyStage('atk',  -1); if(d) say(`${defName}'s Attack fell!`); else say(`${defName}'s Attack won't go any lower!`); break; }
      case 'lower_def':   { const d = defender.modifyStage('def',  -1); if(d) say(`${defName}'s Defense fell!`); else say(`${defName}'s Defense won't go any lower!`); break; }
      case 'lower_def2':  { const d = defender.modifyStage('def',  -2); if(d) say(`${defName}'s Defense sharply fell!`); else say(`${defName}'s Defense won't go any lower!`); break; }
      case 'lower_spatk2':{ const d = defender.modifyStage('spatk',-2); if(d) say(`${defName}'s Sp. Atk sharply fell!`); else say(`${defName}'s Sp. Atk won't go any lower!`); break; }
      case 'spd_down_10pct':  { if(Math.random()<0.10){ const d=defender.modifyStage('spd',-1);   if(d) say(`${defName}'s Speed fell!`); else say(`${defName}'s Speed won't go any lower!`); } break; }
      case 'spdef_down_10pct':{ if(Math.random()<0.10){ const d=defender.modifyStage('spdef',-1); if(d) say(`${defName}'s Sp. Def fell!`); else say(`${defName}'s Sp. Def won't go any lower!`); } break; }
      case 'spdef_down_20pct':{ if(Math.random()<0.20){ const d=defender.modifyStage('spdef',-1); if(d) say(`${defName}'s Sp. Def fell!`); else say(`${defName}'s Sp. Def won't go any lower!`); } break; }

      case 'raise_atk':   { const d = attacker.modifyStage('atk',  +1); if(d) say(`${attName}'s Attack rose!`); else say(`${attName}'s Attack won't go any higher!`); break; }
      case 'raise_def':   { const d = attacker.modifyStage('def',  +1); if(d) say(`${attName}'s Defense rose!`); else say(`${attName}'s Defense won't go any higher!`); break; }
      case 'raise_spatk2':{ const d = attacker.modifyStage('spatk',+2); if(d) say(`${attName}'s Sp. Atk sharply rose!`); else say(`${attName}'s Sp. Atk won't go any higher!`); break; }
      case 'raise_spd2':  { const d = attacker.modifyStage('spd',  +2); if(d) say(`${attName}'s Speed sharply rose!`); else say(`${attName}'s Speed won't go any higher!`); break; }
      case 'raise_def_spdef': {
        const d1 = attacker.modifyStage('def',   +1);
        const d2 = attacker.modifyStage('spdef', +1);
        if (d1 || d2) say(`${attName}'s Defense and Sp. Def rose!`);
        else say(`${attName}'s stats won't go any higher!`);
        break;
      }
      case 'raise_atk_def_acc': {
        const d1 = attacker.modifyStage('atk', +1);
        const d2 = attacker.modifyStage('def', +1);
        if (d1 || d2) say(`${attName}'s Attack and Defense rose!`);
        else say(`${attName}'s stats won't go any higher!`);
        break;
      }
      case 'raise_eva': { const d = attacker.modifyStage('evasion', +1); if(d) say(`${attName} became harder to hit!`); else say(`${attName}'s evasion won't go any higher!`); break; }

      case 'two_turn':
      case 'disable_last_move':
      case 'double_if_hurt':
      case 'heal_party_status':
      case 'never_miss':
      case 'high_crit':
      case 'priority1':
      case 'hit_twice':
      case 'hit_2to5':
      case 'hit_twice_poison_20pct':
      case 'drain_half':
      case 'recoil_33pct':
        break;

      // ── Recovery — self heal ─────────────────────────────────────────────────
      case 'heal_half_hp': {
        // Recover / Slack Off / Roost / Softboiled
        if (attacker.hp === attacker.maxHp) {
          say(`${attName}'s HP is full!`);
        } else {
          const healed = attacker.heal(Math.floor(attacker.maxHp / 2));
          say(`${attName} recovered HP!`);
          snap();
        }
        break;
      }
      case 'sleep_full_heal': {
        // Rest — fully heal, apply sleep 2 turns
        if (attacker.status === 'sleep') {
          say(`${attName} is already asleep!`);
        } else {
          attacker.heal(attacker.maxHp);
          attacker.setStatus('sleep');
          attacker.sleepTurns = 2;
          say(`${attName} slept and became healthy!`);
          snap();
        }
        break;
      }
      case 'heal_pulse': {
        // Heal target (defender in context) 50%
        if (defender.hp === defender.maxHp) {
          say(`${defName}'s HP is full!`);
        } else {
          const healed = defender.heal(Math.floor(defender.maxHp / 2));
          say(`${defName} had its HP restored!`);
          snap();
        }
        break;
      }

      // ── Screens / field protection ───────────────────────────────────────────
      case 'halve_special_dmg': {
        // Light Screen — store flag on the user's side for 5 turns
        const side = attacker === this._playerPokemon ? 'player' : 'enemy';
        if (!this._screens) this._screens = {};
        if (this._screens[side]?.lightScreen > 0) {
          say(`But it failed!`);
        } else {
          this._screens[side] = this._screens[side] || {};
          this._screens[side].lightScreen = 5;
          say(`Light Screen raised ${attName}'s team's Sp. Def!`);
        }
        break;
      }
      case 'reflect_screen': {
        // Reflect — halve physical damage for 5 turns
        const side = attacker === this._playerPokemon ? 'player' : 'enemy';
        if (!this._screens) this._screens = {};
        if (this._screens[side]?.reflect > 0) {
          say(`But it failed!`);
        } else {
          this._screens[side] = this._screens[side] || {};
          this._screens[side].reflect = 5;
          say(`Reflect raised ${attName}'s team's Defense!`);
        }
        break;
      }
      case 'prevent_status_5turns': {
        // Safeguard
        const side = attacker === this._playerPokemon ? 'player' : 'enemy';
        if (!this._screens) this._screens = {};
        if (this._screens[side]?.safeguard > 0) {
          say(`But it failed!`);
        } else {
          this._screens[side] = this._screens[side] || {};
          this._screens[side].safeguard = 5;
          say(`${attName} is protected by Safeguard!`);
        }
        break;
      }
      case 'mist_screen': {
        // Mist — block stat drops for 5 turns
        const side = attacker === this._playerPokemon ? 'player' : 'enemy';
        if (!this._screens) this._screens = {};
        if (this._screens[side]?.mist > 0) {
          say(`But it failed!`);
        } else {
          this._screens[side] = this._screens[side] || {};
          this._screens[side].mist = 5;
          say(`${attName} is shrouded in mist!`);
        }
        break;
      }

      default: break;
    }
  }

  // ── End-of-turn status damage ─────────────────────────────────────────────

  _applyEndOfTurnStatus(pokemon, log, say, snap) {
    const name = pokemon === this._playerPokemon
      ? this._playerPokemon.name : this._enemyPokemon.name;

    // End-of-turn ability hooks (e.g. Shed Skin) — returns true if status was cured
    const suppressed = triggerEndOfTurnAbility(pokemon, name, say, snap);
    if (suppressed) return;

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
    const enemyMovesAll2 = this._enemyPokemon.moves.filter(m => m.pp > 0);
    const enemyMovesUseful2 = enemyMovesAll2.filter(m =>
      !isStatMoveUseless(m, this._enemyPokemon, this._playerPokemon)
      && !isStatusMoveUseless(m, this._playerPokemon)
    );
    const enemyMovePool2 = enemyMovesUseful2.length ? enemyMovesUseful2 : enemyMovesAll2;
    if (enemyMovePool2.length && !this._enemyPokemon.isFainted) {
      const move = enemyMovePool2[Math.floor(Math.random() * enemyMovePool2.length)];
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

  // ── Battle-end ability hooks ───────────────────────────────────────────────

  /**
   * Called just before a battle-ending emit.
   * Natural Cure clears the player's status on switching out / battle end.
   */
  _applyBattleEndAbilities() {
    triggerBattleEndAbility(this._playerPokemon);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _removeItem(itemId) {
    if (!this._inventoryManager) return;
    try { this._inventoryManager.removeItem(itemId, 1); } catch {}
  }

  /** Remove item from client-side inventory only (server already removed it from DB). */
  _removeItemLocal(itemId) {
    if (!this._inventoryManager) return;
    try { this._inventoryManager.removeItem(itemId, 1); } catch {}
  }

  _emit(result) {
    if (this._resultCb) this._resultCb(result);
  }
}
