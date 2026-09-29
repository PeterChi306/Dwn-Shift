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
/** A trim material lit by the ambient wash (its `glow` attribute). */
function lit(amb, params, colorNode = null, reflect = .7) {
  const m = new T.MeshStandardNodeMaterial(params);
  if (colorNode) m.colorNode = colorNode;
  m.emissiveNode = attribute('glow', 'float').mul(amb.color).mul(amb.level).mul(reflect);
  return m;
}
/** Walnut burr veneer. */
const woodNode = () => {
  const P = positionLocal, g = sin(P.z.mul(90).add(sin(P.x.mul(23).add(P.y.mul(40))).mul(2.2)).add(sin(P.x.mul(61)).mul(.6)));
  return mix(vec3(.11, .045, .02), vec3(.3, .14, .06), g.mul(.5).add(.5).pow(1.6));
};
/** Carbon twill for the cabin (same idea as the body's). */
const carbonNode = (scale = 110) => {
  const P = positionLocal, a = P.x.add(P.z).mul(scale), b = P.y.add(P.z.mul(.5)).mul(scale);
  const tw = floor(a.add(floor(b)).mul(.5)).mod(2), along = mix(fract(a), fract(b), tw);
  return vec3(.03, .032, .036).mul(float(.55).add(along.sub(.5).abs().mul(2).oneMinus().mul(.45)));
};
/** Quilted diamonds (sedan seats and door cards). */
const quiltNode = base => {
  const P = positionLocal, a = fract(P.x.add(P.z).mul(18)), b = fract(P.x.sub(P.z).add(P.y).mul(18));
  const seam = smoothstep(.06, 0, a.min(a.oneMinus())).max(smoothstep(.06, 0, b.min(b.oneMinus())));
  return vec3(...base).mul(float(1).sub(seam.mul(.35)));
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
  const layer = (scale, density, sizeK, seed) => {
    const q = uv().mul(scale), cell = floor(q), f = fract(q).sub(.5);
    const h = hash(cell.x.add(cell.y.mul(157.3)).add(seed)), h2 = hash(cell.x.mul(3.7).add(cell.y.mul(41.9)).add(seed + 11.3));
    const off = vec2(h.sub(.5), h2.sub(.5)).mul(.55), d = length(f.sub(off));
    const size = h2.mul(sizeK).add(sizeK * .5);
    const tw = sin(time.mul(h2.mul(2.6).add(.4)).add(h.mul(60))).mul(.45).add(.55);
    return smoothstep(size, 0, d).mul(step(1 - density, h)).mul(tw).mul(h.mul(1.4).add(.2));
  };
  const stars = layer(34, .5, .09, 0).add(layer(71, .45, .11, 7).mul(.45));
  // A shooting star every ~14 s: a short bright streak across the roof.
  const P = uv(), t = fract(time.mul(.07)), run = step(t, .1), k = t.mul(10);
  const head = vec2(k.mul(1.4).sub(.7), k.mul(.9).sub(.9).add(.2)), dir = vec2(.84, .54);
  const rel = P.sub(head), along = rel.dot(dir), across = abs(rel.x.mul(dir.y).sub(rel.y.mul(dir.x)));
  const streak = smoothstep(.004, 0, across).mul(smoothstep(-.35, 0, along)).mul(step(along, 0)).mul(run).mul(float(1).sub(k));
  const warm = vec3(1, .95, .86);
  m.emissiveNode = warm.mul(stars.add(streak.mul(2.5))).mul(amb.level.mul(3.2).add(.5)).add(vec3(0.02, 0.025, 0.05).mul(amb.level));
  return m;
}

