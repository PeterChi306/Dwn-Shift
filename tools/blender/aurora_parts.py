"""AURORA detail parts (2026-10-02): everything that is not the skin.

Lamps built like real ones (housings, projector modules, light guides, clear
lenses), real honeycomb grilles in front of the coolers, slatted vents and
louvres, a layered splitter with canards, side blades, a wing with endplates
and a Gurney flap, mirrors on the doors, a wiper, badges, a fuel flap, the
tail's light bar, mesh and titanium exhausts, a diffuser with a rain light,
the arch liners and the suspension.

Names matter to world/cars/auroraGlb.js: 'Door_L*' / 'Door_R*' ride on the
doors, 'signal*' become sequential indicators, and the workshop's swappable
parts are 'Wing*', 'Fin*', 'Splitter*', 'Exhaust*', 'Diffuser*', 'Skirt*',
'proj*' (lamp internals, by side).
"""
import bpy, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from aurora_kit import *
from aurora_shape import *

def S_(s): return 'L' if s > 0 else 'R'

# ------------------------------------------------------------------ surface queries
class Surf:
    """Ray casts against the finished (subdivided, thickened) panels, in game space."""
    def __init__(self, objs):
        dg = bpy.context.evaluated_depsgraph_get(); Vs = []; P = []
        for o in objs:
            ev = o.evaluated_get(dg); me = ev.to_mesh(); M = o.matrix_world
            off = len(Vs); Vs += [M @ v.co for v in me.vertices]; P += [[off + i for i in p.vertices] for p in me.polygons]
            ev.to_mesh_clear()
        self.t = BVHTree.FromPolygons(Vs, P)
    def ray(self, o, d, dist=3.0):
        loc, n, i, dd = self.t.ray_cast(G(o), G(d).normalized(), dist)
        if loc is None: return None, None
        return game(loc), game(n).normalized()
    def onto(self, p, n, lift=0.0, reach=.3):
        """Project p along -n onto the skin; the point `lift` proud of it and the skin normal."""
        p, n = Vector(p), Vector(n).normalized()
        h, hn = self.ray(p + n * reach, -n, reach * 2.5)
        self.missed = h is None
        if h is None: return p, n
        if hn.dot(n) < 0: hn = -hn
        return h + hn * lift, hn

class Region:
    """A recess floor recorded by aurora.py's cut(): its plane, outline and scanlines."""
    def __init__(self, quads, uhint=(1, 0, 0)):
        pts = [Vector(p) for q in quads for p in q]
        self.c = sum(pts, Vector()) / len(pts)
        n = Vector()
        for q in quads:
            a, b, c = Vector(q[0]), Vector(q[1]), Vector(q[2])
            n += (b - a).cross(c - a)
        self.n = n.normalized()
        u = Vector(uhint) - self.n * Vector(uhint).dot(self.n); self.u = u.normalized(); self.v = self.n.cross(self.u)
        # Outline: the edges used by one quad only.
        key = lambda p: tuple(round(c, 5) for c in p)
        cnt = {}
        for q in quads:
            for i in range(len(q)):
                a, b = key(q[i]), key(q[(i + 1) % len(q)])
                k = (a, b) if a < b else (b, a)
                cnt[k] = cnt.get(k, 0) + 1
        self.edges = [(self.uv(Vector(a)), self.uv(Vector(b))) for (a, b), c in cnt.items() if c == 1]
        U = [p[0] for e in self.edges for p in e]; W_ = [p[1] for e in self.edges for p in e]
        self.box = (min(U), max(U), min(W_), max(W_))
    def uv(self, p):
        d = Vector(p) - self.c; return (d.dot(self.u), d.dot(self.v))
    def at(self, a, b, h=0.0):
        return self.c + self.u * a + self.v * b + self.n * h
    def inside(self, a, b):
        c = False
        for (x1, y1), (x2, y2) in self.edges:
            if (y1 > b) != (y2 > b) and a < (x2 - x1) * (b - y1) / (y2 - y1) + x1: c = not c
        return c
    def span_u(self, b):
        """The outline's extent across (u) on the scanline v = b."""
        xs = []
        for (x1, y1), (x2, y2) in self.edges:
            if (y1 > b) != (y2 > b): xs.append(x1 + (x2 - x1) * (b - y1) / (y2 - y1))
        return (min(xs), max(xs)) if len(xs) >= 2 else None
    def span_v(self, a):
        ys = []
        for (x1, y1), (x2, y2) in self.edges:
            if (x1 > a) != (x2 > a): ys.append(y1 + (y2 - y1) * (a - x1) / (x2 - x1))
        return (min(ys), max(ys)) if len(ys) >= 2 else None
    def margin(self, a, b):
        """Distance from (a, b) to the outline."""
        best = 1e9
        for (x1, y1), (x2, y2) in self.edges:
            ex, ey = x2 - x1, y2 - y1; L2 = ex * ex + ey * ey
            t = 0 if L2 < 1e-12 else max(0, min(1, ((a - x1) * ex + (b - y1) * ey) / L2))
            dx, dy = a - (x1 + ex * t), b - (y1 + ey * t); best = min(best, math.hypot(dx, dy))
        return best

def plate(c4, t, m):
    """A flat plate through 4 corners (game space), t thick."""
    c4 = [Vector(p) for p in c4]
    n = (c4[1] - c4[0]).cross(c4[3] - c4[0]).normalized() * (t / 2)
    Vv = [p - n for p in c4] + [p + n for p in c4]
    F = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]
    return Mesh().add(Vv, F, m)

