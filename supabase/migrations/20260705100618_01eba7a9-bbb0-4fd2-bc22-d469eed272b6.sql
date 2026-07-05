DROP POLICY IF EXISTS "Anyone can read vmix settings" ON public.vmix_settings;
CREATE POLICY "Admins can read vmix settings" ON public.vmix_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
REVOKE SELECT ON public.vmix_settings FROM anon;