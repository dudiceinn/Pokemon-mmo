/**
 * InventoryManager
 *
 * The single source of truth for player inventory.
 * All reads/writes go through here — nothing else should touch localStorage directly.
 *
 * Storage format (localStorage):
 *   'pokemon-mmo-inventory' = { "potion": 3, "pokeball": 10, ... }
 *
 * Slot format (passed to Inventory UI):
 *   { id, name, icon, count, category, description, stackable, usable }
 *
 * Migration path:
 *   When going online, replace _readStorage / _writeStorage with server API calls.
 *   Nothing else in the codebase needs to change.
 */

const INVENTORY_KEY = 'pokemon-mmo-inventory';

export class InventoryManager {
  /**
   * @param {Inventory} inventoryUI  - Your Inventory.js instance
   * @param {object}    itemDefs     - Parsed items.json  { itemId: { name, icon, ... } }
   */
  constructor(inventoryUI, itemDefs) {
    this.ui = inventoryUI;
    this.defs = itemDefs;

    // Listen for changes triggered by ScriptRunner (giveitem / removeitem)
    window.addEventListener('pokemon-inventory-changed', () => this.syncToUI());

    // Initial sync on load
    this.syncToUI();
  }

  // --- Storage (swap these two methods when going online) ---

  _readStorage() {
    try {
      return JSON.parse(localStorage.getItem(INVENTORY_KEY) || '{}');
    } catch {
      return {};
    }
  }

  _writeStorage(inv) {
    localStorage.setItem(INVENTORY_KEY, JSON.stringify(inv));
    // Notify UI and any other listeners
    window.dispatchEvent(new CustomEvent('pokemon-inventory-changed'));
  }

  // --- Core API ---

  /**
   * Get count of a specific item. Returns 0 if not in inventory.
   */
  getCount(itemId) {
    const inv = this._readStorage();
    return inv[itemId] || 0;
  }

  /**
   * Check if player has at least `count` of an item.
   */
  hasItem(itemId, count = 1) {
    return this.getCount(itemId) >= count;
  }

  /**
   * Add items to inventory.
   */
  addItem(itemId, count = 1) {
    const inv = this._readStorage();
    inv[itemId] = (inv[itemId] || 0) + count;
    this._writeStorage(inv);
  }

  /**
   * Remove items from inventory. Won't go below 0.
   * Returns true if successful, false if not enough.
   */
  removeItem(itemId, count = 1) {
    const inv = this._readStorage();
    if ((inv[itemId] || 0) < count) return false;
    inv[itemId] -= count;
    if (inv[itemId] <= 0) delete inv[itemId];
    this._writeStorage(inv);
    return true;
  }

  /**
   * Get all items as an array of slot objects ready for the UI.
   * [ { id, name, icon, count, category, description, stackable, usable }, ... ]
   */
  getAllItems() {
    const inv = this._readStorage();
    return Object.entries(inv)
      .filter(([, count]) => count > 0)
      .map(([id, count]) => this._toSlot(id, count))
      .filter(Boolean); // remove items with no definition
  }

  // --- UI sync ---

  /**
   * Push current inventory into the bag slots of the Inventory UI.
   * Fills bag slots in order, clears any leftover slots.
   */
  syncToUI() {
    if (!this.ui) return;

    const items = this.getAllItems();

    // Fill bag slots
    for (let i = 0; i < 30; i++) {
      this.ui.setBagSlot(i, items[i] || null);
    }

    // Sync hotbar — only update slots that already have an item id,
    // so the player's manual hotbar arrangement is preserved.
    for (let i = 0; i < 12; i++) {
      const existing = this.ui.hotbarSlots[i];
      if (existing && existing.id) {
        const count = this.getCount(existing.id);
        if (count <= 0) {
          // Item was consumed — clear the hotbar slot
          this.ui.setHotbarSlot(i, null);
        } else {
          // Update count in case it changed
          this.ui.setHotbarSlot(i, this._toSlot(existing.id, count));
        }
      }
    }
  }

  // --- Helpers ---

  /**
   * Build a slot object from an item id and count.
   * Returns null if the item has no definition in items.json.
   */
  _toSlot(id, count) {
    const def = this.defs[id];
    if (!def) {
      console.warn(`[InventoryManager] No definition for item: "${id}"`);
      return null;
    }
    return {
      id,
      name: def.name,
      icon: def.icon,
      description: def.description,
      category: def.category,
      stackable: def.stackable,
      usable: def.usable,
      count,
    };
  }

