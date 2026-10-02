/* DWN WORKS (2026-10-01): the physical workshop on Sunset Boulevard, a few
 * hundred metres from the Strip. Drive into the open middle bay, stop on the
 * glowing ring and press E: the workshop opens (world.js) and the car is
 * dressed with the parts in carParts.js.
 *
 * A three-bay garage with a dark glass front, the middle roll-up door open,
 * a lit interior (strip lights, tool walls, a two-post lift, a tyre rack, a
 * wing on the wall), a neon sign on the fascia, and a forecourt with painted
 * stalls along the street — the obvious place for a lobby's car meet.
 *
 * planWorkshop() runs with the other set pieces (before the city is planned):
 * it levels the pad and reserves the land so no lot or tree lands on it.
 */
import * as T from 'three';
import {RESERVED} from './places.js';

const W = {x: -3880, z: -654, yaw: .08, w: 32, d: 22, h: 7.6};
export const WORKSHOP = {name: 'DWN Works', ...W, y: 0, bay: null, meet: null};

/** Local (x across the front, z toward the street) to world. */
const L = (lx, lz) => [W.x + lx * Math.cos(W.yaw) + lz * Math.sin(W.yaw), W.z - lx * Math.sin(W.yaw) + lz * Math.cos(W.yaw)];

export function planWorkshop(places) {
  const g = places.ground;
  const y = g.height(W.x, W.z) + .05;
  WORKSHOP.y = y;
  const [bx, bz] = L(0, -2.5); WORKSHOP.bay = {x: bx, z: bz, r: 3.6};
  const [mx, mz] = L(0, 16); WORKSHOP.meet = {x: mx, z: mz, heading: W.yaw + Math.PI};
  // Building plus forecourt, out to the kerb.
  const [cx, cz] = L(0, 4);
  g.addPad({cx, cz, fx: Math.sin(W.yaw), fz: Math.cos(W.yaw), hl: 20, hw: 22, y, margin: 14});
  RESERVED.push({x: cx, z: cz, r: 30});
  places.pois.push({name: 'DWN Works', kind: 'workshop', x: mx, z: mz});
  places.extras.push((kit, pl) => buildWorkshop(kit, pl, y));
}

