/* What exists around the car, and at what detail.
 *
 * - Roads are drawn everywhere (they are what you see from the hills), merged
 *   into BLOCK-sized meshes, one per material.
 * - Road colliders exist within ROAD_RING tiles of the car.
 * - Terrain tiles: 2 m (with colliders) next to the car, 4 m, then 8 m out to
 *   DETAIL_RING; beyond that the single far mesh shows through.
 * Everything is built from the same pieces the checks validate.
 */
import * as T from 'three';
import {TILE, projectPiece} from './roads.js';
import {geometryFrom, farTerrain} from './terrain.js';
import {tileArrays, farBands} from './terrainCore.js';

const BLOCK = 1024;
const ROAD_RING = 2, DETAIL_RING = 6;
// 2 m (with physics) out to ring 2, so the next tiles are ready before the car arrives.
const lodFor = r => r <= 2 ? 0 : r <= 3 ? 1 : 2;
const PHYSICAL = new Set(['asphalt', 'junction', 'verge', 'gravel', 'barrier', 'concrete', 'sidewalk', 'curb', 'parkway']);

export class Stream {
  constructor({scene, model, ground, pieces, materials, physics}) {
    Object.assign(this, {scene, model, ground, pieces, materials, physics});
    this.tiles = new Map();                 // "tx,tz" -> {mesh, lod}
    this.byTile = new Map();
    for (const p of pieces) { if (!this.byTile.has(p.tile)) this.byTile.set(p.tile, []); this.byTile.get(p.tile).push(p); }
    this.center = null;
    this.rect = null;
    this.buildRoadMeshes();
    this.buildPiers();
    // Terrain is built by a worker; the page only turns arrays into meshes.
    this.pending = new Map();
    this.worker = new Worker(new URL('./terrainWorker.js', import.meta.url), {type: 'module'});
    this.worker.onmessage = ({data}) => this.receive(data);
    this.worker.postMessage({type: 'init', url: new URL('../assets/world/roads.json', import.meta.url).href});
    this.worker.postMessage({type: 'far'});
  }

  receive(data) {
    if (data.type === 'far') {
      this.far = farTerrain(data.bands, this.materials.far);
      this.scene.add(this.far);
    } else if (data.type === 'tile') {
      const want = this.pending.get(data.key);
      this.pending.delete(data.key);
      if (want !== data.lod || !this.center) return;               // superseded meanwhile
      const [tx, tz] = data.key.split(',').map(Number);
      if (Math.max(Math.abs(tx - this.center[0]), Math.abs(tz - this.center[1])) > DETAIL_RING + 1) return;
      this.placeTile(data.key, data.lod, data.arrays);
    }
  }

  buildRoadMeshes() {
    const blocks = new Map();
    for (const p of this.pieces) {
      const key = `${Math.floor(p.x / BLOCK)},${Math.floor(p.z / BLOCK)}`;
      if (!blocks.has(key)) blocks.set(key, new Map());
      const mats = blocks.get(key);
      for (const [mat, part] of Object.entries(p.parts)) {
        const m = mat === 'junction' ? 'asphalt' : mat;
        if (!mats.has(m)) mats.set(m, []);
        mats.get(m).push(part);
      }
    }
    this.roadMeshes = [];
    let vertices = 0;
    for (const mats of blocks.values()) for (const [mat, parts] of mats) {
      let nv = 0, ni = 0;
      for (const p of parts) { nv += p.pos.length / 3; ni += p.index.length; }
      const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), info = new Float32Array(nv * 3);
      const index = new Uint32Array(ni);
      let v = 0, i = 0;
      for (const p of parts) {
        pos.set(p.pos, v * 3); uv.set(p.uv, v * 2); info.set(p.info, v * 3);
        for (let k = 0; k < p.index.length; k++) index[i + k] = p.index[k] + v;
        v += p.pos.length / 3; i += p.index.length;
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setAttribute('uv', new T.BufferAttribute(uv, 2));
      g.setAttribute('rinfo', new T.BufferAttribute(info, 3));
      g.setIndex(new T.BufferAttribute(index, 1));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const mesh = new T.Mesh(g, this.materials[mat]);
      mesh.receiveShadow = true;
      mesh.castShadow = mat === 'barrier' || mat === 'concrete';
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      this.roadMeshes.push(mesh);
      mesh.userData.center = g.boundingSphere.center.clone();
      vertices += nv;
    }
    this.roadVertices = vertices;
  }

