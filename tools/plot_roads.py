"""Top-down PNG of a road export, coloured by kind. Stdlib only.

Run:  python3 tools/plot_roads.py <roads.json> <out.png> [width_px]
"""
import json, math, struct, sys, zlib
from pathlib import Path

COLOUR = {
    'freeway': (255, 90, 60), 'ramp': (255, 170, 60), 'tunnel': (150, 110, 220),
    'boulevard': (255, 225, 90), 'avenue': (120, 210, 255), 'underpass': (90, 140, 200),
    'street': (210, 210, 210), 'residential': (130, 130, 130),
    'scenic': (120, 235, 150), 'dirt': (190, 150, 110),
}
BG = (18, 20, 24)


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = bytearray(BG * (w * h))

    def dot(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            i = (y * self.w + x) * 3
            self.px[i:i + 3] = bytes(c)

    def line(self, x0, y0, x1, y1, c, thick):
        n = max(2, int(math.hypot(x1 - x0, y1 - y0)) + 1)
        r = max(0, int(thick / 2))
        for s in range(n + 1):
            t = s / n
            x, y = int(x0 + (x1 - x0) * t), int(y0 + (y1 - y0) * t)
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    if dx * dx + dy * dy <= r * r + 1:
                        self.dot(x + dx, y + dy, c)

    def write(self, path):
        raw = bytearray()
        for y in range(self.h):
            raw.append(0)
            raw += self.px[y * self.w * 3:(y + 1) * self.w * 3]
        def chunk(kind, body):
            return (struct.pack('>I', len(body)) + kind + body
                    + struct.pack('>I', zlib.crc32(kind + body) & 0xffffffff))
        png = (b'\x89PNG\r\n\x1a\n'
               + chunk(b'IHDR', struct.pack('>IIBBBBB', self.w, self.h, 8, 2, 0, 0, 0))
               + chunk(b'IDAT', zlib.compress(bytes(raw), 6))
               + chunk(b'IEND', b''))
        Path(path).write_bytes(png)


def main():
    src, out = Path(sys.argv[1]), sys.argv[2]
    target_w = int(sys.argv[3]) if len(sys.argv) > 3 else 1600
    roads = json.loads(src.read_text())['roads']

    if len(sys.argv) > 7:
        minx, miny, maxx, maxy = (float(v) for v in sys.argv[4:8])
        roads = [r for r in roads
                 if any(minx <= p[0] <= maxx and miny <= p[1] <= maxy for p in r['points'])]
    else:
        xs = [p[0] for r in roads for p in r['points']]
        ys = [p[1] for r in roads for p in r['points']]
        minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    pad = 20
    scale = (target_w - 2 * pad) / (maxx - minx)
    w = target_w
    h = int((maxy - miny) * scale) + 2 * pad
    cv = Canvas(w, h)

    def to_px(p):
        return (pad + (p[0] - minx) * scale, pad + (p[1] - miny) * scale)

    order = ['residential', 'street', 'scenic', 'dirt', 'underpass',
             'avenue', 'boulevard', 'tunnel', 'ramp', 'freeway']
    for kind in order:
        for r in roads:
            if r['kind'] != kind:
                continue
            c = COLOUR.get(kind, (200, 200, 200))
            thick = max(1.0, r['widthCm'] / 100.0 * scale)
            pts = [to_px(p) for p in r['points']]
            for a, b in zip(pts, pts[1:]):
                cv.line(a[0], a[1], b[0], b[1], c, thick)

    # A dangling end is one that does not touch any *other* road's geometry --
    # T-junctions count as joined, which the endpoint-only test got wrong.
    cell = 2000.0
    grid = {}
    for ri, r in enumerate(roads):
        for a, b in zip(r['points'], r['points'][1:]):
            for cx in range(int(min(a[0], b[0]) // cell), int(max(a[0], b[0]) // cell) + 1):
                for cy in range(int(min(a[1], b[1]) // cell), int(max(a[1], b[1]) // cell) + 1):
                    grid.setdefault((cx, cy), []).append((ri, a, b))

    TOL = 1500.0   # cm
    dangling = 0
    for ri, r in enumerate(roads):
        for end in (r['points'][0], r['points'][-1]):
            cx, cy = int(end[0] // cell), int(end[1] // cell)
            touched = False
            for ox in (-1, 0, 1):
                for oy in (-1, 0, 1):
                    for oi, a, b in grid.get((cx + ox, cy + oy), ()):
                        if oi == ri:
                            continue
                        ex, ey = b[0] - a[0], b[1] - a[1]
                        L = ex * ex + ey * ey
                        t = 0.0 if L == 0 else max(0.0, min(1.0, ((end[0] - a[0]) * ex + (end[1] - a[1]) * ey) / L))
                        if math.hypot(end[0] - (a[0] + ex * t), end[1] - (a[1] + ey * t)) < TOL:
                            touched = True
                            break
                    if touched:
                        break
                if touched:
                    break
            if not touched:
                dangling += 1
                x, y = to_px(end)
                cv.line(x - 4, y, x + 4, y, (255, 40, 40), 3)
                cv.line(x, y - 4, x, y + 4, (255, 40, 40), 3)

    cv.write(out)
    print('%s: %d roads, %d px wide, %d dangling ends marked red'
          % (out, len(roads), w, dangling))


main()
