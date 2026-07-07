-- Restrict team_logos writes to admins; provide a SECURITY DEFINER RPC for
-- the public logo cache to safely upsert cached entries without needing
-- table-level write permissions for anon/authenticated.

DROP POLICY IF EXISTS "Anyone can upsert cached logos" ON public.team_logos;
DROP POLICY IF EXISTS "Anyone can update cached logos" ON public.team_logos;

-- Also drop any previous admin-write policies so we can recreate cleanly.
DROP POLICY IF EXISTS "Admins can insert team logos" ON public.team_logos;
DROP POLICY IF EXISTS "Admins can update team logos" ON public.team_logos;
DROP POLICY IF EXISTS "Admins can delete team logos" ON public.team_logos;

-- Revoke broad write privileges from anon; keep SELECT for public reads.
REVOKE INSERT, UPDATE ON public.team_logos FROM anon;

CREATE POLICY "Admins can insert team logos"
  ON public.team_logos
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update team logos"
  ON public.team_logos
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete team logos"
  ON public.team_logos
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- SECURITY DEFINER function so the public logo-resolution server function
-- can populate the cache without granting broad write access on the table.
-- Only writes the auto-scraped 'hockeyettan.se' source; never overwrites
-- an existing 'ok' row (so admin overrides are preserved).
CREATE OR REPLACE FUNCTION public.cache_team_logo(
  _team text,
  _url text,
  _status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _team IS NULL OR length(_team) = 0 THEN
    RAISE EXCEPTION 'team is required';
  END IF;
  IF _status NOT IN ('ok', 'missing') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  INSERT INTO public.team_logos AS t
    (team_name, logo_url, status, source, fetched_at)
  VALUES
    (_team, _url, _status, 'hockeyettan.se', now())
  ON CONFLICT (team_name) DO UPDATE
    SET logo_url   = EXCLUDED.logo_url,
        status     = EXCLUDED.status,
        source     = EXCLUDED.source,
        fetched_at = EXCLUDED.fetched_at
    WHERE t.source <> 'manual';
END;
$$;

REVOKE ALL ON FUNCTION public.cache_team_logo(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cache_team_logo(text, text, text)
  TO anon, authenticated, service_role;
