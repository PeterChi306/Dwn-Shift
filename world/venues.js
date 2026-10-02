/* Motorsport (2026-09-27): a road circuit and a drag strip, off the street
 * network so they never interfere with the city's roads.
 *
 *   Pacific Raceway   south-west corner by the beach (the empty land west of
 *                     Culver City): a 3 km flat circuit, 14 m wide, red and
 *                     white kerbs at every corner, gravel traps, armco all
 *                     round, a pit lane and garages, grandstands, a start
 *                     gantry, floodlight towers. Reached from the Culver City
 *                     grid through the paddock on its east side.
 *   Eastside Dragway  south-east corner: a quarter mile of two-lane strip
 *                     heading east with a Christmas tree at the start, timing
 *                     boards, a burnout box, concrete walls, grandstands and
 *                     a long shutdown into a sand trap. Reached from the end
 *                     of Whittier Boulevard.
 *
 * Both sit on levelled ground pads (planned before the city, so no lot or
 * tree lands on them). Timing runs every frame from `update()`: lap times on
 * the circuit, and on the strip a real tree sequence (pre-stage, stage,
 * three ambers, green, or red for a jump start), reaction time, 60 ft,
 * 1/8 mile, 1/4 mile ET and trap speed. Bests are kept per browser.
 */
import * as T from 'three';
import {RESERVED} from './places.js';
import {washDisc} from './kit.js';

/* ------------------------------------------------------------ the circuit */
const CIRCUIT = {
  y: 7.5, W: 14,
  pad: {cx: -6990, cz: 3215, hl: 655, hw: 580},
  // Clockwise from the north end of the main straight (which runs south).
  ctrl: [[-6560, 2800], [-6560, 3100], [-6560, 3450], [-6575, 3640], [-6650, 3745], [-6800, 3790], [-7000, 3780], [-7150, 3745],
    [-7300, 3770], [-7420, 3720], [-7470, 3620], [-7430, 3530], [-7385, 3390], [-7430, 3250], [-7400, 3100], [-7425, 2900],
    [-7400, 2760], [-7310, 2685], [-7180, 2705], [-7060, 2790], [-6940, 2765], [-6840, 2665], [-6700, 2625], [-6600, 2670]],
  sf: {x: -6560, z: 3300},              // start/finish line across the main straight
  pits: {x: -6512, z0: 2860, z1: 3460},   // pit lane centreline x, garages from z0 to z1
  paddock: {x0: -6484, x1: -6262, z0: 3180, z1: 3470},
};
/* ------------------------------------------------------------ the strip */
const DRAG = {y: 9.5, x0: 6200, len: 402.3, end: 7480, zc: 3625, lanes: [3619.5, 3630.5],
  pad: {cx: 6830, cz: 3620, hl: 790, hw: 80}, access: [[6420, 3262], [6420, 3420], [6300, 3560], [6150, 3600]]};

export function planVenues(places) {
  const g = places.ground;
  // Pads: hl runs along (fx, fz). The circuit is long north-south, the strip east-west.
  for (const [v, P, fx, fz] of [[CIRCUIT, CIRCUIT.pad, 0, 1], [DRAG, DRAG.pad, 1, 0]]) {
    g.addPad({cx: P.cx, cz: P.cz, fx, fz, hl: P.hl, hw: P.hw, y: v.y, margin: 45});
    // Reserve with circles along the long axis (lots and trees stay off).
    const n = Math.max(1, Math.ceil(P.hl / P.hw));
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0 : k / (n - 1) * 2 - 1, off = t * (P.hl - P.hw);
      RESERVED.push({x: P.cx + fx * off, z: P.cz + fz * off, r: P.hw * 1.45 + 30});
    }
  }
  places.pois.push({name: 'Pacific Raceway', kind: 'raceway', x: CIRCUIT.paddock.x0 + 60, z: (CIRCUIT.paddock.z0 + CIRCUIT.paddock.z1) / 2},
    {name: 'Eastside Dragway', kind: 'raceway', x: DRAG.x0 - 30, z: DRAG.zc});
  places.extras.push((kit, pl) => { buildCircuit(kit, pl); buildDrag(kit, pl); });
}

