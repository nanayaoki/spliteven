import { createSupabaseServerClient } from '../../../../lib/supabase-server';
import { isValidUsername, normalizeUsername, usernameEmail } from '../../../../lib/username';

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 }); }
  const username = normalizeUsername(body?.username);
  const password = body?.password;
  if (!isValidUsername(username)) return Response.json({ error: 'Username must be 3–24 characters using letters, numbers, or underscores.' }, { status: 400 });
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) return Response.json({ error: 'Password must be between 8 and 128 characters.' }, { status: 400 });
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email: usernameEmail(username), password });
  if (error) {
    const duplicate = /already registered|already exists/i.test(error.message);
    return Response.json({ error: duplicate ? 'That username is already registered. Try logging in.' : error.message }, { status: duplicate ? 409 : 400 });
  }
  if (!data.session) {
    return Response.json({
      error: 'Username/password sign-up is not enabled. In Supabase, turn off Authentication → Providers → Email → Confirm email.',
    }, { status: 503 });
  }
  return Response.json({ username });
}
