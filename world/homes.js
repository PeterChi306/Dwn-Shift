/* Player houses (2026-09-27, detailed pass 10): three homes that are also
 * spawn points, built in far more detail than the city's lots, with rooms you
 * can walk through (world/walker.js) after parking in the drive.
 *
 *   Mulholland Estate   the east end of Mulholland Crest, 500 m up, looking
 *                       straight down the Hollywood flats at the downtown
 *                       skyline. A white-stucco, black-steel and teak house
 *                       on a terraced stone podium that steps down the
 *                       hillside (planted, lit), a gated drive between low
 *                       stucco walls with step lights, a motor court with a
 *                       water table, a three-car garage, a two-storey glass
 *                       house with the bedroom floor cantilevered over the
 *                       terrace, a vanishing-edge pool, spa, fire lounge,
 *                       pergola dining and a pool house. Furnished inside;
 *                       the rooms glow after dark.
 *   Rubio Drive         San Marino: a white Colonial Revival house behind a
 *                       lawn and a clipped boxwood hedge, a columned portico,
 *                       black shutters, lit multi-pane windows, a circular
 *                       drive, a detached garage, a back garden with a pool,
 *                       a gazebo and a rose border.
 *   Catalina Street     Koreatown: a tired one-room stucco bungalow behind a
 *                       chain-link fence, bars on the windows, a cracked drive,
 *                       a couch on the porch, a mattress on the floor, string
 *                       lights, one warm bulb.
 *
 * Every wall is a box collider with real gaps for its doors, so you walk in
 * through the front door; stairs are steps the walker's autostep climbs.
 * Each house levels its own ground pad and is reserved before the city is
 * planned. Material keys are kit.js's (wood, stucco, stone, rock, grass,
 * fabric, room = interior skin lit at night, pool, poolwater, glow).
 */
import * as T from 'three';
import {RESERVED} from './places.js';
import {washDisc, washFan, washTrunk} from './kit.js';

export const HOMES = [
  {id: 'mansion', name: 'Mulholland Estate', kind: 'home', road: [-587, -3320], f: [.246, .969], y: 499.3, depth: 74, width: 84, setback: 5, build: mansion,
    blurb: 'Hollywood Hills · skyline view', margin: 3,
    // Mulholland climbs past the frontage, so the lot is capped hard (no road
    // cutting or bank rises into it) up to its street wall; the gate mouth and
    // the pool are dug below it. Frame coordinates, heights from the pad.
    hard: [{u0: .1, u1: 78.6, v0: -46.6, v1: 46.6, y: 0, cap: true}, {u0: .6, u1: 6.2, v0: -3.8, v1: 3.8, y: -1.3},
      {u0: 61.4, u1: 75.6, v0: -33.6, v1: -.4, y: -2.25}]},
  {id: 'sanmarino', name: 'Rubio Drive House', kind: 'home', road: [4339, -1665], f: [.999, .035], y: 54.3, depth: 62, width: 60, setback: 4, build: colonial,
    blurb: 'San Marino · colonial revival', margin: 10, dig: [{u: 45, v: -8, hl: 3, hw: 5.5, y: -1.75, margin: 2}]},
  {id: 'ktown', name: 'Catalina Street Bungalow', kind: 'home', road: [-546, 955], f: [.013, -1], y: 35.2, depth: 24, width: 13, setback: 2.5, build: bungalow,
    blurb: 'Koreatown · one room, one dream', margin: 10},
];

/* ------------------------------------------------------------ geometry */
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
/** A box with rounded edges (cushions, mattresses, planters): a sphere pushed out to the box. */
function rboxGeo(sx, sy, sz, r) {
  r = Math.min(r, sx / 2 - .001, sy / 2 - .001, sz / 2 - .001);
  const g = new T.SphereGeometry(1, 8, 5, Math.PI / 8), p = g.attributes.position, n = g.attributes.normal;
  const h = [sx / 2 - r, sy / 2 - r, sz / 2 - r];
  for (let i = 0; i < p.count; i++) {
    const v = [p.getX(i), p.getY(i), p.getZ(i)];
    p.setXYZ(i, ...v.map((c, k) => Math.sign(Math.abs(c) < 1e-6 ? 0 : c) * h[k] + c * r));
    n.setXYZ(i, ...v);
  }
  return g;
}
/** A rough rock: an icosahedron with its corners pushed about, flat-shaded. */
function rockGeo(seed, detail = 0) {
  const g = new T.IcosahedronGeometry(1, detail), p = g.attributes.position, R = new Map(), r = rng(seed);
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map(c => Math.round(c * 1000)).join();
    if (!R.has(key)) R.set(key, .72 + r() * .5);
    const s = R.get(key); p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * .8, p.getZ(i) * s);
  }
  g.computeVertexNormals();
  return g;
}
/** A leafy mass: a lumpy sphere with smooth normals. */
function blobGeo(seed) {
  const g = new T.IcosahedronGeometry(1, 1), p = g.attributes.position, R = new Map(), r = rng(seed);
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map(c => Math.round(c * 1000)).join();
    if (!R.has(key)) R.set(key, .82 + r() * .3);
    const s = R.get(key); p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
  }
  const n = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = new T.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize(); n.set([v.x, v.y, v.z], i * 3); }
  g.setAttribute('normal', new T.BufferAttribute(n, 3));
  return g;
}
/** A palm frond along +x: an arching, tapering, V-folded blade (both faces). */
function frondGeo(L, droop, width) {
  const pos = [], N = 10, P = t => [t * L, L * (.32 * t - droop * t * t), 0];
  const ring = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, [x, y] = P(t), w = width * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), .7) / 2 + .02;
    ring.push([[x, y - w * .25, -w], [x, y, 0], [x, y - w * .25, w]]);
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < 2; j++) {
    const a = ring[i][j], b = ring[i][j + 1], c = ring[i + 1][j + 1], d = ring[i + 1][j];
    pos.push(...a, ...b, ...c, ...a, ...c, ...d, ...a, ...c, ...b, ...a, ...d, ...c);
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  return g;
}
const ROCKS = [0, 1, 2, 3, 4, 5].map(k => rockGeo(11 + k * 7)), BLOBS = [0, 1, 2, 3].map(k => blobGeo(5 + k * 13));
const FRONDS = [[3.9, .55, 1.0], [3.5, .75, .9], [4.2, .45, 1.1]].map(a => frondGeo(...a));

/* ------------------------------------------------------------ frame */
/** A local frame: u forward (away from the street on a lot), v to the right
 *  of someone facing +u, y above the frame's base. sub() nests a turned frame
 *  (furniture). */
class Frame {
  constructor(kit, ox, oz, fx, fz, y) {
    const l = Math.hypot(fx, fz);
    this.kit = kit; this.fx = fx / l; this.fz = fz / l; this.vx = -this.fz; this.vz = this.fx;
    this.ox = ox; this.oz = oz; this.y = y; this.yaw = Math.atan2(-this.fz, this.fx);
  }
  static lot(kit, home, y) {
    const [fx, fz] = home.f, l = Math.hypot(fx, fz);
    return new Frame(kit, home.road[0] + fx / l * home.setback, home.road[1] + fz / l * home.setback, fx, fz, y);
  }
  /** A frame at (u, v, dy) turned by `turn` (radians, from +u toward +v). */
  sub(u, v, turn = 0, dy = 0) {
    const [x, z] = this.w(u, v), c = Math.cos(turn), s = Math.sin(turn);
    return new Frame(this.kit, x, z, c * this.fx + s * this.vx, c * this.fz + s * this.vz, this.y + dy);
  }
  w(u, v) { return [this.ox + this.fx * u + this.vx * v, this.oz + this.fz * u + this.vz * v]; }
  box(mat, u, y, v, su, sy, sv, color, solid = false) { const [x, z] = this.w(u, v); this.kit.box(mat, x, this.y + y, z, su, sy, sv, this.yaw, color, solid); }
  /** Box from y0 to y1. */
  col(mat, u, v, y0, y1, su, sv, color, solid = false) { if (y1 > y0) this.box(mat, u, (y0 + y1) / 2, v, su, y1 - y0, sv, color, solid); }
  /** Box between two corners in plan, y0..y1. */
  rect(mat, u0, v0, u1, v1, y0, y1, color, solid = false) { this.col(mat, (u0 + u1) / 2, (v0 + v1) / 2, y0, y1, Math.abs(u1 - u0), Math.abs(v1 - v0), color, solid); }
  /** A collider only (stairs under floating treads). */
  solid(u, y, v, su, sy, sv) { const [x, z] = this.w(u, v); this.kit.colliders.push({x, y: this.y + y, z, hx: su / 2, hy: sy / 2, hz: sv / 2, yaw: this.yaw}); }
  cyl(mat, u, v, y0, r, h, color, n = 12, solid = false, r1 = r) { const [x, z] = this.w(u, v); this.kit.cyl(mat, x, this.y + y0, z, r, h, color, n, solid, r1); }
  /** Any geometry at (u, y, v), turned with the frame (plus extra rotation). */
  geo(mat, g, u, y, v, color, {rx = 0, rz = 0, turn = 0, scale, keep = false} = {}) { const [x, z] = this.w(u, v); this.kit.add(mat, g, x, this.y + y, z, this.yaw + turn, color, {rx, rz, scale, keep}); }
  rbox(mat, u, y, v, su, sy, sv, r, color, opts) { this.geo(mat, rboxGeo(su, sy, sv, r), u, y, v, color, opts); }
  /** A box tipped about the frame's v axis (a chaise back, a sloped rail). */
  tilt(mat, u, y, v, su, sy, sv, rz, color) { this.geo(mat, new T.BoxGeometry(su, sy, sv), u, y, v, color, {rz}); }
  rod(mat, a, b, r, color, n = 6) { const [ax, az] = this.w(a[0], a[2]), [bx, bz] = this.w(b[0], b[2]); this.kit.rod(mat, [ax, this.y + a[1], az], [bx, this.y + b[1], bz], r, color, n); }
  /** A wall from (u0,v0) to (u1,v1) (axis-aligned in the frame), with door gaps [t0, t1, top] along it. */
  wall(u0, v0, u1, v1, h, t, color, gaps = [], mat = 'paint', y0 = 0, solid = true) {
    const alongU = Math.abs(u1 - u0) > Math.abs(v1 - v0), L = alongU ? u1 - u0 : v1 - v0, s = Math.sign(L) || 1;
    const piece = (a, b, ya, yb) => {
      if (b - a < .02 || yb - ya < .02) return;
      const m = (a + b) / 2 * s;
      if (alongU) this.box(mat, u0 + m, y0 + (ya + yb) / 2, v0, b - a, yb - ya, t, color, solid);
      else this.box(mat, u0, y0 + (ya + yb) / 2, v0 + m, t, yb - ya, b - a, color, solid);
    };
    let a = 0;
    for (const [g0, g1, top = 2.3, sill = 0] of [...gaps].sort((p, q) => p[0] - q[0])) { piece(a, g0, 0, h); piece(g0, g1, top, h); piece(g0, g1, 0, sill); a = g1; }
    piece(a, Math.abs(L), 0, h);
  }
  /** A glass wall between two points: black steel frame, mullions every `pitch` m. */
  glass(u0, v0, u1, v1, y0, y1, {solid = true, pitch = 2.5, frame = '#17181a', tint = '#9cc2d4', rail = 0} = {}) {
    const alongU = Math.abs(u1 - u0) > Math.abs(v1 - v0);
    if (alongU) this.box('glass', (u0 + u1) / 2, (y0 + y1) / 2, v0, Math.abs(u1 - u0), y1 - y0, .05, tint, solid);
    else this.box('glass', u0, (y0 + y1) / 2, (v0 + v1) / 2, .05, y1 - y0, Math.abs(v1 - v0), tint, solid);
    const L = alongU ? Math.abs(u1 - u0) : Math.abs(v1 - v0), n = Math.max(1, Math.round(L / pitch));
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = u0 + (u1 - u0) * t, v = v0 + (v1 - v0) * t;
      this.col('metal', u, v, y0, y1, .07, .07, frame);
    }
    for (const y of [y0 + .03, y1 - .03, ...(rail ? [rail] : [])]) {
      if (alongU) this.box('metal', (u0 + u1) / 2, y, v0, Math.abs(u1 - u0), .06, .08, frame);
      else this.box('metal', u0, y, (v0 + v1) / 2, .08, .06, Math.abs(v1 - v0), frame);
    }
  }
  /** Frameless glass balustrade with a slim top cap. */
  balustrade(u0, v0, u1, v1, y0, h = 1.05) {
    const alongU = Math.abs(u1 - u0) > Math.abs(v1 - v0), L = alongU ? Math.abs(u1 - u0) : Math.abs(v1 - v0);
    if (alongU) { this.box('glass', (u0 + u1) / 2, y0 + h / 2, v0, L, h, .03, '#b8d3dc', true); this.box('metal', (u0 + u1) / 2, y0 + h, v0, L, .04, .06, '#2a2b2e'); }
    else { this.box('glass', u0, y0 + h / 2, (v0 + v1) / 2, .03, h, L, '#b8d3dc', true); this.box('metal', u0, y0 + h, (v0 + v1) / 2, .06, .04, L, '#2a2b2e'); }
  }
  /** Solid flight of stairs rising along +u from (u0, v) by `rise` over `run`, width w. */
  stairs(u0, v, rise, run, w, color, y0 = 0, mat = 'paint') {
    const n = Math.round(rise / .18), dh = rise / n, du = run / n;
    for (let k = 0; k < n; k++) this.box(mat, u0 + du * (k + .5), y0 + dh * (k + .5), v, du, dh, w, color, true);
  }
  /** Floating treads on a steel stringer; the colliders are solid steps underneath. */
  floatStairs(u0, v, rise, run, w, color, wallSide = 1, y0 = 0) {
    const n = Math.round(rise / .18), dh = rise / n, du = run / n;
    for (let k = 0; k < n; k++) {
      const top = y0 + dh * (k + 1);
      this.box('wood', u0 + du * (k + .5), top - .045, v, du + .04, .09, w, color);
      this.solid(u0 + du * (k + .5), top / 2, v, du, top, w);
    }
    rise += y0;
    const a = [u0, y0, v + wallSide * (w / 2 + .05)], b = [u0 + run, rise, v + wallSide * (w / 2 + .05)];
    this.rod('metal', [a[0], a[1] - .1, a[2]], [b[0], b[1] - .1, b[2]], .06, '#1a1b1d', 4);
    this.rod('metal', [u0 + .2, y0 + 1, v - wallSide * (w / 2 - .05)], [u0 + run, rise + .95, v - wallSide * (w / 2 - .05)], .025, '#1a1b1d', 6);
    for (let k = 1; k < n; k += 4) this.rod('metal', [u0 + du * (k + .5), y0 + dh * (k + 1), v - wallSide * (w / 2 - .05)], [u0 + du * (k + .5), y0 + dh * (k + 1) + .95, v - wallSide * (w / 2 - .05)], .012, '#1a1b1d', 4);
  }

  /* ---- planting */
  palm(u, v, h = 14, y0 = 0, lit = false) {
    const [x, z] = this.w(u, v), y = this.y + y0;
    this.kit.cyl('wood', x, y, z, .3, h, '#86765e', 8, true, .19);
    for (let k = 0; k < 4; k++) this.kit.cyl('wood', x, y + h * (.2 + k * .2), z, .31 - k * .02, .18, '#6f604c', 8);
    this.kit.add('fabric', BLOBS[0], x, y + h + .1, z, 0, '#6d5a3c', {scale: new T.Vector3(.55, .7, .55)});
    for (let k = 0; k < 14; k++) {
      const a = k / 14 * Math.PI * 2 + (u + v) * .3, up = k % 2 ? -.12 : .18;
      this.kit.add('fabric', FRONDS[k % 3], x, y + h + .15, z, a, k % 3 ? '#56722f' : '#627f38', {rz: up});
    }
    for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28 + u; this.kit.add('fabric', FRONDS[1], x, y + h - .2, z, a, '#7a6a45', {rz: -.9, scale: new T.Vector3(.7, .7, .7)}); }   // dead fronds hanging
    if (lit) { this.uplight(u + .9, v, y0); this.kit.add('wash', washTrunk(.36, h * .6, .32), x, y, z, 0, '#fff', {keep: true}); this.pool(u + .5, v, y0 + .04, 1.4, .35); }
  }
  cypress(u, v, h = 9, y0 = 0) {
    const [x, z] = this.w(u, v);
    this.kit.add('fabric', new T.CylinderGeometry(.35, .85, h, 9), x, this.y + y0 + h / 2, z, 0, '#3a5429');
    this.kit.add('fabric', new T.ConeGeometry(.36, 1.6, 9), x, this.y + y0 + h + .75, z, 0, '#3a5429');
  }
  /** A clipped or loose shrub: a few leafy masses. */
  shrub(u, v, r = .8, y0 = 0, color = '#4d6b34', seed = 1) {
    const R = rng(seed + Math.round(u * 13 + v * 7));
    for (let k = 0; k < 3; k++) {
      const a = R() * 6.28, d = r * .45 * R(), s = r * (.6 + R() * .4);
      const [x, z] = this.w(u + Math.cos(a) * d, v + Math.sin(a) * d);
      this.kit.add('fabric', BLOBS[k % BLOBS.length], x, this.y + y0 + s * .7, z, R() * 6, k ? color : shade(color, 1.12), {scale: new T.Vector3(s, s * .8, s)});
    }
  }
  /** Ornamental grass / agave-ish tuft: thin blades fanning out. */
  grassTuft(u, v, h = .9, y0 = 0, color = '#9aa56b') {
    const [x, z] = this.w(u, v), y = this.y + y0;
    for (let k = 0; k < 7; k++) { const a = k / 7 * 6.28 + u; this.kit.rod('fabric', [x, y, z], [x + Math.cos(a) * h * .35, y + h * (.8 + (k % 3) * .1), z + Math.sin(a) * h * .35], .035, k % 2 ? color : shade(color, .85), 3); }
  }
  lavender(u, v, y0 = 0) { this.shrub(u, v, .45, y0, '#7d8a5e', 3); const [x, z] = this.w(u, v); this.kit.add('fabric', BLOBS[2], x, this.y + y0 + .62, z, 0, '#8a7bb0', {scale: new T.Vector3(.4, .16, .4)}); }
  /** An olive tree: a forked grey trunk and silver-green masses. */
  olive(u, v, h = 4.2, y0 = 0, seed = 1) {
    const [x, z] = this.w(u, v), y = this.y + y0, R = rng(seed + Math.round(u * 31 + v * 17));
    const fork = [x + (R() - .5) * .4, y + h * .45, z + (R() - .5) * .4];
    this.kit.rod('wood', [x, y, z], fork, .16, '#6d6558', 6);
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * 6.28 + R(), tip = [fork[0] + Math.cos(a) * 1.1, y + h * (.75 + R() * .1), fork[2] + Math.sin(a) * 1.1];
      this.kit.rod('wood', fork, tip, .09, '#6d6558', 5);
      this.kit.add('fabric', BLOBS[k], tip[0], tip[1] + .35, tip[2], R() * 6, k % 2 ? '#8b9a70' : '#7e8f66', {scale: new T.Vector3(1.35, .8, 1.35)});
    }
    this.kit.add('fabric', BLOBS[3], fork[0], y + h * .95, fork[2], 0, '#879772', {scale: new T.Vector3(1.5, .9, 1.5)});
  }
  rock(u, v, y, s, color = '#8c8579', k = 0, turn = 0) { const [x, z] = this.w(u, v); this.kit.add('rock', ROCKS[k % ROCKS.length], x, this.y + y, z, turn, color, {scale: new T.Vector3(s, s, s * (.8 + (k % 3) * .15))}); }
  /** Night light washes. `n` is the wall's outward normal in the frame (u, v). */
  pool(u, v, y, r, I = .5, color) { this.geo('wash', washDisc(r, I, color), u, y + .015, v, '#fff', {keep: true}); }
  scallop(u, v, y, n, w = 2.4, h = 3.5, I = .55, color) { this.geo('wash', washFan(w, h, I, color), u + n[0] * .03, y, v + n[1] * .03, '#fff', {keep: true, turn: Math.atan2(-n[0], n[1])}); }
  /** A still water surface (pool, spa, water table) from (u0,v0) to (u1,v1) at
   *  height y, and a swimmable volume down to `floor` (world.js: swimming, a
   *  car that rolls in). */
  water(u0, v0, u1, v1, y, color, floor = y - .3, {swim = true, tint = '#1f8fb0'} = {}) {
    const su = Math.abs(u1 - u0), sv = Math.abs(v1 - v0), cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    this.geo('poolwater', new T.PlaneGeometry(su, sv, Math.max(1, Math.round(su / 2)), Math.max(1, Math.round(sv / 2))).rotateX(-Math.PI / 2), cu, y, cv, color);
    const [x, z] = this.w(cu, cv);
    if (swim) this.kit.waters.push({x, z, fx: this.fx, fz: this.fz, hl: su / 2, hw: sv / 2, y: this.y + y, floor: this.y + floor, tint});
  }
  /** A round water surface (a spa). */
  waterDisc(u, v, r, y, color, floor) {
    this.geo('poolwater', new T.CircleGeometry(r, 32).rotateX(-Math.PI / 2), u, y, v, color);
    const [x, z] = this.w(u, v);
    this.kit.waters.push({x, z, r, y: this.y + y, floor: this.y + floor, tint: '#2a9fc0'});
  }
  /** An ambient sound source (world/ambience.js). */
  sound(kind, u, v, y, r) { const [x, z] = this.w(u, v); this.kit.sounds.push({kind, x, y: this.y + y, z, r}); }
  /** Live flames (night only; kit 'flame'): crossed sheets along the line (u0,v0)-(u1,v1) at height y. */
  fire(u0, v0, u1, v1, y, h = .55, light = false) {
    const L = Math.hypot(u1 - u0, v1 - v0), n = Math.max(1, Math.round(L / .42)), th = Math.atan2(v1 - v0, u1 - u0);
    for (let k = 0; k < n; k++) {
      const t = (k + .5) / n, u = u0 + (u1 - u0) * t, v = v0 + (v1 - v0) * t, seed = ((k * 7919) % 97) / 97, hk = h * (.8 + ((k * 37) % 11) / 25);
      for (const [turn, w] of [[0, .62], [Math.PI / 3, .4], [-Math.PI / 3, .4]]) {
        const g = new T.PlaneGeometry(w, hk).translate(0, hk / 2, 0), c = new Float32Array(12), p = g.attributes.position;
        for (let i = 0; i < 4; i++) c.set([p.getX(i) / w + .5, p.getY(i) / hk, seed], i * 3);
        g.setAttribute('color', new T.BufferAttribute(c, 3));
        this.geo('flame', g, u, y, v, '#fff', {keep: true, turn: -th + turn});
      }
    }
    const [x, z] = this.w((u0 + u1) / 2, (v0 + v1) / 2);
    this.kit.sounds.push({kind: 'fire', x, y: this.y + y, z, r: light ? 14 : 7});
    if (light) this.kit.fires.push({x, y: this.y + y + .6, z});
  }
  /** Night fixtures. */
  uplight(u, v, y0 = 0) { this.cyl('metal', u, v, y0, .09, .12, '#1b1c1e', 8); this.cyl('glow', u, v, y0 + .12, .065, .015, '#ffe2b0', 8); }
  bollard(u, v, y0 = 0) { this.col('metal', u, v, y0, y0 + .75, .14, .14, '#1d1e20', true); this.box('glow', u, y0 + .62, v, .145, .08, .145, '#ffe0b0'); this.pool(u, v, y0 + .05, 1.7, .4); }
  downlight(u, v, y, floor = null, r = 1.5, I = .32) { this.cyl('glow', u, v, y - .02, .09, .02, '#fff1dc', 10); if (floor !== null) this.pool(u, v, floor, r, I); }
}
const shade = (hex, k) => '#' + new T.Color(hex).multiplyScalar(k).getHexString();

