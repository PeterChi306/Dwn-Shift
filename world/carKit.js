/* Shape and material kit for the detailed player cars (2026-09-29).
 *
 * The first car pass built parts from boxes and straight extrusions, which is
 * what made them read as "geometric". Everything here is soft or swept:
 *
 *   roundPoly   rounds every corner of a 2D outline (fillets, n segments each)
 *   softBox     a box whose edges are rounded to radius r, with an optional
 *               deform(p) for bolsters, domes and tapers (seats, pads, knobs)
 *   loftSolid   a closed cross-section carried along stations with its ends
 *               capped (dashboards, consoles, door cards, spoilers)
 *   sweep       a profile swept along a 3D path on parallel-transport frames,
 *               thickness varying along it (steering rims, light guides, trims)
 *   ribbon      a flat strip along a path, a hair off a surface (stitching,
 *               pinstripes, LED blades)
 *   lathe       a profile turned about +x (knobs, bezels, exhaust tips)
 *
 * Materials are TSL node materials with the detail in the shader: grained and
 * perforated leather, quilting that catches light, stitch dashes, brushed and
 * knurled metal, open-pore and lacquered wood, carpet, speaker mesh.
 */
import * as T from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {positionLocal, uv, vec2, vec3, float, fract, floor, abs, step, smoothstep, mix, sin, length, min, max, mx_noise_float, mx_fractal_noise_float, normalLocal, Fn, dFdx, dFdy, positionView, normalView, faceDirection, cross} from 'three/tsl';

/** Bump from any height node (three's bumpMap only works on textures): Mikkelsen's surface-gradient perturbation. */
export const bumpMap = (h, scale) => Fn(() => {
  const dHdxy = vec2(dFdx(h), dFdy(h)).mul(scale);
  const sx = dFdx(positionView), sy = dFdy(positionView), n = normalView;
  const r1 = cross(sy, n), r2 = cross(n, sx), det = sx.dot(r1).mul(faceDirection);
  const grad = det.sign().mul(r1.mul(dHdxy.x).add(r2.mul(dHdxy.y)));
  return det.abs().mul(n).sub(grad).normalize();
})();

/* ------------------------------------------------------------------ 2D */
/** Round each corner of a closed polygon [[a, b], ...] by radius r (or r[i] per corner). */
export function roundPoly(pts, r, seg = 4) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n], ri = Array.isArray(r) ? r[i] : r;
    const da = [a[0] - p[0], a[1] - p[1]], db = [b[0] - p[0], b[1] - p[1]], la = Math.hypot(...da), lb = Math.hypot(...db);
    if (!ri || la < 1e-6 || lb < 1e-6) { out.push(p); continue; }
    const k = Math.min(ri, la * .45, lb * .45), s = [p[0] + da[0] / la * k, p[1] + da[1] / la * k], e = [p[0] + db[0] / lb * k, p[1] + db[1] / lb * k];
    for (let j = 0; j <= seg; j++) {
      const t = j / seg, u = 1 - t;                      // quadratic Bezier s -> p -> e
      out.push([u * u * s[0] + 2 * u * t * p[0] + t * t * e[0], u * u * s[1] + 2 * u * t * p[1] + t * t * e[1]]);
    }
  }
  return out;
}
/** A superellipse loop (rounded rectangle when n is large), half sizes a, b. */
export function superLoop(a, b, n = 4, seg = 32) {
  const out = [];
  for (let i = 0; i < seg; i++) {
    const t = i / seg * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    out.push([a * Math.sign(c) * Math.abs(c) ** (2 / n), b * Math.sign(s) * Math.abs(s) ** (2 / n)]);
  }
  return out;
}

/* ------------------------------------------------------------------ 3D */
export const place = (g, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz, 'YXZ')), typeof s === 'number' ? new T.Vector3(s, s, s) : new T.Vector3(...s)));

function orient(g, inside) {
  // Flip the winding if the normals point toward `inside` (a point in the solid).
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  let dot = 0;
  for (let i = 0; i < p.count; i += Math.max(1, Math.floor(p.count / 200))) dot += (p.getX(i) - inside[0]) * n.getX(i) + (p.getY(i) - inside[1]) * n.getY(i) + (p.getZ(i) - inside[2]) * n.getZ(i);
  if (dot < 0) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.index.needsUpdate = true; g.computeVertexNormals();
  }
  return g;
}

