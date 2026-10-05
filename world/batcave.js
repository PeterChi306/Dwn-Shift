/* (2026-10-04) Nothing here is on any map, any menu or any sign.
 *
 * In the basement garage's far wall, one panel between the lit fins is a
 * door. Stand right in front of it and the wall asks for a password. The
 * right one slides the panel back and away, and behind it a lift platform
 * waits in a narrow shaft. It drops 28 m, past rings of red light, out of
 * the rock ceiling of a cave: a waterfall out of a cleft in the west wall
 * into a black pool, stalactites, bats circling under the roof, a steel deck
 * with a black car turning on a plinth, a suit in a glass case, and the
 * computer, seven screens wide, between racks of blinking servers.
 *
 * (2026-10-04, pass 2, Peter: "improve the look ... the rocks, the waterfall
 * ... remove the bat logo ... the display that the car is spinning on, there's
 * nothing below it ... when you arrive at the ground floor there's a black
 * thing ... if you fall behind that thing you'll get stuck ... when you exit
 * that door, the door will close automatically".)
 *   - The rock is one smooth, detailed shell (layered noise, strata, flowstone,
 *     wet where the water runs), lit in its own shader by the cave's lamps,
 *     the waterfall and the screens; real stalactites, stalagmites and
 *     boulders all round the foot of the walls; rubble rising into the walls.
 *   - The waterfall falls in a curve out of a cleft, streaked and foaming,
 *     into a rock-rimmed pool with mist rising off it.
 *   - The walls you cannot walk through are invisible now, and they go
 *     round the lift: the shaft stands in an alcove of solid rock, so there
 *     is nothing to get behind. (The old ring of black walls ran right
 *     through the back half of the lift.)
 *   - The car stands on a stepped plinth (it was floating half a metre up).
 *   - The door shuts behind you as soon as you walk out into the garage,
 *     and the password is asked again.
 *
 * Frame coordinates as basement.js (the mansion's lot frame); the cave is a
 * closed, inside-out rock shell, so nothing of the world above shows through.
 */
import * as T from 'three';
import {uv, vec3, float, sin, sqrt, pow, cameraPosition, texture, smoothstep, time, mix, max, clamp, dot, length, normalize, abs, attribute, positionWorld, normalWorld, mx_noise_float, mx_noise_vec3, instancedDynamicBufferAttribute, uniform} from 'three/tsl';
import {mergeGeometries, mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {Kit} from './kit.js';

const KEY = 2088091347;                    // the word itself is not kept here
const sum = t => { let h = 5381; for (const c of t) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h; };
export const CAVE = {cu: 26, cv: -9, ru: 16, rv: 17, ry: 8, cy: -30.5, floor: -34};
export const SECRET = {u: 30.5, hw: .8, h: 2.6};                 // the door, in the hall's far wall (v = hall.v0)
const SHAFT = {u: 30.5, v: -22.1, hw: 1, front: -21, back: -23.2};
const VEST = {u0: 29.3, u1: 33.5, v0: -21, v1: -20.2};
const RIDE = 9;
const RING = .86;                                                  // the invisible wall, as a share of the radii
const POOL = {u: 14.9, v: -9, ru: 2.7, rv: 3.8};                   // the waterfall's pool
const WINGS = [[26.9, 29.2], [31.8, 34.1]];                        // the rock either side of the shaft (u ranges), v from the front back

const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---- value noise, for the rock's shape (the shader adds the fine detail) */
const hash3 = (i, j, k) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1274126177); h = Math.imul(h ^ h >>> 13, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967295 * 2 - 1; };
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf), L = (a, b, t) => a + (b - a) * t, c = (a, b, d) => hash3(xi + a, yi + b, zi + d);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
const fbm = (x, y, z, o = 4) => { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += vnoise(x * f, y * f, z * f) * a; f *= 2.03; a *= .5; } return s; };

/** How far the rock stands out from (or is carved back into) the ellipsoid, at a point of it (centre-relative, m). */
function wallDisp(x, y, z) {
  const ny = y / CAVE.ry, wall = 1 - Math.abs(ny);
  let d = fbm(x * .14 + 3, y * .2, z * .14, 3) * 1.7 + fbm(x * .45, y * .45 + 9, z * .45, 3) * .6 + fbm(x * 1.3 + 5, y * 1.3, z * 1.3, 2) * .16;
  d += Math.sin(y * 2.7 + fbm(x * .3, y * .3, z * .3, 2) * 4) * .13 * wall;                     // strata
  const u = x + CAVE.cu, v = z + CAVE.cv;
  d += Math.exp(-(((v - POOL.v) / 2.4) ** 2)) * sm(CAVE.cu - 9, CAVE.cu - 12, u) * sm(-4, -1.5, y) * 1.3;   // the waterfall's cleft
  // Down at the floor the rock never comes in past the walk ring.
  return Math.max(d, -.3 - sm(-2.3, -.4, y) * 3);
}
/** < 0 inside the cave (frame u, height, v). */
function surf(u, y, v) {
  const x = u - CAVE.cu, yy = y - CAVE.cy, z = v - CAVE.cv, m = Math.hypot(x / CAVE.ru, yy / CAVE.ry, z / CAVE.rv) || 1e-6;
  const ex = x / m, ey = yy / m, ez = z / m;
  return m - (1 + wallDisp(ex, ey, ez) / Math.hypot(ex, ey, ez));
}
/** The underside of the rock over (u, v). */
const roofAt = (u, v) => { let lo = CAVE.floor + .5, hi = CAVE.cy + CAVE.ry + 5; for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (surf(u, m, v) < 0) lo = m; else hi = m; } return lo; };
/** The west wall's face at (v, y). */
const westWall = (v, y) => { let lo = CAVE.cu - CAVE.ru - 6, hi = CAVE.cu; for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (surf(m, y, v) < 0) hi = m; else lo = m; } return hi; };

/* ---- rock pieces, in the frame (x = u, y up, z = v); each with a `shade` (cheap occlusion) */
const finish = (g, shade) => { g.setAttribute('shade', new T.Float32BufferAttribute(shade, 1)); g.computeVertexNormals(); return g; };
const flip = g => { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } };
function shellGeo() {
  let g = new T.SphereGeometry(1, 160, 90); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  const p = g.attributes.position, shade = [];
  for (let i = 0; i < p.count; i++) {
    const ex = p.getX(i) * CAVE.ru, ey = p.getY(i) * CAVE.ry, ez = p.getZ(i) * CAVE.rv, d = wallDisp(ex, ey, ez), k = 1 + d / Math.hypot(ex, ey, ez);
    p.setXYZ(i, CAVE.cu + ex * k, CAVE.cy + ey * k, CAVE.cv + ez * k);
    shade.push(Math.min(1.05, Math.max(.32, .86 - d * .26)));
  }
  flip(g); return finish(g, shade);
}
/** A dripstone: a tapering, wavering cone hanging from y = 0 (or standing, `up`). */
function spike(len, r, R, up = false) {
  const seg = 9, rings = 8, pos = [], shade = [], idx = [], bx = (R() - .5) * .14 * len, bz = (R() - .5) * .14 * len, ph = R() * 6;
  for (let i = 0; i < rings; i++) {
    const t = i / rings, rad = r * Math.pow(1 - t, 1.25) * (1 + .2 * Math.sin(t * 11 + ph));
    for (let j = 0; j < seg; j++) { const a = j / seg * Math.PI * 2, jr = rad * (.82 + R() * .36); pos.push(bx * t * t + Math.cos(a) * jr, -t * len - .25 * r, bz * t * t + Math.sin(a) * jr); shade.push(.38 + t * .32); }
  }
  pos.push(bx, -len, bz); shade.push(.72);
  const tip = rings * seg;
  for (let i = 0; i < rings - 1; i++) for (let j = 0; j < seg; j++) { const a = i * seg + j, b = i * seg + (j + 1) % seg, c = a + seg, d = b + seg; idx.push(a, b, c, b, d, c); }
  for (let j = 0; j < seg; j++) idx.push((rings - 1) * seg + j, (rings - 1) * seg + (j + 1) % seg, tip);
  // Hanging: the top ring sits up in the rock.
  for (let j = 0; j < seg; j++) pos[j * 3 + 1] = .35 * r + .15;
  if (up) for (let i = 1; i < pos.length; i += 3) pos[i] = -pos[i];
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  finish(g, shade);
  const n = g.attributes.normal; if (n.getX(seg) * pos[seg * 3] + n.getZ(seg) * pos[seg * 3 + 2] < 0) { flip(g); g.computeVertexNormals(); }
  return g;
}
const ICO = (() => { let g = new T.IcosahedronGeometry(1, 3); g.deleteAttribute('uv'); g.deleteAttribute('normal'); return mergeVertices(g); })();
/** A fractured stone: lumpy, cut by a few flat faces (and by `cut` = [nx, ny, nz, offset] if given), faceted, darker underneath. */
function boulder(sx, sy, sz, R, amp = .2, cut = null) {
  const g = ICO.clone(), p = g.attributes.position, o = R() * 100, shade = [], planes = [];
  for (let k = 0; k < 4; k++) { const a = R() * Math.PI * 2, b = (R() - .3) * 1.4, n = [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)]; planes.push([...n, .55 + R() * .3]); }
  if (cut) planes.push(cut);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = 1 + fbm(x * 1.5 + o, y * 1.5, z * 1.5, 3) * amp * 2 + vnoise(x * 5 + o, y * 5, z * 5) * amp * .35;
    x *= d; y *= d; z *= d;
    for (const [nx, ny, nz, off] of planes) { const e = x * nx + y * ny + z * nz - off; if (e > 0) { x -= nx * e; y -= ny * e; z -= nz * e; } }
    p.setXYZ(i, x * sx, Math.max(y, -.8) * sy, z * sz); shade.push(.4 + .6 * sm(-.9, .55, y));
  }
  g.setAttribute('shade', new T.Float32BufferAttribute(shade, 1));
  const f = g.toNonIndexed(); f.computeVertexNormals(); return f;              // faceted: a broken stone, not a pebble
}
/** The floor: flat where you walk, rubble rising into the walls, a basin under the pool. */
function floorGeo() {
  const g = new T.PlaneGeometry(40, 42, 110, 116).rotateX(-Math.PI / 2); g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const p = g.attributes.position, shade = [];
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + CAVE.cu, v = p.getZ(i) + CAVE.cv, rr = Math.hypot((u - CAVE.cu) / CAVE.ru, (v - CAVE.cv) / CAVE.rv) / .9;
    const n = fbm(u * .7, 0, v * .7, 3), shaftK = sm(2.2, 3.8, Math.hypot(u - SHAFT.u, v - SHAFT.v));
    const rise = sm(.95, 1.12, rr) * (1.1 + n * 1.2) * shaftK, e = Math.hypot((u - POOL.u) / POOL.ru, (v - POOL.v) / POOL.rv), basin = sm(1.05, .55, e) * .55;
    p.setXYZ(i, u, CAVE.floor - .035 + Math.min(0, n * .05) + rise - basin, v);
    shade.push((.82 + n * .2) * (1 - basin * .8) * (1 - sm(1, 1.15, rr) * .35));
  }
  return finish(g, shade);
}

