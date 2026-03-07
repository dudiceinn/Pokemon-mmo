/**
 * PokemonStatusWindow
 * Vanilla JS/HTML/CSS — no React, no dependencies.
 * Usage: const w = new PokemonStatusWindow(); w.toggle();
 */

import { isAbilityActive, abilityName, abilityDesc } from './AbilityReader.js';

const PARTY_KEY = 'pokemon-mmo-party';

const POKEMON_DEFS = {
  bulbasaur:  { name:'Bulbasaur',  number:1,  type:['grass','poison'], sprite:'/pokemon/Icons/BULBASAUR.png',  baseStats:{hp:45,atk:49,def:49,spatk:65,spdef:65,spd:45},  evolvesTo:'ivysaur',    evolvesAtLevel:16   },
  ivysaur:    { name:'Ivysaur',    number:2,  type:['grass','poison'], sprite:'/pokemon/Icons/IVYSAUR.png',    baseStats:{hp:60,atk:62,def:63,spatk:80,spdef:80,spd:60},  evolvesTo:'venusaur',   evolvesAtLevel:32   },
  venusaur:   { name:'Venusaur',   number:3,  type:['grass','poison'], sprite:'/pokemon/Icons/VENUSAUR.png',   baseStats:{hp:80,atk:82,def:83,spatk:100,spdef:100,spd:80}, evolvesTo:null,         evolvesAtLevel:null },
  charmander: { name:'Charmander', number:4,  type:['fire'],           sprite:'/pokemon/Icons/CHARMANDER.png', baseStats:{hp:39,atk:52,def:43,spatk:60,spdef:50,spd:65},  evolvesTo:'charmeleon', evolvesAtLevel:16   },
  charmeleon: { name:'Charmeleon', number:5,  type:['fire'],           sprite:'/pokemon/Icons/CHARMELEON.png', baseStats:{hp:58,atk:64,def:58,spatk:80,spdef:65,spd:80},  evolvesTo:'charizard',  evolvesAtLevel:36   },
  charizard:  { name:'Charizard',  number:6,  type:['fire','flying'],  sprite:'/pokemon/Icons/CHARIZARD.png',  baseStats:{hp:78,atk:84,def:78,spatk:109,spdef:85,spd:100}, evolvesTo:null,         evolvesAtLevel:null },
  squirtle:   { name:'Squirtle',   number:7,  type:['water'],          sprite:'/pokemon/Icons/SQUIRTLE.png',   baseStats:{hp:44,atk:48,def:65,spatk:50,spdef:64,spd:43},  evolvesTo:'wartortle',  evolvesAtLevel:16   },
  wartortle:  { name:'Wartortle',  number:8,  type:['water'],          sprite:'/pokemon/Icons/WARTORTLE.png',  baseStats:{hp:59,atk:63,def:80,spatk:65,spdef:80,spd:58},  evolvesTo:'blastoise',  evolvesAtLevel:36   },
  blastoise:  { name:'Blastoise',  number:9,  type:['water'],          sprite:'/pokemon/Icons/BLASTOISE.png',  baseStats:{hp:79,atk:83,def:100,spatk:85,spdef:105,spd:78}, evolvesTo:null,         evolvesAtLevel:null },
};

const TYPE_COLORS = {
  fire:'#FF6B35', water:'#3FA7D6', grass:'#59C15D',
  poison:'#A259C4', flying:'#80B0FF', normal:'#9E9E9E',
};

const STAT_COLORS = {
  HP:'#FF5370', ATK:'#FF9140', DEF:'#FFD740',
  SpATK:'#40C4FF', SpDEF:'#69FF47', SPD:'#EA80FC',
};

function calcStat(base, level) {
  return Math.floor(((2 * base + 15) * level / 100) + 5);
}
function hpColor(ratio) {
  if (ratio > 0.5) return '#69FF47';
  if (ratio > 0.2) return '#FFD740';
  return '#FF5370';
}
function friendshipLabel(f) {
  if (f >= 220) return 'Best Friends ♥♥♥';
  if (f >= 160) return 'Great Friends ♥♥';
  if (f >= 100) return 'Friends ♥';
  if (f >= 50)  return 'Neutral';
  return 'Unfriendly';
}
function expForLevel(level) { return Math.pow(level, 3); }
function safeExp(pokemon) { return pokemon.exp ?? 0; }
function readParty() {
  try { return JSON.parse(localStorage.getItem(PARTY_KEY) || '[]'); }
  catch { return []; }
}

