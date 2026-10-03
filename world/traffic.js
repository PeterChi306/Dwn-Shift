/* NPC traffic (2026-09-26).
 *
 * Cars that live on the road model: each drives its own lane (on the right),
 * follows the car in front with the Intelligent Driver Model (so traffic
 * bunches, queues and pulls away smoothly), slows for bends and for turns at
 * junctions, crosses junctions on a smooth curve from its lane on one road to
 * its lane on the next, and yields to anything crossing its path. The player
 * is just another car to them: they queue behind you and stop if you pull out.
 *
 * They are kinematic: positions come from the road, not from physics. The few
 * nearest the player carry kinematic Rapier boxes (a little smaller than the
 * body, so passing in the next lane never snags) so you can hit them.
 *
 * Nine vehicle types, all drawn as instanced meshes (one draw per material per
 * type): sedan, hatchback, SUV, pickup, minivan, taxi, police cruiser, box
 * truck and city bus, in the colours real LA traffic comes in. Head and tail
 * lights glow at night and in tunnels; tail lights brighten under braking.
 *
 * Density is a 0..1 setting (menu > Settings > Traffic): up to 140 cars;
 * they spawn out of sight 90-360 m away and are recycled beyond 420 m.
 */
import * as T from 'three';
import {clamp, angleDelta} from './network.js';
import {fleetGeometry} from './npcBody.js';

/** Mark a car set's shared matrix and its colours for upload, only the first n instances. */
export function upload(set, n) {
  const k = Math.max(1, n), im = set.body.instanceMatrix;
  im.clearUpdateRanges(); im.addUpdateRange(0, k * 16); im.needsUpdate = true;
  for (const part in set) { const c = set[part].instanceColor; if (c) { c.clearUpdateRanges(); c.addUpdateRange(0, k * 3); c.needsUpdate = true; } }
}
const MAX = 140;                       // cars at full density
const NEAR = 70;                       // full-detail bodies within this of the camera
const RANGE = 420, SPAWN_MIN = 90, SPAWN_MAX = 360;
const DRIVE = new Set(['freeway', 'ramp', 'boulevard', 'avenue', 'street', 'residential', 'underpass', 'tunnel', 'scenic']);
const RANK = {freeway: 9, ramp: 8, boulevard: 7, avenue: 6, tunnel: 6, underpass: 5, street: 4, scenic: 3, residential: 2};
// How busy each class of road is (2026-10-02): cars per km at full density.
// The count around the player is capped by the road there (a canyon road
// above the city carries a car or two, a freeway a stream), and spawns pick
// roads in proportion, so the freeway is busy and Mulholland is quiet.
const PER_KM = {freeway: 34, boulevard: 22, avenue: 15, tunnel: 10, underpass: 8, street: 7, ramp: 6, residential: 2.2, scenic: 1.1};
const SPAWN_W = Object.fromEntries(Object.entries(PER_KM).map(([k, v]) => [k, v / PER_KM.freeway]));
const LIMIT = {freeway: 28, ramp: 17, boulevard: 17, avenue: 15.5, street: 13, residential: 10.5, underpass: 14, tunnel: 15, scenic: 12};

/* Paint: what LA drives (lots of white, black, silver and grey). */
export const PAINT = ['#f4f4f2', '#f4f4f2', '#eeeeea', '#16171a', '#16171a', '#1d1f22', '#a7abb0', '#a7abb0', '#6b6f75', '#50555c',
  '#1f3350', '#2d4f7c', '#7c1b1b', '#a3262a', '#c9b99a', '#2f4a3a', '#5a3b2a', '#8a8f6a', '#d9d4c6'];

/* ------------------------------------------------------------ the fleet
 * Each type: length L, width W, height H, wheel radius r, axle positions as
 * fractions of the length from the rear. Bodies are lofted in npcBody.js. */
export const TYPES = {
  sedan: {L: 4.8, W: 1.84, H: 1.45, r: .33, wb: [.19, .8], weight: 5},
  hatch: {L: 4.2, W: 1.78, H: 1.49, r: .31, wb: [.17, .82], weight: 3},
  suv: {L: 4.9, W: 1.95, H: 1.77, r: .38, wb: [.18, .8], weight: 4},
  pickup: {L: 5.6, W: 2.0, H: 1.9, r: .4, wb: [.17, .78], weight: 2},
  van: {L: 5.1, W: 1.98, H: 1.8, r: .35, wb: [.16, .8], weight: 2},
  taxi: {L: 4.8, W: 1.84, H: 1.45, r: .33, wb: [.19, .8], weight: 1.2, paint: '#f2c230', sign: '#f7f1d8'},
  police: {L: 4.95, W: 1.9, H: 1.47, r: .34, wb: [.19, .8], weight: .5, paint: '#101114', doors: '#f2f2ef', bar: true},
  truck: {L: 7.2, W: 2.35, H: 3.2, r: .45, wb: [.16, .82], weight: .9, box: '#e9e8e4'},
  bus: {L: 12, W: 2.55, H: 3.1, r: .5, wb: [.2, .8], weight: .6, paint: '#e6e2d8', stripe: '#c8492f'},
};

