/* The player's cars (2026-09-28): four bodies, each with its own wheels and
 * cabin, all lit inside by an ambient light.
 *
 *   aurora    a carbon hypercar after Peter's "AURORA" board: fender humps over
 *             a low nose, an angular LED brow, a canopy with a roof scoop and a
 *             spine fin, louvred engine cover, a swan-neck wing, a mesh tail
 *             with a full-width light blade, blue calipers and pinstripes;
 *             inside, a carbon tub with a blue light line that sweeps from the
 *             dash into the doors.
 *   sovereign a long luxury saloon: a tall chrome grille, coach doors, a flat
 *             bonnet, cream quilted leather, walnut, and a starlight headliner.
 *   bambina   a small 1960s city car: round lamps, chrome bumpers, whitewalls,
 *             a painted dash, and a retrofit mood light under it.
 *   ranger    a square-shouldered SUV on big wheels: clad arches, roof rails,
 *             a tall cabin with a floating screen and a light bar on the dash.
 *
 * Model space: +z forward, +x left (the driver sits on the left), ground y = 0.
 * Each model: wheel layout (the physics uses it), a loft spec (carBody.js),
 * details moulded on the skin, the cabin (carInterior.js), signal lamps and
 * exhaust tips for world/carFx.js, and the driver's eye.
 */
import * as T from 'three';
import {loftBody, carMaterials, shutLines, gap, step, abs, tube} from './carBody.js';
import {buildWheels} from './carWheels.js';
import {Cabin, makeAmbient, rbox, prism, tubeAlong, place, steeringWheel, clusterScreen, starHeadliner, headlinerGeometry} from './carInterior.js';

const SIDES = [1, -1];
const wheelsAt = (xf, xr, zf, zr, r) => [
  {name: 'Wheel_FL', x: xf, y: r, z: zf, front: true}, {name: 'Wheel_FR', x: -xf, y: r, z: zf, front: true},
  {name: 'Wheel_RL', x: xr, y: r, z: zr, front: false}, {name: 'Wheel_RR', x: -xr, y: r, z: zr, front: false},
];

