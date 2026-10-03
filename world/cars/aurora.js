/* AURORA — the carbon hypercar from Peter's board (2026-09-28, detail pass 2026-09-29).
 *
 * Outside: fender humps over a low nose; headlamps built like real ones (a gloss
 * black cavity, three projector modules with chrome rings, a light-guide LED
 * brow that hooks round the corner, a sequential amber indicator, all under a
 * clear lens that meets the paint at its edges); a fascia of bevelled frames,
 * honeycomb and fins; a splitter with a blue edge; canards; teardrop mirrors on
 * aerofoil stalks with sequential repeaters; roof scoop and spine fin;
 * louvred engine cover; a two-element wing on swan necks with a Gurney flap and
 * bolted pylons; a light-guide tail blade with hooked ends, sequential
 * indicators and reversing lamps; titanium exhausts in a mesh tail; a diffuser.
 *
 * Inside: a carbon tub with a sculpted dash (alcantara top, driver hump over a
 * floating cluster), jet vents, a floating centre screen, a bridge console with
 * guarded toggles, a start button and a drive-mode rotary; sculpted door cards
 * with speakers and pull straps; bucket seats with harnesses; drilled pedals;
 * an overhead switch panel; and the blue light sweep across it all.
 */
import * as T from 'three';
import {shutLines, gap, step, abs} from '../carBody.js';
import {Cabin, steeringWheel, clusterScreen, headlinerGeometry, prism} from '../carInterior.js';
import {place, roundPoly, superLoop, softBox, loftSolid, sweep, ribbon, resample, ring, lathe} from '../carKit.js';

const SIDES = [1, -1];
const range = (a, b, n) => Array.from({length: n + 1}, (_, i) => a + (b - a) * i / n);
/** Points along the skin between z0 and z1 at t(z), `lift` proud. */
const skinLine = (K, z0, z1, t, s, lift, n = 24) => range(z0, z1, n).map(z => K.onSkin(z, typeof t === 'function' ? t(z) : t, s, lift));
/** A flat LED light-guide profile: h thick (along the skin normal), w wide. */
const guide = (w, h) => () => superLoop(h, w, 5, 14);
/** Orient a geometry built along +x so +x points along n, then move it to p. */
const along = (g, p, n) => g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...p), new T.Quaternion().setFromUnitVectors(new T.Vector3(1, 0, 0), new T.Vector3(...n).normalize()), new T.Vector3(1, 1, 1)));

export function auroraSpec({zf, zr}) {
  // Matches tools/blender/aurora_shape.py (the GLB body); the cabin is placed from these curves.
  const Z0 = zr - .78, Z1 = zf + 1.12, GZ1 = zf - .43, GZ0 = zr + .26;
  return {
    Z0, Z1, archFlat: 1,
    halfW: [[Z0, .87], [Z0 + .1, 1.01], [-1.85, 1.08], [zr, 1.105], [-1, 1.065], [-.72, .98], [-.45, .915], [.35, .905], [.62, .94], [1, 1.02], [zf - .1, 1.07], [1.6, 1.065], [1.9, 1.01], [2.1, .95], [2.3, .84], [Z1 - .08, .7], [Z1, .6]],
    belt: [[Z0, .74], [Z0 + .1, .83], [-1.85, .865], [-1.6, .9], [zr, .925], [-1.1, .9], [-.8, .86], [-.5, .8], [.3, .775], [.66, .805], [1, .855], [zf, .86], [1.65, .82], [1.85, .745], [2.05, .615], [Z1 - .1, .5], [Z1, .44]],
    deck: [[Z0, .8], [Z0 + .1, .93], [-1.95, .995], [-1.6, 1.015], [GZ0, 1.035], [0, .9], [GZ1, .87], [1.25, .8], [1.45, .78], [1.65, .74], [1.85, .69], [2.05, .61], [2.25, .52], [Z1 - .1, .45], [Z1, .42]],
    sill: [[Z0, .24], [Z0 + .2, .2], [Z0 + .45, .165], [-1, .15], [1.95, .15], [Z1 - .3, .16], [Z1, .17]],
    // A crisp shoulder: two close points make the highlight break sharply over the fender crest.
    section: (z, w, s, b, d, lift) => [[w * .96, s], [w * .995, s + .3 * (b - s) + lift * .1], [w, b - .1], [w * .975, b - .03], [w * .952, b - .008], [w * .93, b - .001], [w * .8, b - .02], [w * .6, Math.min(d - .01, b - .08)], [w * .3, d + .005], [0, d + .012]],
    green: {
      GZ0, GZ1, sideCols: 2,
      roof: [[GZ0, 1.05], [-.85, 1.09], [-.45, 1.147], [-.15, 1.168], [.15, 1.162], [.4, 1.13], [.6, 1.06], [.8, .97], [GZ1, .88]],
      gw: (z, h) => Math.min(.77, h * .85), rw: (z, h) => Math.min(.48, h * .53),
      shape: (z, w0, w1, base, top) => [[w0, base], [w0 * .93 + w1 * .07, base + (top - base) * .5], [w1 + .05, top - .035], [w1 * .6, top - .004], [0, top + .006]],
      glass: (z, side) => side ? z > GZ0 + .45 && z < GZ1 - .08 : z > .22 || z < -.8,
    },
  };
}

