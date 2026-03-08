const STORAGE_KEY = 'pokemon-mmo-ui-positions';
const BAG_SIZE = 30;

export class Inventory {
  constructor() {
    this.hotbarSlots = new Array(12).fill(null);
    this.partySlots = new Array(6).fill(null);
    this.bagSlots = new Array(BAG_SIZE).fill(null);

    this.hotbarEl = document.getElementById('hotbar');
    this.partyEl = document.getElementById('party-panel');
    this.bagBtn = document.getElementById('bag-btn');
    this.bagOverlay = document.getElementById('bag-overlay');
    this.bagGrid = this.bagOverlay.querySelector('.bag-grid');
    this.bagCloseBtn = this.bagOverlay.querySelector('.bag-close');

    this._buildBagGrid();
    this._initDrag(this.hotbarEl);
    this._initDrag(this.partyEl);
    this._initSlots();
    this._loadPositions();

    this.bagBtn.addEventListener('click', () => this.toggleBag());
    this.bagCloseBtn.addEventListener('click', () => this.toggleBag(false));

    // Sync party slots whenever PartyManager fires pokemon-party-changed
    window.addEventListener('pokemon-party-changed', (e) => {
      this._syncPartySlots(e.detail?.party ?? null);
    });

    // Initial render — if PartyManager is already ready, sync now
    if (window.partyManager) {
      this._syncPartySlots(window.partyManager.getParty());
    }
  }

  // --- Bag grid ---

  _buildBagGrid() {
    this.bagGrid.innerHTML = '';
    for (let i = 0; i < BAG_SIZE; i++) {
      const slot = document.createElement('div');
      slot.className = 'inv-slot';
      slot.dataset.panel = 'bag';
      slot.dataset.index = i;
      slot.draggable = true;
      // Drag listeners — attached here so bag slots are included
      slot.addEventListener('dragstart', (e) => this._onDragStart(e, slot));
      slot.addEventListener('dragover',  (e) => { e.preventDefault(); slot.classList.add('drag-over'); });
      slot.addEventListener('dragleave', ()  => slot.classList.remove('drag-over'));
      slot.addEventListener('drop',      (e) => this._onDrop(e, slot));
      slot.addEventListener('dragend',   ()  => document.querySelectorAll('.inv-slot.drag-over').forEach(s => s.classList.remove('drag-over')));
      // Click to use item in overworld
      slot.addEventListener('click', () => {
        const data = this.bagSlots[i];
        if (!data || !data.id) return;
        if (window.inventoryManager) {
          window.inventoryManager.tryUseItemOverworld(data.id);
        }
      });
      this.bagGrid.appendChild(slot);
    }
  }

  // --- Panel dragging ---

