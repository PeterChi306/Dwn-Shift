#!/usr/bin/env python3
"""Drivability audit for assets/world/network.json.

Every road rebuild is measured against this, not judged by eye. It reports the
defects that made the old world undrivable:

  - pieces of road you cannot reach from the main network
  - dead ends
  - crossings on the same level that do not share a junction
  - crossings on different levels with no headroom between them
  - grades over the cap for the road's kind
  - kinks: sharp heading changes in the middle of a road (not at a junction)
  - junctions squeezed too close together to build a junction surface
  - roads meeting at an angle too acute to drive or mesh

Pure standard library. Usage: python3 tools/audit_roads.py [network.json] [--json out.json]
"""
import json, math, sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

GRADE_CAP = {'freeway': .07, 'ramp': .08, 'tunnel': .08, 'boulevard': .10, 'avenue': .12,
             'underpass': .12, 'street': .15, 'residential': .18, 'scenic': .23, 'dirt': .31}
CLEARANCE = 5.2        # metres between decks before two roads collide
KINK_DEG = 35          # heading change at a degree-2 node that is a defect
MIN_RADIUS = {'freeway': 180, 'ramp': 45, 'boulevard': 35, 'avenue': 30, 'street': 14,
              'residential': 12, 'underpass': 30, 'tunnel': 60, 'scenic': 14, 'dirt': 10}
JUNCTION_GAP = 12      # metres; junctions closer than this cannot each get a surface
ACUTE_DEG = 20         # roads meeting at less than this at a junction
# Design speed per kind (m/s). A crest sharper than v^2 / (0.6 g) lifts the car
# off its springs at that speed; that is a launch, not a road.
SPEED = {'freeway': 30, 'ramp': 18, 'tunnel': 20, 'boulevard': 20, 'avenue': 20, 'underpass': 18,
         'street': 17, 'residential': 14, 'scenic': 15, 'dirt': 11}


def load(path):
    return json.loads(Path(path).read_text())


