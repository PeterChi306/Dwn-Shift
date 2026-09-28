"""Make the road graph drivable: de-kink it, then cap its grades.

Two defects survived build_network.py's own fillet and smoothing passes, and both
of them are what makes the Unreal level read as broken:

1. **Hairpin kinks.** 414 interior vertices turned more than 25 degrees, some as
   much as 155 -- the ribbon in build_los_santerra_level.py mitres its joints, so
   a reversal like that folds the quad back through itself. That is a road that
   visibly vanishes for a few metres, not a road you can drive.

2. **Grades no car can climb.** 4.3% of edges were steeper than 12% and the worst
   was 46%. build_network.py smooths each road along *its own chain*, which cannot
   see that the chain ends at a junction shared with three other roads, so the
   grade break lands exactly at the intersection.

Both are fixed on `assets/world/network.json` rather than on the Unreal export,
because the nodes there are genuinely shared between roads: move a junction node
once and every road through it follows. That is what keeps intersections welded --
continuity is preserved by construction, not by a snapping pass afterwards.

Passes
------
*De-kink* (XY): Laplacian fairing on degree-2 vertices whose turn exceeds
KINK_DEG, capped at MAX_MOVE_M of total displacement so the traced layout is
preserved. Junctions, road endpoints and every non-surface layer are pinned.

*Re-grade* (Z): alternating projections onto two hard sets over the whole graph
at once -- the slope-feasible set (|dz| <= MAX_GRADE[kind] * run on every edge)
and the cut/fill band (|z - terrain| <= MAX_CUT_M[kind]) -- with a vertical-curve
term in between so a grade change arrives as a curve and not a corner. Projection
onto the slope set runs last and to convergence, so the limit holds on exit.

Both sets are convex, so where they intersect the alternation lands inside both.
Where they do not -- a road driven straight up a 45% face, which no amount of
re-profiling can make both gentle and on the ground -- it oscillates instead, and
that is precisely the list of roads that need a different *route*, not a different
profile. `main` reports them rather than quietly returning a trench.

Pinned throughout: freeway decks and ramps (their own layers -- they are meant to
fly), and any node on a tunnel or underpass edge (authored dips that must keep
their clearance under the deck above).

Run it after build_network.py and before build_unreal_export.py / build_heightmap.py:

    python3 tools/regrade_network.py
"""
import json
import math
import shutil
import sys
from array import array
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from terrain import height  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
NET = ROOT / 'assets' / 'world' / 'network.json'

# Steepest sustained grade per road kind, as a fraction. Los Angeles tolerates far
# more than AASHTO's 6-8% design maxima -- Baxter Street is 32% -- so these are set
# at the upper end of what the city actually built, not at the textbook figure.
MAX_GRADE = {
    'boulevard': 0.07, 'avenue': 0.08, 'street': 0.10,
    'residential': 0.13, 'scenic': 0.15, 'dirt': 0.18,
}
# Kinds that are authored, not draped, and so are pinned rather than graded.
PINNED_KINDS = ('freeway', 'ramp', 'tunnel', 'underpass')

# How far a road may be cut into, or built out from, the natural ground before it
# stops reading as a road on a hillside and starts reading as a canyon or a dam.
MAX_CUT_M = {
    'boulevard': 9.0, 'avenue': 9.0, 'street': 10.0,
    'residential': 12.0, 'scenic': 22.0, 'dirt': 14.0,
}

KINK_DEG = 15.0        # start fairing a vertex once its turn exceeds this
MAX_MOVE_M = 4.0       # a vertex may never leave its traced position by more
KINK_ITERS = 14

GRADE_ITERS = 120      # outer alternation steps
PROJECT_SWEEPS = 40    # slope sweeps per outer step
FINAL_SWEEPS = 4000    # slope sweeps after the loop, to drive violation to zero
SLOPE_TOL = 1e-4       # metres of residual rise treated as converged
CURVE = 0.35           # vertical-curve (smoothing) weight
BAND_WEIGHT = 0.55     # how far the averaged projection leans to conformity
SETTLE_ITERS = 250     # smooth-then-clamp passes that seat the profile in the band
SETTLE_CURVE = 0.50


def load():
    net = json.loads(NET.read_text())
    return net


def pixel_of(net):
    """map[] from a world position, using the file's own origin and scale."""
    mpp = net['metersPerPixel']
    ox, oy = net['origin']

    def to_pixel(x, z):
        return [ox + x / mpp, oy + z / mpp]
    return to_pixel