export function auroraBody(K, M, amb, coarse) {
  const {Z0, Z1, zf, zr, R, halfW, belt, deck, roof, patch, add, skinPoint, skinNormal, onSkin, signal, GZ0, GZ1} = K;
  const doorF = GZ1 - .06, doorR = zr + .47;
  shutLines(M.paint, P => {
    const ax = abs(P.x), side = step(.6, ax).mul(step(P.y, belt(0) - .02)).mul(step(.3, P.y));
    return gap(P.z, doorF).add(gap(P.z, doorR)).mul(side)
      .add(gap(P.z, zf - .5).mul(step(ax, .56)).mul(step(deck(zf) - .08, P.y)))
      .add(gap(ax, .56).mul(step(zf - .5, P.z)).mul(step(P.z, Z1 - .2)).mul(step(deck(zf) - .08, P.y)));
  });
  const poly = (pts, m, dz, r = .012, bevel = .003, z = Z1 + .002) => add(place(prism(roundPoly(pts, r, 3), dz, 'z', bevel), 0, 0, z + dz / 2), m);

  for (const s of SIDES) {
    /* ---- headlamp */
    const hz0 = Z1 - .6, hz1 = Z1 - .05, span = hz1 - hz0, k = z => (z - hz0) / span;
    const tA = z => .45 + k(z) * .05, tB = z => .66 - k(z) * .03, n0 = skinNormal(hz0, tA(hz0), s);
    add(patch(hz0, hz1, tA, tB, .0015, s, 18, 8), M.gloss);                                                         // cavity
    add(patch(hz0 + span * .16, hz0 + span * .8, z => tA(z) + .035, z => tB(z) - .035, .004, s, 12, 4), M.satin);    // reflector band
    if (!coarse) for (const f of [.26, .45, .64]) {
      // Projector: a satin barrel, a chrome ring, a crystal lens that lights up.
      // Projectors look down the road: mostly forward, tipped a little with the surface.
      const z = hz0 + span * f, t = (tA(z) + tB(z)) / 2, p = skinPoint(z, t, s), sn = skinNormal(z, t, s), n = [sn[0] * .35, sn[1] * .35, 1];
      add(along(lathe([[.001, 0], [.017, 0], [.0185, .004], [.0185, .014], [.0165, .016]], 28), p, n), M.satin);
      add(along(new T.TorusGeometry(.0172, .0018, 6, 28).rotateY(Math.PI / 2).translate(.0165, 0, 0), p, n), M.chrome);
      add(along(lathe([[.0155, .0155], [.011, .019], [.001, .0205]], 24), p, n), M.head);
    }
    // LED brow: a light guide along the lamp's outer edge that hooks across its front.
    const brow = [...skinLine(K, hz0 + .03, hz1 - .035, z => tA(z) + .013, s, .009, 20), onSkin(hz1 - .024, tA(hz1) + .05, s, .009), onSkin(hz1 - .022, tB(hz1) - .02, s, .009)];
    add(sweep(resample(brow, 70), guide(.0034, .0026), {up: n0}), M.head);
    // The fang: a second guide low on the bumper corner.
    add(sweep(resample(skinLine(K, Z1 - .32, Z1 - .03, z => .3 + (z - Z1 + .32) * .35, s, .006, 12), 40), guide(.003, .0022), {up: skinNormal(Z1 - .2, .34, s)}), M.head);
    // Sequential indicator along the lamp's inner edge (sweeps outward and back).
    signal(s, sweep(resample(skinLine(K, hz0 + span * .28, hz1 - .05, z => tB(z) - .012, s, .008, 14), 40), guide(.0032, .0024), {up: skinNormal(hz0 + span * .5, tB(hz0 + span * .5), s)}), [s, 0, -.6]);
    // The lens: clear, meeting the paint at its edges.
    add(patch(hz0 - .006, hz1 + .004, z => tA(z) - .007, z => tB(z) + .007, (u, v) => .02 * Math.min(1, 7 * Math.min(u, 1 - u), 7 * Math.min(v, 1 - v)) ** .5, s, 22, 10), M.lamp);

    /* ---- bonnet, fenders, flanks */
    if (!coarse) for (let i = 0; i < 5; i++) { const z = zf - .12 + i * .075; add(patch(z - .011, z + .011, .52, .62, (u, v) => .012 * Math.sin(Math.PI * v) ** .3, s, 1, 6), M.carbon); }
    add(patch(zf - .16, zf + .22, .515, .625, .003, s, 6, 4), M.honey);
    add(patch(zf - .28, zf + .32, .73, .84, .003, s, 10, 4), M.vent);
    add(patch(Z1 - .5, Z1 - .22, .76, .9, .003, s, 6, 3), M.honey);
    add(patch(zf - .5, Z1 - .12, .86, 1, .0025, s, 14, 3), M.carbon);
    const sz0 = zf - R - .06, sz1 = zr + R + .06;
    add(patch(sz1, sz0, 0, .19, .004, s, 22, 4), M.carbon);
    add(patch(sz1 + .04, sz0 - .02, .03, .036, .007, s, 22, 1), M.accent);
    // Sill blade: a bevelled carbon aerofoil with an upturned end plate.
    add(place(prism(roundPoly([[sz1 + .05, 0], [sz0 - .05, 0], [sz0 - .02, .012], [sz1 + .1, .014]], .006, 2), .07, 'x', .003), s * (halfW(0) * .96 + .02), .19, 0), M.carbon);
    add(place(prism(roundPoly([[sz0 - .02, 0], [sz0 + .05, .07], [sz0 + .02, .075], [sz0 - .07, .01]], .008, 2), .008, 'x', .002), s * (halfW(0) * .96 + .05), .19, 0), M.carbon);
    const iz0 = zr + .42, iz1 = zr + 1.02;
    add(patch(iz0, iz1, z => .2 + (z - iz0) * .05, z => .6 - (iz1 - z) * .22, .003, s, 10, 6), M.honey);
    for (let i = 1; i <= 4; i++) { const z = iz0 + (iz1 - iz0) * i / 5; add(patch(z - .006, z + .006, .2, .58 - (iz1 - z) * .22, (u, v) => .026 * Math.sin(Math.PI * u) ** .2, s, 2, 6), M.carbon); }
    add(patch(iz0 - .02, iz1 + .02, .6, .62, (u, v) => .012 * Math.sin(Math.PI * v) ** .4, s, 12, 3), M.carbon);
    for (let i = 0; i < 3; i++) { const z = zr - .5 - i * .07; add(patch(z - .006, z + .006, .3, .46 - i * .03, (u, v) => .016 * Math.sin(Math.PI * u) ** .3, s, 2, 5), M.carbon); }
    // Canards: two rounded carbon blades on each front corner.
    for (const [cz, cy, L] of [[Z1 - .3, .34, .2], [Z1 - .2, .25, .16]]) {
      const x = s * (halfW(cz) - .015);
      add(place(prism(roundPoly([[0, -L / 2], [.075, -L / 2 + .03], [.07, L / 2 - .01], [0, L / 2]], .012, 3), .006, 'y', .002), x, cy, cz, 0, s > 0 ? .22 : Math.PI - .22, s * -.1), M.carbon);
    }
    /* ---- mirror: teardrop pod on an aerofoil stalk, with a sequential repeater */
    const mz = GZ1 - .3, base = skinPoint(mz, .44, s), pod = [base[0] + s * .21, base[1] + .12, mz - .04];
    add(sweep(resample([[base[0] - s * .01, base[1] - .01, mz + .02], [base[0] + s * .1, base[1] + .07, mz], [pod[0] - s * .03, pod[1] - .02, pod[2] + .01]], 20), t => ring(.007, .022 * (1 - t * .35), 12), {up: [0, 0, 1]}), M.carbon);
    const podPath = range(.11, -.1, 24).map(dz => [pod[0], pod[1], pod[2] + dz]);
    add(sweep(podPath, t => { const f = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** .55 * (1 - Math.max(0, t - .87) * 5.5); return superLoop(.034 * Math.max(.04, f), .062 * Math.max(.04, f), 3.2, 24); }, {up: [0, 1, 0]}), M.paint);
    add(place(prism(roundPoly([[-.05, -.022], [.05, -.022], [.052, .02], [-.05, .025]], .014, 4), .004, 'z', .001), pod[0], pod[1] + .002, pod[2] - .085), M.gloss);
    add(place(prism(roundPoly([[-.045, -.018], [.045, -.018], [.047, .016], [-.045, .021]], .012, 4), .003, 'z'), pod[0], pod[1] + .002, pod[2] - .0885), M.mirror);
    signal(s, sweep(resample([[pod[0] - s * .02, pod[1] - .028, pod[2] + .08], [pod[0] + s * .04, pod[1] - .02, pod[2] + .02], [pod[0] + s * .058, pod[1] - .004, pod[2] - .04]], 16), guide(.0025, .002), {up: [0, -1, 0]}), [s, 0, -1]);
  }

  /* ---- front fascia */
  poly([[-.36, .2], [.36, .2], [.3, .36], [.06, .41], [-.06, .41], [-.3, .36]], M.gloss, .012, .02);
  poly([[-.33, .215], [.33, .215], [.28, .345], [.05, .39], [-.05, .39], [-.28, .345]], M.honey, .018, .015, 0);
  add(place(prism(roundPoly([[-.08, .445], [.08, .445], [.05, .38], [0, .357], [-.05, .38]], .01, 3), .06, 'z', .006), 0, 0, Z1 - .012), M.carbon);   // beak
  for (const s of SIDES) {
    const xs = x => s * x;
    poly([[xs(.4), .19], [xs(.6), .2], [xs(.6), .3], [xs(.52), .4], [xs(.4), .33]], M.gloss, .012, .016);
    poly([[xs(.415), .205], [xs(.585), .213], [xs(.585), .293], [xs(.515), .38], [xs(.415), .32]], M.honey, .018, .012, 0);
    for (let i = 0; i < 3; i++) add(place(softBox(.005, .15, .05, .002, 3), s * (.45 + i * .045), .28, Z1 + .02), M.carbon);
  }
  // Splitter: a bevelled carbon plate, a blue edge, two fences under the nose.
  const splitPlan = [], NS = 24;
  for (let i = 0; i <= NS; i++) { const u = i / NS * 2 - 1; splitPlan.push([u * 1.0, Z1 + .13 - Math.pow(Math.abs(u), 3) * .42]); }
  for (let i = NS; i >= 0; i--) { const u = i / NS * 2 - 1; splitPlan.push([u * .92, Z1 - .2 - Math.abs(u) * .15]); }
  add(place(prism(splitPlan, .022, 'y', .004), 0, .13, 0), M.carbon);
  if (!coarse) add(sweep(resample(splitPlan.slice(0, NS + 1).map(([x, z]) => [x, .142, z + .006]), 90), () => ring(.0045, .006, 8), {up: [0, 1, 0]}), M.accent);
  for (const x of [-.36, .36]) add(place(prism(roundPoly([[Z1 + .12, .14], [Z1 - .25, .14], [Z1 - .25, .19], [Z1 - .02, .19]], .01, 2), .01, 'x', .002), x, 0, 0), M.carbon);
  // The emblem: a stylised mountain "A" in chrome on the nose and the tail.
  const emblem = (p, rx) => {
    for (const sx of [-1, 1]) add(place(prism(roundPoly([[0, .024], [sx * .006, .024], [sx * .026, -.022], [sx * .018, -.022]], .002, 2), .004, 'z', .001), p[0], p[1], p[2], rx), M.chrome);
    add(place(prism(roundPoly([[-.012, -.004], [.012, -.004], [.009, .0], [-.009, 0]], .001, 1), .004, 'z', .001), p[0], p[1], p[2], rx), M.chrome);
  };
  emblem([0, .505, Z1 - .05], -Math.PI / 2 + .45);

  /* ---- roof scoop and the spine fin */
  {
    const top = [], bot = [];
    for (let i = 0; i <= 14; i++) { const z = .16 - i / 14 * 1.0, h = Math.min(1, i / 2.4) * (.085 - i / 14 * .03); top.push([z, roof(z) + h]); bot.push([z, roof(z) - .004]); }
    add(prism([...top, ...bot.reverse()], .3, 'x', .012), M.carbon);
    add(place(prism(roundPoly([[-.125, 0], [.125, 0], [.125, .055], [-.125, .055]], .012, 3), .01, 'z'), 0, roof(.14) + .008, .14), M.black);
    add(place(prism(roundPoly([[-.115, .006], [.115, .006], [.115, .05], [-.115, .05]], .01, 3), .004, 'z'), 0, roof(.14) + .008, .15), M.honey);
    const fin = [], fz0 = -.84, fz1 = Z0 + .08;
    for (let i = 0; i <= 14; i++) { const z = fz0 + (fz1 - fz0) * i / 14; fin.push([z, Math.max(roof(Math.max(z, GZ0)), deck(z)) + .055 + (1 - i / 14) * .01]); }
    for (let i = 14; i >= 0; i--) { const z = fz0 + (fz1 - fz0) * i / 14; fin.push([z, Math.max(roof(Math.max(z, GZ0)), deck(z)) - .03]); }
    add(prism(fin, .012, 'x', .003), M.carbon);
  }
  for (const s of SIDES) {
    add(patch(Z0 + .55, GZ0 - .05, .78, .985, .002, s, 8, 4), M.honey);
    if (!coarse) for (let i = 0; i < 7; i++) { const z = GZ0 - .1 - i * .1; add(patch(z - .02, z + .02, .78, .98, (u, v) => .018 * Math.sin(Math.PI * u) ** .35, s, 3, 5), M.carbon); }
  }
  // A single wiper parked at the base of the windshield.
  if (!coarse) {
    const wy = K.gBase(GZ1) + .012;
    add(sweep(resample([[-.42, wy + .004, GZ1 - .05], [0, wy, GZ1 - .035], [.3, wy - .002, GZ1 - .03]], 30), () => superLoop(.004, .009, 4, 10), {up: [0, 1, 0]}), M.black);
    add(place(lathe([[.012, 0], [.012, .012], [.006, .016]], 20), .34, wy - .01, GZ1 - .03, 0, 0, Math.PI / 2), M.black);
  }

  /* ---- wing: main plane and flap on swan necks, endplates, Gurney flap, bolts */
  {
    const foil = (c, t) => { const up = [], lo = []; for (let i = 0; i <= 16; i++) { const x = (1 - Math.cos(Math.PI * i / 16)) / 2, th = 5 * t * (.2969 * Math.sqrt(x) - .126 * x - .3516 * x * x + .2843 * x ** 3 - .1015 * x ** 4); up.push([-x * c, th * c + .06 * c * Math.sin(Math.PI * x)]); lo.push([-x * c, -th * c + .06 * c * Math.sin(Math.PI * x)]); } return [...up, ...lo.reverse().slice(1, -1)]; };
    const rot = (pts, a, dz, dy) => pts.map(([z, y]) => [z * Math.cos(a) - y * Math.sin(a) + dz, z * Math.sin(a) + y * Math.cos(a) + dy]);
    const wz = Z0 + .36, wy = 1.3, span = 1.96;
    add(prism(rot(foil(.36, .12), -.14, wz, wy), span, 'x'), M.carbon);
    add(prism(rot(foil(.13, .1), -.55, wz - .33, wy + .07), span - .02, 'x'), M.carbon);
    const te = rot([[-.13, 0]], -.55, wz - .33, wy + .07)[0];
    if (!coarse) add(place(softBox(span - .03, .018, .004, .0015, 4), 0, te[1] + .008, te[0] + .002), M.carbon);
    for (const s of SIDES) {
      add(place(prism(roundPoly([[wz + .08, wy - .1], [wz + .02, wy + .1], [wz - .5, wy + .17], [wz - .52, wy - .06], [wz - .2, wy - .16]], [.03, .03, .02, .03, .04], 3), .012, 'x', .003), s * (span / 2 + .006), 0, 0), M.carbon);
      if (!coarse) add(sweep(resample([[s * (span / 2 + .0135), wy - .08, wz + .045], [s * (span / 2 + .0135), wy + .08, wz + .005], [s * (span / 2 + .0135), wy + .15, wz - .48]], 40), () => ring(.0035, .0035, 6), {up: [1, 0, 0]}), M.accent);
      const px = s * .34, dz = -1.72, dy = deck(dz) - .02;
      add(place(prism(roundPoly([[dz, dy], [dz - .26, dy], [wz - .16, wy + .055], [wz - .04, wy + .07], [wz + .02, wy + .03], [wz - .1, wy + .01]], [.0, .0, .03, .02, .02, .05], 4), .022, 'x', .004), px, 0, 0), M.carbon);
      if (!coarse) for (const dzb of [-.03, -.1]) add(place(lathe([[.0075, 0], [.0075, .004], [.005, .006]], 6), px + s * .012, wy + .055, wz + dzb, 0, 0, s > 0 ? 0 : Math.PI), M.satin);
    }
  }

  /* ---- tail: light-guide blade with hooked ends, indicators, reversing lamps, exhausts, diffuser */
  const ty = belt(Z0 + .05) - .05, hw = halfW(Z0 + .03), tz = Z0 - .006;
  add(place(prism(roundPoly([[-hw * .9, .4], [hw * .9, .4], [hw * .93, .69], [-hw * .93, .69]], .03, 3), .01, 'z', .003), 0, 0, Z0 - .004), M.gloss);
  add(place(prism(roundPoly([[-hw * .84, .42], [hw * .84, .42], [hw * .87, .665], [-hw * .87, .665]], .025, 3), .012, 'z'), 0, 0, Z0 - .01), M.honey);
  add(place(softBox(hw * 1.92, .034, .022, .008, 6), 0, ty, Z0 - .002), M.redLens);
  const blade = [[-hw * .945, ty - .15, tz - .006], [-hw * .945, ty - .02, tz - .006], [-hw * .92, ty, tz - .008], [0, ty, tz - .01], [hw * .92, ty, tz - .008], [hw * .945, ty - .02, tz - .006], [hw * .945, ty - .15, tz - .006]];
  add(sweep(resample(blade, 140), () => superLoop(.0045, .0035, 5, 12), {up: [0, 0, -1]}), M.tail);
  for (const s of SIDES) {
    add(sweep(resample([[s * hw * .945, ty - .15, tz - .006], [s * hw * .9, ty - .152, tz - .006], [s * hw * .8, ty - .152, tz - .006]], 20), () => superLoop(.0045, .0035, 5, 12), {up: [0, 0, -1]}), M.tail);
    signal(s, sweep(resample([[s * hw * .79, ty - .152, tz - .007], [s * hw * .6, ty - .152, tz - .007]], 20), () => superLoop(.004, .0032, 5, 12), {up: [0, 0, -1]}), [s, 0, 0]);
    add(place(softBox(.07, .022, .01, .004, 4), s * .3, .47, Z0 - .014), M.reverse);
  }
  if (!coarse) add(place(softBox(.018, .014, .14, .004, 4), 0, deck(Z0 + .3) + .068, Z0 + .3), M.tail);
  emblem([0, .675, Z0 - .016], Math.PI);
  for (const x of [-.11, .11]) {
    // Titanium tips: a flared, rolled lip over a perforated baffle.
    add(place(lathe([[.052, .02], [.057, -.02], [.062, -.09], [.068, -.12], [.066, -.128], [.058, -.126], [.054, -.11]], 36), x, .5, Z0 + .01, 0, -Math.PI / 2, 0), M.ti);
    add(place(lathe([[.001, -.07], [.054, -.07], [.054, -.066]], 30), x, .5, Z0 + .01, 0, -Math.PI / 2, 0), M.honey);
  }
  add(place(softBox(1.56, .03, .5, .01, 4), 0, .15, Z0 + .22), M.carbon);
  for (let k = -3; k <= 3; k++) add(place(prism(roundPoly([[Z0 + .45, .15], [Z0 - .02, .15], [Z0 - .02, .38 - Math.abs(k) * .025], [Z0 + .2, .2]], [0, .004, .01, .02], 3), .012, 'x', .002), k * .22, 0, 0), M.carbon);

  return {exhausts: [[-.11, .5, Z0 - .12], [.11, .5, Z0 - .12]]};
}

