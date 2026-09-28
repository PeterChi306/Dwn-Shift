/* Physics world and the player's car (Rapier).
 *
 * The car is a Rapier ray-cast vehicle: four suspended wheels, lateral tyre
 * grip, a real chassis that pitches, rolls, climbs and hits things.
 *
 * game.js stays the authority on the DRIVETRAIN: engine, gearbox, clutch,
 * traction, drag and brakes all integrate into drive.state.v. Each frame the
 * change it made to that speed is applied to the chassis as a forward impulse,
 * physics runs (gravity on the grade, walls, kerbs, landings), and the speed
 * the chassis actually ends up with is written back. So the engine note drops
 * when you climb, and a wall stops the car AND the revs, without game.js
 * needing to know that roads have slopes or that buildings exist.
 */
import RAPIER from '../vendor/rapier/rapier.mjs';
import * as T from 'three';

export async function createPhysics() {
  await RAPIER.init();
  return new Physics(RAPIER);
}

export class Physics {
  constructor(R) {
    this.R = R;
    this.world = new R.World({x: 0, y: -9.81, z: 0});
    this.world.timestep = 1 / 120;
    // Rapier 0.21 rescans EVERY collider handle from JS after each step (a
    // soft-body hook) — thousands of wasm→JS calls, 40% of a frame. Nothing
    // here makes soft bodies, and createCollider/removeCollider keep the
    // handle map current themselves, so the rescan only ever finds nothing.
    this.world.mapNewSoftBodies = () => {};
    this.bodies = new Map();                // key -> collider[]
    this.tags = new Map();                  // collider handle -> surface ('grass', 'wood', ...), for footsteps
  }
  /** What a surface is made of, for footsteps: by the key it was stored under, or its own tag. */
  static surfaceOf(key, tag) {
    if (tag) return {grass: 'grass', wood: 'wood', fabric: 'fabric', metal: 'metal', rock: 'dirt'}[tag] || 'stone';
    return key[0] === 't' ? 'dirt' : key[0] === 'r' ? 'asphalt' : 'stone';
  }
  /** Static triangle mesh, replacing whatever was stored under `key`. */
  setMesh(key, vertices, indices, oriented = false) {
    this.remove(key);
    if (!indices.length) return;
    const R = this.R;
    const flags = oriented ? R.TriMeshFlags.FIX_INTERNAL_EDGES : (R.TriMeshFlags.MERGE_DUPLICATE_VERTICES | R.TriMeshFlags.DELETE_DEGENERATE_TRIANGLES);
    const desc = R.ColliderDesc.trimesh(vertices, indices, flags).setFriction(.9);
    const c = this.world.createCollider(desc);
    this.tags.set(c.handle, Physics.surfaceOf(key));
    this.bodies.set(key, [c]);
  }
  /** Static oriented boxes (buildings), stored under one key. */
  setBoxes(key, boxes) {
    this.remove(key);
    const R = this.R, list = [];
    for (const b of boxes) {
      const desc = R.ColliderDesc.cuboid(b.hx, b.hy, b.hz).setTranslation(b.x, b.y, b.z)
        .setRotation({x: 0, y: Math.sin(b.yaw / 2), z: 0, w: Math.cos(b.yaw / 2)}).setFriction(.3);
      const c = this.world.createCollider(desc);
      this.tags.set(c.handle, Physics.surfaceOf(key, b.tag));
      list.push(c);
    }
    this.bodies.set(key, list);
  }
  remove(key) {
    const list = this.bodies.get(key);
    if (!list) return;
    for (const c of list) { this.tags.delete(c.handle); this.world.removeCollider(c, false); }
    this.bodies.delete(key);
  }
  has(key) { return this.bodies.has(key); }
  /** Ray down from (x, y, z): the first surface's height, or null. */
  groundAt(x, y, z, reach = 200) {
    const ray = new this.R.Ray({x, y, z}, {x: 0, y: -1, z: 0});
    const hit = this.world.castRay(ray, reach, true);
    return hit ? y - hit.timeOfImpact : null;
  }
  /** Ray down from (x, y, z), skipping `exclude` (a collider): {y, surface} or null. */
  surfaceAt(x, y, z, reach = 3, exclude) {
    const ray = new this.R.Ray({x, y, z}, {x: 0, y: -1, z: 0});
    const hit = this.world.castRay(ray, reach, true, undefined, undefined, exclude);
    return hit ? {y: y - hit.timeOfImpact, surface: this.tags.get(hit.collider.handle) || 'stone'} : null;
  }
}