/* ------------------------------------------------------------ geometry helpers */
/** Closed centripetal Catmull-Rom through the control points, every ~`step` m. */
function loop(ctrl, step) {
  const n = ctrl.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), m = Math.max(2, Math.ceil(L / step));
    for (let k = 0; k < m; k++) {
      const t = k / m, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  // Frames: tangent, left normal, signed curvature.
  return out.map((p, i) => {
    const a = out[(i - 1 + out.length) % out.length], b = out[(i + 1) % out.length];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const a2 = out[(i - 3 + out.length) % out.length], b2 = out[(i + 3) % out.length];
    const h1 = Math.atan2(p[1] - a2[1], p[0] - a2[0]), h2 = Math.atan2(b2[1] - p[1], b2[0] - p[0]);
    let dh = h2 - h1; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const ds = Math.hypot(p[0] - a2[0], p[1] - a2[1]) + Math.hypot(b2[0] - p[0], b2[1] - p[1]);
    return {x: p[0], z: p[1], tx, tz, nx: -tz, nz: tx, k: dh / Math.max(ds, 1e-3)};
  });
}
/** A continuous band between lateral offsets a..b (left normal positive) at height y. */
function band(kit, mat, path, a, b, y, color, {closed = true, from = 0, to = path.length, colorAt = null} = {}) {
  const pos = [], col = [], c0 = new T.Color(color), cc = new T.Color();
  const last = closed ? to : to - 1;
  for (let i = from; i < last; i++) {
    const p = path[i % path.length], q = path[(i + 1) % path.length];
    const P = [[p.x + p.nx * a, p.z + p.nz * a], [p.x + p.nx * b, p.z + p.nz * b], [q.x + q.nx * b, q.z + q.nz * b], [q.x + q.nx * a, q.z + q.nz * a]];
    const c = colorAt ? cc.set(colorAt(i)) : c0;
    // Two triangles, wound to face up.
    const tri = [P[0], P[1], P[2], P[0], P[2], P[3]];
    const up = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[1][1] - P[0][1]) * (P[2][0] - P[0][0]) < 0;
    const order = up ? [0, 1, 2, 3, 4, 5] : [0, 2, 1, 3, 5, 4];
    for (const k of order) { pos.push(tri[k][0], y, tri[k][1]); col.push(c.r, c.g, c.b); }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new T.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  (kit.parts.get(mat) || kit.parts.set(mat, []).get(mat)).push(geo);
}
const yawOf = (tx, tz) => Math.atan2(-tz, tx);

