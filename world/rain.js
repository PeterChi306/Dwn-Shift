/* Weather: rain and thunderstorms (2026-10-03, Peter: "add a raining mode,
 * that'll be insane"; reworked 2026-10-04: "make sure it doesn't rain inside
 * the building ... when you're inside you can see rain outside ... no
 * physical line from the mountains ... make it look cooler").
 *
 * One controller (`Weather`) eases the uniforms toward the chosen mode, and
 * everything else reads them:
 *   weather.rain   rain falling now, 0..1 (the streaks, splashes, glass, audio)
 *   weather.wet    how wet the ground is: lags the rain (wets in ~25 s, dries
 *                  in ~90 s). materials.js darkens the asphalt, makes it a mirror
 *                  with puddles and stretches the lamp pools into reflections.
 *   weather.cloud  overcast: sky.js greys the sky, dims the sun, thickens the fog.
 *   weather.flash  lightning (storm): the sky and the bounce light flare,
 *                  brightest toward the bolt (weather.flashDir).
 *
 * Where it can rain: a top-down height map of the world round the camera
 * (RainOcclusion, 128 m square at 12.5 cm, re-rendered as you move). Every
 * drop and every splash looks up the highest surface over its spot: under a
 * roof, a balcony, a bridge, a tree or a tunnel's hill it does not exist, and
 * right outside the glass it falls as hard as anywhere. So indoors stays dry
 * while the rain beyond the windows keeps going, with no "am I inside" switch.
 * Splashes land on whatever is really there (roofs, decks, the street), not on
 * a flat sheet at your own height, which is what floated over the valley as a
 * line when you looked out from the hills.
 *
 * Rain is two layers of GPU-moved streaks that wrap round the camera: 9,000 in
 * a 36 m box near you, and 14,000 longer, finer ones in a 150 m box that take
 * over past ~12 m and fade out into the storm's fog, so there is no edge where
 * the rain stops. Each is stretched along its fall RELATIVE to the camera (at
 * speed it comes at the windshield), gusts lean it, sheets of heavier rain
 * sweep through, and drops in the headlight beam light up. None fall inside
 * the car you are in. In a storm, real bolts fork down to the ground a few
 * kilometres off; the thunder comes after them at the speed of sound, from
 * their direction. On the glass (wetGlass, applied to every car's glass
 * material by carBody.js) droplets bead in cells; on the windshield the
 * wiper's sweep clears them (each fragment works out when the blade last
 * passed it) and at speed they run up the glass. The Aurora's wiper blade
 * really sweeps. Windows of houses and set pieces (wetWindow, kit glass) bead
 * and run. The car's grip drops a little in the wet (world.js -> vehicle.js
 * wetGrip), tyres throw spray, and the rain is synthesized drop by drop
 * (RainAudio): different in the open, under a roof and in the cabin.
 */
import * as T from 'three';
import {Fn, uniform, attribute, vec2, vec3, vec4, float, positionLocal, normalLocal, positionWorld, normalWorld, cameraPosition, fract, floor, abs, mix, smoothstep, step,
  length, normalize, cross, clamp, max, min, hash, acos, atan, select, mod, dot, sin, pow, texture, time} from 'three/tsl';

export const WEATHERS = [['clear', 'Clear skies'], ['rain', 'Rain'], ['storm', 'Thunderstorm']];
const LEVEL = {clear: 0, rain: .6, storm: 1};

export const weather = {rain: uniform(0), wet: uniform(0), cloud: uniform(0), flash: uniform(0), flashDir: uniform(new T.Vector3(0, 1, 0))};

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


/** Rain on a window (kit glass: houses, the sky deck, set pieces), in world
 *  space so every pane shares one pattern: beads that come and go, and drops
 *  that let go and run down the pane, a thin wet trail above each. Panes that
 *  face the sky (glass roofs) only bead. It lingers while the glass is wet. */
