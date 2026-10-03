#!/usr/bin/env node
/* Pacific rest area ramps (2026-10-02): roads.json -> roads.json, in place.
 *
 *   node tools/add_rest_stop.mjs [--dry]
 *
 * A rest stop on the north side of the 10 west of downtown, by the raceway
 * (world/reststop.js builds it: car and truck parking, a gas station, a
 * restroom block, picnic tables). It serves westbound traffic: an exit ramp
 * leaves the freeway east of it and curves into the car park, a return ramp
 * leaves the car park's west end and merges back. Both are 'ramp' roads
 * between a freeway node and the car park; positions are in the rest stop's
 * frame (u along the freeway eastward, v north of its centreline), shared
 * with reststop.js through REST below (keep the two in step).
 * New edges carry gen:'rs' and are replaced on a rerun. Run after add_venue_roads.mjs.
 */
import {readFileSync, writeFileSync} from 'node:fs';

export const REST = {C: [-7180, 2421], t: [.987, -.159], y: 11.1};
const FILE = new URL('../assets/world/roads.json', import.meta.url);
const data = JSON.parse(readFileSync(FILE));
const DRY = process.argv.includes('--dry');
{
  const n0 = data.edges.length;
  data.edges = data.edges.filter(e => e.gen !== 'rs');
  if (data.edges.length !== n0) {
    const used = new Set(); for (const e of data.edges) { used.add(e.a); used.add(e.b); }
    const map = new Map();
    data.nodes = data.nodes.filter(n => used.has(n.id)).map((n, i) => { map.set(n.id, i); return {...n, id: i}; });
    data.edges = data.edges.map((e, i) => ({...e, id: i, a: map.get(e.a), b: map.get(e.b)}));
    console.log(`removed ${n0 - data.edges.length} previously generated edges`);
  }
}
const nodes = data.nodes, edges = data.edges;
const l = Math.hypot(...REST.t), t = [REST.t[0] / l, REST.t[1] / l], north = [t[1], -t[0]];        // -n: the left of eastbound = north
const W = (u, v) => [REST.C[0] + t[0] * u + north[0] * v, REST.C[1] + t[1] * u + north[1] * v];
const freewayNode = (u) => {
  const [x, z] = W(u, 0); let best = null, bd = 1e9;
  for (const n of nodes) { const d = Math.hypot(n.position[0] - x, n.position[2] - z); if (d < bd && edges.some(e => (e.a === n.id || e.b === n.id) && e.kind === 'freeway')) { bd = d; best = n; } }
  if (bd > 15) throw new Error(`no freeway node near u=${u}`);
  return best;
};
function ramp(fromId, uvPts, name, reverse) {
  const P = nodes[fromId].position;
  let a = fromId;
  uvPts.forEach(([u, v]) => {
    const [x, z] = W(u, v), id = nodes.length;
    nodes.push({id, map: [x / 10 + 768, z / 10 + 512], position: [+x.toFixed(2), +(REST.y + (P[1] - REST.y) * 0).toFixed(3), +z.toFixed(2)], layer: 'surface'});
    edges.push({id: edges.length, a: reverse ? id : a, b: reverse ? a : id, road: 9500 + edges.length, name, kind: 'ramp', width: 9, lanes: 1, district: 'Westside', gen: 'rs'});
    a = id;
  });
}
const exitN = freewayNode(150), backN = freewayNode(-190);
ramp(exitN.id, [[128, 16], [112, 34], [101, 52], [97, 70], [96, 84]], 'Pacific Rest Area exit');
ramp(backN.id, [[-168, 16], [-152, 34], [-141, 52], [-137, 70], [-136, 84]], 'Pacific Rest Area entrance', true);
console.log(`ramps from freeway nodes ${exitN.id} (${exitN.position.map(Math.round)}) and ${backN.id} (${backN.position.map(Math.round)})`);
if (!DRY) {
  data.edges = edges.map((e, id) => ({...e, id}));
  data.version = (data.version || 0) + 1;
  writeFileSync(FILE, JSON.stringify(data));
  console.log(`wrote roads.json: ${nodes.length} nodes, ${edges.length} edges`);
}
