import Phaser from 'phaser';
import { MAPS } from '@pokemon-mmo/shared';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Loading progress bar
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 60, height / 2 - 5, 120, 10);

    this.load.on('progress', (value) => {
      progressBar.clear();
      progressBar.fillStyle(0xffffff, 1);
      progressBar.fillRect(width / 2 - 58, height / 2 - 3, 116 * value, 6);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
    });
	
	this.load.json('itemDefs', '/data/items.json');
	this.load.json('pokemonDefs', '/data/pokemon.json');
	this.load.json('moveDefs', '/data/moves.json');
    // Load all map tilesets and tilemaps
    for (const key of Object.keys(MAPS)) {
      this.load.image(`${key}_tileset`, `/tilesets/${key}_tileset.png`);
      this.load.tilemapTiledJSON(key, `/maps/${key}.json`);
      // Also load raw JSON to preserve custom fields like _warps
      this.load.json(`${key}_raw`, `/maps/${key}.json`);
      // Load NPC data from separate file
      this.load.json(`${key}_npcs`, `/npcs/${key}.json`);
    }

    // Sprites
    this.load.spritesheet('player', '/sprites/player.png', {
      frameWidth: 32,
      frameHeight: 48,
    });
    this.load.spritesheet('player_green', '/sprites/player_green.png', {
      frameWidth: 32,
      frameHeight: 48,
    });

    // Load the NPC sprites list JSON file FIRST
    this.load.json('npcSprites', '/data/npc-sprites.json');

    // Load spawn files so we know which pokemon sprites to preload
    for (const key of Object.keys(MAPS)) {
      this.load.json(`${key}_spawns`, `/spawns/${key}.json`);
    }
  }

  create() {
    // Get the NPC sprites list from the loaded JSON
    const npcSpritesData = this.cache.json.get('npcSprites');
    
    if (!npcSpritesData || !npcSpritesData.sprites) {
      console.error('❌ Failed to load npc-sprites.json');
      console.log('Available cache keys:', this.cache.json.getKeys());
      
      // Fallback to hardcoded list if JSON fails
      const fallbackSprites = [
        'NPC 00', 'NPC 01', 'NPC 02', 'NPC 03', 'NPC 04', 'NPC 05',
        'NPC 06', 'NPC 07', 'NPC 08', 'NPC 09', 'NPC 10',
        'NPC 11', 'NPC 12', 'NPC 13', 'NPC 14', 'NPC 15',
        'NPC 16', 'NPC 17', 'NPC 18', 'NPC 19', 'NPC 20',
        'NPC 21', 'NPC 22', 'NPC 23', 'NPC 24', 'NPC 25',
        'NPC 26', 'NPC 27', 'NPC 28', 'NPC 29', 'POKEBALL',
      ];
      
      console.log('Using fallback sprite list');
      this.loadNPCSprites(fallbackSprites);
      return;
    }

    const NPC_SPRITES = npcSpritesData.sprites;
    console.log('📋 Loaded NPC sprite list:', NPC_SPRITES);
    
    this.loadNPCSprites(NPC_SPRITES);
	
  }
  
  loadNPCSprites(spriteList) {
    // Load all the NPC spritesheets
   for (const key of spriteList) {
  if (key === 'POKEBALL') {
    this.load.spritesheet(key, `/sprites/${key}.png`, {
      frameWidth: 32,
      frameHeight: 32, // 128x128 ÷ 4 = 32x32 frames
    });
  } else {
    this.load.spritesheet(key, `/sprites/${key}.png`, {
      frameWidth: 32,
      frameHeight: 48,
    });
  }
}

    // Preload pokemon follower sprites referenced in spawn files
    // Use a file-error handler so a missing sprite doesn't crash the load
    this.load.on('fileerror', (file) => {
      console.warn(`[BootScene] Could not load: ${file.src} — skipping`);
    });

    const seenPoke = new Set();
    for (const key of Object.keys(MAPS)) {
      const spawns = this.cache.json.get(`${key}_spawns`);
      if (!Array.isArray(spawns)) continue;
      for (const tile of spawns) {
        for (const p of (tile.pokemon || [])) {
          if (!p.speciesId || seenPoke.has(p.speciesId)) continue;
          seenPoke.add(p.speciesId);
          const spriteKey = `poke_${p.speciesId.toLowerCase()}`;  // always lowercase key
          if (!this.textures.exists(spriteKey)) {
            // Load as plain image — WildPokemon._createSprite will slice into frames
            // based on actual sheet dimensions (avoids hardcoding frame size)
            this.load.image(spriteKey, `/pokemon/followers/${p.speciesId.toUpperCase()}.png`);
          }
        }
      }
    }
    if (seenPoke.size > 0) {
      console.log(`[BootScene] Preloading ${seenPoke.size} pokemon sprite(s):`, [...seenPoke]);
    }

    // Start loading the sprites
    this.load.start();

    // When all sprites are loaded, start the game
    this.load.once('complete', () => {
      console.log('✅ All NPC sprites loaded successfully');
      
      // Verify a few sprites are loaded
      const testSprites = spriteList.slice(0, 3);
      testSprites.forEach(key => {
        if (this.textures.exists(key)) {
          console.log(`✅ ${key} loaded`);
        } else {
          console.warn(`⚠️ ${key} not found`);
        }
      });
      
      this.scene.start('OverworldScene');
    });
  }
}