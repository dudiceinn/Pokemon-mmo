# Battle System — Implementation Plan

## Architecture: Server-Authoritative with Client-Side UI First

### The Core Principle

The client **never trusts itself** for anything that affects game state.
It only sends **intent** (what the player wants to do) and **renders results**
the server sends back. This makes cheating impossible.

```
Client                              Server
──────                              ──────
"I want to use move slot 2"  ────→  Validate move is legal
                                    Calculate damage (server owns formula)
                                    Calculate enemy move
                             ←────  Send result: { playerHpLeft, enemyHpLeft, log }
Render the HP drain animation
```

### Recommended Build Strategy

Build in two phases so you can see and feel the battle working immediately,
then flip to server-authoritative without rewriting the UI:

**Phase 1 — Client-side prototype**
Build the full battle UI and logic locally. `BattleState.js` calculates everything
in the browser. No server changes. Fast to iterate on.

**Phase 2 — Server flip**
Move all calculation out of `BattleState.js` into `GameServer.js`.
`BattleState.js` becomes a dumb renderer — it receives results from the server
and plays animations. The UI code (`BattleScene.js`) does not change at all.

The key is designing `BattleState.js` with a clean interface from day one:
- `submitAction(action)` — player sends an intent
- `onResult(result)` — battle state applies a result it was given

In Phase 1, `submitAction` calls the local calc functions directly.
In Phase 2, `submitAction` sends a WebSocket message and `onResult` is called
when the server responds. The scene never knows the difference.

---

## Progress Tracker

### ✅ Step 1 — `assets/data/moves.json`
**DONE.** All 168 unique moves across every learnset written. Each entry has:
`type`, `power`, `accuracy`, `pp`, `category` (physical/special/status), `effect` string.
Zero missing moves — verified against every learnset in pokemon.json.
→ Place at `assets/data/moves.json`

### ✅ Step 2 — `assets/data/pokemon.json`
**DONE.** `catchRate` added to all 49 pokemon using official Gen 1/2 values.
`baseStats` and `learnset` were already present and complete.
Stat keys used: `hp`, `atk`, `def`, `spatk`, `spdef`, `spd`
→ Replace `assets/data/pokemon.json`

### ⬜ Step 3 — `PokemonInstance.js`
Build runtime pokemon object from speciesId + level.

### ⬜ Step 4 — Party bootstrap
Starter selection, localStorage save/load.

### ⬜ Step 5 — `BattleState.js`
Pure battle logic — turn resolution, damage, catch, flee.

### ⬜ Step 6 — `BattleScene.js`
Phaser scene — sprites, HP bars, menus, animations.

### ⬜ Step 7 — Wire `EncounterManager`
Replace placeholder dialog with `scene.launch('BattleScene', ...)`.

### ⬜ Step 8 — `BootScene.js` preloads
Add `moveDefs` JSON + battle background assets.

### ⬜ Step 9 — `main.js` registration
Add `BattleScene` to Phaser scene list, enable `pixelArt: true`.

---

## Data Contracts (already finalised)

### `pokemon.json` entry shape
```json
"bulbasaur": {
  "name": "Bulbasaur",
  "number": 1,
  "type": ["grass", "poison"],
  "catchRate": 45,
  "baseStats": { "hp": 45, "atk": 49, "def": 49, "spatk": 65, "spdef": 65, "spd": 45 },
  "evolvesTo": "ivysaur",
  "evolvesAtLevel": 16,
  "learnset": [
    { "level": 1, "move": "tackle" },
    { "level": 1, "move": "growl" },
    { "level": 3, "move": "vine_whip" }
  ]
}
```

### `moves.json` entry shape
```json
"tackle":       { "name": "Tackle",    "type": "normal", "power": 40, "accuracy": 100, "pp": 35, "category": "physical", "effect": null },
"growl":        { "name": "Growl",     "type": "normal", "power": 0,  "accuracy": 100, "pp": 40, "category": "status",   "effect": "lower_atk" },
"ember":        { "name": "Ember",     "type": "fire",   "power": 40, "accuracy": 100, "pp": 25, "category": "special",  "effect": "burn_10pct" },
"sleep_powder": { "name": "Sleep Powder", "type": "grass", "power": 0, "accuracy": 75, "pp": 15, "category": "status",  "effect": "sleep" }
```

