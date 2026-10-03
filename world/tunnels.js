/* Tunnels you can drive through (2026-09-26).
 *
 * roads.js decides where a tunnel road is actually BORED (real hill over it);
 * here each bored run gets:
 *   - a tube: tiled walls to 3 m, painted concrete above, an elliptical arch,
 *     a continuous run of ceiling lights on each side (emissive, so bloom and
 *     the dark tunnel exposure make them read), all facing inward;
 *   - a portal headwall at every mouth that opens onto daylight: a concrete
 *     face with the arch cut out, wide and tall enough to close the hillside
 *     round the tube, with a darker coping band;
 *   - wall colliders (the road ribbon underneath is already solid).
 * 2026-10-02: one mesh per bore (they are km apart, so each can be culled),
 * the tunnel's name on a plate over every mouth, and pairs of jet fans
 * under the crown of the long bores.
 * Everything is built once at load: there are ~7.5 km of bores.
 */
import * as T from 'three';
import {Fn, uv, vec3, float, fract, step, mix, smoothstep, abs, texture, positionWorld} from 'three/tsl';
import {VERGE} from './roads.js';

const WALL = 4.3, RISE = 2.3, TILE_TOP = 3;          // wall height, arch rise, tiled band

const FAN_EVERY = 180, FAN_MIN = 400;               // jet fan pairs in bores longer than FAN_MIN

