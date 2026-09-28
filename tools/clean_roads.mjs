#!/usr/bin/env node
/* network.json (raw, from tools/build_network.py) -> roads.json (drivable).
 *
 *   node tools/clean_roads.mjs && python3 tools/audit_roads.py assets/world/roads.json
 *
 * The raw graph is a good map and a bad road surface. This pass fixes the
 * surface problems, in this order, and the game only ever loads its output:
 *
 *   1. same-level crossings with no junction get one;
 *   2. roads lying on top of each other side by side (carriageways overlapping
 *      with no junction between them), and roads meeting at a knife-edge angle,
 *      lose the less important of the pair;
 *   3. junctions packed closer than their roads are wide are merged (a 22 m
 *      avenue needs ~12 m of junction each side; two closer than that overlap);
 *   4. anything no longer reachable from the main network is dropped;
 *   5. every road is re-graded in ONE solve (see regrade()).
 *
 * The old pipeline graded roads to the terrain and then bent the terrain to the
 * roads, in separate tools that disagreed. Here the roads are graded once, and
 * world/ground.js shapes the terrain to them at runtime.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {RoadNetwork, naturalHeight as terrainHeight} from '../world/network.js';
import {RoadModel, projectPiece, halfWidth} from '../world/roads.js';

const root = new URL('..', import.meta.url);
const IN = new URL('assets/world/network.json', root), OUT = new URL('assets/world/roads.json', root);
const raw = JSON.parse(readFileSync(IN));

const RANK = {freeway: 9, ramp: 8, boulevard: 7, avenue: 6, tunnel: 6, underpass: 5, street: 4, scenic: 3, residential: 2, dirt: 1};
const GRADE_CAP = {freeway: .065, ramp: .075, tunnel: .075, boulevard: .09, avenue: .10, underpass: .10,
  street: .13, residential: .15, scenic: .22, dirt: .30};
/* Areas already built out get gentler hill roads (2026-09-26: West Hollywood
 * and its hills; ~12% of scenic length there was over 18%, which drove like a
 * wall). Elsewhere the old caps stand until each area is worked on: applied
 * map-wide, the Mount Lee climbs could only meet 16% by cutting 200 m into
 * the ridge. Bounds in world metres, a little wider than the building area. */
const GENTLE_AREAS = [{x0: -5800, x1: -1700, z0: -3000, z1: 0, caps: {scenic: +(process.env.SCENIC_CAP || .16), residential: +(process.env.RES_CAP || .13)}}];
/* Per-road cap overrides by name (none needed since the weighted envelope). */
const ROAD_CAP = {};
const capOf = e => {
  if (ROAD_CAP[e.name]) return ROAD_CAP[e.name];
  if (e.gentle === undefined) {
    const a = nodes[e.a].position, b = nodes[e.b].position, x = (a[0] + b[0]) / 2, z = (a[2] + b[2]) / 2;
    e.gentle = GENTLE_AREAS.find(A => x > A.x0 && x < A.x1 && z > A.z0 && z < A.z1) || null;
  }
  return e.gentle?.caps[e.kind] ?? GRADE_CAP[e.kind] ?? .15;
};
/* Smoothing length per kind, metres: how far a road looks along itself when
 * deciding how closely to follow the ground. A freeway irons out a hill; a
 * residential street climbs it. */
const SMOOTH = {freeway: 420, ramp: 110, tunnel: 220, boulevard: 70, avenue: 60, underpass: 45, street: 40,
  residential: 32, scenic: 30, dirt: 26};
const CLEAR = 7;                  // vertical separation where roads cross without a junction

let nodes = raw.nodes.map(n => ({...n, position: [...n.position]}));
let edges = raw.edges.map(e => ({...e}));
const log = (...a) => console.log(...a);

