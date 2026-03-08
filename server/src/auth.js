/**
 * auth.js — Registration, login, and JWT verification.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  findUserByUsername,
  createUser,
  getPlayerState,
  createPlayerState,
  getDisplayName,
} from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'pokemon-mmo-dev-secret-change-in-prod';
const SALT_ROUNDS = 10;
const MIN_PASSWORD = 8;

function formatState(row) {
  if (!row) return null;
  return {
    map: row.map,
    x: row.x,
    y: row.y,
    dir: row.dir,
    party: JSON.parse(row.party_json),
    pc: JSON.parse(row.pc_json),
    bag: JSON.parse(row.bag_json),
    flags: JSON.parse(row.flags_json),
    money: row.money,
    badges: JSON.parse(row.badges_json),
  };
}

export function register(username, displayName, password) {
  username = username?.trim().toLowerCase();
  displayName = displayName?.trim();

  if (!username || username.length < 3 || username.length > 20) {
    return { error: 'Username must be 3–20 characters.' };
  }
  if (!/^[a-z0-9_]+$/.test(username)) {
    return { error: 'Username: only letters, numbers, underscores.' };
  }
  if (!displayName || displayName.length < 1 || displayName.length > 16) {
    return { error: 'Display name must be 1–16 characters.' };
  }
  if (!password || password.length < MIN_PASSWORD) {
    return { error: `Password must be at least ${MIN_PASSWORD} characters.` };
  }

  if (findUserByUsername(username)) {
    return { error: 'Username already taken.' };
  }

  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const playerId = createUser(username, displayName, hash);
  createPlayerState(playerId);

  const token = jwt.sign({ id: playerId, username }, JWT_SECRET, { expiresIn: '7d' });
  const state = getPlayerState(playerId);

  return { token, playerId, displayName, state: formatState(state) };
}

export function login(username, password) {
  username = username?.trim().toLowerCase();
  if (!username || !password) {
    return { error: 'Username and password are required.' };
  }

  const user = findUserByUsername(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return { error: 'Invalid username or password.' };
  }

  const token = jwt.sign({ id: user.id, username }, JWT_SECRET, { expiresIn: '7d' });
  const state = getPlayerState(user.id);

  return { token, playerId: user.id, displayName: user.display_name, state: formatState(state) };
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
