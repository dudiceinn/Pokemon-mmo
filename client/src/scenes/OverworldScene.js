import Phaser from 'phaser';
import { TILE_SIZE, DIR, DIR_VECTOR, MSG, MAPS, DEFAULT_MAP, resolveConnection, resolveWarp } from '@pokemon-mmo/shared';
import { Player } from '../entities/Player.js';
import { RemotePlayer } from '../entities/RemotePlayer.js';
import { NPC } from '../entities/NPC.js';
import { Client } from '../network/Client.js';
import { DialogBox } from '../systems/DialogBox.js';
import { FlagManager } from '../systems/FlagManager.js';
import { Inventory } from '../systems/Inventory.js';
import { ScriptRunner } from '../systems/ScriptRunner.js';
import { EncounterManager } from '../systems/EncounterManager.js';
import { PartyManager } from '../systems/PartyManager.js';
import { InventoryManager } from '../systems/InventoryManager.js';

export class OverworldScene extends Phaser.Scene {
  constructor() {
    super({ key: 'OverworldScene' });
    this.currentMapKey = DEFAULT_MAP;
    this.transitioning = false;
    this.cutsceneActive = false;
    this.mapWarps = [];
    this.npcs = [];
    this.remotePlayers = new Map(); // id → RemotePlayer
    this.client = null;
    this.dialogBox = null;
    this._followingNpc = null;      // NPC currently following the player (companion mode)
    this._playerLastTile = null;    // Last tile the player was on, used to detect movement for follow
    this._interactCooldown = 0;     // frames to block interact after dialog closes
  }