export function wetWindow(mat, {local = false} = {}) {
  const G = glassRain, amt = clamp(weather.rain.mul(.8).add(weather.wet.mul(.45)), 0, 1);
  const base = mat.colorNode || vec3(mat.color.r, mat.color.g, mat.color.b), baseOpacity = mat.opacityNode || float(mat.opacity);
  // `local`: glass that moves (the sky-deck elevator, sliding doors) carries its drops with it.
  const Pp = local ? positionLocal : positionWorld, N = local ? normalLocal : normalWorld, upright = smoothstep(.55, .3, abs(N.y));
  const tz = normalize(vec2(N.z.negate(), N.x).add(vec2(1e-4, 0)));
  const q = vec2(dot(Pp.xz, tz), Pp.y);
  // Beads: one per cell, each living a few seconds before it runs off.
  const bead = (scale, seed) => {
    const s = q.mul(scale), cell = floor(s), f = fract(s).sub(.5);
    const k = cell.x.mul(157).add(cell.y.mul(331)).add(seed);
    const h1 = hash(k), h2 = hash(k.add(1013)), h3 = hash(k.add(2027)), h4 = hash(k.add(3041));
    const rad = h3.mul(.18).add(.12), dv = f.sub(vec2(h1.sub(.5), h2.sub(.5)).mul(.5)), d = length(dv).div(rad);
    const I = h4.mul(4).add(3), life = step(fract(time.div(I).add(h1)), .82).mul(step(h4, amt.mul(1.15)));
    return {body: smoothstep(1, .5, d).mul(life), hi: smoothstep(.45, .1, length(dv.add(vec2(rad.mul(.3), rad.mul(-.32)))).div(rad)).mul(life)};
  };
  const A = bead(26, 0), B = bead(61, 77);
  // Runners: in 9 cm columns, a drop slides down a 1.7 m tile, wobbling, a trail behind it.
  const colW = .09, L = 1.7, col = floor(q.x.div(colW)), h = hash(col.mul(7.31).add(floor(q.y.div(L)).mul(.71)));
  const speed = h.mul(.5).add(.18), headY = fract(time.mul(speed).div(L).add(h.mul(9.7))).oneMinus().mul(L);
  const vy = fract(q.y.div(L)).mul(L), dy = vy.sub(headY);
  const cx = fract(q.x.div(colW)).sub(.5).mul(colW).sub(sin(q.y.mul(9).add(h.mul(40))).mul(.012));
  const runOn = step(h, amt.mul(.42)).mul(upright);
  const head = smoothstep(.022, .01, length(vec2(cx, dy.mul(.75)))).mul(runOn);
  const trail = smoothstep(.006, .002, abs(cx)).mul(step(0, dy)).mul(smoothstep(.55, 0, dy)).mul(runOn);
  const body = max(max(A.body, B.body.mul(.8)), head), hi = max(max(A.hi, B.hi), head.mul(.8)), wet = trail.mul(.5);
  mat.colorNode = base.mul(float(1).sub(body.mul(.25))).add(vec3(.55, .6, .68).mul(G.light).mul(body.mul(.25).add(hi.mul(1.2)).add(wet.mul(.3))));
  mat.opacityNode = max(baseOpacity, body.mul(.35).add(hi.mul(.4)).add(wet.mul(.2)).min(.9));
}

/* ------------------------------------------------------- where it can rain */
const OCC_N = 1024, OCC_EXT = 128;
const _c = new T.Color();
/** A top-down height map of the highest surface round the camera: rendered
 *  from straight above with one override material that writes each fragment's
 *  height (relative to the camera) and a "something is here" flag. The sky,
 *  additive glows, sprites, lines, moving cars and the rain itself are left out. */
class RainOcclusion {
  constructor(renderer, scene, skip) {
    this.renderer = renderer; this.scene = scene; this.skip = new Set(skip);
    this.rt = new T.RenderTarget(OCC_N, OCC_N, {type: T.HalfFloatType, minFilter: T.NearestFilter, magFilter: T.NearestFilter, generateMipmaps: false, depthBuffer: true});
    this.rt.texture.name = 'rainOcclusion';
    this.cam = new T.OrthographicCamera(-OCC_EXT / 2, OCC_EXT / 2, OCC_EXT / 2, -OCC_EXT / 2, 1, 1700);
    this.cam.up.set(0, 0, -1);
    this.origin = uniform(new T.Vector3(0, -1e4, 0)); this.ready = uniform(0); this.flip = uniform(0);   // 1 would mirror the map in z (measured: three samples this target unflipped)
    const mat = new T.MeshBasicNodeMaterial({side: T.DoubleSide, fog: false, toneMapped: false});
    mat.outputNode = vec4(positionWorld.y.sub(this.origin.y), 1, 0, 1);
    this.mat = mat; this.cands = []; this.listT = 0; this.roof = 0; this.last = new T.Vector3(1e9, 0, 0); this.age = 1e9;
  }
  /** What to leave out of the map (re-listed every couple of seconds as the world streams). */
  collect() {
    const out = [], walk = o => {
      if (this.skip.has(o) || o.userData.noRain) { out.push(o); return; }
      if (o.isPoints || o.isLine || o.isSprite) { out.push(o); return; }
      if (o.isMesh) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        if (ms.some(m => m && (m.blending === T.AdditiveBlending || m.side === T.BackSide || (m.depthWrite === false && !m.transparent)))) { out.push(o); return; }
      }
      for (const c of o.children) walk(c);
    };
    walk(this.scene); this.cands = out;
  }
  /** Re-render when the camera has moved enough (or every half second, for things that move). */
  update(dt, camera, force = false) {
    const c = camera.position; this.age += dt; this.listT -= dt;
    if (!force && Math.hypot(c.x - this.last.x, c.z - this.last.z) < 5 && Math.abs(c.y - this.last.y) < .5 && this.age < .5) return;
    this.age = 0; this.last.copy(c);
    if (this.listT <= 0) { this.listT = 2; this.collect(); }
    const texel = OCC_EXT / OCC_N, ox = Math.round(c.x / texel) * texel, oz = Math.round(c.z / texel) * texel;
    this.cam.position.set(ox, c.y + 600, oz); this.cam.lookAt(ox, c.y - 100, oz); this.cam.updateMatrixWorld();
    this.origin.value.set(ox, c.y, oz);
    const R = this.renderer, S = this.scene, prevRT = R.getRenderTarget(), prevA = R.getClearAlpha(), prevO = S.overrideMaterial; R.getClearColor(_c);
    const hid = []; for (const o of this.cands) if (o.visible) { o.visible = false; hid.push(o); }
    S.overrideMaterial = this.mat;
    try { R.setRenderTarget(this.rt); R.setClearColor(0x000000, 0); R.render(S, this.cam); this.ready.value = 1; this.peek(); }
    finally { S.overrideMaterial = prevO; R.setRenderTarget(prevRT); R.setClearColor(_c, prevA); for (const o of hid) o.visible = true; }
  }
  /** Is there a roof over the camera? One texel read back (async, a frame or two late) for
   *  the sound: indoors means under something 0.4 to 30 m above your head. */
  peek() {
    if (this.peeking) return; this.peeking = true;
    const y0 = this.origin.value.y;
    this.renderer.readRenderTargetPixelsAsync(this.rt, OCC_N / 2, OCC_N / 2, 1, 1).then(px => {
      const h = px instanceof Uint16Array ? T.DataUtils.fromHalfFloat(px[0]) : px[0], has = px instanceof Uint16Array ? px[1] > 0 : px[1] > .5;
      this.roof = has && h > .4 && h < 30 ? 1 : 0; this.roofY = y0 + h;
    }).catch(() => {}).finally(() => { this.peeking = false; });
  }
  /** The surface over a world point: {h: its height, has: 1 if anything is there}. */
  sample(p) {
    const uv0 = p.xz.sub(this.origin.xz).div(OCC_EXT).add(.5);
    const s = texture(this.rt.texture, vec2(uv0.x, mix(uv0.y, float(1).sub(uv0.y), this.flip)));
    const inside = step(0, uv0.x).mul(step(uv0.x, 1)).mul(step(0, uv0.y)).mul(step(uv0.y, 1));
    return {h: s.x.add(this.origin.y), has: s.y.mul(inside).mul(this.ready)};
  }
  /** 1 where a point is under something (a roof, a deck, a tree, a hill). */
  under(p) { const s = this.sample(p); return s.has.mul(step(p.y, s.h.sub(.03))); }
}