export class Traffic {
  constructor({scene, model, physics, seed = 7}) {
    this.scene = scene; this.model = model; this.physics = physics;
    this.seed = seed >>> 0 || 1; this.density = .5; this.cars = []; this.night = 0;
    this.ends = new Map();
    for (const seg of model.segments) for (const [node, atStart] of [[seg.a, true], [seg.b, false]]) {
      if (!this.ends.has(node)) this.ends.set(node, []);
      this.ends.get(node).push({seg, atStart});
    }
    this.drivable = model.segments.filter(s => DRIVE.has(s.kind) && s.L > 12);
    // Road capacity per 64 m cell (cars at full density), summed round the player.
    this.capGrid = new Map();
    for (const seg of this.drivable) for (let i = 0; i < seg.pts.length - 1; i++) {
      const a = seg.pts[i], b = seg.pts[i + 1], key = Math.floor((a.x + b.x) / 128) * 65536 + Math.floor((a.z + b.z) / 128);
      this.capGrid.set(key, (this.capGrid.get(key) || 0) + Math.hypot(b.x - a.x, b.z - a.z) / 1000 * PER_KM[seg.kind]);
    }
    this.types = Object.entries(TYPES).map(([name, t]) => ({name, t}));
    this.totalWeight = this.types.reduce((a, x) => a + x.t.weight, 0);
    this.buildMeshes();
    this.buildBodies();
    this.spawnTimer = 0; this.jmap = new Map(); this.clock = 0;
    this.buildSignals();
  }
  rand() { this.seed = (1664525 * this.seed + 1013904223) >>> 0; return this.seed / 4294967296; }
  get count() { return this.cars.length; }
  setDensity(d) { this.density = clamp(d, 0, 1); }
  /** Cars the roads within RANGE of (x, z) carry at full density (cached until you move 40 m). */
  capacity(x, z) {
    const c = this._cap;
    if (c && Math.hypot(x - c.x, z - c.z) < 40) return c.v;
    let v = 0; const r = Math.ceil(RANGE / 64), cx = Math.floor(x / 64), cz = Math.floor(z / 64);
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (i * i + j * j <= r * r) v += this.capGrid.get((cx + i) * 65536 + cz + j) || 0;
    this._cap = {x, z, v};
    return v;
  }

