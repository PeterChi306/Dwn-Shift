/* Road surface model: the ONE description of where you can drive.
 *
 * The old renderer drew every graph edge as its own flat quad and let them
 * overlap at every junction, then carved the terrain from the raw graph. The
 * road you saw, the road the car sat on and the ground around it were three
 * different shapes, which is why roads were buried, floating or both.
 *
 * Here the graph is turned into a real surface once:
 *   - segments: runs of road between junctions, smoothed so kinks become curves;
 *   - junctions: every road is cut back to where its kerb meets its neighbour's,
 *     and the hole is filled by one polygon with rounded kerb corners;
 *   - ribbons: each segment between its two cut-backs, built from the SAME
 *     cross-section function the junction used, so the two meet exactly.
 * The ground (ground.js), the render meshes and the physics colliders are all
 * derived from this, so they cannot disagree.
 *
 * No three.js in here: plain arrays, so it runs in Node for tests too.
 */
import {clamp, naturalHeight as terrainHeight} from './network.js';

export const TILE = 256;                  // physics / streaming tile, metres

/* Carriageway half-widths. The graph's widths include parking lanes, which is
 * right for city streets; a 40 m freeway is not, so it is narrowed to 3+3
 * lanes, shoulders and a median. Canyon and fire roads are real-world narrow. */
const HALF = {freeway: 16, scenic: 4.8, dirt: 3.2};
/* The freeway median barrier: asphalt up to its toe, the sloped Jersey faces, a flat top. */
const MEDIAN_CLEAR = 90, TAPER = .08;
const MEDIAN = [[-.42, 0, 'barrier'], [-.2, .28, 'barrier'], [-.12, .84, 'barrier'], [.12, .84, 'barrier'], [.2, .28, 'barrier'], [.42, 0, 'asphalt']];
const VERGE = {freeway: 3, ramp: 1.5, dirt: .8, scenic: 1.2, tunnel: .8, underpass: 1.2, residential: 2.6, street: 2.8, avenue: 3, boulevard: 3.2};
/* Marking styles for the road material:
 * 0 none, 1 two-lane (dashed centre), 2 multi-lane (double yellow + dashed
 * lanes), 3 freeway (median + dashed lanes), 4 one-lane ramp, 5 no-passing two-lane. */
const STYLE = {dirt: 0, street: 1, residential: 1, tunnel: 5, scenic: 5, underpass: 1, avenue: 2, boulevard: 2, freeway: 3, ramp: 4};
export const SKIRT = 1.6;                 // how far the road's side faces drop, metres
/* City streets have a raised pavement behind a kerb; canyon roads, ramps and
 * freeways have a flush shoulder. */
export const CURB = new Set(['street', 'residential', 'avenue', 'boulevard', 'underpass']);
export const KERB = .15;                  // kerb height, metres
const PARKWAY = new Set(['street', 'residential']);
export const SEAT = .15;
export const BORE_COVER = 8;             // metres of hill over a tunnel road before it is bored, not cut                  // ground sits this far below a road surface

export const halfWidth = e => (HALF[e.kind] ?? e.width / 2);

export class RoadModel {
  constructor(net) {
    this.net = net;
    this.buildSegments();
    this.buildJunctions();
    this.flattenJunctions();
    this.classifyBores();
    this.buildRings();
    this.buildIndex();
  }

  /* ------------------------------------------------------------ segments */
  buildSegments() {
    const {nodes, edges, adj} = this.net;
    const used = new Uint8Array(edges.length);
    // A segment also breaks where a road enters a tunnel or changes level, so a
    // segment is one kind of surface all the way along. Those break nodes are
    // joined end to end with a shared tangent (below), not given a junction.
    const tunnelish = e => edges[e].kind === 'tunnel';
    const breakAt = new Uint8Array(nodes.length);
    for (let n = 0; n < nodes.length; n++) {
      if (adj[n].length !== 2) continue;
      const [e, f] = adj[n], oe = edges[e].a === n ? edges[e].b : edges[e].a, of = edges[f].a === n ? edges[f].b : edges[f].a;
      if (tunnelish(e) !== tunnelish(f) || (nodes[oe].layer === 'surface') !== (nodes[of].layer === 'surface')) breakAt[n] = 1;
    }
    const deg = n => breakAt[n] ? 99 : adj[n].length;
    const walk = (start, eid) => {
      const ids = [start], eids = [];
      let cur = start, e = eid;
      for (;;) {
        used[e] = 1; eids.push(e);
        const E = edges[e], next = E.a === cur ? E.b : E.a;
        ids.push(next);
        if (deg(next) !== 2 || next === start) break;
        const ne = adj[next][0] === e ? adj[next][1] : adj[next][0];
        if (used[ne]) break;
        cur = next; e = ne;
      }
      return {ids, eids};
    };
    const raw = [];
    for (let n = 0; n < nodes.length; n++) if (deg(n) !== 2) for (const e of adj[n]) if (!used[e]) raw.push(walk(n, e));
    for (let e = 0; e < edges.length; e++) if (!used[e]) raw.push(walk(edges[e].a, e));   // closed loops

    this.segments = raw.map(({ids, eids}, index) => {
      // Points carry the edge they came from, so kind/width survive smoothing.
      let pts = ids.map((n, i) => {
        const p = nodes[n].position, e = edges[eids[Math.min(i, eids.length - 1)]];
        return {x: p[0], y: p[1], z: p[2], e: eids[Math.min(i, eids.length - 1)], h: halfWidth(e)};
      });
      // Width at an interior node is the mean of the two edges meeting there.
      for (let i = 1; i < pts.length - 1; i++) pts[i].h = (halfWidth(edges[eids[i - 1]]) + halfWidth(edges[eids[i]])) / 2;
      pts = simplify(chaikin(chaikin(pts)));
      // Width may change along a segment (a freeway running on into its ramp):
      // the wide road narrows to the narrow one over the approach, at most
      // TAPER metres of half-width per metre (its outer lanes end). An abrupt
      // 32 -> 9 m change, often on a turn, folded the wide ribbon over itself
      // and swept its parapets diagonally across the lanes: a wall.
      for (const dir of [1, -1]) for (let i = dir > 0 ? 1 : pts.length - 2; i >= 0 && i < pts.length; i += dir) {
        const q = pts[i - dir], d = Math.hypot(pts[i].x - q.x, pts[i].z - q.z);
        pts[i].h = Math.min(pts[i].h, q.h + d * TAPER);
      }
      // Natural ground under each point: how deep a cut or how tall a fill the
      // road needs here, which sets how wide ground.js blends it back out.
      for (const p of pts) p.nat = terrainHeight(p.x, p.z);
      const seg = {id: index, a: ids[0], b: ids[ids.length - 1], eids, pts, cut: [0, 0]};
      const first = edges[eids[0]];
      seg.kind = first.kind; seg.name = first.name; seg.district = first.district;
      seg.elevated = nodes[ids[0]].layer !== 'surface' || nodes[ids[ids.length - 1]].layer !== 'surface'
        || ids.some(n => nodes[n].layer !== 'surface');
      measure(seg);
      return seg;
    });
    // Break nodes: both segment ends take the same through-tangent and width,
    // so their end cross-sections are the same four points and meet exactly.
    const joins = new Map();
    for (const seg of this.segments) for (const [node, atStart] of [[seg.a, true], [seg.b, false]]) {
      if (!breakAt[node]) continue;
      if (!joins.has(node)) joins.set(node, []);
      joins.get(node).push({seg, atStart});
    }
    for (const list of joins.values()) {
      if (list.length !== 2) continue;
      const out = ({seg, atStart}) => { const t = atStart ? seg.T[0] : seg.T[seg.T.length - 1]; return atStart ? t : [-t[0], -t[1]]; };
      const [A, B] = list, oa = out(A), ob = out(B);
      let tx = ob[0] - oa[0], tz = ob[1] - oa[1];
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;     // travel direction from A into B
      const set = ({seg, atStart}, sx, sz) => { const i = atStart ? 0 : seg.T.length - 1; seg.T[i] = atStart ? [sx, sz] : [-sx, -sz]; };
      set(A, -tx, -tz); set(B, tx, tz);
      const pa = A.atStart ? A.seg.pts[0] : A.seg.pts[A.seg.pts.length - 1], pb = B.atStart ? B.seg.pts[0] : B.seg.pts[B.seg.pts.length - 1];
      pa.h = pb.h = (pa.h + pb.h) / 2;
    }
  }

