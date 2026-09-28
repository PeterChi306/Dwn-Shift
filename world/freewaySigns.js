/* Freeway sign gantries (2026-09-27).
 *
 * A steel truss over each carriageway, on a post at the shoulder and one on
 * the median, carrying the green signs LA drivers steer by: the route shield,
 * direction and control city over the through lanes, and an EXIT panel naming
 * the street over the lanes that leave. One before every junction where a
 * ramp meets a freeway (for the traffic approaching it), and a route gantry
 * every ~1.6 km in between. All sign faces come from one canvas atlas and
 * all gantries are merged into a few meshes: two draw calls for the city.
 * The faces are retroreflective, so they are faintly lit at night.
 */
import * as T from 'three';
import {texture, uv, vec3, float} from 'three/tsl';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const COLS = 8, ROWS = 16, CW = 256, CH = 128;
const EXIT_AHEAD = 280, EVERY = 1600;

/* Route shields and control cities, by freeway and heading. */
export const ROUTES = {
  '10': {shield: 'I', W: 'Santa Monica', E: 'San Bernardino', N: 'Pasadena', S: 'Long Beach'},
  '110': {shield: 'I', N: 'Pasadena', S: 'San Pedro', E: 'Pasadena', W: 'San Pedro'},
  '210': {shield: 'I', E: 'San Bernardino', W: 'Sylmar', N: 'Sylmar', S: 'Pasadena'},
  '101': {shield: 'US', N: 'Ventura', S: 'Los Santerra', W: 'Ventura', E: 'Los Santerra'},
  '134': {shield: 'CA', E: 'Pasadena', W: 'Ventura', N: 'Glendale', S: 'Pasadena'},
  'HC': {shield: 'CA', num: '2', N: 'Hollywood', W: 'Hollywood', S: 'Downtown', E: 'Downtown'},
};
const DIRWORD = {N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST'};
export const routeOf = name => /Hollywood Connector/.test(name) ? 'HC' : (name.match(/^(\d+)/) || [])[1];

function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export function shield(g, kind, num, cx, cy, s) {
  g.save(); g.translate(cx, cy); g.scale(s, s);
  if (kind === 'I') {                                   // Interstate: red crown over a blue shield
    const path = () => { g.beginPath(); g.moveTo(-20, -18); g.quadraticCurveTo(0, -24, 20, -18); g.quadraticCurveTo(24, 6, 0, 22); g.quadraticCurveTo(-24, 6, -20, -18); g.closePath(); };
    path(); g.fillStyle = '#fff'; g.fill();
    g.save(); g.scale(.88, .88); path(); g.fillStyle = '#1d4fa0'; g.fill(); g.restore();
    g.fillStyle = '#c8202c'; g.beginPath(); g.moveTo(-17.5, -15.5); g.quadraticCurveTo(0, -21, 17.5, -15.5); g.lineTo(18.2, -8); g.lineTo(-18.2, -8); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.font = `700 ${num.length > 2 ? 15 : 18}px Helvetica, Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, 0, 5);
  } else if (kind === 'US') {                           // US route: black-on-white badge
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-18, -20); g.lineTo(18, -20); g.quadraticCurveTo(22, 0, 16, 12); g.quadraticCurveTo(0, 22, -16, 12); g.quadraticCurveTo(-22, 0, -18, -20); g.fill();
    g.strokeStyle = '#111'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#111'; g.font = '700 16px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, 0, 0);
  } else {                                              // California state route: green spade
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -22); g.quadraticCurveTo(22, -14, 18, 4); g.quadraticCurveTo(12, 18, 0, 22); g.quadraticCurveTo(-12, 18, -18, 4); g.quadraticCurveTo(-22, -14, 0, -22); g.fill();
    g.fillStyle = '#18703f'; g.save(); g.scale(.86, .86); g.beginPath(); g.moveTo(0, -22); g.quadraticCurveTo(22, -14, 18, 4); g.quadraticCurveTo(12, 18, 0, 22); g.quadraticCurveTo(-12, 18, -18, 4); g.quadraticCurveTo(-22, -14, 0, -22); g.fill(); g.restore();
    g.fillStyle = '#fff'; g.font = '700 16px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, 0, 2);
  }
  g.restore();
}
function fit(g, text, font, max) { let px = parseInt(font.match(/(\d+)px/)[1]); g.font = font; while (g.measureText(text).width > max && px > 10) { px -= 2; g.font = font.replace(/\d+px/, px + 'px'); } }

class Atlas {
  constructor() {
    this.c = document.createElement('canvas'); this.c.width = COLS * CW; this.c.height = ROWS * CH;
    this.g = this.c.getContext('2d'); this.slots = new Map();
  }
  cell(key, draw) {
    if (this.slots.has(key)) return this.slots.get(key);
    const i = this.slots.size; if (i >= COLS * ROWS) return this.slots.get([...this.slots.keys()][0]);
    const x = (i % COLS) * CW, y = Math.floor(i / COLS) * CH, g = this.g;
    g.save(); g.translate(x, y);
    g.fillStyle = '#0d6a3b'; g.fillRect(0, 0, CW, CH);
    g.strokeStyle = '#f2f2ea'; g.lineWidth = 4; roundRect(g, 6, 6, CW - 12, CH - 12, 10); g.stroke();
    draw(g);
    g.restore();
    const uv = [x / this.c.width, 1 - (y + CH) / this.c.height, (x + CW) / this.c.width, 1 - y / this.c.height];
    this.slots.set(key, uv);
    return uv;
  }
  route(r, d) {
    const R = ROUTES[r];
    return this.cell(`route:${r}:${d}`, g => {
      shield(g, R.shield, R.num || r, 52, 58, 1.7);
      g.fillStyle = '#f2f2ea'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.font = '700 26px Helvetica, Arial'; g.fillText(DIRWORD[d], 100, 50);
      fit(g, R[d], '600 30px Helvetica, Arial', CW - 112); g.fillText(R[d], 100, 90);
    });
  }
  exit(street) {
    return this.cell(`exit:${street}`, g => {
      g.fillStyle = '#f2c230'; roundRect(g, CW - 92, 12, 80, 30, 5); g.fill();
      g.fillStyle = '#111'; g.font = '800 20px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EXIT', CW - 52, 28);
      g.fillStyle = '#f2f2ea'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      fit(g, street, '600 32px Helvetica, Arial', CW - 36); g.fillText(street, 18, 82);
      g.font = '600 20px Helvetica, Arial'; g.fillText('1/4 MILE', 18, 110);
    });
  }
}

/** Heading word for travel along (tx, tz): +x east, +z south. */
const heading = (tx, tz) => Math.abs(tx) > Math.abs(tz) ? (tx > 0 ? 'E' : 'W') : (tz > 0 ? 'S' : 'N');

export function buildFreewaySigns({model, scene, night}) {
  const atlas = new Atlas(), steel = [], faces = [], backs = [];
  const nameOf = (seg, s) => model.net.edges[model.sectionAt(seg, s).e].name || '';
  const placed = [];
  const gantry = (seg, s, dir, panels) => {
    const sec = model.sectionAt(seg, s), h = sec.h;
    if (placed.some(p => Math.hypot(p[0] - sec.x, p[1] - sec.z) < 180 && p[2] === dir * (seg.id + 1))) return;
    placed.push([sec.x, sec.z, dir * (seg.id + 1)]);
    // Local frame: across the carriageway (right of travel) and along it.
    const rx = sec.nx * dir, rz = sec.nz * dir, fx = sec.tx * dir, fz = sec.tz * dir;
    const at = (o, y, f = 0) => [sec.x + rx * o + fx * f, sec.y + (sec.cs || 0) * o * dir + y, sec.z + rz * o + fz * f];
    const yaw = Math.atan2(fx, fz);
    const put = (g, list, p, ry = yaw) => { g.rotateY(ry); g.translate(...p); list.push(g.index ? g.toNonIndexed() : g); };
    const o0 = 1.1, o1 = h + 1.6, top = 7.2;
    for (const o of [o0, o1]) { const post = new T.CylinderGeometry(.2, .24, top + .4, 8); post.translate(0, (top + .4) / 2, 0); put(post, steel, at(o, 0)); }
    // The truss: two chords and a deck grating box between the posts.
    const span = o1 - o0 + .6;
    for (const dy of [0, .9]) { const chord = new T.BoxGeometry(span, .18, .18); put(chord, steel, at((o0 + o1) / 2, top - .45 + dy - .45)); }
    const walk = new T.BoxGeometry(span, .08, 1.1); put(walk, steel, at((o0 + o1) / 2, top - 1.0, -.5));
    // Panels facing the traffic (which drives toward -f).
    const PW = Math.min(6.4, (o1 - o0 - 1) / panels.length), PH = PW / 2;
    panels.forEach((uvq, i) => {
      const o = o1 - .8 - PW / 2 - i * (PW + .4), c = at(o, top - .45, -.25);
      const face = new T.PlaneGeometry(PW, PH); face.rotateY(Math.PI);                   // face -f
      const u = face.attributes.uv; for (let k = 0; k < u.count; k++) u.setXY(k, u.getX(k) ? uvq[2] : uvq[0], u.getY(k) ? uvq[3] : uvq[1]);
      put(face, faces, c);
      const back = new T.BoxGeometry(PW + .1, PH + .1, .12); put(back, backs, at(o, top - .45, -.18));
    });
  };

  // 1. Exit gantries: before each junction where a ramp meets a freeway.
  for (const j of model.junctions) {
    if (j.cap || !j.ends.some(e => e.seg.kind === 'ramp')) continue;
    const ramp = j.ends.find(e => e.seg.kind === 'ramp');
    const rs = ramp.atStart ? Math.min(ramp.seg.L, 40) : Math.max(0, ramp.seg.L - 40);
    const street = (nameOf(ramp.seg, rs).split('/')[0] || '').trim();
    for (const e of j.ends) {
      if (e.seg.kind !== 'freeway') continue;
      const seg = e.seg, dir = e.atStart ? -1 : 1;                // traffic approaching this junction
      const s = e.atStart ? EXIT_AHEAD : seg.L - EXIT_AHEAD;
      if (s < seg.cut[0] + 30 || s > seg.L - seg.cut[1] - 30) continue;
      const sec = model.sectionAt(seg, s), r = routeOf(nameOf(seg, s));
      if (!r || !ROUTES[r] || !street) continue;
      gantry(seg, s, dir, [atlas.exit(street), atlas.route(r, heading(sec.tx * dir, sec.tz * dir))]);
    }
  }
  // 2. Route gantries along the way.
  for (const seg of model.segments) {
    if (seg.kind !== 'freeway' || seg.L < 900) continue;
    for (let s = seg.cut[0] + 500; s < seg.L - seg.cut[1] - 400; s += EVERY) for (const dir of [1, -1]) {
      const sec = model.sectionAt(seg, s), r = routeOf(nameOf(seg, s));
      if (!r || !ROUTES[r]) continue;
      gantry(seg, dir > 0 ? s : Math.min(seg.L - seg.cut[1] - 400, s + 300), dir, [atlas.route(r, heading(sec.tx * dir, sec.tz * dir))]);
    }
  }
  if (!steel.length) return {count: 0};
  const strip = g => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; };
  const tex = new T.CanvasTexture(atlas.c); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 8;
  const steelMat = new T.MeshStandardMaterial({color: '#8b9096', roughness: .5, metalness: .7});
  const backMat = new T.MeshStandardMaterial({color: '#6f757b', roughness: .6, metalness: .5});
  const faceMat = new T.MeshStandardNodeMaterial({roughness: .45, metalness: 0});
  faceMat.colorNode = texture(tex, uv()).rgb;
  faceMat.emissiveNode = texture(tex, uv()).rgb.mul(night ?? float(0)).mul(.55);
  const meshes = [[steel, steelMat], [backs, backMat], [faces, faceMat]].map(([list, mat]) => {
    const m = new T.Mesh(mergeGeometries(list.map(strip)), mat);
    m.castShadow = mat !== faceMat; m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m);
    return m;
  });
  return {count: placed.length, placed, meshes, atlas: atlas.c};
}
