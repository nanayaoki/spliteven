import { createSupabaseServerClient } from '../../../../lib/supabase-server';
import { isValidUsername, normalizeUsername, usernameEmail } from '../../../../lib/username';

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const username = normalizeUsername(body?.username);
  if (!isValidUsername(username) || typeof body?.password !== 'string' || body.password.length < 8) {
    return Response.json({ error: 'Use a username of 3–24 characters and a password of at least 8 characters.' }, { status: 400 });
  }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({ email: usernameEmail(username), password: body.password, options: { data: { username } } });
  if (error) {
    if (/confirmation email|sending.*email|email.*send/i.test(error.message)) {
      return Response.json({
        error: 'Supabase is trying to send a confirmation email. In Supabase Dashboard, open Authentication → Providers → Email and turn off Confirm email, then try signing up again.',
      }, { status: 503 });
    }
    return Response.json({ error: /already/i.test(error.message) ? 'That username is already registered.' : error.message }, { status: 400 });
  }
  if (!data.session || !data.user) return Response.json({ error: 'Disable email confirmation in Supabase Auth to use username/password signup.' }, { status: 503 });
  const { error: profileError } = await supabase.from('profiles').upsert({ id: data.user.id, username }, { onConflict: 'id' });
  if (profileError) {
    const missingTable = /relation .*profiles.* does not exist|could not find the table/i.test(profileError.message);
    return Response.json({
      error: missingTable
        ? 'Account created, but the profiles table is missing. Run supabase/schema.sql in the Supabase SQL Editor, then log in again.'
        : `Account created, but the profile could not be saved: ${profileError.message}`,
    }, { status: 500 });
  }
  return Response.json({ username });
}
