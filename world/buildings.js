/* Buildings for one area at a time (West Hollywood first).
 *
 * Placement is road-safe by construction: a lot is a rectangle behind the
 * pavement, and it is only accepted if every sample along its edges and
 * through its middle clears every nearby road (carriageway + pavement +
 * margin) and every junction outline, and no earlier lot. A building can
 * therefore never stand on a road.
 *
 * Styles follow the real place: low-rise clubs and shops built to the
 * pavement on the Sunset Strip with billboards on the roofs, a few hotel
 * towers, one- and two-storey shops on the avenues, two-to-four storey stucco
 * apartments and Spanish-revival bungalows with red tile roofs on the side
 * streets, and modernist houses stepped into the hills.
 */
import {beachZ} from './coast.js';
import {reserved} from './places.js';
import {HILLS, SUMMIT, HILL_SIZE, HILL_VARIANTS, HILL_BUILD} from './hills.js';
import * as T from 'three';
import {projectPiece, VERGE} from './roads.js';
import {SIGN} from './signs.js';
import {PASADENA, pasadenaZone, PAS_SIZE, PAS_VARIANTS, PAS_LANDMARKS, PAS_BUILD} from './pasadena.js';
import {BEVERLY, DOWNTOWN, MIDCITY, cityZone, rearFor, NO_REAR, CITY_SIZE, CITY_VARIANTS, CITY_LANDMARKS, CITY_BUILD} from './city.js';
import {EASTSIDE_PARTS, EAST_NAMES, EAST_NO_REAR, eastZone, EAST_SIZE, EAST_VARIANTS, EAST_LANDMARKS, EAST_BUILD} from './eastside.js';

export const rng = seed => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
export const pick = (list, r) => list[Math.floor(r() * list.length) % list.length];

/** West Hollywood and the hills above it, in world metres. */
export const WEHO = {name: 'weho', x0: -5600, x1: -1900, z0: -2900, z1: -100};
/** Everything built so far: West Hollywood, Beverly Hills, Downtown, the city between them, Pasadena. */
export const CITY = {parts: [WEHO, HILLS, BEVERLY, DOWNTOWN, ...MIDCITY, ...PASADENA, ...EASTSIDE_PARTS]};
export const inArea = (a, x, z) => a.parts ? a.parts.some(p => inArea(p, x, z)) : x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1;
export const areaOf = (a, x, z) => a.parts ? a.parts.find(p => inArea(p, x, z)) : a;

// Real LA stucco runs from white and cream through sand, peach and terracotta
// to sage, grey and the odd charcoal; pastels on the older apartment blocks.
const STUCCO = ['#f2ede3', '#e9dfcc', '#e2cfb2', '#d9b894', '#cf9f7c', '#c98a6a', '#b9b3a4', '#a9ad9a', '#8f9488', '#e6dccb', '#d8c7a8', '#5e5a55'];
const PASTEL = ['#efd2c4', '#e6d3b1', '#cfdccd', '#e8c9bd', '#d6dde2', '#f1dfb4', '#d9c3cf', '#c9d4c0', '#f0c9a9'];
const STRIP = ['#1c1c1e', '#f1efea', '#2b2d31', '#e4ded2', '#8c8f94', '#3b2f2f', '#d8cfc0', '#b3a58f'];
const HILL = ['#f3f1ec', '#e9e6df', '#cfc9bd', '#8d7b67', '#b9aa95', '#f6f4ef', '#dcd5c9'];
const TILE_RED = ['#b0543a', '#a14b33', '#bd6445', '#9b4a36'];

/** Facade window styles, read by the facade shader from binfo.x. */
const W = {none: 0, punched: 1, shop: 2, curtain: 3, ribbon: 4, arched: 5, deco: 6, brick: 7, slats: 8, clapboard: 9, carport: 11, mixed: 12, tinted: 13, fins: 14};

class Builder {
  constructor() { this.parts = new Map(); }
  part(mat) { let p = this.parts.get(mat); if (!p) this.parts.set(mat, p = {pos: [], nor: [], uv: [], col: [], info: [], index: []}); return p; }
  /** Oriented box. frame = {x, y, z, a} origin and heading; (cx, cy, cz) local centre; sides get `info`. */
  box(mat, f, cx, cy, cz, sx, sy, sz, color, info = [0, 3.5, 3.6, 0], roofInfo = [0, 0, 0, 0]) {
    const p = this.part(mat), c = new T.Color(color), ca = Math.cos(f.a), sa = Math.sin(f.a);
    // local x across the lot (away from the street), z along it.
    const toW = (lx, ly, lz) => [f.x + lx * ca + lz * sa, f.y + ly, f.z - lx * sa + lz * ca];
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, y0 = cy - hy;
    const faces = [
      // normal (local), four corners, uv width axis
      [[1, 0, 0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], sz],
      [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], sz],
      [[0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], sx],
      [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], sx],
      [[0, 1, 0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], sx],
    ];
    // A box that stands clear of its base (a cantilevered floor, a roof slab,
    // an awning) needs an underside, or from below it is an open shell and
    // its far walls read as loose panels hanging in the air.
    if (y0 > .15) faces.push([[0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], sx]);
    for (const [n, corners, width] of faces) {
      const base = p.pos.length / 3, top = n[1] === 1;
      const nw = [n[0] * ca + n[2] * sa, n[1], -n[0] * sa + n[2] * ca];
      corners.forEach(([lx, ly, lz], k) => {
        p.pos.push(...toW(cx + lx, cy + ly, cz + lz));
        p.nor.push(...nw);
        // Sides: u along the face in metres, v = height above the building's base.
        const flat = n[1] !== 0;
        p.uv.push(flat ? (k === 1 || k === 2 ? sx : 0) : (k === 1 || k === 2 ? width : 0), flat ? (k >= 2 ? sz : 0) : cy + ly);   // v = metres above the lot's base (frame y)
        p.col.push(c.r, c.g, c.b);
        p.info.push(...(top ? roofInfo : n[1] < 0 ? [0, 0, 0, 0] : info));
      });
      p.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  /** A street-facing panel (local -x normal) with 0..1 uv; binfo.w = which ad. */
  panel(mat, f, cx, cy, cz, w, h, index) {
    const p = this.part(mat), ca = Math.cos(f.a), sa = Math.sin(f.a), base = p.pos.length / 3;
    const toW = (lx, ly, lz) => [f.x + lx * ca + lz * sa, f.y + ly, f.z - lx * sa + lz * ca];
    const nw = [-ca, 0, sa];
    [[-w / 2, -h / 2, 0, 0], [w / 2, -h / 2, 1, 0], [w / 2, h / 2, 1, 1], [-w / 2, h / 2, 0, 1]].forEach(([lz, ly, u, v]) => {
      p.pos.push(...toW(cx, cy + ly, cz + lz)); p.nor.push(...nw); p.uv.push(u, v); p.col.push(1, 1, 1); p.info.push(0, 0, 0, index);
    });
    p.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** Gable roof over a box: ridge along local z. */
  gable(mat, f, cx, cy, cz, sx, sz, rise, color) {
    const p = this.part(mat), c = new T.Color(color), ca = Math.cos(f.a), sa = Math.sin(f.a);
    const toW = (lx, ly, lz) => [f.x + lx * ca + lz * sa, f.y + ly, f.z - lx * sa + lz * ca];
    const hx = sx / 2 + .35, hz = sz / 2 + .35, slope = Math.hypot(hx, rise);
    const quads = [
      [[-hx, 0, -hz], [-hx, 0, hz], [0, rise, hz], [0, rise, -hz]],
      [[hx, 0, hz], [hx, 0, -hz], [0, rise, -hz], [0, rise, hz]],
    ];
    for (const q of quads) {
      const base = p.pos.length / 3;
      const a = q[0], b = q[1], d = q[3];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(...n); n = n.map(x => x / l);
      if (n[1] < 0) n = n.map(x => -x);
      const nw = [n[0] * ca + n[2] * sa, n[1], -n[0] * sa + n[2] * ca];
      q.forEach(([lx, ly, lz], k) => {
        p.pos.push(...toW(cx + lx, cy + ly, cz + lz)); p.nor.push(...nw);
        p.uv.push(k === 1 || k === 2 ? 2 * hz : 0, k >= 2 ? slope : 0); p.col.push(c.r, c.g, c.b); p.info.push(0, 0, 0, 0);
      });
      // Winding so the face points outward-up.
      p.index.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
    // Gable ends.
    for (const side of [-1, 1]) {
      const base = p.pos.length / 3, z = hz * side, nw = [sa * side, 0, ca * side];
      for (const [lx, ly] of [[-hx, 0], [hx, 0], [0, rise]]) {
        p.pos.push(...toW(cx + lx, cy + ly, cz + z)); p.nor.push(...nw); p.uv.push(0, 0); p.col.push(c.r, c.g, c.b); p.info.push(0, 0, 0, 0);
      }
      p.index.push(...(side > 0 ? [base, base + 1, base + 2] : [base, base + 2, base + 1]));
    }
  }
  /* ---- general primitives, all in the lot frame (local x away from the
   * street, z along it). Winding is fixed up from the intended normal, so
   * callers never have to think about it. */
  _w(f, lx, ly, lz) { const ca = Math.cos(f.a), sa = Math.sin(f.a); return [f.x + lx * ca + lz * sa, f.y + ly, f.z - lx * sa + lz * ca]; }
  _n(f, n) { const ca = Math.cos(f.a), sa = Math.sin(f.a); return [n[0] * ca + n[2] * sa, n[1], -n[0] * sa + n[2] * ca]; }
  /** Polygon (local points [x,y,z]) with per-vertex uv; `n` local normal (or per-vertex normals). */
  poly(mat, f, pts, uvs, n, color, info) {
    const p = this.part(mat), c = new T.Color(color), base = p.pos.length / 3;
    pts.forEach((q, k) => {
      p.pos.push(...this._w(f, ...q)); p.nor.push(...this._n(f, Array.isArray(n[0]) ? n[k] : n));
      p.uv.push(...uvs[k]); p.col.push(c.r, c.g, c.b); p.info.push(...info);
    });
    // Fan; flip if the polygon's normal disagrees with the intended one.
    // Newell's normal (over every edge), not the first triangle's: an outline
    // that starts with three points in a line (a parapet's flat shoulder) had
    // no first-triangle normal, and its face came out backwards and culled.
    const nn = Array.isArray(n[0]) ? n[0] : n, g = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
      const c = pts[i], e = pts[(i + 1) % pts.length];
      g[0] += (c[1] - e[1]) * (c[2] + e[2]); g[1] += (c[2] - e[2]) * (c[0] + e[0]); g[2] += (c[0] - e[0]) * (c[1] + e[1]);
    }
    const flip = g[0] * nn[0] + g[1] * nn[1] + g[2] * nn[2] < 0;
    for (let k = 1; k < pts.length - 1; k++) p.index.push(...(flip ? [base, base + k + 1, base + k] : [base, base + k, base + k + 1]));
  }
  /** Vertical prism over a plan outline [[x, z], ...] (either winding), from y0 to y1.
   *  `smooth` gives radial normals (round towers, streamline corners). */
  prism(mat, f, outline, y0, y1, color, info = [0, 3.5, 3.6, 0], roofInfo = [0, 0, 0, 0], {smooth = false, top = true} = {}) {
    let area = 0; for (let i = 0; i < outline.length; i++) { const a = outline[i], b = outline[(i + 1) % outline.length]; area += a[0] * b[1] - b[0] * a[1]; }
    const pts = area < 0 ? outline : [...outline].reverse();          // clockwise in (x, z) = CCW seen from above in this frame
    let cx = 0, cz = 0; pts.forEach(q => { cx += q[0] / pts.length; cz += q[1] / pts.length; });
    let run = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let n = [b[1] - a[1], 0, -(b[0] - a[0])]; const l = Math.hypot(n[0], n[2]) || 1; n = [n[0] / l, 0, n[2] / l];
      if (((a[0] + b[0]) / 2 - cx) * n[0] + ((a[1] + b[1]) / 2 - cz) * n[2] < 0) n = [-n[0], 0, -n[2]];
      const rn = q => { const dx = q[0] - cx, dz = q[1] - cz, m = Math.hypot(dx, dz) || 1; return [dx / m, 0, dz / m]; };
      const ns = smooth ? [rn(a), rn(b), rn(b), rn(a)] : n;
      this.poly(mat, f, [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]],
        [[run, y0], [run + len, y0], [run + len, y1], [run, y1]], ns, color, info);
      run += len;
    }
    if (top) this.poly(mat, f, pts.map(q => [q[0], y1, q[1]]), pts.map(q => [q[0], q[1]]), [0, 1, 0], color, roofInfo);
  }
  /** A profile [[x, y], ...] in the x-y plane, extruded along z from z0 to z1. */
  extrude(mat, f, profile, z0, z1, color, info = [0, 3.5, 3.6, 0]) {
    for (let i = 0; i < profile.length; i++) {
      const a = profile[i], b = profile[(i + 1) % profile.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-3) continue;
      let n = [b[1] - a[1], -(b[0] - a[0]), 0];
      const l = Math.hypot(n[0], n[1]); n = [n[0] / l, n[1] / l, 0];
      let cx = 0, cy = 0; profile.forEach(q => { cx += q[0] / profile.length; cy += q[1] / profile.length; });
      if (((a[0] + b[0]) / 2 - cx) * n[0] + ((a[1] + b[1]) / 2 - cy) * n[1] < 0) n = [-n[0], -n[1], 0];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      this.poly(mat, f, [[a[0], a[1], z0], [a[0], a[1], z1], [b[0], b[1], z1], [b[0], b[1], z0]],
        [[0, 0], [z1 - z0, 0], [z1 - z0, len], [0, len]], n, color, n[1] > .5 ? [0, 0, 0, 0] : [0, 0, 0, 0]);
    }
    for (const [z, s] of [[z0, -1], [z1, 1]])
      this.poly(mat, f, profile.map(q => [q[0], q[1], z]), profile.map(q => [q[0], q[1]]), [0, 0, s], color, info);
  }
  /** Hip roof over a sx by sz rectangle centred at (cx, cz), eaves at y. */
  hip(mat, f, cx, y, cz, sx, sz, rise, color, over = .45) {
    const hx = sx / 2 + over, hz = sz / 2 + over, r = Math.min(hx, hz);
    const rx = hx - r, rz = hz - r;                                  // ridge half-lengths
    const A = [cx - hx, y, cz - hz], B = [cx + hx, y, cz - hz], C = [cx + hx, y, cz + hz], D = [cx - hx, y, cz + hz];
    const P = [cx - rx, y + rise, cz - rz], Q = [cx + rx, y + rise, cz + rz];
    const Pz = [cx - rx, y + rise, cz - rz], Qz = [cx + rx, y + rise, cz + rz];
    const face = (pts) => {
      const a = pts[0], b = pts[1], d = pts[2];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const l = Math.hypot(...n) || 1; n = n.map(x => x / l); if (n[1] < 0) n = n.map(x => -x);
      const uvs = pts.map(q => [q[0] + q[2], Math.hypot(q[0] - cx, q[2] - cz) * 0 + (y + rise - q[1]) * 1.4]);
      this.poly(mat, f, pts, uvs, n, color, [0, 0, 0, 0]);
    };
    if (hx >= hz) { face([A, B, [cx + rx, y + rise, cz]]); face([A, [cx + rx, y + rise, cz], [cx - rx, y + rise, cz]]);
      face([C, D, [cx - rx, y + rise, cz]]); face([C, [cx - rx, y + rise, cz], [cx + rx, y + rise, cz]]);
      face([B, C, [cx + rx, y + rise, cz]]); face([D, A, [cx - rx, y + rise, cz]]); }
    else { face([B, C, [cx, y + rise, cz + rz]]); face([B, [cx, y + rise, cz + rz], [cx, y + rise, cz - rz]]);
      face([D, A, [cx, y + rise, cz - rz]]); face([D, [cx, y + rise, cz - rz], [cx, y + rise, cz + rz]]);
      face([A, B, [cx, y + rise, cz - rz]]); face([C, D, [cx, y + rise, cz + rz]]); }
  }
  /** Cone / pyramid spire (n sides) on a circle of radius r centred at (cx, y, cz). */
  cone(mat, f, cx, y, cz, r, h, color, n = 12) {
    for (let i = 0; i < n; i++) {
      const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, am = (a0 + a1) / 2;
      const s = Math.hypot(r, h), nn = [Math.cos(am) * h / s, r / s, Math.sin(am) * h / s];
      this.poly(mat, f, [[cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r], [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r], [cx, y + h, cz]],
        [[0, 0], [r, 0], [r / 2, s]], nn, color, [0, 0, 0, 0]);
    }
  }
  /** Horizontal rectangle (parking lots, pool water, decks) at height y. */
  slab(mat, f, x0, x1, z0, z1, y, color, info = [0, 0, 0, 0]) {
    this.poly(mat, f, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], [[0, 0], [x1 - x0, 0], [x1 - x0, z1 - z0], [0, z1 - z0]], [0, 1, 0], color, info);
  }
  /** A sign on any face: centre (lx, ly, lz), facing local normal n (x or z axis), atlas cell `index`. */
  sign(mat, f, lx, ly, lz, w, h, index, n = [-1, 0, 0]) {
    const t = n[0] ? [0, 0, -n[0]] : [n[2], 0, 0];               // right-hand direction along the face
    const P = (a, b) => [lx + t[0] * a, ly + b, lz + t[2] * a];
    this.poly(mat, f, [P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2)], [[0, 0], [1, 0], [1, 1], [0, 1]], n, '#ffffff', [0, 0, 0, index]);
  }
  finish() {
    const out = new Map();
    for (const [mat, p] of this.parts) {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(p.pos, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(p.nor, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(p.uv, 2));
      g.setAttribute('color', new T.Float32BufferAttribute(p.col, 3));
      g.setAttribute('binfo', new T.Float32BufferAttribute(p.info, 4));
      g.setIndex(p.index.length > 65535 ? new T.Uint32BufferAttribute(p.index, 1) : new T.Uint16BufferAttribute(p.index, 1));
      g.computeBoundingSphere();
      out.set(mat, g);
    }
    return out;
  }
}