/* ------------------------------------------------------------ helpers */
const net = () => new RoadNetwork({...raw, nodes, edges: edges.map((e, id) => ({...e, id}))});
function compact() {
  // Drop dead edges and unused nodes, renumber everything.
  edges = edges.filter(e => !e.dead && e.a !== e.b);
  const used = new Set();
  for (const e of edges) { used.add(e.a); used.add(e.b); }
  const map = new Map();
  nodes = nodes.filter(n => used.has(n.id)).map((n, i) => { map.set(n.id, i); return {...n, id: i}; });
  edges = edges.map((e, i) => ({...e, id: i, a: map.get(e.a), b: map.get(e.b)}));
}
function largestComponent() {
  const adj = nodes.map(() => []);
  edges.forEach((e, i) => { adj[e.a].push(i); adj[e.b].push(i); });
  const comp = new Int32Array(nodes.length).fill(-1);
  let best = -1, bestSize = 0, c = 0;
  for (let s = 0; s < nodes.length; s++) {
    if (comp[s] >= 0) continue;
    let size = 0; const stack = [s]; comp[s] = c;
    while (stack.length) {
      const n = stack.pop(); size++;
      for (const id of adj[n]) { const e = edges[id], m = e.a === n ? e.b : e.a; if (comp[m] < 0) { comp[m] = c; stack.push(m); } }
    }
    if (size > bestSize) { bestSize = size; best = c; }
    c++;
  }
  let dropped = 0;
  for (const e of edges) if (comp[e.a] !== best) { e.dead = true; dropped++; }
  return dropped;
}
function segCross(a, b, c, d) {
  const rx = b[0] - a[0], rz = b[2] - a[2], sx = d[0] - c[0], sz = d[2] - c[2];
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = c[0] - a[0], qz = c[2] - a[2];
  const t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
  return t > 1e-4 && t < 1 - 1e-4 && u > 1e-4 && u < 1 - 1e-4 ? [t, u] : null;
}
function crossings() {
  const P = nodes.map(n => n.position), C = 60, grid = new Map(), out = [];
  edges.forEach((e, i) => {
    const a = P[e.a], b = P[e.b];
    for (let gx = Math.floor(Math.min(a[0], b[0]) / C); gx <= Math.floor(Math.max(a[0], b[0]) / C); gx++)
      for (let gz = Math.floor(Math.min(a[2], b[2]) / C); gz <= Math.floor(Math.max(a[2], b[2]) / C); gz++) {
        const k = gx * 65536 + gz; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(i);
      }
  });
  const seen = new Set();
  for (const list of grid.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const x = Math.min(list[i], list[j]), y = Math.max(list[i], list[j]), key = x * 1e6 + y;
    if (seen.has(key)) continue; seen.add(key);
    const e = edges[x], f = edges[y];
    if (e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b) continue;
    const hit = segCross(P[e.a], P[e.b], P[f.a], P[f.b]);
    if (hit) out.push({e: x, f: y, t: hit[0], u: hit[1]});
  }
  return out;
}

/* --------------------------------------------- 1. junctions at crossings */
{
  const P = nodes.map(n => n.position);
  let split = 0;
  const cuts = new Map();           // edge -> [{t, node}]
  for (const c of crossings()) {
    const e = edges[c.e], f = edges[c.f];
    const ya = P[e.a][1] + (P[e.b][1] - P[e.a][1]) * c.t, yb = P[f.a][1] + (P[f.b][1] - P[f.a][1]) * c.u;
    // Only a crossing the original builder meant to be level becomes a junction;
    // one it separated by a deck stays a bridge and is re-graded below.
    if (Math.abs(ya - yb) >= 1 || nodes[e.a].layer !== nodes[f.a].layer) continue;
    const id = nodes.length, x = P[e.a][0] + (P[e.b][0] - P[e.a][0]) * c.t, z = P[e.a][2] + (P[e.b][2] - P[e.a][2]) * c.t;
    nodes.push({id, map: [x / 10 + 768, z / 10 + 512], position: [x, (ya + yb) / 2, z], layer: nodes[e.a].layer});
    for (const [edge, t] of [[c.e, c.t], [c.f, c.u]]) { if (!cuts.has(edge)) cuts.set(edge, []); cuts.get(edge).push({t, node: id}); }
    split++;
  }
  for (const [id, list] of cuts) {
    const e = edges[id]; list.sort((a, b) => a.t - b.t);
    let from = e.a;
    for (const {node} of list) { edges.push({...e, a: from, b: node}); from = node; }
    edges.push({...e, a: from, b: e.b});
    e.dead = true;
  }
  compact();
  log(`1. junctions added at level crossings: ${split}`);
}