/** Stepped grandstand along a line (x0,z0)->(x1,z1), rows rising away from the side `face` points to. */
function grandstand(kit, x0, z0, x1, z1, y, fx, fz, rows = 9, roof = true) {
  const L = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const seats = ['#1f5fa8', '#d23b2b', '#f2f2ee', '#1f5fa8'];
  for (let r = 0; r < rows; r++) {
    const back = r * .9 + .5, h = r * .55 + .5;
    kit.box('paint', cx - fx * back, y + h / 2, cz - fz * back, L, h, .9, yaw, '#9d9a93', r === rows - 1);
    kit.box('paint', cx - fx * (back - .2), y + h + .18, cz - fz * (back - .2), L - .4, .36, .4, yaw, seats[Math.floor(r / 3) % seats.length]);
  }
  const depth = rows * .9 + .5;
  kit.box('paint', cx - fx * depth, y + rows * .55 / 2 + 1, cz - fz * depth, L, rows * .55 + 2, .4, yaw, '#8a8781', true);
  if (roof) {
    const H = rows * .55 + 5;
    for (let s = -L / 2 + 2; s <= L / 2 - 2; s += 12) {
      const ux = (x1 - x0) / L, uz = (z1 - z0) / L;
      kit.post('metal', cx + ux * s - fx * depth, y, y + H, cz + uz * s - fz * depth, .35, .35, yaw, '#4a4d52', true);
    }
    kit.box('paint', cx - fx * depth * .5, y + H + .2, cz - fz * depth * .5, L + 2, .3, depth + 3, yaw, '#e9e9e4');
    kit.box('glow', cx - fx * depth * .5, y + H, cz - fz * depth * .5, L - 4, .05, .4, yaw, '#fff3dc');
  }
}
/** A floodlight tower: a mast and a bank of lamps turned toward (tx, tz). */
function lightTower(kit, x, z, y, ax, az, h = 22) {
  kit.cyl('metal', x, y, z, .35, h, '#8c9096', 8, true, .22);
  const yaw = Math.atan2(ax - x, az - z);
  kit.box('metal', x, y + h + .8, z, 4.2, 1.8, .5, yaw + Math.PI / 2, '#3b3e42');
  for (let i = -1; i <= 1; i++) for (const j of [-.4, .4]) kit.box('glow', x + Math.cos(yaw) * i * 1.3, y + h + .8 + j, z - Math.sin(yaw) * i * 1.3, 1.1, .6, .12, yaw + Math.PI / 2, '#fff8ea');
}

