
CREATE POLICY "logos admin read" ON storage.objects FOR SELECT
USING (bucket_id = 'logos' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "logos admin insert" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'logos' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "logos admin update" ON storage.objects FOR UPDATE
USING (bucket_id = 'logos' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'))
WITH CHECK (bucket_id = 'logos' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "logos admin delete" ON storage.objects FOR DELETE
USING (bucket_id = 'logos' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'));
