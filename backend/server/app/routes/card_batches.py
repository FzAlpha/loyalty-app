"""Owner-only card batch creation (plan §6). The database generates the tokens, keeps only their
hashes and checks card.batch.create for the caller; the plain QR payloads are returned once here."""
from typing import Annotated

from fastapi import APIRouter, Request
from pydantic import Field

from ..core import db
from ..core.authz import caller
from ..core.http import Body, endpoint
from ..core.validators import Text

router = APIRouter()


class In(Body):
    label: Text(200, 1)
    quantity: Annotated[int, Field(strict=True, gt=0)]  # upper bound is the cards.batch_max_quantity setting


@endpoint(router, "card-batches", In)
def card_batches(b: In, req: Request):
    rows = db.rpc(caller(req).ctx, "create_card_batch",
                  [("p_label", b.label, "text"), ("p_quantity", b.quantity, "integer")], returns="rows")
    csv = "\n".join(["card_number,qr_payload", *(f"{r['card_number']},{r['qr_payload']}" for r in rows)])
    return {"count": len(rows), "cards": rows, "csv": csv}
