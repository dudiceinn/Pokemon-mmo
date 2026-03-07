# AbilityReader.js — Developer Guide

**File location:** `client/src/systems/AbilityReader.js`

This is the single file you edit to add, change, or remove any Pokémon ability in the game. `BattleState.js`, `BattleUI.js`, and `PokemonStatusWindow.js` all read from it automatically — you never need to touch those files for ability work.

---

## How an Ability Gets from JSON to Battle

Understanding the full pipeline helps when something isn't working.

```
pokemon.json
  └── ability: "overgrow"          ← stored as a plain string ID per species

PokemonInstance.js (constructor)
  └── this._ability = species.ability ?? null   ← copied onto the runtime object
      get ability() { return this._ability; }   ← exposed as a getter

BattleState.js (constructor)
  └── calls triggerEntryAbilities(player, enemy)  ← from AbilityReader
  └── calls abilityAtkMultiplier(attacker, move)  ← from AbilityReader  (each attack)
  └── calls abilityDefMultiplier(defender, move)  ← from AbilityReader  (each attack)
  └── calls triggerContactAbilities(atk, bearer)  ← from AbilityReader  (physical hits)

BattleUI.js / PokemonStatusWindow.js
  └── calls isAbilityActive(pokemon)              ← from AbilityReader  (badge glow)
  └── calls abilityName(pokemon.ability)           ← from AbilityReader  (display text)
```

The ability ID (e.g. `"overgrow"`) is the key that connects everything. It must match exactly between `pokemon.json` and the `ABILITIES` object in `AbilityReader.js`.

---

## Ability Entry Shape

Each entry in the `ABILITIES` object supports these fields:

```js
ability_id: {
  name:       string,           // Display name shown in UI badges
  desc:       string,           // Short description (for tooltips / future use)

  atkBoost?: {                  // Optional — offensive damage multiplier
    type:      string,          // Move type boosted: 'fire', 'grass', 'water', etc.
    mult:      number,          // Damage multiplier (1.5 = 50% more damage)
    condition: 'low_hp'         // 'low_hp'  → only active at or below 33% HP
               | 'always',      // 'always'  → always active
  },

  defMult?: {                   // Optional — defensive damage modifier
    type: string | string[],    // Move type(s) affected (single string or array)
    mult: number,               // 0 = immune, 0.5 = halved, 2 = double damage
  },

  onEntry?: (self, foe, say) => void,
  // Fires when the Pokémon enters battle.
  // self = the ability bearer (PokemonInstance)
  // foe  = the opponent (PokemonInstance)
  // say  = function(text) — adds a line to the battle log

  onContact?: (attacker, bearer, say) => void,
  // Fires when a physical move hits the bearer.
  // attacker = the one who used the move
  // bearer   = the one whose ability triggered
  // say      = function(text) — adds a line to the battle log

  isActive: (pokemon) => boolean,
  // Controls the animated glow on the ability badge in the UI.
  // Return true  → badge glows gold (ability is doing something right now)
  // Return false → badge is dim (passive / condition not met)
}
```

All fields except `name`, `desc`, and `isActive` are optional. An ability only needs the hooks it actually uses.

---

## Adding a New Ability — Step by Step

### 1. Add the ability ID to `pokemon.json`

Find the species entry and set the `ability` field:

```json
"arcanine": {
  "name": "Arcanine",
  "ability": "intimidate",
  ...
}
```

### 2. Add the entry to `ABILITIES` in `AbilityReader.js`

Open `client/src/systems/AbilityReader.js` and add your entry inside the `ABILITIES` object. The key must match the string in `pokemon.json` exactly.

```js
// Example: Speed Boost — raises Speed by 1 stage at the end of each turn
speed_boost: {
  name: 'Speed Boost',
  desc: 'Raises Speed by one stage at the end of each turn.',
  isActive: () => true,
},
```

That's all that's needed for display. To make it do something in battle, add the appropriate hook (see examples below).

### 3. Done

`BattleState` and `BattleUI` will pick it up automatically on the next battle.

---

## Examples

### Low-HP damage boost (Blaze / Overgrow / Torrent pattern)