Effect string conventions:
- `null` — no secondary effect
- `burn_10pct` / `paralyze_30pct` / `poison_30pct` / `freeze_10pct` — status on hit
- `lower_atk` / `lower_def2` / `raise_spatk2` — stat change (number = stages, default 1)
- `drain_half` — heal for 50% of damage dealt
- `recoil_33pct` — take 33% of damage dealt as recoil
- `flinch_30pct` — target flinches (loses turn) with 30% chance
- `sleep` / `paralyze` / `poison` / `burn` / `confuse` — guaranteed status
- `priority1` — move goes first regardless of speed
- `never_miss` — accuracy = 0 means never misses
- `high_crit` — elevated critical hit ratio

---

## New Files to Create

### `src/client/systems/PokemonInstance.js` *(Step 3)*
Runtime pokemon object. Takes `speciesId` + `level` → produces a live pokemon:
- Current HP / max HP (calculated from base stats + level)
- Stats: atk, def, spatk, spdef, spd
- Move list: last 4 moves learned at or below current level, with current PP
- Status condition slot: `null | 'burn' | 'poison' | 'paralysis' | 'sleep' | 'freeze'`
- `serialize()` / `deserialize()` for localStorage persistence

```js
class PokemonInstance {
  constructor(speciesId, level, pokemonDefs, moveDefs)
  get name()          // display name
  get maxHp()         // calculated
  get hp()            // current
  takeDamage(n)
  heal(n)
  setStatus(status)
  serialize()         // → plain object for localStorage
  static deserialize(obj, pokemonDefs, moveDefs)
}
```

### `src/client/scenes/BattleScene.js` *(Step 6)*
Phaser scene. Owns all battle UI — sprites, HP bars, menus, animations.
Never calculates anything. Only calls `battleState.submitAction()` and
listens for `battleState.onResult()` to know what to render.

### `src/client/systems/BattleState.js` *(Step 5)*
The battle brain. In Phase 1 it calculates locally. In Phase 2 it becomes
a thin WebSocket relay. Public interface:

```js
class BattleState {
  // Player submits an intent — in Phase 1 resolves locally,
  // in Phase 2 sends MSG.BATTLE_ACTION to server
  submitAction({ type, slot })  // type: 'move'|'item'|'catch'|'run', slot: index

  // BattleScene registers a callback here to receive results
  onResult(callback)

  // Current state snapshot — read-only, used by BattleScene to draw UI
  get playerPokemon()   // PokemonInstance
  get enemyPokemon()    // PokemonInstance (wild)
  get phase()           // 'player_turn'|'enemy_turn'|'victory'|'fled'|'caught'|'fainted'
}
```

### `src/server/BattleSession.js` *(Phase 2 only)*
Server-side battle instance. One per active battle.
Owns the authoritative copy of both pokemon's HP, PP, and turn state.
Created by `GameServer` when it receives `MSG.BATTLE_START`.
Destroyed when battle ends.

---

## Files to Modify

### `src/client/systems/EncounterManager.js` *(Step 7)*
**Where:** `_triggerEncounter(wildPokemon)`
**Change:** Replace placeholder dialog with `BattleScene` launch:

```js
// BEFORE:
scene.dialogBox.open('', [`A wild ${name} appeared!`, 'Battles coming soon!'], ...);

// AFTER:
this._flash(() => {
  scene.scene.launch('BattleScene', {
    wild: { speciesId: wildPokemon.speciesId, level: wildPokemon.level },
  });
  scene.scene.pause('OverworldScene');
});
```

### `src/client/scenes/BootScene.js` *(Step 8)*
**Where:** `loadNPCSprites()` block, before `this.load.start()`
**Change:** Preload battle assets and moves data:

```js
this.load.json('moveDefs', '/data/moves.json');
this.load.image('battle_bg_grass', '/battle/bg_grass.png');
this.load.image('battle_bg_cave',  '/battle/bg_cave.png');
```

### `src/client/main.js` *(Step 9)*
**Where:** `scene` array in Phaser game config
**Change:** Register BattleScene + enable pixel art mode:

```js
import { BattleScene } from './scenes/BattleScene.js';

new Phaser.Game({
  pixelArt: true,    // fixes sprite blurriness globally
  antialias: false,
  roundPixels: true,
  scene: [BootScene, OverworldScene, BattleScene, UIScene],
});
```

### `packages/shared/index.js` — MSG constants *(Phase 2)*
**Change:** Add battle message types:

