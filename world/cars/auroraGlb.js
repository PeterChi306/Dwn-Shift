/* AURORA exterior from Blender (2026-09-29): tools/blender/aurora.py builds one
 * continuous subdivision-surface shell with the lamps, intakes and vents cut
 * into it, plus the wing, mirrors, splitter, diffuser and exhausts, and exports
 * assets/cars/aurora.glb. Here each Blender material is swapped by name for the
 * game's own (so paint swatches, lamps and night lighting keep working), the
 * parts are merged per material, and the signal guides become carFx signals.
 *
 * aurora-lod.glb (the cage unsubdivided, no small parts) dresses the dealer fleet.
 * The GLBs load once at boot (preloadAurora); until they have, or if they fail,
 * carModels.js falls back to the lofted body in aurora.js.
 */
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {shutLines, gap, step, abs} from '../carBody.js';

const scenes = {full: null, lod: null};
let loading = null;
const load = (file, key) => new GLTFLoader().loadAsync(new URL(`../../assets/cars/${file}`, import.meta.url).href)
  .then(g => { g.scene.updateMatrixWorld(true); scenes[key] = g.scene; });
export function preloadAurora() {
  return loading ||= Promise.all([load('aurora.glb', 'full'), load('aurora-lod.glb', 'lod')])
    .catch(e => console.warn('aurora.glb failed, using the lofted body', e));
}
/** Ready for the player car (full) or the dealer fleet (lod). */
export const auroraGlbReady = (coarse = false) => !!scenes[coarse ? 'lod' : 'full'];

/** The exterior as a group of merged meshes, one per game material (`coarse`: the dealer-fleet LOD). */
export function auroraGlbBody(K, M, coarse = false) {
  const scene = scenes[coarse ? 'lod' : 'full'];
  const {Z0, zf, GZ1, deck, belt} = K;
  // Door and bonnet shut lines, drawn on the paint where the panels meet.
  const doorF = GZ1 - .06, doorR = K.zr + .47;
  shutLines(M.paint, P => {
    const ax = abs(P.x), side = step(.6, ax).mul(step(P.y, belt(0) - .02)).mul(step(.3, P.y));
    return gap(P.z, doorF).add(gap(P.z, doorR)).mul(side)
      .add(gap(P.z, zf - .5).mul(step(ax, .5)).mul(step(deck(zf) - .08, P.y)));
  });
  // Merged per material AND per swappable part (2026-10-01, the workshop):
  // the wing, splitter, exhausts, diffuser, skirts and each headlamp stay
  // separate meshes tagged `userData.part`, so a build can hide or recolour them.
  const byKey = new Map(), signals = {left: [], right: []};
  const partOf = n => /^(wing|flap|endplate|neck)/.test(n) ? 'wing' : /^fin/.test(n) ? 'fin' : /^(splitter|splitedge)/.test(n) ? 'splitter'
    : /^exhaust/.test(n) ? 'exhaust' : /^(diffuser|strake)/.test(n) ? 'diffuser' : /^skirt/.test(n) ? 'skirt' : /^projl?-/.test(n) ? 'lampR' : /^projl?\d/.test(n) ? 'lampL' : null;
  const put = (m, part, g) => { const k = m.uuid + '|' + (part || ''); (byKey.get(k) || byKey.set(k, {m, part, gs: []}).get(k)).gs.push(g); };
  scene.traverse(o => {
    if (!o.isMesh) return;
    const name = (o.name + ' ' + (o.parent?.name || '')).toLowerCase();
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    g = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal'].includes(k)) g.deleteAttribute(k);
    if (name.includes('signal')) {
      // Model-built indicators: `seq` runs along the lamp for the sequential sweep.
      const left = name.includes('signall');
      const mirror = name.includes('mirror');
      K.signal(left ? 1 : -1, g, mirror ? [left ? 1 : -1, 0, -1] : [left ? 1 : -1, 0, -.6]);
      return;
    }
    // The dealer fleet has no cabin: tinted glass, so nobody sees the empty tub.
    const m = coarse && o.material.name === 'glass' ? M.gloss : M[o.material.name] || M.black;
    if (m === M.ti) {
      // The titanium tint runs along the tip (uv.y), from the body out.
      const p = g.attributes.position, uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) uv[i * 2 + 1] = Math.min(1, Math.max(0, (Z0 + .06 - p.getZ(i)) / .19));
      g.setAttribute('uv', new T.BufferAttribute(uv, 2));
    }
    const lower = o.name.toLowerCase();
    // The front lamps (the lens and the LED outline) split down the middle, one per side.
    if (!coarse && (lower === 'lens' || m === M.head && o.parent?.name === 'Body')) {
      for (const [part, keep] of [['lampL', x => x > 0], ['lampR', x => x <= 0]]) { const h = splitTris(g, keep); if (h) put(m, part, h); }
      return;
    }
    put(m, coarse ? null : partOf(lower), g);
  });
  const group = new T.Group();
  for (const {m, part, gs} of byKey.values()) {
    for (const g of gs) g.attributes.uv || g.setAttribute('uv', new T.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const mesh = new T.Mesh(mergeGeometries(gs), m);
    mesh.name = (m.name || '') + (part ? ':' + part : ''); mesh.userData.part = part;
    mesh.castShadow = m !== M.glass && m !== M.lamp; mesh.receiveShadow = true;
    if (m === M.glass || m === M.lamp) mesh.renderOrder = 1;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return {group, exhausts: [[-.11, .56, Z0 - .12], [.11, .56, Z0 - .12]]};
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
