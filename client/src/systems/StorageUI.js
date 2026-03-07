/**
 * StorageUI.js
 *
 * Full-screen DOM overlay for PC Box storage.
 * Shows a box grid (6×5 = 30 slots) + party sidebar.
 * Deposit, withdraw, and move Pokemon between boxes and party.
 *
 * Usage:
 *   const ui = new StorageUI(storageManager, partyManager, pokemonDefs);
 *   ui.open();   // opens overlay
 *   ui.close();  // closes overlay
 */

const TYPE_COLORS = {
  normal:'#A8A878',fire:'#F08030',water:'#6890F0',grass:'#78C850',
  electric:'#F8D030',ice:'#98D8D8',fighting:'#C03028',poison:'#A040A0',
  ground:'#E0C068',flying:'#A890F0',psychic:'#F85888',bug:'#A8B820',
  rock:'#B8A038',ghost:'#705898',dragon:'#7038F8',dark:'#705848',
  steel:'#B8B8D0',fairy:'#EE99AC',
};

const CSS = `
#pc-overlay {
  display: none; position: fixed; inset: 0; z-index: 9000;
  background: rgba(0,0,0,0.85); font-family: 'Press Start 2P', monospace;
  color: #fff;
}
#pc-overlay.open { display: flex; align-items: center; justify-content: center; }

#pc-inner {
  width: 90vw; max-width: 900px; height: 85vh;
  background: linear-gradient(135deg, #1a2a4a 0%, #0d1b2e 100%);
  border: 3px solid #4a6a9a; border-radius: 12px;
  display: flex; flex-direction: column; overflow: hidden;
  box-shadow: 0 0 40px rgba(0,100,200,0.3);
}

/* Header */
#pc-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: #0d1b2e; border-bottom: 2px solid #4a6a9a;
}
#pc-header .pc-title { font-size: 12px; color: #8ab4f8; }
#pc-box-nav { display: flex; gap: 8px; align-items: center; }
#pc-box-nav button {
  background: #2a4a7a; border: 1px solid #4a6a9a; color: #ccc;
  font-family: inherit; font-size: 10px; padding: 4px 10px;
  border-radius: 4px; cursor: pointer;
}
#pc-box-nav button:hover { background: #3a5a8a; color: #fff; }
#pc-box-name { font-size: 11px; color: #fff; min-width: 80px; text-align: center; }
#pc-close {
  background: #8b2020; border: 1px solid #c44; color: #fff;
  font-family: inherit; font-size: 10px; padding: 4px 12px;
  border-radius: 4px; cursor: pointer;
}
#pc-close:hover { background: #a33; }

/* Body */
#pc-body {
  display: flex; flex: 1; overflow: hidden;
}

/* Box grid */
#pc-box-area {
  flex: 1; padding: 12px; overflow-y: auto;
}
#pc-box-grid {
  display: grid; grid-template-columns: repeat(6, 1fr);
  gap: 6px; max-width: 480px; margin: 0 auto;
}
.pc-slot {
  aspect-ratio: 1; background: #1a2a4a; border: 2px solid #2a3a5a;
  border-radius: 6px; cursor: pointer; display: flex;
  flex-direction: column; align-items: center; justify-content: center;
  position: relative; transition: border-color 0.15s, background 0.15s;
  min-height: 60px;
}
.pc-slot:hover { border-color: #6a9af8; background: #1e3050; }
.pc-slot.selected { border-color: #f8d030; background: #2a3a2a; }
.pc-slot.occupied { border-color: #3a5a8a; }
.pc-slot-img {
  width: 70px; height: 70px; image-rendering: pixelated;
}

/* Party sidebar */
#pc-party {
  width: 200px; background: #0f1f35; border-left: 2px solid #4a6a9a;
  padding: 8px; overflow-y: auto;
}
#pc-party-title {
  font-size: 10px; color: #8ab4f8; text-align: center;
  margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #2a3a5a;
}
.pc-party-slot {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; margin-bottom: 4px; border: 2px solid #2a3a5a;
  border-radius: 6px; cursor: pointer; transition: border-color 0.15s, background 0.15s;
  background: #1a2a4a;
}
.pc-party-slot:hover { border-color: #6a9af8; background: #1e3050; }
.pc-party-slot.selected { border-color: #f8d030; background: #2a3a2a; }
.pc-party-slot.empty { opacity: 0.4; cursor: default; }
.pc-party-img { width: 32px; height: 32px; image-rendering: pixelated; }
.pc-party-info { flex: 1; }
.pc-party-name { font-size: 8px; color: #fff; }
.pc-party-detail { font-size: 7px; color: #888; margin-top: 2px; }

/* Info bar */
#pc-info {
  padding: 8px 16px; background: #0d1b2e; border-top: 2px solid #4a6a9a;
  font-size: 9px; color: #8ab4f8; text-align: center; min-height: 32px;
}

/* Action buttons */
#pc-actions {
  display: flex; gap: 6px; justify-content: center;
  padding: 6px; background: #0d1b2e; border-top: 1px solid #2a3a5a;
}
#pc-actions button {
  background: #2a4a7a; border: 1px solid #4a6a9a; color: #ccc;
  font-family: inherit; font-size: 9px; padding: 6px 14px;
  border-radius: 4px; cursor: pointer;
}
#pc-actions button:hover { background: #3a5a8a; color: #fff; }
#pc-actions button.danger { background: #6a2020; border-color: #a44; }
#pc-actions button.danger:hover { background: #8b3030; }
`;