export class Buildings {
  constructor({model, ground, area = WEHO, seed = 90069}) {
    this.model = model; this.ground = ground; this.area = area; this.seed = seed;
    this.kinds = model.net.edges.map(e => e.kind);
    this.occupied = new Occupancy();
    this.lots = [];
    this.indexRoads();
    this.plan();
  }

  /** A tight index for clearance tests: each centreline piece padded only by
   *  its own carriageway + pavement + a little, on a 16 m grid. The model's
   *  own index pads for the ground's wide blends and is far too coarse here. */
  indexRoads() {
    const C = 16, grid = new Map();
    for (const seg of this.model.segments) for (let i = 0; i < seg.pts.length - 1; i++) {
      const a = seg.pts[i], b = seg.pts[i + 1], pad = Math.max(a.h, b.h) + (VERGE[seg.kind] ?? 2) + 2;
      for (let gx = Math.floor((Math.min(a.x, b.x) - pad) / C); gx <= Math.floor((Math.max(a.x, b.x) + pad) / C); gx++)
        for (let gz = Math.floor((Math.min(a.z, b.z) - pad) / C); gz <= Math.floor((Math.max(a.z, b.z) + pad) / C); gz++) {
          const key = gx * 65536 + gz; let l = grid.get(key); if (!l) grid.set(key, l = []); l.push(seg.id, i);
        }
    }
    this.tight = grid;
  }

  /** Is the point clear of every road (plus its pavement) and junction? */
  clear(x, z, margin = .6) {
    const m = this.model, list = this.tight.get(Math.floor(x / 16) * 65536 + Math.floor(z / 16)) || [];
    for (let k = 0; k < list.length; k += 2) {
      const seg = m.segments[list[k]], r = projectPiece(seg, list[k + 1], x, z);
      if (r.d < r.h + (VERGE[seg.kind] ?? 2) + margin) return false;
    }
    for (const j of m.junctionsNear(x, z)) {
      if (Math.hypot(x - j.x, z - j.z) < j.radius + 4 && m.junctionZone(j, x, z)) return false;
      if (Math.hypot(x - j.x, z - j.z) < 6) return false;
    }
    return true;
  }

  zoneFor(seg, r, x, z) {
    const part = areaOf(this.area, x, z);
    if (part?.name === 'hills') return 'hill';
    if (part?.name === 'pasadena') return pasadenaZone(seg, r, x, z);
    if (EAST_NAMES.has(part?.name)) return eastZone(part.name, seg, r, x, z);
    if (part && part.name !== 'weho') return cityZone(part.name, seg, r, x, z);
    const name = seg.name || '', kind = seg.kind;
    if (kind === 'scenic') return 'hill';
    if (/Sunset/.test(name)) return r() < .14 ? 'tower' : 'strip';
    if (/Santa Monica/.test(name)) return r() < .82 ? 'shop' : 'apartment';
    if (kind === 'avenue' || kind === 'boulevard') return r() < .66 ? 'shop' : 'apartment';
    if (kind === 'residential') return r() < .62 ? 'bungalow' : 'apartment';
    return r() < .55 ? 'apartment' : r() < .78 ? 'bungalow' : 'shop';
  }

