#!/usr/bin/env node
/* Drivability audit for one area of the built road SURFACE (RoadModel, the
 * same heights the car drives on):
 *   node tools/audit_area.mjs [x0 x1 z0 z1]      (default: West Hollywood + hills)
 * Reports, per kind: grade percentiles along each segment measured over 10 m,
 * the steepest runs, junction plane tilts, the sharpest arm-to-arm angles and
 * vertical kinks (crests/sags) that would launch or bottom out a car. */
import {readFileSync} from 'node:fs';
import {RoadNetwork} from '../world/network.js';
import {RoadModel} from '../world/roads.js';
import {naturalHeight as terrainHeight} from '../world/network.js';

const [x0, x1, z0, z1] = process.argv.length > 5 ? process.argv.slice(2, 6).map(Number) : [-5600, -1900, -2900, -100];
const inA = (x, z) => x > x0 && x < x1 && z > z0 && z < z1;
const net = new RoadNetwork(JSON.parse(readFileSync(new URL('../assets/world/roads.json', import.meta.url))));
const model = new RoadModel(net);

const byKind = {}, steep = [], kinks = [];
for (const seg of model.segments) {
  const mid = model.sectionAt(seg, seg.L / 2);
  if (!inA(mid.x, mid.z) || seg.kind === 'tunnel') continue;
  const k = byKind[seg.kind] ??= {grades: [], km: 0};
  k.km += seg.L / 1000;
  let prev = null, prevG = null, worst = 0;
  for (let s = 0; s + 10 <= seg.L; s += 5) {
    const a = model.sectionAt(seg, s), b = model.sectionAt(seg, s + 10);
    const g = (b.y - a.y) / Math.max(1e-3, Math.hypot(b.x - a.x, b.z - a.z));
    k.grades.push(Math.abs(g)); worst = Math.max(worst, Math.abs(g));
    if (prevG !== null && Math.abs(g - prevG) > .1) kinks.push({name: seg.name, kind: seg.kind, x: Math.round(a.x), z: Math.round(a.z), dG: +(g - prevG).toFixed(2)});
    prevG = s % 10 === 0 ? g : prevG; prev = a;
  }
  if (worst > .15) steep.push({name: seg.name, kind: seg.kind, worst: +worst.toFixed(3), L: Math.round(seg.L), x: Math.round(mid.x), z: Math.round(mid.z)});
}
const pct = (a, q) => { const s = [...a].sort((p, r) => p - r); return s[Math.floor(q * (s.length - 1))] ?? 0; };
console.log('kind          km    p50    p90    p99    max  %>12%  %>18%');
for (const [kind, k] of Object.entries(byKind)) {
  const over = t => (100 * k.grades.filter(g => g > t).length / Math.max(1, k.grades.length)).toFixed(1);
  console.log(kind.padEnd(12), k.km.toFixed(1).padStart(5), ...[.5, .9, .99, 1].map(q => (pct(k.grades, q) * 100).toFixed(1).padStart(6)), over(.12).padStart(6), over(.18).padStart(6));
}
const J = model.junctions.filter(j => !j.cap && inA(j.x, j.z));
const tilt = j => j.plane ? Math.hypot(j.plane.a, j.plane.b) : 0;
let sharp = 0, tilted = 0;
const worstJ = [];
for (const j of J) {
  const dirs = j.ends.map(e => { const s = model.sectionAt(e.seg, e.atStart ? e.cut : e.seg.L - e.cut); return Math.atan2(s.tx * (e.atStart ? 1 : -1), s.tz * (e.atStart ? 1 : -1)); });
  let minAng = Math.PI;
  for (let a = 0; a < dirs.length; a++) for (let b = a + 1; b < dirs.length; b++) { let d = Math.abs(dirs[a] - dirs[b]) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; minAng = Math.min(minAng, d); }
  const t = tilt(j);
  if (minAng < 35 * Math.PI / 180) sharp++;
  if (t > .08) tilted++;
  worstJ.push({x: Math.round(j.x), z: Math.round(j.z), arms: j.ends.length, minAngle: Math.round(minAng * 180 / Math.PI), tilt: +t.toFixed(3), names: [...new Set(j.ends.map(e => e.seg.name))].join(' / ')});
}
console.log(`\njunctions ${J.length}: arms meeting at <35 deg ${sharp}, plane tilt >8% ${tilted}`);
console.log('sharpest:', JSON.stringify(worstJ.sort((a, b) => a.minAngle - b.minAngle).slice(0, 8)));
console.log('most tilted:', JSON.stringify(worstJ.sort((a, b) => b.tilt - a.tilt).slice(0, 6)));
console.log(`\nsegments with a 10 m run over 15%: ${steep.length}`);
console.log(JSON.stringify(steep.sort((a, b) => b.worst - a.worst).slice(0, 12)));
console.log(`\ngrade kinks >10% within 10 m: ${kinks.length}`, JSON.stringify(kinks.slice(0, 6)));

