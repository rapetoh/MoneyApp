#!/usr/bin/env python3
"""
Build the fonts the web/desktop PDF export embeds (dashboard/export/page.tsx).

Why this exists
---------------
jsPDF's built-in "standard 14" fonts (helvetica/times) are WinAnsi-only.
Anything outside that 8-bit table — the typographic minus U+2212 the app
uses on every debit, the → in a date range, a narrow no-break space that
`Intl.NumberFormat` emits for fr/de, ₹/₦/₩ — printed as a stray glyph
with a bogus advance width, which smeared every amount column of the
export ("  " $ 5 0 . 0 0 "). The fix is to embed a real Unicode TTF.

We embed Plus Jakarta Sans — the app's own self-hosted sans (see
apps/web/src/app/layout.tsx) — sourced from apps/mobile/assets/fonts so
mobile and web print the same face. Two adjustments, both needed for a
finance document and both impossible at runtime because jsPDF applies no
OpenType features:

  1. Tabular figures by default: the shipped digits are proportional
     ("1" is half the width of "0"), so right-aligned money columns
     go ragged. We remap the cmap for 0-9 to the font's own `.tf`
     glyphs (the `tnum` feature targets) so every digit is 600 units.
  2. Narrow no-break space U+202F → the font has no glyph for it, so we
     alias it to the regular space glyph (the export code also
     normalises the string, this is belt-and-suspenders).

Licence: SIL OFL 1.1, no Reserved Font Name declared, so a derived
build may be redistributed under the same licence with the copyright
notice intact — OFL-PlusJakartaSans.txt is copied alongside the output.

Usage (dev-only; the outputs are committed):
    python3 -m venv .venv && .venv/bin/pip install fonttools
    .venv/bin/python apps/web/scripts/build-pdf-fonts.py
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
except ImportError:  # pragma: no cover
    sys.exit("fonttools is required: pip install fonttools")

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "apps/mobile/assets/fonts"
OUT = ROOT / "apps/web/public/fonts"

# (source file, output file). Regular carries body text, SemiBold carries
# labels/amounts — registered in jsPDF as the 'normal' and 'bold' styles
# of one family so the export code never has to know which file is which.
FACES = [
    ("PlusJakartaSans-Regular.ttf", "murmur-pdf-regular.ttf"),
    ("PlusJakartaSans-SemiBold.ttf", "murmur-pdf-semibold.ttf"),
]

DIGITS = "0123456789"


def tnum_map(font: TTFont) -> dict[str, str]:
    """glyphName -> tabular glyphName from the font's `tnum` GSUB feature."""
    gsub = font["GSUB"].table
    out: dict[str, str] = {}
    for fr in gsub.FeatureList.FeatureRecord:
        if fr.FeatureTag != "tnum":
            continue
        for li in fr.Feature.LookupListIndex:
            for st in gsub.LookupList.Lookup[li].SubTable:
                mapping = getattr(st, "mapping", None)
                if mapping:
                    out.update(mapping)
    return out


def build(src: Path, dst: Path) -> None:
    font = TTFont(src)
    cmap = font.getBestCmap()
    tf = tnum_map(font)
    if not tf:
        sys.exit(f"{src.name}: no tnum feature found")

    hmtx = font["hmtx"]
    widths = set()
    for table in font["cmap"].tables:
        if not table.isUnicode():
            continue
        for ch in DIGITS:
            g = cmap[ord(ch)]
            table.cmap[ord(ch)] = tf.get(g, g)
            widths.add(hmtx[tf.get(g, g)][0])
        # U+202F narrow no-break space → same glyph as U+0020.
        if 0x202F not in table.cmap:
            table.cmap[0x202F] = cmap[0x20]
    if len(widths) != 1:
        sys.exit(f"{src.name}: tabular digits are not uniform: {sorted(widths)}")

    OUT.mkdir(parents=True, exist_ok=True)
    font.save(dst)
    print(f"  ✓ {dst.relative_to(ROOT)}  ({dst.stat().st_size // 1024} KB, digit advance {widths.pop()})")


def main() -> None:
    print("Building PDF export fonts…")
    for src_name, dst_name in FACES:
        build(SRC / src_name, OUT / dst_name)
    shutil.copy(SRC / "OFL-PlusJakartaSans.txt", OUT / "OFL-PlusJakartaSans.txt")
    print(f"  ✓ {(OUT / 'OFL-PlusJakartaSans.txt').relative_to(ROOT)}")


if __name__ == "__main__":
    main()
