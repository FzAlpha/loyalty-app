"""Owner-only staff management (plan §6.5): create, reassign, enable, disable, reset password.
Auth changes go through the Admin API; the database RPCs re-check staff.manage for the actor."""
import logging
from typing import Annotated, Literal, Optional, Union

from fastapi import APIRouter, Request
from pydantic import Field

from ..core import auth_api, db
from ..core.authz import require_permission, service
from ..core.credentials import Password, PhoneE164, assert_password_policy
from ..core.errors import AppError
from ..core.http import Body, endpoint
from ..core.validators import Text, Uuid
from .auth_errors import auth_fail

router = APIRouter()
log = logging.getLogger("server")

Role = Literal["executive", "owner"]
Name = Text(200, 1)


class Create(Body):
    action: Literal["create"]
    phone: PhoneE164
    temp_password: Password
    display_name: Name
    role: Role
    business_id: Optional[Uuid]


class Reassign(Body):
    action: Literal["reassign"]
    user_id: Uuid
    role: Role
    business_id: Optional[Uuid]
    display_name: Name


class Enable(Body):
    action: Literal["enable"]
    user_id: Uuid


class Disable(Body):
    action: Literal["disable"]
    user_id: Uuid


class ResetPassword(Body):
    action: Literal["reset_password"]
    user_id: Uuid
    temp_password: Password


In = Annotated[Union[Create, Reassign, Enable, Disable, ResetPassword], Field(discriminator="action")]

# ban_duration "none" lifts a ban; disabling uses a long ban (Auth has no permanent flag).
BAN_FOREVER = "876000h"


def _auth(call, *args) -> None:
    try:
        call(*args)
    except auth_api.AuthApiError as e:
        auth_fail(e, not_found=True)


def _upsert(svc: db.Ctx, actor: str, user_id: str, role: str, business_id: str | None, name: str) -> None:
    db.rpc(svc, "svc_staff_upsert", [
        ("p_actor_id", actor, "uuid"), ("p_user_id", user_id, "uuid"), ("p_role_key", role, "text"),
        ("p_business_id", business_id, "uuid"), ("p_display_name", name, "text"),
    ], returns="void")


def _revoke(svc: db.Ctx, actor: str, user_id: str, reason: str) -> None:
    db.rpc(svc, "svc_revoke_user_sessions",
           [("p_actor_id", actor, "uuid"), ("p_user_id", user_id, "uuid"), ("p_reason", reason, "text")])


def _set_active(svc: db.Ctx, actor: str, user_id: str, active: bool) -> None:
    db.rpc(svc, "svc_staff_set_active",
           [("p_actor_id", actor, "uuid"), ("p_user_id", user_id, "uuid"), ("p_active", active, "boolean")],
           returns="void")


@endpoint(router, "staff-admin", In, tagged=True)
def staff_admin(b, req: Request):
    actor = require_permission(req, "staff.manage")
    svc = service(req)

    if isinstance(b, Create):
        assert_password_policy(svc, b.temp_password)
        try:
            user = auth_api.create_user({
                "phone": b.phone, "password": b.temp_password, "phone_confirm": True,
                "app_metadata": {"account_type": "staff"},
                "user_metadata": {"full_name": b.display_name},
            })
        except auth_api.AuthApiError as e:
            auth_fail(e, not_found=True)
        uid = user["id"]
        try:
            _upsert(svc, actor, uid, b.role, b.business_id, b.display_name)
        except AppError:
            # Do not leave an Auth user without a staff row.
            try:
                auth_api.delete_user(uid)
            except auth_api.AuthApiError as e:
                log.error("cleanup deleteUser failed %s %s", e.code, e.status)
            raise
        return {"user_id": uid}

    if isinstance(b, Reassign):
        _upsert(svc, actor, b.user_id, b.role, b.business_id, b.display_name)
        _revoke(svc, actor, b.user_id, "staff_reassigned")
        return {"user_id": b.user_id}

    if isinstance(b, Enable):
        _set_active(svc, actor, b.user_id, True)
        _auth(auth_api.update_user_by_id, b.user_id, {"ban_duration": "none"})
        return {"user_id": b.user_id}

    if isinstance(b, Disable):
        # DB first: it checks permission and refuses self-disable before Auth is touched.
        _set_active(svc, actor, b.user_id, False)
        _auth(auth_api.update_user_by_id, b.user_id, {"ban_duration": BAN_FOREVER})
        _revoke(svc, actor, b.user_id, "staff_disabled")
        return {"user_id": b.user_id}

    assert isinstance(b, ResetPassword)
    assert_password_policy(svc, b.temp_password)
    db.rpc(svc, "svc_staff_mark_password_reset", [("p_actor_id", actor, "uuid"), ("p_user_id", b.user_id, "uuid")],
           returns="void")
    _auth(auth_api.update_user_by_id, b.user_id, {"password": b.temp_password})
    _revoke(svc, actor, b.user_id, "staff_password_reset")
    return {"user_id": b.user_id}
