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
import { ExpBar } from '../systems/ExpBar.js';

export class BattleScene extends Phaser.Scene {
  constructor() { super({ key: 'BattleScene' }); }

  init(data) {
    this._battleState = data.battleState;
  }

  preload() {
    // Audio loaded via fetch in create() to bypass IDM — no preload needed
  }

  create() {
    // ── Helper: safely play a sound (no-ops if asset missing) ────────────
    const sfx = (key, cfg = {}) => {
      if (this.cache.audio.exists(key)) {
        this.sound.play(key, cfg);
      }
    };

    // ── Expose sound API to UI components ─────────────────────────────────
    this._sfx = sfx;
    this._bgm = null;

    const startBgm = (key, cfg = {}) => {
      this._bgm?.stop();
      if (this.cache.audio.exists(key)) {
        this._bgm = this.sound.add(key, { loop: true, volume: 0.5, ...cfg });
        this._bgm.play();
        console.log(`[BattleScene] BGM playing: ${key}`);
      }
    };

    // ── Load audio via fetch (no .mp3 extension → bypasses IDM) ──────────
    // Runs in background — music starts as soon as it's ready.
    // UI is built immediately below so battle never waits on audio.
    this._loadAudioInBackground(sfx, startBgm);

    // If BGM already cached from a previous battle, start it immediately
    if (this.cache.audio.exists('bgm_wild_battle')) {
      startBgm('bgm_wild_battle');
    }

    // ── Build ExpBar (pass scene for sound access) ─────────────────────────
    const expBar = new ExpBar(this);

    this._ui = new BattleUI(this._battleState, expBar, (outcome) => {
      console.log('[BattleScene] onEnd callback, outcome:', outcome);
      // Victory jingle / catch already stopped BGM
      if (outcome.victory) {
        this._bgm?.stop();
        startBgm('bgm_victory', { loop: false, volume: 0.6 });
      } else if (!outcome.caught) {
        // Catch handler already stopped BGM + played sfx
        this._bgm?.stop();
      }

      this._ui.destroy();
      this._ui = null;
      this.scene.stop('BattleScene');
      const ow = this.scene.get('OverworldScene');
      if (ow) {
        console.log('[BattleScene] Resuming OverworldScene, clearing cutsceneActive');
        ow.cutsceneActive = false;
        this.scene.resume('OverworldScene');
        ow.resumeOverworldBgm?.();
        if (outcome.blackedOut) ow.events?.emit('blacked_out');
        if (outcome.caught)     ow.events?.emit('pokemon_caught', {
          speciesId: this._battleState.enemyPokemon.speciesId,
        });
      }
    });

    // ── Expose sound API to UI for hit/faint/catch sounds ──────────────────
    this._ui.sfx = sfx;
    this._ui.stopBgm = () => { this._bgm?.stop(); this._bgm = null; };
  }

  /** Load all battle audio in background via fetch (bypasses IDM). */
  _loadAudioInBackground(sfx, startBgm) {
    const audioFiles = [
      { key: 'bgm_wild_battle', path: '/audio/bgm/wild_battle' },
      { key: 'bgm_victory',     path: '/audio/bgm/victory' },
      { key: 'sfx_battle_start', path: '/audio/sfx/battle_start' },
      { key: 'sfx_exp_gain',     path: '/audio/sfx/exp_gain' },
      { key: 'sfx_level_up',     path: '/audio/sfx/level_up' },
      { key: 'sfx_hit_normal',   path: '/audio/sfx/hit_normal' },
      { key: 'sfx_hit_super',    path: '/audio/sfx/hit_super' },
      { key: 'sfx_hit_not_very', path: '/audio/sfx/hit_not_very' },
      { key: 'sfx_faint',        path: '/audio/sfx/faint' },
      { key: 'sfx_catch_success',path: '/audio/sfx/catch_success' },
      { key: 'sfx_click',        path: '/audio/sfx/click' },
    ];

    const ctx = this.sound.context;
    // Resume AudioContext if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') ctx.resume();

    const loadOne = async ({ key, path }) => {
      if (this.cache.audio.exists(key)) return;
      try {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        if (!buf.byteLength) throw new Error('empty response');
        const decoded = await ctx.decodeAudioData(buf);
        this.cache.audio.add(key, decoded);
        console.log(`[BattleScene] ✅ ${key}`);
        // Auto-start battle BGM once it finishes loading
        if (key === 'bgm_wild_battle') startBgm('bgm_wild_battle');
      } catch (e) {
        console.warn(`[BattleScene] ❌ ${key} — ${e.message}`);
      }
    };

    Promise.all(audioFiles.map(loadOne));
  }

  shutdown() {
    this._bgm?.stop();
    this._bgm = null;
    this._ui?.destroy();
    this._ui = null;
  }
}