export class StorageUI {
  constructor(storageManager, partyManager, pokemonDefs) {
    this._storage = storageManager;
    this._party   = partyManager;
    this._defs    = pokemonDefs;
    this._currentBox = 0;
    this._selected = null; // { source: 'box'|'party', box?, slot, pokemon }
    this._onCloseCallback = null;

    this._injectStyles();
    this._buildDOM();
  }

  open(onClose) {
    this._onCloseCallback = onClose || null;
    this._selected = null;
    this._currentBox = 0;
    this._overlay.classList.add('open');
    this._render();
  }

  close() {
    this._overlay.classList.remove('open');
    this._selected = null;
    if (this._onCloseCallback) {
      const cb = this._onCloseCallback;
      this._onCloseCallback = null;
      cb();
    }
  }

  isOpen() { return this._overlay.classList.contains('open'); }

  _injectStyles() {
    if (document.getElementById('pc-styles')) return;
    const style = document.createElement('style');
    style.id = 'pc-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  _buildDOM() {
    this._overlay = document.createElement('div');
    this._overlay.id = 'pc-overlay';
    this._overlay.innerHTML = `
      <div id="pc-inner">
        <div id="pc-header">
          <span class="pc-title">PC Storage System</span>
          <div id="pc-box-nav">
            <button id="pc-prev">◀</button>
            <span id="pc-box-name">Box 1</span>
            <button id="pc-next">▶</button>
          </div>
          <button id="pc-close">✕ Close</button>
        </div>
        <div id="pc-body">
          <div id="pc-box-area"><div id="pc-box-grid"></div></div>
          <div id="pc-party">
            <div id="pc-party-title">Party</div>
            <div id="pc-party-list"></div>
          </div>
        </div>
        <div id="pc-actions"></div>
        <div id="pc-info">Select a Pokemon to deposit, withdraw, or move.</div>
      </div>`;
    document.body.appendChild(this._overlay);

    this._boxGrid   = this._overlay.querySelector('#pc-box-grid');
    this._partyList = this._overlay.querySelector('#pc-party-list');
    this._boxNameEl = this._overlay.querySelector('#pc-box-name');
    this._infoEl    = this._overlay.querySelector('#pc-info');
    this._actionsEl = this._overlay.querySelector('#pc-actions');

    // Nav
    this._overlay.querySelector('#pc-prev').addEventListener('click', () => {
      this._click();
      this._currentBox = (this._currentBox - 1 + this._storage.numBoxes) % this._storage.numBoxes;
      this._selected = null;
      this._render();
    });
    this._overlay.querySelector('#pc-next').addEventListener('click', () => {
      this._click();
      this._currentBox = (this._currentBox + 1) % this._storage.numBoxes;
      this._selected = null;
      this._render();
    });
    this._overlay.querySelector('#pc-close').addEventListener('click', () => {
      this._click();
      this.close();
    });

    // ESC to close
    this._keyHandler = (e) => {
      if (e.code === 'Escape' && this.isOpen()) {
        e.preventDefault();
        this.close();
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  _click() { window.overworldScene?.playSfx?.('click'); }

  _spriteUrl(speciesId) {
    return `/pokemon/Front/${speciesId.toUpperCase()}.png`;
  }

  _render() {
    this._renderBox();
    this._renderParty();
    this._renderActions();
    this._boxNameEl.textContent = this._storage.getBoxName(this._currentBox);
  }

  _renderBox() {
    this._boxGrid.innerHTML = '';
    const box = this._storage.getBox(this._currentBox);
    for (let s = 0; s < this._storage.boxSize; s++) {
      const p = box[s];
      const slot = document.createElement('div');
      slot.className = 'pc-slot' + (p ? ' occupied' : '');

      if (this._selected?.source === 'box' &&
          this._selected.box === this._currentBox &&
          this._selected.slot === s) {
        slot.classList.add('selected');
      }

      if (p) {
        slot.innerHTML = `<img class="pc-slot-img" src="${this._spriteUrl(p.speciesId)}" alt="${p.name}">`;
        slot.title = `${p.name} Lv.${p.level}`;
      }

      slot.addEventListener('click', () => {
        this._click();
        this._onBoxSlotClick(s, p);
      });
      this._boxGrid.appendChild(slot);
    }
  }

  _renderParty() {
    this._partyList.innerHTML = '';
    const party = this._party.getParty();
    for (let i = 0; i < 6; i++) {
      const p = party[i] || null;
      const slot = document.createElement('div');
      slot.className = 'pc-party-slot' + (p ? '' : ' empty');

      if (this._selected?.source === 'party' && this._selected.slot === i) {
        slot.classList.add('selected');
      }

      if (p) {
        const hpPct = Math.round((p.hp / p.maxHp) * 100);
        const hpColor = hpPct > 50 ? '#4c4' : hpPct > 20 ? '#cc4' : '#c44';
        slot.innerHTML = `
          <img class="pc-party-img" src="${this._spriteUrl(p.speciesId)}" alt="${p.name}">
          <div class="pc-party-info">
            <div class="pc-party-name">${p.name}</div>
            <div class="pc-party-detail">Lv.${p.level} · <span style="color:${hpColor}">${p.hp}/${p.maxHp}</span></div>
          </div>`;
        slot.addEventListener('click', () => {
          this._click();
          this._onPartySlotClick(i, p);
        });
      } else {
        slot.innerHTML = `<div class="pc-party-info"><div class="pc-party-name" style="color:#555">— empty —</div></div>`;
        slot.addEventListener('click', () => {
          this._click();
          // If we have a box pokemon selected, withdraw to this slot
          if (this._selected?.source === 'box' && this._selected.pokemon) {
            this._withdrawTo(this._selected.box, this._selected.slot);
          }
        });
      }
      this._partyList.appendChild(slot);
    }
  }

  _renderActions() {
    this._actionsEl.innerHTML = '';
    if (!this._selected) {
      this._infoEl.textContent = 'Select a Pokemon to deposit, withdraw, or move.';
      return;
    }

    const p = this._selected.pokemon;
    if (!p) {
      this._infoEl.textContent = 'Empty slot selected.';
      return;
    }

    const types = (p.types || []).map(t => t.charAt(0).toUpperCase() + t.slice(1)).join('/');
    this._infoEl.textContent = `${p.name} · Lv.${p.level} · ${types} · HP ${p.hp}/${p.maxHp}`;

    if (this._selected.source === 'party') {
      // Can deposit if party has more than 1
      if (this._party.size > 1) {
        const btn = document.createElement('button');
        btn.textContent = 'Deposit to Box';
        btn.addEventListener('click', () => {
          this._click();
          this._depositSelected();
        });
        this._actionsEl.appendChild(btn);
      } else {
        const note = document.createElement('span');
        note.style.cssText = 'color:#c44;font-size:9px;padding:6px;';
        note.textContent = 'Cannot deposit — need at least 1 in party!';
        this._actionsEl.appendChild(note);
      }
    } else if (this._selected.source === 'box') {
      if (!this._party.isFull) {
        const btn = document.createElement('button');
        btn.textContent = 'Withdraw to Party';
        btn.addEventListener('click', () => {
          this._click();
          this._withdrawTo(this._selected.box, this._selected.slot);
        });
        this._actionsEl.appendChild(btn);
      } else {
        const note = document.createElement('span');
        note.style.cssText = 'color:#c44;font-size:9px;padding:6px;';
        note.textContent = 'Party is full!';
        this._actionsEl.appendChild(note);
      }
    }

    // Cancel button
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => {
      this._click();
      this._selected = null;
      this._render();
    });
    this._actionsEl.appendChild(cancel);
  }

  // ── Slot click handlers ──────────────────────────────────────────────────

  _onBoxSlotClick(slotIndex, pokemon) {
    // If party pokemon selected + this box slot empty → deposit here
    if (this._selected?.source === 'party' && this._selected.pokemon && !pokemon) {
      this._depositTo(this._selected.slot, this._currentBox, slotIndex);
      return;
    }
    // If party pokemon selected + this box slot occupied → swap not supported yet, deselect
    // If box pokemon selected + clicking another box slot → move/swap within box
    if (this._selected?.source === 'box' && this._selected.pokemon &&
        (this._selected.box !== this._currentBox || this._selected.slot !== slotIndex)) {
      this._storage.moveSlot(this._selected.box, this._selected.slot, this._currentBox, slotIndex);
      this._selected = null;
      this._render();
      return;
    }

    // Select/deselect
    if (this._selected?.source === 'box' && this._selected.slot === slotIndex && this._selected.box === this._currentBox) {
      this._selected = null;
    } else {
      this._selected = { source: 'box', box: this._currentBox, slot: slotIndex, pokemon };
    }
    this._render();
  }

  _onPartySlotClick(slotIndex, pokemon) {
    // If box pokemon selected + clicking party slot → withdraw (swap if party slot occupied)
    if (this._selected?.source === 'box' && this._selected.pokemon) {
      this._withdrawTo(this._selected.box, this._selected.slot);
      return;
    }

    // Select/deselect
    if (this._selected?.source === 'party' && this._selected.slot === slotIndex) {
      this._selected = null;
    } else {
      this._selected = { source: 'party', slot: slotIndex, pokemon };
    }
    this._render();
  }

  // ── Operations ───────────────────────────────────────────────────────────

  _depositSelected() {
    if (this._selected?.source !== 'party') return;
    if (this._party.size <= 1) return;

    const partyIndex = this._selected.slot;
    const pokemon = this._party.removeSlot(partyIndex);
    if (!pokemon) return;

    const spot = this._storage.depositAuto(pokemon);
    if (!spot) {
      // Storage full — put back in party
      this._party.addInstance(pokemon);
      this._infoEl.textContent = 'All boxes are full!';
      return;
    }

    this._selected = null;
    this._render();
    this._infoEl.textContent = `${pokemon.name} deposited to ${this._storage.getBoxName(spot.box)}.`;
  }

  _depositTo(partyIndex, boxIndex, slotIndex) {
    if (this._party.size <= 1) return;
    const pokemon = this._party.removeSlot(partyIndex);
    if (!pokemon) return;

    if (!this._storage.deposit(pokemon, boxIndex, slotIndex)) {
      this._party.addInstance(pokemon);
      return;
    }

    this._selected = null;
    this._render();
    this._infoEl.textContent = `${pokemon.name} deposited.`;
  }

  _withdrawTo(boxIndex, slotIndex) {
    if (this._party.isFull) {
      this._infoEl.textContent = 'Party is full!';
      return;
    }

    const pokemon = this._storage.withdraw(boxIndex, slotIndex);
    if (!pokemon) return;

    this._party.addInstance(pokemon);
    this._selected = null;
    this._render();
    this._infoEl.textContent = `${pokemon.name} withdrawn to party!`;
  }

  destroy() {
    if (this._keyHandler) window.removeEventListener('keydown', this._keyHandler);
    this._overlay?.remove();
  }
}
