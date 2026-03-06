# Pokemon MMO — Roadmap

## Phase 1: Project Scaffolding ✅
- Initialize npm workspace monorepo
- Set up Vite for client with Phaser 3
- Set up Node.js server with `ws`
- Create shared package with constants
- Verify: `npm run dev` boots empty Phaser game + server starts

## Phase 2: Asset Pipeline ✅
- Download/extract FireRed tilesets from pokefirered decompiled project
- Extract overworld character sprites (player, NPCs)
- Convert/organize tilesets into Phaser-compatible sprite sheets
- Create first map in Tiled using FireRed tilesets → export as JSON
- Start with **Pallet Town** as the first playable map
- Verify: assets load in Phaser, tileset renders correctly

## Phase 3: Core Engine — Single Player ✅
- Implement tile-based grid movement (not free movement — authentic Pokemon style)
  - 16x16 tile grid, player snaps to tiles
  - Walking animation plays during tile-to-tile movement
  - 4 directional movement (up/down/left/right)
- Load Pallet Town tilemap and render layers (ground, buildings, decoration)
- Set up collision layer from tilemap data
- Camera follows player, clamped to map bounds
- Player sprite with 4-direction walk cycle animation
- Verify: walk around Pallet Town with collisions working

## Phase 4: Map System ✅
- Map transition system (walk to edge → load adjacent map)
- Warp tiles (doors → interiors, stairs, caves)
- Map connection data in shared/maps.js
- Smooth transition effect (fade/slide)
- Add Route 1 and player's house interior
- Verify: walk between Pallet Town, Route 1, and house

## Phase 5: LAN Multiplayer ✅
- WebSocket server: accept connections, assign player IDs
- Client sends: position updates, map changes, direction
- Server broadcasts: other players' positions to all clients on same map
- RemotePlayer entity: renders other players with interpolated movement
- Player join/leave notifications
- Simple name display above players
- Verify: 2 browsers on LAN see each other walking in Pallet Town

## Phase 6: NPCs & Quest System 🔧 (In Progress)
_Originally "NPCs & Polish" — expanded to include quest/flag system_

### Done
- Static NPC placement from map data
- NPC sprites (npc_oak, npc_boy, npc_woman)
- NPC interaction (face NPC + press Space → dialog box)
- Dialog system (text box overlay with line-by-line advance)
- Mobile D-pad + action button support
- Collision editor for placing/editing NPCs, warps, and collision tiles
- **Flag system** — persistent game state flags in localStorage
- **Conditional NPC dialogs** — NPCs show different dialog based on flags (condition, setFlag, clearFlag)
- **Collision editor upgrades** — dialog list UI with conditional dialog entries

### TODO
- Simple quest chains — chain NPCs together using flags
- Item / inventory system (basic)
- Quest log UI
- More NPC sprites
- Z-order fix — characters render on top of buildings (see ISSUES.md)

## Phase 7: Inventory & Party System ✅
- **InventoryManager** — localStorage-backed item storage, mirrors server-ready pattern
- **PartyManager** — localStorage-backed party storage (up to 6 Pokémon)
  - Stat calculation using standard Pokémon HP + stat formulas (IV=15, EV=0)
  - Starting moves from learnset at or below current level
  - Full CRUD: addPokemon, removePokemon, updatePokemon, hasSpecies
  - Auto-sync to Inventory UI on every write via `pokemon-party-changed` event
- **Inventory UI (Inventory.js)** — draggable hotbar + party panel + bag overlay
  - Party slots render Pokémon icon, level, HP bar
  - Spritesheet-aware icon rendering (128×64 two-frame sheets, shows male/left frame only)
- **pokemon.json** — species definitions for Gen 1 starters (Bulbasaur line, Charmander line, Squirtle line)
  - Base stats, learnsets, evolution data, sprite/cry paths
- **B key** — toggles bag overlay
- **P key** — toggles Party Status Window
- Verify: `window.partyManager.addPokemon('charizard', 36)` adds to party and syncs to UI

## Phase 8: Party Status Window ✅
- **PokemonStatusWindow.js** — vanilla JS/CSS overlay, no React dependency
  - Party list (left panel): 6 slots with sprite, name, level, type, HP bar
  - Detail panel (right): full stats, moves, EXP progress, friendship/bond, evolution hint
  - Reads directly from `pokemon-mmo-party` localStorage key
  - Live updates via `pokemon-party-changed` event — reflects battle/heal changes instantly
  - ESC key or click outside to close
  - Spritesheet rendering: 128×64 icon sheets cropped to left frame via CSS background-image
  - Type-colored UI — header, borders and glows match Pokémon's primary type
  - Fainted state (💀, greyed out, unselectable)
- Pokémon icon sprites served from `/pokemon/Icons/SPECIESNAME.png`
- Vite config updated: PNG middleware removed, icons served natively via `publicDir: ../assets`

## Phase 9: Quality of Life
- Running shoes (hold B to move faster)
- Smooth camera transitions between maps
- Player name input on connect (currently uses `prompt()`)
- Connection status indicator
- Basic sound effects (footsteps, door)

## Future Ideas (beyond Phase 9)
- Wild Pokémon encounters (tall grass)
- Battle system
- More Pokémon species in pokemon.json (beyond Gen 1 starters)
- Trading between players
- Chat system
- Persistent server-side save data (replace localStorage with API calls — PartyManager and InventoryManager are already structured for this migration)
- Mobile touch button to open Party Status Window
- Capacitor wrapper for Android/iOS native app
