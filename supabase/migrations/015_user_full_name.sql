-- public.users.full_name is the name shown for an account.
-- Signup requires it. Existing rows stay blank until the account signs in again.
-- Run once in the Supabase SQL editor. Safe to run again.
BEGIN;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS full_name text;
UPDATE public.users SET full_name = '' WHERE full_name IS NULL;
ALTER TABLE public.users ALTER COLUMN full_name SET DEFAULT '';
ALTER TABLE public.users ALTER COLUMN full_name SET NOT NULL;

CREATE OR REPLACE FUNCTION public.provision_jobtrack_account(account_id uuid, account_email text, account_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE stored_name text := btrim(coalesce(account_name, ''));
BEGIN
  IF account_id IS NULL THEN
    RAISE EXCEPTION 'Account id is required';
  END IF;
  INSERT INTO public.users (id, email, full_name, level, profiles, members)
  VALUES (account_id, coalesce(account_email, ''), stored_name, 'user', '[]'::json, json_build_array(account_id::text))
  ON CONFLICT (id) DO UPDATE
  SET full_name = CASE WHEN stored_name <> '' THEN stored_name ELSE public.users.full_name END,
      updated_at = now()
  WHERE public.users.id = EXCLUDED.id;
END;
$$;
REVOKE ALL ON FUNCTION public.provision_jobtrack_account(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_jobtrack_account(uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.member_workspace()
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT json_agg(
      json_build_object(
        'id', account.id,
        'email', account.email,
        'full_name', account.full_name,
        'profiles', COALESCE((
          SELECT json_agg(json_build_object(
            'id', profile.id,
            'profile_name', profile.profile_name,
            'full_name', profile.full_name,
            'email', profile.email,
            'created_at', profile.created_at
          ) ORDER BY profile.created_at, profile.id)
          FROM public.profiles AS profile
          WHERE profile.id::text IN (
            SELECT listed.profile_id
            FROM json_array_elements_text(COALESCE(account.profiles, '[]'::json)) AS listed(profile_id)
          )
        ), '[]'::json),
        'applications', COALESCE((
          SELECT json_agg(json_build_object(
            'id', app.id,
            'profile_id', app.profile_id,
            'status', app.status,
            'company', app.company,
            'job_title', app.job_title,
            'created_at', app.created_at,
            'applied_at', app.applied_at,
            'next_action_at', app.next_action_at
          ) ORDER BY app.created_at DESC)
          FROM (
            SELECT source.id, source.profile_id, source.status, source.company, source.job_title, source.created_at, source.applied_at, source.next_action_at
            FROM public.applications AS source
            WHERE source.user_id = account.id
               OR source.profile_id::text IN (
                 SELECT listed.profile_id
                 FROM json_array_elements_text(COALESCE(account.profiles, '[]'::json)) AS listed(profile_id)
               )
            ORDER BY source.created_at DESC
            LIMIT 500
          ) AS app
        ), '[]'::json),
        'resumes', COALESCE((
          SELECT json_agg(json_build_object('id', resume.id, 'profile_id', resume.profile_id))
          FROM public.resumes AS resume
          WHERE resume.user_id = account.id
             OR resume.profile_id::text IN (
               SELECT listed.profile_id
               FROM json_array_elements_text(COALESCE(account.profiles, '[]'::json)) AS listed(profile_id)
             )
        ), '[]'::json)
      )
      ORDER BY membership.ord
    )
    FROM public.users AS caller
    CROSS JOIN json_array_elements_text(COALESCE(caller.members, '[]'::json)) WITH ORDINALITY AS membership(member_id, ord)
    JOIN public.users AS account ON account.id::text = membership.member_id
    WHERE caller.id = public.request_user_id()
  ), '[]'::json);
$$;

REVOKE ALL ON FUNCTION public.member_workspace() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.member_workspace() TO anon, authenticated;

COMMIT;
