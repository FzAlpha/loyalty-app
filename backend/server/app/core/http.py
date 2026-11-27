"""Request handling, CORS and JSON responses (plan §1.2, §1.3). Same contract as the Edge Functions:
POST only, OPTIONS → 204, every response is { data } or { error: { code, detail } }."""
import json
import logging
import re
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


def client_ip(req: Request) -> str | None:
    """First X-Forwarded-For entry, as the Edge Functions do. Behind a proxy you do not control,
    this header can be spoofed; configure the host's proxy to set it."""
    first = (req.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    if first:
        return first
    return req.client.host if req.client else None


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
    rid = req.headers.get("x-request-id")
    if rid:
        out["x-request-id"] = rid
    return out


def _json(req: Request, status: int, body: dict[str, Any]) -> Response:
    return JSONResponse(body, status_code=status, headers=cors_headers(req))


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
                    raw = json.loads(await req.body())
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
                log.exception("unhandled error in %s", name)
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


class Strict(BaseModel):
    """Base for bodies that reject unknown keys (zod .strict())."""
    model_config = {"extra": "forbid"}


class Body(BaseModel):
    """Base for bodies that drop unknown keys (zod default)."""
    model_config = {"extra": "ignore"}
