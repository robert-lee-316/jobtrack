-- Copy every Supabase Auth signup into public.users.
-- Do not create an applicant profile here, and do not store public.users.id in public.users.profiles.
-- Profile rows are created from My Profiles. That insert generates public.profiles.id
-- and appends only that id to public.users.profiles.
-- Safe to run again on the current database. Back up first.
BEGIN;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_profiles_id_fkey;

DO $relax_profiles_id$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'profiles_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.users ALTER COLUMN profiles_id DROP NOT NULL';
  END IF;
END
$relax_profiles_id$;

CREATE OR REPLACE FUNCTION public.provision_jobtrack_account(account_id uuid, account_email text, account_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_cols text := 'id, email';
  user_vals text;
  profiles_type text;
BEGIN
  IF account_id IS NULL THEN
    RAISE EXCEPTION 'Account id is required';
  END IF;

  -- account_name is kept so the signup trigger signature stays stable. Names are entered on My Profiles.
  user_vals := format('%L, %L', account_id, coalesce(account_email, ''));

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'level'
  ) THEN
    user_cols := user_cols || ', level';
    user_vals := user_vals || ', ' || quote_literal('user');
  END IF;

  SELECT c.data_type INTO profiles_type
  FROM information_schema.columns AS c
  WHERE c.table_schema = 'public' AND c.table_name = 'users' AND c.column_name = 'profiles';

  IF profiles_type IS NOT NULL THEN
    user_cols := user_cols || ', profiles';
    user_vals := user_vals || ', ' || quote_literal('[]') || '::' || CASE WHEN profiles_type = 'jsonb' THEN 'jsonb' ELSE 'json' END;
  END IF;

  EXECUTE 'INSERT INTO public.users (' || user_cols || ') VALUES (' || user_vals || ') ON CONFLICT (id) DO NOTHING';
END;
$$;

REVOKE ALL ON FUNCTION public.provision_jobtrack_account(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- Creating a profile from My Profiles inserts public.profiles (its own id) and stores that id.
CREATE OR REPLACE FUNCTION public.create_applicant_profile(profile_data jsonb)
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE applicant public.profiles; account_id uuid := (SELECT auth.uid());
BEGIN
 IF account_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF jsonb_typeof(profile_data) <> 'object' THEN RAISE EXCEPTION 'Invalid profile data'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(profile_data) k WHERE k NOT IN
 ('profile_name','email','full_name','location','date_of_birth','full_address','address_line_2','city','state_region','postal_code','country','phone_number','bio'))
 THEN RAISE EXCEPTION 'Unsupported profile field'; END IF;
 PERFORM 1 FROM public.users WHERE id=account_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
 INSERT INTO public.profiles (profile_name,email,full_name,location,date_of_birth,full_address,address_line_2,city,state_region,postal_code,country,phone_number,bio)
 VALUES (
  COALESCE(NULLIF(btrim(profile_data->>'profile_name'),''),'New Profile'),
  COALESCE(profile_data->>'email',''), COALESCE(profile_data->>'full_name',''),
  COALESCE(profile_data->>'location',''), NULLIF(profile_data->>'date_of_birth','')::date,
  COALESCE(profile_data->>'full_address',''), COALESCE(profile_data->>'address_line_2',''),
  COALESCE(profile_data->>'city',''), COALESCE(profile_data->>'state_region',''),
  COALESCE(profile_data->>'postal_code',''), COALESCE(profile_data->>'country',''),
  COALESCE(profile_data->>'phone_number',''), COALESCE(profile_data->>'bio','')
 ) RETURNING * INTO applicant;
 UPDATE public.users
 SET profiles = (COALESCE(profiles::jsonb, '[]'::jsonb) || jsonb_build_array(applicant.id::text))::json,
     updated_at = now()
 WHERE id = account_id;
 RETURN applicant;
END; $$;
REVOKE ALL ON FUNCTION public.create_applicant_profile(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_applicant_profile(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.provision_jobtrack_account(
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name'
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_profile_for_new_user() FROM PUBLIC, anon, authenticated;

-- A leftover sync trigger that still references profiles.user_id breaks signup after that column is gone.
DO $drop_stale$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id'
  ) THEN
    DROP TRIGGER IF EXISTS sync_account_profile_ids_trigger ON public.profiles;
  END IF;
END
$drop_stale$;

DROP TRIGGER IF EXISTS on_auth_user_created_jobtrack ON auth.users;
CREATE TRIGGER on_auth_user_created_jobtrack
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_new_user();

-- Accounts that already exist in Authentication but were never copied.
DO $backfill$
DECLARE
  account record;
BEGIN
  FOR account IN
    SELECT id, email, raw_user_meta_data FROM auth.users
  LOOP
    PERFORM public.provision_jobtrack_account(
      account.id,
      account.email,
      account.raw_user_meta_data ->> 'full_name'
    );
  END LOOP;
END
$backfill$;

-- Remove public.users.id from public.users.profiles.
-- If that same id is a real profile still used by applications or resumes, give the profile
-- its own id and store that public.profiles.id instead. Unused signup copies are deleted.
DO $fix_membership$
DECLARE
  account record;
  fresh_id uuid;
  col_list text;
  linked boolean;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO col_list
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name <> 'id';

  FOR account IN
    SELECT u.id
    FROM public.users u
    WHERE EXISTS (
      SELECT 1
      FROM json_array_elements_text(COALESCE(u.profiles, '[]'::json)) AS v(profile_id)
      WHERE v.profile_id = u.id::text
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
  LOOP
    fresh_id := NULL;
    linked := EXISTS (SELECT 1 FROM public.applications WHERE profile_id = account.id)
           OR EXISTS (SELECT 1 FROM public.resumes WHERE profile_id = account.id);

    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = account.id) THEN
      IF linked AND col_list IS NOT NULL THEN
        fresh_id := gen_random_uuid();
        EXECUTE format(
          'INSERT INTO public.profiles (id, %s) SELECT $1, %s FROM public.profiles WHERE id = $2',
          col_list, col_list
        ) USING fresh_id, account.id;
        UPDATE public.applications SET profile_id = fresh_id WHERE profile_id = account.id;
        UPDATE public.resumes SET profile_id = fresh_id WHERE profile_id = account.id;
      END IF;
      DELETE FROM public.profiles WHERE id = account.id;
    END IF;

    UPDATE public.users AS u
    SET profiles = COALESCE((
      SELECT json_agg(chosen.profile_id ORDER BY chosen.ord)
      FROM (
        SELECT
          CASE
            WHEN v.profile_id = account.id::text AND fresh_id IS NOT NULL THEN fresh_id::text
            ELSE v.profile_id
          END AS profile_id,
          v.ord
        FROM json_array_elements_text(COALESCE(u.profiles, '[]'::json)) WITH ORDINALITY AS v(profile_id, ord)
        WHERE v.profile_id <> account.id::text OR fresh_id IS NOT NULL
      ) AS chosen
    ), '[]'::json)
    WHERE u.id = account.id;
  END LOOP;
END
$fix_membership$;

COMMIT;