/* ======================================================================= AURORA */
function aurora(K, M, amb, coarse) {
  const {Z0, Z1, zf, zr, R, halfW, belt, deck, roof, patch, box, add, skinPoint, GZ0, GZ1} = K;
  // Shut lines: dihedral doors, the frunk lid between the fender humps.
  const doorF = GZ1 - .06, doorR = zr + .47;
  shutLines(M.paint, P => {
    const ax = abs(P.x), side = step(.6, ax).mul(step(P.y, belt(0) - .02)).mul(step(.3, P.y));
    return gap(P.z, doorF).add(gap(P.z, doorR)).mul(side)
      .add(gap(P.z, zf - .5).mul(step(ax, .56)).mul(step(deck(zf) - .08, P.y)))
      .add(gap(ax, .56).mul(step(zf - .5, P.z)).mul(step(P.z, Z1 - .2)).mul(step(deck(zf) - .08, P.y)));
  });
  for (const s of SIDES) {
    /* Headlamp: a deep smoked lens on the fender's nose; an LED brow along its
       outer edge that hooks round the front and a fang below it. */
    const hz0 = Z1 - .6, hz1 = Z1 - .05, span = hz1 - hz0, k = z => (z - hz0) / span;
    const tA = z => .45 + k(z) * .05, tB = z => .66 - k(z) * .03;
    add(patch(hz0, hz1, tA, tB, .002, s, 16, 7), M.satin);                                     // reflector bowl
    add(patch(hz0, hz1, tA, tB, .007, s, 16, 7), M.lamp);                                      // smoked lens
    add(patch(hz0 + .02, hz1, tA, z => tA(z) + .016, .01, s, 18, 1), M.head);                 // brow
    add(patch(hz1 - .045, hz1 - .015, tA, tB, .01, s, 2, 6), M.head);                           // front hook
    add(patch(hz0 + span * .25, hz0 + span * .6, z => tB(z) - .02, tB, .009, s, 6, 1), M.head);  // inner blade
    add(patch(Z1 - .3, Z1 - .02, z => .3 + (z - Z1 + .3) * .35, z => .315 + (z - Z1 + .3) * .35, .008, s, 8, 1), M.head);  // fang
    if (!coarse) for (const f of [.3, .48, .66]) {
      const z = hz0 + span * f, t = (tA(z) + tB(z)) / 2, p = skinPoint(z, t, s);
      add(place(new T.CylinderGeometry(.013, .013, .012, 16), p[0], p[1] + .002, p[2], 0, 0, s * .9), M.head);
    }
    // Fender-top louvres over the front wheels.
    if (!coarse) for (let i = 0; i < 5; i++) { const z = zf - .12 + i * .075; add(patch(z - .012, z + .012, .52, .62, .012, s, 1, 4), M.carbon); }
    add(patch(zf - .16, zf + .22, .515, .625, .003, s, 6, 4), M.honey);
    // Hood: two big extractor vents and nostrils near the nose; carbon centre panel.
    add(patch(zf - .28, zf + .32, .73, .84, .003, s, 10, 4), M.vent);
    add(patch(Z1 - .5, Z1 - .22, .76, .9, .003, s, 6, 3), M.honey);
    add(patch(zf - .5, Z1 - .12, .86, 1, .0025, s, 14, 3), M.carbon);
    // Side: carbon lower body, a blue pinstripe on it, a sill blade, the intake.
    const sz0 = zf - R - .06, sz1 = zr + R + .06;
    add(patch(sz1, sz0, 0, .19, .004, s, 22, 4), M.carbon);
    add(patch(sz1 + .04, sz0 - .02, .03, .036, .007, s, 22, 1), M.accent);
    add(place(new T.BoxGeometry(.06, .012, sz0 - sz1 - .1), s * (halfW(0) * .96 + .02), .2, (sz0 + sz1) / 2), M.carbon);
    const iz0 = zr + .42, iz1 = zr + 1.02;
    add(patch(iz0, iz1, z => .2 + (z - iz0) * .05, z => .6 - (iz1 - z) * .22, .003, s, 10, 6), M.honey);
    for (let i = 1; i <= 4; i++) { const z = iz0 + (iz1 - iz0) * i / 5; add(patch(z - .007, z + .007, .2, .58 - (iz1 - z) * .22, .025, s, 1, 6), M.carbon); }
    add(patch(iz0 - .02, iz1 + .02, .6, .62, .012, s, 10, 1), M.carbon);                          // intake lip
    // A gill of carbon fins on the rear fender, behind the wheel.
    for (let i = 0; i < 3; i++) { const z = zr - .5 - i * .07; add(patch(z - .006, z + .006, .3, .46 - i * .03, .016, s, 1, 5), M.carbon); }
    // Canards on the front corners.
    for (const [cz, cy, L] of [[Z1 - .3, .34, .22], [Z1 - .2, .25, .18]]) {
      const x = s * (halfW(cz) - .01);
      add(place(new T.BoxGeometry(.08, .006, L), x + s * .03, cy, cz, 0, s * .22, s * -.1), M.carbon);
    }
    // Mirror: a slim carbon stalk and a winged pod.
    const mz = GZ1 - .3, base = skinPoint(mz, .44, s), pod = [base[0] + s * .21, base[1] + .12, mz - .04];
    add(place(new T.BoxGeometry(.22, .018, .05), (base[0] + pod[0]) / 2, (base[1] + pod[1]) / 2 - .015, mz, 0, 0, s * .5), M.carbon);
    add(place(new T.SphereGeometry(.08, 20, 12).scale(1.35, .55, 1.3), ...pod), M.paint);
    add(place(new T.CircleGeometry(.07, 18).scale(1.3, .5, 1), pod[0], pod[1], pod[2] - .1, 0, Math.PI, 0), M.gloss);
    add(place(new T.BoxGeometry(.02, .006, .08), pod[0] + s * .05, pod[1] - .03, pod[2] + .02), M.accent);
  }
  /* Front fascia: a trapezoid mouth under a carbon beak, two angular side
     intakes with vertical blades under the lamps, all framed in gloss black. */
  const fz = Z1 + .002, poly = (pts, m, dz = .006) => add(place(prism(pts, dz, 'z'), 0, 0, fz + dz / 2), m);
  poly([[-.36, .2], [.36, .2], [.3, .36], [.06, .41], [-.06, .41], [-.3, .36]], M.gloss, .01);
  poly([[-.33, .215], [.33, .215], [.28, .345], [.05, .39], [-.05, .39], [-.28, .345]], M.honey, .016);
  add(place(prism([[-.08, .44], [.08, .44], [.05, .38], [0, .36], [-.05, .38]], .05, 'z'), 0, 0, fz - .01), M.carbon);    // beak
  for (const s of SIDES) {
    const xs = x => s * x;
    poly([[xs(.4), .19], [xs(.6), .2], [xs(.6), .3], [xs(.52), .4], [xs(.4), .33]].sort(() => 0), M.gloss, .01);
    poly([[xs(.415), .205], [xs(.585), .213], [xs(.585), .293], [xs(.515), .38], [xs(.415), .32]], M.honey, .016);
    for (let i = 0; i < 3; i++) add(place(new T.BoxGeometry(.007, .16, .05), s * (.45 + i * .045), .28, fz + .01), M.carbon);
  }
  const splitPlan = [], NS = 18;
  for (let i = 0; i <= NS; i++) { const u = i / NS * 2 - 1; splitPlan.push([u * 1.0, Z1 + .13 - Math.pow(Math.abs(u), 3) * .42]); }
  for (let i = NS; i >= 0; i--) { const u = i / NS * 2 - 1; splitPlan.push([u * .92, Z1 - .2 - Math.abs(u) * .15]); }
  add(place(prism(splitPlan, .022, 'y'), 0, .13, 0), M.carbon);
  if (!coarse) add(tube(splitPlan.slice(0, NS + 1).map(([x, z]) => [x, .142, z + .004]), .005, 5), M.accent);
  for (const x of [-.36, .36]) add(place(prism([[Z1 + .12, .14], [Z1 - .25, .14], [Z1 - .25, .19], [Z1 - .02, .19]], .01, 'x'), x, 0, 0), M.carbon);
  add(place(new T.CylinderGeometry(.028, .028, .006, 24), 0, .505, Z1 - .06, Math.PI / 2 - .6, 0, 0), M.chrome);        // badge
  /* Roof scoop and the spine fin that runs from it to the tail. */
  {
    const top = [], bot = [];
    for (let i = 0; i <= 12; i++) { const z = .16 - i / 12 * 1.0, h = Math.min(1, i / 2.2) * (.085 - i / 12 * .03); top.push([z, roof(z) + h]); bot.push([z, roof(z) - .004]); }
    add(prism([...top, ...bot.reverse()], .3, 'x', .01), M.carbon);
    add(place(new T.PlaneGeometry(.27, .05), 0, roof(.14) + .035, .15), M.black);
    const fin = [];
    const fz0 = -.84, fz1 = Z0 + .08;
    for (let i = 0; i <= 10; i++) { const z = fz0 + (fz1 - fz0) * i / 10; fin.push([z, Math.max(roof(Math.max(z, GZ0)), deck(z)) + .055 + (1 - i / 10) * .01]); }
    for (let i = 10; i >= 0; i--) { const z = fz0 + (fz1 - fz0) * i / 10; fin.push([z, Math.max(roof(Math.max(z, GZ0)), deck(z)) - .03]); }
    add(prism(fin, .012, 'x', .002), M.carbon);
  }
  // Louvres on the engine cover.
  for (const s of SIDES) {
    add(patch(Z0 + .55, GZ0 - .05, .78, .985, .002, s, 8, 4), M.honey);
    if (!coarse) for (let i = 0; i < 7; i++) { const z = GZ0 - .1 - i * .1; add(patch(z - .02, z + .02, .78, .98, .018, s, 1, 4), M.carbon); }
  }
  /* The wing: a main plane and a flap on swan-neck pylons, with endplates. */
  {
    const foil = (c, t) => { const up = [], lo = []; for (let i = 0; i <= 12; i++) { const x = i / 12, th = 5 * t * (.2969 * Math.sqrt(x) - .126 * x - .3516 * x * x + .2843 * x ** 3 - .1015 * x ** 4); up.push([-x * c, th * c + .06 * c * Math.sin(Math.PI * x)]); lo.push([-x * c, -th * c + .06 * c * Math.sin(Math.PI * x)]); } return [...up, ...lo.reverse().slice(1, -1)]; };
    const rot = (pts, a, dz, dy) => pts.map(([z, y]) => [z * Math.cos(a) - y * Math.sin(a) + dz, z * Math.sin(a) + y * Math.cos(a) + dy]);
    const wz = Z0 + .36, wy = 1.3, span = 1.96;
    add(prism(rot(foil(.36, .12), -.14, wz, wy), span, 'x'), M.carbon);
    add(prism(rot(foil(.13, .1), -.55, wz - .33, wy + .07), span - .02, 'x'), M.carbon);
    for (const s of SIDES) {
      add(place(prism([[wz + .08, wy - .1], [wz + .02, wy + .1], [wz - .5, wy + .17], [wz - .52, wy - .06], [wz - .2, wy - .16]], .012, 'x', .002), s * (span / 2 + .006), 0, 0), M.carbon);
      if (!coarse) add(tube([[s * (span / 2 + .014), wy - .08, wz + .04], [s * (span / 2 + .014), wy + .08, wz], [s * (span / 2 + .014), wy + .15, wz - .48]], .004, 5), M.accent);
      const px = s * .34, dz = -1.72, dy = deck(dz) - .02;
      add(place(prism([[dz, dy], [dz - .26, dy], [wz - .16, wy + .055], [wz - .04, wy + .07], [wz + .02, wy + .03], [wz - .1, wy + .01]], .022, 'x', .003), px, 0, 0), M.carbon);
    }
  }
  /* Tail: a mesh fascia, a full-width light blade with hooked ends, twin centre
     exhausts, a diffuser with tall strakes. */
  const ty = belt(Z0 + .05) - .05, hw = halfW(Z0 + .03);
  add(place(prism([[-hw * .9, .4], [hw * .9, .4], [hw * .93, .69], [-hw * .93, .69]], .01, 'z'), 0, 0, Z0 - .004), M.gloss);
  add(place(prism([[-hw * .84, .42], [hw * .84, .42], [hw * .87, .665], [-hw * .87, .665]], .012, 'z'), 0, 0, Z0 - .01), M.honey);
  if (!coarse) add(place(new T.BoxGeometry(.018, .014, .14), 0, deck(Z0 + .3) + .068, Z0 + .3), M.tail);
  add(place(new T.BoxGeometry(hw * 1.9, .03, .02), 0, ty, Z0 - .004), M.redLens);
  add(place(new T.BoxGeometry(hw * 1.88, .011, .012), 0, ty, Z0 - .016), M.tail);
  for (const s of SIDES) {
    add(place(new T.BoxGeometry(.012, .15, .012), s * (hw * .94), ty - .07, Z0 - .016), M.tail);
    add(place(new T.BoxGeometry(.18, .011, .012), s * (hw * .94 - .09), ty - .145, Z0 - .016), M.tail);
  }
  for (const x of [-.11, .11]) {
    add(place(new T.CylinderGeometry(.058, .062, .16, 28, 1, true), x, .5, Z0 + .01, Math.PI / 2), M.satin);
    if (!coarse) add(place(new T.TorusGeometry(.058, .006, 8, 28), x, .5, Z0 - .07), M.satin);
    add(place(new T.CircleGeometry(.056, 24), x, .5, Z0 - .02, 0, Math.PI, 0), M.black);
  }
  add(place(new T.BoxGeometry(1.56, .03, .5), 0, .15, Z0 + .22), M.carbon);
  for (let k = -3; k <= 3; k++) add(place(prism([[Z0 + .45, .15], [Z0 - .02, .15], [Z0 - .02, .38 - Math.abs(k) * .025], [Z0 + .2, .2]], .012, 'x'), k * .22, 0, 0), M.carbon);
  return {
    exhausts: [[-.11, .5, Z0 - .12], [.11, .5, Z0 - .12]],
    signals: s => [
      {x: s * (halfW(Z1 - .3) - .02), y: .36, z: Z1 - .3, sx: .03, sy: .02, sz: .12},
      {x: s * (hw * .94 - .09), y: ty - .12, z: Z0 - .02, sx: .16, sy: .012, sz: .012},
      {x: s * (skinPoint(GZ1 - .3, .44, 1)[0] + .27), y: skinPoint(GZ1 - .3, .44, 1)[1] + .08, z: GZ1 - .37, sx: .05, sy: .012, sz: .04},
    ],
  };
}

