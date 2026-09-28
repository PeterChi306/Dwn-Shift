#!/usr/bin/env node
/* Road FORMATION scan for an area: finds what a driver sees as broken.
 *   node tools/scan_roads.mjs [x0 x1 z0 z1] [--list]
 * 1. pavement-on-road: a ribbon's kerb/pavement strip lying on another road's
 *    carriageway or inside a junction's asphalt (pavement across the road);
 * 2. overlapping carriageways: two ribbons' asphalt on top of each other;
 * 3. dead ends: segments ending in nothing (and how long the stub is);
 * 4. tunnels: tunnel segments and whether each mouth reaches daylight;
 * 5. short / degenerate ribbons (trimmed length < 2 m between junctions). */
import {readFileSync} from 'node:fs';
import {RoadNetwork} from '../world/network.js';
import {RoadModel, VERGE, CURB} from '../world/roads.js';

const args = process.argv.slice(2).filter(a => !a.startsWith('--')).map(Number);
const [x0, x1, z0, z1] = args.length >= 4 ? args : [-5600, -1900, -2900, -100];
const LIST = process.argv.includes('--list');
const inA = (x, z) => x > x0 && x < x1 && z > z0 && z < z1;
const net = new RoadNetwork(JSON.parse(readFileSync(new URL('../assets/world/roads.json', import.meta.url))));
const model = new RoadModel(net);

// Carriageway test against every OTHER segment's trimmed asphalt and every junction.
function onAsphalt(x, z, y, selfSeg, selfJ = null) {
  for (const j of model.junctionsNear(x, z)) {
    if (j === selfJ) continue;
    if (Math.hypot(x - j.x, z - j.z) < j.radius + 1 && model.junctionZone(j, x, z) === 'in' && Math.abs(j.plane(x, z) - y) < 2.5) return {j};
  }
  const list = model.near(x, z);
  for (let k = 0; k < list.length; k += 2) {
    const seg = model.segments[list[k]];
    if (seg === selfSeg || seg.kind === 'tunnel') continue;
    const s0 = seg.cut[0], s1 = seg.L - seg.cut[1];
    const i = list[k + 1], a = seg.pts[i], b = seg.pts[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz; if (l2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    const s = seg.S[i] + (seg.S[i + 1] - seg.S[i]) * t;
    if (s < s0 || s > s1) continue;
    const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(x - px, z - pz), h = a.h + (b.h - a.h) * t;
    if (d < h - .3 && Math.abs(a.y + (b.y - a.y) * t - y) < 2.5) return {seg};
  }
  return null;
}
const issues = {pave: new Map(), overlap: new Map()};
const bump = (map, key, info) => { const o = map.get(key) || {n: 0, ...info}; o.n++; map.set(key, o); };
for (const seg of model.segments) {
  if (seg.kind === 'tunnel' || seg.elevated) continue;
  const s0 = seg.cut[0], s1 = seg.L - seg.cut[1];
  for (let s = s0; s <= s1; s += 1.5) {
    const q = model.sectionAt(seg, s);
    if (!inA(q.x, q.z)) continue;
    const w = q.h + (VERGE[seg.kind] ?? 2);
    for (const side of [-1, 1]) {
      // Pavement / verge band.
      for (const off of [q.h + .4, (q.h + w) / 2, w - .2]) {
        const x = q.x + q.nx * off * side, z = q.z + q.nz * off * side;
        const hit = onAsphalt(x, z, q.y, seg);
        if (hit) bump(issues.pave, hit.j ? 'J' + hit.j.node : 'S' + seg.id, {x: Math.round(x), z: Math.round(z), road: seg.name, kind: seg.kind, on: hit.j ? 'junction ' + [...new Set(hit.j.ends.map(e => e.seg.name))].join('/') : hit.seg.name});
      }
      // Own asphalt on another road's asphalt.
      const x = q.x + q.nx * q.h * .5 * side, z = q.z + q.nz * q.h * .5 * side, hit = onAsphalt(x, z, q.y, seg);
      if (hit && hit.seg) bump(issues.overlap, [seg.id, hit.seg.id].sort().join('-'), {x: Math.round(x), z: Math.round(z), a: seg.name, b: hit.seg.name});
    }
  }
}
// Junction corner pavements over other asphalt.
for (const j of model.junctions) {
  if (j.cap || !inA(j.x, j.z)) continue;
  for (const k of j.kerbs) {
    if (!k.curb) continue;
    k.pts.forEach((p, q) => {
      if (q % 2) return;
      const o = k.outs[q], w = (k.width[0] + k.width[1]) / 2;
      const x = p[0] + o[0] * w * .6, z = p[2] + o[1] * w * .6, hit = onAsphalt(x, z, p[1], null, j);
      if (hit) bump(issues.pave, 'J' + j.node + 'k', {x: Math.round(x), z: Math.round(z), road: 'corner of ' + [...new Set(j.ends.map(e => e.seg.name))].join('/'), on: hit.j ? 'junction' : hit.seg.name});
    });
  }
}
const caps = model.junctions.filter(j => j.cap).map(j => {
  const {seg, atStart} = j.cap, q = model.sectionAt(seg, atStart ? 0 : seg.L);
  return {x: Math.round(q.x), z: Math.round(q.z), name: seg.name, kind: seg.kind, L: Math.round(seg.L)};
}).filter(c => inA(c.x, c.z));
const tunnels = model.segments.filter(s => s.kind === 'tunnel').map(s => ({s, a: model.sectionAt(s, 0), b: model.sectionAt(s, s.L)}))
  .filter(({a, b}) => inA(a.x, a.z) || inA(b.x, b.z));
const short = model.segments.filter(s => { const q = model.sectionAt(s, s.L / 2); return inA(q.x, q.z) && s.L - s.cut[0] - s.cut[1] < 2 && !s.elevated; });
const sum = m => [...m.values()].reduce((a, o) => a + o.n, 0);
console.log(`pavement on asphalt: ${issues.pave.size} places (${sum(issues.pave)} samples)`);
console.log(`overlapping carriageways: ${issues.overlap.size} pairs (${sum(issues.overlap)} samples)`);
console.log(`dead ends: ${caps.length} (stubs < 40 m: ${caps.filter(c => c.L < 40).length})`);
console.log(`tunnel segments: ${tunnels.length}`);
console.log(`degenerate ribbons (<2 m between junctions): ${short.length}`);
if (LIST) {
  console.log('\nPAVE', JSON.stringify([...issues.pave.values()].sort((a, b) => b.n - a.n).slice(0, 25)));
  console.log('\nOVERLAP', JSON.stringify([...issues.overlap.values()].sort((a, b) => b.n - a.n).slice(0, 15)));
  console.log('\nCAPS', JSON.stringify(caps.slice(0, 40)));
  console.log('\nTUNNELS', JSON.stringify(tunnels.map(({s, a, b}) => ({name: s.name, L: Math.round(s.L), a: [a.x | 0, a.y | 0, a.z | 0], b: [b.x | 0, b.y | 0, b.z | 0]}))));
}
