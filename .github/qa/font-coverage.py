import json
from pathlib import Path
from fontTools.ttLib import TTFont

TARGET = "ŘřŮůĚěŠšČčŽžÝýÁáÍíÉéÓóĎďŤťŇň"
FONT_DIR = Path("public/assets/fonts")

rows = []
for path in sorted(FONT_DIR.glob("*.woff2")):
    font = TTFont(path)
    cmap = set()
    for table in font["cmap"].tables:
        if table.isUnicode():
            cmap.update(table.cmap.keys())
    coverage = {ch: (ord(ch) in cmap) for ch in TARGET}
    rows.append({
        "file": str(path),
        "bytes": path.stat().st_size,
        "coverage": coverage,
        "missing": [ch for ch, ok in coverage.items() if not ok],
        "allTargetGlyphs": all(coverage.values()),
    })

report = {"target": list(TARGET), "fonts": rows}
Path("font-coverage.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=False, indent=2))
