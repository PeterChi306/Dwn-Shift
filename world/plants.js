/* Trees, palms and scrub for one area (West Hollywood first).
 *
 * Species are procedural and instanced: one mesh per species part, per 512 m
 * chunk, so frustum culling works and the draw count stays low. Every plant is
 * placed by testing its spot against the roads (carriageway + pavement), the
 * building footprints and the junction outlines, so none stands in a road.
 *
 * Where things go, following the real place:
 *   - palms and street trees in the grass parkways and pavement tree wells;
 *   - front gardens and backyards fill the middles of blocks with canopy;
 *   - the hills get chaparral scrub everywhere, coast live oaks in the folds,
 *     and cypress and palms around the houses.
 */
import {beachZ, COAST_ROAD_Z} from './coast.js';
import {reserved} from './places.js';
import * as T from 'three';
import {uniform, positionLocal, sin, cos, time, vec2, vec3, float, attribute, dot, fract, clamp, length, max, step} from 'three/tsl';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {VERGE, CURB} from './roads.js';
import {inArea, areaOf} from './buildings.js';
import {EAST_NAMES} from './eastside.js';
import {growTree, clusterTexture, barkTexture as treeBark} from './trees.js';

const rng = seed => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
const CHUNK = 512;
/** Height of the crown base above the plant's foot: where the trunk bend peaks. */
const CROWN = {fanPalm: p => p.h, datePalm: p => p.h, broad: p => 3.2 * p.s, jacaranda: p => 3.2 * p.s, oak: p => 2.4 * p.s, cypress: p => 8 * p.s, shrub: p => p.s,
  eucalyptus: p => p.h * .72, pine: p => p.h * .75, rock: p => p.s};
/** Species drawn as branching trees (world/trees.js) within NEAR_R of the camera. */
const NEAR = ['broad', 'jacaranda', 'oak', 'eucalyptus', 'pine', 'shrub'], NEAR_R = 110, VARIANTS = 4, NEAR_CAP = 1200;

/* ----------------------------------------------------------- textures */
function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c) { const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t; }

/** A Washingtonia fan: a half-disc of stiff leaflets, green going yellow at the tips. */
function fanTexture() {
  // The frond as seen along its petiole: a bare stalk, then the fan spreading
  // into stiff leaflets with frayed, sun-yellowed tips. v runs stalk -> tip.
  const [c, x] = canvas(256, 512), r = rng(3);
  x.strokeStyle = '#6f6a44'; x.lineWidth = 6; x.beginPath(); x.moveTo(128, 512); x.lineTo(128, 250); x.stroke();
  for (let i = 0; i < 40; i++) {
    const a = -Math.PI / 2 + (i / 39 - .5) * 2.4, len = 200 + r() * 70;
    const g = x.createLinearGradient(128, 260, 128 + Math.cos(a) * len, 260 + Math.sin(a) * len);
    g.addColorStop(0, '#3a5527'); g.addColorStop(.65, '#56753a'); g.addColorStop(1, '#9c9a58');
    x.strokeStyle = g; x.lineWidth = 4 + r() * 2.5;
    x.beginPath(); x.moveTo(128, 262);
    x.quadraticCurveTo(128 + Math.cos(a) * len * .5, 262 + Math.sin(a) * len * .5, 128 + Math.cos(a) * len, 262 + Math.sin(a) * len + 18 * r());
    x.stroke();
  }
  return tex(c);
}
/** A pinnate frond (Canary palm): a long rachis with leaflets both sides. */
function frondTexture() {
  const [c, x] = canvas(128, 512), r = rng(5);
  x.strokeStyle = '#6b6a3a'; x.lineWidth = 4; x.beginPath(); x.moveTo(64, 512); x.lineTo(64, 0); x.stroke();
  for (let y = 500; y > 10; y -= 6) {
    const len = 58 * Math.sin((512 - y) / 512 * Math.PI) + 6;
    for (const s of [-1, 1]) {
      x.strokeStyle = `rgb(${50 + r() * 30 | 0},${88 + r() * 40 | 0},${34 + r() * 20 | 0})`; x.lineWidth = 2.5;
      x.beginPath(); x.moveTo(64, y); x.lineTo(64 + s * len, y - len * .6); x.stroke();
    }
  }
  return tex(c);
}
/** A cluster of leaves for broadleaf canopies; `hues` sets the species.
 *  Returns the alpha-cut card and, with `solid`, an opaque version (the same
 *  leaves over their own shade) for the crown cores, so a core reads as more
 *  foliage rather than a painted hull. */
function leafTexture(hues, seed, blossom = null, solid = false) {
  const [c, x] = canvas(256), r = rng(seed);
  if (solid) {
    // Deep shade between the leaves: the darkest hue, darker still.
    const d = new T.Color(hues[0]).multiplyScalar(.55);
    x.fillStyle = `#${d.getHexString()}`; x.fillRect(0, 0, 256, 256);
  }
  const reach = solid ? 150 : 110, count = solid ? 520 : 300;
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * reach, px = 128 + Math.cos(a) * d, py = 128 + Math.sin(a) * d;
    const w = 3.5 + r() * 3.5, l = 8 + r() * 6, rot = r() * 6.28, hue = hues[Math.floor(r() * hues.length)];
    const draw = (qx, qy) => {
      x.save(); x.translate(qx, qy); x.rotate(rot);
      // A darker rim, then the leaf, then a sunlit half: each leaf separates
      // from its neighbours instead of melting into camouflage noise.
      x.fillStyle = 'rgba(12,18,8,.45)'; x.beginPath(); x.ellipse(.8, 1, w + .8, l + .8, 0, 0, 6.28); x.fill();
      x.fillStyle = hue; x.beginPath(); x.ellipse(0, 0, w, l, 0, 0, 6.28); x.fill();
      x.fillStyle = `rgba(255,250,210,${.08 + r() * .14})`; x.beginPath(); x.ellipse(-w * .3, -l * .15, w * .55, l * .75, 0, 0, 6.28); x.fill();
      x.strokeStyle = 'rgba(20,28,12,.35)'; x.lineWidth = .8; x.beginPath(); x.moveTo(0, -l * .9); x.lineTo(0, l * .9); x.stroke();
      x.restore();
    };
    if (solid) { for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) if (Math.abs(px + ox - 128) < 150 && Math.abs(py + oy - 128) < 150) draw(px + ox, py + oy); }
    else draw(px, py);
  }
  if (blossom) for (let i = 0; i < (solid ? 260 : 160); i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (solid ? 150 : 108);
    x.fillStyle = blossom[Math.floor(r() * blossom.length)];
    x.beginPath(); x.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 3 + r() * 4, 0, 6.28); x.fill();
  }
  const t = tex(c);
  if (solid) t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/** Normals pointing out of the crown's centre, so leaf cards and cores are
 *  lit as one rounded mass (the foliage trick) instead of as random facets. */
