ALTER TABLE public.vmix_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read vmix audit log"
  ON public.vmix_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));