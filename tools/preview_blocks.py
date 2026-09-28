"""Render a top-down check image of the extracted blocks and lots.

Pure standard library, same hand-rolled PNG writer as the heightmap bake. One
pixel is ten metres, matching the reference map, so this image can be flipped
against assets/world/los-santerra-reference.png to see how the generated blocks
line up with the drawn city.

Run:  python3 tools/preview_blocks.py
"""
import json
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Optional crop/zoom:  python3 tools/preview_blocks.py x0 y0 x1 y1 [zoom] [name]
# Coordinates are reference-map pixels, so `200 140 750 460 3` frames the hills.
if len(sys.argv) >= 5:
    X0, Y0, X1, Y1 = (float(v) for v in sys.argv[1:5])
    ZOOM = float(sys.argv[5]) if len(sys.argv) > 5 else 1.0
    NAME = sys.argv[6] if len(sys.argv) > 6 else 'blocks-preview-crop'
else:
    X0, Y0, X1, Y1, ZOOM, NAME = 0, 0, 1536, 1024, 1.0, 'blocks-preview'

OUT = ROOT / 'output' / 'unreal' / f'{NAME}.png'
W, H = int((X1 - X0) * ZOOM), int((Y1 - Y0) * ZOOM)
MPP = 10.0                       # metres per map pixel


def to_px(x, z):
    return (x / MPP + 768 - X0) * ZOOM, (z / MPP + 512 - Y0) * ZOOM


class Canvas:
    def __init__(self, w, h, bg=(11, 16, 20)):
        self.w, self.h = w, h
        self.buf = bytearray(bytes(bg) * (w * h))

    def px(self, x, y, rgb, alpha=1.0):
        if 0 <= x < self.w and 0 <= y < self.h:
            i = (y * self.w + x) * 3
            if alpha >= 1.0:
                self.buf[i:i + 3] = bytes(rgb)
            else:
                for k in range(3):
                    self.buf[i + k] = int(self.buf[i + k] * (1 - alpha) + rgb[k] * alpha)

    def line(self, x0, y0, x1, y1, rgb, width=1):
        x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx + dy
        while True:
            for ox in range(-(width // 2), width // 2 + 1):
                for oy in range(-(width // 2), width // 2 + 1):
                    self.px(x0 + ox, y0 + oy, rgb)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def polygon(self, points, rgb, alpha=1.0):
        if len(points) < 3:
            return
        ys = [p[1] for p in points]
        for y in range(max(0, int(min(ys))), min(self.h, int(max(ys)) + 1)):
            xs = []
            n = len(points)
            for i in range(n):
                x0, y0 = points[i]
                x1, y1 = points[(i + 1) % n]
                if (y0 > y) != (y1 > y):
                    xs.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
            xs.sort()
            for a, b in zip(xs[::2], xs[1::2]):
                for x in range(max(0, int(a)), min(self.w, int(b) + 1)):
                    self.px(x, y, rgb, alpha)

    def write(self, path):
        raw = bytearray()
        for y in range(self.h):
            raw.append(0)
            raw += self.buf[y * self.w * 3:(y + 1) * self.w * 3]

        def chunk(tag, data):
            return (struct.pack('>I', len(data)) + tag + data
                    + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

        png = (b'\x89PNG\r\n\x1a\n'
               + chunk(b'IHDR', struct.pack('>IIBBBBB', self.w, self.h, 8, 2, 0, 0, 0))
               + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
               + chunk(b'IEND', b''))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(png)
        return len(png)


def district_colour(name):
    h = zlib.crc32(name.encode()) & 0xffffffff
    return (60 + (h & 63), 70 + ((h >> 6) & 63), 55 + ((h >> 12) & 47))


def main():
    net = json.loads((ROOT / 'assets' / 'world' / 'network.json').read_text())
    blk = json.loads((ROOT / 'assets' / 'world' / 'blocks.json').read_text())
    nodes = [(n['position'][0], n['position'][2]) for n in net['nodes']]
    canvas = Canvas(W, H)

    for b in blk['blocks']:
        pts = [to_px(x, z) for x, z in b['polygon']]
        canvas.polygon(pts, district_colour(b['district']), 0.85)

    for e in net['edges']:
        a = to_px(*nodes[e['a']])
        b = to_px(*nodes[e['b']])
        if e['kind'] in ('freeway', 'ramp'):
            canvas.line(*a, *b, (196, 150, 84), 2)
        elif e['kind'] == 'tunnel':
            canvas.line(*a, *b, (96, 130, 128), 1)
        else:
            canvas.line(*a, *b, (150, 162, 168), 1)

    for lot in blk['lots']:
        x, y = to_px(*lot['p'])
        canvas.px(int(x), int(y), (232, 198, 120))
        canvas.px(int(x) + 1, int(y), (232, 198, 120))

    # Junctions: the thing the city is short of.
    from collections import Counter
    deg = Counter()
    for e in net['edges']:
        deg[e['a']] += 1
        deg[e['b']] += 1
    for n, d in deg.items():
        if d >= 3:
            x, y = to_px(*nodes[n])
            for ox in (-1, 0, 1):
                for oy in (-1, 0, 1):
                    canvas.px(int(x) + ox, int(y) + oy, (226, 96, 96))

    size = canvas.write(OUT)
    print(f'{OUT.relative_to(ROOT)}  {size/1e6:.2f} MB')
    print(f'{len(blk["blocks"])} blocks, {len(blk["lots"])} lots, '
          f'{sum(1 for d in deg.values() if d >= 3)} junctions (red)')


if __name__ == '__main__':
    main()
