-- Sakura Shelf schema: run this in Supabase > SQL Editor.
-- Passwords are managed by Supabase Auth; they are never stored in these tables.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null default 'Sakura',
  updated_at timestamptz not null default now()
);

-- Safe when updating a project that already has the previous MVP schema.
alter table public.profiles add column if not exists username text not null default 'Sakura';
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create table if not exists public.anime (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 150),
  cover_url text,
  category text not null default 'Other' check (category in ('Action','Adventure','Comedy','Drama','Fantasy','Romance','Horror','Mystery','Sci-Fi','Slice of Life','Sports','Other')),
  rating numeric(3,1) not null default 8 check (rating >= 1 and rating <= 10),
  created_at timestamptz not null default now()
);

create index if not exists anime_user_created_at_idx on public.anime (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.anime enable row level security;

-- This site is a public frontend. Anonymous visitors must not be able to access library rows.
revoke all on table public.profiles from anon;
revoke all on table public.anime from anon;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.anime to authenticated;
grant usage on schema public to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "Users can read their own anime" on public.anime;
create policy "Users can read their own anime" on public.anime
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own anime" on public.anime;
create policy "Users can insert their own anime" on public.anime
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own anime" on public.anime;
create policy "Users can update their own anime" on public.anime
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own anime" on public.anime;
create policy "Users can delete their own anime" on public.anime
  for delete to authenticated using ((select auth.uid()) = user_id);
