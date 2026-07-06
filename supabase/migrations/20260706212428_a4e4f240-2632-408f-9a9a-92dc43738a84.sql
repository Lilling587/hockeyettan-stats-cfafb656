
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_logos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.team_logos TO anon;
GRANT ALL ON public.team_logos TO service_role;

CREATE POLICY "Admins manage team logos"
  ON public.team_logos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can upsert cached logos"
  ON public.team_logos
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can update cached logos"
  ON public.team_logos
  FOR UPDATE TO anon, authenticated
  USING (true) WITH CHECK (true);
