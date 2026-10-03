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
    // Dark until the car has power; a short boot splash when it comes on.
    if (screenPower(this, dt, i.power !== false, 'AURORA')) return;
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
    if (style === 'f1') { this.f1(c, i, speed, rpm, red, units); c.restore(); return; }
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

  /** The race wheel's display (2026-10-03, the stripped shell): a black LCD
   *  with the rev lights across the top, the gear huge in the middle, speed
   *  and revs either side, and the settings a race engineer would ask about. */
  f1(c, i, speed, rpm, red, units) {
    c.fillStyle = '#010203'; c.fillRect(0, 0, W, H);
    const n = 20, lit = Math.round(Math.min(1, rpm / red) * n), flash = rpm > red * .97 && Math.floor(performance.now() / 80) % 2;
    for (let k = 0; k < n; k++) {
      const x = 22 + k * (W - 44) / n, w = (W - 44) / n - 7, col = k < 8 ? '#2bd65a' : k < 15 ? '#ff2a2a' : '#3a6bff';
      c.fillStyle = k < lit ? (flash ? '#ffffff' : col) : '#121418'; c.fillRect(x, 16, w, 30);
    }
    c.strokeStyle = '#262a32'; c.lineWidth = 3;
    c.strokeRect(14, 62, 300, 270); c.strokeRect(W - 314, 62, 300, 270); c.strokeRect(340, 62, W - 680, 270);
    c.textBaseline = 'middle'; c.textAlign = 'center';
    c.fillStyle = '#ffffff'; c.font = '700 270px Outfit, Arial'; c.fillText(i.gear || 'N', W / 2, 205);
    c.font = '700 116px Outfit, Arial'; c.fillText(String(Math.round(speed)), 164, 180);
    c.fillStyle = '#8f98a8'; c.font = '600 30px Outfit, Arial'; c.fillText(units, 164, 272); c.fillText('RPM', W - 164, 272);
    c.fillStyle = rpm > red * .96 ? '#ff3b2f' : '#ffd23a'; c.font = '700 96px Outfit, Arial'; c.fillText(String(Math.round(rpm / 10) * 10), W - 164, 180);
    // The foot row: brake balance, traction control, engine map, the time; lights for the signals and the limiter.
    const cells = [['BBAL', '56.5'], ['TC', i.tc ? 'ACT' : '3'], ['MAP', '2'], ['TIME', i.clock || '']];
    cells.forEach(([k, v], j) => {
      const x = 14 + j * (W - 28) / 4, w = (W - 28) / 4 - 10;
      c.fillStyle = '#0b0d11'; c.fillRect(x, 348, w, 76);
      c.fillStyle = '#6f7888'; c.font = '600 24px Outfit, Arial'; c.fillText(k, x + w / 2, 368);
      c.fillStyle = k === 'TC' && i.tc ? '#ffd23a' : '#e8eef8'; c.font = '700 38px Outfit, Arial'; c.fillText(v, x + w / 2, 402);
    });
    if (i.left) { c.fillStyle = '#2bd65a'; c.font = '700 60px Outfit, Arial'; c.fillText('◀', 380, 96); }
    if (i.right) { c.fillStyle = '#2bd65a'; c.font = '700 60px Outfit, Arial'; c.fillText('▶', W - 380, 96); }
    if (i.brake) { c.fillStyle = '#ff3b2f'; c.font = '700 30px Outfit, Arial'; c.fillText('PARK', W / 2, 312); }
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

/* The centre screen's G-meter (2026-10-02). The felt g as a dot in a ring
 * (forward = braking, back = accelerating, sideways = cornering), its last
 * two seconds as a fading trail, the peaks of this drive in each direction,
 * and the speed: the ring and the trail run teal -> amber -> red as the car
 * gets faster, and the scale opens out from 1.5 g to 2 g above 200 km/h. */
export class GScreen {
  constructor(mesh) {
    this.mesh = mesh;
    this.canvas = document.createElement('canvas'); this.canvas.width = 640; this.canvas.height = 360;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new T.CanvasTexture(this.canvas); this.tex.colorSpace = T.SRGBColorSpace; this.tex.anisotropy = 8;
    mesh.material.map = this.tex; mesh.material.color.set('#ffffff'); mesh.material.transparent = false; mesh.material.needsUpdate = true;
    this.trail = []; this.peak = {l: 0, r: 0, brake: 0, acc: 0}; this.acc = 1; this.t = 0;
    this.draw({lat: 0, lon: 0, speed: 0, units: 'kmh'});
  }
  /** i: {lat, lon (felt g: + pushed right, + pressed back), speed (km/h or mph), units, gear} */
  update(dt, i) {
    if (screenPower(this, dt, i.power !== false, 'G-METER')) return;
    this.t += dt; this.acc += dt;
    const p = this.peak;
    p.r = Math.max(p.r, i.lat); p.l = Math.max(p.l, -i.lat); p.acc = Math.max(p.acc, i.lon); p.brake = Math.max(p.brake, -i.lon);
    if (this.acc < 1 / 24) return;
    this.trail.push([i.lat, i.lon, this.t]); while (this.trail.length && this.t - this.trail[0][2] > 2) this.trail.shift();
    this.acc = 0; this.draw(i); this.tex.needsUpdate = true;
  }
  draw(i) {
    const c = this.ctx, W = 640, H = 360, kmh = i.units === 'mph' ? i.speed * 1.609 : i.speed;
    const heat = Math.min(1, kmh / 260), col = heat < .5 ? mixHex('#58e6c1', '#ffb84a', heat * 2) : mixHex('#ffb84a', '#ff4a3c', heat * 2 - 1);
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#05080b'); g.addColorStop(1, '#0b1015'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    // Ring.
    const cx = 180, cy = 186, R = 138, scale = kmh > 200 ? 2 : 1.5, px = v => v / scale * R;
    c.strokeStyle = '#ffffff12'; c.lineWidth = 1.5;
    for (let k = 1; k <= 3; k++) { c.beginPath(); c.arc(cx, cy, R * k / 3, 0, Math.PI * 2); c.stroke(); }
    c.beginPath(); c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R); c.stroke();
    c.strokeStyle = col; c.lineWidth = 4; c.globalAlpha = .55; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
    c.fillStyle = '#ffffff55'; c.font = '600 15px Outfit, Arial'; c.textAlign = 'left';
    for (let k = 1; k <= 3; k++) c.fillText((scale * k / 3).toFixed(1), cx + 4, cy - R * k / 3 + 15);
    c.textAlign = 'center'; c.fillStyle = '#ffffff66'; c.font = '600 14px Outfit, Arial';
    c.fillText('BRAKE', cx, cy - R - 8); c.fillText('ACCEL', cx, cy + R + 20);
    // Peaks: ticks on the ring.
    const tick = (a, v) => { if (v < .05) return; const r = Math.min(R, px(v)); c.save(); c.translate(cx, cy); c.rotate(a); c.fillStyle = '#ffffffaa'; c.fillRect(r - 2, -7, 4, 14); c.restore(); };
    tick(0, this.peak.r); tick(Math.PI, this.peak.l); tick(-Math.PI / 2, this.peak.brake); tick(Math.PI / 2, this.peak.acc);
    // Trail and dot: x = pushed right, y = down when pressed back (accelerating).
    const clampR = (x, y) => { const d = Math.hypot(x, y); return d > R ? [x * R / d, y * R / d] : [x, y]; };
    for (let k = 1; k < this.trail.length; k++) {
      const [a, b] = [this.trail[k - 1], this.trail[k]], age = (this.t - b[2]) / 2;
      const A = clampR(px(a[0]), px(a[1])), B = clampR(px(b[0]), px(b[1]));
      c.strokeStyle = col; c.globalAlpha = (1 - age) * .8; c.lineWidth = 5 * (1 - age) + 1;
      c.beginPath(); c.moveTo(cx + A[0], cy + A[1]); c.lineTo(cx + B[0], cy + B[1]); c.stroke();
    }
    c.globalAlpha = 1;
    const [dx, dy] = clampR(px(i.lat), px(i.lon));
    c.shadowColor = col; c.shadowBlur = 24; c.fillStyle = '#ffffff'; c.beginPath(); c.arc(cx + dx, cy + dy, 13, 0, Math.PI * 2); c.fill();
    c.shadowBlur = 0; c.fillStyle = col; c.beginPath(); c.arc(cx + dx, cy + dy, 7, 0, Math.PI * 2); c.fill();
    // Right column: g now, speed, peaks.
    const gNow = Math.hypot(i.lat, i.lon);
    c.textAlign = 'left'; c.fillStyle = '#ffffff70'; c.font = '600 16px Outfit, Arial'; c.fillText('G-FORCE', 360, 58);
    c.fillStyle = '#f2f5f2'; c.font = '700 66px Outfit, Arial'; c.fillText(gNow.toFixed(2), 356, 120);
    const gw = c.measureText(gNow.toFixed(2)).width; c.fillStyle = col; c.font = '600 26px Outfit, Arial'; c.fillText('g', 362 + gw, 120);
    c.fillStyle = '#ffffff70'; c.font = '600 16px Outfit, Arial'; c.fillText(i.units === 'mph' ? 'MPH' : 'KM/H', 360, 168);
    c.fillStyle = col; c.font = '700 54px Outfit, Arial'; c.fillText(String(Math.round(i.speed)), 356, 220);
    // Speed bar.
    c.fillStyle = '#ffffff14'; c.fillRect(360, 236, 240, 8); c.fillStyle = col; c.fillRect(360, 236, 240 * heat, 8);
    c.font = '500 15px ui-monospace, Menlo, monospace'; c.fillStyle = '#ffffffaa';
    const P = this.peak, rows = [['LAT L', P.l], ['LAT R', P.r], ['BRAKE', P.brake], ['ACCEL', P.acc]];
    rows.forEach(([k, v], n) => { const x = 360 + (n % 2) * 128, y = 282 + Math.floor(n / 2) * 30; c.fillStyle = '#ffffff60'; c.fillText(k, x, y); c.fillStyle = '#f2f5f2'; c.fillText(v.toFixed(2), x + 66, y); });
    c.fillStyle = '#ffffff40'; c.font = '600 12px Outfit, Arial'; c.fillText('PEAKS THIS DRIVE', 360, 346);
  }
}
function mixHex(a, b, t) {
  const A = new T.Color(a), B = new T.Color(b);
  return '#' + A.lerp(B, Math.max(0, Math.min(1, t))).getHexString();
}

