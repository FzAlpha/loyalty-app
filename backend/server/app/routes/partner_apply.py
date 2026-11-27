"""Partner business self sign-up (plan §4 partners). Creates a staff Auth account with the
applicant's own password, then a pending partner application. The owner decides in the dashboard."""
import logging
from typing import Optional

from fastapi import APIRouter, Request

from ..core import auth_api, db
from ..core.authz import service
from ..core.credentials import Password, PhoneE164, assert_password_policy, rate_limit
from ..core.errors import AppError
from ..core.http import Body, client_ip, endpoint
from ..core.validators import Text
from .auth_errors import auth_fail

router = APIRouter()
log = logging.getLogger("server")


class In(Body):
    phone: PhoneE164
    password: Password
    contact_name: Text(200, 1)
    business_name: Text(200, 1)
    category: Optional[Text(100)] = None
    address: Optional[Text(500)] = None
    business_phone: Optional[Text(30)] = None
    website_url: Optional[Text(500)] = None
    message: Optional[Text(2000)] = None


@endpoint(router, "partner-apply", In)
def partner_apply(b: In, req: Request):
    svc = service(req)
    rate_limit(svc, "partner_apply", client_ip(req))
    assert_password_policy(svc, b.password)

    # account_type 'staff' keeps the signup trigger from granting the customer role (10_identity).
    try:
        user = auth_api.create_user({
            "phone": b.phone, "password": b.password, "phone_confirm": True,
            "app_metadata": {"account_type": "staff"},
            "user_metadata": {"full_name": b.contact_name},
        })
    except auth_api.AuthApiError as e:
        auth_fail(e)
    uid = user["id"]

    application = {
        "business_name": b.business_name, "contact_name": b.contact_name,
        "category": b.category or None, "address": b.address or None, "phone": b.business_phone or None,
        "website_url": b.website_url or None, "message": b.message or None,
    }
    try:
        res = db.rpc(svc, "svc_partner_register", [("p_user_id", uid, "uuid"), ("p_application", application, "jsonb")])
    except AppError:
        # Do not leave an Auth user without an application.
        try:
            auth_api.delete_user(uid)
        except auth_api.AuthApiError as e:
            log.error("cleanup deleteUser failed %s %s", e.code, e.status)
        raise
    return {"user_id": uid, **(res if isinstance(res, dict) else {})}
