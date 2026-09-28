/* The Hollywood Hills (2026-09-27): mountain mansions along Mulholland and
 * the ridge roads, and the hills round Mount Lee that had no houses at all.
 *
 * Two new hillside builders, merged into buildings.js's tables like city.js:
 *   cliffhouse  a modern house hung off the hillside: garage and entry at the
 *               street, a glass living floor cantilevered toward the view, a
 *               bedroom box on top, a deck with an infinity pool and a glass
 *               balustrade, steel stilts and a stone base down to the slope;
 *   pavilion    a Case Study glass pavilion (the Stahl House is the model):
 *               an L of floor-to-ceiling glass under a thin flat roof with
 *               exposed beams, a pool in the crook of the L, a carport.
 * Both read lot.fall (fit() records it: how far the ground drops from the
 * street edge of the lot to its back) to put the view side downhill, and
 * always reach the ground: nothing floats on a slope.
 */
import {rng, pick, W, lotFrame} from './buildings.js';

/** Hills round Mount Lee and the east end of Mulholland (WeHo's own hills lie west of x -1900). */
export const HILLS = {name: 'hills', x0: -3400, x1: -300, z0: -3600, z1: -1800};
/** Kept clear for the Hollywood sign and the Mount Lee overlook (world/places.js). */
export const SUMMIT = [{x: -1180, z: -3300, r: 300}];

export const HILL_SIZE = {
  cliffhouse: r => ({width: 32 + r() * 12, depth: 24 + r() * 8, setback: 4 + r() * 3, gap: 10 + r() * 18}),
  pavilion: r => ({width: 30 + r() * 10, depth: 22 + r() * 6, setback: 4 + r() * 3, gap: 10 + r() * 18}),
};
/** Mansions join the hill zone everywhere (WeHo's hills too). */
export const HILL_VARIANTS = [['cliffhouse', 2.6], ['pavilion', 2], ['mansionModern', 1.1], ['mansionMed', 1.1]];

const WHITE = ['#f4f3ef', '#eeebe4', '#e4e0d7'], DARK = ['#2b2c2e', '#3a3835', '#23262a'], STONE = ['#b6ab98', '#a39883', '#c2b8a6', '#8e8676'];
const WOODS = ['#8a5f3c', '#9c6b43', '#6f4a2e'];

/** A horizontal face looking DOWN (the underside of a deck or cantilever). */
function under(b, mat, f, x0, x1, z0, z1, y, color) {
  b.poly(mat, f, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, -1, 0], color, [0, 0, 0, 0]);
}
/** A column from the ground (y0, below the frame) up to y1. */
function post(b, f, x, z, y0, y1, s = .35, color = '#3a3a3a') {
  if (y1 - y0 > .05) b.box('trim', f, x, (y0 + y1) / 2, z, s, y1 - y0, s, color);
}
/** Driveway from the kerb (road height) up or down to y at local x1. */
function drive(b, f, lot, x1, z0, z1, y = .06) {
  const x0 = -lot.spec.setback - .5, y0 = Math.min(1.5, Math.max(-4, lot.frontY - f.y + .12));
  b.poly('trim', f, [[x0, y0, z0], [x1, y, z0], [x1, y, z1], [x0, y0, z1]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0], '#cfc8bb', [0, 0, 0, 0]);
  // Its sides, down to the ground, so a raised drive is a ramp and not a plank.
  const g = lot.lo - f.y - .3;
  for (const z of [z0, z1]) b.poly('trim', f, [[x0, y0, z], [x1, y, z], [x1, g, z], [x0, g, z]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 0, z === z0 ? -1 : 1], '#bdb5a6', [0, 0, 0, 0]);
}
/** Glass balustrade: a thin run of curtain glass with a steel cap. */
function glassRail(b, f, x, z0, z1, y, alongX = false, len = 0) {
  if (alongX) {
    b.box('wall', f, x + len / 2, y + .55, z0, len, 1.1, .06, '#a9bcc4', [W.curtain, 1.1, 1.2, 5]);
    b.box('trim', f, x + len / 2, y + 1.12, z0, len, .06, .1, '#d9dcdf');
  } else {
    b.box('wall', f, x, y + .55, (z0 + z1) / 2, .06, 1.1, z1 - z0, '#a9bcc4', [W.curtain, 1.1, 1.2, 5]);
    b.box('trim', f, x, y + 1.12, (z0 + z1) / 2, .1, .06, z1 - z0, '#d9dcdf');
  }
}