function buildWorkshop(kit, pl, y) {
  const {w, d, h, yaw} = W, hw = w / 2, hd = d / 2;
  const at = (lx, lz) => L(lx, lz);
  const box = (mat, lx, y0, lz, sx, sy, sz, color, solid = false) => { const [x, z] = at(lx, lz); kit.box(mat, x, y0 + sy / 2, z, sx, sy, sz, yaw, color, solid); };
  const CHAR = '#25282d', TRIM = '#3a3e45', FLOOR = '#33363c';
  // Forecourt: pale concrete with painted stalls for a meet, and a lip to the street.
  box('line', 0, y - .04, 11, w + 6, .08, 22, '#a9a69e');
  for (let i = -3; i <= 3; i++) {
    const [x0, z0] = at(i * 3.6 - 1.8, 3.5), [x1, z1] = at(i * 3.6 - 1.8, 9.5);
    if (Math.abs(i) > 0) kit.beam('line', x0, z0, x1, z1, y + .01, .02, .12, '#efece4');
  }
  for (const s of [-1, 1]) { const [x0, z0] = at(s * 12, 13), [x1, z1] = at(s * 12, 20.5); kit.beam('line', x0, z0, x1, z1, y + .01, .02, .12, '#f2c21a'); }
  // Floor inside: dark epoxy.
  box('gloss', 0, y - .02, 0, w - .6, .06, d - .6, FLOOR);
  // Walls: back and sides solid, charcoal render with a trim band.
  box('stucco', 0, y, -hd + .2, w, h, .4, CHAR, true);
  for (const s of [-1, 1]) box('stucco', s * (hw - .2), y, 0, .4, h, d, CHAR, true);
  box('paint', 0, y + h - .02, 0, w + .4, .5, d + .4, TRIM);                                   // roof slab
  box('paint', 0, y + h + .2, hd + .05, w + .4, 1.5, .3, '#15171a');                            // fascia
  // Front: four pillars, three bays. Left and right bays glazed with roll-up
  // doors down; the middle one open.
  const bays = [-10.4, 0, 10.4], bw = 9.6;
  for (const px of [-hw + .5, -5.2, 5.2, hw - .5]) box('paint', px, y, hd - .2, 1, h, .5, TRIM, true);
  for (const bx of bays) {
    box('paint', bx, y + 5.2, hd - .15, bw, h - 5.2, .4, CHAR);                                 // header over the door
    if (bx === 0) { box('metal', bx, y + 4.6, hd - .6, bw - .4, .6, .8, '#8b9097'); continue; }  // the open door, rolled up
    box('glass', bx, y, hd - .25, bw - .2, 5.2, .06, '#7fa6c4');
    for (let k = 1; k < 4; k++) box('metal', bx - bw / 2 + k * bw / 4, y, hd - .2, .08, 5.2, .1, '#2b2e33');
    for (let k = 0; k < 9; k++) box('metal', bx, y + .3 + k * .58, hd - .32, bw - .3, .04, .03, '#5a5f66');
    const [cx, cz] = at(bx, hd - .5); kit.colliders.push({x: cx, y: y + 2.6, z: cz, hx: (bw - .2) / 2, hy: 2.6, hz: .3, yaw});
  }
  // Inside: lit.
  kit.indoor = 1;
  for (let i = -3; i <= 3; i++) box('glow', i * 4.2, y + h - .45, -1, .25, .06, d - 5, '#f2f6ff');            // strip lights
  box('room', 0, y + h - .3, 0, w - .8, .05, d - .8, '#d8dbe0');                                // ceiling
  box('room', 0, y + .5, -hd + .45, w - 1, h - 1, .05, '#3a3d43');                              // back wall skin
  // The bay ring (where the car stops) and a painted box round it.
  for (let a = 0; a < 24; a++) {
    const t0 = a / 24 * Math.PI * 2, t1 = (a + .8) / 24 * Math.PI * 2, r = 3.4;
    const [x0, z0] = at(Math.cos(t0) * r, -2.5 + Math.sin(t0) * r * 1.25), [x1, z1] = at(Math.cos(t1) * r, -2.5 + Math.sin(t1) * r * 1.25);
    kit.beam('glow', x0, z0, x1, z1, y + .02, .02, .14, '#2f6bff');
  }
  // Tool walls: red chests along the back, a pegboard above.
  for (let i = 0; i < 6; i++) { box('gloss', -13 + i * 2.1, y, -hd + 1, 1.9, 1.05, .7, '#b3141a'); box('metal', -13 + i * 2.1, y + 1.05, -hd + 1, 1.92, .04, .72, '#c8ccd2'); }
  box('paint', -8, y + 1.8, -hd + .5, 12, 2.2, .06, '#2f3238');
  for (let i = 0; i < 26; i++) box('metal', -13.5 + (i % 13) * .9, y + 2.2 + Math.floor(i / 13) * .9, -hd + .56, .08, .5, .04, '#9aa0a8');
  // A two-post lift in the left bay, arms out.
  for (const s of [-1, 1]) { box('paint', -10.4 + s * 1.9, y, -3, .35, 4.2, .35, '#f2c21a', true); box('metal', -10.4 + s * 1.3, y + .55, -3, 1.1, .1, .16, '#555a61'); }
  box('paint', -10.4, y + 4.1, -3, 4.2, .25, .3, '#f2c21a');
  // A tyre rack on the right wall, a wing on the back wall.
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) {
    const [tx, tz] = at(hw - 1, -6 + i * .75);
    kit.add('rubber' in pl.mats ? 'rubber' : 'paint', new T.CylinderGeometry(.34, .34, .26, 18).rotateZ(Math.PI / 2), tx, y + .5 + r * .8, tz, yaw + Math.PI / 2, '#151617');
  }
  for (const r of [0, 1, 2]) box('metal', hw - 1, y + .14 + r * .8, -4.1, .9, .05, 5, '#7b8088');
  box('gloss', 6, y + 4.3, -hd + .55, 4.2, .12, .55, '#111214');
  for (const s of [-1, 1]) box('gloss', 6 + s * 2.1, y + 3.9, -hd + .55, .04, .7, .6, '#111214');
  kit.indoor = 0;
  // Signage, drawn on a canvas: DWN WORKS in neon on the fascia, and a pylon by the street.
  const sign = neonSign('DWN WORKS', 'PERFORMANCE · AERO · CUSTOM');
  const [sx, sz] = at(0, hd + .23);
  const plane = new T.Mesh(new T.PlaneGeometry(10.4, 1.3), sign); plane.position.set(sx, y + h + .3, sz); plane.rotation.y = yaw; pl.scene.add(plane);
  const [px, pz] = at(-hw - 2, 19);
  kit.box('paint', px, y + 3, pz, .5, 6, .5, 0, '#1a1c20', true);
  const pylon = new T.Mesh(new T.PlaneGeometry(4.2, 1.6), neonSign('DWN WORKS', 'WORKSHOP · OPEN LATE', 'square'));
  pylon.position.set(px, y + 6.4, pz); pylon.rotation.y = yaw; pl.scene.add(pylon);
  const back = pylon.clone(); back.rotation.y = yaw + Math.PI; back.position.set(px - Math.sin(yaw) * .02, y + 6.4, pz - Math.cos(yaw) * .02); pl.scene.add(back);
  kit.box('paint', px, y + 6.4, pz - Math.cos(yaw) * .01, 4.3, 1.7, .04, yaw, '#0d0e10');
  // Work lights over the bay: real lights, so the car looks good inside.
  for (const lz of [-6, 1]) { const [lx, lzw] = at(0, lz); const Lt = new T.PointLight('#f4f6ff', 0, 16, 1.6); Lt.position.set(lx, y + h - 1, lzw); pl.scene.add(Lt); (WORKSHOP.lights ||= []).push(Lt); }
}

/** A neon sign texture: a lit title and a strapline on black. */
function neonSign(title, sub, shape = 'wide') {
  const c = document.createElement('canvas'); c.width = shape === 'wide' ? 1024 : 512; c.height = shape === 'wide' ? 128 : 196;
  const x = c.getContext('2d');
  x.fillStyle = '#060708'; x.fillRect(0, 0, c.width, c.height);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const big = shape === 'wide' ? 74 : 78;
  x.font = `800 ${big}px Outfit, Arial, sans-serif`;
  x.shadowColor = '#2f6bff'; x.shadowBlur = 26; x.fillStyle = '#e8f0ff';
  const ty = shape === 'wide' ? 58 : 82;
  x.fillText(title.replace('DWN', 'DWN '), c.width / 2, ty);
  x.shadowBlur = 0; x.fillStyle = '#2f6bff';
  x.font = `600 ${shape === 'wide' ? 22 : 26}px Outfit, Arial, sans-serif`;
  x.fillText(sub, c.width / 2, shape === 'wide' ? 108 : 160);
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
  return new T.MeshBasicMaterial({map: tex, toneMapped: false});
}