  /** Centre, tangent and half-width at plan arc length s. The ribbon and the
   *  junction polygon both call this, which is why they meet without a seam. */
  sectionAt(seg, s) {
    const {pts, S} = seg;
    s = clamp(s, 0, S[S.length - 1]);
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const a = pts[lo], b = pts[hi], span = S[hi] - S[lo], t = span > 1e-6 ? (s - S[lo]) / span : 0;
    const ta = seg.T[lo], tb = seg.T[hi];
    let tx = ta[0] + (tb[0] - ta[0]) * t, tz = ta[1] + (tb[1] - ta[1]) * t;
    const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    return {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
      tx, tz, nx: -tz, nz: tx, h: a.h + (b.h - a.h) * t, e: t < .5 ? a.e : b.e, s,
      cs: (a.cs || 0) + ((b.cs || 0) - (a.cs || 0)) * t};
  }

  /* ----------------------------------------------------------- junctions */
  buildJunctions() {
    const ends = new Map();
    for (const seg of this.segments) for (const [node, atStart] of [[seg.a, true], [seg.b, false]]) {
      if (!ends.has(node)) ends.set(node, []);
      ends.get(node).push({seg, atStart});
    }
    this.nodeEnds = ends;
    this.junctions = [];
    for (const [node, list] of ends) {
      if (list.length < 3) {
        // Two ends is a break node (tunnel mouth, change of level), already
        // joined end to end; a single end is a dead end and gets a rounded cap.
        if (list.length === 1) {
          // A dead end is a cul-de-sac: a turning circle centred on the end
          // node, the road trimmed back to where its kerbs meet the circle.
          const end = list[0], seg = end.seg, h = end.atStart ? seg.pts[0].h : seg.pts[seg.pts.length - 1].h;
          const R = CURB.has(seg.kind) ? Math.max(h + 3, 10) : h + 1.5;
          const cut = Math.min(Math.sqrt(Math.max(0, R * R - h * h)), seg.L * .45);
          seg.cut[end.atStart ? 0 : 1] = cut;
          this.junctions.push({node, cap: end, R, capCut: cut});
        }
        continue;
      }
      const P = this.net.nodes[node].position;
      for (const end of list) {
        const L = end.seg.L, probe = Math.min(6, L * .5);
        const q = this.sectionAt(end.seg, end.atStart ? probe : L - probe);
        const dx = q.x - P[0], dz = q.z - P[2], l = Math.hypot(dx, dz) || 1;
        end.dx = dx / l; end.dz = dz / l; end.angle = Math.atan2(end.dz, end.dx);
        end.h = end.atStart ? end.seg.pts[0].h : end.seg.pts[end.seg.pts.length - 1].h;
        end.cut = 1;
      }
      list.sort((a, b) => a.angle - b.angle);
      const k = list.length, corners = [];
      for (let i = 0; i < k; i++) {
        const A = list[i], B = list[(i + 1) % k];
        let gap = B.angle - A.angle; if (gap <= 0) gap += Math.PI * 2;
        // Kerb of A facing B (its counter-clockwise side) against kerb of B facing A.
        const sa = [-A.dz * A.h, A.dx * A.h], sb = [B.dz * B.h, -B.dx * B.h];
        const det = A.dx * -B.dz - A.dz * -B.dx;         // | dA  -dB |
        let corner = null;
        if (gap < Math.PI * .92 && Math.abs(det) > .08) {
          const rx = sb[0] - sa[0], rz = sb[1] - sa[1];
          const t = (rx * -B.dz - rz * -B.dx) / det, u = (A.dx * rz - A.dz * rx) / det;
          if (t > 0 && u > 0) {
            A.cut = Math.max(A.cut, t); B.cut = Math.max(B.cut, u);
            corner = [P[0] + sa[0] + A.dx * t, P[2] + sa[1] + A.dz * t];
            // The PAVEMENTS must clear each other too: at an acute corner the
            // kerb lines meet long before the outer pavement edges do, and the
            // ribbon's walk then runs across the neighbouring road.
            const wa = A.h + (VERGE[A.seg.kind] ?? 2), wb = B.h + (VERGE[B.seg.kind] ?? 2);
            const oa = [-A.dz * wa, A.dx * wa], ob = [B.dz * wb, -B.dx * wb], ox = ob[0] - oa[0], oz = ob[1] - oa[1];
            const to = (ox * -B.dz - oz * -B.dx) / det, uo = (A.dx * oz - A.dz * ox) / det;
            if (to > 0 && uo > 0) { A.cut = Math.max(A.cut, to); B.cut = Math.max(B.cut, uo); }
          }
        }
        corners.push(corner);
      }
      for (const end of list) {
        // Room for the rounded kerb, but never more than most of the segment,
        // and never so far that two junctions' cut-backs cross.
        const limit = end.seg.a === end.seg.b ? end.seg.L * .3 : end.seg.L * .45;
        end.cut = Math.min(end.cut + 2.5, 60, limit);
        end.seg.cut[end.atStart ? 0 : 1] = end.cut;
      }
      this.junctions.push({node, ends: list, corners, y: P[1], x: P[0], z: P[2]});
    }
  }