/* ------------------------------------------------------------- the rain */
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
/* The two layers. len: [per m/s of fall, min, max]; width: [per metre away, base]; fades in metres from the eye. */
const NEAR = {box: 36, n: 9000, len: [.028, .28, 1.8], width: [.0011, .0055], fadeIn: [.5, 1.6], fadeOut: [18, 11], alpha: .42};
const FAR = {box: 150, n: 14000, len: [.11, 1.1, 3.6], width: [.0009, .006], fadeIn: [10, 19], fadeOut: [74, 52], alpha: .3};

export class Weather {
  /** opts.groundAt(x, z): the terrain height (where a bolt lands). */
  constructor(scene, renderer = null, {groundAt = null} = {}) {
    this.mode = 'clear'; this.t = 0; this.flashT = 8; this.flashSeq = null; this.wipeT = 0; this.wiping = false; this.groundAt = groundAt;
    this.U = {cam: uniform(new T.Vector3()), vel: uniform(new T.Vector3()), fall: uniform(new T.Vector3(.8, -9.5, .4)), t: uniform(0),
      shelter: uniform(new T.Matrix4()), shelter2: uniform(new T.Matrix4()), share: uniform(0), color: uniform(new T.Color('#a8b0bc')), ground: uniform(0), splash: uniform(0),
      sheets: uniform(.5), headPos: uniform(new T.Vector3(0, -1e4, 0)), headDir: uniform(new T.Vector3(0, 0, 1)), headOn: uniform(0)};
    this.camPrev = null; this.camVel = new T.Vector3(); this.gust = 0;
    this.occ = renderer ? new RainOcclusion(renderer, scene, []) : null;
    this.near = this.makeStreaks(NEAR); this.far = this.makeStreaks(FAR); scene.add(this.near, this.far);
    this.streaks = this.near;
    this.splashes = this.makeSplashes(1100); scene.add(this.splashes);
    this.bolt = new Bolt(scene);
    for (const m of [this.near, this.far, this.splashes, this.bolt.mesh]) this.occ?.skip.add(m);
    this.audio = null;
  }
  /** Inside either sheltering car (the one you drive, the one you ride in)? 1 if so. */
  sheltered(p) {
    const box = M => { const L = M.mul(vec4(p, 1)).xyz; return step(abs(L.x), 1.08).mul(step(-.3, L.y)).mul(step(L.y, 1.5)).mul(step(abs(L.z.sub(.05)), 2.5)); };
    return max(box(this.U.shelter), box(this.U.shelter2));
  }
  /** Under a roof (or anything else) by the height map; 0 before the first map. */
  under(p) { return this.occ ? this.occ.under(p) : float(0); }
  /** Sheets of heavier rain sweeping through on the wind, 0..1. */
  sheet(p) {
    const U = this.U;
    return sin(p.x.mul(.041).add(U.t.mul(1.25)).add(sin(p.z.mul(.027).add(U.t.mul(.35))).mul(2))).mul(sin(p.z.mul(.049).sub(U.t.mul(.9)).add(p.x.mul(.013)))).mul(.5).add(.5);
  }
  makeStreaks(L) {
    const U = this.U, mat = new T.MeshBasicNodeMaterial({transparent: true, depthWrite: false, side: T.DoubleSide});
    const seed = attribute('seed', 'vec4'), corner = attribute('corner', 'vec2');
    mat.positionNode = Fn(() => {
      const sp = seed.w.mul(.35).add(.82), half = float(L.box / 2);
      const p = mod(seed.xyz.mul(L.box).add(U.fall.mul(U.t.mul(sp))).sub(U.cam).add(half), float(L.box)).add(U.cam).sub(half).toVar();
      const rel = U.fall.mul(sp).sub(U.vel), dir = normalize(rel), len = clamp(length(rel).mul(L.len[0]), L.len[1], L.len[2]);
      const toCam = p.sub(U.cam), dist = max(length(toCam), .01), sideV = normalize(cross(dir, toCam.div(dist)));
      const dense = U.share.mul(mix(float(1), this.sheet(p).mul(1.1).add(.25), U.sheets));
      const on = step(fract(seed.x.mul(91.7).add(seed.z.mul(13.3))), dense).mul(float(1).sub(this.sheltered(p))).mul(float(1).sub(this.under(p)))
        .mul(step(L.fadeIn[0] * .8, dist)).mul(step(dist, L.fadeOut[0]));
      const w = dist.mul(L.width[0]).add(L.width[1]).mul(on);
      return p.sub(dir.mul(len.mul(corner.y).mul(on))).add(sideV.mul(w.mul(corner.x)));
    })();
    const dist = length(positionWorld.sub(cameraPosition)), bright = seed.y.mul(.7).add(.65);
    // Drops in the headlight beam catch it.
    const hp = positionWorld.sub(U.headPos), hd = max(length(hp), .01), beam = smoothstep(.86, .975, dot(hp.div(hd), U.headDir)).mul(smoothstep(48, 3, hd)).mul(U.headOn);
    mat.colorNode = U.color.mul(bright).add(vec3(1, .95, .86).mul(beam.mul(1.8)));
    // Per pixel too: a streak whose drop is outside can still be stretched back into the cabin at speed, or under the eaves.
    mat.opacityNode = float(1).sub(abs(corner.x)).mul(float(1).sub(corner.y.mul(.7))).mul(smoothstep(L.fadeOut[0], L.fadeOut[1], dist)).mul(smoothstep(L.fadeIn[0], L.fadeIn[1], dist))
      .mul(L.alpha).mul(float(1).add(beam.mul(1.4))).mul(float(1).sub(this.sheltered(positionWorld))).mul(float(1).sub(this.under(positionWorld)));
    const m = new T.Mesh(quads(L.n), mat); m.frustumCulled = false; m.renderOrder = 4; m.visible = false; m.userData.noRain = true;
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
      // On whatever is really there: a roof, a deck, the road (the camera's own ground until the first map).
      const s = this.occ ? this.occ.sample(vec3(xz.x, 0, xz.y)) : {h: U.ground, has: float(0)};
      const ready = this.occ ? this.occ.ready : float(0), y = mix(U.ground, s.h, ready);
      const p = vec3(xz.x, y.add(.025), xz.y);
      const on = step(fract(seed.x.mul(53.1).add(seed.y.mul(7.7))), U.splash.mul(mix(float(1), this.sheet(p).mul(1.1).add(.25), U.sheets)))
        .mul(float(1).sub(this.sheltered(p))).mul(mix(float(1), s.has, ready))
        .mul(step(y, U.cam.y.sub(.25)));                 // only on what is below your eyes: never rings floating in a canopy overhead
      const size = seed.y.mul(.09).add(.06).mul(ph.mul(.8).add(.35)).mul(on);
      return p.add(vec3(corner.x.mul(size), 0, corner.y.mul(2).sub(1).mul(size)));
    })();
    const {ph} = cyc(), r = length(vec2(corner.x, corner.y.mul(2).sub(1)));
    const ring = smoothstep(.16, 0, abs(r.sub(ph.mul(.85)))).mul(float(1).sub(ph)), crown = smoothstep(.4, 0, r).mul(step(ph, .22));
    mat.colorNode = U.color.mul(1.15);
    mat.opacityNode = ring.mul(.55).add(crown.mul(.6)).mul(smoothstep(18, 9, length(positionWorld.sub(cameraPosition))));
    const m = new T.Mesh(quads(n), mat); m.frustumCulled = false; m.renderOrder = 4; m.visible = false; m.userData.noRain = true;
    return m;
  }
  set(mode) { this.mode = LEVEL[mode] != null ? mode : 'clear'; }
  /** Jump straight to the full weather (tests, and joining a lobby mid-storm). */
  snap() { const l = this.level; weather.cloud.value = l ? Math.min(1, .75 + l * .25) : 0; weather.rain.value = l; weather.wet.value = l; glassRain.amount.value = Math.min(1, l * 1.25); }
  get level() { return LEVEL[this.mode]; }
  /** 1 when something is over the camera (a roof, a deck): the rain map's own answer. */
  get roofed() { return this.occ && this.occ.ready.value && (this.near.visible || this.splashes.visible) ? this.occ.roof : 0; }

  /** o: {dt, camera, shelter: Object3D|null, shelter2, ground, covered 0..1 (tunnel / roof over the car),
   *  indoor 0..1 (on foot under a roof), day, wipers (car powered), cockpit, inCar, speed,
   *  head: {pos, dir, on} (the car's headlights), audio: {ctx, out}|null} */
  update(o) {
    const {dt, camera} = o, U = this.U, target = this.level;
    this.t += dt; U.t.value = this.t;
    // Ease toward the chosen weather: the cloud first, the rain after it, the ground wets and dries slowly.
    const ease = (u, to, up, down) => { u.value += (to - u.value) * (1 - Math.exp(-dt / (to > u.value ? up : down))); };
    ease(weather.cloud, target ? Math.min(1, .75 + target * .25) : 0, 4, 10);
    ease(weather.rain, weather.cloud.value > .55 ? target : 0, 5, 4);
    ease(weather.wet, Math.max(weather.rain.value, 0), 25, 90);
    const rain = weather.rain.value, cover = Math.max(0, Math.min(1, o.covered || 0)), storm = this.mode === 'storm';
    // Camera velocity (smoothed) stretches the streaks.
    const c = camera.position;
    if (this.camPrev && dt > 0) this.camVel.lerp(new T.Vector3().subVectors(c, this.camPrev).divideScalar(dt).clampLength(0, 120), Math.min(1, dt * 8));
    this.camPrev = (this.camPrev || new T.Vector3()).copy(c);
    U.cam.value.copy(c); U.vel.value.copy(this.camVel); U.ground.value = o.ground ?? c.y - 1.6;
    // The wind gusts: the rain leans further over and back.
    this.gust += ((Math.sin(this.t * .37) * .5 + Math.sin(this.t * .113 + 1.7) * .5) * (.5 + target) - this.gust) * Math.min(1, dt * .8);
    U.fall.value.set(.8 + target * 1.6 + this.gust * 1.8, -9.5 - target * 1.5, .4 + target * .9 + this.gust * .7);
    U.sheets.value = storm ? .85 : .5;
    // Where the rain is hidden is the height map's job; the cover factor is only for sound and the glass.
    U.share.value = rain * (storm ? 1 : .62);
    U.splash.value = rain * Math.max(0, 1 - this.camVel.length() / 30);
    for (const [u, s] of [[U.shelter, o.shelter], [U.shelter2, o.shelter2]]) {
      if (s) u.value.copy(s.matrixWorld).invert(); else u.value.makeTranslation(1e6, 1e6, 1e6);
    }
    const H = o.head; if (H && H.on) { U.headPos.value.copy(H.pos); U.headDir.value.copy(H.dir).normalize(); U.headOn.value = 1; } else U.headOn.value = 0;
    const day = o.day ?? 1, lum = .14 + day * .6;
    U.color.value.setRGB(.62 * lum, .66 * lum, .74 * lum).multiplyScalar(1 + weather.flash.value * 2);
    const showing = U.share.value > .003;
    this.near.visible = this.far.visible = showing; this.splashes.visible = U.splash.value > .003;
    if (this.occ && (showing || this.splashes.visible)) this.occ.update(dt, camera);
    // Lightning, in a storm: a flicker of two or three strokes; mostly a real
    // bolt to the ground a few km off, sometimes a flash inside the cloud.
    // The thunder comes after it at the speed of sound, from its direction.
    if (storm && rain > .5) {
      this.flashT -= dt;
      if (this.flashT < 0) {
        this.flashT = 6 + Math.random() * 15;
        const strokes = [[0, .9], [.07, 0], [.12, .6], [.2, 0]]; if (Math.random() < .5) strokes.push([.32, 1], [.42, 0]);
        const k = .55 + Math.random() * .45, cloud = Math.random() < .3;
        let at, dist;
        if (cloud) { const a = Math.random() * Math.PI * 2; dist = 2500 + Math.random() * 3500; at = new T.Vector3(c.x + Math.sin(a) * dist, c.y + 900, c.z + Math.cos(a) * dist); }
        else { const b = this.bolt.strike(c, this.groundAt); at = new T.Vector3(b.x, b.y, b.z); dist = b.d; }
        weather.flashDir.value.subVectors(at, c).normalize();
        this.flashSeq = {t: 0, strokes, k: cloud ? k * .7 : k, bolt: !cloud};
        const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), to = at.clone().sub(c).setY(0).normalize();
        this.audio?.thunder({delay: dist / 343, k: this.flashSeq.k, pan: Math.max(-1, Math.min(1, to.dot(right))), dist});
      }
    }
    if (this.flashSeq) {
      const F = this.flashSeq; F.t += dt; let v = 0;
      for (const [t0, a] of F.strokes) if (F.t >= t0) v = a;
      this.bolt.show(F.bolt ? Math.max(v, F.t < .5 ? .08 : 0) * F.k : 0);
      if (F.t > .2 && v === 0) v = Math.max(0, .25 - (F.t - .2)) * .8;
      weather.flash.value = v * F.k; if (F.t > .8) { this.flashSeq = null; weather.flash.value = 0; this.bolt.show(0); }
    } else weather.flash.value = 0;
    // Glass: beads in proportion to the rain, the wiper on whenever it rains and the car has power.
    const G = glassRain, now = performance.now() / 1000; G.now.value = now;
    G.amount.value += (Math.min(1, rain * 1.25 * (1 - cover * .8)) - G.amount.value) * (1 - Math.exp(-dt / (rain > G.amount.value ? 6 : 40)));
    G.light.value = lum * (1 + weather.flash.value * 2);
    G.period.value = storm ? 1.05 : 1.5;
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
    this.audio?.update(dt, {rain, storm, cover, indoor: o.indoor || 0, cabin: o.inCar ? 1 : 0, speed: o.speed || 0, wiper: this.wiping && o.cockpit ? ph : -1});
  }
}