/* ------------------------------------------------------------------ the cabin */
export class Cabin {
  constructor(amb, palette = {}, strips = null) {
    this.amb = amb; this.parts = []; this.strips = strips || []; this.children = [];
    const P = {leather: '#1c1b1c', leather2: '#262428', stitch: '#2f5bff', trim: '#141518', floor: '#0e0f11', headliner: '#1b1b1e', ...palette};
    this.P = P;
    this.m = palette._mats || {
      leather: lit(amb, {color: P.leather, roughness: .62}, null, .9),
      leather2: lit(amb, {color: P.leather2, roughness: .66}, null, .9),
      alcantara: lit(amb, {color: P.alcantara || '#202023', roughness: .96}, null, .8),
      quilt: lit(amb, {color: P.leather, roughness: .6}, quiltNode(new T.Color(P.leather).toArray()), .9),
      carbon: lit(amb, {roughness: .28, metalness: .4}, carbonNode(), .5),
      trim: lit(amb, {color: P.trim, roughness: .45, metalness: .2}, null, .6),
      floor: lit(amb, {color: P.floor, roughness: .95}, null, .7),
      headliner: lit(amb, {color: P.headliner, roughness: .95, side: T.DoubleSide}, null, .8),
      wood: lit(amb, {roughness: .18, metalness: .05}, woodNode(), .5),
      paint: lit(amb, {color: P.paint || '#888', roughness: .3, metalness: .5}, null, .6),
      alu: new T.MeshStandardMaterial({color: '#b4b9bf', roughness: .25, metalness: 1}),
      chrome: new T.MeshStandardMaterial({color: '#dfe2e6', roughness: .06, metalness: 1}),
      black: lit(amb, {color: '#060607', roughness: .5}, null, .4),
      accent: lit(amb, {color: P.stitch, roughness: .5}, null, .9),
      strip: (() => { const s = new T.MeshBasicNodeMaterial({toneMapped: false}); s.colorNode = amb.color.mul(amb.level.mul(2.6).add(.15)); return s; })(),
      screen: screenMaterial(amb, P.screen || [.25, .5, 1]),
      led: new T.MeshBasicMaterial({color: '#ff3a2a', toneMapped: false}),
      ledG: new T.MeshBasicMaterial({color: '#38ff6a', toneMapped: false}),
      ledB: new T.MeshBasicMaterial({color: '#3a7bff', toneMapped: false}),
      glassDark: new T.MeshStandardMaterial({color: '#050608', roughness: .1, metalness: .3}),
    };
    this.meshes = [];
  }
  child() { const c = new Cabin(this.amb, {...this.P, _mats: this.m}, this.strips); this.children.push(c); return c; }
  add(g, key) { this.parts.push([g, key]); return g; }
  box(key, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0, r = 0) {
    return this.add(place(r ? rbox(sx, sy, sz, r) : new T.BoxGeometry(sx, sy, sz, Math.max(1, Math.round(sx / .08)), Math.max(1, Math.round(sy / .08)), Math.max(1, Math.round(sz / .08))), x, y, z, rx, ry, rz), key);
  }
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
      const washed = !['strip', 'alu', 'chrome', 'led', 'ledG', 'ledB', 'screen', 'glassDark'].includes(key);
      if (washed && S.length) g = tessellate(g, (c, L) => dist(c) < .2 + L, .06);
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
      const mesh = new T.Mesh(mergeGeometries(gs), this.m[key]);
      mesh.castShadow = key !== 'strip'; mesh.receiveShadow = true;
      group.add(mesh);
    }
    for (const m of this.meshes) group.add(m);
    this.parts.length = 0;
    return group;
  }

  /* ---------------------------------------------------------------- parts */
  /** A seat facing +z. style: bucket | lux | bench | suv. */
  seat({x, y, z, w = .5, style = 'bucket', recline = .22, depth = .5, backH = .68, key = 'leather', insert = 'alcantara', shell = 'carbon'}) {
    const g = [], at = (geo, k) => g.push([geo, k]);
    if (style === 'bucket') {
      // A carbon shell with deep bolsters and an integrated headrest with harness slots.
      at(place(rbox(w, .07, depth, .025), 0, 0, 0), key);
      at(place(rbox(w * .55, .03, depth * .8, .012), 0, .045, .02), insert);
      for (const s of [-1, 1]) at(place(rbox(.09, .13, depth * .95, .035), s * (w / 2 - .03), .06, 0, 0, 0, s * .25), key);
      const back = [];
      back.push([place(rbox(w, backH, .08, .03), 0, backH / 2, 0), shell]);
      back.push([place(rbox(w * .6, backH * .72, .03, .012), 0, backH * .42, .05), insert]);
      for (const s of [-1, 1]) back.push([place(rbox(.1, backH * .75, .11, .04), s * (w / 2 - .02), backH * .38, .05, 0, s * -.3, 0), key]);
      back.push([place(rbox(.07, .035, .09, .012), .1, backH * .9, .03), 'black'], [place(rbox(.07, .035, .09, .012), -.1, backH * .9, .03), 'black']);
      back.push([place(rbox(w * .95, .012, .09, .005), 0, backH * .6, .05), 'accent']);
      for (const [geo, k] of back) at(place(geo, 0, .02, -depth / 2 + .02, -recline), k);
    } else if (style === 'lux') {
      at(place(rbox(w, .12, depth, .05), 0, 0, 0), 'quilt');
      for (const s of [-1, 1]) at(place(rbox(.07, .12, depth * .9, .035), s * (w / 2 - .02), .03, 0), key);
      const back = [[place(rbox(w, backH, .12, .05), 0, backH / 2, 0), 'quilt'], [place(rbox(w * .6, .2, .11, .05), 0, backH + .12, 0), key], [place(new T.CylinderGeometry(.012, .012, .1, 8), 0, backH + .02, 0), 'chrome']];
      for (const s of [-1, 1]) back.push([place(rbox(.07, backH * .9, .13, .035), s * (w / 2 - .02), backH * .45, .02), key]);
      for (const [geo, k] of back) at(place(geo, 0, .04, -depth / 2 + .04, -recline), k);
    } else {
      // bench / suv: a firm cushion, a square back, a pillow headrest.
      at(place(rbox(w, .11, depth, .04), 0, 0, 0), key);
      const back = [[place(rbox(w, backH, .11, .04), 0, backH / 2, 0), key]];
      if (style === 'suv') {
        back.push([place(rbox(w * .55, .18, .1, .04), 0, backH + .12, 0), key], [place(rbox(w * .5, backH * .6, .02, .01), 0, backH * .45, .06), insert]);
        for (const s of [-1, 1]) at(place(rbox(.08, .1, depth * .9, .035), s * (w / 2 - .02), .04, 0), key);
      } else for (let i = -3; i <= 3; i++) back.push([place(rbox(.012, backH * .8, .015, .005), i * w / 8, backH * .45, .06), 'leather2']);
      for (const [geo, k] of back) at(place(geo, 0, .03, -depth / 2 + .03, -recline), k);
    }
    for (const [geo, k] of g) this.add(place(geo, x, y, z), k);
  }
}