/* The rock's photo texture: Poly Haven "Cliff Side" (CC0), its colour and normal maps, laid on in
 * world space from three sides (no UVs needed on any piece) at two scales so it never visibly repeats. */
let ROCK_TEX = null;
const rockTex = () => ROCK_TEX ||= (() => {
  const L = new T.TextureLoader(), get = (f, srgb) => { const t = L.load('assets/world/textures/' + f); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = T.SRGBColorSpace; return t; };
  return {diff: get('cliff_side_diff_1k.jpg', true), nor: get('cliff_side_nor_gl_1k.jpg', false)};
})();
const triW = N => { const w = pow(abs(N), vec3(4, 4, 4)); return w.div(w.x.add(w.y).add(w.z)); };
function triColor(tex, P, w, s) { return texture(tex, P.zy.mul(s)).rgb.mul(w.x).add(texture(tex, P.xz.mul(s)).rgb.mul(w.y)).add(texture(tex, P.xy.mul(s)).rgb.mul(w.z)); }
/** Triplanar normal mapping, whiteout-style: each side's tangent normal swizzled into world space. */
function triNormal(tex, P, N, w, s, k) {
  const t = uvp => texture(tex, uvp).rgb.mul(2).sub(1).mul(vec3(k, k, 1));
  const nx = t(P.zy.mul(s)), ny = t(P.xz.mul(s)), nz = t(P.xy.mul(s));
  const ax = vec3(nx.xy.add(N.zy), N.x.mul(abs(nx.z))).zyx, ay = vec3(ny.xy.add(N.xz), N.y.mul(abs(ny.z))).xzy, az = vec3(nz.xy.add(N.xy), N.z.mul(abs(nz.z)));
  return normalize(ax.mul(w.x).add(ay.mul(w.y)).add(az.mul(w.z)));
}

/** The rock's material: a photo texture greyed to wet slate, cracks and strata in its normal map, lit only by the cave's own lamps. */
function rockMaterial(lights, fall, k) {
  const P = positionWorld, shade = attribute('shade', 'float'), {diff, nor} = rockTex();
  const N0 = normalize(normalWorld), w = triW(N0);
  const big = smoothstep(-.35, .35, mx_noise_float(P.mul(.09)));              // which of the two scales shows where
  const raw = mix(triColor(diff, P, w, 1 / 2.6), triColor(diff, P.add(vec3(7.3, 2.1, 4.4)), w, 1 / 7.5), big.mul(.6));
  const lum = dot(raw, vec3(.3, .55, .15));
  let col = mix(vec3(lum, lum, lum), raw, .14).mul(vec3(.86, .93, 1.04)).mul(.62);
  const n1 = mx_noise_float(P.mul(.18)), n2 = mx_noise_float(P.mul(.6));
  col = col.mul(n2.mul(.25).add(1)).mul(sin(P.y.mul(1.9).add(n1.mul(3))).mul(.08).add(.96));
  // Flowstone: pale streaks down the steep faces; a cold mineral tint in the hollows.
  const steep = float(1).sub(abs(N0.y));
  const flow = smoothstep(.3, .7, mx_noise_float(P.mul(vec3(1.5, .16, 1.5)).add(vec3(0, 0, 7)))).mul(steep);
  col = mix(col, col.mul(vec3(1.5, 1.42, 1.3)), flow.mul(.45));
  col = mix(col, col.mul(vec3(.75, .95, 1.05)), smoothstep(.3, .7, n1).mul(.4));
  col = col.mul(shade);
  // Wet: the waterfall's face and its splash, and puddles on the floor.
  const toFall = length(P.sub(fall).mul(vec3(1, .22, 1)));
  const puddle = smoothstep(.42, .55, mx_noise_float(P.mul(.45).add(vec3(3, 0, 1)))).mul(smoothstep(.85, .97, N0.y));
  const wet = max(smoothstep(4.6, 1.6, toFall), puddle);
  col = col.mul(float(1).sub(wet.mul(.45)));
  const N = normalize(triNormal(nor, P, N0, w, 1 / 2.6, float(1.4).sub(wet.mul(.9))).add(mx_noise_vec3(P.mul(.9)).mul(.12)));
  const V = normalize(cameraPosition.sub(P));
  let L = vec3(.014, .016, .02), S = vec3(0, 0, 0);
  for (const l of lights) {
    const d = vec3(l.p.x, l.p.y, l.p.z).sub(P), dist = length(d), ld = d.div(dist);
    const ndl = max(dot(N, ld), 0).mul(.92).add(.02);
    const att = float(l.i).div(dist.mul(dist).mul(1 / (l.r * l.r * .08)).add(1)).mul(smoothstep(l.r, l.r * .35, dist));
    const c = vec3(l.c.r, l.c.g, l.c.b).mul(att);
    L = L.add(c.mul(ndl));
    if (l.spec) S = S.add(c.mul(pow(max(dot(normalize(ld.add(V)), N), 0), 40)));          // a glint off wet rock (from the lamps near water)
  }
  // Lit only by the cave's own lamps: none of the sky's colour reaches down here.
  const m = new T.MeshBasicNodeMaterial();
  m.colorNode = col.mul(L).mul(k).add(S.mul(wet.mul(.5).add(.05)).mul(k));
  return m;
}

