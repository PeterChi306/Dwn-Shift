/* The Meridian Sky Deck (2026-10-04, Peter: "when you go downtown to the
 * highest tower ... take an elevator and go to the top floor, where there's a
 * viewing area that you can look around").
 *
 * The Meridian Bank Tower (city.js bankTower, 212 m, the tallest in the city)
 * is walkable now:
 *   - the lobby: the two-storey podium behind a glass front with sliding
 *     doors (bollards keep the car out), stone floor, columns, a reception
 *     desk, and the glass elevator lobby at the south end;
 *   - the elevator: a glass car on two rails up the OUTSIDE of the south face,
 *     so the city drops away as you rise (about 16 s, 73 floors). Walk in,
 *     press E; at a landing without the car, E calls it. A floor display in
 *     the car counts up; a chime, the doors, the hum and the wind of the ride;
 *   - the Sky Deck: the whole crown, glass all round under the slanted glass
 *     roof, the helipad's ceiling over the elevator end, benches and coin
 *     binoculars at the glass, and the Sky Ledge, a glass box with a glass
 *     floor out of the north face, 212 m over the street.
 * In the rain the roofs keep it dry inside (rain.js's height map sees them)
 * while the storm goes by outside the glass.
 *
 * Everything here is in the tower lot's frame (x away from the street, z
 * along it, y up from the lot's base); the plan comes from city.js bankGeom.
 * Static pieces go into the Places kit (meshes and box colliders); the car and
 * the doors are their own meshes, moved every frame; the landing gates are
 * colliders switched on whenever the car is not standing open at that floor.
 */
import * as T from 'three';
import {Kit, washDisc} from './kit.js';
import {bankGeom} from './city.js';
import {wetWindow} from './rain.js';

const FLOORS = 73, RIDE = 16, CALL = 11;

/** Finds the tower, puts it on the map and queues its build (Places.build runs the extras). */
export function planSkyDeck(places, lots, physics) {
  const lot = lots.find(l => l.landmark === 'bankTower');
  if (!lot) return null;
  const deck = new SkyDeck(lot, physics);
  const G = deck.G, a = deck.a;
  places.pois.push({name: 'Meridian Sky Deck', kind: 'view', x: lot.x + Math.cos(a) * G.cx, z: lot.z - Math.sin(a) * G.cx});
  places.extras.push((kit, pl) => deck.build(kit, pl));
  return deck;
}

/** A lit board (canvas texture). */
function board(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = Math.round(1024 * h / w); const c = cv.getContext('2d');
  draw(c, cv.width, cv.height);
  const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
  return new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: .55, roughness: .6}));
}

export class SkyDeck {
  constructor(lot, physics) {
    this.lot = lot; this.physics = physics; this.G = bankGeom(lot);
    this.a = Math.atan2(-lot.fz, lot.fx); this.ca = Math.cos(this.a); this.sa = Math.sin(this.a);
    this.cabY = 0; this.stop = 'B'; this.go = null; this.door = 0; this.doorT = 0; this.front = 0; this.idleT = 0;
    this.carry = null; this.indoor = 0; this.prompt = ''; this.gates = {B: null, T: null}; this.shown = '';
    this.built = false;
  }
  /** Lot frame -> world. */
  W(lx, ly, lz) { const L = this.lot; return new T.Vector3(L.x + lx * this.ca + lz * this.sa, (this.base ?? L.base) + ly, L.z - lx * this.sa + lz * this.ca); }
  /** World -> lot frame. */
  L(p) { const dx = p.x - this.lot.x, dz = p.z - this.lot.z; return {x: dx * this.ca - dz * this.sa, y: p.y - this.base, z: dx * this.sa + dz * this.ca}; }

  build(kit, pl) {
    const G = this.G, {D, Wd, x0, x1, z0, z1, c, P, H, zm, cx, zc, crown, top} = G, a = this.a;
    this.base = this.lot.base; this.scene = pl.scene;
    const W = (x, y, z) => this.W(x, y, z);
    const box = (mat, x, y, z, sx, sy, sz, color, solid = false) => { const p = W(x, y, z); kit.box(mat, p.x, p.y, p.z, sx, sy, sz, a, color, solid); };
    const solid = (x, y, z, sx, sy, sz, tag = 'stone') => { const p = W(x, y, z); kit.colliders.push({x: p.x, y: p.y, z: p.z, hx: sx / 2, hy: sy / 2, hz: sz / 2, yaw: a, tag}); };
    const cyl = (mat, x, y, z, r, h, color, solidC = false, n = 12) => { const p = W(x, y, z); kit.cyl(mat, p.x, p.y, p.z, r, h, color, n, solidC); };
    /** A box along a plan edge p -> q (local [x, z]) at height y: sy tall, t thick. */
    const along = (mat, p, q, y, sy, t, color, isSolid = false) => { const A = W(p[0], 0, p[1]), B = W(q[0], 0, q[1]); kit.beam(mat, A.x, A.z, B.x, B.z, this.base + y, sy, t, color, isSolid); };
    /** A flat slab over a convex outline (local [x, z]) from y0 up t. */
    const plate = (mat, pts, y0, t, color) => {
      const sh = new T.Shape(pts.map(q => new T.Vector2(q[0], -q[1])));
      const g = new T.ExtrudeGeometry(sh, {depth: t, bevelEnabled: false}); g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
      kit.add(mat, g, this.lot.x, this.base, this.lot.z, a, color);
    };
    /** A quad through four local [x, y, z] points (glass panes). */
    const quad = (mat, pts, color) => {
      const w = pts.map(q => W(q[0], q[1], q[2]).toArray()), g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute([...w[0], ...w[1], ...w[2], ...w[0], ...w[2], ...w[3]], 3)); g.computeVertexNormals();
      kit.add(mat, g, 0, 0, 0, 0, color);
    };
    const fan = (mat, pts, color) => {
      const w = pts.map(q => W(q[0], q[1], q[2]).toArray()), pos = [];
      for (let i = 1; i < w.length - 1; i++) pos.push(...w[0], ...w[i], ...w[i + 1]);
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
      kit.add(mat, g, 0, 0, 0, 0, color);
    };
    const pool = (x, y, z, r, I = .45) => { const p = W(x, y, z); kit.add('wash', washDisc(r, I), p.x, p.y + .02, p.z, 0, '#ffffff', {keep: true}); };
    const BRUSH = '#8d9298', DARK = '#1e2125', STONE = '#d4cec3', GL = '#9db3c4';

