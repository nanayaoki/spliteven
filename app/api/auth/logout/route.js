import { createSupabaseServerClient } from '../../../../lib/supabase-server';

export async function POST() {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) return Response.json({ error: 'Could not log out.' }, { status: 500 });
  return Response.json({ ok: true });
}