```js
BATTLE_START:   'battle_start',    // client → server: encounter happened
BATTLE_ACTION:  'battle_action',   // client → server: player's chosen action
BATTLE_RESULT:  'battle_result',   // server → client: outcome of a turn
BATTLE_END:     'battle_end',      // server → client: battle is over
```

### `src/server/GameServer.js` *(Phase 2 only)*
**Where:** `handleMessage()` switch
**Change:** Handle battle messages, create/destroy `BattleSession` instances:

```js
case MSG.BATTLE_START:  this.handleBattleStart(ws, msg);  break;
case MSG.BATTLE_ACTION: this.handleBattleAction(ws, msg); break;
```

---

## Battle Flow (State Machine)

```
INTRO
  └─ flash + slide in battle UI
  └─ "A wild BULBASAUR appeared!"

PLAYER_TURN
  └─ show menu: [FIGHT | BAG | POKEMON | RUN]

  FIGHT → show move list (name, PP remaining)
    └─ pick move → submitAction({ type:'move', slot:0 })
    └─ → RESOLVE_TURN

  BAG → show usable items (potions, pokeballs)
    └─ pick potion → submitAction({ type:'item', itemId:'potion' })
    └─ pick pokeball → CATCH_ATTEMPT
    └─ either costs the player's turn → ENEMY_TURN after

  RUN → submitAction({ type:'run' })
    └─ roll flee formula → success: BATTLE_END | fail: ENEMY_TURN

RESOLVE_TURN
  └─ player move fires first (or enemy if enemy is faster)
  └─ animate attacker lunge
  └─ apply damage, drain HP bar
  └─ show log: "Bulbasaur used Vine Whip! It's super effective!"
  └─ check fainted → VICTORY or FAINTED
  └─ surviving side uses their move
  └─ check again → loop or PLAYER_TURN

CATCH_ATTEMPT
  └─ animate pokeball throw
  └─ roll catch formula (HP ratio × catchRate × ballBonus)
  └─ 0–3 wobble animations based on catch value
  └─ success → add to party/box → BATTLE_END
  └─ fail → "Oh no! BULBASAUR broke free!" → ENEMY_TURN

VICTORY
  └─ "Wild BULBASAUR fainted!"
  └─ award EXP (Phase 2: server calculates)
  └─ check level up → show level up dialog if applicable
  └─ BATTLE_END

FAINTED
  └─ "CHARMANDER fainted!"
  └─ swap to next party member if available
  └─ if no pokemon left → BLACKED_OUT → warp to last pokemon center

BATTLE_END
  └─ fade out BattleScene
  └─ scene.stop('BattleScene')
  └─ scene.resume('OverworldScene')
  └─ EncounterManager tile cooldown already set
```

---

## Formulas (client in Phase 1, move to server in Phase 2)

### Stat calculation
```
maxHP = floor((2 * baseHP  * level) / 100) + level + 10
stat  = floor((2 * baseStat * level) / 100) + 5
```

### Damage (Gen 1 standard)
```
damage = floor(
  ((2 * level / 5 + 2) * power * (atk / def) / 50 + 2)
  * typeMultiplier    // 0 | 0.5 | 1 | 2
  * random            // float 0.85–1.00
)

// Use spatk/spdef instead of atk/def for 'special' category moves
```

### Type effectiveness chart
Physical and special damage is multiplied based on move type vs target type(s).
Store as a 2D lookup: `TYPE_CHART[moveType][defenderType] → multiplier`
Types in use across current pokemon: normal, fire, water, grass, electric, ice,
fighting, poison, ground, flying, psychic, bug, rock, ghost, dragon, dark, fairy, steel.

### Catch formula
```
hpFactor   = (3 * maxHP - 2 * currentHP) / (3 * maxHP)
ballBonus  = 1.0 (pokeball) | 1.5 (great_ball) | 2.0 (ultra_ball) | 255 (master_ball)
catchValue = catchRate * hpFactor * ballBonus
caught     = Math.random() < catchValue / 255
wobbles    = Math.min(3, Math.floor(catchValue / 64))
```

### Flee formula
```
fleeRate = (playerSpd * 32 / max(enemySpd / 4, 1)) + 30 * fleeAttempts
fled     = Math.random() < fleeRate / 255
```

---

## BattleScene Layout

