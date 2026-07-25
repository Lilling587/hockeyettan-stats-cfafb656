
DROP POLICY IF EXISTS "Public can read game events cache" ON public.game_events_cache;
REVOKE SELECT ON public.game_events_cache FROM anon;

DROP POLICY IF EXISTS "team-logos admin read" ON storage.objects;
DROP POLICY IF EXISTS "team-logos admin insert" ON storage.objects;
DROP POLICY IF EXISTS "team-logos admin update" ON storage.objects;
DROP POLICY IF EXISTS "team-logos admin delete" ON storage.objects;
DROP POLICY IF EXISTS "team-logos public read" ON storage.objects;
DROP POLICY IF EXISTS "team-logos read" ON storage.objects;
DROP POLICY IF EXISTS "team-logos insert" ON storage.objects;
DROP POLICY IF EXISTS "team-logos update" ON storage.objects;
DROP POLICY IF EXISTS "team-logos delete" ON storage.objects;

DROP POLICY IF EXISTS "logos admin read" ON storage.objects;
DROP POLICY IF EXISTS "logos admin insert" ON storage.objects;
DROP POLICY IF EXISTS "logos admin update" ON storage.objects;
DROP POLICY IF EXISTS "logos admin delete" ON storage.objects;
DROP POLICY IF EXISTS "logos admin select" ON storage.objects;
DROP POLICY IF EXISTS "logos public read" ON storage.objects;
