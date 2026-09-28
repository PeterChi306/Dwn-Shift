/* Navigation (2026-09-27): route to any point, turn-by-turn, and a trail of
 * chevrons on the road ahead.
 *
 * Routing is Dijkstra over the road graph, started from the node AHEAD of
 * the car (a U-turn costs 400 m), freeways cheap, dirt dear. The route is
 * recomputed when the car leaves it. Manoeuvres are the route's nodes where
 * the way turns more than ~28 degrees, or bends onto a road of a new name;
 * the next one is shown with its distance, and the chevrons light the lane
 * to take, over the road surface itself (model.nearest), so they follow the
 * smoothed road through bends and across junctions.
 */
import * as T from 'three';
import {angleDelta} from './network.js';

const COST = {freeway: .7, ramp: .9, boulevard: .85, avenue: .9, street: 1, residential: 1.15, underpass: 1, tunnel: .9, scenic: 1.25, dirt: 2.2};
const CHEVRONS = 34, STEP = 8;

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n, c) { const a = this.a; a.push([c, n]); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
}

export class Navigator {
  constructor({net, model, scene}) {
    this.net = net; this.model = model; this.dest = null; this.path = []; this.nodes = []; this.moves = []; this.timer = 0;
    // Chevrons: a flat V pointing along +z, glowing cyan.
    const g = new T.BufferGeometry(), v = [];
    const quad = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (const s of [-1, 1]) quad([s * .95, 0, -.55], [s * .6, 0, -.55], [0, 0, .35], [0, 0, .75]);
    g.setAttribute('position', new T.Float32BufferAttribute(v, 3)); g.computeVertexNormals();
    const mat = new T.MeshBasicMaterial({color: '#ffffff', transparent: true, opacity: .9, depthWrite: false, side: T.DoubleSide, toneMapped: false});
    this.chev = new T.InstancedMesh(g, mat, CHEVRONS);
    this.chev.instanceColor = new T.InstancedBufferAttribute(new Float32Array(CHEVRONS * 3), 3);
    this.chev.count = 0; this.chev.frustumCulled = false; this.chev.renderOrder = 3;
    scene.add(this.chev);
  }
  /** dest: {name, x, z}. */
  set(dest) { this.dest = dest; this.path = []; this.lastEdge = -1; this.timer = 0; this.arrived = false; }
  clear() { this.dest = null; this.path = []; this.moves = []; this.chev.count = 0; }

  /** Shortest route from the car (on edge e, heading h) to the destination's edge. */
  route(e, x, z, heading) {
    const net = this.net, end = net.nearest(this.dest.x, this.dest.z)?.edge;
    if (!end) return [];
    const dist = new Float64Array(net.nodes.length).fill(Infinity), prev = new Int32Array(net.nodes.length).fill(-1), via = new Int32Array(net.nodes.length).fill(-1);
    const heap = new Heap(), fx = Math.sin(heading), fz = Math.cos(heading);
    for (const [n, P] of [[e.a, e.p], [e.b, e.q]]) {
      const d = Math.hypot(P[0] - x, P[2] - z), ahead = (P[0] - x) * fx + (P[2] - z) * fz > 0;
      dist[n] = d + (ahead ? 0 : 400); heap.push(n, dist[n]);
    }
    let target = -1;
    while (heap.size) {
      const [c, n] = heap.pop();
      if (c > dist[n]) continue;
      if (n === end.a || n === end.b) { target = n; break; }
      for (const id of net.adj[n]) {
        const E = net.edges[id], m = E.a === n ? E.b : E.a, c2 = c + E.length * (COST[E.kind] ?? 1);
        if (c2 < dist[m]) { dist[m] = c2; prev[m] = n; via[m] = id; heap.push(m, c2); }
      }
    }
    const ids = [], nodes = [];
    for (let n = target; n >= 0 && via[n] >= 0; n = prev[n]) { ids.unshift(via[n]); nodes.unshift(n); }
    const first = target >= 0 ? (ids.length ? prev[nodes[0]] : target) : -1;
    return {ids: [e.id, ...ids, end.id].filter((id, i, a) => i === 0 || id !== a[i - 1]), start: first, end};
  }