/* Screen power (2026-10-02): a screen is black glass while the car is off,
 * shows a boot splash for ~1.2 s when the electronics come on, then runs.
 * Returns true while it owns the frame (off or booting). */
function screenPower(scr, dt, on, title) {
  const c = scr.ctx, W = scr.canvas.width, H = scr.canvas.height;
  if (!on) {
    if (scr.powered !== false) { c.fillStyle = '#020203'; c.fillRect(0, 0, W, H); scr.tex.needsUpdate = true; }
    scr.powered = false; scr.boot = 0; return true;
  }
  if (scr.powered === false) { scr.powered = true; scr.boot = 1.25; }
  if (scr.boot > 0) {
    scr.boot -= dt;
    const t = 1 - Math.max(0, scr.boot) / 1.25, a = Math.min(1, t * 3) * Math.min(1, scr.boot * 4 + .2);
    c.fillStyle = '#020203'; c.fillRect(0, 0, W, H);
    c.globalAlpha = a; c.fillStyle = '#e8eef8'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `300 ${H * .2}px Outfit, Arial`; c.fillText(title, W / 2, H * .46);
    c.fillStyle = '#2f63ff'; c.fillRect(W * .3, H * .62, W * .4 * Math.min(1, t * 1.3), H * .012);
    c.globalAlpha = 1; scr.tex.needsUpdate = true;
    return scr.boot > 0;
  }
  scr.powered = true; return false;
}
