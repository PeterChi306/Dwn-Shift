"""Trace the supplied Los Santerra map. Pixels are the authoritative layout space.

Road names are fictionalized labels. Fine grids are selected/simplified traces;
no connection is created merely because a freeway crosses a surface street.

Terrain is an authored interpretation of the reference's mountain bands: named
crest polylines with a Gaussian cross-section, a gentle rolling basin, and a
detail band that only bites on high ground. `world/network.js` mirrors this
function exactly; `tools/check_network.mjs` verifies the two agree against the
`heightSamples` table emitted below.
"""
import json, math
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCALE = 10.0

# ---------------------------------------------------------------- terrain ---
# Terrain lives in tools/terrain.py so that this builder, the heightmap bake for
# Unreal and the browser mirror in world/network.js all describe one landscape.
from terrain import CRESTS, MAP_H, MAP_W, MOUNT_LEE, height, relief_at   # noqa: E402


# ------------------------------------------------------------------ roads ---
roads = []


def add(name, points, kind='avenue', layer='surface', **kw):
    roads.append(dict(id=len(roads), name=name, points=points, kind=kind, layer=layer, **kw))


# Major surface corridors, traced west to east / north to south against the image.
add('Sunset Boulevard', [(155, 507), (195, 477), (242, 468), (292, 466), (337, 454), (400, 449), (480, 445), (561, 446), (625, 441), (680, 430), (735, 423), (788, 400), (836, 367), (864, 327)])
add('Santa Monica Boulevard', [(151, 563), (208, 521), (264, 492), (335, 483), (424, 484), (516, 486), (603, 490), (666, 510), (715, 548), (746, 580)])
add('Wilshire Boulevard', [(156, 630), (231, 621), (311, 626), (410, 632), (516, 634), (615, 635), (706, 625), (756, 608)], 'boulevard')
add('Beverly Boulevard', [(165, 558), (230, 550), (320, 549), (417, 550), (514, 552), (610, 557), (705, 568)])
add('Melrose Avenue', [(200, 511), (285, 511), (377, 511), (470, 511), (560, 512), (653, 519)])
add('Hollywood Boulevard', [(207, 406), (310, 403), (414, 403), (510, 405), (578, 411), (640, 411), (695, 410), (752, 402)])
add('Fountain Avenue', [(208, 425), (310, 424), (420, 424), (524, 427), (608, 428)])
add('Doheny Drive', [(229, 472), (228, 510), (229, 550), (231, 590), (231, 621), (228, 681), (219, 723)])
add('Rodeo Drive', [(287, 478), (287, 511), (287, 550), (287, 592), (288, 624)])
add('Beverly Drive', [(327, 471), (325, 511), (324, 550), (322, 591), (320, 626)])
add('Canon Drive', [(355, 470), (354, 511), (355, 550), (353, 591), (352, 627)])
add('La Cienega Boulevard', [(419, 343), (418, 403), (419, 449), (420, 511), (420, 550), (420, 633), (420, 710), (420, 745)])
add('Fairfax Avenue', [(543, 342), (546, 406), (547, 446), (546, 511), (548, 552), (549, 635), (549, 707), (548, 746)])
add('La Brea Avenue', [(601, 373), (603, 411), (605, 446), (607, 490), (609, 557), (610, 635), (611, 714), (610, 747)])
add('Western Avenue', [(655, 432), (658, 486), (660, 534), (663, 584), (665, 635), (668, 697), (671, 743), (674, 874)])
add('Vermont Avenue', [(699, 497), (700, 555), (705, 606), (710, 657), (712, 707), (708, 752), (703, 880)])
add('Normandie Avenue', [(678, 466), (680, 530), (682, 600), (684, 668), (686, 736), (684, 820)], 'street')
add('Pico Boulevard', [(170, 687), (280, 689), (391, 694), (500, 698), (611, 700), (711, 701)])
add('Olympic Boulevard', [(172, 658), (279, 659), (388, 663), (498, 665), (610, 667), (710, 659)])
add('Venice Boulevard', [(131, 720), (235, 714), (332, 716), (427, 722), (527, 724), (612, 728), (708, 745)])
add('Culver Boulevard', [(141, 792), (226, 775), (309, 774), (396, 792), (492, 797), (605, 791), (692, 795)])
add('Exposition Boulevard', [(182, 838), (304, 838), (423, 838), (540, 838), (690, 838)])
add('Jefferson Boulevard', [(196, 870), (320, 872), (446, 874), (568, 876), (688, 878)], 'street')
add('Washington Boulevard', [(160, 756), (268, 754), (378, 757), (486, 760), (596, 764), (700, 772)], 'street')

# Eastern street network: Pasadena has its own fine orthogonal grid.
add('Colorado Boulevard', [(843, 218), (888, 214), (940, 215), (991, 215), (1040, 216), (1092, 217), (1143, 221), (1200, 233), (1270, 237)], 'boulevard')
add('Walnut Street', [(843, 167), (895, 163), (952, 164), (1005, 164), (1060, 165), (1110, 170), (1153, 183)])
add('Del Mar Boulevard', [(862, 270), (923, 271), (982, 271), (1040, 273), (1096, 273), (1144, 275), (1194, 289)])
add('California Boulevard', [(869, 303), (929, 304), (984, 305), (1041, 310), (1092, 316), (1147, 326), (1192, 347), (1262, 377)])
add('Huntington Drive', [(1039, 337), (1094, 351), (1144, 368), (1210, 390), (1289, 410), (1370, 420), (1455, 430)], 'boulevard')
add('San Marino Avenue', [(1225, 215), (1222, 255), (1231, 295), (1215, 340), (1210, 390), (1196, 444), (1194, 512), (1193, 584)])
add('Oak Knoll Avenue', [(1102, 219), (1097, 255), (1096, 273), (1092, 316), (1094, 351), (1110, 389)], 'residential')
add('Sierra Madre Boulevard', [(1153, 183), (1145, 221), (1144, 275), (1151, 310), (1147, 326), (1144, 368)])
add('Fair Oaks Avenue', [(884, 74), (888, 124), (888, 164), (888, 214), (889, 271), (892, 305), (917, 351), (946, 389)])
add('Lake Avenue', [(994, 78), (992, 122), (991, 164), (991, 215), (990, 271), (992, 307)])
add('Hill Avenue', [(1084, 123), (1086, 166), (1092, 217), (1096, 273)])
add('Arroyo Parkway', [(936, 216), (935, 271), (936, 307), (957, 345), (990, 373), (1008, 409), (1027, 446)])
add('Eagle Rock Boulevard', [(903, 345), (928, 380), (963, 407), (1000, 425), (1040, 434), (1100, 437), (1194, 444), (1260, 445)])
add('Alhambra Road', [(1100, 437), (1100, 476), (1100, 521), (1100, 573), (1100, 625)])
add('Valley Boulevard', [(1120, 492), (1194, 490), (1250, 487), (1320, 486), (1390, 486), (1480, 487)], 'boulevard')
add('Monterey Road', [(1000, 554), (1056, 573), (1100, 573), (1193, 575), (1280, 577), (1375, 573), (1460, 573)])
add('Garvey Avenue', [(1110, 660), (1193, 660), (1280, 660), (1370, 660), (1453, 659)])
add('Atlantic Boulevard', [(1260, 393), (1260, 445), (1250, 487), (1250, 531), (1251, 577), (1250, 625), (1250, 660), (1252, 729), (1260, 820)])
add('El Monte Avenue', [(1400, 434), (1400, 486), (1400, 530), (1397, 573), (1398, 606)])
add('Silver Lake Boulevard', [(644, 366), (695, 383), (735, 423), (779, 449), (824, 465), (861, 489), (885, 529), (904, 571)])
add('Glendale Boulevard', [(841, 367), (836, 407), (824, 443), (811, 479), (819, 530), (832, 575)])
add('Echo Park Avenue', [(906, 406), (900, 444), (880, 483), (887, 523), (904, 571), (932, 606)])
add('Temple Street', [(746, 580), (789, 567), (832, 575), (871, 592), (917, 615), (966, 646), (1020, 676)])
add('Figueroa Street', [(810, 582), (821, 628), (828, 673), (822, 720), (807, 771), (791, 820), (784, 894)])
add('Broadway', [(885, 579), (906, 610), (938, 645), (963, 681), (984, 723), (1000, 766)])
add('Main Street', [(929, 566), (955, 603), (984, 641), (1012, 682), (1039, 724), (1061, 769)])
add('Alameda Street', [(995, 546), (1021, 587), (1048, 629), (1076, 675), (1087, 723), (1086, 769)])
add('First Street', [(811, 602), (867, 588), (923, 583), (983, 585), (1047, 592), (1102, 615)])
add('Seventh Street', [(792, 702), (838, 697), (893, 687), (947, 676), (1009, 666), (1068, 656)])
add('Whittier Boulevard', [(1060, 770), (1150, 777), (1240, 789), (1320, 810), (1410, 837)])

