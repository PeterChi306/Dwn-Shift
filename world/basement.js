/* The Mulholland Estate's basement garage (2026-10-04, Peter: "the fake
 * ground will race up ... a path where you go down to the basement, a turn,
 * a really premium one ... a huge open-space garage where you can park your
 * cars ... beautiful, full of lights").
 *
 * Next to the three-car garage, between it and the house, a strip of lawn is
 * not lawn: it is a steel lid with turf on it. Get out, press the button on
 * the lit post at the corner of the motor court, and it races up 3.4 m on
 * four chrome rams, its underside a ceiling of light, uncovering a ramp:
 *   - a straight descent in a basalt-walled trench under the raised lid,
 *   - a half-turn, 6.5 m radius, curving down under the garage between
 *     walls traced with lines of light,
 *   - a last straight into the hall.
 * The hall is 25 x 35 m and 5.4 m high, under the motor court and the drive:
 * a black mirror floor, ceiling lines of light, a warm wall of lit fins at the
 * far end, fourteen numbered bays with a pool of light on each, and a
 * turntable in the middle where a car parked on it slowly turns. It starts
 * empty; park your own (world/designs.js: every design is its own car).
 * Driving back up, a sensor raises the lid for you; a button by the ramp's
 * foot does it on foot too. Underground the daylight is shut out and the
 * lights take over (world.js reads `underground`).
 *
 * Built in the mansion's lot frame (homes.js Frame: u away from the street,
 * v across, y up from the pad); the pit is dug by hard pads (homes.js HOMES).
 */
import * as T from 'three';
import {Kit} from './kit.js';

export const BASEMENT = {
  floor: -6, ceil: -.55, lane: 2.7,
  trench: {u: 24.5, v0: 11, v1: 30}, turn: {cu: 18, cv: 30, r: 6.5}, low: {u: 11.5, v0: 30, v1: 12},
  hall: {u0: 8.8, u1: 33.5, v0: -20, v1: 15},
  lid: {u0: 21.5, u1: 27.5, v0: 11.2, v1: 30, lift: 3.4},
  button: {u: 29.2, v: 10.3}, button2: {u: 16, v: 14.75},
  // Dug out under the lawn (frame rects, the pit floor's height): kept 2.5 m clear of every wall so the
  // terrain's 2 m grid never slopes up inside.
  pits: [{u0: 6.3, u1: 36, v0: -22.5, v1: 17.5}, {u0: 6.3, u1: 30, v0: 15, v1: 41.7}, {u0: 19.3, u1: 29.7, v0: 8.5, v1: 32}],
  pitY: -6.6,
};
const B = BASEMENT, A_LEN = B.trench.v1 - B.trench.v0, B_LEN = Math.PI * B.turn.r, C_LEN = B.low.v0 - B.low.v1, LEN = A_LEN + B_LEN + C_LEN;

/** The ramp's centreline at distance s: {u, v, tu, tv (tangent), y}. */
function route(s) {
  let u, v, tu, tv;
  if (s <= A_LEN) { u = B.trench.u; v = B.trench.v0 + s; tu = 0; tv = 1; }
  else if (s <= A_LEN + B_LEN) { const th = (s - A_LEN) / B.turn.r; u = B.turn.cu + B.turn.r * Math.cos(th); v = B.turn.cv + B.turn.r * Math.sin(th); tu = -Math.sin(th); tv = Math.cos(th); }
  else { u = B.low.u; v = B.low.v0 - (s - A_LEN - B_LEN); tu = 0; tv = -1; }
  return {u, v, tu, tv, y: height(s)};
}
/* Heights: from the court (.09) to 2.65 m down at the portal (headroom under
 * the lawn), then a gentler fall to the hall floor; corners rounded so a low
 * car never grounds at a change of grade. */
const KNOTS = [[0, .09], [2, .04], [A_LEN, -2.65], [LEN - 4, B.floor], [LEN + 10, B.floor]];
function lin(s) { for (let i = 1; i < KNOTS.length; i++) if (s <= KNOTS[i][0]) { const [a, ya] = KNOTS[i - 1], [b, yb] = KNOTS[i]; return ya + (yb - ya) * (s - a) / (b - a); } return B.floor; }
function height(s) { if (s <= 0) return .09; let t = 0; for (let k = -6; k <= 6; k++) t += lin(Math.max(0, s + k * .4)); return t / 13; }

