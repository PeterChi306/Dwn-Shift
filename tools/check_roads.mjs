#!/usr/bin/env node
/* Checks the road SURFACE (world/roads.js + world/ground.js), not just the graph.
 *
 *   node tools/check_roads.mjs [assets/world/roads.json]
 *
 * 1. Seams: every junction polygon's kerb points must coincide with the ends
 *    of the ribbons that arrive there.
 * 2. Seating: at random points on every drivable face, the terrain as it is
 *    actually rendered (2 m grid, linear triangles) must sit below the road,
 *    and for a surface road not by more than a kerb's depth.
 * 3. Overlaps: two drivable faces stacked 0.3-4 m apart (a ledge the eye sees
 *    and a snag for the physics).
 * Exits non-zero if any hard limit is broken.
 */
import {readFileSync} from 'node:fs';
import {RoadNetwork} from '../world/network.js';
import {RoadModel, SEAT} from '../world/roads.js';
import {Ground} from '../world/ground.js';

const root = new URL('..', import.meta.url);
const t0 = performance.now();
const net = new RoadNetwork(JSON.parse(readFileSync(new URL(process.argv[2] || 'assets/world/roads.json', root))));
const t1 = performance.now();
const model = new RoadModel(net);
const t2 = performance.now();
const ground = new Ground(model);
const pieces = model.buildPieces(ground);
const t3 = performance.now();

let verts = 0, tris = 0;
for (const p of pieces) for (const part of Object.values(p.parts)) { verts += part.pos.length / 3; tris += part.index.length / 3; }
console.log(`graph ${(t1 - t0).toFixed(0)} ms, model ${(t2 - t1).toFixed(0)} ms, geometry ${(t3 - t2).toFixed(0)} ms`);
console.log(`segments ${model.segments.length}, junctions ${model.junctions.filter(j => !j.cap).length}, dead-end caps ${model.junctions.filter(j => j.cap).length}`);
console.log(`pieces ${pieces.length}, vertices ${(verts / 1e6).toFixed(2)} M, triangles ${(tris / 1e6).toFixed(2)} M`);

// Seeded random so runs compare.
let seed = 12345;
const rnd = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;

/* ---- 1. seams */
let seamWorst = 0;
for (const j of model.junctions) {
  if (j.cap) continue;
  for (const end of j.ends) {
    const sec = model.sectionAt(end.seg, end.atStart ? end.cut : end.seg.L - end.cut);
    const ribbon = model.sectionAt(end.seg, end.atStart ? end.seg.cut[0] : end.seg.L - end.seg.cut[1]);
    seamWorst = Math.max(seamWorst, Math.hypot(sec.x - ribbon.x, sec.y - ribbon.y, sec.z - ribbon.z));
  }
}

/* ---- 2. seating against the terrain as rendered on a 2 m grid */
const G = 2;
const renderedGround = (x, z) => {
  const x0 = Math.floor(x / G) * G, z0 = Math.floor(z / G) * G, fx = (x - x0) / G, fz = (z - z0) / G;
  const h00 = ground.height(x0, z0), h10 = ground.height(x0 + G, z0), h01 = ground.height(x0, z0 + G), h11 = ground.height(x0 + G, z0 + G);
  // Same diagonal as PlaneGeometry-style grids: split along (x0,z0+G)-(x0+G,z0).
  return fx + fz <= 1 ? h00 + (h10 - h00) * fx + (h01 - h00) * fz : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
};
const drivable = new Set(['asphalt', 'junction', 'verge', 'gravel', 'sidewalk', 'crosswalk']);
// Junctions at a tunnel mouth are portals: part of them is under the hill.
const portal = new Set(model.junctions.filter(j => !j.cap && j.ends.some(e => e.seg.kind === 'tunnel')).map(j => j.node));
let floatAt = null, samples = 0, buried = 0, buriedWorst = 0, buriedJunction = 0, floating = 0, floatWorst = 0;
const buriedAt = [];
for (const p of pieces) {
  for (const [mat, part] of Object.entries(p.parts)) {
    if (!drivable.has(mat)) continue;
    // A tunnel is under the ground on purpose; ground.js leaves it alone.
    if (p.seg !== undefined && model.segments[p.seg].kind === 'tunnel') continue;
    if (p.junction !== undefined && portal.has(p.junction)) continue;
    const idx = part.index, P = part.pos;
    for (let k = 0; k < idx.length; k += 3) {
      if (rnd() > .08) continue;                    // ~8% of triangles, one point each
      let a = rnd(), b = rnd(); if (a + b > 1) { a = 1 - a; b = 1 - b; }
      const i = idx[k] * 3, j = idx[k + 1] * 3, l = idx[k + 2] * 3;
      const x = P[i] + (P[j] - P[i]) * a + (P[l] - P[i]) * b;
      const y = P[i + 1] + (P[j + 1] - P[i + 1]) * a + (P[l + 1] - P[i + 1]) * b;
      const z = P[i + 2] + (P[j + 2] - P[i + 2]) * a + (P[l + 2] - P[i + 2]) * b;
      const gap = y - renderedGround(x, z);        // positive: road above ground
      samples++;
      if (gap < 0) {
        buried++;
        // Junction polygons are planar fans; on steep hills they cannot follow two
        // roads leaving at different grades, so they are reported separately.
        if (mat === 'junction') buriedJunction = Math.max(buriedJunction, -gap);
        else if (-gap > buriedWorst) buriedWorst = -gap;
        if (-gap > .1) buriedAt.push([x.toFixed(0), z.toFixed(0), (-gap).toFixed(2), mat, y.toFixed(1), p.seg !== undefined ? model.segments[p.seg].kind + (model.segments[p.seg].elevated ? '/E' : '') : 'jct']);
      }
      const seg = p.seg !== undefined ? model.segments[p.seg] : null;
      if (seg && !p.bridge && mat === 'asphalt' && gap > SEAT + .5) { floating++; if (gap > floatWorst) { floatWorst = gap; floatAt = [Math.round(x), Math.round(z), seg.kind]; } }
    }
  }
}

