CREATE POLICY "team-logos admin read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'team-logos' AND public.has_role(auth.uid(), 'admin'::public.app_role));