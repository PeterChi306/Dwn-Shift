/* Pasadena, San Marino and Eagle Rock (2026-09-26).
 *
 * Pasadena after the real place: Old Town's brick and Mission-revival blocks
 * along Colorado Boulevard and Fair Oaks; the Civic Center with City Hall's
 * domed tower over its arcaded courtyard; Caltech's arcaded Spanish campus
 * under red tile; Lake Avenue's shops and low offices; street after street of
 * Craftsman bungalows and two-storey Craftsman houses under old oaks, bigger
 * houses and estates toward the south; the Rose Bowl down in the Arroyo.
 * San Marino: estates, and a Beaux-Arts library mansion in formal gardens.
 * Eagle Rock: a small main street and hillside bungalows.
 *
 * Merged into buildings.js's tables like city.js. Big landmarks that need
 * open ground rather than a street frontage (the stadium, the library and its
 * gardens) are `free`: buildings.js searches outward from `near` for a clear,
 * level footprint instead of walking a road.
 */
import {rng, pick, W, lotFrame, baseOf, roofClutter, foundation, shopSign, bladeSign, rect, circle,
  BRICK, SLATE, TILE_RED} from './buildings.js';
import {SIGN} from './signs.js';

export const PASADENA = [
  {name: 'pasadena', x0: 800, x1: 3900, z0: -4450, z1: -1600},
  {name: 'pasadena', x0: 3900, x1: 5800, z0: -3000, z1: -1100},    // San Marino
  {name: 'pasadena', x0: 2050, x1: 3500, z0: -1750, z1: -150},     // Eagle Rock
];

const OLD_TOWN = {x: 1950, z: -2975, r: 400}, CAMPUS = {x: 1650, z: -3120, r: 260}, CIVIC = {x: 2230, z: -3220, r: 300};
const near = (c, x, z) => Math.hypot(x - c.x, z - c.z) < c.r;

export function pasadenaZone(seg, r, x, z) {
  const name = seg.name || '', kind = seg.kind, main = kind === 'avenue' || kind === 'boulevard';
  if (near(CAMPUS, x, z)) return r() < .85 ? 'campus' : 'pasHouse';
  if (near(OLD_TOWN, x, z)) return main || /Colorado|Fair Oaks|Green|Union|Raymond/.test(name) ? 'oldtown' : r() < .55 ? 'oldtown' : 'apartment';
  if (/Colorado|Lake Avenue/.test(name) || near(CIVIC, x, z) && kind !== 'residential') return r() < .8 ? 'pasCommercial' : 'apartment';
  if (x > 3900 && z > -3000) {                                                     // San Marino
    if (main) return /Huntington|San Marino Avenue|Lorain/.test(name) ? (r() < .6 ? 'pasCommercial' : 'pasHouse') : 'pasHouse';
    return r() < .7 ? 'estate' : 'pasHouse';
  }
  if (z > -1750) {                                                                 // Eagle Rock
    if (main) return r() < .55 ? 'pasCommercial' : r() < .8 ? 'apartment' : 'pasHouse';
    return r() < .8 ? 'pasHouse' : 'apartment';
  }
  if (main) return r() < .45 ? 'pasCommercial' : r() < .7 ? 'apartment' : 'pasHouse';
  if (z > -2600) return r() < .25 ? 'estate' : 'pasHouse';                        // the south side: bigger houses
  return r() < .82 ? 'pasHouse' : 'apartment';
}

export const PAS_SIZE = {
  brickBlock: r => ({width: 14 + r() * 12, depth: 20 + r() * 10, setback: .8, gap: .4}),
  mission: r => ({width: 14 + r() * 10, depth: 16 + r() * 8, setback: 1.2, gap: r() < .3 ? 3 : .4}),
  campusHall: r => ({width: 40 + r() * 22, depth: 18 + r() * 8, setback: 8 + r() * 6, gap: 10 + r() * 8}),
  craftsman2: r => ({width: 14 + r() * 5, depth: 13 + r() * 5, setback: 7 + r() * 3, gap: 4 + r() * 3}),
};
export const PAS_VARIANTS = {
  oldtown: [['brickBlock', 5], ['mission', 1.6], ['beauxArts', .6], ['restaurant', 1], ['boutique', 1]],
  pasCommercial: [['shop', 3], ['mixedUse', 1.6], ['mission', 1.6], ['bhOffice', 1.2], ['brickBlock', 1], ['podiumApt', .6]],
  campus: [['campusHall', 5], ['courtyard', .8]],
  pasHouse: [['craftsman', 3], ['craftsman2', 3.4], ['spanish', 2], ['tudor', 1], ['colonial', 1.2], ['modernBox', .3]],
};
export const PAS_LANDMARKS = [
  {variant: 'pasCityHall', zone: 'tower', road: /./, near: [2330, -3180], width: 110, depth: 78, setback: 10, relief: 8},
  {variant: 'stadium', zone: 'tower', free: true, pad: true, near: [1600, -1820], width: 230, depth: 190, relief: 14},
  // San Marino High School on Huntington Drive (its real campus map, scaled to fit the block grid).
  {variant: 'smhs', zone: 'tower', free: true, pad: true, near: [4820, -1900], width: 160, depth: 200, relief: 14},
  {variant: 'library', zone: 'tower', free: true, near: [5080, -1900], width: 170, depth: 130, relief: 8},
];