/* ------------------------------------------------------------- lightning */
/** A forked bolt: jagged ribbons facing the camera, a hot core and a wide
 *  soft halo, drawn additively and unfogged so it cuts through the storm. */
class Bolt {
  constructor(scene) {
    const MAX = this.MAX = 900, g = new T.BufferGeometry();
    this.A = new Float32Array(MAX * 12); this.B = new Float32Array(MAX * 12); this.W = new Float32Array(MAX * 8);
    const corner = new Float32Array(MAX * 8), idx = new Uint32Array(MAX * 6);
    for (let i = 0; i < MAX; i++) { corner.set([-1, 0, 1, 0, 1, 1, -1, 1], i * 8); idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); }
    g.setAttribute('position', new T.BufferAttribute(new Float32Array(MAX * 12), 3));
    g.setAttribute('uv', new T.BufferAttribute(new Float32Array(MAX * 8), 2));
    g.setAttribute('ba', new T.BufferAttribute(this.A, 3)); g.setAttribute('bb', new T.BufferAttribute(this.B, 3));
    g.setAttribute('bw', new T.BufferAttribute(this.W, 2)); g.setAttribute('corner', new T.BufferAttribute(corner, 2));
    g.setIndex(new T.BufferAttribute(idx, 1)); g.setDrawRange(0, 0);
    this.geo = g; this.I = uniform(0);
    const a = attribute('ba', 'vec3'), b = attribute('bb', 'vec3'), w = attribute('bw', 'vec2'), corner2 = attribute('corner', 'vec2');
    const mat = new T.MeshBasicNodeMaterial({transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false});
    mat.positionNode = Fn(() => {
      const p = mix(a, b, corner2.y), dir = normalize(b.sub(a)), side = normalize(cross(dir, normalize(p.sub(cameraPosition))));
      return p.add(side.mul(w.x.mul(corner2.x)));
    })();
    // w.y: 1 = the core, 0 = the halo.
    const prof = float(1).sub(abs(corner2.x));
    mat.colorNode = vec3(.8, .86, 1).mul(this.I).mul(mix(pow(prof, 2).mul(.16), smoothstep(0, .6, prof).mul(9), w.y));
    mat.opacityNode = float(1);
    this.mesh = new T.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.visible = false; this.mesh.userData.noRain = true;
    scene.add(this.mesh);
  }
  /** Builds a new bolt somewhere round `c`; returns where it is and how far. */
  strike(c, groundAt) {
    const az = Math.random() * Math.PI * 2, d = 900 + Math.random() * 2600, x = c.x + Math.sin(az) * d, z = c.z + Math.cos(az) * d;
    let gy = groundAt ? groundAt(x, z) : c.y - 30; if (!Number.isFinite(gy)) gy = 0;
    const top = Math.max(gy, 0) + 700 + Math.random() * 450;
    const segs = [];
    const jag = (p, q, rough, levels) => {
      let pts = [p, q];
      for (let l = 0; l < levels; l++) {
        const out = [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) {
          const s = pts[i], e = pts[i + 1], L = Math.hypot(e[0] - s[0], e[1] - s[1], e[2] - s[2]);
          out.push([(s[0] + e[0]) / 2 + (Math.random() - .5) * 2 * L * rough, (s[1] + e[1]) / 2 + (Math.random() - .5) * L * rough * .4, (s[2] + e[2]) / 2 + (Math.random() - .5) * 2 * L * rough], e);
        }
        pts = out;
      }
      return pts;
    };
    const add = (pts, w) => { for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1], w * (1 - i / pts.length * .45)]); };
    const main = jag([x + (Math.random() - .5) * 260, top, z + (Math.random() - .5) * 260], [x, gy, z], .2, 7);
    add(main, 3.2);
    // Forks off the upper two-thirds, thinner, petering out in the air.
    const nb = 4 + Math.floor(Math.random() * 5);
    for (let k = 0; k < nb; k++) {
      const i = Math.floor(Math.random() * main.length * .65), s = main[i], len = (top - gy) * (.15 + Math.random() * .3), ang = Math.random() * Math.PI * 2;
      const e = [s[0] + Math.sin(ang) * len * .7, s[1] - len * (.6 + Math.random() * .3), s[2] + Math.cos(ang) * len * .7];
      const br = jag(s, e, .25, 5); add(br, 1.4);
      if (Math.random() < .5) { const j = Math.floor(br.length * (.3 + Math.random() * .4)), s2 = br[j], l2 = len * .4, a2 = ang + (Math.random() - .5) * 2;
        add(jag(s2, [s2[0] + Math.sin(a2) * l2 * .7, s2[1] - l2 * .7, s2[2] + Math.cos(a2) * l2 * .7], .25, 4), .8); }
    }
    let n = 0;
    for (const [p, q, w] of segs) for (const [ww, core] of [[w, 1], [w * 9, 0]]) {
      if (n >= this.MAX) break;
      for (let k = 0; k < 4; k++) { this.A.set(p, (n * 4 + k) * 3); this.B.set(q, (n * 4 + k) * 3); this.W.set([ww, core], (n * 4 + k) * 2); }
      n++;
    }
    for (const name of ['ba', 'bb', 'bw']) this.geo.attributes[name].needsUpdate = true;
    this.geo.setDrawRange(0, n * 6);
    return {x, y: (gy + top) / 2, z, d: Math.hypot(x - c.x, (gy + top) / 2 - c.y, z - c.z)};
  }
  show(I) { this.I.value = I; this.mesh.visible = I > .001; }
}

