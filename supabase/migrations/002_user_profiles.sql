-- Run AFTER 001_initial.sql. Supabase Auth owns passwords and email verification.
-- public.profiles stores non-secret account details and is protected by RLS.
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 full_name text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists profiles_read_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_read_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- User rows are created automatically by the database trigger, not by untrusted clients.
create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles (id,email,full_name)
 values (new.id, coalesce(new.email,''), coalesce(new.raw_user_meta_data ->> 'full_name',''))
 on conflict (id) do nothing;
 return new;
end;
$$;
drop trigger if exists on_auth_user_created_jobtrack on auth.users;
create trigger on_auth_user_created_jobtrack after insert on auth.users
for each row execute function public.create_profile_for_new_user();
-- Support users who signed up prior to this migration.
insert into public.profiles (id,email,full_name)
select id,coalesce(email,''),coalesce(raw_user_meta_data ->> 'full_name','') from auth.users
on conflict (id) do nothing;
-- Keep email synchronized when a verified user changes it through Supabase Auth.
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 update public.profiles set email=coalesce(new.email,''),updated_at=now() where id=new.id;
 return new;
end;
$$;
drop trigger if exists on_auth_user_email_changed_jobtrack on auth.users;
create trigger on_auth_user_email_changed_jobtrack after update of email on auth.users
for each row when (old.email is distinct from new.email) execute function public.sync_profile_email();
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
