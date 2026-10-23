import { NextResponse } from 'next/server';
import readDatabase, { updateDatabase } from '../../../../lib/db';
import { cookieOptions, createSession, hashPassword, isValidUsername, normalizeUsername, SESSION_COOKIE } from '../../../../lib/auth';

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }
  const username = normalizeUsername(body?.username);
  const password = body?.password;
  if (!isValidUsername(username)) return Response.json({ error: 'Username must be 3–24 characters using letters, numbers, or underscores.' }, { status: 400 });
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) return Response.json({ error: 'Password must be between 8 and 128 characters.' }, { status: 400 });
  if (readDatabase().users.some((user) => user.username === username)) return Response.json({ error: 'That username is already registered. Try logging in.' }, { status: 409 });
  const database = readDatabase();
  const userId = database.nextUserId;
  updateDatabase((current) => ({ ...current, nextUserId: current.nextUserId + 1, users: [...current.users, { id: userId, username, passwordHash: hashPassword(password) }] }));
  const session = createSession(userId);
  const response = NextResponse.json({ username });
  response.cookies.set(SESSION_COOKIE, session.sessionId, cookieOptions(session.expiresAt));
  return response;
}