  /** Every junction is ONE tilted plane, and roads ease onto it.
   *
   *  Roads meet a junction at different grades. Blending them inside the
   *  junction sags and then crests, which throws a car. So each junction gets a
   *  plane fitted to its node and to each arm a little way outside it; inside
   *  the cut-back an arm lies exactly on the plane, and over the next EASE
   *  metres it eases back to its own profile. The road POINTS are changed, so
   *  the ground, the meshes and the colliders all see the same surface. */
  flattenJunctions() {
    const EASE = 14;
    // Junctions joined by a link too short for two planes and two eases form
    // one complex with ONE plane; otherwise the height between them is
    // squeezed into the link and it becomes a ramp.
    const byNode = new Map(), parent = new Map();
    for (const j of this.junctions) if (!j.cap) { byNode.set(j.node, j); parent.set(j, j); }
    const root = j => { while (parent.get(j) !== j) j = parent.get(j); return j; };
    for (const seg of this.segments) {
      const A = byNode.get(seg.a), B = byNode.get(seg.b);
      if (!A || !B || A === B) continue;
      if (seg.L < seg.cut[0] + seg.cut[1] + EASE * 1.5) parent.set(root(A), root(B));
    }
    const groups = new Map();
    for (const j of byNode.values()) { const r = root(j); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(j); }
    for (const members of groups.values()) {
      const inside = new Set(members.map(j => j.node)), pts = [];
      let cx = 0, cz = 0;
      for (const j of members) { pts.push([j.x, j.y, j.z], [j.x, j.y, j.z]); cx += j.x / members.length; cz += j.z / members.length; }
      for (const j of members) for (const end of j.ends) {
        // Arms leaving the complex anchor its tilt, a little way outside.
        const other = end.atStart ? end.seg.b : end.seg.a;
        if (inside.has(other) && end.seg.a !== end.seg.b) continue;
        const d = Math.min(end.seg.L, end.cut + EASE);
        const sec = this.sectionAt(end.seg, end.atStart ? d : end.seg.L - d);
        pts.push([sec.x, sec.y, sec.z]);
      }
      const plane = fitPlane(pts, cx, cz);
      for (const j of members) j.plane = plane;
    }
    // Each arm eases from the plane back to its own grade over a length that
    // suits the height it has to make up. A fixed 14 m ease turned a 4.5 m
    // mismatch at a big hillside junction into a 40% ramp at the mouth; the
    // ease now keeps its extra grade to about 6% (smoothstep peaks at 1.5x).
    for (const j of this.junctions) {
      if (j.cap) continue;
      for (const end of j.ends) {
        const seg = end.seg, at = Math.min(seg.L, end.cut + EASE);
        const sec = this.sectionAt(seg, end.atStart ? at : seg.L - at);
        const dy = Math.abs(j.plane(sec.x, sec.z) - sec.y);
        // ...but never past halfway along the open road to the next junction:
        // on a hillside grid with junctions 30 m apart, overlapping eases
        // pulled toward two different planes and left a crest between them.
        const open = seg.L - seg.cut[0] - seg.cut[1];
        end.ease = Math.min(90, EASE + dy / .06, Math.max(EASE, open * .85));
      }
    }
    // Resample each arm densely where it eases, then set its heights.
    for (const j of this.junctions) {
      if (j.cap) continue;
      for (const end of j.ends) {
        const seg = end.seg, span = Math.min(seg.L, end.cut + end.ease);
        densify(seg, end.atStart ? 0 : seg.L - span, end.atStart ? span : seg.L, 3);
      }
    }
    // Collect every junction's pull on every point first, then apply: on a
    // short segment between two junctions, one junction's ease must not
    // overwrite the other's flat area. Inside a cut-back that junction's plane
    // wins outright; where two eases overlap they share.
    const pulls = new Map();                                   // point -> [{a, y, cs}]
    for (const j of this.junctions) {
      if (j.cap) continue;
      for (const end of j.ends) {
        const seg = end.seg;
        seg.pts.forEach((p, i) => {
          const d = end.atStart ? seg.S[i] : seg.L - seg.S[i];
          if (d > end.cut + end.ease) return;
          let w = Math.min(1, Math.max(0, (d - end.cut) / end.ease));
          w = w * w * (3 - 2 * w);
          // Cross-slope: the plane tilts sideways as well as along, and a
          // 35 m boulevard that stayed level across would miss it by a metre
          // at the kerbs. The road banks to the plane and eases back to level.
          const t = seg.T[i], bank = j.plane.a * -t[1] + j.plane.b * t[0];
          if (!pulls.has(p)) pulls.set(p, []);
          pulls.get(p).push({a: 1 - w, y: j.plane(p.x, p.z), cs: bank});
        });
      }
    }
    for (const [p, list] of pulls) {
      const inside = list.find(q => q.a >= .999);
      if (inside) { p.y = inside.y; p.cs = inside.cs; continue; }
      const sum = list.reduce((s, q) => s + q.a, 0), keep = Math.max(0, 1 - sum), norm = Math.max(1, sum);
      p.y = p.y * keep + list.reduce((s, q) => s + q.a * q.y, 0) / norm;
      p.cs = (p.cs || 0) * keep + list.reduce((s, q) => s + q.a * q.cs, 0) / norm;
    }
  }

  /** A tunnel road is only BORED where there is real hill over it. The
   *  grading moves roads, so a road drawn as a tunnel may now run in a shallow
   *  cutting or even stand clear of the ground: those stretches are ordinary
   *  open road (the ground cuts to them, bridges get parapets), and the tube,
   *  portals and tunnel acoustics belong to the bored stretches only.
   *  pts[i].bore: 1 bored, 0 open; runs shorter than 15 m take their
   *  neighbours' state so a bump in the hill does not make a 5 m tunnel. */
  classifyBores() {
    // Other roads' centre points, hashed: a bore needs the hill on BOTH sides
    // of it. A road running alongside grades the ground down to itself, and
    // a tube there stood in the open with the hillside missing round it.
    const near = new Map(), C = 32;
    for (const o of this.segments) {
      if (o.kind === 'tunnel') continue;
      for (const q of o.pts) { const k = Math.floor(q.x / C) * 65536 + Math.floor(q.z / C); (near.get(k) || near.set(k, []).get(k)).push(q); }
    }
    const crowded = (p, reach) => {
      for (let gx = Math.floor((p.x - reach) / C); gx <= Math.floor((p.x + reach) / C); gx++)
        for (let gz = Math.floor((p.z - reach) / C); gz <= Math.floor((p.z + reach) / C); gz++)
          for (const q of near.get(gx * 65536 + gz) || EMPTY)
            if (Math.hypot(q.x - p.x, q.z - p.z) < reach + q.h && Math.abs(q.y - p.y) < 14) return true;
      return false;
    };
    for (const seg of this.segments) {
      if (seg.kind !== 'tunnel') continue;
      const P = seg.pts, n = P.length;
      for (const p of P) p.bore = terrainHeight(p.x, p.z) - p.y > BORE_COVER && !crowded(p, p.h + 14) ? 1 : 0;
      // Never bored into a junction: the last 15 m before one are a cutting,
      // so the portal stands clear of the junction's asphalt and kerbs.
      const jn = new Set(this.junctions.filter(j => !j.cap).map(j => j.node));
      P.forEach((p, i) => { if ((jn.has(seg.a) && seg.S[i] < seg.cut[0] + 15) || (jn.has(seg.b) && seg.S[i] > seg.L - seg.cut[1] - 15)) p.bore = 0; });
      for (let pass = 0; pass < 2; pass++) {
        let i = 0;
        while (i < n) {
          let j = i; while (j + 1 < n && P[j + 1].bore === P[i].bore) j++;
          const len = seg.S[j] - seg.S[i], edge = i === 0 || j === n - 1;
          if (len < 15 && !edge) for (let k = i; k <= j; k++) P[k].bore = 1 - P[k].bore;
          i = j + 1;
        }
      }
      // Bored runs as exact arc-length ranges: the tube, the terrain and the
      // tunnel test all use these (points can be 40 m apart, so "nearest
      // point is bored" put the portal up to 20 m out of place).
      seg.bores = []; let start = null;
      P.forEach((p, i) => {
        if (p.bore && start === null) start = seg.S[i];
        if (!p.bore && start !== null) { seg.bores.push([start, seg.S[i]]); start = null; }
      });
      if (start !== null) seg.bores.push([start, seg.L]);
      // A 30 m tunnel is two portals and a gap: open it up as a cutting.
      const keep = seg.bores.filter(([a, b]) => b - a >= 40 || (a < .5 || b > seg.L - .5) && b - a >= 20);
      if (keep.length !== seg.bores.length) {
        P.forEach((p, i) => { p.bore = keep.some(([a, b]) => seg.S[i] >= a && seg.S[i] <= b) ? 1 : 0; });
        seg.bores = keep;
      }
    }
  }
  /** Is a tunnel segment bored at arc length s? */
  boredAt(seg, s) {
    if (seg.kind !== 'tunnel' || !seg.bores) return false;
    for (const [a, b] of seg.bores) if (s >= a && s <= b) return true;
    return false;
  }