/* ================================================================== cabin */
/** `trim` (2026-10-02, DWN Works interior): {leather, insert, stitch, finish
 *  carbon|alu|piano|paint, paint (body colour), seats bucket|comfort, cage
 *  none|half|full, cageColor, screen gmeter|nav}. Missing keys = factory. */
export function auroraCabin(K, amb, trim = {}) {
  if (trim.shell === 'race') return auroraRaceCabin(K, amb, trim);
  const {GZ0, GZ1, roof, gw} = K;
  const shade = (hex, k) => '#' + new T.Color(hex).multiplyScalar(k).getHexString();
  const leather = trim.leather || '#161618', stitch = trim.stitch || '#2448ff';
  const C = new Cabin(amb, {leather, leather2: trim.leather ? shade(leather, new T.Color(leather).getHSL({}).l > .5 ? .86 : 1.25) : '#222226',
    alcantara: trim.insert || '#19191c', stitch, thread: trim.stitch ? shade(stitch, 1.15) : '#3a64ff', floor: '#0e0f11', headliner: '#141416',
    finish: trim.finish || 'carbon', paint: trim.paint || '#2a2c30'});
  const W = .7, eye = [.36, .9, -.71];     // 2026-10-03: down and back a little, so the wheel sits at arm's length and the glass hides the body
  const xs = range(-W + .012, W - .012, 36);

  /* ---- tub: floor, mats, sills with scuff plates, footwell and rear bulkheads */
  C.soft('carbon', 0, .165, (GZ0 + .95) / 2, 1.38, .02, .95 - GZ0, .008);
  for (const x of [.36, -.36]) {
    C.soft('floor', x, .18, .5, .42, .012, .62, .02, {seg: 6});
    C.soft('alu', x + .04, .188, .55, .16, .004, .2, .004, {seg: 3});
  }
  for (const s of SIDES) {
    C.soft('carbon', s * .645, .27, -.35, .15, .2, 1.45, .035, {seg: 8, deform: (x, y, z) => [x, y + (y > 0 ? -Math.abs(z) * .03 : 0), z]});
    C.soft('alu', s * .64, .372, -.35, .11, .004, 1.1, .002, {seg: 3});
  }
  C.soft('carbon', 0, .32, .95, 1.36, .3, .05, .02);
  C.soft('carbon', 0, .58, GZ0 + .03, 1.36, .8, .05, .02);
  // The engine window: glass in a turned frame, a glimpse of the intake plenum behind.
  C.add(sweep(superLoop(.27, .07, 6, 40).map(([a, b]) => [a, .8 + b, GZ0 + .058]), () => ring(.006, .006, 8), {closed: true, up: [0, 0, 1]}), 'aluR');
  C.soft('glassDark', 0, .8, GZ0 + .058, .54, .14, .004, .002);

  /* ---- dash: a sculpted carbon body with a driver hump, an alcantara top, stitched lip */
  const dz = GZ1 - .012, dy = K.gBase(GZ1) - .016;
  const hump = x => Math.max(0, 1 - ((x - .36) / .24) ** 2) ** 1.5, hi = x => .8 + hump(x) * .045, lip = x => .165 - hump(x) * .045;
  C.add(loftSolid(xs, x => roundPoly([[dz, dy], [.5, hi(x) + .004], [lip(x) + .07, hi(x)], [lip(x), hi(x) - .03], [lip(x) - .022, .62], [.2, .5], [.42, .42], [dz, .42]], [0, .06, .04, .018, .03, .05, .03, 0], 5), (x, a, b) => [x, b, a]), 'carbon');
  C.add(loftSolid(xs, x => roundPoly([[dz - .01, dy + .003], [.5, hi(x) + .011], [lip(x) + .07, hi(x) + .007], [lip(x) - .002, hi(x) - .027], [lip(x) + .006, hi(x) - .033], [lip(x) + .075, hi(x) - .002], [.5, hi(x) + .003], [dz - .01, dy - .004]], [0, .05, .03, .006, .006, .03, .05, 0], 4), (x, a, b) => [x, b, a]), 'alcantara');
  C.stitch(xs.map(x => [x, hi(x) - .012, lip(x) - .004]), 'stitch2', .003);
  // A carbon wing across the passenger side, lit from under.
  C.add(loftSolid(range(-.62, -.08, 16), x => roundPoly([[.2, .61], [.08, .6], [.07, .585], [.2, .59]], .006, 3).map(([a, b]) => [a - (x + .35) ** 2 * .1, b]), (x, a, b) => [x, b, a]), 'carbon');
  // Cluster: the live tach in a piano-black bezel under the hump's hood.
  // Cluster: a wide screen standing proud of the dash face, under the hump's hood,
  // placed so the driver's eye clears the top of the yoke to see all of it.
  const cluster = clusterScreen(.3, .129); cluster.position.set(.36, .79, .088); cluster.rotation.x = -.22; C.mesh(cluster);
  C.soft('piano', .36, .79, .097, .325, .15, .016, .012, {rx: -.22});
  C.soft('carbon', .36, .872, .085, .36, .018, .08, .008, {rx: .08});
  // Floating centre screen on a turned stem; digital rear-view mirror at the header.
  C.soft('piano', 0, .77, .13, .27, .16, .014, .012, {rx: -.28});
  // The centre screen: a live G-meter (carFx draws it), or the old map.
  let screen = null;
  if (trim.screen === 'nav') C.add(place(new T.PlaneGeometry(.25, .14), 0, .77, .122, -.28, Math.PI, 0), 'screen');
  else { screen = clusterScreen(.25, .14); screen.position.set(0, .77, .122); screen.rotation.x = -.28; C.mesh(screen); }
  C.add(place(lathe([[.012, 0], [.012, .06]], 16), 0, .72, .16, 0, 0, Math.PI / 2), 'aluR');
  C.soft('piano', 0, roof(.2) - .07, .2, .2, .045, .015, .01, {rx: .15});
  C.add(place(lathe([[.007, 0], [.006, .04]], 12), 0, roof(.2) - .048, .205, 0, 0, Math.PI / 2), 'carbon');
  C.add(place(new T.PlaneGeometry(.185, .034), 0, roof(.2) - .07, .192, .15, Math.PI, 0), 'glassDark');      // the mirror's face: dark glass, not a map
  // Jet vents at each end and a pair either side of the screen.
  for (const s of SIDES) { C.jetVent(s * .6, .7, .145, .036); C.jetVent(s * .17, .69, .155, .026); }

  /* ---- bridge console: floats over a lit tray, carries the switchgear */
  const top = z => z > 0 ? .55 + (z / .15) * .06 : z > -.35 ? .55 - (-z / .35) * .08 : .47 - Math.min(1, (-z - .35) / .3) * .01;
  const bot = z => z > -.3 ? top(z) - .065 : Math.max(.2, top(z) - .065 - ((-z - .3) / .15) * .3);
  C.add(loftSolid(range(.16, -.98, 40), z => roundPoly([[-.13, bot(z)], [.13, bot(z)], [.125, top(z)], [-.125, top(z)]], [.02, .02, .025, .025], 4), (z, a, b) => [a, b, z]), 'carbon');
  C.soft('alcantara', 0, top(-.7) + .018, -.7, .22, .03, .45, .012, {deform: (x, y, z) => [x, y + (y > 0 ? (1 - (x / .11) ** 2) * .006 : 0), z]});
  C.stitch(range(-.9, -.5, 10).map(z => [.1, top(z) + .033, z]), 'stitch2', .003);
  C.stitch(range(-.9, -.5, 10).map(z => [-.1, top(z) + .033, z]), 'stitch2', .003);
  C.soft('carbon', 0, .23, -.08, .24, .02, .42, .008);
  // Toggles under guards, a start button with a red ring, a knurled drive-mode rotary, gear buttons.
  const tz = -.06, ty = top(tz) + .006;
  C.soft('piano', 0, ty, tz, .2, .008, .07, .003, {rx: -.12});
  for (let i = -2; i <= 2; i++) {
    C.add(place(lathe([[.001, 0], [.007, 0], [.006, .006], [.003, .008]], 16), i * .036, ty + .004, tz, 0, 0, Math.PI / 2), 'aluR');
    C.add(place(lathe([[.0022, 0], [.0022, .026], [.0035, .03], [.001, .033]], 10), i * .036, ty + .01, tz - .002, -.35, 0, Math.PI / 2), 'chrome');
    if (i !== 2) C.add(sweep(resample([[i * .036 + .018, ty + .004, tz + .02], [i * .036 + .018, ty + .03, tz], [i * .036 + .018, ty + .004, tz - .02]], 12), () => ring(.0018, .0018, 5)), 'aluR');
  }
  const sz = -.17, sy = top(sz) + .004;
  C.add(place(lathe([[.001, 0], [.024, 0], [.026, .005], [.022, .01], [.001, .011]], 32), 0, sy, sz, 0, 0, Math.PI / 2), 'aluR');
  C.add(place(lathe([[.001, .009], [.018, .009], [.017, .014], [.001, .016]], 32), 0, sy, sz, 0, 0, Math.PI / 2), '#b1121c');
  C.add(place(new T.TorusGeometry(.0205, .0018, 6, 32), 0, sy + .0105, sz, Math.PI / 2), 'led');
  const rz = -.33, ry = top(rz) + .004;
  C.add(place(lathe([[.001, 0], [.034, 0], [.036, .004], [.036, .026], [.032, .03], [.001, .031]], 48), 0, ry, rz, 0, 0, Math.PI / 2), 'knurl');
  C.add(place(new T.TorusGeometry(.038, .0022, 6, 40), 0, ry + .002, rz, Math.PI / 2), 'ledB');
  C.soft('accent', 0, ry + .031, rz + .02, .004, .002, .018, .001);
  for (let i = -1; i <= 1; i++) C.soft('piano', .07 + i * 0, top(-.25) + .008, -.25 + i * .045, .045, .012, .034, .006);

  /* ---- doors: sculpted cards, armrest, speaker, pull strap, release, window switches */
  // Each card is its own cabin (sharing the materials and the light), so it can ride on its door.
  const Dc = {};
  for (const s of SIDES) {
    const Cd = Dc[s] = new Cabin(amb, {...C.P, _mats: C.m}, C.strips);
    const armEnv = z => Math.max(0, Math.min(1, (z + .95) / .15, (.0 - z) / .2));
    const card = z => roundPoly([[0, .26], [.025, .26], [.03, .44], [.03 + .055 * armEnv(z), .48], [.03 + .055 * armEnv(z), .53], [.03 + .02 * armEnv(z), .57], [.025, .72], [.04, .8], [0, .82]], [0, .01, .01, .015, .015, .015, .02, .01, 0], 3);
    Cd.add(loftSolid(range(.25, -1.05, 30), card, (z, a, b) => [s * (W + .045 - a), b, z]), 'carbon');
    Cd.soft('alcantara', s * (W + .012), .67, -.38, .012, .1, .88, .005, {deform: (x, y, z) => [x, y, z]});
    Cd.soft('alcantara', s * (W - .03), .535, -.45, .075, .022, .6, .01);
    Cd.stitch(range(-.73, -.17, 12).map(z => [s * (W - .066), .546, z]), 'stitch2', .003);
    Cd.add(place(lathe([[.001, 0], [.052, 0], [.056, .004], [.05, .008], [.001, .006]], 40), s * (W + .015), .38, -.05, 0, 0, s > 0 ? Math.PI : 0), 'speaker');
    Cd.add(place(new T.TorusGeometry(.056, .003, 6, 40), s * (W + .01), .38, -.05, 0, Math.PI / 2, 0), 'aluR');
    Cd.add(ribbon(resample([[s * (W + .005), .7, .05], [s * (W - .03), .67, -.02], [s * (W + .005), .64, -.1]], 20), .022, .003, [s, 0, 0]), 'accent');
    Cd.add(place(prism(roundPoly([[0, 0], [.07, .006], [.07, .016], [0, .014]], .004, 2), .012, 'x', .002), s * (W - .005), .72, .08), 'aluR');
    Cd.soft('piano', s * (W - .045), .55, -.16, .06, .008, .09, .004);
    for (const dzs of [-.02, .02]) C.soft('black', s * (W - .045), .557, -.16 + dzs, .03, .006, .022, .003);
  }

  /* ---- seats, pedals, column */
  const comfort = trim.seats === 'comfort';
  for (const x of [.36, -.36]) C.seat(comfort ? {x, y: .25, z: -.5, w: .54, style: 'lux', recline: .26, backH: .5, key: 'leather', insert: 'alcantara'}
    : {x, y: .25, z: -.5, w: .52, style: 'bucket', recline: .32, backH: .66, key: 'leather', insert: 'alcantara', harness: 'accent'});
  if (trim.cage === 'half' || trim.cage === 'full') rollCage(C, K, trim.cage === 'full', trim.cageColor || '#1c1d20');
  for (const [px, w, h] of [[.47, .055, .1], [.37, .085, .08], [.27, .065, .08]]) {
    C.soft('speaker', px, .3, .68, w, h, .012, .006, {rx: -.6});
    C.soft('rubber', px, .3 - h * .2, .675, w * .9, .012, .014, .004, {rx: -.6});
    C.add(place(lathe([[.006, 0], [.006, .16]], 10), px, .36, .76, 0, -Math.PI / 2 + .5, 0).rotateX(0), 'aluR');
  }
  C.soft('speaker', .56, .27, .66, .09, .16, .012, .01, {rx: -.7});
  C.add(place(lathe([[.045, 0], [.04, .12], [.03, .26]], 24), .36, .615, .01, 0, -Math.PI / 2 - .0, 0), 'carbon');

  /* ---- headliner, overhead switch panel, A-pillars */
  C.add(headlinerGeometry(roof, GZ0 + .3, .26, z => K.rw(z) + .01, .035, .07), 'headliner');
  // Overhead switch panel: over the gap between the seats, out of the driver's forward view.
  C.soft('carbon', 0, roof(-.62) - .05, -.62, .2, .028, .15, .012, {deform: (x, y, z) => [x * (y > 0 ? 1.15 : 1), y, z]});
  for (let i = -1; i <= 1; i++) C.add(place(lathe([[.0025, 0], [.0025, .018], [.004, .02]], 8), i * .045, roof(-.62) - .066, -.65, 0, 0, -Math.PI / 2), 'chrome');
  C.soft('#b1121c', .07, roof(-.62) - .068, -.59, .03, .006, .02, .002);
  // (No A-pillar trims: the canopy is glass all round the windshield.)

  /* ---- the light: across the dash lip into both doors, down the bridge, under it, footwells, overhead */
  C.strip(xs.map(x => [x, .64, lip(x) - .026]));
  for (const s of SIDES) {
    C.strip([[s * .69, .64, .12], [s * (W - .02), .63, .02]]);
    Dc[s].strip([[s * (W - .02), .63, .02], [s * (W + .005), .62, -.1], [s * (W + .005), .6, -.55], [s * (W + .005), .54, -1.0]]);
    C.strip(range(.14, -.9, 12).map(z => [s * .128, top(z) - .006, z]));
    C.strip([[s * .15, .43, .44], [s * .6, .43, .44]], .003);
  }
  C.strip([[-.1, .255, .1], [.1, .255, .1]], .0025);
  C.strip([[-.08, roof(-.62) - .066, -.7], [.08, roof(-.62) - .066, -.7]], .0025);
  // Out toward the dash and a little smaller (2026-10-03): from the seat the rim's top passes under the cluster.
  const wheel = steeringWheel(C, 'aero', {x: .36, y: .615, z: -.13, tilt: -.28, size: .9});
  return {group: C.finish(), wheel, cluster, clusterStyle: 'race', eye, screen, doors: {L: Dc[1].finish(), R: Dc[-1].finish()}};
}

