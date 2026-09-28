/* Beverly Hills and Downtown Los Santerra (2026-09-26).
 *
 * Zoning and building types for the two districts built after West
 * Hollywood. buildings.js owns lot planning and the Builder; this file adds
 * zones, lot sizes and builders, all merged into buildings.js's tables.
 *
 * Beverly Hills: flagship boutiques in stone and glass on Rodeo Drive and the
 * streets round it; limestone offices and a grand hotel on Wilshire; palm-
 * lined residential drives of hedged estates (Mediterranean, Georgian,
 * Tudor, modern); two-storey houses in the flats; the Spanish-baroque city
 * hall with its tiled dome.
 *
 * Downtown: a SMALL skyline, placed by hand (SKYLINE below), as the real one
 * is: one dark-glass bank tower with a slanted crown, red logo and helipad
 * (the tallest), a sail-crowned blue tower, a stone cylinder with a lit
 * crown, dark twin slabs, a pale stone tower, a white setback tower, a hotel
 * of mirrored cylinders, City Hall's stepped pyramid, and a few plainer glass
 * towers. Around them: mid-rise offices and 1920s beaux-arts blocks, a
 * theatre row on Broadway, parking structures, brick lofts in the Arts
 * District, and podium apartments at the edges.
 */
import {rng, pick, W, lotFrame, baseOf, roofClutter, foundation, shopSign, bladeSign, rect, circle,
  STUCCO, PASTEL, BRICK, DECO, SLATE, TILE_RED, WOOD} from './buildings.js';
import {SIGN} from './signs.js';

export const BEVERLY = {name: 'beverly', x0: -6300, x1: -3400, z0: -100, z1: 1300};
export const DOWNTOWN = {name: 'downtown', x0: -300, x1: 2950, z0: 450, z1: 2950};
/* Between them: Koreatown, Hancock Park and Mid-City; the Hollywood flats to
 * the north; Mid-City south of Beverly Hills. One zoning, 'midcity'. */
export const MIDCITY = [
  {name: 'midcity', x0: -3400, x1: -300, z0: -100, z1: 2950},
  {name: 'midcity', x0: -1900, x1: -300, z0: -1800, z1: -100},
  {name: 'midcity', x0: -6300, x1: -3400, z0: 1300, z1: 2950},
];

/* ----------------------------------------------------------------- zoning */
// Where the towers cluster on the reference map: the financial core and a
// second, smaller cluster to the south-west.
const CORES = [{x: 1250, z: 1050, r: 520}, {x: 450, z: 1950, r: 380}];
export const coreOf = (x, z) => Math.max(0, ...CORES.map(c => 1 - Math.hypot(x - c.x, z - c.z) / c.r));
const RODEO = {x: -4810, z: 380};

export function cityZone(area, seg, r, x, z) {
  const name = seg.name || '', kind = seg.kind;
  if (kind === 'scenic') return 'hill';
  if (area === 'beverly') {
    const shops = Math.hypot(x - RODEO.x, z - RODEO.z);
    if (/Wilshire/.test(name)) return r() < .7 ? 'wilshire' : 'luxury';
    if ((/Rodeo|Beverly Drive|Canon|Camden|Dayton|Brighton/.test(name) && shops < 520) || shops < 200) return r() < .88 ? 'luxury' : 'wilshire';
    if (/Santa Monica/.test(name)) return r() < .75 ? 'shop' : 'apartment';
    if (/Westwood|Westside|Selby|Midvale|Malcolm|Ashton/.test(name)) return r() < .55 ? 'bungalow' : 'apartment';
    if (kind === 'boulevard' || /La Cienega|Melrose|Beverly Boulevard|Doheny/.test(name)) return r() < .6 ? 'shop' : 'apartment';
    // The palm-lined drives: estates north of the business triangle, houses in the flats.
    if (kind === 'residential' || /Maple|Crescent|Sunset Way/.test(name)) return z > 420 ? (r() < .78 ? 'estate' : 'bhHouse') : (r() < .7 ? 'bhHouse' : 'apartment');
    return r() < .5 ? 'bhHouse' : r() < .75 ? 'apartment' : 'shop';
  }
  if (area === 'midcity') {
    const ktown = x > -1500 && z > 150 && z < 2150, hancock = x > -2450 && x < -1480 && z > 60 && z < 1420, flats = z < -100;
    if (/Wilshire/.test(name)) return ktown ? (r() < .45 ? 'midrise' : 'dtLiving') : (r() < .45 ? 'historic' : r() < .75 ? 'wilshire' : 'shop');   // Miracle Mile deco
    if (ktown) {
      if (kind === 'avenue' || kind === 'boulevard') return r() < .45 ? 'shop' : r() < .8 ? 'dtLiving' : 'midrise';
      return r() < .55 ? 'apartment' : r() < .8 ? 'dtLiving' : 'shop';
    }
    if (hancock && (kind === 'residential' || kind === 'street')) return r() < .75 ? 'bhHouse' : 'estate';
    if (flats) {
      if (kind === 'avenue' || kind === 'boulevard' || /Vine|Highland|Cahuenga|La Brea/.test(name)) return r() < .6 ? 'shop' : r() < .8 ? 'historic' : 'apartment';
      return r() < .6 ? 'apartment' : 'bungalow';
    }
    if (kind === 'avenue' || kind === 'boulevard') return r() < .7 ? 'shop' : 'apartment';
    if (kind === 'residential') return r() < .75 ? 'bungalow' : 'apartment';
    return r() < .5 ? 'bungalow' : r() < .85 ? 'apartment' : 'shop';
  }
  // Downtown.
  const core = coreOf(x, z);
  if (/Broadway|Spring Street|Main Street|Hill Street/.test(name) && x < 2700) return r() < .62 ? 'historic' : r() < .8 ? 'shop' : 'garage';
  if (x > 2350 || /Alameda|Boyle|East Los Santerra/.test(name)) return r() < .6 ? 'loft' : r() < .8 ? 'shop' : 'garage';
  if (core > .5) return r() < .4 ? 'midrise' : r() < .72 ? 'historic' : r() < .88 ? 'garage' : 'dtLiving';
  if (core > .15) return r() < .18 ? 'midrise' : r() < .5 ? 'historic' : r() < .66 ? 'garage' : 'dtLiving';
  if (kind === 'avenue' || kind === 'boulevard') return r() < .45 ? 'shop' : r() < .8 ? 'dtLiving' : 'garage';
  return r() < .4 ? 'dtLiving' : r() < .65 ? 'shop' : r() < .85 ? 'loft' : 'apartment';
}
/** What goes behind a front lot: a backhouse in the suburbs, a service block in town. */
export const rearFor = zone => ['midrise', 'historic', 'garage', 'dtLiving', 'loft'].includes(zone) ? 'rearCity' : 'rear';
export const NO_REAR = new Set(['estate', 'luxury', 'wilshire']);