    /* ---------------------------------------------------------- the lobby */
    const pz = Wd / 2 - 2, fx = 2.1, dz = 2.4;
    kit.indoor = 1;
    box('gloss', D / 2, -.15, 0, D - 4.2, .3, Wd - 4.6, STONE, true);
    box('gloss', (fx + cx) / 2 + 1, .004, 0, cx - fx + 2, .01, 2.2, '#3a3d42');                 // a dark runner from the door in
    along('gloss', [cx, 1], [cx, zc + 2.4], .004, .01, 2.2, '#3a3d42');
    // Ceiling: warm panels under the podium roof, light strips, the slot for the elevator.
    const hz0 = zc - 1.85, hx0 = cx - 1.85, hx1 = cx + 1.85;
    const ceil = (xa, xb, za, zb) => { if (xb - xa > .1 && zb - za > .1) box('room', (xa + xb) / 2, P - .2, (za + zb) / 2, xb - xa, .3, zb - za, '#d9cfbf'); };
    ceil(fx, D - 2.5, z0, pz - .5); ceil(fx, D - 2.5, -pz + .5, hz0); ceil(fx, hx0, hz0, z0); ceil(hx1, D - 2.5, hz0, z0);
    for (let z = -pz + 4; z < pz - 2; z += 6) if (z > z0 + 1 || z < hz0 - 1) box('glow', D / 2, P - .37, z, D - 8, .04, .25, '#fff1da');
    for (const x of [10, 22, 34, 44]) for (const z of [-18, -6, 6, 18]) if (x < D - 3) pool(x, 0, z, 4.2, .35);
    // Columns at the tower's corners and mid-faces.
    for (const x of [x0 + 2, x1 - 2]) for (const z of [-15, 0, 15]) { cyl('stone', x, 0, z, .6, P - .35, '#e2ddd3', true, 16); box('glow', x, P - .5, z, 1.5, .1, 1.5, '#ffe9c9'); }
    // Reception desk, a long bench, planters.
    box('gloss', x1 - 3, .55, 9, 1.2, 1.1, 7, '#ece8e0', true); box('glow', x1 - 3.62, .95, 9, .04, .08, 6.8, '#fff1da'); box('gloss', x1 - 3, 1.12, 9, 1.4, .05, 7.2, '#2c2f33');
    box('wood', x0 + 6, .25, 6, 1.6, .45, 6, '#6f513a', true);
    for (const [x, z] of [[6, -9], [6, 9], [x1 + 2, -12], [x1 + 2, 16]]) { cyl('stone', x, 0, z, .9, .7, '#c9c2b5', true, 16); cyl('paint', x, .7, z, .82, .9, '#3d5e35', false, 12); cyl('paint', x, 1.6, z, .55, .7, '#4a6b3d', false, 10); }
    // The glass front: panes, mullions, the transom over the doors, a canopy and bollards outside.
    for (const [za, zb] of [[-pz, -dz], [dz, pz]]) {
      quad('glass', [[fx, 0, za], [fx, 0, zb], [fx, P - .4, zb], [fx, P - .4, za]], GL);
      solid(fx, P / 2, (za + zb) / 2, .4, P, zb - za);
    }
    quad('glass', [[fx, 3.3, -dz], [fx, 3.3, dz], [fx, P - .4, dz], [fx, P - .4, -dz]], GL);
    for (let z = -pz; z <= pz + .01; z += 3) if (Math.abs(z) > dz + .2 || Math.abs(z) < .01) box('metal', fx, P / 2, z, .16, P, .14, DARK);
    for (const s of [-1, 1]) box('metal', fx, P / 2, s * dz, .2, P, .2, DARK);
    box('metal', fx, 3.28, 0, .2, .16, dz * 2, DARK);
    box('metal', fx - 1.6, 4.3, 0, 3.4, .25, 7, '#2b2e33'); for (const z of [-2.6, 2.6]) box('glow', fx - 1.6, 4.16, z, 2.6, .03, .12, '#fff1da'); pool(fx - 1.8, 0, 0, 4, .4);
    for (const z of [-3.1, -1.6, 0, 1.6, 3.1]) cyl('metal', -1.6, 0, z, .14, 1, '#2b2e33', true, 10);
    // Podium walls and roof (the builder draws them; these make them solid).
    solid(D - 2.25, P / 2, 0, .5, P, Wd - 4); for (const s of [-1, 1]) solid(D / 2, P / 2, s * (pz - .25), D - 4, P, .5);
    solid(D / 2, P + .4, 0, D - 3, .8, Wd - 3);
    // The tower above the lobby ceiling: solid up to the deck floor.
    solid(cx, (P + H) / 2, (z0 + z1) / 2, x1 - x0, H - P, z1 - z0);

