"""Live success-path checks for the Python server against a real Supabase project.

Python port of backend/tests/edge_functions.sh, plus partner-apply. Not collected by pytest (no
test_ prefix). Run with the server up:

    SERVER_URL=http://127.0.0.1:8787 JOBS_RUNNER_SECRET=<same as the server's> python -m tests.live_staging

Uses backend/server/.env for SUPABASE_URL, keys and DATABASE_URL. Creates throwaway test users and a
"py-live-*" business; phones and passwords are random and never printed. It refuses to run the
jobs step if other deletions are due, so it never processes real accounts.
"""
import os
import secrets
import sys
from typing import Any

import httpx
import psycopg

from app.core.config import settings

S = settings()
FN = os.environ.get("SERVER_URL", "http://127.0.0.1:8787").rstrip("/") + "/functions/v1"
API = str(S.SUPABASE_URL).rstrip("/")
ANON, SVC = (getattr(k, "get_secret_value", lambda: k)() for k in (S.SUPABASE_ANON_KEY, S.SUPABASE_SERVICE_ROLE_KEY))
JOBS = os.environ.get("JOBS_RUNNER_SECRET") or getattr(S.JOBS_RUNNER_SECRET, "get_secret_value", lambda: S.JOBS_RUNNER_SECRET or "")()
http = httpx.Client(timeout=30)
fails = 0


def sql(q: str, *args: Any):
    with psycopg.connect(getattr(S.DATABASE_URL, "get_secret_value", lambda: S.DATABASE_URL)(), prepare_threshold=None, autocommit=True) as c:
        cur = c.execute(q, args)
        return cur.fetchone()[0] if cur.description else None


def phone() -> str:
    return "+9198" + f"{secrets.randbelow(10**8):08d}"


def pw() -> str:
    return "p-" + secrets.token_hex(10)


def call(name: str, token: str | None = None, body: Any = None, method: str = "POST", headers=None):
    h = {"apikey": ANON, **({"Authorization": f"Bearer {token}"} if token else {}), **(headers or {})}
    r = http.request(method, f"{FN}/{name}", json=body, headers=h)
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, {}


def check(label: str, want: int, res, code: str | None = None) -> dict:
    status, body = res
    got_code = (body.get("error") or {}).get("code")
    ok = status == want and (code is None or got_code == code)
    report(label, ok, f"want {want} {code or ''}, got {status} {got_code or ''}")
    return body.get("data") or {}


def report(label: str, ok: bool, why: str = "") -> None:
    global fails
    print(("ok - " if ok else "not ok - ") + label + ("" if ok else f" ({why})"))
    fails += 0 if ok else 1


def register(p, password):
    return call("auth-register", ANON, {"phone": p, "password": password, "full_name": "Py Live", "date_of_birth": "1990-01-31"})


def signin(p, password):
    return call("auth-sign-in", ANON, {"phone": p, "password": password})


def revoked(label: str, refresh: str, access: str) -> None:
    a = http.post(f"{API}/auth/v1/token?grant_type=refresh_token", headers={"apikey": ANON},
                  json={"refresh_token": refresh}).status_code
    b = http.get(f"{API}/auth/v1/user", headers={"apikey": ANON, "Authorization": f"Bearer {access}"}).status_code
    report(label, bool(refresh) and a != 200 and b != 200, f"refresh {a}, /user {b}")


def rest_rpc(fn: str, token: str, body: dict):
    r = http.post(f"{API}/rest/v1/rpc/{fn}", json=body, headers={
        "apikey": ANON, "Authorization": f"Bearer {token}", "Content-Profile": "api"})
    return r.status_code, r.json()