/** Builds the vestibule, the shaft and the cave; returns the runtime (Basement owns it). */
export function buildBatcave(F, places, B) {
  const kit = F.kit, FL = B.floor, FC = CAVE.floor, R = rng(9161);
  const STEEL = '#1d1f23', RED = '#ff2d2d', BLUE = '#3fa9ff';
  kit.indoor = 1;
  /* ---- the vestibule behind the door, and the shaft */
  F.rect('gloss', VEST.u0, VEST.v0, VEST.u1, VEST.v1, FL - .4, FL, '#101114', true);
  F.rect('paint', VEST.u0 - .2, VEST.v0, VEST.u0, VEST.v1, FL, FL + 3.2, STEEL, true);
  F.rect('paint', VEST.u1, VEST.v0, VEST.u1 + .2, VEST.v1, FL, FL + 3.2, STEEL, true);
  F.rect('paint', SHAFT.u + SHAFT.hw + .1, VEST.v0 - .2, VEST.u1 + .2, VEST.v0, FL, FL + 3.2, STEEL, true);
  F.rect('paint', VEST.u0 - .2, VEST.v0 - .2, SHAFT.u - SHAFT.hw - .1, VEST.v0, FL, FL + 3.2, STEEL, true);
  F.rect('paint', VEST.u0 - .2, SHAFT.back - .2, VEST.u1 + .2, VEST.v1, FL + 3.2, FL + 3.5, STEEL);
  F.rect('glow', VEST.u0 + .1, VEST.v0 + .05, VEST.u1 - .1, VEST.v0 + .08, FL + 3.05, FL + 3.12, RED);
  kit.indoor = 0;
  // The shaft: closed steel down to below the cave's roof, an open cage in the cave.
  const top = roofAt(SHAFT.u, SHAFT.v) - .8, su0 = SHAFT.u - SHAFT.hw - .1, su1 = SHAFT.u + SHAFT.hw + .1;
  F.rect('paint', su0 - .2, SHAFT.back, su0, SHAFT.front, top, FL + 3.2, STEEL, true);
  F.rect('paint', su1, SHAFT.back, su1 + .2, SHAFT.front, top, FL + 3.2, STEEL, true);
  F.rect('paint', su0 - .2, SHAFT.back - .2, su1 + .2, SHAFT.back, top, FL + 3.2, STEEL, true);
  F.rect('paint', su0 - .2, SHAFT.front - .2, su1 + .2, SHAFT.front, top, FL - .05, STEEL, true);
  for (let y = FL - 1.5; y > top; y -= 2.6) for (const [a, b, c, d] of [[su0, SHAFT.back + .05, su0 + .03, SHAFT.front - .05], [su1 - .03, SHAFT.back + .05, su1, SHAFT.front - .05], [su0, SHAFT.back, su1, SHAFT.back + .03], [su0, SHAFT.front - .03, su1, SHAFT.front]]) F.rect('glow', a, b, c, d, y, y + .06, RED);
  for (const [u, v] of [[su0, SHAFT.back], [su1, SHAFT.back], [su0, SHAFT.front], [su1, SHAFT.front]]) F.rect('metal', u - .1, v - .1, u + .1, v + .1, FC, top + .2, '#3a3d42');
  for (let y = FC + 2.4; y < top; y += 2.4) { F.rect('metal', su0 - .08, SHAFT.back - .08, su1 + .08, SHAFT.back + .02, y, y + .08, '#3a3d42'); for (const u of [su0, su1]) F.rect('metal', u - .05, SHAFT.back, u + .05, SHAFT.front, y, y + .08, '#3a3d42'); }
  // A steel back to the cage, floor to roof, with two lines of red light.
  F.rect('paint', su0 - .2, SHAFT.back - .45, su1 + .2, SHAFT.back - .25, FC, top, '#18191c');
  for (const u of [su0 + .35, su1 - .35]) F.rect('glow', u - .03, SHAFT.back - .26, u + .03, SHAFT.back - .24, FC + .2, top - .2, RED);
  // The landing: a steel threshold with a red edge, a header over the opening.
  F.rect('metal', su0 - .3, SHAFT.front, su1 + .3, SHAFT.front + .7, FC - .1, FC + .02, '#2a2c30', true);
  F.rect('glow', su0 - .3, SHAFT.front + .68, su1 + .3, SHAFT.front + .72, FC, FC + .03, RED);
  F.rect('metal', su0 - .3, SHAFT.front - .15, su1 + .3, SHAFT.front + .15, FC + 3.1, FC + 3.45, '#26282c');
  F.rect('glow', su0 - .1, SHAFT.front + .15, su1 + .1, SHAFT.front + .17, FC + 3.2, FC + 3.3, RED);
  // The cage is solid on three sides (the front has a gate when the platform is up).
  F.solid(su0 - .05, (FC + top) / 2, (SHAFT.back + SHAFT.front) / 2, .1, top - FC, SHAFT.front - SHAFT.back);
  F.solid(su1 + .05, (FC + top) / 2, (SHAFT.back + SHAFT.front) / 2, .1, top - FC, SHAFT.front - SHAFT.back);
  F.solid(SHAFT.u, (FC + top) / 2, SHAFT.back - .05, su1 - su0, top - FC, .1);

  /* ---- the rock: shell, floor, dripstones, boulders, all one mesh */
  const parts = [shellGeo(), floorGeo()], stones = [], put = (g, u, y, v, yaw = 0) => { g.rotateY(yaw); g.translate(u, y, v); (g.index ? parts : stones).push(g); };
  const rad = (u, v) => Math.hypot((u - CAVE.cu) / CAVE.ru, (v - CAVE.cv) / CAVE.rv);
  const byShaft = (u, v, d) => Math.abs(u - SHAFT.u) < d && v < SHAFT.front + d * .5;
  const byFall = (u, v) => Math.abs(v - POOL.v) < 3.2 && u < POOL.u + 1.5;
  const DY = FC + .25, DK = {u0: 17, u1: 31, v0: -16, v1: 3};
  // Stalactites: in clusters, longest where nobody walks under them.
  for (let c = 0; c < 26; c++) {
    const a = R() * Math.PI * 2, dd = Math.sqrt(R()) * .86, cu = CAVE.cu + Math.cos(a) * CAVE.ru * dd, cv = CAVE.cv + Math.sin(a) * CAVE.rv * dd, n = 2 + Math.floor(R() * 7);
    for (let k = 0; k < n; k++) {
      const u = cu + (R() - .5) * 3, v = cv + (R() - .5) * 3; if (rad(u, v) > .93 || byShaft(u, v, 3.2) || byFall(u, v)) continue;
      const roof = roofAt(u, v), walk = rad(u, v) < RING, room = roof - FC - (walk ? 3.2 : .8);
      const len = Math.min(room, .35 + Math.pow(R(), 2.1) * (walk ? 3.6 : 5.5)); if (len < .3) continue;
      put(spike(len, .07 + len * .085 + R() * .08, R), u, roof, v, R() * 6);
    }
  }
  // Stalagmites round the foot of the walls, and four columns where one has met the other.
  for (let k = 0; k < 34; k++) {
    const a = R() * Math.PI * 2, dd = .875 + R() * .07, u = CAVE.cu + Math.cos(a) * CAVE.ru * dd, v = CAVE.cv + Math.sin(a) * CAVE.rv * dd;
    if (byShaft(u, v, 3.6) || byFall(u, v)) continue;
    const h = .5 + Math.pow(R(), 1.6) * 2.4; put(spike(h, .12 + h * .14, R, true), u, FC - .15, v, R() * 6);
  }
  for (const a of [.55, 2.25, 3.95, 5.6]) {
    const u = CAVE.cu + Math.cos(a) * CAVE.ru * .9, v = CAVE.cv + Math.sin(a) * CAVE.rv * .9; if (byShaft(u, v, 3.6) || byFall(u, v)) continue;
    const roof = roofAt(u, v), H = roof - FC;
    put(spike(H * .62, .55, R), u, roof, v); put(spike(H * .5, .7, R, true), u, FC - .1, v);
  }
  // Boulders all round the foot of the walls.
  for (let k = 0; k < 64; k++) {
    const a = k / 64 * Math.PI * 2 + (R() - .5) * .08, dd = .9 + R() * .1, u = CAVE.cu + Math.cos(a) * CAVE.ru * dd, v = CAVE.cv + Math.sin(a) * CAVE.rv * dd;
    if (byShaft(u, v, 3.4) || byFall(u, v)) continue;
    const s = .7 + R() * 1.3; put(boulder(s * (1 + R() * .5), s * (.6 + R() * .4), s * (1 + R() * .5), R), u, FC + s * .15, v, R() * 6);
  }
  // The shaft stands in an alcove: a cliff of solid rock either side of it, floor to roof, cut flat against the steel.
  for (const [w0, w1] of WINGS) {
    const left = w0 < SHAFT.u, cu = left ? w1 - 1.16 : w0 + 1.16, roof = Math.min(roofAt(cu, -22), roofAt(cu, -25)), sy = (roof - FC) / 2 + 1.2;
    put(boulder(1.45, sy, 3.6, R, .1, [left ? 1 : -1, 0, 0, .8]), cu, FC + sy - 1, -24.4, 0);
    for (const v of [-20.6, -21.3]) { const s = .55 + R() * .3; put(boulder(s * 1.2, s, s, R, .2), cu + (left ? -.5 : .5), FC + s * .2, v); }
    F.solid((w0 + w1) / 2, (FC + top) / 2 + 1, (SHAFT.front - 27) / 2, w1 - w0, top - FC + 2, 27 + SHAFT.front);
  }
  // The waterfall comes out of a cleft high on the west wall, over a lip of rock, into a pool.
  const lipY = FC + 7.4, lipU = westWall(POOL.v, lipY) + .45;
  put(boulder(1.6, .7, 2.4, R, .12, [0, 1, 0, .5]), lipU - 1, lipY - .3, POOL.v);
  const impactU = lipU + 1.25 * Math.sqrt(2 * (lipY - FC) / 9.8);
  for (let k = 0; k <= 16; k++) {
    const t = -1.95 + k / 16 * 3.9, u = POOL.u + Math.cos(t) * POOL.ru * 1.12, v = POOL.v + Math.sin(t) * POOL.rv * 1.1, s = .5 + R() * .35;
    put(boulder(s * 1.2, s * .9, s * 1.2, R, .2), u, FC + s * .1, v, R() * 6);
    F.solid(u, FC + .45, v, s * 1.9, .9, s * 1.9);
  }
  F.geo('poolwater', new T.CircleGeometry(1, 48).rotateX(-Math.PI / 2), POOL.u, FC - .07, POOL.v, '#0a2330', {scale: new T.Vector3(POOL.ru * 1.12, 1, POOL.rv * 1.1)});
  const geo = mergeGeometries(parts), geo2 = mergeGeometries(stones);
  // The cave's own lamps (frame u, height, v): uplights round the walls, the pool, the deck, the screens, the lift.
  const lamps = [], light = (u, y, v, c, i, r, spec = false) => lamps.push({u, y, v, c: new T.Color(c), i, r, spec});
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2 + .15, u = CAVE.cu + Math.cos(a) * CAVE.ru * .82, v = CAVE.cv + Math.sin(a) * CAVE.rv * .82;
    if (byShaft(u, v, 3.5) || Math.hypot(u - POOL.u, v - POOL.v) < 5.5) continue;
    light(u + Math.cos(a) * .5, FC + .5, v + Math.sin(a) * .5, '#4f8fff', 1.25, 9);
    F.geo('metal', new T.CylinderGeometry(.13, .18, .24, 12), u, FC + .12, v, '#1b1c1e'); F.cyl('glow', u, v, FC + .24, .1, .02, '#d6e8ff', 12);
  }
  light(impactU + 1.2, FC + .9, POOL.v, '#bfe6ff', 1.9, 11, true); light(lipU + 2.5, lipY - 2.5, POOL.v, '#a9d6ff', 1, 8, true);
  light(22.5, DY + 5.5, -9, '#cfdfff', 1.5, 15, true); light(26, DY + 1.8, 1.4, '#59c3ff', 1.4, 8);
  light(SHAFT.u, FC + 1.6, SHAFT.front + 1, '#ff3434', .6, 4.5); light(37.5, FC + 1.5, -11, '#cfe6ff', .7, 4.5);
  for (const s of [-1, 1]) F.cyl('glow', impactU + 1.4, POOL.v + s * 1.2, FC - .5, .12, .02, '#cfeaff', 12);                // lamps under the water
  // Walls you cannot walk through: a ring just inside the rock, open where the lift's alcove closes it.
  { const N = 48, P = a => [CAVE.cu + Math.cos(a) * CAVE.ru * RING, CAVE.cv + Math.sin(a) * CAVE.rv * RING];
    for (let i = 0; i < N; i++) {
      const [u0, v0] = P(i / N * Math.PI * 2), [u1, v1] = P((i + 1) / N * Math.PI * 2), mu = (u0 + u1) / 2, mv = (v0 + v1) / 2;
      if (Math.abs(mu - SHAFT.u) < 2.4 && mv < SHAFT.front) continue;
      const [x0, z0] = F.w(u0, v0), [x1, z1] = F.w(u1, v1), L = Math.hypot(x1 - x0, z1 - z0);
      kit.colliders.push({x: (x0 + x1) / 2, y: F.y + FC + 4, z: (z0 + z1) / 2, hx: L / 2 + .15, hy: 4, hz: .25, yaw: Math.atan2(-(z1 - z0), x1 - x0), tag: 'stone'});
    } }
  F.solid(CAVE.cu, FC - .25, CAVE.cv, 38, .5, 40);

  /* ---- the deck, the plinth, the computer, the racks, the suit */
  F.rect('gloss', DK.u0, DK.v0, DK.u1, DK.v1, FC - .3, DY, '#17191c', true);
  F.rect('metal', DK.u0 - .04, DK.v0 - .04, DK.u1 + .04, DK.v1 + .04, FC - .3, DY - .06, '#2a2c30');
  for (const [a, b, c, d] of [[DK.u0, DK.v0, DK.u1, DK.v0 + .05], [DK.u0, DK.v1 - .05, DK.u1, DK.v1], [DK.u0, DK.v0, DK.u0 + .05, DK.v1], [DK.u1 - .05, DK.v0, DK.u1, DK.v1]]) F.rect('glow', a, b, c, d, DY, DY + .02, BLUE);
  for (const [a, b, c, d] of [[DK.u0 - .05, DK.v0 - .05, DK.u1 + .05, DK.v0], [DK.u0 - .05, DK.v1, DK.u1 + .05, DK.v1 + .05], [DK.u0 - .05, DK.v0, DK.u0, DK.v1], [DK.u1, DK.v0, DK.u1 + .05, DK.v1]]) F.rect('glow', a, b, c, d, FC + .02, FC + .05, '#2b6fd6');
  for (let u = DK.u0 + 1; u < DK.u1; u += 2) F.rect('line', u - .01, DK.v0, u + .01, DK.v1, DY, DY + .004, '#2a2d33');
  for (let v = DK.v0 + 1; v < DK.v1; v += 2) F.rect('line', DK.u0, v - .01, DK.u1, v + .01, DY, DY + .004, '#24272c');
  const TT = {u: 22.5, v: -9}, PH = .2;
  // The plinth: a steel drum on a lit shadow gap, a black top with a lit ring; the car stands on it.
  F.geo('glow', new T.CylinderGeometry(3.18, 3.18, .04, 64), TT.u, DY + .02, TT.v, '#3f8fff');
  F.geo('metal', new T.CylinderGeometry(3.3, 3.3, .12, 64), TT.u, DY + .1, TT.v, '#2b2e33');
  F.geo('gloss', new T.CylinderGeometry(3.24, 3.3, .04, 64), TT.u, DY + PH - .02, TT.v, '#0b0c0e');
  F.geo('glow', new T.TorusGeometry(3.05, .025, 6, 80), TT.u, DY + PH + .005, TT.v, BLUE, {rx: Math.PI / 2});
  F.geo('line', new T.TorusGeometry(2.2, .01, 4, 64), TT.u, DY + PH + .002, TT.v, '#30343a', {rx: Math.PI / 2});
  for (const turn of [0, Math.PI / 4]) { const [x, z] = F.w(TT.u, TT.v); kit.colliders.push({x, y: F.y + DY + PH / 2, z, hx: 3.05, hy: PH / 2, hz: 3.05, yaw: F.yaw + turn, tag: 'metal'}); }
  F.pool(TT.u, TT.v, DY + PH + .01, 4.4, .8, new T.Color('#bfe0ff'));
  // The computer: a desk, a chair, screens in an arc (the screens are canvases, below).
  const PC = {u: 26, v: 0};
  F.rect('gloss', PC.u - 2.2, PC.v + 1.4, PC.u + 2.2, PC.v + 2.2, DY, DY + .78, '#0c0d0f', true);
  F.rect('glow', PC.u - 2.2, PC.v + 1.38, PC.u + 2.2, PC.v + 1.4, DY + .7, DY + .74, BLUE);
  F.cyl('metal', PC.u, PC.v + .5, DY, .05, .45, '#1b1c1e', 8); F.rect('fabric', PC.u - .3, PC.v + .2, PC.u + .3, PC.v + .8, DY + .45, DY + .55, '#121214', true); F.rect('fabric', PC.u - .3, PC.v + .15, PC.u + .3, PC.v + .25, DY + .55, DY + 1.3, '#121214');
  F.rect('metal', PC.u - 5, PC.v + 3.2, PC.u + 5, PC.v + 3.5, DY, DY + 4.4, '#141518');
  F.rect('glow', PC.u - 5, PC.v + 3.18, PC.u + 5, PC.v + 3.2, DY + 4.3, DY + 4.34, BLUE);
  // Racks either side of the screens, their lights blinking (still, but many).
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
    const u = PC.u + s * (5.9 + k * 1.05), v0 = PC.v + 2.1;
    F.rect('gloss', u - .48, v0, u + .48, v0 + 1, DY, DY + 2.3, '#0d0e11', true);
    F.rect('metal', u - .5, v0 - .02, u + .5, v0, DY + .05, DY + 2.25, '#1f2226');
    for (let row = 0; row < 16; row++) for (let c = 0; c < 6; c++) if (R() < .55) { const cu = u - .38 + c * .15, y = DY + .2 + row * .125; F.rect('glow', cu, v0 - .03, cu + .05, v0 - .02, y, y + .02, R() < .7 ? '#3fa9ff' : R() < .5 ? '#3cff8a' : RED); }
  }
  // The suit, in a lit glass case.
  const SU = {u: 37.5, v: -11};
  F.rect('gloss', SU.u - .8, SU.v - .8, SU.u + .8, SU.v + .8, FC, FC + .3, '#0d0e10', true);
  F.rect('glow', SU.u - .8, SU.v - .82, SU.u + .8, SU.v - .8, FC + .1, FC + .2, BLUE);
  F.rect('glass', SU.u - .75, SU.v - .75, SU.u + .75, SU.v + .75, FC + .3, FC + 2.8, '#9fc4d8', true);
  F.rect('metal', SU.u - .8, SU.v - .8, SU.u + .8, SU.v + .8, FC + 2.8, FC + 2.95, '#1b1c1e');
  F.rect('glow', SU.u - .6, SU.v - .6, SU.u + .6, SU.v + .6, FC + 2.78, FC + 2.8, '#dcecff');
  const suit = '#16171a';
  F.rect('paint', SU.u - .12, SU.v - .2, SU.u + .12, SU.v - .05, FC + .3, FC + 1.25, suit); F.rect('paint', SU.u - .12, SU.v + .05, SU.u + .12, SU.v + .2, FC + .3, FC + 1.25, suit);
  F.rect('paint', SU.u - .16, SU.v - .25, SU.u + .16, SU.v + .25, FC + 1.25, FC + 2, suit);
  F.rect('paint', SU.u - .1, SU.v - .4, SU.u + .1, SU.v - .25, FC + 1.3, FC + 2, suit); F.rect('paint', SU.u - .1, SU.v + .25, SU.u + .1, SU.v + .4, FC + 1.3, FC + 2, suit);
  F.geo('paint', new T.SphereGeometry(.14, 12, 10), SU.u, FC + 2.2, SU.v, suit);
  for (const s of [-1, 1]) F.geo('paint', new T.ConeGeometry(.035, .16, 5), SU.u, FC + 2.38, SU.v + s * .08, suit);
  F.rect('paint', SU.u + .12, SU.v - .45, SU.u + .18, SU.v + .45, FC + .45, FC + 2.02, '#0b0b0d');                       // the cape
  F.pool(SU.u, SU.v, FC + .31, 1.2, .9, new T.Color('#cfe6ff'));
  for (const [u, v] of [[19, -14], [29, -14], [29, -4], [19, 1]]) F.pool(u, v, DY + .01, 3, .35, new T.Color('#a9cfff'));
  return new Batcave({F, B, places, top, PC, TT, DY, plinth: DY + PH, geo, geo2, lamps, fall: {lipU, lipY, v: POOL.v, w: 3.1, impactU}});
}

