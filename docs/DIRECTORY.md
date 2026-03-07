# Project Directory Reference

## Quick Lookup

| System | Key Files |
|--------|-----------|
| **Pokemon** | `assets/data/pokemon.json`, `client/src/systems/PokemonInstance.js`, `client/src/systems/PartyManager.js` |
| **Inventory** | `assets/data/items.json`, `client/src/systems/InventoryManager.js`, `client/src/systems/Inventory.js` |
| **Battle** | `client/src/systems/BattleState.js`, `client/src/scenes/BattleScene.js`, `client/src/scenes/BattleUI.js`, `client/src/systems/ExpBar.js` |
| **Moves** | `assets/data/moves.json`, referenced in `BattleState.js` + `PokemonInstance.js` |
| **Maps** | `assets/maps/*.json`, `shared/maps.js` |
| **NPCs** | `assets/npcs/<map>/*.json`, `client/src/entities/NPC.js`, `client/src/systems/ScriptRunner.js` |
| **Multiplayer** | `client/src/network/Client.js`, `server/src/GameServer.js`, `shared/messages.js` |

---

## Assets (`assets/`)

### Data Definitions (`assets/data/`)
- `pokemon.json` — All species: stats, types, abilities, movesets, evolution chains
- `moves.json` — All moves: type, power, accuracy, category, effects
- `items.json` — All items: id, name, description, category, icon path
- `npc-sprites.json` — Available NPC sprite keys for the editor

### Maps (`assets/maps/`)
Tiled JSON format with `ground`, `collision`, and optional `above` layers + `_warps` field.
- `pallet_town.json`, `route1.json`, `oaks_lab.json`
- `players_house_1f.json`, `players_house_2f.json`, `rivals_house.json`

### NPCs (`assets/npcs/`)
Separate JSON files per NPC, organized by map folder.
- `pallet_town/` — escort_oak, lab_lock, old_man, tour_guide, trigger_oak
- `oaks_lab/` — Oak's lab NPCs + starter ball NPCs
- `players_house_1f/`, `players_house_2f/`, `rivals_house/`, `route1/`

### Spawns (`assets/spawns/`)
Wild Pokemon encounter tables per map (speciesId, level, rate).
- `route1.json` — Full spawn table (50+ encounters)
- Other maps have empty/minimal spawn files

### Sprites (`assets/sprites/`)
- `player.png`, `player_green.png` — Player characters (16x32, 3x4 frames)
- `NPC 00.png` – `NPC 29.png` — Generic NPC sprites
- `trainer_*.png` — 80+ trainer class sprites (Gym Leaders, Elite Four, etc.)
- `POKEBALL.png` — Pokeball item sprite

### Pokemon Sprites (`assets/pokemon/`)
All 898+ species with variants:
- `Front/`, `Front shiny/` — Front-facing battle sprites
- `Back/`, `Back shiny/` — Back-facing battle sprites
- `Icons/`, `Icons shiny/` — Small icons (128x64 spritesheet, male/female)
- `Followers/` — Overworld follower sprites
- `Footprints/`, `Shadow/`, `Eggs/` — Misc

### Item Icons (`assets/Items/`)
600+ item PNGs named by ID (e.g. `POTION.png`, `POKEBALL.png`).

### Battle UI (`assets/battle/`)
- `field_bg.png` — Battle background
- `databox_normal.png`, `databox_normal_foe.png` — HP/status boxes
- `overlay_command.png`, `overlay_fight.png`, `overlay_hp.png`, `overlay_exp.png`, `overlay_message.png`

### Audio (`assets/audio/`)
- `bgm/` — Background music (`wild_battle.mp3`, `victory.mp3`)
- `sfx/` — Sound effects (`battle_start`, `exp_gain`, `level_up`, `hit_normal`, `hit_super`, `hit_not_very`, `faint`, `catch_success`)
- `grass_base0.png`, `grass_base1.png` — Platform bases

### Tilesets (`assets/tilesets/`)
One tileset PNG per map (all share the same FireRed/LeafGreen GBA ripped art).

