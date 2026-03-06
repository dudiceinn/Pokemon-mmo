# NPC & Quest Scripting Guide

This guide explains how to create quests and NPC interactions. It is written for an AI or developer to design multi-step quest chains using the script language.

## Where to Place NPC Data

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
  escort_oak.json                 → Prof. Oak escort NPC
  trigger_oak.json                → Invisible trigger at town exit
  exit_blocker.json               → (in oaks_lab) blocks lab exit
assets/npcs/route1/
  sara.json                       → Sara NPC
assets/npcs/players_house_1f/
  carla.json                      → Carla NPC
assets/npcs/oaks_lab/
  prof_oak_lab.json               → Oak inside the lab
  bulbasaur_ball.json             → Starter Pokeball sign
  charmander_ball.json
  squirtle_ball.json
```

### Map files (DO NOT edit for NPCs):
```
assets/maps/pallet_town.json      → Tile data, collision, _warps only
assets/maps/route1.json           → Tile data, collision, _warps only
(etc.)
```

### Pokemon / Item images:
```
assets/pokemon/bulbasaur.png      → Used by showimage: pokemon/bulbasaur
assets/pokemon/charmander.png
assets/items/potion.png           → Used by showimage: items/potion
```

### NPC file format:

Each NPC file contains a **single JSON object** (NOT an array). The filename should be the NPC's name in lowercase with underscores (e.g., `prof_oak.json`, `old_man.json`).

```json
{
  "x": 6, "y": 5,
  "name": "Prof. Oak", "sprite": "NPC 01", "dir": "down",
  "type": "npc",
  "showFlag": "", "hideFlag": "",
  "walkOnFlag": "", "walkTo": null,
  "autoTalk": false,
  "roam": false, "roamRadius": 3,
  "dialogs": [
    {
      "condition": "",
      "script": "say: Hello there!\nsay: Welcome to the world of Pokemon!\nsetflag: talked_to_oak"
    }
  ]
}
```

### extraTiles — Linked Tiles

The `extraTiles` field lets a single NPC respond from multiple tile positions. This is useful for:
- A wide sign that spans 2 tiles
- A Pokeball object that the player can interact with from either side
- A trigger zone that covers a large area

```json
{
  "x": 8, "y": 4,
  "type": "sign",
  "extraTiles": [
    {"x": 9, "y": 4},
    {"x": 10, "y": 4}
  ],
  "dialogs": [{ "condition": "", "script": "say: A wide sign!" }]
}
```

The primary tile is `x`/`y`. Any tile in `extraTiles` triggers the exact same script. Use the **collision editor** to add linked tiles visually — they show as striped yellow in the editor.

---

### Important rules:
- **Create/edit files in `assets/npcs/<mapname>/`** — one file per NPC, NOT arrays
- Filename = NPC name sanitized (lowercase, spaces → underscores, no special chars)
- NPC `x` and `y` coordinates must be within the map bounds (`0` to `width-1` / `height-1`)
- Each map has its own folder — NPCs on different maps go in different folders
- Cross-map quests work via flags (flags are global, stored in player's browser)
- After editing NPC files, the game picks up changes on next map load (or page refresh)
- For maps with no NPCs, create an empty folder (or leave it absent)

---

## The Script Language

Each dialog entry has a `script` field — a plain text block where each line is one command. Scripts run **top to bottom**, one command at a time. Consecutive `say:` lines are batched into a single dialog box.

### Full Command Reference

| Command | Example | Description |
|---------|---------|-------------|
| `say: text` | `say: Hello, {player}!` | Show a line of dialog. Multiple `say:` in a row appear in one dialog box. |
| `movenpc: x y` | `movenpc: 10 5` | NPC walks to tile X Y. Player is frozen until walk completes. |
| `moveplayer: x y` | `moveplayer: 10 7` | Player auto-walks to tile X Y (cutscene — player frozen). |
| `teleportplayer: x y` | `teleportplayer: 3 8` | Instantly move player to tile X Y on the **same map**. |
| `teleportmap: map x y` | `teleportmap: oaks_lab 6 12` | Fade-transition player to a **different map** at X Y. **Must be the last command** — scene reloads after this, nothing after it runs. |
| `setflag: name` | `setflag: talked_to_oak` | Set a game flag. |
| `clearflag: name` | `clearflag: quest1_started` | Remove a game flag. |
| `checkflag: name` | `checkflag: has_badge` | If flag is NOT set, skip the next `say:` block. |
| `hidenpc` | `hidenpc` | Make this NPC disappear (sets its hideFlag). |
| `giveitem: id count` | `giveitem: potion 3` | Give player an item. Count is optional (default 1). |
| `checkitem: id count` | `checkitem: potion 1` | If player does NOT have the item, skip the next `say:` block. |
| `removeitem: id count` | `removeitem: potion 1` | Remove item(s) from player. Count optional (default 1). |
| `givemoney: amount` | `givemoney: 500` | Give player PokéDollars. |
| `reducemoney: amount` | `reducemoney: 200` | Take PokéDollars from player. |
| `checkmoney: amount` | `checkmoney: 500` | If player has LESS than amount, skip the next `say:` block. |
| `wait: ms` | `wait: 1000` | Pause for N milliseconds before continuing. |
| `sound: key` | `sound: item_get` | Play a sound effect. |
| `choice: text` | `choice: Do you want Bulbasaur?` | Show a Yes/No prompt. **Yes** = continue script. **No** = abort script entirely. |
| `showimage: path` | `showimage: pokemon/bulbasaur` | Show a popup image above the dialog box. Path is relative to `assets/` with no `.png`. |
| `hideimage` | `hideimage` | Remove the image popup immediately. |
| `jump: label` | `jump: skip_dialog` | Jump to a `label:` line elsewhere in the script. Skips everything in between. |
| `label: name` | `label: skip_dialog` | Defines a jump target. No-op during execution. |
| `# comment` | `# This is a note` | Ignored. Use for notes to yourself. |

