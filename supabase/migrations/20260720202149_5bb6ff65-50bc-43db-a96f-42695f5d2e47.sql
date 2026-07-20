-- Restore Data API grants on vmix_publications after prior revoke.
-- anon: read-only access to non-sensitive columns (notes, published_by excluded).
-- authenticated: full CRUD (RLS still restricts to admins for writes).
-- service_role: bypass for server jobs.
GRANT SELECT (id, game_date, home_team, away_team, home_team_code, away_team_code, venue, standings_json, home_slots, away_slots, is_active, published_at, updated_at) ON public.vmix_publications TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vmix_publications TO authenticated;
GRANT ALL ON public.vmix_publications TO service_role;