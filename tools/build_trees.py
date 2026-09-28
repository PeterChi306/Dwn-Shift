"""Place Los Santerra's trees for Unreal, driven by the reference map.

Density comes from the map itself: every 10 m reference pixel is scored for how
much green tree cover the artwork shows there, so the forested ranges, the
parks and leafy San Marino are thick with trees while Downtown and the flat
grey grids get only sparse street trees. District rules on top of that pick the
species (palms in Beverly Hills and West Hollywood, pines on high ground, round
broadleaf trees elsewhere) and scale how leafy each district is.

Trees are kept off every carriageway in output/unreal/los-santerra-roads.json.

Output: output/unreal/los-santerra-trees.json
    {"units": "centimetres", "species": {"oak": [[x, y, z, yaw, scale], ...], ...}}
Coordinates are Unreal centimetres with the map centre at the origin, the same
frame as the roads and the Landscape. Pure standard library, like the other tools.

    python3 tools/build_trees.py
"""
import json
import math
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
import regions  # noqa: E402
import terrain  # noqa: E402

REFERENCE = ROOT / 'assets' / 'world' / 'los-santerra-reference.png'
ROADS = ROOT / 'output' / 'unreal' / 'los-santerra-roads.json'
OUT = ROOT / 'output' / 'unreal' / 'los-santerra-trees.json'

W, H = terrain.MAP_W, terrain.MAP_H
OX, OY = terrain.ORIGIN
CM_PER_PX = terrain.METRES_PER_PIXEL * 100.0

# Trees per 10 m pixel at full map cover. A mature crown is 6-9 m across, so
# ~1.3 per 100 m2 reads as closed canopy without every crown intersecting.
FOREST_PER_PX = 2.0
# Street trees in built districts where the artwork shows no green at all.
STREET_PER_PX = 0.09
ROAD_MARGIN_CM = 350.0     # kerb, pavement and a little air
MASK_CELL_CM = 400.0

# name: (density multiplier, palm share, conifer share)
DISTRICTS = {
    'Downtown Los Santerra': (0.25, 0.30, 0.0),
    'Koreatown': (0.45, 0.20, 0.0),
    'Westlake': (0.55, 0.25, 0.0),
    'Central Los Santerra': (0.6, 0.12, 0.0),
    'South Los Santerra': (0.55, 0.15, 0.0),
    'Boyle Heights': (0.65, 0.12, 0.0),
    'East Los Santerra': (0.6, 0.10, 0.0),
    'El Monte': (0.55, 0.10, 0.0),
    'South El Monte': (0.5, 0.10, 0.0),
    'Monterey Park': (0.8, 0.08, 0.05),
    'Alhambra': (0.85, 0.08, 0.05),
    'Mid-City': (0.7, 0.20, 0.0),
    'Culver City': (0.75, 0.20, 0.0),
    'Palms': (0.7, 0.25, 0.0),
    'Westwood': (1.0, 0.20, 0.05),
    'Fairfax': (0.8, 0.25, 0.0),
    'Hollywood': (0.8, 0.35, 0.0),
    'West Hollywood': (1.0, 0.50, 0.0),
    'Beverly Hills': (1.4, 0.70, 0.0),
    'Hancock Park': (1.4, 0.10, 0.0),
    'Exposition Park': (1.1, 0.15, 0.0),
    'Silver Lake': (1.2, 0.10, 0.10),
    'Echo Park': (1.2, 0.12, 0.10),
    'Eagle Rock': (1.2, 0.05, 0.15),
    'Highland Park': (1.1, 0.08, 0.10),
    'Lincoln Heights': (0.9, 0.08, 0.05),
    'Montecito Heights': (1.2, 0.05, 0.15),
    'Pasadena': (1.25, 0.08, 0.10),
    'San Marino': (1.6, 0.05, 0.10),
}
WILD = (1.0, 0.0, 0.35)    # the ranges outside every district


# ------------------------------------------------------------------ helpers
def rand(a, b, salt):
    """Deterministic 0..1 hash so reruns place identical trees."""
    h = (a * 73856093) ^ (b * 19349663) ^ (salt * 83492791)
    h = (h ^ (h >> 13)) * 1274126177 & 0xffffffff
    return ((h ^ (h >> 16)) & 0xffffff) / float(0x1000000)


