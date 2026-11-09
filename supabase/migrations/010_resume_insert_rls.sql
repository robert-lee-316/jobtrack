-- Resume and application inserts need a permissive owner policy.
-- The membership rules added earlier are restrictive, and a restrictive policy alone rejects every new row.
-- Run once in the Supabase SQL editor. Safe to run again.
BEGIN;

CREATE OR REPLACE FUNCTION public.owns_applicant_profile(target_profile_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT target_profile_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(u.profiles::jsonb, '[]'::jsonb)) AS v(profile_id)
      WHERE v.profile_id = target_profile_id::text
    )
 );
$$;
REVOKE ALL ON FUNCTION public.owns_applicant_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_applicant_profile(uuid) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;

DO $drop_resume_policies$
DECLARE policy_name text;
BEGIN
  FOR policy_name IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'resumes'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.resumes', policy_name);
  END LOOP;
  FOR policy_name IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'applications'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.applications', policy_name);
  END LOOP;
END
$drop_resume_policies$;

ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_res_select ON public.resumes FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY owner_res_insert ON public.resumes FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY owner_res_update ON public.resumes FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY owner_res_delete ON public.resumes FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY resumes_profile_membership_insert ON public.resumes AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.owns_applicant_profile(profile_id));
CREATE POLICY resumes_profile_membership_update ON public.resumes AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (public.owns_applicant_profile(profile_id));

CREATE POLICY owner_app_select ON public.applications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY owner_app_insert ON public.applications FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY owner_app_update ON public.applications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY owner_app_delete ON public.applications FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY applications_profile_membership_insert ON public.applications AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (public.owns_applicant_profile(profile_id));
CREATE POLICY applications_profile_membership_update ON public.applications AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (public.owns_applicant_profile(profile_id));

COMMIT;
