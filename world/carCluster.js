/* The instrument clusters inside the player cars (2026-09-29).
 *
 * One canvas per car, drawn by carFx at ~30 Hz while it can be seen: a full
 * speedometer (the engine's own km/h or mph scale) and a tachometer with its
 * redline, the gear and a digital speed between them, and a row of telltales:
 * turn-signal arrows that flash with the indicators, main beam, handbrake,
 * engine / check light, traction control and the time.
 *
 * Styles:  race     the Aurora: black glass, a blue sweep, a big central tach ring
 *          classic  the Sovereign: two chronograph dials, cream faces, fine
 *                   batons, polished needles, a power-reserve window
 *          plain    the others: two simple dials
 */
import * as T from 'three';

const W = 1024, H = 440;

export class Cluster {
  constructor(mesh, style = 'plain') {
    this.mesh = mesh; this.style = style;
    this.canvas = document.createElement('canvas'); this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new T.CanvasTexture(this.canvas); this.tex.colorSpace = T.SRGBColorSpace; this.tex.anisotropy = 8;
    mesh.material.map = this.tex; mesh.material.color.set('#ffffff'); mesh.material.transparent = false; mesh.material.needsUpdate = true;
    this.acc = 1; this.needle = {v: 0, r: 0};
    this.draw({});
  }

  /** i: {kmh, units, maxSpeed, rpm, red, top, gear, left, right, beam, brake, engine, tc, clock, dt} */
  update(dt, i) {
    // Needles are damped like real ones so they sweep instead of jumping.
    const k = 1 - Math.exp(-dt * 12);
    this.needle.v += ((i.speed || 0) - this.needle.v) * k; this.needle.r += ((i.rpm || 0) - this.needle.r) * k;
    this.acc += dt; if (this.acc < 1 / 30) return; this.acc = 0;
    this.draw(i); this.tex.needsUpdate = true;
  }

