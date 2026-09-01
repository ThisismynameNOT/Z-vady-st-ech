from pathlib import Path
from fontTools.ttLib import TTFont

TARGET = "ŘřŮůĚěŠšČčŽžÝýÁáÍíÉéÓóĎďŤťŇň"
FACES = [
    "inter-400", "inter-500", "inter-600",
    "cormorant-garamond-400", "cormorant-garamond-500",
    "cormorant-garamond-600", "cormorant-garamond-400-italic",
]
FONT_DIR = Path("public/assets/fonts")

failures = []
for face in FACES:
    paths = sorted(FONT_DIR.glob(f"{face}*.woff2"))
    if not paths:
        failures.append(f"missing font assets for face: {face}")
        continue
    cmap = set()
    for path in paths:
        font = TTFont(path)
        for table in font["cmap"].tables:
            if table.isUnicode():
                cmap.update(table.cmap.keys())
    missing = [ch for ch in TARGET if ord(ch) not in cmap]
    if missing:
        failures.append(f"{face}: combined local subsets missing Czech glyphs: {' '.join(missing)}; files={','.join(p.name for p in paths)}")

if failures:
    print("CZECH FONT COVERAGE: FAIL")
    for failure in failures:
        print(f"- {failure}")
    raise SystemExit(1)

print("CZECH FONT COVERAGE: PASS")