### Tools (`assets/tools/`)
- `collision-editor.html` — Standalone collision layer editor
- `NPC_QUEST_SCRIPTING_GUIDE.md` — NPC scripting reference
- `BATTLE_PLAN.md` — Battle system design doc
- `extract-assets.js`, `extract-sprites.js` — Asset extraction utilities

---

## Client (`client/`)

### Entry
- `index.html` — HTML shell (HUD, dialog box, inventory panels, d-pad)
- `src/main.js` — Phaser game bootstrap
- `src/config.js` — Phaser config (zoom, resolution, scene list)

### Scenes (`client/src/scenes/`)
| File | Purpose |
|------|---------|
| `BootScene.js` | Asset preloading, progress bar, launches OverworldScene |
| `OverworldScene.js` | Main gameplay: movement, NPCs, warps, encounters, network sync |
| `UIScene.js` | HUD overlay, keyboard (B/P/Esc/1-9), inventory + party UI |
| `BattleScene.js` | Battle lifecycle wrapper, transitions to/from overworld, creates ExpBar |
| `BattleUI.js` | Full-screen HTML battle overlay (HP bars, moves, items, catch, EXP animation) |

### Entities (`client/src/entities/`)
| File | Purpose |
|------|---------|
| `Player.js` | Player sprite, tile movement, animation |
| `NPC.js` | NPC entity: types (npc/sign/trigger), visibility flags, dialog, walk scripting |
| `RemotePlayer.js` | Other players synced via WebSocket |
| `WildPokemon.js` | Roaming wild Pokemon on grass tiles |

### Systems (`client/src/systems/`)
| File | Purpose |
|------|---------|
| `PokemonInstance.js` | Runtime Pokemon object: stats, HP, moves, serialize/deserialize |
| `PartyManager.js` | Party of up to 6 Pokemon, localStorage persistence, fires `pokemon-party-changed` event |
| `InventoryManager.js` | Item data layer: add/remove/count items, localStorage persistence |
| `Inventory.js` | Inventory UI: hotbar (12 slots), party panel (6), bag overlay (30), drag-drop |
| `BattleState.js` | Battle logic: type chart, damage calc, status effects, phase machine, EXP award on victory |
| `ExpBar.js` | Animated EXP bar overlay + level-up card with stat deltas, shown after victory |
| `BattleTestChooser.js` | Dev tool: pick party lead + wild Pokemon for testing |
| `ScriptRunner.js` | NPC script interpreter (say, movenpc, givepokemon, giveitem, choice, etc.) |
| `DialogBox.js` | Dialog box: show name + text lines, advance with Space/Enter |
| `EncounterManager.js` | Wild encounters: grass detection, spawn rolls, WildPokemon spawning |
| `FlagManager.js` | Quest/story flags in localStorage |
| `NameLabel.js` | Floating name labels above NPCs/players |
| `PokemonStatusWindow.js` | Party status overlay (sprites, HP, stats, evolution info) |

### Network (`client/src/network/`)
- `Client.js` — WebSocket client (connect, send, on/off message handlers)

---

## Server (`server/src/`)
- `index.js` — Entry point, starts GameServer
- `GameServer.js` — WebSocket + HTTP server, player sync, map tracking, broadcasts
- `PlayerState.js` — Player data model (id, name, map, x, y, dir)

---

## Shared (`shared/src/`)
- `constants.js` — TILE_SIZE (16), GAME_WIDTH/HEIGHT, SCALE, MOVE_DURATION, DIR enum, DIR_VECTOR
- `maps.js` — Map registry (MAPS object), spawn points, connections, warps, resolveConnection(), resolveWarp()
- `messages.js` — Message types (MSG enum) + factory functions
- `index.js` — Re-exports all

---

## localStorage Keys
| Key | Used By | Data |
|-----|---------|------|
| `pokemon-mmo-flags` | FlagManager | Quest/story boolean flags |
| `pokemon-mmo-party` | PartyManager | Serialized party Pokemon array |
| `pokemon-mmo-inventory` | InventoryManager | Item id → count map |
| `pokemon-mmo-ui-positions` | Inventory | Hotbar/party panel screen positions |
