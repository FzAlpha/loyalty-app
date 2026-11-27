"""Shared field types matching the zod schemas of the Edge Functions."""
import re
from datetime import date, datetime, timezone
from typing import Annotated

from pydantic import AfterValidator, StringConstraints


def Text(max_length: int, min_length: int = 0) -> type[str]:
    """Trimmed string (zod .trim().min().max())."""
    return Annotated[str, StringConstraints(strict=True, strip_whitespace=True, min_length=min_length,
                                            max_length=max_length)]  # type: ignore[return-value]


Uuid = Annotated[str, StringConstraints(strict=True, pattern=r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")]


def _past_date(s: str) -> str:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        raise ValueError("invalid date")
    try:
        d = date.fromisoformat(s)
    except ValueError:
        raise ValueError("invalid date") from None
    if datetime(d.year, d.month, d.day, tzinfo=timezone.utc) >= datetime.now(timezone.utc):
        raise ValueError("date in future")
    return s


PastDate = Annotated[str, StringConstraints(strict=True), AfterValidator(_past_date)]

_DT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$")


def _offset_datetime(s: str) -> str:
    if not _DT.match(s):
        raise ValueError("invalid datetime")
    try:
        datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("invalid datetime") from None
    return s


OffsetDateTime = Annotated[str, StringConstraints(strict=True), AfterValidator(_offset_datetime)]
