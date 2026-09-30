"""AURORA body, modelled in Blender (2026-09-29).

One continuous subdivision-surface shell (paint, glass canopy, frame) swept
through cross-sections, with the lamps, intakes and vents cut into it, plus
the separate solid parts (wing, mirrors, splitter, diffuser, exhausts, wheel
arch liners). Exported as assets/cars/aurora.glb; world/cars/auroraGlb.js swaps
each material by name for the game's own (paint colour, lamps, signals).

Run:  Blender -b --factory-startup --python tools/blender/aurora.py -- [--render out.png] [--glb path]

Game space is +z forward, +x left, y up, ground y = 0; Blender is Z-up, so a
game point (x, y, z) is stored at (x, -z, y) and the glTF exporter turns it back.
"""
import bpy, bmesh, math, sys, os
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GLB = arg('--glb', os.path.join(ROOT, 'assets', 'cars', 'aurora.glb'))
RENDER = arg('--render')
LOD = '--lod' in ARGS                 # the dealer-fleet body: the cage unsubdivided, no small parts
if LOD and '--glb' not in ARGS: GLB = GLB.replace('.glb', '-lod.glb')

def G(x, y, z):
    return Vector((x, -z, y))

# ------------------------------------------------------------------ curves
def curve(keys):
    """Monotone cubic through [(z, v), ...] (no overshoot), like carBody.js curve()."""
    xs = [k[0] for k in keys]; ys = [k[1] for k in keys]; n = len(keys)
    d = [(ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]) for i in range(n - 1)]
    m = [0.0] * n; m[0] = d[0]; m[-1] = d[-1]
    for i in range(1, n - 1):
        m[i] = 0 if d[i - 1] * d[i] <= 0 else (d[i - 1] + d[i]) / 2
    for i in range(n - 1):
        if d[i] == 0: m[i] = m[i + 1] = 0; continue
        a = m[i] / d[i]; b = m[i + 1] / d[i]; s = a * a + b * b
        if s > 9: t = 3 / math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]
    def f(z):
        if z <= xs[0]: return ys[0]
        if z >= xs[-1]: return ys[-1]
        i = 0
        while z > xs[i + 1]: i += 1
        h = xs[i + 1] - xs[i]; t = (z - xs[i]) / h; t2 = t * t; t3 = t2 * t
        return (2*t3 - 3*t2 + 1) * ys[i] + (t3 - 2*t2 + t) * h * m[i] + (-2*t3 + 3*t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]
    return f

def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
lerp = lambda a, b, t: a + (b - a) * t

# ------------------------------------------------------------------ the car
ZF, ZR, WX, WR = 1.41, -1.41, .91, .365          # wheel centres and radius (carModels.js)
# Profiles fitted (2026-09-30) to Peter's image-to-3D Aurora (aurora_car.glb, scaled to this
# wheelbase) with tools/blender/ref_measure.py + ref_overlay.py: lower and flatter than the
# first cut, a short tail under an overhanging wing, a long nose and a forward windshield.
Z0, Z1 = ZR - .78, ZF + 1.12                     # tail, nose
GZ0, GZ1 = ZR + .26, ZF - .43                    # canopy rear and windshield base
R = WR + .055                                    # arch opening: a tight hypercar arch

# The arches flare 4-8 cm past the reference so they cover the game's tyres (outer edge x 1.04 front, 1.07 rear).
W = curve([(Z0, .87), (Z0 + .1, 1.01), (-1.85, 1.08), (ZR, 1.105), (-1.0, 1.065), (-.72, .98), (-.45, .915), (.35, .905), (.62, .94),
           (1.0, 1.02), (ZF - .1, 1.07), (1.6, 1.065), (1.9, 1.01), (2.1, .95), (2.3, .84), (Z1 - .08, .7), (Z1, .6)])
SILL = curve([(Z0, .24), (Z0 + .2, .2), (Z0 + .45, .165), (-1.0, .15), (0, .15), (1.95, .15), (Z1 - .3, .16), (Z1, .17)])
BELT = curve([(Z0, .74), (Z0 + .1, .83), (-1.85, .865), (-1.6, .9), (ZR, .925), (-1.1, .9), (-.8, .86), (-.5, .8), (.3, .775), (.66, .8),
              (1.0, .84), (ZF, .83), (1.65, .79), (1.85, .72), (2.05, .6), (Z1 - .1, .5), (Z1, .44)])