/* ------------------------------------------------------------------ sound */
/* Rain, synthesized (2026-10-04, "make the rain sound more realistic, cooler
 * and better"). Real rain is thousands of single drops: each a tick as it
 * hits and, on water, a little rising "plink" from the bubble it traps. So the
 * loops here are built drop by drop (stereo, each drop placed left to right,
 * written round the end of the buffer so the loop has no seam) and layered:
 *   bed      a pink-noise wash, the far-off rain over the whole city
 *   fine     the dense crackle of drops on pavement and leaves round you
 *   plinks   bubbly drops into puddles and gutters
 *   body     a low roar, heavier in a storm
 *   near     a few big, close drops and drips
 * Under a roof the outside is muffled and dulled; you hear it on the roof and
 * tapping on the glass, with a gutter dripping. In the cabin: the roof
 * drumming and the windshield ticking, harder as you drive into it. Thunder is
 * a crack (when close), a boom and a long roll, panned toward the bolt and
 * thrown round a synthesized valley-sized reverb. */
const rand = (a, b) => a + Math.random() * (b - a);
function noiseBuf(ctx, sec, color) {
  const sr = ctx.sampleRate, n = Math.floor(sr * sec), buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'pink') {        // Paul Kellet's filter
        b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852; b3 = .8665 * b3 + w * .3104856;
        b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .11; b6 = w * .115926;
      } else if (color === 'brown') { br = (br + .02 * w) / 1.02; d[i] = br * 3.5; } else d[i] = w;
    }
    // Cross-fade the end into the start so the loop has no click.
    const f = Math.floor(sr * .05); for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }
  }
  return norm(buf, .25);
}
/** Scale a buffer to a set RMS, so every layer's gain means the same thing. */
function norm(buf, rms) {
  let s = 0, n = 0; for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i += 3) { s += d[i] * d[i]; n++; } }
  const k = rms / Math.max(1e-6, Math.sqrt(s / n)); for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < d.length; i++) d[i] *= k; }
  return buf;
}
/** A loop of single drops: rate per second, f: bubble pitch range (Hz), tau:
 *  ring time range (s), rise: how far the pitch climbs, click: the hit's tick. */
