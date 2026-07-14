CREATE POLICY "Public can read game events cache" ON public.game_events_cache FOR SELECT TO anon USING (true);
GRANT SELECT ON public.game_events_cache TO anon;