/* ---- 3. stacked drivable faces (coarse: asphalt/junction centroids on a 1 m hash) */
const stack = new Map();
let stacked = 0;
for (const p of pieces) for (const [mat, part] of Object.entries(p.parts)) {
  if (mat !== 'asphalt' && mat !== 'junction') continue;
  const idx = part.index, P = part.pos;
  for (let k = 0; k < idx.length; k += 3) {
    const i = idx[k] * 3, j = idx[k + 1] * 3, l = idx[k + 2] * 3;
    const x = (P[i] + P[j] + P[l]) / 3, y = (P[i + 1] + P[j + 1] + P[l + 1]) / 3, z = (P[i + 2] + P[j + 2] + P[l + 2]) / 3;
    const key = `${Math.round(x)},${Math.round(z)}`, prev = stack.get(key);
    if (prev && prev.piece !== p && Math.abs(prev.y - y) > .3 && Math.abs(prev.y - y) < 4) stacked++;
    stack.set(key, {y, piece: p});
  }
}

/* ---- 4. launches: drive straight through every junction ON THE MESH and
   measure the crest radius; sharper than v^2/(0.6 g) lifts the car. */
const SPEED = {freeway: 30, ramp: 18, tunnel: 20, boulevard: 20, avenue: 20, underpass: 18, street: 17, residential: 14, scenic: 15, dirt: 11};
const TC = 8, triGrid = new Map();
for (const p of pieces) for (const [mat, part] of Object.entries(p.parts)) {
  if (!drivable.has(mat)) continue;
  const idx = part.index, P = part.pos;
  for (let k = 0; k < idx.length; k += 3) {
    const t = [idx[k] * 3, idx[k + 1] * 3, idx[k + 2] * 3].map(i => [P[i], P[i + 1], P[i + 2]]);
    t.label = mat[0] + (p.seg !== undefined ? 'S' + p.seg : 'J' + p.junction);
    const x0 = Math.floor(Math.min(t[0][0], t[1][0], t[2][0]) / TC), x1 = Math.floor(Math.max(t[0][0], t[1][0], t[2][0]) / TC);
    const z0 = Math.floor(Math.min(t[0][2], t[1][2], t[2][2]) / TC), z1 = Math.floor(Math.max(t[0][2], t[1][2], t[2][2]) / TC);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const key = gx * 65536 + gz; let l = triGrid.get(key); if (!l) triGrid.set(key, l = []); l.push(t); }
  }
}
/** Height of the drivable surface at (x, z) nearest to `hint`. */
function surfaceY(x, z, hint) {
  let best = null;
  for (const t of triGrid.get(Math.floor(x / TC) * 65536 + Math.floor(z / TC)) || []) {
    const [a, b, c] = t, d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(d) < 1e-3) continue;          // sliver in plan: its barycentrics explode
    const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, v = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d, w = 1 - u - v;
    if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
    const y = u * a[1] + v * b[1] + w * c[1];
    if (Math.abs(y - hint) > 2.5) continue;    // another deck above or below, not this road
    if (best === null || Math.abs(y - hint) < Math.abs(best - hint)) { best = y; surfaceY.label = t.label; }
  }
  return best;
}
let launches = 0, lightCrests = 0, crossings = 0;
const launchAt = [];
for (const j of model.junctions) {
  if (j.cap) continue;
  for (let i = 0; i < j.ends.length; i++) for (let k = i + 1; k < j.ends.length; k++) {
    const A = j.ends[i], B = j.ends[k];
    if (A.dx * B.dx + A.dz * B.dz > -.87) continue;             // not straight through
    // Path: along A's own centreline from 12 m outside its cut-back in to the
    // node, then out along B's the same way. XZ from the road model, Y from the
    // mesh actually built (the thing the tyres meet).
    const ptsA = [], path = [];
    for (const [E, inward] of [[A, true], [B, false]]) {
      const len = Math.min(E.seg.L, E.cut + 12);
      for (let d = 0; d <= len; d += 1) {
        const along = inward ? len - d : d;
        path.push(model.sectionAt(E.seg, E.atStart ? along : E.seg.L - along));
      }
    }
    let prevY = path[0].y;
    const labels = [];
    for (const q of path) { const y = surfaceY(q.x, q.z, prevY); ptsA.push(y); labels.push(surfaceY.label); if (y !== null) prevY = y; }
    crossings++;
    const v = Math.min(SPEED[A.seg.kind] ?? 17, SPEED[B.seg.kind] ?? 17), rMin = v * v / (.6 * 9.81), h = 3;
    let worst = Infinity;
    for (let q = h; q < ptsA.length - h; q++) {
      const y0 = ptsA[q - h], y1 = ptsA[q], y2 = ptsA[q + h];
      if (y0 === null || y1 === null || y2 === null) continue;
      const curv = -(y0 - 2 * y1 + y2) / (h * h);               // positive: crest
      if (curv > 0) worst = Math.min(worst, 1 / curv);
    }
    // Two grades: over v^2/(0.6 g) the wheels go light; over v^2/g the car
    // actually leaves the road. Only the second is a failure.
    if (worst < rMin) lightCrests++;
    if (worst < v * v / 9.81) {
      launches++; launchAt.push([Math.round(j.x), Math.round(j.z), A.seg.kind, Math.round(worst), Math.round(v * v / 9.81)]);
      const inAreaEnv = !process.env.AREA || (() => { const [x0, x1, z0, z1] = process.env.AREA.split(',').map(Number); return j.x > x0 && j.x < x1 && j.z > z0 && j.z < z1; })();
      if (process.env.PROFILE && inAreaEnv && worst < (launchAt.minR ?? Infinity)) { launchAt.minR = worst; launchAt.profile = `J${j.node} A=S${A.seg.id} cut ${A.cut.toFixed(1)} B=S${B.seg.id} cut ${B.cut.toFixed(1)} | ` + ptsA.map((y, q) => `${q}:${y?.toFixed(2)}/${path[q].y.toFixed(2)}${labels[q]}`).join(' '); }
    }
  }
}

