-- v1.5.1: profiles have no user_id. Membership is stored in public.users.profiles (JSON array of UUID strings).
-- Run once AFTER 006_sync_user_profile_ids.sql. Back up your database before applying.
BEGIN;
-- Stop the legacy trigger before removing its referenced column.
DROP TRIGGER IF EXISTS sync_account_profile_ids_trigger ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_account_profile_ids();
DROP FUNCTION IF EXISTS public.refresh_account_profile_ids(uuid);

-- The old profiles.user_id column has ALREADY been removed on this installation.
-- Preserve users.profiles exactly as-is. Do not rebuild membership from a removed column.
 UPDATE public.users SET profiles = '[]'::json WHERE profiles IS NULL;

-- Existing owner+profile foreign keys must become ordinary profile FKs.
ALTER TABLE public.applications DROP CONSTRAINT IF EXISTS applications_owner_profile_fk;
ALTER TABLE public.resumes DROP CONSTRAINT IF EXISTS resumes_owner_profile_fk;
ALTER TABLE public.applications DROP CONSTRAINT IF EXISTS applications_profile_id_fkey;
ALTER TABLE public.resumes DROP CONSTRAINT IF EXISTS resumes_profile_id_fkey;
ALTER TABLE public.applications ADD CONSTRAINT applications_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
ALTER TABLE public.resumes ADD CONSTRAINT resumes_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
DROP INDEX IF EXISTS public.profiles_owner_id_unique;
DROP INDEX IF EXISTS public.profiles_user_id_idx;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS user_id;

-- Private membership: public.users cannot be directly edited by the authenticated role.
-- This function is used only in RLS policy evaluations and never trusts client-provided IDs.
CREATE OR REPLACE FUNCTION public.owns_applicant_profile(target_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM json_array_elements_text(u.profiles) AS v(profile_id)
                WHERE v.profile_id = target_profile_id::text)
 );
$$;
REVOKE ALL ON FUNCTION public.owns_applicant_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_applicant_profile(uuid) TO authenticated;

DROP POLICY IF EXISTS profiles_read_self ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
DROP POLICY IF EXISTS profiles_create_self ON public.profiles;
DROP POLICY IF EXISTS profiles_delete_self ON public.profiles;
-- Only existing member profiles may be read/edited. Insert/delete happens via safe RPC below.
CREATE POLICY profiles_read_self ON public.profiles FOR SELECT TO authenticated
 USING (public.owns_applicant_profile(id));
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
 USING (public.owns_applicant_profile(id)) WITH CHECK (public.owns_applicant_profile(id));
REVOKE INSERT, DELETE ON public.profiles FROM authenticated, anon;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;

-- Enforce membership for all direct application/resume writes, not only API routes.
DROP POLICY IF EXISTS applications_profile_membership_insert ON public.applications;
DROP POLICY IF EXISTS applications_profile_membership_update ON public.applications;
CREATE POLICY applications_profile_membership_insert ON public.applications AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (user_id = (SELECT auth.uid()) AND public.owns_applicant_profile(profile_id));
CREATE POLICY applications_profile_membership_update ON public.applications AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (user_id = (SELECT auth.uid()))
 WITH CHECK (user_id = (SELECT auth.uid()) AND public.owns_applicant_profile(profile_id));
DROP POLICY IF EXISTS resumes_profile_membership_insert ON public.resumes;
DROP POLICY IF EXISTS resumes_profile_membership_update ON public.resumes;
CREATE POLICY resumes_profile_membership_insert ON public.resumes AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (user_id = (SELECT auth.uid()) AND public.owns_applicant_profile(profile_id));
CREATE POLICY resumes_profile_membership_update ON public.resumes AS RESTRICTIVE FOR UPDATE TO authenticated
 USING (user_id = (SELECT auth.uid()))
 WITH CHECK (user_id = (SELECT auth.uid()) AND public.owns_applicant_profile(profile_id));

-- Atomic creation: insert a profile AND append its UUID to users.profiles in one transaction.
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
 UPDATE public.users SET profiles=(profiles::jsonb || jsonb_build_array(applicant.id::text))::json,updated_at=now() WHERE id=account_id;
 RETURN applicant;
END; $$;
REVOKE ALL ON FUNCTION public.create_applicant_profile(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_applicant_profile(jsonb) TO authenticated;

-- Atomic deletion: remove UUID from account JSON and delete only an owned, non-default, unreferenced profile.
CREATE OR REPLACE FUNCTION public.delete_applicant_profile(target_profile_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE account_id uuid := (SELECT auth.uid()); account_row public.users;
BEGIN
 IF account_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 SELECT * INTO account_row FROM public.users WHERE id=account_id FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM json_array_elements_text(account_row.profiles) AS x(id) WHERE x.id=target_profile_id::text)
 THEN RAISE EXCEPTION 'Profile not found in your account'; END IF;
 IF (account_row.profiles->>0)=target_profile_id::text THEN RAISE EXCEPTION 'Choose another default profile first'; END IF;
 IF EXISTS(SELECT 1 FROM public.applications WHERE profile_id=target_profile_id)
    OR EXISTS(SELECT 1 FROM public.resumes WHERE profile_id=target_profile_id)
 THEN RAISE EXCEPTION 'Profile has linked applications or resumes'; END IF;
 DELETE FROM public.profiles WHERE id=target_profile_id;
 UPDATE public.users SET profiles=COALESCE((
  SELECT json_agg(v.id) FROM json_array_elements_text(account_row.profiles) AS v(id)
  WHERE v.id<>target_profile_id::text
 ),'[]'::json),updated_at=now() WHERE id=account_id;
END; $$;
REVOKE ALL ON FUNCTION public.delete_applicant_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_applicant_profile(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_default_applicant_profile(target_profile_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF NOT public.owns_applicant_profile(target_profile_id) THEN RAISE EXCEPTION 'Profile not found'; END IF;
 UPDATE public.users u SET profiles=(jsonb_build_array(target_profile_id::text) || COALESCE((SELECT jsonb_agg(v.id) FROM jsonb_array_elements_text(u.profiles::jsonb) AS v(id) WHERE v.id<>target_profile_id::text),'[]'::jsonb))::json,updated_at=now() WHERE id=(SELECT auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.set_default_applicant_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_applicant_profile(uuid) TO authenticated;

-- New users get one default profile and its ID in the JSON array.
CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 INSERT INTO public.profiles (id,email,full_name,profile_name)
 VALUES(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data ->> 'full_name',''),'Main Profile')
 ON CONFLICT (id) DO NOTHING;
 INSERT INTO public.users (id,email,level,profiles)
 VALUES(new.id,coalesce(new.email,''),'user',json_build_array(new.id::text))
 ON CONFLICT (id) DO NOTHING;
 RETURN new;
END; $$;
COMMIT;
