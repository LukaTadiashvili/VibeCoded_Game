"""Which niche / hook type / voice wins?  Usage: python analyze.py

Reads data/history.json (what was made) and data/results.csv (the numbers you
copy from TikTok analytics ~48h after posting) and ranks by average views and
engagement rate = (likes + comments + shares + saves) / views.
"""

import csv
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
history = {h["id"]: h for h in json.loads((ROOT / "data/history.json").read_text())}
rows = list(csv.DictReader((ROOT / "data/results.csv").open()))


def num(r, k):
    try:
        return float(r.get(k) or 0)
    except ValueError:
        return 0.0


merged = []
for r in rows:
    h = history.get(r["id"].strip())
    if not h:
        continue
    views = num(r, "views")
    eng = sum(num(r, k) for k in ("likes", "comments", "shares", "saves"))
    merged.append({**h, "views": views, "eng_rate": eng / views if views else 0})

if not merged:
    raise SystemExit("No results yet - add rows to data/results.csv (id,date,views,likes,comments,shares,saves)")

print(f"{len(merged)} videos with results\n")
for dim in ("niche", "hook_type", "voice"):
    groups = defaultdict(list)
    for m in merged:
        groups[m.get(dim) or "none"].append(m)
    print(f"== by {dim} ==")
    ranked = sorted(groups.items(), key=lambda kv: -sum(x["views"] for x in kv[1]) / len(kv[1]))
    for k, v in ranked:
        avg_v = sum(x["views"] for x in v) / len(v)
        avg_e = sum(x["eng_rate"] for x in v) / len(v)
        print(f"  {k:<14} videos={len(v):<3} avg views={avg_v:>9.0f}  engagement={avg_e:6.1%}")
    print()

best = max(merged, key=lambda m: m["views"])
print(f"Top video: {best['id']} '{best['title']}' ({best['niche']}/{best['hook_type']}) - {best['views']:.0f} views")
