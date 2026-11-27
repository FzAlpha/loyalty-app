"""Caller identity and permission checks. Never trusts ids from the request body."""
from dataclasses import dataclass

from fastapi import Request

from . import auth_api, db
from .errors import AppError
from .http import bearer, db_headers


@dataclass(frozen=True)
class Caller:
    user_id: str
    ctx: db.Ctx  # database context acting as this caller


def caller(req: Request) -> Caller:
    """Verifies the bearer JWT with Supabase Auth, then returns a context that runs RPCs as the
    caller (RLS and private.can() apply, as with PostgREST)."""
    jwt = bearer(req)
    try:
        user = auth_api.get_user(jwt)
        claims = auth_api.jwt_claims(jwt)
    except auth_api.AuthApiError:
        raise AppError("UNAUTHENTICATED") from None
    uid = user.get("id") if isinstance(user, dict) else None
    if not uid or claims.get("sub") != uid or claims.get("role") != "authenticated":
        raise AppError("UNAUTHENTICATED")
    return Caller(uid, db.as_user(claims, db_headers(req)))


def require_permission(req: Request, permission: str, business_id: str | None = None) -> str:
    """Asks the database as the caller (session must be live, staff must be active). Returns the
    caller's user id for service-role RPCs (p_actor_id)."""
    c = caller(req)
    ok = db.rpc(c.ctx, "has_permission", [("p_permission", permission, "text"), ("p_business_id", business_id, "uuid")])
    if ok is not True:
        raise AppError("FORBIDDEN", permission)
    return c.user_id


def service(req: Request) -> db.Ctx:
    return db.as_service(db_headers(req))