function auroraCabin(K, amb) {
  const {GZ0, GZ1, roof, gw} = K;
  const C = new Cabin(amb, {leather: '#18181a', leather2: '#222226', alcantara: '#1a1a1d', stitch: '#2448ff', floor: '#0c0d0f'});
  const W = .7, eye = [.36, .92, -.64];
  // Tub: floor, footwell bulkhead, rear bulkhead with an engine window.
  C.box('floor', 0, .17, (GZ0 + .9) / 2, 1.36, .02, .9 - GZ0);
  C.box('carbon', 0, .3, .92, 1.36, .28, .04);
  C.box('carbon', 0, .56, GZ0 + .02, 1.36, .78, .04);
  C.box('glassDark', 0, .78, GZ0 + .045, .5, .12, .01);
  // Dash: carbon body, alcantara top, the passenger side a sculpted carbon wing.
  const dz = GZ1 - .01, dy = K.gBase(GZ1) - .015;
  C.add(prism([[dz, dy], [.55, .8], [.3, .8], [.17, .775], [.12, .72], [.13, .58], [.2, .46], [.45, .4], [dz, .4]], 2 * W - .02, 'x'), 'carbon');
  C.add(prism([[dz - .02, dy + .012], [.3, .815], [.165, .79], [.16, .775], [.3, .8], [dz - .02, dy]], 2 * W - .06, 'x'), 'alcantara');
  C.add(prism([[.1, .7], [.14, .66], [.14, .6], [.08, .6]], .5, 'x', .004), 'carbon').translate(-.36, 0, 0);
  // Binnacle and cluster behind the wheel; the centre screen stands on the dash.
  C.add(place(rbox(.26, .03, .12, .012), .36, .88, .2, -.3), 'carbon');
  const cluster = clusterScreen(.16, .16); cluster.position.set(.36, .8, .15); cluster.rotation.x = -.3; C.mesh(cluster);
  C.box('black', .36, .8, .158, .18, .17, .01, -.3, 0, 0, .004);
  C.box('black', 0, .76, .15, .25, .15, .015, -.3, 0, 0, .006);
  C.add(place(new T.PlaneGeometry(.23, .13), 0, .76, .14, -.3, Math.PI, 0), 'screen');
  // Centre tunnel rising into a bridge under the dash; switchgear on it.
  C.add(prism([[-.95, .17], [-.95, .42], [-.45, .44], [-.05, .5], [.12, .6], [.16, .6], [.16, .17]], .26, 'x', .01), 'carbon');
  C.box('alcantara', 0, .45, -.7, .24, .03, .42, .03, 0, 0, .012);
  for (let i = -2; i <= 2; i++) {
    C.add(place(new T.CylinderGeometry(.004, .004, .035, 8), i * .035, .56, .06, -.9), 'alu');
    C.box('black', i * .035, .545, .075, .022, .012, .02, -.6);
  }
  C.add(place(new T.CylinderGeometry(.018, .018, .01, 20), 0, .515, -.08, -.1), 'led');                   // start
  C.add(place(new T.CylinderGeometry(.03, .032, .025, 28), 0, .47, -.3, -.05), 'alu');                   // drive mode knob
  C.add(place(new T.TorusGeometry(.034, .003, 6, 28), 0, .483, -.3, Math.PI / 2), 'accent');
  // Doors: carbon cards with alcantara pads, an armrest, a pull loop.
  for (const s of SIDES) {
    C.add(place(prism([[.25, .26], [.25, .8], [-.2, .82], [-1.05, .82], [-1.05, .26]], .05, 'x', .005), s * (W + .02), 0, 0), 'carbon');
    C.box('alcantara', s * (W - .01), .62, -.35, .02, .14, .6, 0, 0, 0, .008);
    C.box('alcantara', s * (W - .04), .5, -.45, .07, .04, .4, 0, 0, 0, .015);
    C.add(place(new T.TorusGeometry(.03, .005, 6, 16, Math.PI), s * (W - .03), .68, -.05, 0, Math.PI / 2, 0), 'accent');
  }
  // Seats with blue harnesses.
  for (const x of [.36, -.36]) {
    C.seat({x, y: .24, z: -.5, w: .5, style: 'bucket', recline: .32, backH: .64});
    for (const s of [-1, 1]) C.add(place(new T.BoxGeometry(.045, .5, .006), x + s * .1, .56, -.68, -.3 + .0, 0, 0), 'accent');
    C.add(place(new T.CylinderGeometry(.03, .03, .012, 20), x, .4, -.55, Math.PI / 2 - .2), 'alu');
  }
  // Pedals and a footrest; the column.
  for (const [px, w] of [[.46, .05], [.37, .08], [.28, .06]]) C.box('alu', px, .3, .68, w, .12, .01, -.6, 0, 0);
  C.box('carbon', .36, .64, -.02, .07, .07, .3, -.2);
  // Headliner (carbon), an overhead switch panel with a red guard, A-pillars.
  C.add(headlinerGeometry(roof, GZ0 + .3, .26, z => K.rw(z) + .01, .035, .07), 'alcantara');
  C.box('carbon', 0, roof(-.1) - .05, -.1, .2, .025, .14, .06, 0, 0, .008);
  C.box('led', 0, roof(-.1) - .064, -.08, .03, .006, .02, .06);
  for (const s of SIDES) {
    const a = [s * (gw(GZ1 - .05) - .07), K.gBase(GZ1 - .05) + .01, GZ1 - .05], b = [s * (K.rw(.25) - .03), roof(.25) - .05, .25];
    C.add(tubeAlong([a, [(a[0] + b[0]) / 2 - s * .01, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], b], .026, 8), 'alcantara');
  }
  // Ambient light: across the dash face and into each door, down the console, in the footwells.
  C.strip([[-.66, .625, .122], [0, .63, .118], [.66, .625, .122]]);
  for (const s of SIDES) {
    C.strip([[s * .69, .625, .1], [s * .693, .62, -.1], [s * .693, .57, -.55], [s * .693, .5, -.98]]);
    C.strip([[s * .135, .6, .13], [s * .135, .51, -.05], [s * .135, .44, -.45], [s * .135, .425, -.92]]);
    C.strip([[s * .15, .43, .44], [s * .6, .43, .44]], .003);
  }
  C.strip([[-.08, roof(-.1) - .064, -.17], [.08, roof(-.1) - .064, -.17]], .0025);
  const wheel = steeringWheel(C, 'aero', {x: .36, y: .66, z: -.2, tilt: -.28});
  return {group: C.finish(), wheel, cluster, eye};
}

