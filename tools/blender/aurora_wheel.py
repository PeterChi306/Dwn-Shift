"""AURORA wheels and brakes (2026-10-02), exported as assets/cars/aurora-wheel.glb.

  Tyre_F / Tyre_R        a semi-slick: rounded shoulders, four circumferential
                         grooves, lateral shoulder slots, a rim protector rib and
                         raised sidewall lettering (DWN SPORT CUP · size · arrows)
  Rim_F / Rim_R          forged, ten twin spokes curving into a concave centre,
                         a two-piece lip with 24 titanium bolts, a centre-lock nut
                         with a blue safety clip, the valve
  Rotor_F / Rotor_R      two-piece carbon-ceramic: vented friction rings on
                         floating bobbins, an alloy bell
  Caliper_FL .. _RR      six-piston monoblocks with AURORA on the outer face,
                         bridge bolts, bleed nipples, the pads (one per corner so
                         the lettering reads on both sides)

Local space: the axle is +x (the outer face looks along +x, a left wheel), the
centre at the origin, y up, z forward. world/carWheels.js turns the right-hand
wheels round (it does not mirror them, so the lettering stays readable).

Run:  Blender -b --factory-startup --python tools/blender/aurora_wheel.py -- [--export] [--render out.png]
"""
import bpy, math, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib, aurora_kit
if __name__ == "__main__": importlib.reload(aurora_kit)
from aurora_kit import *

RADIUS, RIM = .365, .272                       # tyre radius, bead seat radius (carModels.js / carWheels.js 'aero')
WIDTH = {'F': .265, 'R': .315}
ROTOR = {'F': .2, 'R': .19}
CAL_A = {'F': -.6, 'R': .6}                    # caliper position round the rotor (carWheels.js): front behind the axle, rear ahead of it
OUT = arg('--wheel-glb', os.path.join(ROOT, 'assets', 'cars', 'aurora-wheel.glb'))

def wheel_mats():
    mat('tyre', (.018, .018, .019), .88, 0)
    mat('tyreText', (.06, .062, .065), .6, 0)
    mat('rim', (.012, .013, .015), .2, .6)
    mat('lip', (.15, .16, .17), .25, .9)
    mat('rotor', (.28, .29, .3), .55, .5)
    mat('caliper', (.03, .12, 1), .3, .3)

def ax(p):
    """Wheel-local (x axle, y up, z forward) to game space for a wheel at the origin: the same axes."""
    return Vector(p)