HOOD = curve([(Z0, .8), (Z0 + .1, .93), (-1.95, .995), (-1.6, 1.015), (GZ0, 1.035), (0, .9), (GZ1, .87), (1.25, .8), (1.45, .78),
              (1.65, .74), (1.85, .69), (2.05, .61), (2.25, .52), (Z1 - .1, .45), (Z1, .42)])
ROOF = curve([(GZ0, 1.05), (-.85, 1.09), (-.45, 1.147), (-.15, 1.168), (.15, 1.162), (.4, 1.13), (.6, 1.06), (.8, .97), (GZ1, .88)])
GW, RW = .77, .48                                # canopy half-widths at its base and roof shoulder

def arch(z):
    y = -1
    for zc in (ZF, ZR):
        dz = z - zc
        if abs(dz) < R: y = max(y, WR + math.sqrt(R * R - dz * dz))
    return y

def canopy(z):
    """0 outside the greenhouse, 1 inside it (ramps at the windshield base and the backlight)."""
    return smooth(GZ1 + .005, GZ1 - .3, z) * smooth(GZ0 - .005, GZ0 + .2, z)

def half_section(z):
    """Control points from the rocker (rolled under) over the top to the centre line."""
    w, s, b, c = W(z), max(SILL(z), arch(z)), BELT(z), HOOD(z)
    k = canopy(z)
    top = lerp(c, ROOF(min(max(z, GZ0), GZ1)), k)
    # A scallop along the doors that deepens into the rear intake.
    sc = smooth(.55, .1, z) * smooth(-1.05, -.7, z) * .055
    side = [(w * .9, s + .012), (w * .94, s), (w * .985, s + .05), (w - sc, s + .45 * (b - s)), (w * .99, b - .09), (w * .955, b - .024)]
    # Fender crest, its inner edge, the channel: relative to the width outside, to the canopy inside.
    out = [(w * .89, b), (w * .765, b - .045), (w * .62, min(b, c) - .004)]
    inn = [(GW + (w - GW) * .72, b), (GW + (w - GW) * .45, b - .006), (GW + (w - GW) * .2, b - .012)]
    mid = [(lerp(o[0], i[0], k), lerp(o[1], i[1], k)) for o, i in zip(out, inn)]
    hood = [(w * .52, c), (w * .39, c + .012), (w * .26, c + .018), (w * .13, c + .021), (0, c + .022)]
    base = b - .015
    cab = [(GW, base), (GW * .93 + RW * .07, base + (top - base) * .5), (RW + .05, top - .035), (RW * .6, top - .004), (0, top + .006)]
    top5 = [(lerp(h[0], q[0], k), lerp(h[1], q[1], k)) for h, q in zip(hood, cab)]
    return side + mid + top5          # 6 + 3 + 5 = 14 points, the last on the centre line

NH = 14
def sweep(z, x):
    """Stations near the ends bend back at the sides, so the nose and tail are round in plan."""
    w = W(z); u = min(1, abs(x) / w) ** 2
    return z - .09 * smooth(Z1 - .55, Z1, z) * u + .09 * smooth(Z0 + .45, Z0, z) * u
def ring(z):
    h = half_section(z)
    return [(x, y) for x, y in h] + [(-x, y) for x, y in reversed(h[:-1])]

def stations():
    zs = set()
    z = Z0
    while z < Z1: zs.add(round(z, 4)); z += .07
    zs.add(Z1)
    for zc in (ZF, ZR):
        for e in (-1, 1):
            for off in (0, .012, .035, .07, .12):
                zz = zc + e * (R - off)
                zs.add(round(zz, 4))
            zs.add(round(zc + e * (R + .012), 4))
    for zz in (Z0 + .03, Z0 + .07, Z0 + .12, Z1 - .03, Z1 - .07, Z1 - .12, GZ1, GZ0, .3, -.8):
        zs.add(round(zz, 4))
    return sorted(zs)

# ------------------------------------------------------------------ materials
MATS = {}
def mat(name, color, rough=.4, metal=0.0, emit=None, alpha=1.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1); bsdf.inputs['Emission Strength'].default_value = 3
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha; m.surface_render_method = 'BLENDED'
    MATS[name] = m
    return m

