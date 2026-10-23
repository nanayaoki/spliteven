import { createSupabaseServerClient } from '../../../lib/supabase-server';

async function auth() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

function mapExpense(item) {
  return { id: item.id, name: item.name, emoji: item.emoji, amount: Number(item.amount), paidBy: item.paid_by, participants: item.participants || [] };
}

export async function GET(request) {
  const context = await auth();
  if (!context) return Response.json({ error: 'You must be logged in.' }, { status: 401 });
  const groupId = new URL(request.url).searchParams.get('group_id');
  if (!groupId) return Response.json({ error: 'group_id is required.' }, { status: 400 });
  const { data, error } = await context.supabase.from('expenses').select('id, name, emoji, amount, paid_by, participants, created_at').eq('group_id', groupId).order('created_at', { ascending: true });
  if (error) return Response.json({ error: 'Could not load group expenses.' }, { status: 500 });
  return Response.json({ expenses: data.map(mapExpense) });
}

export async function POST(request) {
  const context = await auth();
  if (!context) return Response.json({ error: 'You must be logged in.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const amount = Number(body?.amount);
  if (!body?.groupId || !body?.name || !body?.paidBy || !Array.isArray(body.participants) || !body.participants.length || !Number.isFinite(amount) || amount <= 0) {
    return Response.json({ error: 'Complete expense details and select a group.' }, { status: 400 });
  }
  const { data, error } = await context.supabase.from('expenses').insert({
    user_id: context.user.id, group_id: body.groupId, name: String(body.name).trim(),
    emoji: body.emoji || '🧾', amount, paid_by: body.paidBy, participants: body.participants,
  }).select('id, name, emoji, amount, paid_by, participants').single();
  if (error) return Response.json({ error: 'Could not save the expense to this group.' }, { status: 500 });
  return Response.json({ expense: mapExpense(data) }, { status: 201 });
}

export async function DELETE(request) {
  const context = await auth();
  if (!context) return Response.json({ error: 'You must be logged in.' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  const groupId = new URL(request.url).searchParams.get('group_id');
  const { error } = await context.supabase.from('expenses').delete().eq('id', id).eq('group_id', groupId).eq('user_id', context.user.id);
  if (error) return Response.json({ error: 'Could not remove the expense.' }, { status: 500 });
  return Response.json({ ok: true });
}