/**
 * A box sx*sy*sz, centred, with edges rounded to r; deform(x, y, z) -> [x, y, z]
 * runs on the rounded shape (in box coordinates) for bolsters and domes.
 */
export function softBox(sx, sy, sz, r = .02, seg = 10, deform = null) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  r = Math.min(r, hx * .98, hy * .98, hz * .98);
  const g = mergeVertices(new T.BoxGeometry(sx, sy, sz, sx > sy * 3 ? seg + 2 : seg, Math.max(2, Math.min(seg + 2, Math.round(seg * sy / Math.max(sx, sz)))), sz > sy * 3 ? seg + 2 : seg).deleteAttribute('normal').deleteAttribute('uv'));
  const p = g.attributes.position, uvs = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    // Spread vertices toward the edges first so the fillets get most of them.
    const spread = (v, h) => Math.sign(v) * h * (1 - Math.max(0, 1 - Math.abs(v) / h) ** 1.8);
    let x = spread(p.getX(i), hx), y = spread(p.getY(i), hy), z = spread(p.getZ(i), hz);
    const cx = Math.max(-hx + r, Math.min(hx - r, x)), cy = Math.max(-hy + r, Math.min(hy - r, y)), cz = Math.max(-hz + r, Math.min(hz - r, z));
    let dx = x - cx, dy = y - cy, dz = z - cz; const l = Math.hypot(dx, dy, dz);
    if (l > 1e-9) { x = cx + dx / l * r; y = cy + dy / l * r; z = cz + dz / l * r; }
    if (deform) [x, y, z] = deform(x, y, z);
    p.setXYZ(i, x, y, z); uvs[i * 2] = x + z; uvs[i * 2 + 1] = y;
  }
  g.setAttribute('uv', new T.BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * A solid lofted through stations. loop(s) -> closed [[a, b], ...] (same count
 * for every station), map(s, a, b) -> [x, y, z]. Ends capped. uv = (metres
 * along the stations, metres around the loop).
 */
export function loftSolid(stations, loop, map, {caps = true} = {}) {
  const rows = stations.map(s => loop(s).map(([a, b]) => map(s, a, b)));
  const n = rows[0].length, pos = [], uvs = [], idx = [];
  let along = 0;
  rows.forEach((r, i) => {
    if (i) along += Math.hypot(r[0][0] - rows[i - 1][0][0], r[0][1] - rows[i - 1][0][1], r[0][2] - rows[i - 1][0][2]);
    let around = 0;
    for (let j = 0; j <= n; j++) { const q = r[j % n]; if (j) { const o = r[j - 1]; around += Math.hypot(q[0] - o[0], q[1] - o[1], q[2] - o[2]); } pos.push(...q); uvs.push(along, around); }
  });
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < n; j++) { const a = i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const centre = [0, 0, 0]; rows.forEach(r => r.forEach(q => { centre[0] += q[0]; centre[1] += q[1]; centre[2] += q[2]; }));
  centre.forEach((_, k) => centre[k] /= rows.length * n);
  if (caps) for (const [ri, rowIdx] of [[0, 0], [rows.length - 1, rows.length - 1]]) {
    const r = rows[ri], c = r.reduce((s, q) => [s[0] + q[0] / n, s[1] + q[1] / n, s[2] + q[2] / n], [0, 0, 0]), base = pos.length / 3;
    pos.push(...c); uvs.push(0, 0);
    for (let j = 0; j < n; j++) { pos.push(...r[j]); uvs.push(r[j][0], r[j][1]); }
    for (let j = 0; j < n; j++) idx.push(base, base + 1 + j, base + 1 + (j + 1) % n);
    void rowIdx;
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); g.setIndex(idx);
  // Caps and the side can disagree on winding; orient each by the solid's centre.
  return orientParts(g, centre, rows.length * (n + 1));
}
function orientParts(g, centre, sideVerts) {
  // Side first (its triangles are the first ones), then each cap fan.
  const idx = g.index.array, p = g.attributes.position;
  const fix = (from, to) => {
    let dot = 0;
    for (let t = from; t < to; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const ax = p.getX(a), ay = p.getY(a), az = p.getZ(a), ux = p.getX(b) - ax, uy = p.getY(b) - ay, uz = p.getZ(b) - az, vx = p.getX(c) - ax, vy = p.getY(c) - ay, vz = p.getZ(c) - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      dot += nx * (ax - centre[0]) + ny * (ay - centre[1]) + nz * (az - centre[2]);
    }
    if (dot < 0) for (let t = from; t < to; t += 3) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; }
  };
  let side = 0; while (side < idx.length && idx[side] < sideVerts && idx[side + 1] < sideVerts && idx[side + 2] < sideVerts) side += 3;
  fix(0, side);
  const capLen = (idx.length - side) / 2;
  if (capLen > 0) { fix(side, side + capLen); fix(side + capLen, idx.length); }
  g.index.needsUpdate = true;
  // Hard edge between side and caps: split the cap vertices already done (own vertices), so smooth normals are fine.
  g.computeVertexNormals();
  return g;
}