---

### How `check` commands work

`checkflag`, `checkitem`, and `checkmoney` all work the same way: if the check **fails**, the **next `say:` block is skipped**. If the check **passes**, execution continues normally.

```
checkflag: has_pokedex
say: You already have a Pokédex!
say: Here's your first Pokemon, {player}!
```

If `has_pokedex` is set → the "already have" line is skipped → player sees "Here's your first Pokemon!"
If `has_pokedex` is NOT set → player sees "You already have a Pokédex!" → then "Here's your first Pokemon!"

---

### How `choice:` works

`choice:` shows a Yes/No dialog box above the normal dialog.

- **Yes** → continues to the next command in the script
- **No** → aborts the rest of the script entirely (nothing after it runs)

Use it before `setflag:` so the flag is only set if the player confirms:

```
say: Bulbasaur! The Seed Pokemon.
choice: Do you want to choose Bulbasaur?
setflag: starter_pending_bulbasaur   ← only runs on Yes
say: Great! Talk to Prof. Oak to confirm!
```

---

### How `jump:` and `label:` work

`jump:` skips execution to a named `label:` anywhere in the same script. `label:` does nothing except mark a position.

```
jump: my_label
say: This line is skipped entirely.
label: my_label
say: Execution resumes here.
```

---

### Critical: `checkflag` and `jump` do NOT work together

This is the most common mistake. **`checkflag` only skips `say:` blocks — it never skips `jump:` commands.**

```
# BROKEN — jump always fires regardless of the flag:
checkflag: starter_chosen
jump: already_chosen     <- NOT a say block, checkflag never skips it
say: Pick your starter!
```

The `jump` executes every time. The flag is completely ignored.

**The correct pattern for flag-based branching is a conditional dialog entry:**

```json
"dialogs": [
  {
    "condition": "",
    "script": "say: Pick your starter!"
  },
  {
    "condition": "starter_chosen",
    "script": "say: You already have a starter!"
  }
]
```

**When to use `jump` vs conditional dialog entries:**

| Situation | Use |
|-----------|-----|
| Branch based on a flag | Conditional dialog entry (`condition:` field) |
| Skip non-say commands after a choice | `jump:` |
| Inline skip that does not involve flags | `jump:` |

---

### How `showimage:` and `hideimage` work

`showimage:` pops up a Pokemon or item image above the dialog box. The path is relative to `assets/` with no `.png` extension:

```
showimage: pokemon/bulbasaur    → loads assets/pokemon/bulbasaur.png
showimage: items/potion         → loads assets/items/potion.png
```

Always call `hideimage` after a `choice:` to clean up whether the player picks Yes or No:

```
showimage: pokemon/charmander
say: Charmander! The Lizard Pokemon.
choice: Do you want Charmander?
hideimage                        ← runs on Yes, cleans up popup
setflag: starter_pending_charmander
say: Talk to Prof. Oak to confirm!
hideimage                        ← safety call at end of script
```

---

### How `teleportmap:` works

`teleportmap:` triggers a full fade-out → map reload → fade-in, exactly like walking through a warp tile. It notifies the server of the map change and spawns the correct NPCs.

```
teleportmap: oaks_lab 6 12
```

**Critical rules:**
- `teleportmap` must always be the **last command** in a script — the scene fully reloads after it, so any commands after it are dead code and will never run
- If you need a flag set on arrival at the new map, `setflag` must come **before** `teleportmap`:

