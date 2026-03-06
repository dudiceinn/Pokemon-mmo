# NPC & Quest Scripting Guide

This guide explains how to create quests and NPC interactions by editing map JSON files directly. It is written for an AI or developer to design multi-step quest chains.

## Where to Place NPC Data (Output Files)

Each NPC is stored as its **own JSON file** inside a folder named after the map: `assets/npcs/<mapname>/<npc_name>.json`. Map JSON files (`assets/maps/`) contain only tile/collision/warp data — **do NOT put NPCs in map files**.

### File structure:
```
assets/npcs/<mapname>/            → One folder per map
  <npc_name>.json                 → One file per NPC (single object, NOT an array)
```

### Example:
```
assets/npcs/pallet_town/
  old_man.json                    → Old Man NPC
  prof_oak.json                   → Prof. Oak NPC
assets/npcs/route1/
  sara.json                       → Sara NPC
assets/npcs/players_house_1f/
  carla.json                      → Carla NPC
assets/npcs/oaks_lab/             → Empty folder (no NPCs yet)
```

### Map files (DO NOT edit for NPCs):
```
assets/maps/pallet_town.json      → Tile data, collision, _warps only
assets/maps/route1.json           → Tile data, collision, _warps only
(etc.)
```

### NPC file format:

Each NPC file contains a **single JSON object** (NOT an array). The filename should be the NPC's name in lowercase with underscores (e.g., `prof_oak.json`, `old_man.json`).

```json
{
  "x": 6, "y": 5,
  "name": "Prof. Oak", "sprite": "npc_oak", "dir": "down",
  "type": "npc",
  "showFlag": "", "hideFlag": "",
  "walkOnFlag": "", "walkTo": null,
  "roam": false, "roamRadius": 3,
  "dialog": ["Hello there!", "Welcome to the world of Pokemon!"],
  "dialogs": [
    {
      "condition": "",
      "setFlag": "talked_to_oak",
      "clearFlag": "",
      "walkTo": null,
      "lines": ["Hello there!", "Welcome to the world of Pokemon!"]
    }
  ]
}
```