def classify(net):
    """Which nodes may move, and the slope limit on every edge."""
    nodes, edges = net['nodes'], net['edges']
    pinned = bytearray(len(nodes))
    for i, n in enumerate(nodes):
        if n['layer'] != 'surface':
            pinned[i] = 1
    for e in edges:
        if e['kind'] in PINNED_KINDS:
            pinned[e['a']] = 1
            pinned[e['b']] = 1
    return pinned


def adjacency(net):
    adj = defaultdict(list)
    for e in net['edges']:
        adj[e['a']].append((e['b'], e))
        adj[e['b']].append((e['a'], e))
    return adj


# --------------------------------------------------------------------- de-kink
def dekink(net, pinned, adj):
    nodes = net['nodes']
    to_pixel = pixel_of(net)
    origin = {i: (n['position'][0], n['position'][2]) for i, n in enumerate(nodes)}

    # Only a degree-2 vertex whose two edges belong to the same road is interior
    # geometry. Anything else is a junction or a road end and stays put.
    movable = []
    for i, n in enumerate(nodes):
        if pinned[i]:
            continue
        links = adj[i]
        if len(links) != 2:
            continue
        if links[0][1]['road'] != links[1][1]['road']:
            continue
        movable.append((i, links[0][0], links[1][0]))

    limit = math.cos(math.radians(180.0 - KINK_DEG))  # unused guard, kept explicit
    moved = 0
    for _ in range(KINK_ITERS):
        updates = []
        for i, a, b in movable:
            pa, pi, pb = nodes[a]['position'], nodes[i]['position'], nodes[b]['position']
            v1x, v1y = pi[0] - pa[0], pi[2] - pa[2]
            v2x, v2y = pb[0] - pi[0], pb[2] - pi[2]
            l1 = math.hypot(v1x, v1y)
            l2 = math.hypot(v2x, v2y)
            if l1 < 1e-6 or l2 < 1e-6:
                continue
            cosv = max(-1.0, min(1.0, (v1x * v2x + v1y * v2y) / (l1 * l2)))
            turn = math.degrees(math.acos(cosv))
            if turn <= KINK_DEG:
                continue
            # Strength rises with how far over the threshold the corner is, so a
            # gentle bend is barely touched and a reversal is cut hard.
            k = min(0.5, 0.5 * (turn - KINK_DEG) / 60.0 + 0.12)
            mx, my = (pa[0] + pb[0]) * 0.5, (pa[2] + pb[2]) * 0.5
            nx = pi[0] + (mx - pi[0]) * k
            ny = pi[2] + (my - pi[2]) * k
            # Never let fairing walk a vertex off the traced alignment.
            ox, oy = origin[i]
            dx, dy = nx - ox, ny - oy
            d = math.hypot(dx, dy)
            if d > MAX_MOVE_M:
                nx, ny = ox + dx / d * MAX_MOVE_M, oy + dy / d * MAX_MOVE_M
            updates.append((i, nx, ny))
        if not updates:
            break
        for i, nx, ny in updates:
            nodes[i]['position'][0] = nx
            nodes[i]['position'][2] = ny
        moved = len({u[0] for u in updates})
    # map[] is what the heightmap carve and every check index by, so it has to
    # follow the position it was derived from.
    for i, _, _ in movable:
        p = nodes[i]['position']
        nodes[i]['map'] = to_pixel(p[0], p[2])
    return len(movable), moved


# -------------------------------------------------------------------- re-grade
def _approach_allowance(nodes, edges, pinned, z):
    """How much cut/fill each node needs to reach a pinned neighbour legally.

    A multi-source relaxation from every pinned node, carrying that node's own
    departure from natural ground and shedding it at the edge's grade limit per
    metre travelled. The result is the depth of corridor an approach ramp needs.

    Natural ground is re-evaluated here rather than read from the caller's
    `ground`: that array stores a pinned node's own height, not the terrain's, so
    reading it would make every source zero and the whole relaxation a no-op.
    """
    n = len(nodes)
    allowance = [0.0] * n
    frontier = []
    for i in range(n):
        if pinned[i]:
            allowance[i] = abs(z[i] - height(nodes[i]['map'][0], nodes[i]['map'][1]))
            frontier.append(i)
    links = [[] for _ in range(n)]
    for e in edges:
        g = MAX_GRADE.get(e['kind'])
        if g is None:
            continue
        pa, pb = nodes[e['a']]['position'], nodes[e['b']]['position']
        run = math.hypot(pb[0] - pa[0], pb[2] - pa[2])
        links[e['a']].append((e['b'], run * g))
        links[e['b']].append((e['a'], run * g))
    while frontier:
        nxt = []
        for i in frontier:
            for j, shed in links[i]:
                value = allowance[i] - shed
                if value > allowance[j] + 1e-6:
                    allowance[j] = value
                    nxt.append(j)
        frontier = nxt
    return allowance