/* ==================================================================== SOVEREIGN */
function sovereign(K, M, amb, coarse) {
  const {Z0, Z1, zf, zr, R, halfW, belt, deck, patch, add, skinPoint, GZ0, GZ1, gw, gBase, roof} = K;
  // Coach doors meeting at the B-pillar, a long bonnet, a boot lid.
  const bz = -.28;
  shutLines(M.paint, P => {
    const ax = abs(P.x), side = step(.7, ax).mul(step(P.y, belt(0) - .02)).mul(step(.38, P.y));
    return gap(P.z, GZ1 - .02).add(gap(P.z, bz)).add(gap(P.z, GZ0 + .42)).mul(side)
      .add(gap(P.z, GZ1 + .05).mul(step(ax, .78)).mul(step(deck(zf) - .06, P.y)))
      .add(gap(P.z, GZ0 - .1).mul(step(ax, .8)).mul(step(deck(Z0 + .5) - .06, P.y)));
  });
  for (const s of SIDES) {
    // Slim lamps either side of the grille, an LED eyebrow, the lower lamp line.
    const hz0 = Z1 - .3, hz1 = Z1 - .01;
    add(patch(hz0, hz1, .55, .72, .004, s, 6, 6), M.lens);
    add(patch(hz0 + .04, hz1, .7, .715, .008, s, 6, 1), M.head);
    add(patch(hz1 - .03, hz1 - .012, .55, .72, .008, s, 1, 6), M.head);
    if (!coarse) for (const f of [.62, .66]) { const p = skinPoint(hz1 - .07, f, s); add(place(new T.CylinderGeometry(.03, .03, .03, 20), p[0] - s * .01, p[1], p[2] + .02, Math.PI / 2), M.head); }
    // Waft line: a chrome strip along the lower flanks, and chrome window surrounds.
    add(patch(Z0 + .3, Z1 - .35, .19, .2, .004, s, 30, 1), M.chrome);
    add(tube([[s * (gw(GZ0 + .45) + .004), gBase(GZ0 + .45) + .004, GZ0 + .45], [s * (gw(0) + .004), gBase(0) + .004, 0], [s * (gw(GZ1 - .12) + .004), gBase(GZ1 - .12) + .004, GZ1 - .12]], .007, 5), M.chrome);
    // Door handles, body-colour mirrors on the doors.
    for (const z of [bz + .45, bz - .42]) { const p = skinPoint(z, .38, s); add(place(rbox(.02, .025, .16, .01), p[0], p[1], p[2]), M.chrome); }
    const mz = GZ1 - .22, base = skinPoint(mz, .43, s), pod = [base[0] + s * .15, base[1] + .1, mz - .02];
    add(place(new T.BoxGeometry(.14, .03, .06), (base[0] + pod[0]) / 2, (base[1] + pod[1]) / 2, mz, 0, 0, s * .4), M.paint);
    add(place(new T.SphereGeometry(.09, 20, 12).scale(1.1, .75, 1.2), ...pod), M.paint);
    add(place(new T.CircleGeometry(.08, 18).scale(1.05, .7, 1), pod[0], pod[1], pod[2] - .105, 0, Math.PI, 0), M.chrome);
    // Tall tail lamps at the corners.
    add(patch(Z0 + .01, Z0 + .2, .3, .55, .006, s, 5, 6), M.redLens);
    add(patch(Z0 + .015, Z0 + .17, .33, .35, .01, s, 4, 1), M.tail);
    add(patch(Z0 + .015, Z0 + .17, .5, .52, .01, s, 4, 1), M.tail);
    // Chrome sill trim, the arches edged.
    add(patch(zr + R + .05, zf - R - .05, 0, .03, .004, s, 18, 1), M.chrome);
  }
  // The grille: a tall chrome frame, vertical vanes, a mascot on the bonnet.
  const gy0 = .44, gy1 = deck(Z1 - .05) + .05, gwid = .6;
  add(place(new T.BoxGeometry(gwid + .08, gy1 - gy0 + .08, .1), 0, (gy0 + gy1) / 2, Z1 + .01), M.chrome);
  add(place(new T.PlaneGeometry(gwid, gy1 - gy0), 0, (gy0 + gy1) / 2, Z1 + .062), M.black);
  for (let i = 0; i <= 14; i++) add(place(new T.BoxGeometry(.012, gy1 - gy0, .02), (i / 14 - .5) * gwid, (gy0 + gy1) / 2, Z1 + .07), M.chrome);
  add(place(new T.BoxGeometry(gwid + .1, .03, .12), 0, gy1 + .045, Z1 - .01), M.chrome);
  if (!coarse) {
    const my = gy1 + .06, mz = Z1 - .03;
    add(place(prism([[0, 0], [.02, .06], [.0, .12], [-.06, .1], [-.03, .04]], .012, 'x'), 0, my, mz), M.chrome);
    add(place(new T.SphereGeometry(.018, 12, 8), 0, my + .12, mz), M.chrome);
  }
  // Bumpers: a chrome blade low at each end; a lower intake.
  add(place(new T.PlaneGeometry(1.2, .1), 0, .32, Z1 + .005), M.honey);
  add(place(new T.BoxGeometry(1.5, .025, .04), 0, .4, Z1 + .005), M.chrome);
  add(place(new T.BoxGeometry(1.5, .025, .04), 0, .42, Z0 - .005), M.chrome);
  add(place(new T.BoxGeometry(1.2, .025, .02), 0, deck(Z0 + .04) - .06, Z0 - .002), M.chrome);
  for (const x of [-.5, .5]) add(place(rbox(.24, .06, .06, .02), x, .3, Z0 + .01), M.satin);
  void roof;
  return {
    exhausts: [[-.5, .3, Z0 - .06], [.5, .3, Z0 - .06]],
    signals: s => [
      {x: s * .62, y: .48, z: Z1 + .002, sx: .14, sy: .025, sz: .012},
      {x: s * (halfW(Z0 + .1) - .05), y: .55, z: Z0 - .006, sx: .1, sy: .025, sz: .012},
      {x: s * (halfW(GZ1 - .22) + .15), y: belt(GZ1 - .22) + .07, z: GZ1 - .3, sx: .05, sy: .015, sz: .06},
    ],
  };
}

function sovereignCabin(K, amb) {
  const {GZ0, GZ1, roof, gw} = K;
  const C = new Cabin(amb, {leather: '#d9ccb5', leather2: '#1d2233', alcantara: '#20242f', stitch: '#1d2233', floor: '#c8bca6', headliner: '#10111a'});
  const W = .84, eye = [.4, 1.2, -.12];
  C.box('floor', 0, .32, (GZ0 + 1.1) / 2, 1.66, .03, 1.1 - GZ0);
  // Dash: leather top, a walnut fascia, the "gallery" glass across the passenger side.
  const dz = GZ1 - .02, dy = K.gBase(GZ1) - .01;
  C.add(prism([[dz, dy], [.7, 1.045], [.5, 1.04], [.42, 1.0], [.42, .82], [.55, .62], [dz, .62]], 2 * W, 'x', .006), 'leather2');
  C.add(prism([[.415, 1.0], [.405, .99], [.405, .82], [.415, .81]], 2 * W - .04, 'x'), 'wood');
  C.box('glassDark', -.38, .93, .4, .7, .1, .01);
  // Clocks, the centre screen, organ-stop vents.
  const cluster = clusterScreen(.2, .2); cluster.position.set(.4, .98, .38); cluster.rotation.x = -.15; C.mesh(cluster);
  C.add(place(new T.TorusGeometry(.105, .008, 8, 40), .4, .98, .385), 'chrome');
  C.add(place(new T.CylinderGeometry(.04, .04, .01, 32), 0, .95, .4, Math.PI / 2), 'leather');
  C.add(place(new T.TorusGeometry(.042, .005, 8, 32), 0, .95, .398), 'chrome');
  C.add(place(new T.PlaneGeometry(.3, .12), 0, 1.07, .47, -.35, Math.PI, 0), 'screen');
  for (const x of [-.6, -.14, .14, .7]) for (const d of [-.03, .03]) C.add(place(new T.CylinderGeometry(.008, .008, .05, 12), x + d, .86, .39, Math.PI / 2), 'chrome');
  // Centre console in walnut with a chrome rotary; lounge armrest between the rear seats.
  C.add(prism([[-.75, .32], [-.75, .62], [-.3, .64], [.2, .66], [.45, .82], [.45, .32]], .3, 'x', .01), 'wood');
  C.box('leather', 0, .66, -.5, .28, .05, .5, 0, 0, 0, .02);
  C.add(place(new T.CylinderGeometry(.035, .038, .03, 32), 0, .69, -.02), 'chrome');
  C.add(prism([[-.9, .5], [-.9, .75], [-1.4, .75], [-1.4, .5]], .3, 'x', .02), 'leather');
  C.box('wood', 0, .76, -1.15, .26, .02, .38);
  C.box('leather2', 0, 1.02, GZ0 + .3, 1.5, .04, .35);                       // parcel shelf
  // Doors: quilted leather, a walnut cap, chrome pulls, umbrella hint.
  for (const s of SIDES) {
    C.add(place(prism([[.42, .38], [.42, .98], [GZ0 + .3, .98], [GZ0 + .3, .38]], .05, 'x', .006), s * (W + .02), 0, 0), 'quilt');
    C.box('wood', s * (W - .01), .98, (.42 + GZ0 + .3) / 2, .06, .03, .42 - GZ0 - .3, 0, 0, 0, .01);
    C.box('leather2', s * (W - .03), .72, -.2, .07, .05, .5, 0, 0, 0, .02);
    C.box('leather2', s * (W - .03), .72, -1.2, .07, .05, .5, 0, 0, 0, .02);
    for (const z of [.1, -.95]) C.add(place(new T.TorusGeometry(.04, .006, 6, 16, Math.PI), s * (W - .02), .86, z, 0, Math.PI / 2, 0), 'chrome');
  }
  // Seats: front armchairs, rear lounge seats, picnic tables on the front seatbacks.
  for (const x of [.4, -.4]) {
    C.seat({x, y: .54, z: -.12, w: .56, depth: .54, style: 'lux', recline: .2, backH: .6, key: 'leather'});
    C.seat({x: x * .9, y: .56, z: -1.02, w: .52, depth: .55, style: 'lux', recline: .24, backH: .58, key: 'leather'});
    C.box('wood', x, .9, -.42, .38, .26, .02, -.15);
  }
  C.box('leather', 0, .38, .75, 1.5, .04, .5);
  // The starlight roof over both rows, edged by a leather band.
  const hz0 = GZ0 + .3, hz1 = GZ1 - .3, hw = z => K.rw(z) + .02;
  C.mesh(starHeadliner(amb, roof, hz0, hz1, hw, .03, .05, '#0b0c16'));
  for (const s of SIDES) {
    // Leather rails along the headliner's edges, the A- and B-pillar trims inside the glass.
    const rail = []; for (let i = 0; i <= 8; i++) { const z = hz0 + (hz1 - hz0) * i / 8; rail.push([s * hw(z), roof(z) - .03 - .05, z]); }
    C.add(tubeAlong(rail, .022, 6), 'leather');
    const a = [s * (gw(GZ1 - .05) - .07), K.gBase(GZ1 - .05) + .01, GZ1 - .05], b = [s * (K.rw(.5) - .02), roof(.5) - .05, .5];
    C.add(tubeAlong([a, b], .022, 8), 'leather2');
    const bz = -.28, c = [s * (gw(bz) - .06), K.gBase(bz) + .02, bz], d = [s * (K.rw(bz) - .01), roof(bz) - .05, bz];
    C.add(tubeAlong([c, d], .03, 8), 'leather2');
  }
  // Ambient: along the dash and the doors, under the dash, the gallery glows, the footwells.
  C.strip([[-.8, .815, .41], [0, .815, .40], [.8, .815, .41]]);
  C.strip([[-.72, .885, .395], [-.04, .885, .395]], .004);
  for (const s of SIDES) {
    C.strip([[s * .81, .94, .38], [s * .812, .93, -.4], [s * .812, .93, -1.55]]);
    C.strip([[s * .81, .5, .3], [s * .812, .48, -1.5]], .003);
    C.strip([[s * .16, .64, .44], [s * .16, .63, -.6]], .003);
  }
  const wheel = steeringWheel(C, 'lux', {x: .4, y: .98, z: .2, tilt: -.38});
  return {group: C.finish(), wheel, cluster, eye};
}