def basis(u, v, n, o):
    """Local (x along u, y along v, z along n) at o."""
    M = Matrix.Identity(4)
    for i in range(3): M[i][0], M[i][1], M[i][2], M[i][3] = u[i], v[i], n[i], o[i]
    return M

# ------------------------------------------------------------------ grilles and slats
def honeycomb(name, reg, surf, depth_from_floor, cell=.017, wall=.0024, web=.007, margin=.004, m='mesh'):
    """A real hex mesh across a recess, following its floor `depth_from_floor` above it."""
    me = Mesh()
    a0, a1, b0, b1 = reg.box
    R_ = cell / math.sqrt(3); dy = cell * math.sqrt(3) / 2
    row = 0; b = b0 - cell
    while b <= b1 + cell:
        a = a0 - cell + (cell / 2 if row % 2 else 0)
        while a <= a1 + cell:
            if reg.inside(a, b) and reg.margin(a, b) > margin:
                p, hn = surf.onto(reg.at(a, b, .05), reg.n, depth_from_floor, .2)
                # Only cells over the recess floor (a miss, or a hit on the skin outside, would float).
                if surf.missed or (p - reg.at(a, b, 0)).dot(reg.n) > depth_from_floor + .03: a += cell; continue
                M = basis(reg.u, reg.n.cross(reg.u), reg.n, p)
                Vv, F = hex_cell(R_, wall, web)
                me.add(Vv, F, m, M)
            a += cell
        b += dy; row += 1
    return me.obj(name) if me.v else None

def hex_cell(R_, wall, depth):
    ho = hexagon(R_ + 2e-4, math.pi / 2); hi = hexagon(R_ - wall, math.pi / 2)
    Vv = []; F = []
    for (a, b), (c, d) in zip(ho, hi):
        Vv += [(a, b, 0), (c, d, 0), (c, d, -depth), (a, b, -depth)]
    for i in range(6):
        j = (i + 1) % 6; oi, oj = 4 * i, 4 * j
        F.append([oi, oi + 1, oj + 1, oj])           # face
        F.append([oi + 1, oi + 2, oj + 2, oj + 1])   # cell wall
    return Vv, F

def slats(name, reg, n, chord, thick, pitch, m='carbon', lift=.0, along='v', inset=.003, fin=False):
    """n slats across a vent's opening (running along u, stacked along v), pitched like louvres."""
    me = Mesh()
    a0, a1, b0, b1 = reg.box
    span = (b1 - b0) if along == 'v' else (a1 - a0)
    for k in range(n):
        t = (k + .5) / n
        if along == 'v':
            b = b0 + span * t; r = reg.span_u(b)
            if not r: continue
            lo, hi = r[0] + inset, r[1] - inset
            c = reg.at((lo + hi) / 2, b, lift); length = hi - lo; ax = reg.u
        else:
            a = a0 + span * t; r = reg.span_v(a)
            if not r: continue
            lo, hi = r[0] + inset, r[1] - inset
            c = reg.at(a, (lo + hi) / 2, lift); length = hi - lo; ax = reg.v
        side = reg.n.cross(ax).normalized()
        prof = superellipse(chord / 2, thick / 2, 3, 12)
        # The slat's chord tips by `pitch` from the vent's plane.
        prof = [(x * math.cos(pitch) - y * math.sin(pitch), x * math.sin(pitch) + y * math.cos(pitch)) for x, y in prof]
        rings = []
        for e in (-length / 2, length / 2):
            o = c + ax * e
            rings.append([o + side * x + reg.n * y for x, y in prof])
        Vv, F = loft(rings, True, True, True)
        me.add(Vv, F, m)
    return bevel(me.obj(name), .0012, 1) if me.v else None

def backing(name, reg, h, m='black', grow=.01):
    """A dark plate under an open vent (so the hole reads as a duct, not as the inside of the shell)."""
    a0, a1, b0, b1 = reg.box
    pts = [reg.at(a0 - grow, b0 - grow, h), reg.at(a1 + grow, b0 - grow, h), reg.at(a1 + grow, b1 + grow, h), reg.at(a0 - grow, b1 + grow, h)]
    me = Mesh().add(pts, [[0, 1, 2, 3]], m)
    return me.obj(name, smooth=False)

