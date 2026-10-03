/* Weather: rain and thunderstorms (2026-10-03, Peter: "add a raining mode,
 * that'll be insane").
 *
 * One controller (`Weather`) eases three uniforms toward the chosen mode, and
 * everything else reads them:
 *   weather.rain   rain falling now, 0..1 (the streaks, splashes, glass, audio)
 *   weather.wet    how wet the ground is: lags the rain (wets in ~25 s, dries
 *                  in ~90 s). materials.js darkens the asphalt, makes it a mirror
 *                  with puddles and stretches the lamp pools into reflections.
 *   weather.cloud  overcast: sky.js greys the sky, dims the sun, thickens the fog.
 *   weather.flash  lightning (storm): the sky and the bounce light flare.
 *
 * Rain is ~9,000 streaks in a 36 m box that wraps round the camera, all moved
 * on the GPU: each is stretched along its fall RELATIVE to the camera, so at
 * speed the rain comes at the windshield. None fall inside the car you are in.
 * Splashes are little rings on the ground near you, fixed in the world while
 * they live. On the glass (wetGlass, applied to every car's glass material by
 * carBody.js) droplets bead in cells; on the windshield the wiper's sweep
 * clears them (each fragment works out when the blade last passed it) and at
 * speed they run up the glass. The Aurora's wiper blade really sweeps.
 * The car's grip drops a little in the wet (world.js -> vehicle.js wetGrip),
 * tyres throw spray, and the rain sounds different outside and in the cabin.
 */
import * as T from 'three';
import {Fn, uniform, attribute, vec2, vec3, vec4, float, positionLocal, normalLocal, positionWorld, cameraPosition, fract, floor, abs, mix, smoothstep, step,
  length, normalize, cross, clamp, max, hash, acos, atan, select, mod, dot, sin} from 'three/tsl';

export const WEATHERS = [['clear', 'Clear skies'], ['rain', 'Rain'], ['storm', 'Thunderstorm']];
const LEVEL = {clear: 0, rain: .6, storm: 1};

export const weather = {rain: uniform(0), wet: uniform(0), cloud: uniform(0), flash: uniform(0)};

/* ------------------------------------------------------------------ glass */
// The windshield wiper: parked along the glass base, sweeping up about the glass normal.
export const WIPER = {A: 1.62, axis: new T.Vector3(0, .894, .447), b0: new T.Vector3(-1, 0, 0), up: new T.Vector3(0, .447, -.894)};
export const glassRain = {
  amount: uniform(0), now: uniform(0), wipeT: uniform(0), period: uniform(1.4), shift: uniform(0), on: uniform(0), park: uniform(-1e4),
  flow: uniform(0), light: uniform(1), pivot: uniform(new T.Vector3(.42, .9, .44)),
};
/** Rain on a car's glass: beads that come and go, cleared by the wiper's sweep on the windshield. */
export function wetGlass(mat) {
  const G = glassRain, base = vec3(mat.color.r, mat.color.g, mat.color.b), baseOpacity = mat.opacityNode || float(mat.opacity);
  const P = positionLocal, N = normalLocal;
  const side = step(.55, abs(N.x)), front = step(.25, N.z).mul(float(1).sub(side));
  // Flat coordinates on the glass, in metres; at speed the windshield's beads run up it.
  const q = mix(vec2(P.x, P.y.mul(.6).sub(P.z.mul(.8))), vec2(P.z, P.y), side).add(vec2(0, G.flow.mul(front)));
  // When did the blade last pass this point?
  const rel = P.sub(G.pivot), bu = dot(rel, vec3(WIPER.b0.x, WIPER.b0.y, WIPER.b0.z)), bv = dot(rel, vec3(WIPER.up.x, WIPER.up.y, WIPER.up.z));
  const th = atan(bv, bu), rr = length(vec2(bu, bv));
  const swept = front.mul(step(rr, .84)).mul(step(-.04, th)).mul(step(th, WIPER.A + .02));
  const t1 = acos(clamp(float(1).sub(th.mul(2 / WIPER.A)), -1, 1)).div(2 * Math.PI).mul(G.period), t2 = G.period.sub(t1);
  const c0 = floor(G.wipeT.div(G.period)).mul(G.period), ph = G.wipeT.sub(c0);
  const lastRun = select(ph.greaterThanEqual(t2), c0.add(t2), select(ph.greaterThanEqual(t1), c0.add(t1), c0.sub(G.period).add(t2))).add(G.shift);
  const lastW = mix(G.park, lastRun, G.on);
  const layer = (scale, seed) => {
    const s = q.mul(scale), cell = floor(s), f = fract(s).sub(.5);
    const k = cell.x.mul(127).add(cell.y.mul(311)).add(seed + 4096);
    const h1 = hash(k), h2 = hash(k.add(1013)), h3 = hash(k.add(2027)), h4 = hash(k.add(3041)), h5 = hash(k.add(4057));
    const off = vec2(h1.sub(.5), h2.sub(.5)).mul(.5), rad = h3.mul(.2).add(.14);
    const dv = f.sub(off), d = length(dv).div(rad);
    // Each cell gets a bead every I seconds (more often in heavier rain).
    const I = h5.mul(3).add(2.2).div(G.amount.mul(.8).add(.2)), o = h4.mul(I);
    const wiped = floor(G.now.sub(o).div(I)).greaterThan(floor(lastW.sub(o).div(I)));
    const life = step(fract(G.now.sub(o).div(I)), .85);              // elsewhere a bead lives a while, then runs off
    const alive = mix(life, select(wiped, float(1), float(0)), swept).mul(step(h5, G.amount.mul(1.1)));
    return {
      body: smoothstep(1, .55, d).mul(alive),
      hi: smoothstep(.42, .08, length(dv.add(vec2(rad.mul(.28), rad.mul(-.3)))).div(rad)).mul(alive),
      rim: smoothstep(.55, .9, d).mul(smoothstep(1.08, .92, d)).mul(alive),
    };
  };
  const A = layer(34, 0), B = layer(72, 17);
  const body = max(A.body, B.body.mul(.8)), hi = max(A.hi, B.hi), rim = max(A.rim, B.rim);
  mat.colorNode = base.mul(float(1).sub(rim.mul(.6))).add(vec3(.5, .55, .62).mul(G.light).mul(body.mul(.3).add(hi.mul(1.1))));
  mat.opacityNode = max(baseOpacity, body.mul(.5).add(hi.mul(.45)).add(rim.mul(.35)).min(.95));
}

