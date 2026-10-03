/* AURORA exterior from Blender (v1 2026-09-29, v3 2026-10-02).
 *
 * tools/blender/aurora.py builds the body as real panels with thickness and shut
 * lines (the body, two dihedral doors with their windows, the frunk lid and the
 * engine cover with its glass), the detail parts (aurora_parts.py: lamps,
 * grilles, vents, aero, mirrors, exhausts...) and the engine bay
 * (aurora_engine.py), and exports assets/cars/aurora.glb. aurora_wheel.py makes
 * the tyres, rims and brakes (aurora-wheel.glb, used by carWheels.js).
 *
 * Here each Blender material is swapped by name for the game's own (so paint
 * swatches, lamps and night lighting keep working), the parts are merged per
 * material, the signal guides become carFx signals, and each door hangs on a
 * pivot at its hinge (`body.doors`, opened by carFx).
 *
 * aurora-lod.glb (the cage unsubdivided, no small parts) dresses the dealer fleet.
 * The GLBs load once at boot (preloadAurora); until they have, or if they fail,
 * carModels.js falls back to the lofted body in aurora.js.
 */
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {positionLocal, normalLocal, abs, fract, smoothstep, mix, vec3, float, step, sin, uv} from 'three/tsl';
import {setWheelParts} from '../carWheels.js';

const scenes = {full: null, lod: null};
let loading = null;
const load = (file, key) => new GLTFLoader().loadAsync(new URL(`../../assets/cars/${file}`, import.meta.url).href)
  .then(g => { g.scene.updateMatrixWorld(true); scenes[key] = g.scene; });
export function preloadAurora() {
  return loading ||= Promise.all([
    load('aurora.glb', 'full'), load('aurora-lod.glb', 'lod'),
    load('aurora-wheel.glb', 'wheel').then(() => setWheelParts(scenes.wheel)).catch(e => console.warn('aurora-wheel.glb failed, procedural wheels', e)),
  ]).catch(e => console.warn('aurora.glb failed, using the lofted body', e));
}
/** Ready for the player car (full) or the dealer fleet (lod). */
export const auroraGlbReady = (coarse = false) => !!scenes[coarse ? 'lod' : 'full'];

/** The materials the car's own set (carMaterials) does not have, made once per car. */
function extraMaterials(M) {
  if (M._aurora) return M._aurora;
  const std = (o) => new T.MeshStandardMaterial(o), phys = (o) => new T.MeshPhysicalMaterial(o);
  const X = {
    // Matte forged carbon: the liners, the under-tray, the panels' inner faces.
    carbonM: new T.MeshStandardNodeMaterial({roughness: .62, metalness: .2}),
    // The engine window: much clearer than the cabin glass, so the V8 shows.
    glassE: phys({color: '#0d1013', metalness: .1, roughness: .02, clearcoat: 1, clearcoatRoughness: .02, transparent: true, opacity: .22, depthWrite: false, envMapIntensity: 1.6}),
    tailLens: phys({color: '#5a0a10', metalness: 0, roughness: .04, clearcoat: 1, transparent: true, opacity: .42, depthWrite: false, envMapIntensity: 1.6}),
    heat: new T.MeshPhysicalNodeMaterial({metalness: 1, roughness: .28}),
    foil: new T.MeshStandardNodeMaterial({metalness: 1, roughness: .22}),
    alu: std({color: '#b9bdc2', metalness: 1, roughness: .3}),
    steel: std({color: '#2a2c2f', metalness: .9, roughness: .38}),
    engine: std({color: '#3a3d42', metalness: .75, roughness: .42}),
    red: phys({color: '#b8121b', metalness: .2, roughness: .3, clearcoat: .6}),
    blue: phys({color: '#1f47ff', metalness: .6, roughness: .22, clearcoat: .5}),
    yellow: std({color: '#f0b916', roughness: .45}),
    white: std({color: '#e6e8ea', roughness: .45}),
    bay: std({color: '#0b0c0d', metalness: .2, roughness: .75, side: T.DoubleSide}),
    mesh: std({color: '#121315', metalness: .85, roughness: .38, side: T.DoubleSide}),
    radiator: new T.MeshStandardNodeMaterial({roughness: .5, metalness: .7, side: T.DoubleSide}),
    amber: phys({color: '#6a3a05', roughness: .1, clearcoat: 1}),
  };
  {
    // Forged carbon: marbled flakes instead of a weave.
    const P = positionLocal.mul(38), n = sin(P.x.mul(1.7).add(sin(P.y.mul(2.3)).mul(1.4))).mul(sin(P.z.mul(1.9).add(sin(P.x.mul(1.3)).mul(1.2))));
    X.carbonM.colorNode = mix(vec3(.012, .012, .014), vec3(.05, .052, .056), smoothstep(-.2, .6, n));
  }
  {
    // Heat-blued pipework: straw, purple and blue bands along the pipe.
    const t = fract(positionLocal.x.mul(3.1).add(positionLocal.z.mul(2.3)).add(positionLocal.y.mul(1.7)));
    X.heat.colorNode = mix(mix(vec3(.7, .55, .3), vec3(.38, .22, .5), smoothstep(.2, .5, t)), vec3(.2, .3, .72), smoothstep(.55, .9, t));
  }
  {
    // Gold foil: crinkled, so it catches the light in facets.
    const P = positionLocal.mul(60), c = fract(sin(P.x.floor().mul(12.9).add(P.y.floor().mul(78.2)).add(P.z.floor().mul(37.7))).mul(43758.5));
    X.foil.colorNode = mix(vec3(.75, .55, .22), vec3(.95, .78, .4), c);
    X.foil.roughnessNode = float(.12).add(c.mul(.25));
  }
  {
    // Cooler cores: fine fins across the core.
    const P = positionLocal, N = abs(normalLocal), u = mix(P.x, P.z, step(N.z, N.x));
    X.radiator.colorNode = vec3(.03, .032, .036).mul(fract(u.mul(260)).sub(.5).abs().mul(1.4).add(.5)).add(vec3(.01).mul(step(.94, fract(P.y.mul(28)))));
  }
  return M._aurora = X;
}

