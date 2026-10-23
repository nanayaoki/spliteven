-- SplitSmart group creation repair. Run after the base schema.

alter table public.groups
  alter column join_code
  set default upper(substr(md5(random()::text), 1, 6));

update public.groups
set join_code = upper(substr(md5(random()::text), 1, 6))
where length(join_code) <> 6;

create or replace function public.join_group(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  joined_group_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Sign in before joining a group';
  end if;
  if code is null or length(trim(code)) <> 6 then
    raise exception 'Invalid invitation code';
  end if;

  select id into joined_group_id
  from public.groups
  where join_code = upper(trim(code))
    and archived = false;

  if joined_group_id is null then
    raise exception 'No active group matches that invitation code';
  end if;

  insert into public.group_members (group_id, user_id)
  values (joined_group_id, current_user_id)
  on conflict (group_id, user_id) do nothing;

  return joined_group_id;
end;
$$;

revoke all on function public.join_group(text) from public;
grant execute on function public.join_group(text) to authenticated;

create or replace function public.create_group(group_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_group_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'You must be logged in to create a group';
  end if;
  if group_name is null or length(trim(group_name)) = 0 then
    raise exception 'Group name is required';
  end if;

  insert into public.groups (name, created_by)
  values (trim(group_name), current_user_id)
  returning id into new_group_id;

  insert into public.group_members (group_id, user_id, role)
  values (new_group_id, current_user_id, 'owner')
  on conflict (group_id, user_id) do update set role = 'owner';

  return new_group_id;
end;
$$;

revoke all on function public.create_group(text) from public;
grant execute on function public.create_group(text) to authenticated;
