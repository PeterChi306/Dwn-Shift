"""Export the road network, lots and blocks in Unreal coordinates.

The graph work belongs here, not in the editor: this resolves the edge list into
ordered road centrelines, converts to Unreal's axes and centimetres, and writes
one file the UE-side script can consume without doing any geometry of its own.

Axes.  The toolchain works in metres with X east, Z south (from the map's Y) and
Y up. Unreal is centimetres with X, Y on the ground and Z up, so:

    Unreal X = world_x * 100      (east)
    Unreal Y = world_z * 100      (south)
    Unreal Z = world_y * 100      (height)

The map's centre pixel (768, 512) is the world origin in both, so the Landscape
placed at `landscapeLocation` from los-santerra-terrain.json lines up with these
roads exactly.

Run:  python3 tools/build_unreal_export.py
"""
import json
import math
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'output' / 'unreal' / 'los-santerra-roads.json'

CM = 100.0


def chains_of(data):
    """Resolve the edge list back into ordered centrelines, one per road run."""
    by_road = defaultdict(list)
    for e in data['edges']:
        by_road[e['road']].append(e)
    chains = []
    for road, edges in by_road.items():
        # Edges were emitted in order along the road; split where they stop meeting.
        run = [edges[0]]
        for e in edges[1:]:
            prev = run[-1]
            if prev['b'] in (e['a'], e['b']) or prev['a'] in (e['a'], e['b']):
                run.append(e)
            else:
                chains.append(run)
                run = [e]
        chains.append(run)
    return chains


def ordered_nodes(run):
    """Node ids along a run, following however the edges actually connect."""
    if len(run) == 1:
        return [run[0]['a'], run[0]['b']]
    first, second = run[0], run[1]
    start = first['a'] if first['b'] in (second['a'], second['b']) else first['b']
    order = [start]
    for e in run:
        nxt = e['b'] if e['a'] == order[-1] else e['a']
        order.append(nxt)
    return order


def main():
    data = json.loads((ROOT / 'assets' / 'world' / 'network.json').read_text())
    blocks = json.loads((ROOT / 'assets' / 'world' / 'blocks.json').read_text())
    nodes = data['nodes']

    roads = []
    for run in chains_of(data):
        order = ordered_nodes(run)
        pts = []
        for nid in order:
            x, y, z = nodes[nid]['position']
            pts.append([round(x * CM, 1), round(z * CM, 1), round(y * CM, 1)])
        if len(pts) < 2:
            continue
        head = run[0]
        length = sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1)) / CM
        roads.append(dict(
            name=head['name'], kind=head['kind'],
            district=head.get('district') or 'default',
            widthCm=head['width'] * CM,
            lanes=head.get('lanes', 2),
            lengthM=round(length, 1),
            elevated=nodes[order[0]]['layer'] != 'surface',
            points=pts))

    lots = []
    for lot in blocks['lots']:
        x, z = lot['p']
        lots.append(dict(
            name=lot['street'], district=lot['district'], streetKind=lot['streetKind'],
            # Unreal yaw is degrees about Z, measured from +X.
            yaw=round(math.degrees(math.atan2(math.sin(lot['heading']),
                                              math.cos(lot['heading']))), 2),
            widthCm=lot['width'] * CM, depthCm=lot['depth'] * CM,
            location=[round(x * CM, 1), round(z * CM, 1)]))

    poly_blocks = [dict(district=b['district'], areaM2=b['area'],
                        polygon=[[round(x * CM, 1), round(z * CM, 1)] for x, z in b['polygon']])
                   for b in blocks['blocks']]

    payload = dict(
        version=1,
        units='centimetres',
        axes='Unreal X = east, Y = south, Z = up; map pixel (768,512) is the origin',
        roads=roads, lots=lots, blocks=poly_blocks)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(',', ':')) + '\n')

    kinds = defaultdict(int)
    for r in roads:
        kinds[r['kind']] += 1
    print(f'{len(roads)} road splines, {len(lots)} lots, {len(poly_blocks)} blocks'
          f' -> {OUT.relative_to(ROOT)} ({OUT.stat().st_size/1e6:.1f} MB)')
    print('  splines by kind:', dict(sorted(kinds.items(), key=lambda kv: -kv[1])))
    print(f'  total road length {sum(r["lengthM"] for r in roads)/1000:.0f} km')


if __name__ == '__main__':
    main()
