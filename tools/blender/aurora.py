"""AURORA body, modelled in Blender (v1 2026-09-29, v3 2026-10-02).

One continuous subdivision-surface shell swept through cross-sections
(aurora_shape.py), its lamps, intakes and vents moulded in, then split along
real shut lines into panels with thickness: the body, two dihedral doors (each
with its window), the frunk lid and the engine cover with its glass window.
The detail parts (aurora_parts.py), the engine bay (aurora_engine.py) and the
suspension go with it. Exported as assets/cars/aurora.glb; world/cars/auroraGlb.js
swaps each material by name for the game's own (paint colour, lamps, signals)
and hangs the doors on their hinges. The wheels are aurora_wheel.py.

Run:  Blender -b --factory-startup --python tools/blender/aurora.py -- [--export] [--lod]
          [--render out.png] [--views q34f,side,...] [--light] [--doors 1] [--no-parts]
          [--works]  also build the DWN Works kit (aurora_works.py) -> assets/cars/aurora-works.glb

Game space is +z forward, +x left, y up, ground y = 0; Blender is Z-up, so a
game point (x, y, z) is stored at (x, -z, y) and the glTF exporter turns it back.
"""
import bpy, bmesh, math, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib
import aurora_kit, aurora_shape
for m in (aurora_kit, aurora_shape): importlib.reload(m)
from aurora_kit import *
from aurora_shape import *

GLB = arg('--glb', os.path.join(ROOT, 'assets', 'cars', 'aurora.glb'))
RENDER = arg('--render')
if LOD and '--glb' not in ARGS: GLB = GLB.replace('.glb', '-lod.glb')
GAP = .0026                                     # half a shut line (each side moves back this much)

def stations():
    keys = [Z0 + .03, Z0 + .07, Z0 + .12, Z1 - .03, Z1 - .07, Z1 - .12, GZ1, GZ0, -.8,
            DOOR_F, DOOR_R, DOOR_GF, DOOR_GR, WIN_F, WIN_R, HOOD_R, HOOD_F, ENG_F, ENG_R, ENGW_F, ENGW_R, LOUV_F, LOUV_R,
            -.9, -.52, -.42, -.28, 1.62, 1.9, 1.0, 1.32, -2.1, -1.75, -1.99, -1.86]
    for zc in (ZF, ZR):
        for e in (-1, 1):
            for off in (0, .012, .035, .07, .12):
                keys.append(zc + e * (R - off))
            keys.append(zc + e * (R + .012))
    keys = sorted(set(round(k, 4) for k in keys))
    zs = list(keys)
    z = Z0
    while z < Z1:
        if all(abs(z - k) > .022 for k in keys): zs.append(round(z, 4))
        z += .065
    zs.append(Z1)
    return sorted(set(zs))

# ------------------------------------------------------------------ the shell
TAGS = ['auto', 'paint', 'glass', 'gloss', 'honey', 'black', 'head', 'carbon', 'tail', 'radiator', 'hole', 'carbonM', 'mesh']
BODY, DOOR_L, DOOR_R_, HOOD, ENGINE, GLASS, GLASS_L, GLASS_R = range(8)
PANEL_NAMES = {BODY: 'Body', DOOR_L: 'Door_L', DOOR_R_: 'Door_R', HOOD: 'Hood', ENGINE: 'EngineCover', GLASS: 'Glass', GLASS_L: 'Door_L_glass', GLASS_R: 'Door_R_glass'}

def L(bm, name, kind='int'):
    return getattr(bm.faces.layers, kind)[name]

def faces_where(bm, pred):
    ZL, JL, SL, EL = L(bm, 'z', 'float'), L(bm, 'j'), L(bm, 'side'), L(bm, 'end')
    return [f for f in bm.faces if f[EL] == 0 and pred(f[ZL], f[JL], f[SL])]

def crease_faces(bm, faces, v):
    cr = bm.edges.layers.float.get('crease_edge') or bm.edges.layers.float.new('crease_edge')
    for f in faces:
        for e in f.edges: e[cr] = max(e[cr], v)