// ── Sprite helper — background-image crop to left frame of 128x64 sheet ──
function spriteStyle(spritePath, containerW, containerH) {
  // Sheet is 128x64 (2 frames of 64x64)
  // Scale so left frame fills the container exactly
  const bgW = containerW * 2;
  const bgH = containerH;
  return `background-image:url('${spritePath}');background-size:${bgW}px ${bgH}px;background-position:0 0;background-repeat:no-repeat;`;
}

const CSS = `
#psw-overlay {
  display: none; position: fixed; inset: 0; z-index: 1000;
  background: rgba(4,8,18,0.97);
  font-family: 'Courier New','Lucida Console',monospace;
  color: #ccd; overflow-y: auto; padding: 20px; box-sizing: border-box;
}
#psw-overlay.open { display: flex; align-items: flex-start; justify-content: center; }
#psw-inner { width: 100%; max-width: 820px; padding-top: 10px; }
#psw-title { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding:0 4px; }
#psw-title-left { display:flex; align-items:center; gap:10px; }
#psw-title-left span { font-size:13px; font-weight:bold; color:#7090b0; letter-spacing:3px; text-transform:uppercase; }
#psw-title-right { font-size:9px; color:#334; letter-spacing:1px; }
#psw-layout { display:grid; grid-template-columns:220px 1fr; gap:14px; align-items:start; }
#psw-party { display:flex; flex-direction:column; gap:6px; }
.psw-slot-label { font-size:9px; color:#334; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:4px; padding-left:4px; }

.psw-slot {
  position:relative; width:100%; box-sizing:border-box;
  background:linear-gradient(135deg,#111827 0%,#0d1520 100%);
  border:2px solid #1e2d3a; border-radius:10px;
  padding:10px 12px; cursor:pointer;
  display:flex; align-items:center; gap:10px; transition:all 0.15s;
}
.psw-slot:hover { border-color:#2a4060; }
.psw-slot.active { background:linear-gradient(135deg,#1e2d4a 0%,#162238 100%); }
.psw-slot.fainted { opacity:0.5; }
.psw-slot[draggable="true"] { cursor:grab; }
.psw-slot[draggable="true"]:active { cursor:grabbing; }
.psw-slot.drag-over { border-color:#5af !important; box-shadow:0 0 14px #5af6 !important; background:linear-gradient(135deg,#1a3050 0%,#0f2035 100%) !important; }
.psw-slot.dragging { opacity:0.3; }
.psw-slot-num { font-size:9px; color:#334; position:absolute; top:5px; left:6px; font-weight:bold; }

.psw-slot-avatar {
  width:48px; height:48px; border-radius:8px; flex-shrink:0;
  border:1px solid transparent; box-sizing:border-box;
  image-rendering:pixelated;
}
.psw-slot-info { flex:1; text-align:left; min-width:0; }
.psw-slot-name { font-size:12px; font-weight:bold; color:#e8e8e8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.psw-slot-sub  { font-size:10px; color:#556; margin-top:1px; }
.psw-slot-hpbar-bg { margin-top:4px; background:#0a1020; border-radius:3px; height:4px; }
.psw-slot-hpbar-fill { height:100%; border-radius:3px; transition:width 0.3s; }
.psw-slot-hp { text-align:right; flex-shrink:0; font-size:11px; font-weight:bold; }
.psw-slot-indicator { position:absolute; right:-1px; top:50%; transform:translateY(-50%); width:3px; height:60%; border-radius:3px 0 0 3px; }

.psw-empty-slot {
  width:100%; box-sizing:border-box; background:#080e18;
  border:2px dashed #1a2232; border-radius:10px; padding:10px 12px;
  display:flex; align-items:center; gap:10px; opacity:0.4;
}
.psw-empty-avatar { width:48px; height:48px; border-radius:8px; background:#0d1520; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.psw-empty-label { font-size:11px; color:#334; }

#psw-detail { display:flex; flex-direction:column; gap:14px; }
.psw-card { background:#0d1520; border:1px solid #1a2a3a; border-radius:10px; padding:12px 14px; }
.psw-card-title { font-size:10px; color:#556; letter-spacing:1.5px; text-transform:uppercase; margin-bottom:10px; }

#psw-header-card {
  border-radius:12px; padding:16px;
  display:flex; align-items:center; gap:16px;
  position:relative; overflow:hidden;
}
#psw-header-glow { position:absolute; top:-20px; right:-20px; width:100px; height:100px; border-radius:50%; filter:blur(30px); pointer-events:none; }

#psw-header-avatar {
  width:96px; height:96px; border-radius:12px; flex-shrink:0;
  border:2px solid transparent; box-sizing:border-box;
  image-rendering:pixelated;
}
#psw-header-name-block { flex:1; z-index:1; }
#psw-header-name { font-size:20px; font-weight:900; color:#f0f4ff; letter-spacing:-0.5px; }
#psw-header-species { font-size:11px; color:#556; margin-left:8px; }
#psw-header-types { display:flex; gap:5px; margin-top:5px; flex-wrap:wrap; }
.psw-type-badge { color:#fff; font-size:9px; font-weight:bold; padding:2px 8px; border-radius:20px; letter-spacing:1px; text-transform:uppercase; }
#psw-header-level { text-align:right; z-index:1; }
#psw-header-lv { font-size:24px; font-weight:900; line-height:1; }
#psw-header-num { font-size:9px; color:#445; margin-top:3px; letter-spacing:1px; }
#psw-ability-badge {
  display:inline-block; margin-top:6px; font-size:10px; color:#7ab0d0;
  background:#0a1828; border:1px solid #1e3a5f; border-radius:4px;
  padding:2px 8px; letter-spacing:0.5px;
  transition: color 0.4s, background 0.4s, border-color 0.4s, box-shadow 0.4s;
}
#psw-ability-badge.ability-glow {
  color:#fff2cc; background:#2a1800; border-color:#ffaa00;
  box-shadow: 0 0 8px 2px #ffaa0088, inset 0 0 4px #ffee8844;
  animation: psw-ability-pulse 1.4s ease-in-out infinite;
}
@keyframes psw-ability-pulse {
  0%,100% { box-shadow: 0 0 5px 2px #ffaa0066, inset 0 0 2px #ffee8833; }
  50%     { box-shadow: 0 0 14px 5px #ffcc44bb, inset 0 0 6px #ffee8899; }
}

#psw-hp-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
#psw-hp-label { font-size:10px; color:#556; letter-spacing:1.5px; text-transform:uppercase; }
#psw-hp-value { font-size:13px; font-weight:bold; }
#psw-hp-bg { background:#060d18; border-radius:4px; height:10px; overflow:hidden; }
#psw-hp-fill { height:100%; border-radius:4px; transition:width 0.4s cubic-bezier(0.4,0,0.2,1); }

.psw-stat-row { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.psw-stat-name { font-size:10px; color:#556; width:40px; text-align:right; }
.psw-stat-bg { flex:1; background:#0a1020; border-radius:3px; height:7px; position:relative; overflow:hidden; }
.psw-stat-fill { position:absolute; left:0; top:0; height:100%; border-radius:3px; transition:width 0.4s cubic-bezier(0.4,0,0.2,1); }
.psw-stat-val { font-size:11px; color:#ccd; width:28px; text-align:right; font-weight:bold; }

#psw-moves-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
.psw-move-chip { background:#0f1f35; border:1px solid #1e3a5f; border-radius:6px; padding:7px 10px; font-size:11px; color:#a8c0e0; text-align:center; font-family:inherit; }
.psw-move-chip.empty { background:#080e18; border-color:#111; color:#222; }

#psw-bottom-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.psw-mini-label { font-size:10px; color:#556; letter-spacing:1px; text-transform:uppercase; margin-bottom:6px; }
.psw-mini-val { font-size:12px; color:#7090b0; margin-bottom:4px; }
.psw-mini-bar-bg { background:#060d18; border-radius:3px; height:5px; margin-bottom:4px; }
.psw-mini-bar-fill { height:100%; border-radius:3px; }
.psw-mini-sub { font-size:9px; color:#445; }
#psw-friendship-val { font-size:11px; color:#e094b0; margin-bottom:4px; }

#psw-evo-hint { background:#0a1520; border:1px solid #1e3a1e; border-radius:8px; padding:8px 12px; display:flex; align-items:center; gap:8px; font-size:10px; color:#4a8; }
#psw-evo-hint strong { color:#6cb; }
#psw-footer { margin-top:14px; padding-left:4px; font-size:9px; color:#1e2d3a; letter-spacing:1px; }
#psw-overlay::after { content:''; position:fixed; inset:0; pointer-events:none; z-index:1001; background-image:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.03) 2px,rgba(0,0,0,0.03) 4px); }

#psw-ability-tooltip {
  position: fixed;
  z-index: 1100;
  background: #0a1828;
  border: 1px solid #ffaa00;
  border-radius: 6px;
  padding: 7px 11px;
  font-family: 'Courier New','Lucida Console',monospace;
  font-size: 11px;
  color: #f0e8cc;
  max-width: 240px;
  pointer-events: none;
  box-shadow: 0 2px 14px rgba(0,0,0,0.8), 0 0 6px #ffaa0033;
  line-height: 1.5;
  white-space: normal;
  opacity: 0;
  transition: opacity 0.15s ease;
}
#psw-ability-tooltip.visible { opacity: 1; }
`;