/* -------------------------------------------------------------- lot sizes */
export const CITY_SIZE = {
  officeMid: r => ({width: 30 + r() * 16, depth: 28 + r() * 12, setback: 2, gap: 3 + r() * 4}),
  beauxArts: r => ({width: 22 + r() * 16, depth: 24 + r() * 10, setback: .8, gap: .4}),
  theatre: r => ({width: 20 + r() * 8, depth: 30 + r() * 8, setback: .8, gap: .4}),
  garage: r => ({width: 34 + r() * 16, depth: 30 + r() * 10, setback: 1.5, gap: 2}),
  loft: r => ({width: 24 + r() * 18, depth: 24 + r() * 12, setback: .8, gap: r() < .4 ? 3 : .4}),
  podiumApt: r => ({width: 34 + r() * 22, depth: 26 + r() * 10, setback: 2, gap: 3}),
  flagship: r => ({width: 14 + r() * 12, depth: 20 + r() * 8, setback: 1.2, gap: r() < .3 ? 2.5 : .4}),
  bhOffice: r => ({width: 30 + r() * 14, depth: 26 + r() * 8, setback: 3, gap: 4}),
  mansionMed: r => ({width: 36 + r() * 14, depth: 32 + r() * 10, setback: 12 + r() * 6, gap: 6 + r() * 8}),
  mansionColonial: r => ({width: 36 + r() * 12, depth: 30 + r() * 10, setback: 13 + r() * 6, gap: 6 + r() * 8}),
  mansionTudor: r => ({width: 32 + r() * 12, depth: 30 + r() * 8, setback: 11 + r() * 5, gap: 6 + r() * 8}),
  mansionModern: r => ({width: 36 + r() * 14, depth: 30 + r() * 10, setback: 12 + r() * 6, gap: 6 + r() * 8}),
  tudor: r => ({width: 14 + r() * 5, depth: 13 + r() * 5, setback: 6 + r() * 3, gap: 4 + r() * 3}),
  colonial: r => ({width: 15 + r() * 5, depth: 13 + r() * 4, setback: 6 + r() * 3, gap: 4 + r() * 3}),
};
export const CITY_VARIANTS = {
  midrise: [['officeMid', 4], ['office60s', 1.5], ['glassTower', 1], ['hotelModern', .4]],
  historic: [['beauxArts', 5], ['theatre', 1], ['brick', 1.5], ['decoTower', .5]],
  garage: [['garage', 1]],
  loft: [['loft', 4], ['brick', 1.5], ['minimall', .4]],
  dtLiving: [['podiumApt', 3], ['mixedUse', 2], ['loft', .6]],
  luxury: [['flagship', 5], ['boutique', 1.2], ['restaurant', .5]],
  wilshire: [['bhOffice', 4], ['hotelModern', .4], ['flagship', .8]],     // Beverly Hills keeps its height limit
  estate: [['mansionMed', 3], ['mansionColonial', 2], ['mansionTudor', 1.4], ['mansionModern', 1.6]],
  bhHouse: [['spanish', 2.5], ['tudor', 1.6], ['colonial', 1.6], ['craftsman', 1], ['modernBox', 1.2]],
};

/* --------------------------------------------------------- the landmarks
 * Placed before any ordinary lot, nearest fitting spot to `near` first. Only
 * ~13 tall buildings: downtown LA is a small, tight skyline, not a forest. */
const ANY = /./;
export const CITY_LANDMARKS = [
  {variant: 'bankTower', zone: 'tower', road: ANY, near: [1250, 1060], width: 64, depth: 52, setback: 6, relief: 6},
  {variant: 'sailTower', zone: 'tower', road: ANY, near: [1040, 1250], width: 58, depth: 46, setback: 5, relief: 6},
  {variant: 'crownCylinder', zone: 'tower', road: ANY, near: [1450, 1000], width: 52, depth: 50, setback: 6, relief: 6},
  {variant: 'twinTowers', zone: 'tower', road: ANY, near: [1230, 830], width: 92, depth: 44, setback: 6, relief: 6},
  {variant: 'stoneTower', zone: 'tower', road: ANY, near: [2170, 1300], width: 50, depth: 46, setback: 6, relief: 6},
  {variant: 'setbackTower', zone: 'tower', road: ANY, near: [-30, 1600], width: 46, depth: 42, setback: 5, relief: 6},
  {variant: 'bonaventure', zone: 'tower', road: ANY, near: [880, 1480], width: 62, depth: 58, setback: 4, relief: 6},
  {variant: 'dtTower', zone: 'tower', road: ANY, near: [470, 2100], width: 44, depth: 40, setback: 4, relief: 6},
  {variant: 'dtTower', zone: 'tower', road: ANY, near: [720, 2060], width: 42, depth: 40, setback: 4, relief: 6},
  {variant: 'dtTower', zone: 'tower', road: ANY, near: [910, 2250], width: 40, depth: 36, setback: 4, relief: 6},
  {variant: 'dtTower', zone: 'tower', road: ANY, near: [1500, 1300], width: 40, depth: 38, setback: 4, relief: 6},
  {variant: 'dtTower', zone: 'tower', road: ANY, near: [1710, 2450], width: 38, depth: 34, setback: 4, relief: 6},
  {variant: 'cityHall', zone: 'tower', road: /Temple|First Street|Spring/, near: [1250, 990], width: 72, depth: 52, setback: 8, relief: 6},
  // Hollywood: the round record-stack tower off Vine, a movie palace near Highland.
  {variant: 'recordTower', zone: 'tower', road: /Vine|Argyle|Yucca|Cahuenga/, near: [-1230, -760], width: 40, depth: 40, setback: 6, relief: 6},
  {variant: 'theatre', zone: 'tower', road: /Highland|Orange|Santa Monica/, near: [-1860, -330], width: 30, depth: 36, setback: 1, relief: 5},
  // Beverly Hills.
  {variant: 'grandHotel', zone: 'tower', road: /Wilshire/, near: [-4810, 1140], width: 70, depth: 38, setback: 5, relief: 6},
  {variant: 'bhCityHall', zone: 'tower', road: /Santa Monica|Crescent|Rexford/, near: [-5000, 40], width: 60, depth: 44, setback: 8, relief: 6},
];

/* --------------------------------------------------------------- palettes */
const GLASS = ['#2f4d66', '#3e6a86', '#2b3f4f', '#4b6f7c', '#5b7486', '#3a4a5c', '#2e5a5a'];
const STONE = ['#e2dccf', '#d7cfbf', '#cbc2b1', '#e9e4da', '#bfb6a6', '#d9d2c4'];
const TERRA = ['#e6d6bd', '#d8c3a0', '#c9b28f', '#e9e1d1', '#b88b6a', '#d4bfa3', '#c7a27e'];
const LUX = ['#f3efe6', '#ebe4d6', '#e1d6c2', '#faf8f3', '#1b1b1b', '#d6cbb8'];
const LUX_SIGNS = [49, 50, 51, 52, 20, 24];
const HEDGE = ['#3a5a31', '#35532e', '#40633a', '#2f4c2a'];