/* ---------------------------------- 2. overlapping and knife-edge roads */
for (let round = 0; round < 4; round++) {
  const N = net(), model = new RoadModel(N);
  const doomed = new Set();
  const lesser = (A, B) => {
    const ra = RANK[A.kind] ?? 3, rb = RANK[B.kind] ?? 3;
    return ra !== rb ? (ra < rb ? A : B) : (A.L < B.L ? A : B);
  };
  // 2a. side-by-side overlap without a shared junction
  const hits = new Map();
  // Sampled every 4 m along each road (not per stored point, whose spacing
  // varies), so the count below is a LENGTH of overlap: 3 hits = 12 m.
  for (const seg of model.segments) {
    // Only the open road between junctions: inside a junction's cut-back,
    // roads are meant to meet, and crowding there is step 3's business.
    for (let s = seg.cut[0]; s <= seg.L - seg.cut[1]; s += 4) {
      const p = model.sectionAt(seg, s), list = model.near(p.x, p.z);
      for (let k = 0; k < list.length; k += 2) {
        const o = model.segments[list[k]];
        if (o.id <= seg.id) continue;
        const r = projectPiece(o, list[k + 1], p.x, p.z);
        if (r.s < o.cut[0] || r.s > o.L - o.cut[1]) continue;
        // Roads that share a junction meet there by design; but two that
        // zig-zag across each other through a chain of junctions (Vine lying
        // on Larrabee for 1.2 km) share a node at every stretch. So a shared
        // node only excuses samples close to it.
        const shared = [seg.a, seg.b].filter(n => n === o.a || n === o.b);
        if (shared.some(n => { const P = N.nodes[n].position; return Math.hypot(p.x - P[0], p.z - P[2]) < (p.h + r.h) * 2 + 12; })) continue;
        if (r.d < (p.h + r.h) * .8 && Math.abs(r.y - p.y) < 22) {
          // Level overlaps count at once; a deck a few metres above only if it
          // runs ALONG the road (see below), since a real crossing is short.
          const key = seg.id * 1e5 + o.id, level = Math.abs(r.y - p.y) < CLEAR - 1;
          const h = hits.get(key) || {level: 0, stacked: 0};
          if (level) h.level++; else h.stacked++;
          hits.set(key, h);
        }
      }
    }
  }
  for (const [key, h] of hits) {
    // 12 m of level overlap, or 48 m of one road stacked along another (the
    // grading pulls a parallel "underpass" up under its freeway, and the
    // ground is then draped between them like a curtain).
    if (h.level < 3 && h.level + h.stacked < 12) continue;
    const A = model.segments[Math.floor(key / 1e5)], B = model.segments[key % 1e5];
    doomed.add(lesser(A, B).id);
  }
  const overlapCount = doomed.size;
  // 2b. knife-edge junctions: two roads leaving a junction less than 18 degrees apart
  for (const j of model.junctions) {
    if (j.cap) continue;
    const k = j.ends.length;
    for (let i = 0; i < k; i++) {
      const A = j.ends[i], B = j.ends[(i + 1) % k];
      let gap = B.angle - A.angle; if (gap <= 0) gap += Math.PI * 2;
      // Measured 15 m out, not at the node: Chaikin rounding splays arms apart
      // right at the node, so two roads that lie together look divergent there.
      const far = end => { const q = model.sectionAt(end.seg, end.atStart ? Math.min(15, end.seg.L * .5) : end.seg.L - Math.min(15, end.seg.L * .5)); return Math.atan2(q.z - j.z, q.x - j.x); };
      let g2 = Math.abs(far(A) - far(B)); if (g2 > Math.PI) g2 = 2 * Math.PI - g2;
      if ((gap < 18 * Math.PI / 180 || g2 < 20 * Math.PI / 180) && A.seg !== B.seg) doomed.add(lesser(A.seg, B.seg).id);
    }
  }
  if (!doomed.size) break;
  for (const id of doomed) for (const e of model.segments[id].eids) edges[e].dead = true;
  compact();
  const orphan = largestComponent(); compact();
  log(`2. round ${round}: removed ${doomed.size} segments (${overlapCount} overlapping, ${doomed.size - overlapCount} knife-edge; +${orphan} orphaned edges)`);
}

