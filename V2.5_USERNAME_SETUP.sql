-- V2.5: execute after backing up existing user/profile tables.
-- This is for NEW signups. Plan migration before converting pre-existing accounts.
create table if not exists public.virhang_usernames (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),
  constraint virhang_valid_username check (username ~ '^[a-z0-9]{4,20}$')
);
alter table public.virhang_usernames enable row level security;
revoke all on public.virhang_usernames from anon, authenticated;
grant select on public.virhang_usernames to authenticated;
drop policy if exists virhang_own_username on public.virhang_usernames;
create policy virhang_own_username on public.virhang_usernames
for select to authenticated using (user_id = (select auth.uid()));
-- enforce username uniqueness atomically when Supabase Auth creates a new account.
create or replace function public.virhang_register_username()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_username text;
begin
  v_username := new.raw_user_meta_data ->> 'username';
  -- Existing accounts without a username are retained for future migration.
  if v_username is null then return new; end if;
  if v_username !~ '^[a-z0-9]{4,20}$' then
    raise exception 'invalid username' using errcode='22023';
  end if;
  insert into public.virhang_usernames(user_id,username) values(new.id,v_username);
  return new;
end; $$;
revoke all on function public.virhang_register_username() from public;
drop trigger if exists virhang_on_auth_signup on auth.users;
create trigger virhang_on_auth_signup after insert on auth.users
for each row execute function public.virhang_register_username();
