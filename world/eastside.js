/* The rest of the basin (2026-09-27): Silver Lake and Echo Park, the
 * Eastside and the San Gabriel Valley, South LA round Exposition Park, and
 * Culver City. Merged into buildings.js's tables like city.js.
 *
 * Silver Lake / Echo Park: hillside houses on the steep residential streets
 *   (modernist boxes on stilts, mid-century pavilions, Spanish villas),
 *   bungalows and courtyard apartments below, cafes and small shops on
 *   Sunset, Silver Lake and Glendale boulevards.
 * The Eastside (Lincoln Heights, Boyle Heights, East Los Santerra): Craftsman
 *   bungalows, and on the boulevards single-storey shops painted in strong
 *   colours with hand-lettered signs: panaderias, mercados, taquerias.
 * San Gabriel Valley (Alhambra, Monterey Park, El Monte): strip malls and
 *   dim sum palaces on the long boulevards, El Monte's auto row, ranch houses
 *   on the side streets, tilt-up warehouses by the freeways.
 * South LA: Craftsman and Spanish bungalows and dingbats, avenues of shops
 *   and mini-malls, the brick campus by Exposition Park, the Coliseum and the
 *   natural history museum, warehouses toward the rail yards.
 * Culver City: the studio lot (sound stages behind a gate), a small
 *   streamline-moderne downtown, ranch and Spanish houses.
 */
import {rng, pick, W, stalls, lotFrame, baseOf, roofClutter, foundation, shopSign, bladeSign,
  STUCCO, PASTEL, BRICK, TILE_RED} from './buildings.js';
import {PAS_BUILD} from './pasadena.js';
import {SIGN} from './signs.js';

export const EASTSIDE_PARTS = [
  {name: 'silverlake', x0: -300, x1: 2050, z0: -1800, z1: 450},
  {name: 'eastside', x0: 2950, x1: 3500, z0: -150, z1: 900},          // Lincoln Heights
  {name: 'eastside', x0: 3500, x1: 6000, z0: -1100, z1: 900},         // Alhambra
  {name: 'eastside', x0: 6000, x1: 7600, z0: -1400, z1: 1100},        // El Monte
  {name: 'eastside', x0: 2950, x1: 7600, z0: 900, z1: 2600},          // Boyle Heights, Monterey Park
  {name: 'eastside', x0: 2950, x1: 7600, z0: 2600, z1: 4200},         // East Los Santerra
  {name: 'southla', x0: -3400, x1: 2950, z0: 2950, z1: 4600},
  {name: 'culver', x0: -7400, x1: -3400, z0: 2950, z1: 4600},
];
export const EAST_NAMES = new Set(['silverlake', 'eastside', 'southla', 'culver']);
/** Zones that never get a backhouse behind them. */
export const EAST_NO_REAR = new Set(['studio', 'industrial', 'hillside']);

const EXPO = {x: -2480, z: 3560}, STUDIO = {x: -5150, z: 3120}, CULVER_DT = {x: -5850, z: 3350};
const near = (c, x, z, r) => Math.hypot(x - c.x, z - c.z) < r;

