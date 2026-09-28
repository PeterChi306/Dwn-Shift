/* The player's coupe body, built in code (2026-09-26).
 *
 * The Blender fleet body was a handful of bevelled boxes: the wheels stood
 * outside it with no arches, the rear was a black slab. This one is lofted:
 * a smooth skin swept along the car through keyframed profiles (half-width,
 * sill, shoulder and deck heights), a glass greenhouse on top of it, and wheel
 * arches cut by raising the sill over each wheel and boxing the well behind
 * it. The GLB's wheels (spokes, rotors, calipers) are kept and sit in the
 * arches at exactly the physics wheel positions.
 *
 * Model space matches the GLB: +z forward, +x left, y up, ground at y = 0.
 */
import * as T from 'three';
import {positionLocal, abs, float, smoothstep, step, materialColor, uv, fract, sin, vec3, mix} from 'three/tsl';

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
/** Centripetal-ish Catmull-Rom through 2D points, `per` samples per span. */
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

/** Build a grid surface from rows of 3D points (all rows the same length). */
function gridGeometry(rows, {groupOf = null} = {}) {
  const pos = [], idx = [[], []], cols = rows[0].length;
  for (const r of rows) for (const p of r) pos.push(p[0], p[1], p[2]);
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1, g = groupOf ? groupOf(i, j) : 0;
    idx[g].push(a, b, c, b, d, c);          // outward: rows run +z, columns run up over the top
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  const all = [...idx[0], ...idx[1]];
  g.setIndex(all);
  g.addGroup(0, idx[0].length, 0);
  if (idx[1].length) g.addGroup(idx[0].length, idx[1].length, 1);
  g.computeVertexNormals();
  return g;
}
/** A flat fan closing a loop of points (an end cap), facing `normal`. */
function capGeometry(loop, normal) {
  const c = loop.reduce((s, p) => [s[0] + p[0] / loop.length, s[1] + p[1] / loop.length, s[2] + p[2] / loop.length], [0, 0, 0]);
  const pos = [...c], idx = [];
  loop.forEach(p => pos.push(...p));
  for (let i = 0; i < loop.length - 1; i++) idx.push(0, i + 1, i + 2);
  idx.push(0, loop.length, 1);                                   // close the fan: last point back to the first
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  // Flip if the fan faces the wrong way.
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

export const PAINTS = [
  ['Obsidian petrol', '#0f3a45'], ['Rosso corsa', '#9c0f12'], ['Arctic white', '#e9ebea'],
  ['Midnight blue', '#0d1c3d'], ['Solar yellow', '#e2a712'], ['Verde mantis', '#3f8f2c'],
  ['Satin graphite', '#2c2e31'], ['Sunset orange', '#d4561c'],
];

/**
 * @param wheels  [{x, y, z, front}] physics wheel centres (model space)
 * @param radius  wheel radius
 */
export function buildCarBody(wheels, radius, paint = PAINTS[0][1], {coarse = false} = {}) {
  // coarse: the dealer display fleet (dozens of cars): ~1/6 the triangles, no tiny parts.
  const DZ = coarse ? .16 : .05, PER = coarse ? 2 : 3, GDZ = coarse ? .14 : .04, PQ = coarse ? .4 : 1;
  const wx = Math.max(...wheels.map(w => Math.abs(w.x)));
  const zf = Math.max(...wheels.map(w => w.z)), zr = Math.min(...wheels.map(w => w.z)), wy = wheels[0].y;
  const R = radius + .12;                                   // arch opening radius (clears ~5 cm of static squat)
  const Z0 = zr - .95, Z1 = zf + .98;                        // tail and nose
  // Keyframed profiles along the car (z): the coupe's whole shape is here.
  // Tyres reach wx + 0.12: the hips and front fenders flare past them.
  const tyre = wx + .12;
  const halfW = curve([[Z0, .84], [Z0 + .12, .95], [zr - .42, tyre + .025], [zr, tyre + .05], [zr + .42, tyre + .03], [zr + .85, 1.0], [0, .975], [zf - .6, .985], [zf - .4, tyre + .02], [zf, tyre + .035], [zf + .4, tyre + .015], [Z1 - .25, .93], [Z1 - .08, .86], [Z1, .76]]);
  // The shoulder line rises into haunches over both axles (a mid-engined
  // car's fenders stand above its bonnet and engine cover), dips along the doors.
  const belt = curve([[Z0, .72], [Z0 + .1, .85], [zr - .4, .97], [zr, 1.03], [zr + .5, .97], [zr + .95, .86], [zf - .65, .83], [zf - .25, .92], [zf, .95], [zf + .35, .89], [Z1 - .14, .62], [Z1, .49]]);
  const deck = curve([[Z0, .76], [Z0 + .08, .9], [Z0 + .4, .9], [zr, .92], [zr + .9, .92], [zf - 1.0, .88], [zf - .5, .79], [zf, .72], [zf + .4, .65], [Z1 - .12, .55], [Z1, .48]]);
  const sillBase = curve([[Z0, .3], [Z0 + .3, .24], [0, .2], [Z1 - .3, .22], [Z1, .28]]);
  const arch = z => {
    let y = -1;
    for (const zc of [zf, zr]) { const d = z - zc; if (Math.abs(d) < R) y = Math.max(y, wy + Math.sqrt(R * R - d * d) * .98); }
    return y;
  };
  const sill = z => Math.max(sillBase(z), arch(z));
  const FLOOR = .16, IN = wx - .2;                            // underfloor height, inner wheel-well wall

  // Rows along z: dense through the arches.
  const zs = [];
  for (let z = Z0; z <= Z1 + 1e-6; z += DZ) zs.push(Math.min(z, Z1));
  if (zs[zs.length - 1] < Z1) zs.push(Z1);

  /* ---- skin: sill -> bodyside -> shoulder -> deck -> centre, mirrored */
  const ctrl = z => {
    const w = halfW(z), s = sill(z), b = belt(z), d = deck(z);
    const lift = Math.max(0, s - sillBase(z));                // over an arch the side is shorter
    // sill, bodyside bulge, below the shoulder, shoulder, fender crown (over
    // the tyre), bonnet edge, bonnet, centre line.
    return [[w * .965, s], [w, s + .32 * (b - s) + lift * .1], [w * .99, b - .06], [w * .935, b], [w * .8, b - .025], [w * .6, Math.min(d - .01, b - .06)], [w * .32, d + .01], [0, d + .02]];
  };
  const skinRow = z => {
    const half = spline(ctrl(z), PER);
    return [...half.map(([x, y]) => [x, y, z]), ...half.slice(0, -1).reverse().map(([x, y]) => [-x, y, z])];
  };
  // A point on the skin: z along the car, t 0 (sill) .. 1 (centre line), side +-1.
  // Details (lamps, vents, intakes) are moulded onto the body through this.
  const cache = new Map();
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
    if (n[0] * p[0] + n[1] * (p[1] - .45) < 0) n = n.map(q => -q);   // outward
    return n;
  };
  /** A patch moulded on the skin, `lift` metres proud of it. tA/tB may vary with z. */
  const patch = (z0, z1, tA, tB, lift, side, nz = 10, nt = 6) => {
    nz = Math.max(1, Math.round(nz * PQ)); nt = Math.max(1, Math.round(nt * PQ));
    const pos = [], idx = [];
    for (let i = 0; i <= nz; i++) for (let j = 0; j <= nt; j++) {
      const z = z0 + (z1 - z0) * i / nz, a = typeof tA === 'function' ? tA(z) : tA, b = typeof tB === 'function' ? tB(z) : tB;
      const t = a + (b - a) * j / nt, p = skinPoint(z, t, side), n = skinNormal(z, t, side);
      pos.push(p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift);
    }
    for (let i = 0; i < nz; i++) for (let j = 0; j < nt; j++) {
      const a = i * (nt + 1) + j, b = a + 1, c = a + nt + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    // Face outward whichever way the grid happened to wind.
    const nn = g.attributes.normal, P = skinNormal((z0 + z1) / 2, ((typeof tA === 'function' ? tA(z0) : tA) + (typeof tB === 'function' ? tB(z0) : tB)) / 2, side);
    const k = Math.floor(nn.count / 2);
    if (nn.getX(k) * P[0] + nn.getY(k) * P[1] + nn.getZ(k) * P[2] < 0) { for (let q = 0; q < idx.length; q += 3) [idx[q + 1], idx[q + 2]] = [idx[q + 2], idx[q + 1]]; g.setIndex(idx); g.computeVertexNormals(); }
    return g;
  };
  const skinRows = zs.map(skinRow);
  const skin = gridGeometry(skinRows);

  /* ---- underbody and wheel wells (dark): sill edge -> inner wall -> floor */
  const underRows = zs.map(z => {
    // The well's roof slopes down inboard so it stays under the bonnet.
    const w = halfW(z) * .965, s = sill(z), si = Math.min(s, deck(z) + .03);
    return [[w, s, z], [IN, si, z], [IN, FLOOR, z], [-IN, FLOOR, z], [-IN, si, z], [-w, s, z]];
  });
  const under = gridGeometry(underRows);

  /* ---- greenhouse: glass with a body-coloured roof and C-pillars */
  const GZ0 = zr + .15, GZ1 = zf - .62;                      // rear deck line .. windshield base
  const roof = curve([[GZ0, deck(GZ0) + .005], [GZ0 + .45, 1.06], [GZ0 + .95, 1.17], [-.3, 1.205], [.1, 1.19], [GZ1 - .4, 1.03], [GZ1, deck(GZ1) + .005]]);
  const gw = z => halfW(z) * .84, rw = z => halfW(z) * .64;
  const gzs = []; for (let z = GZ0; z <= GZ1 + 1e-6; z += GDZ) gzs.push(Math.min(z, GZ1));
  const gRows = gzs.map(z => {
    const base = Math.min(belt(z), deck(z) + .02), top = Math.max(base + .002, roof(z)), w0 = gw(z), w1 = rw(z);
    const half = [[w0, base], [w0 * .96 + w1 * .04, base + (top - base) * .55], [w1 + .03, top - .04], [w1 * .7, top - .005], [0, top + .01]];
    return [...half.map(([x, y]) => [x, y, z]), ...half.slice(0, -1).reverse().map(([x, y]) => [-x, y, z])];
  });
  const cols = gRows[0].length;
  const glassOf = (i, j) => {
    const z = (gzs[i] + gzs[i + 1]) / 2, side = j < 2 || j >= cols - 3, top = !side;
    if (top) return z > -.55 && z < .2 ? 0 : 1;              // roof panel paint; windshield and backlight glass
    return z > zr + .55 && z < GZ1 - .12 ? 1 : 0;             // side glass; C-pillar and A-pillar root paint
  };
  const green = gridGeometry(gRows, {groupOf: glassOf});

  /* ---- materials */
  // Paint: metallic base under a clear coat, with the panel shut lines drawn
  // in (doors, front bonnet, engine cover), which is most of what makes a
  // body read as a car rather than a moulding.
  const paintMat = new T.MeshPhysicalNodeMaterial({color: paint, metalness: .6, roughness: .32, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1.25});
  {
    const P = positionLocal, ax = abs(P.x), line = (v, at, w = .0045) => float(1).sub(smoothstep(0, w, abs(v.sub(at))));
    const side = step(.62, ax).mul(step(P.y, belt(0) - .03)).mul(step(sillBase(0) + .06, P.y));
    const doorF = zf - .62, doorR = zr + .5;
    const door = line(P.z, doorF).add(line(P.z, doorR)).mul(side).mul(step(P.z, doorF + .01)).mul(step(doorR - .01, P.z))
      .add(line(P.z, doorF).add(line(P.z, doorR)).mul(side))
      .add(line(P.y, sillBase(0) + .07).mul(step(.62, ax)).mul(step(P.z, doorF)).mul(step(doorR, P.z)));
    const top = step(deck(zf) - .06, P.y);
    const bonnet = line(P.z, zf - .42).mul(top).mul(step(ax, .66)).add(line(ax, .66).mul(top).mul(step(zf - .42, P.z)));
    const engine = line(P.z, zr + .18).mul(top).mul(step(ax, .58)).add(line(ax, .58).mul(top).mul(step(P.z, zr + .18)).mul(step(Z0 + .25, P.z)));
    paintMat.colorNode = materialColor.mul(float(1).sub(door.add(bonnet).add(engine).min(1).mul(.88)));
  }
  const glass = new T.MeshPhysicalMaterial({color: '#0b1216', metalness: .2, roughness: .04, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 1.6});
  const black = new T.MeshStandardMaterial({color: '#0a0b0c', roughness: .55, metalness: .2, side: T.DoubleSide});
  const carbon = new T.MeshStandardMaterial({color: '#121416', roughness: .35, metalness: .5});
  const chrome = new T.MeshStandardMaterial({color: '#c9ccd0', roughness: .15, metalness: 1});
  const head = new T.MeshStandardMaterial({color: '#dfe9f5', emissive: '#e8f2ff', emissiveIntensity: .6, roughness: .2, toneMapped: false});
  const tail = new T.MeshStandardMaterial({color: '#5a0508', emissive: '#ff1a1f', emissiveIntensity: .45, roughness: .3, toneMapped: false});
  tail.name = 'Brake LED'; head.name = 'Headlight LED';

  const group = new T.Group(), add = (g, m) => { const mesh = new T.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh; };
  add(skin, paintMat);
  add(under, black).castShadow = false;
  add(green, [paintMat, glass]);
  // End caps: the nose and tail faces behind the lights and intakes.
  add(capGeometry(skinRows[skinRows.length - 1], [0, 0, 1]), paintMat);
  add(capGeometry(skinRows[0], [0, 0, -1]), paintMat);
  // ...and the underbody's ends, or the hollow under the tail shows as a dark wedge.
  add(capGeometry(underRows[0], [0, 0, -1]), black).castShadow = false;
  add(capGeometry(underRows[underRows.length - 1], [0, 0, 1]), black).castShadow = false;

  /* ---- details, moulded on the skin */
  const lens = new T.MeshPhysicalMaterial({color: '#0d1114', metalness: .1, roughness: .03, clearcoat: 1, clearcoatRoughness: .02, envMapIntensity: 2});
  const redLens = new T.MeshPhysicalMaterial({color: '#2a0205', metalness: .1, roughness: .05, clearcoat: 1, envMapIntensity: 1.6});
  const vent = new T.MeshStandardNodeMaterial({color: '#0b0c0d', roughness: .6, metalness: .3});
  // Vents and grilles: slats / honeycomb in the shader, not geometry.
  vent.colorNode = vec3(.035, .037, .04).mul(fract(uv().x.mul(40)).sub(.5).abs().mul(2).mul(.5).add(.55));
  const honey = new T.MeshStandardNodeMaterial({roughness: .5, metalness: .4});
  {
    const q = uv().mul(vec3(60, 22, 1).xy), row = q.y.floor(), hx = fract(q.x.add(row.mod(2).mul(.5))).sub(.5).abs(), hy = fract(q.y).sub(.5).abs();
    honey.colorNode = mix(vec3(.02, .02, .022), vec3(.11, .115, .12), step(.36, hx).max(step(.4, hy)));
  }
  const box = (m, x, y, z, sx, sy, sz, ry = 0) => { const b = add(new T.BoxGeometry(sx, sy, sz), m); b.position.set(x, y, z); b.rotation.y = ry; return b; };
  for (const s of [-1, 1]) {
    // Headlamps: a swept smoked lens between the wing top and the bonnet edge,
    // an L of LED daytime light along its top and front, two projector eyes.
    const hz0 = Z1 - .5, hz1 = Z1 - .03, span = hz1 - hz0;
    const tA = z => .46 + (z - hz0) / span * .02, tB = z => .7 - (z - hz0) / span * .07;
    add(patch(hz0, hz1, tA, tB, .006, s, 14, 6), lens);
    add(patch(hz0 + .06, hz1, z => tB(z) - .018, tB, .011, s, 14, 2), head);                       // upper blade
    add(patch(hz1 - .07, hz1 - .02, tA, tB, .011, s, 3, 5), head);                                 // front drop
    if (!coarse) for (const k of [.35, .62]) {
      const z = hz0 + span * k, t = (tA(z) + tB(z)) / 2 + .004, p = skinPoint(z, t, s), n = skinNormal(z, t, s);
      const eye = add(new T.SphereGeometry(.034, 18, 10), head); eye.scale.set(1, 1, .45);
      eye.position.set(p[0] + n[0] * .008, p[1] + n[1] * .008, p[2] + n[2] * .008); eye.lookAt(eye.position.x + n[0], eye.position.y + n[1], eye.position.z + n[2]);
      const ring = add(new T.TorusGeometry(.036, .006, 8, 24), chrome);
      ring.position.copy(eye.position); ring.lookAt(eye.position.x + n[0], eye.position.y + n[1], eye.position.z + n[2]);
    }
    // Tail lamps wrapping the rear corners.
    add(patch(Z0 + .01, Z0 + .26, z => .44 + (z - Z0) * .05, z => .56 - (z - Z0) * .06, .007, s, 8, 4), redLens);
    add(patch(Z0 + .015, Z0 + .22, z => .5 - (z - Z0) * .02, z => .525 - (z - Z0) * .04, .01, s, 8, 2), tail);
    // Bonnet vents, side intakes ahead of the rear wheels, a carbon sill blade.
    add(patch(zf - .3, zf + .16, .74, .86, .003, s, 8, 4), vent);
    add(patch(zr + .52, zr + 1.0, z => .22 + (z - zr - .52) * .08, z => .37 - (zr + 1.0 - z) * .1, .004, s, 10, 5), vent);
    add(patch(zr + .5, zr + 1.02, .37, .395, .007, s, 10, 1), carbon);                        // intake lip
    add(patch(zf - R - .08, zr + R + .08, 0, .05, .006, s, 16, 1), carbon);                   // sill blade
    // Mirrors: a teardrop pod on a slim black stalk from the door top.
    const mz = GZ1 - .28, base = skinPoint(mz, .43, s), pod = [base[0] + s * .19, base[1] + .13, mz - .02];
    const stalk = add(new T.CylinderGeometry(.012, .016, .2, 8), carbon);
    stalk.position.set((base[0] + pod[0]) / 2, (base[1] + pod[1]) / 2 - .02, mz); stalk.rotation.z = s * 1.05;
    const cap = add(new T.SphereGeometry(.085, 20, 12), paintMat); cap.scale.set(1.2, .62, 1.25); cap.position.set(...pod);
    const glassM = add(new T.CircleGeometry(.07, 18), chrome); glassM.scale.set(1.15, .58, 1); glassM.position.set(pod[0], pod[1], pod[2] - .1); glassM.rotation.y = Math.PI;
    // Front corner intakes.
    const ci = add(new T.PlaneGeometry(.26, .13), honey); ci.position.set(s * .56, .33, Z1 + .004);
  }
  // Nose: a wide honeycomb mouth in a carbon surround and a splitter blade.
  const mouth = add(new T.PlaneGeometry(.78, .15), honey); mouth.position.set(0, .34, Z1 + .005);
  box(carbon, 0, .425, Z1 - .01, .82, .018, .04);
  box(carbon, 0, .2, Z1 - .03, 1.5, .02, .16);
  // Tail: a slim full-width light bar under the ducktail, a diffuser with
  // strakes and four exhausts, the lip spoiler.
  const ty = belt(Z0 + .06) - .03;
  box(tail, 0, ty, Z0 - .002, halfW(Z0 + .05) * 1.55, .018, .01);
  box(carbon, 0, .26, Z0 + .07, 1.46, .16, .16);
  for (let k = -3; k <= 3; k++) if (k) box(carbon, k * .2, .25, Z0 + .1, .016, .1, .3);
  for (const x of [-.42, -.3, .3, .42]) {
    const ex = add(new T.CylinderGeometry(.042, .046, .12, 18, 1, true), chrome); ex.rotation.x = Math.PI / 2; ex.position.set(x, .33, Z0 - .03);
    const inner = add(new T.CircleGeometry(.038, 18), black); inner.position.set(x, .33, Z0 - .02); inner.rotation.y = Math.PI;
  }
  box(carbon, 0, deck(Z0 + .15) + .025, Z0 + .12, halfW(Z0 + .15) * 1.7, .022, .16);

  // Dimensions for the interior and effects (world/carFx.js).
  const dims = {Z0, Z1, GZ0, GZ1, zf, zr, wx, wy, roof, halfW, deck, belt, exhausts: [-.42, -.3, .3, .42].map(x => [x, .33, Z0 - .09])};
  return {group, paint: paintMat, tail, head, dims};
}