/* ------------------------------------------------------------- the rain */
const BOX = 36;
/** Quads: `corner` (x across -1..1, y along 0..1) and a per-drop `seed` (xyz place, w speed / share). */
function quads(n) {
  const g = new T.BufferGeometry(), pos = new Float32Array(n * 12), corner = new Float32Array(n * 8), seed = new Float32Array(n * 16), idx = new Uint32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const s = [Math.random(), Math.random(), Math.random(), Math.random()];
    [[-1, 0], [1, 0], [1, 1], [-1, 1]].forEach(([cx, cy], k) => { corner.set([cx, cy], (i * 4 + k) * 2); seed.set(s, (i * 4 + k) * 4); });
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  g.setAttribute('uv', new T.BufferAttribute(new Float32Array(n * 8), 2));
  g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('corner', new T.BufferAttribute(corner, 2)); g.setAttribute('seed', new T.BufferAttribute(seed, 4));
  g.setIndex(new T.BufferAttribute(idx, 1));
  return g;
}

export class Weather {
  constructor(scene) {
    this.mode = 'clear'; this.t = 0; this.flashT = 8; this.flashSeq = null; this.wipeT = 0; this.wiping = false;
    this.U = {cam: uniform(new T.Vector3()), vel: uniform(new T.Vector3()), fall: uniform(new T.Vector3(.8, -9.5, .4)), t: uniform(0),
      shelter: uniform(new T.Matrix4()), shelter2: uniform(new T.Matrix4()), share: uniform(0), color: uniform(new T.Color('#a8b0bc')), ground: uniform(0), splash: uniform(0)};
    this.camPrev = null; this.camVel = new T.Vector3();
    this.streaks = this.makeStreaks(9000); scene.add(this.streaks);
    this.splashes = this.makeSplashes(900); scene.add(this.splashes);
    this.audio = null;
  }
  /** Inside either sheltering car (the one you drive, the one you ride in)? 1 if so. */
  sheltered(p) {
    const box = M => { const L = M.mul(vec4(p, 1)).xyz; return step(abs(L.x), 1.08).mul(step(-.3, L.y)).mul(step(L.y, 1.5)).mul(step(abs(L.z.sub(.05)), 2.5)); };
    return max(box(this.U.shelter), box(this.U.shelter2));
  }
  makeStreaks(n) {
    const U = this.U, mat = new T.MeshBasicNodeMaterial({transparent: true, depthWrite: false, side: T.DoubleSide});
    const seed = attribute('seed', 'vec4'), corner = attribute('corner', 'vec2');
    mat.positionNode = Fn(() => {
      const sp = seed.w.mul(.35).add(.82), half = float(BOX / 2);
      const p = mod(seed.xyz.mul(BOX).add(U.fall.mul(U.t.mul(sp))).sub(U.cam).add(half), float(BOX)).add(U.cam).sub(half).toVar();
      const rel = U.fall.mul(sp).sub(U.vel), dir = normalize(rel), len = clamp(length(rel).mul(.028), .28, 1.8);
      const toCam = p.sub(U.cam), dist = max(length(toCam), .01), sideV = normalize(cross(dir, toCam.div(dist)));
      const on = step(fract(seed.x.mul(91.7).add(seed.z.mul(13.3))), U.share).mul(float(1).sub(this.sheltered(p))).mul(step(.45, dist));
      const w = dist.mul(.0011).add(.0055).mul(on);
      return p.sub(dir.mul(len.mul(corner.y).mul(on))).add(sideV.mul(w.mul(corner.x)));
    })();
    const dist = length(positionWorld.sub(cameraPosition));
    mat.colorNode = U.color;
    mat.opacityNode = float(1).sub(abs(corner.x)).mul(float(1).sub(corner.y.mul(.7))).mul(smoothstep(BOX / 2, BOX / 2 - 7, dist)).mul(smoothstep(.5, 1.6, dist)).mul(.42);
    const m = new T.Mesh(quads(n), mat); m.frustumCulled = false; m.renderOrder = 4; m.visible = false;
    return m;
  }
  makeSplashes(n) {
    const U = this.U, mat = new T.MeshBasicNodeMaterial({transparent: true, depthWrite: false, side: T.DoubleSide});
    const seed = attribute('seed', 'vec4'), corner = attribute('corner', 'vec2');
    const cyc = () => { const tt = U.t.div(seed.w.mul(.25).add(.32)).add(seed.z.mul(7)); return {k: floor(tt), ph: fract(tt)}; };
    mat.positionNode = Fn(() => {
      const {k, ph} = cyc(), R = 32;
      // A random spot fixed in the world for this splash's life, wrapped into the square round the camera.
      const rx = fract(sin(k.mul(12.9898).add(seed.x.mul(78.233))).mul(43758.5453)), rz = fract(sin(k.mul(39.346).add(seed.y.mul(11.135))).mul(24634.6345));
      const xz = mod(vec2(rx, rz).mul(R).sub(U.cam.xz).add(R / 2), float(R)).add(U.cam.xz).sub(R / 2);
      const p = vec3(xz.x, U.ground.add(.025), xz.y);
      const on = step(fract(seed.x.mul(53.1).add(seed.y.mul(7.7))), U.splash).mul(float(1).sub(this.sheltered(p)));
      const size = seed.y.mul(.09).add(.06).mul(ph.mul(.8).add(.35)).mul(on);
      return p.add(vec3(corner.x.mul(size), 0, corner.y.mul(2).sub(1).mul(size)));
    })();
    const {ph} = cyc(), r = length(vec2(corner.x, corner.y.mul(2).sub(1)));
    const ring = smoothstep(.16, 0, abs(r.sub(ph.mul(.85)))).mul(float(1).sub(ph)), crown = smoothstep(.4, 0, r).mul(step(ph, .22));
    mat.colorNode = U.color;
    mat.opacityNode = ring.mul(.55).add(crown.mul(.5)).mul(smoothstep(16, 9, length(positionWorld.sub(cameraPosition))));
    const m = new T.Mesh(quads(n), mat); m.frustumCulled = false; m.renderOrder = 4; m.visible = false;
    return m;
  }
  set(mode) { this.mode = LEVEL[mode] != null ? mode : 'clear'; }
  /** Jump straight to the full weather (tests, and joining a lobby mid-storm). */
  snap() { const l = this.level; weather.cloud.value = l ? Math.min(1, .75 + l * .25) : 0; weather.rain.value = l; weather.wet.value = l; glassRain.amount.value = Math.min(1, l * 1.25); }
  get level() { return LEVEL[this.mode]; }

