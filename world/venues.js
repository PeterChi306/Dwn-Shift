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
  paddock: {x0: -6484, x1: -6312, z0: 3180, z1: 3470},
  // 2026-10-02: Raceway Drive (tools/add_venue_roads.mjs) comes in from
  // Culver City Loop to the gate; the visitor car park's main aisle runs from
  // the gate straight through a drive-through garage bay into the pit lane;
  // the team paddock (haulers, hospitality) is south of it with its own bay.
  gate: [-6302, 3385.3], lot: {x0: -6447, x1: -6314, z0: 3330, z1: 3470}, through: [3385.3, 3250],
};
/* ------------------------------------------------------------ the strip */
const DRAG = {y: 9.5, x0: 6200, len: 402.3, end: 7480, zc: 3625, lanes: [3619.5, 3630.5],
  pad: {cx: 6830, cz: 3620, hl: 790, hw: 80},
  // 2026-10-02: Dragway Drive (tools/add_venue_roads.mjs) ends at the car
  // park's east gate; the car park opens onto the pre-staging apron at the
  // west end; a return road runs back along the south side from a gap in the
  // shutdown wall. The tree stands just past the line, between the lanes.
  gate: [6409.6, 3480], lot: {x0: 6125, x1: 6400, z0: 3440, z1: 3526},
  apron: {x0: 6036, x1: 6142, z0: 3546, z1: 3697}, ret: {z: 3684, x0: 6060, x1: 7445}, exitGap: [7372, 7468], treeX: 6207.5};

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
  // Car parks and the raceway paddock: level with their venue.
  const L = DRAG.lot; g.addPad({cx: (L.x0 + L.x1) / 2, cz: (L.z0 + L.z1) / 2, fx: 1, fz: 0, hl: (L.x1 - L.x0) / 2 + 4, hw: (L.z1 - L.z0) / 2 + 4, y: DRAG.y, margin: 30});
  RESERVED.push({x: (L.x0 + L.x1) / 2, z: (L.z0 + L.z1) / 2, r: 160});
  const Pd = CIRCUIT.paddock; g.addPad({cx: (Pd.x0 + Pd.x1) / 2, cz: (Pd.z0 + Pd.z1) / 2, fx: 0, fz: 1, hl: (Pd.z1 - Pd.z0) / 2 + 4, hw: (Pd.x1 - Pd.x0) / 2 + 4, y: CIRCUIT.y, margin: 22});
  RESERVED.push({x: (Pd.x0 + Pd.x1) / 2, z: (Pd.z0 + Pd.z1) / 2, r: 150});
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
  const ux = (x1 - x0) / L, uz = (z1 - z0) / L, shirts = ['#d23b2b', '#f2f2ee', '#1f5fa8', '#f2c21a', '#2b2b2b', '#2bb673', '#ff7a2a', '#7a2cff', '#e8b7a0'];
  let seed = Math.floor(Math.abs(x0 * 7.3 + z0 * 3.1)) % 9973 + 1; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  for (let r = 0; r < rows; r++) {
    const back = r * .9 + .5, h = r * .55 + .5;
    kit.box('paint', cx - fx * back, y + h / 2, cz - fz * back, L, h, .9, yaw, '#9d9a93', r === rows - 1);
    kit.box('paint', cx - fx * (back - .2), y + h + .18, cz - fz * (back - .2), L - .4, .36, .4, yaw, seats[Math.floor(r / 3) % seats.length]);
    // The crowd: people in twos and threes, a seat in from the aisles.
    for (let sAl = -L / 2 + 1; sAl < L / 2 - 1; sAl += .62) {
      if (rnd() > .5 || Math.abs((sAl + L / 2) % 20 - 10) < .8) continue;
      const px = cx + ux * sAl - fx * (back - .25), pz = cz + uz * sAl - fz * (back - .25), py = y + h + .36;
      kit.box('paint', px, py + .3, pz, .42, .6, .3, yaw, shirts[Math.floor(rnd() * shirts.length)]);
      kit.box('paint', px, py + .72, pz, .2, .24, .22, yaw, rnd() < .5 ? '#e0b494' : rnd() < .5 ? '#8a5a3c' : '#c99a78');
    }
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
function buildCircuit(kit, places) {
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
  const pitSide = (p, side) => Math.abs(p.x - C.sf.x) < 40 && p.z > 2630 && p.z < 3650 && p.nx * side > 0;
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
  // Pit wall, then the pit lane: it leaves the track before the main straight
  // and rejoins it after the line, both ends blended into the track's edge.
  const group = new T.Group(); places.scene.add(group); group.matrixAutoUpdate = false; group.userData.farCull = 3500;   // static; hidden when far (world.js)
  const px = C.pits.x, tz = C.sf.z, E = C.sf.x + W / 2;                 // track's east (pit-side) edge
  kit.box('paint', E + 4, y + .6, (C.pits.z0 + C.pits.z1) / 2, .6, 1.2, C.pits.z1 - C.pits.z0 + 150, 0, '#e8e6e0', true);
  for (let z = C.pits.z0 - 75; z < C.pits.z1 + 75; z += 4) kit.box('paint', E + 4, y + 1.22, z, .62, .04, 2, 0, Math.floor(z / 4) % 2 ? '#c8141c' : '#f2f2ee');
  const lane = [[E - 2, 2640], [E - .5, 2680], [E + 9, 2725], [px - 1, 2765], [px, 2800]];
  for (let z = 2830; z < 3500; z += 30) lane.push([px, z]);
  lane.push([px, 3530], [px - 1, 3560], [E + 9, 3592], [E - .5, 3625], [E - 2.5, 3650]);
  kit.ribbon('flood', lane.map(([x, z]) => [x, y + .01, z]), 13, '#414143', .052);
  for (const o of [-6.3, 6.3]) kit.ribbon('flood', lane.map(([x, z], i) => { const q = lane[Math.min(i + 1, lane.length - 1)], r = lane[Math.max(i - 1, 0)], tx = q[0] - r[0], tz2 = q[1] - r[1], l = Math.hypot(tx, tz2) || 1; return [x - tz2 / l * o, y + .01, z + tx / l * o]; }), .2, '#f2f2ee', .06);
  kit.box('flood', px + 2.2, y + .07, (C.pits.z0 + C.pits.z1) / 2, .2, .02, C.pits.z1 - C.pits.z0, 0, '#f2f2ee');          // fast lane | working lane
  for (const z of [2800, 3530]) kit.box('flood', px, y + .072, z, 13, .02, .4, 0, '#f2f2ee');                          // speed-limit lines
  for (const [z, t, sub] of [[2790, 'PIT 60', 'SPEED LIMIT'], [3540, 'PIT EXIT', 'BLEND LINE ←']]) {
    kit.post('metal', px - 7, y, y + 2.2, z, .12, .12, 0, '#6d7177');
    board(group, 2.4, 1.1, px - 7, y + 2.7, z, z < 3000 ? Math.PI : 0, textBoard('#f2f2ee', '#c8141c', t, sub), {glow: .4});
  }
  for (const sd of [-1, 1]) { kit.cyl('metal', px - 7, y, 3560 + sd * 0, .1, 3, '#2a2c2f', 8); }
  kit.box('glow', px - 7, y + 3.1, 3560, .3, .3, .3, 0, '#2bff5a');                                                   // exit light
  // Garages: bays 12 m wide along the pit lane, open fronts, lit inside, two
  // of them drive-through to the paddock behind; offices and a terrace above.
  const gx = px + 11, gz0 = C.pits.z0, gz1 = C.pits.z1, team = ['#c8141c', '#1f47ff', '#f2c21a', '#16181c', '#2bb673', '#ff6a1a', '#e8e6e0', '#7a2cff'];
  kit.box('paint', gx + 6, y + 7.4, (gz0 + gz1) / 2, 13, .5, gz1 - gz0, 0, '#d9d7d0', true);                           // roof slab
  kit.box('paint', gx + .2, y + 6.6, (gz0 + gz1) / 2, .3, 1.2, gz1 - gz0, 0, '#1f5fa8');                              // fascia
  kit.box('glass', gx + 6, y + 9.4, (gz0 + gz1) / 2, 10, 3.6, gz1 - gz0 - 4, 0, '#7fa6c0');                           // suites
  kit.box('paint', gx + 6, y + 11.4, (gz0 + gz1) / 2, 13, .4, gz1 - gz0, 0, '#eeede8');
  for (let z = gz0; z <= gz1 + .1; z += 12) kit.box('paint', gx + 6, y + 3.5, z, 12, 7, .4, 0, '#cfccc4', true);       // party walls
  const through = C.through.map(z => Math.round((z - gz0 - 6) / 12));
  for (let i = 0; i < (gz1 - gz0) / 12; i++) {
    const z = gz0 + 6 + i * 12, c = team[i % team.length], open = through.includes(i);
    if (!open) {
      kit.box('paint', gx + 11.8, y + 3.5, z, .4, 7, 12, 0, '#cfccc4', true);                                          // back wall
      kit.box('glow', gx + 11.5, y + 3, z, .05, 2.2, 9, 0, c);                                                        // team panel, lit
      for (const dz of [-4.2, -3.2, 3.2, 4.2]) for (let h = 0; h < 4; h++) kit.cyl('paint', gx + 9.5, y + h * .3, z + dz, .33, .29, '#141414', 12);   // tyre stacks
      for (const dz of [-1.6, 1.6]) kit.box('paint', gx + 10.6, y + .5, z + dz, .7, 1, 1.4, 0, c);                    // tool chests
      kit.box('paint', gx + 10.6, y + 1.02, z, .7, .04, 4.6, 0, '#b9bec4');
    } else kit.box('flood', gx + 6, y + .055, z, 14, .06, 11, 0, '#414143');                                       // the drive-through floor
    kit.box('glow', gx + 6, y + 6.9, z, 8, .05, .6, 0, '#fff4e0');                                                   // ceiling light
    kit.box('paint', gx + .3, y + 6.1, z, .2, .5, 11.4, 0, c);                                                       // roller door, up
    kit.box('flood', px + 4.6, y + .075, z, 4.4, .02, .15, 0, '#f2f2ee');                                            // pit box
    for (const dz of [-5.4, 5.4]) kit.box('flood', px + 4.6, y + .075, z + dz, 4.4, .02, .15, 0, '#f2f2ee');
    kit.box('flood', px + 2.4, y + .075, z, .15, .02, 10.8, 0, '#f2f2ee');
    if (!open) kit.add('wash', washDisc(8, .35, new T.Color('#fff1dc')), gx + 4, y + .1, z, 0, '#fff', {keep: true});
  }
  // Control tower over the line.
  kit.box('paint', gx + 6, y + 14, tz, 12, 5, 30, 0, '#e3e1db', true);
  kit.box('glass', gx - .1, y + 14.2, tz, .1, 3.6, 28, 0, '#7fa6c0');
  kit.box('paint', gx + 6, y + 16.8, tz, 14, .6, 32, 0, '#1f5fa8');
  board(group, 26, 2.2, gx - .2, y + 18.6, tz, -Math.PI / 2, textBoard('#1f5fa8', '#ffffff', 'PACIFIC RACEWAY'), {glow: .6});
  // Start/finish: a chequered line, grid boxes, and a gantry with the start lights.
  for (let k = 0; k < 14; k++) for (const r of [0, 1]) kit.box('flood', C.sf.x - W / 2 + .5 + k, y + .09, tz + r - .5, 1, .02, 1, 0, (k + r) % 2 ? '#111' : '#f5f5f5');
  for (let gN = 1; gN <= 12; gN++) { const gxx = C.sf.x + (gN % 2 ? -3 : 3); kit.box('flood', gxx, y + .08, tz - 8 * gN, 3, .02, .2, 0, '#f2f2ee'); for (const sd of [-1.5, 1.5]) kit.box('flood', gxx + sd, y + .08, tz - 8 * gN - .6, .15, .02, 1.2, 0, '#f2f2ee'); }
  for (const sd of [-1, 1]) kit.post('metal', C.sf.x + sd * (W / 2 + 2), y, y + 8, tz, .5, .5, 0, '#3a3d42', true);
  kit.box('paint', C.sf.x, y + 7.8, tz, W + 5, 1.4, .8, 0, '#1b1c1f');
  for (let k = -2; k <= 2; k++) kit.box('glow', C.sf.x + k * 1.6, y + 7.8, tz - .42, .8, .8, .06, 0, '#ff2a1a');
  // A sponsor bridge over the straight.
  { const bz = 3060; for (const sd of [-1, 1]) kit.post('metal', C.sf.x + sd * (W / 2 + 3), y, y + 7.5, bz, .8, .8, 0, '#2f3236', true);
    kit.box('paint', C.sf.x, y + 7.2, bz, W + 7, 1.6, 1.4, 0, '#1b1c1f');
    for (const sd of [-1, 1]) board(group, W + 6, 1.3, C.sf.x, y + 7.2, bz + sd * .72, sd > 0 ? 0 : Math.PI, textBoard('#c8141c', '#ffffff', 'DWN SHIFT · PACIFIC RACEWAY'), {glow: .6}); }
  // Grandstands with a crowd: along the straight on the infield, at the hairpin, on the back straight.
  grandstand(kit, C.sf.x - W / 2 - 16, 3020, C.sf.x - W / 2 - 16, 3420, y, 1, 0, 12);
  grandstand(kit, -7535, 3480, -7535, 3700, y, 1, 0, 8);
  grandstand(kit, -6700, 3830, -6920, 3842, y, 0, -1, 7, false);
  grandstand(kit, -7360, 2640, -7180, 2620, y, 0, 1, 8);
  // Tyre walls and brake boards before the tight corners.
  for (let i = 0; i < path.length; i += 6) {
    const p = path[i]; if (Math.abs(p.k) < 1 / 90) continue;
    const out = Math.sign(p.k) > 0 ? -1 : 1, off = W / 2 + 23.5;
    for (let h = 0; h < 3; h++) kit.cyl('paint', p.x + p.nx * out * off, y + h * .3, p.z + p.nz * out * off, .35, .29, h === 1 ? (i % 12 ? '#f2f2ee' : '#c8141c') : '#151515', 10);
  }
  for (let i = 0; i < path.length; i++) {
    const p = path[i], ahead = path[(i + 70) % path.length], before = path[(i - 1 + path.length) % path.length];
    if (!(Math.abs(ahead.k) > 1 / 90 && Math.abs(path[(i + 69) % path.length].k) <= 1 / 90)) continue;
    void before;
    for (const [d, t] of [[33, '100'], [66, '200'], [99, '300']]) {
      const q = path[(i + 70 - d + path.length) % path.length], sd = Math.sign(ahead.k) > 0 ? 1 : -1, o = W / 2 + 4;
      const bx = q.x + q.nx * sd * o, bzz = q.z + q.nz * sd * o;
      kit.post('metal', bx, y, y + 1.2, bzz, .08, .08, 0, '#6d7177');
      board(group, 1.1, .8, bx, y + 1.6, bzz, Math.atan2(-q.tx, -q.tz), textBoard('#f2f2ee', '#111214', t), {px: 128, glow: .3});
    }
  }
  /* ---- the way in: Raceway Drive's gate, the visitor car park, the team paddock */
  const P = C.paddock, Lt = C.lot, [gtx, gtz] = C.gate;
  kit.box('flood', (P.x0 + P.x1) / 2, y + .05, (P.z0 + P.z1) / 2, P.x1 - P.x0, .06, P.z1 - P.z0, 0, '#454547');
  kit.box('flood', (gtx + P.x1) / 2 - 1, y + .052, gtz, P.x1 - gtx + 4, .06, 16, 0, '#454547');                       // apron to the road's end
  kit.box('flood', (gx + 12 + P.x0) / 2, y + .052, gtz, P.x0 - gx - 12 + 2, .06, 11, 0, '#454547');                  // aisle on through the garage bay
  kit.box('flood', (gx + 12 + P.x0) / 2, y + .052, C.through[1], P.x0 - gx - 12 + 2, .06, 11, 0, '#454547');
  // Bays: rows either side of the main aisle (on the gate's line), back to back, with aisles between.
  const rowsAt = [];
  for (let z = gtz + 7.3, k = 0; z + 5.5 < Lt.z1; k++) { rowsAt.push([z, 1]); rowsAt.push([z + 5.5, -1]); z += 11 + 7.4; }
  for (let z = gtz - 7.3, k = 0; z - 5.5 > Lt.z0; k++) { rowsAt.push([z, -1]); rowsAt.push([z - 5.5, 1]); z -= 11 + 7.4; }
  for (const [z0r, dir] of rowsAt) {
    for (let x = Lt.x0 + 2; x < Lt.x1 - 2; x += 2.8) kit.box('flood', x, y + .075, z0r + dir * 2.75, .12, .02, 5.5, 0, '#f2f2ee');
    for (let x = Lt.x0 + 3.4; x < Lt.x1 - 2; x += 2.8) kit.box('stone', x, y + .13, z0r + dir * 5, 1.6, .12, .2, 0, '#b9b3a7');
  }
  for (let x = Lt.x0 + 8; x < Lt.x1; x += 30) for (const z of [gtz + 18, gtz - 18, gtz + 55, gtz - 40]) {
    if (z > Lt.z1 || z < Lt.z0) continue;
    kit.cyl('metal', x, y, z, .14, 9, '#8c9096', 8, true, .1);
    kit.box('metal', x, y + 9, z, 1.4, .2, .6, 0, '#3b3e42'); kit.box('glow', x, y + 8.88, z, 1.2, .04, .4, 0, '#fff4dc');
    kit.add('wash', washDisc(18, .28, new T.Color('#fff1dc')), x, y + .12, z, 0, '#fff', {keep: true});
  }
  for (const x of [Lt.x0 + 30, Lt.x0 + 75]) board(group, 3, 1.2, x, y + 3, gtz - 5.6, 0, textBoard('#1f5fa8', '#ffffff', 'PADDOCK · PIT LANE →'), {glow: .5});
  for (const x of [Lt.x0 + 30, Lt.x0 + 75]) kit.post('metal', x, y, y + 2.4, gtz - 5.6, .1, .1, 0, '#6d7177');
  // Gate: a gantry over the drive with the raceway's name, a booth.
  { const ex = P.x1 - 1;
    for (const sd of [-1, 1]) { kit.box('paint', ex, y + 3.5, gtz + sd * 9.5, 1.2, 7, 1.2, 0, '#1b1c1f', true); kit.box('glow', ex + .62, y + 3.5, gtz + sd * 9.5, .04, 6, .2, 0, '#4a8dff'); }
    kit.box('paint', ex, y + 7.4, gtz, 1.4, 1.8, 20.2, 0, '#1b1c1f');
    board(group, 18, 1.5, ex + .72, y + 7.4, gtz, Math.PI / 2, textBoard('#0f1a2c', '#ffffff', 'PACIFIC RACEWAY', 'CIRCUIT · PADDOCK · PARKING'), {glow: .8});
    board(group, 18, 1.5, ex - .72, y + 7.4, gtz, -Math.PI / 2, textBoard('#0f1a2c', '#ffffff', 'PACIFIC RACEWAY', 'THANKS FOR VISITING'), {glow: .8});
    kit.box('paint', ex - 5, y + 1.3, gtz - 11, 3, 2.6, 2.4, 0, '#e9e6de', true);
    kit.box('paint', ex - 5, y + 2.7, gtz - 11, 3.6, .2, 3, 0, '#1f5fa8'); }
  // Team paddock: haulers in team colours with awnings, the hospitality block.
  for (let k = 0; k < 6; k++) {
    const z = P.z0 + 14 + k * 21, x = P.x0 + 40, c = team[k];
    if (Math.abs(z - C.through[1]) < 8) continue;
    kit.box('paint', x + 8, y + 2.1, z, 13.5, 3.6, 2.5, 0, c, true);                                                  // trailer
    kit.box('paint', x + 8, y + .55, z, 13.5, .5, 2.4, 0, '#1b1c1f');
    kit.box('paint', x + 16.8, y + 1.8, z, 3, 2.8, 2.4, 0, '#e8e6e0', true);                                          // cab
    kit.box('glass', x + 18.2, y + 2.4, z, .06, 1, 2, 0, '#2a3946');
    for (const dx of [2, 4, 12, 14, 17.5]) for (const sd of [-1, 1]) kit.cyl('paint', x + dx, y + .5, z + sd * 1.15, .5, .4, '#151515', 12);
    kit.box('paint', x + 8, y + 3.4, z - 4, 12, .1, 5, 0, '#f2f2ee');                                                 // awning
    for (const dx of [2.5, 13.5]) kit.post('metal', x + dx, y, y + 3.4, z - 6.3, .08, .08, 0, '#8c9096');
  }
  kit.box('paint', P.x1 - 50, y + 4, P.z0 + 40, 50, 8, 22, 0, '#f1efe9', true);
  kit.box('glass', P.x1 - 50, y + 4.5, P.z0 + 51.1, 46, 5, .1, 0, '#8fb1c6');
  kit.box('paint', P.x1 - 50, y + 8.3, P.z0 + 40, 52, .6, 24, 0, '#d7261e');
  board(group, 20, 1.6, P.x1 - 50, y + 9.8, P.z0 + 51.3, 0, textBoard('#d7261e', '#ffffff', 'HOSPITALITY'), {glow: .5});
  // Floodlights round the outside.
  // Floodlights round the outside, each throwing a pool of light across the track after dark.
  for (let i = 0; i < path.length; i += 48) {
    const p = path[i], side = Math.sign(p.k) >= 0 ? -1 : 1, off = W / 2 + 32;
    lightTower(kit, p.x + p.nx * side * off, p.z + p.nz * side * off, y, p.x, p.z);
    kit.add('wash', washDisc(95, .16, new T.Color('#fff1dc')), p.x + p.nx * side * 8, y + .12, p.z + p.nz * side * 8, 0, '#fff', {keep: true});
  }
}

/* ------------------------------------------------------------ signs */
/** A canvas-textured board (lit after dark through its emissive map). Returns
 *  the mesh; `draw(ctx, W, H)` paints it and can be called again later. */
function board(group, w, h, x, y, z, yaw, draw, {px = 256, glow = .55} = {}) {
  const cv = document.createElement('canvas'); cv.width = Math.round(px * w / h); cv.height = px;
  const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new T.MeshStandardMaterial({map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: glow, roughness: .7});
  const mesh = new T.Mesh(new T.PlaneGeometry(w, h), mat); mesh.position.set(x, y, z); mesh.rotation.y = yaw; group.add(mesh);
  mesh.userData.redraw = () => { const c = cv.getContext('2d'); draw(c, cv.width, cv.height); tex.needsUpdate = true; };
  mesh.userData.redraw();
  return mesh;
}
const textBoard = (bg, fg, text, sub = '') => (c, W, H) => {
  c.fillStyle = bg; c.fillRect(0, 0, W, H); c.strokeStyle = fg; c.lineWidth = H * .04; c.strokeRect(H * .05, H * .05, W - H * .1, H - H * .1);
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `800 ${H * (sub ? .42 : .55)}px Outfit, Arial`; c.fillText(text, W / 2, H * (sub ? .4 : .52));
  if (sub) { c.font = `600 ${H * .2}px Outfit, Arial`; c.fillText(sub, W / 2, H * .76); }
};

/* ------------------------------------------------------------ drag strip */
function buildDrag(kit, places) {
  const D = DRAG, y = D.y, x0 = D.x0 - 60, x1 = D.end, L = x1 - x0, cx = (x0 + x1) / 2, zc = D.zc, g = places.ground;
  const group = new T.Group(); places.scene.add(group); group.matrixAutoUpdate = false; group.userData.farCull = 3500;   // static; hidden when far (world.js)
  /* ---- the strip: concrete launch pad, then asphalt; rubber down each lane */
  kit.box('flood', cx, y + .06, zc, L, .06, 26, 0, '#3a3a3c');
  kit.box('flood', D.x0 + 50, y + .066, zc, 220, .06, 22.4, 0, '#8e8b85');                          // concrete pad, 60 m behind to 160 m out
  for (let k = 0; k < 40; k++) kit.box('flood', D.x0 - 58 + k * 5.5, y + .068, zc, .05, .02, 22.4, 0, '#6d6a65');   // slab joints
  for (const lz of D.lanes) for (const o of [-.8, .8]) for (let k = 0; k < 18; k++) {
    const xs = D.x0 - 8 + k * 14, a = Math.max(0, 1 - k / 18);                                       // tyre tracks, darkest at the hit
    kit.box('flood', xs + 7, y + .072, lz + o, 14, .02, .55 + a * .25, 0, new T.Color('#2a2a2c').lerp(new T.Color('#8e8b85'), 1 - a * .9).getStyle());
  }
  kit.box('flood', D.x0 - 40, y + .07, zc, 30, .06, 22, 0, '#232325');                               // burnout box, wet and black
  for (const lz of D.lanes) kit.box('flood', D.x0 - 40, y + .075, lz, 26, .02, 3.2, 0, '#1a1a1c');
  for (const z of [zc - .15, zc + .15]) kit.box('flood', cx, y + .08, z, L, .02, .12, 0, '#f0d21c');   // centre line
  for (const sd of [-1, 1]) kit.box('flood', cx, y + .08, zc + sd * 10.6, L, .02, .25, 0, '#f2f2ee');
  // Start line, pre-stage line, the timing lines down the track.
  kit.box('flood', D.x0, y + .085, zc, .3, .02, 21, 0, '#f6f6f2');
  kit.box('flood', D.x0 - .5, y + .085, zc, .12, .02, 21, 0, '#f6f6f2');
  for (const [x, c] of [[D.x0 + 18.3, '#c8ccd0'], [D.x0 + 100.6, '#c8ccd0'], [D.x0 + 201.2, '#e8b512'], [D.x0 + 304.8, '#c8ccd0'], [D.x0 + D.len, '#e0261c']]) kit.box('flood', x, y + .085, zc, .4, .02, 21, 0, c);
  // Photo-eye boxes at the line: either side of each lane, a little light that shows staged.
  for (const lz of D.lanes) for (const o of [-5.2, 5.2]) {
    if (Math.abs(lz + o - zc) < 1) continue;
    for (const dx of [-.5, 0]) { kit.box('metal', D.x0 + dx, y + .3, lz + o, .18, .45, .18, 0, '#d8a21a'); kit.box('glow', D.x0 + dx, y + .5, lz + o - Math.sign(o) * .1, .1, .06, .02, 0, '#ff3a2a'); }
  }
  /* ---- walls: north whole length; south with the shutdown exit gap; sand trap and nets */
  kit.box('paint', cx, y + .55, zc - 13.3, L, 1.1, .6, 0, '#d9d6cf', true);
  const [gx0, gx1] = D.exitGap;
  kit.box('paint', (x0 + gx0) / 2, y + .55, zc + 13.3, gx0 - x0, 1.1, .6, 0, '#d9d6cf', true);
  kit.box('paint', (gx1 + x1) / 2, y + .55, zc + 13.3, x1 - gx1, 1.1, .6, 0, '#d9d6cf', true);
  for (let x = x0; x < x1; x += 4) for (const sd of [-1, 1]) if (sd < 0 || x < gx0 || x > gx1) kit.box('paint', x, y + 1.12, zc + sd * 13.3, 2, .04, .62, 0, (Math.floor(x / 4) % 2) ? '#c8141c' : '#f2f2ee');
  kit.box('flood', x1 + 40, y + .07, zc, 80, .06, 26, 0, '#cfb98f');
  for (let z = -12; z <= 12; z += 3) kit.post('metal', x1 + 82, y, y + 4, zc + z, .12, .12, 0, '#5d6166');
  kit.box('paint', x1 + 82, y + 2.2, zc, .05, 3.6, 25, 0, '#2d3134', true);
  /* ---- return road: out through the gap, back west along the south side to the apron */
  const R = D.ret;
  kit.box('flood', (R.x0 + R.x1) / 2, y + .062, R.z, R.x1 - R.x0, .06, 10, 0, '#3c3c3e');
  kit.beam('flood', gx0 + 10, zc + 10, R.x1, R.z - 2, y + .064, .06, 11, '#3c3c3e');                 // the turn-off through the gap
  for (const sd of [-1, 1]) kit.box('flood', (R.x0 + R.x1) / 2, y + .08, R.z + sd * 4.6, R.x1 - R.x0, .02, .15, 0, '#f2f2ee');
  for (let x = R.x0 + 8; x < R.x1; x += 9) kit.box('flood', x, y + .08, R.z, 4.5, .02, .15, 0, '#f0d21c');
  for (let x = R.x0 + 40; x < R.x1; x += 160) board(group, 2.4, 1, x, y + 1.6, R.z + 5.6, Math.PI, textBoard('#1d4d8f', '#ffffff', 'RETURN ROAD', '← PITS · EXIT'));
  for (const x of [R.x0 + 40, R.x1 - 60]) kit.post('metal', x, y, y + 1.1, R.z + 5.6, .1, .1, 0, '#6d7177');
  /* ---- pre-staging apron at the west end, lanes painted onto the strip */
  const A = D.apron;
  kit.box('flood', (A.x0 + A.x1) / 2, y + .058, (A.z0 + A.z1) / 2, A.x1 - A.x0, .06, A.z1 - A.z0, 0, '#404042');
  for (const lz of D.lanes) for (let x = A.x0 + 10; x < A.x1 + 4; x += 4) kit.box('flood', x, y + .075, lz - 2.6, 2, .02, .12, 0, '#f2f2ee');
  for (const [lz, n] of [[D.lanes[0], 'LANE 1'], [D.lanes[1], 'LANE 2']]) board(group, 2.2, .9, A.x0 + 18, y + 2.4, lz + (lz < zc ? -3.4 : 3.4), -Math.PI / 2, textBoard('#111214', '#ffd23a', n, 'PRE-STAGE →'));
  for (const [ax, az] of [[A.x0 + 18, D.lanes[0] - 3.4], [A.x0 + 18, D.lanes[1] + 3.4]]) kit.post('metal', ax, y, y + 1.95, az, .12, .12, 0, '#6d7177');
  /* ---- the car park: Dragway Drive's gate on the east, the apron to the south-west */
  const P = D.lot, pcx = (P.x0 + P.x1) / 2, pcz = (P.z0 + P.z1) / 2;
  kit.box('flood', pcx, y + .055, pcz, P.x1 - P.x0, .06, P.z1 - P.z0, 0, '#3e3e40');
  kit.box('flood', P.x0 + 18, y + .057, (P.z1 + A.z0) / 2 + 2, 30, .06, A.z0 - P.z1 + 8, 0, '#3e3e40');   // down to the apron
  const aisles = [P.z0 + 18, P.z1 - 18];                                                               // two aisles, three rows of bays
  for (const az of aisles) for (let x = P.x0 + 40; x < P.x1 - 8; x += 9) kit.box('flood', x, y + .075, az, 4.5, .02, .14, 0, '#f2f2ee');
  for (const [za, zb] of [[P.z0 + 2, P.z0 + 12.5], [(P.z0 + P.z1) / 2 - 5.5, (P.z0 + P.z1) / 2 + 5.5], [P.z1 - 12.5, P.z1 - 2]])
    for (let x = P.x0 + 38; x < P.x1 - 6; x += 2.8) kit.box('flood', x, y + .075, (za + zb) / 2, .12, .02, zb - za, 0, '#f2f2ee');
  for (let x = P.x0 + 38; x < P.x1 - 6; x += 2.8) for (const z of [P.z0 + 1.6, P.z1 - 1.6]) kit.box('stone', x + 1.4, y + .14, z, 1.6, .14, .2, 0, '#b9b3a7');
  kit.box('stone', pcx, y + .14, (P.z0 + P.z1) / 2, P.x1 - P.x0 - 50, .25, .6, 0, '#b9b3a7');            // centre island kerb
  for (let x = P.x0 + 45; x < P.x1 - 10; x += 36) {                                                    // light poles on the island
    kit.cyl('metal', x, y, pcz, .14, 9, '#8c9096', 8, true, .1);
    for (const sd of [-1, 1]) { kit.box('metal', x, y + 9, pcz + sd * 1.1, .7, .2, 1.6, 0, '#3b3e42'); kit.box('glow', x, y + 8.88, pcz + sd * 1.1, .6, .04, 1.2, 0, '#fff4dc'); }
    kit.add('wash', washDisc(20, .3, new T.Color('#fff1dc')), x, y + .12, pcz, 0, '#fff', {keep: true});
  }
  // Entrance: a gantry over the drive with the dragway's name, a ticket booth, barriers up.
  { const [gx, gz] = D.gate, ex = P.x1 - 2;
    kit.box('flood', ex + 6, y + .056, gz, 16, .06, 22, 0, '#3e3e40');
    for (const sd of [-1, 1]) { kit.box('paint', ex, y + 3.5, gz + sd * 12.5, 1.2, 7, 1.2, 0, '#1b1c1f', true); kit.box('glow', ex - .62, y + 3.5, gz + sd * 12.5, .04, 6, .2, 0, '#ff8a1a'); }
    kit.box('paint', ex, y + 7.4, gz, 1.4, 1.8, 26.2, 0, '#1b1c1f');
    board(group, 22, 1.5, ex + .72, y + 7.4, gz, Math.PI / 2, textBoard('#111214', '#ff9a1a', 'EASTSIDE DRAGWAY', '1/4 MILE · OPEN TONIGHT'), {glow: .8});
    board(group, 22, 1.5, ex - .72, y + 7.4, gz, -Math.PI / 2, textBoard('#111214', '#ff9a1a', 'EASTSIDE DRAGWAY', 'DRIVE SAFE'), {glow: .8});
    kit.box('paint', ex - 6, y + 1.3, gz + 13.5, 3, 2.6, 2.4, 0, '#e9e6de', true);                       // booth
    kit.box('glass', ex - 6, y + 1.6, gz + 12.25, 2.6, 1.2, .06, 0, '#8fb1c6');
    kit.box('paint', ex - 6, y + 2.7, gz + 13.5, 3.6, .2, 3, 0, '#ff8a1a');
    for (const sd of [-1, 1]) kit.rod('paint', [ex - 9, y + .9, gz + sd * 11], [ex - 9.4, y + 4.8, gz + sd * 10.6], .06, '#e8e2d6'); // raised barriers
    void gx; }
  /* ---- lights down the strip */
  for (let x = x0 + 30; x < x1; x += 60) for (const sd of [-1, 1]) {
    kit.cyl('metal', x, y, zc + sd * 15.5, .2, 13, '#8c9096', 8, true);
    kit.box('metal', x, y + 13.2, zc + sd * 15, 2.4, .4, 1.2, 0, '#3b3e42');
    kit.box('glow', x, y + 12.98, zc + sd * 14.6, 2.2, .06, .9, 0, '#fff6e2');
    if (sd > 0) kit.add('wash', washDisc(40, .22, new T.Color('#fff1dc')), x, y + .12, zc, 0, '#fff', {keep: true});
  }
  for (let x = R.x0 + 30; x < R.x1; x += 120) { kit.cyl('metal', x, y, R.z + 7, .12, 7, '#8c9096', 8, true); kit.box('glow', x, y + 7, R.z + 6.2, .5, .1, 1.4, 0, '#fff4dc'); kit.add('wash', washDisc(14, .25, new T.Color('#fff1dc')), x, y + .12, R.z, 0, '#fff', {keep: true}); }
  /* ---- distance boards on the north wall, scoreboards at the finish */
  for (const [dx, t] of [[18.3, '60 FT'], [100.6, '330 FT'], [201.2, '1/8 MILE'], [304.8, '1000 FT'], [D.len, '1/4 MILE']]) {
    kit.post('metal', D.x0 + dx, y, y + 3, zc - 14.4, .14, .14, 0, '#6d7177');
    board(group, 2.6, 1.1, D.x0 + dx, y + 3.4, zc - 14.3, Math.PI / 2 * 0 + 0, textBoard('#f2f2ee', '#111214', t), {glow: .35});
  }
  const boards = [];
  for (const [lane, sd] of [[0, -1], [1, 1]]) {
    const bx = D.x0 + D.len + 8, bz = zc + sd * 17;
    kit.post('metal', bx, y, y + 6.5, bz, .5, .5, 0, '#3a3d42', true);
    kit.box('paint', bx, y + 8.4, bz, .6, 3.4, 7.4, 0, '#15171a');
    const res = {lane, et: null, kmh: null, win: false};
    const m = board(group, 7, 3, bx - .32, y + 8.4, bz, -Math.PI / 2, (c, W, H) => {
      c.fillStyle = '#050505'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffb23a'; c.textAlign = 'left'; c.textBaseline = 'middle';
      c.font = `700 ${H * .15}px Outfit, Arial`; c.fillText(`LANE ${lane + 1}${res.win ? '  ◆ WIN' : ''}`, W * .05, H * .15);
      c.font = `700 ${H * .38}px ui-monospace, Menlo, monospace`; c.fillStyle = '#ff9a1a';
      c.fillText(res.et ? res.et.toFixed(3) : '-.---', W * .05, H * .48);
      c.font = `700 ${H * .24}px ui-monospace, Menlo, monospace`; c.fillText(res.kmh ? `${Math.round(res.kmh)} KM/H` : '--- KM/H', W * .05, H * .8);
    }, {px: 256, glow: 1.2});
    boards.push({res, m});
  }
  D.showResult = (lane, et, kmh) => { for (const b of boards) { if (b.res.lane === lane) { b.res.et = et; b.res.kmh = kmh; } b.res.win = b.res.lane === lane; b.m.userData.redraw(); } };
  /* ---- stands, tower */
  grandstand(kit, D.x0 - 20, zc - 22, D.x0 + 180, zc - 22, y, 0, 1, 10);
  grandstand(kit, D.x0 + 20, zc + 22, D.x0 + 240, zc + 22, y, 0, -1, 7, false);
  kit.box('paint', D.x0 - 20, y + 5, zc + 26, 14, 10, 9, 0, '#eeede8', true);
  kit.box('glass', D.x0 - 20, y + 7, zc + 21.4, 13, 3, .1, 0, '#86aac2');
  kit.box('paint', D.x0 - 20, y + 10.3, zc + 26, 16, .6, 11, 0, '#e59a00');
  /* ---- the Christmas tree: just past the line, between the lanes, facing the cars */
  const tree = new T.Group(), tx = D.treeX;
  const dark = new T.MeshStandardMaterial({color: '#17181b', roughness: .55, metalness: .3});
  const post = new T.Mesh(new T.CylinderGeometry(.09, .12, 2.2, 10), dark); post.position.set(tx, y + 1.1, zc); tree.add(post);
  const base = new T.Mesh(new T.BoxGeometry(.6, .12, .6), dark); base.position.set(tx, y + .06, zc); tree.add(base);
  const housing = new T.Mesh(new T.BoxGeometry(.24, 2.2, 1.0), dark); housing.position.set(tx, y + 3.1, zc); tree.add(housing);
  const lamps = {};
  const rows = [['pre', '#fff2c4', .09, 4.05], ['stage', '#fff2c4', .09, 3.85], ['a1', '#ffa51a', .13, 3.5], ['a2', '#ffa51a', .13, 3.18], ['a3', '#ffa51a', .13, 2.86], ['go', '#2bff5a', .13, 2.54], ['red', '#ff1a14', .13, 2.22]];
  for (const [key, color, r, hy] of rows) for (const [lane, dz] of [[0, -.24], [1, .24]]) {
    const pair = key === 'pre' || key === 'stage';
    for (const off of pair ? [-.075, .075] : [0]) {
      const m = new T.MeshStandardMaterial({color: '#141414', emissive: color, emissiveIntensity: 0, roughness: .3, toneMapped: false});
      const lens = new T.Mesh(new T.CylinderGeometry(r, r, .05, 18), m); lens.rotation.z = Math.PI / 2; lens.position.set(tx - .14, y + hy, zc + dz + off); tree.add(lens);
      const visor = new T.Mesh(new T.CylinderGeometry(r + .02, r + .02, .1, 18, 1, true, 0, Math.PI), dark); visor.rotation.z = Math.PI / 2; visor.rotation.x = Math.PI / 2; visor.position.set(tx - .2, y + hy + .01, zc + dz + off); tree.add(visor);
      (lamps[key] ||= [[], []])[lane].push(m);
    }
  }
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
      const setTree = on => { tree = on; for (const [k, lanes] of Object.entries(D.lamps || {})) lanes.forEach((mats, i) => { const lit = on[k] && (on.lane === undefined || on.lane === i) ? 7 : 0; for (const m of mats) m.emissiveIntensity = lit; }); };
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
          D.showResult?.(d.lane, et, kmh);
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
    {pts: [[DRAG.ret.x0, DRAG.ret.z], [DRAG.ret.x1, DRAG.ret.z]], w: 9, color: '#9aa7ad'},
    {pts: [[DRAG.lot.x0, DRAG.lot.z0], [DRAG.lot.x1, DRAG.lot.z0], [DRAG.lot.x1, DRAG.lot.z1], [DRAG.lot.x0, DRAG.lot.z1]], closed: true, w: 4, color: '#9aa7ad'},
    {pts: [[CIRCUIT.lot.x0, CIRCUIT.lot.z0], [CIRCUIT.lot.x1, CIRCUIT.lot.z0], [CIRCUIT.lot.x1, CIRCUIT.lot.z1], [CIRCUIT.lot.x0, CIRCUIT.lot.z1]], closed: true, w: 4, color: '#9aa7ad'}];
}
export {CIRCUIT, DRAG};
