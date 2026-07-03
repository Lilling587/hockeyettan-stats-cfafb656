DROP POLICY IF EXISTS "Authenticated can upload team logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update team logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete team logos" ON storage.objects;
DROP POLICY IF EXISTS "Public can read team logos" ON storage.objects;

CREATE POLICY "team-logos read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'team-logos');

CREATE POLICY "team-logos insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'team-logos');

CREATE POLICY "team-logos update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'team-logos')
  WITH CHECK (bucket_id = 'team-logos');

CREATE POLICY "team-logos delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'team-logos');