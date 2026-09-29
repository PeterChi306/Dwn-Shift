/* SOVEREIGN — the luxury saloon (2026-09-28, detail pass 2026-09-29).
 *
 * Outside: a crisp shoulder and a hollowed "waft line" on long flanks; a tall
 * Pantheon grille of polished vanes, lit from behind at night, under a
 * bevelled chrome surround and a winged mascot; slim lamp units with two
 * projectors, an L-shaped light guide and a sequential indicator; chrome
 * window frames and windscreen surround, a piano-black B-pillar, a hand-
 * painted coachline, polished pull handles, an umbrella in the door; vertical
 * tail lamps with light guides; a number plate; hidden chrome exhausts.
 *
 * Inside: a walnut fascia between chrome pinstripes; the Gallery (a glass
 * panel with a lit star field) across the passenger side; the live dial in a
 * turned bezel and an analogue clock that keeps the game's time; organ-stop
 * vents; a walnut console with a knurled controller; quilted armchairs with
 * piping, rear lounge seats with lambswool pillows and picnic tables; door
 * cards with speakers; lambswool carpets; and the starlight headliner.
 */
import * as T from 'three';
import {shutLines, gap, step, abs} from '../carBody.js';
import {Cabin, steeringWheel, clusterScreen, starHeadliner, prism, starArt} from '../carInterior.js';
import {place, roundPoly, superLoop, softBox, loftSolid, sweep, ribbon, resample, ring, lathe} from '../carKit.js';

const SIDES = [1, -1];
const range = (a, b, n) => Array.from({length: n + 1}, (_, i) => a + (b - a) * i / n);
const skinLine = (K, z0, z1, t, s, lift, n = 24) => range(z0, z1, n).map(z => K.onSkin(z, typeof t === 'function' ? t(z) : t, s, lift));
const guide = (w, h) => () => superLoop(h, w, 5, 14);

export function sovereignSpec({zf, zr}) {
  const Z0 = zr - 1.12, Z1 = zf + .98, GZ1 = .95, GZ0 = -1.78;
  return {
    Z0, Z1, archR: .52, floor: .28,
    halfW: [[Z0, .9], [Z0 + .16, .965], [zr, .985], [0, .99], [zf, .985], [Z1 - .25, .96], [Z1 - .05, .92], [Z1, .9]],
    belt: [[Z0, .9], [Z0 + .1, .96], [zr, .98], [0, .985], [zf, .995], [Z1 - .2, .985], [Z1, .92]],
    deck: [[Z0, .93], [Z0 + .12, 1.0], [Z0 + .7, 1.02], [GZ0, 1.03], [0, 1.03], [GZ1, 1.035], [zf, 1.035], [Z1 - .2, 1.025], [Z1, .96]],
    sill: [[Z0, .44], [Z0 + .3, .36], [0, .33], [Z1 - .3, .36], [Z1, .44]],
    // A hollow "waft line" low on the doors and a sharp shoulder above it.
    section: (z, w, s, b, d, lift) => [[w * .97, s], [w * .995, s + .18 * (b - s) + lift * .1], [w * .982, s + .36 * (b - s)], [w, s + .6 * (b - s)], [w, b - .1], [w * .996, b - .035], [w * .985, b - .012], [w * .968, b - .002], [w * .93, Math.max(b, d)], [w * .7, d + .012], [w * .35, d + .02], [0, d + .022]],
    green: {
      GZ0, GZ1, sideCols: 2,
      roof: [[GZ0, 1.035], [-1.45, 1.37], [-1.2, 1.52], [-.7, 1.58], [.2, 1.57], [.52, 1.47], [GZ1, 1.04]],
      gw: (z, h) => h * .87, rw: (z, h) => h * .72,
      shape: (z, w0, w1, base, top) => [[w0, base], [w0 * .97 + w1 * .03, base + (top - base) * .5], [w1 + .04, top - .03], [w1 * .6, top - .003], [0, top + .004]],
      glass: (z, side) => side ? z > GZ0 + .45 && z < GZ1 - .1 && Math.abs(z + .28) > .06 : z > .52 || z < -1.34,
    },
  };
}

