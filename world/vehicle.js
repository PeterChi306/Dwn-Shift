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

/* Handling modes (2026-10-01): the tyres' shape and how much the electronics
 * hold the car. The old model let full throttle take 30% of the rear tyres'
 * sideways grip at any speed, so a small steering tap at 150 km/h under power
 * left the car 40 degrees off line; and the steering lock was capped so close
 * to the kinematic angle that the fronts never reached their own peak, which
 * is why it "barely turned". Measured in tools/handling-lab.mjs.
 *
 *   mu*      peak friction (x load), front / rear
 *   peak*    slip angle (rad) where that peak is reached
 *   slide*   share of the peak a fully sliding tyre keeps (what holds a drift)
 *   esc      how firmly the stability program pulls the yaw toward the steering
 *   tc       traction control: cornering grip comes first, power is cut to fit
 *            (null = follow the drivetrain's own TC switch)
 *   hand     rear grip left with the handbrake up
 *   spinFloor the share of sideways grip a spinning rear tyre still has */
export const HANDLING = {
  grip:  {label: 'Grip',       muF: 1.32, muR: 1.42, peakF: .115, peakR: .095, slideF: .86, slideR: .82, esc: 1,   tc: null,  hand: .40, spinFloor: .52, driftAssist: .7},
  drift: {label: 'Drift',      muF: 1.28, muR: 1.3,  peakF: .12,  peakR: .085, slideF: .92, slideR: .9,  esc: .15, tc: false, hand: .34, spinFloor: .58, driftAssist: 1, drift: true},
  sim:   {label: 'Simulation', muF: 1.12, muR: 1.18, peakF: .1,   peakR: .09,  slideF: .8,  slideR: .74, esc: .3,  tc: null,  hand: .45, spinFloor: .4,  driftAssist: .3},
};

