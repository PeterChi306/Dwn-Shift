#!/usr/bin/env node
/* Dead ends (2026-09-27): roads.json -> roads.json, in place.
 *
 *   node tools/fix_dead_ends.mjs [--dry]
 *
 * Road generation and cleaning left ~80 streets that simply stop in the
 * city (Figueroa, Broadway and Main at the north edge of downtown, Hollywood
 * Boulevard, Pico...). Each dead end of a city street, away from the map
 * edge, is carried on in the direction it was going to the best road node
 * ahead (within 280 m and 35 degrees), if the straight way there crosses no
 * other road, stays clear of the roads beside it and is not too steep.
 * New edges carry gen:'de' and are replaced on a rerun.
 * Run LAST (after add_freeway_crossings.mjs, which rebuilds the ramps).
 */
import {readFileSync, writeFileSync} from 'node:fs';

const FILE = new URL('../assets/world/roads.json', import.meta.url);
const data = JSON.parse(readFileSync(FILE));
const DRY = process.argv.includes('--dry');
{
  const gen = data.edges.filter(e => e.gen === 'de');
  if (gen.length) {
    data.edges = data.edges.filter(e => e.gen !== 'de');
    const used = new Set(); for (const e of data.edges) { used.add(e.a); used.add(e.b); }
    const map = new Map();
    data.nodes = data.nodes.filter(n => used.has(n.id)).map((n, i) => { map.set(n.id, i); return {...n, id: i}; });
    data.edges = data.edges.map((e, i) => ({...e, id: i, a: map.get(e.a), b: map.get(e.b)}));
    console.log(`removed ${gen.length} previously generated edges`);
  }
}
const nodes = data.nodes, edges = data.edges, P = nodes.map(n => n.position);
const inc = nodes.map(() => []);
edges.forEach((e, k) => { inc[e.a].push(k); inc[e.b].push(k); });
const other = (k, v) => edges[k].a === v ? edges[k].b : edges[k].a;
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
const CITY = new Set(['street', 'avenue', 'boulevard', 'residential', 'underpass']);
const HALF = {freeway: 20, ramp: 4.5, boulevard: 17, avenue: 11, street: 7, underpass: 7, residential: 6, scenic: 5, tunnel: 7, dirt: 3};
function cross(a, b, c, d) {
  const rx = b[0] - a[0], rz = b[2] - a[2], sx = d[0] - c[0], sz = d[2] - c[2], den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return false;
  const qx = c[0] - a[0], qz = c[2] - a[2], t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
  return t > 1e-4 && t < 1 - 1e-4 && u > 1e-4 && u < 1 - 1e-4;
}
const distSeg = (p, a, b) => {
  const dx = b[0] - a[0], dz = b[2] - a[2], l2 = dx * dx + dz * dz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / l2)) : 0;
  return {d: Math.hypot(p[0] - a[0] - dx * t, p[2] - a[2] - dz * t), y: a[1] + (b[1] - a[1]) * t};
};
const C = 60, grid = new Map();
edges.forEach((e, k) => {
  const a = P[e.a], b = P[e.b];
  for (let gx = Math.floor(Math.min(a[0], b[0]) / C); gx <= Math.floor(Math.max(a[0], b[0]) / C); gx++)
    for (let gz = Math.floor(Math.min(a[2], b[2]) / C); gz <= Math.floor(Math.max(a[2], b[2]) / C); gz++) {
      const key = gx * 65536 + gz; (grid.get(key) || grid.set(key, []).get(key)).push(k);
    }
});
const near = (x, z, r) => {
  const out = new Set();
  for (let gx = Math.floor((x - r) / C); gx <= Math.floor((x + r) / C); gx++)
    for (let gz = Math.floor((z - r) / C); gz <= Math.floor((z + r) / C); gz++) for (const k of grid.get(gx * 65536 + gz) || []) out.add(k);
  return out;
};
const hops = (v, n) => { const seen = new Set([v]); let front = [v]; for (let i = 0; i < n; i++) { const next = []; for (const u of front) for (const k of inc[u]) { const w = other(k, u); if (!seen.has(w)) { seen.add(w); next.push(w); } } front = next; } return seen; };

