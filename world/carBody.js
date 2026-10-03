/* Player car bodies, built in code (2026-09-26, generalised 2026-09-28).
 *
 * A body is lofted: a smooth skin swept along the car through keyframed
 * profiles (half-width, sill, shoulder and deck heights), a glass greenhouse
 * on top of it, and wheel arches cut by raising the sill over each wheel and
 * boxing the well behind it. The keyframes, the greenhouse and the details
 * are the model (world/carModels.js); this file is the machinery they share:
 * the loft, skin-moulded patches, the material set and the final merge.
 *
 * Model space: +z forward, +x left, y up, ground at y = 0.
 * The skin has no top inside the greenhouse: the cabin is open to the glass
 * and the interior (world/carInterior.js) is seen through it.
 */
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {positionLocal, abs, float, smoothstep, step, materialColor, uv, fract, vec3, mix, floor, mod, normalLocal, normalView, positionViewDirection, fwidth} from 'three/tsl';

/** Monotone cubic through [[z, v], ...] (no overshoot between keys). */
export function curve(keys) {
  const n = keys.length, xs = keys.map(k => k[0]), ys = keys.map(k => k[1]);
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return z => {
    if (z <= xs[0]) return ys[0];
    if (z >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (z > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (z - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
/** Catmull-Rom through 2D points, `per` samples per span. */
export function spline(pts, per) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(c => .5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** A grid surface from rows of 3D points (all rows the same length). groupOf(i, j) -> material index, or -1 to leave the cell out. */
export function gridGeometry(rows, {groupOf = null, groups = 2} = {}) {
  const pos = [], idx = Array.from({length: groups}, () => []), cols = rows[0].length;
  for (const r of rows) for (const p of r) pos.push(p[0], p[1], p[2]);
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1, g = groupOf ? groupOf(i, j) : 0;
    if (g < 0) continue;
    idx[g].push(a, b, c, b, d, c);          // outward: rows run +z, columns run up over the top
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx.flat());
  let at = 0;
  idx.forEach((l, k) => { if (l.length) g.addGroup(at, l.length, k); at += l.length; });
  g.computeVertexNormals();
  return g;
}
/** A flat fan closing a loop of points (an end cap), facing `normal`. */
export function capGeometry(loop, normal) {
  const c = loop.reduce((s, p) => [s[0] + p[0] / loop.length, s[1] + p[1] / loop.length, s[2] + p[2] / loop.length], [0, 0, 0]);
  const pos = [...c], idx = [];
  loop.forEach(p => pos.push(...p));
  for (let i = 0; i < loop.length - 1; i++) idx.push(0, i + 1, i + 2);
  idx.push(0, loop.length, 1);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const n = g.attributes.normal;
  if (n.getX(0) * normal[0] + n.getY(0) * normal[1] + n.getZ(0) * normal[2] < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
  }
  // Flat: smoothed normals across a fan shade it as a star of triangles.
  const flat = new Float32Array(pos.length);
  for (let i = 0; i < flat.length; i += 3) flat.set(normal, i);
  g.setAttribute('normal', new T.BufferAttribute(flat, 3));
  return g;
}
/** A tube along 3D points (a strip light, a trim line, a pipe). */
export function tube(points, r, radial = 6, closed = false) {
  const c = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)), closed, 'centripetal');
  return new T.TubeGeometry(c, Math.max(4, points.length * 6), r, radial, closed);
}
export const PAINTS = [
  ['Carbon black', '#0c0d10'], ['Obsidian petrol', '#0f3a45'], ['Aurora blue', '#123a9c'], ['Rosso corsa', '#9c0f12'],
  ['Arctic white', '#e9ebea'], ['Midnight blue', '#0d1c3d'], ['Solar yellow', '#e2a712'], ['Verde mantis', '#3f8f2c'],
  ['Royal violet', '#3b1a6e'], ['Satin graphite', '#2c2e31'], ['Sunset orange', '#d4561c'], ['Silver sable', '#9ea3a8'],
  ['Diamond black', '#16181d'], ['Riviera mint', '#6fa7a0'], ['Olive drab', '#3c4a3e'], ['Cream', '#e6dcc3'],
];
/** Cabin mood light colours, chosen in the garage. */
export const AMBIENTS = [
  ['Aurora blue', '#2f5bff'], ['Ice', '#a9d8ff'], ['Warm white', '#ffd6a0'], ['Amber', '#ff8a1e'],
  ['Magenta', '#ff2fb4'], ['Violet', '#8a4dff'], ['Racing red', '#ff2330'], ['Emerald', '#1fe08a'],
];

/* ------------------------------------------------------------------ materials */

/** Carbon-fibre 2x2 twill in the shader (2026-10-02, finer): ~4 mm tows with a
 *  rounded section, the diagonal twill steps, and the sheen that makes carbon
 *  read as carbon: tows running across the view light up, tows running along
 *  it go dark, so the checker flips as the camera moves. The weave fades to
 *  its average colour where it would shimmer (fwidth), so it stays clean at
 *  distance. Returns {color, rough}. */
function carbonWeave(scale = 230) {
  const P = positionLocal, N = abs(normalLocal);
  // Project on the plane the surface mostly faces.
  const top = step(N.x.max(N.z), N.y.mul(.9)), side = step(N.z, N.x);
  const a = mix(mix(P.x, P.z, side), P.x, top).mul(scale);
  const b = mix(P.y, P.z, top).mul(scale);
  const i = floor(a), j = floor(b), tw = mod(floor(i.add(j).mul(.5)), 2);        // which tow is on top: steps diagonally
  const across = mix(fract(b), fract(a), tw), tow = float(1).sub(across.mul(2).sub(1).pow(2));   // rounded tow section
  const V = positionViewDirection, ku = abs(V.x).mul(.8).add(.2), kv = abs(V.y).mul(.8).add(.2);
  const sheen = mix(ku, kv, tw);                                                     // the tows facing the light glint
  const lit = float(.38).add(tow.mul(.62).mul(sheen)).mul(float(.9).add(mod(i.add(j.mul(3)), 3).mul(.05)));
  const fade = float(1).sub(smoothstep(.22, .75, fwidth(a).max(fwidth(b))));
  const shade = mix(float(.62), lit, fade);
  return {color: vec3(.024, .026, .03).mul(shade).mul(1.25), rough: mix(float(.34), float(.18).add(float(1).sub(tow).mul(.25)), fade)};
}
function carbonNode(scale) { return carbonWeave(scale).color; }

export function carMaterials({paint = '#0c0d10', accent = '#1e4cff', flake = .6, paintRough = .28, glassTint = '#0b1216', glassOpacity = .42} = {}) {
  const m = {};
  // Paint: metallic base with a fine flake under a clear coat; shut lines are drawn by the model.
  m.paint = new T.MeshPhysicalNodeMaterial({color: paint, metalness: flake, roughness: paintRough, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: 1.25});
  m.paint.name = 'paint';
  // Glass: see-through face on, a mirror at grazing angles (Fresnel), as real glazing reads.
  m.glass = new T.MeshPhysicalNodeMaterial({color: glassTint, metalness: .1, roughness: .03, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 1.8, transparent: true, depthWrite: false});
  m.glass.opacityNode = mix(float(glassOpacity), float(.97), float(1).sub(abs(normalView.dot(positionViewDirection))).pow(2.5));
  m.glass.name = 'glass';
  m.black = new T.MeshStandardMaterial({color: '#0a0b0c', roughness: .6, metalness: .2, side: T.DoubleSide});
  m.gloss = new T.MeshPhysicalMaterial({color: '#08090a', roughness: .12, metalness: .3, clearcoat: 1, clearcoatRoughness: .05});
  m.carbon = new T.MeshPhysicalNodeMaterial({roughness: .3, metalness: .3, clearcoat: 1, clearcoatRoughness: .04});
  { const w = carbonWeave(); m.carbon.colorNode = w.color; m.carbon.roughnessNode = w.rough; }
  m.chrome = new T.MeshStandardMaterial({color: '#d4d7db', roughness: .08, metalness: 1, side: T.DoubleSide});
  m.satin = new T.MeshStandardMaterial({color: '#8d9298', roughness: .32, metalness: .9, side: T.DoubleSide});
  m.rubber = new T.MeshStandardMaterial({color: '#141515', roughness: .85});
  m.accent = new T.MeshPhysicalMaterial({color: accent, roughness: .25, metalness: .5, clearcoat: 1});
  m.head = new T.MeshStandardMaterial({color: '#dfe9f5', emissive: '#e8f2ff', emissiveIntensity: .6, roughness: .2, toneMapped: false, side: T.DoubleSide});
  m.tail = new T.MeshStandardMaterial({color: '#5a0508', emissive: '#ff1a1f', emissiveIntensity: .45, roughness: .3, toneMapped: false});
  m.tail.name = 'Brake LED'; m.head.name = 'Headlight LED';
  m.lens = new T.MeshPhysicalMaterial({color: '#0d1114', metalness: .1, roughness: .03, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 2});
  m.lamp = new T.MeshPhysicalMaterial({color: '#10161d', metalness: .2, roughness: .02, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 2, transparent: true, opacity: .55});
  m.reverse = new T.MeshStandardMaterial({color: '#d9dde2', emissive: '#f4f7ff', emissiveIntensity: 0, roughness: .15, toneMapped: false});
  m.grille = new T.MeshStandardMaterial({color: '#050506', emissive: '#fff1dc', emissiveIntensity: 0, roughness: .85, metalness: 0});
  m.mirror = new T.MeshStandardMaterial({color: '#9aa3ad', roughness: .02, metalness: 1});
  // Titanium exhaust: straw to blue heat tint along the tip.
  m.ti = new T.MeshPhysicalNodeMaterial({metalness: 1, roughness: .22, clearcoat: .5, side: T.DoubleSide});
  m.ti.colorNode = mix(mix(vec3(.72, .72, .74), vec3(.8, .6, .3), smoothstep(.15, .5, uv().y)), vec3(.28, .3, .78), smoothstep(.5, .95, uv().y));
  m.redLens = new T.MeshPhysicalMaterial({color: '#2a0205', metalness: .1, roughness: .05, clearcoat: 1, envMapIntensity: 1.6});
  m.amberLens = new T.MeshPhysicalMaterial({color: '#6a3a05', metalness: .1, roughness: .1, clearcoat: 1});
  m.vent = new T.MeshStandardNodeMaterial({roughness: .6, metalness: .3, side: T.DoubleSide});
  m.vent.colorNode = vec3(.02, .021, .024).mul(fract(uv().x.mul(40)).sub(.5).abs().mul(2).mul(.4).add(.6));
  m.honey = new T.MeshStandardNodeMaterial({roughness: .45, metalness: .5, side: T.DoubleSide});
  {
    // Hex mesh sized in metres (about 14 mm cells) on the plane the surface faces,
    // fading to its average once a cell is smaller than a pixel or two.
    const P = positionLocal, N = abs(normalLocal);
    const u = mix(mix(P.x, P.z, step(N.z, N.x)), P.x, step(N.x.max(N.z), N.y)), v = mix(P.y, P.z, step(N.x.max(N.z), N.y));
    const q = vec3(u, v, 0).xy.mul(vec3(72, 62, 1).xy), row = q.y.floor(), hx = fract(q.x.add(row.mod(2).mul(.5))).sub(.5).abs(), hy = fract(q.y).sub(.5).abs();
    const web = smoothstep(.3, .42, hx).max(smoothstep(.34, .46, hy)), fade = smoothstep(.35, .9, fwidth(q.x).add(fwidth(q.y)));
    m.honey.colorNode = mix(vec3(.004, .004, .005), vec3(.05, .052, .056), mix(web, float(.3), fade));
  }
  return m;
}

/** Shut lines on the paint: `lines(P)` returns a 0..1 node of where the gaps are. */
export function shutLines(mat, lines) {
  mat.colorNode = materialColor.mul(float(1).sub(lines(positionLocal).min(1).mul(.9)));
}
/** A gap line at `at` along `v`, `w` wide. */
export const gap = (v, at, w = .0045) => float(1).sub(smoothstep(0, w, abs(v.sub(at))));
export {step, abs};

/* ------------------------------------------------------------------ the loft */

/**
 * spec: {
 *   Z0, Z1                 tail and nose
 *   halfW, belt, deck, sill: keyframes [[z, v], ...]
 *   archR                  arch opening radius (defaults to wheel radius + .12)
 *   section(z, w, s, b, d, lift)  optional cross-section control points, sill -> centre line
 *   green: {GZ0, GZ1, roof: keys, gw(z, halfW), rw(z, halfW), glass(z, side, j, cols) -> 0 paint | 1 glass}
 * }
 */
export function loftBody(spec, wheels, radius, mats, {coarse = false} = {}) {
  const DZ = coarse ? .16 : .035, PER = coarse ? 2 : 4, GDZ = coarse ? .14 : .04, PQ = coarse ? .4 : 1;
  const wx = Math.max(...wheels.map(w => Math.abs(w.x)));
  const zf = Math.max(...wheels.map(w => w.z)), zr = Math.min(...wheels.map(w => w.z)), wy = wheels[0].y;
  const R = spec.archR ?? radius + .12;
  const {Z0, Z1} = spec;
  const halfW = curve(spec.halfW), belt = curve(spec.belt), deck = curve(spec.deck), sillBase = curve(spec.sill);
  const arch = z => {
    let y = -1;
    for (const zc of [zf, zr]) { const d = z - zc; if (Math.abs(d) < R) y = Math.max(y, wy + Math.sqrt(R * R - d * d) * (spec.archFlat ?? .98)); }
    return y;
  };
  const sill = z => Math.max(sillBase(z), arch(z));
  const FLOOR = spec.floor ?? .16, IN = wx - (spec.wellIn ?? .2);

  const zs = [];
  for (let z = Z0; z <= Z1 + 1e-6; z += DZ) zs.push(Math.min(z, Z1));
  if (zs[zs.length - 1] < Z1) zs.push(Z1);
  // Keep a row exactly at each arch edge so the cut is clean.
  for (const zc of [zf, zr]) for (const e of [-R, R]) if (zc + e > Z0 && zc + e < Z1) zs.push(zc + e);
  zs.sort((a, b) => a - b);

  const section = spec.section || ((z, w, s, b, d, lift) =>
    [[w * .965, s], [w, s + .32 * (b - s) + lift * .1], [w * .99, b - .06], [w * .935, b], [w * .8, b - .025], [w * .6, Math.min(d - .01, b - .06)], [w * .32, d + .01], [0, d + .02]]);
  const ctrl = z => {
    const w = halfW(z), s = sill(z), b = belt(z), d = deck(z);
    return section(z, w, s, b, d, Math.max(0, s - sillBase(z)));
  };
  const skinRow = z => {
    const half = spline(ctrl(z), PER);
    return [...half.map(([x, y]) => [x, y, z]), ...half.slice(0, -1).reverse().map(([x, y]) => [-x, y, z])];
  };
  const cache = new Map();
  /** A point on the skin: z along the car, t 0 (sill) .. 1 (centre line), side +-1. */
  const skinPoint = (z, t, side = 1) => {
    const key = Math.round(z * 1e4);
    let h = cache.get(key); if (!h) cache.set(key, h = spline(ctrl(z), 12));
    const f = Math.max(0, Math.min(1, t)) * (h.length - 1), i = Math.min(h.length - 2, Math.floor(f)), u = f - i;
    return [side * (h[i][0] + (h[i + 1][0] - h[i][0]) * u), h[i][1] + (h[i + 1][1] - h[i][1]) * u, z];
  };
  const skinNormal = (z, t, side = 1) => {
    const a = skinPoint(z + .01, t, side), b = skinPoint(z - .01, t, side), c = skinPoint(z, t + .01, side), d = skinPoint(z, t - .01, side), p = skinPoint(z, t, side);
    const u = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], v = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1; n = n.map(q => q / l);
    if (n[0] * p[0] + n[1] * (p[1] - .45) < 0) n = n.map(q => -q);
    return n;
  };
  /** The t on the skin at height y (searching the side first), for placing details by height. */
  const tAt = (z, y, from = 0, to = 1) => { let best = from, bd = 1e9; for (let k = 0; k <= 60; k++) { const t = from + (to - from) * k / 60, d = Math.abs(skinPoint(z, t)[1] - y); if (d < bd) { bd = d; best = t; } } return best; };
  /** A patch moulded on the skin, `lift` metres proud of it. tA/tB may vary with z. */
  const patch = (z0, z1, tA, tB, lift, side, nz = 10, nt = 6) => {
    nz = Math.max(1, Math.round(nz * PQ)); nt = Math.max(1, Math.round(nt * PQ));
    const pos = [], uvs = [], idx = [];
    for (let i = 0; i <= nz; i++) for (let j = 0; j <= nt; j++) {
      const z = z0 + (z1 - z0) * i / nz, a = typeof tA === 'function' ? tA(z) : tA, b = typeof tB === 'function' ? tB(z) : tB;
      const t = a + (b - a) * j / nt, p = skinPoint(z, t, side), n = skinNormal(z, t, side);
      const l = typeof lift === 'function' ? lift(i / nz, j / nt) : lift;
      pos.push(p[0] + n[0] * l, p[1] + n[1] * l, p[2] + n[2] * l); uvs.push(i / nz, j / nt);
    }
    for (let i = 0; i < nz; i++) for (let j = 0; j < nt; j++) {
      const a = i * (nt + 1) + j, b = a + 1, c = a + nt + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
    const nn = g.attributes.normal, P = skinNormal((z0 + z1) / 2, ((typeof tA === 'function' ? tA(z0) : tA) + (typeof tB === 'function' ? tB(z0) : tB)) / 2, side);
    const k = Math.floor(nn.count / 2);
    if (nn.getX(k) * P[0] + nn.getY(k) * P[1] + nn.getZ(k) * P[2] < 0) { for (let q = 0; q < idx.length; q += 3) [idx[q + 1], idx[q + 2]] = [idx[q + 2], idx[q + 1]]; g.setIndex(idx); g.computeVertexNormals(); }
    return g;
  };

  /* ---- greenhouse */
  const G = spec.green, GZ0 = G.GZ0, GZ1 = G.GZ1;
  const roof = curve(G.roof);
  const gw = z => G.gw(z, halfW(z)), rw = z => G.rw(z, halfW(z));
  const gBase = z => G.base ? G.base(z) : Math.min(belt(z), deck(z) + .02);

  // The skin has no top where the greenhouse stands: the cabin is open to the glass.
  const skinRows = zs.map(skinRow);
  const open = (p) => p[2] > GZ0 + .01 && p[2] < GZ1 - .01 && Math.abs(p[0]) < gw(p[2]) - .015 && p[1] > gBase(p[2]) - .12;
  const skin = gridGeometry(skinRows, {groupOf: (i, j) => {
    const q = [skinRows[i][j], skinRows[i][j + 1], skinRows[i + 1][j], skinRows[i + 1][j + 1]];
    return q.every(open) ? -1 : 0;
  }, groups: 1});

  const underRows = zs.map(z => {
    const w = halfW(z) * .965, s = sill(z), si = Math.min(s, deck(z) + .03);
    return [[w, s, z], [IN, si, z], [IN, FLOOR, z], [-IN, FLOOR, z], [-IN, si, z], [-w, s, z]];
  });
  const under = gridGeometry(underRows, {groups: 1});

  const gzs = []; for (let z = GZ0; z <= GZ1 + 1e-6; z += GDZ) gzs.push(Math.min(z, GZ1));
  if (gzs[gzs.length - 1] < GZ1) gzs.push(GZ1);
  const gRow = z => {
    const base = gBase(z), top = Math.max(base + .002, roof(z)), w0 = gw(z), w1 = rw(z);
    const half = G.shape ? G.shape(z, w0, w1, base, top) : [[w0, base], [w0 * .96 + w1 * .04, base + (top - base) * .55], [w1 + .03, top - .04], [w1 * .7, top - .005], [0, top + .01]];
    return [...half.map(([x, y]) => [x, y, z]), ...half.slice(0, -1).reverse().map(([x, y]) => [-x, y, z])];
  };
  const gRows = gzs.map(gRow);
  const gcols = gRows[0].length;
  const green = gridGeometry(gRows, {groupOf: (i, j) => {
    const z = (gzs[i] + gzs[i + 1]) / 2, sideCol = j < G.sideCols || j >= gcols - 1 - G.sideCols;
    return G.glass(z, sideCol, j, gcols) ? 1 : 0;
  }});

  const group = new T.Group();
  const parts = [];                     // [geometry, material] merged at the end
  const add = (g, m) => { parts.push([g, m]); return g; };
  const place = (g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz)));
    return g;
  };
  const box = (m, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => add(place(new T.BoxGeometry(sx, sy, sz), x, y, z, rx, ry, rz), m);
  add(skin, mats.paint);
  add(under, mats.black);
  add(green, [mats.paint, mats.glass]);
  add(capGeometry(skinRows[skinRows.length - 1], [0, 0, 1]), mats.paint);
  add(capGeometry(skinRows[0], [0, 0, -1]), mats.paint);
  add(capGeometry(underRows[0], [0, 0, -1]), mats.black);
  add(capGeometry(underRows[underRows.length - 1], [0, 0, 1]), mats.black);
  // Glass ends: the windshield and backlight meet the deck, but the rows'
  // first/last loops are open; close them so no slot shows at the base.
  add(capGeometry(gRows[0], [0, 0, -1]), mats.paint);
  add(capGeometry(gRows[gRows.length - 1], [0, 0, 1]), mats.glass);
  const base = parts.length;              // the loft's own parts; details come after

  /** Merge every part into one mesh per material (a handful of draw calls). */
  const finish = () => {
    const byMat = new Map();
    const push = (m, g) => { (byMat.get(m) || byMat.set(m, []).get(m)).push(g); };
    for (const p of parts) {
      const [g, m] = p;
      // The dealer fleet (coarse) leaves out the small parts: nobody sees them from the road.
      // Beyond the loft itself it keeps only big, simple parts (the grille frame, the wing, the splitter).
      if (coarse && !Array.isArray(m) && parts.indexOf(p) >= base) {
        g.computeBoundingBox(); const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
        if (g.boundingBox.getSize(new T.Vector3()).length() < .3 || tris > 600) continue;
      }
      let src = g.index ? g.toNonIndexed() : g.clone();
      for (const k of Object.keys(src.attributes)) if (!['position', 'normal', 'uv'].includes(k)) src.deleteAttribute(k);
      if (!src.attributes.normal) src.computeVertexNormals();
      if (!src.attributes.uv) src.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(src.attributes.position.count * 2), 2));
      if (!Array.isArray(m)) { push(m, src); continue; }
      for (const grp of g.groups) {
        const part = new T.BufferGeometry();
        for (const k of ['position', 'normal', 'uv']) { const a = src.attributes[k]; part.setAttribute(k, new T.Float32BufferAttribute(a.array.slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize)); }
        push(m[grp.materialIndex], part);
      }
    }
    for (const [m, gs] of byMat) {
      const mesh = new T.Mesh(mergeGeometries(gs), m);
      mesh.castShadow = m !== mats.glass; mesh.receiveShadow = true; mesh.name = m.name || '';
      if (m === mats.glass) mesh.renderOrder = 1;
      group.add(mesh);
      gs.forEach(g => g.dispose());
    }
    parts.length = 0;
    return group;
  };

  /** A point `lift` metres proud of the skin at (z, t, side). */
  const onSkin = (z, t, side = 1, lift = 0) => { const p = skinPoint(z, t, side), n = skinNormal(z, t, side); return [p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift]; };
  /** Turn-signal parts, lit by carFx (not merged): `seq` runs 0..1 along dir for the sequential sweep. */
  const signals = {left: [], right: []};
  const signal = (side, g, dir = null) => {
    g = g.index ? g.toNonIndexed() : g;
    const p = g.attributes.position, seq = new Float32Array(p.count);
    if (dir) {
      let lo = Infinity, hi = -Infinity; const v = i => p.getX(i) * dir[0] + p.getY(i) * dir[1] + p.getZ(i) * dir[2];
      for (let i = 0; i < p.count; i++) { lo = Math.min(lo, v(i)); hi = Math.max(hi, v(i)); }
      for (let i = 0; i < p.count; i++) seq[i] = (v(i) - lo) / Math.max(1e-6, hi - lo);
    }
    g.setAttribute('seq', new T.BufferAttribute(seq, 1));
    signals[side > 0 ? 'left' : 'right'].push(g);
  };
  const dims = {Z0, Z1, GZ0, GZ1, zf, zr, wx, wy, R, roof, halfW, deck, belt, sill, gw, rw, gBase};
  return {group, add, place, box, patch, skinPoint, skinNormal, onSkin, signal, signals, tAt, finish, dims, mats, coarse, halfW, belt, deck, sill, sillBase, roof, gw, rw, gBase, zf, zr, wx, wy, R, Z0, Z1, GZ0, GZ1};
}