  /** Every metre round the edge of a depth x width footprint (nothing narrower
   *  than a road can slip between samples), every 3 m through the middle:
   *  inside the area, unclaimed, and clear of every road. */
  footprintClear(at, depth, width) {
    const nx = Math.ceil(depth), nz = Math.ceil(width), pts = [];
    for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) {
      const edge = i === 0 || i === nx || k === 0 || k === nz;
      if (!edge && (i % 3 || k % 3)) continue;
      const p = at(depth * i / nx, -width / 2 + width * k / nz);
      if (this.occupied.hasAt(p[0], p[1])) return false;
      pts.push(p);
    }
    for (const [lx, lz] of [[depth, -width / 2], [depth, width / 2], [0, -width / 2], [0, width / 2], [depth, 0], [depth / 2, 0]]) {
      const [x, z] = at(lx, lz);
      if (!inArea(this.area, x, z) || !this.clear(x, z)) return false;
    }
    for (const [x, z] of pts) if (!inArea(this.area, x, z) || !this.clear(x, z)) return false;
    return true;
  }

  /** Try a width x depth lot on one side of a segment at arc length s. On
   *  success it is claimed and returned; otherwise null. */
  fit(seg, side, s, spec, zone, maxRelief) {
    const m = this.model, {width, depth} = spec;
    const sec = m.sectionAt(seg, s + width / 2);
    const a0 = m.sectionAt(seg, s), a1 = m.sectionAt(seg, s + width);
    if (a0.tx * a1.tx + a0.tz * a1.tz < .94) return null;                 // a lot is a rectangle: skip bends
    const verge = VERGE[seg.kind] ?? 2;
    const front = sec.h + verge + spec.setback;
    const ox = sec.x + sec.nx * side * front, oz = sec.z + sec.nz * side * front;
    const fx = sec.nx * side, fz = sec.nz * side, tx = sec.tx, tz = sec.tz;
    const at = (lx, lz) => [ox + fx * lx + tx * lz, oz + fz * lx + tz * lz];
    // Every metre round the edge (nothing narrower than a road can slip
    // between samples), every 3 m through the middle.
    // Cheapest rejections first: claimed cells, then the four corners and
    // the far edge's middle against the roads, then everything else.
    if (!this.footprintClear(at, depth, width)) return null;
    // Nothing is built on the beach (world/coast.js).
    for (const [lx, lz] of [[0, -width / 2], [0, width / 2], [depth, -width / 2], [depth, width / 2]]) { const [px, pz] = at(lx, lz); if (pz > beachZ(px) - 3) return null; }
    // ...nor round the Hollywood sign and the Mount Lee overlook.
    for (const c of SUMMIT) if (Math.hypot(ox - c.x, oz - c.z) < c.r) return null;
    if (reserved(ox + fx * depth / 2, oz + fz * depth / 2, Math.hypot(depth, width) / 2)) return null;
    let lo = Infinity, hi = -Infinity;
    for (const [lx, lz] of [[0, -width / 2], [0, width / 2], [depth, -width / 2], [depth, width / 2], [depth / 2, 0], [depth / 2, -width / 2], [depth / 2, width / 2]]) {
      const g = this.ground.height(...at(lx, lz)); lo = Math.min(lo, g); hi = Math.max(hi, g);
    }
    if (hi - lo > maxRelief) return null;
    // Hillside houses face their view: how far the ground falls from the
    // street edge of the lot to its back (negative: it climbs).
    let fall;
    if (zone === 'hill') { const g = (lx, lz) => this.ground.height(...at(lx, lz)); fall = (g(0, -width / 3) + g(0, width / 3)) / 2 - (g(depth, -width / 3) + g(depth, width / 3)) / 2; }
    this.occupied.claim(ox, oz, fx, fz, tx, tz, depth, width);
    const lot = {zone, spec, x: ox, z: oz, fx, fz, tx, tz, a: Math.atan2(fx, fz), width, depth, lo, hi,
      seed: 0, seg: seg.id, frontY: sec.y, name: seg.name, fall};
    this.lots.push(lot);
    return lot;
  }

  /** Landmarks first, so the ordinary lots fill in around them: a Norman
   *  chateau hotel on the hillside and an art-deco tower on the Strip, a
   *  white modern hotel, and a blue glass design centre on Santa Monica. */
  /** Landmarks that need open ground, not a frontage (a stadium, a garden
   *  estate): the nearest clear, level footprint to `near`, spiralling out. */
  freeLandmark(L, r) {
    for (let ring = 0; ring < 30; ring++) {
      const R = ring * 25, steps = Math.max(1, Math.round(R / 20));
      for (let k = 0; k < steps; k++) for (const turn of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
        const ang = k / steps * Math.PI * 2, cx = L.near[0] + Math.cos(ang) * R, cz = L.near[1] + Math.sin(ang) * R;
        const fx = Math.cos(turn), fz = Math.sin(turn), tx = -fz, tz = fx;
        const ox = cx - fx * L.depth / 2, oz = cz - fz * L.depth / 2;
        const at = (lx, lz) => [ox + fx * lx + tx * lz, oz + fz * lx + tz * lz];
        let ok = true;
        for (let i = 0; i <= L.depth && ok; i += 5) for (let j = -L.width / 2; j <= L.width / 2 && ok; j += 5) {
          const [x, z] = at(i, j);
          if (z > beachZ(x) - 5 || reserved(x, z) || this.occupied.hasAt(x, z) || !inArea(this.area, x, z) || !this.clear(x, z, 3)) ok = false;
        }
        if (!ok) continue;
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { const g = this.ground.height(...at(L.depth * i / 4, -L.width / 2 + L.width * j / 4)); lo = Math.min(lo, g); hi = Math.max(hi, g); }
        if (hi - lo > (L.pad ? 45 : L.relief)) continue;
        if (L.pad) {                                   // level a pad for it (the ground blends back over 45 m)
          let sum = 0; for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) sum += this.ground.height(...at(L.depth * i / 4, -L.width / 2 + L.width * j / 4)) / 25;
          this.ground.addPad({cx, cz, fx, fz, hl: L.depth / 2 + 4, hw: L.width / 2 + 4, y: sum - 2, margin: 45});
          lo = hi = sum - 2;
        }
        this.occupied.claim(ox, oz, fx, fz, tx, tz, L.depth, L.width);
        this.lots.push({zone: L.zone, spec: {variant: L.variant, width: L.width, depth: L.depth, setback: 0, gap: 0}, x: ox, z: oz, fx, fz, tx, tz,
          a: Math.atan2(fx, fz), width: L.width, depth: L.depth, lo, hi, seed: Math.floor(r() * 1e9), seg: -1, frontY: lo, name: L.variant, landmark: L.variant});
        return true;
      }
    }
    return false;
  }
  landmarks(r) {
    const m = this.model;
    for (const L of LANDMARKS) {
      if (L.free) { this.freeLandmark(L, r); continue; }
      // Nearest spot first, walking outward until one fits.
      const cands = [];
      for (const seg of m.segments) {
        if (!L.road.test(seg.name || '') || seg.elevated || !LOT_KINDS.includes(seg.kind)) continue;
        const s0 = seg.cut[0] + 3, s1 = seg.L - seg.cut[1] - 3 - L.width;
        for (let s = s0; s < s1; s += 3) {
          const c = m.sectionAt(seg, s + L.width / 2), d = Math.hypot(c.x - L.near[0], c.z - L.near[1]);
          if (d < 900) for (const side of [-1, 1]) cands.push({d, seg, s, side});
        }
      }
      cands.sort((p, q) => p.d - q.d);
      for (const c of cands) {
        const spec = {variant: L.variant, width: L.width, depth: L.depth, setback: L.setback, gap: 0};
        const lot = this.fit(c.seg, c.side, c.s, spec, L.zone, L.relief);
        if (lot) { lot.seed = Math.floor(r() * 1e9); lot.landmark = L.variant; break; }
      }
    }
  }

  plan() {
    const r = rng(this.seed), m = this.model;
    this.landmarks(r);
    for (const seg of m.segments) {
      if (!LOT_KINDS.includes(seg.kind) || seg.elevated) continue;
      const s0 = seg.cut[0] + 5, s1 = seg.L - seg.cut[1] - 5;
      if (s1 - s0 < 10) continue;
      const mid = m.sectionAt(seg, (s0 + s1) / 2);
      if (!inArea(this.area, mid.x, mid.z)) continue;
      for (const side of [-1, 1]) {
        let s = s0 + r() * 4;
        while (s < s1 - 8) {
          const at = m.sectionAt(seg, s);
          const zone = this.zoneFor(seg, r, at.x, at.z);
          const spec = SPEC[zone](r);
          if (s + spec.width > s1) {
            // The last lot on a block: try a narrow infill rather than a gap.
            const alt = SPEC[zone](r);
            if (s + alt.width > s1 || alt.width >= spec.width) break;
            Object.assign(spec, alt);
          }
          if (zone === 'hill' && r() < .45) { s += spec.width + 10; continue; }      // hills are sparse
          // Pasadena's graded boulevards run on embankments over a sloping plateau:
          // its lots accept more fall (buildings sit on plinths down to the low side).
          const pas = areaOf(this.area, at.x, at.z)?.name === 'pasadena';
          const lot = this.fit(seg, side, s, spec, zone, zone === 'hill' || zone === 'hillside' ? 14 : pas ? Math.max(zone === 'pasHouse' || zone === 'estate' ? 5 : 8, spec.relief ?? 0) : spec.relief ?? 3.5);
          if (!lot) { s += 4; continue; }
          lot.seed = Math.floor(r() * 1e9);
          // A filling station's forecourt is graded level with the street, so
          // its floor is solid ground you drive straight onto (no raised slab).
          if (spec.variant === 'gas') {
            this.ground.addPad({cx: lot.x + lot.fx * lot.depth / 2, cz: lot.z + lot.fz * lot.depth / 2, fx: lot.fx, fz: lot.fz, hl: lot.depth / 2 + 1.5, hw: lot.width / 2 + 1.5, y: lot.frontY + .08, margin: 10});
            lot.lo = lot.hi = lot.frontY + .08; lot.graded = true;
          }
          // Behind it, often another building: a backhouse, garage or rear
          // apartment block. Blocks are built out, not lawns in the middle.
          if (zone !== 'hill' && zone !== 'tower' && !NO_REAR.has(zone) && !EAST_NO_REAR.has(zone) && spec.variant !== 'minimall' && spec.variant !== 'dimSum' && r() < .75) {
            const city = rearFor(zone) === 'rearCity', gap = city ? 2 + r() * 3 : 3 + r() * 5, rd = city ? 14 + r() * 12 : 9 + r() * 10, rw = spec.width * (.6 + r() * .35);
            this.tryRear(lot.x + lot.fx * (spec.depth + gap), lot.z + lot.fz * (spec.depth + gap), lot.fx, lot.fz, lot.tx, lot.tz, rw, rd, lot.frontY, r, seg, rearFor(zone));
          }
          s += spec.width + spec.gap;
        }
      }
    }
  }

  tryRear(ox, oz, fx, fz, tx, tz, width, depth, frontY, r, seg, variant = 'rear') {
    const at = (lx, lz) => [ox + fx * lx + tx * lz, oz + fz * lx + tz * lz];
    if (!this.footprintClear(at, depth, width)) return;
    let lo = Infinity, hi = -Infinity;
    for (const [lx, lz] of [[0, -width / 2], [0, width / 2], [depth, -width / 2], [depth, width / 2]]) {
      const g = this.ground.height(...at(lx, lz)); lo = Math.min(lo, g); hi = Math.max(hi, g);
    }
    if (hi - lo > 3.5) return;
    this.occupied.claim(ox, oz, fx, fz, tx, tz, depth, width);
    this.lots.push({zone: 'rear', spec: {setback: 0, variant}, x: ox, z: oz, fx, fz, tx, tz, width, depth, lo, hi,
      seed: Math.floor(r() * 1e9), seg: seg.id, frontY: lo, name: seg.name});
  }

  /** Build every lot in the tile set (keys "tx,tz" of 256 m tiles) into meshes. */
  build(filter = () => true) {
    const b = new Builder(), boxes = [];
    for (const lot of this.lots) if (filter(lot)) (BUILD[lot.spec.variant] ?? BUILD[lot.zone])(b, lot, boxes);
    return {geometries: b.finish(), boxes};
  }
}

const LOT_KINDS = ['street', 'residential', 'avenue', 'boulevard', 'scenic'];
/** Claimed ground, 1 m cells over the whole map, as a bitmap (a Set of
 *  cell keys cost more than the rest of lot planning put together). */
class Occupancy {
  constructor() { this.x0 = -7700; this.z0 = -5150; this.nx = 15400; this.nz = 10300; this.bits = new Uint32Array(Math.ceil(this.nx * this.nz / 32)); }
  index(x, z) { const i = Math.floor(x) - this.x0, k = Math.floor(z) - this.z0; return i < 0 || k < 0 || i >= this.nx || k >= this.nz ? -1 : i * this.nz + k; }
  hasAt(x, z) { const n = this.index(x, z); return n >= 0 && (this.bits[n >>> 5] & (1 << (n & 31))) !== 0; }
  add(x, z) { const n = this.index(x, z); if (n >= 0) this.bits[n >>> 5] |= 1 << (n & 31); }
  /** A lot's footprint (depth along f, width across t) and a 1 m margin, sampled every metre. */
  claim(ox, oz, fx, fz, tx, tz, depth, width) {
    for (let lx = -1; lx <= depth + 1; lx += 1) for (let lz = -width / 2 - 1; lz <= width / 2 + 1; lz += 1) this.add(ox + fx * lx + tx * lz, oz + fz * lx + tz * lz);
  }
}

/* ------------------------------------------------------------ lot specs
 * Each zone draws a variant, and the variant sets the lot it needs. The
 * variants are West Hollywood's real building types (fictionalised):
 *   Strip: black-box rock clubs with marquees, glass boutiques, patio
 *     restaurants, billboard blocks, 1960s office slabs with sunshades;
 *     towers: a Norman chateau hotel, an art-deco setback tower, a white
 *     balconied hotel, tinted glass.
 *   Avenues: shopfronts under signs, L-shaped mini-malls behind their
 *     parking, streamline-moderne corners, new mixed-use blocks, brick.
 *   Side streets: dingbats over carports, Spanish courtyard apartments,
 *     modern townhouses, plain stucco walk-ups; Spanish, Craftsman, ranch
 *     and modern bungalows.
 *   Hills: cantilevered modernist boxes, Spanish villas, glass houses with
 *     pools, flat-roofed mid-century pavilions. */