  /** Each junction's kerb outline (j.ring) and its corners (j.kerbs): the rounded
   *  kerb between two neighbouring arms, with the outward direction at each point.
   *  Computed once, used by the mesh (junctionPiece) AND the ground (ground.js). */
  buildRings() {
    for (const j of this.junctions) {
      if (j.cap) { this.capRing(j); continue; }
      const {ends, corners} = j, k = ends.length;
      const cuts = ends.map(end => {
        const sec = this.sectionAt(end.seg, end.atStart ? end.cut : end.seg.L - end.cut);
        // The end's counter-clockwise kerb is the ribbon's +normal side when the
        // segment leaves the junction, and its -normal side when it arrives.
        const sign = end.atStart ? 1 : -1, ox = sec.nx * sign, oz = sec.nz * sign;
        return {sec, out: [ox, oz],
          plus: [sec.x + ox * sec.h, sec.y + sec.cs * sec.h * sign, sec.z + oz * sec.h],
          minus: [sec.x - ox * sec.h, sec.y - sec.cs * sec.h * sign, sec.z - oz * sec.h]};
      });
      j.cuts = cuts;
      j.ring = []; j.kerbs = [];
      for (let i = 0; i < k; i++) {
        const A = cuts[i], B = cuts[(i + 1) % k], c = corners[i];
        j.ring.push(A.minus, A.plus);
        // Rounded kerb: a quadratic curve through the kerb-line intersection.
        const n = c ? 8 : 1, kerb = [A.plus];
        for (let s = 1; s < n; s++) {
          const t = s / n, u = 1 - t;
          const x = c ? u * u * A.plus[0] + 2 * u * t * c[0] + t * t * B.minus[0] : A.plus[0] + (B.minus[0] - A.plus[0]) * t;
          const z = c ? u * u * A.plus[2] + 2 * u * t * c[1] + t * t * B.minus[2] : A.plus[2] + (B.minus[2] - A.plus[2]) * t;
          // On the junction's plane, like everything inside it.
          const p = [x, j.plane(x, z), z];
          j.ring.push(p); kerb.push(p);
        }
        kerb.push(B.minus);
        // Outward direction along the kerb: the arm's own lateral at each end
        // (so corner pavements meet the street pavements exactly), the curve's
        // normal in between.
        const outs = kerb.map((p, q) => {
          if (q === 0) return A.out;
          if (q === kerb.length - 1) return [-B.out[0], -B.out[1]];
          const a = kerb[q - 1], b = kerb[q + 1];
          let nx = b[2] - a[2], nz = -(b[0] - a[0]);
          const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
          if (nx * (p[0] - j.x) + nz * (p[2] - j.z) < 0) { nx = -nx; nz = -nz; }
          return [nx, nz];
        });
        const kindA = ends[i].seg.kind, kindB = ends[(i + 1) % k].seg.kind;
        j.kerbs.push({pts: kerb, outs, curb: CURB.has(kindA) && CURB.has(kindB),
          width: [VERGE[kindA] ?? 2, VERGE[kindB] ?? 2], curbA: CURB.has(kindA), curbB: CURB.has(kindB)});
      }
      let r = 0;
      for (const p of j.ring) r = Math.max(r, Math.hypot(p[0] - j.x, p[2] - j.z));
      j.radius = r;
    }
  }

  /** A cul-de-sac's outline: the circle round the end node from the road's
   *  +kerb to its -kerb the long way, as a junction ring with one kerb, so the
   *  ground seats to it and props keep off it exactly as at a junction. */
  capRing(j) {
    const {seg, atStart} = j.cap, L = seg.L;
    const at = atStart ? j.capCut : L - j.capCut, sec = this.sectionAt(seg, at), end = this.sectionAt(seg, atStart ? 0 : L);
    const sign = atStart ? 1 : -1;
    // Outward kerbs of the ribbon's end, in the ring's order (see buildRings).
    const plus = [sec.x + sec.nx * sign * sec.h, sec.y + sec.cs * sec.h * sign, sec.z + sec.nz * sign * sec.h];
    const minus = [sec.x - sec.nx * sign * sec.h, sec.y - sec.cs * sec.h * sign, sec.z - sec.nz * sign * sec.h];
    const cx = end.x, cz = end.z, y = end.y, R = j.R;
    const a0 = Math.atan2(plus[2] - cz, plus[0] - cx), a1 = Math.atan2(minus[2] - cz, minus[0] - cx);
    // Sweep from +kerb to -kerb through the side AWAY from the road.
    const away = Math.atan2(-(sec.z - cz), -(sec.x - cx));
    let sweep = a1 - a0; while (sweep <= 0) sweep += Math.PI * 2;
    const mid = a0 + sweep / 2, d = Math.abs(Math.atan2(Math.sin(mid - away), Math.cos(mid - away)));
    if (d > Math.PI / 2) sweep -= Math.PI * 2;
    const n = 20, arc = [plus];
    for (let k = 1; k < n; k++) { const a = a0 + sweep * k / n; arc.push([cx + Math.cos(a) * R, y, cz + Math.sin(a) * R]); }
    arc.push(minus);
    j.x = cx; j.z = cz; j.y = y; j.plane = Object.assign(() => y, {a: 0, b: 0});
    j.ring = [minus, ...arc];
    const outs = arc.map(p => { const dx = p[0] - cx, dz = p[2] - cz, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; });
    // Ends take the ribbon's own lateral so pavements meet exactly.
    outs[0] = [sec.nx * sign, sec.nz * sign]; outs[outs.length - 1] = [-sec.nx * sign, -sec.nz * sign];
    const w = VERGE[seg.kind] ?? 2;
    j.kerbs = [{pts: arc, outs, curb: CURB.has(seg.kind), width: [w, w], curbA: CURB.has(seg.kind), curbB: CURB.has(seg.kind)}];
    j.radius = R;
    j.ends = [];
  }