  create() {
    this.dialogBox = new DialogBox();
    this.flags = new FlagManager();
    this.encounterManager = new EncounterManager(this);

    // Party — load saved party from localStorage, or start empty (Oak gives starter)
    const pokemonDefs = this.cache.json.get('pokemonDefs');
    const moveDefs    = this.cache.json.get('moveDefs');
    this.partyManager = new PartyManager(pokemonDefs, moveDefs);
    window.partyManager = this.partyManager; // fallback for ScriptRunner

    const itemDefs = this.cache.json.get('itemDefs');
    const inventoryUI = window.inventory ?? null; // set by UIScene / Inventory.js
    this.inventoryManager = new InventoryManager(inventoryUI, itemDefs);
    window.inventoryManager = this.inventoryManager; // used by BattleUI + ScriptRunner
    window.overworldScene = this; // used by InventoryManager overworld item use

    this.loadMap(this.currentMapKey);

    const mapData = MAPS[this.currentMapKey];
    this.player = new Player(this, mapData.spawnX, mapData.spawnY);

    this.cameras.main.startFollow(this.player.sprite, true);
    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    });
    this.interactKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.scene.launch('UIScene');

    // Mobile D-pad + action button
    this.touchDir = null;
    this.touchAction = false;
    this.setupDpad();
    this.setupActionButton();

    // Connect to server
    this.connectToServer();
  }

  setupDpad() {
    const dpadBtns = document.querySelectorAll('.dpad-btn');
    dpadBtns.forEach(btn => {
      const dir = btn.dataset.dir;

      const press = (e) => {
        e.preventDefault();
        this.touchDir = dir;
        btn.classList.add('active');
      };
      const release = (e) => {
        e.preventDefault();
        if (this.touchDir === dir) this.touchDir = null;
        btn.classList.remove('active');
      };

      btn.addEventListener('touchstart', press, { passive: false });
      btn.addEventListener('touchend', release, { passive: false });
      btn.addEventListener('touchcancel', release, { passive: false });
      // Mouse fallback for testing
      btn.addEventListener('mousedown', press);
      btn.addEventListener('mouseup', release);
      btn.addEventListener('mouseleave', release);
    });
  }

  setupActionButton() {
    const btn = document.getElementById('btn-action');
    if (!btn) return;
    const press = (e) => {
      e.preventDefault();
      this.touchAction = true;
      btn.classList.add('active');
    };
    const release = (e) => {
      e.preventDefault();
      btn.classList.remove('active');
    };
    btn.addEventListener('touchstart', press, { passive: false });
    btn.addEventListener('touchend', release, { passive: false });
    btn.addEventListener('touchcancel', release, { passive: false });
    btn.addEventListener('mousedown', press);
    btn.addEventListener('mouseup', release);
  }

  // --- Networking ---

  connectToServer() {
    const name = prompt('Enter your name:', 'Trainer') || 'Trainer';
    this.playerName = name;
    this.dialogBox.setPlayerName(name);

    this.client = new Client();
    this.setupNetworkHandlers();
    this.client.connect(name);
  }

  setupNetworkHandlers() {
    const client = this.client;

    client.on(MSG.WELCOME, (msg) => {
      client.playerId = msg.player.id;
      console.log(`[Game] Welcome ${msg.player.name} (${msg.player.id})`);

      // Send initial map
      client.send({ type: MSG.MAP_CHANGE, map: this.currentMapKey,
        x: this.player.tileX, y: this.player.tileY });
    });

    client.on(MSG.PLAYERS_SYNC, (msg) => {
      // Clear existing remote players and recreate from sync
      this.clearRemotePlayers();
      for (const p of msg.players) {
        if (p.id === client.playerId) continue;
        this.addRemotePlayer(p);
      }
    });

    client.on(MSG.PLAYER_JOINED, (msg) => {
      if (msg.id === client.playerId) return;
      // Only show if on same map
      if (msg.map !== this.currentMapKey) return;
      if (this.remotePlayers.has(msg.id)) return;
      this.addRemotePlayer(msg);
      console.log(`[Game] ${msg.name} joined`);
    });

    client.on(MSG.PLAYER_MOVED, (msg) => {
      const remote = this.remotePlayers.get(msg.id);
      if (remote) {
        remote.moveTo(msg.x, msg.y, msg.dir);
      }
    });

    client.on(MSG.PLAYER_LEFT, (msg) => {
      this.removeRemotePlayer(msg.id);
    });
  }

  addRemotePlayer(data) {
    const remote = new RemotePlayer(
      this, data.id, data.name, data.x, data.y, data.dir
    );
    this.remotePlayers.set(data.id, remote);
  }

  removeRemotePlayer(id) {
    const remote = this.remotePlayers.get(id);
    if (remote) {
      remote.destroy();
      this.remotePlayers.delete(id);
    }
  }

  clearRemotePlayers() {
    for (const [id, remote] of this.remotePlayers) {
      remote.destroy();
    }
    this.remotePlayers.clear();
  }

  sendMove() {
    if (this.client?.connected) {
      this.client.send({
        type: MSG.MOVE,
        x: this.player.tileX,
        y: this.player.tileY,
        dir: this.player.dir,
      });
    }
  }

  sendMapChange(mapKey, x, y) {
    if (this.client?.connected) {
      this.client.send({
        type: MSG.MAP_CHANGE,
        map: mapKey, x, y,
      });
    }
  }

  // --- Map loading ---

  loadMap(key) {
    if (this.groundLayer) this.groundLayer.destroy();
    if (this.aboveLayer) this.aboveLayer.destroy();
    if (this._aboveSprites) {
      this._aboveSprites.forEach(s => s.destroy());
      this._aboveSprites = [];
    }

    this.currentMapKey = key;
    this.map = this.make.tilemap({ key });
    const tileset = this.map.addTilesetImage(`${key}_tileset`, `${key}_tileset`);

    // Ground layer — renders below player (depth 0)
    this.groundLayer = this.map.createLayer('ground', tileset, 0, 0);
    this.groundLayer.setDepth(0);

    // Above layer — roof overhangs rendered above the player (depth 20).
    // Draws only the top half of each above-tile as individual sprites,
    // so roof edges cover the player but ground portions stay invisible.
    this.aboveLayer = null;
    this._aboveSprites = [];
    this._buildAboveSprites(key);

    this.collisionLayer = this.map.getLayer('collision');

    const rawJSON = this.cache.json.get(`${key}_raw`);
    this.mapWarps = rawJSON?._warps || [];

    // Load spawn tiles from assets/spawns/<mapKey>.json (async, non-blocking)
    this.encounterManager?.loadSpawns(key, rawJSON);

    // Spawn NPCs (from separate npcs/<map>.json file, fallback to _npcs in map JSON)
    this.clearNpcs();
    const npcJSON = this.cache.json.get(`${key}_npcs`);
    const npcData = (Array.isArray(npcJSON) ? npcJSON : null) || rawJSON?._npcs || [];
    for (const n of npcData) {
      const npc = new NPC(this, n);
      npc._collisionCheck = (x, y, self) => this.isNpcBlocked(x, y, self);
      this.npcs.push(npc);
    }
    this.updateNpcVisibility();
  }

  _buildAboveSprites(key) {
    try {
      const rawJSON = this.cache.json.get(`${key}_raw`);
      const aboveLayer = rawJSON?.layers?.find(l => l.name === 'above');
      if (!aboveLayer?.data) return;

      const srcImg = this.textures.get(`${key}_tileset`).getSourceImage();
      const tsCols = this.map.tilesets[0].columns;
      const w = this.map.width;
      // Skip top 9.5px of each tile, draw bottom strip.
      // This covers the player's body/legs but leaves their head/face visible.
      const skipTop = 9.5;
      const drawH = TILE_SIZE - skipTop;

      for (let i = 0; i < aboveLayer.data.length; i++) {
        const gid = aboveLayer.data[i];
        if (gid <= 0) continue;

        const tx = i % w;
        const ty = Math.floor(i / w);
        const tileId = gid - 1;
        const srcX = (tileId % tsCols) * TILE_SIZE;
        const srcY = Math.floor(tileId / tsCols) * TILE_SIZE;

        const c = document.createElement('canvas');
        c.width = TILE_SIZE;
        c.height = drawH;
        const ctx = c.getContext('2d');
        ctx.drawImage(srcImg,
          srcX, srcY + skipTop, TILE_SIZE, drawH,
          0, 0, TILE_SIZE, drawH);

        const texKey = `${key}_above_${tx}_${ty}`;
        if (this.textures.exists(texKey)) this.textures.remove(texKey);
        this.textures.addCanvas(texKey, c);

        const sprite = this.add.image(
          tx * TILE_SIZE + TILE_SIZE / 2,
          ty * TILE_SIZE + skipTop + drawH / 2,
          texKey
        );
        sprite.setDepth(20);
        this._aboveSprites.push(sprite);
      }
    } catch (e) {
      console.error('[OverworldScene] _buildAboveSprites failed:', e);
    }
  }

  clearNpcs() {
    for (const npc of this.npcs) {
      npc.destroy();
    }
    this.npcs = [];
    // Also clear any roaming wild pokemon
    this.encounterManager?.clearWild();
  }

