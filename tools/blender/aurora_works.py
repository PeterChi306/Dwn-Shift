"""DWN Works kit for the AURORA (2026-10-03): every workshop part as a real
model, fitted to the finished body by ray casts, so the swaps look as finished
as the car they bolt onto.

  wing     ducktail · Absolut longtail + twin fins · Attack boomerang · GT3 two-element
           wing on swan necks · drift wing on tall pylons
  front    GT3 splitter (longer blade, end plates, two tiers of dive planes) · street lip
  kit      GT widebody flares + skirt extensions · riveted overfenders
  exhaust  quad tips in a carbon bezel · single centre · side exits · straight pipes
  roof     snorkel · shark fin · LED pod bar;   hood  fender louvre banks · hood scoop
  lights   one-eye: the left lamp re-made as a honeycomb intake with the laser emitter

Every object is named Works_<slot>_<option>_<what>: world/cars/auroraGlb.js tags
it 'w:<slot>:<option>' and carParts.js shows it when the build picks that option.
The stock pieces the options replace stay in aurora.glb (tagged wing, splitter,
exhaust...) and are hidden by the build.

Run:  Blender -b --factory-startup --python tools/blender/aurora.py -- --works [--render out.png --views ...]
      (writes assets/cars/aurora-works.glb)
"""
import bpy, math
from mathutils import Vector, Matrix
from aurora_kit import *
from aurora_shape import *
from aurora_parts import Surf, Region, hex_cell, basis

def NM(slot, opt, what): return f'Works_{slot}_{opt}_{what}'
XZ = Matrix(((0, 0, 1, 0), (0, 1, 0, 0), (1, 0, 0, 0), (0, 0, 0, 1)))     # local (x, y, z) -> game (z, y, x): a profile drawn in z/y, extruded along x

class Fit:
    """Where the body is: ray casts against the finished panels."""
    def __init__(self, surf): self.s = surf
    def deck(self, x, z, dflt=.95):
        h, n = self.s.ray(Vector((x, 3, z)), Vector((0, -1, 0)), 4)
        return h.y if h is not None else dflt
    def side(self, y, z, s, dflt=None):
        h, n = self.s.ray(Vector((s * 2, y, z)), Vector((-s, 0, 0)), 2.5)
        return abs(h.x) if h is not None else dflt
    def tail(self, x, y, dflt=Z0):
        h, n = self.s.ray(Vector((x, y, Z0 - .6)), Vector((0, 0, 1)), 1.6)
        return h.z if h is not None else dflt
    def nose(self, x, y, dflt=Z1):
        h, n = self.s.ray(Vector((x, y, Z1 + .6)), Vector((0, 0, -1)), 1.6)
        return h.z if h is not None else dflt

_CROWN = {'d': -.004}
def crown(x, z):
    """The body's upper surface at (x, z) from the analytic section (aurora_shape), so parts can
    follow the deck smoothly across vents and louvres; offset to the subdivided skin."""
    ax = abs(x); zs = z
    for _ in range(5): zs = z - (sweep_z(zs, ax) - zs)
    pts = half_section(zs)[J_SHOULDER:]
    y = pts[0][1]
    if ax < pts[0][0]:
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if x1 <= ax <= x0: y = y0 + (y1 - y0) * (ax - x0) / (x1 - x0 + 1e-12); break
    return y + _CROWN['d']

def fin_radii(n_foot, foot, corner, top):
    """Corner radii for a fin outline made of n_foot foot points then as many top points (reversed)."""
    return [corner] + [foot] * (n_foot - 2) + [corner] + [corner] + [top] * (n_foot - 2) + [corner]

def finish(ob, bev=None, seg=2, angle=40):
    fix_normals(ob)
    if bev: bevel(ob, bev, seg, angle)
    return ob

def outline_plate(name, pts, x, t, m='carbon', r=.02, seg=4, bev=.0025):
    """A plate whose outline is drawn in the side view (game z, y), `t` thick, centred on x."""
    poly = round_poly(pts, r, seg) if r else pts
    Vv, F = prism(poly, t)
    return finish(Mesh().add(Vv, F, m, Matrix.Translation((x, 0, 0)) @ XZ).obj(name), bev, 2)

def gurney(name, c, t, cam, aoa, le, x0, x1, h=.022, m='carbon'):
    """A Gurney flap standing up off a section's trailing edge."""
    te = foil(c, t, cam, aoa)[22]
    o = Vector((0, le[1] + te[1], le[0] + te[0]))
    Vv, F = rbox(x1 - x0, h, .003, .0012, 1)
    M = Matrix.Translation(o + Vector(((x0 + x1) / 2, h / 2 - .002, .0015))) @ Rot('X', -aoa * .4)
    return Mesh().add(Vv, F, m, M).obj(name), o

def swan_neck(name, x, zfoot, wing_le, c, t, cam, aoa, fit, grip=.55, w0=.085, w1=.042, thick=.018, rise=.13, m='carbon'):
    """A swan-neck mount: a band that leaves the deck in front of the wing, arches back over
    it and comes down onto the main plane's upper surface (the wing hangs from it)."""
    lz, ly = wing_le
    gz = lz - c * grip
    top = lambda z: ly + foil_y(c, t, cam, aoa, z - lz, True)
    yf = fit.deck(x, zfoot) - .012
    hy = top(gz)
    C = bezier((zfoot, yf), (zfoot - .015, yf + .55 * (hy + rise - yf)), (gz + .2, hy + rise), (gz + .055, hy + rise * .62), 18)
    C += bezier((gz + .055, hy + rise * .62), (gz + .01, hy + rise * .4), (gz - .005, hy + .03), (gz - .008, hy - .006), 8)[1:]
    C = [Vector((p[0], p[1])) for p in C]
    L, Rr = [], []
    n = len(C)
    for i, p in enumerate(C):
        d = (C[min(n - 1, i + 1)] - C[max(0, i - 1)]).normalized(); nr = Vector((-d.y, d.x))
        u = i / (n - 1); w = lerp(w0, w1, smooth(0, .55, u)) / 2
        L.append(p + nr * w); Rr.append(p - nr * w)
    pts = [(q.x, q.y) for q in L] + [(q.x, q.y) for q in Rr[::-1]]
    clean = [pts[0]]
    for p in pts[1:]:
        if math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > .003: clean.append(p)
    ob = outline_plate(name, clean, x, thick, m, r=.004, seg=2, bev=.003)
    return ob

