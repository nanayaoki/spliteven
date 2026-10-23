import { createSupabaseServerClient } from '../../../../lib/supabase-server';
import { isValidUsername, normalizeUsername, usernameEmail } from '../../../../lib/username';

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }
  const username = normalizeUsername(body?.username);
  if (!isValidUsername(username) || typeof body?.password !== 'string') return Response.json({ error: 'Invalid username or password.' }, { status: 401 });
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: usernameEmail(username), password: body.password });
  if (error) return Response.json({ error: 'Invalid username or password.' }, { status: 401 });
  return Response.json({ username });
}