def setup_materials():
    mat('paint', (.55, .57, .6) if '--light' in ARGS else (.012, .013, .016), .25, .6)
    mat('glass', (.01, .012, .015), .03, .1, alpha=.55)
    mat('gloss', (.004, .004, .005), .12, .3)
    mat('carbon', (.02, .021, .024), .3, .35)
    mat('honey', (.006, .006, .007), .45, .5)
    mat('black', (.006, .006, .007), .6, .2)
    mat('lamp', (.05, .06, .07), .02, .2, alpha=.35)
    mat('head', (.85, .9, .95), .2, 0, emit=(.9, .95, 1))
    mat('tail', (.3, .01, .01), .3, 0, emit=(1, .05, .05))
    mat('accent', (.03, .12, 1), .25, .5)
    mat('chrome', (.8, .8, .82), .08, 1)
    mat('satin', (.4, .42, .45), .32, .9)
    mat('ti', (.6, .58, .55), .22, 1)
    mat('redLens', (.1, .005, .01), .05, .1)
    mat('reverse', (.8, .82, .85), .15, 0)
    mat('mirror', (.7, .75, .8), .02, 1)

def new_obj(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    return ob

def assign(ob, names):
    for n in names: ob.data.materials.append(MATS[n])

# ------------------------------------------------------------------ the shell
TAGS = ['auto', 'paint', 'glass', 'gloss', 'honey', 'black', 'head', 'carbon', 'tail']

def faces_where(bm, pred):
    ZL, JL, SL = (bm.faces.layers.float['z'], bm.faces.layers.int['j'], bm.faces.layers.int['side'])
    return [f for f in bm.faces if pred(f[ZL], f[JL], f[SL])]

def crease_faces(bm, faces, v):
    cr = bm.edges.layers.float.get('crease_edge') or bm.edges.layers.float.new('crease_edge')
    for f in faces:
        for e in f.edges: e[cr] = max(e[cr], v)

def cut(bm, faces, thick, depth, floor, wall, crease=.8):
    """Inset a region of the cage and push it in: a recess with walls, as a moulded opening is."""
    TL = bm.faces.layers.int['tag']
    res = bmesh.ops.inset_region(bm, faces=faces, thickness=thick, depth=depth, use_even_offset=True)
    for f in faces: f[TL] = TAGS.index(floor)
    for f in res['faces']:
        f[TL] = TAGS.index(wall)
        for k in ('z', 'j', 'side'): pass
    crease_faces(bm, res['faces'], crease)
    return res['faces']

def coons(B, D, L, Rr):
    """A quad grid spanning four boundary curves (Coons patch): B top, D bottom (both u), L/Rr sides (v)."""
    nu, nv = len(B) - 1, len(L) - 1
    P = []
    for k in range(nv + 1):
        v = k / nv; row = []
        for i in range(nu + 1):
            u = i / nu
            p = (1 - v) * B[i] + v * D[i] + (1 - u) * L[k] + u * Rr[k] \
                - ((1 - u) * (1 - v) * B[0] + u * (1 - v) * B[-1] + (1 - u) * v * D[0] + u * v * D[-1])
            row.append(p)
        P.append(row)
    return P

def build_shell():
    zs = stations(); n = 2 * NH - 1
    bm = bmesh.new()
    ZL = bm.faces.layers.float.new('z'); JL = bm.faces.layers.int.new('j'); SL = bm.faces.layers.int.new('side'); TL = bm.faces.layers.int.new('tag')
    EL = bm.faces.layers.int.new('end'); UL = bm.faces.layers.int.new('u'); VL = bm.faces.layers.int.new('v')
    rings = [ring(z) for z in zs]
    rows = [[bm.verts.new(G(x, y, sweep(z, x))) for (x, y) in r] for r, z in zip(rings, zs)]
    for i in range(len(rows) - 1):
        a, b = rows[i], rows[i + 1]
        for j in range(n - 1):
            f = bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
            f[ZL] = (zs[i] + zs[i + 1]) / 2
            f[JL] = j if j < NH - 1 else n - 2 - j
            f[SL] = 1 if j < NH - 1 else -1
    # The bumpers: each end ring is closed by a patch that shares its vertices, so
    # the nose and the tail are the same surface as the body (no seam, no gap).
    ends = {}
    for tag, row, zz, back in ((1, rows[-1], Z1, -1), (2, rows[0], Z0, 1)):
        top = row[5:n - 5]                        # shoulder to shoulder over the top
        left = row[5::-1]                         # down the left side to the rocker
        right = row[n - 6:]                       # down the right side to the rocker
        yb = min(v.co.z for v in row)
        x0 = row[0].co.x / top[0].co.x
        D = []
        for i, v in enumerate(top):
            x = v.co.x * x0; u = abs(x) / abs(row[0].co.x)
            # The bottom edge sits a little behind the lip (a nose leaning back, a tail tucked under).
            # Blender y is -z: the nose's bottom edge steps back (+y), the tail's forward (-y).
            D.append(Vector((x, lerp(v.co.y, row[0].co.y, u ** 4) + (.05 if tag == 1 else -.05) * (1 - u ** 4), yb)))
        D[0] = row[0].co.copy(); D[-1] = row[-1].co.copy()
        grid = coons([v.co for v in top], D, [v.co for v in left], [v.co for v in right])
        nv, nu = len(grid) - 1, len(grid[0]) - 1
        verts = []
        for k in range(nv + 1):
            vr = []
            for i in range(nu + 1):
                if k == 0: vr.append(top[i])
                elif i == 0: vr.append(left[k])
                elif i == nu: vr.append(right[k])
                else: vr.append(bm.verts.new(grid[k][i]))
            verts.append(vr)
        # the bottom row's inner vertices
        for i in range(1, nu): verts[nv][i].co = grid[nv][i]
        for k in range(nv):
            for i in range(nu):
                f = bm.faces.new((verts[k][i], verts[k][i + 1], verts[k + 1][i + 1], verts[k + 1][i]))
                f[EL] = tag; f[UL] = i; f[VL] = k; f[ZL] = zz; f[JL] = -1
        ends[tag] = (grid, nu, nv)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    top = max(bm.faces, key=lambda f: f.calc_center_median().z)
    if top.normal.z < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.normal_update()
    crease_faces(bm, [f for f in bm.faces if f[JL] == 0], .5)
    return bm, ends, rings, zs

def shell_cuts(bm):
    """Lamps, intakes and vents moulded into the cage (before subdivision)."""
    parts = {}
    # Headlamps along the fender's leading edge: record the skin first, for the lens.
    lamp = faces_where(bm, lambda z, j, s: Z1 - .6 < z < Z1 - .1 and 5 <= j <= 6)
    parts['lens'] = [[v.co.copy() for v in f.verts] for f in lamp]
    parts['lampFloor'] = lamp
    cut(bm, lamp, .012, -.02, 'gloss', 'head', .9)
    # Side intake at the end of the door scallop, in front of the rear wheel.
    cut(bm, faces_where(bm, lambda z, j, s: -.9 < z < -.52 and 2 <= j <= 3), .015, -.07, 'honey', 'gloss', .8)
    # Hood extractor vents and the louvred engine cover.
    cut(bm, faces_where(bm, lambda z, j, s: 1.62 < z < 1.9 and j == 9), .01, -.012, 'honey', 'gloss', .8)
    cut(bm, faces_where(bm, lambda z, j, s: -2.05 < z < -1.35 and 10 <= j <= 12), .015, -.03, 'honey', 'carbon', .8)
    # Air outlets on top of the rear haunches.
    cut(bm, faces_where(bm, lambda z, j, s: -2.1 < z < -1.75 and 6 <= j <= 7), .01, -.02, 'honey', 'gloss', .8)
    # The bumpers, cut into the end patches (u across, v down from the lip).
    EL, UL, VL, TL = (bm.faces.layers.int[k] for k in ('end', 'u', 'v', 'tag'))
    end = lambda tag, us, vs: [f for f in bm.faces if f[EL] == tag and f[UL] in us and f[VL] in vs]
    for us in (range(5, 11), range(2, 4), range(12, 14)):
        cut(bm, end(1, us, range(1, 4)), .014, -.07, 'honey', 'gloss', .85)
    for f in end(1, range(16), [4]): f[TL] = TAGS.index('carbon')
    # A light blade under the nose lip, echoing the tail's.
    cut(bm, end(1, range(3, 13), [0]), .018, -.004, 'head', 'gloss', .9)
    cut(bm, end(2, range(1, 15), [0]), .006, -.006, 'tail', 'gloss', .9)
    cut(bm, end(2, range(1, 15), range(1, 4)), .014, -.06, 'honey', 'gloss', .85)
    for f in end(2, range(16), [4]): f[TL] = TAGS.index('carbon')
    return parts

def finish_shell(bm):
    ZL, JL, TL = bm.faces.layers.float['z'], bm.faces.layers.int['j'], bm.faces.layers.int['tag']
    names = ['paint', 'glass', 'gloss', 'honey', 'black', 'head', 'carbon', 'tail']
    for f in bm.faces:
        t = TAGS[f[TL]]
        name = face_material(f[ZL], f[JL], False) if t == 'auto' else t
        f.material_index = names.index(name)
    ob = new_obj('Body', bm); assign(ob, names)
    return ob

def face_material(z, j, edge):
    """j: 0 at the rolled-under rocker .. NH-2 at the centre."""
    if edge or j == 0: return 'black'
    k = canopy(z)
    if k > .5 and j >= 9:
        side = j <= 10
        wind = .3 < z < GZ1 - .07
        sidew = side and -.78 < z < .36
        back = -1.03 < z < -.87 and j >= 11
        if wind or sidew or back: return 'glass'
        return 'gloss'
    return 'paint'

# ------------------------------------------------------------------ parts
def mesh_obj(name, verts, faces, m, smooth=True):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], faces); me.update()
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(MATS[m])
    for p in me.polygons: p.use_smooth = smooth
    return ob