def deck_plate(name, x, z0, z1, w, fit, m='carbon', t=.008):
    """A base plate following the deck under a mount, with two bolts."""
    me = Mesh(); n = 8
    rings = []
    for i in range(n + 1):
        z = z0 + (z1 - z0) * i / n; y = fit.deck(x, z)
        rings.append([Vector((x + u * w / 2, y + v, z)) for u, v in ((-1, -.002), (1, -.002), (1, t), (-1, t))])
    Vv, F = loft(rings, True, True, True)
    me.add(Vv, F, m)
    for z in (z0 + .025, z1 - .025):
        Vb, Fb = cyl(.006, .004, 12)
        me.add(Vb, Fb, 'satin', Matrix.Translation((x, fit.deck(x, z) + t, z)) @ Rot('X', -math.pi / 2))
    return finish(me.obj(name), .0015, 1)

# ------------------------------------------------------------------ wings
def wing_gt3(fit, out):
    S, O = 'wing', 'gt3'
    hs = .93
    m_ = dict(c=.35, t=.13, cam=.05, aoa=.1); le = (-1.95, 1.255)
    f_ = dict(c=.18, t=.11, cam=.06, aoa=.62); fle = (le[0] - m_['c'] * .82, le[1] + .062)
    out.append(blade(NM(S, O, 'main'), straight_stations(-hs, hs, 24, le[0], le[1], m_['c'], m_['t'], m_['cam'], m_['aoa']), tip=False))
    out.append(blade(NM(S, O, 'flap'), straight_stations(-hs, hs, 24, fle[0], fle[1], f_['c'], f_['t'], f_['cam'], f_['aoa']), tip=False))
    g, te = gurney(NM(S, O, 'gurney'), f_['c'], f_['t'], f_['cam'], f_['aoa'], fle, -hs, hs, .024); out.append(finish(g))
    Vv, F = rbox(.7, .007, .006, .002, 2)
    out.append(Mesh().add(Vv, F, 'tail', Matrix.Translation(te + Vector((0, .02, .0045)))).obj(NM(S, O, 'led')))
    # End plates: tall, rounded, raked, with two strakes and a cut-out over the flap.
    for s in (1, -1):
        ep = [(-1.885, 1.2), (-1.915, 1.345), (-2.06, 1.415), (-2.3, 1.47), (-2.47, 1.475), (-2.49, 1.2), (-2.33, 1.095), (-2.02, 1.11)]
        out.append(outline_plate(NM(S, O, f'endplate{s}'), ep, s * (hs + .007), .012, r=.04))
        me = Mesh()
        for k, y in enumerate((1.16, 1.2)):
            Vb, Fb = rbox(.006, .007, .22, .002, 1)
            me.add(Vb, Fb, 'carbon', Matrix.Translation((s * (hs + .016), y, -2.26 + k * .03)) @ Rot('X', .07))
        out.append(finish(me.obj(NM(S, O, f'strakes{s}'))))
    for s in (1, -1):
        out.append(swan_neck(NM(S, O, f'neck{s}'), s * .34, -1.64, le, m_['c'], m_['t'], m_['cam'], m_['aoa'], fit))
        out.append(deck_plate(NM(S, O, f'base{s}'), s * .34, -1.57, -1.72, .055, fit))

def wing_attack(fit, out):
    """A boomerang: one plane whose ends curl up into its own end plates and sweep back."""
    S, O = 'wing', 'attack'
    le_z, y0 = -1.97, 1.235
    st = []; N = 34
    for i in range(N + 1):
        e = -1 + 2 * i / N; u = abs(e); s = 1 if e >= 0 else -1
        straight, r = .6, .2
        L = straight + r * math.pi / 2 * .9           # half-span arc length
        a = u * L
        if a <= straight: x, y, phi = a, 0.0, 0.0
        else:
            phi = (a - straight) / r; x = straight + r * math.sin(phi); y = r * (1 - math.cos(phi))
        up = Vector((-s * math.sin(phi), math.cos(phi), 0))
        sweep_back = .2 * smooth(.45, 1, u) ** 1.4
        c = .36 - .13 * smooth(.5, 1, u)
        st.append((Vector((s * x, y0 + y, le_z - sweep_back)), Vector((0, 0, 1)), up, c, .12, .045 * (1 - smooth(.55, .95, u)), .12 - .1 * smooth(.6, 1, u)))
    out.append(blade(NM(S, O, 'main'), st))
    # A slim flap across the straight part only.
    fle = (le_z - .3, y0 + .05)
    out.append(blade(NM(S, O, 'flap'), straight_stations(-.56, .56, 14, fle[0], fle[1], .13, .11, .05, .58)))
    g, te = gurney(NM(S, O, 'gurney'), .13, .11, .05, .58, fle, -.52, .52, .02); out.append(finish(g))
    Vv, F = rbox(.56, .007, .006, .002, 2)
    out.append(Mesh().add(Vv, F, 'tail', Matrix.Translation(te + Vector((0, .018, .0045)))).obj(NM(S, O, 'led')))
    for s in (1, -1):
        out.append(swan_neck(NM(S, O, f'neck{s}'), s * .3, -1.66, (le_z, y0), .36, .12, .045, .12, fit, rise=.11))
        out.append(deck_plate(NM(S, O, f'base{s}'), s * .3, -1.59, -1.74, .055, fit))

