/* The ground, shaped to the road surface in the same step that defines it.
 *
 * The old carve took the raw graph edges; the roads were drawn from something
 * else. Here the ground reads the SAME smoothed centrelines the road mesh is
 * built from, so the two cannot drift apart. Rules, in order:
 *
 *   1. Blend out from every road over its `reach`: surface roads may raise the
 *      ground (a fill) or lower it (a cut); elevated roads may only cut. Where
 *      several roads reach a point they are averaged, each weighted by how
 *      close it is, so every road dominates the ground beside itself.
 *   2. Inside a surface road's flat zone the ground is seated exactly: SEAT
 *      below the carriageway, and behind a kerb just under the pavement, so
 *      lawns meet the pavement and never rise over the road. Junctions use
 *      their own kerb outline (roads.js junctionZone): asphalt inside, corner
 *      pavement round the rounded kerbs.
 *   3. Beside ANY road the ground may rise no steeper than CLIFF (a cone
 *      from the edge of its flat zone; inside the flat zone, not above the
 *      deck at all). This is applied last, so where a street crosses high
 *      over a freeway the freeway's cutting wins and the street is, correctly,
 *      a bridge across it rather than a road on the lip of a sheer cliff.
 *
 * Tunnels are bored, not cut: they leave the ground alone, and terrain tiles
 * punch a hole over their portals instead (see `tunnelCover`).
 *
 * `extra` widens every flat zone. Coarse terrain LODs pass their cell size, so
 * a 32 m grid still drops under a 12 m street instead of interpolating a hill
 * straight over it.
 */
import {naturalHeight as terrainHeight} from './network.js';
import {SEAT, VERGE, CURB, KERB, projectPiece, blendWidth} from './roads.js';

const CLIFF = 1.2;
const TUBE_CROWN = 8.5;         // terrain over a bore stays this far above the road (tube roof is 6.6 m)              // steepest bank beside a road, rise per metre (~50 degrees)
/* A deep cut or tall fill is blended out over more ground (blendWidth, in
 * roads.js with the index that depends on it): the hill is shaved or the
 * valley raised, instead of a slot canyon or a dyke. Width grows with the
 * depth AT THE ROAD (not at the query point, which would never close on a slope). */