# ------------------------------------------------------------------ tyre
def tyre(key):
    hw = WIDTH[key] / 2; R_ = RADIUS
    side = R_ - RIM
    # The cross-section from the inner bead over the tread to the outer bead: (x, r).
    tread = []
    grooves = [-.62, -.22, .22, .62]           # circumferential grooves, in half-widths
    gw, gd = .011, .007
    xs = [-.86]
    for g in grooves: xs += [g * hw / hw - gw / hw, g * hw / hw - gw / hw + .001, g + gw / hw - .001, g + gw / hw]
    xs += [.86]
    xs = sorted(set(round(x, 4) for x in xs))
    def tread_r(xn):
        r = R_ - .012 * max(0, (abs(xn) - .55) / .3) ** 2       # the crown rounds off toward the shoulders
        for g in grooves:
            if abs(xn - g) < gw / hw - .0005: r -= gd
        return r
    prof = []
    # inner bead -> inner sidewall
    for t in [i / 6 for i in range(7)]:
        r = RIM - .004 + side * .8 * t
        bulge = math.sin(math.pi * t) * .035
        prof.append((-hw * (.9 + .02 * t) - bulge * hw / .13 * .4, r))
    for a in [i / 4 for i in range(1, 5)]:                      # the inner shoulder
        ang = math.pi / 2 * a
        prof.append((-hw * .86 - hw * .1 * math.cos(ang), R_ - .028 + .016 * math.sin(ang) - .002))
    for xn in xs: prof.append((xn * hw, tread_r(xn)))
    for a in [i / 4 for i in range(3, -1, -1)]:
        ang = math.pi / 2 * a
        prof.append((hw * .86 + hw * .1 * math.cos(ang), R_ - .028 + .016 * math.sin(ang) - .002))
    for t in [i / 6 for i in range(6, -1, -1)]:
        r = RIM - .004 + side * .8 * t
        bulge = math.sin(math.pi * t) * .035
        x = hw * (.9 + .02 * t) + bulge * hw / .13 * .4
        if .16 < t < .34: x += .003                             # the rim protector rib
        prof.append((x, r))
    # Shoulder slots: 44 lateral grooves on each shoulder, crisp because the ring samples land on their edges.
    pitch = TAU / 44; slot = pitch * .2
    angles = []
    for k in range(44):
        a = k * pitch; angles += [a, a + pitch * .4, a + pitch * .4 + slot * .02, a + pitch * .4 + slot, a + pitch * .4 + slot * 1.02]
    angles = sorted(angles)
    def in_slot(a):
        f = (a % pitch) / pitch
        return .4 + .01 < f < .4 + .2 - .01
    me = Mesh(); rings = []
    n = len(prof)
    for a in angles:
        c, s = math.cos(a), math.sin(a)
        ring_ = []
        for j, (x, r) in enumerate(prof):
            xn = x / hw
            if in_slot(a) and .62 + .011 / hw < abs(xn) < .95 and r > R_ - .03: r -= .0055
            ring_.append(Vector((x, r * c, r * s)))
        rings.append(ring_)
    Vv = [p for r in rings for p in r]; F = []
    m = len(rings)
    for i in range(m):
        i2 = (i + 1) % m
        for j in range(n - 1):
            F.append([i * n + j, i2 * n + j, i2 * n + j + 1, i * n + j + 1])
    me.add(Vv, F, 'tyre')
    # Raised sidewall lettering on the outer wall.
    def outer_x(r):
        best = None
        for (x0, r0), (x1, r1) in zip(prof[-7:], prof[-6:]):
            if min(r0, r1) <= r <= max(r0, r1) and abs(r1 - r0) > 1e-6:
                best = x0 + (x1 - x0) * (r - r0) / (r1 - r0)
        return best if best is not None else hw * .95
    rT = RIM + side * .5
    for text, a0, size in (('DWN SPORT CUP', math.pi / 2, .026), ('DWN SPORT CUP', -math.pi / 2, .026),
                           (f"{'265/30' if key == 'F' else '315/30'} ZR21  101Y", math.pi * .02, .014), (f"{'265/30' if key == 'F' else '315/30'} ZR21  101Y", math.pi * 1.02, .014)):
        Vt, Ft = text_mesh(text, size, .0012, 'wide', 1.15)
        W_ = wrap_polar([(x, y, z) for x, y, z in Vt], rT, a0)
        pts = []
        for (px, py, pz), (_, _, ez) in zip(W_, Vt):
            r = math.hypot(px, py)
            # text local xy -> the wheel's yz plane, raised along +x off the wall
            pts.append(Vector((outer_x(r) + ez, px, py)))
        me.add(pts, Ft, 'tyreText')
    return me.obj(f'Tyre_{key}')

