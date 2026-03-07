/**
 * ExpBar.js
 * src/client/ui/ExpBar.js
 *
 * Animated EXP bar + dramatic level-up overlay for BattleScene.
 *
 * Usage (inside BattleScene, after PHASE.VICTORY result):
 *
 *   import { ExpBar } from '../ui/ExpBar.js';
 *
 *   // Create once (e.g. in BattleScene.create())
 *   this.expBar = new ExpBar(this);
 *
 *   // Play on victory — pass the full victory result from BattleState
 *   this.expBar.animateGain(result, onComplete);
 *
 * The component injects its own DOM elements and cleans them up automatically.
 * No external CSS file is required.
 */

export class ExpBar {
  /**
   * @param {Phaser.Scene} scene  - The BattleScene (used for its `add` and `cameras`)
   */
  constructor(scene) {
    this._scene = scene;
    this._ensureStyles();
  }

  /** Safely play a Phaser sound — no-ops if key not loaded. */
  _sfx(key, cfg = {}) {
    const s = this._scene;
    if (s?.cache?.audio?.exists(key)) s.sound.play(key, cfg);
  }

  /**
   * Returns the CSS bottom/right values to position inside the battle window.
   * Elements use position:fixed so they escape overflow:hidden clipping.
   */
  _battleRect() {
    const win = document.getElementById('battle-window');
    if (!win) return { bottom: '24px', right: '24px' };
    const r = win.getBoundingClientRect();
    return {
      bottom: `${window.innerHeight - r.bottom + 16}px`,
      right:  `${window.innerWidth  - r.right  + 16}px`,
    };
  }

  // ── Public ────────────────────────────────────────────────────────────────

  /**
   * Animate EXP gain, then fire onComplete when fully done.
   *
   * @param {object}   result           - The PHASE.VICTORY turn_result from BattleState
   * @param {number}   result.expGained
   * @param {number}   result.expBefore
   * @param {number}   result.expAfter
   * @param {number}   result.levelBefore
   * @param {number}   result.levelAfter
   * @param {number[]} result.levelsGained
   * @param {number}   result.expForCurrentLevel  - total EXP at start of current level
   * @param {number}   result.expForNextLevel      - total EXP required for next level
   * @param {string}   pokemonName
   * @param {Function} onComplete
   */
  animateGain(result, pokemonName, onComplete, _unused) {
    const {
      expGained,
      expBefore,
      expAfter,
      levelBefore,
      levelAfter,
      levelsGained     = [],
      expForCurrentLevel,
      expForNextLevel,
    } = result;

    // Build the container
    const speciesId = result.playerSpeciesId ?? null;
    const pos = this._battleRect();
    const wrap = this._buildBar(pokemonName, speciesId, levelBefore, expBefore, expForCurrentLevel, expForNextLevel, pos);
    document.body.appendChild(wrap);

    // Short pause so player can see the bar before it moves
    setTimeout(() => {
      if (levelsGained.length === 0) {
        // Simple fill — no level-up
        this._fillBar(wrap, expBefore, expAfter, expForCurrentLevel, expForNextLevel, () => {
          setTimeout(() => { wrap.remove(); onComplete?.(); }, 600);
        });
      } else {
        // One or more level-ups: fill to 100%, flash, bump level, repeat
        this._fillWithLevelUps(
          wrap,
          expBefore,
          expAfter,
          levelBefore,
          levelAfter,
          levelsGained,
          pokemonName,
          onComplete,
          result.statDeltas
        );
      }
    }, 400);
  }

  // ── Internal builders ─────────────────────────────────────────────────────

  _buildBar(name, speciesId, level, currentExp, expFloor, expCeil, pos = {}) {
    const pct = expCeil > expFloor
      ? Math.max(0, Math.min(100, ((currentExp - expFloor) / (expCeil - expFloor)) * 100))
      : 0;

    const iconSrc = speciesId
      ? `/assets/pokemon/Icons/${speciesId.toUpperCase()}.png`
      : null;
    const iconHtml = iconSrc
      ? `<img class="eb-icon" src="${iconSrc}" alt="${name}" onerror="this.style.display='none'">`
      : '';

    const wrap = document.createElement('div');
    wrap.className = 'eb-wrap';
    if (pos.bottom) wrap.style.bottom = pos.bottom;
    if (pos.right)  wrap.style.right  = pos.right;
    wrap.innerHTML = `
      <div class="eb-header">
        ${iconHtml}
        <div class="eb-info">
          <div class="eb-label">
            <span class="eb-name">${name}</span>
            <span class="eb-lv">Lv.<strong class="eb-lv-num">${level}</strong></span>
          </div>
          <div class="eb-track">
            <div class="eb-fill" style="width:${pct}%"></div>
            <div class="eb-glow"></div>
          </div>
          <div class="eb-gained-badge" style="opacity:0">+0 EXP</div>
        </div>
      </div>
    `;
    return wrap;
  }