/* ------------------------------------------------------------ furniture (in a sub-frame facing +u) */
/** Sofa: base, seat cushions, back and arms. Facing +u, centred, length L along v. */
function sofa(F, L = 2.4, c = '#e6e1d8', base = '#3a332c', y0 = 0) {
  F.rect('wood', -.45, -L / 2, .45, L / 2, y0, y0 + .12, base);
  F.rbox('fabric', 0, y0 + .28, 0, .9, .3, L, .06, shade(c, .92));
  const n = Math.max(1, Math.round((L - .4) / .8)), w = (L - .4) / n;
  for (let k = 0; k < n; k++) {
    const v = -L / 2 + .2 + w * (k + .5);
    F.rbox('fabric', .05, y0 + .5, v, .72, .16, w - .02, .07, c);
    F.rbox('fabric', -.33, y0 + .72, v, .24, .5, w - .04, .1, c, {rz: .12});
  }
  for (const s of [-1, 1]) F.rbox('fabric', 0, y0 + .4, s * (L / 2 - .1), .9, .5, .2, .07, shade(c, .95));
  F.rbox('fabric', .1, y0 + .72, -L / 2 + .45, .35, .3, .12, .05, '#b98a58', {turn: .2});
}
function armchair(F, c = '#c9b79a', y0 = 0) { sofa(F, 1.05, c, '#2e2924', y0); }
function table(F, su, sv, h, top = '#6f4c33', legs = '#1b1c1e', y0 = 0, mat = 'wood') {
  F.box(mat, 0, y0 + h - .025, 0, su, .05, sv, top);
  for (const a of [-1, 1]) for (const b of [-1, 1]) F.col('metal', a * (su / 2 - .12), b * (sv / 2 - .12), y0, y0 + h - .05, .05, .05, legs);
}
function chair(F, c = '#d9d2c5', y0 = 0) {
  for (const a of [-1, 1]) for (const b of [-1, 1]) F.col('metal', a * .2, b * .2, y0, y0 + .45, .035, .035, '#1b1c1e');
  F.rbox('fabric', 0, y0 + .48, 0, .48, .07, .48, .03, c);
  F.rbox('fabric', -.23, y0 + .78, 0, .06, .55, .46, .03, c, {rz: .08});
}
function stool(F, c = '#2a2a2c', y0 = 0) {
  F.cyl('metal', 0, 0, y0, .03, .72, '#1b1c1e', 6); F.cyl('metal', 0, 0, y0, .2, .02, '#1b1c1e', 12);
  F.geo('fabric', new T.CylinderGeometry(.2, .19, .07, 14), 0, y0 + .75, 0, c);
}
function bed(F, L = 2.2, W = 2.1, sheets = '#f1eee8', throwC = '#6f7d8c', y0 = 0) {
  F.rect('wood', -L / 2, -W / 2, L / 2, W / 2, y0, y0 + .25, '#5a3f2b');
  F.rbox('fabric', .02, y0 + .38, 0, L - .06, .26, W - .08, .08, sheets);
  F.rbox('fabric', .45, y0 + .53, 0, L * .45, .06, W - .02, .03, throwC);
  for (const s of [-1, 1]) F.rbox('fabric', -L / 2 + .3, y0 + .6, s * W / 4, .35, .18, W / 2 - .15, .08, '#f7f5f0');
  F.rbox('fabric', -L / 2 - .06, y0 + .75, 0, .14, 1.05, W + .2, .05, '#d6cfc2');
}
function lampTable(F, y0 = 0, glowC = '#ffe7c4') {
  F.rbox('wood', 0, y0 + .25, 0, .45, .5, .45, .03, '#4c3526');
  F.cyl('metal', 0, 0, y0 + .5, .05, .25, '#bfa77a', 8); F.geo('glow', new T.CylinderGeometry(.13, .17, .2, 16), 0, y0 + .85, 0, glowC);
}
function floorLamp(F, y0 = 0) {
  F.cyl('metal', 0, 0, y0, .16, .02, '#1b1c1e', 12); F.cyl('metal', 0, 0, y0, .02, 1.5, '#1b1c1e', 6);
  F.geo('glow', new T.CylinderGeometry(.18, .24, .32, 16), 0, y0 + 1.6, 0, '#ffe5bf');
}
function pendant(F, u, v, drop, ceil, r = .16, c = '#ffe9c8') {
  F.rod('metal', [u, ceil, v], [u, ceil - drop, v], .008, '#111', 4);
  F.geo('glow', new T.SphereGeometry(r, 14, 10), u, ceil - drop - r * .8, v, c);
}
function plantPot(F, u, v, y0 = 0, h = 1.2) {
  F.cyl('stone', u, v, y0, .3, .5, '#3c3a37', 14, false, .36);
  F.shrub(u, v, .45, y0 + .45, '#3f6a34', 9);
  F.kit.add('fabric', BLOBS[1], ...(() => { const [x, z] = F.w(u, v); return [x, F.y + y0 + h, z]; })(), 0, '#4a7a3a', {scale: new T.Vector3(.4, .5, .4)});
}
function rug(F, u, v, su, sv, c, y0 = 0) { F.box('fabric', u, y0 + .01, v, su, .02, sv, c); F.box('fabric', u, y0 + .012, v, su - .3, .02, sv - .3, shade(c, 1.1)); }
function art(F, u, v, y, su, sv, c1, c2, face) {
  // A canvas on a wall; `face` is the wall's normal axis ('u' or 'v') and sign.
  const [ax, s] = face;
  if (ax === 'u') { F.box('paint', u, y, v, .04, su, sv, '#141414'); F.box('paint', u + s * .025, y, v, .01, su - .12, sv - .12, c1); F.box('paint', u + s * .03, y - su * .15, v + sv * .12, .01, su * .35, sv * .45, c2); }
  else { F.box('paint', u, y, v, sv, su, .04, '#141414'); F.box('paint', u, y, v + s * .025, sv - .12, su - .12, .01, c1); F.box('paint', u + sv * .12, y - su * .15, v + s * .03, sv * .45, su * .35, .01, c2); }
}
function lounger(F, c = '#f4f2ec', y0 = 0) {
  F.rect('wood', -.95, -.36, .95, .36, y0 + .22, y0 + .28, '#8a5f3c');
  for (const a of [-.85, .85]) for (const b of [-.3, .3]) F.col('wood', a, b, y0, y0 + .22, .06, .06, '#7a5234');
  F.rbox('fabric', .3, y0 + .34, 0, 1.3, .1, .66, .04, c);
  F.rbox('fabric', -.7, y0 + .6, 0, .7, .1, .66, .04, c, {rz: -.85});
  F.rbox('fabric', -.45, y0 + .5, 0, .2, .12, .5, .05, '#d8c6a4', {rz: -.85});
}
function umbrella(F, u, v, y0 = 0, c = '#efe9dc') {
  F.cyl('stone', u, v, y0, .3, .12, '#2b2b2d', 12); F.cyl('metal', u, v, y0, .035, 2.6, '#d9d6cf', 6);
  F.geo('fabric', new T.ConeGeometry(1.6, .55, 8, 1, true), u, y0 + 2.55, v, c);
}
/** Kitchen run along a wall: base cabinets, stone top, backsplash, uppers or open shelf. Faces +u, length L along v. */
function kitchenRun(F, L, y0 = 0) {
  F.rect('wood', -.32, -L / 2, .32, L / 2, y0 + .1, y0 + .88, '#5b3e2a');
  F.rect('paint', -.3, -L / 2, .28, L / 2, y0, y0 + .1, '#141414');
  F.rect('gloss', -.34, -L / 2 - .02, .36, L / 2 + .02, y0 + .88, y0 + .92, '#efece6');
  for (let k = 1; k < L / .6; k++) F.box('paint', .325, y0 + .5, -L / 2 + k * .6, .01, .7, .008, '#2c1f16');
  F.box('paint', .33, y0 + .8, 0, .01, .02, L - .2, '#b9a27a');
  F.rect('gloss', -.34, -L / 2, -.3, L / 2, y0 + .92, y0 + 1.5, '#e9e6df');
  F.rect('wood', -.34, -L / 2, 0, L / 2, y0 + 1.5, y0 + 2.3, '#5b3e2a');
  F.box('glow', .005, y0 + 1.48, 0, .02, .02, L - .2, '#fff0d8');                      // under-cabinet strip
  F.rect('paint', -.2, -.45, .2, .45, y0 + .92, y0 + .94, '#1a1a1b');                   // cooktop
}

/** Grand piano, keyboard toward -u. */
function piano(F, y0 = 0) {
  F.geo('gloss', rboxGeo(2.1, .32, 1.5, .5), .15, y0 + .82, 0, '#0c0c0d');
  F.tilt('gloss', .35, y0 + 1.25, -.2, 1.6, .03, 1.1, .45, '#0c0c0d');
  F.rect('gloss', -1, -.72, -.75, .72, y0 + .62, y0 + .98, '#0c0c0d');
  F.rect('paint', -1.02, -.66, -.84, .66, y0 + .9, y0 + .93, '#f4f2ea');
  for (let k = 0; k < 36; k++) F.rect('paint', -1.0, -.64 + k * .036, -.9, -.64 + k * .036 + .018, y0 + .93, y0 + .95, '#111');
  for (const [a, b] of [[-.8, -.6], [-.8, .6], [.9, 0]]) F.col('gloss', a, b, y0, y0 + .66, .1, .1, '#0c0c0d');
  F.rbox('fabric', -1.55, y0 + .47, 0, .38, .1, .85, .03, '#161616'); F.rect('gloss', -1.7, -.4, -1.4, .4, y0, y0 + .42, '#0c0c0d');
}
/** Pool table, long along u. */
function poolTable(F, y0 = 0) {
  F.rect('wood', -1.45, -.8, 1.45, .8, y0 + .55, y0 + .8, '#4a2f1e');
  F.rect('fabric', -1.3, -.65, 1.3, .65, y0 + .8, y0 + .82, '#1f5a3f');
  for (const [a, b, c, d] of [[-1.45, -.8, 1.45, -.65], [-1.45, .65, 1.45, .8], [-1.45, -.8, -1.3, .8], [1.3, -.8, 1.45, .8]]) F.rect('wood', a, b, c, d, y0 + .8, y0 + .86, '#4a2f1e');
  for (const a of [-1.2, 0, 1.2]) for (const b of [-.6, .6]) F.col('wood', a, b, y0, y0 + .55, .16, .16, '#3a2416');
  const balls = ['#f5f5f0', '#e8c21c', '#1f3f9c', '#c8261c', '#5b2a86', '#e2701c', '#1f7a3c', '#111'];
  balls.forEach((c, k) => F.geo('gloss', new T.SphereGeometry(.03, 10, 8), .5 + (k % 3) * .07, y0 + .855, -.1 + Math.floor(k / 3) * .07 - (k % 3) * .035, c));
  F.rod('wood', [-1, y0 + .85, .3], [.6, y0 + .85, .45], .012, '#c9a36a', 5);
}
/** Bookcase against a wall facing +u, length L along v, height h. */
function bookcase(F, L, h, y0 = 0, frame = '#2b2521') {
  F.rect('wood', -.2, -L / 2, .2, L / 2, y0, y0 + h, frame);
  const R = rng(Math.round(L * 100 + h * 10));
  for (let y = y0 + .35; y < y0 + h - .2; y += .42) {
    F.rect('wood', -.18, -L / 2 + .04, .21, L / 2 - .04, y - .025, y, shade(frame, 1.25));
    for (let v = -L / 2 + .1; v < L / 2 - .15;) {
      const w = .03 + R() * .04, hh = .22 + R() * .12;
      if (R() < .12) { v += .25; continue; }
      if (R() < .06) { F.geo('stone', new T.SphereGeometry(.08, 10, 8), 0, y + .08, v + .1, '#c9b48f'); v += .3; continue; }
      F.rect('paint', -.14, v, .16, v + w, y, y + hh, ['#8c3b2e', '#264b6b', '#d9cfb8', '#3d5b3a', '#2a2a2a', '#b88a4a', '#e8e4da'][Math.floor(R() * 7)]);
      v += w + .004;
    }
  }
}
function sideboard(F, L, y0 = 0) {
  F.rect('wood', -.25, -L / 2, .25, L / 2, y0 + .12, y0 + .82, '#5b3e2a');
  for (let k = 1; k < 4; k++) F.rect('paint', .25, -L / 2 + L * k / 4 - .005, .26, -L / 2 + L * k / 4 + .005, y0 + .15, y0 + .8, '#2c1f16');
  F.rect('metal', -.2, -L / 2 + .1, .2, L / 2 - .1, y0, y0 + .12, '#1b1c1e');
  F.cyl('gloss', 0, -L / 3, y0 + .82, .12, .35, '#e9e5dc', 14, false, .07);
  F.geo('stone', new T.SphereGeometry(.14, 12, 8), 0, y0 + .96, L / 4, '#8a8578');
}
/** A big indoor tree (fiddle-leaf fig / olive) in a stone pot. */
function bigPlant(F, u, v, y0 = 0, h = 2.4) {
  F.cyl('stone', u, v, y0, .38, .6, '#d8d2c6', 16, false, .45);
  F.rod('wood', [u, y0 + .5, v], [u + .1, y0 + h * .75, v + .05], .04, '#5b4a3a', 5);
  for (let k = 0; k < 5; k++) { const a = k * 1.3, [x, z] = F.w(u + Math.cos(a) * .3, v + Math.sin(a) * .3); F.kit.add('fabric', BLOBS[k % 4], x, F.y + y0 + h * (.6 + k * .09), z, a, k % 2 ? '#3f6b30' : '#4b7a38', {scale: new T.Vector3(.45, .42, .45)}); }
}
function vase(F, u, v, y) {
  F.cyl('gloss', u, v, y, .09, .32, '#f1efe9', 12, false, .13);
  for (let k = 0; k < 6; k++) { const a = k * 1.05; F.rod('fabric', [u, y + .3, v], [u + Math.cos(a) * .18, y + .6, v + Math.sin(a) * .18], .01, '#4b6b33', 3); F.geo('fabric', BLOBS[k % 4], u + Math.cos(a) * .18, y + .62, v + Math.sin(a) * .18, k % 2 ? '#f3f0ea' : '#e8b7c0', {scale: new T.Vector3(.07, .06, .07)}); }
}
function pedestal(F, u, v, y0, kind = 0) {
  F.rect('stucco', u - .3, v - .3, u + .3, v + .3, y0, y0 + 1.05, '#ece8e0');
  // A slender bronze spindle, a polished knot, a marble egg.
  if (kind === 0) F.geo('metal', new T.LatheGeometry([[.001, 0], [.06, .05], [.11, .35], [.07, .75], [.03, 1.05], [.001, 1.1]].map(([r, y]) => new T.Vector2(r, y)), 20), u, y0 + 1.05, v, '#a77c43');
  else if (kind === 1) F.geo('metal', new T.TorusKnotGeometry(.16, .045, 64, 8, 2, 3), u, y0 + 1.3, v, '#b08d57');
  else F.geo('gloss', new T.SphereGeometry(.2, 20, 14), u, y0 + 1.3, v, '#eeeae3', {scale: new T.Vector3(1, 1.3, 1)});
}
function treadmill(F, y0 = 0) {
  F.rect('paint', -.9, -.4, .9, .4, y0, y0 + .2, '#2a2b2e'); F.rect('fabric', -.85, -.3, .85, .3, y0 + .2, y0 + .22, '#141414');
  for (const s of [-1, 1]) F.rod('metal', [.75, y0 + .2, s * .35], [.85, y0 + 1.25, s * .35], .025, '#8d8f93');
  F.rect('paint', .75, -.4, .95, .4, y0 + 1.2, y0 + 1.35, '#1d1e20'); F.rect('glow', .74, -.2, .75, .2, y0 + 1.24, y0 + 1.32, '#8fd0ff');
}

