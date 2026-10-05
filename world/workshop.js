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
import {PRESETS} from './carParts.js';

const W = {x: -3880, z: -654, yaw: .08, w: 32, d: 22, h: 7.6};
export const WORKSHOP = {name: 'DWN Works', ...W, y: 0, bay: null, meet: null};
// The forecourt's stalls (local x across, z toward the street): three either side of the drive-in lane.
const STALLS = {x: [-13.8, -10.2, -6.6, 6.6, 10.2, 13.8], z0: 12.4, z1: 18.4, zc: 15.2};
const STALL_LINES = [-15.6, -12, -8.4, -4.8, 4.8, 8.4, 12, 15.6];
const LIFT = {x: -10.4, z: -3, h: 1.75}, SHOW = {x: 10.4, z: -4.2};

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
  // Forecourt: pale concrete from the glass out to the kerb, with painted stalls either side of the
  // drive-in lane (2026-10-04: they used to be painted inside the building, under its floor).
  box('line', 0, y - .04, (hd - .3 + 22) / 2, w + 6, .08, 22 - hd + .3, '#a9a69e');
  for (const x of STALL_LINES) { const [x0, z0] = at(x, STALLS.z0), [x1, z1] = at(x, STALLS.z1); kit.beam('line', x0, z0, x1, z1, y + .01, .02, .12, '#efece4'); }
  for (const s of [-1, 1]) { const [x0, z0] = at(s * 3.2, hd + .6), [x1, z1] = at(s * 3.2, hd + 9); kit.beam('line', x0, z0, x1, z1, y + .01, .02, .12, '#f2c21a'); }
  for (const x of STALLS.x) { const [sx, sz] = at(x, STALLS.zc + 1.95); kit.box('stone', sx, y + .07, sz, 1.7, .12, .2, yaw, '#cfccc4'); }      // wheel stops, under the front wheels
  // Floor inside: dark epoxy.
  box('gloss', 0, y - .02, 0, w - .6, .06, d - .6, FLOOR);
  for (const x of [-5.2, 5.2]) box('line', x, y + .04, 0, .12, .01, d - 1.2, '#f2c21a');                       // bay lines
  for (let z = -hd + 1.6; z < hd - .5; z += 1.5) box('line', 0, y + .04, z, 9.6, .005, .03, '#2b2e33');         // the middle bay's tile joints
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
  // (2026-10-04) with a car up on it: carriages and arms at the top of their travel, pads under the sills.
  for (const s of [-1, 1]) {
    box('paint', LIFT.x + s * 1.9, y, LIFT.z, .35, 4.2, .35, '#f2c21a', true);
    box('metal', LIFT.x + s * 1.66, y + LIFT.h - .55, LIFT.z, .22, .6, .4, '#3a3d42');
    for (const dz of [-.8, .8]) { const [ax, az] = at(LIFT.x + s * 1.66, LIFT.z), [bx, bz] = at(LIFT.x + s * .9, LIFT.z + dz); kit.beam('metal', ax, az, bx, bz, y + LIFT.h - .08, .1, .14, '#555a61'); box('paint', LIFT.x + s * .9, y + LIFT.h - .05, LIFT.z + dz, .22, .07, .22, '#151617'); }
  }
  box('paint', LIFT.x, y + 4.1, LIFT.z, 4.2, .25, .3, '#f2c21a');
  box('paint', LIFT.x + 1.9, y + 1.1, LIFT.z + .3, .2, .3, .14, '#1a1b1e'); box('glow', LIFT.x + 1.9, y + 1.18, LIFT.z + .38, .06, .06, .01, '#3cff8a');   // the control box
  // A tyre rack on the right wall, a wing on the back wall.
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) {
    const [tx, tz] = at(hw - 1, -6 + i * .75);
    kit.add('rubber' in pl.mats ? 'rubber' : 'paint', new T.CylinderGeometry(.34, .34, .26, 18).rotateZ(Math.PI / 2), tx, y + .5 + r * .8, tz, yaw + Math.PI / 2, '#151617');
  }
  for (const r of [0, 1, 2]) box('metal', hw - 1, y + .14 + r * .8, -4.1, .9, .05, 5, '#7b8088');
  box('gloss', 6, y + 4.3, -hd + .55, 4.2, .12, .55, '#111214');
  for (const s of [-1, 1]) box('gloss', 6 + s * 2.1, y + 3.9, -hd + .55, .04, .7, .6, '#111214');
  furnish(kit, pl, y, box, at);
  kit.indoor = 0;
  cards(kit, pl, y);
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

