
CREATE POLICY "Owner can read branding" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'branding');
CREATE POLICY "Owner can upload branding" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'branding');
CREATE POLICY "Owner can update branding" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'branding') WITH CHECK (bucket_id = 'branding');
CREATE POLICY "Owner can delete branding" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'branding');
