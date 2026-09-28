/* Parked cars (2026-09-27).
 *
 * Kerbside on both sides of every street, avenue and boulevard (in the
 * parking lane outside the travel lanes, facing the way that side drives),
 * and in the stalls of strip-mall and restaurant lots. How many of the slots
 * are taken follows the Traffic setting: none at 0, most of them at full.
 *
 * The slots are computed once at load (~270k), packed per 128 m cell. Only
 * the cars within RANGE of the camera are drawn, from the same shared body
 * geometry and materials as the moving traffic (full detail near, the coarse
 * loft beyond NEAR). The few nearest the player carry fixed colliders.
 * Which slot holds a car, and which car, is a hash of the slot: the same
 * street is parked the same way every time you drive down it.
 */
import * as T from 'three';
import {fleetGeometry} from './npcBody.js';
import {TYPES, PAINT} from './traffic.js';

const CELL = 128, RANGE = 280, NEAR = 70, SLOT = 6.8, CAP_NEAR = 400, CAP_FAR = 1600, BODIES = 14;
const KERB = new Set(['street', 'residential', 'avenue', 'boulevard']);
/* What people leave parked: no buses, few trucks, the odd black-and-white. */
const MIX = [['sedan', 5], ['hatch', 3], ['suv', 4], ['pickup', 2], ['van', 2], ['taxi', .25], ['truck', .35], ['police', .12]];
const TOTAL = MIX.reduce((a, [, w]) => a + w, 0);
const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export class Parked {
  constructor({scene, model, physics, traffic, lots}) {
    Object.assign(this, {scene, model, physics, traffic});
    this.cells = new Map();
    this.buildSlots(lots);
    this.buildMeshes();
    this.bodies = [];
    for (let i = 0; i < BODIES; i++) this.bodies.push({body: physics.world.createRigidBody(physics.R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -600 - i * 10, 0)), collider: null, type: null, owner: -1});
    this.last = null; this.timer = 0; this.visible = [];
  }
  /** Slots: [x, y, z, yaw, kind(0 kerb, 1 lot)] packed per cell. */
  buildSlots(lots) {
    const m = this.model, tmp = new Map(), push = (x, y, z, yaw, kind) => {
      const k = Math.floor(x / CELL) * 65536 + Math.floor(z / CELL);
      let a = tmp.get(k); if (!a) tmp.set(k, a = []); a.push(x, y, z, yaw, kind);
    };
    let n = 0;
    for (const seg of m.segments) {
      if (!KERB.has(seg.kind) || seg.elevated) continue;
      const s0 = seg.cut[0] + 9, s1 = seg.L - seg.cut[1] - 9;
      for (let s = s0 + SLOT / 2; s < s1 - SLOT / 2; s += SLOT) {
        const sec = m.sectionAt(seg, s), a = m.sectionAt(seg, s - 3), b = m.sectionAt(seg, s + 3);
        if (a.tx * b.tx + a.tz * b.tz < .995) continue;                     // no parking on a bend
        const lanes = sec.h >= 15 ? 3 : sec.h >= 10 ? 2 : 1, off = sec.h - 1.15;
        if (off - 1 < lanes * 3.5) continue;                                 // no room outside the travel lanes
        for (const side of [-1, 1]) {
          const x = sec.x + sec.nx * off * side, z = sec.z + sec.nz * off * side;
          let clear = true;
          for (const j of m.junctionsNear(x, z)) if (Math.hypot(x - j.x, z - j.z) < j.radius + 8) { clear = false; break; }
          if (!clear) continue;
          push(x, sec.y + (sec.cs || 0) * off * side, z, Math.atan2(sec.tx * side, sec.tz * side), 0); n++;
        }
      }
    }
    for (const lot of lots) if (lot.parking) for (const [x, y, z, yaw] of lot.parking) { push(x, y, z, yaw, 1); n++; }
    for (const [k, a] of tmp) this.cells.set(k, new Float32Array(a));
    this.slotCount = n;
  }
  buildMeshes() {
    const M = this.traffic.materials;
    this.sets = {near: {}, far: {}};
    for (const [name] of MIX) for (const lod of ['near', 'far']) {
      const g = fleetGeometry(name, TYPES[name], lod === 'far'), set = {}, cap = lod === 'near' ? CAP_NEAR : CAP_FAR;
      for (const [k, mat] of [['body', M.paint], ['glass', M.glass], ['trim', M.trim]]) {
        if (!g[k]) continue;
        const mesh = new T.InstancedMesh(g[k], mat, cap);
        mesh.count = 0; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.castShadow = lod === 'near'; mesh.receiveShadow = true;
        if (k === 'body') mesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        this.scene.add(mesh); set[k] = mesh;
      }
      this.sets[lod][name] = set;
    }
  }
  /** Re-pick the drawn cars when the camera has moved or the density changed. */
  update(dt, cam, player) {
    this.timer -= dt;
    const density = this.traffic.density;
    if (this.timer > 0 && this.last && Math.hypot(cam.x - this.last.x, cam.z - this.last.z) < 12 && this.last.d === density) { this.collide(player); return; }
    this.timer = .5; this.last = {x: cam.x, z: cam.z, d: density};
    const occKerb = density * .72, occLot = Math.min(.95, density * 1.1);
    const counts = {}, m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), p = new T.Vector3(), one = new T.Vector3(1, 1, 1), c = new T.Color();
    const vis = [];
    const cx0 = Math.floor((cam.x - RANGE) / CELL), cx1 = Math.floor((cam.x + RANGE) / CELL), cz0 = Math.floor((cam.z - RANGE) / CELL), cz1 = Math.floor((cam.z + RANGE) / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const a = this.cells.get(cx * 65536 + cz); if (!a) continue;
      for (let i = 0; i < a.length; i += 5) {
        const x = a[i], z = a[i + 2], d = Math.hypot(x - cam.x, z - cam.z);
        if (d > RANGE) continue;
        const id = Math.round(x * 4) * 131 + Math.round(z * 4);
        if (hash(id, 11) >= (a[i + 4] ? occLot : occKerb)) continue;
        let pick = hash(id, 29) * TOTAL, type = 'sedan';
        for (const [name, w] of MIX) if ((pick -= w) <= 0) { type = name; break; }
        if (a[i + 4] && (type === 'truck')) type = 'van';
        const lod = d < NEAR ? 'near' : 'far', key = lod + type, k = counts[key] || 0;
        if (k >= (lod === 'near' ? CAP_NEAR : CAP_FAR)) continue;
        counts[key] = k + 1;
        const set = this.sets[lod][type], t = TYPES[type];
        q.setFromAxisAngle(up, a[i + 3]); m4.compose(p.set(x, a[i + 1] + .02, z), q, one);
        for (const part in set) set[part].setMatrixAt(k, m4);
        set.body.setColorAt(k, c.set(t.paint || PAINT[Math.floor(hash(id, 47) * PAINT.length)]));
        vis.push({x, y: a[i + 1], z, yaw: a[i + 3], type, id, d});
      }
    }
    for (const lod of ['near', 'far']) for (const [name] of MIX) {
      const set = this.sets[lod][name], n = counts[lod + name] || 0;
      for (const part in set) { set[part].count = n; set[part].instanceMatrix.needsUpdate = true; if (set[part].instanceColor) set[part].instanceColor.needsUpdate = true; }
    }
    vis.sort((a, b) => a.d - b.d);
    this.visible = vis;
    this.collide(player, true);
  }
  /** Fixed boxes on the parked cars nearest the player (they do not move when hit). */
  collide(player, fresh = false) {
    if (!player || !fresh && (this.t2 = (this.t2 || 0) + 1) % 10) return;
    const R = this.physics.R, world = this.physics.world;
    const near = this.visible.filter(v => Math.hypot(v.x - player.x, v.z - player.z) < 45).slice(0, BODIES);
    this.bodies.forEach((slot, i) => {
      const v = near[i];
      if (!v) { if (slot.owner !== -1) { slot.body.setNextKinematicTranslation({x: 0, y: -600 - i * 10, z: 0}); slot.owner = -1; } return; }
      if (slot.owner === v.id) return;
      const t = TYPES[v.type];
      if (slot.type !== v.type) {
        if (slot.collider) world.removeCollider(slot.collider, false);
        slot.collider = world.createCollider(R.ColliderDesc.cuboid(t.W / 2 - .1, (t.H - .3) / 2, t.L / 2 - .15).setTranslation(0, .3 + (t.H - .3) / 2, 0).setFriction(.5), slot.body);
        slot.type = v.type;
      }
      const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), v.yaw);
      slot.body.setTranslation({x: v.x, y: v.y, z: v.z}, true); slot.body.setRotation({x: q.x, y: q.y, z: q.z, w: q.w}, true);
      slot.body.setNextKinematicTranslation({x: v.x, y: v.y, z: v.z}); slot.body.setNextKinematicRotation({x: q.x, y: q.y, z: q.z, w: q.w});
      slot.owner = v.id;
    });
  }
}
