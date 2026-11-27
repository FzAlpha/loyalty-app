"""Password reset with a staff-issued recovery code (plan §6.3). Sets the new password, then signs
the user out everywhere."""
from fastapi import APIRouter, Request

from ..core import auth_api, db
from ..core.authz import service
from ..core.credentials import Password, PhoneE164, assert_password_policy, rate_limit
from ..core.errors import AppError
from ..core.http import Body, client_ip, endpoint
from ..core.validators import Text
from .auth_errors import auth_fail

router = APIRouter()


class In(Body):
    phone: PhoneE164
    code: Text(32, 4)
    new_password: Password


@endpoint(router, "auth-recover", In)
def auth_recover(b: In, req: Request):
    svc = service(req)
    rate_limit(svc, "recover_ip", client_ip(req))
    rate_limit(svc, "recover_phone", b.phone)
    assert_password_policy(svc, b.new_password)

    res = db.rpc(svc, "svc_consume_recovery_code", [("p_phone_e164", b.phone, "text"), ("p_code", b.code, "text")])
    if not isinstance(res, dict) or not res.get("ok") or not res.get("user_id"):
        raise AppError("RECOVERY_CODE_INVALID")
    uid = res["user_id"]

    # The code is spent at this point. If this update fails, staff must issue a new code.
    try:
        auth_api.update_user_by_id(uid, {"password": b.new_password})
    except auth_api.AuthApiError as e:
        if e.code == "weak_password":
            raise AppError("VALIDATION_FAILED", "password") from None
        auth_fail(e)

    db.rpc(svc, "svc_revoke_user_sessions", [("p_actor_id", uid, "uuid"), ("p_user_id", uid, "uuid"),
                                             ("p_reason", "password_recovered", "text")])
    return {"recovered": True}
