
DROP POLICY IF EXISTS "Admins can upload vmix-assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update vmix-assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete vmix-assets" ON storage.objects;
DROP POLICY IF EXISTS "team-logos admin insert" ON storage.objects;
DROP POLICY IF EXISTS "team-logos admin update" ON storage.objects;
DROP POLICY IF EXISTS "team-logos admin delete" ON storage.objects;
DROP POLICY IF EXISTS "team-logos admin read" ON storage.objects;

CREATE POLICY "Admins can upload vmix-assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vmix-assets' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::public.app_role));
CREATE POLICY "Admins can update vmix-assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'vmix-assets' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'vmix-assets' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::public.app_role));
CREATE POLICY "Admins can delete vmix-assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'vmix-assets' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::public.app_role));

CREATE POLICY "team-logos admin insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'team-logos' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::public.app_role));
CREATE POLICY "team-logos admin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'team-logos' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::public.app_role))
  WITH CHECK (bucket_id = 'team-logos' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::public.app_role));
CREATE POLICY "team-logos admin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'team-logos' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::public.app_role));
CREATE POLICY "team-logos admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'team-logos' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'::public.app_role));

GRANT SELECT ON public.user_roles TO authenticated;
