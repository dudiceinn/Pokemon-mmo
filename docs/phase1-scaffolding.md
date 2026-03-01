# Phase 1: Project Scaffolding

- Monorepo with npm workspaces: `client/`, `server/`, `shared/`, `assets/`
- Client: Phaser 3 + Vite (port 5173, LAN accessible)
- Server: Node.js + ws (WebSocket on port 3001)
- Shared: constants, message types, map metadata — used by both client and server
- Game renders at 240x160 (GBA native) scaled 3x, 16x16 tile grid, pixel art mode
- Grid movement: tween-based, 200ms per tile, no direction change mid-tile
- Client-authoritative movement (fine for LAN, revisit for online)
- 3 Phaser scenes: BootScene (loading), OverworldScene (gameplay), UIScene (HUD overlay)
- Entities: Player, RemotePlayer, NPC — all placeholder rectangles until Phase 2
- Network protocol: JSON over WebSocket (join, move, map_change, player_joined, player_moved, player_left, players_sync)
- Server handles full player lifecycle: join → move → map change → disconnect with per-map broadcasting
- Run: `npm install` then `npm run dev` from project root
