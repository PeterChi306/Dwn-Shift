"""Extract city blocks and building lots from the road graph.

Why this exists
---------------
Buildings used to be placed at a fixed offset from a road centreline, with a
test that tried to reject any lot another road happened to run through. That
test leaks — which is why buildings ended up standing in the middle of streets
and the city was hard to drive through.

A block is a face of the planar road graph: the piece of ground enclosed by the
streets around it. If a building is placed INSIDE a block polygon, it cannot be
standing in a road, because the roads are the polygon's edges. Overlap stops
being something to check for and becomes structurally impossible.

What comes out
--------------
assets/world/blocks.json

    blocks  polygon per city block, in metres, with district and area
    lots    a building plot per street frontage: position, heading, footprint

Both are what Unreal wants to consume: the blocks drive PCG surface scattering
(parks, parking, interiors) and each lot is a transform to place a building on.

Run:  python3 tools/build_blocks.py
"""
import json
import math
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NETWORK = ROOT / 'assets' / 'world' / 'network.json'
OUT = ROOT / 'assets' / 'world' / 'blocks.json'

# Grade-separated roads do not bound a block at ground level: a freeway on its
# deck flies over the ground, so the block continues underneath it.
SKIP_KINDS = {'freeway', 'ramp', 'tunnel'}

PAVEMENT = 4.2          # kerb to property line, metres
MIN_BLOCK_AREA = 900.0  # m^2; below this it is a traffic island, not a block
MAX_BLOCK_AREA = 2.5e5  # m^2; above this it is open country, not a block
MIN_COMPACTNESS = 0.22  # 4*pi*A/P^2; rejects the long slivers the hill
                        # road network encloses, which are open hillside
CLEARANCE = 3.0         # extra gap from any carriageway, including freeways

# Lot sizes by the kind of street they face.
FRONTAGE = {'boulevard': 34.0, 'avenue': 30.0, 'street': 26.0,
            'residential': 22.0, 'scenic': 40.0, 'underpass': 30.0}
DEPTH = {'boulevard': 30.0, 'avenue': 28.0, 'street': 24.0,
         'residential': 22.0, 'scenic': 20.0, 'underpass': 28.0}


def load():
    data = json.loads(NETWORK.read_text())
    nodes = [(n['position'][0], n['position'][2]) for n in data['nodes']]
    edges = [e for e in data['edges'] if e['kind'] not in SKIP_KINDS]
    return data, nodes, edges


def build_faces(nodes, edges):
    """Trace the minimal faces of the planar graph (the city blocks)."""
    adjacency = defaultdict(list)
    for e in edges:
        adjacency[e['a']].append((e['b'], e))
        adjacency[e['b']].append((e['a'], e))

    # Angular order around each node is what makes the face walk well defined.
    order = {}
    for n, links in adjacency.items():
        ax, az = nodes[n]
        ranked = sorted(links, key=lambda l: math.atan2(nodes[l[0]][1] - az,
                                                        nodes[l[0]][0] - ax))
        order[n] = ranked
        # index of each neighbour, for the successor lookup below
        adjacency[n] = {nb: i for i, (nb, _) in enumerate(ranked)}

    faces = []
    visited = set()
    for e in edges:
        for u, v in ((e['a'], e['b']), (e['b'], e['a'])):
            if (u, v) in visited:
                continue
            face, kinds = [], []
            cu, cv = u, v
            while (cu, cv) not in visited:
                visited.add((cu, cv))
                face.append(cu)
                ring = order[cv]
                # Successor: the neighbour of v immediately clockwise from u.
                # Walking that consistently traces one minimal face.
                i = adjacency[cv].get(cu)
                if i is None:
                    break
                nb, edge = ring[(i - 1) % len(ring)]
                kinds.append(edge)
                cu, cv = cv, nb
                if len(face) > 4000:
                    break
            if len(face) >= 3:
                faces.append((face, kinds))
    return faces


def shoelace(points):
    a = 0.0
    for (x0, z0), (x1, z1) in zip(points, points[1:] + points[:1]):
        a += x0 * z1 - x1 * z0
    return a * 0.5


def inside(poly, x, z):
    """Even-odd point in polygon."""
    hit = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, zi = poly[i]
        xj, zj = poly[j]
        if (zi > z) != (zj > z):
            if x < (xj - xi) * (z - zi) / (zj - zi) + xi:
                hit = not hit
        j = i
    return hit


