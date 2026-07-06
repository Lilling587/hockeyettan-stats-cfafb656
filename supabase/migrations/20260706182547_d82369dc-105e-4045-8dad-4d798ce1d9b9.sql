CREATE TABLE public.team_logo_codes (
  id SERIAL PRIMARY KEY,
  team_name TEXT NOT NULL UNIQUE,
  logo_code TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'scraped',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_logo_codes TO authenticated;
GRANT ALL ON public.team_logo_codes TO service_role;

ALTER TABLE public.team_logo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage team logo codes"
  ON public.team_logo_codes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));