/**
 * BattleScene.js
 * src/client/scenes/BattleScene.js
 *
 * Phaser is used only as a lifecycle hook.
 * All rendering is a full-screen HTML overlay — BattleUI.
 *
 * Launch from EncounterManager (unchanged):
 *   scene.scene.launch('BattleScene', { battleState });
 *   scene.scene.pause('OverworldScene');
 */

import { PHASE } from '../systems/BattleState.js';
import { BattleUI } from './BattleUI.js';

export class BattleScene extends Phaser.Scene {
  constructor() { super({ key: 'BattleScene' }); }

  init(data) {
    this._battleState = data.battleState;
  }

  create() {
    this._ui = new BattleUI(this._battleState, (outcome) => {
      this._ui.destroy();
      this._ui = null;
      this.scene.stop('BattleScene');
      const ow = this.scene.get('OverworldScene');
      if (ow) {
        ow.cutsceneActive = false;
        this.scene.resume('OverworldScene');
        if (outcome.blackedOut) ow.events?.emit('blacked_out');
        if (outcome.caught)     ow.events?.emit('pokemon_caught', {
          speciesId: this._battleState.enemyPokemon.speciesId,
        });
      }
    });
  }

  shutdown() {
    this._ui?.destroy();
    this._ui = null;
  }
}