  /** Is (x, z) on the carriageway (or pavement) of a road lower than y? */
  roadBelow(x, z, y) {
    const m = this.model, list = m.near(x, z);
    for (let k = 0; k < list.length; k += 2) {
      const r = projectPiece(m.segments[list[k]], list[k + 1], x, z);
      if (r.y < y && r.d < r.h + 3) return true;
    }
    for (const j of m.junctionsNear(x, z)) if (!j.cap && j.plane(x, z) < y && m.junctionZone(j, x, z)) return true;
    return false;
  }
  buildPiers() {
    const piers = [];
    for (const p of this.pieces) if (p.piers) for (const q of p.piers) {
      // Wide decks stand on two columns, narrow ones on one.
      const offsets = q.h > 9 ? [-q.h * .45, q.h * .45] : [0];
      for (const o of offsets) {
        const x = q.x - q.tz * o, z = q.z + q.tx * o;
        if (this.roadBelow(x, z, q.y - 3)) continue;          // never a column in a road passing underneath
        piers.push({x, z, top: q.y - 1.2, drop: q.drop, a: Math.atan2(q.tx, q.tz)});
      }
    }
    const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), this.materials.pier, Math.max(1, piers.length));
    const m = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), up = new T.Vector3(0, 1, 0);
    piers.forEach((p, i) => {
      const h = p.drop + 2;
      m.compose(new T.Vector3(p.x, p.top - h / 2, p.z), q.setFromAxisAngle(up, p.a), s.set(2.2, h, 1.4));
      mesh.setMatrixAt(i, m);
    });
    mesh.count = piers.length;
    mesh.castShadow = mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    mesh.computeBoundingSphere();
    this.scene.add(mesh);
    this.pierCount = piers.length;
  }

  /** Collider for the road pieces of one tile: every face a tyre or bumper can meet. */
  roadCollider(key) {
    const list = this.byTile.get(key);
    if (!list) return;
    let nv = 0, ni = 0;
    for (const p of list) for (const [mat, part] of Object.entries(p.parts)) if (PHYSICAL.has(mat)) { nv += part.pos.length / 3; ni += part.index.length; }
    const pos = new Float32Array(nv * 3), index = new Uint32Array(ni);
    let v = 0, i = 0;
    for (const p of list) for (const [mat, part] of Object.entries(p.parts)) {
      if (!PHYSICAL.has(mat)) continue;
      pos.set(part.pos, v * 3);
      for (let k = 0; k < part.index.length; k++) index[i + k] = part.index[k] + v;
      v += part.pos.length / 3; i += part.index.length;
    }
    this.physics.setMesh('r' + key, pos, index);
  }

  /** Bring everything around (x, z) up to date; spends at most `budget` ms. */
  update(x, z, budget = 6) {
    // Road blocks beyond 5 km are lost in the haze anyway.
    for (const m of this.roadMeshes) m.visible = Math.hypot(m.userData.center.x - x, m.userData.center.z - z) < 5000;
    const cx = Math.floor(x / TILE), cz = Math.floor(z / TILE);
    const start = performance.now();
    const moved = !this.center || this.center[0] !== cx || this.center[1] !== cz;
    this.center = [cx, cz];
    // Road colliders are cheap: always exactly the ring.
    if (moved) {
      const want = new Set();
      for (let i = -ROAD_RING; i <= ROAD_RING; i++) for (let j = -ROAD_RING; j <= ROAD_RING; j++) want.add(`${cx + i},${cz + j}`);
      for (const key of [...this.physics.bodies.keys()]) if (key[0] === 'r' && !want.has(key.slice(1))) this.physics.remove(key);
      for (const key of want) if (!this.physics.has('r' + key)) this.roadCollider(key);
    }
    // Terrain: nearest first, rebuild when the wanted LOD differs.
    const todo = [];
    for (let i = -DETAIL_RING; i <= DETAIL_RING; i++) for (let j = -DETAIL_RING; j <= DETAIL_RING; j++) {
      const r = Math.max(Math.abs(i), Math.abs(j)), key = `${cx + i},${cz + j}`, lod = lodFor(r);
      const tile = this.tiles.get(key);
      if (!tile || tile.lod !== lod) todo.push([r, cx + i, cz + j, key, lod]);
    }
    todo.sort((a, b) => a[0] - b[0]);
    for (const [r, tx, tz, key, lod] of todo) {
      // The tile under the car and its neighbours must have ground now: build
      // those here if the worker has not delivered them. Everything else is
      // asked of the worker, a few at a time.
      if (r <= 1 && !this.tiles.has(key)) { this.placeTile(key, lod, tileArrays(this.ground, tx, tz, lod)); continue; }
      if (this.pending.get(key) === lod) continue;
      if (this.pending.size >= 8) continue;
      this.pending.set(key, lod);
      this.worker.postMessage({type: 'tile', key, tx, tz, lod});
    }
    // Drop tiles that fell well outside the ring.
    for (const [key, tile] of this.tiles) {
      const [tx, tz] = key.split(',').map(Number);
      if (Math.max(Math.abs(tx - cx), Math.abs(tz - cz)) > DETAIL_RING + 1) this.dropTile(key, tile);
    }
    // The far mesh hides inside the largest square of tiles that all exist.
    let ring = 0;
    for (let r = 0; r <= DETAIL_RING + 1; r++) {
      let whole = true;
      for (let i = -r; i <= r && whole; i++) for (let j = -r; j <= r; j++) if (!this.tiles.has(`${cx + i},${cz + j}`)) { whole = false; break; }
      if (!whole) break;
      ring = r;
    }
    const R = this.materials.detailRect.value;
    R.set((cx - ring) * TILE, (cz - ring) * TILE, (cx + ring + 1) * TILE, (cz + ring + 1) * TILE);
    return todo.length;
  }

  placeTile(key, lod, arrays) {
    const old = this.tiles.get(key);
    const {solid, vertices} = arrays;
    const mesh = new T.Mesh(geometryFrom(arrays), this.materials.ground);
    mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    this.scene.add(mesh);
    if (old) this.dropTile(key, old);
    this.tiles.set(key, {mesh, lod});
    if (lod === 0) this.physics.setMesh('t' + key, vertices, solid, true);
    if (lod === 0) this.grass?.addTile(key, arrays, mesh);
  }

  dropTile(key, tile) {
    this.grass?.dropTile(key, tile.mesh);
    this.scene.remove(tile.mesh);
    tile.mesh.geometry.dispose();
    this.tiles.delete(key);
    this.physics.remove('t' + key);
  }

  /** True once every tile within `ring` of the car exists (for loading screens). */
  ready(ring = 1) {
    if (!this.center) return false;
    const [cx, cz] = this.center;
    for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) if (!this.tiles.has(`${cx + i},${cz + j}`)) return false;
    return true;
  }
}
