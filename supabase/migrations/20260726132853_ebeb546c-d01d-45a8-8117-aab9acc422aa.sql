-- Lock down writes to the public 'icons' bucket to admins only.
-- Public read access continues via the bucket's public flag (intentional for PWA icons).

CREATE POLICY "icons_admin_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'icons' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "icons_admin_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'icons' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'icons' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "icons_admin_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'icons' AND public.has_role(auth.uid(), 'admin'));