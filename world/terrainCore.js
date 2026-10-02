/* Terrain tile arrays: heights, normals, colours and triangles, with no
 * three.js in sight, so the same code runs on the main thread and in the
 * terrain worker (world/terrainWorker.js). terrain.js turns the arrays into
 * meshes.
 */
import {TILE, VERGE} from './roads.js';
import {terrainHeight} from './network.js';
import {beachAt, SEA_Y} from './coast.js';

export const BOUNDS = {x0: -7680, x1: 7680, z0: -5120, z1: 5120};
export const LOD_STEP = [2, 4, 8];

/** 0 on the flat basin, 1 in the hills (by the landform's rise above the basin). */
function hillMask(x, z) {
  const px = x / 10 + 768, py = z / 10 + 512, basin = 6 + .030 * px + .016 * (1024 - py);
  let m = Math.min(1, Math.max(0, (terrainHeight(x, z) - basin - 8) / 40));
  // Pasadena, San Marino and Eagle Rock sit on a high plateau but are leafy
  // city, not chaparral: the city palette unless it climbs well above it.
  // Mirrors PASADENA in world/pasadena.js (not imported: this runs in a worker).
  const pas = inRect(x, z, 800, 3900, -4450, -1600) || inRect(x, z, 3900, 5800, -3000, -1100) || inRect(x, z, 2050, 3500, -1750, -150);
  if (pas) m = Math.min(1, Math.max(0, (terrainHeight(x, z) - 280) / 60));
  return m;
}
const inRect = (x, z, x0, x1, z0, z1) => x > x0 && x < x1 && z > z0 && z < z1;

const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255].map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
const LAWN = hex('#6f8c46'), DRYLAWN = hex('#9a9a5a'), GRASS = hex('#a8925a'), BRUSH = hex('#4d5a38'), SOIL = hex('#b5a07c'), ROCK = hex('#8f8272');
const SAND = hex('#e3cfa6'), WETSAND = hex('#a8926c'), SEABED = hex('#8a7a5c'), PAVED = hex('#a29c90'), ASPHALT = hex('#6c6964'), DIRT = hex('#9c8f76');
/** Downtown is paved, not lawn: 0 outside, 1 inside (a soft 180 m edge).
 *  Mirrors DOWNTOWN in world/city.js (not imported: this runs in a worker). */
function urban(x, z) {
  const e = Math.min(x + 300, 2950 - x, z - 450, 2950 - z);
  return Math.min(1, Math.max(0, e / 180));
}
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Palette, after the real place. Flat city: irrigated lawns, patchy, some
 *  gone dry. Hills: a patchwork of dark olive chaparral (thickest on the
 *  moister north-facing slopes), golden dry grass on open sunny slopes, pale
 *  soil on the ridge tops, and rock where it is too steep for anything. */
const pnoise = (x, z, s) => { const v = Math.sin(x * s + Math.sin(z * s * 1.3) * 1.7) * Math.cos(z * s * .9 - Math.sin(x * s * .7) * 1.3); return v * .5 + .5; };
/** Writes the vertex colour at out[i..i+2]; returns how wild the ground is
 *  (0 lawn/city/beach .. 1 open hillside), which the ground shader uses to lay
 *  chaparral, dry grass and bare soil over it at metre scale. */
