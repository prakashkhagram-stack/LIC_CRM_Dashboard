-- =====================================================================================
--  Private file storage for documents and receipts   (run AFTER schema.sql)
--  1) Creates a PRIVATE bucket called "documents"
--  2) Only signed-in, approved staff/admin may upload; every approved user may read
-- =====================================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists documents_read   on storage.objects;
drop policy if exists documents_write  on storage.objects;
drop policy if exists documents_update on storage.objects;
drop policy if exists documents_delete on storage.objects;
create policy documents_read   on storage.objects for select to authenticated using (bucket_id = 'documents' and public.app_role() is not null);
create policy documents_write  on storage.objects for insert to authenticated with check (bucket_id = 'documents' and public.app_role() in ('admin','staff'));
create policy documents_update on storage.objects for update to authenticated using (bucket_id = 'documents' and public.app_role() in ('admin','staff'));
create policy documents_delete on storage.objects for delete to authenticated using (bucket_id = 'documents' and public.app_role() = 'admin');