const weighted = (r, table) => { let t = r() * table.reduce((a, [, w]) => a + w, 0); for (const [v, w] of table) if ((t -= w) <= 0) return v; return table[0][0]; };
const SIZE = {
  club: r => ({width: 14 + r() * 10, depth: 18 + r() * 10, setback: 1, gap: .4}),
  boutique: r => ({width: 9 + r() * 8, depth: 14 + r() * 8, setback: 1.5, gap: r() < .3 ? 3 : .4}),
  restaurant: r => ({width: 13 + r() * 8, depth: 16 + r() * 8, setback: 4.5, gap: 2 + r() * 3}),
  billboard: r => ({width: 14 + r() * 18, depth: 16 + r() * 14, setback: 1, gap: r() < .3 ? 3 + r() * 5 : .4}),
  office60s: r => ({width: 24 + r() * 12, depth: 20 + r() * 8, setback: 3, gap: 5}),
  decoTower: r => ({width: 26 + r() * 6, depth: 24 + r() * 6, setback: 3, gap: 6}),
  hotelModern: r => ({width: 30 + r() * 10, depth: 20 + r() * 6, setback: 3, gap: 6}),
  glassTower: r => ({width: 26 + r() * 10, depth: 24 + r() * 8, setback: 2, gap: 6}),
  shop: r => ({width: 9 + r() * 12, depth: 14 + r() * 10, setback: 1, gap: r() < .25 ? 4 : .4}),
  minimall: r => ({width: 26 + r() * 14, depth: 25 + r() * 5, setback: 1, gap: 3}),
  dealer: r => ({width: 30 + r() * 12, depth: 26 + r() * 6, setback: 1, gap: 3}),
  gas: r => ({width: 30 + r() * 8, depth: 26 + r() * 4, setback: 1, gap: 3}),
  moderne: r => ({width: 16 + r() * 8, depth: 16 + r() * 8, setback: 1, gap: .4}),
  mixedUse: r => ({width: 28 + r() * 16, depth: 20 + r() * 8, setback: 1.5, gap: 2}),
  brick: r => ({width: 10 + r() * 10, depth: 16 + r() * 8, setback: 1, gap: .4}),
  stucco: r => ({width: 14 + r() * 10, depth: 18 + r() * 10, setback: 3 + r() * 3, gap: 2 + r() * 2}),
  dingbat: r => ({width: 14 + r() * 5, depth: 18 + r() * 6, setback: 2 + r() * 2, gap: 1.5 + r() * 2}),
  courtyard: r => ({width: 22 + r() * 8, depth: 24 + r() * 8, setback: 3 + r() * 2, gap: 2}),
  townhouse: r => ({width: 18 + r() * 10, depth: 16 + r() * 6, setback: 3 + r() * 2, gap: 2 + r() * 2}),
  streamline: r => ({width: 16 + r() * 6, depth: 16 + r() * 6, setback: 3, gap: 2}),
  spanish: r => ({width: 11 + r() * 5, depth: 11 + r() * 5, setback: 5 + r() * 3, gap: 4 + r() * 3}),
  craftsman: r => ({width: 11 + r() * 4, depth: 12 + r() * 5, setback: 6 + r() * 2, gap: 4 + r() * 3}),
  ranch: r => ({width: 15 + r() * 5, depth: 11 + r() * 4, setback: 6 + r() * 3, gap: 4 + r() * 3}),
  modernBox: r => ({width: 11 + r() * 5, depth: 12 + r() * 5, setback: 4 + r() * 3, gap: 3 + r() * 3}),
  modernist: r => ({width: 14 + r() * 10, depth: 12 + r() * 8, setback: 3 + r() * 5, gap: 8 + r() * 16}),
  villa: r => ({width: 18 + r() * 10, depth: 14 + r() * 8, setback: 4 + r() * 5, gap: 8 + r() * 16}),
  glassPool: r => ({width: 20 + r() * 8, depth: 14 + r() * 6, setback: 3 + r() * 4, gap: 8 + r() * 16}),
  midcentury: r => ({width: 18 + r() * 8, depth: 12 + r() * 6, setback: 4 + r() * 4, gap: 8 + r() * 16}),
  ...CITY_SIZE,
  ...HILL_SIZE,
  ...PAS_SIZE,
  ...EAST_SIZE,
};
const VARIANTS = {
  strip: [['club', 3], ['boutique', 3], ['restaurant', 2], ['billboard', 3], ['office60s', 1.2]],
  tower: [['decoTower', 1], ['hotelModern', 1.2], ['glassTower', 1], ['office60s', 1.2]],
  shop: [['shop', 5], ['minimall', 1.6], ['moderne', 1.3], ['mixedUse', 1.6], ['brick', 1.4], ['dealer', .8], ['gas', .5]],
  apartment: [['stucco', 3], ['dingbat', 2.5], ['courtyard', 1.6], ['townhouse', 1.8], ['streamline', 1]],
  bungalow: [['spanish', 3], ['craftsman', 2.2], ['ranch', 1.5], ['modernBox', 1.5]],
  hill: [['modernist', 2], ['villa', 2], ['glassPool', 1.6], ['midcentury', 1.6], ...HILL_VARIANTS],
  ...CITY_VARIANTS,
  ...PAS_VARIANTS,
  ...EAST_VARIANTS,
};
const SPEC = Object.fromEntries(Object.keys(VARIANTS).map(zone => [zone, r => {
  const variant = weighted(r, VARIANTS[zone]);
  return {variant, ...SIZE[variant](r)};
}]));
const LANDMARKS = [
  {variant: 'whale', zone: 'tower', road: /Santa Monica/, near: [-4050, -260], width: 96, depth: 38, setback: 6, relief: 7},
  {variant: 'chateau', zone: 'tower', road: /Sunset/, near: [-3350, -620], width: 44, depth: 30, setback: 5, relief: 12},
  {variant: 'decoTower', zone: 'tower', road: /Sunset/, near: [-3900, -600], width: 30, depth: 28, setback: 3, relief: 5},
  {variant: 'hotelModern', zone: 'tower', road: /Sunset/, near: [-3650, -600], width: 38, depth: 24, setback: 3, relief: 5},
  ...CITY_LANDMARKS,
  ...PAS_LANDMARKS,
  ...EAST_LANDMARKS,
];

/* --------------------------------------------------------------- palettes */
const DARK = ['#141414', '#1b1b1f', '#231a1a', '#2a1f2e', '#15202b', '#3a1414'];
const BRICK = ['#8e4a36', '#9b5a3f', '#7d3f2f', '#a86a4c', '#6e3b2e'];
const DECO = ['#efe6d6', '#ead7c0', '#e8cdb5', '#f1e4cf', '#dcd3c3'];
const CRAFT = ['#6f7a5c', '#8a7a5a', '#5f6b6e', '#9a8263', '#7b5f4a', '#c9b99a', '#4f5d4a'];
const WOOD = ['#9c6b43', '#b07a4c', '#8a5a36', '#c08a5a'];
const BOLD = ['#262626', '#f4f3ef', '#c75b39', '#2f4b5a', '#e0b44c', '#3d5a45', '#8f3b3b'];
const SLATE = ['#3c3f45', '#34373c', '#44403c'];
const SHOP_SIGNS = SIGN.shop, CLUB_SIGNS = SIGN.club, FOOD_SIGNS = SIGN.food, RETAIL_SIGNS = SIGN.retail;

/* --------------------------------------------------------------- builders */
/** Local frame: +x away from the street along (fx, fz), z along the frontage.
 *  Builder maps local x to world (cos a, -sin a), so a = atan2(-fz, fx). This
 *  is also three.js's yaw for the same rotation (colliders use it). */
function lotFrame(lot, base) {
  lot.base = base;                          // colliders stand on this
  return {x: lot.x, z: lot.z, y: base, a: Math.atan2(-lot.fz, lot.fx), base};
}
const baseOf = lot => Math.max(lot.hi, lot.frontY + .15);

/** Parking stalls across a lot, a car's width apart along local z, at local
 *  x = lx, noses toward +x (face 1) or the street (face -1): world poses in
 *  lot.parking for parked.js. */
function stalls(lot, f, lx, z0, z1, face = 1) {
  const ca = Math.cos(f.a), sa = Math.sin(f.a), yaw = Math.atan2(ca * face, -sa * face), out = lot.parking || (lot.parking = []);
  for (let lz = z0 + 1.35; lz <= z1 - 1.35; lz += 2.75) out.push([f.x + lx * ca + lz * sa, f.y + .08, f.z - lx * sa + lz * ca, yaw]);
}
/** AC units, vents and the odd water tank: what flat LA roofs look like from the hills. */
function roofClutter(b, f, r, D, Wd, H, x0 = 0) {
  const n = 1 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const x = x0 + D * (.2 + r() * .6), z = (r() - .5) * Wd * .7;
    if (r() < .75) b.box('trim', f, x, H + .6, z, 1.2 + r(), 1.2, 1.2 + r(), r() < .5 ? '#9ea3a6' : '#c9c6bf');
    else b.box('trim', f, x, H + 1.2, z, 1.6, 2.4, 1.6, '#8e8a82');
  }
}
function foundation(b, f, lot, color, x0 = 0, D = lot.depth, Wd = lot.width) {
  // Down to the lowest ground under the lot, so nothing floats on a slope.
  const drop = f.y - lot.lo + .3;
  if (drop > .35) b.box('wall', f, x0 + D / 2, -drop / 2, 0, D, drop, Wd, color, [0, 3, 3, 0]);
}
/** A lit shop sign flat on the street face. */
function shopSign(b, f, r, y, w, z = 0, list = SHOP_SIGNS, x = -.07) { b.sign('signs', f, x, y, z, w, w * .25, pick(list, r)); }
/** A blade sign standing off the facade, readable up and down the street. */
function bladeSign(b, f, r, y, z, list) {
  const idx = pick(list, r), w = 3.2, h = .8;
  b.box('trim', f, -1.2, y, z, 2.2, h + .2, .12, '#1a1a1a');
  // Turned 90°: its faces look along the street (local ±z).
  for (const s of [-1, 1]) b.sign('signs', f, -1.2, y, z + s * .07, 2.1, h, idx, [0, 0, s]);
  void w;
}
/** Rectangle outline helper for prisms. */
const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
/** A rectangle with one rounded corner (streamline moderne), corner at (x0, z1). */
function roundCorner(x0, x1, z0, z1, rad, n = 8) {
  // Corner centre at (x0 + rad, z1 - rad); the arc runs from the front face (x = x0) round to the side (z = z1).
  const pts = [[x1, z0], [x1, z1]];
  for (let i = 0; i <= n; i++) { const a = i / n * Math.PI / 2; pts.push([x0 + rad - Math.sin(a) * rad, z1 - rad + Math.cos(a) * rad]); }
  pts.push([x0, z0]);
  return pts;
}
function circle(cx, cz, rad, n = 16) { const pts = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]); } return pts; }
function umbrella(b, f, x, z, color, y0 = 0) {
  b.box('trim', f, x, y0 + 1.2, z, .08, 2.4, .08, '#d8d4cc');
  b.cone('awning', f, x, y0 + 2.1, z, 1.35, .55, color, 8);
}

