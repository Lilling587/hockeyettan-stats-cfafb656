GRANT INSERT ON public.error_log TO authenticated;

CREATE POLICY "Admins can insert error logs"
ON public.error_log FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));