```js
blaze: {
  name: 'Blaze',
  desc: 'Powers up Fire moves when HP is low.',
  atkBoost: { type: 'fire', mult: 1.5, condition: 'low_hp' },
  isActive: (p) => p.hp / p.maxHp <= 0.33,
},
```

`abilityAtkMultiplier()` checks `condition` automatically — if it's `'low_hp'` and the Pokémon is above 33% HP, it returns `1.0` (no boost). The badge glows when `isActive` returns true, which here is also at ≤33% HP.

---

### Type immunity (Levitate / Water Absorb pattern)

```js
levitate: {
  name: 'Levitate',
  desc: 'Grants immunity to Ground-type moves.',
  defMult: { type: 'ground', mult: 0 },  // 0 = fully immune
  isActive: () => true,                   // always glowing
},
```

To halve damage instead of blocking it entirely, use `mult: 0.5`. To affect multiple types at once, pass an array:

```js
thick_fat: {
  name: 'Thick Fat',
  desc: 'Halves damage from Fire and Ice moves.',
  defMult: { type: ['fire', 'ice'], mult: 0.5 },
  isActive: () => true,
},
```

---

### Entry effect (Intimidate pattern)

```js
intimidate: {
  name: 'Intimidate',
  desc: "Lowers the foe's Attack on entry.",
  onEntry: (self, foe, say) => {
    foe.modifyStage('atk', -1);
    say(`${self.name}'s Intimidate lowered ${foe.name}'s Attack!`);
  },
  isActive: () => true,
},
```

`modifyStage` accepts: `'atk'`, `'def'`, `'spatk'`, `'spdef'`, `'spd'`, `'accuracy'`, `'evasion'`. Positive delta = raise, negative = lower, clamped to ±6.

---

### Contact effect (Static / Flame Body pattern)