/* ====================================================================== BAMBINA */
function bambina(K, M, amb, coarse) {
  const {Z0, Z1, zf, zr, halfW, belt, deck, patch, add, skinPoint, GZ0, GZ1, gw, gBase, roof} = K;
  shutLines(M.paint, P => {
    const ax = abs(P.x), side = step(.5, ax).mul(step(P.y, belt(0) - .02)).mul(step(.32, P.y));
    return gap(P.z, GZ1 - .02).add(gap(P.z, -.42)).mul(side)
      .add(gap(P.z, GZ1 + .06).mul(step(ax, .5)).mul(step(deck(zf) - .08, P.y)))
      .add(gap(ax, .5).mul(step(P.z, Z1 - .15)).mul(step(GZ1 + .06, P.z)).mul(step(deck(zf) - .08, P.y)));
  });
  // Contrast roof (white), like the period two-tones.
  const roofMat = new T.MeshPhysicalMaterial({color: '#ece8dc', roughness: .3, metalness: .1, clearcoat: 1});
  {
    const pos = [], idx = [], nz = 18, nx = 10, z0 = -.72, z1 = .36;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const z = z0 + (z1 - z0) * j / nz, u = i / nx * 2 - 1, w = K.rw(z) * .92; pos.push(u * w, roof(z) + .004 - u * u * .012, z); }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    add(g, roofMat);
  }
  for (const s of SIDES) {
    // Round headlamps in chrome bezels on the front wings, little amber sidelights.
    const hz = Z1 - .12, p = skinPoint(hz, .52, s), n = K.skinNormal(hz, .52, s);
    const lamp = new T.Group(); lamp.position.set(p[0] + n[0] * .01, p[1] + n[1] * .01, p[2] + n[2] * .01); lamp.lookAt(lamp.position.x + n[0], lamp.position.y + n[1], lamp.position.z + n[2]); lamp.updateMatrix();
    add(new T.SphereGeometry(.075, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, .5).applyMatrix4(lamp.matrix), M.head);
    add(new T.TorusGeometry(.078, .012, 8, 32).applyMatrix4(lamp.matrix), M.chrome);
    add(place(new T.SphereGeometry(.025, 12, 8).scale(1.4, 1, .6), s * .42, .42, Z1 - .02), M.amberLens);
    // Chrome waist strip, door handle, mirror on the wing.
    add(patch(Z0 + .2, Z1 - .2, .36, .37, .004, s, 20, 1), M.chrome);
    const hp = skinPoint(-.3, .4, s); add(place(rbox(.02, .02, .1, .008), hp[0], hp[1], hp[2]), M.chrome);
    const mp = skinPoint(zf - .1, .52, s);
    add(place(new T.CylinderGeometry(.006, .006, .12, 8), mp[0], mp[1] + .06, mp[2]), M.chrome);
    add(place(new T.CylinderGeometry(.045, .045, .025, 20), mp[0], mp[1] + .13, mp[2], Math.PI / 2), M.chrome);
    // Round tail lamps.
    const tp = skinPoint(Z0 + .06, .45, s);
    add(place(new T.CylinderGeometry(.045, .045, .02, 20), tp[0], tp[1], Z0 - .005, Math.PI / 2), M.redLens);
    add(place(new T.CylinderGeometry(.03, .03, .01, 20), tp[0], tp[1], Z0 - .018, Math.PI / 2), M.tail);
    add(place(new T.TorusGeometry(.046, .006, 6, 24), tp[0], tp[1], Z0 - .012), M.chrome);
    // Chrome window surround.
    add(tube([[s * (gw(GZ0 + .15) + .004), gBase(GZ0 + .15) + .004, GZ0 + .15], [s * (gw(-.2) + .004), gBase(-.2) + .004, -.2], [s * (gw(GZ1 - .1) + .004), gBase(GZ1 - .1) + .004, GZ1 - .1]], .005, 5), M.chrome);
  }
  // Chrome bumpers with overriders; a little grille; a bonnet badge.
  for (const [z, d] of [[Z1 + .02, 1], [Z0 - .02, -1]]) {
    add(tube([[-.66, .3, z - d * .12], [-.55, .3, z - d * .01], [0, .3, z + d * .02], [.55, .3, z - d * .01], [.66, .3, z - d * .12]], .025, 8), M.chrome);
    for (const x of [-.3, .3]) add(place(rbox(.035, .12, .04, .012), x, .34, z + d * .02), M.chrome);
  }
  add(place(new T.PlaneGeometry(.34, .06), 0, .42, Z1 + .003), M.vent);
  add(place(new T.BoxGeometry(.36, .012, .02), 0, .455, Z1 + .005), M.chrome);
  add(place(new T.BoxGeometry(.08, .01, .005), 0, deck(Z1 - .1) + .012, Z1 - .08, -.4), M.chrome);
  add(place(new T.CylinderGeometry(.018, .018, .12, 12), .32, .18, Z0 - .02, Math.PI / 2), M.chrome);
  void halfW; void coarse;
  return {
    exhausts: [[.32, .18, Z0 - .09]],
    signals: s => [
      {x: s * .42, y: .42, z: Z1 + .002, sx: .06, sy: .03, sz: .015},
      {x: s * (skinPoint(Z0 + .06, .45, 1)[0]), y: skinPoint(Z0 + .06, .45, 1)[1] - .075, z: Z0 - .01, sx: .05, sy: .02, sz: .01},
    ],
  };
}