```
# WRONG — setflag never runs:
teleportmap: oaks_lab 6 12
setflag: oak_escort_done

# CORRECT — flag is saved before scene reloads:
setflag: oak_escort_done
teleportmap: oaks_lab 6 12
```

---

## NPC Data Format

```json
{
  "x": 5,
  "y": 8,
  "name": "Prof. Oak",
  "sprite": "NPC 01",
  "dir": "down",
  "type": "npc",
  "showFlag": "",
  "hideFlag": "",
  "walkOnFlag": "",
  "walkTo": null,
  "autoTalk": false,
  "roam": false,
  "roamRadius": 3,
  "extraTiles": [],
  "dialogs": [
    {
      "condition": "",
      "script": "say: Hello there!\nsay: Welcome to the world of Pokemon!"
    }
  ]
}
```

## Field Reference

### NPC-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `x`, `y` | number | Tile coordinates on the map |
| `name` | string | Display name shown in dialog box. Can be empty for signs/triggers. |
| `sprite` | string | Sprite key (e.g. `NPC 01`, `NPC 02`, `POKEBALL`). See `assets/data/npc-sprites.json` for the full list. Leave empty `""` for invisible NPCs (signs/triggers). |
| `extraTiles` | array | Additional tile coordinates that also trigger this NPC's script. e.g. `[{"x": 9, "y": 4}]`. Useful for wide objects like signs or multi-tile Pokeballs. |
| `dir` | string | Facing direction: `"down"`, `"up"`, `"left"`, `"right"` |
| `type` | string | `"npc"` (visible, blocks), `"sign"` (invisible, Space to interact), `"trigger"` (invisible, step-on) |
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
| `condition` | string | Flag name that must be set for this script to activate. Empty = default (always matches) |
| `script` | string | The script to run (newline-separated commands). See command reference above. |

### NPC Types

- **`"npc"`** — Standard visible NPC. Has a sprite, blocks movement, player presses Space facing the NPC to talk. NPC turns to face the player during conversation.
- **`"sign"`** — Invisible interaction point. **No sprite is rendered regardless of the `sprite` field.** Blocks movement. Player presses Space facing the tile to read. Good for signs, bookshelves, posters, Pokeballs on a table.
- **`"trigger"`** — Invisible step-on trigger. **No sprite is rendered regardless of the `sprite` field.** Does NOT block movement. Activates automatically when the player walks onto the tile. Good for cutscene triggers, area transitions, scripted events.

---

## Script Evaluation Order

Dialog entries are evaluated **top-to-bottom** — the **first matching entry wins**:

- The system checks entries from index 0 downward and runs the first one whose condition is met
- **Conditional entries must come FIRST** — before the default
- The default entry (no condition) must be **LAST** — it always matches, so anything after it is unreachable

```
WRONG — default is first, so it always matches, conditional entries never run:
[
  { "condition": "",              "script": "say: Default." },
  { "condition": "quest_done",   "script": "say: Quest done!" }  <- never reached
]

CORRECT — specific conditions first, default last:
[
  { "condition": "quest_done",   "script": "say: Quest done!" },  <- checked first
  { "condition": "",              "script": "say: Default." }      <- fallback
]
```

---

## How Flags Work

Flags are simple boolean values stored in the player's browser (localStorage). They persist across sessions and across map transitions.

- **Setting a flag**: `setflag: my_flag` in a script
- **Clearing a flag**: `clearflag: my_flag`
- **Checking a flag (as dialog condition)**: set `condition: "my_flag"` on the dialog entry — that script only runs if the flag is set
- **Checking a flag inline**: `checkflag: my_flag` inside a script — skips the next `say:` block if not set
- **NPC visibility**: `showFlag` = only appear when flag is set; `hideFlag` = disappear when flag is set

Flag names are arbitrary strings. Use descriptive prefixes like `quest1_`, `oak_`, `badge_`.

---

## Script Execution Order

Commands in a script run **strictly top to bottom**:

```
1. say: lines shown → player reads → presses Space → next command runs
2. movenpc: → NPC walks → walk completes → next command runs
3. moveplayer: → player walks (frozen) → walk completes → next command runs
4. teleportplayer: → instant warp on same map → next command runs immediately
5. teleportmap: → fade out → scene reloads → NOTHING after this runs
6. setflag / clearflag → flag set immediately → NPC visibility updated
7. hidenpc → NPC disappears → next command runs
8. giveitem / removeitem / givemoney / reducemoney → applied immediately
9. choice: → waits for player input → Yes continues, No aborts
10. showimage: → image appears immediately → next command runs
11. hideimage → image removed immediately → next command runs
```

This means you have **full control over sequence**. Say some lines, walk the NPC, say more lines, show an image, ask a choice, give an item, set a flag — all in one script.

---

## Variable Substitution

Use `{player}` anywhere in a `say:` or `choice:` line to insert the player's name:

```
say: Hello, {player}!
say: {player}, I need your help with something.
choice: Are you ready, {player}?
```

`{player}` is case-insensitive — `{Player}`, `{PLAYER}` all work.

---

## Available Maps

| Map Key | Description | Notes |
|---------|-------------|-------|
| `pallet_town` | Starting town | Player's house, Rival's house, Oak's Lab |
| `route1` | Route between Pallet and Viridian | Connects north of pallet_town |
| `players_house_1f` | Player's house ground floor | |
| `players_house_2f` | Player's house upstairs | |
| `rivals_house` | Rival's house | |
| `oaks_lab` | Professor Oak's laboratory | |

---

## Available NPC Sprites

Sprite keys are loaded from `assets/data/npc-sprites.json`. The full list is managed there — if you add a new sprite file, add its key to that JSON and it will automatically appear in both the game and the collision editor.

### Standard NPC Sprites

Standard NPC sprites are named `NPC 00`, `NPC 01`, `NPC 02` ... `NPC 29` (and growing). Use the exact key including the space, e.g. `"sprite": "NPC 01"`.

### Special Sprites

- **`POKEBALL`** — A Pokeball object sprite. Used for starter selection tables and item pickups.

### Sprite Sheet Specifications

| Sprite Type | Sheet Size | Frame Size | Grid | Notes |
|-------------|-----------|------------|------|-------|
| Standard NPCs (`NPC 00`–`NPC 29`) | 128 × 192 px | 32 × 48 px | 4 × 4 | 16 frames: rows = Down, Left, Right, Up |
| POKEBALL | 128 × 128 px | 32 × 32 px | 4 × 4 | 16 frames, no walk animation used |

### Frame Layout (Standard NPCs)

```
Row 0 (frames  0– 3): Down  (South) — stand, walk1, walk2, walk3
Row 1 (frames  4– 7): Left  (West)  — stand, walk1, walk2, walk3
Row 2 (frames  8–11): Right (East)  — stand, walk1, walk2, walk3
Row 3 (frames 12–15): Up    (North) — stand, walk1, walk2, walk3
```

### Render Scale

All NPC sprites are rendered at **50% scale** in-game, so a 32×48 frame appears as 16×24 pixels on screen, matching the tile grid.

### No Sprite / Invisible

Leave `"sprite": ""` for `sign` and `trigger` type NPCs — they are always invisible regardless of the sprite field. You can also leave it blank for any NPC you want to be invisible.

---

## Quest Design Patterns

### Pattern 1: Simple Talk Quest

NPC greets the player, sets a flag, and gives different dialog on revisit.

```json
{
  "x": 5, "y": 8, "name": "Prof. Oak", "sprite": "NPC 01", "dir": "down",
  "type": "npc",
  "dialogs": [
    {
      "condition": "",
      "script": "say: Hello there!\nsay: Welcome to the world of Pokemon!\nsay: Go explore Route 1!\nsetflag: talked_to_oak"
    },
    {
      "condition": "talked_to_oak",
      "script": "say: What are you waiting for?\nsay: Head north to Route 1!"
    }
  ]
}
```

---

### Pattern 2: Multi-Step Quest Chain (across maps)

**Step 1 — Oak in oaks_lab gives the quest** (`assets/npcs/oaks_lab/prof_oak.json`):
```json
{
  "x": 6, "y": 5, "name": "Prof. Oak", "sprite": "NPC 01", "dir": "down",
  "type": "npc",
  "dialogs": [
    {
      "condition": "",
      "script": "say: I need your help!\nsay: Please find Karen on Route 1.\nsay: She has important research data.\nsetflag: quest1_find_karen"
    },
    {
      "condition": "quest1_find_karen",
      "script": "say: Have you found Karen yet?\nsay: She should be on Route 1."
    },
    {
      "condition": "quest1_karen_found",
      "script": "say: You found the data!\nsay: Thank you so much!\nsay: Here, take this as a reward.\ngiveitem: rare_candy 1\nsetflag: quest1_complete\nclearflag: quest1_karen_found"
    }
  ]
}
```

**Step 2 — Karen on route1** (`assets/npcs/route1/karen.json`):
```json
{
  "x": 12, "y": 10, "name": "Karen", "sprite": "NPC 05", "dir": "left",
  "type": "npc",
  "showFlag": "quest1_find_karen",
  "hideFlag": "quest1_karen_found",
  "dialogs": [
    {
      "condition": "",
      "script": "say: Oh, you're from Prof. Oak?\nsay: Here's the research data.\nsay: Please bring it back to him!\nsetflag: quest1_karen_found\nclearflag: quest1_find_karen"
    }
  ]
}
```

---

### Pattern 3: NPC Walk After Dialog (cutscene)