    /* -------------------------------------------- the elevator's shaft and landings */
    // Glass enclosure round the car's bottom stop, landing doors facing into the lobby.
    const ez0 = zc - 1.65, ez1 = zc + 1.65, ex = 1.65, gd = 1.1;
    for (const s of [-1, 1]) { quad('glass', [[cx + s * ex, 0, ez0], [cx + s * ex, 0, ez1], [cx + s * ex, P - .4, ez1], [cx + s * ex, P - .4, ez0]], GL); solid(cx + s * ex, P / 2, zc, .2, P, 3.3, 'metal'); }
    quad('glass', [[cx - ex, 0, ez0], [cx + ex, 0, ez0], [cx + ex, P - .4, ez0], [cx - ex, P - .4, ez0]], GL); solid(cx, P / 2, ez0, 3.3, P, .2, 'metal');
    for (const s of [-1, 1]) { quad('glass', [[cx + s * gd, 0, ez1], [cx + s * ex, 0, ez1], [cx + s * ex, P - .4, ez1], [cx + s * gd, P - .4, ez1]], GL); solid(cx + s * (gd + ex) / 2, P / 2, ez1, ex - gd, P, .2, 'metal'); }
    quad('glass', [[cx - gd, 2.75, ez1], [cx + gd, 2.75, ez1], [cx + gd, P - .4, ez1], [cx - gd, P - .4, ez1]], GL);
    for (const [x, z] of [[cx - ex, ez0], [cx + ex, ez0], [cx - ex, ez1], [cx + ex, ez1], [cx - gd, ez1], [cx + gd, ez1]]) box('metal', x, P / 2, z, .12, P, .12, BRUSH);
    box('metal', cx, 2.7, ez1, gd * 2, .12, .14, BRUSH);
    // Rails up the south face, tied back to it, and the machine room on top.
    for (const s of [-1, 1]) {
      box('metal', cx + s * 1.78, (H + 6) / 2, zc, .18, H + 6, .22, '#5a5f66');
      for (let y = P + 4; y < H; y += 8) box('metal', cx + s * 1.78, y, (zc + z0) / 2, .14, .14, z0 - zc, '#4a4e54');
    }
    box('paint', cx, H + 5.3, zc + .2, 4.2, 2.2, 4, '#25282c'); box('glow', cx, H + 4.2, zc - 1.82, 3.6, .08, .05, '#9fd4ff');
    // Up top: a threshold from the car to the deck, the car's walls (solid only
    // where the car stands at the top: the gate is shut whenever it is not).
    box('metal', cx, H - .05, (zc + 1.5 + z0) / 2 + .05, gd * 2 + .6, .1, z0 - zc - 1.4, BRUSH);
    solid(cx, H - .25, (zc - 1.6 + z0) / 2, 3.3, .5, z0 - zc + 1.6, 'metal');
    for (const s of [-1, 1]) solid(cx + s * 1.62, H + 1.6, (zc - 1.6 + z0 + .1) / 2, .2, 3.2, z0 - zc + 1.7, 'metal');
    solid(cx, H + 1.6, zc - 1.62, 3.4, 3.2, .2, 'metal');

