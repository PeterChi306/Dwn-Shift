/* The Pacific (2026-09-27). Los Santerra ends at the ocean on its south side:
 * the southern basin eases down to beach level, the boundary road along
 * z = 3880 is the beachfront boulevard, then a wide sand beach, the surf
 * line and open sea past the edge of the map.
 *
 * Pure functions, no three.js: the terrain worker, the height workers, the
 * road model, the water shader (which mirrors shoreZ in TSL) and the tools
 * all read the same coast.
 *
 * Roads keep their shape. tools/add_coast.mjs lowered every road node by the
 * same `coastShift` the ground gets here, measured from the ground BEFORE the
 * coast, so each road sits exactly as high over the new ground as it did over
 * the old (roads.json carries `coast: 1` so it is never applied twice).
 */
export const SEA_Y = 0;
export const LAND_Y = 4.5;            // the basin at the beachfront road
export const COAST_ROAD_Z = 3880;     // the beachfront boulevard's centreline
export const BEACH_Z = 3906;          // sand starts past its southern pavement
const RAMP0 = 2650, RAMP1 = 3850;     // the basin eases to LAND_Y between these

const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A headland south of Exposition Park: the Coliseum stands on it by the sea. */
const HEAD = [-2640, -2480, -1990, -1830, 230];
export function headland(x) { return HEAD[4] * smooth(HEAD[0], HEAD[1], x) * (1 - smooth(HEAD[2], HEAD[3], x)); }
/** Where the sand starts (past the beachfront road; further out on the headland). */
export const beachZ = x => BEACH_Z + headland(x);
/** The waterline: a wide beach with gentle bays and points. */
export function shoreZ(x) {
  return 4045 + 48 * Math.sin(x / 1100 + .4) + 21 * Math.sin(x / 430 + 2.1) + headland(x);
}
/** How far the basin is pulled down toward LAND_Y at (x, z), given the
 *  ground there before the coast. Roads were shifted by the same amount. */
export function coastShift(x, z, base) {
  const t = smooth(RAMP0, RAMP1, z);
  return t ? t * (LAND_Y - base) : 0;
}
/** Beach and seabed, south of the beachfront road (else null). */
function shoreHeight(x, z) {
  const bz = beachZ(x);
  if (z <= bz) return null;
  const s = shoreZ(x);
  if (z < s) {
    // Dry sand, a low berm, then a steadier fall to the water's edge.
    const u = (z - bz) / (s - bz);
    const dunes = .35 * Math.sin(x * .031 + z * .017) * Math.sin(x * .013 - z * .041) * (1 - u) * smooth(0, .15, u);
    return LAND_Y + (.25 - LAND_Y) * u ** 1.7 + dunes;
  }
  const d = z - s;
  return Math.max(-42, .25 - d * .045 - Math.max(0, d - 90) * .06);
}
/** Ground before roads touch it, with the coast applied. */
export function coastal(x, z, base) {
  if (z < RAMP0) return base;
  const land = base + coastShift(x, z, base);
  const sh = shoreHeight(x, z);
  // A short blend from the flat land onto the sand, so there is no crease.
  const bz = beachZ(x);
  return sh === null ? land : land + (sh - land) * smooth(bz, bz + 6, z);
}
/** 0 inland, 1 on the sand or under the sea (for colour, plants and lots). */
export function beachAt(x, z) { const bz = beachZ(x); return smooth(bz - 4, bz + 4, z); }
/** Is (x, z) under water, and how deep? */
export function seaDepth(x, z, groundY) { return z > shoreZ(x) - 40 ? SEA_Y - groundY : 0; }