export const HILL_BUILD = {
  cliffhouse(b, lot, boxes) {
    const r = rng(lot.seed), D = lot.depth, Wd = lot.width, downhill = (lot.fall ?? 1) > 0;
    // Downhill lot: the street level is the house's top of slope, the view
    // is at the back. Uphill lot: a podium with the garage in it, the house
    // sits up on the slope and looks back out over the street.
    const f = lotFrame(lot, downhill ? lot.frontY + .3 : lot.hi + .2), ground = lot.lo - f.y - .2;
    const wall = pick(WHITE, r), accent = pick(r() < .5 ? DARK : WOODS, r), stone = pick(STONE, r), fh = 3.7;
    const side = r() < .5 ? -1 : 1;                                       // garage end
    // Stone base: retaining walls under the whole house down to the slope.
    if (ground < -.3) b.box('wall', f, D * .42, ground / 2, 0, D * .66, -ground, Wd * .8, stone, [0, 3, 3, 0]);
    // Street level: garage and entry, dark timber-clad.
    const gz = side * Wd * .25;
    b.box('wall', f, 5, fh / 2, gz, 8, fh, Wd * .42, accent, [W.slats, fh, 3, lot.seed % 97]);
    b.box('trim', f, .96, 1.35, gz, .1, 2.7, Wd * .34, '#2a2a2a');         // garage door
    for (let k = 1; k < 5; k++) b.box('trim', f, .92, k * .54, gz, .04, .04, Wd * .34, '#555');
    drive(b, f, lot, 1, gz - Wd * .19, gz + Wd * .19);
    // Main floor: glass on every side that looks out, cantilevered over the base.
    const m0 = 3, m1 = D * .78;
    b.box('wall', f, (m0 + m1) / 2, fh / 2, -side * Wd * .06, m1 - m0, fh, Wd * .74, wall, [W.curtain, fh, 2.4, lot.seed % 961]);
    b.box('trim', f, (m0 + m1) / 2 + .8, fh + .15, -side * Wd * .06, m1 - m0 + 1.6, .3, Wd * .74 + 1.6, wall);   // thin floor slab edge
    // Upper box, turned and slid over the lower one: bedrooms, deep roof overhang.
    const u0 = D * .18, u1 = D * .62, uz = side * Wd * .12;
    b.box('wall', f, (u0 + u1) / 2, fh * 1.5 + .3, uz, u1 - u0, fh, Wd * .56, pick(r() < .5 ? WHITE : DARK, r), [W.ribbon, fh, 3.2, lot.seed % 953]);
    b.box('trim', f, (u0 + u1) / 2 + .6, fh * 2 + .45, uz, u1 - u0 + 3, .3, Wd * .56 + 2.4, '#f2f1ed');
    // Deck and infinity pool at the view end, a glass balustrade round it.
    const d0 = m1, d1 = D - .4, dz0 = -Wd * .42, dz1 = Wd * .42;
    b.box('trim', f, (d0 + d1) / 2, -.25, 0, d1 - d0, .5, dz1 - dz0, '#d8d2c4');
    under(b, 'trim', f, d0, d1, dz0, dz1, -.5, '#b9b2a4');
    const pz0 = side > 0 ? dz0 + 1 : 0, pz1 = side > 0 ? 0 : dz1 - 1;
    b.slab('pool', f, d0 + 1, d1 - .6, pz0, pz1, .02, '#ffffff');
    glassRail(b, f, d1, dz0, dz1, 0);
    glassRail(b, f, d0, dz0, 0, 0, true, d1 - d0);
    glassRail(b, f, d0, dz1, 0, 0, true, d1 - d0);
    // Stilts: steel columns from the deck and the cantilever down to the slope.
    for (const x of [m1 - 2, (m1 + d1) / 2, d1 - .6]) for (const z of [dz0 + .6, 0, dz1 - .6]) post(b, f, x, z, ground, -.5, .4);
    // Lounge furniture on the deck, a fire pit.
    for (let k = 0; k < 3; k++) b.box('trim', f, d0 + 1.6, .25, (side > 0 ? 1.5 : -1.5) + side * k * 1.4, 2, .3, .8, '#f0ede6');
    b.box('trim', f, d0 + 2.4, .2, side * Wd * .3, 1.2, .4, 1.2, '#4a4540');
    boxes.push({lot, h: fh * 2 + .6, lx0: 0, lx1: D, w: Wd * .8});
  },

  pavilion(b, lot, boxes) {
    const r = rng(lot.seed), D = lot.depth, Wd = lot.width, downhill = (lot.fall ?? 1) > 0;
    const f = lotFrame(lot, downhill ? lot.frontY + .3 : lot.hi + .2), ground = lot.lo - f.y - .2, H = 3.3;
    const s = r() < .5 ? -1 : 1, roof = '#f5f4f0', glass = '#dfe4e2';
    // The L: a long wing running out toward the view, a short one across it.
    const a0 = 3, a1 = D * .9, az0 = s > 0 ? -Wd * .44 : Wd * .44 - 9, az1 = az0 + 9;
    b.box('wall', f, (a0 + a1) / 2, H / 2, (az0 + az1) / 2, a1 - a0, H, 9, glass, [W.curtain, H, 2.6, lot.seed % 961]);
    const b0 = D * .66, cz0 = s > 0 ? az1 : -Wd * .38, cz1 = s > 0 ? Wd * .38 : az0;
    b.box('wall', f, (b0 + a1) / 2, H / 2, (cz0 + cz1) / 2, a1 - b0, H, cz1 - cz0, glass, [W.curtain, H, 2.6, lot.seed % 953]);
    // Thin flat roofs with deep overhangs, exposed beams running past them.
    b.box('trim', f, (a0 + a1) / 2 + .6, H + .18, (az0 + az1) / 2, a1 - a0 + 3.4, .36, 12, roof);
    b.box('trim', f, (b0 + a1) / 2 + .6, H + .18, (cz0 + cz1) / 2, a1 - b0 + 3.4, .36, cz1 - cz0 + 3, roof);
    for (let x = a0 + 1; x < a1 + 1.5; x += 2.2) b.box('trim', f, x, H + .02, (az0 + az1) / 2, .22, .3, 12.6, '#e9e7e1');
    // Terrace and pool in the crook of the L, cantilevered where the hill falls.
    const t0 = a0 + 1, t1 = b0 - .5, tz0 = s > 0 ? az1 : -Wd * .42, tz1 = s > 0 ? Wd * .42 : az0;
    b.box('trim', f, (t0 + t1) / 2, -.2, (tz0 + tz1) / 2, t1 - t0, .4, tz1 - tz0, '#d9d3c6');
    under(b, 'trim', f, t0, t1, tz0, tz1, -.4, '#bab3a5');
    b.slab('pool', f, t0 + 2, t1 - 2, tz0 + (s > 0 ? 2 : 1.5), tz1 - (s > 0 ? 1.5 : 2), .02, '#ffffff');
    glassRail(b, f, t0, tz0, tz1, 0);
    // Glass balustrade along the view end.
    glassRail(b, f, a1 + 1.4, Math.min(az0, cz0) - .6, Math.max(az1, cz1) + .6, 0);
    b.box('trim', f, a1 + .7, -.2, (Math.min(az0, cz0) + Math.max(az1, cz1)) / 2, 1.4, .4, Math.max(az1, cz1) - Math.min(az0, cz0) + 1.2, '#d9d3c6');
    // Columns under both wings and the terrace.
    for (let x = a0 + 2; x < a1 + 1; x += 5) for (const z of [az0 + .5, az1 - .5]) post(b, f, x, z, ground, 0, .3, '#2e2e2e');
    for (let x = b0 + 1; x < a1; x += 5) post(b, f, x, cz0 + (cz1 - cz0) * (s > 0 ? .9 : .1), ground, 0, .3, '#2e2e2e');
    for (let x = t0 + 2; x < t1; x += 5) post(b, f, x, (tz0 + tz1) / 2, ground, -.4, .3, '#2e2e2e');
    // Carport at the street: a flat roof on four posts, the drive under it.
    const cpz = s > 0 ? Wd * .22 : -Wd * .22;
    b.box('trim', f, 3.2, 2.8, cpz, 6.4, .25, 7, roof);
    for (const x of [.6, 5.8]) for (const z of [-3, 3]) post(b, f, x, cpz + z, ground < 0 ? Math.max(ground, -.2) : 0, 2.7, .18, '#2e2e2e');
    drive(b, f, lot, 6.4, cpz - 3.2, cpz + 3.2);
    b.box('wall', f, 2.2, -1, 0, 4.4, 2.2, Wd * .9, '#b3aa98', [0, 3, 3, 0]);   // the street-side retaining base
    boxes.push({lot, h: H + .5, lx0: a0, lx1: a1 + 1.4, w: Wd * .8});
  },
};
