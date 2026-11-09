-- Run after 001_initial.sql and 002_user_profiles.sql.
-- Credentials and password hashes live exclusively in Supabase Auth (auth.users).
 -- public.users is application account metadata only; no password column is exposed.
alter table public.profiles
 add column if not exists location text not null default '',
 add column if not exists date_of_birth date,
 add column if not exists full_address text not null default '',
 add column if not exists address_line_2 text not null default '',
 add column if not exists city text not null default '',
 add column if not exists state_region text not null default '',
 add column if not exists postal_code text not null default '',
 add column if not exists country text not null default '',
 add column if not exists phone_number text not null default '',
 add column if not exists bio text not null default '';

create table if not exists public.users (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 level text not null default 'user' check (level in ('user','admin')),
 profiles_id uuid not null unique references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.users enable row level security;
drop policy if exists users_read_self on public.users;
create policy users_read_self on public.users for select to authenticated using (id = (select auth.uid()));
-- No client INSERT/UPDATE/DELETE policy for public.users: level and profile ownership
-- must not be user-editable. Only admin-controlled SQL can assign the admin role.
create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles (id,email,full_name)
 values (new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data ->> 'full_name',''))
 on conflict (id) do nothing;
 insert into public.users (id,email,level,profiles_id)
 values (new.id,coalesce(new.email,''),'user',new.id)
 on conflict (id) do nothing;
 return new;
end;
$$;
-- Existing trigger defined in 002 calls the replaced function.
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 update public.profiles set email=coalesce(new.email,''),updated_at=now() where id=new.id;
 update public.users set email=coalesce(new.email,''),updated_at=now() where id=new.id;
 return new;
end;
$$;
insert into public.profiles (id,email,full_name)
select id,coalesce(email,''),coalesce(raw_user_meta_data ->> 'full_name','') from auth.users
on conflict (id) do nothing;
insert into public.users (id,email,profiles_id)
select id,coalesce(email,''),id from auth.users
on conflict (id) do nothing;
-- Prevent direct client-side email/profile reassignment; auth email is controlled by auth.users.
revoke insert,update,delete on public.users from anon,authenticated;
