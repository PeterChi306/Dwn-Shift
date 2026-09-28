/* NPC vehicle bodies (2026-09-27).
 *
 * The first traffic cars were side profiles extruded across the width: flat
 * slab sides, no arches, glass the same width as the body. These are lofted
 * like the player's coupe (carBody.js), only cheaper: a skin swept along the
 * car through keyframed curves (half-width, sill, shoulder and deck heights),
 * the sill lifted into an arch over each wheel with a dark well behind it, a
 * greenhouse with tumblehome whose bands are glass or body-coloured pillars
 * by where they fall, door shut lines baked into vertex colour, and lamps,
 * grille, plates and mirrors as small parts. About 2-3k triangles a car, so
 * a full street of 140 instanced cars costs well under half a million.
 *
 * Each spec is in metres from the REAR bumper (u), heights from the ground.
 * Output geometry: forward +z, centred on the car, ground at y = 0, split per
 * material (body is vertex-coloured white so the instance colour paints it).
 */
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {curve, spline} from './carBody.js';

const SEDAN = {
  hw: [[0, .78], [.12, .88], [.55, .915], [4.2, .915], [4.65, .86], [4.8, .76]],
  sill: [[0, .3], [.3, .29], [2.4, .27], [4.5, .29], [4.8, .3]],
  belt: [[0, .86], [.2, .95], [1.2, .98], [3.5, .95], [4.4, .86], [4.8, .72]],
  deck: [[0, .88], [.15, .99], [1.05, 1.0], [3.45, .97], [4.45, .86], [4.8, .72]],
  gh: {u0: 1.02, u1: 3.48, roof: [[1.02, 1.0], [1.62, 1.39], [2.2, 1.45], [2.8, 1.43], [3.48, .97]], rear: 1.6, front: 2.82,
    windows: [[1.5, 2.3], [2.38, 3.12]], gw: .86, rw: .7},
  doors: [1.42, 2.34, 3.3],
};
const SPECS = {
  sedan: SEDAN,
  hatch: {
    hw: [[0, .8], [.1, .87], [.5, .89], [3.6, .89], [4.05, .84], [4.2, .74]],
    sill: [[0, .3], [.25, .29], [2, .27], [3.9, .29], [4.2, .3]],
    belt: [[0, .92], [.12, .98], [2.5, .96], [3.8, .86], [4.2, .7]],
    deck: [[0, .95], [.1, 1.0], [2.9, .97], [3.85, .86], [4.2, .7]],
    gh: {u0: .05, u1: 3.08, roof: [[.05, 1.0], [.22, 1.4], [.6, 1.48], [2.2, 1.49], [3.08, .97]], rear: .32, front: 2.42,
      windows: [[.45, 1.48], [1.58, 2.5]], gw: .87, rw: .72},
    doors: [1.53, 2.95],
  },
  suv: {
    hw: [[0, .88], [.1, .95], [.5, .975], [4.3, .975], [4.78, .93], [4.9, .84]],
    sill: [[0, .42], [.2, .42], [2.4, .41], [4.6, .42], [4.9, .42]],
    belt: [[0, 1.08], [.1, 1.14], [3.6, 1.12], [4.55, 1.0], [4.9, .86]],
    deck: [[0, 1.12], [.1, 1.16], [3.7, 1.13], [4.55, 1.0], [4.9, .86]],
    gh: {u0: .06, u1: 3.82, roof: [[.06, 1.15], [.14, 1.7], [.4, 1.76], [3.0, 1.77], [3.82, 1.13]], rear: .26, front: 3.1,
      windows: [[.32, 1.3], [1.44, 2.34], [2.44, 3.14]], gw: .88, rw: .76},
    doors: [1.4, 2.4, 3.42], rails: true,
  },
  pickup: {
    hw: [[0, .93], [.1, .99], [5.0, .99], [5.48, .95], [5.6, .86]],
    sill: [[0, .5], [.2, .47], [2.8, .45], [5.3, .47], [5.6, .44]],
    belt: [[0, 1.12], [.08, 1.2], [4.4, 1.18], [5.3, 1.08], [5.6, .9]],
    deck: [[0, 1.14], [.08, 1.2], [4.5, 1.19], [5.3, 1.08], [5.6, .9]],
    gh: {u0: 2.3, u1: 4.42, roof: [[2.3, 1.2], [2.38, 1.86], [3.7, 1.9], [4.42, 1.18]], rear: 2.42, front: 3.76,
      windows: [[2.5, 3.14], [3.22, 3.78]], gw: .9, rw: .8},
    doors: [2.42, 3.18, 3.98], bed: [.14, 2.24, .78],
  },
  van: {
    hw: [[0, .9], [.1, .97], [4.4, .98], [4.95, .93], [5.1, .82]],
    sill: [[0, .34], [.2, .35], [2.5, .35], [4.8, .35], [5.1, .34]],
    belt: [[0, 1.0], [.1, 1.06], [4.0, 1.04], [4.6, .95], [5.1, .78]],
    deck: [[0, 1.04], [.1, 1.08], [4.0, 1.06], [4.7, .95], [5.1, .78]],
    gh: {u0: .06, u1: 4.16, roof: [[.06, 1.06], [.15, 1.72], [.5, 1.8], [3.2, 1.8], [4.16, 1.05]], rear: .24, front: 3.26,
      windows: [[.32, 1.3], [1.42, 2.5], [2.6, 3.3]], gw: .88, rw: .76},
    doors: [1.38, 2.55, 3.5],
  },
  truck: {
    hw: [[0, 1.12], [6.8, 1.12], [7.1, 1.08], [7.2, 1.0]],
    sill: [[0, .64], [6.6, .64], [7.2, .45]],
    belt: [[0, 1.2], [6.9, 1.28], [7.2, 1.05]],
    deck: [[0, 1.24], [6.9, 1.32], [7.2, 1.05]],
    gh: {u0: 5.42, u1: 7.0, roof: [[5.42, 1.3], [5.46, 2.46], [6.55, 2.44], [7.0, 1.34]], rear: 5.5, front: 6.58,
      windows: [[5.6, 6.52]], gw: .95, rw: .88, winTop: .88},
    doors: [5.52, 6.62], cargo: [0, 5.3, 3.2],
  },
  bus: {
    hw: [[0, 1.22], [.15, 1.27], [11.8, 1.27], [12, 1.2]],
    sill: [[0, .42], [12, .42]],
    belt: [[0, 1.3], [11.3, 1.3], [12, 1.0]],
    deck: [[0, 1.3], [11.3, 1.3], [12, 1.0]],
    gh: {u0: .05, u1: 11.98, roof: [[.05, 1.3], [.1, 2.98], [.4, 3.08], [11.6, 3.08], [11.9, 2.98], [11.98, 1.02]], rear: .32, front: 11.62,
      windows: [[.55, 2.0], [2.95, 4.35], [4.45, 5.85], [5.95, 7.35], [7.45, 8.85], [8.95, 10.2], [10.3, 11.6]], gw: .985, rw: .95, winTop: .78},
    doors: [10.3, 11.3, 5.9, 7.4],
  },
};
/** A spec stretched to another length and width (taxi, police cruiser). */
function scaled(spec, sl, sw) {
  const su = k => k.map(([u, v]) => [u * sl, v]), sv = k => k.map(([u, v]) => [u * sl, v * sw]);
  const g = spec.gh;
  return {...spec, hw: sv(spec.hw), sill: su(spec.sill), belt: su(spec.belt), deck: su(spec.deck), doors: spec.doors.map(u => u * sl),
    gh: {...g, u0: g.u0 * sl, u1: g.u1 * sl, rear: g.rear * sl, front: g.front * sl, roof: su(g.roof), windows: g.windows.map(w => w.map(u => u * sl))}};
}
SPECS.taxi = SEDAN;
SPECS.police = scaled(SEDAN, 4.95 / 4.8, 1.9 / 1.84);