/* ------------------------------------------------------------ circuit */
function buildCircuit(kit) {
  const C = CIRCUIT, y = C.y, W = C.W, path = loop(C.ctrl, 3);
  C.path = path;
  // Asphalt, edge lines, then kerbs on the corners and gravel on the outside of the big ones.
  band(kit, 'flood', path, -W / 2, W / 2, y + .06, '#39393b');
  band(kit, 'flood', path, -W / 2 + .3, -W / 2 + .55, y + .075, '#efefe9');
  band(kit, 'flood', path, W / 2 - .55, W / 2 - .3, y + .075, '#efefe9');
  // Grass shoulders a shade darker than the infield, and run-off.
  band(kit, 'flood', path, -W / 2 - 3, -W / 2, y + .045, '#6d8446');
  band(kit, 'flood', path, W / 2, W / 2 + 3, y + .045, '#6d8446');
  const corner = i => Math.abs(path[i].k) > 1 / 140;
  for (let i = 0; i < path.length; i++) {
    if (!corner(i)) continue;
    const s = Math.sign(path[i].k), inner = s > 0 ? 1 : -1;       // positive curvature turns left: inside is the left
    const stripe = Math.floor(i / 1) % 2 ? '#d7261e' : '#f2f2ee';
    for (const side of [inner, -inner]) {
      const a = side > 0 ? W / 2 : -W / 2 - 1.3, b = side > 0 ? W / 2 + 1.3 : -W / 2;
      band(kit, 'flood', path, a, b, y + .1, stripe, {closed: false, from: i, to: i + 2});
    }
    // Gravel trap on the outside of the tighter corners.
    if (Math.abs(path[i].k) > 1 / 90) {
      const out = -inner, a = out > 0 ? W / 2 + 1.3 : -W / 2 - 22, b = out > 0 ? W / 2 + 22 : -W / 2 - 1.3;
      band(kit, 'flood', path, a, b, y + .055, '#c9b48a', {closed: false, from: i, to: i + 2});
    }
  }
  // Armco on the outside of every corner and along both sides elsewhere, far
  // enough out to leave run-off; the pit straight gets a pit wall instead.
  // (n is the RIGHT-hand normal here; positive curvature is a right turn.)
  const pitSide = (p, side) => Math.abs(p.x - C.sf.x) < 30 && p.z > C.pits.z0 - 120 && p.z < C.pits.z1 + 120 && p.nx * side > 0;
  for (let i = 0; i < path.length; i += 3) {
    const p = path[i], q = path[(i + 3) % path.length];
    for (const side of [-1, 1]) {
      if (pitSide(p, side)) continue;                              // east side of the straight: the pits
      const inner = Math.sign(p.k) === side && Math.abs(p.k) > 1 / 300;
      const off = inner ? W / 2 + 6 : W / 2 + (Math.abs(p.k) > 1 / 90 ? 25 : 12);
      const ax = p.x + p.nx * side * off, az = p.z + p.nz * side * off, bx = q.x + q.nx * side * off, bz = q.z + q.nz * side * off;
      kit.beam('metal', ax, az, bx, bz, y + .55, .35, .12, '#c7cacd', true);
      kit.post('metal', ax, y, y + .7, az, .12, .12, 0, '#7d8186');
    }
  }
  // Pit wall with the pit lane and garages behind it.
  const px = C.pits.x, pz0 = C.pits.z0 - 110, pz1 = C.pits.z1 + 110;
  kit.box('paint', C.sf.x + W / 2 + 4, y + .6, (C.pits.z0 + C.pits.z1) / 2, .6, 1.2, C.pits.z1 - C.pits.z0 + 150, 0, '#e8e6e0', true);
  kit.box('flood', px, y + .06, (pz0 + pz1) / 2, 14, .06, pz1 - pz0 - 40, 0, '#414143');
  for (const [z, dir] of [[pz0, -1], [pz1, 1]]) {                  // entry and exit, angled onto the track
    const zz = z + dir * 10;
    kit.beam('flood', px, zz - dir * 20, C.sf.x + W / 2 - 1, zz + dir * 45, y + .061, .06, 12, '#414143');
  }
  kit.box('flood', px - 6.6, y + .08, (pz0 + pz1) / 2, .25, .06, pz1 - pz0 - 60, 0, '#f2f2ee');
  // Garages: a long pit building with bays, a glass control tower over the line.
  const gx = px + 11, gz0 = C.pits.z0, gz1 = C.pits.z1, gL = gz1 - gz0;
  kit.box('paint', gx + 6, y + 3.5, (gz0 + gz1) / 2, 12, 7, gL, 0, '#eeede8', true);
  for (let z = gz0 + 6; z < gz1 - 4; z += 12) {
    kit.box('paint', gx - .02, y + 2.2, z, .1, 4.4, 9, 0, '#2c2f33');
    kit.box('glow', gx - .06, y + 4.7, z, .05, .25, 9, 0, '#fff1d8');
  }
  kit.box('paint', gx + 6, y + 7.3, (gz0 + gz1) / 2, 13, .6, gL + 1, 0, '#1f5fa8');
  const tz = C.sf.z;
  kit.box('paint', gx + 6, y + 10, tz, 12, 6, 30, 0, '#e3e1db', true);
  kit.box('glass', gx - .1, y + 10.2, tz, .1, 3.6, 28, 0, '#7fa6c0');
  kit.box('paint', gx + 6, y + 13.3, tz, 14, .6, 32, 0, '#1f5fa8');
  // Start/finish: a chequered line, grid boxes, and a gantry with the start lights.
  for (let k = 0; k < 14; k++) for (const r of [0, 1]) kit.box('flood', C.sf.x - W / 2 + .5 + k, y + .09, tz + r - .5, 1, .02, 1, 0, (k + r) % 2 ? '#111' : '#f5f5f5');
  for (let g = 1; g <= 12; g++) kit.box('flood', C.sf.x + (g % 2 ? -3 : 3), y + .08, tz - 8 * g, 3, .02, .2, 0, '#f2f2ee');
  for (const s of [-1, 1]) kit.post('metal', C.sf.x + s * (W / 2 + 2), y, y + 8, tz, .5, .5, 0, '#3a3d42', true);
  kit.box('paint', C.sf.x, y + 7.8, tz, W + 5, 1.4, .8, 0, '#1b1c1f');
  for (let k = -2; k <= 2; k++) kit.box('glow', C.sf.x + k * 1.6, y + 7.8, tz - .42, .8, .8, .06, 0, '#ff2a1a');
  // Grandstands: along the straight on the infield, and at the hairpin.
  grandstand(kit, C.sf.x - W / 2 - 16, 3020, C.sf.x - W / 2 - 16, 3420, y, 1, 0, 12);
  grandstand(kit, -7535, 3480, -7535, 3700, y, 1, 0, 8);
  grandstand(kit, -6700, 3830, -6920, 3842, y, 0, -1, 7, false);
  // Paddock: asphalt, lines, a hospitality block, and the gate to the city.
  const P = C.paddock;
  kit.box('flood', (P.x0 + P.x1) / 2, y + .05, (P.z0 + P.z1) / 2, P.x1 - P.x0, .06, P.z1 - P.z0, 0, '#48484a');
  for (let x = P.x0 + 20; x < P.x1 - 10; x += 3) kit.box('flood', x, y + .07, P.z0 + 12, .12, .02, 5.5, 0, '#e8e8e2');
  kit.box('paint', P.x0 + 60, y + 4, P.z1 - 20, 60, 8, 22, 0, '#f1efe9', true);
  kit.box('glass', P.x0 + 60, y + 4.5, P.z1 - 31.1, 56, 5, .1, 0, '#8fb1c6');
  kit.box('paint', P.x0 + 60, y + 8.3, P.z1 - 20, 62, .6, 24, 0, '#d7261e');
  for (const s of [-1, 1]) kit.post('paint', P.x1 - 4, y, y + 5, (P.z0 + P.z1) / 2 + s * 9, 1, 1, 0, '#2c2f33', true);
  kit.box('paint', P.x1 - 4, y + 5.2, (P.z0 + P.z1) / 2, 1.2, 1.2, 20, 0, '#1f5fa8');
  kit.box('lit', P.x1 - 3.35, y + 5.2, (P.z0 + P.z1) / 2, .05, .8, 16, 0, '#f4f4ee');
  // Floodlights round the outside.
  // Floodlights round the outside, each throwing a pool of light across the track after dark.
  for (let i = 0; i < path.length; i += 48) {
    const p = path[i], side = Math.sign(p.k) >= 0 ? -1 : 1, off = W / 2 + 32;
    lightTower(kit, p.x + p.nx * side * off, p.z + p.nz * side * off, y, p.x, p.z);
    kit.add('wash', washDisc(95, .16, new T.Color('#fff1dc')), p.x + p.nx * side * 8, y + .12, p.z + p.nz * side * 8, 0, '#fff', {keep: true});
  }
}

