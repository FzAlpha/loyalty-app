#!/usr/bin/env bash
# Prints what the local Auth server (GoTrue) reports about phone/SMS/hook settings.
# Informational only. Lines naming secrets, tokens or keys are dropped.
set -uo pipefail
echo "== /auth/v1/settings"
curl -s "$API_URL/auth/v1/settings" -H "apikey: $ANON_KEY"
echo
echo "== auth container env (PHONE|SMS|HOOK)"
c=$(docker ps --format '{{.Names}}' | grep -m1 supabase_auth)
docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E 'PHONE|SMS|HOOK' | grep -vE 'SECRET|TOKEN|KEY'
