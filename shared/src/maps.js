// Map registry — connections, warps, spawn points
// Sourced from pokefirered data/maps/*/map.json

export const MAPS = {
  pallet_town: {
    key: 'pallet_town',
    name: 'Pallet Town',
    width: 24,
    height: 20,
    connections: [
      { direction: 'up', map: 'route1', offset: 0 },
    ],
    warps: [
      { x: 6, y: 7, destMap: 'players_house_1f', destWarp: 1 },
      { x: 15, y: 7, destMap: 'rivals_house', destWarp: 0 },
      { x: 16, y: 13, destMap: 'oaks_lab', destWarp: 0 },
    ],
    spawnX: 7,
    spawnY: 9,
  },
  route1: {
    key: 'route1',
    name: 'Route 1',
    width: 24,
    height: 40,
    connections: [
      { direction: 'down', map: 'pallet_town', offset: 0 },
    ],
    warps: [],
    spawnX: 12,
    spawnY: 38,
  },
  players_house_1f: {
    key: 'players_house_1f',
    name: "Player's House 1F",
    width: 13,
    height: 10,
    connections: [],
    warps: [
      { x: 5, y: 8, destMap: 'pallet_town', destX: 6, destY: 8 },
      { x: 4, y: 8, destMap: 'pallet_town', destX: 6, destY: 8 },
      { x: 10, y: 2, destMap: 'players_house_2f', destX: 10, destY: 2 },
      { x: 3, y: 9, destMap: 'pallet_town', destX: 6, destY: 8 },
    ],
    spawnX: 4,
    spawnY: 7,
  },
  players_house_2f: {
    key: 'players_house_2f',
    name: "Player's House 2F",
    width: 12,
    height: 9,
    connections: [],
    warps: [
      { x: 10, y: 2, destMap: 'players_house_1f', destX: 10, destY: 3 },
    ],
    spawnX: 10,
    spawnY: 2,
  },
  rivals_house: {
    key: 'rivals_house',
    name: "Rival's House",
    width: 13,
    height: 10,
    connections: [],
    warps: [
      { x: 4, y: 8, destMap: 'pallet_town', destX: 15, destY: 8 },
      { x: 5, y: 8, destMap: 'pallet_town', destX: 15, destY: 8 },
      { x: 3, y: 9, destMap: 'pallet_town', destX: 15, destY: 8 },
    ],
    spawnX: 4,
    spawnY: 7,
  },
  oaks_lab: {
    key: 'oaks_lab',
    name: "Prof. Oak's Lab",
    width: 13,
    height: 14,
    connections: [],
    warps: [
      { x: 7, y: 13, destMap: 'pallet_town', destX: 16, destY: 14 },
      { x: 6, y: 13, destMap: 'pallet_town', destX: 16, destY: 14 },
    ],
    spawnX: 6,
    spawnY: 12,
  },
};

export const DEFAULT_MAP = 'pallet_town';

/**
 * Resolve where a player ends up when stepping off a map edge.
 * Returns { map, x, y } or null if no connection exists.
 */
export function resolveConnection(currentMapKey, x, y) {
  const map = MAPS[currentMapKey];
  if (!map) return null;

  for (const conn of map.connections) {
    if (conn.direction === 'up' && y < 0) {
      const destMap = MAPS[conn.map];
      return { map: conn.map, x: x + conn.offset, y: destMap.height - 1 };
    }
    if (conn.direction === 'down' && y >= map.height) {
      const destMap = MAPS[conn.map];
      return { map: conn.map, x: x + conn.offset, y: 0 };
    }
    if (conn.direction === 'left' && x < 0) {
      const destMap = MAPS[conn.map];
      return { map: conn.map, x: destMap.width - 1, y: y + conn.offset };
    }
    if (conn.direction === 'right' && x >= map.width) {
      const destMap = MAPS[conn.map];
      return { map: conn.map, x: 0, y: y + conn.offset };
    }
  }

  return null;
}

/**
 * Check if a tile has a warp. Returns warp destination or null.
 */
export function resolveWarp(currentMapKey, x, y) {
  const map = MAPS[currentMapKey];
  if (!map) return null;

  for (const warp of map.warps) {
    if (warp.x === x && warp.y === y) {
      const destMap = MAPS[warp.destMap];
      if (!destMap) return null;

      // If warp specifies destX/destY, use those
      if (warp.destX !== undefined) {
        return { map: warp.destMap, x: warp.destX, y: warp.destY };
      }
      // Otherwise resolve by destWarp index
      if (warp.destWarp !== undefined && destMap.warps[warp.destWarp]) {
        const dw = destMap.warps[warp.destWarp];
        return { map: warp.destMap, x: dw.x, y: dw.y };
      }
      // Fallback to spawn
      return { map: warp.destMap, x: destMap.spawnX, y: destMap.spawnY };
    }
  }

  return null;
}