function paint(out, i, y, slope, x, z, nz, hill) {
  const patch = pnoise(x, z, .011) * .6 + pnoise(x + 400, z - 300, .037) * .4;
  let c;
  if (hill < .05) {
    c = lerp(LAWN, DRYLAWN, Math.max(0, patch - .45) * 1.4);
    const u = urban(x, z);
    if (u > 0) {
      // Lots of concrete and parking asphalt, the odd patch of dry verge.
      const lot = pnoise(x - 900, z + 200, .045), city = lerp(lerp(PAVED, ASPHALT, lot > .58 ? .85 : .1), DIRT, Math.max(0, patch - .7) * 1.6);
      c = lerp(c, city, u * .92);
    }
  }
  else {
    const north = Math.max(0, -nz);
    const brush = Math.min(1, Math.max(0, patch * 1.35 - .25 + north * .9 + (y < 120 ? .15 : 0)));
    c = lerp(GRASS, BRUSH, brush);
    c = lerp(c, SOIL, Math.max(0, .5 - slope * 3) * Math.max(0, patch - .6) * 1.5);
    c = lerp(c, ROCK, Math.min(1, Math.max(0, slope - .45) * 2.2) * .85);
    c = lerp(c, LAWN, 1 - hill);
  }
  // The beach: pale dry sand, darker where the surf wets it, seabed below.
  const b = beachAt(x, z);
  if (b > 0) {
    const ripple = pnoise(x, z, .09) * .08;
    const sand = y < SEA_Y - .3 ? SEABED : lerp(WETSAND, SAND, Math.min(1, Math.max(0, (y - SEA_Y - .25) / 1.1)));
    c = lerp(c, sand.map(v => v * (.96 + ripple)), b);
  }
  const v = .92 + .1 * Math.sin(x * .0021) * Math.cos(z * .0017) + .05 * Math.sin(x * .011 + z * .009);
  out[i] = c[0] * v; out[i + 1] = c[1] * v; out[i + 2] = c[2] * v;
  return hill * (1 - b);
}