```json
{
  "x": 6, "y": 5, "name": "Prof. Oak", "sprite": "NPC 01", "dir": "down",
  "type": "npc",
  "dialogs": [
    {
      "condition": "",
      "script": "say: Follow me!\nsay: I'll show you my lab.\nmovenpc: 6 10\nsetflag: oak_showed_lab"
    },
    {
      "condition": "oak_showed_lab",
      "script": "say: This is where I do my research."
    }
  ]
}
```

---

### Pattern 4: Trigger Zone (automatic event, fires once)

An invisible trigger on the ground that fires once when the player steps on it:

```json
{
  "x": 10, "y": 5,
  "type": "trigger",
  "hideFlag": "entered_route1",
  "dialogs": [
    {
      "condition": "",
      "script": "say: You've entered Route 1!\nsay: Be careful of wild Pokemon!\nsetflag: entered_route1"
    }
  ]
}
```

**Key trick**: `hideFlag: "entered_route1"` matches the flag set in the script. After firing once, the trigger disappears and never fires again.

---

### Pattern 5: Sign / Readable Object

```json
{
  "x": 8, "y": 3,
  "type": "sign",
  "dialogs": [
    {
      "condition": "",
      "script": "say: PALLET TOWN\nsay: Shades of your journey await!"
    }
  ]
}
```

---

### Pattern 6: NPC Appears After Event and Walks Into Position

```json
{
  "x": 2, "y": 15, "name": "Prof. Oak", "sprite": "NPC 01", "dir": "down",
  "type": "npc",
  "showFlag": "oak_comes_to_route1",
  "walkOnFlag": "oak_comes_to_route1",
  "walkTo": {"x": 12, "y": 10}
}
```

When another script sets `oak_comes_to_route1`: Oak appears and immediately walks to (12, 10) — no interaction required.

---

### Pattern 7: Blocking NPC That Moves Aside

```json
{
  "x": 10, "y": 0, "name": "Guard", "sprite": "NPC 10", "dir": "down",
  "type": "npc",
  "hideFlag": "route1_cleared",
  "dialogs": [
    {
      "condition": "",
      "script": "say: Stop!\nsay: The road ahead is too dangerous."
    },
    {
      "condition": "beat_first_trainer",
      "script": "say: Oh, you beat a trainer?\nsay: Go right ahead then!\nmovenpc: 12 0\nsetflag: route1_cleared"
    }
  ]
}
```

---

### Pattern 8: Teleport Player After Dialog — Same Map (Nurse Joy)

```json
{
  "x": 5, "y": 2,
  "name": "Nurse Joy", "sprite": "NPC 03", "dir": "down",
  "type": "npc",
  "dialogs": [
    {
      "condition": "",
      "script": "say: Let me heal your Pokemon!\nsay: ...\nsay: All done! Your Pokemon are healthy again!\nteleportplayer: 5 5"
    }
  ]
}
```

---

### Pattern 9: NPC Escorts Player (Guided Movement)

```json
{
  "x": 6, "y": 3,
  "name": "Prof. Oak", "sprite": "NPC 01", "dir": "down",
  "type": "npc",
  "dialogs": [
    {
      "condition": "",
      "script": "say: Come with me, {player}!\nsay: I want to show you something.\nmovenpc: 8 3\nmoveplayer: 8 5\nsetflag: walked_to_table"
    }
  ]
}
```

**Coordinate rule — player must be 1 tile BEHIND the NPC:**
```
NPC walks DOWN  (Y increases): moveplayer Y = movenpc Y - 1  (player stays above)
NPC walks UP    (Y decreases): moveplayer Y = movenpc Y + 1  (player stays below)
NPC walks RIGHT (X increases): moveplayer X = movenpc X - 1  (player stays left)
NPC walks LEFT  (X decreases): moveplayer X = movenpc X + 1  (player stays right)
```

---

### Pattern 10: AutoTalk on Appear (Cutscene NPC)

NPC appears via a flag and immediately starts talking — no Space press needed:

```json
{
  "x": 12, "y": 3,
  "name": "Prof. Oak", "sprite": "NPC 01", "dir": "up",
  "type": "npc",
  "showFlag": "oak_stop_player",
  "hideFlag": "oak_escort_done",
  "autoTalk": true,
  "dialogs": [
    {
      "condition": "",
      "script": "say: Wait, {player}!\nsay: It's dangerous to go without a Pokemon!\nsay: Come with me to my lab!\nmovenpc: 12 14\nmoveplayer: 12 12\nsetflag: oak_escort_done"
    }
  ]
}
```

Flow: Something sets `oak_stop_player` → Oak appears → immediately starts script → dialog → Oak walks → player walks → flag set → Oak disappears.

---

