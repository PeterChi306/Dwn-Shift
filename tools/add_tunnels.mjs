#!/usr/bin/env node
/* Tunnels (2026-10-02): roads.json -> roads.json, in place.
 *
 *   node tools/add_tunnels.mjs [--dry]
 *
 * The map had three short bores (~400 m bored in all), so you rarely
 * heard an engine inside a tunnel. Each entry in TUNNELS is a new tunnel road
 * between two existing road nodes on either side of a hill: a gentle
 * quadratic curve in plan (`bulge` = sideways pull of the control point, as a
 * fraction of the length; + is to the left going a -> b), a straight grade in
 * elevation. Endpoints snap to the nearest suitable node (a dead end or a
 * plain road node, so the tunnel makes at most a T junction).
 *
 * Every tunnel is checked before it is written, and a failing one is
 * skipped with the reason:
 *   - grade <= 5.5 %, and arriving at least 50 degrees off the node's own arms;
 *   - the hill: inside the portals the natural ground is >= 11 m over the road
 *     on the centreline AND 22 m to either side (roads.js bores only under
 *     8 m of cover; the sides keep the tube inside the hill, not in a spur);
 *   - approaches (endpoint -> portal) 15..140 m: a short portal cutting;
 *   - no other road near it at its own level: open stretches keep 12 m
 *     clear of other carriageways, bored ones need any road over them to be
 *     18 m higher (the tube roof is 6.6 m, its crown 8.5 m);
 *   - new tunnels keep clear of each other the same way.
 * New edges carry gen:'tn' and are replaced on a rerun. Run LAST, after
 * fix_dead_ends.mjs (see the tool order in the world notes).
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {naturalHeight as nat} from '../world/network.js';

const FILE = new URL('../assets/world/roads.json', import.meta.url);
const data = JSON.parse(readFileSync(FILE));
const DRY = process.argv.includes('--dry');

// [name, district, a [x, z], b [x, z], bulge]
const TUNNELS = [
  // The long one: from Pasadena's Fair Oaks Avenue under the whole mountain
  // to the Hollywood ridge, ~3.2 km and up to ~290 m of rock overhead.
  ['Santerra Mountain Tunnel', 'Hollywood Hills', [1200, -3627], [-1700, -2440], .2],
  ['Fryman Ridge Tunnel', 'Hollywood Hills', [1200, -3338], [286, -2621], .2],
  ['Hollywood Boulevard Tunnel', 'Hollywood Hills', [-5610, -1060], [-7072, -622], .2],
  ['Sierra Madre Tunnel', 'Pasadena', [3830, -3197], [3194, -3345], .2],
  ['Sunset Hill Tunnel', 'Silver Lake', [696, -1495], [1051, -1355], 0],
];

{ // a rerun replaces what the last run made
  const gen = data.edges.filter(e => e.gen === 'tn');
  if (gen.length) {
    data.edges = data.edges.filter(e => e.gen !== 'tn');
    const used = new Set(); for (const e of data.edges) { used.add(e.a); used.add(e.b); }
    const map = new Map();
    data.nodes = data.nodes.filter(n => used.has(n.id)).map((n, i) => { map.set(n.id, i); return {...n, id: i}; });
    data.edges = data.edges.map((e, i) => ({...e, id: i, a: map.get(e.a), b: map.get(e.b)}));
    console.log(`removed ${gen.length} previously generated tunnel edges`);
  }
}
const nodes = data.nodes, edges = data.edges, P = nodes.map(n => n.position);
const inc = nodes.map(() => []);
edges.forEach((e, k) => { inc[e.a].push(k); inc[e.b].push(k); });
const other = (k, v) => edges[k].a === v ? edges[k].b : edges[k].a;
const ENDS = new Set(['street', 'avenue', 'residential', 'scenic', 'boulevard']);
const HALF = {freeway: 20, ramp: 4.5, boulevard: 17, avenue: 11, street: 7, underpass: 7, residential: 6, scenic: 5, tunnel: 7, dirt: 3};
const C = 60, grid = new Map();
const addGrid = (k, a, b) => {
  for (let gx = Math.floor(Math.min(a[0], b[0]) / C); gx <= Math.floor(Math.max(a[0], b[0]) / C); gx++)
    for (let gz = Math.floor(Math.min(a[2], b[2]) / C); gz <= Math.floor(Math.max(a[2], b[2]) / C); gz++) {
      const key = gx * 65536 + gz; (grid.get(key) || grid.set(key, []).get(key)).push(k);
    }
};
edges.forEach((e, k) => addGrid(k, P[e.a], P[e.b]));
const near = (x, z, r) => {
  const out = new Set();
  for (let gx = Math.floor((x - r) / C); gx <= Math.floor((x + r) / C); gx++)
    for (let gz = Math.floor((z - r) / C); gz <= Math.floor((z + r) / C); gz++) for (const k of grid.get(gx * 65536 + gz) || []) out.add(k);
  return out;
};
const distSeg = (p, a, b) => {
  const dx = b[0] - a[0], dz = b[2] - a[2], l2 = dx * dx + dz * dz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / l2)) : 0;
  return {d: Math.hypot(p[0] - a[0] - dx * t, p[2] - a[2] - dz * t), y: a[1] + (b[1] - a[1]) * t};
};
function snap([x, z]) {
  let best = -1, bd = 30;
  for (const k of near(x, z, 30)) for (const v of [edges[k].a, edges[k].b]) {
    if (inc[v].length > 2 || nodes[v].layer !== 'surface' || !inc[v].every(q => ENDS.has(edges[q].kind))) continue;
    const d = Math.hypot(P[v][0] - x, P[v][2] - z); if (d < bd) { bd = d; best = v; }
  }
  return best;
}
const armsClear = (v, dx, dz) => inc[v].every(k => {
  const o = P[other(k, v)], ox = o[0] - P[v][0], oz = o[2] - P[v][2];
  return (ox * dx + oz * dz) / (Math.hypot(ox, oz) * Math.hypot(dx, dz)) < Math.cos(50 / 57.3);
});

const newNodes = [], newEdges = [], placed = [];
let roadId = Math.max(...edges.map(e => e.road ?? 0)) + 1;
for (const [name, district, ea, eb, bulge] of TUNNELS) {
  const A = snap(ea), B = snap(eb);
  if (A < 0 || B < 0) { console.log(`SKIP ${name}: no endpoint node`); continue; }
  const a = P[A], b = P[B], L0 = Math.hypot(b[0] - a[0], b[2] - a[2]), ux = (b[0] - a[0]) / L0, uz = (b[2] - a[2]) / L0;
  const cx = (a[0] + b[0]) / 2 - uz * bulge * L0, cz = (a[2] + b[2]) / 2 + ux * bulge * L0;
  const bez = t => [(1 - t) ** 2 * a[0] + 2 * t * (1 - t) * cx + t * t * b[0], (1 - t) ** 2 * a[2] + 2 * t * (1 - t) * cz + t * t * b[2]];
  // Dense arc-length table, then nodes every ~36 m.
  const fine = []; let L = 0;
  for (let k = 0; k <= 400; k++) { const p = bez(k / 400); if (k) L += Math.hypot(p[0] - fine[k - 1][0], p[1] - fine[k - 1][1]); fine.push([p[0], p[1], L]); }
  const at = s => { let k = 1; while (k < 400 && fine[k][2] < s) k++; const p = fine[k - 1], q = fine[k], f = (s - p[2]) / Math.max(1e-6, q[2] - p[2]); return [p[0] + (q[0] - p[0]) * f, a[1] + (b[1] - a[1]) * s / L, p[1] + (q[1] - p[1]) * f]; };
  const why = [];
  const grade = Math.abs(b[1] - a[1]) / L;
  if (grade > .055) why.push(`grade ${(grade * 100).toFixed(1)}%`);
  const t0 = at(6), t1 = at(L - 6);
  if (!armsClear(A, t0[0] - a[0], t0[2] - a[2]) || !armsClear(B, t1[0] - b[0], t1[2] - b[2])) why.push('knife-edge junction');
  // Cover profile every 10 m.
  const S = [], n = Math.ceil(L / 10);
  for (let k = 0; k <= n; k++) {
    const s = L * k / n, p = at(s), q = at(Math.min(L, s + 2)), r = at(Math.max(0, s - 2));
    const tx = q[0] - r[0], tz = q[2] - r[2], tl = Math.hypot(tx, tz) || 1, nx = -tz / tl, nz = tx / tl;
    S.push({s, p, cover: Math.min(nat(p[0], p[2]), nat(p[0] + nx * 22, p[2] + nz * 22), nat(p[0] - nx * 22, p[2] - nz * 22)) - p[1], top: nat(p[0], p[2]) - p[1]});
  }
  const f = S.findIndex(q => q.cover > 12), l = S.length - 1 - [...S].reverse().findIndex(q => q.cover > 12);
  if (f < 0) why.push('no hill');
  else {
    const o0 = S[f].s, o1 = L - S[l].s;
    if (o0 < 15 || o1 < 15 || o0 > 140 || o1 > 140) why.push(`approaches ${Math.round(o0)} / ${Math.round(o1)} m`);
    const thin = S.slice(f, l + 1).find(q => q.cover < 11);
    if (thin) why.push(`thin cover ${thin.cover.toFixed(1)} m at ${Math.round(thin.s)} m`);
    for (const q of S) {
      if (q.s < 25 || q.s > L - 25) continue;
      const open = q.s < S[f].s || q.s > S[l].s;
      for (const k of near(q.p[0], q.p[2], 120)) {
        const e = edges[k]; if (e.a === A || e.b === A || e.a === B || e.b === B) continue;
        const r = distSeg(q.p, P[e.a], P[e.b]), dy = r.y - q.p[1];
        if (r.d < (HALF[e.kind] ?? 7) + (open ? 12 : 18) && dy > -12 && dy < (open ? 40 : 18)) { why.push(`${e.name} ${open ? 'beside the cutting' : 'over the bore'} at ${Math.round(q.s)} m (dy ${dy.toFixed(1)})`); break; }
        // A LOWER road beside a bore is graded into the hill with ~45 degree
        // banks: they must not reach the tube (that cut the Outpost bore open
        // over the Cahuenga pass). The first 50 m inside each portal are the
        // headwall's business: the road the tunnel leaves from is right there.
        if (!open && q.s > S[f].s + 50 && q.s < S[l].s - 50 && dy < 18 && r.d < (HALF[e.kind] ?? 7) + 14 + Math.max(0, 10 - dy)) { why.push(`${e.name} cuts the hill beside the bore at ${Math.round(q.s)} m (dy ${dy.toFixed(1)}, ${Math.round(r.d)} m off)`); break; }
      }
      for (const o of placed) for (let i = 0; i < o.length - 1; i++) {
        const r = distSeg(q.p, o[i], o[i + 1]);
        if (r.d < 40 && Math.abs(r.y - q.p[1]) < 20) { why.push('too close to another new tunnel'); break; }
      }
      if (why.length) break;
    }
    if (!why.length) console.log(`${name}: ${Math.round(L)} m, ~${Math.round(S[l].s - S[f].s)} m under the hill, approaches ${Math.round(o0)} / ${Math.round(o1)} m, cover ${Math.round(Math.min(...S.slice(f, l + 1).map(q => q.top)))}..${Math.round(Math.max(...S.map(q => q.top)))} m, grade ${(grade * 100).toFixed(1)}%`);
  }
  if (why.length) { console.log(`SKIP ${name}: ${why.join('; ')}`); continue; }
  const m = Math.max(2, Math.round(L / 36)), road = roadId++, line = [a];
  let prev = A;
  for (let i = 1; i < m; i++) {
    const x = at(L * i / m), id = nodes.length + newNodes.length;
    newNodes.push({id, map: [x[0] / 10 + 768, x[2] / 10 + 512], position: [+x[0].toFixed(2), +x[1].toFixed(3), +x[2].toFixed(2)], layer: 'surface'});
    newEdges.push({a: prev, b: id, road, name, kind: 'tunnel', width: 15, lanes: 2, district, gen: 'tn'});
    prev = id; line.push(x);
  }
  newEdges.push({a: prev, b: B, road, name, kind: 'tunnel', width: 15, lanes: 2, district, gen: 'tn'});
  line.push(b); placed.push(line);
}
console.log(`tunnels added: ${placed.length} of ${TUNNELS.length}`);
if (!DRY) {
  data.nodes = [...nodes, ...newNodes];
  data.edges = [...edges, ...newEdges].map((e, id) => ({...e, id}));
  data.version = (data.version || 0) + 1;
  writeFileSync(FILE, JSON.stringify(data));
  console.log(`wrote roads.json: ${data.nodes.length} nodes, ${data.edges.length} edges`);
}
