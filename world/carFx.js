/* The player car's details (2026-09-27): tyre smoke, exhaust fire, turn
 * signals and a cockpit you can sit in.
 *
 *   smoke    instanced sprites off each tyre that is sliding (lateral slip
 *            past the peak), spinning (game.js S.spinV: burnouts, launches)
 *            or locked (S.lockup); they grow, drift with the car's wake and
 *            fade, lit by the sky so they are grey at night, not glowing.
 *   fire     game.js popFlame() calls DwnDrive.onFlame(power, kind): the
 *            same overrun bangs you hear throw additive flame sprites out of
 *            the four tailpipes, with a short orange light on the road.
 *   signals  amber lamps at the four corners and on the mirrors, blinking at
 *            1.5 Hz with a relay tick; they cancel themselves once a turn in
 *            their direction has been made, like a real stalk.
 *   cockpit  dash with the live tach on the binnacle, a wheel that turns with
 *            the steering, bucket seats, door cards, headliner and pillars:
 *            the exterior body is single-sided and sees straight through
 *            from inside, so the interior closes every direction but glass.
 */
import * as T from 'three';
import {instancedDynamicBufferAttribute, uv, vec3, vec4, float, smoothstep, mix, uniform, sin, time, positionLocal, abs} from 'three/tsl';

const SMOKE = 700, FIRE = 96;

