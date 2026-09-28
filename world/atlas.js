/* The Los Santerra map (2026-09-27): drawn from the road network itself.
 *
 * Replaces the painted reference image as the in-game map. One renderer for
 * both the minimap (heading-up, around the car) and the full atlas (pan and
 * zoom): a baked shaded-relief layer (tools/build_relief.mjs) with every
 * planned building lot as a block, then the roads as vectors by class
 * (freeways amber and cased, ramps, boulevards, avenues, streets, residential
 * and canyon roads, dirt), bridges cased, tunnels dashed with portal marks,
 * freeway shields, district names, places, the route and the car.
 *
 * World: +x east, +z south, metres; the map is 15.36 x 10.24 km.
 */
import {beachAt, shoreZ} from './coast.js';
import {shield, ROUTES, routeOf} from './freewaySigns.js';

const X0 = -7680, Z0 = -5120, WM = 15360, HM = 10240, BASE_MPP = 5;

/* Road classes, in draw order (bottom first). w: width in metres at close
 * zoom, px: minimum screen width, min: hidden when metres-per-pixel exceeds it. */
export const CLASSES = [
  {key: 'residential', kinds: ['residential'], color: '#5d6b73', w: 7, px: .6, min: 9, label: 'Residential'},
  {key: 'street', kinds: ['street', 'underpass'], color: '#7f8d95', w: 9, px: .7, min: 14, label: 'Street'},
  {key: 'scenic', kinds: ['scenic'], color: '#8fae84', w: 7, px: .8, min: 30, label: 'Canyon road'},
  {key: 'dirt', kinds: ['dirt'], color: '#a38a64', w: 5, px: .8, min: 30, dash: [5, 4], label: 'Dirt track'},
  {key: 'avenue', kinds: ['avenue'], color: '#c9d2d6', w: 14, px: 1.1, min: 99, label: 'Avenue'},
  {key: 'boulevard', kinds: ['boulevard'], color: '#f3e7c6', w: 22, px: 1.8, min: 99, casing: '#1a1409', label: 'Boulevard'},
  {key: 'ramp', kinds: ['ramp'], color: '#e7a24a', w: 8, px: 1.1, min: 99, label: 'Ramp'},
  {key: 'freeway', kinds: ['freeway'], color: '#f5b04a', w: 34, px: 2.6, min: 99, casing: '#2b1703', label: 'Freeway'},
  {key: 'tunnel', kinds: ['tunnel'], color: '#7fd6e8', w: 12, px: 1.8, min: 99, dash: [6, 4], label: 'Tunnel'},
];
const DISTRICTS = [
  ['WEST HOLLYWOOD', 393, 398], ['BEVERLY HILLS', 350, 540], ['HOLLYWOOD', 633, 452], ['FAIRFAX', 546, 538],
  ['HANCOCK PARK', 684, 576], ['KOREATOWN', 577, 676], ['MID-CITY', 304, 726], ['CULVER CITY', 171, 842],
  ['SILVER LAKE', 825, 443], ['ECHO PARK', 913, 510], ['DOWNTOWN', 864, 666], ['PASADENA', 1022, 237],
  ['SAN MARINO', 1271, 281], ['EAGLE ROCK', 1058, 385], ['ALHAMBRA', 1200, 464], ['EL MONTE', 1436, 485],
  ['MONTEREY PARK', 1236, 664], ['EAST LOS SANTERRA', 1217, 838], ['SOUTH LOS SANTERRA', 760, 900],
  ['VERDUGO MOUNTAINS', 483, 165, 1], ['SAN GABRIEL MOUNTAINS', 1270, 72, 1], ['HOLLYWOOD HILLS', 560, 300, 1],
].map(([name, px, py, hills]) => ({name, x: (px - 768) * 10, z: (py - 512) * 10, hills: !!hills}));

