import { NextResponse } from 'next/server';
import readDatabase from '../../../../lib/db';
import { cookieOptions, createSession, isValidUsername, normalizeUsername, SESSION_COOKIE, verifyPassword } from '../../../../lib/auth';

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }
  const username = normalizeUsername(body?.username);
  const user = readDatabase().users.find((item) => item.username === username);
  if (!user || !isValidUsername(username) || typeof body?.password !== 'string' || !verifyPassword(body.password, user.passwordHash)) return Response.json({ error: 'Invalid username or password.' }, { status: 401 });
  const session = createSession(user.id);
  const response = NextResponse.json({ username });
  response.cookies.set(SESSION_COOKIE, session.sessionId, cookieOptions(session.expiresAt));
  return response;
}
