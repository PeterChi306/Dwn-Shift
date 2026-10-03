/* Set pieces (2026-09-27): hand-built places that are not lots on a street.
 *
 *   - the Hollywood sign, on the south face of Mount Lee above Mulholland,
 *     nine sheet-metal letters on their scaffolds, each seated on the slope
 *     at its own height like the real one, floodlit after dark;
 *   - the Mount Lee overlook at the top of Mount Lee Summit Road (rebuilt
 *     2026-10-02): a graded, kerbed and lit access drive, a striped parking
 *     lot under light poles, a picnic lawn with tables, grills, shade trees
 *     and string lights, and the view terrace with its stone parapet, coin
 *     binoculars and benches; and the summit's antenna mast;
 *   (the race track, drag strip and player houses are added by their own
 *   modules through the same kit and the same RESERVED list).
 *
 * `plan()` runs BEFORE the city is planned: it levels ground pads and
 * reserves the footprints, so no lot, garden or tree lands on a set piece.
 * `build()` makes the meshes and colliders once the scene exists.
 */
import * as T from 'three';
import {Kit, kitMaterials, washDisc, washFan} from './kit.js';

/** Footprints kept free of lots and gardens: circles {x, z, r}. */
export const RESERVED = [];
export const reserved = (x, z, pad = 0) => RESERVED.some(c => (x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2);

// Mulholland Crest runs along the face below the sign (bearing from these points).
const SIGN = {x: -1258, z: -3187, dir: [.934, -.358], H: 21, pitch: 14.6};
const OVERLOOK = {x: -1075, z: -3262, y: 539.5, hl: 32, hw: 34, road: [-1070, -3392]};
const MAST = {x: -1228, z: -3418};
export class Places {
  constructor({model, ground}) {
    this.model = model; this.ground = ground;
    this.pois = [];          // for the map: {name, kind, x, z}
    this.homes = [];         // player houses: {name, x, z, heading, ...}
    this.extras = [];        // other modules' build hooks
    RESERVED.push({x: SIGN.x, z: SIGN.z, r: 95}, {x: OVERLOOK.x, z: OVERLOOK.z, r: 70}, {x: OVERLOOK.x, z: OVERLOOK.z - 80, r: 30});
    ground.addPad({cx: OVERLOOK.x, cz: OVERLOOK.z, fx: 0, fz: 1, hl: OVERLOOK.hl, hw: OVERLOOK.hw, y: OVERLOOK.y, margin: 22});
    this.pois.push({name: 'Santerra Beach', kind: 'beach', x: -1400, z: 3890}, {name: 'Hollywood Sign', kind: 'view', x: SIGN.x, z: SIGN.z + 60}, {name: 'Mount Lee Overlook', kind: 'view', x: OVERLOOK.x, z: OVERLOOK.z - 60});
  }

  build({scene, physics, night}) {
    const kit = new Kit();
    this.scene = scene;
    this.mats = kitMaterials(night);
    this.hollywoodSign(kit);
    this.overlook(kit);
    for (const f of this.extras) f(kit, this);
    this.group = kit.build(scene, this.mats);
    if (physics && kit.colliders.length) physics.setBoxes('places', kit.colliders);
    if (physics && kit.tris.idx.length) physics.setMesh('placesMesh', new Float32Array(kit.tris.pos), new Uint32Array(kit.tris.idx));
    this.kit = kit;
    return this;
  }

  /* ------------------------------------------------------ Hollywood sign */
  hollywoodSign(kit) {
    const g = this.ground, {H} = SIGN, [ux, uz] = SIGN.dir, nx = -uz, nz = ux;   // n faces the city (south)
    // Face yaw: the letters' local +z (extrusion) points along n.
    const yaw = Math.atan2(nx, nz);
    const letters = 'HOLLYWOOD', widths = {H: 12.5, O: 13.5, L: 10.5, Y: 13.5, W: 17, D: 13};
    const total = [...letters].reduce((s, c) => s + widths[c], 0) + (letters.length - 1) * 2.2;
    let off = -total / 2;
    for (const ch of letters) {
      const w = widths[ch], cx = off + w / 2; off += w + 2.2;
      const x = SIGN.x + ux * cx, z = SIGN.z + uz * cx;
      // Seated on the slope: the lowest ground under the letter, a little buried.
      let lo = Infinity; for (const t of [-.5, 0, .5]) for (const d of [-2, 0, 2]) lo = Math.min(lo, g.height(x + ux * t * w + nx * d, z + uz * t * w + nz * d));
      const base = lo - .8, jitter = Math.sin(cx * 1.7) * .03;          // the real letters are not quite in line
      const geo = letterGeometry(ch, w, H);
      // Local shape x runs left-to-right as seen from the city: along -u when facing n... build then place.
      kit.add('lit', geo, x - ux * w / 2 * 1, base, z - uz * w / 2 * 1, yaw + jitter, '#f7f6f1');
      // Scaffold behind the letter: poles, a ladder frame and cross braces down to the ground.
      const bx = x - nx * 1.6, bz = z - nz * 1.6;
      for (const t of [-.38, -.1, .18, .42]) {
        const px = bx + ux * t * w, pz = bz + uz * t * w, gy = g.height(px, pz) - .5;
        kit.post('paint', px, gy, base + H * .92, pz, .32, .32, yaw, '#4d4a45');
      }
      for (const hh of [.22, .5, .78]) kit.beam('paint', bx - ux * w * .42, bz - uz * w * .42, bx + ux * w * .44, bz + uz * w * .44, base + H * hh, .18, .18, '#56524c');
      for (const t of [-.24, .3]) {                                        // diagonal struts back into the hill
        const px = bx + ux * t * w, pz = bz + uz * t * w, gx = px - nx * 5, gz = pz - nz * 5;
        kit.rod('paint', [px, base + H * .55, pz], [gx, g.height(gx, gz) - .3, gz], .12, '#56524c');
      }
      // Floodlights on the slope in front, aimed up at the letter.
      const fx = x + nx * 9, fz = z + nz * 9, fy = g.height(fx, fz);
      kit.box('metal', fx, fy + .35, fz, 1.2, .7, .6, yaw, '#3a3a3a');
      kit.box('glow', fx + nx * .32, fy + .45, fz + nz * .32, .9, .4, .05, yaw, '#fff3dc');
    }
    // A security fence along the slope below the sign, as there really is.
    const fy0 = SIGN.z + nz * 16, fx0 = SIGN.x + nx * 16;
    for (let t = -total / 2 - 6; t <= total / 2 + 6; t += 4) {
      const px = fx0 + ux * t, pz = fy0 + uz * t;
      kit.post('metal', px, this.ground.height(px, pz) - .3, this.ground.height(px, pz) + 2.2, pz, .07, .07, 0, '#6c6c6c');
    }
    for (const hh of [.4, 1.2, 2.1]) {
      const pts = [];
      for (let t = -total / 2 - 6; t <= total / 2 + 6; t += 4) { const px = fx0 + ux * t, pz = fy0 + uz * t; pts.push([px, this.ground.height(px, pz) + hh, pz]); }
      for (let i = 0; i < pts.length - 1; i++) kit.beam('metal', pts[i][0], pts[i][2], pts[i + 1][0], pts[i + 1][2], (pts[i][1] + pts[i + 1][1]) / 2, .04, .04, '#7a7a7a');
    }
  }

  /* ------------------------------------------------------ Mount Lee overlook */
  overlook(kit) {
    const {x: cx, z: cz, y: Y, hl, hw} = OVERLOOK, g = this.ground;
    const y = Y + .02, s0 = cz - hl, s1 = cz + hl - 2;                 // north (drive) to south (view) edge
    const ASPH = '#34363a', LINE = '#efefe9', KERB = '#b9b3a7', PAVER = '#b6a98f', WARM = '#ffe2b0';
    const pool = (x, z, r, I = .5) => kit.add('wash', washDisc(r, I), x, g.height(x, z) + .08, z, 0, '#ffffff', {keep: true});
    /** A lamp post: pole, arm(s) and lit head(s), with the pool it throws. */
    const lamp = (x, z, yaw, {arms = 1, h = 6, r = 10} = {}) => {
      const gy = g.height(x, z);
      kit.cyl('metal', x, gy, z, .09, h, '#2a2c2f', 8, true, .07);
      for (let k = 0; k < arms; k++) {
        const a = yaw + k * Math.PI, dx = Math.sin(a) * 1.1, dz = Math.cos(a) * 1.1;
        kit.rod('metal', [x, gy + h - .15, z], [x + dx, gy + h, z + dz], .045, '#2a2c2f');
        kit.box('metal', x + dx, gy + h, z + dz, .55, .14, .32, -a, '#2a2c2f');
        kit.box('glow', x + dx, gy + h - .09, z + dz, .44, .04, .24, -a, WARM);
        pool(x + dx * 2.2, z + dz * 2.2, r);
      }
    };

    /* ---- the drive: Mount Lee Summit Road itself now curves up into the lot
     * (tools/add_overlook_drive.mjs). Along its last ~100 m: reflector posts,
     * lamps throwing pools on it, and the entrance sign. */
    const m = this.model, mouth = [cx, s0 - 2];
    const seg = m.segments.find(q => q.name === 'Mount Lee Summit Road' && [0, q.L].some(t => { const e = m.sectionAt(q, t); return Math.hypot(e.x - mouth[0], e.z - mouth[1]) < 4; }));
    if (seg) {
      const atEnd = (() => { const e = m.sectionAt(seg, seg.L); return Math.hypot(e.x - mouth[0], e.z - mouth[1]) < 4; })();
      const sec = d => m.sectionAt(seg, atEnd ? seg.L - d : d);           // d metres back from the lot
      const off = (q, o) => [q.x + q.nx * o, q.z + q.nz * o];
      for (let d = 8; d < 110; d += 9) for (const o of [-1, 1]) {
        const q = sec(d), [x, z] = off(q, o * (q.h + 1.3)), gy = g.height(x, z);
        kit.box('paint', x, gy + .45, z, .12, .9, .12, 0, '#f2f2ee');
        kit.box('glow', x, gy + .82, z, .13, .1, .13, 0, o > 0 ? '#ff5a3c' : '#fff1d0');
      }
      for (let d = 14, i = 0; d < 110; d += 22, i++) {
        const q = sec(d), o = (i % 2 ? 1 : -1) * (q.h + 2.4), [x, z] = off(q, o);
        lamp(x, z, Math.atan2(q.x - x, q.z - z), {r: 8.5});
      }
      { // entrance sign: OVERLOOK · PARKING · PICNIC, lit at night
        const q = sec(30), [x, z] = off(q, -(q.h + 4.5)), gy = g.height(x, z), yaw = Math.atan2(q.tx, q.tz) + Math.PI / 2;
        kit.box('paint', x, gy + 1.3, z, 4.6, 2.2, .3, yaw, '#24342c', true);
        kit.box('lit', x, gy + 1.7, z, 4.0, .55, .34, yaw, '#e8e2cf');
        kit.box('lit', x, gy + 1.05, z, 1.1, .55, .34, yaw, '#2e6fd6');
        for (const o2 of [-2.1, 2.1]) kit.post('paint', x + Math.cos(yaw) * o2, gy - .5, gy + .2, z - Math.sin(yaw) * o2, .3, .3, yaw, '#8e8272');
      }
    }

    /* ---- the parking lot (west and middle, by the drive) */
    const lx0 = cx - 32, lx1 = cx + 6, lz0 = s0 + 1, lz1 = s0 + 21;
    kit.box('line', (lx0 + lx1) / 2, y, (lz0 + lz1) / 2, lx1 - lx0, .04, lz1 - lz0, 0, ASPH);
    kit.box('line', cx, y, s0 + .5, 9.6, .04, 2, 0, ASPH);                                   // mouth where the road meets the lot
    const bay = (x, za, zb, color = LINE) => kit.box('line', x, y + .01, (za + zb) / 2, .12, .03, Math.abs(zb - za), 0, color);
    for (let x = lx0 + 1; x <= cx - 5.4; x += 2.7) bay(x, lz0, lz0 + 5.4);                    // north row, noses to the hill
    for (let x = lx0 + 1; x <= lx1 - .8; x += 2.7) bay(x, lz1 - 5.6, lz1);                    // south row, noses to the view
    kit.box('line', (lx0 + 1 + cx - 5.4) / 2, y + .01, lz0 + 5.4, cx - 5.4 - lx0 - 1, .03, .12, 0, LINE);
    kit.box('line', (lx0 + lx1) / 2 + .1, y + .01, lz1 - 5.6, lx1 - lx0 - 1.8, .03, .12, 0, LINE);
    for (let x = lx0 + 2.35; x < cx - 5.4; x += 2.7) kit.box('stone', x, y + .07, lz0 + .7, 1.7, .12, .2, 0, KERB);   // wheel stops
    for (let x = lx0 + 2.35; x < lx1 - .8; x += 2.7) kit.box('stone', x, y + .07, lz1 - .7, 1.7, .12, .2, 0, KERB);
    // Two accessible bays (blue, with the symbol as a white square), arrows down the aisle.
    for (const x of [lx0 + 2.35, lx0 + 5.05]) { kit.box('line', x, y + .008, lz1 - 2.8, 2.5, .03, 5.4, 0, '#2a5cb8'); kit.box('line', x, y + .02, lz1 - 2.8, .9, .03, .9, 0, LINE); }
    for (const x of [cx - 20, cx - 8]) { kit.box('line', x, y + .01, (lz0 + lz1) / 2, 2.2, .03, .25, 0, LINE); kit.add('line', new T.ConeGeometry(.45, .9, 3).rotateZ(-Math.PI / 2).scale(1, .05, 1), x - 1.5, y + .02, (lz0 + lz1) / 2, 0, LINE); }
    // Kerbs round the lot's west and south edges, light poles on the south kerb line.
    kit.box('stone', lx0 - .15, y + .1, (lz0 + lz1) / 2, .3, .2, lz1 - lz0, 0, KERB);
    kit.box('stone', (lx0 + lx1) / 2, y + .1, lz1 + .15, lx1 - lx0, .2, .3, 0, KERB);
    for (const x of [cx - 26, cx - 13, cx]) lamp(x, lz1 + .8, 0, {arms: 2, h: 7, r: 10.5});
    for (const x of [cx - 26, cx - 13]) lamp(x, lz0 - .6, 0, {h: 6.5, r: 9});
    { // P sign at the mouth
      const px = cx + 5.5, pz = s0 - .5;
      kit.cyl('metal', px, y, pz, .05, 2.6, '#8c9196', 8);
      kit.box('lit', px, y + 2.75, pz, .8, .8, .06, 0, '#1f55c4');
      kit.box('lit', px, y + 2.75, pz - .035, .38, .5, .02, 0, '#ffffff');
    }

    /* ---- picnic lawn (east of the lot, down to the terrace) */
    const px0 = cx + 9, px1 = cx + hw - 1, pz0 = s0 + 1, pz1 = s1 - 17;
    kit.box('grass', (px0 + px1) / 2, y, (pz0 + pz1) / 2, px1 - px0, .04, pz1 - pz0, 0, '#5f7d45');
    kit.box('line', cx + 7.5, y + .005, (s0 + s1) / 2, 3, .04, s1 - s0, 0, PAVER);              // path from the lot to the terrace
    for (let z = s0 + 1.5; z < s1; z += 1.2) kit.box('line', cx + 7.5, y + .01, z, 3, .03, .05, 0, '#9c8f77');
    const table = (x, z, yaw) => {
      const c = Math.cos(yaw), sn = Math.sin(yaw), at = (u, v) => [x + c * u + sn * v, z - sn * u + c * v];
      { const [ax, az] = at(0, 0); kit.box('wood', ax, y + .75, az, 2, .06, .82, yaw, '#8a6242', true); }
      for (const v of [-.68, .68]) { const [ax, az] = at(0, v); kit.box('wood', ax, y + .45, az, 2, .05, .28, yaw, '#7d5839'); }
      for (const u of [-.75, .75]) for (const v of [-.42, .42]) { const [ax, az] = at(u, v); kit.rod('metal', [ax, y, az], [x + c * u * .98, y + .74, z - sn * u * .98], .03, '#3b3d40'); }
    };
    const tables = [];
    for (const tz of [pz0 + 7, pz0 + 16, pz0 + 25]) for (const tx of [px0 + 6, px0 + 16]) { table(tx, tz, .12 * Math.sin(tx + tz)); tables.push([tx, tz]); }
    for (const [gx, gz] of [[px1 - 2.2, pz0 + 4], [px1 - 2.2, pz0 + 21]]) {         // charcoal grills
      kit.cyl('metal', gx, y, gz, .06, .8, '#2b2b2b', 8);
      kit.box('metal', gx, y + .86, gz, .75, .16, .5, 0, '#1d1e20');
      kit.box('metal', gx, y + .95, gz, .7, .02, .45, 0, '#55585c');
    }
    for (const [bx, bz] of [[px0 + 1, pz0 + 2], [px0 + 1, pz1 - 2], [px1 - 1, pz1 - 4]]) kit.cyl('paint', bx, y, bz, .3, .95, '#3f5a46', 10, true);   // bins
    const tree = (x, z, h) => {
      kit.cyl('wood', x, y, z, .18, h * .55, '#5b4632', 7, true, .13);
      kit.add('paint', new T.IcosahedronGeometry(h * .32, 1), x, y + h * .7, z, 0, '#4d6b38', {scale: new T.Vector3(1.15, .8, 1.15)});
      kit.add('paint', new T.IcosahedronGeometry(h * .22, 1), x + h * .18, y + h * .62, z - h * .1, 0, '#577743');
    };
    for (const [tx, tz, h] of [[px0 + 11, pz0 + 2.5, 7], [px1 - 3, pz0 + 12, 8], [px0 + 2.5, pz0 + 31, 6.5], [px1 - 4, pz1 - 1.5, 7.5]]) tree(tx, tz, h);
    // String lights: poles round the tables, warm bulbs on sagging wires, pools under them.
    const poles = [[px0 + 1, pz0 + 3], [px1 - 1, pz0 + 3], [px0 + 1, pz0 + 20], [px1 - 1, pz0 + 20], [px0 + 1, pz0 + 31], [px1 - 1, pz0 + 31]];
    for (const [qx, qz] of poles) kit.cyl('wood', qx, y, qz, .09, 4.4, '#6b5440', 8, true);
    const strings = [[0, 1], [2, 3], [4, 5], [0, 3], [1, 2], [2, 5], [3, 4]];
    for (const [i, j] of strings) {
      const [ax, az] = poles[i], [bx, bz] = poles[j], L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 1.1);
      let prev = null;
      for (let k = 0; k <= n; k++) {
        const t = k / n, sag = Math.sin(Math.PI * t) * L * .045, p = [ax + (bx - ax) * t, y + 4.25 - sag, az + (bz - az) * t];
        if (prev) kit.rod('metal', prev, p, .008, '#1b1b1b', 3);
        if (k && k < n) kit.add('glow', new T.SphereGeometry(.11, 6, 4), p[0], p[1] - .1, p[2], 0, '#ffd590');
        prev = p;
      }
    }
    for (const [tx, tz] of tables) pool(tx, tz, 6, .4);

    /* ---- the view terrace */
    const pz = s1, tx0 = cx - hw + 5, tx1 = cx + hw - 5, tz0 = s1 - 16;
    kit.box('line', cx, y, (tz0 + s1) / 2, hw * 2 - 4, .04, s1 - tz0, 0, PAVER);
    for (let k = -6; k <= 6; k++) kit.box('line', cx + k * 4.8, y + .006, (tz0 + s1) / 2, .1, .03, s1 - tz0, 0, '#9c8f77');
    kit.box('line', (lx0 + cx + 6) / 2, y, (lz1 + tz0) / 2, cx + 6 - lx0, .04, tz0 - lz1, 0, '#6d8a52');   // lawn between the lot and the terrace
    // Stone parapet with a steel railing round the view end.
    kit.box('paint', cx, y + .5, pz, tx1 - tx0, 1, .8, 0, '#b8ab94', true);
    kit.box('metal', cx, y + 1.15, pz, tx1 - tx0, .06, .06, 0, '#474a4d');
    kit.box('paint', cx, y - 4, pz + .2, tx1 - tx0 + .8, 8, .8, 0, '#a89c86');          // its retaining face, down the slope
    for (let x = tx0; x <= tx1; x += 2) kit.post('metal', x, y + 1, y + 1.15, pz, .05, .05, 0, '#474a4d');
    for (const sd of [-1, 1]) {
      kit.box('paint', cx + sd * (hw - 5), y + .5, s1 - 8, .8, 1, 16, 0, '#b8ab94', true);
      kit.box('metal', cx + sd * (hw - 5), y + 1.15, s1 - 8, .06, .06, 16, 0, '#474a4d');
    }
    // Coin binoculars along the parapet, benches facing the view.
    for (const x of [cx - 21, cx - 7, cx + 7, cx + 21]) {
      kit.cyl('metal', x, y, pz - 1.3, .09, 1.15, '#3d4245', 8);
      kit.box('metal', x, y + 1.3, pz - 1.3, .5, .32, .3, 0, '#e2b33c');
      for (const sd of [-1, 1]) kit.cyl('metal', x + sd * .12, y + 1.28, pz - 1.1, .07, .22, '#2b2b2b', 8);
    }
    for (const x of [cx - 28, cx - 14, cx, cx + 14, cx + 28]) {
      kit.box('paint', x, y + .45, pz - 6, 2.6, .12, .5, 0, '#8a6242');
      kit.box('paint', x, y + .75, pz - 6.25, 2.6, .5, .08, 0, '#8a6242');
      for (const sd of [-1, 1]) kit.box('metal', x + sd * 1.1, y + .22, pz - 6, .08, .44, .5, 0, '#333');
    }
    // Bollard lights along the terrace and the path, a glow along the parapet's foot.
    for (let x = tx0 + 2; x <= tx1 - 2; x += 7) { kit.cyl('metal', x, y, tz0 + .5, .1, .9, '#2d2f31', 8); kit.box('glow', x, y + .82, tz0 + .5, .16, .1, .16, 0, WARM); pool(x, tz0 + .5, 3.2, .5); }
    for (let z = s0 + 4; z < tz0; z += 8) { kit.cyl('metal', cx + 5.7, y, z, .1, .9, '#2d2f31', 8); kit.box('glow', cx + 5.7, y + .82, z, .16, .1, .16, 0, WARM); pool(cx + 7, z, 3, .45); }
    kit.box('glow', cx, y + .08, pz - .45, tx1 - tx0 - 1, .05, .05, 0, '#ffd9a0');
    for (let x = tx0 + 4; x < tx1; x += 8) kit.add('wash', washFan(5, 1.2, .5), x, y, pz - .42, Math.PI, '#ffffff', {keep: true});
    // One shade pavilion on the lawn by the lot.
    { const x = cx - 22, z = (lz1 + tz0) / 2 + 1;
      for (const dx of [-5, 5]) for (const dz of [-3.5, 3.5]) kit.cyl('metal', x + dx, y, z + dz, .12, 3.2, '#2f3134', 8, true);
      kit.box('paint', x, y + 3.35, z, 12.5, .3, 8.4, 0, '#f1efe8');
      kit.box('glow', x, y + 3.18, z, 9, .04, .3, 0, '#fff1d6');
      pool(x, z, 7, .6);
      for (const dz of [-1.5, 1.5]) kit.box('paint', x, y + .45, z + dz, 4, .1, .45, 0, '#8a6242'); }
    for (const x of [cx - 34 + 3, cx - 9]) {                                        // agave planters
      const z = tz0 - 3;
      kit.box('paint', x, y + .4, z, 2.4, .8, 2.4, 0, '#9f9383', true);
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; kit.add('paint', new T.ConeGeometry(.12, 1.1, 4), x + Math.cos(a) * .4, y + 1.2, z + Math.sin(a) * .4, a, '#5c7a5a', {rx: .5 * Math.cos(a), rz: .5 * Math.sin(a)}); }
    }
    // The summit's antenna mast: a tapering lattice with red beacons.
    const my = g.height(MAST.x, MAST.z), MH = 72;
    kit.box('paint', MAST.x, my + .5, MAST.z, 9, 1.4, 9, 0, '#9a968e', true);
    kit.box('paint', MAST.x + 9, my + 1.6, MAST.z, 7, 3.2, 5, 0, '#c9c5bc', true);          // equipment shed
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const bx = MAST.x + sx * 3.2, bz = MAST.z + sz * 3.2, tx = MAST.x + sx * .5, tz = MAST.z + sz * .5;
      kit.rod('metal', [bx, my, bz], [tx, my + MH, tz], .16, '#d4d2cc');
    }
    for (let h = 5; h < MH; h += 5) {
      const k = 3.2 - 2.7 * h / MH;
      for (const [ax, az, bx, bz] of [[-k, -k, k, -k], [k, -k, k, k], [k, k, -k, k], [-k, k, -k, -k]]) kit.beam('metal', MAST.x + ax, MAST.z + az, MAST.x + bx, MAST.z + bz, my + h, .08, .08, h % 10 ? '#d4d2cc' : '#c8432e');
    }
    for (const h of [24, 48, MH]) kit.box('glow', MAST.x, my + h + .4, MAST.z, .7, .7, .7, 0, '#ff2a14');
    kit.cyl('metal', MAST.x, my + MH, MAST.z, .12, 10, '#d4d2cc', 6);
    for (const h of [30, 42, 56]) kit.cyl('paint', MAST.x + 1.2, my + h, MAST.z, .9, 1.8, '#eeeeea', 10);   // panel antennas
  }
}

