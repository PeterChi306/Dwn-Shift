/* Wild grass: real blades on the hillsides, around the camera.
 *
 * One InstancedMesh of blade clumps on a world-aligned grid that follows the
 * camera (the grid snaps, so clumps never swim). Every clump is placed on the
 * GPU: its cell hashes to a jitter, a size, a turn and a colour, and it reads
 * height and density from a small field texture that the CPU fills from the
 * detailed terrain tiles (the same 2 m grid the physics drives on, so a clump
 * stands exactly on the ground the car touches). Density comes from the tile
 * worker: wild ground only, off roads and their verges, junctions, pads and
 * rock; the CPU also clears building footprints.
 */
import * as T from 'three';
import {Fn, uniform, attribute, positionGeometry, vec2, vec3, vec4, float, int, ivec2, floor, fract, sin, cos, dot,
  mix, smoothstep, step, clamp, length, max, min, time, textureLoad, texture} from 'three/tsl';
import {TILE} from './roads.js';

const G = 208, S = .5;                   // instance grid: 208 x 208 clumps, 0.5 m apart (~104 m across)
const B = 26, NB = G / B;                // drawn in NB x NB blocks of B x B clumps, each culled on its own
const CW = 8, CN = 256 / CW;             // coarse field cells (8 m) for the per-block tests
const R = G * S * .5 * .96;              // fade-out radius
const STEP = 2, FW = 128;                // field: 2 m texels, 256 m across
const N = TILE / STEP + 1;               // vertices per tile side

/** A clump: `blades` curved, tapering blades leaning out from the centre.
 *  Attributes: position (template, ~1 m tall), uv.y = height along blade,
 *  `blade` = per-blade random. Normals point up: grass is lit like the ground
 *  it stands in, not like a stack of flat cards. */
