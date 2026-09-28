#!/usr/bin/env node
/* The coast (2026-09-27): roads.json -> roads.json, in place, once.
 *
 *   node tools/add_coast.mjs [--dry]
 *
 * world/coast.js turns the south of the map into a beach and the sea. Here:
 *   1. every road south of the beachfront boulevard goes (the 110's last
 *      half-kilometre and its two loop ramps: they ran out onto the sand);
 *   2. the 110 ends on the boulevard: its lift over the old crossing is
 *      undone and it runs on as a boulevard into a junction there;
 *   3. every node is lowered by coastShift, measured from the ground BEFORE
 *      the coast, so roads keep their height over the ground exactly.
 * Marks roads.json `coast: 1`; refuses to run twice. Backup first:
 * output/backup-0927-pre-pass9/roads.json.
 */
import {readFileSync, writeFileSync} from 'node:fs';
import {baseNatural} from '../world/network.js';
import {coastShift, BEACH_Z} from '../world/coast.js';

const FILE = new URL('../assets/world/roads.json', import.meta.url);
const data = JSON.parse(readFileSync(FILE));
const DRY = process.argv.includes('--dry');
if (data.coast) { console.log('roads.json already has the coast'); process.exit(0); }
const N = data.nodes, P = id => N[id].position;

// 1. Off the beach.
const is110 = e => e.name.startsWith('110 ');
const gone = new Set(data.edges.filter(e => Math.max(P(e.a)[2], P(e.b)[2]) > BEACH_Z - 12
  || (is110(e) && Math.min(P(e.a)[2], P(e.b)[2]) > 3745)).map(e => e.id));
console.log('removing', gone.size, 'edges:', [...new Set([...gone].map(k => data.edges[k].name))].join(', '));
let edges = data.edges.filter(e => !gone.has(e.id));

// 2. The 110's end: back down to the ground it was lifted from, then on into the boulevard.
const deg = new Map(); for (const e of edges) for (const v of [e.a, e.b]) deg.set(v, (deg.get(v) || 0) + 1);
const end = [...deg.keys()].find(v => deg.get(v) === 1 && edges.some(e => is110(e) && (e.a === v || e.b === v)) && P(v)[2] > 3700);
if (end === undefined) throw new Error('could not find the 110 end');
for (const n of N) if (n.y0 !== undefined && n.layer === '110' && n.position[2] > 3600) n.position[1] = n.y0;
const target = N.reduce((best, n) => {
  const d = Math.hypot(n.position[0] - P(end)[0], n.position[2] - 3880);
  return Math.abs(n.position[2] - 3880) < 1 && d < best.d ? {d, n} : best;
}, {d: Infinity}).n;
const a = P(end), b = target.position, L = Math.hypot(b[0] - a[0], b[2] - a[2]), steps = Math.max(2, Math.round(L / 22));
let prev = end;
const tmpl = {road: edges.find(e => is110(e)).road, name: '110 · Arroyo Freeway', kind: 'boulevard', width: 34, lanes: 6, district: 'Exposition Park', gen: 'coast'};
for (let k = 1; k <= steps; k++) {
  let id = target.id;
  if (k < steps) {
    const t = k / steps, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    id = N.length; N.push({id, map: [p[0] / 10 + 768, p[2] / 10 + 512], position: p, layer: 'surface'});
  }
  edges.push({...tmpl, a: prev, b: id, id: -1});
  prev = id;
}
console.log(`110 ends at node ${end} (z ${a[2].toFixed(0)}), runs ${L.toFixed(0)} m on to the boulevard at node ${target.id}`);

// Compact nodes and ids.
const used = new Set(); for (const e of edges) { used.add(e.a); used.add(e.b); }
const map = new Map();
data.nodes = N.filter(n => used.has(n.id)).map((n, i) => { map.set(n.id, i); return {...n, id: i}; });
data.edges = edges.map((e, i) => ({...e, id: i, a: map.get(e.a), b: map.get(e.b)}));

// 3. Down to the beach, with the ground.
let moved = 0, most = 0;
for (const n of data.nodes) {
  const [x, y, z] = n.position, dy = coastShift(x, z, baseNatural(x, z));
  if (!dy) continue;
  n.position[1] = y + dy; if (n.y0 !== undefined) n.y0 += dy;
  moved++; most = Math.min(most, dy);
}
console.log(`lowered ${moved} nodes (deepest ${most.toFixed(1)} m)`);
data.coast = 1;
if (!DRY) { writeFileSync(FILE, JSON.stringify(data)); console.log('wrote', FILE.pathname); }
