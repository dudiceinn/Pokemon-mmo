/**
 * ScriptRunner — NPC Script Language Parser & Executor
 *
 * Supported commands:
 *
 *   say: Hello {player}!          — Show a dialog line (collected into one dialog box)
 *   movenpc: 10 5                 — NPC walks to tile X Y
 *   moveplayer: 10 7              — Player auto-walks to tile X Y (cutscene)
 *   teleportplayer: 3 8           — Instantly teleport player to X Y (same map)
 *   teleportmap: map_key x y      — Fade-transition player to a different map at X Y
 *   setflag: flag_name            — Set a game flag
 *   clearflag: flag_name          — Remove a game flag
 *   checkflag: flag_name          — Skip to next 'say' block if flag is NOT set
 *   hidenpc                       — Apply the NPC's hideFlag (marks it gone)
 *   giveitem: item_id count       — Give item to player (count optional, default 1)
 *   checkitem: item_id count      — Skip next block if player doesn't have item
 *   removeitem: item_id count     — Remove item from player (count optional, default 1)
 *   givemoney: amount             — Give player PokéDollars
 *   reducemoney: amount           — Remove PokéDollars from player
 *   checkmoney: amount            — Skip next block if player has less than amount
 *   wait: ms                      — Wait N milliseconds (e.g. pause between dialog)
 *   sound: key                    — Play a sound effect
 *   showimage: path               — Show passive image popup above dialog (e.g. showimage: pokemon/bulbasaur). Does not block input.
 *   hideimage                     — Remove the image popup.
 *   choice: question text         — Yes/No prompt. Yes = continue script. No = skip rest of script.
 *   jump: label_name              — Jump to a label: line in the script
 *   label: label_name             — Define a jump target (no-op during execution)
 *   givepokemon: speciesId level  — Add a Pokémon to the player's party via PartyManager (level optional, default 5). Shows receive animation.
 *   healparty                     — Restore all party Pokémon to full HP via PartyManager.
 *   # comment                     — Ignored
 *   (blank lines)                 — Ignored
 *
 * Scripts are stored as the `script` string on each dialog entry.
 * Legacy `lines` arrays still work — they're treated as a sequence of `say:` commands.
 */

const FLAG_KEY = 'pokemon-mmo-flags';
const INVENTORY_KEY = 'pokemon-mmo-inventory';
const MONEY_KEY = 'pokemon-mmo-money';

// --- Flag helpers (localStorage, matches FlagManager) ---
function readFlags() {
  try { return JSON.parse(localStorage.getItem(FLAG_KEY) || '{}'); } catch { return {}; }
}
function writeFlags(f) { localStorage.setItem(FLAG_KEY, JSON.stringify(f)); }

// --- Inventory helpers ---
function readInventory() {
  try { return JSON.parse(localStorage.getItem(INVENTORY_KEY) || '{}'); } catch { return {}; }
}
function writeInventory(inv) { localStorage.setItem(INVENTORY_KEY, JSON.stringify(inv)); }

// --- Money helpers ---
function readMoney() {
  try { return parseInt(localStorage.getItem(MONEY_KEY) || '0', 10); } catch { return 0; }
}
function writeMoney(n) { localStorage.setItem(MONEY_KEY, String(Math.max(0, n))); }

/**
 * Parse a raw script string into an array of command objects.
 * Each command: { cmd: string, args: string[] }
 */
export function parseScript(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) {
        // No colon = bare command (e.g. "hidenpc")
        return { cmd: line.toLowerCase(), args: [] };
      }
      const cmd = line.slice(0, colonIdx).trim().toLowerCase();
      const rest = line.slice(colonIdx + 1).trim();
      // Args: split by whitespace, but only for non-say commands
      // say keeps the full rest as one arg
      if (cmd === 'say' || cmd === 'label' || cmd === 'jump') {
        return { cmd, args: [rest] };
      }
      const args = rest.split(/\s+/).filter(Boolean);
      return { cmd, args };
    });
}

/**
 * Convert legacy `lines` array to a script string.
 * Used so old NPC data still works with the new runner.
 */