export class Ground {
  constructor(model) {
    this.model = model;
    this.kinds = model.net.edges.map(e => e.kind);
    // Tunnels are few; index them on their own so tile builds skip the check
    // entirely almost everywhere.
    this.tunnels = new Map();
    for (const seg of model.segments) {
      if (seg.kind !== 'tunnel') continue;
      for (let i = 0; i < seg.pts.length - 1; i++) {
        const a = seg.pts[i], b = seg.pts[i + 1], pad = Math.max(a.h, b.h) + 8;
        for (let gx = Math.floor((Math.min(a.x, b.x) - pad) / 64); gx <= Math.floor((Math.max(a.x, b.x) + pad) / 64); gx++)
          for (let gz = Math.floor((Math.min(a.z, b.z) - pad) / 64); gz <= Math.floor((Math.max(a.z, b.z) + pad) / 64); gz++) {
            const key = gx * 65536 + gz; let l = this.tunnels.get(key); if (!l) this.tunnels.set(key, l = []); l.push(seg.id, i);
          }
      }
    }
  }
  /** Tunnel mouths, graded like real portals: the hill above and beside a
   *  headwall comes down to the headwall's coping, then climbs away from it.
   *  Without this the approach cutting met the hill as a 20 m cliff over a
   *  10.8 m headwall. */
  mouths() {
    if (this._mouths) return this._mouths;
    const m = this.model, out = [];
    for (const seg of m.segments) {
      if (seg.kind !== 'tunnel' || !seg.bores) continue;
      const cont = node => m.segments.some(o => o !== seg && o.kind === 'tunnel' && (o.a === node || o.b === node));
      for (const [r0, r1] of seg.bores) {
        if (r1 - r0 < 5) continue;
        for (const [s, into] of [[r0, 1], [r1, -1]]) {
          if ((s < .5 && cont(seg.a)) || (s > seg.L - .5 && cont(seg.b))) continue;
          const q = m.sectionAt(seg, s);
          out.push({x: q.x, y: q.y, z: q.z, tx: q.tx * into, tz: q.tz * into, nx: q.nx, nz: q.nz, hw: q.h + 16});
        }
      }
    }
    return this._mouths = out;
  }
  /** Any tunnel within a square of `size` centred on (x, z)? */
  anyTunnelNear(x, z, size) {
    for (let gx = Math.floor((x - size) / 64); gx <= Math.floor((x + size) / 64); gx++)
      for (let gz = Math.floor((z - size) / 64); gz <= Math.floor((z + size) / 64); gz++)
        if (this.tunnels.has(gx * 65536 + gz)) return true;
    return false;
  }
  natural(x, z) { return terrainHeight(x, z); }
  /** Graded pads: level rectangles under big landmarks (a stadium in the
   *  Arroyo), blended back to the hill over `margin`. Applied to the natural
   *  ground, so roads still seat and cut exactly as before. The terrain
   *  worker gets the same list (world.js posts it). */
  addPad(p) { (this.pads ||= []).push(p); }
  /** True inside any pad's level rectangle (a building's ground, a stadium). */
  onPad(x, z) {
    if (!this.pads) return false;
    for (const p of this.pads) {
      const dx = x - p.cx, dz = z - p.cz;
      if (Math.abs(dx * p.fx + dz * p.fz) < p.hl + 1 && Math.abs(-dx * p.fz + dz * p.fx) < p.hw + 1) return true;
    }
    return false;
  }
  padded(x, z, nat) {
    if (!this.pads) return nat;
    for (const p of this.pads) {
      if (p.hard) continue;
      const dx = x - p.cx, dz = z - p.cz, R = Math.hypot(p.hl, p.hw) + p.margin;
      if (dx > R || dx < -R || dz > R || dz < -R) continue;
      const a = Math.abs(dx * p.fx + dz * p.fz) - p.hl, b = Math.abs(-dx * p.fz + dz * p.fx) - p.hw;
      const d = Math.hypot(Math.max(a, 0), Math.max(b, 0));
      if (d >= p.margin) continue;
      let t = d / p.margin; t = t * t * (3 - 2 * t);
      nat = p.y + (nat - p.y) * t;
    }
    return nat;
  }
  /** Hard pads (player homes, 2026-09-27 pass 11) win over everything, road
   *  cuttings and cliff cones included. A `cap` pad only keeps the ground from
   *  rising above it (terrain below a house's solid floors is never seen, and
   *  on a 2 m grid a level-to-road step would leak a sloped triangle either
   *  side); a plain hard pad sets the height (a dug pool). Applied in order,
   *  so a later one sits inside an earlier one. Keep them off the carriageway. */
  hardPads(x, z, g) {
    for (const p of this.pads) {
      if (!p.hard) continue;
      const dx = x - p.cx, dz = z - p.cz, R = Math.hypot(p.hl, p.hw) + p.margin;
      if (dx > R || dx < -R || dz > R || dz < -R) continue;
      const a = Math.abs(dx * p.fx + dz * p.fz) - p.hl, b = Math.abs(-dx * p.fz + dz * p.fx) - p.hw;
      const d = Math.hypot(Math.max(a, 0), Math.max(b, 0));
      if (d > p.margin || (d > 0 && !p.margin)) continue;
      if (p.cap) { if (d <= 0 && g > p.y) g = p.y; continue; }
      let t = p.margin ? d / p.margin : 0; t = t * t * (3 - 2 * t);
      g = p.y + (g - p.y) * t;
    }
    return g;
  }

