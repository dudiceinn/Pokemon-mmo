# Animated Sprites Guide

## Overview

Battle sprites use **Gen 5 (Black/White) animated GIFs** sourced from the [PokeAPI sprites repository](https://github.com/PokeAPI/sprites). These replace the previous static PNG sprites from pokefirered.

## File Locations

```
assets/pokemon-animated/
  front/    ← enemy sprites (151 GIFs)
  back/     ← player sprites (151 GIFs)
```

Files are named by lowercase species ID: `bulbasaur.gif`, `pikachu.gif`, etc.

## How It Works

`client/src/scenes/BattleUI.js` has two functions that resolve sprite paths:

```js
function frontSprite(speciesId) {
  return `/pokemon-animated/front/${speciesId.toLowerCase()}.gif`;
}
function backSprite(speciesId) {
  return `/pokemon-animated/back/${speciesId.toLowerCase()}.gif`;
}
```

Since `assets/` is Vite's public directory, sprites are served directly at `/pokemon-animated/front/bulbasaur.gif`.

## Download Script

To re-download or update sprites:

```bash
node assets/tools/download-animated-sprites.js
```

This fetches from:
```
https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/{dex_number}.gif
https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/back/{dex_number}.gif
```

- Downloads all 151 Gen 1 Pokemon (front + back)
- Skips files that already exist
- Names files by species ID (e.g., `1.gif` → `bulbasaur.gif`)

## Naming Mismatches

The game uses underscores, PokeAPI uses hyphens. These are manually copied:

| Game ID       | PokeAPI ID    |
|---------------|---------------|
| `nidoran_f`   | `nidoran-f`   |
| `nidoran_m`   | `nidoran-m`   |
| `mr_mime`     | `mr-mime`     |

The download script saves the hyphenated versions. Underscore copies are made manually after download.

## Adding More Pokemon (Gen 2+)

1. Add species to `assets/data/pokemon.json`
2. Update `NAMES` array in `download-animated-sprites.js` with new entries (dex 152+)
3. Change the loop bound from `151` to the new max
4. Run the script again — it skips existing files
5. Check for any naming mismatches between your game IDs and PokeAPI IDs

## Old Sprites (Still Available)

The original static PNG sprites remain at:

```
assets/pokemon/Front/   ← UPPERCASE.png (e.g., PIKACHU.png)
assets/pokemon/Back/    ← UPPERCASE.png
```

To revert, change the `frontSprite`/`backSprite` functions back to:

```js
function frontSprite(speciesId) {
  return `/pokemon/Front/${speciesId.toUpperCase()}.png`;
}
function backSprite(speciesId) {
  return `/pokemon/Back/${speciesId.toUpperCase()}.png`;
}
```