/* Built landmarks, by the variant that builds them. */
const LANDMARK_NAMES = {
  bankTower: ['Meridian Bank Tower', 'tower'], cityHall: ['City Hall', 'civic'], recordTower: ['Record Tower', 'tower'],
  grandHotel: ['The Beverly Crown', 'hotel'], bhCityHall: ['Beverly Hills City Hall', 'civic'], stadium: ['Arroyo Bowl', 'stadium'],
  library: ['The Hartley', 'museum'], coliseum: ['Exposition Coliseum', 'stadium'], museum: ['Natural History Museum', 'museum'],
  studioGate: ['Santerra Pictures', 'studio'], smhs: ['San Marino High School', 'school'], pasCityHall: ['Pasadena City Hall', 'civic'],
  chateau: ['Chateau Marmont', 'hotel'], whale: ['Pacific Design Center', 'landmark'], theatre: ['Hollywood Palace', 'theatre'],
};
const ICON = {tower: '▲', civic: '◆', hotel: '★', stadium: '◎', museum: '■', studio: '✦', school: '✚', theatre: '♦', landmark: '●', view: '▲', district: '●', home: '⌂', raceway: '⚑', beach: '≈'};

export class Atlas {
  constructor({net, model, lots}) {
    this.net = net; this.model = model;
    // Road segments per class, as flat [x0, z0, x1, z1, ...] arrays.
    this.byClass = CLASSES.map(c => ({...c, segs: []}));
    const kindTo = new Map(); CLASSES.forEach((c, i) => c.kinds.forEach(k => kindTo.set(k, i)));
    this.bridges = [];
    for (const e of net.edges) {
      const ci = kindTo.get(e.kind); if (ci === undefined) continue;
      this.byClass[ci].segs.push(e.p[0], e.p[2], e.q[0], e.q[2]);
    }
    for (const c of this.byClass) c.segs = new Float32Array(c.segs);
    // Tunnel portals and freeway shield spots.
    this.tunnels = [];
    for (const seg of model.segments) if (seg.kind === 'tunnel') {
      const a = model.sectionAt(seg, 0), b = model.sectionAt(seg, seg.L), m = model.sectionAt(seg, seg.L / 2);
      this.tunnels.push({x: m.x, z: m.z, ends: [[a.x, a.z], [b.x, b.z]], name: net.edges[m.e].name, L: seg.L});
    }
    // One label per tunnel name, on its longest bore.
    for (const t of this.tunnels) t.label = !this.tunnels.some(o => o !== t && o.name === t.name && (o.L > t.L || (o.L === t.L && this.tunnels.indexOf(o) < this.tunnels.indexOf(t))));
    this.shields = [];
    for (const seg of model.segments) if (seg.kind === 'freeway' && seg.L > 600) {
      const m = model.sectionAt(seg, seg.L / 2), r = routeOf(net.edges[m.e].name || '');
      if (r && ROUTES[r] && !this.shields.some(s => s.r === r && Math.hypot(s.x - m.x, s.z - m.z) < 1800)) this.shields.push({x: m.x, z: m.z, r});
    }
    // Places: built landmarks where they stand, then the named places of the map data.
    this.places = [];
    for (const lot of lots) if (lot.landmark && LANDMARK_NAMES[lot.landmark] && !this.places.some(p => p.name === LANDMARK_NAMES[lot.landmark][0])) {
      const [name, kind] = LANDMARK_NAMES[lot.landmark];
      this.places.push({name, kind, x: lot.x + lot.fx * lot.depth / 2, z: lot.z + lot.fz * lot.depth / 2});
    }
    for (const l of net.data.landmarks) if (!this.places.some(p => p.name === l.name))
      this.places.push({name: l.name, kind: /Overlook|Sign/.test(l.name) ? 'view' : 'landmark', x: (l.map[0] - 768) * 10, z: (l.map[1] - 512) * 10});
    // Road ends inside the map (not at its edge): the network's loose threads.
    const deg = new Map(); for (const e of net.edges) for (const n of [e.a, e.b]) deg.set(n, (deg.get(n) || 0) + 1);
    this.deadEnds = [];
    for (const [n, d] of deg) if (d === 1) { const p = net.nodes[n].position; if (7680 - Math.abs(p[0]) > 400 && 5120 - Math.abs(p[2]) > 400) this.deadEnds.push([p[0], p[2]]); }
    this.districts = DISTRICTS;
    this.lots = lots;
    this.base = null;
    const relief = new Image();
    relief.onload = () => this.buildBase(relief);
    relief.src = new URL('../assets/world/relief.png', import.meta.url).href;
  }