function dropsBuf(ctx, sec, {rate, f, tau, rise = .25, click = .5, spread = 1, loud = 2}) {
  const sr = ctx.sampleRate, n = Math.floor(sr * sec), buf = ctx.createBuffer(2, n, sr), L = buf.getChannelData(0), R = buf.getChannelData(1);
  const count = Math.floor(rate * sec);
  for (let k = 0; k < count; k++) {
    const at = Math.floor(Math.random() * n), pan = (Math.random() * 2 - 1) * spread, gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
    const a = Math.pow(Math.random(), loud), f0 = f[0] * Math.pow(f[1] / f[0], Math.random()), tc = rand(tau[0], tau[1]), m = Math.min(n, Math.ceil(tc * 6 * sr));
    const bubble = Math.random() < .7, r = rise * rand(.4, 1.4);
    let ph = 0, lp = 0;
    for (let j = 0; j < m; j++) {
      const t = j / sr, env = Math.exp(-t / tc);
      ph += 2 * Math.PI * f0 * (1 + r * (1 - Math.exp(-t / (tc * .8)))) / sr;
      lp += ((Math.random() * 2 - 1) - lp) * .5;
      const v = a * ((bubble ? Math.sin(ph) * env * .8 : 0) + lp * click * Math.exp(-t / .0007));
      const i = (at + j) % n; L[i] += v * gl; R[i] += v * gr;
    }
  }
  return norm(buf, .25);
}
/** A stereo impulse response: decaying noise that darkens as it dies (open air off hills and buildings). */
function reverbIR(ctx, sec, decay) {
  const sr = ctx.sampleRate, n = Math.floor(sr * sec), buf = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { const t = i / sr, a = .9 - .85 * (t / sec); lp += ((Math.random() * 2 - 1) - lp) * a; d[i] = lp * Math.exp(-t / decay) * (t < .02 ? t / .02 : 1); } }
  return buf;
}

