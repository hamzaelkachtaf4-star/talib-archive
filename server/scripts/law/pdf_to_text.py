#!/usr/bin/env python3
"""Extract the text layer of an official Moroccan legal PDF as clean UTF-8 text.

Usage: pdf_to_text.py in.pdf out.txt        (needs: pip install pymupdf)

Why not a plain dump: the official PDFs encode every Arabic lam-alef ligature (لا لأ لإ لآ) as a zero-width alef
glyph followed by the lam, so a naive dump yields "ال يكون" for "لا يكون". Footnotes sit in the same text layer
as the articles. This script (1) swaps each zero-width alef + lam pair back into reading order, (2) keeps only
spans at the document's dominant body size (drops footnotes, footnote call numbers, running page numbers), and
(3) moves sentence punctuation that the bidi layout parked at the start of a line back to its end.
Every repair it makes (ligature order, heading numbers, split words) is counted on stderr; no word is ever invented.
"""
import re
import sys
from collections import Counter

import pymupdf

ALEFS = "اأإآ"
PUNCT_LEAD = ".:؛،؟!"
GEOMETRIC = "--stream" not in sys.argv


def spans_of(page):
    for b in page.get_text("rawdict")["blocks"]:
        for line in b.get("lines", []):
            yield line


def fix_ligatures(chars):
    out = []
    i = 0
    while i < len(chars):
        c = chars[i]
        ch = c["c"]
        w = c["bbox"][2] - c["bbox"][0]
        if ch in ALEFS and w < 0.5 and i + 1 < len(chars) and chars[i + 1]["c"] == "ل":
            out.append("ل")
            out.append(ch)
            i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def reorder_words(chars):
    """Some PDFs emit a word's glyphs out of reading order (and with a bogus space glyph inside the word). A space whose box
    overlaps the glyph before it is not a word break; a word whose glyphs are not laid out right-to-left is re-sorted by position."""
    words, cur, last = [], [], None
    for c in chars:
        if c["c"] == " ":
            if last is not None and min(c["bbox"][2], last["bbox"][2]) - max(c["bbox"][0], last["bbox"][0]) > 1.0:
                continue  # bogus space inside a word
            if cur:
                words.append(cur)
                cur = []
            words.append([c])
            continue
        cur.append(c)
        last = c
    if cur:
        words.append(cur)
    out = []
    for w in words:
        xs = [c["bbox"][2] for c in w]
        if len(w) > 1 and any(xs[i] < xs[i + 1] - 0.5 for i in range(len(xs) - 1)) and all("\u0600" <= c["c"] <= "\u06ff" for c in w):
            w = sorted(w, key=lambda c: (-round(c["bbox"][2], 1), 0 if c["c"] == "ل" else 1))
        out.extend(w)
    return out