function bambinaCabin(K, amb) {
  const {GZ0, GZ1, roof, gw} = K;
  const C = new Cabin(amb, {leather: '#7a1f1c', leather2: '#5c1714', stitch: '#e6dcc5', floor: '#2a2522', headliner: '#d8d1bf', paint: '#c9c3b2'});
  const W = .6, eye = [.3, 1.07, -.42];
  C.box('floor', 0, .2, (GZ0 + .9) / 2, 1.2, .02, .9 - GZ0);
  // A painted steel dash with a single round clock, chrome knobs and a radio.
  const dz = GZ1 - .02;
  C.add(prism([[dz, K.gBase(GZ1) - .02], [.4, .83], [.34, .8], [.34, .66], [.42, .6], [dz, .6]], 2 * W, 'x', .008), 'paint');
  C.box('trim', 0, .835, .43, 2 * W - .02, .025, .16, 0, 0, 0, .01);
  const cluster = clusterScreen(.14, .14); cluster.position.set(.3, .74, .33); C.mesh(cluster);
  C.add(place(new T.TorusGeometry(.072, .01, 8, 32), .3, .74, .335), 'chrome');
  C.box('chrome', 0, .72, .33, .2, .06, .01, 0, 0, 0, .003);
  C.box('black', 0, .72, .326, .17, .04, .006);
  for (const x of [-.12, -.2, .12]) C.add(place(new T.CylinderGeometry(.012, .012, .025, 16), x, .66, .33, Math.PI / 2), 'chrome');
  C.add(place(new T.CylinderGeometry(.008, .012, .35, 8), 0, .36, .1, -.5), 'chrome');
  C.add(place(new T.SphereGeometry(.025, 16, 10), 0, .52, .02), 'trim');
  // Doors: painted tops, red trim panels, chrome winders.
  for (const s of SIDES) {
    C.add(place(prism([[.34, .3], [.34, .8], [-.9, .8], [-.9, .3]], .04, 'x', .005), s * (W + .01), 0, 0), 'leather2');
    C.box('paint', s * (W - .005), .79, -.28, .04, .03, 1.2);
    C.add(place(new T.CylinderGeometry(.005, .005, .08, 8), s * (W - .03), .58, -.1, 0, 0, Math.PI / 2), 'chrome');
  }
  // Two small seats, a rear bench.
  for (const x of [.3, -.3]) C.seat({x, y: .38, z: -.4, w: .46, depth: .46, style: 'bench', recline: .18, backH: .56, key: 'leather'});
  C.seat({x: 0, y: .4, z: -.95, w: 1.05, depth: .4, style: 'bench', recline: .2, backH: .45, key: 'leather'});
  C.add(headlinerGeometry(roof, GZ0 + .12, GZ1 - .15, z => K.rw(z) + .01, .03, .05), 'headliner');
  // Retrofit mood light: under the dash lip and along the door pockets.
  C.strip([[-.56, .6, .44], [.56, .6, .44]]);
  for (const s of SIDES) C.strip([[s * .585, .45, .25], [s * .585, .45, -.8]], .003);
  const wheel = steeringWheel(C, 'classic', {x: .3, y: .8, z: .06, tilt: -.6, size: .85});
  return {group: C.finish(), wheel, cluster, eye};
}

/* ======================================================================= RANGER */
function ranger(K, M, amb, coarse) {
  const {Z0, Z1, zf, zr, R, halfW, belt, deck, patch, add, skinPoint, GZ0, GZ1, roof, rw} = K;
  shutLines(M.paint, P => {
    const ax = abs(P.x), side = step(.75, ax).mul(step(P.y, belt(0) - .02)).mul(step(.62, P.y));
    return gap(P.z, GZ1 - .03).add(gap(P.z, -.32)).add(gap(P.z, zr + .5)).mul(side)
      .add(gap(P.z, GZ1 + .06).mul(step(ax, .82)).mul(step(deck(zf) - .06, P.y)));
  });
  const clad = M.black;
  for (const s of SIDES) {
    // Arch cladding and a clad sill; a satin skid rail.
    for (const zc of [zf, zr]) add(patch(zc - R - .09, zc + R + .09, 0, .05, .02, s, 16, 2), clad);
    add(patch(zr + R + .05, zf - R - .05, 0, .12, .012, s, 16, 2), clad);
    add(patch(zr + R + .1, zf - R - .1, .02, .05, .03, s, 12, 1), M.satin);
    // Square LED headlamps with a light-bar brow; slim tail lamps wrapping round.
    const hz0 = Z1 - .38, hz1 = Z1 - .01;
    add(patch(hz0, hz1, .43, .62, .005, s, 8, 6), M.lens);
    add(patch(hz0 + .05, hz1, .6, .615, .009, s, 8, 1), M.head);
    add(patch(hz1 - .03, hz1 - .012, .43, .62, .009, s, 1, 6), M.head);
    if (!coarse) for (const f of [.47, .53]) { const p = skinPoint(hz1 - .03, f, s); add(place(new T.BoxGeometry(.05, .04, .02), p[0] - s * .02, p[1], p[2] + .012), M.head); }
    add(patch(Z0 + .01, Z0 + .3, .5, .58, .006, s, 6, 3), M.redLens);
    add(patch(Z0 + .015, Z0 + .28, .555, .565, .01, s, 6, 1), M.tail);
    // Mirrors, flush handles, window trim, roof rails.
    const mz = GZ1 - .15, base = skinPoint(mz, .42, s), pod = [base[0] + s * .15, base[1] + .12, mz - .02];
    add(place(new T.BoxGeometry(.14, .04, .06), (base[0] + pod[0]) / 2, (base[1] + pod[1]) / 2, mz, 0, 0, s * .45), M.black);
    add(place(rbox(.12, .14, .2, .03), ...pod), M.paint);
    for (const z of [-.05, -.75]) { const p = skinPoint(z, .4, s); add(place(rbox(.018, .03, .18, .01), p[0], p[1], p[2]), M.satin); }
    const rx = s * (rw(0) - .08);
    add(tube([[rx, roof(GZ0 + .15) + .02, GZ0 + .15], [rx, roof(-1.4) + .06, -1.4], [rx, roof(0) + .06, 0], [rx, roof(.2) + .06, .2], [rx, roof(.35) + .01, .35]], .014, 6), M.satin);
  }
  // Grille: a wide dark mesh in a satin frame; a skid plate; tow hooks.
  const gy0 = .56, gy1 = deck(Z1 - .03) - .04;
  add(place(new T.PlaneGeometry(1.0, gy1 - gy0), 0, (gy0 + gy1) / 2, Z1 + .004), M.honey);
  add(place(new T.BoxGeometry(1.06, .025, .03), 0, gy1 + .01, Z1 + .005), M.satin);
  add(place(new T.BoxGeometry(1.06, .025, .03), 0, gy0 - .01, Z1 + .005), M.satin);
  for (let i = -2; i <= 2; i++) add(place(new T.BoxGeometry(.18, .015, .02), i * .2, (gy0 + gy1) / 2, Z1 + .012), M.satin);
  add(place(new T.PlaneGeometry(1.1, .12), 0, .42, Z1 + .003), M.honey);
  add(place(new T.BoxGeometry(.9, .04, .25), 0, .3, Z1 - .08, -.3), M.satin);
  add(place(new T.BoxGeometry(1.2, .04, .2), 0, .34, Z0 + .06, .3), M.satin);
  add(place(new T.BoxGeometry(1.3, .02, .02), 0, deck(Z0 + .05) - .1, Z0 - .004), M.tail);
  for (const x of [-.45, .45]) add(place(rbox(.16, .06, .08, .02), x, .38, Z0 + .01), M.satin);
  void halfW;
  return {
    exhausts: [[-.45, .38, Z0 - .06], [.45, .38, Z0 - .06]],
    signals: s => [
      {x: s * .7, y: .6, z: Z1 - .01, sx: .12, sy: .03, sz: .02},
      {x: s * (halfW(Z0 + .1) - .1), y: deck(Z0 + .05) - .22, z: Z0 - .01, sx: .12, sy: .02, sz: .015},
      {x: s * (skinPoint(GZ1 - .15, .42, 1)[0] + .21), y: skinPoint(GZ1 - .15, .42, 1)[1] + .08, z: GZ1 - .17, sx: .04, sy: .012, sz: .08},
    ],
  };
}