# Grids sampled from visible districts; each crosses the traced arterial streets.
for y in [365, 385, 465, 530, 574, 601, 647, 675]:
    if y < 440:
        add('Westside neighborhood street', [(235, y), (565, y)], 'street')
    elif y > 530:
        add('Westside neighborhood street', [(245, y), (698, y)], 'street')
for x in [260, 380, 460, 495, 580, 630]:
    add('Westside cross street', [(x, 455 if x < 400 else 385), (x, 695)], 'street')
# Mid-City / Exposition Park / Culver City fill the southwest quarter of the map.
for y in [712, 740, 768, 800, 824, 856]:
    add('Mid-City street', [(196, y), (700, y)], 'street')
for x in [212, 272, 336, 470, 520, 660]:
    add('South Los Santerra street', [(x, 700), (x, 890)], 'street')
for y in [91, 115, 141, 190, 242, 286]:
    add('Pasadena neighborhood street', [(873, y), (1110, y)], 'street')
for x in [914, 958, 1020, 1056]:
    add('Pasadena cross street', [(x, 78), (x, 310)], 'street')
for y in [258, 291, 322, 355]:
    add('San Marino garden street', [(1150, y), (1190, y + 2), (1222, y + 7), (1260, y + 3), (1308, y - 8)], 'residential')
for x in [1174, 1250, 1285]:
    add('San Marino residential lane', [(x, 235), (x + 5, 265), (x - 5, 300), (x + 4, 338), (x, 380)], 'residential')
for y in [460, 515, 545, 600, 686, 711]:
    add('Eastside local avenue', [(1140, y), (1455, y)], 'street')
for x in [1160, 1220, 1310, 1350, 1430]:
    add('Eastside local street', [(x, 435), (x, 730)], 'street')
# Koreatown and Hancock Park sit between the Westside grid and Downtown.
for y in [556, 590, 622, 656, 690]:
    add('Koreatown street', [(640, y), (760, y)], 'street')
# Eagle Rock and Highland Park, north east of Downtown.
for y in [398, 424, 452]:
    add('Eagle Rock street', [(950, y), (1096, y)], 'street')
for x in [980, 1024, 1064]:
    add('Eagle Rock lane', [(x, 388), (x, 470)], 'residential')

# Hills trace the mountain roads, rather than extending a city grid into terrain.
add('Mulholland Crest', [(155, 348), (180, 297), (223, 264), (260, 233), (289, 210), (329, 221), (375, 244), (420, 252), (456, 265), (490, 253), (530, 248), (570, 224), (619, 211), (670, 190), (733, 174)], 'scenic')
add('Laurel Canyon Road', [(375, 454), (373, 412), (375, 374), (389, 334), (405, 300), (420, 270), (420, 252)], 'scenic')
add('Laurel Tunnel Road', [(405, 300), (447, 291), (476, 270), (490, 253)], 'tunnel')
add('Verdugo Crest Road', [(733, 174), (769, 196), (782, 242), (789, 288), (831, 313), (864, 327)], 'scenic')
add('Angeles Forest Road', [(1270, 237), (1281, 204), (1296, 180), (1321, 162), (1355, 151)], 'scenic')
# Mount Lee: the summit road to the sign, the overlook, and the dirt way down.
add('Mount Lee Summit Road', [(619, 211), (628, 197), (641, 188), (652, 181), (661, 172)], 'scenic')
add('Mount Lee Fire Road', [(661, 172), (682, 163), (704, 167), (719, 181), (733, 174)], 'dirt')
add('Verdugo Fire Road', [(420, 252), (452, 214), (490, 186), (528, 168), (566, 178), (600, 196), (619, 211)], 'dirt')
add('Arroyo Seco Fire Road', [(903, 345), (884, 312), (868, 280), (862, 248), (872, 214)], 'dirt')
add('Chantry Fire Road', [(1355, 151), (1390, 132), (1428, 124), (1466, 138)], 'dirt')
# Cahuenga Pass climbs out of Hollywood and bores through the ridge to the crest.
# Underpasses are not authored here; they are detected below wherever a surface
# street actually passes beneath a freeway deck.
add('Cahuenga Pass Road', [(640, 411), (636, 380), (628, 352), (620, 330)], 'scenic')
add('Cahuenga Tunnel', [(620, 330), (618, 300), (620, 272)], 'tunnel')
add('Cahuenga Summit Road', [(620, 272), (619, 240), (619, 211)], 'scenic')

