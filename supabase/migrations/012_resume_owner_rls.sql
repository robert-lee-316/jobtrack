-- Resume upload was rejected with:
-- new row violates row-level security policy (USING expression) for table "resumes"
-- A resume already stored for the profile failed the UPDATE policy when its user_id
-- did not match the local account. Run once in the Supabase SQL editor.
BEGIN;

UPDATE public.resumes AS r
SET user_id = owner.id
FROM public.users AS owner
WHERE r.profile_id IS NOT NULL
  AND r.user_id IS DISTINCT FROM owner.id
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(COALESCE(owner.profiles::jsonb, '[]'::jsonb)) AS member(profile_id)
    WHERE member.profile_id = r.profile_id::text
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.users AS other
    WHERE other.id <> owner.id
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(other.profiles::jsonb, '[]'::jsonb)) AS member(profile_id)
        WHERE member.profile_id = r.profile_id::text
      )
  );

DO $drop_resume_policies$
DECLARE policy_name text;
BEGIN
  FOR policy_name IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'resumes'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.resumes', policy_name);
  END LOOP;
END
$drop_resume_policies$;

ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resumes TO anon, authenticated;

CREATE POLICY owner_res_select ON public.resumes FOR SELECT TO anon, authenticated
  USING (user_id = public.request_user_id() OR public.owns_applicant_profile(profile_id));
CREATE POLICY owner_res_insert ON public.resumes FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = public.request_user_id() AND public.owns_applicant_profile(profile_id));
CREATE POLICY owner_res_update ON public.resumes FOR UPDATE TO anon, authenticated
  USING (user_id = public.request_user_id() OR public.owns_applicant_profile(profile_id))
  WITH CHECK (user_id = public.request_user_id() AND public.owns_applicant_profile(profile_id));
CREATE POLICY owner_res_delete ON public.resumes FOR DELETE TO anon, authenticated
  USING (user_id = public.request_user_id() OR public.owns_applicant_profile(profile_id));

COMMIT;
