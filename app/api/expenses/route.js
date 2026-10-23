import { createSupabaseServerClient } from '../../../lib/supabase-server';

function mapExpense(expense) {
  return { id: expense.id, name: expense.name, emoji: expense.emoji, amount: Number(expense.amount), paidBy: expense.paid_by, participants: Array.isArray(expense.participants) ? expense.participants : [] };
}

async function authenticatedClient() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export async function GET() {
  const auth = await authenticatedClient();
  if (!auth) return Response.json({ error: 'You must be logged in.' }, { status: 401 });
  const { data, error } = await auth.supabase.from('expenses').select('id,name,emoji,amount,paid_by,participants,created_at').order('created_at', { ascending: true });
  if (error) return Response.json({ error: 'Could not load expenses.' }, { status: 500 });
  return Response.json({ expenses: data.map(mapExpense) });
}

export async function POST(request) {
  const auth = await authenticatedClient();
  if (!auth) return Response.json({ error: 'You must be logged in.' }, { status: 401 });
  const body = await request.json();
  const amount = Number(body?.amount);
  const participants = Array.isArray(body?.participants) ? body.participants.filter((id) => typeof id === 'string') : [];
  if (!body?.name || !Number.isFinite(amount) || amount <= 0 || !body?.paidBy || !participants.length) return Response.json({ error: 'Expense data is incomplete.' }, { status: 400 });
  const { data, error } = await auth.supabase.from('expenses').insert({ user_id: auth.user.id, name: String(body.name).trim(), emoji: body.emoji || '🧾', amount, paid_by: body.paidBy, participants }).select('id,name,emoji,amount,paid_by,participants').single();
  if (error) return Response.json({ error: 'Could not save the expense.' }, { status: 500 });
  return Response.json({ expense: mapExpense(data) }, { status: 201 });
}

export async function DELETE(request) {
  const auth = await authenticatedClient();
  if (!auth) return Response.json({ error: 'You must be logged in.' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'Expense id is required.' }, { status: 400 });
  const { error } = await auth.supabase.from('expenses').delete().eq('id', id).eq('user_id', auth.user.id);
  if (error) return Response.json({ error: 'Could not remove the expense.' }, { status: 500 });
  return Response.json({ ok: true });
}