function roundNormals(g, cx = 0, cy = 0, cz = 0, up = .35) {
  const p = g.attributes.position, n = new Float32Array(p.count * 3), v = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i) - cx, p.getY(i) - cy + up, p.getZ(i) - cz).normalize();
    n.set([v.x, v.y, v.z], i * 3);
  }
  g.setAttribute('normal', new T.BufferAttribute(n, 3));
  return g;
}
/** Weathered sandstone: tan and grey, darker cracks, pale lichen blotches. */
function rockTexture() {
  const [c, x] = canvas(256), r = rng(71);
  x.fillStyle = '#a39580'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    const t = 120 + r() * 70;
    x.fillStyle = `rgba(${t | 0},${t * .93 | 0},${t * .82 | 0},.25)`;
    x.beginPath(); x.arc(r() * 256, r() * 256, 4 + r() * 22, 0, 6.28); x.fill();
  }
  for (let i = 0; i < 22; i++) {
    let px = r() * 256, py = r() * 256, a = r() * 6.28;
    x.strokeStyle = 'rgba(50,40,30,.55)'; x.lineWidth = 1 + r() * 1.5; x.beginPath(); x.moveTo(px, py);
    for (let s = 0; s < 8; s++) { a += (r() - .5) * .8; px += Math.cos(a) * 9; py += Math.sin(a) * 9; x.lineTo(px, py); }
    x.stroke();
  }
  for (let i = 0; i < 60; i++) {
    x.fillStyle = r() < .6 ? 'rgba(200,196,170,.55)' : 'rgba(120,130,90,.45)';
    x.beginPath(); x.arc(r() * 256, r() * 256, 1.5 + r() * 5, 0, 6.28); x.fill();
  }
  const t = tex(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
}
function barkTexture(base, rings) {
  const [c, x] = canvas(64, 256), r = rng(9);
  x.fillStyle = base; x.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += rings ? 5 : 2) {
    x.fillStyle = `rgba(40,30,20,${rings ? .07 + r() * .07 : r() * .12})`;
    x.fillRect(0, y, 64, rings ? 2 : 1 + r() * 2);
  }
  const t = tex(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
}

/* ----------------------------------------------------------- geometry */
const up = new T.Vector3(0, 1, 0);
function card(w, h, x, y, z, yaw, pitch, roll = 0) {
  const g = new T.PlaneGeometry(w, h);
  g.translate(0, h / 2, 0);
  g.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(pitch, yaw, roll, 'YXZ')));
  g.translate(x, y, z);
  return g;
}
/** A frond on its petiole: a quad whose long axis leaves the crown at `elev`
 *  above horizontal and bends down at the tip, lying flat-ish so the fan
 *  shows from below and from the side. */
