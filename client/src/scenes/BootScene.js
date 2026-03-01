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
      frameWidth: 16, frameHeight: 32,
    });
    this.load.spritesheet('player_green', '/sprites/player_green.png', {
      frameWidth: 16, frameHeight: 32,
    });

    // NPC sprites — add new NPC sprite PNGs to assets/sprites/ and list them here
    const NPC_SPRITES = [
      'npc_agatha', 'npc_balding_man', 'npc_battle_girl', 'npc_beauty', 'npc_biker',
      'npc_bill', 'npc_blackbelt', 'npc_blaine', 'npc_blue', 'npc_boy',
      'npc_brock', 'npc_bruno', 'npc_bug_catcher', 'npc_cable_club_receptionist',
      'npc_cameraman', 'npc_camper', 'npc_captain', 'npc_celio', 'npc_channeler',
      'npc_chef', 'npc_clerk', 'npc_cooltrainer_f', 'npc_cooltrainer_m', 'npc_daisy',
      'npc_erika', 'npc_fat_man', 'npc_fisher', 'npc_gba_kid', 'npc_gentleman',
      'npc_giovanni', 'npc_gym_guy', 'npc_hiker', 'npc_koga', 'npc_lance',
      'npc_lass', 'npc_little_boy', 'npc_little_girl', 'npc_lorelei', 'npc_lt_surge',
      'npc_man', 'npc_mg_deliveryman', 'npc_misty', 'npc_mom', 'npc_mr_fuji',
      'npc_nurse', 'npc_oak', 'npc_old_man_1', 'npc_old_man_2', 'npc_old_man_lying_down',
      'npc_old_woman', 'npc_picnicker', 'npc_policeman', 'npc_rich_boy', 'npc_rocker',
      'npc_rocket_f', 'npc_rocket_m', 'npc_rs_brendan', 'npc_rs_may', 'npc_sabrina',
      'npc_sailor', 'npc_scientist', 'npc_sitting_boy', 'npc_super_nerd',
      'npc_swimmer_f_land', 'npc_swimmer_f_water', 'npc_swimmer_m_land', 'npc_swimmer_m_water',
      'npc_teachy_tv_host', 'npc_trainer_tower_dude', 'npc_tuber_f', 'npc_tuber_m_land',
      'npc_tuber_m_water', 'npc_union_room_receptionist', 'npc_unused_male_receptionist',
      'npc_unused_man', 'npc_unused_woman', 'npc_woman', 'npc_woman_1', 'npc_woman_2',
      'npc_woman_3', 'npc_worker_f', 'npc_worker_m', 'npc_youngster',
    ];
    for (const key of NPC_SPRITES) {
      this.load.spritesheet(key, `/sprites/${key}.png`, {
        frameWidth: 16, frameHeight: 32,
      });
    }
  }

  create() {
    this.scene.start('OverworldScene');
  }
}
