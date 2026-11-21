#!/usr/bin/env bash
# End-to-end check against the local Supabase Auth server (GoTrue) that
# private.release_auth_phone frees a phone: the old user can no longer sign in and the phone
# can be registered again. Needs API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL (supabase status -o env).
set -euo pipefail

: "${API_URL:?}" "${ANON_KEY:?}" "${SERVICE_ROLE_KEY:?}" "${DB_URL:?}"

phone="+9199$(printf '%08d' $((RANDOM * 32768 + RANDOM)) | cut -c1-8)"
pass="t-$(openssl rand -hex 12)"   # throwaway test password, local instance only
fail=0

req() { # method path key body -> prints "<status> <body>"
  curl -s -o /tmp/resp.json -w '%{http_code}' -X "$1" "$API_URL$2" \
    -H "apikey: $3" -H "Authorization: Bearer $3" -H 'Content-Type: application/json' ${4:+-d "$4"}
  echo " $(cat /tmp/resp.json)"
}
check() { # name expected-status actual-line
  local code="${3%% *}"
  if [ "$code" = "$2" ]; then echo "ok - $1"; else echo "not ok - $1 (got $3)"; fail=1; fi
}
user_id() { python3 -c 'import sys,json; print(json.loads(sys.argv[1].split(" ",1)[1])["id"])' "$1"; }

create() { req POST /auth/v1/admin/users "$SERVICE_ROLE_KEY" "{\"phone\":\"$phone\",\"password\":\"$pass\",\"phone_confirm\":true}"; }
signin() { req POST '/auth/v1/token?grant_type=password' "$ANON_KEY" "{\"phone\":\"$phone\",\"password\":\"$pass\"}"; }

r=$(create); check "create first user" 200 "$r"; old=$(user_id "$r")
r=$(signin); check "first user signs in" 200 "$r"

psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "select private.release_auth_phone('$old')" >/dev/null
echo "ok - release_auth_phone ran"

r=$(signin); check "released user cannot sign in" 400 "$r"
r=$(create); check "phone can be registered again" 200 "$r"; new=$(user_id "$r")
[ "$new" != "$old" ] && echo "ok - new user id" || { echo "not ok - same user id"; fail=1; }
r=$(signin); check "new holder signs in" 200 "$r"

for id in "$old" "$new"; do req DELETE "/auth/v1/admin/users/$id" "$SERVICE_ROLE_KEY" >/dev/null || true; done
exit $fail