    /* ------------------------------------------------------------ the deck */
    kit.indoor = 1;
    const ctr = [cx, (z0 + z1) / 2];
    const inset = (pts, d) => pts.map(q => { const vx = ctr[0] - q[0], vz = ctr[1] - q[1], l = Math.hypot(vx, vz); return [q[0] + vx / l * d, q[1] + vz / l * d]; });
    plate('gloss', inset(crown, .05), H - .3, .3, '#1d2126');
    plate('gloss', inset(crown, 2.2), H, .012, '#2a2f36');                                  // a lighter field inside a dark border
    const holes = {[z0]: [cx - G.door, cx + G.door, G.doorH], [z1]: [cx - G.ledge, cx + G.ledge, G.ledgeH]};
    for (let i = 0; i < crown.length; i++) {
      const p = crown[i], q = crown[(i + 1) % crown.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (len < .05) continue;
      // Inward normal.
      let nx = -(q[1] - p[1]) / len, nz = (q[0] - p[0]) / len; if ((ctr[0] - p[0]) * nx + (ctr[1] - p[1]) * nz < 0) { nx = -nx; nz = -nz; }
      const off = (r, d) => [r[0] + nx * d, r[1] + nz * d];
      const h = Math.abs(p[1] - q[1]) < 1e-6 ? holes[p[1]] : null;
      let pieces = [[p, q]];
      if (h) { const [u, v] = q[0] > p[0] ? [h[0], h[1]] : [h[1], h[0]]; pieces = [[p, [u, p[1]]], [[v, p[1]], q]];
        const A = off([u, p[1]], .14), B = off([v, p[1]], .14);
        quad('glass', [[A[0], H + h[2], A[1]], [B[0], H + h[2], B[1]], [B[0], top(B) - .1, B[1]], [A[0], top(A) - .1, A[1]]], GL);
        box('metal', (u + v) / 2, H + h[2], p[1] + nz * .14, Math.abs(v - u) + .2, .16, .2, BRUSH);
        for (const xx of [u, v]) box('metal', xx, H + h[2] / 2, p[1] + nz * .14, .16, h[2], .24, BRUSH);
      }
      for (const [s, e] of pieces) {
        const L = Math.hypot(e[0] - s[0], e[1] - s[1]); if (L < .1) continue;
        const A = off(s, .14), B = off(e, .14);
        quad('glass', [[A[0], H, A[1]], [B[0], H, B[1]], [B[0], top(B) - .1, B[1]], [A[0], top(A) - .1, A[1]]], GL);
        // Mullions every ~3 m, a handrail, a light strip at the foot of the glass.
        const n = Math.max(1, Math.round(L / 3.1));
        for (let k = 0; k <= n; k++) { const t = k / n, m = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t], ht = top(m) - H; box('metal', m[0], H + ht / 2, m[1], .1, ht, .1, DARK); }
        along('metal', off(s, .5), off(e, .5), H + 1.05, .06, .06, BRUSH); along('metal', off(s, .5), off(e, .5), H + .55, .04, .04, BRUSH);
        for (let k = 0; k <= Math.max(1, Math.round(L / 2.5)); k++) { const t = k / Math.max(1, Math.round(L / 2.5)), m = off([s[0] + (e[0] - s[0]) * t, s[1] + (e[1] - s[1]) * t], .5); box('metal', m[0], H + .52, m[1], .05, 1.04, .05, BRUSH); }
        along('glow', off(s, .3), off(e, .3), H + .02, .03, .08, '#8fd0ff');
        // Solid glass (a wall collider, 4 m tall: no climbing out).
        const Aw = W(s[0], 0, s[1]), Bw = W(e[0], 0, e[1]), mx = (Aw.x + Bw.x) / 2, mz = (Aw.z + Bw.z) / 2;
        kit.colliders.push({x: mx, y: this.base + H + 2, z: mz, hx: L / 2, hy: 2, hz: .15, yaw: Math.atan2(-(Bw.z - Aw.z), Bw.x - Aw.x), tag: 'stone'});
      }
    }
    // Under the helipad: a ceiling with downlights (pools on the floor after dark).
    const flat = crown.filter(q => q[1] <= zm + 1e-6);
    plate('room', inset(flat, .2), H + 3.62, .3, '#2e3238');
    box('glow', cx, H + 3.58, zm - .1, x1 - x0 - .6, .08, .08, '#ffe9c9');
    for (let x = x0 + 3; x < x1 - 2; x += 4.2) for (let z = z0 + 3; z < zm - 1; z += 4.2) { box('glow', x, H + 3.6, z, .5, .04, .5, '#fff1da'); pool(x, H, z, 2.4, .3); }
    // Under the slanted glass roof: glass, cross beams and three purlins.
    const slope = crown.filter(q => q[1] >= zm - 1e-6);
    fan('glass', slope.map(q => [q[0], top(q) - .3, q[1]]), '#b7cbd9');
    const span = z => { const k = Math.max(0, z - (z1 - c)); return [x0 + k, x1 - k]; };
    for (let z = zm + 2.5; z < z1 - .5; z += 4) { const [xa, xb] = span(z); box('metal', (xa + xb) / 2, top([0, z]) - .5, z, xb - xa - .3, .35, .22, '#c3c8ce'); }
    for (const x of [cx - (x1 - x0) / 4, cx, cx + (x1 - x0) / 4]) { const ze = z1 - Math.max(0, Math.abs(x - cx) - (x1 - x0) / 2 + c) - .4, A = W(x, top([0, zm]) - .7, zm), B = W(x, top([0, ze]) - .7, ze); kit.rod('metal', A.toArray(), B.toArray(), .12, '#c3c8ce'); }
    // Benches facing the glass, coin binoculars, planters.
    const bench = (x, z, ang) => {
      const ux = Math.cos(ang), uz = Math.sin(ang);
      along('wood', [x - ux * 1.5, z - uz * 1.5], [x + ux * 1.5, z + uz * 1.5], H + .45, .08, .55, '#6f513a', true);
      for (const t of [-1.2, 1.2]) along('metal', [x + ux * t - uz * .2, z + uz * t + ux * .2], [x + ux * t + uz * .2, z + uz * t - ux * .2], H + .2, .4, .08, DARK);
    };
    for (const z of [-6, 6, 16]) { bench(x0 + 4, z, Math.PI / 2); bench(x1 - 4, z, Math.PI / 2); }
    bench(cx - 3, z1 - 6, 0); bench(cx + 3.5, z1 - 6, 0);
    const scope = (x, z, face) => {
      cyl('metal', x, H, z, .09, 1.15, '#3b4a57', true, 10);
      const p = W(x + face[0] * .05, H + 1.28, z + face[1] * .05); kit.box('metal', p.x, p.y, p.z, .32, .26, .42, a + Math.atan2(face[0], face[1]), '#2d6b8f');
      const e = W(x + face[0] * .28, H + 1.3, z + face[1] * .28); kit.box('glow', e.x, e.y, e.z, .2, .08, .04, a + Math.atan2(face[0], face[1]), '#d8f0ff');
    };
    scope(x0 + 1.3, -11, [-1, 0]); scope(x1 - 1.3, 1, [1, 0]); scope(x0 + 1.3, 11, [-1, 0]); scope(x1 - 1.3, -16, [1, 0]); scope(cx - 4, z1 - 2.2, [0, 1]);
    for (const [x, z] of [[cx, 2], [cx, -12]]) { cyl('stone', x, H, z, 1.1, .55, '#c9c2b5', true, 16); cyl('paint', x, H + .55, z, 1, .6, '#3d5e35', false, 12); cyl('paint', x, H + 1.1, z, .6, .8, '#4a6b3d', false, 10); }
    for (const [x, z] of [[x0 + 5, -6], [x1 - 5, 6], [cx, 12]]) pool(x, H, z, 3.2, .22);

