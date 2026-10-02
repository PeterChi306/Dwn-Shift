"""AURORA engine bay (2026-10-02): the 5.0 twin-turbo V8 from Peter's board,
seen through the engine cover's window and louvres.

A tub lined with gold heat foil behind a carbon firewall; the block and heads in
a dark cast finish; carbon cam covers with lettering and red coil packs; a carbon
plenum fed by the roof scoop's duct through a throttle body, eight runners into
the heads; heat-blued equal-length headers into two turbos with foil blankets;
a polished strut brace with blue fittings; dry-sump and coolant tanks with
yellow caps; the transaxle and the driveshafts.

Game space (+z forward, +x left, y up); the bay runs from the cabin bulkhead
(GZ0) back to the tail, between the rear arches.
"""
import math
from mathutils import Vector, Matrix
from aurora_kit import *
from aurora_shape import *

BAY_F, BAY_R, BAY_X, BAY_Y = GZ0 - .03, Z0 + .24, .6, .2

def rod(me, pts, r, m, seg=12):
    prof = [(math.cos(TAU * i / seg) * r, math.sin(TAU * i / seg) * r) for i in range(seg)]
    Vv, F = sweep(resample([Vector(p) for p in pts], max(2, len(pts) * 4)) if len(pts) > 2 else [Vector(p) for p in pts], prof)
    me.add(Vv, F, m)