/* ------------------------------------------------------------------ steering wheels */
/** A steering wheel in a pivot group (rotation.z turns it), facing -z toward the driver. */
export function steeringWheel(cabin, style, {x, y, z, tilt = -.35, size = 1}) {
  const c = cabin.child(), pivot = new T.Group(); pivot.position.set(x, y, z); pivot.rotation.x = tilt;
  const s = size;
  if (style === 'aero') {
    // Flat-topped, flat-bottomed rim with alcantara grips, a carbon centre with
    // a small screen, shift lights along the top and carbon paddles.
    const pts = [];
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, cx = Math.cos(a), cy = Math.sin(a); pts.push([Math.sign(cx) * Math.pow(Math.abs(cx), .7) * .17 * s, Math.sign(cy) * Math.pow(Math.abs(cy), .55) * .125 * s, 0]); }
    c.add(tubeAlong(pts, .017 * s, 10, true, 3), 'alcantara');
    c.add(place(rbox(.2 * s, .1 * s, .035, .02), 0, -.005, .01), 'carbon');
    for (const sx of [-1, 1]) c.add(place(rbox(.07 * s, .03, .025, .01), sx * .115 * s, -.01, .012, 0, 0, sx * .2), 'carbon');
    c.add(place(new T.PlaneGeometry(.085 * s, .045 * s), 0, .01, -.009, 0, Math.PI, 0), 'screen');
    for (let i = 0; i < 9; i++) c.add(place(new T.BoxGeometry(.008, .006, .004), (i - 4) * .014 * s, .07 * s, -.008), i < 3 ? 'ledG' : i < 6 ? 'led' : 'ledB');
    for (const sx of [-1, 1]) {
      c.add(place(rbox(.018, .018, .01, .004), sx * .075 * s, -.035, -.012), 'accent');
      c.add(place(rbox(.012, .1 * s, .05, .005), sx * .13 * s, .02, .04, 0, 0, sx * -.15), 'carbon');       // shift paddles
    }
    c.add(place(rbox(.014, .02, .012, .004), 0, .128 * s, -.005), 'accent');                              // centre mark
  } else if (style === 'lux') {
    c.add(place(new T.TorusGeometry(.195 * s, .013, 12, 64), 0, 0, 0), 'leather');
    c.add(place(new T.TorusGeometry(.2 * s, .0025, 6, 64), 0, 0, -.006), 'chrome');
    c.add(place(new T.CylinderGeometry(.042, .046, .035, 32), 0, 0, .01, Math.PI / 2), 'leather');
    c.add(place(new T.CylinderGeometry(.03, .03, .005, 32), 0, 0, -.012, Math.PI / 2), 'chrome');
    for (const a of [Math.PI, 0, -Math.PI / 2]) { const L = .15 * s; c.add(place(rbox(L, .022, .012, .006), Math.cos(a) * (L / 2 + .045), Math.sin(a) * (L / 2 + .045), .005, 0, 0, a), 'chrome'); }
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
