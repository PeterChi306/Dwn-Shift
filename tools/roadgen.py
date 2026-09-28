"""Generate Los Santerra's detailed road network from the map's structure.

The reference map says where the districts are, which way their grids run and
where the hills start. It is not detailed enough to trace street by street, so
this builds the real network from that structure:

  fill_grids       a dense, correctly scaled street grid inside every district,
                   stopping where the ground starts to climb
  mountain_roads   canyon roads that climb the hills on grade-limited
                   switchbacks, bored through the ridges where a tunnel is the
                   honest answer, plus the crest road along the top
  mansion_estates  the Hollywood Hills estate lanes, which follow contours the
                   way hillside roads actually do, with cul-de-sacs off them

Everything is emitted through build_network.py's `add()`, so the existing
pipeline — intersection cutting, corner rounding, grade smoothing, districting,
block extraction — applies to generated roads exactly as to traced ones. In
particular, connectivity is automatic: any two roads whose geometry crosses on
the same layer get cut at the crossing and share a node there.

Units are reference-image pixels: 1 px = 10 m.
"""
import math

from regions import REGIONS, GRID_RELIEF_LIMIT
from terrain import MAP_W, MAP_H, height, relief_at


# ----------------------------------------------------------------- helpers ---
def _rng(seed):
    state = seed & 0xffffffff

    def next_float():
        nonlocal state
        state = (1664525 * state + 1013904223) & 0xffffffff
        return state / 4294967296.0
    return next_float


def in_bounds(p, margin=6.0):
    return margin <= p[0] <= MAP_W - margin and margin <= p[1] <= MAP_H - margin


def inside(poly, x, y):
    hit = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            hit = not hit
        j = i
    return hit


def clip_to_poly(p0, p1, poly):
    """Parameter spans of segment p0->p1 that lie inside `poly`."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    ts = [0.0, 1.0]
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        den = dx * ey - dy * ex
        if abs(den) < 1e-12:
            continue
        wx, wy = ax - p0[0], ay - p0[1]
        t = (wx * ey - wy * ex) / den
        u = (wx * dy - wy * dx) / den
        if 0.0 <= t <= 1.0 and 0.0 <= u <= 1.0:
            ts.append(t)
    ts = sorted(set(round(t, 6) for t in ts))
    spans = []
    for a, b in zip(ts, ts[1:]):
        if b - a < 1e-4:
            continue
        m = (a + b) * 0.5
        if inside(poly, p0[0] + dx * m, p0[1] + dy * m):
            spans.append((a, b))
    # merge touching spans
    merged = []
    for a, b in spans:
        if merged and a - merged[-1][1] < 1e-4:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    return merged


def split_on_relief(p0, p1, spans, limit):
    """Cut spans back where the ground stops being basin and starts being hill."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    length = math.hypot(dx, dy)
    out = []
    for a, b in spans:
        step = max(1e-3, 2.0 / max(length, 1e-6))
        run = None
        t = a
        while t <= b + 1e-9:
            x, y = p0[0] + dx * t, p0[1] + dy * t
            ok = in_bounds((x, y)) and relief_at(x, y) < limit
            if ok and run is None:
                run = t
            elif not ok and run is not None:
                if t - run > 1e-3:
                    out.append((run, t))
                run = None
            t += step
        if run is not None and b - run > 1e-3:
            out.append((run, b))
    return out