const BUILD = {
  /* ---- Sunset Strip */
  billboard(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base);
    const floors = 1 + (r() < .55 ? 1 : 0) + (r() < .2 ? 1 : 0), fh = 4.6;
    const H = floors * fh, D = lot.depth, Wd = lot.width - .6, color = pick(STRIP, r);
    b.box('wall', f, D / 2, H / 2, 0, D, H, Wd, color, [W.shop, fh, 3 + r() * 2, lot.seed % 997]);
    b.box('wall', f, D / 2, H + .45, 0, D + .3, .9, Wd + .3, color);                       // parapet cap
    roofClutter(b, f, r, D, Wd, H + .9);
    if (r() < .6) b.box('trim', f, -1.1, fh - .6, 0, 2.2, .18, Wd * .9, pick(['#1f1f1f', '#8b1e1e', '#f4f1ea', '#2d4a3e'], r)); // canopy
    if (r() < .7) shopSign(b, f, r, fh - .05, Math.min(Wd * .5, 7));
    foundation(b, f, lot, '#9a9388');
    billboardOn(b, f, r, lot, D, Wd, H + .9);
    boxes.push({lot, h: H + 1});
  },
  club(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base);
    const H = 6 + r() * 4, D = lot.depth, Wd = lot.width - .6, color = pick(DARK, r);
    // A windowless black box with a marquee: music venues on the Strip.
    b.box('wall', f, D / 2, H / 2, 0, D, H, Wd, color, [W.none, 4, 4, 0]);
    b.box('wall', f, D / 2, H + .4, 0, D + .3, .8, Wd + .3, color);
    b.box('trim', f, -.1, 1.4, Wd * (r() - .5) * .4, .3, 2.8, 2.6, '#2b2320');             // doors
    const mw = Math.min(Wd * .75, 12);
    b.box('marquee', f, -1.3, 4.1, 0, 2.6, 1.3, mw, pick(['#1a1a1a', '#6b1010', '#e8e2d4'], r));
    b.sign('signs', f, -2.62, 4.1, 0, mw * .8, 1.05, pick(CLUB_SIGNS, r));
    b.sign('signs', f, -.07, H * .78, 0, Math.min(Wd * .8, 12), Math.min(Wd * .8, 12) * .25, pick(CLUB_SIGNS, r));
    if (r() < .6) bladeSign(b, f, r, H * .55, Wd / 2 - 1.2, CLUB_SIGNS);
    roofClutter(b, f, r, D, Wd, H + .8);
    foundation(b, f, lot, '#2a2a2a');
    if (r() < .5) billboardOn(b, f, r, lot, D, Wd, H + .8);
    boxes.push({lot, h: H + 1});
  },
  boutique(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base);
    const floors = r() < .6 ? 1 : 2, fh = 4.8, H = floors * fh, D = lot.depth, Wd = lot.width - .4;
    const color = pick(['#f4f2ec', '#e9e4da', '#1d1d1d', '#d8cfc0', '#b9b0a2'], r);
    b.box('wall', f, D / 2, H / 2, 0, D, H, Wd, color, [floors > 1 && r() < .5 ? W.curtain : W.shop, fh, 3.8 + r() * 1.5, lot.seed % 997]);
    b.box('wall', f, D / 2, H + .3, 0, D + .15, .6, Wd + .15, color);
    b.box('trim', f, -1.3, fh - .5, 0, 2.6, .14, Wd * .95, pick(['#111', '#f4f1ea', '#6b5e4a'], r));   // flat steel canopy
    shopSign(b, f, r, fh + .2, Math.min(Wd * .45, 5));
    for (const s of [-1, 1]) b.box('trim', f, -.6, .45, s * Wd * .38, 1, .9, 1, '#6e6a62');                  // planters
    roofClutter(b, f, r, D, Wd, H + .6);
    foundation(b, f, lot, '#9a9388');
    boxes.push({lot, h: H + 1});
  },
  restaurant(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base);
    const fh = 4.6, H = fh + (r() < .3 ? 1.5 : 0), D = lot.depth, Wd = lot.width - .4, color = pick([...STUCCO, ...PASTEL], r);
    b.box('wall', f, D / 2, H / 2, 0, D, H, Wd, color, [r() < .5 ? W.arched : W.shop, fh, 3.4, lot.seed % 977]);
    b.box('wall', f, D / 2, H + .4, 0, D + .2, .8, Wd + .2, color);
    shopSign(b, f, r, H - 1, Math.min(Wd * .5, 7), 0, FOOD_SIGNS);
    // Front patio: a deck, a low rail, umbrellas.
    const pd = lot.spec.setback - .8, canvas = pick(['#f1ece2', '#2f5d50', '#8e2b2b', '#e2c06a', '#23395b'], r);
    b.slab('trim', f, -pd, 0, -Wd / 2 + .3, Wd / 2 - .3, .12, '#8f7a62');
    b.box('trim', f, -pd + .05, .5, 0, .1, .9, Wd - .8, '#2a2a2a');
    for (let z = -Wd / 2 + 2; z < Wd / 2 - 1.5; z += 3.4) umbrella(b, f, -pd / 2, z, canvas, .12);
    roofClutter(b, f, r, D, Wd, H + .8);
    foundation(b, f, lot, '#9a9388');
    boxes.push({lot, h: H + 1});
  },
  office60s(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base);
    const floors = 5 + Math.floor(r() * 8), fh = 3.8, D = lot.depth, Wd = lot.width, H = 5 + floors * fh;
    const color = pick(['#e7e4dc', '#d4d0c6', '#c2bcb0', '#efece5'], r);
    b.box('wall', f, D / 2 + 1, 2.5, 0, D - 2, 5, Wd - 4, '#2b2b2b', [W.mixed, 5, 4, lot.seed % 89]);       // recessed glass lobby
    for (const z of [-1, 1]) for (let k = 0; k < 4; k++) b.box('trim', f, 1 + k * (D - 2) / 3, 2.5, z * (Wd / 2 - 1), .6, 5, .6, '#dad6cc');   // pilotis
    b.box('wall', f, D / 2, 5 + floors * fh / 2, 0, D, floors * fh, Wd, color, [r() < .6 ? W.fins : W.ribbon, fh, 4, lot.seed % 983]);
    b.box('trim', f, D / 2, H + .9, 0, D * .5, 1.8, Wd * .4, '#9a958c');
    b.box('wall', f, D / 2, H + .25, 0, D + .4, .5, Wd + .4, color);
    shopSign(b, f, r, 5.6, Math.min(Wd * .4, 8), 0, SIGN.service.filter(i => i === 33).concat(SIGN.retail.slice(0, 3)));
    foundation(b, f, lot, '#8c867c');
    boxes.push({lot, h: H + 2});
  },
  decoTower(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base);
    const D = lot.depth, Wd = lot.width, color = pick(DECO, r), fh = 3.4;
    // Three setbacks, the way 1930s towers stepped back from the street.
    const tiers = [[3, 1, 1, W.shop], [8 + Math.floor(r() * 4), .86, .8, W.deco], [4 + Math.floor(r() * 3), .66, .58, W.deco], [3, .44, .38, W.deco]];
    let y = 0;
    for (const [floors, sd, sw, st] of tiers) {
      const h = floors * (st === W.shop ? 4.2 : fh);
      b.prism('wall', f, rect(D * (1 - sd) / 2, D * (1 + sd) / 2, -Wd * sw / 2, Wd * sw / 2), y, y + h, color, [st, st === W.shop ? 4.2 : fh, 2.2, lot.seed % 971], [0, 0, 0, 0]);
      b.box('trim', f, D / 2, y + h + .2, 0, D * sd + .4, .4, Wd * sw + .4, '#d9ceb9');
      y += h;
    }
    b.box('trim', f, D / 2, y + 2.5, 0, 1.4, 5, 1.4, '#d9ceb9');
    b.cone('trim', f, D / 2, y + 5, 0, .8, 5, '#c8a86a', 4);
    b.sign('signs', f, D * .07 - .05, y - 6, 0, Wd * .38, Wd * .38 * .25, pick([...SIGN.hotel, ...SIGN.club.slice(5)], r));
    foundation(b, f, lot, '#a39c90');
    boxes.push({lot, h: y + 2});
  },
  hotelModern(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base);
    const floors = 9 + Math.floor(r() * 6), fh = 3.3, D = lot.depth, Wd = lot.width, H = 5 + floors * fh;
    b.box('wall', f, D / 2, 2.5, 0, D, 5, Wd, '#1f1f1f', [W.mixed, 5, 4, lot.seed % 91]);
    b.box('wall', f, D / 2 + .5, 5 + floors * fh / 2, 0, D - 1, floors * fh, Wd, '#f3f2ee', [W.punched, fh, 2.6, lot.seed % 983]);
    // Full-width balconies on the street face, every floor, with glass rails.
    for (let k = 1; k <= floors; k++) {
      b.box('trim', f, -.7, 5 + k * fh - .15, 0, 2.4, .25, Wd + .2, '#f7f6f2');
      b.box('trim', f, -1.85, 5 + k * fh + .45, 0, .06, .9, Wd + .2, '#8fa3ad');
    }
    // Rooftop pool deck.
    b.slab('trim', f, 1, D - 1, -Wd / 2 + 1, Wd / 2 - 1, H + .05, '#c9b89c');
    b.slab('pool', f, D * .3, D * .7, -Wd * .3, Wd * .15, H + .15, '#ffffff');
    b.box('trim', f, D * .8, H + 1.5, Wd * .3, D * .25, 3, Wd * .25, '#f3f2ee', [0, 0, 0, 0]);
    for (let z = -Wd * .35; z < Wd * .1; z += 4) umbrella(b, f, D * .15, z, '#f1ece2', H);
    b.sign('signs', f, -.07, 3.6, 0, Math.min(Wd * .3, 7), Math.min(Wd * .3, 7) * .25, SIGN.hotel[0]);
    foundation(b, f, lot, '#8c867c');
    boxes.push({lot, h: H + 2});
  },
  glassTower(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base);
    const floors = 8 + Math.floor(r() * 10), fh = 3.6, H = floors * fh, D = lot.depth, Wd = lot.width;
    const tint = pick(['#4f7d9c', '#5c7f73', '#8a7a62', '#5e6770', '#6d8fb0'], r);
    b.box('wall', f, D / 2, 3, 0, D + 2, 6, Wd + 2, pick(['#e8e2d6', '#2c2c2c', '#d4cbbd'], r), [W.shop, 6, 4, lot.seed % 991]);
    if (r() < .5) b.box('wall', f, D / 2, 6 + (H - 6) / 2, 0, D, H - 6, Wd, tint, [W.tinted, fh, 1.6, lot.seed % 983]);
    else {                                                                   // chamfered plan
      const c = Math.min(D, Wd) * .22;
      b.prism('wall', f, [[0, -Wd / 2 + c], [c, -Wd / 2], [D, -Wd / 2], [D, Wd / 2], [c, Wd / 2], [0, Wd / 2 - c]], 6, H, tint, [W.tinted, fh, 1.6, lot.seed % 983], [0, 0, 0, 0]);
    }
    b.box('trim', f, D / 2, H + .6, 0, D * .8, 1.2, Wd * .8, '#6f7478');
    foundation(b, f, lot, '#9a9388');
    boxes.push({lot, h: H + 1});
  },
  chateau(b, lot, boxes) {
    // Norman chateau hotel: an L of cream masonry, steep slate hip roofs, a
    // round tower with a candle-snuffer roof, arched windows.
    const r = rng(lot.seed), f = lotFrame(lot, lot.hi + .1), D = lot.depth, Wd = lot.width, fh = 3.4, floors = 7, H = floors * fh;
    const cream = '#e9dfc9', slate = pick(SLATE, r);
    b.box('wall', f, 5, H / 2, 0, 10, H, Wd, cream, [W.arched, fh, 3.2, lot.seed % 97]);             // street range
    b.box('wall', f, 10 + (D - 10) / 2, H * .43, Wd / 2 - 6, D - 10, H * .86, 12, cream, [W.arched, fh, 3.2, lot.seed % 89]);   // wing
    b.hip('trim', f, 5, H, 0, 10, Wd, 6, slate);
    b.hip('trim', f, 10 + (D - 10) / 2, H * .86, Wd / 2 - 6, D - 10, 12, 5, slate);
    b.prism('wall', f, circle(2, -Wd / 2 + 3, 3.2, 14), 0, H + 3, cream, [W.arched, fh, 3, 5], [0, 0, 0, 0], {smooth: true});
    b.cone('trim', f, 2, H + 3, -Wd / 2 + 3, 3.8, 7, slate, 14);
    for (const z of [-Wd * .2, Wd * .25]) b.box('wall', f, 6, H + 4.5, z, 1.2, 3, 1.6, cream);         // chimneys
    b.box('trim', f, -.1, fh + .1, 0, .4, .3, Wd, '#cbbd9f');                                         // string course
    b.sign('signs', f, -.12, fh * .7, Wd * .18, 6, 1.5, SIGN.hotel[0]);
    foundation(b, f, lot, '#b9ab90', 0, D, Wd);
    boxes.push({lot, h: H + 4});
  },
  whale(b, lot, boxes) {
    // The blue glass design centre: a long stepped extrusion with a sloping
    // end, and a green glass cube beside it.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const L = Wd * .7, z0 = -Wd / 2 + 2;
    const g = {...f, a: f.a + Math.PI / 2};                          // extrude across the lot: profile runs along the street
    // Profile in (along-street, height). In frame g, local x = -(frame z)... so map carefully:
    // g's local x axis is f's local -z, and g's local z is f's local x.
    const prof = [[0, 0], [L, 0], [L, 14], [L * .78, 14], [L * .66, 26], [L * .3, 26], [L * .16, 14], [0, 14]].map(([u, h]) => [-(z0 + u), h]);
    b.extrude('wall', g, prof, 4, D - 2, '#3a78c2', [W.tinted, 3.5, 1.8, 11]);
    const cz = z0 + L + 4 + (Wd - L - 8) / 2, cw = Math.min(Wd - L - 8, D - 6);
    if (cw > 10) b.box('wall', f, D / 2, cw * .55, cz, cw, cw * 1.1, cw, '#3f8f5a', [W.tinted, 3.5, 1.8, 12]);
    b.slab('lot', f, -lot.spec.setback + .5, 3.5, -Wd / 2 + 1, Wd / 2 - 1, .06, '#ffffff');
    b.sign('signs', f, 3.9, 3, z0 + L * .5, 8, 2, SIGN.retail[2]);
    foundation(b, f, lot, '#8c867c');
    boxes.push({lot, h: 26, lx0: 4, lx1: D - 2});
    void r;
  },
  /* ---- avenues */
  shop(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base);
    const floors = r() < .6 ? 1 : 2, fh = 4.4, H = floors * fh, D = lot.depth, Wd = lot.width - .4;
    const color = pick(r() < .5 ? STUCCO : PASTEL, r);
    b.box('wall', f, D / 2, H / 2, 0, D, H, Wd, color, [W.shop, fh, 3 + r() * 1.5, lot.seed % 977]);
    // Stepped or plain parapet, sometimes a false front taller than the roof.
    const ph = r() < .35 ? 2.2 : 1;
    b.box('wall', f, .3, H + ph / 2, 0, .6, ph, Wd + .2, color);
    b.box('wall', f, D / 2, H + .5, 0, D + .2, 1, Wd + .2, color);
    roofClutter(b, f, r, D, Wd, H + 1);
    if (r() < .7) b.box('awning', f, -.9, 3.2, 0, 1.8, .15, Wd * .92, pick(['#2f5d50', '#8e2b2b', '#23395b', '#6b4f2a', '#1d1d1d'], r));
    shopSign(b, f, r, fh - .15 + (r() < .5 ? .6 : 0), Math.min(Wd * .6, 6.5));
    if (r() < .25) bladeSign(b, f, r, fh + 1, Wd / 2 - 1, SHOP_SIGNS);
    foundation(b, f, lot, '#9a9388');
    boxes.push({lot, h: H + 1});
  },
  minimall(b, lot, boxes) {
    // The LA mini-mall: parking in front, an L of one- and two-storey units behind.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const park = 11, bd = D - park, fh = 4.4, two = r() < .4, H = fh * (two ? 2 : 1), color = pick([...STUCCO, '#e8e1d2', '#d7c5a8'], r);
    b.slab('lot', f, 0, park, -Wd / 2, Wd / 2, .08, '#ffffff');
    stalls(lot, f, park - 2.9, -Wd / 2 + 9.5, Wd / 2 - 3.5, 1);
    b.box('wall', f, park + bd / 2, H / 2, 2, bd, H, Wd - 4, color, [W.shop, fh, 3.4, lot.seed % 977]);
    b.box('wall', f, park * .5, fh / 2, -Wd / 2 + 4, park, fh, 8, color, [W.shop, fh, 3.4, lot.seed % 971]);      // the L
    b.box('trim', f, park - 1, fh - .3, 2, 2.2, .3, Wd - 4, pick(['#8e2b2b', '#23395b', '#2f5d50', '#b5652b'], r)); // covered walk
    b.box('trim', f, park * .5 + 4.2, fh - .3, -Wd / 2 + 4, 1.6, .3, park, pick(['#8e2b2b', '#23395b'], r));
    // A sign over every unit.
    const units = Math.max(2, Math.floor((Wd - 4) / 7));
    for (let k = 0; k < units; k++) b.sign('signs', f, park - .07 - 2.2, fh + .4, -Wd / 2 + 4 + (k + .5) * (Wd - 4) / units, Math.min(5.2, (Wd - 4) / units - 1), 1.1, pick(SHOP_SIGNS, r));
    // Pylon sign at the kerb.
    b.box('trim', f, 1, 3.5, Wd / 2 - 2, .5, 7, .5, '#3a3a3a');
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) b.sign('signs', f, 1 + s * .28, 5.6 - k * 1.1, Wd / 2 - 2, 3.2, .9, pick(SHOP_SIGNS, r), [s, 0, 0]);
    b.box('trim', f, 1, 7.2, Wd / 2 - 2, .6, .3, 3.4, '#3a3a3a');
    roofClutter(b, f, r, bd, Wd - 6, H, park);
    foundation(b, f, lot, '#9a9388', park, bd, Wd);
    boxes.push({lot, h: H + 1, lx0: park, lx1: D});
  },
  moderne(b, lot, boxes) {
    // Streamline moderne: a rounded corner, horizontal speed lines, a tower fin.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width - .4;
    const fh = 4, H = fh * 2, color = pick(['#f2ede3', '#efe6d6', '#e6ebe4', '#f1e0c8'], r), band = pick(['#2f6f6a', '#b8543c', '#35536e', '#c9a14a'], r);
    const plan = roundCorner(0, D, -Wd / 2, Wd / 2, Math.min(6, Wd * .35));
    b.prism('wall', f, plan, 0, H, color, [W.ribbon, fh, 3, lot.seed % 97], [0, 0, 0, 0], {smooth: false});
    for (const y of [fh - .2, H - .9, H - .5]) b.prism('trim', f, roundCorner(-.12, D + .12, -Wd / 2 - .12, Wd / 2 + .12, Math.min(6, Wd * .35) + .12), y, y + .16, band, [0, 0, 0, 0], [0, 0, 0, 0]);
    b.box('wall', f, 2.5, H + 2.5, Wd / 2 - 3, 1, 5, 3.4, color);                                     // the fin
    b.sign('signs', f, 1.95, H + 2.5, Wd / 2 - 3, 3, .75, pick(SHOP_SIGNS, r), [-1, 0, 0]);
    shopSign(b, f, r, fh - .5, Math.min(Wd * .45, 6), -Wd * .15);
    foundation(b, f, lot, '#9a9388');
    boxes.push({lot, h: H + 1});
  },
  mixedUse(b, lot, boxes) {
    // A new Santa Monica Boulevard block: glass shops, then four floors of
    // coloured bays that step in and out, balconies and a roof terrace.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const floors = 3 + Math.floor(r() * 3), gh = 5, fh = 3.2, H = gh + floors * fh;
    b.box('wall', f, D / 2, gh / 2, 0, D, gh, Wd, '#2a2a2a', [W.mixed, gh, 4, lot.seed % 97]);
    const bays = Math.max(3, Math.round(Wd / 9)), bw = Wd / bays, pal = [pick(BOLD, r), pick(BOLD, r), '#f4f3ef'];
    for (let k = 0; k < bays; k++) {
      const z = -Wd / 2 + (k + .5) * bw, out = k % 2 ? 0 : .8, col = pal[k % 3], st = col === '#f4f3ef' ? W.punched : r() < .4 ? W.slats : W.mixed;
      b.box('wall', f, D / 2 - out / 2, gh + floors * fh / 2, z, D + out, floors * fh, bw - .1, col === '#f4f3ef' || st !== W.slats ? col : pick(WOOD, r), [st, fh, 2.6, lot.seed % 89 + k]);
      if (!out) for (let fl = 1; fl < floors; fl++) {
        b.box('trim', f, -.7, gh + fl * fh - .1, z, 1.4, .15, bw - .6, '#e9e6df');
        b.box('trim', f, -1.35, gh + fl * fh + .45, z, .05, .9, bw - .6, '#7e929c');
      }
    }
    b.box('trim', f, D / 2, H + .5, 0, D + .2, 1, Wd + .2, '#262626');
    for (let z = -Wd / 3; z < Wd / 3; z += 5) umbrella(b, f, D * .4, z, pick(['#f1ece2', '#e2c06a'], r), H + 1);
    for (let k = 0; k < Math.floor(Wd / 8); k++) b.sign('signs', f, -.07, gh - .7, -Wd / 2 + 4 + k * 8, 3.6, .9, pick(SHOP_SIGNS, r));
    foundation(b, f, lot, '#8c867c');
    boxes.push({lot, h: H + 1});
  },
  brick(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base);
    const floors = r() < .5 ? 2 : 3, fh = 4, H = floors * fh, D = lot.depth, Wd = lot.width - .4, color = pick(BRICK, r);
    b.box('wall', f, D / 2, H / 2, 0, D, H, Wd, color, [W.brick, fh, 2.6, lot.seed % 977]);
    b.box('wall', f, D / 2, fh / 2, 0, D + .02, fh, Wd + .02, '#2a2622', [W.shop, fh, 3.2, lot.seed % 71]);  // painted shopfront
    b.box('trim', f, D / 2, H + .35, 0, D + .6, .5, Wd + .6, '#d9d2c2');                                   // cornice
    b.box('trim', f, D / 2, H + .75, 0, D + .3, .3, Wd + .3, color);
    b.box('awning', f, -.9, 3.1, 0, 1.8, .15, Wd * .9, pick(['#1d1d1d', '#2f5d50', '#8e2b2b'], r));
    shopSign(b, f, r, fh + .6, Math.min(Wd * .55, 6));
    roofClutter(b, f, r, D, Wd, H + .8);
    foundation(b, f, lot, '#6e5a4c');
    boxes.push({lot, h: H + 1});
  },
  dealer(b, lot, boxes) {
    // A supercar dealer: a forecourt of display cars angled to the street, a
    // tall glass showroom with the marque across its fascia, a brand pylon.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const front = 11, H = 7, brand = pick(SIGN.dealer, r);
    b.slab('trim', f, 0, front, -Wd / 2 + .2, Wd / 2 - .2, .1, '#c9c5bc');
    b.box('wall', f, front + (D - front) / 2, H / 2, 0, D - front, H, Wd - 2, '#e9ebec', [W.curtain, H, 2.4, lot.seed % 97]);
    b.box('wall', f, front + (D - front) / 2 - .3, H + .8, 0, D - front + .6, 1.6, Wd - 1.4, '#16181a', [W.none, 3, 3, 0]);
    { const sw = Math.min(Wd * .45, 9); b.sign('signs', f, front - .66, H + .8, 0, sw, Math.min(1.5, sw / 4), brand); }
    b.box('trim', f, 1, 4, Wd / 2 - 1.5, .5, 8, .5, '#2a2a2a');
    for (const s of [-1, 1]) b.sign('signs', f, 1 + s * .28, 7, Wd / 2 - 1.5, 3.6, .9, brand, [s, 0, 0]);
    // Display cars, recorded in world space for the instanced display fleet.
    lot.cars = [];
    const n = Math.max(2, Math.min(5, Math.floor((Wd - 4) / 6)));
    for (let k = 0; k < n; k++) {
      const lz = -Wd / 2 + 3 + (k + .5) * (Wd - 6) / n, lx = front * .52, ang = (k % 2 ? .5 : -.5) + (r() - .5) * .2;
      const p = b._w(f, lx, .1, lz), dir = b._n(f, [-Math.cos(ang), 0, Math.sin(ang)]);
      lot.cars.push({x: p[0], y: p[1], z: p[2], yaw: Math.atan2(dir[0], dir[2]), paint: r()});
      boxes.push({lot, h: 1.3, lx0: lx - 2, lx1: lx + 2, lz, w: 2.2});
    }
    foundation(b, f, lot, '#8c867c', front, D - front, Wd);
    boxes.push({lot, h: H + 1.6, lx0: front, lx1: D});
  },
  gas(b, lot, boxes) {
    // A filling station: a forecourt graded level with the street (planning
    // levels a pad under it, and a collider makes it the floor), pump islands
    // under a big canopy lit from beneath, a glowing brand band round its
    // fascia, a price pylon at the kerb, and a glass-fronted mini-mart.
    const r = rng(lot.seed), f = lotFrame(lot, lot.graded ? lot.frontY + .1 : baseOf(lot)), D = lot.depth, Wd = lot.width;
    const brand = pick(['#0c4a8c', '#c8202a', '#16813a', '#e59a00', '#1a1a1a'], r), accent = brand === '#e59a00' ? '#1b1b1b' : '#f2f2ee';
    const cx0 = 2.5, cx1 = 16, cw = Wd * .74, mart = 20, H = 5.6;
    // Forecourt: concrete, joints, oil stains; lit pale under the canopy after dark.
    b.slab('trim', f, -.4, D - .3, -Wd / 2 + .2, Wd / 2 - .2, .04, '#aaa69e');
    for (let x = 2; x < mart; x += 4) b.slab('trim', f, x, x + .08, -Wd / 2 + .3, Wd / 2 - .3, .05, '#8f8b84');
    b.slab('glow', f, cx0 + .5, cx1 - .5, -cw / 2 + .5, cw / 2 - .5, .052, '#6f6b63');
    // Canopy: deep fascia with the brand band, soffit lights, slim columns.
    b.box('trim', f, (cx0 + cx1) / 2, H + .45, 0, cx1 - cx0, .9, cw, accent);
    for (const s of [-1, 1]) b.box('glow', f, (cx0 + cx1) / 2, H + .38, s * (cw / 2 + .02), cx1 - cx0 - .2, .34, .04, brand);
    for (const x of [cx0 - .02, cx1 + .02]) b.box('glow', f, x, H + .38, 0, .04, .34, cw - .2, brand);
    for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) b.box('glow', f, cx0 + 2.2 + i * (cx1 - cx0 - 4.4) / 2, H - .03, -cw * .36 + k * cw * .24, 1.6, .05, .9, '#fff7e8');
    b.sign('signs', f, cx0 - .05, H + .45, 0, Math.min(cw * .45, 9), .72, SIGN.fuel[0]);
    const cols = [];
    for (const x of [cx0 + 3, cx1 - 3]) for (const z of [-cw * .3, 0, cw * .3]) {
      b.box('trim', f, x, H / 2, z, .5, H, .5, accent);
      b.box('glow', f, x, 1.2, z, .52, .3, .52, brand);
      cols.push([x, z]);
    }
    // Pump islands: a raised kerb, two dispensers each with a lit screen and a hose.
    for (const z of [-cw * .3, 0, cw * .3]) {
      const xm = (cx0 + cx1) / 2;
      b.box('trim', f, xm, .09, z, 9, .18, 1.3, '#c9c5bd');
      for (const x of [xm - 2.4, xm + 2.4]) {
        b.box('trim', f, x, 1.1, z, .7, 2, 1, '#f0f0ec');
        b.box('trim', f, x, 1.95, z, .74, .3, 1.04, brand);
        for (const s of [-1, 1]) b.box('glow', f, x, 1.45, z + s * .51, .36, .26, .02, '#9fe0ff');
        for (const s of [-1, 1]) b.box('trim', f, x + s * .37, .9, z, .05, .7, .08, '#1a1a1a');
      }
      for (const x of [xm - 4.3, xm + 4.3]) b.box('trim', f, x, .5, z, .22, 1, .22, '#f2c200');   // bollards
      boxes.push({lot, h: 2.2, lx0: xm - 4.5, lx1: xm + 4.5, lz: z, w: 1.3});
    }
    for (const [x, z] of cols) boxes.push({lot, h: H, lx0: x - .25, lx1: x + .25, lz: z, w: .5});
    // Price pylon at the corner of the lot.
    const pz = Wd / 2 - 1.8;
    b.box('trim', f, 1, 3.6, pz, .9, 7.2, 2.6, accent);
    b.box('glow', f, .52, 6.3, pz, .04, 1.1, 2.3, brand);
    for (let k = 0; k < 3; k++) b.box('glow', f, .52, 4.9 - k * .9, pz, .04, .6, 2.1, '#ff5b2e');
    for (const s of [-1, 1]) b.sign('signs', f, 1 + s * .47, 6.3, pz, 2.2, .7, SIGN.fuel[0], [s, 0, 0]);
    boxes.push({lot, h: 7.2, lx0: .55, lx1: 1.45, lz: pz, w: 2.6});
    // Mini-mart: glass front under a flat canopy, a brand band, parking by the door.
    const mw = Wd * .82;
    b.box('wall', f, mart + (D - mart) / 2, 2.4, 0, D - mart, 4.8, mw, '#ecebe6', [W.shop, 4.8, 3.2, lot.seed % 97]);
    b.box('trim', f, mart + (D - mart) / 2, 5.05, 0, D - mart + .6, .5, mw + .6, accent);
    b.box('glow', f, mart - .32, 5.05, 0, .04, .3, mw, brand);
    b.box('trim', f, mart - 1.2, 3.3, 0, 2.4, .2, mw * .9, '#f2f2ee');
    b.box('glow', f, mart - 1.2, 3.19, 0, 1.8, .03, mw * .8, '#fff4df');
    b.sign('signs', f, mart - .07, 4.25, 0, 6, 1.1, pick([...SIGN.food.slice(4, 7)], r));
    for (const s of [-1, 1]) { b.box('trim', f, mart - .5, .5, s * mw * .38, .8, 1, 1.2, '#dfe8f0'); b.box('trim', f, mart - .5, .5, s * mw * .38, .82, .2, 1.22, '#2f6db3'); }   // ice chests
    b.box('trim', f, mart - .6, .7, -mw * .46, .5, 1.4, .5, '#d12a2a');                                     // air pump
    stalls(lot, f, mart - 5, -mw / 2 + .5, -mw * .12, 1);
    foundation(b, f, lot, '#8c867c', mart, D - mart, mw);
    // The forecourt is the floor: a solid slab under the whole lot.
    boxes.push({lot, h: .05, lx0: -.4, lx1: D - .3, w: Wd - .4, floor: true});
    boxes.push({lot, h: 5.3, lx0: mart, lx1: D, w: mw});
  },
  /* ---- apartments */
  stucco(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base);
    const floors = 2 + Math.floor(r() * 3), fh = 3.1, H = floors * fh, D = lot.depth, Wd = lot.width;
    const color = pick(r() < .6 ? STUCCO : PASTEL, r);
    b.box('wall', f, D / 2, H / 2, 0, D, H, Wd, color, [r() < .25 ? W.arched : W.punched, fh, 3 + r() * 1.2, lot.seed % 971]);
    b.box('wall', f, D / 2, H + .35, 0, D + .25, .7, Wd + .25, color);                     // parapet
    if (r() < .5) b.box('trim', f, D / 2, H + .05, 0, D + .35, .22, Wd + .35, pick(['#6c7a6a', '#8a5a44', '#f4f1ea', '#3f4c5a'], r));
    roofClutter(b, f, r, D, Wd, H + .7);
    if (r() < .6) for (let k = 0; k < floors - 1; k++)                                       // balconies
      for (const z of [-Wd * .25, Wd * .25]) {
        b.box('trim', f, -.7, (k + 1) * fh, z, 1.4, .15, Wd * .28, '#e9e4da');
        b.box('trim', f, -1.35, (k + 1) * fh + .5, z, .08, 1, Wd * .28, pick(['#2b2b2b', '#e9e4da'], r));
      }
    foundation(b, f, lot, '#a39c90');
    boxes.push({lot, h: H + 1});
  },
  dingbat(b, lot, boxes) {
    // 1950s dingbat: a stucco box on stilts over an open carport, a
    // decorative panel on the front, and flat roof with a thin fascia.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const up = 1 + (r() < .45 ? 1 : 0), fh = 3, H = fh * (up + 1), color = pick(PASTEL.concat(['#f2ede3', '#e8d9a8', '#cfe0e3']), r);
    b.box('wall', f, D / 2, H / 2, 0, D, H, Wd, color, [W.carport, fh, 3.2, lot.seed % 97]);
    b.box('trim', f, D / 2, H + .15, 0, D + .7, .3, Wd + .7, '#f4f1ea');
    // The dingbat on the front: a vertical feature panel and a starburst.
    const accent = pick(['#2f6f6a', '#b8543c', '#35536e', '#d0a13a', '#6b3f6e'], r), pz = (r() - .5) * Wd * .4;
    b.box('trim', f, -.06, fh + up * fh / 2, pz, .12, up * fh - .4, 2.2, accent);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 4; b.box('trim', f, -.14, fh + up * fh / 2, pz + Wd * .25 * (pz < 0 ? 1 : -1) + 0 * a, .05, Math.abs(Math.cos(a)) * 1.6 + .1, Math.abs(Math.sin(a)) * 1.6 + .1, '#e9c46a'); }
    foundation(b, f, lot, '#a39c90');
    boxes.push({lot, h: H + 1});
  },
  courtyard(b, lot, boxes) {
    // Spanish courtyard apartments: a U of two-storey wings round a garden,
    // tile roofs, arched windows, a fountain in the middle.
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const fh = 3.2, H = fh * 2, wing = 7, color = pick(STUCCO.slice(0, 9), r), tile = pick(TILE_RED, r);
    for (const s of [-1, 1]) {
      b.box('wall', f, D / 2, H / 2, s * (Wd / 2 - wing / 2), D, H, wing, color, [W.arched, fh, 3.2, lot.seed % 97 + s]);
      b.hip('tile', f, D / 2, H, s * (Wd / 2 - wing / 2), D, wing, 2.2, tile, .5);
    }
    b.box('wall', f, D - wing / 2, H / 2, 0, wing, H, Wd - 2 * wing, color, [W.arched, fh, 3.2, lot.seed % 89]);
    b.hip('tile', f, D - wing / 2, H, 0, wing, Wd - 2 * wing + 1, 2.2, tile, .5);
    b.prism('pool', f, circle((D - wing) / 2, 0, 1.4, 12), 0, .5, '#ffffff', [0, 0, 0, 0], [0, 0, 0, 0]);
    b.prism('trim', f, circle((D - wing) / 2, 0, 1.6, 12), 0, .45, '#cdbf9f', [0, 0, 0, 0], [0, 0, 0, 0], {top: false});
    b.box('wall', f, .2, 2.2, 0, .4, 4.4, Wd - 2 * wing, color);                                        // entry wall
    b.box('trim', f, .2, 4.5, 0, .7, .3, Wd - 2 * wing + .4, tile);
    foundation(b, f, lot, '#b2a898');
    boxes.push({lot, h: H + 2, lx0: 0, lx1: D});
  },
  townhouse(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const units = Math.max(2, Math.round(Wd / 6)), uw = Wd / units, fh = 3.2, H = fh * 3;
    for (let k = 0; k < units; k++) {
      const z = -Wd / 2 + (k + .5) * uw, off = k % 2 ? 1.2 : 0, dark = (k + (lot.seed & 1)) % 2 === 0;
      b.box('wall', f, off + (D - off) / 2, H / 2, z, D - off, H, uw - .15, dark ? '#2b2b2d' : '#f3f2ee', [W.mixed, fh, uw / 2, lot.seed % 83 + k]);
      b.box('wall', f, off - .05, fh * 1.5, z + uw * .22, .3, fh * 2.6, uw * .45, pick(WOOD, r), [W.slats, fh, 1.4, k]);
      b.box('trim', f, off + (D - off) / 2, H + .5, z, D - off, 1, .15, '#8a8f93');
    }
    b.box('trim', f, D / 2, H + .1, 0, D, .2, Wd, '#3a3a3a');
    foundation(b, f, lot, '#8c867c');
    boxes.push({lot, h: H + 1});
  },
  streamline(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot), f = lotFrame(lot, base), D = lot.depth, Wd = lot.width;
    const fh = 3.1, floors = 2 + (r() < .5 ? 1 : 0), H = fh * floors, color = pick(['#f2ede3', '#eef0ea', '#f1e4cf', '#e3ece9'], r);
    const rad = Math.min(5, Wd * .3), band = pick(['#2f6f6a', '#35536e', '#b8543c'], r);
    b.prism('wall', f, roundCorner(0, D, -Wd / 2, Wd / 2, rad), 0, H, color, [W.ribbon, fh, 3, lot.seed % 97], [0, 0, 0, 0]);
    for (let k = 1; k <= floors; k++) b.prism('trim', f, roundCorner(-.1, D + .1, -Wd / 2 - .1, Wd / 2 + .1, rad + .1), k * fh - .25, k * fh - .1, band, [0, 0, 0, 0], [0, 0, 0, 0]);
    b.box('wall', f, D / 2, H + .3, 0, D * .9, .6, Wd * .9, color);
    foundation(b, f, lot, '#a39c90');
    boxes.push({lot, h: H + 1});
  },
  /* ---- houses */
  spanish(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot) + .3, f = lotFrame(lot, base);
    const H = 3.4 + (r() < .25 ? 3 : 0), D = lot.depth * .85, Wd = lot.width * .85, color = pick(STUCCO.slice(0, 10), r), tile = pick(TILE_RED, r);
    b.box('wall', f, D / 2 + 1, H / 2, 0, D, H, Wd, color, [W.arched, 3.4, 3.2 + r(), lot.seed % 967]);
    b.gable('tile', f, D / 2 + 1, H, 0, D, Wd, 2 + r() * 1.2, tile);
    b.box('wall', f, .2, 1.2, -Wd * .25, 1.6, 2.4, Wd * .35, color, [W.arched, 3, 3, 3]);          // porch
    b.box('trim', f, .2, 2.5, -Wd * .25, 1.9, .25, Wd * .38, tile);
    b.box('wall', f, D * .6, H + 2.4, Wd / 2 - .8, .9, 2.4, .9, color);                                // chimney
    foundation(b, f, lot, '#b2a898');
    boxes.push({lot, h: H + 2});
  },
  craftsman(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot) + .5, f = lotFrame(lot, base);
    const H = 3.3, D = lot.depth * .8, Wd = lot.width * .8, color = pick(CRAFT, r), roof = pick(['#4b4038', '#3e3a36', '#5a4a3c', '#57524a'], r);
    b.box('wall', f, D / 2 + 2.4, H / 2, 0, D, H, Wd, color, [W.clapboard, 3.3, 2.8, lot.seed % 967]);
    b.gable('trim', f, D / 2 + 2.4, H, 0, D, Wd, 1.7, roof);
    // Deep porch under its own low gable, on tapered stone-and-timber piers.
    b.slab('trim', f, 0, 2.4, -Wd / 2 + .5, Wd / 2 - .5, .35, '#8a7a66');
    for (const z of [-Wd / 2 + .9, Wd / 2 - .9]) { b.box('trim', f, .5, .8, z, .7, 1.3, .7, '#8f8579'); b.box('trim', f, .5, 2.2, z, .35, 1.6, .35, '#efe9dc'); }
    b.box('trim', f, 1.2, 3.1, 0, 2.8, .25, Wd + .2, '#efe9dc');
    foundation(b, f, lot, '#8f8579');
    boxes.push({lot, h: H + 2});
  },
  ranch(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot) + .2, f = lotFrame(lot, base);
    const H = 3, D = lot.depth * .85, Wd = lot.width * .9, color = pick([...STUCCO.slice(0, 8), '#d9d4c7'], r);
    b.box('wall', f, D / 2 + 1, H / 2, 0, D, H, Wd, color, [W.punched, 3, 3.6, lot.seed % 967]);
    b.hip(r() < .5 ? 'tile' : 'trim', f, D / 2 + 1, H, 0, D, Wd, 1.5, r() < .5 ? pick(TILE_RED, r) : pick(['#5b5750', '#6d665c', '#4e4a44'], r), .8);
    b.box('trim', f, 1.1, 1.1, Wd / 2 - 3, .2, 2.2, 4.4, '#ece8df');                                  // garage door
    foundation(b, f, lot, '#b2a898');
    boxes.push({lot, h: H + 2});
  },
  modernBox(b, lot, boxes) {
    const r = rng(lot.seed), base = baseOf(lot) + .3, f = lotFrame(lot, base);
    const D = lot.depth * .85, Wd = lot.width * .85, two = r() < .6, H = two ? 6.4 : 3.4;
    b.box('wall', f, D / 2 + 1, 1.7, 0, D, 3.4, Wd, '#f4f3ef', [W.mixed, 3.4, 3, lot.seed % 97]);
    if (two) b.box('wall', f, D / 2 + .2, 3.4 + 1.5, -Wd * .12, D * .9, 3, Wd * .76, pick(['#2b2b2d', '#f4f3ef', ...WOOD], r), [W.slats, 3, 1.6, lot.seed % 89]);
    b.box('trim', f, D / 2 + .5, H + .1, 0, D + 1.4, .2, Wd + .8, '#e9e6df');
    foundation(b, f, lot, '#8c867c');
    boxes.push({lot, h: H + 1});
  },
  rear(b, lot, boxes) {
    const r = rng(lot.seed), f = lotFrame(lot, lot.hi + .1);
    const floors = r() < .45 ? 1 : 2 + (r() < .3 ? 1 : 0), fh = 3.1, H = floors * fh, D = lot.depth, Wd = lot.width;
    const color = pick(r() < .6 ? STUCCO : PASTEL, r);
    b.box('wall', f, D / 2, H / 2, 0, D, H, Wd, color, [floors === 1 ? W.none : r() < .3 ? W.carport : W.punched, fh, 3.2, lot.seed % 941]);
    if (floors > 1) { b.box('wall', f, D / 2, H + .3, 0, D + .2, .6, Wd + .2, color); roofClutter(b, f, r, D, Wd, H + .6); }
    else b.gable('tile', f, D / 2, H, 0, D, Wd, 1.6, pick(TILE_RED, r));
    foundation(b, f, lot, '#a39c90');
    boxes.push({lot, h: H + 1});
  },
  /* ---- the hills */
  modernist(b, lot, boxes) {
    const r = rng(lot.seed), f = lotFrame(lot, lot.hi + .2);
    // Stepped modernist boxes: a main level and a cantilevered upper box.
    const D = lot.depth * .8, Wd = lot.width * .8, H1 = 3.4, color = pick(HILL, r);
    b.box('wall', f, D / 2 + 1, H1 / 2, 0, D, H1, Wd, color, [W.ribbon, H1, 4, lot.seed % 961]);
    b.box('wall', f, D / 2 + (r() - .5) * 3, H1 + 1.7, (r() - .5) * 4, D * .75, 3.4, Wd * .8, pick(HILL, r), [W.ribbon, 3.4, 4, lot.seed % 953]);
    b.box('trim', f, D / 2 + 1, H1 + 3.5, 0, D + .4, .25, Wd + .4, '#3b3b3b');
    stilts(b, f, lot, D, Wd, 1);
    boxes.push({lot, h: H1 + 3.4});
  },
  villa(b, lot, boxes) {
    const r = rng(lot.seed), f = lotFrame(lot, lot.hi + .2), D = lot.depth * .8, Wd = lot.width * .62;
    const H = 6.6, color = pick(STUCCO.slice(0, 7), r), tile = pick(TILE_RED, r), zc = -lot.width * .17;
    b.box('wall', f, D / 2 + 1, H / 2, zc, D, H, Wd, color, [W.arched, 3.3, 3.4, lot.seed % 961]);
    b.hip('tile', f, D / 2 + 1, H, zc, D, Wd, 2.6, tile, .7);
    b.box('wall', f, D * .35 + 1, 1.7, zc + Wd / 2 + 2.5, D * .7, 3.4, 5, color, [W.arched, 3.3, 3.4, 7]);
    b.hip('tile', f, D * .35 + 1, 3.4, zc + Wd / 2 + 2.5, D * .7, 5, 1.6, tile, .5);
    b.slab('trim', f, D * .75 + 1, D + 1, zc + Wd / 2 + .5, lot.width * .45, .12, '#d8cbb0');
    b.slab('pool', f, D * .8 + 1, D + .5, zc + Wd / 2 + 1.5, lot.width * .42, .2, '#ffffff');
    stilts(b, f, lot, D, lot.width * .9, 1);
    boxes.push({lot, h: H + 2});
  },
  glassPool(b, lot, boxes) {
    const r = rng(lot.seed), f = lotFrame(lot, lot.hi + .2), D = lot.depth * .8, Wd = lot.width * .8;
    b.box('wall', f, D / 2 + 1, 1.7, -Wd * .15, D * .8, 3.4, Wd * .6, '#e9e6df', [W.curtain, 3.4, 2.2, lot.seed % 961]);
    b.box('wall', f, D / 2 + .2, 3.4 + 1.7, Wd * .05, D, 3.4, Wd * .75, pick(['#f3f1ec', '#2b2b2d', '#e2ddd3'], r), [W.curtain, 3.4, 2.4, lot.seed % 953]);
    b.box('trim', f, D / 2 + .2, 6.9, Wd * .05, D + 1.6, .25, Wd * .75 + 1.6, '#f3f1ec');
    b.slab('trim', f, .3, D * .7, Wd * .18, Wd / 2, .15, '#cdbfa6');
    b.slab('pool', f, .8, D * .6, Wd * .22, Wd / 2 - .4, .22, '#ffffff');
    stilts(b, f, lot, D, Wd, 1);
    boxes.push({lot, h: 7});
  },
  midcentury(b, lot, boxes) {
    const r = rng(lot.seed), f = lotFrame(lot, lot.hi + .2), D = lot.depth * .75, Wd = lot.width * .8;
    b.box('wall', f, D / 2 + 1.5, 1.6, 0, D, 3.2, Wd, '#ece8df', [W.curtain, 3.2, 3, lot.seed % 961]);
    b.box('trim', f, D / 2 + 1.5, 3.35, 0, D + 3, .3, Wd + 3, pick(['#f4f3ef', '#d9d4c7', '#3b3b3b'], r));     // floating roof
    b.box('trim', f, D * .7 + 1.5, 2.5, -Wd / 2 + 1.5, 1.6, 5, 1.2, '#8b8378');                            // stone chimney
    b.slab('pool', f, -.2, 1.2, -Wd * .3, Wd * .3, .15, '#ffffff');
    stilts(b, f, lot, D + 1.5, Wd, 0);
    boxes.push({lot, h: 4});
  },
};
BUILD.strip = BUILD.billboard;
BUILD.tower = BUILD.glassTower;
BUILD.apartment = BUILD.stucco;
BUILD.bungalow = BUILD.spanish;
BUILD.hill = BUILD.modernist;
Object.assign(BUILD, CITY_BUILD, PAS_BUILD, EAST_BUILD, HILL_BUILD);

