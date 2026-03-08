import Phaser from 'phaser';
import { Inventory } from '../systems/Inventory.js';
import { InventoryManager } from '../systems/InventoryManager.js';
import { PokemonStatusWindow } from '../systems/PokemonStatusWindow.js';

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  create() {
    console.log('Cache keys:', this.cache.json.getKeys());

    // ── HTML HUD elements ──
    this.elCoords      = document.querySelector('#hud-left .coords');
    this.elMapName     = document.querySelector('#hud-left .map-name');
    this.elTrainerName = document.querySelector('#hud-left .trainer-name');
    this.elTrainerLv   = document.querySelector('#hud-left .trainer-lv');
    this.elMoney       = document.querySelector('#hud-left .money-val');
    this.elBadgeCount  = document.querySelector('#hud-left .badge-count');
    this.elStatus      = document.querySelector('#hud-right .status');
    this.elPlayers     = document.querySelector('#hud-right .players');

    // ── Inventory UI ──
    this.inventory = new Inventory();
    window.inventory = this.inventory;

    // ── InventoryManager ──
    const itemDefs = this.cache.json.get('itemDefs');
    if (itemDefs) {
      this.inventoryManager = new InventoryManager(this.inventory, itemDefs);
      window.inventoryManager = this.inventoryManager;
    } else {
      console.warn('[UIScene] itemDefs not found in cache — did you load items.json in BootScene?');
    }

    // ── PartyManager ──
    // PartyManager is created by OverworldScene (which has moveDefs in cache).
    // UIScene reads it from window.partyManager once OverworldScene is ready.
    // PokemonStatusWindow reads directly from localStorage so it works immediately.

    // ── Party Status Window ──
    this.partyStatusWindow = new PokemonStatusWindow();
    window.partyStatusWindow = this.partyStatusWindow;

    // ── HUD icon buttons ──
    document.getElementById('hud-btn-party').addEventListener('click', () => {
      this.partyStatusWindow.toggle();
    });
    document.getElementById('hud-btn-bag').addEventListener('click', () => {
      this.inventory.toggleBag();
    });
    document.getElementById('hud-btn-badges').addEventListener('click', () => {
      this._toggleBadgesCard();
    });
    document.getElementById('hud-btn-quests').addEventListener('click', () => {
      this._toggleQuestLog();
    });

    // ── Keyboard keys ──
    this.bagKey   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.B);
    this.partyKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);

    this.escKey   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    // ── Hotbar keys 1–9 ──
    this.hotbarKeys = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.FOUR,
      Phaser.Input.Keyboard.KeyCodes.FIVE,
      Phaser.Input.Keyboard.KeyCodes.SIX,
      Phaser.Input.Keyboard.KeyCodes.SEVEN,
      Phaser.Input.Keyboard.KeyCodes.EIGHT,
      Phaser.Input.Keyboard.KeyCodes.NINE,
    ].map(code => this.input.keyboard.addKey(code));
  }

  update(time, delta) {
    const overworld = this.scene.get('OverworldScene');
    if (!overworld) return;

    // HUD — player card
    if (overworld.player) {
      this.elCoords.textContent  = `(${overworld.player.tileX}, ${overworld.player.tileY})`;
      this.elMapName.textContent = overworld.currentMapKey;

      // Trainer name (set once)
      if (!this._nameSet && overworld.playerName) {
        this.elTrainerName.textContent = overworld.playerName;
        this._nameSet = true;
      }

      // Money & badges (placeholder — will be wired when economy system is built)
      const money = overworld._money ?? 0;
      this.elMoney.textContent = money.toLocaleString();

      const badges = overworld._badges ?? [];
      this.elBadgeCount.textContent = badges.length;
    }

    // HUD — online status
    if (overworld.client) {
      const online = overworld.client.connected;
      const onlineCount = window.__onlineCount || 0;
      this.elStatus.innerHTML = online
        ? `<span style="color:#44ff44;font-weight:bold">(${onlineCount})</span> ONLINE`
        : 'OFFLINE';
      this.elStatus.className   = online ? 'status status-online' : 'status status-offline';
      const count = overworld.remotePlayers.size;
      this.elPlayers.textContent = count > 0 ? `${count} nearby` : '';
    }

    // Escape — close any open overlay
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      if (this.inventory.isBagOpen()) this.inventory.toggleBag(false);
      else if (this.partyStatusWindow.isOpen?.()) this.partyStatusWindow.toggle();
      else if (this._badgesOpen) this._toggleBadgesCard();
      else if (this._questLogOpen) this._toggleQuestLog();
    }

    const blocked = overworld.cutsceneActive || overworld.dialogBox?.isOpen();

    // B — toggle bag
    if (Phaser.Input.Keyboard.JustDown(this.bagKey)) {
      if (!blocked) this.inventory.toggleBag();
    }

    // P — toggle party status window
    if (Phaser.Input.Keyboard.JustDown(this.partyKey)) {
      if (!blocked) this.partyStatusWindow.toggle();
    }

    // 1–9 — use hotbar slot
    for (let i = 0; i < this.hotbarKeys.length; i++) {
      if (Phaser.Input.Keyboard.JustDown(this.hotbarKeys[i])) {
        if (overworld.cutsceneActive) return;
        const slot = window.inventory?.hotbarSlots[i];
        if (slot?.id && window.inventoryManager) {
          window.inventoryManager.tryUseItemOverworld(slot.id);
        }
        break;
      }
    }
  }

  // ── Badges Card ──────────────────────────────────────────────────────────

  _toggleBadgesCard() {
    if (!this._badgesEl) this._buildBadgesCard();
    this._badgesOpen = !this._badgesOpen;
    this._badgesEl.style.display = this._badgesOpen ? 'flex' : 'none';
    if (this._badgesOpen) this._updateBadgesCard();
  }

  _buildBadgesCard() {
    const el = document.createElement('div');
    el.id = 'badges-card';
    el.innerHTML = `
      <style>
        #badges-card {
          display: none; position: fixed; inset: 0; z-index: 1000;
          background: rgba(4,8,18,0.95);
          align-items: center; justify-content: center;
          font-family: 'Segoe UI', Arial, sans-serif; color: #ccd;
        }
        #badges-card .bc-inner {
          background: #1a1a2e; border: 2px solid rgba(255,215,0,0.5);
          border-radius: 10px; padding: 24px 32px; min-width: 320px; max-width: 500px;
          text-align: center;
        }
        #badges-card h2 { color: #ffd700; margin: 0 0 16px; font-size: 20px; }
        #badges-card .bc-grid {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
          margin-bottom: 16px;
        }
        #badges-card .bc-badge {
          width: 56px; height: 56px; margin: 0 auto;
          background: rgba(255,255,255,0.05); border: 2px solid rgba(255,255,255,0.15);
          border-radius: 8px; display: flex; align-items: center; justify-content: center;
          font-size: 24px; color: rgba(255,255,255,0.2);
        }
        #badges-card .bc-badge.earned {
          border-color: #ffd700; background: rgba(255,215,0,0.1); color: #ffd700;
        }
        #badges-card .bc-badge .bc-label {
          font-size: 9px; color: rgba(255,255,255,0.4); margin-top: 2px;
        }
        #badges-card .bc-badge.earned .bc-label { color: #ffd700; }
        #badges-card .bc-close {
          background: none; border: 1px solid rgba(255,255,255,0.3); color: #ccd;
          padding: 6px 20px; border-radius: 4px; cursor: pointer; font-size: 13px;
        }
        #badges-card .bc-close:hover { border-color: #ffd700; color: #ffd700; }
      </style>
      <div class="bc-inner">
        <h2>Badge Case</h2>
        <div class="bc-grid" id="bc-grid"></div>
        <button class="bc-close" id="bc-close">Close</button>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#bc-close').addEventListener('click', () => this._toggleBadgesCard());
    this._badgesEl = el;
  }

  _updateBadgesCard() {
    const KANTO_BADGES = [
      { name: 'Boulder', icon: '🪨' },
      { name: 'Cascade', icon: '💧' },
      { name: 'Thunder', icon: '⚡' },
      { name: 'Rainbow', icon: '🌈' },
      { name: 'Soul',    icon: '💗' },
      { name: 'Marsh',   icon: '🔮' },
      { name: 'Volcano', icon: '🌋' },
      { name: 'Earth',   icon: '🌍' },
    ];
    const overworld = this.scene.get('OverworldScene');
    const earned = overworld?._badges ?? [];
    const grid = this._badgesEl.querySelector('#bc-grid');
    grid.innerHTML = KANTO_BADGES.map((b, i) => {
      const has = earned.includes(b.name.toLowerCase());
      return `<div class="bc-badge ${has ? 'earned' : ''}">
        <div>${has ? b.icon : '?'}</div>
      </div>`;
    }).join('');
  }

  // ── Quest Log ────────────────────────────────────────────────────────────

  _toggleQuestLog() {
    if (!this._questEl) this._buildQuestLog();
    this._questLogOpen = !this._questLogOpen;
    this._questEl.style.display = this._questLogOpen ? 'flex' : 'none';
    if (this._questLogOpen) this._updateQuestLog();
  }

  _buildQuestLog() {
    const el = document.createElement('div');
    el.id = 'quest-log';
    el.innerHTML = `
      <style>
        #quest-log {
          display: none; position: fixed; inset: 0; z-index: 1000;
          background: rgba(4,8,18,0.95);
          align-items: center; justify-content: center;
          font-family: 'Segoe UI', Arial, sans-serif; color: #ccd;
        }
        #quest-log .ql-inner {
          background: #1a1a2e; border: 2px solid rgba(255,215,0,0.5);
          border-radius: 10px; padding: 24px 32px; min-width: 340px; max-width: 520px;
          width: 90vw;
        }
        #quest-log h2 { color: #ffd700; margin: 0 0 16px; font-size: 20px; text-align: center; }
        #quest-log .ql-list { max-height: 50vh; overflow-y: auto; }
        #quest-log .ql-quest {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 6px; padding: 10px 14px; margin-bottom: 8px;
        }
        #quest-log .ql-quest-title { color: #ffd700; font-weight: bold; font-size: 14px; }
        #quest-log .ql-quest-desc { color: rgba(255,255,255,0.6); font-size: 12px; margin-top: 4px; }
        #quest-log .ql-quest-status {
          font-size: 11px; margin-top: 6px; padding: 2px 8px;
          border-radius: 3px; display: inline-block;
        }
        #quest-log .ql-quest-status.active { background: rgba(68,255,68,0.15); color: #44ff44; }
        #quest-log .ql-quest-status.completed { background: rgba(255,215,0,0.15); color: #ffd700; }
        #quest-log .ql-empty { color: rgba(255,255,255,0.3); text-align: center; padding: 30px; font-style: italic; }
        #quest-log .ql-close {
          display: block; margin: 16px auto 0; background: none;
          border: 1px solid rgba(255,255,255,0.3); color: #ccd;
          padding: 6px 20px; border-radius: 4px; cursor: pointer; font-size: 13px;
        }
        #quest-log .ql-close:hover { border-color: #ffd700; color: #ffd700; }
      </style>
      <div class="ql-inner">
        <h2>Quest Log</h2>
        <div class="ql-list" id="ql-list"></div>
        <button class="ql-close" id="ql-close">Close</button>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('#ql-close').addEventListener('click', () => this._toggleQuestLog());
    this._questEl = el;
  }

  _updateQuestLog() {
    const list = this._questEl.querySelector('#ql-list');
    const quests = window.__quests ?? [];
    if (quests.length === 0) {
      list.innerHTML = '<div class="ql-empty">No quests yet. Talk to NPCs to find quests!</div>';
      return;
    }
    list.innerHTML = quests.map(q => `
      <div class="ql-quest">
        <div class="ql-quest-title">${q.title}</div>
        <div class="ql-quest-desc">${q.description ?? ''}</div>
        <span class="ql-quest-status ${q.completed ? 'completed' : 'active'}">
          ${q.completed ? 'Completed' : 'In Progress'}
        </span>
      </div>`).join('');
  }
}