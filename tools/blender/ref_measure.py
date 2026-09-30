"""Measure a reference car mesh (e.g. an image-to-3D GLB) in game space, to fit aurora.py's profiles to.

Run:  Blender -b --factory-startup --python tools/blender/ref_measure.py -- ref.glb [--wb 2.82] [--out ref.json]

Finds the nose (the end without the wing), the axles (the two clusters of lowest
vertices, the tyre contact patches), scales it to the game wheelbase, puts the
ground at y = 0 and the axle midpoint at z = 0, then bins the vertices by z and
prints the silhouettes the body curves are built from.
"""
import bpy, sys, json, math
import numpy as np

ARGS = sys.argv[sys.argv.index('--') + 1:]
REF = ARGS[0]
arg = lambda n, d=None: ARGS[ARGS.index(n) + 1] if n in ARGS else d
WB = float(arg('--wb', 2.82))

def load_game_space(path, wb=WB):
    """The reference's vertices as an (n, 3) array in game space (+z forward, +x left, y up), plus its transform."""
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    ob = [o for o in bpy.context.scene.objects if o.type == 'MESH' and o not in before][0]
    me = ob.data
    P = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', P); P = P.reshape(-1, 3)
    P = P @ np.array(ob.matrix_world.to_3x3()).T + np.array(ob.matrix_world.translation)
    # Blender Z-up: long axis is X or Y, up is Z.
    ext = P.max(0) - P.min(0)
    L = 0 if ext[0] > ext[1] else 1
    long, lat, up = P[:, L], P[:, 1 - L], P[:, 2]
    lo = up.min()
    # Tyre contact patches: the lowest 0.5 % of the height, split at the long-axis middle.
    low = up < lo + .005 * (up.max() - lo) + 1e-4
    mid = (long.min() + long.max()) / 2
    a, b = long[low & (long < mid)].mean(), long[low & (long > mid)].mean()
    # The wing: the highest points sit near the tail.
    top = up > up.max() - .08 * (up.max() - lo)
    tail_positive = long[top].mean() > mid
    fwd = -1 if tail_positive else 1
    s = wb / abs(b - a)
    zc = (a + b) / 2
    z = (long - zc) * fwd * s
    y = (up - lo) * s
    x = lat * s * (1 if (L == 1) == (fwd > 0) else -1)   # sign only mirrors; the car is symmetric
    info = dict(axis='xy'[L], fwd=fwd, scale=s, zc=zc, lo=lo, axles=[(a - zc) * fwd * s, (b - zc) * fwd * s])
    return np.stack([x, y, z], 1), ob, info

if __name__ == '__main__':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    V, ob, info = load_game_space(REF)
    x, y, z = V.T
    print('INFO', info)
    print('BOUNDS x %.3f..%.3f y %.3f..%.3f z %.3f..%.3f' % (x.min(), x.max(), y.min(), y.max(), z.min(), z.max()))
    ax = np.abs(x)
    rows = []
    for zz in np.arange(round(z.min(), 2), z.max() + .05, .05):
        m = np.abs(z - zz) < .025
        if m.sum() < 5: continue
        c = m & (ax < .06)
        cy = np.sort(y[c]) if c.any() else np.array([])
        # centreline surfaces: gaps > 5 cm split them into separate parts (body, fin, wing)
        parts = []
        if len(cy):
            st = cy[0]
            for p, q in zip(cy[:-1], cy[1:]):
                if q - p > .05: parts.append((round(st, 3), round(p, 3))); st = q
            parts.append((round(st, 3), round(cy[-1], 3)))
        bodyW = ax[m & (y > .3) & (y < 1.05)].max(initial=0)
        # width by height band, to see the tumblehome / fender crest
        bands = [round(float(ax[m & (y >= h) & (y < h + .1)].max(initial=0)), 3) for h in np.arange(.1, 1.3, .1)]
        # lowest point of the body in the sill zone (outside the wheels in z it is the sill)
        sill = y[m & (ax > .55) & (ax < .8)].min(initial=9)
        rows.append(dict(z=round(float(zz), 3), cl=parts, W=round(float(bodyW), 3), sill=round(float(sill), 3), bands=bands))
    for r in rows:
        print('Z %6.2f W %.3f sill %.3f cl %s | %s' % (r['z'], r['W'], r['sill'], r['cl'], ' '.join('%.2f' % b for b in r['bands'])))
    if arg('--out'):
        json.dump(dict(info={k: (float(v) if not isinstance(v, (list, str)) else v) for k, v in info.items()}, rows=rows), open(arg('--out'), 'w'), default=float)