export function linesToScript(lines) {
  if (!lines || !lines.length) return '';
  return lines.map(l => `say: ${l}`).join('\n');
}

/**
 * Convert a script string back to a legacy `lines` array (say: commands only).
 * Used for backward compat when saving.
 */
export function scriptToLines(script) {
  return parseScript(script)
    .filter(c => c.cmd === 'say')
    .map(c => c.args[0] || '');
}

/**
 * ScriptRunner — executes a parsed script against the game scene.
 *
 * Usage:
 *   const runner = new ScriptRunner(scene, npc, playerName);
 *   runner.run(scriptString, onComplete);
 */
export class ScriptRunner {
  constructor(scene, npc, playerName) {
    this.scene = scene;
    this.npc = npc;
    this.playerName = playerName || '';
  }

  /**
   * Run a script string. Calls onComplete when fully done.
   * Handles batching `say:` lines into dialog boxes, interleaving
   * walks, teleports, flag ops, and inventory ops.
   */
  run(script, onComplete) {
    const commands = parseScript(script);
    if (!commands.length) {
      if (onComplete) onComplete();
      return;
    }
    this._execute(commands, 0, onComplete);
  }

  /**
   * Run a legacy lines array (backward compat).
   */
  runLines(lines, onComplete) {
    this.run(linesToScript(lines), onComplete);
  }

  // --- Internal executor (recursive step machine) ---

