/* A small construction kit for hand-built set pieces (2026-09-27): the
 * Hollywood sign, the overlook, the race track, the drag strip, the player
 * houses. Boxes, cylinders and arbitrary geometry go into one merged mesh per
 * material, vertex-coloured; any piece can also drop a box collider.
 *
 * Frames: yaw turns local +x to world (cos yaw, 0, -sin yaw), the same as
 * three.js's rotation.y and vehicle.js setBoxes, so colliders line up.
 */
import * as T from 'three';
import {vec3, attribute, float, uniform, positionWorld, mx_noise_float, fract, floor, smoothstep, min, max, abs, mix, time, pow, sin, cos, normalWorld, cameraPosition, transformNormalToView, dot, clamp} from 'three/tsl';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {wetWindow} from './rain.js';

const M4 = new T.Matrix4(), Q = new T.Quaternion(), UP = new T.Vector3(0, 1, 0), S1 = new T.Vector3(1, 1, 1);

export class Kit {
  constructor() { this.indoor = 0; this.parts = new Map(); this.colliders = []; this.labels = []; this.tris = {pos: [], idx: []}; this.waters = []; this.sounds = []; this.fires = []; }
  /** Any geometry, placed at (x, y, z) turned by yaw (and optionally pitched/rolled). */
  add(mat, geo, x, y, z, yaw = 0, color = '#ffffff', {rx = 0, rz = 0, scale = S1, keep = false} = {}) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    g.deleteAttribute('uv'); g.deleteAttribute('uv1');
    const e = new T.Euler(rx, yaw, rz, 'YXZ');
    M4.compose(new T.Vector3(x, y, z), Q.setFromEuler(e), scale);
    g.applyMatrix4(M4);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!(keep && g.attributes.color)) {
      const c = new T.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new T.BufferAttribute(col, 3));
    }
    g.setAttribute('indoor', new T.BufferAttribute(new Float32Array(g.attributes.position.count).fill(this.indoor), 1));
    (this.parts.get(mat) || this.parts.set(mat, []).get(mat)).push(g);
    return g;
  }
  /** Box centred at (x, y, z); `solid` also makes it a collider. */
  box(mat, x, y, z, sx, sy, sz, yaw = 0, color = '#ffffff', solid = false) {
    this.add(mat, new T.BoxGeometry(sx, sy, sz), x, y, z, yaw, color);
    if (solid) this.colliders.push({x, y, z, hx: sx / 2, hy: sy / 2, hz: sz / 2, yaw, tag: mat});
  }
  /** Box between two heights (y0 at the bottom). */
  post(mat, x, y0, y1, z, sx, sz, yaw = 0, color = '#ffffff', solid = false) {
    if (y1 - y0 > .01) this.box(mat, x, (y0 + y1) / 2, z, sx, y1 - y0, sz, yaw, color, solid);
  }
  cyl(mat, x, y0, z, r, h, color = '#ffffff', n = 12, solid = false, r1 = r) {
    this.add(mat, new T.CylinderGeometry(r1, r, h, n), x, y0 + h / 2, z, 0, color);
    if (solid) this.colliders.push({x, y: y0 + h / 2, z, hx: r, hy: h / 2, hz: r, yaw: 0});
  }
  /** A round rod between two 3D points. */
  rod(mat, a, b, r, color = '#ffffff', n = 6) {
    const d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(); if (L < 1e-3) return;
    const g = new T.CylinderGeometry(r, r, L, n).toNonIndexed(); g.deleteAttribute('uv');
    M4.compose(new T.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), Q.setFromUnitVectors(UP, d.normalize()), S1);
    g.applyMatrix4(M4);
    const c = new T.Color(color), col = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
    g.setAttribute('color', new T.BufferAttribute(col, 3));
    g.setAttribute('indoor', new T.BufferAttribute(new Float32Array(g.attributes.position.count).fill(this.indoor), 1));
    (this.parts.get(mat) || this.parts.set(mat, []).get(mat)).push(g);
  }
  /** A box between two points in plan (a beam, a rail, a kerb), yaw from the points. */
  beam(mat, x0, z0, x1, z1, y, sy, sz, color = '#ffffff', solid = false) {
    const L = Math.hypot(x1 - x0, z1 - z0); if (L < 1e-3) return;
    this.box(mat, (x0 + x1) / 2, y, (z0 + z1) / 2, L, sy, sz, Math.atan2(-(z1 - z0), x1 - x0), color, solid);
  }
  /** Flat quad strip (a painted line, a road surface) through plan points at heights. */
  ribbon(mat, pts, width, color = '#ffffff', lift = .03) {
    const pos = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay, az] = pts[i], [bx, by, bz] = pts[i + 1];
      let tx = bx - ax, tz = bz - az; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const nx = -tz * width / 2, nz = tx * width / 2;
      const A = [ax - nx, ay + lift, az - nz], B = [ax + nx, ay + lift, az + nz], C = [bx + nx, by + lift, bz + nz], D = [bx - nx, by + lift, bz - nz];
      pos.push(...A, ...C, ...B, ...A, ...D, ...C);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    // Face up whatever the winding came out as.
    const nor = g.attributes.normal.array; if (nor[1] < 0) { for (let i = 0; i < pos.length; i += 9) { for (let k = 0; k < 3; k++) { const t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; } } g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); }
    this.add(mat, g, 0, 0, 0, 0, color);
  }
  /** A surface through a grid of world points grid[row][col] = [x, y, z]
   *  (a warped drive apron, a ramp), facing up; `solid` adds it to the
   *  kit's triangle-mesh collider (Places builds it). */
  sheet(mat, grid, color = '#ffffff', solid = false) {
    const pos = [], R = grid.length, C = grid[0].length;
    for (let i = 0; i < R - 1; i++) for (let j = 0; j < C - 1; j++) {
      const a = grid[i][j], b = grid[i][j + 1], c = grid[i + 1][j + 1], d = grid[i + 1][j];
      // Wind each triangle so it faces up.
      for (const [p, q, r] of [[a, b, c], [a, c, d]]) {
        const ux = q[0] - p[0], uz = q[2] - p[2], vx = r[0] - p[0], vz = r[2] - p[2];
        pos.push(...p, ...(uz * vx - ux * vz > 0 ? [q, r] : [r, q]).flat());
      }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    this.add(mat, g, 0, 0, 0, 0, color);
    if (solid) { const T0 = this.tris.pos.length / 3; this.tris.pos.push(...pos); for (let k = 0; k < pos.length / 3; k++) this.tris.idx.push(T0 + k); }
  }
  /** One mesh per material. `mats` maps material keys to three materials. */
  build(scene, mats, {shadows = true} = {}) {
    const group = new T.Group();
    for (const [key, list] of this.parts) {
      for (const g of list) if (!g.attributes.indoor) g.setAttribute('indoor', new T.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
      const geo = mergeGeometries(list, false); if (!geo) continue;
      geo.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      const mesh = new T.Mesh(geo, mats[key] || mats.paint);
      mesh.castShadow = shadows && !['glow', 'glass', 'line', 'flood', 'grass', 'poolwater', 'room', 'wash', 'flame'].includes(key);
      mesh.receiveShadow = !['wash', 'flame'].includes(key);
      // Transparent layers in a fixed order (sorting by object centre made the pool flicker).
      mesh.renderOrder = {poolwater: 1, glass: 2, wash: 3, flame: 4}[key] || 0;
      mesh.userData.kind = 'kit:' + key; mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    { const f = o => { o.updateMatrix(); o.matrixAutoUpdate = false; o.children.forEach(f); }; f(group); }
    group.userData.farCull = 2200;          // props: hidden when far (world.js)
    scene.add(group);
    return group;
  }
}

/** The shared materials for set pieces: vertex-coloured, and `glow`/`lit`
 *  brighten with the night uniform (materials.js). */
export function kitMaterials(night) {
  const vc = attribute('color', 'vec3');
  const paint = new T.MeshStandardNodeMaterial({roughness: .62, metalness: 0}); paint.colorNode = vc;
  const metal = new T.MeshStandardNodeMaterial({roughness: .32, metalness: .85}); metal.colorNode = vc;
  const gloss = new T.MeshStandardNodeMaterial({roughness: .12, metalness: .1}); gloss.colorNode = vc;
  const line = new T.MeshStandardNodeMaterial({roughness: .8, metalness: 0}); line.colorNode = vc;
  line.polygonOffset = true; line.polygonOffsetFactor = -2; line.polygonOffsetUnits = -2;
  const glass = new T.MeshPhysicalNodeMaterial({roughness: .04, metalness: 0, transparent: true, opacity: .32, side: T.DoubleSide, depthWrite: false});
  glass.colorNode = vc; wetWindow(glass);           // rain beads and runs down the panes
  const glow = new T.MeshStandardNodeMaterial({roughness: .5, metalness: 0}); glow.colorNode = vc.mul(.35);
  glow.emissiveNode = vc.mul(float(.25).add(night.mul(3.2)));
  const lit = new T.MeshStandardNodeMaterial({roughness: .55, metalness: 0}); lit.colorNode = vc;
  lit.emissiveNode = vc.mul(night.mul(.85));
  const water = new T.MeshStandardNodeMaterial({roughness: .05, metalness: .1}); water.colorNode = vec3(.12, .5, .62);
  // Houses (2026-09-27 pass 10): surfaces with some grain, rooms that glow
  // after dark, a pool that lights up, and a floodlit track surface.
  const P = positionWorld, n1 = s => mx_noise_float(P.mul(s)).mul(.5).add(.5);
  const wood = new T.MeshStandardNodeMaterial({roughness: .58, metalness: 0});
  // Long grain: noise stretched along the vertical and across the plan, plus a fine figure.
  wood.colorNode = vc.mul(n1(vec3(.9, 14, .9)).mul(.28).add(n1(vec3(9, 60, 9)).mul(.1)).add(.74));
  const stucco = new T.MeshStandardNodeMaterial({roughness: .9, metalness: 0});
  stucco.colorNode = vc.mul(n1(3.1).mul(.06).add(n1(.35).mul(.05)).add(.9));
  stucco.emissiveNode = vc.mul(vec3(1, .9, .76)).mul(night.mul(.07));       // a soft façade wash at night
  // Cut stone in courses: each course its own tone, staggered joints, a rough face.
  const stone = new T.MeshStandardNodeMaterial({roughness: .92, metalness: 0});
  const course = floor(P.y.div(.62)), along = P.x.add(P.z).div(1.35).add(course.mul(.5));
  const joint = min(smoothstep(.0, .05, fract(P.y.div(.62))), smoothstep(.0, .035, fract(along)).mul(float(1).sub(smoothstep(.965, 1, fract(along)))));
  const block = mx_noise_float(vec3(floor(along), course, 0).mul(1.7)).mul(.14).add(.92);
  stone.colorNode = vc.mul(block).mul(n1(2.3).mul(.16).add(.86)).mul(joint.mul(.42).add(.58));
  const rock = new T.MeshStandardNodeMaterial({roughness: .96, metalness: 0, flatShading: true});
  rock.colorNode = vc.mul(n1(.9).mul(.3).add(n1(5).mul(.14)).add(.66));
  const grass = new T.MeshStandardNodeMaterial({roughness: 1, metalness: 0});
  grass.colorNode = vc.mul(n1(vec3(.45, 0, .45)).mul(.22).add(n1(vec3(4, 0, 4)).mul(.12)).add(.78));
  grass.polygonOffset = true; grass.polygonOffsetFactor = -2; grass.polygonOffsetUnits = -2;
  const fabric = new T.MeshStandardNodeMaterial({roughness: .96, metalness: 0});
  fabric.colorNode = vc.mul(n1(40).mul(.08).add(.94));
  // Interior skins (ceilings, inside faces): lit warm after dark, so glass reads as a lit room.
  const room = new T.MeshStandardNodeMaterial({roughness: .8, metalness: 0}); room.colorNode = vc;
  room.emissiveNode = vc.mul(vec3(1, .83, .62)).mul(night.mul(1.05));
  // Pool tiles: caustics dance on them by day; after dark the underwater lights
  // fill the water and the caustics glow (2026-09-27 pass 11).
  const caustic = (() => {
    const q = vec3(P.x.mul(1.35), P.z.mul(1.35), time.mul(.32));
    const a = float(1).sub(abs(mx_noise_float(q))), b = float(1).sub(abs(mx_noise_float(q.mul(vec3(1.7, 1.7, 1.3)).add(vec3(3.1, 7.7, 0)))));
    return pow(a, float(7)).add(pow(b, float(9)).mul(.7));
  })();
  const pool = new T.MeshStandardNodeMaterial({roughness: .3, metalness: 0});
  pool.colorNode = vc.mul(n1(vec3(3, 3, 3)).mul(.1).add(.9)).add(caustic.mul(.28));
  pool.emissiveNode = vc.mul(night.mul(float(1.15).add(caustic.mul(1.6))));
  // The water: a gentle travelling ripple in the normal, a Fresnel veil (you see
  // the tiles looking down, the sky at a glance), and the lit pool after dark.
  const poolwater = new T.MeshPhysicalNodeMaterial({roughness: .04, metalness: 0, transparent: true, depthWrite: false, side: T.DoubleSide});
  const rip = (() => {
    let gx = float(0), gz = float(0);
    for (const [dx, dz, L, A, c] of [[1, .3, 2.1, .05, .5], [-.4, 1, 1.3, .04, .38], [.7, -.7, .7, .025, .3], [-.9, -.2, .45, .015, .22]]) {
      const l = Math.hypot(dx, dz), k = 2 * Math.PI / L, ph = P.x.mul(dx / l * k).add(P.z.mul(dz / l * k)).sub(time.mul(c * k));
      const sl = cos(ph).mul(A); gx = gx.add(sl.mul(dx / l)); gz = gz.add(sl.mul(dz / l));
    }
    return vec3(gx.negate(), 1, gz.negate()).normalize();
  })();
  poolwater.normalNode = transformNormalToView(rip);
  const facing = abs(dot(P.sub(cameraPosition).normalize(), vec3(0, 1, 0)));
  poolwater.opacityNode = mix(float(.92), float(.34), smoothstep(.05, .7, facing));
  poolwater.colorNode = vc.mul(.8);
  poolwater.emissiveNode = vc.mul(vec3(.55, 1, 1.1)).mul(night.mul(.55));
  // Live flames (night only). Vertex colour carries the sheet coordinates:
  // r across (0..1), g up (0..1), b a per-flame seed.
  const flame = new T.MeshBasicNodeMaterial({transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false});
  {
    const fx = vc.x.mul(2).sub(1), fh = vc.y, seed = vc.z;
    const n1f = mx_noise_float(vec3(fx.mul(1.6).add(seed.mul(17)), fh.mul(2.4).sub(time.mul(2.3)), time.mul(.55).add(seed.mul(5))));
    const n2f = mx_noise_float(vec3(fx.mul(4.2).add(seed.mul(3)), fh.mul(6).sub(time.mul(4.4)), seed.mul(9)));
    const width = pow(float(1).sub(fh), float(.75)).mul(.8).add(.06);
    const body = float(1).sub(smoothstep(width.mul(.3), width, abs(fx.add(n1f.mul(.38).mul(fh)))));
    const top = float(1).sub(smoothstep(.2, .92, fh.add(n2f.mul(.22)).add(n1f.mul(.18))));
    const I = body.mul(top).mul(smoothstep(0, .06, fh));
    const hot = mix(vec3(1, .26, .03), vec3(1, .78, .42), float(1).sub(fh).mul(body).mul(body));
    flame.colorNode = hot.mul(I).mul(smoothstep(.12, .55, night)).mul(2.2);
  }
  // Floodlit track: the surface itself carries the light after dark (towers every ~200 m).
  const flood = new T.MeshStandardNodeMaterial({roughness: .8, metalness: 0}); flood.colorNode = vc;
  flood.polygonOffset = true; flood.polygonOffsetFactor = -2; flood.polygonOffsetUnits = -2;
  flood.emissiveNode = min(vc.add(.05), vec3(.45)).mul(vec3(1, .97, .9)).mul(night.mul(1.35));
  // Light washes: additive, invisible by day; vertex colour carries the falloff
  // (pools under downlights, scallops above uplights, lit palm trunks).
  const wash = new T.MeshBasicNodeMaterial({transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false});
  wash.colorNode = vc.mul(night.mul(night));
  // Furniture inside a lit room (Kit.indoor while it was built) takes the
  // room's warm light after dark, instead of standing in silhouette.
  const fill = vc.mul(attribute('indoor', 'float')).mul(night).mul(vec3(1, .8, .58)).mul(.32);
  for (const m of [paint, metal, gloss, wood, stone, fabric, rock]) m.emissiveNode = m.emissiveNode ? m.emissiveNode.add(fill) : fill;
  return {wash, flame, paint, metal, gloss, line, glass, glow, lit, water, wood, stucco, stone, rock, grass, fabric, room, pool, poolwater, flood};
}
/* Light washes (vertex colour = falloff; kit 'wash' is additive and night-only). */
function colorize(g, f) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const [r, gg, b] = f(p.getX(i), p.getY(i), p.getZ(i)); c.set([r, gg, b], i * 3); }
  g.setAttribute('color', new T.BufferAttribute(c, 3)); return g;
}
const WARM = new T.Color('#ffc98a');
/** A pool of light on a floor: bright centre, soft rim. */
export function washDisc(r, I = 1, color = WARM) {
  const pos = [], seg = 24, rings = [0, .35, .7, 1];
  for (let k = 0; k < seg; k++) for (let j = 0; j < rings.length - 1; j++) {
    const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2, r0 = rings[j] * r, r1 = rings[j + 1] * r;
    const A = [Math.cos(a0) * r0, 0, Math.sin(a0) * r0], B = [Math.cos(a1) * r0, 0, Math.sin(a1) * r0], C = [Math.cos(a1) * r1, 0, Math.sin(a1) * r1], D = [Math.cos(a0) * r1, 0, Math.sin(a0) * r1];
    pos.push(...A, ...C, ...B, ...A, ...D, ...C);
  }
  const out = new T.BufferGeometry(); out.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); out.computeVertexNormals();
  return colorize(out, (x, y, z) => { const t = Math.hypot(x, z) / r, k = I * Math.pow(Math.max(0, 1 - t), 1.8); return [color.r * k, color.g * k, color.b * k]; });
}
/** A scallop of light grazing up a wall from a fixture at its foot (plane faces +z). */
export function washFan(w, h, I = 1, color = WARM) {
  const g = new T.PlaneGeometry(w, h, 8, 8); g.translate(0, h / 2, 0);
  return colorize(g, (x, y) => { const k = I * Math.exp(-3.2 * (2 * x / w) ** 2 * (1.4 - y / h)) * Math.pow(Math.max(0, 1 - y / h), 1.5) * Math.min(1, y / .25 + .2); return [color.r * k, color.g * k, color.b * k]; });
}
/** A sleeve of light up a trunk. */
export function washTrunk(r, h, I = 1, color = WARM) {
  const g = new T.CylinderGeometry(r, r, h, 10, 6, true); g.translate(0, h / 2, 0);
  return colorize(g, (x, y) => { const k = I * Math.pow(Math.max(0, 1 - y / h), 1.3); return [color.r * k, color.g * k, color.b * k]; });
}
export const nightUniform = () => uniform(0);
