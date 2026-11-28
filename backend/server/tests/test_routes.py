"""Offline route tests: fake DB + fake Auth (see conftest). Live checks against staging are separate."""
from app.core import auth_api

from .conftest import USER_ID, USER_JWT, raise_app

AUTH = {"Authorization": f"Bearer {USER_JWT}"}
UID2 = "22222222-2222-2222-2222-222222222222"
BIZ = "33333333-3333-3333-3333-333333333333"


def fn(client, name, body=None, headers=None, method="POST"):
    return client.request(method, f"/functions/v1/{name}", json=body, headers=headers or {})


# --- shared plumbing -------------------------------------------------------------------------

def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json() == {"data": {"ok": True}}


def test_options_and_method(client):
    assert fn(client, "auth-sign-in", method="OPTIONS").status_code == 204
    r = fn(client, "auth-sign-in", method="GET")
    assert r.status_code == 405 and r.json()["error"]["code"] == "METHOD_NOT_ALLOWED"


def test_cors_allowlist(client):
    r = client.get("/health", headers={"Origin": "https://dash.test"})
    assert r.headers.get("access-control-allow-origin") == "https://dash.test"
    r = client.get("/health", headers={"Origin": "https://evil.test"})
    assert r.headers.get("access-control-allow-origin") != "https://evil.test"


def test_bad_json(client):
    r = client.post("/functions/v1/auth-sign-in", content=b"{nope", headers={"content-type": "application/json"})
    assert r.status_code == 400 and r.json()["error"]["code"] == "VALIDATION_FAILED"


def test_unauthenticated(client):
    r = fn(client, "account-deletion", {})
    assert r.status_code == 401 and r.json()["error"]["code"] == "UNAUTHENTICATED"
    r = fn(client, "account-deletion", {}, {"Authorization": "Bearer junk"})
    assert r.status_code == 401


# --- auth-sign-in ----------------------------------------------------------------------------

SIGN_IN = {"phone": "+919876543210", "password": "secret123"}


def test_sign_in_ok(client, fdb):
    fdb.on("svc_login_guard", lambda a: None)
    fdb.on("svc_login_result", lambda a: None)
    r = fn(client, "auth-sign-in", SIGN_IN)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["access_token"] == "at" and d["user_id"] == USER_ID and isinstance(d["expires_at"], int)
    assert fdb.names()[:3] == ["svc_rate_limit", "svc_rate_limit", "svc_login_guard"]


def test_sign_in_bad_phone(client):
    r = fn(client, "auth-sign-in", {"phone": "98765", "password": "x"})
    assert r.status_code == 400 and r.json()["error"]["detail"] == "phone"


def test_sign_in_locked(client, fdb, fauth):
    fdb.on("svc_login_guard", lambda a: "2026-11-27T12:00:00+00:00")
    r = fn(client, "auth-sign-in", SIGN_IN)
    assert r.status_code == 423 and "sign_in" not in fauth.names()


def test_sign_in_wrong_password(client, fdb, fauth):
    fdb.on("svc_login_guard", lambda a: None)
    fdb.on("svc_login_result", lambda a: None)
    fauth.fail["sign_in"] = auth_api.AuthApiError(400, "invalid_credentials")
    r = fn(client, "auth-sign-in", SIGN_IN)
    assert r.status_code == 401 and r.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_sign_in_rate_limited(client, fdb):
    fdb.on("svc_rate_limit", raise_app("RATE_LIMITED"))
    assert fn(client, "auth-sign-in", SIGN_IN).status_code == 429


def test_sign_in_auth_down(client, fdb, fauth):
    fdb.on("svc_login_guard", lambda a: None)
    fauth.fail["sign_in"] = auth_api.AuthApiError(0, None)
    assert fn(client, "auth-sign-in", SIGN_IN).json()["error"]["code"] == "AUTH_UNAVAILABLE"


# --- auth-register / recover -----------------------------------------------------------------

REG = {"phone": "+919876543210", "password": "longenough", "full_name": "A B", "date_of_birth": "1990-01-01"}


def test_register_ok(client, fauth):
    r = fn(client, "auth-register", REG)
    assert r.status_code == 200, r.text
    assert fauth.calls[0][1]["user_metadata"]["full_name"] == "A B"