  _execute(commands, idx, onComplete) {
  if (idx >= commands.length) {
    // Script ended, hide image if it's still showing
    this._hideImage();
    this.scene.currentImage = null;
    if (onComplete) onComplete();
    return;
}
    // Collect consecutive `say:` commands into one dialog box
// Collect consecutive `say:` commands into one dialog box
if (commands[idx].cmd === 'say') {
    const sayLines = [];
    let i = idx;
    while (i < commands.length && commands[i].cmd === 'say') {
        sayLines.push(this._interpolate(commands[i].args[0] || ''));
        i++;
    }
    const npcName = this.npc ? (this.npc.name || '') : '';
    
    // Don't hide the image - it should stay visible
    this.scene.dialogBox.open(npcName, sayLines, () => {
        this._execute(commands, i, onComplete);
    });
    return;
}

    const { cmd, args } = commands[idx];
    const next = () => this._execute(commands, idx + 1, onComplete);

    switch (cmd) {

      case 'movenpc': {
        const x = parseInt(args[0], 10);
        const y = parseInt(args[1], 10);
        if (!isNaN(x) && !isNaN(y) && this.npc) {
          this.scene.startNpcWalk(this.npc, x, y, next);
        } else { next(); }
        break;
      }

      case 'moveplayer': {
        const x = parseInt(args[0], 10);
        const y = parseInt(args[1], 10);
        if (!isNaN(x) && !isNaN(y)) {
          this.scene.startPlayerWalk(x, y, next);
        } else { next(); }
        break;
      }

      case 'teleportplayer': {
        const x = parseInt(args[0], 10);
        const y = parseInt(args[1], 10);
        if (!isNaN(x) && !isNaN(y)) {
          this.scene.teleportPlayer(x, y);
        }
        next();
        break;
      }

      case 'teleportmap': {
        // teleportmap: map_key x y — fade-transition to a different map
        const mapKey = args[0];
        const x = parseInt(args[1], 10);
        const y = parseInt(args[2], 10);
        if (mapKey && !isNaN(x) && !isNaN(y)) {
          // doTransition handles the fade, map load, and player repositioning
          this.scene.doTransition(mapKey, x, y);
          // Script ends here — the map transition destroys this context
          // onComplete is intentionally NOT called; the new map starts fresh
        } else {
          console.warn(`[ScriptRunner] teleportmap: invalid args "${args.join(' ')}"`);
          next();
        }
        break;
      }

      case 'setflag': {
        const flagName = args[0];
        if (flagName) this.scene.flags.setFlag(flagName);
        this.scene.updateNpcVisibility();
        this.scene.checkFlagTriggeredWalks();
        next();
        break;
      }

      case 'clearflag': {
        const flagName = args[0];
        if (flagName) this.scene.flags.clearFlag(flagName);
        this.scene.updateNpcVisibility();
        next();
        break;
      }

      case 'checkflag': {
        // If flag is NOT set, skip to the next non-say command (skip the next say block)
        const flagName = args[0];
        const hasFlag = flagName ? this.scene.flags.hasFlag(flagName) : false;
        if (!hasFlag) {
          // Skip forward past the next say block
          let i = idx + 1;
          while (i < commands.length && commands[i].cmd === 'say') i++;
          this._execute(commands, i, onComplete);
        } else {
          next();
        }
        break;
      }

      case 'hidenpc': {
        if (this.npc && this.npc.hideFlag) {
          this.scene.flags.setFlag(this.npc.hideFlag);
        } else if (this.npc) {
          // Force hide even without hideFlag
          this.npc._visible = false;
          if (this.npc.sprite) this.npc.sprite.setVisible(false);
          if (this.npc.label) this.npc.label.hide();
        }
        this.scene.updateNpcVisibility();
        next();
        break;
      }

      case 'giveitem': {
        const itemId = args[0];
        const count = parseInt(args[1], 10) || 1;
        if (itemId) {
          const inv = readInventory();
          inv[itemId] = (inv[itemId] || 0) + count;
          writeInventory(inv);
          // Notify inventory UI if available
          this._notifyInventoryChange();
          // Show item received notification, then continue
          const defs = this.scene.cache ? this.scene.cache.json.get('itemDefs') : null;
          const def = defs?.[itemId];
          const displayName = def?.name ?? itemId;
          const icon = def?.icon ?? null;
          this._showItemReceived(displayName, count, icon, next);
        } else {
          next();
        }
        break;
      }

      case 'checkitem': {
        // Skip next say block if player does NOT have item (with optional count)
        const itemId = args[0];
        const required = parseInt(args[1], 10) || 1;
        const inv = readInventory();
        const has = (inv[itemId] || 0) >= required;
        if (!has) {
          let i = idx + 1;
          while (i < commands.length && commands[i].cmd === 'say') i++;
          this._execute(commands, i, onComplete);
        } else {
          next();
        }
        break;
      }

      case 'removeitem':
      case 'deleteitems':
      case 'deleteitem': {
        const itemId = args[0];
        const count = parseInt(args[1], 10) || 1;
        if (itemId) {
          const inv = readInventory();
          inv[itemId] = Math.max(0, (inv[itemId] || 0) - count);
          if (inv[itemId] === 0) delete inv[itemId];
          writeInventory(inv);
          this._notifyInventoryChange();
        }
        next();
        break;
      }

      case 'givemoney':
      case 'givepokedollars': {
        const amount = parseInt(args[0], 10) || 0;
        writeMoney(readMoney() + amount);
        this._notifyMoneyChange();
        next();
        break;
      }

      case 'reducemoney':
      case 'reducepokedollars': {
        const amount = parseInt(args[0], 10) || 0;
        writeMoney(readMoney() - amount);
        this._notifyMoneyChange();
        next();
        break;
      }

      case 'checkmoney': {
        // Skip next say block if player has LESS than amount
        const required = parseInt(args[0], 10) || 0;
        const has = readMoney() >= required;
        if (!has) {
          let i = idx + 1;
          while (i < commands.length && commands[i].cmd === 'say') i++;
          this._execute(commands, i, onComplete);
        } else {
          next();
        }
        break;
      }

      case 'wait': {
        const ms = parseInt(args[0], 10) || 500;
        this.scene.time.delayedCall(ms, next);
        break;
      }

      case 'sound': {
        const key = args[0];
        if (key && this.scene.sound) {
          try { this.scene.sound.play(key); } catch {}
        }
        next();
        break;
      }

case 'showimage': {
    const imgPath = args[0];
    if (imgPath) {
        // Extract the pokemon name
        const pokemon = imgPath.split('/').pop();
        
        // Try multiple case variations to handle different file naming conventions
        const variations = [
            pokemon,                    // As typed in the script
            pokemon.toUpperCase(),      // All caps (for CHARMANDER.png, SQUIRTLE.png)
            pokemon.toLowerCase(),      // All lowercase (for bulbasaur.png)
            pokemon.charAt(0).toUpperCase() + pokemon.slice(1).toLowerCase() // Capitalized (Charmander.png)
        ];
        
        // Remove duplicates (in case some variations are the same)
        const uniqueVariations = [...new Set(variations)];
        
        console.log('Attempting to load image with variations:', uniqueVariations);
        
        // Store the base path and variations for the image loader
        this.scene.currentImage = {
            basePath: '/pokemon/',
            variations: uniqueVariations,
            extension: '.png'
        };
        
        // Show the image with fallback variations
        this._showImageWithVariations('/pokemon/Front/', uniqueVariations, '.png');
    }
    next();
    break;
}
      case 'hideimage': {
        // Manual hide — still supported but usually not needed
        this._hideImage();
        next();
        break;
      }
case 'choice': {
    // Yes/No prompt. Yes = continue. No = abort script.
    const question = this._interpolate(args.join(' ') || 'Are you sure?');
    this._showChoice(question,
        () => { 
            // On Yes - hide image and continue
            this._hideImage(); 
            this.scene.currentImage = null;
            next(); 
        },
        () => { 
            // On No - hide image and end script
            this._hideImage(); 
            this.scene.currentImage = null;
            if (onComplete) onComplete(); 
        }
    );
    break;
}

      // ---------------------------------------------------------------
      // givepokemon: speciesId level
      // Adds a Pokémon to the player's party via PartyManager, then plays
      // the receive animation (pop-in → fly to party slot).
      // ---------------------------------------------------------------
      case 'givepokemon': {
        const speciesId = args[0];
        const level = parseInt(args[1], 10) || 5;
        if (speciesId) {
          const pm = this.scene.partyManager || window.partyManager;
          if (pm) {
            const success = pm.addPokemon(speciesId, level);
            if (success) {
              // Find which slot index this pokemon landed in (last in party)
              const party = pm.getParty();
              const slotIndex = party.length - 1;
              // Look up display name from pokemonDefs if available
              const defs = this.scene.cache
                ? this.scene.cache.json.get('pokemonDefs')
                : null;
              const displayName = defs && defs[speciesId]
                ? defs[speciesId].name
                : speciesId.charAt(0).toUpperCase() + speciesId.slice(1);
              // Show the animated receive screen, then continue script
              this._showReceiveAnimation(speciesId, displayName, slotIndex, next);
            } else {
              console.warn(`[ScriptRunner] givepokemon: party full — ${speciesId} not added (PC box not yet implemented)`);
              next();
            }
          } else {
            console.warn('[ScriptRunner] givepokemon: partyManager not found on scene or window');
            next();
          }
        } else {
          next();
        }
        break;
      }

      // ---------------------------------------------------------------
      // healparty
      // Restores all party Pokémon to full HP via PartyManager.
      // ---------------------------------------------------------------
case 'healparty': {
  const pm = this.scene.partyManager || window.partyManager;

  if (pm) {
    pm.healAll();
    console.log("[ScriptRunner] healparty executed");
  }

  next();
  break;
}

      // ---------------------------------------------------------------
      // battle: speciesId level
      // Starts a battle against a wild Pokémon (or the BattleTestNPC
      // chooser if no args are given).
      // Pauses the script until the battle ends, then resumes.
      // ---------------------------------------------------------------
      case 'battle': {
        const speciesId = args[0] || null;
        const level     = parseInt(args[1], 10) || 5;

        const scene = this.scene;

        // Helper that actually launches BattleUI given a concrete species + level
        const launchBattle = (sid, lvl) => {
          const pm          = scene.partyManager || window.partyManager;
          const pokemonDefs = scene.cache?.json?.get('pokemonDefs') || window._pokemonDefs;
          const moveDefs    = scene.cache?.json?.get('moveDefs')    || window._moveDefs;

          if (!pm || !pokemonDefs || !moveDefs) {
            console.warn('[ScriptRunner] battle: missing partyManager / defs — cannot start battle');
            next();
            return;
          }

          const party = pm.getParty().filter(p => !p.isFainted);
          if (!party.length) {
            console.warn('[ScriptRunner] battle: player has no healthy Pokémon');
            next();
            return;
          }

          import('../systems/BattleState.js').then(({ BattleState }) => {
            import('../scenes/BattleUI.js').then(({ BattleUI }) => {
              const state = new BattleState({
                playerPokemon:     party[0],
                wildData:          { speciesId: sid, level: lvl },
                pokemonDefs,
                moveDefs,
                partyManager:      pm,
                inventoryManager:  scene.inventory || null,
              });

              const ui = new BattleUI(state, () => {
                // Battle ended — resume the script
                next();
              });

              ui.show();
            });
          });
        };

        if (speciesId) {
          // Script provided the enemy directly: `battle: pikachu 10`
          launchBattle(speciesId, level);
        } else {
          // No args — show the test-battle chooser UI
          import('../systems/BattleTestChooser.js')
            .then(({ showBattleTestChooser }) => {
              showBattleTestChooser(scene, (sid, lvl) => launchBattle(sid, lvl), next);
            })
            .catch(() => {
              console.warn('[ScriptRunner] battle: BattleTestChooser not found; using fallback pikachu');
              launchBattle('pikachu', 5);
            });
        }
        // Note: next() is called inside the async callbacks above — do NOT fall through
        break;
      }

      case 'label': {
        // Labels are no-ops during execution — they are only used as jump targets
        next();
        break;
      }

      case 'jump': {
        const targetLabel = args[0];
        if (!targetLabel) { next(); break; }
        // Find the matching label: command
        const labelIdx = commands.findIndex(c => c.cmd === 'label' && c.args[0] === targetLabel);
        if (labelIdx === -1) {
          console.warn(`[ScriptRunner] jump: label "${targetLabel}" not found`);
          next();
        } else {
          // Jump to the command after the label (label itself is a no-op)
          this._execute(commands, labelIdx + 1, onComplete);
        }
        break;
      }

      default: {
        console.warn(`[ScriptRunner] Unknown command: "${cmd}"`);
        next();
        break;
      }
    }
  }

