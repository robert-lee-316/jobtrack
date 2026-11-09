-- public.users.members is a JSON array of user id strings.
-- user:    only that user's own id
-- manager: several user ids, assigned explicitly and kept as stored
-- admin:   every user id except the admin's own id
-- Run once in the Supabase SQL editor. Safe to run again.
BEGIN;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS members json;

UPDATE public.users SET members = '[]'::json WHERE members IS NULL;

ALTER TABLE public.users ALTER COLUMN members SET DEFAULT '[]'::json;
ALTER TABLE public.users ALTER COLUMN members SET NOT NULL;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_members_json_array;
ALTER TABLE public.users ADD CONSTRAINT users_members_json_array CHECK (json_typeof(members) = 'array');

DO $level_check$
DECLARE cons text;
BEGIN
  FOR cons IN
    SELECT con.conname
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'users'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%level%'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', cons);
  END LOOP;
END
$level_check$;

ALTER TABLE public.users ADD CONSTRAINT users_level_check CHECK (level IN ('user', 'manager', 'admin'));

CREATE OR REPLACE FUNCTION public.refresh_user_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.users AS account
  SET members = CASE account.level
    WHEN 'admin' THEN COALESCE((
      SELECT json_agg(other.id::text ORDER BY other.created_at, other.id)
      FROM public.users AS other
      WHERE other.id <> account.id
    ), '[]'::json)
    WHEN 'manager' THEN COALESCE((
      SELECT json_agg(kept.member_id ORDER BY kept.member_id)
      FROM (
        SELECT DISTINCT v.member_id
        FROM json_array_elements_text(COALESCE(account.members, '[]'::json)) AS v(member_id)
        JOIN public.users AS known ON known.id::text = v.member_id
      ) AS kept
    ), '[]'::json)
    ELSE json_build_array(account.id::text)
  END
  WHERE account.id IS NOT NULL;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS users_refresh_members ON public.users;
CREATE TRIGGER users_refresh_members
AFTER INSERT OR DELETE OR UPDATE OF level
ON public.users
FOR EACH STATEMENT
EXECUTE FUNCTION public.refresh_user_members();

-- Fill the column for rows that already exist. The trigger maintains it afterward.
UPDATE public.users AS account
SET members = CASE account.level
  WHEN 'admin' THEN COALESCE((
    SELECT json_agg(other.id::text ORDER BY other.created_at, other.id)
    FROM public.users AS other
    WHERE other.id <> account.id
  ), '[]'::json)
  WHEN 'manager' THEN COALESCE((
    SELECT json_agg(kept.member_id ORDER BY kept.member_id)
    FROM (
      SELECT DISTINCT v.member_id
      FROM json_array_elements_text(COALESCE(account.members, '[]'::json)) AS v(member_id)
      JOIN public.users AS known ON known.id::text = v.member_id
    ) AS kept
  ), '[]'::json)
  ELSE json_build_array(account.id::text)
END
WHERE account.id IS NOT NULL;

-- A manager's list is not everyone and not only themselves. An admin assigns those user ids.
CREATE OR REPLACE FUNCTION public.set_manager_members(target_user_id uuid, member_ids json)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE caller_level text; stored json;
BEGIN
  IF public.request_user_id() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT level INTO caller_level FROM public.users WHERE id = public.request_user_id();
  IF caller_level IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Only an admin can assign manager members'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = target_user_id AND level = 'manager') THEN
    RAISE EXCEPTION 'Members can be assigned only for a manager';
  END IF;
  IF json_typeof(member_ids) <> 'array' THEN RAISE EXCEPTION 'members must be a JSON array of user ids'; END IF;
  IF (SELECT count(DISTINCT v.member_id) FROM json_array_elements_text(member_ids) AS v(member_id)) < 2 THEN
    RAISE EXCEPTION 'A manager members list must contain several user ids';
  END IF;
  IF EXISTS (
    SELECT 1 FROM json_array_elements_text(member_ids) AS v(member_id)
    WHERE NOT EXISTS (SELECT 1 FROM public.users AS known WHERE known.id::text = v.member_id)
  ) THEN RAISE EXCEPTION 'Every member id must be an existing user'; END IF;
  UPDATE public.users
  SET members = (
    SELECT json_agg(DISTINCT v.member_id ORDER BY v.member_id)
    FROM json_array_elements_text(member_ids) AS v(member_id)
  ), updated_at = now()
  WHERE id = target_user_id
  RETURNING members INTO stored;
  RETURN stored;
END;
$$;
REVOKE ALL ON FUNCTION public.set_manager_members(uuid, json) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_manager_members(uuid, json) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.provision_jobtrack_account(account_id uuid, account_email text, account_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF account_id IS NULL THEN
    RAISE EXCEPTION 'Account id is required';
  END IF;
  PERFORM account_name;
  INSERT INTO public.users (id, email, level, profiles, members)
  VALUES (account_id, coalesce(account_email, ''), 'user', '[]'::json, json_build_array(account_id::text))
  ON CONFLICT (id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.provision_jobtrack_account(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_jobtrack_account(uuid, text, text) TO anon, authenticated;

COMMIT;
