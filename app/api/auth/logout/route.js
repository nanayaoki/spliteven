import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '../../../../lib/auth';
import { updateDatabase } from '../../../../lib/db';

export async function POST() {
  const sessionId = cookies().get(SESSION_COOKIE)?.value;
  if (sessionId) updateDatabase((database) => ({ ...database, sessions: database.sessions.filter((session) => session.id !== sessionId) }));
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', expires: new Date(0), path: '/' });
  return response;
}