/* ------------------------------------------------------------ drag strip */
function buildDrag(kit, places) {
  const D = DRAG, y = D.y, x0 = D.x0 - 60, x1 = D.end, L = x1 - x0, cx = (x0 + x1) / 2, zc = D.zc;
  kit.box('flood', cx, y + .06, zc, L, .06, 26, 0, '#353537');
  kit.box('flood', D.x0 + D.len / 2, y + .065, zc, D.len + 40, .06, 22, 0, '#2b2b2c');              // the rubbered launch area, darker
  kit.box('flood', D.x0 - 40, y + .068, zc, 30, .06, 22, 0, '#1e1e1f');                              // burnout box
  for (const z of [zc - .15, zc + .15]) kit.box('flood', cx, y + .08, z, L, .02, .12, 0, '#f0d21c');
  for (const s of [-1, 1]) kit.box('flood', cx, y + .08, zc + s * 10.6, L, .02, .25, 0, '#f2f2ee');
  for (const [x, c] of [[D.x0, '#f2f2ee'], [D.x0 + 18.3, '#9aa0a6'], [D.x0 + 201.2, '#9aa0a6'], [D.x0 + D.len, '#e0261c']]) kit.box('flood', x, y + .085, zc, .4, .02, 21, 0, c);
  // Concrete walls both sides, with the shutdown's sand trap and nets at the end.
  for (const s of [-1, 1]) kit.box('paint', cx, y + .55, zc + s * 13.3, L, 1.1, .6, 0, '#d9d6cf', true);
  kit.box('flood', x1 + 40, y + .07, zc, 80, .06, 26, 0, '#cfb98f');
  for (let z = -12; z <= 12; z += 3) kit.post('metal', x1 + 82, y, y + 4, zc + z, .12, .12, 0, '#5d6166');
  kit.box('paint', x1 + 82, y + 2.2, zc, .05, 3.6, 25, 0, '#2d3134', true);
  // Timing boards at the finish, towers either side.
  for (const s of [-1, 1]) {
    kit.post('metal', D.x0 + D.len + 6, y, y + 7, zc + s * 16, .5, .5, 0, '#3a3d42', true);
    kit.box('paint', D.x0 + D.len + 6, y + 8, zc + s * 16, .6, 2.4, 5, 0, '#15171a');
    kit.box('glow', D.x0 + D.len + 5.68, y + 8, zc + s * 16, .05, 1.6, 4.4, 0, '#ffb23a');
  }
  // Grandstands along the launch, a tower over the start, light poles.
  grandstand(kit, D.x0 - 20, zc - 22, D.x0 + 180, zc - 22, y, 0, 1, 10);
  grandstand(kit, D.x0 + 20, zc + 22, D.x0 + 240, zc + 22, y, 0, -1, 7, false);
  kit.box('paint', D.x0 - 20, y + 5, zc + 26, 14, 10, 9, 0, '#eeede8', true);
  kit.box('glass', D.x0 - 20, y + 7, zc + 21.4, 13, 3, .1, 0, '#86aac2');
  kit.box('paint', D.x0 - 20, y + 10.3, zc + 26, 16, .6, 11, 0, '#e59a00');
  for (let x = x0 + 30; x < x1; x += 70) for (const s of [-1, 1]) {
    kit.cyl('metal', x, y, zc + s * 15.5, .2, 12, '#8c9096', 8, true);
    kit.box('metal', x, y + 12.2, zc + s * 15, 1.8, .4, 1, 0, '#3b3e42');
    kit.box('glow', x, y + 11.98, zc + s * 14.6, 1.6, .06, .8, 0, '#fff6e2');
    if (s > 0) kit.add('wash', washDisc(40, .2, new T.Color('#fff1dc')), x, y + .12, zc, 0, '#fff', {keep: true});
  }
  // Staging lanes and the access road down from Whittier Boulevard (laid on the ground).
  const g = places.ground, pts = [];
  for (let i = 0; i < D.access.length - 1; i++) {
    const [ax, az] = D.access[i], [bx, bz] = D.access[i + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 6);
    for (let k = 0; k < n; k++) { const t = k / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t; pts.push([px, g.height(px, pz) + .03, pz]); }
  }
  pts.push([D.x0 - 60, y + .03, zc]);
  kit.ribbon('flood', pts, 9, '#3c3c3e', .05);
  // The Christmas tree: its own lamps (they switch), on a post between the lanes.
  const tree = new T.Group(), tx = D.x0 - 6;
  const post = new T.Mesh(new T.BoxGeometry(.3, 3.4, .3), new T.MeshStandardMaterial({color: '#2b2d31', roughness: .5}));
  post.position.set(tx, y + 1.7, zc); tree.add(post);
  const lamp = color => new T.MeshStandardMaterial({color: '#1a1a1a', emissive: color, emissiveIntensity: 0, roughness: .4, toneMapped: false});
  const rows = [['pre', '#ffd23a'], ['stage', '#ffd23a'], ['a1', '#ffab1a'], ['a2', '#ffab1a'], ['a3', '#ffab1a'], ['go', '#2dff5a'], ['red', '#ff1a14']];
  const lamps = {};
  rows.forEach(([key, color], k) => {
    for (const [lane, dz] of [[0, -.32], [1, .32]]) {
      const m = lamp(color), mesh = new T.Mesh(new T.CylinderGeometry(.13, .13, .08, 14), m);
      mesh.rotation.z = Math.PI / 2; mesh.position.set(tx - .2, y + 3.3 - k * .36, zc + dz); tree.add(mesh);
      (lamps[key] ||= [])[lane] = m;
    }
  });
  const housing = new T.Mesh(new T.BoxGeometry(.3, 2.7, 1.05), new T.MeshStandardMaterial({color: '#141518', roughness: .6}));
  housing.position.set(tx + .02, y + 2.2, zc); tree.add(housing);
  places.scene.add(tree);
  D.lamps = lamps; D.tree = tree;
}