def test_register_short_password(client):
    r = fn(client, "auth-register", {**REG, "password": "short"})
    assert r.status_code == 400 and r.json()["error"]["detail"] == "password"


def test_register_phone_taken(client, fauth):
    fauth.fail["create_user"] = auth_api.AuthApiError(422, "phone_exists")
    assert fn(client, "auth-register", REG).json()["error"]["code"] == "PHONE_TAKEN"


def test_register_future_dob(client):
    assert fn(client, "auth-register", {**REG, "date_of_birth": "2999-01-01"}).status_code == 400


def test_recover_bad_code(client, fdb, fauth):
    fdb.on("svc_consume_recovery_code", lambda a: None)
    r = fn(client, "auth-recover", {"phone": "+919876543210", "code": "ABCD-EFGH", "new_password": "longenough"})
    assert r.json()["error"]["code"] == "RECOVERY_CODE_INVALID", r.text
    assert "update_user" not in fauth.names()


# --- account-deletion ------------------------------------------------------------------------

def test_account_deletion(client, fdb):
    fdb.on("request_account_deletion", lambda a: {"scheduled_for": "2026-12-27"})
    r = fn(client, "account-deletion", {}, AUTH)
    assert r.status_code == 200, r.text
    assert fdb.calls[-1][0] == "authenticated"


def test_account_deletion_extra_field(client):
    assert fn(client, "account-deletion", {"user_id": UID2}, AUTH).status_code == 400


# --- staff-admin -----------------------------------------------------------------------------

def test_staff_forbidden(client, fdb):
    fdb.on("has_permission", lambda a: False)
    r = fn(client, "staff-admin", {"action": "enable", "user_id": UID2}, AUTH)
    assert r.status_code == 403 and r.json()["error"]["detail"] == "staff.manage"


def test_staff_create_rolls_back_auth_user(client, fdb, fauth):
    fdb.on("svc_staff_upsert", raise_app("CONFLICT"))
    r = fn(client, "staff-admin", {"action": "create", "phone": "+919876543210", "temp_password": "longenough",
                                   "display_name": "Exec", "role": "executive", "business_id": BIZ}, AUTH)
    assert r.status_code == 409
    assert fauth.names()[-1] == "delete_user"


def test_staff_disable_order(client, fdb, fauth):
    fdb.on("svc_staff_set_active", lambda a: None)
    fdb.on("svc_revoke_user_sessions", lambda a: 1)
    r = fn(client, "staff-admin", {"action": "disable", "user_id": UID2}, AUTH)
    assert r.status_code == 200, r.text
    assert fdb.names()[-2:] == ["svc_staff_set_active", "svc_revoke_user_sessions"]
    assert fauth.calls[-1] == ("update_user", (UID2, {"ban_duration": "876000h"}))


def test_staff_unknown_action(client):
    assert fn(client, "staff-admin", {"action": "nuke", "user_id": UID2}, AUTH).status_code == 400


# --- card-batches / reports-export -----------------------------------------------------------

def test_card_batches(client, fdb):
    fdb.on("create_card_batch", lambda a: [{"card_number": "C1", "qr_payload": "Q1"}])
    r = fn(client, "card-batches", {"label": "b", "quantity": 1}, AUTH)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["count"] == 1 and d["csv"] == "card_number,qr_payload\nC1,Q1"


def test_reports_export_truncates_and_escapes(client, fdb):
    rows = [{"redeemed_at": "t", "business": "=HYPERLINK()", "bill_amount": 10.0}] * 3
    fdb.on("report_redemption_rows", lambda a: rows)
    fdb.on("report_export_max_rows", lambda a: 2)
    r = fn(client, "reports-export", {"report": "redemptions", "from": "2026-01-01T00:00:00Z",
                                      "to": "2026-02-01T00:00:00Z"}, AUTH)
    assert r.status_code == 200, r.text
    d = r.json()["data"]
    assert d["rows"] == 2 and d["truncated"] is True
    assert "\"'=HYPERLINK()\"" in d["csv"] and "\"10\"" in d["csv"]


def test_reports_bad_date(client):
    r = fn(client, "reports-export", {"report": "redemptions", "from": "yesterday", "to": "2026-02-01T00:00:00Z"}, AUTH)
    assert r.status_code == 400


# --- jobs-runner -----------------------------------------------------------------------------