  /** Per frame: keep the route, find the next manoeuvre, place the chevrons. */
  update(dt, car, hitEdge) {
    if (!this.dest || !hitEdge) { this.chev.count = 0; return null; }
    this.timer -= dt;
    const onRoute = this.path.includes(hitEdge.id);
    if (!onRoute || this.timer < 0 && hitEdge.id !== this.lastEdge) {
      const r = this.route(hitEdge, car.x, car.z, car.heading);
      this.path = r.ids || []; this.lastEdge = hitEdge.id; this.timer = 1.5;
      this.polyline(r);
    }
    // Where along the polyline the car is.
    const P = this.pts; if (!P || P.length < 2) { this.chev.count = 0; return null; }
    let best = 0, bd = Infinity, bt = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((car.x - a.x) * dx + (car.z - a.z) * dz) / l2)), d = Math.hypot(a.x + dx * t - car.x, a.z + dz * t - car.z);
      if (d < bd) { bd = d; best = i; bt = t; }
    }
    const along = P[best].s + (P[best + 1].s - P[best].s) * bt, total = P[P.length - 1].s;
    this.remaining = Math.max(0, total - along);
    if (this.remaining < 35 && bd < 40) { const name = this.dest.name; this.clear(); this.arrived = true; return {arrived: name}; }
    const next = this.moves.find(m => m.s > along + 2);
    this.placeChevrons(along, car);
    return next ? {text: next.text, dir: next.dir, dist: next.s - along, remaining: this.remaining} : {text: `Arrive at ${this.dest.name}`, dir: 'arrive', dist: this.remaining, remaining: this.remaining};
  }

  /** Ordered points along the route (graph nodes) with arc length, and the manoeuvres. */
  polyline(r) {
    const net = this.net, ids = this.path, pts = [];
    if (!ids.length) { this.pts = null; this.moves = []; return; }
    // Walk the edges in travel order: each edge is entered at the node shared with the previous one.
    const first = net.edges[ids[0]];
    // The car's own edge: from its far end back through, entered at the other node.
    const other = n => (e => e.a === n ? e.b : e.a);
    const P = n => net.nodes[n].position;
    const seq = [];                                   // [node, edgeId leading into it]
    if (ids.length > 1) {
      const e1 = net.edges[ids[1]], shared = first.a === e1.a || first.a === e1.b ? first.a : first.b;
      seq.push([other(shared)(first), -1], [shared, first.id]);
      let at = shared;
      for (let i = 1; i < ids.length; i++) { const e = net.edges[ids[i]], nx = e.a === at ? e.b : e.a; seq.push([nx, e.id]); at = nx; }
    } else seq.push([first.a, -1], [first.b, first.id]);
    let s = 0;
    seq.forEach(([n, id], i) => { const p = P(n); if (i) s += Math.hypot(p[0] - pts[i - 1].x, p[2] - pts[i - 1].z); pts.push({x: p[0], y: p[1], z: p[2], s, n, id}); });
    this.pts = pts;
    // Manoeuvres.
    const moves = [];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const hin = Math.atan2(b.x - a.x, b.z - a.z), hout = Math.atan2(c.x - b.x, c.z - b.z), turn = angleDelta(hout - hin);
      const ein = net.edges[b.id], eout = net.edges[c.id], deg = net.adj[b.n].length;
      const renamed = (eout.name || '') !== (ein.name || '');
      if (!renamed && Math.abs(turn) < 1.1 && eout.kind === ein.kind) continue;           // the same road through a bend
      if (Math.abs(turn) < .48 && !(renamed && deg > 2 && Math.abs(turn) > .2) && !(eout.kind === 'ramp' && ein.kind !== 'ramp' && deg > 2) && !(ein.kind === 'ramp' && eout.kind !== 'ramp')) continue;
      // +x east, +z south (a y-down plane): a positive cross product turns clockwise, i.e. right.
      const cross = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x), right = cross > 0;
      const name = eout.name || 'the road';
      let text, dir;
      if (eout.kind === 'ramp' && ein.kind !== 'ramp') { text = `Take the ramp · ${name.replace(/ ramp$/, '')}`; dir = right ? 'ramp-right' : 'ramp-left'; }
      else if (ein.kind === 'ramp' && eout.kind === 'freeway') { text = `Merge onto ${name}`; dir = 'merge'; }
      else if (Math.abs(turn) > 2.4) { text = `Make a U-turn`; dir = 'uturn'; }
      else if (Math.abs(turn) > .48) { text = `Turn ${right ? 'right' : 'left'} onto ${name}`; dir = right ? 'right' : 'left'; }
      else { text = `Keep ${right ? 'right' : 'left'} onto ${name}`; dir = right ? 'keep-right' : 'keep-left'; }
      if (moves.length && (b.s - moves[moves.length - 1].s < 25 || moves[moves.length - 1].text === text)) continue;   // one instruction per junction knot
      moves.push({s: b.s, text, dir});
    }
    this.moves = moves;
  }

  placeChevrons(along, car) {
    const P = this.pts, m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), v = new T.Vector3(), sc = new T.Vector3(1.6, 1, 1.6), c = new T.Color();
    let k = 0, i = 0;
    for (let d = along + 10; k < CHEVRONS && d < P[P.length - 1].s; d += STEP) {
      while (i < P.length - 2 && P[i + 1].s < d) i++;
      const a = P[i], b = P[i + 1], t = (d - a.s) / Math.max(1e-3, b.s - a.s), gx = a.x + (b.x - a.x) * t, gz = a.z + (b.z - a.z) * t;
      const r = this.model.nearest(gx, gz, a.y + (b.y - a.y) * t);
      if (!r) continue;
      const sec = this.model.sectionAt(r.seg, r.s), tdx = b.x - a.x, tdz = b.z - a.z, sign = sec.tx * tdx + sec.tz * tdz >= 0 ? 1 : -1;
      const off = r.seg.kind === 'freeway' && sec.h >= 12 ? 7.6 : r.seg.kind === 'ramp' || r.seg.kind === 'freeway' ? 0 : Math.min(1.9, sec.h * .45);
      const x = sec.x + sec.nx * off * sign, z = sec.z + sec.nz * off * sign, y = sec.y + (sec.cs || 0) * off * sign + .09;
      q.setFromAxisAngle(up, Math.atan2(sec.tx * sign, sec.tz * sign));
      m4.compose(v.set(x, y, z), q, sc); this.chev.setMatrixAt(k, m4);
      const fade = Math.min(1, (d - along - 6) / 20) * Math.min(1, (along + CHEVRONS * STEP - d) / 60);
      this.chev.setColorAt(k, c.setRGB(.08 * fade, .55 * fade, .85 * fade));
      k++;
    }
    this.chev.count = k; this.chev.instanceMatrix.needsUpdate = true; if (this.chev.instanceColor) this.chev.instanceColor.needsUpdate = true;
  }
}
