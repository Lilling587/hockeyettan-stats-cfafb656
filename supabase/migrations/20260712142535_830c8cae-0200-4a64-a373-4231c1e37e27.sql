CREATE TABLE public.vmix_lineup_presets (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_slots JSONB NOT NULL,
  away_slots JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.vmix_lineup_presets TO authenticated;
GRANT ALL ON public.vmix_lineup_presets TO service_role;

ALTER TABLE public.vmix_lineup_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage lineup presets"
  ON public.vmix_lineup_presets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));