export function eastZone(area, seg, r, x, z) {
  const name = seg.name || '', kind = seg.kind, main = kind === 'avenue' || kind === 'boulevard';
  if (kind === 'scenic') return 'hill';
  if (area === 'silverlake') {
    if (main || /Sunset|Silver Lake Boulevard|Glendale Boulevard|Echo Park Avenue|Hyperion|Vermont/.test(name))
      return r() < .5 ? 'shop' : r() < .7 ? 'eastShop' : 'apartment';
    if (kind === 'residential') return r() < .5 ? 'hillside' : r() < .8 ? 'bungalow' : 'apartment';
    return r() < .5 ? 'bungalow' : r() < .8 ? 'apartment' : 'hillside';
  }
  if (area === 'culver') {
    if (near(STUDIO, x, z, 380)) return 'studio';
    if (near(CULVER_DT, x, z, 420) && main) return r() < .45 ? 'shop' : r() < .7 ? 'moderneRow' : 'apartment';
    if (main) return r() < .5 ? 'shop' : r() < .7 ? 'sgvStrip' : 'apartment';
    return r() < .6 ? 'suburb' : r() < .85 ? 'bungalow' : 'apartment';
  }
  if (area === 'southla') {
    if (near(EXPO, x, z, 520) && kind !== 'residential') return r() < .75 ? 'campus' : 'apartment';
    if (x > 1300) return main ? (r() < .6 ? 'industrial' : 'eastShop') : (r() < .45 ? 'industrial' : 'bungalow');
    if (main) return r() < .4 ? 'eastShop' : r() < .6 ? 'shop' : r() < .8 ? 'sgvStrip' : 'apartment';
    return r() < .55 ? 'bungalow' : r() < .82 ? 'apartment' : 'suburb';
  }
  // The Eastside and the San Gabriel Valley.
  const byFreeway = seg.kind !== 'residential' && Math.abs(z - 2330) < 260 && x > 3100;          // the 10 corridor
  if (byFreeway && r() < .5) return 'industrial';
  if (x < 3500 || (z > 2600 && x < 6400)) {                                                     // Lincoln / Boyle Heights / East LS
    if (main || /Whittier|Cesar|First Street|Soto/.test(name)) return r() < .62 ? 'eastShop' : r() < .8 ? 'shop' : 'sgvStrip';
    return r() < .72 ? 'bungalow' : r() < .9 ? 'apartment' : 'suburb';
  }
  if (x > 6000 && z < 1100) {                                                                    // El Monte
    if (/Valley|Santa Anita|Garvey|Peck/.test(name)) return r() < .35 ? 'autoRow' : 'sgvStrip';
    if (main) return r() < .7 ? 'sgvStrip' : 'industrial';
    return r() < .75 ? 'suburb' : 'apartment';
  }
  if (main) return r() < .72 ? 'sgvStrip' : r() < .88 ? 'apartment' : 'shop';                  // Alhambra, Monterey Park
  return r() < .66 ? 'suburb' : r() < .88 ? 'apartment' : 'bungalow';
}

/* -------------------------------------------------------------- lot sizes */
export const EAST_SIZE = {
  soundstage: r => ({width: 36 + r() * 14, depth: 46 + r() * 16, setback: 5, gap: 6 + r() * 4}),
  warehouse: r => ({width: 30 + r() * 24, depth: 30 + r() * 16, setback: 6 + r() * 4, gap: 4 + r() * 4}),
  eastShop: r => ({width: 8 + r() * 9, depth: 14 + r() * 6, setback: .8, gap: r() < .3 ? 2.5 : .4}),
  dimSum: r => ({width: 30 + r() * 10, depth: 30 + r() * 6, setback: 1, gap: 3}),
};
export const EAST_VARIANTS = {
  hillside: [['modernist', 2.2], ['midcentury', 2], ['villa', 1], ['spanish', 1.2], ['glassPool', .6]],
  eastShop: [['eastShop', 5], ['restaurant', .6]],
  sgvStrip: [['minimall', 4], ['dimSum', 1], ['shop', 2], ['gas', .7], ['mixedUse', .8]],
  autoRow: [['dealer', 4], ['gas', 1], ['minimall', 1]],
  suburb: [['ranch', 4], ['spanish', 2], ['modernBox', .6], ['craftsman', .8]],
  industrial: [['warehouse', 5], ['loft', .8], ['garage', .2]],
  studio: [['soundstage', 1]],
  moderneRow: [['moderne', 3], ['streamline', 1.5], ['mixedUse', 1]],
};
export const EAST_LANDMARKS = [
  {variant: 'coliseum', zone: 'tower', free: true, pad: true, near: [EXPO.x + 120, EXPO.z + 60], width: 250, depth: 205, relief: 14},
  {variant: 'museum', zone: 'tower', free: true, near: [EXPO.x - 250, EXPO.z - 150], width: 170, depth: 130, relief: 8},
  {variant: 'studioGate', zone: 'tower', road: /./, near: [STUDIO.x, STUDIO.z - 330], width: 60, depth: 36, setback: 4, relief: 5},
];

const BOLD = ['#e0b44c', '#3d8a7a', '#c75b39', '#2f6aa0', '#d8577a', '#7fb35a', '#f0dcb0', '#8a4fa0', '#e67e3a', '#f2efe6'];
const TILTUP = ['#d8d2c6', '#c9c3b5', '#e6e1d6', '#bfc4c4', '#d9cdb8'];