# ------------------------------------------------------------------ lamps
def headlamps(parts, surf, out):
    # The clear lens: the skin over each lamp, a hair proud, subdivided like it.
    Vv, F, idx = [], [], {}
    for poly in parts['lens']:
        face = []
        for co in poly:
            key = tuple(round(c, 5) for c in co)
            if key not in idx: idx[key] = len(Vv); Vv.append(co)
            face.append(idx[key])
        F.append(face)
    lens = mesh_obj('Lens', Vv, F, 'lamp'); fix_normals(lens)
    sm = lens.modifiers.new('sub', 'SUBSURF'); sm.levels = sm.render_levels = 0 if LOD else 2
    sd = lens.modifiers.new('push', 'DISPLACE'); sd.strength = .002
    out.append(lens)
    if LOD: return
    for s in (1, -1):
        sl = S_(s)
        # Points across the lamp: t = 0 its lower (outer) edge .. 1 the upper (inner).
        def lamp_pt(z, t, lift):
            h = half_section(z); a, b = Vector(h[J_UPPER]), Vector(h[J_CHANNEL - 1])
            q = a.lerp(b, t); x, y = q.x * s, q.y
            d = (b - a); nrm = Vector((d.y * s, -d.x, 0)).normalized()
            nrm = Vector((nrm.x, nrm.y, .35)).normalized()      # the nose leans the lamp forward
            p = Vector((x, y, sweep_z(z, abs(x))))
            return surf.onto(p, nrm, lift, .12)
        # Housing chrome: a satin reflector shelf along the back of the cavity.
        me = Mesh()
        # Two projector modules: rounded-square, a dark lens in a chrome bezel, an LED ring.
        for k, z in enumerate((Z1 - .44, Z1 - .32)):
            p, n = lamp_pt(z, .42, .006)
            fwd = Vector((s * .25, -.05, 1)).normalized()
            M = frame(p - fwd * .004, fwd)
            Vb, Fb = lathe([(.0, -.03), (.026, -.03), (.03, -.012), (.031, .0), (.027, .004), (.022, .002)], 28)
            me.add(Vb, Fb, 'chrome', M)
            Vl, Fl = lathe([(.0, .006), (.012, .0055), (.02, .004), (.0225, .0015)], 28)
            out.append(Mesh().add(Vl, Fl, 'lamp', M).obj(f'Lamp_{sl}_proj{k}'))
            Vr, Fr = lathe([(.0225, .0018), (.026, .0018), (.026, .0), (.0225, .0)], 28)
            out.append(Mesh().add(Vr, Fr, 'head', M).obj(f'Lamp_{sl}_ring{k}'))
            Vc, Fc = lathe([(.0, -.006), (.01, -.006), (.012, -.01)], 18)
            me.add(Vc, Fc, 'head', M)
        # The reflector shelf the projectors sit in.
        shelf = [lamp_pt(Z1 - .52 + .4 * i / 16, .2, .002)[0] for i in range(17)]
        Vs_, Fs_ = sweep(shelf, superellipse(.018, .003, 4, 10), up=(0, 1, 0))
        me.add(Vs_, Fs_, 'satin')
        out.append(me.obj(f'Lamp_{sl}_body'))
        # The DRL: an angular light-guide brow along the top of the lamp that hooks down at its inner end.
        brow = [lamp_pt(Z1 - .56 + .44 * i / 30, .86 - .08 * (i / 30) ** 2, .004)[0] for i in range(31)]
        hook = [lamp_pt(Z1 - .12 - .02 * i / 6, .86 - .12 - .5 * i / 6, .004)[0] for i in range(1, 7)]
        Vd, Fd = sweep(brow + hook, superellipse(.0045, .0028, 4, 10), up=(0, 1, 0))
        out.append(Mesh().add(Vd, Fd, 'head').obj(f'Lamp_{sl}_drl'))
        # The sequential indicator: a guide along the lamp's lower edge.
        sig = [lamp_pt(Z1 - .52 + .38 * i / 14, .07, .003)[0] for i in range(15)]
        Vg, Fg = sweep(sig, superellipse(.004, .0025, 4, 10))
        out.append(Mesh().add(Vg, Fg, 'head').obj(f'signal{sl}front'))

def taillamp(parts, ends, surf, out):
    """The light bar across the tail: an LED guide over 46 vertical segments, under a clear red lens."""
    if LOD or not parts.get('tailLamp'): return
    reg = Region(parts['tailLamp'], (1, 0, 0))
    me = Mesh()
    a0, a1, b0, b1 = reg.box
    for k in range(46):
        a = a0 + .02 + (a1 - a0 - .04) * (k + .5) / 46
        r = reg.span_v(a)
        if not r: continue
        p0, n0 = surf.onto(reg.at(a, r[0] + .002, .03), reg.n, .002, .1)
        p1, _ = surf.onto(reg.at(a, r[1] - .002, .03), reg.n, .002, .1)
        Vv, F = sweep([p0, p1], superellipse(.0035, .0012, 4, 8), up=tuple(reg.u))
        me.add(Vv, F, 'tail')
    out.append(me.obj('TailSegments'))
    # The guide: a bright line along the bar's top edge, ending in turn-down hooks.
    line = []
    for i in range(61):
        a = a0 + .01 + (a1 - a0 - .02) * i / 60
        r = reg.span_v(a)
        if r: line.append(surf.onto(reg.at(a, r[1] - .005, .03), reg.n, .006, .1)[0])
    Vv, F = sweep(line, superellipse(.003, .002, 4, 8))
    out.append(Mesh().add(Vv, F, 'tail').obj('TailGuide'))
    # Indicators: the bar's outer ends, sweeping outward.
    for s in (1, -1):
        seg = [p for p in line if p.x * s > (a1 - .02) * .62]
        if len(seg) > 2:
            Vv, F = sweep([p + reg.n * .002 - Vector((0, .006, 0)) for p in seg], superellipse(.0032, .0022, 4, 8))
            out.append(Mesh().add(Vv, F, 'head').obj(f'signal{S_(s)}rear'))
    # The lens: a flush red cover over the bar.
    lens = Mesh()
    for q in parts['tailLamp']:
        pts = [surf.onto(Vector(p), reg.n, .0, .05)[0] for p in q]
        lens.add([reg.at(*reg.uv(p), .021) + reg.n * 0 for p in pts], [[0, 1, 2, 3][:len(pts)]], 'tailLens')
    o = lens.obj('TailLens'); fix_normals(o); out.append(o)