### Pattern 11: Full Escort Sequence with Cross-Map Teleport

This is the actual Pallet Town starter sequence. Two NPCs work together: a trigger pushes the player back and summons Oak, then Oak escorts the player to the lab via `teleportmap`.

**Trigger** (`assets/npcs/pallet_town/trigger_oak.json`):
```json
{
  "x": 12, "y": 1,
  "type": "trigger",
  "hideFlag": "oak_stop_player",
  "dialogs": [{
    "condition": "",
    "script": "moveplayer: 12 3\nsetflag: oak_stop_player"
  }]
}
```

**Escort NPC** (`assets/npcs/pallet_town/escort_oak.json`):
```json
{
  "x": 12, "y": 2,
  "name": "Prof. Oak", "sprite": "NPC 01", "dir": "down",
  "type": "npc",
  "showFlag": "oak_stop_player",
  "hideFlag": "oak_escort_done",
  "autoTalk": true,
  "dialogs": [{
    "condition": "",
    "script": "say: Come with me, {player}!\nsay: My lab is just this way.\nsay: I'll give you your first Pokemon!\nmovenpc: 12 15\nmoveplayer: 12 14\nmovenpc: 16 15\nmovenpc: 16 13\nmoveplayer: 16 13\nsetflag: oak_escort_done\nteleportmap: oaks_lab 6 12"
  }]
}
```

**Critical**: `setflag: oak_escort_done` comes **before** `teleportmap` so the flag is saved before the scene reloads. If it were after, it would never run.

**Flow:**
```
Player steps on (12,1) → trigger fires → player walks to (12,3) → oak_stop_player set → trigger gone
  → escort_oak appears at (12,2) → autoTalks immediately
  → dialog → Oak walks to lab entrance → player follows
  → setflag: oak_escort_done  ← BEFORE teleportmap
  → teleportmap: oaks_lab 6 12 → scene reloads
  → Oak disappears (hideFlag: oak_escort_done) ← already set
```

---

### Pattern 12: Item Quest (Give, Check, Remove)

```json
{
  "x": 7, "y": 4, "name": "Old Man", "sprite": "NPC 08", "dir": "down",
  "type": "npc",
  "dialogs": [
    {
      "condition": "",
      "script": "say: Oh, hello there!\nsay: Do you happen to have a Potion?\ncheckitem: potion 1\nsay: You don't have one. Come back when you do!\nsay: You have one! Let me take that.\nremoveitem: potion 1\ngivemoney: 500\nsetflag: old_man_rewarded\nsay: Here, take 500 PokéDollars for it!"
    },
    {
      "condition": "old_man_rewarded",
      "script": "say: Thank you again for that Potion!"
    }
  ]
}
```

---

### Pattern 13: Shop-Style NPC (Check Money, Sell Item)

```json
{
  "x": 3, "y": 6, "name": "Merchant", "sprite": "NPC 02", "dir": "down",
  "type": "npc",
  "dialogs": [
    {
      "condition": "",
      "script": "say: I'll sell you a Potion for 300 PokéDollars!\ncheckmoney: 300\nsay: You don't have enough money!\nsay: Here's your Potion!\nreducemoney: 300\ngiveitem: potion 1"
    }
  ]
}
```

---

### Pattern 14: Multi-Reward Quest Completion

```json
{
  "x": 5, "y": 8, "name": "Prof. Oak", "sprite": "NPC 01", "dir": "down",
  "type": "npc",
  "dialogs": [
    {
      "condition": "",
      "script": "say: Welcome, {player}!\nsay: Here's your starter kit.\ngiveitem: potion 5\ngiveitem: pokeball 10\ngivemoney: 1000\nsetflag: received_starter_kit\nsay: Good luck on your journey!"
    },
    {
      "condition": "received_starter_kit",
      "script": "say: You already have your starter kit!\nsay: Now get out there, {player}!"
    }
  ]
}
```

---

### Pattern 15: Yes/No Choice Before Setting a Flag

Player inspects a Pokeball on a table, sees the Pokemon image, then confirms or cancels:

```json
{
  "x": 8, "y": 4,
  "type": "sign",
  "showFlag": "oak_escort_done",
  "hideFlag": "pokemon_chosen",
  "dialogs": [
    {
      "condition": "",
      "script": "showimage: pokemon/bulbasaur\nsay: Bulbasaur!\nsay: The Seed Pokemon. A Grass and Poison type.\nsay: A great choice for a beginner!\nchoice: Do you want to choose Bulbasaur?\nhideimage\nsetflag: starter_pending_bulbasaur\nclearflag: starter_pending_charmander\nclearflag: starter_pending_squirtle\nsay: Great choice! Talk to Prof. Oak to confirm!\nhideimage"
    }
  ]
}
```