export function buildTunnels({model, ground, scene, physics, textures}) {
  const tubeList = [], portals = [], fans = [];
  const colliders = {v: [], i: []};
  let bores = 0, length = 0;
  for (const seg of model.segments) {
    if (seg.kind !== 'tunnel') continue;
    const runs = seg.bores || [];
    for (const [r0, r1] of runs) {
      if (r1 - r0 < 5) continue;
      bores++; length += r1 - r0;
      // A mouth opens where the run meets open road; a run that reaches the
      // segment's end continues into the next tunnel segment (no portal) unless
      // that end is where the road leaves the tunnel kind.
      const openAt = (s, atStart) => {
        if (atStart ? s > .5 : s < seg.L - .5) return true;
        const node = atStart ? seg.a : seg.b;
        return !model.segments.some(o => o !== seg && o.kind === 'tunnel' && (o.a === node || o.b === node));
      };
      const mouth0 = openAt(r0, true), mouth1 = openAt(r1, false);
      // Extend the tube a little out of the hill at each mouth, under the headwall.
      const s0 = Math.max(0, r0 - (mouth0 ? 2 : 0)), s1 = Math.min(seg.L, r1 + (mouth1 ? 2 : 0));
      const tubes = {pos: [], nor: [], uv: [], index: []};
      tube(model, seg, s0, s1, tubes, colliders);
      tubeList.push(tubes);
      if (mouth0) portals.push({sec: model.sectionAt(seg, s0), dir: -1, seg});
      if (mouth1) portals.push({sec: model.sectionAt(seg, s1), dir: 1, seg});
      if (r1 - r0 > FAN_MIN) for (let s = r0 + 120; s < r1 - 100; s += FAN_EVERY) fans.push(model.sectionAt(seg, s));
    }
  }
  const group = new T.Group();
  const tubeMat = tubeMaterial(textures);
  for (const tubes of tubeList) {
    if (!tubes.index.length) continue;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(tubes.pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(tubes.nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(tubes.uv, 2));
    g.setIndex(tubes.index);
    g.computeBoundingSphere();
    const mesh = new T.Mesh(g, tubeMat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (fans.length) group.add(jetFans(fans));
  const concrete = new T.MeshStandardNodeMaterial({roughness: .9, metalness: 0, side: T.DoubleSide});
  concrete.colorNode = vec3(.63, .6, .56).mul(textures?.concrete ? texture(textures.concrete.color, positionWorld.xy.add(positionWorld.zy).div(3)).r.mul(.35).add(.72) : float(1));
  const coping = new T.MeshStandardMaterial({color: '#4a4845', roughness: .8, side: T.DoubleSide});
  const plates = new Map();
  for (const p of portals) {
    const {geo, cap} = portal(p, ground);
    const m = new T.Mesh(geo, concrete); m.castShadow = m.receiveShadow = true; group.add(m);
    const c = new T.Mesh(cap, coping); c.castShadow = true; group.add(c);
    const name = (p.seg.name || '').toUpperCase();
    if (name) {
      if (!plates.has(name)) plates.set(name, namePlate(name));
      group.add(placePlate(plates.get(name), p));
    }
    const pos = geo.attributes.position.array, base = colliders.v.length / 3, count = pos.length / 3;
    colliders.v.push(...pos);
    if (geo.index) for (const k of geo.index.array) colliders.i.push(base + k);
    else for (let k = 0; k < count; k++) colliders.i.push(base + k);         // ExtrudeGeometry is non-indexed
  }
  { const f = o => { o.updateMatrix(); o.matrixAutoUpdate = false; o.children.forEach(f); }; f(group); }
  group.userData.farCull = 2500;          // portals and linings: hidden when far (world.js)
  scene.add(group);
  if (physics && colliders.i.length) physics.setMesh('tunnels', new Float32Array(colliders.v), new Uint32Array(colliders.i));
  return {group, bores, length: Math.round(length), portals: portals.length, fans: fans.length * 2};
}

/** The tunnel's name, white on dark green, as a canvas-textured plate. */
function namePlate(name) {
  const H = 96, ctx0 = document.createElement('canvas').getContext('2d');
  ctx0.font = '600 58px Outfit, Arial, sans-serif';
  const W = Math.ceil(ctx0.measureText(name).width + 90);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#1f5a3c'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#e8efe9'; ctx.lineWidth = 5; ctx.strokeRect(9, 9, W - 18, H - 18);
  ctx.fillStyle = '#f2f5f2'; ctx.font = '600 58px Outfit, Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name, W / 2, H / 2 + 3);
  const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
  const mat = new T.MeshStandardMaterial({map: tex, roughness: .6, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: .12});
  return {mat, aspect: W / H};
}

/** A plate on the headwall's outer face, centred over the arch. */
function placePlate({mat, aspect}, {sec, dir, seg}) {
  const W = halfOf(seg, sec), h = .95, w = Math.min(2 * W - 1, h * aspect), out = [sec.tx * dir, sec.tz * dir];
  const mesh = new T.Mesh(new T.PlaneGeometry(w, Math.min(h, w / aspect)), mat);
  // Right-handed frame facing out of the hill: X = up x out, so the text reads left to right.
  const m = new T.Matrix4().makeBasis(new T.Vector3(out[1], 0, -out[0]), new T.Vector3(0, 1, 0), new T.Vector3(out[0], 0, out[1]));
  m.setPosition(sec.x + out[0] * .66, sec.y + WALL + RISE + .62, sec.z + out[1] * .66);
  mesh.applyMatrix4(m);
  return mesh;
}

/** Pairs of jet fans hung under the crown: a drum with a darker intake ring, on a hanger. */
function jetFans(sections) {
  const drum = new T.CylinderGeometry(.56, .56, 3.2, 16, 1, false); drum.rotateX(Math.PI / 2);
  const hanger = new T.BoxGeometry(.12, .7, 1.6); hanger.translate(0, .85, 0);
  const g = mergeSimple([drum, hanger]);
  const mat = new T.MeshStandardMaterial({color: '#8d9296', metalness: .6, roughness: .45});
  const n = sections.length * 2, mesh = new T.InstancedMesh(g, mat, n);
  const m = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), one = new T.Vector3(1, 1, 1);
  let k = 0;
  for (const sec of sections) for (const side of [-1, 1]) {
    q.setFromAxisAngle(up, Math.atan2(sec.tx, sec.tz));
    const u = side * 2.6;
    m.compose(new T.Vector3(sec.x + sec.nx * u, sec.y + sec.cs * u + WALL + RISE - 1.25, sec.z + sec.nz * u), q, one);
    mesh.setMatrixAt(k++, m);
  }
  mesh.computeBoundingSphere();
  return mesh;
}

/** Half-width of the tube for a section: carriageway, verge, a walkway ledge. */
const halfOf = (seg, sec) => sec.h + (VERGE[seg.kind] ?? .8) + .6;

/** Cross-section, left to right over the top, as [u (lateral), v (height)]. */
function profile(W) {
  const out = [[-W, -.3], [-W, TILE_TOP], [-W, WALL]];
  for (let k = 1; k < 12; k++) { const a = Math.PI - k / 12 * Math.PI; out.push([Math.cos(a) * W, WALL + Math.sin(a) * RISE]); }
  out.push([W, WALL], [W, TILE_TOP], [W, -.3]);
  return out;
}

function tube(model, seg, s0, s1, out, col) {
  const n = Math.max(2, Math.ceil((s1 - s0) / 3));
  const rows = [];
  for (let k = 0; k <= n; k++) {
    const s = s0 + (s1 - s0) * k / n, sec = model.sectionAt(seg, s), W = halfOf(seg, sec), prof = profile(W);
    rows.push(prof.map(([u, v], q) => {
      // Inward normal: toward the tube axis at arch height, level on the walls.
      const cy = WALL - RISE * .3, nx = -u, ny = cy - v, l = Math.hypot(nx, ny) || 1;
      return {p: [sec.x + sec.nx * u, sec.y + sec.cs * u + v, sec.z + sec.nz * u],
        n: [sec.nx * nx / l, ny / l, sec.nz * nx / l], uv: [v, s], v};
    }));
  }
  const cols = rows[0].length, base = out.pos.length / 3, cbase = col.v.length / 3;
  for (const r of rows) for (const q of r) { out.pos.push(...q.p); out.nor.push(...q.n); out.uv.push(q.uv[0], q.uv[1]); col.v.push(...q.p); }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
    // Faces point INTO the tube: check with the first quad's geometry.
    out.index.push(base + a, base + c, base + b, base + b, base + c, base + d);
    col.i.push(cbase + a, cbase + c, cbase + b, cbase + b, cbase + c, cbase + d);
  }
  // Fix winding once per tube if it faces outward.
  const A = rows[0][1].p, B = rows[0][2].p, C = rows[1][1].p, N = rows[0][1].n;
  const u = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], v = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
  const g = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (g[0] * N[0] + g[1] * N[1] + g[2] * N[2] < 0) {
    const first = out.index.length - (rows.length - 1) * (cols - 1) * 6;
    for (let k = first; k < out.index.length; k += 3) [out.index[k + 1], out.index[k + 2]] = [out.index[k + 2], out.index[k + 1]];
  }
}