/* ----------------------------------------- 3. merge crowded junctions */
{
  let merged = 0;
  for (let round = 0; round < 5; round++) {
    const deg = new Int32Array(nodes.length), wide = new Float64Array(nodes.length);
    for (const e of edges) { deg[e.a]++; deg[e.b]++; wide[e.a] = Math.max(wide[e.a], halfWidth(e)); wide[e.b] = Math.max(wide[e.b], halfWidth(e)); }
    const into = new Map();
    const root = n => { while (into.has(n)) n = into.get(n); return n; };
    let n0 = merged;
    for (const e of edges) {
      const a = root(e.a), b = root(e.b);
      if (a === b || deg[a] < 3 || deg[b] < 3) continue;
      const P = nodes[a].position, Q = nodes[b].position;
      // Each junction reaches about its widest road's half-width out; closer
      // than the two reaches together and their surfaces overlap.
      // Generous: two junctions a pavement-island apart read as one tangled
      // knot of slivers (Trousdale at Sunset); one bigger junction is cleaner.
      const gap = Math.max(14, (wide[a] + wide[b]) * 1.25 + 8);
      if (Math.hypot(P[0] - Q[0], P[2] - Q[2]) >= gap || Math.abs(P[1] - Q[1]) > 2 || nodes[a].layer !== nodes[b].layer) continue;
      nodes[a].position = [(P[0] + Q[0]) / 2, (P[1] + Q[1]) / 2, (P[2] + Q[2]) / 2];
      nodes[a].map = [nodes[a].position[0] / 10 + 768, nodes[a].position[2] / 10 + 512];
      into.set(b, a); merged++;
    }
    for (const e of edges) { e.a = root(e.a); e.b = root(e.b); }
    // Two edges now joining the same pair of nodes are one road.
    const pair = new Set();
    for (const e of edges) { const k = Math.min(e.a, e.b) * 1e6 + Math.max(e.a, e.b); if (pair.has(k)) e.dead = true; else pair.add(k); }
    compact();
    if (merged === n0) break;
  }
  const orphan = largestComponent(); compact();
  log(`3. crowded junctions merged: ${merged} (+${orphan} orphaned edges)`);
}

/* ---------------------------------------------- 4. declutter and de-stub */
/* Generated estate lanes all start from the same few arterial junctions, and
 * merging crowded junctions then piles them up: Sunset at Trousdale ended with
 * eleven arms, seven of them short lanes, drawn as a knot of pavement slivers.
 * A junction keeps its four most important arms plus any long ones; short,
 * lesser arms beyond that go. Then dead-end stubs under 60 m (roads that lead
 * nowhere) are pruned back to the junction they hang off. */
{
  let cut = 0, stubs = 0;
  for (let round = 0; round < 3; round++) {
    const inc = nodes.map(() => []);
    edges.forEach((e, k) => { if (!e.dead) { inc[e.a].push(k); inc[e.b].push(k); } });
    const P = nodes.map(n => n.position), len = k => { const e = edges[k]; return Math.hypot(P[e.a][0] - P[e.b][0], P[e.a][2] - P[e.b][2]); };
    // Follow an arm from junction v through plain (degree-2) nodes: its edges and length.
    const arm = (v, k) => {
      const ids = [k]; let L = len(k), cur = v, e = k;
      for (let guard = 0; guard < 500; guard++) {
        const E = edges[e], nx = E.a === cur ? E.b : E.a;
        if (inc[nx].length !== 2) return {ids, L, end: nx};
        const ne = inc[nx][0] === e ? inc[nx][1] : inc[nx][0];
        ids.push(ne); L += len(ne); cur = nx; e = ne;
      }
      return {ids, L, end: cur};
    };
    let changed = 0;
    for (let v = 0; v < nodes.length; v++) {
      if (inc[v].length <= 4) continue;
      const arms = inc[v].filter(k => !edges[k].dead).map(k => ({k, ...arm(v, k), rank: RANK[edges[k].kind] ?? 3}));
      arms.sort((a, b) => b.rank - a.rank || b.L - a.L);
      let keep = arms.length;
      for (const a of arms.slice(4).reverse()) {
        if (keep <= 4 || a.L > 80 || a.rank >= RANK.avenue) continue;
        for (const id of a.ids) edges[id].dead = true;
        keep--; changed++; cut++;
      }
    }
    // Dead-end stubs.
    const inc2 = nodes.map(() => []);
    edges.forEach((e, k) => { if (!e.dead) { inc2[e.a].push(k); inc2[e.b].push(k); } });
    for (let v = 0; v < nodes.length; v++) {
      if (inc2[v].length !== 1) continue;
      const k = inc2[v][0], kind = edges[k].kind;
      if (kind === 'freeway' || kind === 'ramp' || kind === 'tunnel') continue;
      const ids = [k]; let L = len(k), cur = v, e = k, end = null;
      for (let guard = 0; guard < 200; guard++) {
        const E = edges[e], nx = E.a === cur ? E.b : E.a;
        if (inc2[nx].length !== 2) { end = nx; break; }
        const ne = inc2[nx][0] === e ? inc2[nx][1] : inc2[nx][0];
        ids.push(ne); L += len(ne); cur = nx; e = ne;
      }
      if (end !== null && inc2[end].length >= 3 && L < 60) { for (const id of ids) edges[id].dead = true; changed++; stubs++; }
    }
    compact();
    if (!changed) break;
  }
  const orphan = largestComponent(); compact();
  log(`4. decluttered: ${cut} surplus junction arms, ${stubs} dead-end stubs (+${orphan} orphaned edges)`);
}

