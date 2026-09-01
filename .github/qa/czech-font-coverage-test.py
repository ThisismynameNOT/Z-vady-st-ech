from pathlib import Path
from fontTools.ttLib import TTFont

TARGET = "ŘřŮůĚěŠšČčŽžÝýÁáÍíÉéÓóĎďŤťŇň"
EXPECTED = [
    "inter-400.woff2", "inter-500.woff2", "inter-600.woff2",
    "cormorant-garamond-400.woff2", "cormorant-garamond-500.woff2",
    "cormorant-garamond-600.woff2", "cormorant-garamond-400-italic.woff2",
]
FONT_DIR = Path("public/assets/fonts")

failures = []
for name in EXPECTED:
    path = FONT_DIR / name
    if not path.exists():
        failures.append(f"missing font asset: {path}")
        continue
    font = TTFont(path)
    cmap = set()
    for table in font["cmap"].tables:
        if table.isUnicode():
            cmap.update(table.cmap.keys())
    missing = [ch for ch in TARGET if ord(ch) not in cmap]
    if missing:
        failures.append(f"{name}: missing Czech glyphs: {' '.join(missing)}")

if failures:
    print("CZECH FONT COVERAGE: FAIL")
    for failure in failures:
        print(f"- {failure}")
    raise SystemExit(1)

print("CZECH FONT COVERAGE: PASS")