    /* -------------------------------------------- the Sky Ledge, out of the north face */
    const lw = G.ledge, lz0 = z1, lz1 = z1 + 3.2, lh = 3;
    box('glass', cx, H - .03, (lz0 + lz1) / 2, lw * 2, .06, lz1 - lz0, '#c4dcec');
    box('glass', cx, H + lh, (lz0 + lz1) / 2, lw * 2, .06, lz1 - lz0, '#c4dcec');
    for (const s of [-1, 1]) quad('glass', [[cx + s * lw, H, lz0], [cx + s * lw, H, lz1], [cx + s * lw, H + lh, lz1], [cx + s * lw, H + lh, lz0]], GL);
    quad('glass', [[cx - lw, H, lz1], [cx + lw, H, lz1], [cx + lw, H + lh, lz1], [cx - lw, H + lh, lz1]], GL);
    for (const [x, z] of [[cx - lw, lz1], [cx + lw, lz1], [cx - lw, lz0], [cx + lw, lz0]]) box('metal', x, H + lh / 2, z, .12, lh, .12, BRUSH);
    for (const y of [H - .06, H + lh]) { along('metal', [cx - lw, lz0], [cx - lw, lz1], y, .12, .12, BRUSH); along('metal', [cx + lw, lz0], [cx + lw, lz1], y, .12, .12, BRUSH); along('metal', [cx - lw, lz1], [cx + lw, lz1], y, .12, .12, BRUSH); }
    along('glow', [cx - lw + .1, lz1 - .1], [cx + lw - .1, lz1 - .1], H + .02, .03, .06, '#8fd0ff');
    solid(cx, H - .25, (lz0 + lz1) / 2 + .05, lw * 2 + .2, .5, lz1 - lz0 + .2, 'stone');
    for (const s of [-1, 1]) solid(cx + s * (lw + .1), H + 1.6, (lz0 + lz1) / 2, .2, 3.2, lz1 - lz0 + .2);
    solid(cx, H + 1.6, lz1 + .1, lw * 2 + .4, 3.2, .2);
    kit.indoor = 0;

    /* ------------------------------------------------- signs */
    const sky = board(3.2, .9, (g, w, h) => {
      g.fillStyle = '#101418'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8fd0ff'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
      g.fillStyle = '#eef6ff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '600 120px Outfit, Arial'; g.fillText('SKY DECK  ↑', w / 2, h * .42);
      g.font = '500 44px Outfit, Arial'; g.fillStyle = '#9fc4dc'; g.fillText('212 M  ·  73 FLOORS  ·  E TO RIDE', w / 2, h * .78);
    });
    sky.position.copy(W(cx, 3.35, ez1 + .14)); sky.rotation.y = a; this.scene.add(sky);
    const name = board(12, 2.2, (g, w, h) => {
      g.fillStyle = '#16191d'; g.fillRect(0, 0, w, h); g.fillStyle = '#f1ece2'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '300 118px Outfit, Arial'; g.fillText('M E R I D I A N', w / 2, h * .45); g.font = '500 30px Outfit, Arial'; g.fillStyle = '#c23a33'; g.fillText('BANK TOWER  ·  LOS SANTERRA', w / 2, h * .8);
    });
    name.position.copy(W(D - 2.55, 8, 0)); name.rotation.y = a - Math.PI / 2; this.scene.add(name);
    const top1 = board(3.6, .9, (g, w, h) => {
      g.fillStyle = '#101418'; g.fillRect(0, 0, w, h); g.fillStyle = '#eef6ff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '600 104px Outfit, Arial'; g.fillText('MERIDIAN SKY DECK', w / 2, h * .42); g.font = '500 42px Outfit, Arial'; g.fillStyle = '#9fc4dc'; g.fillText('THE SKY LEDGE  →  NORTH END  ·  GLASS FLOOR', w / 2, h * .78);
    });
    top1.position.copy(W(cx + G.door + 2.6, H + 2.6, z0 + .3)); top1.rotation.y = a; this.scene.add(top1);

