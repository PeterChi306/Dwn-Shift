"""Shared helpers for the AURORA Blender scripts (aurora.py, aurora_parts.py,
aurora_engine.py, aurora_wheel.py): game-space conversion, curves, materials and
mesh builders.

Game space is +z forward, +x left, y up, ground y = 0; Blender is Z-up, so a
game point (x, y, z) is stored at (x, -z, y) and the glTF exporter turns it back.
Builders take game-space points.
"""
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOD = '--lod' in ARGS

def G(x, y=None, z=None):
    if y is None: x, y, z = x
    return Vector((x, -z, y))
def game(v):
    return Vector((v.x, v.z, -v.y))
V = lambda *a: Vector(a)
TAU = math.pi * 2

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
clamp = lambda v, a, b: max(a, min(b, v))

def bezier(p0, p1, p2, p3, n):
    """Cubic Bezier through 4 game points (tuples or Vectors), n + 1 samples."""
    p0, p1, p2, p3 = map(Vector, (p0, p1, p2, p3))
    return [(1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3 for t in (i / n for i in range(n + 1))]

def resample(pts, n):
    """n + 1 points evenly spaced along a polyline."""
    pts = [Vector(p) for p in pts]
    L = [0.0]
    for a, b in zip(pts, pts[1:]): L.append(L[-1] + (b - a).length)
    out = []
    for i in range(n + 1):
        s = L[-1] * i / n; k = 1
        while k < len(L) - 1 and L[k] < s: k += 1
        t = (s - L[k - 1]) / max(1e-9, L[k] - L[k - 1])
        out.append(pts[k - 1].lerp(pts[k], t))
    return out

# ------------------------------------------------------------------ materials
MATS = {}
def mat(name, color, rough=.4, metal=0.0, emit=None, alpha=1.0, strength=3):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1); bsdf.inputs['Emission Strength'].default_value = strength
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha; m.surface_render_method = 'BLENDED'
    MATS[name] = m
    return m

def setup_materials(light=False):
    """Every name here has a game material of the same name (world/cars/auroraGlb.js)."""
    mat('paint', (.55, .57, .6) if light else (.012, .013, .016), .25, .6)
    mat('glass', (.01, .012, .015), .03, .1, alpha=.55)
    mat('glassE', (.02, .022, .025), .02, .1, alpha=.25)            # the engine window: clear, to show the V8
    mat('gloss', (.004, .004, .005), .12, .3)
    mat('carbon', (.02, .021, .024), .3, .35)
    mat('carbonM', (.03, .031, .034), .5, .3)            # matte (forged) carbon: the under-tray, liners
    mat('honey', (.006, .006, .007), .45, .5)
    mat('black', (.006, .006, .007), .6, .2)
    mat('lamp', (.05, .06, .07), .02, .2, alpha=.35)
    mat('head', (.85, .9, .95), .2, 0, emit=(.9, .95, 1))
    mat('tail', (.3, .01, .01), .3, 0, emit=(1, .05, .05))
    mat('tailLens', (.25, .02, .03), .05, .1, alpha=.6)
    mat('accent', (.03, .12, 1), .25, .5)
    mat('chrome', (.8, .8, .82), .08, 1)
    mat('satin', (.4, .42, .45), .32, .9)
    mat('ti', (.6, .58, .55), .22, 1)
    mat('heat', (.25, .2, .3), .3, 1)                     # heat-blued titanium pipework
    mat('redLens', (.1, .005, .01), .05, .1)
    mat('amber', (.5, .25, .02), .1, .1)
    mat('reverse', (.8, .82, .85), .15, 0)
    mat('mirror', (.7, .75, .8), .02, 1)
    mat('mesh', (.03, .03, .033), .35, .8)                 # the woven / hex grille wire
    mat('radiator', (.05, .05, .055), .5, .7)              # cooler cores behind the grilles
    mat('foil', (.8, .6, .25), .25, 1)                     # gold heat-reflective foil (engine bay)
    mat('alu', (.55, .56, .58), .35, 1)                    # cast and machined aluminium
    mat('steel', (.12, .12, .13), .4, .9)                  # dark steel: bolts, brackets, springs
    mat('engine', (.08, .085, .09), .45, .6)               # the block and heads, dark cast finish
    mat('red', (.6, .02, .03), .3, .2)                     # coil packs, pins
    mat('blue', (.02, .1, .8), .25, .5)                    # anodised fittings
    mat('yellow', (.9, .7, .05), .4, 0)                    # service caps
    mat('rubber', (.02, .02, .02), .85, 0)
    mat('white', (.85, .86, .88), .4, 0)                   # lettering, decals
    mat('bay', (.01, .01, .012), .7, .1)                   # engine bay tub