const FORWARD = new T.Vector3(), Q = new T.Quaternion(), V1 = new T.Vector3(), V2 = new T.Vector3(), V3 = new T.Vector3(), V4 = new T.Vector3(), W1 = new T.Vector3(), W2 = new T.Vector3();

export class Car {
  /** `wheels`: chassis-space wheel centres from the model, [{x,y,z,front}]. */
  constructor(physics, wheels, {mass = 1500, radius = .35} = {}) {
    const R = physics.R, world = physics.world;
    this.physics = physics; this.mass = mass; this.radius = radius;
    this.body = world.createRigidBody(R.RigidBodyDesc.dynamic().setCanSleep(false).setCcdEnabled(true)
      .setLinearDamping(.01).setAngularDamping(.4));
    const minX = Math.min(...wheels.map(w => w.x)), maxX = Math.max(...wheels.map(w => w.x));
    const minZ = Math.min(...wheels.map(w => w.z)), maxZ = Math.max(...wheels.map(w => w.z));
    const hw = (maxX - minX) / 2 + .12, hl = (maxZ - minZ) / 2 + .75;
    // Box: the cabin and body above the axles, not down to the road, so the
    // wheels (rays) do the touching and the body only meets walls and kerbs.
    const collider = R.ColliderDesc.cuboid(hw, .34, hl).setTranslation(0, radius + .42, (minZ + maxZ) / 2)
      .setFriction(.25).setRestitution(.05)
      // Centre of mass well below the axles: the classic arcade-stability
      // trick. A real car's roll moment is damped by tyres that slide first;
      // a ray-cast car grips to the limit and tips over in a hard turn instead.
      .setMassProperties(mass, {x: 0, y: .15, z: (minZ + maxZ) / 2},
        {x: mass / 12 * (1.3 ** 2 + (2 * hl) ** 2), y: mass / 12 * ((2 * hw) ** 2 + (2 * hl) ** 2), z: mass / 12 * ((2 * hw) ** 2 + 1.3 ** 2)},
        {w: 1, x: 0, y: 0, z: 0});
    world.createCollider(collider, this.body);

    const c = world.createVehicleController(this.body);
    c.indexUpAxis = 1;
    c.setIndexForwardAxis = 2;             // the binding's setter really is named this
    this.rest = .32;
    wheels.forEach((w, i) => {
      c.addWheel({x: w.x, y: w.y + this.rest, z: w.z}, {x: 0, y: -1, z: 0}, {x: -1, y: 0, z: 0}, this.rest, radius);
      c.setWheelSuspensionStiffness(i, 46);
      c.setWheelSuspensionCompression(i, 4);
      c.setWheelSuspensionRelaxation(i, 5);
      c.setWheelMaxSuspensionTravel(i, .22);
      c.setWheelMaxSuspensionForce(i, 1e5);
      // Lateral grip is ours (tyreForces): Rapier's side-friction constraint
      // grips like glue up to a limit and then lets go, with no slip angle
      // in between, which is why the car felt on rails and then understeered.
      c.setWheelFrictionSlip(i, 2.6);
      c.setWheelSideFrictionStiffness(i, 0);
    });
    this.controller = c;
    this.wheels = wheels;
    this.wheelbase = Math.max(2.2, maxZ - minZ);
    this.com = {x: 0, y: .15, z: (minZ + maxZ) / 2};
    this.Iyy = mass / 12 * ((2 * hw) ** 2 + (2 * hl) ** 2);
    // Stability assist, 0..1: a gentle yaw-rate pull toward what the front
    // wheels ask for (like ESC). The tyres do the work; this only tidies.
    this.yawAssist = .12;
    // Tyres: a simplified Pacejka "magic formula" per wheel,
    //   Fy = mu Fz sin(C atan(B alpha)),
    // peak near 9 degrees of slip, keeping ~85% of it when sliding, so the
    // car builds grip progressively, can be balanced on the throttle, and
    // lets go gradually instead of snapping.
    this.tyre = {B: 13, C: 1.38, muF: 1.05, muR: 1.12, roll: .1};   // mild understeer: the safe, road-car balance
    this.drive = 'rwd';            // which axle the drivetrain pushes: 'rwd' | 'awd' | 'fwd'
    this.handbrake = 0;
    this.slip = wheels.map(() => 0);            // per-wheel slip angle (rad), for effects/HUD
    this.rearSlip = 0; this.frontSlip = 0;
    this.lastDrive = 0;
    this.acc = 0;
  }

