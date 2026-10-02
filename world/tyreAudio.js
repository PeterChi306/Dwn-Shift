/* Tyre sounds (2026-10-01), driven by the 3D car's own tyres rather than the
 * drivetrain's 1D slip model:
 *
 *   squeal   a tyre at and just past its peak: a tonal, wavering "eee" — noise
 *            through three narrow resonant bands (a fundamental near 900 Hz and
 *            two overtones) whose pitch wanders slowly, the way a real squeal
 *            never sits still. Pitch climbs with how hard the tyre is working.
 *   roar     a tyre fully sliding (a drift, a handbrake turn): lower, broader
 *            and rubbery, the carcass rolling over onto its shoulder.
 *   chirp    wheelspin and burnouts: a harsher, higher scrub.
 *
 * Fed per frame with the car's per-wheel `skid` (0..1.5), body slip angle and
 * speed. Plays into the engine's effects bus so it follows the cabin/street
 * listening position like the rest of the car.
 */
export class TyreAudio {
  constructor() { this.ready = false; this.t = 0; this.wob = 0; this.wobV = 0; }
  init({ctx, sfx}) {
    if (this.ready || !ctx || !sfx) return;
    this.ctx = ctx;
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = rate => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(); return s; };
    const band = (src, f, q, g) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; const k = ctx.createGain(); k.gain.value = g; src.connect(b); b.connect(k); return {b, k}; };
    this.out = ctx.createGain(); this.out.gain.value = 1; this.out.connect(sfx);
    // Squeal: three resonant bands on one noise source.
    const n1 = noise(1);
    this.sqG = ctx.createGain(); this.sqG.gain.value = 0; this.sqG.connect(this.out);
    this.sq = [band(n1, 880, 14, 1), band(n1, 1460, 12, .55), band(n1, 2350, 10, .28)];
    for (const s of this.sq) s.k.connect(this.sqG);
    // Roar: broad and low.
    const n2 = noise(.6);
    const r = band(n2, 420, 1.1, 1); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    this.roarG = ctx.createGain(); this.roarG.gain.value = 0; r.k.connect(lp); lp.connect(this.roarG); this.roarG.connect(this.out); this.roar = r;
    // Chirp: wheelspin.
    const n3 = noise(1.3);
    const c = band(n3, 1900, 3, 1);
    this.chG = ctx.createGain(); this.chG.gain.value = 0; c.k.connect(this.chG); this.chG.connect(this.out); this.chirp = c;
    this.ready = true;
  }
  /** skid: per-wheel 0..1.5; beta: body slip (rad); speed m/s; spin: driven-wheel overspeed 0..1; muted: paused/on foot. */
  update(dt, {skid, front, beta, speed, spin = 0, muted = false, cabin = false}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.t += dt;
    let sum = 0, peak = 0; for (const s of skid) { sum += s; peak = Math.max(peak, s); }
    const avg = sum / Math.max(1, skid.length);
    const moving = Math.min(1, speed / 5);
    const slide = Math.min(1, Math.max(0, (Math.abs(beta) - .08) / .3));       // properly sideways
    // A slow random walk on the pitch: the squeal wavers, never a steady tone.
    this.wobV += ((Math.random() - .5) * 40 - this.wobV * 3) * dt; this.wob += this.wobV * dt; this.wob *= Math.exp(-dt * .8);
    const edge = Math.min(1, Math.max(0, (peak - .05) / .5));
    const sqAmt = muted ? 0 : edge * moving * (1 - slide * .45);
    const f0 = (760 + Math.min(1.2, avg) * 260 + Math.min(speed, 60) * 2.2) * (1 + this.wob * .04) * (front ? 1.06 : 1);
    this.sq.forEach((s, i) => s.b.frequency.setTargetAtTime(f0 * [1, 1.66, 2.67][i], t, .03));
    this.sqG.gain.setTargetAtTime(sqAmt * .34 * (cabin ? .55 : 1), t, .05);
    const roarAmt = muted ? 0 : Math.max(slide * Math.min(1, avg * 1.4 + .3), Math.max(0, avg - .7)) * moving;
    this.roar.b.frequency.setTargetAtTime(340 + Math.min(speed, 50) * 5 + slide * 60, t, .1);
    this.roarG.gain.setTargetAtTime(roarAmt * .42 * (cabin ? .6 : 1), t, .08);
    const chAmt = muted ? 0 : Math.min(1, spin) * Math.min(1, .3 + speed / 10);
    this.chirp.b.frequency.setTargetAtTime(1600 + Math.random() * 500, t, .05);
    this.chG.gain.setTargetAtTime(chAmt * .22, t, .04);
  }
}
