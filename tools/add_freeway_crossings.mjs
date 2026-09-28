#!/usr/bin/env node
/* Streets across the freeways (2026-09-27): roads.json -> roads.json, in place.
 *
 *   node tools/add_freeway_crossings.mjs [--dry]
 *
 * The generated freeways cut the city into pieces: the 15 km Santa Monica
 * Freeway had 3 streets crossing it, the San Bernardino none, and downtown
 * was boxed in by the 110, the 101 and the Hollywood Connector. Real LA
 * streets pass under or over a freeway every few hundred metres.
 *
 * For each freeway, this pairs street nodes on opposite sides that line up
 * across it (the same street name, or streets pointing at each other), and
 * links each pair with a street passing UNDER the freeway at grade. Where the
 * freeway is not already high enough there, its nodes are lifted (flat over
 * the crossing, eased back at 3.5%) so the new street has 6.2 m of headroom;
 * the ground then turns that stretch into a bridge on piers. A crossing is
 * only made if the lifted stretch has no junction, ramp or existing crossing
 * in it and the new street crosses nothing else. Crossings are kept 320 m
 * apart. New edges carry gen:'xc'; lifted nodes keep their original height
 * in `y0` so a rerun starts from the original freeway.
 * Run AFTER add_interchanges.mjs and add_freeway_links.mjs.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {execSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const FILE = new URL('../assets/world/roads.json', import.meta.url);
const data = JSON.parse(readFileSync(FILE));
const DRY = process.argv.includes('--dry');
const CLEAR = 6.2, FLAT = 45, EASE = .035, SPACING = 320, MAXLIFT = 9;

// Undo a previous run: drop its edges, restore lifted heights.
{
  for (const n of data.nodes) if (n.y0 !== undefined) { n.position[1] = n.y0; delete n.y0; }
  const gen = data.edges.filter(e => e.gen === 'xc');
  if (gen.length) {
    data.edges = data.edges.filter(e => e.gen !== 'xc');
    const used = new Set(); for (const e of data.edges) { used.add(e.a); used.add(e.b); }
    const map = new Map();
    data.nodes = data.nodes.filter(n => used.has(n.id)).map((n, i) => { map.set(n.id, i); return {...n, id: i}; });
    data.edges = data.edges.map((e, i) => ({...e, id: i, a: map.get(e.a), b: map.get(e.b)}));
    console.log(`removed ${gen.length} previously generated crossing edges`);
  }
}
// Generated ramps (add_interchanges, gen 'ix') are set aside and rebuilt at
// the end around the new streets: they filled the gaps the streets need.
{
  const ix = data.edges.filter(e => e.gen === 'ix').length;
  data.edges = data.edges.filter(e => e.gen !== 'ix');
  const used = new Set(); for (const e of data.edges) { used.add(e.a); used.add(e.b); }
  const map = new Map();
  data.nodes = data.nodes.filter(n => used.has(n.id)).map((n, i) => { map.set(n.id, i); return {...n, id: i}; });
  data.edges = data.edges.map((e, i) => ({...e, id: i, a: map.get(e.a), b: map.get(e.b)}));
  console.log(`set aside ${ix} generated ramp edges`);
}
const nodes = data.nodes, edges = data.edges, P = nodes.map(n => n.position);
const inc = nodes.map(() => []);
edges.forEach((e, k) => { inc[e.a].push(k); inc[e.b].push(k); });
const other = (k, v) => edges[k].a === v ? edges[k].b : edges[k].a;
const d2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
const STREET = new Set(['street', 'avenue', 'boulevard', 'residential']);
const HALF = {freeway: 20, ramp: 4.5, boulevard: 17, avenue: 11, street: 7, underpass: 7, residential: 6, scenic: 5, tunnel: 7, dirt: 3};
function cross(a, b, c, d) {
  const rx = b[0] - a[0], rz = b[2] - a[2], sx = d[0] - c[0], sz = d[2] - c[2], den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = c[0] - a[0], qz = c[2] - a[2], t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
  return t > 1e-4 && t < 1 - 1e-4 && u > 1e-4 && u < 1 - 1e-4 ? {t, u} : null;
}
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

/* Freeway chains: maximal runs through plain nodes (exactly two freeway edges, nothing else). */
const plain = v => inc[v].length === 2 && inc[v].every(k => edges[k].kind === 'freeway');
const chains = [], inChain = new Set();
edges.forEach((e, k) => {
  if (e.kind !== 'freeway' || inChain.has(k)) return;
  // Walk back to a chain end, then forward.
  let v = e.a, from = k;
  for (let g = 0; g < 5000 && plain(v); g++) { const nk = inc[v].find(q => q !== from); from = nk; v = other(nk, v); }
  const seq = [v]; let cur = v, prevK = -1;
  for (let g = 0; g < 5000; g++) {
    const nk = inc[cur].find(q => q !== prevK && edges[q].kind === 'freeway' && !inChain.has(q));
    if (nk === undefined) break;
    inChain.add(nk); cur = other(nk, cur); seq.push(cur); prevK = nk;
    if (!plain(cur)) break;
  }
  if (seq.length > 2) chains.push(seq);
});

