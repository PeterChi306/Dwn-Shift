"""Thin the Unreal road export to a coherent city.

The old version was a greedy flood fill under a 175 km budget, and it produced a
skeleton: 684 roads down to 61, with every local street deleted. Arterials then
ended in open ground because the cross streets they used to meet were gone, and
the result read as a fragmented, half-drawn map.

This one selects by structure instead of by budget alone:

  skeleton   freeway, ramps, tunnels, boulevards, canyon and dirt roads are kept
             whole and never decimated -- there is no substitute for any of them
  arterials  every avenue and underpass is kept, minus fragments too short to be
             a street, so the grid you navigate by is complete everywhere
  local      street and residential roads are decimated per district, longest
             first, until the budget runs out -- so every district keeps a grid
             at a coarser spacing rather than some districts keeping all of
             theirs and others none
  trim       anything stranded from the main component is dropped, then stubs
             that dangle at one end and are too short to be a real street are
             removed until nothing changes

Lots and blocks are re-filtered to what still fronts a kept road.

Run:  python3 tools/thin_network.py [budget_km]
Out:  output/unreal/los-santerra-roads-thin.json
"""
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'output' / 'unreal' / 'los-santerra-roads.json'
OUT = ROOT / 'output' / 'unreal' / 'los-santerra-roads-thin.json'

# Total centreline kilometres to aim for. The skeleton and arterials alone are
# most of it; the budget only really decides how much local grid comes with them.
BUDGET_KM = 650.0

# Centreline km of arterials to keep. None keeps every avenue whole, which is
# the original behaviour and puts a hard ~408 km floor under any total budget.
# Given a number, avenues are decimated per district just like local streets.
ARTERIAL_KM = None

SKELETON = {'freeway', 'ramp', 'tunnel', 'boulevard', 'scenic', 'dirt'}
ARTERIAL = {'avenue', 'underpass'}
LOCAL = {'street', 'residential'}

# An arterial fragment shorter than this is a leftover from a clip, not a road.
MIN_ARTERIAL_M = 250.0
# A local street shorter than this is not worth the frontage it would generate.
MIN_LOCAL_M = 120.0
# A stub dangling at one end and shorter than this is trimmed after selection.
MAX_STUB_M = 180.0

SNAP_CM = 50.0        # junction tolerance; shared graph nodes match exactly
TOUCH_CM = 1500.0     # how close an end must be to count as meeting a road
LOT_REACH_CM = 6000.0


def key(x, y):
    return (int(round(x / SNAP_CM)), int(round(y / SNAP_CM)))


def length_m(points):
    return sum(math.dist(points[i], points[i + 1])
               for i in range(len(points) - 1)) / 100.0