If the player picks **No** at the `choice:` prompt, the script aborts — no flag is set, no message is shown. The player can go check another ball. If **Yes**, the flags are set and the confirmation message appears.

---

### Pattern 16: NPC Confirms a Choice Made Elsewhere

Oak in the lab detects which pending starter flag is set and reacts accordingly. The most specific entries are at the bottom (evaluated last = highest priority):

```json
{
  "x": 7, "y": 2,
  "name": "Prof. Oak", "sprite": "NPC 01", "dir": "down",
  "type": "npc",
  "showFlag": "oak_escort_done",
  "dialogs": [
    {
      "condition": "",
      "script": "say: Welcome to my lab, {player}!\nsay: Check the Pokeballs on the table and come back when you've decided!\nsetflag: oak_lab_greeted"
    },
    {
      "condition": "oak_lab_greeted",
      "script": "say: Have you decided yet?\nsay: Go check the Pokeballs on the table!"
    },
    {
      "condition": "starter_pending_bulbasaur",
      "script": "say: Ah, so you want Bulbasaur!\nsay: Excellent choice, {player}!\ngiveitem: bulbasaur 1\nsetflag: pokemon_chosen\nsetflag: oak_lab_greeted\nclearflag: starter_pending_bulbasaur\nsay: Take good care of it!\nsay: Now, go on your adventure!"
    },
    {
      "condition": "starter_pending_charmander",
      "script": "say: Ah, so you want Charmander!\nsay: Excellent choice, {player}!\ngiveitem: charmander 1\nsetflag: pokemon_chosen\nsetflag: oak_lab_greeted\nclearflag: starter_pending_charmander\nsay: Take good care of it!\nsay: Now, go on your adventure!"
    },
    {
      "condition": "starter_pending_squirtle",
      "script": "say: Ah, so you want Squirtle!\nsay: Excellent choice, {player}!\ngiveitem: squirtle 1\nsetflag: pokemon_chosen\nsetflag: oak_lab_greeted\nclearflag: starter_pending_squirtle\nsay: Take good care of it!\nsay: Now, go on your adventure!"
    },
    {
      "condition": "pokemon_chosen",
      "script": "say: You've already chosen your partner, {player}!\nsay: Now get out there and start your adventure!"
    }
  ]
}
```

---

### Pattern 17: Exit Blocker Trigger (push player back)

A trigger on a warp/exit tile that fires when the player steps on it. Shows a message and pushes the player back if they haven't met a condition yet. Disappears once the condition is met.

```json
{
  "x": 6, "y": 12,
  "type": "trigger",
  "hideFlag": "pokemon_chosen",
  "dialogs": [
    {
      "condition": "",
      "script": "say: You can't leave yet, {player}!\nsay: You haven't chosen your starter Pokemon!\nsay: Check the Pokeballs on the table and talk to Prof. Oak first!\nmoveplayer: 6 11"
    }
  ]
}
```

`moveplayer` at the end pushes the player back one tile from the exit. Once `pokemon_chosen` is set the trigger disappears (`hideFlag`) and the player can leave freely.

---

### Pattern 18: Teleport to a Different Map

Send the player to another map at the end of a sequence. Always put `setflag` before `teleportmap`:

```json
{
  "dialogs": [{
    "condition": "",
    "script": "say: Time to head to Viridian City!\nsetflag: left_pallet_town\nteleportmap: route1 12 19"
  }]
}
```

---

## Common Pitfalls

### 1. NPC and player walking to the same tile
`movenpc` and `moveplayer` must not point to the same tile — the NPC arrives first and blocks the player.
```
WRONG:  movenpc: 10 5  then  moveplayer: 10 5   ← player blocked by NPC
RIGHT:  movenpc: 10 5  then  moveplayer: 10 6   ← player 1 tile behind
```

### 2. One-time triggers — use hideFlag
To make a trigger fire only once, set `hideFlag` on the NPC to match the flag your script sets:
```
WRONG:  Two dialog entries with empty second script to block re-trigger
RIGHT:  "hideFlag": "trigger_done"  +  script ends with  setflag: trigger_done
```

### 3. hidenpc vs hideFlag
- `hidenpc` in a script — hides the NPC **during** the script (mid-sequence)
- `hideFlag` on the NPC — hides it **after** the flag is set by any script

### 4. autoTalk NPCs need showFlag
`autoTalk` only fires when an NPC transitions from hidden → visible. Without `showFlag`, the NPC is always visible and autoTalk never triggers after the initial page load.

### 5. moveplayer past the NPC
The player must stop 1 tile **behind** the NPC, not past it:
```
WRONG:  movenpc: 16 14  then  moveplayer: 17 14  ← player walks past NPC
RIGHT:  movenpc: 16 14  then  moveplayer: 15 14  ← player 1 tile behind (NPC went right)
```