  /** Junctions whose kerb outline (plus pavements) may cover (x, z). */
  /** Where a freeway's median must be open: every node where a ramp or
   *  street meets a freeway, and every freeway end. */
  medianBreaks() {
    if (this._medianBreaks) return this._medianBreaks;
    // From the graph's own edges: a model segment can run on from a freeway
    // into its ramp (a two-ended node is not a junction), so segment kinds miss these.
    const kinds = new Map();
    for (const e of this.net.edges) for (const n of [e.a, e.b]) { let k = kinds.get(n); if (!k) kinds.set(n, k = []); k.push(e.kind); }
    const out = [];
    for (const [node, k] of kinds) if (k.includes('freeway') && (k.length < 2 || k.some(x => x !== 'freeway'))) out.push(this.net.nodes[node].position);
    return this._medianBreaks = out;
  }
  /** Is (x, z) on another road's carriageway, or inside a junction, near height y? */
  covered(seg, x, z, y) {
    const list = this.near(x, z);
    for (let k = 0; k < list.length; k += 2) {
      const other = this.segments[list[k]];
      if (other === seg) continue;
      const r = projectPiece(other, list[k + 1], x, z);
      if (r.d < r.h + .6 && Math.abs(r.y - y) < 3) return true;
    }
    for (const j of this.junctionsNear(x, z)) if (!j.cap && this.junctionZone(j, x, z) === 'in' && Math.abs(j.plane(x, z) - y) < 3) return true;
    return false;
  }
  junctionsNear(x, z) { return this.jgrid.get(Math.floor(x / 64) * 65536 + Math.floor(z / 64)) || EMPTY; }

  /** Where (x, z) sits relative to junction j: 'in' (on its asphalt), 'kerb'
   *  (on a corner pavement, with the plane height there), or null. */
  junctionZone(j, x, z) {
    const R = j.ring;
    // Star-shaped from the centre: inside if the ray from the centre crosses the
    // ring beyond the point. Winding test is simpler and exact.
    let inside = false;
    for (let i = 0, q = R.length - 1; i < R.length; q = i++) {
      const a = R[i], b = R[q];
      if ((a[2] > z) !== (b[2] > z) && x < (b[0] - a[0]) * (z - a[2]) / (b[2] - a[2]) + a[0]) inside = !inside;
    }
    if (inside) return 'in';
    for (const k of j.kerbs) {
      if (!k.curb) continue;
      const P = k.pts;
      for (let i = 0; i < P.length - 1; i++) {
        const a = P[i], b = P[i + 1], dx = b[0] - a[0], dz = b[2] - a[2], l2 = dx * dx + dz * dz;
        const t = l2 > 1e-9 ? ((x - a[0]) * dx + (z - a[2]) * dz) / l2 : 0;
        if (t < 0 || t > 1) continue;
        const qx = a[0] + dx * t, qz = a[2] + dz * t, o = k.outs[i];
        const side = (x - qx) * o[0] + (z - qz) * o[1];
        if (side > 0 && side < Math.max(k.width[0], k.width[1]) + 1.6) return 'kerb';
      }
    }
    return null;
  }