function rangerCabin(K, amb) {
  const {GZ0, GZ1, roof, gw} = K;
  const C = new Cabin(amb, {leather: '#2b2927', leather2: '#4a3b30', alcantara: '#26272a', stitch: '#b08a5e', floor: '#18191b', headliner: '#3a3936'});
  const W = .82, eye = [.4, 1.5, -.32];
  C.box('floor', 0, .52, (GZ0 + 1.0) / 2, 1.6, .03, 1.0 - GZ0);
  // A tall dash with an open-pore wood band and a light line under it; a floating screen.
  const dz = GZ1 - .02, dy = K.gBase(GZ1) - .02;
  C.add(prism([[dz, dy], [.5, dy + .03], [.35, dy + .02], [.3, 1.1], [.32, .95], [.45, .8], [dz, .8]], 2 * W, 'x', .008), 'leather');
  C.add(prism([[.305, 1.09], [.295, 1.08], [.3, 1.02], [.31, 1.02]], 2 * W - .04, 'x'), 'wood');
  C.box('black', 0, 1.25, .36, .3, .16, .02, -.15, 0, 0, .01);
  C.add(place(new T.PlaneGeometry(.28, .14), 0, 1.25, .348, -.15, Math.PI, 0), 'screen');
  const cluster = clusterScreen(.18, .18); cluster.position.set(.4, 1.17, .34); cluster.rotation.x = -.1; C.mesh(cluster);
  C.box('black', .4, 1.17, .36, .32, .15, .01);
  C.add(prism([[-.7, .52], [-.7, .92], [-.2, .94], [.2, .98], [.35, 1.0], [.35, .52]], .3, 'x', .01), 'leather2');
  C.box('alu', 0, .99, .05, .04, .04, .08, 0, 0, 0, .01);
  C.box('wood', 0, .96, -.2, .24, .015, .3);
  for (const s of SIDES) {
    C.add(place(prism([[.3, .62], [.3, 1.18], [-1.7, 1.18], [-1.7, .62]], .05, 'x', .006), s * (W + .02), 0, 0), 'leather');
    C.box('wood', s * (W - .01), 1.12, -.7, .06, .02, 1.9, 0, 0, 0, .006);
    C.box('leather2', s * (W - .03), .98, -.3, .07, .05, .45, 0, 0, 0, .02);
    C.box('leather2', s * (W - .03), .98, -1.3, .07, .05, .45, 0, 0, 0, .02);
  }
  for (const x of [.4, -.4]) C.seat({x, y: .82, z: -.32, w: .54, depth: .52, style: 'suv', recline: .2, backH: .62, key: 'leather', insert: 'leather2'});
  C.seat({x: 0, y: .84, z: -1.3, w: 1.4, depth: .5, style: 'suv', recline: .24, backH: .6, key: 'leather', insert: 'leather2'});
  C.add(headlinerGeometry(roof, GZ0 + .15, GZ1 - .2, z => K.rw(z) + .01, .035, .06), 'headliner');
  // Panoramic roof glass seen from inside.
  C.box('glassDark', 0, roof(-.6) - .04, -.6, .9, .005, 1.3);
  C.strip([[-.78, 1.02, .31], [0, 1.02, .305], [.78, 1.02, .31]]);
  for (const s of SIDES) {
    C.strip([[s * .79, 1.1, .25], [s * .792, 1.1, -.8], [s * .792, 1.1, -1.65]]);
    C.strip([[s * .16, .95, .33], [s * .16, .94, -.65]], .003);
  }
  C.strip([[-.4, roof(-1.3) - .05, -1.95], [.4, roof(-1.3) - .05, -1.95]], .003);
  const wheel = steeringWheel(C, 'suv', {x: .4, y: 1.14, z: .06, tilt: -.4});
  return {group: C.finish(), wheel, cluster, eye};
}

