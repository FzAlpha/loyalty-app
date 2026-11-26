"""Print sheets of membership cards from a card-batch export.

Reads the one-time export returned by the `card-batches` Edge Function (a CSV with the columns
`card_number,qr_payload`, or the saved JSON response) and writes an A4 PDF grid of cards. Each card
shows a QR code that encodes the exact `qr_payload` text and the printed card number.

No database access, no network, no secrets. The QR payloads ARE secrets (they hold the card token),
so this tool never prints or logs them; errors name the row number only.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path

import segno
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

TOOL_DIR = Path(__file__).resolve().parent
REPO_ROOT = TOOL_DIR.parent.parent
DEFAULT_COLORS = REPO_ROOT / "packages" / "ui" / "src" / "theme" / "colors.json"
DEFAULT_LOGO = REPO_ROOT / "packages" / "ui" / "assets" / "brand" / "chirag-emblem.png"

# Column names produced by backend/supabase/functions/card-batches (do not rename).
COL_NUMBER = "card_number"
COL_PAYLOAD = "qr_payload"

# Which colors.json keys are used for which part of the card (values come from the file).
COLOR_ROLES = {"border": "gold", "number": "bg", "heading": "goldDark"}


class InputError(Exception):
    """Bad input. Messages never contain a payload."""


@dataclass(frozen=True)
class Card:
    number: str
    payload: str


@dataclass(frozen=True)
class Layout:
    page_w: float
    page_h: float
    card_w: float
    card_h: float
    margin: float
    gap: float
    cols: int
    rows: int
    padding: float

    @property
    def per_page(self) -> int:
        return self.cols * self.rows


# ------------------------------------------------------------------------------------------ input
def _rows_from_json(text: str) -> list[dict]:
    try:
        doc = json.loads(text)
    except json.JSONDecodeError as e:
        raise InputError(f"input looks like JSON but cannot be parsed (line {e.lineno})") from None
    if isinstance(doc, dict) and isinstance(doc.get("data"), dict):
        doc = doc["data"]  # Edge Function envelope: {"data": {count, cards, csv}}
    if isinstance(doc, dict) and isinstance(doc.get("cards"), list):
        return doc["cards"]
    if isinstance(doc, dict) and isinstance(doc.get("csv"), str):
        return _rows_from_csv(doc["csv"])
    raise InputError("JSON input must contain 'cards' (list) or 'csv' (string), optionally under 'data'")


def _rows_from_csv(text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text))
    fields = [f.strip() for f in (reader.fieldnames or [])]
    missing = [c for c in (COL_NUMBER, COL_PAYLOAD) if c not in fields]
    if missing:
        raise InputError(f"CSV header must contain {COL_NUMBER},{COL_PAYLOAD}; missing: {', '.join(missing)}")
    reader.fieldnames = fields
    return list(reader)


def load_cards(path: Path) -> list[Card]:
    text = path.read_text(encoding="utf-8-sig")
    rows = _rows_from_json(text) if text.lstrip().startswith("{") else _rows_from_csv(text)
    if not rows:
        raise InputError("input contains no cards")

    cards: list[Card] = []
    seen_numbers: set[str] = set()
    seen_payloads: set[str] = set()
    for i, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise InputError(f"row {i}: not a record")
        number = str(row.get(COL_NUMBER) or "").strip()
        payload = row.get(COL_PAYLOAD)
        payload = payload if isinstance(payload, str) else ""
        if not number:
            raise InputError(f"row {i}: empty {COL_NUMBER}")
        if not payload:
            raise InputError(f"row {i} ({number}): empty {COL_PAYLOAD}")
        # The payload is encoded unchanged; reject anything that suggests the file was mangled.
        if payload != payload.strip() or any(ch.isspace() for ch in payload) or not payload.isascii():
            raise InputError(f"row {i} ({number}): {COL_PAYLOAD} contains whitespace or non-ASCII characters")
        if number in seen_numbers:
            raise InputError(f"row {i}: duplicate card number {number}")
        if payload in seen_payloads:
            raise InputError(f"row {i} ({number}): duplicate {COL_PAYLOAD}")
        seen_numbers.add(number)
        seen_payloads.add(payload)
        cards.append(Card(number, payload))
    return cards


def load_colors(path: Path) -> dict[str, HexColor]:
    data = json.loads(path.read_text(encoding="utf-8"))
    out = {}
    for role, key in COLOR_ROLES.items():
        if key not in data:
            raise InputError(f"{path.name} has no '{key}' color")
        out[role] = HexColor(data[key])
    return out


# ----------------------------------------------------------------------------------------- layout
def make_layout(args: argparse.Namespace) -> Layout:
    page_w, page_h = landscape(A4) if args.landscape else A4
    card_w, card_h = args.card_width * mm, args.card_height * mm
    margin, gap, padding = args.margin * mm, args.gap * mm, args.padding * mm
    avail_w, avail_h = page_w - 2 * margin, page_h - 2 * margin

    fit_cols = math.floor((avail_w + gap) / (card_w + gap))
    fit_rows = math.floor((avail_h + gap) / (card_h + gap))
    cols = args.cols or fit_cols
    rows = args.rows or fit_rows
    if cols < 1 or rows < 1 or cols > fit_cols or rows > fit_rows:
        raise InputError(
            f"{cols or 0} x {rows or 0} cards do not fit on the page "
            f"(max {fit_cols} x {fit_rows} with these card size, margin and gap values)"
        )
    if 2 * padding >= min(card_w, card_h):
        raise InputError("padding is too large for the card size")
    return Layout(page_w, page_h, card_w, card_h, margin, gap, cols, rows, padding)


# ---------------------------------------------------------------------------------------- drawing
def draw_qr(c: canvas.Canvas, payload: str, x: float, y: float, size: float, error: str, border: int) -> None:
    """Draw the QR as vector squares (sharp at any print resolution). (x, y) is the bottom-left."""
    qr = segno.make(payload, error=error, micro=False)
    matrix = [list(r) for r in qr.matrix_iter(scale=1, border=border)]
    n = len(matrix)
    module = size / n
    c.setFillColor(white)
    c.rect(x, y, size, size, stroke=0, fill=1)
    c.setFillColor(black)
    for r, row in enumerate(matrix):
        top = y + size - (r + 1) * module
        col = 0
        while col < n:  # merge runs of dark modules into one rectangle
            if row[col]:
                start = col
                while col < n and row[col]:
                    col += 1
                c.rect(x + start * module, top, (col - start) * module, module, stroke=0, fill=1)
            else:
                col += 1


def fit_font(c: canvas.Canvas, text: str, font: str, max_size: float, max_width: float) -> float:
    size = max_size
    while size > 4 and c.stringWidth(text, font, size) > max_width:
        size -= 0.5
    return size


def draw_card(c, card: Card, x, y, lay: Layout, colors, logo, args) -> None:
    w, h, p = lay.card_w, lay.card_h, lay.padding
    c.setFillColor(white)
    c.rect(x, y, w, h, stroke=0, fill=1)
    if not args.no_border:
        c.setStrokeColor(colors["border"])
        c.setLineWidth(args.border_width)
        c.roundRect(x, y, w, h, args.corner_radius * mm, stroke=1, fill=0)

    qr_size = min(h - 2 * p, w * 0.6)
    draw_qr(c, card.payload, x + p, y + (h - qr_size) / 2, qr_size, args.ecc, args.quiet_zone)

    # Right-hand column: optional logo, optional heading, card number.
    col_x = x + p + qr_size + p
    col_w = x + w - p - col_x
    centre = col_x + col_w / 2
    font = "Helvetica-Bold"
    num_size = fit_font(c, card.number, font, args.number_size, col_w)
    c.setFillColor(colors["number"])
    c.setFont(font, num_size)
    c.drawCentredString(centre, y + p, card.number)

    top = y + h - p
    if args.heading:
        hs = fit_font(c, args.heading, "Helvetica", args.heading_size, col_w)
        top -= hs
        c.setFillColor(colors["heading"])
        c.setFont("Helvetica", hs)
        c.drawCentredString(centre, top, args.heading)
        top -= hs * 0.4
    if logo is not None:
        space = top - (y + p + num_size * 1.6)
        size = min(col_w, space)
        if size > 2 * mm:
            c.drawImage(logo, centre - size / 2, top - size, size, size,
                        mask="auto", preserveAspectRatio=True, anchor="c")


def build_pdf(cards: list[Card], out: Path, lay: Layout, colors, logo_path: Path | None, args) -> int:
    logo = ImageReader(str(logo_path)) if logo_path else None
    c = canvas.Canvas(str(out), pagesize=(lay.page_w, lay.page_h), invariant=1)
    c.setTitle(args.title)
    pages = 0
    grid_w = lay.cols * lay.card_w + (lay.cols - 1) * lay.gap
    grid_h = lay.rows * lay.card_h + (lay.rows - 1) * lay.gap
    x0 = (lay.page_w - grid_w) / 2
    y_top = (lay.page_h + grid_h) / 2
    for start in range(0, len(cards), lay.per_page):
        for i, card in enumerate(cards[start:start + lay.per_page]):
            r, col = divmod(i, lay.cols)
            x = x0 + col * (lay.card_w + lay.gap)
            y = y_top - (r + 1) * lay.card_h - r * lay.gap
            draw_card(c, card, x, y, lay, colors, logo, args)
        c.showPage()
        pages += 1
    c.save()
    return pages


# -------------------------------------------------------------------------------------------- CLI
def parse_args(argv: list[str] | None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="Make printable A4 PDF sheets of membership cards from a card-batch export.")
    ap.add_argument("input", type=Path, help="CSV (card_number,qr_payload) or saved card-batches JSON response")
    ap.add_argument("-o", "--output", type=Path, required=True, help="PDF file to write")
    ap.add_argument("--force", action="store_true", help="overwrite the output file if it exists")
    g = ap.add_argument_group("layout (millimetres)")
    g.add_argument("--card-width", type=float, default=85.6, help="card width (default 85.6, ID-1 size)")
    g.add_argument("--card-height", type=float, default=54.0, help="card height (default 54.0, ID-1 size)")
    g.add_argument("--margin", type=float, default=10.0, help="minimum page margin (default 10)")
    g.add_argument("--gap", type=float, default=5.0, help="space between cards (default 5)")
    g.add_argument("--padding", type=float, default=4.0, help="space inside the card edge (default 4)")
    g.add_argument("--corner-radius", type=float, default=3.18, help="border corner radius (default 3.18)")
    g.add_argument("--cols", type=int, default=0, help="cards across (default: as many as fit)")
    g.add_argument("--rows", type=int, default=0, help="cards down (default: as many as fit)")
    g.add_argument("--landscape", action="store_true", help="landscape A4 instead of portrait")
    s = ap.add_argument_group("look")
    s.add_argument("--colors", type=Path, default=DEFAULT_COLORS, help="theme colors JSON (default: packages/ui)")
    s.add_argument("--logo", type=Path, default=DEFAULT_LOGO, help="logo image (default: brand emblem)")
    s.add_argument("--no-logo", action="store_true", help="leave the logo out")
    s.add_argument("--heading", default="", help="optional text above the card number, e.g. 'Membership'")
    s.add_argument("--heading-size", type=float, default=9.0, help="heading font size in points (default 9)")
    s.add_argument("--number-size", type=float, default=14.0, help="card number font size in points (default 14)")
    s.add_argument("--no-border", action="store_true", help="do not draw the card outline (cut line)")
    s.add_argument("--border-width", type=float, default=0.5, help="outline width in points (default 0.5)")
    s.add_argument("--title", default="Membership cards", help="PDF document title")
    q = ap.add_argument_group("QR")
    q.add_argument("--ecc", choices=["l", "m", "q", "h"], default="m",
                   help="minimum error correction level (default m; segno raises it if it fits)")
    q.add_argument("--quiet-zone", type=int, default=4, help="quiet zone in modules (default 4, the QR standard)")
    return ap.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.output.exists() and not args.force:
            raise InputError(f"{args.output} exists; use --force to overwrite")
        if args.quiet_zone < 4:
            print("warning: a quiet zone under 4 modules may not scan reliably", file=sys.stderr)
        cards = load_cards(args.input)
        lay = make_layout(args)
        colors = load_colors(args.colors)
        logo = None
        if not args.no_logo:
            if not args.logo.is_file():
                raise InputError(f"logo not found: {args.logo} (use --no-logo to leave it out)")
            logo = args.logo
        pages = build_pdf(cards, args.output, lay, colors, logo, args)
    except (InputError, OSError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    except (csv.Error, UnicodeDecodeError):
        print("error: input is not a readable UTF-8 CSV/JSON file", file=sys.stderr)
        return 1
    print(f"wrote {len(cards)} cards on {pages} page(s) ({lay.cols} x {lay.rows} per page) to {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