findNpcAt(x, y) {
  return this.npcs.find(n => {
    if (!n._visible) return false;
    if (n.tileX === x && n.tileY === y) return true;
    return (n.extraTiles || []).some(t => t.x === x && t.y === y);
  }) || null;
}

  // --- Flag & visibility helpers ---

  applyFlagChanges(setFlag, clearFlag) {
    if (setFlag) this.flags.setFlag(setFlag);
    if (clearFlag) this.flags.clearFlag(clearFlag);
    this.updateNpcVisibility();
    // Defer walkOnFlag checks to next tick — same as setflag command does in ScriptRunner.
    // Calling synchronously here fires startNpcWalk while onComplete is still on the call
    // stack, flipping cutsceneActive and permanently locking the scene if the walk never fires.
    setTimeout(() => this.checkFlagTriggeredWalks(), 0);
  }

  updateNpcVisibility() {
    for (const npc of this.npcs) {
      npc.updateVisibility(this.flags);
    }
    // Defer autoTalk to next tick — setflag/clearflag call updateNpcVisibility
    // mid-script; firing triggerAutoTalk here would spawn a second ScriptRunner
    // while the first is still running, hijacking dialogBox and causing a hang.
    setTimeout(() => {
      for (const npc of this.npcs) {
        if (npc._justAppeared) {
          npc._justAppeared = false;
          this.triggerAutoTalk(npc);
          break;
        }
      }
    }, 0);
  }

  triggerAutoTalk(npc) {
    // Don't fire if a script is already running — would create a second runner
    if (this.cutsceneActive) return;
    // If map is still fading in, wait until transition finishes
    if (this.transitioning) {
      const poll = setInterval(() => {
        if (!this.transitioning && !this.cutsceneActive) {
          clearInterval(poll);
          this.triggerAutoTalk(npc);
        }
      }, 50);
      return;
    }
    const dialogResult = npc.getDialog(this.flags);
    if (!dialogResult.script) return;
    this.cutsceneActive = true;
    const runner = new ScriptRunner(this, npc, this.playerName);
    runner.run(dialogResult.script, () => {
      this.cutsceneActive = false;
      this.interactKey?.reset();
      this._runLegacyPostDialog(npc, dialogResult);
    });
  }

  startNpcWalk(npc, targetX, targetY, onComplete) {
    // Only take ownership of cutsceneActive if not already inside a running script.
    // When called from ScriptRunner (movenpc:), cutsceneActive is already true —
    // unconditionally clearing it here would unlock input before the script finishes.
    const ownsCutscene = !this.cutsceneActive;
    if (ownsCutscene) this.cutsceneActive = true;
    npc.walkToTile(targetX, targetY, () => {
      if (ownsCutscene) this.cutsceneActive = false;
      this.updateNpcVisibility();
      if (onComplete) onComplete();
    });
  }

  teleportPlayer(x, y) {
    this.player.setPosition(x, y);
    this.sendMove();
  }

  startPlayerWalk(targetX, targetY, onComplete) {
    this.cutsceneActive = true;
    this.player.walkToTile(targetX, targetY, () => {
      this.cutsceneActive = false;
      this.sendMove();
      if (onComplete) onComplete();
    });
  }

  // --- Companion follow mode ---

  /**
   * Set an NPC to follow the player in real-time.
   * Called by the `startfollow` script command.
   * The NPC walks to the tile the player just left each time the player moves.
   */
  setFollowingNpc(npc) {
    this._followingNpc = npc;
    this._playerLastTile = { x: this.player.tileX, y: this.player.tileY };
  }

  /**
   * Stop the NPC from following the player.
   * Called by the `stopfollow` script command.
   */
  clearFollowingNpc() {
    this._followingNpc = null;
    this._playerLastTile = null;
  }

  /**
   * Show a small hint message above the dialog box (e.g. "Cici can't jump!").
   * Auto-dismisses after 2s. Only one hint shows at a time.
   */
  _showFollowHint(message) {
    const existing = document.getElementById('follow-hint-box');
    if (existing) return; // already showing, don't spam

    const box = document.createElement('div');
    box.id = 'follow-hint-box';
    box.style.cssText = `
      position: fixed;
      bottom: 180px;
      left: 50%;
      transform: translateX(-50%) translateY(10px);
      background: rgba(0,0,0,0.82);
      border: 2px solid #fff;
      border-radius: 8px;
      padding: 8px 20px;
      z-index: 100002;
      font-family: monospace;
      font-size: 14px;
      color: #fff;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease, transform 0.2s ease;
      white-space: nowrap;
    `;
    box.textContent = message;
    document.body.appendChild(box);

    // Animate in
    requestAnimationFrame(() => {
      box.style.opacity = '1';
      box.style.transform = 'translateX(-50%) translateY(0)';
    });

    // Fade out and remove after 2s
    setTimeout(() => {
      box.style.opacity = '0';
      box.style.transform = 'translateX(-50%) translateY(-8px)';
      setTimeout(() => box.remove(), 220);
    }, 2000);
  }

  // Legacy post-dialog: handles walkTo/teleportPlayer/movePlayer/flags
  // still works for old JSON data and for script commands that set these fields
  _runLegacyPostDialog(npc, { setFlag, clearFlag, walkTo, teleportPlayer, movePlayer }) {
    const afterAll = () => {
      this.applyFlagChanges(setFlag, clearFlag);
    };

    const afterNpcWalk = () => {
      if (teleportPlayer) {
        this.teleportPlayer(teleportPlayer.x, teleportPlayer.y);
      }
      if (movePlayer) {
        this.startPlayerWalk(movePlayer.x, movePlayer.y, afterAll);
      } else {
        afterAll();
      }
    };

    if (walkTo) {
      this.startNpcWalk(npc, walkTo.x, walkTo.y, afterNpcWalk);
    } else {
      afterNpcWalk();
    }
  }

  // Keep old name as alias so any external callers still work
  runPostDialog(npc, result) {
    this._runLegacyPostDialog(npc, result);
  }

  checkFlagTriggeredWalks() {
    for (const npc of this.npcs) {
      if (npc.walkOnFlag && npc.walkToDefault && !npc.isWalking &&
          npc._visible && this.flags.hasFlag(npc.walkOnFlag)) {
        // Clear the flag so it doesn't re-trigger
        this.flags.clearFlag(npc.walkOnFlag);
        this.startNpcWalk(npc, npc.walkToDefault.x, npc.walkToDefault.y);
        break; // only one walk at a time
      }
    }
  }

  // --- Game loop ---

  update(time, delta) {
    // Update HTML name labels to follow camera
    const cam = this.cameras.main;
    for (const npc of this.npcs) {
      if (npc._visible) npc.updateLabel(cam);
      npc.updateRoam(delta);
    }
    for (const [, remote] of this.remotePlayers) remote.updateLabel(cam);

    // Tick wild pokemon roam + contact detection
    this.encounterManager?.update(delta);

    // --- Companion follow mode ---
    // If an NPC is set to follow the player, walk it toward the player's previous tile
    // whenever the player moves. The NPC catches up naturally; the player is never blocked.
    if (this._followingNpc && this._playerLastTile && !this._followingNpc.isWalking) {
      const px = this.player.tileX;
      const py = this.player.tileY;
      const last = this._playerLastTile;
      // Player has moved to a new tile since we last checked
      if (px !== last.x || py !== last.y) {
        // Walk NPC toward the tile the player just vacated
        const targetX = last.x;
        const targetY = last.y;
        this._playerLastTile = { x: px, y: py };
        // Only walk if target is different from NPC's current position
        if (this._followingNpc.tileX !== targetX || this._followingNpc.tileY !== targetY) {
          this._followingNpc.walkToTile(targetX, targetY, null);
        }
      }
    }

    if (this.dialogBox.isOpen()) {
      // Mobile action button advances dialog
      if (this.touchAction) {
        this.touchAction = false;
        this.dialogBox.advance();
      }
      // While dialog is open, keep refreshing cooldown so Space can't
      // re-trigger an NPC on the same frame the dialog closes.
      if (this.interactKey.isDown) this._interactCooldown = 3;
      return;
    }
    if (this.player.isMoving || this.transitioning || this.cutsceneActive) return;

    // Block movement when bag overlay is open
    if (window.inventory?.isBagOpen()) return;

    // Block interact for N frames after dialog closes — prevents the Space
    // that closed the final dialog line from immediately re-triggering the NPC.
    if (this._interactCooldown > 0) {
      this._interactCooldown--;
      return;
    }

    // Interact with NPC (Space key or mobile action button)
    const interact = Phaser.Input.Keyboard.JustDown(this.interactKey) || this.touchAction;
    this.touchAction = false;
    if (interact) {
      const facedTile = DIR_VECTOR[this.player.dir];
      const tx = this.player.tileX + facedTile.x;
      const ty = this.player.tileY + facedTile.y;
      const npc = this.findNpcAt(tx, ty);
      if (npc && npc.type !== 'trigger') {
        const dialogResult = npc.getDialog(this.flags);
        if (dialogResult.script) {
          if (npc.type === 'npc') {
            const opposite = { [DIR.DOWN]: DIR.UP, [DIR.UP]: DIR.DOWN,
              [DIR.LEFT]: DIR.RIGHT, [DIR.RIGHT]: DIR.LEFT };
            npc.faceDirection(opposite[this.player.dir]);
          }
          this.cutsceneActive = true;
          const runner = new ScriptRunner(this, npc, this.playerName);
          runner.run(dialogResult.script, () => {
            this.cutsceneActive = false;
            this.interactKey.reset();
            // Legacy post-dialog actions still work
            this._runLegacyPostDialog(npc, dialogResult);
          });
          return;
        }
      }
    }

    let dir = null;
    if (this.cursors.down.isDown || this.wasd.down.isDown || this.touchDir === 'down') dir = DIR.DOWN;
    else if (this.cursors.up.isDown || this.wasd.up.isDown || this.touchDir === 'up') dir = DIR.UP;
    else if (this.cursors.left.isDown || this.wasd.left.isDown || this.touchDir === 'left') dir = DIR.LEFT;
    else if (this.cursors.right.isDown || this.wasd.right.isDown || this.touchDir === 'right') dir = DIR.RIGHT;

    if (!dir) return;

    const vec = DIR_VECTOR[dir];
    const targetX = this.player.tileX + vec.x;
    const targetY = this.player.tileY + vec.y;

    // Check map edge connections
    if (targetX < 0 || targetY < 0 || targetX >= this.map.width || targetY >= this.map.height) {
      const conn = resolveConnection(this.currentMapKey, targetX, targetY);
      if (conn) {
        this.player.tryMove(dir, () => false);
        this.player.onMoveComplete = () => {
          this.doTransition(conn.map, conn.x, conn.y);
          this.player.onMoveComplete = null;
        };
        return;
      }
    }

    // Check if a sign/npc is blocking the target tile BEFORE checking warps.
    const blockingNpc = this.findNpcAt(targetX, targetY);
    if (blockingNpc && blockingNpc.type !== 'trigger') {
      this.player.faceDirection(dir);
      return;
    }

    // Check warps — only reached if no NPC is blocking the tile
    const warp = this.findWarp(targetX, targetY);
    if (warp) {
      this.player.faceDirection(dir);
      this.doTransition(warp.map, warp.x, warp.y);
      return;
    }

    // Ledge hop: player hops over ledge tile and lands 2 tiles down
    if (dir === DIR.DOWN && this.getCollisionValue(targetX, targetY) === 3) {
      // Block the hop if an NPC is following — they can't cross ledges
      if (this._followingNpc) {
        this.player.faceDirection(dir);
        const name = this._followingNpc.name || 'Your companion';
        this._showFollowHint(`${name} can't jump!`);
        return;
      }
      const landY = targetY + 1;
      // Only hop if landing tile is in bounds and passable
      if (landY < this.map.height && !this.isBlocked(targetX, landY, dir)) {
        this.player.isMoving = true;
        this.player.dir = dir;
        this.player.sprite.play(`${this.player.spriteKey}_walk_${dir}`);
        this.player.startLedgeHop();
        this.player.onMoveComplete = () => {
          this.sendMove();
          this.player.onMoveComplete = null;
          this.encounterManager?.checkStep(this.player.tileX, this.player.tileY);
        };
      } else {
        this.player.faceDirection(dir);
      }
      return;
    }

    // Normal movement
    const moved = this.player.tryMove(dir, (x, y) => this.isBlocked(x, y, dir));
    if (moved) {
      this.player.onMoveComplete = () => {
        this.sendMove();
        this.player.onMoveComplete = null;

        // Check for wild pokemon on this grass tile
        this.encounterManager.checkStep(this.player.tileX, this.player.tileY);

        // Check for trigger NPC on the tile the player just stepped onto
        const triggerNpc = this.findNpcAt(this.player.tileX, this.player.tileY);
        if (triggerNpc && triggerNpc.type === 'trigger') {
          const triggerResult = triggerNpc.getDialog(this.flags);
          if (triggerResult.script) {
            this.cutsceneActive = true;
            const runner = new ScriptRunner(this, triggerNpc, this.playerName);
            runner.run(triggerResult.script, () => {
              this.cutsceneActive = false;
              this.interactKey.reset();
              this._runLegacyPostDialog(triggerNpc, triggerResult);
            });
          }
        }
      };
    }
  }

  findWarp(x, y) {
    for (const w of this.mapWarps) {
      if (w.x === x && w.y === y) {
        return { map: w.destMap, x: w.destX, y: w.destY };
      }
    }
    return resolveWarp(this.currentMapKey, x, y);
  }

  // Collision tile values (must match collision-editor.html)
  // 0 = passable, 1 = fully blocked, 2 = top-block (blocks moving DOWN into), 3 = ledge (only passable going DOWN)

  getCollisionValue(x, y) {
    if (!this.collisionLayer) return 0;
    const tile = this.collisionLayer.data[y]?.[x];
    return (tile && tile.index > 0) ? tile.index : 0;
  }

  isBlocked(x, y, dir) {
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return true;
    const cv = this.getCollisionValue(x, y);
    if (cv === 1) return true;                          // fully blocked
    if (cv === 2 && dir === DIR.DOWN) return true;      // top-block: can't walk down into
    if (cv === 3 && dir !== DIR.DOWN) return true;      // ledge: only passable going down
    const npc = this.findNpcAt(x, y);
    if (npc && npc.type !== 'trigger') return true;
    return false;
  }

  isNpcBlocked(x, y, excludeNpc) {
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return true;
    if (this.collisionLayer) {
      const tile = this.collisionLayer.data[y]?.[x];
      if (tile && tile.index > 0) return true;
    }
    // Check player position
    if (this.player && this.player.tileX === x && this.player.tileY === y) return true;
    // Check other NPCs
    for (const npc of this.npcs) {
      if (npc === excludeNpc) continue;
      if (!npc._visible) continue;
      if (npc.type === 'trigger') continue;
      if (npc.tileX === x && npc.tileY === y) return true;
    }
    return false;
  }

  doTransition(destMapKey, destX, destY) {
    if (this.transitioning) return;
    this.transitioning = true;

    this.cameras.main.fadeOut(150, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      // Clear entities from old map
      this.clearRemotePlayers();
      this.clearNpcs();
      this._followingNpc = null;
      this._playerLastTile = null;

      this.loadMap(destMapKey);
      this.player.setPosition(destX, destY);
      this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

      // Notify server of map change
      this.sendMapChange(destMapKey, destX, destY);

      this.cameras.main.fadeIn(150, 0, 0, 0);
      this.cameras.main.once('camerafadeincomplete', () => {
        this.transitioning = false;
      });
    });
  }
}