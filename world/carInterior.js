/* Cabins for the player cars (2026-09-28).
 *
 * Every cabin is lit from inside by its ambient light: thin light strips along
 * the dash, doors and console (emissive, so bloom catches them) and the soft
 * wash they throw on nearby trim. The wash is baked per vertex at build time
 * (a `glow` attribute: distance to the strips, facing toward them), so it
 * costs no lights and no per-pixel loops; the colour and the level are two
 * uniforms, changed live from the garage and by the time of day.
 *
 * The sedan's headliner is a starlight roof: a procedural sky of fibre-optic
 * points that twinkle, with the odd shooting star.
 *
 * A Cabin collects parts by material and merges them in finish(); moving parts
 * (the steering wheel) are a child Cabin merged into their own group.
 */
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {attribute, uniform, vec2, vec3, float, uv, floor, fract, hash, length, smoothstep, step, sin, time, mix, abs, positionLocal} from 'three/tsl';
import {softBox, sweep, ribbon, resample, ring, lathe, roundPoly, superLoop, leatherNodes, suedeNodes, quiltNodes, brushedNodes, knurlNodes, woodNodes, speakerNodes, carpetNodes, stitchNodes} from './carKit.js';

/* ------------------------------------------------------------------ geometry helpers */
/** Rounded box: sx * sy * sz with edges rounded by r. */
export function rbox(sx, sy, sz, r = .02, seg = 2) {
  r = Math.min(r, sx / 2 - 1e-3, sy / 2 - 1e-3, sz / 2 - 1e-3);
  const w = sx / 2 - r, h = sy / 2 - r, s = new T.Shape();
  s.moveTo(-w, -h); s.lineTo(w, -h); s.lineTo(w, h); s.lineTo(-w, h); s.closePath();
  const g = new T.ExtrudeGeometry(s, {depth: Math.max(1e-3, sz - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: seg, curveSegments: 2});
  g.translate(0, 0, -(sz - 2 * r) / 2);
  return g;
}
/** An outline [[a, b], ...] extruded `depth` along an axis ('x': outline is (z, y); 'z': (x, y); 'y': (x, z)), centred. */
export function prism(outline, depth, axis = 'x', bevel = 0) {
  const s = new T.Shape(outline.map(([a, b]) => new T.Vector2(a, b)));
  const g = new T.ExtrudeGeometry(s, {depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8, steps: 1});
  g.translate(0, 0, -depth / 2);
  const M = new T.Matrix4();
  if (axis === 'x') M.set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);          // (a, b, e) -> (e, b, a)
  else if (axis === 'y') M.set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);     // (a, b, e) -> (a, e, b)
  if (axis !== 'z') { g.applyMatrix4(M); if (M.determinant() < 0) flip(g); }
  g.computeVertexNormals();
  return g;
}
function flip(g) {
  if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.index.needsUpdate = true; return; }
  const p = g.attributes.position;
  for (const key of Object.keys(g.attributes)) {
    const A = g.attributes[key], n = A.itemSize, arr = A.array;
    for (let i = 0; i < p.count; i += 3) for (let k = 0; k < n; k++) { const t = arr[(i + 1) * n + k]; arr[(i + 1) * n + k] = arr[(i + 2) * n + k]; arr[(i + 2) * n + k] = t; }
  }
}
export function tubeAlong(points, r, radial = 8, closed = false, per = 8) {
  const c = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)), closed, 'centripetal');
  return new T.TubeGeometry(c, Math.max(6, points.length * per), r, radial, closed);
}
export const place = (g, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz, 'YXZ')), new T.Vector3(s, s, s)));

/** Split triangles near the light strips until their edges are short, so the baked wash is smooth. */
function tessellate(g, near, maxEdge) {
  const src = g.index ? g.toNonIndexed() : g;
  const keys = Object.keys(src.attributes), A = keys.map(k => src.attributes[k]);
  const out = keys.map(() => []);
  const tri = (vs, depth) => {
    const p = vs.map(v => v[0]);
    const e = [0, 1, 2].map(i => { const a = p[i], b = p[(i + 1) % 3]; return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); });
    const L = Math.max(...e), i = e.indexOf(L);
    const c = [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3, (p[0][2] + p[1][2] + p[2][2]) / 3];
    if (depth > 9 || L < maxEdge || !near(c, L)) { vs.forEach(v => v.forEach((val, k) => out[k].push(...val))); return; }
    const a = vs[i], b = vs[(i + 1) % 3], o = vs[(i + 2) % 3], m = a.map((val, k) => val.map((q, j) => (q + b[k][j]) / 2));
    tri([a, m, o], depth + 1); tri([m, b, o], depth + 1);
  };
  for (let t = 0; t < A[0].count; t += 3) tri([0, 1, 2].map(j => A.map(a => Array.from({length: a.itemSize}, (_, k) => a.array[(t + j) * a.itemSize + k]))), 0);
  const g2 = new T.BufferGeometry();
  keys.forEach((k, i) => g2.setAttribute(k, new T.Float32BufferAttribute(out[i], A[i].itemSize)));
  return g2;
}