  /* ------------------------------------------------------------- meshes */
  buildMeshes() {
    const paint = new T.MeshStandardMaterial({vertexColors: true, roughness: .3, metalness: .5});
    const glass = new T.MeshStandardMaterial({color: '#0c1116', roughness: .05, metalness: .85});
    const trim = new T.MeshStandardMaterial({vertexColors: true, roughness: .6, metalness: .2});
    this.headMat = new T.MeshBasicMaterial({color: '#ffffff', toneMapped: false});
    this.tailMat = new T.MeshBasicMaterial({color: '#ffffff', toneMapped: false});
    this.meshes = {}; this.farMeshes = {};
    this.materials = {paint, glass, trim, head: this.headMat, tail: this.tailMat};
    // Two detail levels per type: the full body near the camera, a coarse
    // loft (about a quarter of the triangles) beyond NEAR metres.
    for (const {name, t} of this.types) for (const coarse of [false, true]) {
      const g = fleetGeometry(name, t, coarse), set = {};
      for (const [k, mat] of [['body', paint], ['glass', glass], ['trim', trim], ['head', this.headMat], ['tail', this.tailMat]]) {
        if (!g[k]) continue;
        const m = new T.InstancedMesh(g[k], mat, MAX);
        m.count = 0; m.frustumCulled = false; m.matrixAutoUpdate = false;
        m.castShadow = !coarse && (k === 'body' || k === 'trim'); m.receiveShadow = k !== 'head' && k !== 'tail';
        if (k === 'body' || k === 'head' || k === 'tail') m.instanceColor = new T.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
        this.scene.add(m); set[k] = m;
      }
      // One instance-matrix buffer per car type and LOD, shared by its body, glass, trim and lamps (perf
      // 2026-10-03): set once, uploaded once per frame instead of once per part.
      for (const k in set) if (k !== 'body') set[k].instanceMatrix = set.body.instanceMatrix;
      (coarse ? this.farMeshes : this.meshes)[name] = set;
    }
  }
  /* Traffic lights: a steel pole on the kerb with a mast arm reaching over
   * the lanes and a three-lamp head, per approach of each signalled junction
   * near the player. Instanced; lamp colours follow the phase every frame. */
  buildSignals() {
    const CAP = 220;
    const steel = new T.MeshStandardMaterial({color: '#5d6166', roughness: .5, metalness: .6});
    const pole = new T.CylinderGeometry(.13, .16, 6.2, 8); pole.translate(0, 3.1, 0);
    const mast = new T.CylinderGeometry(.08, .08, 1, 6); mast.rotateZ(Math.PI / 2); mast.translate(.5, 5.9, 0);    // unit length along local +x (over the lanes), scaled per arm
    this.sigPole = new T.InstancedMesh(pole, steel, CAP); this.sigMast = new T.InstancedMesh(mast, steel, CAP);
    const head = new T.BoxGeometry(.42, 1.2, .3); head.translate(0, 5.25, -.05);
    this.sigHead = new T.InstancedMesh(head, new T.MeshStandardMaterial({color: '#1d1e1f', roughness: .6}), CAP);
    const lamp = new T.CircleGeometry(.13, 10); lamp.rotateY(Math.PI); lamp.translate(0, 0, -.21);
    this.sigLamp = new T.InstancedMesh(lamp, new T.MeshBasicMaterial({color: '#ffffff', toneMapped: false}), CAP * 3);
    this.sigLamp.instanceColor = new T.InstancedBufferAttribute(new Float32Array(CAP * 9), 3);
    for (const m of [this.sigPole, this.sigMast, this.sigHead, this.sigLamp]) { m.count = 0; m.frustumCulled = false; m.castShadow = m !== this.sigLamp; this.scene.add(m); }
    this.sigCap = CAP; this.signals = []; this.sigRefresh = 0;
  }
  /** Which signal heads exist near the player (rebuilt every second). */
  placeSignals(px, pz) {
    const m4 = new T.Matrix4(), q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), P = new T.Vector3(), S = new T.Vector3(1, 1, 1);
    this.signals = [];
    for (const j of this.model.junctions) {
      if (j.cap || Math.abs(j.x - px) > 320 || Math.abs(j.z - pz) > 320) continue;
      const J = this.junction(j.node);
      if (!J.signal) continue;
      for (const arm of J.arms) {
        if (this.signals.length >= this.sigCap) break;
        const seg = arm.seg, dir = arm.atStart ? -1 : 1;
        const s = arm.atStart ? Math.min(seg.cut[0], seg.L * .5) : Math.max(seg.L - seg.cut[1], seg.L * .5);
        const sec = this.model.sectionAt(seg, s), kerb = sec.h + 1;
        const x = sec.x + sec.nx * kerb * dir, z = sec.z + sec.nz * kerb * dir, y = sec.y + (sec.cs || 0) * kerb * dir;
        this.signals.push({J, key: arm.key, x, y, z, yaw: Math.atan2(sec.tx * dir, sec.tz * dir), reach: Math.min(sec.h * .75, 7)});
      }
    }
    this.signals.forEach((g, i) => {
      q.setFromAxisAngle(up, g.yaw);
      m4.compose(P.set(g.x, g.y, g.z), q, S.set(1, 1, 1)); this.sigPole.setMatrixAt(i, m4);
      m4.compose(P.set(g.x, g.y, g.z), q, S.set(g.reach, 1, 1)); this.sigMast.setMatrixAt(i, m4);
      // The head hangs at the end of the mast, over the lanes, facing the traffic.
      // Local +x is -normal: from the kerb pole back over the carriageway.
      const hx = g.x + Math.cos(g.yaw) * g.reach, hz = g.z - Math.sin(g.yaw) * g.reach;
      m4.compose(P.set(hx, g.y, hz), q, S.set(1, 1, 1)); this.sigHead.setMatrixAt(i, m4);
      for (let k = 0; k < 3; k++) { m4.compose(P.set(hx, g.y + 5.65 - k * .38, hz), q, S.set(1, 1, 1)); this.sigLamp.setMatrixAt(i * 3 + k, m4); }
      g.hx = hx; g.hz = hz;
    });
    for (const m of [this.sigPole, this.sigMast, this.sigHead]) { m.count = this.signals.length; m.instanceMatrix.needsUpdate = true; }
    this.sigLamp.count = this.signals.length * 3; this.sigLamp.instanceMatrix.needsUpdate = true;
  }
  drawSignals() {
    const off = new T.Color(.05, .05, .05), k = 1.4 + this.night * 2.2;
    const R = new T.Color(1, .12, .08).multiplyScalar(k), A = new T.Color(1, .6, .08).multiplyScalar(k), G = new T.Color(.2, 1, .55).multiplyScalar(k);
    this.signals.forEach((g, i) => {
      const a = this.aspect(g.J, g.key);
      this.sigLamp.setColorAt(i * 3, a === 'R' ? R : off);
      this.sigLamp.setColorAt(i * 3 + 1, a === 'A' ? A : off);
      this.sigLamp.setColorAt(i * 3 + 2, a === 'G' ? G : off);
    });
    this.sigLamp.instanceColor.needsUpdate = true;
  }
  /* Kinematic hitboxes for the cars nearest the player. */
  buildBodies() {
    const R = this.physics.R, world = this.physics.world;
    this.bodies = [];
    for (let i = 0; i < 10; i++) {
      const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -500 - i * 10, 0));
      this.bodies.push({body, collider: null, owner: null, type: null});
    }
  }
  fitBody(slot, t) {
    if (slot.type === t) return;
    const R = this.physics.R, world = this.physics.world;
    if (slot.collider) world.removeCollider(slot.collider, false);
    // Smaller than the car: a near miss stays a near miss.
    const desc = R.ColliderDesc.cuboid(t.W / 2 - .14, (t.H - .3) / 2, t.L / 2 - .2)
      .setTranslation(0, .3 + (t.H - .3) / 2, 0).setFriction(.4).setRestitution(.1);
    slot.collider = world.createCollider(desc, slot.body);
    slot.type = t;
  }

  /* ------------------------------------------------------------ routing */
  /** Travel lanes each way: a two-lane street is one each way plus a
   *  parking lane at the kerb (parked.js), an avenue two, a boulevard three. */
  lanesPerSide(h, kind) {
    if (kind === 'freeway' && h >= 12) return 3;
    if (kind === 'freeway') kind = 'ramp';
    if (kind === 'ramp') return Math.max(1, Math.min(4, Math.floor(h / 3.3)));
    return h >= 15 ? 3 : h >= 10 ? 2 : 1;
  }
  laneOffset(car, h, kind) {
    // Freeways: three 3.6 m lanes each way, outside the median and its barrier.
    if (kind === 'freeway' && h >= 12) return h - 3 - (2.5 - Math.min(car.lane, 2)) * 3.6;
    if (kind === 'freeway') kind = 'ramp';                         // where a freeway runs on into its ramp
    const lanes = this.lanesPerSide(h, kind), k = Math.min(car.lane, lanes - 1);
    if (kind === 'ramp') return (k + .5) * (h / lanes) * .94;
    return (k + .5) * Math.min(3.5, h / lanes);
  }
  /** World pose on a road: lane centre, deck height (banked), tangent. */
  roadPose(seg, s, dir, lane) {
    const sec = this.model.sectionAt(seg, s), off = lane * dir;
    const tx = sec.tx * dir, tz = sec.tz * dir;
    return {x: sec.x + sec.nx * off, y: sec.y + (sec.cs || 0) * off, z: sec.z + sec.nz * off, tx, tz, h: sec.h};
  }
  entryS(seg, atStart) { return atStart ? Math.min(seg.cut[0], seg.L * .5) : Math.max(seg.L - seg.cut[1], seg.L * .5); }
  exitS(car) { const seg = car.seg; return car.dir > 0 ? Math.max(seg.L - seg.cut[1], seg.L * .5) : Math.min(seg.cut[0], seg.L * .5); }
  /** Choose the road after this one: mostly straight on, sometimes a turn, never a U-turn unless it is a dead end. */
  chooseNext(car) {
    const seg = car.seg, node = car.dir > 0 ? seg.b : seg.a;
    const here = this.model.sectionAt(seg, car.dir > 0 ? seg.L : 0), ix = here.tx * car.dir, iz = here.tz * car.dir;
    const opts = [];
    for (const o of this.ends.get(node) || []) {
      if (o.seg === seg || !DRIVE.has(o.seg.kind) || o.seg.L < 6) continue;
      const sec = this.model.sectionAt(o.seg, o.atStart ? Math.min(8, o.seg.L) : Math.max(0, o.seg.L - 8));
      const ox = sec.tx * (o.atStart ? 1 : -1), oz = sec.tz * (o.atStart ? 1 : -1);
      const turn = Math.acos(clamp(ix * ox + iz * oz, -1, 1));
      if (turn > 2.0) continue;
      // Stay on the freeway; leave it only now and then.
      const w = (1.2 + 2.5 * Math.cos(turn)) * (seg.kind === 'freeway' && o.seg.kind !== 'freeway' ? .25 : 1) * (o.seg.kind === 'residential' ? .5 : 1);
      opts.push({o, turn, w: Math.max(.05, w)});
    }
    if (!opts.length) return {seg, atStart: car.dir < 0, turn: Math.PI, uturn: true};
    let r = this.rand() * opts.reduce((a, c) => a + c.w, 0);
    for (const c of opts) if ((r -= c.w) <= 0) return {seg: c.o.seg, atStart: c.o.atStart, turn: c.turn};
    const c = opts[opts.length - 1]; return {seg: c.o.seg, atStart: c.o.atStart, turn: c.turn};
  }
  /** A smooth curve across the junction from this lane to the next road's lane. */
  startTurn(car) {
    const nx = car.next, a = this.roadPose(car.seg, car.s, car.dir, car.off);
    const dir = nx.atStart ? 1 : -1, s0 = this.entryS(nx.seg, nx.atStart), off = this.laneOffset(car, this.model.sectionAt(nx.seg, s0).h, nx.seg.kind);
    const b = this.roadPose(nx.seg, s0, dir, off);
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    if (d < .5) { this.enter(car, nx.seg, dir, s0, off); return; }
    const k = nx.uturn ? Math.max(6, d * .9) : d * .45;
    car.turn = {p: [[a.x, a.y, a.z], [a.x + a.tx * k, a.y, a.z + a.tz * k], [b.x - b.tx * k, b.y, b.z - b.tz * k], [b.x, b.y, b.z]], t: 0,
      len: d * (1 + (nx.turn || 0) * .25), seg: nx.seg, dir, s0, off};
    car.turnSpeed = 4 + 9 / ((nx.turn || 0) + .2);
  }
  enter(car, seg, dir, s, off) {
    car.seg = seg; car.dir = dir; car.s = s; car.off = off; car.turn = null;
    car.next = this.chooseNext(car);
    car.nextTurnSpeed = car.next.uturn ? 3 : 4 + 9 / ((car.next.turn || 0) + .2);
  }

  /* ------------------------------------------------------------ spawning */
  spawn(px, pz, cam) {
    for (let tries = 0; tries < 24; tries++) {
      const ang = this.rand() * Math.PI * 2, dist = SPAWN_MIN + this.rand() * (SPAWN_MAX - SPAWN_MIN);
      const x = px + Math.cos(ang) * dist, z = pz + Math.sin(ang) * dist;
      const r = this.model.nearest(x, z);
      if (!r || r.d > r.h + 2 || !DRIVE.has(r.seg.kind) || r.seg.L < 20) continue;
      if (this.rand() > SPAWN_W[r.seg.kind]) continue;               // busy roads get the cars
      const seg = r.seg, s = clamp(r.s, seg.cut[0] + 3, seg.L - seg.cut[1] - 3);
      if (seg.L - seg.cut[1] - seg.cut[0] < 10) continue;
      const sec = this.model.sectionAt(seg, s);
      // Out of sight: not in front of the camera within 260 m.
      // Out of sight: not in front of the camera and near (while first filling
      // the streets, far-off cars may appear in view: at 200 m they are specks).
      if (cam) {
        const vx = sec.x - cam.x, vz = sec.z - cam.z, vl = Math.hypot(vx, vz);
        if (vl < (this.filling ? 190 : 300) && (vx * cam.fx + vz * cam.fz) / vl > .4) continue;
      }
      if (this.cars.some(c => Math.hypot(c.x - sec.x, c.z - sec.z) < 18)) continue;
      let pick = this.rand() * this.totalWeight, type = this.types[0];
      for (const tp of this.types) if ((pick -= tp.t.weight) <= 0) { type = tp; break; }
      if ((type.name === 'bus' || type.name === 'truck') && (seg.kind === 'residential' || seg.kind === 'scenic')) type = this.types[0];
      const dir = this.rand() < .5 ? 1 : -1;
      const car = {id: this.nextId = (this.nextId || 0) + 1, type: type.name, t: type.t, lane: this.rand() < .6 ? 0 : 1,
        color: new T.Color(type.t.paint || PAINT[Math.floor(this.rand() * PAINT.length)]),
        pace: .85 + this.rand() * .3, v: 0, x: sec.x, y: sec.y, z: sec.z, hx: 0, hz: 1, brake: 0, stuck: 0, turn: null};
      this.enter(car, seg, dir, s, this.laneOffset(car, sec.h, seg.kind));
      car.v = Math.min(LIMIT[seg.kind] || 13, 12) * .8;
      this.pose(car);
      this.cars.push(car);
      return true;
    }
    return false;
  }

  /* -------------------------------------------------------------- update */
  /* ----------------------------------------------------------- junctions
   * Two major roads (avenue/boulevard) meeting: traffic lights, opposing arms
   * green together, 3 s amber, 2 s all-red to clear the box. A major road
   * meeting minor ones: the major road has priority, minor arms wait for the
   * box to be clear. Minor roads meeting: one approach in the box at a time.
   * Freeway merges are not controlled. */
  junction(node) {
    let J = this.jmap.get(node);
    if (J) return J;
    const ends = (this.ends.get(node) || []).filter(o => DRIVE.has(o.seg.kind));
    const arms = ends.map(o => {
      const seg = o.seg, sec = this.model.sectionAt(seg, o.atStart ? 0 : seg.L);
      // Heading INTO the junction along this arm.
      const inx = sec.tx * (o.atStart ? -1 : 1), inz = sec.tz * (o.atStart ? -1 : 1);
      return {key: seg.id * 2 + (o.atStart ? 0 : 1), seg, atStart: o.atStart, ang: Math.atan2(inx, inz), rank: RANK[seg.kind] ?? 1, kind: seg.kind};
    });
    const major = arms.filter(a => a.rank >= RANK.avenue).length;
    J = {node, arms, occ: new Map(), free: arms.length < 3 || arms.some(a => a.kind === 'freeway'),
      signal: arms.length >= 3 && major >= 2 && !arms.some(a => a.kind === 'freeway'), top: Math.max(0, ...arms.map(a => a.rank))};
    if (J.signal) {
      // Phases: each arm with the arm most nearly opposite it.
      const left = [...arms]; J.phases = [];
      while (left.length) {
        const a = left.shift(); let best = -1, bd = 0;
        left.forEach((b, k) => { const d = Math.abs(angleDelta(a.ang - b.ang)); if (d > 2.4 && d > bd) { bd = d; best = k; } });
        J.phases.push(best >= 0 ? [a.key, left.splice(best, 1)[0].key] : [a.key]);
      }
      J.offset = this.rand() * 60;
    }
    this.jmap.set(node, J);
    return J;
  }
  /** Signal aspect for an arm: 'G', 'A' (amber) or 'R'. */
  aspect(J, key) {
    if (!J.signal) return 'G';
    const G = 11, A = 3, R = 2, span = G + A + R, t = (this.clock + J.offset) % (J.phases.length * span);
    const k = Math.floor(t / span), w = t - k * span;
    if (!J.phases[k].includes(key)) return 'R';
    return w < G ? 'G' : w < G + A ? 'A' : 'R';
  }
  /** May this car enter the junction at the end of its road? Reserves it if so. */
  admit(car, left) {
    const node = car.dir > 0 ? car.seg.b : car.seg.a;
    if (car.admitted === node) return true;
    const J = this.junction(node);
    if (J.free) return true;
    const key = car.seg.id * 2 + (car.dir > 0 ? 1 : 0), arm = J.arms.find(a => a.key === key);
    const now = this.clock;
    for (const [id, o] of J.occ) if (now - o.t > 20) J.occ.delete(id);               // stale (despawned) entries
    let ok;
    if (J.signal) {
      const asp = this.aspect(J, key);
      ok = asp === 'G' || asp === 'A' && left < car.v * 1.1;                        // amber: go if too close to stop
    } else if (arm && arm.rank >= J.top && J.arms.some(a => a.rank < J.top)) ok = true;   // the priority road
    else {
      const others = [...J.occ.values()].filter(o => o.key !== key);
      ok = !others.length || car.waitJ > 12;
      car.waitJ = ok ? 0 : (car.waitJ || 0);
    }
    if (ok) { J.occ.set(car.id, {key, t: now}); car.admitted = node; }
    return ok;
  }
  release(car) {
    if (car.admitted == null) return;
    this.jmap.get(car.admitted)?.occ.delete(car.id);
    car.admitted = null;
  }

  /* -------------------------------------------------------------- update */
  update(dt, player, cam) {
    if (!dt) return;
    this.cam = cam;
    this.clock = (this.clock || 0) + dt;
    const want = Math.min(Math.round(MAX * this.density * this.density * .8 + MAX * this.density * .2),
      Math.max(this.density > 0 ? 2 : 0, Math.round(this.capacity(player.x, player.z) * this.density)));
    this.want = want;
    // Recycle far cars; top up a few per frame. Over the area's share (you
    // drove up into the hills) the extras go once they are out of sight.
    const keep = [];
    for (const c of this.cars) {
      const dx = c.x - player.x, dz = c.z - player.z, d = Math.hypot(dx, dz);
      const seen = cam && d < 260 && ((c.x - cam.x) * cam.fx + (c.z - cam.z) * cam.fz) / Math.max(1, Math.hypot(c.x - cam.x, c.z - cam.z)) > .3;
      if (d < RANGE && (keep.length < want || seen || c.loose)) keep.push(c); else this.release(c);
    }
    this.cars = keep;
    this.spawnTimer -= dt;
    this.filling = this.cars.length < want * .6;
    if (this.cars.length < want && this.spawnTimer <= 0) { for (let k = 0; k < 3 && this.cars.length < want; k++) this.spawn(player.x, player.z, cam); this.spawnTimer = .05; }
    const pfx = Math.sin(player.heading), pfz = Math.cos(player.heading), pvx = pfx * player.v, pvz = pfz * player.v;
    for (const car of this.cars) {
      // Hit by the player: shoved along with some of the player's momentum,
      // spinning, sliding to a stop; then it stays where it ends up.
      if (!car.loose) {
        const dx = player.x - car.x, dz = player.z - car.z;
        if (Math.abs(dx) < 9 && Math.abs(dz) < 9) {
          const al = dx * car.hx + dz * car.hz, la = dx * car.hz - dz * car.hx;
          const rel = Math.hypot(pvx - car.hx * car.v, pvz - car.hz * car.v);
          if (Math.abs(al) < car.t.L / 2 + 2.1 && Math.abs(la) < car.t.W / 2 + .95 && rel > 2.5) {
            const k = car.type === 'bus' || car.type === 'truck' ? .25 : .65;
            car.loose = {vx: pvx * k + car.hx * car.v * .5, vz: pvz * k + car.hz * car.v * .5, w: (la > 0 ? -1 : 1) * Math.min(3, rel * .09) * (al > 0 ? 1 : -1), t: 0};
            car.v = 0; car.brake = 1; this.release(car);
          }
        }
      }
      if (car.loose) {
        const L0 = car.loose, sp = Math.hypot(L0.vx, L0.vz), dec = Math.min(sp, 6 * dt);
        if (sp > 1e-3) { L0.vx -= L0.vx / sp * dec; L0.vz -= L0.vz / sp * dec; }
        L0.w *= Math.exp(-dt * 1.4); L0.t += dt;
        car.x += L0.vx * dt; car.z += L0.vz * dt;
        const yaw = Math.atan2(car.hx, car.hz) + L0.w * dt; car.hx = Math.sin(yaw); car.hz = Math.cos(yaw);
        const r = this.model.nearest(car.x, car.z, car.y);
        if (r && r.d < r.h + 3) car.y += (r.y - car.y) * Math.min(1, dt * 8);
        car.pitch = 0;
        continue;
      }
      // Who is in front: the nearest car (or the player) in this lane going
      // our way; the player (or a car) anywhere across our nose.
      let gap = 200, lead = 0, block = null;
      const fx = car.hx, fz = car.hz, rx = fz, rz = -fx;
      const check = (o, ox, oz, ohx, ohz, ov, len, isPlayer) => {
        const dx = ox - car.x, dz = oz - car.z, ahead = dx * fx + dz * fz;
        if (ahead <= 0 || ahead > 70) return;
        const lat = Math.abs(dx * rx + dz * rz), same = ohx * fx + ohz * fz;
        const room = ahead - (car.t.L + len) / 2 - 2.2;
        let hit;
        if (same > .5) hit = lat < 1.9;                                       // the car in front
        else if (isPlayer) hit = lat < 2.6 && ahead < 16 + car.v;             // the player pulling out
        else hit = same > -.7 && lat < 1.7 && ahead < (car.t.L + len) / 2 + 3;   // about to touch a crossing car
        if (hit && room < gap) { gap = room; lead = same > .5 ? ov * same : 0; block = isPlayer ? 'player' : o; }
      };
      for (const o of this.cars) if (o !== car && Math.abs(o.x - car.x) < 70 && Math.abs(o.z - car.z) < 70) check(o, o.x, o.z, o.hx, o.hz, o.v, o.t.L, false);
      check(null, player.x, player.z, pfx, pfz, Math.abs(player.v), 4.6, true);
      // Two cars nose to side: the older one goes.
      if (block && block !== 'player' && block.blockedBy === car && car.id < block.id) { gap = 200; lead = 0; }
      car.blockedBy = block === 'player' ? null : block;
      if (block && block !== 'player' && car.v < .3) car.stuck += dt; else car.stuck = 0;
      if (car.stuck > 4 && block.hx * fx + block.hz * fz < .7) { gap = 200; lead = 0; }   // a knot: creep through
      // Lane change round something slow or stopped on a two-lane side.
      if (!car.turn && block && gap < 25 && (block === 'player' ? Math.abs(player.v) < 2 : block.v < car.v * .5 + .5)) {
        car.wantLane = (car.wantLane || 0) + dt;
        if (car.wantLane > 1.5) {
          car.wantLane = 0;
          const h = this.model.sectionAt(car.seg, car.s).h, lanes = this.lanesPerSide(h, car.seg.kind);
          if (lanes > 1) {
            const lane = car.lane === 0 ? 1 : 0, off = this.laneOffset({lane}, h, car.seg.kind);
            const clear = this.cars.every(o => { if (o === car) return true; const dx = o.x - car.x, dz = o.z - car.z, al = dx * fx + dz * fz, la = (dx * rx + dz * rz) + (off - car.off);   // offsets run along the road normal, which is -right
              return Math.abs(la) > 1.8 || al < -14 || al > 12 || o.hx * fx + o.hz * fz < .5; });
            if (clear) car.lane = lane;
          }
        }
      } else car.wantLane = 0;
      // Desired speed: the road's limit, eased for bends, the coming turn, and
      // a stop line if the junction will not have us yet.
      const kind = car.turn ? car.turn.seg.kind : car.seg.kind;
      let v0 = (LIMIT[kind] || 13) * car.pace;
      if (car.turn) v0 = Math.min(v0, car.turnSpeed);
      else {
        const left = Math.abs(this.exitS(car) - car.s);
        if (left < 45) v0 = Math.min(v0, car.nextTurnSpeed + left * .3);
        if (left < 35 && !this.admit(car, left)) {
          if (left - 1.2 < gap) { gap = left - 1.2; lead = 0; }
          if (car.v < .3) car.waitJ = (car.waitJ || 0) + dt;
        }
      }
      // IDM.
      const a = 2.2, b = 3.2, s0 = 2.5, Th = 1.3, v = car.v;
      const sStar = s0 + Math.max(0, v * Th + v * (v - lead) / (2 * Math.sqrt(a * b)));
      let acc = a * (1 - Math.pow(v / Math.max(v0, .5), 4) - Math.pow(sStar / Math.max(gap, .3), 2));
      acc = clamp(acc, -8, a);
      car.brake = acc < -1 || car.v < .2 ? 1 : 0;
      car.v = Math.max(0, v + acc * dt);
      if (gap < .5) car.v = Math.min(car.v, Math.max(0, lead));
      if (!car.turn) {                                                // slide across to the chosen lane
        const h = this.model.sectionAt(car.seg, car.s).h, target = this.laneOffset(car, h, car.seg.kind);
        car.off += clamp(target - car.off, -dt * 1.6, dt * 1.6);
      }
      this.advance(car, car.v * dt);
      this.pose(car);
    }
    this.sync(player);
    this.draw();
    this.sigRefresh -= dt;
    if (this.sigRefresh <= 0) { this.placeSignals(player.x, player.z); this.sigRefresh = 1; }
    this.drawSignals();
  }
  advance(car, ds) {
    for (let guard = 0; guard < 4 && ds > 1e-4; guard++) {
      if (car.turn) {
        const T0 = car.turn, dt = ds / Math.max(T0.len, .5);
        if (T0.t + dt < 1) { T0.t += dt; return; }
        ds -= (1 - T0.t) * T0.len;
        this.release(car);
        this.enter(car, T0.seg, T0.dir, T0.s0, T0.off);
        continue;
      }
      const end = this.exitS(car), left = (end - car.s) * car.dir;
      if (ds < left) { car.s += ds * car.dir; return; }
      car.s = end; ds -= Math.max(0, left);
      this.startTurn(car);
    }
  }
  pose(car) {
    let x, y, z, hx, hz, pitch = 0;
    if (car.turn) {
      const [p0, p1, p2, p3] = car.turn.p, t = car.turn.t, u = 1 - t;
      const B = i => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i];
      const D = i => 3 * u * u * (p1[i] - p0[i]) + 6 * u * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i]);
      x = B(0); z = B(2); y = p0[1] + (p3[1] - p0[1]) * (t * t * (3 - 2 * t));
      const l = Math.hypot(D(0), D(2)) || 1; hx = D(0) / l; hz = D(2) / l;
    } else {
      const p = this.roadPose(car.seg, car.s, car.dir, car.off);
      x = p.x; y = p.y; z = p.z; hx = p.tx; hz = p.tz;
      const ahead = this.model.sectionAt(car.seg, car.s + 2 * car.dir), back = this.model.sectionAt(car.seg, car.s - 2 * car.dir);
      pitch = Math.atan2(ahead.y - back.y, 4);
    }
    car.x = x; car.y = y; car.z = z; car.hx = hx; car.hz = hz; car.pitch = pitch;
  }
  /** Kinematic hitboxes follow the nearest cars. */
  sync(player) {
    const near = this.cars.map(c => ({c, d: Math.hypot(c.x - player.x, c.z - player.z)})).filter(o => o.d < 45).sort((a, b) => a.d - b.d).slice(0, this.bodies.length).map(o => o.c);
    const q = new T.Quaternion(), e = new T.Euler();
    this.bodies.forEach((slot, i) => {
      const car = near[i];
      if (!car) { if (slot.owner) { slot.body.setNextKinematicTranslation({x: 0, y: -500 - i * 10, z: 0}); slot.owner = null; } return; }
      this.fitBody(slot, car.t);
      e.set(-car.pitch, Math.atan2(car.hx, car.hz), 0, 'YXZ'); q.setFromEuler(e);
      if (slot.owner !== car) slot.body.setTranslation({x: car.x, y: car.y, z: car.z}, true);
      slot.body.setNextKinematicTranslation({x: car.x, y: car.y, z: car.z});
      slot.body.setNextKinematicRotation({x: q.x, y: q.y, z: q.z, w: q.w});
      slot.owner = car;
    });
  }
  draw() {
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), p = new T.Vector3(), one = new T.Vector3(1, 1, 1);
    const counts = {};
    const night = this.night, head = new T.Color(1, .95, .85).multiplyScalar(.25 + night * 2.6);
    const tailDim = new T.Color(1, .035, .02).multiplyScalar(.14 + night * .75), tailHot = new T.Color(1, .05, .02).multiplyScalar(1.3 + night * 1.2);
    const cam = this.cam || {x: 0, z: 0};
    for (const car of this.cars) {
      const far = Math.hypot(car.x - cam.x, car.z - cam.z) > NEAR, key = (far ? 'f:' : 'n:') + car.type;
      const set = (far ? this.farMeshes : this.meshes)[car.type], i = counts[key] = (counts[key] || 0);
      counts[key]++;
      e.set(-car.pitch, Math.atan2(car.hx, car.hz), 0, 'YXZ'); q.setFromEuler(e); p.set(car.x, car.y + .02, car.z);
      m4.compose(p, q, one);
      set.body.setMatrixAt(i, m4);
      set.body.setColorAt(i, car.color);
      set.head?.setColorAt(i, car.type === 'police' ? head : head);
      set.tail?.setColorAt(i, car.brake ? tailHot : tailDim);
    }
    for (const {name} of this.types) for (const far of [false, true]) {
      const set = (far ? this.farMeshes : this.meshes)[name], n = counts[(far ? 'f:' : 'n:') + name] || 0;
      for (const k in set) set[k].count = n;
      // Upload only the slots in use (the buffers are sized for full density), and nothing for an empty type.
      if (n || set.body._n) upload(set, n);
      set.body._n = n;
    }
  }
  clear() { this.cars = []; this.draw(); }
}
