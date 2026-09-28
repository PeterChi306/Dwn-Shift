/* The world's own sound, on foot (2026-09-27 pass 11).
 *
 * Out of the car you hear where you are: wind (stronger up in the hills),
 * the city far below as a low hum, birds by day (house finches, a mourning
 * dove, a mockingbird running through its phrases), crickets after dark,
 * and whatever is near you: the water table's trickle, the pool lapping, the
 * spa bubbling, the fire crackling. Footsteps follow the ground under you:
 * stone and pavement click, wood knocks hollow, grass swishes, dirt crunches,
 * water splashes. Everything is synthesised; nothing is loaded.
 *
 * It rides game.js's ambience bus (DwnDrive.audio.out), so mute and the music
 * duck reach it. The car's own engine fading as you walk away is game.js's
 * flyby stage (DwnDrive.setWalk).
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

export class Soundscape {
  constructor() { this.ready = false; this.srcs = new Map(); this.birdT = 2; this.fireT = 0; this.t = 0; this.level = 0; }

  init(audio) {
    const ctx = this.ctx = audio.ctx, sr = ctx.sampleRate;
    this.out = ctx.createGain(); this.out.gain.value = 0; this.out.connect(audio.out);
    // White and brown noise, two seconds and four.
    const mk = (secs, f) => { const b = ctx.createBuffer(1, Math.floor(sr * secs), sr), d = b.getChannelData(0); f(d); return b; };
    this.white = mk(2, d => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
    this.brown = mk(4, d => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + .02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l * 3.5; } });
    // Beds: wind, the distant city, crickets.
    this.wind = this.bed(this.brown, 1, [['bandpass', 420, .5]]);
    this.windHi = this.bed(this.white, .6, [['bandpass', 1800, .9]]);
    this.city = this.bed(this.brown, .55, [['lowpass', 210, .7]]);
    this.crickets = this.bed(this.cricketBuffer(), 1, []);
    this.ready = true;
  }
  /** A looping buffer through a filter chain into a gain on the out bus. */
  bed(buffer, rate, filters, dest = this.out) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = buffer; src.loop = true; src.playbackRate.value = rate;
    src.loopStart = 0; let node = src;
    const fl = filters.map(([type, f, q]) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; node.connect(b); node = b; return b; });
    const g = ctx.createGain(); g.gain.value = 0; node.connect(g); g.connect(dest);
    src.start(0, Math.random() * buffer.duration);
    return {src, g, fl};
  }
  /** Four seconds of a cricket chorus in stereo: several insects, each with
   *  its own pitch, chirp rate and place. */
  cricketBuffer() {
    const ctx = this.ctx, sr = ctx.sampleRate, n = sr * 4, b = ctx.createBuffer(2, n, sr), L = b.getChannelData(0), R = b.getChannelData(1);
    for (let k = 0; k < 7; k++) {
      const f = rand(4100, 5200), period = 4 / Math.round(4 / rand(.45, .9)), pulses = 2 + (k % 3), pan = rand(-.9, .9), amp = rand(.25, .6) * (k < 3 ? 1 : .45), off = Math.random() * period;
      for (let i = 0; i < n; i++) {
        const t = i / sr, tc = (t + off) % period, p = Math.floor(tc / .032);
        if (p >= pulses) continue;
        const tp = tc - p * .032; if (tp > .018) continue;
        const env = Math.sin(Math.PI * tp / .018) * amp, v = Math.sin(2 * Math.PI * f * t) * env;
        L[i] += v * (1 - pan) * .5; R[i] += v * (1 + pan) * .5;
      }
    }
    return b;
  }
  /** A local source (fountain, pool, spa, fire): built the first time you come near. */
  source(s) {
    const key = s.x.toFixed(1) + ',' + s.z.toFixed(1) + s.kind;
    let e = this.srcs.get(key); if (e) return e;
    const ctx = this.ctx, pan = ctx.createStereoPanner(), g = ctx.createGain(); g.gain.value = 0; g.connect(pan); pan.connect(this.out);
    e = {g, pan, s};
    const lfo = (hz, depth, param) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = hz; og.gain.value = depth; o.connect(og); og.connect(param); o.start(); };
    if (s.kind === 'fountain') {
      this.bed(this.white, 1, [['bandpass', 2600, .6]], g).g.gain.value = .5;
      const lo = this.bed(this.white, .5, [['bandpass', 700, 1.2]], g); lo.g.gain.value = .5; lfo(1.7, .2, lo.g.gain);
    } else if (s.kind === 'pool') {
      const lap = this.bed(this.brown, 1.4, [['lowpass', 650, .8]], g); lap.g.gain.value = .7; lfo(.31, .45, lap.g.gain);
      const hi = this.bed(this.white, .4, [['bandpass', 1500, 2]], g); hi.g.gain.value = .12; lfo(.53, .1, hi.g.gain);
    } else if (s.kind === 'spa') {
      const bub = this.bed(this.white, 1, [['bandpass', 520, 4]], g); bub.g.gain.value = 1.2; lfo(7.3, 260, bub.fl[0].frequency); lfo(3.1, .5, bub.g.gain);
      this.bed(this.brown, 1, [['lowpass', 180, .7]], g).g.gain.value = .5;
    } else if (s.kind === 'fire') {
      const roar = this.bed(this.brown, 1.2, [['lowpass', 380, .7]], g); roar.g.gain.value = .9; lfo(.8, .3, roar.g.gain);
      e.crackle = true;
    }
    this.srcs.set(key, e);
    return e;
  }
  /** One short noise burst through a band: the atom of footsteps and crackles. */
  burst(t, {f = 2000, q = 1, type = 'bandpass', gain = .2, at = .002, dec = .05, rate = 1, pan = 0, dest = this.out}) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.white; src.playbackRate.value = rate;
    const bf = ctx.createBiquadFilter(); bf.type = type; bf.frequency.value = f; bf.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + at); g.gain.exponentialRampToValueAtTime(1e-4, t + at + dec);
    let tail = g; if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
    src.connect(bf); bf.connect(g); tail.connect(dest);
    src.start(t, Math.random() * 1.5, at + dec + .02);
  }
  tone(t, {f = 100, f2 = f, gain = .2, at = .002, dec = .06, type = 'sine', pan = 0, dest = this.out}) {
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + at + dec);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + at); g.gain.exponentialRampToValueAtTime(1e-4, t + at + dec);
    let tail = g; if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
    o.connect(g); tail.connect(dest); o.start(t); o.stop(t + at + dec + .03);
  }

  /** A footfall on `surface`; `k` 0..1 how hard (walking ~.5, running 1). */
  step(surface, k = .5) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + .005, v = rand(.85, 1.15) * (.55 + k * .6), p = rand(-.08, .08);
    switch (surface) {
      case 'grass':
        this.burst(t, {f: rand(3200, 4400), q: .5, gain: .1 * v, at: .018, dec: .13, pan: p});
        this.burst(t + .03, {f: 1500, q: .7, gain: .05 * v, at: .02, dec: .09, pan: p});
        this.tone(t, {f: 70, f2: 50, gain: .08 * v, dec: .04});
        break;
      case 'dirt':
        for (let i = 0; i < 7; i++) this.burst(t + i * rand(.008, .016), {f: rand(2200, 5200), q: 1.2, gain: rand(.05, .12) * v, at: .001, dec: rand(.008, .02), pan: p});
        this.burst(t, {f: 900, q: .8, gain: .06 * v, at: .004, dec: .06, pan: p});
        this.tone(t, {f: 80, f2: 55, gain: .09 * v, dec: .05});
        break;
      case 'wood':
        this.tone(t, {f: rand(135, 160), f2: 92, gain: .22 * v, at: .002, dec: .09, pan: p});
        this.burst(t, {f: 1100, q: 1.4, gain: .1 * v, dec: .035, pan: p});
        this.tone(t + .055, {f: 190, f2: 120, gain: .08 * v, dec: .05, pan: p});
        break;
      case 'metal':
        this.tone(t, {f: 640, f2: 610, gain: .05 * v, dec: .2, pan: p}); this.tone(t, {f: 1370, f2: 1320, gain: .03 * v, dec: .16, pan: p});
        this.burst(t, {f: 3000, q: 1, gain: .1 * v, dec: .02, pan: p});
        break;
      case 'fabric':
        this.burst(t, {f: 600, q: .6, type: 'lowpass', gain: .1 * v, at: .01, dec: .07, pan: p});
        break;
      case 'water':
        this.burst(t, {f: 2400, q: .6, type: 'lowpass', gain: .22 * v, at: .01, dec: .22, pan: p});
        this.burst(t + .06, {f: 700, q: 2, gain: .1 * v, at: .02, dec: .18, pan: -p});
        for (let i = 0; i < 4; i++) this.tone(t + .05 + i * rand(.02, .05), {f: rand(500, 1300), f2: rand(900, 2000), gain: .025 * v, dec: .03});
        break;
      case 'swim':
        this.burst(t, {f: 1600, q: .5, type: 'lowpass', gain: .16 * v, at: .06, dec: .35, pan: p * 4});
        this.burst(t + .1, {f: 500, q: 1.5, gain: .07 * v, at: .05, dec: .25, pan: -p * 4});
        break;
      default: // stone, asphalt, concrete, tile: heel then toe
        this.burst(t, {f: surface === 'asphalt' ? rand(1600, 2100) : rand(2200, 2900), q: 1, gain: .17 * v, at: .001, dec: .04, pan: p});
        this.tone(t, {f: 95, f2: 60, gain: .1 * v, dec: .035});
        this.burst(t + rand(.04, .06), {f: rand(2800, 3600), q: 1.3, gain: .07 * v, at: .001, dec: .025, pan: p});
        if (surface === 'asphalt') for (let i = 0; i < 3; i++) this.burst(t + .01 + i * .012, {f: 4200, q: 2, gain: .025 * v, dec: .01});
    }
  }
  /** A splash: jumping in, a car rolling in. */
  splash(k = 1) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + .005;
    this.burst(t, {f: 3000, q: .4, type: 'lowpass', gain: .45 * k, at: .01, dec: .5});
    this.burst(t + .05, {f: 400, q: .8, type: 'lowpass', gain: .5 * k, at: .02, dec: .6});
    for (let i = 0; i < 10; i++) this.tone(t + .1 + i * rand(.03, .09), {f: rand(400, 1500), f2: rand(900, 2600), gain: .04 * k, dec: .04});
  }

  /* Birds (by day). */
  bird(t) {
    const pan = rand(-.85, .85), far = rand(.3, 1), kind = Math.random();
    const chirp = (t0, f0, f1, d, g) => this.tone(t0, {f: f0, f2: f1, gain: g * far, at: .006, dec: d, pan, type: 'sine'});
    if (kind < .45) {                          // house finch: a bright tumbling warble
      let tt = t; const n = 5 + Math.floor(Math.random() * 7);
      for (let i = 0; i < n; i++) { const f = rand(2600, 5200); chirp(tt, f, f * rand(.7, 1.25), rand(.04, .09), .035); tt += rand(.06, .13); }
    } else if (kind < .62) {                   // mourning dove: coo-OO-oo-oo, soft and low
      const notes = [[520, 560, .28], [600, 540, .5], [500, 470, .32], [490, 460, .32], [485, 455, .32]];
      let tt = t; for (const [a, b, d] of notes) { this.tone(tt, {f: a, f2: b, gain: .05 * far, at: .06, dec: d, pan}); this.tone(tt, {f: a * 2, f2: b * 2, gain: .008 * far, at: .06, dec: d, pan}); tt += d + .12; }
    } else if (kind < .85) {                   // mockingbird: a phrase, repeated three times
      const ph = Array.from({length: 3 + Math.floor(Math.random() * 3)}, () => [rand(1800, 4800), rand(1500, 5200), rand(.03, .08)]);
      let tt = t; for (let r = 0; r < 3; r++) { for (const [a, b, d] of ph) { chirp(tt, a, b, d, .03); tt += d + .025; } tt += .12; }
    } else {                                   // a sparrow's two-note call
      chirp(t, 4200, 3600, .07, .03); chirp(t + .16, 4400, 3900, .07, .03);
    }
  }

  /**
   * st: {on, x, y, z, yaw (facing, radians: forward = (sin, cos)), day 0..1,
   *      night 0..1, sources [{kind, x, y, z, r}], indoor 0..1}
   */
  update(dt, st) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime; this.t += dt;
    this.level += ((st.on ? 1 : 0) - this.level) * (1 - Math.exp(-dt * 1.6));
    this.out.gain.setTargetAtTime(this.level, t, .1);
    if (this.level < .01) return;
    const hill = clamp((st.y - 120) / 380, 0, 1), inside = st.indoor || 0;
    // Wind: gusts from a few slow sines; much stronger up in the hills, muffled indoors.
    const gust = .55 + .25 * Math.sin(this.t * .23) + .2 * Math.sin(this.t * .61 + 1.3) + .12 * Math.sin(this.t * 1.7 + .4);
    this.wind.g.gain.setTargetAtTime((.05 + hill * .14) * gust * (1 - inside * .75), t, .3);
    this.wind.fl[0].frequency.setTargetAtTime(300 + gust * 260, t, .3);
    this.windHi.g.gain.setTargetAtTime((.004 + hill * .018) * gust * gust * (1 - inside * .9), t, .3);
    // The city: a low hum, fainter from up the hill, a little louder at night when it is all you hear.
    this.city.g.gain.setTargetAtTime((.05 + (1 - hill) * .06) * (1 + st.night * .25) * (1 - inside * .6), t, .5);
    this.crickets.g.gain.setTargetAtTime(clamp((st.night - .25) / .5, 0, 1) * .085 * (1 - inside * .7), t, .8);
    // Birds.
    this.birdT -= dt;
    if (this.birdT < 0) { this.birdT = rand(.9, 4.2) / Math.max(.2, st.day); if (st.day > .35 && inside < .5) this.bird(t + .02); }
    // Local sources.
    const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw), rx = -fz, rz = fx;
    for (const s of st.sources || []) {
      const dx = s.x - st.x, dz = s.z - st.z, d = Math.hypot(dx, dz, (s.y - st.y) * .5);
      const known = this.srcs.get(s.x.toFixed(1) + ',' + s.z.toFixed(1) + s.kind);
      if (d > s.r * 1.4 && !known) continue;
      const lit = s.kind === 'fire' ? clamp((st.night - .15) / .3, 0, 1) : 1;
      const e = this.source(s), k = Math.pow(clamp(1 - d / s.r, 0, 1), 1.6) * lit;
      const base = {fountain: .16, pool: .1, spa: .12, fire: .22}[s.kind] || .1;
      e.g.gain.setTargetAtTime(base * k, t, .15);
      e.pan.pan.setTargetAtTime(clamp((dx * rx + dz * rz) / Math.max(d, .5), -1, 1) * clamp(d / 3, 0, .9), t, .1);
      if (e.crackle && k > .02) {
        e.t = (e.t || 0) - dt;
        if (e.t < 0) { e.t = rand(.03, .35); this.burst(t + .01, {f: rand(1800, 5000), q: rand(1, 4), gain: rand(.1, .5) * k * base * 2.2, at: .001, dec: rand(.004, .02), dest: e.g}); if (Math.random() < .15) this.tone(t, {f: rand(60, 120), f2: 40, gain: .1 * k, dec: .05, dest: e.g}); }
      }
    }
  }
}
