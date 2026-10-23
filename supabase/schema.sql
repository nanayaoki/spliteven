-- SplitSmart: groups, membership, and group-scoped expense access.
--
-- Run schema.sql first, then run this file. This migration is safe to rerun.
-- Group join codes are bearer invitations: share them only with intended members.

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  emoji       text not null default '🧾',
  paid_by     text not null,
  amount      numeric not null check (amount > 0),
  category    text not null default 'Other',
  expense_date date not null default current_date,
  created_at  timestamptz not null default now()
);

alter table public.expenses
  add column if not exists participants jsonb not null default '[]'::jsonb,
  add column if not exists category text not null default 'Other',
  add column if not exists expense_date date not null default current_date;

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  description text,
  currency    text not null default 'INR',
  join_code   text not null unique
    default upper(substr(md5(random()::text), 1, 6)),
  created_by  uuid not null references auth.users(id) on delete cascade,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.groups
  add column if not exists description text,
  add column if not exists currency text not null default 'INR',
  add column if not exists archived boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.groups
  alter column join_code
  set default upper(substr(md5(random()::text), 1, 6));

-- Replace legacy codes with short six-character invite codes.
update public.groups
set join_code = upper(substr(md5(random()::text), 1, 6))
where length(join_code) <> 6;

create table if not exists public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_members
  add column if not exists role text not null default 'member';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.group_members'::regclass
      and conname = 'group_members_role_check'
  ) then
    alter table public.group_members
      add constraint group_members_role_check
      check (role in ('owner', 'admin', 'member')) not valid;
  end if;
end
$$;

alter table public.expenses
  add column if not exists group_id uuid references public.groups(id) on delete restrict;

create index if not exists group_members_user_group_idx
  on public.group_members (user_id, group_id);
create index if not exists expenses_group_created_idx
  on public.expenses (group_id, created_at desc)
  where group_id is not null;

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.group_members
      where group_id = gid and user_id = auth.uid()
    );
$$;

create or replace function public.is_group_owner(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.groups
      where id = gid and created_by = auth.uid()
    );
$$;

create or replace function public.is_active_group_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.group_members as members
      join public.groups as shared_group on shared_group.id = members.group_id
      where members.group_id = gid
        and members.user_id = auth.uid()
        and shared_group.archived = false
    );
$$;

create or replace function public.is_active_group_owner(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.groups
      where id = gid and created_by = auth.uid() and archived = false
    );
$$;

-- Group creation must also create the owner's membership atomically.
create or replace function public.add_group_creator_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (group_id, user_id)
  do update set role = 'owner';
  return new;
end;
$$;

create or replace function public.set_group_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists groups_add_creator_membership on public.groups;
create trigger groups_add_creator_membership
  after insert on public.groups
  for each row execute function public.add_group_creator_as_member();

drop trigger if exists groups_set_updated_at on public.groups;
create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_group_updated_at();

-- Repair groups created before the membership trigger existed.
insert into public.group_members (group_id, user_id, role)
select id, created_by, 'owner'
from public.groups
on conflict (group_id, user_id) do update set role = 'owner';

-- Joining requires an authenticated user and possession of the full random
-- invitation code. Direct client inserts into group_members are not allowed.
create or replace function public.join_group(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  gid uuid;
  joining_user uuid := auth.uid();
begin
  if joining_user is null then
    raise exception 'Sign in before joining a group';
  end if;
  if code is null or length(trim(code)) <> 6 then
    raise exception 'Invalid invitation code';
  end if;

  select id into gid
  from public.groups
  where join_code = upper(trim(code))
    and archived = false;

  if gid is null then
    raise exception 'No active group matches that invitation code';
  end if;

  insert into public.group_members (group_id, user_id)
  values (gid, joining_user)
  on conflict (group_id, user_id) do nothing;

  return gid;
end;
$$;

revoke all on function public.is_group_member(uuid) from public;
revoke all on function public.is_group_owner(uuid) from public;
revoke all on function public.is_active_group_member(uuid) from public;
revoke all on function public.is_active_group_owner(uuid) from public;
revoke all on function public.join_group(text) from public;
revoke all on function public.add_group_creator_as_member() from public;
revoke all on function public.set_group_updated_at() from public;
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;
grant execute on function public.is_active_group_member(uuid) to authenticated;
grant execute on function public.is_active_group_owner(uuid) to authenticated;
grant execute on function public.join_group(text) to authenticated;

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;

revoke all on public.groups, public.group_members from anon;
grant select, insert, update on public.groups to authenticated;
grant select, update, delete on public.group_members to authenticated;

drop policy if exists "see my groups" on public.groups;
drop policy if exists "create groups" on public.groups;
drop policy if exists "groups_select" on public.groups;
drop policy if exists "groups_insert" on public.groups;
drop policy if exists "groups_update" on public.groups;

create policy groups_select on public.groups
  for select to authenticated
  using (public.is_group_member(id));
create policy groups_insert on public.groups
  for insert to authenticated
  with check (auth.uid() = created_by);
create policy groups_update on public.groups
  for update to authenticated
  using (public.is_group_owner(id))
  with check (public.is_group_owner(id) and created_by = auth.uid());

drop policy if exists "see my memberships" on public.group_members;
drop policy if exists "join groups" on public.group_members;
drop policy if exists "group_members_select" on public.group_members;
drop policy if exists "group_members_update" on public.group_members;
drop policy if exists "group_members_delete" on public.group_members;

create policy group_members_select on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));
create policy group_members_update on public.group_members
  for update to authenticated
  using (public.is_active_group_owner(group_id))
  with check (public.is_active_group_owner(group_id));
