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
import {positionLocal, atan, fract, float, smoothstep, vec3, mix, abs, length, step} from 'three/tsl';

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
  lux:     {width: [.255, .275], rim: .27, spokes: 7, pair: true, rimColor: '#dfe3e8', rimRough: .06, rimMetal: 1, caliper: '#1a1a1c', rotor: .19, tyreR: 1, wall: 0},
  classic: {width: [.165, .165], rim: .19, spokes: 0, rimColor: '#e8e4da', rimRough: .45, rimMetal: .1, caliper: null, rotor: .12, tyreR: 1, wall: 1},
  rugged:  {width: [.275, .275], rim: .26, spokes: 6, pair: false, rimColor: '#3a3d42', rimRough: .35, rimMetal: .8, caliper: '#8a0c10', rotor: .18, tyreR: 1, wall: 0},
};

export function buildWheels(wheels, radius, style = 'aero', {coarse = false} = {}) {
  const S = STYLE[style], seg = coarse ? 16 : 48;
  const tyreMat = new T.MeshStandardNodeMaterial({color: '#161718', roughness: .88});
  // A faint lettered band and tread on the tyre, from the local position.
  {
    const P = positionLocal, rr = length(P.yz), ang = atan(P.z, P.y);
    const tread = step(.5, fract(ang.mul(40 / Math.PI))).mul(step(radius * .985, rr)).mul(.35);
    const band = S.wall ? smoothstep(.004, 0, abs(rr.sub(radius * .8)).sub(radius * .065)) : float(0);
    tyreMat.colorNode = mix(vec3(.022, .023, .024).mul(float(1).sub(tread)), vec3(.86, .85, .82), band);
  }
  const D = T.DoubleSide;
  const rimMat = new T.MeshPhysicalMaterial({color: S.rimColor, roughness: S.rimRough, metalness: S.rimMetal, clearcoat: style === 'aero' ? 1 : 0, clearcoatRoughness: .1, side: D});
  const lipMat = style === 'aero' ? new T.MeshStandardMaterial({color: '#2a2d31', roughness: .25, metalness: .9, side: D}) : style === 'rugged' ? new T.MeshStandardMaterial({color: '#b7bcc2', roughness: .18, metalness: 1, side: D}) : rimMat;
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
      const n = S.spokes, face = hw * .86, hub = style === 'rugged' ? .085 : .06;
      const list = [];
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        if (S.pair) for (const o of [-1, 1]) list.push(spoke(a + o * (style === 'lux' ? .085 : .065), hub + .01, rim - .012, .026, style === 'lux' ? .02 : .016, .02, face, style === 'aero' ? .05 : .025, o * .004));
        else list.push(spoke(a, hub, rim - .01, .075, .058, .035, face, .03));
      }
      spin.push([merged(list), rimMat]);
      // Hub: a cone with a centre-lock nut (aero) or a badge (lux).
      spin.push([lathe([[hub + .01, face - .03], [hub, face + .004], [.035, face + .012], [.001, face + .018]], coarse ? 12 : 32), rimMat]);
      if (style === 'aero') { const nut = new T.CylinderGeometry(.03, .03, .03, 6); nut.applyMatrix4(X); nut.translate(face + .02, 0, 0); spin.push([nut, calMat]); }
      if (style === 'lux') { const b = new T.CylinderGeometry(.034, .034, .008, 24); b.applyMatrix4(X); b.translate(face + .018, 0, 0); still.push([b, new T.MeshStandardMaterial({color: '#0c0d14', roughness: .2, metalness: .8})]); }
      if (style === 'rugged') for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, bolt = new T.CylinderGeometry(.009, .009, .02, 6); bolt.applyMatrix4(X); bolt.translate(face + .01, Math.cos(a) * .05, Math.sin(a) * .05); spin.push([bolt, chrome]); }
    }
    // Brake: rotor with a hat, and the caliper at the back-top of it (still).
    if (!coarse) {
      const rot = lathe([[S.rotor * .45, .02], [S.rotor, .02], [S.rotor, -.02], [S.rotor * .45, -.02]], seg);
      rot.translate(hw * .2, 0, 0); spin.push([rot, rotorMat]);
      if (calMat) {
        const cal = new T.CylinderGeometry(S.rotor + .02, S.rotor + .02, .075, 16, 1, false, 0, 1.0);
        cal.applyMatrix4(X); cal.rotateX(w.front ? -.35 : Math.PI - .65); cal.translate(hw * .2 + .01, 0, 0);
        still.push([cal, calMat]);
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
