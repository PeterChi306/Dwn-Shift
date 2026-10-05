/* (2026-10-04) Nothing here is on any map, any menu or any sign.
 *
 * In the basement garage's far wall, one panel between the lit fins is a
 * door. Stand right in front of it and the wall asks for a password. The
 * right one slides the panel back and away, and behind it a lift platform
 * waits in a narrow shaft. It drops 28 m, past rings of red light, out of
 * the rock ceiling of a cave: a waterfall down the west wall into a black
 * pool, stalactites, bats circling under the roof, a steel deck with a black
 * car turning on a turntable, a suit in a glass case, an emblem burning over
 * the computer, and the computer itself, seven screens wide.
 *
 * Frame coordinates as basement.js (the mansion's lot frame); the cave is a
 * closed, inside-out rock shell, so nothing of the world above shows through.
 */
import * as T from 'three';
import {uv, vec3, fract, floor, sin, smoothstep, hash, time, mix} from 'three/tsl';
import {Kit} from './kit.js';

const KEY = 2088091347;                    // the word itself is not kept here
const sum = t => { let h = 5381; for (const c of t) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h; };
export const CAVE = {cu: 26, cv: -9, ru: 16, rv: 17, ry: 8, cy: -30.5, floor: -34};
export const SECRET = {u: 30.5, hw: .8, h: 2.6};                 // the door, in the hall's far wall (v = hall.v0)
const SHAFT = {u: 30.5, v: -22.1, hw: 1, front: -21, back: -23.2};
const VEST = {u0: 29.3, u1: 33.5, v0: -21, v1: -20.2};
const RIDE = 9;

/** Height of the cave's roof over (u, v), from the shell's ellipsoid. */
const roofAt = (u, v) => { const k = 1 - ((u - CAVE.cu) / CAVE.ru) ** 2 - ((v - CAVE.cv) / CAVE.rv) ** 2; return k > 0 ? CAVE.cy + CAVE.ry * Math.sqrt(k) : CAVE.cy; };
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

