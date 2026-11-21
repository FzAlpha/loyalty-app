#!/usr/bin/env bash
# HTTP tests for the M2 Edge Functions against the local stack (supabase start serves them).
# Covers auth-register, auth-sign-in (incl. lockout), auth-recover and staff-admin.
# Needs API_URL, FUNCTIONS_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL (supabase status -o env).
# Local instance only: all phones and passwords are random throwaway test values.
set -euo pipefail
: "${API_URL:?}" "${FUNCTIONS_URL:?}" "${ANON_KEY:?}" "${SERVICE_ROLE_KEY:?}" "${DB_URL:?}"

fail=0
rnd() { openssl rand -hex "$1"; }
phone() { echo "+9198$(od -An -N4 -tu4 /dev/urandom | tr -d ' ' | cut -c1-8 | awk '{printf "%08d", $1}')"; }
pw() { echo "p-$(rnd 10)"; }
sql() { psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 -c "$1"; }

# call METHOD FUNCTION TOKEN [BODY] -> "<status> <body>"
call() {
  curl -s -o /tmp/fn.json -w '%{http_code}' -X "$1" "$FUNCTIONS_URL/$2" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $3" -H 'Content-Type: application/json' ${4:+-d "$4"}
  echo " $(cat /tmp/fn.json)"
}
field() { python3 -c '
import sys,json
try:
    d=json.loads(sys.argv[1].split(" ",1)[1])
    for k in sys.argv[2].split("."): d=d[k]
    print(d)
except Exception:
    print("")' "$1" "$2"; }
# check NAME STATUS [ERROR_CODE] LINE
check() {
  local name=$1 want=$2 code=${4:+$3} line=${4:-$3} got
  got="${line%% *}"
  if [ "$got" = "$want" ] && { [ -z "$code" ] || [ "$(field "$line" error.code 2>/dev/null)" = "$code" ]; }; then
    echo "ok - $name"
  else
    echo "not ok - $name (want $want${code:+ $code}, got $line)"; fail=1
  fi
}

# Wait for PostgREST's schema cache (functions read public.error_codes through it). The api schema
# is created after `supabase start`, so ask PostgREST to reload until it serves both schemas.
for i in $(seq 1 30); do
  psql "$DB_URL" -X -q -c "notify pgrst, 'reload schema'" >/dev/null 2>&1 || true
  a=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/rest/v1/error_codes?select=code&limit=1" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" || true)
  b=$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/rest/v1/" -H "Accept-Profile: api" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" || true)
  [ "$a" = 200 ] && [ "$b" = 200 ] && break; sleep 2
done
echo "postgrest error_codes status: $a, api schema status: $b"

# Wait for the edge runtime (first request boots the worker).
for i in $(seq 1 30); do
  s=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$FUNCTIONS_URL/auth-register" || true)
  [ "$s" = 204 ] && break; sleep 2
done
echo "edge runtime OPTIONS status: $s"

register() { call POST auth-register "$ANON_KEY" "{\"phone\":\"$1\",\"password\":\"$2\",\"full_name\":\"Test User\",\"date_of_birth\":\"1990-01-31\"}"; }
signin() { call POST auth-sign-in "$ANON_KEY" "{\"phone\":\"$1\",\"password\":\"$2\"}"; }

# ---------------------------------------------------------------- shared handler
check "GET is rejected" 405 METHOD_NOT_ALLOWED "$(call GET auth-register "$ANON_KEY")"
check "bad body is rejected" 400 VALIDATION_FAILED "$(call POST auth-register "$ANON_KEY" '{"phone":"12345"}')"

# ---------------------------------------------------------------- auth-register
pa=$(phone); pwa=$(pw)
check "short password rejected by policy" 400 VALIDATION_FAILED "$(register "$pa" "short1")"
r=$(register "$pa" "$pwa"); check "customer registers" 200 "$r"
ua=$(field "$r" data.user_id)
[ "$(sql "select count(*) from public.profiles where id = '$ua'")" = 1 ] \
  && echo "ok - profile row created" || { echo "not ok - profile row created"; fail=1; }
check "same phone again is PHONE_TAKEN" 409 PHONE_TAKEN "$(register "$pa" "$(pw)")"
check "future date of birth rejected" 400 VALIDATION_FAILED \
  "$(call POST auth-register "$ANON_KEY" "{\"phone\":\"$(phone)\",\"password\":\"$(pw)\",\"full_name\":\"X\",\"date_of_birth\":\"2999-01-01\"}")"

# ---------------------------------------------------------------- auth-sign-in
r=$(signin "$pa" "$pwa"); check "customer signs in" 200 "$r"
ta=$(field "$r" data.access_token)
[ "$(field "$r" data.user_id)" = "$ua" ] && echo "ok - sign-in returns user id" || { echo "not ok - sign-in user id"; fail=1; }

