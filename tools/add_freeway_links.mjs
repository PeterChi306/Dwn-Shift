#!/usr/bin/env node
/* Freeway links (2026-09-27): roads.json -> roads.json, in place.
 *
 *   node tools/add_freeway_links.mjs [--dry]
 *
 * The generated freeways stopped dead in the middle of the map: the 110
 * broke for a kilometre at the 10, the Hollywood Connector ended in Echo
 * Park, the San Bernardino ended 500 m short of the 101, the 134 ended at
 * both of its ends. For every freeway end that is not at the map edge this
 * adds, in order of preference:
 *
 *   1. a FREEWAY link to another freeway end facing it (closing a gap),
 *   2. a FREEWAY link merging into another freeway at a plain node,
 *   3. a RAMP down to a boulevard or avenue ahead (the freeway ends).
 *
 * Each link is a Bezier from the end's heading into the target's, sampled
 * every ~22 m. Its profile eases between the two end heights and is lifted
 * to pass 7.5 m over every road it crosses (the ground turns that into a
 * bridge on piers), grade-limited to 5%; a link that cannot make that, or
 * that runs along another road at its own level, is rejected. Existing
 * roads and heights are untouched. Edges carry gen:'fx' and are replaced on
 * the next run. Run AFTER add_interchanges.mjs (it replaces only 'ix').
 */
import {readFileSync, writeFileSync} from 'node:fs';

const FILE = new URL('../assets/world/roads.json', import.meta.url);
const data = JSON.parse(readFileSync(FILE));
const DRY = process.argv.includes('--dry');

{
  const gen = data.edges.filter(e => e.gen === 'fx');
  if (gen.length) {
    data.edges = data.edges.filter(e => e.gen !== 'fx');
    const used = new Set(); for (const e of data.edges) { used.add(e.a); used.add(e.b); }
    const map = new Map();
    data.nodes = data.nodes.filter(n => used.has(n.id)).map((n, i) => { map.set(n.id, i); return {...n, id: i}; });
    data.edges = data.edges.map((e, i) => ({...e, id: i, a: map.get(e.a), b: map.get(e.b)}));
    console.log(`removed ${gen.length} previously generated link edges`);
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
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const HALF_W = 768 * 10, HALF_H = 512 * 10, EDGE = 820;

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
function crossAt(a, b, c, d) {
  const rx = b[0] - a[0], rz = b[2] - a[2], sx = d[0] - c[0], sz = d[2] - c[2], den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = c[0] - a[0], qz = c[2] - a[2], t = (qx * sz - qz * sx) / den, u = (qx * rz - qz * rx) / den;
  return t > 1e-4 && t < 1 - 1e-4 && u > 1e-4 && u < 1 - 1e-4 ? {t, y: c[1] + (d[1] - c[1]) * u} : null;
}
const bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return [0, 2].map(i => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i]); };