/** A headwall facing out of the hill, with the arch cut out of it.
 *  It is FITTED to the hillside: its top follows the ground just behind it
 *  (never lower than the arch plus a lintel, never higher than full height),
 *  it ends where the hill has run out, and the wing walls retain only as
 *  much hill as there actually is. A fixed slab stood free in the open
 *  wherever a mouth was close to a junction or a saddle. */
function portal({sec, dir, seg}, ground) {
  const W = halfOf(seg, sec), H = WALL + RISE + 4.2, LINTEL = WALL + RISE + 1.4, MAXW = W + 14;   // MAXW mirrors ground.js mouths() (hw = h + 16)
  const tx = sec.tx * dir, tz = sec.tz * dir;           // out of the hill
  // Ground height relative to the road at lateral u, `back` metres into the hill.
  const rel = (u, back) => ground ? ground.height(sec.x + sec.nx * u - tx * back, sec.z + sec.nz * u - tz * back) - sec.y : H;
  const topAt = u => {
    const g = Math.max(rel(u, 2.5), rel(u, 6) - 1);
    return Math.min(H, Math.max(Math.abs(u) <= W + 1.2 ? LINTEL : .9, g + .5));
  };
  // Headwall ends where the hill beside it drops below knee height.
  const ends = [-1, 1].map(side => {
    let u = W + 1.2;
    while (u < MAXW && topAt(side * (u + 1)) > 1.6) u += 1;
    return side * u;
  });
  const N = 24, top = [];
  for (let k = 0; k <= N; k++) { const u = ends[0] + (ends[1] - ends[0]) * k / N; top.push([u, topAt(u)]); }
  const shape = new T.Shape();
  shape.moveTo(ends[0], -2.5); shape.lineTo(ends[1], -2.5);
  for (let k = N; k >= 0; k--) shape.lineTo(top[k][0], top[k][1]);
  shape.closePath();
  const hole = new T.Path();
  hole.moveTo(-W, -.3); hole.lineTo(W, -.3); hole.lineTo(W, WALL);
  for (let k = 1; k < 16; k++) { const a = k / 16 * Math.PI; hole.lineTo(Math.cos(a) * W, WALL + Math.sin(a) * RISE); }
  hole.lineTo(-W, WALL); hole.closePath();
  shape.holes.push(hole);
  const geo = new T.ExtrudeGeometry(shape, {depth: 1.2, bevelEnabled: false});
  // Coping: a dark band riding the headwall's (stepped) top edge.
  const cap = strip(top.map(([u, y]) => [u, y, 0]), .5, 1.8, -.3);
  // Wing walls: retaining walls that run out along the cutting from each end
  // of the headwall. Each post's top is the hill behind it (outside the
  // wall), so the wall holds back exactly the hillside there and shrinks to a
  // kerb where there is none.
  const wings = [-1, 1].map(side => {
    const LEN = 16, n = 8, u0 = side * (W + 1.4), rows = [];
    for (let k = 0; k <= n; k++) {
      const zz = k / n * LEN, u = u0 + side * zz * .12;
      const hill = rel(u + side * 1.2, -zz - .6) + .3;
      const t = Math.min(topAt(u0), Math.max(.6, Math.min(hill, H - (H - 1.1) * Math.min(1, zz / LEN) ** .8 + 3)));
      rows.push([u, t, zz + .6]);
    }
    return wall(rows, .9);
  });
  const geoAll = mergeSimple([geo, ...wings]);
  // Local: x lateral, y up, z along the road (extrusion). Face outward (dir).
  const m = new T.Matrix4();
  // Basis: X = road normal, Y = up, Z = travel direction out of the hill.
  m.makeBasis(new T.Vector3(sec.nx, 0, sec.nz), new T.Vector3(0, 1, 0), new T.Vector3(tx, 0, tz));
  m.setPosition(sec.x - tx * .6, sec.y, sec.z - tz * .6);
  geoAll.applyMatrix4(m); cap.applyMatrix4(m);
  return {geo: geoAll, cap};
}

