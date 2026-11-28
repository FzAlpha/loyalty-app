"""Supabase Storage REST calls used by jobs (plan §10). Service role only.

Paths and bodies follow supabase/storage-js (StorageFileApi.ts): list is
POST /object/list/{bucket} {prefix, limit, offset, sortBy} and returns names relative to the prefix;
remove is DELETE /object/{bucket} {prefixes}. Timeout and retries reuse the Auth HTTP settings.
"""
import logging
from typing import Any

import httpx

from .config import settings

log = logging.getLogger("server")

# Page size for listing a folder (storage-js default).
_PAGE = 100


class StorageApiError(Exception):
    def __init__(self, status: int):
        super().__init__(str(status))
        self.status = status


_client: httpx.Client | None = None


def _http() -> httpx.Client:
    global _client
    if _client is None:
        s = settings()
        _client = httpx.Client(base_url=s.storage_url, timeout=s.AUTH_HTTP_TIMEOUT,
                               transport=httpx.HTTPTransport(retries=s.AUTH_HTTP_RETRIES))
    return _client


def close() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None


def _request(method: str, path: str, body: dict[str, Any]) -> Any:
    key = settings().SUPABASE_SERVICE_ROLE_KEY
    try:
        res = _http().request(method, path, json=body, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    except httpx.HTTPError as e:
        log.error("storage request failed: %s %s %s", method, path, type(e).__name__)
        raise StorageApiError(0) from e
    if res.status_code >= 400:
        raise StorageApiError(res.status_code)
    try:
        return res.json() if res.content else None
    except ValueError as e:
        raise StorageApiError(0) from e


def remove_folder(bucket: str, folder: str) -> int:
    """Deletes every object directly under '<folder>/'. Returns how many were removed."""
    removed = 0
    while True:
        items = _request("POST", f"/object/list/{bucket}",
                         {"prefix": folder, "limit": _PAGE, "offset": 0, "sortBy": {"column": "name", "order": "asc"}})
        # Folder placeholders have no id; only real objects are removed.
        names = [f"{folder}/{i['name']}" for i in (items or []) if i.get("id")]
        if not names:
            return removed
        _request("DELETE", f"/object/{bucket}", {"prefixes": names})
        removed += len(names)
        if len(names) < _PAGE:
            return removed