# ------------------------------------------------------------------ rim
def rim(key):
    hw = WIDTH[key] / 2
    me = Mesh()
    xl = hw * .9                                 # the outer lip
    # Barrel: inner bead seat, drop centre, outer bead seat (seen through the spokes).
    Vv, F = lathe([(RIM - .002, -hw * .93), (RIM + .006, -hw * .95), (RIM + .008, -hw * .9), (RIM - .004, -hw * .86), (RIM - .02, -hw * .6),
                   (RIM - .03, -hw * .1), (RIM - .03, hw * .4), (RIM - .012, hw * .62), (RIM - .004, hw * .78)], 56)
    me.add(Vv, F, 'rim', Rot('Y', math.pi / 2))
    # The two-piece lip: a dark polished flange.
    Vv, F = lathe([(RIM - .004, hw * .78), (RIM - .001, hw * .86), (RIM + .008, xl), (RIM + .013, xl + .003), (RIM + .015, xl - .002), (RIM + .01, hw * .84), (RIM - .012, hw * .8)], 72)
    me.add(Vv, F, 'lip', Rot('Y', math.pi / 2))
    # 24 titanium bolts round the lip's join.
    for k in range(24):
        a = TAU * k / 24
        Vb, Fb = lathe([(0, 0), (.0042, 0), (.0042, .002), (.0034, .0032), (0, .0034)], 6)
        me.add(Vb, Fb, 'ti', Matrix.Translation((hw * .78, math.cos(a) * (RIM - .016), math.sin(a) * (RIM - .016))) @ Rot('Y', math.pi / 2))
    # Ten twin spokes: each a swept section from the concave hub out to the lip, twisted, with a machined edge.
    hub_r, hub_x = .072, hw * .42
    def spoke_path(a, off):
        pts = []
        for i in range(13):
            t = i / 12
            r = hub_r + (RIM - .018 - hub_r) * t
            x = hub_x + (hw * .79 - hub_x) * (t ** .65) + .014 * math.sin(math.pi * t)     # concave, with a crowned face
            aa = a + off * (1 - .55 * t) + .05 * t                                        # the pair splays, the spoke sweeps a little
            pts.append(Vector((x, math.cos(aa) * r, math.sin(aa) * r)))
        return pts
    for k in range(10):
        a = TAU * k / 10
        for off in (-.072, .072):
            path = spoke_path(a, off)
            def prof(i, path=path):
                t = i / 12
                # Flat forged faces with chamfered edges: wide across, shallow along the axle.
                w = .019 - .007 * t; d = .03 - .012 * t
                return superellipse(w / 2, d / 2, 7, 16)
            Vs, Fs = sweep(path, prof, up=(1, 0, 0))
            me.add(Vs, Fs, 'rim')
    # Hub: the concave centre, the mounting face, the centre-lock nut and its blue clip.
    Vv, F = lathe([(hub_r + .02, hub_x - .026), (hub_r + .018, hub_x + .006), (hub_r + .006, hub_x + .016), (.05, hub_x + .022), (.042, hub_x + .026)], 64)
    me.add(Vv, F, 'rim', Rot('Y', math.pi / 2))
    Vv, F = lathe([(.0, hub_x + .085), (.024, hub_x + .085), (.03, hub_x + .078), (.034, hub_x + .05), (.036, hub_x + .024)], 6)
    me.add(Vv, F, 'chrome', Rot('Y', math.pi / 2))
    Vv, F = lathe([(.041, hub_x + .022), (.043, hub_x + .03), (.04, hub_x + .036), (.034, hub_x + .036)], 40)
    me.add(Vv, F, 'caliper', Rot('Y', math.pi / 2))
    Vc, Fc = sweep([Vector((hub_x + .09, -.03, 0)), Vector((hub_x + .096, 0, 0)), Vector((hub_x + .09, .03, 0))], superellipse(.0025, .0025, 2, 8))
    me.add(Vc, Fc, 'caliper')
    # The valve, between two spokes near the lip.
    a = TAU * .05
    Vv, F = cyl(.0035, .022, 8, 0)
    me.add(Vv, F, 'chrome', Matrix.Translation((hw * .7, math.cos(a) * (RIM - .03), math.sin(a) * (RIM - .03))) @ Rot('Y', math.pi / 2 - .5))
    o = me.obj(f'Rim_{key}')
    o.modifiers.new('wn', 'WEIGHTED_NORMAL')
    return o

