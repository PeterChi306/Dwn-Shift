"""How far the baked landscape sits from the graded road surface.

Roads are smoothed and grade-capped, so they do not follow raw terrain. If the
heightmap is baked without carving the road corridors in, the landscape cuts
through the asphalt -- bumps under the car and roads that look half-buried.
This measures the残 error after carving.

Run:  python3 tools/check_road_seating.py
"""
import json
import math
import random
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_tree_seating import read_png16   # noqa: E402

OUT = Path(__file__).resolve().parent.parent / 'output' / 'unreal'


def main():
    meta = json.load(open(OUT / 'los-santerra-terrain.json'))['unreal']
    loc, sx, sz = meta['landscapeLocation'], meta['scaleX'], meta['scaleZ']
    width, height, rows = read_png16(OUT / 'los-santerra-height.png')

    def ground_z(x, y):
        i = int(round((x - loc[0]) / sx))
        j = int(round((y - loc[1]) / sx))
        if not (0 <= i < width and 0 <= j < height):
            return None
        return (rows[j][i] - 32768) * sz / 128.0 + loc[2]

    roads = json.loads((OUT / 'los-santerra-roads.json').read_text())['roads']
    surface = [r for r in roads if not r['elevated']
               and r['kind'] not in ('tunnel', 'freeway', 'ramp')]
    random.seed(11)
    samples = []
    for r in random.sample(surface, min(600, len(surface))):
        for p in random.sample(r['points'], min(6, len(r['points']))):
            samples.append((r['kind'], p))

    gaps = []
    for kind, p in samples:
        g = ground_z(p[0], p[1])
        if g is not None:
            gaps.append((abs(p[2] - g) / 100.0, kind, p[2] / 100.0, g / 100.0))

    gaps.sort()
    vals = [g[0] for g in gaps]
    print('sampled %d points on %d surface roads' % (len(gaps), len(surface)))
    print('|road z - landscape z|, metres:')
    print('   median %.2f   p90 %.2f   p99 %.2f   max %.2f'
          % (vals[len(vals) // 2], vals[int(len(vals) * .9)],
             vals[int(len(vals) * .99)], vals[-1]))
    print('   %.1f%% within 0.5 m of the landscape' % (100.0 * sum(1 for v in vals if v < 0.5) / len(vals)))
    print('   %.1f%% within 2.0 m' % (100.0 * sum(1 for v in vals if v < 2.0) / len(vals)))
    worst = gaps[-5:]
    print('worst offenders:')
    for d, kind, rz, gz in reversed(worst):
        print('   %-11s road %8.1f m   ground %8.1f m   off by %6.1f m' % (kind, rz, gz, d))


main()