/** Parallel-transport frames along points. up: the first frame's normal hint. */
function frames(pts, up = [0, 1, 0], closed = false) {
  const V = a => new T.Vector3(...a), P = pts.map(V), n = P.length, Tn = [], N = [], B = [];
  for (let i = 0; i < n; i++) {
    const a = P[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = P[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    Tn.push(b.clone().sub(a).normalize());
  }
  let nn = V(up).sub(Tn[0].clone().multiplyScalar(V(up).dot(Tn[0]))); if (nn.lengthSq() < 1e-8) nn = new T.Vector3(1, 0, 0).cross(Tn[0]); nn.normalize();
  for (let i = 0; i < n; i++) {
    if (i) { const q = new T.Quaternion().setFromUnitVectors(Tn[i - 1], Tn[i]); nn = nn.clone().applyQuaternion(q).normalize(); }
    N.push(nn); B.push(Tn[i].clone().cross(nn).normalize());
  }
  return {P, T: Tn, N, B};
}
/** Resample a polyline / Catmull-Rom through points to `count` evenly spaced points. */
export function resample(points, count, closed = false) {
  const c = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)), closed, 'centripetal');
  return c.getSpacedPoints(closed ? count : count - 1).slice(0, closed ? count : count).map(v => v.toArray());
}
/**
 * Sweep a closed profile along a path. profile(t) -> [[u, v], ...] (u along the
 * frame normal, v along the binormal); t = 0..1 along the path.
 */