/* ------------------------------------------------------------------ materials */
/** Ambient light shared by a car: colour and level uniforms. */
export function makeAmbient(color = '#2f5bff') {
  return {color: uniform(new T.Color(color)), level: uniform(.35)};
}
/** A trim material lit by the ambient wash (its `glow` attribute); nodes from carKit. */
function lit(amb, params, nodes = null, reflect = .7, physical = false) {
  const m = physical ? new T.MeshPhysicalNodeMaterial(params) : new T.MeshStandardNodeMaterial(params);
  if (nodes) for (const k of ['colorNode', 'roughnessNode', 'normalNode', 'metalnessNode']) if (nodes[k]) m[k] = nodes[k];
  m.emissiveNode = attribute('glow', 'float').mul(amb.color).mul(amb.level).mul(reflect);
  return m;
}
/** Carbon twill for the cabin (same idea as the body's), under a clear coat. */
const carbonNode = (scale = 110) => {
  const P = positionLocal, a = P.x.add(P.z).mul(scale), b = P.y.add(P.z.mul(.5)).mul(scale);
  const tw = floor(a.add(floor(b)).mul(.5)).mod(2), along = mix(fract(a), fract(b), tw);
  return vec3(.03, .032, .036).mul(float(.55).add(along.sub(.5).abs().mul(2).oneMinus().mul(.45)));
};
/** A live-looking infotainment screen: a dark map, a route, tiles. */
function screenMaterial(amb, tint = [.25, .5, 1]) {
  const m = new T.MeshStandardNodeMaterial({color: '#000000', roughness: .15, metalness: .1});
  const U = uv(), grid = step(.94, fract(U.x.mul(14))).max(step(.94, fract(U.y.mul(8)))).mul(.12);
  const route = smoothstep(.02, 0, abs(U.y.sub(.35).sub(sin(U.x.mul(7)).mul(.12)))).mul(step(U.x, .62));
  const tiles = step(.66, U.x).mul(step(.08, fract(U.y.mul(3)))).mul(step(.7, U.x).mul(.5).add(.35));
  const c = vec3(...tint).mul(grid.add(.06)).add(vec3(.3, .7, 1).mul(route)).add(vec3(...tint).mul(tiles.mul(.4)));
  m.emissiveNode = c.mul(amb.level.mul(.6).add(.55));
  return m;
}
/** The fibre-optic starlight headliner. `uv` is metres across (u) and along (v) the roof. */
function starMaterial(amb, base = '#0b0c14') {
  const m = new T.MeshStandardNodeMaterial({color: base, roughness: .95, side: T.DoubleSide});
  const N = suedeNodes(base); m.colorNode = N.colorNode;
  const layer = (scale, density, sizeK, seed) => {
    const q = uv().mul(scale), cell = floor(q), f = fract(q).sub(.5);
    const h = hash(cell.x.add(cell.y.mul(157.3)).add(seed)), h2 = hash(cell.x.mul(3.7).add(cell.y.mul(41.9)).add(seed + 11.3));
    const off = vec2(h.sub(.5), h2.sub(.5)).mul(.55), d = length(f.sub(off));
    const size = h2.mul(sizeK).add(sizeK * .5);
    const tw = sin(time.mul(h2.mul(2.6).add(.4)).add(h.mul(60))).mul(.45).add(.55);
    return smoothstep(size, 0, d).mul(step(1 - density, h)).mul(tw).mul(h.mul(1.4).add(.2));
  };
  // Three depths of stars: a few bright ones, a field, and a faint dust; a warm-to-cool spread.
  const stars = layer(22, .35, .07, 3).mul(1.6).add(layer(34, .5, .09, 0)).add(layer(71, .45, .11, 7).mul(.45)).add(layer(130, .5, .14, 19).mul(.18));
  const P = uv(), t = fract(time.mul(.07)), run = step(t, .1), k = t.mul(10);
  const head = vec2(k.mul(1.4).sub(.7), k.mul(.9).sub(.9).add(.2)), dir = vec2(.84, .54);
  const rel = P.sub(head), along = rel.dot(dir), across = abs(rel.x.mul(dir.y).sub(rel.y.mul(dir.x)));
  const streak = smoothstep(.004, 0, across).mul(smoothstep(-.35, 0, along)).mul(step(along, 0)).mul(run).mul(float(1).sub(k));
  const tint = mix(vec3(1, .93, .82), vec3(.85, .92, 1), hash(floor(uv().mul(34)).x.add(floor(uv().mul(34)).y.mul(91.7))));
  // Fibre-optic points read in dim light and fade into the headliner by day (level .3 day .. 1 night).
  m.emissiveNode = tint.mul(stars.add(streak.mul(2.5))).mul(amb.level.mul(amb.level).mul(amb.level).mul(5).add(.05)).add(vec3(0.02, 0.025, 0.05).mul(amb.level));
  return m;
}