/* ---------------------------------------------------------------- helpers */
/** Vertical walls from y0 to per-vertex tops (a slanted or stepped crown). */
function walls(b, mat, f, pts, y0, topOf, color, info) {
  let cx = 0, cz = 0; pts.forEach(q => { cx += q[0] / pts.length; cz += q[1] / pts.length; });
  let run = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (len < 1e-3) continue;
    let n = [c[1] - a[1], 0, -(c[0] - a[0])]; const l = Math.hypot(n[0], n[2]); n = [n[0] / l, 0, n[2] / l];
    if (((a[0] + c[0]) / 2 - cx) * n[0] + ((a[1] + c[1]) / 2 - cz) * n[2] < 0) n = [-n[0], 0, -n[2]];
    const ta = topOf(a), tc = topOf(c);
    b.poly(mat, f, [[a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], tc, c[1]], [a[0], ta, a[1]]],
      [[run, y0], [run + len, y0], [run + len, tc], [run, ta]], n, color, info);
    run += len;
  }
}
/** Split a convex outline where it crosses z = zm (so a crown can break there). */
function splitAt(pts, zm) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length];
    out.push(a);
    if ((a[1] - zm) * (c[1] - zm) < 0) { const t = (zm - a[1]) / (c[1] - a[1]); out.push([a[0] + (c[0] - a[0]) * t, zm]); }
  }
  return out;
}
/** Elongated octagon: long along z, chamfered corners. */
function octagon(x0, x1, z0, z1, c) {
  return [[x0, z0 + c], [x0 + c, z0], [x1 - c, z0], [x1, z0 + c], [x1, z1 - c], [x1 - c, z1], [x0 + c, z1], [x0, z1 - c]];
}
/** Rounded square (superellipse-ish), centred at (cx, cz). */
function rounded(cx, cz, hx, hz, rad, n = 5) {
  const pts = [];
  for (const [sx, sz, a0] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]])
    for (let k = 0; k <= n; k++) { const a = a0 + k / n * Math.PI / 2; pts.push([cx + sx * (hx - rad) + Math.cos(a) * rad, cz + sz * (hz - rad) + Math.sin(a) * rad]); }
  return pts;
}
/** Stadium: a rectangle with round ends, long along z. */
function stadium(cx, cz, hx, hz, n = 8) {
  const pts = [], rr = hx;
  for (let k = 0; k <= n; k++) { const a = -Math.PI / 2 + k / n * Math.PI; pts.push([cx + Math.sin(a) * rr, cz + hz - rr + Math.cos(a) * rr]); }
  for (let k = 0; k <= n; k++) { const a = Math.PI / 2 + k / n * Math.PI; pts.push([cx + Math.sin(a) * rr, cz - hz + rr + Math.cos(a) * rr]); }
  return pts;
}
const scalePts = (pts, cx, cz, k) => pts.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k]);
/** Red aviation light (and a white strobe on the tallest). */
function beacon(b, f, x, y, z, color = '#ff2a1a') { b.box('glow', f, x, y + .5, z, 1, 1, 1, color); }
/** A plaza in front of a tower: pale paving, planters, a couple of trees' worth of boxes. */
function plaza(b, f, lot, x0, x1, color = '#cfc8ba') {
  b.slab('trim', f, x0, x1, -lot.width / 2 + 1, lot.width / 2 - 1, .1, color);
  for (const s of [-1, 1]) b.box('trim', f, (x0 + x1) / 2, .45, s * lot.width * .3, 3, .9, 6, '#7c776d');
}
/** Hedge along the front of an estate with a gap for the drive; returns the drive's z.
 *  It stands on the ground at the street edge (the road's height plus the
 *  kerb), not on the house's frame: the frame sits at the lot's HIGHEST
 *  ground, and a hedge lifted to it either floated over a falling lot or
 *  needed a fortress wall under it on a rising one. The drive ramps from the
 *  street up (or down) to the frame. */
function hedge(b, f, lot, r, color) {
  const Wd = lot.width, x = -lot.spec.setback + 1.2, gz = (r() - .5) * Wd * .5, gap = 5;
  const h = 2.2 + r() * 1.2, yb = Math.min(0, lot.frontY + .12 - f.y), curb = .35, stone = '#d9d1c1';
  const run = (z0, z1) => {
    if (z1 - z0 < 1) return;
    b.box('trim', f, x, yb - .3 + (curb + .3) / 2, (z0 + z1) / 2, 1.5, curb + .3, z1 - z0, stone);
    b.box('trim', f, x, yb + curb + (h - curb) / 2, (z0 + z1) / 2, 1.2, h - curb, z1 - z0, color);
  };
  run(-Wd / 2, gz - gap / 2);
  run(gz + gap / 2, Wd / 2);
  // Gate piers, then the drive: a ramp from the street to the house's level.
  for (const s of [-1, 1]) b.box('trim', f, x, yb - .3 + 1.55, gz + s * (gap / 2 + .3), .8, 3.1, .8, '#e3dccd');
  const x0 = x - .6, x1 = Math.max(x + 6, 0);
  b.poly('trim', f, [[x0, yb + .06, gz - 2.2], [x1, .06, gz - 2.2], [x1, .06, gz + 2.2], [x0, yb + .06, gz + 2.2]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0], '#d6cdbb', [0, 0, 0, 0]);
  if (yb < -.3) for (const s of [-1, 1]) b.poly('trim', f, [[x0, yb + .06, gz + s * 2.2], [x1, .06, gz + s * 2.2], [x1, yb - .3, gz + s * 2.2], [x0, yb - .3, gz + s * 2.2]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, s], '#c9c0ae', [0, 0, 0, 0]);
  return gz;
}