### Important rules:
- **Create/edit files in `assets/npcs/<mapname>/`** — one file per NPC, NOT arrays
- Filename = NPC name sanitized (lowercase, spaces → underscores, no special chars)
- NPC `x` and `y` coordinates must be within the map bounds (`0` to `width-1` / `height-1`)
- Each map has its own folder — NPCs on different maps go in different folders
- Cross-map quests work via flags (flags are global, stored in player's browser)
- After editing NPC files, the game picks up changes on next map load (or page refresh)
- The `"dialog"` field (legacy) should mirror the default dialog entry's lines for backward compatibility
- For maps with no NPCs, create an empty folder (or leave it absent)

## NPC Data Format

Each NPC in a map's `_npcs` array has this structure:

```json
{
  "x": 5,
  "y": 8,
  "name": "Prof. Oak",
  "sprite": "npc_oak",
  "dir": "down",
  "type": "npc",
  "showFlag": "",
  "hideFlag": "",
  "walkOnFlag": "",
  "walkTo": null,
  "autoTalk": false,
  "roam": false,
  "roamRadius": 3,
  "dialog": [],
  "dialogs": [
    {
      "condition": "",
      "setFlag": "",
      "clearFlag": "",
      "walkTo": null,
      "teleportPlayer": null,
      "movePlayer": null,
      "lines": ["Hello there!", "Welcome to the world of Pokemon!"]
    }
  ]
}
```

## Field Reference

### NPC-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `x`, `y` | number | Tile coordinates on the map |
| `name` | string | Display name shown in dialog box |
| `sprite` | string | Sprite key (e.g. `npc_oak`, `npc_nurse`). See full list in BootScene.js |
| `dir` | string | Facing direction: `"down"`, `"up"`, `"left"`, `"right"` |
| `type` | string | `"npc"` (visible, blocks), `"sign"` (invisible, Space to interact), `"trigger"` (invisible, activates on step) |
| `showFlag` | string | NPC only appears when this flag is set. Empty = always visible |
| `hideFlag` | string | NPC disappears when this flag is set. Empty = never hidden |
| `walkOnFlag` | string | NPC walks to `walkTo` destination when this flag is set (auto-clears after triggering) |
| `walkTo` | object | `{"x": 10, "y": 5}` — destination for flag-triggered walk. Used with `walkOnFlag` |
| `autoTalk` | boolean | `true` = NPC automatically starts dialog when it becomes visible (via `showFlag`). Default `false` |
| `roam` | boolean | `true` = NPC randomly walks around spawn point. Default `false` |
| `roamRadius` | number | Max tiles from origin the NPC can roam (per axis). Default `3` |

### Dialog Entry Fields

Each entry in the `dialogs` array:

| Field | Type | Description |
|-------|------|-------------|
| `condition` | string | Flag name that must be set for this dialog to activate. Empty = default (always matches) |
| `setFlag` | string | Flag to set after player reads through all lines. Empty = none |
| `clearFlag` | string | Flag to remove after reading. Empty = none |
| `walkTo` | object | `{"x": 10, "y": 5}` — NPC walks here after dialog closes. null = no walk |
| `teleportPlayer` | object | `{"x": 3, "y": 7}` — Instantly teleport player to this tile after dialog. null = none |
| `movePlayer` | object | `{"x": 3, "y": 7}` — Auto-walk player to this tile after dialog (cutscene, player frozen). null = none |
| `lines` | array | Array of dialog strings shown one at a time |

### NPC Types

- **`"npc"`** — Standard visible NPC. Has a sprite, blocks movement, player presses Space facing the NPC to talk. NPC turns to face the player during conversation.
- **`"sign"`** — Invisible interaction point. No sprite shown. Blocks movement. Player presses Space facing the tile to read. Good for signs, bookshelves, posters, hidden items.
- **`"trigger"`** — Invisible step-on trigger. No sprite. Does NOT block movement. Activates automatically when the player walks onto the tile. Good for cutscene triggers, area transitions, scripted events.

## Dialog Evaluation Order

Dialogs are evaluated **bottom-to-top** (last matching entry wins):

- Entry #1 (index 0) should be the **default** — no condition, always matches as fallback
- Entry #2+ should have conditions — they override the default when their flag is set
- The system checks from the last entry backwards and returns the first match

This means: put the most specific/latest-in-quest dialog entries at the END of the array.

## How Flags Work

Flags are simple boolean values stored in the player's browser (localStorage). They persist across sessions.

- **Setting a flag**: When a dialog entry has `setFlag: "my_flag"`, the flag is set after the player finishes reading all lines
- **Clearing a flag**: `clearFlag: "my_flag"` removes it after reading
- **Checking a flag**: A dialog entry with `condition: "my_flag"` only activates if that flag is set
- **Visibility**: NPCs with `showFlag` only appear when that flag exists; `hideFlag` makes them disappear

Flag names are arbitrary strings. Use descriptive names like `quest1_started`, `talked_to_oak`, `found_karen`.

## How NPC Walking Works

NPCs can walk to a target tile coordinate in two ways:

1. **After dialog** — Set `walkTo: {"x": 10, "y": 5}` on a dialog entry. After the player finishes reading, the NPC walks to that position tile-by-tile.
2. **On flag trigger** — Set `walkOnFlag: "oak_go"` and `walkTo: {"x": 10, "y": 5}` on the NPC itself. When any other dialog/trigger sets the flag `"oak_go"`, this NPC starts walking.

During NPC walking:
- Player is **frozen** (cannot move or interact)
- NPC walks in a Manhattan path (horizontal first, then vertical)
- The walk flag is auto-cleared so it doesn't re-trigger
- NPC stays at the new position after walking

## Available Maps

| Map Key | Description | Notes |
|---------|-------------|-------|
| `pallet_town` | Starting town | Player's house, Rival's house, Oak's Lab |
| `route1` | Route between Pallet and Viridian | Connects north of pallet_town |
| `players_house_1f` | Player's house ground floor | |
| `players_house_2f` | Player's house upstairs | |
| `rivals_house` | Rival's house | |
| `oaks_lab` | Professor Oak's laboratory | |

## Available NPC Sprites

All sprites are 16x32 GBA FireRed/LeafGreen style. Key sprites for questing:

- `npc_oak` — Professor Oak
- `npc_boy`, `npc_blue` — Male trainers / Rival
- `npc_mom` — Player's mother
- `npc_nurse` — Nurse Joy
- `npc_man`, `npc_woman`, `npc_woman_1`, `npc_woman_2`, `npc_woman_3` — Generic townspeople
- `npc_old_man_1`, `npc_old_man_2`, `npc_old_woman` — Elderly NPCs
- `npc_little_boy`, `npc_little_girl` — Children
- `npc_policeman` — Officer
- `npc_scientist` — Scientist
- `npc_rocket_m`, `npc_rocket_f` — Team Rocket grunts
- `npc_brock`, `npc_misty`, `npc_lt_surge`, `npc_erika`, `npc_koga`, `npc_sabrina`, `npc_blaine`, `npc_giovanni` — Gym leaders
- `npc_lass`, `npc_youngster`, `npc_bug_catcher`, `npc_hiker`, `npc_fisher`, `npc_camper`, `npc_picnicker` — Trainer classes
- Full list of 83 sprites in `client/src/scenes/BootScene.js`

---

## Quest Design Patterns

### Pattern 1: Simple Talk Quest

NPC gives info, sets a flag so their dialog changes on revisit.

```json
{
  "x": 5, "y": 8, "name": "Prof. Oak", "sprite": "npc_oak", "dir": "down",
  "type": "npc", "showFlag": "", "hideFlag": "", "walkOnFlag": "", "walkTo": null,
  "dialogs": [
    {
      "condition": "",
      "setFlag": "talked_to_oak",
      "clearFlag": "",
      "lines": ["Hello there!", "Welcome to the world of Pokemon!", "Go explore Route 1!"]
    },
    {
      "condition": "talked_to_oak",
      "setFlag": "",
      "clearFlag": "",
      "lines": ["What are you waiting for?", "Head north to Route 1!"]
    }
  ]
}
```

### Pattern 2: Multi-Step Quest Chain (across maps)

**Step 1 — Oak in oaks_lab gives quest:**
```json
{
  "x": 6, "y": 5, "name": "Prof. Oak", "sprite": "npc_oak", "dir": "down",
  "type": "npc", "showFlag": "", "hideFlag": "",
  "walkOnFlag": "", "walkTo": null,
  "dialogs": [
    {
      "condition": "",
      "setFlag": "quest1_find_karen",
      "clearFlag": "",
      "lines": ["I need your help!", "Please find Karen on Route 1.", "She has important research data."]
    },
    {
      "condition": "quest1_find_karen",
      "setFlag": "",
      "clearFlag": "",
      "lines": ["Have you found Karen yet?", "She should be on Route 1."]
    },
    {
      "condition": "quest1_karen_found",
      "setFlag": "quest1_complete",
      "clearFlag": "quest1_karen_found",
      "lines": ["You found the data!", "Thank you so much!", "Here, take this as a reward."]
    }
  ]
}
```

**Step 2 — Karen on route1:**
```json
{
  "x": 12, "y": 10, "name": "Karen", "sprite": "npc_woman_1", "dir": "left",
  "type": "npc", "showFlag": "quest1_find_karen", "hideFlag": "quest1_karen_found",
  "walkOnFlag": "", "walkTo": null,
  "dialogs": [
    {
      "condition": "",
      "setFlag": "quest1_karen_found",
      "clearFlag": "quest1_find_karen",
      "lines": ["Oh, you're from Prof. Oak?", "Here's the research data.", "Please bring it back to him!"]
    }
  ]
}
```

**How it works:**
1. Player talks to Oak → flag `quest1_find_karen` is set
2. Karen appears on Route 1 (she has `showFlag: "quest1_find_karen"`)
3. Player talks to Karen → flag `quest1_karen_found` is set, `quest1_find_karen` is cleared
4. Karen disappears (`hideFlag: "quest1_karen_found"`)
5. Player returns to Oak → Oak sees `quest1_karen_found` flag, gives reward, sets `quest1_complete`

### Pattern 3: NPC Walk After Dialog (cutscene)

Oak talks to the player, then walks to a specific spot:

```json
{
  "x": 6, "y": 5, "name": "Prof. Oak", "sprite": "npc_oak", "dir": "down",
  "type": "npc", "showFlag": "", "hideFlag": "",
  "walkOnFlag": "", "walkTo": null,
  "dialogs": [
    {
      "condition": "",
      "setFlag": "oak_showed_lab",
      "clearFlag": "",
      "walkTo": {"x": 6, "y": 10},
      "lines": ["Follow me!", "I'll show you my lab."]
    },
    {
      "condition": "oak_showed_lab",
      "setFlag": "",
      "clearFlag": "",
      "lines": ["This is where I do my research."]
    }
  ]
}
```

### Pattern 4: Trigger Zone (automatic event)

An invisible trigger on the ground that fires when the player walks on it:

```json
{
  "x": 10, "y": 5, "name": "", "sprite": "npc_oak", "dir": "down",
  "type": "trigger", "showFlag": "", "hideFlag": "",
  "walkOnFlag": "", "walkTo": null,
  "dialogs": [
    {
      "condition": "",
      "setFlag": "entered_route1",
      "clearFlag": "",
      "lines": ["You've entered Route 1!", "Be careful of wild Pokemon!"]
    },
    {
      "condition": "entered_route1",
      "setFlag": "",
      "clearFlag": "",
      "lines": []
    }
  ]
}
```

**Key trick**: The second dialog entry has `condition: "entered_route1"` with empty `lines: []`. Since the flag is set after the first trigger, on subsequent visits the trigger matches the second entry (empty lines) and does nothing. This makes it a one-time event.

### Pattern 5: Sign / Readable Object

A sign post or bookshelf the player can read:

```json
{
  "x": 8, "y": 3, "name": "Sign", "sprite": "npc_oak", "dir": "down",
  "type": "sign", "showFlag": "", "hideFlag": "",
  "walkOnFlag": "", "walkTo": null,
  "dialogs": [
    {
      "condition": "",
      "setFlag": "",
      "clearFlag": "",
      "lines": ["PALLET TOWN", "Shades of your journey await!"]
    }
  ]
}
```

### Pattern 6: NPC Appears After Event + Walks Into Position

An NPC that doesn't exist initially, appears when a flag is set, then walks to a spot:

```json
{
  "x": 2, "y": 15, "name": "Prof. Oak", "sprite": "npc_oak", "dir": "down",
  "type": "npc",
  "showFlag": "oak_comes_to_route1",
  "hideFlag": "",
  "walkOnFlag": "oak_comes_to_route1",
  "walkTo": {"x": 12, "y": 10}
}
```

When another NPC sets `oak_comes_to_route1`:
1. Oak appears at (2, 15) — his starting position
2. Oak immediately starts walking to (12, 10)
3. Player is frozen during the walk
4. The flag is auto-cleared so it doesn't re-trigger

### Pattern 7: Blocking NPC That Moves Aside

An NPC blocks a path until a quest is complete:

```json
{
  "x": 10, "y": 0, "name": "Guard", "sprite": "npc_policeman", "dir": "down",
  "type": "npc", "showFlag": "", "hideFlag": "route1_cleared",
  "walkOnFlag": "", "walkTo": null,
  "dialogs": [
    {
      "condition": "",
      "setFlag": "",
      "clearFlag": "",
      "lines": ["Stop!", "The road ahead is too dangerous.", "Come back when you're stronger."]
    },
    {
      "condition": "beat_first_trainer",
      "setFlag": "route1_cleared",
      "clearFlag": "",
      "walkTo": {"x": 12, "y": 0},
      "lines": ["Oh, you beat a trainer?", "Go right ahead then!"]
    }
  ]
}
```

After `beat_first_trainer` flag is set: player talks to guard → guard says "go ahead" → walks aside → disappears (hideFlag triggers).

---

### Pattern 8: Teleport Player After Dialog

Use case: NPC sends the player to a different location instantly (e.g., a nurse healing at a Pokemon Center, a teleporter).

**File:** `assets/npcs/pokemon_center/nurse.json`
```json
{
  "x": 5, "y": 2,
  "name": "Nurse", "sprite": "npc_nurse", "dir": "down",
  "type": "npc",
  "dialogs": [
    {
      "condition": "",
      "setFlag": "",
      "clearFlag": "",
      "teleportPlayer": {"x": 5, "y": 5},
      "lines": ["Let me heal your Pokemon!", "...", "All done! Your Pokemon are healthy again!"]
    }
  ]
}
```

### Pattern 9: Auto-Walk Player (Guided Movement)

Use case: NPC guides the player somewhere — player walks automatically after dialog (e.g., escort to a location, forced movement in a cutscene).

**File:** `assets/npcs/oaks_lab/oak.json`
```json
{
  "x": 6, "y": 3,
  "name": "Prof. Oak", "sprite": "npc_oak", "dir": "down",
  "type": "npc",
  "dialogs": [
    {
      "condition": "",
      "setFlag": "walked_to_table",
      "clearFlag": "",
      "walkTo": {"x": 8, "y": 3},
      "movePlayer": {"x": 8, "y": 5},
      "lines": ["Come with me, {player}!", "I want to show you something."]
    }
  ]
}
```

NPC walks to (8,3) first, then player auto-walks to (8,5). Both happen as cutscenes with player input frozen.

### Pattern 10: Auto Talk on Appear (Cutscene NPC)

Use case: NPC appears via a flag and immediately starts talking to the player — no Space press needed. Great for scripted encounters like Oak stopping you, a rival appearing, or a guard confronting you.

**File:** `assets/npcs/pallet_town/escort_oak.json`
```json
{
  "x": 12, "y": 3,
  "name": "Prof. Oak", "sprite": "npc_oak", "dir": "up",
  "type": "npc",
  "showFlag": "oak_stop_player",
  "hideFlag": "oak_escort_done",
  "autoTalk": true,
  "dialogs": [
    {
      "condition": "",
      "setFlag": "oak_escort_done",
      "clearFlag": "",
      "walkTo": {"x": 12, "y": 14},
      "movePlayer": {"x": 12, "y": 12},
      "lines": [
        "Wait, {player}!",
        "It's dangerous to go without a Pokemon!",
        "Come with me to my lab!"
      ]
    }
  ]
}
```

Flow: Another NPC sets `oak_stop_player` → Oak appears at (12,3) → immediately talks → after dialog, Oak walks to (12,14) and player auto-walks to (12,12) → Oak disappears (hideFlag).

### Pattern 11: Escort NPC (NPC guides player somewhere, then disappears)

Use case: NPC appears, talks, walks the player to a destination, then disappears. Keep it simple — prefer **one escort NPC** over chaining multiple.

**Design tips:**
- Don't over-engineer with multiple escort steps. If the NPC just needs to lead the player somewhere nearby, one NPC + one walkTo is enough.
- The NPC walks to its destination, the player follows 1 tile behind, then the NPC disappears. Done.
- Only use multi-step chaining if the NPC needs to stop and talk mid-way (rare).
- **Check the map** before setting coordinates — make sure the NPC's walkTo path doesn't go through buildings, walls, or off-screen.

**Example — Oak stops player and escorts to lab area:**

**Trigger:** `assets/npcs/pallet_town/trigger_oak.json`
```json
{
  "x": 12, "y": 1,
  "type": "trigger",
  "hideFlag": "oak_stop_player",
  "dialogs": [{
    "setFlag": "oak_stop_player",
    "movePlayer": {"x": 12, "y": 3},
    "lines": ["Hey! Wait!", "Don't go out without a Pokemon!"]
  }]
}
```

**Escort:** `assets/npcs/pallet_town/escort_oak.json`
```json
{
  "x": 12, "y": 2,
  "type": "npc",
  "showFlag": "oak_stop_player",
  "hideFlag": "oak_escort_done",
  "autoTalk": true,
  "dialogs": [{
    "setFlag": "oak_escort_done",
    "walkTo": {"x": 12, "y": 15},
    "movePlayer": {"x": 12, "y": 14},
    "lines": ["Come with me, {player}!", "My lab is just this way."]
  }]
}
```

**Flow:**
```
Player steps on (12,1) → trigger dialog → player pushed back to (12,3)
  → oak_stop_player set → trigger disappears
  → escort_oak appears at (12,2), autoTalks
  → "Come with me!" → Oak walks south to (12,15), player walks to (12,14)
  → oak_escort_done set → Oak disappears. Player is near the lab.
```

That's it — one trigger, one escort NPC, no chaining needed.

**When you DO need multi-step (rare):** If the NPC must stop mid-way to talk again, chain NPCs where each one's spawn = the previous one's walkTo. But ask yourself first: can you do it in one step?

**Coordinate diagram — how to calculate movePlayer offset:**
```
NPC walks DOWN  (increasing Y): movePlayer = walkTo.y - 1  (player 1 tile ABOVE)
NPC walks UP    (decreasing Y): movePlayer = walkTo.y + 1  (player 1 tile BELOW)
NPC walks RIGHT (increasing X): movePlayer = walkTo.x - 1  (player 1 tile LEFT)
NPC walks LEFT  (decreasing X): movePlayer = walkTo.x + 1  (player 1 tile RIGHT)
```
The player always ends up 1 tile BEHIND the NPC relative to the NPC's walking direction.

**Common mistakes scripters make with escorts:**
1. **walkTo goes through buildings/walls** — the NPC walks in a straight line (X first, then Y). Check that the path is clear on the map.
2. **movePlayer = same tile as walkTo** — player gets blocked by the NPC. Always offset by 1 tile.
3. **movePlayer past the NPC** — player walks BEYOND the NPC (e.g. walkTo x=16, movePlayer x=17). Player should be BEHIND, not ahead.
4. **Over-engineering with multiple escort NPCs** — if the NPC doesn't need to stop and talk mid-walk, use one escort NPC. Simpler = fewer bugs.
5. **Not checking the map** — always verify coordinates against the actual map. Check warps, building positions, and map boundaries before scripting.

---

## Variable Substitution

Dialog lines support the following variables that get replaced at display time:

| Variable | Replaced With | Example |
|----------|---------------|---------|
| `{player}` | The player's name (entered at game start) | `"Welcome, {player}!"` → `"Welcome, Dudice!"` |

The replacement is case-insensitive (`{Player}`, `{PLAYER}`, `{player}` all work).

**Example usage:**
```json
{
  "lines": [
    "Hello, {player}!",
    "Welcome to the world of Pokemon!",
    "{player}, I need your help with something."
  ]
}
```

---

## Post-Dialog Execution Order (IMPORTANT)

When a dialog closes, actions execute in this exact order:

```
1. NPC walks to walkTo destination (if set)
2. Player teleports to teleportPlayer (if set)
3. Player auto-walks to movePlayer (if set)
4. Flags applied (setFlag / clearFlag)
5. Visibility re-evaluated (showFlag / hideFlag)
6. autoTalk checked (if an NPC just became visible)
7. walkOnFlag checked (if a flag triggers an NPC walk)
```

**Key rule: Flags are applied AFTER all walks/teleports complete.** This means:
- An NPC won't disappear mid-walk (safe to use `hideFlag` with the same flag from `setFlag`)
- `autoTalk` NPCs won't fire until after the current NPC/player finishes moving
- Everything sequences cleanly: walk → then flag → then next event

## Common Pitfalls

### 1. NPC and player walking to the same tile
If `walkTo` and `movePlayer` point to the same coordinates, the NPC arrives first and blocks the player. **Always offset the player by at least 1 tile** from the NPC destination.
```
WRONG:  walkTo: {x:10, y:5}, movePlayer: {x:10, y:5}  ← player blocked by NPC
RIGHT:  walkTo: {x:10, y:5}, movePlayer: {x:10, y:6}   ← player walks behind NPC
```

### 2. Using hideFlag with the SAME dialog that triggers it
This is now SAFE because flags apply after walks. Example:
```json
{
  "hideFlag": "oak_done",
  "dialogs": [{ "setFlag": "oak_done", "walkTo": {"x":10,"y":5}, ... }]
}
```
Oak walks to (10,5) → walk completes → `oak_done` flag set → Oak disappears. This works correctly.

### 3. One-time triggers: use hideFlag, not empty dialogs
To make a trigger fire only once, use `hideFlag` — the trigger becomes invisible after firing:
```
WRONG:  Two dialog entries (one default, one with empty lines to block re-trigger)
RIGHT:  "hideFlag": "my_trigger_done" + dialog setFlag: "my_trigger_done"
```
After the trigger fires and sets the flag, hideFlag makes it invisible. Clean and simple.

### 4. autoTalk NPC position
An `autoTalk` NPC appears and talks immediately. Make sure it's NOT on the same tile as the player or another NPC. Place it on an adjacent tile facing the player.

### 5. Chaining autoTalk with movePlayer
If trigger A pushes the player to (12,3) and NPC B appears at (12,2) with autoTalk, the sequence is:
1. Trigger dialog → player walks to (12,3) → flag set → NPC B appears → auto-talks
2. This works because movePlayer completes before flags are applied.

### 6. Multi-step escort: movePlayer must be BEHIND the NPC
When the NPC walks to a destination and the player follows, the player must stop **1 tile behind** the NPC — not on the same tile, not past the NPC.
```
WRONG:  walkTo: {x:12, y:14}, movePlayer: {x:12, y:14}  ← same tile, player blocked by NPC
WRONG:  walkTo: {x:16, y:14}, movePlayer: {x:17, y:14}  ← player walks PAST the NPC
RIGHT:  walkTo: {x:12, y:14}, movePlayer: {x:12, y:13}  ← player 1 tile behind (NPC walked south)
RIGHT:  walkTo: {x:16, y:14}, movePlayer: {x:15, y:14}  ← player 1 tile behind (NPC walked east)
```

### 7. Next escort NPC spawns at previous NPC's walkTo
In a multi-step escort chain, each new NPC must spawn WHERE the previous NPC walked to — not where it started. Otherwise the NPC "teleports" back and the player sees it jump.
```
escort_oak walks to (12, 14)  →  escort_oak_2 must spawn at (12, 14)
escort_oak_2 walks to (16, 14)  →  escort_oak_3 must spawn at (16, 14)
```

## Rules for Quest Design

1. **Flag names must be globally unique** — they persist in localStorage. Use prefixes like `quest1_`, `quest2_`, `oak_`.
2. **Default dialog first** — Entry #1 should have no condition (empty `condition`). It's the fallback.
3. **Conditional entries after** — Higher-numbered entries override lower ones when their condition matches.
4. **One setFlag per dialog entry** — If you need multiple flags, chain them across NPCs.
5. **Cross-map quests** — Flags persist across map transitions. Set a flag in `oaks_lab`, check it in `route1`.
6. **One-time triggers** — Use `hideFlag` matching the dialog's `setFlag` to auto-disable after first trigger.
7. **showFlag + hideFlag** — Use these to make NPCs appear/disappear as quest progresses.
8. **walkTo / movePlayer coordinates** — Must be valid tile positions on the SAME map. Player destination must not overlap NPC destination.
9. **Dialog lines** — Each string in the array is shown one at a time. Player presses Space to advance.
10. **NPC name in dialog** — The `name` field is shown as the speaker in the dialog box. Use descriptive names.
11. **autoTalk NPCs need showFlag** — `autoTalk` only fires on visibility transitions (hidden→visible). Without `showFlag`, the NPC is always visible and autoTalk never triggers after initial load.

## Creating a Quest Checklist

When designing a new quest:

1. Define the quest flag namespace (e.g. `quest2_`)
2. List all NPCs involved and which maps they're on
3. Map out the flag flow: which flags are set/cleared at each step
4. **Verify execution order**: flags apply AFTER walks — plan accordingly
5. For each NPC, write the `dialogs` array with conditions in evaluation order
6. Set `showFlag`/`hideFlag` for NPCs that appear/disappear
7. **Check tile overlaps**: NPC walkTo and player movePlayer must not be the same tile
8. Add trigger zones for automatic events (use `hideFlag` for one-time triggers)
9. Test the full flow: talk to NPC A → travel to map B → talk to NPC C → return to A
