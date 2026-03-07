# Audio Guide

## Overview
All audio is loaded via `fetch()` + Web Audio API to bypass IDM (Internet Download Manager) interception. Phaser's built-in audio loader is NOT used. URLs are served **without file extensions** so IDM doesn't recognize them as downloadable files.

## File Location
All audio files go in `assets/audio/`:
```
assets/audio/
  bgm/
    wild_battle.mp3        # Battle BGM
    victory.mp3            # Victory jingle
    Pixel Dawn Over Maple Town.mp3   # Overworld BGM (Pallet Town / Route 1)
  sfx/
    battle_start.mp3
    hit_normal.mp3
    hit_super.mp3
    hit_not_very.mp3
    faint.mp3
    catch_success.mp3
    exp_gain.mp3
    level_up.mp3
    HealTrainer.mp3    # NPC healer jingle
    potion.mp3         # Potion use sound
```

## How Audio Serving Works
The Vite dev server middleware (`client/vite.config.js`) intercepts `/audio/*` requests:
- Request: `/audio/bgm/wild_battle` (no extension)
- Server tries: `assets/audio/bgm/wild_battle.mp3`, then `.ogg`, then `.wav`
- Serves with correct `Content-Type` and `Content-Disposition: inline`
- Spaces in filenames are supported (URL-encoded with `%20`, server decodes them)

## Adding a New Sound Effect

1. **Drop the `.mp3` file** into `assets/audio/sfx/` (or `bgm/` for music)

2. **Battle SFX** — Add to `BattleScene.js` `_loadAudioInBackground()`:
   ```js
   { key: 'sfx_my_sound', path: '/audio/sfx/my_sound' },
   ```
   Then play it anywhere in BattleUI via:
   ```js
   if (this.sfx) this.sfx('sfx_my_sound');
   ```

3. **Battle BGM** — Same array, use `bgm_` prefix:
   ```js
   { key: 'bgm_my_track', path: '/audio/bgm/my_track' },
   ```

## Adding Overworld BGM Per Map

1. **Drop the `.mp3`** into `assets/audio/bgm/`

2. **Set the `bgm` field** in `shared/src/maps.js`:
   ```js
   pallet_town: {
     key: 'pallet_town',
     name: 'Pallet Town',
     bgm: 'Pixel Dawn Over Maple Town',  // filename without .mp3
     // ...
   },
   oaks_lab: {
     key: 'oaks_lab',
     name: "Prof. Oak's Lab",
     bgm: null,  // no music indoors
     // ...
   },
   ```

3. That's it. `OverworldScene._playMapBgm()` handles:
   - Loading via fetch on first visit
   - Caching the decoded AudioBuffer for instant replay
   - Switching tracks when entering a map with a different `bgm`
   - Stopping when `bgm: null` (silence for indoors)
   - Auto-stopping on battle entry, auto-resuming on battle exit

## Adding Overworld / NPC Sound Effects

1. **Drop the `.mp3`** into `assets/audio/sfx/`

2. **In any NPC script**, use the `sound:` command (filename without `.mp3`):
   ```
   say: Let me heal your Pokemon!
   sound: HealTrainer
   healparty
   ```

3. `OverworldScene.playSfx(name)` handles loading + caching + playing via Web Audio.

4. **Available SFX files:**
   ```
   assets/audio/sfx/
     HealTrainer.mp3      # Nurse/healer jingle
     potion.mp3           # Potion use sound
     catch_success.mp3    # Pokeball catch (used in battle)
   ```

5. You can also call it from code: `this.scene.playSfx('HealTrainer')`

## NPC Script `sound:` Command
- Syntax: `sound: filename` (no `.mp3` extension)
- File must exist in `assets/audio/sfx/`
- First call fetches + decodes the file; subsequent calls play from cache instantly
- Non-blocking — script continues immediately while sound plays
- See full script command reference in `client/src/systems/ScriptRunner.js` header

## How Overworld BGM Works (Technical)
- Uses **raw Web Audio API** (`AudioBufferSource` + `GainNode`), NOT Phaser's sound manager
- Phaser's sound system doesn't reliably pause/stop when scenes are paused
- `stopOverworldBgm()` — kills the source node, saves playback position (called by EncounterManager before battle)
- `resumeOverworldBgm()` — creates a fresh source from cached buffer, resumes from saved position (called by BattleScene on exit)
- Decoded buffers cached in `this._owAudioCache` so re-entering a map doesn't re-fetch
- BGM resumes from where it left off after battle (not from the start)

## Key Rules
- **Never use `.mp3` in fetch URLs** — IDM will intercept them. Omit the extension.
- **Filenames with spaces are fine** — the middleware decodes `%20` automatically
- **Battle audio uses Phaser's cache** (`this.cache.audio`) + `this.sound.add()`
- **Overworld audio uses raw Web Audio** (`AudioBufferSource`) for reliable pause/resume