def cut(bm, faces, thick, depth, floor, wall, crease=.8):
    """Inset a region of the cage and push it in: a recess with walls, as a moulded opening is.
    Returns the floor faces (their corners, game space) for parts that sit in the recess."""
    TL, PL = L(bm, 'tag'), L(bm, 'panel')
    if not faces: return []
    panel = faces[0][PL]
    res = bmesh.ops.inset_region(bm, faces=faces, thickness=thick, depth=depth, use_even_offset=True)
    for f in faces: f[TL] = TAGS.index(floor); f[PL] = panel
    for f in res['faces']:
        f[TL] = TAGS.index(wall); f[PL] = panel
    crease_faces(bm, res['faces'], crease)
    return [[game(v.co) for v in f.verts] for f in faces]

def coons(B, D, L_, Rr):
    """A quad grid spanning four boundary curves (Coons patch): B top, D bottom (both u), L/Rr sides (v)."""
    nu, nv = len(B) - 1, len(L_) - 1
    P = []
    for k in range(nv + 1):
        v = k / nv; row = []
        for i in range(nu + 1):
            u = i / nu
            p = (1 - v) * B[i] + v * D[i] + (1 - u) * L_[k] + u * Rr[k] \
                - ((1 - u) * (1 - v) * B[0] + u * (1 - v) * B[-1] + (1 - u) * v * D[0] + u * v * D[-1])
            row.append(p)
        P.append(row)
    return P

def build_shell():
    zs = stations(); n = 2 * NH - 1
    bm = bmesh.new()
    ZL = bm.faces.layers.float.new('z')
    for k in ('j', 'side', 'tag', 'end', 'u', 'v', 'panel'): bm.faces.layers.int.new(k)
    JL, SL, EL, UL, VL = L(bm, 'j'), L(bm, 'side'), L(bm, 'end'), L(bm, 'u'), L(bm, 'v')
    rings = [ring(z) for z in zs]
    rows = [[bm.verts.new(G(x, y, sweep_z(z, x))) for (x, y) in r] for r, z in zip(rings, zs)]
    for i in range(len(rows) - 1):
        a, b = rows[i], rows[i + 1]
        for j in range(n - 1):
            f = bm.faces.new((a[j], a[j + 1], b[j + 1], b[j]))
            f[ZL] = (zs[i] + zs[i + 1]) / 2
            f[JL] = j if j < NH - 1 else n - 2 - j
            f[SL] = 1 if j < NH - 1 else -1
    # Character lines: the shoulder blade over the cove and the fender crests stay sharp.
    cr = bm.edges.layers.float.new('crease_edge')
    def crease_line(j, amount, zrange=None):
        for i in range(len(rows) - 1):
            z = (zs[i] + zs[i + 1]) / 2
            if zrange and not (zrange[0] < z < zrange[1]): continue
            for jj in (j, n - 1 - j):
                e = bm.edges.get((rows[i][jj], rows[i + 1][jj]))
                if e: e[cr] = max(e[cr], amount(z) if callable(amount) else amount)
    crease_line(J_LIP, lambda z: .95 * smooth(.0, .03, cove(z)), (-1.05, .95))
    crease_line(J_CREST, lambda z: .78 + .2 * smooth(1.0, 1.6, z) + .2 * smooth(-1.2, -1.6, z))
    crease_line(J_UPPER, lambda z: .5 * smooth(1.0, 1.4, z))                 # the fender's flank folds under its crest
    # The bumpers: each end ring is closed by a patch that shares its vertices, so
    # the nose and the tail are the same surface as the body (no seam, no gap).
    ends = {}
    J = J_UPPER
    for tag, row, zz in ((1, rows[-1], Z1), (2, rows[0], Z0)):
        top = row[J:n - J]                        # shoulder to shoulder over the top
        left = row[J::-1]                         # down the left side to the rocker
        right = row[n - 1 - J:]                   # down the right side to the rocker
        yb = min(v.co.z for v in row)
        x0 = row[0].co.x / top[0].co.x
        D = []
        for i, v in enumerate(top):
            x = v.co.x * x0; u = abs(x) / abs(row[0].co.x)
            # The bottom edge sits a little behind the lip (a nose leaning back, a tail tucked under).
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
    crease_faces(bm, [f for f in bm.faces if f[JL] == 0 and f[EL] == 0], .5)
    return bm, ends, zs