  place(x, y, z, heading) {
    this.body.setTranslation({x, y: y + .15, z}, true);
    Q.setFromAxisAngle(new T.Vector3(0, 1, 0), heading);
    this.body.setRotation({x: Q.x, y: Q.y, z: Q.z, w: Q.w}, true);
    this.body.setLinvel({x: 0, y: 0, z: 0}, true);
    this.body.setAngvel({x: 0, y: 0, z: 0}, true);
    this.lastDrive = 0;
  }

  forward(out = FORWARD) {
    const r = this.body.rotation();
    return out.set(0, 0, 1).applyQuaternion(Q.set(r.x, r.y, r.z, r.w));
  }
  get grounded() { let n = 0; for (let i = 0; i < this.wheels.length; i++) if (this.controller.wheelIsInContact(i)) n++; return n; }

  /** Advance by dt. `state` is game.js's drive state; its speed is read and written back. */
  step(dt, state, steer) {
    const c = this.controller, world = this.physics.world;
    this.wheels.forEach((w, i) => { if (w.front) c.setWheelSteering(i, steer); });
    // What the drivetrain did to the speed since we last wrote it.
    let dv = state.v - this.lastDrive;
    if (!Number.isFinite(dv)) dv = 0;
    // Parked or held on the brake at a standstill: hold the car on a hill too.
    const hold = Math.abs(state.v) < .05 && (state.brake > .1 || state.autoSel === 'P' || !state.engineOn && !state.powered);
    this.wheels.forEach((w, i) => c.setWheelBrake(i, hold ? 40 : 0));
    this.acc += dt;
    const steps = Math.min(8, Math.floor(this.acc / world.timestep));
    this.acc -= steps * world.timestep;
    if (steps > 4) this.acc = 0;
    for (let k = 0; k < steps; k++) {
      // Traction only through tyres that touch something.
      const grip = this.grounded / this.wheels.length;
      if (grip > 0 && dv) {
        const f = this.forward(), share = dv / steps * grip;
        this.body.applyImpulse({x: f.x * share * this.mass, y: f.y * share * this.mass, z: f.z * share * this.mass}, true);
      }
      c.updateVehicle(world.timestep);
      this.tyreForces(steer, world.timestep, dv / Math.max(dt, 1e-3), state);
      if (this.yawAssist && this.grounded >= 3) this.assistYaw(steer, world.timestep);
      world.step();
    }
    const v = this.body.linvel(), f = this.forward();
    const along = v.x * f.x + v.y * f.y + v.z * f.z;
    if (steps) { state.v = along; this.lastDrive = along; }
    return along;
  }

