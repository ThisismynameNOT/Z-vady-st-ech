#!/usr/bin/env python3
"""Build the seven self-hosted Latin + Czech application faces.

Inputs are the pinned Fontsource 5.3.0 Inter and Cormorant Garamond package
files. The Latin-Extended source is reduced to the exact Czech target set and
then merged with the same-version Latin face. Generated WOFF2 files are written
to the application's existing canonical face URLs.

Maintenance setup (not required at runtime):
  python -m pip install fonttools==4.64.0 brotli==1.2.0
  mkdir -p /tmp/fontsource && cd /tmp/fontsource
  npm init -y
  npm install @fontsource/inter@5.3.0 @fontsource/cormorant-garamond@5.3.0
  cd -
  FONTSOURCE_NODE_MODULES=/tmp/fontsource/node_modules \
    python scripts/build-czech-fonts.py
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from fontTools.merge import Merger
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

FONTSOURCE_VERSION = "5.3.0"
FONTTOOLS_VERSION = "4.64.0"
TARGET = "ŘřŮůĚěŠšČčŽžÝýÁáÍíÉéÓóĎďŤťŇň"
TARGET_CODEPOINTS = {ord(ch) for ch in TARGET}
BASIC_LATIN_PROBE = "AaZz09"
OUTPUT_DIR = Path("public/assets/fonts")

FACES = [
    ("inter-400.woff2", "@fontsource/inter", "inter-latin-400-normal.woff2", "inter-latin-ext-400-normal.woff2"),
    ("inter-500.woff2", "@fontsource/inter", "inter-latin-500-normal.woff2", "inter-latin-ext-500-normal.woff2"),
    ("inter-600.woff2", "@fontsource/inter", "inter-latin-600-normal.woff2", "inter-latin-ext-600-normal.woff2"),
    ("cormorant-garamond-400.woff2", "@fontsource/cormorant-garamond", "cormorant-garamond-latin-400-normal.woff2", "cormorant-garamond-latin-ext-400-normal.woff2"),
    ("cormorant-garamond-500.woff2", "@fontsource/cormorant-garamond", "cormorant-garamond-latin-500-normal.woff2", "cormorant-garamond-latin-ext-500-normal.woff2"),
    ("cormorant-garamond-600.woff2", "@fontsource/cormorant-garamond", "cormorant-garamond-latin-600-normal.woff2", "cormorant-garamond-latin-ext-600-normal.woff2"),
    ("cormorant-garamond-400-italic.woff2", "@fontsource/cormorant-garamond", "cormorant-garamond-latin-400-italic.woff2", "cormorant-garamond-latin-ext-400-italic.woff2"),
]


def unicode_cmap(path: Path) -> set[int]:
    font = TTFont(path, recalcTimestamp=False)
    values: set[int] = set()
    for table in font["cmap"].tables:
        if table.isUnicode():
            values.update(table.cmap.keys())
    return values


def verify_package(root: Path, package: str) -> Path:
    package_root = root / package
    metadata = json.loads((package_root / "package.json").read_text(encoding="utf-8"))
    actual = metadata.get("version")
    if actual != FONTSOURCE_VERSION:
        raise SystemExit(f"{package}: expected {FONTSOURCE_VERSION}, got {actual}")
    return package_root


def build_face(root: Path, output_name: str, package: str, latin_name: str, ext_name: str) -> None:
    package_root = verify_package(root, package)
    latin_path = package_root / "files" / latin_name
    ext_path = package_root / "files" / ext_name
    if not latin_path.is_file() or not ext_path.is_file():
        raise SystemExit(f"missing pinned source for {output_name}: {latin_path} / {ext_path}")

    subset_font = TTFont(ext_path, recalcTimestamp=False)
    options = Options()
    options.flavor = "woff2"
    subsetter = Subsetter(options=options)
    subsetter.populate(unicodes=TARGET_CODEPOINTS)
    subsetter.subset(subset_font)
    subset_font.flavor = "woff2"

    subset_path = Path("/tmp") / f"czech-{output_name}"
    subset_font.save(subset_path)

    merged = Merger().merge([str(latin_path), str(subset_path)])
    merged.flavor = "woff2"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    destination = OUTPUT_DIR / output_name
    merged.save(destination)

    cmap = unicode_cmap(destination)
    missing_czech = [ch for ch in TARGET if ord(ch) not in cmap]
    missing_basic = [ch for ch in BASIC_LATIN_PROBE if ord(ch) not in cmap]
    if missing_czech or missing_basic:
        raise SystemExit(
            f"{output_name}: missing Czech={missing_czech} BasicLatin={missing_basic}"
        )

    print(
        f"COMPLETE {output_name}: {destination.stat().st_size} B; "
        f"Czech {len(TARGET)}/{len(TARGET)}; BasicLatin {len(BASIC_LATIN_PROBE)}/{len(BASIC_LATIN_PROBE)}; "
        f"Czech subset {subset_path.stat().st_size} B"
    )


def main() -> None:
    source = os.environ.get("FONTSOURCE_NODE_MODULES")
    if not source:
        raise SystemExit("Set FONTSOURCE_NODE_MODULES to the node_modules directory containing pinned Fontsource 5.3.0 packages")
    root = Path(source)
    for spec in FACES:
        build_face(root, *spec)


if __name__ == "__main__":
    main()