/** Samples for a path: one per `step` metres, 8..160. */
const spaced = (pts, step, closed = false) => {
  let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
  if (closed) L += Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1], pts[0][2] - pts.at(-1)[2]);
  return Math.max(8, Math.min(160, Math.round(L / step)));
};
/** Loose meshes on lit materials need the glow attribute too (a faint constant). */
function ensureGlow(obj) {
  obj.traverse(o => { if (o.isMesh && !o.geometry.attributes.glow) o.geometry.setAttribute('glow', new T.BufferAttribute(new Float32Array(o.geometry.attributes.position.count).fill(.02), 1)); });
}

/* ------------------------------------------------------------------ the cabin */
export class Cabin {
  constructor(amb, palette = {}, strips = null) {
    this.amb = amb; this.parts = []; this.strips = strips || []; this.children = [];
    const P = {leather: '#1c1b1c', leather2: '#262428', stitch: '#2f5bff', thread: null, trim: '#141518', floor: '#0e0f11', headliner: '#1b1b1e', alcantara: '#202023', ...palette};
    P.thread ||= P.stitch;
    this.P = P;
    this.m = palette._mats || {};
    this.meshes = [];
  }
  /** The material for a key, made the first time it is asked for. */
  mat(key) {
    if (this.m[key]) return this.m[key];
    const P = this.P, amb = this.amb, D = T.DoubleSide;
    const R = {
      leather: () => lit(amb, {color: P.leather}, leatherNodes(P.leather), .9),
      leatherP: () => lit(amb, {color: P.leather}, leatherNodes(P.leather, {perforate: true}), .9),
      leather2: () => lit(amb, {color: P.leather2}, leatherNodes(P.leather2), .9),
      alcantara: () => lit(amb, {color: P.alcantara}, suedeNodes(P.alcantara), .8),
      quilt: () => lit(amb, {color: P.leather}, quiltNodes(P.leather, P.thread), .9),
      carbon: () => lit(amb, {roughness: .25, metalness: .35, clearcoat: 1, clearcoatRoughness: .05}, {colorNode: carbonNode()}, .5, true),
      trim: () => lit(amb, {color: P.trim, roughness: .45, metalness: .2}, null, .6),
      floor: () => lit(amb, {color: P.floor}, carpetNodes(P.floor), .7),
      headliner: () => lit(amb, {color: P.headliner, side: D}, suedeNodes(P.headliner), .8),
      wood: () => lit(amb, {roughness: .12, metalness: 0, clearcoat: 1, clearcoatRoughness: .03}, woodNodes(P.woodDark, P.woodLight), .5, true),
      piano: () => lit(amb, {color: '#040405', roughness: .08, metalness: .1, clearcoat: 1, clearcoatRoughness: .02}, null, .4, true),
      paint: () => lit(amb, {color: P.paint || '#888', roughness: .3, metalness: .5, clearcoat: 1}, null, .6, true),
      alu: () => lit(amb, {color: '#c2c6cb', metalness: 1, anisotropy: .6}, brushedNodes('#c2c6cb'), .25, true),
      aluR: () => lit(amb, {color: '#c2c6cb', metalness: 1, side: D}, brushedNodes('#c2c6cb', 'r'), .25, true),
      chrome: () => new T.MeshStandardMaterial({color: '#e2e5e9', roughness: .04, metalness: 1, side: D}),
      knurl: () => lit(amb, {color: '#b9bdc2', metalness: 1, side: D}, knurlNodes(), .2),
      speaker: () => lit(amb, {color: '#b0b4b8', metalness: .9, side: D}, speakerNodes(), .3),
      black: () => lit(amb, {color: '#060607', roughness: .5}, null, .4),
      rubber: () => lit(amb, {color: '#0c0c0d', roughness: .9}, null, .3),
      accent: () => lit(amb, {color: P.stitch, roughness: .5}, suedeNodes(P.stitch), .9),
      stitch: () => lit(amb, {color: P.thread}, stitchNodes(P.thread, P.leather), .9),
      stitch2: () => lit(amb, {color: P.thread}, stitchNodes(P.thread, P.alcantara), .9),
      strip: () => { const s = new T.MeshBasicNodeMaterial({toneMapped: false}); s.colorNode = amb.color.mul(amb.level.mul(2.6).add(.15)); return s; },
      screen: () => screenMaterial(amb, P.screen || [.25, .5, 1]),
      led: () => new T.MeshBasicMaterial({color: '#ff3a2a', toneMapped: false}),
      ledG: () => new T.MeshBasicMaterial({color: '#38ff6a', toneMapped: false}),
      ledB: () => new T.MeshBasicMaterial({color: '#3a7bff', toneMapped: false}),
      ledW: () => new T.MeshBasicMaterial({color: '#fff4e0', toneMapped: false}),
      glassDark: () => new T.MeshPhysicalMaterial({color: '#040506', roughness: .05, metalness: .2, clearcoat: 1}),
      enamel: () => lit(amb, {color: P.enamel || '#f3efe6', roughness: .2, clearcoat: 1}, null, .5, true),
    };
    if (key.startsWith('#')) return (this.m[key] = lit(amb, {color: key, roughness: .35, clearcoat: .6, side: D}, null, .6, true));
    if (!R[key]) throw new Error('cabin material ' + key);
    return (this.m[key] = R[key]());
  }
  child() { const c = new Cabin(this.amb, {...this.P, _mats: this.m}, this.strips); this.children.push(c); return c; }
  add(g, key) { this.parts.push([g, key]); return g; }
  box(key, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0, r = 0) {
    return this.add(place(r ? softBox(sx, sy, sz, r, 6) : new T.BoxGeometry(sx, sy, sz, Math.max(1, Math.round(sx / .08)), Math.max(1, Math.round(sy / .08)), Math.max(1, Math.round(sz / .08))), x, y, z, rx, ry, rz), key);
  }
  /** A soft-edged block (carKit.softBox) placed and rotated. */
  soft(key, x, y, z, sx, sy, sz, r, {rx = 0, ry = 0, rz = 0, seg = 0, deform = null} = {}) {
    // Segments by size: a 3 mm clock baton does not need the 1,200 triangles of a dashboard pad.
    seg ||= Math.max(2, Math.min(10, Math.round(Math.max(sx, sy, sz) / .03)));
    return this.add(place(softBox(sx, sy, sz, r, seg, deform), x, y, z, rx, ry, rz), key);
  }
  /** Stitching along points: a thin dashed ribbon a hair off the surface. */
  stitch(points, key = 'stitch', w = .004) { return this.add(ribbon(resample(points, spaced(points, .015)), w, .0012), key); }
  /** Piping: a thin round cord along points. */
  piping(points, key, r = .0045, closed = false) { return this.add(sweep(resample(points, spaced(points, .02, closed), closed), () => ring(r, r, 6), {closed}), key); }
  /** An ambient light strip through points, which also lights the trim around it. */
  strip(points, r = .0035) {
    this.add(tubeAlong(points, r, 5), 'strip');
    for (let i = 0; i < points.length - 1; i++) this.strips.push([points[i], points[i + 1]]);
  }
  mesh(m) { this.meshes.push(m); }
  /** Bake the wash and merge by material. */
  finish(group = new T.Group()) {
    // Strip segments as flat numbers: [ax, ay, az, dx, dy, dz, 1/len^2].
    const S = this.strips.map(([a, b]) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; return [...a, ...d, 1 / Math.max(1e-6, d[0] * d[0] + d[1] * d[1] + d[2] * d[2])]; });
    /** Nearest point on any strip to (x, y, z): [distance, qx, qy, qz]. */
    const nearest = (x, y, z, out) => {
      out[0] = 9;
      for (const [ax, ay, az, dx, dy, dz, il] of S) {
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) * il));
        const qx = ax + dx * t, qy = ay + dy * t, qz = az + dz * t, d = Math.hypot(x - qx, y - qy, z - qz);
        if (d < out[0]) { out[0] = d; out[1] = qx; out[2] = qy; out[3] = qz; }
      }
      return out;
    };
    const Q = [0, 0, 0, 0], dist = p => nearest(p[0], p[1], p[2], Q)[0];
    const byMat = new Map();
    for (const [g0, key] of this.parts) {
      let g = g0.index ? g0.toNonIndexed() : g0;
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const washed = !['strip', 'chrome', 'led', 'ledG', 'ledB', 'ledW', 'screen', 'glassDark'].includes(key);
      if (washed && S.length) g = tessellate(g, (c, L) => dist(c) < .16 + L, .08);
      if (washed) {
        const p = g.attributes.position, n = g.attributes.normal, glow = new Float32Array(p.count);
        for (let i = 0; i < p.count; i++) {
          // The nearest strip lights a vertex, more when the surface faces it.
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i), [d, qx, qy, qz] = nearest(x, y, z, Q);
          let w = 0;
          if (d < .45) {
            const face = d < 1e-4 ? 1 : Math.max(0, (n.getX(i) * (qx - x) + n.getY(i) * (qy - y) + n.getZ(i) * (qz - z)) / d) * .75 + .25;
            w = Math.exp(-d / .06) * face;
          }
          glow[i] = w * .55 + .015;
        }
        g.setAttribute('glow', new T.BufferAttribute(glow, 1));
      }
      (byMat.get(key) || byMat.set(key, []).get(key)).push(g);
    }
    for (const [key, gs] of byMat) {
      const mesh = new T.Mesh(mergeGeometries(gs), this.mat(key));
      // The body and roof shade the cabin; its own parts need not render into the shadow map too.
      mesh.castShadow = false; mesh.receiveShadow = true;
      group.add(mesh);
    }
    for (const m of this.meshes) { ensureGlow(m); group.add(m); }
    this.parts.length = 0;
    return group;
  }

  /* ---------------------------------------------------------------- parts */
  /**
   * A seat facing +z, its cushion centred at (x, y, z). Styles:
   *   bucket  carbon shell, bolstered leather, perforated suede centre, stitched
   *           seams, integrated headrest with harness slots and a 4-point harness
   *   lux     quilted armchair with contrast piping and a pillow headrest on posts
   *   lounge  the rear lux seat: deeper recline, a lambswool cushion pillow
   *   bench / suv   the simpler seats of the other cars
   */
  seat({x, y, z, w = .5, style = 'bucket', recline = .22, depth = .5, backH = .68, key = 'leather', insert = 'alcantara', shell = 'carbon', harness = 'accent'}) {
    const g = [], at = (geo, k) => g.push([geo, k]), back = [], atB = (geo, k) => back.push([geo, k]);
    const hw = w / 2, sm = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    if (style === 'bucket') {
      // Cushion: raised side bolsters, a rolled front edge, the carbon pan under it.
      at(softBox(w, .1, depth, .04, 16, (px, py, pz) => {
        const e = Math.abs(px) / hw, top = Math.max(0, py / .05);
        return [px * (1 - .08 * sm(0, 1, -pz / (depth / 2))), py + top * (sm(.5, .95, e) * .075 - (1 - sm(.1, .55, e)) * .012), pz];
      }), key);
      at(place(softBox(w * .46, .026, depth * .76, .012, 10, (px, py, pz) => [px, py + (1 - (px / (w * .23)) ** 2) * .006, pz]), 0, .046, .015), insert);
      for (const s of [-1, 1]) at(place(ribbon(resample([[s * w * .235, .062, -depth * .36], [s * w * .235, .064, 0], [s * w * .235, .062, depth * .38]], 24), .004, .001), 0, 0, .015), 'stitch2');
      at(place(softBox(w + .02, .035, depth + .01, .015, 8), 0, -.06, 0), shell);
      for (const s of [-1, 1]) at(place(softBox(.03, .03, depth * 1.1, .01, 4), s * hw * .7, -.1, 0), 'alu');
      // Back: a carbon shell whose wings wrap forward, leather bolsters, a suede centre.
      atB(place(softBox(w + .03, backH, .06, .026, 16, (px, py, pz) => {
        const t = (py + backH / 2) / backH, e = Math.abs(px) / ((w + .03) / 2);
        return [px * (1 - .16 * t * t) * (t > .8 ? 1 - (t - .8) * .9 : 1), py, pz + e ** 3 * .1 * (1 - t * .5)];
      }), 0, backH / 2, -.01), shell);
      for (const s of [-1, 1]) atB(place(softBox(.1, backH * .6, .085, .04, 12, (px, py, pz) => [px, py, pz + (1 - (py / (backH * .3)) ** 2) * .012]), s * (hw - .045), backH * .38, .05, 0, s * -.42, 0), key);
      atB(place(softBox(w * .5, backH * .58, .04, .018, 12, (px, py, pz) => [px, py, pz + Math.sin(Math.PI * (py / (backH * .58) + .5)) * .014]), 0, backH * .4, .04), 'leatherP');
      atB(place(softBox(w * .4, .14, .035, .016, 10), 0, backH * .87, .035), key);
      for (const s of [-1, 1]) {
        atB(place(ribbon(resample([[s * w * .25, backH * .12, .062], [s * w * .255, backH * .4, .076], [s * w * .25, backH * .68, .062]], 30), .004, .001), 0, 0, 0), 'stitch');
        atB(place(softBox(.06, .028, .03, .012, 6), s * .075, backH * .74, .048), 'black');
      }
      // Four-point harness: shoulder straps from the slots down the back, lap belts, a cam-lock buckle.
      if (harness) {
        const bz = depth / 2 - .16;
        for (const s of [-1, 1]) {
          atB(place(ribbon(resample([[s * .075, backH * .74, .07], [s * .08, backH * .5, .085], [s * .06, backH * .15, .075]], 30), .042, .003, [0, 0, 1]), 0, 0, 0), harness);
          at(ribbon(resample([[s * hw * .82, .07, -depth * .3], [s * hw * .45, .085, bz - .05], [s * .04, .1, bz]], 24), .042, .003, [0, 1, 0]), harness);
        }
        at(place(lathe([[.001, -.008], [.038, -.008], [.042, -.004], [.042, .004], [.03, .008], [.001, .01]], 32), 0, .105, bz, 0, 0, Math.PI / 2), 'aluR');
      }
      for (const [geo, k] of back) at(place(geo, 0, .02, -depth / 2 + .02, -recline), k);
    } else if (style === 'lux' || style === 'lounge') {
      const lounge = style === 'lounge', ch = .13;
      // Cushion: a soft crown, gentle bolsters, contrast piping round its top.
      at(softBox(w, ch, depth, .055, 16, (px, py, pz) => {
        const e = Math.abs(px) / hw, top = Math.max(0, py / (ch / 2));
        return [px, py + top * ((1 - e * e) * .012 + sm(.7, 1, e) * .018), pz + top * Math.max(0, pz) * .03];
      }), 'quilt');
      const loop = superLoop(hw - .012, depth / 2 - .012, 5, 40).map(([a, b]) => [a, ch / 2 + .012, b]);
      at(sweep(loop, () => ring(.0055, .0055, 8), {closed: true}), 'leather2');
      at(place(softBox(w * .96, .1, depth * .9, .03, 8), 0, -ch / 2 - .04, 0), key);
      // Back: quilted, rounded shoulders, slight wings; piping; the headrest on chrome posts.
      atB(place(softBox(w, backH, .13, .06, 16, (px, py, pz) => {
        const t = (py + backH / 2) / backH, e = Math.abs(px) / hw;
        return [px * (1 - .1 * t ** 3), py - (t > .85 ? (e ** 4) * .04 : 0), pz + e * e * .03 + (pz > 0 ? Math.sin(Math.PI * t) * .012 : 0)];
      }), 0, backH / 2, 0), 'quilt');
      const bl = superLoop(hw - .02, backH / 2 - .02, 4, 44).map(([a, b]) => [a * (1 - .1 * ((b + backH / 2) / backH) ** 3), b + backH / 2, .07]);
      atB(sweep(bl, () => ring(.005, .005, 8), {closed: true}), 'leather2');
      if (lounge) atB(place(softBox(w * .7, .2, .08, .04, 12, (px, py, pz) => [px, py, pz + (1 - (px / (w * .35)) ** 2) * .02]), 0, backH * .82, .1), 'floor');
      for (const s of [-1, 1]) atB(place(lathe([[.007, 0], [.007, .1]], 12), s * .07, backH, 0, 0, 0, Math.PI / 2), 'chrome');
      atB(place(softBox(w * .56, .18, .11, .05, 12, (px, py, pz) => [px * (1 - .08 * (py / .09)), py, pz + (1 - (px / (w * .28)) ** 2) * .015]), 0, backH + .15, .01), key);
      for (const [geo, k] of back) at(place(geo, 0, .05, -depth / 2 + .05, -recline), k);
    } else {
      // bench / suv: a firm cushion, a square back, a pillow headrest.
      at(place(rbox(w, .11, depth, .04), 0, 0, 0), key);
      const bk = [[place(rbox(w, backH, .11, .04), 0, backH / 2, 0), key]];
      if (style === 'suv') {
        bk.push([place(rbox(w * .55, .18, .1, .04), 0, backH + .12, 0), key], [place(rbox(w * .5, backH * .6, .02, .01), 0, backH * .45, .06), insert]);
        for (const s of [-1, 1]) at(place(rbox(.08, .1, depth * .9, .035), s * (w / 2 - .02), .04, 0), key);
      } else for (let i = -3; i <= 3; i++) bk.push([place(rbox(.012, backH * .8, .015, .005), i * w / 8, backH * .45, .06), 'leather2']);
      for (const [geo, k] of bk) at(place(geo, 0, .03, -depth / 2 + .03, -recline), k);
    }
    for (const [geo, k] of g) this.add(place(geo, x, y, z), k);
  }
  /** A round jet vent: a turned bezel, an eyeball, fine vanes; facing -z (the cabin) unless ry says otherwise. */
  jetVent(x, y, z, r = .035, {ry = 0, rx = 0, key = 'aluR'} = {}) {
    const q = new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry + Math.PI / 2, 0, 'YXZ')), new T.Vector3(1, 1, 1));
    this.add(lathe([[r * .86, -.02], [r, -.012], [r * 1.12, -.004], [r * 1.12, .002], [r * .9, .006]], 40).applyMatrix4(q), key);
    this.add(lathe([[r * .84, -.03], [r * .84, .0]], 32).applyMatrix4(q), 'black');
    this.add(new T.SphereGeometry(r * .78, 24, 12).scale(.35, 1, 1).applyMatrix4(q), 'black');
    for (let i = -2; i <= 2; i++) this.add(new T.BoxGeometry(.004, .002, r * 1.5).translate(-.002, i * r * .3, 0).applyMatrix4(q), key);
  }
}