/** Seven-segment digits (house numbers), halo-lit, on a face whose normal is -u. */
function houseNumber(F, u, y, v, text, H = .42) {
  const W = H * .55, t = H * .11, SEG = {a: [0, H / 2, 1], b: [W / 2, H / 4, 0], c: [W / 2, -H / 4, 0], d: [0, -H / 2, 1], e: [-W / 2, -H / 4, 0], f: [-W / 2, H / 4, 0], g: [0, 0, 1]};
  const MAP = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
  [...text].forEach((ch, i) => {
    const dv = (i - (text.length - 1) / 2) * W * 1.7;
    for (const s of MAP[+ch]) {
      const [x, yy, horiz] = SEG[s];
      F.box('glow', u, y + yy, v + dv + x, .03, horiz ? t : H / 2, horiz ? W : t, '#ffcf8a');
    }
  });
}

/* ------------------------------------------------------------ planning */
export function planHomes(places) {
  const g = places.ground;
  for (const h of HOMES) {
    const [fx, fz] = h.f, l = Math.hypot(fx, fz), ux = fx / l, uz = fz / l, cu = h.setback + h.depth / 2;
    const cx = h.road[0] + ux * cu, cz = h.road[1] + uz * cu;
    g.addPad({cx, cz, fx: ux, fz: uz, hl: h.depth / 2 + 1, hw: h.width / 2 + 1, y: h.y + .12, margin: h.margin});
    // Dug pools: a lowered pad inside the house pad (applied after it).
    for (const d of h.dig || []) {
      const u = h.setback + d.u;
      g.addPad({cx: h.road[0] + ux * u - uz * d.v, cz: h.road[1] + uz * u + ux * d.v, fx: ux, fz: uz, hl: d.hl, hw: d.hw, y: h.y + .12 + d.y, margin: d.margin});
    }
    for (const d of h.hard || []) {
      const u = h.setback + (d.u0 + d.u1) / 2, v = (d.v0 + d.v1) / 2;
      g.addPad({cx: h.road[0] + ux * u - uz * v, cz: h.road[1] + uz * u + ux * v, fx: ux, fz: uz, hl: (d.u1 - d.u0) / 2, hw: (d.v1 - d.v0) / 2, y: h.y + .12 + d.y, margin: d.margin || 0, hard: true, cap: !!d.cap});
    }
    RESERVED.push({x: cx, z: cz, r: Math.hypot(h.depth, h.width) / 2 + (h.id === 'mansion' ? 26 : 8)});
    h.pad = {cx, cz, y: h.y + .12};
    places.homes.push(h);
    places.pois.push({name: h.name, kind: 'home', x: cx, z: cz});
  }
  places.extras.push(kit => { for (const h of HOMES) h.build(Frame.lot(kit, h, h.y + .12), h, places); });
}

/* ------------------------------------------------------------ hillside podium */
/** Terraced stone retaining walls stepping down the hill from a lot edge.
 *  The edge runs from (u, v) along `t` for L metres; `n` points outward (both
 *  unit vectors in the frame). Tier 0 is a planted strip with a parapet at
 *  its outer face; each lower tier steps out `tw` and down `th`, a solid
 *  stone mass to the hillside, planted on top, lit at its foot. */
function podium(F, g, e, {first = 4.5, tw = 3.4, th = 4.3, col = 4, maxT = 7, parapet = 'glass'} = {}) {
  const [tu, tv] = e.t, [nu, nv] = e.n, stoneC = '#b8ab97', cap = '#e9e4da', soil = '#4a3b2b';
  const gy = (u, v) => { const [x, z] = F.w(u, v); return g.height(x, z) - F.y; };
  const P = (s, o) => [e.u + tu * s + nu * o, e.v + tv * s + nv * o];
  // A block from the edge offset o0..o1 and along s0..s1 (in the edge's axes), y0..y1.
  const block = (mat, s0, s1, o0, o1, y0, y1, color, solid = true) => {
    const [u0, v0] = P(s0, o0), [u1, v1] = P(s1, o1);
    F.rect(mat, Math.min(u0, u1), Math.min(v0, v1), Math.max(u0, u1), Math.max(v0, v1), y0, y1, color, solid);
  };
  const R = rng(e.seed || 3), ext = e.ext || (() => [0, 0]), E = Math.max(...Array.from({length: maxT + 1}, (_, k) => Math.max(...ext(k))));
  let cols = 0;
  for (let s = -Math.ceil(E / col) * col; s < e.L + E; s += col) {
    const range = k => { const [a, b] = k ? ext(k) : [0, 0], s0 = Math.max(s, -a), s1 = Math.min(s + col, e.L + b); return s1 - s0 > .2 ? [s0, s1] : null; };
    const foot = (o, s0 = s, s1 = s + col) => Math.min(gy(...P(s0, o)), gy(...P((s0 + s1) / 2, o)), gy(...P(s1, o)));
    // Tier 0: soil strip to the parapet, the parapet down to the hill.
    const r0 = range(0);
    if (r0) {
      const [s0, s1] = r0, sm = (s0 + s1) / 2, f0 = Math.min(foot(first + .6, s0, s1), -.4);
      block('grass', s0, s1, 0, first - .45, -.6, .07, '#556f3a', true);
      block('stone', s0, s1, first - .5, first, f0 - 1.2, parapet === 'glass' ? .45 : .75, stoneC);
      block('stucco', s0, s1, first - .55, first + .05, parapet === 'glass' ? .45 : .75, parapet === 'glass' ? .55 : .85, cap, false);
      if (parapet === 'glass') { const [a0, b0] = P(s0, first - .25), [a1, b1] = P(s1, first - .25); F.balustrade(a0, b0, a1, b1, .55, .75); }
      const [pu, pv] = P(sm, first * .45);
      if (e.plant0 === 'hedge') { F.rbox('fabric', pu, .8, pv, Math.abs(tu) * (s1 - s0 + .3) + Math.abs(nu) * 1.3, 1.6, Math.abs(tv) * (s1 - s0 + .3) + Math.abs(nv) * 1.3, .5, '#3d5a2d'); if (R() < .3) F.cypress(pu, pv, 6 + R() * 2, .05); }
      else if (R() < .6) F.grassTuft(pu + (R() - .5) * 2, pv + (R() - .5) * 2, .8, .05); else F.lavender(pu, pv, .05);
      cols++;
    }
    // Lower tiers.
    for (let k = 1; k <= maxT; k++) {
      const rk = range(k); if (!rk) continue;
      const [s0, s1] = rk, sm = (s0 + s1) / 2;
      const o0 = first + (k - 1) * tw, o1 = o0 + tw, t = -k * th, f = foot(o1 + .5, s0, s1);
      if (foot(o0 + .3, s0, s1) >= t - .2) break;                           // the hill already stands at this step
      const last = k === maxT || foot(o1 + .3, s0, s1) >= t - th - .2;
      block('stone', s0, s1, o0 - .05, o1, Math.min(f, t) - 1.5, t + .12, stoneC);
      block('stucco', s0, s1, o1 - .35, o1 + .04, t + .12, t + .26, cap, false);
      block('grass', s0, s1, o0, o1 - .35, t + .12, t + .16, soil, false);
      const [qu, qv] = P(sm + (R() - .5) * (s1 - s0) * .5, o0 + tw * .45);
      const r = R();
      if (r < .18 && k < 3) F.olive(qu, qv, 3.6, t + .15, k * 7 + Math.round(s));
      else if (r < .32) F.cypress(qu, qv, 6 + R() * 3, t + .15);
      else { F.shrub(qu, qv, .9 + R() * .5, t + .15, R() < .5 ? '#4c6a33' : '#5d7a3e', Math.round(s) + k); F.grassTuft(qu + nu * .8 + tu, qv + nv * .8 + tv, .8, t + .15); }
      // Rosemary spilling over the lip, an uplight at the foot of the wall above.
      const [lu, lv] = P(sm, o1 - .5);
      if (R() < .55) F.rbox('fabric', lu, t + .2, lv, Math.abs(tu) * (s1 - s0) * .8 + Math.abs(nu) * .7, .5, Math.abs(tv) * (s1 - s0) * .8 + Math.abs(nv) * .7, .2, '#566f3c');
      if ((Math.round(s / col) + k) % 2 === 0) { const [wu, wv] = P(sm, o0 + .35), [fu, fv] = P(sm, o0); F.uplight(wu, wv, t + .14); F.scallop(fu, fv, t + .14, [nu, nv], 2.8, th * .95, .55); }
      if (last) {
        // Boulders along the foot where the wall meets the hill.
        for (let b = 0; b < 3; b++) {
          const [bu, bv] = P(s0 + R() * (s1 - s0), o1 + .8 + R() * 2.2), by = gy(bu, bv);
          F.rock(bu, bv, by + .15, .7 + R() * 1.1, R() < .5 ? '#7e776c' : '#6c665d', b + k, R() * 6);
        }
        break;
      }
    }
  }
  return cols;
}