# ------------------------------------------------------------------ objects
def link(ob):
    bpy.context.scene.collection.objects.link(ob); return ob

def new_obj(name, bm):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    return link(bpy.data.objects.new(name, me))

def mesh_obj(name, verts, faces, m, smooth=True, game_space=False):
    """verts in Blender space (or game space with game_space=True)."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(G(v) if game_space else v) for v in verts], [], faces); me.update()
    ob = link(bpy.data.objects.new(name, me))
    for n in (m if isinstance(m, (list, tuple)) else [m]): ob.data.materials.append(MATS[n])
    for p in me.polygons: p.use_smooth = smooth
    return ob

def fix_normals(ob):
    bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(ob.data); bm.free()

def bevel(ob, w=.004, seg=2, angle=40):
    m = ob.modifiers.new('bev', 'BEVEL'); m.width = w; m.segments = seg; m.limit_method = 'ANGLE'; m.angle_limit = math.radians(angle)
    m.harden_normals = False
    for p in ob.data.polygons: p.use_smooth = True
    ob.modifiers.new('wn', 'WEIGHTED_NORMAL').keep_sharp = True
    return ob

def subsurf(ob, levels=2):
    m = ob.modifiers.new('sub', 'SUBSURF'); m.levels = m.render_levels = levels
    for p in ob.data.polygons: p.use_smooth = True
    return ob

def round_poly(pts, r, seg=4):
    """Round the corners of a 2D polygon (r a number or one radius per corner)."""
    out = []; n = len(pts)
    for i in range(n):
        ri = r[i] if isinstance(r, (list, tuple)) else r
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % n])
        if ri <= 0: out.append((p1.x, p1.y)); continue
        a, b = (p0 - p1), (p2 - p1)
        rr = min(ri, a.length * .45, b.length * .45)
        a.normalize(); b.normalize()
        s, e = p1 + a * rr, p1 + b * rr
        for k in range(seg + 1):
            t = k / seg; q = (1 - t) ** 2 * s + 2 * (1 - t) * t * p1 + t * t * e
            out.append((q.x, q.y))
    return out

def superellipse(a, b, n=4, seg=24, rot=0):
    """A closed superellipse outline, half-sizes a, b (n = 2 ellipse, larger = boxier)."""
    out = []
    for i in range(seg):
        t = TAU * i / seg + rot; c, s = math.cos(t), math.sin(t)
        out.append((a * math.copysign(abs(c) ** (2 / n), c), b * math.copysign(abs(s) ** (2 / n), s)))
    return out

class Mesh:
    """Accumulates game-space geometry for one object; .obj(name, mats) makes it."""
    def __init__(self):
        self.v = []; self.f = []; self.m = []; self.names = []
    def mi(self, m):
        if m not in self.names: self.names.append(m)
        return self.names.index(m)
    def add(self, verts, faces, m, M=None):
        o = len(self.v); k = self.mi(m)
        for p in verts:
            p = Vector(p)
            self.v.append(M @ p if M is not None else p)
        for f in faces:
            self.f.append([o + i for i in f]); self.m.append(k)
        return self
    def merge(self, other, M=None):
        for f, k in zip(other.f, other.m): pass
        o = len(self.v)
        for p in other.v: self.v.append(M @ p if M is not None else p)
        for f, k in zip(other.f, other.m):
            self.f.append([o + i for i in f]); self.m.append(self.mi(other.names[k]))
        return self
    def obj(self, name, smooth=True, flip_check=False):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(G(p)) for p in self.v], [], self.f); me.update()
        ob = link(bpy.data.objects.new(name, me))
        for n in self.names: ob.data.materials.append(MATS[n])
        for p, k in zip(me.polygons, self.m): p.material_index = k; p.use_smooth = smooth
        me.validate()
        return ob

# ---------------------------------------------------------------- frames
def frame(origin, fwd, up=(0, 1, 0)):
    """A 4x4 game-space matrix: local +z along fwd, +y as close to up as possible, at origin."""
    z = Vector(fwd).normalized(); x = Vector(up).cross(z)
    if x.length < 1e-6: x = Vector((1, 0, 0)).cross(z)
    x.normalize(); y = z.cross(x)
    M = Matrix.Identity(4)
    for i in range(3): M[i][0], M[i][1], M[i][2], M[i][3] = x[i], y[i], z[i], origin[i]
    return M
def T(x, y, z): return Matrix.Translation((x, y, z))
def Rot(axis, a): return Matrix.Rotation(a, 4, axis)          # axis 'X', 'Y', 'Z' (game axes)
def S(x, y=None, z=None):
    y = x if y is None else y; z = x if z is None else z
    return Matrix.Diagonal((x, y, z, 1))

# ---------------------------------------------------------------- generators (local space; place with M)
def lathe(prof, seg=32, closed_start=False, closed_end=False, a0=0, a1=TAU):
    """Revolve [(r, t)] around local +z: (r cos, r sin, t). Returns verts, faces."""
    full = abs(a1 - a0 - TAU) < 1e-6; ns = seg if full else seg + 1
    V_ = []; F = []; n = len(prof)
    for i in range(ns):
        a = a0 + (a1 - a0) * i / seg; c, s = math.cos(a), math.sin(a)
        for r, t in prof: V_.append((r * c, r * s, t))
    for i in range(seg):
        i2 = (i + 1) % ns
        for k in range(n - 1):
            a = i * n + k; b = i2 * n + k
            F.append([a, a + 1, b + 1, b])
    return V_, F

def loft(rings, closed=True, cap0=False, cap1=False):
    """Quads between rings of equal length (lists of 3D points). Returns verts, faces."""
    V_ = [p for r in rings for p in r]; n = len(rings[0]); F = []
    m = n if closed else n - 1
    for i in range(len(rings) - 1):
        for j in range(m):
            j2 = (j + 1) % n
            F.append([i * n + j, i * n + j2, (i + 1) * n + j2, (i + 1) * n + j])
    if cap0: F.append(list(range(n))[::-1])
    if cap1: F.append([(len(rings) - 1) * n + j for j in range(n)])
    return V_, F

def path_frames(path, up=(0, 1, 0)):
    """Rotation-minimising frames along a polyline (parallel transport), first normal from `up`."""
    P = [Vector(p) for p in path]; n = len(P)
    Tn = []
    for i in range(n):
        d = (P[min(n - 1, i + 1)] - P[max(0, i - 1)]); Tn.append(d.normalized())
    N = Vector(up) - Vector(up).dot(Tn[0]) * Tn[0]
    if N.length < 1e-6: N = Tn[0].orthogonal()
    N.normalize(); out = []
    for i in range(n):
        if i:
            v1 = P[i] - P[i - 1]
            c1 = v1.dot(v1)
            if c1 > 1e-12:
                rL = N - (2 / c1) * v1.dot(N) * v1; tL = Tn[i - 1] - (2 / c1) * v1.dot(Tn[i - 1]) * v1
                v2 = Tn[i] - tL; c2 = v2.dot(v2)
                N = rL - (2 / c2) * v2.dot(rL) * v2 if c2 > 1e-12 else rL
                N.normalize()
        B = Tn[i].cross(N)
        out.append((P[i], Tn[i], N, B))
    return out

def sweep(path, profile, up=(0, 1, 0), closed_path=False, cap=True, scale=None, fixed_up=False):
    """Sweep a closed 2D profile [(u, v)] (u along the side vector, v along `up`) down a path.
    profile may be a function i -> profile. scale(i) scales it."""
    fr = path_frames(path, up)
    rings = []
    for i, (p, t, nrm, b) in enumerate(fr):
        if fixed_up:
            b = Vector(up).cross(t).normalized(); nrm = t.cross(b).normalized(); b = nrm.cross(t)
            b = -b
        pr = profile(i) if callable(profile) else profile
        s = scale(i) if scale else 1
        rings.append([p + (-b) * (u * s) + nrm * (v * s) for u, v in pr])
    V_, F = loft(rings, True, cap and not closed_path, cap and not closed_path)
    if closed_path:
        n = len(rings[0]); L = len(rings)
        for j in range(n):
            j2 = (j + 1) % n
            F.append([(L - 1) * n + j, (L - 1) * n + j2, j2, j])
    return V_, F

def prism(poly, depth, z0=None):
    """A 2D polygon (x, y) extruded along local z from z0 to z0 + depth (centred if z0 None)."""
    z0 = -depth / 2 if z0 is None else z0
    n = len(poly)
    V_ = [(x, y, z0) for x, y in poly] + [(x, y, z0 + depth) for x, y in poly]
    F = [list(range(n))[::-1], list(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n; F.append([i, j, n + j, n + i])
    return V_, F

def box(sx, sy, sz):
    """A box centred at the origin (sizes)."""
    x, y, z = sx / 2, sy / 2, sz / 2
    V_ = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z), (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]
    F = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]]
    return V_, F

def rbox(sx, sy, sz, r, seg=3):
    """A box with every edge rounded by r, centred at the origin (local)."""
    rr = max(1e-4, min(r, sx * .45, sy * .45, sz * .45)); rings = []
    zs = [(-sz / 2 + rr * (1 - math.cos(math.pi / 2 * k / seg)), rr * (1 - math.sin(math.pi / 2 * k / seg))) for k in range(seg + 1)]
    zs += [(-z, d) for z, d in reversed(zs)]
    for z, d in zs:
        hx, hy = sx / 2 - d, sy / 2 - d
        prof = round_poly([(-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)], max(1e-4, rr - d), seg)
        rings.append([Vector((x, y, z)) for x, y in prof])
    return loft(rings, True, True, True)

def cyl(r, h, seg=24, z0=0, cap=True, r1=None):
    r1 = r if r1 is None else r1
    prof = ([(0.0, z0)] if cap else []) + [(r, z0), (r1, z0 + h)] + ([(0.0, z0 + h)] if cap else [])
    return lathe(prof, seg)

def hexagon(r, rot=math.pi / 6):
    return [(r * math.cos(rot + TAU * i / 6), r * math.sin(rot + TAU * i / 6)) for i in range(6)]

def hex_web(inside, cell=.016, wall=.0022, depth=.006, bounds=(-1, 1, -1, 1)):
    """A honeycomb web in local xy (holes open), depth along -z from z = 0. `inside(x, y)` keeps a cell.
    Returns verts, faces."""
    V_ = []; F = []
    R_ = cell / math.sqrt(3)                   # hexagon circumradius, flat-topped rows
    dx, dy = cell, cell * math.sqrt(3) / 2
    x0, x1, y0, y1 = bounds
    row = 0; y = y0
    while y <= y1:
        x = x0 + (dx / 2 if row % 2 else 0)
        while x <= x1:
            if inside(x, y):
                ho = hexagon(R_ + 1e-4, math.pi / 2); hi = hexagon(R_ - wall / math.sqrt(3) * 2, math.pi / 2)
                o = len(V_)
                for (a, b), (c, d) in zip(ho, hi):
                    V_ += [(x + a, y + b, 0), (x + c, y + d, 0), (x + c, y + d, -depth)]
                for i in range(6):
                    j = (i + 1) % 6
                    oi, oj = o + 3 * i, o + 3 * j
                    F.append([oi, oj, oj + 1, oi + 1])            # front face of the web
                    F.append([oi + 1, oj + 1, oj + 2, oi + 2])    # the cell's inner wall
            x += dx
        y += dy; row += 1
    return V_, F

def poly_inside(poly):
    """Point-in-polygon test for a 2D polygon."""
    def f(x, y):
        c = False; n = len(poly)
        for i in range(n):
            (x1, y1), (x2, y2) = poly[i], poly[i - 1]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
        return c
    return f

def poly_offset(poly, d):
    """Offset a CCW polygon outward by d (negative shrinks)."""
    out = []; n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    sgn = 1 if area > 0 else -1
    for i in range(n):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        e0 = (p1 - p0).normalized(); e1 = (p2 - p1).normalized()
        n0 = Vector((e0.y, -e0.x)) * sgn; n1 = Vector((e1.y, -e1.x)) * sgn
        m = (n0 + n1); m = m / max(.3, m.length) if m.length > 1e-6 else n0
        k = 1 / max(.3, m.dot(n0)) if m.length > 1e-6 else 1
        q = p1 + m.normalized() * d * k if m.length > 1e-6 else p1 + n0 * d
        out.append((q.x, q.y))
    return out

def text_mesh(s, size=.05, extrude=.001, font='bold', spacing=1.0):
    """Text as a mesh in local xy (centred), extruded along +z; returns verts, faces in local space."""
    cu = bpy.data.curves.new('txt', 'FONT'); cu.body = s; cu.size = size; cu.extrude = extrude / 2
    cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.space_character = spacing; cu.resolution_u = 2
    try:
        fp = {'bold': '/System/Library/Fonts/Supplemental/Arial Bold.ttf', 'wide': '/System/Library/Fonts/Supplemental/Arial Black.ttf'}.get(font)
        if fp and os.path.exists(fp): cu.font = bpy.data.fonts.load(fp, check_existing=True)
    except Exception:
        pass
    ob = bpy.data.objects.new('txt', cu); link(ob)
    dg = bpy.context.evaluated_depsgraph_get(); me = ob.evaluated_get(dg).to_mesh()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces[:])
    V_ = [tuple(v.co) for v in bm.verts]; F = [[v.index for v in f.verts] for f in bm.faces]
    bm.free(); ob.evaluated_get(dg).to_mesh_clear(); bpy.data.objects.remove(ob)
    return [(x, y, z + extrude / 2) for x, y, z in V_], F

def wrap_polar(verts, r0, a0, scale=1.0, height_axis=1):
    """Bend text (x along the arc, y radial) round a circle of radius r0 at angle a0 (local xy plane)."""
    out = []
    for x, y, z in verts:
        r = r0 + y * scale; a = a0 - x * scale / r0
        out.append((r * math.cos(a), r * math.sin(a), z))
    return out

# ------------------------------------------------------------------ airfoils
def foil(c, t=.12, cam=.04, aoa=0.0, n=22):
    """An inverted (downforce) section: leading edge at (0, 0), chord back along -z, camber
    bulging down; aoa > 0 lifts the trailing edge. Closed loop of (z, y)."""
    up, lo = [], []
    for i in range(n + 1):
        x = (1 - math.cos(math.pi * i / n)) / 2
        th = 5 * t * (.2969 * math.sqrt(x) - .126 * x - .3516 * x * x + .2843 * x ** 3 - .1036 * x ** 4)
        yc = -cam * math.sin(math.pi * x) * (1 - .25 * x)
        up.append((-x * c, (yc + th) * c)); lo.append((-x * c, (yc - th) * c))
    pts = up + lo[::-1][1:-1]
    ca, sa = math.cos(aoa), math.sin(aoa)
    return [(z * ca + y * sa, -z * sa + y * ca) for z, y in pts]

def foil_y(c, t, cam, aoa, z, top=True):
    """The section's upper (or lower) surface height at chord position z (0 .. -c, before rotation)."""
    pts = foil(c, t, cam, aoa)
    n = len(pts) // 2 + 1
    side = pts[:n] if top else [pts[0]] + pts[n:][::-1] + [pts[n - 1]]
    best = None
    for (z0, y0), (z1, y1) in zip(side, side[1:]):
        if min(z0, z1) - 1e-6 <= z <= max(z0, z1) + 1e-6 and abs(z1 - z0) > 1e-9:
            best = y0 + (y1 - y0) * (z - z0) / (z1 - z0); break
    return best if best is not None else 0.0