/* ---- (2026-10-04, Peter: "upgrade the DWN Works, furnish the interior, and add some prebuilt demos parked
 * outside") The left bay works on cars (a GT3 R up on the lift), the right bay sells them (a lounge, a
 * reception counter, a wall of wheels and the Absolut turning on a plinth), and six demo builds stand in
 * the stalls out front, each with its card. */
const BUILD = PRESETS[0].build;
const DEMOS = [
  {name: 'GT3 R', preset: 'gt3', at: 'lift'},
  {name: 'Absolut', preset: 'absolut', at: 'show'},
  {name: 'Drift Missile', preset: 'drift', stall: 0, spec: 'Overfenders · dish wheels · drift wing'},
  {name: '2,000 HP One-Eye', preset: 'oneeye', stall: 1, spec: 'Laser eye · attack wing · straight pipes'},
  {name: 'Track Day', stall: 2, spec: 'GT3 aero · forged bronze · #27', paint: '#f2c21a',
    build: {...BUILD, wing: 'gt3', front: 'gt3', kit: 'wide', exhaust: 'side', wheels: 'forged', rim: '#a7854b', caliper: '#1f47ff', stance: 'low', livery: 'stripes', stripe: '#0b0c0e', number: '27', hood: 'louvres', shell: 'race', cage: 'full'}},
  {name: 'Midnight Run', stall: 3, spec: 'Turbofans · ice lights · blue underglow', paint: '#1a2a6c',
    build: {...BUILD, wing: 'ducktail', front: 'lip', kit: 'fenders', exhaust: 'quad', lights: 'ice', wheels: 'turbofan', rim: '#e8e8e4', caliper: '#1f47ff', stance: 'slammed', glow: '#2a4bff', glowMode: 'breathe', roof: 'fin'}},
  {name: 'Rally Raid', stall: 4, spec: 'Light bar · hood scoop · gold dish', paint: '#e8e8e4',
    build: {...BUILD, wing: 'drift', front: 'lip', exhaust: 'center', lights: 'yellow', wheels: 'dish', rim: '#c9a24a', caliper: '#d3191c', livery: 'side', stripe: '#c8141c', number: '07', roof: 'lightbar', hood: 'scoop'}},
  {name: 'Rosso Longtail', stall: 5, spec: 'Longtail · widebody · black roof', paint: '#b3141a',
    build: {...BUILD, wing: 'longtail', kit: 'wide', exhaust: 'center', wheels: 'lux', rim: '#c9a24a', caliper: '#f2c21a', stance: 'low', livery: 'twotone', number: '99'}},
];

