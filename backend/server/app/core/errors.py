"""AppError + HTTP status lookup. Codes and statuses come from public.error_codes (plan §3.3),
loaded once per process, so nothing here duplicates the catalogue."""
import logging
import re
import threading

log = logging.getLogger("server")

_PT = re.compile(r"^PT\d{3}$")


class AppError(Exception):
    def __init__(self, code: str, detail: str | None = None):
        super().__init__(code)
        self.code = code
        self.detail = detail


_catalogue: dict[str, int] | None = None
_lock = threading.Lock()


def status_for(code: str) -> int:
    global _catalogue
    if _catalogue is None:
        with _lock:
            if _catalogue is None:
                from . import db  # local import: db imports this module

                rows = db.query_service("select code, http_status from public.error_codes")
                _catalogue = {r[0]: int(r[1]) for r in rows}
    return _catalogue.get(code, 500)


def from_pg(exc: Exception) -> AppError:
    """Our RPCs raise SQLSTATE 'PT<status>' with message = catalogue code (00_core raise_error)."""
    sqlstate = getattr(exc, "sqlstate", None)
    diag = getattr(exc, "diag", None)
    if sqlstate and _PT.match(sqlstate) and diag is not None and diag.message_primary:
        return AppError(diag.message_primary, diag.message_detail)
    log.error("unexpected database error: %s %s", sqlstate, exc)
    return AppError("INTERNAL_ERROR")
