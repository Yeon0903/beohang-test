-- Run in virhang Supabase SQL Editor. Private per-user library data.
create table if not exists public.virhang_account_libraries (
 user_id uuid primary key references auth.users(id) on delete cascade,
 likes jsonb not null default '[]'::jsonb,
 playlists jsonb not null default '[]'::jsonb,
 updated_at timestamptz not null default now(),
 constraint valid_likes check (jsonb_typeof(likes) = 'array'),
 constraint valid_playlists check (jsonb_typeof(playlists) = 'array')
);
alter table public.virhang_account_libraries enable row level security;
grant select,insert,update on public.virhang_account_libraries to authenticated;
revoke all on public.virhang_account_libraries from anon;
create policy "virhang_library_read_own" on public.virhang_account_libraries
 for select to authenticated using (user_id = (select auth.uid()));
create policy "virhang_library_insert_own" on public.virhang_account_libraries
 for insert to authenticated with check (user_id = (select auth.uid()));
create policy "virhang_library_update_own" on public.virhang_account_libraries
 for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
