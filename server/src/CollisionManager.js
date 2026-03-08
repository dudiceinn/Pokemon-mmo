/**
 * CollisionManager.js (Server)
 *
 * Loads collision data from map JSON files and validates movement.
 * Used by GameServer to reject illegal moves (wall walking, teleporting, speed hacking).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DIR, DIR_VECTOR } from '@pokemon-mmo/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.resolve(__dirname, '../../assets');

export class CollisionManager {
  constructor() {
    // mapKey → { width, height, collision: number[] }
    this._cache = new Map();
  }

  /**
   * Validate a movement from (fromX, fromY) to (toX, toY) with direction.
   * Returns { valid: true } or { valid: false, reason: string }.
   */
  validateMove(mapKey, fromX, fromY, toX, toY, dir) {
    const mapData = this._getMap(mapKey);
    if (!mapData) {
      // No collision data loaded — allow (map might not exist yet)
      return { valid: true };
    }

    const { width, height } = mapData;

    // Check distance — must be exactly 1 tile (or 2 for ledge hop down)
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.abs(dx) + Math.abs(dy);

    if (dist === 0) {
      // Same tile — just a direction change, always valid
      return { valid: true };
    }

    // Ledge hop: 2 tiles down
    if (dist === 2 && dx === 0 && dy === 2 && dir === DIR.DOWN) {
      // Verify the first tile is a ledge (collision value 3)
      const midCV = this._getCollision(mapData, fromX, fromY + 1);
      if (midCV === 3) {
        // Check landing tile is in bounds and passable
        if (toY >= height) return { valid: false, reason: 'out_of_bounds' };
        const landCV = this._getCollision(mapData, toX, toY);
        if (landCV === 1) return { valid: false, reason: 'blocked' };
        return { valid: true };
      }
      return { valid: false, reason: 'invalid_distance' };
    }

    if (dist !== 1) {
      return { valid: false, reason: 'invalid_distance' };
    }

    // Verify direction matches displacement
    const expectedVec = DIR_VECTOR[dir];
    if (!expectedVec || dx !== expectedVec.x || dy !== expectedVec.y) {
      // Direction mismatch — could be lag, allow it but log
      // Don't reject for this since the client may send dir updates separately
    }

    // Check target is in bounds
    // Allow moving OUT of bounds (map edge transitions are handled separately)
    if (toX < 0 || toY < 0 || toX >= width || toY >= height) {
      // Edge transition — let it through, handleMapChange will follow
      return { valid: true };
    }

    // Check collision at target tile
    const cv = this._getCollision(mapData, toX, toY);

    if (cv === 1) {
      return { valid: false, reason: 'blocked' };
    }

    if (cv === 2 && dir === DIR.DOWN) {
      // Top-block: can't walk down into this tile
      return { valid: false, reason: 'blocked' };
    }

    if (cv === 3 && dir !== DIR.DOWN) {
      // Ledge: only passable going down
      return { valid: false, reason: 'blocked' };
    }

    return { valid: true };
  }

  /**
   * Check if a position is valid to be on (for map change validation).
   */
  isValidPosition(mapKey, x, y) {
    const mapData = this._getMap(mapKey);
    if (!mapData) return true; // no data = allow

    const { width, height } = mapData;
    if (x < 0 || y < 0 || x >= width || y >= height) return false;

    const cv = this._getCollision(mapData, x, y);
    return cv !== 1; // blocked tiles are invalid positions
  }

  /**
   * Invalidate cache for a map (e.g., after map editor saves).
   */
  invalidateMap(mapKey) {
    this._cache.delete(mapKey);
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  _getMap(mapKey) {
    if (this._cache.has(mapKey)) return this._cache.get(mapKey);

    const mapPath = path.join(ASSETS_DIR, 'maps', `${mapKey}.json`);
    try {
      if (!fs.existsSync(mapPath)) {
        this._cache.set(mapKey, null);
        return null;
      }

      const raw = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
      const collisionLayer = raw.layers?.find(l => l.name === 'collision');

      if (!collisionLayer?.data) {
        this._cache.set(mapKey, null);
        return null;
      }

      const mapData = {
        width: raw.width,
        height: raw.height,
        collision: collisionLayer.data,
      };

      this._cache.set(mapKey, mapData);
      return mapData;
    } catch (err) {
      console.warn(`[CollisionManager] Failed to load ${mapKey}:`, err.message);
      this._cache.set(mapKey, null);
      return null;
    }
  }

  _getCollision(mapData, x, y) {
    const idx = y * mapData.width + x;
    const val = mapData.collision[idx];
    // Tiled uses 0 for empty/passable, positive integers for tile indices
    return (val && val > 0) ? val : 0;
  }
}
