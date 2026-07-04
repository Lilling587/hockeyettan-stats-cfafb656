
-- Settings table
CREATE TABLE IF NOT EXISTS public.vmix_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vmix_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vmix_settings TO authenticated;
GRANT ALL ON public.vmix_settings TO service_role;

ALTER TABLE public.vmix_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read vmix settings"
  ON public.vmix_settings FOR SELECT USING (true);

CREATE POLICY "Admins can insert vmix settings"
  ON public.vmix_settings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update vmix settings"
  ON public.vmix_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete vmix settings"
  ON public.vmix_settings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.vmix_settings (key, value) VALUES
  ('asset_base_url', 'http://192.168.1.235:8765'),
  ('club_id', '570'),
  ('lineup_version', '0')
ON CONFLICT (key) DO NOTHING;

CREATE TRIGGER vmix_settings_set_updated_at
  BEFORE UPDATE ON public.vmix_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Switch publications to slot-based lineups
ALTER TABLE public.vmix_publications DROP COLUMN IF EXISTS home_lineup_json;
ALTER TABLE public.vmix_publications DROP COLUMN IF EXISTS away_lineup_json;

ALTER TABLE public.vmix_publications
  ADD COLUMN home_slots JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN away_slots JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN home_team_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN away_team_code TEXT NOT NULL DEFAULT '';