export function buildBasement(F, H, places) {
  const kit = F.kit, wp = (u, v, y) => { const [x, z] = F.w(u, v); return [x, F.y + y, z]; };
  const {floor: FL, ceil: CE, lane: LW} = B;
  const BASALT = '#2a2a2d', CHAR = '#1b1c20', COOL = '#d6e8ff', WARM = '#ffd7a3';
  kit.indoor = 1;
  /* ---- the ramp: surface, walls, light lines, ceiling */
  const step = .6, n = Math.ceil(LEN / step), grid = [], edges = [[], []], coves = [[], []], tops = [[], []];
  for (let i = 0; i <= n; i++) {
    const s = Math.min(LEN, i * step), r = route(s), nu = r.tv, nv = -r.tu;            // across the lane
    grid.push([-LW, 0, LW].map(o => wp(r.u + nu * o, r.v + nv * o, r.y)));
    for (const [k, o] of [[0, -1], [1, 1]]) {
      edges[k].push(wp(r.u + nu * o * (LW - .25), r.v + nv * o * (LW - .25), r.y + .012));
      coves[k].push(wp(r.u + nu * o * (LW - .02), r.v + nv * o * (LW - .02), r.y + .38));
      tops[k].push(wp(r.u + nu * o * (LW - .02), r.v + nv * o * (LW - .02), s < A_LEN ? -.1 : CE - .06));
    }
  }
  kit.sheet('flood', grid, '#3a3c41', true);
  for (const e of edges) kit.ribbon('glow', e, .08, '#eef5ff', .004);
  for (let i = 0; i < n; i++) {
    const s0 = i * step, s1 = Math.min(LEN, s0 + step), a = route(s0), b = route(s1), covered = s0 >= A_LEN - .01;
    for (const o of [-1, 1]) {
      const off = LW + .17, A = F.w(a.u + a.tv * o * off, a.v - a.tu * o * off), Bp = F.w(b.u + b.tv * o * off, b.v - b.tu * o * off);
      const lo = Math.min(a.y, b.y) - .4, hi = covered ? CE : .04;
      kit.beam(covered ? 'paint' : 'stone', A[0], A[1], Bp[0], Bp[1], F.y + (lo + hi) / 2, hi - lo, .34, covered ? CHAR : BASALT, true);
    }
    if (covered) {
      // Overlapping, so the outside of the curve has no gaps between the straight pieces.
      const A = F.w(a.u - a.tu * .45, a.v - a.tv * .45), Bp = F.w(b.u + b.tu * .45, b.v + b.tv * .45);
      kit.beam('paint', A[0], A[1], Bp[0], Bp[1], F.y + CE + .1, .2, LW * 2 + .8, '#121316');
    }
  }
  for (let k = 0; k < 2; k++) for (let i = 0; i < n; i++) {
    kit.rod('glow', coves[k][i], coves[k][i + 1], .025, COOL, 4);
    if (i * step >= A_LEN) kit.rod('glow', tops[k][i], tops[k][i + 1], .02, WARM, 4);
  }
  // A line of light down the middle of the covered ceiling, and the portal's lit header.
  for (let i = Math.ceil(A_LEN / step); i < n; i++) { const a = route(i * step), b = route(Math.min(LEN, (i + 1) * step)); kit.rod('glow', wp(a.u, a.v, CE - .02), wp(b.u, b.v, CE - .02), .03, '#f4f8ff', 4); }
  F.rect('stone', B.trench.u - LW - .34, B.trench.v1, B.trench.u + LW + .34, B.trench.v1 + .4, CE, .04, BASALT, true);
  F.rect('glow', B.trench.u - LW, B.trench.v1 - .02, B.trench.u + LW, B.trench.v1, CE + .02, CE + .1, WARM);
  F.rect('metal', B.trench.u - LW - .34, B.trench.v1 - .05, B.trench.u + LW + .34, B.trench.v1 + .42, .02, .07, '#1b1c1e');
  // Glass balustrades along the trench's long sides and its far end (the lid rises between them).
  F.balustrade(B.lid.u0 - .17, 12.6, B.lid.u0 - .17, B.lid.v1 + .3, .04);
  F.balustrade(B.lid.u1 + .17, 12.6, B.lid.u1 + .17, B.lid.v1 + .3, .04);
  F.balustrade(B.lid.u0 - .17, B.lid.v1 + .3, B.lid.u1 + .17, B.lid.v1 + .3, .04);
  // The rams' housings in the wall tops.
  for (const u of [B.lid.u0 + .15, B.lid.u1 - .15]) for (const v of [14, 26]) F.cyl('metal', u, v, -.3, .2, .36, '#2a2b2e', 14);
  // The button post at the court's corner, and the one by the ramp's foot.
  const post = (u, v, y0) => { F.cyl('metal', u, v, y0, .13, 1.05, '#202124', 14, true); F.cyl('gloss', u, v, y0 + 1.05, .135, .05, '#0d0e10', 14); F.cyl('glow', u, v, y0 + 1.1, .07, .02, '#7fd0ff', 14); F.pool(u, v, y0 + .03, 1.5, .5); };
  post(B.button.u, B.button.v, .09);
  F.rect('metal', B.button2.u - .2, B.button2.v - .06, B.button2.u + .2, B.button2.v, FL + 1.05, FL + 1.55, '#202124');
  F.rect('glow', B.button2.u - .07, B.button2.v - .08, B.button2.u + .07, B.button2.v - .06, FL + 1.24, FL + 1.38, '#7fd0ff');

  /* ---- the hall */
  const {u0, u1, v0, v1} = B.hall, HT = CE - FL;
  F.rect('gloss', u0, v0, u1, v1, FL - .4, FL, '#141518', true);
  F.wall(u0, v0, u0, v1, HT + .4, .4, CHAR, [], 'paint', FL - .4);
  F.wall(u1, v0, u1, v1, HT + .4, .4, CHAR, [], 'paint', FL - .4);
  F.wall(u0, v0, u1, v0, HT + .4, .4, CHAR, [], 'paint', FL - .4);
  F.wall(B.low.u + LW + .17, v1, u1, v1, HT + .4, .4, CHAR, [], 'paint', FL - .4);
  F.rect('paint', u0, v0, u1, v1, CE, CE + .2, '#0f1012');
  // Ceiling: lines of light across the hall, a cove all round.
  for (let v = v0 + 2.2; v < v1 - 1; v += 2.9) F.rect('glow', u0 + 1.2, v - .05, u1 - 1.2, v + .05, CE - .03, CE, '#eef4ff');
  for (const [a, b, c, d] of [[u0 + .2, v0 + .2, u1 - .2, v0 + .3], [u0 + .2, v1 - .3, u1 - .2, v1 - .2], [u0 + .2, v0 + .2, u0 + .3, v1 - .2], [u1 - .3, v0 + .2, u1 - .2, v1 - .2]]) F.rect('glow', a, b, c, d, CE - .12, CE - .06, WARM);
  // The far wall: warm lit fins, floor to ceiling.
  for (let u = u0 + 1.4; u < u1 - 1; u += 1.15) { F.rect('wood', u - .09, v0 + .2, u + .09, v0 + .45, FL, CE - .2, '#4a3324'); F.rect('glow', u - .02, v0 + .45, u + .02, v0 + .47, FL + .3, CE - .4, WARM); }
  // Wall washes: light fans up the long walls.
  for (let v = v0 + 2; v < v1 - 1; v += 3.7) { F.scallop(u0 + .2, v, FL, [1, 0], 2.6, HT * .9, .5); F.scallop(u1 - .2, v, FL, [-1, 0], 2.6, HT * .9, .5); }
  // Bays: luminous lines, a wheel stop, a pool of light, a number.
  const stalls = [];
  const bay = (u, v, nose, num) => {
    const du = 3.2 * nose;                                  // centre to the wall end
    for (const s of [-1, 1]) F.rect('glow', Math.min(u - du, u + du * .95), v + s * 1.85 - .03, Math.max(u - du, u + du * .95), v + s * 1.85 + .03, FL, FL + .006, '#e6efff');
    F.rect('metal', u + du * .78 - .12, v - .8, u + du * .78 + .12, v + .8, FL, FL + .12, '#2b2d31');
    F.pool(u, v, FL + .01, 2.7, .5, new T.Color('#eef3ff'));
    F.downlight(u, v, CE, null);
    const [x, z] = F.w(u, v); stalls.push({x, z, y: F.y + FL, u, v, nose, num, turn: false, label: String(num).padStart(2, '0')});
  };
  let num = 1;
  for (let i = 0; i < 8; i++) bay(u1 - 3.2, v0 + 4 + i * 3.7, 1, num++);
  for (let i = 0; i < 6; i++) bay(u0 + 3.2, v0 + 4 + i * 3.7, -1, num++);
  // The turntable.
  const TT = {u: 21.5, v: -5};
  F.geo('gloss', new T.CylinderGeometry(3.2, 3.25, .07, 48), TT.u, FL + .035, TT.v, '#24272c');
  F.geo('glow', new T.TorusGeometry(3.24, .035, 6, 64), TT.u, FL + .07, TT.v, '#9fd4ff', {rx: Math.PI / 2});
  F.geo('glow', new T.TorusGeometry(2.2, .015, 6, 48), TT.u, FL + .072, TT.v, '#9fd4ff', {rx: Math.PI / 2});
  F.solid(TT.u, FL + .035, TT.v, 4.4, .07, 4.4);
  F.pool(TT.u, TT.v, FL + .08, 4.2, .7, new T.Color('#f2f6ff'));
  for (const [a, b] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) F.downlight(TT.u + a, TT.v + b, CE, null);
  { const [x, z] = F.w(TT.u, TT.v); stalls.push({x, z, y: F.y + FL + .07, u: TT.u, v: TT.v, nose: 1, num: 0, turn: true, label: 'TT', r: 3.2}); }
  // A bar along the far wall's west end: a backlit counter and stools; two lounge chairs facing the cars.
  F.rect('gloss', u0 + 1.5, v0 + 1.6, u0 + 7.5, v0 + 2.3, FL, FL + 1.05, '#0f1012', true);
  F.rect('glow', u0 + 1.5, v0 + 2.3, u0 + 7.5, v0 + 2.32, FL + .1, FL + .16, WARM);
  F.rect('wood', u0 + 1.45, v0 + 1.55, u0 + 7.55, v0 + 2.4, FL + 1.05, FL + 1.1, '#6a4a32');
  for (let u = u0 + 2.2; u < u0 + 7.3; u += 1.2) { F.cyl('metal', u, v0 + 2.9, FL, .04, .72, '#1b1c1e', 8); F.cyl('fabric', u, v0 + 2.9, FL + .72, .2, .07, '#2b2c30', 14); }
  for (const u of [u0 + 13, u0 + 16]) { F.rect('fabric', u - .45, v0 + 3.4, u + .45, v0 + 4.3, FL, FL + .42, '#6b4f3a', true); F.rect('fabric', u - .45, v0 + 3.4, u + .45, v0 + 3.6, FL + .42, FL + .95, '#6b4f3a'); }
  kit.indoor = 0;

  /* ---- the lid, its rams and the moving parts (their own meshes) */
  const L = B.lid, lk = new Kit(), lw = L.u1 - L.u0, ll = L.v1 - L.v0;
  lk.box('grass', 0, -.005, 0, lw, .09, ll, 0, '#6c8c43');
  lk.box('metal', 0, -.17, 0, lw, .24, ll, 0, '#1b1c1e');
  lk.box('metal', 0, -.02, 0, lw + .06, .08, .06, 0, '#2a2b2e');
  for (let z = -ll / 2 + 1.2; z < ll / 2 - .5; z += 2.1) lk.box('glow', 0, -.3, z, lw - .8, .02, .07, 0, COOL);
  for (const s of [-1, 1]) lk.box('glow', s * (lw / 2 - .2), -.3, 0, .06, .02, ll - .4, 0, WARM);
  const lid = new T.Group(); lid.rotation.y = F.yaw; lk.build(lid, places.mats, {shadows: true});
  const [lx, lz] = F.w((L.u0 + L.u1) / 2, (L.v0 + L.v1) / 2);
  lid.position.set(lx, F.y, lz); places.scene.add(lid);
  const chrome = new T.MeshStandardMaterial({color: '#d9dde2', metalness: 1, roughness: .12}), ramGeo = new T.CylinderGeometry(.09, .09, 1, 14).translate(0, .5, 0);
  const rams = [];
  for (const u of [L.u0 + .15, L.u1 - .15]) for (const v of [14, 26]) { const m = new T.Mesh(ramGeo, chrome); const [x, z] = F.w(u, v); m.position.set(x, F.y + .06, z); m.scale.y = .01; m.castShadow = true; places.scene.add(m); rams.push(m); }
  H.basement = new Basement({F, lid, rams, stalls, scene: places.scene});
}

