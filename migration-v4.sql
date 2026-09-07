-- Migração V4: Permite que o próprio usuário autenticado suba/leia seus anexos no bucket "attachments"
-- Execute este SQL no Supabase SQL Editor (o bucket já foi criado pelo script de migração)

create policy "Users can manage own attachments"
on storage.objects for all
to authenticated
using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
