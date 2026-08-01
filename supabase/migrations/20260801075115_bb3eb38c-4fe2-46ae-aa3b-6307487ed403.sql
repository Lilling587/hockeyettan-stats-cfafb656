GRANT SELECT ON public.vmix_publications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vmix_publications TO authenticated;
GRANT ALL ON public.vmix_publications TO service_role;