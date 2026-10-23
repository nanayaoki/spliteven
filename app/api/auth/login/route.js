import { createSupabaseServerClient } from '../../../../lib/supabase-server';
import { isValidUsername, normalizeUsername, usernameEmail } from '../../../../lib/username';

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const username = normalizeUsername(body?.username);
  if (!isValidUsername(username) || typeof body?.password !== 'string') return Response.json({ error: 'Invalid username or password.' }, { status: 401 });
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: usernameEmail(username), password: body.password });
  if (error) return Response.json({ error: 'Invalid username or password.' }, { status: 401 });
  const { error: profileError } = await supabase.from('profiles').upsert(
    { id: data.user.id, username },
    { onConflict: 'id' },
  );
  if (profileError) {
    return Response.json({ error: 'Login succeeded, but the profiles table is not ready. Run supabase/schema.sql in the Supabase SQL Editor, then log in again.' }, { status: 503 });
  }
  return Response.json({ username });
}