def face_material(z, j):
    """Paint, glass or the gloss frame around it, for a face of the swept skin (j: its row)."""
    if j == 0: return 'black'
    k = canopy(z)
    if k > .5 and j >= F_GLASS0:
        side = j <= F_GLASS1
        wind = DOOR_GF < z < GZ1 - .07
        sidew = side and WIN_R < z < WIN_F
        back = -1.03 < z < -.87 and j >= F_ROOF0
        if wind or sidew or back: return 'glass'
        return 'gloss'
    if ENGW_R < z < ENGW_F and j >= J_TOP + 1: return 'glassE'
    return 'paint'

def assign_panels(bm):
    ZL, JL, SL, EL, PL, TL = L(bm, 'z', 'float'), L(bm, 'j'), L(bm, 'side'), L(bm, 'end'), L(bm, 'panel'), L(bm, 'tag')
    for f in bm.faces:
        z, j, s = f[ZL], f[JL], f[SL]
        p = BODY
        if f[EL] == 0:
            door = (1 <= j <= J_CHANNEL and DOOR_R < z < DOOR_F) or (F_GLASS0 <= j <= F_GLASS1 and DOOR_GR < z < DOOR_GF)
            if door: p = DOOR_L if s > 0 else DOOR_R_
            elif j >= J_TOP and HOOD_R < z < HOOD_F: p = HOOD
            elif j >= J_TOP and ENG_R < z < ENG_F: p = ENGINE
            if face_material(z, j) in ('glass', 'glassE'):
                p = GLASS_L if p == DOOR_L else GLASS_R if p == DOOR_R_ else GLASS
        f[PL] = p

def shell_cuts(bm):
    """Lamps, intakes and vents moulded into the cage (before subdivision)."""
    parts = {}
    # Headlamps along the fender's leading edge: record the skin first, for the lens.
    lamp = faces_where(bm, lambda z, j, s: Z1 - .6 < z < Z1 - .1 and J_UPPER <= j <= J_CREST)
    parts['lens'] = [[v.co.copy() for v in f.verts] for f in lamp]
    parts['lampFloor'] = cut(bm, lamp, .012, -.035, 'gloss', 'gloss', .9)
    # The side intake in the door's cove, in front of the rear wheel: a deep mouth with a cooler behind a mesh.
    parts['sideIntake'] = {s: cut(bm, faces_where(bm, lambda z, j, s_, s0=s: -.9 < z < -.52 and J_COVE0 <= j <= J_COVE and s_ == s0), .016, -.1, 'radiator', 'gloss', .85) for s in (1, -1)}
    # Hood nostrils: open vents with slats (the floor goes, the hole is dressed by aurora_parts).
    parts['hoodVent'] = {s: cut(bm, faces_where(bm, lambda z, j, s_, s0=s: 1.62 < z < 1.9 and j == J_TOP + 1 and s_ == s0), .012, -.018, 'hole', 'gloss', .85) for s in (1, -1)}
    # Fender-top louvres behind the front wheels, exhausting the arch.
    parts['fenderVent'] = {s: cut(bm, faces_where(bm, lambda z, j, s_, s0=s: 1.0 < z < 1.32 and j == J_CREST and s_ == s0), .01, -.016, 'hole', 'gloss', .85) for s in (1, -1)}
    # Engine cover louvres behind the window.
    parts['louvres'] = cut(bm, faces_where(bm, lambda z, j, s: LOUV_R < z < LOUV_F and j >= J_TOP + 1), .014, -.02, 'hole', 'carbon', .85)
    # Haunch outlets: open, slatted, over the rear wheels.
    parts['haunchVent'] = {s: cut(bm, faces_where(bm, lambda z, j, s_, s0=s: -2.1 < z < -1.75 and J_CREST <= j <= J_INNER and s_ == s0), .01, -.02, 'hole', 'gloss', .85) for s in (1, -1)}
    # Rear arch exits behind the rear wheels: the tyre shows through the slats.
    parts['archExit'] = {s: cut(bm, faces_where(bm, lambda z, j, s_, s0=s: -1.99 < z < -1.86 and J_SILL <= j <= J_LIP and s_ == s0), .012, -.02, 'hole', 'gloss', .85) for s in (1, -1)}
    # Door handle: a flush pocket on the shoulder.
    parts['handle'] = {s: cut(bm, faces_where(bm, lambda z, j, s_, s0=s: -.42 < z < -.28 and j == J_LIP and s_ == s0), .006, -.012, 'gloss', 'gloss', .9) for s in (1, -1)}
    # The bumpers, cut into the end patches (u across, v down from the lip).
    EL, UL, VL, TL = (L(bm, k) for k in ('end', 'u', 'v', 'tag'))
    end = lambda tag, us, vs: [f for f in bm.faces if f[EL] == tag and f[UL] in us and f[VL] in vs]
    parts['noseIntake'] = [cut(bm, end(1, us, range(1, 5)), .014, -.11, 'radiator', 'gloss', .85) for us in (range(5, 11), range(1, 4), range(12, 15))]
    for f in end(1, range(16), [5, 6]): f[TL] = TAGS.index('carbon')
    # A light blade under the nose lip, echoing the tail's.
    cut(bm, end(1, range(3, 13), [0]), .018, -.004, 'head', 'gloss', .9)
    parts['tailLamp'] = cut(bm, end(2, range(1, 15), [0]), .006, -.022, 'gloss', 'gloss', .9)
    parts['tailMesh'] = cut(bm, end(2, range(1, 15), range(1, 5)), .014, -.08, 'radiator', 'gloss', .85)
    for f in end(2, range(16), [5, 6]): f[TL] = TAGS.index('carbon')
    return parts