# ------------------------------------------------------------------ front
def nose(parts, ends, surf, out):
    grid = ends[1][0]
    bottom = [game(p) for p in grid[-1]]
    # Splitter: a carbon plate under the bumper's bottom edge, reaching ahead of it,
    # with a second blade above it at the corners and a blue edge.
    front = [(x * 1.02, z + .085 * (1 - (x / bottom[0][0]) ** 4) + .012) for x, y, z in bottom]
    xe = abs(bottom[0][0]) * 1.02
    sides = [(xe + .035 * math.sin(math.pi / 2 * t), bottom[0][2] - .02 - .3 * t) for t in (.25, .5, .75, 1)]
    plan = [(x, z) for x, z in sides[::-1]] + front + [(-x, z) for x, z in sides]
    back = [(x, Z1 - .62) for x in (-(xe + .035), xe + .035)]
    yb = bottom[0][1]
    me = Mesh()
    poly = round_poly(plan + back, .01, 2)
    Vv, F = prism(poly, .032, yb - .028)
    me.add(Vv, F, 'carbon', Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1))))
    out.append(bevel(me.obj('Splitter'), .004, 2))
    Vv, F = sweep([Vector((x, yb - .012, z + .004)) for x, z in front], superellipse(.0055, .0055, 2, 10))
    out.append(Mesh().add(Vv, F, 'accent').obj('SplitterEdge'))
    if LOD: return
    # Splitter fences and the turning vanes under the nose.
    me = Mesh()
    for x in (-.62, -.32, .32, .62):
        fz = max(z for (xx, z) in front if abs(xx - x) < .2)
        prof = round_poly([(fz - .01, yb + .004), (fz - .35, yb + .004), (fz - .35, yb + .05), (fz - .12, yb + .07)], .01, 2)
        Vv, F = prism([(z, y) for z, y in prof], .008)
        me.add(Vv, F, 'carbon', Matrix(((0, 0, 1, x), (0, 1, 0, 0), (1, 0, 0, 0), (0, 0, 0, 1))))
    out.append(bevel(me.obj('SplitterFences'), .002, 1))
    # Canards: two dive planes on each bumper corner, rooted on its side face, reaching out sideways, leading edge down.
    me = Mesh()
    for s in (1, -1):
        for k, (y, zc, chord, span) in enumerate(((.26, Z1 - .32, .2, .085), (.355, Z1 - .38, .16, .065))):
            roots = []
            for z in (zc + chord / 2, zc - chord / 2):
                p, n = surf.onto(Vector((s * W(z), y, z)), Vector((s, 0, 0)), -.003, .35)
                roots.append(p)
            rf, rb = roots
            out_ = Vector((s, 0, 0))
            tf = rf + out_ * span + Vector((0, -.006, -.03)); tb = rb + out_ * span * .9 + Vector((0, .028, -.01))
            rf = rf + Vector((0, -.012, 0))                    # the front dips: they press the nose down
            me.merge(plate([rf, rb, tb, tf], .006, 'carbon'))
    out.append(bevel(me.obj('SplitterCanards'), .0015, 1))
    # The coolers' honeycomb, the fins in the side intakes.
    for k, quads in enumerate(parts['noseIntake']):
        reg = Region(quads, (1, 0, 0))
        o = honeycomb(f'NoseMesh{k}', reg, surf, .045); o and out.append(o)
        if k:
            me = Mesh()
            for t in (.33, .66):
                a = reg.box[0] + (reg.box[1] - reg.box[0]) * t
                r = reg.span_v(a)
                if not r: continue
                p0, _ = surf.onto(reg.at(a, r[0], .1), reg.n, .002, .15)
                p1, _ = surf.onto(reg.at(a, r[1], .1), reg.n, .002, .15)
                q0, q1 = p0 + reg.n * .1, p1 + reg.n * .1
                me.add([p0, p1, q1, q0], [[0, 1, 2, 3]], 'carbon')
            if me.v:
                o = me.obj(f'NoseFins{k}', smooth=False)
                sol = o.modifiers.new('t', 'SOLIDIFY'); sol.thickness = .006; sol.offset = 0
                out.append(o)
    # Fangs: carbon blades standing off the bumper between the intakes, from the lamps to the splitter.
    me = Mesh(); nu = len(grid[0]) - 1
    for col in (4, nu - 4):
        path = []
        for k in range(len(grid)):
            p = game(grid[k][col]); q = game(grid[k][col + 1]); c = (p + q) / 2
            if k == 0: continue
            nrm = Vector((c.x * .6, 0, 1)).normalized()
            path.append(surf.onto(c, nrm, .012, .2))
        pts = [p for p, n in path]
        if len(pts) > 2:
            Vv, F = sweep(resample(pts, 16), lambda i: superellipse(.011 - .004 * i / 16, .02, 4, 12), up=(0, 0, 1))
            me.add(Vv, F, 'carbon')
    out.append(bevel(me.obj('NoseFangs'), .002, 1))
    # Hood nostrils and fender louvres: slats over a dark duct.
    for s in (1, -1):
        for key, nm, n_, pitch in (('hoodVent', 'HoodVent', 6, -.6), ('fenderVent', 'FenderVent', 7, -.5)):
            q = parts[key][s]
            if not q: continue
            reg = Region(q, (1, 0, 0))
            o = slats(f'{nm}{S_(s)}', reg, n_, .03, .0035, pitch, 'carbon', lift=.008); o and out.append(o)
            out.append(backing(f'{nm}{S_(s)}duct', reg, -.03))
    # The nose badge: the Aurora's peak, a chrome chevron on the nose tip.
    p, n = surf.onto(Vector((0, HOOD(Z1 - .06) + .005, Z1 + .02)), Vector((0, .45, 1)), .002, .2)
    chev = [(-.042, -.012), (0, .03), (.042, -.012), (.03, -.012), (0, .016), (-.03, -.012)]
    Vv, F = prism(chev, .004, 0)
    out.append(bevel(Mesh().add(Vv, F, 'chrome', frame(p, n, (0, 1, 0))).obj('BadgeNose'), .0008, 1))