/* ------------------------------------------------------------------ steering wheels */
/**
 * A steering wheel in a pivot group, facing -z toward the driver; carFx turns
 * `pivot.rotation.z` (negative for a left turn: the driver sees it
 * anticlockwise). pivot.userData.badge, if set, is counter-rotated so the
 * medallion stays upright, like a Rolls-Royce's.
 */
export function steeringWheel(cabin, style, {x, y, z, tilt = -.35, size = 1}) {
  const c = cabin.child(), pivot = new T.Group(); pivot.position.set(x, y, z); pivot.rotation.x = tilt;
  // Wheel turns per radian of road-wheel steer: a yoke is quick (about 3/4 turn each way), a limousine slow.
  pivot.userData.ratio = {aero: 4.2, lux: 9, classic: 10, suv: 8}[style] || 8.5;
  const s = size;
  if (style === 'aero') {
    // Flat-topped, flat-bottomed rim: carbon top and bottom, fat alcantara grips
    // with thumb rests, a blue 12 o'clock band, stitching on the inside seam.
    const pt = t => { const a = t * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a); return [Math.sign(cx) * Math.abs(cx) ** .6 * .165 * s, Math.sign(cy) * Math.abs(cy) ** .5 * .122 * s, 0]; };
    const seg = (t0, t1, key, k = 1) => {
      const pts = []; for (let i = 0; i <= 40; i++) pts.push(pt(t0 + (t1 - t0) * i / 40));
      c.add(sweep(pts, t => { const a = (t0 + (t1 - t0) * t) * Math.PI * 2, grip = Math.abs(Math.cos(a)) ** 6, thumb = Math.exp(-(((a % Math.PI) - Math.PI * .3) ** 2) * 60) * .5;
        return ring(.02 * s * k * (1 + grip * .3 + thumb * .4), .016 * s * k * (1 + grip * .25), 14); }, {up: [0, 0, 1], caps: false}), key);
    };
    seg(-.14, .14, 'alcantara'); seg(.36, .64, 'alcantara');
    seg(.13, .235, 'carbon'); seg(.265, .37, 'carbon'); seg(.63, .87, 'carbon'); seg(.86, .875, 'carbon');
    seg(.232, .268, 'accent', 1.03);
    for (const [t0, t1] of [[-.12, .12], [.38, .62]]) {
      const pts = []; for (let i = 0; i <= 30; i++) { const p = pt(t0 + (t1 - t0) * i / 30), l = Math.hypot(p[0], p[1]); pts.push([p[0] * (1 - .02 / l), p[1] * (1 - .02 / l), -.004]); }
      c.stitch(pts, 'stitch2', .003);
    }
    // Hub: a carbon shield with a screen, rotary knobs, buttons, shift lights; spokes; paddles.
    const hub = roundPoly([[-.1, .035], [.1, .035], [.085, -.045], [.03, -.07], [-.03, -.07], [-.085, -.045]], .02, 4).map(([a, b]) => [a * s, b * s]);
    c.add(place(prism(hub, .03, 'z', .006), 0, -.005, .01), 'carbon');
    c.add(place(prism(roundPoly([[-.05, .028], [.05, .028], [.05, -.012], [-.05, -.012]], .006, 3), .004, 'z'), 0, .004, -.009), 'piano');
    c.add(place(new T.PlaneGeometry(.092 * s, .036 * s), 0, .012, -.0115, 0, Math.PI, 0), 'screen');
    for (const sx of [-1, 1]) {
      c.add(place(prism(roundPoly([[0, .018], [.06, .01], [.075, -.012], [0, -.022]], .008, 3), .02, 'z', .004), sx > 0 ? .085 * s : -.085 * s, -.005, .008, 0, sx > 0 ? 0 : Math.PI, 0), 'carbon');
      c.add(place(lathe([[.0005, -.012], [.016, -.012], [.017, -.006], [.017, .004]], 28), sx * .058 * s, -.042 * s, -.004, 0, Math.PI / 2, 0), 'knurl');
      c.add(place(new T.BoxGeometry(.003, .012, .002), sx * .058 * s, -.036 * s, -.018), sx > 0 ? 'led' : 'ledB');
      for (let i = 0; i < 2; i++) c.add(place(softBox(.018, .012, .006, .003, 3), sx * (.03 + i * .022) * s, -.018 * s, -.011), i ? 'black' : 'accent');
      // Paddles: long carbon blades behind the rim.
      c.add(place(prism(roundPoly([[0, .06], [.025, .065], [.03, -.08], [.005, -.085]], .01, 3), .006, 'z', .002), sx * .118 * s, .01, .045, 0, 0, sx * -.08), 'carbon');
    }
    for (let i = 0; i < 15; i++) c.add(place(softBox(.0065, .0045, .003, .0015, 2), (i - 7) * .0085 * s, .036 * s, -.009), i < 5 ? 'ledG' : i < 10 ? 'led' : 'ledB');
    c.add(place(prism(roundPoly([[-.012, -.06], [.012, -.06], [.02, -.12], [-.02, -.12]], .006, 3), .018, 'z', .003), 0, 0, .012), 'carbon');
    c.add(place(lathe([[.045, .0], [.04, .04], [.03, .07]], 24), 0, 0, .03, 0, -Math.PI / 2, 0), 'carbon');
  } else if (style === 'lux') {
    // A thin leather rim with a chrome inner ring, three slender chrome spokes,
    // a leather boss with a chrome bezel and a medallion that stays upright.
    const R0 = .195 * s, circ = n => Array.from({length: n}, (_, i) => [Math.cos(i / n * Math.PI * 2) * R0, Math.sin(i / n * Math.PI * 2) * R0, 0]);
    c.add(sweep(circ(96), () => ring(.0125, .0115, 14), {closed: true, up: [0, 0, 1]}), 'leather');
    c.stitch(circ(96).map(([a, b]) => [a * (1 - .012 / R0), b * (1 - .012 / R0), -.001]).concat([[R0 - .012, 0, -.001]]), 'stitch', .0025);
    c.add(sweep(circ(96).map(([a, b]) => [a * .93, b * .93, .004]), () => ring(.0022, .0022, 6), {closed: true, up: [0, 0, 1]}), 'chrome');
    for (const a of [Math.PI, 0, -Math.PI / 2]) {
      const pts = [[Math.cos(a) * .045, Math.sin(a) * .045, .012], [Math.cos(a) * .12 * s, Math.sin(a) * .12 * s, .004], [Math.cos(a) * (R0 - .004), Math.sin(a) * (R0 - .004), 0]];
      c.add(sweep(resample(pts, 20), t => ring(.0035 * (1 - t * .3), .01 * (1 - t * .45), 10), {up: [0, 0, 1]}), 'chrome');
    }
    c.add(place(lathe([[.058, .03], [.056, .01], [.05, -.006], [.04, -.012], [.001, -.014]], 40), 0, 0, 0, 0, -Math.PI / 2, 0), 'leather');
    c.add(place(new T.TorusGeometry(.034, .0035, 8, 40), 0, 0, -.013), 'chrome');
    const badge = new T.Group(); badge.position.set(0, 0, -.016);
    const bm = cabin.mat('enamel');
    badge.add(new T.Mesh(new T.CircleGeometry(.031, 40).rotateY(Math.PI), cabin.mat('#101428')));
    const mono = new T.Mesh(new T.TorusGeometry(.012, .0022, 6, 24, Math.PI * 1.25).rotateZ(Math.PI * .25), cabin.mat('chrome')); mono.position.set(0, .006, -.001); badge.add(mono);
    const mono2 = new T.Mesh(new T.TorusGeometry(.012, .0022, 6, 24, Math.PI * 1.25).rotateZ(-Math.PI * .75), cabin.mat('chrome')); mono2.position.set(0, -.006, -.001); badge.add(mono2);
    void bm;
    ensureGlow(badge); pivot.add(badge); pivot.userData.badge = badge;
  } else if (style === 'classic') {
    c.add(place(new T.TorusGeometry(.21 * s, .011, 10, 64), 0, 0, 0), 'trim');
    c.add(place(new T.TorusGeometry(.12 * s, .004, 8, 48), 0, 0, -.02), 'chrome');
    c.add(place(new T.CylinderGeometry(.045, .045, .03, 24), 0, 0, .02, Math.PI / 2), 'chrome');
    for (const a of [Math.PI / 2 + .6, Math.PI / 2 - .6 + Math.PI, -Math.PI / 2 + .0]) { const L = .19 * s; c.add(place(new T.CylinderGeometry(.0045, .0045, L, 8), Math.cos(a) * L / 2, Math.sin(a) * L / 2, .01, 0, 0, a - Math.PI / 2), 'chrome'); }
  } else {
    c.add(place(new T.TorusGeometry(.18 * s, .017, 12, 56), 0, 0, 0), 'leather');
    c.add(place(rbox(.12, .085, .05, .025), 0, -.01, .015), 'leather');
    c.add(place(rbox(.035, .02, .01, .005), 0, -.01, -.012), 'alu');
    for (const a of [Math.PI, 0, -Math.PI / 2]) { const L = .12 * s; c.add(place(rbox(L, .035, .02, .01), Math.cos(a) * (L / 2 + .05), Math.sin(a) * (L / 2 + .05), .01, 0, 0, a), 'leather2'); }
  }
  c.finish(pivot);
  return pivot;
}