const CREAM = ['#efe3cc', '#f1e8d6', '#e8d9bd', '#f3ecdf'];


/** A Mission-revival parapet across the front: a raised arched centre over
 *  stepped shoulders. Built from convex pieces (a fan-filled concave outline
 *  fills its own curves in and reads as a mound). */
function missionFront(b, f, Wd, y, h, color) {
  const g = {...f, a: f.a + Math.PI / 2}, cw = Wd * .36, prof = [];
  for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI; prof.push([-(Math.cos(a) * cw / 2), y + h * .55 + Math.sin(a) * h * .45]); }
  prof.push([cw / 2, y - .2], [-cw / 2, y - .2]);                        // down and back along the roofline
  b.extrude('wall', g, prof, -.05, .55, color, [0, 3, 3, 0]);
  for (const s of [-1, 1]) {
    b.box('wall', f, .25, y + h * .3, s * (cw / 2 + Wd * .1), .6, h * .6, Wd * .2, color, [0, 3, 3, 0]);   // first step
    b.box('wall', f, .25, y + h * .12, s * (cw / 2 + Wd * .26), .6, h * .24, Wd * .12, color, [0, 3, 3, 0]);
  }
  b.box('tile', f, .25, y + h + .12, 0, .8, .24, cw * .5, '#a14b33');
}