def wing_drift(fit, out):
    """Two elements high up on tall pylons, big kidney end plates."""
    S, O = 'wing', 'drift'
    hs = .9; le = (-2.0, 1.46)
    m_ = dict(c=.3, t=.13, cam=.055, aoa=.12); fle = (le[0] - .25, le[1] + .06); f_ = dict(c=.19, t=.11, cam=.06, aoa=.72)
    out.append(blade(NM(S, O, 'main'), straight_stations(-hs, hs, 20, le[0], le[1], **{'c': m_['c'], 't': m_['t'], 'cam': m_['cam'], 'aoa': m_['aoa']}), tip=False))
    out.append(blade(NM(S, O, 'flap'), straight_stations(-hs, hs, 20, fle[0], fle[1], f_['c'], f_['t'], f_['cam'], f_['aoa']), tip=False))
    g, te = gurney(NM(S, O, 'gurney'), f_['c'], f_['t'], f_['cam'], f_['aoa'], fle, -hs, hs, .028); out.append(finish(g))
    for s in (1, -1):
        ep = [(-1.92, 1.36), (-1.95, 1.54), (-2.12, 1.62), (-2.4, 1.66), (-2.52, 1.6), (-2.5, 1.38), (-2.36, 1.33), (-2.18, 1.36), (-2.05, 1.32)]
        out.append(outline_plate(NM(S, O, f'endplate{s}'), ep, s * (hs + .008), .014, r=.045))
    # Pylons: an aero section (thin across, long fore-aft), leaning back, from the deck to the main plane.
    for s in (1, -1):
        x = s * .46; zb = -1.86; yb = fit.deck(x, zb) - .015
        zt = le[0] - .14; yt = le[1] + foil_y(m_['c'], m_['t'], m_['cam'], m_['aoa'], -.14, False) + .006
        path = [Vector((x, yb + (yt - yb) * k / 12, zb + (zt - zb) * (k / 12) ** 1.15)) for k in range(13)]
        prof = [(y, z + .055) for z, y in foil(.11, .2, 0, 0, 10)]          # thin across (x), long fore-aft (z)
        rings = [[p + Vector((u, 0, v)) for u, v in prof] for p in path]
        Vv, F = loft(rings, True, True, True)
        out.append(finish(Mesh().add(Vv, F, 'carbon').obj(NM(S, O, f'pylon{s}')), .002, 1))
        out.append(deck_plate(NM(S, O, f'base{s}'), x, zb + .08, zb - .1, .06, fit))

def wing_ducktail(fit, out):
    """A body-colour spoiler lip kicked up off the engine cover's trailing edge, between the haunch vents."""
    S, O = 'wing', 'ducktail'
    z0, z1, w0 = -1.995, -2.135, .56
    rings = []; nx = 36
    kick = lambda t: .062 * smooth(0, 1, t) ** 1.25
    for i in range(16):
        t = i / 15; z = z0 + (z1 - z0) * t
        topr, botr = [], []
        for k in range(nx + 1):
            x = -w0 + 2 * w0 * k / nx; u = abs(x) / w0
            e = (1 - u ** 3) ** 1.5                       # the ends fade into the deck
            yt = crown(x, z) + kick(t) * e + .002
            yb = crown(x, z) - .012
            topr.append(Vector((x, yt, z))); botr.append(Vector((x, yb, z)))
        rings.append(topr + botr[::-1])
    # Close the back with a ring pulled down to the deck behind the edge.
    zb = z1 - .012
    rings.append([Vector((p.x, max(crown(p.x, zb) - .012, p.y - .035 * (1 - (abs(p.x) / w0) ** 3)), zb)) for p in rings[-1][:nx + 1]] +
                 [Vector((p.x, crown(p.x, zb) - .014, zb)) for p in rings[-1][nx + 1:]])
    Vv, F = loft(rings, True, True, True)
    ob = Mesh().add(Vv, F, 'paint').obj(NM(S, O, 'lip'))
    finish(ob); subsurf(ob, 1); out.append(ob)
    edge = [Vector((x, crown(x, z1) + kick(1) * (1 - abs(x / w0) ** 3) ** 1.5 + .001, z1 + .002)) for x in [-w0 * .9 + 1.8 * w0 * k / 30 for k in range(31)]]
    Vv, F = sweep(edge, superellipse(.003, .003, 2, 8))
    out.append(Mesh().add(Vv, F, 'carbon').obj(NM(S, O, 'edge')))

LT = dict(zr=-1.99, ze=-2.62, w=.5)
def lt_top(x, z):
    """The longtail's upper surface: the engine cover's crown carried back, drooping a little."""
    zr, ze = LT['zr'], LT['ze']
    t = max(0, (zr - z) / (zr - ze))
    return crown(min(abs(x), LT['w']), zr) - .075 * t ** 1.5
def lt_bottom(x, z):
    """Its underside: rising from the tail's top edge to a sharp trailing edge."""
    ze = LT['ze']
    if z > Z0 + .02: return crown(x, z) - .014
    y0 = crown(x, Z0 + .02) - .014
    tt = min(1, max(0, (Z0 + .02 - z) / (Z0 + .02 - ze)))
    return min(lt_top(x, z) - .008, lerp(y0, lt_top(x, z) - .01, 1 - (1 - tt) ** 2.2))