/* -------------------------------------------------------------- builders */
export const EAST_BUILD = {
  eastShop(b, lot, boxes) {
    // One storey, painted in a strong colour with a contrasting band, a false
    // front over the roof, a hand-lettered sign and a striped awning.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base);
    const H = 4.2 + r() * 1.2, D = lot.depth, Wd = lot.width - .4, color = pick(BOLD, r), band = pick(BOLD.filter(c => c !== color), r);
    b.box('wall', f, D / 2, H / 2, 0, D, H, Wd, color, [W.shop, H, 3 + r() * 1.5, lot.seed % 977]);
    const ph = 1 + r() * 1.6;
    b.box('wall', f, .3, H + ph / 2, 0, .6, ph, Wd + .2, color);                                  // false front
    b.box('trim', f, -.02, H - .25, 0, .12, .5, Wd + .1, band);                                    // painted band
    b.box('trim', f, -.02, .35, 0, .1, .7, Wd + .1, band);                                         // base stripe
    if (r() < .75) b.box('awning', f, -.9, 3, 0, 1.8, .12, Wd * .9, pick(['#c8202c', '#1f6b3a', '#23395b', '#e0b44c', '#2b2b2b'], r));
    shopSign(b, f, r, H + ph * .45, Math.min(Wd * .75, 7), 0, r() < .55 ? SIGN.eastLA : SIGN.shop);
    if (r() < .3) bladeSign(b, f, r, H + .5, Wd / 2 - .8, SIGN.eastLA);
    roofClutter(b, f, r, D, Wd, H);
    foundation(b, f, lot, '#9a9388');
    boxes.push({lot, h: H + ph});
  },
  dimSum(b, lot, boxes) {
    // A San Gabriel Valley banquet restaurant: parking in front, a two-storey
    // hall with a green-tiled hip roof over the entrance and a big red sign.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const park = 10, bd = D - park, H = 8.5, color = pick(['#efe6d2', '#e8dcc2', '#f2ede3'], r);
    b.slab('lot', f, 0, park, -Wd / 2, Wd / 2, .08, '#ffffff');
    stalls(lot, f, park - 2.9, -Wd / 2 + 1, Wd / 2 - 3.5, 1);
    b.box('wall', f, park + bd / 2, H / 2, 0, bd, H, Wd - 2, color, [W.shop, 4.2, 3.4, lot.seed % 977]);
    b.box('wall', f, park + 2, H / 2 + .5, 0, 4, H + 1, 10, '#8e1414', [W.shop, 4.2, 3, 3]);        // red entrance pavilion
    b.hip('tile', f, park + 2, H + 1, 0, 4.4, 10.4, 2.2, '#2f7a4a', .6);
    b.box('trim', f, park + bd / 2, H + .3, 0, bd + .3, .6, Wd - 1.7, '#2f7a4a');
    b.sign('signs', f, park - .15, H - 1.6, -Wd * .25, Math.min(10, Wd * .4), 2.4, 63);
    b.box('trim', f, 1, 3.8, Wd / 2 - 2, .5, 7.6, .5, '#3a3a3a');
    for (const s of [-1, 1]) b.sign('signs', f, 1 + s * .28, 6.2, Wd / 2 - 2, 3.6, .9, pick(SIGN.sgv, r), [s, 0, 0]);
    roofClutter(b, f, r, bd, Wd - 6, H, park);
    foundation(b, f, lot, '#9a9388', park, bd, Wd);
    boxes.push({lot, h: H + 2, lx0: park, lx1: D});
  },
  warehouse(b, lot, boxes) {
    // Tilt-up concrete: a big plain box with a painted stripe, roll-up doors
    // on loading docks facing a truck court, skylights and roof units.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const H = 8 + r() * 4, court = Math.min(12, D * .3), bd = D - court, color = pick(TILTUP, r), stripe = pick(['#2f6aa0', '#c75b39', '#3d8a7a', '#6d6f73', '#b8942e'], r);
    b.slab('lot', f, 0, court, -Wd / 2, Wd / 2, .08, '#ffffff');
    if (court > 7) stalls(lot, f, 2.7, -Wd / 2 + 1, -Wd / 2 + 12, -1);                             // staff cars by the office
    b.box('wall', f, court + bd / 2, H / 2, 0, bd, H, Wd, color, [W.none, 4, 4, 0]);
    b.box('trim', f, court - .03, H - 1.2, 0, .1, .6, Wd + .02, stripe);
    for (let z = -Wd / 2 + 4; z < Wd / 2 - 3; z += 5.5) {
      b.box('trim', f, court - .05, 2.3, z, .12, 4.2, 3.6, pick(['#8f969c', '#a9adb1', '#7e858b'], r));   // roll-up door
      b.box('wall', f, court - .6, .6, z, 1.2, 1.2, 4, '#9c978d', [0, 3, 3, 0]);                       // dock
    }
    b.box('trim', f, court + .2, 3.2, -Wd / 2 + 1.5, .5, 2.6, 1.4, '#3a3f45');                          // office door canopy
    for (let k = 0; k < 3; k++) b.box('glow', f, court + bd * (.25 + k * .25), H + .15, 0, 1.6, .3, 3, '#f4f1e8');   // skylights
    roofClutter(b, f, r, bd, Wd, H, court);
    foundation(b, f, lot, '#a9a39a', court, bd, Wd);
    boxes.push({lot, h: H + 1, lx0: court, lx1: D});
  },
  soundstage(b, lot, boxes) {
    // A studio sound stage: a tall windowless shed under a shallow barrel
    // roof, an elephant door, iron stairs up the side, AC plant on the roof.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const H = 13 + r() * 5, color = pick(['#e9e2d2', '#e3d9c4', '#f0ebe0', '#d9cdb5'], r), rise = D * .08;
    b.box('wall', f, D / 2, H / 2, 0, D, H, Wd, color, [W.none, 4, 4, 0]);
    const prof = []; for (let k = 0; k <= 12; k++) { const t = k / 12, x = t * D; prof.push([x, H + Math.sin(t * Math.PI) * rise]); }
    prof.push([D, H - .01], [0, H - .01]);
    b.extrude('trim', f, prof, -Wd / 2 - .2, Wd / 2 + .2, pick(['#b8b3a8', '#a39e94', '#8f8a80'], r));
    b.box('trim', f, -.05, 5, Wd * .2, .15, 9, 8, '#6f6a60');                                         // elephant door
    b.box('trim', f, -.06, H - 2.5, -Wd * .25, .12, 3.2, 3.2, '#2b2b2b');                             // stage number plate
    for (let k = 0; k < 4; k++) b.box('trim', f, D * (.2 + k * .2), 2 + k * 2.6, -Wd / 2 - .8, 3.2, .12, 1.4, '#4b4f54');   // stairs
    b.box('trim', f, D / 2, H * .5, -Wd / 2 - 1.5, D * .8, .1, .08, '#4b4f54');
    for (let k = 0; k < 3; k++) b.box('trim', f, D * (.2 + k * .3), H + rise + .9, Wd * .2, 3, 1.8, 2.4, '#9ea3a8');
    foundation(b, f, lot, '#a39c90');
    boxes.push({lot, h: H + rise});
  },
  studioGate(b, lot, boxes) {
    // The lot's front gate: a white colonnade with the studio's name over it,
    // a guard house, and a water tower behind.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    b.box('wall', f, 3, 5, 0, 5, 10, 16, '#f2eee4', [W.arched, 5, 4, 9]);
    for (let k = -3; k <= 3; k++) b.box('wall', f, .6, 3.5, k * 2.2, .9, 7, .9, '#f6f3ea', [0, 3, 3, 0]);
    b.box('trim', f, .6, 7.3, 0, 1.4, .8, 16, '#e7e1d3');
    b.sign('signs', f, -.1, 8.8, 0, 12, 3, 60);
    b.box('wall', f, 3, 1.6, Wd / 2 - 6, 3, 3.2, 3.5, '#f2eee4', [W.punched, 3.2, 3, 1]);                 // guard house
    const tx = D * .7, tz = -Wd * .3;
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) b.box('trim', f, tx + dx, 10, tz + dz, .35, 20, .35, '#9aa0a6');
    b.prism('wall', f, [[tx - 3.4, tz - 3.4], [tx + 3.4, tz - 3.4], [tx + 3.4, tz + 3.4], [tx - 3.4, tz + 3.4]].map(([x, z]) => [x, z]), 20, 26, '#c9ccd0', [0, 3, 3, 0]);
    b.cone('trim', f, tx, 26, tz, 4.2, 2.2, '#9aa0a6', 12);
    foundation(b, f, lot, '#b2a898');
    boxes.push({lot, h: 11});
  },
  coliseum(b, lot, boxes) {
    PAS_BUILD.stadium(b, lot, boxes, 58);
    // The peristyle: a tall arch between two pylons over the east end.
    const f = lotFrame(lot, lot.lo + .3), D = lot.depth, cx = D / 2, x = cx + D * .46 - 2;
    for (const s of [-1, 1]) b.box('wall', f, x, 16, s * 12, 5, 32, 5, '#e6dcc6', [W.arched, 6, 4, 2]);
    b.box('wall', f, x, 30, 0, 5, 4, 29, '#e6dcc6', [W.arched, 4, 4, 2]);
    b.box('glow', f, x, 34, 0, 3, 3, 3, '#ffcf6a');                                               // the torch
  },
  museum(b, lot, boxes) { PAS_BUILD.library(b, lot, boxes, 59); },
};