const SIDE = {l: 1, r: -1};

/** The exterior as a group of merged meshes, one per game material (`coarse`: the dealer-fleet LOD). */
export function auroraGlbBody(K, M, coarse = false) {
  const scene = scenes[coarse ? 'lod' : 'full'];
  const {Z0} = K, X = extraMaterials(M);
  // Merged per material AND per swappable part (2026-10-01, the workshop): the
  // wing, splitter, exhausts, diffuser, skirts and each headlamp stay separate
  // meshes tagged `userData.part`, so a build can hide or recolour them.
  const byKey = new Map(), doors = {};
  const partOf = n => /^door_[lr]/.test(n) ? 'door' + n[5].toUpperCase() : /^wing/.test(n) ? 'wing' : /^fin/.test(n) ? 'fin' : /^splitter/.test(n) ? 'splitter'
    : /^exhaust/.test(n) ? 'exhaust' : /^(diffuser)/.test(n) ? 'diffuser' : /^skirt/.test(n) ? 'skirt' : /^lamp_r/.test(n) ? 'lampR' : /^lamp_l/.test(n) ? 'lampL' : /^wiper/.test(n) ? 'wiper' : null;
  const put = (m, part, g) => { const k = m.uuid + '|' + (part || ''); (byKey.get(k) || byKey.set(k, {m, part, gs: []}).get(k)).gs.push(g); };
  scene.traverse(o => {
    if (!o.isMesh) return;
    const node = o.userData.hinge ? o : o.parent?.userData?.hinge ? o.parent : null;
    const lower = (o.parent && o.parent !== scene ? o.parent.name : o.name).toLowerCase();
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    g = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    const part = coarse ? null : partOf(lower);
    if (node && part?.startsWith('door')) {
      // Scissor doors (2026-10-02): the GLB's dihedral hinge sat high at the
      // windshield base and flipped the door up at an odd lean. Now each door
      // hangs on a hinge low at its front edge and rises about a sideways
      // axis, with a little outward kick so its tail clears the sill.
      const h = node.userData.hinge;
      const d = doors[part[4]] ||= {hinge: new T.Vector3(h[0], .55, .9), axis: new T.Vector3(1, 0, 0), scissor: true};
      d.side = SIDE[part[4].toLowerCase()];
    }
    if (lower.includes('signal')) {
      // Model-built indicators: `seq` runs along the lamp for the sequential sweep.
      const m = lower.match(/signal([lr])/) || lower.match(/door_([lr])/);
      const left = m?.[1] === 'l', mirror = lower.includes('mirror');
      if (part?.startsWith('door')) g.userData.door = part[4];
      K.signal(left ? 1 : -1, g, mirror ? [left ? 1 : -1, 0, -1] : lower.includes('rear') ? [left ? 1 : -1, 0, 0] : [left ? 1 : -1, 0, -.6]);
      return;
    }
    const name = o.material.name;
    // The dealer fleet has no cabin: tinted glass, so nobody sees the empty tub.
    let m = coarse && (name === 'glass' || name === 'glassE') ? M.gloss : M[name] || X[name] || M.black;
    if (name === 'head' && lower.startsWith('lamp_')) m = M.head;
    if (m === M.ti) {
      // The titanium tint runs along the tip (uv.y), from the body out.
      const p = g.attributes.position, a = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) a[i * 2 + 1] = Math.min(1, Math.max(0, (Z0 + .06 - p.getZ(i)) / .19));
      g.setAttribute('uv', new T.BufferAttribute(a, 2));
    }
    // The headlamp lens splits down the middle, one per side.
    if (!coarse && lower === 'lens') {
      for (const [pt, keep] of [['lampL', x => x > 0], ['lampR', x => x <= 0]]) { const h = splitTris(g, keep); if (h) put(m, pt, h); }
      return;
    }
    put(m, part, g);
  });
  const group = new T.Group();
  // Each door swings on a pivot at its hinge: its meshes are moved into the pivot's frame.
  for (const [k, d] of Object.entries(doors)) {
    d.pivot = new T.Group(); d.pivot.name = 'door' + k; d.pivot.position.copy(d.hinge); d.open = 0; d.angle = 1.18;
    group.add(d.pivot);
  }
  for (const {m, part, gs} of byKey.values()) {
    for (const g of gs) g.attributes.uv || g.setAttribute('uv', new T.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const geo = mergeGeometries(gs), door = part?.startsWith('door') ? doors[part[4]] : null;
    if (door) geo.translate(-door.hinge.x, -door.hinge.y, -door.hinge.z);
    const mesh = new T.Mesh(geo, m);
    mesh.name = (m.name || '') + (part ? ':' + part : ''); mesh.userData.part = part;
    const clear = m === M.glass || m === M.lamp || m === X.glassE || m === X.tailLens;
    // Only the big surfaces cast shadows (the small dressings would only cost shadow-pass draws).
    mesh.castShadow = !clear && [M.paint, M.carbon, M.black, M.gloss, X.carbonM].includes(m) && !part?.startsWith('lamp'); mesh.receiveShadow = true;
    if (clear) mesh.renderOrder = 1;
    mesh.matrixAutoUpdate = false;
    (door ? door.pivot : group).add(mesh);
  }
  // The wiper (2026-10-03, rain): its blade and arm on a pivot at the driver's-side end, so it can sweep.
  const wm = group.children.filter(m => m.userData.part === 'wiper');
  let wiper = null;
  if (wm.length) {
    const piv = new T.Vector3(-1e9, 0, 0);
    for (const m of wm) { const p = m.geometry.attributes.position; for (let i = 0; i < p.count; i++) if (p.getX(i) > piv.x) piv.set(p.getX(i), p.getY(i), p.getZ(i)); }
    const pivot = new T.Group(); pivot.name = 'wiper'; pivot.position.copy(piv); group.add(pivot);
    for (const m of wm) { m.geometry.translate(-piv.x, -piv.y, -piv.z); pivot.add(m); }
    wiper = {pivot, at: piv.clone()};
  }
  return {group, wiper, doors: Object.keys(doors).length ? doors : null, exhausts: [[-.12, .47, Z0 - .12], [.12, .47, Z0 - .12]]};
}

