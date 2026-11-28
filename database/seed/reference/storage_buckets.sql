-- Storage buckets (BACKEND_PLAN.md §10). Names and limits come from app_settings (settings.sql runs first).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select b.id, b.id, true, (private.get_setting('storage.max_file_bytes'))::bigint,
       array(select jsonb_array_elements_text(private.get_setting('storage.allowed_mime_types')))
from (values (private.get_setting('storage.bucket.business_assets') #>> '{}'),
             (private.get_setting('storage.bucket.offer_banners') #>> '{}')) as b(id)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Customer profile photos: private (signed URLs only) with their own size limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select b.id, b.id, false, (private.get_setting('storage.avatar_max_file_bytes'))::bigint,
       array(select jsonb_array_elements_text(private.get_setting('storage.allowed_mime_types')))
from (values (private.get_setting('storage.bucket.customer_avatars') #>> '{}')) as b(id)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