/* --------------------------------------------------------------- builders */
export const CITY_BUILD = {
  /* ---- Downtown: the skyline */
  bankTower(b, lot, boxes) {
    // Dark reflective glass on an elongated octagon, white ribs up the broad
    // faces, a crown that slants up along its length, a red logo high on both
    // broad faces, a helipad on the low end of the roof.
    const base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const Tx = D * .52, Lz = Wd * .78, x0 = D / 2 - Tx / 2, x1 = D / 2 + Tx / 2, z0 = -Lz / 2, z1 = Lz / 2, c = Tx * .3;
    const P = 14, H = 212, glass = '#1c2836', glassInfo = [W.tinted, 4.2, 3.2, 48];
    b.box('wall', f, D / 2, P / 2, 0, D - 4, P, Wd - 4, '#2a2d31', [W.mixed, 7, 5, 17]);            // podium: two-storey glass lobby
    b.box('trim', f, D / 2, P + .4, 0, D - 3, .8, Wd - 3, '#3a3d42');
    const pts = octagon(x0, x1, z0, z1, c);
    walls(b, 'wall', f, pts, P, () => H, glass, glassInfo);
    // Crown: flat over the helipad end, then rising 34 m along the length.
    const zm = z0 + Lz * .34, top = q => H + 4 + Math.max(0, q[1] - zm) / (z1 - zm) * 34;
    const crown = splitAt(pts, zm);
    walls(b, 'wall', f, crown, H, top, glass, glassInfo);
    const flat = crown.filter(q => q[1] <= zm + 1e-6), slope = crown.filter(q => q[1] >= zm - 1e-6);
    const k = 34 / (z1 - zm), nl = Math.hypot(1, k);
    b.poly('trim', f, flat.map(q => [q[0], H + 4, q[1]]), flat.map(q => [q[0], q[1]]), [0, 1, 0], '#2b2e33', [0, 0, 0, 0]);
    b.poly('wall', f, slope.map(q => [q[0], top(q), q[1]]), slope.map(q => [q[0], q[1]]), [0, 1 / nl, -k / nl], glass, [0, 0, 0, 0]);
    // Lit edges along the crown (the tower reads at night from the hills).
    for (let i = 0; i < crown.length; i++) {
      const a = crown[i], q = crown[(i + 1) % crown.length];
      if (a[1] < zm - 1e-6 && q[1] < zm - 1e-6) continue;
      const ta = top(a), tq = top(q);
      b.poly('glow', f, [[a[0], ta - .5, a[1]], [q[0], tq - .5, q[1]], [q[0], tq + .3, q[1]], [a[0], ta + .3, a[1]]], [[0, 0], [1, 0], [1, 1], [0, 1]], [1, 0, 0], '#f4f1ea', [0, 0, 0, 0]);
    }
    // White ribs up the broad faces.
    for (let z = z0 + c + 3; z < z1 - c - 1; z += 6.5) for (const [x, s] of [[x0, -1], [x1, 1]]) b.box('trim', f, x + s * .25, (P + H) / 2 + 2, z, .5, H - P + 4, .45, '#d8dde2');
    // The logo, high on both broad faces.
    const lw = (Lz - 2 * c) * .96, lh = lw / 4, ly = H - lh / 2 - 3;
    b.box('trim', f, x0 - .35, ly, 0, .3, lh + 1.2, lw + 1.2, '#15181c');
    b.box('trim', f, x1 + .35, ly, 0, .3, lh + 1.2, lw + 1.2, '#15181c');
    b.sign('signs', f, x0 - .55, ly, 0, lw, lh, 48, [-1, 0, 0]);
    b.sign('signs', f, x1 + .55, ly, 0, lw, lh, 48, [1, 0, 0]);
    // Helipad on the flat end: a dark deck with a pale ring and an H.
    const hz = (z0 + zm) / 2 + 2, hx = D / 2;
    b.prism('trim', f, circle(hx, hz, Math.min(Tx * .42, 10), 20), H + 4, H + 4.35, '#34373b');
    b.prism('trim', f, circle(hx, hz, Math.min(Tx * .42, 10) - .8, 20), H + 4.35, H + 4.4, '#e9e4d6');
    b.prism('trim', f, circle(hx, hz, Math.min(Tx * .42, 10) - 1.6, 20), H + 4.4, H + 4.45, '#34373b');
    for (const s of [-1, 1]) b.box('trim', f, hx + s * 2, H + 4.5, hz, .8, .1, 5, '#e9e4d6');
    b.box('trim', f, hx, H + 4.5, hz, 4, .1, .8, '#e9e4d6');
    beacon(b, f, D / 2, top([0, z1]) + .3, z1 - c * .5); beacon(b, f, x0 + 1, H + 4, z0 + 1); beacon(b, f, x1 - 1, H + 4, z0 + 1);
    plaza(b, f, lot, -lot.spec.setback + .5, 2);
    foundation(b, f, lot, '#44474c');
    boxes.push({lot, h: H + 30});
  },
  sailTower(b, lot, boxes) {
    // Pale blue glass on a stadium plan, tapering in three steps, a crown
    // that sweeps up like a sail and a thin spire.
    const base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const cx = D / 2, hx = D * .3, hz = Wd * .38, H = 196, glass = '#5f89ab', info = [W.tinted, 4.2, 3, 41];
    b.box('wall', f, cx, 6, 0, D - 3, 12, Wd - 3, '#e9e6df', [W.mixed, 6, 4.5, 13]);
    const tiers = [[12, H * .62, 1], [H * .62, H * .86, .9], [H * .86, H, .8]];
    for (const [y0, y1, k] of tiers) {
      const pts = stadium(cx, 0, hx * k, hz * k);
      walls(b, 'wall', f, pts, y0, () => y1, glass, info);
      b.poly('trim', f, pts.map(q => [q[0], y1, q[1]]), pts.map(q => [q[0], q[1]]), [0, 1, 0], '#9aa7b1', [0, 0, 0, 0]);
    }
    const top = stadium(cx, 0, hx * .8, hz * .8), zc = -hz * .8, span = hz * 1.6;
    const sail = q => H + Math.pow(Math.max(0, (q[1] - zc) / span), 1.6) * 30;
    walls(b, 'wall', f, top, H, sail, glass, info);
    b.poly('glow', f, top.map(q => [q[0], sail(q) + .05, q[1]]), top.map(q => [q[0], q[1]]), [0, 1, 0], '#b9e1ff', [0, 0, 0, 0]);
    b.cone('trim', f, cx, H + 29, hz * .8 - 3, .9, 26, '#d7dde2', 6);
    beacon(b, f, cx, H + 55, hz * .8 - 3);
    plaza(b, f, lot, -lot.spec.setback + .5, 1.5);
    foundation(b, f, lot, '#8c867c');
    boxes.push({lot, h: H + 30});
  },
  crownCylinder(b, lot, boxes) {
    // A granite cylinder stepping in twice, topped by a glass crown that
    // glows at night, and a helipad.
    const base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width, cx = D / 2;
    const R = Math.min(D, Wd) * .42, H = 188, stone = '#bdb6a9', info = [W.punched, 3.9, 1.7, 23];
    b.box('wall', f, cx, 5, 0, D - 2, 10, Wd - 2, '#8f887c', [W.shop, 5, 4, 19]);
    const tiers = [[10, H * .56, 1], [H * .56, H * .82, .92], [H * .82, H, .84]];
    for (const [y0, y1, k] of tiers) {
      b.prism('wall', f, circle(cx, 0, R * k, 28), y0, y1, stone, info, [0, 0, 0, 0], {smooth: true});
      // Vertical setbacks: four stone buttresses running up each tier.
      for (let a = 0; a < 4; a++) { const ang = a * Math.PI / 2 + Math.PI / 4; b.box('wall', f, cx + Math.cos(ang) * R * k, (y0 + y1) / 2, Math.sin(ang) * R * k, 3, y1 - y0, 3, stone, [0, 3, 3, 0]); }
    }
    b.prism('glow', f, circle(cx, 0, R * .88, 28), H, H + 12, '#f6ecd3', [0, 0, 0, 0], [0, 0, 0, 0], {smooth: true, top: false});
    b.prism('trim', f, circle(cx, 0, R * .8, 28), H + 11.5, H + 12, '#3a3a3a');
    b.prism('trim', f, circle(cx, 0, Math.min(R * .6, 10), 20), H + 12, H + 12.3, '#e9e4d6');
    beacon(b, f, cx + R * .7, H + 12, 0); beacon(b, f, cx - R * .7, H + 12, 0);
    plaza(b, f, lot, -lot.spec.setback + .5, cx - R);
    foundation(b, f, lot, '#8c867c');
    boxes.push({lot, h: H + 12});
  },
  twinTowers(b, lot, boxes) {
    // Two identical dark slabs over a shared granite plaza.
    const base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const S = Math.min(D - 8, Wd / 2 - 8), H = 152, info = [W.tinted, 4, 3, 31];
    b.slab('trim', f, -lot.spec.setback + .5, D, -Wd / 2 + 1, Wd / 2 - 1, .12, '#8a3f37');       // red granite plaza
    for (const s of [-1, 1]) {
      const zc = s * Wd / 4;
      b.box('wall', f, D / 2, 5, zc, S + 3, 10, S + 3, '#2b2b2b', [W.mixed, 5, 4, 11]);
      b.prism('wall', f, rect(D / 2 - S / 2, D / 2 + S / 2, zc - S / 2, zc + S / 2), 10, H, '#171b20', info, [0, 0, 0, 0]);
      b.box('trim', f, D / 2, H + 2, zc, S * .7, 4, S * .7, '#2b2f35');
      beacon(b, f, D / 2, H + 4, zc);
    }
    b.box('trim', f, D * .3, 1.5, 0, 6, 3, 6, '#c9a65a');                                         // a sculpture in the plaza
    foundation(b, f, lot, '#6d5f58');
    boxes.push({lot, h: H + 4});
  },
  stoneTower(b, lot, boxes) {
    // Pale stone with narrow vertical windows, chamfered corners, a dark crown band.
    const base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const S = Math.min(D, Wd) * .82, cx = D / 2, H = 172, stone = '#ddd7cb', info = [W.deco, 3.9, 1.9, 29];
    b.box('wall', f, cx, 6, 0, D - 2, 12, Wd - 2, '#d0c9bc', [W.shop, 6, 4.5, 7]);
    const oct = k => octagon(cx - S * k / 2, cx + S * k / 2, -S * k / 2, S * k / 2, S * k * .16);
    b.prism('wall', f, oct(1), 12, H * .9, stone, info, [0, 0, 0, 0]);
    b.prism('wall', f, oct(.86), H * .9, H, stone, info, [0, 0, 0, 0]);
    b.prism('trim', f, oct(.87), H - 6, H + 1, '#2d3035');
    beacon(b, f, cx, H + 1, 0);
    plaza(b, f, lot, -lot.spec.setback + .5, cx - S / 2);
    foundation(b, f, lot, '#8c867c');
    boxes.push({lot, h: H + 2});
  },
  setbackTower(b, lot, boxes) {
    // White aluminium and green-grey glass, rounded corners, three setbacks.
    const base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width, cx = D / 2;
    const hx = D * .4, hz = Wd * .4, H = 160, info = [W.ribbon, 3.8, 3, 37];
    b.box('wall', f, cx, 5, 0, D - 2, 10, Wd - 2, '#e8e6e0', [W.mixed, 5, 4, 5]);
    const tiers = [[10, H * .7, 1], [H * .7, H * .88, .86], [H * .88, H, .7]];
    for (const [y0, y1, k] of tiers) b.prism('wall', f, rounded(cx, 0, hx * k, hz * k, 5 * k), y0, y1, '#eeede8', info, [0, 0, 0, 0]);
    b.box('trim', f, cx, H + 2.5, 0, hx, 5, hz, '#b9bcbd');
    beacon(b, f, cx, H + 5, 0);
    foundation(b, f, lot, '#8c867c');
    boxes.push({lot, h: H + 5});
  },
  bonaventure(b, lot, boxes) {
    // A hotel of five mirrored cylinders on a concrete podium.
    const base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width, cx = D / 2;
    const info = [W.tinted, 3.6, 2.6, 43], mirror = '#8f9ca5', R = Math.min(D, Wd) * .17, o = Math.min(D, Wd) * .25;
    b.box('wall', f, cx, 5, 0, D - 2, 10, Wd - 2, '#bdb6aa', [W.none, 4, 4, 0]);
    b.prism('wall', f, circle(cx, 0, R * 1.3, 24), 10, 112, mirror, info, [0, 0, 0, 0], {smooth: true});
    for (const [dx, dz] of [[o, o], [o, -o], [-o, o], [-o, -o]]) b.prism('wall', f, circle(cx + dx, dz, R, 20), 10, 96, mirror, info, [0, 0, 0, 0], {smooth: true});
    b.prism('glow', f, circle(cx, 0, R * 1.32, 24), 104, 108, '#ffd7a0', [0, 0, 0, 0], [0, 0, 0, 0], {smooth: true, top: false});   // the revolving lounge
    b.sign('signs', f, cx - Math.min(D, Wd) * .5 + .8, 7, 0, 12, 3, SIGN.hotel[0]);
    beacon(b, f, cx, 112, 0);
    foundation(b, f, lot, '#8c867c');
    boxes.push({lot, h: 112});
  },
  dtTower(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width, cx = D / 2;
    const H = 96 + Math.floor(r() * 12) * 4, glass = pick(GLASS, r), info = [W.tinted, 4, 2.8, lot.seed % 983];
    b.box('wall', f, cx, 5, 0, D - 1, 10, Wd - 1, pick(STONE, r), [W.shop, 5, 4.5, lot.seed % 97]);
    const S = r() < .5 ? rect(cx - D * .42, cx + D * .42, -Wd * .42, Wd * .42) : octagon(cx - D * .42, cx + D * .42, -Wd * .42, Wd * .42, Math.min(D, Wd) * .12);
    const step = r() < .5 ? H * (.75 + r() * .12) : H;
    b.prism('wall', f, S, 10, step, glass, info, [0, 0, 0, 0]);
    if (step < H) b.prism('wall', f, scalePts(S, cx, 0, .8), step, H, glass, info, [0, 0, 0, 0]);
    b.box('trim', f, cx, H + 2, 0, D * .4, 4, Wd * .4, '#6f7478');
    beacon(b, f, cx, H + 4, 0);
    foundation(b, f, lot, '#8c867c');
    boxes.push({lot, h: H + 4});
  },
  cityHall(b, lot, boxes) {
    // A long cream base, a stepped tower of tall deco windows, a colonnade
    // and a pyramid top with a beacon.
    const base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width, cx = D * .55;
    const cream = '#e8dfcc', info = [W.deco, 4, 2.2, 61], S = Math.min(D, Wd) * .44;
    b.box('wall', f, cx, 11, 0, D * .8, 22, Wd - 2, cream, [W.punched, 4.4, 2.6, 59]);
    b.box('trim', f, cx, 22.4, 0, D * .8 + .8, .8, Wd - 1.2, '#d5c9b0');
    const tiers = [[22, 96, 1], [96, 108, .82], [108, 116, .68]];
    for (const [y0, y1, k] of tiers) {
      b.prism('wall', f, rect(cx - S * k / 2, cx + S * k / 2, -S * k / 2, S * k / 2), y0, y1, cream, info, [0, 0, 0, 0]);
      b.box('trim', f, cx, y1 + .3, 0, S * k + .8, .6, S * k + .8, '#d5c9b0');
    }
    // Colonnade: columns round the top tier.
    const cS = S * .6;
    for (let k = -2; k <= 2; k++) for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cx + (ax ? ax * cS / 2 : k * cS / 5), z = az ? az * cS / 2 : k * cS / 5;
      b.box('wall', f, x, 120, z, .9, 8, .9, cream, [0, 3, 3, 0]);
    }
    b.box('trim', f, cx, 124.3, 0, cS + 1.4, .8, cS + 1.4, '#d5c9b0');
    const [wx, , wz] = b._w(f, cx, 0, 0), g = {x: wx, z: wz, y: f.y, a: f.a + Math.PI / 4};
    b.cone('trim', g, 0, 124.7, 0, cS * .72, 13, '#c9bda3', 4);
    beacon(b, g, 0, 137.7, 0, '#ffb24a');
    // Front steps and lawn.
    b.slab('trim', f, -lot.spec.setback + .5, cx - D * .4, -Wd * .35, Wd * .35, .1, '#d9d0bd');
    foundation(b, f, lot, '#b2a898');
    boxes.push({lot, h: 138});
  },

  /* ---- Downtown: the blocks */
  officeMid(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const floors = 7 + Math.floor(r() * 9), fh = 3.8, H = 6 + floors * fh, glassy = r() < .55;
    const color = glassy ? pick(GLASS, r) : pick(STONE, r), info = glassy ? [W.tinted, fh, 2.6, lot.seed % 983] : [r() < .5 ? W.ribbon : W.punched, fh, 2.2, lot.seed % 983];
    b.box('wall', f, D / 2, 3, 0, D, 6, Wd, pick(['#2b2b2b', '#d9d2c4', '#8f887c'], r), [W.shop, 6, 4.5, lot.seed % 89]);
    const inset = r() < .5 ? 0 : 2;
    b.box('wall', f, D / 2 + inset / 2, 6 + floors * fh / 2, 0, D - inset, floors * fh, Wd - inset * 2, color, info);
    b.box('trim', f, D / 2, H + .3, 0, D - inset + .4, .6, Wd - inset * 2 + .4, glassy ? '#6f7478' : '#cfc7b8');
    b.box('trim', f, D * .55, H + 2.2, 0, D * .35, 3.6, Wd * .3, '#8e8a82');
    if (r() < .5) shopSign(b, f, r, 4.6, Math.min(Wd * .35, 7), 0, SIGN.service);
    foundation(b, f, lot, '#8c867c');
    boxes.push({lot, h: H + 4});
  },
  beauxArts(b, lot, boxes) {
    // 1920s: a two-storey base of shops, a plain shaft, an ornate top with a
    // heavy cornice; terra cotta or cream brick.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width - .3;
    const floors = 4 + Math.floor(r() * 7), fh = 3.7, H = 9 + floors * fh, color = pick(TERRA, r);
    b.box('wall', f, D / 2, 4.5, 0, D, 9, Wd, color, [W.shop, 4.5, 3.6, lot.seed % 991]);
    b.box('trim', f, -.15, 9.1, 0, .6, .5, Wd + .2, '#cdbb9b');
    b.box('wall', f, D / 2, 9 + floors * fh / 2, 0, D, floors * fh, Wd, color, [r() < .6 ? W.punched : W.arched, fh, 2.3 + r() * .6, lot.seed % 977]);
    for (let k = 3; k < floors; k += 4) b.box('trim', f, -.1, 9 + k * fh, 0, .35, .3, Wd + .1, '#cdbb9b');   // belt courses
    b.box('trim', f, D / 2 - .8, H + .5, 0, D + 1.8, 1, Wd + 1.8, '#c9b590');                                 // cornice
    b.box('wall', f, D / 2, H + 1.6, 0, D, 1.2, Wd, color);
    if (r() < .5) { b.prism('wall', f, circle(D * .6, Wd * .2, 2.2, 10), H + 2, H + 6, '#6d5a45', [0, 3, 3, 0], [0, 0, 0, 0], {smooth: true}); b.cone('trim', f, D * .6, H + 6, Wd * .2, 2.5, 1.6, '#5a4a3a', 10); }   // water tank
    if (r() < .6) shopSign(b, f, r, 3.9, Math.min(Wd * .4, 6));
    if (r() < .35) bladeSign(b, f, r, 12, Wd / 2 - 1.2, SIGN.shop);
    roofClutter(b, f, r, D, Wd, H + 2.2);
    foundation(b, f, lot, '#9a9388');
    boxes.push({lot, h: H + 3});
  },
  theatre(b, lot, boxes) {
    // A movie palace: deco facade, a marquee over the pavement and a tall blade sign.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width - .3;
    const H = 18 + r() * 8, color = pick([...DECO, '#d8b48a', '#c98f6c'], r);
    b.box('wall', f, D / 2, H / 2, 0, D, H, Wd, color, [W.deco, 4, 2.4, lot.seed % 991]);
    b.box('trim', f, -.2, H + .4, 0, .8, .8, Wd + .4, '#cdbb9b');
    b.box('marquee', f, -1.8, 5, 0, 3.6, 1.6, Wd * .8, '#1a1a1a');
    b.sign('signs', f, -3.62, 5, 0, Wd * .66, 1.35, pick([54, 47, 55], r));
    const idx = pick([55, 47], r), bh = Math.min(H * .7, 14);
    b.box('trim', f, -1.4, H * .55, 0, 2.2, bh + .6, .3, '#151515');
    for (const s of [-1, 1]) b.sign('signs', f, -1.4, H * .55, s * .17, bh, bh / 4, idx, [0, 0, s]);
    foundation(b, f, lot, '#9a9388');
    boxes.push({lot, h: H + 1});
  },
  garage(b, lot, boxes) {
    // A parking structure: concrete spandrels over dark open decks.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const floors = 4 + Math.floor(r() * 4), fh = 3.1, H = floors * fh, concrete = pick(['#bdb7ad', '#c9c4ba', '#a9a49b'], r);
    b.box('trim', f, D / 2 + .6, H / 2, 0, D - 1.2, H, Wd - 1.2, '#26272a');
    for (let k = 0; k <= floors; k++) b.box('wall', f, D / 2, k * fh + (k ? -.55 : .55), 0, D, 1.1, Wd, concrete, [0, 3, 3, 0]);
    for (let z = -Wd / 2 + 1; z <= Wd / 2 - 1; z += 8) b.box('wall', f, .4, H / 2, z, .8, H, .6, concrete, [0, 3, 3, 0]);
    b.box('wall', f, D * .8, H + 2, Wd / 2 - 4, 6, 4, 6, concrete, [0, 3, 3, 0]);                // stair and lift tower
    b.sign('signs', f, -.1, H - 1.5, -Wd / 2 + 4, 4, 1, 33);
    foundation(b, f, lot, concrete);
    boxes.push({lot, h: H + 1});
  },
  loft(b, lot, boxes) {
    // Arts District: brick warehouses with big factory windows and a water tank.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width - .3;
    const floors = 2 + Math.floor(r() * 4), fh = 4.4, H = floors * fh, color = pick(r() < .75 ? BRICK : ['#d8cfbf', '#a9a49b', '#7a7065'], r);
    b.box('wall', f, D / 2, H / 2, 0, D, H, Wd, color, [W.brick, fh, 3.4, lot.seed % 991]);
    b.box('wall', f, D / 2, H + .5, 0, D + .2, 1, Wd + .2, color, [W.brick, 4, 4, 0]);
    if (r() < .45) { const tx = D * (.3 + r() * .4), tz = (r() - .5) * Wd * .5;
      for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) b.box('trim', f, tx + dx, H + 2.5, tz + dz, .3, 4, .3, '#3a3530');
      b.prism('wall', f, circle(tx, tz, 2.6, 12), H + 4.5, H + 9, '#7b5a3e', [W.clapboard, 3, 3, 0], [0, 0, 0, 0], {smooth: true});
      b.cone('trim', f, tx, H + 9, tz, 2.9, 2, '#4d3b2b', 12); }
    if (r() < .5) shopSign(b, f, r, 3.7, Math.min(Wd * .4, 6), 0, [...SIGN.food, ...SIGN.club]);
    roofClutter(b, f, r, D, Wd, H + 1);
    foundation(b, f, lot, '#8a7a6a');
    boxes.push({lot, h: H + 2});
  },
  podiumApt(b, lot, boxes) {
    // Five over one: a shop podium and a modern apartment block with balconies.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const floors = 4 + Math.floor(r() * 3), fh = 3.2, H = 5 + floors * fh;
    const colors = ['#e9e6df', '#c9c1b1', '#3b3b3b', '#d98c5f', '#7f8c8d', '#b5654a', '#e4d9c4'], main = pick(colors, r), accent = pick(colors, r);
    b.box('wall', f, D / 2, 2.5, 0, D, 5, Wd, '#2c2c2e', [W.shop, 5, 4, lot.seed % 89]);
    b.box('wall', f, D / 2, 5 + floors * fh / 2, -Wd * .2, D, floors * fh, Wd * .6, main, [W.mixed, fh, 3, lot.seed % 977]);
    b.box('wall', f, D / 2, 5 + floors * fh / 2, Wd * .3, D, floors * fh, Wd * .4, accent, [W.punched, fh, 2.6, lot.seed % 971]);
    for (let k = 1; k < floors; k++) for (let z = -Wd * .45; z < -Wd * .05; z += 6) b.box('trim', f, -.7, 5 + k * fh, z, 1.4, .2, 3.6, '#e9e6df');
    b.box('trim', f, D / 2, H + .3, 0, D + .3, .6, Wd + .3, '#8e8a82');
    shopSign(b, f, r, 4.3, Math.min(Wd * .3, 6));
    roofClutter(b, f, r, D, Wd, H + .6);
    foundation(b, f, lot, '#8c867c');
    boxes.push({lot, h: H + 1});
  },
  rearCity(b, lot, boxes) {
    const r = rng(lot.seed), f = lotFrame(lot, lot.hi + .1), D = lot.depth, Wd = lot.width;
    const floors = 3 + Math.floor(r() * 5), fh = 3.6, H = floors * fh, color = pick([...BRICK, ...STONE, '#9a958c'], r);
    b.box('wall', f, D / 2, H / 2, 0, D, H, Wd, color, [r() < .4 ? W.brick : W.punched, fh, 3, lot.seed % 941]);
    roofClutter(b, f, r, D, Wd, H);
    foundation(b, f, lot, '#8c867c');
    boxes.push({lot, h: H + 1});
  },

  /* ---- Beverly Hills */
  flagship(b, lot, boxes) {
    // Rodeo Drive: pale stone or black glass, double-height windows, a
    // cornice, a brand's awning and name, clipped planters.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width - .3;
    const floors = 2 + (r() < .35 ? 1 : 0), fh = 5.2, H = floors * fh, color = pick(LUX, r), dark = color === '#1b1b1b';
    b.box('wall', f, D / 2, H / 2, 0, D, H, Wd, color, [dark ? W.curtain : r() < .5 ? W.arched : W.shop, fh, 3.8 + r() * 1.4, lot.seed % 997]);
    b.box('trim', f, D / 2 - .5, H + .35, 0, D + 1, .7, Wd + 1, dark ? '#2a2a2a' : '#d9cfbd');
    b.box('wall', f, D / 2, H + 1.1, 0, D, .9, Wd, color);
    if (r() < .6) b.box('awning', f, -.9, fh - .6, 0, 1.8, .15, Wd * .7, pick(['#101010', '#6b1e24', '#1d3b2a', '#e8e1d0', '#c5a35a'], r));
    const sw = Math.min(Wd * .55, 7.5);
    b.sign('signs', f, -.08, fh + .9, 0, sw, sw / 4, pick(LUX_SIGNS, r));
    for (const s of [-1, 1]) { b.box('trim', f, -.7, .5, s * Wd * .4, 1, 1, 1, '#d8d2c6'); b.box('trim', f, -.7, 1.4, s * Wd * .4, .9, .9, .9, '#3f6134'); }
    foundation(b, f, lot, '#b9ae9c');
    boxes.push({lot, h: H + 2});
  },
  bhOffice(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const floors = 4 + Math.floor(r() * 6), fh = 3.8, H = 6 + floors * fh, color = pick(STONE, r);
    b.box('wall', f, D / 2, 3, 0, D, 6, Wd, color, [W.shop, 6, 4, lot.seed % 89]);
    b.box('wall', f, D / 2, 6 + (floors - 1) * fh / 2, 0, D, (floors - 1) * fh, Wd, color, [r() < .5 ? W.punched : W.ribbon, fh, 2.2, lot.seed % 983]);
    b.box('wall', f, D / 2 + 1.5, H - fh / 2, 0, D - 3, fh, Wd - 3, color, [W.curtain, fh, 2.4, lot.seed % 977]);   // set-back top floor
    b.box('trim', f, D / 2, H - fh + .2, 0, D + .8, .4, Wd + .8, '#cfc7b8');
    b.box('trim', f, D / 2 + 1.5, H + .2, 0, D - 2.6, .4, Wd - 2.6, '#cfc7b8');
    shopSign(b, f, r, 4.4, Math.min(Wd * .3, 6), 0, [33, ...LUX_SIGNS.slice(0, 2)]);
    foundation(b, f, lot, '#a39c90');
    boxes.push({lot, h: H + 1});
  },
  grandHotel(b, lot, boxes) {
    // Italian Renaissance limestone, a green copper hip roof, arcaded ground floor.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const fh = 3.6, floors = 9, H = 6 + floors * fh, stone = '#eee4d0';
    b.box('wall', f, D / 2, 3, 0, D, 6, Wd, stone, [W.arched, 6, 4.2, 71]);
    b.box('wall', f, D / 2, 6 + floors * fh / 2, 0, D, floors * fh, Wd, stone, [W.punched, fh, 2.6, 73]);
    b.box('trim', f, D / 2 - .5, 6.3, 0, D + 1, .6, Wd + 1, '#dccfb6');
    b.box('trim', f, D / 2 - .6, H + .5, 0, D + 1.4, 1, Wd + 1.4, '#dccfb6');
    b.hip('tile', f, D / 2, H + 1, 0, D, Wd, 7, '#5f8a78', .6);
    b.box('awning', f, -1.6, 4.2, 0, 3.2, .2, 12, '#1d3b2a');                                     // entrance canopy
    b.sign('signs', f, -.1, H - 4, 0, 16, 4, 53);
    for (const z of [-Wd * .4, -Wd * .2, Wd * .2, Wd * .4]) b.box('trim', f, -.8, 3.4, z, .6, 6.8, .6, '#3a3a3a');   // flagpoles
    foundation(b, f, lot, '#b9ae9c');
    boxes.push({lot, h: H + 8});
    void r;
  },
  bhCityHall(b, lot, boxes) {
    // Spanish baroque: a long cream building, a central tower with an
    // octagonal drum and a gold-and-green tiled dome.
    const base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width, cx = D * .55;
    const cream = '#f0e6d2', tile = '#c9a14a';
    b.box('wall', f, cx, 8, 0, D * .8, 16, Wd - 2, cream, [W.arched, 4, 3.2, 81]);
    b.hip('tile', f, cx, 16, 0, D * .8, Wd - 2, 3, pick(TILE_RED, rng(5)), .6);
    b.prism('wall', f, rect(cx - 7, cx + 7, -7, 7), 16, 36, cream, [W.arched, 4, 3.2, 83], [0, 0, 0, 0]);
    b.prism('wall', f, circle(cx, 0, 6, 8), 36, 44, cream, [W.arched, 4, 2.8, 85]);
    b.cone('tile', f, cx, 44, 0, 6.3, 9, tile, 8);
    b.cone('trim', f, cx, 52.5, 0, .9, 5, '#d9b458', 8);
    b.slab('trim', f, -lot.spec.setback + .5, cx - D * .4, -Wd * .3, Wd * .3, .08, '#d9d0bd');
    foundation(b, f, lot, '#b2a898');
    boxes.push({lot, h: 50});
  },
  recordTower(b, lot, boxes) {
    // A round office tower like a stack of records: every floor a disc of
    // sunshade wider than the glass, a thin spire with a red beacon on top.
    const base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, cx = D / 2, R = Math.min(D, lot.width) * .3;
    const floors = 13, fh = 3.6, H = floors * fh;
    b.prism('wall', f, circle(cx, 0, R, 24), 0, H, '#2f3a44', [W.curtain, fh, 2, 91], [0, 0, 0, 0], {smooth: true});
    for (let k = 1; k <= floors; k++) b.prism('trim', f, circle(cx, 0, R + 1.3, 24), k * fh - .35, k * fh, '#f2f0ea');
    b.box('wall', f, cx, H + 2.5, 0, R * .9, 5, R * .9, '#f2f0ea', [0, 3, 3, 0]);
    b.cone('trim', f, cx, H + 5, 0, .6, 28, '#d9dde2', 6);
    beacon(b, f, cx, H + 33, 0);
    b.box('wall', f, cx + R * .6, 3, 0, R * 1.2, 6, lot.width * .7, '#e9e6df', [W.shop, 6, 4, 93]);   // the low wing
    foundation(b, f, lot, '#8c867c');
    boxes.push({lot, h: H + 5});
  },
  mansionMed(b, lot, boxes) { mansion(b, lot, boxes, 'med', 1); },
  mansionColonial(b, lot, boxes) { mansion(b, lot, boxes, 'colonial', 1); },
  mansionTudor(b, lot, boxes) { mansion(b, lot, boxes, 'tudor', 1); },
  mansionModern(b, lot, boxes) { mansion(b, lot, boxes, 'modern', 1); },
  tudor(b, lot, boxes) { mansion(b, lot, boxes, 'tudor', .6); },
  colonial(b, lot, boxes) { mansion(b, lot, boxes, 'colonial', .6); },
};

