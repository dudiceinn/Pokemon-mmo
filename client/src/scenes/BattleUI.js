/**
 * BattleUI.js
 * src/client/scenes/BattleUI.js
 *
 * Full-screen HTML/CSS battle overlay.
 *
 * Sprite paths:
 *   Enemy  (front, facing player): /assets/pokemon/Front/<SPECIESID>.png
 *   Player (back,  facing enemy):  /assets/pokemon/Back/<SPECIESID>.png
 */

import { PHASE, typeMultiplier } from '../systems/BattleState.js';
import { abilityDesc } from '../systems/AbilityReader.js';

// ─── Colour maps ──────────────────────────────────────────────────────────────

const TYPE_COLORS = {
  normal:   '#A8A77A', fire:     '#EE8130', water:    '#6390F0',
  grass:    '#7AC74C', electric: '#F7D02C', ice:      '#96D9D6',
  fighting: '#C22E28', poison:   '#A33EA1', ground:   '#E2BF65',
  flying:   '#A98FF3', psychic:  '#F95587', bug:      '#A6B91A',
  rock:     '#B6A136', ghost:    '#735797', dragon:   '#6F35FC',
  dark:     '#705746', fairy:    '#D685AD', steel:    '#B7B7CE',
};

const STATUS_COLORS = {
  burn: '#EE8130', poison: '#A33EA1', paralysis: '#F7D02C',
  sleep: '#7A8A6A', freeze: '#96D9D6',
};

const STATUS_ABBR = {
  burn: 'BRN', poison: 'PSN', paralysis: 'PAR', sleep: 'SLP', freeze: 'FRZ',
};

function hpColor(ratio) {
  if (ratio > 0.5) return '#58c840';
  if (ratio > 0.2) return '#f8d030';
  return '#f03030';
}

// speciesId is always lowercase in the game — filenames are uppercase
function frontSprite(speciesId) {
  return `/pokemon-animated/front/${speciesId.toLowerCase()}.gif`;
}
function backSprite(speciesId) {
  return `/pokemon-animated/back/${speciesId.toLowerCase()}.gif`;
}

// Low-HP threshold shared by Overgrow / Blaze / Torrent / Swarm
const LOW_HP_ABILITIES = new Set(['overgrow', 'blaze', 'torrent', 'swarm']);

/**
 * Returns true if the ability badge should show its steady glow right now.
 * Low-HP abilities glow once HP ≤ 33%; all others are always-on.
 */
function _isAbilityActive(pokemon) {
  if (!pokemon?.ability) return false;
  if (LOW_HP_ABILITIES.has(pokemon.ability)) {
    return pokemon.hp / pokemon.maxHp <= 0.33;
  }
  // All other implemented abilities (Intimidate, Levitate, Static, etc.) are always-on
  return true;
}