/** Instrument cluster: a plane that shows the live dial canvas (set by carFx). */
export function clusterScreen(w, h) {
  const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({color: '#000000', transparent: true, toneMapped: false}));
  m.rotation.y = Math.PI;
  return m;
}
/** A flat star field (the Gallery panel): w x h, facing -z, centred at pos. */
export function starArt(amb, w, h, pos) {
  const g = new T.PlaneGeometry(w, h, 1, 1).rotateY(Math.PI), p = g.attributes.position, uvs = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uvs.setXY(i, p.getX(i) * 1.6, p.getY(i) * 1.6);
  const mesh = new T.Mesh(g, starMaterial(amb, '#07080f')); mesh.position.set(...pos);
  return mesh;
}
/** The starlight headliner under the roof: a grid (uv in metres) facing down. */
export function starHeadliner(amb, roof, z0, z1, halfW, inset = .04, drop = .06, base) {
  const nz = 24, nx = 14, pos = [], uvs = [], idx = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const z = z0 + (z1 - z0) * j / nz, u = i / nx * 2 - 1, hw = halfW(z);
    pos.push(u * hw, roof(z) - inset - u * u * drop, z); uvs.push(u * hw, z);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; idx.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
  const mesh = new T.Mesh(g, starMaterial(amb, base)); mesh.receiveShadow = true;
  return mesh;
}
/** A plain headliner (same grid, a trim material). */
export function headlinerGeometry(roof, z0, z1, halfW, inset = .04, drop = .06) {
  const nz = 16, nx = 10, pos = [], idx = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const z = z0 + (z1 - z0) * j / nz, u = i / nx * 2 - 1, hw = halfW(z);
    pos.push(u * hw, roof(z) - inset - u * u * drop, z);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; idx.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