class RoadIndex:
    """Where the already-placed roads are, so generated ones do not sit on them."""

    CELL = 8.0

    def __init__(self):
        self.grid = {}

    def add_polyline(self, points):
        for a, b in zip(points, points[1:]):
            key = len(self.grid)
            for cx in range(int(min(a[0], b[0]) // self.CELL) - 1,
                            int(max(a[0], b[0]) // self.CELL) + 2):
                for cy in range(int(min(a[1], b[1]) // self.CELL) - 1,
                                int(max(a[1], b[1]) // self.CELL) + 2):
                    self.grid.setdefault((cx, cy), []).append((a, b))

    def nearest(self, x, y, radius):
        """Closest point on any indexed road within `radius`, or None."""
        cx, cy = int(x // self.CELL), int(y // self.CELL)
        span = int(radius // self.CELL) + 1
        best, best_d = None, radius
        for ox in range(-span, span + 1):
            for oy in range(-span, span + 1):
                for a, b in self.grid.get((cx + ox, cy + oy), ()):
                    ex, ey = b[0] - a[0], b[1] - a[1]
                    L = ex * ex + ey * ey
                    t = 0.0 if L == 0 else max(0.0, min(1.0, ((x - a[0]) * ex + (y - a[1]) * ey) / L))
                    q = (a[0] + ex * t, a[1] + ey * t)
                    dist = math.hypot(x - q[0], y - q[1])
                    if dist < best_d:
                        best, best_d = q, dist
        return best

    def near(self, x, y, radius):
        cx, cy = int(x // self.CELL), int(y // self.CELL)
        span = int(radius // self.CELL) + 1
        for ox in range(-span, span + 1):
            for oy in range(-span, span + 1):
                for a, b in self.grid.get((cx + ox, cy + oy), ()):
                    ex, ey = b[0] - a[0], b[1] - a[1]
                    L = ex * ex + ey * ey
                    t = 0.0 if L == 0 else max(0.0, min(1.0, ((x - a[0]) * ex + (y - a[1]) * ey) / L))
                    if math.hypot(x - (a[0] + ex * t), y - (a[1] + ey * t)) < radius:
                        return True
        return False


# ------------------------------------------------------- district perimeter ---
# Grid lines are clipped to their region's polygon, so without this every street
# in the district ends in open ground at the boundary. Ringing each district
# with an arterial gives them all something real to terminate at, and because
# build_network.py cuts crossings and shares nodes, the junctions come for free.
PERIMETER_KIND = {
    'Downtown Los Santerra': 'boulevard',
    'Pasadena': 'boulevard',
}


def perimeter_roads(add, index, log=print):
    """An arterial around every district, so no street ends in a field."""
    made = 0
    for region in REGIONS:
        poly = region['poly']
        kind = PERIMETER_KIND.get(region['name'], 'avenue')
        limit = region.get('relief', GRID_RELIEF_LIMIT) * 1.6
        n = len(poly)
        for i in range(n):
            a, b = poly[i], poly[(i + 1) % n]
            length = math.dist(a, b)
            if length < 4.0:
                continue
            steps = max(2, int(length / 7.0))
            pts = [(a[0] + (b[0] - a[0]) * k / steps,
                    a[1] + (b[1] - a[1]) * k / steps) for k in range(steps + 1)]
            # Districts overlap on this map, and a traced arterial often already
            # runs the line the polygon edge wants. Emit only the parts of the
            # edge that are open ground, in runs long enough to be a road.
            run = []
            for q in pts:
                ok = (in_bounds(q) and relief_at(q[0], q[1]) < limit
                      and not index.near(q[0], q[1], 3.2))
                if ok:
                    run.append(q)
                else:
                    if len(run) >= 3 and math.dist(run[0], run[-1]) > 9.0:
                        add(f"{region['name']} Loop", list(run), kind)
                        index.add_polyline(run)
                        made += 1
                    run = []
            if len(run) >= 3 and math.dist(run[0], run[-1]) > 9.0:
                add(f"{region['name']} Loop", list(run), kind)
                index.add_polyline(run)
                made += 1
    log(f'  perimeters: {made} district arterials')
    return made


# -------------------------------------------------------------- city grids ---
# Block spacing multiplier. The regions describe real Los Angeles block sizes,
# which over a 15 x 10 km map generate about 1,300 km of centreline -- more city
# than the Unreal map wants to carry, and thinning that down afterwards only
# breaks junctions. Generating at a coarser spacing instead gives a city that is
# complete at the density it ships at. 1.0 is true LA density.
BLOCK_SCALE = 1.45

# How far an arterial runs past its district boundary, in pixels (1 px = 10 m).
THROUGH_REACH = 26.0


def fill_grids(add, index, log=print):
    """A real street grid inside each region, at Los Angeles block sizes."""
    made = 0
    for region in REGIONS:
        poly = region['poly']
        theta = math.radians(region['angle'])
        ux, uy = math.cos(theta), math.sin(theta)
        vx, vy = -math.sin(theta), math.cos(theta)
        us = [p[0] * ux + p[1] * uy for p in poly]
        vs = [p[0] * vx + p[1] * vy for p in poly]
        names = list(region['names'])
        rand = _rng(abs(hash(region['name'])) & 0xffffffff)
        name_at = 0

        # Family A runs along u and is spaced in v; family B is the other way.
        for family, (axis_lo, axis_hi, spacing, along_lo, along_hi) in enumerate((
                (min(vs), max(vs), region['block'][0] * BLOCK_SCALE, min(us), max(us)),
                (min(us), max(us), region['block'][1] * BLOCK_SCALE, min(vs), max(vs)))):
            count = int((axis_hi - axis_lo) / spacing)
            for k in range(count + 1):
                # A few metres of wander keeps the grid from being a printed
                # circuit board without ever bending a street noticeably.
                offset = axis_lo + spacing * (k + 0.5) + (rand() - 0.5) * spacing * 0.10
                if family == 0:
                    p0 = (ux * along_lo + vx * offset, uy * along_lo + vy * offset)
                    p1 = (ux * along_hi + vx * offset, uy * along_hi + vy * offset)
                else:
                    p0 = (ux * offset + vx * along_lo, uy * offset + vy * along_lo)
                    p1 = (ux * offset + vx * along_hi, uy * offset + vy * along_hi)

                spans = clip_to_poly(p0, p1, poly)
                dx, dy = p1[0] - p0[0], p1[1] - p0[1]
                kind = 'avenue' if k % region['major'] == 0 else region['minor']
                if kind == 'avenue':
                    # Arterials carry through the boundary instead of stopping at
                    # it, so you can drive district to district without being
                    # funnelled onto the perimeter every time. THROUGH_REACH is
                    # far enough to meet the neighbour's ring and first street,
                    # short enough not to drive a foreign grid across a district.
                    span_len = math.hypot(dx, dy)
                    if span_len > 1e-6:
                        reach = THROUGH_REACH / span_len
                        spans = [(max(0.0, a - reach), min(1.0, b + reach))
                                 for a, b in spans]
                spans = split_on_relief(p0, p1, spans, region.get('relief', GRID_RELIEF_LIMIT))
                for a, b in spans:
                    length = math.hypot(dx, dy) * (b - a)
                    if length < 7.0:          # shorter than a block: not a street
                        continue
                    steps = max(1, int(length / 9.0))
                    pts = []
                    for s in range(steps + 1):
                        t = a + (b - a) * s / steps
                        x, y = p0[0] + dx * t, p0[1] + dy * t
                        if 0 < s < steps:     # never move an endpoint
                            wob = (rand() - 0.5) * 0.55
                            x += vx * wob if family == 0 else ux * wob
                            y += vy * wob if family == 0 else uy * wob
                        pts.append((x, y))
                    # Do not lay a new street on top of a traced arterial.
                    probes = [pts[i] for i in range(0, len(pts), max(1, len(pts) // 5))]
                    on_top = sum(1 for q in probes if index.near(q[0], q[1], 2.6))
                    if probes and on_top / len(probes) > 0.6:
                        continue
                    if name_at < len(names):
                        name = names[name_at]
                    else:
                        name = f"{region['name']} {name_at - len(names) + 2}"
                    name_at += 1
                    add(name, pts, kind)
                    index.add_polyline(pts)
                    made += 1
    log(f'  grids: {made} streets across {len(REGIONS)} regions')
    return made


# ----------------------------------------------------------- mountain roads ---
def _grade(a, b):
    run = math.hypot(b[0] - a[0], b[1] - a[1]) * 10.0
    return 0.0 if run < 1e-6 else (height(*b) - height(*a)) / run


def canyon_path(start, goal, seed=1, max_grade=0.10):
    """A canyon road from `start` up to `goal`, with switchbacks where needed.

    An earlier version walked uphill greedily, refusing any step steeper than a
    limit. That fights the terrain's own 15 m of detail noise — which the
    builder's grade smoothing removes afterwards anyway — so it hairpinned every
    50 m and produced a sawtooth nobody could drive.

    This authors the serpentine instead. Compare the direct grade with what a
    road should climb; the ratio says how much LONGER the road has to be, and
    that buys a definite number of switchback legs at a definite width. The
    hairpin count and the distance between them are chosen, not emergent, so a
    2 km climb gets four or five turns several hundred metres apart, like a real
    canyon road.
    """
    sx, sy = start
    gx, gy = goal
    dx, dy = gx - sx, gy - sy
    length = math.hypot(dx, dy)
    if length < 2.0:
        return [start, goal]
    ux, uy = dx / length, dy / length
    px, py = -uy, ux
    rise = height(gx, gy) - height(sx, sy)
    direct = abs(rise) / (length * 10.0)
    factor = max(1.0, direct / max_grade)
    legs = max(3, min(9, int(round(factor * 3.6))))
    width = length * 0.22 * (factor - 1.0) + length * 0.10
    rand = _rng(seed)

    # Control points as (fraction along the axis, lateral offset in pixels).
    control = []
    for i in range(legs + 1):
        t = i / legs
        side = 1 if i % 2 == 0 else -1
        taper = math.sin(math.pi * t) if legs > 1 else 0.0
        control.append((t, side * width * taper * (0.75 + 0.5 * rand())))

    points = []
    per_leg = 9
    for i in range(len(control) - 1):
        t0, l0 = control[i]
        t1, l1 = control[i + 1]
        for s in range(per_leg):
            f = s / per_leg
            # Ease the lateral swing but keep advancing along the axis, so the
            # turn is a hairpin that still climbs rather than a cusp.
            ease = 0.5 - 0.5 * math.cos(math.pi * f)
            t = t0 + (t1 - t0) * f
            lat = l0 + (l1 - l0) * ease
            q = (sx + ux * (t * length) + px * lat, sy + uy * (t * length) + py * lat)
            if in_bounds(q):
                points.append(q)
    points.append(goal)
    out = [points[0]]
    for q in points[1:]:
        if math.dist(q, out[-1]) > 0.6:
            out.append(q)
    return out


def find_bores(path, min_depth=15.0, lo=3, hi=14):
    """Chords where the road would otherwise wrap a spur — i.e. tunnels."""
    bores = []
    i = 0
    n = len(path)
    while i < n - lo:
        best = None
        for j in range(i + lo, min(i + hi, n - 1) + 1):
            a, b = path[i], path[j]
            chord = math.hypot(b[0] - a[0], b[1] - a[1])
            if not 5.0 <= chord <= 40.0:
                continue
            cap = max(height(*a), height(*b))
            peak = 0.0
            for s in range(1, 12):
                t = s / 12.0
                peak = max(peak, height(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
            if peak - cap >= min_depth:
                best = j
        if best:
            bores.append((i, best))
            i = best
        else:
            i += 1
    return bores


def emit_path(add, index, name, path, kind='scenic', tunnel_name=None, bores=True):
    """Add a mountain path, splitting it into surface runs and bored tunnels."""
    if len(path) < 2:
        return 0
    cuts = find_bores(path) if bores else []
    made = 0
    pos = 0
    part = 0
    for i, j in cuts + [(len(path) - 1, len(path) - 1)]:
        if i > pos:
            seg = path[pos:i + 1]
            if len(seg) >= 2:
                label = name if part == 0 else f'{name}'
                add(label, seg, kind)
                index.add_polyline(seg)
                made += 1
                part += 1
        if j > i:
            bore = [path[i], path[j]]
            add(tunnel_name or f'{name} Tunnel', bore, 'tunnel')
            index.add_polyline(bore)
            made += 1
            pos = j
        else:
            pos = max(pos, i)
    return made


# Canyons of the Santa Monica Mountains: basin foot -> crest. These are the real
# routes between the city and the ridge, and they are the reason the hills are
# worth driving rather than just worth looking at.
CANYONS = [
    ('Nichols Canyon Road', (588, 432), (566, 232), 7),
    ('Laurel Canyon Boulevard', (540, 438), (505, 236), 11),
    ('Coldwater Canyon Drive', (392, 462), (372, 242), 17),
    ('Benedict Canyon Drive', (330, 468), (305, 218), 23),
    ('Beverly Glen Boulevard', (268, 472), (243, 250), 29),
    ('Outpost Drive', (628, 424), (612, 244), 31),
    ('Runyon Ridge Road', (648, 428), (664, 252), 37),
]

# Climbs on the other ranges, so the hills are not all in one place.
RANGE_ROADS = [
    ('Verdugo Canyon Road', (700, 214), (640, 140), 41),
    ('Brand Ridge Road', (452, 232), (470, 146), 43),
    ('Arroyo Highlands Road', (905, 350), (872, 246), 47),
    ('Monterey Ridge Road', (1210, 742), (1262, 700), 53),
    ('Repetto Hills Drive', (1330, 716), (1300, 684), 59),
    ('Baldwin Ridge Road', (400, 846), (430, 802), 61),
    ('Chevy Chase Canyon', (1120, 200), (1180, 128), 67),
    ('Eaton Canyon Road', (1268, 172), (1320, 120), 71),
]


HILL_CONNECTORS = [
    ('Mulholland Terrace', (300, 302), 130, 1, 211),
    ('Fryman Ridge Road', (432, 288), 130, 1, 223),
    ('Hollywood Ridge Road', (598, 268), 120, -1, 227),
    ('Canyon Vista Drive', (352, 332), 120, -1, 229),
    ('Skyline Terrace', (520, 300), 130, 1, 233),
    ('Bel Air Ridge Road', (240, 322), 110, 1, 239),
    ('Cahuenga Terrace', (640, 300), 110, 1, 241),
    ('Verdugo Vista Road', (520, 168), 110, 1, 251),
    ('San Rafael Terrace', (900, 300), 100, -1, 257),
]


def hill_connectors(add, index, log=print):
    """Contour roads across the range, which turn the canyons into a network."""
    made = 0
    for name, start, steps, sign, seed in HILL_CONNECTORS:
        if relief_at(*start) < 20.0:
            continue
        path = contour(start, steps, step=3.2, sign=sign, drift=0.0, seed=seed)
        if len(path) < 8:
            continue
        made += emit_path(add, index, name, path, 'scenic')
    log(f'  ridges: {made} contour road and tunnel sections')
    return made


def mountain_roads(add, index, log=print):
    made = 0
    skipped = []
    for name, start, goal, seed in CANYONS + RANGE_ROADS:
        # A canyon road has to BEGIN on a road that already exists, or it is a
        # ribbon of tarmac floating in the hills that nothing can reach. Snap the
        # foot of the climb onto the nearest surface road and drop the canyon if
        # there is nothing to join.
        foot = index.nearest(start[0], start[1], 42.0)
        if foot is None:
            skipped.append(name)
            continue
        path = canyon_path(foot, goal, seed=seed)
        made += emit_path(add, index, name, path, 'scenic')
    log(f'  mountain: {made} canyon road and tunnel sections'
        + (f' ({len(skipped)} skipped, nothing to join: {", ".join(skipped)})' if skipped else ''))
    return made


# --------------------------------------------------------- mansion estates ---
def gradient(p, h=1.2):
    return ((height(p[0] + h, p[1]) - height(p[0] - h, p[1])) / (2 * h * 10.0),
            (height(p[0], p[1] + h) - height(p[0], p[1] - h)) / (2 * h * 10.0))


def contour(start, steps, step=2.6, sign=1, drift=0.0, seed=7):
    """Follow a line of constant elevation — how a hillside lane is actually cut."""
    rand = _rng(seed)
    pos = start
    path = [pos]
    for _ in range(steps):
        gx, gy = gradient(pos)
        gl = math.hypot(gx, gy)
        if gl < 1e-7:
            break
        # Perpendicular to the gradient is the contour; a little drift lets the
        # lane climb or fall gently instead of circling the hill forever.
        dx, dy = -gy / gl * sign, gx / gl * sign
        dx += gx / gl * drift
        dy += gy / gl * drift
        dl = math.hypot(dx, dy)
        dx, dy = dx / dl, dy / dl
        wob = (rand() - 0.5) * 0.18
        nxt = (pos[0] + (dx + wob * -dy) * step, pos[1] + (dy + wob * dx) * step)
        if not in_bounds(nxt) or relief_at(*nxt) < 12.0:
            break
        pos = nxt
        path.append(pos)
    return path


# The Hollywood Hills estate districts, on the south slope above the Strip.
ESTATES = [
    ('Doheny Estates', (352, 430), 46, 1, 101),
    ('Bird Streets', (405, 424), 44, 1, 103),
    ('Blue Jay Way', (430, 416), 34, -1, 107),
    ('Trousdale Terrace', (312, 440), 42, -1, 109),
    ('Mount Olympus Drive', (498, 420), 40, 1, 113),
    ('Outpost Estates', (612, 414), 38, -1, 127),
    ('Hollywood Heights Road', (650, 418), 32, 1, 131),
    ('Beverly Crest Drive', (274, 448), 40, 1, 137),
    ('Sunset Plaza Drive', (466, 428), 44, 1, 139),
    ('Woodrow Wilson Drive', (548, 400), 52, 1, 149),
]

CUL_DE_SAC_NAMES = ['Oriole Way', 'Thrasher Avenue', 'Skyline Court', 'Cordell Place',
                    'Wetherly Terrace', 'Warbler Place', 'Nightingale Court',
                    'Robin Place', 'Hazen Court', 'Loma Vista Place', 'Rising Glen Court',
                    'Sierra Alta Way', 'Miller Place', 'Astral Court']


def mansion_estates(add, index, log=print):
    """Winding estate lanes on the hillside, with cul-de-sacs off them."""
    made = 0
    sac = 0
    for name, start, steps, sign, seed in ESTATES:
        rand = _rng(seed)
        # Two lanes per estate at different elevations, joined by a short climb.
        for tier, drift in enumerate((0.10, -0.06)):
            begin = (start[0] + (rand() - 0.5) * 8, start[1] - tier * 9 - rand() * 4)
            if not in_bounds(begin) or relief_at(*begin) < 12.0:
                continue
            path = contour(begin, steps, sign=sign, drift=drift, seed=seed + tier)
            if len(path) < 6:
                continue
            label = name if tier == 0 else f'{name} Upper'
            add(label, path, 'residential')
            index.add_polyline(path)
            made += 1
            # Cul-de-sacs: short spurs off the downhill side, the way these
            # streets actually terminate on a hillside.
            for k in range(3, len(path) - 3, 7):
                if rand() > 0.55:
                    continue
                p = path[k]
                gx, gy = gradient(p)
                gl = math.hypot(gx, gy)
                if gl < 1e-7:
                    continue
                dx, dy = -gx / gl, -gy / gl        # downhill
                spur = [p]
                for s in range(1, 4):
                    q = (p[0] + dx * 2.4 * s + (rand() - 0.5) * 0.8,
                         p[1] + dy * 2.4 * s + (rand() - 0.5) * 0.8)
                    if not in_bounds(q):
                        break
                    spur.append(q)
                if len(spur) >= 3:
                    add(CUL_DE_SAC_NAMES[sac % len(CUL_DE_SAC_NAMES)], spur, 'residential')
                    index.add_polyline(spur)
                    sac += 1
                    made += 1
    log(f'  estates: {made} hillside lanes and cul-de-sacs ({sac} cul-de-sacs)')
    return made


def generate(add, existing, log=print):
    """Entry point called from build_network.py after the arterials are traced."""
    index = RoadIndex()
    for r in existing:
        index.add_polyline(r['points'])
    log('generating detailed road network:')
    total = 0
    total += perimeter_roads(add, index, log)
    total += fill_grids(add, index, log)
    total += mountain_roads(add, index, log)
    total += hill_connectors(add, index, log)
    total += mansion_estates(add, index, log)
    log(f'  {total} generated roads')
    return total