  /** o: {dt, camera, shelter: Object3D|null, shelter2, ground, covered 0..1, day, wipers (car powered), cockpit, inCar, audio: {ctx, out}|null} */
  update(o) {
    const {dt, camera} = o, U = this.U, target = this.level;
    this.t += dt; U.t.value = this.t;
    // Ease toward the chosen weather: the cloud first, the rain after it, the ground wets and dries slowly.
    const ease = (u, to, up, down) => { u.value += (to - u.value) * (1 - Math.exp(-dt / (to > u.value ? up : down))); };
    ease(weather.cloud, target ? Math.min(1, .75 + target * .25) : 0, 4, 10);
    ease(weather.rain, weather.cloud.value > .55 ? target : 0, 5, 4);
    ease(weather.wet, Math.max(weather.rain.value, 0), 25, 90);
    const rain = weather.rain.value, cover = Math.max(0, Math.min(1, o.covered || 0));
    // Camera velocity (smoothed) stretches the streaks.
    const c = camera.position;
    if (this.camPrev && dt > 0) this.camVel.lerp(new T.Vector3().subVectors(c, this.camPrev).divideScalar(dt).clampLength(0, 120), Math.min(1, dt * 8));
    this.camPrev = (this.camPrev || new T.Vector3()).copy(c);
    U.cam.value.copy(c); U.vel.value.copy(this.camVel); U.ground.value = o.ground ?? c.y - 1.6;
    U.fall.value.set(.8 + target * 1.6, -9.5 - target * 1.5, .4 + target * .9);
    U.share.value = rain * (1 - cover) * (this.mode === 'storm' ? 1 : .62);
    U.splash.value = rain * (1 - cover) * Math.max(0, 1 - this.camVel.length() / 30);
    for (const [u, s] of [[U.shelter, o.shelter], [U.shelter2, o.shelter2]]) {
      if (s) u.value.copy(s.matrixWorld).invert(); else u.value.makeTranslation(1e6, 1e6, 1e6);
    }
    const day = o.day ?? 1, lum = .14 + day * .6;
    U.color.value.setRGB(.62 * lum, .66 * lum, .74 * lum).multiplyScalar(1 + weather.flash.value * 2);
    this.streaks.visible = U.share.value > .003; this.splashes.visible = U.splash.value > .003;
    // Lightning, in a storm: a flicker of two or three strokes, the thunder after it.
    if (this.mode === 'storm' && rain > .5) {
      this.flashT -= dt;
      if (this.flashT < 0) {
        this.flashT = 7 + Math.random() * 16;
        const strokes = [[0, .9], [.07, 0], [.12, .6], [.2, 0]]; if (Math.random() < .5) strokes.push([.32, 1], [.42, 0]);
        this.flashSeq = {t: 0, strokes, k: .55 + Math.random() * .45};
        this.audio?.thunder(.4 + Math.random() * 3.2, this.flashSeq.k);
      }
    }
    if (this.flashSeq) {
      const F = this.flashSeq; F.t += dt; let v = 0;
      for (const [t0, a] of F.strokes) if (F.t >= t0) v = a;
      if (F.t > .2 && v === 0) v = Math.max(0, .25 - (F.t - .2)) * .8;
      weather.flash.value = v * F.k; if (F.t > .8) { this.flashSeq = null; weather.flash.value = 0; }
    } else weather.flash.value = 0;
    // Glass: beads in proportion to the rain, the wiper on whenever it rains and the car has power.
    const G = glassRain, now = performance.now() / 1000; G.now.value = now;
    G.amount.value += (Math.min(1, rain * 1.25 * (1 - cover * .8)) - G.amount.value) * (1 - Math.exp(-dt / (rain > G.amount.value ? 6 : 40)));
    G.light.value = lum * (1 + weather.flash.value * 2);
    G.period.value = this.mode === 'storm' ? 1.05 : 1.5;
    const wantWipe = !!o.wipers && rain > .08, P = G.period.value;
    if (wantWipe || this.wiping) {
      if (!this.wiping) { this.wiping = true; G.shift.value = now - this.wipeT; }
      this.wipeT += dt;
      // Stop only when the blade is home.
      if (!wantWipe && (this.wipeT % P) < dt * 1.5) { this.wiping = false; this.wipeT = Math.floor(this.wipeT / P) * P; G.park.value = now; }
    }
    G.wipeT.value = this.wipeT; G.on.value = this.wiping ? 1 : 0;
    const ph = (this.wipeT % P) / P; this.wiperAngle = this.wiping ? WIPER.A * (1 - Math.cos(ph * Math.PI * 2)) / 2 : 0;
    // At speed the beads run up the windshield.
    G.flow.value += (o.speed || 0) * dt * .045;
    // Sound.
    if (o.audio && !this.audio) this.audio = new RainAudio(o.audio.ctx, o.audio.out);
    this.audio?.update(dt, {rain: rain * (1 - cover * .7), cabin: o.inCar ? 1 : 0, wiper: this.wiping && o.cockpit ? ph : -1});
  }
}

