import { DEFAULT_MAP, MAPS, DIR } from '@pokemon-mmo/shared';

export class PlayerState {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.map = DEFAULT_MAP;
    this.x = MAPS[DEFAULT_MAP].spawnX;
    this.y = MAPS[DEFAULT_MAP].spawnY;
    this.dir = DIR.DOWN;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      map: this.map,
      x: this.x,
      y: this.y,
      dir: this.dir,
    };
  }
}