/* ------------------------------------------------------------ helpers */
function colorize(g, hex) {
  const c = new T.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new T.BufferAttribute(a, 3));
  return g;
}
/** Keep position/normal/colour only, non-indexed, so everything merges. */
function clean(g, hex = null) {
  let o = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(o.attributes)) if (!['position', 'normal', 'color'].includes(k)) o.deleteAttribute(k);
  if (!o.attributes.normal) o.computeVertexNormals();
  if (hex !== null || !o.attributes.color) colorize(o, hex ?? '#ffffff');
  return o;
}
/** Indexed grid from rows of [x, y, z, shade?]; optional per-quad bucket. */
function grid(rows, bucketOf = () => 0, buckets = 1) {
  const pos = [], col = [], idx = Array.from({length: buckets}, () => []), cols = rows[0].length;
  for (const r of rows) for (const p of r) { pos.push(p[0], p[1], p[2]); const s = p[3] ?? 1; col.push(s, s, s); }
  for (let i = 0; i < rows.length - 1; i++) for (let j = 0; j < cols - 1; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
    idx[bucketOf(i, j)].push(a, b, c, b, d, c);
  }
  return idx.map(ix => {
    if (!ix.length) return null;
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(ix); g.computeVertexNormals();
    return g;
  });
}
/** Flat fan over a closed loop, facing `nz` (+1 forward, -1 back). */
function cap(loop, nz) {
  const c = loop.reduce((s, p) => [s[0] + p[0] / loop.length, s[1] + p[1] / loop.length, s[2] + p[2] / loop.length], [0, 0, 0]);
  const pos = [];
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i], q = loop[(i + 1) % loop.length];
    if (nz > 0) pos.push(...c, ...p.slice(0, 3), ...q.slice(0, 3)); else pos.push(...c, ...q.slice(0, 3), ...p.slice(0, 3));
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // Whichever way the loop ran, face the cap outward.
  const n = g.attributes.normal;
  let sum = 0; for (let i = 0; i < n.count; i++) sum += n.getZ(i);
  if (sum * nz < 0) { for (let i = 0; i < pos.length; i += 9) for (let k = 0; k < 3; k++) [pos[i + 3 + k], pos[i + 6 + k]] = [pos[i + 6 + k], pos[i + 3 + k]]; g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); }
  const flat = new Float32Array(pos.length); for (let i = 0; i < flat.length; i += 3) flat[i + 2] = nz;
  g.setAttribute('normal', new T.BufferAttribute(flat, 3));
  return g;
}
const boxAt = (w, h, d, x, y, z, hex, ry = 0) => { const g = new T.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return clean(g, hex); };