def _project_slope(z, budget, pinned, sweeps, tol):
    """Gauss-Seidel projection onto |z[b] - z[a]| <= cap, to convergence.

    Sweeps alternate direction: a violation on a long climb propagates one edge
    per sweep, so sweeping forwards and backwards halves the number needed.
    Returns the largest residual violation left, in metres.
    """
    worst = 0.0
    for sweep in range(sweeps):
        worst = 0.0
        order = budget if sweep % 2 == 0 else reversed(budget)
        for a, b, cap in order:
            d = z[b] - z[a]
            if -cap <= d <= cap:
                continue
            over = d - cap if d > cap else d + cap
            if abs(over) > worst:
                worst = abs(over)
            fa, fb = not pinned[a], not pinned[b]
            if fa and fb:
                z[a] += over * 0.5
                z[b] -= over * 0.5
            elif fa:
                z[a] += over
            elif fb:
                z[b] -= over
            # neither free: an authored deck-to-deck edge, left alone.
        if worst < tol:
            break
    return worst


def regrade(net, pinned, adj):
    nodes, edges = net['nodes'], net['edges']
    n = len(nodes)
    z = array('d', (nd['position'][1] for nd in nodes))
    ground = array('d', z)
    for i, nd in enumerate(nodes):
        if not pinned[i]:
            ground[i] = height(nd['map'][0], nd['map'][1])

    # Per-edge slope budget in metres of rise, and the tightest cut/fill band any
    # edge at a node asks for. Both precomputed once; neither depends on z.
    budget = []
    edge_kind, edge_name = {}, {}
    band = [1e9] * n
    for e in edges:
        a, b = e['a'], e['b']
        g = MAX_GRADE.get(e['kind'])
        if g is None:
            continue
        pa, pb = nodes[a]['position'], nodes[b]['position']
        run = math.hypot(pb[0] - pa[0], pb[2] - pa[2])
        budget.append((a, b, run * g))
        edge_kind[(a, b)] = e['kind']
        edge_name[(a, b)] = e['name']
        cut = MAX_CUT_M[e['kind']]
        band[a] = min(band[a], cut)
        band[b] = min(band[b], cut)

    free = [i for i in range(n) if not pinned[i]]
    neighbours = [[] for _ in range(n)]
    for e in edges:
        neighbours[e['a']].append(e['b'])
        neighbours[e['b']].append(e['a'])

    # Widen the band along the approach to every pinned node. A tunnel mouth or an
    # underpass dip is authored metres below natural ground and cannot move; its
    # free neighbours, clamped back to the band, would leave a vertical step at the
    # portal -- which is where the worst grade in the whole network came from, an
    # 88% street on ground that only falls 17%. So each pinned node broadcasts the
    # cut it needs, decaying at the local grade limit, and the band opens up just
    # enough along that corridor for a compliant approach ramp to exist.
    allowance = _approach_allowance(nodes, edges, pinned, z)
    for i in free:
        band[i] = max(band[i], allowance[i])

    for _ in range(GRADE_ITERS):
        # 1. vertical curve: pull each vertex toward the mean of its neighbours,
        #    which is what turns a grade break into a crest or sag curve.
        smoothed = array('d', z)
        for i in free:
            nb = neighbours[i]
            if not nb:
                continue
            smoothed[i] = z[i] + CURVE * (sum(z[j] for j in nb) / len(nb) - z[i])
        z = smoothed
        # 2 & 3. Project onto each set independently, then take the weighted mean
        #    (Cimmino's averaged projections). Sequential projection is wrong here:
        #    the graph is one connected component, so whichever set goes last wins
        #    outright. Letting slope win flattens a mountain and lifts every road
        #    joined to it 100 m off the ground; letting the band win snaps a street
        #    onto an 88% cliff face. Averaging converges instead to the point that
        #    minimises the weighted squared distance to both -- a hillside road that
        #    takes some cut *and* some extra grade, which is how one is really built.
        slope_z = array('d', z)
        _project_slope(slope_z, budget, pinned, PROJECT_SWEEPS, SLOPE_TOL)
        for i in free:
            lo, hi = ground[i] - band[i], ground[i] + band[i]
            band_z = lo if z[i] < lo else (hi if z[i] > hi else z[i])
            z[i] = BAND_WEIGHT * band_z + (1.0 - BAND_WEIGHT) * slope_z[i]

    # Settle: alternate smoothing with the band clamp until the profile lies inside
    # the band *continuously*. Clamping once at the end does not work -- the clamp
    # acts on each node independently, so a node pushed back to the band boundary
    # while its neighbour stays high leaves a vertical step, and a step over a 9 m
    # run reads as a 120% grade that no terrain under it justifies. Smoothing
    # between clamps is what removes those steps; what is left afterwards is the
    # grade the hillside itself forces, which is the honest number.
    for _ in range(SETTLE_ITERS):
        smoothed = array('d', z)
        for i in free:
            nb = neighbours[i]
            if nb:
                smoothed[i] = z[i] + SETTLE_CURVE * (sum(z[j] for j in nb) / len(nb) - z[i])
        z = smoothed
        for i in free:
            lo, hi = ground[i] - band[i], ground[i] + band[i]
            z[i] = lo if z[i] < lo else (hi if z[i] > hi else z[i])
    residual = _project_slope(z, budget, pinned, 0, SLOPE_TOL)

    # Where the two sets do not intersect, the slope cap is now the one that gives
    # way. Report those roads: the ground under them is steeper than the grade they
    # are allowed, so they need a new alignment -- switchbacks or a contour route --
    # not a new profile. This is the honest residue of the pass, not a silent fudge.
    strained = {}
    for a, b, cap in budget:
        d = abs(z[b] - z[a])
        if d <= cap + 1e-6 or cap <= 0:
            continue
        run = cap / MAX_GRADE[edge_kind[(a, b)]]
        grade = d / run if run > 0 else 0.0
        name = edge_name[(a, b)]
        if grade > strained.get(name, (0.0,))[0]:
            strained[name] = (grade, edge_kind[(a, b)])

    for i in free:
        nodes[i]['position'][1] = round(z[i], 3)
    return free, residual, strained