export function sweep(path, profile, {up = [0, 1, 0], closed = false, caps = !closed} = {}) {
  const F = frames(path, up, closed), n = path.length, m = profile(0).length, pos = [], uvs = [], idx = [];
  let along = 0;
  for (let i = 0; i < n; i++) {
    if (i) along += F.P[i].distanceTo(F.P[i - 1]);
    const pr = profile(closed ? i / n : i / (n - 1));
    for (let j = 0; j <= m; j++) {
      const [u, v] = pr[j % m], q = F.P[i].clone().addScaledVector(F.N[i], u).addScaledVector(F.B[i], v);
      pos.push(q.x, q.y, q.z); uvs.push(along, j / m);
    }
  }
  const rowsN = closed ? n : n - 1;
  for (let i = 0; i < rowsN; i++) for (let j = 0; j < m; j++) {
    const a = i * (m + 1) + j, b = a + 1, c = ((i + 1) % n) * (m + 1) + j, d = c + 1; idx.push(a, b, c, b, d, c);
  }
  const sideLen = idx.length;
  if (caps) for (const i of [0, n - 1]) {
    const base = pos.length / 3, c = F.P[i]; pos.push(c.x, c.y, c.z); uvs.push(0, 0);
    for (let j = 0; j < m; j++) { const k = (i * (m + 1) + j) * 3; pos.push(pos[k], pos[k + 1], pos[k + 2]); uvs.push(0, 0); }
    // Face along -tangent at the start, +tangent at the end.
    const q = k => new T.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]), nrm = q(base + 1).sub(c).cross(q(base + 2).sub(c));
    const flip = nrm.dot(F.T[i]) * (i ? 1 : -1) < 0;
    for (let j = 0; j < m; j++) flip ? idx.push(base, base + 1 + (j + 1) % m, base + 1 + j) : idx.push(base, base + 1 + j, base + 1 + (j + 1) % m);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  // Outward: compare the first ring's normals with its offset from the path.
  const nA = g.attributes.normal; let dot = 0;
  for (let j = 0; j < m; j++) { const k = j; dot += (pos[k * 3] - F.P[0].x) * nA.getX(k) + (pos[k * 3 + 1] - F.P[0].y) * nA.getY(k) + (pos[k * 3 + 2] - F.P[0].z) * nA.getZ(k); }
  if (dot < 0) { const a = g.index.array; for (let t = 0; t < sideLen; t += 3) { const q = a[t + 1]; a[t + 1] = a[t + 2]; a[t + 2] = q; } g.index.needsUpdate = true; g.computeVertexNormals(); }
  return g;
}
/** Circle / ellipse profile for sweep: radii (a, b), k points. */
export const ring = (a, b = a, k = 12) => Array.from({length: k}, (_, i) => [Math.cos(i / k * Math.PI * 2) * a, Math.sin(i / k * Math.PI * 2) * b]);
/** A flat strip along path, width w, lying in the plane whose normal is `up`-ish (thickness th). */
export function ribbon(path, w, th = .0015, up = [0, 1, 0]) {
  const h = w / 2, t = th / 2;
  return sweep(path, () => [[t, -h], [t, h], [-t, h], [-t, -h]], {up});
}
/** A lathe about +x: profile [[r, x], ...]. */
export function lathe(profile, seg = 32) {
  const g = new T.LatheGeometry(profile.map(([r, x]) => new T.Vector2(Math.max(1e-4, r), x)), seg);
  g.applyMatrix4(new T.Matrix4().makeRotationZ(-Math.PI / 2));
  return g;
}

