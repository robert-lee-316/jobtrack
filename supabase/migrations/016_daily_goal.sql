-- Daily application goal belongs to an applicant profile. Default is 100.
-- Only a manager or admin can change a profile they own or that belongs to one of their members.
-- Run again if an earlier version stored the goal on public.users.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_daily_goal_check;
ALTER TABLE public.users DROP COLUMN IF EXISTS daily_goal;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_goal integer NOT NULL DEFAULT 100;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_daily_goal_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_daily_goal_check CHECK (daily_goal IN (0, 25, 50, 75, 100, 125));

DROP FUNCTION IF EXISTS public.set_daily_goal(integer);

CREATE OR REPLACE FUNCTION public.set_daily_goal(target_profile uuid, next_goal integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_id uuid := public.request_user_id();
  caller_level text;
  caller_members json;
BEGIN
  IF target_profile IS NULL THEN
    RAISE EXCEPTION 'Choose a profile';
  END IF;
  IF next_goal IS NULL OR next_goal NOT IN (0, 25, 50, 75, 100, 125) THEN
    RAISE EXCEPTION 'Daily goal must be 0, 25, 50, 75, 100, or 125';
  END IF;
  SELECT level, members INTO caller_level, caller_members
  FROM public.users
  WHERE id = caller_id;
  IF caller_level IS NULL OR caller_level NOT IN ('manager', 'admin') THEN
    RAISE EXCEPTION 'Only a manager or admin can change the daily goal';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.users AS owner
    WHERE target_profile::text IN (
      SELECT listed.profile_id
      FROM json_array_elements_text(COALESCE(owner.profiles, '[]'::json)) AS listed(profile_id)
    )
    AND (
      owner.id = caller_id
      OR owner.id::text IN (SELECT json_array_elements_text(COALESCE(caller_members, '[]'::json)))
    )
  ) THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
  UPDATE public.profiles
  SET daily_goal = next_goal,
      updated_at = now()
  WHERE id = target_profile;
  RETURN next_goal;
END;
$$;

REVOKE ALL ON FUNCTION public.set_daily_goal(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.set_daily_goal(uuid, integer) TO anon, authenticated;

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
            'daily_goal', profile.daily_goal,
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
