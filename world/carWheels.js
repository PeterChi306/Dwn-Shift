/* Wheels for the player cars, built in code (2026-09-28).
 *
 * Each wheel is a tyre (a lathed sidewall with shoulders), a rim (barrel, a
 * lip and a spoke face in the model's style), a brake rotor and a caliper.
 * The tyre, rim and rotor spin; the caliper only steers, as on a real car.
 * Built facing +x (a left wheel) and mirrored for the right side.
 *
 * Styles:  aero    ten thin twisted twin-spokes, gloss black, blue caliper (Aurora)
 *          lux     polished multi-spoke with a floating centre badge (sedan)
 *          classic steel wheel, chrome hubcap and trim ring, whitewall tyre
 *          rugged  six chunky spokes, machined faces, taller sidewall (SUV)
 */
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {positionLocal, atan, fract, float, smoothstep, vec3, mix, abs, length, step, floor, hash, max} from 'three/tsl';
import {sweep, superLoop} from './carKit.js';

const X = new T.Matrix4().makeRotationZ(-Math.PI / 2);     // lathe/cylinder axis y -> x

function lathe(profile, seg) {
  const g = new T.LatheGeometry(profile.map(([r, x]) => new T.Vector2(r, x)), seg);
  g.applyMatrix4(X); return g;
}
function merged(list) {
  return mergeGeometries(list.map(g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal'].includes(k)) n.deleteAttribute(k); return n; }));
}

/** A spoke: a tapered bar from the hub to the lip, at angle a, set back `dish` at the lip. */
function spoke(a, r0, r1, w0, w1, depth, x0, dish, twist = 0) {
  const shape = new T.Shape();
  shape.moveTo(r0, -w0 / 2); shape.lineTo(r1, -w1 / 2 + twist); shape.lineTo(r1, w1 / 2 + twist); shape.lineTo(r0, w0 / 2); shape.closePath();
  const g = new T.ExtrudeGeometry(shape, {depth, bevelEnabled: true, bevelThickness: .004, bevelSize: .003, bevelSegments: 1, steps: 1});
  // Shape (radial, tangential) in xy, extrusion along z -> wheel axis x.
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const r = pos.getX(i), t = pos.getY(i), e = pos.getZ(i);
    const k = Math.max(0, (r - r0) / (r1 - r0));
    // Concave: the spoke sinks toward the lip.
    const x = x0 - depth + e - dish * k * k;
    pos.setXYZ(i, x, Math.cos(a) * r - Math.sin(a) * t, Math.sin(a) * r + Math.cos(a) * t);
  }
  g.computeVertexNormals();
  return g;
}

const STYLE = {
  aero:    {width: [.265, .315], rim: .272, spokes: 10, pair: true, rimColor: '#0b0c0e', rimRough: .22, rimMetal: .6, caliper: '#1f47ff', rotor: .19, tyreR: 1, wall: 0},
  lux:     {width: [.255, .275], rim: .3, spokes: 7, pair: true, rimColor: '#e4e7eb', rimRough: .05, rimMetal: 1, caliper: '#23252a', rotor: .2, tyreR: 1, wall: 0},
  classic: {width: [.165, .165], rim: .19, spokes: 0, rimColor: '#e8e4da', rimRough: .45, rimMetal: .1, caliper: null, rotor: .12, tyreR: 1, wall: 1},
  rugged:  {width: [.275, .275], rim: .26, spokes: 6, pair: false, rimColor: '#3a3d42', rimRough: .35, rimMetal: .8, caliper: '#8a0c10', rotor: .18, tyreR: 1, wall: 0},
  // The workshop's wheels (2026-10-01): a forged centre-lock five-spoke, a
  // cross-spoke mesh, and a deep dish with a wide polished lip.
  forged:  {width: [.28, .335], rim: .278, spokes: 5, pair: false, rimColor: '#a7854b', rimRough: .28, rimMetal: .9, caliper: '#d3191c', rotor: .2, tyreR: 1, wall: 0, lip: 'dark', lock: true},
  mesh:    {width: [.275, .325], rim: .275, spokes: 10, pair: true, mesh: true, rimColor: '#c7a453', rimRough: .25, rimMetal: .95, caliper: '#1f1f22', rotor: .19, tyreR: 1, wall: 0, lip: 'chrome'},
  dish:    {width: [.28, .34], rim: .27, spokes: 6, pair: false, rimColor: '#16171a', rimRough: .3, rimMetal: .6, caliper: '#d3191c', rotor: .19, tyreR: 1, wall: 0, lip: 'chrome', face: .38},
};
export const WHEEL_STYLES = Object.keys(STYLE);

export function buildWheels(wheels, radius, style = 'aero', {coarse = false, rimColor = null, caliper = null} = {}) {
  const S = {...(STYLE[style] || STYLE.aero)}, seg = coarse ? 16 : 48;
  if (!STYLE[style]) style = 'aero';
  if (rimColor) S.rimColor = rimColor;
  if (caliper && S.caliper) S.caliper = caliper;
  const tyreMat = new T.MeshStandardNodeMaterial({color: '#111214', roughness: .86});
  {
    // Tread: circumferential grooves and shoulder sipes. Sidewall: two arcs of
    // raised lettering (blocky glyph strokes), or a whitewall on the classic.
    const P = positionLocal, rr = length(P.yz), ang = atan(P.z, P.y), ax = abs(P.x), hwT = S.width[0] / 2;
    const onTread = step(radius * .975, rr);
    const groove = max(smoothstep(.007, .003, abs(ax.sub(hwT * .38))), smoothstep(.006, .002, ax)).mul(onTread);
    const sipe = step(fract(ang.mul(58 / Math.PI)), .12).mul(step(hwT * .55, ax)).mul(onTread);
    const r0 = S.rim + (radius - S.rim) * .42, bandH = (radius - S.rim) * .26, v = rr.sub(r0).div(bandH);
    const inBand = step(0, v).mul(step(v, 1));
    const turn = fract(ang.div(Math.PI * 2).add(1)), arc = max(step(abs(turn.sub(.25)), .085), step(abs(turn.sub(.75)), .085));
    const u = ang.mul(64 / Math.PI), cell = floor(u), fu = fract(u);
    const glyph = step(.35, hash(cell.mul(7.13).add(floor(v.mul(3)).mul(1.7)))).mul(step(.18, fu)).mul(step(fu, .82)).max(step(abs(v.sub(.5)), .09).mul(step(.5, hash(cell.mul(3.1)))));
    const letters = S.wall ? float(0) : inBand.mul(arc).mul(glyph).mul(step(ax, hwT * 1.02)).mul(step(hwT * .7, ax));
    const white = S.wall ? smoothstep(.004, 0, abs(rr.sub(radius * .8)).sub(radius * .065)) : float(0);
    const base = vec3(.018, .019, .02).mul(float(1).sub(groove.mul(.6)).sub(sipe.mul(.35)));
    tyreMat.colorNode = mix(mix(base, vec3(.07, .072, .075), letters), vec3(.86, .85, .82), white);
    tyreMat.roughnessNode = float(.86).sub(letters.mul(.25)).sub(step(rr, radius * .97).mul(.08));
  }
  const D = T.DoubleSide;
  const rimMat = new T.MeshPhysicalMaterial({color: S.rimColor, roughness: S.rimRough, metalness: S.rimMetal, clearcoat: style === 'aero' ? 1 : 0, clearcoatRoughness: .1, side: D});
  const lipMat = style === 'aero' || S.lip === 'dark' ? new T.MeshStandardMaterial({color: '#2a2d31', roughness: .25, metalness: .9, side: D}) : style === 'rugged' || S.lip === 'chrome' ? new T.MeshStandardMaterial({color: '#c9cdd2', roughness: .08, metalness: 1, side: D}) : rimMat;
  const chrome = new T.MeshStandardMaterial({color: '#d6d9dd', roughness: .07, metalness: 1, side: D});
  const rotorMat = new T.MeshStandardNodeMaterial({color: '#6c6f72', roughness: .45, metalness: .85});
  {
    // Cross-drilled, with the hat darker.
    const P = positionLocal, rr = length(P.yz), ang = atan(P.z, P.y);
    const holes = step(.72, fract(ang.mul(18 / Math.PI))).mul(step(.62, fract(rr.mul(38)))).mul(step(S.rotor * .55, rr));
    rotorMat.colorNode = mix(vec3(.36, .37, .38), vec3(.05, .05, .05), holes.max(step(rr, S.rotor * .5)));
  }
  const calMat = S.caliper ? new T.MeshPhysicalMaterial({color: S.caliper, roughness: .3, metalness: .3, clearcoat: 1}) : null;

  const out = [];
  for (const w of wheels) {
    const width = w.front ? S.width[0] : S.width[1], hw = width / 2, R = radius, rim = S.rim;
    const spin = [], still = [];
    // Tyre: tread, rounded shoulders, sidewall down to the bead.
    const side = R - rim, prof = [];
    const sh = Math.min(.035, side * .35);
    prof.push([rim - .005, -hw * .92], [rim + side * .35, -hw * 1.0], [R - sh, -hw * .98], [R - sh * .25, -hw * .9], [R, -hw * .7], [R, hw * .7], [R - sh * .25, hw * .9], [R - sh, hw * .98], [rim + side * .35, hw * 1.0], [rim - .005, hw * .92]);
    spin.push([lathe(prof, seg), tyreMat]);
    // Rim barrel (seen through the spokes) and the lip.
    spin.push([lathe([[rim - .012, hw * .9], [rim - .02, hw * .6], [rim - .02, -hw * .8], [rim - .012, -hw * .9]], seg), lipMat === rimMat ? rimMat : lipMat]);
    spin.push([lathe([[rim - .03, hw * .88], [rim + .004, hw * .93], [rim + .006, hw * .86]], seg), lipMat]);
    if (style === 'classic') {
      // Painted steel disc, a chrome trim ring, a domed hubcap.
      spin.push([lathe([[rim - .02, hw * .5], [rim * .62, hw * .6], [rim * .55, hw * .72], [.02, hw * .72]], seg), rimMat]);
      spin.push([lathe([[rim - .004, hw * .9], [rim * .86, hw * .86], [rim * .78, hw * .74]], seg), chrome]);
      spin.push([lathe([[rim * .56, hw * .73], [rim * .5, hw * .86], [rim * .32, hw * .96], [.001, hw * 1.0]], seg), chrome]);
    } else {
      const n = S.spokes, face = hw * (S.face || .86), hub = style === 'rugged' ? .085 : .06;
      // A deep dish: the spoke face sits far back, a wide polished lip out front.
      if (S.face) spin.push([lathe([[rim - .004, hw * .9], [rim - .03, hw * .86], [rim - .05, hw * .62], [rim - .052, face + .01]], seg), lipMat]);
      const list = [];
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        if (S.mesh) for (const o of [-1, 1]) list.push(spoke(a + o * .16, hub + .01, rim - .012, .016, .012, .016, face, .03, o * .05));
        else if (S.pair) for (const o of [-1, 1]) list.push(style === 'lux' ? spoke(a + o * .075, hub + .012, rim - .006, .034, .028, .026, face, .035, o * .006) : spoke(a + o * .065, hub + .01, rim - .012, .026, .016, .02, face, .05, o * .004));
        else list.push(spoke(a, hub, rim - .01, .075, .058, .035, face, .03));
      }
      spin.push([merged(list), rimMat]);
      // Hub: a cone with a centre-lock nut (aero) or a badge (lux).
      spin.push([lathe([[hub + .01, face - .03], [hub, face + .004], [.035, face + .012], [.001, face + .018]], coarse ? 12 : 32), rimMat]);
      if (style === 'aero' || S.lock) {
        // Centre-lock: a hex nut on a blue collar.
        spin.push([lathe([[.001, face + .03], [.024, face + .03], [.028, face + .024], [.028, face + .006]], 6), chrome]);
        spin.push([lathe([[.036, face + .004], [.036, face + .01], [.028, face + .012]], 32), calMat]);
      }
      if (style === 'lux') {
        // A self-righting centre cap (it does not spin): dark enamel, chrome ring, the double-S.
        const enamel = new T.MeshPhysicalMaterial({color: '#0d0f1c', roughness: .15, metalness: .3, clearcoat: 1});
        still.push([lathe([[.001, face + .02], [.036, face + .02], [.04, face + .016]], 40), enamel]);
        still.push([lathe([[.036, face + .021], [.041, face + .019], [.042, face + .012]], 40), chrome]);
        for (const k of [-1, 1]) { const t = new T.TorusGeometry(.011, .0022, 6, 24, Math.PI * 1.25).rotateZ(k > 0 ? Math.PI * .25 : -Math.PI * .75).rotateY(Math.PI / 2); t.translate(face + .022, k * .0055, 0); still.push([t, chrome]); }
      }
      if (style === 'rugged') for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, bolt = new T.CylinderGeometry(.009, .009, .02, 6); bolt.applyMatrix4(X); bolt.translate(face + .01, Math.cos(a) * .05, Math.sin(a) * .05); spin.push([bolt, chrome]); }
    }
    // Brake: rotor with a hat, and the caliper at the back-top of it (still).
    if (!coarse) {
      const rot = lathe([[S.rotor * .45, .02], [S.rotor, .02], [S.rotor, -.02], [S.rotor * .45, -.02]], seg);
      rot.translate(hw * .2, 0, 0); spin.push([rot, rotorMat]);
      if (calMat) {
        // Caliper: a rounded block swept round the rotor's edge, behind the axle.
        const c0 = w.front ? -.6 : .6, rc = S.rotor - .012, xc = hw * .2 + .012;
        const arc = Array.from({length: 17}, (_, i) => { const a = c0 - .42 + .84 * i / 16; return [xc, Math.cos(a) * rc, Math.sin(a) * rc]; });
        still.push([sweep(arc, () => superLoop(.024, .038, 4, 16), {up: [1, 0, 0]}), calMat]);
        if (style === 'aero') still.push([sweep(arc.slice(4, 13).map(([x, y, z]) => [x + .039, y, z]), () => superLoop(.0012, .006, 4, 8), {up: [1, 0, 0]}), new T.MeshStandardMaterial({color: '#f4f6f8', roughness: .4})]);
      }
    }
    // Merge per material, then mirror the right-hand wheels.
    const byMat = (list) => { const m = new Map(); for (const [g, mat] of list) (m.get(mat) || m.set(mat, []).get(mat)).push(g); return [...m].map(([mat, gs]) => { const mesh = new T.Mesh(merged(gs), mat); mesh.castShadow = true; mesh.receiveShadow = true; return mesh; }); };
    const spinG = new T.Group(), pivot = new T.Group();
    byMat(spin).forEach(m => spinG.add(m));
    const stillG = new T.Group(); byMat(still).forEach(m => stillG.add(m));
    if (w.x < 0) { spinG.scale.x = -1; stillG.scale.x = -1; }
    const holder = new T.Group(); holder.add(spinG);
    pivot.add(holder, stillG); pivot.position.set(w.x, w.y, w.z);
    pivot.name = w.name || '';
    out.push({pivot, spin: holder, x: w.x, y: w.y, z: w.z, front: w.front});
  }
  return out;
}
