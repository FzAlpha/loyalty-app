"""Customer self-service account deletion (plan §5, §12). The RPC runs as the caller, so only the
caller's own account can be deleted. The auth user is removed later by jobs-runner."""
from fastapi import APIRouter, Request

from ..core import db
from ..core.authz import caller
from ..core.http import Strict, endpoint

router = APIRouter()


class In(Strict):
    pass


@endpoint(router, "account-deletion", In)
def account_deletion(_b: In, req: Request):
    return db.rpc(caller(req).ctx, "request_account_deletion")