/** Swing the doors: open 0 (shut) .. 1 (fully up), per side key 'L' / 'R'. */
export function setDoor(door, open) {
  door.open = open;
  doorPose(door, open * open * (3 - 2 * open));
}
const _qa = new T.Quaternion(), _qb = new T.Quaternion(), _X = new T.Vector3(1, 0, 0), _Y = new T.Vector3(0, 1, 0);
/** Pose a door at eased opening e (0..1): scissor = up about x, then out about y. */
export function doorPose(door, e) {
  if (!door.scissor) { door.pivot.quaternion.setFromAxisAngle(door.axis, e * door.angle); return; }
  const out = Math.sin(Math.min(1, e * 1.4) * Math.PI / 2) * .14 * (door.hinge.x > 0 ? -1 : 1);
  _qa.setFromAxisAngle(_Y, out); _qb.setFromAxisAngle(_X, e * 1.32);
  door.pivot.quaternion.multiplyQuaternions(_qa, _qb);
}

/** The triangles of a non-indexed geometry whose centroid's x passes `keep`, or null. */
function splitTris(g, keep) {
  const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, idx = [];
  for (let t = 0; t < P.count; t += 3) if (keep((P.getX(t) + P.getX(t + 1) + P.getX(t + 2)) / 3)) idx.push(t, t + 1, t + 2);
  if (!idx.length) return null;
  const out = new T.BufferGeometry(), pick = (A, n) => { const a = new Float32Array(idx.length * n); idx.forEach((v, i) => { for (let k = 0; k < n; k++) a[i * n + k] = A.array[v * n + k]; }); return new T.BufferAttribute(a, n); };
  out.setAttribute('position', pick(P, 3)); if (N) out.setAttribute('normal', pick(N, 3)); if (U) out.setAttribute('uv', pick(U, 2));
  return out;
}
