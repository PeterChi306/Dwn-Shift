/* Set pieces (2026-09-27): hand-built places that are not lots on a street.
 *
 *   - the Hollywood sign, on the south face of Mount Lee above Mulholland,
 *     nine sheet-metal letters on their scaffolds, each seated on the slope
 *     at its own height like the real one, floodlit after dark;
 *   - the Mount Lee overlook at the top of Mount Lee Summit Road: a levelled
 *     plaza with parking, a stone parapet, coin binoculars, benches, shade
 *     pavilions and lamps, and the summit's antenna mast;
 *   (the race track, drag strip and player houses are added by their own
 *   modules through the same kit and the same RESERVED list).
 *
 * `plan()` runs BEFORE the city is planned: it levels ground pads and
 * reserves the footprints, so no lot, garden or tree lands on a set piece.
 * `build()` makes the meshes and colliders once the scene exists.
 */
import * as T from 'three';
import {Kit, kitMaterials} from './kit.js';

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
    const y = Y + .06, s0 = cz - hl, s1 = cz + hl - 2;                 // north (drive) to south (view) edge
    // The drive up from the road's turning circle: asphalt laid on the ground.
    {
      const [rx, rz] = OVERLOOK.road, pts = [];
      for (let t = 0; t <= 1.0001; t += 1 / 24) { const px = rx + (cx - rx) * t, pz = rz + (s0 + 2 - rz) * t; pts.push([px, g.height(px, pz) + .02, pz]); }
      kit.ribbon('line', pts, 8, '#57544f', .04);
      for (const side of [-1, 1]) kit.ribbon('line', pts.map(([px, py, pz]) => [px + side * 3.7, py, pz]), .14, '#e8e4d8', .06);
    }
    // Plaza: warm pavers with darker joints, parking along the north end.
    kit.box('line', cx, y, (s0 + s1) / 2, hw * 2 - 4, .08, s1 - s0, 0, '#a99c86');
    for (let k = -6; k <= 6; k++) kit.box('line', cx + k * 4.8, y + .012, (s0 + s1) / 2 + 8, .1, .08, s1 - s0 - 18, 0, '#978a74');
    for (let x = cx - hw + 6; x < cx + hw - 5; x += 2.8) kit.box('line', x, y + .014, s0 + 5, .12, .08, 5.2, 0, '#f2f2ee');
    // Stone parapet with a steel railing round the view end.
    const px0 = cx - hw + 5, px1 = cx + hw - 5, pz = s1;
    kit.box('paint', cx, y + .5, pz, px1 - px0, 1, .8, 0, '#b8ab94', true);
    kit.box('metal', cx, y + 1.15, pz, px1 - px0, .06, .06, 0, '#474a4d');
    kit.box('paint', cx, y - 4, pz + .2, px1 - px0 + .8, 8, .8, 0, '#a89c86');          // its retaining face, down the slope
    for (let x = px0; x <= px1; x += 2) kit.post('metal', x, y + 1, y + 1.15, pz, .05, .05, 0, '#474a4d');
    for (const side of [-1, 1]) {
      kit.box('paint', cx + side * (hw - 5), y + .5, s1 - 22, .8, 1, 44, 0, '#b8ab94', true);
      kit.box('metal', cx + side * (hw - 5), y + 1.15, s1 - 22, .06, .06, 44, 0, '#474a4d');
    }
    // Coin binoculars along the parapet.
    for (const x of [cx - 21, cx - 7, cx + 7, cx + 21]) {
      kit.cyl('metal', x, y, pz - 1.3, .09, 1.15, '#3d4245', 8);
      kit.box('metal', x, y + 1.3, pz - 1.3, .5, .32, .3, 0, '#e2b33c');
      for (const s of [-1, 1]) kit.cyl('metal', x + s * .12, y + 1.28, pz - 1.1, .07, .22, '#2b2b2b', 8);
    }
    // Benches facing the view, planters with agaves.
    for (const x of [cx - 28, cx - 14, cx, cx + 14, cx + 28]) {
      kit.box('paint', x, y + .45, pz - 6, 2.6, .12, .5, 0, '#8a6242');
      kit.box('paint', x, y + .75, pz - 6.25, 2.6, .5, .08, 0, '#8a6242');
      for (const s of [-1, 1]) kit.box('metal', x + s * 1.1, y + .22, pz - 6, .08, .44, .5, 0, '#333');
    }
    for (const x of [cx - 34, cx - 21, cx + 21, cx + 34]) {
      kit.box('paint', x, y + .4, pz - 12, 2.4, .8, 2.4, 0, '#9f9383', true);
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; kit.add('paint', new T.ConeGeometry(.12, 1.1, 4), x + Math.cos(a) * .4, y + 1.2, pz - 12 + Math.sin(a) * .4, a, '#5c7a5a', {rx: .5 * Math.cos(a), rz: .5 * Math.sin(a)}); }
    }
    // Shade pavilions: slender steel columns, thin roofs.
    for (const x of [cx - 24, cx + 24]) {
      const z = pz - 24;
      for (const dx of [-5, 5]) for (const dz of [-3.5, 3.5]) kit.cyl('metal', x + dx, y, z + dz, .12, 3.2, '#2f3134', 8, true);
      kit.box('paint', x, y + 3.35, z, 12.5, .3, 8.4, 0, '#f1efe8');
      kit.box('glow', x, y + 3.18, z, 9, .04, .3, 0, '#fff1d6');
      for (const dz of [-1.5, 1.5]) kit.box('paint', x, y + .45, z + dz, 4, .1, .45, 0, '#8a6242');
    }
    // Lamps round the plaza and along the drive.
    for (let z = s0 + 10; z < s1; z += 18) for (const side of [-1, 1]) {
      const x = cx + side * (hw - 6.5);
      kit.cyl('metal', x, y, z, .08, 4.6, '#2d2f31', 8);
      kit.box('glow', x, y + 4.7, z, .5, .18, .5, 0, '#ffe6bd');
    }
    // A sign board at the entrance.
    { const bx = cx - 9, bz = s0 - 14, by = g.height(bx, bz);
      kit.box('paint', bx, by + 1.1, bz, 5.5, 2.2, .3, 0, '#2c3a33', true);
      kit.box('lit', bx, by + 1.5, bz + .17, 4.6, .7, .05, 0, '#e8e2cf');
      for (const s of [-2.4, 2.4]) kit.post('paint', bx + s, by - .5, by, bz, .3, .3, 0, '#8e8272'); }
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