def wing_longtail(fit, out):
    """Jesko Absolut: no wing. The engine cover drawn out ~40 cm to a sharp edge between two
    tall fins that run back along the haunches and stand past it as its side walls."""
    S, O = 'wing', 'longtail'
    zr, ze, w = LT['zr'], LT['ze'], LT['w']
    rings = []; nx = 26
    for i in range(22):
        t = i / 21; z = zr + (ze - zr) * t
        topr, botr = [], []
        for k in range(nx + 1):
            x = -w + 2 * w * k / nx
            yt = lt_top(x, z); yb = min(lt_bottom(x, z), yt - .008)
            topr.append(Vector((x, yt, z))); botr.append(Vector((x, yb, z)))
        rings.append(topr + botr[::-1])
    Vv, F = loft(rings, True, True, True)
    ob = Mesh().add(Vv, F, 'paint').obj(NM(S, O, 'tail'))
    finish(ob); subsurf(ob, 1); out.append(ob)
    edge = [Vector((x, lt_top(x, ze) - .005, ze + .003)) for x in [-w + 2 * w * k / 26 for k in range(27)]]
    Vv, F = sweep(edge, superellipse(.0055, .006, 3, 10))
    out.append(Mesh().add(Vv, F, 'carbon').obj(NM(S, O, 'edge')))
    # The fins: their foot on the haunch's inner edge, then down the tail's side walls; a smooth top line.
    for s in (1, -1):
        x = s * (w + .007)
        zs = [-1.25 + (ze - .03 + 1.25) * k / 40 for k in range(41)]
        foot = []
        for z in zs:
            y = crown(x, z) - .012 if z > zr + .02 else lt_bottom(w, z) - .006
            foot.append((z, y))
        line = curve([(ze - .03, lt_top(w, ze) + .14), (-2.2, crown(w, -2.0) + .135), (-1.85, crown(w, -1.85) + .1), (-1.5, crown(w, -1.5) + .045), (-1.25, crown(w, -1.25) + .004)])
        top = [(z, max(y + .012, line(z))) for z, y in foot]
        out.append(outline_plate(NM(S, O, f'fin{s}'), foot + top[::-1], x, .012, 'paint', r=fin_radii(len(foot), .002, .01, .04), seg=2, bev=.003))
        Vv, F = sweep([Vector((x, yy - .002, z)) for z, yy in top[2:-1]], superellipse(.0075, .004, 3, 8))
        out.append(Mesh().add(Vv, F, 'carbon').obj(NM(S, O, f'fincap{s}')))

# ------------------------------------------------------------------ front
def front_kit(parts, ends, fit, surf, out):
    grid = ends[1][0]
    bottom = [game(p) for p in grid[-1]]
    yb = bottom[0][1]; x0 = abs(bottom[0][0])
    xe = x0 * 1.02
    front_ = [(x * 1.02, z + .085 * (1 - (x / bottom[0][0]) ** 4) + .012) for x, y, z in bottom]
    def valance(opt):
        Vv, F = sweep([Vector((x * .995, yb - .006, z - .006)) for x, y, z in bottom], superellipse(.012, .014, 3, 10))
        return Mesh().add(Vv, F, 'gloss').obj(NM('front', opt, 'valance'))
    # ---- GT3: a longer, thicker blade, tall end plates, two tiers of dive planes, struts.
    O = 'gt3'
    out.append(valance(O))
    ext = lambda x: .14 * (1 - (x / xe) ** 2 * .45)
    fr = [(x, z + ext(x)) for x, z in front_]
    sides = [(xe + .05, front_[0][1] - .02 - .34 * t) for t in (.2, .45, .7, 1)]
    plan = [(x, z) for x, z in sides[::-1]] + [((x / xe) * (xe + .05), z) for x, z in fr] + [(-x, z) for x, z in sides]
    back = [(x, Z1 - .66) for x in (-(xe + .05), xe + .05)]
    poly = round_poly(plan + back, .015, 2)
    Vv, F = prism(poly, .03, yb - .034)
    out.append(finish(Mesh().add(Vv, F, 'carbon', Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))).obj(NM('front', O, 'blade')), .004, 2))
    lip = [Vector(((x / xe) * (xe + .05), yb + .0 + .008 * (1 - (x / xe) ** 2), z - .012)) for x, z in fr]
    Vv, F = sweep(resample(lip, 48), superellipse(.005, .013, 3, 10))
    out.append(Mesh().add(Vv, F, 'carbon').obj(NM('front', O, 'lip')))
    Vv, F = sweep([Vector(((x / xe) * (xe + .05), yb - .02, z + .003)) for x, z in fr], superellipse(.0055, .0055, 2, 10))
    out.append(Mesh().add(Vv, F, 'accent').obj(NM('front', O, 'edge')))
    for s in (1, -1):
        zf = fr[0][1] if s > 0 else fr[-1][1]
        ep = [(zf + .01, yb - .036), (zf - .42, yb - .036), (zf - .44, yb + .12), (zf - .26, yb + .2), (zf - .06, yb + .13), (zf + .02, yb + .02)]
        out.append(outline_plate(NM('front', O, f'endplate{s}'), ep, s * (xe + .058), .008, r=.025, bev=.002))
    me = Mesh()
    for x in (-.5, .5):
        fz = max(z for (xx, z) in front_ if abs(xx - x) < .2) - .1
        a, b = Vector((x, yb - .004, fz + .05)), Vector((x * .92, yb + .13, fz - .06))
        Vv, F = sweep([a, a.lerp(b, .5), b], superellipse(.0065, .0065, 2, 10))
        me.add(Vv, F, 'ti')
    out.append(me.obj(NM('front', O, 'struts')))
    me = Mesh()
    for x in (-.66, -.36, .36, .66):
        fz = max(z for (xx, z) in fr if abs(xx - x) < .2)
        prof = round_poly([(fz - .01, yb - .004), (fz - .4, yb - .004), (fz - .4, yb + .06), (fz - .14, yb + .085)], .012, 2)
        Vv, F = prism([(z, y) for z, y in prof], .008)
        me.add(Vv, F, 'carbon', Matrix.Translation((x, 0, 0)) @ XZ)
    out.append(finish(me.obj(NM('front', O, 'fences')), .002, 1))
    # Dive planes: airfoil sections rooted along the bumper's flank, two tiers per side.
    for s in (1, -1):
        for k, (y, zc, chord, span, rake) in enumerate(((.27, Z1 - .36, .24, .13, .24), (.37, Z1 - .45, .19, .1, .3))):
            out.append(canard(NM('front', O, f'canard{s}{k}'), surf, s, y, zc, chord, span, rake))
    # ---- Street lip: a thin flexible lip that follows the nose, its ends turned up, a tow strap.
    O = 'lip'
    out.append(valance(O))
    fr = [(x, z + .045 * (1 - (x / xe) ** 2 * .3)) for x, z in front_]
    rings = []
    for i, (x, z) in enumerate(fr):
        u = abs(x) / xe
        y = yb - .012 + .03 * smooth(.8, 1.0, u) ** 2
        rings.append([Vector((x, y + v, z + w)) for w, v in round_poly([(.0, -.004), (-.17, -.004), (-.17, .008), (-.01, .006)], .004, 2)])
    Vv, F = loft(rings, True, True, True)
    out.append(finish(Mesh().add(Vv, F, 'carbon').obj(NM('front', O, 'blade'))))
    Vv, F = rbox(.045, .012, .13, .004, 2)
    zt = max(z for (xx, z) in front_ if abs(xx - .32) < .15)
    out.append(Mesh().add(Vv, F, 'red', Matrix.Translation((.32, yb - .03, zt + .02)) @ Rot('X', -.7)).obj(NM('front', O, 'strap')))
    Vv, F = lathe([(.004, -.004), (.004, .016)], 12)
    out.append(Mesh().add(Vv, F, 'satin', Matrix.Translation((.32, yb - .006, zt - .03)) @ Rot('X', -math.pi / 2)).obj(NM('front', O, 'eye')))