/** A number plate texture: a fictional Los Santerra plate. */
function plateMaterial(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#f4f3ee'; g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#1b2a6b'; g.lineWidth = 10; g.strokeRect(8, 8, 496, 240);
  g.fillStyle = '#b3141c'; g.font = 'italic 600 44px Georgia, serif'; g.textAlign = 'center'; g.fillText('Los Santerra', 256, 62);
  g.fillStyle = '#1b2a6b'; g.font = '700 118px "Arial Narrow", Arial, sans-serif'; g.fillText(text, 256, 196);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
  return new T.MeshStandardMaterial({map: t, roughness: .35, metalness: .2});
}

export function sovereignBody(K, M, amb, coarse) {
  const {Z0, Z1, zf, zr, R, halfW, belt, deck, patch, add, skinPoint, onSkin, signal, tAt, GZ0, GZ1, gw, rw, gBase, roof} = K;
  const bz = -.28;
  shutLines(M.paint, P => {
    const ax = abs(P.x), side = step(.7, ax).mul(step(P.y, belt(0) - .02)).mul(step(.38, P.y));
    return gap(P.z, GZ1 - .02).add(gap(P.z, bz)).add(gap(P.z, GZ0 + .42)).mul(side)
      .add(gap(P.z, GZ1 + .05).mul(step(ax, .78)).mul(step(deck(zf) - .06, P.y)))
      .add(gap(P.z, GZ0 - .1).mul(step(ax, .8)).mul(step(deck(Z0 + .5) - .06, P.y)));
  });
  const fz = Z1 + .003, faceProfile = (pts, dz, m, r = .01, bevel = .002, z = fz) => add(place(prism(roundPoly(pts, r, 3), dz, 'z', bevel), 0, 0, z + dz / 2), m);

  /* ---- the Pantheon grille, lit from behind, and the mascot */
  const gy0 = .5, gy1 = deck(Z1 - .05) + .06, gwid = .6, gc = (gy0 + gy1) / 2, gh = gy1 - gy0;
  // Surround: four bevelled chrome bars proud of a dark, recessed backing.
  faceProfile([[-gwid / 2, gy0], [gwid / 2, gy0], [gwid / 2, gy1], [-gwid / 2, gy1]], .02, M.grille, .008, 0, fz);
  for (const sx of [-1, 1]) add(place(softBox(.05, gh + .09, .1, .016, 8), sx * (gwid / 2 + .022), gc - .005, fz + .05), M.chrome);
  add(place(softBox(gwid + .09, .045, .1, .016, 8), 0, gy0 - .025, fz + .05), M.chrome);
  for (let i = 0; i <= 16; i++) add(place(softBox(.009, gh - .012, .028, .003, 3), (i / 16 - .5) * (gwid - .03), gc - .005, fz + .11), M.chrome);
  add(place(softBox(gwid + .12, .04, .14, .014, 6), 0, gy1 + .05, Z1 - .01), M.chrome);
  add(place(softBox(gwid + .1, .025, .1, .01, 6), 0, gy0 - .055, fz + .05), M.chrome);
  if (!coarse) {
    // The mascot: a figure leaning into the wind, wings swept back, on a turned plinth.
    const my = gy1 + .07, mz = Z1 - .02;
    add(place(lathe([[.001, 0], [.022, 0], [.02, .012], [.012, .018], [.001, .02]], 28), 0, my, mz, 0, 0, Math.PI / 2), M.chrome);
    add(place(lathe([[.001, 0], [.009, .01], [.012, .035], [.009, .06], [.005, .075], [.007, .085], [.001, .095]], 18), 0, my + .015, mz, -.55, 0, Math.PI / 2), M.chrome);
    for (const sx of [-1, 1]) add(place(prism(roundPoly([[0, 0], [.012, .015], [.004, .07], [-.03, .09], [-.012, .03]], .006, 3), .0035, 'x', .001), sx * .012, my + .045, mz - .015, 0, sx * .25, 0), M.chrome);
  }

  for (const s of SIDES) {
    /* ---- lamp units on the front face: two projectors, an L light guide, a sequential indicator */
    const x0 = s * .44, x1 = s * .84, ly0 = .79, ly1 = .9, lc = (ly0 + ly1) / 2;
    const house = [[x0, ly0], [x1, ly0 + .01], [x1, ly1], [x0, ly1 - .015]].map(([x, y]) => [x, y]);
    faceProfile(s > 0 ? house : house.slice().reverse(), .012, M.gloss, .014, .003);
    add(sweep(resample(roundPoly(s > 0 ? house : house.slice().reverse(), .016, 4).map(([x, y]) => [x, y, fz + .015]), 80, true), () => ring(.0035, .0035, 8), {closed: true, up: [0, 0, 1]}), M.chrome);
    if (!coarse) for (const px of [.57, .72]) {
      const p = [s * px, lc + .005, fz + .012];
      add(place(lathe([[.001, 0], [.026, 0], [.028, .006], [.028, .014], [.024, .017]], 32), ...p, 0, -Math.PI / 2, 0), M.satin);
      add(place(new T.TorusGeometry(.027, .0028, 8, 32), p[0], p[1], p[2] + .016), M.chrome);
      add(place(lathe([[.023, .016], [.016, .021], [.001, .023]], 28), ...p, 0, -Math.PI / 2, 0), M.head);
    }
    add(sweep(resample([[s * .46, ly1 - .02, fz + .022], [s * .8, ly1 - .012, fz + .022], [s * .825, ly1 - .02, fz + .022], [s * .825, ly0 + .025, fz + .022]], 50), guide(.0035, .003), {up: [0, 0, 1]}), M.head);
    signal(s, sweep(resample([[s * .46, ly0 + .016, fz + .022], [s * .8, ly0 + .024, fz + .022]], 30), guide(.003, .0026), {up: [0, 0, 1]}), [s, 0, 0]);
    add(place(softBox(Math.abs(x1 - x0) - .01, ly1 - ly0 - .01, .012, .006, 6), s * .64, lc, fz + .03), M.lamp);
    // Fog lamps and the lower intake in chrome frames.
    add(place(lathe([[.001, 0], [.03, 0], [.034, .006], [.03, .012]], 28), s * .72, .52, fz, 0, -Math.PI / 2, 0), M.chrome);
    add(place(lathe([[.026, .01], [.001, .014]], 20), s * .72, .52, fz, 0, -Math.PI / 2, 0), M.lens);

    /* ---- flanks: coachline, chrome window frames, B-pillar, handles, umbrella, mirrors */
    const tShoulder = z => tAt(z, belt(z) - .028, 0, .7);
    if (!coarse) add(sweep(resample(skinLine(K, Z0 + .3, Z1 - .35, tShoulder, s, .0012, 40), 120), () => superLoop(.0006, .0016, 4, 6), {up: [s, 0, 0]}), M.accent);
    add(patch(Z0 + .3, Z1 - .35, .19, .2, .004, s, 30, 1), M.chrome);
    add(patch(zr + R + .05, zf - R - .05, 0, .03, .004, s, 18, 1), M.chrome);
    const dlo0 = GZ0 + .45, dlo1 = GZ1 - .1;
    add(sweep(resample(range(dlo0, dlo1, 20).map(z => [s * (gw(z) + .004), gBase(z) + .004, z]), 80), () => ring(.006, .006, 8), {up: [0, 1, 0]}), M.chrome);
    const topEdge = z => { const b = gBase(z), t = Math.max(b + .002, roof(z)); return [s * (rw(z) + .04 + .004), t - .03 + .002, z]; };
    add(sweep(resample(range(dlo0 + .05, dlo1 - .05, 24).map(topEdge), 90), () => ring(.005, .005, 8), {up: [0, 1, 0]}), M.chrome);
    for (const z of [dlo0 + .02, dlo1 - .02]) add(sweep(resample([[s * (gw(z) + .004), gBase(z) + .004, z], topEdge(z)], 12), () => ring(.005, .005, 8)), M.chrome);
    {
      const a = [s * (gw(bz) + .006), gBase(bz) + .004, bz], b = topEdge(bz);
      add(sweep(resample([a, b], 12), () => superLoop(.004, .055, 6, 12), {up: [s, 0, 0]}), M.gloss);
    }
    for (const z of [bz + .45, bz - .42]) {
      const t = tAt(z, .83, 0, .7), p = onSkin(z, t, s, .012);
      add(place(softBox(.024, .026, .19, .012, 6, (x, y, zz) => [x + s * (1 - (zz / .095) ** 2) * .006, y, zz]), ...p), M.chrome);
    }
    if (!coarse) { const p = onSkin(GZ1 - .03, tAt(GZ1 - .03, .74, 0, .7), s, .002); add(place(lathe([[.001, 0], [.017, 0], [.018, .004], [.012, .008]], 20), ...p, 0, 0, s > 0 ? 0 : Math.PI), M.chrome); }
    const mz = GZ1 - .22, base = skinPoint(mz, .43, s), pod = [base[0] + s * .16, base[1] + .1, mz - .02];
    add(sweep(resample([[base[0], base[1] - .005, mz + .02], [base[0] + s * .08, base[1] + .06, mz + .005], [pod[0] - s * .04, pod[1] - .02, pod[2]]], 16), t => ring(.012, .03 * (1 - t * .3), 12), {up: [0, 0, 1]}), M.paint);
    add(sweep(range(.1, -.1, 24).map(dz => [pod[0], pod[1], pod[2] + dz]), t => { const f = Math.sin(Math.PI * Math.min(1, t * 1.1)) ** .5 * (1 - Math.max(0, t - .88) * 6); return superLoop(.06 * Math.max(.05, f), .085 * Math.max(.05, f), 2.6, 24); }, {up: [0, 1, 0]}), M.paint);
    add(place(prism(roundPoly([[-.075, -.04], [.075, -.04], [.075, .04], [-.075, .04]], .035, 5), .004, 'z'), pod[0], pod[1], pod[2] - .088), M.mirror);
    signal(s, sweep(resample([[pod[0] - s * .04, pod[1] - .05, pod[2] + .07], [pod[0] + s * .05, pod[1] - .045, pod[2] + .03], [pod[0] + s * .08, pod[1] - .025, pod[2] - .03]], 16), guide(.0025, .002), {up: [0, -1, 0]}), [s, 0, -1]);

    /* ---- tail lamps: vertical units with light guides, indicator, reverse */
    const tx0 = s * .6, tx1 = s * .84, ty0 = .56, ty1 = .9, tz = Z0 - .003;
    const tl = [[tx0, ty0], [tx1, ty0], [tx1, ty1], [tx0, ty1]];
    add(place(prism(roundPoly(s > 0 ? tl : tl.slice().reverse(), .02, 4), .014, 'z', .003), 0, 0, tz - .007), M.redLens);
    add(sweep(resample(roundPoly([[tx0 + s * .025, ty0 + .12], [tx1 - s * .025, ty0 + .12], [tx1 - s * .025, ty1 - .025], [tx0 + s * .025, ty1 - .025]], .015, 4).map(([x, y]) => [x, y, tz - .016]), 70, true), guide(.004, .003), {closed: true, up: [0, 0, -1]}), M.tail);
    signal(s, sweep(resample([[tx0 + s * .03, ty0 + .075, tz - .016], [tx1 - s * .03, ty0 + .075, tz - .016]], 20), guide(.006, .003), {up: [0, 0, -1]}), [s, 0, 0]);
    add(place(softBox(.2, .026, .01, .005, 4), s * .72, ty0 + .035, tz - .016), M.reverse);
    add(sweep(resample(roundPoly(s > 0 ? tl : tl.slice().reverse(), .022, 4).map(([x, y]) => [x, y, tz - .015]), 70, true), () => ring(.003, .003, 6), {closed: true, up: [0, 0, 1]}), M.chrome);
  }
  // Windscreen surround in chrome.
  add(sweep(resample(range(-1, 1, 20).map(u => [u * (gw(GZ1 - .01) - .01), gBase(GZ1 - .01) + .006, GZ1 - .012]), 60), () => ring(.006, .006, 8), {up: [0, 1, 0]}), M.chrome);
  // Lower intake, bumper blades, boot trim, monogram, plates, exhausts.
  faceProfile([[-.5, .46], [.5, .46], [.52, .57], [-.52, .57]], .006, M.chrome, .02, .002);
  faceProfile([[-.48, .47], [.48, .47], [.5, .56], [-.5, .56]], .012, M.honey, .016, 0, fz + .006);
  add(place(softBox(1.5, .025, .045, .01, 4), 0, .41, Z1 + .005), M.chrome);
  add(place(softBox(1.5, .025, .045, .01, 4), 0, .43, Z0 - .006), M.chrome);
  add(place(softBox(1.2, .022, .02, .008, 4), 0, deck(Z0 + .04) - .06, Z0 - .003), M.chrome);
  if (!coarse) {
    const mono = (x, y, z, ry) => {
      add(place(new T.CircleGeometry(.032, 40), x, y, z, 0, ry, 0), M.gloss);
      for (const k of [-1, 1]) add(place(new T.TorusGeometry(.011, .0022, 6, 24, Math.PI * 1.25).rotateZ(k > 0 ? Math.PI * .25 : -Math.PI * .75), x, y + k * .0055, z + (ry ? -.002 : .002)), M.chrome);
    };
    mono(0, deck(Z0 + .04) - .12, Z0 - .006, Math.PI);
    const plate = plateMaterial('7 SVRN 01');
    add(place(softBox(.53, .135, .012, .006, 4), 0, .63, Z0 - .01), M.gloss);
    const pr = new T.Mesh(new T.PlaneGeometry(.52, .125).rotateY(Math.PI), plate); pr.position.set(0, .63, Z0 - .017); K.group.add(pr);
    const pf = new T.Mesh(new T.PlaneGeometry(.52, .125), plate); pf.position.set(0, .34, Z1 + .03); K.group.add(pf);
    add(place(softBox(.53, .135, .012, .006, 4), 0, .34, Z1 + .022), M.gloss);
  }
  for (const x of [-.5, .5]) {
    add(place(softBox(.24, .065, .07, .03, 6), x, .3, Z0 + .01), M.chrome);
    add(place(softBox(.2, .035, .02, .016, 6), x, .3, Z0 - .026), M.black);
  }
  return {exhausts: [[-.5, .3, Z0 - .06], [.5, .3, Z0 - .06]]};
}