/** Pretty-prints an ability id → display name. */
function _abilityDisplayName(id) {
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function genderSymbol(gender) {
  if (gender === 'male')   return '<span class="gender male">♂</span>';
  if (gender === 'female') return '<span class="gender female">♀</span>';
  return '';
}

// 🚀 STUNNING LUXURY UPGRADE - DROP-IN REPLACEMENT
// Just copy-paste this entire block over your existing `const CSS = `...`;`
// + the small JS tweaks below.
// This transforms the UI into a cinematic, glassmorphism masterpiece with:
// - Deep cosmic battlefield with animated aurora/particles
// - Glowing glass nameplates with animated HP shine
// - Modern premium fonts (Exo 2 + Orbitron)
// - Floating, lifting menu buttons with neon glows
// - Larger, shadowed sprites with dramatic intros/hits/faints
// - Smooth typewriter dialog with char glows
// - Gold/cyan accents everywhere
// - Responsive + performant (pure CSS animations)

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Exo+2:wght@500;600;700&display=swap');

  #battle-overlay * { box-sizing: border-box; margin: 0; padding: 0; }

  #battle-overlay {
    position: fixed; inset: 0; z-index: 99999;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Rajdhani', 'Exo 2', sans-serif;
    background: rgba(0,0,0,0.78);
    image-rendering: pixelated;
  }

  /* Battle window — 512:192 field + 96px bottom = 512x288 native GBA */
  #battle-window {
    display: flex; flex-direction: column;
    width: min(96vw, 960px);
    aspect-ratio: 512 / 288;
    border: 3px solid #404040;
    overflow: hidden;
    box-shadow: 0 8px 48px rgba(0,0,0,0.9);
    image-rendering: pixelated;
  }

  /* ── Field: 192/288 = 66.7% ── */
  #battle-field {
    position: relative;
    flex: 0 0 66.667%;
    overflow: hidden;
    background: url('/battle/field_bg.png') center/cover no-repeat;
    image-rendering: pixelated;
  }

  /* Platforms */
  .platform {
    position: absolute; pointer-events: none;
    image-rendering: pixelated;
    background-repeat: no-repeat;
    background-size: 100% 100%;
  }
  /* Enemy platform: upper-RIGHT */
  .platform-enemy {
    width: 30%; aspect-ratio: 256/80;
    top: 38%; right: 3%;
    background-image: url('/battle/grass_base1.png');
  }
  /* Player platform: lower-LEFT */
  .platform-player {
    width: 36%; aspect-ratio: 256/80;
    bottom: 4%; left: 3%;
    background-image: url('/battle/grass_base1.png');
  }

  /* ── Sprites ── */
  .poke-sprite {
    position: absolute; image-rendering: auto; object-fit: contain;
  }
  /* Enemy: centered on enemy platform */
  .poke-sprite.enemy {
    width: clamp(56px,12vw,96px); height: clamp(56px,12vw,96px);
    right: 13%; top: 24%;
  }
  /* Player: centered on player platform */
  .poke-sprite.player {
    width: clamp(64px,14vw,120px); height: clamp(64px,14vw,120px);
    left: 12%; bottom: 15%;
  }
  .poke-sprite.faint { transition: bottom 0.4s ease-in, opacity 0.4s ease-in !important; opacity: 0 !important; }
  .poke-sprite.enemy.faint  { bottom: 24% !important; }
  .poke-sprite.player.faint { bottom: -4% !important; }

  @keyframes hit-flash { 0%,100%{filter:brightness(1)} 30%{filter:brightness(5) saturate(0)} 60%{filter:brightness(1)} }
  .poke-sprite.shake { animation: hit-flash 0.35s ease; }
  @keyframes hurt-bounce {
    0%   { transform: translateX(0);    opacity: 1; }
    10%  { transform: translateX(-10px); opacity: 0.1; }
    25%  { transform: translateX(8px);  opacity: 1; }
    40%  { transform: translateX(-8px); opacity: 0.1; }
    55%  { transform: translateX(6px);  opacity: 1; }
    70%  { transform: translateX(-4px); opacity: 0.1; }
    85%  { transform: translateX(2px);  opacity: 1; }
    100% { transform: translateX(0);    opacity: 1; }
  }
  .poke-sprite.hurt { animation: hurt-bounce 0.5s ease !important; }
  @keyframes from-left  { from { left:  -25%; opacity: 0; } }
  @keyframes from-right { from { right: -25%; opacity: 0; } }
  .poke-sprite.enemy.intro  { animation: from-right 0.45s cubic-bezier(.22,.61,.36,1) both; }
  .poke-sprite.player.intro { animation: from-left  0.45s cubic-bezier(.22,.61,.36,1) both; }

  /* ── Nameplates — pure CSS, no images ── */
  .nameplate {
    position: absolute;
    display: flex; flex-direction: column; justify-content: center;
    gap: 4px;
    background: #e8e8d0;
    border: 2px solid #404040;
    border-radius: 6px;
    padding: 6px 10px 6px 10px;
    box-shadow: 3px 3px 0 rgba(0,0,0,0.35);
    font-family: 'Rajdhani', 'Exo 2', sans-serif;
    min-width: 250px;
    height: 60px; /* enemy default; player overridden to 80px in JS */
    image-rendering: pixelated;
  }
  /* Enemy nameplate: top-LEFT */
  .nameplate.enemy {
    top: 8%; left: 2%;
  }
  /* Player nameplate: bottom-RIGHT */
  .nameplate.player {
    bottom: 5%; right: 2%;
  }

  /* Type badges */
  .type-badges { display: flex; gap: 4px; margin-top: -1px; }
  .type-badge {
    font-family: 'Rajdhani', 'Exo 2', sans-serif;
    font-size: clamp(7px, 0.75vw, 10px);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #fff;
    padding: 0px 6px;
    border-radius: 3px;
    text-shadow: 0 1px 1px rgba(0,0,0,0.4);
    line-height: 1.4;
  }

  .nameplate-top {
    display: flex; align-items: center; justify-content: space-between;
    gap: 6px; line-height: 1;
  }
  .poke-name {
    font-size: clamp(11px, 1.3vw, 14px); color: #181818; font-weight: 700;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    max-width: 65%; letter-spacing: 0.03em;
  }
  .poke-level {
    font-size: clamp(10px, 1.1vw, 13px); color: #181818; font-weight: 600;
    white-space: nowrap; letter-spacing: 0.02em;
  }
  .gender        { font-size: 0.9em; }
  .gender.male   { color: #1565C0; }
  .gender.female { color: #C62828; }

  /* HP row */
  .hp-row {
    display: flex; align-items: center; gap: 5px;
  }
  .hp-label {
    font-size: clamp(10px, 1vw, 12px); color: #181818; font-weight: 700;
    white-space: nowrap; letter-spacing: 0.05em; flex-shrink: 0;
  }
  .hp-track {
    flex: 1; height: 15px;
    background: #585840;
    border-radius: 3px; overflow: hidden;
    border: 1px solid #404028;
  }
  .hp-fill {
    height: 100%; border-radius: 2px;
    transition: width 0.5s linear, background-color 0.5s;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.3);
  }

  /* HP numbers — player only */
  .hp-numbers {
    font-size: clamp(11px, 1.1vw, 13px); color: #181818; font-weight: 600;
    text-align: right; letter-spacing: 0.04em;
    align-self: flex-end;
  }

  /* EXP bar — player only */
  .exp-row {
    display: flex; align-items: center; gap: 5px;
  }
  .exp-label {
    font-size: clamp(9px, 0.9vw, 11px); color: #181818; font-weight: 600;
    white-space: nowrap; letter-spacing: 0.05em; flex-shrink: 0;
  }
  .exp-track {
    flex: 1; height: clamp(2px, 0.4vw, 4px);
    background: #383858; border-radius: 2px; overflow: hidden;
    border: 1px solid #282840;
  }
  .exp-fill { height: 100%; width: 0%; background: #4488ff; border-radius: 1px; }

  .ability-badge {
    display: inline-block; font-size: clamp(8px, 0.9vw, 10px);
    color: #555; background: #e0ddc8; border: 1px solid #bbb;
    padding: 1px 6px; border-radius: 3px; letter-spacing: 0.03em;
    font-weight: 600; margin-top: 2px;
    transition: color 0.35s, background 0.35s, border-color 0.35s, box-shadow 0.35s;
  }
  /* Steady glow — low-HP abilities (Overgrow / Blaze / Torrent) */
  .ability-badge.ability-glow {
    color: #fff2cc;
    background: #3a2000;
    border-color: #ffaa00;
    box-shadow: 0 0 5px 1px #ffaa0077, inset 0 0 3px #ffee8844;
    animation: ability-pulse 1.4s ease-in-out infinite;
  }
  @keyframes ability-pulse {
    0%, 100% { box-shadow: 0 0 4px 1px #ffaa0055, inset 0 0 2px #ffee8833; }
    50%       { box-shadow: 0 0 12px 4px #ffcc44bb, inset 0 0 6px #ffee8899; }
  }
  /* One-shot throb — fires when ability triggers (e.g. Intimidate on entry) */
  .ability-badge.ability-throb {
    animation: ability-throb 0.7s ease-out forwards;
  }
  @keyframes ability-throb {
    0%   { color: #555;    background: #e0ddc8; border-color: #bbb;    box-shadow: none; transform: scale(1);    }
    20%  { color: #fff;    background: #7a3800; border-color: #ff8800; box-shadow: 0 0 18px 6px #ff880099;      transform: scale(1.25); }
    55%  { color: #fff2cc; background: #3a2000; border-color: #ffaa00; box-shadow: 0 0 10px 3px #ffaa0077;      transform: scale(1.08); }
    100% { color: #fff2cc; background: #3a2000; border-color: #ffaa00; box-shadow: 0 0 5px 1px #ffaa0055;       transform: scale(1);    }
  }
  .status-badge {
    display: inline-block; font-size: clamp(5px, 0.75vw, 7px);
    color: #fff; padding: 2px 5px; border-radius: 3px;
    letter-spacing: 0.04em; align-self: flex-start;
  }

  /* ── Bottom panel: 96/288 = 33.3% ── */
  #battle-bottom {
    flex: 0 0 33.333%;
    display: flex; flex-direction: row;
    background: #f0ede0;
    border-top: 3px solid #404040;
  }

  /* Dialog box — left 55%, white with black border */
  #battle-dialog {
    flex: 0 0 55%;
    position: relative;
    background: #fff;
    border-right: 3px solid #404040;
    display: flex; align-items: center;
    padding: 6% 7% 8% 7%;
    cursor: pointer; overflow: hidden;
  }
  #battle-dialog-text {
    font-size: clamp(13px,1.6vw,17px); color: #101010; font-weight: 600; letter-spacing: 0.02em;
    line-height: 2.2; white-space: pre-wrap; text-align: left;
    position: relative; z-index: 1; width: 100%;
  }
  #dialog-arrow {
    position: absolute; right: 6%; bottom: 10%;
    font-size: clamp(6px,1vw,9px); color: #505050;
    animation: blink 0.65s infinite; display: none; z-index: 1;
  }
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }

  /* Main menu — right 45%, dark GBA-style */
  #battle-menu {
    flex: 1;
    background: #1a1a2e;
    display: grid; padding: 5% 4% 5% 6%; gap: 3%;
    align-content: center;
  }
  #battle-menu.main-menu {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
  }
  #battle-menu.list-menu {
    background: #1a1a2e;
    grid-template-columns: 1fr;
    grid-auto-rows: auto;
    overflow-y: auto; align-content: start;
    padding: 4% 3%;
  }

  /* Main menu buttons — white on dark */
  #battle-overlay .battle-btn {
    font-family: 'Rajdhani', 'Exo 2', sans-serif;
    font-size: clamp(13px,1.5vw,16px); color: #f0f0f0; font-weight: 700; letter-spacing: 0.05em;
    background: transparent; border: none; cursor: pointer;
    padding: 4px 4px 4px 28px;
    display: flex; align-items: center; text-align: left;
    line-height: 1.6; letter-spacing: 0.05em;
    user-select: none; position: relative;
    -webkit-tap-highlight-color: transparent;
    white-space: nowrap;
    text-shadow: 1px 1px 0 #000;
  }
  #battle-overlay .battle-btn::before { content: ''; position: absolute; left: 10px; font-size: 0.7em; line-height: 1; color: #f0f0f0; top: 50%; transform: translateY(-50%); }
  #battle-overlay .battle-btn:hover::before, #battle-overlay .battle-btn:focus::before { content: '▶'; }
  #battle-overlay .battle-btn:hover, #battle-overlay .battle-btn:focus { outline: none; color: #ffd700; text-shadow: 1px 1px 0 #000; }
  #battle-overlay .battle-btn:hover::before, #battle-overlay .battle-btn:focus::before { color: #ffd700; }
  .battle-btn:active { transform: translateX(2px); }
  .battle-btn.disabled { opacity: 0.38; cursor: not-allowed; pointer-events: none; }

  /* ── Fight mode: hide dialog, menu spans full width ── */
  #battle-bottom.fight-active #battle-dialog { display: none; }
  #battle-bottom.fight-active #battle-menu   { flex: 1 1 100%; }

  /* ── Fight menu: full-width, moves 2x2 grid + info panel ── */
  #battle-menu.fight-menu {
    display: flex; flex-direction: row;
    background: #fff;
    padding: 0; gap: 0; align-items: stretch;
  }

  /* Move grid — takes up remaining space left of info panel */
  .fight-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    padding: 8px 12px 8px 60px;
    gap: 0;
    align-items: center;
    justify-items: start;
  }

  #battle-overlay .fight-btn {
    font-family: 'Rajdhani', 'Exo 2', sans-serif;
    font-size: clamp(13px, 1.6vw, 17px); font-weight: 700;
    color: #181818; background: transparent; border: none;
    cursor: pointer;
    padding: 8px 6px 8px 32px;
    text-align: left; white-space: nowrap;
    line-height: 1.4; letter-spacing: 0.04em;
    position: relative; width: 100%;
    -webkit-tap-highlight-color: transparent;
    display: flex; align-items: center;
  }
  #battle-overlay .fight-btn::before {
    content: ''; position: absolute; left: 8px;
    font-size: 0.55em; line-height: 1; color: #181818;
    top: 50%; transform: translateY(-50%);
  }
  #battle-overlay .fight-btn:hover::before, #battle-overlay .fight-btn:focus::before, #battle-overlay .fight-btn.selected::before { content: '▶'; }
  #battle-overlay .fight-btn:hover, #battle-overlay .fight-btn:focus, #battle-overlay .fight-btn.selected { outline: none; }
  #battle-overlay .fight-btn.disabled { opacity: 0.35; cursor: not-allowed; pointer-events: none; }

  /* PP / Type info panel — fixed width right side */
  .fight-info {
    width: 250px;
    flex-shrink: 0;
    display: flex; flex-direction: column;
    align-items: flex-start; justify-content: space-between;
    gap: 0;
    padding: 12px 14px 12px 16px;
    border-left: 3px solid #404040;
    background: #f0ede0;
  }
  .fi-top { display: flex; flex-direction: column; gap: 6px; }
  .fi-label {
    font-family: 'Rajdhani', 'Exo 2', sans-serif;
    font-size: clamp(10px, 1vw, 12px);
    color: #888; letter-spacing: 0.08em; font-weight: 600;
    text-transform: uppercase;
  }
  .fi-pp {
    font-family: 'Rajdhani', 'Exo 2', sans-serif;
    font-size: clamp(20px, 2.5vw, 26px);
    color: #181818; white-space: nowrap; letter-spacing: 0.02em; font-weight: 700;
    line-height: 1;
  }
  .fi-pp.empty { color: #cc0000; }
  .fi-type-row { display: flex; align-items: center; }
  .fi-type-badge {
    font-family: 'Rajdhani', 'Exo 2', sans-serif;
    font-size: clamp(12px, 1.3vw, 15px);
    color: #fff; padding: 4px 14px; border-radius: 20px; font-weight: 700;
    text-shadow: 0 1px 2px rgba(0,0,0,0.4); white-space: nowrap;
    letter-spacing: 0.06em; text-transform: uppercase;
  }
  .fi-effectiveness {
    font-family: 'Rajdhani', 'Exo 2', sans-serif;
    font-size: clamp(10px, 1.1vw, 13px);
    font-weight: 700;
    letter-spacing: 0.04em;
    margin-top: 2px;
    min-height: 1.2em;
  }
  .fi-back {
    font-family: 'Rajdhani', 'Exo 2', sans-serif;
    font-size: clamp(13px, 1.4vw, 16px);
    background: #404040; border: 2px solid #404040; border-radius: 6px;
    color: #fff; cursor: pointer; font-weight: 700;
    padding: 8px 0; width: 100%;
    letter-spacing: 0.06em; text-align: center; text-transform: uppercase;
  }
  .fi-back:hover { background: #222; border-color: #222; }

  .menu-back-row { grid-column: 1/-1; display: flex; justify-content: flex-end; align-items: center; }
  .back-btn {
    font-family: 'Rajdhani', 'Exo 2', sans-serif; font-size: clamp(6px, 0.9vw, 8px);
    background: none; border: none; color: #aaa; cursor: pointer;
    padding: 4px 6px; text-decoration: underline;
  }
  .back-btn:hover { color: #ffd700; }

  /* ── Stat stage badges (above nameplate) ── */
  .stage-badges {
    display: flex; flex-wrap: wrap; gap: 3px;
    pointer-events: none;
    margin-bottom: 3px;
  }
  .stage-badge {
    font-family: 'Rajdhani', 'Exo 2', sans-serif;
    font-size: clamp(8px, 0.9vw, 11px);
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    letter-spacing: 0.04em;
    white-space: nowrap;
    animation: stage-pop 0.25s cubic-bezier(0.22,1,0.36,1) both;
  }
  .stage-badge.buff {
    color: #fff;
    background: #2a8c3a;
    border: 1px solid #3cb850;
    text-shadow: 0 1px 1px rgba(0,0,0,0.3);
  }
  .stage-badge.debuff {
    color: #fff;
    background: #a83232;
    border: 1px solid #cc4444;
    text-shadow: 0 1px 1px rgba(0,0,0,0.3);
  }
  @keyframes stage-pop {
    from { transform: scale(0.5); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }

  /* Pokeball catch animation */
  .pokeball-sprite {
    position: absolute;
    width: 52px; height: 52px;
    z-index: 10;
    pointer-events: none;
    image-rendering: pixelated;
  }
  /* Catch success particles */
  .catch-particle {
    position: absolute;
    pointer-events: none;
    z-index: 11;
    font-size: 14px;
    animation: particle-burst var(--dur, 0.8s) ease-out forwards;
  }
  .catch-sparkle {
    position: absolute;
    pointer-events: none;
    z-index: 11;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #ffd700;
    box-shadow: 0 0 6px 2px #ffd70088;
    animation: sparkle-burst var(--dur, 0.7s) ease-out forwards;
  }
  @keyframes particle-burst {
    0%   { transform: translate(0,0) scale(0.5); opacity: 1; }
    60%  { opacity: 1; }
    100% { transform: translate(var(--tx), var(--ty)) scale(1.2) rotate(var(--rot, 0deg)); opacity: 0; }
  }
  @keyframes sparkle-burst {
    0%   { transform: translate(0,0) scale(0.3); opacity: 1; }
    50%  { opacity: 1; }
    100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
  }
  @keyframes ball-throw {
    0%   { bottom: 10%; right: 70%; opacity: 1; transform: scale(0.5) rotate(0deg); }
    50%  { bottom: 60%; right: 30%; transform: scale(1) rotate(360deg); }
    100% { bottom: 40%; right: 14%; opacity: 1; transform: scale(0.7) rotate(720deg); }
  }
  @keyframes ball-wiggle {
    0%,100% { transform: scale(0.7) rotate(0deg); }
    20%     { transform: scale(0.7) rotate(20deg); }
    40%     { transform: scale(0.7) rotate(-20deg); }
    60%     { transform: scale(0.7) rotate(12deg); }
    80%     { transform: scale(0.7) rotate(-6deg); }
  }
  @keyframes ball-click {
    0%   { transform: scale(0.7); }
    50%  { transform: scale(0.9); filter: brightness(2); }
    100% { transform: scale(0); opacity: 0; }
  }
  /* Break-free animations — ball bursts open */
  @keyframes ball-break-1 {
    0%   { transform: scale(0.7); }
    30%  { transform: scale(1.2) rotate(-20deg); filter: brightness(2); }
    60%  { transform: scale(1.4) rotate(10deg); opacity: 0.6; }
    100% { transform: scale(1.8) rotate(0deg); opacity: 0; }
  }
  @keyframes ball-break-2 {
    0%   { transform: scale(0.7); }
    20%  { transform: scale(0.8) rotate(15deg); }
    50%  { transform: scale(1.2) rotate(-10deg); filter: brightness(2.5); }
    100% { transform: scale(1.6) translateY(-20px); opacity: 0; }
  }
  @keyframes ball-break-3 {
    0%   { transform: scale(0.7); }
    25%  { transform: scale(1.0) rotate(25deg); }
    50%  { transform: scale(0.8) rotate(-25deg); filter: brightness(1.8); }
    75%  { transform: scale(1.3); filter: brightness(3); }
    100% { transform: scale(1.8) rotate(0deg); opacity: 0; }
  }
  /* Enemy flash when breaking free */
  @keyframes break-free-flash {
    0%   { opacity: 0; transform: scale(0.3); }
    40%  { opacity: 1; transform: scale(1.1); filter: brightness(2); }
    100% { opacity: 1; transform: scale(1); filter: brightness(1); }
  }

  /* Overlays */
  #battle-flash { position: fixed; inset: 0; z-index: 100002; background: #fff; pointer-events: none; opacity: 0; }
  #battle-flash.active { animation: do-flash 0.2s ease forwards; }
  @keyframes do-flash { 0%,100%{opacity:0} 45%{opacity:1} }
  #battle-fade  { position: fixed; inset: 0; z-index: 100001; background: #000; pointer-events: none; opacity: 0; transition: opacity 0.5s ease; }
  #battle-fade.active { opacity: 1; }

  /* ── Ability tooltip ── */
  .ability-tooltip {
    position: fixed;
    z-index: 100010;
    background: #1a1a2e;
    border: 1px solid #ffaa00;
    border-radius: 6px;
    padding: 6px 10px;
    font-family: 'Rajdhani', 'Exo 2', sans-serif;
    font-size: clamp(11px, 1.1vw, 13px);
    color: #f0e8cc;
    max-width: 220px;
    pointer-events: none;
    box-shadow: 0 2px 12px rgba(0,0,0,0.7);
    line-height: 1.4;
    white-space: normal;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .ability-tooltip.visible { opacity: 1; }

`;

// ─── BattleUI ────────────────────────────────────────────────────────────────

export class BattleUI {
  constructor(battleState, expBar, onEnd) {
    this._bs     = battleState;
    this._expBar = expBar ?? null;
    this._onEnd  = onEnd;
    this._busy   = false;
    this._prevPlayerHp = battleState.playerPokemon.hp;
    this._prevEnemyHp  = battleState.enemyPokemon.hp;

    this._injectStyles();
    this._buildDOM();
    this._bs.onResult(r => this._onResult(r));
    this._playIntro();
  }

  /** Play UI click sound. */
  _click() { if (this.sfx) this.sfx('sfx_click', { volume: 0.5 }); }

  // ── DOM ───────────────────────────────────────────────────────────────────

  _injectStyles() {
    // Always replace to ensure latest CSS is applied
    const existing = document.getElementById('battle-ui-styles');
    if (existing) existing.remove();
    const s = document.createElement('style');
    s.id = 'battle-ui-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
    // Debug: verify key values loaded
    console.log('[BattleUI] Styles injected. fight-grid paddingLeft should be 60px, fight-btn 32px');

    // Shared tooltip element — one instance reused for all ability badges
    if (!document.getElementById('ability-tooltip')) {
      this._tooltip = document.createElement('div');
      this._tooltip.id = 'ability-tooltip';
      this._tooltip.className = 'ability-tooltip';
      document.body.appendChild(this._tooltip);
    } else {
      this._tooltip = document.getElementById('ability-tooltip');
    }
  }

  // ── Tooltip helpers ───────────────────────────────────────────────────────

  _bindAbilityTooltip(badgeEl, abilityId) {
    badgeEl.addEventListener('mouseenter', () => this._showTooltip(badgeEl, abilityId));
    badgeEl.addEventListener('mouseleave', () => this._hideTooltip());
    badgeEl.style.cursor = 'help';
  }

  _showTooltip(anchorEl, abilityId) {
    const desc = abilityDesc(abilityId);
    if (!desc) return;
    this._tooltip.textContent = desc;
    this._tooltip.classList.add('visible');
    const r = anchorEl.getBoundingClientRect();
    this._tooltip.style.left = `${r.left + r.width / 2}px`;
    this._tooltip.style.top  = `${r.top - 6}px`;
  }

  _hideTooltip() {
    if (this._tooltip) this._tooltip.classList.remove('visible');
  }

  _buildDOM() {
    const ep = this._bs.enemyPokemon;
    const pp = this._bs.playerPokemon;

    const root = document.createElement('div');
    root.id = 'battle-overlay';
    root.innerHTML = `
      <div id="battle-window">
      <div id="battle-field">
        <div class="platform platform-enemy"></div>
        <div class="platform platform-player"></div>

        <img class="poke-sprite enemy intro" id="enemy-sprite"
             src="${frontSprite(ep.speciesId)}" alt="${ep.name}"
             onerror="this.style.visibility='hidden'">

        <img class="poke-sprite player intro" id="player-sprite"
             src="${backSprite(pp.speciesId)}" alt="${pp.name}"
             onerror="this.style.visibility='hidden'">

        <div class="nameplate enemy"  id="enemy-plate"></div>
        <div class="nameplate player" id="player-plate"></div>
      </div>

      <div id="battle-bottom">
        <div id="battle-dialog">
          <span id="battle-dialog-text"></span>
          <span id="dialog-arrow">▼</span>
        </div>
        <div id="battle-menu" class="main-menu"></div>
      </div>

      </div><!-- /battle-window -->
      <div id="battle-flash"></div>
      <div id="battle-fade"></div>
    `;
    document.body.appendChild(root);
    this._root = root;

    this._enemySprite  = root.querySelector('#enemy-sprite');
    this._playerSprite = root.querySelector('#player-sprite');
    this._enemyPlate   = root.querySelector('#enemy-plate');
    this._playerPlate  = root.querySelector('#player-plate');
    this._dialogText   = root.querySelector('#battle-dialog-text');
    this._dialogArrow  = root.querySelector('#dialog-arrow');
    this._dialogEl     = root.querySelector('#battle-dialog');
    this._menu         = root.querySelector('#battle-menu');
    this._flash        = root.querySelector('#battle-flash');
    this._fade         = root.querySelector('#battle-fade');

    this._renderPlate(this._enemyPlate,  ep, false);
    this._renderPlate(this._playerPlate, pp, true);
  }

  // ── Nameplates ────────────────────────────────────────────────────────────

  _renderPlate(el, pokemon, isPlayer) {
    // Height: taller when ability badge is present
    const hasAbility = !!pokemon.ability;
    el.style.minWidth = '250px';
    el.style.height   = isPlayer
      ? (hasAbility ? '110px' : '94px')
      : (hasAbility ? '88px' : '74px');

    const ratio  = Math.max(0, pokemon.hp / pokemon.maxHp);
    const color  = hpColor(ratio);
    const hpW    = Math.round(ratio * 100);
    const status = pokemon.status
      ? `<div class="status-badge" style="background:${STATUS_COLORS[pokemon.status]??'#888'}">${STATUS_ABBR[pokemon.status]??pokemon.status}</div>`
      : '';
    const hpNums = isPlayer ? `<div class="hp-numbers">${pokemon.hp} / ${pokemon.maxHp}</div>` : '';

    // Ability badge — shown on both player and enemy
    const abilityActive = hasAbility && _isAbilityActive(pokemon);
    const abilityBadge  = hasAbility
      ? `<div class="ability-badge${abilityActive ? ' ability-glow' : ''}">${_abilityDisplayName(pokemon.ability)}</div>`
      : '';

    let expBar = '';
    if (isPlayer) {
      const pLv      = pokemon.level;
      const pExp     = pokemon.exp ?? Math.pow(pLv, 3);
      const expThis  = Math.pow(pLv, 3);
      const expNext  = Math.pow(pLv + 1, 3);
      const expPct   = pLv >= 100 ? 100
        : Math.max(0, Math.min(100, ((pExp - expThis) / (expNext - expThis)) * 100));
      expBar = `<div class="exp-row"><span class="exp-label">EXP</span><div class="exp-track"><div class="exp-fill" style="width:${expPct.toFixed(1)}%"></div></div></div>`;
    }

    const types = pokemon.types ?? [];
    const typeBadges = types.map(t =>
      `<span class="type-badge" style="background:${TYPE_COLORS[t] ?? '#888'}">${t}</span>`
    ).join('');

    el.innerHTML = `
      <div class="nameplate-top">
        <span class="poke-name">${pokemon.name}${genderSymbol(pokemon.gender)}</span>
        <span class="poke-level">Lv.${pokemon.level}</span>
      </div>
      <div class="type-badges">${typeBadges}</div>
      <div class="hp-row">
        <span class="hp-label">HP</span>
        <div class="hp-track" style="height:15px">
          <div class="hp-fill" style="width:${hpW}%;background-color:${color}"></div>
        </div>
      </div>
      ${hpNums}${abilityBadge}${status}${expBar}
    `;

    // Bind tooltip to ability badge if present
    if (hasAbility) {
      const badgeEl = el.querySelector('.ability-badge');
      if (badgeEl) this._bindAbilityTooltip(badgeEl, pokemon.ability);
    }

    // Render stat stage badges above nameplate
    this._renderStageBadges(el, pokemon, isPlayer);
  }

  _refreshPlates() {
    this._animateHp(this._enemyPlate,  this._bs.enemyPokemon,  false);
    this._animateHp(this._playerPlate, this._bs.playerPokemon, true);
  }

  _animateHp(plateEl, pokemon, isPlayer) {
    const fill  = plateEl.querySelector('.hp-fill');
    const nums  = plateEl.querySelector('.hp-numbers');
    const badge = plateEl.querySelector('.status-badge');
    if (!fill) return;

    const ratio = Math.max(0, pokemon.hp / pokemon.maxHp);
    fill.style.width           = `${Math.round(ratio * 100)}%`;
    fill.style.backgroundColor = hpColor(ratio);
    if (nums) nums.textContent = `${pokemon.hp} / ${pokemon.maxHp}`;

    if (badge) badge.remove();
    if (pokemon.status) {
      const b = document.createElement('div');
      b.className = 'status-badge';
      b.style.background = STATUS_COLORS[pokemon.status] ?? '#888';
      b.textContent = STATUS_ABBR[pokemon.status] ?? pokemon.status;
      plateEl.appendChild(b);
    }

    // Refresh ability badge glow — low-HP abilities activate mid-battle
    const abilityEl = plateEl.querySelector('.ability-badge');
    if (abilityEl && !abilityEl.classList.contains('ability-throb')) {
      abilityEl.classList.toggle('ability-glow', _isAbilityActive(pokemon));
    }

    // Refresh stat stage badges
    this._renderStageBadges(plateEl, pokemon, isPlayer);
  }

  _renderStageBadges(plateEl, pokemon, isPlayer) {
    const STAT_LABELS = {
      atk: 'ATK', def: 'DEF', spatk: 'SPA',
      spdef: 'SPD', spd: 'SPE', accuracy: 'ACC', evasion: 'EVA',
    };
    if (!plateEl) return;

    // Remove existing badge container inside this plate
    plateEl.querySelector('.stage-badges')?.remove();

    const stages = pokemon.stages;
    const nonZero = Object.entries(STAT_LABELS).filter(([key]) => stages[key] !== 0);
    if (nonZero.length === 0) return;

    const container = document.createElement('div');
    container.className = 'stage-badges';

    for (const [key, label] of nonZero) {
      const val = stages[key];
      const badge = document.createElement('span');
      badge.className = `stage-badge ${val > 0 ? 'buff' : 'debuff'}`;
      badge.textContent = `${label}${val > 0 ? '+' : ''}${val}`;
      container.appendChild(badge);
    }

    // Insert as first child so badges appear above the nameplate content
    plateEl.insertBefore(container, plateEl.firstChild);
  }

  _playExpAnimation(result, onDone) {
    const playerName = this._bs.playerPokemon.name;

    // ── Delegate to the full-screen ExpBar component if available ─────────
    if (this._expBar && result.expGained) {
      // Also update the inline nameplate EXP fill to the final value
      // so it's correct when battle ends and ExpBar is gone.
      this._updateInlineExpFill();
      this._expBar.animateGain(result, playerName, onDone);
      return;
    }

    // ── Fallback: animate only the inline nameplate EXP bar ──────────────
    this._animateExpBar(onDone);
  }

  _updateInlineExpFill() {
    const fill = this._playerPlate?.querySelector('.exp-fill');
    if (!fill) return;
    const p       = this._bs.playerPokemon;
    const level   = p.level;
    const expNow  = p.exp;
    const expThis = Math.pow(level, 3);
    const expNext = Math.pow(level + 1, 3);
    const pct = level >= 100 ? 100
      : Math.max(0, Math.min(100, ((expNow - expThis) / (expNext - expThis)) * 100));
    // Update level number on nameplate too (in case of level-up)
    const lvEl = this._playerPlate?.querySelector('.poke-level');
    if (lvEl) lvEl.textContent = `Lv.${level}`;
    fill.style.transition = 'width 0.5s ease';
    fill.style.width = pct + '%';
  }

  _animateExpBar(onDone) {
    const fill = this._playerPlate?.querySelector('.exp-fill');
    if (!fill) { onDone?.(); return; }
    const p      = this._bs.playerPokemon;
    const level  = p.level;
    const expNow = p.exp;
    const expThis = Math.pow(level, 3);
    const expNext = Math.pow(level + 1, 3);
    const pct = level >= 100 ? 100
      : Math.max(0, Math.min(100, ((expNow - expThis) / (expNext - expThis)) * 100));
    fill.style.transition = 'width 0.8s ease';
    fill.style.width = pct + '%';
    setTimeout(() => onDone?.(), 850);
  }

  // ── Intro ─────────────────────────────────────────────────────────────────

  _playIntro() {
    this._busy = true;
    setTimeout(() => {
      this._showDialog(`A wild ${this._bs.enemyPokemon.name} appeared!`, () => {
        this._busy = false;
        this._bs.startPlayerTurn();
      });
    }, 500);
  }

  // ── Result handler ────────────────────────────────────────────────────────

  _onResult(result) {
    switch (result.type) {
      case 'turn_start':
        if (result.entryLog?.length) {
          this._busy = true;
          this._showLog(result.entryLog, () => {
            this._busy = false;
            this._showMainMenu();
          });
        } else {
          this._showMainMenu();
        }
        break;
      case 'turn_result':
        this._busy = true;
        this._clearMenu();
        this._showLog(result.log, () => {
          this._refreshPlates();
          this._handlePhase(result);
        });
        break;
      case 'catch_result':
        this._busy = true;
        this._clearMenu();
        this._playCatch(result.wobbles, result.caught, result.log, result.ballId, () => {
          this._refreshPlates();
          if (result.caught) {
            // BGM + SFX already triggered in _playCatch on ball click
            setTimeout(() => this._endBattle({ caught: true }), 2500);
          } else {
            // Ball animation done — now enemy gets a free turn
            this._bs.resolveFailedCatch();
          }
        });
        break;
      case 'flee_result':
        this._busy = true;
        this._clearMenu();
        this._showLog(result.log, () => this._handlePhase(result));
        break;
    }
  }

  _handlePhase(result) {
    switch (result.phase) {
      case PHASE.PLAYER_TURN:
        this._busy = false;
        this._showMainMenu();
        break;
      case PHASE.VICTORY:
        console.log('[BattleUI] VICTORY — starting faint sprite');
        // Stop battle BGM so EXP gain SFX can be heard clearly
        if (this.stopBgm) this.stopBgm();
        this._faintSprite(true, () => {
          console.log('[BattleUI] VICTORY — faint done, starting EXP animation');
          this._playExpAnimation(result, () => {
            console.log('[BattleUI] VICTORY — EXP done, calling _endBattle');
            this._endBattle({ victory: true });
          });
        });
        break;
      case PHASE.FAINTED:
        this._faintSprite(false, () => {
          this._showLog([`${this._bs.playerPokemon.name} fainted!`], () => {
            this._swapToNext(result.nextPokemon);
          });
        });
        break;
      case PHASE.BLACKED_OUT:
        this._faintSprite(false, () => {
          this._showLog([
            `${this._bs.playerPokemon.name} fainted!`,
            'You have no more Pokémon!',
            'You blacked out!',
          ], () => this._endBattle({ blackedOut: true }));
        });
        break;
      case PHASE.CAUGHT:
        // Handled directly in catch_result callback (after ball animation)
        break;
      case PHASE.FLED:
        this._endBattle({ fled: true });
        break;
    }
  }

  // ── Menus ─────────────────────────────────────────────────────────────────

  _clearMenu() {
    this._menu.innerHTML = '';
    this._dialogEl?.closest('#battle-bottom')?.classList.remove('fight-active');
  }

  _showMainMenu() {
    this._clearMenu();
    this._menu.className = 'main-menu';
    const pName = this._bs.playerPokemon.name || this._bs.playerPokemon.speciesId || 'Pokémon';
    this._setDialog(`What will ${pName} do?`);
    const btns = [
      { label: 'FIGHT',   fn: () => this._showFightMenu()   },
      { label: 'BAG',     fn: () => this._showBagMenu()     },
      { label: 'POKÉMON', fn: () => this._showPokemonMenu() },
      { label: 'RUN',     fn: () => this._doRun()           },
    ];
    for (const b of btns) this._menu.appendChild(this._makeBtn(b.label, b.fn));
  }

  _showFightMenu() {
    this._clearMenu();
    this._menu.className = 'fight-menu';
    this._dialogEl.closest('#battle-bottom').classList.add('fight-active');
    this._setDialog('');

    const moves = this._bs.playerPokemon.moves;

    // Left side: 2x2 move grid
    const grid = document.createElement('div');
    grid.className = 'fight-grid';
    grid.style.paddingLeft = '60px'; // guaranteed regardless of CSS cache

    // Right side: GBA-style PP / Type info panel
    const info = document.createElement('div');
    info.className = 'fight-info';
    info.style.width = '250px'; // guaranteed regardless of CSS cache
    info.innerHTML = `
      <div class="fi-top">
        <div class="fi-label">PP</div>
        <div class="fi-pp">--/--</div>
        <div class="fi-type-row"><span class="fi-type-badge" style="background:#888">------</span></div>
        <div class="fi-effectiveness"></div>
      </div>
      <button class="fi-back">← BACK</button>
    `;
    info.querySelector('.fi-back').addEventListener('click', () => { this._click(); this._showMainMenu(); });

    const enemyTypes = this._bs.enemyPokemon.types ?? [];
    const updateInfo = (move) => {
      const ppEl   = info.querySelector('.fi-pp');
      const badge  = info.querySelector('.fi-type-badge');
      const label  = info.querySelector('.fi-label');
      const effEl  = info.querySelector('.fi-effectiveness');
      if (label) label.textContent = 'PP';
      if (!move) {
        ppEl.textContent = '--/--'; ppEl.className = 'fi-pp';
        badge.textContent = '------'; badge.style.background = '#888';
        effEl.textContent = ''; effEl.style.color = '#888';
        return;
      }
      const empty = move.pp <= 0;
      ppEl.textContent = `${move.pp}/${move.maxPp}`;
      ppEl.className = 'fi-pp' + (empty ? ' empty' : '');
      badge.textContent = move.type.toUpperCase();
      badge.style.background = TYPE_COLORS[move.type] ?? '#888';

      // Effectiveness indicator
      if (move.category === 'status') {
        effEl.textContent = ''; effEl.style.color = '#888';
      } else {
        const mult = typeMultiplier(move.type, enemyTypes);
        if (mult === 0)       { effEl.textContent = 'No effect';          effEl.style.color = '#666'; }
        else if (mult < 1)    { effEl.textContent = 'Not very effective'; effEl.style.color = '#a06030'; }
        else if (mult > 1)    { effEl.textContent = 'Super effective!';   effEl.style.color = '#30a040'; }
        else                  { effEl.textContent = '';                    effEl.style.color = '#888'; }
      }
    };

    const firstValidMove = moves.find(m => m && m.pp > 0) ?? moves.find(m => m);
    updateInfo(firstValidMove ?? null);

    let selectedBtn = null;
    const selectBtn = (btn, playSound = true) => {
      if (btn === selectedBtn) return;
      if (selectedBtn) selectedBtn.classList.remove('selected');
      selectedBtn = btn;
      if (btn) btn.classList.add('selected');
      if (playSound) this._click();
    };

    for (let i = 0; i < 4; i++) {
      const move = moves[i];
      const btn  = document.createElement('button');
      btn.className = 'fight-btn' + (!move || move.pp <= 0 ? ' disabled' : '');
      btn.style.paddingLeft = '32px'; // guaranteed regardless of CSS cache
      btn.textContent = move ? move.name.toUpperCase() : '-';

      if (move) {
        btn.addEventListener('mouseenter', () => { updateInfo(move); selectBtn(btn); });
        btn.addEventListener('focus',      () => { updateInfo(move); selectBtn(btn); });
      }

      if (move && move === firstValidMove && !selectedBtn) selectBtn(btn, false);

      if (move && move.pp > 0) {
        const slot = i;
        btn.addEventListener('click', () => {
          if (this._busy) return;
          this._click();
          this._busy = true;
          this._clearMenu();
          this._bs.submitAction({ type: 'move', slot });
        });
      }
      grid.appendChild(btn);
    }

    this._menu.appendChild(grid);
    this._menu.appendChild(info);
  }

  _showBagMenu() {
    this._clearMenu();
    this._menu.className = 'list-menu';
    this._setDialog('Choose an item:');
    const im     = window.inventoryManager ?? null;
    const usable = [
      'potion','super_potion','hyper_potion','max_potion',
      'antidote','burn_heal','full_heal',
      'pokeball','great_ball','ultra_ball','master_ball',
    ];
    const available = usable.filter(id => (im?.getCount?.(id) ?? im?.inventory?.[id] ?? 0) > 0);
    if (!available.length) {
      this._showDialog('You have no usable items!', () => this._showMainMenu());
      return;
    }
    for (const itemId of available) {
      const qty   = im?.getCount?.(itemId) ?? im?.inventory?.[itemId] ?? 1;
      const label = itemId.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
      const btn   = this._makeBtn(`${label}  ×${qty}`, () => {
        if (this._busy) return;
        this._busy = true;
        this._clearMenu();
        const isBall = ['pokeball','great_ball','ultra_ball','master_ball'].includes(itemId);
        this._bs.submitAction(isBall ? { type:'catch', itemId } : { type:'item', itemId });
      });
      this._menu.appendChild(btn);
    }
    this._appendBack(() => this._showMainMenu());
  }

  _showPokemonMenu() {
    this._clearMenu();
    this._menu.className = 'list-menu';
    this._setDialog('Choose a Pokémon:');
    const party = window.partyManager?.getParty?.() ?? [];
    for (const p of party) {
      const isCurrent = p === this._bs.playerPokemon;
      const label = isCurrent ? `${p.name} Lv.${p.level} (out)`
                  : p.isFainted ? `${p.name} Lv.${p.level} (fnt)`
                  : `${p.name} Lv.${p.level}  ${p.hp}/${p.maxHp}HP`;
      const btn = this._makeBtn(label, () => {
        if (this._busy || isCurrent || p.isFainted) return;
        this._busy = true;
        this._clearMenu();
        this._bs._playerPokemon = p;
        p.resetStages();
        this._swapSprite(p.speciesId, false);
        this._renderPlate(this._playerPlate, p, true);
        this._bs._phase = 'resolve';
        const log  = [];
        const say  = (text) => log.push({ type: 'text', text });
        const snap = () => log.push({ type: 'hp_update', playerHp: this._bs._playerPokemon.hp, playerMaxHp: this._bs._playerPokemon.maxHp, enemyHp: this._bs._enemyPokemon.hp, enemyMaxHp: this._bs._enemyPokemon.maxHp });
        this._bs._enemyTakesFreeTurn(log, say, snap);
      });
      if (isCurrent || p.isFainted) btn.classList.add('disabled');
      this._menu.appendChild(btn);
    }
    this._appendBack(() => this._showMainMenu());
  }

  _doRun() {
    if (this._busy) return;
    this._busy = true;
    this._clearMenu();
    this._bs.submitAction({ type: 'run' });
  }

  _makeBtn(label, onClick) {
    const btn = document.createElement('button');
    btn.className = 'battle-btn';
    btn.textContent = label;
    btn.addEventListener('mouseenter', () => this._click());
    btn.addEventListener('click', () => { this._click(); onClick(); });
    return btn;
  }

  _appendBack(onClick) {
    const row = document.createElement('div');
    row.className = 'menu-back-row';
    const btn = document.createElement('button');
    btn.className = 'back-btn';
    btn.textContent = '← Back';
    btn.addEventListener('click', () => { this._click(); onClick(); });
    row.appendChild(btn);
    this._menu.appendChild(row);
  }

  // ── Dialog ────────────────────────────────────────────────────────────────

  _setDialog(text) {
    this._dialogText.textContent = text;
    this._dialogArrow.style.display = 'none';
  }

  _showDialog(text, onDone) {
    this._dialogArrow.style.display = 'none';
    this._dialogText.textContent = '';
    const chars  = [...text];
    let   cursor = 0;
    let   done   = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(timer);
      this._dialogText.textContent = text;
      this._dialogArrow.style.display = 'block';
      const advance = () => {
        this._click();
        this._dialogEl.removeEventListener('click', advance);
        clearTimeout(auto);
        this._dialogArrow.style.display = 'none';
        onDone?.();
      };
      const auto = setTimeout(advance, 1400);
      this._dialogEl.addEventListener('click', advance, { once: true });
    };

    const timer = setInterval(() => {
      cursor++;
      this._dialogText.textContent = chars.slice(0, cursor).join('');
      if (cursor >= chars.length) finish();
    }, 24);

    this._dialogEl.addEventListener('click', () => { if (!done) { this._click(); finish(); } }, { once: true });
  }

  _showLog(entries, onDone) {
    const show = (i) => {
      if (i >= entries.length) { onDone?.(); return; }
      const entry = entries[i];

      // Support both plain strings (legacy) and structured objects
      if (typeof entry === 'string') {
        this._showDialog(entry, () => show(i + 1));
        return;
      }

      if (entry.type === 'hp_update') {
        // Play hurt animation on whichever sprite lost HP, then update bars
        const enemyHurt  = entry.enemyHp  < this._prevEnemyHp;
        const playerHurt = entry.playerHp < this._prevPlayerHp;
        this._prevEnemyHp  = entry.enemyHp;
        this._prevPlayerHp = entry.playerHp;
        console.log('[BattleUI] hp_update — enemyHurt:', enemyHurt, 'playerHurt:', playerHurt, entry);
        if (enemyHurt)  this._hurtSprite(true);
        if (playerHurt) this._hurtSprite(false);
        this._applyHpSnapshot(entry);
        setTimeout(() => show(i + 1), enemyHurt || playerHurt ? 480 : 400);
        return;
      }

      if (entry.type === 'ability_active') {
        // Flash the ability badge on the correct nameplate with a one-shot throb
        const plateEl = entry.side === 'player' ? this._playerPlate : this._enemyPlate;
        const abilityEl = plateEl?.querySelector('.ability-badge');
        if (abilityEl) {
          // Remove then re-add so animation restarts even if already glowing
          abilityEl.classList.remove('ability-throb', 'ability-glow');
          void abilityEl.offsetWidth; // force reflow
          abilityEl.classList.add('ability-throb');
          // After throb finishes, settle into steady glow
          setTimeout(() => {
            abilityEl.classList.remove('ability-throb');
            abilityEl.classList.add('ability-glow');
          }, 700);
        }
        show(i + 1);
        return;
      }

      if (entry.type === 'text') {
        this._showDialog(entry.text, () => show(i + 1));
        return;
      }

      // Unknown entry — skip
      show(i + 1);
    };
    show(0);
  }

  // Apply an hp_update snapshot directly to the plates without animation delay
  _applyHpSnapshot(snap) {
    const eFill = this._enemyPlate?.querySelector('.hp-fill');
    const pFill = this._playerPlate?.querySelector('.hp-fill');
    const pNums = this._playerPlate?.querySelector('.hp-numbers');

    if (eFill) {
      const ratio = Math.max(0, snap.enemyHp / snap.enemyMaxHp);
      eFill.style.width = `${Math.round(ratio * 100)}%`;
      eFill.style.backgroundColor = hpColor(ratio);
    }
    if (pFill) {
      const ratio = Math.max(0, snap.playerHp / snap.playerMaxHp);
      pFill.style.width = `${Math.round(ratio * 100)}%`;
      pFill.style.backgroundColor = hpColor(ratio);
    }
    if (pNums) pNums.textContent = `${snap.playerHp} / ${snap.playerMaxHp}`;
  }

  // ── Animations ────────────────────────────────────────────────────────────

  _doFlash(onDone) {
    this._flash.classList.add('active');
    setTimeout(() => { this._flash.classList.remove('active'); onDone?.(); }, 200);
  }

  // Play hurt bounce animation on enemy or player sprite
  _hurtSprite(isEnemy) {
    const el = isEnemy ? this._enemySprite : this._playerSprite;
    if (!el) return;
    // Remove any classes that could override the animation
    el.classList.remove('hurt', 'intro', 'shake');
    void el.offsetWidth; // force reflow to restart animation
    el.classList.add('hurt');
    setTimeout(() => el.classList.remove('hurt'), 520);
  }

  // isEnemy=true → enemy faint; isEnemy=false → player faint
  _faintSprite(isEnemy, onDone) {
    const el = isEnemy ? this._enemySprite : this._playerSprite;
    el.classList.add('faint');
    setTimeout(onDone, 450);
  }

  _swapSprite(speciesId, isEnemy) {
    const el  = isEnemy ? this._enemySprite : this._playerSprite;
    const src = isEnemy ? frontSprite(speciesId) : backSprite(speciesId);
    el.src    = src;
    el.classList.remove('faint','intro','shake');
    el.style.opacity = '0';
    setTimeout(() => {
      el.style.transition = 'opacity 0.3s';
      el.style.opacity    = '1';
    }, 50);
  }

  _playCatch(wobbles, caught, log, ballId, onDone) {
    const fieldEl = this._root?.querySelector('#battle-field');
    if (!fieldEl) { this._showLog(log, onDone); return; }

    // Map ballId to sprite filename
    const BALL_SPRITES = {
      pokeball:    'POKEBALL',
      great_ball:  'GREATBALL',
      ultra_ball:  'ULTRABALL',
      master_ball: 'MASTERBALL',
    };
    const spriteFile = BALL_SPRITES[ballId] || 'POKEBALL';

    // Create pokeball element
    const ball = document.createElement('img');
    ball.className = 'pokeball-sprite';
    ball.src = `/Items/${spriteFile}.png`;
    ball.alt = 'Pokéball';
    ball.style.animation = 'ball-throw 0.8s cubic-bezier(0.2,0.8,0.4,1) forwards';
    fieldEl.appendChild(ball);

    // After throw lands (0.8s), lock position and shrink enemy
    setTimeout(() => {
      // Lock ball at landing position so wiggle doesn't move it
      ball.style.animation = 'none';
      ball.style.bottom = '40%';
      ball.style.right = '14%';
      ball.style.transform = 'scale(0.7)';

      this._enemySprite.style.transition = 'opacity 0.3s, transform 0.3s';
      this._enemySprite.style.opacity = '0';
      this._enemySprite.style.transform = 'scale(0.3)';

      // Start wiggle after a pause (enemy absorbed)
      setTimeout(() => {
        let wiggleCount = 0;
        const maxWiggle = Math.min(wobbles, 3);

        const doWiggle = () => {
          if (wiggleCount < maxWiggle) {
            wiggleCount++;
            ball.style.animation = 'none';
            void ball.offsetWidth;
            ball.style.animation = 'ball-wiggle 1s ease-in-out';
            // Wait for full wiggle (1s) + pause (0.5s) before next
            setTimeout(doWiggle, 1500);
          } else {
            // Wiggling done — caught or escaped?
            if (caught) {
              // Ball clicks shut — stop BGM + play catch tune immediately
              if (this.stopBgm) this.stopBgm();
              if (this.sfx) this.sfx('sfx_catch_success');
              ball.style.animation = 'ball-click 0.4s ease forwards';
              // Spawn particles at ball position before it shrinks away
              this._spawnCatchParticles(fieldEl, ball);
              setTimeout(() => {
                ball.remove();
                this._showLog(log, onDone);
              }, 500);
            } else {
              // Pokemon breaks free — random burst animation
              const breakAnims = ['ball-break-1', 'ball-break-2', 'ball-break-3'];
              const pick = breakAnims[Math.floor(Math.random() * breakAnims.length)];
              ball.style.animation = `${pick} 0.5s ease forwards`;
              setTimeout(() => {
                ball.remove();
                // Enemy flashes back into view
                this._enemySprite.style.transition = 'none';
                this._enemySprite.style.animation = 'break-free-flash 0.5s ease forwards';
                setTimeout(() => {
                  this._enemySprite.style.animation = '';
                  this._enemySprite.style.opacity = '1';
                  this._enemySprite.style.transform = 'scale(1)';
                  this._showLog(log, onDone);
                }, 550);
              }, 500);
            }
          }
        };

        doWiggle();
      }, 500);
    }, 850);
  }

  /** Spawn star + sparkle particles at the ball's position on catch success. */
  _spawnCatchParticles(container, ball) {
    const rect = ball.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    const cx = rect.left - cRect.left + rect.width / 2;
    const cy = rect.top - cRect.top + rect.height / 2;

    const count = 10;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const dist = 40 + Math.random() * 60;
      const tx = `${Math.cos(angle) * dist}px`;
      const ty = `${Math.sin(angle) * dist}px`;
      const dur = `${0.5 + Math.random() * 0.5}s`;

      const el = document.createElement('span');
      if (i % 2 === 0) {
        // Star particle
        el.className = 'catch-particle';
        el.textContent = '\u2605';
        el.style.color = ['#ffd700', '#ff6', '#fff', '#f90'][i % 4];
      } else {
        // Gold sparkle dot
        el.className = 'catch-sparkle';
      }
      el.style.left = `${cx}px`;
      el.style.top = `${cy}px`;
      el.style.setProperty('--tx', tx);
      el.style.setProperty('--ty', ty);
      el.style.setProperty('--dur', dur);
      el.style.setProperty('--rot', `${Math.random() * 360}deg`);
      container.appendChild(el);

      // Self-remove after animation
      const ms = parseFloat(dur) * 1000 + 100;
      setTimeout(() => el.remove(), ms);
    }
  }

  _swapToNext(nextPokemon) {
    if (!nextPokemon) { this._endBattle({ blackedOut: true }); return; }
    this._showDialog(`Go! ${nextPokemon.name}!`, () => {
      this._bs._playerPokemon = nextPokemon;
      nextPokemon.resetStages();
      this._swapSprite(nextPokemon.speciesId, false); // false = player = back sprite
      this._renderPlate(this._playerPlate, nextPokemon, true);
      this._busy = false;
      this._bs._phase = PHASE.PLAYER_TURN;
      this._showMainMenu();
    });
  }

  // ── End ───────────────────────────────────────────────────────────────────

  _endBattle(outcome) {
    console.log('[BattleUI] _endBattle called with:', outcome);
    this._clearMenu();
    this._fade.classList.add('active');
    setTimeout(() => {
      console.log('[BattleUI] Fade done, calling onEnd');
      this._onEnd(outcome);
    }, 500);
  }

  destroy() {
    this._root?.remove();
    this._root = null;
    this._hideTooltip();
    // Remove the battle ability tooltip from DOM
    document.getElementById('ability-tooltip')?.remove();
    this._tooltip = null;
    // Hide overworld PSW tooltip in case it was stuck visible
    document.getElementById('psw-ability-tooltip')?.classList.remove('visible');
  }
}
