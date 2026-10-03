/* Pacific Rest Area (2026-10-02): a rest stop off the westbound 10 by the
 * raceway. tools/add_rest_stop.mjs builds its ramps; this builds the place:
 * car and truck parking either side of an aisle the ramps run into, a gas
 * station (canopy, pumps, an EV charger, a lit store), a visitor building
 * with restrooms, a picnic lawn, a tall price pylon facing the freeway, and
 * light poles. Frame: u along the freeway eastward, v north of it (REST in
 * the tool — keep the two in step).
 */
import * as T from 'three';
import {RESERVED} from './places.js';
import {washDisc} from './kit.js';

export const REST = {C: [-7180, 2421], t: [.987, -.159], y: 11.1, lot: {u0: -142, u1: 112, v0: 62, v1: 122}};
const L = Math.hypot(...REST.t), TX = REST.t[0] / L, TZ = REST.t[1] / L, NX = TZ, NZ = -TX;
const W = (u, v) => [REST.C[0] + TX * u + NX * v, REST.C[1] + TZ * u + NZ * v];
const YAW = Math.atan2(-TZ, TX);                       // kit yaw: local +x along the freeway (u), local -z... see box()

export function planRestStop(places) {
  const g = places.ground, {u0, u1, v0, v1} = REST.lot, [cx, cz] = W((u0 + u1) / 2, (v0 + v1 + 24) / 2);
  g.addPad({cx, cz, fx: TX, fz: TZ, hl: (u1 - u0) / 2 + 6, hw: (v1 + 24 - v0) / 2 + 4, y: REST.y, margin: 25});
  RESERVED.push({x: cx, z: cz, r: 150});
  places.pois.push({name: 'Pacific Rest Area', kind: 'fuel', x: cx, z: cz});
  places.extras.push((kit, pl) => buildRestStop(kit, pl));
}

function board(scene, w, h, u, y, v, faceYaw, draw, glow = .6) {
  const cv = document.createElement('canvas'); cv.width = Math.round(256 * w / h); cv.height = 256;
  draw(cv.getContext('2d'), cv.width, cv.height);
  const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
  const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshStandardMaterial({map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: glow, roughness: .6}));
  const [x, z] = W(u, v); m.position.set(x, y, z); m.rotation.y = faceYaw; scene.add(m);
}