/* -------------------------------------------------------- 5. regrade */
/* Heights minimise, over every road,
 *
 *     integral of  (y - ground)^2  +  L^2 (dy/ds)^2   ds
 *
 * with L the kind's smoothing length: a quadratic, so one conjugate-gradient
 * solve over the whole graph, and junctions are consistent by construction
 * because roads share their junction nodes. Crossings without a junction add
 * a term holding the two decks CLEAR apart, on the side the map put them.
 * Edges still over their grade cap are stiffened and the solve repeated. */
function regrade() {
  const n = nodes.length, P = nodes.map(p => p.position);
  const kindOf = e => e.kind;
  const target = new Float64Array(n), weight = new Float64Array(n);
  for (const e of edges) {
    const len = Math.hypot(P[e.a][0] - P[e.b][0], P[e.a][2] - P[e.b][2]);
    // Tunnels keep the depth they were designed with; everything else aims for the ground.
    for (const v of [e.a, e.b]) {
      const want = e.kind === 'tunnel' ? P[v][1] : terrainHeight(P[v][0], P[v][2]);
      target[v] += want * len / 2; weight[v] += len / 2;
    }
  }
  for (let i = 0; i < n; i++) if (weight[i] > 0) target[i] /= weight[i];
  const stiff = edges.map(e => {
    const len = Math.max(1, Math.hypot(P[e.a][0] - P[e.b][0], P[e.a][2] - P[e.b][2]));
    return (SMOOTH[kindOf(e)] ?? 40) ** 2 / len;
  });
  const lens = edges.map(e => Math.max(1, Math.hypot(P[e.a][0] - P[e.b][0], P[e.a][2] - P[e.b][2])));

  // Crossings, with the side each deck is on taken from the raw heights.
  const cross = crossings().map(c => {
    const e = edges[c.e], f = edges[c.f];
    const ya = P[e.a][1] + (P[e.b][1] - P[e.a][1]) * c.t, yb = P[f.a][1] + (P[f.b][1] - P[f.a][1]) * c.u;
    return {...c, sign: ya >= yb ? 1 : -1};
  });
  const XW = 4000;                   // crossing term weight: effectively hard

  // Vertical curves. For each place a road runs THROUGH a node (the two edges
  // of an ordinary node, and each nearly straight pair across a junction) a
  // curvature term, so crests and dips are rounded instead of kinked: a sharp
  // crest throws a car off the road. Weight = C^4 * 2/(la+lb), C per kind.
  const CURVE = {freeway: 70, ramp: 40, tunnel: 50, boulevard: 34, avenue: 32, underpass: 30, street: 26, residential: 22, scenic: 20, dirt: 16};
  const triples = [];
  {
    const inc = nodes.map(() => []);
    edges.forEach((e, k) => { inc[e.a].push(k); inc[e.b].push(k); });
    for (let v = 0; v < n; v++) {
      const list = inc[v].map(k => {
        const e = edges[k], o = e.a === v ? e.b : e.a;
        const dx = P[o][0] - P[v][0], dz = P[o][2] - P[v][2], l = Math.max(1, Math.hypot(dx, dz));
        return {k, o, dx: dx / l, dz: dz / l, l};
      });
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        if (list.length > 2 && A.dx * B.dx + A.dz * B.dz > -.87) continue;   // not straight through (< 150 deg)
        const C = Math.min(CURVE[edges[A.k].kind] ?? 26, CURVE[edges[B.k].kind] ?? 26);
        triples.push({v, a: A.o, b: B.o, al: 1 / A.l, bl: 1 / B.l, w: C ** 4 * 2 / (A.l + B.l)});
      }
    }
  }

  // Junction planes. A real junction on a hillside is one tilted plane every
  // road passes through; roads arriving at different grades and blended
  // together sag and then crest, which throws a car. Each junction J gets three
  // unknowns (height c, tilts a, b); every node within its reach along its arms
  // is pulled onto c + a dx + b dz. The tilt is free, so a junction on a hill
  // still leans with the hill; a faint term prefers level junctions.
  const planes = [], planeTerms = [];
  {
    const inc = nodes.map(() => []);
    edges.forEach((e, k) => { inc[e.a].push(k); inc[e.b].push(k); });
    for (let v = 0; v < n; v++) {
      if (inc[v].length < 3) continue;
      const reach = Math.max(...inc[v].map(k => halfWidth(edges[k]))) + 16;
      const id = n + planes.length * 3;
      planes.push(v);
      // Walk out along every arm while within reach (plan distance).
      const seen = new Map([[v, 0]]), stack = [v];
      while (stack.length) {
        const u = stack.pop(), du = seen.get(u);
        for (const k of inc[u]) {
          const e = edges[k], o = e.a === u ? e.b : e.a, d = du + lens[k];
          if (d > reach || (seen.has(o) && seen.get(o) <= d)) continue;
          seen.set(o, d); stack.push(o);
        }
      }
      for (const [u, d] of seen) planeTerms.push({i: u, c: id, dx: P[u][0] - P[v][0], dz: P[u][2] - P[v][2], w: 60});
    }
  }
  const N = n + planes.length * 3, SLOPE_REG = 400;
  let y = new Float64Array(N);
  for (let i = 0; i < n; i++) y[i] = P[i][1];
  planes.forEach((v, j) => { y[n + j * 3] = P[v][1]; });
  const deck = (id, t, v) => v[edges[id].a] * (1 - t) + v[edges[id].b] * t;
  // A x for the quadratic form; `active` crossings contribute (ye - yf)^2.
  const apply = (x, out, active) => {
    for (let i = 0; i < n; i++) out[i] = weight[i] * x[i];
    for (let j = 0; j < planes.length; j++) { const c = n + j * 3; out[c] = 0; out[c + 1] = SLOPE_REG * x[c + 1]; out[c + 2] = SLOPE_REG * x[c + 2]; }
    for (const q of planeTerms) {
      const r = q.w * (x[q.i] - x[q.c] - x[q.c + 1] * q.dx - x[q.c + 2] * q.dz);
      out[q.i] += r; out[q.c] -= r; out[q.c + 1] -= r * q.dx; out[q.c + 2] -= r * q.dz;
    }
    for (let k = 0; k < edges.length; k++) {
      const e = edges[k], d = stiff[k] * (x[e.a] - x[e.b]);
      out[e.a] += d; out[e.b] -= d;
    }
    for (const t of triples) {
      const r = t.w * (t.al * x[t.a] + t.bl * x[t.b] - (t.al + t.bl) * x[t.v]);
      out[t.a] += r * t.al; out[t.b] += r * t.bl; out[t.v] -= r * (t.al + t.bl);
    }
    for (const c of active) {
      const diff = XW * (deck(c.e, c.t, x) - deck(c.f, c.u, x));
      const e = edges[c.e], f = edges[c.f];
      out[e.a] += diff * (1 - c.t); out[e.b] += diff * c.t;
      out[f.a] -= diff * (1 - c.u); out[f.b] -= diff * c.u;
    }
  };
  const rhs = (active) => {
    const b = new Float64Array(N);
    for (let i = 0; i < n; i++) b[i] = weight[i] * target[i];
    for (const c of active) {
      const v = XW * CLEAR * c.sign, e = edges[c.e], f = edges[c.f];
      b[e.a] += v * (1 - c.t); b[e.b] += v * c.t; b[f.a] -= v * (1 - c.u); b[f.b] -= v * c.u;
    }
    return b;
  };
  const solve = (active, iters = 3000) => {
    // Jacobi-preconditioned conjugate gradient, warm-started from y.
    const b = rhs(active), r = new Float64Array(N), Ap = new Float64Array(N), diag = new Float64Array(N);
    for (let i = 0; i < n; i++) diag[i] = weight[i];
    for (let j = 0; j < planes.length; j++) { diag[n + j * 3 + 1] = SLOPE_REG; diag[n + j * 3 + 2] = SLOPE_REG; }
    for (const q of planeTerms) { diag[q.i] += q.w; diag[q.c] += q.w; diag[q.c + 1] += q.w * q.dx * q.dx; diag[q.c + 2] += q.w * q.dz * q.dz; }
    edges.forEach((e, k) => { diag[e.a] += stiff[k]; diag[e.b] += stiff[k]; });
    for (const t of triples) { diag[t.a] += t.w * t.al ** 2; diag[t.b] += t.w * t.bl ** 2; diag[t.v] += t.w * (t.al + t.bl) ** 2; }
    for (const c of active) {
      const e = edges[c.e], f = edges[c.f];
      diag[e.a] += XW * (1 - c.t) ** 2; diag[e.b] += XW * c.t ** 2; diag[f.a] += XW * (1 - c.u) ** 2; diag[f.b] += XW * c.u ** 2;
    }
    apply(y, Ap, active);
    for (let i = 0; i < N; i++) r[i] = b[i] - Ap[i];
    const z = r.map((v, i) => v / (diag[i] || 1)), p = Float64Array.from(z);
    let rz = z.reduce((s, v, i) => s + v * r[i], 0);
    const b2 = Math.sqrt(b.reduce((s, v) => s + v * v, 0)) || 1;
    let it = 0;
    for (; it < iters; it++) {
      apply(p, Ap, active);
      const alpha = rz / p.reduce((s, v, i) => s + v * Ap[i], 0);
      let rr = 0;
      for (let i = 0; i < N; i++) { y[i] += alpha * p[i]; r[i] -= alpha * Ap[i]; rr += r[i] * r[i]; }
      if (Math.sqrt(rr) / b2 < 1e-9) break;
      let rz2 = 0;
      for (let i = 0; i < N; i++) { z[i] = r[i] / (diag[i] || 1); rz2 += z[i] * r[i]; }
      const beta = rz2 / rz; rz = rz2;
      for (let i = 0; i < N; i++) p[i] = z[i] + beta * p[i];
    }
    return it;
  };

  let active = [];
  for (let round = 0; round < 8; round++) {
    const its = solve(active);
    // Activate every crossing that is short of clearance; keep ones already active.
    const now = new Set(active);
    for (const c of cross) if (!now.has(c) && c.sign * (deck(c.e, c.t, y) - deck(c.f, c.u, y)) < CLEAR - .05) now.add(c);
    let over = 0;
    edges.forEach((e, k) => {
      const g = Math.abs(y[e.a] - y[e.b]) / lens[k];
      if (g > capOf(e)) { stiff[k] *= 2.5; over++; }
    });
    const added = now.size - active.length;
    active = [...now];
    log(`5. regrade round ${round}: CG ${its} its, crossings held ${active.length}/${cross.length}, edges over cap ${over}`);
    if (!added && !over) break;
  }
  // The solve makes grades small on average; the cap is a hard limit, so finish
  // with the two grade envelopes: the highest profile that never climbs faster
  // than the cap from any point (cuts the peaks) and the lowest (fills the dips).
  // Each is exactly Lipschitz under the per-kind cap; so is their mean, which
  // splits the earthwork between cut and fill instead of only digging.
  const envelope = sign => {
    const v = Float64Array.from(y), adj = nodes.map(() => []);
    edges.forEach((e, k) => { const c = capOf(e) * lens[k]; adj[e.a].push([e.b, c]); adj[e.b].push([e.a, c]); });
    const heap = new Heap();
    for (let i = 0; i < n; i++) heap.push(i, sign * v[i]);
    while (heap.size) {
      const {node, cost} = heap.pop();
      if (cost !== sign * v[node]) continue;
      for (const [m, c] of adj[node]) {
        const cand = v[node] + sign * c;
        if (sign * cand < sign * v[m]) { v[m] = cand; heap.push(m, sign * cand); }
      }
    }
    return v;
  };
  const upper = envelope(1), lower = envelope(-1);
  // Where the two differ, the mean split the earthwork. That is right on a
  // hillside and wrong in the city: a canyon too short for its rise made the
  // lower envelope LIFT the flat grid at its foot (Cahuenga, Fairfax and
  // Fountain rose up to 55 m). So the split is weighted: city nodes take the
  // upper envelope (never lifted), hill roads the mean, blended over a few
  // hundred metres of graph, and one more upper envelope then restores the
  // cap exactly - it can only lower, so the city stays on the ground and an
  // infeasible climb is paid for with a cut in the ridge.
  const HILL = new Set(['scenic', 'dirt']), hill = new Float64Array(n), deg = new Float64Array(n);
  edges.forEach(e => { const h = HILL.has(e.kind) ? 1 : 0; for (const v of [e.a, e.b]) { hill[v] += h; deg[v]++; } });
  let share = Float64Array.from(hill, (h, i) => deg[i] ? (h / deg[i] > 0 ? .5 : 0) : 0);   // weight on the lower envelope
  for (let it = 0; it < 12; it++) {              // diffuse: ~12 edges each way
    const next = Float64Array.from(share), cnt = new Float64Array(n).fill(1);
    edges.forEach(e => { next[e.a] += share[e.b]; cnt[e.a]++; next[e.b] += share[e.a]; cnt[e.b]++; });
    for (let i = 0; i < n; i++) share[i] = Math.min(.5, next[i] / cnt[i] * (hill[i] ? 1.6 : 1));
  }
  // Only in the gentle areas: elsewhere the canyons keep the plain mean (the
  // weighting there pushed Mount Lee's climbs 40 m deeper into the ridge).
  const gentleNode = new Uint8Array(n);
  edges.forEach(e => { if (capOf(e) !== undefined && e.gentle) { gentleNode[e.a] = 1; gentleNode[e.b] = 1; } });
  for (let i = 0; i < n; i++) if (!gentleNode[i] || process.env.ENVELOPE === 'mean') share[i] = .5;
  for (let i = 0; i < n; i++) y[i] = upper[i] + (lower[i] - upper[i]) * share[i];
  // The envelopes leave straight-line cones with sharp vertical kinks where
  // they meet the solved profile. Round them: a few length-weighted averaging
  // passes along plain stretches of road (junction nodes keep their height,
  // the planes were solved with them), then the cap again.
  {
    const nb = nodes.map(() => []);
    edges.forEach((e, k) => { nb[e.a].push([e.b, lens[k]]); nb[e.b].push([e.a, lens[k]]); });
    // Decks at a crossing were solved to clear each other; leave them, and a
    // couple of nodes either side, exactly where the solve put them.
    const pinned = new Uint8Array(n);
    for (const c of cross) for (const k of [c.e, c.f]) for (const v of [edges[k].a, edges[k].b]) {
      pinned[v] = 1; for (const [o] of nb[v]) { pinned[o] = 1; for (const [o2] of nb[o]) pinned[o2] = 1; }
    }
    for (let it = 0; it < 10; it++) {
      const next = Float64Array.from(y.subarray(0, n));
      for (let i = 0; i < n; i++) {
        if (nb[i].length !== 2 || pinned[i]) continue;
        const [[a, la], [b, lb]] = nb[i];
        next[i] = .5 * y[i] + .5 * (y[a] * lb + y[b] * la) / (la + lb);
      }
      for (let i = 0; i < n; i++) y[i] = next[i];
    }
  }
  const capped = envelope(1);
  for (let i = 0; i < n; i++) y[i] = capped[i];
  log(`   envelopes: mean |lower-upper| ${(upper.reduce((s, u, i) => s + Math.abs(lower[i] - u), 0) / n).toFixed(2)} m, nodes on the cut-only side ${share.filter(v => v < .01).length}`);
  nodes.forEach((node, i) => { node.position[1] = +y[i].toFixed(3); });
  const short = cross.filter(c => c.sign * (deck(c.e, c.t, y) - deck(c.f, c.u, y)) < CLEAR - .3).length;
  log(`   crossings still short of ${CLEAR} m clearance: ${short}`);
}
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(node, cost) { const a = this.a; a.push({node, cost}); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].cost <= a[i].cost) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let s = i; if (l < a.length && a[l].cost < a[s].cost) s = l; if (r < a.length && a[r].cost < a[s].cost) s = r; if (s === i) break; [a[s], a[i]] = [a[i], a[s]]; i = s; } } return top; }
}
regrade();

/* --------------------------------------------------------------- write */
const out = {...raw, version: (raw.version || 0) + 1, cleaned: new Date().toISOString(),
  nodes: nodes.map(({id, map, position, layer}) => ({id, map, position, layer})),
  edges: edges.map(({dead, gentle, ...e}, id) => ({...e, id}))};
writeFileSync(OUT, JSON.stringify(out));
log(`wrote ${OUT.pathname.split('/').slice(-3).join('/')}: ${out.nodes.length} nodes, ${out.edges.length} edges`);
