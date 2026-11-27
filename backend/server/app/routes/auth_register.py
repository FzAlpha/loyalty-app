"""Customer self-signup by phone + password (plan §6.1). No SMS: the phone is marked confirmed and
ownership disputes go through the in-store phone release flow."""
from fastapi import APIRouter, Request

from ..core import auth_api
from ..core.authz import service
from ..core.credentials import Password, PhoneE164, assert_password_policy, rate_limit
from ..core.http import Body, client_ip, endpoint
from ..core.validators import PastDate, Text
from .auth_errors import auth_fail

router = APIRouter()


class In(Body):
    phone: PhoneE164
    password: Password
    full_name: Text(200, 1)
    date_of_birth: PastDate


@endpoint(router, "auth-register", In)
def auth_register(b: In, req: Request):
    svc = service(req)
    rate_limit(svc, "register", client_ip(req))
    assert_password_policy(svc, b.password)

    # The profile row is created by the auth.users trigger from this metadata (10_identity).
    try:
        user = auth_api.create_user({
            "phone": b.phone, "password": b.password, "phone_confirm": True,
            "user_metadata": {"full_name": b.full_name, "date_of_birth": b.date_of_birth},
        })
    except auth_api.AuthApiError as e:
        auth_fail(e)
    return {"user_id": user["id"]}
