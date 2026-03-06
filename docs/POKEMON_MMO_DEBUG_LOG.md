# Pokemon MMO — NPC Quest System Debug Log

A full record of every bug found, diagnosed, and fixed in the NPC quest scripting system. Useful for future debugging sessions.

---

## The Golden Rule

**When the game hangs, always check these three things first in the browser console:**

```javascript
const ow = window.overworldScene;
console.log('cutsceneActive:', ow.cutsceneActive);
console.log('dialogBox._open:', ow.dialogBox._open);
console.log('dialogBox._keyHandler:', !!ow.dialogBox._keyHandler);
console.log('dialogBox.onClose:', !!ow.dialogBox.onClose);
console.log('flags:', ow.flags.flags);
```

To unfreeze manually while debugging: `window.overworldScene.cutsceneActive = false;`

---

## Bug Index

| # | File | Symptom | Root Cause |
|---|------|---------|------------|
| 1 | `DialogBox.js` | Game hangs after any chained dialog (giveitem, say-after-say) | `close()` called `this.onClose = null` AFTER `this.onClose()`, wiping callbacks set by re-entrant `open()` |
| 2 | `OverworldScene.js` | NPC re-triggers immediately after script ends | `JustDown(interactKey)` still true on the frame after dialog closes |
| 3 | `OverworldScene.js` | Second ScriptRunner spawns mid-script causing dialog hijack | `updateNpcVisibility()` called `triggerAutoTalk()` synchronously while a script was running |
| 4 | `OverworldScene.js` | Scene locks if `movenpc:` is used inside a script | `startNpcWalk()` unconditionally set `cutsceneActive = false` in its callback, releasing input mid-script |
| 5 | `OverworldScene.js` | walkOnFlag NPC starts mid-script, permanently locking scene | `checkFlagTriggeredWalks()` called synchronously inside `applyFlagChanges()` while `onComplete` was still on the call stack |
| 6 | `ScriptRunner.js` | Inventory update causes stutter when dialog closes | `_notifyInventoryChange()` dispatched before dialog opened, triggering 42 DOM writes mid-dialog |
| 7 | `old_man.json` + `cici.json` | Player could receive pokeballs without Cici actually following | `quest1_found_cici` flag meant both "agreed to escort" and "currently following" — map transitions clear `startfollow` but not the flag |
| 8 | `old_man.json` | `choice: No` didn't loop back correctly | `setflag: quest1_refused_oldman` was placed after `choice:` instead of before |

---

## Bug 1 — DialogBox Re-entrant close() wipes onClose (THE MAIN HANG)

**File:** `DialogBox.js`

**Symptom:** Game hangs after receiving items, after any dialog that leads to another dialog. `cutsceneActive` stays `true` forever. The second dialog shows on screen but Space does nothing (no visual feedback, just frozen).

**Diagnosed by:**
```javascript
// This trace showed onClose never fired for the second dialog:
ow.dialogBox.open = function(name, lines, cb) {
  origOpen(name, lines, cb ? () => {
    console.log('onClose fired for:', lines);
    cb();
  } : null);
};
```

**Root Cause:**
```js
// BROKEN — close() nulls onClose AFTER calling it
close() {
  if (this.onClose) {
    this.onClose();       // ← this calls next() → giveitem → open() → sets this.onClose = newCallback
    this.onClose = null;  // ← WIPES the new callback that open() just registered
  }
}
```

Any script command that opens a new dialog from inside an `onClose` callback (`giveitem`, chained dialogs via `say:`, etc.) had its callback silently nulled. The second dialog would open, the player pressed Space, `close()` ran, `this.onClose` was null, `next()` never called, `onComplete()` never called, `cutsceneActive` stuck `true`.

**Fix:**
```js
// FIXED — null onClose BEFORE calling it so re-entrant open() is safe
close() {
  if (this.onClose) {
    const cb = this.onClose;
    this.onClose = null;  // clear first
    cb();                 // now open() can set this.onClose without being wiped
  }
}
```

---

## Bug 2 — Space keypress re-triggers NPC after script ends

**File:** `OverworldScene.js`

**Symptom:** After a script completes, the same NPC immediately starts talking again. Looks like a hang because the `quest1_complete` dialog fires instantly.

**Root Cause:** `DialogBox` uses `window.addEventListener('keydown')`. Phaser tracks the same Space key independently via `this.interactKey`. When Space closes the last dialog line, the entire script completes synchronously inside that `keydown` event. On the next `update()` frame, `dialogBox.isOpen()` is false, `cutsceneActive` is false, and `JustDown(interactKey)` is still true — Phaser recorded the keypress but nothing consumed it through Phaser's system. The NPC interact block fires again.

**Fix:** Added `_interactCooldown` — while dialog is open, if Space is held, set a cooldown of 3 frames. After dialog closes, block interact until cooldown expires.

