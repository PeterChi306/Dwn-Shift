/* Road follower: drives along the road model, lane-keeping, picking a way
 * through each junction. Used by the drivability test (a bot that drives the
 * real car through the real drivetrain and physics) and meant to become the
 * brain of traffic later.
 */
import {clamp, angleDelta} from './network.js';

export class Autopilot {
  constructor(model, seed = 1) {
    this.model = model; this.seed = seed >>> 0 || 1;
    this.seg = null; this.dir = 1; this.s = 0;
    this.ends = new Map();                    // node -> [{seg, atStart}]
    for (const seg of model.segments) for (const [node, atStart] of [[seg.a, true], [seg.b, false]]) {
      if (!this.ends.has(node)) this.ends.set(node, []);
      this.ends.get(node).push({seg, atStart});
    }
  }
  rand() { this.seed = (1664525 * this.seed + 1013904223) >>> 0; return this.seed / 4294967296; }

  /** Attach to the road under the car, facing the way the car faces. */
  attach(x, z, y, heading) {
    const r = this.model.nearest(x, z, y);
    if (!r) return false;
    const sec = this.model.sectionAt(r.seg, r.s);
    this.seg = r.seg; this.s = r.s;
    this.dir = Math.cos(angleDelta(heading - Math.atan2(sec.tx, sec.tz))) >= 0 ? 1 : -1;
    return true;
  }

  /** Next segment out of the node at the far end of travel. Never a U-turn if avoidable. */
  advance() {
    const node = this.dir > 0 ? this.seg.b : this.seg.a;
    const here = this.model.sectionAt(this.seg, this.dir > 0 ? this.seg.L : 0);
    const inX = here.tx * this.dir, inZ = here.tz * this.dir;
    const options = (this.ends.get(node) || []).filter(o => o.seg !== this.seg || this.ends.get(node).length === 1);
    const scored = options.map(o => {
      const sec = this.model.sectionAt(o.seg, o.atStart ? Math.min(8, o.seg.L) : Math.max(0, o.seg.L - 8));
      const ox = sec.tx * (o.atStart ? 1 : -1), oz = sec.tz * (o.atStart ? 1 : -1);
      return {o, turn: Math.acos(clamp(inX * ox + inZ * oz, -1, 1))};
    }).filter(c => c.turn < 1.95);            // no near-U-turns: a car cannot make them at speed
    const pick = scored.length ? scored[Math.floor(this.rand() * scored.length)] : null;
    if (!pick) { this.dir = -this.dir; return; }   // dead end: turn round
    this.seg = pick.o.seg; this.dir = pick.o.atStart ? 1 : -1;
    this.s = pick.o.atStart ? 0 : this.seg.L;
  }

  /** Steering input (-1..1, positive = left), target speed m/s, and how far the car is off its lane. */
  control(x, z, heading, speed) {
    // Keep s in step with the car.
    const probe = this.model.sectionAt(this.seg, this.s);
    const along = (x - probe.x) * probe.tx * this.dir + (z - probe.z) * probe.tz * this.dir;
    this.s += along * this.dir;
    // Move on to the next road on entering the junction, not at its centre: a
    // car rounds the corner before it ever reaches the centre point.
    let guard = 0;
    for (;;) {
      const end = this.dir > 0 ? this.seg.L - this.s : this.s, cutHere = this.dir > 0 ? this.seg.cut[1] : this.seg.cut[0];
      if (end > Math.max(2, cutHere * .7) || guard++ > 6) break;
      this.advance();
      const start = this.dir > 0 ? this.seg.cut[0] * .3 : this.seg.L - this.seg.cut[1] * .3;
      this.s = clamp(start, 0, this.seg.L);
    }
    this.s = clamp(this.s, 0, this.seg.L);
    const look = 7 + Math.abs(speed) * .55;
    const aim = this.pointAhead(look);
    const lane = Math.min(1.9, aim.h * .45);
    const tx = aim.x + aim.nx * lane * aim.dir, tz = aim.z + aim.nz * lane * aim.dir;
    const want = Math.atan2(tx - x, tz - z), err = angleDelta(want - heading);
    // Speed from the sharpest heading change in the next 40 m (a turn AT a
    // junction included), relative to where the car points now.
    let bend = 0;
    for (let d = 5; d <= 40; d += 5) {
      const q = this.pointAhead(d);
      bend = Math.max(bend, Math.abs(angleDelta(Math.atan2(q.tx * q.dir, q.tz * q.dir) - heading)));
    }
    const kind = this.seg.kind;
    const limit = kind === 'freeway' ? 30 : kind === 'ramp' ? 18 : kind === 'dirt' ? 11 : kind === 'scenic' ? 15 : 17;
    // ~9 m/s for a right angle, ~16 m/s for 30 degrees, open road above that.
    const speedWanted = Math.min(limit, 4 + 9 / (bend + .2));
    const here = this.model.sectionAt(this.seg, this.s);
    const lateral = (x - here.x) * here.nx + (z - here.z) * here.nz;
    return {steer: clamp(err * 2.2, -1, 1), speed: speedWanted, offRoad: Math.abs(lateral) - here.h};
  }

  /** Section `d` metres ahead along the route, through as many junctions as
   *  it takes (short links between close junctions included), without
   *  committing to the choices. */
  pointAhead(d) {
    const save = [this.seg, this.dir, this.s, this.seed];
    let left = d, guard = 0;
    for (;;) {
      const room = this.dir > 0 ? this.seg.L - this.s : this.s;
      if (left <= room || guard++ > 8) { this.s += this.dir * Math.min(left, room); break; }
      left -= room;
      this.advance();
    }
    const out = {...this.model.sectionAt(this.seg, this.s), dir: this.dir};
    [this.seg, this.dir, this.s, this.seed] = save;
    return out;
  }
}
