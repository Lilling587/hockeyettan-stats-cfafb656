
-- 1) Restrict team-logos storage writes to admins only
DROP POLICY IF EXISTS "team-logos insert" ON storage.objects;
DROP POLICY IF EXISTS "team-logos update" ON storage.objects;
DROP POLICY IF EXISTS "team-logos delete" ON storage.objects;

CREATE POLICY "team-logos admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'team-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "team-logos admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'team-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'team-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "team-logos admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'team-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2) Restrict public reads of vmix_publications to active rows only; admins can read all
DROP POLICY IF EXISTS "Anyone can read vmix publications" ON public.vmix_publications;

CREATE POLICY "Anyone can read active vmix publications" ON public.vmix_publications
  FOR SELECT TO public
  USING (is_active = true);

CREATE POLICY "Admins can read all vmix publications" ON public.vmix_publications
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Revoke EXECUTE on SECURITY DEFINER helper functions from signed-in users.
-- These are only meant to be invoked by triggers, cron, or service_role.
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;