/** The Strip's rooftop billboards. */
function billboardOn(b, f, r, lot, D, Wd, H) {
  if (r() > .55) return;
  const bw = Math.min(Wd * .95, 14 + r() * 6), bh = bw * .32, lift = 3.5;
  lot.billboard = Math.floor(r() * 6);
  b.box('trim', f, D * .45, H + lift + bh / 2, 0, .5, bh + .4, bw + .4, '#2a2a2a');
  b.panel('billboard', f, D * .45 - .27, H + lift + bh / 2, 0, bw, bh, lot.billboard);
  b.box('trim', f, D * .45 + .6, H + lift / 2, -bw * .3, .3, lift, .3, '#3a3a3a');
  b.box('trim', f, D * .45 + .6, H + lift / 2, bw * .3, .3, lift, .3, '#3a3a3a');
}
/** Hillside houses: a retaining wall / stilts down to the ground. */
function stilts(b, f, lot, D, Wd, x0) {
  const drop = f.y - lot.lo;
  if (drop > .4) b.box('wall', f, D / 2 + x0, -drop / 2, 0, D * .92, drop, Wd * .92, '#cfc8bb', [0, 3, 3, 0]);
}
export {BUILD, SPEC, W, stalls, lotFrame, baseOf, roofClutter, foundation, shopSign, bladeSign, rect, circle,
  STUCCO, PASTEL, BRICK, DECO, SLATE, TILE_RED, WOOD};