  // ── Overworld item use ────────────────────────────────────────────────────

  /**
   * Called when the player clicks an item in the bag during the overworld.
   * Uses item category from items.json to decide what to do:
   *   pokeball  → battle only
   *   medicine  → open party picker (heal HP, cure status, revive, level up)
   *   battle    → repel/escape rope handling
   *   key       → can't use here
   *   pokemon   → can't use here
   */
  tryUseItemOverworld(itemId) {
    const scene = window.overworldScene;
    if (scene?.cutsceneActive) return;

    const def = this.defs[itemId];
    if (!def) return;

    const { name, category, usable } = def;

    if (!usable) {
      this._showMessage(`${name} can't be used here.`);
      return;
    }

    switch (category) {

      case 'pokeball':
        this._showMessage(`${name} can only be used in battle.`);
        break;

      case 'key':
      case 'pokemon':
        this._showMessage(`${name} can't be used here.`);
        break;

      case 'medicine':
        this._useMedicineOverworld(itemId, name);
        break;

      case 'battle':
        this._useBattleItemOverworld(itemId, name);
        break;

      default:
        this._showMessage(`${name} can't be used here.`);
    }
  }

  /** Handles all medicine-category items via party picker. */
  _useMedicineOverworld(itemId, name) {
    // Revive only shown for fainted; others only for active
    const faintedOnly = itemId === 'revive';

    this._openPartyTarget(name, (pokemon) => {
      const isFainted = pokemon.isFainted;

      // --- Revive ---
      if (itemId === 'revive') {
        if (!isFainted) { this._showMessage(`${pokemon.name} isn't fainted!`); return; }
        const hp = Math.floor(pokemon.maxHp / 2);
        pokemon.heal(hp);
        window.partyManager?.save();
        this.removeItem(itemId, 1);
        this._showMessage(`${pokemon.name} was revived with ${hp} HP!`);
        return;
      }

      if (isFainted) { this._showMessage(`${pokemon.name} has fainted!`); return; }

      // --- HP heals ---
      const healMap = { potion: 20, super_potion: 50, hyper_potion: 200, max_potion: Infinity };
      if (healMap[itemId] !== undefined) {
        if (pokemon.hp >= pokemon.maxHp) { this._showMessage(`${pokemon.name}'s HP is already full!`); return; }
        const healed = pokemon.heal(healMap[itemId]);
        window.partyManager?.save();
        this.removeItem(itemId, 1);
        this._showMessage(`${pokemon.name} restored ${healed} HP!`);
        return;
      }

      // --- Status cures ---
      const cureMap = {
        antidote:  ['poison'],
        burn_heal: ['burn'],
        full_heal: ['poison', 'burn', 'paralysis', 'sleep', 'freeze'],
      };
      if (cureMap[itemId]) {
        if (!pokemon.status || !cureMap[itemId].includes(pokemon.status)) {
          this._showMessage(`It won't have any effect on ${pokemon.name}.`); return;
        }
        const old = pokemon.status;
        pokemon.clearStatus();
        window.partyManager?.save();
        this.removeItem(itemId, 1);
        this._showMessage(`${pokemon.name} was cured of ${old}!`);
        return;
      }

      // --- Rare Candy ---
      if (itemId === 'rare_candy') {
        // gainExp with a large number triggers level-up(s) via PokemonInstance
        const expNeeded = pokemon._expForNextLevel
          ? pokemon._expForNextLevel()
          : 9999;
        pokemon.gainExp(expNeeded);
        window.partyManager?.save();
        this.removeItem(itemId, 1);
        this._showMessage(`${pokemon.name} leveled up to Lv.${pokemon.level}!`);
        return;
      }

      this._showMessage(`${name} can't be used here.`);
    }, { faintedOnly });
  }

  /** Handles battle-category items (repel, escape rope). */
  _useBattleItemOverworld(itemId, name) {
    if (itemId === 'repel' || itemId === 'super_repel') {
      this.removeItem(itemId, 1);
      const steps = itemId === 'super_repel' ? 200 : 100;
      this._showMessage(`Repel will keep weak wild Pokémon away for ${steps} steps!`);
      return;
    }
    if (itemId === 'escape_rope') {
      this._showMessage(`Can't use Escape Rope here.`);
      return;
    }
    this._showMessage(`${name} can't be used here.`);
  }

