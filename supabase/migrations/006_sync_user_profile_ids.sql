-- v1.5: public.users.profiles is the JSON array of applicant profile UUID strings.
-- Run AFTER 005_multiple_applicant_profiles.sql. Back up your database first.
-- Each profile remains a full row in public.profiles, owned by profiles.user_id.
BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS profiles json NOT NULL DEFAULT '[]'::json;
-- Make the stored format explicit; prevent objects, null, or other JSON types.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_profiles_json_array;
ALTER TABLE public.users ADD CONSTRAINT users_profiles_json_array CHECK (json_typeof(profiles) = 'array');

-- Rebuild IDs from ownership, rather than trusting user-submitted JSON.
CREATE OR REPLACE FUNCTION public.refresh_account_profile_ids(owner_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.users AS u SET profiles = COALESCE((
    SELECT json_agg(p.id::text ORDER BY p.created_at, p.id)
    FROM public.profiles AS p WHERE p.user_id = owner_id
  ), '[]'::json), updated_at = now()
  WHERE u.id = owner_id;
END; $$;
REVOKE ALL ON FUNCTION public.refresh_account_profile_ids(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_account_profile_ids()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Applicant profile owner cannot be changed';
  END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_account_profile_ids(OLD.user_id);
  ELSE
    PERFORM public.refresh_account_profile_ids(NEW.user_id);
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS sync_account_profile_ids_trigger ON public.profiles;
CREATE TRIGGER sync_account_profile_ids_trigger
AFTER INSERT OR DELETE OR UPDATE OF user_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_account_profile_ids();

-- Backfill existing accounts, including accounts with multiple profiles.
UPDATE public.users AS u SET profiles = COALESCE((
 SELECT json_agg(p.id::text ORDER BY p.created_at, p.id)
 FROM public.profiles AS p WHERE p.user_id = u.id
), '[]'::json);
COMMIT;
