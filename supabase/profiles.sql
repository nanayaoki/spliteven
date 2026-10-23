-- SplitSmart profile repair. Safe to run independently or after schema.sql.

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

create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_insert on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy profiles_update on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

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
