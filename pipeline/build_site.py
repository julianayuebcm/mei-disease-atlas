#!/usr/bin/env python3
"""Step 6: inject data/atlas.json into site/template.html -> site/index.html (single self-contained page)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
data = json.loads((ROOT / "data/atlas.json").read_text())
html = (ROOT / "site/template.html").read_text()
assert "/*__ATLAS_DATA__*/null" in html
payload = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")
(ROOT / "site/index.html").write_text(html.replace("/*__ATLAS_DATA__*/null", payload))
print(f"site/index.html: {len(data['events'])} events, {(ROOT / 'site/index.html').stat().st_size / 1e6:.2f} MB")
