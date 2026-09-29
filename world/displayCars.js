/* Display cars on dealer forecourts (2026-09-26).
 *
 * Every dealer lot records where its cars stand (buildings.js). They are
 * drawn as instanced sets per model and material: coarse builds of the
 * player's cars (carModels.js) merged per material, plus simple wheels, each
 * car tinted by its instance colour. A few draw calls per showroom cell.
 */
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {PAINTS} from './carBody.js';
import {buildModel} from './carModels.js';

const FLEET = ['aurora', 'sovereign', 'ranger'];

/** One model, merged per material (paint tinted per instance), with simple wheels. */
function fleetModel(id) {
  const car = buildModel(id, {paint: '#ffffff', coarse: true});
  car.group.updateMatrixWorld(true);
  const byMat = new Map();
  car.group.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld), src = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(src.attributes)) if (!['position', 'normal', 'uv'].includes(k)) src.deleteAttribute(k);
    if (!src.attributes.uv) src.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2));
    push(byMat, o.material, src);
  });
  const tyres = [], rims = [];
  for (const w of car.wheels) {
    const r = car.radius, t = new T.CylinderGeometry(r, r, .26, 14, 1); t.rotateZ(Math.PI / 2); t.translate(w.x, w.y, w.z); tyres.push(t.toNonIndexed());
    const rim = new T.CylinderGeometry(r * .72, r * .72, .27, 5, 1); rim.rotateZ(Math.PI / 2); rim.translate(w.x, w.y, w.z); rims.push(rim.toNonIndexed());
  }
  push(byMat, new T.MeshStandardMaterial({color: '#141414', roughness: .8}), mergeGeometries(tyres));
  push(byMat, new T.MeshStandardMaterial({color: '#b8bcc2', roughness: .25, metalness: .9}), mergeGeometries(rims));
  return {paint: car.paint, geos: [...byMat].map(([mat, list]) => [mat, mergeGeometries(list.map(g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }))])};
}

export function buildDisplayCars(scene, lots) {
  const spots = lots.flatMap(l => l.cars || []);
  if (!spots.length) return {count: 0, update() {}};
  const models = FLEET.map(fleetModel);
  const mtx = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), col = new T.Color();
  // One instanced set per model per 1 km cell, drawn only near the camera.
  const cells = new Map();
  for (const s of spots) { const k = Math.floor(s.x / CELL) * 65536 + Math.floor(s.z / CELL); (cells.get(k) || cells.set(k, []).get(k)).push(s); }
  const groups = [];
  for (const list of cells.values()) {
    const g = new T.Group();
    let cx = 0, cz = 0; list.forEach(s => { cx += s.x / list.length; cz += s.z / list.length; });
    models.forEach((M, mi) => {
      const mine = list.filter(s => Math.floor(s.paint * 97) % models.length === mi);
      if (!mine.length) return;
      for (const [mat, geo] of M.geos) {
        const mesh = new T.InstancedMesh(geo, mat, mine.length);
        mine.forEach((s, i) => {
          q.setFromAxisAngle(up, s.yaw); mtx.compose(new T.Vector3(s.x, s.y, s.z), q, new T.Vector3(1, 1, 1)); mesh.setMatrixAt(i, mtx);
          if (mat === M.paint) mesh.setColorAt(i, col.set(PAINTS[Math.floor(s.paint * PAINTS.length) % PAINTS.length][1]));
        });
        mesh.castShadow = mat.name !== 'glass'; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.computeBoundingSphere();
        g.add(mesh);
      }
    });
    scene.add(g); groups.push({g, x: cx, z: cz});
  }
  return {count: spots.length, update(x, z) { for (const c of groups) c.g.visible = Math.hypot(c.x - x, c.z - z) < SHOW; }};
}
const CELL = 1024, SHOW = 1500;
function push(map, mat, g) { if (!map.has(mat)) map.set(mat, []); map.get(mat).push(g); }