/** Builds the vestibule, the shaft and the cave; returns the runtime (Basement owns it). */
export function buildBatcave(F, places, B) {
  const kit = F.kit, FL = B.floor, FC = CAVE.floor, r = rng(9161);
  const STEEL = '#1d1f23', RED = '#ff2d2d', BLUE = '#3fa9ff';
  kit.indoor = 1;
  /* ---- the vestibule behind the door, and the shaft */
  F.rect('gloss', VEST.u0, VEST.v0, VEST.u1, VEST.v1, FL - .4, FL, '#101114', true);
  F.rect('paint', VEST.u0 - .2, VEST.v0, VEST.u0, VEST.v1, FL, FL + 3.2, STEEL, true);
  F.rect('paint', VEST.u1, VEST.v0, VEST.u1 + .2, VEST.v1, FL, FL + 3.2, STEEL, true);
  F.rect('paint', SHAFT.u + SHAFT.hw + .1, VEST.v0 - .2, VEST.u1 + .2, VEST.v0, FL, FL + 3.2, STEEL, true);
  F.rect('paint', VEST.u0 - .2, VEST.v0 - .2, SHAFT.u - SHAFT.hw - .1, VEST.v0, FL, FL + 3.2, STEEL, true);
  F.rect('paint', VEST.u0 - .2, SHAFT.back - .2, VEST.u1 + .2, VEST.v1, FL + 3.2, FL + 3.5, STEEL);
  F.rect('glow', VEST.u0 + .1, VEST.v0 + .05, VEST.u1 - .1, VEST.v0 + .08, FL + 3.05, FL + 3.12, RED);
  // The shaft: closed steel down to below the cave's roof, an open cage in the cave.
  const top = roofAt(SHAFT.u, SHAFT.v) - .8, su0 = SHAFT.u - SHAFT.hw - .1, su1 = SHAFT.u + SHAFT.hw + .1;
  F.rect('paint', su0 - .2, SHAFT.back, su0, SHAFT.front, top, FL + 3.2, STEEL, true);
  F.rect('paint', su1, SHAFT.back, su1 + .2, SHAFT.front, top, FL + 3.2, STEEL, true);
  F.rect('paint', su0 - .2, SHAFT.back - .2, su1 + .2, SHAFT.back, top, FL + 3.2, STEEL, true);
  F.rect('paint', su0 - .2, SHAFT.front - .2, su1 + .2, SHAFT.front, top, FL - .05, STEEL, true);
  for (let y = FL - 1.5; y > top; y -= 2.6) for (const [a, b, c, d] of [[su0, SHAFT.back + .05, su0 + .03, SHAFT.front - .05], [su1 - .03, SHAFT.back + .05, su1, SHAFT.front - .05], [su0, SHAFT.back, su1, SHAFT.back + .03], [su0, SHAFT.front - .03, su1, SHAFT.front]]) F.rect('glow', a, b, c, d, y, y + .06, RED);
  for (const [u, v] of [[su0, SHAFT.back], [su1, SHAFT.back], [su0, SHAFT.front], [su1, SHAFT.front]]) F.rect('metal', u - .1, v - .1, u + .1, v + .1, FC, top + .2, '#3a3d42');
  for (let y = FC + 2.4; y < top; y += 2.4) { F.rect('metal', su0 - .08, SHAFT.back - .08, su1 + .08, SHAFT.back + .02, y, y + .08, '#3a3d42'); for (const u of [su0, su1]) F.rect('metal', u - .05, SHAFT.back, u + .05, SHAFT.front, y, y + .08, '#3a3d42'); }
  // The cage is solid on three sides (the front has a gate when the platform is up).
  F.solid(su0 - .05, (FC + top) / 2, (SHAFT.back + SHAFT.front) / 2, .1, top - FC, SHAFT.front - SHAFT.back);
  F.solid(su1 + .05, (FC + top) / 2, (SHAFT.back + SHAFT.front) / 2, .1, top - FC, SHAFT.front - SHAFT.back);
  F.solid(SHAFT.u, (FC + top) / 2, SHAFT.back - .05, su1 - su0, top - FC, .1);

  /* ---- the cave: an inside-out rock shell */
  {
    const g = new T.SphereGeometry(1, 56, 30), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + (Math.sin(x * 7.1 + y * 3.3) * Math.sin(z * 5.7 - y * 2.1) + Math.sin(x * 13 + z * 11 + y * 5) * .5 + Math.sin(z * 23 - x * 17) * .25) * .055;
      p.setXYZ(i, x * CAVE.ru * n, y * CAVE.ry * n, z * CAVE.rv * n);
    }
    const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.deleteAttribute('normal');
    const [x, z] = F.w(CAVE.cu, CAVE.cv); kit.add('rock', g, x, F.y + CAVE.cy, z, F.yaw, '#3a3531');
  }
  F.rect('rock', CAVE.cu - 17, CAVE.cv - 18, CAVE.cu + 17, CAVE.cv + 18, FC - .5, FC, '#24211f', true);
  // Walls you cannot walk through: a ring of colliders just inside the shell.
  { const k = Math.sqrt(1 - ((FC - CAVE.cy) / CAVE.ry) ** 2) * .93, N = 32;
    for (let i = 0; i < N; i++) { const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, P = a => F.w(CAVE.cu + Math.cos(a) * CAVE.ru * k, CAVE.cv + Math.sin(a) * CAVE.rv * k), A = P(a0), Bp = P(a1);
      kit.beam('rock', A[0], A[1], Bp[0], Bp[1], F.y + FC + 3, 6, .3, '#000000', true); } }
  // Stalactites, and a few stalagmites at the edges.
  for (let k = 0; k < 46; k++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * .82, u = CAVE.cu + Math.cos(a) * CAVE.ru * d, v = CAVE.cv + Math.sin(a) * CAVE.rv * d, len = .8 + r() * 2.8;
    if (Math.abs(u - SHAFT.u) < 2.5 && Math.abs(v - SHAFT.v) < 2.5) continue;
    F.geo('rock', new T.ConeGeometry(.18 + r() * .35, len, 6), u, roofAt(u, v) - len / 2 + .3, v, '#4a433d', {rx: Math.PI});
  }
  for (let k = 0; k < 14; k++) { const a = r() * Math.PI * 2, u = CAVE.cu + Math.cos(a) * CAVE.ru * .8, v = CAVE.cv + Math.sin(a) * CAVE.rv * .8, h = .6 + r() * 1.6; F.geo('rock', new T.ConeGeometry(.3 + r() * .4, h, 6), u, FC + h / 2, v, '#3a3531'); }

  /* ---- the deck, the turntable, the computer, the suit, the emblem */
  const DK = {u0: 17, u1: 31, v0: -16, v1: 3}, DY = FC + .25;
  F.rect('gloss', DK.u0, DK.v0, DK.u1, DK.v1, FC, DY, '#17191c', true);
  for (const [a, b, c, d] of [[DK.u0, DK.v0, DK.u1, DK.v0 + .05], [DK.u0, DK.v1 - .05, DK.u1, DK.v1], [DK.u0, DK.v0, DK.u0 + .05, DK.v1], [DK.u1 - .05, DK.v0, DK.u1, DK.v1]]) F.rect('glow', a, b, c, d, DY, DY + .02, BLUE);
  for (let u = DK.u0 + 1; u < DK.u1; u += 2) F.rect('line', u - .01, DK.v0, u + .01, DK.v1, DY, DY + .004, '#2a2d33');
  const TT = {u: 22.5, v: -9};
  F.geo('gloss', new T.CylinderGeometry(3.1, 3.15, .06, 48), TT.u, DY + .03, TT.v, '#0d0e10');
  F.geo('glow', new T.TorusGeometry(3.13, .03, 6, 64), TT.u, DY + .06, TT.v, BLUE, {rx: Math.PI / 2});
  F.pool(TT.u, TT.v, DY + .07, 4.4, .8, new T.Color('#bfe0ff'));
  // The Batcomputer: a desk, a chair, screens in an arc (the screens are canvases, below).
  const PC = {u: 26, v: 0};
  F.rect('gloss', PC.u - 2.2, PC.v + 1.4, PC.u + 2.2, PC.v + 2.2, DY, DY + .78, '#0c0d0f', true);
  F.rect('glow', PC.u - 2.2, PC.v + 1.38, PC.u + 2.2, PC.v + 1.4, DY + .7, DY + .74, BLUE);
  F.cyl('metal', PC.u, PC.v + .5, DY, .05, .45, '#1b1c1e', 8); F.rect('fabric', PC.u - .3, PC.v + .2, PC.u + .3, PC.v + .8, DY + .45, DY + .55, '#121214', true); F.rect('fabric', PC.u - .3, PC.v + .15, PC.u + .3, PC.v + .25, DY + .55, DY + 1.3, '#121214');
  F.rect('metal', PC.u - 5, PC.v + 3.2, PC.u + 5, PC.v + 3.5, DY, DY + 4.4, '#141518');
  // The suit, in a lit glass case.
  const SU = {u: 37.5, v: -11};
  F.rect('gloss', SU.u - .8, SU.v - .8, SU.u + .8, SU.v + .8, FC, FC + .3, '#0d0e10', true);
  F.rect('glow', SU.u - .8, SU.v - .82, SU.u + .8, SU.v - .8, FC + .1, FC + .2, BLUE);
  F.rect('glass', SU.u - .75, SU.v - .75, SU.u + .75, SU.v + .75, FC + .3, FC + 2.8, '#9fc4d8', true);
  const suit = '#16171a';
  F.rect('paint', SU.u - .12, SU.v - .2, SU.u + .12, SU.v - .05, FC + .3, FC + 1.25, suit); F.rect('paint', SU.u - .12, SU.v + .05, SU.u + .12, SU.v + .2, FC + .3, FC + 1.25, suit);
  F.rect('paint', SU.u - .16, SU.v - .25, SU.u + .16, SU.v + .25, FC + 1.25, FC + 2, suit);
  F.rect('paint', SU.u - .1, SU.v - .4, SU.u + .1, SU.v - .25, FC + 1.3, FC + 2, suit); F.rect('paint', SU.u - .1, SU.v + .25, SU.u + .1, SU.v + .4, FC + 1.3, FC + 2, suit);
  F.geo('paint', new T.SphereGeometry(.14, 12, 10), SU.u, FC + 2.2, SU.v, suit);
  for (const s of [-1, 1]) F.geo('paint', new T.ConeGeometry(.035, .16, 5), SU.u, FC + 2.38, SU.v + s * .08, suit);
  F.rect('paint', SU.u + .12, SU.v - .45, SU.u + .18, SU.v + .45, FC + .45, FC + 2.02, '#0b0b0d');                       // the cape
  F.rect('gloss', SU.u - .17, SU.v - .07, SU.u - .16, SU.v + .07, FC + 1.6, FC + 1.7, '#d8b24a');                     // the emblem on the chest
  F.pool(SU.u, SU.v, FC + .31, 1.2, .9, new T.Color('#cfe6ff'));
  // Light: cold washes up the rock, pools on the deck.
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, kk = .86, u = CAVE.cu + Math.cos(a) * CAVE.ru * kk, v = CAVE.cv + Math.sin(a) * CAVE.rv * kk; F.scallop(u, v, FC, [-Math.cos(a), -Math.sin(a)], 3.4, 5.5, .55, new T.Color('#6fb4ff')); }
  for (const [u, v] of [[19, -14], [29, -14], [29, -4], [19, 1]]) F.pool(u, v, DY + .01, 3, .35, new T.Color('#a9cfff'));
  // The waterfall's pool at the west wall.
  const WF = {u: CAVE.cu - CAVE.ru * .84, v: -9};
  F.rect('rock', WF.u - .4, WF.v - 4.2, WF.u + 3.4, WF.v + 4.2, FC, FC + .35, '#2c2826', true);
  F.water(WF.u, WF.v - 3.6, WF.u + 3, WF.v + 3.6, .3, '#0f2a35', -.2, {swim: false});
  for (let v = WF.v - 3; v <= WF.v + 3; v += 1.5) F.uplight(WF.u + 2.7, v, .35);
  kit.indoor = 0;
  return new Batcave({F, B, places, top, PC, TT, WF, DY});
}