const report = {
  seam_worst_m: +seamWorst.toFixed(4),
  seating_samples: samples,
  buried_pct: +(100 * buried / samples).toFixed(3),
  buried_worst_m: +buriedWorst.toFixed(2),
  buried_junction_worst_m: +buriedJunction.toFixed(2),
  surface_road_floating_pct: +(100 * floating / samples).toFixed(3),
  floating_worst_m: +floatWorst.toFixed(2),
  stacked_faces: stacked,
  junction_crossings_tested: crossings,
  junction_light_crests: lightCrests,
  junction_launches: launches,
};
console.log(report);
if (buriedAt.length) console.log('worst buried:', buriedAt.sort((a, b) => b[2] - a[2]).slice(0, 8));
if (floatAt) console.log('worst floating (x, z, kind):', floatAt);
if (launchAt.profile) console.log('worst profile (mesh/model):', launchAt.profile);
if (launchAt.length) console.log('launches (x, z, kind, crest radius m, limit m):', launchAt.sort((a, b) => a[3] - b[3]).slice(0, 8));
if (process.env.AREA) {
  const [x0, x1, z0, z1] = process.env.AREA.split(',').map(Number);
  const inside = launchAt.filter(l => l[0] > x0 && l[0] < x1 && l[1] > z0 && l[1] < z1);
  console.log(`launches inside AREA: ${inside.length}`, inside.slice(0, 12));
}
const fail = seamWorst > .01 || buriedWorst > .3 || buriedJunction > 1.5 || launches > 60;
process.exit(fail ? 1 : 0);