/** Grid arrays for an n x n cell patch at `step` metres, with optional skirt and tunnel holes. */
export function gridArrays(ground, x0, z0, step, n, extra, {skirt = 0, holes = false, grassy = holes} = {}) {
  const m = n + 3, H = new Float32Array(m * m);
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) H[j * m + i] = ground.height(x0 + (i - 1) * step, z0 + (j - 1) * step, extra);
  const N = n + 1, count = N * N + (skirt ? 4 * n : 0);
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3), wild = new Float32Array(count);
  const at = (i, j) => H[(j + 1) * m + (i + 1)];
  let v = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++, v++) {
    const x = x0 + i * step, z = z0 + j * step, y = at(i, j);
    const nx = at(i - 1, j) - at(i + 1, j), nz = at(i, j - 1) - at(i, j + 1), ny = 2 * step;
    const l = Math.hypot(nx, ny, nz);
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    nor[v * 3] = nx / l; nor[v * 3 + 1] = ny / l; nor[v * 3 + 2] = nz / l;
    wild[v] = paint(col, v * 3, y, 1 - ny / l, x, z, nz / l, hillMask(x, z));
  }
  const hole = holes ? new Uint8Array(N * N) : null;
  if (holes && ground.anyTunnelNear(x0 + n * step / 2, z0 + n * step / 2, n * step))
    for (let k = 0; k < N * N; k++) hole[k] = ground.tunnelCover(pos[k * 3], pos[k * 3 + 2], pos[k * 3 + 1]);
  // Grass density per grid vertex (detailed tiles only): wild ground, off the
  // road and its verge, off junctions and pads, not on rock-steep slopes.
  const grass = grassy ? new Float32Array(N * N) : null;
  if (grass) for (let k = 0; k < N * N; k++) {
    if (wild[k] < .05 || (hole && hole[k])) continue;
    const x = pos[k * 3], z = pos[k * 3 + 2], ny = nor[k * 3 + 1];
    let d = wild[k] * Math.min(1, Math.max(0, (ny - .6) / .12));
    if (d <= 0) continue;
    const r = ground.model.nearest(x, z, null, true);
    if (r) d *= Math.min(1, Math.max(0, (r.d - r.h - (VERGE[r.seg.kind] ?? 1.5) - .4) / 2.5));
    if (d > 0) for (const j of ground.model.junctionsNear(x, z)) if (Math.hypot(x - j.x, z - j.z) < j.radius + 4) { d = 0; break; }
    if (d > 0 && ground.onPad(x, z)) d = 0;
    grass[k] = d;
  }
  const index = [], solid = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    // Diagonal b-c, matching tools/check_roads.mjs's seating model.
    for (const tri of [[a, c, b], [b, c, d]]) {
      const cover = hole ? Math.max(hole[tri[0]], hole[tri[1]], hole[tri[2]]) : 0;
      if (cover < 2) index.push(tri[0], tri[1], tri[2]);
      if (cover < 1) solid.push(tri[0], tri[1], tri[2]);
    }
  }
  if (skirt) {
    // Rim walk, each rim vertex duplicated `skirt` metres down, so tiles of
    // different resolution never show a crack between them.
    const rim = [];
    for (let i = 0; i < n; i++) rim.push(i);
    for (let j = 0; j < n; j++) rim.push(j * N + n);
    for (let i = n; i > 0; i--) rim.push(n * N + i);
    for (let j = n; j > 0; j--) rim.push(j * N);
    const base = v;
    for (const r of rim) {
      pos[v * 3] = pos[r * 3]; pos[v * 3 + 1] = pos[r * 3 + 1] - skirt; pos[v * 3 + 2] = pos[r * 3 + 2];
      nor[v * 3] = nor[r * 3]; nor[v * 3 + 1] = nor[r * 3 + 1]; nor[v * 3 + 2] = nor[r * 3 + 2];
      col[v * 3] = col[r * 3] * .8; col[v * 3 + 1] = col[r * 3 + 1] * .8; col[v * 3 + 2] = col[r * 3 + 2] * .8; wild[v] = wild[r];
      v++;
    }
    // A skirt is a curtain hung 6-14 m down from the tile's edge: where that
    // edge crosses a tunnel it hung straight into the tube as a wall of earth
    // (the block inside the Cahuenga bore). Not there.
    const nearTunnel = ground.anyTunnelNear(x0 + n * step / 2, z0 + n * step / 2, n * step);
    const curtain = nearTunnel ? rim.map(r => (hole && hole[r]) || ground.tunnelCover(pos[r * 3], pos[r * 3 + 2], pos[r * 3 + 1] - skirt) ? 1 : 0) : null;
    for (let k = 0; k < rim.length; k++) {
      const k2 = (k + 1) % rim.length, a = rim[k], b = rim[k2], a2 = base + k, b2 = base + k2;
      if (curtain && (curtain[k] || curtain[k2])) continue;
      index.push(a, b, a2, b, b2, a2);
    }
  }
  return {pos: pos.slice(0, v * 3), nor: nor.slice(0, v * 3), col: col.slice(0, v * 3), wild: wild.slice(0, v),
    index: new Uint32Array(index), solid: new Uint32Array(solid), vertices: pos.slice(0, N * N * 3), grass};
}

/** A detailed tile. lod 0 carries physics triangles and grass; every lod has
 *  the tunnel holes (a coarse tile without them plugged the far end of a long
 *  straight bore with hillside until you drove up to it). */
export function tileArrays(ground, tx, tz, lod) {
  const step = LOD_STEP[lod], n = TILE / step;
  return gridArrays(ground, tx * TILE, tz * TILE, step, n, lod ? step * .75 : 0, {skirt: 6 + step, holes: true, grassy: lod === 0});
}

/** The 32 m far mesh, in bands. */
export function farBands(ground) {
  const step = 32, nx = (BOUNDS.x1 - BOUNDS.x0) / step, nz = (BOUNDS.z1 - BOUNDS.z0) / step, band = 40, out = [];
  for (let j0 = 0; j0 < nz; j0 += band) for (let i0 = 0; i0 < nx; i0 += band) {
    const n = Math.min(band, nx - i0, nz - j0);
    out.push(gridArrays(ground, BOUNDS.x0 + i0 * step, BOUNDS.z0 + j0 * step, step, n, 24));
  }
  return out;
}
