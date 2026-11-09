-- Version 1.3: align existing installation with the Supabase schema visualizer.
-- Run ONLY after 001, 002, 003 on an existing 1.2 database.
-- Does not delete applications, users, profiles, resumes or files.

alter table public.resumes add column if not exists profile_id uuid;
update public.resumes r set profile_id = u.profiles_id
from public.users u where r.user_id=u.id and r.profile_id is null;
-- Some pre-existing users may not yet have an account row.
update public.resumes r set profile_id = r.user_id
where profile_id is null and exists (select 1 from public.profiles p where p.id=r.user_id);
alter table public.resumes drop constraint if exists resumes_profile_id_fkey;
alter table public.resumes add constraint resumes_profile_id_fkey
 foreign key (profile_id) references public.profiles(id) on delete cascade;
create index if not exists resumes_profile_id_idx on public.resumes(profile_id);

alter table public.applications add column if not exists resume_id uuid;
-- Reconcile old text resume_name values, if that legacy column exists.
do $$ begin
 if exists (select 1 from information_schema.columns where table_schema='public' and table_name='applications' and column_name='resume_name') then
  execute 'update public.applications a set resume_id=r.id from public.resumes r where a.user_id=r.user_id and a.resume_name=r.name and a.resume_id is null';
 end if;
end $$;
alter table public.applications drop constraint if exists applications_resume_id_fkey;
alter table public.applications add constraint applications_resume_id_fkey
 foreign key (resume_id) references public.resumes(id) on delete set null;
create index if not exists applications_resume_id_idx on public.applications(resume_id);

-- Existing columns such as remote_type and resume_name are intentionally left
-- untouched to avoid data loss. The new API no longer depends on either.
-- All owner RLS policies remain in force; this patch grants no new privileges.
-- Ensure the authenticated client can read the related resume row via its existing RLS.
