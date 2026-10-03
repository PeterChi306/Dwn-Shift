/* Street lamps for an area: LA-style steel poles with a curved arm and an LED
 * head, just behind the kerb. They stand exactly where the road shader paints
 * its night light pools (materials.js: every LAMP metres of arc length,
 * alternating sides), so every pool has a lamp over it.
 */
import * as T from 'three';
import {vec3} from 'three/tsl';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CURB} from './roads.js';
import {inArea} from './buildings.js';
import {LAMP} from './materials.js';

export let lampSpots = [];
export function buildLamps({model, scene, area, night}) {
  const spots = [];
  for (const seg of model.segments) {
    if (!CURB.has(seg.kind) || seg.elevated) continue;
    for (let s = 0; s <= seg.L; s += LAMP) {
      const k = Math.round(s / LAMP), side = k % 2 === 0 ? 1 : -1;
      if (s < seg.cut[0] + 3 || s > seg.L - seg.cut[1] - 3) continue;
      const sec = model.sectionAt(seg, s), off = sec.h + .8;
      const x = sec.x + sec.nx * off * side, z = sec.z + sec.nz * off * side;
      if (!inArea(area, x, z)) continue;
      let clear = true;
      for (const j of model.junctionsNear(x, z)) if (model.junctionZone(j, x, z)) { clear = false; break; }
      if (!clear) continue;
      // Pole faces the road: the arm reaches back over the carriageway.
      spots.push({x, z, y: sec.y + sec.cs * off * side + .15, yaw: Math.atan2(-sec.nx * side, -sec.nz * side)});
    }
  }
  lampSpots = spots;
  // One template: pole, arm, head. The arm points along local +z.
  const pole = new T.CylinderGeometry(.09, .13, 8.5, 8); pole.translate(0, 4.25, 0);
  const arm = new T.CylinderGeometry(.06, .06, 2.4, 6); arm.rotateX(Math.PI / 2); arm.translate(0, 8.4, 1.1);
  const base = new T.CylinderGeometry(.22, .25, .5, 8); base.translate(0, .25, 0);
  const head = new T.BoxGeometry(.38, .14, .8); head.translate(0, 8.35, 2.35);
  const metal = new T.MeshStandardNodeMaterial({color: '#6e7275', roughness: .45, metalness: .7});
  const glow = new T.MeshStandardNodeMaterial({color: '#dcdcd4', roughness: .3});
  glow.emissiveNode = vec3(1, .9, .74).mul(night).mul(6);
  const q = new T.Quaternion(), m = new T.Matrix4(), up = new T.Vector3(0, 1, 0), one = new T.Vector3(1, 1, 1);
  // Performance (2026-10-03): the ~20,000 lamps were ONE instanced mesh per material spanning the whole city, so
  // nothing could cull them: ~2M triangles in the main pass and 2M more in the shadow pass, every frame. Now one
  // set per 400 m cell, culled by the frustum and by distance (updateLamps), with shadows only from the near cells.
  const cells = new Map();
  for (const p of spots) { const k = Math.floor(p.x / CELL) * 65536 + Math.floor(p.z / CELL); (cells.get(k) || cells.set(k, []).get(k)).push(p); }
  const poleGeo = mergeGeometries([pole, arm, base]);
  const make = (geo, mat, list) => {
    const mesh = new T.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => { q.setFromAxisAngle(up, p.yaw); m.compose(new T.Vector3(p.x, p.y, p.z), q, one); mesh.setMatrixAt(i, m); });
    mesh.castShadow = false; mesh.matrixAutoUpdate = false; mesh.computeBoundingSphere(); scene.add(mesh);
    return mesh;
  };
  lampCells = [...cells.values()].map(list => {
    let x = 0, z = 0; for (const p of list) { x += p.x / list.length; z += p.z / list.length; }
    return {x, z, pole: make(poleGeo, metal, list), head: make(head, glow, list), sh: false};
  });
  return spots.length;
}
const CELL = 400, POLES = 1000, HEADS = 3000, SHADOWS = 330;
let lampCells = [];
/** Each frame: poles near the camera, heads (the night glow) further, shadows only close by. */
export function updateLamps(x, z) {
  for (const c of lampCells) {
    const d = Math.hypot(c.x - x, c.z - z) - CELL * .7;
    c.pole.visible = d < POLES; c.head.visible = d < HEADS;
    const sh = d < SHADOWS; if (sh !== c.sh) { c.sh = sh; c.pole.castShadow = c.head.castShadow = sh; }
  }
}