def extrude2d(name, pts, x0, x1, m, axis='x', smooth=False):
    """A 2D outline in (z, y) (or (x, z) for axis 'y') extruded between x0 and x1: a plate or a profile."""
    n = len(pts); V = []
    for x in (x0, x1):
        for a, b in pts:
            V.append(G(x, b, a) if axis == 'x' else G(a, x, b) if axis == 'y' else G(a, b, x))
    F = [list(range(n)), list(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n; F.append([i, j, n + j, n + i])
    ob = mesh_obj(name, V, F, m, smooth)
    ob.data.validate(); fix_normals(ob)
    return ob

def fix_normals(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(ob.data); bm.free()

def bevel(ob, w=.004, seg=2):
    m = ob.modifiers.new('bev', 'BEVEL'); m.width = w; m.segments = seg; m.limit_method = 'ANGLE'
    for p in ob.data.polygons: p.use_smooth = True
    ob.modifiers.new('wn', 'WEIGHTED_NORMAL').keep_sharp = True

def round_poly(pts, r, seg=4):
    """Round the corners of a 2D polygon."""
    out = []; n = len(pts)
    for i in range(n):
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % n])
        a, b = (p0 - p1), (p2 - p1)
        rr = min(r, a.length * .45, b.length * .45)
        a.normalize(); b.normalize()
        s, e = p1 + a * rr, p1 + b * rr
        for k in range(seg + 1):
            t = k / seg; q = (1 - t) ** 2 * s + 2 * (1 - t) * t * p1 + t * t * e
            out.append((q.x, q.y))
    return out

def tube(name, pts, r, m, seg=10):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 2
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p, q in zip(sp.points, pts): p.co = (*q, 1)
    ob = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(MATS[m])
    return ob

def lathe(name, prof, m, at, axis='z', seg=32):
    """Revolve [(r, t)] around an axis through `at` (game coords): exhaust tips, projector barrels."""
    V = []; F = []; n = len(prof)
    for i in range(seg):
        a = 2 * math.pi * i / seg; c, s = math.cos(a), math.sin(a)
        for r, t in prof:
            if axis == 'z': V.append(G(at[0] + r * c, at[1] + r * s, at[2] + t))
            else: V.append(G(at[0] + t, at[1] + r * s, at[2] + r * c))
    for i in range(seg):
        for k in range(n - 1):
            a = i * n + k; b = ((i + 1) % seg) * n + k
            F.append([a, b, b + 1, a + 1])
    return mesh_obj(name, V, F, m)

def game(v):
    return (v.x, v.z, -v.y)

def build_parts(parts, ends):
    out = []
    nose, tail = ends[1][0], ends[2][0]
    def face_z(grid, x, y):
        best = min((p for row in grid for p in row), key=lambda p: (p.x - x) ** 2 + (p.z - y) ** 2)
        return -best.y
    # Headlamp lenses: the skin over each lamp, a hair proud, subdivided like it.
    V, F, idx = [], [], {}
    for poly in parts['lens']:
        face = []
        for co in poly:
            key = tuple(round(c, 5) for c in co)
            if key not in idx: idx[key] = len(V); V.append(co)
            face.append(idx[key])
        F.append(face)
    lens = mesh_obj('Lens', V, F, 'lamp'); fix_normals(lens)
    sm = lens.modifiers.new('sub', 'SUBSURF'); sm.levels = sm.render_levels = 0 if LOD else 2
    sd = lens.modifiers.new('push', 'DISPLACE'); sd.strength = .003
    out.append(lens)
    # Projectors: three per lamp, looking down the road.
    for s in (1, -1):
        for f in (.28, .5, .72):
            z = Z1 - .56 + .42 * f
            h = half_section(z); x = (h[6][0] + h[7][0]) / 2 * s; y = (h[6][1] + h[7][1]) / 2 - .025; z = sweep(z, x)
            out.append(lathe(f'proj{s}{f}', [(.0, .0), (.02, .0), (.02, -.03)], 'satin', (x, y, z)))
            out.append(lathe(f'projL{s}{f}', [(.0, .002), (.016, .002), (.017, 0)], 'head', (x, y, z + .002)))
    # Splitter: a carbon plate under the bumper's bottom edge, reaching a little
    # ahead of it, with a blue edge; it runs back under the fender corners.
    bottom = [game(p) for p in nose[-1]]
    front = [(x * 1.02, z + .07 * (1 - (x / bottom[0][0]) ** 4) + .012) for x, y, z in bottom]
    xe = abs(bottom[0][0]) * 1.02
    sides = [(xe + .03 * math.sin(math.pi / 2 * t), bottom[0][2] - .02 - .3 * t) for t in (.25, .5, .75, 1)]
    plan = [(x, z) for x, z in sides[::-1]] + front + [(-x, z) for x, z in sides]
    back = [(x, Z1 - .62) for x in (-(xe + .03), xe + .03)]
    yb = bottom[0][1]
    out.append(extrude2d('Splitter', plan + back[::-1][::-1], yb - .028, yb + .004, 'carbon', axis='y'))
    out.append(tube('SplitEdge', [G(x, yb - .012, z + .004) for x, z in front], .0055, 'accent'))
    # Arch liners and the floor.
    for zc in (ZF, ZR):
        for s in (1, -1):
            V, F = [], []; A = 20
            x0, x1 = .76 * s, W(zc) * .97 * s          # inboard edge under the fender, clear of the hood channel
            for i in range(A + 1):
                a = math.radians(-12 + 204 * i / A)
                for x in (x0, x1):
                    V.append(G(x, WR + math.sin(a) * (R - .012), zc + math.cos(a) * (R - .012)))
            for i in range(A): F.append([2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2])
            out.append(mesh_obj(f'Liner{zc}{s}', V, F, 'black'))
    # Side skirts: carbon wedges between the arches, growing out of the rocker to a blade edge.
    for s in (1, -1):
        sk = round_poly([(s * .8, .13), (s * .95, .13), (s * .965, .143), (s * .95, .157), (s * .86, .215), (s * .8, .215)], .006, 2)
        ob = extrude2d(f'Skirt{s}', sk, ZR + R + .03, ZF - R - .03, 'carbon', axis='z'); bevel(ob, .003, 2); out.append(ob)
    fl = [G(.86, .16, Z0 + .3), G(-.86, .16, Z0 + .3), G(-.86, .16, Z1 - .35), G(.86, .16, Z1 - .35)]
    out.append(mesh_obj('Floor', fl, [[0, 1, 2, 3]], 'black', False))
    # Tail: reversing lamps and titanium exhausts through the honeycomb, a diffuser under the tail.
    tb = [game(p) for p in tail[-1]]; ty = tb[0][1]; tzc = tb[len(tb) // 2][2]
    for s in (1, -1):
        zr_ = face_z(tail, s * .3, .5)
        out.append(extrude2d(f'Reverse{s}', round_poly([(s * .25, .49), (s * .35, .49), (s * .35, .515), (s * .25, .515)], .01), zr_ + .02, zr_ + .05, 'reverse', axis='z'))
        out.append(lathe(f'Exhaust{s}', [(.05, .14), (.054, .04), (.057, -.01), (.063, -.028), (.06, -.034), (.051, -.03)], 'ti', (s * .12, .47, face_z(tail, s * .12, .47) + .02)))
    V = [G(.84, .155, tzc + .7), G(-.84, .155, tzc + .7), G(-.84, ty + .01, tzc + .02), G(.84, ty + .01, tzc + .02)]
    out.append(mesh_obj('Diffuser', V, [[0, 1, 2, 3]], 'carbon', False))
    for k in range(-3, 4):
        out.append(extrude2d(f'Strake{k}', round_poly([(tzc + .62, .14), (tzc + .03, .14), (tzc + .03, ty), (tzc + .62, .17)], .008, 3), k * .22 - .006, k * .22 + .006, 'carbon'))
    # Spine fin down the engine cover.
    fin = [(z, max(HOOD(z), ROOF(max(z, GZ0)) if z > GZ0 else HOOD(z)) + .06) for z in [GZ0 + .1 - i * .09 for i in range(12)]]
    fin += [(z, y - .09) for z, y in reversed(fin)]
    out.append(extrude2d('Fin', fin, -.006, .006, 'carbon'))
    # Wing: main plane and flap on swan necks, endplates.
    def foil(c, t, a, dz, dy):
        up, lo = [], []
        for i in range(17):
            x = (1 - math.cos(math.pi * i / 16)) / 2
            th = 5 * t * (.2969 * math.sqrt(x) - .126 * x - .3516 * x * x + .2843 * x ** 3 - .1015 * x ** 4)
            cam = .06 * c * math.sin(math.pi * x)
            up.append((-x * c, th * c + cam)); lo.append((-x * c, -th * c + cam))
        pts = up + lo[::-1][1:-1]
        return [(z * math.cos(a) - y * math.sin(a) + dz, z * math.sin(a) + y * math.cos(a) + dy) for z, y in pts]
    # The wing sits low, level with the roof's rear, and overhangs the tail.
    wz, wy, span = Z0 + .15, .99, 1.72
    for nm, pts in (('Wing', foil(.36, .12, -.14, wz, wy)), ('Flap', foil(.13, .1, -.55, wz - .33, wy + .07))):
        ob = extrude2d(nm, pts, -span / 2, span / 2, 'carbon'); bevel(ob, .003, 2); out.append(ob)
    for s in (1, -1):
        ep = round_poly([(wz + .03, wy - .035), (wz + .01, wy + .05), (wz - .4, wy + .115), (wz - .43, wy + .03), (wz - .22, wy - .05)], .025, 4)
        ob = extrude2d(f'Endplate{s}', ep, s * span / 2, s * (span / 2 + .012), 'carbon'); bevel(ob, .003, 2); out.append(ob)
        dz = -1.72; dy = HOOD(dz) - .02
        neck = round_poly([(dz, dy), (dz - .26, dy), (wz - .16, wy + .055), (wz - .04, wy + .07), (wz + .02, wy + .03), (wz - .1, wy + .01)], .03, 4)
        ob = extrude2d(f'Neck{s}', neck, s * .33, s * .352, 'carbon'); bevel(ob, .003, 2); out.append(ob)
    # Mirrors: teardrop pods on stalks.
    for s in (1, -1):
        mz = .56; h = half_section(mz); bx, by = h[6][0] * s, h[6][1]
        pod = (bx + s * .15, by + .11, mz - .02)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=1)
        ob = bpy.context.active_object; ob.name = f'Mirror{s}'; ob.scale = (.062, .115, .036); ob.location = G(*pod)
        ob.data.materials.append(MATS['paint']); bpy.ops.object.shade_smooth(); out.append(ob)
        out.append(mesh_obj(f'MirrorGlass{s}', [G(pod[0] - .045, pod[1] - .022, pod[2] - .1), G(pod[0] + .045, pod[1] - .022, pod[2] - .1), G(pod[0] + .045, pod[1] + .022, pod[2] - .1), G(pod[0] - .045, pod[1] + .022, pod[2] - .1)], [[0, 1, 2, 3]], 'mirror', False))
        out.append(tube(f'Stalk{s}', [G(bx - s * .02, by - .005, mz + .03), G(bx + s * .1, by + .08, mz + .01), G(pod[0] - s * .03, pod[1] - .01, pod[2] + .01)], .012, 'carbon'))
    # Signals: a guide under each headlamp, a repeater on each mirror, the blade's outer ends.
    for s in (1, -1):
        side = 'L' if s > 0 else 'R'
        pts = []
        for i in range(12):
            z = Z1 - .52 + .38 * i / 11; h = half_section(z); pts.append(G(h[5][0] * s * 1.004, h[5][1] - .004, sweep(z, h[5][0])))
        out.append(tube(f'signal{side}front', pts, .0045, 'head'))
        # Rear: the blade's outer ends turn down the tail corners in amber.
        col = 1 if s > 0 else len(tail[0]) - 2
        pts = [game(tail[k][col]) for k in (0, 1, 2)]
        out.append(tube(f'signal{side}rear', [G(x, y, z - .012) for x, y, z in pts], .008, 'head'))
        out.append(tube(f'signal{side}mirror', [G(bx_ + s * .0, 0, 0) for bx_ in ()] or [G(s * (half_section(.56)[6][0] + .15 + .05), half_section(.56)[6][1] + .085, .6), G(s * (half_section(.56)[6][0] + .15 + .062), half_section(.56)[6][1] + .1, .5)], .004, 'head'))
    return out
# ------------------------------------------------------------------ scene
def subdivide(ob, levels=2):
    m = ob.modifiers.new('sub', 'SUBSURF'); m.levels = levels; m.render_levels = levels
    if levels:
        # Panel thickness: the arch and sill edges read as rolled metal, not paper.
        t = ob.modifiers.new('thick', 'SOLIDIFY'); t.thickness = .014; t.offset = -1; t.use_rim = True
        t.material_offset_rim = 4                          # the rim in 'black' (index 4)
    bpy.context.view_layer.objects.active = ob
    for p in ob.data.polygons: p.use_smooth = True

def render(path):
    s = bpy.context.scene
    s.render.engine = 'BLENDER_EEVEE_NEXT'; s.render.resolution_x = 1280; s.render.resolution_y = 720
    s.eevee.taa_render_samples = 32
    w = bpy.data.worlds.new('w'); s.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (.55, .6, .68, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); s.collection.objects.link(sun)
    sun.data.energy = 3; sun.rotation_euler = (.9, .2, 2.4)
    bpy.ops.mesh.primitive_plane_add(size=40); fl = bpy.context.active_object
    fm = bpy.data.materials.new('floor'); fm.use_nodes = True; fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.35, .36, .38, 1)
    fl.data.materials.append(fm)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); s.collection.objects.link(cam); s.camera = cam
    cam.data.lens = 60
    views = [('q34f', 40, 10, 7.5), ('side', 90, 2, 8.5), ('q34r', 145, 16, 7.5), ('top', 50, 48, 7), ('front', 0, 6, 7)]
    if arg('--views'): views = [v for v in views + [('hood', 15, 28, 5), ('nose', 25, 5, 4.2), ('rear', 180, 8, 6), ('low', 60, 0, 6)] if v[0] in arg('--views').split(',')]
    base, ext = os.path.splitext(path)
    for name, yaw, pitch, dist in views:
        yr, pr = math.radians(yaw), math.radians(pitch)
        t = G(0, .55, 0)
        # yaw 0 looks from the front (+z), 90 from the left (+x).
        p = G(math.sin(yr) * math.cos(pr) * dist, .55 + math.sin(pr) * dist, math.cos(yr) * math.cos(pr) * dist)
        cam.location = p
        d = (t - p); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        s.render.filepath = f'{base}-{name}{ext}'
        bpy.ops.render.render(write_still=True)

def export(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    os.makedirs(os.path.dirname(GLB), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=GLB, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_materials='EXPORT', export_normals=True, export_texcoords=False, export_cameras=False, export_lights=False)

def main():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    setup_materials()
    bm, ends, rings, zs = build_shell()
    parts = shell_cuts(bm)
    body = finish_shell(bm)
    subdivide(body, 0 if LOD else 2)
    objs = [body] + build_parts(parts, ends)
    if RENDER: render(RENDER)
    if LOD:
        small = ('proj', 'signal', 'MirrorGlass', 'Strake', 'Reverse', 'Stalk', 'SplitEdge', 'Liner', 'Exhaust', 'Flap')
        for o in [o for o in objs if o.name.startswith(small)]: objs.remove(o); bpy.data.objects.remove(o)
    if '--export' in ARGS: export(objs)

main()
