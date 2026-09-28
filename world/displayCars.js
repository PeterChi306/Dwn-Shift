/* Display cars on dealer forecourts (2026-09-26).
 *
 * Every dealer lot records where its cars stand (buildings.js). They are all
 * drawn as ONE instanced set per material: the player coupe's lofted body
 * (carBody.js) merged per material, plus simple wheels, each car tinted by
 * its instance colour. A few draw calls for the whole city's showrooms.
 */
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {buildCarBody, PAINTS} from './carBody.js';

export function buildDisplayCars(scene, lots, wheels, radius) {
  const spots = lots.flatMap(l => l.cars || []);
  if (!spots.length) return {count: 0, update() {}};
  const {group} = buildCarBody(wheels, radius, '#ffffff', {coarse: true});
  group.updateMatrixWorld(true);
  // Merge the body per material (paint gets tinted per instance).
  const byMat = new Map();
  group.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const src = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(src.attributes)) if (!['position', 'normal'].includes(k)) src.deleteAttribute(k);
    if (!src.attributes.normal) src.computeVertexNormals();
    if (mats.length === 1) { push(byMat, mats[0], src); return; }
    // Multi-material (greenhouse): split by group.
    for (const grp of o.geometry.groups) {
      const part = new T.BufferGeometry(), P = src.attributes.position.array.slice(grp.start * 3, (grp.start + grp.count) * 3), N = src.attributes.normal.array.slice(grp.start * 3, (grp.start + grp.count) * 3);
      part.setAttribute('position', new T.Float32BufferAttribute(P, 3)); part.setAttribute('normal', new T.Float32BufferAttribute(N, 3));
      push(byMat, mats[grp.materialIndex], part);
    }
  });
  // Wheels: tyre and a five-spoke rim face, at each wheel position.
  const tyres = [], rims = [];
  for (const w of wheels) {
    const t = new T.CylinderGeometry(radius, radius, .26, 14, 1); t.rotateZ(Math.PI / 2); t.translate(w.x, w.y, w.z); tyres.push(t);
    const rim = new T.CylinderGeometry(radius * .72, radius * .72, .27, 5, 1); rim.rotateZ(Math.PI / 2); rim.translate(w.x, w.y, w.z); rims.push(rim);
  }
  push(byMat, new T.MeshStandardMaterial({color: '#141414', roughness: .8}), mergeGeometries(tyres.map(g => g.toNonIndexed())));
  push(byMat, new T.MeshStandardMaterial({color: '#b8bcc2', roughness: .25, metalness: .9}), mergeGeometries(rims.map(g => g.toNonIndexed())));
  const mtx = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), col = new T.Color();
  // One instanced set per 1 km cell, drawn only near the camera: with three
  // districts there are hundreds of forecourt cars at ~2.7k triangles each.
  const cells = new Map();
  for (const s of spots) { const k = Math.floor(s.x / CELL) * 65536 + Math.floor(s.z / CELL); (cells.get(k) || cells.set(k, []).get(k)).push(s); }
  const groups = [];
  const geos = [...byMat].map(([mat, list]) => [mat, mergeGeometries(list)]);
  for (const list of cells.values()) {
    const g = new T.Group();
    let cx = 0, cz = 0; list.forEach(s => { cx += s.x / list.length; cz += s.z / list.length; });
    for (const [mat, geo] of geos) {
      const paint = mat.name === '' && mat.isMeshPhysicalMaterial && mat.clearcoat === 1 && mat.color.getHex() === 0xffffff;
      const mesh = new T.InstancedMesh(geo, mat, list.length);
      list.forEach((s, i) => {
        q.setFromAxisAngle(up, s.yaw); mtx.compose(new T.Vector3(s.x, s.y, s.z), q, new T.Vector3(1, 1, 1)); mesh.setMatrixAt(i, mtx);
        if (paint) mesh.setColorAt(i, col.set(PAINTS[Math.floor(s.paint * PAINTS.length) % PAINTS.length][1]));
      });
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.computeBoundingSphere();
      g.add(mesh);
    }
    scene.add(g); groups.push({g, x: cx, z: cz});
  }
  return {count: spots.length, update(x, z) { for (const c of groups) c.g.visible = Math.hypot(c.x - x, c.z - z) < SHOW; }};
}
const CELL = 1024, SHOW = 1500;
function push(map, mat, g) { if (!map.has(mat)) map.set(mat, []); map.get(mat).push(g); }