  /** Relief + city blocks, baked once at BASE_MPP metres per pixel. */
  buildBase(relief) {
    const w = WM / BASE_MPP, h = HM / BASE_MPP;
    const src = document.createElement('canvas'); src.width = relief.width; src.height = relief.height;
    const sg = src.getContext('2d', {willReadFrequently: true}); sg.drawImage(relief, 0, 0);
    const img = sg.getImageData(0, 0, src.width, src.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const shade = d[i] / 255, rise = d[i + 1] / 255, slope = d[i + 2] / 255;
      // Basin: deep blue-slate. Hills: dark olive, lit by the hillshade.
      const hill = Math.min(1, rise * 1.4), lit = .55 + (shade - .7) * 1.6 * (.35 + hill * .9);
      const r = (14 + hill * 12) * lit + slope * 6, g = (22 + hill * 22) * lit + slope * 5, b = (29 + hill * 4) * lit + slope * 3;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      // The coast (world/coast.js): sand, then the Pacific.
      const px = (i >> 2) % src.width, pz = Math.floor((i >> 2) / src.width);
      const wx = X0 + (px + .5) * WM / src.width, wz = Z0 + (pz + .5) * HM / src.height;
      if (beachAt(wx, wz) > .5) {
        const sea = wz > shoreZ(wx), deep = Math.min(1, Math.max(0, (wz - shoreZ(wx)) / 600));
        if (sea) { d[i] = 12 - deep * 4; d[i + 1] = 44 - deep * 16; d[i + 2] = 62 - deep * 14; }
        else { d[i] = 78; d[i + 1] = 70; d[i + 2] = 52; }
      }
    }
    sg.putImageData(img, 0, 0);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, w, h);
    // City blocks: every planned lot, slightly lighter than the ground.
    g.save(); g.scale(1 / BASE_MPP, 1 / BASE_MPP); g.translate(-X0, -Z0);
    g.fillStyle = '#2a3740';
    g.beginPath();
    for (const l of this.lots) {
      const W2 = l.width / 2, D = l.depth, P = (a, b) => [l.x + l.fx * a + l.tx * b, l.z + l.fz * a + l.tz * b];
      const p0 = P(0, -W2), p1 = P(0, W2), p2 = P(D, W2), p3 = P(D, -W2);
      g.moveTo(...p0); g.lineTo(...p1); g.lineTo(...p2); g.lineTo(...p3); g.closePath();
    }
    g.fill();
    g.restore();
    this.base = c;
  }

  /**
   * Draw into a 2D context.
   * view: {cx, cz, mpp, rot (0 = north up), w, h, route: [edge ids], car: {x, z, heading},
   *        labels, dest: {x, z}, hover}
   */
  draw(ctx, view) {
    const {cx, cz, mpp, rot = 0, w, h} = view, c = Math.cos(rot), s = Math.sin(rot);
    const toScreen = (x, z) => { const dx = (x - cx) / mpp, dz = (z - cz) / mpp; return [w / 2 + dx * c - dz * s, h / 2 + dx * s + dz * c]; };
    this.toScreen = toScreen;
    ctx.save();
    ctx.fillStyle = '#0b1217'; ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2); ctx.rotate(rot); ctx.scale(1 / mpp, 1 / mpp); ctx.translate(-cx, -cz);
    if (this.base) { ctx.imageSmoothingEnabled = true; ctx.drawImage(this.base, X0, Z0, WM, HM); }
    // Visible world rectangle (generous when rotated).
    const R = Math.hypot(w, h) / 2 * mpp + 60, bx0 = cx - R, bx1 = cx + R, bz0 = cz - R, bz1 = cz + R;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const stroke = (segs, width, color, dash) => {
      ctx.beginPath();
      for (let i = 0; i < segs.length; i += 4) {
        const x0 = segs[i], z0 = segs[i + 1], x1 = segs[i + 2], z1 = segs[i + 3];
        if ((x0 < bx0 && x1 < bx0) || (x0 > bx1 && x1 > bx1) || (z0 < bz0 && z1 < bz0) || (z0 > bz1 && z1 > bz1)) continue;
        ctx.moveTo(x0, z0); ctx.lineTo(x1, z1);
      }
      ctx.setLineDash(dash ? dash.map(v => v * mpp) : []);
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    };
    // Casings first (freeways, boulevards), then fills.
    for (const k of this.byClass) if (k.casing && mpp <= k.min) stroke(k.segs, Math.max(k.w, (k.px + 2) * mpp) + 3 * mpp, k.casing);
    for (const k of this.byClass) {
      if (mpp > k.min) continue;
      const fade = k.min < 99 ? Math.min(1, (k.min - mpp) / (k.min * .5)) : 1;
      ctx.globalAlpha = fade;
      stroke(k.segs, Math.max(k.w, k.px * mpp), k.color, k.dash);
      ctx.globalAlpha = 1;
    }
    // Route: a cased bright line over everything.
    if (view.route?.length) {
      const segs = [];
      for (const id of view.route) { const e = this.net.edges[id]; if (e) segs.push(e.p[0], e.p[2], e.q[0], e.q[2]); }
      stroke(segs, Math.max(16, 7 * mpp), 'rgba(6,20,26,.85)');
      stroke(segs, Math.max(9, 4 * mpp), '#63e6ff');
    }
    ctx.setLineDash([]);
    ctx.restore();

    // Screen-space overlays.
    const txt = (t, x, y, font, fill, stroke = 'rgba(6,12,16,.85)', lw = 3) => { ctx.font = font; ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(t, x, y); ctx.fillStyle = fill; ctx.fillText(t, x, y); };
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const onScreen = ([x, y], m = 30) => x > -m && y > -m && x < w + m && y < h + m;
    if (view.labels !== false) {
      // Districts.
      if (mpp < 26) for (const d of this.districts) {
        const p = toScreen(d.x, d.z); if (!onScreen(p, 100)) continue;
        const size = Math.round(Math.max(10, Math.min(20, 160 / mpp)));
        ctx.save(); ctx.globalAlpha = d.hills ? .45 : .62;
        if (ctx.letterSpacing !== undefined) ctx.letterSpacing = Math.round(size * .28) + 'px';
        txt(d.name, p[0], p[1], `${d.hills ? 'italic 400' : '600'} ${size}px Outfit, Arial`, d.hills ? '#b9cfae' : '#e9eee2', 'rgba(6,12,16,.55)', 4);
        ctx.restore();
      }
      // Tunnel portals.
      if (mpp < 20) for (const t of this.tunnels) for (const [x, z] of t.ends) {
        const p = toScreen(x, z); if (!onScreen(p)) continue;
        ctx.beginPath(); ctx.arc(p[0], p[1], 3.5, Math.PI, 0); ctx.lineTo(p[0] + 3.5, p[1] + 2.5); ctx.lineTo(p[0] - 3.5, p[1] + 2.5); ctx.closePath();
        ctx.fillStyle = '#7fd6e8'; ctx.fill(); ctx.strokeStyle = '#06121a'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      if (mpp < 8) for (const t of this.tunnels) { if (!t.label) continue; const p = toScreen(t.x, t.z); if (onScreen(p)) txt(t.name.replace(/( Road)? Tunnel$/, '') + ' Tunnel', p[0], p[1] - 12, '600 10px Outfit, Arial', '#a9e6f2'); }
      // Freeway shields.
      if (mpp < 30) for (const sh of this.shields) {
        const p = toScreen(sh.x, sh.z); if (!onScreen(p)) continue;
        const R2 = ROUTES[sh.r]; shield(ctx, R2.shield, R2.num || sh.r, p[0], p[1], mpp < 8 ? .62 : .5);
      }
      // Set pieces off the road network: the race circuit, the drag strip.
      for (const e of this.extras || []) {
        ctx.beginPath();
        e.pts.forEach(([x, z], i) => { const p = toScreen(x, z); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
        if (e.closed) ctx.closePath();
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = '#1a1208'; ctx.lineWidth = Math.max(3, e.w / mpp + 2.5); ctx.stroke();
        ctx.strokeStyle = e.color; ctx.lineWidth = Math.max(1.6, e.w / mpp); ctx.stroke();
      }
      // Places.
      for (const pl of this.places) {
        const p = toScreen(pl.x, pl.z); if (!onScreen(p)) continue;
        const hot = view.hover === pl || view.selected === pl;
        ctx.beginPath(); ctx.arc(p[0], p[1], hot ? 11 : 8.5, 0, Math.PI * 2);
        ctx.fillStyle = hot ? '#63e6ff' : 'rgba(12,22,28,.92)'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = hot ? '#e8fbff' : pl.kind === 'home' ? '#9fe08a' : pl.kind === 'raceway' ? '#ff8a5c' : '#d8c38e'; ctx.stroke();
        ctx.fillStyle = hot ? '#06202a' : '#f1dfae'; ctx.font = '700 9px Outfit, Arial'; ctx.fillText(ICON[pl.kind] || '●', p[0], p[1] + .5);
        if (mpp < 16 || hot) { ctx.textAlign = 'left'; txt(pl.name, p[0] + 13, p[1], `${hot ? 600 : 500} 11px Outfit, Arial`, hot ? '#e8fbff' : '#efe6cf'); ctx.textAlign = 'center'; }
      }
    }
    if (view.issues) for (const [x, z] of this.deadEnds) {
      const p = toScreen(x, z); if (!onScreen(p)) continue;
      ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,90,70,.9)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#1a0503'; ctx.stroke();
    }
    // Destination pin.
    if (view.dest) {
      const p = toScreen(view.dest.x, view.dest.z);
      ctx.save(); ctx.translate(p[0], p[1] - 2);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-9, -12, -9, -22, 0, -24); ctx.bezierCurveTo(9, -22, 9, -12, 0, 0);
      ctx.fillStyle = '#63e6ff'; ctx.shadowColor = '#63e6ff'; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = '#04141b'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -15, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#04141b'; ctx.fill();
      ctx.restore();
    }
    // The car.
    if (view.car) {
      const p = toScreen(view.car.x, view.car.z);
      ctx.save(); ctx.translate(...p); ctx.rotate(-view.car.heading + rot + Math.PI);
      ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(8, 9); ctx.lineTo(0, 4); ctx.lineTo(-8, 9); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#9fe9ff'; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
      ctx.lineWidth = 2; ctx.strokeStyle = '#06121a'; ctx.stroke(); ctx.restore();
    }
  }
  /** Screen point back to world (inverse of the last draw's view). */
  toWorld(view, sx, sy) {
    const c = Math.cos(-(view.rot || 0)), s = Math.sin(-(view.rot || 0)), dx = sx - view.w / 2, dy = sy - view.h / 2;
    return [view.cx + (dx * c - dy * s) * view.mpp, view.cz + (dx * s + dy * c) * view.mpp];
  }
  placeAt(view, sx, sy, r = 14) {
    let best = null, bd = r;
    for (const pl of this.places) { const p = this.toScreen(pl.x, pl.z), d = Math.hypot(p[0] - sx, p[1] - sy); if (d < bd) { bd = d; best = pl; } }
    return best;
  }
}
export const MAP_BOUNDS = {X0, Z0, WM, HM};