  height(x, z, extra = 0) {
    const nat = this.padded(x, z, terrainHeight(x, z)), m = this.model, list = m.near(x, z);
    let sum = 0, weight = 0, flatSurface = Infinity, cone = Infinity;
    for (let k = 0; k < list.length; k += 2) {
      // The segment's kind sets its cross-section (pavement, kerb): the mesh uses the same.
      const seg = m.segments[list[k]], i = list[k + 1], kind = seg.kind;
      // A bored stretch leaves the hill alone; an open stretch of a tunnel
      // road is cut like any other road, so its approaches are cuttings.
      const r = projectPiece(seg, i, x, z);
      if (kind === 'tunnel' && m.boredAt(seg, r.s)) continue;
      const flat = r.h + (VERGE[kind] ?? 2) + .6 + extra;
      const reach = flat + blendWidth(kind, r.nat - r.y);
      // Behind a kerb the ground comes up to just under the pavement.
      const verge = CURB.has(kind) && !seg.elevated && r.d > r.h + .6;
      const deck = verge ? r.y + KERB - .07 : r.y - SEAT;
      // Slope ceiling beside every road: gentle for the first 3 m past its
      // edge (a 2 m terrain grid must not cut over the pavement), then CLIFF.
      const out = Math.max(0, r.d - flat), top = CURB.has(kind) && !seg.elevated ? r.y + KERB - .07 : r.y - SEAT;
      const bank = top + Math.min(out, 3) * .3 + Math.max(0, out - 3) * CLIFF;
      if (bank < cone) cone = bank;
      if (r.d >= reach) continue;
      let t = r.d <= flat ? 0 : (r.d - flat) / (reach - flat);
      t = t * t * (3 - 2 * t);
      if (r.d <= flat && !seg.elevated && deck < flatSurface) flatSurface = deck;
      // An elevated road only ever cuts: its pull counts where it is below the ground.
      const cand = deck + (nat - deck) * t;
      if (seg.elevated && cand > nat) continue;
      // Each road dominates the ground next to itself: weight falls off with
      // its blend, so between two roads the ground passes smoothly from one to
      // the other instead of the lower one pulling it down beside the upper.
      const w = (1 - t) ** 3 + 1e-6;
      sum += cand * w; weight += w;
    }
    let g = weight > 1e-5 ? (sum + nat * 1e-4) / (weight + 1e-4) : nat;
    // Inside a surface road's flat zone it is seated exactly (lowest wins).
    if (flatSurface < Infinity) g = flatSurface;
    // Junctions: their asphalt and their corner pavements, from the same
    // outline the mesh is built from. Lowest junction wins where two overlap.
    let jy = Infinity;
    for (const j of m.junctionsNear(x, z)) {
      const zone = m.junctionZone(j, x, z);
      if (zone === 'in') jy = Math.min(jy, j.plane(x, z) - SEAT);
      else if (zone === 'kerb') jy = Math.min(jy, j.plane(x, z) + KERB - .07);
    }
    // Lower-only: a junction seats the ground under its own asphalt, but must
    // not drag down the ground under a different road passing high above it.
    // (Arms' flat zones already raise the ground to a junction on a fill.)
    if (jy < g) g = jy;
    if (g > cone) g = cone;
    // Over a bored tunnel the hill stays above the tube's roof: the approach
    // cutting's blend would otherwise ramp up THROUGH the tube (a sand mound
    // inside the tunnel). The portal headwall hides the step this makes.
    if (this.tunnels.size && flatSurface === Infinity && jy === Infinity) {
      const tl = this.tunnels.get(Math.floor(x / 64) * 65536 + Math.floor(z / 64));
      if (tl) for (let k = 0; k < tl.length; k += 2) {
        const seg = m.segments[tl[k]], i = tl[k + 1];
        const r = projectPiece(seg, i, x, z);
        if (!m.boredAt(seg, r.s)) continue;
        // Only alongside the piece, never past its ends: in front of a portal
        // the ground belongs to the open cutting.
        if (r.t > 0 && r.t < 1 && r.d < r.h + 6) g = Math.max(g, r.y + TUBE_CROWN);
      }
    }
    if (this.tunnels.size && this.tunnels.has(Math.floor(x / 64) * 65536 + Math.floor(z / 64))) {
      for (const p of this.mouths()) {
        const dx = x - p.x, dz = z - p.z, along = dx * p.tx + dz * p.tz, lat = Math.abs(dx * p.nx + dz * p.nz);
        if (along < -1 || along > 45 || lat > p.hw + 45) continue;
        // 10.8 m = headwall height in tunnels.js (WALL + RISE + 4.2).
        const cap = p.y + 10.2 + Math.max(0, along - 1.5) * .8 + Math.max(0, lat - p.hw) * .8;
        if (g > cap) g = cap;
      }
    }
    return this.pads ? this.hardPads(x, z, g) : g;
  }

  /** How a terrain vertex relates to a tunnel bore: 0 clear, 1 over the bore
   *  (no collision, still drawn), 2 inside the tube's volume (not drawn). The
   *  approaches are real cuttings and the headwall (tunnels.js) closes the
   *  hillside round the tube, so a hidden triangle never opens onto the void. */
  tunnelCover(x, z, g) {
    const m = this.model, list = this.tunnels.get(Math.floor(x / 64) * 65536 + Math.floor(z / 64)) || [];
    let state = 0;
    for (let k = 0; k < list.length; k += 2) {
      const seg = m.segments[list[k]], i = list[k + 1];
      const r = projectPiece(seg, i, x, z);
      if (r.d > r.h + 3) continue;
      // Terrain INSIDE the tube (within 3 m of a bored stretch, below its
      // roof): not drawn, so a portal shows the tube and not the step where
      // the cutting meets the hill.
      const inTube = r.d < r.h + 1.4 && (m.boredAt(seg, r.s) || m.boredAt(seg, r.s + 1.9) || m.boredAt(seg, r.s - 1.9));
      if (inTube && g > r.y - 1.5 && g < r.y + 7) return 2;
      if ((seg.pts[i].bore || seg.pts[i + 1].bore) && g > r.y + 2) state = 1;
    }
    return state;
  }
}