# ------------------------------------------------------------------ brakes
def rotor_x(key): return -WIDTH[key] / 2 * .1
def rotor(key):
    me = Mesh(); r1 = ROTOR[key]; r0 = r1 * .58; x0 = rotor_x(key); th = .036
    # Two friction rings with the vanes between them.
    for xa, xb in ((x0 - th / 2, x0 - th / 2 + .011), (x0 + th / 2 - .011, x0 + th / 2)):
        Vv, F = lathe([(r0, xa), (r1, xa), (r1, xb), (r0, xb)], 96)
        me.add(Vv, F, 'rotor', Rot('Y', math.pi / 2))
    for k in range(40):
        a = TAU * k / 40
        Vv, F = box(th - .022, .006, r1 - r0 - .01)
        me.add(Vv, F, 'black', Matrix.Translation((x0, 0, 0)) @ Rot('X', a) @ Matrix.Translation((0, 0, (r0 + r1) / 2)) @ Rot('X', .5) @ Matrix.Identity(4))
    # The bell: an alloy hat on floating bobbins.
    Vv, F = lathe([(r0 + .006, x0 + th / 2 - .004), (r0 - .006, x0 + th / 2 + .004), (.07, x0 + th / 2 + .006), (.07, x0 + .05), (.04, x0 + .056), (.03, x0 + .056)], 64)
    me.add(Vv, F, 'alu', Rot('Y', math.pi / 2))
    for k in range(12):
        a = TAU * k / 12
        Vv, F = cyl(.0065, th + .006, 10, -th / 2 - .003)
        me.add(Vv, F, 'steel', Matrix.Translation((x0, math.cos(a) * (r0 + .002), math.sin(a) * (r0 + .002))) @ Rot('Y', math.pi / 2))
    return me.obj(f'Rotor_{key}')

def caliper(key, side):
    """A six-piston monoblock straddling the rotor round CAL_A; `side` 1 left, -1 right (lettering reads outward)."""
    me = Mesh(); r1 = ROTOR[key]; x0 = rotor_x(key); th = .036
    a0 = CAL_A[key]; span = .82; rc = r1 - .03
    # Body: a swept rounded section round the arc, a window over the rotor's edge.
    def arc(r, x, n=20, k0=0, k1=1):
        return [Vector((x, math.cos(a0 - span / 2 + span * (k0 + (k1 - k0) * i / n)) * r, math.sin(a0 - span / 2 + span * (k0 + (k1 - k0) * i / n)) * r)) for i in range(n + 1)]
    for xs in (x0 + th / 2 + .017, x0 - th / 2 - .017):
        Vv, F = sweep(arc(rc, xs), superellipse(.036, .015, 3.4, 16), up=(1, 0, 0))
        me.add(Vv, F, 'caliper')
    # The bridge over the rotor's rim, and its bolts.
    Vv, F = sweep(arc(r1 + .012, x0, 20, .04, .96), superellipse(.013, .034, 3.4, 14), up=(1, 0, 0))
    me.add(Vv, F, 'caliper')
    for k in (.12, .88):
        p = arc(r1 + .02, x0 + .0, 1, k, k)[0]
        Vb, Fb = cyl(.0055, th + .05, 6, -(th + .05) / 2)
        me.add(Vb, Fb, 'steel', Matrix.Translation(p) @ Rot('Y', math.pi / 2))
    # Pads either side of the disc.
    for xs in (x0 + th / 2 + .004, x0 - th / 2 - .004):
        Vv, F = sweep(arc(rc + .005, xs, 14, .08, .92), superellipse(.022, .004, 4, 10), up=(1, 0, 0))
        me.add(Vv, F, 'black')
    # Bleed nipples on top.
    for xs in (x0 + th / 2 + .02, x0 - th / 2 - .02):
        p = arc(rc + .036, xs, 1, .9, .9)[0]
        Vb, Fb = cyl(.004, .012, 6, 0)
        me.add(Vb, Fb, 'steel', frame(p, (p - Vector((xs, 0, 0))).normalized()))
    # AURORA on the outer face, along the arc, reading upright from outside the car.
    Vt, Ft = text_mesh('AURORA', .018, .0008, 'wide', 1.2)
    xo = x0 + th / 2 + .017 + .015
    pts = []
    for x, y, z in Vt:
        x = x if side > 0 else -x                # the right caliper is this one mirrored: pre-mirror the text
        a = a0 - x / rc; r = rc + y
        pts.append(Vector((xo + z, math.cos(a) * r, math.sin(a) * r)))
    me.add(pts, Ft if side > 0 else [f[::-1] for f in Ft], 'white')
    if side < 0:
        me.v = [Vector((-p.x, p.y, p.z)) for p in me.v]; me.f = [f[::-1] for f in me.f]
    return me.obj(f'Caliper_{key}{"L" if side > 0 else "R"}')