    /* --------------------------------------------------- the moving parts */
    this.buildCar(pl.mats);
    this.buildDoors(pl.mats);
    this.setGates(true, true);
    this.built = true;
  }

  buildCar(mats) {
    const ck = new Kit(), BR = '#8d9298';
    ck.indoor = 1;
    ck.box('metal', 0, -.08, 0, 3.1, .16, 3.1, 0, '#24272b');
    ck.box('gloss', 0, .002, 0, 2.9, .01, 2.9, 0, '#141619');
    ck.box('paint', 0, 3.0, 0, 3.1, .2, 3.1, 0, '#23262a');
    ck.box('glow', 0, 2.89, 0, 2.3, .03, 2.3, 0, '#fff3e0');
    for (const x of [-1.5, 1.5]) for (const z of [-1.5, 1.5]) ck.box('metal', x, 1.45, z, .1, 2.9, .1, 0, BR);
    for (const s of [-1, 1]) ck.box('metal', s * 1.3, 1.45, 1.5, .4, 2.9, .12, 0, BR);
    ck.box('metal', 0, 2.78, 1.5, 3.1, .24, .12, 0, BR);
    // Handrails round the glass, a strip of light at the floor.
    for (const [x0, z0, x1, z1] of [[-1.38, -1.38, 1.38, -1.38], [-1.38, -1.38, -1.38, 1.2], [1.38, -1.38, 1.38, 1.2]]) ck.beam('metal', x0, z0, x1, z1, .95, .05, .05, BR);
    ck.beam('glow', -1.42, -1.42, 1.42, -1.42, .02, .02, .05, '#8fd0ff');
    const glass = new T.Group();
    const cabGlass = new T.MeshPhysicalNodeMaterial({roughness: .04, metalness: 0, transparent: true, opacity: .16, side: T.DoubleSide, depthWrite: false});
    cabGlass.color.set('#a9c2d4'); wetWindow(cabGlass, {local: true});
    const pane = (w, h, x, y, z, ry) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), cabGlass); m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 2; glass.add(m); };
    pane(3, 2.9, 0, 1.45, -1.5, 0); pane(3, 2.9, -1.5, 1.45, 0, Math.PI / 2); pane(3, 2.9, 1.5, 1.45, 0, Math.PI / 2);
    this.car = new T.Group(); this.car.rotation.y = this.a; this.car.add(glass);
    ck.build(this.car, mats, {shadows: false});
    // The car's own doors (brushed steel) and the floor display over them.
    this.carDoors = [-1, 1].map(s => { const m = new T.Mesh(new T.BoxGeometry(1.12, 2.62, .04), new T.MeshStandardMaterial({color: '#9aa1a8', metalness: .85, roughness: .32})); m.position.set(s * .55, 1.31, 1.42); this.car.add(m); return m; });
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; this.dispCv = cv;
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; this.dispTex = tex;
    const disp = new T.Mesh(new T.PlaneGeometry(.8, .3), new T.MeshBasicMaterial({map: tex, toneMapped: false}));
    disp.position.set(0, 2.78, 1.43); disp.rotation.y = Math.PI; this.car.add(disp);
    this.scene.add(this.car); this.placeCar();
    this.display('L', 0);
  }
  buildDoors() {
    const G = this.G, mk = (w, h, mat) => { const m = new T.Mesh(new T.BoxGeometry(.05, h, w), mat); m.rotation.y = this.a + Math.PI / 2; m.renderOrder = 2; this.scene.add(m); return m; };
    const gl = new T.MeshPhysicalNodeMaterial({roughness: .05, metalness: .1, transparent: true, opacity: .28, depthWrite: false}); gl.color.set('#b9cfdf');
    const front = new T.MeshPhysicalNodeMaterial({roughness: .05, metalness: .1, transparent: true, opacity: .24, depthWrite: false}); front.color.set('#a9c0d0');
    wetWindow(front, {local: true});
    // Landing doors: lobby (glass) and deck (glass), two panels each; the lobby's front doors.
    this.landB = [-1, 1].map(() => mk(1.1, 2.62, gl));
    this.landT = [-1, 1].map(() => mk(G.door, 2.85, gl));
    this.fronts = [-1, 1].map(() => { const m = new T.Mesh(new T.BoxGeometry(.06, 3.2, 2.4), front); m.rotation.y = this.a; m.renderOrder = 2; this.scene.add(m); return m; });
    this.placeDoors();
  }
  placeCar() { const p = this.W(this.G.cx, this.cabY, this.G.zc); this.car.position.copy(p); this.car.updateMatrixWorld(); }
  placeDoors() {
    const G = this.G, o = this.door, bOpen = this.stop === 'B' && !this.go ? o : 0, tOpen = this.stop === 'T' && !this.go ? o : 0;
    [-1, 1].forEach((s, i) => {
      this.carDoors[i].position.x = s * (.55 + o * 1.0);
      this.landB[i].position.copy(this.W(G.cx + s * (.55 + bOpen * 1.0), 1.31, G.zc + 1.74));
      this.landT[i].position.copy(this.W(G.cx + s * (G.door / 2 + tOpen * (G.door - .05)), G.H + 1.43, G.z0 + .28));
      this.fronts[i].position.copy(this.W(2.1, 1.6, s * (1.2 + this.front * 2.3)));
    });
  }
  /** Shut gates are colliders across a landing whose doors are not open. */
  setGates(B, Tt) {
    const G = this.G, P = this.physics;
    if (!P) return;
    const put = (key, on, x, y, z, sx, sy, sz) => {
      if (this.gates[key] === on) return; this.gates[key] = on;
      if (on) { const p = this.W(x, y, z); P.setBoxes('skyGate' + key, [{x: p.x, y: p.y, z: p.z, hx: sx / 2, hy: sy / 2, hz: sz / 2, yaw: this.a, tag: 'metal'}]); }
      else P.remove('skyGate' + key);
    };
    put('B', B, G.cx, 1.5, G.zc + 1.65, 2.4, 3, .2);
    put('T', Tt, G.cx, G.H + 1.5, G.z0 + .1, G.door * 2 + .2, 3, .25);
  }
  display(text, dir) {
    const c = this.dispCv.getContext('2d'), w = this.dispCv.width, h = this.dispCv.height;
    c.fillStyle = '#050607'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#ff9a3c'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '700 64px "Courier New", monospace';
    c.fillText(text, w / 2 + (dir ? 22 : 0), h / 2 + 3);
    if (dir) { c.beginPath(); const x = 44, y = h / 2; if (dir > 0) { c.moveTo(x - 18, y + 12); c.lineTo(x + 18, y + 12); c.lineTo(x, y - 16); } else { c.moveTo(x - 18, y - 12); c.lineTo(x + 18, y - 12); c.lineTo(x, y + 16); } c.fill(); }
    this.dispTex.needsUpdate = true;
  }
  floorAt(y) { return y < 1 ? 'L' : y > this.G.H - 1 ? 'SKY' : String(Math.max(1, Math.round(y / this.G.H * FLOORS))); }

  /** E: ride (in the car) or call it (at a landing). True if it was ours. */
  press() {
    if (!this.built || this.go) return !!this.go && this.here;
    if (this.inCar) { this.depart(this.stop === 'B' ? 'T' : 'B', true); return true; }
    if (this.atLanding && this.atLanding !== this.stop) { this.depart(this.atLanding, false); return true; }
    if (this.atLanding === this.stop) { this.idleT = 0; return true; }
    return false;
  }
  depart(to, ride) { this.go = {to, ride, phase: 'close', t: 0, from: this.cabY, dur: ride ? RIDE : CALL}; this.carry = null; this.audio?.chime(.5); }

  /** o: {dt, walker, onFoot, audio: {ctx, out}|null}. Returns true while it is carrying the walker (skip walker.update). */
  update({dt, walker, onFoot, audio}) {
    if (!this.built) return false;
    const G = this.G, w = onFoot && walker?.active ? this.L(walker.pos) : null;
    if (audio && !this.audio) this.audio = new LiftAudio(audio.ctx, audio.out);
    // Where are you?
    this.here = !!w && Math.abs(w.x - G.cx) < 40 && Math.abs(w.z) < 50;
    this.inCar = !!w && Math.abs(w.x - G.cx) < 1.42 && Math.abs(w.z - G.zc) < 1.42 && Math.abs(w.y - this.cabY) < 1.2;
    const nearB = !!w && Math.hypot(w.x - G.cx, w.z - (G.zc + 3)) < 4.2 && Math.abs(w.y) < 2.5;
    const nearT = !!w && Math.hypot(w.x - G.cx, w.z - (G.z0 + 2.6)) < 4.6 && Math.abs(w.y - G.H) < 2.5;
    this.atLanding = nearB ? 'B' : nearT ? 'T' : null;
    const lobby = !!w && w.x > 2 && w.x < G.D - 2 && Math.abs(w.z) < G.Wd / 2 - 2 && w.y < G.P && w.y > -2;
    const deck = !!w && w.x > G.x0 && w.x < G.x1 && w.z > G.z0 - .2 && w.z < G.z1 + 3.4 && w.y > G.H - 1.5 && w.y < G.H + 40;
    this.indoor = lobby || deck || this.inCar ? 1 : 0;
    // The lobby's front doors slide open as you come up to them.
    const nearFront = !!w && Math.hypot(w.x - 2.1, w.z) < 6 && w.y < 4 && w.y > -2;
    this.front += ((nearFront ? 1 : 0) - this.front) * (1 - Math.exp(-dt * 4));
    // The ride.
    const g = this.go;
    if (g) {
      g.t += dt;
      if (g.phase === 'close') {
        this.door = Math.max(0, this.door - dt / 1.1);
        if (this.door === 0) { g.phase = 'move'; g.t = 0; this.stop = null; this.audio?.ride(true);
          if (g.ride && this.inCar) this.carry = {x: Math.max(-1.15, Math.min(1.15, w.x - G.cx)), z: Math.max(-1.15, Math.min(1.15, w.z - G.zc))}; }
      } else if (g.phase === 'move') {
        const k = Math.min(1, g.t / g.dur), s = k * k * k * (k * (k * 6 - 15) + 10), to = g.to === 'T' ? G.H : 0;
        const prev = this.cabY; this.cabY = g.from + (to - g.from) * s;
        this.speed = Math.abs(this.cabY - prev) / Math.max(dt, 1e-3);
        this.audio?.rideLevel(Math.min(1, this.speed / 20));
        if (k >= 1) { g.phase = 'open'; this.stop = g.to; this.speed = 0; this.audio?.ride(false); this.audio?.chime(1); }
      } else {
        this.door = Math.min(1, this.door + dt / 1.1);
        if (this.door === 1) { this.go = null; this.carry = null; this.idleT = 0; }
      }
      if (g.phase !== 'move' && Math.abs(this.door - (g.phase === 'close' ? 0 : 1)) > .001 && !this.doorSnd) { this.doorSnd = true; this.audio?.doors(); }
      if (Math.abs(this.door - (g.phase === 'close' ? 0 : 1)) < .001) this.doorSnd = false;
    } else {
      // Standing at a floor: open while anyone is in it or at its landing, shut a few seconds after.
      const want = this.inCar || this.atLanding === this.stop;
      this.idleT = want ? 0 : this.idleT + dt;
      const target = this.idleT < 3.5 ? 1 : 0, was = this.door;
      this.door = target ? Math.min(1, this.door + dt / 1.1) : Math.max(0, this.door - dt / 1.1);
      if ((was === 0 && this.door > 0) || (was === 1 && this.door < 1)) this.audio?.doors();
    }
    this.placeCar(); this.placeDoors();
    const open = !this.go && this.door > .85;
    this.setGates(!(open && this.stop === 'B'), !(open && this.stop === 'T'));
    // The display: floor and direction.
    const f = this.floorAt(this.cabY), dir = this.go?.phase === 'move' ? (this.go.to === 'T' ? 1 : -1) : 0;
    if (f + dir !== this.shown) { this.shown = f + dir; this.display(f, dir); }
    // Carry the rider.
    const carrying = !!this.carry && this.go?.phase === 'move' && onFoot;
    if (carrying) { const p = this.W(G.cx + this.carry.x, this.cabY + .01, G.zc + this.carry.z); walker.place(p.x, p.y, p.z); }
    // What the prompt says.
    if (carrying) this.prompt = (dir > 0 ? '▲ ' : '▼ ') + (f === 'SKY' ? 'SKY DECK' : f === 'L' ? 'LOBBY' : 'FLOOR ' + f) + ' · MERIDIAN SKY DECK · ' + (document.pointerLockElement ? 'MOUSE' : 'DRAG') + ' TO LOOK';
    else if (this.go && this.here) this.prompt = this.go.phase === 'move' ? 'THE ELEVATOR IS ON ITS WAY · ' + f : '';
    else if (this.inCar && !this.go) this.prompt = '<kbd>E</kbd> ' + (this.stop === 'B' ? 'RIDE UP TO THE SKY DECK · 212 M' : 'RIDE DOWN TO THE LOBBY');
    else if (this.atLanding && this.atLanding !== this.stop) this.prompt = '<kbd>E</kbd> CALL THE ELEVATOR';
    else if (this.atLanding === 'B' && this.door < .5) this.prompt = '<kbd>E</kbd> OPEN THE ELEVATOR';
    else if (deck && w.z > G.z1 + .2) this.prompt = 'THE SKY LEDGE · 212 M STRAIGHT DOWN';
    else this.prompt = '';
    return carrying;
  }
}

