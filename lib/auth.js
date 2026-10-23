import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import readDatabase, { updateDatabase } from './db';

export const SESSION_COOKIE = 'splitsmart_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, storedPassword) {
  const [salt, storedHash] = storedPassword.split(':');
  if (!salt || !storedHash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(storedHash, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

export function createSession(userId) {
  const sessionId = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  updateDatabase((database) => ({
    ...database,
    sessions: [...database.sessions.filter((session) => session.expiresAt > Date.now()), { id: sessionId, userId, expiresAt }],
  }));
  return { sessionId, expiresAt };
}

export function getSessionUser() {
  const sessionId = cookies().get(SESSION_COOKIE)?.value;
  const database = readDatabase();
  const session = database.sessions.find((item) => item.id === sessionId && item.expiresAt > Date.now());
  return session ? database.users.find((user) => user.id === session.userId) || null : null;
}

export function cookieOptions(expiresAt) {
  return { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', expires: new Date(expiresAt), path: '/' };
}

export function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isValidUsername(username) {
  return /^[a-z0-9_]{3,24}$/.test(username);
}