class RoadIndex:
    """Distance to the nearest carriageway, over ALL roads including freeways."""

    CELL = 160.0

    def __init__(self, data):
        self.segments = []
        self.grid = defaultdict(list)
        nodes = [(n['position'][0], n['position'][2]) for n in data['nodes']]
        for e in data['edges']:
            ax, az = nodes[e['a']]
            bx, bz = nodes[e['b']]
            index = len(self.segments)
            self.segments.append((ax, az, bx, bz, e['width'] * 0.5))
            x0, x1 = sorted((ax, bx))
            z0, z1 = sorted((az, bz))
            for cx in range(int(x0 // self.CELL), int(x1 // self.CELL) + 1):
                for cz in range(int(z0 // self.CELL), int(z1 // self.CELL) + 1):
                    self.grid[(cx, cz)].append(index)

    def clear(self, x, z, margin):
        cx, cz = int(x // self.CELL), int(z // self.CELL)
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                for i in self.grid.get((cx + dx, cz + dz), ()):
                    ax, az, bx, bz, half = self.segments[i]
                    ex, ez = bx - ax, bz - az
                    span = ex * ex + ez * ez
                    t = 0.0 if span == 0 else max(0.0, min(1.0, ((x - ax) * ex + (z - az) * ez) / span))
                    px, pz = ax + ex * t, az + ez * t
                    if math.hypot(x - px, z - pz) < half + margin:
                        return False
        return True


def main():
    data, nodes, edges = load()
    faces = build_faces(nodes, edges)
    roads = RoadIndex(data)

    blocks, lots = [], []
    for face, face_edges in faces:
        poly = [nodes[n] for n in face]
        area = shoelace(poly)
        if area < 0:                       # normalise every block to CCW
            poly = poly[::-1]
            face_edges = face_edges[::-1]
            area = -area
        if not (MIN_BLOCK_AREA <= area <= MAX_BLOCK_AREA):
            continue
        perimeter = sum(math.dist(poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly)))
        if perimeter <= 0 or 4 * math.pi * area / (perimeter * perimeter) < MIN_COMPACTNESS:
            continue          # a sliver between two hill roads is not a block

        districts = defaultdict(float)
        for e in face_edges:
            districts[e.get('district') or 'default'] += 1
        district = max(districts.items(), key=lambda kv: kv[1])[0]

        block_id = len(blocks)
        blocks.append(dict(id=block_id, district=district, area=round(area, 1),
                           polygon=[[round(x, 2), round(z, 2)] for x, z in poly]))

        # Lots along each frontage, stepped by arc length and pushed into the
        # block. A lot is kept only if its whole footprint is inside the block
        # and clear of every carriageway, so it cannot sit in a road.
        for i, edge in enumerate(face_edges):
            ax, az = poly[i]
            bx, bz = poly[(i + 1) % len(poly)]
            ex, ez = bx - ax, bz - az
            length = math.hypot(ex, ez)
            if length < 6.0:
                continue
            ux, uz = ex / length, ez / length
            kind = edge['kind']
            frontage = FRONTAGE.get(kind, 28.0)
            depth = DEPTH.get(kind, 26.0)
            setback = edge['width'] * 0.5 + PAVEMENT

            # Interior normal: test one candidate and flip it if it points out.
            nx, nz = -uz, ux
            mx, mz = ax + ex * 0.5, az + ez * 0.5
            if not inside(poly, mx + nx * 0.5, mz + nz * 0.5):
                nx, nz = -nx, -nz

            count = int(length // frontage)
            if count < 1:
                continue
            margin = (length - count * frontage) * 0.5
            for k in range(count):
                d = margin + frontage * (k + 0.5)
                cx = ax + ux * d + nx * (setback + depth * 0.5)
                cz = az + uz * d + nz * (setback + depth * 0.5)
                half_f, half_d = frontage * 0.5 - 1.0, depth * 0.5
                corners = [(cx + ux * sf + nx * sd, cz + uz * sf + nz * sd)
                           for sf in (-half_f, half_f) for sd in (-half_d, half_d)]
                if not all(inside(poly, px, pz) for px, pz in corners):
                    continue
                if not all(roads.clear(px, pz, CLEARANCE) for px, pz in corners):
                    continue
                lots.append(dict(
                    block=block_id, district=district,
                    p=[round(cx, 2), round(cz, 2)],
                    # Heading the building faces: outward, back down at the street.
                    heading=round(math.atan2(-nx, -nz), 4),
                    width=frontage, depth=depth,
                    street=edge['name'], streetKind=kind))

    OUT.write_text(json.dumps(dict(
        version=1,
        source='tools/build_blocks.py',
        blocks=blocks, lots=lots), separators=(',', ':')) + '\n')

    per_district = defaultdict(int)
    for lot in lots:
        per_district[lot['district']] += 1
    areas = sorted(b['area'] for b in blocks)
    print(f'{len(blocks)} blocks, {len(lots)} lots -> {OUT.relative_to(ROOT)}')
    print(f'block area  median {areas[len(areas)//2]:,.0f} m2   '
          f'min {areas[0]:,.0f}   max {areas[-1]:,.0f}')
    print('lots by district:')
    for name, n in sorted(per_district.items(), key=lambda kv: -kv[1]):
        print(f'  {name:26s} {n:5d}')


if __name__ == '__main__':
    main()