class RainAudio {
  constructor(ctx, out) {
    this.ctx = ctx;
    const src = (b, rate = 1) => { const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.playbackRate.value = rate; s.start(0, Math.random() * b.duration); return s; };
    const filt = (type, f, q = .7, gain = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b; };
    const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    this.bus = gain(1); this.bus.connect(out);
    this.white = noiseBuf(ctx, 2, 'white'); this.brown = noiseBuf(ctx, 4, 'brown');
    // Outside: everything through one filter that closes when you are under a roof or in the car.
    this.outF = filt('lowpass', 16000, .5); this.outG = gain(1); this.outF.connect(this.outG).connect(this.bus);
    const layer = (node, chain, level) => { const g = gain(0); let n = node; for (const c of chain) n = n.connect(c); n.connect(g).connect(this.outF); g.level = level; return g; };
    this.bed = layer(src(noiseBuf(ctx, 6.1, 'pink')), [filt('highpass', 280), filt('peaking', 4200, .8, 4), filt('lowpass', 11000)], .16);
    this.fine = layer(src(dropsBuf(ctx, 7.3, {rate: 1100, f: [2600, 7500], tau: [.0012, .004], rise: .15, click: .9, loud: 2.4})), [filt('highpass', 900)], .12);
    this.plinks = layer(src(dropsBuf(ctx, 5.9, {rate: 70, f: [900, 3600], tau: [.006, .024], rise: .45, click: .25, loud: 1.6})), [], .085);
    this.body = layer(src(this.brown), [filt('lowpass', 320)], .1);
    this.near = layer(src(dropsBuf(ctx, 4.7, {rate: 9, f: [420, 1500], tau: [.01, .035], rise: .5, click: .7, loud: 1.3})), [filt('highpass', 160)], .11);
    // Under cover: on the roof (low drumming) and on the glass (bright ticks), plus a gutter dripping.
    this.roof = gain(0); src(dropsBuf(ctx, 6.7, {rate: 480, f: [160, 900], tau: [.006, .03], rise: .1, click: .6, loud: 2})).connect(filt('lowpass', 1600)).connect(this.roof).connect(this.bus);
    this.glass = gain(0); src(dropsBuf(ctx, 5.3, {rate: 140, f: [3000, 6500], tau: [.0006, .002], rise: .05, click: 1, loud: 2.2})).connect(filt('highpass', 1400)).connect(this.glass).connect(this.bus);
    // Thunder: dry, plus a long open-air reverb.
    this.thF = filt('lowpass', 18000, .5); this.thunderBus = gain(1); this.thunderBus.connect(this.thF).connect(this.bus);
    this.verb = ctx.createConvolver(); this.verb.buffer = reverbIR(ctx, 4.5, 1.3); this.verbG = gain(.55);
    this.thunderBus.connect(this.verb).connect(this.verbG).connect(this.thF);
    this.lastPh = 0; this.dripT = 1; this.under = 0;
  }
  update(dt, {rain, storm, cover, indoor, cabin, speed, wiper}) {
    const t = this.ctx.currentTime, r = Math.min(1, rain), set = (g, v, tc = .4) => g.gain.setTargetAtTime(v, t, tc);
    // How shut in: in the car, under a roof on foot, or in a tunnel / under a deck.
    const shut = Math.max(cabin, indoor, cover * .8);
    this.under += (shut - this.under) * Math.min(1, dt * 3);
    const u = this.under, open = 1 - u;
    this.outF.frequency.setTargetAtTime(16000 * Math.pow(650 / 16000, u), t, .15);
    set(this.outG, 1 - u * .45 - cover * .35);
    const heavy = storm ? 1 : .55;
    set(this.bed, r * this.bed.level * (.55 + heavy * .45)); set(this.fine, r * this.fine.level * (.4 + open * .6));
    set(this.plinks, r * this.plinks.level * (.5 + open * .5)); set(this.body, r * this.body.level * heavy);
    set(this.near, r * this.near.level * open);
    // In the car the drumming and ticking build as you drive into it.
    const drive = 1 + Math.min(1, speed / 25) * .7;
    set(this.roof, r * (cabin * .2 * drive + indoor * (1 - cabin) * .12));
    set(this.glass, r * (cabin * .07 * drive + indoor * (1 - cabin) * .05));
    this.thF.frequency.setTargetAtTime(18000 * Math.pow(500 / 18000, u), t, .2);
    // A gutter dripping outside the window.
    if (indoor > .5 && r > .2 && cabin < .5) { this.dripT -= dt; if (this.dripT < 0) { this.dripT = rand(.35, 1.3) / (.5 + r * .5); this.drip(); } }
    // The wiper: a soft rubber thump as the blade turns at each end.
    if (wiper >= 0) { if ((this.lastPh < .5 && wiper >= .5) || wiper < this.lastPh) this.thump(); this.lastPh = wiper; }
  }
  drip() {
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner(), f = rand(700, 1300);
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * rand(1.4, 1.9), t + .05);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(rand(.025, .05), t + .002); g.gain.exponentialRampToValueAtTime(.0005, t + .09);
    p.pan.value = rand(-.6, .6); o.connect(g).connect(p).connect(this.bus); o.start(t); o.stop(t + .1);
  }
  thump() {
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.white; f.type = 'lowpass'; f.frequency.value = 260; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.14, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + .12);
    s.connect(f).connect(g).connect(this.bus); s.start(t, Math.random()); s.stop(t + .15);
  }
  /** delay: seconds after the flash (distance / 343); k: strength; pan -1..1; dist in metres. */
  thunder({delay, k, pan = 0, dist = 2000}) {
    const c = this.ctx, t = c.currentTime + Math.min(delay, 14), close = dist < 1600;
    const P = c.createStereoPanner(); P.pan.value = pan * .75; P.connect(this.thunderBus);
    const noise = (buf, type, f) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; s.connect(b); return {s, b}; };
    const far = Math.min(1, dist / 5000);
    // The crack: a tearing burst of clicks, only when it is close.
    if (close) {
      const n = noise(this.white, 'highpass', 900), g = c.createGain(); g.gain.setValueAtTime(0, t);
      let at = t; for (let i = 0; i < 26; i++) { at += rand(.004, .022); g.gain.setValueAtTime(rand(.15, .55) * k * (1 - i / 30), at); g.gain.setTargetAtTime(0, at + .002, .006); }
      n.b.connect(g).connect(P); n.s.start(t, Math.random()); n.s.stop(at + .2);
    }
    // The boom, then a long roll with swells as it comes back off the hills.
    const b = noise(this.brown, 'lowpass', close ? 900 : 380), g = c.createGain();
    b.b.frequency.setValueAtTime(close ? 900 : 380 - far * 150, t); b.b.frequency.exponentialRampToValueAtTime(70, t + 5 + far * 3);
    const atk = close ? .04 : .25 + far * .6;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.1 * k * (1 - far * .55), t + atk);
    let at = t + atk + .2; for (let i = 0; i < 5; i++) { at += rand(.35, 1.1); g.gain.linearRampToValueAtTime(rand(.25, .8) * k * (1 - far * .5), at); }
    g.gain.exponentialRampToValueAtTime(.001, at + 2.8);
    b.b.connect(g).connect(P); b.s.start(t, Math.random() * 3); b.s.stop(at + 3);
  }
}
