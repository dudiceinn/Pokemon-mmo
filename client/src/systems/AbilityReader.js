/**
 * AbilityReader.js
 * client/src/systems/AbilityReader.js
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH for all ability behaviour.
 *
 * To add a new ability:
 *   1. Add an entry to ABILITIES below — that's it.
 *   2. BattleState, PokemonInstance, and BattleUI all read from here.
 *
 * Entry shape:
 * {
 *   name:        string         — Display name
 *   desc:        string         — Tooltip description shown in UI
 *
 *   atkBoost?: {
 *     type:      string         — Move type boosted
 *     mult:      number         — Multiplier (e.g. 1.5)
 *     condition: 'low_hp'       — 'low_hp' | 'always' | 'flag'
 *               |'always'         (flag = reads attacker._flashFireActive)
 *               |'flag'
 *   }
 *   defMult?: {
 *     type:  string | string[]  — Move type(s) affected
 *     mult:  number             — 0 = immune, 0.5 = halved
 *     onAbsorb?: (defender) => void
 *   }
 *   statMult?: {
 *     stat:      string         — Stat key ('atk', etc.)
 *     mult:      number
 *     condition: 'has_status'
 *   }
 *   suppressBurnAtkPenalty?: true  — Guts: burn does not halve ATK
 *
 *   onEntry?:      (self, foe, say) => void
 *   onContact?:    (attacker, bearer, say) => void
 *   onEndOfTurn?:  (pokemon, name, say, snap) => boolean  // true = suppress status dmg
 *   onBattleEnd?:  (pokemon) => void
 *
 *   blocksStatus?:    string | string[]
 *   blocksFlinch?:    true
 *   blocksConfusion?: true
 *   blocksRecoil?:    true
 *
 *   isActive: (pokemon) => boolean
 * }
 * ─────────────────────────────────────────────────────────────────────────────
 */

const LOW_HP = (p) => p.hp / p.maxHp <= 0.33;