/* Where is it steep: in the graph itself, or added by the surface model
 * (smoothing + junction planes)? Graph grade per edge, scenic only. */
{
  const N = net.data.nodes, gg = [];
  for (const e of net.data.edges) {
    const a = N[e.a].position, b = N[e.b].position;
    if (!inA((a[0] + b[0]) / 2, (a[2] + b[2]) / 2) || e.kind !== 'scenic') continue;
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]); if (L < 1) continue;
    gg.push({g: Math.abs(b[1] - a[1]) / L, L});
  }
  const tot = gg.reduce((s, x) => s + x.L, 0), over = t => (100 * gg.filter(x => x.g > t).reduce((s, x) => s + x.L, 0) / tot).toFixed(1);
  console.log(`\ngraph (scenic edges): %len >12% ${over(.12)}, >18% ${over(.18)}, >22% ${over(.22)}, max ${(Math.max(...gg.map(x => x.g)) * 100).toFixed(1)}%`);
  // Model grade near junctions vs away from them.
  let nearN = 0, nearS = 0, farN = 0, farS = 0;
  for (const seg of model.segments) {
    if (seg.kind !== 'scenic') continue;
    const mid = model.sectionAt(seg, seg.L / 2); if (!inA(mid.x, mid.z)) continue;
    for (let s = 0; s + 10 <= seg.L; s += 5) {
      const a = model.sectionAt(seg, s), b = model.sectionAt(seg, s + 10);
      const g = Math.abs(b.y - a.y) / Math.max(1e-3, Math.hypot(b.x - a.x, b.z - a.z));
      const near = s < seg.cut[0] + 20 || s + 10 > seg.L - seg.cut[1] - 20;
      if (near) { nearN++; if (g > .18) nearS++; } else { farN++; if (g > .18) farS++; }
    }
  }
  console.log(`model scenic >18%: near junctions ${(100 * nearS / nearN).toFixed(1)}% of ${nearN}, open road ${(100 * farS / farN).toFixed(1)}% of ${farN}`);
}

/* How far the graded road departs from the natural hillside (cut depth / fill
 * height), scenic + residential: deep trenches and tall embankments are the
 * price of a gentler grade. */
{
  const dev = [];
  for (const seg of model.segments) {
    if (seg.kind !== 'scenic' && seg.kind !== 'residential') continue;
    const mid = model.sectionAt(seg, seg.L / 2); if (!inA(mid.x, mid.z)) continue;
    for (let s = 0; s < seg.L; s += 10) { const q = model.sectionAt(seg, s); dev.push(q.y - terrainHeight(q.x, q.z)); }
  }
  const abs = dev.map(Math.abs);
  console.log(`road vs natural hillside (m): p50 ${pct(abs, .5).toFixed(1)}, p90 ${pct(abs, .9).toFixed(1)}, p99 ${pct(abs, .99).toFixed(1)}, deepest cut ${(-Math.min(...dev)).toFixed(1)}, highest fill ${Math.max(...dev).toFixed(1)}`);
}