```js
static: {
  name: 'Static',
  desc: '30% chance to paralyze on contact.',
  onContact: (attacker, bearer, say) => {
    if (attacker.status || Math.random() >= 0.30) return;
    attacker.setStatus('paralysis');
    say(`${attacker.name} was paralyzed by ${bearer.name}'s Static!`);
  },
  isActive: () => true,
},
```

Valid status values for `setStatus()`: `'burn'`, `'poison'`, `'paralysis'`, `'sleep'`, `'freeze'`.

`onContact` only fires for `move.category === 'physical'` — this is enforced by `BattleState` before calling `triggerContactAbilities()`, so you don't need to check it yourself.

---

### Ability with no battle effect (display only)

If you just want the ability to appear on the badge without any in-battle logic yet:

```js
run_away: {
  name: 'Run Away',
  desc: 'Enables fleeing from any wild battle.',
  isActive: () => false,   // no glow — it has no combat effect
},
```

---

## Glow Logic Reference

The `isActive(pokemon)` function controls the animated gold glow on the ability badge in both `BattleUI` and `PokemonStatusWindow`.

| Pattern | `isActive` |
|---|---|
| Low-HP boost (Overgrow, Blaze…) | `(p) => p.hp / p.maxHp <= 0.33` |
| Always-on passive (Levitate, Static…) | `() => true` |
| Never glows (display only) | `() => false` |
| Custom condition | Any function returning `boolean` |

The glow is re-evaluated on every HP update in `BattleUI._animateHp()`, so it will turn on mid-battle the moment a condition is met (e.g. HP drops into the danger zone).

---

## Public API Reference

These are the functions exported from `AbilityReader.js` and used by the rest of the codebase. You don't need to call them directly unless you're adding a new system.

| Function | Called by | Purpose |
|---|---|---|
| `abilityName(id)` | `BattleUI`, `PokemonStatusWindow` | Returns display name; falls back to formatting the ID if not found |
| `triggerEntryAbilities(player, enemy)` | `BattleState` constructor | Fires `onEntry` for both sides; returns battle log array |
| `abilityAtkMultiplier(attacker, move)` | `BattleState._applyMove` | Returns offensive damage multiplier (default `1`) |
| `abilityDefMultiplier(defender, move)` | `BattleState._applyMove` | Returns defensive damage multiplier (default `1`, `0` = immune) |
| `triggerContactAbilities(attacker, bearer, say)` | `BattleState._applyMove` | Fires `onContact` on the defender after a physical hit |
| `isAbilityActive(pokemon)` | `BattleUI`, `PokemonStatusWindow` | Returns `true` if badge should glow |

---

## Currently Implemented Abilities

### Fully Working (battle logic + UI badge + throb animation)

| ID | Name | Hook | Effect |
|---|---|---|---|
| `overgrow` | Overgrow | atkBoost | +50% Grass damage at ≤33% HP |
| `blaze` | Blaze | atkBoost | +50% Fire damage at ≤33% HP |
| `torrent` | Torrent | atkBoost | +50% Water damage at ≤33% HP |
| `swarm` | Swarm | atkBoost | +50% Bug damage at ≤33% HP |
| `intimidate` | Intimidate | onEntry | Lowers foe's ATK by 1 on entry |
| `pressure` | Pressure | onEntry | Announces on entry; doubles opponent PP cost |
| `trace` | Trace | onEntry | Copies the opponent's ability on entry |
| `levitate` | Levitate | defMult | Immune to Ground moves |
| `flash_fire` | Flash Fire | defMult + atkBoost | Immune to Fire; after absorbing one, +50% Fire damage |
| `water_absorb` | Water Absorb | defMult | Immune to Water moves |
| `volt_absorb` | Volt Absorb | defMult | Immune to Electric moves |
| `lightning_rod` | Lightning Rod | defMult | Immune to Electric moves |
| `thick_fat` | Thick Fat | defMult | Halves Fire and Ice damage |
| `static` | Static | onContact | 30% paralysis on physical contact |
| `poison_point` | Poison Point | onContact | 30% poison on physical contact |
| `flame_body` | Flame Body | onContact | 30% burn on physical contact |
| `effect_spore` | Effect Spore | onContact | 30% random status (par/psn/slp) on contact |
| `guts` | Guts | statMult | +50% ATK when statused; suppresses burn ATK penalty |
| `synchronize` | Synchronize | passive | Reflects burn/poison/paralysis back to inflictor |
| `insomnia` | Insomnia | blocksStatus | Prevents sleep |
| `vital_spirit` | Vital Spirit | blocksStatus | Prevents sleep |
| `limber` | Limber | blocksStatus | Prevents paralysis |
| `inner_focus` | Inner Focus | blocksFlinch | Prevents flinching |
| `oblivious` | Oblivious | blocksConfusion | Prevents confusion and infatuation |
| `own_tempo` | Own Tempo | blocksConfusion | Prevents confusion |
| `rock_head` | Rock Head | blocksRecoil | Prevents recoil damage |
| `shed_skin` | Shed Skin | onEndOfTurn | 33% chance to cure status each turn |
| `natural_cure` | Natural Cure | onBattleEnd | Cures all status when withdrawn/battle ends |

### Display Only (badge shows, no battle logic yet)

| ID | Name | Description |
|---|---|---|
| `shield_dust` | Shield Dust | Blocks secondary effects of moves |
| `compound_eyes` | Compound Eyes | +30% accuracy |
| `keen_eye` | Keen Eye | Prevents accuracy drops; ignores evasion boosts |
| `hyper_cutter` | Hyper Cutter | Prevents ATK from being lowered |
| `clear_body` | Clear Body | Prevents all stat reductions |
| `shell_armor` | Shell Armor | Prevents critical hits |
| `early_bird` | Early Bird | Wakes from sleep in half the turns |
| `damp` | Damp | Prevents self-destruct/explosion |
| `magnet_pull` | Magnet Pull | Traps Steel-types |
| `soundproof` | Soundproof | Immune to sound-based moves |
| `swift_swim` | Swift Swim | Doubles Speed in rain |
| `chlorophyll` | Chlorophyll | Doubles Speed in sun |
| `sand_veil` | Sand Veil | +20% evasion in sandstorm |
| `run_away` | Run Away | Guarantees escape from wild battles |
| `pickup` | Pickup | May pick up items after battle |
| `stench` | Stench | 10% flinch chance on contact |
| `cute_charm` | Cute Charm | 30% infatuation on contact |
