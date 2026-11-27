"""FastAPI app (plan §1.3). Same routes and contract as the Edge Functions, which stay deployed."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .core import auth_api, db
from .core.config import settings
from .core.http import cors_headers
from .routes import (account_deletion, auth_recover, auth_register, auth_sign_in, card_batches, jobs_runner,
                     partner_apply, reports_export, staff_admin)

ROUTERS = [account_deletion, auth_recover, auth_register, auth_sign_in, card_batches, jobs_runner,
           partner_apply, reports_export, staff_admin]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logging.basicConfig(level=settings().LOG_LEVEL.upper())
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

    return app


app = create_app()