export class CarFx {
  constructor({scene, vehicle}) {
    this.scene = scene; this.vehicle = vehicle; this.dims = vehicle.body?.dims;
    this.day = uniform(1);
    this.smoke = this.particles(SMOKE, false);
    this.fire = this.particles(FIRE, true);
    this.flash = new T.PointLight('#ff7a2a', 0, 9, 2); scene.add(this.flash);
    this.signal = null; this.blink = 0; this.turnAcc = 0; this.audio = null;
    this.buildSignals();
    this.interior = this.buildInterior();
    // The body is a closed shell: its top runs through the cabin at deck
    // height. From the driver's seat, cut the cabin volume out of it.
    this.cockpit = uniform(0);
    if (this.dims && vehicle.body?.paint) {
      const D = this.dims, p = positionLocal;
      const inside = abs(p.x).lessThan(.66).and(p.z.greaterThan(D.GZ0 + .02)).and(p.z.lessThan(D.GZ1 - .005)).and(p.y.lessThan(.97)).and(p.y.greaterThan(.18));
      vehicle.body.paint.maskNode = this.cockpit.lessThan(.5).or(inside.not());
    }
    this.tmp = new T.Vector3(); this.tmp2 = new T.Vector3();
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
    if (additive) {
      // Fire: a white-hot core through orange to a red fringe, or blue-white when lean.
      const heat = d.w, core = float(1).sub(smoothstep(0, .55, r)), edge = float(1).sub(smoothstep(.2, 1, r));
      const hot = mix(vec3(1, .32, .06), vec3(1, .82, .45), core), lean = mix(vec3(.35, .5, 1), vec3(.9, .95, 1), core);
      mat.colorNode = mix(hot, lean, heat).mul(edge.mul(1.6));
      mat.opacityNode = edge.mul(d.y);
    } else {
      // Smoke: soft round puffs with a little billow; lit by the sky.
      const billow = sin(uv().x.mul(9).add(d.z.mul(7))).mul(sin(uv().y.mul(8).sub(d.z.mul(5)))).mul(.12);
      const soft = float(1).sub(smoothstep(.25, 1, r.add(billow)));
      mat.colorNode = vec3(.86, .86, .88).mul(this.day.mul(.72).add(.12));
      mat.opacityNode = soft.mul(d.y);
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

  /** An overrun bang from game.js: fire out of the pipes. */
  flame(power, kind) {
    if (!this.dims || !this.vehicle.object.visible) return;
    const o = this.vehicle.object, back = this.tmp2.set(0, 0, -1).applyQuaternion(o.quaternion);
    const heat = kind === 'blue' ? .8 : kind === 'white' ? .35 : 0, n = 3 + Math.round(power * 6);
    for (const [x, y, z] of this.dims.exhausts) {
      const p = o.localToWorld(this.tmp.set(x, y, z));
      for (let i = 0; i < n; i++) {
        const sp = 4 + power * 9 + Math.random() * 3, along = Math.random() * (.15 + power * .35);
        this.emit(this.fire, {x: p.x + back.x * along, y: p.y, z: p.z + back.z * along, vx: back.x * sp + (Math.random() - .5), vy: (Math.random() - .3) * .8, vz: back.z * sp + (Math.random() - .5),
          age: 0, life: .05 + power * .12 + Math.random() * .05, size: .1 + power * .26 + Math.random() * .08, alpha: .85, rot: Math.random() * 6, spin: 0, heat});
      }
    }
    this.flashT = .09 + power * .08; this.flashPower = power;
  }

  /* ------------------------------------------------------------ signals */
  buildSignals() {
    const D = this.dims; if (!D) return;
    const mk = () => new T.MeshStandardMaterial({color: '#6a3a05', emissive: '#ffa21a', emissiveIntensity: 0, roughness: .3, toneMapped: false});
    this.sigMat = {left: mk(), right: mk()};
    // Left of the car is +x (it faces +z).
    for (const [side, s] of [['left', 1], ['right', -1]]) {
      const m = this.sigMat[side], add = (geo, x, y, z, ry = 0) => { const mesh = new T.Mesh(geo, m); mesh.position.set(x, y, z); mesh.rotation.y = ry; this.vehicle.object.add(mesh); };
      add(new T.BoxGeometry(.05, .035, .16), s * (D.halfW(D.Z1 - .32) - .005), .5, D.Z1 - .32);             // front corner
      add(new T.BoxGeometry(.12, .03, .012), s * .62, .52, D.Z1 - .02);                                   // front, under the lamp
      add(new T.BoxGeometry(.18, .028, .012), s * .66, D.belt(D.Z0 + .06) - .075, D.Z0 - .004);           // rear, under the light bar
      add(new T.BoxGeometry(.04, .02, .09), s * (D.halfW(D.GZ1 - .28) + .17), D.belt(D.GZ1 - .28) + .1, D.GZ1 - .33); // mirror repeater
    }
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

  /* ------------------------------------------------------------ cockpit */
  buildInterior() {
    const D = this.dims; if (!D) return null;
    const g = new T.Group(); g.visible = false;
    const leather = new T.MeshStandardMaterial({color: '#1d1b1b', roughness: .7}), alcantara = new T.MeshStandardMaterial({color: '#262628', roughness: .95});
    const red = new T.MeshStandardMaterial({color: '#6e1414', roughness: .6}), carbon = new T.MeshStandardMaterial({color: '#141619', roughness: .35, metalness: .5});
    const alu = new T.MeshStandardMaterial({color: '#9aa0a6', roughness: .3, metalness: .9});
    const box = (m, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => { const b = new T.Mesh(new T.BoxGeometry(sx, sy, sz), m); b.position.set(x, y, z); b.rotation.set(rx, ry, rz); g.add(b); return b; };
    const zD = D.GZ1 - .08, eyeZ = -.3;                                 // dash face, driver's eye
    this.eye = [.35, .97, eyeZ];
    const wIn = z => D.halfW(z) - .1;
    // Dash: a long leather top running to the windshield, carbon lower face.
    box(leather, 0, .76, zD - .16, wIn(zD) * 1.7, .14, .46, -.1);
    box(carbon, 0, .58, zD - .34, wIn(zD) * 2 - .1, .26, .06);
    box(leather, .36, .86, zD - .3, .36, .1, .22, -.35);                  // binnacle hood
    // The tach on the binnacle (world.js hands over its dial canvas).
    this.cluster = new T.Mesh(new T.PlaneGeometry(.24, .24), new T.MeshBasicMaterial({color: '#ffffff', transparent: true, toneMapped: false}));
    this.cluster.position.set(.36, .8, zD - .37); this.cluster.rotation.y = Math.PI; this.cluster.rotation.x = -.18; g.add(this.cluster);
    // Centre console, a gear lever, a screen.
    box(carbon, 0, .44, eyeZ + .1, .24, .22, 1.1);
    box(alu, 0, .6, eyeZ + .28, .03, .14, .03, .2);
    box(leather, 0, .68, eyeZ + .32, .05, .05, .05);
    const screen = box(new T.MeshStandardMaterial({color: '#0b1a24', emissive: '#1a4a66', emissiveIntensity: .8, roughness: .2}), 0, .74, zD - .38, .22, .13, .01, -.3);
    void screen;
    // Steering wheel on its column.
    this.wheel = new T.Group(); this.wheel.position.set(.36, .78, eyeZ + .44); this.wheel.rotation.x = -.35; g.add(this.wheel);
    const rim = new T.Mesh(new T.TorusGeometry(.17, .018, 10, 32), leather); this.wheel.add(rim);
    for (const a of [0, Math.PI * .5, Math.PI]) { const sp = new T.Mesh(new T.BoxGeometry(.15, .022, .02), carbon); sp.position.set(Math.cos(a + Math.PI) * .075, Math.sin(a + Math.PI) * .075, 0); sp.rotation.z = a; this.wheel.add(sp); }
    const hub = new T.Mesh(new T.CylinderGeometry(.045, .05, .04, 16), carbon); hub.rotation.x = Math.PI / 2; this.wheel.add(hub);
    const mark = new T.Mesh(new T.BoxGeometry(.02, .025, .025), new T.MeshStandardMaterial({color: '#ffcf1f'})); mark.position.set(0, .17, 0); this.wheel.add(mark);
    for (const s of [-1, 1]) { const pad = new T.Mesh(new T.BoxGeometry(.012, .07, .03), alu); pad.position.set(s * .12, .12, -.02); this.wheel.add(pad); }   // shift paddles
    box(carbon, .36, .72, eyeZ + .62, .07, .07, .36, -.35);              // column
    // Bucket seats.
    for (const x of [.36, -.36]) {
      box(red, x, .3, eyeZ - .05, .5, .1, .5);
      box(red, x, .64, eyeZ - .33, .5, .7, .1, -.22);
      for (const s of [-1, 1]) box(leather, x + s * .24, .62, eyeZ - .3, .06, .6, .14, -.22);   // bolsters
      box(red, x, 1.04, eyeZ - .42, .26, .16, .08, -.22);                 // head rest
    }
    // Door cards, below the side glass.
    for (const s of [-1, 1]) {
      const z0 = D.GZ0 + .1, z1 = zD - .1, zc = (z0 + z1) / 2, x = s * (wIn(zc) - .02);
      const top = Math.min(D.belt(z0), D.belt(z1)) - .02;
      box(leather, x, (.3 + top) / 2, zc, .05, top - .3, z1 - z0);
      box(alu, x - s * .03, .72, zc + .2, .02, .02, .18);                 // handle
      box(carbon, x - s * .01, top, zc, .07, .03, z1 - z0);               // sill top
    }
    // Headliner and pillars: the roof from inside.
    {
      // Headliner: one curved panel under the roof, dropping at its edges.
      const z0 = D.GZ0 + .3, z1 = D.GZ1 - .5, nz = 16, nx = 10, pos = [], idx = [];
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const z = z0 + (z1 - z0) * j / nz, u = i / nx * 2 - 1, hw = .56;
        pos.push(u * hw, D.roof(z) - .045 - u * u * .07, z);
      }
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2); }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
      const liner = new T.Mesh(geo, new T.MeshStandardMaterial({color: '#48464a', roughness: .95, side: T.DoubleSide})); g.add(liner);
    }
    for (const s of [-1, 1]) {
      const a = [s * (wIn(zD) - .02), .8, zD - .02], b = [s * .5, D.roof(D.GZ1 - .45) - .04, D.GZ1 - .45];
      const d = new T.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length();
      const p = new T.Mesh(new T.CylinderGeometry(.035, .045, L, 8), alcantara);
      p.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); p.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); g.add(p);
      box(alcantara, s * .52, (D.roof(D.GZ0 + .45) + .82) / 2, D.GZ0 + .38, .08, D.roof(D.GZ0 + .45) - .82, .14);   // B/C pillar
    }
    box(carbon, 0, D.roof(D.GZ1 - .42) - .09, D.GZ1 - .5, .18, .05, .01);        // mirror
    // Rear bulkhead with a slot window onto the engine cover.
    box(leather, 0, .52, D.GZ0 + .22, 1.0, .5, .04);
    // Floor and footwell, so looking down is not the road.
    box(carbon, 0, .2, (D.GZ0 + zD) / 2, 1.2, .02, zD - D.GZ0);
    this.vehicle.object.add(g);
    return g;
  }

  /* ------------------------------------------------------------ per frame */
  update(dt, {car, state, day, cockpit, steer, dialCanvas}) {
    this.day.value = day;
    const o = this.vehicle.object, v = car.body.linvel(), speed = Math.hypot(v.x, v.z);
    // Smoke from each tyre that is sliding, spinning or locked.
    if (o.visible || cockpit) {
      const rear = Math.max(0, (Math.abs(car.rearSlip) - .1) / .22), front = Math.max(0, (Math.abs(car.frontSlip) - .14) / .25);
      const spin = Math.max(0, ((state.spinV || 0) - .6) / 3), lock = state.lockup && speed > 4 ? .8 : 0, hand = car.handbrake && speed > 5 ? .5 : 0;
      // A burnout: throttle pinned against the handbrake, engine on the boil.
      const burn = car.handbrake && (state.in?.gas || 0) > .6 && speed < 4 && (state.rpm || 0) > 2500 ? 1.3 : 0;
      this.vehicle.wheels.forEach((w, i) => {
        const ws = car.wheelState(i); if (!ws.contact) return;
        let k = w.front ? front * Math.min(1, speed / 6) + lock * .6 : Math.min(1.4, rear * Math.min(1, speed / 3) + spin + lock + hand + burn);
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
    this.stepSystem(this.smoke, dt, true);
    this.stepSystem(this.fire, dt, false);
    // The flash on the road behind the pipes.
    if (this.flashT > 0) { this.flashT -= dt; o.localToWorld(this.flash.position.set(0, .4, (this.dims?.Z0 ?? -2) - .5)); this.flash.intensity = 30 * (this.flashPower || .5) * Math.max(0, this.flashT) * 10; }
    else this.flash.intensity = 0;
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
      this.sigMat.left.emissiveIntensity = on && (this.signal === 'left' || this.signal === 'hazard') ? 4 : 0;
      this.sigMat.right.emissiveIntensity = on && (this.signal === 'right' || this.signal === 'hazard') ? 4 : 0;
      this.signalOn = on;
    }
    // Cockpit: the wheel turns with the steering; the cluster shows the tach.
    if (this.interior) {
      this.interior.visible = cockpit || !!this._keep; this.cockpit.value = cockpit ? 1 : 0;
      if (cockpit) {
        this.wheel.rotation.z = steer * 8.5;
        if (dialCanvas) {
          if (!this.cluster.material.map) { this.cluster.material.map = new T.CanvasTexture(dialCanvas); this.cluster.material.map.colorSpace = T.SRGBColorSpace; this.cluster.material.needsUpdate = true; }
          this.cluster.material.map.needsUpdate = true;
        }
      }
    }
  }
}
