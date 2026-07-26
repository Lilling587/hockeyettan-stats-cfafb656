-- Column-level restriction: anon may only read broadcast-safe columns
REVOKE SELECT ON public.vmix_publications FROM anon;
GRANT SELECT (
  id, game_date, home_team, away_team, home_team_code, away_team_code,
  venue, standings_json, home_slots, away_slots, is_active,
  published_at, updated_at
) ON public.vmix_publications TO anon;