/* ------------------------------------------------------------------ runtime */
export class Batcave {
  constructor({F, B, places, top, PC, TT, DY, plinth, geo, geo2, lamps, fall}) {
    this.F = F; this.B = B; this.scene = places.scene; this.mats = places.mats; this.PC = PC; this.TT = TT; this.DY = DY; this.plinth = plinth; this.fall = fall;
    this.door = 0; this.doorWant = 0; this.doorT = 0; this.entered = false; this.deep = 0; this.cabY = B.floor; this.stop = 'T'; this.go = null; this.carry = null;
    this.prompt = ''; this.physics = null; this.gates = {}; this.hooks = null; this.makeCar = null; this.car = null; this.audio = null; this.keypadOpen = false;
    this.wall = {v: B.hall.v0};
    // Everything of the cave that is not in the city's kit: shown only from the basement down.
    this.vis = new T.Group(); this.vis.userData.noRain = true; this.scene.add(this.vis);
    this.light = uniform(4.6);
    const fallAt = this.W(fall.impactU - .7, (fall.lipY + CAVE.floor) / 2, fall.v);
    const mat = rockMaterial(lamps.map(l => ({p: this.W(l.u, l.v, l.y), c: l.c, i: l.i, r: l.r, spec: l.spec})), vec3(fallAt.x, fallAt.y, fallAt.z), this.light);
    for (const g of [geo, geo2]) {
      const rock = new T.Mesh(g, mat);
      rock.position.set(F.ox, F.y, F.oz); rock.rotation.y = F.yaw; rock.userData.noRain = true; rock.matrixAutoUpdate = false; rock.updateMatrix();
      this.vis.add(rock);
    }
    this.roofGrid();
    this.buildMoving(); this.buildScreens(); this.buildWaterfall(); this.buildMist(); this.buildBats(); this.animate(0, false);
  }
  W(u, v, y) { const [x, z] = this.F.w(u, v); return new T.Vector3(x, this.F.y + y, z); }
  /** The roof's height on a 1.5 m grid, for the bats (roofAt is too dear to call every frame). */
  roofGrid() {
    const u0 = CAVE.cu - CAVE.ru, v0 = CAVE.cv - CAVE.rv, nu = Math.ceil(CAVE.ru * 2 / 1.5) + 1, nv = Math.ceil(CAVE.rv * 2 / 1.5) + 1, h = new Float32Array(nu * nv);
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) h[j * nu + i] = roofAt(u0 + i * 1.5, v0 + j * 1.5);
    this.roofT = {u0, v0, nu, nv, h};
  }
  roof(u, v) {
    const {u0, v0, nu, nv, h} = this.roofT, fu = Math.max(0, Math.min(nu - 1.001, (u - u0) / 1.5)), fv = Math.max(0, Math.min(nv - 1.001, (v - v0) / 1.5)), i = Math.floor(fu), j = Math.floor(fv), a = fu - i, b = fv - j;
    return (h[j * nu + i] * (1 - a) + h[j * nu + i + 1] * a) * (1 - b) + (h[(j + 1) * nu + i] * (1 - a) + h[(j + 1) * nu + i + 1] * a) * b;
  }
  /** The door panel (with its fins) and the lift platform. */
  buildMoving() {
    const B = this.B, FL = B.floor, dk = new Kit();
    dk.box('paint', 0, 1.3, 0, SECRET.hw * 2, 2.6, .4, 0, '#1b1c20');
    for (const du of [-.75, .4]) { dk.box('wood', du, 1.3, .32, .18, 2.6, .25, 0, '#4a3324'); dk.box('glow', du, 1.4, .46, .04, 2.3, .02, 0, '#ffd7a3'); }
    this.panel = new T.Group(); this.panel.rotation.y = this.F.yaw; dk.build(this.panel, this.mats, {shadows: false}); this.scene.add(this.panel);
    const ck = new Kit();
    ck.box('metal', 0, -.08, 0, 2, .16, 2, 0, '#1b1c1e');
    ck.box('gloss', 0, .002, 0, 1.8, .01, 1.8, 0, '#0e0f11');
    for (const [x, z, sx, sz] of [[0, -1, 2, .04], [-1, 0, .04, 2], [1, 0, .04, 2]]) ck.box('glow', x * .97, .01, z * .97, sx, .02, sz, 0, '#ff2d2d');
    for (const [x0, z0, x1, z1] of [[-.95, -.95, .95, -.95], [-.95, -.95, -.95, .8], [.95, -.95, .95, .8]]) ck.beam('metal', x0, z0, x1, z1, 1.0, .05, .05, '#8d9298');
    for (const [x, z] of [[-.95, -.95], [.95, -.95], [-.95, .8], [.95, .8]]) ck.box('metal', x, .5, z, .05, 1, .05, 0, '#8d9298');
    ck.box('metal', .7, .55, -.7, .18, 1.1, .18, 0, '#26282c'); ck.box('glow', .7, 1.12, -.7, .12, .02, .12, 0, '#ff2d2d');
    this.cab = new T.Group(); this.cab.rotation.y = this.F.yaw; ck.build(this.cab, this.mats, {shadows: false}); this.scene.add(this.cab);
    this.place();
  }
  /** The seven screens: canvases, one redrawn a few times a second. */
  buildScreens() {
    this.screens = [];
    const R = 3.4, c0 = {u: this.PC.u, v: this.PC.v - .4};
    const spec = [[-62, 1.5, .9], [-42, 1.7, 1], [-21, 1.9, 1.1], [0, 3.2, 1.8], [21, 1.9, 1.1], [42, 1.7, 1], [62, 1.5, .9]];
    spec.forEach(([deg, w, h], i) => {
      const a = deg * Math.PI / 180, cv = document.createElement('canvas'); cv.width = Math.round(w * 220); cv.height = Math.round(h * 220);
      const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({map: tex, toneMapped: false}));
      m.position.copy(this.W(c0.u + Math.sin(a) * R, c0.v + Math.cos(a) * R, this.DY + 1.55 + (i === 3 ? .45 : 0)));
      m.rotation.y = this.F.yaw + a + Math.PI; this.vis.add(m);
      const frame = new T.Mesh(new T.BoxGeometry(w + .08, h + .08, .05), new T.MeshStandardMaterial({color: '#0b0c0e', roughness: .4}));
      frame.position.copy(m.position); frame.rotation.y = m.rotation.y; frame.translateZ(-.04); this.vis.add(frame);
      this.screens.push({cv, tex, kind: i, t: Math.random() * 10});
      this.draw(this.screens[i], 0);
    });
    this.drawT = 0;
  }
  draw(S, t) {
    const c = S.cv.getContext('2d'), w = S.cv.width, h = S.cv.height, ac = '#59c3ff', dim = '#1d5f86';
    c.fillStyle = '#02070c'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#0d2b40'; c.lineWidth = 1; for (let x = 0; x < w; x += 22) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y < h; y += 22) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.fillStyle = ac; c.font = '600 18px "Courier New", monospace'; c.textBaseline = 'top';
    const k = S.kind, tt = t + S.t;
    if (k === 3) {
      c.font = '700 54px "Courier New", monospace'; c.textAlign = 'center'; c.fillText('BATCOMPUTER', w / 2, 34);
      c.font = '400 24px "Courier New", monospace'; c.fillStyle = '#9fdcff'; c.fillText('WELCOME BACK', w / 2, 104);
      c.fillStyle = dim; c.fillText('LOS SANTERRA · ALL SYSTEMS NOMINAL', w / 2, 140);
      // the city, traced
      c.save(); c.translate(w / 2, h * .66); c.strokeStyle = ac; c.lineWidth = 1.4; const rr = rng(7);
      for (let i = 0; i < 46; i++) { const x = (rr() - .5) * w * .8, y = (rr() - .5) * h * .4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rr() - .5) * 120, y + (rr() - .5) * 40); c.stroke(); }
      const sw = tt * 1.4; c.strokeStyle = '#ff3b3b'; c.beginPath(); c.arc(Math.sin(sw) * 120, Math.cos(sw * .7) * 30, 10 + (tt * 20 % 18), 0, Math.PI * 2); c.stroke();
      c.restore();
    } else if (k === 0 || k === 6) {
      c.fillText(k ? 'SIGNAL' : 'TELEMETRY', 12, 10); c.strokeStyle = ac; c.lineWidth = 2; c.beginPath();
      for (let x = 0; x < w; x += 3) { const y = h * .55 + Math.sin(x * .05 + tt * 4) * h * .18 * Math.sin(x * .013 + tt) + Math.sin(x * .31 + tt * 9) * 4; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    } else if (k === 1 || k === 5) {
      c.fillText(k === 1 ? 'RADAR' : 'SATELLITE', 12, 10); const cx = w / 2, cy = h * .58, R2 = Math.min(w, h) * .36; c.strokeStyle = dim; for (let i = 1; i <= 3; i++) { c.beginPath(); c.arc(cx, cy, R2 * i / 3, 0, Math.PI * 2); c.stroke(); }
      const a = tt * 1.6; c.strokeStyle = ac; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * R2, cy + Math.sin(a) * R2); c.stroke();
      const rr = rng(k * 31); c.fillStyle = '#ff3b3b'; for (let i = 0; i < 5; i++) { const b = rr() * 6.28, d = rr() * R2; c.globalAlpha = .4 + .6 * Math.max(0, Math.cos(a - b)); c.fillRect(cx + Math.cos(b) * d, cy + Math.sin(b) * d, 4, 4); } c.globalAlpha = 1;
    } else {
      c.fillText(k === 2 ? 'CASE FILES' : 'VEHICLE', 12, 10); c.fillStyle = '#9fdcff'; c.font = '400 14px "Courier New", monospace';
      const lines = k === 2 ? ['> SUBJECT: UNKNOWN', '> LAST SEEN: SUNSET BLVD', '> ALIAS: ???', '> STATUS: AT LARGE', '> CROSS-REF... OK', '> PATTERN MATCH 87%'] : ['ARMOUR ........ 100%', 'FUEL .......... 98%', 'TURBINE ....... READY', 'TYRES ......... 31 PSI', 'STEALTH ....... ON', 'DOORS ......... SEALED'];
      const off = Math.floor(tt * 2) % lines.length; lines.forEach((l, i) => c.fillText(lines[(i + off) % lines.length], 14, 40 + i * 20));
    }
    S.tex.needsUpdate = true;
  }
  /** Water that leaves the lip with some speed and falls in a curve: streaked, white at the lip and the foot, ragged at the edges. */
  buildWaterfall() {
    const f = this.fall, H = f.lipY - (CAVE.floor - .1), rows = 48, cols = 20;
    const sheet = (back, wid, seed, op, du = 0, dv = 0) => {
      const pos = [], uvs = [], idx = [];
      for (let i = 0; i <= rows; i++) {
        const t = i / rows, d = t * H, fw = 1.25 * Math.sqrt(2 * d / 9.8), ww = wid * (1 + .16 * t);
        for (let j = 0; j <= cols; j++) { const s = j / cols, p = this.W(f.lipU - .3 + fw - back + du + Math.sin(s * Math.PI) * .1 * (1 - t), f.v + dv + (s - .5) * ww, f.lipY + .05 - d); pos.push(p.x, p.y, p.z); uvs.push(s, t); }
      }
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); g.setIndex(idx);
      const m = new T.Mesh(g, this.fallMat(seed, op, wid, H)); m.renderOrder = 3; m.userData.noRain = true; this.vis.add(m);
    };
    sheet(.32, f.w * 1.15, 5.3, .5); sheet(0, f.w, 0, 1);
    for (const s of [-1, 1]) sheet(.1, .45, 11 + s, .55, -.2, s * (f.w / 2 + .7));            // trickles either side
    // Foam where it lands, spreading out over the pool.
    const fm = new T.MeshBasicNodeMaterial({transparent: true, depthWrite: false, fog: false});
    const q = uv().sub(.5).mul(2), r = length(q), n = mx_noise_float(vec3(q.mul(4.5), time.mul(.7))).mul(.5).add(.5), rings = sin(r.mul(15).sub(time.mul(4.5))).mul(.5).add(.5);
    fm.colorNode = vec3(.86, .93, .98); fm.opacityNode = smoothstep(1, .12, r).mul(n.mul(.75).add(rings.mul(.3))).mul(.8);
    const foam = new T.Mesh(new T.CircleGeometry(2.4, 40).rotateX(-Math.PI / 2), fm);
    foam.scale.set(1, 1, 1.5); foam.position.copy(this.W(f.impactU + .5, f.v, CAVE.floor - .05)); foam.rotation.y = this.F.yaw; foam.renderOrder = 3; foam.userData.noRain = true; this.vis.add(foam);
  }
  fallMat(seed, op, wid, H) {
    const m = new T.MeshBasicNodeMaterial({transparent: true, depthWrite: false, side: T.DoubleSide, fog: false});
    const q = uv(), fall = sqrt(q.y);
    const a = mx_noise_float(vec3(q.x.mul(wid * 4).add(seed), fall.mul(H * .5).sub(time.mul(2.3)), time.mul(.2).add(seed))).mul(.5).add(.5);
    const b = mx_noise_float(vec3(q.x.mul(wid * 14).add(seed * 3), fall.mul(H * 1.8).sub(time.mul(4.4)), seed)).mul(.5).add(.5);
    const streak = clamp(a.mul(.7).add(b.mul(.55)).sub(.15), 0, 1);
    const foam = max(smoothstep(.16, .04, q.y).mul(.6), smoothstep(.8, 1, q.y)).mul(b.mul(.7).add(.5));
    const wob = mx_noise_float(vec3(q.y.mul(5).sub(time.mul(1.2)), seed, 2)).mul(.08);
    const edge = smoothstep(0, .18, q.x.add(wob)).mul(smoothstep(1, .82, q.x.add(wob)));
    m.colorNode = mix(vec3(.3, .44, .56), vec3(.92, .96, 1), clamp(streak.add(foam), 0, 1));
    m.opacityNode = clamp(streak.mul(.62).add(.18).add(foam.mul(.5)), 0, 1).mul(edge).mul(smoothstep(0, .07, q.y)).mul(op);
    return m;
  }
  /** Mist off the foot of the fall: soft puffs that rise, drift into the cave and thin out. */
  buildMist() {
    const n = 42, pos = new Float32Array(n * 3), data = new Float32Array(n * 4);
    const posA = new T.InstancedBufferAttribute(pos, 3), dataA = new T.InstancedBufferAttribute(data, 4); posA.setUsage(T.DynamicDrawUsage); dataA.setUsage(T.DynamicDrawUsage);
    const mat = new T.SpriteNodeMaterial({transparent: true, depthWrite: false}), d = instancedDynamicBufferAttribute(dataA);
    mat.positionNode = instancedDynamicBufferAttribute(posA); mat.scaleNode = d.x; mat.rotationNode = d.z;
    const r = uv().sub(.5).length().mul(2), wisp = mx_noise_float(vec3(uv().mul(3), d.z.mul(3))).mul(.25);
    mat.colorNode = vec3(.74, .84, .92); mat.opacityNode = float(1).sub(smoothstep(.1, 1, r.add(wisp))).mul(d.y);
    const mesh = new T.Mesh(new T.PlaneGeometry(1, 1), mat); mesh.count = n; mesh.frustumCulled = false; mesh.renderOrder = 4; mesh.userData.noRain = true; this.vis.add(mesh);
    const R = rng(55);
    this.mist = {n, pos, data, posA, dataA, list: Array.from({length: n}, () => this.puff({age: 0}, R)).map(p => (p.age = R() * p.life, p)), R};
    this.stepMist(0);
  }
  puff(p, R) { p.age = 0; p.life = 3.5 + R() * 3; p.u = this.fall.impactU + (R() - .3) * 1.4; p.v = this.fall.v + (R() - .5) * 3; p.vu = .25 + R() * .45; p.vy = .35 + R() * .5; p.s = .9 + R() * 1.1; p.rot = R() * 6.28; p.spin = (R() - .5) * .4; return p; }
  stepMist(dt) {
    const M = this.mist; let i = 0;
    for (const p of M.list) {
      p.age += dt; if (p.age > p.life) this.puff(p, M.R);
      const k = p.age / p.life, w = this.W(p.u + p.vu * p.age, p.v, CAVE.floor + .2 + p.vy * p.age);
      M.pos[i * 3] = w.x; M.pos[i * 3 + 1] = w.y; M.pos[i * 3 + 2] = w.z;
      M.data[i * 4] = p.s * (1 + k * 2.4); M.data[i * 4 + 1] = Math.sin(Math.PI * k) * .085; M.data[i * 4 + 2] = p.rot + p.spin * p.age; i++;
    }
    M.posA.needsUpdate = true; M.dataA.needsUpdate = true;
  }
  buildBats() {
    // A wing with a scalloped trailing edge (x out along the span, z forward), mirrored for the other side; a small body.
    const P = [[0, .05], [.09, .09], [.2, .105], [.33, .08], [.43, .02], [.38, -.03], [.31, -.01], [.25, -.07], [.18, -.035], [.11, -.085], [.05, -.045], [0, -.07]];
    const s = new T.Shape(); s.moveTo(...P[0]); for (const p of P.slice(1)) s.lineTo(...p);
    const wing = new T.ShapeGeometry(s).rotateX(Math.PI / 2), N = 30, mat = new T.MeshBasicMaterial({color: '#060607', side: T.DoubleSide});
    const wings = new T.InstancedMesh(wing, mat, N * 2), body = new T.InstancedMesh(new T.SphereGeometry(.04, 8, 6).scale(1, .8, 2.3), mat, N);
    for (const m of [wings, body]) { m.frustumCulled = false; m.userData.noRain = true; this.vis.add(m); }
    const r = rng(77); this.bats = {wings, body, list: Array.from({length: N}, () => ({a: r() * 6.28, rad: .2 + r() * .5, sp: (.22 + r() * .32) * (r() < .5 ? -1 : 1), h: r() * 2.5, ph: r() * 6.28, rate: 13 + r() * 8}))};
  }
  /** Frame point of a world point. */
  local(p) { const F = this.F, dx = p.x - F.ox, dz = p.z - F.oz; return {u: dx * F.fx + dz * F.fz, v: dx * F.vx + dz * F.vz, y: p.y - F.y}; }
  /** In the cave, the shaft or the vestibule? */
  inside(q) {
    if (q.u > VEST.u0 - .3 && q.u < VEST.u1 + .3 && q.v > SHAFT.back - .3 && q.v < VEST.v1 + .05 && q.y < this.B.floor + 3.3 && q.y > CAVE.floor - 1) return true;
    return q.y < this.B.floor - 3 && q.y > CAVE.floor - 2 && ((q.u - CAVE.cu) / CAVE.ru) ** 2 + ((q.v - CAVE.cv) / CAVE.rv) ** 2 < 1.05;
  }
  place() {
    const B = this.B, e = this.door, recede = Math.min(1, e / .3), slide = Math.max(0, (e - .3) / .7);
    const ps = slide * slide * (3 - 2 * slide);
    this.panel.position.copy(this.W(SECRET.u + ps * 1.75, this.wall.v - recede * .55, B.floor));
    this.cab.position.copy(this.W(SHAFT.u, SHAFT.v, this.cabY));
  }
  setGate(key, on, u, v, y, su, sy, sv) {
    if (!this.physics || this.gates[key] === on) return; this.gates[key] = on;
    if (!on) { this.physics.remove('cave' + key); return; }
    const p = this.W(u, v, y); this.physics.setBoxes('cave' + key, [{x: p.x, y: p.y, z: p.z, hx: su / 2, hy: sy / 2, hz: sv / 2, yaw: this.F.yaw, tag: 'metal'}]);
  }
  /** The keypad: an input on the screen. Right: the wall opens. */
  keypad() {
    const H = this.hooks; if (!H || this.keypadOpen) return;
    this.keypadOpen = true; H.pause(true);
    const el = document.createElement('div'); el.className = 'bc-pad';
    el.innerHTML = `<div class="bc-box"><span>SECURITY</span><b>ENTER PASSWORD</b><input type="password" maxlength="16" autocomplete="off" spellcheck="false"><small>ENTER TO CONFIRM · ESC TO LEAVE</small></div>`;
    H.root.append(el);
    const inp = el.querySelector('input'), box = el.querySelector('.bc-box'), close = () => { el.remove(); this.keypadOpen = false; H.pause(false); };
    setTimeout(() => inp.focus(), 30);
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key !== 'Enter') return;
      if (sum(inp.value.trim().toLowerCase()) === KEY) { box.classList.add('ok'); box.querySelector('b').textContent = 'ACCESS GRANTED'; this.audio?.beep(true); setTimeout(() => { close(); this.doorWant = 1; this.doorT = 0; this.entered = false; this.audio?.rumble(); }, 650); }
      else { box.classList.remove('no'); void box.offsetWidth; box.classList.add('no'); box.querySelector('b').textContent = 'ACCESS DENIED'; inp.value = ''; this.audio?.beep(false); }
    });
    el.addEventListener('keyup', e => e.stopPropagation());
    el.addEventListener('pointerdown', e => { if (e.target === el) close(); });
  }
  /** E. True if it was ours. */
  press() {
    if (this.go) return this.carrying || this.here;
    if (this.atWall && this.door < .05) { this.keypad(); return true; }
    if (this.inCab) { this.depart(this.stop === 'T' ? 'B' : 'T', true); return true; }
    if (this.atLanding && this.atLanding !== this.stop) { this.depart(this.atLanding, false); return true; }
    return false;
  }
  depart(to, ride) { this.go = {to, ride, t: 0, from: this.cabY}; this.carry = null; this.audio?.beep(true); }
  /** o: {dt, walker (pos, place()), onFoot, camera, audio}. Returns true while it carries you. */
  update({dt, walker, onFoot, camera, audio}) {
    const B = this.B, w = onFoot && walker?.active ? this.local(walker.pos) : null;
    if (audio && !this.audio) this.audio = new CaveAudio(audio.ctx, audio.out);
    const near = !!w && Math.hypot(w.u - CAVE.cu, w.v - CAVE.cv) < 40 && w.y < 4;
    this.here = !!w && this.inside(w);
    // Facing the wall (the hall's -v): only right in front of that one panel does it ask.
    if (camera) { camera.getWorldDirection(_D); this.facing = _D.x * this.F.vx + _D.z * this.F.vz; }
    this.atWall = !!w && Math.abs(w.u - SECRET.u) < .9 && w.v > this.wall.v + .2 && w.v < this.wall.v + 1.5 && Math.abs(w.y - B.floor) < 1 && this.facing < -.55;
    this.inCab = !!w && Math.abs(w.u - SHAFT.u) < .95 && Math.abs(w.v - SHAFT.v) < .95 && Math.abs(w.y - this.cabY) < 1.2;
    const atTop = !!w && w.u > VEST.u0 && w.u < VEST.u1 && w.v > VEST.v0 - .1 && w.v < VEST.v1 + 1.2 && Math.abs(w.y - B.floor) < 1.5 && this.door > .9;
    const atBottom = !!w && Math.hypot(w.u - SHAFT.u, w.v - (SHAFT.front + 1.6)) < 2.6 && Math.abs(w.y - CAVE.floor) < 1.5;
    this.atLanding = atTop && !this.inCab ? 'T' : atBottom && !this.inCab ? 'B' : null;
    // The door. Open for anyone behind it or coming up. It shuts behind you as soon as you are out in the
    // garage (and asks for the password again); a few seconds after you have gone down; or, if it was
    // opened and nobody went in, after a while.
    const behind = !!w && w.u > VEST.u0 && w.u < VEST.u1 && w.v < VEST.v1 + .05 && w.v > SHAFT.back && Math.abs(w.y - B.floor) < 2;
    const below = !!w && w.y < B.floor - 2;
    if (behind || below && this.door > 0) this.entered = true;
    if (behind || (this.go && this.go.to === 'T')) { this.doorWant = 1; this.doorT = 0; }
    if (this.doorWant) {
      const inHall = !!w && w.v > this.wall.v + .9 && Math.abs(w.y - B.floor) < 2, gone = !w || below;
      const wait = this.entered ? (inHall ? .5 : gone ? 4 : Infinity) : (gone || Math.hypot(w.u - SECRET.u, w.v - this.wall.v) > 6 ? 3 : 12);
      this.doorT = !this.go && !behind ? this.doorT + dt : 0;
      if (this.doorT > wait) { this.doorWant = 0; this.entered = false; this.audio?.rumble(); }
    }
    const was = this.door; this.door = this.doorWant ? Math.min(1, this.door + dt / 2.2) : Math.max(0, this.door - dt / 1.8);
    this.setGate('Door', this.door < .02, SECRET.u, this.wall.v, B.floor + 1.3, SECRET.hw * 2, 2.6, .4);
    // The lift.
    const g = this.go;
    if (g) {
      if (g.t === 0 && g.ride && this.inCab) this.carry = {u: Math.max(-.7, Math.min(.7, w.u - SHAFT.u)), v: Math.max(-.7, Math.min(.7, w.v - SHAFT.v))};
      g.t += dt; const k = Math.min(1, g.t / RIDE), s = k * k * (3 - 2 * k), to = g.to === 'T' ? B.floor : CAVE.floor;
      this.cabY = g.from + (to - g.from) * s; this.audio?.ride(Math.sin(k * Math.PI));
      if (k >= 1) { this.stop = g.to; this.go = null; this.audio?.ride(0); this.audio?.beep(true); }
    }
    // The platform is a floor to stand on whenever it is at a stop (while it moves it carries you).
    const cabAt = this.go ? null : this.stop;
    if (this.physics && this.cabAt !== cabAt) {
      this.cabAt = cabAt; this.physics.remove('caveCab');
      if (cabAt) { const p = this.W(SHAFT.u, SHAFT.v, this.cabY - .1); this.physics.setBoxes('caveCab', [{x: p.x, y: p.y, z: p.z, hx: SHAFT.hw, hy: .1, hz: SHAFT.hw, yaw: this.F.yaw, tag: 'metal'}]); }
    }
    this.setGate('Top', this.stop !== 'T' || !!this.go, SHAFT.u, VEST.v0 + .1, B.floor + 1.5, SHAFT.hw * 2, 3, .2);
    this.setGate('Bottom', this.stop !== 'B' || !!this.go, SHAFT.u, SHAFT.front + .05, CAVE.floor + 1.5, SHAFT.hw * 2 + .2, 3, .15);
    const carrying = !!this.carry && !!this.go;
    if (carrying) { const p = this.W(SHAFT.u + this.carry.u, SHAFT.v + this.carry.v, this.cabY + .01); walker.place(p.x, p.y, p.z); }
    if (!this.go) this.carry = null;
    this.carrying = carrying;
    if (was !== this.door || g || carrying) this.place();
    // The cave is drawn from the basement down, and comes alive only when you are near it.
    const cq = camera ? this.local(camera.position) : null;
    this.vis.visible = !!cq && cq.y < B.floor + 4 && Math.hypot(cq.u - CAVE.cu, cq.v - CAVE.cv) < 48;
    // Down in the cave the sky's reflection fades out too (world.js passes this to the sky's lighting).
    const camIn = !!cq && cq.y < B.floor - 4 && ((cq.u - CAVE.cu) / CAVE.ru) ** 2 + ((cq.v - CAVE.cv) / CAVE.rv) ** 2 < 1.1 ? 1 : 0;
    this.deep += (camIn - this.deep) * (1 - Math.exp(-dt * 3));
    const inCave = !!w && w.y < B.floor - 2 && this.here;
    if (near && (inCave || carrying)) this.animate(dt, inCave);
    this.audio?.update(dt, inCave ? 1 : carrying ? .4 : 0, w && inCave ? Math.hypot(w.u - this.fall.impactU, w.v - this.fall.v) : 99);
    if (inCave && this.makeCar && !this.car) this.spawnCar();
    // Prompt.
    this.prompt = carrying ? (g.to === 'B' ? '▼ GOING DOWN' : '▲ GOING UP') : this.atWall && this.door < .05 ? '<kbd>E</kbd> ENTER PASSWORD'
      : this.inCab && !this.go ? '<kbd>E</kbd> ' + (this.stop === 'T' ? 'GO DOWN' : 'GO UP') : this.atLanding && this.atLanding !== this.stop && !this.go ? '<kbd>E</kbd> CALL THE LIFT' : '';
    return carrying;
  }
  animate(dt, full) {
    this.drawT += dt;
    if (full && this.drawT > .25) { this.drawT = 0; this.tick = (this.tick || 0) + 1; const S = this.screens[this.tick % this.screens.length]; this.draw(S, performance.now() / 1000); }
    if (full || !dt) this.stepMist(dt);
    const {wings, body, list} = this.bats, t = performance.now() / 1000;
    list.forEach((b, i) => {
      b.a += b.sp * dt;
      const at = a => { const u = CAVE.cu + Math.cos(a) * CAVE.ru * b.rad + Math.sin(t * .7 + b.ph) * 1.5, v = CAVE.cv + Math.sin(a) * CAVE.rv * b.rad; return this.W(u, v, this.roof(u, v) - 2 - b.h + Math.sin(t * 2 + b.ph) * .4); };
      const p = at(b.a), q = at(b.a + b.sp * .05), yaw = Math.atan2(q.x - p.x, q.z - p.z), flap = Math.sin(t * b.rate + b.ph) * .75 + .1;
      _E.set(0, yaw, 0, 'YXZ'); _Q.setFromEuler(_E); _M.compose(p, _Q, _S1); body.setMatrixAt(i, _M);
      for (const s of [1, -1]) { _E.set(0, yaw, s * flap, 'YXZ'); _Q.setFromEuler(_E); _S.set(s, 1, 1); _M.compose(p, _Q, _S); wings.setMatrixAt(i * 2 + (s > 0 ? 0 : 1), _M); }
    });
    wings.instanceMatrix.needsUpdate = true; body.instanceMatrix.needsUpdate = true;
    if (this.car) this.car.object.rotateY(dt * .25);
  }
  spawnCar() {
    const v = this.makeCar({paint: '#0b0b0d', ambient: '#ff2d2d', build: {wing: 'attack', kit: 'wide', front: 'gt3', wheels: 'dish', stance: 'slammed', glow: '#3fa9ff', exhaust: 'quad', lights: 'stock'}});
    // The car's origin is where its tyres touch: it stands on the plinth.
    v.object.position.copy(this.W(this.TT.u, this.TT.v, this.plinth)); v.object.rotation.y = this.F.yaw;
    v.object.userData.noRain = true; this.vis.add(v.object); this.car = v;
    if (this.physics) { const p = v.object.position; this.physics.setBoxes('caveCar', [{x: p.x, y: p.y + .62, z: p.z, hx: 2.3, hy: .62, hz: 2.3, yaw: 0, tag: 'metal'}]); }
  }
}

