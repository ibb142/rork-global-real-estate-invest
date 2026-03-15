-- Enable RLS on storage.objects (already enforced by Supabase; modify carefully)
-- Allow authenticated users to insert objects only when the path starts with their user id
CREATE POLICY "allow_authenticated_upload_own_folder" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'private-uploads' AND
    (split_part(name, '/', 1) = auth.uid())
  );

CREATE POLICY "allow_authenticated_read_own_folder" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'private-uploads' AND
    (split_part(name, '/', 1) = auth.uid())
  );