/** Extruded letter outlines, w x h, local origin at the bottom-left, face +z. */
function letterGeometry(ch, w, h) {
  const t = Math.min(3.5, w * .27), shapes = [];
  const rect = (x, y, sw, sh) => { const s = new T.Shape(); s.moveTo(x, y); s.lineTo(x + sw, y); s.lineTo(x + sw, y + sh); s.lineTo(x, y + sh); s.closePath(); shapes.push(s); };
  const quad = pts => { const s = new T.Shape(); s.moveTo(...pts[0]); for (const p of pts.slice(1)) s.lineTo(...p); s.closePath(); shapes.push(s); };
  if (ch === 'H') { rect(0, 0, t, h); rect(w - t, 0, t, h); rect(0, h * .44, w, t * .95); }
  else if (ch === 'L') { rect(0, 0, t, h); rect(0, 0, w, t); }
  else if (ch === 'O') {
    const s = new T.Shape(); s.absellipse(w / 2, h / 2, w / 2, h / 2, 0, Math.PI * 2, false);
    const hole = new T.Path(); hole.absellipse(w / 2, h / 2, w / 2 - t, h / 2 - t * .9, 0, Math.PI * 2, true); s.holes.push(hole); shapes.push(s);
  } else if (ch === 'Y') {
    const m = w / 2; rect(m - t / 2, 0, t, h * .5);
    quad([[0, h], [t * 1.15, h], [m + t / 2, h * .48], [m - t / 2, h * .48]]);
    quad([[w - t * 1.15, h], [w, h], [m + t / 2, h * .48], [m - t / 2, h * .48]]);
  } else if (ch === 'W') {
    const xs = [0, w * .26, w * .5, w * .74, w], ys = [h, 0, h * .72, 0, h];
    for (let i = 0; i < 4; i++) { const [x0, y0, x1, y1] = [xs[i], ys[i], xs[i + 1], ys[i + 1]], d = t * .52; quad([[x0 - d, y0], [x0 + d, y0], [x1 + d, y1], [x1 - d, y1]]); }
  } else if (ch === 'D') {
    const s = new T.Shape(); s.moveTo(0, 0); s.lineTo(w * .42, 0); s.absellipse(w * .42, h / 2, w * .58, h / 2, -Math.PI / 2, Math.PI / 2, false); s.lineTo(0, h); s.closePath();
    const hole = new T.Path(); hole.moveTo(t, t); hole.lineTo(w * .42, t); hole.absellipse(w * .42, h / 2, w * .58 - t, h / 2 - t, -Math.PI / 2, Math.PI / 2, false); hole.lineTo(t, h - t); hole.closePath();
    s.holes.push(hole); shapes.push(s);
  }
  const geos = shapes.map(s => new T.ExtrudeGeometry(s, {depth: .45, bevelEnabled: false, curveSegments: 18}));
  const out = geos.length === 1 ? geos[0] : mergeList(geos);
  return out;
}
function mergeList(geos) {
  const pos = [], nor = [];
  for (const g0 of geos) { const g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals(); pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  return g;
}