  draw(i) {
    const c = this.ctx, style = this.style;
    const units = i.units === 'mph' ? 'MPH' : 'KM/H', vmax = i.maxSpeed || (i.units === 'mph' ? 200 : 320);
    const red = i.red || 7000, top = Math.ceil((red + 500) / 1000) * 1000;
    const speed = this.needle.v, rpm = Math.min(this.needle.r, top);
    c.save(); c.clearRect(0, 0, W, H);
    // Face.
    if (style === 'classic') {
      c.fillStyle = '#0c0d12'; c.fillRect(0, 0, W, H);
    } else {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#07080b'); g.addColorStop(1, '#0d0f14'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    const R = 158, lx = 215, rx = W - 215, cy = 228;
    if (style === 'race') {
      this.raceDial(c, rx, cy, R + 12, rpm, red, top);
      this.speedArc(c, lx, cy, R - 10, speed, vmax, units);
      this.centre(c, i, speed, units, '#2f63ff');
    } else {
      const classic = style === 'classic';
      this.dial(c, lx, cy, R, speed, vmax, vmax > 250 ? 20 : 10, vmax > 250 ? 40 : 20, units, null, classic);
      this.dial(c, rx, cy, R, rpm / 1000, top / 1000, .5, 1, 'RPM ×1000', red / 1000, classic);
      this.centre(c, i, speed, units, classic ? '#e8d9b0' : '#9fd0ff', classic);
    }
    this.telltales(c, i, style);
    c.restore();
  }

  /** A round analogue dial from `max` over 260 degrees. */
  dial(c, x, y, R, v, max, minor, major, label, red = null, classic = false) {
    const a0 = Math.PI * .75, a1 = Math.PI * 2.25, ang = u => a0 + (a1 - a0) * Math.min(1.02, u / max);
    // Face and chrome bezel.
    const face = c.createRadialGradient(x, y - R * .3, R * .1, x, y, R);
    if (classic) { face.addColorStop(0, '#f6f0e1'); face.addColorStop(1, '#d9ceb2'); } else { face.addColorStop(0, '#15181f'); face.addColorStop(1, '#07080b'); }
    c.fillStyle = face; c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill();
    const bez = c.createLinearGradient(x, y - R, x, y + R); bez.addColorStop(0, '#f4f6f8'); bez.addColorStop(.5, '#7b8088'); bez.addColorStop(1, '#e2e5e9');
    c.strokeStyle = bez; c.lineWidth = 9; c.beginPath(); c.arc(x, y, R + 4, 0, Math.PI * 2); c.stroke();
    const ink = classic ? '#1a1c24' : '#eef2f6', dim = classic ? 'rgba(26,28,36,.55)' : 'rgba(238,242,246,.45)';
    if (red !== null) { c.strokeStyle = classic ? '#b3141c' : '#ff3b2f'; c.lineWidth = 12; c.beginPath(); c.arc(x, y, R * .9, ang(red), a1); c.stroke(); }
    for (let u = 0; u <= max + 1e-6; u += minor) {
      const a = ang(u), isMajor = Math.abs(u / major - Math.round(u / major)) < 1e-6, r0 = R * (isMajor ? .78 : .84);
      c.strokeStyle = red !== null && u >= red ? (classic ? '#b3141c' : '#ff5a4a') : isMajor ? ink : dim; c.lineWidth = isMajor ? 4 : 2;
      c.beginPath(); c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); c.lineTo(x + Math.cos(a) * R * .93, y + Math.sin(a) * R * .93); c.stroke();
      if (isMajor) { c.fillStyle = ink; c.font = `${classic ? '500' : '600'} ${R * (max >= 100 ? .13 : .16)}px ${classic ? 'Georgia, serif' : 'Outfit, Arial'}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(Math.round(u)), x + Math.cos(a) * R * .62, y + Math.sin(a) * R * .62); }
    }
    c.fillStyle = dim; c.font = `600 ${R * .085}px Outfit, Arial`; c.textAlign = 'center'; c.fillText(label, x, y + R * .42);
    // Needle and a polished centre cap.
    const na = ang(v); c.save(); c.translate(x, y); c.rotate(na);
    c.shadowColor = classic ? 'rgba(0,0,0,.35)' : '#ff6a2a'; c.shadowBlur = classic ? 6 : 14; c.shadowOffsetY = classic ? 3 : 0;
    c.fillStyle = classic ? '#20232b' : '#ff6a2a'; c.beginPath(); c.moveTo(-R * .16, -5); c.lineTo(R * .9, -1.5); c.lineTo(R * .9, 1.5); c.lineTo(-R * .16, 5); c.closePath(); c.fill(); c.restore();
    const cap = c.createRadialGradient(x - 5, y - 5, 2, x, y, 16); cap.addColorStop(0, '#ffffff'); cap.addColorStop(1, '#6b7079');
    c.fillStyle = cap; c.beginPath(); c.arc(x, y, 15, 0, Math.PI * 2); c.fill();
  }
  /** The race tach: a thick lit sweep, numerals inside, a shift light at the redline. */
  raceDial(c, x, y, R, rpm, red, top) {
    const a0 = Math.PI * .72, a1 = Math.PI * 2.28, ang = v => a0 + (a1 - a0) * v / top;
    c.lineCap = 'butt'; c.lineWidth = 26; c.strokeStyle = 'rgba(255,255,255,.07)'; c.beginPath(); c.arc(x, y, R, a0, a1); c.stroke();
    c.strokeStyle = 'rgba(255,40,30,.5)'; c.beginPath(); c.arc(x, y, R, ang(red), a1); c.stroke();
    const n = 60, lit = rpm / top * n;
    for (let k = 0; k < n && k < lit; k++) {
      const v = k / n * top; c.strokeStyle = v >= red ? '#ff3b2f' : v >= red * .85 ? '#ffb23a' : '#3a6dff'; c.shadowColor = c.strokeStyle; c.shadowBlur = 12;
      c.beginPath(); c.arc(x, y, R, a0 + (a1 - a0) * k / n + .008, a0 + (a1 - a0) * (k + 1) / n - .008); c.stroke();
    }
    c.shadowBlur = 0;
    for (let v = 0; v <= top; v += 1000) {
      const a = ang(v); c.fillStyle = v >= red ? '#ff5a4a' : 'rgba(235,240,250,.85)'; c.font = '600 26px Outfit, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(v / 1000), x + Math.cos(a) * (R - 44), y + Math.sin(a) * (R - 44));
    }
    c.fillStyle = 'rgba(235,240,250,.45)'; c.font = '600 15px Outfit, Arial'; c.fillText('RPM ×1000', x, y + R * .55);
    c.fillStyle = rpm > red * .96 && Math.floor(performance.now() / 70) % 2 ? '#ff3b2f' : '#ffffff'; c.font = '700 60px Outfit, Arial'; c.fillText(String(Math.round(rpm / 10) * 10), x, y + R * .22);
  }
  /** The race speedometer: an arc with the speed as a bar, numerals round it. */
  speedArc(c, x, y, R, v, max, units) {
    const a0 = Math.PI * .72, a1 = Math.PI * 2.28, ang = u => a0 + (a1 - a0) * Math.min(1, u / max);
    c.lineWidth = 14; c.strokeStyle = 'rgba(255,255,255,.07)'; c.beginPath(); c.arc(x, y, R, a0, a1); c.stroke();
    const g = c.createLinearGradient(x - R, y, x + R, y); g.addColorStop(0, '#1d3fff'); g.addColorStop(1, '#8fb2ff');
    c.strokeStyle = g; c.shadowColor = '#3a6dff'; c.shadowBlur = 12; c.beginPath(); c.arc(x, y, R, a0, ang(v)); c.stroke(); c.shadowBlur = 0;
    const step = max > 250 ? 40 : 20;
    for (let u = 0; u <= max; u += step) {
      const a = ang(u); c.strokeStyle = 'rgba(235,240,250,.7)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x + Math.cos(a) * (R - 16), y + Math.sin(a) * (R - 16)); c.lineTo(x + Math.cos(a) * (R - 28), y + Math.sin(a) * (R - 28)); c.stroke();
      c.fillStyle = 'rgba(235,240,250,.8)'; c.font = '600 20px Outfit, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(u), x + Math.cos(a) * (R - 48), y + Math.sin(a) * (R - 48));
    }
    c.fillStyle = 'rgba(235,240,250,.45)'; c.font = '600 15px Outfit, Arial'; c.fillText(units, x, y + R * .55);
  }
  /** The middle: gear, digital speed, the time, main beam etc. go in telltales(). */
  centre(c, i, speed, units, accent, classic = false) {
    const x = W / 2;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = classic ? '#f1e9d6' : '#ffffff'; c.font = `700 ${classic ? 84 : 110}px Outfit, Arial`; c.fillText(String(Math.round(speed)), x, 214);
    c.fillStyle = 'rgba(235,240,250,.5)'; c.font = '600 18px Outfit, Arial'; c.fillText(units, x, 272);
    // Gear in a lit box.
    c.strokeStyle = accent; c.lineWidth = 3; c.shadowColor = accent; c.shadowBlur = 10;
    c.beginPath(); c.roundRect(x - 34, 300, 68, 62, 10); c.stroke(); c.shadowBlur = 0;
    c.fillStyle = accent; c.font = '700 44px Outfit, Arial'; c.fillText(i.gear || 'P', x, 332);
    if (i.clock) { c.fillStyle = 'rgba(235,240,250,.6)'; c.font = '600 22px Outfit, Arial'; c.fillText(i.clock, x, 396); }
  }
  /** Turn arrows at the top corners of the middle, and the warning lights along the top. */
  telltales(c, i, style) {
    const x = W / 2, y = 62;
    const arrow = (dir, on) => {
      c.save(); c.translate(x + dir * 120, y); c.scale(-dir, 1);   // the base shape points left
      c.fillStyle = on ? '#2cff6a' : 'rgba(44,255,106,.12)'; if (on) { c.shadowColor = '#2cff6a'; c.shadowBlur = 22; }
      c.beginPath(); c.moveTo(-34, 0); c.lineTo(-2, -26); c.lineTo(-2, -12); c.lineTo(30, -12); c.lineTo(30, 12); c.lineTo(-2, 12); c.lineTo(-2, 26); c.closePath(); c.fill();
      c.restore();
    };
    // Left of the car is its left: the left arrow points left on the driver's cluster.
    arrow(-1, !!i.left); arrow(1, !!i.right);
    const lamp = (px, color, on, drawIcon) => { c.save(); c.translate(px, y); c.globalAlpha = on ? 1 : .14; c.strokeStyle = c.fillStyle = color; if (on) { c.shadowColor = color; c.shadowBlur = 12; } c.lineWidth = 3; drawIcon(); c.restore(); };
    // Main beam (blue), handbrake (red), engine (amber), traction control (amber).
    lamp(x - 40, '#3a8bff', !!i.beam, () => { c.beginPath(); c.arc(4, 0, 12, -Math.PI / 2, Math.PI / 2); c.closePath(); c.stroke(); for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(-6, k * 7); c.lineTo(-20, k * 7); c.stroke(); } });
    lamp(x + 40, '#ff3b2f', !!i.brake, () => { c.beginPath(); c.arc(0, 0, 13, 0, Math.PI * 2); c.stroke(); c.font = '700 16px Outfit, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('P', 0, 1); });
    const side = style === 'race' ? 330 : 360;
    lamp(x - side, '#ffb23a', !!i.engine, () => { c.strokeRect(-14, -9, 28, 18); c.beginPath(); c.moveTo(14, -3); c.lineTo(20, -3); c.moveTo(-14, 0); c.lineTo(-20, 0); c.moveTo(-6, -9); c.lineTo(-6, -14); c.lineTo(6, -14); c.stroke(); });
    lamp(x + side, '#ffb23a', !!i.tc, () => { c.beginPath(); c.moveTo(-10, 12); c.bezierCurveTo(-4, 0, -14, -4, -6, -14); c.moveTo(10, 12); c.bezierCurveTo(16, 0, 6, -4, 14, -14); c.stroke(); c.strokeRect(-10, -6, 20, 10); });
  }
}