/** Normalised tyre curve: rises to 1 at `peak`, then eases to `slide` as it lets go. Signed. */
export function tyreCurve(a, peak, slide) {
  const x = Math.abs(a) / peak;
  const f = x <= 1 ? x * (2 - x) : 1 - (1 - slide) * (1 - Math.exp(-(x - 1) * 1.3));
  return Math.sign(a) * f;
}

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
    // Centre of mass low, about at the hubs: the arcade-stability trick (a
    // ray-cast car grips to the limit and would tip over instead of sliding).
    // NB Rapier reads a collider's mass centre in the COLLIDER's frame: until
    // 2026-10-01 this was given in the body's frame, which put the centre of
    // mass 0.88 m up instead of 0.15 — every hard turn lifted the inside
    // wheels and the car lost half its tyres. Hence "turn a bit and it spins".
    const comY = .3, colY = radius + .42;
    const collider = R.ColliderDesc.cuboid(hw, .34, hl).setTranslation(0, colY, (minZ + maxZ) / 2)
      .setFriction(.25).setRestitution(.05)
      .setMassProperties(mass, {x: 0, y: comY - colY, z: 0},
        {x: mass / 12 * (1.3 ** 2 + (2 * hl) ** 2), y: mass / 12 * ((2 * hw) ** 2 + (2 * hl) ** 2), z: mass / 12 * ((2 * hw) ** 2 + 1.3 ** 2)},
        {w: 1, x: 0, y: 0, z: 0});
    this.collider = world.createCollider(collider, this.body);

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
      // Both tyre directions are ours (tyreForces): Rapier's side-friction
      // constraint grips like glue up to a limit and then lets go.
      c.setWheelFrictionSlip(i, 2.6);
      c.setWheelSideFrictionStiffness(i, 0);
    });
    this.controller = c;
    this.wheels = wheels;
    this.wheelbase = Math.max(2.2, maxZ - minZ);
    this.com = {x: 0, y: comY, z: (minZ + maxZ) / 2};
    this.Iyy = mass / 12 * ((2 * hw) ** 2 + (2 * hl) ** 2);
    this.yawAssist = .5;           // the stability slider, 0..1: scales the mode's ESC
    this.setMode('grip');
    this.drive = 'rwd';            // which axle the drivetrain pushes: 'rwd' | 'awd' | 'fwd'
    this.tc = true;                // the drivetrain's own TC switch (used when the mode says null)
    this.handbrake = 0;
    this.intent = 0;               // the driver's shaped steering input, -1..1 (left +)
    this.slip = wheels.map(() => 0);            // per-wheel slip angle (rad)
    this.skid = wheels.map(() => 0);            // per-wheel 0..~1.5: how hard each tyre is sliding/spinning (smoke, squeal)
    this.rearSlip = 0; this.frontSlip = 0;
    this.beta = 0;                 // body slip angle (rad): + = travelling to the car's left
    this.frontCourse = 0;          // front axle's direction of travel relative to the nose (rad)
    this.drifting = 0;             // 0..1, eased: the car is in a held slide
    this.driveRatio = 1;           // share of the drivetrain's push the tyres could take this step
    this.rearUse = 0;
    this.lastDrive = 0;
    this.acc = 0;
    this.handT = 0;                // seconds since the handbrake was last up
  }

  setMode(id) { this.modeId = HANDLING[id] ? id : 'grip'; this.mode = HANDLING[this.modeId]; }
  get peakF() { return this.mode.peakF; }

  place(x, y, z, heading) {
    this.body.setTranslation({x, y: y + .15, z}, true);
    Q.setFromAxisAngle(new T.Vector3(0, 1, 0), heading);
    this.body.setRotation({x: Q.x, y: Q.y, z: Q.z, w: Q.w}, true);
    this.body.setLinvel({x: 0, y: 0, z: 0}, true);
    this.body.setAngvel({x: 0, y: 0, z: 0}, true);
    this.lastDrive = 0; this.drifting = 0; this._lv = null; this.latAcc = 0;
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
    this.handT = this.handbrake ? 0 : this.handT + dt;
    this.throttle = state.throttle ?? state.in?.gas ?? 0;
    this.acc += dt;
    const steps = Math.min(8, Math.floor(this.acc / world.timestep));
    this.acc -= steps * world.timestep;
    if (steps > 4) this.acc = 0;
    const accel = dv / Math.max(dt, 1e-3);
    let ratioSum = 0;
    for (let k = 0; k < steps; k++) {
      c.updateVehicle(world.timestep);
      this.tyreForces(steer, world.timestep, accel, state);
      // Traction only through tyres that touch something, and only as much
      // as they could take (the rest went into wheelspin or a TC cut).
      const grip = this.grounded / this.wheels.length;
      if (grip > 0 && dv) {
        const f = this.forward(), share = dv / steps * grip * (dv > 0 ? this.driveRatio : 1);
        this.body.applyImpulse({x: f.x * share * this.mass, y: f.y * share * this.mass, z: f.z * share * this.mass}, true);
      }
      ratioSum += this.driveRatio;
      if (this.grounded >= 3) this.assistYaw(steer, world.timestep);
      world.step();
    }
    this.driveRatio = steps ? ratioSum / steps : 1;
    const v = this.body.linvel(), f = this.forward();
    const along = v.x * f.x + v.y * f.y + v.z * f.z;
    if (steps) { state.v = along; this.lastDrive = along; }
    // The body's slip angle, and where the front axle is actually heading.
    const r = this.body.rotation(), q = Q.set(r.x, r.y, r.z, r.w), left = V1.set(1, 0, 0).applyQuaternion(q);
    const lat = v.x * left.x + v.y * left.y + v.z * left.z, sp = Math.hypot(along, lat);
    const yaw = this.body.angvel().y, a = this.wheels.find(w => w.front)?.z - this.com.z || 1.4;
    this.beta = sp > 1.5 ? Math.atan2(lat, Math.abs(along)) : 0;
    this.frontCourse = sp > 1.5 && along > 0 ? Math.atan2(lat + yaw * a, along) : 0;
    // Sideways acceleration (for the drift assist's sense of the curve).
    if (this._lv) { const ax = (v.x - this._lv.x) / Math.max(dt, 1e-3), az = (v.z - this._lv.z) / Math.max(dt, 1e-3); const la = ax * left.x + az * left.z; this.latAcc = (this.latAcc || 0) + (la - (this.latAcc || 0)) * Math.min(1, dt * 8); }
    this._lv = {x: v.x, z: v.z};
    const want = Math.abs(this.beta) > .14 && sp > 6 ? 1 : 0;
    this.drifting += (want - this.drifting) * Math.min(1, dt * (want ? 3 : 1.5));
    return along;
  }

  /** Tyre forces at each contact patch, every physics step. Loads come from
   *  the suspension, so weight transfer changes grip the way it should.
   *  Sideways: the tyre curve on the slip angle. Lengthways: the drivetrain's
   *  push (`accel`) shares each driven tyre's friction circle with cornering;
   *  with TC the cornering wins and the push is cut, without it the push wins
   *  and the rear lets go (power oversteer), and more than the tyre can take
   *  is wheelspin. */
  tyreForces(steer, dt, accel, state) {
    const c = this.controller, body = this.body, r = body.rotation(), q = Q.set(r.x, r.y, r.z, r.w);
    const up = V1.set(0, 1, 0).applyQuaternion(q), fwd = V2.set(0, 0, 1).applyQuaternion(q);
    const t = body.translation(), lv = body.linvel(), av = body.angvel();
    const com = V3.set(this.com.x, this.com.y, this.com.z).applyQuaternion(q).add(V4.set(t.x, t.y, t.z));
    const M = this.mode, n = this.wheels.length, perAxle = n / 2, Fz0 = this.mass * 9.81 / n;
    const tc = M.tc === null ? this.tc : M.tc;
    const braking = (state.brake > .05 || state.in?.brake > .05) && accel < 0;
    const spinning = (state.spinV || 0) > 1.2;
    // Downforce from the workshop's aero (carParts.js `aero`, 0..1): up to 12% more grip, growing with speed squared.
    const aeroK = 1 + (this.aero || 0) * .12 * Math.min(1, (lv.x * lv.x + lv.z * lv.z) / 2500);
    let rear = 0, nrear = 0, want = 0, got = 0, use = 0;
    this.wheels.forEach((w, i) => {
      this.skid[i] = 0;
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
      // Load sensitivity: a heavily loaded tyre grips less per newton, which
      // is what makes weight transfer cost the outside pair a little.
      const load = Math.min(1.08, Math.max(.82, 1 - .09 * (Fz / Fz0 - 1)));
      let mu = (w.front ? M.muF : M.muR) * load * aeroK;
      const hand = !w.front && this.handbrake;
      if (hand) mu *= M.hand;                              // locked rears: a slide, on purpose
      const peak = mu * Fz;
      let Fy = -peak * tyreCurve(alpha, w.front ? M.peakF : M.peakR, w.front ? M.slideF : M.slideR);
      // Lengthways: what the drivetrain or the brakes ask of this tyre.
      const driven = this.drive === 'awd' || (this.drive === 'fwd') === w.front;
      let demand = 0;
      if (braking) demand = -accel * this.mass * (w.front ? .62 : .38) / perAxle;
      else if (accel > 0 && driven) demand = accel * this.mass * (this.drive === 'awd' ? (w.front ? .4 : .6) : 1) / perAxle;
      let skid = Math.max(0, Math.abs(alpha) / (w.front ? M.peakF : M.peakR) - .85);
      if (demand > 0) {
        if (braking) {
          // ABS keeps the tyre near its peak; what braking uses, cornering loses.
          const u = Math.min(.96, demand / peak);
          Fy *= Math.sqrt(1 - u * u);
        } else if (tc) {
          // Cornering first: the push is trimmed by the share of the circle
          // cornering is using. (Straight-line traction stays the
          // drivetrain's: cutting the push by demand/peak at a launch made
          // game.js's clutch read the missing speed as load and bog the engine.)
          const room = Math.sqrt(Math.max(0, peak * peak - Fy * Fy)) / peak;
          want += 1; got += Math.max(.25, room);
        } else {
          // The push first. Past the peak the tyre spins and keeps only a
          // floor of its sideways grip, which is the rear stepping out.
          let u = demand / peak; if (spinning && !w.front) u = Math.max(u, 1.05);
          use = Math.max(use, u);
          Fy *= u < 1 ? Math.max(M.spinFloor, Math.sqrt(1 - u * u)) : M.spinFloor * Math.max(.6, 1 - (u - 1) * .25);
          want += 1; got += 1;
          skid += Math.max(0, u - .9) * 1.5;
        }
      }
      if (hand) {
        // Locked: the tyre drags along its own length too.
        const drag = Math.min(Math.abs(vLong) * this.mass / n / dt * .5, peak * .55) * Math.sign(vLong);
        body.applyImpulseAtPoint({x: -d.x * drag * dt, y: -d.y * drag * dt, z: -d.z * drag * dt}, p, true);
        if (Math.abs(vLong) > 2) skid += .7;
      }
      // Never more than stops this patch's sideways slide within the step
      // (the tyre cannot push the car the other way): keeps it stable at a
      // standstill and at low speed.
      const arm = rz * fwd.z + rx * fwd.x, meff = 1 / (1 / this.mass + arm * arm / this.Iyy) / 2;
      const stop = Math.abs(vLat) * meff / dt;
      Fy = Math.max(-stop, Math.min(stop, Fy));
      // Applied at a point lifted toward the centre of mass ('roll influence',
      // as in Bullet's vehicle): full height would roll a car with no anti-
      // roll bars onto its side long before its tyres gave up.
      const lift = (com.x - p.x) * up.x + (com.y - p.y) * up.y + (com.z - p.z) * up.z, k = .45;
      const at = {x: p.x + up.x * lift * k, y: p.y + up.y * lift * k, z: p.z + up.z * lift * k};
      body.applyImpulseAtPoint({x: lat.x * Fy * dt, y: lat.y * Fy * dt, z: lat.z * Fy * dt}, at, true);
      this.skid[i] = Math.min(1.5, skid * Math.max(0, Math.min(1, (Math.hypot(vLong, vLat) - 3) / 5)));
      if (!w.front) { rear += alpha; nrear++; }
    });
    this.driveRatio = want > 0 ? got / want : 1;
    this.rearUse = use;              // TC off: how far past its grip the driven tyre is pushed (>1 = wheelspin)
    this.rearSlip = nrear ? rear / nrear : 0;
    let fs = 0, nf = 0; this.wheels.forEach((w, i) => { if (w.front) { fs += this.slip[i]; nf++; } });
    this.frontSlip = nf ? fs / nf : 0;
  }

  /** Stability: pulls the yaw rate toward what the driver's input asks of the
   *  tyres (ESC), firmly once the rear steps out past what the steering wants.
   *  It stands back while the car is held in a slide on purpose (handbrake,
   *  drift mode, or traction control off with the throttle in). In drift mode
   *  it only catches a car that has gone past ~60 degrees. */
  assistYaw(steer, dt) {
    const v = this.body.linvel(), f = this.forward();
    const along = v.x * f.x + v.y * f.y + v.z * f.z;
    if (along < 3) return;
    const M = this.mode, r = this.body.rotation(), up = V1.set(0, 1, 0).applyQuaternion(Q.set(r.x, r.y, r.z, r.w));
    const w = this.body.angvel(), yaw = w.x * up.x + w.y * up.y + w.z * up.z;
    const beta = this.beta, assist = this.yawAssist * 2;   // slider .5 = the mode's own strength
    // A slide the driver asked for: the handbrake (and a moment after it),
    // a drift mode, or the rear spun up with nothing to stop it.
    const tc = M.tc === null ? this.tc : M.tc;
    const meant = Math.max(this.handbrake ? 1 : Math.max(0, 1 - this.handT / 1.4), M.drift ? 1 : 0, !tc && this.rearUse > .95 ? .8 : 0);
    let d = 0;
    if (M.esc > 0) {
      const ay = 9.81 * M.muF;
      let target = tyreCurve(this.intent, 1, 1) * ay / along;
      const cap = along * Math.tan(.58) / this.wheelbase; target = Math.max(-cap, Math.min(cap, target));
      const out = Math.max(0, Math.abs(beta) - .06) / .12;              // body slip past ~3.5 degrees
      const k = M.esc * assist * (2.2 + Math.min(1.5, out) * 9) * (1 - meant * .85);
      d = (target - yaw) * Math.min(1, k * dt);
    }
    // Drift assist: once the car is properly sideways, the driver's hands
    // and right foot set the ANGLE of the slide rather than the yaw rate —
    // steering into the corner and throttle open it up, countersteer or a
    // lift close it, hands off and a lift straightens the car out. That is
    // what makes a slide holdable on keys instead of a coin toss.
    const da = M.driftAssist * Math.min(1, this.yawAssist * 2 + .25);
    if (da > 0 && Math.abs(beta) > .1 && along > 4) {
      const turn = -Math.sign(beta);                         // the way the car is turning (left +)
      const into = this.intent * turn, gas = this.throttle;
      let want = .3 + .32 * into + .3 * (gas - .45);
      if (Math.abs(this.intent) < .12 && gas < .2) want = 0;  // let go: straighten up
      want = Math.max(0, Math.min(.85, want));
      const vel = this.body.linvel(), sp = Math.hypot(vel.x, vel.z);
      const path = (this.latAcc || 0) / Math.max(sp, 4);    // the yaw rate that just follows the curve
      const target = turn * (Math.abs(path) + 2.6 * Math.max(-.28, Math.min(.35, want - Math.abs(beta))));
      d += (target - yaw) * Math.min(1, da * 5 * dt);
    }
    // The spin guard: past ~60-70 degrees the nose comes back.
    const over = Math.abs(beta) - (M.drift ? 1.0 : 1.2);
    if (over > 0) d += Math.sign(beta) * Math.min(1, over * 4) * 3 * dt * Math.min(1, along / 8) * assist;
    if (d) this.body.setAngvel({x: w.x + up.x * d, y: w.y + up.y * d, z: w.z + up.z * d}, true);
  }

  get position() { return this.body.translation(); }
  get rotation() { return this.body.rotation(); }
  get heading() { const f = this.forward(); return Math.atan2(f.x, f.z); }
  wheelState(i) {
    return {contact: this.controller.wheelIsInContact(i), length: this.controller.wheelSuspensionLength(i) ?? this.rest,
      rotation: this.controller.wheelRotation(i) ?? 0, steering: this.controller.wheelSteering(i) ?? 0};
  }
}