/* ------------------------------------------------------------ Mulholland Estate */
function mansion(F, H, places) {
  const D = H.depth, Wd = H.width, hw = Wd / 2, g = places.ground;
  const white = '#f1efe9', steel = '#18191b', teak = '#946440', oak = '#c9a577', trav = '#ddd4c3', conc = '#cdc8bd', corten = '#80462a', lawn = '#6c8c43', skin = '#f4eee4';
  const first = 4.5, tw = 3.4, u1Lawn = 56, E = hw + first, stoneC = '#b8ab97';
  // Mulholland climbs ~18% across the frontage: the street is 6 m below the lot
  // at the west corner and 7 m above it at the east one, level only in the
  // middle. So the gate is in the middle, and the street wall is a retaining
  // wall that follows the road (planHomes levels the lot hard up to it).
  const roadY = v => { const [x, z] = F.w(-1.2, v), r = places.model.nearest(x, z); return r ? r.y - F.y : 0; };
  const gw = 7, gv = 0, mouth = gw / 2 + .3;
  // ---- the ground: solid lawn everywhere but the gate mouth, then the podium stepping down three sides.
  for (const [a, b, c, d] of [[.6, -hw, u1Lawn, -mouth], [6.2, -mouth, u1Lawn, mouth], [.6, mouth, u1Lawn, hw], [u1Lawn, -hw, D, -41.5], [u1Lawn, 30, D, hw]]) F.rect('grass', a, b, c, d, -.25, .04, lawn, true);
  podium(F, g, {u: D, v: -hw, t: [0, 1], n: [1, 0], L: Wd, seed: 5, ext: k => [first + k * tw, first + k * tw]}, {first, tw});
  podium(F, g, {u: 0, v: -hw, t: [1, 0], n: [0, -1], L: D + first, seed: 7, plant0: 'hedge', ext: k => [0, (k - 1) * tw]}, {first, tw, parapet: 'wall'});
  podium(F, g, {u: 0, v: hw, t: [1, 0], n: [0, 1], L: D + first, seed: 9, plant0: 'hedge', ext: k => [0, (k - 1) * tw]}, {first, tw, parapet: 'wall'});
  // Where the hill outside stands above the lot (the east corner, up by the
  // road), a coursed stone retaining wall holds it back, planted along its top.
  for (let u = .6; u < D + first - .1; u += 3) {
    const u1 = Math.min(D + first, u + 3), [x0, z0] = F.w(u, E + 1.6), [x1, z1] = F.w(u1, E + 1.6);
    const top = Math.max(g.height(x0, z0), g.height(x1, z1)) - F.y;
    if (top < .5) continue;
    F.rect('stone', u, E - 2.95, u1, E + .08, -.6, top + .15, stoneC, true);
    F.rect('stucco', u - .02, E - 2.99, u1 + .02, E - 2.6, top + .15, top + .27, '#e9e4da');
    F.rect('grass', u, E - 2.6, u1, E + .08, top + .1, top + .2, '#4a3b2b');
    F.rbox('fabric', (u + u1) / 2, top + .45, E - 1.3, u1 - u, .7, 1.8, .25, Math.round(u) % 2 ? '#566f3c' : '#4c6a33');
    if (top > 1.6) F.rbox('fabric', (u + u1) / 2, top - .2, E - 3.05, u1 - u, .7, .3, .12, '#566f3c');
    if (Math.round(u / 3) % 2 === 0) { F.uplight((u + u1) / 2, E - 3.3, .04); F.scallop((u + u1) / 2, E - 2.96, .04, [0, -1], 2.6, Math.min(top, 5), .5); }
  }

  // ---- the street wall. West of the gate the lot stands over the road: coursed
  // stone up from the verge, a stucco garden wall on top. East of it the road
  // stands over the lot: stone facing the garden, a stucco parapet and corten
  // panels along the road. Stepped in bays, the way a wall on a hill is built.
  const bay = 3.6;
  const run = (a0, a1, east) => {
    const n = Math.max(1, Math.round((a1 - a0) / bay)), L = (a1 - a0) / n;
    for (let k = 0; k < n; k++) {
      const a = a0 + k * L, b = a + L, ra = roadY(a), rb = roadY(b), lo = Math.min(ra, rb), hi = Math.max(ra, rb);
      if (!east) {
        F.rect('stone', .1, a, .6, b, lo - 1, .05, stoneC, true);
        F.rect('stucco', .15, a, .55, b, .05, 2.4, white, true);
        F.rect('stucco', .1, a - .01, .6, b + .01, 2.4, 2.5, '#e6e2da');
        F.rect('stucco', -.02, b - .35, .7, b + .35, lo - .8, 2.65, white, true);           // pier
        if (hi < -.4) F.rect('stone', -.25, a + .05, .1, b - .05, lo - 1, lo + .12, '#a89c88');   // footing along the verge
        F.scallop(-.03, b, Math.max(0, hi), [-1, 0], 1.4, 2.6 - Math.max(0, hi), .5);
      } else {
        // A 3 m stone mass: the bank's 2 m terrain triangles end inside it.
        const top = Math.max(hi + .35, .55);
        F.rect('stone', .1, a, 3, b, -.8, top, stoneC, true);
        F.rect('grass', .55, a + .02, 2.95, b - .02, top - .1, top + .03, '#4a3b2b');
        F.rbox('fabric', 1.8, top + .45, (a + b) / 2, 1.7, 1, L * .92, .3, k % 2 ? '#4f6b36' : '#5a7540');   // clipped hedge on the wall's top
        if (k % 2) F.cypress(1.8, (a + b) / 2, 5 + (k % 3), top + .03);
        F.rect('stucco', .05, a - .01, .65, b + .01, top, top + .12, '#e6e2da');
        F.rect('stucco', .1, a, .5, b, top + .12, top + .85, white, true);                  // a low parapet you see over, down into the garden
        F.rect('stucco', .06, a - .01, .54, b + .01, top + .85, top + .93, '#e6e2da');
        if (k % 3 === 1) F.rect('paint', .09, (a + b) / 2 - .9, .1, (a + b) / 2 + .9, top + .3, top + .7, corten);   // a corten inset
        F.rect('stucco', .0, b - .3, .6, b + .3, -.8, top + 1.15, white, true);             // pier
        F.scallop(-.03, b, hi + .02, [-1, 0], 1.4, 2.2, .5);
        // Inside: ivy and a rosemary spill down the stone where it is tall.
        if (top > 1.8) { F.rbox('fabric', 3.05, top - .5, (a + b) / 2, .3, 1.1, L * .8, .12, '#4d6a34'); if (k % 2) F.rbox('fabric', 3.08, top * .45, (a + b) / 2 + L * .15, .25, top * .7, 1.3, .1, '#3f5a2c'); }
        if (k % 2 === 0) { F.uplight(3.4, (a + b) / 2, .04); F.scallop(3.01, (a + b) / 2, .04, [1, 0], 2.4, Math.min(top, 4.5), .45); }
      }
    }
  };
  run(-E, gv - gw / 2 - 1.2, false);
  run(mouth, E, true);
  // Gate pillars: the west one carries the halo-lit number, the intercom and the mail slot.
  const rl = roadY(gv - gw / 2), rr = roadY(gv + gw / 2);
  F.rect('stucco', -.3, gv - gw / 2 - 1.2, .75, gv - gw / 2, rl - 1, 3.2, white, true);
  F.rect('stucco', -.3, gv + gw / 2, .75, gv + gw / 2 + 1.2, Math.min(rr, 0) - 1, Math.max(3.2, rr + 2.6), white, true);
  houseNumber(F, -.32, 2.35, gv - gw / 2 - .6, '9161');
  F.scallop(-.31, gv - gw / 2 - .6, Math.max(0, rl), [-1, 0], 1.6, 3.1, .35);
  F.rect('metal', -.34, gv - gw / 2 - .45, -.3, gv - gw / 2 - .1, 1.15, 1.6, '#9d8a5f'); F.rect('glow', -.36, gv - gw / 2 - .4, -.34, gv - gw / 2 - .15, 1.42, 1.54, '#bfe0ff');   // intercom
  F.rect('paint', -.36, gv - gw / 2 - 1.05, -.3, gv - gw / 2 - .7, .8, 1.2, '#1f2022');                                                                                   // mail slot
  for (const [v, ry] of [[gv - gw / 2 - .6, rl], [gv + gw / 2 + .6, rr]]) { const y = Math.max(3.2, ry + 2.6); F.rect('metal', -.52, v - .2, -.3, v + .2, y - .95, y - .6, '#1b1c1e'); F.rect('glow', -.53, v - .13, -.52, v + .13, y - .9, y - .65, '#ffe2b4'); F.pool(-1.2, v, Math.min(ry, 0) + .02, 2.2, .35); }
  // The apron: a warped concrete slab from the road's crown and cross-fall up
  // to the level drive (a triangle-mesh collider, so the car rolls straight in).
  {
    const U = [-.7, .2, 1.2, 2.3, 3.4, 4.6, 6.2], V = [], grid = [];
    for (let j = 0; j <= 8; j++) V.push(-mouth + j * mouth / 4);
    const ry = V.map(v => roadY(v) + .04);
    for (const u of U) {
      let s = Math.min(1, Math.max(0, (u + .7) / 6.9)); s = s * s * (3 - 2 * s);
      grid.push(V.map((v, j) => { const [x, z] = F.w(u, v); return [x, F.y + ry[j] + (.09 - ry[j]) * s, z]; }));
    }
    F.kit.sheet('stucco', grid, conc, true);
    // Scored joints across it, and a steel drain grate where it meets the level drive.
    F.rect('metal', 5.9, -mouth, 6.2, mouth, .07, .095, '#2a2b2e');
  }
  // Side walls of the mouth: they hold the lawn on the west and the bank on the east.
  for (const s of [-1, 1]) {
    const ry = roadY(s * gw / 2), top = Math.max(1.05, ry + .9);
    F.rect('stucco', .75, s * mouth - .175, 6.2, s * mouth + .175, Math.min(ry, 0) - 1.4, top, white, true);
    F.rect('stucco', .75, s * mouth - .21, 6.2, s * mouth + .21, top, top + .08, '#e4e0d8');
  }
  // A teak sliding gate, run back open behind the west wall on its rail.
  F.rect('metal', .75, -mouth - 7.6, .95, -mouth - .2, .04, .07, '#2a2b2e');
  F.rect('wood', .8, -mouth - 7.4, .9, -mouth - .3, .1, 2.45, '#9a6a43', true);
  for (let y = .35; y < 2.45; y += .3) F.rect('paint', .9, -mouth - 7.4, .905, -mouth - .3, y, y + .012, '#5e3e25');
  for (const [a, b, c, d, e, f] of [[.78, -mouth - 7.45, .92, -mouth - .25, 2.45, 2.52], [.78, -mouth - 7.45, .92, -mouth - .25, .06, .12], [.78, -mouth - 7.45, .92, -mouth - 7.38, .06, 2.52], [.78, -mouth - .32, .92, -mouth - .25, .06, 2.52]]) F.rect('metal', a, b, c, d, e, f, steel);

  // ---- the drive and the garage apron: pale concrete with scored joints, low walls and step lights.
  F.rect('stucco', 6.2, -mouth, 18, 11, -.3, .09, conc, true);
  F.rect('stucco', 4, mouth, 6.2, 11, -.3, .09, conc, true);
  for (let u = 9, k = 0; u < 18; u += 3, k++) F.rect('line', u - .015, -mouth, u + .015, 11, .09, .095, '#8e8a82');
  F.rect('line', 6.2, .6 - .015, 18, .6 + .015, .09, .095, '#8e8a82');
  F.rect('line', 4, 4.5 - .015, 18, 4.5 + .015, .09, .095, '#8e8a82');
  {
    const v = -mouth;
    F.rect('stucco', 6.2, v - .175, 17, v + .175, -.3, .95, white, true);
    F.rect('stucco', 6.2, v - .21, 17, v + .21, .95, 1.03, '#e4e0d8');
    for (let u = 7.4; u < 17; u += 2.6) { F.rect('glow', u - .16, v + .175, u + .16, v + .185, .26, .34, '#ffe6bd'); F.pool(u, v + .45, .09, 1.1, .45); }
    for (let u = 5; u <= 17; u += 6) F.palm(u, v - 2.5, 13 + (u % 5), 0, true);
  }
  for (const [u, v] of [[21.5, 12.5], [21.5, 27.5]]) F.palm(u, v, 14, 0, true);
  // Planting in the west garden: a cypress screen inside the street wall, olives, lavender and grasses.
  for (let v = -40; v < -6; v += 3.3) F.cypress(1.8, v, 7 + (Math.abs(v) % 3));
  for (let u = 4; u < 17; u += 2.2) { F.lavender(u, -mouth - 1.2); F.grassTuft(u + 1.1, -mouth - 1.4, .9); }
  F.olive(8, -16, 4.4, 0, 3); F.olive(14, -27, 4, 0, 4); F.olive(6, -33, 3.8, 0, 11);
  for (const [u, v] of [[11, -21], [4.5, -24], [15.5, -36]]) F.shrub(u, v, 1, 0, '#4a6a34', u + v);
  for (let v = 12; v < 44; v += 3.2) F.cypress(2.4, v, 6 + (v % 3));

  // ---- motor court, water table.
  F.rect('stucco', 18, -22, 34, 11, -.3, .09, trav, true);
  for (let u = 20; u < 34; u += 2) F.rect('line', u - .012, -22, u + .012, 11, .09, .094, '#a39a8b');
  for (let v = -20; v < 11; v += 2) F.rect('line', 18, v - .012, 34, v + .012, .09, .094, '#a39a8b');
  {
    const cu = 26, cv = -13, R0 = 2.7;
    for (const [a, b, c, d] of [[-R0, -R0, R0, -R0 + .3], [-R0, R0 - .3, R0, R0], [-R0, -R0, -R0 + .3, R0], [R0 - .3, -R0, R0, R0]]) F.rect('gloss', cu + a, cv + b, cu + c, cv + d, 0, .55, '#27282a', true);
    F.rect('pool', cu - R0 + .3, cv - R0 + .3, cu + R0 - .3, cv + R0 - .3, 0, .12, '#1f3a42', true);
    F.water(cu - R0 + .3, cv - R0 + .3, cu + R0 - .3, cv + R0 - .3, .47, '#3a8a9c', .1);
    F.rect('stucco', cu - .55, cv - .55, cu + .55, cv + .55, .1, 2.5, '#d9cdb6', true);
    for (const [a, b] of [[-1.2, 0], [1.2, 0], [0, -1.2], [0, 1.2]]) { F.uplight(cu + a, cv + b, .12); F.scallop(cu + a * .46, cv + b * .46, .12, [Math.sign(a), Math.sign(b)], 1.1, 2.4, .7); }
    F.sound('fountain', cu, cv, .5, 18);
  }

  // ---- the garage: a stucco box with three bays you can drive into, two
  // doors rolled up and one closed, a polished floor, a lit workshop inside.
  {
    const G0 = 4, G1 = 20, V0g = 11, V1g = 29, Hg = 3.6, bays = [6.9, 12, 17.1];
    F.wall(G0, V0g, G1, V0g, Hg, .3, white, bays.map(u => [u - G0 - 2.1, u - G0 + 2.1, 2.7]), 'stucco');
    F.wall(G0, V1g, G1, V1g, Hg, .3, white, [], 'stucco');
    for (const u of [G0, G1]) F.wall(u, V0g, u, V1g, Hg, .3, white, [], 'stucco');
    F.rect('gloss', G0 + .15, V0g + .15, G1 - .15, V1g - .15, -.3, .1, '#8b8e91', true);                   // epoxy floor
    for (const u of bays) { F.rect('paint', u - 1.3, V0g + 1, u - 1.2, V1g - 1.5, .1, .104, '#e8c64a'); F.rect('paint', u + 1.2, V0g + 1, u + 1.3, V1g - 1.5, .1, .104, '#e8c64a'); }
    // Interior skins, lit at night; a ceiling with strip lights down each bay.
    F.wall(G0 + .16, V0g + .16, G1 - .16, V0g + .16, Hg - .1, .02, skin, bays.map(u => [u - G0 - .16 - 2.1, u - G0 - .16 + 2.1, 2.7 - .1]), 'room', .1, false);
    F.wall(G0 + .16, V0g + .16, G0 + .16, V1g - .16, Hg - .1, .02, skin, [], 'room', .1, false);
    F.wall(G1 - .16, V0g + .16, G1 - .16, V1g - .16, Hg - .1, .02, skin, [], 'room', .1, false);
    F.wall(G0 + .16, V1g - .16, G1 - .16, V1g - .16, Hg - .1, .02, skin, [], 'room', .1, false);
    F.rect('room', G0 + .15, V0g + .15, G1 - .15, V1g - .15, Hg - .06, Hg - .04, '#e9e6e0');
    for (const u of bays) { F.rect('glow', u - .06, V0g + 2, u + .06, V1g - 2, Hg - .09, Hg - .06, '#f2f6ff'); for (let v = V0g + 3; v < V1g - 2; v += 4) F.pool(u, v, .1, 2.6, .3, new T.Color('#e8eeff')); }
    // Doors: bays 1 and 2 rolled up under the ceiling, bay 3 down.
    bays.forEach((u, k) => {
      F.rect('metal', u - 2.2, V0g - .17, u + 2.2, V0g - .12, 2.7, 2.8, steel);
      if (k < 2) { F.rect('wood', u - 2.05, V0g + .4, u + 2.05, V0g + 2.9, 2.82, 2.87, teak); F.rect('metal', u - .05, V0g + 2.9, u + .05, V1g - 6, 2.9, 3, '#2a2b2e'); }
      else { F.rect('wood', u - 2.1, V0g - .1, u + 2.1, V0g - .03, .1, 2.7, teak, true); for (let y = .45; y < 2.7; y += .32) F.rect('paint', u - 2.1, V0g - .12, u + 2.1, V0g - .1, y, y + .015, '#5e3e25'); }
      for (const s of [-1, 1]) F.rect('metal', u + s * 2.15 - .05, V0g - .17, u + s * 2.15 + .05, V0g - .12, .09, 2.8, steel);
    });
    F.kit.indoor = 1;
    // Workshop along the back wall: tool cabinets with a walnut top, a lit pegboard,
    // an EV charger, tyres racked on the east wall, a shelf of helmets.
    F.rect('paint', G0 + 1, V1g - .8, G0 + 7, V1g - .16, .1, 1, '#1e1f22', true); F.rect('wood', G0 + .95, V1g - .85, G0 + 7.05, V1g - .16, 1, 1.05, '#6a4a32');
    for (let u = G0 + 1.5; u < G0 + 7; u += 1.2) for (let y = .3; y < 1; y += .23) F.rect('metal', u - .4, V1g - .82, u + .4, V1g - .8, y, y + .02, '#8d8f93');
    F.rect('paint', G0 + 1, V1g - .2, G0 + 7, V1g - .17, 1.3, 2.6, '#d5d0c6'); for (let k = 0; k < 14; k++) F.rect('metal', G0 + 1.3 + k * .4, V1g - .24, G0 + 1.36 + k * .4, V1g - .2, 1.6 + (k % 3) * .25, 2.1 + (k % 2) * .3, ['#c43d2b', '#2b2c2f', '#8d8f93'][k % 3]);
    F.rect('glow', G0 + 1, V1g - .3, G0 + 7, V1g - .24, 2.62, 2.66, '#fff3dc'); F.scallop(G0 + 4, V1g - .19, 1.05, [0, -1], 6, 1.6, .25);
    F.rect('paint', G0 + 9.2, V1g - .3, G0 + 9.7, V1g - .17, 1, 1.7, '#e9e9e6'); F.rect('glow', G0 + 9.3, V1g - .31, G0 + 9.6, V1g - .3, 1.45, 1.55, '#6fe0a0'); F.rod('metal', [G0 + 9.45, 1.1, V1g - .3], [G0 + 9.45, .6, V1g - .8], .03, '#1b1c1e');
    for (let k = 0; k < 4; k++) F.geo('rock', new T.TorusGeometry(.33, .12, 8, 18), G1 - .55, .55 + (k % 2) * .9, V1g - 2.05 - Math.floor(k / 2) * .95, '#1a1a1b', {turn: Math.PI / 2});
    F.rect('metal', G1 - .95, V1g - 3.15, G1 - .17, V1g - 1.85, .95, .99, '#2a2b2e');                // the tyre rack
    for (const v of [V1g - 3.1, V1g - 1.9]) for (const u of [G1 - .9, G1 - .22]) F.rect('metal', u - .03, v - .03, u + .03, v + .03, .1, 1.9, '#2a2b2e');
    F.rect('metal', G1 - .7, V1g - 4.2, G1 - .2, V1g - 1.8, 2.1, 2.14, '#2a2b2e');
    for (let k = 0; k < 3; k++) F.geo('gloss', new T.SphereGeometry(.16, 12, 8), G1 - .45, 2.3, V1g - 3.6 + k * .8, ['#f2f2ee', '#c43d2b', '#1c1d1f'][k]);
    F.rect('paint', G0 + .17, 14, G0 + .5, 20, .1, 2.2, '#23252a', true);                                  // storage lockers
    for (let v = 15; v < 20; v += 1) F.rect('metal', G0 + .5, v - .02, G0 + .52, v + .02, 1, 1.3, '#8d8f93');
    F.kit.indoor = 0;
    // Outside: a deep soffit over the doors with downlights; a planted roof edge.
    F.rect('stucco', 3, 9.4, 21, 29.6, Hg, 3.95, white);
    F.rect('wood', 3, 9.4, 21, V0g - .15, 3.57, Hg, teak);
    for (const u of bays) { F.downlight(u, 10.2, 3.57, .09, 2.2, .35); F.scallop(u, 10.84, .09, [0, -1], 3.6, 2.6, .12); }
    F.rect('rock', 3.4, 9.8, 20.6, 29.2, 3.95, 4.0, '#9b978f');
    H.garage = {u: 12, v: 20};
  }

  // ---- the house.
  const u0 = 34, u1 = 56, v0 = -30, v1 = 18, h1 = 3.8, y2 = h1 + .3, h2 = 3.6, fl = .24;
  F.rect('wood', u0, v0, u1, v1, 0, fl, oak, true);                                           // oak floor
  // Ground-floor walls: entrance and a tall window to the court at the front, glass to the view.
  const frontGaps = [[20, 23.2, 3.2], [2, 16, 3.5, .3]];
  F.wall(u0, v0, u0, v1, h1, .35, white, frontGaps, 'stucco');
  F.glass(u0, v0 + 2, u0, v0 + 16, .3, 3.5, {pitch: 2.35});
  F.wall(u0, v0, u1, v0, h1, .35, white, [], 'stucco');
  F.wall(u0, v1, u1, v1, h1, .35, white, [[4, 12, 3.3, .9]], 'stucco');
  F.glass(u0 + 4, v1, u0 + 12, v1, .9, 3.3, {pitch: 2});
  F.glass(u1, v0 + .2, u1, v0 + 20, fl, h1, {pitch: 2.5});
  F.glass(u1, v0 + 26, u1, v1 - .2, fl, h1, {pitch: 2.5});
  F.glass(u1 - .3, v0 + 20.2, u1 - .3, v0 + 23, fl, h1, {solid: false, pitch: 3});             // sliders stacked open
  // Warm interior skins (lit after dark) on the solid walls.
  F.wall(u0 + .19, v0, u0 + .19, v1, h1 - fl, .02, skin, frontGaps.map(([a, b, t, s = 0]) => [a, b, t - fl, Math.max(0, s - fl)]), 'room', fl, false);
  F.wall(u0, v0 + .19, u1, v0 + .19, h1 - fl, .02, skin, [], 'room', fl, false);
  F.wall(u0, v1 - .19, u1, v1 - .19, h1 - fl, .02, skin, [[4, 12, 3.3 - fl, .9 - fl]], 'room', fl, false);
  // Teak cladding round the entrance, a pivot door, a floating canopy.
  F.wall(u0 - .2, -13.5, u0 - .2, -3.2, h1, .06, teak, [[3.5, 6.7, 3.2]], 'wood', 0, false);
  for (let v = -13.4; v < -3.2; v += .34) if (v < -10.05 || v > -6.75) F.rect('paint', u0 - .245, v, u0 - .23, v + .025, 0, h1, '#4d3220');
  F.rect('wood', u0 + .05, -9.95, u0 + 1.45, -9.87, fl, 3.2, '#7b5334');
  F.rect('metal', u0 + 1.1, -9.99, u0 + 1.14, -9.83, 1.1, 2.3, '#c8b27f');
  F.rect('stucco', 27.5, -14, u0, -2.8, 3.35, 3.6, white);
  F.rect('wood', 27.5, -14, u0, -2.8, 3.32, 3.35, teak);
  for (const [a, b] of [[29.5, -11.5], [29.5, -5.5], [32, -11.5], [32, -5.5]]) F.downlight(a, b, 3.32, .09, 1.9, .4);
  for (const v of [-13, -4]) F.scallop(u0 - .24, v, 0, [-1, 0], 1.6, 3.6, .4);
  for (const v of [-13.7, -3.1]) F.rod('metal', [27.8, 3.6, v], [u0, h1 + .1, v], .025, steel, 4);
  // The slab between floors, leaving the stair void; the ceiling skin under it.
  const slab = [[33, -31, 57.5, 14.6], [33, 14.6, 37.6, 16.8], [46.4, 14.6, 57.5, 16.8], [33, 16.8, 57.5, 19], [57.5, -24, 63, 17]];
  for (const [a, b, c, d] of slab) F.rect('stucco', a, b, c, d, h1, y2, white, true);
  for (const [a, b, c, d] of slab.slice(0, 4)) F.rect('room', Math.max(a, u0 + .2), Math.max(b, v0 + .2), Math.min(c, u1 - .05), Math.min(d, v1 - .2), h1 - .03, h1 - .01, '#e2ddd4');
  F.rect('wood', u1 + .1, -24, 63, 17, h1 - .03, h1, teak);                                       // soffit under the cantilever
  for (let v = -21; v < 16; v += 3) F.downlight(60.5, v, h1 - .03, fl, 2.2, .16);
  for (let u = 36.5; u < 55; u += 3) for (let v = -27.5; v < 17; v += 3) if (!(u > 37.2 && u < 46.8 && v > 14.2)) F.downlight(u, v, h1 - .03, fl + .005, 2.3, .11);
  // Stairs: floating teak treads along the north wall, a glass rail round the void above.
  F.floatStairs(38, 15.6, y2 - fl, 8.4, 1.6, '#a97c52', 1, fl);
  // Upper floor: glass all round the long sides (teak fins to the street), stucco ends.
  const U0 = 37, U1 = 63, V0 = -24, V1 = 17;
  F.glass(U0, V0 + .15, U0, V1 - .15, y2, y2 + h2, {pitch: 1.3});
  for (let v = V0 + .4; v < V1 - .2; v += .5) F.rect('wood', U0 - .5, v - .03, U0 - .25, v + .03, y2 - .3, y2 + h2 + .1, teak);
  F.rect('metal', U0 - .55, V0, U0 - .2, V1, y2 + h2 + .1, y2 + h2 + .2, steel);
  F.wall(U0, V0, U1, V0, h2, .3, white, [], 'stucco', y2);
  F.wall(U0, V1, U1, V1, h2, .3, white, [], 'stucco', y2);
  F.glass(U1, V0 + .15, U1, V1 - .15, y2, y2 + h2, {pitch: 2.6, rail: y2 + 1.05});
  F.wall(U0, V0 + .17, U1, V0 + .17, h2, .02, skin, [], 'room', y2, false);
  F.wall(U0, V1 - .17, U1, V1 - .17, h2, .02, skin, [], 'room', y2, false);
  F.rect('room', U0 + .1, V0 + .15, U1 - .1, V1 - .15, y2 + h2 - .03, y2 + h2 - .01, '#e2ddd4');
  for (const [a, b, c, d] of [[U0, V0, U1, 14.6], [U0, 14.6, 37.6, V1], [46.4, 14.6, U1, V1]]) F.rect('wood', a, b, c, d, y2, y2 + .03, oak);   // upstairs floor finish
  F.rect('stucco', 36, -25.5, 65, 18.5, y2 + h2, y2 + h2 + .45, white);                        // roof
  F.rect('rock', 36.5, -25, 64.5, 18, y2 + h2 + .45, y2 + h2 + .5, '#a19d95');
  F.rect('wood', U1 + .05, -25.5, 65, 18.5, y2 + h2 - .03, y2 + h2, teak);
  F.rect('wood', 36, -25.5, U0 - .05, 18.5, y2 + h2 - .03, y2 + h2, teak);
  for (let v = -23; v < 17; v += 3) F.downlight(64.2, v, y2 + h2 - .03);
  for (let v = -23; v < 17; v += 4) F.scallop(U1 + .04, v, y2, [1, 0], 2, 3.4, .12);
  for (let u = 40; u < 62; u += 3.2) for (let v = -21; v < 15; v += 3.4) if (!(u < 47 && v > 13)) F.downlight(u, v, y2 + h2 - .03, y2 + .035, 2.3, .11);
  F.balustrade(37.6, 14.6, 46.4, 14.6, y2 + .03);
  F.balustrade(37.6, 14.6, 37.6, 16.8, y2 + .03);

  F.kit.indoor = 1;
  // ---- ground floor rooms (floor at fl).
  // Kitchen: a teak run on the front wall, a marble island, stools, pendants.
  kitchenRun(F.sub(u0 + .52, 7, 0, fl), 10);
  F.rect('wood', u0 + .2, 12.2, u0 + .85, 13.9, fl, fl + 2.3, '#5b3e2a');
  F.rect('metal', u0 + .86, 12.3, u0 + .88, 13.8, fl + .2, fl + 2.1, '#8d8f93');
  F.rect('wood', 38.1, 3.6, 39.3, 10.4, fl + .1, fl + .9, '#4a3324');
  F.rect('gloss', 38, 3.45, 39.4, 10.55, fl + .9, fl + .96, '#f3f1ec');
  for (const v of [3.45, 10.49]) F.rect('gloss', 38, v, 39.4, v + .06, fl, fl + .96, '#f3f1ec');
  for (const v of [4.6, 6.2, 7.8, 9.4]) stool(F.sub(40, v, Math.PI, fl), '#2c2c2e');
  for (const v of [5, 7, 9]) pendant(F, 38.7, v, 1.05, h1);
  // Dining: a long walnut table, eight chairs, a linear pendant.
  table(F.sub(49, 8, 0, fl), 4.2, 1.15, .76, '#5d3f2b');
  for (let k = 0; k < 4; k++) for (const s of [-1, 1]) chair(F.sub(47.4 + k * 1.07, 8 + s * .95, s > 0 ? -Math.PI / 2 : Math.PI / 2, fl), '#e0d9cc');
  F.rect('glow', 47.6, 7.95, 50.4, 8.05, 2.55, 2.6, '#ffe8c6');
  F.rect('metal', 47.5, 7.9, 50.5, 8.1, 2.6, 2.65, steel);
  for (const u of [47.8, 50.2]) F.rod('metal', [u, 2.65, 8], [u, h1, 8], .008, '#111', 4);
  plantPot(F, 54.8, 16.4, fl); plantPot(F, 35.3, 16.3, fl);
  // Living: a fireplace wall with the TV over it, a long sofa, armchairs, rug, lamps.
  // The firebox is a real recess in the stone, with flames in it after dark.
  for (const [a, b, c, d] of [[45, fl, 46.3, h1], [50.7, fl, 52, h1], [46.3, fl, 50.7, fl + .35], [46.3, fl + .95, 50.7, h1]]) F.rect('stone', a, v0 + .18, c, v0 + .6, b, d, '#46423d', true);
  F.rect('paint', 46.3, v0 + .18, 50.7, v0 + .22, fl + .35, fl + .95, '#0d0d0e'); F.rect('paint', 46.3, v0 + .22, 50.7, v0 + .58, fl + .35, fl + .4, '#161514');
  for (let u = 46.45; u < 50.6; u += .13) F.geo('rock', new T.IcosahedronGeometry(.05, 0), u, fl + .42, v0 + .34 + (u * 7 % 1) * .12, '#cfc9bf');
  F.fire(46.6, v0 + .4, 50.4, v0 + .4, fl + .42, .42);
  F.rect('paint', 46.9, v0 + .6, 50.1, v0 + .66, fl + 1.45, fl + 3.25, '#0b0c0e'); F.rect('gloss', 46.95, v0 + .66, 50.05, v0 + .67, fl + 1.5, fl + 3.2, '#101216');
  rug(F, 48.5, -25.8, 7, 5.6, '#b8ab96', fl);
  sofa(F.sub(48.5, -22.7, -Math.PI / 2, fl), 4.6, '#e7e2d9');
  table(F.sub(48.5, -26, 0, fl), 1.4, 2.6, .38, '#2f2d2a', steel, 0, 'gloss');
  F.geo('stone', new T.SphereGeometry(.18, 12, 8), 48.5, fl + .55, -26.4, '#b9ad99');
  armchair(F.sub(45.2, -26.4, 0, fl), '#b9a07e'); armchair(F.sub(51.8, -26.4, Math.PI, fl), '#b9a07e');
  lampTable(F.sub(45.4, -23.3, 0, fl)); floorLamp(F.sub(52, -23.3, 0, fl)); F.pool(52, -23.3, fl + .02, 2.2, .35); F.pool(45.4, -23.3, fl + .02, 1.6, .25);
  F.pool(48.5, v0 + 1.2, fl + .02, 2.6, .5, new T.Color('#ff9a4a'));
  plantPot(F, 54.9, -28.8, fl); plantPot(F, 35.1, -28.8, fl);
  // Entry gallery: console, sculpture, art; a pendant in the double height... (single here).
  table(F.sub(u0 + .6, -2, 0, fl), .45, 2.4, .8, '#2b2a28', steel, 0, 'gloss');
  F.geo('stucco', new T.TorusKnotGeometry(.18, .05, 48, 8), u0 + .6, fl + 1.05, -2.3, '#c9a86a');
  art(F, u0 + .22, -1.9, 2.1, 1.5, 2.2, '#c75b39', '#1f3f5c', ['u', 1]);
  art(F, 55.7, 16.8, 2.1, 1.3, 1.8, '#e3c07b', '#2c2c2c', ['v', -1]);

  // More in the big room: a grand piano by the front glass, a reading nook to the view,
  // a pool table and sculptures in the gallery, a bookcase, a dining sideboard, trees in pots.
  piano(F.sub(40.2, -23.5, Math.PI / 2, fl)); F.pool(40.2, -23.5, fl + .02, 2.4, .15);
  for (const v of [-18.2, -15.4]) armchair(F.sub(54.3, v, 0, fl), '#d9d2c3');
  lampTable(F.sub(54.4, -16.8, 0, fl)); rug(F, 54.4, -16.8, 2.6, 4.2, '#8f8676', fl);
  poolTable(F.sub(47, -6, 0, fl)); for (const u of [46.3, 47.7]) pendant(F, u, -6, 1.6, h1, .2, '#ffe2b8');
  F.pool(47, -6, fl + .02, 2.8, .2);
  F.rect('metal', 51.4, -8.2, 51.5, -3.8, fl + 1.1, fl + 2.1, '#2b2521'); for (let k = 0; k < 6; k++) F.rod('wood', [51.35, fl + 1.12, -7.9 + k * .15], [51.35, fl + 2.05, -7.9 + k * .15], .012, '#c9a36a', 4);
  bookcase(F.sub(u0 + .4, -12, 0, fl), 3.4, 3.3);
  for (const [u, v, k] of [[37.5, -12.8, 0], [37.5, -.8, 1], [44.5, -12.8, 2]]) { pedestal(F, u, v, fl, k); F.scallop(u, v - .31, fl, [0, -1], .8, 1.2, .15); }
  sideboard(F.sub(49, v1 - .45, -Math.PI / 2, fl), 4); art(F, 49, v1 - .22, 2.4, 1.2, 2.6, '#233a4f', '#d6b27a', ['v', -1]);
  rug(F, 49, 8, 5.6, 3.4, '#c9bfae', fl);
  vase(F, 49, 8, fl + .76); vase(F, u0 + .6, -1.4, fl + .8);
  F.geo('stone', new T.CylinderGeometry(.25, .15, .12, 16), 38.7, fl + 1.02, 8.2, '#6b5a47'); for (let k = 0; k < 5; k++) F.geo('gloss', new T.SphereGeometry(.06, 8, 6), 38.6 + (k % 2) * .1, fl + 1.1, 8.1 + k * .05, ['#d8321c', '#f0c21c', '#7ab030'][k % 3]);
  for (const [u, v] of [[35.1, -13.3], [55.2, -13], [55.2, .6], [45.3, 13.6], [35.1, 1]]) bigPlant(F, u, v, fl);
  // ---- upstairs rooms.
  // Suite: a full-height teak headboard wall facing the view (the dressing room
  // behind it), an upholstered panel, the bed, nightstands, sconces, a bench.
  F.rect('wood', 52.3, -20.5, 52.65, -9.5, y2, y2 + h2 - .03, '#6f4a2e', true);
  F.rbox('fabric', 52.72, y2 + .9, -15, .14, 1.15, 4.4, .05, '#d8cfc0');
  bed(F.sub(53.9, -15, 0, y2), 2.2, 2.1);
  for (const s of [-1, 1]) { lampTable(F.sub(53.05, -15 + s * 1.5, 0, y2)); F.pool(53.2, -15 + s * 1.5, y2 + .04, 1.5, .3); F.rect('glow', 52.66, -15 + s * 1.5 - .06, 52.7, -15 + s * 1.5 + .06, y2 + 1.2, y2 + 1.45, '#ffe6c2'); F.scallop(52.68, -15 + s * 1.5, y2 + .7, [1, 0], .9, 1.4, .3); }
  F.rbox('fabric', 55.4, y2 + .25, -15, .45, .45, 1.8, .06, '#8c7a66');
  rug(F, 54.4, -15, 3.6, 4.2, '#cdc3b2', y2);
  F.rect('wood', 43, V0 + .2, 52, V0 + .85, y2, y2 + 2.5, '#5d4130');
  for (let u = 43.9; u < 52; u += .9) F.rect('paint', u, V0 + .85, u + .01, V0 + .87, y2 + .1, y2 + 2.4, '#3a281c');
  // Behind the headboard: a dresser and a dressing table with a lit mirror.
  F.rect('wood', 51.75, -19.9, 52.28, -17.4, y2, y2 + .85, '#5d4130', true); F.rect('gloss', 51.72, -19.95, 52.29, -17.35, y2 + .85, y2 + .88, '#1c1d1f');
  table(F.sub(51.98, -12, Math.PI, y2), .5, 1.4, .76, '#efece6', '#1b1c1e', 0, 'gloss');
  F.rect('glass', 52.27, -12.6, 52.29, -11.4, y2 + 1.05, y2 + 2.1, '#e6eef1'); F.rect('glow', 52.26, -12.65, 52.28, -11.35, y2 + 2.1, y2 + 2.14, '#fff0dc');
  stool(F.sub(51.2, -12, 0, y2), '#d8cfc0'); vase(F, 52.05, -11.6, y2 + .76);
  // Bath: stone partitions, a freestanding tub, double vanity, glass shower.
  F.wall(U0 + .15, -14, 45, -14, h2, .15, white, [[4.8, 6, 2.3]], 'stucco', y2);
  F.wall(45, V0 + .15, 45, -14, h2, .15, white, [], 'stucco', y2);
  F.rect('stone', U0 + .2, V0 + .2, 45, -14.1, y2, y2 + .04, '#d7d0c4');
  F.geo('gloss', rboxGeo(1.8, .6, .85, .28), 41.6, y2 + .32, -19.5, '#f7f6f2');
  F.geo('poolwater', rboxGeo(1.6, .04, .66, .02), 41.6, y2 + .52, -19.5, '#a9d8e4');
  F.rect('wood', 44.35, -22.4, 44.9, -17.2, y2 + .35, y2 + .85, '#6f4a2e');
  F.rect('gloss', 44.3, -22.5, 44.92, -17.1, y2 + .85, y2 + .9, '#efece6');
  for (const v of [-21.1, -18.5]) F.rect('glass', 44.83, v - .5, 44.86, v + .5, y2 + 1.3, y2 + 2.2, '#c8d6dc');
  F.glass(39.8, V0 + .2, 39.8, -21.4, y2, y2 + 2.2, {solid: true, pitch: 5, frame: '#2a2b2e'});
  F.glass(U0 + .2, -21.4, 39.8, -21.4, y2, y2 + 2.2, {solid: false, pitch: 5, frame: '#2a2b2e'});
  // Lounge and study toward the north end.
  sofa(F.sub(56.8, 7.5, 0, y2), 3.4, '#cfc6b8');
  table(F.sub(58.7, 7.5, 0, y2), 1, 1.8, .38, '#3a3734', steel);
  armchair(F.sub(59.8, 4.4, Math.PI / 2, y2), '#8e8a82'); armchair(F.sub(59.8, 10.6, -Math.PI / 2, y2), '#8e8a82');
  rug(F, 58.5, 7.5, 5, 6, '#9f978a', y2);
  table(F.sub(39.2, 5, 0, y2), .8, 1.8, .75, '#6f4a2e'); chair(F.sub(40.1, 5, Math.PI, y2), '#1e1f21');
  F.geo('glow', new T.CylinderGeometry(.12, .12, .05, 12), 39.2, y2 + .95, 5.6, '#fff1d8');
  F.rect('wood', 48, V1 - .55, 56, V1 - .17, y2, y2 + 2.4, '#5d4130');
  for (let y = y2 + .45; y < y2 + 2.4; y += .45) {
    F.rect('wood', 48.05, V1 - .53, 55.95, V1 - .19, y - .03, y, '#6f4a2e');
    for (let u = 48.2, i = 0; u < 55.6; u += .09 + (i % 5) * .02, i++) if ((i * 7) % 11 > 2) F.rect('paint', u, V1 - .5, u + .06, V1 - .25, y, y + .24 + (i % 3) * .04, ['#8c3b2e', '#264b6b', '#d9cfb8', '#3d5b3a', '#2a2a2a'][i % 5]);
  }
  plantPot(F, 61.9, 15.8, y2); plantPot(F, 61.9, -22.8, y2);

  // More upstairs: a sitting pair facing the view in the suite, a dressing table,
  // a gym corner with the city in front of it, a bar cart and plants in the lounge.
  for (const v of [-21.2, -18.8]) armchair(F.sub(60.6, v, 0, y2), '#ece7de');
  table(F.sub(61.4, -20, 0, y2), .6, .6, .5, '#e9e5dc', '#1b1c1e', 0, 'gloss'); vase(F, 61.4, -20, y2 + .5);
  // At the view glass: a brass telescope on its tripod, and a chess table for two.
  {
    const tu = 61.6, tv = -3.2, ty = y2 + 1.25;
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; F.rod('metal', [tu + Math.cos(a) * .45, y2, tv + Math.sin(a) * .45], [tu, ty, tv], .018, '#2a2b2e', 5); }
    F.geo('metal', new T.CylinderGeometry(.075, .06, 1.25, 16).rotateZ(-1.25), tu + .08, ty + .12, tv, '#b8955a');
    F.geo('metal', new T.CylinderGeometry(.085, .085, .12, 16).rotateZ(-1.25), tu + .62, ty + .3, tv, '#1c1d1f');
    table(F.sub(58.6, -1.2, 0, y2), .75, .75, .72, '#2f2d2a', '#1b1c1e');
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) F.rect('paint', 58.3 + i * .075, -1.5 + j * .075, 58.375 + i * .075, -1.425 + j * .075, y2 + .72, y2 + .725, '#efe9dc');
    for (let k = 0; k < 6; k++) F.cyl('gloss', 58.33 + (k % 3) * .22, -1.46 + Math.floor(k / 3) * .52, y2 + .725, .025, .06, k < 3 ? '#f2efe8' : '#1c1c1d', 8);
    armchair(F.sub(57.6, -1.2, 0, y2), '#b9a58a'); armchair(F.sub(59.6, -1.2, Math.PI, y2), '#b9a58a');
  }
  F.rect('metal', 54.8, 12.6, 55.6, 13.2, y2 + .02, y2 + .85, '#b8a172'); for (let k = 0; k < 4; k++) F.cyl('glass', 54.95 + k * .17, 12.9, y2 + .85, .035, .3, '#5a7a5a', 8);
  floorLamp(F.sub(55.2, 4.4, 0, y2)); F.pool(55.2, 4.4, y2 + .04, 2, .25);
  for (const [u, v] of [[45.8, 3.6], [62, 1.6], [46, -4]]) bigPlant(F, u, v, y2);
  art(F, 57.5, V0 + .2, y2 + 2, 1.4, 2.6, '#d9c7a2', '#3a3a3a', ['v', 1]);
  // A teak partition with a see-through fireplace splits the suite from the lounge.
  F.rect('wood', 46.5, -6.2, 49.5, -5.9, y2, y2 + 2.8, '#6f4a2e', true); F.rect('wood', 52.5, -6.2, 55.5, -5.9, y2, y2 + 2.8, '#6f4a2e', true);
  for (const [a, b, c, d] of [[49.5, y2, 49.8, y2 + 2.8], [52.2, y2, 52.5, y2 + 2.8], [49.8, y2, 52.2, y2 + .5], [49.8, y2 + 1.05, 52.2, y2 + 2.8]]) F.rect('stone', a, -6.35, c, -5.75, b, d, '#3b3935', true);
  F.rect('paint', 49.8, -6.35, 52.2, -5.75, y2 + .5, y2 + .54, '#141312');
  for (const v of [-6.33, -5.77]) F.rect('glass', 49.8, v - .01, 52.2, v + .01, y2 + .54, y2 + 1.05, '#d8e2e6', true);
  F.fire(50, -6.05, 52, -6.05, y2 + .54, .4);
  for (const v of [-7, -5.1]) F.pool(51, v, y2 + .04, 1.6, .35, new T.Color('#ff9a4a'));
  rug(F, 51, -2.4, 4.4, 3, '#b7a58a', y2); sofa(F.sub(51, -2, -Math.PI / 2, y2), 2.8, '#b9a58a');
  table(F.sub(51, -3.9, 0, y2), .9, 1.6, .4, '#2f2d2a', '#1b1c1e', 0, 'gloss');
  // Pool house: a sofa and a screen.
  sofa(F.sub(62.2, 36, 0, .12), 3.2, '#e7e2d9'); F.rect('paint', 67.6, 34.6, 67.75, 37.4, 1, 2.6, '#0b0c0e');
  F.kit.indoor = 0;
  // ---- the terrace: travertine deck round a dug vanishing-edge pool.
  const P0 = 64, P1 = 72, Q0 = -31, Q1 = -3, WY = .12, FL = -1.62, cp = .35;
  // The deck stops at the coping; nothing in the pool shares a face with anything else.
  for (const [a, b, c, d] of [[u1, -hw + .5, P0 - cp, 30], [P0 - cp, -hw + .5, D, Q0 - cp], [P0 - cp, Q1 + cp, D, 30], [P1 + 1.3, Q0 - cp, D, Q1 + cp]]) F.rect('stucco', a, b, c, d, -.3, fl, trav, true);
  // Pool shell: tiled walls and a solid floor, travertine coping, a dark waterline band.
  F.rect('pool', P0, Q0, P1 + .25, Q1, -2.1, FL, '#63c3d6', true);
  for (const [a, b, c, d] of [[P0 - cp, Q0 - cp, P0, Q1 + cp], [P0, Q0 - cp, P1 + .25, Q0], [P0, Q1, P1 + .25, Q1 + cp]]) {
    F.rect('pool', a, b, c, d, -2.1, .1, '#6ec9da', true);
    F.rect('stucco', a, b, c, d, .1, fl, trav);
  }
  // The coping overhangs the water a little all round.
  F.rect('stucco', P0, Q0, P0 + .04, Q1, .16, fl, trav); F.rect('stucco', P0 + .04, Q0, P1, Q0 + .04, .16, fl, trav); F.rect('stucco', P0 + .04, Q1 - .04, P1, Q1, .16, fl, trav);
  for (const [a, b, c, d] of [[P0, Q0, P0 + .012, Q1], [P0, Q0, P1, Q0 + .012], [P0, Q1 - .012, P1, Q1]]) F.rect('paint', a, b, c, d, -.08, .09, '#20505e');
  // The vanishing edge: a dark lip the water runs over, a sheet down its face, the trough below.
  F.rect('pool', P1, Q0, P1 + .25, Q1, -2.1, WY - .025, '#2e7088', true);
  F.rect('gloss', P1 + .005, Q0, P1 + .245, Q1, WY - .025, WY - .02, '#1f2a2e');
  F.rect('pool', P1 + .25, Q0 - cp, P1 + 1.3, Q1 + cp, -.7, -.4, '#2e5f70', true);
  F.rect('stucco', P1 + 1.2, Q0 - cp, P1 + 1.3, Q1 + cp, -.4, fl, trav, true);
  for (const [b, d] of [[Q0 - cp, Q0], [Q1, Q1 + cp]]) F.rect('stucco', P1 + .25, b, P1 + 1.2, d, -.4, fl, trav, true);
  F.water(P0, Q0, P1 + .25, Q1, WY, '#3aa6c2', FL);
  F.water(P1 + .25, Q0, P1 + 1.2, Q1, -.14, '#3c9fb8', -.4, {swim: false});
  F.geo('poolwater', new T.PlaneGeometry(Q1 - Q0, WY + .14).rotateY(Math.PI / 2), P1 + .255, (WY - .14) / 2, (Q0 + Q1) / 2, '#6fc3d8');
  F.sound('pool', (P0 + P1) / 2, (Q0 + Q1) / 2, WY, 22);
  // Steps down in the corner.
  for (let k = 0; k < 5; k++) F.rect('pool', P0, Q0, P0 + .5 * (5 - k), Q0 + 2.4, -2.05, FL + .08 + k * .36, '#bfe6ee', true);
  // Underwater lights.
  for (const v of [-24, -17, -10]) F.rect('glow', P0 + .005, v - .15, P0 + .02, v + .15, -.75, -.55, '#bff4ff');
  for (const u of [66.5, 69.5]) F.rect('glow', u - .15, Q1 - .02, u + .15, Q1 - .005, -.75, -.55, '#bff4ff');
  // Spa: raised, dark rim, spilling toward the pool; you can climb in.
  {
    const su = 68, sv = 2.2, R1 = 2, n = 16;
    // A turned tub: dark rim outside and over the lip, tiled inside, a seat ledge.
    const prof = [[R1, 0], [R1, .72], [R1 - .18, .72], [R1 - .18, .3], [R1 - .55, .3], [R1 - .55, .1], [0.001, .1]].map(([r, y]) => new T.Vector2(r, y));
    F.geo('gloss', new T.LatheGeometry(prof.slice(0, 4), 32), su, 0, sv, '#2a2b2d');
    F.geo('pool', new T.LatheGeometry(prof.slice(3), 32), su, 0, sv, '#6ec9da');
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, F2 = F.sub(su + Math.cos(a) * (R1 - .09), sv + Math.sin(a) * (R1 - .09), a); F2.solid(0, .36, 0, .18, .72, 2 * Math.PI * R1 / n + .05); }
    F.solid(su, .2, sv, 2.4, .4, 2.4);
    F.waterDisc(su, sv, R1 - .19, .67, '#43b2cc', .3);
    F.cyl('glow', su, sv, .12, .3, .01, '#bff4ff', 16);
    F.sound('spa', su, sv, .7, 8);
  }
  // Loungers in the shade of the cantilever, more by the south end with umbrellas.
  for (let k = 0; k < 5; k++) { lounger(F.sub(60.8, -28 + k * 4.4, 0, fl)); if (k < 4) F.rect('wood', 60.3, -25.9 + k * 4.4, 60.9, -25.3 + k * 4.4, fl, fl + .42, '#8a5f3c'); }
  for (const v of [-39, -36.3]) lounger(F.sub(68, v, 0, fl));
  umbrella(F, 70.8, -37.7, fl); umbrella(F, 65.3, -37.7, fl, '#e4dccb');
  // Fire lounge: a linear fire table in a U of teak-framed sofas, open to the view.
  F.rect('stone', 66.4, 16.2, 67.6, 19.8, fl, fl + .45, '#3b3935', true); F.rect('paint', 66.85, 16.5, 67.15, 19.5, fl + .45, fl + .46, '#121212');
  for (let v = 16.6; v < 19.45; v += .16) F.geo('rock', new T.IcosahedronGeometry(.055, 0), 66.93 + (v * 7 % 1) * .14, fl + .47, v, '#d8d4cc');   // glass beads over the burner
  F.fire(67, 16.55, 67, 19.45, fl + .47, .62, true);
  F.pool(67, 18, fl + .02, 4, .6, new T.Color('#ff9a4a'));
  for (const u of [66.55, 67.45]) F.rect('glass', u - .01, 16.3, u + .01, 19.7, fl + .45, fl + .75, '#e7eef0');
  sofa(F.sub(64.4, 18, 0, fl), 3.8, '#ece6da', '#8a5f3c');
  sofa(F.sub(67.2, 21.2, -Math.PI / 2, fl), 3, '#ece6da', '#8a5f3c');
  sofa(F.sub(67.2, 14.8, Math.PI / 2, fl), 3, '#ece6da', '#8a5f3c');
  // Pergola dining by the pool house, festoon lights along the beams.
  for (const [a, b] of [[58.3, 24.3], [65.7, 24.3], [58.3, 29.7], [65.7, 29.7]]) F.col('wood', a, b, fl, fl + 2.9, .2, .2, '#7b5334', true);
  for (const b of [24.3, 29.7]) F.rect('wood', 57.8, b - .1, 66.2, b + .1, fl + 2.9, fl + 3.15, '#7b5334');
  for (let u = 58.4; u < 66; u += .6) F.rect('wood', u - .04, 23.9, u + .04, 30.1, fl + 3.15, fl + 3.3, '#8a5f3c');
  for (const b of [24.3, 29.7]) for (let u = 58.6; u < 65.6; u += .7) F.geo('glow', new T.SphereGeometry(.05, 8, 6), u, fl + 2.72 + Math.sin((u - 58.3) / 7.4 * Math.PI) * -.2, b, '#ffd79a');
  table(F.sub(62, 27, 0, fl), 3.2, 1.1, .76, '#7b5334'); F.pool(62, 27, fl + .02, 4.2, .35);
  for (let k = 0; k < 3; k++) for (const s of [-1, 1]) chair(F.sub(61 + k, 27 + s * .92, s > 0 ? -Math.PI / 2 : Math.PI / 2, fl), '#e9e3d6');
  // Pool house: glass front, teak ends, a bar inside, a deep lit soffit.
  F.wall(60, 39.5, 68, 39.5, 3.2, .3, white, [], 'stucco');
  for (const u of [60, 68]) F.wall(u, 32.5, u, 39.5, 3.2, .3, white, [], 'stucco');
  for (const u of [59.82, 68.18]) F.rect('wood', u - .03, 32.5, u + .03, 39.5, 0, 3.2, teak);
  F.glass(60, 32.5, 68, 32.5, 0, 3.2, {pitch: 2});
  F.rect('wood', 60.15, 32.6, 67.85, 39.35, 0, .12, oak, true);
  F.rect('stucco', 59.5, 31, 68.5, 40, 3.2, 3.5, white); F.rect('wood', 59.5, 31, 68.5, 32.5, 3.17, 3.2, teak);
  F.rect('room', 60.15, 32.6, 67.85, 39.35, 3.16, 3.18, skin);
  for (const u of [61.5, 64, 66.5]) F.downlight(u, 31.8, 3.17, fl, 1.8, .35);
  F.rect('wood', 61, 37.8, 67, 38.6, .12, 1.05, '#5b3e2a'); F.rect('gloss', 60.95, 37.75, 67.05, 38.65, 1.05, 1.1, '#efece6');
  for (const u of [62.5, 64, 65.5]) stool(F.sub(u, 37, -Math.PI / 2, .12));
  F.rect('wood', 60.2, 39.1, 67.8, 39.33, 1.4, 2.6, '#5b3e2a');
  // Lawn: a stepping-stone path from the court to the pool house, bollards, planting.
  for (let t = 0; t <= 1; t += .045) { const u = 32 + t * 26, v = 11 + t * 20 + Math.sin(t * 3.1) * 3; F.rect('stucco', u - .35, v - .6, u + .35, v + .6, -.05, .08, '#d8cfbd'); }
  for (let t = .1; t < 1; t += .2) { const u = 32 + t * 26, v = 11 + t * 20 + Math.sin(t * 3.1) * 3; F.bollard(u + 1, v - 1.2); }
  for (let v = -28.5; v < -14; v += 1.6) F.grassTuft(u0 - .9, v, .7, .04);
  for (let v = -2.5; v < 17; v += 1.8) F.lavender(u0 - .9, v, .04);
  F.olive(26, 24, 4.6, 0, 8); F.olive(45, 33, 4.3, 0, 9); F.olive(22, 36, 3.9, 0, 10);
  for (const [u, v] of [[36, 26], [52, 38], [30, 40]]) F.shrub(u, v, 1.1, 0, '#4f6d36', u);
  F.palm(73, -40, 14, fl, true); F.palm(72.6, 29, 13, fl, true); F.palm(71, 40, 15, 0, true); F.palm(58, -40, 12, fl, true);
  for (const [u, v] of [[58.6, -33.5], [58.6, 21.5]]) { F.rect('stucco', u - .7, v - .7, u + .7, v + .7, fl, fl + .8, '#e5e1d9'); F.olive(u, v, 3, fl + .8, u + v); }
  H.park = {u: 25, v: -1, face: -1};         // the car waits in the court, nose to the gate
  H.door = {u: u0 - 2, v: v0 + 21.6};
}
/* ------------------------------------------------------------ San Marino colonial */
/** A broad shade tree (oak, sycamore): a stout trunk, a spreading crown. */
function shadeTree(F, u, v, h = 9, y0 = 0, color = '#3f5a2c', seed = 1) {
  const [x, z] = F.w(u, v), y = F.y + y0, R = rng(seed + Math.round(u * 7 + v * 3));
  F.kit.rod('wood', [x, y - .3, z], [x + .3, y + h * .45, z - .2], .42, '#5a4a3a', 7);
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * 6.28 + R(), d = h * (.18 + R() * .22), s = h * (.2 + R() * .12);
    F.kit.add('fabric', BLOBS[k % 4], x + Math.cos(a) * d, y + h * (.62 + R() * .2), z + Math.sin(a) * d, R() * 6, k % 2 ? color : shade(color, 1.15), {scale: new T.Vector3(s * 1.2, s * .85, s * 1.2)});
  }
  F.kit.add('fabric', BLOBS[1], x, y + h * .9, z, 0, shade(color, 1.08), {scale: new T.Vector3(h * .3, h * .22, h * .3)});
}
/** A multi-pane window on a wall facing `n` (-1/+1 along u), centred at (u, v), sill y0, h tall, w wide:
 *  glass, white muntins, a lit room panel behind, black shutters, sill and lintel. */