/* ======================================================================= specs */
export const MODELS = [
  {
    id: 'aurora', name: 'Aurora', tag: 'carbon hypercar', paint: '#0c0d10', ambient: '#2f5bff', wheelStyle: 'aero',
    // The sounds this body wears (game.js CARS ids); the first is its default.
    sounds: ['absolut', 'molsheim', 'woking765', 'sf90', 'temerario', 'revuelto', 'utopia', 'huayrar', 'zonda', 't50', 'gaydon', 'gintani', 'lemansh', 'kaze',
      'carreragt', 'strada', 'motomachi', 'huracan', 'f458', 'cavallino', 'hexen', 'zuffen', 'veleno', 'f12tdf', 'fiorano599', 'tempest3k'],
    wheels: wheelsAt(.91, .91, 1.41, -1.41, .365), mass: 1390,
    spec: ({zf, zr}) => {
      const Z0 = zr - .95, Z1 = zf + 1.06, GZ1 = zf - .55, GZ0 = zr + .26;
      return {
        Z0, Z1, archFlat: 1,
        halfW: [[Z0, .84], [Z0 + .1, .97], [zr - .55, 1.05], [zr, 1.09], [zr + .45, 1.06], [zr + .95, .975], [0, .955], [zf - .72, .97], [zf - .35, 1.03], [zf, 1.055], [zf + .42, 1.03], [Z1 - .32, .95], [Z1 - .12, .82], [Z1, .6]],
        belt: [[Z0, .82], [Z0 + .08, .93], [zr - .5, .99], [zr, 1.01], [zr + .45, .975], [zr + .9, .87], [0, .82], [zf - .8, .8], [zf - .35, .9], [zf, .945], [zf + .42, .86], [Z1 - .3, .66], [Z1 - .08, .54], [Z1, .5]],
        deck: [[Z0, .85], [Z0 + .08, .96], [Z0 + .5, .975], [zr, .98], [GZ0, .985], [0, .9], [GZ1, .79], [zf, .67], [zf + .5, .61], [Z1 - .15, .54], [Z1, .5]],
        sill: [[Z0, .33], [Z0 + .3, .27], [0, .21], [Z1 - .35, .19], [Z1, .17]],
        section: (z, w, s, b, d, lift) => [[w * .96, s], [w * .995, s + .3 * (b - s) + lift * .1], [w, b - .1], [w * .95, b - .01], [w * .8, b - .02], [w * .6, Math.min(d - .01, b - .08)], [w * .3, d + .005], [0, d + .012]],
        green: {
          GZ0, GZ1, sideCols: 2,
          roof: [[GZ0, .99], [-.85, 1.055], [-.45, 1.115], [-.12, 1.135], [.18, 1.115], [.48, 1.01], [GZ1, .8]],
          gw: (z, h) => h * .79, rw: (z, h) => Math.min(.52, h * .56),
          shape: (z, w0, w1, base, top) => [[w0, base], [w0 * .93 + w1 * .07, base + (top - base) * .5], [w1 + .05, top - .035], [w1 * .6, top - .004], [0, top + .006]],
          glass: (z, side) => side ? z > GZ0 + .45 && z < GZ1 - .08 : z > .22 || z < -.8,
        },
      };
    },
    details: aurora, cabin: auroraCabin, mats: {accent: '#1e4cff', flake: .55, paintRough: .26, glassTint: '#070a0e', glassOpacity: .74},
  },
  {
    id: 'sovereign', name: 'Sovereign', tag: 'luxury saloon · starlight roof', paint: '#16181d', ambient: '#ffd6a0', wheelStyle: 'lux',
    sounds: ['goodwood', 'affalter', 'bavaria', 'kirin', 'ionia'],
    wheels: wheelsAt(.86, .86, 1.62, -1.68, .4), mass: 2560,
    spec: ({zf, zr}) => {
      const Z0 = zr - 1.12, Z1 = zf + .98, GZ1 = .95, GZ0 = -1.78;
      return {
        Z0, Z1, archR: .52, floor: .28,
        halfW: [[Z0, .9], [Z0 + .16, .965], [zr, .985], [0, .99], [zf, .985], [Z1 - .25, .96], [Z1 - .05, .92], [Z1, .9]],
        belt: [[Z0, .9], [Z0 + .1, .96], [zr, .98], [0, .985], [zf, .995], [Z1 - .2, .985], [Z1, .92]],
        deck: [[Z0, .93], [Z0 + .12, 1.0], [Z0 + .7, 1.02], [GZ0, 1.03], [0, 1.03], [GZ1, 1.035], [zf, 1.035], [Z1 - .2, 1.025], [Z1, .96]],
        sill: [[Z0, .44], [Z0 + .3, .36], [0, .33], [Z1 - .3, .36], [Z1, .44]],
        section: (z, w, s, b, d, lift) => [[w * .97, s], [w, s + .35 * (b - s) + lift * .1], [w * 1.0, b - .1], [w * .985, b - .02], [w * .93, Math.max(b, d) + .0], [w * .7, d + .012], [w * .35, d + .02], [0, d + .022]],
        green: {
          GZ0, GZ1, sideCols: 2,
          roof: [[GZ0, 1.035], [-1.45, 1.37], [-1.2, 1.52], [-.7, 1.58], [.2, 1.57], [.52, 1.47], [GZ1, 1.04]],
          gw: (z, h) => h * .87, rw: (z, h) => h * .72,
          shape: (z, w0, w1, base, top) => [[w0, base], [w0 * .97 + w1 * .03, base + (top - base) * .5], [w1 + .04, top - .03], [w1 * .6, top - .003], [0, top + .004]],
          glass: (z, side) => side ? z > GZ0 + .45 && z < GZ1 - .1 && Math.abs(z + .28) > .06 : z > .52 || z < -1.34,
        },
      };
    },
    details: sovereign, cabin: sovereignCabin, mats: {accent: '#c9b27a', flake: .7, paintRough: .2, glassTint: '#0d1114', glassOpacity: .4},
  },
  {
    id: 'bambina', name: 'Bambina 600', tag: '1962 city car', paint: '#6fa7a0', ambient: '#ffd6a0', wheelStyle: 'classic',
    sounds: ['kestrel', 'peel', 'shirakawa', 'kaminari', 'falkner', 'tempest', 'ingolstadt'],
    wheels: wheelsAt(.62, .62, .95, -1.05, .29), mass: 720,
    spec: ({zf, zr}) => {
      const Z0 = zr - .66, Z1 = zf + .62, GZ1 = .52, GZ0 = -1.0;
      return {
        Z0, Z1, archR: .38, floor: .2, wellIn: .16,
        halfW: [[Z0, .56], [Z0 + .15, .68], [zr, .74], [0, .73], [zf, .74], [Z1 - .15, .68], [Z1, .54]],
        belt: [[Z0, .5], [Z0 + .12, .7], [zr, .8], [0, .8], [zf, .8], [Z1 - .12, .66], [Z1, .5]],
        deck: [[Z0, .5], [Z0 + .12, .76], [Z0 + .4, .86], [GZ0, .88], [0, .9], [GZ1, .86], [zf, .8], [Z1 - .12, .68], [Z1, .5]],
        sill: [[Z0, .32], [Z0 + .2, .26], [0, .24], [Z1 - .2, .26], [Z1, .32]],
        section: (z, w, s, b, d, lift) => [[w * .9, s], [w * .99, s + .35 * (b - s) + lift * .15], [w, b - .12], [w * .96, b - .03], [w * .82, b], [w * .6, Math.max(d - .02, b - .02)], [w * .3, d + .01], [0, d + .015]],
        green: {
          GZ0, GZ1, sideCols: 2,
          roof: [[GZ0, .885], [-.82, 1.18], [-.6, 1.34], [-.2, 1.39], [.2, 1.37], [.4, 1.2], [GZ1, .865]],
          gw: (z, h) => h * .9, rw: (z, h) => h * .74,
          shape: (z, w0, w1, base, top) => [[w0, base], [w0 * .96 + w1 * .04, base + (top - base) * .5], [w1 + .05, top - .04], [w1 * .65, top - .004], [0, top + .005]],
          glass: (z, side) => side ? z > GZ0 + .22 && z < GZ1 - .08 && Math.abs(z + .42) > .04 : z > .38 || z < -.78,
        },
      };
    },
    details: bambina, cabin: bambinaCabin, mats: {accent: '#d9d2c0', flake: .15, paintRough: .3, glassTint: '#141a1c', glassOpacity: .3},
  },
  {
    id: 'ranger', name: 'Ranger', tag: 'luxury SUV', paint: '#3c4a3e', ambient: '#a9d8ff', wheelStyle: 'rugged',
    sounds: ['urus', 'purosangue', 'bavariaxm', 'vandal', 'hellion', 'kodiak'],
    wheels: wheelsAt(.86, .86, 1.5, -1.45, .42), mass: 2350,
    spec: ({zf, zr}) => {
      const Z0 = zr - 1.0, Z1 = zf + .98, GZ1 = .72, GZ0 = -2.12;
      return {
        Z0, Z1, archR: .56, floor: .42, wellIn: .22,
        halfW: [[Z0, .94], [Z0 + .12, .99], [zr, 1.01], [0, 1.0], [zf, 1.01], [Z1 - .2, .98], [Z1, .9]],
        belt: [[Z0, 1.08], [Z0 + .1, 1.13], [zr, 1.15], [0, 1.14], [zf, 1.15], [Z1 - .2, 1.12], [Z1, 1.02]],
        deck: [[Z0, 1.1], [Z0 + .1, 1.18], [GZ0, 1.2], [0, 1.18], [GZ1, 1.15], [zf, 1.14], [Z1 - .2, 1.12], [Z1, 1.04]],
        sill: [[Z0, .52], [Z0 + .25, .46], [0, .44], [Z1 - .25, .46], [Z1, .52]],
        section: (z, w, s, b, d, lift) => [[w * .97, s], [w, s + .35 * (b - s) + lift * .1], [w, b - .1], [w * .99, b - .015], [w * .94, Math.max(b, d)], [w * .7, d + .01], [w * .35, d + .015], [0, d + .018]],
        green: {
          GZ0, GZ1, sideCols: 2,
          roof: [[GZ0, 1.2], [-2.07, 1.62], [-1.95, 1.78], [-1.6, 1.83], [0, 1.84], [.25, 1.8], [.42, 1.66], [GZ1, 1.16]],
          gw: (z, h) => h * .9, rw: (z, h) => h * .8,
          shape: (z, w0, w1, base, top) => [[w0, base], [w0 * .97 + w1 * .03, base + (top - base) * .5], [w1 + .03, top - .025], [w1 * .6, top - .002], [0, top + .003]],
          glass: (z, side) => side ? z > GZ0 + .12 && z < GZ1 - .1 && Math.abs(z + .32) > .06 && Math.abs(z + 1.45) > .07 : z > .38 || z < -1.97,
        },
      };
    },
    details: ranger, cabin: rangerCabin, mats: {accent: '#b08a5e', flake: .5, paintRough: .3, glassTint: '#0c1114', glassOpacity: .42},
  },
];
export const modelById = id => MODELS.find(m => m.id === id) || MODELS[0];
/** The body a sound (game.js car id) belongs to, or null (custom builds fit any body). */
export const modelForSound = id => MODELS.find(m => m.sounds.includes(id))?.id || null;

/**
 * Build a car. Returns {group, wheels (pivots), paint, head, tail, dims, ambient,
 * interior: {group, wheel, cluster, eye}|null, signals, exhausts, model}.
 */
export function buildModel(id, {paint = null, ambient = null, coarse = false} = {}) {
  const model = modelById(id);
  const wheelsSpec = model.wheels, radius = wheelsSpec[0].y;
  const zf = Math.max(...wheelsSpec.map(w => w.z)), zr = Math.min(...wheelsSpec.map(w => w.z));
  const mats = carMaterials({paint: paint || model.paint, ...model.mats});
  const K = loftBody(model.spec({zf, zr}), wheelsSpec, radius, mats, {coarse});
  const amb = makeAmbient(ambient || model.ambient);
  const extra = model.details(K, mats, amb, coarse);
  const group = K.finish();
  const wheels = buildWheels(wheelsSpec, radius, model.wheelStyle, {coarse});
  let interior = null;
  if (!coarse) { interior = model.cabin(K, amb); interior.group.add(interior.wheel); group.add(interior.group); }
  const dims = {...K.dims, exhausts: extra.exhausts, signals: extra.signals};
  return {group, wheels, paint: mats.paint, head: mats.head, tail: mats.tail, glass: mats.glass, dims, ambient: amb, interior, model, radius, mass: model.mass};
}
