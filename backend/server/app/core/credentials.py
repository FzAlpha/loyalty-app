"""Phone and password input rules. Phones must already be E.164 (+ and digits); the apps format them."""
from typing import Annotated

from pydantic import StringConstraints

from . import db
from .errors import AppError

# Same pattern as the profiles.phone_e164 check constraint.
PhoneE164 = Annotated[str, StringConstraints(strict=True, pattern=r"^\+[1-9][0-9]{6,14}$")]

# Password text is bounded here; the real policy minimum comes from auth.password.min_length.
Password = Annotated[str, StringConstraints(strict=True, min_length=1, max_length=72)]


def assert_password_policy(ctx: db.Ctx, password: str) -> None:
    minimum = db.rpc(ctx, "svc_get_setting", [("p_key", "auth.password.min_length", "text")])
    if len(password) < int(minimum):
        raise AppError("VALIDATION_FAILED", "password")


def rate_limit(ctx: db.Ctx, action: str, key: str | None) -> None:
    db.rpc(ctx, "svc_rate_limit", [("p_action", action, "text"), ("p_key", key or "unknown", "text")], returns="void")