/* ------------------------------------------------------------------ sound */
/** The arrival chime, the doors, and the ride: a motor hum and the wind on the glass, rising with speed. */
class LiftAudio {
  constructor(ctx, out) {
    this.ctx = ctx; this.bus = ctx.createGain(); this.bus.gain.value = .9; this.bus.connect(out);
    const sr = ctx.sampleRate, n = sr * 2, b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.noise = b;
    this.level = ctx.createGain(); this.level.gain.value = 0; this.level.connect(this.bus);
    const hum = ctx.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 48; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    this.humG = ctx.createGain(); this.humG.gain.value = 0; hum.connect(lp).connect(this.humG).connect(this.level); hum.start(); this.hum = hum;
    const wind = ctx.createBufferSource(); wind.buffer = b; wind.loop = true; this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.frequency.value = 500; this.windF.Q.value = .6;
    this.windG = ctx.createGain(); this.windG.gain.value = 0; wind.connect(this.windF).connect(this.windG).connect(this.level); wind.start();
  }
  ride(on) { this.level.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, on ? .3 : .5); }
  rideLevel(k) {
    const t = this.ctx.currentTime;
    this.humG.gain.setTargetAtTime(.04 + k * .05, t, .2); this.hum.frequency.setTargetAtTime(44 + k * 30, t, .3);
    this.windG.gain.setTargetAtTime(k * k * .09, t, .2); this.windF.frequency.setTargetAtTime(380 + k * 900, t, .3);
  }
  /** A soft two-note bell. */
  chime(v = 1) {
    const c = this.ctx, t = c.currentTime;
    [[1318.5, 0], [1046.5, .32]].forEach(([f, at]) => {
      for (const [m, a] of [[1, 1], [2.76, .28], [5.4, .1]]) {
        const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f * m;
        g.gain.setValueAtTime(0, t + at); g.gain.linearRampToValueAtTime(.05 * a * v, t + at + .006); g.gain.exponentialRampToValueAtTime(.0004, t + at + 1.4 / m);
        o.connect(g).connect(this.bus); o.start(t + at); o.stop(t + at + 1.5);
      }
    });
  }
  doors() {
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = .8;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.035, t + .15); g.gain.linearRampToValueAtTime(.03, t + .8); g.gain.exponentialRampToValueAtTime(.001, t + 1.1);
    s.connect(f).connect(g).connect(this.bus); s.start(t, Math.random()); s.stop(t + 1.2);
  }
}
