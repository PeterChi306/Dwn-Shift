"""The single definition of Los Santerra's terrain.

Coordinates are reference-image pixels (1536 x 1024 at 10 m/px), which is the
authoritative layout space for the whole project. `world/network.js` mirrors
`height()` exactly for the browser build and `tools/check_network.mjs` asserts
the two agree; `tools/build_heightmap.py` bakes the same function out for an
Unreal Landscape import.

Shape of the world, per the reference map and how the real basin reads:

  * The basin is FLAT. Los Angeles between the hills has almost no relief, so
    the only basin-scale terms are a gentle drift up toward the north-east (the
    plain drains south-west to the ocean) and one very long, very shallow swell
    so that a straight boulevard still crests and dips instead of being a table.
  * All the real elevation lives in named ranges traced off the map: the Santa
    Monica Mountains / Hollywood Hills band above West Hollywood and Beverly
    Hills, the Verdugos, the San Gabriels, and three smaller groups of hills.
  * Surface detail only bites on high ground, so city streets stay drivable and
    the hills still read as rough.
"""
import math

# --------------------------------------------------------------- extent ---
MAP_W, MAP_H = 1536, 1024          # reference image, pixels
METRES_PER_PIXEL = 10.0
ORIGIN = (768, 512)                # world (0,0) sits at this pixel

# --------------------------------------------------------------- crests ---
# Each entry is (spine polyline in pixels, peak height in metres, falloff width
# in pixels). Height falls off with distance from the spine, so a range reads as
# a ridge rather than as the round blob a sum of Gaussians produces.
CRESTS = [
    # Santa Monica Mountains / Hollywood Hills — the band Mulholland follows,
    # and the reason Beverly Hills and West Hollywood get their elevation.
    ([(118, 398), (196, 332), (278, 268), (360, 234), (452, 242), (521, 216),
      (600, 206), (681, 186), (760, 170), (828, 192), (868, 252)], 248.0, 94.0),
    # Verdugo Mountains — the green mass north of the 134.
    ([(352, 168), (438, 132), (542, 122), (648, 146), (712, 170)], 208.0, 78.0),
    # San Gabriel Mountains — the wall across the top right.
    ([(1108, 52), (1232, 30), (1356, 48), (1468, 84), (1560, 122)], 344.0, 126.0),
    # Elysian / Echo Park hills between Silver Lake and Downtown.
    ([(852, 398), (898, 442), (946, 412)], 58.0, 54.0),
    # Repetto Hills behind Monterey Park.
    ([(1196, 688), (1292, 702), (1378, 678)], 64.0, 60.0),
    # Baldwin Hills above Culver City.
    ([(352, 792), (432, 806), (500, 790)], 50.0, 50.0),
]
# Mount Lee: the local summit carrying the sign and the city overlook.
MOUNT_LEE = (648, 178)

# Basin drift. The plain rises toward the north-east; these are metres per pixel.
BASIN_BASE = 6.0
BASIN_EAST = 0.030
BASIN_NORTH = 0.016


def _fract(v):
    return v - math.floor(v)


def _hash(a, b):
    return _fract(math.sin(a * 127.1 + b * 311.7) * 43758.5453)


def _vnoise(x, y):
    """Value noise. `world/network.js` reimplements this identically."""
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    fx = fx * fx * (3.0 - 2.0 * fx)
    fy = fy * fy * (3.0 - 2.0 * fy)
    n00 = _hash(ix, iy)
    n10 = _hash(ix + 1.0, iy)
    n01 = _hash(ix, iy + 1.0)
    n11 = _hash(ix + 1.0, iy + 1.0)
    a = n00 + (n10 - n00) * fx
    return a + ((n01 + (n11 - n01) * fx) - a) * fy


def _crest_distance(x, y, points):
    best = 1e18
    for (ax, ay), (bx, by) in zip(points, points[1:]):
        dx, dy = bx - ax, by - ay
        span = dx * dx + dy * dy
        t = 0.0 if span == 0 else max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / span))
        qx, qy = ax + t * dx, ay + t * dy
        best = min(best, (x - qx) ** 2 + (y - qy) ** 2)
    return math.sqrt(best)


def relief_at(x, y):
    """Height contributed by the mountain ranges alone, in metres."""
    relief = 0.0
    for points, amp, width in CRESTS:
        d = _crest_distance(x, y, points)
        relief += amp * math.exp(-((d / width) ** 2))
    d = math.hypot(x - MOUNT_LEE[0], y - MOUNT_LEE[1])
    relief += 76.0 * math.exp(-((d / 46.0) ** 2))
    return relief


def height(x, y):
    """Terrain height in metres for a reference-image pixel coordinate."""
    # A flat basin that drains south-west, plus one long shallow swell. The old
    # pair of short-wavelength sines rolled the plain by +-8.5 m, which is what
    # made every 'flat' district undulate; the basin is meant to read as flat.
    h = BASIN_BASE + BASIN_EAST * x + BASIN_NORTH * (MAP_H - y)
    h += 1.6 * math.sin(x * 0.0061 + 0.7) * math.cos(y * 0.0047 - 0.4)
    relief = relief_at(x, y)
    h += relief
    # Detail only bites on high ground, so city streets stay drivable.
    bite = min(1.0, relief / 70.0)
    if bite > 0.0:
        detail = (_vnoise(x / 34.0, y / 34.0) - 0.5) * 2.0
        detail += (_vnoise(x / 13.0, y / 13.0) - 0.5) * 0.9
        h += detail * 15.0 * bite
    return h
