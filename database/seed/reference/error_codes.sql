-- Error catalogue (BACKEND_PLAN.md §3.3). Each module adds its own codes here as it lands.
insert into public.error_codes (code, http_status, description) values
  ('UNKNOWN_ERROR_CODE', 500, 'An error code was raised that is not in the catalogue'),
  ('VALIDATION_FAILED',  400, 'Input failed validation'),
  ('UNAUTHENTICATED',    401, 'Sign-in required'),
  ('FORBIDDEN',          403, 'Missing permission for this action'),
  ('SETTING_NOT_FOUND',  500, 'Required app setting is missing'),
  ('AUDIT_APPEND_ONLY',  403, 'Audit log rows cannot be changed or deleted'),
  ('NOT_FOUND',          404, 'Record not found'),
  ('CONFLICT',           409, 'Conflicts with the current state'),
  ('RATE_LIMITED',       429, 'Too many requests; try again later'),
  ('ACCOUNT_LOCKED',     423, 'Too many failed sign-ins; try again later'),
  ('INVALID_CREDENTIALS', 401, 'Phone number or password is wrong'),
  ('RECOVERY_CODE_INVALID', 400, 'Recovery code is wrong, used or expired'),
  ('RELEASE_NOT_ALLOWED', 409, 'Phone number cannot be released for this account'),
  ('SAME_APPROVER',      403, 'Requester and approver must be different people'),
  ('REMOTE_LIMIT_REACHED', 429, 'Daily limit for remote recovery codes reached'),
  ('PHONE_TAKEN',        409, 'Phone number is already registered'),
  ('AUTH_UNAVAILABLE',   503, 'Sign-in service unavailable; try again'),
  ('METHOD_NOT_ALLOWED', 405, 'HTTP method not allowed'),
  ('INTERNAL_ERROR',     500, 'Unexpected server error')
on conflict (code) do update
  set http_status = excluded.http_status,
      description = excluded.description;