/* ------------------------------------------------------------------ runtime */
export class Batcave {
  constructor({F, B, places, top, PC, TT, WF, DY}) {
    this.F = F; this.B = B; this.scene = places.scene; this.mats = places.mats; this.PC = PC; this.TT = TT; this.WF = WF; this.DY = DY;
    this.door = 0; this.doorWant = 0; this.doorT = 0; this.cabY = B.floor; this.stop = 'T'; this.go = null; this.carry = null;
    this.prompt = ''; this.physics = null; this.gates = {}; this.hooks = null; this.makeCar = null; this.car = null; this.audio = null; this.keypadOpen = false;
    this.wall = {v: B.hall.v0};
    this.buildMoving(); this.buildScreens(); this.buildWaterfall(); this.buildBats(); this.buildEmblem(); this.animate(0, false);
  }
  W(u, v, y) { const [x, z] = this.F.w(u, v); return new T.Vector3(x, this.F.y + y, z); }
  /** The door panel (with its fins) and the lift platform. */
  buildMoving() {
    const B = this.B, FL = B.floor, dk = new Kit();
    dk.box('paint', 0, 1.3, 0, SECRET.hw * 2, 2.6, .4, 0, '#1b1c20');
    for (const du of [-.75, .4]) { dk.box('wood', du, 1.3, .32, .18, 2.6, .25, 0, '#4a3324'); dk.box('glow', du, 1.4, .46, .04, 2.3, .02, 0, '#ffd7a3'); }
    this.panel = new T.Group(); this.panel.rotation.y = this.F.yaw; dk.build(this.panel, this.mats, {shadows: false}); this.scene.add(this.panel);
    const ck = new Kit();
    ck.box('metal', 0, -.08, 0, 2, .16, 2, 0, '#1b1c1e');
    ck.box('gloss', 0, .002, 0, 1.8, .01, 1.8, 0, '#0e0f11');
    for (const [x, z, sx, sz] of [[0, -1, 2, .04], [-1, 0, .04, 2], [1, 0, .04, 2]]) ck.box('glow', x * .97, .01, z * .97, sx, .02, sz, 0, '#ff2d2d');
    for (const [x0, z0, x1, z1] of [[-.95, -.95, .95, -.95], [-.95, -.95, -.95, .8], [.95, -.95, .95, .8]]) ck.beam('metal', x0, z0, x1, z1, 1.0, .05, .05, '#8d9298');
    for (const [x, z] of [[-.95, -.95], [.95, -.95], [-.95, .8], [.95, .8]]) ck.box('metal', x, .5, z, .05, 1, .05, 0, '#8d9298');
    ck.box('metal', .7, .55, -.7, .18, 1.1, .18, 0, '#26282c'); ck.box('glow', .7, 1.12, -.7, .12, .02, .12, 0, '#ff2d2d');
    this.cab = new T.Group(); this.cab.rotation.y = this.F.yaw; ck.build(this.cab, this.mats, {shadows: false}); this.scene.add(this.cab);
    this.place();
  }
  /** The seven screens: canvases, one redrawn a few times a second. */
  buildScreens() {
    this.screens = [];
    const R = 3.4, c0 = {u: this.PC.u, v: this.PC.v - .4};
    const spec = [[-62, 1.5, .9], [-42, 1.7, 1], [-21, 1.9, 1.1], [0, 3.2, 1.8], [21, 1.9, 1.1], [42, 1.7, 1], [62, 1.5, .9]];
    spec.forEach(([deg, w, h], i) => {
      const a = deg * Math.PI / 180, cv = document.createElement('canvas'); cv.width = Math.round(w * 220); cv.height = Math.round(h * 220);
      const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace;
      const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({map: tex, toneMapped: false}));
      m.position.copy(this.W(c0.u + Math.sin(a) * R, c0.v + Math.cos(a) * R, this.DY + 1.55 + (i === 3 ? .45 : 0)));
      m.rotation.y = this.F.yaw + a + Math.PI; this.scene.add(m);
      const frame = new T.Mesh(new T.BoxGeometry(w + .08, h + .08, .05), new T.MeshStandardMaterial({color: '#0b0c0e', roughness: .4}));
      frame.position.copy(m.position); frame.rotation.y = m.rotation.y; frame.translateZ(-.04); this.scene.add(frame);
      this.screens.push({cv, tex, kind: i, t: Math.random() * 10});
      this.draw(this.screens[i], 0);
    });
    this.drawT = 0;
  }
  draw(S, t) {
    const c = S.cv.getContext('2d'), w = S.cv.width, h = S.cv.height, ac = '#59c3ff', dim = '#1d5f86';
    c.fillStyle = '#02070c'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#0d2b40'; c.lineWidth = 1; for (let x = 0; x < w; x += 22) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); } for (let y = 0; y < h; y += 22) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    c.fillStyle = ac; c.font = '600 18px "Courier New", monospace'; c.textBaseline = 'top';
    const k = S.kind, tt = t + S.t;
    if (k === 3) {
      c.font = '700 54px "Courier New", monospace'; c.textAlign = 'center'; c.fillText('BATCOMPUTER', w / 2, 34);
      c.font = '400 24px "Courier New", monospace'; c.fillStyle = '#9fdcff'; c.fillText('WELCOME BACK', w / 2, 104);
      c.fillStyle = dim; c.fillText('LOS SANTERRA · ALL SYSTEMS NOMINAL', w / 2, 140);
      // the city, traced
      c.save(); c.translate(w / 2, h * .66); c.strokeStyle = ac; c.lineWidth = 1.4; const rr = rng(7);
      for (let i = 0; i < 46; i++) { const x = (rr() - .5) * w * .8, y = (rr() - .5) * h * .4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rr() - .5) * 120, y + (rr() - .5) * 40); c.stroke(); }
      const sw = tt * 1.4; c.strokeStyle = '#ff3b3b'; c.beginPath(); c.arc(Math.sin(sw) * 120, Math.cos(sw * .7) * 30, 10 + (tt * 20 % 18), 0, Math.PI * 2); c.stroke();
      c.restore();
    } else if (k === 0 || k === 6) {
      c.fillText(k ? 'SIGNAL' : 'TELEMETRY', 12, 10); c.strokeStyle = ac; c.lineWidth = 2; c.beginPath();
      for (let x = 0; x < w; x += 3) { const y = h * .55 + Math.sin(x * .05 + tt * 4) * h * .18 * Math.sin(x * .013 + tt) + Math.sin(x * .31 + tt * 9) * 4; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    } else if (k === 1 || k === 5) {
      c.fillText(k === 1 ? 'RADAR' : 'SATELLITE', 12, 10); const cx = w / 2, cy = h * .58, R2 = Math.min(w, h) * .36; c.strokeStyle = dim; for (let i = 1; i <= 3; i++) { c.beginPath(); c.arc(cx, cy, R2 * i / 3, 0, Math.PI * 2); c.stroke(); }
      const a = tt * 1.6; c.strokeStyle = ac; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * R2, cy + Math.sin(a) * R2); c.stroke();
      const rr = rng(k * 31); c.fillStyle = '#ff3b3b'; for (let i = 0; i < 5; i++) { const b = rr() * 6.28, d = rr() * R2; c.globalAlpha = .4 + .6 * Math.max(0, Math.cos(a - b)); c.fillRect(cx + Math.cos(b) * d, cy + Math.sin(b) * d, 4, 4); } c.globalAlpha = 1;
    } else {
      c.fillText(k === 2 ? 'CASE FILES' : 'VEHICLE', 12, 10); c.fillStyle = '#9fdcff'; c.font = '400 14px "Courier New", monospace';
      const lines = k === 2 ? ['> SUBJECT: UNKNOWN', '> LAST SEEN: SUNSET BLVD', '> ALIAS: ???', '> STATUS: AT LARGE', '> CROSS-REF... OK', '> PATTERN MATCH 87%'] : ['ARMOUR ........ 100%', 'FUEL .......... 98%', 'TURBINE ....... READY', 'TYRES ......... 31 PSI', 'STEALTH ....... ON', 'DOORS ......... SEALED'];
      const off = Math.floor(tt * 2) % lines.length; lines.forEach((l, i) => c.fillText(lines[(i + off) % lines.length], 14, 40 + i * 20));
    }
    S.tex.needsUpdate = true;
  }
  buildWaterfall() {
    // A sheet of water out of a dark lip in the rock, a little in from the wall, into the pool.
    const mat = new T.MeshBasicNodeMaterial({transparent: true, depthWrite: false, side: T.DoubleSide, fog: false});
    const q = uv(), col = floor(q.x.mul(120)), sp = hash(col).mul(.5).add(1);
    const streak = smoothstep(.35, 1, fract(q.y.mul(3.2).add(time.mul(sp.mul(1.6))).add(hash(col.add(7)).mul(9))));
    const edge = smoothstep(0, .12, q.x).mul(smoothstep(1, .88, q.x));
    mat.colorNode = mix(vec3(.5, .66, .8), vec3(.92, .97, 1), streak);
    mat.opacityNode = streak.mul(.45).add(.32).mul(edge).mul(smoothstep(0, .05, q.y)).mul(smoothstep(1, .93, q.y));
    const u = this.WF.u + 1.4, top = CAVE.floor + 5.2, h = top - CAVE.floor - .3, m = new T.Mesh(new T.PlaneGeometry(4.2, h), mat);
    m.position.copy(this.W(u, this.WF.v, CAVE.floor + .3 + h / 2)); m.rotation.y = this.F.yaw + Math.PI / 2; m.renderOrder = 3; m.userData.noRain = true;
    this.scene.add(m); this.fall = m;
    const lip = new T.Mesh(new T.BoxGeometry(1.4, .5, 5), new T.MeshStandardMaterial({color: '#211e1b', roughness: .9}));
    lip.position.copy(this.W(u - .55, this.WF.v, top + .2)); lip.rotation.y = this.F.yaw; this.scene.add(lip);
    const back = new T.Mesh(new T.BoxGeometry(.6, h + .6, 5.2), new T.MeshStandardMaterial({color: '#1a1816', roughness: .95}));
    back.position.copy(this.W(u - .75, this.WF.v, CAVE.floor + .3 + h / 2)); back.rotation.y = this.F.yaw; this.scene.add(back);
  }
  buildBats() {
    const N = 36, g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, .34, .02, -.08, .16, 0, .14, 0, 0, 0, -.34, .02, -.08, -.16, 0, .14], 3)); g.computeVertexNormals();
    const m = new T.InstancedMesh(g, new T.MeshBasicMaterial({color: '#050506', side: T.DoubleSide}), N * 2);
    m.frustumCulled = false; m.userData.noRain = true; this.scene.add(m);
    const r = rng(77); this.bats = {m, list: Array.from({length: N}, () => ({a: r() * 6.28, rad: .25 + r() * .5, sp: (.25 + r() * .35) * (r() < .5 ? -1 : 1), h: r() * 3, ph: r() * 6.28, rate: 14 + r() * 8}))};
  }
  buildEmblem() {
    // The classic: a black bat on a lit yellow oval.
    const P = [[0, .17], [.05, .33], [.09, .19], [.2, .21], [.36, .33], [.62, .38], [.86, .35], [1, .24], [.91, .1], [.86, -.04], [.74, .05], [.65, -.12], [.53, -.01], [.4, -.22], [.27, -.11], [.13, -.27], [0, -.37]];
    const s = new T.Shape(); s.moveTo(P[0][0], P[0][1]); for (const [x, y] of P.slice(1)) s.lineTo(x, y); for (const [x, y] of [...P].reverse().slice(1, -1)) s.lineTo(-x, y);
    const g = new T.ShapeGeometry(s); g.scale(3.1, 3.1, 1);
    const oval = new T.Mesh(new T.CircleGeometry(1, 48).scale(3.6, 1.9, 1), new T.MeshBasicMaterial({color: '#ffcc33', toneMapped: false}));
    const bat = new T.Mesh(g, new T.MeshBasicMaterial({color: '#060606'})), rim = new T.Mesh(new T.RingGeometry(.98, 1.06, 48).scale(3.6, 1.9, 1), new T.MeshBasicMaterial({color: '#111', toneMapped: false}));
    for (const [o, d] of [[oval, 0], [rim, .01], [bat, .03]]) { o.position.copy(this.W(this.PC.u, this.PC.v + 3.15 - d, this.DY + 4.1)); o.rotation.y = this.F.yaw + Math.PI; this.scene.add(o); }
  }
  /** Frame point of a world point. */
  local(p) { const F = this.F, dx = p.x - F.ox, dz = p.z - F.oz; return {u: dx * F.fx + dz * F.fz, v: dx * F.vx + dz * F.vz, y: p.y - F.y}; }
  /** In the cave, the shaft or the vestibule? */
  inside(q) {
    if (q.u > VEST.u0 - .3 && q.u < VEST.u1 + .3 && q.v > SHAFT.back - .3 && q.v < VEST.v1 + .05 && q.y < this.B.floor + 3.3 && q.y > CAVE.floor - 1) return true;
    return q.y < this.B.floor - 3 && q.y > CAVE.floor - 2 && ((q.u - CAVE.cu) / CAVE.ru) ** 2 + ((q.v - CAVE.cv) / CAVE.rv) ** 2 < 1.05;
  }
  place() {
    const B = this.B, e = this.door, recede = Math.min(1, e / .3), slide = Math.max(0, (e - .3) / .7);
    const ps = slide * slide * (3 - 2 * slide);
    this.panel.position.copy(this.W(SECRET.u + ps * 1.75, this.wall.v - recede * .55, B.floor));
    this.cab.position.copy(this.W(SHAFT.u, SHAFT.v, this.cabY));
  }
  setGate(key, on, u, v, y, su, sy, sv) {
    if (!this.physics || this.gates[key] === on) return; this.gates[key] = on;
    if (!on) { this.physics.remove('cave' + key); return; }
    const p = this.W(u, v, y); this.physics.setBoxes('cave' + key, [{x: p.x, y: p.y, z: p.z, hx: su / 2, hy: sy / 2, hz: sv / 2, yaw: this.F.yaw, tag: 'metal'}]);
  }
  /** The keypad: an input on the screen. Right: the wall opens. */
  keypad() {
    const H = this.hooks; if (!H || this.keypadOpen) return;
    this.keypadOpen = true; H.pause(true);
    const el = document.createElement('div'); el.className = 'bc-pad';
    el.innerHTML = `<div class="bc-box"><span>SECURITY</span><b>ENTER PASSWORD</b><input type="password" maxlength="16" autocomplete="off" spellcheck="false"><small>ENTER TO CONFIRM · ESC TO LEAVE</small></div>`;
    H.root.append(el);
    const inp = el.querySelector('input'), box = el.querySelector('.bc-box'), close = () => { el.remove(); this.keypadOpen = false; H.pause(false); };
    setTimeout(() => inp.focus(), 30);
    inp.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key !== 'Enter') return;
      if (sum(inp.value.trim().toLowerCase()) === KEY) { box.classList.add('ok'); box.querySelector('b').textContent = 'ACCESS GRANTED'; this.audio?.beep(true); setTimeout(() => { close(); this.doorWant = 1; this.doorT = 0; this.audio?.rumble(); }, 650); }
      else { box.classList.remove('no'); void box.offsetWidth; box.classList.add('no'); box.querySelector('b').textContent = 'ACCESS DENIED'; inp.value = ''; this.audio?.beep(false); }
    });
    el.addEventListener('keyup', e => e.stopPropagation());
    el.addEventListener('pointerdown', e => { if (e.target === el) close(); });
  }
  /** E. True if it was ours. */
  press() {
    if (this.go) return this.carrying || this.here;
    if (this.atWall && this.door < .05) { this.keypad(); return true; }
    if (this.inCab) { this.depart(this.stop === 'T' ? 'B' : 'T', true); return true; }
    if (this.atLanding && this.atLanding !== this.stop) { this.depart(this.atLanding, false); return true; }
    return false;
  }
  depart(to, ride) { this.go = {to, ride, t: 0, from: this.cabY}; this.carry = null; this.audio?.beep(true); }
  /** o: {dt, walker (pos, place()), onFoot, camera, audio}. Returns true while it carries you. */
  update({dt, walker, onFoot, camera, audio}) {
    const B = this.B, w = onFoot && walker?.active ? this.local(walker.pos) : null;
    if (audio && !this.audio) this.audio = new CaveAudio(audio.ctx, audio.out);
    const near = !!w && Math.hypot(w.u - CAVE.cu, w.v - CAVE.cv) < 40 && w.y < 4;
    this.here = !!w && this.inside(w);
    // Where you are.
    // Facing the wall (the hall's -v): only right in front of that one panel does it ask.
    if (camera) { camera.getWorldDirection(_D); this.facing = _D.x * this.F.vx + _D.z * this.F.vz; }
    this.atWall = !!w && Math.abs(w.u - SECRET.u) < .9 && w.v > this.wall.v + .2 && w.v < this.wall.v + 1.5 && Math.abs(w.y - B.floor) < 1 && this.facing < -.55;
    this.inCab = !!w && Math.abs(w.u - SHAFT.u) < .95 && Math.abs(w.v - SHAFT.v) < .95 && Math.abs(w.y - this.cabY) < 1.2;
    const atTop = !!w && w.u > VEST.u0 && w.u < VEST.u1 && w.v > VEST.v0 - .1 && w.v < VEST.v1 + 1.2 && Math.abs(w.y - B.floor) < 1.5 && this.door > .9;
    const atBottom = !!w && Math.hypot(w.u - SHAFT.u, w.v - (SHAFT.front + 1.6)) < 2.4 && Math.abs(w.y - CAVE.floor) < 1.5;
    this.atLanding = atTop && !this.inCab ? 'T' : atBottom && !this.inCab ? 'B' : null;
    // The door: shut a few seconds after nobody is near it; open for anyone coming up, or standing behind it.
    const behind = !!w && w.u > VEST.u0 && w.u < VEST.u1 && w.v < VEST.v1 + .05 && w.v > SHAFT.back && Math.abs(w.y - B.floor) < 2;
    if (behind || (this.go && this.go.to === 'T')) { this.doorWant = 1; this.doorT = 0; }
    if (this.doorWant) { const away = !w || Math.hypot(w.u - SECRET.u, w.v - this.wall.v) > 5 || w.y < B.floor - 2; this.doorT = away && !this.go ? this.doorT + dt : 0; if (this.doorT > 5) { this.doorWant = 0; this.audio?.rumble(); } }
    const was = this.door; this.door = this.doorWant ? Math.min(1, this.door + dt / 2.2) : Math.max(0, this.door - dt / 2.2);
    this.setGate('Door', this.door < .02, SECRET.u, this.wall.v, B.floor + 1.3, SECRET.hw * 2, 2.6, .4);
    // The lift.
    const g = this.go;
    if (g) {
      if (g.t === 0 && g.ride && this.inCab) this.carry = {u: Math.max(-.75, Math.min(.75, w.u - SHAFT.u)), v: Math.max(-.75, Math.min(.75, w.v - SHAFT.v))};
      g.t += dt; const k = Math.min(1, g.t / RIDE), s = k * k * (3 - 2 * k), to = g.to === 'T' ? B.floor : CAVE.floor;
      this.cabY = g.from + (to - g.from) * s; this.audio?.ride(Math.sin(k * Math.PI));
      if (k >= 1) { this.stop = g.to; this.go = null; this.audio?.ride(0); this.audio?.beep(true); }
    }
    this.setGate('Top', this.stop !== 'T' || !!this.go, SHAFT.u, VEST.v0 + .1, B.floor + 1.5, SHAFT.hw * 2, 3, .2);
    this.setGate('Bottom', this.stop !== 'B' || !!this.go, SHAFT.u, SHAFT.front + .05, CAVE.floor + 1.5, SHAFT.hw * 2 + .2, 3, .15);
    const carrying = !!this.carry && !!this.go;
    if (carrying) { const p = this.W(SHAFT.u + this.carry.u, SHAFT.v + this.carry.v, this.cabY + .01); walker.place(p.x, p.y, p.z); }
    if (!this.go) this.carry = null;
    this.carrying = carrying;
    if (was !== this.door || g || carrying) this.place();
    // The cave comes alive only when you are near it.
    const inCave = !!w && w.y < B.floor - 2 && this.here;
    if (near && (inCave || carrying)) this.animate(dt, inCave);
    this.audio?.update(dt, inCave ? 1 : carrying ? .4 : 0, w && inCave ? Math.hypot(w.u - this.WF.u, w.v - this.WF.v) : 99);
    if (inCave && this.makeCar && !this.car) this.spawnCar();
    // Prompt.
    this.prompt = carrying ? (g.to === 'B' ? '▼ GOING DOWN' : '▲ GOING UP') : this.atWall && this.door < .05 ? '<kbd>E</kbd> ENTER PASSWORD'
      : this.inCab && !this.go ? '<kbd>E</kbd> ' + (this.stop === 'T' ? 'GO DOWN' : 'GO UP') : this.atLanding && this.atLanding !== this.stop && !this.go ? '<kbd>E</kbd> CALL THE LIFT' : '';
    return carrying;
  }
  animate(dt, full) {
    this.drawT += dt;
    if (full && this.drawT > .25) { this.drawT = 0; this.tick = (this.tick || 0) + 1; const S = this.screens[this.tick % this.screens.length]; this.draw(S, performance.now() / 1000); }
    const {m, list} = this.bats, M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), P = new T.Vector3(), S1 = new T.Vector3(1, 1, 1), t = performance.now() / 1000;
    list.forEach((b, i) => {
      b.a += b.sp * dt; const u = CAVE.cu + Math.cos(b.a) * CAVE.ru * b.rad + Math.sin(t * .7 + b.ph) * 1.5, v = CAVE.cv + Math.sin(b.a) * CAVE.rv * b.rad;
      const y = roofAt(u, v) - 2.2 - b.h + Math.sin(t * 2 + b.ph) * .4, p = this.W(u, v, y), head = this.F.yaw - b.a - (b.sp > 0 ? 0 : Math.PI), flap = Math.sin(t * b.rate + b.ph) * .9;
      for (const s of [0, 1]) { E.set(0, head, (s ? -1 : 1) * flap * .6, 'YXZ'); Q.setFromEuler(E); M.compose(P.copy(p), Q, S1); m.setMatrixAt(i * 2 + s, M); }
    });
    m.instanceMatrix.needsUpdate = true;
    if (this.car) this.car.object.rotateY(dt * .25);
  }
  spawnCar() {
    const v = this.makeCar({paint: '#0b0b0d', ambient: '#ff2d2d', build: {wing: 'attack', kit: 'wide', front: 'gt3', wheels: 'dish', stance: 'slammed', glow: '#3fa9ff', exhaust: 'quad', lights: 'stock'}});
    v.object.position.copy(this.W(this.TT.u, this.TT.v, this.DY + .58)); v.object.rotation.y = this.F.yaw;
    v.object.userData.noRain = true; this.scene.add(v.object); this.car = v;
    if (this.physics) { const p = v.object.position; this.physics.setBoxes('caveCar', [{x: p.x, y: p.y, z: p.z, hx: 2.3, hy: .62, hz: 2.3, yaw: 0, tag: 'metal'}]); }
  }
}

