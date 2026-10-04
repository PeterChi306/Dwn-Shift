/* The player car's details (2026-09-27): tyre smoke, exhaust fire, turn
 * signals and the cabin's moving parts.
 *
 *   smoke    instanced sprites off each tyre that is sliding (lateral slip
 *            past the peak), spinning (game.js S.spinV: burnouts, launches)
 *            or locked (S.lockup); they grow, drift with the car's wake and
 *            fade, lit by the sky so they are grey at night, not glowing.
 *   fire     game.js popFlame() calls DwnDrive.onFlame(power, kind): the
 *            same overrun bangs you hear shoot a flame jet out of every
 *            tailpipe (2026-10-03: a shaped, flickering cone per pipe, a
 *            blue-white core at the nozzle burning out to orange and red,
 *            aimed the way the pipe points), embers, and a short orange light.
 *   signals  amber lamps at the four corners and on the mirrors, blinking at
 *            1.5 Hz with a relay tick; they cancel themselves once a turn in
 *            their direction has been made, like a real stalk.
 *   cabin    the model's interior (carModels.js): the wheel turns with the
 *            steering, the cluster shows the live tach, the ambient light
 *            rises at night.
 */
import * as T from 'three';
import {Cluster, GScreen} from './carCluster.js';
import {doorPose} from './cars/auroraGlb.js';
import {instancedDynamicBufferAttribute, uv, vec3, vec4, float, smoothstep, mix, uniform, sin, time, attribute, step, abs, max, length, positionView, cameraWorldMatrix, positionLocal, normalView, positionViewDirection, mx_noise_float, pow} from 'three/tsl';

const SMOKE = 700, FIRE = 160;

/** The flame jet's shape: a cone along +z from the nozzle (z 0) to its tip (z 1), radius 1 at its
 *  widest, swelling just past the nozzle and burning down to a point. */
const FLAME_GEO = (() => {
  const pts = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28, r = (.62 + .38 * Math.min(1, t / .16)) * Math.pow(1 - t, .62) * (1 + .18 * Math.sin(Math.PI * Math.min(1, t * 1.7)));
    pts.push(new T.Vector2(Math.max(r, 1e-3) * .9, t));
  }
  const g = new T.LatheGeometry(pts, 20); g.rotateX(Math.PI / 2);
  return g;
})();
function flameMaterial() {
  const k = uniform(0), heat = uniform(0), seed = uniform(0);
  const m = new T.MeshBasicNodeMaterial({transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide});
  const P = positionLocal, t = P.z;
  // Turbulence rolling down the jet; the silhouette fades so the cone reads as a volume, not a shell.
  const n = mx_noise_float(vec3(P.x.mul(2.4), P.y.mul(2.4), t.mul(5).sub(time.mul(16)).add(seed)));
  const n2 = mx_noise_float(vec3(P.x.mul(6), P.y.mul(6), t.mul(11).sub(time.mul(31)).add(seed.mul(1.7))));
  const face = pow(abs(normalView.dot(positionViewDirection)), 1.6);
  const body = smoothstep(1, float(.42).add(n.mul(.22)).add(n2.mul(.08)), t).mul(smoothstep(0, .03, t));
  // Blue-white at the nozzle, yellow, then deep orange and red as it burns out (a hot core down the middle).
  const core = mix(vec3(.5, .62, 1), vec3(1, .86, .55), smoothstep(.0, .07, t));
  const hot = mix(core, vec3(1, .45, .08), smoothstep(.05, .26, t));
  const orange = mix(hot, vec3(.8, .1, .015), smoothstep(.28, .8, t.add(n.mul(.12))));
  const flame = mix(orange, vec3(1, .78, .4), face.mul(float(1).sub(smoothstep(.1, .6, t))).mul(.55));
  const lean = mix(vec3(.35, .5, 1), vec3(.7, .78, 1), face.mul(.6));
  m.colorNode = mix(flame, lean, heat).mul(float(1.7).add(n2.mul(.4)));
  m.opacityNode = body.mul(face.mul(.8).add(.2)).mul(k);
  m.userData = {k, heat, seed};
  return m;
}

