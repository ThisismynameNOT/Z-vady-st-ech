from pathlib import Path
from fontTools.ttLib import TTFont

TARGET = "ŘřŮůĚěŠšČčŽžÝýÁáÍíÉéÓóĎďŤťŇň"
BASIC_LATIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
FACES = [
    "inter-400", "inter-500", "inter-600",
    "cormorant-garamond-400", "cormorant-garamond-500",
    "cormorant-garamond-600", "cormorant-garamond-400-italic",
]
FONT_DIR = Path("public/assets/fonts")

failures = []
legacy = sorted(FONT_DIR.glob("*-latin-ext.woff2"))
if legacy:
    failures.append("obsolete Latin-Extended resources still present: " + ", ".join(p.name for p in legacy))

for face in FACES:
    path = FONT_DIR / f"{face}.woff2"
    if not path.is_file():
        failures.append(f"missing canonical font asset: {path.name}")
        continue
    font = TTFont(path)
    cmap = set()
    for table in font["cmap"].tables:
        if table.isUnicode():
            cmap.update(table.cmap.keys())
    missing_czech = [ch for ch in TARGET if ord(ch) not in cmap]
    missing_latin = [ch for ch in BASIC_LATIN if ord(ch) not in cmap]
    if missing_czech or missing_latin:
        failures.append(
            f"{face}: missing Czech={' '.join(missing_czech) or 'none'}; "
            f"BasicLatin={' '.join(missing_latin) or 'none'}"
        )

if failures:
    print("CZECH FONT COVERAGE: FAIL")
    for failure in failures:
        print(f"- {failure}")
    raise SystemExit(1)

print(f"CZECH FONT COVERAGE: PASS — {len(FACES)} canonical faces; Czech {len(TARGET)}/{len(TARGET)} per face; legacy ext resources 0")