# ------------------------------------------------------------------ widebody
def flare(name, zc, s, fit, out_, m, square=0.0, a0=-.42, a1=math.pi + .42, rivets=None):
    """A wheel-arch flare: rooted on the body 12 cm out from the arch, it bulges out over the
    tyre and rolls under at the lip. Closed (a solid), swept round the arch."""
    N = 40; rings = []; prev = {}
    for i in range(N + 1):
        a = a0 + (a1 - a0) * i / N
        dz, dy = math.cos(a), math.sin(a)
        if square:
            mm = max(abs(dz), abs(dy)); dz, dy = dz * (1 - square) + dz / mm * square, dy * (1 - square) + dy / mm * square
        end = min(1, (a - a0) / .3, (a1 - a) / .3); end = end * end * (3 - 2 * end)
        o = out_ * (.25 + .75 * end)
        def at(r, key):
            y, z = WR + r * dy, zc + r * dz
            x = fit.side(y, z, s)
            if x is None: x = prev.get(key, W(z) * .97)
            prev[key] = x
            return x, y, z
        # Rooted ~9 cm out from the lip, lower over the top so it stays under the fender crest.
        r_in = R + .06 + .035 * end
        if dy > .05: r_in = min(r_in, (BELT(zc) - .03 - WR) / dy)
        xi, yi, zi = at(r_in, 'in')
        r_m = R + (r_in - R) * .5; xm, ym, zm = at(r_m, 'm')
        r_l = R + .012; xl, yl, zl = at(r_l, 'l')
        xo = max(xl, xm) + o
        P = lambda r, x: Vector((s * x, WR + r * dy, zc + r * dz))
        prof = [P(r_in, xi - .004), P(r_in - .03, xi + o * .25), P(r_m, xm + o * .75), P(R + .022, xo), P(R + .002, xo - .008),
                P(R - .006, xo - .03), P(R - .008, xl - .02), P(R + .03, xl - .03), P(r_in - .02, xi - .03)]
        rings.append(prof)
    Vv, F = loft(rings, True, True, True)
    ob = finish(Mesh().add(Vv, F, m).obj(name))
    subsurf(ob, 1)
    return ob

def kit(fit, out):
    for opt, out_, sq, m in (('wide', .06, 0.0, 'paint'), ('fenders', .085, .5, 'black')):
        for zc in (ZF, ZR):
            for s in (1, -1):
                o = out_ + (.012 if zc < 0 else 0)
                out.append(flare(NM('kit', opt, f'flare{"F" if zc > 0 else "R"}{s}'), zc, s, fit, o, m, sq))
                if opt == 'fenders':
                    me = Mesh()
                    for k in range(11):
                        a = -.3 + (math.pi + .6) * k / 10
                        dz, dy = math.cos(a), math.sin(a)
                        mm = max(abs(dz), abs(dy)); dz, dy = dz * .5 + dz / mm * .5, dy * .5 + dy / mm * .5
                        r = R + .085; y, z = WR + r * dy, zc + r * dz
                        x = fit.side(y, z, s)
                        if x is None: continue
                        Vb, Fb = lathe([(.0, .0035), (.004, .003), (.0065, .0015), (.007, 0)], 12)
                        me.add(Vb, Fb, 'alu', frame(Vector((s * (x + o * .42), y, z)), Vector((s, .0, 0))))
                    if me.v: out.append(me.obj(NM('kit', opt, f'rivets{"F" if zc > 0 else "R"}{s}')))
        # Skirt extensions out to the flares: a blade under the stock skirt, tucking into each arch.
        for s in (1, -1):
            xo = 1.0 + out_ * .9
            za, zb = ZR + R - .01, ZF - R + .01
            rings = []
            for i in range(29):
                t = i / 28; z = za + (zb - za) * t
                e = min(1, t / .12, (1 - t) / .12); e = e * e * (3 - 2 * e)
                pr = round_poly([(.9, .108), (xo * (.93 + .07 * e), .106), (xo * (.93 + .07 * e) + .006, .12), (.97, .148), (.9, .15)], .006, 2)
                rings.append([Vector((s * x, y, z)) for x, y in pr])
            Vv, F = loft(rings, True, True, True)
            out.append(finish(Mesh().add(Vv, F, 'carbon' if opt == 'wide' else 'black').obj(NM('kit', opt, f'skirt{s}'))))