def read_png_rgb(path):
    data = path.read_bytes()
    pos, idat = 8, b''
    while pos < len(data):
        length, tag = struct.unpack('>I4s', data[pos:pos + 8])
        chunk = data[pos + 8:pos + 8 + length]
        if tag == b'IHDR':
            width, height, depth, colour = struct.unpack('>IIBB', chunk[:10])
            if depth != 8 or colour not in (2, 6):
                raise ValueError('expected 8-bit RGB/RGBA')
            bpp = 3 if colour == 2 else 4
        elif tag == b'IDAT':
            idat += chunk
        pos += 12 + length
    raw = zlib.decompress(idat)
    stride = width * bpp
    rows, prev = [], bytearray(stride)
    for y in range(height):
        f = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        if f == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 255
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b, c = prev[i], prev[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 255
        rows.append(bytes(line) if bpp == 3 else bytes(
            line[i] for i in range(stride) if i % 4 != 3))
        prev = line
    return width, height, rows


def tree_cover(rows):
    """0..1 per pixel: how strongly the artwork reads as trees there."""
    cover = [bytearray(W) for _ in range(H)]
    for y in range(H):
        row, out = rows[y], cover[y]
        for x in range(W):
            r, g, b = row[3 * x], row[3 * x + 1], row[3 * x + 2]
            lead = g - (r if r > b else b)
            if lead <= 2 or g > 190:          # grey city, labels, roads, water
                continue
            out[x] = min(255, lead * 9)
    # 3x3 box blur: the artwork is painterly, single pixels are noise.
    smooth = [bytearray(W) for _ in range(H)]
    for y in range(1, H - 1):
        a, b, c, out = cover[y - 1], cover[y], cover[y + 1], smooth[y]
        for x in range(1, W - 1):
            out[x] = (a[x - 1] + a[x] + a[x + 1] + b[x - 1] + b[x] + b[x + 1]
                      + c[x - 1] + c[x] + c[x + 1]) // 9
    return smooth


def inside(poly, x, y):
    hit, j = False, len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def district_grid(step=4):
    grid = {}
    for gy in range(0, H, step):
        for gx in range(0, W, step):
            for region in regions.REGIONS:
                if inside(region['poly'], gx + step / 2, gy + step / 2):
                    grid[(gx // step, gy // step)] = region['name']
                    break
    return grid, step


def road_mask(roads):
    cols = int(W * CM_PER_PX / MASK_CELL_CM) + 1
    rows = int(H * CM_PER_PX / MASK_CELL_CM) + 1
    mask = bytearray(cols * rows)
    x0, y0 = -OX * CM_PER_PX, -OY * CM_PER_PX
    for road in roads:
        reach = road['widthCm'] * 0.5 + ROAD_MARGIN_CM
        cells = int(math.ceil(reach / MASK_CELL_CM))
        pts = road['points']
        for (ax, ay, _), (bx, by, _) in zip(pts, pts[1:]):
            steps = max(1, int(math.hypot(bx - ax, by - ay) / (MASK_CELL_CM * 0.5)))
            for s in range(steps + 1):
                t = s / steps
                cx = int((ax + (bx - ax) * t - x0) / MASK_CELL_CM)
                cy = int((ay + (by - ay) * t - y0) / MASK_CELL_CM)
                for dy in range(-cells, cells + 1):
                    yy = cy + dy
                    if 0 <= yy < rows:
                        base = yy * cols
                        for dx in range(-cells, cells + 1):
                            xx = cx + dx
                            if 0 <= xx < cols and (dx * dx + dy * dy) * MASK_CELL_CM ** 2 <= (reach + MASK_CELL_CM) ** 2:
                                mask[base + xx] = 1
    return mask, cols, x0, y0


# --------------------------------------------------------------------- main
def main():
    width, height, rows = read_png_rgb(REFERENCE)
    assert (width, height) == (W, H), (width, height)
    print('reading tree cover from the reference map')
    cover = tree_cover(rows)
    print('districts')
    districts, step = district_grid()
    print('road clearance mask')
    roads = json.loads(ROADS.read_text())['roads']
    mask, cols, x0, y0 = road_mask(roads)

    species = {'oak': [], 'palm': [], 'pine': []}
    per_district = {}
    for py in range(H):
        crow = cover[py]
        for px in range(W):
            name = districts.get((px // step, py // step))
            mult, palm_share, pine_share = DISTRICTS.get(name, WILD) if name else WILD
            c = crow[px] / 255.0
            expected = (c * FOREST_PER_PX + (STREET_PER_PX if name else 0.0)) * mult
            # Bare, rocky crests carry scrub, not forest.
            relief = terrain.relief_at(px, py) if c > 0 else 0.0
            if relief > 330:
                expected *= 0.35
            if expected <= 0:
                continue
            count = int(expected)
            if rand(px, py, 1) < expected - count:
                count += 1
            for k in range(count):
                fx = px + rand(px, py, 10 + k)
                fy = py + rand(px, py, 20 + k)
                ux = (fx - OX) * CM_PER_PX
                uy = (fy - OY) * CM_PER_PX
                if mask[int((uy - y0) / MASK_CELL_CM) * cols + int((ux - x0) / MASK_CELL_CM)]:
                    continue
                high = relief > 60
                pick = rand(px, py, 30 + k)
                pine = pine_share + (0.35 if high else 0.0)
                if not high and pick < palm_share:
                    kind = 'palm'
                elif pick > 1.0 - pine:
                    kind = 'pine'
                else:
                    kind = 'oak'
                z = terrain.height(fx, fy) * 100.0 - 30.0     # sink the root flare
                scale = 0.75 + rand(px, py, 40 + k) * 0.6
                if relief > 330:
                    scale *= 0.7
                yaw = int(rand(px, py, 50 + k) * 360)
                species[kind].append([int(ux), int(uy), int(z), yaw, round(scale, 2)])
                per_district[name or '(hills)'] = per_district.get(name or '(hills)', 0) + 1

    total = sum(len(v) for v in species.values())
    OUT.write_text(json.dumps({'version': 1, 'units': 'centimetres',
                               'fields': ['x', 'y', 'z', 'yawDeg', 'scale'],
                               'species': species}, separators=(',', ':')))
    print('{} trees -> {}'.format(total, OUT))
    for kind, items in species.items():
        print('  {:5s} {}'.format(kind, len(items)))
    area_km2 = {}
    for (gx, gy), name in districts.items():
        area_km2[name] = area_km2.get(name, 0) + (step * step) / 10000.0
    print('trees per km2 by district:')
    for name, n in sorted(per_district.items(), key=lambda kv: -kv[1] / area_km2.get(kv[0], 1e9)):
        a = area_km2.get(name)
        print('  {:24s} {:7d}  {}'.format(name, n, '{:.0f}/km2'.format(n / a) if a else ''))


if __name__ == '__main__':
    main()
