# Phase 4: Map Transitions & Warps

- Map data sourced from pokefirered `data/maps/*/map.json` — connections, warps, NPCs
- `shared/src/maps.js` — central map registry with connections, warps, spawn points, and helper functions
- `resolveConnection(mapKey, x, y)` — checks if stepping off a map edge leads to another map
- `resolveWarp(mapKey, x, y)` — checks if a tile is a warp (door, stairs)
- Edge connections: player walks off map boundary → appears on opposite edge of connected map (offset-aware)
- Warp tiles: player steps on door/stairs → fade out (150ms) → load new map → reposition → fade in (150ms)
- `isBlocked()` allows walking off edges only if a connection exists, otherwise blocks
- `onMoveComplete` callback on Player entity triggers transition check after each move tween
- All maps preloaded in BootScene (iterates MAPS registry keys)
- Maps extracted: pallet_town, route1, players_house_1f, players_house_2f, rivals_house, oaks_lab
- To add a map: add to extract-assets.js MAPS array + shared/src/maps.js registry + BootScene auto-loads it