  _openPartyTarget(itemName, onPick, opts = {}) {
    const pm = window.partyManager;
    if (!pm) return;
    const party = pm.getParty();
    if (!party.length) { this._showMessage(`You have no Pokémon!`); return; }

    document.getElementById('party-target-picker')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'party-target-picker';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:100002;
      display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,0.6);
    `;

    const box = document.createElement('div');
    box.style.cssText = `
      background:#1a1a2e;border:3px solid #ffd700;border-radius:12px;
      padding:16px 20px;min-width:260px;font-family:monospace;
    `;

    const title = document.createElement('div');
    title.style.cssText = `color:#ffd700;font-size:14px;margin-bottom:12px;letter-spacing:1px;`;
    title.textContent = `Use ${itemName} on...`;
    box.appendChild(title);

    party.forEach((pokemon) => {
      const isFainted = pokemon.isFainted;
      const isDisabled = opts.faintedOnly ? !isFainted : isFainted;

      const row = document.createElement('div');
      row.style.cssText = `
        display:flex;align-items:center;gap:10px;padding:8px 10px;
        border-radius:8px;margin-bottom:6px;
        cursor:${isDisabled ? 'not-allowed' : 'pointer'};
        background:${isDisabled ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)'};
        opacity:${isDisabled ? '0.4' : '1'};transition:background 0.15s;
      `;

      if (!isDisabled) {
        row.addEventListener('mouseenter', () => row.style.background = 'rgba(255,215,0,0.15)');
        row.addEventListener('mouseleave', () => row.style.background = 'rgba(255,255,255,0.08)');
        row.addEventListener('click', () => { overlay.remove(); onPick(pokemon); });
      }

      const speciesId = pokemon.speciesId ?? pokemon._speciesId;
      const img = document.createElement('div');
      img.style.cssText = [
        'width:32px', 'height:32px', 'flex-shrink:0',
        `background-image:url('/pokemon/Icons/${speciesId.toUpperCase()}.png')`,
        'background-repeat:no-repeat',
        'background-position:0 0',
        'background-size:200% 100%',
        'image-rendering:pixelated',
      ].join(';');

      const hp = pokemon.hp ?? pokemon.currentHp ?? 0;
      const maxHp = pokemon.maxHp ?? 1;
      const pct = Math.max(0, Math.min(1, hp / maxHp));
      const hpColor = pct > 0.5 ? '#44dd44' : pct > 0.25 ? '#ffcc00' : '#ff4444';

      const info = document.createElement('div');
      info.innerHTML = `
        <div style="color:#fff;font-size:14px;font-weight:bold;">
          ${pokemon.name} <span style="color:#aaa;font-size:11px;">Lv.${pokemon.level}</span>
        </div>
        <div style="color:${hpColor};font-size:11px;">
          ${isFainted ? 'FAINTED' : `HP: ${hp}/${maxHp}`}
        </div>
      `;
      row.appendChild(img);
      row.appendChild(info);
      box.appendChild(row);
    });

    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.style.cssText = `
      margin-top:8px;width:100%;padding:7px;
      background:transparent;border:2px solid #666;border-radius:6px;
      color:#aaa;font-family:monospace;font-size:13px;cursor:pointer;
    `;
    cancel.addEventListener('click', () => overlay.remove());
    box.appendChild(cancel);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  _showMessage(text) {
    document.getElementById('overworld-item-msg')?.remove();
    const box = document.createElement('div');
    box.id = 'overworld-item-msg';
    box.style.cssText = `
      position:fixed;bottom:180px;left:50%;
      transform:translateX(-50%) translateY(20px);
      background:#1a1a2e;border:3px solid #ffd700;border-radius:10px;
      padding:12px 24px;z-index:100001;font-family:monospace;
      font-size:15px;color:#fff;box-shadow:0 0 14px rgba(255,215,0,0.3);
      opacity:0;transition:opacity 0.2s ease,transform 0.2s ease;
      pointer-events:none;text-align:center;max-width:320px;
    `;
    box.textContent = text;
    document.body.appendChild(box);
    requestAnimationFrame(() => {
      box.style.opacity = '1';
      box.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
      box.style.opacity = '0';
      box.style.transform = 'translateX(-50%) translateY(-10px)';
      setTimeout(() => box.remove(), 250);
    }, 2200);
  }
}
