-- Run in the Supabase project's SQL editor or via Supabase migrations.
-- Google is the ONLY enabled auth provider in the Supabase dashboard.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role text not null default 'user'
    check (role in ('user', 'admin')),
  status text not null default 'active'
    check (status in ('active', 'blocked')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

-- A trigger function needs elevated privileges to write into an RLS table.
-- Keep it outside the exposed public Data API schema.
create schema if not exists private;
revoke all on schema private from public;
create or replace function private.handle_new_google_profile()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id, new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$;
revoke all on function private.handle_new_google_profile() from public, anon, authenticated;

drop trigger if exists on_google_account_created on auth.users;
create trigger on_google_account_created
  after insert on auth.users for each row
  execute function private.handle_new_google_profile();

-- For any accounts created prior to this migration.
insert into public.profiles (id, email, full_name, avatar_url)
select id, email,
  raw_user_meta_data ->> 'full_name',
  raw_user_meta_data ->> 'avatar_url'
from auth.users
on conflict (id) do nothing;