SHELL_MATS = ['paint', 'glass', 'glassE', 'gloss', 'honey', 'black', 'head', 'carbon', 'tail', 'radiator', 'carbonM', 'mesh']
INNER = {'paint': 'carbonM', 'glass': 'glass', 'glassE': 'glassE', 'gloss': 'carbonM', 'honey': 'black', 'black': 'black', 'head': 'black', 'carbon': 'carbonM',
         'tail': 'black', 'radiator': 'black', 'carbonM': 'carbonM', 'mesh': 'black'}

def panel_object(bm_all, panel_ids, name, gap=True):
    """A copy of the cage holding only `panel_ids`; its shut-line edges move back GAP from the neighbours."""
    bm = bm_all.copy()
    PL, TL, ZL, JL = L(bm, 'panel'), L(bm, 'tag'), L(bm, 'z', 'float'), L(bm, 'j')
    GL = bm.edges.layers.int['gap']
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f[PL] not in panel_ids], context='FACES')
    # Open vents: their floors go.
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if TAGS[f[TL]] == 'hole'], context='FACES')
    if gap:
        move = {}
        for e in bm.edges:
            if not e.is_boundary or not e[GL]: continue
            f = e.link_faces[0]; a, b = e.verts; t = (b.co - a.co).normalized()
            inward = f.calc_center_median() - (a.co + b.co) / 2
            inward -= t * inward.dot(t); inward -= f.normal * inward.dot(f.normal)
            if inward.length < 1e-9: continue
            inward.normalize()
            for v in (a, b): move.setdefault(v, Vector()).__iadd__(inward)
        for v, d in move.items():
            if d.length > 1e-9: v.co += d.normalized() * GAP
    for f in bm.faces:
        t = TAGS[f[TL]]
        nm = face_material(f[ZL], f[JL]) if t == 'auto' else t
        f.material_index = SHELL_MATS.index(nm)
    ob = new_obj(name, bm)
    for nm in SHELL_MATS: ob.data.materials.append(MATS[nm])
    for nm in SHELL_MATS: ob.data.materials.append(MATS['black'])            # solidify rims
    for nm in SHELL_MATS: ob.data.materials.append(MATS[INNER[nm]])          # the panel's inner face
    return ob

def thicken(ob, levels=2, thick=.014, inner=True):
    m = ob.modifiers.new('sub', 'SUBSURF'); m.levels = m.render_levels = levels
    if levels and thick:
        # Panels that never open only show their thickness at the edges (rim only); doors show their insides.
        t = ob.modifiers.new('thick', 'SOLIDIFY'); t.thickness = thick; t.offset = -1; t.use_rim = True; t.use_rim_only = not inner
        t.material_offset_rim = len(SHELL_MATS); t.material_offset = 2 * len(SHELL_MATS)
        t.use_even_offset = False; t.use_quality_normals = True
    for p in ob.data.polygons: p.use_smooth = True