def main() -> int:
    check("GET is rejected", 405, call("auth-register", ANON, method="GET"), "METHOD_NOT_ALLOWED")

    # auth-register
    pa, pwa = phone(), pw()
    check("short password rejected by policy", 400, register(pa, "short1"), "VALIDATION_FAILED")
    ua = check("customer registers", 200, register(pa, pwa)).get("user_id")
    report("profile row created", sql("select count(*) from public.profiles where id = %s", ua) == 1)
    check("same phone again is PHONE_TAKEN", 409, register(pa, pw()), "PHONE_TAKEN")

    # auth-sign-in + lockout
    d = check("customer signs in", 200, signin(pa, pwa))
    ta, rta = d.get("access_token", ""), d.get("refresh_token", "")
    report("sign-in returns user id", d.get("user_id") == ua)
    pb, pwb = phone(), pw()
    register(pb, pwb)
    mx = int(sql("select value #>> '{}' from public.app_settings where key = 'auth.lockout.max_failures' and scope_business_id is null"))
    check("wrong password is INVALID_CREDENTIALS", 401, signin(pb, "wrong-password"), "INVALID_CREDENTIALS")
    for _ in range(2, mx):
        signin(pb, "wrong-password")
    check(f"failure {mx} locks the phone", 423, signin(pb, "wrong-password"), "ACCOUNT_LOCKED")
    check("right password while locked is refused", 423, signin(pb, pwb), "ACCOUNT_LOCKED")

    # owner fixture (same as the shell suite: Admin API + SQL grant)
    po, pwo = phone(), pw()
    r = http.post(f"{API}/auth/v1/admin/users", headers={"apikey": SVC, "Authorization": f"Bearer {SVC}"},
                  json={"phone": po, "password": pwo, "phone_confirm": True,
                        "app_metadata": {"account_type": "staff"}, "user_metadata": {"full_name": "Py Live Owner"}})
    uo = r.json()["id"]
    biz = str(sql("insert into public.businesses (slug, name) values (%s, 'Py Live Test') returning id",
                  "py-live-" + secrets.token_hex(3)))
    sql("select private.grant_role(%s, 'owner', null, null)", uo)
    sql("insert into public.staff (user_id, business_id, display_name) values (%s, null, 'Py Live Owner')", uo)
    to = check("owner signs in", 200, signin(po, pwo)).get("access_token", "")

    # auth-recover
    st, body = rest_rpc("issue_recovery_code", to, {"p_customer_id": ua, "p_channel": "in_store",
                                                    "p_business_id": biz, "p_evidence": ["registration_details"]})
    code = body.get("code") if st == 200 else None
    report("owner issues recovery code", bool(code), f"{st} {body}")
    npw = pw()

    def recover(c, p):
        return call("auth-recover", ANON, {"phone": pa, "code": c, "new_password": p})
    check("wrong recovery code rejected", 400, recover("WRONG0000", npw), "RECOVERY_CODE_INVALID")
    check("recovery sets new password", 200, recover(code or "none", npw))
    revoked("recovery revokes old session", rta, ta)
    check("used code cannot be reused", 400, recover(code or "none", pw()), "RECOVERY_CODE_INVALID")
    check("old password no longer works", 401, signin(pa, pwa), "INVALID_CREDENTIALS")
    ta = check("new password works", 200, signin(pa, npw)).get("access_token", "")

    # staff-admin
    check("staff-admin without JWT is 401", 401, call("staff-admin", None, {"action": "enable", "user_id": ua}))
    check("customer cannot manage staff", 403, call("staff-admin", ta, {"action": "enable", "user_id": ua}), "FORBIDDEN")
    pe, pwe = phone(), pw()
    create = {"action": "create", "phone": pe, "temp_password": pwe, "display_name": "Py Exec",
              "role": "executive", "business_id": biz}
    ue = check("owner creates executive", 200, call("staff-admin", to, create)).get("user_id")
    d = check("executive signs in", 200, signin(pe, pwe))
    tea, ter = d.get("access_token", ""), d.get("refresh_token", "")
    check("duplicate staff phone is PHONE_TAKEN", 409,
          call("staff-admin", to, {**create, "temp_password": pw(), "display_name": "Dup"}), "PHONE_TAKEN")
    check("owner disables executive", 200, call("staff-admin", to, {"action": "disable", "user_id": ue}))
    check("disabled executive cannot sign in", 403, signin(pe, pwe), "FORBIDDEN")
    revoked("disable revokes executive session", ter, tea)
    check("owner enables executive", 200, call("staff-admin", to, {"action": "enable", "user_id": ue}))
    check("re-enabled executive signs in", 200, signin(pe, pwe))
    npe = pw()
    check("owner resets executive password", 200,
          call("staff-admin", to, {"action": "reset_password", "user_id": ue, "temp_password": npe}))
    check("old temp password fails", 401, signin(pe, pwe), "INVALID_CREDENTIALS")
    check("new temp password works", 200, signin(pe, npe))
    check("owner cannot disable self", 400, call("staff-admin", to, {"action": "disable", "user_id": uo}), "VALIDATION_FAILED")

    # card-batches + link_card
    check("customer cannot create batch", 403, call("card-batches", ta, {"label": "x", "quantity": 1}), "FORBIDDEN")
    d = check("owner creates batch", 200, call("card-batches", to, {"label": "Py live batch", "quantity": 2}))
    report("batch returns 2 cards", d.get("count") == 2, str(d.get("count")))
    report("batch CSV header", str(d.get("csv", "")).startswith("card_number,qr_payload"))
    qr = (d.get("cards") or [{}])[0].get("qr_payload", "")
    st, body = rest_rpc("link_card", ta, {"p_qr_payload": qr})
    report("customer links card over PostgREST", st == 200 and body.get("status") == "pending", f"{st} {body}")

    # reports-export
    rb = {"report": "redemptions", "from": "2026-01-01T00:00:00Z", "to": "2026-02-01T00:00:00Z"}
    check("customer cannot export reports", 403, call("reports-export", ta, rb), "FORBIDDEN")
    d = check("owner exports redemptions CSV", 200, call("reports-export", to, rb))
    report("CSV has header row", str(d.get("csv", "")).startswith('"redeemed_at","business",'))
    check("owner grouped export", 200, call("reports-export", to, {**rb, "report": "redemptions_grouped", "group_by": "offer"}))
    check("reversed range is VALIDATION_FAILED", 400,
          call("reports-export", to, {**rb, "from": rb["to"], "to": rb["from"]}), "VALIDATION_FAILED")

    # partner-apply
    pp = phone()
    d = check("partner applies", 200, call("partner-apply", ANON, {
        "phone": pp, "password": pw(), "contact_name": "Py Live Partner", "business_name": "Py Live Partner Co"}))
    report("partner user id returned", bool(d.get("user_id")), str(d))
    check("partner phone again is PHONE_TAKEN", 409, call("partner-apply", ANON, {
        "phone": pp, "password": pw(), "contact_name": "X", "business_name": "Y"}), "PHONE_TAKEN")

    # account-deletion + jobs-runner
    pd, pwd_ = phone(), pw()
    check("deletion customer registers", 200, register(pd, pwd_))
    d = check("deletion customer signs in", 200, signin(pd, pwd_))
    td, rtd = d.get("access_token", ""), d.get("refresh_token", "")
    ud = str(sql("select id from public.profiles where phone_e164 = %s", pd))
    check("account-deletion without JWT is 401", 401, call("account-deletion", None, {}))
    d = check("customer requests account deletion", 200, call("account-deletion", td, {}))
    report("deletion status requested", d.get("status") == "requested", str(d))
    report("profile is deletion_pending", sql("select account_status from public.profiles where id = %s", ud) == "deletion_pending")
    revoked("deletion revokes the session", rtd, td)
    report("second deletion call refused", call("account-deletion", td, {})[0] != 200)
    report("deleted customer cannot sign in", signin(pd, pwd_)[0] != 200)

    check("jobs-runner rejects a wrong secret", 403,
          call("jobs-runner", ANON, {"job": "process_deletions"}, headers={"x-jobs-secret": "wrong-" + secrets.token_hex(16)}), "FORBIDDEN")
    sql("update public.deletion_requests set process_after = now() - interval '1 second' where user_id = %s", ud)
    others = sql("select count(*) from public.deletion_requests where process_after <= now()"
                 " and status in ('requested','processing') and user_id <> %s", ud)
    if others:
        report("jobs-runner step skipped: other real deletions are due", False, f"{others} due")
    else:
        d = check("jobs-runner processes due deletions", 200,
                  call("jobs-runner", ANON, {"job": "process_deletions"}, headers={"x-jobs-secret": JOBS}))
        report("jobs-runner completed >= 1", (d.get("completed") or 0) >= 1, str(d))
        report("auth user soft-deleted", sql("select deleted_at is not null from auth.users where id = %s", ud) is True)
        report("profile is deleted", sql("select account_status from public.profiles where id = %s", ud) == "deleted")

    print(f"\n{'FAIL' if fails else 'PASS'}: {fails} failed")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
