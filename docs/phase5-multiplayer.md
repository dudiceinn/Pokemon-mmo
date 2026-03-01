# Phase 5: LAN Multiplayer

- WebSocket server on port 3001, client auto-connects using page hostname
- Player prompted for name on load via `prompt()`
- Client sends: `join`, `move` (after each tile step), `map_change` (on warp/transition)
- Server broadcasts to all players on same map: `player_joined`, `player_moved`, `player_left`, `players_sync`
- `players_sync` sent on join and map change — gives full state of all players on current map
- Remote players rendered with real sprites (same walk animations as local player)
- Name label shown above each remote player
- Remote player movement interpolated with tweens matching local player timing (200ms)
- On map transition: clear all remote players, notify server, receive new map's player list
- UIScene HUD shows: coordinates, map name, ONLINE/OFFLINE status, nearby player count
- Server tracks per-player: id, name, map, x, y, direction
- Key files: `client/src/scenes/OverworldScene.js` (networking), `client/src/entities/RemotePlayer.js`, `server/src/GameServer.js`

## How to test
- Start server: `npm run dev:server`
- Start client: `npm run dev:client`
- Open 2 browser tabs to `http://localhost:5173/`
- Enter different names, both should see each other walking in real-time
- LAN: open from another PC using `http://<your-ip>:5173/`
