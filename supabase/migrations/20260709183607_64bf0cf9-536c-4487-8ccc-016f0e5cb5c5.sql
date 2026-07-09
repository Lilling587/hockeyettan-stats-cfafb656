DROP POLICY IF EXISTS "Admins can read vmix-assets" ON storage.objects;
CREATE POLICY "Admins can read vmix-assets"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'vmix-assets'
  AND EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'::public.app_role
  )
);