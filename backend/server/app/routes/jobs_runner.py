"""Jobs that need the Auth Admin API (plan §9). No user JWT: the caller must present the shared
secret JOBS_RUNNER_SECRET in x-jobs-secret."""
import hashlib
import hmac
import logging
from typing import Literal

from fastapi import APIRouter, Request

from ..core import auth_api, db, storage_api
from ..core.authz import service
from ..core.config import settings
from ..core.errors import AppError
from ..core.http import Body, endpoint

router = APIRouter()
log = logging.getLogger("server")


class In(Body):
    job: Literal["process_deletions"]


def secret_matches(given: str, expected: str) -> bool:
    # Compares fixed-length digests so the time taken does not depend on where the inputs differ.
    return hmac.compare_digest(hashlib.sha256(given.encode()).digest(), hashlib.sha256(expected.encode()).digest())


@endpoint(router, "jobs-runner", In)
def jobs_runner(_b: In, req: Request):
    expected = settings().JOBS_RUNNER_SECRET
    if not expected or len(expected) < 32:
        raise AppError("JOBS_NOT_CONFIGURED")
    if not secret_matches(req.headers.get("x-jobs-secret") or "", expected):
        raise AppError("FORBIDDEN")

    svc = service(req)
    limit = int(db.rpc(svc, "svc_get_setting", [("p_key", "jobs.process_deletions.batch_size", "text")]))
    due = db.rpc(svc, "svc_claim_due_deletions", [("p_limit", limit, "integer")], returns="rows")

    avatar_bucket = None
    completed = failed = 0
    for r in due:
        # Soft delete: Auth marks the user deleted and anonymises it; the row stays, so the profile
        # and its redemptions (foreign keys without cascade) remain valid.
        message = None
        try:
            auth_api.delete_user(r["user_id"], should_soft_delete=True)
        except auth_api.AuthApiError as e:
            message = f"{e.status or ''} {e.code or 'error'}".strip()
            log.error("deleteUser failed %s %s", r["request_id"], message)
        if message is None:
            # Profile photos (§10). Best effort: a failure is logged and does not undo the deletion;
            # the profile's avatar_path was already cleared when the deletion was requested.
            if avatar_bucket is None:
                avatar_bucket = str(db.rpc(svc, "svc_get_setting", [("p_key", "storage.bucket.customer_avatars", "text")]))
            try:
                storage_api.remove_folder(avatar_bucket, r["user_id"])
            except storage_api.StorageApiError as e:
                log.error("avatar cleanup failed %s %s", r["request_id"], e.status)
        db.rpc(svc, "svc_complete_deletion", [("p_request_id", r["request_id"], "uuid"), ("p_error", message, "text")],
               returns="void")
        if message:
            failed += 1
        else:
            completed += 1
    return {"job": "process_deletions", "claimed": len(due), "completed": completed, "failed": failed}
