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
import {auroraSpec, auroraBody, auroraCabin} from './cars/aurora.js';
import {preloadAurora, auroraGlbReady, auroraGlbBody} from './cars/auroraGlb.js';

/** Load the Blender-built bodies (await before the first buildModel). */
export const preloadCars = () => preloadAurora();
import {sovereignSpec, sovereignBody, sovereignCabin} from './cars/sovereign.js';
import {Cabin, makeAmbient, rbox, prism, tubeAlong, place, steeringWheel, clusterScreen, starHeadliner, headlinerGeometry} from './carInterior.js';

const SIDES = [1, -1];
const wheelsAt = (xf, xr, zf, zr, r) => [
  {name: 'Wheel_FL', x: xf, y: r, z: zf, front: true}, {name: 'Wheel_FR', x: -xf, y: r, z: zf, front: true},
  {name: 'Wheel_RL', x: xr, y: r, z: zr, front: false}, {name: 'Wheel_RR', x: -xr, y: r, z: zr, front: false},
];

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
  const cluster = clusterScreen(.26, .112); cluster.position.set(.3, .745, .325); C.mesh(cluster);
  C.box('chrome', .3, .745, .333, .28, .13, .01, 0, 0, 0, .004);
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
  const cluster = clusterScreen(.3, .129); cluster.position.set(.4, 1.245, .33); cluster.rotation.x = -.1; C.mesh(cluster);
  C.box('black', .4, 1.23, .36, .33, .17, .05, -.1, 0, 0, .012);           // a pod on the dash top
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
    spec: auroraSpec,
    details: auroraBody, glb: {ready: auroraGlbReady, body: auroraGlbBody}, cabin: auroraCabin, mats: {accent: '#1e4cff', flake: .55, paintRough: .26, glassTint: '#070a0e', glassOpacity: .74},
  },
  {
    id: 'sovereign', name: 'Sovereign', tag: 'luxury saloon · starlight roof', paint: '#16181d', ambient: '#ffd6a0', wheelStyle: 'lux',
    sounds: ['goodwood', 'affalter', 'bavaria', 'kirin', 'ionia'],
    wheels: wheelsAt(.86, .86, 1.62, -1.68, .4), mass: 2560,
    spec: sovereignSpec,
    details: sovereignBody, cabin: sovereignCabin, mats: {accent: '#c9b27a', flake: .7, paintRough: .2, glassTint: '#0d1114', glassOpacity: .4},
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
  // The Blender body when it has loaded (the dealer fleet gets its light LOD).
  const glb = model.glb?.ready(coarse);
  const extra = glb ? model.glb.body(K, mats, coarse) : model.details(K, mats, amb, coarse);
  const group = glb ? extra.group : K.finish();
  const wheels = buildWheels(wheelsSpec, radius, model.wheelStyle, {coarse});
  let interior = null;
  if (!coarse) {
    interior = model.cabin(K, amb); interior.group.add(interior.wheel); group.add(interior.group);
    // Door cards ride on the doors (their pivots sit at the hinges), or stay in the cabin.
    for (const [k, g] of Object.entries(interior.doors || {})) {
      const d = extra.doors?.[k];
      if (d) { g.position.set(-d.hinge.x, -d.hinge.y, -d.hinge.z); d.pivot.add(g); } else interior.group.add(g);
    }
  }
  const dims = {...K.dims, exhausts: extra.exhausts, signals: extra.signals};
  const signals = K.signals.left.length ? K.signals : null;
  return {group, doors: extra.doors || null, wheels, wheelsSpec, mats, paint: mats.paint, head: mats.head, tail: mats.tail, reverse: mats.reverse, grille: mats.grille, glass: mats.glass, dims, signals, ambient: amb, interior, model, radius, mass: model.mass, _K: K};
}

/** Rebuild a body's cabin with a trim spec (2026-10-02 interior options:
 *  colours, seats, dash finish, roll cage, centre screen). Returns the new
 *  interior, or null if this body has none. */
export function rebuildCabin(body, trim = {}) {
  const old = body.interior;
  if (!old || !body.model.cabin || !body._K) return null;
  const drop = o => { if (!o) return; o.parent?.remove(o); o.traverse(m => { if (m.isMesh) { m.geometry.dispose(); m.material.map?.dispose?.(); } }); };
  drop(old.group); for (const g of Object.values(old.doors || {})) drop(g);
  const interior = body.model.cabin(body._K, body.ambient, trim);
  interior.group.add(interior.wheel); body.group.add(interior.group);
  for (const [k, g] of Object.entries(interior.doors || {})) {
    const d = body.doors?.[k];
    if (d) { g.position.set(-d.hinge.x, -d.hinge.y, -d.hinge.z); d.pivot.add(g); } else interior.group.add(g);
  }
  body.interior = interior;
  return interior;
}
