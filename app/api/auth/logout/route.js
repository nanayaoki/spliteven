import { createSupabaseServerClient } from '../../../../lib/supabase-server';

export async function POST() {
  const { error } = await createSupabaseServerClient().auth.signOut();
  return Response.json(error ? { error: 'Could not log out.' } : { ok: true }, { status: error ? 500 : 200 });
}