  /* --------------------------------------------------------------- index */
  /** Spatial hash of every centreline piece, used by ground.js and queries. */
  buildIndex() {
    this.jgrid = new Map();
    for (const j of this.junctions) {
      if (!j.ring) continue;
      const r = j.radius + 8;
      for (let gx = Math.floor((j.x - r) / 64); gx <= Math.floor((j.x + r) / 64); gx++)
        for (let gz = Math.floor((j.z - r) / 64); gz <= Math.floor((j.z + r) / 64); gz++) {
          const key = gx * 65536 + gz; let l = this.jgrid.get(key); if (!l) this.jgrid.set(key, l = []); l.push(j);
        }
    }
    const C = 64, grid = new Map(), kinds = this.net.edges;
    this.cell = C; this.grid = grid;
    for (const seg of this.segments) {
      const {pts} = seg;
      for (let i = 0; i < pts.length - 1; i++) {
        // This piece's own reach: flat zone + coarse-LOD extra + its blend.
        const a = pts[i], b = pts[i + 1], kind = seg.kind;
        const pad = Math.max(a.h, b.h) + (VERGE[kind] ?? 2) + .6 + EXTRA_MAX + 1
          + blendWidth(kind, Math.max(Math.abs(a.nat - a.y), Math.abs(b.nat - b.y)));
        const x0 = Math.floor((Math.min(a.x, b.x) - pad) / C), x1 = Math.floor((Math.max(a.x, b.x) + pad) / C);
        const z0 = Math.floor((Math.min(a.z, b.z) - pad) / C), z1 = Math.floor((Math.max(a.z, b.z) + pad) / C);
        for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
          const key = gx * 65536 + gz;
          let list = grid.get(key); if (!list) grid.set(key, list = []);
          list.push(seg.id, i);
        }
      }
    }
  }
  /** Flat [segId, pieceIndex, ...] list of centreline pieces whose padded box covers (x, z). */
  near(x, z) { return this.grid.get(Math.floor(x / this.cell) * 65536 + Math.floor(z / this.cell)) || EMPTY; }

  /** Nearest road surface to (x, z): which segment, how far, and its deck height. */
  /** Is piece i of a segment inside the hill (a bored tunnel stretch)? */
  buried(seg, i) { return seg.kind === 'tunnel' && !!seg.pts[i].bore && !!seg.pts[i + 1]?.bore; }

  /** Nearest piece; `open` skips bored tunnel stretches (scenery on the hill above). */
  nearest(x, z, y = null, open = false) {
    const list = this.near(x, z);
    let best = null, score = Infinity;
    for (let k = 0; k < list.length; k += 2) {
      const seg = this.segments[list[k]], i = list[k + 1];
      if (open && this.buried(seg, i)) continue;
      const r = projectPiece(seg, i, x, z);
      const value = r.d + (y === null ? 0 : Math.max(0, Math.abs(r.y - y) - 2) * 4);
      if (value < score) { score = value; best = {seg, ...r}; }
    }
    return best;
  }

  /* ------------------------------------------------------------ geometry */
  /** All drivable geometry, split into pieces of at most ~120 m and grouped by
   *  the TILE their midpoint falls in. Each piece: {tile, parts:{material: {pos, uv, info, index}}}.
   *  Pass the Ground so ribbons can tell where they are bridges. */
  buildPieces(ground = null) {
    const pieces = [];
    for (const seg of this.segments) this.ribbonPieces(seg, pieces, ground);
    for (const j of this.junctions) pieces.push(j.cap ? this.capPiece(j) : this.junctionPiece(j));
    return pieces;
  }

  ribbonPieces(seg, out, ground) {
    const s0 = seg.cut[0], s1 = seg.L - seg.cut[1];
    if (s1 - s0 < .25) return;
    // Stations: every smoothed point inside the trimmed range, the two cut
    // points exactly, and nothing more than 8 m apart.
    const st = [s0];
    for (const s of seg.S) if (s > s0 + .05 && s < s1 - .05) st.push(s);
    st.push(s1);
    const dense = [st[0]];
    for (let i = 1; i < st.length; i++) {
      const n = Math.ceil((st[i] - st[i - 1]) / 8);
      for (let k = 1; k <= n; k++) dense.push(st[i - 1] + (st[i] - st[i - 1]) * k / n);
    }
    // Where the road stands clear of the ground it is a bridge: barriers,
    // deck edges and piers. Decided by the actual clearance, so a street that
    // the grading lifted over a cutting gets a parapet without anyone tagging it.
    // Sampled every ~8 m (a ground query is not cheap) and held in between.
    let lastS = -Infinity, lastClear = 0;
    const clear = dense.map((s, i) => {
      if (!ground || this.boredAt(seg, s)) return 0;
      if (s - lastS < 8 && i !== dense.length - 1) return lastClear;
      const sec = this.sectionAt(seg, s);
      lastS = s; lastClear = sec.y - ground.height(sec.x, sec.z);
      return lastClear;
    });
    const bridge = clear.map((_, i) => seg.elevated || clear.slice(Math.max(0, i - 2), i + 3).some(c => c > 1.2));
    let start = 0;
    while (start < dense.length - 1) {
      let end = start + 1;
      while (end < dense.length - 1 && dense[end] - dense[start] < 120 && bridge[end] === bridge[start]) end++;
      const piece = this.extrude(seg, dense.slice(start, end + 1), bridge[start]);
      if (bridge[start]) {
        piece.piers = [];
        for (let i = start; i <= end; i++) {
          if (clear[i] < 3 || (i > start && dense[i] - piece.lastPier < 24)) continue;
          const sec = this.sectionAt(seg, dense[i]);
          piece.piers.push({x: sec.x, y: sec.y, z: sec.z, drop: clear[i], h: sec.h, tx: sec.tx, tz: sec.tz});
          piece.lastPier = dense[i];
        }
      }
      out.push(piece);
      start = end;
    }
  }

  /** Cross-section profile for a road kind: [offset, height, material] points,
   *  left to right; consecutive points form one strip. */
  profile(kind, h, elevated) {
    const w = h + (VERGE[kind] ?? 2);
    // Freeways carry a concrete median barrier (a Jersey profile) on the
    // centre line; the carriageways meet only inside junctions.
    const mid = kind === 'freeway' ? MEDIAN.map(q => [...q]) : [[0, 0, 'asphalt']];
    if (elevated) {
      const b = w - .35;
      return [[-w, -SKIRT, 'concrete'], [-w, .95, 'barrier'], [-b, .95, 'barrier'], [-b, 0, 'verge'], [-h, 0, 'asphalt'],
        ...mid, [h, 0, 'verge'], [b, 0, 'barrier'], [b, .95, 'barrier'], [w, .95, 'concrete'], [w, -SKIRT, 'concrete'], [-w, -SKIRT, null]];
    }
    if (PARKWAY.has(kind)) {                 // LA residential: kerb, grass parkway, then the walk
      const pk = h + (VERGE[kind] ?? 2) * .45;
      return [[-w, -SKIRT, 'skirt'], [-w, KERB, 'sidewalk'], [-pk, KERB, 'parkway'], [-h, KERB, 'curb'], [-h, 0, 'asphalt'],
        [0, 0, 'asphalt'], [h, 0, 'curb'], [h, KERB, 'parkway'], [pk, KERB, 'sidewalk'], [w, KERB, 'skirt'], [w, -SKIRT, null]];
    }
    if (CURB.has(kind))                      // skirt | pavement | kerb face | carriageway | kerb face | pavement | skirt
      return [[-w, -SKIRT, 'skirt'], [-w, KERB, 'sidewalk'], [-h, KERB, 'curb'], [-h, 0, 'asphalt'], [0, 0, 'asphalt'], [h, 0, 'curb'],
        [h, KERB, 'sidewalk'], [w, KERB, 'skirt'], [w, -SKIRT, null]];
    const verge = kind === 'dirt' || kind === 'scenic' ? 'gravel' : 'verge';
    return [[-w, -SKIRT, 'skirt'], [-w, -.04, verge], [-h, 0, 'asphalt'], ...mid, [h, 0, verge], [w, -.04, 'skirt'], [w, -SKIRT, null]];
  }

  extrude(seg, stations, bridge = seg.elevated) {
    const parts = {}, sections = stations.map(s => this.sectionAt(seg, s));
    const mid = sections[sections.length >> 1];
    const kindAt = sec => this.net.edges[sec.e].kind;
    // Cross-section from the segment's kind (as ground.js reads it); markings
    // below still follow each edge's own kind.
    const profiles = sections.map(sec => this.profile(seg.kind, sec.h, bridge));
    // Barriers (bridge parapets, the freeway median) stop wherever they would
    // stand on another road's deck: where a ramp peels off a viaduct the two
    // decks overlap for tens of metres, and each one's parapet used to run
    // straight across the other (a wall only the kinematic NPCs could pass).
    if (bridge || seg.kind === "freeway") {
      const open = profiles.map((prof, i) => {
        const sec = sections[i], o = {};
        for (const q of prof) {
          const key = Math.sign(q[0]) + (Math.abs(q[0]) < 1 ? 'm' : '');
          // Test the wall's footprint and a metre either side of it.
          if (q[1] > .2 && !o[key] && GATES.some(g => Math.hypot(sec.x + sec.nx * q[0] - g.x, sec.z + sec.nz * q[0] - g.z) < g.r)) o[key] = true;
          if (q[1] > .2 && !o[key]) for (const d of [0, -1, 1]) if (this.covered(seg, sec.x + sec.nx * (q[0] + d), sec.z + sec.nz * (q[0] + d), sec.y + sec.cs * q[0])) { o[key] = true; break; }
        }
        return o;
      });
      // The median also stops well short of any end where a ramp or street
      // joins (or the freeway just ends): traffic in either carriageway may
      // have to cross the centre line to reach it.
      if (seg.kind === 'freeway') {
        const pts = this.medianBreaks();
        sections.forEach((sec, i) => { if (this.net.edges[sec.e].kind !== 'freeway' || sec.h < 12 || pts.some(p => Math.abs(p[0] - sec.x) < MEDIAN_CLEAR && Math.abs(p[2] - sec.z) < MEDIAN_CLEAR && Math.hypot(p[0] - sec.x, p[2] - sec.z) < MEDIAN_CLEAR && Math.abs(p[1] - sec.y) < 10)) open[i]['1m'] = open[i]['-1m'] = true; });
      }
      // Widen each opening by two stations so no stub of wall is left at its ends.
      profiles.forEach((prof, i) => {
        const isOpen = key => open.slice(Math.max(0, i - 2), i + 3).some(o => o[key]);
        for (const q of prof) if (q[1] > .2 && isOpen(Math.sign(q[0]) + (Math.abs(q[0]) < 1 ? 'm' : ''))) q[1] = 0;
      });
    }
    // A piece keeps one profile shape; kinds that change shape mid-piece are rare
    // and use the first station's topology with each station's own widths.
    const shape = profiles[0].length;
    for (let p = 0; p < shape - 1; p++) {
      const mat = profiles[0][p][2];
      if (!mat) continue;
      const part = parts[mat] || (parts[mat] = newPart());
      const base = part.pos.length / 3;
      for (let i = 0; i < sections.length; i++) {
        const sec = sections[i], prof = profiles[i].length === shape ? profiles[i] : profiles[0];
        const kind = kindAt(sec), edge = this.net.edges[sec.e];
        for (const q of [prof[p], prof[p + 1]]) {
          part.pos.push(sec.x + sec.nx * q[0], sec.y + sec.cs * q[0] + q[1], sec.z + sec.nz * q[0]);
          part.uv.push(q[0], sec.s);
          // Kerb faces read info.x as "painted red"; street ribbons are plain.
          part.info.push(mat === 'curb' ? 0 : edge.lanes || 2, STYLE[kind] ?? 1, sec.h);
        }
      }
      for (let i = 0; i < sections.length - 1; i++) {
        const a = base + i * 2, b = a + 2;
        pushQuad(part, a, a + 1, b + 1, b, mat === 'asphalt' || mat === 'verge' || mat === 'gravel' || mat === 'sidewalk' || mat === 'parkway');
      }
    }
    return {tile: tileKey(mid.x, mid.z), seg: seg.id, x: mid.x, z: mid.z, bridge, parts};
  }

  junctionPiece(j) {
    const ring = j.ring, plane = j.plane;
    // Fan from the centre with two inner rings, all on the junction's plane
    // (see flattenJunctions). The outer ring comes from the ribbons, which lie
    // on the same plane at their cut-backs, so the seam is exact.
    const part = newPart(), R = ring.length, rings = [1 / 3, 2 / 3];
    const vert = (x, y, z) => { part.pos.push(x, y, z); part.uv.push(x - j.x, z - j.z); part.info.push(0, -1, 0); };
    vert(j.x, plane(j.x, j.z), j.z);
    for (const f of rings) for (const p of ring) {
      const x = j.x + (p[0] - j.x) * f, z = j.z + (p[2] - j.z) * f;
      vert(x, plane(x, z), z);
    }
    for (const p of ring) vert(p[0], p[1], p[2]);
    const at = (r, i) => 1 + r * R + (i % R);             // r = 0, 1 inner rings, 2 outer
    for (let i = 0; i < R; i++) {
      pushTri(part, 0, at(0, i), at(0, i + 1), true);
      for (let r = 0; r < 2; r++) pushQuad(part, at(r, i), at(r + 1, i), at(r + 1, i + 1), at(r, i + 1), true);
    }
    const parts = {junction: part};
    // Corners. Between two city streets: kerb face, pavement and outer skirt
    // along the rounded kerb, starting and ending on exactly the cross-sections
    // the two streets' pavements end on, so pavements run unbroken round every
    // corner. Anywhere else: just the apron, so nothing is see-through.
    const curb = newPart(), walk = newPart(), skirt = newPart();
    for (const k of j.kerbs) {
      const n = k.pts.length;
      // Kerbs near corners are often painted red (no parking) in LA.
      const red = hash(j.node * 7 + j.kerbs.indexOf(k)) < .4 ? 1 : 0;
      const along = [0];
      for (let q = 1; q < n; q++) along.push(along[q - 1] + Math.hypot(k.pts[q][0] - k.pts[q - 1][0], k.pts[q][2] - k.pts[q - 1][2]));
      const strip = (target, inner, outer, up) => {
        const base = target.pos.length / 3;
        for (let q = 0; q < n; q++) {
          const a = inner(q), b = outer(q), wd = Math.hypot(b[0] - a[0], b[2] - a[2]) || Math.abs(b[1] - a[1]);
          target.pos.push(...a, ...b); target.uv.push(0, along[q], wd, along[q]); target.info.push(red, -1, 0, red, -1, 0);
        }
        for (let q = 0; q < n - 1; q++) { const a = base + q * 2; pushQuad(target, a, a + 1, a + 3, a + 2, up); }
      };
      const P = q => k.pts[q];
      if (k.curb) {
        const w = q => k.width[0] + (k.width[1] - k.width[0]) * q / (n - 1);
        const out = q => { const p = P(q), o = k.outs[q], x = p[0] + o[0] * w(q), z = p[2] + o[1] * w(q); return [x, plane(x, z) + KERB, z]; };
        const top = q => [P(q)[0], P(q)[1] + KERB, P(q)[2]];
        strip(curb, q => P(q), top, false);
        strip(walk, top, out, true);
        strip(skirt, out, q => { const o = out(q); return [o[0], o[1] - KERB - SKIRT, o[2]]; }, false);
      } else {
        strip(skirt, q => P(q), q => [P(q)[0], P(q)[1] - SKIRT, P(q)[2]], false);
      }
    }
    if (curb.index.length) { parts.curb = curb; parts.sidewalk = walk; }
    if (skirt.index.length) parts.skirt = skirt;
    // Crosswalks: continental bars across each city arm, just inside the kerb line.
    if (j.ends.length >= 3) {
      const cw = newPart();
      j.ends.forEach((end, i) => {
        if (!CURB.has(end.seg.kind) || end.cut < 6) return;
        const c = j.cuts[i], sec = c.sec, h = sec.h;
        const back = [j.x - sec.x, j.z - sec.z], bl = Math.hypot(...back) || 1, bx = back[0] / bl, bz = back[1] / bl;
        const base = cw.pos.length / 3;
        for (const d of [.8, 4.2]) for (const side of [-1, 1]) {
          const x = sec.x + bx * d + c.out[0] * h * side * .96, z = sec.z + bz * d + c.out[1] * h * side * .96;
          cw.pos.push(x, plane(x, z) + .012, z); cw.uv.push(side * h * .96, d); cw.info.push(0, 7, h);
        }
        pushQuad(cw, base, base + 1, base + 3, base + 2, true);
      });
      if (cw.index.length) parts.crosswalk = cw;
    }
    return {tile: tileKey(j.x, j.z), junction: j.node, x: j.x, z: j.z, parts};
  }

  capPiece(j) {
    // Same builder as a junction: a fan over the ring, kerb, pavement and
    // skirt round the circle (junctionPiece skips crosswalks: no arms).
    return this.junctionPiece(j);
  }
}