/* ------------------------------------------------------------------ runtime */
export class Basement {
  constructor({F, lid, rams, stalls, scene}) {
    this.F = F; this.lid = lid; this.rams = rams; this.stalls = stalls; this.scene = scene;
    this.lift = 0; this.want = 0; this.physics = null; this.lidOn = null; this.prompt = ''; this.underground = 0; this.audio = null; this.moving = false;
    this.boards();
  }
  /** Frame coordinates of a world point. */
  local(p) { const F = this.F, dx = p.x - F.ox, dz = p.z - F.oz; return {u: dx * F.fx + dz * F.fz, v: dx * F.vx + dz * F.vz, y: p.y - F.y}; }
  /** Inside the hall or the covered ramp (0..1, for the light)? */
  inside(p) {
    const q = this.local(p), h = B.hall;
    if (q.y > -.2 || q.y < B.floor - 2) return false;
    if (q.u > h.u0 && q.u < h.u1 && q.v > h.v0 && q.v < h.v1) return true;
    const s = this.along(q); return s !== null && s > A_LEN - 1;
  }
  /** Distance along the ramp of a frame point on it, or null. */
  along(q) {
    let best = null, bd = B.lane + .6;
    for (let s = 0; s <= LEN; s += .5) { const r = route(s), d = Math.hypot(q.u - r.u, q.v - r.v); if (d < bd && Math.abs(q.y - r.y) < 3) { bd = d; best = s; } }
    return best;
  }
  /** The bay a car stands in (its centre inside the bay), or null. */
  stallAt(p) {
    const q = this.local(p);
    if (q.y > B.floor + 2 || q.y < B.floor - 1) return null;
    for (const s of this.stalls) {
      if (s.turn) { if (Math.hypot(q.u - s.u, q.v - s.v) < s.r) return s; continue; }
      if (Math.abs(q.u - s.u) < 3.3 && Math.abs(q.v - s.v) < 1.9) return s;
    }
    return null;
  }
  /** A bay with no car in it (not the turntable): `taken(stall)` says if one is there. */
  freeStall(taken) { return this.stalls.find(s => !s.turn && !taken(s)) || null; }
  /** Where a car stands in a bay: nose to the wall. */
  bayPose(s) { const F = this.F; return {x: s.x, y: s.y, z: s.z, heading: Math.atan2(F.fx * s.nose, F.fz * s.nose)}; }
  /** Lit numbers over the bays and the name on the far wall (canvas boards). */
  boards() {
    const F = this.F, mk = (w, h, draw, px = 512) => {
      const cv = document.createElement('canvas'); cv.width = px; cv.height = Math.round(512 * h / w); const c = cv.getContext('2d'); draw(c, cv.width, cv.height);
      const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
      return new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({map: tex, transparent: true, toneMapped: false}));
    };
    for (const s of this.stalls) {
      if (s.turn) continue;
      const m = mk(1.1, .55, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#eaf2ff'; c.font = '300 210px Outfit, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s.label, w / 2, h / 2 + 8); });
      const u = s.u + s.nose * 2.95, [x, z] = F.w(u, s.v); m.position.set(x, F.y + B.floor + 2.6, z); m.rotation.y = F.yaw - s.nose * Math.PI / 2; this.scene.add(m);
    }
    const name = mk(9, 1.3, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#ffe9c9'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '200 76px Outfit, Arial'; c.fillText('M U L H O L L A N D   ·   9 1 6 1', w / 2, h * .42); c.font = '500 24px Outfit, Arial'; c.fillStyle = '#c9b49a'; c.fillText('P R I V A T E   C O L L E C T I O N', w / 2, h * .8); }, 1400);
    const [x, z] = F.w((B.hall.u0 + B.hall.u1) / 2 + 2.5, B.hall.v0 + .5); name.position.set(x, F.y + B.floor + 4.1, z); name.rotation.y = F.yaw; this.scene.add(name);
  }
  setLidCollider(on) {
    if (!this.physics || this.lidOn === on) return; this.lidOn = on;
    if (!on) { this.physics.remove('basementLid'); return; }
    const L = B.lid, [x, z] = this.F.w((L.u0 + L.u1) / 2, (L.v0 + L.v1) / 2);
    this.physics.setBoxes('basementLid', [{x, y: this.F.y - .11, z, hx: (L.u1 - L.u0) / 2, hy: .15, hz: (L.v1 - L.v0) / 2, yaw: this.F.yaw, tag: 'grass'}]);
  }
  /** Is anything on the ramp under the lid (no closing on it)? */
  onRamp(p) { const q = this.local(p), L = B.lid; return q.u > L.u0 - .3 && q.u < L.u1 + .3 && q.v > L.v0 - .5 && q.v < L.v1 + .3 && q.y < 3.6 && q.y > -3.5; }
  toggle(blocked) {
    if (this.want && blocked) return 'Clear the ramp first';
    this.want = this.want ? 0 : 1; this.audio?.start(this.want);
    return this.want ? 'The ground rises' : 'The ground comes down';
  }
  /** o: {dt, camera, walker (pos) | null, onFoot, car: position, carSpeed, audio}. Returns the prompt. */
  update({dt, camera, walker, onFoot, car, audio}) {
    if (audio && !this.audio) this.audio = new LidAudio(audio.ctx, audio.out);
    // The lid: it races up (fast, easing in at the top), comes down slower.
    const was = this.lift, k = this.want ? Math.min(1, this.lift + dt / 1.7) : Math.max(0, this.lift - dt / 3.2);
    this.lift = k;
    const e = this.want ? 1 - Math.pow(1 - k, 2.4) : k * k * (3 - 2 * k), y = e * B.lid.lift;
    this.lid.position.y = this.F.y + y;
    for (const r of this.rams) r.scale.y = Math.max(.01, y + .02);
    const moving = was !== k; if (this.moving && !moving) this.audio?.stop(); this.moving = moving;
    this.setLidCollider(k === 0);
    // Driving up from below with it shut: the sensor opens it.
    if (!onFoot && !this.want && car) { const q = this.local(car); if (q.y < -.8 && q.y > B.floor - 1.5) { const s = this.along(q); const nearFoot = q.u < B.low.u + 6 && q.v > B.hall.v1 - 8 && q.u > B.hall.u0 - 1; if ((s !== null && s > 6) || nearFoot) { this.want = 1; this.audio?.start(1); this.note = 'Sensor · the ground rises'; } } }
    // The light: underground the day is shut out.
    const ug = this.inside(camera.position) ? 1 : 0;
    this.underground += (ug - this.underground) * (1 - Math.exp(-dt * 3));
    // Buttons.
    this.prompt = ''; this.at = null;
    if (onFoot && walker) {
      const q = this.local(walker);
      for (const [b, y0] of [[B.button, 0], [B.button2, B.floor]]) if (Math.hypot(q.u - b.u, q.v - b.v) < 1.9 && Math.abs(q.y - y0) < 1.6) { this.at = b; this.prompt = '<kbd>E</kbd> ' + (this.want ? 'LOWER THE GROUND' : 'RAISE THE GROUND · THE GARAGE BELOW'); }
    }
    return this.prompt;
  }
}

/** The rams: a hydraulic whine and hiss while the lid moves, a soft clunk when it seats. */
class LidAudio {
  constructor(ctx, out) {
    this.ctx = ctx; this.out = out; this.g = ctx.createGain(); this.g.gain.value = 0; this.g.connect(out);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 70; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; o.connect(f).connect(this.g); o.start(); this.o = o;
    const n = ctx.sampleRate, b = ctx.createBuffer(1, n, n), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = .7;
    const hiss = ctx.createGain(); hiss.gain.value = .25; s.connect(bp).connect(hiss).connect(this.g); s.start(); this.noise = b;
  }
  start(up) { const t = this.ctx.currentTime; this.o.frequency.cancelScheduledValues(t); this.o.frequency.setValueAtTime(up ? 60 : 85, t); this.o.frequency.linearRampToValueAtTime(up ? 110 : 55, t + (up ? 1.7 : 3.2)); this.g.gain.setTargetAtTime(.08, t, .05); }
  stop() {
    const c = this.ctx, t = c.currentTime; this.g.gain.setTargetAtTime(0, t, .08);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; f.type = 'lowpass'; f.frequency.value = 180;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.3, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + .25);
    s.connect(f).connect(g).connect(this.out); s.start(t); s.stop(t + .3);
  }
}