def build():
    out = []
    # ---- the tub: floor, gold-foil walls, carbon firewall, a dark rear bulkhead
    bay = Mesh()
    ceil = lambda z: HOOD(z) - .05
    floor = [Vector((x, BAY_Y, z)) for x, z in ((BAY_X, BAY_F), (-BAY_X, BAY_F), (-BAY_X, BAY_R), (BAY_X, BAY_R))]
    bay.add(floor, [[0, 3, 2, 1]], 'bay')
    out.append(bay.obj('BayFloor', smooth=False))
    walls = Mesh()
    nz = 12
    for s in (1, -1):
        Vv = []; F = []
        for i in range(nz + 1):
            z = BAY_F + (BAY_R - BAY_F) * i / nz
            Vv += [Vector((s * BAY_X, .46, z)), Vector((s * BAY_X, ceil(z), z))]
        for i in range(nz): F.append([2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1] if s > 0 else [2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2])
        walls.add(Vv, F, 'foil')
    out.append(walls.obj('BayFoil', smooth=False))
    low = Mesh()                                   # below the foil, out of sight of the arches: plain black
    for s in (1, -1):
        Vv = [Vector((s * BAY_X, BAY_Y, BAY_F)), Vector((s * BAY_X, BAY_Y, BAY_R)), Vector((s * BAY_X, .46, BAY_R)), Vector((s * BAY_X, .46, BAY_F))]
        low.add(Vv, [[0, 1, 2, 3] if s > 0 else [3, 2, 1, 0]], 'bay')
    out.append(low.obj('BayWalls', smooth=False))
    fw = Mesh()
    Vv = [Vector((BAY_X, BAY_Y, BAY_F)), Vector((-BAY_X, BAY_Y, BAY_F)), Vector((-BAY_X, ceil(BAY_F), BAY_F)), Vector((BAY_X, ceil(BAY_F), BAY_F))]
    fw.add(Vv, [[0, 1, 2, 3]], 'carbon')
    Vv = [Vector((BAY_X, BAY_Y, BAY_R)), Vector((-BAY_X, BAY_Y, BAY_R)), Vector((-BAY_X, ceil(BAY_R), BAY_R)), Vector((BAY_X, ceil(BAY_R), BAY_R))]
    fw.add(Vv, [[3, 2, 1, 0]], 'bay')
    out.append(fw.obj('BayBulkheads', smooth=False))
    if LOD: return out

    eng = Mesh(); carbon = Mesh(); heat = Mesh(); bright = Mesh()
    zf, zb = BAY_F - .06, -1.8                # the block: timing cover end to bell housing
    L_ = zf - zb; zc = (zf + zb) / 2
    # ---- block and sump
    Vv, F = rbox(.42, .26, L_, .03, 2); eng.add(Vv, F, 'engine', T(0, .37, zc))
    Vv, F = rbox(.36, .1, L_ * .9, .02, 2); eng.add(Vv, F, 'engine', T(0, .22, zc))
    # ribs along the block's flanks
    for s in (1, -1):
        for k in range(6):
            Vv, F = rbox(.012, .2, .012, .004, 1); eng.add(Vv, F, 'engine', T(s * .212, .37, zb + .05 + k * (L_ - .1) / 5))
    # timing cover with the cam drives
    Vv, F = rbox(.5, .42, .04, .02, 2); eng.add(Vv, F, 'engine', T(0, .48, zf + .01))
    for s in (1, -1):
        Vv, F = cyl(.055, .02, 28, 0); eng.add(Vv, F, 'alu', T(s * .2, .63, zf + .03))
    Vv, F = cyl(.07, .03, 32, 0); eng.add(Vv, F, 'alu', T(0, .34, zf + .03))
    # ---- heads, at 45 degrees either side
    for s in (1, -1):
        Mh = T(s * .2, .56, zc) @ Rot('Z', -s * math.pi / 4)
        Vv, F = rbox(.2, .13, L_ * .96, .02, 2); eng.add(Vv, F, 'engine', Mh)
        # Cam cover: carbon, two lengthwise ribs, lettering, four coil packs per side... this bank has four cylinders.
        Mc = Mh @ T(0, .085, 0)
        Vv, F = rbox(.18, .05, L_ * .92, .018, 3); carbon.add(Vv, F, 'carbon', Mc)
        for dx in (-.06, .06):
            Vv, F = rbox(.012, .012, L_ * .8, .004, 1); carbon.add(Vv, F, 'carbon', Mc @ T(dx, .028, 0))
        for k in range(4):
            zk = zb + .08 + k * (L_ - .16) / 3
            Vv, F = rbox(.05, .03, .045, .008, 2); bright.add(Vv, F, 'red', Mh @ T(0, .125, zk - zc))
            Vv, F = cyl(.006, .03, 8, 0); bright.add(Vv, F, 'black', Mh @ T(.02, .14, zk - zc) @ Rot('Y', math.pi / 2))
        # the lettering on the cover's top
        Vv, F = text_mesh('AURORA', .034, .002, 'wide')
        bright.add(Vv, F, 'white', Mc @ T(0, .026, 0) @ Rot('Y', math.pi / 2 * (1 if s > 0 else -1)) @ Rot('X', -math.pi / 2) @ T(0, 0, 0))
        # fuel rail along the inner side
        rod(bright, [(s * .1, .64, zf - .02), (s * .1, .64, zb + .02)], .009, 'alu')
    # ---- intake: carbon plenum on top, eight runners, throttle body, the roof duct
    Vv, F = rbox(.16, .1, L_ * .86, .04, 3); carbon.add(Vv, F, 'carbon', T(0, .77, zc - .02))
    Vv, F = text_mesh('V8 BITURBO', .022, .002, 'wide')
    bright.add(Vv, F, 'white', T(0, .821, zc - .02) @ Rot('X', -math.pi / 2) @ Rot('Z', math.pi))
    for s in (1, -1):
        for k in range(4):
            zk = zb + .08 + k * (L_ - .16) / 3
            rod(carbon, [(s * .07, .76, zk), (s * .12, .73, zk), (s * .15, .66, zk)], .022, 'carbon', 14)
    Vv, F = cyl(.045, .07, 28, 0); bright.add(Vv, F, 'alu', T(0, .79, zf - .05) @ Rot('X', 0))
    rod(carbon, [(0, .8, zf), (0, .86, zf + .03), (0, ceil(BAY_F) - .02, BAY_F + .02)], .05, 'carbon', 18)
    # ---- headers, turbos and downpipes
    for s in (1, -1):
        tz, ty, tx = zb - .1, .52, s * .4
        for k in range(4):
            zk = zb + .08 + k * (L_ - .16) / 3
            p0 = Vector((s * .3, .52, zk)); p1 = Vector((s * .37, .44, zk - .02)); p2 = Vector((s * .4, .38, (zk + tz) / 2 - .02 * k)); p3 = Vector((tx, ty - .1, tz + .05))
            rod(heat, bezier(p0, p1, p2, p3, 10), .017, 'heat', 10)
        # Turbo: a foil-wrapped turbine scroll, an alloy compressor, the intake pipe forward.
        Mt = T(tx, ty, tz) @ Rot('Y', math.pi / 2)
        Vv, F = lathe([(.0, -.05), (.05, -.055), (.075, -.035), (.08, .0), (.075, .035), (.05, .055), (.0, .05)], 28)
        heat.add(Vv, F, 'foil', Mt @ T(0, 0, -.05 * s))
        Vv, F = lathe([(.0, -.04), (.055, -.04), (.07, -.015), (.07, .02), (.045, .04), (.035, .07), (.0, .07)], 28)
        bright.add(Vv, F, 'alu', Mt @ T(0, 0, .04 * s) @ Rot('Y', 0 if s > 0 else math.pi))
        rod(bright, [(tx - s * .0, ty + .07, tz), (tx, ty + .2, tz + .15), (s * .3, ty + .26, zc)], .03, 'alu', 16)
        # Downpipe back to the tips.
        rod(heat, [(tx, ty - .08, tz), (s * .25, .48, tz - .08), (s * .12, .47, Z0 + .45)], .03, 'heat', 14)
        # Blue anodised clamps on the charge pipe.
        Vv, F = lathe([(.034, 0), (.036, .006), (.034, .012)], 20); bright.add(Vv, F, 'blue', frame(Vector((tx, ty + .2, tz + .15)), Vector((-s * .1, .06, .9))))
    # ---- strut brace over the engine
    rod(bright, [(.56, .9, -1.5), (-.56, .9, -1.5)], .016, 'alu', 16)
    for s in (1, -1):
        Vv, F = rbox(.06, .03, .08, .008, 2); bright.add(Vv, F, 'blue', T(s * .56, .89, -1.5))
        for dz in (-.025, .025):
            Vv, F = cyl(.006, .012, 6, 0); bright.add(Vv, F, 'steel', T(s * .56, .905, -1.5 + dz) @ Rot('X', -math.pi / 2))
    Vv, F = rbox(.12, .012, .06, .004, 2); bright.add(Vv, F, 'carbon', T(0, .915, -1.5))
    # ---- tanks with yellow caps at the bay's front corners
    for s, (r_, h_, m) in ((1, (.055, .16, 'alu')), (-1, (.05, .12, 'white'))):
        p = Vector((s * .48, .62, BAY_F - .1))
        Vv, F = cyl(r_, h_, 28, 0); bright.add(Vv, F, m, T(*p) @ Rot('X', -math.pi / 2))
        Vv, F = cyl(.022, .025, 20, 0); bright.add(Vv, F, 'yellow', T(p.x, p.y + h_, p.z) @ Rot('X', -math.pi / 2))
    # ---- transaxle, driveshafts with CV boots
    Vv, F = rbox(.32, .26, .24, .04, 2); eng.add(Vv, F, 'engine', T(0, .36, zb - .1))
    Vv, F = rbox(.24, .2, .04, .02, 2); eng.add(Vv, F, 'alu', T(0, .37, zb - .22))
    for s in (1, -1):
        rod(eng, [(s * .2, WR, ZR), (s * .66, WR, ZR)], .018, 'steel')
        for x0 in (.26, .6):
            Vv, F = lathe([(.02, 0), (.04, .015), (.03, .03), (.045, .045), (.03, .06), (.022, .075)], 16)
            eng.add(Vv, F, 'rubber', T(s * x0, WR, ZR) @ Rot('Y', s * math.pi / 2))
    # ---- wiring looms and coolant hoses
    for s in (1, -1):
        rod(bright, [(s * .05, .7, zf - .03), (s * .2, .72, zf - .1), (s * .26, .7, zc), (s * .22, .7, zb + .05)], .006, 'black', 8)
        rod(bright, [(s * .2, .4, zf + .02), (s * .45, .35, zf - .05), (s * .55, .4, -1.45)], .016, 'rubber', 10)
    out += [eng.obj('Engine'), carbon.obj('EngineCarbon'), heat.obj('EngineHeat'), bright.obj('EngineDress')]
    for o in out[-4:-1]: bevel(o, .0025, 1, 50)
    return out
