#!/usr/bin/env node
/* Venue entrance roads (2026-10-02): roads.json -> roads.json, in place.
 *
 *   node tools/add_venue_roads.mjs [--dry]
 *
 * Both motorsport venues (world/venues.js) sat off the network: the drag
 * strip was reached by a strip of asphalt laid on the hill from the end of
 * Whittier Boulevard, the raceway's paddock just touched Culver City Loop.
 * Now each has a real road that ends at its gate, graded like any other:
 *   Dragway Drive    Whittier Boulevard carried on from its dead end: a right
 *                    sweep (R 50) to the south, down the slope, and a second
 *                    right (R 40) into the east gate of the dragway's car park
 *                    at the strip's level (venues.js DRAG.lot).
 *   Raceway Drive    Irving Place carried straight on west across Culver City
 *                    Loop (a crossroads now) to the raceway gate (CIRCUIT.gate).
 * New edges carry gen:'vn' and are replaced on a rerun. Run after
 * add_overlook_drive.mjs.
 */
import {readFileSync, writeFileSync} from 'node:fs';

const FILE = new URL('../assets/world/roads.json', import.meta.url);
const data = JSON.parse(readFileSync(FILE));
const DRY = process.argv.includes('--dry');
{
  const n0 = data.edges.length;
  data.edges = data.edges.filter(e => e.gen !== 'vn');
  if (data.edges.length !== n0) {
    const used = new Set(); for (const e of data.edges) { used.add(e.a); used.add(e.b); }
    const map = new Map();
    data.nodes = data.nodes.filter(n => used.has(n.id)).map((n, i) => { map.set(n.id, i); return {...n, id: i}; });
    data.edges = data.edges.map((e, i) => ({...e, id: i, a: map.get(e.a), b: map.get(e.b)}));
    console.log(`removed ${n0 - data.edges.length} previously generated edges`);
  }
}
const nodes = data.nodes, edges = data.edges;
const nodeAt = (x, z, r = 1.5) => nodes.find(n => Math.hypot(n.position[0] - x, n.position[2] - z) < r);
const degree = id => edges.filter(e => e.a === id || e.b === id).length;

/** Arc from p (heading t) turning right by `ang` on radius R: points every ~step m. */
function arc(p, t, R, ang, step = 10) {
  const right = [-t[1], t[0]], C = [p[0] + right[0] * R, p[1] + right[1] * R];
  const a0 = Math.atan2(p[1] - C[1], p[0] - C[0]), n = Math.max(2, Math.ceil(R * ang / step)), out = [];
  for (let k = 1; k <= n; k++) { const a = a0 + ang * k / n; out.push([C[0] + Math.cos(a) * R, C[1] + Math.sin(a) * R]); }
  const ae = a0 + ang; return {pts: out, end: out[out.length - 1], t: [-Math.sin(ae), Math.cos(ae)]};
}
function addRoad(startId, pts, endY, {name, kind, width, lanes, district, flat = 8}) {
  const P = nodes[startId].position, S = [0]; let prev = [P[0], P[2]];
  for (const p of pts) { S.push(S[S.length - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1])); prev = p; }
  const L = S[S.length - 1], climb = L - flat, yAt = s => s >= climb ? endY : P[1] + (endY - P[1]) * s / climb;
  let a = startId;
  pts.forEach((p, i) => {
    const id = nodes.length;
    nodes.push({id, map: [p[0] / 10 + 768, p[1] / 10 + 512], position: [+p[0].toFixed(2), +yAt(S[i + 1]).toFixed(3), +p[1].toFixed(2)], layer: 'surface'});
    edges.push({id: edges.length, a, b: id, road: 9000 + edges.length, name, kind, width, lanes, district, gen: 'vn'});
    a = id;
  });
  console.log(`${name}: ${L.toFixed(0)} m, ${(Math.abs(endY - P[1]) / climb * 100).toFixed(1)}% to y ${endY}`);
}

// Dragway Drive: from Whittier's dead end (6420, 3250), heading ESE.
{
  const s = nodeAt(6420, 3250); if (!s || degree(s.id) !== 1) throw new Error('Whittier end not found');
  const prevN = nodes[edges.find(e => e.a === s.id || e.b === s.id)[edges.find(e => e.a === s.id || e.b === s.id).a === s.id ? 'b' : 'a']].position;
  let t = [s.position[0] - prevN[0], s.position[2] - prevN[2]]; const l = Math.hypot(...t); t = [t[0] / l, t[1] / l];
  const a1 = arc([s.position[0], s.position[2]], t, 50, Math.acos(t[1]) );             // to heading due south
  const zTurn = 3440, straight = []; for (let z = a1.end[1] + 12; z < zTurn - 2; z += 12) straight.push([a1.end[0], z]);
  straight.push([a1.end[0], zTurn]);
  const a2 = arc([a1.end[0], zTurn], [0, 1], 40, Math.PI / 2);                         // to heading due west
  const tail = [[a2.end[0] - 6, a2.end[1]]];
  addRoad(s.id, [...a1.pts, ...straight, ...a2.pts, ...tail], 9.5, {name: 'Dragway Drive', kind: 'avenue', width: 22, lanes: 4, district: 'Eastside'});
}
// Raceway Drive: Irving Place on across Culver City Loop at (-6243.3, 3385.3).
{
  const s = nodeAt(-6243.3, 3385.3); if (!s) throw new Error('Culver City Loop / Irving Place junction not found');
  const pts = []; for (let x = s.position[0] - 14; x > -6302; x -= 14) pts.push([x, 3385.3]); pts.push([-6302, 3385.3]);
  addRoad(s.id, pts, 7.5, {name: 'Raceway Drive', kind: 'street', width: 14, lanes: 2, district: 'Culver City', flat: 10});
}
if (!DRY) {
  data.edges = edges.map((e, id) => ({...e, id}));
  data.version = (data.version || 0) + 1;
  writeFileSync(FILE, JSON.stringify(data));
  console.log(`wrote roads.json: ${nodes.length} nodes, ${edges.length} edges`);
}