def split_panels(bm):
    """Mark the shut lines, then make one object per panel."""
    PL = L(bm, 'panel'); GL = bm.edges.layers.int.new('gap')
    glass = {GLASS, GLASS_L, GLASS_R}
    for e in bm.edges:
        if len(e.link_faces) == 2:
            a, b = (f[PL] for f in e.link_faces)
            # Panels part along a gap; glass meets its frame flush (it is bonded in).
            if a != b and not (a in glass or b in glass): e[GL] = 1
    out = {}
    out['Body'] = panel_object(bm, {BODY}, 'Body')
    out['Glass'] = panel_object(bm, {GLASS}, 'Glass', gap=False)
    out['Hood'] = panel_object(bm, {HOOD}, 'Hood')
    out['EngineCover'] = panel_object(bm, {ENGINE}, 'EngineCover')
    for s, d, g in (('L', DOOR_L, GLASS_L), ('R', DOOR_R_, GLASS_R)):
        out[f'Door_{s}'] = panel_object(bm, {d}, f'Door_{s}_skin')
        out[f'Door_{s}_glass'] = panel_object(bm, {g}, f'Door_{s}_glass', gap=False)
    for k, ob in out.items():
        thicken(ob, 2, .005 if 'glass' in k.lower() else .014, inner=k.startswith('Door') or 'glass' in k.lower())
    return out

def one_body(bm):
    """The dealer-fleet LOD: the cage as one object, no gaps, no thickness."""
    bm.edges.layers.int.new('gap')
    ob = panel_object(bm, set(range(8)), 'Body', gap=False)
    thicken(ob, 0, 0)
    return {'Body': ob}

# ------------------------------------------------------------------ doors
def hinge(side):
    """The door's hinge: low in the A-pillar, the axis tipped so the door rises up and out (dihedral)."""
    p = surface(DOOR_F - .03, J_UPPER, 0, side)
    a = Vector((side * .82, .42, .38)).normalized()
    return p, a

def open_door(objs, side, angle):
    p, a = hinge(side)
    s = 'L' if side > 0 else 'R'
    M = Matrix.Translation(G(p)) @ Matrix.Rotation(angle, 4, G(a) - G(0, 0, 0)) @ Matrix.Translation(-G(p))
    for o in objs:
        if o.name.startswith(f'Door_{s}'): o.matrix_world = M @ o.matrix_world

# ------------------------------------------------------------------ scene
def render(path):
    s = bpy.context.scene
    s.render.engine = 'BLENDER_EEVEE_NEXT'; s.render.resolution_x = int(arg('--w', 1280)); s.render.resolution_y = int(arg('--h', 720))
    s.eevee.taa_render_samples = 32
    s.view_settings.view_transform = 'AgX'
    w = bpy.data.worlds.new('w'); s.world = w; w.use_nodes = True
    nt = w.node_tree; bg = nt.nodes['Background']
    # A soft studio: a bright overhead, a dim horizon, a dark floor bounce (reads panels like a lightbox).
    tex = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tex.outputs['Generated'], sep.inputs[0])
    ramp.color_ramp.elements[0].position = .45; ramp.color_ramp.elements[0].color = (.03, .03, .035, 1)
    ramp.color_ramp.elements[1].position = .62; ramp.color_ramp.elements[1].color = (.9, .92, .95, 1)
    nt.links.new(sep.outputs['Z'], ramp.inputs[0]); nt.links.new(ramp.outputs[0], bg.inputs[0]); bg.inputs[1].default_value = 1.0
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); s.collection.objects.link(sun)
    sun.data.energy = 2.5; sun.rotation_euler = (.9, .2, 2.4)
    for i, (loc, e) in enumerate(((G(0, 5, 0), 900), (G(4, 2.5, 3), 300), (G(-4, 2.5, -3), 300))):
        l = bpy.data.objects.new(f'box{i}', bpy.data.lights.new(f'box{i}', 'AREA')); s.collection.objects.link(l)
        l.data.energy = e; l.data.size = 3; l.location = loc; l.rotation_euler = (G(0, .4, 0) - loc).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.mesh.primitive_plane_add(size=40); fl = bpy.context.active_object
    fm = bpy.data.materials.new('floor'); fm.use_nodes = True
    fm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.2, .205, .21, 1); fm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = .35
    fl.data.materials.append(fm)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); s.collection.objects.link(cam); s.camera = cam
    cam.data.lens = 60
    views = {'q34f': (40, 10, 7.5), 'side': (90, 2, 8.5), 'q34r': (145, 16, 7.5), 'top': (50, 48, 7), 'front': (0, 6, 7),
             'hood': (15, 28, 5), 'nose': (25, 5, 4.2), 'rear': (180, 8, 6), 'low': (60, 0, 6), 'chase': (180, 14, 7.5),
             'engine': (160, 45, 3.6), 'wheel': (75, 3, 3.2), 'door': (60, 15, 5.5), 'doorz': (75, 8, 2.2), 'fangs': (20, 2, 2.0), 'lowr': (140, 2, 5.5), 'rq': (215, 12, 5), 'fq': (330, 8, 5)}
    names = (arg('--views') or 'q34f,side,q34r,top,front').split(',')
    base, ext = os.path.splitext(path)
    target = {'doorz': G(.9, .55, -.35), 'fangs': G(.4, .32, 2.2), 'engine': G(0, .7, -1.5), 'wheel': G(.9, .4, 1.41), 'rq': G(0, .5, -1.6), 'fq': G(0, .5, 1.5)}
    for name in names:
        if name not in views: continue
        yaw, pitch, dist = views[name]
        yr, pr = math.radians(yaw), math.radians(pitch)
        t = target.get(name, G(0, .55, 0))
        # yaw 0 looks from the front (+z), 90 from the left (+x).
        p = t + G(math.sin(yr) * math.cos(pr) * dist, math.sin(pr) * dist, math.cos(yr) * math.cos(pr) * dist)
        cam.location = p
        d = (t - p); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        s.render.filepath = f'{base}-{name}{ext}'
        bpy.ops.render.render(write_still=True)