# ---------------------------------------------------------------------- report
def report(net, label):
    nodes, edges = net['nodes'], net['edges']
    grades = []
    for e in edges:
        if e['kind'] in PINNED_KINDS:
            continue
        pa, pb = nodes[e['a']]['position'], nodes[e['b']]['position']
        run = math.hypot(pb[0] - pa[0], pb[2] - pa[2])
        if run < 1.0:
            continue
        grades.append(abs(pb[1] - pa[1]) / run)
    grades.sort()
    kinks = 0
    adj = adjacency(net)
    for i, nd in enumerate(nodes):
        links = adj[i]
        if len(links) != 2:
            continue
        a, b = links[0][0], links[1][0]
        pa, pi, pb = nodes[a]['position'], nd['position'], nodes[b]['position']
        v1 = (pi[0] - pa[0], pi[2] - pa[2])
        v2 = (pb[0] - pi[0], pb[2] - pi[2])
        l1, l2 = math.hypot(*v1), math.hypot(*v2)
        if l1 < 1e-6 or l2 < 1e-6:
            continue
        c = max(-1.0, min(1.0, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)))
        if math.degrees(math.acos(c)) > 25.0:
            kinks += 1
    drape = 0.0
    for i, nd in enumerate(nodes):
        if nd['layer'] != 'surface':
            continue
        drape = max(drape, abs(nd['position'][1] - height(nd['map'][0], nd['map'][1])))
    over = lambda t: 100.0 * sum(1 for g in grades if g > t) / len(grades)
    print('%-8s grades: max %5.1f%%  p99 %4.1f%%  over 12%% %5.2f%%  over 20%% %5.2f%%'
          '   kinks>25deg %4d   worst drape %5.1f m'
          % (label, grades[-1] * 100, grades[int(len(grades) * .99)] * 100,
             over(0.12), over(0.20), kinks, drape))


def main():
    net = load()
    report(net, 'before')
    pinned = classify(net)
    adj = adjacency(net)
    free_xy, last = dekink(net, pinned, adj)
    print('  de-kink: %d interior vertices eligible' % free_xy)
    graded, residual, strained = regrade(net, pinned, adj)
    print('  re-grade: %d of %d nodes free (%d pinned decks/ramps/tunnels)'
          % (len(graded), len(net['nodes']), len(net['nodes']) - len(graded)))
    print('  slope projection residual: %.4f m' % residual)
    if strained:
        print('  %d roads whose ground is steeper than their grade cap allows -- '
              'these want re-routing, not re-profiling:' % len(strained))
        for name, (grade, kind) in sorted(strained.items(), key=lambda kv: -kv[1][0])[:12]:
            print('     %-28s %-10s steepest %.0f%% (cap %.0f%%)'
                  % (name[:28], kind, grade * 100, MAX_GRADE[kind] * 100))
    report(net, 'after')
    backup = NET.with_suffix('.json.pregrade')
    if not backup.exists():
        shutil.copy(NET, backup)
        print('  original kept at %s' % backup.relative_to(ROOT))
    NET.write_text(json.dumps(net, separators=(',', ':')) + '\n')
    print('  wrote %s' % NET.relative_to(ROOT))


if __name__ == '__main__':
    main()