/* ------------------------------------------------------------ the loft */
/**
 * @param name  type name (a SPECS key)
 * @param t     traffic type: {L, W, r, wb, ...flags}
 * @returns {body, glass, trim, head, tail} geometries (non-indexed; body white)
 */
export function buildNpcBody(name, t, {coarse = false} = {}) {
  const S = SPECS[name], L = t.L, half = L / 2, r = t.r;
  const hw = curve(S.hw), sillBase = curve(S.sill), belt = curve(S.belt), deck = curve(S.deck);
  const wheelsU = t.wb.map(f => f * L), R = r + .08, WY = r;
  const arch = u => { let y = -1; for (const c of wheelsU) { const d = u - c; if (Math.abs(d) < R) y = Math.max(y, WY + Math.sqrt(R * R - d * d) * .97); } return y; };
  const sill = u => Math.max(sillBase(u), arch(u));
  const body = [], glass = [], trim = [], head = [], tail = [];

  // Rows along the car: every 20 cm, 8 cm through the arches, and a
  // triplet at each door shut line (the middle row is shaded dark).
  const us = new Set();
  for (let u = 0; u < L; u += coarse ? .55 : .2) us.add(+u.toFixed(3));
  us.add(L);
  for (const c of wheelsU) for (let d = -R - .08; d <= R + .08; d += coarse ? .2 : .08) us.add(+(c + d).toFixed(3));
  if (!coarse) for (const d of S.doors) { us.add(+(d - .018).toFixed(3)); us.add(+d.toFixed(3)); us.add(+(d + .018).toFixed(3)); }
  for (const u of [S.gh.u0, S.gh.u1]) us.add(+u.toFixed(3));
  if (S.bed) for (const e of S.bed.slice(0, 2)) for (const d of [-.012, .012]) us.add(+(e + d).toFixed(3));
  const U = [...us].filter(u => u >= 0 && u <= L).sort((a, b) => a - b);
  const doorRow = u => S.doors.some(d => Math.abs(u - d) < 1e-3);

  /* skin: sill -> bodyside bulge -> shoulder -> deck -> centre, mirrored */
  const inBed = u => S.bed && u > S.bed[0] && u < S.bed[1];
  const ctrl = u => {
    const w = hw(u), s = sill(u), b = Math.max(belt(u), s + .12), d = Math.max(deck(u), b - .05);
    if (inBed(u)) {                      // pickup bed: the wall top, then down to the floor
      const f = S.bed[2];
      return [[w * .95, s], [w, s + .36 * (b - s)], [w * .995, b - .07], [w * .955, b - .01], [w * .9, b], [w * .87, f + .02], [w * .45, f], [0, f]];
    }
    return [[w * .95, s], [w, s + .36 * (b - s)], [w * .995, b - .07], [w * .955, b - .01], [w * .9, b + .005], [w * .82, (b + d) / 2 + .01], [w * .45, d + .005], [0, d + .015]];
  };
  const halfRow = u => spline(ctrl(u), coarse ? 1 : 2);
  const skinRows = U.map(u => {
    const h = halfRow(u), z = u - half, dark = doorRow(u), b = belt(u);
    const bed = inBed(u) ? S.bed[2] + .03 : -1;
    const shade = (x, y) => y < bed && Math.abs(x) < hw(u) * .88 ? .22 : dark && y < b - .06 && y > sill(u) + .04 && sillBase(u) >= arch(u) - .02 ? .18 : 1;
    return [...h.map(([x, y]) => [x, y, z, shade(x, y)]), ...h.slice(0, -1).reverse().map(([x, y]) => [-x, y, z, shade(x, y)])];
  });
  body.push(grid(skinRows)[0], cap(skinRows[skinRows.length - 1], 1), cap(skinRows[0], -1));

  // A point on the skin: t 0 (sill) .. 1 (centre line).
  const pointCache = new Map();
  const skinPoint = (u, tt, side) => {
    const k = Math.round(u * 1e4); let h = pointCache.get(k); if (!h) pointCache.set(k, h = spline(ctrl(u), 8));
    const f = Math.max(0, Math.min(1, tt)) * (h.length - 1), i = Math.min(h.length - 2, Math.floor(f)), a = f - i;
    return [side * (h[i][0] + (h[i + 1][0] - h[i][0]) * a), h[i][1] + (h[i + 1][1] - h[i][1]) * a, u - half];
  };
  /** A band moulded on the skin, `lift` proud of it (lamps, panels, stripes). */
  const patch = (u0, u1, t0, t1, lift, side, nu = 6, nt = 3) => {
    const rows = [];
    for (let i = 0; i <= nu; i++) {
      const u = u0 + (u1 - u0) * i / nu, row = [];
      for (let j = 0; j <= nt; j++) {
        const tt = t0 + (t1 - t0) * j / nt, p = skinPoint(u, tt, side), a = skinPoint(u, tt + .01, side), b = skinPoint(u, tt - .01, side);
        // Outward: perpendicular to the section tangent, away from the car's axis.
        let nx = -(a[1] - b[1]) * side, ny = (a[0] - b[0]) * side; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        if (nx * p[0] + ny * (p[1] - .6) < 0) { nx = -nx; ny = -ny; }
        row.push([p[0] + nx * lift, p[1] + ny * lift, p[2]]);
      }
      rows.push(side > 0 ? row : row.slice().reverse());
    }
    const g = grid(rows)[0];
    // Face outward whichever way the rows wound.
    const n = g.attributes.normal, P = g.attributes.position; let dot = 0;
    for (let i = 0; i < n.count; i++) dot += n.getX(i) * P.getX(i) + n.getY(i) * (P.getY(i) - .6);
    if (dot < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]]; g.index.needsUpdate = true; g.computeVertexNormals(); }
    return g;
  };

  /* underbody and wheel wells (dark) */
  const FLOOR = Math.max(.18, sillBase(L / 2) - .08), IN = hw(L / 2) - .26;
  const underRows = U.map(u => {
    const w = hw(u) * .95, s = sill(u), si = Math.min(s, deck(u) - .02), z = u - half;
    return [[w, s, z], [IN, si, z], [IN, FLOOR, z], [-IN, FLOOR, z], [-IN, si, z], [-w, s, z]];
  });
  const under = grid(underRows)[0];
  // The grid winds outward for the skin; the underbody must face down/out.
  { const ix = under.index.array; for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]]; under.computeVertexNormals(); }
  trim.push(clean(under, '#0c0c0d'), clean(cap(underRows[0], -1), '#0c0c0d'), clean(cap(underRows[underRows.length - 1], 1), '#0c0c0d'));

  /* greenhouse: bands 0-1 side glass or pillar, 2 the rail above the
   * windows, 3-4 the roof (glass at the windscreen and backlight). */
  const G = S.gh, roof = curve(G.roof), winTop = G.winTop ?? .93;
  const gus = [G.u0]; for (let u = G.u0 + .1; u < G.u1; u += coarse ? .3 : .1) gus.push(u); gus.push(G.u1);
  for (const w of G.windows) for (const e of w) if (!gus.some(u => Math.abs(u - e) < .02)) gus.push(e);
  gus.sort((a, b) => a - b);
  const gRows = gus.map(u => {
    const base = Math.min(belt(u), deck(u) + .02) - .005, top = Math.max(base + .003, roof(u)), w0 = hw(u) * G.gw, w1 = hw(u) * G.rw, z = u - half;
    const hh = [[w0, base], [w0 * .5 + (w1 + .04) * .5, base + (top - base) * .5], [w1 + .04, base + (top - base) * winTop], [w1 * .97, top - .015], [w1 * .6, top], [0, top + .008]];
    return [...hh.map(([x, y]) => [x, y, z]), ...hh.slice(0, -1).reverse().map(([x, y]) => [-x, y, z])];
  });
  const inWin = u => G.windows.some(([a, b]) => u > a && u < b);
  const [gPaint, gGlass] = grid(gRows, (i, j) => {
    const u = (gus[i] + gus[i + 1]) / 2, band = j < 5 ? j : 9 - j;
    const screen = u > G.front || u < G.rear;
    if (band <= 1) return inWin(u) ? 1 : 0;
    if (band === 2) return screen && u > G.front + .06 || u < G.rear - .04 ? 1 : 0;
    return screen ? 1 : 0;
  }, 2);
  if (gPaint) body.push(gPaint);
  if (gGlass) glass.push(gGlass);
  // Mirrors, body-coloured, on the door top by the A-pillar.
  if (!coarse) for (const s of [-1, 1]) {
    const u = Math.min(G.u1, G.front + .12), y = belt(u) + .09;
    body.push(boxAt(.2, .1, .1, s * (hw(u) + .09), y, u - half + .02, '#ffffff'));
    trim.push(boxAt(.08, .03, .04, s * (hw(u) + .01), y - .04, u - half + .02, '#111214'));
  }

  /* wheels: tyre, a silver rim face with a dark centre */
  for (const c of wheelsU) for (const s of [-1, 1]) {
    const x = s * (hw(c) - .15), z = c - half;
    const tyre = new T.CylinderGeometry(r, r, .24, coarse ? 8 : 16, 1); tyre.rotateZ(Math.PI / 2); tyre.translate(x, r, z); trim.push(clean(tyre, '#111111'));
    const rim = new T.CylinderGeometry(r * .64, r * .64, .02, 12, 1); rim.rotateZ(Math.PI / 2); rim.translate(x + s * .121, r, z);
    trim.push(clean(rim, name === 'truck' || name === 'bus' ? '#b9bcc0' : '#8f959b'));
    if (coarse) continue;
    const hub = new T.CylinderGeometry(r * .2, r * .2, .03, 8, 1); hub.rotateZ(Math.PI / 2); hub.translate(x + s * .125, r, z); trim.push(clean(hub, '#2a2c2f'));
  }

  /* lamps, grille, plates, bumpers */
  const hwF = hw(L - .02), hwR = hw(.02), noseY = Math.min(belt(L), deck(L)), tailY = Math.min(belt(0), deck(0));
  const big = name === 'truck' || name === 'bus';
  const hy = big ? .95 : noseY - .1, ty = big ? 1.05 : tailY - .1;
  for (const s of [-1, 1]) {
    head.push(clean(boxAt(hwF * .42, big ? .2 : .11, .1, s * hwF * .64, hy, half - .03)));
    // Tail lamps on the rear face and wrapping round the corner.
    tail.push(clean(boxAt(hwR * .36, big ? .3 : .13, .1, s * hwR * .7, ty, -half + .03)));
    if (!big && !coarse) {
      const tt = (() => { const h = spline(ctrl(.15), 8); let best = 0, bd = 9; h.forEach(([, y], i) => { const d = Math.abs(y - ty); if (d < bd) { bd = d; best = i; } }); return best / (h.length - 1); })();
      tail.push(clean(patch(.02, .32, tt - .04, tt + .035, .008, s, 4, 2)));
      head.push(clean(patch(L - .3, L - .03, tt - .03, tt + .02, .008, s, 4, 2)));
      // Side repeaters: amber would need a colour per lamp; a dark trim chip.
    }
  }
  trim.push(boxAt(hwF * .62, big ? .5 : .15, .06, 0, big ? .75 : hy - .08, half - .01, '#0d0e10'));              // grille
  trim.push(boxAt(.5, .12, .04, 0, sillBase(L) + .16, half + .01, '#e7e5dc'), boxAt(.5, .12, .04, 0, big ? .7 : tailY - .32, -half - .01, '#e7e5dc'));
  trim.push(boxAt(hwF * 1.9, .12, .1, 0, sillBase(L) + .05, half - .03, '#141517'), boxAt(hwR * 1.9, .12, .1, 0, sillBase(0) + .05, -half + .03, '#141517'));

  /* type extras */
  if (S.rails) for (const s of [-1, 1]) trim.push(boxAt(.05, .05, 2.6, s * hw(2) * G.rw * .82, roof(1.9) + .03, 1.9 - half, '#1c1d1f'));
  if (S.bed) {
    // The pickup bed: a dark liner inset in the deck, the tailgate line.
    trim.push(boxAt(hwR * 1.8, .02, .02, 0, belt(.06) - .08, -half + .01, '#101112'));
  }
  if (S.cargo) {
    // Box truck: a white box on the chassis with a roll-up door frame.
    const [c0, c1, top] = S.cargo, bw = hw(2) * 2 + .04;
    trim.push(boxAt(bw, top - 1.05, c1 - c0, 0, (top + 1.05) / 2, (c0 + c1) / 2 - half, t.box || '#ecebe7'));
    trim.push(boxAt(bw + .02, .12, c1 - c0 + .02, 0, 1.08, (c0 + c1) / 2 - half, '#8d9095'));
    trim.push(boxAt(bw - .3, top - 1.4, .03, 0, (top + 1.25) / 2, -half - .01, '#c9c8c3'));
  }
  if (t.sign) trim.push(boxAt(.9, .26, .3, 0, roof((G.u0 + G.u1) / 2) + .13, (G.u0 + G.u1) / 2 - half, t.sign));
  if (t.bar) {
    const yb = roof((G.u0 + G.u1) / 2 + .1) + .05, zb = (G.u0 + G.u1) / 2 + .1 - half;
    trim.push(boxAt(1.2, .05, .3, 0, yb - .03, zb, '#18191b'), boxAt(.5, .1, .24, .3, yb + .04, zb, '#2349d6'));
    tail.push(clean(boxAt(.5, .1, .24, -.3, yb + .04, zb)));
  }
  if (t.doors) for (const s of [-1, 1]) trim.push(clean(patch(S.doors[0] + .02, S.doors[2] - .02, .06, .42, .006, s, 8, 3), t.doors));
  if (t.stripe) for (const s of [-1, 1]) trim.push(clean(patch(.3, L - .5, .2, .26, .006, s, 14, 1), t.stripe));

  const merge = list => list.length ? mergeGeometries(list.map(g => clean(g))) : null;
  return {body: merge(body), glass: merge(glass), trim: merge(trim), head: merge(head), tail: merge(tail)};
}

/** One shared geometry set per type and detail level (moving and parked cars use the same). */
const CACHE = new Map();
export function fleetGeometry(name, t, coarse = false) {
  const key = name + (coarse ? ':far' : ':near');
  if (!CACHE.has(key)) CACHE.set(key, buildNpcBody(name, t, {coarse}));
  return CACHE.get(key);
}