export class CarFx {
  constructor({scene, vehicle}) {
    this.scene = scene; this.vehicle = vehicle; this.dims = vehicle.body?.dims;
    this.day = uniform(1);
    // From the driver's seat no smoke or spray may show inside the car: every
    // sprite pixel that falls in the car's box (car space, below) is dropped.
    this.clipM = uniform(new T.Matrix4()); this.clipOn = uniform(0);
    this.smoke = this.particles(SMOKE, false);
    this.fire = this.particles(FIRE, true);
    this.flash = new T.PointLight('#ff7a2a', 0, 6, 2); scene.add(this.flash);
    this.signal = null; this.blink = 0; this.turnAcc = 0; this.audio = null;
    this.buildSignals();
    // The cabin is part of the body (carModels.js): the driver's eye, the wheel, the cluster.
    this.attachCabin(vehicle.body?.interior);
    this.ambient = vehicle.body?.ambient;
    this.tmp = new T.Vector3(); this.tmp2 = new T.Vector3();
  }

  /** Hook the cabin's moving parts and screens (again after DWN Works rebuilds it). */
  attachCabin(cab) {
    this.interior = cab?.group || null; this.eye = cab?.eye; this.wheel = cab?.wheel; this.cluster = cab?.cluster; this.clock = cab?.clock;
    this.gauges = cab?.cluster ? new Cluster(cab.cluster, cab.clusterStyle || 'plain') : null;
    this.gscreen = cab?.screen ? new GScreen(cab.screen) : null;
  }

  /* ------------------------------------------------------------ particles */
  particles(n, additive) {
    const pos = new Float32Array(n * 3), data = new Float32Array(n * 4);   // data: size, alpha, rotation, heat
    const posA = new T.InstancedBufferAttribute(pos, 3), dataA = new T.InstancedBufferAttribute(data, 4);
    posA.setUsage(T.DynamicDrawUsage); dataA.setUsage(T.DynamicDrawUsage);
    const mat = new T.SpriteNodeMaterial({transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending});
    const d = instancedDynamicBufferAttribute(dataA);
    mat.positionNode = instancedDynamicBufferAttribute(posA);
    mat.scaleNode = d.x;
    mat.rotationNode = d.z;
    const r = uv().sub(.5).length().mul(2);
    // This pixel of the billboard in car space; `out` > 0 outside the cabin box
    // (x ±1.1, y −.6..1.5 over the floor pan to above the roof, z −2.5..2.6 nose to tail).
    const L = this.clipM.mul(cameraWorldMatrix.mul(vec4(positionView, 1))).xyz;
    const q = abs(L.sub(vec3(0, .45, .05))).sub(vec3(1.1, 1.05, 2.55)), out = max(q.x, max(q.y, q.z));
    const keep = mix(float(1), smoothstep(0, .22, out), this.clipOn).mul(smoothstep(.3, 1.1, length(positionView)));
    if (additive) {
      // Fire: a white-hot core through orange to a red fringe, or blue-white when lean.
      const heat = d.w, core = float(1).sub(smoothstep(0, .55, r)), edge = float(1).sub(smoothstep(.2, 1, r));
      const hot = mix(vec3(1, .32, .06), vec3(1, .82, .45), core), lean = mix(vec3(.35, .5, 1), vec3(.9, .95, 1), core);
      mat.colorNode = mix(hot, lean, heat).mul(edge.mul(1.6));
      mat.opacityNode = edge.mul(d.y).mul(keep);
    } else {
      // Smoke: soft round puffs with a little billow; lit by the sky.
      const billow = sin(uv().x.mul(9).add(d.z.mul(7))).mul(sin(uv().y.mul(8).sub(d.z.mul(5)))).mul(.12);
      const soft = float(1).sub(smoothstep(.25, 1, r.add(billow)));
      mat.colorNode = vec3(.86, .86, .88).mul(this.day.mul(.72).add(.12));
      mat.opacityNode = soft.mul(d.y).mul(keep);
    }
    const mesh = new T.Mesh(new T.PlaneGeometry(1, 1), mat);
    mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = additive ? 3 : 2;
    this.scene.add(mesh);
    return {n, pos, data, posA, dataA, mesh, live: [], next: 0};
  }
  emit(sys, p) {
    // A ring buffer of particle records; the oldest is recycled when full.
    if (sys.live.length < sys.n) sys.live.push(p); else { sys.live[sys.next] = p; sys.next = (sys.next + 1) % sys.n; }
  }
  stepSystem(sys, dt, smoke) {
    let k = 0;
    const out = [];
    for (const p of sys.live) {
      p.age += dt; if (p.age >= p.life) continue;
      const t = p.age / p.life;
      const drag = Math.exp(-dt * (smoke ? 1.6 : 7));
      p.vx *= drag; p.vz *= drag; p.vy = p.vy * drag + (smoke ? .55 : .8) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.spin * dt;
      out.push(p);
      sys.pos[k * 3] = p.x; sys.pos[k * 3 + 1] = p.y; sys.pos[k * 3 + 2] = p.z;
      const size = smoke ? p.size * (.5 + Math.sqrt(t) * 2.4) : p.size * (1 - t * .5);
      const alpha = smoke ? p.alpha * Math.min(1, t * 8) * (1 - t) ** 1.6 : p.alpha * (1 - t) ** 1.4;
      sys.data[k * 4] = size; sys.data[k * 4 + 1] = alpha; sys.data[k * 4 + 2] = p.rot; sys.data[k * 4 + 3] = p.heat || 0;
      k++;
    }
    sys.live = out; sys.next = 0;
    sys.mesh.count = k;
    if (k) { sys.posA.needsUpdate = true; sys.dataA.needsUpdate = true; sys.posA.addUpdateRange?.(0, k * 3); sys.dataA.addUpdateRange?.(0, k * 4); }
  }

