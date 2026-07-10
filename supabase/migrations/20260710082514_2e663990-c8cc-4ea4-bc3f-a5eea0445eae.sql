CREATE TABLE public.game_events_cache (
  game_id text PRIMARY KEY,
  season text NOT NULL,
  parsed jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.game_events_cache TO authenticated;
GRANT ALL ON public.game_events_cache TO service_role;

ALTER TABLE public.game_events_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read game events cache"
  ON public.game_events_cache
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX game_events_cache_season_idx ON public.game_events_cache (season);