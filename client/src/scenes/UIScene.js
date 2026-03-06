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
    this.elCoords  = document.querySelector('#hud-left .coords');
    this.elMapName = document.querySelector('#hud-left .map-name');
    this.elStatus  = document.querySelector('#hud-right .status');
    this.elPlayers = document.querySelector('#hud-right .players');

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

    // HUD — coords + map name
    if (overworld.player) {
      this.elCoords.textContent  = `(${overworld.player.tileX}, ${overworld.player.tileY})`;
      this.elMapName.textContent = overworld.currentMapKey;
    }

    // HUD — online status
    if (overworld.client) {
      const online = overworld.client.connected;
      this.elStatus.textContent = online ? 'ONLINE' : 'OFFLINE';
      this.elStatus.className   = online ? 'status status-online' : 'status status-offline';
      const count = overworld.remotePlayers.size;
      this.elPlayers.textContent = count > 0 ? `${count} nearby` : '';
    }

    // Escape — close any open overlay
    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      if (this.inventory.isBagOpen()) this.inventory.toggleBag(false);
      else if (this.partyStatusWindow.isOpen?.()) this.partyStatusWindow.toggle();
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
}