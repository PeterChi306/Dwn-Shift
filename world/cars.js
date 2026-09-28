/* Car models: loads the fleet GLBs and splits the player car into a body and
 * four wheel pivots, so the wheels can spin, steer and ride the suspension. */
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {buildCarBody} from './carBody.js';

/** Merge a hierarchy into one mesh per material, in its own world space. */
function compact(root) {
  root.updateMatrixWorld(true);
  const groups = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    let g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const key of Object.keys(g.attributes)) if (!['position', 'normal'].includes(key)) g.deleteAttribute(key);
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(g);
  });
  const out = new T.Group();
  for (const [m, gs] of groups) {
    const mesh = new T.Mesh(mergeGeometries(gs), m);
    mesh.castShadow = true; mesh.receiveShadow = true; out.add(mesh);
    gs.forEach(g => g.dispose());
  }
  return out;
}

export async function loadCars(names = ['performance-coupe']) {
  const loader = new GLTFLoader(), sources = {};
  for (const name of names) {
    const gltf = await loader.loadAsync(`assets/world/${name}.glb?fleet=3`);
    gltf.scene.traverse(o => { if (o.isMesh && o.material.name === 'Brake LED') { o.material.toneMapped = false; o.material.emissiveIntensity = .35; } });
    sources[name] = gltf.scene;
  }
  return sources;
}

/** Player car: body mesh plus wheel pivots at the wheel centres (chassis space). */
export function makePlayerCar(source, {paint = null, radius = null} = {}) {
  const root = source.clone(true), original = [];
  root.updateMatrixWorld(true);
  root.traverse(o => { if (/^Wheel_(FL|FR|RL|RR)$/.test(o.name)) original.push(o); });
  const wheels = [];
  for (const w of original) {
    const p = new T.Vector3(); w.getWorldPosition(p);
    const visual = compact(w);
    for (const m of visual.children) m.geometry.translate(-p.x, -p.y, -p.z);
    const pivot = new T.Group(); pivot.name = w.name; pivot.position.copy(p);
    const spin = new T.Group(); spin.add(visual); pivot.add(spin);
    w.removeFromParent();
    wheels.push({pivot, spin, x: p.x, y: p.y, z: p.z, front: w.name.includes('_F')});
  }
  const object = new T.Group();
  // The lofted body (carBody.js) by default; the Blender body is kept as a fallback.
  let body = null;
  if (paint !== false) { body = buildCarBody(wheels, radius ?? wheels[0]?.y ?? .36, paint || undefined); object.add(body.group); }
  else object.add(compact(root));
  for (const w of wheels) object.add(w.pivot);
  return {object, wheels, body};
}
