"""CSV export of reports (plan §5 reports-export). Runs the report RPCs as the caller, so
report.view, scope and range checks all happen in the database. The CSV is returned inside the
usual { data } envelope; size is capped by the report.export_max_rows setting."""
import math
import re
from typing import Any, Literal, Optional

from fastapi import APIRouter, Request
from pydantic import Field

from ..core import db
from ..core.authz import caller
from ..core.http import Body, endpoint
from ..core.validators import OffsetDateTime, Uuid

router = APIRouter()


class In(Body):
    report: Literal["redemptions", "redemptions_grouped"]
    business_id: Optional[Uuid] = None
    from_: OffsetDateTime = Field(alias="from")  # "from" is a Python keyword
    to: OffsetDateTime
    group_by: Optional[Literal["day", "month", "business", "offer", "executive"]] = None


_FORMULA = re.compile(r"^[=+\-@\t\r]")


def _text(v: Any) -> str:
    """Same text as JavaScript String(v) for JSON values (the Edge Function's output)."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, float) and math.isfinite(v) and v.is_integer():
        return str(int(v))
    return str(v)


def _cell(v: Any) -> str:
    """Quote every field; prefix spreadsheet formula starters so a cell is never evaluated."""
    s = _text(v)
    if _FORMULA.match(s):
        s = "'" + s
    return '"' + s.replace('"', '""') + '"'


def to_csv(cols: list[str], rows: list[dict[str, Any]]) -> str:
    return "\r\n".join([",".join(map(_cell, cols)), *(",".join(_cell(r.get(c)) for c in cols) for r in rows)])


@endpoint(router, "reports-export", In)
def reports_export(b: In, req: Request):
    ctx = caller(req).ctx
    base = [("p_business_id", b.business_id, "uuid"), ("p_from", b.from_, "timestamptz"), ("p_to", b.to, "timestamptz")]

    if b.report == "redemptions_grouped":
        rows = db.rpc(ctx, "report_redemptions", [*base, ("p_group_by", b.group_by or "day", "text")], returns="rows")
        cols = ["bucket", "label", "redemptions", "unique_customers", "bill_total"]
        return {"report": b.report, "rows": len(rows), "truncated": False, "csv": to_csv(cols, rows)}

    all_rows = db.rpc(ctx, "report_redemption_rows", base, returns="rows")
    max_rows = int(db.rpc(ctx, "report_export_max_rows"))
    rows = all_rows[:max_rows]
    cols = ["redeemed_at", "business", "offer", "executive", "customer_name", "phone_masked",
            "card_number", "bill_number", "bill_amount", "redemption_id"]
    return {"report": b.report, "rows": len(rows), "truncated": len(all_rows) > max_rows, "csv": to_csv(cols, rows)}
