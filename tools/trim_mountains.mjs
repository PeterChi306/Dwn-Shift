#!/usr/bin/env node
/* Mountains (2026-09-27, Peter: "don't add any road or unfinished highways at
 * higher altitudes, it is unnecessary"): roads.json -> roads.json, in place.
 *
 *   node tools/trim_mountains.mjs [--dry]
 *
 * Removes the high roads that led nowhere: the Verdugo fire roads, canyon
 * and vista loops round Mount Lee (with their tunnel), the Arroyo Seco fire
 * road, and the 134 Ventura Freeway, which ran 6.5 km along the ridge at
 * 300-380 m and dead-ended at both ends, with its three ramps. The roads that
 * make the Hollywood Hills stay: Mulholland Crest, Mount Lee Summit Road to
 * the sign and overlook, Verdugo Crest, the canyon roads. Then any stub a
 * removal left dangling is pruned back to the junction it came from.
 */
import {readFileSync, writeFileSync} from 'node:fs';

const FILE = new URL('../assets/world/roads.json', import.meta.url);
const data = JSON.parse(readFileSync(FILE));
const DRY = process.argv.includes('--dry');
const NAMES = new Set(['Verdugo Canyon Road', 'Verdugo Vista Road', 'Verdugo Vista Road Tunnel', 'Mount Lee Fire Road',
  'Verdugo Fire Road', 'Arroyo Seco Fire Road', 'Mulholland / 134 ramp', 'Verdugo / 134 ramp', '101 to 134']);
const drop = e => NAMES.has(e.name) || e.name.startsWith('134 ');
const before = new Map(); for (const e of data.edges) for (const v of [e.a, e.b]) before.set(v, (before.get(v) || 0) + 1);
let edges = data.edges.filter(e => !drop(e));
console.log('removed', data.edges.length - edges.length, 'edges');

// Prune stubs the removal left: walk back from each new dead end along
// degree-2 nodes, up to 400 m, and drop the stub if it is a hill road.
const P = id => data.nodes[id].position;
for (let pass = 0; pass < 3; pass++) {
  const inc = new Map(); edges.forEach((e, k) => { for (const v of [e.a, e.b]) (inc.get(v) || inc.set(v, []).get(v)).push(k); });
  const kill = new Set();
  for (const [v, list] of inc) {
    if (list.length !== 1 || before.get(v) === 1) continue;           // was already a dead end: leave it
    let cur = v, k = list[0], len = 0; const chain = [];
    for (;;) {
      const e = edges[k]; chain.push(k); len += Math.hypot(P(e.a)[0] - P(e.b)[0], P(e.a)[2] - P(e.b)[2]);
      const nxt = e.a === cur ? e.b : e.a, l2 = inc.get(nxt);
      if (l2.length !== 2 || len > 400) break;
      cur = nxt; k = l2[0] === k ? l2[1] : l2[0];
    }
    if (len <= 400) for (const c of chain) kill.add(c);
  }
  if (!kill.size) break;
  console.log(`pass ${pass}: pruned ${kill.size} stub edges (${[...new Set([...kill].map(k => edges[k].name))].join(', ')})`);
  edges = edges.filter((_, k) => !kill.has(k));
}
const used = new Set(); for (const e of edges) { used.add(e.a); used.add(e.b); }
const map = new Map();
data.nodes = data.nodes.filter(n => used.has(n.id)).map((n, i) => { map.set(n.id, i); return {...n, id: i}; });
data.edges = edges.map((e, i) => ({...e, id: i, a: map.get(e.a), b: map.get(e.b)}));
console.log(`${data.nodes.length} nodes, ${data.edges.length} edges`);
if (!DRY) { writeFileSync(FILE, JSON.stringify(data)); console.log('wrote roads.json'); }