function buildRestStop(kit, places) {
  const y = REST.y, {u0, u1, v0, v1} = REST.lot, scene = places.scene;
  // Kit helpers in the rest stop's frame: a box with its sides along u and v.
  const box = (mat, u, yy, v, su, sy, sv, color, solid = false, dyaw = 0) => { const [x, z] = W(u, v); kit.box(mat, x, yy, z, su, sy, sv, YAW + dyaw, color, solid); };
  const cyl = (mat, u, y0, v, r, h, color, solid = false) => { const [x, z] = W(u, v); kit.cyl(mat, x, y0, z, r, h, color, 10, solid); };
  const pool = (u, v, r, I = .3) => { const [x, z] = W(u, v); kit.add('wash', washDisc(r, I, new T.Color('#fff1dc')), x, y + .12, z, 0, '#fff', {keep: true}); };
  const faceSouth = Math.atan2(-NX, -NZ), faceWest = Math.atan2(-TX, -TZ);   // plane normals toward the freeway / toward the west
  const ASPH = '#3d3d3f', LINE = '#f2f2ee', KERB = '#b9b3a7';
  /* ---- the car park */
  box('flood', (u0 + u1) / 2, y + .055, (v0 + v1) / 2, u1 - u0, .06, v1 - v0, ASPH);
  const aisle = 84;
  for (let u = u0 + 6; u < u1 - 6; u += 9) box('flood', u, y + .075, aisle, 4.5, .02, .15, LINE);               // aisle centre dashes
  for (let u = -122; u <= 12; u += 2.8) { box('flood', u, y + .075, 76.5, .12, .02, 5.5, LINE); box('flood', u, y + .075, 91.5, .12, .02, 5.5, LINE); }
  for (let u = -120.6; u <= 12; u += 2.8) { box('stone', u, y + .13, 73.2, 1.6, .12, .2, KERB); box('stone', u, y + .13, 94.8, 1.6, .12, .2, KERB); }
  // Truck bays: long stalls at the back, west end.
  for (let u = -134; u <= -40; u += 5.2) box('flood', u, y + .075, 108, .15, .02, 22, '#f2c21a');
  board(scene, 3.2, 1, -90, y + 2.4, 97.6, faceSouth, (c, Wd, H) => { c.fillStyle = '#1d4d8f'; c.fillRect(0, 0, Wd, H); c.fillStyle = '#fff'; c.font = `800 ${H * .5}px Outfit, Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('TRUCKS · RV', Wd / 2, H * .52); });
  box('metal', -90, y + 1.2, 97.6, .1, 2.4, .1, '#6d7177');
  // Kerbed islands with palms between the rows, light poles along them.
  for (const v of [70.5, 97.5]) box('stone', (u0 + u1) / 2 - 20, y + .12, v, u1 - u0 - 60, .22, 1.4, KERB);
  for (let u = u0 + 14; u < u1 - 8; u += 34) for (const v of [70.5, 97.5]) {
    cyl('metal', u, y, v, .13, 9, '#8c9096', true);
    box('metal', u, y + 9, v, 1.6, .2, .6, '#3b3e42'); box('glow', u, y + 8.88, v, 1.4, .04, .4, '#fff4dc');
    pool(u, v + (v < 80 ? 6 : -6), 16, .3);
  }
  /* ---- gas station: canopy over four islands, an EV charger, the store */
  const gu0 = 30, gu1 = 92, gv0 = 98, gv1 = 118;
  box('flood', (gu0 + gu1) / 2, y + .062, (gv0 + gv1) / 2, gu1 - gu0 + 10, .06, gv1 - gv0 + 6, '#4a4a4c');
  for (const su of [-1, 1]) for (const sv of [-1, 1]) cyl('metal', (gu0 + gu1) / 2 + su * 24, y, (gv0 + gv1) / 2 + sv * 7, .3, 5.6, '#e8e6e0', true);
  box('paint', (gu0 + gu1) / 2, y + 5.9, (gv0 + gv1) / 2, gu1 - gu0, .7, gv1 - gv0, '#f2f2ee');
  box('paint', (gu0 + gu1) / 2, y + 6.1, gv0 - .02, gu1 - gu0, .5, .1, '#c8141c');                              // fascia stripe
  box('glow', (gu0 + gu1) / 2, y + 5.52, (gv0 + gv1) / 2, gu1 - gu0 - 4, .04, gv1 - gv0 - 4, '#fff7e6');
  pool((gu0 + gu1) / 2 - 15, (gv0 + gv1) / 2, 18, .55); pool((gu0 + gu1) / 2 + 15, (gv0 + gv1) / 2, 18, .55);
  for (let k = 0; k < 4; k++) {
    const u = gu0 + 9 + k * 15, v = (gv0 + gv1) / 2;
    box('stone', u, y + .12, v, 1.4, .24, 7, '#cfccc4', true);
    for (const dv of [-1.8, 1.8]) { box('paint', u, y + .95, v + dv, .6, 1.5, .5, k === 3 ? '#1f8f5a' : '#e9e6de'); box('glow', u + .31, y + 1.25, v + dv, .02, .3, .32, k === 3 ? '#2bff8a' : '#9fd6ff'); box('glow', u - .31, y + 1.25, v + dv, .02, .3, .32, k === 3 ? '#2bff8a' : '#9fd6ff'); }
  }
  // The store: glass front toward the pumps, a lit sign, a dark roof edge.
  box('paint', 102, y + 2.4, 108, 16, 4.8, 18, '#e3dfd6', true);
  box('glass', 93.9, y + 1.8, 108, .1, 3, 15, '#9cc6dc'); box('glow', 94.05, y + 1.7, 108, .04, 2.6, 14, '#ffe9c4');
  box('paint', 102, y + 5, 108, 17, .4, 19, '#2b2d31');
  board(scene, 12, 1.3, 93.75, y + 4.2, 108, faceWest, (c, Wd, H) => { c.fillStyle = '#c8141c'; c.fillRect(0, 0, Wd, H); c.fillStyle = '#fff'; c.font = `800 ${H * .55}px Outfit, Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('PACIFIC MART · 24 HR', Wd / 2, H * .52); }, .8);
  /* ---- visitor building: restrooms, maps, vending, under a deep roof */
  box('paint', -6, y + 2, 112, 30, 4, 12, '#d9cfbd', true);
  box('paint', -6, y + 4.3, 110.5, 34, .4, 17, '#6b4f3a');
  for (const u of [-20, -12, -4, 4]) box('glass', u, y + 1.6, 105.94, 3.2, 2.6, .08, '#a7c8d8');
  for (const u of [-22, -6, 10]) cyl('wood', u, y, 103, .18, 4.1, '#7a5a40', true);
  board(scene, 10, 1.1, -6, y + 3.4, 105.9, faceSouth, (c, Wd, H) => { c.fillStyle = '#26402f'; c.fillRect(0, 0, Wd, H); c.fillStyle = '#f2ecd8'; c.font = `700 ${H * .5}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('PACIFIC REST AREA', Wd / 2, H * .45); c.font = `600 ${H * .22}px Outfit, Arial`; c.fillText('RESTROOMS · MAPS · VENDING · PETS', Wd / 2, H * .82); }, .5);
  pool(-6, 100, 12, .45);
  /* ---- picnic lawn behind, with shade trees */
  box('grass', -40, y + .05, 132, 180, .05, 18, '#5f7d45');
  for (let k = 0; k < 8; k++) {
    const u = -120 + k * 22, v = 131;
    box('wood', u, y + .75, v, 2, .06, .8, '#8a6242', true); for (const dv of [-.68, .68]) box('wood', u, y + .45, v + dv, 2, .05, .28, '#7d5839');
    if (k % 2 === 0) { const [x, z] = W(u + 9, v + 3); kit.cyl('wood', x, y, z, .2, 4.2, '#5b4632', 7, true, .14); kit.add('paint', new T.IcosahedronGeometry(2.6, 1), x, y + 5.2, z, 0, '#4d6b38', {scale: new T.Vector3(1.2, .85, 1.2)}); }
  }
  /* ---- the pylon on the freeway side: name, fuel prices, lit */
  { const u = 112, v = 50; cyl('metal', u, y, v, .45, 16, '#2b2d31', true);
    board(scene, 6, 6, u, y + 14, v + .02, faceSouth, (c, Wd, H) => {
      c.fillStyle = '#0f1a2c'; c.fillRect(0, 0, Wd, H); c.fillStyle = '#c8141c'; c.fillRect(0, 0, Wd, H * .3);
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `800 ${H * .13}px Outfit, Arial`; c.fillText('REST AREA', Wd / 2, H * .15);
      c.font = `700 ${H * .085}px Outfit, Arial`; const rows = [['REGULAR', '4.89'], ['PREMIUM', '5.39'], ['DIESEL', '5.19'], ['EV ⚡', '0.42']];
      rows.forEach(([k, p], i) => { c.textAlign = 'left'; c.fillStyle = '#cfe0ff'; c.fillText(k, Wd * .08, H * (.4 + i * .15)); c.textAlign = 'right'; c.fillStyle = '#ffd23a'; c.fillText(p, Wd * .92, H * (.4 + i * .15)); });
    }, .9);
    board(scene, 6, 6, u, y + 14, v - .02, faceSouth + Math.PI, (c, Wd, H) => { c.fillStyle = '#c8141c'; c.fillRect(0, 0, Wd, H); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `800 ${H * .16}px Outfit, Arial`; c.fillText('GAS · FOOD', Wd / 2, H * .4); c.fillText('REST AREA', Wd / 2, H * .62); }, .9); }
  // Exit signs on the freeway shoulder, before the ramp.
  for (const u of [420, 220]) { cyl('metal', u, y, 26, .12, 3.4, '#6d7177');
    board(scene, 4.6, 2.2, u, y + 4.3, 26, Math.atan2(TX, TZ), (c, Wd, H) => { c.fillStyle = '#1d6b3a'; c.fillRect(0, 0, Wd, H); c.strokeStyle = '#fff'; c.lineWidth = 8; c.strokeRect(10, 10, Wd - 20, H - 20); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `800 ${H * .26}px Outfit, Arial`; c.fillText('REST AREA', Wd / 2, H * .36); c.font = `600 ${H * .18}px Outfit, Arial`; c.fillText(u > 300 ? '1/4 MILE · GAS · FOOD' : 'NEXT RIGHT →', Wd / 2, H * .7); }, .6); }
}