/* =========================================================== race shell
 * The stripped interior (2026-10-03, Peter: "strip the interior, leave only the
 * carbon monocoque, the buttons, the ignition, no screens, an F1-style wheel,
 * full roll cage"). Bare carbon tub, sills and bulkheads; a flat matte dash beam
 * with no screens on it; a switch panel in the middle of the dash (guarded
 * toggles with labels, the ignition rotary, a red start button, the kill
 * switch and the extinguisher pull); carbon race shells with red six-point
 * harnesses; plain carbon door skins with pull loops; an extinguisher bottle
 * on the passenger floor; the full cage. The only display is on the wheel. */
function auroraRaceCabin(K, amb, trim) {
  const {GZ0, GZ1, roof} = K, belt = trim.stitch || '#d3191c';
  const C = new Cabin(amb, {leather: '#121214', leather2: '#18181a', alcantara: '#151517', stitch: belt, thread: belt, floor: '#0c0c0e', headliner: '#0d0d0f', finish: 'carbon'});
  const W = .7, eye = [.36, .9, -.71], xs = range(-W + .012, W - .012, 36);

  /* ---- the tub: bare carbon everywhere, riveted alu heel plates */
  C.soft('carbon', 0, .165, (GZ0 + .95) / 2, 1.38, .02, .95 - GZ0, .008);
  for (const x of [.36, -.36]) {
    C.soft('alu', x, .18, .52, .3, .005, .34, .002, {seg: 3});
    for (const [rx, rz] of [[-.13, .37], [.13, .37], [-.13, .67], [.13, .67]]) C.add(place(lathe([[.001, 0], [.005, 0], [.004, .003], [.001, .004]], 10), x + rx, .183, rz), 'aluR');
  }
  for (const s of SIDES) C.soft('carbonMatte', s * .645, .27, -.35, .15, .2, 1.45, .035, {seg: 8});
  C.soft('carbonMatte', 0, .32, .95, 1.36, .3, .05, .02);
  C.soft('carbonMatte', 0, .58, GZ0 + .03, 1.36, .8, .05, .02);
  C.add(sweep(superLoop(.27, .07, 6, 40).map(([a, b]) => [a, .8 + b, GZ0 + .058]), () => ring(.006, .006, 8), {closed: true, up: [0, 0, 1]}), 'aluR');
  C.soft('glassDark', 0, .8, GZ0 + .058, .54, .14, .004, .002);
  C.add(headlinerGeometry(roof, GZ0 + .3, .26, z => K.rw(z) + .01, .035, .07), 'carbonMatte');

  /* ---- dash: one flat carbon beam, matte on top so it never mirrors in the glass */
  const dz = GZ1 - .012, dy = K.gBase(GZ1) - .016;
  C.add(loftSolid(xs, () => roundPoly([[dz, dy], [.42, .785], [.22, .775], [.16, .75], [.15, .66], [.22, .5], [.42, .42], [dz, .42]], [0, .05, .03, .02, .03, .05, .03, 0], 4), (x, a, b) => [x, b, a]), 'carbonMatte');
  C.soft('carbon', 0, .755, .155, 1.3, .03, .02, .008);                     // the beam's gloss lip
  // A small mirror on the header (a race car still looks back).
  C.soft('carbonMatte', 0, roof(.2) - .065, .2, .17, .04, .012, .008, {rx: .15});
  C.add(place(new T.PlaneGeometry(.155, .03, 1, 1), 0, roof(.2) - .065, .193, .15, Math.PI, 0), 'glassDark');

  /* ---- the switch panel: in the middle of the dash, turned toward the driver */
  const pm = new T.Matrix4().compose(new T.Vector3(.07, .655, .14), new T.Quaternion().setFromEuler(new T.Euler(-.42, -.3, 0, 'YXZ')), new T.Vector3(1, 1, 1));
  const P = (g, key) => C.add(g.applyMatrix4(pm), key);
  P(prism(roundPoly([[-.15, .07], [.15, .07], [.15, -.07], [-.15, -.07]], .012, 3), .012, 'z', .003), 'carbon');
  P(place(prism(roundPoly([[-.142, .062], [.142, .062], [.142, -.062], [-.142, -.062]], .008, 3), .002, 'z'), 0, 0, -.0075), 'rubber');
  // Six guarded toggles, each with a white label strip and a status light.
  for (let i = 0; i < 6; i++) {
    const x = -.115 + i * .046, y = .028;
    P(place(lathe([[.001, 0], [.008, 0], [.007, .006], [.004, .008]], 16), x, y, -.009, -Math.PI / 2, 0, 0), 'aluR');
    P(place(lathe([[.0024, 0], [.0024, .024], [.0036, .028], [.001, .031]], 10), x, y, -.012, -Math.PI / 2 - .45, 0, 0), 'chrome');
    P(sweep(resample([[x + .013, y - .016, -.009], [x + .013, y, -.034], [x + .013, y + .016, -.009]], 12), () => ring(.0019, .0019, 5)), i === 0 ? '#c8141c' : 'aluR');
    P(sweep(resample([[x - .013, y - .016, -.009], [x - .013, y, -.034], [x - .013, y + .016, -.009]], 12), () => ring(.0019, .0019, 5)), i === 0 ? '#c8141c' : 'aluR');
    P(place(new T.PlaneGeometry(.03, .008), x, y + .028, -.0088, 0, Math.PI, 0), '#e8e8e2');
    P(place(softBox(.005, .005, .003, .0018, 2), x, y - .024, -.009), i < 2 ? 'ledG' : i < 4 ? 'led' : 'ledB');
  }
  // Bottom row: the ignition rotary, the big red START, the kill switch on its blue triangle, the extinguisher pull.
  const by = -.032;
  P(place(lathe([[.001, 0], [.017, 0], [.017, .006], [.014, .008], [.001, .009]], 28), -.105, by, -.009, -Math.PI / 2, 0, 0), 'aluR');
  P(place(softBox(.026, .008, .012, .003, 3), -.105, by, -.02, 0, 0, .7), '#1c1d20');
  P(place(new T.TorusGeometry(.021, .0018, 6, 28), -.105, by, -.009), 'ledW');
  P(place(lathe([[.001, 0], [.024, 0], [.026, .005], [.022, .01], [.001, .011]], 32), -.03, by, -.009, -Math.PI / 2, 0, 0), 'aluR');
  P(place(lathe([[.001, .009], [.019, .009], [.02, .016], [.016, .022], [.001, .024]], 32), -.03, by, -.009, -Math.PI / 2, 0, 0), '#c8141c');
  P(place(new T.TorusGeometry(.0215, .0018, 6, 32), -.03, by, -.0185), 'led');
  P(prism([[.025, by - .026], [.085, by - .026], [.055, by + .028]], .002, 'z'), '#1f47ff');
  P(place(lathe([[.001, 0], [.012, 0], [.012, .01], [.009, .014], [.001, .015]], 24), .055, by - .006, -.01, -Math.PI / 2, 0, 0), '#c8141c');
  P(place(softBox(.036, .008, .008, .003, 3), .055, by - .006, -.028), '#c8141c');
  P(place(softBox(.03, .006, .02, .003, 3), .118, by + .002, -.016), '#c8141c');
  P(place(lathe([[.0025, 0], [.0025, .02]], 8), .118, by + .002, -.009, -Math.PI / 2, 0, 0), 'aluR');

  /* ---- the extinguisher: a red bottle on the passenger floor, in alu straps */
  C.add(place(lathe([[.001, 0], [.045, 0], [.05, .01], [.05, .27], [.04, .3], [.012, .31], [.012, .34], [.001, .34]], 28), -.2, .25, .42, 0, 0, Math.PI / 2), '#c8141c');
  for (const x of [-.25, -.4]) C.add(place(new T.TorusGeometry(.052, .004, 6, 28), x, .25, .42, 0, Math.PI / 2, 0), 'aluR');
  C.add(place(lathe([[.001, 0], [.02, 0], [.02, .03], [.001, .03]], 16), -.555, .25, .42, 0, 0, Math.PI / 2), 'black');

  /* ---- doors: plain carbon skins, a red pull loop, the release */
  const Dc = {};
  for (const s of SIDES) {
    const Cd = Dc[s] = new Cabin(amb, {...C.P, _mats: C.m}, C.strips);
    const card = () => roundPoly([[0, .26], [.018, .26], [.022, .5], [.022, .74], [.03, .8], [0, .82]], [0, .008, .01, .01, .01, 0], 3);
    Cd.add(loftSolid(range(.25, -1.05, 24), card, (z, a, b) => [s * (W + .045 - a), b, z]), 'carbonMatte');
    Cd.add(sweep(resample([[s * (W + .02), .62, -.12], [s * (W - .03), .57, -.22], [s * (W + .02), .52, -.32]], 20), () => ring(.004, .014, 6), {up: [s, 0, 0]}), 'accent');
    Cd.add(place(prism(roundPoly([[0, 0], [.07, .006], [.07, .016], [0, .014]], .004, 2), .012, 'x', .002), s * (W - .002), .72, .08), 'aluR');
  }

  /* ---- race shells, six-point harnesses, pedals, the column */
  for (const x of [.36, -.36]) C.seat({x, y: .24, z: -.52, w: .5, style: 'bucket', recline: .28, backH: .72, key: 'alcantara', insert: 'alcantara', harness: 'accent'});
  for (const x of [.36, -.36]) for (const s of SIDES) C.add(ribbon(resample([[x + s * .05, .3, -.27], [x + s * .03, .28, -.36], [x + s * .015, .26, -.46]], 12), .036, .003, [0, 1, 0]), 'accent');   // crotch straps
  rollCage(C, K, true, trim.cageColor || '#1c1d20');
  for (const [px, w, h] of [[.47, .055, .1], [.37, .085, .08], [.27, .065, .08]]) {
    C.soft('alu', px, .3, .68, w, h, .01, .004, {rx: -.6});
    C.add(place(lathe([[.006, 0], [.006, .16]], 10), px, .36, .76, 0, -Math.PI / 2 + .5, 0), 'aluR');
  }
  C.add(place(lathe([[.04, 0], [.035, .12], [.028, .3]], 24), .36, .64, .01, 0, -Math.PI / 2, 0), 'carbonMatte');
  // Only a footwell light: a race car has no mood lighting.
  C.strip([[.6, .42, .4], [-.6, .42, .4]], .0025);
  const wheel = steeringWheel(C, 'f1', {x: .36, y: .64, z: -.16, tilt: -.14, size: 1.05});
  return {group: C.finish(), wheel, cluster: wheel.userData.display, clusterStyle: 'f1', eye, screen: null, doors: {L: Dc[1].finish(), R: Dc[-1].finish()}};
}