# ------------------------------------------------------------------ exhausts
def tip_lathe(r, length, lip=.012):
    """A double-wall tip with a rolled lip; local +z runs into the car, the lip at z = 0."""
    k = r / .055
    return [(r - .001, length), (r, .05), (r + .002 * k, .0), (r + .005 * k, -.02 * k), (r + .009 * k, -.032 * k), (r + .011 * k, -.038 * k),
            (r + .009 * k, -.042 * k), (r + .003 * k, -.04 * k), (r, -.034 * k), (r - .002 * k, -.018 * k)]

def exhaust_tip(name, x, y, z, r, length=.16, m='ti', dirv=(0, 0, 1)):
    me = Mesh()
    M = frame(Vector((x, y, z)), Vector(dirv))
    Vv, F = lathe(tip_lathe(r, length), 48); me.add(Vv, F, m, M)
    Vv, F = lathe([(.0, .035), (r * .4, .033), (r * .9, .027), (r - .002, .026)], 32); me.add(Vv, F, 'honey', M)
    Vv, F = lathe([(r - .003, length + .25), (r - .003, .06)], 24); me.add(Vv, F, 'heat', M)
    return me.obj(name)

def tail_floor(fit, x, y):
    """z of the tail recess floor at (x, y); the mouth is 8 cm out from it, the honeycomb 4."""
    return fit.tail(x, y)

def hex_disc(name, fit, cx, cy, r, skip=None, m='mesh'):
    """Fill a hole in the tail honeycomb (where the stock tips came out) with matching cells."""
    me = Mesh(); cell = .024; R_ = cell / math.sqrt(3); dy = cell * math.sqrt(3) / 2
    row = 0; b = cy - r - cell
    while b <= cy + r + cell:
        a = cx - r - cell + (cell / 2 if row % 2 else 0)
        while a <= cx + r + cell:
            if math.hypot(a - cx, b - cy) < r - .004 and not (skip and skip(a, b)):
                z = tail_floor(fit, a, b) - .04
                Vv, F = hex_cell(R_, .0024, .007)
                me.add(Vv, F, m, basis(Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, -1)), Vector((a, b, z))))
            a += cell
        b += dy; row += 1
    return me.obj(name) if me.v else None

def exhausts(fit, surf, out):
    holes = [(.12, .47), (-.12, .47)]
    # Quad: four tips in a carbon bezel spanning both holes.
    zf = min(tail_floor(fit, x, .47) for x in (-.24, 0, .24))
    zb = zf - .075
    sh = round_poly([(-.27, -.075), (.27, -.075), (.27, .075), (-.27, .075)], .07, 6)
    Vv, F = prism(sh, .035, 0)
    out.append(finish(Mesh().add(Vv, F, 'carbon', Matrix.Translation((0, .47, zb))).obj(NM('exhaust', 'quad', 'bezel')), .004, 2))
    for k, x in enumerate((.195, .065, -.065, -.195)):
        out.append(exhaust_tip(NM('exhaust', 'quad', f'tip{k}'), x, .47, zb - .006 + .04 * 0, .044, .2))
    # Centre: one big tip, the holes filled with honeycomb, a heat shield round the tip.
    out.append(exhaust_tip(NM('exhaust', 'center', 'tip'), 0, .45, tail_floor(fit, 0, .45) - .07, .078, .2))
    Vv, F = lathe([(.092, .045), (.1, .01), (.104, -.004), (.1, -.01), (.092, -.006)], 56)
    out.append(Mesh().add(Vv, F, 'carbon', frame(Vector((0, .45, tail_floor(fit, 0, .45) - .07)), Vector((0, 0, 1)))).obj(NM('exhaust', 'center', 'shield')))
    for opt in ('center', 'side'):
        for k, (hx, hy) in enumerate(holes):
            skip = (lambda a, b: math.hypot(a, b - .45) < .108) if opt == 'center' else None
            o = hex_disc(NM('exhaust', opt, f'fill{k}'), fit, hx, hy, .088, skip)
            o and out.append(o)
    # Side exits: a carbon fairing on each skirt ahead of the rear wheel, twin tips out of its face.
    for s in (1, -1):
        y, zc = .17, -.835
        xb = .985
        Vv, F = rbox(.075, .075, .25, .02, 3)
        out.append(finish(Mesh().add(Vv, F, 'carbon', Matrix.Translation((s * (xb + .012), y, zc))).obj(NM('exhaust', 'side', f'pod{s}'))))
        d = Vector((s, -.05, -.32)).normalized()
        for k, dz in enumerate((.055, -.045)):
            p = Vector((s * (xb + .05), y, zc + dz))
            out.append(exhaust_tip(NM('exhaust', 'side', f'tip{s}{k}'), p.x, p.y, p.z, .028, .12, 'ti', tuple(-d)))
    # Straight pipes: big heat-blued tubes out of the holes, cut on a slant, a hanger each.
    for s in (1, -1):
        x, y = s * .12, .47
        zf = tail_floor(fit, x, y)
        d = Vector((0, -.06, 1)).normalized()
        L = .34; o = Vector((x, y, zf - .26))
        prof = [(.06, L), (.06, .0), (.064, -.006), (.067, -.004), (.066, .004), (.062, .006)]
        Vv, F = lathe(prof, 48)
        # A slash cut: push the end's lower half further out.
        Vv = [Vector((vx, vy, vz - (.05 * (1 - vy / .067) / 2 if vz < .01 else 0))) for vx, vy, vz in Vv]
        out.append(Mesh().add(Vv, F, 'heat', frame(o, d)).obj(NM('exhaust', 'straight', f'pipe{s}')))
        Vv, F = lathe([(.0, .03), (.03, .028), (.057, .024)], 32)
        out.append(Mesh().add(Vv, F, 'honey', frame(o, d)).obj(NM('exhaust', 'straight', f'baffle{s}')))
        Vv, F = lathe([(.074, .02), (.08, .0), (.074, -.02)], 40)
        out.append(Mesh().add(Vv, F, 'satin', frame(o + d * .2, d)).obj(NM('exhaust', 'straight', f'clamp{s}')))