const _D = new T.Vector3();
/** A waterfall, drips, a bat now and then; beeps and the stone door; the lift's hum. */
class CaveAudio {
  constructor(ctx, out) {
    this.ctx = ctx; this.out = out;
    const n = ctx.sampleRate * 2, b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let br = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; br = (br + .04 * w) / 1.04; d[i] = w * .4 + br * 2.5; } }
    this.noise = b;
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
    this.fallG = ctx.createGain(); this.fallG.gain.value = 0; s.connect(f).connect(this.fallG).connect(out); s.start();
    const h = ctx.createOscillator(); h.type = 'sawtooth'; h.frequency.value = 55; const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 160;
    this.humG = ctx.createGain(); this.humG.gain.value = 0; h.connect(hf).connect(this.humG).connect(out); h.start();
    this.dripT = 1; this.batT = 6;
  }
  update(dt, cave, dFall) {
    const t = this.ctx.currentTime;
    this.fallG.gain.setTargetAtTime(cave * .16 / (1 + Math.max(0, dFall - 3) * .12), t, .3);
    if (cave > .5) {
      if ((this.dripT -= dt) < 0) { this.dripT = .4 + Math.random() * 1.6; this.tone(900 + Math.random() * 900, .06, .03, 1.7); }
      if ((this.batT -= dt) < 0) { this.batT = 5 + Math.random() * 9; for (let k = 0; k < 3; k++) setTimeout(() => this.tone(5200 + Math.random() * 1800, .03, .012, .8), k * 70); }
    }
  }
  tone(f, dur, v, rise = 1) {
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), p = c.createStereoPanner(); p.pan.value = Math.random() * 1.6 - .8;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * rise, t + dur); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .003); g.gain.exponentialRampToValueAtTime(.0003, t + dur);
    o.connect(g).connect(p).connect(this.out); o.start(t); o.stop(t + dur + .02);
  }
  beep(ok) { this.tone(ok ? 1320 : 220, ok ? .12 : .3, .05, ok ? 1.5 : .8); }
  ride(k) { this.humG.gain.setTargetAtTime(k * .07, this.ctx.currentTime, .2); }
  rumble() {
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; f.type = 'lowpass'; f.frequency.value = 140;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.35, t + .3); g.gain.linearRampToValueAtTime(.25, t + 1.8); g.gain.exponentialRampToValueAtTime(.001, t + 2.4);
    s.connect(f).connect(g).connect(this.out); s.start(t); s.stop(t + 2.5);
  }
}
