#!/usr/bin/env bash
# Security regression scan (plan §12, M9). Run from the repo root. Fails when:
#  1. the service-role key, or code that names it, appears in frontend or shared package code,
#     including any built bundle (dist/, build/, .next/, .output/) found there;
#  2. a "phone verified" field or label appears anywhere in app code. Phone numbers are never
#     verified (no SMS), so no column, type, label or string may claim they are.
# Optional: SERVICE_ROLE_KEY=<value> also searches for the literal key value.
set -u
cd "$(dirname "$0")/../.."
fail=0

client_dirs=()
for d in frontend packages; do [ -d "$d" ] && client_dirs+=("$d"); done

if [ ${#client_dirs[@]} -gt 0 ]; then
  if grep -rnIE --exclude-dir=node_modules 'service[_-]?role|SUPABASE_SERVICE_ROLE_KEY' "${client_dirs[@]}"; then
    echo "FAIL: service-role reference in client code"; fail=1
  fi
  if [ -n "${SERVICE_ROLE_KEY:-}" ] && grep -rnIF --exclude-dir=node_modules "$SERVICE_ROLE_KEY" "${client_dirs[@]}" >/dev/null; then
    echo "FAIL: service-role key value found in client code"; fail=1
  fi
fi

app_dirs=()
for d in frontend packages database/schema database/seed backend/supabase/functions; do [ -d "$d" ] && app_dirs+=("$d"); done
if grep -rnIiE --exclude-dir=node_modules 'phone[ _-]?(is[ _-]?)?verif' "${app_dirs[@]}"; then
  echo "FAIL: 'phone verified' field or label"; fail=1
fi

[ $fail -eq 0 ] && echo "security scan: OK (scanned: ${client_dirs[*]:-none} | ${app_dirs[*]})"
exit $fail