```
┌─────────────────────────────────┐
│  [enemy sprite — large, back]   │  ← top-left: enemy pokemon
│                   BULBASAUR♂    │  ← top-right: enemy nameplate
│                   Lv.5          │
│                   ████████░░    │  HP bar (no number for enemy)
├─────────────────────────────────┤
│  CHARMANDER♂  Lv.7              │  ← bottom-left: player nameplate
│  HP ████████████░░  28/39       │  HP bar with numbers
│  XP ██░░░░░░░░░░░░              │  XP bar
│        [player sprite — front]  │  ← bottom-right: player pokemon
├─────────────────────────────────┤
│  What will CHARMANDER do?       │  ← battle log / dialog text
│  ┌──────────┬──────────┐        │
│  │  FIGHT   │   BAG    │        │  main menu (4 buttons)
│  ├──────────┼──────────┤        │
│  │ POKEMON  │   RUN    │        │
│  └──────────┴──────────┘        │
└─────────────────────────────────┘

FIGHT sub-menu:
│  ┌────────────────┬─────┬────┐  │
│  │ Vine Whip      │ GRS │ 25 │  │  move name | type badge | PP
│  │ Tackle         │ NRM │ 35 │  │
│  │ Growl          │ NRM │ 40 │  │
│  │ Leech Seed     │ GRS │ 10 │  │
│  └────────────────┴─────┴────┘  │
```

---

## Party System (prerequisite for Step 3)

Battles cannot resolve without knowing which pokemon the player owns.
Minimum needed before Phase 1 works:

1. `PokemonInstance` class — a live pokemon with current HP, moves, level
2. A `party` array — max 6 `PokemonInstance` objects, stored on `OverworldScene`
3. Give player a starter on first load — simplest approach is an Oak NPC using
   the existing `ScriptRunner` with a flag check (`has_starter`), or hardcode on
   first game load
4. Persist party to `localStorage` until server-side saving is ready:

```js
const PARTY_KEY = 'pokemon-mmo-party';
// Save:
localStorage.setItem(PARTY_KEY, JSON.stringify(party.map(p => p.serialize())));
// Load:
const saved = JSON.parse(localStorage.getItem(PARTY_KEY) || '[]');
party = saved.map(obj => PokemonInstance.deserialize(obj, pokemonDefs, moveDefs));
```

---

## Implementation Order

### Phase 1 — Playable client-side prototype

| Step | Status | What |
|---|---|---|
| 1 | ✅ Done | `assets/data/moves.json` — 168 moves, all learnsets covered |
| 2 | ✅ Done | `assets/data/pokemon.json` — `catchRate` added to all 49 pokemon |
| 3 | ⬜ Next | `PokemonInstance.js` — stat calc, move assignment, serialize/deserialize |
| 4 | ⬜ | Party bootstrap — starter NPC or first-load gift, localStorage |
| 5 | ⬜ | `BattleState.js` — turn logic, damage calc, catch, flee, effect resolver |
| 6 | ⬜ | `BattleScene.js` — full battle UI wired to BattleState |
| 7 | ⬜ | `EncounterManager._triggerEncounter` — launch BattleScene |
| 8 | ⬜ | `BootScene.js` — preload `moveDefs` + battle backgrounds |
| 9 | ⬜ | `main.js` — register BattleScene, `pixelArt: true` |

### Phase 2 — Flip to server-authoritative

| Step | Status | What |
|---|---|---|
| 1 | ⬜ | Add `BATTLE_*` MSG constants to `packages/shared` |
| 2 | ⬜ | `src/server/BattleSession.js` — all formulas move here |
| 3 | ⬜ | `GameServer.js` — `handleBattleStart` / `handleBattleAction` |
| 4 | ⬜ | `BattleState.js` — swap local calc for WebSocket sends |
| 5 | ⬜ | Server sends `BATTLE_RESULT` → `BattleState.onResult()` renders |
| 6 | ⬜ | `BattleScene.js` untouched — never knew where results came from |

---

## What Does NOT Need to Change

| File | Reason |
|---|---|
| `OverworldScene.js` | `scene.pause()` called automatically by Phaser on launch |
| `NPC.js` | Trainer battles reuse same contact pattern, just pass trainer data |
| `WildPokemon.js` | Already hands off `speciesId` + `level` correctly |
| `EncounterManager` roaming logic | Separate from battle trigger |
| `vite.config.js` | No new routes needed |
| `collision-editor.html` | No changes needed |
