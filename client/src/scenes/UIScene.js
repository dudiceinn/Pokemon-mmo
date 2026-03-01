import Phaser from 'phaser';

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  create() {
    // HTML HUD elements
    this.elCoords = document.querySelector('#hud-left .coords');
    this.elMapName = document.querySelector('#hud-left .map-name');
    this.elStatus = document.querySelector('#hud-right .status');
    this.elPlayers = document.querySelector('#hud-right .players');
  }

  update(time, delta) {
    const overworld = this.scene.get('OverworldScene');
    if (!overworld) return;

    if (overworld.player) {
      this.elCoords.textContent = `(${overworld.player.tileX}, ${overworld.player.tileY})`;
      this.elMapName.textContent = overworld.currentMapKey;
    }

    if (overworld.client) {
      const online = overworld.client.connected;
      this.elStatus.textContent = online ? 'ONLINE' : 'OFFLINE';
      this.elStatus.className = online ? 'status status-online' : 'status status-offline';
      const count = overworld.remotePlayers.size;
      this.elPlayers.textContent = count > 0 ? `${count} nearby` : '';
    }
  }
}