  /** Lateral tyre forces, applied at each contact patch every physics step.
   *  Loads come from the suspension, so weight transfer (braking loads the
   *  front, a corner loads the outside) changes grip the way it should.
   *  `accel` is the drivetrain's longitudinal acceleration this frame: it
   *  uses up the driven tyres' friction circle (power oversteer in a rear-
   *  driver, heavier front push in a front-driver). */
  tyreForces(steer, dt, accel, state) {
    const c = this.controller, body = this.body, r = body.rotation(), q = Q.set(r.x, r.y, r.z, r.w);
    const up = V1.set(0, 1, 0).applyQuaternion(q), fwd = V2.set(0, 0, 1).applyQuaternion(q);
    const t = body.translation(), lv = body.linvel(), av = body.angvel();
    const com = V3.set(this.com.x, this.com.y, this.com.z).applyQuaternion(q).add(V4.set(t.x, t.y, t.z));
    const {B, C, muF, muR} = this.tyre, n = this.wheels.length;
    const braking = state.brake > .05 || state.in?.brake > .05;
    let rear = 0, nrear = 0;
    this.wheels.forEach((w, i) => {
      if (!c.wheelIsInContact(i)) { this.slip[i] = 0; return; }
      const p = c.wheelContactPoint(i), Fz = Math.max(0, c.wheelSuspensionForce(i) ?? 0);
      if (!p || !Fz) return;
      // Wheel heading: the body's forward, turned by the steering on the front axle.
      const d = W1.copy(fwd); if (w.front && steer) d.applyAxisAngle(up, steer);
      const lat = W2.crossVectors(up, d).normalize();      // left of the wheel
      // Contact-patch velocity: v + omega x (p - com).
      const rx = p.x - com.x, ry = p.y - com.y, rz = p.z - com.z;
      const vx = lv.x + av.y * rz - av.z * ry, vy = lv.y + av.z * rx - av.x * rz, vz = lv.z + av.x * ry - av.y * rx;
      const vLong = vx * d.x + vy * d.y + vz * d.z, vLat = vx * lat.x + vy * lat.y + vz * lat.z;
      const alpha = Math.atan2(vLat, Math.max(Math.abs(vLong), 2.5));
      this.slip[i] = alpha;
      let mu = w.front ? muF : muR;
      if (!w.front && this.handbrake) mu *= .42;          // locked rears: a slide, on purpose
      const peak = mu * Fz;
      // The driven wheels spend some of their circle on traction (or all
      // four on braking), and have that much less to give sideways.
      const driven = this.drive === 'awd' || (this.drive === 'fwd') === w.front;
      const perAxle = n / 2;                                 // wheels per axle
      const share = braking || accel < 0 ? (w.front ? .6 : .4) / perAxle
        : driven ? (this.drive === 'awd' ? .5 : 1) / perAxle : 0;
      // Traction control: the drivetrain may use at most 70% of the circle,
      // so a tyre under full power keeps ~70% of its cornering grip. Without
      // this a launch left the rears ~20% and any yaw at all became a spin.
      const Fx = Math.min(Math.abs(accel) * this.mass * share, peak * .7);
      const avail = Math.sqrt(peak * peak - Fx * Fx);
      let Fy = -avail * Math.sin(C * Math.atan(B * alpha));
      // Never more than stops this patch's sideways slide within the step
      // (the tyre cannot push the car the other way): keeps it stable at a
      // standstill and at low speed.
      const arm = rz * fwd.z + rx * fwd.x, meff = 1 / (1 / this.mass + arm * arm / this.Iyy) / 2;
      const stop = Math.abs(vLat) * meff / dt;
      Fy = Math.max(-stop, Math.min(stop, Fy));
      // Applied at a point lifted toward the centre of mass ('roll influence',
      // as in Bullet's vehicle): full height would roll a car with no anti-
      // roll bars onto its side long before its tyres gave up.
      const lift = (com.x - p.x) * up.x + (com.y - p.y) * up.y + (com.z - p.z) * up.z, k = 1 - this.tyre.roll;
      const at = {x: p.x + up.x * lift * k, y: p.y + up.y * lift * k, z: p.z + up.z * lift * k};
      body.applyImpulseAtPoint({x: lat.x * Fy * dt, y: lat.y * Fy * dt, z: lat.z * Fy * dt}, at, true);
      if (!w.front) { rear += alpha; nrear++; }
    });
    this.rearSlip = nrear ? rear / nrear : 0;
    const fr = this.wheels.map((w, i) => w.front ? this.slip[i] : null).filter(v => v !== null);
    this.frontSlip = fr.length ? fr.reduce((a, b) => a + b, 0) / fr.length : 0;
  }

  /** Stability assist: a light pull of the yaw rate toward what the steering
   *  asks for, within what the tyres could hold. 0 = off. */
  assistYaw(steer, dt) {
    const v = this.body.linvel(), f = this.forward();
    const along = v.x * f.x + v.y * f.y + v.z * f.z;
    if (Math.abs(along) < 3) return;
    let target = along * Math.tan(steer) / this.wheelbase;
    const cap = 11 / Math.abs(along);
    target = Math.max(-cap, Math.min(cap, target));
    const r = this.body.rotation(), up = V1.set(0, 1, 0).applyQuaternion(Q.set(r.x, r.y, r.z, r.w));
    const w = this.body.angvel(), yaw = w.x * up.x + w.y * up.y + w.z * up.z;
    // ESC: once the rear steps out (rear slip past ~3 degrees and more than
    // the front's) the pull gets much firmer, like a stability program
    // braking one wheel. It stays out of the way while the car is tidy.
    const over = Math.abs(this.rearSlip) - Math.abs(this.frontSlip);
    const esc = Math.max(0, Math.min(1, (Math.abs(this.rearSlip) - .05) / .08)) * (over > 0 ? 1 : .3) * (this.handbrake ? 0 : 1);   // a handbrake slide is on purpose
    const k = Math.min(1, (this.yawAssist * 6 + esc * 7 * Math.min(1, this.yawAssist * 4 + .4)) * dt), d = (target - yaw) * k;
    this.body.setAngvel({x: w.x + up.x * d, y: w.y + up.y * d, z: w.z + up.z * d}, true);
  }

  get position() { return this.body.translation(); }
  get rotation() { return this.body.rotation(); }
  get heading() { const f = this.forward(); return Math.atan2(f.x, f.z); }
  wheelState(i) {
    return {contact: this.controller.wheelIsInContact(i), length: this.controller.wheelSuspensionLength(i) ?? this.rest,
      rotation: this.controller.wheelRotation(i) ?? 0, steering: this.controller.wheelSteering(i) ?? 0};
  }
}
