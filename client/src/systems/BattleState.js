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

    // Persistent battle state
    this._weather       = null;   // null | 'sun' | 'rain' | 'sandstorm' | 'hail'
    this._weatherTurns  = 0;
    this._screens       = {};

    // Per-Pokémon volatile flags (reset between battles, not on PokemonInstance to keep serialization clean)
    this._pv = {
      player: { leeched: false, trapped: 0, toxicCounter: 0, protecting: false, lockMove: null, lockTurns: 0, critBoost: false, tailwindTurns: 0, rechargeTurn: false, aquaRing: false, ingrain: false, enduring: false, nightmare: false, uproar: 0, substituteHp: 0, destinyBond: false, perishCount: 0, encoreTurns: 0, encoreMove: null, lastPhysDmg: 0, lastSpclDmg: 0, stockpile: 0, cursed: false, allyFaintedLastTurn: false },
      enemy:  { leeched: false, trapped: 0, toxicCounter: 0, protecting: false, lockMove: null, lockTurns: 0, critBoost: false, tailwindTurns: 0, rechargeTurn: false, aquaRing: false, ingrain: false, enduring: false, nightmare: false, uproar: 0, substituteHp: 0, destinyBond: false, perishCount: 0, encoreTurns: 0, encoreMove: null, lastPhysDmg: 0, lastSpclDmg: 0, stockpile: 0, cursed: false, allyFaintedLastTurn: false },
    };

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

    // If player is locked (Thrash/Outrage) or encored, override slot choice
    const playerLockId = this._pv.player.lockMove ?? this._pv.player.encoreMove;
    const playerMove = playerLockId
      ? (this._playerPokemon.moves.find(m => m.moveId === playerLockId) ?? this._playerPokemon.moves[slotIndex])
      : this._playerPokemon.moves[slotIndex];
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
    const playerSpd = this._playerPokemon.effectiveStat('spd') * (this._pv.player.tailwindTurns > 0 ? 2 : 1);
    const enemySpd  = this._enemyPokemon.effectiveStat('spd')  * (this._pv.enemy.tailwindTurns  > 0 ? 2 : 1);
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
    // Force locked / encored move for enemy
    const enemyForcedId = this._pv.enemy.lockMove ?? this._pv.enemy.encoreMove ?? null;
    const enemyLocked = enemyForcedId
      ? this._enemyPokemon.moves.find(m => m.moveId === enemyForcedId) ?? null
      : null;
    const enemyMove   = enemyLocked ?? (enemyMovePool.length
      ? enemyMovePool[Math.floor(Math.random() * enemyMovePool.length)]
      : null);
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

    // Apply end-of-turn status damage (burn / poison) and persistent effects
    this._applyEndOfTurnStatus(this._playerPokemon, log, say, snap);
    if (!this._enemyPokemon.isFainted) {
      this._applyEndOfTurnStatus(this._enemyPokemon, log, say, snap);
    }

    // Tick all turn-persistent state (screens, weather, protect, tailwind)
    this._tickTurnState(log, say);

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
        // Apply Healing Wish / Baton Pass stages to incoming Pokemon
        if (this._healingWishPending) {
          next._currentHp = next.maxHp;
          next.clearStatus();
          this._healingWishPending = false;
        }
        if (this._batonPassStages) {
          for (const [stat, val] of Object.entries(this._batonPassStages)) {
            next._stages[stat] = val;
          }
          if (this._batonPassPv) {
            const npv = this._pvOf(next);
            npv.aquaRing     = this._batonPassPv.aquaRing;
            npv.ingrain      = this._batonPassPv.ingrain;
            npv.substituteHp = this._batonPassPv.substituteHp;
          }
          this._batonPassStages = null;
          this._batonPassPv     = null;
        }
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

    // Trapped or ingrained — can't flee
    if (this._pv.player.trapped > 0 || this._pv.player.ingrain) {
      say(`${this._playerPokemon.name} can't escape!`);
      this._enemyTakesFreeTurn(log, say, snap);
      return;
    }

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

    // ── Recharge turn (Hyper Beam etc.) ──────────────────────────────────────
    const attPvMove = this._pvOf(attacker);
    if (attPvMove.rechargeTurn) {
      attPvMove.rechargeTurn = false;
      say(`${attackerName} must recharge!`);
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
      if (Math.random() > hitChance) {
        say(`${attackerName}'s attack missed!`);
        if (move.effect === 'crash_if_miss') {
          const crash = Math.max(1, Math.floor(attacker.maxHp / 2));
          attacker.takeDamage(crash);
          say(`${attackerName} kept going and crashed!`);
          snap();
        }
        return;
      }
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

    if (move.effect === 'dream_eater' && defender.status !== 'sleep') {
      say(`But it failed! ${defenderName} isn't asleep!`);
      return;
    }

    // Synchronoise: fails if foe shares no type with user
    if (move.effect === 'synchronoise') {
      const shared = attacker.types.some(t => defender.types.includes(t));
      if (!shared) { say(`But it failed! ${defenderName} doesn't share a type!`); return; }
    }

    if (move.effect === 'leave_1hp') {
      // False Swipe — always leaves at least 1 HP
      const dmgCap = defender.hp - 1;
      if (dmgCap <= 0) { say(`But it failed!`); return; }
    }

    // ── Protect check ─────────────────────────────────────────────────────────
    if (this._pvOf(defender).protecting && move.effect !== 'bypass_protect') {
      say(`${defenderName} protected itself!`);
      return;
    }

    // ── Standard damage calculation ───────────────────────────────────────────
    const level    = attacker.level;
    const isSpecial = move.category === 'special';
    const atk      = attacker.effectiveStat(isSpecial ? 'spatk' : 'atk');
    // Psystrike / Psyshock use spatk vs def (special move, physical defense)
    const defStatKey = (move.effect === 'use_def_not_spdef') ? 'def'
                     : isSpecial ? 'spdef' : 'def';
    const def      = defender.effectiveStat(defStatKey);
    const typeMult = typeMultiplier(move.type, defender.types);
    const random   = 0.85 + Math.random() * 0.15;
    const attPv    = this._pvOf(attacker);
    const isCrit   = move.effect === 'always_crit'
      ? true
      : move.effect === 'high_crit'
        ? Math.random() < 0.125
        : attPv.critBoost
          ? Math.random() < 0.125
          : Math.random() < 0.0625;
    const critMult = isCrit ? 1.5 : 1;

    // ── Variable power moves ──────────────────────────────────────────────────
    let power = move.power;
    if (move.effect === 'power_by_spd_ratio') {
      const userSpd = attacker.effectiveStat('spd');
      const foeSpd  = defender.effectiveStat('spd');
      power = Math.min(150, Math.max(1, Math.floor(25 * foeSpd / Math.max(1, userSpd))));
    } else if (move.effect === 'power_by_stat_boosts') {
      const totalPositive = Object.values(attacker.stages).reduce((s, v) => s + (v > 0 ? v : 0), 0);
      power = 20 + 20 * totalPositive;
    } else if (move.effect === 'double_if_slower') {
      const attSpd = attacker.effectiveStat('spd');
      const defSpd = defender.effectiveStat('spd');
      if (attSpd <= defSpd) power = move.power * 2;
    } else if (move.effect === 'double_if_statused') {
      if (defender.status) power = move.power * 2;
    } else if (move.effect === 'double_if_half_hp') {
      if (defender.hp <= Math.floor(defender.maxHp / 2)) power = move.power * 2;
    } else if (move.effect === 'double_if_asleep') {
      if (defender.status === 'sleep') power = move.power * 2;
    } else if (move.effect === 'wring_out') {
      power = Math.max(1, Math.floor(120 * defender.hp / defender.maxHp));
    } else if (move.effect === 'power_by_pp') {
      // Trump Card: power based on remaining PP (already decremented before _applyMove)
      power = move.pp <= 0 ? 200 : move.pp === 1 ? 80 : move.pp === 2 ? 60 : move.pp === 3 ? 50 : 40;
    } else if (move.effect === 'random_power') {
      // Magnitude: weighted random tiers
      const r = Math.random();
      const tier = r < 0.05 ? [4,10] : r < 0.15 ? [5,30] : r < 0.35 ? [6,50]
                 : r < 0.65 ? [7,70] : r < 0.85 ? [8,90] : r < 0.95 ? [9,100]
                 : r < 0.99 ? [10,110] : [11,150];
      power = tier[1];
      say(`Magnitude ${tier[0]}!`);
    } else if (move.effect === 'reversal') {
      // Power inversely proportional to HP ratio
      const hpPct = attacker.hp / attacker.maxHp;
      power = hpPct > 0.6875 ? 20 : hpPct > 0.3542 ? 40 : hpPct > 0.2083 ? 80
            : hpPct > 0.1042 ? 100 : hpPct > 0.0417 ? 150 : 200;
    } else if (move.effect === 'punishment') {
      // 60 + 20 per positive stage on foe, capped at 200
      const positiveStages = Object.values(defender.stages).reduce((s, v) => s + (v > 0 ? v : 0), 0);
      power = Math.min(200, 60 + 20 * positiveStages);
    } else if (move.effect === 'retaliate') {
      // Double power if an ally fainted last turn
      if (this._pvOf(attacker).allyFaintedLastTurn) power = move.power * 2;
    } else if (move.effect === 'power_by_stockpile') {
      // Spit Up: 100 per stockpile charge
      power = Math.max(1, this._pvOf(attacker).stockpile * 100);
    } else if (move.effect === 'use_def_not_spdef') {
      // Psystrike: uses target's Defense stat — handled below in damage calc
    } else if (move.effect === 'power_by_weight') {
      // Low Kick / Heavy Slam: tiered by target weight (kg)
      const weight = this._pokemonDefs[defender.speciesId]?.weight ?? 50;
      power = weight < 10 ? 20 : weight < 25 ? 40 : weight < 50 ? 60
            : weight < 100 ? 80 : weight < 200 ? 100 : 120;
    }

    const atkAbilityMult = abilityAtkMultiplier(attacker, move);
    const defAbilityMult = abilityDefMultiplier(defender, move);

    // Ability immunity check
    if (defAbilityMult === 0) {
      const defSide = this._sideOf(defender);
      const defName2 = defender === this._playerPokemon ? this._playerPokemon.name : this._enemyPokemon.name;
      log.push({ type: 'ability_active', side: defSide });
      say(`${defName2}'s ${abilityName(defender.ability)} made it immune!`);
      return;
    }

    // Screen multiplier (Reflect / Light Screen)
    const defSide = this._sideOf(defender);
    const screens = this._screens?.[defSide] ?? {};
    const screenMult = (!isCrit && isSpecial  && screens.lightScreen > 0) ? 0.5
                     : (!isCrit && !isSpecial && screens.reflect     > 0) ? 0.5
                     : 1;

    // Weather multiplier
    let weatherMult = 1;
    if (this._weather === 'rain') {
      if (move.type === 'water') weatherMult = 1.5;
      else if (move.type === 'fire') weatherMult = 0.5;
    } else if (this._weather === 'sun') {
      if (move.type === 'fire') weatherMult = 1.5;
      else if (move.type === 'water') weatherMult = 0.5;
    }

    let damage = Math.floor(
      ((2 * level / 5 + 2) * power * (atk / def) / 50 + 2)
      * typeMult * random * critMult * atkAbilityMult * defAbilityMult * screenMult * weatherMult
    );
    damage = Math.max(1, damage);

    // Announce ability boost if active
    if (atkAbilityMult > 1) {
      const side = this._sideOf(attacker);
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
    const defPvDmg = this._pvOf(defender);
    for (let i = 0; i < hits; i++) {
      let cappedDmg = move.effect === 'leave_1hp' ? Math.min(damage, defender.hp - 1) : damage;
      // Endure: survive with 1 HP
      if (defPvDmg.enduring && cappedDmg >= defender.hp) cappedDmg = defender.hp - 1;
      // Substitute: damage hits the sub instead
      if (defPvDmg.substituteHp > 0 && move.effect !== 'bypass_protect') {
        const subDmg = Math.min(cappedDmg, defPvDmg.substituteHp);
        defPvDmg.substituteHp -= subDmg;
        totalDamage += subDmg;
        if (defPvDmg.substituteHp <= 0) defPvDmg._subJustBroke = true;
      } else {
        totalDamage += defender.takeDamage(Math.max(0, cappedDmg));
      }
    }
    if (defPvDmg.enduring) { say(`${defenderName} endured the hit!`); defPvDmg.enduring = false; }
    if (hits > 1) say(`Hit ${hits} time(s)!`);
    snap();

    // Track last damage taken for Counter / Mirror Coat
    if (move.category === 'physical') defPvDmg.lastPhysDmg = totalDamage;
    else if (move.category === 'special') defPvDmg.lastSpclDmg = totalDamage;

    // Substitute absorbs damage — redirect to sub if active
    // (already handled in damage cap below; just announce here if sub broke)
    if (defPvDmg.substituteHp <= 0 && defPvDmg._subJustBroke) {
      defPvDmg._subJustBroke = false;
      say(`${defenderName}'s substitute broke!`);
    }

    // Destiny Bond: if attacker was flagged and defender just fainted, attacker faints too
    const attPvDB = this._pvOf(attacker);
    if (defender.isFainted && attPvDB.destinyBond) {
      attPvDB.destinyBond = false;
      attacker.takeDamage(attacker.hp);
      say(`${attackerName} was taken down by Destiny Bond!`);
      snap();
    }

    // Contact ability triggers
    if (move.category === 'physical') {
      triggerContactAbilities(attacker, defender, say);
    }

    if (move.effect === 'drain_half') {
      const drained = Math.floor(totalDamage / 2);
      attacker.heal(drained);
      say(`${attackerName} absorbed ${drained} HP!`);
      snap();
    }

    if (move.effect === 'recoil_33pct' && !abilityBlocksRecoil(attacker)) {
      const recoil = Math.max(1, Math.floor(totalDamage / 3));
      attacker.takeDamage(recoil);
      say(`${attackerName} was hurt by recoil!`);
      snap();
    }

    if (move.effect === 'recoil_25pct' && !abilityBlocksRecoil(attacker)) {
      const recoil = Math.max(1, Math.floor(totalDamage / 4));
      attacker.takeDamage(recoil);
      say(`${attackerName} was hurt by recoil!`);
      snap();
    }

    if (move.effect === 'recoil_33pct_burn_10pct' && !abilityBlocksRecoil(attacker)) {
      const recoil = Math.max(1, Math.floor(totalDamage / 3));
      attacker.takeDamage(recoil);
      say(`${attackerName} was hurt by recoil!`);
      snap();
    }

    if (move.effect === 'hit_twice_poison_20pct' && !defender.status && Math.random() < 0.20) {
      defender.setStatus('poison');
      const dName = defender === this._playerPokemon ? this._playerPokemon.name : this._enemyPokemon.name;
      say(`${dName} was poisoned!`);
    }

    // ── On-KO / on-hit stat raises ────────────────────────────────────────────
    if (move.effect === 'raise_atk3_on_ko' && defender.isFainted) {
      attacker.modifyStage('atk', +3);
      say(`${attackerName}'s Attack rose drastically!`);
    }
    if (move.effect === 'raise_atk_on_hit' && totalDamage > 0) {
      attacker.modifyStage('atk', +1);
      say(`${attackerName}'s Attack rose!`);
    }

    // ── Lock move tick (Thrash / Outrage / Petal Dance) ──────────────────────
    if (move.effect === 'lock_2to3turns_confuse') {
      const attPvLock = this._pvOf(attacker);
      attPvLock.lockTurns = Math.max(0, attPvLock.lockTurns - 1);
      if (attPvLock.lockTurns === 0) {
        attPvLock.lockMove = null;
        // Confuse at end of rampage
        if (!abilityBlocksConfusion(attacker)) {
          say(`${attackerName} became confused due to fatigue!`);
          // We store confusion state minimally — flag it as confused for a few turns
          attacker._confused = true;
        }
      }
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

    // Mist guard — block negative stage changes applied to the defender from external sources
    const defSideForMist = this._sideOf(defender);
    const mistActive = (this._screens?.[defSideForMist]?.mist ?? 0) > 0;
    const modifyDefenderStage = (stat, delta) => {
      if (delta < 0 && mistActive) {
        say(`${defName} is protected by Mist!`);
        return 0;
      }
      return defender.modifyStage(stat, delta);
    };

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
      // Uproar prevents sleep
      if (status === 'sleep' && (this._pv.player.uproar > 0 || this._pv.enemy.uproar > 0)) {
        say(`${defName} can't sleep during the uproar!`);
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

      case 'lower_atk':   { const d = modifyDefenderStage('atk',  -1); if(d) say(`${defName}'s Attack fell!`); else say(`${defName}'s Attack won't go any lower!`); break; }
      case 'lower_def':   { const d = modifyDefenderStage('def',  -1); if(d) say(`${defName}'s Defense fell!`); else say(`${defName}'s Defense won't go any lower!`); break; }
      case 'lower_def2':  { const d = modifyDefenderStage('def',  -2); if(d) say(`${defName}'s Defense sharply fell!`); else say(`${defName}'s Defense won't go any lower!`); break; }
      case 'lower_spatk2':{ const d = modifyDefenderStage('spatk',-2); if(d) say(`${defName}'s Sp. Atk sharply fell!`); else say(`${defName}'s Sp. Atk won't go any lower!`); break; }
      case 'spd_down_10pct':  { if(Math.random()<0.10){ const d=modifyDefenderStage('spd',-1);   if(d) say(`${defName}'s Speed fell!`); else say(`${defName}'s Speed won't go any lower!`); } break; }
      case 'spdef_down_10pct':{ if(Math.random()<0.10){ const d=modifyDefenderStage('spdef',-1); if(d) say(`${defName}'s Sp. Def fell!`); else say(`${defName}'s Sp. Def won't go any lower!`); } break; }
      case 'spdef_down_20pct':{ if(Math.random()<0.20){ const d=modifyDefenderStage('spdef',-1); if(d) say(`${defName}'s Sp. Def fell!`); else say(`${defName}'s Sp. Def won't go any lower!`); } break; }

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
        const side = this._sideOf(attacker);
        if ((this._screens[side]?.lightScreen ?? 0) > 0) {
          say(`But it failed!`);
        } else {
          this._screens[side] = this._screens[side] || {};
          this._screens[side].lightScreen = 5;
          say(`Light Screen raised ${attName}'s team's Sp. Def!`);
        }
        break;
      }
      case 'reflect_screen': {
        const side = this._sideOf(attacker);
        if ((this._screens[side]?.reflect ?? 0) > 0) {
          say(`But it failed!`);
        } else {
          this._screens[side] = this._screens[side] || {};
          this._screens[side].reflect = 5;
          say(`Reflect raised ${attName}'s team's Defense!`);
        }
        break;
      }
      case 'prevent_status_5turns': {
        const side = this._sideOf(attacker);
        if ((this._screens[side]?.safeguard ?? 0) > 0) {
          say(`But it failed!`);
        } else {
          this._screens[side] = this._screens[side] || {};
          this._screens[side].safeguard = 5;
          say(`${attName} is protected by Safeguard!`);
        }
        break;
      }
      case 'mist_screen': {
        const side = this._sideOf(attacker);
        if ((this._screens[side]?.mist ?? 0) > 0) {
          say(`But it failed!`);
        } else {
          this._screens[side] = this._screens[side] || {};
          this._screens[side].mist = 5;
          say(`${attName} is shrouded in mist!`);
        }
        break;
      }

      // ── Trapping moves (Wrap, Fire Spin, etc.) ────────────────────────────────
      case 'trap_4to5turns': {
        const defPv = this._pvOf(defender);
        if (defPv.trapped === 0) {
          const turns = Math.random() < 0.5 ? 4 : 5;
          defPv.trapped = turns;
          say(`${defName} was trapped!`);
        }
        break;
      }

      // ── Additional stat-drop effects ─────────────────────────────────────────
      case 'lower_atk2':    { const d = modifyDefenderStage('atk',   -2); if(d) say(`${defName}'s Attack sharply fell!`); else say(`${defName}'s Attack won't go any lower!`); break; }
      case 'lower_spd2':    { const d = modifyDefenderStage('spd',   -2); if(d) say(`${defName}'s Speed sharply fell!`); else say(`${defName}'s Speed won't go any lower!`); break; }
      case 'lower_spdef2':  { const d = modifyDefenderStage('spdef', -2); if(d) say(`${defName}'s Sp. Def sharply fell!`); else say(`${defName}'s Sp. Def won't go any lower!`); break; }
      case 'lower_atk_def': {
        const d1 = modifyDefenderStage('atk', -1);
        const d2 = modifyDefenderStage('def', -1);
        if (d1 || d2) say(`${defName}'s Attack and Defense fell!`); else say(`${defName}'s stats won't go any lower!`);
        break;
      }
      case 'lower_acc': { const d = modifyDefenderStage('accuracy', -1); if(d) say(`${defName}'s accuracy fell!`); else say(`${defName}'s accuracy won't go any lower!`); break; }
      case 'lower_eva': { const d = modifyDefenderStage('evasion',  -1); if(d) say(`${defName}'s evasion fell!`); else say(`${defName}'s evasion won't go any lower!`); break; }

      // ── Additional stat-raise effects ─────────────────────────────────────────
      case 'raise_atk2':   { const d = attacker.modifyStage('atk',   +2); if(d) say(`${attName}'s Attack sharply rose!`); else say(`${attName}'s Attack won't go any higher!`); break; }
      case 'raise_def2':   { const d = attacker.modifyStage('def',   +2); if(d) say(`${attName}'s Defense sharply rose!`); else say(`${attName}'s Defense won't go any higher!`); break; }
      case 'raise_spdef':  { const d = attacker.modifyStage('spdef', +1); if(d) say(`${attName}'s Sp. Def rose!`); else say(`${attName}'s Sp. Def won't go any higher!`); break; }
      case 'raise_spdef2': { const d = attacker.modifyStage('spdef', +2); if(d) say(`${attName}'s Sp. Def sharply rose!`); else say(`${attName}'s Sp. Def won't go any higher!`); break; }
      case 'raise_eva2':   { const d = attacker.modifyStage('evasion',+2); if(d) say(`${attName}'s evasion sharply rose!`); else say(`${attName}'s evasion won't go any higher!`); break; }
      case 'raise_atk_spatk': {
        const d1 = attacker.modifyStage('atk',   +1);
        const d2 = attacker.modifyStage('spatk',  +1);
        if (d1 || d2) say(`${attName}'s Attack and Sp. Atk rose!`); else say(`${attName}'s stats won't go any higher!`);
        break;
      }
      case 'raise_atk_spd': {
        const d1 = attacker.modifyStage('atk', +1);
        const d2 = attacker.modifyStage('spd',  +1);
        if (d1 || d2) say(`${attName}'s Attack and Speed rose!`); else say(`${attName}'s stats won't go any higher!`);
        break;
      }
      case 'raise_spatk_spdef': {
        const d1 = attacker.modifyStage('spatk', +1);
        const d2 = attacker.modifyStage('spdef', +1);
        if (d1 || d2) say(`${attName}'s Sp. Atk and Sp. Def rose!`); else say(`${attName}'s stats won't go any higher!`);
        break;
      }
      case 'raise_spatk_spdef_spd': {
        const d1 = attacker.modifyStage('spatk', +1);
        const d2 = attacker.modifyStage('spdef', +1);
        const d3 = attacker.modifyStage('spd',   +1);
        if (d1 || d2 || d3) say(`${attName}'s Sp. Atk, Sp. Def, and Speed rose!`); else say(`${attName}'s stats won't go any higher!`);
        break;
      }
      case 'raise_crit_rate': {
        this._pvOf(attacker).critBoost = true;
        say(`${attName} is getting pumped!`);
        break;
      }
      case 'reset_stat_changes': {
        // Haze — clear all stages for both sides
        attacker.resetStages();
        defender.resetStages();
        say(`All stat changes were eliminated!`);
        break;
      }

      // ── Additional chance effects ─────────────────────────────────────────────
      case 'burn_100pct':      tryStatus('burn',      1.00, 'burned'); break;
      case 'paralyze_10pct':   tryStatus('paralysis', 0.10, 'paralyzed'); break;
      case 'confuse_20pct':    { if (Math.random() < 0.20 && !abilityBlocksConfusion(defender)) say(`${defName} became confused!`); break; }
      case 'confuse_30pct':    { if (Math.random() < 0.30 && !abilityBlocksConfusion(defender)) say(`${defName} became confused!`); break; }
      case 'flinch_10pct':     { if (!abilityBlocksFlinch(defender) && Math.random() < 0.10) { defender._flinched = true; say(`${defName} flinched!`); } break; }
      case 'flinch_20pct':     { if (!abilityBlocksFlinch(defender) && Math.random() < 0.20) { defender._flinched = true; say(`${defName} flinched!`); } break; }

      // ── Badly poisoned (Toxic) ────────────────────────────────────────────────
      case 'badly_poison': {
        if (defender.status) { say(`But it failed! ${defName} already has a status condition!`); break; }
        if (abilityBlocksStatus(defender, 'poison')) {
          log.push({ type: 'ability_active', side: this._sideOf(defender) });
          say(`${defName} is protected by its ${abilityName(defender.ability)}!`); break;
        }
        if (this._screens?.[this._sideOf(defender)]?.safeguard > 0) { say(`${defName} is protected by Safeguard!`); break; }
        defender.setStatus('poison');
        this._pvOf(defender).toxicCounter = 1;
        say(`${defName} was badly poisoned!`);
        break;
      }
      case 'badly_poison_50pct': {
        if (!defender.status && Math.random() < 0.50) {
          if (!abilityBlocksStatus(defender, 'poison')) {
            defender.setStatus('poison');
            this._pvOf(defender).toxicCounter = 1;
            say(`${defName} was badly poisoned!`);
          }
        }
        break;
      }

      // ── Weather ───────────────────────────────────────────────────────────────
      case 'rain_weather': {
        if (this._weather === 'rain') { say(`But it failed!`); break; }
        this._weather = 'rain'; this._weatherTurns = 5;
        say(`It started to rain!`);
        break;
      }
      case 'sand_weather': {
        if (this._weather === 'sandstorm') { say(`But it failed!`); break; }
        this._weather = 'sandstorm'; this._weatherTurns = 5;
        say(`A sandstorm kicked up!`);
        break;
      }

      // ── Protect / Detect ──────────────────────────────────────────────────────
      case 'protect': {
        const pv = this._pvOf(attacker);
        pv.protecting = true;
        say(`${attName} protected itself!`);
        break;
      }

      // ── Leech Seed ────────────────────────────────────────────────────────────
      case 'leech_seed': {
        const defPv = this._pvOf(defender);
        if (defPv.leeched) { say(`But it failed!`); break; }
        // Grass types are immune
        if (defender.types.includes('grass')) { say(`${defName} is immune to Leech Seed!`); break; }
        defPv.leeched = true;
        say(`${defName} was seeded!`);
        break;
      }

      // ── Trapping (Mean Look — permanent trap in wild) ─────────────────────────
      case 'trap': {
        const defPv = this._pvOf(defender);
        if (defPv.trapped > 0) { say(`But it failed!`); break; }
        defPv.trapped = 999; // indefinite until battle end
        say(`${defName} can no longer escape!`);
        break;
      }

      // ── Pain Split / Endeavor ─────────────────────────────────────────────────
      case 'match_hp': {
        // Endeavor — set foe HP to user's current HP
        if (defender.hp <= attacker.hp) { say(`But it failed!`); break; }
        const diff = defender.hp - attacker.hp;
        defender.takeDamage(diff);
        say(`${defName}'s HP was cut down to match ${attName}!`);
        snap();
        break;
      }

      // ── Swagger / Flatter / Rage combos ──────────────────────────────────────
      case 'raise_atk_confuse': {
        attacker.modifyStage('atk', +2);
        say(`${attName}'s Attack sharply rose!`);
        if (!abilityBlocksConfusion(defender)) say(`But ${defName} became confused due to confusion!`);
        break;
      }
      case 'raise_spatk_confuse': {
        attacker.modifyStage('spatk', +1);
        say(`${attName}'s Sp. Atk rose!`);
        if (!abilityBlocksConfusion(defender)) say(`But ${defName} became confused!`);
        break;
      }

      // ── Silver Wind: 10% raise all stats ─────────────────────────────────────
      case 'raise_all_stats_10pct': {
        if (Math.random() < 0.10) {
          attacker.modifyStage('atk',   +1);
          attacker.modifyStage('def',   +1);
          attacker.modifyStage('spatk', +1);
          attacker.modifyStage('spdef', +1);
          attacker.modifyStage('spd',   +1);
          say(`${attName}'s stats all rose!`);
        }
        break;
      }

      // ── Tailwind: double Speed 4 turns ───────────────────────────────────────
      case 'double_spd_4turns': {
        const pv = this._pvOf(attacker);
        if (pv.tailwindTurns > 0) { say(`But it failed!`); break; }
        pv.tailwindTurns = 4;
        say(`The tailwind blew from behind ${attName}'s team!`);
        break;
      }

      // ── Fell Stinger / Rage: on-damage stat raises already handled in _applyMove
      case 'raise_atk3_on_ko':
      case 'raise_atk_on_hit':
        break;

      // ── Self-lowering stat moves ───────────────────────────────────────────
      case 'lower_def_spdef_self': {
        attacker.modifyStage('def',   -1);
        attacker.modifyStage('spdef', -1);
        say(`${attName}'s Defense and Sp. Def fell!`);
        break;
      }
      case 'lower_atk_def_self': {
        attacker.modifyStage('atk', -1);
        attacker.modifyStage('def', -1);
        say(`${attName}'s Attack and Defense fell!`);
        break;
      }
      case 'lower_spatk2_self': {
        attacker.modifyStage('spatk', -2);
        say(`${attName}'s Sp. Atk sharply fell!`);
        break;
      }
      case 'spd_down_self': {
        attacker.modifyStage('spd', -1);
        say(`${attName}'s Speed fell!`);
        break;
      }

      // ── Additional chance status effects ──────────────────────────────────
      case 'burn_30pct': tryStatus('burn', 0.30, 'burned'); break;
      case 'lower_spatk_30pct': { if(Math.random()<0.30){ const d=modifyDefenderStage('spatk',-1); if(d) say(`${defName}'s Sp. Atk fell!`); else say(`${defName}'s Sp. Atk won't go any lower!`); } break; }

      // ── Wake-Up Slap: cure sleep after hit ────────────────────────────────
      case 'double_if_asleep': {
        if (defender.status === 'sleep') {
          defender.clearStatus();
          say(`${defName} woke up!`);
        }
        break;
      }

      // ── Dream Eater: drain only if asleep (power already handled, drain here)
      case 'drain_half_if_asleep': {
        if (defender.status === 'sleep') {
          const drained = Math.floor(damage / 2);
          attacker.heal(drained);
          say(`${attName} absorbed ${drained} HP!`);
          snap();
        } else {
          say(`But it failed! ${defName} isn't asleep!`);
        }
        break;
      }

      // ── Flavour / no-op ───────────────────────────────────────────────────
      case 'splash':  say(`But nothing happened!`); break;
      case 'pay_day': say(`Coins scattered everywhere!`); break;

      // ── Self-cure status ──────────────────────────────────────────────────
      case 'self_cure_status': {
        if (!attacker.status) { say(`But it failed!`); break; }
        const cured = attacker.status;
        attacker.clearStatus();
        say(`${attName} cured its ${cured}!`);
        break;
      }

      // ── Shell Smash ───────────────────────────────────────────────────────
      case 'shell_smash': {
        attacker.modifyStage('def',   -1);
        attacker.modifyStage('spdef', -1);
        attacker.modifyStage('atk',   +2);
        attacker.modifyStage('spatk', +2);
        attacker.modifyStage('spd',   +2);
        say(`${attName} broke its shell!`);
        break;
      }

      // ── Belly Drum ────────────────────────────────────────────────────────
      case 'belly_drum': {
        if (attacker.hp <= Math.floor(attacker.maxHp / 2)) {
          say(`But it failed! ${attName} doesn't have enough HP!`);
          break;
        }
        attacker.takeDamage(Math.floor(attacker.maxHp / 2));
        // Force ATK to +6
        attacker._stages.atk = 6;
        say(`${attName} cut its own HP and maximised its Attack!`);
        snap();
        break;
      }

      // ── Pain Split ────────────────────────────────────────────────────────
      case 'pain_split': {
        const avg = Math.floor((attacker.hp + defender.hp) / 2);
        attacker._currentHp  = Math.min(avg, attacker.maxHp);
        defender._currentHp  = Math.min(avg, defender.maxHp);
        say(`The battlers shared their pain!`);
        snap();
        break;
      }

      // ── Recharge turn ─────────────────────────────────────────────────────
      case 'recharge_turn': {
        this._pvOf(attacker).rechargeTurn = true;
        break;
      }

      // ── User faints (Explosion / Self-Destruct) ───────────────────────────
      // Damage already dealt in _applyMove; just faint the attacker here
      case 'user_faints': {
        attacker.takeDamage(attacker.hp);
        snap();
        break;
      }

      // ── Reset only target stages (Clear Smog) ─────────────────────────────
      case 'reset_target_stages': {
        defender.resetStages();
        say(`All of ${defName}'s stat changes were eliminated!`);
        break;
      }

      // ── Sun / Hail weather ────────────────────────────────────────────────
      case 'sun_weather': {
        if (this._weather === 'sun') { say(`But it failed!`); break; }
        this._weather = 'sun'; this._weatherTurns = 5;
        say(`The sunlight turned harsh!`);
        break;
      }
      case 'hail_weather': {
        if (this._weather === 'hail') { say(`But it failed!`); break; }
        this._weather = 'hail'; this._weatherTurns = 5;
        say(`It started to hail!`);
        break;
      }

      // ── Psych Up ─────────────────────────────────────────────────────────
      case 'psych_up': {
        const foeStages = defender.stages; // getter returns a copy
        for (const stat of Object.keys(attacker._stages)) {
          attacker._stages[stat] = foeStages[stat] ?? 0;
        }
        say(`${attName} copied ${defName}'s stat changes!`);
        break;
      }

      // ── Raise random stat (Acupressure) ───────────────────────────────────
      case 'raise_random_stat2': {
        const stats = ['atk','def','spatk','spdef','spd','accuracy','evasion'];
        const eligible = stats.filter(s => attacker._stages[s] < 6);
        if (!eligible.length) { say(`But it failed!`); break; }
        const stat = eligible[Math.floor(Math.random() * eligible.length)];
        attacker.modifyStage(stat, +2);
        say(`${attName}'s ${stat} sharply rose!`);
        break;
      }

      // ── Lock 2-3 turns then confuse (Thrash / Outrage / Petal Dance) ──────────
      case 'lock_2to3turns_confuse': {
        const pv = this._pvOf(attacker);
        if (pv.lockTurns === 0) {
          // First use: set the lock
          pv.lockMove = move.moveId;
          pv.lockTurns = 2 + Math.floor(Math.random() * 2); // 2 or 3
        }
        // Damage is handled normally; lock tick + confuse handled in _applyMove post-damage
        break;
      }

      // ── Substitute ───────────────────────────────────────────────────────────
      case 'substitute': {
        const pv = this._pvOf(attacker);
        if (pv.substituteHp > 0) { say(`${attName} already has a substitute!`); break; }
        const cost = Math.floor(attacker.maxHp / 4);
        if (attacker.hp <= cost) { say(`${attName} doesn't have enough HP to make a substitute!`); break; }
        attacker.takeDamage(cost);
        pv.substituteHp = cost;
        say(`${attName} made a substitute!`);
        snap();
        break;
      }

      // ── Counter ───────────────────────────────────────────────────────────────
      case 'counter': {
        const pv = this._pvOf(attacker);
        if (!pv.lastPhysDmg) { say(`But it failed!`); break; }
        const dmg = pv.lastPhysDmg * 2;
        defender.takeDamage(dmg);
        say(`${attName} struck back with double the pain!`);
        snap();
        break;
      }

      // ── Mirror Coat ───────────────────────────────────────────────────────────
      case 'mirror_coat': {
        const pv = this._pvOf(attacker);
        if (!pv.lastSpclDmg) { say(`But it failed!`); break; }
        const dmg = pv.lastSpclDmg * 2;
        defender.takeDamage(dmg);
        say(`${attName} reflected the attack back!`);
        snap();
        break;
      }

      // ── Reversal / Flail ──────────────────────────────────────────────────────
      // (power already handled in variable power block; effect is a no-op here)
      case 'reversal': break;

      // ── Punishment ────────────────────────────────────────────────────────────
      // (power handled in variable power block; no secondary effect)

      // ── Synchronoise ─────────────────────────────────────────────────────────
      // (type check handled pre-damage; no secondary effect)

      // ── Perish Song ───────────────────────────────────────────────────────────
      case 'perish_song': {
        let triggered = false;
        for (const target of [attacker, defender]) {
          const tPv = this._pvOf(target);
          const tName = target === this._playerPokemon ? this._playerPokemon.name : this._enemyPokemon.name;
          if (tPv.perishCount === 0) {
            tPv.perishCount = 3;
            triggered = true;
          }
        }
        if (triggered) say(`Both Pokémon will faint after 3 turns!`);
        else say(`But it failed!`);
        break;
      }

      // ── Destiny Bond ─────────────────────────────────────────────────────────
      case 'destiny_bond': {
        const pv = this._pvOf(attacker);
        pv.destinyBond = true;
        say(`${attName} is trying to take its foe down with it!`);
        break;
      }

      // ── Curse ─────────────────────────────────────────────────────────────────
      case 'curse': {
        if (attacker.types.includes('ghost')) {
          // Ghost-type Curse: pay 50% HP, inflict curse chip on foe
          const cost = Math.floor(attacker.maxHp / 2);
          if (attacker.hp <= cost) { say(`But it failed!`); break; }
          const defPvCurse = this._pvOf(defender);
          if (defPvCurse.cursed) { say(`But it failed!`); break; }
          attacker.takeDamage(cost);
          defPvCurse.cursed = true;
          say(`${attName} cut its own HP and laid a curse on ${defName}!`);
          snap();
        } else {
          // Non-Ghost: +1 ATK, +1 DEF, -1 Spd
          attacker.modifyStage('atk', +1);
          attacker.modifyStage('def', +1);
          attacker.modifyStage('spd', -1);
          say(`${attName} boosted its Attack and Defense!`);
        }
        break;
      }

      // ── Encore ────────────────────────────────────────────────────────────────
      case 'force_repeat': {
        const defPvEnc = this._pvOf(defender);
        if (defPvEnc.encoreTurns > 0) { say(`But it failed!`); break; }
        // Find defender's last used move — approximate: first move with PP < maxPP, else random
        const lastUsed = defender.moves.find(m => m.pp < m.maxPp) ?? defender.moves[0];
        if (!lastUsed) { say(`But it failed!`); break; }
        defPvEnc.encoreMove  = lastUsed.moveId;
        defPvEnc.encoreTurns = 3;
        say(`${defName} got an encore!`);
        break;
      }

      // ── Metronome ─────────────────────────────────────────────────────────────
      case 'random_move': {
        const allMoveIds = Object.keys(this._moveDefs).filter(id => {
          const m = this._moveDefs[id];
          // Exclude metronome itself and a few uncallable moves
          return id !== 'metronome' && m.effect !== 'random_move'
            && id !== 'struggle' && id !== 'transform';
        });
        const randId  = allMoveIds[Math.floor(Math.random() * allMoveIds.length)];
        const randDef = this._moveDefs[randId];
        say(`${attName} used Metronome and called ${randDef.name}!`);
        // Build a temporary move object and execute it
        const tempMove = {
          moveId:   randId,
          name:     randDef.name,
          type:     randDef.type,
          power:    randDef.power,
          accuracy: randDef.accuracy,
          pp:       randDef.pp,
          maxPp:    randDef.pp,
          category: randDef.category,
          effect:   randDef.effect ?? null,
        };
        this._applyMove(tempMove, attacker, defender, log, say, snap);
        break;
      }

      // ── Transform ─────────────────────────────────────────────────────────────
      case 'transform': {
        const srcSpecies = this._pokemonDefs[defender.speciesId];
        if (!srcSpecies) { say(`But it failed!`); break; }
        // Copy species data onto attacker (volatile — not serialised)
        attacker._transformedFrom = {
          speciesId: attacker._speciesId,
          species:   attacker._species,
          stats:     { ...attacker._stats },
        };
        attacker._speciesId = defender._speciesId;
        attacker._species   = srcSpecies;
        attacker._stats     = { ...defender._stats };
        // Copy moves with 5 PP each
        attacker._moves = defender._moves.map(m => m ? { ...m, pp: 5, maxPp: 5 } : null).filter(Boolean);
        // Copy stages
        for (const stat of Object.keys(attacker._stages)) {
          attacker._stages[stat] = defender._stages[stat] ?? 0;
        }
        say(`${attName} transformed into ${defender.name}!`);
        break;
      }

      // ── Tri Attack ────────────────────────────────────────────────────────────
      case 'tri_attack': {
        if (!defender.status && Math.random() < 0.20) {
          const pick = Math.random();
          if (pick < 0.333) {
            tryStatus('burn',      1.0, 'burned');
          } else if (pick < 0.666) {
            tryStatus('freeze',    1.0, 'frozen solid');
          } else {
            tryStatus('paralysis', 1.0, 'paralyzed');
          }
        }
        break;
      }

      // ── Memento ───────────────────────────────────────────────────────────────
      case 'memento': {
        modifyDefenderStage('atk',   -2);
        modifyDefenderStage('spatk', -2);
        say(`${defName}'s Attack and Sp. Atk sharply fell!`);
        attacker.takeDamage(attacker.hp);
        snap();
        break;
      }

      // ── Healing Wish ──────────────────────────────────────────────────────────
      case 'healing_wish': {
        // User faints; store flag so next ally is fully healed on switch-in
        // In wild 1v1 there's no next ally, so just faint the user
        attacker.takeDamage(attacker.hp);
        this._healingWishPending = true;
        say(`${attName} sacrificed its HP for its team!`);
        snap();
        break;
      }

      // ── Baton Pass ───────────────────────────────────────────────────────────
      case 'baton_pass': {
        // In wild 1v1, baton pass just switches out without passing anything useful.
        // Store stages to copy to next pokemon on FAINTED resolution.
        this._batonPassStages  = { ...attacker._stages };
        this._batonPassPv      = {
          aquaRing: this._pvOf(attacker).aquaRing,
          ingrain:  this._pvOf(attacker).ingrain,
          substituteHp: this._pvOf(attacker).substituteHp,
        };
        attacker.takeDamage(attacker.hp); // force the switch by fainting slot (UI handles swap)
        say(`${attName} passed the baton!`);
        snap();
        break;
      }

      // ── Stockpile / Spit Up / Swallow ─────────────────────────────────────────
      case 'stockpile': {
        const pv = this._pvOf(attacker);
        if (pv.stockpile >= 3) { say(`${attName} can't stockpile any more!`); break; }
        pv.stockpile++;
        attacker.modifyStage('def',   +1);
        attacker.modifyStage('spdef', +1);
        say(`${attName} stockpiled ${pv.stockpile}!`);
        break;
      }
      case 'power_by_stockpile': {
        // Spit Up — power already set in moves.json as 1; real power = 100 * stockpile
        // handled as a damage move so this just clears stockpile
        const pv = this._pvOf(attacker);
        if (!pv.stockpile) { say(`But it failed! There's nothing to spit up!`); break; }
        pv.stockpile = 0;
        break;
      }
      case 'heal_by_stockpile': {
        // Swallow
        const pv = this._pvOf(attacker);
        if (!pv.stockpile) { say(`But it failed! There's nothing to swallow!`); break; }
        const healFrac = pv.stockpile === 1 ? 0.25 : pv.stockpile === 2 ? 0.50 : 1.0;
        attacker.heal(Math.floor(attacker.maxHp * healFrac));
        pv.stockpile = 0;
        say(`${attName} swallowed and restored HP!`);
        snap();
        break;
      }

      // ── Force Switch (Roar / Whirlwind / Dragon Tail) ─────────────────────────
      case 'force_switch': {
        // In wild battles: end battle without EXP (phasing)
        this._phase = PHASE.FLED;
        say(`${defName} was blown away!`);
        this._applyBattleEndAbilities();
        this._emit({ type: 'flee_result', fled: true, forced: true, log, phase: PHASE.FLED });
        return;
      }

      // ── Use Def not SpDef (Psystrike) ─────────────────────────────────────────
      // Power calc already handled above; no secondary effect needed here
      case 'use_def_not_spdef': break;

      // ── Retaliate ─────────────────────────────────────────────────────────────
      // Power handled in variable power block; no secondary effect
      // ── Synchronoise ─────────────────────────────────────────────────────────
      // Type check pre-damage; no secondary effect

      // ── Aqua Ring ─────────────────────────────────────────────────────────────
      case 'aqua_ring': {
        const pv = this._pvOf(attacker);
        if (pv.aquaRing) { say(`But it failed!`); break; }
        pv.aquaRing = true;
        say(`${attName} surrounded itself with a veil of water!`);
        break;
      }

      // ── Ingrain ───────────────────────────────────────────────────────────────
      case 'ingrain': {
        const pv = this._pvOf(attacker);
        if (pv.ingrain) { say(`But it failed!`); break; }
        pv.ingrain = true;
        say(`${attName} planted its roots!`);
        break;
      }

      // ── Endure ────────────────────────────────────────────────────────────────
      case 'endure': {
        const pv = this._pvOf(attacker);
        pv.enduring = true;
        say(`${attName} braced itself!`);
        break;
      }

      // ── Nightmare ─────────────────────────────────────────────────────────────
      case 'nightmare': {
        if (defender.status !== 'sleep') { say(`But it failed! ${defName} isn't asleep!`); break; }
        const pv = this._pvOf(defender);
        if (pv.nightmare) { say(`But it failed!`); break; }
        pv.nightmare = true;
        say(`${defName} began having a nightmare!`);
        break;
      }

      // ── Uproar ────────────────────────────────────────────────────────────────
      case 'uproar': {
        const pv = this._pvOf(attacker);
        if (pv.uproar === 0) {
          pv.uproar = 3;
          say(`${attName} caused an uproar!`);
        }
        break;
      }

      // ── Teleport (flee) ───────────────────────────────────────────────────────
      case 'flee': {
        const log2 = [], say2 = t => log2.push({ type: 'text', text: t });
        say2(`${attName} teleported away!`);
        this._phase = PHASE.FLED;
        this._applyBattleEndAbilities();
        this._emit({ type: 'flee_result', fled: true, log: [...log, ...log2], phase: PHASE.FLED });
        return;
      }

      default: break;
    }
  }

  // ── End-of-turn status damage ─────────────────────────────────────────────

  _applyEndOfTurnStatus(pokemon, log, say, snap) {
    const name  = pokemon === this._playerPokemon ? this._playerPokemon.name : this._enemyPokemon.name;
    const other = pokemon === this._playerPokemon ? this._enemyPokemon : this._playerPokemon;
    const pv    = this._pvOf(pokemon);

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
      let dmg;
      if (pv.toxicCounter > 0) {
        // Badly poisoned (Toxic): damage scales 1/16, 2/16, 3/16… each turn
        dmg = Math.max(1, Math.floor(pokemon.maxHp * pv.toxicCounter / 16));
        pv.toxicCounter = Math.min(pv.toxicCounter + 1, 15);
        say(`${name} is hurt by the poison!`);
      } else {
        dmg = Math.max(1, Math.floor(pokemon.maxHp / 8));
        say(`${name} is hurt by poison!`);
      }
      pokemon.takeDamage(dmg);
      snap();
    }

    // Leech Seed drain (1/8 max HP, healed to the other side)
    if (pv.leeched && !pokemon.isFainted) {
      const drain = Math.max(1, Math.floor(pokemon.maxHp / 8));
      pokemon.takeDamage(drain);
      other.heal(drain);
      say(`${name}'s HP was sapped by Leech Seed!`);
      snap();
    }

    // Aqua Ring / Ingrain: heal 1/16 max HP per turn
    if (pv.aquaRing && !pokemon.isFainted) {
      const heal = Math.max(1, Math.floor(pokemon.maxHp / 16));
      pokemon.heal(heal);
      say(`${name} restored a little HP using its aqua ring!`);
      snap();
    }
    if (pv.ingrain && !pokemon.isFainted) {
      const heal = Math.max(1, Math.floor(pokemon.maxHp / 16));
      pokemon.heal(heal);
      say(`${name} absorbed nutrients with its roots!`);
      snap();
    }

    // Nightmare: lose 1/4 max HP while asleep
    if (pv.nightmare) {
      if (pokemon.status !== 'sleep') {
        pv.nightmare = false; // woke up — nightmare ends
      } else {
        const dmg = Math.max(1, Math.floor(pokemon.maxHp / 4));
        pokemon.takeDamage(dmg);
        say(`${name} is locked in a nightmare!`);
        snap();
      }
    }

    // Uproar: tick down, prevent sleep for both sides
    if (pv.uproar > 0) {
      pv.uproar--;
      // Wake up anyone sleeping due to uproar
      if (pokemon.status === 'sleep') {
        pokemon.clearStatus();
        say(`${name} woke up in the uproar!`);
      }
      if (pv.uproar === 0) say(`${name} calmed down.`);
    }

    // Curse chip (Ghost-type curse): 1/4 max HP per turn
    if (pv.cursed && !pokemon.isFainted) {
      const dmg = Math.max(1, Math.floor(pokemon.maxHp / 4));
      pokemon.takeDamage(dmg);
      say(`${name} is afflicted by the curse!`);
      snap();
    }

    // Trap chip (1/8 max HP per turn)
    if (pv.trapped > 0 && pv.trapped < 999) {
      pv.trapped--;
      const chip = Math.max(1, Math.floor(pokemon.maxHp / 8));
      pokemon.takeDamage(chip);
      say(`${name} is hurt by the trap!`);
      snap();
      if (pv.trapped === 0) say(`${name} was freed from the trap!`);
    }

    // Weather chip: sandstorm hurts non-Rock/Ground/Steel; hail hurts non-Ice
    if (this._weather === 'sandstorm') {
      const immune = pokemon.types.some(t => ['rock','ground','steel'].includes(t));
      if (!immune) {
        const chip = Math.max(1, Math.floor(pokemon.maxHp / 16));
        pokemon.takeDamage(chip);
        say(`${name} is buffeted by the sandstorm!`);
        snap();
      }
    } else if (this._weather === 'hail') {
      const immune = pokemon.types.includes('ice');
      if (!immune) {
        const chip = Math.max(1, Math.floor(pokemon.maxHp / 16));
        pokemon.takeDamage(chip);
        say(`${name} is buffeted by the hail!`);
        snap();
      }
    }
  }

  // ── Per-turn reset/tick (called once after all moves resolve) ─────────────

  _tickTurnState(log, say) {
    // Clear protect flags
    this._pv.player.protecting = false;
    this._pv.enemy.protecting  = false;

    // Tick weather
    if (this._weatherTurns > 0) {
      this._weatherTurns--;
      if (this._weatherTurns === 0) {
        const msg = this._weather === 'rain'       ? 'The rain stopped.'
                  : this._weather === 'sandstorm'  ? 'The sandstorm subsided.'
                  : this._weather === 'hail'       ? 'The hail stopped.'
                  : this._weather === 'sun'        ? 'The sunlight faded.'
                  : null;
        if (msg) say(msg);
        this._weather = null;
      }
    }

    // Tick screens
    if (this._screens) {
      for (const side of ['player', 'enemy']) {
        if (!this._screens[side]) continue;
        for (const screen of ['reflect', 'lightScreen', 'safeguard', 'mist']) {
          if (this._screens[side][screen] > 0) this._screens[side][screen]--;
        }
      }
    }

    // Tick encore
    for (const side of ['player', 'enemy']) {
      const pv = this._pv[side];
      if (pv.encoreTurns > 0) {
        pv.encoreTurns--;
        if (pv.encoreTurns === 0) pv.encoreMove = null;
      }
    }

    // Tick perish song
    for (const side of ['player', 'enemy']) {
      const pv = this._pv[side];
      if (pv.perishCount > 0) {
        pv.perishCount--;
        const pokemon = side === 'player' ? this._playerPokemon : this._enemyPokemon;
        const name    = side === 'player' ? this._playerPokemon.name : this._enemyPokemon.name;
        if (pv.perishCount === 0) {
          pokemon.takeDamage(pokemon.hp);
          say(`${name} fainted due to Perish Song!`);
        } else {
          say(`${name}'s Perish count fell to ${pv.perishCount}!`);
        }
      }
    }

    // Clear destiny bond at end of turn (only lasts one turn)
    this._pv.player.destinyBond = false;
    this._pv.enemy.destinyBond  = false;

    // Track whether an ally fainted this turn (for Retaliate)
    // In wild 1v1: player ally = enemy fainted. Set on the surviving side.
    this._pv.player.allyFaintedLastTurn = this._enemyPokemon.isFainted;
    this._pv.enemy.allyFaintedLastTurn  = this._playerPokemon.isFainted;

    // Tick tailwind
    for (const side of ['player', 'enemy']) {
      if (this._pv[side].tailwindTurns > 0) {
        this._pv[side].tailwindTurns--;
        if (this._pv[side].tailwindTurns === 0) {
          const name = side === 'player' ? this._playerPokemon.name : this._enemyPokemon.name;
          say(`The tailwind petered out for ${name}'s team!`);
        }
      }
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

  // ── Side helpers ──────────────────────────────────────────────────────────

  /** Returns 'player' or 'enemy' for a given PokemonInstance. */
  _sideOf(pokemon) {
    return pokemon === this._playerPokemon ? 'player' : 'enemy';
  }

  /** Returns the volatile-flags object for a pokemon. */
  _pvOf(pokemon) {
    return this._pv[this._sideOf(pokemon)];
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