# Separate grade layers prevent phantom freeway junctions. Ramps below connect them.
add('134 · Ventura Freeway', [(265, 233), (330, 239), (407, 247), (456, 249), (510, 270), (567, 267), (606, 243), (650, 220), (710, 202), (769, 183), (812, 168), (853, 172), (884, 204)], 'freeway', '134')
add('210 · Foothill Freeway', [(737, 36), (783, 56), (828, 64), (879, 65), (930, 66), (984, 68), (1030, 72), (1053, 91), (1088, 111), (1150, 116), (1210, 126), (1268, 144), (1325, 175), (1393, 203), (1460, 210)], 'freeway', '210')
add('101 · Hollywood Freeway', [(735, 27), (745, 76), (779, 118), (812, 168), (835, 218), (854, 268), (876, 322), (885, 367), (922, 405), (964, 439), (1000, 481), (1027, 531), (1060, 578), (1080, 625)], 'freeway', '101')
add('Hollywood Connector', [(456, 249), (527, 251), (575, 279), (600, 324), (632, 365), (672, 386), (698, 426), (724, 467), (761, 510), (807, 552), (838, 575)], 'freeway', 'hollywood')
add('10 · Santa Monica Freeway', [(20, 759), (130, 741), (242, 744), (352, 733), (448, 737), (546, 746), (648, 748), (708, 746), (750, 772), (801, 805), (856, 821), (919, 810), (974, 781), (1039, 756), (1109, 744), (1185, 737), (1270, 728), (1367, 726), (1490, 713)], 'freeway', '10')
add('110 · Arroyo Freeway', [(1008, 409), (975, 459), (938, 511), (888, 549), (841, 583), (814, 638), (808, 694), (795, 741), (750, 772), (721, 819), (699, 874), (681, 945)], 'freeway', '110')
add('10 · San Bernardino Freeway', [(1080, 625), (1170, 627), (1255, 624), (1340, 624), (1402, 604), (1454, 589), (1490, 592)], 'freeway', 'east10')

# Each ramp endpoint is snapped to its named road before segmentation.
ramps = [
    ('Sunset / 101 ramp', 'Sunset Boulevard', (680, 430), 'Hollywood Connector', (698, 426)),
    ('Hollywood / 101 ramp', 'Hollywood Boulevard', (695, 410), 'Hollywood Connector', (698, 426)),
    ('Pasadena / 210 ramp', 'Lake Avenue', (994, 78), '210 · Foothill Freeway', (984, 68)),
    ('Arroyo / 101 ramp', 'Arroyo Parkway', (936, 307), '101 · Hollywood Freeway', (876, 322)),
    ('Eagle Rock / 110 ramp', 'Eagle Rock Boulevard', (1000, 425), '110 · Arroyo Freeway', (1008, 409)),
    ('Fairfax / 10 ramp', 'Fairfax Avenue', (548, 746), '10 · Santa Monica Freeway', (546, 746)),
    ('Downtown / 110 ramp', 'Figueroa Street', (807, 771), '110 · Arroyo Freeway', (795, 741)),
    ('Valley / 10 ramp', 'Atlantic Boulevard', (1250, 625), '10 · San Bernardino Freeway', (1255, 624)),
    ('La Cienega / 10 ramp', 'La Cienega Boulevard', (420, 745), '10 · Santa Monica Freeway', (448, 737)),
    ('Western / 10 ramp', 'Western Avenue', (671, 743), '10 · Santa Monica Freeway', (648, 748)),
    ('Vermont / 110 ramp', 'Vermont Avenue', (708, 752), '110 · Arroyo Freeway', (721, 819)),
    ('Huntington / 10 ramp', 'Atlantic Boulevard', (1252, 729), '10 · San Bernardino Freeway', (1255, 624)),
    ('Mulholland / 134 ramp', 'Mulholland Crest', (456, 265), '134 · Ventura Freeway', (456, 249)),
    ('Verdugo / 134 ramp', 'Verdugo Crest Road', (769, 196), '134 · Ventura Freeway', (769, 183)),
    ('101 to 134', '101 · Hollywood Freeway', (835, 218), '134 · Ventura Freeway', (853, 172)),
    ('101 to 210', '101 · Hollywood Freeway', (745, 76), '210 · Foothill Freeway', (783, 56)),
    ('101 to 10', '101 · Hollywood Freeway', (1060, 578), '10 · San Bernardino Freeway', (1170, 627)),
    ('110 to 10', '110 · Arroyo Freeway', (795, 741), '10 · Santa Monica Freeway', (708, 746)),
    ('San Marino / 210 ramp', 'San Marino Avenue', (1225, 215), '210 · Foothill Freeway', (1210, 126)),
]


def proj(p, a, b):
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    v = dx * dx + dy * dy
    t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / v)) if v else 0
    q = (a[0] + t * dx, a[1] + t * dy)
    return (sum((p[i] - q[i]) ** 2 for i in [0, 1]), q, t)


def snap(name, p):
    r = next(r for r in roads if r['name'] == name)
    best = min(((*proj(p, a, b), i) for i, (a, b) in enumerate(zip(r['points'], r['points'][1:]))), key=lambda x: x[0])
    _, q, t, i = best
    r['points'].insert(i + 1, q)
    return q, r['layer']


for name, an, a, bn, b in ramps:
    a, al = snap(an, a)
    b, bl = snap(bn, b)
    # Coincident grade transitions need length to interpolate their deck heights.
    if math.dist(a, b) < 4:
        a, al = snap(an, (a[0] - 12, a[1] - 12))
    mid = ((a[0] + b[0]) / 2 + 7, (a[1] + b[1]) / 2 + 4)
    add(name, [a, mid, b], 'ramp', 'ramp-' + name, endLayers=[al, bl])

# ------------------------------------------------------- generated network ---
# The traced arterials above are the skeleton. The map is not detailed enough to
# trace street by street, so the dense grids, the canyon roads and the hillside
# estates are generated from the map's structure in tools/roadgen.py. They go
# through every pass below exactly as the traced roads do, which is what makes
# their junctions real: any two roads that cross on the same layer get cut at
# the crossing and share a node there.
from roadgen import generate as _generate_roads   # noqa: E402

# Everything traced by hand above is authored intent: the 101 ending where the
# map ends, a boulevard stopping at the coast. Leaf pruning must never eat those,
# only the generated grid's loose ends.
TRACED_ROAD_IDS = {r['id'] for r in roads}

_generate_roads(add, list(roads))


# ---------------------------------------------------------- parallel dedupe ---
# The district polygons in regions.py overlap -- West Hollywood spans x 215-565
# and Beverly Hills 228-425, so the same ground belongs to both. Each district
# lays its own grid there at its own spacing and angle, and the result is pairs
# of roads a few metres apart running the same way: two road surfaces on one
# street, which is what makes the map read as doubled up and messy.
#
# This drops a road that is mostly a duplicate of one already kept. Traced roads
# are considered first and never dropped, then the longest generated roads, so
# what survives is the through road rather than the fragment beside it.
DUP_DIST = 2.0            # px = 20 m: closer than this is the same street, not a
                          # neighbouring one -- city blocks here are 100 m plus
DUP_BEARING = 0.966       # cos(15 degrees): running the same way
DUP_SHARE = 0.65          # this much of a road being a duplicate condemns it


