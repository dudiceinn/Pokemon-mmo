# Known Issues & TODO

## Bugs

### Z-Order: Characters render on top of buildings
- **Priority**: Medium
- **Location**: `client/src/scenes/OverworldScene.js`, all map JSONs
- **Problem**: Character sprites (depth 8-10) always render on top of building/roof tiles (ground layer depth 0). Characters should appear behind building rooftops when walking near them.
- **Root cause**: The tileset uses mixed-content tiles — a single 16x16 tile has both roof and ground pixels. A simple "above" tile layer doesn't work because the ground portion of the tile covers the character, making them look underground.
- **Attempted fixes**:
  - Above tile layer with duplicate tiles at depth 20 — mixed tiles cover character with floor pixels
  - Removing tiles from ground layer to avoid duplication — creates black gaps
- **Possible solution**: Canvas-based roof overlay — draw only specific roof tiles onto a transparent canvas rendered at high depth. Or edit the tileset to have separate transparent roof-only tiles.
- **Affected maps**: pallet_town (confirmed), likely others with buildings

---

## Implemented Features (for reference)

### NPC Flags & Conditional Dialog System
- **Status**: Done
- **Files**: `FlagManager.js`, `NPC.js`, `OverworldScene.js`, `collision-editor.html`
- **Notes**:
  - Dialog evaluation is bottom-to-top (#1 = default, #2+ = conditional overrides)
  - Flags stored in localStorage under key `pokemon-mmo-flags`
  - Supports `setFlag` and `clearFlag` per dialog entry
  - Editor supports add/remove/reorder dialog entries with condition, setFlag, clearFlag fields