/** Path from node A (leaving along dA) to node B (arriving along dB). */
let why = '';
function linkPath(A, dA, B, dB, kind) {
  const a = P[A], b = P[B], L = d2(a, b);
  const p1 = [a[0] + dA[0] * L * .4, 0, a[2] + dA[1] * L * .4], p2 = [b[0] - dB[0] * L * .4, 0, b[2] - dB[1] * L * .4];
  const raw = []; for (let i = 0; i <= 120; i++) { const q = bez(a, p1, p2, b, i / 120); raw.push([q[0], 0, q[1]]); }
  let total = 0; for (let i = 1; i < raw.length; i++) total += d2(raw[i - 1], raw[i]);
  // Curvature: a freeway needs ~250 m radius at least, a ramp ~60 m.
  const minR = kind === 'freeway' ? 230 : 55;
  for (let i = 1; i < raw.length - 1; i++) {
    const u = norm(raw[i][0] - raw[i - 1][0], raw[i][2] - raw[i - 1][2]), v = norm(raw[i + 1][0] - raw[i][0], raw[i + 1][2] - raw[i][2]);
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(u, v)))), ds = d2(raw[i - 1], raw[i + 1]) / 2;
    if (ang > 1e-4 && ds / ang < minR) { why = 'tight'; return null; }
  }
  const n = Math.max(3, Math.round(total / 22)), pts = [a];
  let acc = 0, j = 1;
  for (let k = 1; k < n; k++) {
    const want = total * k / n;
    while (j < raw.length - 1 && acc + d2(raw[j - 1], raw[j]) < want) { acc += d2(raw[j - 1], raw[j]); j++; }
    const sl = d2(raw[j - 1], raw[j]), t = sl > 0 ? (want - acc) / sl : 0;
    pts.push([raw[j - 1][0] + (raw[j][0] - raw[j - 1][0]) * t, 0, raw[j - 1][2] + (raw[j][2] - raw[j - 1][2]) * t]);
  }
  pts.push(b);
  const S = [0]; for (let k = 1; k < pts.length; k++) S.push(S[k - 1] + d2(pts[k - 1], pts[k]));
  // Crossings: every road the path cuts, and the height it must clear.
  const mine = new Set([...inc[A], ...inc[B]]), need = [];
  for (let k = 0; k < pts.length - 1; k++) {
    for (const e of near((pts[k][0] + pts[k + 1][0]) / 2, (pts[k][2] + pts[k + 1][2]) / 2, 30)) {
      if (mine.has(e)) continue;
      const E = edges[e]; if (E.a === A || E.b === A || E.a === B || E.b === B) continue;
      const x = crossAt(pts[k], pts[k + 1], P[E.a], P[E.b]);
      if (x) need.push({e, s: S[k] + (S[k + 1] - S[k]) * x.t, y: x.y, w: half(E) + 6, name: E.kind + ':' + E.name});
    }
  }
  // Profile: eased between the ends, lifted over the crossings with 5% ramps.
  const y0 = a[1], y1 = b[1], G = kind === "freeway" ? .055 : .06, ys = S.map(s => { const t = s / total, e = t * t * (3 - 2 * t); return y0 + (y1 - y0) * e; });
  // Over or under each crossing, whichever the eased line is nearer.
  const base = ys.slice(), lo = S.map(() => -1e9), hi = S.map(() => 1e9);
  for (const q of need) {
    let k0 = 0; while (k0 < S.length - 1 && S[k0 + 1] < q.s) k0++;
    q.over = base[k0] >= q.y - 1.5;
    for (let k = 0; k < pts.length; k++) {
      const off = Math.max(0, Math.abs(S[k] - q.s) - q.w);
      if (q.over) lo[k] = Math.max(lo[k], q.y + 6.2 - off * G); else hi[k] = Math.min(hi[k], q.y - 7.5 + off * G);
    }
  }
  for (let k = 0; k < pts.length; k++) {
    if (lo[k] > hi[k]) { why = 'squeeze'; return null; }
    ys[k] = Math.min(hi[k], Math.max(lo[k], ys[k]));
  }
  if (process.env.DBG && P[A].map(Math.round).join(',').startsWith(process.env.DBG)) console.log('  need', need.map(q => `${q.name}@${Math.round(q.s)}/${Math.round(total)} y${q.y.toFixed(1)} ${q.over ? "over" : "under"}`).join(', '));
  // The ends must be reachable: nothing may demand a lift the ends cannot meet.
  for (let k = 1; k < pts.length - 1; k++) {
    if (Math.abs(ys[k] - y0) > S[k] * G + 1 || Math.abs(ys[k] - y1) > (total - S[k]) * G + 1) { why = 'lift'; if (process.env.DBG && P[A].map(Math.round).join(',').startsWith(process.env.DBG)) console.log('  lift at', Math.round(S[k]), ys[k].toFixed(1), y0, y1); return null; }
  }
  if (Math.abs(y1 - y0) / total > G) { why = 'grade'; return null; }
  { const yy = [y0, ...ys.slice(1, -1), y1];
    for (let k = 1; k < yy.length; k++) if (Math.abs(yy[k] - yy[k - 1]) / Math.max(1, S[k] - S[k - 1]) > (kind === 'freeway' ? .065 : .075)) { why = 'steep'; return null; } }
  for (let k = 1; k < pts.length - 1; k++) pts[k] = [pts[k][0], ys[k], pts[k][2]];
  // Clearance: off every other carriageway at its own level (ends excepted).
  const crossed = new Set(need.map(q => edges[q.e].road)), drops = new Set();
  for (let k = 1; k < pts.length - 1; k++) {
    const p = pts[k];
    for (const e of near(p[0], p[2], 45)) {
      const E = edges[e], r = distSeg(p, P[E.a], P[E.b]);
      if ((mine.has(e) || E.kind === 'freeway' || E.kind === 'ramp') && (S[k] < 90 || total - S[k] < 90)) continue;
      if (crossed.has(E.road)) continue;                                   // bridged by the profile
      if (E.gen === 'ix' && kind === 'freeway') { drops.add(E.road); continue; }   // a generated ramp in the way gives way
      if (Math.abs(r.y - p[1]) > 6.5) continue;
      if (r.d < half(E) + (kind === 'freeway' ? 20 : 4.5) + 1.5) { why = 'clear:' + E.kind + ':' + E.name; return null; }
    }
  }
  return {pts, total, bridges: need.length, drops};
}

