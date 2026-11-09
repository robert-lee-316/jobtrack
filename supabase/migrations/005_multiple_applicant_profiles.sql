-- v1.4.0: multiple applicant profiles per account. BACK UP your database first.
-- Apply after 004_match_visualized_schema.sql. Keeps existing profile IDs and data.
begin;
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles add column if not exists user_id uuid references auth.users(id) on delete cascade;
update public.profiles set user_id=id where user_id is null;
alter table public.profiles alter column user_id set not null;
alter table public.profiles add column if not exists profile_name text not null default 'Main Profile';
-- Prevent deleting the chosen default profile via direct Supabase client calls.
alter table public.users drop constraint if exists users_profiles_id_fkey;
alter table public.users add constraint users_profiles_id_fkey foreign key (profiles_id) references public.profiles(id) on delete restrict;
create index if not exists profiles_user_id_idx on public.profiles(user_id);
create unique index if not exists profiles_owner_id_unique on public.profiles(user_id,id);
-- Enforce one account owner on profile foreign keys even for direct API writes.
alter table public.resumes drop constraint if exists resumes_profile_id_fkey;
alter table public.resumes add constraint resumes_owner_profile_fk foreign key (user_id,profile_id) references public.profiles(user_id,id) on delete restrict;
alter table public.applications add column if not exists profile_id uuid;
update public.applications a set profile_id=u.profiles_id from public.users u where a.user_id=u.id and a.profile_id is null;
alter table public.applications add constraint applications_owner_profile_fk foreign key (user_id,profile_id) references public.profiles(user_id,id) on delete restrict;
drop index if exists public.app_user_url_unique;
create unique index if not exists app_profile_url_unique on public.applications(user_id,profile_id,job_url) where job_url <> '';
create index if not exists applications_profile_id_idx on public.applications(profile_id);
-- Enable separate named resumes for each applicant identity.
alter table public.resumes drop constraint if exists resumes_user_id_name_key;
create unique index if not exists resumes_profile_name_unique on public.resumes(profile_id,name);
-- Existing default account identity stays intact; additional identities are ordinary rows.
drop policy if exists profiles_read_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_create_self on public.profiles;
drop policy if exists profiles_delete_self on public.profiles;
create policy profiles_read_self on public.profiles for select to authenticated using (user_id=(select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy profiles_create_self on public.profiles for insert to authenticated with check (user_id=(select auth.uid()));
create policy profiles_delete_self on public.profiles for delete to authenticated using (user_id=(select auth.uid()));
-- Revoked from earlier migration? profiles are client-editable, users.level is not.
grant select,insert,update,delete on public.profiles to authenticated;
-- Explicit field protection for ownership, managed through the authenticated RLS check.
-- A user may choose a default profile only if it belongs to their account.
create or replace function public.set_default_applicant_profile(target_profile_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.profiles where id=target_profile_id and user_id=(select auth.uid()))
 then raise exception 'Profile not found'; end if;
 update public.users set profiles_id=target_profile_id,updated_at=now() where id=(select auth.uid());
end; $$;
revoke all on function public.set_default_applicant_profile(uuid) from public,anon;
grant execute on function public.set_default_applicant_profile(uuid) to authenticated;
-- Update sign-up trigger for the new owner column.
create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles (id,user_id,email,full_name,profile_name)
 values (new.id,new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data ->> 'full_name',''),'Main Profile')
 on conflict (id) do nothing;
 insert into public.users (id,email,level,profiles_id)
 values (new.id,coalesce(new.email,''),'user',new.id)
 on conflict (id) do nothing;
 return new;
end; $$;
-- Email changes synchronize ONLY the account's primary profile.
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 update public.profiles set email=coalesce(new.email,''),updated_at=now() where id=new.id;
 update public.users set email=coalesce(new.email,''),updated_at=now() where id=new.id;
 return new;
end; $$;
commit;