/* ------------------------------------------------------------ timing */
const load = k => { try { return +localStorage.getItem(k) || 0; } catch { return 0; } };
const save = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };
const fmt = s => s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}` : s.toFixed(3);

export class RaceTiming {
  constructor({hud, notify}) {
    this.hud = hud; this.notify = notify;
    this.lap = null; this.best = load('dwnBestLap'); this.last = 0;
    this.drag = {state: 'idle', t: 0}; this.bestET = load('dwnBestET');
    this.prev = null;
  }
  inCircuit(x, z) { const P = CIRCUIT.pad; return Math.abs(x - P.cx) < P.hw + 30 && Math.abs(z - P.cz) < P.hl + 30; }   // hl along z
  inDrag(x, z) { return x > DRAG.x0 - 140 && x < DRAG.end + 90 && Math.abs(z - DRAG.zc) < 60; }
  update(dt, {x, z, v, kmh}) {
    const now = performance.now() / 1000, prev = this.prev || {x, z};
    this.prev = {x, z};
    let show = null;
    /* Circuit: crossing the line southward, on the track, starts or ends a lap. */
    if (this.inCircuit(x, z)) {
      const {sf, W} = CIRCUIT;
      if (prev.z < sf.z && z >= sf.z && Math.abs(x - sf.x) < W / 2 + 1) {
        if (this.lap) {
          const t = now - this.lap; this.last = t;
          const best = !this.best || t < this.best; if (best) { this.best = t; save('dwnBestLap', t); }
          this.notify(`Lap · ${fmt(t)}${best ? ' · NEW BEST' : ''}`);
        } else this.notify('Pacific Raceway · lap started');
        this.lap = now;
      }
      show = {title: 'PACIFIC RACEWAY', venue: 'circuit', main: this.lap ? fmt(now - this.lap) : '—:——', sub: `LAST ${this.last ? fmt(this.last) : '—'} · BEST ${this.best ? fmt(this.best) : '—'}`};
    } else this.lap = null;
    /* Drag strip: stage, the tree, the run (2026-10-02: a 3.5 m staging zone,
     * an automatic idle creep no longer drops the stage or red-lights you;
     * only rolling clearly through the beam before the green does). */
    const D = DRAG, d = this.drag, lane = D.lanes.findIndex(lz => Math.abs(z - lz) < 5.5);
    let tree = {};
    if (this.inDrag(x, z)) {
      const setTree = on => { tree = on; for (const [k, arr] of Object.entries(D.lamps || {})) arr.forEach((m, i) => { m.emissiveIntensity = on[k] && (on.lane === undefined || on.lane === i) ? 5 : 0; }); };
      const inBox = lane >= 0 && x > D.x0 - 3 && x < D.x0 + .6;
      const staged = inBox && Math.abs(v) < 1.2;
      if (d.state === 'idle' || d.state === 'done') {
        if (d.state === 'done' && now - d.t > 6 && x < D.x0 - 3) d.state = 'idle';
        if (d.state === 'idle') {
          setTree({pre: lane >= 0 && x > D.x0 - 9 && x < D.x0 + .6, stage: staged, lane});
          if (staged) { d.state = 'staged'; d.t = now; d.lane = lane; }
        }
      } else if (d.state === 'staged' || d.state === 'tree') {
        const e = now - d.t;
        if (x > D.x0 + 1.6) {                                           // rolled through before the green: red light
          setTree({red: true, pre: true, lane: d.lane}); d.state = 'done'; d.t = now; d.result = null; this.notify('RED LIGHT · jumped the start');
        } else if (x < D.x0 - 4 || lane !== d.lane) { d.state = 'idle'; setTree({}); }
        else {
          if (e > 1.2) d.state = 'tree';
          const a = e - 1.2;
          setTree({pre: true, stage: true, a1: a > 0, a2: a > .5, a3: a > 1, go: a > 1.5, lane: d.lane});
          if (a > 1.5) { d.state = 'run'; d.green = now; d.left = x > D.x0 + .8 ? now : null; d.splits = {}; }
        }
      } else if (d.state === 'run') {
        if (d.left === null && x > D.x0 + .8) d.left = now;
        setTree({pre: true, stage: true, go: now - d.green < 2, lane: d.lane});
        const since = d.left ?? now;
        for (const [key, dist] of [['60ft', 18.3], ['eighth', 201.2]]) if (!d.splits[key] && x > D.x0 + dist) d.splits[key] = now - since;
        if (x > D.x0 + D.len) {
          const et = now - since, rt = since - d.green, best = !this.bestET || et < this.bestET;
          if (best) { this.bestET = et; save('dwnBestET', et); }
          d.result = {et, rt, trap: kmh, sixty: d.splits['60ft'], eighth: d.splits.eighth, best};
          this.notify(`1/4 MILE · ${et.toFixed(3)} s @ ${Math.round(kmh)} km/h${best ? ' · NEW BEST' : ''}`);
          d.state = 'done'; d.t = now; setTree({});
        } else if (x < D.x0 - 20 || lane < 0 && x < D.x0 + 30) { d.state = 'idle'; setTree({}); }
      }
      const r = d.result, toLine = D.x0 - .6 - x;
      show = {title: 'EASTSIDE DRAGWAY', tree, venue: 'drag',
        main: d.state === 'run' ? (d.left ? (now - d.left).toFixed(2) : 'GO') : d.state === 'staged' || d.state === 'tree' ? 'STAGED' : r ? `${r.et.toFixed(3)} s` : lane >= 0 && toLine > 0 && toLine < 40 ? `${toLine.toFixed(1)} m TO THE LINE` : 'STAGE AT THE LINE',
        sub: d.state === 'staged' || d.state === 'tree' ? 'HOLD IT ON THE BRAKE · LAUNCH ON GREEN'
          : r ? `RT ${r.rt.toFixed(3)} · 60FT ${r.sixty?.toFixed(3) ?? '—'} · 1/8 ${r.eighth?.toFixed(3) ?? '—'} · ${Math.round(r.trap)} KM/H · BEST ${this.bestET ? this.bestET.toFixed(3) : '—'}`
          : `Roll up to the white line in either lane and stop · BEST ${this.bestET ? this.bestET.toFixed(3) : '—'}`};
    }
    this.hud(show);
  }
}
/** Outlines for the map (world/atlas.js draws them like roads). */
export function venueOutlines() {
  const path = CIRCUIT.path || loop(CIRCUIT.ctrl, 6);
  return [{pts: path.map(p => [p.x, p.z]), closed: true, w: CIRCUIT.W, color: '#ff8a5c'},
    {pts: [[DRAG.x0 - 60, DRAG.zc], [DRAG.end, DRAG.zc]], w: 22, color: '#ff8a5c'},
    {pts: DRAG.access.concat([[DRAG.x0 - 60, DRAG.zc]]), w: 9, color: '#9aa7ad'}];
}
export {CIRCUIT, DRAG};
