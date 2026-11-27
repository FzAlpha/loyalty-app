"""Offline test harness: fake database RPCs and fake Supabase Auth. No network, no libpq."""
import base64
import json
import os
from typing import Any, Callable

import pytest

os.environ.update(
    SUPABASE_URL="https://example.supabase.co", SUPABASE_ANON_KEY="anon", SUPABASE_SERVICE_ROLE_KEY="service",
    DATABASE_URL="postgresql://user@localhost/db", CORS_ALLOWED_ORIGINS="https://dash.test",
    JOBS_RUNNER_SECRET="x" * 40,
)

from fastapi.testclient import TestClient  # noqa: E402

from app.core import auth_api, db, errors  # noqa: E402
from app.core.errors import AppError  # noqa: E402
from app.main import create_app  # noqa: E402

# Subset of public.error_codes used by the tests (statuses as seeded in database/seed).
CATALOGUE = {
    "VALIDATION_FAILED": 400, "UNAUTHENTICATED": 401, "FORBIDDEN": 403, "NOT_FOUND": 404,
    "METHOD_NOT_ALLOWED": 405, "CONFLICT": 409, "PHONE_TAKEN": 409, "INVALID_CREDENTIALS": 401,
    "ACCOUNT_LOCKED": 423, "RATE_LIMITED": 429, "RECOVERY_CODE_INVALID": 400, "AUTH_UNAVAILABLE": 503,
    "JOBS_NOT_CONFIGURED": 503, "INTERNAL_ERROR": 500,
}

USER_ID = "11111111-1111-1111-1111-111111111111"


def make_jwt(claims: dict[str, Any]) -> str:
    def enc(d: dict[str, Any]) -> str:
        return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
    return f"{enc({'alg': 'HS256'})}.{enc(claims)}.sig"


USER_JWT = make_jwt({"sub": USER_ID, "role": "authenticated", "session_id": "s1"})


class FakeDb:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str, dict[str, Any]]] = []
        self.handlers: dict[str, Callable[[dict[str, Any]], Any]] = {
            "svc_get_setting": lambda a: 8 if a["p_key"] == "auth.password.min_length" else 2,
            "svc_rate_limit": lambda a: None,
            "has_permission": lambda a: True,
        }

    def on(self, fn: str, handler: Callable[[dict[str, Any]], Any]) -> None:
        self.handlers[fn] = handler

    def rpc(self, ctx: db.Ctx, fn: str, args=None, returns="json"):
        named = {name: value for name, value, _ in (args or [])}
        self.calls.append((ctx.role, fn, named))
        if fn not in self.handlers:
            raise AssertionError(f"unexpected rpc {fn}")
        return self.handlers[fn](named)

    def names(self) -> list[str]:
        return [c[1] for c in self.calls]


class FakeAuth:
    def __init__(self) -> None:
        self.calls: list[tuple[str, Any]] = []
        self.fail: dict[str, auth_api.AuthApiError] = {}

    def _rec(self, name: str, arg: Any) -> None:
        self.calls.append((name, arg))
        if name in self.fail:
            raise self.fail[name]

    def get_user(self, jwt: str):
        self._rec("get_user", jwt)
        if jwt != USER_JWT:
            raise auth_api.AuthApiError(401, "bad_jwt")
        return {"id": USER_ID}

    def sign_in_with_password(self, phone: str, password: str):
        self._rec("sign_in", phone)
        return {"access_token": "at", "refresh_token": "rt", "expires_in": 3600, "user": {"id": USER_ID}}

    def create_user(self, attrs: dict[str, Any]):
        self._rec("create_user", attrs)
        return {"id": "22222222-2222-2222-2222-222222222222"}

    def update_user_by_id(self, uid: str, attrs: dict[str, Any]):
        self._rec("update_user", (uid, attrs))
        return {"id": uid}

    def delete_user(self, uid: str, should_soft_delete: bool = False):
        self._rec("delete_user", (uid, should_soft_delete))

    def names(self) -> list[str]:
        return [c[0] for c in self.calls]


@pytest.fixture
def fdb(monkeypatch) -> FakeDb:
    f = FakeDb()
    monkeypatch.setattr(db, "rpc", f.rpc)
    monkeypatch.setattr(errors, "_catalogue", CATALOGUE)
    return f


@pytest.fixture
def fauth(monkeypatch) -> FakeAuth:
    f = FakeAuth()
    for name in ("get_user", "sign_in_with_password", "create_user", "update_user_by_id", "delete_user"):
        monkeypatch.setattr(auth_api, name, getattr(f, name))
    return f


@pytest.fixture
def client(fdb, fauth) -> TestClient:
    return TestClient(create_app())


def raise_app(code: str, detail: str | None = None):
    def h(_a):
        raise AppError(code, detail)
    return h