```js
// In update():
if (this.dialogBox.isOpen()) {
  if (this.interactKey.isDown) this._interactCooldown = 3;
  return;
}
if (this._interactCooldown > 0) {
  this._interactCooldown--;
  return;
}
```

Also: `interactKey.reset()` is called in every script completion callback, but this alone is insufficient because `reset()` runs mid-frame after Phaser has already evaluated `JustDown` for that frame.

---

## Bug 3 — Second ScriptRunner spawns mid-script (autoTalk race)

**File:** `OverworldScene.js`

**Symptom:** Game hangs mid-script. Dialog box gets hijacked by a different NPC's dialog. Pressing Space advances the wrong dialog, leaving the original script's `next()` uncalled.

**Root Cause:** `setflag`/`clearflag` in ScriptRunner call `updateNpcVisibility()` synchronously. `updateNpcVisibility()` checked for `_justAppeared` NPCs and immediately called `triggerAutoTalk()`. If an NPC with `autoTalk: true` became visible during a running script, a **second ScriptRunner** was created while the first was still executing. Both shared the same `dialogBox`. The second runner's dialog consumed the next Space keypress, the first runner's `next()` never fired.

**Fix:** Defer the autoTalk check to the next tick:

```js
updateNpcVisibility() {
  for (const npc of this.npcs) npc.updateVisibility(this.flags);
  setTimeout(() => {
    for (const npc of this.npcs) {
      if (npc._justAppeared) {
        npc._justAppeared = false;
        this.triggerAutoTalk(npc);
        break;
      }
    }
  }, 0);
}
```

Also guard `triggerAutoTalk` itself:
```js
triggerAutoTalk(npc) {
  if (this.cutsceneActive) return;  // never spawn second runner
  if (this.transitioning) {
    const poll = setInterval(() => {
      if (!this.transitioning && !this.cutsceneActive) {
        clearInterval(poll);
        this.triggerAutoTalk(npc);
      }
    }, 50);
    return;
  }
  // ... rest of function
}
```

---

## Bug 4 — startNpcWalk releases cutsceneActive mid-script

**File:** `OverworldScene.js`

**Symptom:** Player input unlocks in the middle of a cutscene when `movenpc:` is used. Player can move or interact during NPC walk animations.

**Root Cause:** `startNpcWalk()` unconditionally set `cutsceneActive = true` at start and `cutsceneActive = false` in its callback. When called from inside ScriptRunner via `movenpc:`, `cutsceneActive` was already `true` (owned by the script). The walk callback fired `cutsceneActive = false` before the script's `onComplete`, releasing input mid-script.

**Fix:** Only take ownership of `cutsceneActive` if not already inside a running script:

```js
startNpcWalk(npc, targetX, targetY, onComplete) {
  const ownsCutscene = !this.cutsceneActive;
  if (ownsCutscene) this.cutsceneActive = true;
  npc.walkToTile(targetX, targetY, () => {
    if (ownsCutscene) this.cutsceneActive = false;
    this.updateNpcVisibility();
    if (onComplete) onComplete();
  });
}
```

---

## Bug 5 — checkFlagTriggeredWalks fires synchronously mid-script

**File:** `OverworldScene.js` / `ScriptRunner.js`

**Symptom:** After `setflag:`, an NPC with `walkOnFlag` starts walking immediately. If the walk callback tried to modify `cutsceneActive`, the scene could lock permanently.

**Root Cause:** `applyFlagChanges()` called `checkFlagTriggeredWalks()` synchronously. `setflag` in ScriptRunner also called it synchronously. Both ran while `onComplete` was still on the call stack.

**Fix:** Defer to next tick in both places:

```js
// In applyFlagChanges():
setTimeout(() => this.checkFlagTriggeredWalks(), 0);

// In ScriptRunner setflag handler:
setTimeout(() => this.scene.checkFlagTriggeredWalks(), 0);
```

---

## Bug 6 — Inventory sync causes stutter on dialog close

**File:** `ScriptRunner.js`

**Symptom:** Visible lag/stutter when the "Received Item!" dialog closes.

**Root Cause:** `_notifyInventoryChange()` was dispatched before `dialogBox.open()`. This triggered `InventoryManager.syncToUI()` which made 42 synchronous DOM writes (30 bag slots + 12 hotbar slots) while the dialog was still open. When Space closed the dialog and the game loop resumed, the DOM reflow raced with the game loop.

**Fix:** Dispatch `_notifyInventoryChange()` inside the dialog's `onClose` callback, after the player has dismissed it:

```js
case 'giveitem': {
  // ... write to inventory ...
  this.scene.dialogBox.open(npcName, [`Received ${label}!`], () => {
    this._notifyInventoryChange();  // ← deferred until after dialog closes
    next();
  });
}
```

---