def dedupe_parallels():
    def bearing(a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        n = math.hypot(dx, dy)
        return (dx / n, dy / n) if n > 1e-9 else (0.0, 0.0)

    def length(pts):
        return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))

    order = sorted(roads, key=lambda r: (r['id'] not in TRACED_ROAD_IDS,
                                         -length(r['points'])))
    cell = 4.0
    grid = defaultdict(list)
    kept, dropped = [], 0

    def index(pts):
        for a, b in zip(pts, pts[1:]):
            u = bearing(a, b)
            for cx in range(int(min(a[0], b[0]) // cell), int(max(a[0], b[0]) // cell) + 1):
                for cy in range(int(min(a[1], b[1]) // cell), int(max(a[1], b[1]) // cell) + 1):
                    grid[(cx, cy)].append((a, b, u))

    for r in order:
        pts = r['points']
        if r['id'] in TRACED_ROAD_IDS or len(pts) < 2:
            kept.append(r)
            index(pts)
            continue
        # Sample along the road and ask how much of it lies on top of something.
        probes = []
        for i in range(len(pts) - 1):
            probes.append((pts[i], bearing(pts[i], pts[i + 1])))
        probes.append((pts[-1], probes[-1][1]))
        hits = 0
        for q, u in probes:
            cx, cy = int(q[0] // cell), int(q[1] // cell)
            found = False
            for ox in (-1, 0, 1):
                for oy in (-1, 0, 1):
                    for a, b, v in grid.get((cx + ox, cy + oy), ()):
                        if abs(u[0] * v[0] + u[1] * v[1]) < DUP_BEARING:
                            continue
                        ex, ey = b[0] - a[0], b[1] - a[1]
                        L = ex * ex + ey * ey
                        t = 0.0 if L == 0 else max(0.0, min(1.0, ((q[0] - a[0]) * ex
                                                                  + (q[1] - a[1]) * ey) / L))
                        if math.hypot(q[0] - (a[0] + ex * t), q[1] - (a[1] + ey * t)) < DUP_DIST:
                            found = True
                            break
                    if found:
                        break
                if found:
                    break
            hits += found
        if probes and hits / len(probes) > DUP_SHARE:
            dropped += 1
            continue
        kept.append(r)
        index(pts)

    if dropped:
        kept.sort(key=lambda r: r['id'])
        roads[:] = kept
        for i, r in enumerate(roads):
            r['id'] = i
    print(f'dedupe: dropped {dropped} roads duplicating one already placed')


dedupe_parallels()


# ------------------------------------------------------------ stub stitching ---
# Grid lines are clipped by their district polygon and again by the relief limit,
# and both cuts leave an end hanging in open ground. A real street does not do
# that: it either meets another road or it is a cul-de-sac. This pass walks each
# loose end forward along its own heading, joins it to the first road it can
# reach, and deletes the fragments that reach nothing.
STITCH_TOL = 1.3          # px: an end this close to a road already counts as joined
STITCH_REACH = 16.0       # px: how far an end may be extended to find one
STITCH_KINDS = {'street', 'residential', 'avenue', 'boulevard'}
MIN_FRAGMENT = 14.0       # px: a stub this short, joined to nothing, is deleted


def _seg_index(polylines, cell=8.0):
    grid = {}
    for pts in polylines:
        for a, b in zip(pts, pts[1:]):
            lo_x, hi_x = min(a[0], b[0]), max(a[0], b[0])
            lo_y, hi_y = min(a[1], b[1]), max(a[1], b[1])
            for cx in range(int(lo_x // cell), int(hi_x // cell) + 1):
                for cy in range(int(lo_y // cell), int(hi_y // cell) + 1):
                    grid.setdefault((cx, cy), []).append((a, b))
    return grid, cell


def _closest(grid, cell, x, y, radius, exclude):
    cx, cy = int(x // cell), int(y // cell)
    span = int(radius // cell) + 1
    best, best_d = None, radius
    for ox in range(-span, span + 1):
        for oy in range(-span, span + 1):
            for a, b in grid.get((cx + ox, cy + oy), ()):
                if (a, b) in exclude:
                    continue
                ex, ey = b[0] - a[0], b[1] - a[1]
                L = ex * ex + ey * ey
                t = 0.0 if L == 0 else max(0.0, min(1.0, ((x - a[0]) * ex + (y - a[1]) * ey) / L))
                q = (a[0] + ex * t, a[1] + ey * t)
                d = math.hypot(x - q[0], y - q[1])
                if d < best_d:
                    best, best_d = q, d
    return best


def stitch_stubs():
    candidates = [r for r in roads if r['kind'] in STITCH_KINDS and r['layer'] == 'surface']
    grid, cell = _seg_index([r['points'] for r in roads])

    joined = extended = dropped = 0
    doomed = []
    for r in candidates:
        pts = r['points']
        own = {(a, b) for a, b in zip(pts, pts[1:])}
        loose = []
        for which in (0, -1):
            end = pts[which]
            if _closest(grid, cell, end[0], end[1], STITCH_TOL, own) is not None:
                joined += 1
                continue
            # Walk forward along the end's own heading looking for something.
            inner = pts[1] if which == 0 else pts[-2]
            dx, dy = end[0] - inner[0], end[1] - inner[1]
            n = math.hypot(dx, dy)
            if n < 1e-6:
                loose.append(which)
                continue
            dx, dy = dx / n, dy / n
            hit = None
            step = 0.6
            travelled = step
            while travelled <= STITCH_REACH:
                probe = (end[0] + dx * travelled, end[1] + dy * travelled)
                if not (0 <= probe[0] <= MAP_W and 0 <= probe[1] <= MAP_H):
                    break
                q = _closest(grid, cell, probe[0], probe[1], STITCH_TOL, own)
                if q is not None:
                    hit = q
                    break
                travelled += step
            if hit is None:
                loose.append(which)
            else:
                if which == 0:
                    pts.insert(0, hit)
                else:
                    pts.append(hit)
                extended += 1
        # Reaching nothing at either end, and too short to be a real street.
        if len(loose) == 2:
            length = sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
            if length < MIN_FRAGMENT:
                doomed.append(id(r))
                dropped += 1

    if doomed:
        # Road ids are indices into `roads`, so the list has to be renumbered
        # after a removal or every downstream lookup shifts by one.
        kill = set(doomed)
        roads[:] = [r for r in roads if id(r) not in kill]
        for i, r in enumerate(roads):
            r['id'] = i
    print(f'stitching: {joined} ends already joined, {extended} extended to a road, '
          f'{dropped} orphan fragments dropped')


stitch_stubs()


# --------------------------------------------------------- corner rounding ---
# Traced polylines meet at hard vertices. Replacing each interior vertex with a
# short circular fillet is what stops the world reading as straight lines joined
# by kinks. Ramps keep their three authored points so snapped ends stay put.
ROUND_RADIUS = {'freeway': 120.0, 'boulevard': 34.0, 'avenue': 30.0, 'street': 18.0,
                'residential': 16.0, 'scenic': 34.0, 'dirt': 30.0, 'tunnel': 26.0,
                'underpass': 16.0}


def round_corners(points, radius, steps=5, keep=lambda p: False):
    if len(points) < 3:
        return list(points)
    out = [points[0]]
    for i in range(1, len(points) - 1):
        prev, cur, nxt = points[i - 1], points[i], points[i + 1]
        if keep(cur):
            out.append(cur)
            continue
        ax, ay = cur[0] - prev[0], cur[1] - prev[1]
        bx, by = nxt[0] - cur[0], nxt[1] - cur[1]
        la, lb = math.hypot(ax, ay), math.hypot(bx, by)
        if la < 1e-6 or lb < 1e-6:
            continue
        ax, ay, bx, by = ax / la, ay / la, bx / lb, by / lb
        turn = ax * bx + ay * by
        if turn > 0.9995:            # effectively straight: keep the vertex
            out.append(cur)
            continue
        cut = min(radius, la * 0.45, lb * 0.45)
        start = (cur[0] - ax * cut, cur[1] - ay * cut)
        end = (cur[0] + bx * cut, cur[1] + by * cut)
        out.append(start)
        for s in range(1, steps):
            t = s / steps
            # Quadratic Bezier through the vertex approximates the fillet arc.
            u = 1 - t
            out.append((u * u * start[0] + 2 * u * t * cur[0] + t * t * end[0],
                        u * u * start[1] + 2 * u * t * cur[1] + t * t * end[1]))
        out.append(end)
    out.append(points[-1])
    deduped = [out[0]]
    for p in out[1:]:
        if math.dist(p, deduped[-1]) > 1e-4:
            deduped.append(p)
    return deduped


# A vertex that another road terminates on is a junction: rounding it away would
# leave that road dangling, so those vertices stay sharp.
JOINS = set()
for r in roads:
    for p in (r['points'][0], r['points'][-1]):
        JOINS.add((round(p[0], 2), round(p[1], 2)))


def protected(p):
    return (round(p[0], 2), round(p[1], 2)) in JOINS


for r in roads:
    if r['kind'] == 'ramp':
        continue
    r['points'] = round_corners(r['points'], ROUND_RADIUS.get(r['kind'], 24.0), keep=protected)

# --------------------------------------------------------------- splitting ---
segments = []
for r in roads:
    for i, (a, b) in enumerate(zip(r['points'], r['points'][1:])):
        if math.dist(a, b) > .01:
            segments.append(dict(r=r, i=i, a=a, b=b, cuts=[(0, a), (1, b)]))


def cross(a, b):
    return a[0] * b[1] - a[1] * b[0]


# Every pair of segments used to be tested against every other, which is fine for
# a few hundred hand-traced roads and hopeless once the districts are filled with
# a real street grid. Bucket by bounding box instead and only test co-located
# pairs; the result is identical, it just finishes.
CUT_CELL = 16.0
_buckets = {}
for _i, _s in enumerate(segments):
    _a, _b = _s['a'], _s['b']
    for _cx in range(int(min(_a[0], _b[0]) // CUT_CELL), int(max(_a[0], _b[0]) // CUT_CELL) + 1):
        for _cy in range(int(min(_a[1], _b[1]) // CUT_CELL), int(max(_a[1], _b[1]) // CUT_CELL) + 1):
            _buckets.setdefault((_cx, _cy), []).append(_i)

_tested = set()
for _cell, _members in _buckets.items():
    for _mi in range(len(_members)):
        for _mj in range(_mi + 1, len(_members)):
            i, j = _members[_mi], _members[_mj]
            if i > j:
                i, j = j, i
            if (i, j) in _tested:
                continue
            _tested.add((i, j))
            s, q = segments[i], segments[j]
            if s['r']['layer'] != q['r']['layer']:
                    continue
            a, b, c, d = s['a'], s['b'], q['a'], q['b']
            u = (b[0] - a[0], b[1] - a[1])
            v = (d[0] - c[0], d[1] - c[1])
            den = cross(u, v)
            if abs(den) < 1e-8:
                continue
            w = (c[0] - a[0], c[1] - a[1])
            t = cross(w, v) / den
            k = cross(w, u) / den
            if -.00001 <= t <= 1.00001 and -.00001 <= k <= 1.00001:
                p = (a[0] + t * u[0], a[1] + t * u[1])
                s['cuts'].append((max(0, min(1, t)), p))
                q['cuts'].append((max(0, min(1, k)), p))

# ------------------------------------------------------------- districting ---
# Boundaries follow the labelled areas on the reference, west to east.
def district(x, y):
    if 850 < x < 1150 and y < 335:
        return 'Pasadena'
    if x >= 1140 and y < 400:
        return 'San Marino'
    if x < 425 and 475 < y < 640:
        return 'Beverly Hills'
    if x < 570 and 330 < y < 480:
        return 'West Hollywood'
    if y < 150 and 330 < x < 760:
        return 'Verdugo Hills'
    if y < 325 and x < 850:
        return 'Hollywood Hills'
    if x < 735 and y < 520:
        return 'Hollywood'
    if 735 < x < 950 and y < 480:
        return 'Silver Lake'
    if 850 < x < 980 and y < 570:
        return 'Echo Park'
    if 940 < x < 1120 and 380 < y < 500:
        return 'Eagle Rock'
    if x > 1330 and y < 620:
        return 'El Monte'
    if x > 1100 and y < 620:
        return 'Alhambra'
    if x > 1100 and y >= 620:
        return 'Monterey Park'
    if 755 < x < 1060 and 555 < y < 800:
        return 'Downtown Los Santerra'
    if x >= 1000 and y >= 740:
        return 'East Los Santerra'
    if 620 < x <= 790 and 520 < y < 720:
        return 'Koreatown'
    if 520 < x <= 660 and 500 < y < 660:
        return 'Hancock Park'
    if 470 < x <= 580 and 440 < y < 560:
        return 'Fairfax'
    if y >= 800 and x < 700:
        return 'Exposition Park'
    if y >= 760 and x < 340:
        return 'Culver City'
    if y >= 640 and x < 700:
        return 'Mid-City'
    return 'Central Los Santerra'


# ------------------------------------------------------------------ graph ---
nodes = []
node_lookup = {}
edges = []
# A freeway deck rides above grade; an underpass is cut below it.
LAYER_OFFSET = {'freeway': 8.0, 'underpass': -6.5}


# Two traced roads crossing at almost — but not exactly — the same point used to
# produce two nodes a few centimetres to a couple of metres apart, and the edge
# between them then had to carry whatever height difference the graded profiles
# ended up with. Over a 1.7 m edge that reads as a wall. Snapping anything within
# SNAP into one node removes the degenerate edge and keeps both roads joined.
SNAP = 0.70          # map pixels, i.e. 7 m — well inside the ~30 m minimum lot spacing


def node(p, layer, kind='avenue'):
    gx, gy = int(math.floor(p[0] / SNAP)), int(math.floor(p[1] / SNAP))
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for cand in node_lookup.get((gx + dx, gy + dy, layer), ()):
                if math.dist(p, nodes[cand]['map']) <= SNAP:
                    return cand
    h = height(*p)
    if layer not in ['surface'] and not layer.startswith('ramp'):
        h += LAYER_OFFSET.get('freeway', 0.0)
    if kind == 'underpass':
        h += LAYER_OFFSET['underpass']
    index = len(nodes)
    nodes.append(dict(id=index, map=[round(p[0], 4), round(p[1], 4)],
                      position=[round((p[0] - 768) * SCALE, 3), round(h, 3), round((p[1] - 512) * SCALE, 3)],
                      layer=layer))
    node_lookup.setdefault((gx, gy, layer), []).append(index)
    return index


# Road widths are built from a lane count rather than authored as one number, so
# a road is always wide enough for the traffic it is meant to carry and the car
# has somewhere to be when something comes the other way. 4.4 m a lane is wider
# than the 3.7 m a real highway engineer would use: at speed, with a chase
# camera, a real lane feels like a corridor.
#
#   lanes        total, both directions
#   shoulder     metres of sealed edge on each side
#   median       metres of separation down the middle, 0 for undivided
LANES = {
    'dirt':        dict(lanes=1, shoulder=1.8, median=0.0),
    'ramp':        dict(lanes=1, shoulder=2.3, median=0.0),
    'residential': dict(lanes=2, shoulder=1.6, median=0.0),
    'scenic':      dict(lanes=2, shoulder=2.1, median=0.0),
    'street':      dict(lanes=2, shoulder=2.6, median=0.0),
    'tunnel':      dict(lanes=2, shoulder=3.1, median=0.0),
    'underpass':   dict(lanes=2, shoulder=3.1, median=0.0),
    'avenue':      dict(lanes=4, shoulder=2.2, median=0.0),
    'boulevard':   dict(lanes=6, shoulder=2.4, median=3.6),
    'freeway':     dict(lanes=6, shoulder=3.9, median=6.0),
}
LANE_WIDTH = 4.4

WIDTHS = {k: round(v['lanes'] * LANE_WIDTH + 2 * v['shoulder'] + v['median'])
          for k, v in LANES.items()}
LANE_COUNT = {k: v['lanes'] for k, v in LANES.items()}
# Long straight runs are broken up so a road follows the ground instead of
# spanning a hill as one flat quad. At 55 m the road surface was a chain of long
# flat facets and every vertex was a kink you could feel through the car; 22 m
# is short enough that the profile reads as a curve instead of a series of
# ramps. Smoothing below is scaled to match -- a pass covers three vertices, so
# halving the spacing needs roughly four times the passes to smooth the same
# wavelength of ground.
MAX_SEGMENT = 22.0

for s in segments:
    r = s['r']
    cs = sorted(s['cuts'], key=lambda x: x[0])
    cs = [c for i, c in enumerate(cs) if i == 0 or c[0] - cs[i - 1][0] > 1e-5]
    for (_, a), (_, b) in zip(cs, cs[1:]):
        if math.dist(a, b) < .04:
            continue
        la = lb = r['layer']
        if r.get('endLayers'):
            if math.dist(a, r['points'][0]) < .01:
                la = r['endLayers'][0]
            if math.dist(b, r['points'][-1]) < .01:
                lb = r['endLayers'][1]
        # Densify in map pixels; MAX_SEGMENT is metres.
        steps = max(1, int(math.dist(a, b) * SCALE / MAX_SEGMENT))
        chain = [(a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps) for i in range(steps + 1)]
        for j, (ca, cb) in enumerate(zip(chain, chain[1:])):
            # Only the true endpoints may carry a ramp's transition layer.
            ka = la if j == 0 else r['layer']
            kb = lb if j == steps - 1 else r['layer']
            na = node(ca, ka, r['kind'])
            nb = node(cb, kb, r['kind'])
            if na == nb:
                continue
            edges.append(dict(id=len(edges), a=na, b=nb, road=r['id'], name=r['name'],
                              kind=r['kind'], width=WIDTHS[r['kind']],
                              lanes=LANE_COUNT[r['kind']],
                              district=district((ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2)))

# Ramp intermediate nodes use a deck interpolation, not a sudden snap.
for r in roads:
    if r['kind'] != 'ramp':
        continue
    es = [e for e in edges if e['road'] == r['id']]
    if not es:
        continue
    start = nodes[es[0]['a']]
    end = nodes[es[-1]['b']]
    total = sum(math.dist(nodes[e['a']]['map'], nodes[e['b']]['map']) for e in es)
    d = 0
    for e in es:
        n = nodes[e['a']]
        if total:
            n['position'][1] = round(start['position'][1] + (end['position'][1] - start['position'][1]) * d / total, 3)
        d += math.dist(n['map'], nodes[e['b']]['map'])

# ------------------------------------------------------------- underpasses ---
# A surface street that runs beneath a freeway deck is cut into a dip rather than
# authored by hand, so every real crossing on the map gets one.
def seg_distance(a, b, c, d):
    """Closest approach between two 2-D segments, in map pixels."""
    best = 1e18
    for p, (q0, q1) in [(a, (c, d)), (b, (c, d)), (c, (a, b)), (d, (a, b))]:
        best = min(best, math.sqrt(proj(p, q0, q1)[0]))
    return best


freeway_edges = [e for e in edges if e['kind'] in ('freeway', 'ramp')]
freeway_cells = {}
for e in freeway_edges:
    am, bm = nodes[e['a']]['map'], nodes[e['b']]['map']
    for cx in range(int(min(am[0], bm[0]) // 32), int(max(am[0], bm[0]) // 32) + 1):
        for cy in range(int(min(am[1], bm[1]) // 32), int(max(am[1], bm[1]) // 32) + 1):
            freeway_cells.setdefault((cx, cy), []).append((am, bm, e))

UNDERPASS_NODES = set()
for e in edges:
    if e['kind'] in ('freeway', 'ramp', 'tunnel', 'dirt'):
        continue
    am, bm = nodes[e['a']]['map'], nodes[e['b']]['map']
    cell = (int(((am[0] + bm[0]) / 2) // 32), int(((am[1] + bm[1]) / 2) // 32))
    candidates = []
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            candidates += freeway_cells.get((cell[0] + dx, cell[1] + dy), [])
    for fa, fb, fe in candidates:
        if seg_distance(am, bm, fa, fb) * SCALE < 26:
            e['kind'] = 'underpass'
            e['width'] = max(e['width'], WIDTHS['underpass'])
            e['lanes'] = max(e.get('lanes', 2), LANE_COUNT['underpass'])
            UNDERPASS_NODES.add(e['a'])
            UNDERPASS_NODES.add(e['b'])
            break

# Drop only the nodes whose every incident edge is itself an underpass. The old
# pass dropped both ends of every underpass edge, so the ordinary street next to
# it had to absorb the whole 6.5 m step — and because densification emits edges
# as short as 1.7 m, that produced 400% grades that rendered as a vertical wall
# of asphalt. Tapering this way keeps the dip inside the underpass run, where the
# edges are long enough to carry it.
incident = {}
for e in edges:
    incident.setdefault(e['a'], []).append(e)
    incident.setdefault(e['b'], []).append(e)
def _edge_run(e):
    a, b = nodes[e['a']]['position'], nodes[e['b']]['position']
    return math.hypot(b[0] - a[0], b[2] - a[2])


# The dip also needs LENGTH to develop. A freeway deck already rides 8 m above
# grade, so a street with no dip still passes under it cleanly; forcing 6.5 m of
# drop onto a 7 m edge just builds a cliff. Only dip where the grade can stay
# civilised.
MIN_DIP_RUN = abs(LAYER_OFFSET['underpass']) / 0.12
for n in UNDERPASS_NODES:
    links = incident.get(n, [])
    if not links or not all(x['kind'] == 'underpass' for x in links):
        continue
    if min(_edge_run(x) for x in links) < MIN_DIP_RUN:
        continue
    nodes[n]['position'][1] = round(nodes[n]['position'][1] + LAYER_OFFSET['underpass'], 3)

# --------------------------------------------------------- grade smoothing ---
# Engineered roads are graded, not draped. Average each road's profile along its
# own chain so freeways stay smooth and streets lose the terrain's fine detail.
SMOOTH_PASSES = {'freeway': 50, 'ramp': 0, 'boulevard': 19, 'avenue': 19, 'street': 13,
                 'residential': 13, 'scenic': 25, 'tunnel': 25, 'underpass': 13, 'dirt': 6}
by_road = {}
for e in edges:
    by_road.setdefault(e['road'], []).append(e)
# Smoothing has to be simultaneous, not road-by-road. Smoothing each road in turn
# and writing straight back into `nodes` let two roads that share a junction each
# overwrite the other's height there, last writer winning — on a hillside that
# left 7 m steps at crossroads, which rendered as a vertical wall of asphalt
# where a 1.7 m edge had to absorb the whole drop. Instead every road proposes a
# height from the SAME snapshot each pass, and a shared node takes the mean of
# its proposals, so all the roads through a junction agree on where it sits.
chains = {rid: [es[0]['a']] + [e['b'] for e in es] for rid, es in by_road.items()}
for step in range(max(SMOOTH_PASSES.values())):
    snapshot = [n['position'][1] for n in nodes]
    proposals = {}
    for road_id, chain in chains.items():
        if step >= SMOOTH_PASSES.get(roads[road_id]['kind'], 2):
            continue
        for i in range(1, len(chain) - 1):
            n = chain[i]
            if n in UNDERPASS_NODES:      # the dip is authored, not smoothed away
                continue
            h = (snapshot[chain[i - 1]] + 2 * snapshot[n] + snapshot[chain[i + 1]]) / 4
            proposals.setdefault(n, []).append(h)
    for n, hs in proposals.items():
        nodes[n]['position'][1] = round(sum(hs) / len(hs), 3)

# ------------------------------------------------------------- grade cap ---
# Nothing drivable should be a ski jump. An earlier attempt nudged the ends of
# any over-steep edge toward each other and iterated, which oscillated and got
# WORSE as the limit tightened. This clamps each road's profile to a cone
# instead: walk the chain forward allowing at most GRADE_CAP of rise per metre,
# then walk it back the same way. Two passes satisfy the limit along a chain,
# and junction nodes take the mean of what their roads ask for, so the roads
# through a junction still agree.
# One cap for every road was wrong in both directions: it let boulevards climb
# like goat tracks and it dragged the summit roads 120 m off the mountain trying
# to flatten a climb that is genuinely steep. A fire road IS steep; a freeway
# never is.
GRADE_CAP_BY_KIND = {'freeway': 0.07, 'ramp': 0.09, 'boulevard': 0.12, 'avenue': 0.13,
                     'street': 0.15, 'underpass': 0.20, 'residential': 0.20,
                     'tunnel': 0.22, 'scenic': 0.30, 'dirt': 0.42}
DEFAULT_GRADE_CAP = 0.16
MAX_CUT = 26.0      # metres the road may sit below natural ground
MAX_FILL = 18.0     # ...and above it, on embankment


def _runs_along(chain):
    out = []
    for a, b in zip(chain, chain[1:]):
        pa, pb = nodes[a]['position'], nodes[b]['position']
        out.append(math.hypot(pb[0] - pa[0], pb[2] - pa[2]))
    return out


for _sweep in range(14):
    # Pull the profile back toward the ground FIRST, then grade it. Doing this
    # the other way round meant the drape clamp had the last word and undid the
    # grade limiting, leaving 13 m steps between neighbouring nodes.
    for n in nodes:
        if n['layer'] != 'surface':
            continue
        ground = height(*n['map'])
        n['position'][1] = max(ground - MAX_CUT, min(ground + MAX_FILL, n['position'][1]))
    proposals = {}
    for road_id, chain in chains.items():
        if len(chain) < 2:
            continue
        profile = [nodes[n]['position'][1] for n in chain]
        runs = _runs_along(chain)
        cap = GRADE_CAP_BY_KIND.get(roads[road_id]['kind'], DEFAULT_GRADE_CAP)
        for i in range(1, len(profile)):
            limit = cap * runs[i - 1]
            profile[i] = min(profile[i], profile[i - 1] + limit)
            profile[i] = max(profile[i], profile[i - 1] - limit)
        for i in range(len(profile) - 2, -1, -1):
            limit = cap * runs[i]
            profile[i] = min(profile[i], profile[i + 1] + limit)
            profile[i] = max(profile[i], profile[i + 1] - limit)
        for n, h in zip(chain, profile):
            proposals.setdefault(n, []).append(h)
    moved = 0.0
    for n, hs in proposals.items():
        target = sum(hs) / len(hs)
        moved = max(moved, abs(target - nodes[n]['position'][1]))
        nodes[n]['position'][1] = round(target, 3)
    if moved < 0.01:
        break

# The ground has the last word. Where a road cannot hold its grade without
# riding a 70 m embankment, it is the grade that gives — a road that climbs
# steeply is real, a viaduct across half of Pasadena is not.
for n in nodes:
    if n['layer'] != 'surface':
        continue
    ground = height(*n['map'])
    n['position'][1] = round(max(ground - MAX_CUT, min(ground + MAX_FILL, n['position'][1])), 3)

# That clamp can leave a step wherever a clamped node abuts an unclamped one.
# Averaging the two ends of a short, over-steep edge is a purely local repair.
for _pass in range(60):
    fixed = 0
    for e in edges:
        a, b = nodes[e['a']]['position'], nodes[e['b']]['position']
        run = math.hypot(b[0] - a[0], b[2] - a[2])
        if run < 1e-6 or run > 90.0:
            continue
        if abs(b[1] - a[1]) <= 0.28 * run:
            continue
        mid = (a[1] + b[1]) * 0.5
        a[1] = round(a[1] + (mid - a[1]) * 0.45, 3)
        b[1] = round(b[1] + (mid - b[1]) * 0.45, 3)
        fixed += 1
    if not fixed:
        break

# ------------------------------------------------------------- landmarks ---
landmarks = [
    dict(name='Sunset Strip', district='West Hollywood', map=[338, 454]),
    dict(name='Rodeo Drive', district='Beverly Hills', map=[287, 550]),
    dict(name='Pasadena Civic Center', district='Pasadena', map=[991, 190]),
    dict(name='San Marino High School', district='San Marino', map=[1250, 322]),
    dict(name='Caltech Gardens', district='Pasadena', map=[939, 200]),
    dict(name='Echo Park', district='Echo Park', map=[928, 460]),
    dict(name='Downtown', district='Downtown Los Santerra', map=[930, 647]),
    dict(name='Mount Lee Overlook', district='Hollywood Hills', map=[655, 178]),
    dict(name='Hollywood Sign', district='Hollywood Hills', map=[641, 196]),
    dict(name='Exposition Park', district='Exposition Park', map=[520, 838]),
    dict(name='Koreatown', district='Koreatown', map=[700, 606]),
    dict(name='Culver City', district='Culver City', map=[226, 775]),
    dict(name='Old Town Pasadena', district='Pasadena', map=[888, 214]),
    dict(name='Monterey Park', district='Monterey Park', map=[1250, 660]),
]

# ------------------------------------------------------------- reachability ---
# A road you cannot drive to is scenery, not road. Generated grids clipped at a
# region edge and canyon roads that reach nothing both leave small islands, so
# keep only the component the city is actually in and renumber what survives.
def keep_largest_component(nodes, edges):
    from collections import defaultdict, deque
    adjacency = defaultdict(list)
    for e in edges:
        adjacency[e['a']].append(e['b'])
        adjacency[e['b']].append(e['a'])
    seen = set()
    best = []
    for start in range(len(nodes)):
        if start in seen:
            continue
        queue = deque([start])
        seen.add(start)
        group = []
        while queue:
            cur = queue.popleft()
            group.append(cur)
            for nxt in adjacency[cur]:
                if nxt not in seen:
                    seen.add(nxt)
                    queue.append(nxt)
        if len(group) > len(best):
            best = group
    keep = set(best)
    if len(keep) == len(nodes):
        return nodes, edges, 0, 0
    remap = {}
    new_nodes = []
    for n in nodes:
        if n['id'] in keep:
            remap[n['id']] = len(new_nodes)
            n = dict(n, id=len(new_nodes))
            new_nodes.append(n)
    new_edges = []
    for e in edges:
        if e['a'] in keep and e['b'] in keep:
            e = dict(e, id=len(new_edges), a=remap[e['a']], b=remap[e['b']])
            new_edges.append(e)
    return new_nodes, new_edges, len(nodes) - len(new_nodes), len(edges) - len(new_edges)


# ------------------------------------------------------------ leaf pruning ---
# A street that stops in the middle of a block is the single most visible defect
# on the map: the grid lines are clipped by their district polygon and by the
# relief limit, and whatever the stitching pass could not reattach is left
# hanging. Stitching closes the ends it can reach; this deletes the ones it
# cannot, walking each dead tail back to the last real junction rather than
# trimming one segment and leaving a shorter stub behind.
#
# Some dead ends are real and must survive: fire roads and canyon roads that
# genuinely stop, authored cul-de-sacs, and anything running off the map edge.
LEAF_KEEP_KINDS = {'dirt', 'scenic', 'ramp', 'tunnel'}
EDGE_MARGIN = 12.0          # px from the map border: a road leaving the map


def prune_leaves(nodes, edges):
    alive = [True] * len(edges)
    incident = defaultdict(list)
    for i, e in enumerate(edges):
        incident[e['a']].append(i)
        incident[e['b']].append(i)

    def protected(node_id, edge):
        if edge['road'] in TRACED_ROAD_IDS:
            return True
        if edge['kind'] in LEAF_KEEP_KINDS:
            return True
        if 'cul' in edge.get('name', '').lower():
            return True
        x, y = nodes[node_id]['map']
        return (x < EDGE_MARGIN or x > MAP_W - EDGE_MARGIN
                or y < EDGE_MARGIN or y > MAP_H - EDGE_MARGIN)

    # A node is a leaf when exactly one live edge touches it. Removing that edge
    # can make its far end a leaf in turn, so this runs as a worklist until the
    # whole tail is gone.
    degree = {n: 0 for n in range(len(nodes))}
    for e in edges:
        degree[e['a']] += 1
        degree[e['b']] += 1

    queue = [n for n, d in degree.items() if d == 1]
    removed = 0
    while queue:
        n = queue.pop()
        if degree[n] != 1:
            continue
        live = [i for i in incident[n] if alive[i]]
        if not live:
            continue
        i = live[0]
        e = edges[i]
        if protected(n, e):
            continue
        alive[i] = False
        removed += 1
        degree[n] -= 1
        far = e['b'] if e['a'] == n else e['a']
        degree[far] -= 1
        if degree[far] == 1:
            queue.append(far)

    kept = [e for i, e in enumerate(edges) if alive[i]]
    return kept, removed


edges, leaf_edges = prune_leaves(nodes, edges)
if leaf_edges:
    print(f'leaf pruning: removed {leaf_edges} dead-end edges')

nodes, edges, dropped_nodes, dropped_edges = keep_largest_component(nodes, edges)
if dropped_nodes:
    print(f'pruned {dropped_nodes} unreachable nodes and {dropped_edges} edges')

# A coarse height table lets the JS mirror be verified against this builder.
height_samples = [[x, y, round(height(x, y), 4)] for y in range(0, 1025, 128) for x in range(0, 1537, 128)]

output = dict(version=3, name='Los Santerra', reference='los-santerra-reference.png',
              referenceSize=[1536, 1024], metersPerPixel=SCALE, origin=[768, 512],
              nodes=nodes, edges=edges, landmarks=landmarks,
              heightSamples=height_samples,
              roads=[{k: v for k, v in r.items() if k != 'endLayers'} for r in roads])
(ROOT / 'assets/world/network.json').write_text(json.dumps(output, separators=(',', ':')))
km = round(sum(math.dist(nodes[e['a']]['position'], nodes[e['b']]['position']) for e in edges) / 1000, 1)
kinds = {}
for e in edges:
    kinds[e['kind']] = kinds.get(e['kind'], 0) + 1
lo = min(n['position'][1] for n in nodes)
hi = max(n['position'][1] for n in nodes)
print(f'{len(roads)} traced roads; {len(nodes)} nodes; {len(edges)} edges; {km} km')
print(f'road elevation {lo:.1f} m to {hi:.1f} m')
print('edges by kind: ' + ', '.join(f'{k}={v}' for k, v in sorted(kinds.items())))
