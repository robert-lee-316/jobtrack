-- Temporary replacement for Supabase Auth.
-- The API signs in locally and sends the account id in x-jobtrack-user-id.
-- Run once in the Supabase SQL editor. Safe to run again.
BEGIN;

CREATE OR REPLACE FUNCTION public.request_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT NULLIF(pg_catalog.current_setting('request.headers', true)::json->>'x-jobtrack-user-id', '')::uuid;
$$;
REVOKE ALL ON FUNCTION public.request_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_user_id() TO anon, authenticated;

-- Local account ids are not auth.users ids.
DO $drop_auth_fks$
DECLARE ref record;
BEGIN
  FOR ref IN
    SELECT con.conname AS constraint_name, rel.relname AS table_name
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    JOIN pg_class AS frel ON frel.oid = con.confrelid
    JOIN pg_namespace AS fnsp ON fnsp.oid = frel.relnamespace
    WHERE con.contype = 'f'
      AND nsp.nspname = 'public'
      AND fnsp.nspname = 'auth'
      AND frel.relname = 'users'
      AND rel.relname IN ('users', 'profiles', 'applications', 'resumes')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', ref.table_name, ref.constraint_name);
  END LOOP;
END
$drop_auth_fks$;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

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
  INSERT INTO public.users (id, email, level, profiles)
  VALUES (account_id, coalesce(account_email, ''), 'user', '[]'::json)
  ON CONFLICT (id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.provision_jobtrack_account(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_jobtrack_account(uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.owns_applicant_profile(target_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT target_profile_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users AS u
    WHERE u.id = public.request_user_id()
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(u.profiles::jsonb, '[]'::jsonb)) AS v(profile_id)
        WHERE v.profile_id = target_profile_id::text
      )
  );
$$;
REVOKE ALL ON FUNCTION public.owns_applicant_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_applicant_profile(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_applicant_profile(profile_data jsonb)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE applicant public.profiles; account_id uuid := public.request_user_id();
BEGIN
  IF account_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF jsonb_typeof(profile_data) <> 'object' THEN RAISE EXCEPTION 'Invalid profile data'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(profile_data) AS k WHERE k NOT IN
    ('profile_name','email','full_name','location','date_of_birth','full_address','address_line_2','city','state_region','postal_code','country','phone_number','bio'))
  THEN RAISE EXCEPTION 'Unsupported profile field'; END IF;
  PERFORM 1 FROM public.users WHERE id = account_id FOR UPDATE;
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
END;
$$;
REVOKE ALL ON FUNCTION public.create_applicant_profile(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_applicant_profile(jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.delete_applicant_profile(target_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE account_id uuid := public.request_user_id(); account_row public.users;
BEGIN
  IF account_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO account_row FROM public.users WHERE id = account_id FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM json_array_elements_text(account_row.profiles) AS x(id) WHERE x.id = target_profile_id::text)
  THEN RAISE EXCEPTION 'Profile not found in your account'; END IF;
  IF (account_row.profiles->>0) = target_profile_id::text THEN RAISE EXCEPTION 'Choose another default profile first'; END IF;
  IF EXISTS(SELECT 1 FROM public.applications WHERE profile_id = target_profile_id)
     OR EXISTS(SELECT 1 FROM public.resumes WHERE profile_id = target_profile_id)
  THEN RAISE EXCEPTION 'Profile has linked applications or resumes'; END IF;
  DELETE FROM public.profiles WHERE id = target_profile_id;
  UPDATE public.users SET profiles = COALESCE((
    SELECT json_agg(v.id) FROM json_array_elements_text(account_row.profiles) AS v(id)
    WHERE v.id <> target_profile_id::text
  ), '[]'::json), updated_at = now() WHERE id = account_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_applicant_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_applicant_profile(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_default_applicant_profile(target_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF public.request_user_id() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT public.owns_applicant_profile(target_profile_id) THEN RAISE EXCEPTION 'Profile not found'; END IF;
  UPDATE public.users AS u
  SET profiles = (jsonb_build_array(target_profile_id::text) || COALESCE((
        SELECT jsonb_agg(v.id) FROM jsonb_array_elements_text(u.profiles::jsonb) AS v(id)
        WHERE v.id <> target_profile_id::text
      ), '[]'::jsonb))::json,
      updated_at = now()
  WHERE id = public.request_user_id();
END;
$$;
REVOKE ALL ON FUNCTION public.set_default_applicant_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_default_applicant_profile(uuid) TO anon, authenticated;

GRANT SELECT ON public.users TO anon, authenticated;
GRANT SELECT, UPDATE ON public.profiles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumes TO anon, authenticated;

DO $drop_policies$
DECLARE policy_name text; target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['users','profiles','applications','resumes']
  LOOP
    FOR policy_name IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = target_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, target_table);
    END LOOP;
  END LOOP;
END
$drop_policies$;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_read_own ON public.users FOR SELECT TO anon, authenticated
  USING (id = public.request_user_id());
CREATE POLICY profiles_read_self ON public.profiles FOR SELECT TO anon, authenticated
  USING (public.owns_applicant_profile(id));
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO anon, authenticated
  USING (public.owns_applicant_profile(id)) WITH CHECK (public.owns_applicant_profile(id));

CREATE POLICY owner_app_select ON public.applications FOR SELECT TO anon, authenticated
  USING (user_id = public.request_user_id());
CREATE POLICY owner_app_insert ON public.applications FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = public.request_user_id());
CREATE POLICY owner_app_update ON public.applications FOR UPDATE TO anon, authenticated
  USING (user_id = public.request_user_id()) WITH CHECK (user_id = public.request_user_id());
CREATE POLICY owner_app_delete ON public.applications FOR DELETE TO anon, authenticated
  USING (user_id = public.request_user_id());
CREATE POLICY applications_profile_membership_insert ON public.applications AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (public.owns_applicant_profile(profile_id));
CREATE POLICY applications_profile_membership_update ON public.applications AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (user_id = public.request_user_id()) WITH CHECK (public.owns_applicant_profile(profile_id));

CREATE POLICY owner_res_select ON public.resumes FOR SELECT TO anon, authenticated
  USING (user_id = public.request_user_id() OR public.owns_applicant_profile(profile_id));
CREATE POLICY owner_res_insert ON public.resumes FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = public.request_user_id() AND public.owns_applicant_profile(profile_id));
CREATE POLICY owner_res_update ON public.resumes FOR UPDATE TO anon, authenticated
  USING (user_id = public.request_user_id() OR public.owns_applicant_profile(profile_id))
  WITH CHECK (user_id = public.request_user_id() AND public.owns_applicant_profile(profile_id));
CREATE POLICY owner_res_delete ON public.resumes FOR DELETE TO anon, authenticated
  USING (user_id = public.request_user_id() OR public.owns_applicant_profile(profile_id));

DROP POLICY IF EXISTS resume_file_read ON storage.objects;
DROP POLICY IF EXISTS resume_file_upload ON storage.objects;
DROP POLICY IF EXISTS resume_file_update ON storage.objects;
DROP POLICY IF EXISTS resume_file_delete ON storage.objects;
DROP POLICY IF EXISTS "resume_file_read" ON storage.objects;
DROP POLICY IF EXISTS "resume_file_upload" ON storage.objects;
DROP POLICY IF EXISTS "resume_file_update" ON storage.objects;
DROP POLICY IF EXISTS "resume_file_delete" ON storage.objects;
CREATE POLICY resume_file_read ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = public.request_user_id()::text);
CREATE POLICY resume_file_upload ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = public.request_user_id()::text);
CREATE POLICY resume_file_update ON storage.objects FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = public.request_user_id()::text)
  WITH CHECK (bucket_id = 'resumes' AND (storage.foldername(name))[1] = public.request_user_id()::text);
CREATE POLICY resume_file_delete ON storage.objects FOR DELETE TO anon, authenticated
  USING (bucket_id = 'resumes' AND (storage.foldername(name))[1] = public.request_user_id()::text);

COMMIT;
