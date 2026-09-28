#!/usr/bin/env node
/* Freeway interchanges (2026-09-26): roads.json -> roads.json, in place.
 *
 *   node tools/add_interchanges.mjs [--dry]
 *
 * The generated freeways crossed ~200 km of city with a handful of ramps, so
 * you could see the freeway from almost any street and not get onto it. This
 * adds, without touching any existing road or height:
 *
 *   1. DIAMONDS where an arterial crosses a freeway (it passes over or under
 *      it): four ramps, two each side, leaving the freeway ~230 m before and
 *      after the bridge and meeting the cross street ~75 m out from the
 *      freeway's edge, at one junction per side (the diamond's two lights).
 *   2. SLIP RAMPS where a surface street runs alongside a freeway at grade
 *      (the flat connector downtown): one diagonal ramp every ~1.2 km.
 *
 * Every ramp is a Bezier leaving the freeway at 35 degrees, sampled every
 * ~22 m, and is only kept if it stays clear of every other road (no crossing,
 * no overlap outside the two junctions it makes) and its grade is under 7%.
 * Heights: eased from the freeway's to the street's, so no regrade is needed.
 * Generated edges carry gen:'ix' and are replaced on the next run.
 */
import {readFileSync, writeFileSync} from 'node:fs';

const FILE = new URL('../assets/world/roads.json', import.meta.url);
const data = JSON.parse(readFileSync(FILE));
const DRY = process.argv.includes('--dry');

// Drop any previous run's ramps (and their private nodes).
{
  const gen = data.edges.filter(e => e.gen === 'ix');
  if (gen.length) {
    data.edges = data.edges.filter(e => e.gen !== 'ix');
    const used = new Set(); for (const e of data.edges) { used.add(e.a); used.add(e.b); }
    const map = new Map();
    data.nodes = data.nodes.filter(n => used.has(n.id)).map((n, i) => { map.set(n.id, i); return {...n, id: i}; });
    data.edges = data.edges.map((e, i) => ({...e, id: i, a: map.get(e.a), b: map.get(e.b)}));
    console.log(`removed ${gen.length} previously generated ramp edges`);
  }
}
const nodes = data.nodes, edges = data.edges, P = nodes.map(n => n.position);
const HALF = {freeway: 20, ramp: 4.5, boulevard: 17, avenue: 11, street: 7, underpass: 7, residential: 5, scenic: 4, tunnel: 6, dirt: 3};
const half = e => HALF[e.kind] ?? (e.width || 10) / 2;
const inc = nodes.map(() => []);
edges.forEach((e, k) => { inc[e.a].push(k); inc[e.b].push(k); });
const other = (k, v) => edges[k].a === v ? edges[k].b : edges[k].a;
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
const SURFACE = new Set(['avenue', 'boulevard', 'street', 'underpass']);
const CROSS_RANK = {boulevard: 4, avenue: 3, street: 2, underpass: 2};