def export(objs, path=None):
    path = path or GLB
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
                              export_materials='EXPORT', export_normals=True, export_texcoords=False, export_cameras=False,
                              export_lights=False, export_extras=True)
    print('EXPORTED', path, os.path.getsize(path))

def tri_count(objs):
    dg = bpy.context.evaluated_depsgraph_get(); n = 0
    for o in objs:
        if o.type != 'MESH': continue
        me = o.evaluated_get(dg).to_mesh(); me.calc_loop_triangles(); n += len(me.loop_triangles); o.evaluated_get(dg).to_mesh_clear()
    return n

def main():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o)
    setup_materials('--light' in ARGS)
    bm, ends, zs = build_shell()
    assign_panels(bm)
    parts = shell_cuts(bm)
    panels = one_body(bm) if LOD else split_panels(bm)
    bm.free()
    objs = list(panels.values())
    if '--no-parts' not in ARGS:
        import aurora_parts; importlib.reload(aurora_parts)
        objs += aurora_parts.build(parts, ends, panels)
        if not LOD:
            import aurora_engine; importlib.reload(aurora_engine)
            objs += aurora_engine.build()
    # Door hinges travel with the doors to the game (glTF extras).
    for o in objs:
        if o.name.startswith('Door_'):
            side = 1 if o.name.startswith('Door_L') else -1
            p, a = hinge(side); o['hinge'] = list(p); o['axis'] = list(a)
    if '--works' in ARGS:
        # The DWN Works kit (aurora_works.py): its own GLB, fitted to these panels.
        import aurora_works; importlib.reload(aurora_works)
        works = aurora_works.build(parts, ends, panels)
        print('WORKS TRIS', tri_count(works), 'OBJECTS', len(works))
        export(works, os.path.join(ROOT, 'assets', 'cars', 'aurora-works.glb'))
        only = arg('--show')
        for o in works:
            if only and not any(k in o.name for k in only.split(',')): o.hide_render = True
    print('TRIS', tri_count(objs), 'OBJECTS', len(objs))
    if '--export' in ARGS: export(objs)
    if '--works' in ARGS: objs += works                  # (renders only: never in aurora.glb)
    if arg('--doors'):
        for s in (1, -1): open_door(objs, s, float(arg('--doors')))
    if '--wheels' in ARGS and (RENDER or arg('--blend')):
        import aurora_wheel; importlib.reload(aurora_wheel); aurora_wheel.preview()
    if RENDER: render(RENDER)
    if arg('--blend'): bpy.ops.wm.save_as_mainfile(filepath=arg('--blend'))

main()