def test_jobs_wrong_secret(client):
    r = fn(client, "jobs-runner", {"job": "process_deletions"}, {"x-jobs-secret": "nope"})
    assert r.status_code in (401, 403)


def test_jobs_process(client, fdb, fauth):
    fdb.on("svc_claim_due_deletions", lambda a: [{"user_id": UID2, "request_id": BIZ}])
    fdb.on("svc_complete_deletion", lambda a: None)
    r = fn(client, "jobs-runner", {"job": "process_deletions"}, {"x-jobs-secret": "x" * 40})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["completed"] == 1 and fauth.calls[-1] == ("delete_user", (UID2, True))


def test_jobs_removes_avatars(client, fdb, fauth, monkeypatch):
    from app.core import storage_api
    removed = []
    monkeypatch.setattr(storage_api, "remove_folder", lambda b, f: removed.append((b, f)) or 1)
    fdb.on("svc_get_setting", lambda a: {"jobs.process_deletions.batch_size": 5,
                                         "storage.bucket.customer_avatars": "customer-avatars"}[a["p_key"]])
    fdb.on("svc_claim_due_deletions", lambda a: [{"user_id": UID2, "request_id": BIZ}])
    fdb.on("svc_complete_deletion", lambda a: None)
    r = fn(client, "jobs-runner", {"job": "process_deletions"}, {"x-jobs-secret": "x" * 40})
    assert r.status_code == 200, r.text
    assert removed == [("customer-avatars", UID2)]


def test_jobs_avatar_failure_still_completes(client, fdb, fauth, monkeypatch):
    from app.core import storage_api

    def boom(b, f):
        raise storage_api.StorageApiError(500)
    monkeypatch.setattr(storage_api, "remove_folder", boom)
    fdb.on("svc_claim_due_deletions", lambda a: [{"user_id": UID2, "request_id": BIZ}])
    fdb.on("svc_complete_deletion", lambda a: None)
    r = fn(client, "jobs-runner", {"job": "process_deletions"}, {"x-jobs-secret": "x" * 40})
    assert r.status_code == 200 and r.json()["data"]["completed"] == 1


# --- robustness ------------------------------------------------------------------------------

def _req(headers: dict[str, str], host: str = "testclient"):
    from starlette.requests import Request
    return Request({"type": "http", "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
                    "client": (host, 1)})


def test_client_ip_validated():
    from app.core.http import client_ip
    assert client_ip(_req({"x-forwarded-for": "203.0.113.7, 10.0.0.1"})) == "203.0.113.7"
    assert client_ip(_req({"x-forwarded-for": "junk"}, host="198.51.100.2")) == "198.51.100.2"
    assert client_ip(_req({"x-forwarded-for": "junk"})) is None


def test_request_id(client):
    r = client.get("/health/nope")
    assert r.status_code == 404 and r.json()["error"]["code"] == "NOT_FOUND"
    assert len(r.headers["x-request-id"]) == 32
    r = fn(client, "auth-sign-in", {}, {"x-request-id": "abc-123"})
    assert r.headers["x-request-id"] == "abc-123"
    r = fn(client, "auth-sign-in", {}, {"x-request-id": "bad id\twith spaces"})
    assert r.headers["x-request-id"] != "bad id\twith spaces"


def test_body_too_large(client, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings(), "MAX_BODY_BYTES", 50)
    r = fn(client, "auth-sign-in", {"phone": "+919876543210", "password": "x" * 100})
    assert r.status_code == 400 and r.json()["error"]["detail"] == "body_too_large"


def test_auth_outage_is_not_unauthenticated(client, fauth):
    fauth.fail["get_user"] = auth_api.AuthApiError(0, None)
    r = fn(client, "account-deletion", {}, AUTH)
    assert r.status_code == 503 and r.json()["error"]["code"] == "AUTH_UNAVAILABLE"
    fauth.fail["get_user"] = auth_api.AuthApiError(502, None)
    assert fn(client, "account-deletion", {}, AUTH).json()["error"]["code"] == "AUTH_UNAVAILABLE"


def test_readiness(client, monkeypatch):
    from app.core import db
    monkeypatch.setattr(db, "ping", lambda: True)
    assert client.get("/health/ready").status_code == 200
    monkeypatch.setattr(db, "ping", lambda: False)
    assert client.get("/health/ready").status_code == 503
