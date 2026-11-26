"""Builds PDFs from fake batches (made-up tokens in the real GR.C.1 format) and decodes the QRs back."""
import base64
import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import card_generator as cg  # noqa: E402

cv2 = pytest.importorskip("cv2")
np = pytest.importorskip("numpy")
pdfium = pytest.importorskip("pypdfium2")


def fake_payload() -> str:
    # Same shape as private.card_qr_payload: prefix.kind.version.base64url(16 random bytes), no padding.
    return "GR.C.1." + base64.urlsafe_b64encode(os.urandom(16)).decode().rstrip("=")


def write_csv(path: Path, n: int, start: int = 1) -> list[cg.Card]:
    cards = [cg.Card(f"GR-{i:06d}", fake_payload()) for i in range(start, start + n)]
    # Matches the card-batches Edge Function: header line, "\n" separators, no trailing newline.
    path.write_text("\n".join(["card_number,qr_payload"] + [f"{c.number},{c.payload}" for c in cards]),
                    encoding="utf-8")
    return cards


def decode_pages(pdf: Path, scale: float = 300 / 72) -> list[set[str]]:
    det = cv2.QRCodeDetector()
    out = []
    doc = pdfium.PdfDocument(str(pdf))
    try:
        for page in doc:
            img = np.array(page.render(scale=scale).to_pil().convert("L"))
            found: set[str] = set()
            ok, texts, _, _ = det.detectAndDecodeMulti(img)
            if ok:
                found.update(t for t in texts if t)
            out.append(found)
    finally:
        doc.close()
    return out


def decode_each_card(pdf: Path, cards: list[cg.Card], lay: cg.Layout, scale: float = 300 / 72) -> list[str]:
    """Crop every card cell on page 1 and decode it on its own (robust against multi-detect misses)."""
    det = cv2.QRCodeDetector()
    doc = pdfium.PdfDocument(str(pdf))
    try:
        img = np.array(doc[0].render(scale=scale).to_pil().convert("L"))
    finally:
        doc.close()
    grid_w = lay.cols * lay.card_w + (lay.cols - 1) * lay.gap
    grid_h = lay.rows * lay.card_h + (lay.rows - 1) * lay.gap
    x0 = (lay.page_w - grid_w) / 2
    y0 = (lay.page_h - grid_h) / 2  # from the top in image coordinates
    texts = []
    for i in range(min(len(cards), lay.per_page)):
        r, c = divmod(i, lay.cols)
        left = int((x0 + c * (lay.card_w + lay.gap)) * scale)
        top = int((y0 + r * (lay.card_h + lay.gap)) * scale)
        crop = img[top:top + int(lay.card_h * scale), left:left + int(lay.card_w * scale)]
        text, _, _ = det.detectAndDecode(crop)
        texts.append(text)
    return texts


def test_pdf_qrs_decode_to_exact_payloads(tmp_path):
    src = tmp_path / "batch.csv"
    cards = write_csv(src, 11)  # 8 per page by default -> 2 pages
    out = tmp_path / "cards.pdf"
    assert cg.main([str(src), "-o", str(out), "--heading", "Membership"]) == 0

    args = cg.parse_args([str(src), "-o", str(out)])
    lay = cg.make_layout(args)
    assert (lay.cols, lay.rows) == (2, 4)

    doc = pdfium.PdfDocument(str(out))
    assert len(doc) == 2
    doc.close()

    assert decode_each_card(out, cards, lay) == [c.payload for c in cards[:8]]

    pages = decode_pages(out)
    assert set().union(*pages) <= {c.payload for c in cards}
    assert len(pages[1]) >= 1


def test_json_response_input_and_custom_grid(tmp_path):
    cards = [cg.Card(f"GR-{i:06d}", fake_payload()) for i in range(1, 4)]
    body = {"data": {"count": 3, "cards": [{"card_number": c.number, "qr_payload": c.payload} for c in cards],
                     "csv": "unused"}}
    src = tmp_path / "resp.json"
    src.write_text(json.dumps(body), encoding="utf-8")
    assert cg.load_cards(src) == cards

    out = tmp_path / "cards.pdf"
    assert cg.main([str(src), "-o", str(out), "--cols", "1", "--rows", "3", "--no-logo"]) == 0
    lay = cg.make_layout(cg.parse_args([str(src), "-o", str(out), "--cols", "1", "--rows", "3"]))
    assert decode_each_card(out, cards, lay) == [c.payload for c in cards]


def test_errors_never_show_payloads(tmp_path, capsys):
    p = fake_payload()
    src = tmp_path / "dup.csv"
    src.write_text(f"card_number,qr_payload\nGR-000001,{p}\nGR-000002,{p}", encoding="utf-8")
    assert cg.main([str(src), "-o", str(tmp_path / "x.pdf")]) == 1
    err = capsys.readouterr()
    assert "duplicate" in err.err
    assert p not in err.err + err.out
    assert p.split(".")[-1] not in err.err + err.out


@pytest.mark.parametrize("content,needle", [
    ("number,payload\nGR-000001,x", "missing"),
    ("card_number,qr_payload\n,GR.C.1.abc", "empty card_number"),
    ("card_number,qr_payload\nGR-000001,", "empty qr_payload"),
    ("card_number,qr_payload\nGR-000001, GR.C.1.abc", "whitespace"),
    ("card_number,qr_payload\n", "no cards"),
])
def test_bad_input_rejected(tmp_path, content, needle):
    src = tmp_path / "bad.csv"
    src.write_text(content, encoding="utf-8")
    with pytest.raises(cg.InputError, match=needle):
        cg.load_cards(src)


def test_grid_that_does_not_fit_is_rejected(tmp_path):
    with pytest.raises(cg.InputError, match="do not fit"):
        cg.make_layout(cg.parse_args(["in.csv", "-o", "x.pdf", "--cols", "3"]))


def test_refuses_to_overwrite(tmp_path):
    src = tmp_path / "b.csv"
    write_csv(src, 1)
    out = tmp_path / "o.pdf"
    out.write_bytes(b"keep")
    assert cg.main([str(src), "-o", str(out)]) == 1
    assert out.read_bytes() == b"keep"
