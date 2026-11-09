-- Execute in Supabase SQL Editor. Idempotent on first clean project.
create extension if not exists pgcrypto;
create table if not exists public.applications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 company text not null check (char_length(company) between 1 and 200),
 job_title text not null check (char_length(job_title) between 1 and 300),
 platform text not null default 'Other',
 job_url text not null default '',
 location text not null default '',
 remote_type text not null default 'Unknown' check (remote_type in ('Remote','Hybrid','Onsite','Unknown')),
 salary text not null default '',
 employment_type text not null default '',
 description text not null default '',
 technologies text[] not null default '{}',
 status text not null default 'Saved' check(status in ('Saved','Applied','Screening','Interview','Offer','Rejected','Withdrawn')),
 resume_name text not null default '',
 notes text not null default '',
 applied_at date,
 next_action_at date,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists app_user_created_idx on public.applications(user_id,created_at desc);
create index if not exists app_user_status_idx on public.applications(user_id,status);
create unique index if not exists app_user_url_unique on public.applications(user_id,job_url) where job_url <> '';
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists app_touch on public.applications;
create trigger app_touch before update on public.applications for each row execute function public.touch_updated_at();
alter table public.applications enable row level security;
drop policy if exists "owner_app_select" on public.applications;
drop policy if exists "owner_app_insert" on public.applications;
drop policy if exists "owner_app_update" on public.applications;
drop policy if exists "owner_app_delete" on public.applications;
create policy "owner_app_select" on public.applications for select to authenticated using (user_id = (select auth.uid()));
create policy "owner_app_insert" on public.applications for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner_app_update" on public.applications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner_app_delete" on public.applications for delete to authenticated using (user_id = (select auth.uid()));
create table if not exists public.resumes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (name in ('Frontend_Resume','Node_Resume','Node_Python_Resume','Python_Resume','Java_Resume','.NET_Resume','GO_Resume','AI_ML_Resume')),
 file_path text not null, file_name text not null, uploaded_at timestamptz not null default now(),
 unique(user_id,name)
);
alter table public.resumes enable row level security;
drop policy if exists "owner_res_select" on public.resumes;
drop policy if exists "owner_res_insert" on public.resumes;
drop policy if exists "owner_res_update" on public.resumes;
drop policy if exists "owner_res_delete" on public.resumes;
create policy "owner_res_select" on public.resumes for select to authenticated using (user_id = (select auth.uid()));
create policy "owner_res_insert" on public.resumes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "owner_res_update" on public.resumes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owner_res_delete" on public.resumes for delete to authenticated using (user_id = (select auth.uid()));
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('resumes','resumes',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "resume_file_read" on storage.objects;
drop policy if exists "resume_file_upload" on storage.objects;
drop policy if exists "resume_file_update" on storage.objects;
drop policy if exists "resume_file_delete" on storage.objects;
create policy "resume_file_read" on storage.objects for select to authenticated using (bucket_id='resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "resume_file_upload" on storage.objects for insert to authenticated with check (bucket_id='resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "resume_file_update" on storage.objects for update to authenticated using (bucket_id='resumes' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id='resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "resume_file_delete" on storage.objects for delete to authenticated using (bucket_id='resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
