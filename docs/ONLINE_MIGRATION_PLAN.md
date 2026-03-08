# Online Migration Plan

Moving from client-side/LAN to a server-authoritative online game.

## Current State

- Server handles auth + player saves (Phase 1 complete)
- Game state persisted in SQLite on server, synced to client on login
- Client still runs all game logic (battles, encounters, movement validation)
- WebSocket on `localhost:3001`, no remote hosting yet

## Phase 1: Auth + Server Saves (Foundation) — DONE

**Goal:** Player data lives on the server. Clients can't tamper with saves.

### What Was Built

#### Auth System
- HTTP endpoints: `POST /api/register`, `POST /api/login`
- Username (3–20 chars, lowercase alphanumeric + underscore) + separate display name (1–16 chars)
- Passwords hashed with `bcryptjs` (8+ char minimum)
- JWT tokens (7-day expiry), verified on WebSocket `JOIN`
- Double-login prevention — old session kicked when same account connects again

#### Database (`server/src/db.js`)
- **sql.js** (pure JS SQLite — no native compilation needed on Windows/Node 18)
- DB file: `server/data/pokemon-mmo.db` (gitignored)
- Auto-persists to disk after every write
- Tables:
  - `players` — id, username, display_name, password_hash, created_at
  - `player_state` — player_id, map, x, y, dir, party_json, pc_json, bag_json, flags_json, money, badges_json, updated_at

#### Server Save/Load
- On login: HTTP response includes full player state (party, PC, bag, flags, position)
- Client writes server state to localStorage before initializing managers (zero manager changes needed)
- Save triggers:
  - Map transition (via `doTransition`)
  - Auto-save every 60 seconds
  - `beforeunload` (tab close / refresh)
  - Server saves position on WebSocket disconnect
- Client sends `SAVE_STATE` message → server persists all state to DB

#### Login Screen (`client/src/ui/LoginScreen.js`)
- HTML/CSS overlay (not a Phaser scene), removed after successful auth
- Dark theme with gold borders, monospace font (matches battle UI style)
- Tab toggle between Login / Register
- Error messages displayed inline
- Replaces the old `prompt('Enter your name')` flow

### Files Created/Modified
| File | Status | Description |
|------|--------|-------------|
| `server/src/db.js` | NEW | SQLite setup via sql.js, table creation, query helpers |
| `server/src/auth.js` | NEW | register(), login(), verifyToken() |
| `server/src/GameServer.js` | MODIFIED | HTTP auth endpoints, JWT verify on JOIN, SAVE_STATE handler, position save on disconnect |
| `server/src/PlayerState.js` | MODIFIED | Added dbId field, fromDB() factory |
| `server/src/index.js` | MODIFIED | Await DB init before server start |
| `shared/src/messages.js` | MODIFIED | Added SAVE_STATE message type |
| `client/src/ui/LoginScreen.js` | NEW | HTML/CSS login/register overlay |
| `client/src/network/Client.js` | MODIFIED | connect() accepts JWT token, sends with JOIN |
| `client/src/scenes/OverworldScene.js` | MODIFIED | Login flow, server state init, save triggers, auto-save timer |
| `server/package.json` | MODIFIED | Added sql.js, bcryptjs, jsonwebtoken |
| `.gitignore` | MODIFIED | Added server/data/ |

### Architecture Notes
- Managers (PartyManager, InventoryManager, FlagManager, StorageManager) are **unchanged** — they still read/write localStorage during the session. The server state is written to localStorage before managers initialize, so they load server data transparently.
- `money` and `badges_json` columns exist in the DB as placeholders — no client-side money/badge system yet.
- No localStorage migration — existing saves are abandoned (fresh start with accounts).

---

## Phase 2: Server-Authoritative Game Logic (Partial)

**Goal:** Server validates all gameplay. Client is just a renderer.

### Encounter Spawning — DONE

**Flow:** Client sends `ENCOUNTER_CHECK { map, x, y }` on each grass step → server loads spawn data, rolls encounter rate, picks species + level → sends `ENCOUNTER_RESULT { spawn }` → client renders WildPokemon sprite. All randomness lives on the server.

- Server `EncounterManager` caches spawn data per map (reads from `assets/spawns/`)
- Client EncounterManager no longer rolls encounter rate or picks species
- Visual WildPokemon sprite roaming + contact detection still client-side
- Prevents: spawn manipulation, species manipulation, level manipulation

### Catch Verification — DONE

**Flow:** Client sends `CATCH_ATTEMPT { ballId, enemyHp, enemyMaxHp }` → server validates ball in inventory, rolls catch formula → sends `CATCH_RESULT { caught, wobbles }` → client animates. If caught, server adds pokemon to party/PC and removes ball from inventory in DB.

- Server `CatchManager` tracks active battles per player session
- `BATTLE_START` message sent when encounter triggers, so server knows the enemy species
- Server validates ball exists in inventory before rolling
- Server builds serialized pokemon and adds to party/PC in DB on catch
- Client has offline fallback (`_resolveCatchLocal`) for non-authenticated play
- **Limitation:** Client reports enemy HP — full anti-cheat requires Phase 2 battle verification

### Battle Verification (TODO)
- Server holds authoritative battle state (HP, PP, status, etc.)
- Client sends action (move choice, item use, switch, run)
- Server calculates damage, applies effects, sends result back
- Client animates the result — never calculates damage itself
- Prevents: impossible moves, infinite PP, instant KO hacks

### Item Validation — DONE

**Flow:** Client sends `USE_ITEM { itemId, count }` → server checks item exists in DB inventory → removes from DB → sends `ITEM_RESULT { ok, itemId }` → client applies effect. Works for both overworld (medicine, repels) and in-battle (potions, pokeballs already covered by catch verification).