/** A thick band of height `h` and depth `d` (along +z from z0) over a polyline
 *  of [u, y, _] points: top, front and back faces. */
function strip(pts, h, d, z0) {
  const pos = [];
  const quad = (a, b, c, e) => pos.push(...a, ...b, ...c, ...a, ...c, ...e);
  for (let i = 0; i < pts.length - 1; i++) {
    const [u0, y0] = pts[i], [u1, y1] = pts[i + 1];
    const A = [u0, y0 + h, z0], B = [u1, y1 + h, z0], C = [u1, y1 + h, z0 + d], D = [u0, y0 + h, z0 + d];
    quad(A, D, C, B);                                                         // top
    quad([u0, y0, z0], A, B, [u1, y1, z0]);                                   // back
    quad([u0, y0, z0 + d], [u1, y1, z0 + d], C, D);                           // front
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.computeVertexNormals();
  return g;
}

/** A wall of thickness `t` from y = -2.5 up to per-post tops; posts are [u, top, z]. */
function wall(rows, t) {
  const pos = [];
  const quad = (a, b, c, e) => pos.push(...a, ...b, ...c, ...a, ...c, ...e);
  for (let i = 0; i < rows.length - 1; i++) {
    const [u0, y0, z0] = rows[i], [u1, y1, z1] = rows[i + 1];
    for (const s of [-1, 1]) {
      const a = [u0 + s * t / 2, -2.5, z0], b = [u1 + s * t / 2, -2.5, z1], c = [u1 + s * t / 2, y1, z1], e = [u0 + s * t / 2, y0, z0];
      if (s > 0) quad(a, b, c, e); else quad(a, e, c, b);
    }
    quad([u0 - t / 2, y0, z0], [u0 + t / 2, y0, z0], [u1 + t / 2, y1, z1], [u1 - t / 2, y1, z1]);   // top
  }
  const [ul, yl, zl] = rows[rows.length - 1];
  quad([ul - t / 2, -2.5, zl], [ul + t / 2, -2.5, zl], [ul + t / 2, yl, zl], [ul - t / 2, yl, zl]);  // end
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  g.computeVertexNormals();
  return g;
}

function tubeMaterial(textures) {
  const mat = new T.MeshStandardNodeMaterial({roughness: .45, metalness: 0, side: T.DoubleSide});
  const height = uv().x, s = uv().y;                       // metres above the road, metres along it
  // Cream glazed tiles to TILE_TOP (0.3 x 0.15 m with grout), dark paint above.
  const grout = step(.94, fract(s.div(.3))).max(step(.9, fract(height.div(.15))));
  const tiles = mix(vec3(.86, .83, .74), vec3(.42, .4, .36), grout);
  const dirt = textures?.concrete ? texture(textures.concrete.color, positionWorld.xz.div(6)).r.mul(.3).add(.75) : float(1);
  const paint = vec3(.28, .28, .29).mul(dirt);
  // A soot band where the tiles meet the paint.
  mat.colorNode = Fn(() => mix(paint, tiles.mul(float(1).sub(smoothstep(TILE_TOP - .6, TILE_TOP, height)).mul(.25).add(.75)), step(height, TILE_TOP)))();
  // Light strips at the arch springing, both sides: 1.8 m on, 1.2 m off.
  const lampRow = float(1).sub(smoothstep(0, .12, abs(height.sub(WALL + .35))));
  const lampOn = step(fract(s.div(3)), .6);
  mat.emissiveNode = vec3(1, .86, .62).mul(lampRow.mul(lampOn)).mul(6);
  return mat;
}

/** Concatenate geometries (position + normal only), non-indexed. */
function mergeSimple(list) {
  const pos = [], nor = [];
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  return out;
}

/* Covered freeway (2026-10-02): a cut-and-cover box over the 10 east of the
 * Pacific rest area. Not a bore — a concrete structure on the flat: side
 * walls, a roof slab, pillars down the median, portal faces with a name
 * panel, light strips and jet fans under the roof. `model.galleries` lets
 * world.js give it the tunnel light and acoustics and keep the camera under
 * its roof. */
const GALLERIES = [{name: 'SANTA MONICA COVERED SECTION', from: [-6440, 2318.6], to: [-6100, 2303.2]}];
export function buildGalleries({model, scene, physics}) {
  model.galleries = [];
  const group = new T.Group(), wallC = {v: [], i: []};
  const concrete = new T.MeshStandardMaterial({color: '#b9b4aa', roughness: .85, side: T.DoubleSide});
  const dark = new T.MeshStandardMaterial({color: '#5d5a55', roughness: .9, side: T.DoubleSide});
  const lamp = new T.MeshBasicMaterial({color: '#fff1d6', toneMapped: false, side: T.DoubleSide});
  for (const G of GALLERIES) {
    const a = model.nearest(G.from[0], G.from[1]), b = model.nearest(G.to[0], G.to[1]);
    if (!a || !b || a.seg !== b.seg) continue;
    const seg = a.seg, s0 = Math.min(a.s, b.s), s1 = Math.max(a.s, b.s);
    model.galleries.push({seg, s0, s1});
    const H = 7.2, pos = [], idx = [], dpos = [], didx = [], lpos = [], lidx = [];
    const quad = (P, I, A, B, C, D) => { const n = P.length / 3; P.push(...A, ...B, ...C, ...D); I.push(n, n + 1, n + 2, n, n + 2, n + 3); };
    const n = Math.ceil((s1 - s0) / 4), rows = [];
    for (let k = 0; k <= n; k++) {
      const s = s0 + (s1 - s0) * k / n, q = model.sectionAt(seg, s), W = q.h + 1.8;
      const at = (u, v) => [q.x + q.nx * u, q.y + v, q.z + q.nz * u];
      rows.push({q, W, at, s});
    }
    for (let k = 0; k < n; k++) {
      const A = rows[k], B = rows[k + 1];
      for (const sd of [-1, 1]) {
        quad(pos, idx, A.at(sd * A.W, -.3), B.at(sd * B.W, -.3), B.at(sd * B.W, H), A.at(sd * A.W, H));             // inner wall face
        quad(dpos, didx, A.at(sd * (A.W + .8), -.3), B.at(sd * (B.W + .8), -.3), B.at(sd * (B.W + .8), H + .8), A.at(sd * (A.W + .8), H + .8));   // outer face
        const vb = wallC.v.length / 3; wallC.v.push(...A.at(sd * A.W, -.5), ...B.at(sd * B.W, -.5), ...B.at(sd * B.W, H), ...A.at(sd * A.W, H)); wallC.i.push(vb, vb + 1, vb + 2, vb, vb + 2, vb + 3);
        // Light strips: two rows over each carriageway, 3 m on, 1 m off.
        if (k % 1 === 0) for (const u of [.35, .75]) { const uu = sd * A.q.h * u; quad(lpos, lidx, A.at(uu - .15, H - .06), A.at(uu + .15, H - .06), B.at(uu + .15, H - .06), B.at(uu - .15, H - .06)); }
      }
      quad(pos, idx, A.at(-A.W, H), B.at(-B.W, H), B.at(B.W, H), A.at(A.W, H));                                    // roof underside
      quad(dpos, didx, A.at(-A.W - .8, H + .8), A.at(A.W + .8, H + .8), B.at(B.W + .8, H + .8), B.at(-B.W - .8, H + .8));   // roof top
    }
    // Median pillars every 12 m; jet fans every 90 m over each carriageway.
    const pil = new T.BoxGeometry(.9, H, .9);
    for (let s = s0 + 6; s < s1; s += 12) { const q = model.sectionAt(seg, s), m = new T.Mesh(pil, concrete); m.position.set(q.x, q.y + H / 2, q.z); m.rotation.y = Math.atan2(q.tx, q.tz); m.castShadow = true; group.add(m); }
    const fan = new T.CylinderGeometry(.55, .55, 3, 14); fan.rotateX(Math.PI / 2);
    const fanM = new T.MeshStandardMaterial({color: '#8d9296', metalness: .6, roughness: .45});
    for (let s = s0 + 45; s < s1 - 30; s += 90) for (const sd of [-1, 1]) { const q = model.sectionAt(seg, s), m = new T.Mesh(fan, fanM); m.position.set(q.x + q.nx * sd * q.h * .55, q.y + H - .8, q.z + q.nz * sd * q.h * .55); m.rotation.y = Math.atan2(q.tx, q.tz); group.add(m); }
    // Portal faces: a deep header over the opening, the section's name on it.
    for (const [r, out] of [[rows[0], -1], [rows[rows.length - 1], 1]]) {
      const {q, W, at} = r, tx = q.tx * out, tz = q.tz * out;
      const off = p => [p[0] + tx * .4, p[1], p[2] + tz * .4];
      quad(dpos, didx, off(at(-W - .8, H - .4)), off(at(W + .8, H - .4)), off(at(W + .8, H + 2.2)), off(at(-W - .8, H + 2.2)));
      quad(dpos, didx, at(-W - .8, H + .8), at(W + .8, H + .8), off(at(W + .8, H + 2.2)), off(at(-W - .8, H + 2.2)));
      const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 128; const c = cv.getContext('2d');
      c.fillStyle = '#23272c'; c.fillRect(0, 0, 2048, 128); c.fillStyle = '#e8e4da'; c.font = '700 70px Outfit, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(G.name, 1024, 68);
      const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
      const sign = new T.Mesh(new T.PlaneGeometry(24, 1.5), new T.MeshStandardMaterial({map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: .5}));
      const p = off(at(0, H + .9)); sign.position.set(p[0] + tx * .03, p[1], p[2] + tz * .03); sign.rotation.y = Math.atan2(tx, tz); group.add(sign);
    }
    const mk = (P, I, mat, shadow) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals(); const m = new T.Mesh(g, mat); m.castShadow = shadow; m.receiveShadow = true; group.add(m); };
    mk(pos, idx, concrete, false); mk(dpos, didx, dark, true); mk(lpos, lidx, lamp, false);
  }
  { const f = o => { o.updateMatrix(); o.matrixAutoUpdate = false; o.children.forEach(f); }; f(group); }
  group.userData.farCull = 2500;          // portals and linings: hidden when far (world.js)
  scene.add(group);
  if (physics && wallC.i.length) physics.setMesh('galleries', new Float32Array(wallC.v), new Uint32Array(wallC.i));
  return group;
}
/** Is (x, y, z) under a covered freeway? (model.galleries from buildGalleries) */
export function inGallery(model, x, y, z) {
  if (!model.galleries?.length) return false;
  const r = model.nearest(x, z, y);
  return !!r && model.galleries.some(g => g.seg === r.seg && r.s >= g.s0 && r.s <= g.s1 && r.d < r.h + 2 && Math.abs(y - r.y) < 6);
}