function colonialWindow(F, u, v, y0, w, h, n, shutters = true) {
  F.rect('glass', u - .02, v - w / 2, u + .02, v + w / 2, y0, y0 + h, '#8fa6b3');
  for (const s of [-1, 1]) F.rect('room', u - n * .28 - .01, v + s * w * .34 - w * .16, u - n * .28 + .01, v + s * w * .34 + w * .16, y0 - .05, y0 + h + .1, '#f4e2bd');   // lit curtains
  F.rect('room', u - n * .28 - .01, v - w / 2, u - n * .28 + .01, v + w / 2, y0 + h - .05, y0 + h + .15, '#f4e2bd');
  for (let k = 1; k < 3; k++) F.rect('paint', u + n * .03 - .02, v - w / 2 + w * k / 3 - .025, u + n * .03 + .02, v - w / 2 + w * k / 3 + .025, y0, y0 + h, '#f7f6f1');
  for (const t of [.5]) F.rect('paint', u + n * .03 - .02, v - w / 2, u + n * .03 + .02, v + w / 2, y0 + h * t - .03, y0 + h * t + .03, '#f7f6f1');
  F.rect('paint', u + n * .06 - .05, v - w / 2 - .1, u + n * .06 + .05, v + w / 2 + .1, y0 - .1, y0 - .02, '#f7f6f1');                       // sill
  F.rect('paint', u + n * .06 - .05, v - w / 2 - .18, u + n * .06 + .05, v + w / 2 + .18, y0 + h, y0 + h + .22, '#f7f6f1');               // lintel
  for (const s of [-1, 1]) { F.rect('paint', u + n * .07 - .02, v + s * (w / 2 + .1) - .06, u + n * .07 + .02, v + s * (w / 2 + .1) + .06, y0, y0 + h, '#f7f6f1'); }
  if (shutters) for (const s of [-1, 1]) {
    const c = v + s * (w / 2 + .45);
    F.rect('paint', u + n * .08 - .025, c - .3, u + n * .08 + .025, c + .3, y0 - .05, y0 + h + .05, '#1c1e21');
    for (let y = y0 + .12; y < y0 + h; y += .12) F.rect('paint', u + n * .11 - .01, c - .26, u + n * .11 + .01, c + .26, y, y + .025, '#2a2d31');
  }
}
function colonial(F, H, places) {
  const D = H.depth, Wd = H.width, hw = Wd / 2;
  const white = '#f6f4ee', black = '#1d1f22', slate = '#3d4046', brick = '#9a5a44', lawn = '#6c9146', gravel = '#d8ccb3', box = '#3d5f30';
  for (const [a, b, c, d] of [[0, -hw, 38, hw], [38, -hw, 51, -16], [38, 2, 51, hw], [51, -hw, D, hw]]) F.rect('grass', a, b, c, d, -.25, .04, lawn);
  // Street front: a clipped boxwood hedge, brick piers with lanterns at the two drive openings.
  const o1 = [-hw + 8.5, -hw + 13.5], o2 = [hw - 13.5, hw - 8.5];
  for (const [a, b] of [[-hw, o1[0]], [o1[1], o2[0]], [o2[1], hw]]) F.rbox('fabric', .8, .6, (a + b) / 2, 1.3, 1.2, b - a - .6, .35, box);
  for (const v of [...o1, ...o2]) {
    F.col('stone', .8, v, 0, 1.6, .7, .7, brick, true); F.col('paint', .8, v, 1.6, 1.7, .85, .85, '#e9e5dc');
    F.col('metal', .8, v, 1.7, 2.25, .3, .3, black); F.col('glow', .8, v, 1.78, 2.15, .22, .22, '#ffd89a'); F.pool(1.2, v, .05, 2.2, .35);
  }
  // The circular drive: gravel with brick edging, a fountain in the middle of the loop.
  const legs = [[0, o1[0], 16, o1[1]], [0, o2[0], 16, o2[1]], [12, o1[0], 18, o2[1]]];
  for (const [a, b, c, d] of legs) F.rect('stucco', a, b, c, d, -.3, .08, gravel);
  for (const [a, b, c, d] of legs) for (const [p, q, r, t] of [[a, b - .15, c, b + .05], [a, d - .05, c, d + .15]]) if (c - a > 7) F.rect('stone', p, q, r, t, 0, .12, brick);
  F.rect('stone', 17.9, o1[1], 18.1, o2[0], 0, .12, brick);
  F.cyl('stone', 7, 0, 0, 3.6, .5, '#a9a08f', 28, true); F.cyl('pool', 7, 0, .3, 3.3, .15, '#2f5d67', 28); F.cyl('poolwater', 7, 0, .44, 3.32, .03, '#4a9aad', 28);
  F.cyl('stone', 7, 0, .45, .35, 1.2, '#b8af9e', 12); F.cyl('stone', 7, 0, 1.6, 1.5, .18, '#b8af9e', 20, false, 1.1); F.cyl('stone', 7, 0, 1.78, .22, .7, '#b8af9e', 10); F.cyl('stone', 7, 0, 2.45, .75, .12, '#b8af9e', 16, false, .5);
  for (let k = 0; k < 4; k++) { const a = k / 4 * 6.28; F.uplight(7 + Math.cos(a) * 2.6, Math.sin(a) * 2.6, .35); }
  for (let k = 0; k < 14; k++) { const a = k / 14 * 6.28; F.rbox('fabric', 7 + Math.cos(a) * 4.4, .35, Math.sin(a) * 4.4, .8, .7, .8, .3, box); }
  // The house: two storeys on a brick plinth, clapboard, a hipped slate roof, a portico.
  const u0 = 19, u1 = 33, v0 = -13, v1 = 13, h = 3.4, pl = .4, y2 = pl + h + .3;
  F.rect('stone', u0 - .1, v0 - .1, u1 + .1, v1 + .1, -.2, pl, brick, true);
  F.rect('wood', u0, v0, u1, v1, pl, pl + .02, '#9c6b45');
  const winG = [2.45, 3.55, 6.45, 7.55, 18.45, 19.55, 22.45, 23.55].reduce((a, x, i, arr) => (i % 2 ? a : [...a, [x, arr[i + 1], 2.6, .9]]), []);
  F.wall(u0, v0, u0, v1, h, .3, white, [[11.5, 14.5, 2.7], ...winG], 'stucco', pl);        // front: door + four windows
  F.wall(u1, v0, u1, v1, h, .3, white, [[11.5, 14.5, 2.6], [3.45, 4.55, 2.6, .9], [21.45, 22.55, 2.6, .9]], 'stucco', pl);
  for (const v of [v0, v1]) F.wall(u0, v, u1, v, h, .3, white, [[4.45, 5.55, 2.6, .9], [8.45, 9.55, 2.6, .9]], 'stucco', pl);
  // Upper floor walls with the same rhythm (the centre window over the portico too).
  const winU = [...winG, [11.95, 14.05, 2.4, .8]].map(([a, b]) => [a, b, 2.4, .8]);
  F.wall(u0, v0, u0, v1, h, .3, white, winU, 'stucco', y2);
  F.wall(u1, v0, u1, v1, h, .3, white, [[3.45, 4.55, 2.4, .8], [11.45, 12.55, 2.4, .8], [21.45, 22.55, 2.4, .8]], 'stucco', y2);
  for (const v of [v0, v1]) F.wall(u0, v, u1, v, h, .3, white, [[4.45, 5.55, 2.4, .8], [8.45, 9.55, 2.4, .8]], 'stucco', y2);
  // Clapboard: a shadow line every 30 cm on every face.
  for (let y = pl + .3; y < y2 + h; y += .3) {
    if (Math.abs(y - (pl + h + .15)) < .2) continue;
    for (const u of [u0 - .165, u1 + .165]) F.rect('paint', u - .01, v0 - .15, u + .01, v1 + .15, y - .012, y, '#d9d6cd');
    for (const v of [v0 - .165, v1 + .165]) F.rect('paint', u0 - .15, v - .01, u1 + .15, v + .01, y - .012, y, '#d9d6cd');
  }
  F.rect('paint', u0 - .25, v0 - .25, u1 + .25, v1 + .25, pl + h, y2, white);                  // belt course
  // Windows (glass, muntins, lit panel, shutters) front, back, ends; both floors.
  const win = (u, v, y0, w, hh, n, sh) => colonialWindow(F, u, v, y0, w, hh, n, sh);
  for (const v of [-10, -6, 6, 10]) { win(u0 - .16, v, pl + .9, 1.1, 1.7, -1, true); win(u0 - .16, v, y2 + .8, 1.1, 1.6, -1, true); }
  win(u0 - .16, 0, y2 + .8, 2.1, 1.6, -1, false);
  for (const v of [-9, 9]) { win(u1 + .16, v, pl + .9, 1.1, 1.7, 1, true); win(u1 + .16, v, y2 + .8, 1.1, 1.6, 1, true); }
  win(u1 + .16, -1, y2 + .8, 1.1, 1.6, 1, true);
  // End windows: faces along v; build with a sub-frame turned to face out.
  for (const [v, n] of [[v0 - .16, -1], [v1 + .16, 1]]) for (const uu of [5, 9]) for (const [y, hh] of [[pl + .9, 1.7], [y2 + .8, 1.6]]) {
    const S = F.sub(u0 + uu, v, n > 0 ? -Math.PI / 2 : Math.PI / 2); colonialWindow(S, 0, 0, y, 1.1, hh, -1, true);
  }
  // Floors: the slab with a stair void; ceilings; interior skins.
  for (const [a, b, c, d] of [[u0, v0, u1, .1], [u0, .1, 19.9, 1.5], [25.7, .1, u1, 1.5], [u0, 1.5, u1, v1]]) { F.rect('paint', a, b, c, d, pl + h, y2, white, true); F.rect('wood', a, b, c, d, y2, y2 + .02, '#9c6b45'); F.rect('room', a + .15, b, c - .15, d, pl + h - .02, pl + h, '#b3aa9c'); }
  F.rect('room', u0 + .2, v0 + .2, u1 - .2, v1 - .2, y2 + h - .02, y2 + h, '#b3aa9c');
  F.rect('paint', u0 - .1, v0 - .1, u1 + .1, v1 + .1, y2 + h, y2 + h + .25, white);
  for (const y of [pl, y2]) {
    F.wall(u0 + .17, v0, u0 + .17, v1, h, .02, '#efe4cf', y === pl ? [[11.5, 14.5, 2.7], ...winG] : winU, 'room', y, false);
    F.wall(u1 - .17, v0, u1 - .17, v1, h, .02, '#efe4cf', y === pl ? [[11.5, 14.5, 2.6], [3.45, 4.55, 2.6, .9], [21.45, 22.55, 2.6, .9]] : [[3.45, 4.55, 2.4, .8], [11.45, 12.55, 2.4, .8], [21.45, 22.55, 2.4, .8]], 'room', y, false);
    for (const v of [v0 + .17, v1 - .17]) F.wall(u0, v, u1, v, h, .02, '#efe4cf', [[4.45, 5.55, 2.4, .8], [8.45, 9.55, 2.4, .8]], 'room', y, false);
  }
  // Roof: a hipped slate roof over a white cornice, brick chimneys.
  const roofY = y2 + h + .25, cu = (u0 + u1) / 2;
  F.rect('paint', u0 - .5, v0 - .5, u1 + .5, v1 + .5, roofY - .25, roofY, white);
  const hip = new T.ConeGeometry(1, 1, 4, 1); hip.rotateY(Math.PI / 4);
  F.geo('stone', hip, cu, roofY + 2.2, 0, slate, {scale: new T.Vector3((u1 - u0 + 1.4) * .74, 4.4, (v1 - v0 + 1.4) * .74)});
  for (const s of [-1, 1]) { F.col('stone', cu + 2, s * 7, roofY, roofY + 5.2, 1.2, 1.2, brick); F.col('paint', cu + 2, s * 7, roofY + 5.2, roofY + 5.4, 1.4, 1.4, '#e9e5dc'); }
  // Portico: steps, four columns with bases and capitals, entablature, pediment; lanterns; the door open.
  F.stairs(u0 - 4, 0, pl, 1.2, 7.4, '#d9d3c6', 0, 'stone');
  F.rect('stone', u0 - 2.8, -3.7, u0, 3.7, 0, pl, '#d9d3c6', true);
  for (const v of [-3, -1.1, 1.1, 3]) {
    F.cyl('paint', u0 - 2.3, v, pl, .3, h - .1, white, 16, true, .26);
    F.col('paint', u0 - 2.3, v, pl, pl + .2, .75, .75, white); F.col('paint', u0 - 2.3, v, pl + h - .2, pl + h + .05, .75, .75, white);
  }
  F.rect('paint', u0 - 3, -4, u0, 4, pl + h + .05, pl + h + .6, white);
  const ped = new T.CylinderGeometry(1, 1, 1, 3); ped.rotateX(Math.PI / 2); ped.rotateY(Math.PI / 2);
  F.geo('paint', ped, u0 - 1.5, pl + h + 1.35, 0, white, {scale: new T.Vector3(1.6, 1.3, 8.4)});
  F.rect('room', u0 - 2.9, -3.8, u0, 3.8, pl + h, pl + h + .05, '#d8cbb3');
  for (const s of [-1, 1]) { F.rect('metal', u0 - .3, s * 1.9 - .15, u0 - .18, s * 1.9 + .15, 1.9, 2.5, black); F.rect('glow', u0 - .31, s * 1.9 - .1, u0 - .3, s * 1.9 + .1, 2.0, 2.4, '#ffd48f'); F.scallop(u0 - .17, s * 1.9, pl, [-1, 0], 1.4, 3, .45); }
  F.pool(u0 - 1.6, 0, pl + .01, 2.4, .35);
  F.rect('paint', u0 + .05, -1.45, u0 + 1.2, -1.38, pl, pl + 2.6, black); F.rect('metal', u0 + .9, -1.47, u0 + .96, -1.36, pl + 1.1, pl + 1.25, '#c8a85c');
  for (const v of [-3, -1.1, 1.1, 3]) F.uplight(u0 - 2.3 - .5, v, 0);
  F.kit.indoor = 1;
  // Ground floor rooms: centre hall with the stair, living left, dining right, kitchen/family behind.
  F.wall(u0, -1.5, u0 + 6, -1.5, h, .14, '#efe9df', [[2, 4]], 'paint', pl);
  F.wall(u0, 1.5, u0 + 6, 1.5, h, .14, '#efe9df', [], 'paint', pl);
  F.wall(u0 + 6, v0, u0 + 6, v1, h, .14, '#efe9df', [[4, 6], [11.5, 14.5, 2.4], [20, 22]], 'paint', pl);
  F.stairs(u0 + 1, .8, h + .3, 5.4, 1.2, '#7c5236', pl, 'wood');
  F.rod('wood', [u0 + 1.2, pl + 1, .2], [u0 + 6.4, y2 + .95, .2], .04, '#5b3a26', 6);
  for (let k = 0; k < 9; k++) { const t = k / 8, uu = u0 + 1.2 + t * 5.2, yb = pl + (h + .3) * Math.max(0, (uu - u0 - 1) / 5.4); F.rod('paint', [uu, yb, .2], [uu, yb + .95, .2], .02, '#f2efe8', 4); }
  rug(F, 22, -7.2, 4.2, 5, '#7d3b33', pl);
  sofa(F.sub(23.6, -7.2, Math.PI, pl), 3, '#5f6d5a', '#3a2a1e');
  armchair(F.sub(20.6, -9.6, 0, pl), '#b3876a'); armchair(F.sub(20.6, -4.8, 0, pl), '#b3876a');
  table(F.sub(22, -7.2, 0, pl), 1, 1.8, .45, '#6a4430');
  F.rect('stone', 19.5, v0 + .17, 22.9, v0 + .6, pl, pl + 1.3, '#e6e0d4'); F.rect('paint', 20.4, v0 + .55, 22, v0 + .62, pl, pl + .9, '#141414'); F.rect('glow', 20.5, v0 + .6, 21.9, v0 + .63, pl + .05, pl + .3, '#ff8a3a');
  art(F, 21.2, v0 + .2, pl + 2.2, 1, 1.4, '#566f86', '#d9c9a4', ['v', 1]); F.pool(21.2, v0 + 1.2, pl + .02, 1.8, .35, new T.Color('#ff9a4a'));
  table(F.sub(22, 7.2, 0, pl), 2.4, 1.1, .76, '#5b3a26');
  for (let k = 0; k < 3; k++) for (const s of [-1, 1]) chair(F.sub(21.2 + k * .8, 7.2 + s * .9, s > 0 ? -Math.PI / 2 : Math.PI / 2, pl), '#7d2d2d');
  pendant(F, 22, 7.2, .8, pl + h, .3, '#ffe2b0'); pendant(F, 22, -7.2, .6, pl + h, .22, '#ffe2b0'); pendant(F, 20.5, 0, .7, pl + h, .25, '#ffe2b0');
  kitchenRun(F.sub(u1 - .5, 7, Math.PI, pl), 8);
  F.rect('wood', 28, 4.5, 29.4, 9.5, pl, pl + .9, '#e8e2d6'); F.rect('gloss', 27.9, 4.4, 29.5, 9.6, pl + .9, pl + .95, '#2d2e30');
  sofa(F.sub(28.8, -7, 0, pl), 3.2, '#d8cdb8', '#3a2a1e'); table(F.sub(30.6, -7, 0, pl), .8, 1.6, .42, '#5b3a26');
  F.pool(22, -7.2, pl + .02, 2.6, .18); F.pool(22, 7.2, pl + .02, 2.6, .2); F.pool(29, 0, pl + .02, 3, .15);
  // Upstairs: two bedrooms and a hall.
  bed(F.sub(21.4, -7, 0, y2), 2.1, 1.8, '#f3f0e8', '#3f4f6d'); for (const s of [-1, 1]) lampTable(F.sub(20.5, -7 + s * 1.3, 0, y2));
  bed(F.sub(21.4, 7, 0, y2), 2.1, 1.6, '#f3f0e8', '#8a5a5a'); lampTable(F.sub(20.5, 5.4, 0, y2));
  F.wall(u0, -2, u1, -2, h, .14, '#efe9df', [[7.5, 9]], 'paint', y2);
  F.wall(u0, 2, u1, 2, h, .14, '#efe9df', [[7.5, 9]], 'paint', y2);
  F.rect('wood', 30, -12.6, 32.6, -11.9, y2, y2 + 2.1, '#6a4430'); F.rect('wood', 30, 11.9, 32.6, 12.6, y2, y2 + 2.1, '#6a4430');
  F.pool(21.4, -7, y2 + .03, 2.4, .2); F.pool(21.4, 7, y2 + .03, 2.4, .2);
  // More furniture: bookcases either side of the fireplace... a sideboard, a desk, plants, rugs.
  bookcase(F.sub(u0 + .4, -12.1, 0, pl), 1.4, 2.6, 0, '#e9e4da');
  sideboard(F.sub(22, v1 - .45, -Math.PI / 2, pl), 2.6); vase(F, 22, 7.2, pl + .76);
  table(F.sub(31.8, -11.5, Math.PI, pl), 1.4, .7, .76, '#5b3a26'); chair(F.sub(31, -11.5, 0, pl), '#6f2d2d');
  piano(F.sub(28.5, -11, Math.PI, pl));
  rug(F, 29, 7, 3, 4, '#40506a', pl); rug(F, 22, 0, 1.6, 4.4, '#7d3b33', pl);
  for (const [u, v, y] of [[19.6, -2.2, pl], [32.4, 2.4, pl], [19.6, 12.3, pl], [32.4, -12.3, y2], [19.6, 3, y2]]) bigPlant(F, u, v, y, 1.9);
  bookcase(F.sub(u1 - .45, -6, Math.PI, y2), 3, 2.3, 0, '#5b3a26');
  armchair(F.sub(29.5, -6, 0, y2), '#8a6a52'); floorLamp(F.sub(29.5, -4.6, 0, y2));
  F.rect('wood', 25, 11.9, 27.5, 12.6, y2, y2 + .9, '#6a4430'); art(F, 26.2, v1 - .2, y2 + 1.7, .9, 1.2, '#7a8f6a', '#e6dcc4', ['v', -1]);
  F.kit.indoor = 0;
  // Back terrace, dug pool with travertine coping, loungers, umbrella.
  F.rect('stone', u1, v0 - 2, 38, v1 + 2, -.3, .1, '#b7806a', true);
  const P0 = 42, P1 = 48, Q0 = -13.5, Q1 = -2.5;
  for (const [a, b, c, d] of [[38, -16, P0, 2], [P1, -16, 51, 2], [P0, -16, P1, Q0], [P0, Q1, P1, 2]]) F.rect('stucco', a, b, c, d, -.3, .12, '#e1d8c6', true);
  F.rect('pool', P0, Q0, P1, Q1, -1.6, -1.45, '#68c4d6');
  for (const [a, b, c, d] of [[P0 - .1, Q0, P0, Q1], [P1, Q0, P1 + .1, Q1], [P0, Q0 - .1, P1, Q0], [P0, Q1, P1, Q1 + .1]]) F.rect('pool', a, b, c, d, -1.6, .1, '#6ec9da');
  F.rect('poolwater', P0, Q0, P1, Q1, .02, .04, '#3aa6c2');
  for (let k = 0; k < 4; k++) F.rect('pool', P0, Q0, P0 + .5 * (4 - k), Q0 + 1.8, -1.75, -1.35 + k * .4 - .02, '#bfe6ee', true);
  for (const v of [-11, -5]) F.rect('glow', P1 - .04, v - .15, P1 - .02, v + .15, -.6, -.4, '#bff4ff');
  for (let k = 0; k < 3; k++) lounger(F.sub(40, -12 + k * 2.2, 0, .12), '#f2efe6');
  umbrella(F, 40, -4.5, .12, '#2f4a5f');
  // Gazebo: eight white columns, a lead-grey dome, a bench ring; lanterns.
  const gu = 52, gv2 = 12;
  F.cyl('stone', gu, gv2, 0, 3.4, .3, '#d9d3c6', 24, true);
  for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28; F.cyl('paint', gu + Math.cos(a) * 2.9, gv2 + Math.sin(a) * 2.9, .3, .14, 2.6, white, 10, true); }
  F.cyl('paint', gu, gv2, 2.9, 3.3, .3, white, 24); F.geo('stone', new T.SphereGeometry(3.2, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), gu, 3.2, gv2, '#6b7075', {scale: new T.Vector3(1, .55, 1)});
  F.cyl('paint', gu, gv2, 4.9, .12, .6, white, 8);
  F.pool(gu, gv2, .31, 2.6, .3); F.geo('glow', new T.SphereGeometry(.2, 12, 8), gu, 2.6, gv2, '#ffdca0');
  table(F.sub(gu, gv2, 0, .3), 1.2, 1.2, .74, '#e9e4da', '#e9e4da', 0, 'paint');
  for (let k = 0; k < 4; k++) { const a = k / 4 * 6.28 + .78; chair(F.sub(gu + Math.cos(a) * 1.1, gv2 + Math.sin(a) * 1.1, a + Math.PI, .3), '#f1eee6'); }
  // Parterre of clipped box, a rose border along the side, lawn lights.
  for (const [a, b, c, d] of [[54, -14, 60, -13.3], [54, -2.7, 60, -2], [54, -14, 54.7, -2], [59.3, -14, 60, -2], [56.7, -14, 57.3, -2], [54, -8.3, 60, -7.7]]) F.rbox('fabric', (a + c) / 2, .3, (b + d) / 2, c - a, .6, d - b, .2, box);
  for (const [cu, cv] of [[55.7, -11], [58.3, -11], [55.7, -5], [58.3, -5]]) for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; F.shrub(cu + Math.cos(a) * .6, cv + Math.sin(a) * 1.3, .4, .05, '#3f5f32', k); const [x, z] = F.w(cu + Math.cos(a) * .6, cv + Math.sin(a) * 1.3); F.kit.add('fabric', BLOBS[k % 4], x, F.y + .6, z, 0, k % 2 ? '#c23a4a' : '#f0c4cc', {scale: new T.Vector3(.22, .15, .22)}); }
  F.cyl('stone', 57, -8, 0, .5, .9, '#b8af9e', 12); F.geo('stone', new T.SphereGeometry(.35, 12, 8), 57, 1.2, -8, '#b8af9e');
  for (let u = 36; u < D - 2; u += 1.4) { F.shrub(u, hw - 1.8, .55, 0, '#3f5f32', u); if ((u * 10) % 3 < 2) F.kit.add('fabric', BLOBS[2], ...(() => { const [x, z] = F.w(u, hw - 1.8); return [x, F.y + .85, z]; })(), 0, u % 2.8 < 1.4 ? '#b8323c' : '#e8a0a8', {scale: new T.Vector3(.3, .2, .3)}); }
  for (let u = 36; u < D - 2; u += 6) F.cypress(u, -hw + 1.5, 7);
  for (const u of [38, 46, 54]) F.bollard(u, 4);
  // Detached carriage-house garage off the north leg of the drive.
  F.rect('stucco', 25.5, 19, 34.5, 27, 0, 3.4, white, true);
  for (const v of [21, 25]) {
    F.rect('wood', 25.42, v - 1.35, 25.47, v + 1.35, .08, 2.6, '#f2f0ea');
    for (const s of [-1, 1]) for (const [y0, y1] of [[.3, 1.2], [1.5, 2.4]]) F.rect('paint', 25.39, v + s * .65 - .45, 25.42, v + s * .65 + .45, y0, y1, '#dcd8cf');
    F.rect('paint', 25.38, v - .05, 25.42, v + .05, .08, 2.6, '#bdb8ae');
    F.rect('metal', 25.3, v - 1.9, 25.42, v - 1.6, 2.4, 2.9, black); F.rect('glow', 25.28, v - 1.85, 25.3, v - 1.65, 2.5, 2.8, '#ffd48f'); F.pool(24.6, v - 1.75, .09, 1.6, .3);
  }
  const ghip = new T.ConeGeometry(1, 1, 4, 1); ghip.rotateY(Math.PI / 4);
  F.geo('stone', ghip, 30, 3.4 + 1.3, 23, slate, {scale: new T.Vector3(9.8 * .75, 2.6, 8.8 * .75)});
  F.rect('stucco', 16, 18, 25.5, 28, -.3, .08, gravel);
  // Trees: two big oaks, palms at the kerb, a magnolia by the drive.
  shadeTree(F, 11, -22, 11, 0, '#3e5a2b', 2); shadeTree(F, 44, 22, 10, 0, '#44602f', 4); shadeTree(F, 60, -22, 9, 0, '#3b5629', 6);
  shadeTree(F, 13, 23, 6, 0, '#35532b', 8);
  F.palm(3.5, -hw + 4, 15, 0, true); F.palm(3.5, hw - 4, 16, 0, true);
  for (let v = -11; v <= 11; v += 2.2) if (Math.abs(v) > 3) F.shrub(u0 - .9, v, .55, 0, box, v);
  H.park = {u: 15, v: -8, face: -1};
  H.door = {u: u0 - 5, v: 0};
}