/* ------------------------------------------------------------ the ends */
const isFw = k => edges[k].kind === 'freeway';
const ends = [];
for (let v = 0; v < nodes.length; v++) {
  const f = inc[v].filter(isFw);
  if (f.length !== 1) continue;
  const p = P[v];
  if (HALF_W - Math.abs(p[0]) < EDGE || HALF_H - Math.abs(p[2]) < EDGE) continue;       // runs off the map
  const o = P[other(f[0], v)], dir = norm(p[0] - o[0], p[2] - o[2]);
  ends.push({v, dir, name: edges[f[0]].name, district: edges[f[0]].district});
}
console.log('freeway ends inside the map:', ends.map(e => `${e.name} @${P[e.v].map(Math.round).join(',')}`).join('; '));

const newNodes = [], newEdges = [], done = new Set(), dropRoads = new Set();
let roadId = Math.max(...edges.map(e => e.road ?? 0)) + 1;
const short = name => /·/.test(name) ? name.split('·')[0].trim() : name.replace(/ Connector$/, '');
function commit(path, A, B, name, kind, district) {
  let prev = A;
  for (let k = 1; k < path.pts.length - 1; k++) {
    const id = nodes.length + newNodes.length, p = path.pts[k];
    newNodes.push({id, map: [p[0] / 10 + 768, p[2] / 10 + 512], position: [+p[0].toFixed(2), +p[1].toFixed(3), +p[2].toFixed(2)], layer: 'link-' + name});
    newEdges.push({a: prev, b: id, road: roadId, name, kind, width: kind === 'freeway' ? 40 : 9, lanes: kind === 'freeway' ? 6 : 1, district, gen: 'fx'});
    prev = id;
  }
  newEdges.push({a: prev, b: B, road: roadId, name, kind, width: kind === 'freeway' ? 40 : 9, lanes: kind === 'freeway' ? 6 : 1, district, gen: 'fx'});
  roadId++;
}
const report = [];
for (const E of ends) {
  if (done.has(E.v)) continue;
  const p = P[E.v], tries = [];
  // 1. Another end facing this one.
  for (const F of ends) {
    if (F === E || done.has(F.v)) continue;
    const q = P[F.v], L = d2(p, q), to = norm(q[0] - p[0], q[2] - p[2]);
    if (L > 1500 || dot(E.dir, to) < .5 || dot(F.dir, [-to[0], -to[1]]) < .5) continue;
    tries.push({B: F.v, dB: [-F.dir[0], -F.dir[1]], kind: 'freeway', L, pair: F, name: E.name === F.name ? E.name : `${short(E.name)} / ${short(F.name)} connector`});
  }
  // An end that already has ramps is a terminus; only a gap-closing link helps it.
  const hasRamp = inc[E.v].some(k => edges[k].kind === 'ramp');
  // 2. Merge into another freeway at a plain node ahead.
  if (!hasRamp) for (const k of near(p[0], p[2], 900)) {
    if (!isFw(k) || edges[k].name === E.name) continue;
    for (const v of [edges[k].a, edges[k].b]) {
      if (inc[v].length !== 2 || !inc[v].every(isFw)) continue;
      const q = P[v], L = d2(p, q), to = norm(q[0] - p[0], q[2] - p[2]);
      if (L < 250 || L > 900 || dot(E.dir, to) < .6) continue;
      const [k0, k1] = inc[v], t = norm(P[other(k1, v)][0] - P[other(k0, v)][0], P[other(k1, v)][2] - P[other(k0, v)][2]);
      for (const s of [1, -1]) { const dB = [t[0] * s, t[1] * s]; if (dot(dB, to) > .6) tries.push({B: v, dB, kind: 'freeway', L: L + 200, name: `${short(E.name)} / ${short(edges[k].name)} connector`}); }
    }
  }
  // 3. Down to an arterial ahead.
  if (!hasRamp) for (const k of near(p[0], p[2], 500)) {
    const R = edges[k]; if (R.kind !== 'boulevard' && R.kind !== 'avenue') continue;
    for (const v of [R.a, R.b]) {
      if (inc[v].length > 3 || inc[v].some(j => edges[j].kind === 'freeway' || edges[j].kind === 'ramp')) continue;
      const q = P[v], L = d2(p, q), to = norm(q[0] - p[0], q[2] - p[2]);
      if (L < 35 || L > 500 || dot(E.dir, to) < .55) continue;
      tries.push({B: v, dB: to, kind: 'ramp', L: L + 1000 + (R.kind === 'avenue' ? 150 : 0), name: `${short(E.name)} / ${R.name} ramp`});
    }
  }
  tries.sort((a, b) => a.L - b.L);
  let got = null; const fails = {};
  for (const t of tries.slice(0, 40)) {
    for (const bend of [0, .15, -.15]) {
      const dB = norm(t.dB[0] + bend * -t.dB[1], t.dB[1] + bend * t.dB[0]);
      const path = linkPath(E.v, E.dir, t.B, t.kind === 'ramp' ? dB : t.dB, t.kind);
      if (path) { got = {...t, path}; break; }
      fails[why] = (fails[why] || 0) + 1;
      if (t.kind !== 'ramp') break;
    }
    if (got) break;
  }
  if (!got) { report.push(`${E.name} @${p.map(Math.round).join(',')}: none (${tries.length} tried ${JSON.stringify(fails)})`); continue; }
  commit(got.path, E.v, got.B, got.name, got.kind, E.district);
  for (const r of got.path.drops) dropRoads.add(r);
  done.add(E.v); if (got.pair) done.add(got.pair.v);
  report.push(`${E.name} @${p.map(Math.round).join(',')}: ${got.kind} "${got.name}" ${Math.round(got.path.total)} m, ${got.path.bridges} bridged crossings`);
}
console.log(report.join('\n'));
if (dropRoads.size) console.log('generated ramps removed to make way:', [...dropRoads].map(r => edges.find(e => e.road === r).name).join('; '));
if (!DRY) {
  let all = [...edges.filter(e => !dropRoads.has(e.road)), ...newEdges], allNodes = [...nodes, ...newNodes];
  const used = new Set(); for (const e of all) { used.add(e.a); used.add(e.b); }
  const map = new Map();
  allNodes = allNodes.filter(n => used.has(n.id)).map((n, i) => { map.set(n.id, i); return {...n, id: i}; });
  data.nodes = allNodes;
  data.edges = all.map((e, id) => ({...e, id, a: map.get(e.a), b: map.get(e.b)}));
  data.version = (data.version || 0) + 1;
  writeFileSync(FILE, JSON.stringify(data));
  console.log(`wrote roads.json: ${data.nodes.length} nodes, ${data.edges.length} edges`);
}