def build():
    wheel_mats()
    out = []
    for key in ('F', 'R'):
        out += [tyre(key), rim(key), rotor(key), caliper(key, 1), caliper(key, -1)]
    return out

def preview():
    """Place the four wheels on the car in the current scene (aurora.py --render ... --wheels)."""
    wheel_mats(); objs = build(); placed = []
    for o in objs:
        key = o.name.split('_')[1][0]; z = 1.41 if key == 'F' else -1.41
        for s in (1, -1):
            if o.name.startswith('Caliper') and o.name[-1] != ('L' if s > 0 else 'R'): continue
            c = o.copy(); bpy.context.scene.collection.objects.link(c)
            M = Matrix.Translation(G(s * .91, RADIUS, z))
            if s < 0 and not o.name.startswith('Caliper'): M = M @ Matrix.Rotation(math.pi, 4, 'Z')     # turned round, not mirrored
            c.matrix_world = M; placed.append(c)
    for o in objs: bpy.data.objects.remove(o)
    return placed

def export(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_materials='EXPORT', export_normals=True, export_texcoords=False, export_cameras=False, export_lights=False)
    print('EXPORTED', OUT, os.path.getsize(OUT))

if not any(a.endswith('aurora.py') for a in sys.argv):
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    setup_materials()
    objs = build()
    dg = bpy.context.evaluated_depsgraph_get(); n = 0
    for o in objs:
        me = o.evaluated_get(dg).to_mesh(); me.calc_loop_triangles(); n += len(me.loop_triangles); o.evaluated_get(dg).to_mesh_clear()
    print('WHEEL TRIS', n)
    if '--export' in ARGS: export(objs)
    if arg('--render'):
        s = bpy.context.scene; s.render.engine = 'BLENDER_EEVEE_NEXT'; s.render.resolution_x = 1000; s.render.resolution_y = 1000
        s.view_settings.view_transform = 'AgX'; s.eevee.taa_render_samples = 32
        w = bpy.data.worlds.new('w'); s.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.55, .58, .62, 1)
        sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); s.collection.objects.link(sun); sun.data.energy = 3; sun.rotation_euler = (.6, .3, 1.2)
        for o in objs:
            if o.name.endswith('_R') or o.name.startswith('Caliper_R') or o.name == 'Caliper_FR': o.hide_render = True
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); s.collection.objects.link(cam); s.camera = cam; cam.data.lens = 50
        for i, (yaw, pitch, d) in enumerate(((60, 10, 1.3), (10, 5, 1.0), (90, 0, 1.15), (100, 30, .7))):
            yr, pr = math.radians(yaw), math.radians(pitch)
            cam.location = G(math.sin(yr) * math.cos(pr) * d, math.sin(pr) * d, math.cos(yr) * math.cos(pr) * d)
            cam.rotation_euler = (G(0, 0, 0) - cam.location).to_track_quat('-Z', 'Y').to_euler()
            base, ext = os.path.splitext(arg('--render')); s.render.filepath = f'{base}-{i}{ext}'
            bpy.ops.render.render(write_still=True)
