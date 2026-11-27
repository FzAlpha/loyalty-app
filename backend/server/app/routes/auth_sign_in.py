"""Phone + password sign-in with lockout (plan §6.2). Lockout state lives in ops.login_attempts."""
import logging
import time

from fastapi import APIRouter, Request

from ..core import auth_api, db
from ..core.authz import service
from ..core.credentials import Password, PhoneE164, rate_limit
from ..core.errors import AppError
from ..core.http import Body, client_ip, endpoint

router = APIRouter()
log = logging.getLogger("server")


class In(Body):
    phone: PhoneE164
    password: Password


def _result(svc: db.Ctx, phone: str, success: bool, ip: str | None):
    return db.rpc(svc, "svc_login_result", [("p_phone_e164", phone, "text"), ("p_success", success, "boolean"),
                                            ("p_ip", ip, "inet")])


@endpoint(router, "auth-sign-in", In)
def auth_sign_in(b: In, req: Request):
    ip = client_ip(req)
    svc = service(req)
    rate_limit(svc, "sign_in_ip", ip)
    rate_limit(svc, "sign_in_phone", b.phone)

    locked_until = db.rpc(svc, "svc_login_guard", [("p_phone_e164", b.phone, "text")])
    if locked_until:
        raise AppError("ACCOUNT_LOCKED", str(locked_until))

    try:
        s = auth_api.sign_in_with_password(b.phone, b.password)
    except auth_api.AuthApiError as e:
        if e.code == "invalid_credentials":
            until = _result(svc, b.phone, False, ip)
            if until:
                raise AppError("ACCOUNT_LOCKED", str(until)) from None
            raise AppError("INVALID_CREDENTIALS") from None
        if e.code == "user_banned":
            raise AppError("FORBIDDEN", "account_disabled") from None
        log.error("sign in failed: %s %s", e.code, e.status)
        raise AppError("AUTH_UNAVAILABLE") from None

    _result(svc, b.phone, True, ip)
    # auth-js fills expires_at from expires_in when the server leaves it out; do the same.
    expires_at = s.get("expires_at")
    if expires_at is None and s.get("expires_in") is not None:
        expires_at = round(time.time()) + int(s["expires_in"])
    return {
        "access_token": s["access_token"],
        "refresh_token": s["refresh_token"],
        "expires_at": expires_at,
        "user_id": s["user"]["id"],
    }
