"""The AURORA's shape: wheel layout, the profile curves, the cross-section and
the panel layout. Shared by aurora.py (the shell) and the parts scripts.

Profiles fitted (2026-09-30) to Peter's image-to-3D Aurora (aurora_car.glb,
scaled to this wheelbase) with ref_measure.py + ref_overlay.py: low and flat, a
short tail under an overhanging wing, a long nose and a forward windshield.
v3 (2026-10-02): a deep sculpted cove down the doors under a blade-sharp
shoulder (after the reference's sides), crisper fender crests.
"""
import math
from aurora_kit import curve, smooth, lerp

ZF, ZR, WX, WR = 1.41, -1.41, .91, .365          # wheel centres and radius (carModels.js)
Z0, Z1 = ZR - .78, ZF + 1.12                     # tail, nose
GZ0, GZ1 = ZR + .26, ZF - .43                    # canopy rear and windshield base
R = WR + .055                                    # arch opening: a tight hypercar arch

# The arches flare 4-8 cm past the reference so they cover the game's tyres (outer edge x 1.04 front, 1.07 rear).
W = curve([(Z0, .87), (Z0 + .1, 1.01), (-1.85, 1.08), (ZR, 1.105), (-1.0, 1.065), (-.72, .98), (-.45, .915), (.35, .905), (.62, .94),
           (1.0, 1.02), (ZF - .1, 1.07), (1.6, 1.065), (1.9, 1.01), (2.1, .95), (2.3, .84), (Z1 - .08, .7), (Z1, .6)])
SILL = curve([(Z0, .24), (Z0 + .2, .2), (Z0 + .45, .165), (-1.0, .15), (0, .15), (1.95, .15), (Z1 - .3, .16), (Z1, .17)])
BELT = curve([(Z0, .74), (Z0 + .1, .83), (-1.85, .865), (-1.6, .9), (ZR, .925), (-1.1, .9), (-.8, .86), (-.5, .8), (.3, .775), (.66, .805),
              (1.0, .855), (ZF, .86), (1.65, .82), (1.85, .745), (2.05, .615), (Z1 - .1, .5), (Z1, .44)])
HOOD = curve([(Z0, .8), (Z0 + .1, .93), (-1.95, .995), (-1.6, 1.015), (GZ0, 1.035), (0, .9), (GZ1, .87), (1.25, .8), (1.45, .78),
              (1.65, .74), (1.85, .69), (2.05, .61), (2.25, .52), (Z1 - .1, .45), (Z1, .42)])
ROOF = curve([(GZ0, 1.05), (-.85, 1.09), (-.45, 1.147), (-.15, 1.168), (.15, 1.162), (.4, 1.13), (.6, 1.06), (.8, .97), (GZ1, .88)])
GW, RW = .77, .48                                # canopy half-widths at its base and roof shoulder

# ---- the section's points, rocker (0) to centre line (NH - 1)
J_ROCK, J_ROCKER, J_SILL, J_COVE0, J_COVE, J_LIP, J_SHOULDER, J_UPPER, J_CREST, J_INNER, J_CHANNEL = range(11)
J_TOP = 11                                       # first of the 5 hood / canopy points
NH = 16
# Face rows (between point j and j + 1) that matter to the cuts and materials:
F_GLASS0, F_GLASS1 = J_TOP, J_TOP + 1            # the canopy's side rows (side glass)
F_ROOF0 = J_TOP + 2                              # roof rows from here to the centre

# ---- panels: the doors (dihedral, with the side glass), the frunk lid, the engine cover
DOOR_F, DOOR_R = GZ1 - .06, ZR + .47             # .92, -.94: the shut lines on the body side
DOOR_GF, DOOR_GR = .3, -.78                      # the door window rows: the A-pillar and the quarter light
WIN_F, WIN_R = .24, -.72                         # the door glass inside its frame
HOOD_R, HOOD_F = 1.06, Z1 - .2                   # frunk lid, from the cowl to just behind the nose lip
ENG_F, ENG_R = GZ0 - .03, Z0 + .13               # engine cover, from the bulkhead to the tail
ENGW_F, ENGW_R = GZ0 - .1, -1.74                 # its glass window over the engine
LOUV_F, LOUV_R = -1.8, -2.0                      # louvres behind the window

def arch(z):
    y = -1
    for zc in (ZF, ZR):
        dz = z - zc
        if abs(dz) < R: y = max(y, WR + math.sqrt(R * R - dz * dz))
    return y

def canopy(z):
    """0 outside the greenhouse, 1 inside it (ramps at the windshield base and the backlight)."""
    return smooth(GZ1 + .005, GZ1 - .3, z) * smooth(GZ0 - .005, GZ0 + .2, z)

def cove(z):
    """How deep the side is scooped in, under the shoulder blade (0 at the arches)."""
    return smooth(.92, .3, z) * smooth(-1.02, -.68, z) * .125

def half_section(z):
    """Control points from the rocker (rolled under) over the top to the centre line."""
    w, s, b, c = W(z), max(SILL(z), arch(z)), BELT(z), HOOD(z)
    k = canopy(z); sc = cove(z); h = b - s
    top = lerp(c, ROOF(min(max(z, GZ0), GZ1)), k)
    side = [(w * .9, s + .012), (w * .94, s), (w * .975 - sc * .2, s + .05),
            (w - sc * .75, s + .24 * h), (w - sc, s + .55 * h),      # the cove: its floor and its deepest line
            (w * .998 - sc * .12, s + .8 * h),                       # the lip: a sharp blade where the cove meets the shoulder
            (w * .993, s + .9 * h), (w * .955, s + .968 * h)]
    # Fender crest, its inner edge, the channel: relative to the width outside, to the canopy inside.
    out = [(w * .89, b), (w * .765, b - .045), (w * .62, min(b, c) - .004)]
    inn = [(GW + (w - GW) * .72, b), (GW + (w - GW) * .45, b - .006), (GW + (w - GW) * .2, b - .012)]
    mid = [(lerp(o[0], i[0], k), lerp(o[1], i[1], k)) for o, i in zip(out, inn)]
    hood = [(w * .52, c), (w * .39, c + .012), (w * .26, c + .018), (w * .13, c + .021), (0, c + .022)]
    base = b - .015
    cab = [(GW, base), (GW * .93 + RW * .07, base + (top - base) * .5), (RW + .05, top - .035), (RW * .6, top - .004), (0, top + .006)]
    top5 = [(lerp(h_[0], q[0], k), lerp(h_[1], q[1], k)) for h_, q in zip(hood, cab)]
    return side + mid + top5          # 8 + 3 + 5 = 16 points, the last on the centre line

def sweep_z(z, x):
    """Stations near the ends bend back at the sides, so the nose and tail are round in plan."""
    w = W(z); u = min(1, abs(x) / w) ** 2
    return z - .09 * smooth(Z1 - .55, Z1, z) * u + .09 * smooth(Z0 + .45, Z0, z) * u

def ring(z):
    h = half_section(z)
    return [(x, y) for x, y in h] + [(-x, y) for x, y in reversed(h[:-1])]

def surface(z, j, t=0.0, side=1):
    """A point on the (unsubdivided) cage: between section points j and j + 1 at t, at station z (game coords)."""
    h = half_section(z); a, b = h[j], h[min(j + 1, len(h) - 1)]
    x, y = lerp(a[0], b[0], t), lerp(a[1], b[1], t)
    return (x * side, y, sweep_z(z, x))
