"""Supabase Auth (GoTrue) REST calls (plan §1.3). Supabase Auth stays the password authority.

Paths, bodies and the error-code field follow supabase/auth-js (GoTrueAdminApi.ts, GoTrueClient.ts,
lib/fetch.ts): with `X-Supabase-Api-Version: 2024-01-01` the error code is in `code`, older
servers put it in `error_code`.
"""
import base64
import binascii
import json
import logging
from typing import Any

import httpx

from .config import settings

log = logging.getLogger("server")

_API_VERSION = {"X-Supabase-Api-Version": "2024-01-01"}


class AuthApiError(Exception):
    def __init__(self, status: int, code: str | None):
        super().__init__(f"{status} {code}")
        self.status = status
        self.code = code


_client: httpx.Client | None = None


def _http() -> httpx.Client:
    global _client
    if _client is None:
        _client = httpx.Client(base_url=settings().auth_url, timeout=settings().AUTH_HTTP_TIMEOUT)
    return _client


def close() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


def _error_code(res: httpx.Response) -> str | None:
    try:
        data = res.json()
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    if isinstance(data.get("code"), str):
        return data["code"]
    if isinstance(data.get("error_code"), str):
        return data["error_code"]
    return None


def _request(method: str, path: str, key: str, jwt: str | None = None, **kw: Any) -> Any:
    headers = {**_API_VERSION, "apikey": key, "Authorization": f"Bearer {jwt or key}"}
    try:
        res = _http().request(method, path, headers=headers, **kw)
    except httpx.HTTPError as e:
        log.error("auth request failed: %s %s %s", method, path, type(e).__name__)
        raise AuthApiError(0, None) from e
    if res.status_code >= 400:
        raise AuthApiError(res.status_code, _error_code(res))
    return res.json() if res.content else None


def _service() -> str:
    return settings().SUPABASE_SERVICE_ROLE_KEY


# --- caller -------------------------------------------------------------------------------------

def get_user(jwt: str) -> dict[str, Any]:
    """Verifies the JWT with Supabase Auth. Raises AuthApiError when it is not valid."""
    return _request("GET", "/user", settings().SUPABASE_ANON_KEY, jwt=jwt)


def sign_in_with_password(phone: str, password: str) -> dict[str, Any]:
    return _request("POST", "/token", settings().SUPABASE_ANON_KEY,
                    params={"grant_type": "password"}, json={"phone": phone, "password": password})


# --- admin (service role) -----------------------------------------------------------------------

def create_user(attributes: dict[str, Any]) -> dict[str, Any]:
    return _request("POST", "/admin/users", _service(), json=attributes)


def update_user_by_id(uid: str, attributes: dict[str, Any]) -> dict[str, Any]:
    return _request("PUT", f"/admin/users/{uid}", _service(), json=attributes)


def delete_user(uid: str, should_soft_delete: bool = False) -> None:
    _request("DELETE", f"/admin/users/{uid}", _service(), json={"should_soft_delete": should_soft_delete})


# --- JWT payload --------------------------------------------------------------------------------

def jwt_claims(jwt: str) -> dict[str, Any]:
    """Decodes the payload WITHOUT checking the signature. Only call it after get_user() accepted
    the same token."""
    try:
        payload = jwt.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
    except (IndexError, ValueError, binascii.Error):
        raise AuthApiError(401, "bad_jwt") from None
    if not isinstance(claims, dict):
        raise AuthApiError(401, "bad_jwt")
    return claims
