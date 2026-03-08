import { DEFAULT_MAP, MAPS, DIR } from '@pokemon-mmo/shared';

export class PlayerState {
  constructor(id, name, dbId = null) {
    this.id = id;           // ephemeral session id (e.g. 'player_1')
    this.name = name;       // display name
    this.dbId = dbId;       // database players.id (null = unauthenticated)
    this.map = DEFAULT_MAP;
    this.x = MAPS[DEFAULT_MAP].spawnX;
    this.y = MAPS[DEFAULT_MAP].spawnY;
    this.dir = DIR.DOWN;
  }

  /** Create a PlayerState from a DB row. */
  static fromDB(sessionId, displayName, dbId, dbState) {
    const ps = new PlayerState(sessionId, displayName, dbId);
    if (dbState) {
      ps.map = dbState.map;
      ps.x = dbState.x;
      ps.y = dbState.y;
      ps.dir = dbState.dir;
    }
    return ps;
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
