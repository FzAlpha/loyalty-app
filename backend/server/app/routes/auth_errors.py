"""Maps Supabase Auth error codes to catalogue codes (same mapping as the Edge Functions)."""
import logging
from typing import NoReturn

from ..core.auth_api import AuthApiError
from ..core.errors import AppError

log = logging.getLogger("server")


def auth_fail(e: AuthApiError, *, not_found: bool = False) -> NoReturn:
    if e.code == "phone_exists":
        raise AppError("PHONE_TAKEN")
    if e.code == "weak_password":
        raise AppError("VALIDATION_FAILED", "password")
    if not_found and e.code == "user_not_found":
        raise AppError("NOT_FOUND")
    log.error("auth admin call failed: %s %s", e.code, e.status)
    raise AppError("AUTH_UNAVAILABLE")