## Bug 7 — Quest flag design: Cici reward triggers without escort

**Files:** `old_man.json`, `cici_route1.json`, `cici_pallet_town.json`

**Symptom:** Player could talk to old_man and receive pokeballs even though Cici wasn't following. Could happen by: accepting Cici's escort on Route 1, then walking back to Pallet Town alone.

**Root Cause:** `quest1_found_cici` was used as both "Cici agreed to follow" (permanent) and "Cici is currently following" (runtime). `startfollow` is cleared on every map transition, but the flag persisted. Old_man checked only `quest1_found_cici`, not whether she was physically present.

**Fix:** Added a new flag `quest1_cici_arrived` that is only set when pallet_town Cici's `autoTalk` script actually runs — meaning she physically appeared on the map with the player:

```
Quest flag flow:
1. quest1_find_daughter     — player agreed to find Cici
2. quest1_found_cici        — Cici agreed to escort (Route 1)
3. quest1_cici_arrived      — Cici's autoTalk fired on Pallet Town (she's actually here)
4. quest1_complete          — reward given, all cici flags cleared
```

Old_man's reward dialog now checks `quest1_cici_arrived` instead of `quest1_found_cici`.

---

## Bug 8 — choice: No doesn't loop correctly

**File:** `old_man.json`

**Symptom:** Saying No to the old_man's quest didn't properly set the "refused" state, so the next conversation didn't offer a second chance correctly.

**Root Cause:** `setflag: quest1_refused_oldman` was placed after `choice:` in the script, meaning it only ran if the player said Yes (the script continued). It should be set before `choice:` so that if the player says No, the flag is already present for the next conversation.

**Fix:** Move `setflag` before `choice:` in both the default and refused dialog scripts.

---

## Debugging Toolkit

### Check game state while hung
```javascript
const ow = window.overworldScene;
console.log('cutsceneActive:', ow.cutsceneActive);
console.log('dialogBox._open:', ow.dialogBox._open);
console.log('dialogBox.onClose:', !!ow.dialogBox.onClose);
console.log('dialogBox._keyHandler:', !!ow.dialogBox._keyHandler);
console.log('dialogBox.lines:', ow.dialogBox.lines);
console.log('dialogBox.lineIndex:', ow.dialogBox.lineIndex);
console.log('flags:', ow.flags.flags);
ow.npcs.forEach(n => console.log(n.id, n.showFlag, n.hideFlag, n._visible));
```

### Unfreeze manually
```javascript
window.overworldScene.cutsceneActive = false;
```

### Trace every dialog open/close
```javascript
const ow = window.overworldScene;
const orig = ow.dialogBox.open.bind(ow.dialogBox);
ow.dialogBox.open = function(name, lines, cb) {
  console.log('📬 open:', name, lines);
  orig(name, lines, cb ? () => { console.log('📭 onClose:', lines); cb(); } : null);
};
```

### Trace cutsceneActive changes
```javascript
const ow = window.overworldScene;
let _v = ow.cutsceneActive;
Object.defineProperty(ow, 'cutsceneActive', {
  get() { return _v; },
  set(v) { console.trace('cutsceneActive =', v); _v = v; }
});
```

### Trace flag changes
```javascript
const ow = window.overworldScene;
['setFlag','clearFlag'].forEach(method => {
  const orig = ow.flags[method].bind(ow.flags);
  ow.flags[method] = function(name) {
    console.log(`${method}("${name}")`);
    orig(name);
  };
});
```

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `DialogBox.js` | `close()`: null `onClose` before calling it (Bug 1) |
| `OverworldScene.js` | `startNpcWalk()`: conditional `cutsceneActive` ownership (Bug 4) |
| `OverworldScene.js` | `applyFlagChanges()`: defer `checkFlagTriggeredWalks` (Bug 5) |
| `OverworldScene.js` | `updateNpcVisibility()`: defer `triggerAutoTalk` via setTimeout (Bug 3) |
| `OverworldScene.js` | `triggerAutoTalk()`: guard `cutsceneActive`, poll `transitioning` (Bug 3) |
| `OverworldScene.js` | `update()`: `_interactCooldown` to block Space re-trigger (Bug 2) |
| `OverworldScene.js` | `setupActionButton()`: reset `touchAction` on button release |
| `ScriptRunner.js` | `giveitem`: defer `_notifyInventoryChange` to after dialog close (Bug 6) |
| `ScriptRunner.js` | `setflag`: defer `checkFlagTriggeredWalks` (Bug 5) |
| `old_man.json` | Reward checks `quest1_cici_arrived` not `quest1_found_cici` (Bug 7) |
| `old_man.json` | `setflag` moved before `choice:` in both dialog variants (Bug 8) |
| `cici_pallet_town.json` | Sets `quest1_cici_arrived` flag in autoTalk script (Bug 7) |