// Edge grid for clearance tests.
const C = 50, grid = new Map();
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
const distSeg = (p, a, b) => {
  const dx = b[0] - a[0], dz = b[2] - a[2], l2 = dx * dx + dz * dz;
  const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[2] - a[2]) * dz) / l2)) : 0;
  return {d: Math.hypot(p[0] - a[0] - dx * t, p[2] - a[2] - dz * t), y: a[1] + (b[1] - a[1]) * t};
};
function segCross(a, b, c, d) {
  const rx = b[0] - a[0], rz = b[2] - a[2], sx = d[0] - c[0], sz = d[2] - c[2], den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return false;
  const qx = c[0] - a[0], qz = c[2] - a[2], t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
  return t > 1e-4 && t < 1 - 1e-4 && u > 1e-4 && u < 1 - 1e-4;
}
/** A plain freeway node: exactly two freeway edges and nothing else. */
const plainFw = v => inc[v].length === 2 && inc[v].every(k => edges[k].kind === 'freeway');
/** Walk along the freeway from node `start` (having come from `prev`) for `dist` metres, through plain nodes only. */
function walkFw(start, prev, dist) {
  let cur = start, from = prev, run = 0;
  for (let guard = 0; guard < 80; guard++) {
    if (!plainFw(cur)) return null;
    if (run >= dist) return {node: cur, prev: from};
    const k = inc[cur].find(k => other(k, cur) !== from);
    const nx = other(k, cur);
    run += d2(P[cur], P[nx]); from = cur; cur = nx;
  }
  return null;
}
/** Walk along a surface road from `start` (coming from `prev`) to the first node at least `dist` out. */
function walkRoad(start, prev, dist, max) {
  let cur = start, from = prev, run = 0;
  for (let guard = 0; guard < 60; guard++) {
    if (run >= dist) return run <= max && inc[cur].length <= 3 && inc[cur].every(k => edges[k].kind !== 'freeway' && edges[k].kind !== 'ramp') ? {node: cur, prev: from, run} : null;
    if (inc[cur].length !== 2) return null;                         // a junction before we got far enough out
    const k = inc[cur].find(k => other(k, cur) !== from), nx = other(k, cur);
    if (!SURFACE.has(edges[k].kind) && edges[k].kind !== 'residential') return null;
    run += d2(P[cur], P[nx]); from = cur; cur = nx;
  }
  return null;
}
const bez = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return [0, 2].map(i => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i]);
};
/** Ramp from freeway node F (leaving along dir0) to node Cn (arriving along dir1). Points or null. */
let rejectWhy = '';
function rampPath(F, dir0, Cn, dir1, avoid) {
  rejectWhy = 'len';
  const f = P[F], c = P[Cn], L = d2(f, c);
  if (L < 110 || L > 520) return null;
  const p1 = [f[0] + dir0[0] * L * .38, 0, f[2] + dir0[1] * L * .38], p2 = [c[0] - dir1[0] * L * .34, 0, c[2] - dir1[1] * L * .34];
  const raw = [];
  for (let i = 0; i <= 60; i++) { const q = bez(f, p1, p2, c, i / 60); raw.push([q[0], 0, q[1]]); }
  let total = 0; for (let i = 1; i < raw.length; i++) total += d2(raw[i - 1], raw[i]);
  const n = Math.max(4, Math.round(total / 22)), pts = [];
  // Resample evenly by arc length.
  let acc = 0, j = 1;
  pts.push(f);
  for (let k = 1; k < n; k++) {
    const want = total * k / n;
    while (j < raw.length - 1 && acc + d2(raw[j - 1], raw[j]) < want) { acc += d2(raw[j - 1], raw[j]); j++; }
    const seg = d2(raw[j - 1], raw[j]), t = seg > 0 ? (want - acc) / seg : 0;
    pts.push([raw[j - 1][0] + (raw[j][0] - raw[j - 1][0]) * t, 0, raw[j - 1][2] + (raw[j][2] - raw[j - 1][2]) * t]);
  }
  pts.push(c);
  // Heights: eased from the freeway's to the street's (zero grade at both ends).
  const dy = c[1] - f[1];
  rejectWhy = 'grade';
  if (Math.abs(dy) * 1.5 / total > .075) return null;
  rejectWhy = 'cross';
  let s = 0;
  for (let k = 0; k < pts.length; k++) {
    if (k) s += d2(pts[k - 1], pts[k]);
    const t = s / total, e = t * t * (3 - 2 * t);
    if (k > 0 && k < pts.length - 1) pts[k] = [pts[k][0], f[1] + dy * e, pts[k][2]];
  }
  // Clearance: no crossing any road; outside the ends, off every carriageway.
  const mine = new Set([...inc[F], ...inc[Cn]]);
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    for (const e of near((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, 40)) {
      if (mine.has(e)) continue;
      const E = edges[e];
      if (E.a === F || E.b === F || E.a === Cn || E.b === Cn) continue;
      if (segCross(a, b, P[E.a], P[E.b])) return null;
    }
  }
  rejectWhy = 'clear';
  s = 0;
  for (let k = 1; k < pts.length - 1; k++) {
    s += d2(pts[k - 1], pts[k]);
    const p = pts[k], fromF = s, toC = total - s;
    for (const e of near(p[0], p[2], 45)) {
      const E = edges[e], r = distSeg(p, P[E.a], P[E.b]);
      if (E.kind === 'freeway' && fromF < 70) continue;               // still peeling off its own freeway
      if ((E.a === Cn || E.b === Cn) && toC < 40) continue;           // arriving at the street junction
      if (Math.abs(r.y - p[1]) > 6.5) continue;                      // passes over or under it
      if (r.d < half(E) + 4.5 + 2.5) return null;
    }
    for (const q of avoid) if (d2(p, q) < 14) return null;         // another new ramp
  }
  return pts;
}

/* ------------------------------------------------------------ candidates */
const existing = [];                                     // freeway nodes that already have a ramp
for (let v = 0; v < nodes.length; v++) if (inc[v].some(k => edges[k].kind === 'ramp') && inc[v].some(k => edges[k].kind === 'freeway')) existing.push(P[v]);
const crossings = [];
edges.forEach((e, k) => {
  if (e.kind !== 'freeway') return;
  for (const j of near((P[e.a][0] + P[e.b][0]) / 2, (P[e.a][2] + P[e.b][2]) / 2, 30)) {
    const f = edges[j];
    if (!SURFACE.has(f.kind) || !segCross(P[e.a], P[e.b], P[f.a], P[f.b])) continue;
    crossings.push({fw: k, road: j, rank: CROSS_RANK[f.kind]});
  }
});
crossings.sort((a, b) => b.rank - a.rank || a.fw - b.fw);