# ------------------------------------------------------------------ sides
def sides(parts, surf, out, panels):
    for s in (1, -1):
        sl = S_(s)
        # The side intake: a carbon blade across its mouth, a honeycomb in front of the cooler.
        q = parts['sideIntake'][s]
        if q and not LOD:
            reg = Region(q, (0, 0, 1))
            o = honeycomb(f'Door_{sl}_intakeMesh', reg, surf, .055, cell=.024); o and out.append(o)
            b = (reg.box[2] + reg.box[3]) / 2 + .01; r = reg.span_u(b)
            if r:
                p0, _ = surf.onto(reg.at(r[0] - .02, b, .1), reg.n, .0, .2); p1, _ = surf.onto(reg.at(r[1] + .02, b, .1), reg.n, .0, .2)
                pts = [p0.lerp(p1, t) + reg.n * (.012 - .05 * (t - .5) ** 2) for t in (i / 12 for i in range(13))]
                Vv, F = sweep(pts, superellipse(.022, .0035, 3, 12), up=tuple(reg.n))
                out.append(bevel(Mesh().add(Vv, F, 'carbon').obj(f'Door_{sl}_intakeBlade'), .001, 1))
        # Door handle: a flush blade that sits in its pocket.
        q = parts['handle'][s]
        if q and not LOD:
            reg = Region(q, (0, 0, 1))
            Vv, F = rbox(reg.box[1] - reg.box[0] - .014, reg.box[3] - reg.box[2] - .008, .006, .0025, 2)
            M = basis(reg.u, reg.v, reg.n, reg.at((reg.box[0] + reg.box[1]) / 2, (reg.box[2] + reg.box[3]) / 2, .009))
            out.append(Mesh().add(Vv, F, 'satin', M).obj(f'Door_{sl}_handle'))
        # Side skirts: a carbon blade off the rocker with a kicked-up winglet at the rear.
        sk = round_poly([(s * .8, .13), (s * .955, .128), (s * .975, .14), (s * .96, .152), (s * .86, .21), (s * .8, .21)], .006, 2)
        Vv, F = prism([(x, y) for x, y in sk], ZF - R - .03 - (ZR + R + .03), ZR + R + .03)
        o = Mesh().add(Vv, F, 'carbon').obj(f'Skirt{s}'); bevel(o, .003, 2); out.append(o)
        if not LOD:
            me = Mesh()
            for zz, hh in ((ZR + R + .1, .07), (ZR + R + .2, .05)):
                prof = round_poly([(zz, .14), (zz + .1, .14), (zz + .01, .14 + hh)], .006, 2)
                Vv, F = prism([(z, y) for z, y in prof], .008)
                me.add(Vv, F, 'carbon', Matrix(((0, 0, 1, s * .965), (0, 1, 0, 0), (1, 0, 0, 0), (0, 0, 0, 1))))
            out.append(bevel(me.obj(f'Skirt{s}fins'), .0015, 1))
        # Mirrors (on the doors): a sculpted pod on a carbon aero stalk, a repeater along its leading edge.
        mz = .56; h = half_section(mz); bx, by = h[J_CREST][0] * s, h[J_CREST][1]
        base, bn = surf.onto(Vector((bx, by + .03, mz)), Vector((s * .4, 1, 0)), 0, .2)
        pod = base + Vector((s * .17, .11, -.03))
        rings = []
        for i in range(17):
            t = i / 16; zz = .06 - .2 * t
            r = math.sin(math.pi * min(1, t * 1.1) ** .6) * (1 - .25 * t)
            rings.append([pod + Vector((x * .062 * r + s * .006 * t, y * .038 * r, zz)) for x, y in superellipse(1, 1, 2.6, 24)])
        Vv, F = loft(rings, True, True, True)
        out.append(Mesh().add(Vv, F, 'paint').obj(f'Door_{sl}_mirror'))
        gl = [pod + Vector((x, y, -.103)) for x, y in superellipse(.05, .027, 3, 20)]
        out.append(Mesh().add(gl + [pod + Vector((0, 0, -.103))], [[i, (i + 1) % 20, 20] for i in range(20)], 'mirror').obj(f'Door_{sl}_mirrorGlass', smooth=False))
        stalk = [base + Vector((-s * .01, -.01, .02)), base + Vector((s * .07, .05, 0)), pod + Vector((-s * .035, -.012, .0))]
        Vv, F = sweep(resample(stalk, 10), superellipse(.012, .006, 2.4, 12), up=(0, 1, 0))
        out.append(Mesh().add(Vv, F, 'carbon').obj(f'Door_{sl}_mirrorStalk'))
        rep = [pod + Vector((s * (.03 + .03 * t), .028 - .02 * t, .045 - .02 * t)) for t in (i / 8 for i in range(9))]
        Vv, F = sweep(rep, superellipse(.003, .002, 3, 8))
        out.append(Mesh().add(Vv, F, 'head').obj(f'Door_{sl}_signalmirror'))
    # Fuel flap: a brushed disc in a ring on the left haunch.
    if not LOD:
        p, n = surf.onto(Vector((.86, BELT(-1.7) + .02, -1.7)), Vector((.6, 1, 0)), .0015, .2)
        Vv, F = lathe([(0, .0), (.034, .0), (.036, -.002)], 32)
        out.append(Mesh().add(Vv, F, 'alu', frame(p, n, (0, 0, 1))).obj('FuelFlap'))
        Vv, F = lathe([(.036, -.002), (.04, -.001), (.041, -.003)], 32)
        out.append(Mesh().add(Vv, F, 'black', frame(p, n, (0, 0, 1))).obj('FuelRing'))