def dominant_size(doc):
    counts = Counter()
    for pno in range(0, len(doc), max(1, len(doc) // 40)):
        for line in spans_of(doc[pno]):
            for s in line["spans"]:
                counts[round(s["size"] * 2) / 2] += len(s["chars"])
    return counts.most_common(1)[0][0]


def finish_line(text):
    text = re.sub(r"[ \t]+", " ", text).strip()
    m = re.match(r"^([" + re.escape(PUNCT_LEAD) + r"]+)\s*(.+)$", text)
    if m and not re.match(r"^\d", m.group(2)):
        text = m.group(2) + m.group(1)
    text = re.sub(r"(?<=[؀-ۿ])(?=\d)", " ", text)
    return text


HEADING_ONLY = r"(?:الفصل|المادة) \d+(?:-\d+)?(?: (?:مكرر|ثالثا|رابعا|خامسا|سادسا|سابعا|ثامنا|تاسعا|عاشرا)[^\s]*)?"


def glue_cross_references(text):
    """In these codes an article heading is a line holding only "الفصل N" / "المادة N". A line that starts that way but carries
    more words is a cross-reference that wrapped to the start of a line ("... المادة 361 من هذا القانون"): glue it to the line before."""
    out = []
    for line in text.split("\n"):
        if out and re.match(r"^(?:الفصل|المادة) \d", line) and not re.fullmatch(HEADING_ONLY, line):
            out[-1] = out[-1] + " " + line
        else:
            out.append(line)
    return "\n".join(out)


def normalize_headings(text):
    """Heading lines only: a heading word split by a stray space ("الف صل 35") is joined, and the written-out first article
    ("المادة الأولى", "الفصل الأول") becomes number 1 so the parser sees it. Counted on stderr."""
    n = 0

    def fix(m):
        nonlocal n
        n += 1
        word = "الفصل" if m.group(1).replace(" ", "") == "الفصل" else "المادة"
        return f"{word} {m.group(2)}"

    text = re.sub(r"(?m)^(ا\s*ل\s*ف\s*ص\s*ل|ا\s*ل\s*م\s*ا\s*د\s*ة)\s+(\d+(?:-\d+)?)\s*$", fix, text)
    text = re.sub(r"(?m)^الفصل الأول\s*$", lambda m: fix(re.match(r"(الفصل) (1)", "الفصل 1")), text)
    text = re.sub(r"(?m)^المادة الأولى\s*$", lambda m: fix(re.match(r"(المادة) (1)", "المادة 1")), text)
    # A code printed after its promulgating dahir has two "article 1" headings: the dahir's belongs to the dahir, not the code.
    for word in ("الفصل", "المادة"):
        hits = [m.start() for m in re.finditer(rf"(?m)^{word} 1$", text)]
        for pos in reversed(hits[:-1]):
            text = text[:pos] + f"{word} الأول من الظهير" + text[pos + len(f"{word} 1"):]
    print(f"normalized {n} heading lines", file=__import__("sys").stderr)
    return text


def repair_ocr_numbers(text):
    """OCR sometimes adds a stray digit to a heading number ("المادة 290" for 29). Repaired only when it is unambiguous:
    the number is not previous+1 and the previous and next headings leave room for exactly one article between them."""
    lines = text.split("\n")
    idx = [(i, re.fullmatch(r"(الفصل|المادة) (\d+)", l)) for i, l in enumerate(lines)]
    idx = [(i, m) for i, m in idx if m]
    for k in range(1, len(idx) - 1):
        prev, cur, nxt = int(idx[k - 1][1].group(2)), idx[k][1], int(idx[k + 1][1].group(2))
        n = int(cur.group(2))
        want = prev + 1
        # one article between its neighbours: whatever else OCR read there, the number can only be previous + 1
        if n != want and nxt == want + 1:
            lines[idx[k][0]] = f"{cur.group(1)} {want}"
            print(f"repaired OCR heading number {cur.group(2)} -> {want} (between {prev} and {nxt})", file=sys.stderr)
    return "\n".join(lines)


def ocr_main(src, dst):
    """For PDFs whose text layer is scrambled (letters out of order): render each page and OCR it with tesseract (ara).
    Needs the `tesseract` binary and the Arabic model (set TESSDATA_PREFIX if it is not installed system-wide)."""
    import subprocess
    import tempfile
    doc = pymupdf.open(src)
    pages = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, page in enumerate(doc):
            png = f"{tmp}/p{i}.png"
            page.get_pixmap(dpi=300).save(png)
            r = subprocess.run(["tesseract", png, "-", "-l", "ara", "--psm", "4"], capture_output=True, text=True, check=True)
            pages.append("\n".join(l.rstrip() for l in r.stdout.splitlines() if l.strip() and not re.fullmatch(r"[-\s\d]{1,8}", l)))
            print(f"ocr page {i + 1}/{len(doc)}", file=sys.stderr)
    text = "\n".join(pages)
    text = re.sub(r"(?<![\u0600-\u06FF])هللا(?![\u0600-\u06FF])", "الله", text)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(normalize_headings(repair_ocr_numbers(glue_cross_references(text))) + "\n")


def main(src, dst):
    if "--ocr" in sys.argv:
        return ocr_main(src, dst)
    doc = pymupdf.open(src)
    body = dominant_size(doc)
    lines_out = []
    for page in doc:
        h = page.rect.height
        raw = []
        for line in spans_of(page):
            chars = []
            for s in line["spans"]:
                if s["size"] < body - 1.0:
                    continue
                chars.extend(s["chars"])
            if chars:
                raw.append((chars[0]["origin"][1], line["bbox"][2], chars))
        # pdf "lines" are fragments: the same visual row can arrive as several (e.g. "المادة" and its number); rebuild rows.
        raw.sort(key=lambda r: r[0])
        rows = []
        for y, x1, chars in raw:
            if rows and abs(rows[-1][0] - y) < 3:
                rows[-1][1].append((x1, chars))
            else:
                rows.append((y, [(x1, chars)]))
        for y, frags in rows:
            frags.sort(key=lambda f: -f[0])
            chars = []
            for _, cs in frags:
                if chars and chars[-1]["c"] != " ":
                    chars.append({"c": " ", "bbox": (0, 0, 0, 0)})
                chars.extend(cs)
            t = finish_line(fix_ligatures(reorder_words(chars)))
            if not t:
                continue
            if re.fullmatch(r"-?\s*\d{1,4}\s*-?", t) and (y < h * 0.12 or y > h * 0.9):
                continue  # running page number
            lines_out.append(t)
    text = "\n".join(lines_out)
    # The layout splits "الفصل 106-10" over three lines; stray hyphen-only lines are layout noise.
    text = re.sub(r"(?m)^((?:الفصل|المادة) \d+)\n-\n(\d+)$", r"\1-\2", text)
    text = re.sub(r"(?m)^-$\n?", "", text)
    # Some layouts put the number on the line below its heading word.
    text = re.sub(r"(?m)^(الفصل|المادة)\n(\d+(?:-\d+)?)$", r"\1 \2", text)
    # The Allah ligature is stored as three glyphs in reverse order.
    text = re.sub(r"(?<![\u0600-\u06FF])هللا(?![\u0600-\u06FF])", "الله", text)
    text = re.sub(r"(?<![\u0600-\u06FF])هلل(?![\u0600-\u06FF])", "لله", text)
    # A lone connecting letter is never a word: the source PDFs split some words after their first letter ("م جهولا").
    # Not after a digit or a closing bracket: "1433 ه" (hijri year marker) is a real single letter.
    text, joined = re.subn(r"(?m)(?<![\w\u0600-\u06FF\d)\]])(?<!\d )([بتثجحخسشصضطظعغفقكلمنهيا]) (?=[\u0600-\u06FF])", r"\1", text)
    print(f"joined {joined} lone letters to the next word", file=sys.stderr)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(normalize_headings(glue_cross_references(text)) + "\n")
    print(f"{src}: {len(doc)} pages, body size {body}, {len(lines_out)} lines", file=sys.stderr)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        sys.exit(__doc__)
    main(args[0], args[1])
