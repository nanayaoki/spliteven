import { createSupabaseServerClient } from '../../../../lib/supabase-server';

export async function POST(request) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: 'You must be logged in.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!code) return Response.json({ error: 'Join code is required.' }, { status: 400 });
  const { data, error } = await supabase.rpc('join_group', { code });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ groupId: data });
}