create policy group_members_delete on public.group_members
  for delete to authenticated
  using (public.is_active_group_owner(group_id) and user_id <> auth.uid());

drop policy if exists "read own expenses" on public.expenses;
drop policy if exists "insert own expenses" on public.expenses;
drop policy if exists "update own expenses" on public.expenses;
drop policy if exists "delete own expenses" on public.expenses;
drop policy if exists "see group expenses" on public.expenses;
drop policy if exists "add group expenses" on public.expenses;
drop policy if exists "delete group expenses" on public.expenses;
drop policy if exists "expenses_select" on public.expenses;
drop policy if exists "expenses_insert" on public.expenses;
drop policy if exists "expenses_update" on public.expenses;
drop policy if exists "expenses_delete" on public.expenses;

create policy expenses_select on public.expenses
  for select to authenticated
  using (
    auth.uid() = user_id
    or (group_id is not null and public.is_group_member(group_id))
  );
create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and (group_id is null or public.is_active_group_member(group_id))
  );
create policy expenses_update on public.expenses
  for update to authenticated
  using (
    auth.uid() = user_id
    and (group_id is null or public.is_active_group_member(group_id))
  )
  with check (
    auth.uid() = user_id
    and (group_id is null or public.is_active_group_member(group_id))
  );
create policy expenses_delete on public.expenses
  for delete to authenticated
  using (
    auth.uid() = user_id
    and (group_id is null or public.is_active_group_member(group_id))
  );

do $$ 
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.expenses'::regclass
      and conname = 'expenses_amount_positive'
  ) then
    alter table public.expenses
      add constraint expenses_amount_positive check (amount > 0) not valid;
  end if;
end
$$;

create index if not exists expenses_user_created_idx
  on public.expenses (user_id, created_at desc);

alter table public.expenses enable row level security;

revoke all on public.expenses from anon;
grant select, insert, update, delete on public.expenses to authenticated;

-- Replace older policies as well as the current policies so permissive
-- policies from a previous run cannot accidentally widen access.
drop policy if exists "read own expenses" on public.expenses;
drop policy if exists "insert own expenses" on public.expenses;
drop policy if exists "update own expenses" on public.expenses;
drop policy if exists "delete own expenses" on public.expenses;
drop policy if exists "see group expenses" on public.expenses;
drop policy if exists "add group expenses" on public.expenses;
drop policy if exists "delete group expenses" on public.expenses;
drop policy if exists "expenses_select" on public.expenses;
drop policy if exists "expenses_insert" on public.expenses;
drop policy if exists "expenses_update" on public.expenses;
drop policy if exists "expenses_delete" on public.expenses;

-- Use group membership checks if the group migration has already been run.
-- Otherwise keep this table scoped to each authenticated user.
do $$
declare
  has_group_access boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'expenses'
      and column_name = 'group_id'
  ) and to_regprocedure('public.is_active_group_member(uuid)') is not null
  into has_group_access;

  if has_group_access then
    execute $policy$
      create policy expenses_select on public.expenses
      for select to authenticated
      using (auth.uid() = user_id or (group_id is not null and public.is_group_member(group_id)))
    $policy$;
    execute $policy$
      create policy expenses_insert on public.expenses
      for insert to authenticated
      with check (
        auth.uid() = user_id
        and (group_id is null or public.is_active_group_member(group_id))
      )
    $policy$;
    execute $policy$
      create policy expenses_update on public.expenses
      for update to authenticated
      using (auth.uid() = user_id and (group_id is null or public.is_active_group_member(group_id)))

      with check (auth.uid() = user_id and (group_id is null or public.is_active_group_member(group_id)))
    $policy$;
    execute $policy$
      create policy expenses_delete on public.expenses
      for delete to authenticated
      using (auth.uid() = user_id and (group_id is null or public.is_active_group_member(group_id)))
    $policy$;
  else
    create policy expenses_select on public.expenses
      for select to authenticated using (auth.uid() = user_id);
    create policy expenses_insert on public.expenses
      for insert to authenticated with check (auth.uid() = user_id);
    create policy expenses_update on public.expenses
      for update to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
    create policy expenses_delete on public.expenses
      for delete to authenticated using (auth.uid() = user_id);
  end if;
end
$$;

-- Public profile metadata keeps the UI username-only while auth.users remains
-- the source of truth for identity and RLS.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy profiles_update on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

insert into public.profiles (id, username)
select id,
       coalesce(
         nullif(lower(trim(raw_user_meta_data ->> 'username')), ''),
         lower(split_part(email, '@', 1))
       )
from auth.users
where coalesce(
  nullif(lower(trim(raw_user_meta_data ->> 'username')), ''),
  lower(split_part(email, '@', 1))
) ~ '^[a-z0-9_]{3,24}$'
on conflict (id) do update
set username = excluded.username;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text;
begin
  requested_username := lower(trim(new.raw_user_meta_data ->> 'username'));
  if requested_username is null or requested_username !~ '^[a-z0-9_]{3,24}$' then
    requested_username := lower(split_part(new.email, '@', 1));
  end if;
  insert into public.profiles (id, username)
  values (new.id, requested_username)
  on conflict (id) do update set username = excluded.username;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();
revoke all on function public.handle_new_user_profile() from public;