  // Replace {player} with actual player name
  _interpolate(text) {
    return text.replace(/\{player\}/gi, this.playerName);
  }

  _notifyInventoryChange() {
    window.dispatchEvent(new CustomEvent('pokemon-inventory-changed'));
  }

  _notifyMoneyChange() {
    window.dispatchEvent(new CustomEvent('pokemon-money-changed'));
  }

  // --- Image popup (passive — does not block input) ---

  /**
   * Show a floating image popup above the dialog box.
   * Passive — does not block Space or script execution.
   * Stays visible until _hideImage() is called.
   * Used with showimage: pokemon/bulbasaur → assets/sprites/pokemon/bulbasaur.png
   */
_showImage(src) {
    this._hideImage();

    const popup = document.createElement('div');
    popup.id = 'script-image-overlay';
    popup.style.cssText = `
        position: fixed;
        bottom: 180px;
        left: 50%;
        transform: translateX(-50%);
        background: #f8f8d0;
        border: 4px solid #383858;
        border-radius: 8px;
        padding: 20px;  /* Increased padding */
        z-index: 99999;
        box-shadow: 4px 4px 0px #383858;
        text-align: center;
        pointer-events: none;
    `;

    const img = document.createElement('img');
    img.src = src;
    img.style.cssText = `
        width: 200px;    /* Increased from 120px */
        height: 200px;   /* Increased from 120px */
        object-fit: contain;
        image-rendering: pixelated;
        display: block;
    `;

    // Optional: Add a small label with the Pokemon name
    const label = document.createElement('div');
    label.style.cssText = `
        margin-top: 8px;
        font-family: monospace;
        font-size: 16px;
        color: #383858;
        font-weight: bold;
    `;
    
    // Extract name from path for label
    const name = src.split('/').pop().replace('.png', '');
    label.textContent = name.charAt(0).toUpperCase() + name.slice(1);

    img.onload = () => {
        console.log('✅ Image loaded successfully:', src);
    };
    
    img.onerror = () => {
        console.warn(`❌ [ScriptRunner] showimage: could not load "${src}"`);
        popup.remove();
    };

    popup.appendChild(img);
    popup.appendChild(label);  // Add the label
    document.body.appendChild(popup);
}
  _hideImage() {
    const el = document.getElementById('script-image-overlay');
    if (el) el.remove();
  }


/**
 * Show image with multiple filename variations (tries each until one works)
 */
_showImageWithVariations(basePath, variations, extension = '.png') {
    // Remove any existing image first
    this._hideImage();

    const popup = document.createElement('div');
    popup.id = 'script-image-overlay';
    popup.style.cssText = `
        position: fixed;
        bottom: 180px;
        left: 50%;
        transform: translateX(-50%);
        background: #f8f8d0;
        border: 4px solid #383858;
        border-radius: 8px;
        padding: 20px;
        z-index: 99999;
        box-shadow: 4px 4px 0px #383858;
        text-align: center;
        pointer-events: none;
    `;

    const img = document.createElement('img');
    img.style.cssText = `
        width: 200px;
        height: 200px;
        object-fit: contain;
        image-rendering: pixelated;
        display: block;
    `;

    // Add a label for the Pokemon name
    const label = document.createElement('div');
    label.style.cssText = `
        margin-top: 8px;
        font-family: monospace;
        font-size: 16px;
        color: #383858;
        font-weight: bold;
    `;
    
    // Set label text from the first variation (capitalized nicely)
    const displayName = variations[0].charAt(0).toUpperCase() + variations[0].slice(1).toLowerCase();
    label.textContent = displayName;

    let currentIndex = 0;
    
    const tryNextVariation = () => {
        if (currentIndex < variations.length) {
            const filename = variations[currentIndex];
            const fullPath = `${basePath}${filename}${extension}`;
            console.log(`Trying image variation ${currentIndex + 1}/${variations.length}: ${fullPath}`);
            img.src = fullPath;
            currentIndex++;
        } else {
            console.error('❌ All image variations failed to load');
            // Show a fallback text or just remove the popup
            label.textContent = displayName + ' (image not found)';
            label.style.color = 'red';
        }
    };
    
    img.onload = () => {
        console.log('✅ Image loaded successfully:', img.src);
        // Success! No need to try more variations
    };
    
    img.onerror = (e) => {
        console.warn(`❌ Failed to load: ${img.src}`);
        // Try the next variation
        tryNextVariation();
    };

    popup.appendChild(img);
    popup.appendChild(label);
    document.body.appendChild(popup);
    
    // Start trying the first variation
    tryNextVariation();
}

/**
 * Override the original _showImage to use the new method
 */
_showImage(src) {
    // For backward compatibility, extract filename and treat as single variation
    const filename = src.split('/').pop().replace('.png', '');
    this._showImageWithVariations('/pokemon/Front/', [filename], '.png');
}