const newNodes = [], newEdges = [], done = [], why = {};
const no = r => { why[r] = (why[r] || 0) + 1; };
let roadId = Math.max(...edges.map(e => e.road ?? 0)) + 1;
for (let v = 0; v < nodes.length; v++) {
  if (inc[v].length !== 1) continue;
  const e = edges[inc[v][0]]; if (!CITY.has(e.kind)) continue;
  const p = P[v];
  if (7680 - Math.abs(p[0]) < 400 || 5120 - Math.abs(p[2]) < 400) { no('edge'); continue; }
  const back = P[other(inc[v][0], v)], dir = norm(p[0] - back[0], p[2] - back[2]);
  const mine = hops(v, 6);
  const cands = [];
  for (const k of near(p[0], p[2], 280)) for (const w of [edges[k].a, edges[k].b]) {
    if (mine.has(w) || cands.some(c => c.w === w)) continue;
    if (!inc[w].some(q => CITY.has(edges[q].kind)) || inc[w].some(q => edges[q].kind === 'freeway' || edges[q].kind === 'ramp')) continue;
    const q = P[w], L = d2(p, q); if (L < 12 || L > 280) continue;
    const to = norm(q[0] - p[0], q[2] - p[2]), cos = to[0] * dir[0] + to[1] * dir[1];
    if (cos < .82) continue;
    // No knife edge: arriving nearly along one of the target's own arms makes a crest.
    if (inc[w].some(k2 => { const o = P[other(k2, w)], [ux, uz] = norm(o[0] - q[0], o[2] - q[2]); return -(ux * to[0] + uz * to[1]) > Math.cos(35 / 57.3); })) continue;
    if (inc[w].length >= 3 && inc[w].some(k2 => edges[k2].kind === 'scenic')) continue;
    cands.push({w, L, score: L * (2 - cos) + (inc[w].length === 1 ? -40 : 0)});
  }
  cands.sort((a, b) => a.score - b.score);
  let got = null;
  for (const c of cands.slice(0, 12)) {
    const q = P[c.w];
    if (Math.abs(q[1] - p[1]) / c.L > .1) { no('grade'); continue; }
    let bad = false;
    for (const k of near((p[0] + q[0]) / 2, (p[2] + q[2]) / 2, c.L / 2 + 30)) {
      const E = edges[k]; if (E.a === c.w || E.b === c.w || E.a === v || E.b === v) continue;
      if (cross(p, q, P[E.a], P[E.b])) { bad = true; no('cross'); break; }
    }
    if (bad) continue;
    // Clear of the roads beside the new stretch (junction ends excepted).
    const n = Math.max(1, Math.round(c.L / 20));
    for (let i = 1; i < n && !bad; i++) {
      const t = i / n, x = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
      if (t * c.L < 25 || (1 - t) * c.L < 25) continue;
      for (const k of near(x[0], x[2], 45)) {
        const E = edges[k], r = distSeg(x, P[E.a], P[E.b]);
        if (Math.abs(r.y - x[1]) > 6.5) continue;
        if (r.d < (HALF[E.kind] ?? 7) + 8) { bad = true; no('clear'); break; }
      }
    }
    for (const dn of done) if (d2(dn, q) < 30 || d2(dn, p) < 30) bad = true;
    if (bad) continue;
    got = c; break;
  }
  if (!got) { no('none'); continue; }
  const q = P[got.w], n = Math.max(1, Math.round(got.L / 20)), road = roadId++, kind = e.kind === 'underpass' ? 'street' : e.kind;
  let prev = v;
  for (let i = 1; i < n; i++) {
    const t = i / n, id = nodes.length + newNodes.length, x = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
    newNodes.push({id, map: [x[0] / 10 + 768, x[2] / 10 + 512], position: [+x[0].toFixed(2), +x[1].toFixed(3), +x[2].toFixed(2)], layer: 'deadend'});
    newEdges.push({a: prev, b: id, road, name: e.name, kind, width: e.width, lanes: e.lanes, district: e.district, gen: 'de'});
    prev = id;
  }
  newEdges.push({a: prev, b: got.w, road, name: e.name, kind, width: e.width, lanes: e.lanes, district: e.district, gen: 'de'});
  done.push(p, q);
  console.log(`  ${e.name} @${Math.round(p[0])},${Math.round(p[2])} -> ${Math.round(got.L)} m`);
}
console.log('dead ends joined', newEdges.length ? new Set(newEdges.map(e => e.road)).size : 0, 'not joined', JSON.stringify(why));
if (!DRY) {
  data.nodes = [...nodes, ...newNodes];
  data.edges = [...edges, ...newEdges].map((e, id) => ({...e, id}));
  data.version = (data.version || 0) + 1;
  writeFileSync(FILE, JSON.stringify(data));
  console.log(`wrote roads.json: ${data.nodes.length} nodes, ${data.edges.length} edges`);
}