/* ------------------------------------------------------------------ materials (nodes) */
const P = positionLocal;
/** Leather: a fine pebbled grain in the normal and the gloss. */
export function leatherNodes(color, {grain = 240, perforate = false} = {}) {
  // A soft pebble: low-contrast colour, a gentle gloss break-up, a whisper of bump.
  // (No bump: at these scales a grain only aliases into sparkle; the leather reads through its sheen.)
  const g = mx_noise_float(P.mul(grain * .25)).mul(.7).add(mx_noise_float(P.mul(grain * .6)).mul(.3));
  const c = vec3(...new T.Color(color).toArray());
  let col = c.mul(float(1).sub(g.mul(.025)));
  if (perforate) {
    // Perforation: a dotted grid on the plane the surface faces.
    const N = abs(normalLocal), a = mix(P.x, P.z, step(N.z, N.x)).mul(110), b = mix(P.y, P.z, step(max(N.x, N.z), N.y)).mul(110);
    const d = length(vec2(fract(a.add(floor(b).mod(2).mul(.5))).sub(.5), fract(b).sub(.5)));
    col = col.mul(mix(float(.55), float(1), smoothstep(.14, .26, d)));
  }
  return {colorNode: col, roughnessNode: float(.52).add(g.mul(.04))};
}
/** Alcantara / suede: soft, matte, a little directional nap. */
export function suedeNodes(color) {
  const g = mx_fractal_noise_float(P.mul(140), 3);
  return {colorNode: vec3(...new T.Color(color).toArray()).mul(float(.95).add(g.mul(.05))), roughnessNode: float(.97)};
}
/** Quilted diamonds that puff out between the seams, with stitch dashes in the seams. */
export function quiltNodes(color, thread = null, scale = 16) {
  // Diamonds on the plane the surface faces (so a seat back and a cushion both quilt square-on).
  const N = abs(normalLocal), fx = step(max(N.y, N.z), N.x), fy = step(max(N.x, N.z), N.y).mul(float(1).sub(fx));
  const u = mix(mix(P.x, P.x, fy), P.z, fx), v = mix(mix(P.y, P.z, fy), P.y, fx);
  const a = u.add(v).mul(scale), b = u.sub(v).mul(scale);
  const fa = fract(a), fb = fract(b), ea = min(fa, fa.oneMinus()), eb = min(fb, fb.oneMinus());
  const puff = sin(fa.mul(Math.PI)).mul(sin(fb.mul(Math.PI))).max(0).pow(.6);
  const seam = smoothstep(.05, 0, min(ea, eb));
  const dash = step(.5, fract(a.add(b).mul(6)));
  const c = vec3(...new T.Color(color).toArray()), tc = vec3(...new T.Color(thread || color).toArray());
  const grain = mx_noise_float(P.mul(500)).mul(.05);
  return {colorNode: mix(c.mul(float(.97).sub(grain.mul(.3))), c.mul(.62), seam).add(tc.sub(c).mul(seam.mul(dash).mul(thread ? .6 : 0))), roughnessNode: float(.5).add(seam.mul(.15)), normalNode: bumpMap(puff.mul(.6), float(.3))};
}
/** Brushed metal: streaks along `axis` ('x' | 'z' | 'r' radial). */
export function brushedNodes(color = '#c5c9ce', axis = 'x') {
  const s = axis === 'x' ? P.y.add(P.z) : axis === 'z' ? P.x.add(P.y) : length(P.yz);
  const streak = mx_noise_float(vec3(s.mul(2600), s.mul(3), 0)).mul(.5).add(.5);
  return {colorNode: vec3(...new T.Color(color).toArray()).mul(float(.86).add(streak.mul(.18))), roughnessNode: float(.22).add(streak.mul(.12))};
}
/** Knurled metal (knobs): a diamond cross-hatch on the uv. */
export function knurlNodes(color = '#b9bdc2') {
  const a = fract(uv().x.mul(120).add(uv().y.mul(60))), b = fract(uv().x.mul(120).sub(uv().y.mul(60)));
  const k = min(min(a, a.oneMinus()), min(b, b.oneMinus()));
  return {colorNode: vec3(...new T.Color(color).toArray()).mul(float(.65).add(k.mul(.9))), roughnessNode: float(.3).add(k.mul(.3))};
}
/** Burr walnut under a deep lacquer. */
export function woodNodes(dark = '#2a1208', light = '#7a4020', scale = 1) {
  const q = P.mul(scale);
  const warp = mx_fractal_noise_float(q.mul(6), 3).mul(2.2);
  const ring = sin(q.z.mul(70).add(q.x.mul(18)).add(warp.mul(6))).mul(.5).add(.5);
  const burl = mx_noise_float(q.mul(38).add(warp)).mul(.5).add(.5);
  const t = ring.mul(.55).add(burl.mul(.45)).pow(1.4);
  return {colorNode: mix(vec3(...new T.Color(dark).toArray()), vec3(...new T.Color(light).toArray()), t)};
}
/** Speaker grille: fine round perforations in brushed metal. */
export function speakerNodes(color = '#b0b4b8') {
  const q = uv().mul(420), row = floor(q.y), d = length(vec2(fract(q.x.add(row.mod(2).mul(.5))).sub(.5), fract(q.y).sub(.5)));
  return {colorNode: mix(vec3(.02, .02, .022), vec3(...new T.Color(color).toArray()), smoothstep(.26, .32, d)), roughnessNode: float(.35)};
}
/** Deep-pile carpet (lambswool). */
export function carpetNodes(color) {
  const g = mx_fractal_noise_float(P.mul(160), 3);
  return {colorNode: vec3(...new T.Color(color).toArray()).mul(float(.92).add(g.mul(.08))), roughnessNode: float(1)};
}
/** Stitch thread along a ribbon: dashes along uv.x (metres). */
export function stitchNodes(color, base) {
  const dash = smoothstep(.2, .35, fract(uv().x.mul(220))).mul(smoothstep(.95, .8, fract(uv().x.mul(220))));
  return {colorNode: mix(vec3(...new T.Color(base).toArray()), vec3(...new T.Color(color).toArray()), dash), roughnessNode: float(.7)};
}