export class PokemonStatusWindow {
  constructor() {
    this._selectedIndex = 0;
    this._party = [];
    this._injectStyles();
    this._buildDOM();
    this._bindEvents();
    this._refresh();
  }

  toggle() { this.overlay.classList.toggle('open'); if (this.isOpen()) this._refresh(); }
  open()   { this.overlay.classList.add('open');    this._refresh(); }
  close()  { this.overlay.classList.remove('open'); }
  isOpen() { return this.overlay.classList.contains('open'); }

  _injectStyles() {
    if (document.getElementById('psw-styles')) return;
    const style = document.createElement('style');
    style.id = 'psw-styles';
    style.textContent = CSS;
    document.head.appendChild(style);

    // Shared tooltip element for ability badge hover
    if (!document.getElementById('psw-ability-tooltip')) {
      const tip = document.createElement('div');
      tip.id = 'psw-ability-tooltip';
      document.body.appendChild(tip);
    }
  }

  _buildDOM() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'psw-overlay';
    this.overlay.innerHTML = `
      <div id="psw-inner">
        <div id="psw-title">
          <div id="psw-title-left"><span>⚔️</span><span>Party Status</span></div>
          <div id="psw-title-right"></div>
        </div>
        <div id="psw-layout">
          <div id="psw-party"><div class="psw-slot-label">Party</div></div>
          <div id="psw-detail"></div>
        </div>
        <div id="psw-footer">Press P to close · Reads from pokemon-mmo-party · Updates on pokemon-party-changed</div>
      </div>`;
    document.body.appendChild(this.overlay);
    this.elTitle  = this.overlay.querySelector('#psw-title-right');
    this.elParty  = this.overlay.querySelector('#psw-party');
    this.elDetail = this.overlay.querySelector('#psw-detail');
  }

  _bindEvents() {
    window.addEventListener('pokemon-party-changed', () => { if (this.isOpen()) this._refresh(); });
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen()) this.close(); });
  }

  _refresh() {
    // Prefer live PokemonInstance objects from PartyManager (have .name, .moves, .hp etc.)
    // Fall back to raw localStorage objects when PartyManager isn't ready yet.
    const pm = window.partyManager;
    if (pm) {
      this._party = pm.getParty();
    } else {
      // Raw deserialized objects — still renderable with guards below
      this._party = readParty();
    }
    if (this._selectedIndex >= this._party.length) this._selectedIndex = 0;
    this._renderPartyList();
    this._renderDetail();
    this.elTitle.textContent = `${this._party.length}/6 Pokémon`;
  }

  /** Get a display def for any species — prefers hardcoded stub, falls back to pokemonDefs cache */
  _getDef(speciesId) {
    if (POKEMON_DEFS[speciesId]) return POKEMON_DEFS[speciesId];
    // Try the full pokemonDefs loaded by BootScene
    const fullDefs = window.partyManager?._pokemonDefs;
    if (fullDefs && fullDefs[speciesId]) {
      const d = fullDefs[speciesId];
      // Always use the Icons folder — pokemon.json sprite paths may point elsewhere
      return { ...d, sprite: `/pokemon/Icons/${speciesId.toUpperCase()}.png` };
    }
    // Generic fallback so the window never crashes on an unknown species
    return { name: speciesId, number: 0, type: ['normal'], sprite: '', baseStats: {hp:50,atk:50,def:50,spatk:50,spdef:50,spd:50}, evolvesTo: null, evolvesAtLevel: null };
  }

  _renderPartyList() {
    const label = this.elParty.querySelector('.psw-slot-label');
    this.elParty.innerHTML = '';
    this.elParty.appendChild(label);
    for (let i = 0; i < 6; i++) {
      this.elParty.appendChild(this._party[i] ? this._makeSlot(this._party[i], i) : this._makeEmptySlot(i));
    }
  }

  _makeEmptySlot(i) {
    const el = document.createElement('div');
    el.className = 'psw-empty-slot';
    el.innerHTML = `<div class="psw-empty-avatar">·</div><span class="psw-empty-label">Empty slot ${i + 1}</span>`;
    return el;
  }

  _makeSlot(pokemon, i) {
    const def = this._getDef(pokemon.speciesId);
    if (!def) return this._makeEmptySlot(i);
    const fainted = (pokemon.currentHp ?? pokemon.hp ?? 0) === 0;
    const hpRatio = pokemon.currentHp / pokemon.maxHp;
    const color = TYPE_COLORS[def.type[0]] || '#9E9E9E';
    const hpCol = hpColor(hpRatio);
    const isActive = i === this._selectedIndex;

    const el = document.createElement('div');
    el.className = `psw-slot${isActive ? ' active' : ''}${fainted ? ' fainted' : ''}`;
    if (isActive) { el.style.borderColor = color; el.style.boxShadow = `0 0 12px ${color}44`; }

    // Build avatar div separately so we can set background-image safely
    const avatar = document.createElement('div');
    avatar.className = 'psw-slot-avatar';
    avatar.style.borderColor = `${color}55`;
    if (fainted) {
      avatar.style.background = `${color}22`;
      avatar.style.display = 'flex';
      avatar.style.alignItems = 'center';
      avatar.style.justifyContent = 'center';
      avatar.style.fontSize = '24px';
      avatar.textContent = '💀';
    } else {
      avatar.style.backgroundImage = `url('${def.sprite}')`;
      avatar.style.backgroundSize = '96px 48px';
      avatar.style.backgroundPosition = '0 0';
      avatar.style.backgroundRepeat = 'no-repeat';
      avatar.style.backgroundColor = `${color}22`;
    }

    el.innerHTML = `
      <span class="psw-slot-num">${i + 1}</span>
      <div class="psw-slot-info">
        <div class="psw-slot-name">${pokemon.nickname || def.name}</div>
        <div class="psw-slot-sub">Lv.${pokemon.level} · ${def.type.join('/')}</div>
        <div class="psw-slot-hpbar-bg">
          <div class="psw-slot-hpbar-fill" style="width:${Math.max(0,hpRatio*100)}%;background:${hpCol};"></div>
        </div>
      </div>
      <div class="psw-slot-hp" style="color:${fainted ? '#F44336' : hpCol};">${fainted ? 'FNT' : `${pokemon.currentHp ?? pokemon.hp ?? 0}/${pokemon.maxHp ?? '?'}`}</div>
      ${isActive ? `<div class="psw-slot-indicator" style="background:${color};"></div>` : ''}`;

    el.insertBefore(avatar, el.firstChild);
    // Click to select
    el.addEventListener('click', () => { this._selectedIndex = i; this._refresh(); });

    // Drag to reorder
    el.draggable = true;
    el.dataset.slotIndex = i;

    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
      setTimeout(() => el.classList.add('dragging'), 0);
    });
    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      this.elParty.querySelectorAll('.psw-slot').forEach(s => s.classList.remove('drag-over'));
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      this.elParty.querySelectorAll('.psw-slot').forEach(s => s.classList.remove('drag-over'));
      el.classList.add('drag-over');
    });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
      const toIndex   = i;
      if (fromIndex === toIndex || isNaN(fromIndex)) return;
      const pm = window.partyManager;
      if (!pm) return;
      pm.swapSlots(fromIndex, toIndex);
      // Keep selection on the moved pokemon
      this._selectedIndex = toIndex;
      // _refresh() is triggered automatically by pokemon-party-changed event
    });

    return el;
  }

  _renderDetail() {
    const pokemon = this._party[this._selectedIndex];
    if (!pokemon) { this.elDetail.innerHTML = '<div style="color:#334;font-size:12px;padding:40px;text-align:center;">No Pokémon selected</div>'; return; }

    const def = this._getDef(pokemon.speciesId);
    if (!def) return this._makeEmptySlot(i);
    const fainted = (pokemon.currentHp ?? pokemon.hp ?? 0) === 0;
    const currentHp = pokemon.currentHp ?? pokemon.hp ?? 0;
    const maxHp     = pokemon.maxHp ?? 1;
    const hpRatio   = currentHp / maxHp;
    const hpCol     = hpColor(hpRatio);
    const color     = TYPE_COLORS[def.type[0]] || '#9E9E9E';

    const stats = {
      HP: pokemon.maxHp,
      ATK:   calcStat(def.baseStats.atk,   pokemon.level),
      DEF:   calcStat(def.baseStats.def,   pokemon.level),
      SpATK: calcStat(def.baseStats.spatk, pokemon.level),
      SpDEF: calcStat(def.baseStats.spdef, pokemon.level),
      SPD:   calcStat(def.baseStats.spd,   pokemon.level),
    };
    const maxStat = Math.max(...Object.values(stats));

    const expThisLevel = expForLevel(pokemon.level);
    const expNextLevel = expForLevel(pokemon.level + 1);
    // Clamp totalExp to at least the floor for current level (handles manually added pokemon with exp:0)
    const totalExp    = Math.max(pokemon.exp ?? 0, expThisLevel);
    const expProgress = Math.max(0, Math.min(1, (totalExp - expThisLevel) / (expNextLevel - expThisLevel)));
    const expToNext   = Math.max(0, expNextLevel - totalExp);
    const moves4       = [...pokemon.moves, null, null, null, null].slice(0, 4);

    const typeBadges = def.type.map(t =>
      `<span class="psw-type-badge" style="background:${TYPE_COLORS[t]||'#555'};">${t}</span>`
    ).join('');

    const statBars = Object.entries(stats).map(([k, v]) => `
      <div class="psw-stat-row">
        <span class="psw-stat-name">${k}</span>
        <div class="psw-stat-bg">
          <div class="psw-stat-fill" style="width:${(v/maxStat)*100}%;background:${STAT_COLORS[k]};box-shadow:0 0 6px ${STAT_COLORS[k]}66;"></div>
        </div>
        <span class="psw-stat-val">${v}</span>
      </div>`).join('');

    const moveChips = moves4.map(m => {
      if (!m) return `<div class="psw-move-chip empty">— — —</div>`;
      // m is a {moveId, name, pp, maxPp, type, category} object from PokemonInstance.serialize()
      const moveName = m.name ?? String(m.moveId ?? m).replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
      const ppText   = (m.pp != null && m.maxPp != null) ? `<span class="psw-move-pp">${m.pp}/${m.maxPp}</span>` : '';
      const typeCol  = TYPE_COLORS[m.type] || '#555';
      return `<div class="psw-move-chip" style="border-color:${typeCol}44;">
        <span class="psw-move-name">${moveName}</span>
        ${ppText}
        ${m.type ? `<span class="psw-move-type" style="background:${typeCol};">${m.type}</span>` : ''}
      </div>`;
    }).join('');

    const evoHint = def.evolvesTo && def.evolvesAtLevel ? `
      <div id="psw-evo-hint">
        <span>✨</span>
        Evolves into <strong>${POKEMON_DEFS[def.evolvesTo]?.name}</strong> at Lv.${def.evolvesAtLevel}
        ${pokemon.level >= def.evolvesAtLevel ? ' — Ready!' : ` (${def.evolvesAtLevel - pokemon.level} levels away)`}
      </div>` : '';

    // Build detail HTML
    this.elDetail.innerHTML = `
      <div id="psw-header-card" class="psw-card" style="background:linear-gradient(135deg,${color}22 0%,#0d1520 60%);border-color:${color}44;">
        <div id="psw-header-glow" style="background:${color}44;"></div>
        <div id="psw-header-avatar" style="border-color:${color}66;box-shadow:0 0 20px ${color}44;"></div>
        <div id="psw-header-name-block">
          <div>
            <span id="psw-header-name">${pokemon.nickname || def.name}</span>
            ${pokemon.nickname ? `<span id="psw-header-species">${def.name}</span>` : ''}
          </div>
          <div id="psw-header-types">${typeBadges}</div>
          ${pokemon.ability ? `<div id="psw-ability-badge" class="${isAbilityActive(pokemon) ? 'ability-glow' : ''}">${abilityName(pokemon.ability)}</div>` : ''}
        </div>
        <div id="psw-header-level">
          <div id="psw-header-lv" style="color:${fainted ? '#F44336' : color};">${fainted ? 'FNT' : `Lv.${pokemon.level}`}</div>
          <div id="psw-header-num">#${String(def.number).padStart(3,'0')}</div>
        </div>
      </div>
      <div class="psw-card">
        <div id="psw-hp-row">
          <span id="psw-hp-label">Hit Points</span>
          <span id="psw-hp-value" style="color:${fainted ? '#F44336' : hpCol};">${fainted ? 'FAINTED' : `${currentHp} / ${maxHp}`}</span>
        </div>
        <div id="psw-hp-bg"><div id="psw-hp-fill" style="width:${Math.max(0,hpRatio*100)}%;background:linear-gradient(90deg,${hpCol}88,${hpCol});box-shadow:0 0 8px ${hpCol}88;"></div></div>
      </div>
      <div class="psw-card"><div class="psw-card-title">Stats</div>${statBars}</div>
      <div class="psw-card"><div class="psw-card-title">Moves</div><div id="psw-moves-grid">${moveChips}</div></div>
      <div id="psw-bottom-row">
        <div class="psw-card">
          <div class="psw-mini-label">EXP</div>
          <div class="psw-mini-val">${(pokemon.exp ?? 0).toLocaleString()}</div>
          <div class="psw-mini-bar-bg"><div class="psw-mini-bar-fill" style="width:${expProgress*100}%;background:linear-gradient(90deg,#5c6bc088,#7c8be0);"></div></div>
          <div class="psw-mini-sub">Next Lv: ${expToNext.toLocaleString()} EXP</div>
        </div>
        <div class="psw-card">
          <div class="psw-mini-label">Bond</div>
          <div id="psw-friendship-val">${friendshipLabel(pokemon.friendship ?? 0)}</div>
          <div class="psw-mini-bar-bg"><div class="psw-mini-bar-fill" style="width:${((pokemon.friendship ?? 0)/255)*100}%;background:linear-gradient(90deg,#e91e8c88,#f06292);"></div></div>
          <div class="psw-mini-sub">${pokemon.friendship ?? 0}/255</div>
        </div>
      </div>
      ${evoHint}`;

    // Set header avatar background-image via JS (avoids template literal issues)
    const headerAvatar = this.elDetail.querySelector('#psw-header-avatar');
    if (fainted) {
      headerAvatar.style.display = 'flex';
      headerAvatar.style.alignItems = 'center';
      headerAvatar.style.justifyContent = 'center';
      headerAvatar.style.fontSize = '48px';
      headerAvatar.textContent = '💀';
    } else {
      headerAvatar.style.backgroundImage = `url('${def.sprite}')`;
      headerAvatar.style.backgroundSize = '192px 96px';
      headerAvatar.style.backgroundPosition = '0 0';
      headerAvatar.style.backgroundRepeat = 'no-repeat';
      headerAvatar.style.backgroundColor = `${color}11`;
    }

    // Bind ability tooltip
    const abilityBadge = this.elDetail.querySelector('#psw-ability-badge');
    if (abilityBadge && pokemon.ability) {
      const desc = abilityDesc(pokemon.ability);
      abilityBadge.style.cursor = 'help';
      abilityBadge.addEventListener('mouseenter', () => {
        if (!desc) return;
        const tip = document.getElementById('psw-ability-tooltip');
        if (!tip) return;
        tip.textContent = desc;
        tip.classList.add('visible');
        const rect = abilityBadge.getBoundingClientRect();
        let top  = rect.top - tip.offsetHeight - 8;
        let left = rect.left;
        if (top < 6) top = rect.bottom + 8;
        if (left + 250 > window.innerWidth) left = window.innerWidth - 258;
        if (left < 6) left = 6;
        tip.style.top  = `${top}px`;
        tip.style.left = `${left}px`;
      });
      abilityBadge.addEventListener('mouseleave', () => {
        const tip = document.getElementById('psw-ability-tooltip');
        if (tip) tip.classList.remove('visible');
      });
    }
  }
}