/** Estates (k = 1) and their smaller cousins in the flats (k ~ .6). */
function mansion(b, lot, boxes, style, k) {
  const r = rng(lot.seed), f = lotFrame(lot, lot.hi + .2), D = lot.depth * .78, Wd = lot.width * .8, x0 = 1;
  const fh = 3.6, H = 2 * fh;
  if (k === 1) hedge(b, f, lot, r, pick(HEDGE, r));
  if (style === 'med') {
    const color = pick(['#f1e6d0', '#ead9bd', '#e7cfa9', '#f3ece0', '#dcc3a0'], r), tile = pick(TILE_RED, r);
    b.box('wall', f, x0 + D * .5, H / 2, 0, D * .6, H, Wd * .6, color, [W.arched, fh, 3.4, lot.seed % 961]);
    b.hip('tile', f, x0 + D * .5, H, 0, D * .6, Wd * .6, 2.8 * k + .6, tile, .8);
    for (const s of [-1, 1]) {
      b.box('wall', f, x0 + D * .45, fh / 2, s * Wd * .38, D * .5, fh, Wd * .24, color, [W.arched, fh, 3.4, lot.seed % 953]);
      b.hip('tile', f, x0 + D * .45, fh, s * Wd * .38, D * .5, Wd * .24, 1.8 * k + .4, tile, .6);
    }
    b.box('wall', f, x0 + D * .2 - 1.2, fh * .6, 0, 2.4, fh * 1.2, 5, color, [W.arched, fh * 1.2, 5, 3]);        // entry
  } else if (style === 'colonial') {
    const color = pick(['#f6f4ee', '#f2efe8', '#e9e4d8', '#d9dde0', '#efe6d6'], r), slate = pick(SLATE, r);
    b.box('wall', f, x0 + D * .5, H / 2, 0, D * .6, H, Wd * .7, color, [W.punched, fh, 2.6, lot.seed % 961]);
    b.hip('trim', f, x0 + D * .5, H, 0, D * .6, Wd * .7, 3.2 * k + .6, slate, .5);
    // Portico: columns and a pediment across the middle of the front.
    const pw = Math.min(Wd * .36, 12), px = x0 + D * .2 - 2.4;
    for (let i = 0; i < 4; i++) b.prism('wall', f, circle(px, -pw / 2 + pw * i / 3, .35, 8), 0, H, '#fbfaf6', [0, 3, 3, 0], [0, 0, 0, 0], {smooth: true});
    b.box('trim', f, px + 1.2, H + .3, 0, 3.4, .6, pw + 1, '#fbfaf6');
    b.gable('trim', f, px + 1.2, H + .6, 0, 3.4, pw + 1, 2.2, '#fbfaf6');
    for (const s of [-1, 1]) b.box('wall', f, x0 + D * .55, H + 1.8, s * Wd * .28, 1.4, 3.6, 1.2, '#9b5a3f');       // chimneys
    if (k === 1) for (const s of [-1, 1]) { b.box('wall', f, x0 + D * .5, fh / 2, s * Wd * .45, D * .4, fh, Wd * .12, color, [W.punched, fh, 2.6, 5]); }
  } else if (style === 'tudor') {
    const lower = pick(BRICK, r), upper = pick(['#efe6d3', '#e8dcc3', '#f2ead9'], r), slate = pick(SLATE, r);
    b.box('wall', f, x0 + D * .5, fh / 2, 0, D * .6, fh, Wd * .66, lower, [W.brick, fh, 2.4, lot.seed % 961]);
    b.box('wall', f, x0 + D * .5, fh * 1.5, 0, D * .6, fh, Wd * .66, upper, [W.punched, fh, 2.4, lot.seed % 953]);
    b.gable('trim', f, x0 + D * .5, H, 0, D * .6, Wd * .66, 5.5 * k + 1, slate);
    const gz = (r() - .5) * Wd * .3;                                                                        // a cross-gable to the street
    b.box('wall', f, x0 + D * .22, H / 2, gz, D * .2, H, Wd * .22, upper, [W.punched, fh, 2.4, 7]);
    const g = {...f, a: f.a + Math.PI / 2};
    const [wx, , wz] = b._w(f, x0 + D * .22, 0, gz);
    b.gable('trim', {...g, x: wx, z: wz}, 0, H, 0, Wd * .22, D * .2, 4.2 * k + .8, slate);
    b.box('wall', f, x0 + D * .6, H + 3, Wd * .3, 1.4, 6, 1.6, lower, [W.brick, 3, 3, 0]);
  } else {
    const white = pick(['#f4f3ef', '#eeede8', '#e2ddd3'], r);
    b.box('wall', f, x0 + D * .5, fh / 2, -Wd * .1, D * .7, fh, Wd * .6, white, [W.curtain, fh, 3, lot.seed % 961]);
    b.box('wall', f, x0 + D * .45, fh * 1.5, Wd * .12, D * .55, fh, Wd * .62, pick(['#2b2b2d', white, ...WOOD], r), [W.curtain, fh, 3.2, lot.seed % 953]);
    b.box('trim', f, x0 + D * .45, H + .15, Wd * .12, D * .55 + 1.6, .3, Wd * .62 + 1.6, '#f4f3ef');
    b.slab('pool', f, x0 + D * .8, x0 + D * .98, -Wd * .4, Wd * .1, .22, '#ffffff');
  }
  // Pool in the back garden, a motor court in front.
  if (style !== 'modern' && k === 1) {
    b.slab('trim', f, x0 + D * .84, x0 + D * 1.02, -Wd * .3, Wd * .12, .14, '#d8cbb0');
    b.slab('pool', f, x0 + D * .86, x0 + D, -Wd * .28, Wd * .1, .22, '#ffffff');
  }
  if (k === 1) b.slab('trim', f, -2, x0 + D * .2 - 3, -Wd * .2, Wd * .2, .07, '#d6cdbb');
  const drop = f.y - lot.lo;
  if (drop > .4) b.box('wall', f, x0 + D / 2, -drop / 2, 0, D * .92, drop, Wd * .92, '#cfc8bb', [0, 3, 3, 0]);
  boxes.push({lot, h: H + 3, lx0: x0, lx1: x0 + D, w: Wd});
  void PASTEL; void STUCCO; void DECO;
}