function furnish(kit, pl, y, box, at) {
  const {hd, hw} = {hd: W.d / 2, hw: W.w / 2};
  const cyl = (mat, lx, y0, lz, r, h, color, n = 16, solid = false) => { const [x, z] = at(lx, lz); kit.cyl(mat, x, y0, z, r, h, color, n, solid); };
  const geo = (mat, g, lx, yc, lz, color, turn = 0) => { const [x, z] = at(lx, lz); kit.add(mat, g, x, yc, z, W.yaw + turn, color); };
  const plane = (mat, w, h, lx, yc, lz, turn = 0) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), mat), [x, z] = at(lx, lz); m.position.set(x, yc, z); m.rotation.y = W.yaw + turn; pl.scene.add(m); return m; };
  /* the left bay: the workbench, an engine on its stand, the tool cart, drums, the compressor */
  box('wood', -15.1, y + .86, 3.5, .8, .07, 4.2, '#7a5a3a', true);
  box('metal', -15.1, y + .22, 3.5, .74, .04, 4.1, '#3a3d42');
  for (const dz of [-2, 2]) for (const dx of [-.33, .33]) box('metal', -15.1 + dx, y, 3.5 + dz, .06, .86, .06, '#2b2e33');
  box('paint', -15.56, y + 1.15, 3.5, .04, 1.5, 4, '#2f3238');
  for (let i = 0; i < 18; i++) box('metal', -15.52, y + 1.35 + Math.floor(i / 9) * .6, 1.8 + (i % 9) * .42, .03, .32, .05, ['#b3141a', '#9aa0a8', '#1f47ff'][i % 3]);
  box('metal', -14.86, y + .93, 2.1, .22, .16, .3, '#2b5bd6');                                     // the vice
  box('glow', -15.3, y + 2.75, 3.5, .1, .04, 3.6, '#f2f6ff');
  const E = {x: -7.3, z: 5.8};                                                                       // a V8 on its stand
  box('paint', E.x, y, E.z, 1.3, .06, .8, '#b3141a'); box('paint', E.x - .5, y, E.z, .09, .95, .09, '#b3141a');
  for (const dz of [-.36, .36]) for (const dx of [-.6, .6]) cyl('paint', E.x + dx, y, E.z + dz, .05, .07, '#151617', 8);
  box('metal', E.x + .1, y + .68, E.z, .72, .42, .5, '#8b9097');
  for (const s of [-1, 1]) { geo('metal', new T.BoxGeometry(.7, .24, .26), E.x + .1, y + 1.18, E.z + s * .24, '#7b8088', 0); geo('gloss', new T.BoxGeometry(.66, .08, .22), E.x + .1, y + 1.34, E.z + s * .3, '#b3141a'); }
  box('metal', E.x + .1, y + 1.1, E.z, .52, .2, .2, '#3b3f45');
  geo('metal', new T.CylinderGeometry(.13, .13, .05, 20).rotateZ(Math.PI / 2), E.x + .5, y + .82, E.z, '#c4c8cd');
  box('gloss', -7.6, y + .1, -.9, .9, .85, .5, '#b3141a', true); box('metal', -7.6, y + .95, -.9, .92, .03, .52, '#c8ccd2');   // the tool cart
  for (let i = 0; i < 4; i++) box('metal', -7.6, y + .28 + i * .17, -.64, .8, .012, .01, '#d8dbe0');
  for (const [dx, dz] of [[-.38, -.2], [.38, -.2], [-.38, .2], [.38, .2]]) cyl('paint', -7.6 + dx, y, -.9 + dz, .05, .1, '#151617', 8);
  ['#1f47ff', '#1c1d20', '#b3141a'].forEach((c, i) => { cyl('paint', -14.95 + (i % 2) * .64, y, 9.2 - Math.floor(i / 2) * .64, .29, .88, c, 18, true); cyl('metal', -14.95 + (i % 2) * .64, y + .88, 9.2 - Math.floor(i / 2) * .64, .29, .02, '#8b9097', 18); });
  box('paint', -14.95, y, -7, .75, .85, 1.4, '#d3191c', true); box('metal', -14.95, y + .85, -7.3, .45, .3, .5, '#2b2e33'); cyl('metal', -14.95, y + .85, -6.6, .1, .2, '#c8ccd2', 10);
  cyl('gloss', -4.6, y + .3, 10.25, .09, .55, '#d3191c', 12); box('metal', -4.6, y + .82, 10.25, .1, .08, .1, '#1c1d20');   // extinguisher
  /* the right bay: the plinth, the lounge, reception, the wheel wall, the parts shelf */
  cyl('metal', SHOW.x, y, SHOW.z, 2.7, .12, '#2b2e33', 56); cyl('glow', SHOW.x, y + .01, SHOW.z, 2.74, .03, '#2f6bff', 56); cyl('gloss', SHOW.x, y + .12, SHOW.z, 2.62, .03, '#0b0c0e', 56);
  for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) { cyl('glow', SHOW.x + dx, y + W.h - .36, SHOW.z + dz, .14, .03, '#fff1dc', 14); }
  box('fabric', 10.4, y + .03, 2.7, 4.4, .01, 3.1, '#34363c');                                             // the rug
  box('fabric', 10.4, y, 3.9, 2.9, .42, .95, '#1d1e22', true); box('fabric', 10.4, y + .42, 4.27, 2.9, .5, .22, '#1d1e22');
  for (const s of [-1, 1]) { box('fabric', 10.4 + s * 1.36, y + .42, 3.9, .18, .2, .95, '#1d1e22'); box('fabric', 10.4 + s * .68, y + .42, 3.8, 1.3, .1, .7, '#2a2b30'); }
  box('metal', 10.4, y, 2.2, 1.2, .36, .05, '#1b1c1e'); box('gloss', 10.4, y + .36, 2.2, 1.4, .05, .72, '#0d0e10');
  geo('gloss', new T.BoxGeometry(.35, .04, .25), 10.1, y + .43, 2.2, '#b3141a', .3);                           // a book on the table
  cyl('metal', 12.6, y, 4.3, .02, 1.65, '#1b1c1e', 8); cyl('glow', 12.6, y + 1.6, 4.3, .2, .12, '#ffe2b0', 16);
  box('gloss', 8.6, y, 7.7, 3.4, 1.02, .72, '#0f1012', true); box('wood', 8.6, y + 1.02, 7.7, 3.5, .05, .84, '#6a4a32');
  box('glow', 8.6, y + .08, 8.07, 3.3, .04, .01, '#2f6bff');
  box('gloss', 8.0, y + 1.07, 7.55, .52, .34, .03, '#101114'); box('glow', 8.0, y + 1.1, 7.565, .46, .28, .005, '#7fa6ff');
  plane(neonSign('DWN', 'WORKS'), 1.2, .55, 8.6, y + .58, 8.08);
  for (let i = 0; i < 8; i++) {                                                                                // the wheel wall
    const z = .9 + (i % 4) * 2.1, yc = y + 1.5 + Math.floor(i / 4) * 1.35, rim = ['#0b0c0e', '#c9a24a', '#c4c8cd', '#a7854b', '#3b3f45', '#e8e8e4', '#b3141a', '#1c1d20'][i];
    geo('paint', new T.TorusGeometry(.3, .09, 10, 28).rotateY(Math.PI / 2), 15.5, yc, z, '#151617');
    geo('metal', new T.CylinderGeometry(.26, .26, .05, 24).rotateZ(Math.PI / 2), 15.52, yc, z, rim);
    for (let k = 0; k < 5; k++) geo('metal', new T.BoxGeometry(.03, .05, .46).rotateX(k * Math.PI / 5), 15.47, yc, z, rim);
  }
  for (const x of [9, 11.6, 14.2]) box('metal', x, y, -10.3, .06, 2.6, .5, '#2b2e33');                       // the parts shelf
  for (const h of [.45, 1.25, 2.05]) box('metal', 11.6, y + h, -10.3, 5.3, .04, .52, '#3a3d42');
  for (let i = 0; i < 9; i++) { const x = 9.4 + (i % 3) * 1.6, h = [.49, 1.29, 2.09][Math.floor(i / 3)]; if (i % 2) geo('metal', new T.CylinderGeometry(.06, .06, .5, 14).rotateZ(Math.PI / 2), x, y + h + .07, -10.3, '#c4c8cd'); else box('paint', x, y + h, -10.3, .7, .38, .4, ['#1f47ff', '#151617', '#b3141a'][i % 3]); }
  /* the walls: a lit sign over the middle bay, posters, the ceiling's pendants */
  plane(neonSign('DWN WORKS', 'EST. 2026 · SUNSET BOULEVARD · LOS SANTERRA'), 7.2, .9, 0, y + 5.4, -hd + .47);
  plane(poster('GT3 R', 'BUILT HERE · 2026', '#c8141c'), 1.5, 2.1, -15.56, y + 3.6, -3.5, Math.PI / 2);
  plane(poster('2,000 HP', 'ONE-EYE · DWN WORKS', '#ff6a1a'), 1.5, 2.1, -15.56, y + 3.6, -6, Math.PI / 2);
  plane(poster('ABSOLUT', 'LOW DRAG · 400 KM/H', '#1f47ff'), 1.5, 2.1, 15.56, y + 3.6, -7.5, -Math.PI / 2);
  for (const x of [-10.4, 10.4]) for (const z of [-6, 1, 7]) { cyl('metal', x, y + W.h - 1.2, z, .015, .9, '#1b1c1e', 6); cyl('metal', x, y + W.h - 1.45, z, .32, .25, '#1d1e22', 18); cyl('glow', x, y + W.h - 1.46, z, .28, .02, '#fff1dc', 18); }
}
/** A poster: a big title in a colour, a strapline, on black. */
function poster(title, sub, color) {
  const c = document.createElement('canvas'); c.width = 360; c.height = 504; const x = c.getContext('2d');
  x.fillStyle = '#0b0c0e'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = color; x.fillRect(0, 0, c.width, 18); x.fillRect(0, c.height - 120, c.width, 6);
  for (let i = 0; i < 9; i++) { x.globalAlpha = .08 + i * .02; x.fillRect(-60 + i * 50, 120, 22, 280); } x.globalAlpha = 1;
  x.textAlign = 'center'; x.fillStyle = '#f2f2ee'; x.font = '800 64px Outfit, Arial, sans-serif'; x.fillText(title, c.width / 2, c.height - 160);
  x.fillStyle = color; x.font = '600 22px Outfit, Arial, sans-serif'; x.fillText(sub, c.width / 2, c.height - 70);
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
  return new T.MeshStandardMaterial({map: tex, roughness: .5});
}
/** A demo's card on its post: the build's name and what it has. */
function card(name, spec) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192; const x = c.getContext('2d');
  x.fillStyle = '#0d0e10'; x.fillRect(0, 0, 512, 192); x.fillStyle = '#2f6bff'; x.fillRect(0, 0, 8, 192);
  x.fillStyle = '#7f9cff'; x.font = '600 22px Outfit, Arial, sans-serif'; x.fillText('DWN WORKS · DEMO BUILD', 30, 44);
  x.fillStyle = '#f2f2ee'; x.font = '800 52px Outfit, Arial, sans-serif'; x.fillText(name, 30, 110);
  x.fillStyle = '#9aa3b2'; x.font = '500 22px Outfit, Arial, sans-serif'; x.fillText(spec, 30, 156);
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
  return new T.MeshBasicMaterial({map: tex, toneMapped: false});
}
function cards(kit, pl, y) {
  for (const q of DEMOS) {
    if (q.stall === undefined) continue;
    const lx = STALLS.x[q.stall], [px, pz] = L(lx + .9, STALLS.z1 + .45);
    kit.box('metal', px, y + .45, pz, .06, .9, .06, W.yaw, '#2b2e33');
    const m = new T.Mesh(new T.PlaneGeometry(.95, .36), card(q.name, q.spec)); m.position.set(px + Math.sin(W.yaw) * .04, y + .95, pz + Math.cos(W.yaw) * .04); m.rotation.y = W.yaw; pl.scene.add(m);
    kit.box('paint', px, y + .95, pz, 1, .4, .05, W.yaw, '#0d0e10');
  }
}