/** A bolted-in roll cage: the main hoop behind the seats with its diagonal and
 *  harness bar, X door bars; `full` adds roof rails and A-pillar bars down the
 *  windshield to the dash, and a header bar. Tubes keep inside the glass. */
function rollCage(C, K, full, color) {
  const {GZ0, GZ1, roof} = K, R = .021, key = color;
  const tube = (pts, n = 24) => C.add(sweep(resample(pts, n), () => ring(R, R, 10)), key);
  const zh = GZ0 + .11, top = roof(zh) - .075;
  tube([[-.62, .2, zh], [-.655, .55, zh], [-.64, .82, zh], [-.5, top - .04, zh], [-.3, top, zh], [0, top + .005, zh], [.3, top, zh], [.5, top - .04, zh], [.64, .82, zh], [.655, .55, zh], [.62, .2, zh]], 60);
  tube([[.62, .24, zh], [-.46, top - .03, zh]], 12);                                  // diagonal
  tube([[-.66, .74, zh + .01], [.66, .74, zh + .01]], 10);                            // harness bar
  for (const s of [-1, 1]) {
    C.add(place(new T.CylinderGeometry(.06, .06, .008, 16), s * .62, .17, zh), key);   // foot plates
    tube([[s * .645, .3, zh], [s * .645, .46, (zh + .35) / 2], [s * .64, .62, .35]], 16);   // door X
    tube([[s * .645, .62, zh], [s * .645, .46, (zh + .35) / 2], [s * .64, .3, .35]], 16);
    if (full) {
      const rail = [];
      for (let z = zh; z <= .62; z += .08) rail.push([s * .46, roof(z) - .085, z]);
      for (let z = .66; z <= .9; z += .06) rail.push([s * (.46 + (z - .62) * .55), roof(z) - .085 - (z - .62) * .2, z]);
      rail.push([s * .63, .7, .92]);
      tube(rail, 40);
    }
  }
  if (full) tube([[-.48, roof(.6) - .09, .6], [0, roof(.6) - .085, .6], [.48, roof(.6) - .09, .6]], 12);
}
