import { createSupabaseServerClient } from '../../../lib/supabase-server';

async function auth() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export async function GET() {
  const context = await auth();
  if (!context) return Response.json({ error: 'You must be logged in.' }, { status: 401 });
  const { data: memberships, error } = await context.supabase
    .from('group_members')
    .select('group_id, role, groups(id, name, join_code, created_by)')
    .eq('user_id', context.user.id);
  if (error) return Response.json({ error: 'Could not load groups.' }, { status: 500 });
  const groupIds = memberships.map((item) => item.group_id);
  const { data: members, error: memberError } = groupIds.length
    ? await context.supabase.from('group_members').select('group_id, user_id, role').in('group_id', groupIds)
    : { data: [], error: null };
  if (memberError) return Response.json({ error: 'Could not load group members.' }, { status: 500 });
  const userIds = [...new Set((members || []).map((member) => member.user_id))];
  const { data: profiles, error: profileError } = userIds.length
    ? await context.supabase.from('profiles').select('id, username').in('id', userIds)
    : { data: [], error: null };
  if (profileError) return Response.json({ error: 'Could not load group profiles.' }, { status: 500 });
  const names = new Map((profiles || []).map((profile) => [profile.id, profile.username]));
  const membersByGroup = new Map();
  (members || []).forEach((member) => {
    const groupMembers = membersByGroup.get(member.group_id) || [];
    groupMembers.push({ id: member.user_id, name: names.get(member.user_id) || 'Member', role: member.role });
    membersByGroup.set(member.group_id, groupMembers);
  });
  return Response.json({
    groups: memberships.map((item) => ({
      ...item.groups,
      role: item.role,
      members: membersByGroup.get(item.group_id) || [],
    })),
  });
}

export async function POST(request) {
  const context = await auth();
  if (!context) return Response.json({ error: 'You must be logged in.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) return Response.json({ error: 'Group name is required.' }, { status: 400 });
  const { data, error } = await context.supabase.from('groups').insert({ name, created_by: context.user.id }).select('id, name, join_code, created_by').single();
  if (error) return Response.json({ error: 'Could not create the group.' }, { status: 500 });
  return Response.json({ group: data }, { status: 201 });
}
