#!/usr/bin/env node
/* Mount Lee overlook drive (2026-10-02): roads.json -> roads.json, in place.
 *
 *   node tools/add_overlook_drive.mjs [--dry]
 *
 * Mount Lee Summit Road used to run on north-east past the overlook and stop
 * in a dead end 140 m north of it; the overlook's drive was scenery laid on
 * the hill from near that dead end, doubling back. Now the road itself turns:
 * from its node at (-1119.5, -3350.5) it swings right through 135 degrees on
 * a 26 m radius and runs straight south into the parking lot's mouth on the
 * plaza's north edge (places.js OVERLOOK), climbing at an even grade and
 * levelling off for the last few metres onto the plaza. The old stub (three
 * edges, two nodes) is removed. Same name and kind, so it is one road.
 * New edges carry gen:'ov' and are replaced on a rerun. Run after
 * add_tunnels.mjs.
 */
import {readFileSync, writeFileSync} from 'node:fs';

const FILE = new URL('../assets/world/roads.json', import.meta.url);
const data = JSON.parse(readFileSync(FILE));
const DRY = process.argv.includes('--dry');
const NAME = 'Mount Lee Summit Road';
const START = [-1119.5, -3350.5], END = [-1075, -3296], END_Y = 539.52, R = 26;
const STUB = [[-1103, -3367], [-1086.5, -3383.5], [-1070, -3400]];          // the old run past the overlook

const near = (p, q, r = 1.5) => Math.hypot(p[0] - q[0], p[2] - q[1]) < r;
// Drop last run's edges and the old stub's edges, then any node left unused.
const stubNode = new Set(data.nodes.filter(n => STUB.some(q => near(n.position, q))).map(n => n.id));
const before = data.edges.length;
data.edges = data.edges.filter(e => e.gen !== 'ov' && !(e.name === NAME && (stubNode.has(e.a) || stubNode.has(e.b))));
console.log(`removed ${before - data.edges.length} edges (old stub / previous run)`);
{
  const used = new Set(); for (const e of data.edges) { used.add(e.a); used.add(e.b); }
  const map = new Map();
  data.nodes = data.nodes.filter(n => used.has(n.id)).map((n, i) => { map.set(n.id, i); return {...n, id: i}; });
  data.edges = data.edges.map((e, i) => ({...e, id: i, a: map.get(e.a), b: map.get(e.b)}));
}
const start = data.nodes.find(n => near(n.position, START));
if (!start) throw new Error('start node not found');
const proto = data.edges.find(e => e.a === start.id || e.b === start.id);
const deg = data.edges.filter(e => e.a === start.id || e.b === start.id).length;
if (deg !== 1) throw new Error(`start node should now be the road's end (degree ${deg})`);
// Heading NE (the road's own direction), turn right 135 degrees, then south.
const P = start.position, t0 = [Math.SQRT1_2, -Math.SQRT1_2], right = [-t0[1], t0[0]];
const C = [P[0] + right[0] * R, P[2] + right[1] * R], a0 = Math.atan2(P[2] - C[1], P[0] - C[0]), sweep = 3 * Math.PI / 4;
const pts = [];
for (let k = 1; k <= 7; k++) { const a = a0 + sweep * k / 7; pts.push([C[0] + Math.cos(a) * R, C[1] + Math.sin(a) * R]); }
const exit = pts[pts.length - 1];
if (Math.abs(exit[0] - END[0]) > 1.5) throw new Error(`curve exits at x ${exit[0].toFixed(1)}, expected ${END[0]}`);
const run = END[1] - exit[1], n = Math.max(2, Math.round(run / 12));
for (let k = 1; k <= n; k++) pts.push([exit[0] + (END[0] - exit[0]) * k / n, exit[1] + run * k / n]);
// Even grade to 6 m short of the plaza, level from there.
const S = [0]; let prev = [P[0], P[2]];
for (const p of pts) { S.push(S[S.length - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1])); prev = p; }
const L = S[S.length - 1], climb = L - 6;
const yAt = s => s >= climb ? END_Y : P[1] + (END_Y - P[1]) * s / climb;
console.log(`drive ${L.toFixed(0)} m, grade ${((END_Y - P[1]) / climb * 100).toFixed(1)}%, exits the curve at x ${exit[0].toFixed(1)}`);
const nodes = data.nodes, edges = data.edges;
let a = start.id;
pts.forEach((p, i) => {
  const id = nodes.length;
  nodes.push({id, map: [p[0] / 10 + 768, p[1] / 10 + 512], position: [+p[0].toFixed(2), +yAt(S[i + 1]).toFixed(3), +p[1].toFixed(2)], layer: 'surface'});
  edges.push({id: edges.length, a, b: id, road: proto.road, name: NAME, kind: proto.kind, width: proto.width, lanes: proto.lanes, district: proto.district, gen: 'ov'});
  a = id;
});
if (!DRY) {
  data.version = (data.version || 0) + 1;
  writeFileSync(FILE, JSON.stringify(data));
  console.log(`wrote roads.json: ${nodes.length} nodes, ${edges.length} edges`);
}
