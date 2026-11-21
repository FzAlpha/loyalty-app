-- Error catalogue (BACKEND_PLAN.md §3.3). Each module adds its own codes here as it lands.
insert into public.error_codes (code, http_status, description) values
  ('UNKNOWN_ERROR_CODE', 500, 'An error code was raised that is not in the catalogue'),
  ('VALIDATION_FAILED',  400, 'Input failed validation'),
  ('UNAUTHENTICATED',    401, 'Sign-in required'),
  ('FORBIDDEN',          403, 'Missing permission for this action'),
  ('SETTING_NOT_FOUND',  500, 'Required app setting is missing'),
  ('AUDIT_APPEND_ONLY',  403, 'Audit log rows cannot be changed or deleted')
on conflict (code) do update
  set http_status = excluded.http_status,
      description = excluded.description;