/* ================================================================== cabin */
export function sovereignCabin(K, amb) {
  const {GZ0, GZ1, roof, gw} = K;
  const C = new Cabin(amb, {leather: '#dcd0b9', leather2: '#1c2233', alcantara: '#20242f', stitch: '#1c2233', thread: '#1c2233', floor: '#d9ceb8', headliner: '#10111a', woodDark: '#241006', woodLight: '#8a4a22', enamel: '#f4efe2'});
  const W = .84, eye = [.4, 1.2, -.12], xs = range(-W + .01, W - .01, 40);

  /* ---- floor: lambswool carpet, mats with leather piping */
  C.soft('floor', 0, .3, (GZ0 + 1.1) / 2, 1.66, .04, 1.1 - GZ0, .02, {seg: 6});
  for (const [x, z, d] of [[.4, .62, .55], [-.4, .62, .55], [.4, -.72, .55], [-.4, -.72, .55]]) {
    C.soft('floor', x, .33, z, .5, .025, d, .03, {seg: 6});
    C.piping(superLoop(.25, d / 2, 6, 40).map(([a, b]) => [x + a, .345, z + b]), 'leather2', .006, true);
  }

  /* ---- dash: navy leather, a walnut fascia between chrome pinstripes, the Gallery */
  const dz = GZ1 - .02, dy = K.gBase(GZ1) - .01;
  C.add(loftSolid(xs, x => roundPoly([[dz, dy], [.62, 1.048], [.46, 1.04], [.415, 1.0], [.415, .82], [.5, .64], [dz, .62]], [0, .08, .03, .015, .02, .05, 0], 5), (x, a, b) => [x, b, a]), 'leather2');
  C.stitch(xs.map(x => [x, 1.028, .438]), 'stitch', .003);
  C.add(loftSolid(xs, () => roundPoly([[.414, .985], [.404, .98], [.404, .84], [.414, .835]], .003, 2), (x, a, b) => [x, b, a]), 'wood');
  for (const y of [.989, .831]) C.add(sweep(resample(xs.map(x => [x, y, .41]), 90), () => ring(.0025, .0025, 6), {up: [0, 1, 0]}), 'chrome');
  // The Gallery: a glass panel over a lit star field across the passenger side.
  C.mesh(starArt(amb, .64, .1, [-.43, .93, .399]));
  C.soft('glassDark', -.43, .93, .401, .66, .115, .003, .002);
  C.add(sweep(resample(roundPoly([[-.76, .87], [-.1, .87], [-.1, .99], [-.76, .99]], .01, 3).map(([x, y]) => [x, y, .401]), 60, true), () => ring(.003, .003, 6), {closed: true, up: [0, 0, 1]}), 'chrome');
  // The live dial in a turned bezel.
  // The instruments ride high in a leather binnacle on the dash top, where the
  // eye sees them through the upper half of the wheel, clear of the hub.
  const ky = 1.012;
  const cluster = clusterScreen(.33, .142); cluster.position.set(.4, ky, .382); cluster.rotation.x = -.12; C.mesh(cluster);
  C.add(sweep(resample(roundPoly([[.225, ky - .075], [.575, ky - .075], [.575, ky + .075], [.225, ky + .075]], .02, 4).map(([x, y]) => [x, y, .378 + (y - ky) * .12]), 70, true), () => ring(.005, .005, 8), {closed: true, up: [0, 0, 1]}), 'chrome');
  C.soft('leather2', .4, ky, .45, .38, .19, .07, .02);
  C.soft('leather2', .4, ky + .095, .39, .4, .025, .11, .012, {rx: .1});
  C.stitch(range(.21, .59, 12).map(x => [x, ky + .107, .336]), 'stitch', .003);
  // Analogue clock: enamel face, chrome bezel, batons, hands set by the game clock.
  const cx = 0, cy = .905, cz = .402;
  C.add(place(new T.CircleGeometry(.042, 48), cx, cy, cz - .001, 0, Math.PI, 0), 'enamel');
  C.add(place(lathe([[.042, 0], [.047, .004], [.047, .011], [.042, .014]], 48), cx, cy, cz + .002, 0, Math.PI / 2, 0), 'chrome');
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; C.soft(i % 3 ? 'chrome' : '#8a6a2a', cx + Math.sin(a) * .034, cy + Math.cos(a) * .034, cz - .003, .003, i % 3 ? .007 : .01, .002, .001, {rz: -a}); }
  const hands = {h: new T.Group(), m: new T.Group()};
  for (const [g, L, w] of [[hands.h, .022, .0035], [hands.m, .032, .0025]]) {
    g.position.set(cx, cy, cz - .006);
    const m = new T.Mesh(new T.BoxGeometry(w, L, .0015).translate(0, L / 2 - .004, 0), C.mat('#1a1c22')); g.add(m); C.mesh(g);
  }
  C.add(place(new T.SphereGeometry(.004, 12, 8), cx, cy, cz - .008), 'chrome');
  // Organ-stop vents in the walnut: chrome vanes, turned pulls beneath.
  for (const x of [-.66, -.1, .14, .7]) {
    C.soft('black', x, .905, .401, .1, .052, .006, .004);
    for (let i = -2; i <= 2; i++) C.soft('chrome', x, .905 + i * .0095, .398, .096, .0035, .006, .0015);
    for (const d of [-.03, .03]) C.add(place(lathe([[.001, 0], [.006, 0], [.006, .02], [.009, .024], [.009, .03], [.001, .031]], 20), x + d, .857, .402, 0, Math.PI / 2, 0), 'chrome');
  }
  // A screen that rises from the dash top.
  C.soft('piano', 0, 1.1, .5, .34, .13, .014, .01, {rx: -.28});
  C.add(place(new T.PlaneGeometry(.32, .11), 0, 1.1, .492, -.28, Math.PI, 0), 'screen');

  /* ---- centre console: walnut over leather, a knurled controller, chrome trim */
  const ctop = z => z > .1 ? .66 + (z - .1) / .3 * .16 : .66 - Math.max(0, -z - .6) * .05;
  C.add(loftSolid(range(.42, -.75, 30), z => roundPoly([[-.15, .32], [.15, .32], [.145, ctop(z)], [-.145, ctop(z)]], [.02, .02, .03, .03], 4), (z, a, b) => [a, b, z]), 'leather2');
  C.add(loftSolid(range(.36, -.72, 30), z => roundPoly([[-.13, ctop(z) + .002], [.13, ctop(z) + .002], [.125, ctop(z) + .014], [-.125, ctop(z) + .014]], [.004, .004, .008, .008], 2), (z, a, b) => [a, b, z]), 'wood');
  for (const sx of [-1, 1]) C.add(sweep(resample(range(.36, -.72, 20).map(z => [sx * .147, ctop(z) + .004, z]), 60), () => ring(.0025, .0025, 6)), 'chrome');
  C.add(place(lathe([[.001, 0], [.036, 0], [.038, .004], [.038, .024], [.034, .028], [.001, .029]], 48), 0, ctop(-.02) + .014, -.02, 0, 0, Math.PI / 2), 'knurl');
  C.add(place(new T.TorusGeometry(.04, .003, 8, 40), 0, ctop(-.02) + .016, -.02, Math.PI / 2), 'chrome');
  C.soft('leather', 0, ctop(-.45) + .035, -.45, .26, .04, .42, .018, {deform: (x, y, z) => [x, y + (y > 0 ? (1 - (x / .13) ** 2) * .008 : 0), z]});
  C.stitch(range(-.64, -.26, 10).map(z => [.11, ctop(z) + .056, z]), 'stitch', .003);
  C.stitch(range(-.64, -.26, 10).map(z => [-.11, ctop(z) + .056, z]), 'stitch', .003);
  // Rear console: walnut, a leather armrest, the cooler door with a chrome pull.
  C.add(loftSolid(range(-.82, -1.42, 16), () => roundPoly([[-.16, .34], [.16, .34], [.15, .72], [-.15, .72]], [.02, .02, .04, .04], 4), (z, a, b) => [a, b, z]), 'wood');
  C.soft('leather', 0, .745, -1.12, .28, .05, .55, .02);
  C.add(place(lathe([[.004, 0], [.004, .1]], 12), .05, .56, -.815, 0, 0, 0), 'chrome');

  /* ---- doors: navy cards, quilted panels, walnut caps, speakers, pulls, handles */
  for (const s of SIDES) {
    const arm = z => Math.max(0, Math.min(1, (z - GZ0 - .35) / .1, (.3 - z) / .1));
    const card = z => roundPoly([[0, .36], [.03, .36], [.035, .6], [.035 + .06 * arm(z), .68], [.035 + .06 * arm(z), .74], [.03, .77], [.025, .95], [.045, .985], [0, 1.0]], [0, .01, .01, .02, .02, .015, .01, .01, 0], 3);
    C.add(loftSolid(range(.42, GZ0 + .3, 40), card, (z, a, b) => [s * (W + .05 - a), b, z]), 'leather2');
    for (const [z0, z1] of [[.35, -.2], [-.36, GZ0 + .38]]) {
      C.soft('quilt', s * (W + .012), .86, (z0 + z1) / 2, .012, .15, z0 - z1 - .04, .006);
      C.soft('wood', s * (W + .006), .985, (z0 + z1) / 2, .05, .022, z0 - z1 - .02, .008);
      C.soft('leather', s * (W - .03), .755, (z0 + z1) / 2 - .06, .07, .03, (z0 - z1) * .55, .012);
      const sz = z0 - .1;
      C.add(place(lathe([[.001, 0], [.058, 0], [.06, .004], [.054, .009], [.001, .006]], 48), s * (W + .012), .5, sz, 0, 0, s > 0 ? Math.PI : 0), 'speaker');
      C.add(place(new T.TorusGeometry(.061, .004, 8, 48), s * (W + .008), .5, sz, 0, Math.PI / 2, 0), 'chrome');
      C.add(place(new T.TorusGeometry(.04, .006, 8, 20, Math.PI), s * (W - .02), .9, z1 + .12, 0, Math.PI / 2, 0), 'chrome');
      C.add(place(lathe([[.006, 0], [.006, .07], [.009, .08]], 12), s * (W - .006), .93, z0 - .06, 0, Math.PI / 2, 0), 'chrome');
    }
  }

  /* ---- seats: quilted armchairs, lounge seats, picnic tables */
  for (const x of [.4, -.4]) {
    C.seat({x, y: .56, z: -.12, w: .56, depth: .54, style: 'lux', recline: .2, backH: .6, key: 'leather'});
    C.seat({x: x * .9, y: .58, z: -1.02, w: .52, depth: .55, style: 'lounge', recline: .26, backH: .58, key: 'leather'});
    C.soft('wood', x, .92, -.47, .36, .24, .016, .006, {rx: -.2});
    for (const d of [-.12, .12]) C.soft('chrome', x + d, .82, -.44, .03, .012, .02, .004, {rx: -.2});
  }

  /* ---- starlight roof, leather rails, pillars, reading lamps */
  const hz0 = GZ0 + .3, hz1 = GZ1 - .3, hw = z => K.rw(z) + .02;
  C.mesh(starHeadliner(amb, roof, hz0, hz1, hw, .03, .05, '#0b0c16'));
  for (const s of SIDES) {
    C.piping(range(hz0, hz1, 10).map(z => [s * hw(z), roof(z) - .08, z]), 'leather', .011);
    C.add(sweep(resample([[s * (gw(GZ1 - .05) - .07), K.gBase(GZ1 - .05) + .01, GZ1 - .05], [s * (K.rw(.5) - .02), roof(.5) - .05, .5]], 16), () => superLoop(.016, .03, 3, 12), {up: [s, 0, 0]}), 'leather2');
    const bz = -.28;
    C.add(sweep(resample([[s * (gw(bz) - .06), K.gBase(bz) + .02, bz], [s * (K.rw(bz) - .01), roof(bz) - .05, bz]], 16), () => superLoop(.02, .06, 3, 12), {up: [s, 0, 0]}), 'leather2');
    for (const z of [-.2, -1.1]) {
      C.add(place(lathe([[.001, 0], [.018, 0], [.02, .006], [.012, .01]], 24), s * .52, roof(z) - .085, z, 0, 0, -Math.PI / 2), 'chrome');
      C.add(place(new T.CircleGeometry(.011, 20), s * .52, roof(z) - .086, z, Math.PI / 2), 'ledW');
    }
  }

  /* ---- warm light: under the fascia, along the doors, the footwells, the console */
  C.strip(xs.map(x => [x, .815, .418]));
  for (const s of SIDES) {
    C.strip([[s * .81, .965, .38], [s * (W + .002), .96, -.4], [s * (W + .002), .96, GZ0 + .35]]);
    C.strip([[s * .81, .5, .3], [s * (W + .002), .45, GZ0 + .4]], .003);
    C.strip(range(.35, -.7, 10).map(z => [s * .152, ctop(z) - .012, z]), .003);
  }
  // Rear-view mirror on a chrome stem from the header.
  C.add(sweep(resample([[0, roof(.62) - .03, .62], [0, roof(.62) - .09, .6]], 8), () => ring(.006, .006, 10)), 'chrome');
  C.add(sweep(range(-.12, .12, 16).map(x => [x, roof(.62) - .12, .59]), t => superLoop(.012, .03 * Math.sin(Math.PI * Math.min(1, t * 1.08)) ** .3 + .002, 4, 16), {up: [0, 1, 0]}), 'leather2');
  C.soft('glassDark', 0, roof(.62) - .12, .578, .22, .05, .003, .002);
  const wheel = steeringWheel(C, 'lux', {x: .4, y: .98, z: .2, tilt: -.38});
  C.add(sweep(resample([[.45, .93, .33], [.56, .9, .33], [.62, .88, .32]], 12), () => ring(.004, .004, 8)), 'chrome');     // column shifter
  C.add(place(new T.SphereGeometry(.009, 16, 10), .625, .88, .32), 'chrome');
  return {group: C.finish(), wheel, cluster, clusterStyle: 'classic', eye, clock: hands};
}
