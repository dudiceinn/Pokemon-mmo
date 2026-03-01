# Phase 6: NPC Quest System & Interactions

## Completed

### Flag System
- `client/src/systems/FlagManager.js` — persistent game state flags in localStorage (key: `pokemon-mmo-flags`)
- Methods: `getFlag(name)`, `setFlag(name)`, `clearFlag(name)`, `hasFlag(name)`, `clearAll()`
- Flags survive page refresh, easy to migrate to server later (same key-value object)

### Conditional NPC Dialogs
- NPCs support a `dialogs` array with conditional entries (replaces single `dialog`)
- Each entry: `condition` (flag required), `setFlag` (flag to set after reading), `clearFlag` (flag to remove after reading), `walkTo` (NPC walks after dialog), `lines` (dialog text)
- Evaluation: bottom-to-top — #1 is default (empty condition), #2+ are conditional overrides
- Backward compatible: falls back to `dialog` array if no `dialogs` exist
- Key files: `client/src/entities/NPC.js` (`getDialog()`), `client/src/scenes/OverworldScene.js` (wiring)

### NPC Types
- `"npc"` — Standard visible NPC. Has sprite, blocks movement, interact with Space, faces toward player
- `"sign"` — Invisible interaction point. Blocks movement. Player presses Space to read. For signs, bookshelves, hidden items
- `"trigger"` — Invisible step-on trigger. Does NOT block movement. Activates when player walks onto tile. For cutscenes, area events
- Key files: `client/src/entities/NPC.js` (type handling), `client/src/scenes/OverworldScene.js` (trigger logic in onMoveComplete)

### NPC Visibility Flags
- `showFlag` — NPC only appears when this flag is set. Empty = always visible
- `hideFlag` — NPC disappears when this flag is set. Empty = never hidden
- Visibility re-evaluated after every flag change (`updateNpcVisibility()`)
- Hidden NPCs: invisible sprite, no label, don't block movement, can't be interacted with
- Key files: `client/src/entities/NPC.js` (`updateVisibility()`), `client/src/systems/NameLabel.js` (`show()/hide()`)

### NPC Walk Scripting
- **Per-dialog walkTo**: `walkTo: {"x": 10, "y": 5}` on a dialog entry — NPC walks there after dialog closes
- **Flag-triggered walk**: `walkOnFlag` + `walkTo` on NPC level — NPC walks when flag is set by another NPC
- Player is frozen during NPC walk (`cutsceneActive` flag)
- Manhattan path: horizontal first, then vertical, tile-by-tile with walk animations
- Walk flag auto-clears to prevent re-triggering
- Key files: `client/src/entities/NPC.js` (`walkToTile()`, `createAnimations()`), `client/src/scenes/OverworldScene.js` (`startNpcWalk()`, `checkFlagTriggeredWalks()`)

### Player Teleport & Auto-Walk
- **`teleportPlayer`**: `{"x": 3, "y": 7}` on a dialog entry — instantly moves player to tile after dialog
- **`movePlayer`**: `{"x": 3, "y": 7}` on a dialog entry — auto-walks player to tile after dialog (cutscene, input frozen)
- Execution order after dialog: NPC walkTo → teleportPlayer → movePlayer → THEN flags applied (setFlag/clearFlag → visibility → autoTalk → walkOnFlag)
- Player position synced to server after teleport/walk
- Key files: `client/src/entities/Player.js` (`walkToTile()`), `client/src/scenes/OverworldScene.js` (`teleportPlayer()`, `startPlayerWalk()`, `runPostDialog()`)

### NPC Auto Talk
- NPCs with `autoTalk: true` automatically start their dialog when they become visible (via `showFlag`)
- Triggers once per visibility transition (hidden → visible), not on every frame
- Player input is frozen during auto-talk (cutscene mode)
- After dialog closes, normal post-dialog actions apply (flags, walkTo, teleportPlayer, movePlayer)
- Use case: NPC appears and immediately talks to the player (e.g., Oak stops you, rival challenges you)
- Key files: `client/src/entities/NPC.js` (`autoTalk`, `_justAppeared`), `client/src/scenes/OverworldScene.js` (`triggerAutoTalk()`)

### NPC Constructor Refactor
- Refactored from 13 positional args to single data object: `new NPC(scene, data)`
- Data object: `{x, y, sprite, name, dir, dialog, dialogs, type, showFlag, hideFlag, walkOnFlag, walkTo, autoTalk, roam, roamRadius}`
- Key file: `client/src/entities/NPC.js`

