"""Request handling, CORS and JSON responses (plan §1.2, §1.3). Same contract as the Edge Functions:
POST only, OPTIONS → 204, every response is { data } or { error: { code, detail } }."""
import ipaddress
import json
import logging
import re
import uuid
from typing import Any, Callable

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, TypeAdapter, ValidationError
from starlette.concurrency import run_in_threadpool

from .config import settings
from .errors import AppError, status_for

log = logging.getLogger("server")

_BEARER = re.compile(r"^Bearer\s+(.+)$", re.IGNORECASE)


def cors_headers(req: Request) -> dict[str, str]:
    origin = req.headers.get("origin")
    if not origin or origin not in settings().allowed_origins:
        return {}
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
    }


def _valid_ip(s: str | None) -> str | None:
    try:
        return str(ipaddress.ip_address(s)) if s else None
    except ValueError:
        return None


def client_ip(req: Request) -> str | None:
    """First X-Forwarded-For entry, as the Edge Functions do. Behind a proxy you do not control,
    this header can be spoofed; configure the host's proxy to set it. A value that is not an IP
    address is ignored (it would otherwise fail the database's inet cast)."""
    first = (req.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    return _valid_ip(first) or _valid_ip(req.client.host if req.client else None)


_RID = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


def request_id(req: Request) -> str:
    """Caller's x-request-id when it is safe to log, else a new one. Stable for the request."""
    rid = getattr(req.state, "request_id", None)
    if rid is None:
        given = req.headers.get("x-request-id") or ""
        rid = given if _RID.match(given) else uuid.uuid4().hex
        req.state.request_id = rid
    return rid


def bearer(req: Request) -> str:
    m = _BEARER.match(req.headers.get("authorization") or "")
    if not m:
        raise AppError("UNAUTHENTICATED")
    return m.group(1)


def db_headers(req: Request) -> dict[str, str]:
    """What the database reads from request.headers (private.request_ip, audit request id)."""
    out: dict[str, str] = {}
    ip = client_ip(req)
    if ip:
        out["x-forwarded-for"] = ip
    out["x-request-id"] = request_id(req)
    return out


def _json(req: Request, status: int, body: dict[str, Any]) -> Response:
    return JSONResponse(body, status_code=status, headers={**cors_headers(req), "x-request-id": request_id(req)})


async def _read_body(req: Request) -> bytes:
    """Reads at most MAX_BODY_BYTES; larger bodies are refused without buffering them whole."""
    limit = settings().MAX_BODY_BYTES
    declared = req.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > limit:
        raise AppError("VALIDATION_FAILED", "body_too_large")
    chunks, size = [], 0
    async for chunk in req.stream():
        size += len(chunk)
        if size > limit:
            raise AppError("VALIDATION_FAILED", "body_too_large")
        chunks.append(chunk)
    return b"".join(chunks)


def _validation_detail(e: ValidationError, tagged: bool) -> str:
    paths = []
    for err in e.errors():
        loc = list(err["loc"])
        if tagged and loc:  # drop the union tag pydantic adds to discriminated-union paths
            loc = loc[1:]
        paths.append(".".join(str(p) for p in loc))
    return ",".join(paths)


Handler = Callable[[Any, Request], Any]


def endpoint(router: APIRouter, name: str, schema: Any, *, tagged: bool = False) -> Callable[[Handler], Handler]:
    """Registers /functions/v1/<name>: validate → handler → map result/error."""
    adapter = TypeAdapter(schema)

    def register(fn: Handler) -> Handler:
        async def route(req: Request) -> Response:
            if req.method == "OPTIONS":
                return Response(status_code=204, headers=cors_headers(req))
            try:
                if req.method != "POST":
                    raise AppError("METHOD_NOT_ALLOWED")
                try:
                    raw = json.loads(await _read_body(req))
                except ValueError:
                    raw = None
                try:
                    body = adapter.validate_python(raw)
                except ValidationError as e:
                    raise AppError("VALIDATION_FAILED", _validation_detail(e, tagged)) from None
                data = await run_in_threadpool(fn, body, req)  # handlers use blocking db/http calls
                return _json(req, 200, {"data": data})
            except AppError as err:
                return await _error(req, err)
            except Exception:
                log.exception("unhandled error in %s (request %s)", name, request_id(req))
                return await _error(req, AppError("INTERNAL_ERROR"))

        router.add_api_route(f"/functions/v1/{name}", route, methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                             name=name)
        return fn

    return register


async def _error(req: Request, err: AppError) -> Response:
    try:
        status = await run_in_threadpool(status_for, err.code)
    except Exception:
        log.exception("error catalogue unavailable")
        status = 500
    error: dict[str, Any] = {"code": err.code}
    if err.detail is not None:
        error["detail"] = err.detail
    return _json(req, status, {"error": error})


async def error_response(req: Request, code: str, detail: str | None = None) -> Response:
    """Same error envelope for routes outside endpoint() (unknown paths, readiness)."""
    return await _error(req, AppError(code, detail))


class Strict(BaseModel):
    """Base for bodies that reject unknown keys (zod .strict())."""
    model_config = {"extra": "forbid"}


class Body(BaseModel):
    """Base for bodies that drop unknown keys (zod default)."""
    model_config = {"extra": "ignore"}
