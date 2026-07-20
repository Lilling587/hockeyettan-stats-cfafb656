
-- Restrict public reads of vmix_publications to non-sensitive columns only.
-- Drop the broad public SELECT and re-create scoped to anon/authenticated,
-- and revoke column-level SELECT on sensitive fields from anon.

DROP POLICY IF EXISTS "Anyone can read active vmix publications" ON public.vmix_publications;

CREATE POLICY "Public can read active vmix publications"
  ON public.vmix_publications
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Revoke sensitive columns from anon (broadcast consumers). Admins keep full
-- access via their has_role SELECT policy on authenticated role.
REVOKE SELECT ON public.vmix_publications FROM anon;
GRANT SELECT (
  id, game_date, home_team, away_team, venue, standings_json, is_active,
  published_at, updated_at, home_slots, away_slots, home_team_code, away_team_code
) ON public.vmix_publications TO anon;