# ------------------------------------------------------------------ top
def top(parts, surf, out):
    if LOD: return
    # The roof scoop that feeds the engine: a carbon snorkel over the rear of the roof.
    rings = []
    for i in range(15):
        t = i / 14; z = -.25 - .85 * t
        y = ROOF(max(z, GZ0)) if z > GZ0 else HOOD(z)
        h = .055 * math.sin(math.pi * min(1, t * 1.25) ** .7) * (1 - .55 * t) + .006
        w = .1 - .03 * t
        rings.append([Vector((x * w, y - .004 + max(0, yy) * h + min(0, yy) * .01, z)) for x, yy in superellipse(1, 1, 3, 20)])
    Vv, F = loft(rings, True, True, True)
    out.append(Mesh().add(Vv, F, 'carbon').obj('RoofScoop'))
    mouth = [Vector((x * .085, ROOF(-.25) + .006 + (yy + 1) * .022, -.248)) for x, yy in superellipse(1, 1, 3, 20)]
    out.append(Mesh().add(mouth + [Vector((0, ROOF(-.25) + .028, -.3))], [[i, (i + 1) % 20, 20] for i in range(20)], 'black').obj('RoofScoopMouth', smooth=False))
    # Engine cover louvres: slats over the bay (the engine shows between them).
    if parts.get('louvres'):
        reg = Region(parts['louvres'], (1, 0, 0))
        o = slats('EngineLouvres', reg, 9, .032, .004, -.75, 'carbon', lift=.01); o and out.append(o)
    for s in (1, -1):
        for key, nm, n_ in (('haunchVent', 'HaunchVent', 6), ('archExit', 'ArchExit', 5)):
            q = parts[key][s]
            if not q: continue
            reg = Region(q, (1, 0, 0) if key == 'haunchVent' else (0, 1, 0))
            o = slats(f'{nm}{S_(s)}', reg, n_, .028, .0035, -.55, 'carbon', lift=.008); o and out.append(o)
            if key == 'haunchVent': out.append(backing(f'{nm}{S_(s)}duct', reg, -.035))
    # Wiper: parked along the windshield's base, driver's side pivot.
    pts = [Vector((.42 - .78 * t, ROOF(GZ1 - .02) + .012 + .03 * t, GZ1 - .03 - .04 * t * (1 - t))) for t in (i / 10 for i in range(11))]
    pts = [surf.onto(p, Vector((0, 1, .5)), .008, .1)[0] for p in pts]
    Vv, F = sweep(pts, superellipse(.007, .005, 3, 10), up=(0, 1, .5))
    out.append(Mesh().add(Vv, F, 'black').obj('WiperBlade'))
    Vv, F = sweep(pts[:8], superellipse(.0045, .0035, 3, 8), up=(0, 1, .5))
    M = Matrix.Translation((0, .009, .006))
    out.append(Mesh().add(Vv, F, 'gloss', M).obj('WiperArm'))