  _initDrag(panel) {
    const handle = panel.querySelector('.drag-handle');
    if (!handle) return;

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onMouseDown = (e) => {
      e.preventDefault();
      dragging = true;
      const rect = panel.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      handle.style.cursor = 'grabbing';
    };

    const onMouseMove = (e) => {
      if (!dragging) return;
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      panel.style.transform = 'none';
    };

    const onMouseUp = () => {
      if (!dragging) return;
      dragging = false;
      handle.style.cursor = '';
      this._savePositions();
    };

    handle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  _savePositions() {
    const getPos = (el) => {
      const rect = el.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    };
    const data = {
      hotbar: getPos(this.hotbarEl),
      party: getPos(this.partyEl),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  _loadPositions() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (data.hotbar) this._applyPos(this.hotbarEl, data.hotbar);
      if (data.party) this._applyPos(this.partyEl, data.party);
    } catch { /* ignore corrupt data */ }
  }

  _applyPos(el, pos) {
    el.style.left = pos.left + 'px';
    el.style.top = pos.top + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = 'none';
  }

  // --- Slot drag & drop ---

  _initSlots() {
    const allSlots = document.querySelectorAll('.inv-slot');
    allSlots.forEach(slot => {
      slot.draggable = true;

      slot.addEventListener('dragstart', (e) => this._onDragStart(e, slot));
      slot.addEventListener('dragover', (e) => {
        e.preventDefault();
        slot.classList.add('drag-over');
      });
      slot.addEventListener('dragleave', () => {
        slot.classList.remove('drag-over');
      });
      slot.addEventListener('drop', (e) => this._onDrop(e, slot));
      slot.addEventListener('dragend', () => {
        document.querySelectorAll('.inv-slot.drag-over').forEach(s => s.classList.remove('drag-over'));
      });
    });
  }

  _onDragStart(e, slot) {
    const panel = slot.dataset.panel;
    const index = parseInt(slot.dataset.index);
    const arr = this._getArray(panel);
    if (!arr || !arr[index]) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', JSON.stringify({ panel, index }));
    e.dataTransfer.effectAllowed = 'move';
  }

  _onDrop(e, targetSlot) {
    e.preventDefault();
    targetSlot.classList.remove('drag-over');

    let src;
    try {
      src = JSON.parse(e.dataTransfer.getData('text/plain'));
    } catch { return; }

    const srcArr = this._getArray(src.panel);
    const tgtPanel = targetSlot.dataset.panel;
    const tgtIndex = parseInt(targetSlot.dataset.index);
    const tgtArr = this._getArray(tgtPanel);
    if (!srcArr || !tgtArr) return;

    const srcIsParty = src.panel === 'party';
    const tgtIsParty = tgtPanel === 'party';

    // Party slots only swap with other party slots
    if (srcIsParty || tgtIsParty) {
      if (srcIsParty && tgtIsParty) {
        const pm = window.partyManager;
        if (pm) pm.swapSlots(src.index, tgtIndex);
      }
      return;
    }

    // Items: allow bag ↔ hotbar, hotbar ↔ hotbar, bag ↔ bag
    const temp = tgtArr[tgtIndex];
    tgtArr[tgtIndex] = srcArr[src.index];
    srcArr[src.index] = temp;

    this._renderSlot(this._getSlotEl(src.panel, src.index), srcArr[src.index]);
    this._renderSlot(targetSlot, tgtArr[tgtIndex]);
  }

  _getArray(panel) {
    if (panel === 'hotbar') return this.hotbarSlots;
    if (panel === 'party') return this.partySlots;
    if (panel === 'bag') return this.bagSlots;
    return null;
  }

  _getSlotEl(panel, index) {
    if (panel === 'bag') {
      return this.bagGrid.children[index];
    }
    const container = panel === 'hotbar' ? this.hotbarEl : this.partyEl;
    return container.querySelector(`.inv-slot[data-index="${index}"]`);
  }

  _renderSlot(slotEl, data) {
    if (!slotEl) return;
    slotEl.innerHTML = '';
    if (!data) return;

    const isParty = slotEl.dataset.panel === 'party';

    if (data.icon) {
      if (data.iconSpritesheet) {
        const iconDiv = document.createElement('div');
        iconDiv.style.cssText = [
          'width:100%', 'height:100%',
          `background-image:url('${data.icon}')`,
          'background-repeat:no-repeat',
          'background-position:0 0',
          'background-size:200% 100%',
          'image-rendering:pixelated',
        ].join(';');
        // Hover: swap to animated GIF
        if (data.iconAnimated) {
          slotEl.addEventListener('mouseenter', () => {
            iconDiv.style.backgroundImage = `url('${data.iconAnimated}')`;
            iconDiv.style.backgroundSize = 'contain';
            iconDiv.style.backgroundPosition = 'center';
          });
          slotEl.addEventListener('mouseleave', () => {
            iconDiv.style.backgroundImage = `url('${data.icon}')`;
            iconDiv.style.backgroundSize = '200% 100%';
            iconDiv.style.backgroundPosition = '0 0';
          });
        }
        slotEl.appendChild(iconDiv);
      } else {
        const img = document.createElement('img');
        img.src = data.icon;
        slotEl.appendChild(img);
      }
    }

    if (isParty) {
      // Level label
      if (data.level !== undefined) {
        const lvl = document.createElement('span');
        lvl.className = 'slot-level';
        lvl.textContent = `Lv${data.level}`;
        slotEl.appendChild(lvl);
      }

      // HP bar
      if (data.currentHp !== undefined && data.maxHp) {
        const pct = Math.max(0, Math.min(1, data.currentHp / data.maxHp));
        const bar = document.createElement('div');
        bar.className = 'slot-hp-bar';
        const fill = document.createElement('div');
        fill.className = 'slot-hp-fill ' + (pct > 0.5 ? 'hp-high' : pct > 0.25 ? 'hp-medium' : 'hp-low');
        fill.style.width = (pct * 100) + '%';
        bar.appendChild(fill);
        slotEl.appendChild(bar);
      }
    } else {
      // Regular count badge for bag/hotbar
      if (data.count && data.count > 1) {
        const badge = document.createElement('span');
        badge.className = 'slot-count';
        badge.textContent = data.count;
        slotEl.appendChild(badge);
      }
    }
  }

  // --- Party sync ---

  _syncPartySlots(party) {
    const defs = window.partyManager?._pokemonDefs ?? {};
    for (let i = 0; i < 6; i++) {
      const p = party?.[i] ?? null;
      if (!p) {
        this.setPartySlot(i, null);
        continue;
      }

      const speciesId = p.speciesId ?? p._speciesId;
      const def = defs[speciesId] ?? {};
      const icon = `/pokemon/Icons/${speciesId.toUpperCase()}.png`;
      const iconAnimated = `/pokemon-animated/front/${speciesId.toLowerCase()}.gif`;

      const currentHp = p.hp ?? p.currentHp ?? p._currentHp ?? 0;
      const maxHp     = p.maxHp ?? p._maxHp ?? 1;

      this.setPartySlot(i, {
        icon,
        iconAnimated,
        iconSpritesheet: true,
        level:     p.level ?? p._level,
        currentHp,
        maxHp,
        name:      p.name ?? def.name ?? speciesId,
        speciesId,
      });
    }
  }

  // --- Bag overlay ---

  toggleBag(forceState) {
    const open = forceState !== undefined ? forceState : !this.isBagOpen();
    if (open) {
      this.bagOverlay.classList.add('open');
    } else {
      this.bagOverlay.classList.remove('open');
    }
  }

  isBagOpen() {
    return this.bagOverlay.classList.contains('open');
  }

  // --- Public API ---

  setHotbarSlot(i, data) {
    this.hotbarSlots[i] = data;
    this._renderSlot(this._getSlotEl('hotbar', i), data);
  }

  setPartySlot(i, data) {
    this.partySlots[i] = data;
    this._renderSlot(this._getSlotEl('party', i), data);
  }

  setBagSlot(i, data) {
    this.bagSlots[i] = data;
    this._renderSlot(this._getSlotEl('bag', i), data);
  }
}