def audit(net):
    nodes, edges = net['nodes'], net['edges']
    P = [n['position'] for n in nodes]
    adj = defaultdict(list)
    for e in edges:
        adj[e['a']].append(e['id'])
        adj[e['b']].append(e['id'])
    out = {'nodes': len(nodes), 'edges': len(edges)}
    out['km'] = round(sum(math.dist(P[e['a']], P[e['b']]) for e in edges) / 1000, 1)
    out['junctions'] = sum(1 for n in adj if len(adj[n]) >= 3)

    # --- connectivity
    seen, comps = set(), []
    for start in adj:
        if start in seen:
            continue
        stack, comp = [start], []
        seen.add(start)
        while stack:
            n = stack.pop()
            comp.append(n)
            for eid in adj[n]:
                e = edges[eid]
                m = e['b'] if e['a'] == n else e['a']
                if m not in seen:
                    seen.add(m)
                    stack.append(m)
        comps.append(comp)
    comps.sort(key=len, reverse=True)
    out['components'] = len(comps)
    out['orphan_nodes'] = sum(len(c) for c in comps[1:])
    dead = [n for n in adj if len(adj[n]) == 1]
    out['dead_ends'] = len(dead)

    # --- grades
    over = Counter()
    worst = 0
    for e in edges:
        a, b = P[e['a']], P[e['b']]
        flat = math.hypot(b[0] - a[0], b[2] - a[2])
        if flat < 1:
            continue
        g = abs(b[1] - a[1]) / flat
        worst = max(worst, g)
        if g > GRADE_CAP.get(e['kind'], .15) + 1e-6:
            over[e['kind']] += 1
    out['grade_worst_pct'] = round(worst * 100, 1)
    out['grade_over_cap'] = sum(over.values())
    out['grade_over_cap_by_kind'] = dict(over)

    # --- kinks and tight radii at degree-2 nodes
    kinks, tight, crests = 0, Counter(), Counter()
    for n, ids in adj.items():
        if len(ids) != 2:
            continue
        e1, e2 = edges[ids[0]], edges[ids[1]]
        o1 = e1['b'] if e1['a'] == n else e1['a']
        o2 = e2['b'] if e2['a'] == n else e2['a']
        v1 = (P[n][0] - P[o1][0], P[n][2] - P[o1][2])
        v2 = (P[o2][0] - P[n][0], P[o2][2] - P[n][2])
        l1, l2 = math.hypot(*v1), math.hypot(*v2)
        if l1 < .01 or l2 < .01:
            continue
        cos = max(-1, min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)))
        turn = math.degrees(math.acos(cos))
        if turn > KINK_DEG:
            kinks += 1
        # Vertical: grade coming in minus grade going out; positive is a crest.
        g_in = (P[n][1] - P[o1][1]) / l1
        g_out = (P[o2][1] - P[n][1]) / l2
        if g_in - g_out > 1e-4:
            radius = (l1 + l2) / 2 / (g_in - g_out)
            v = SPEED.get(e1['kind'], 17)
            if radius < v * v / (0.6 * 9.81):
                crests[e1['kind']] += 1
        if turn > 1:
            # Radius of the arc that fits the shorter half of each segment.
            r = min(l1, l2) / 2 / math.tan(math.radians(turn) / 2)
            if r < MIN_RADIUS.get(e1['kind'], 14):
                tight[e1['kind']] += 1
    # The same crest test straight through junctions (pairs of edges within 30
    # degrees of opposite): a car going across meets both grades.
    jcrest = Counter()
    for n, ids in adj.items():
        if len(ids) < 3:
            continue
        arms = []
        for eid in ids:
            e = edges[eid]
            o = e['b'] if e['a'] == n else e['a']
            l = math.hypot(P[o][0] - P[n][0], P[o][2] - P[n][2])
            if l > .01:
                arms.append(((P[o][0] - P[n][0]) / l, (P[o][2] - P[n][2]) / l, l, (P[o][1] - P[n][1]) / l, e['kind']))
        for i in range(len(arms)):
            for j in range(i + 1, len(arms)):
                a, b = arms[i], arms[j]
                if a[0] * b[0] + a[1] * b[1] > -.87:
                    continue
                bend = a[3] + b[3]          # both measured outward: a crest has both negative... sum of grades
                if -bend > 1e-4:
                    radius = (a[2] + b[2]) / 2 / -bend
                    v = min(SPEED.get(a[4], 17), SPEED.get(b[4], 17))
                    if radius < v * v / (0.6 * 9.81):
                        jcrest[a[4]] += 1
    out['junction_launch_crests'] = sum(jcrest.values())
    out['kinks'] = kinks
    out['launch_crests'] = sum(crests.values())
    out['launch_crests_by_kind'] = dict(crests)
    out['tight_radius'] = sum(tight.values())
    out['tight_radius_by_kind'] = dict(tight)

    # --- junction spacing and acute junction angles
    J = [n for n in adj if len(adj[n]) >= 3]
    cell = defaultdict(list)
    for n in J:
        cell[(int(P[n][0] // JUNCTION_GAP), int(P[n][2] // JUNCTION_GAP))].append(n)
    close = 0
    for n in J:
        cx, cz = int(P[n][0] // JUNCTION_GAP), int(P[n][2] // JUNCTION_GAP)
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                for m in cell.get((cx + dx, cz + dz), ()):
                    if m > n and math.hypot(P[m][0] - P[n][0], P[m][2] - P[n][2]) < JUNCTION_GAP \
                            and abs(P[m][1] - P[n][1]) < CLEARANCE:
                        close += 1
    out['junctions_too_close'] = close
    acute = 0
    for n in J:
        hs = []
        for eid in adj[n]:
            e = edges[eid]
            o = e['b'] if e['a'] == n else e['a']
            hs.append(math.atan2(P[o][0] - P[n][0], P[o][2] - P[n][2]))
        hs.sort()
        gaps = [hs[i + 1] - hs[i] for i in range(len(hs) - 1)] + [hs[0] + 2 * math.pi - hs[-1]]
        if min(gaps) < math.radians(ACUTE_DEG):
            acute += 1
    out['acute_junctions'] = acute

    # --- crossings that do not share a node
    CELL = 60
    grid = defaultdict(list)
    for e in edges:
        a, b = P[e['a']], P[e['b']]
        for gx in range(int(min(a[0], b[0]) // CELL), int(max(a[0], b[0]) // CELL) + 1):
            for gz in range(int(min(a[2], b[2]) // CELL), int(max(a[2], b[2]) // CELL) + 1):
                grid[(gx, gz)].append(e['id'])
    unnoded, no_headroom, pairs = 0, 0, set()
    for ids in grid.values():
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                x, y = ids[i], ids[j]
                if (x, y) in pairs:
                    continue
                pairs.add((x, y))
                e, f = edges[x], edges[y]
                if {e['a'], e['b']} & {f['a'], f['b']}:
                    continue
                hit = seg_cross(P[e['a']], P[e['b']], P[f['a']], P[f['b']])
                if not hit:
                    continue
                t, u = hit
                ya = P[e['a']][1] + (P[e['b']][1] - P[e['a']][1]) * t
                yb = P[f['a']][1] + (P[f['b']][1] - P[f['a']][1]) * u
                if abs(ya - yb) < 1.0:
                    unnoded += 1
                elif abs(ya - yb) < CLEARANCE:
                    no_headroom += 1
    out['unnoded_crossings'] = unnoded
    out['crossings_without_headroom'] = no_headroom
    return out


def seg_cross(a, b, c, d):
    """Proper crossing of two segments in plan; returns (t, u) or None."""
    r = (b[0] - a[0], b[2] - a[2])
    s = (d[0] - c[0], d[2] - c[2])
    den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-9:
        return None
    q = (c[0] - a[0], c[2] - a[2])
    t = (q[0] * s[1] - q[1] * s[0]) / den
    u = (q[0] * r[1] - q[1] * r[0]) / den
    if 1e-4 < t < 1 - 1e-4 and 1e-4 < u < 1 - 1e-4:
        return t, u
    return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    path = args[0] if args else ROOT / 'assets/world/network.json'
    result = audit(load(path))
    width = max(len(k) for k in result)
    for k, v in result.items():
        print(f'{k:<{width}}  {v}')
    if '--json' in sys.argv:
        Path(sys.argv[sys.argv.index('--json') + 1]).write_text(json.dumps(result, indent=1))


if __name__ == '__main__':
    main()