const _D = new T.Vector3(), _E = new T.Euler(), _Q = new T.Quaternion(), _M = new T.Matrix4(), _S = new T.Vector3(1, 1, 1), _S1 = new T.Vector3(1, 1, 1);
/** A waterfall, drips, a bat now and then; beeps and the stone door; the lift's hum. */
class CaveAudio {
  constructor(ctx, out) {
    this.ctx = ctx; this.out = out;
    const n = ctx.sampleRate * 2, b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let br = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; br = (br + .04 * w) / 1.04; d[i] = w * .4 + br * 2.5; } }
    this.noise = b;
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
    this.fallG = ctx.createGain(); this.fallG.gain.value = 0; s.connect(f).connect(this.fallG).connect(out); s.start();
    const h = ctx.createOscillator(); h.type = 'sawtooth'; h.frequency.value = 55; const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 160;
    this.humG = ctx.createGain(); this.humG.gain.value = 0; h.connect(hf).connect(this.humG).connect(out); h.start();
    this.dripT = 1; this.batT = 6;
  }
  update(dt, cave, dFall) {
    const t = this.ctx.currentTime;
    this.fallG.gain.setTargetAtTime(cave * .16 / (1 + Math.max(0, dFall - 3) * .12), t, .3);
    if (cave > .5) {
      if ((this.dripT -= dt) < 0) { this.dripT = .4 + Math.random() * 1.6; this.tone(900 + Math.random() * 900, .06, .03, 1.7); }
      if ((this.batT -= dt) < 0) { this.batT = 5 + Math.random() * 9; for (let k = 0; k < 3; k++) setTimeout(() => this.tone(5200 + Math.random() * 1800, .03, .012, .8), k * 70); }
    }
  }
  tone(f, dur, v, rise = 1) {
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner(); p.pan.value = Math.random() * 1.6 - .8;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * rise, t + dur); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .003); g.gain.exponentialRampToValueAtTime(.0003, t + dur);
    o.connect(g).connect(p).connect(this.out); o.start(t); o.stop(t + dur + .02);
  }
  beep(ok) { this.tone(ok ? 1320 : 220, ok ? .12 : .3, .05, ok ? 1.5 : .8); }
  ride(k) { this.humG.gain.setTargetAtTime(k * .07, this.ctx.currentTime, .2); }
  rumble() {
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; f.type = 'lowpass'; f.frequency.value = 140;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.35, t + .3); g.gain.linearRampToValueAtTime(.25, t + 1.8); g.gain.exponentialRampToValueAtTime(.001, t + 2.4);
    s.connect(f).connect(g).connect(this.out); s.start(t); s.stop(t + 2.5);
  }
}