function clumpGeometry(blades = 13, segs = 3) {
  const pos = [], uv = [], rnd = [], nor = [], idx = [];
  let seed = 7;
  const r = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  for (let b = 0; b < blades; b++) {
    const yaw = r() * Math.PI * 2, lean = .2 + r() * .7, h = .3 + r() * .65, w = .01 + r() * .012, off = r() * .16;
    const dx = Math.cos(yaw), dz = Math.sin(yaw), sx = -dz, sz = dx, k = r();
    const base = pos.length / 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs, bend = lean * t * t * h, y = h * t * (1 - .15 * t * lean);
      const cx = dx * (off + bend), cz = dz * (off + bend), ww = w * (1 - t * .92);
      pos.push(cx - sx * ww, y, cz - sz * ww, cx + sx * ww, y, cz + sz * ww);
      uv.push(0, t, 1, t); rnd.push(k, k); nor.push(0, 1, 0, 0, 1, 0);
      if (s) { const a = base + (s - 1) * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('blade', new T.Float32BufferAttribute(rnd, 1));
  g.setIndex(idx);
  return g;
}

export class Grass {
  constructor(scene, {occupied = () => null, wind = null} = {}) {
    this.tiles = new Map();                // key -> {mesh, x0, z0, y: Float32Array, d: Float32Array}
    this.occupied = occupied;
    this.origin = null;
    this.data = new Float32Array(FW * FW * 4);
    this.field = new T.DataTexture(this.data, FW, FW, T.RGBAFormat, T.FloatType);
    this.field.magFilter = this.field.minFilter = T.NearestFilter;
    this.field.needsUpdate = true;
    this.dirty = true;

    const cam = this.cam = uniform(new T.Vector3());
    const org = this.org = uniform(new T.Vector2(1e9, 1e9));
    const windOn = this.windOn = wind || uniform(1);
    const field = this.field;

    // Global cell index of this instance: world-aligned, so hashes are stable.
    const cellA = attribute('cell', 'vec2'), ix = cellA.x, iz = cellA.y;
    const cell = floor(cam.xz.div(S)).add(vec2(ix, iz)).sub(G / 2);
    const hash = k => fract(sin(dot(cell.mod(4096), vec2(12.9898 + k * 3.1, 78.233 + k * 1.7))).mul(43758.5453 + k * 11.3));
    const h1 = hash(0), h2 = hash(1), h3 = hash(2), h4 = hash(3), h5 = hash(4), h6 = hash(5);
    const wp = cell.add(vec2(h1, h2)).mul(S);
    // Field lookup, bilinear by hand (float textures are not filterable).
    const f = wp.sub(org).div(STEP).clamp(0, FW - 1.001), fi = floor(f), fr = f.sub(fi);
    const at = (a, b) => textureLoad(field, ivec2(int(fi.x.add(a)), int(fi.y.add(b))));
    const s00 = at(0, 0), s10 = at(1, 0), s01 = at(0, 1), s11 = at(1, 1);
    const sm = mix(mix(s00, s10, fr.x), mix(s01, s11, fr.x), fr.y);
    const inside = step(0, wp.sub(org).x).mul(step(0, wp.sub(org).y)).mul(step(wp.sub(org).x, (FW - 1) * STEP)).mul(step(wp.sub(org).y, (FW - 1) * STEP));
    const dist = length(wp.sub(cam.xz));
    // Thin out with distance, and let the survivors grow to cover for it.
    const thin = smoothstep(R * .35, R * .8, dist);
    const keep = step(h3, sm.y.mul(1.7)).mul(step(thin.mul(.6), h6)).mul(inside);
    const fade = float(1).sub(smoothstep(R * .78, R, dist));
    const size = keep.mul(fade).mul(h4.mul(.7).add(.55)).mul(sm.y.mul(.5).add(.6)).mul(thin.mul(.35).add(1));
    this.size = size;

    const mat = new T.MeshStandardNodeMaterial({side: T.DoubleSide, roughness: .85, metalness: 0});
    const t = attribute('uv', 'vec2').y, blade = attribute('blade', 'float');
    mat.positionNode = Fn(() => {
      const a = h5.mul(6.283), ca = cos(a), sa = sin(a);
      const p = positionGeometry.mul(size);
      const rp = vec3(p.x.mul(ca).sub(p.z.mul(sa)), p.y, p.x.mul(sa).add(p.z.mul(ca)));
      // Wind: the same WSW sea breeze and travelling gusts as the trees.
      const wd = vec2(.88, -.47), down = dot(wp, wd);
      const gust = sin(time.mul(.9).sub(down.mul(.1))).mul(.5).add(.5).mul(sin(time.mul(.23).sub(down.mul(.011)).add(1.7)).mul(.4).add(.6)).mul(.75).add(.25);
      const sway = gust.mul(sin(time.mul(2.1).add(h1.mul(6.28)).add(blade.mul(3))).mul(.35).add(.75)).mul(windOn).mul(t.mul(t)).mul(.28).mul(size);
      return vec3(wp.x, sm.x, wp.y).add(rp).add(vec3(wd.x.mul(sway), sway.mul(-.25), wd.y.mul(sway)));
    })();
    // Straw, from shaded base to sun-bleached tip; a few blades still olive,
    // and whole clumps vary (some wild oats paler, some brome redder).
    mat.colorNode = Fn(() => {
      // Linear colours (the renderer's working space), not sRGB.
      const hue = h2.add(blade.mul(.5)).fract();
      const straw = mix(vec3(.3, .19, .07), vec3(.46, .33, .14), hue);
      const olive = vec3(.075, .085, .03);
      const tip = vec3(.6, .47, .25);
      const c = mix(straw, olive, step(.8, blade).mul(step(.45, h4)));
      // Shaded low in the clump, sun-bleached toward the tips; the seed heads
      // (last fifth of the taller blades) pale and a touch pink.
      const lit = mix(c.mul(.55), mix(c, tip, smoothstep(.5, 1, t).mul(.7)), smoothstep(0, .75, t));
      const head = step(.8, t).mul(step(blade, .55));
      return mix(lit, vec3(.62, .5, .36), head.mul(.6)).mul(h1.mul(.25).add(.85));
    })();

    // One mesh per block; all share the clump buffers, each has its cells.
    const geo = clumpGeometry();
    this.blocks = [];
    for (let bj = 0; bj < NB; bj++) for (let bi = 0; bi < NB; bi++) {
      const g = new T.BufferGeometry();
      for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
      g.setIndex(geo.index);
      const cells = new Float32Array(B * B * 2);
      for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) cells.set([bi * B + i, bj * B + j], (j * B + i) * 2);
      g.setAttribute('cell', new T.InstancedBufferAttribute(cells, 2));
      const mesh = new T.InstancedMesh(g, mat, B * B);
      mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      mesh.visible = false;
      scene.add(mesh);
      this.blocks.push({mesh, bi, bj});
    }
    this.coarse = new Float32Array(CN * CN * 3);   // max density, min y, max y
    this.frustum = new T.Frustum(); this.box = new T.Box3(); this.pm = new T.Matrix4();
  }

  /** A detailed (lod 0) tile arrived: keep its heights and grass density. */
  addTile(key, arrays, mesh) {
    if (!arrays.grass) return;
    const [tx, tz] = key.split(',').map(Number), v = arrays.vertices, y = new Float32Array(N * N);
    for (let k = 0; k < N * N; k++) y[k] = v[k * 3 + 1];
    this.tiles.set(key, {mesh, x0: tx * TILE, z0: tz * TILE, y, d: arrays.grass});
    this.dirty = true;
  }
  dropTile(key, mesh) {
    const t = this.tiles.get(key);
    if (t && t.mesh === mesh) { this.tiles.delete(key); this.dirty = true; }
  }

  /** Per frame: move the grid with the camera; refill the field when the
   *  camera nears its edge or tiles changed. */
  update(camera) {
    const p = camera.position;
    this.cam.value.copy(p);
    const half = FW * STEP / 2, o = this.origin;
    const off = !o || Math.abs(p.x - (o.x + half)) > 48 || Math.abs(p.z - (o.z + half)) > 48;
    if (off || this.dirty) {
      if (off) this.origin = {x: Math.floor((p.x - half) / 16) * 16, z: Math.floor((p.z - half) / 16) * 16};
      this.dirty = false;
      this.fill();
    }
    this.cull(camera);
  }
  /** Show only blocks that have grass and are in view. */
  cull(camera) {
    camera.updateMatrixWorld();
    const p = camera.position, {x: ox, z: oz} = this.origin, C = this.coarse;
    this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pm, camera.coordinateSystem, camera.reversedDepth);
    const c0x = Math.floor(p.x / S) - G / 2, c0z = Math.floor(p.z / S) - G / 2;
    for (const b of this.blocks) {
      const x0 = (c0x + b.bi * B) * S - 1, z0 = (c0z + b.bj * B) * S - 1, x1 = x0 + B * S + 2, z1 = z0 + B * S + 2;
      const i0 = Math.max(0, Math.floor((x0 - ox) / CW)), i1 = Math.min(CN - 1, Math.floor((x1 - ox) / CW));
      const j0 = Math.max(0, Math.floor((z0 - oz) / CW)), j1 = Math.min(CN - 1, Math.floor((z1 - oz) / CW));
      let d = 0, y0 = Infinity, y1 = -Infinity;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const o = (j * CN + i) * 3;
        if (C[o] > 0) { d = Math.max(d, C[o]); y0 = Math.min(y0, C[o + 1]); y1 = Math.max(y1, C[o + 2]); }
      }
      if (d <= 0) { b.mesh.visible = false; continue; }
      this.box.min.set(x0, y0 - .5, z0); this.box.max.set(x1, y1 + 1.5, z1);
      b.mesh.visible = this.frustum.intersectsBox(this.box);
    }
  }
  fill() {
    const {x: ox, z: oz} = this.origin, D = this.data, occ = this.occupied(), C = this.coarse;
    for (let k = 0; k < CN * CN; k++) { C[k * 3] = 0; C[k * 3 + 1] = Infinity; C[k * 3 + 2] = -Infinity; }
    for (let j = 0; j < FW; j++) for (let i = 0; i < FW; i++) {
      const x = ox + i * STEP, z = oz + j * STEP, o = (j * FW + i) * 4;
      const t = this.tiles.get(`${Math.floor(x / TILE)},${Math.floor(z / TILE)}`);
      if (!t) { D[o] = 0; D[o + 1] = 0; continue; }
      const k = Math.round((z - t.z0) / STEP) * N + Math.round((x - t.x0) / STEP);
      D[o] = t.y[k];
      D[o + 1] = occ && occ.hasAt(x, z) ? 0 : t.d[k];
      const c = (Math.floor(j * STEP / CW) * CN + Math.floor(i * STEP / CW)) * 3;
      C[c] = Math.max(C[c], D[o + 1]); C[c + 1] = Math.min(C[c + 1], D[o]); C[c + 2] = Math.max(C[c + 2], D[o]);
    }
    this.org.value.set(ox, oz);
    this.field.needsUpdate = true;
  }
}
