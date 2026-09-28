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
  const make = (geo, mat) => {
    const mesh = new T.InstancedMesh(geo, mat, spots.length);
    spots.forEach((p, i) => { q.setFromAxisAngle(up, p.yaw); m.compose(new T.Vector3(p.x, p.y, p.z), q, one); mesh.setMatrixAt(i, m); });
    mesh.castShadow = true; mesh.matrixAutoUpdate = false; mesh.computeBoundingSphere(); scene.add(mesh);
    return mesh;
  };
  make(mergeGeometries([pole, arm, base]), metal);
  make(head, glow);
  return spots.length;
}