/** The demo cars: real cars (the Aurora with each build), made when you come near, one a frame. */
export class WorksDemos {
  /** io: {makeCar({paint, ambient, build}) -> vehicle, scene, physics} */
  constructor(io) { this.io = io; this.cars = []; this.queue = null; }
  update(dt, cam) {
    const d = Math.hypot(cam.x - W.x, cam.z - W.z);
    if (!this.queue && d < 420) this.queue = DEMOS.map((q, i) => i);
    if (this.queue?.length) this.spawn(this.queue.shift());
    for (const c of this.cars) { c.v.object.visible = d < 480; if (c.turn && d < 150) { c.yaw += dt * .18; c.v.object.rotation.y = c.yaw; } }
  }
  spawn(i) {
    const q = DEMOS[i], pre = q.preset ? PRESETS.find(p => p.id === q.preset) : null;
    const v = this.io.makeCar({paint: q.paint || pre?.paint || null, ambient: null, build: q.build || pre?.build});
    // The car's origin is where its tyres touch: on the lift that is just under the pads.
    const spot = q.at === 'lift' ? {x: LIFT.x, z: LIFT.z, y: LIFT.h - .1, yaw: W.yaw + Math.PI} : q.at === 'show' ? {x: SHOW.x, z: SHOW.z, y: .155, yaw: W.yaw + .7} : {x: STALLS.x[q.stall], z: STALLS.zc, y: .01, yaw: W.yaw};
    const [x, z] = L(spot.x, spot.z), yy = WORKSHOP.y + spot.y;
    v.object.position.set(x, yy, z); v.object.rotation.y = spot.yaw;
    v.wheels.forEach(w => { w.pivot.position.y = w.y - (q.at === 'lift' ? .07 : 0); });      // on the lift the wheels hang
    this.io.scene.add(v.object);
    const turn = q.at === 'show';
    this.io.physics?.setBoxes('worksDemo' + i, [{x, y: yy + .62, z, hx: turn ? 2.3 : 1.05, hy: .62, hz: 2.3, yaw: spot.yaw, tag: 'metal'}]);
    this.cars.push({v, yaw: spot.yaw, turn});
  }
}