const EMPTY = [];
const hash = n => { n = (n ^ 61) ^ (n >>> 16); n = Math.imul(n, 9); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return (n >>> 0) / 4294967296; };
export const tileKey = (x, z) => `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
const newPart = () => ({pos: [], uv: [], info: [], index: []});
/* How far ground.js reaches from a centreline. They live here because the
 * spatial index pads each piece by its OWN reach: most roads sit near natural
 * ground and reach ~50 m; only deep cuts and tall fills reach far. A single
 * worst-case pad made every ground query scan hundreds of pieces. */
export const BLEND = {freeway: 28, ramp: 26, scenic: 20, dirt: 18};
export const SPREAD = 2.6, BLEND_MAX = 115, EXTRA_MAX = 24;
// A tunnel road's open approaches are portal CUTTINGS: steep sides, so the
// hill is still standing when the road reaches the headwall. With the normal
// spread a 25 m cut was shaved into a 65 m-wide bowl and the portal stood free.
/* Driveway gates (2026-09-27 pass 11): a bridge parapet opens where a
 * player home's drive meets the road (homes.js HOMES: road + f * (setback + 1)).
 * Kept here, not imported, so the terrain worker needs nothing but this file. */
export const GATES = [{x: -585.5, z: -3314.2, r: 5.5}];
export const blendWidth = (kind, depth) => kind === 'tunnel' ? Math.max(12, Math.abs(depth) * 1.1)
  : Math.min(BLEND_MAX, Math.max(BLEND[kind] ?? 32, Math.abs(depth) * SPREAD));

/** Emits a quad; when `up` is set the winding is chosen so the face points up. */
function pushQuad(part, a, b, c, d, up) {
  pushTri(part, a, b, c, up); pushTri(part, a, c, d, up);
}
function pushTri(part, a, b, c, up) {
  if (up) {
    const P = part.pos;
    const ux = P[b * 3] - P[a * 3], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vz = P[c * 3 + 2] - P[a * 3 + 2];
    // Normal.y of (b-a) x (c-a) is uz*vx - ux*vz; positive faces the sky.
    if (uz * vx - ux * vz < 0) { const t = b; b = c; c = t; }
  }
  part.index.push(a, b, c);
}

const MAX_TILT = .15;             // matches the scenic grade cap in clean_roads, so hill junctions can carry the climb
/** Least-squares plane y = c + a(x - x0) + b(z - z0) through points [x, y, z]. */
function fitPlane(points, x0, z0) {
  let sxx = 0, sxz = 0, szz = 0, sx = 0, sz = 0, n = 0, sy = 0, sxy = 0, szy = 0;
  for (const [x, y, z] of points) {
    const dx = x - x0, dz = z - z0;
    sxx += dx * dx; sxz += dx * dz; szz += dz * dz; sx += dx; sz += dz; n++; sy += y; sxy += dx * y; szy += dz * y;
  }
  // Normal equations for [c, a, b], solved by Cramer's rule. The ridge term
  // means a tilt must be earned by the points' spread: nearly collinear
  // points (a through road with a stub) would otherwise fit any sideways tilt.
  const ridge = n * 25;
  const M = [[n, sx, sz], [sx, sxx + ridge, sxz], [sz, sxz, szz + ridge]], r = [sy, sxy, szy];
  const det3 = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det3(M);
  if (Math.abs(D) < 1e-9) { const c = sy / n; return Object.assign(() => c, {a: 0, b: 0}); }
  const col = k => M.map((row, i) => row.map((v, j) => j === k ? r[i] : v));
  let c = det3(col(0)) / D, a = det3(col(1)) / D, b = det3(col(2)) / D;
  // A junction steeper than MAX_TILT is a ramp; hold it to that, about the
  // points' own centre so the fit stays balanced.
  const g = Math.hypot(a, b);
  if (g > MAX_TILT) {
    const k = MAX_TILT / g, mx = sx / n, mz = sz / n;
    c += (a * mx + b * mz) * (1 - k); a *= k; b *= k;
  }
  return Object.assign((x, z) => c + a * (x - x0) + b * (z - z0), {a, b});
}

/** Corner-cutting subdivision with both ends pinned: kinks become curves. */
function chaikin(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]], L = (a, b, t) => ({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, h: a.h + (b.h - a.h) * t, e: a.e});
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (i > 0) out.push(L(a, b, .25));
    if (i < pts.length - 2) out.push(L(a, b, .75));
  }
  out.push(pts[pts.length - 1]);
  return out;
}
/** Drops points that are straight and evenly graded, so city grids stay light. */
function simplify(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z, bcx = c.x - b.x, bcz = c.z - b.z;
    const lab = Math.hypot(abx, abz), lbc = Math.hypot(bcx, bcz), lac = Math.hypot(c.x - a.x, c.z - a.z);
    const turn = lab && lbc ? Math.abs(Math.atan2(abx * bcz - abz * bcx, abx * bcx + abz * bcz)) : 0;
    const yLine = a.y + (c.y - a.y) * (lab / (lab + lbc || 1));
    const keep = turn > .006 || Math.abs(yLine - b.y) > .04 || Math.abs(b.h - a.h) > .01 || b.e !== a.e && Math.abs(b.h - c.h) > .01 || lac > 40;
    if (keep) out.push(b);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
/** Inserts points so no two are more than `step` apart between s0 and s1. */
function densify(seg, s0, s1, step) {
  const out = [seg.pts[0]];
  for (let i = 1; i < seg.pts.length; i++) {
    const a = seg.pts[i - 1], b = seg.pts[i], sa = seg.S[i - 1], sb = seg.S[i];
    const lo = Math.max(sa, s0), hi = Math.min(sb, s1);
    if (hi > lo && sb - sa > step) {
      const n = Math.ceil((sb - sa) / step);
      for (let k = 1; k < n; k++) {
        const t = k / n, s = sa + (sb - sa) * t;
        if (s < s0 - step || s > s1 + step) continue;
        out.push({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t,
          h: a.h + (b.h - a.h) * t, e: t < .5 ? a.e : b.e, nat: a.nat + (b.nat - a.nat) * t,
          cs: (a.cs || 0) + ((b.cs || 0) - (a.cs || 0)) * t});
      }
    }
    out.push(b);
  }
  if (out.length === seg.pts.length) return;
  // Keep the end tangents exactly (break-node joins set them by hand).
  const t0 = seg.T[0], t1 = seg.T[seg.T.length - 1];
  seg.pts = out;
  measure(seg);
  seg.T[0] = t0; seg.T[seg.T.length - 1] = t1;
}

/** Plan arc lengths and smoothed vertex tangents. */
function measure(seg) {
  const {pts} = seg, n = pts.length;
  seg.S = new Float64Array(n);
  for (let i = 1; i < n; i++) seg.S[i] = seg.S[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  seg.L = seg.S[n - 1];
  seg.T = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return [dx / l, dz / l];
  });
}
/** Distance from (x, z) to piece i of a segment, with the deck height there. */
export function projectPiece(seg, i, x, z) {
  const a = seg.pts[i], b = seg.pts[i + 1];
  const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
  const t = l2 > 1e-9 ? clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1) : 0;
  const px = a.x + dx * t, pz = a.z + dz * t, l = Math.sqrt(l2) || 1;
  const h = a.h + (b.h - a.h) * t, cs = (a.cs || 0) + ((b.cs || 0) - (a.cs || 0)) * t;
  // Deck height where (x, z) actually is across the road, banked or not; the
  // bank carries on across the pavement (widest verge is 3.2 m).
  const lateral = clamp(((x - px) * -dz + (z - pz) * dx) / l, -h - 3.4, h + 3.4);
  return {d: Math.hypot(x - px, z - pz), y: a.y + (b.y - a.y) * t + cs * lateral, h, t, i, e: a.e,
    nat: a.nat + (b.nat - a.nat) * t,
    s: seg.S[i] + (seg.S[i + 1] - seg.S[i]) * t};
}
export {VERGE};