### NPC Random Movement (Roaming)
- NPCs with `roam: true` randomly walk around their spawn point
- `roamRadius` (default 3) limits how far they wander from origin (Manhattan distance per axis)
- Random delay between moves: 1.5–4 seconds
- 30% chance to just turn in place instead of walking
- Respects collision: won't walk into walls, other NPCs, or the player
- Won't roam while invisible, during walks, or for sign/trigger types
- Collision check via `isNpcBlocked()` in OverworldScene (checks tiles, player, other NPCs)
- Key files: `client/src/entities/NPC.js` (`updateRoam()`), `client/src/scenes/OverworldScene.js` (`isNpcBlocked()`)

### Dialog Variable Substitution
- `{player}` in dialog lines is replaced with the player's entered name at display time
- Case-insensitive: `{Player}`, `{PLAYER}`, `{player}` all work
- Example: `"Hello, {player}!"` → `"Hello, Dudice!"`
- Key files: `client/src/systems/DialogBox.js` (`setPlayerName()`, `showCurrentLine()`), `client/src/scenes/OverworldScene.js` (`connectToServer()`)

### Separate NPC Data Files (One File Per NPC)
- Each NPC is stored as its own JSON file: `assets/npcs/<mapname>/<npc_name>.json`
- Folder name = map key, filename = NPC name (sanitized: lowercase, spaces→underscores)
- Each file contains a single NPC object (not an array)
- Vite middleware dynamically combines all files in a folder into an array when serving `/npcs/<mapname>.json`
- BootScene/OverworldScene load the combined array transparently — no code changes needed
- Save API writes individual files and cleans up deleted NPCs automatically
- A `_filename` field is injected on read and stripped on save for tracking
- Key files: `client/src/scenes/BootScene.js` (loads `${key}_npcs`), `client/src/scenes/OverworldScene.js` (reads from cache), `client/vite.config.js` (middleware + save API)

### NPC file structure:
```
assets/npcs/pallet_town/          → Folder for Pallet Town NPCs
  old_man.json                    → Single NPC object
assets/npcs/route1/               → Folder for Route 1 NPCs
  sara.json                       → Single NPC object
assets/npcs/players_house_1f/     → Folder for Player's House 1F NPCs
  carla.json                      → Single NPC object
assets/npcs/oaks_lab/             → Empty folder (no NPCs yet)
```

### NPC Sprites (83 total)
- Source: `https://github.com/pret/pokefirered` → `graphics/object_events/pics/people/`
- Format: 16x32, 3 columns x 4 rows, GBA FireRed/LeafGreen style
- All copied with `npc_` prefix to `assets/sprites/`
- Full list in `NPC_SPRITES` array in both `client/src/scenes/BootScene.js` and `assets/tools/collision-editor.html`
- To add more: drop PNG in `assets/sprites/`, add key to NPC_SPRITES in both files

### Collision Editor Upgrades
- **Fullscreen two-column NPC panel**: left = NPC properties, right = dialog entries (scrollable)
- NPC panel: name, type, sprite (83), direction, showFlag, hideFlag, walkOnFlag, walkTo, autoTalk, roam, roamRadius
- Dialog entry fields: condition, setFlag, clearFlag, walkTo, teleportPlayer, movePlayer, lines. Add/remove/reorder
- **Duplicate button**: clones NPC with all data to adjacent tile
- **Color-coded overlay**: yellow = NPC, green = Sign, purple = Trigger
- **Flags Debug panel**: view all active flags grouped by prefix, clear individual/group/all flags, manually set flags
- `assets/tools/collision-editor.html`

### Quest Scripting Guide
- Comprehensive guide at `assets/tools/NPC_QUEST_SCRIPTING_GUIDE.md`
- Documents: output file locations, NPC data format, field reference, NPC types, dialog evaluation, flags, walking, variable substitution
- 7 quest design patterns: simple talk, multi-step cross-map, walk-after-dialog, trigger zone, sign, appear+walk, blocking NPC
- Design rules and quest creation checklist
- Written for AI or developer to create quest chains by editing NPC JSON files

## TODO

### Item / Inventory System (basic)
- Simple inventory: list of item names stored alongside flags in localStorage
- NPCs can give items via dialog (new `giveItem` field in dialog entry)
- UI to view inventory (pause menu or HUD button)

### Quest Log UI
- Track active and completed quests
- Show in a simple list UI (pause menu overlay)
- Quests defined as flag milestones (e.g., `talked_carla` + `got_pokedex` = "Started your journey")

### Z-Order Fix (Bug)
- Characters render on top of buildings instead of behind rooftops
- Root cause: mixed-content tiles (half roof, half ground in one 16x16 tile)
- See `ISSUES.md` for details and attempted approaches