  _fillBar(wrap, expBefore, expAfter, expFloor, expCeil, onDone) {
    const fill   = wrap.querySelector('.eb-fill');
    const badge  = wrap.querySelector('.eb-gained-badge');
    const gained = expAfter - expBefore;
    this._sfx('sfx_exp_gain', { volume: 0.4 });

    const pctBefore = expCeil > expFloor
      ? Math.max(0, Math.min(100, ((expBefore - expFloor) / (expCeil - expFloor)) * 100))
      : 0;
    const pctAfter = expCeil > expFloor
      ? Math.max(0, Math.min(100, ((expAfter  - expFloor) / (expCeil - expFloor)) * 100))
      : pctBefore;

    // Animate fill
    fill.style.transition = 'none';
    fill.style.width = `${pctBefore}%`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fill.style.transition = `width ${this._duration(gained)}ms cubic-bezier(0.4,0,0.2,1)`;
        fill.style.width = `${pctAfter}%`;
      });
    });

    // Badge pop
    badge.textContent = `+${gained} EXP`;
    badge.style.transition = 'opacity 0.25s';
    badge.style.opacity = '1';

    setTimeout(onDone, this._duration(gained) + 100);
  }

  /**
   * Fill bar to full, level up with flash, then continue if needed.
   */
  _fillWithLevelUps(wrap, expBefore, expAfter, levelBefore, levelAfter, levelsGained, name, onComplete, statDeltas) {
    this._pendingStatDeltas = statDeltas ?? {};
    const lvQueue = [...levelsGained]; // levels to process

    const processNext = (currentExp, currentLevel) => {
      if (lvQueue.length === 0) {
        // Final fill after last level-up
        const expFloor = Math.pow(currentLevel, 3);
        const expCeil  = Math.pow(currentLevel + 1, 3);
        this._fillBar(wrap, expFloor, expAfter, expFloor, expCeil, () => {
          setTimeout(() => { wrap.remove(); onComplete?.(); }, 700);
        });
        return;
      }

      const nextLevel  = lvQueue.shift();
      const expFloor   = Math.pow(currentLevel, 3);
      const expAtLvUp  = Math.pow(nextLevel, 3);      // exactly full at this boundary
      const expCeil    = expAtLvUp;

      const fill     = wrap.querySelector('.eb-fill');
      const lvNum    = wrap.querySelector('.eb-lv-num');
      const badge    = wrap.querySelector('.eb-gained-badge');
      const gained   = expAtLvUp - currentExp;

      // Show badge on first level-up
      if (badge.style.opacity !== '1') {
        badge.textContent = `+${expAfter - expBefore} EXP`;
        badge.style.transition = 'opacity 0.25s';
        badge.style.opacity = '1';
      }

      const pctBefore = expCeil > expFloor
        ? Math.max(0, ((currentExp - expFloor) / (expCeil - expFloor)) * 100)
        : 0;

      fill.style.transition = 'none';
      fill.style.width = `${pctBefore}%`;

      requestAnimationFrame(() => requestAnimationFrame(() => {
        fill.style.transition = `width ${this._duration(gained)}ms cubic-bezier(0.4,0,0.2,1)`;
        fill.style.width = '100%';
      }));

      setTimeout(() => {
        // Hide the EXP bar while the corner card is shown
        wrap.style.transition = 'opacity 0.2s';
        wrap.style.opacity = '0';
        wrap.style.pointerEvents = 'none';

        lvNum.textContent = nextLevel;
        this._triggerLevelUpDrama(wrap, name, nextLevel, () => {
          // Restore EXP bar, reset fill for the new level
          wrap.style.opacity = '1';
          wrap.style.pointerEvents = '';
          fill.style.transition = 'none';
          fill.style.width = '0%';
          setTimeout(() => processNext(expAtLvUp, nextLevel), 80);
        });
      }, this._duration(gained) + 80);
    };

    processNext(expBefore, levelBefore);
  }

  // ── Level-up drama ────────────────────────────────────────────────────────

  _triggerLevelUpDrama(wrap, name, newLevel, onDone) {
    // 1. Flash the EXP bar + level-up sound
    const glow = wrap.querySelector('.eb-glow');
    glow.classList.add('eb-glow--flash');
    setTimeout(() => glow.classList.remove('eb-glow--flash'), 500);
    this._sfx('sfx_level_up', { volume: 0.7 });

    // 2. Build stat rows HTML
    const deltas = this._pendingStatDeltas?.[newLevel];
    const statsHtml = deltas ? this._buildStatRows(deltas) : '';

    // 3. Build the corner card
    const card = document.createElement('div');
    const pos = this._battleRect();
    card.className = 'eb-card';
    if (pos.bottom) card.style.bottom = pos.bottom;
    if (pos.right)  card.style.right  = pos.right;
    card.innerHTML = `
      <div class="eb-card-top">
        <span class="eb-card-name">${name}</span>
        <span class="eb-card-lv">Lv.<strong>${newLevel}</strong></span>
      </div>
      <div class="eb-card-divider"></div>
      <div class="eb-card-stats">${statsHtml}</div>
      <div class="eb-card-prompt">▼ SPACE to continue</div>
    `;
    document.body.appendChild(card);

    // 4. Slide in after a short delay
    setTimeout(() => card.classList.add('eb-card--in'), 80);

    // 5. Wait for Space / Enter / click then dismiss
    const dismiss = () => {
      cleanup();
      card.classList.remove('eb-card--in');
      card.classList.add('eb-card--out');
      setTimeout(() => { card.remove(); onDone?.(); }, 420);
    };

    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        dismiss();
      }
    };
    const onClick = () => dismiss();

    const cleanup = () => {
      window.removeEventListener('keydown', onKey);
      card.removeEventListener('click', onClick);
    };

    // Small delay before accepting input so the card has time to appear
    setTimeout(() => {
      window.addEventListener('keydown', onKey);
      card.addEventListener('click', onClick);
    }, 350);
  }

  _buildStatRows(deltas) {
    const STAT_LABELS = {
      hp: 'HP', atk: 'Attack', def: 'Defense',
      spatk: 'Sp.Atk', spdef: 'Sp.Def', spd: 'Speed',
    };
    return Object.entries(STAT_LABELS).map(([key, label]) => {
      const d = deltas[key];
      if (!d) return '';
      const gain = d.after - d.before;
      return `
        <div class="eb-stat-row">
          <span class="eb-stat-label">${label}</span>
          <span class="eb-stat-before">${d.before}</span>
          <span class="eb-stat-arrow">▶</span>
          <span class="eb-stat-after">${d.after}</span>
          <span class="eb-stat-gain">+${gain}</span>
        </div>`;
    }).join('');
  }

  // ── Style injection ───────────────────────────────────────────────────────

  _ensureStyles() {
    if (document.getElementById('eb-styles')) return;
    const s = document.createElement('style');
    s.id = 'eb-styles';
    s.textContent = `
      /* ── EXP Bar container ── */
      .eb-wrap {
        position: fixed;
        bottom: 64px;
        right: 24px;
        width: 260px;
        background: rgba(10,10,30,0.92);
        border: 2px solid #4466ff;
        border-radius: 10px;
        padding: 10px 14px 12px;
        z-index: 100003;
        box-shadow: 0 0 18px rgba(68,102,255,0.45), inset 0 1px 0 rgba(255,255,255,0.08);
        font-family: 'Press Start 2P', monospace, sans-serif;
        animation: eb-slide-in 0.35s cubic-bezier(0.22,1,0.36,1) both;
      }
      @keyframes eb-slide-in {
        from { transform: translateX(120%); opacity: 0; }
        to   { transform: translateX(0);    opacity: 1; }
      }

      .eb-label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
      }
      .eb-name {
        font-size: 9px;
        color: #aaddff;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        text-shadow: 0 0 6px #4466ff;
      }
      .eb-lv {
        font-size: 8px;
        color: #ffdd44;
      }
      .eb-lv-num {
        color: #fff;
        font-size: 10px;
      }

      /* ── Track ── */
      .eb-track {
        position: relative;
        height: 12px;
        background: rgba(0,0,0,0.5);
        border-radius: 6px;
        border: 1px solid rgba(68,102,255,0.4);
        overflow: hidden;
      }
      .eb-fill {
        height: 100%;
        background: linear-gradient(90deg, #2255cc 0%, #44aaff 60%, #aaddff 100%);
        border-radius: 6px;
        box-shadow: 0 0 8px #44aaff, 0 0 2px #fff;
        will-change: width;
      }
      .eb-glow {
        position: absolute;
        inset: 0;
        border-radius: 6px;
        pointer-events: none;
        transition: opacity 0.2s;
      }
      .eb-glow--flash {
        animation: eb-glow-flash 0.5s ease-out;
      }
      @keyframes eb-glow-flash {
        0%   { background: rgba(255,255,255,0.9); }
        100% { background: transparent; }
      }

      /* ── Header layout (icon + info) ── */
      .eb-header {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .eb-icon {
        width: 40px;
        height: 40px;
        image-rendering: pixelated;
        flex-shrink: 0;
        filter: drop-shadow(0 0 4px rgba(68,170,255,0.6));
        animation: eb-icon-bounce 1.2s ease-in-out infinite alternate;
      }
      @keyframes eb-icon-bounce {
        from { transform: translateY(0px); }
        to   { transform: translateY(-3px); }
      }
      .eb-info {
        flex: 1;
        min-width: 0;
      }

      /* ── Badge ── */
      .eb-gained-badge {
        margin-top: 6px;
        font-size: 8px;
        color: #aaffcc;
        text-align: right;
        text-shadow: 0 0 6px #44ff88;
        letter-spacing: 0.5px;
      }

      /* ══════════════════════════════════════════
         LEVEL-UP CORNER CARD
      ══════════════════════════════════════════ */
      .eb-card {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 320px;
        background: rgba(8,8,24,0.97);
        border: 2px solid #4466ff;
        border-radius: 10px;
        padding: 14px 16px 12px;
        z-index: 100004;
        box-shadow:
          0 0 0 1px rgba(68,102,255,0.15),
          0 0 24px rgba(68,102,255,0.35),
          0 8px 32px rgba(0,0,0,0.7);
        font-family: 'Press Start 2P', monospace, sans-serif;
        cursor: pointer;
        transform: translateX(370px);
        opacity: 0;
        transition:
          transform 0.45s cubic-bezier(0.22,1,0.36,1),
          opacity   0.3s ease;
      }
      .eb-card--in {
        transform: translateX(0);
        opacity: 1;
      }
      .eb-card--out {
        transform: translateX(370px);
        opacity: 0;
        transition:
          transform 0.38s cubic-bezier(0.4,0,1,1),
          opacity   0.3s ease;
      }

      /* ── Card header ── */
      .eb-card-top {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
      }
      .eb-card-name {
        font-size: 11px;
        color: #aaddff;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        text-shadow: 0 0 8px #4466ff;
      }
      .eb-card-lv {
        font-size: 10px;
        color: #888;
      }
      .eb-card-lv strong {
        font-size: 14px;
        color: #ffe566;
        text-shadow: 0 0 8px #ffcc00;
      }

      /* ── Divider ── */
      .eb-card-divider {
        height: 1px;
        background: linear-gradient(90deg, rgba(68,102,255,0.6), transparent);
        margin-bottom: 10px;
      }

      /* ── Stat rows ── */
      .eb-card-stats {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 12px;
      }
      .eb-stat-row {
        display: flex;
        align-items: center;
        gap: 0;
        font-size: 18px;
        animation: eb-stat-row-in 0.25s ease both;
      }
      .eb-stat-row:nth-child(1) { animation-delay: 0.05s; }
      .eb-stat-row:nth-child(2) { animation-delay: 0.10s; }
      .eb-stat-row:nth-child(3) { animation-delay: 0.15s; }
      .eb-stat-row:nth-child(4) { animation-delay: 0.20s; }
      .eb-stat-row:nth-child(5) { animation-delay: 0.25s; }
      .eb-stat-row:nth-child(6) { animation-delay: 0.30s; }
      @keyframes eb-stat-row-in {
        from { opacity: 0; transform: translateX(6px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      .eb-stat-row:not(:last-child) {
        border-bottom: 1px solid rgba(255,255,255,0.04);
        padding-bottom: 10px;
      }
      .eb-stat-label {
        color: #6688aa;
        width: 88px;
        flex-shrink: 0;
        letter-spacing: 0.3px;
      }
      .eb-stat-before {
        color: #666;
        width: 36px;
        text-align: right;
        flex-shrink: 0;
      }
      .eb-stat-arrow {
        color: #4488ff;
        font-size: 12px;
        flex-shrink: 0;
        padding: 0 6px;
      }
      .eb-stat-after {
        color: #ffffff;
        width: 36px;
        flex-shrink: 0;
      }
      .eb-stat-gain {
        color: #44ff88;
        text-shadow: 0 0 6px #22cc66;
        flex: 1;
        text-align: right;
      }

      /* ── Prompt ── */
      .eb-card-prompt {
        font-size: 8px;
        color: #444;
        text-align: right;
        letter-spacing: 0.5px;
        animation: eb-prompt-blink 1s ease-in-out 0.6s infinite alternate;
      }
      @keyframes eb-prompt-blink {
        from { color: #444; }
        to   { color: #aaddff; }
      }
    `;
    document.head.appendChild(s);
  }

  // ── Util ──────────────────────────────────────────────────────────────────

  /** Duration of the fill animation in ms — scales with EXP gained, capped. */
  _duration(expGained) {
    return Math.min(2200, Math.max(600, expGained * 4));
  }
}
