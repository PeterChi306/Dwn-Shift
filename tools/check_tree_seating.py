"""Check tree Z values against the heightmap Unreal actually imported.

Decodes output/unreal/los-santerra-height.png (16-bit greyscale, stdlib only),
converts each sample to the Unreal Z the Landscape will produce given the
transform in los-santerra-terrain.json, and reports the gap to the tree Z in
los-santerra-trees.json.

Run:  python3 tools/check_tree_seating.py
"""
import json
import random
import struct
import sys
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'output' / 'unreal'


def read_png16(path):
    data = path.read_bytes()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', 'not a PNG'
    pos, idat, width, height, depth, colour = 8, [], None, None, None, None
    while pos < len(data):
        length, = struct.unpack('>I', data[pos:pos + 4])
        kind = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        if kind == b'IHDR':
            width, height, depth, colour = struct.unpack('>IIBB', body[:10])
        elif kind == b'IDAT':
            idat.append(body)
        elif kind == b'IEND':
            break
        pos += 12 + length
    assert depth == 16 and colour == 0, 'expected 16-bit greyscale, got depth %s colour %s' % (depth, colour)

    raw = zlib.decompress(b''.join(idat))
    stride = width * 2
    rows, prev, pos = [], bytearray(stride), 0
    for _ in range(height):
        ftype = raw[pos]
        line = bytearray(raw[pos + 1:pos + 1 + stride])
        pos += 1 + stride
        if ftype == 1:
            for i in range(2, stride):
                line[i] = (line[i] + line[i - 2]) & 0xFF
        elif ftype == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ftype == 3:
            for i in range(stride):
                left = line[i - 2] if i >= 2 else 0
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 0xFF
        elif ftype == 4:
            for i in range(stride):
                a = line[i - 2] if i >= 2 else 0
                b = prev[i]
                c = prev[i - 2] if i >= 2 else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 0xFF
        elif ftype != 0:
            raise ValueError('unknown PNG filter %d' % ftype)
        rows.append(struct.unpack('>%dH' % width, bytes(line)))
        prev = line
    return width, height, rows


def main():
    meta = json.load(open(OUT / 'los-santerra-terrain.json'))['unreal']
    loc, sx, sz = meta['landscapeLocation'], meta['scaleX'], meta['scaleZ']
    width, height, rows = read_png16(OUT / 'los-santerra-height.png')
    print('heightmap %d x %d, landscape at %s, scale XY %.4f Z %.4f'
          % (width, height, loc[:2], sx, sz))

    def ground_z(x, y):
        # world cm -> heightmap vertex index (nearest)
        i = int(round((x - loc[0]) / sx))
        j = int(round((y - loc[1]) / sx))
        if not (0 <= i < width and 0 <= j < height):
            return None
        return (rows[j][i] - 32768) * sz / 128.0 + loc[2]

    species = json.load(open(OUT / 'los-santerra-trees.json'))['species']
    flat = [(k, it) for k, v in species.items() for it in v]
    random.seed(7)
    sample = random.sample(flat, min(4000, len(flat)))

    gaps, outside = [], 0
    for kind, (x, y, z, _yaw, _s) in sample:
        g = ground_z(x, y)
        if g is None:
            outside += 1
            continue
        gaps.append((z - g, kind, x, y, z, g))

    print('sampled %d trees (%d fell outside the heightmap)' % (len(sample), outside))
    if not gaps:
        return
    gaps.sort()
    vals = [g[0] for g in gaps]
    def pct(p):
        return vals[min(len(vals) - 1, int(len(vals) * p))]
    print('gap tree-z minus ground-z, metres:')
    print('   min %8.2f   p05 %8.2f   median %8.2f   p95 %8.2f   max %8.2f'
          % (vals[0] / 100, pct(0.05) / 100, pct(0.5) / 100, pct(0.95) / 100, vals[-1] / 100))
    within = sum(1 for v in vals if abs(v) < 200)
    print('   %.1f%% of trees within 2 m of the landscape surface' % (100.0 * within / len(vals)))
    for label, g in (('lowest ', gaps[0]), ('median ', gaps[len(gaps) // 2]), ('highest', gaps[-1])):
        print('   %s %-5s at (%9.0f, %9.0f)  tree %8.0f  ground %8.0f  gap %7.1f m'
              % (label, g[1], g[2], g[3], g[4], g[5], g[0] / 100))


if __name__ == '__main__':
    main()