function frond(len, width, yaw, elev) {
  const g = new T.BufferGeometry(), dir = [Math.cos(yaw), 0, Math.sin(yaw)], side = [-Math.sin(yaw), 0, Math.cos(yaw)];
  const pts = [], uvs = [], idx = [];
  const N = 4;
  for (let k = 0; k <= N; k++) {
    const t = k / N, bend = elev - t * t * 1.1;                    // droops toward the tip
    const along = len * t, cx = dir[0] * along * Math.cos(elev), cz = dir[2] * along * Math.cos(elev);
    const cy = len * (Math.sin(elev) * t - .45 * t * t * (1 - Math.sin(Math.max(0, bend))));
    const w = width * Math.sin(Math.PI * Math.min(1, t * 1.1 + .05)) * .5;
    pts.push(cx - side[0] * w, cy, cz - side[2] * w, cx + side[0] * w, cy, cz + side[2] * w);
    uvs.push(0, t, 1, t);
    if (k) { const a = (k - 1) * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  }
  g.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Species: {parts: [{geo, mat}]} in a unit-ish frame; instances scale them. */
function makeSpecies(M) {
  const r = rng(17), S = {};
  // Mexican fan palm: 1 m tall template, scaled per instance; crown is a
  // separate part so it keeps its size while the trunk stretches.
  {
    const trunk = new T.CylinderGeometry(.16, .24, 1, 7, 6, true); trunk.translate(0, .5, 0);
    // Fronds radiate out from the crown and droop at the tips: a round head,
    // not a cup. Upper fronds rise, lower ones hang (the old ones fold down
    // into the skirt below).
    const fronds = [];
    for (let i = 0; i < 22; i++) {
      const yaw = i / 22 * Math.PI * 2 + r() * .3, elev = (i % 3 === 0 ? .7 : i % 3 === 1 ? .1 : -.45) + (r() - .5) * .3;
      fronds.push(frond(2.5, 1.2, yaw, elev));
    }
    const skirt = new T.CylinderGeometry(.42, .3, 1.6, 8, 1, true); skirt.translate(0, -.9, 0);
    S.fanPalm = {trunk, crown: mergeGeometries(fronds), skirt};
  }
  {
    const trunk = new T.CylinderGeometry(.45, .55, 1, 9, 4, true); trunk.translate(0, .5, 0);
    const fronds = [];
    for (let i = 0; i < 26; i++) {
      const yaw = i / 26 * Math.PI * 2 + r() * .2, pitch = -.25 - (i % 3) * .35 - r() * .3;
      fronds.push(card(1.1, 4.6, 0, 0, 0, yaw, pitch));
    }
    S.datePalm = {trunk, crown: mergeGeometries(fronds)};
  }
  // Broadleaf canopy: leaf cards around an ellipsoid, and a trunk with a fork.
  const canopy = (count, rx, ry, seed) => {
    const q = rng(seed), cards = [];
    for (let i = 0; i < count; i++) {
      const a = q() * Math.PI * 2, e = Math.acos(q() * 2 - 1), rr = .35 + Math.cbrt(q()) * .65;
      const x = Math.sin(e) * Math.cos(a) * rx * rr, y = Math.cos(e) * ry * rr, z = Math.sin(e) * Math.sin(a) * rx * rr;
      cards.push(card(2.4, 2.4, x, y - 1.2, z, q() * 6.28, q() * 1.2 - .6, q() * .6 - .3));
    }
    return roundNormals(mergeGeometries(cards));
  };
  const woody = (h) => { const t = new T.CylinderGeometry(.14, .26, h, 7); t.translate(0, h / 2, 0); return t; };
  S.broad = {trunk: woody(3.2), crown: canopy(40, 3.4, 2.4, 21)};
  S.oak = {trunk: woody(2.4), crown: canopy(44, 4.4, 2.2, 23)};
  // Boulder: a lumpy icosphere, flattened underneath, weathered round.
  S.rock = (() => {
    const g = new T.IcosahedronGeometry(1, 3), a = g.attributes.position, q = rng(61), v = new T.Vector3();
    const bumps = Array.from({length: 7}, () => [new T.Vector3(q() - .5, q() - .5, q() - .5).normalize(), .1 + q() * .25, 1.5 + q() * 2]);
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i);
      const d = v.clone().normalize();
      let k = 1;
      for (const [b, h, sharp] of bumps) k += h * Math.max(0, d.dot(b)) ** sharp;
      k += (Math.sin(d.x * 9 + d.y * 7) * Math.cos(d.z * 8 - d.x * 5)) * .05;
      v.multiplyScalar(k); if (v.y < -.2) v.y = -.2 + (v.y + .2) * .3;
      a.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  })();
  S.tallTrunk = (() => { const g = new T.CylinderGeometry(.16, .26, 1, 7, 4, true); g.translate(0, .5, 0); return g; })();
  S.cypress = {crown: (() => { const g = new T.CylinderGeometry(.2, .75, 8, 8, 4); roundNormals(g, 0, -2, 0, 0); g.translate(0, 4.4, 0); return g; })()};
  // A solid leaf-coloured core inside every crown: cards alone leave holes
  // you can see the sky through (the "doughnut" jacarandas).
  const core = (sx, sy, dy = 0, detail = 1) => { const g = roundNormals(new T.IcosahedronGeometry(1, detail), 0, 0, 0, 0); g.scale(sx, sy, sx); g.translate(0, dy, 0); return g; };
  S.broad.core = core(2.1, 1.45, 0, 0); S.oak.core = core(2.8, 1.3, 0, 0);   // hidden inside the leaves: 20 triangles is plenty
  // Chaparral: a dome of small leaf cards round a dense core, not a rock.
  S.shrub = {crown: (() => { const g = canopy(7, 1.05, .7, 29); g.scale(.62, .62, .62); g.translate(0, .62, 0); return g; })(), core: core(.78, .52, .5, 0)};   // ~34 triangles: there are tens of thousands
  return S;
}

/* ------------------------------------------------------------- the lot */
export class Plants {
  constructor({model, ground, buildings, area, deferY = false}) {
    this.model = model; this.ground = ground; this.buildings = buildings; this.area = area;
    this.list = [];                      // {sp, x, y, z, s, h, yaw, tint}
    this.deferY = deferY;                // heights come later from seat() (a worker pool)
    this.taken = new Set();
    this.place();
  }
  ok(x, z, radius) {
    const B = this.buildings;
    if (!inArea(this.area, x, z) || !B.clear(x, z, radius - 1.2)) return false;
    for (const [dx, dz] of [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]])
      if (B.occupied.hasAt(x + dx, z + dz)) return false;
    const key = Math.floor(x / 3) * 100000 + Math.floor(z / 3);
    if (this.taken.has(key)) return false;
    this.taken.add(key);
    return true;
  }
  add(sp, x, z, s, h, tint, r) { this.list.push({sp, x, z, y: this.deferY ? NaN : this.ground.height(x, z) - .1, s, h, yaw: r() * 6.28, tint}); }
  /** Seat every plant on the ground, with the heights from a HeightPool. */
  async seat(pool) {
    const xz = new Float32Array(this.list.length * 2);
    this.list.forEach((p, i) => { xz[i * 2] = p.x; xz[i * 2 + 1] = p.z; });
    const h = await pool.heights(xz, this.ground.pads || null);
    this.list.forEach((p, i) => { p.y = h[i] - .1; });
  }

  place() {
    const r = rng(1776), m = this.model;
    // 1. Street trees: in the parkway on residential streets, in tree wells on
    //    commercial ones. One species per street, like a real planting plan.
    for (const seg of m.segments) {
      if (!CURB.has(seg.kind) || seg.elevated) continue;
      const mid = m.sectionAt(seg, seg.L / 2);
      if (!inArea(this.area, mid.x, mid.z)) continue;
      const q = rng(seg.id * 7919 + 13), street = seg.kind === 'street' || seg.kind === 'residential';
      const roll = q(), strip = /Sunset/.test(seg.name || ''), part = areaOf(this.area, mid.x, mid.z)?.name;
      // Beverly Hills: its drives are lined with tall fan palms, one species a
      // street. Downtown: ficus in tree wells, the odd palm, some bare blocks.
      // Pasadena: oaks, sycamores and camphor over the streets, jacaranda, the odd palm row.
      const pas = part === 'pasadena' ? (roll < .55 ? 'broad' : roll < .72 ? 'jacaranda' : roll < .86 ? 'fanPalm' : roll < .93 ? 'broad' : 'datePalm') : null;
      let sp = pas ? pas : part === 'beverly' ? (seg.kind === 'residential' ? (roll < .8 ? 'fanPalm' : 'jacaranda') : roll < .55 ? 'fanPalm' : 'broad')
        : part === 'downtown' ? (street ? (roll < .55 ? 'broad' : roll < .7 ? 'fanPalm' : 'none') : (roll < .4 ? 'fanPalm' : roll < .85 ? 'broad' : 'none'))
        : strip ? (roll < .5 ? 'fanPalm' : 'none') : street ? (roll < .38 ? 'fanPalm' : roll < .55 ? 'jacaranda' : roll < .62 ? 'datePalm' : 'broad')
        : (roll < .6 ? 'fanPalm' : 'broad');
      // The beachfront boulevard: a row of tall fan palms on both sides, nothing
      // leafy to block the view of the sea.
      const beachfront = Math.abs(mid.z - COAST_ROAD_Z) < 14 && Math.abs(m.sectionAt(seg, 0).z - COAST_ROAD_Z) < 14;
      if (beachfront) sp = 'fanPalm';
      const tall = part === 'beverly' ? 6 : beachfront ? 9 : 0;
      if (sp === 'none') continue;
      const spacing = sp === 'fanPalm' ? 11 + q() * 4 : 9 + q() * 3;
      const off = street ? (VERGE[seg.kind] ?? 2) * .22 : 1.1;
      for (let s = seg.cut[0] + 7; s < seg.L - seg.cut[1] - 7; s += spacing) {
        const sec = m.sectionAt(seg, s);
        for (const side of [-1, 1]) {
          const x = sec.x + sec.nx * side * (sec.h + off), z = sec.z + sec.nz * side * (sec.h + off);
          if (!inArea(this.area, x, z)) continue;
          if (!this.street(x, z)) continue;
          if (reserved(x, z)) continue;
          if (sp === 'fanPalm') this.add('fanPalm', x, z, 1, 15 + tall + q() * 9, .9 + q() * .2, r);
          else if (sp === 'datePalm') this.add('datePalm', x, z, 1, 6 + q() * 4, 1, r);
          else this.add(sp === 'jacaranda' ? 'jacaranda' : 'broad', x, z, .9 + q() * .4, 1, .85 + q() * .3, r);
        }
      }
    }
    // 2. Gardens and backyards: scatter through the area, keep what is clear
    //    of roads and buildings. Flat land: leafy; hills: scrub and oaks.
    const step = 7;
    for (const A of this.area.parts || [this.area]) for (let x = A.x0; x < A.x1; x += step) for (let z = A.z0; z < A.z1; z += step) {
      const px = x + r() * step, pz = z + r() * step;
      if (pz > beachZ(px) - 3 || reserved(px, pz)) continue;              // sand, set pieces: no gardens
      if (A.name === 'downtown' && r() < .65 || A.name === 'midcity' && r() < .35) continue;   // denser city: fewer gardens
      // Hill or flat from the natural landform (a heightmap lookup): the
      // shaped ground costs ~14 us a call and this runs ~600k times.
      const nat = this.ground.natural.bind(this.ground), g = nat(px, pz), slope = Math.abs(nat(px + 4, pz) - g) + Math.abs(nat(px, pz + 4) - g);
      // Pasadena's plateau is leafy city; east of downtown the whole basin floor
      // rises past 60 m, so there a hill is measured from the floor (as terrainCore's hillMask does).
      const floor = 6 + .03 * (px / 10 + 768) + .016 * (1024 - (pz / 10 + 512));
      const hill = A.name === 'pasadena' ? g > 280 || slope > 2.2 : EAST_NAMES.has(A.name) ? g - floor > 35 || slope > 1.4 : g > 60 || slope > 1.4;
      const roll = r();
      if (hill) {
        if (roll < .55 && this.ok(px, pz, 1.8)) this.add('shrub', px, pz, 1 + r() * 1.4, 1, r(), r);
        else if (roll < .61 && this.ok(px, pz, 3.5)) this.add('oak', px, pz, .8 + r() * .6, 1, .8 + r() * .4, r);
        else if (roll < .635 && this.ok(px, pz, 3)) { const h = 15 + r() * 11; this.add('eucalyptus', px, pz, h / 21 * 1.5, h, .85 + r() * .3, r); }
        else if (roll < .655 && this.ok(px, pz, 3)) { const h = 8 + r() * 7; this.add('pine', px, pz, h / 12 * 1.1, h, .85 + r() * .3, r); }
        else if (roll < .69 && this.ok(px, pz, 2.4)) {
          // Sandstone boulders, sometimes a little cluster of them.
          const n = r() < .3 ? 2 + Math.floor(r() * 3) : 1;
          for (let k = 0; k < n; k++) this.add('rock', px + (k ? (r() - .5) * 5 : 0), pz + (k ? (r() - .5) * 5 : 0), (.5 + r() * 1.5) * (k ? .6 : 1), .45 + r() * .4, r(), r);
        }
      } else {
        if (roll < .24 && this.ok(px, pz, 2.5)) {
          const k = r();
          if (k < .6) this.add('broad', px, pz, .8 + r() * .7, 1, .8 + r() * .4, r);
          else if (k < .76) this.add('jacaranda', px, pz, .8 + r() * .7, 1, .8 + r() * .4, r);
          else if (k < .88) { const h = 8 + r() * 6; this.add('pine', px, pz, h / 12 * 1.1, h, .85 + r() * .3, r); }
          else { const h = 14 + r() * 10; this.add('eucalyptus', px, pz, h / 21 * 1.5, h, .85 + r() * .3, r); }
        }
        else if (roll < .3 && this.ok(px, pz, 1.4)) this.add(r() < .5 ? 'fanPalm' : 'cypress', px, pz, 1, 10 + r() * 12, 1, r);
        else if (roll < .5 && this.ok(px, pz, 1.2)) this.add('shrub', px, pz, .7 + r() * .8, 1, .4 + r() * .6, r);
      }
    }
    // 3. Around hill houses: a cypress or two and a palm, the LA hillside look.
    for (const lot of this.buildings.lots) {
      if (!['hill', 'bungalow', 'estate', 'bhHouse', 'pasHouse'].includes(lot.zone)) continue;
      const q = rng(lot.seed);
      for (let k = 0; k < 2; k++) {
        const lx = -.5 - q() * Math.max(.5, lot.spec.setback - 3), lz = (q() - .5) * lot.width;
        const x = lot.x + lot.fx * lx + lot.tx * lz, z = lot.z + lot.fz * lx + lot.tz * lz;
        if (!this.street(x, z)) continue;
        const roll = q();
        this.add(roll < .45 ? 'cypress' : roll < .7 ? 'fanPalm' : 'shrub', x, z, roll < .7 ? 1 : 1.2, roll < .45 ? 1 : 12 + q() * 8, 1, r);
      }
    }
  }
  /** Parkway/front-garden spot: off the carriageway and junctions, off buildings. */
  street(x, z) {
    const m = this.model;
    for (const j of m.junctionsNear(x, z)) if (Math.hypot(x - j.x, z - j.z) < j.radius + 3) return false;
    const r = m.nearest(x, z, null, true);
    if (r && r.d < r.h + .6) return false;
    if (this.buildings.occupied.hasAt(x, z)) return false;
    const key = Math.floor(x / 3) * 100000 + Math.floor(z / 3);
    if (this.taken.has(key)) return false;
    this.taken.add(key);
    return true;
  }

  /** Instanced meshes, one per species part per chunk. */
  build(scene) {
    const S = makeSpecies();
    const bark = barkTexture('#8b7d6b', false), palmBark = barkTexture('#9a8a72', true);
    /* Wind. positionLocal here is ALREADY instance-transformed (three applies
     * the instance matrix before positionNode), so it is a world position; each
     * instance carries its own anchor in the `wind` attribute: (x, base y, z,
     * height of the crown base above it).
     * One sea breeze from the WSW for the whole city, with gusts that roll
     * across it downwind, so neighbouring trees move together and a gust can
     * be watched travelling down a street. Three layers, as in real trees:
     *   lean + sway: the whole tree bends downwind, trunk bending as y^2, at
     *     its own slow natural frequency (tall palms slowest);
     *   fronds: palm leaves flap about their stalks, tips most;
     *   flutter: small fast leaf shimmer, scaled by the gust. */
    const windDir = vec2(.88, -.47), windOn = uniform(1);
    this.wind = windOn;
    const anchor = attribute('wind', 'vec4');
    const ax = anchor.x, ay = anchor.y, az = anchor.z, crownH = anchor.w;
    const wp = vec2(ax, az), downwind = dot(wp, windDir);
    const phase = fract(sin(dot(wp, vec2(12.9898, 78.233))).mul(43758.5453)).mul(6.283);
    // 0.25 .. 1: a travelling gust front (~60 m wavelength, ~9 m/s) on a slow swell.
    const gust = sin(time.mul(.9).sub(downwind.mul(.1))).mul(.5).add(.5).mul(sin(time.mul(.23).sub(downwind.mul(.011)).add(1.7)).mul(.4).add(.6)).mul(.75).add(.25);
    const bend = freq => gust.mul(float(.55).add(sin(time.mul(freq).add(phase)).mul(.45))).mul(windOn);   // 0..1, downwind
    const cross = freq => sin(time.mul(freq * 1.43).add(phase.mul(2.1))).mul(gust).mul(.22).mul(windOn);
    const push = (amount, freq) => vec3(windDir.x.mul(bend(freq)).sub(windDir.y.mul(cross(freq))), 0, windDir.y.mul(bend(freq)).add(windDir.x.mul(cross(freq)))).mul(amount);
    const height = positionLocal.y.sub(ay);
    // The trunk bends as y^2 up to the crown; `tip` metres of travel at the crown.
    const trunkBend = (tip, freq) => push(tip, freq).mul(clamp(height.div(crownH.max(.5)), 0, 1.4).pow(2));
    const flutter = amount => {
      const h = fract(sin(dot(positionLocal.xz.add(positionLocal.y), vec2(17.13, 91.7))).mul(24634.6)).mul(6.283);
      return vec3(sin(time.mul(7.3).add(h)), sin(time.mul(9.1).add(h.mul(1.3))).mul(.6), cos(time.mul(8.2).add(h.mul(.7)))).mul(amount).mul(gust.add(.15)).mul(windOn);
    };
    // Palm heads: fronds flap up and down about the crown, more toward the tips,
    // and the downwind ones are pressed flatter.
    const palmCrown = (tipK, freq) => {
      const rel = positionLocal.sub(vec3(ax, ay.add(crownH), az)), r = length(rel.xz);
      const flap = sin(time.mul(2.4).add(phase).add(rel.x.mul(.9)).add(rel.z.mul(.7))).mul(r.mul(r).mul(.022)).mul(gust.add(.2));
      const pressed = dot(rel.xz, windDir).max(0).mul(r).mul(.02).mul(gust);
      return push(tipK, freq).add(vec3(0, flap.sub(pressed), 0)).add(push(r.mul(.05), freq * 1.6));
    };
    const palmTip = crownH.mul(.012);                      // a 20 m palm sways ~0.25 m at the head
    // Chaparral: dark chamise and toyon greens with grey-green sage lights.
    const SHRUB_HUES = ['#3d4b29', '#4c5c31', '#5b6b3b', '#6b7a4b', '#34421f', '#7e8a62'];
    const BROAD_HUES = ['#2f4a24', '#3c5a2c', '#4d6b35', '#5d7a3e', '#26401f'];
    const OAK_HUES = ['#2b3d22', '#364a29', '#43552f', '#56633a'];
    const solid = (hues, seed, ru, rv, blossom = null) => { const t = leafTexture(hues, seed, blossom, true); t.repeat.set(ru, rv); return t; };
    const leafMat = (map, color) => {
      const m = new T.MeshStandardNodeMaterial({map, alphaTest: .45, side: T.DoubleSide, roughness: .8, metalness: 0, color});
      // Broadleaf crown: rides the trunk bend, sways as a mass, leaves flutter.
      m.positionNode = positionLocal.add(push(float(.09), .55).mul(clamp(height.div(crownH.max(.5)), 0, 2.2))).add(flutter(.035));
      return m;
    };
    const palmMat = (map) => { const m = leafMat(map, '#ffffff'); m.positionNode = positionLocal.add(palmCrown(palmTip, .32)).add(flutter(.02)); return m; };
    const mats = {
      fanFrond: palmMat(fanTexture()),
      dateFrond: palmMat(frondTexture()),
      broadLeaf: leafMat(leafTexture(BROAD_HUES, 31), '#ffffff'),
      jacaranda: leafMat(leafTexture(['#324e28', '#44613a'], 37, ['#8d74c9', '#a28ada', '#7b63b8', '#b4a0e4']), '#ffffff'),
      oakLeaf: leafMat(leafTexture(OAK_HUES, 41), '#ffffff'),
      bark: new T.MeshStandardNodeMaterial({map: bark, roughness: .95}),
      palmBark: new T.MeshStandardNodeMaterial({map: palmBark, roughness: .95}),
      skirt: new T.MeshStandardNodeMaterial({color: '#8a7552', roughness: 1, side: T.DoubleSide}),
      cypress: new T.MeshStandardNodeMaterial({map: solid(['#26391f', '#2f4526', '#3a5230', '#1f2f19'], 47, 3, 6), roughness: .9}),
      shrub: leafMat(leafTexture(SHRUB_HUES, 43), '#ffffff'),
      shrubCore: new T.MeshStandardNodeMaterial({map: solid(SHRUB_HUES, 44, 1, 1), roughness: 1}),
      broadCore: new T.MeshStandardNodeMaterial({map: solid(BROAD_HUES, 32, 2, 2), roughness: 1}),
      jacCore: new T.MeshStandardNodeMaterial({map: solid(['#324e28', '#44613a'], 38, 2, 2, ['#8d74c9', '#a28ada', '#7b63b8', '#b4a0e4']), roughness: 1}),
      oakCore: new T.MeshStandardNodeMaterial({map: solid(OAK_HUES, 42, 2, 2), roughness: 1}),
    };
    const EUC_HUES = ['#46553c', '#52614a', '#3d4c35', '#5d6b50', '#36442f'], PINE_HUES = ['#2f4424', '#3a5230', '#465e36', '#2a3b20'];
    const eucLeaf = clusterTexture('euc', EUC_HUES, 54), pineLeaf = clusterTexture('needle', PINE_HUES, 55);
    Object.assign(mats, {
      eucFar: leafMat(eucLeaf, '#9a9a9a'), pineFar: leafMat(pineLeaf, '#ffffff'),
      eucCore: new T.MeshStandardNodeMaterial({map: solid(EUC_HUES, 56, 2, 2), roughness: 1}),
      pineCore: new T.MeshStandardNodeMaterial({map: solid(PINE_HUES, 57, 2, 2), roughness: 1}),
      eucBark: new T.MeshStandardNodeMaterial({map: treeBark('eucalyptus'), roughness: .7}),
      pineBark: new T.MeshStandardNodeMaterial({map: treeBark('pine'), roughness: .95}),
      rock: new T.MeshStandardNodeMaterial({map: rockTexture(), roughness: .92}),
    });
    for (const k of ['eucCore', 'pineCore']) mats[k].positionNode = positionLocal.add(push(float(.12), .45).mul(clamp(height.div(crownH.max(.5)), 0, 2.2)));
    for (const k of ['eucBark', 'pineBark']) mats[k].positionNode = positionLocal.add(trunkBend(float(.18), .4));
    for (const k of ['broadCore', 'jacCore', 'oakCore']) mats[k].positionNode = positionLocal.add(push(float(.09), .55).mul(clamp(height.div(crownH.max(.5)), 0, 2.2)));
    mats.palmBark.positionNode = positionLocal.add(trunkBend(palmTip, .32));
    mats.skirt.positionNode = positionLocal.add(trunkBend(palmTip, .32));
    mats.bark.positionNode = positionLocal.add(trunkBend(float(.09), .55));
    mats.cypress.positionNode = positionLocal.add(trunkBend(float(.22), .45)).add(flutter(.012));
    mats.shrub.positionNode = positionLocal.add(push(float(.06), .9).mul(clamp(height, 0, 1.5))).add(flutter(.018));
    mats.shrubCore.positionNode = positionLocal.add(push(float(.06), .9).mul(clamp(height, 0, 1.5)));
    // Near field: the far forms of the branching species fold away to their
    // foot within NEAR_R of the camera, where the real trees take over.
    const nearCam = this.nearCam = uniform(new T.Vector3(1e9, 0, 1e9));
    const keepFar = step(float(NEAR_R), length(wp.sub(nearCam.xz)));
    for (const k of ['broadLeaf', 'jacaranda', 'oakLeaf', 'broadCore', 'jacCore', 'oakCore', 'bark', 'eucFar', 'pineFar', 'eucCore', 'pineCore', 'eucBark', 'pineBark', 'shrub', 'shrubCore']) {
      const foot = vec3(ax, ay, az);
      mats[k].positionNode = foot.add(mats[k].positionNode.sub(foot).mul(keepFar));
    }
    // Shrubs take their whole colour from the instance: chaparral olive, sage,
    // grey-green, and the odd dry tan.
    // Per-plant tints over the leaf textures: green, sage-grey, olive, and the
    // odd dry, rust-brown buckwheat.
    const SHRUB = [[1, 1, 1], [1.12, 1.1, 1.05], [.85, .95, .8], [1.05, 1, .82], [1.25, 1.08, .8], [.9, 1.05, .95], [1.35, 1.1, .78]].map(c => new T.Color(...c));
    // Parts per species: [geometry, material, how the instance scales it].
    const PARTS = {
      fanPalm: [[S.fanPalm.trunk, 'palmBark', 'trunk'], [S.fanPalm.skirt, 'skirt', 'crown'], [S.fanPalm.crown, 'fanFrond', 'crown']],
      datePalm: [[S.datePalm.trunk, 'palmBark', 'trunk'], [S.datePalm.crown, 'dateFrond', 'crown']],
      broad: [[S.broad.trunk, 'bark', 'tree'], [S.broad.core, 'broadCore', 'crownTop'], [S.broad.crown, 'broadLeaf', 'crownTop']],
      jacaranda: [[S.broad.trunk, 'bark', 'tree'], [S.broad.core, 'jacCore', 'crownTop'], [S.broad.crown, 'jacaranda', 'crownTop']],
      oak: [[S.oak.trunk, 'bark', 'tree'], [S.oak.core, 'oakCore', 'crownOak'], [S.oak.crown, 'oakLeaf', 'crownOak']],
      cypress: [[S.cypress.crown, 'cypress', 'tree']],
      shrub: [[S.shrub.core, 'shrubCore', 'tree'], [S.shrub.crown, 'shrub', 'tree']],
      eucalyptus: [[S.tallTrunk, 'eucBark', 'trunk'], [S.broad.core, 'eucCore', 'crownHigh'], [S.broad.crown, 'eucFar', 'crownHigh']],
      rock: [[S.rock, 'rock', 'rock']],
      pine: [[S.tallTrunk, 'pineBark', 'trunk'], [S.oak.core, 'pineCore', 'crownHigh'], [S.oak.crown, 'pineFar', 'crownHigh']],
    };
    const chunks = new Map();
    this.chunks = [];
    for (const p of this.list) {
      const key = `${Math.floor(p.x / CHUNK)},${Math.floor(p.z / CHUNK)}`;
      if (!chunks.has(key)) chunks.set(key, []);
      chunks.get(key).push(p);
    }
    const mtx = new T.Matrix4(), q = new T.Quaternion(), v = new T.Vector3(), sc = new T.Vector3(), color = new T.Color();
    let meshes = 0, instances = 0;
    for (const [ckey, list] of chunks) {
      const [cx, cz] = ckey.split(',').map(Number), group = {x: (cx + .5) * CHUNK, z: (cz + .5) * CHUNK, meshes: [], shrubs: [], cards: [], items: list.filter(p => NEAR.includes(p.sp))};
      this.chunks.push(group);
      const bySp = new Map();
      for (const p of list) { if (!bySp.has(p.sp)) bySp.set(p.sp, []); bySp.get(p.sp).push(p); }
      for (const [sp, items] of bySp) for (const [geo, matName, mode] of PARTS[sp]) {
        // Share the species geometry's buffers; add this chunk's wind anchors.
        const g = new T.BufferGeometry();
        for (const k in geo.attributes) g.setAttribute(k, geo.attributes[k]);
        g.setIndex(geo.index);
        const anchors = new Float32Array(items.length * 4);
        items.forEach((p, i) => anchors.set([p.x, p.y, p.z, CROWN[sp](p)], i * 4));
        g.setAttribute('wind', new T.InstancedBufferAttribute(anchors, 4));
        const mesh = new T.InstancedMesh(g, mats[matName], items.length);
        items.forEach((p, i) => {
          q.setFromAxisAngle(up, p.yaw);
          if (mode === 'trunk') { v.set(p.x, p.y, p.z); sc.set(p.s, p.h, p.s); }
          else if (mode === 'crown') { v.set(p.x, p.y + p.h, p.z); sc.set(p.s, p.s, p.s); }
          else if (mode === 'crownTop') { v.set(p.x, p.y + 3.2 * p.s, p.z); sc.set(p.s, p.s, p.s); }
          else if (mode === 'crownOak') { v.set(p.x, p.y + 2.4 * p.s, p.z); sc.set(p.s, p.s, p.s); }
          else if (mode === 'rock') { v.set(p.x, p.y - p.s * p.h * .3, p.z); sc.set(p.s, p.s * p.h, p.s * (.7 + p.tint * .6)); }
          else if (mode === 'crownHigh') { v.set(p.x, p.y + CROWN[sp](p), p.z); sc.set(p.s, p.s * .8, p.s); }
          else { v.set(p.x, p.y, p.z); sc.set(p.s, p.s, p.s); }
          mtx.compose(v, q, sc); mesh.setMatrixAt(i, mtx);
          // Shrubs: the core carries the palette (olive, sage, dry tan); the leaf
          // cards only vary in brightness, their texture has the colour.
          if (sp === 'shrub' && matName === 'shrubCore') mesh.setColorAt(i, SHRUB[Math.floor(p.tint * SHRUB.length) % SHRUB.length]);
          else if (sp === 'shrub') mesh.setColorAt(i, color.copy(SHRUB[Math.floor(p.tint * SHRUB.length) % SHRUB.length]).multiplyScalar(1.05));
          else if (sp === 'rock') mesh.setColorAt(i, color.setRGB(.8 + p.tint * .3, .78 + p.tint * .3, .74 + p.tint * .28));
          else mesh.setColorAt(i, color.setRGB(p.tint, p.tint, p.tint));
        });
        mesh.castShadow = sp !== 'shrub'; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
        mesh.computeBoundingSphere();
        scene.add(mesh); meshes++; instances += items.length;
        // Broadleaf canopies are a solid core under leaf cards; far off the core alone reads the same.
        (sp === 'shrub' || sp === 'rock' ? group.shrubs : ['broadLeaf', 'jacaranda', 'oakLeaf', 'eucFar', 'pineFar'].includes(matName) ? group.cards : group.meshes).push(mesh);
      }
    }
    // The near trees: VARIANTS grown templates per species, one wood and one
    // leaf InstancedMesh each, refilled from the chunks as the camera moves.
    const nearLeaf = {
      broad: clusterTexture('broad', BROAD_HUES, 51), oak: clusterTexture('broad', OAK_HUES, 53),
      jacaranda: clusterTexture('broad', ['#324e28', '#44613a', '#3a5530'], 52, ['#8d74c9', '#a28ada', '#7b63b8', '#b4a0e4']),
      eucalyptus: eucLeaf, pine: pineLeaf, shrub: clusterTexture('broad', SHRUB_HUES, 58),
    };
    const nearBark = {broad: treeBark('broad'), jacaranda: treeBark('broad'), oak: treeBark('oak'), eucalyptus: mats.eucBark.map, pine: mats.pineBark.map, shrub: treeBark('oak')};
    const FIT = {broad: p => p.s * .85, jacaranda: p => p.s * .85, oak: p => p.s, eucalyptus: p => p.h / 21, pine: p => p.h / 12, shrub: p => p.s * .8};
    this.near = {};
    for (const sp of NEAR) {
      const wood = new T.MeshStandardNodeMaterial({map: nearBark[sp], roughness: sp === 'eucalyptus' ? .7 : .95});
      wood.positionNode = positionLocal.add(trunkBend(float(sp === 'eucalyptus' || sp === 'pine' ? .18 : .09), .5));
      // Eucalyptus leaves hang edge-on and glare in the sun; dull them to its dusty blue-green.
      const leaf = leafMat(nearLeaf[sp], sp === 'eucalyptus' ? '#9a9a9a' : '#ffffff');
      if (sp === 'eucalyptus') leaf.roughness = 1;
      const list = [];
      for (let k = 0; k < VARIANTS; k++) {
        const t = growTree(sp, k + 1), pair = [];
        for (const [geo, mat] of [[t.wood, wood], [t.leaves, leaf]]) {
          const wind = new T.InstancedBufferAttribute(new Float32Array(NEAR_CAP * 4), 4);
          wind.setUsage(T.DynamicDrawUsage);
          geo.setAttribute('wind', wind);
          const mesh = new T.InstancedMesh(geo, mat, NEAR_CAP);
          mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = sp !== 'shrub'; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
          mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
          mesh.setColorAt(0, color.setRGB(1, 1, 1));
          scene.add(mesh); pair.push(mesh);
        }
        list.push(pair);
      }
      this.near[sp] = {list, fit: FIT[sp]};
    }
    this.nearAt = null; this.shrubTint = SHRUB;
    this.stats = {plants: this.list.length, meshes, instances};
    return this.stats;
  }
  /** Draw distance (from the chunk's nearest edge, roughly): trees within
   *  1.3 km, broadleaf leaf cards within 800 m (the core carries the crown
   *  beyond), scrub within 520 m. With the whole basin built there are 1.5M
   *  plants; the old 1.6 km all-detail radius drew ~10M triangles of them. */
  update(x, z) {
    if (this.near && (!this.nearAt || Math.hypot(x - this.nearAt[0], z - this.nearAt[1]) > 10)) this.refillNear(x, z);
    for (const c of this.chunks) {
      const d = Math.hypot(c.x - x, c.z - z) - CHUNK * .7;
      for (const m of c.meshes) m.visible = d < 1300;
      for (const m of c.cards) m.visible = d < 800;
      for (const m of c.shrubs) m.visible = d < 520;
    }
  }

  /** Hand every branching-species plant within NEAR_R to the near meshes. */
  refillNear(x, z) {
    this.nearAt = [x, z];
    const buckets = new Map();
    for (const c of this.chunks) {
      if (Math.abs(c.x - x) > NEAR_R + CHUNK * .75 || Math.abs(c.z - z) > NEAR_R + CHUNK * .75) continue;
      for (const p of c.items) {
        if (Math.hypot(p.x - x, p.z - z) >= NEAR_R) continue;
        const v = Math.floor(fract1(p.x * .137 + p.z * .291) * VARIANTS), key = p.sp + v;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(p);
      }
    }
    const m = new T.Matrix4(), q = new T.Quaternion(), v = new T.Vector3(), sc = new T.Vector3(), col = new T.Color();
    for (const sp of NEAR) {
      const {list, fit} = this.near[sp];
      list.forEach((pair, k) => {
        const items = (buckets.get(sp + k) || []).slice(0, NEAR_CAP);
        for (const mesh of pair) {
          const wind = mesh.geometry.attributes.wind;
          items.forEach((p, i) => {
            const f = fit(p);
            q.setFromAxisAngle(up, p.yaw); v.set(p.x, p.y, p.z); sc.set(f, f, f);
            m.compose(v, q, sc); mesh.setMatrixAt(i, m);
            mesh.setColorAt(i, mesh !== pair[1] ? col.setRGB(1, 1, 1) : sp === 'shrub' ? col.copy(this.shrubTint[Math.floor(p.tint * this.shrubTint.length) % this.shrubTint.length]) : col.setRGB(p.tint, p.tint, p.tint));
            wind.array.set([p.x, p.y, p.z, CROWN[sp](p)], i * 4);
          });
          mesh.count = items.length;
          mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; wind.needsUpdate = true;
        }
      });
    }
    this.nearCam.value.set(x, 0, z);
  }
}
const fract1 = v => v - Math.floor(v);