class Geometry:
    """Segment lookup so an endpoint can ask what road it is touching."""

    CELL = 2000.0

    def __init__(self, roads):
        self.grid = defaultdict(list)
        for i, r in enumerate(roads):
            for a, b in zip(r['points'], r['points'][1:]):
                for cx in range(int(min(a[0], b[0]) // self.CELL),
                                int(max(a[0], b[0]) // self.CELL) + 1):
                    for cy in range(int(min(a[1], b[1]) // self.CELL),
                                    int(max(a[1], b[1]) // self.CELL) + 1):
                        self.grid[(cx, cy)].append((i, a, b))

    def touches(self, point, own, radius=TOUCH_CM):
        cx, cy = int(point[0] // self.CELL), int(point[1] // self.CELL)
        for ox in (-1, 0, 1):
            for oy in (-1, 0, 1):
                for i, a, b in self.grid.get((cx + ox, cy + oy), ()):
                    if i == own:
                        continue
                    ex, ey = b[0] - a[0], b[1] - a[1]
                    L = ex * ex + ey * ey
                    t = 0.0 if L == 0 else max(0.0, min(1.0, ((point[0] - a[0]) * ex
                                                              + (point[1] - a[1]) * ey) / L))
                    if math.hypot(point[0] - (a[0] + ex * t),
                                  point[1] - (a[1] + ey * t)) < radius:
                        return True
        return False


def largest_component(kept):
    """Keep only roads reachable from the main network."""
    parent = list(range(len(kept)))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    owners = defaultdict(list)
    for i, r in enumerate(kept):
        for p in r['points']:
            owners[key(p[0], p[1])].append(i)
    for group in owners.values():
        for other in group[1:]:
            ra, rb = find(group[0]), find(other)
            if ra != rb:
                parent[ra] = rb

    groups = defaultdict(list)
    for i in range(len(kept)):
        groups[find(i)].append(i)
    main = max(groups.values(), key=lambda g: sum(kept[i]['_m'] for i in g))
    stranded = sum(kept[i]['_m'] for i in range(len(kept)) if i not in set(main))
    return [kept[i] for i in sorted(main)], len(kept) - len(main), stranded


def close_dangling(kept, roads, passes=3, close_kinds=None):
    """Pull back whatever a kept road was meeting before it got thinned out.

    Selection drops roads, which turns a perfectly good junction into a loose
    end: the arterial is still there, the cross street that terminated it is
    not. Deleting the arterial would be the wrong repair, so instead each loose
    end goes looking through the full network for the road it used to touch and
    that road is reinstated. Repeated, because a reinstated road can have loose
    ends of its own.
    """
    if close_kinds is None:
        close_kinds = SKELETON | ARTERIAL
    added_total, added_km = 0, 0.0
    for _ in range(passes):
        kept_ids = {id(r) for r in kept}
        pool = [r for r in roads if id(r) not in kept_ids]
        if not pool:
            break
        pool_geo = Geometry(pool)
        kept_geo = Geometry(kept)

        wanted = set()
        for i, r in enumerate(kept):
            # Only arterials and the skeleton get their junctions closed. Doing
            # it for local streets too pulls virtually the whole network back in
            # -- a real grid is closed everywhere, so the only way to keep a
            # budget at all is to let local streets end at the edge of the kept
            # area and rely on the arterial they hang off.
            if r['kind'] not in close_kinds:
                continue
            for end in (r['points'][0], r['points'][-1]):
                if kept_geo.touches(end, i):
                    continue
                # Nearest road in the pool that this end actually meets.
                cx, cy = int(end[0] // Geometry.CELL), int(end[1] // Geometry.CELL)
                best, best_d = None, TOUCH_CM
                for ox in (-1, 0, 1):
                    for oy in (-1, 0, 1):
                        for j, a, b in pool_geo.grid.get((cx + ox, cy + oy), ()):
                            ex, ey = b[0] - a[0], b[1] - a[1]
                            L = ex * ex + ey * ey
                            t = 0.0 if L == 0 else max(0.0, min(1.0, ((end[0] - a[0]) * ex
                                                                      + (end[1] - a[1]) * ey) / L))
                            d = math.hypot(end[0] - (a[0] + ex * t), end[1] - (a[1] + ey * t))
                            if d < best_d:
                                best, best_d = j, d
                if best is not None:
                    wanted.add(best)
        if not wanted:
            break
        for j in sorted(wanted):
            kept.append(pool[j])
            added_total += 1
            added_km += pool[j]['_m'] / 1000.0
    return added_total, added_km


def trim_stubs(kept):
    """Drop short roads left dangling at an end, repeatedly, until stable."""
    removed = 0
    while True:
        geo = Geometry(kept)
        doomed = set()
        for i, r in enumerate(kept):
            if r['kind'] in SKELETON or r['_m'] > MAX_STUB_M:
                continue
            loose = sum(1 for end in (r['points'][0], r['points'][-1])
                        if not geo.touches(end, i))
            if loose:
                doomed.add(i)
        if not doomed:
            return removed
        kept[:] = [r for i, r in enumerate(kept) if i not in doomed]
        removed += len(doomed)


def take_round_robin(pool, take, get_total, cap):
    """Spend a budget across districts evenly, longest road first.

    Round robin rather than global-longest-first, so the budget spreads over the
    map instead of being eaten by whichever district happens to be densest.
    """
    by_district = defaultdict(list)
    for r in pool:
        by_district[r['district']].append(r)
    for rs in by_district.values():
        rs.sort(key=lambda r: -r['_m'])
    cursor = {d: 0 for d in by_district}
    taken = 0
    while get_total() < cap:
        progressed = False
        for d in sorted(by_district):
            if get_total() >= cap:
                break
            i = cursor[d]
            if i >= len(by_district[d]):
                continue
            take(by_district[d][i])
            cursor[d] = i + 1
            taken += 1
            progressed = True
        if not progressed:
            return taken, False
    return taken, True


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry' in sys.argv
    budget = float(args[0]) if len(args) > 0 else BUDGET_KM
    arterial_km = float(args[1]) if len(args) > 1 else ARTERIAL_KM
    data = json.loads(SRC.read_text())
    roads = data['roads']
    for r in roads:
        r['_m'] = length_m(r['points'])

    kept, total = [], 0.0

    def take(r):
        nonlocal total
        kept.append(r)
        total += r['_m'] / 1000.0

    for r in roads:
        if r['kind'] in SKELETON:
            take(r)
    print('skeleton:  {:>4} roads {:>8.1f} km'.format(len(kept), total))

    mark = total
    arterials = [r for r in roads
                 if r['kind'] in ARTERIAL and r['_m'] >= MIN_ARTERIAL_M]
    if arterial_km is None:
        for r in arterials:
            take(r)
    else:
        take_round_robin(arterials, take, lambda: total, total + arterial_km)
    print('arterials: {:>4} roads {:>8.1f} km'.format(
        sum(1 for r in kept if r['kind'] in ARTERIAL), total - mark))

    # Local streets, district by district, longest first, round robin across
    # districts so the budget is spread over the map instead of being spent on
    # whichever district happens to be densest.
    by_district = defaultdict(list)
    for r in roads:
        if r['kind'] in LOCAL and r['_m'] >= MIN_LOCAL_M:
            by_district[r['district']].append(r)
    for rs in by_district.values():
        rs.sort(key=lambda r: -r['_m'])

    mark, taken_local = total, 0
    cursor = {d: 0 for d in by_district}
    while total < budget:
        progressed = False
        for d in sorted(by_district):
            if total >= budget:
                break
            i = cursor[d]
            if i >= len(by_district[d]):
                continue
            take(by_district[d][i])
            cursor[d] = i + 1
            taken_local += 1
            progressed = True
        if not progressed:
            print('           (all local streets taken before the budget ran out)')
            break
    print('local:     {:>4} roads {:>8.1f} km'.format(taken_local, total - mark))

    # Closing junctions on decimated avenues would reinstate most of what was
    # just cut, so when they are on a budget only the skeleton gets closed.
    reinstated, reinstated_km = close_dangling(
        kept, roads, close_kinds=SKELETON if arterial_km is not None else None)
    if reinstated:
        print('closed:    {:>4} roads {:>8.1f} km reinstated to finish open junctions'
              .format(reinstated, reinstated_km))

    kept, stranded_n, stranded_m = largest_component(kept)
    if stranded_n:
        print('pruned:    {:>4} roads {:>8.1f} km stranded off the main network'
              .format(stranded_n, stranded_m / 1000.0))
    trimmed = trim_stubs(kept)
    if trimmed:
        print('trimmed:   {:>4} dangling stubs'.format(trimmed))

    # Lots: keep the ones still fronting a kept road.
    cell = LOT_REACH_CM
    grid = defaultdict(list)
    for r in kept:
        for p in r['points']:
            grid[(int(p[0] // cell), int(p[1] // cell))].append((p[0], p[1]))
    lots = []
    for lot in data['lots']:
        lx, ly = lot['location']
        gx, gy = int(lx // cell), int(ly // cell)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if any((px - lx) ** 2 + (py - ly) ** 2 <= LOT_REACH_CM ** 2
                       for px, py in grid.get((gx + dx, gy + dy), ())):
                    lots.append(lot)
                    break
            else:
                continue
            break

    lot_cells = {(int(l['location'][0] // cell), int(l['location'][1] // cell))
                 for l in lots}
    blocks = [b for b in data['blocks']
              if (int(sum(p[0] for p in b['polygon']) / len(b['polygon']) // cell),
                  int(sum(p[1] for p in b['polygon']) / len(b['polygon']) // cell)) in lot_cells]

    total = sum(r['_m'] for r in kept) / 1000.0
    for r in kept:
        r.pop('_m', None)
    kept.sort(key=lambda r: (r['kind'], r['name']))

    payload = dict(data)
    payload.update(roads=kept, lots=lots, blocks=blocks,
                   thinnedFrom=dict(roads=len(roads), lots=len(data['lots']),
                                    blocks=len(data['blocks']),
                                    km=round(sum(length_m(r['points'])
                                                 for r in roads) / 1000.0, 1)))
    if not dry:
        OUT.write_text(json.dumps(payload, separators=(',', ':')) + '\n')

    km, counts = defaultdict(float), defaultdict(int)
    for r in kept:
        km[r['kind']] += length_m(r['points']) / 1000.0
        counts[r['kind']] += 1
    print('\n{:<12} {:>6} {:>9} {:>7}'.format('kind', 'roads', 'km', 'lanes'))
    for k in sorted(km, key=lambda k: -km[k]):
        lanes = next(r.get('lanes', '?') for r in kept if r['kind'] == k)
        print('{:<12} {:>6} {:>9.1f} {:>7}'.format(k, counts[k], km[k], lanes))
    print('{:<12} {:>6} {:>9.1f}'.format('TOTAL', len(kept), total))
    print('\nroads  {} -> {}'.format(len(roads), len(kept)))
    print('lots   {} -> {}'.format(len(data['lots']), len(lots)))
    print('blocks {} -> {}'.format(len(data['blocks']), len(blocks)))
    if dry:
        print('DRY RUN -- nothing written')
    else:
        print('wrote  {} ({:.1f} MB)'.format(OUT.relative_to(ROOT), OUT.stat().st_size / 1e6))


if __name__ == '__main__':
    main()
