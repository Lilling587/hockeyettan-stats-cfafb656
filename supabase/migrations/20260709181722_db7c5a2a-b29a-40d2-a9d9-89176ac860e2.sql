-- RLS policies for vmix-assets bucket
CREATE POLICY "Public can read vmix-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'vmix-assets');

CREATE POLICY "Admins can upload vmix-assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'vmix-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update vmix-assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'vmix-assets' AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (bucket_id = 'vmix-assets' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete vmix-assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'vmix-assets' AND public.has_role(auth.uid(), 'admin'));