  /** One flame jet per tailpipe, parented to the body and aimed down the pipe (rebuilt when the exhaust changes). */
  syncFlames() {
    const ex = this.dims?.exhausts || [], key = JSON.stringify(ex);
    if (this.flameKey === key) return;
    for (const f of this.flames || []) { f.mesh.removeFromParent(); f.mesh.material.dispose(); }
    this.flames = ex.map(([x, y, z, dir, r]) => {
      const mesh = new T.Mesh(FLAME_GEO, flameMaterial());
      mesh.position.set(x, y, z);
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(...(dir || [0, 0, -1])).normalize());
      mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.castShadow = false;
      this.vehicle.object.add(mesh);
      return {mesh, r: r || .05, dir: new T.Vector3(...(dir || [0, 0, -1])).normalize(), age: 1, life: 0, len: 0, power: 0};
    });
    this.flameKey = key;
  }
  /** An overrun bang from game.js: fire out of the pipes. */
  flame(power, kind) {
    if (!this.dims || !this.vehicle.object.visible) return;
    this.syncFlames();
    const o = this.vehicle.object, heat = kind === 'blue' ? .85 : kind === 'white' ? .4 : 0;
    for (const f of this.flames) {
      // The jet: longer and fatter with a bigger bang, a little different every time.
      f.age = 0; f.life = .07 + power * .14 + Math.random() * .05; f.power = power;
      f.len = (.22 + power * .78) * (.8 + Math.random() * .45); f.rad = f.r * (1.25 + power * 1.35);
      const u = f.mesh.material.userData; u.heat.value = heat; u.seed.value = Math.random() * 100;
      // Embers and a burst of flame thrown out of the jet's end.
      const p = o.localToWorld(this.tmp.copy(f.mesh.position)), d = this.tmp2.copy(f.dir).transformDirection(o.matrixWorld);
      const n = 2 + Math.round(power * 5);
      for (let i = 0; i < n; i++) {
        const sp = 5 + power * 10 + Math.random() * 4, along = f.len * (.3 + Math.random() * .6);
        this.emit(this.fire, {x: p.x + d.x * along, y: p.y + d.y * along, z: p.z + d.z * along, vx: d.x * sp + (Math.random() - .5) * 1.6, vy: d.y * sp + (Math.random() - .2) * 1.2, vz: d.z * sp + (Math.random() - .5) * 1.6,
          age: 0, life: .08 + Math.random() * .22, size: .025 + Math.random() * .045, alpha: 1, rot: Math.random() * 6, spin: 0, heat});
      }
      if (power > .55) this.emit(this.fire, {x: p.x + d.x * f.len * .8, y: p.y + d.y * f.len * .8, z: p.z + d.z * f.len * .8, vx: d.x * 6, vy: .4, vz: d.z * 6,
        age: 0, life: .06 + power * .06, size: .18 + power * .2, alpha: .55, rot: Math.random() * 6, spin: 0, heat});
    }
    this.flashT = .07 + power * .07; this.flashPower = power;
  }
  updateFlames(dt) {
    for (const f of this.flames || []) {
      if (f.age >= f.life) { f.mesh.visible = false; continue; }
      f.age += dt;
      const k = Math.max(0, 1 - f.age / f.life), u = f.mesh.material.userData;
      f.mesh.visible = k > 0;
      // It shoots out fast, then shrinks back into the pipe as it dies; flickers every frame.
      const grow = Math.min(1, f.age / .025), fl = .85 + Math.random() * .3;
      f.mesh.scale.set(f.rad * fl * (.7 + .3 * k), f.rad * fl * (.7 + .3 * k), f.len * grow * (.55 + .45 * k) * (.9 + Math.random() * .2));
      u.k.value = Math.pow(k, .55) * (.55 + .45 * Math.min(1, f.power * 1.4));
    }
  }

  /* ------------------------------------------------------------ signals */
  buildSignals() {
    const S = this.vehicle.body?.signals;
    if (S) {
      // Model-built lamps (light guides on the skin): an amber that sweeps along
      // each lamp's `seq` (0 at its inner end) at the start of every flash.
      const mk = () => {
        const m = new T.MeshStandardNodeMaterial({color: '#3a2204', roughness: .25, metalness: .1});
        const on = uniform(0), phase = uniform(1);
        m.emissiveNode = vec3(1, .5, .06).mul(on).mul(step(attribute('seq', 'float'), phase)).mul(5);
        m.userData = {on, phase}; return m;
      };
      this.sigMat = {left: mk(), right: mk()}; this.sigMeshes = [];
      const doors = this.vehicle.body.doors;
      for (const side of ['left', 'right']) for (const g of S[side]) {
        // Mirror repeaters ride on their door.
        const d = g.userData.door && doors?.[g.userData.door];
        if (d && !g.userData.moved) { g.translate(-d.hinge.x, -d.hinge.y, -d.hinge.z); g.userData.moved = true; }
        const mesh = new T.Mesh(g, this.sigMat[side]); (d ? d.pivot : this.vehicle.body.group).add(mesh); this.sigMeshes.push(mesh);
      }
      return;
    }
    const D = this.dims; if (!D?.signals) return;
    const mk = () => new T.MeshStandardMaterial({color: '#6a3a05', emissive: '#ffa21a', emissiveIntensity: 0, roughness: .3, toneMapped: false});
    this.sigMat = {left: mk(), right: mk()}; this.sigMeshes = [];
    // Left of the car is +x (it faces +z).
    for (const [side, s] of [['left', 1], ['right', -1]]) for (const L of D.signals(s)) {
      const mesh = new T.Mesh(new T.BoxGeometry(L.sx, L.sy, L.sz), this.sigMat[side]); mesh.position.set(L.x, L.y, L.z);
      this.vehicle.object.add(mesh); this.sigMeshes.push(mesh);
    }
  }
  dispose() {
    for (const sys of [this.smoke, this.fire]) { this.scene.remove(sys.mesh); sys.mesh.geometry.dispose(); sys.mesh.material.dispose(); }
    for (const f of this.flames || []) { f.mesh.removeFromParent(); f.mesh.material.dispose(); }
    this.scene.remove(this.flash);
    for (const m of this.sigMeshes || []) m.removeFromParent();
  }
  setSignal(mode) {
    this.signal = this.signal === mode ? null : mode; this.blink = 0; this.turnAcc = 0;
    this.tick(true);
  }
  tick(on) {
    // A relay click, made on demand (the first press is the user gesture audio needs).
    try {
      this.audio ||= new AudioContext();
      const ctx = this.audio, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'square'; o.frequency.value = on ? 1900 : 1400; f.type = 'bandpass'; f.frequency.value = on ? 2400 : 1700; f.Q.value = 4;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.09, t + .002); g.gain.exponentialRampToValueAtTime(.0001, t + .03);
      o.connect(f); f.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + .04);
    } catch { /* no audio: silent indicators */ }
  }

  /* ------------------------------------------------------------ doors */
  /** Open (1) or shut (0) a door ('L' the driver's, 'R', or 'both'); they swing up over ~1.2 s. */
  setDoors(open, which = 'both') {
    this.doorTarget ||= {L: 0, R: 0};
    for (const k of which === 'both' ? ['L', 'R'] : [which]) this.doorTarget[k] = open ? 1 : 0;
  }
  updateDoors(dt) {
    const D = this.vehicle.body?.doors; if (!D || !this.doorTarget) return;
    for (const [k, d] of Object.entries(D)) {
      const t = this.doorTarget[k] ?? 0; if (d.open === t) continue;
      d.open = t > d.open ? Math.min(t, d.open + dt / 1.2) : Math.max(t, d.open - dt / 1.0);
      const e = d.open * d.open * (3 - 2 * d.open);
      doorPose(d, e);
    }
  }

  /* ------------------------------------------------------------ per frame */
  update(dt, {car, state, day, cockpit, steer, dialCanvas, hour = null, info = null, beam = false, g = null, wet = 0}) {
    this.day.value = day;
    this.updateDoors(dt);
    const o = this.vehicle.object, v = car.body.linvel(), speed = Math.hypot(v.x, v.z);
    this.clipOn.value = cockpit ? 1 : 0;
    if (cockpit) { o.updateMatrixWorld(); this.clipM.value.copy(o.matrixWorld).invert(); }
    // Smoke from each tyre that is sliding, spinning or locked.
    if (o.visible || cockpit) {
      const rear = Math.max(0, (Math.abs(car.rearSlip) - .1) / .22), front = Math.max(0, (Math.abs(car.frontSlip) - .14) / .25);
      const spin = Math.max(0, ((state.spinV || 0) - .6) / 3), lock = state.lockup && speed > 4 ? .8 : 0, hand = car.handbrake && speed > 5 ? .5 : 0;
      // A burnout: throttle pinned against the handbrake, engine on the boil.
      const burn = car.handbrake && (state.in?.gas || 0) > .6 && speed < 4 && (state.rpm || 0) > 2500 ? 1.3 : 0;
      this.vehicle.wheels.forEach((w, i) => {
        const ws = car.wheelState(i); if (!ws.contact) return;
        // The tyre's own slide (vehicle.js `skid`): drifts pour smoke off the rears.
        const sk = car.skid ? Math.max(0, car.skid[i] - .25) * 1.3 : 0;
        let k = w.front ? Math.max(front * Math.min(1, speed / 6), sk * .6) + lock * .6 : Math.min(1.4, Math.max(rear * Math.min(1, speed / 3), sk) + spin + lock + hand + burn);
        k = Math.min(1.4, k); if (k < .05) return;
        const n = k * dt * 40;
        for (let e = 0; e < n; e += 1) {
          if (Math.random() > n - e) break;
          w.pivot.getWorldPosition(this.tmp);
          this.emit(this.smoke, {x: this.tmp.x + (Math.random() - .5) * .3, y: this.tmp.y - .22, z: this.tmp.z + (Math.random() - .5) * .3,
            vx: v.x * .35 + (Math.random() - .5) * 1.4, vy: .4 + Math.random() * .6, vz: v.z * .35 + (Math.random() - .5) * 1.4,
            age: 0, life: 1.8 + Math.random() * 1.4, size: .8 + Math.random() * .6, alpha: .1 + k * .12, rot: Math.random() * 6, spin: (Math.random() - .5) * .6});
        }
      });
    }
    // Spray: in the wet the tyres throw a mist of road water behind the car.
    if ((o.visible || cockpit) && wet > .15 && speed > 7) {
      const k = wet * Math.min(1, (speed - 7) / 25), n = k * dt * 26;
      this.vehicle.wheels.forEach((w, i) => {
        if (!car.wheelState(i).contact) return;
        for (let e = 0; e < n; e++) {
          if (Math.random() > n - e) break;
          w.pivot.getWorldPosition(this.tmp);
          this.emit(this.smoke, {x: this.tmp.x + (Math.random() - .5) * .4, y: this.tmp.y - .15, z: this.tmp.z + (Math.random() - .5) * .4,
            vx: v.x * .55 + (Math.random() - .5) * 2, vy: .6 + Math.random() * 1.1, vz: v.z * .55 + (Math.random() - .5) * 2,
            age: 0, life: .45 + Math.random() * .4, size: .55 + Math.random() * .5 + Math.min(speed, 45) * .012, alpha: (.04 + k * .06) * (1 - .45 * Math.min(1, speed / 70)), rot: Math.random() * 6, spin: (Math.random() - .5) * .8});
        }
      });
    }
    this.stepSystem(this.smoke, dt, true);
    this.stepSystem(this.fire, dt, false);
    this.updateFlames(dt);
    // The flash on the road behind the pipes: brief, and off the body's back rather than over all of it.
    if (this.flashT > 0) {
      this.flashT -= dt;
      const e = this.dims?.exhausts?.[0], d = e?.[3];
      o.localToWorld(d ? this.flash.position.set(e[0] + d[0] * .5, e[1] + .05, e[2] + d[2] * .5) : this.flash.position.set(0, .42, (this.dims?.Z0 ?? -2) - .55));
      this.flash.intensity = 12 * (this.flashPower || .5) * Math.min(1, Math.max(0, this.flashT) * 9);
    } else this.flash.intensity = 0;
    // Indicators: 1.5 Hz, self-cancelling after the turn is made.
    if (this.sigMat) {
      let on = false;
      if (this.signal) {
        const was = this.blink % .66 < .36; this.blink += dt; on = this.blink % .66 < .36;
        if (on !== was) this.tick(on);
        if (this.signal !== 'hazard') {
          const dir = this.signal === 'left' ? 1 : -1, yawRate = car.body.angvel().y;
          this.turnAcc += yawRate * dt * dir;
          if (this.turnAcc > .9 && Math.abs(steer) < .04) { this.signal = null; }
        }
      }
      const L = on && (this.signal === 'left' || this.signal === 'hazard'), Rt = on && (this.signal === 'right' || this.signal === 'hazard');
      if (this.sigMat.left.userData.on) {
        // Sequential: the sweep runs through the first 0.2 s of each flash.
        const ph = Math.min(1.05, (this.blink % .66) / .2 * 1.05);
        this.sigMat.left.userData.on.value = L ? 1 : 0; this.sigMat.right.userData.on.value = Rt ? 1 : 0;
        this.sigMat.left.userData.phase.value = this.sigMat.right.userData.phase.value = ph;
      } else {
        this.sigMat.left.emissiveIntensity = L ? 4 : 0;
        this.sigMat.right.emissiveIntensity = Rt ? 4 : 0;
      }
      this.signalOn = on;
    }
    // Cabin: the wheel turns with the steering; the cluster shows the tach
    // (only re-uploaded from the driver's seat); the mood light is brighter at night.
    // steer > 0 is a left turn; seen from the seat (looking +z) the rim then turns
    // anticlockwise, which about the wheel's own +z axis is a negative angle.
    if (this.wheel) {
      const a = steer * (this.wheel.userData.ratio || 8.5);
      this.wheel.rotation.z = -a;
      const badge = this.wheel.userData.badge; if (badge) badge.rotation.z = a;
    }
    // The dashboard clock keeps the game's time (hands turn clockwise as the driver sees them).
    if (this.clock && hour !== null) { this.clock.h.rotation.z = (hour % 12) / 12 * Math.PI * 2; this.clock.m.rotation.z = (hour % 1) * Math.PI * 2; }
    if (this.ambient) this.ambient.level.value = .3 + (1 - Math.min(1, Math.max(0, day))) * .7;
    // The cluster: only redrawn while someone could read it (from the seat, or the car is near and visible).
    const st = state || {}, power = !!(st.acc || st.engineOn || st.powered || st.cranking);
    if (this.ambient?.power) this.ambient.power.value += ((power ? 1 : 0) - this.ambient.power.value) * Math.min(1, dt * 4);
    if (this.gauges && (cockpit || this.vehicle.object.visible)) {
      const s = state || {}, mph = s.units === 'mph', v = Math.abs(s.v || 0) * (mph ? 2.23694 : 3.6);
      const gear = s.mode === 'auto' ? (s.autoSel === 'D' ? String(s.autoGear || 1) : s.autoSel || 'P') : String(s.gear || 'N');
      const L = this.signalOn && (this.signal === 'left' || this.signal === 'hazard'), Rt = this.signalOn && (this.signal === 'right' || this.signal === 'hazard');
      const h = hour ?? 12, clock = `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
      this.gauges.update(dt, {speed: v, units: mph ? 'mph' : 'kmh', maxSpeed: mph ? info?.mphMax : info?.kmhMax, rpm: s.rpm || 0, red: info?.max, gear,
        left: L, right: Rt, beam, brake: !!car.handbrake || s.autoSel === 'P', engine: !s.engineOn || !!s.celOn, tc: Math.abs(car.rearSlip || 0) > .09 && (s.in?.gas || 0) > .3, clock, power});
    }
    if (this.gscreen && (cockpit || this.vehicle.object.visible)) {
      const s = state || {}, mph = s.units === 'mph';
      this.gscreen.update(dt, {lat: g?.lat || 0, lon: g?.lon || 0, speed: Math.abs(s.v || 0) * (mph ? 2.23694 : 3.6), units: mph ? 'mph' : 'kmh', power});
    }
  }
}