# ------------------------------------------------------------------ roof
def roof_y(fit, z):
    return fit.deck(0, z)

def roof(fit, surf, out):
    # Snorkel: an LMP air box over the roof, swallowing the stock scoop.
    zs = [.12 - 1.3 * (k / 22) for k in range(23)]
    rings = []
    for k, z in enumerate(zs):
        t = k / 22
        w = .2 * (1 - .45 * t ** 1.4) + .005; h = .15 * (1 - t) ** 1.1 + .012
        ring_ = []
        for i in range(25):
            a = math.pi * i / 24; c, sn = math.cos(a), math.sin(a)
            x = math.copysign(abs(c) ** .55, c) * w
            ring_.append(Vector((x, fit.deck(x, z) - .006 + abs(sn) ** .7 * h, z)))
        rings.append(ring_)
    Vv, F = loft(rings, False, False, True)
    ob = Mesh().add(Vv, F, 'carbon').obj(NM('roof', 'scoop', 'shell'))
    sol = ob.modifiers.new('t', 'SOLIDIFY'); sol.thickness = .006; sol.offset = -1
    subsurf(ob, 1); out.append(ob)
    mouth = [p + Vector((0, 0, -.025)) for p in rings[0]]
    me = Mesh().add(mouth + [Vector((0, rings[0][0].y + .03, zs[0] - .05))], [[i, i + 1, 25] for i in range(24)], 'black')
    out.append(me.obj(NM('roof', 'scoop', 'throat'), smooth=False))
    Vv, F = sweep(rings[0], superellipse(.006, .006, 2, 8))
    out.append(Mesh().add(Vv, F, 'carbon').obj(NM('roof', 'scoop', 'lip')))
    me = Mesh()
    for i in range(1, 6):
        x = -.16 + .32 * i / 6
        y0, y1 = fit.deck(x, zs[1]), rings[1][12].y
        Vb, Fb = rbox(.004, max(.02, (y1 - y0) * .85), .05, .0015, 1)
        me.add(Vb, Fb, 'carbon', Matrix.Translation((x, (y0 + y1) / 2, zs[0] - .03)))
    out.append(me.obj(NM('roof', 'scoop', 'vanes')))
    # Shark fin: out of the roof's crown, back along the engine cover to the tail.
    zs = [-.2 - (2.14 - .2) * k / 36 for k in range(37)]
    foot = [(z, crown(0, z) - .012) for z in zs]
    line = curve([(-2.14, 1.12), (-1.6, 1.2), (-1.0, 1.215), (-.55, 1.2), (-.2, crown(0, -.2) + .004)])
    top = [(z, max(y + .02, line(z))) for z, y in foot]
    out.append(outline_plate(NM('roof', 'fin', 'fin'), foot + top[::-1], 0, .012, r=fin_radii(len(foot), .002, .015, .05), seg=2, bev=.003))
    # LED pod bar on the front of the roof.
    z = .34; y = fit.deck(0, z) + .075
    Vv, F = rbox(1.02, .07, .075, .022, 3)
    out.append(finish(Mesh().add(Vv, F, 'black', Matrix.Translation((0, y, z))).obj(NM('roof', 'lightbar', 'housing'))))
    me = Mesh(); lens = Mesh(); refl = Mesh()
    for i in range(5):
        x = -.4 + .2 * i
        M = frame(Vector((x, y, z + .038)), Vector((0, 0, 1)))
        Vb, Fb = lathe([(.026, -.004), (.031, .0), (.032, .006), (.028, .008)], 32); me.add(Vb, Fb, 'chrome', M)
        Vl, Fl = lathe([(.0, .004), (.02, .0035), (.0265, .0015)], 32); lens.add(Vl, Fl, 'head', M)
    out.append(me.obj(NM('roof', 'lightbar', 'bezels'))); out.append(lens.obj(NM('roof', 'lightbar', 'lamps')))
    me = Mesh()
    for s in (1, -1):
        x = s * .38; y0 = fit.deck(x, z)
        prof = round_poly([(z - .04, y0 - .01), (z + .03, y0 - .01), (z + .02, y - .02), (z - .03, y - .02)], .008, 2)
        Vb, Fb = prism(prof, .02)
        me.add(Vb, Fb, 'carbon', Matrix.Translation((x, 0, 0)) @ XZ)
    out.append(finish(me.obj(NM('roof', 'lightbar', 'feet')), .002, 1))