const newNodes = [], newEdges = [], placed = [], rampPts = [];
const why = {};const no = r => { why[r] = (why[r] || 0) + 1; };
let roadId = Math.max(...edges.map(e => e.road ?? 0)) + 1, diamonds = 0, slips = 0, ramps = 0;
function commit(pts, F, Cn, name, district) {
  let prev = F;
  for (let k = 1; k < pts.length - 1; k++) {
    const id = nodes.length + newNodes.length, p = pts[k];
    newNodes.push({id, map: [p[0] / 10 + 768, p[2] / 10 + 512], position: [+p[0].toFixed(2), +p[1].toFixed(3), +p[2].toFixed(2)], layer: 'ramp-' + name});
    newEdges.push({a: prev, b: id, road: roadId, name, kind: 'ramp', width: 9, lanes: 1, district, gen: 'ix'});
    prev = id;
  }
  newEdges.push({a: prev, b: Cn, road: roadId, name, kind: 'ramp', width: 9, lanes: 1, district, gen: 'ix'});
  roadId++; ramps++;
  for (const p of pts) rampPts.push(p);
}
const short = name => /·/.test(name) ? name.split('·')[0].trim() : name.replace(/ Connector$/, '');
const taken = new Set();                                  // freeway nodes and street nodes already used

/* 1. Diamonds */
for (const c of crossings) {
  const fw = edges[c.fw], rd = edges[c.road];
  // The crossing point and the freeway frame there.
  const [t0x, t0z] = norm(P[fw.b][0] - P[fw.a][0], P[fw.b][2] - P[fw.a][2]), nrm = [-t0z, t0x];
  const X = (() => { const a = P[fw.a], b = P[fw.b], c2 = P[rd.a], d = P[rd.b];
    const rx = b[0] - a[0], rz = b[2] - a[2], sx = d[0] - c2[0], sz = d[2] - c2[2], den = rx * sz - rz * sx;
    const t = ((c2[0] - a[0]) * sz - (c2[2] - a[2]) * sx) / den; return [a[0] + rx * t, (a[1] + b[1]) / 2, a[2] + rz * t]; })();
  if (placed.some(q => d2(q, X) < 1100) || existing.some(q => d2(q, X) < 700)) { no('spacing'); continue; }
  // Street junction on each side of the freeway, ~75 m beyond its edge.
  const sides = [];
  for (const [end, from] of [[rd.a, rd.b], [rd.b, rd.a]]) {
    const side = Math.sign((P[end][0] - X[0]) * nrm[0] + (P[end][2] - X[2]) * nrm[1]);
    const w = walkRoad(end, from, Math.max(0, 55 - d2(P[end], X)), 150);
    if (w && !taken.has(w.node)) sides.push({side, C: w.node});
  }
  if (sides.length < 2 || sides[0].side === sides[1].side) { no('sides' + sides.length); continue; }
  const built = [];
  for (const {side, C: Cn} of sides) for (const dir of [1, -1]) {
    // Freeway node ~230 m before/after the bridge, the ramp leaving toward the bridge.
    const start = dir > 0 ? fw.b : fw.a, prev = dir > 0 ? fw.a : fw.b;
    let got = null;
    for (const run of [200, 300, 400]) {
      const w = walkFw(start, prev, run);
      if (!w || taken.has(w.node)) { no('fwwalk'); break; }
      const back = norm(P[w.prev][0] - P[w.node][0], P[w.prev][2] - P[w.node][2]);   // toward the bridge
      const out = [nrm[0] * side, nrm[1] * side], a = 35 / 57.3;
      const dir0 = norm(back[0] * Math.cos(a) + out[0] * Math.sin(a), back[1] * Math.cos(a) + out[1] * Math.sin(a));
      const pts = rampPath(w.node, dir0, Cn, back, rampPts);
      if (pts) { got = {pts, F: w.node, Cn}; break; }
      no('path:' + rejectWhy);
    }
    if (got) built.push(got);
  }
  if (built.length < 2) { no('built' + built.length); continue; }
  for (const b of built) { commit(b.pts, b.F, b.Cn, `${rd.name} / ${short(fw.name)} ramp`, rd.district); taken.add(b.F); taken.add(b.Cn); }
  placed.push(X); diamonds++;
}

/* 2. Access ramps: from the freeway to a street junction beside it, ahead
 *    or behind, so a street running alongside (or ending at) the freeway
 *    gets on and off it. A pair where both fit, one ramp otherwise. */