# Lockout on a separate customer: max_failures wrong passwords lock the phone.
pb=$(phone); pwb=$(pw); register "$pb" "$pwb" >/dev/null
max=$(sql "select value #>> '{}' from public.app_settings where key = 'auth.lockout.max_failures' and scope_business_id is null")
check "wrong password is INVALID_CREDENTIALS" 401 INVALID_CREDENTIALS "$(signin "$pb" wrong-password)"
for i in $(seq 2 $((max - 1))); do signin "$pb" wrong-password >/dev/null; done
check "failure $max locks the phone" 423 ACCOUNT_LOCKED "$(signin "$pb" wrong-password)"
check "right password while locked is refused" 423 ACCOUNT_LOCKED "$(signin "$pb" "$pwb")"

# ---------------------------------------------------------------- owner setup (test fixture)
po=$(phone); pwo=$(pw)
r=$(curl -s -X POST "$API_URL/auth/v1/admin/users" -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$po\",\"password\":\"$pwo\",\"phone_confirm\":true,\"app_metadata\":{\"account_type\":\"staff\"},\"user_metadata\":{\"full_name\":\"Owner\"}}")
uo=$(python3 -c 'import sys,json; print(json.loads(sys.argv[1])["id"])' "$r")
biz=$(sql "insert into public.businesses (slug, name) values ('fn-test-$(rnd 4)', 'Fn Test') returning id")
sql "select private.grant_role('$uo', 'owner', null, null); insert into public.staff (user_id, business_id, display_name) values ('$uo', null, 'Owner');" >/dev/null
r=$(signin "$po" "$pwo"); check "owner signs in" 200 "$r"; to=$(field "$r" data.access_token)

# ---------------------------------------------------------------- auth-recover
r=$(curl -s -X POST "$API_URL/rest/v1/rpc/issue_recovery_code" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $to" \
  -H 'Content-Type: application/json' -H 'Content-Profile: api' \
  -d "{\"p_customer_id\":\"$ua\",\"p_channel\":\"in_store\",\"p_business_id\":\"$biz\",\"p_evidence\":[\"registration_details\"]}")
code=$(python3 -c 'import sys,json; print(json.loads(sys.argv[1])["code"])' "$r") \
  && echo "ok - owner issues recovery code" || { echo "not ok - issue recovery code ($r)"; fail=1; code=none; }
npw=$(pw)
recover() { call POST auth-recover "$ANON_KEY" "{\"phone\":\"$pa\",\"code\":\"$1\",\"new_password\":\"$2\"}"; }
check "wrong recovery code rejected" 400 RECOVERY_CODE_INVALID "$(recover WRONG0000 "$npw")"
check "recovery sets new password" 200 "$(recover "$code" "$npw")"
check "used code cannot be reused" 400 RECOVERY_CODE_INVALID "$(recover "$code" "$(pw)")"
check "old password no longer works" 401 INVALID_CREDENTIALS "$(signin "$pa" "$pwa")"
r=$(signin "$pa" "$npw"); check "new password works" 200 "$r"; ta=$(field "$r" data.access_token)

# ---------------------------------------------------------------- staff-admin
sa() { call POST staff-admin "$1" "$2"; }
s=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$FUNCTIONS_URL/staff-admin" -H 'Content-Type: application/json' -d '{"action":"enable","user_id":"'"$ua"'"}')
[ "$s" = 401 ] && echo "ok - staff-admin without JWT is 401" || { echo "not ok - staff-admin without JWT (got $s)"; fail=1; }
check "customer cannot manage staff" 403 FORBIDDEN "$(sa "$ta" "{\"action\":\"enable\",\"user_id\":\"$ua\"}")"

pe=$(phone); pwe=$(pw)
r=$(sa "$to" "{\"action\":\"create\",\"phone\":\"$pe\",\"temp_password\":\"$pwe\",\"display_name\":\"Exec\",\"role\":\"executive\",\"business_id\":\"$biz\"}")
check "owner creates executive" 200 "$r"; ue=$(field "$r" data.user_id)
check "executive signs in" 200 "$(signin "$pe" "$pwe")"
check "duplicate staff phone is PHONE_TAKEN" 409 PHONE_TAKEN \
  "$(sa "$to" "{\"action\":\"create\",\"phone\":\"$pe\",\"temp_password\":\"$(pw)\",\"display_name\":\"Dup\",\"role\":\"executive\",\"business_id\":\"$biz\"}")"
check "owner disables executive" 200 "$(sa "$to" "{\"action\":\"disable\",\"user_id\":\"$ue\"}")"
check "disabled executive cannot sign in" 403 FORBIDDEN "$(signin "$pe" "$pwe")"
check "owner enables executive" 200 "$(sa "$to" "{\"action\":\"enable\",\"user_id\":\"$ue\"}")"
check "re-enabled executive signs in" 200 "$(signin "$pe" "$pwe")"
npe=$(pw)
check "owner resets executive password" 200 "$(sa "$to" "{\"action\":\"reset_password\",\"user_id\":\"$ue\",\"temp_password\":\"$npe\"}")"
check "old temp password fails" 401 INVALID_CREDENTIALS "$(signin "$pe" "$pwe")"
check "new temp password works" 200 "$(signin "$pe" "$npe")"
check "owner cannot disable self" 400 VALIDATION_FAILED "$(sa "$to" "{\"action\":\"disable\",\"user_id\":\"$uo\"}")"

exit $fail
