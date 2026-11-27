"""FastAPI app (plan §1.3). Same routes and contract as the Edge Functions, which stay deployed."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from .core import auth_api, db, errors
from .core.config import settings
from .core.http import cors_headers, error_response
from .routes import (account_deletion, auth_recover, auth_register, auth_sign_in, card_batches, jobs_runner,
                     partner_apply, reports_export, staff_admin)

ROUTERS = [account_deletion, auth_recover, auth_register, auth_sign_in, card_batches, jobs_runner,
           partner_apply, reports_export, staff_admin]


log = logging.getLogger("server")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logging.basicConfig(level=settings().LOG_LEVEL.upper())
    db.pool()  # starts connecting in the background; never blocks start-up
    try:  # warm the error catalogue; on failure it loads on first use instead
        await run_in_threadpool(errors.status_for, "INTERNAL_ERROR")
    except Exception:
        log.warning("error catalogue not loaded at start-up (database unreachable?)")
    yield
    db.close_pool()
    auth_api.close()


def create_app() -> FastAPI:
    app = FastAPI(title="Rewards-app server", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    for module in ROUTERS:
        app.include_router(module.router)

    @app.get("/health")
    def health(req: Request):
        """Liveness for the apps' server switcher. Says nothing about the database."""
        return JSONResponse({"data": {"ok": True}}, headers=cors_headers(req))

    @app.get("/health/ready")
    async def ready(req: Request):
        """Readiness for a host/load balancer: 503 while the database is unreachable."""
        if await run_in_threadpool(db.ping):
            return JSONResponse({"data": {"ok": True}}, headers=cors_headers(req))
        return JSONResponse({"error": {"code": "INTERNAL_ERROR", "detail": "database"}}, status_code=503,
                            headers=cors_headers(req))

    @app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                   include_in_schema=False)
    async def not_found(req: Request, path: str):
        return await error_response(req, "NOT_FOUND")

    return app


app = create_app()