### 6. checkflag skips exactly one say block
`checkflag` only skips the **immediately following** `say:` block. If you need to skip more, use a separate dialog entry with a condition instead.

### 7. Script runs even if say lines are empty
A dialog entry fires if its `condition` matches — even if the script has no `say:` commands. Silent scripts (only flags, items, movements) are perfectly valid for invisible triggers.

### 8. setflag must come BEFORE teleportmap
`teleportmap` reloads the scene immediately — any commands after it never run. Always put `setflag` before `teleportmap` if you need the flag to be set on arrival:
```
WRONG:  teleportmap: oaks_lab 6 12\nsetflag: oak_escort_done
RIGHT:  setflag: oak_escort_done\nteleportmap: oaks_lab 6 12
```

### 9. choice: No aborts the entire script
When the player picks No at a `choice:` prompt, the script ends immediately — nothing after the `choice:` runs. Design your scripts so flags and items only appear after the `choice:` line:
```
WRONG:  setflag: starter_chosen\nchoice: Are you sure?   ← flag set before player confirms
RIGHT:  choice: Are you sure?\nsetflag: starter_chosen  ← flag only set on Yes
```

### 10. hideimage after choice:
Always call `hideimage` after a `choice:` to clean up the popup regardless of what the player picks. Since No aborts the script, put a `hideimage` immediately after `choice:` (runs on Yes) and also at the very end of the script (safety):
```
showimage: pokemon/bulbasaur
say: Bulbasaur!
choice: Do you want Bulbasaur?
hideimage          ← runs on Yes
setflag: starter_pending_bulbasaur
say: Talk to Prof. Oak!
hideimage          ← safety call at end
```

### 11. checkflag does NOT skip jump: commands
`checkflag` skips only the next `say:` block. A `jump:` immediately after `checkflag` will **always fire** — the flag is irrelevant.
```
WRONG:  checkflag: starter_chosen
        jump: already_chosen     <- always jumps regardless of flag

RIGHT:  use a conditional dialog entry with condition: starter_chosen
```

### 12. jump: is local to the script
`jump` cannot target a label in a different dialog entry or a different NPC. Labels only exist within the same script string.

---

## Rules for Quest Design

1. **Flag names must be globally unique** — they persist in localStorage. Use prefixes like `quest1_`, `quest2_`, `oak_`.
2. **Default script LAST** — The entry with no condition must be at the bottom. It always matches, so anything after it is unreachable.
3. **Conditional entries after** — Higher-numbered entries override lower ones when their flag condition matches.
4. **Scripts run top to bottom** — Order your commands in the sequence you want them to happen.
5. **Cross-map quests** — Flags persist across map transitions. Set a flag in `oaks_lab`, check it in `route1`.
6. **One-time triggers** — Use `hideFlag` on the NPC matching the flag your script sets.
7. **showFlag + hideFlag** — Use these to make NPCs appear/disappear as quest progresses.
8. **movenpc / moveplayer coordinates** — Must be valid tile positions on the SAME map. Player destination must not overlap NPC destination.
9. **autoTalk NPCs need showFlag** — autoTalk only fires on visibility transitions.
10. **Empty name is fine** — Signs and triggers don't need a `name` field.
11. **setflag before teleportmap** — Always. Anything after `teleportmap` is dead code.
12. **choice: before setflag** — Flags and items after a `choice:` only run if the player picks Yes.
13. **hideimage after choice:** — Always clean up image popups right after the choice prompt.
14. **teleportmap is always last** — Never put any command after `teleportmap` in a script.
15. **checkflag + jump do not mix** — Use conditional dialog entries for flag-based branching.
16. **jump labels are script-local** — A `label:` can only be targeted by `jump:` in the same script.

---

## Creating a Quest Checklist

When designing a new quest:

1. Define the quest flag namespace (e.g. `quest2_`)
2. List all NPCs involved and which maps they're on
3. Map out the flag flow: which flags are set/cleared at each step
4. Write each NPC's `dialogs` entries — conditional entries FIRST (most specific at top), default (no condition) LAST
5. For each script, write commands top-to-bottom in the order they should happen
6. Set `showFlag`/`hideFlag` for NPCs that appear/disappear
7. **Check tile overlaps**: `movenpc` and `moveplayer` must not be the same tile
8. Add trigger zones for automatic events (use `hideFlag` for one-time triggers)
9. If using `teleportmap`: make sure all `setflag` calls come before it
10. If using `choice:`: make sure flags/items come after it, and `hideimage` is called right after
11. Test the full flow: talk to NPC A → travel to map B → talk to NPC C → return to A
12. If branching on a flag — use a conditional dialog entry, NOT `checkflag` + `jump`.
