/* Life in the sky (2026-09-27 pass 11): the things that move when nothing
 * else is — flocks of birds wheeling round wherever you are by day (gulls
 * by the sea), airliners crossing high on their way down into the airport
 * with their nav lights and strobes blinking, and a police helicopter
 * circling downtown whose searchlight sweeps the streets after dark.
 *
 * All instanced or a handful of meshes; positions follow the camera.
 */
import * as T from 'three';

const FLOCKS = 5, PER = 11;
const rnd = (a, b) => a + Math.random() * (b - a);

export class Life {
  constructor({scene, ground}) {
    this.scene = scene; this.ground = ground; this.t = 0;
    // Birds: two wings per bird (each a flat triangle hinged at the body) and a body.
    const wing = new T.BufferGeometry();
    wing.setAttribute('position', new T.Float32BufferAttribute([0, 0, .13, 0, 0, -.1, .55, 0, -.06, 0, 0, .13, .55, 0, -.06, .38, 0, .06], 3));
    wing.scale(1.35, 1, 1.35); wing.computeVertexNormals();
    const mat = new T.MeshStandardMaterial({color: '#ffffff', roughness: .9, side: T.DoubleSide});
    this.wings = new T.InstancedMesh(wing, mat, FLOCKS * PER * 2);
    this.bodies = new T.InstancedMesh(new T.SphereGeometry(.09, 6, 4).scale(1, .9, 2.6), mat, FLOCKS * PER);
    for (const m of [this.wings, this.bodies]) { m.frustumCulled = false; m.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(m); }
    this.flocks = Array.from({length: FLOCKS}, (_, f) => ({
      a: Math.random() * 6.28, r: rnd(28, 130), w: rnd(.06, .14) * (f % 2 ? 1 : -1), h: rnd(12, 55), cx: 0, cz: 0, drift: rnd(0, 6.28),
      birds: Array.from({length: PER}, () => ({o: new T.Vector3(rnd(-7, 7), rnd(-2.5, 2.5), rnd(-7, 7)), ph: Math.random() * 6.28, rate: rnd(8, 11), glide: Math.random() * 6.28})),
    }));
    this.gull = new T.Color('#f2f1ec'); this.dark = new T.Color('#2a2826');
    // Airliners.
    const plane = () => {
      const g = new T.Group(), skin = new T.MeshStandardMaterial({color: '#e9ecef', roughness: .4, metalness: .2});
      const fus = new T.Mesh(new T.CylinderGeometry(2, 1.6, 36, 10).rotateX(Math.PI / 2), skin);
      const wings = new T.Mesh(new T.BoxGeometry(34, .5, 5.5), skin); wings.position.z = 1;
      const tail = new T.Mesh(new T.BoxGeometry(12, .4, 3), skin); tail.position.z = -15;
      const fin = new T.Mesh(new T.BoxGeometry(.4, 7, 4), new T.MeshStandardMaterial({color: '#1d4d8c', roughness: .5})); fin.position.set(0, 4, -15);
      g.add(fus, wings, tail, fin);
      const light = (c, x, y, z) => { const m = new T.Mesh(new T.SphereGeometry(1, 8, 6), new T.MeshBasicMaterial({color: c, fog: false})); m.position.set(x, y, z); g.add(m); return m; };
      g.userData = {red: light('#ff2a2a', -17, 0, 1), green: light('#2aff5a', 17, 0, 1), strobe: light('#ffffff', 0, -2, 2), beacon: light('#ff3b2a', 0, 2.2, 0)};
      scene.add(g); return g;
    };
    this.planes = [plane(), plane()].map((g, i) => ({g, t: i * .5, dur: 0}));
    for (const p of this.planes) this.route(p, Math.random());
    // The helicopter over downtown, with a searchlight.
    const heli = new T.Group(), dark = new T.MeshStandardMaterial({color: '#1c2430', roughness: .5});
    heli.add(new T.Mesh(new T.SphereGeometry(1.4, 10, 8).scale(1, .9, 1.6), dark));
    const boom = new T.Mesh(new T.CylinderGeometry(.25, .15, 6, 6).rotateX(Math.PI / 2), dark); boom.position.z = -4.5; heli.add(boom);
    this.rotor = new T.Mesh(new T.BoxGeometry(10, .05, .35), dark); this.rotor.position.y = 1.4; heli.add(this.rotor);
    this.rotor2 = this.rotor.clone(); this.rotor2.rotation.y = Math.PI / 2; heli.add(this.rotor2);
    this.heliBeacon = new T.Mesh(new T.SphereGeometry(1, 8, 6), new T.MeshBasicMaterial({color: '#ff3b2a', fog: false})); this.heliBeacon.position.y = -1.2; heli.add(this.heliBeacon);
    // The beam: an open cone from the nose down to the street, brightest at the lamp.
    const L = 1, cone = new T.ConeGeometry(.16 * L, L, 24, 8, true).translate(0, -L / 2, 0);
    const col = new Float32Array(cone.attributes.position.count * 3);
    for (let i = 0; i < cone.attributes.position.count; i++) { const k = Math.pow(1 + cone.attributes.position.getY(i), 1.6) * .5; col.set([k, k * .97, k * .9], i * 3); }
    cone.setAttribute('color', new T.BufferAttribute(col, 3));
    this.beamMat = new T.MeshBasicMaterial({vertexColors: true, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false});
    this.beam = new T.Mesh(cone, this.beamMat); this.beam.frustumCulled = false;
    this.spot = new T.Mesh(new T.CircleGeometry(1, 32).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({color: '#fff6e0', transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, fog: false}));
    scene.add(heli, this.beam, this.spot);
    this.heli = heli; this.heliA = 0;
    this.M = new T.Matrix4(); this.Q = new T.Quaternion(); this.E = new T.Euler(); this.S = new T.Vector3(1, 1, 1); this.P = new T.Vector3();
  }
  /** A new straight track for an airliner: across the map toward the airport (south-west), high. */
  route(p, t0 = 0) {
    const a = rnd(-.5, .5) + Math.PI * 1.25, len = 26000;
    const cx = rnd(-4000, 4000), cz = rnd(-3000, 3000), dx = Math.sin(a), dz = Math.cos(a);
    p.from = new T.Vector3(cx - dx * len / 2, rnd(1300, 2100), cz - dz * len / 2);
    p.to = new T.Vector3(cx + dx * len / 2, p.from.y - rnd(200, 700), cz + dz * len / 2);
    p.dur = len / rnd(70, 95); p.t = t0 * p.dur;
    p.g.position.copy(p.from); p.g.lookAt(p.to);
  }
  update(dt, {camera, day, night}) {
    this.t += dt;
    const cam = camera.position, M = this.M, Q = this.Q, E = this.E, S = this.S, P = this.P;
    // ---- birds: by day, fading out at dusk; gulls near the sea.
    const show = day > .22 ? 1 : 0;
    this.wings.visible = this.bodies.visible = !!show;
    if (show) {
      const coast = cam.z > 3300, col = coast ? this.gull : this.dark;
      let wi = 0, bi = 0;
      for (const f of this.flocks) {
        f.a += f.w * dt;
        // The flock's centre loops round the camera, drifting so it is not a fixed orbit.
        f.drift += dt * .03;
        const r = f.r * (1 + .25 * Math.sin(f.drift * 1.7)), cx = cam.x + Math.cos(f.a) * r + Math.sin(f.drift) * 40, cz = cam.z + Math.sin(f.a) * r;
        const gy = this.ground.height(cx, cz), cy = Math.max(gy + f.h, cam.y + f.h * .35);
        const hx = -Math.sin(f.a) * Math.sign(f.w), hz = Math.cos(f.a) * Math.sign(f.w), yaw = Math.atan2(hx, hz);
        for (const b of f.birds) {
          const bank = -f.w * 4;
          b.ph += dt * b.rate * (.4 + .6 * (Math.sin(this.t * .7 + b.glide) > -.3 ? 1 : 0));
          const flap = Math.sin(b.ph) * (Math.sin(this.t * .7 + b.glide) > -.3 ? .75 : .08);
          const ox = b.o.x + Math.sin(this.t * .9 + b.glide) * .8, oy = b.o.y + Math.sin(this.t * 1.3 + b.ph * .05) * .5, oz = b.o.z;
          const c = Math.cos(yaw), s = Math.sin(yaw);
          P.set(cx + ox * c + oz * s, cy + oy, cz - ox * s + oz * c);
          E.set(0, yaw, bank, 'YXZ'); Q.setFromEuler(E); S.set(1, 1, 1);
          M.compose(P, Q, S); this.bodies.setMatrixAt(bi, M); this.bodies.setColorAt(bi++, col);
          for (const side of [1, -1]) {
            E.set(0, yaw, bank + side * flap, 'YXZ'); Q.setFromEuler(E); S.set(side, 1, 1);
            M.compose(P, Q, S); this.wings.setMatrixAt(wi, M); this.wings.setColorAt(wi++, col);
          }
        }
      }
      for (const m of [this.wings, this.bodies]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    }
    // ---- airliners.
    for (const p of this.planes) {
      p.t += dt; if (p.t > p.dur) this.route(p);
      const k = p.t / p.dur; p.g.position.lerpVectors(p.from, p.to, k);
      p.g.lookAt(P.copy(p.to));
      const d = p.g.position.distanceTo(cam), s = Math.max(1, d * .0028), u = p.g.userData, blink = (this.t + p.dur) % 1.3;
      for (const l of [u.red, u.green]) l.scale.setScalar(s * .9);
      u.strobe.visible = blink < .07 || (blink > .16 && blink < .22); u.strobe.scale.setScalar(s * 1.3);
      u.beacon.visible = (this.t * 1.1 + p.dur) % 1 < .5; u.beacon.scale.setScalar(s);
    }
    // ---- the helicopter: a slow orbit over downtown, the beam on the streets after dark.
    this.heliA += dt * .045;
    const hx = 1250 + Math.cos(this.heliA) * 420, hz = 1300 + Math.sin(this.heliA * 1.3) * 330, hy = this.ground.height(hx, hz) + 240;
    this.heli.position.set(hx, hy, hz);
    this.heli.rotation.set(.08, Math.atan2(-Math.sin(this.heliA) * 420, 1.3 * Math.cos(this.heliA * 1.3) * 330), 0, 'YXZ');
    this.rotor.rotation.y += dt * 38; this.rotor2.rotation.y = this.rotor.rotation.y + Math.PI / 2;
    const hd = this.heli.position.distanceTo(cam);
    this.heliBeacon.visible = this.t % 1.2 < .5; this.heliBeacon.scale.setScalar(Math.max(1, hd * .003));
    const on = Math.min(1, Math.max(0, (night - .3) / .3));
    this.beam.visible = this.spot.visible = on > 0;
    if (on > 0) {
      // Where the light lands: sweeping a little round a point below and ahead.
      const tx = hx + Math.sin(this.t * .23) * 60 + 40, tz = hz + Math.cos(this.t * .31) * 60, ty = this.ground.height(tx, tz) + .3;
      const dir = P.set(tx - hx, ty - (hy - 1.5), tz - hz), L = dir.length();
      this.beam.position.set(hx, hy - 1.5, hz);
      this.beam.quaternion.setFromUnitVectors(new T.Vector3(0, -1, 0), dir.clone().normalize());
      this.beam.scale.set(L, L, L);
      this.beamMat.opacity = .16 * on;
      this.spot.position.set(tx, ty + .5, tz); this.spot.scale.setScalar(L * .16); this.spot.material.opacity = .55 * on;
    }
  }
}
