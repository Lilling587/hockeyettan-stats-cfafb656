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
DECLARE
  v_url text;
BEGIN
  IF _team IS NULL OR length(_team) = 0 THEN
    RAISE EXCEPTION 'team is required';
  END IF;
  IF _status NOT IN ('ok', 'missing') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  v_url := CASE WHEN _status = 'missing' THEN NULL ELSE NULLIF(_url, '') END;

  INSERT INTO public.team_logos AS t
    (team_name, logo_url, status, source, fetched_at)
  VALUES
    (_team, v_url, _status, 'hockeyettan.se', now())
  ON CONFLICT (team_name) DO UPDATE
    SET logo_url   = EXCLUDED.logo_url,
        status     = EXCLUDED.status,
        source     = EXCLUDED.source,
        fetched_at = EXCLUDED.fetched_at
    WHERE t.source <> 'manual';
END;
$$;