def blade(name, stations, m='carbon', tip=True):
    """A wing lofted through stations (origin, fwd, up, chord, thick, camber, aoa); the
    ends are rounded off by two extra shrinking stations (no flat-cut tips)."""
    rings = []
    def ring(o, fwd, up, c, t, cam, aoa):
        return [o + fwd * z + up * y for z, y in foil(c, t, cam, aoa)]
    st = list(stations)
    if tip:
        def cap(a, b, k):
            o, fwd, up, c, t, cam, aoa = a
            d = (a[0] - b[0]).normalized()
            return (o + d * .006 * k + fwd * (-c * .03 * k), fwd, up, c * (1 - .06 * k), t * (1 - .45 * k), cam, aoa)
        st = [cap(st[0], st[1], 2), cap(st[0], st[1], 1)] + st + [cap(st[-1], st[-2], 1), cap(st[-1], st[-2], 2)]
    for s_ in st: rings.append(ring(*s_))
    Vv, F = loft(rings, True, True, True)
    ob = Mesh().add(Vv, F, m).obj(name); fix_normals(ob)
    return ob

def straight_stations(x0, x1, n, z, y, c, t, cam, aoa, dz=lambda u: 0, dy=lambda u: 0):
    out = []
    for i in range(n + 1):
        u = i / n; x = x0 + (x1 - x0) * u
        out.append((Vector((x, y + dy(u), z + dz(u))), Vector((0, 0, 1)), Vector((0, 1, 0)), c, t, cam, aoa))
    return out


def canard(name, surf, s, y, zc, chord, span, rake=.25, sweep_=.04, rise=.03, m='carbon', thick=.1, cam=.03):
    """A dive plane rooted along the bumper's flank: its root chord lies on the skin (found by ray
    casts at both ends), it reaches straight out from it and rakes its leading edge down."""
    zA, zB = zc + chord * .5, zc - chord * .5
    pA, _ = surf.onto(Vector((s * 1.3, y, zA)), Vector((s, 0, 0)), -.003, .6)
    pB, _ = surf.onto(Vector((s * 1.3, y, zB)), Vector((s, 0, 0)), -.003, .6)
    f = Vector((pA.x - pB.x, 0, pA.z - pB.z)); c = f.length; f.normalize()
    n = Vector((f.z, 0, -f.x))
    if n.x * s < 0: n = -n
    up = Vector((0, 1, 0))
    fr = f * math.cos(rake) - up * math.sin(rake); ur = up * math.cos(rake) + f * math.sin(rake)
    st = []
    for i in range(7):
        u = i / 6
        o = pA - n * .004 + n * span * u + up * rise * u - f * sweep_ * u
        st.append((o, fr, ur, c * (1 - .3 * u), thick, cam, 0.0))
    return blade(name, st)
