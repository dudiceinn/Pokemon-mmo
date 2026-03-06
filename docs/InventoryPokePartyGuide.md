# Inventory & Party System Guide

## Overview

This document describes the **Inventory + Party Management** architecture used in the Pokémon MMO project. Both systems follow the same pattern: a **UI layer** (`Inventory.js`) is driven by a **Manager layer** (`InventoryManager` / `PartyManager`) that handles all storage and business logic.

---

## Architecture

\`\`\`
UIScene.js
├── Inventory (UI layer)        ← renders slots, handles user input
├── InventoryManager            ← bridges items ↔ Inventory UI
└── PartyManager                ← bridges party Pokémon ↔ Inventory UI
\`\`\`

The UI never reads from storage directly. Managers own all data operations.

---

## PartyManager

**File:** `src/systems/PartyManager.js`

Manages the player's Pokémon party (up to 6 slots).

### Storage Format — `localStorage` key: `pokemon-mmo-party`

\`\`\`json
[
  {
    "uid":        "string",
    "speciesId":  "string",
    "nickname":   "string",
    "level":      5,
    "exp":        0,
    "currentHp":  25,
    "maxHp":      25,
    "moves":      ["tackle", "growl"],
    "friendship": 70
  }
]
\`\`\`

### Constructor

\`\`\`js
new PartyManager(inventoryUI, pokemonDefs)
\`\`\`

| Parameter     | Type        | Description                              |
|---------------|-------------|------------------------------------------|
| `inventoryUI` | `Inventory` | Your `Inventory.js` instance             |
| `pokemonDefs` | `object`    | Parsed `pokemon.json` keyed by speciesId |

---

## Core API

| Method | Returns | Description |
|--------|---------|-------------|
| `getParty()` | `Pokemon[]` | Full party array |
| `hasRoom()` | `boolean` | True if < 6 Pokémon |
| `addPokemon(speciesId, level)` | `boolean` | Add new Pokémon, false if full |
| `removePokemon(uid)` | `void` | Remove by UID |
| `getPokemon(uid)` | `Pokemon\|null` | Find by UID |
| `updatePokemon(uid, changes)` | `boolean` | Partial update |
| `hasSpecies(speciesId)` | `boolean` | Species check |

---

## Stat Formulas

**HP:** `floor(((2 × baseHp + 15) × level / 100) + level + 10)`

**Other stats:** `floor(((2 × baseStat + 15) × level / 100) + 5)`

IV fixed at 15, EV = 0.

---

## UIScene Integration

\`\`\`js
const pokemonDefs = this.cache.json.get('pokemonDefs');
if (pokemonDefs) {
  this.partyManager = new PartyManager(this.inventory, pokemonDefs);
  window.partyManager = this.partyManager;
}
\`\`\`

Preload `pokemon.json` in `BootScene` with cache key `'pokemonDefs'`.

---

## Migration to Server API

| Method | Now | Replace With |
|--------|-----|--------------|
| `_readStorage()` | `localStorage.getItem` | `GET /api/party` |
| `_writeStorage(p)` | `localStorage.setItem` | `PUT /api/party` |

---

## Console Debugging

\`\`\`js
window.partyManager.getParty()
window.partyManager.addPokemon('charmander', 10)
window.partyManager.updatePokemon(uid, { currentHp: 0 })
window.inventoryManager.getInventory()
\`\`\`