/* ------------------------------------------------------------------ sound */
/** Rain outside (a wide hiss with a heavier low layer), on the roof from inside
 *  (muffled, with drumming), the wiper's soft thump, and thunder. */
class RainAudio {
  constructor(ctx, out) {
    this.ctx = ctx; const sr = ctx.sampleRate, len = sr * 3;
    const white = ctx.createBuffer(1, len, sr), d = white.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // Patter: noise with sparse clicks in it (single drops on the roof and the leaves).
    const pat = ctx.createBuffer(1, len, sr), pd = pat.getChannelData(0);
    for (let i = 0; i < len; i++) pd[i] = (Math.random() * 2 - 1) * .25;
    for (let k = 0; k < len / sr * 140; k++) { const at = Math.floor(Math.random() * (len - 600)), a = .4 + Math.random() * .6; for (let j = 0; j < 500; j++) pd[at + j] += (Math.random() * 2 - 1) * a * Math.exp(-j / 70); }
    this.white = white;
    const src = b => { const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.start(); return s; };
    const filt = (type, f, q = .7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    this.bus = ctx.createGain(); this.bus.gain.value = .9; this.bus.connect(out);
    // Outside: hiss + a low wash.
    this.hiss = ctx.createGain(); this.hiss.gain.value = 0;
    src(white).connect(filt('highpass', 500)).connect(filt('lowpass', 9000)).connect(this.hiss).connect(this.bus);
    this.wash = ctx.createGain(); this.wash.gain.value = 0;
    src(white).connect(filt('lowpass', 420)).connect(this.wash).connect(this.bus);
    this.patter = ctx.createGain(); this.patter.gain.value = 0;
    src(pat).connect(filt('bandpass', 2600, .6)).connect(this.patter).connect(this.bus);
    // In the cabin: the roof drumming, muffled.
    this.roof = ctx.createGain(); this.roof.gain.value = 0;
    src(pat).connect(filt('lowpass', 1100)).connect(this.roof).connect(this.bus);
    this.lastPh = 0;
  }
  update(dt, {rain, cabin, wiper}) {
    const t = this.ctx.currentTime, r = Math.min(1, rain), out = 1 - cabin;
    this.hiss.gain.setTargetAtTime(r * .14 * (out + cabin * .12), t, .3);
    this.wash.gain.setTargetAtTime(r * .1 * (out + cabin * .3), t, .3);
    this.patter.gain.setTargetAtTime(r * .16 * out, t, .3);
    this.roof.gain.setTargetAtTime(r * .3 * cabin, t, .3);
    // The wiper: a soft rubber thump as the blade turns at each end.
    if (wiper >= 0) { if ((this.lastPh < .5 && wiper >= .5) || wiper < this.lastPh) this.thump(); this.lastPh = wiper; }
  }
  thump() {
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.white; f.type = 'lowpass'; f.frequency.value = 260; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.14, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + .12);
    s.connect(f).connect(g).connect(this.bus); s.start(t, Math.random()); s.stop(t + .15);
  }
  /** A crack (when close) and a long rolling rumble, `delay` seconds after the flash. */
  thunder(delay, k) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.white; s.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(delay < 1.2 ? 2400 : 700, t); lp.frequency.exponentialRampToValueAtTime(90, t + 3.5);
    const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.55 * k * (delay < 1.2 ? 1.3 : 1), t + .05 + delay * .05);
    // Rolls: a few swells as the sound comes back off the hills.
    let at = t + .3; for (let i = 0; i < 4; i++) { at += .4 + Math.random() * .8; g.gain.linearRampToValueAtTime(.18 + Math.random() * .3 * k, at); }
    g.gain.exponentialRampToValueAtTime(.001, at + 2.5);
    s.connect(lp).connect(g).connect(this.bus); s.start(t, Math.random() * 2); s.stop(at + 2.6);
  }
}