- Server `handleUseItem` in GameServer validates item count in DB before allowing use
- Client `InventoryManager._useItemViaServer()` sends request, registers one-time handler for response
- Client `BattleState._resolveItem()` delegates to server for in-battle item use
- Offline fallback: if not connected, items are used directly from localStorage
- Prevents: item duplication, fake items (localStorage injection blocked), using items you don't have
- **Money validation** not yet needed — no client-side money system exists yet

### Movement Validation — DONE

**Flow:** Client moves optimistically (no added latency). Server validates each `MOVE` message: checks 1-tile distance, collision data, speed limit. If invalid → sends `MOVE_REJECT { x, y }` → client snaps back to last valid position.

- Server `CollisionManager` loads and caches collision layers from map JSON files
- Validates: distance (1 tile, or 2 for ledge hop), collision values (blocked/ledge/top-block), rate limiting (min 100ms between moves)
- Edge transitions (moving off map) are allowed — `MAP_CHANGE` handles the rest
- Collision cache auto-invalidates when map editor saves (`/api/save-map`)
- Prevents: wall walking, teleporting, speed hacking

### Files Created/Modified (Phase 2)
| File | Status | Description |
|------|--------|-------------|
| `server/src/EncounterManager.js` | NEW | Server-side spawn data, encounter rate rolls, species/level picks |
| `server/src/CatchManager.js` | NEW | Active battle tracking, catch formula, inventory validation, DB updates on catch |
| `server/src/CollisionManager.js` | NEW | Loads map collision data, validates moves (distance, collision, rate limit) |
| `server/src/GameServer.js` | MODIFIED | Handles ENCOUNTER_CHECK, BATTLE_START, CATCH_ATTEMPT, USE_ITEM; validates MOVE with CollisionManager |
| `shared/src/messages.js` | MODIFIED | Added ENCOUNTER_CHECK, ENCOUNTER_RESULT, BATTLE_START, CATCH_ATTEMPT, CATCH_RESULT, USE_ITEM, ITEM_RESULT, MOVE_REJECT |
| `client/src/systems/EncounterManager.js` | MODIFIED | Sends ENCOUNTER_CHECK to server, receives ENCOUNTER_RESULT, sends BATTLE_START on contact |
| `client/src/systems/BattleState.js` | MODIFIED | Accepts networkClient, delegates catch + items to server, handles CATCH_RESULT + ITEM_RESULT, offline fallback |
| `client/src/systems/InventoryManager.js` | MODIFIED | Added _useItemViaServer(), overworld item use validates through server first |
| `client/src/scenes/OverworldScene.js` | MODIFIED | Handles MOVE_REJECT (snaps player back to valid position) |

---

## Phase 3: Online Infrastructure

**Goal:** Game accessible from the internet, not just LAN.

### Hosting Options
| Service | Cost | Pros | Cons |
|---------|------|------|------|
| **Fly.io** | Free tier | Easy deploy, auto-SSL | Limited free resources |
| **Railway** | $5/mo | Git push deploy, simple | Small free tier |
| **Hetzner VPS** | ~$4/mo | Full control, cheap | Manual setup |
| **DigitalOcean** | $6/mo | Good docs, reliable | No free tier |
| **Render** | Free tier | Easy, auto-SSL | Cold starts on free |

### Requirements
- **Domain name** — for HTTPS/WSS (e.g. `pokemmo.yourdomain.com`)
- **SSL/TLS certificate** — Let's Encrypt (free), required for WSS in browsers
- **Environment config** — `WS_URL` switches between `ws://localhost:3001` (dev) and `wss://pokemmo.yourdomain.com` (prod)
- **Static file hosting** — Vite build output served via CDN or same server

### Deploy Setup
```
Client (Vite build) → CDN or static host
Server (Node + ws)  → VPS or cloud platform
Database (SQLite)   → same VPS (or upgrade to PostgreSQL later)
```

### Files to Create/Modify
| File | Change |
|------|--------|
| `client/src/config.js` | NEW or update — WS_URL from env |
| `server/Dockerfile` | NEW — containerized deploy |
| `.env.example` | NEW — template for secrets |
| `fly.toml` or `railway.json` | NEW — deploy config |

---

## Phase 4: Multiplayer Features

**Goal:** Players interact with each other beyond seeing sprites.

### PvP Battles
- Challenge system: player A sends challenge → player B accepts/declines
- Server mediates turn-by-turn (same battle engine as wild battles)
- Both clients send actions → server resolves → both get results
- Ranked/unranked modes later

### Trading
- Trade request → both players select Pokemon/items → confirm → server swaps
- Server validates both sides have what they're offering
- Prevents: duplication glitches, phantom items

### Chat
- Map-local chat (players on same map)
- Whisper (DM) by player name
- Server relays and filters messages

### Other
- Friend list
- Player profiles (badges, playtime, team preview)
- Global events / announcements

---

## Migration Order (Step by Step)

```
1. [DONE] Add SQLite (sql.js) to server
2. [DONE] Create players table + player_state table
3. [DONE] Add /api/register and /api/login (JWT)
4. [DONE] Build LoginScreen on client (HTML/CSS overlay)
5. [DONE] On login → server loads player_state → sends to client
6. [DONE] Client uses server state instead of localStorage
7. [DONE] Add save triggers (map change, auto-save 60s, beforeunload, disconnect)
8. [DONE] Test thoroughly with 2+ players on LAN
9. Set up VPS + domain + SSL
10. Deploy server, build + deploy client
11. Test online with real connections
12. Begin Phase 2 (server-authoritative battles)
```