const arrivalOk = (Cn, dir1) => inc[Cn].every(k => {
  const o = P[other(k, Cn)], [ux, uz] = norm(o[0] - P[Cn][0], o[2] - P[Cn][2]);
  return -(ux * dir1[0] + uz * dir1[1]) < Math.cos(32 / 57.3);        // no knife edge with any arm
});
function access(v, fwd) {
  const f = P[v], [k0, k1] = inc[v], a = P[other(k0, v)], b = P[other(k1, v)];
  let [tx, tz] = norm(b[0] - a[0], b[2] - a[2]); if (!fwd) { tx = -tx; tz = -tz; }
  const cands = [];
  for (const e of near(f[0], f[2], 280)) {
    const E = edges[e];
    if (!SURFACE.has(E.kind) && E.kind !== 'residential') continue;
    for (const cn of [E.a, E.b]) {
      const p = P[cn], lat = (p[0] - f[0]) * -tz + (p[2] - f[2]) * tx, along = (p[0] - f[0]) * tx + (p[2] - f[2]) * tz;
      if (Math.abs(lat) < 40 || Math.abs(lat) > 150 || along < 130 || along > 300) continue;
      if (cands.some(q => q.cn === cn) || inc[cn].length > 3 || taken.has(cn) || inc[cn].some(k => edges[k].kind === 'freeway' || edges[k].kind === 'ramp')) continue;
      cands.push({cn, lat, along, score: Math.abs(Math.abs(lat) - 70) + Math.abs(along - 200) * .4 - (inc[cn].length === 3 ? 25 : 0)});
    }
  }
  cands.sort((p, q) => p.score - q.score);
  if (process.env.DBG && edges[inc[v][0]].name === 'Hollywood Connector') console.log('HC node', v, P[v].map(Math.round).join(','), fwd, 'cands', cands.length, JSON.stringify(why));
  for (const c of cands.slice(0, 12)) {
    const side = Math.sign(c.lat), out = [-tz * side, tx * side], ang = 35 / 57.3;
    const dir0 = norm(tx * Math.cos(ang) + out[0] * Math.sin(ang), tz * Math.cos(ang) + out[1] * Math.sin(ang));
    // Arrive turning a little further out than the chord: a ramp, not a slash.
    const ch = norm(P[c.cn][0] - f[0], P[c.cn][2] - f[2]);
    for (const k of [.35, 1, 3]) {                                   // chord-ish, diagonal, square onto a parallel street
      const dir1 = norm(ch[0] + out[0] * k, ch[1] + out[1] * k);
      if (!arrivalOk(c.cn, dir1)) { no('knife'); if (process.env.DBG && edges[inc[v][0]].name === 'Hollywood Connector') console.log('  knife', c.cn, Math.round(c.lat), Math.round(c.along)); continue; }
      const pts = rampPath(v, dir0, c.cn, dir1, rampPts);
      if (pts) return {pts, F: v, Cn: c.cn};
      no('apath:' + rejectWhy); if (process.env.DBG && edges[inc[v][0]].name === 'Hollywood Connector') console.log('  fail', rejectWhy, c.cn, Math.round(c.lat), Math.round(c.along), P[c.cn].map(Math.round).join(','), P[v][1].toFixed(1));
    }
  }
  return null;
}
for (let v = 0; v < nodes.length; v++) {
  if (!plainFw(v) || taken.has(v)) continue;
  const f = P[v];
  if (placed.some(q => d2(q, f) < 650) || existing.some(q => d2(q, f) < 450)) continue;
  const got = [];
  for (const fwd of [true, false]) {
    const r = access(v, fwd);
    if (r) { got.push(r); for (const p of r.pts) rampPts.push(p); taken.add(r.Cn); }
  }
  if (!got.length) continue;
  for (const r of got) { for (const p of r.pts) rampPts.splice(rampPts.indexOf(p), 1); const street = edges[inc[r.Cn][0]]; commit(r.pts, v, r.Cn, `${street.name} / ${short(edges[inc[v][0]].name)} ramp`, street.district); }
  taken.add(v); placed.push(f); slips++;
}

console.log('crossings', crossings.length, why);
console.log(`diamonds ${diamonds}, access points ${slips}, ramps ${ramps}, new nodes ${newNodes.length}, new edges ${newEdges.length}`);
if (!DRY) {
  data.nodes = [...nodes, ...newNodes];
  data.edges = [...edges, ...newEdges].map((e, id) => ({...e, id}));
  data.version = (data.version || 0) + 1;
  writeFileSync(FILE, JSON.stringify(data));
  console.log(`wrote roads.json: ${data.nodes.length} nodes, ${data.edges.length} edges`);
}