# ------------------------------------------------------------------ hood
def hood(fit, surf, out):
    # Louvre banks on the fenders over the front wheels.
    for s in (1, -1):
        x0, x1, z0, z1 = .6, .88, 1.37, 1.77
        me = Mesh(); n = 11
        for k in range(n):
            z = z0 + .02 + (z1 - z0 - .04) * (k + .5) / n
            pts = [Vector((s * x, fit.deck(s * x, z) + .005, z)) for x in [x0 + .012 + (x1 - x0 - .024) * i / 10 for i in range(11)]]
            prof = [(u * math.cos(-.55) - v * math.sin(-.55), u * math.sin(-.55) + v * math.cos(-.55)) for u, v in superellipse(.018, .0022, 3, 10)]
            Vv, F = sweep(pts, prof, up=(0, 1, 0))
            me.add(Vv, F, 'carbon')
        out.append(finish(me.obj(NM('hood', 'louvres', f'slats{s}')), .001, 1))
        # The dark slot under the slats and a carbon frame round the bank.
        grid = []
        for i in range(9):
            z = z0 + (z1 - z0) * i / 8
            grid.append([Vector((s * x, fit.deck(s * x, z) + .0015, z)) for x in [x0 + (x1 - x0) * j / 8 for j in range(9)]])
        Vv, F = loft(grid, False)
        if s > 0: F = [f[::-1] for f in F]                 # face up
        o = Mesh().add(Vv, F, 'black').obj(NM('hood', 'louvres', f'slot{s}'))
        out.append(o)
        ring_ = []
        for (xa, za), (xb, zb_) in (((x0, z0), (x1, z0)), ((x1, z0), (x1, z1)), ((x1, z1), (x0, z1)), ((x0, z1), (x0, z0))):
            for i in range(10):
                t = i / 10; x, z = xa + (xb - xa) * t, za + (zb_ - za) * t
                ring_.append(Vector((s * x, fit.deck(s * x, z) + .004, z)))
        Vv, F = sweep(ring_ + ring_[:1], superellipse(.008, .005, 3, 10), up=(0, 1, 0))
        out.append(Mesh().add(Vv, F, 'carbon').obj(NM('hood', 'louvres', f'frame{s}')))
    # Hood scoop: a raised intake over the frunk lid, open at the front, faired in behind.
    zs = [1.12 + .5 * k / 20 for k in range(21)]
    rings = []
    for k, z in enumerate(zs):
        t = k / 20
        w = .13 + .06 * t; h = .085 * t ** .9 + .004
        ring_ = []
        for i in range(25):
            a = math.pi * i / 24; c, sn = math.cos(a), math.sin(a)
            x = math.copysign(abs(c) ** .6, c) * w
            ring_.append(Vector((x, fit.deck(x, z) - .006 + abs(sn) ** .8 * h, z)))
        rings.append(ring_)
    Vv, F = loft(rings, False, False, False)
    ob = Mesh().add(Vv, F, 'carbon').obj(NM('hood', 'scoop', 'shell'))
    sol = ob.modifiers.new('t', 'SOLIDIFY'); sol.thickness = .006; sol.offset = -1
    subsurf(ob, 1); out.append(ob)
    last = rings[-1]
    me = Mesh().add([p + Vector((0, 0, -.02)) for p in last] + [Vector((0, last[0].y + .02, zs[-1] - .06))], [[i, i + 1, 25] for i in range(24)], 'black')
    out.append(me.obj(NM('hood', 'scoop', 'throat'), smooth=False))
    Vv, F = sweep(last, superellipse(.006, .006, 2, 8))
    out.append(Mesh().add(Vv, F, 'carbon').obj(NM('hood', 'scoop', 'lip')))
    # A honeycomb across the mouth.
    me = Mesh(); cell = .02; R_ = cell / math.sqrt(3); dy = cell * math.sqrt(3) / 2; row = 0
    zm = zs[-1] - .012; b = fit.deck(0, zm)
    while b < last[12].y:
        a = -.2 + (cell / 2 if row % 2 else 0)
        while a < .2:
            k = min(range(25), key=lambda i: abs(last[i].x - a))
            if abs(a) < .19 * .95 and b > fit.deck(a, zm) + .004 and b < last[12].y - .006 and abs(a) < abs(last[0].x) * (1 - ((b - fit.deck(0, zm)) / (last[12].y - fit.deck(0, zm))) ** 2) ** .5:
                Vv, F = hex_cell(R_, .002, .006)
                me.add(Vv, F, 'mesh', basis(Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)), Vector((a, b, zm))))
            a += cell
        b += dy; row += 1
    if me.v: out.append(me.obj(NM('hood', 'scoop', 'mesh')))

# ------------------------------------------------------------------ one-eye
def one_eye(parts, surf, out):
    quads = [q for q in parts['lampFloor'] if sum(p[0] for p in q) > 0]
    if not quads: return
    reg = Region(quads, (0, 0, 1))
    me = Mesh(); cell = .016; R_ = cell / math.sqrt(3); dy = cell * math.sqrt(3) / 2
    a0, a1, b0, b1 = reg.box; row = 0; b = b0
    while b <= b1:
        a = a0 + (cell / 2 if row % 2 else 0)
        while a <= a1:
            if reg.inside(a, b) and reg.margin(a, b) > .006:
                Vv, F = hex_cell(R_, .0022, .007)
                me.add(Vv, F, 'mesh', basis(reg.u, reg.n.cross(reg.u), reg.n, reg.at(a, b, .012)))
            a += cell
        b += dy; row += 1
    if me.v: out.append(me.obj(NM('lights', 'oneeye', 'mesh')))
    pts = [reg.at(a, b, .002) for a, b in [(reg.box[0] - .01, reg.box[2] - .01), (reg.box[1] + .01, reg.box[2] - .01), (reg.box[1] + .01, reg.box[3] + .01), (reg.box[0] - .01, reg.box[3] + .01)]]
    out.append(Mesh().add(pts, [[0, 1, 2, 3]], 'black').obj(NM('lights', 'oneeye', 'back'), smooth=False))
    # The laser emitter: a machined barrel in the middle of the intake, pointing ahead.
    c = reg.at((a0 + a1) / 2, (b0 + b1) / 2, .02)
    M = frame(c, Vector((0, 0, 1)))
    Vv, F = lathe([(.0, -.03), (.016, -.03), (.018, .0), (.016, .012), (.009, .014), (.0, .014)], 28)
    out.append(Mesh().add(Vv, F, 'satin', M).obj(NM('lights', 'oneeye', 'emitter')))
    Vv, F = lathe([(.0, .0145), (.006, .0145)], 16)
    out.append(Mesh().add(Vv, F, 'tail', M).obj(NM('lights', 'oneeye', 'aperture')))
    print('ONEEYE emitter', tuple(round(v, 3) for v in c))

def build(parts, ends, panels):
    out = []
    surf = Surf(list(panels.values())); fit = Fit(surf)
    wing_gt3(fit, out); wing_attack(fit, out); wing_drift(fit, out); wing_ducktail(fit, out); wing_longtail(fit, out)
    front_kit(parts, ends, fit, surf, out)
    kit(fit, out)
    exhausts(fit, surf, out)
    roof(fit, surf, out)
    hood(fit, surf, out)
    one_eye(parts, surf, out)
    return [o for o in out if o]