/* Existing crossings of each freeway edge (by anything else), to keep away from. */
const crossedAt = [];
edges.forEach((e, k) => {
  if (e.kind !== 'freeway') return;
  for (const j of near((P[e.a][0] + P[e.b][0]) / 2, (P[e.a][2] + P[e.b][2]) / 2, 40)) {
    const f = edges[j]; if (f.kind === 'freeway') continue;
    const x = cross(P[e.a], P[e.b], P[f.a], P[f.b]);
    if (x) crossedAt.push([P[e.a][0] + (P[e.b][0] - P[e.a][0]) * x.t, P[e.a][2] + (P[e.b][2] - P[e.a][2]) * x.t]);
  }
});

const newNodes = [], newEdges = [], lifts = new Map(), made = [], why = {};
const no = r => { why[r] = (why[r] || 0) + 1; if (process.env.AT && dbg) console.log('   reject', r, dbg); };
let dbg = null;
let roadId = Math.max(...edges.map(e => e.road ?? 0)) + 1;
for (const seq of chains) {
  // Arc length along the chain.
  const S = [0]; for (let i = 1; i < seq.length; i++) S.push(S[i - 1] + d2(P[seq[i - 1]], P[seq[i]]));
  const total = S[S.length - 1];
  if (total < 500) continue;
  const name = edges[inc[seq[1]][0]].name;
  // Candidate street nodes beside the chain.
  const cands = [];
  for (let i = 0; i < seq.length - 1; i++) {
    const a = P[seq[i]], b = P[seq[i + 1]], [tx, tz] = norm(b[0] - a[0], b[2] - a[2]);
    for (const k of near((a[0] + b[0]) / 2, (a[2] + b[2]) / 2, 170)) for (const v of [edges[k].a, edges[k].b]) {
      if (!inc[v].length || !inc[v].every(q => STREET.has(edges[q].kind))) continue;
      const p = P[v], along = (p[0] - a[0]) * tx + (p[2] - a[2]) * tz, lat = -(p[0] - a[0]) * tz + (p[2] - a[2]) * tx;
      const segL = d2(a, b);
      if (along < 0 || along > segL || Math.abs(lat) < 26 || Math.abs(lat) > 160) continue;
      cands.push({v, s: S[i] + along, lat, i, t: along / segL});
    }
  }
  const bySide = [cands.filter(c => c.lat > 0), cands.filter(c => c.lat < 0)];
  if (process.env.CH) console.log('chain', name, Math.round(total), 'cands', bySide[0].length, bySide[1].length);
  const pairs = [];
  for (const A of bySide[0]) for (const B of bySide[1]) {
    if (Math.abs(A.s - B.s) > 140) continue;
    const pa = P[A.v], pb = P[B.v], L = d2(pa, pb);
    if (L > 300) continue;
    // Streets pointing at each other across the freeway: the node's own arms
    // should include one heading toward the freeway, roughly along AB.
    const dir = norm(pb[0] - pa[0], pb[2] - pa[2]);
    const armAway = (v, dx, dz) => Math.max(...inc[v].map(q => { const o = P[other(q, v)]; const [ux, uz] = norm(o[0] - P[v][0], o[2] - P[v][2]); return -(ux * dx + uz * dz); }));
    const alignA = armAway(A.v, dir[0], dir[1]), alignB = armAway(B.v, -dir[0], -dir[1]);
    const sameName = inc[A.v].some(q => inc[B.v].some(r => edges[q].name && edges[q].name === edges[r].name));
    if (process.env.CH2 && /Connector/.test(name)) console.log('  pair', Math.round(pa[0]), Math.round(pa[2]), '->', Math.round(pb[0]), Math.round(pb[2]), 'L', Math.round(L), 'al', alignA.toFixed(2), alignB.toFixed(2), sameName);
    if (!(sameName || (alignA > .75 && alignB > .75) || (Math.max(alignA, alignB) > .85 && Math.min(alignA, alignB) > .3 && L < 210))) continue;
    // Crossing angle with the freeway.
    const a = P[seq[A.i]], b = P[seq[A.i + 1]], [tx, tz] = norm(b[0] - a[0], b[2] - a[2]);
    if (Math.abs(dir[0] * tx + dir[1] * tz) > .6) continue;
    pairs.push({A, B, L, score: L - (sameName ? 80 : 0) - (alignA + alignB) * 40});
  }
  pairs.sort((p, q) => p.score - q.score);
  const taken = [];
  for (const pr of pairs) {
    const {A, B} = pr, pa = P[A.v], pb = P[B.v];
    if (process.env.AT) { const [qx, qz] = JSON.parse(process.env.AT); dbg = Math.hypot(pa[0] - qx, pa[2] - qz) < 250 ? `${Math.round(pa[0])},${Math.round(pa[2])} -> ${Math.round(pb[0])},${Math.round(pb[2])}` : null; }
    // Where AB crosses the chain.
    let X = null;
    for (let i = 0; i < seq.length - 1 && !X; i++) { const c = cross(pa, pb, P[seq[i]], P[seq[i + 1]]); if (c) X = {i, u: c.u, t: c.t, s: S[i] + c.u * (S[i + 1] - S[i])}; }
    if (!X) { no('nox'); continue; }
    if (taken.some(s => Math.abs(s - X.s) < SPACING)) { no('spacing'); continue; }
    const xp = [pa[0] + (pb[0] - pa[0]) * X.t, 0, pa[2] + (pb[2] - pa[2]) * X.t];
    if (crossedAt.some(q => Math.hypot(q[0] - xp[0], q[1] - xp[2]) < 200) || made.some(q => Math.hypot(q[0] - xp[0], q[1] - xp[2]) < SPACING)) { no('existing'); continue; }
    // The new street must cross nothing but this freeway.
    let bad = false;
    for (const k of near((pa[0] + pb[0]) / 2, (pa[2] + pb[2]) / 2, pr.L / 2 + 20)) {
      const e = edges[k]; if (e.a === A.v || e.b === A.v || e.a === B.v || e.b === B.v) continue;
      if (e.kind === 'freeway' && e.name === name) continue;
      if (cross(pa, pb, P[e.a], P[e.b])) { bad = true; if (process.env.AT && dbg) console.log('  x', e.kind, e.name, e.gen || ''); break; }
    }
    if (bad) { no('crosses'); continue; }
    // Headroom: street height under the deck vs the freeway deck there.
    const ys = pa[1] + (pb[1] - pa[1]) * X.t, yf = P[seq[X.i]][1] + (P[seq[X.i + 1]][1] - P[seq[X.i]][1]) * X.u;
    // Under the freeway (lift it) where the street is near its level or
    // below; over it (lower the freeway into a cutting) where the street is
    // already well above it.
    const over = ys - yf > 2.5, lift = over ? Math.min(0, ys - CLEAR - 1 - yf) : Math.max(0, ys + CLEAR - yf);
    if (Math.abs(lift) > MAXLIFT) { no('toolow'); continue; }
    // The lifted window must be plain freeway, far from the chain's ends.
    const reach = FLAT + Math.abs(lift) / EASE;
    if (X.s - reach < 60 || X.s + reach > total - 60) { no('window'); continue; }
    if (crossedAt.some(q => { for (let i = 0; i < seq.length; i++) if (Math.abs(S[i] - X.s) < reach && Math.hypot(P[seq[i]][0] - q[0], P[seq[i]][2] - q[1]) < 40) return true; return false; })) { no('windowcross'); continue; }
    if (Math.abs(pb[1] - pa[1]) / pr.L > .09) { no('grade'); continue; }
    // Commit: lift, then the street (over the freeway: a bridge, kind avenue/street).
    const mine = new Map();
    for (let i = 1; i < seq.length - 1; i++) {
      const d = Math.abs(S[i] - X.s), l = Math.sign(lift) * (d < FLAT ? Math.abs(lift) : Math.max(0, Math.abs(lift) - (d - FLAT) * EASE));
      if (l && lifts.has(seq[i]) && Math.sign(lifts.get(seq[i])) !== Math.sign(l)) { bad = true; break; }
      if (l) mine.set(seq[i], Math.abs(l) > Math.abs(lifts.get(seq[i]) || 0) ? l : lifts.get(seq[i]));
    }
    if (bad) { no('conflict'); continue; }
    for (const [v, l] of mine) lifts.set(v, l);
    const n = Math.max(2, Math.round(pr.L / 20)), road = roadId++, e0 = edges[inc[A.v][0]], stName = inc[A.v].map(q => edges[q].name).find(Boolean) || 'Underpass';
    let prev = A.v;
    for (let k = 1; k < n; k++) {
      const t = k / n, id = nodes.length + newNodes.length, p = [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t];
      newNodes.push({id, map: [p[0] / 10 + 768, p[2] / 10 + 512], position: [+p[0].toFixed(2), +p[1].toFixed(3), +p[2].toFixed(2)], layer: 'crossing'});
      newEdges.push({a: prev, b: id, road, name: stName, kind: over ? 'street' : 'underpass', width: 14, lanes: 2, district: e0.district, gen: 'xc'});
      prev = id;
    }
    newEdges.push({a: prev, b: B.v, road, name: stName, kind: over ? 'street' : 'underpass', width: 14, lanes: 2, district: e0.district, gen: 'xc'});
    taken.push(X.s); made.push([xp[0], xp[2], name, stName, Math.round(lift * 10) / 10]);
  }
}
const byFw = {}; for (const m of made) byFw[m[2]] = (byFw[m[2]] || 0) + 1;
console.log('crossings made', made.length, JSON.stringify(byFw), 'rejected', JSON.stringify(why));
console.log('freeway nodes moved', lifts.size, 'max lift', Math.max(0, ...lifts.values()).toFixed(1), 'max lowering', Math.min(0, ...lifts.values()).toFixed(1));
if (!DRY) {
  for (const [v, l] of lifts) { nodes[v].y0 = nodes[v].position[1]; nodes[v].position[1] = +(nodes[v].position[1] + l).toFixed(3); }
  data.nodes = [...nodes, ...newNodes];
  data.edges = [...edges, ...newEdges].map((e, id) => ({...e, id}));
  data.version = (data.version || 0) + 1;
  writeFileSync(FILE, JSON.stringify(data));
  console.log(`wrote roads.json: ${data.nodes.length} nodes, ${data.edges.length} edges`);
  console.log('rebuilding the generated ramps:');
  execSync('node ' + JSON.stringify(fileURLToPath(new URL('./add_interchanges.mjs', import.meta.url))), {stdio: 'inherit'});
}
