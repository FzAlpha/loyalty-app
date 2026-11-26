# card-generator

Turns a card-batch export into printable A4 PDF sheets of membership cards. Each card shows a QR code
that encodes the exact `qr_payload` text (unchanged) and the printed card number.

It reads a local file only: no database, no network, no keys.

## ⚠ The input and the output are secrets

Each `qr_payload` (`GR.C.1.<token>`) contains the card's secret token. Anyone holding it can request
that card for their own account before the real customer does (in-store approval still applies). The database stores only a hash, so the
export is the **only** copy of the tokens.

- Keep the CSV/JSON export and the PDF on one trusted machine (no email, chat or shared drives).
- Print, check the sheets, then **delete the CSV/JSON and the PDF**, and empty the recycle bin.
- Never commit them. This folder's `.gitignore` ignores `*.csv`, `*.json` and `*.pdf`.
- The tool never prints or logs payloads. Error messages name the row and card number only.
- Lost or leaked sheets: block those cards (`api.block_card`) and print a new batch.

## Input

The `card-batches` Edge Function (owner only) returns, **once**:

```json
{ "data": { "count": 3, "cards": [{ "card_number": "GR-000001", "qr_payload": "GR.C.1.…" }], "csv": "card_number,qr_payload\n…" } }
```

The tool accepts either:
- a CSV with the header `card_number,qr_payload` (the `csv` string saved to a file), or
- the whole saved JSON response (it reads `data.cards`, or `data.csv` as a fallback).

The tool rejects empty values, duplicates, and payloads with whitespace or non-ASCII characters. It does
not check the `GR.C.1` format itself, because the prefix, kind and version are database settings.

## Setup (Windows, PowerShell)

```powershell
cd tools\card-generator
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

## Usage

```powershell
.venv\Scripts\python card_generator.py batch.csv -o cards.pdf --heading "Membership"
```

Defaults: portrait A4, ID-1 cards (85.6 × 54 mm), 10 mm margin, 5 mm gap, which gives 2 × 4 = 8 cards
per page with the grid centred. All layout values are flags (in mm unless noted):

| Flag | Default | Meaning |
|---|---|---|
| `--card-width` / `--card-height` | 85.6 / 54 | card size |
| `--margin` / `--gap` / `--padding` | 10 / 5 / 4 | page margin, gap between cards, inner padding |
| `--cols` / `--rows` | as many as fit | grid size (refused if it does not fit) |
| `--landscape` | off | landscape A4 |
| `--corner-radius`, `--border-width` (pt), `--no-border` | 3.18, 0.5 | card outline, also the cut line |
| `--logo PATH` / `--no-logo` | `packages/ui/assets/brand/chirag-emblem.png` | logo above the number |
| `--heading TEXT`, `--heading-size` (pt) | none, 9 | small text above the logo |
| `--number-size` (pt) | 14 | card number font size (shrinks to fit) |
| `--colors PATH` | `packages/ui/src/theme/colors.json` | outline `gold`, number `bg`, heading `goldDark` |
| `--ecc l\|m\|q\|h` | m | minimum QR error correction (segno raises it when the size allows) |
| `--quiet-zone` | 4 | white border around the QR, in modules |
| `--force` | off | overwrite an existing PDF |
| `--title` | "Membership cards" | PDF title metadata |

The QR is always black on white and drawn as vector shapes, so it stays sharp at any printer resolution.
Card numbers are text; payloads exist only as QR shapes in the PDF.

## Tests

```powershell
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python -m pytest -q tests
```

The tests use made-up payloads in the real format (`GR.C.1.` + base64url of 16 random bytes). They
render the PDF at 300 dpi with pypdfium2, decode every QR on the first page with OpenCV, and check that
the decoded text matches the input exactly. They also cover JSON input, bad rows, a grid that does not
fit, overwrite protection, and that error output never contains a payload.

## Limitations (honest)

- **Not tested on a real printer, real card stock or a phone camera.** Only on-screen rendering was
  decoded. Print a test sheet and scan a few cards with the customer app (and test `link_card` on a dev
  database) before a full run.
- Printer scaling: print at **100% / "Actual size"**, not "Fit to page", or the card size will be off.
- No bleed, crop marks or imposition for a professional print shop. The outline is a simple cut guide.
  If a print shop needs a different format, ask them for their spec.
- The emblem image is a low-resolution crop made for a dark background (see
  `packages/ui/assets/brand/README.md`), so its thin outline looks faint on white. Use `--no-logo` or
  pass the client's original artwork with `--logo` when it arrives.
- Only A4 paper. Only Latin text (Helvetica): headings with other scripts will not render.
- Runtime and tests were checked only with Python 3.15.2 on Windows 11.
- Not part of CI yet.