def wing(out):
    """Main plane and flap on swan necks, endplates with strakes, a Gurney flap and a brake light."""
    def foil(c, t, a, dz, dy, n=24):
        up, lo = [], []
        for i in range(n + 1):
            x = (1 - math.cos(math.pi * i / n)) / 2
            th = 5 * t * (.2969 * math.sqrt(x) - .126 * x - .3516 * x * x + .2843 * x ** 3 - .1036 * x ** 4)
            cam = .07 * c * math.sin(math.pi * x)
            up.append((-x * c, th * c + cam)); lo.append((-x * c, -th * c + cam))
        pts = up + lo[::-1][1:-1]
        return [(z * math.cos(a) - y * math.sin(a) + dz, z * math.sin(a) + y * math.cos(a) + dy) for z, y in pts]
    wz, wy, span = Z0 + .15, .99, 1.72
    xz = Matrix(((0, 0, 1, 0), (0, 1, 0, 0), (1, 0, 0, 0), (0, 0, 0, 1)))       # local (z, y, x) -> game (x, y, z)
    for nm, pts in (('Wing', foil(.38, .12, -.14, wz, wy)), ('WingFlap', foil(.14, .1, -.6, wz - .35, wy + .075))):
        # Swept and tipped up at the ends (in plan, the tips sit 3 cm further back and 1.5 cm higher).
        rings = []
        for e in range(-12, 13):
            x = span / 2 * e / 12; k = (abs(e) / 12) ** 3
            rings.append([Vector((x, y + .015 * k, z - .03 * k)) for z, y in pts])
        Vv, F = loft(rings, True, True, True)
        out.append(bevel(Mesh().add(Vv, F, 'carbon').obj(nm), .002, 1))
    # Gurney flap along the flap's trailing edge, a brake light in the middle of it.
    te = foil(.14, .1, -.6, wz - .35, wy + .075)[24]
    Vv, F = box(span * .98, .018, .003)
    out.append(Mesh().add(Vv, F, 'carbon', Matrix.Translation((0, te[1] + .009, te[0] - .028))).obj('WingGurney'))
    if not LOD:
        Vv, F = rbox(.42, .008, .006, .002, 2)
        out.append(Mesh().add(Vv, F, 'tail', Matrix.Translation((0, te[1] + .012, te[0] - .032))).obj('WingBrake'))
    for s in (1, -1):
        ep = round_poly([(wz + .04, wy - .045), (wz + .01, wy + .06), (wz - .46, wy + .13), (wz - .5, wy + .035), (wz - .25, wy - .06)], .025, 4)
        Vv, F = prism([(y, z) for z, y in ep], .012, 0)
        M = Matrix(((0, 0, s, s * (span / 2)), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
        M = Matrix(((0, 0, s, s * span / 2), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
        out.append(bevel(Mesh().add(Vv, F, 'carbon', M).obj(f'WingEndplate{s}'), .003, 2))
        # Strakes on the endplate's outer face.
        me = Mesh()
        for k in range(3):
            y0 = wy - .02 + k * .035
            Vv, F = box(.006, .004, .2)
            me.add(Vv, F, 'carbon', Matrix.Translation((s * (span / 2 + .015), y0 + .03, wz - .2 - k * .02)) @ Matrix.Rotation(-.18, 4, 'X'))
        out.append(me.obj(f'WingStrakes{s}'))
        dz = -1.72; dy = HOOD(dz) - .02
        neck = round_poly([(dz, dy), (dz - .26, dy), (wz - .16, wy + .055), (wz - .04, wy + .07), (wz + .02, wy + .03), (wz - .1, wy + .01)], .03, 4)
        Vv, F = prism([(y, z) for z, y in neck], .022, -.011)
        M = Matrix(((0, 0, 1, s * .34), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
        out.append(bevel(Mesh().add(Vv, F, 'carbon', M).obj(f'WingNeck{s}'), .003, 2))
        if not LOD:
            me = Mesh()
            for dzb in (-.03, -.1):
                Vb, Fb = cyl(.0075, .006, 6)
                me.add(Vb, Fb, 'satin', Matrix.Translation((s * (.34 + .012), wy + .055, wz + dzb)) @ Matrix.Rotation(math.pi / 2 * s, 4, 'Y'))
            out.append(me.obj(f'WingBolts{s}'))

# ------------------------------------------------------------------ tail
def tail(parts, ends, surf, out):
    grid = ends[2][0]
    tb = [game(p) for p in grid[-1]]; ty = tb[0][1]; tzc = tb[len(tb) // 2][2]
    def face_z(x, y):
        h, n = surf.ray(Vector((x, y, Z0 - .5)), Vector((0, 0, 1)), 1.5)
        return h.z if h is not None else Z0
    # The honeycomb across the tail, the exhausts through it.
    if parts.get('tailMesh') and not LOD:
        reg = Region(parts['tailMesh'], (1, 0, 0))
        me = Mesh()
        a0, a1, b0, b1 = reg.box
        R_ = .024 / math.sqrt(3); dy = .024 * math.sqrt(3) / 2; row = 0; b = b0
        while b <= b1:
            a = a0 + (.012 if row % 2 else 0)
            while a <= a1:
                p = reg.at(a, b, 0)
                clear = all(math.hypot(p.x - ex, p.y - .47) > .085 for ex in (-.12, .12)) and all(not (abs(p.x - rx) < .07 and abs(p.y - .5) < .03) for rx in (-.3, .3))
                if reg.inside(a, b) and reg.margin(a, b) > .004 and clear:
                    q, hn = surf.onto(reg.at(a, b, .05), reg.n, .04, .2)
                    if surf.missed: a += .024; continue
                    Vv, F = hex_cell(R_, .0024, .007)
                    me.add(Vv, F, 'mesh', basis(reg.u, reg.n.cross(reg.u), reg.n, q))
                a += .024
            b += dy; row += 1
        out.append(me.obj('TailMesh'))
    # Reversing lamps either side, a rain light between the exhausts.
    for s in (1, -1):
        zr_ = face_z(s * .3, .5) - .095
        Vv, F = rbox(.1, .026, .03, .006, 2)
        out.append(Mesh().add(Vv, F, 'reverse', Matrix.Translation((s * .3, .5, zr_ + .02))).obj(f'Reverse{s}'))
    if not LOD:
        Vv, F = rbox(.05, .07, .02, .006, 2)
        out.append(Mesh().add(Vv, F, 'tail', Matrix.Translation((0, .33, face_z(0, .33) + .02))).obj('RainLight'))
    # Titanium exhausts: a carbon heat-shield ring, a double-wall tip with a rolled lip, a perforated baffle.
    for s in (1, -1):
        ex, ey = s * .12, .47
        ez = face_z(ex, ey) - .08 + .03          # the recess floor is 8 cm in (+z): the lip (t = -.04) stands 1 cm proud of its mouth
        M = Matrix.Translation((ex, ey, ez))
        # Local +z runs into the car: the rolled lip is the outer end (t < 0), the pipe goes in.
        prof = [(.054, .14), (.055, .05), (.057, .0), (.06, -.022), (.064, -.034), (.066, -.04), (.064, -.044), (.058, -.042), (.055, -.036), (.053, -.02)]
        Vv, F = lathe(prof, 48)
        out.append(Mesh().add(Vv, F, 'ti', M).obj(f'Exhaust{s}'))
        if not LOD:
            Vv, F = lathe([(.068, .03), (.074, .0), (.076, -.012), (.073, -.016), (.068, -.012)], 48)
            out.append(Mesh().add(Vv, F, 'carbon', M).obj(f'ExhaustShield{s}'))
            Vv, F = lathe([(.0, .03), (.02, .028), (.05, .022), (.053, .021)], 36)
            out.append(Mesh().add(Vv, F, 'honey', M).obj(f'ExhaustBaffle{s}'))
            Vv, F = lathe([(.051, .4), (.051, .1)], 24)
            out.append(Mesh().add(Vv, F, 'heat', M).obj(f'ExhaustPipe{s}'))
    # Diffuser: a carbon ramp from the floor to the tail, seven fences, a tow-hook cover.
    V4 = [Vector((.84, .155, tzc + .78)), Vector((-.84, .155, tzc + .78)), Vector((-.84, ty + .01, tzc + .02)), Vector((.84, ty + .01, tzc + .02))]
    o = Mesh().add(V4, [[0, 1, 2, 3]], 'carbon').obj('Diffuser', smooth=False)
    sol = o.modifiers.new('t', 'SOLIDIFY'); sol.thickness = .008; out.append(o)
    me = Mesh()
    for k in range(-3, 4):
        hk = .23 - abs(k) * .03
        prof = round_poly([(tzc + .7, .15), (tzc + .02, .15 + (ty - .15) * .0), (tzc + .02, ty + hk * .0 + .02), (tzc + .3, .15 + hk * .5)], [0, .004, .01, .03], 3)
        prof = round_poly([(tzc + .7, .152), (tzc + .03, ty + .005), (tzc + .03, ty + .005 + .02 + hk * .25), (tzc + .5, .2)], [0, .004, .01, .04], 3)
        Vv, F = prism([(y, z) for z, y in prof], .01)
        me.add(Vv, F, 'carbon', Matrix(((0, 0, 1, k * .22), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1))))
    out.append(bevel(me.obj('DiffuserStrakes'), .002, 1))

# ------------------------------------------------------------------ underneath
def under(out):
    # Arch liners (matte carbon) and the flat floor.
    for zc in (ZF, ZR):
        for s in (1, -1):
            Vv, F = [], []; A = 24
            x0, x1 = .76 * s, W(zc) * .97 * s
            for i in range(A + 1):
                a = math.radians(-12 + 204 * i / A)
                for x in (x0, x1):
                    Vv.append(Vector((x, WR + math.sin(a) * (R - .012), zc + math.cos(a) * (R - .012))))
            for i in range(A): F.append([2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2])
            # The inner wall of the well.
            o = len(Vv)
            for i in range(A + 1):
                a = math.radians(-12 + 204 * i / A)
                Vv.append(Vector((x0, WR + math.sin(a) * (R - .012), zc + math.cos(a) * (R - .012))))
                Vv.append(Vector((x0, WR + .02, zc + math.cos(a) * (R - .012) * .2)))
            for i in range(A): F.append([o + 2 * i, o + 2 * i + 2, o + 2 * i + 3, o + 2 * i + 1])
            out.append(Mesh().add(Vv, F, 'carbonM').obj(f'Liner{zc}{s}'))
    fl = [Vector((.86, .16, Z0 + .3)), Vector((-.86, .16, Z0 + .3)), Vector((-.86, .16, Z1 - .35)), Vector((.86, .16, Z1 - .35))]
    out.append(Mesh().add(fl, [[0, 1, 2, 3]], 'carbonM').obj('Floor', smooth=False))

def suspension(out):
    """Double wishbones, uprights and coil-overs behind each wheel (they hold still; the wheels turn round them)."""
    me = Mesh()
    def rod(a, b, r, m='steel', seg=10):
        Vv, F = sweep([Vector(a), Vector(b)], [(math.cos(TAU * i / seg) * r, math.sin(TAU * i / seg) * r) for i in range(seg)])
        me.add(Vv, F, m)
    for zc in (ZF, ZR):
        for s in (1, -1):
            hub = Vector((s * .7, WR, zc))
            # Upright: a cast alloy carrier behind the hub.
            Vv, F = rbox(.05, .26, .09, .015, 2)
            me.add(Vv, F, 'alu', Matrix.Translation(hub))
            for y0, dy_ in ((WR - .12, -.02), (WR + .12, .02)):
                for dz in (-.13, .13):
                    rod((s * .69, y0, zc), (s * .3, y0 + dy_, zc + dz), .011)
            # Coil-over: a damper body, a spring wound round it, blue adjuster rings.
            # Front: an upright coil-over to the chassis; rear: laid back into the engine bay, under the cover.
            top_ = Vector((s * .48, WR + .4, zc - .05)) if zc > 0 else Vector((s * .4, WR + .2, zc - .16)); bot = Vector((s * .64, WR - .08, zc))
            rod(bot, top_, .02, 'alu', 16)
            ax = (top_ - bot); L_ = ax.length; ax.normalize()
            side = ax.cross(Vector((0, 0, 1))).normalized(); up2 = side.cross(ax)
            coil = []
            for i in range(121):
                t = i / 120; a = TAU * 7 * t
                coil.append(bot + ax * (L_ * (.12 + .74 * t)) + side * math.cos(a) * .042 + up2 * math.sin(a) * .042)
            Vv, F = sweep(coil, [(math.cos(TAU * i / 8) * .0075, math.sin(TAU * i / 8) * .0075) for i in range(8)])
            me.add(Vv, F, 'blue')
            Vv, F = lathe([(.03, 0), (.032, .012), (.03, .024)], 20)
            me.add(Vv, F, 'blue', frame(bot + ax * L_ * .1, ax))
    out.append(me.obj('Suspension'))

def build(parts, ends, panels):
    out = []
    surf = Surf(list(panels.values()))
    headlamps(parts, surf, out)
    nose(parts, ends, surf, out)
    sides(parts, surf, out, panels)
    top(parts, surf, out)
    wing(out)
    tail(parts, ends, surf, out)
    taillamp(parts, ends, surf, out)
    under(out)
    if not LOD: suspension(out)
    return [o for o in out if o]