function tryInflict(target, status, chance, message, say) {
  if (target.status) return;
  if (Math.random() < chance) {
    target.setStatus(status);
    say(message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ABILITY DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export const ABILITIES = {

  // ── Starter low-HP boosts ─────────────────────────────────────────────────

  overgrow: {
    name: 'Overgrow',
    desc: 'Powers up Grass-type moves by 50% when HP is at or below 1/3.',
    atkBoost: { type: 'grass', mult: 1.5, condition: 'low_hp' },
    isActive: LOW_HP,
  },

  blaze: {
    name: 'Blaze',
    desc: 'Powers up Fire-type moves by 50% when HP is at or below 1/3.',
    atkBoost: { type: 'fire', mult: 1.5, condition: 'low_hp' },
    isActive: LOW_HP,
  },

  torrent: {
    name: 'Torrent',
    desc: 'Powers up Water-type moves by 50% when HP is at or below 1/3.',
    atkBoost: { type: 'water', mult: 1.5, condition: 'low_hp' },
    isActive: LOW_HP,
  },

  swarm: {
    name: 'Swarm',
    desc: 'Powers up Bug-type moves by 50% when HP is at or below 1/3.',
    atkBoost: { type: 'bug', mult: 1.5, condition: 'low_hp' },
    isActive: LOW_HP,
  },

  // ── Entry abilities ───────────────────────────────────────────────────────

  intimidate: {
    name: 'Intimidate',
    desc: "Lowers the opponent's Attack by one stage when entering battle.",
    onEntry: (self, foe, say) => {
      foe.modifyStage('atk', -1);
      say(`${self.name}'s Intimidate lowered ${foe.name}'s Attack!`);
    },
    isActive: () => true,
  },

  pressure: {
    name: 'Pressure',
    desc: 'Forces opponents to use 2 PP per move instead of 1.',
    onEntry: (self, _foe, say) => {
      say(`${self.name} is exerting its Pressure!`);
    },
    isActive: () => true,
  },

  trace: {
    name: 'Trace',
    desc: "Copies the opponent's ability when entering battle.",
    onEntry: (self, foe, say) => {
      if (foe.ability && foe.ability !== 'trace') {
        self._ability = foe.ability;
        say(`${self.name} traced ${foe.name}'s ${foe.ability.replace(/_/g, ' ')}!`);
      }
    },
    isActive: () => true,
  },

  // ── Immunity / absorption ─────────────────────────────────────────────────

  levitate: {
    name: 'Levitate',
    desc: 'Grants immunity to Ground-type moves.',
    defMult: { type: 'ground', mult: 0 },
    isActive: () => true,
  },

  flash_fire: {
    name: 'Flash Fire',
    desc: 'Immune to Fire-type moves. After absorbing one, Fire-type moves deal 50% more damage.',
    defMult: {
      type: 'fire',
      mult: 0,
      onAbsorb: (defender) => { defender._flashFireActive = true; },
    },
    atkBoost: { type: 'fire', mult: 1.5, condition: 'flag' },
    isActive: () => true,
  },

  water_absorb: {
    name: 'Water Absorb',
    desc: 'Immune to Water-type moves. Restores HP when hit by one.',
    defMult: { type: 'water', mult: 0 },
    isActive: () => true,
  },

  volt_absorb: {
    name: 'Volt Absorb',
    desc: 'Immune to Electric-type moves. Restores HP when hit by one.',
    defMult: { type: 'electric', mult: 0 },
    isActive: () => true,
  },

  lightning_rod: {
    name: 'Lightning Rod',
    desc: 'Draws in and nullifies Electric-type moves.',
    defMult: { type: 'electric', mult: 0 },
    isActive: () => true,
  },

  thick_fat: {
    name: 'Thick Fat',
    desc: 'Reduces damage from Fire- and Ice-type moves by 50%.',
    defMult: { type: ['fire', 'ice'], mult: 0.5 },
    isActive: () => true,
  },

  // ── Contact abilities ─────────────────────────────────────────────────────

  static: {
    name: 'Static',
    desc: '30% chance to paralyze the attacker on contact.',
    onContact: (attacker, bearer, say) => {
      tryInflict(attacker, 'paralysis', 0.30,
        `${attacker.name} was paralyzed by ${bearer.name}'s Static!`, say);
    },
    isActive: () => true,
  },

  poison_point: {
    name: 'Poison Point',
    desc: '30% chance to poison the attacker on contact.',
    onContact: (attacker, bearer, say) => {
      tryInflict(attacker, 'poison', 0.30,
        `${attacker.name} was poisoned by ${bearer.name}'s Poison Point!`, say);
    },
    isActive: () => true,
  },

  flame_body: {
    name: 'Flame Body',
    desc: '30% chance to burn the attacker on contact.',
    onContact: (attacker, bearer, say) => {
      tryInflict(attacker, 'burn', 0.30,
        `${attacker.name} was burned by ${bearer.name}'s Flame Body!`, say);
    },
    isActive: () => true,
  },

  effect_spore: {
    name: 'Effect Spore',
    desc: '30% chance to inflict paralysis, poison, or sleep on contact.',
    onContact: (attacker, bearer, say) => {
      if (attacker.status || Math.random() >= 0.30) return;
      const roll = Math.random();
      if      (roll < 0.33) { attacker.setStatus('paralysis'); say(`${attacker.name} was paralyzed by ${bearer.name}'s Effect Spore!`); }
      else if (roll < 0.66) { attacker.setStatus('poison');    say(`${attacker.name} was poisoned by ${bearer.name}'s Effect Spore!`); }
      else                  { attacker.setStatus('sleep');     say(`${attacker.name} fell asleep from ${bearer.name}'s Effect Spore!`); }
    },
    isActive: () => true,
  },

  // ── Stat modifier abilities ───────────────────────────────────────────────

  guts: {
    name: 'Guts',
    desc: 'Boosts Attack by 50% when afflicted with a status condition. Burn no longer halves Attack.',
    statMult: { stat: 'atk', mult: 1.5, condition: 'has_status' },
    suppressBurnAtkPenalty: true,
    isActive: (p) => !!p.status,
  },

  // ── Status immunity ───────────────────────────────────────────────────────

  insomnia: {
    name: 'Insomnia',
    desc: 'Prevents the Pokémon from falling asleep.',
    blocksStatus: 'sleep',
    isActive: () => true,
  },

  vital_spirit: {
    name: 'Vital Spirit',
    desc: 'Prevents the Pokémon from falling asleep.',
    blocksStatus: 'sleep',
    isActive: () => true,
  },

  limber: {
    name: 'Limber',
    desc: 'Prevents the Pokémon from being paralyzed.',
    blocksStatus: 'paralysis',
    isActive: () => true,
  },

  // ── Flinch / confusion immunity ───────────────────────────────────────────

  inner_focus: {
    name: 'Inner Focus',
    desc: 'Prevents this Pokémon from flinching.',
    blocksFlinch: true,
    isActive: () => true,
  },

  oblivious: {
    name: 'Oblivious',
    desc: 'Prevents confusion and infatuation.',
    blocksConfusion: true,
    isActive: () => true,
  },

  own_tempo: {
    name: 'Own Tempo',
    desc: 'Prevents the Pokémon from becoming confused.',
    blocksConfusion: true,
    isActive: () => true,
  },

  // ── Status reflection ─────────────────────────────────────────────────────

  synchronize: {
    name: 'Synchronize',
    desc: 'Passes burn, poison, or paralysis back to the Pokémon that inflicted it.',
    isActive: () => true,
  },

  // ── End-of-turn abilities ─────────────────────────────────────────────────

  shed_skin: {
    name: 'Shed Skin',
    desc: '33% chance to heal any status condition at the end of each turn.',
    onEndOfTurn: (pokemon, name, say) => {
      if (!pokemon.status) return false;
      if (Math.random() < 0.33) {
        pokemon.clearStatus();
        say(`${name}'s Shed Skin cured its status!`);
        return true;
      }
      return false;
    },
    isActive: (p) => !!p.status,
  },

  // ── Battle-end abilities ──────────────────────────────────────────────────

  natural_cure: {
    name: 'Natural Cure',
    desc: 'All status conditions heal when the Pokémon is withdrawn from battle.',
    onBattleEnd: (pokemon) => {
      if (pokemon.status) pokemon.clearStatus();
    },
    isActive: () => true,
  },

  // ── Recoil immunity ───────────────────────────────────────────────────────

  rock_head: {
    name: 'Rock Head',
    desc: 'Protects the Pokémon from recoil damage.',
    blocksRecoil: true,
    isActive: () => true,
  },

  // ── Not yet fully implemented ─────────────────────────────────────────────

  shield_dust: {
    name: 'Shield Dust',
    desc: 'Blocks the secondary effects of moves (status, stat drops, flinching).',
    isActive: () => true,
  },

  compound_eyes: {
    name: 'Compound Eyes',
    desc: 'Boosts the accuracy of moves by 30%.',
    isActive: () => true,
  },

  keen_eye: {
    name: 'Keen Eye',
    desc: "Prevents accuracy from being lowered. Ignores the opponent's evasion boosts.",
    isActive: () => true,
  },

  hyper_cutter: {
    name: 'Hyper Cutter',
    desc: "Prevents the Attack stat from being lowered by the opponent.",
    isActive: () => true,
  },

  clear_body: {
    name: 'Clear Body',
    desc: "Prevents other Pokémon from lowering this Pokémon's stats.",
    isActive: () => true,
  },

  shell_armor: {
    name: 'Shell Armor',
    desc: 'Prevents the Pokémon from receiving critical hits.',
    isActive: () => true,
  },

  early_bird: {
    name: 'Early Bird',
    desc: 'Wakes up from sleep in half the usual number of turns.',
    isActive: () => true,
  },

  damp: {
    name: 'Damp',
    desc: 'Prevents the use of self-destructing moves like Explosion.',
    isActive: () => true,
  },

  magnet_pull: {
    name: 'Magnet Pull',
    desc: 'Prevents Steel-type Pokémon from fleeing or being switched out.',
    isActive: () => true,
  },

  soundproof: {
    name: 'Soundproof',
    desc: 'Grants immunity to sound-based moves.',
    isActive: () => true,
  },

  swift_swim: {
    name: 'Swift Swim',
    desc: 'Doubles Speed in rain.',
    isActive: () => false,
  },

  chlorophyll: {
    name: 'Chlorophyll',
    desc: 'Doubles Speed in harsh sunlight.',
    isActive: () => false,
  },

  sand_veil: {
    name: 'Sand Veil',
    desc: 'Boosts evasion by 20% during a sandstorm.',
    isActive: () => false,
  },

  run_away: {
    name: 'Run Away',
    desc: 'Guarantees escape from wild Pokémon battles.',
    isActive: () => true,
  },

  pickup: {
    name: 'Pickup',
    desc: 'May pick up items after battle.',
    isActive: () => true,
  },

  stench: {
    name: 'Stench',
    desc: 'The stench may cause the opponent to flinch (10% chance on contact).',
    isActive: () => true,
  },

  cute_charm: {
    name: 'Cute Charm',
    desc: 'Contact may cause infatuation in the attacker (30% chance).',
    isActive: () => true,
  },

};

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/** Display name for an ability id. */
export function abilityName(abilityId) {
  return ABILITIES[abilityId]?.name
    ?? abilityId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** Short description for an ability id, or null if unknown. */
export function abilityDesc(abilityId) {
  return ABILITIES[abilityId]?.desc ?? null;
}

/** Whether the ability badge should glow in the UI. */
export function isAbilityActive(pokemon) {
  if (!pokemon?.ability) return false;
  const def = ABILITIES[pokemon.ability];
  return def ? def.isActive(pokemon) : false;
}

// ── Entry ─────────────────────────────────────────────────────────────────────

/** Fire onEntry hooks for both sides. Returns log array. */
export function triggerEntryAbilities(playerPokemon, enemyPokemon) {
  const log = [];
  const say = (text) => log.push({ type: 'text', text });
  for (const [self, foe] of [[playerPokemon, enemyPokemon], [enemyPokemon, playerPokemon]]) {
    ABILITIES[self.ability]?.onEntry?.(self, foe, say);
  }
  return log;
}

// ── Damage multipliers ────────────────────────────────────────────────────────

/** Offensive multiplier from attacker's ability. Returns 1.0 if no boost. */
export function abilityAtkMultiplier(attacker, move) {
  const def = ABILITIES[attacker.ability];
  if (!def?.atkBoost) return 1;
  const { type, mult, condition } = def.atkBoost;
  if (move.type !== type) return 1;
  if (condition === 'low_hp' && !LOW_HP(attacker)) return 1;
  if (condition === 'flag'   && !attacker._flashFireActive) return 1;
  return mult;
}

/**
 * Defensive multiplier from defender's ability. Returns 1.0 normally, 0 if immune.
 * Fires onAbsorb side-effect when applicable.
 */
export function abilityDefMultiplier(defender, move) {
  const def = ABILITIES[defender.ability];
  if (!def?.defMult) return 1;
  const types = Array.isArray(def.defMult.type) ? def.defMult.type : [def.defMult.type];
  if (!types.includes(move.type)) return 1;
  if (def.defMult.mult === 0 && def.defMult.onAbsorb) {
    def.defMult.onAbsorb(defender);
  }
  return def.defMult.mult;
}

// ── Contact ───────────────────────────────────────────────────────────────────

/** Fire onContact hook on the bearer after a physical move lands. */
export function triggerContactAbilities(attacker, bearer, say) {
  ABILITIES[bearer.ability]?.onContact?.(attacker, bearer, say);
}

// ── End-of-turn ───────────────────────────────────────────────────────────────

/** Run end-of-turn ability. Returns true if status damage should be suppressed. */
export function triggerEndOfTurnAbility(pokemon, name, say, snap) {
  const def = ABILITIES[pokemon.ability];
  if (!def?.onEndOfTurn) return false;
  return def.onEndOfTurn(pokemon, name, say, snap) ?? false;
}

// ── Battle end ────────────────────────────────────────────────────────────────

/** Run onBattleEnd hook. */
export function triggerBattleEndAbility(pokemon) {
  ABILITIES[pokemon.ability]?.onBattleEnd?.(pokemon);
}

// ── Immunity helpers ──────────────────────────────────────────────────────────

/** Returns true if the ability blocks the given status. */
export function abilityBlocksStatus(pokemon, status) {
  const blocks = ABILITIES[pokemon.ability]?.blocksStatus;
  if (!blocks) return false;
  return Array.isArray(blocks) ? blocks.includes(status) : blocks === status;
}

/** Returns true if the ability blocks flinching. */
export function abilityBlocksFlinch(pokemon) {
  return ABILITIES[pokemon.ability]?.blocksFlinch === true;
}

/** Returns true if the ability blocks confusion. */
export function abilityBlocksConfusion(pokemon) {
  return ABILITIES[pokemon.ability]?.blocksConfusion === true;
}

/** Returns true if the ability blocks recoil damage. */
export function abilityBlocksRecoil(pokemon) {
  return ABILITIES[pokemon.ability]?.blocksRecoil === true;
}

/** Returns true if the ability has Pressure (doubles opponent PP cost). */
export function abilityHasPressure(pokemon) {
  return pokemon.ability === 'pressure';
}

/** Returns true if the ability reflects burn/poison/paralysis back (Synchronize). */
export function abilitySynchronizes(pokemon) {
  return pokemon.ability === 'synchronize';
}

// ── Stat calculation ──────────────────────────────────────────────────────────

/** Stat multiplier from ability for PokemonInstance.effectiveStat(). */
export function abilityStatMultiplier(pokemon, stat) {
  const def = ABILITIES[pokemon.ability];
  if (!def?.statMult) return 1;
  const { stat: targetStat, mult, condition } = def.statMult;
  if (stat !== targetStat) return 1;
  if (condition === 'has_status' && !pokemon.status) return 1;
  return mult;
}

/** Returns true if the ability suppresses the burn ATK penalty (Guts). */
export function abilitySuppressBurnAtkPenalty(pokemon) {
  return ABILITIES[pokemon.ability]?.suppressBurnAtkPenalty === true;
}