  // --- Yes/No choice prompt ---

  _showChoice(question, onYes, onNo) {
    // Remove any existing choice UI
    const existing = document.getElementById('script-choice-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'script-choice-overlay';
    overlay.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 31;
      background: rgba(0,0,0,0.92);
      border: 3px solid #fff;
      border-radius: 10px;
      padding: 14px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      min-width: 260px;
    `;

    const questionEl = document.createElement('div');
    questionEl.textContent = question;
    questionEl.style.cssText = 'color:#fff; font-size:16px; text-align:center;';

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex; gap:16px;';

    const yesBtn = document.createElement('button');
    yesBtn.textContent = 'Yes';
    yesBtn.style.cssText = `
      font-family: monospace; font-size: 15px;
      padding: 6px 24px;
      background: #ffd700; color: #000;
      border: 2px solid #ffd700; border-radius: 6px;
      cursor: pointer;
    `;

    const noBtn = document.createElement('button');
    noBtn.textContent = 'No';
    noBtn.style.cssText = `
      font-family: monospace; font-size: 15px;
      padding: 6px 24px;
      background: transparent; color: #fff;
      border: 2px solid #fff; border-radius: 6px;
      cursor: pointer;
    `;

    const cleanup = () => overlay.remove();

    yesBtn.addEventListener('click', () => { cleanup(); onYes(); });
    noBtn.addEventListener('click', () => { cleanup(); onNo(); });

    btnRow.appendChild(yesBtn);
    btnRow.appendChild(noBtn);
    overlay.appendChild(questionEl);
    overlay.appendChild(btnRow);
    document.body.appendChild(overlay);
  }

  // ---------------------------------------------------------------
  // _showReceiveAnimation(speciesId, displayName, slotIndex, onDone)
  //
  // Phase 1 — Pop-in (700ms):
  //   Full-screen dark overlay. Pokémon sprite pops in at center with a
  //   scale bounce (0 → 1.15 → 1.0) and the name banner fades up.
  //
  // Phase 2 — Fly to slot (600ms):
  //   The sprite shrinks and flies to the party slot position, then the
  //   whole overlay fades out. onDone() is called when complete.
  //
  // Party slot targets are estimated screen positions — they don't need
  // to be pixel-perfect since the party UI updates right after anyway.
  // ---------------------------------------------------------------
  _showReceiveAnimation(speciesId, displayName, slotIndex, onDone) {
    // Build candidate image paths (same fallback logic as showimage)
    const variations = [
      speciesId,
      speciesId.toUpperCase(),
      speciesId.toLowerCase(),
      speciesId.charAt(0).toUpperCase() + speciesId.slice(1).toLowerCase(),
    ];
    const uniqueVariations = [...new Set(variations)];

    // --- Overlay (full-screen, blocks input during animation) ---
    const overlay = document.createElement('div');
    overlay.id = 'pokemon-receive-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(10, 10, 30, 0.88);
      z-index: 100000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: all;
    `;

    // --- Sprite wrapper (handles translate for fly-to animation) ---
    const spriteWrap = document.createElement('div');
    spriteWrap.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1),
                  opacity  0.6s ease;
      will-change: transform, opacity;
    `;

    // --- Pokémon sprite ---
    const sprite = document.createElement('img');
    sprite.style.cssText = `
      width: 160px;
      height: 160px;
      object-fit: contain;
      image-rendering: pixelated;
      transform: scale(0);
      transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
      filter: drop-shadow(0 0 24px rgba(255,220,50,0.55));
    `;

    // --- Name banner ---
    const banner = document.createElement('div');
    banner.style.cssText = `
      font-family: monospace;
      font-size: 22px;
      font-weight: bold;
      color: #ffd700;
      letter-spacing: 2px;
      text-shadow: 0 0 12px rgba(255,210,0,0.7), 2px 2px 0 #000;
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.3s ease 0.25s, transform 0.3s ease 0.25s;
    `;
    banner.textContent = displayName.toUpperCase();

    // --- "obtained!" sub-label ---
    const subLabel = document.createElement('div');
    subLabel.style.cssText = `
      font-family: monospace;
      font-size: 13px;
      color: #ccc;
      letter-spacing: 1px;
      opacity: 0;
      transition: opacity 0.3s ease 0.4s;
    `;
    subLabel.textContent = `added to your party!`;

    spriteWrap.appendChild(sprite);
    spriteWrap.appendChild(banner);
    spriteWrap.appendChild(subLabel);
    overlay.appendChild(spriteWrap);
    document.body.appendChild(overlay);

    // --- Load sprite with fallback variations ---
    let varIdx = 0;
    const tryLoad = () => {
      if (varIdx >= uniqueVariations.length) {
        // No image found — skip straight to fade-out after a short pause
        console.warn(`[ScriptRunner] givepokemon: no sprite found for "${speciesId}"`);
        setTimeout(() => flyToSlot(), 800);
        return;
      }
      sprite.src = `/pokemon/Front/${uniqueVariations[varIdx]}.png`;
      varIdx++;
    };

    sprite.onload = () => {
      // Phase 1: pop-in bounce
      requestAnimationFrame(() => {
        sprite.style.transform = 'scale(1.15)';
        setTimeout(() => {
          sprite.style.transform = 'scale(1)';
        }, 200);
        banner.style.opacity = '1';
        banner.style.transform = 'translateY(0)';
        subLabel.style.opacity = '1';
      });
      // Phase 2: after 900ms, fly to slot
      setTimeout(() => flyToSlot(), 900);
    };

    sprite.onerror = () => tryLoad();
    tryLoad();

    // --- Phase 2: fly sprite to party slot position ---
    const flyToSlot = () => {
      // Estimate the party slot screen position.
      // Slots are typically rendered in the party panel on the right side.
      // slotIndex 0 = first slot (top), each slot ~64px apart.
      // These are best-effort estimates; adjust to match your UI layout.
      const slotEl = document.querySelector(
        `.party-slot[data-slot="${slotIndex}"], ` +
        `.party-slot:nth-child(${slotIndex + 1}), ` +
        `[data-party-slot="${slotIndex}"]`
      );

      let targetX = window.innerWidth * 0.82;   // fallback: right side of screen
      let targetY = 80 + slotIndex * 64;        // fallback: stacked from top

      if (slotEl) {
        const rect = slotEl.getBoundingClientRect();
        targetX = rect.left + rect.width / 2;
        targetY = rect.top + rect.height / 2;
      }

      // Calculate offset from current center of screen
      const originX = window.innerWidth / 2;
      const originY = window.innerHeight / 2;
      const dx = targetX - originX;
      const dy = targetY - originY;

      // Shrink and fly
      spriteWrap.style.transform = `translate(${dx}px, ${dy}px) scale(0.18)`;
      spriteWrap.style.opacity = '0.2';

      // Fade out overlay and call onDone
      setTimeout(() => {
        overlay.style.transition = 'opacity 0.25s ease';
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.remove();
          if (onDone) onDone();
        }, 260);
      }, 620);
    };
  }

  // ---------------------------------------------------------------
  // _showItemReceived(itemName, count, iconSrc, onDone)
  //
  // Shows a toast notification when an NPC gives the player an item.
  // Pauses script execution for ~1.8s then calls onDone() to continue.
  // ---------------------------------------------------------------
  _showItemReceived(itemName, count, iconSrc, onDone) {
    const existing = document.getElementById('item-received-notification');
    if (existing) existing.remove();

    const box = document.createElement('div');
    box.id = 'item-received-notification';
    box.style.cssText = `
      position: fixed;
      bottom: 180px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: #1a1a2e;
      border: 3px solid #ffd700;
      border-radius: 10px;
      padding: 14px 24px;
      z-index: 100001;
      display: flex;
      align-items: center;
      gap: 14px;
      font-family: monospace;
      box-shadow: 0 0 18px rgba(255,215,0,0.35);
      opacity: 0;
      transition: opacity 0.25s ease, transform 0.25s ease;
      pointer-events: none;
      min-width: 220px;
    `;

    if (iconSrc) {
      const img = document.createElement('img');
      img.src = iconSrc;
      img.style.cssText = `
        width: 48px; height: 48px;
        object-fit: contain;
        image-rendering: pixelated;
        display: block;
        filter: drop-shadow(0 0 6px rgba(255,215,0,0.5));
      `;
      img.onerror = () => { img.style.display = 'none'; };
      box.appendChild(img);
    }

    const textCol = document.createElement('div');

    const label = document.createElement('div');
    label.style.cssText = `font-size: 11px; color: #aaa; letter-spacing: 1px; text-transform: uppercase;`;
    label.textContent = 'Item received!';

    const nameEl = document.createElement('div');
    nameEl.style.cssText = `font-size: 17px; color: #ffd700; font-weight: bold; margin-top: 2px;`;
    nameEl.textContent = count > 1 ? `${itemName} ×${count}` : itemName;

    textCol.appendChild(label);
    textCol.appendChild(nameEl);
    box.appendChild(textCol);
    document.body.appendChild(box);

    // Animate in
    requestAnimationFrame(() => {
      box.style.opacity = '1';
      box.style.transform = 'translateX(-50%) translateY(0)';
    });

    // Auto-dismiss after 1.8s, then continue script
    setTimeout(() => {
      box.style.opacity = '0';
      box.style.transform = 'translateX(-50%) translateY(-10px)';
      setTimeout(() => {
        box.remove();
        if (onDone) onDone();
      }, 280);
    }, 1800);
  }
}