/* ------------------------------------------------------------ Koreatown bungalow */
function bungalow(F, H) {
  const D = H.depth, Wd = H.width, hw = Wd / 2;
  const stucco = '#d9c7a4', trim = '#7a8c86', bars = '#2a2a2a';
  F.rect('grass', 0, -hw, D, hw, -.25, .04, '#9c9463');                                          // dry lawn
  for (const [u, v, r] of [[3, 2, 1.6], [6.5, 3.5, 1.2], [20, -2, 2]]) F.cyl('line', u, v, .05, r, .01, '#a89c73', 12);   // bald patches
  F.rect('stucco', 0, -hw + .4, 16, -hw + 4, -.3, .07, '#a9a39a');                               // cracked drive
  for (const [a, b, c, d] of [[2, -hw + 1.5, 5, -hw + 1.53], [5, -hw + 1.5, 5.03, -hw + 3.2], [9, -hw + 2.8, 13, -hw + 2.83], [11, -hw + .8, 11.03, -hw + 2.8]]) F.rect('line', a, b, c, d, .07, .075, '#5d5a55');
  for (const [u, v, r] of [[4, -hw + 2, .8], [9, -hw + 2.5, 1.1]]) F.cyl('line', u, v, .075, r, .01, '#6d6962', 10);   // oil stains
  // Chain-link fence with a rolling gate across the drive.
  for (let v = -hw + 4.6; v <= hw; v += 2.2) F.col('metal', .2, v, 0, 1.5, .05, .05, '#9ea1a3', true);
  F.box('glass', .2, .75, (hw + (-hw + 4.6)) / 2, .02, 1.4, hw - (-hw + 4.6), '#b9bec0', true);
  F.box('metal', .2, 1.48, (hw + (-hw + 4.6)) / 2, .05, .05, hw - (-hw + 4.6), '#9ea1a3');
  F.box('metal', 1.6, 1.48, -hw + 2.3, 3, .05, .05, '#9ea1a3');
  F.box('glass', 1.6, .75, -hw + .45, 3, 1.4, .02, '#b9bec0');
  for (const v of [-hw, hw]) for (let u = .2; u <= D; u += 2.5) F.col('metal', u, v, 0, 1.5, .05, .05, '#9ea1a3', true);
  for (const v of [-hw, hw]) F.box('glass', D / 2, .75, v, D, 1.4, .02, '#b9bec0', true);
  // The house: one room and a bathroom, a porch, bars on the windows, a window AC.
  const u0 = 10, u1 = 18.5, v0 = -hw + 4.6, v1 = hw - .6, h = 2.8, pl = .4;
  F.rect('paint', u0, v0, u1, v1, 0, pl, '#8e877b', true);
  F.rect('wood', u0 + .1, v0 + .1, u1 - .1, v1 - .1, pl, pl + .02, '#8a6c4c');                    // worn laminate
  F.wall(u0, v0, u0, v1, h, .22, stucco, [[1.2, 2.2, 2.2], [3.9, 5.1, 2.3, 1], [6.3, 7.3, 2.3, 1]], 'stucco', pl);
  F.wall(u0, v0, u1, v0, h, .22, stucco, [[4.8, 5.6, 2.2, 1]], 'stucco', pl);
  F.wall(u0, v1, u1, v1, h, .22, stucco, [], 'stucco', pl);
  F.wall(u1, v0, u1, v1, h, .22, stucco, [[2, 3, 2.1, 1.2]], 'stucco', pl);
  F.wall(u0 + 5.8, v0, u0 + 5.8, v1, h, .1, '#cdbf9f', [[4.2, 5.2, 2.1]], 'paint', pl);          // bathroom partition
  for (const [a, b, c, d] of [[u0 + .12, v0, u0 + .13, v1], [u0, v0 + .12, u1, v0 + .13], [u0, v1 - .13, u1, v1 - .12], [u1 - .13, v0, u1 - .12, v1]]) F.rect('room', a, b, c, d, pl, pl + h, '#d8cdb4');
  F.rect('room', u0, v0, u1, v1, pl + h - .02, pl + h, '#9a927f');
  const roof = new T.CylinderGeometry(1, 1, 1, 3); roof.rotateZ(Math.PI / 2);
  F.geo('paint', roof, (u0 + u1) / 2, pl + h + .7, (v0 + v1) / 2, '#5d5147', {turn: Math.PI / 2, scale: new T.Vector3(v1 - v0 + 1, 1.4, (u1 - u0 + 1) * .62)});
  F.box('paint', (u0 + u1) / 2, pl + h + .05, (v0 + v1) / 2, u1 - u0 + .6, .1, v1 - v0 + .6, '#6b5f54');
  for (const v of [v0 + 4.5, v0 + 6.8]) {
    F.rect('glass', u0 - .02, v - .5, u0 + .02, v + .5, pl + 1, pl + 2.3, '#2b3238');
    for (let k = -2; k <= 2; k++) F.box('metal', u0 - .18, pl + 1.65, v + k * .22, .03, 1.35, .03, bars);
    for (const y of [pl + 1.05, pl + 2.25]) F.rect('metal', u0 - .2, v - .55, u0 - .16, v + .55, y - .02, y + .02, bars);
  }
  F.rect('glass', u0 + 4.8, v0 - .02, u0 + 5.6, v0 + .02, pl + 1, pl + 2.2, '#2b3238'); F.rect('glass', u1 - .02, v0 + 2, u1 + .02, v0 + 3, pl + 1.2, pl + 2.1, '#8a9aa3');
  F.rect('paint', u0 - .45, v1 - 1.75, u0 - .12, v1 - 1.05, pl + 1.2, pl + 1.6, '#bdb8ad');     // window AC unit
  // Porch: slab, posts, a tired couch, a plastic chair, a string of bulbs.
  F.rect('paint', u0 - 2.8, v0, u0, v0 + 4, 0, .3, '#9a948a', true);
  for (const s of [-1, 1]) F.col('paint', u0 - 2.6, v0 + 2 + s * 1.8, .3, h + .4, .12, .12, trim);
  F.box('paint', u0 - 1.4, h + .5, v0 + 2, 3, .12, 4.4, '#5d5147');
  sofa(F.sub(u0 - 1.6, v0 + 2.6, Math.PI, .3), 1.9, '#7c6a4c', '#4a3c2a');
  F.rbox('fabric', u0 - 1.3, .75, v0 + 3.1, .5, .15, .5, .05, '#5b6b7c');
  chair(F.sub(u0 - 1.2, v0 + .8, -Math.PI / 2, .3), '#e9e9e2');
  for (let k = 0; k <= 8; k++) { const t = k / 8, u = u0 - 2.6 + t * 2.4, v = v0 + .2 + t * 3.6; F.geo('glow', new T.SphereGeometry(.05, 8, 6), u, h + .3 - Math.sin(t * Math.PI) * .25, v, '#ffd28a'); }
  F.pool(u0 - 1.4, v0 + 2, .31, 2.4, .35);
  F.cyl('paint', u0 - .4, v0 + 3.7, .3, .22, .4, '#b3553a', 10); F.shrub(u0 - .4, v0 + 3.7, .35, .65, '#4d6b34', 4);
  for (const [k, c] of [[0, '#2b5c3a'], [1, '#2b3f5c'], [2, '#2a2a2a']]) F.col('paint', 17, -hw + 1 + k * .75, 0, 1.1, .6, .6, c, true);
  // A bike against the fence.
  for (const du of [0, 1.05]) F.geo('metal', new T.TorusGeometry(.33, .025, 6, 18), 20 + du, .34, hw - .4, '#222');
  F.rod('metal', [20, .34, hw - .4], [20.55, .75, hw - .4], .02, '#b0302a'); F.rod('metal', [20.55, .75, hw - .4], [21.05, .34, hw - .4], .02, '#b0302a'); F.rod('metal', [20.55, .75, hw - .4], [20.45, .95, hw - .4], .02, '#222');
  F.kit.indoor = 1;
  // Inside: a mattress on the floor, a TV on a milk crate, a kitchenette, a table, one bulb.
  const y = pl + .02;
  F.rbox('fabric', 14, y + .12, v1 - 1.2, 2, .24, 1.5, .06, '#d8d4c8'); F.rbox('fabric', 14.4, y + .26, v1 - 1.2, 1.1, .05, 1.52, .02, '#6a7b8c'); F.rbox('fabric', 13.2, y + .3, v1 - 1.2, .4, .12, 1, .05, '#f0eee8');
  F.rect('paint', 10.4, v0 + 3.3, 10.9, v0 + 3.8, y, y + .35, '#1f4e8c'); F.rect('paint', 10.55, v0 + 3.25, 10.65, v0 + 3.85, y + .35, y + .75, '#111'); F.rect('glow', 10.65, v0 + 3.28, 10.66, v0 + 3.82, y + .4, y + .7, '#8fb2ff');
  F.rect('wood', 12.9, v0 + .15, 14.6, v0 + .75, y, y + .88, '#b9b4a8'); F.rect('paint', 12.85, v0 + .1, 14.65, v0 + .8, y + .88, y + .92, '#8c8c86');
  F.rect('metal', 14, v0 + .2, 14.5, v0 + .7, y + .92, y + .95, '#222');
  F.rect('paint', 12.1, v0 + .15, 12.8, v0 + .8, y, y + 1.6, '#e6e4dc');                           // fridge
  table(F.sub(13.4, v0 + 2.6, 0, y), .8, .8, .74, '#7c5f42', '#555'); chair(F.sub(12.8, v0 + 2.6, 0, y), '#7a1f1f');
  F.rect('paint', 10.14, v1 - 2.4, 10.16, v1 - 1.2, y + 1.3, y + 2.1, '#c7422f');                  // a poster
  F.rect('metal', 12, v1 - .5, 13.5, v1 - .45, y + 1.55, y + 1.58, '#999');
  for (let k = 0; k < 5; k++) F.rect('fabric', 12.1 + k * .28, v1 - .6, 12.3 + k * .28, v1 - .35, y + .8, y + 1.55, ['#2b2b2b', '#6b2a2a', '#dcdcd4', '#2d4a6b', '#4c6b3a'][k]);
  F.rect('paint', 16.8, v1 - 1.1, 17.4, v1 - .5, y, y + .42, '#f1f1ec'); F.rect('paint', 17.9, v0 + .5, 18.3, v0 + 1.2, y + .7, y + .85, '#f1f1ec');   // toilet, sink
  F.rod('metal', [13, pl + h, (v0 + v1) / 2], [13, pl + h - .5, (v0 + v1) / 2], .008, '#111', 4);
  F.geo('glow', new T.SphereGeometry(.07, 10, 8), 13, pl + h - .56, (v0 + v1) / 2, '#ffe9b8'); F.pool(13, (v0 + v1) / 2, y + .01, 3, .3);
  // A power pole at the kerb with a sagging line to the house; a street tree.
  const [ppx, ppz] = F.w(-1.5, hw + .5);
  F.kit.cyl('wood', ppx, F.y - .5, ppz, .16, 10, '#6a5a44', 8, true, .13);
  F.kit.box('wood', ppx, F.y + 9.2, ppz, .1, .12, 2.2, F.yaw, '#5a4a36');
  const [hx, hz] = F.w(u0, v1);
  F.kit.rod('metal', [ppx, F.y + 8.8, ppz], [hx, F.y + pl + h, hz], .02, '#222', 4);
  shadeTree(F, 5, -hw + 5.4, 6, 0, '#56703a', 3);
  F.kit.indoor = 0;
  H.park = {u: 6, v: -hw + 2.2, face: -1};
  H.door = {u: u0 - 2, v: v0 + 1.7};
}

/** World pose for a home's parking spot (car facing the street) and its front door. */
export function homePose(h) {
  const [fx, fz] = h.f, l = Math.hypot(fx, fz), ux = fx / l, uz = fz / l, vx = -uz, vz = ux;
  const ox = h.road[0] + ux * h.setback, oz = h.road[1] + uz * h.setback;
  const at = (u, v) => [ox + ux * u + vx * v, oz + uz * u + vz * v];
  const [px, pz] = at(h.park.u, h.park.v), [dx, dz] = at(h.door.u, h.door.v);
  return {x: px, z: pz, y: h.pad.y, heading: Math.atan2(-ux, -uz), door: {x: dx, z: dz}};
}
