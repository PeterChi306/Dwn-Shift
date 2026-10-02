/* Terrain meshes from the arrays terrainCore.js builds (on the main thread or
 * in world/terrainWorker.js).
 *
 * - far: one 32 m mesh over the whole map, so the view from the hills reaches
 *   the horizon. Its material discards itself inside the detailed area, so
 *   the two layers never fight.
 * - tiles: TILE-sized patches at 2, 4 or 8 m with skirts. The 2 m tiles are
 *   also the physics ground, so what you see is what the tyres hit.
 */
import * as T from 'three';
export {BOUNDS, LOD_STEP} from './terrainCore.js';

export function geometryFrom(a) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new T.BufferAttribute(a.nor, 3));
  g.setAttribute('color', new T.BufferAttribute(a.col, 3));
  g.setAttribute('wild', new T.BufferAttribute(a.wild, 1));
  g.setIndex(new T.BufferAttribute(a.index, 1));
  g.computeBoundingSphere();
  return g;
}

export function farTerrain(bands, material) {
  const group = new T.Group();
  for (const a of bands) {
    const mesh = new T.Mesh(geometryFrom(a), material);
    mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return group;
}