export const PAS_BUILD = {
  brickBlock(b, lot, boxes) {
    // Old Town: brick or stone fronts, tall arched upper windows, a corbelled cornice, awnings.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width - .3;
    const floors = 2 + Math.floor(r() * 3), fh = 4.3, H = floors * fh, brick = r() < .6;
    const color = brick ? pick(BRICK, r) : pick(['#d9c6a5', '#cdb38e', '#e6d6bd', '#bda27f'], r);
    b.box('wall', f, D / 2, fh / 2, 0, D, fh, Wd, color, [W.shop, fh, 3.6, lot.seed % 991]);
    b.box('wall', f, D / 2, fh + (H - fh) / 2, 0, D, H - fh, Wd, color, [brick ? W.arched : W.punched, fh, 2.6, lot.seed % 977]);
    b.box('trim', f, -.12, fh + .1, 0, .45, .4, Wd + .1, '#d9cbb0');
    b.box('trim', f, D / 2 - .45, H + .4, 0, D + .9, .8, Wd + .9, '#cbb89a');                      // cornice
    b.box('wall', f, D / 2, H + 1.2, 0, D, .8, Wd, color, [0, 4, 4, 0]);
    if (r() < .75) b.box('awning', f, -.9, fh - .9, 0, 1.8, .15, Wd * .9, pick(['#2f5d50', '#8e2b2b', '#23395b', '#6b4f2a', '#1d1d1d', '#c9a45a'], r));
    shopSign(b, f, r, fh - .3 + (r() < .5 ? .5 : 0), Math.min(Wd * .55, 6.5));
    if (r() < .35) bladeSign(b, f, r, fh + 1.5, Wd / 2 - 1.2, SIGN.shop);
    roofClutter(b, f, r, D, Wd, H + 1.6);
    foundation(b, f, lot, '#9a9388');
    boxes.push({lot, h: H + 2});
  },
  mission(b, lot, boxes) {
    // Mission revival: white stucco, an arcade, a curved parapet, red tile trim.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width - .4;
    const floors = r() < .6 ? 1 : 2, fh = 4.6, H = floors * fh, color = pick(CREAM, r);
    b.box('wall', f, D / 2, H / 2, 0, D, H, Wd, color, [W.arched, fh, 3.8, lot.seed % 977]);
    missionFront(b, f, Wd, H, 3 + r() * 1.5, color);
    b.box('tile', f, D / 2 + .3, H + .15, 0, D - .6, .3, Wd - .2, pick(TILE_RED, r));
    b.box('trim', f, -.2, fh - .2, 0, .4, .35, Wd, pick(TILE_RED, r));
    shopSign(b, f, r, fh * .72, Math.min(Wd * .5, 6));
    foundation(b, f, lot, '#a39c90');
    boxes.push({lot, h: H + 4});
  },
  campusHall(b, lot, boxes) {
    // Caltech: long cream buildings, an arcade along the ground floor, deep red tile hip roofs, sometimes a tower.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const floors = 2 + (r() < .45 ? 1 : 0), fh = 4, H = floors * fh, color = pick(CREAM, r), tile = pick(TILE_RED, r);
    b.box('wall', f, D / 2 + 1.5, H / 2, 0, D - 3, H, Wd, color, [W.punched, fh, 3, lot.seed % 961]);
    b.box('wall', f, 1.5, fh / 2, 0, 3, fh, Wd, color, [W.arched, fh, 3.4, 5]);                   // the arcade
    b.hip('tile', f, D / 2 + 1.5, H, 0, D - 3, Wd, 3.4, tile, .9);
    b.slab('trim', f, -lot.spec.setback + 1, 0, -Wd / 2, Wd / 2, .08, '#d8cbb0');
    if (r() < .35) {
      const tz = (r() - .5) * Wd * .5;
      b.box('wall', f, D / 2, H + 4, tz, 6, 8, 6, color, [W.arched, 4, 3, 7]);
      b.hip('tile', f, D / 2, H + 8, tz, 6, 6, 3, tile, .5);
    }
    foundation(b, f, lot, '#b2a898');
    boxes.push({lot, h: H + 4});
  },
  craftsman2(b, lot, boxes) {
    // Two-storey Craftsman: shingles, broad low gables with deep eaves, a
    // wide porch on stone piers, a river-rock chimney.
    const r = rng(lot.seed), base = baseOf(lot) + .6, f = lotFrame(lot, base);
    const fh = 3.1, H = 2 * fh, D = lot.depth * .78, Wd = lot.width * .8;
    const color = pick(['#6f7a5c', '#8a7a5a', '#5f6b6e', '#9a8263', '#7b5f4a', '#4f5d4a', '#a88f6a', '#556b58'], r), roof = pick(['#4b4038', '#3e3a36', '#5a4a3c', '#57524a'], r);
    b.box('wall', f, D / 2 + 2.8, H / 2, 0, D, H, Wd, color, [W.clapboard, fh, 2.4, lot.seed % 967]);
    b.gable('trim', f, D / 2 + 2.8, H, 0, D + 1.2, Wd + 1.2, 2.4, roof);
    b.slab('trim', f, 0, 2.8, -Wd / 2 + .3, Wd / 2 - .3, .5, '#8a7a66');
    for (const z of [-Wd / 2 + .8, 0, Wd / 2 - .8]) { b.box('trim', f, .5, 1, z, .8, 1.2, .8, '#8f8579'); b.box('trim', f, .5, 2.4, z, .38, 1.6, .38, '#e8e0cf'); }
    b.box('trim', f, 1.3, 3.35, 0, 3.2, .3, Wd + .6, roof);
    b.box('trim', f, D * .6 + 2.8, H + 1.6, Wd / 2 + .4, 1.4, H + 3, 1.3, '#8b8378');
    foundation(b, f, lot, '#8f8579');
    boxes.push({lot, h: H + 3});
  },
  pasCityHall(b, lot, boxes) {
    // Pasadena City Hall: a U of arcaded three-storey ranges round a
    // courtyard, and over the entrance a tower of stages topped by an
    // octagonal colonnade and a tiled dome with a lantern.
    const base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const cream = '#efe4cf', tile = '#b5652f', dome = '#c9a24a', H = 15;
    b.box('wall', f, D - 7, H / 2, 0, 14, H, Wd - 4, cream, [W.arched, 5, 3.4, 51]);                // back range
    for (const s of [-1, 1]) b.box('wall', f, D / 2, H / 2, s * (Wd / 2 - 9), D - 6, H, 14, cream, [W.arched, 5, 3.4, 53]);
    b.hip('tile', f, D - 7, H, 0, 14, Wd - 4, 3, tile, .7);
    for (const s of [-1, 1]) b.hip('tile', f, D / 2, H, s * (Wd / 2 - 9), D - 6, 14, 3, tile, .7);
    b.box('wall', f, 5, 6, 0, 10, 12, 36, cream, [W.arched, 6, 4, 55]);                           // entrance range
    const T = 16;
    b.prism('wall', f, rect(8 - T / 2, 8 + T / 2, -T / 2, T / 2), 0, 34, cream, [W.arched, 5, 3.4, 57], [0, 0, 0, 0]);
    b.box('trim', f, 8, 34.4, 0, T + 1.2, .8, T + 1.2, '#dccfb4');
    b.prism('wall', f, rect(8 - T * .38, 8 + T * .38, -T * .38, T * .38), 34.8, 42, cream, [W.arched, 3.6, 2.6, 59], [0, 0, 0, 0]);
    // Octagonal colonnade: columns round a drum.
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; b.box('wall', f, 8 + Math.cos(a) * 6.2, 46, Math.sin(a) * 6.2, .7, 8, .7, cream, [0, 3, 3, 0]); }
    b.prism('wall', f, circle(8, 0, 4.6, 12), 42, 50, cream, [0, 3, 3, 0]);
    b.prism('trim', f, circle(8, 0, 7, 16), 49.8, 50.6, '#dccfb4');
    // The dome: stacked rings of gold-and-green tile, then a lantern and finial.
    const rings = 6;
    for (let k = 0; k < rings; k++) {
      const a0 = k / rings * Math.PI / 2, a1 = (k + 1) / rings * Math.PI / 2;
      b.prism('tile', f, circle(8, 0, 6.6 * Math.cos(a0), 16), 50.6 + 7 * Math.sin(a0), 50.6 + 7 * Math.sin(a1), k % 2 ? dome : '#5f8a6a', [0, 0, 0, 0], [0, 0, 0, 0], {smooth: true, top: k === rings - 1});
    }
    b.prism('wall', f, circle(8, 0, 1.4, 8), 57.4, 60.4, cream, [0, 3, 3, 0]);
    b.cone('trim', f, 8, 60.4, 0, 1.6, 3.2, dome, 8);
    // Courtyard: paving, a fountain, clipped hedges.
    b.slab('trim', f, 12, D - 14, -Wd / 2 + 16, Wd / 2 - 16, .1, '#d8cdb6');
    b.prism('trim', f, circle(D / 2 + 2, 0, 4, 16), 0, .7, '#cfc3aa');
    b.prism('pool', f, circle(D / 2 + 2, 0, 3.4, 16), .7, .72, '#ffffff');
    b.slab('trim', f, -lot.spec.setback + .5, 0, -24, 24, .08, '#d8cdb6');
    foundation(b, f, lot, '#b2a898');
    boxes.push({lot, h: 60, lx0: 0, lx1: D, w: Wd});
  },
  stadium(b, lot, boxes, signIdx = 56) {
    // The Arroyo bowl: an elliptical rim of concrete, seating raked down to
    // the field, a press box on the west side, the name over the tunnel.
    const f = lotFrame(lot, lot.lo + .3), D = lot.depth, Wd = lot.width, cx = D / 2;
    const ro = [D * .46, Wd * .46], ri = [D * .26, Wd * .3], H = 19, n = 48;
    const P = (k, rr, y) => { const a = k / n * Math.PI * 2; return [cx + Math.cos(a) * rr[0], y, Math.sin(a) * rr[1]]; };
    const outer = []; for (let k = 0; k < n; k++) { const q = P(k, ro, 0); outer.push([q[0], q[2]]); }
    const drop = f.y - lot.lo;
    b.prism('wall', f, outer, -drop - 1, H, '#d9d0bf', [0, 4, 4, 0], [0, 0, 0, 0], {top: false});   // outer wall; the rim and seats are its top
    for (let k = 0; k < n; k++) {
      const a = P(k, ri, 1.2), c = P(k + 1, ri, 1.2), d = P(k + 1, [ro[0] - 1.2, ro[1] - 1.2], H + .05), e = P(k, [ro[0] - 1.2, ro[1] - 1.2], H + .05);
      b.poly('trim', f, [a, c, d, e], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0], k % 8 < 4 ? '#8c2f2f' : '#9a3a36', [0, 0, 0, 0]);   // seating bowl
      b.poly('trim', f, [e, d, P(k + 1, ro, H + .05), P(k, ro, H + .05)], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0], '#e3dccd', [0, 0, 0, 0]);
    }
    const field = []; for (let k = 0; k < n; k++) { const q = P(k, ri, 1.25); field.push(q); }
    b.poly('trim', f, field, field.map(q => [q[0], q[2]]), [0, 1, 0], '#4f8a3a', [0, 0, 0, 0]);
    for (let k = -5; k <= 5; k++) b.box('trim', f, cx + k * ri[0] * .16, 1.3, 0, .25, .05, ri[1] * 1.3, '#f4f4f0');   // yard lines
    b.box('wall', f, cx - ro[0] + 6, H + 4, 0, 8, 8, Wd * .3, '#e3dccd', [W.ribbon, 4, 3, 5]);        // press box
    b.sign('signs', f, cx - ro[0] - .1, H * .55, 0, 26, 6.5, signIdx);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {                                  // light towers
      const x = cx + sx * ro[0] * .72, z = sz * ro[1] * .72;
      b.box('trim', f, x, H + 14, z, .8, 28, .8, '#8e9296');
      b.box('glow', f, x, H + 28, z, 5, 3, .6, '#fff4d8');
    }
    boxes.push({lot, h: H, lx0: cx - ro[0], lx1: cx + ro[0], w: ro[1] * 2});
  },
  smhs(b, lot, boxes) {
    // San Marino High School, after the campus map: two-storey classroom
    // wings round lawns and quads along the front (Huntington Drive), the
    // library, cafeteria and Neher Auditorium behind them, the big and small
    // gyms, pool and the 1840s Michael White Adobe to the west, McNamee
    // baseball field in the middle, the football field and track, tennis
    // courts and the upper softball field at the back. Cream stucco, red tile,
    // royal blue trim: the Titans' colours.
    const f = lotFrame(lot, lot.lo + .3), D = lot.depth, Wd = lot.width, CREAMW = '#efe8da', BLUE = '#1d4fa0', TILE = '#b0543a';
    const green = (x0, x1, z0, z1, c = '#5d8a45') => b.slab('trim', f, x0, x1, z0, z1, .12, c);
    const wing = (x0, x1, z0, z1, floors = 2, roof = true) => {
      const H = floors * 4, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = x1 - x0, sz = z1 - z0;
      b.box('wall', f, cx, H / 2, cz, sx, H, sz, CREAMW, [W.punched, 4, 3.2, 11]);
      if (floors > 1) b.box('trim', f, cx, 4, cz, sx + .25, .35, sz + .25, BLUE);
      if (roof) b.hip('tile', f, cx, H, cz, sx, sz, Math.min(sx, sz) * .22, TILE, .6);
      else b.box('trim', f, cx, H + .35, cz, sx + .2, .7, sz + .2, '#e4dccb');
    };
    // Grounds: paving over the whole pad, lawns and quads.
    b.slab('trim', f, 0, D, -Wd / 2, Wd / 2, .06, '#a7ab92');
    green(0, 9, -Wd / 2 + 2, Wd / 2 - 2);
    green(26, 33, -40, 16, '#6a9650'); green(46, 58, -44, 0, '#6a9650');
    // Front: the classroom wings and the entrance tower.
    wing(10, 24, -34, 30);
    for (let z = -32; z <= 28; z += 3.2) b.box('wall', f, 8.8, 1.7, z, .45, 3.4, .45, CREAMW, [0, 3, 3, 0]);   // arcade
    b.box('trim', f, 9, 3.5, -2, 2.6, .3, 64, '#e4dccb');
    b.box('wall', f, 15, 7, -2, 8, 14, 8, CREAMW, [W.arched, 4.5, 3, 5]);
    b.hip('tile', f, 15, 14, -2, 8, 8, 3.2, TILE, .5);
    b.sign('signs', f, 10.9, 10.6, -2, 7.4, 1.85, 64);
    wing(10, 46, -64, -50);                                                          // the 300/400 block
    wing(34, 46, -46, 20);                                                           // 100/200 and the library
    wing(36, 48, 22, 38, 1, false);                                                  // cafeteria
    wing(14, 28, 46, 62, 1);                                                         // 500 block
    // Neher Auditorium, with its fly tower.
    b.box('wall', f, 52, 6, 52, 20, 12, 24, CREAMW, [W.none, 4, 4, 0]);
    b.box('wall', f, 58, 8.5, 52, 8, 17, 18, '#e6ddca', [W.none, 4, 4, 0]);
    b.gable('tile', f, 48, 12, 52, 12, 24, 3, TILE);
    b.box('trim', f, 41.8, 9, 52, .2, 1.4, 16, BLUE);
    // West side: gyms, pool, the adobe.
    b.box('wall', f, 74, 5.5, -64, 22, 11, 16, CREAMW, [W.none, 4, 4, 0]);
    b.gable('trim', f, 74, 11, -64, 22, 16, 2.4, '#8c96a0');
    b.sign('signs', f, 62.9, 8, -64, 7, 1.75, 65);
    b.box('wall', f, 97, 4, -66, 14, 8, 12, CREAMW, [W.none, 4, 4, 0]);
    b.box('trim', f, 93, .5, -42, 16, .9, 12, '#e8e3d8');
    b.prism('pool', f, [[86, -47], [100, -47], [100, -37], [86, -37]], .9, .92, '#ffffff');
    b.box('wall', f, 63, 1.8, -30, 7, 3.6, 5, '#c9a27a', [W.punched, 3.6, 3, 2]);
    b.gable('tile', f, 63, 3.6, -30, 7, 5, 1.2, '#9b4a36');
    // McNamee Field (baseball): outfield grass, infield dirt, bases.
    green(62, 112, -26, 46);
    const home = [66, 10], diamond = s2 => [[home[0], home[1]], [home[0] + s2 * .707, home[1] - s2 * .707], [home[0] + s2 * 1.414, home[1]], [home[0] + s2 * .707, home[1] + s2 * .707]];
    b.poly('trim', f, diamond(26).map(([x, z]) => [x, .16, z]), diamond(26).map(([x, z]) => [x, z]), [0, 1, 0], '#b98f63', [0, 0, 0, 0]);
    b.poly('trim', f, diamond(19).map(([x, z]) => [x + 3.6, .18, z]), diamond(19).map(([x, z]) => [x, z]), [0, 1, 0], '#5d8a45', [0, 0, 0, 0]);
    b.box('trim', f, 63.5, 2.5, 10, .2, 5, 16, '#2a2d30');                                   // backstop
    for (let k = 0; k < 3; k++) b.box('trim', f, 58 - k * .9, .5 + k * .5, -8 - k * .1, .9, .25, 12, '#9aa0a6');   // bleachers
    // The football field and track.
    const cx = 142, cz = 4, P = (a, rx, rz, y) => [cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz], n = 40;
    for (let k = 0; k < n; k++) {
      const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2;
      b.poly('trim', f, [P(a0, 23, 44, .16), P(a1, 23, 44, .16), P(a1, 29, 50, .16), P(a0, 29, 50, .16)], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0], '#9b3b2f', [0, 0, 0, 0]);
    }
    const inner = []; for (let k = 0; k < n; k++) inner.push(P(k / n * Math.PI * 2, 23, 44, .18));
    b.poly('trim', f, inner, inner.map(q => [q[0], q[2]]), [0, 1, 0], '#4f8a3a', [0, 0, 0, 0]);
    for (let k = -5; k <= 5; k++) b.box('trim', f, cx, .2, cz + k * 7.2, 30, .02, .18, '#f4f4f0');   // yard lines
    for (let k = 0; k < 6; k++) b.box('wall', f, 112 + k * 1, .6 + k * .6, cz, 1, 1.2 + k * 1.2, 70, '#bcb6ab', [0, 3, 3, 0]);   // home stands
    b.box('wall', f, 118.5, 9.5, cz, 3, 3.4, 22, CREAMW, [W.ribbon, 3.4, 3, 3]);                   // press box
    b.box('trim', f, 118.5, 11.4, cz, 3.4, .3, 22.4, BLUE);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      b.box('trim', f, cx + sx * 26, 11, cz + sz * 36, .6, 22, .6, '#8e9296');
      b.box('glow', f, cx + sx * 26, 22, cz + sz * 36, 3.6, 2, .5, '#fff4d8');
    }
    // Tennis courts and the upper (softball) field.
    for (let k = 0; k < 4; k++) {
      b.slab('trim', f, 174, 186, -60 + k * 12, -50 + k * 12, .14, '#3f7d6a');
      b.box('trim', f, 180, .6, -55 + k * 12, .05, 1, 9.6, '#f4f4f0');
    }
    b.box('trim', f, 180, 1.8, -62, 13, 3.6, .08, '#3a3d40');
    green(188, D - 1, -60, 30, '#6a9a4c');
    b.poly('trim', f, [[190, .16, 12], [198, .16, 4], [198, .16, 20]], [[0, 0], [1, 0], [0, 1]], [0, 1, 0], '#b98f63', [0, 0, 0, 0]);
    // Parking: the west and east lots, with cars in them.
    b.slab('lot', f, 22, 110, -Wd / 2, -Wd / 2 + 11, .1, '#ffffff');
    b.slab('lot', f, 50, 104, Wd / 2 - 11, Wd / 2, .1, '#ffffff');
    const stallsAlong = (x0, x1, z, face) => { const ca = Math.cos(f.a), sa = Math.sin(f.a), out = lot.parking || (lot.parking = []);
      for (let lx = x0 + 1.4; lx <= x1 - 1.4; lx += 2.75) out.push([f.x + lx * ca + z * sa, f.y + .1, f.z - lx * sa + z * ca, Math.atan2(sa * face, ca * face)]); };
    stallsAlong(24, 108, -Wd / 2 + 3, 1); stallsAlong(52, 102, Wd / 2 - 3, -1);
    // Flagpole on the front lawn.
    b.box('trim', f, 4, 6, 14, .18, 12, .18, '#d8dadc');
    b.box('trim', f, 4, 11.2, 15.1, .04, 1.2, 2, BLUE);
    boxes.push({lot, h: 14, lx0: 8, lx1: 64, w: 130});
  },
  library(b, lot, boxes, signIdx = 57) {
    // San Marino: a Beaux-Arts library mansion of pale stone with a
    // balustrade and portico, behind formal gardens, hedges and a fountain.
    const f = lotFrame(lot, lot.hi + .2), D = lot.depth, Wd = lot.width, stone = '#efe7d8', H = 13;
    const hx = D * .62;
    b.box('wall', f, hx, H / 2, 0, 26, H, 72, stone, [W.punched, 4.4, 3.2, 71]);
    for (const s of [-1, 1]) b.box('wall', f, hx + 10, H / 2, s * 40, 44, H, 14, stone, [W.punched, 4.4, 3.2, 73]);
    b.box('trim', f, hx - .3, H + .6, 0, 27, 1.2, 73, '#e2d8c4');                                   // balustrade
    b.hip('trim', f, hx, H + 1.2, 0, 24, 70, 3, pick(SLATE, rng(9)), .2);
    for (let k = 0; k < 6; k++) b.prism('wall', f, circle(hx - 16, -10 + k * 4, .7, 10), 0, H - 1, '#f6f1e6', [0, 3, 3, 0], [0, 0, 0, 0], {smooth: true});
    b.box('trim', f, hx - 16, H - .5, 0, 3, 1.2, 24, '#e2d8c4');
    b.gable('trim', f, hx - 16, H, 0, 3, 24, 3.4, '#e2d8c4');
    // Gardens: lawns in a formal grid, hedges, gravel walks, a round fountain.
    b.slab('trim', f, 4, hx - 17, -Wd * .42, Wd * .42, .08, '#d9d0bd');
    for (const sz of [-1, 1]) for (const sx of [0, 1]) {
      const x0 = 8 + sx * (hx - 25) / 2, x1 = x0 + (hx - 25) / 2 - 4, z0 = sz > 0 ? 6 : -Wd * .38, z1 = sz > 0 ? Wd * .38 : -6;
      b.slab('trim', f, x0, x1, z0, z1, .12, '#5d8a45');
      b.box('trim', f, (x0 + x1) / 2, .6, sz > 0 ? z1 : z0, x1 - x0, 1.2, .9, '#35532e');
    }
    b.prism('trim', f, circle((hx - 17) / 2 + 2, 0, 6, 20), 0, .9, '#cfc3aa');
    b.prism('pool', f, circle((hx - 17) / 2 + 2, 0, 5.2, 20), .9, .92, '#ffffff');
    b.sign('signs', f, 3.5, 1.4, -Wd * .42 + 6, 8, 2, signIdx);
    foundation(b, f, lot, '#b9ae9c', hx - 13, 30, 76);
    boxes.push({lot, h: H + 3, lx0: hx - 20, lx1: hx + 32, w: 94});
  },
};
