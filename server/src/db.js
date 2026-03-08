/**
 * db.js — SQLite database setup using sql.js (pure JS, no native deps).
 *
 * Persists to server/data/pokemon-mmo.db.
 * Auto-saves to disk after every write operation.
 */

import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_MAP, MAPS } from '@pokemon-mmo/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../data/pokemon-mmo.db');

let db = null;

/** Initialize the database — must be called (and awaited) before any queries. */
export async function initDB() {
  const SQL = await initSqlJs();

  // Load existing DB file if it exists
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('[DB] Loaded existing database from', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new database');
  }

  // Create tables if they don't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS player_state (
      player_id INTEGER PRIMARY KEY REFERENCES players(id),
      map TEXT NOT NULL DEFAULT '${DEFAULT_MAP}',
      x INTEGER NOT NULL DEFAULT ${MAPS[DEFAULT_MAP].spawnX},
      y INTEGER NOT NULL DEFAULT ${MAPS[DEFAULT_MAP].spawnY},
      dir TEXT NOT NULL DEFAULT 'down',
      party_json TEXT NOT NULL DEFAULT '[]',
      pc_json TEXT NOT NULL DEFAULT '{"boxNames":[],"boxes":[]}',
      bag_json TEXT NOT NULL DEFAULT '{}',
      flags_json TEXT NOT NULL DEFAULT '{}',
      money INTEGER NOT NULL DEFAULT 0,
      badges_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  saveToDisk();
  return db;
}

/** Persist current DB state to disk. */
function saveToDisk() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, buffer);
}

// ── Query helpers ──────────────────────────────────────────────────────────────

export function findUserByUsername(username) {
  const stmt = db.prepare('SELECT * FROM players WHERE username = ?');
  stmt.bind([username]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

export function createUser(username, displayName, passwordHash) {
  db.run(
    'INSERT INTO players (username, display_name, password_hash) VALUES (?, ?, ?)',
    [username, displayName, passwordHash]
  );
  const id = db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0];
  saveToDisk();
  return id;
}

export function getPlayerState(playerId) {
  const stmt = db.prepare('SELECT * FROM player_state WHERE player_id = ?');
  stmt.bind([playerId]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

export function createPlayerState(playerId) {
  db.run('INSERT INTO player_state (player_id) VALUES (?)', [playerId]);
  saveToDisk();
}

export function savePlayerState(playerId, state) {
  db.run(
    `UPDATE player_state SET
      map = ?, x = ?, y = ?, dir = ?,
      party_json = ?, pc_json = ?,
      bag_json = ?, flags_json = ?,
      money = ?, badges_json = ?,
      updated_at = datetime('now')
    WHERE player_id = ?`,
    [
      state.map, state.x, state.y, state.dir,
      JSON.stringify(state.party), JSON.stringify(state.pc),
      JSON.stringify(state.bag), JSON.stringify(state.flags),
      state.money ?? 0, JSON.stringify(state.badges ?? []),
      playerId,
    ]
  );
  saveToDisk();
}

export function getDisplayName(playerId) {
  const stmt = db.prepare('SELECT display_name FROM players WHERE id = ?');
  stmt.bind([playerId]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row.display_name;
  }
  stmt.free();
  return null;
}
