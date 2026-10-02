/* Procedural textures, generated once at load (no downloads).
 *
 * Everything tiles: noise is periodic on the texture size. Each surface gets a
 * colour map and, where the light should catch it (asphalt at sunset), a normal
 * map derived from the same height field so the two agree.
 */
import * as T from 'three';

const rng = seed => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };

/** Periodic value noise on an n x n lattice, sampled at (x, y) in [0, n). */
function lattice(n, seed) {
  const r = rng(seed), v = new Float32Array(n * n);
  for (let i = 0; i < v.length; i++) v[i] = r();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = (a, b) => v[((b % n + n) % n) * n + ((a % n + n) % n)];
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
}
/** Tileable fBm over a size x size texture: octaves double the lattice. */
function fbm(size, base, octaves, seed) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push({f: lattice(base << o, seed + o * 101), n: base << o, w: .5 ** o});
  const norm = layers.reduce((s, l) => s + l.w, 0);
  return (px, py) => {
    let s = 0;
    for (const l of layers) s += l.f(px / size * l.n, py / size * l.n) * l.w;
    return s / norm;
  };
}

function canvasTexture(size, paint, {srgb = true, repeat = true} = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'), img = ctx.createImageData(size, size);
  paint(img.data, size, ctx);
  ctx.putImageData(img, 0, 0);
  const t = new T.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
  t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
  t.anisotropy = 16; t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter;
  return t;
}

/** Normal map from a height function h(x, y) in [0,1], tileable. */
function normalFrom(size, h, strength) {
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = h(x, y);
  return canvasTexture(size, d => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const at = (a, b) => H[((b + size) % size) * size + ((a + size) % size)];
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
      d[i] = (-dx / l * .5 + .5) * 255; d[i + 1] = (-dy / l * .5 + .5) * 255; d[i + 2] = (1 / l * .5 + .5) * 255; d[i + 3] = 255;
    }
  }, {srgb: false});
}

/* ------------------------------------------------------------------ asphalt */
/** LA asphalt, one tile = 12 m. The colour map is only the surface itself:
 *  mid-grey binder with bright stone chips and dark voids. The things that
 *  would give the tiling away (black crack sealant, "tar snakes", and repair
 *  patches) live in the mask texture instead, which the road shader samples
 *  at a different, rotated scale:
 *    mask.r  tar snakes     mask.g  roughness     mask.b  repair patches */
export function asphalt(size = 1024) {
  const grain = fbm(size, 64, 3, 11), blotch = fbm(size, 4, 4, 23), fine = fbm(size, 256, 2, 29), r = rng(77);
  // Aggregate: stone chips a pixel or two across (1-2.5 cm), bright and
  // sun-bleached, and the dark voids between them.
  const chip = new Float32Array(size * size), voids = new Float32Array(size * size);
  const dab = (arr, x, y, rad, v) => {
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
      const d = Math.hypot(ox, oy); if (d > rad) continue;
      const i = (((y + oy) % size + size) % size) * size + (((x + ox) % size + size) % size);
      arr[i] = Math.max(arr[i], v * (1 - d / (rad + .6)));
    }
  };
  for (let k = 0; k < size * size * .045; k++) dab(chip, (r() * size) | 0, (r() * size) | 0, .4 + r() * .9, .4 + r() * .6);
  for (let k = 0; k < size * size * .03; k++) dab(voids, (r() * size) | 0, (r() * size) | 0, .4 + r() * .7, .5 + r() * .5);
  // Tar snakes: sealed cracks, mostly transverse or along the wheel paths,
  // with the odd branch. Glossy black when new, greyed when old.
  const snake = new Float32Array(size * size);
  const walk = (x, y, a, len, w, tone, depth) => {
    for (let s = 0; s < len; s++) {
      a += (r() - .5) * .45;
      x += Math.cos(a); y += Math.sin(a);
      const ww = w * (.75 + r() * .5);
      for (let oy = -4; oy <= 4; oy++) for (let ox = -4; ox <= 4; ox++) {
        const d = Math.hypot(ox, oy);
        if (d > ww) continue;
        const i = ((Math.floor(y + oy) % size + size) % size) * size + ((Math.floor(x + ox) % size + size) % size);
        snake[i] = Math.max(snake[i], tone * Math.min(1, (ww + .5 - d) * .8));
      }
      if (depth < 2 && r() < .006) walk(x, y, a + (r() < .5 ? 1 : -1) * (.8 + r() * .6), len * .35, w * .8, tone, depth + 1);
    }
  };
  for (let k = 0; k < 9; k++) {
    const trans = r() < .55;
    walk(r() * size, r() * size, trans ? Math.PI / 2 + r() * .7 - .35 : r() * .5 - .25, 80 + r() * 320, 1.8 + r() * 2.2, .45 + r() * .55, 0);
  }
  // Repair patches: squarish saw-cut rectangles, soft-edged in the mask so
  // the shader can give them a crisp but not ruler-perfect outline.
  const patch = new Float32Array(size * size);
  for (let k = 0; k < 6; k++) {
    const w = 90 + r() * 220, h = 60 + r() * 150, x0 = r() * size, y0 = r() * size, tone = .5 + r() * .5;
    for (let y = -3; y < h + 3; y++) for (let x = -3; x < w + 3; x++) {
      const e = Math.min(x + 3, y + 3, w + 3 - x, h + 3 - y) / 5;
      const i = ((((y0 + y) | 0) % size + size) % size) * size + ((((x0 + x) | 0) % size + size) % size);
      patch[i] = Math.max(patch[i], tone * Math.min(1, e + (grain(x & (size - 1), y & (size - 1)) - .5) * .6));
    }
  }
  const height = (x, y) => {
    const i = y * size + x;
    return grain(x, y) * .35 + fine(x, y) * .25 + chip[i] * .6 - voids[i] * .5 - snake[i] * .2;
  };
  const color = canvasTexture(size, d => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      let v = 92 + (grain(x, y) - .5) * 26 + (blotch(x, y) - .5) * 26 + (fine(x, y) - .5) * 14;
      v += chip[i] * 36 - voids[i] * 28;
      const o = i * 4, warm = chip[i] * 6;           // the stones are a touch warmer than the binder
      d[o] = v + warm; d[o + 1] = v + warm * .6; d[o + 2] = v + 2; d[o + 3] = 255;
    }
  });
  const mask = canvasTexture(size, d => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, o = i * 4;
      d[o] = Math.min(255, snake[i] * 255);
      d[o + 1] = 232 - chip[i] * 30 + voids[i] * 15;
      d[o + 2] = Math.max(0, Math.min(255, patch[i] * 255));
      d[o + 3] = 255;
    }
  }, {srgb: false});
  const normal = normalFrom(size, height, 3);
  return {color, rough: mask, mask, normal};
}

/* ----------------------------------------------------------------- concrete */
/** Sun-bleached pavement concrete with stains; score lines are in the shader. */
export function concrete(size = 512) {
  const n = fbm(size, 8, 5, 5), fine = fbm(size, 128, 2, 9), r = rng(31);
  const stains = new Float32Array(size * size);
  for (let k = 0; k < 40; k++) {
    const cx = r() * size, cy = r() * size, rad = 6 + r() * 26, a = .2 + r() * .4;
    for (let y = -rad; y < rad; y++) for (let x = -rad; x < rad; x++) {
      const d = Math.hypot(x, y) / rad; if (d > 1) continue;
      const i = (((cy + y) | 0) % size + size) % size * size + (((cx + x) | 0) % size + size) % size;
      stains[i] = Math.max(stains[i], a * (1 - d * d));
    }
  }
  const color = canvasTexture(size, d => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, v = 206 + (n(x, y) - .5) * 26 + (fine(x, y) - .5) * 16 - stains[i] * 40, o = i * 4;
      d[o] = v; d[o + 1] = v * .98; d[o + 2] = v * .94; d[o + 3] = 255;
    }
  });
  const normal = normalFrom(size, (x, y) => fine(x, y) * .6 + n(x, y) * .4, 1.6);
  return {color, normal};
}

/* -------------------------------------------------------------------- grass */
/** Irrigated lawn / parkway grass: blades of light and dark green. */
export function grass(size = 512) {
  const n = fbm(size, 8, 4, 41), r = rng(59);
  return canvasTexture(size, (d, s, ctx) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = n(x, y), o = (y * size + x) * 4;
      d[o] = 70 + v * 40; d[o + 1] = 104 + v * 46; d[o + 2] = 44 + v * 20; d[o + 3] = 255;
    }
    ctx.putImageData(new ImageData(d, size), 0, 0);
    for (let k = 0; k < 9000; k++) {
      const x = r() * size, y = r() * size, l = 3 + r() * 6, a = -Math.PI / 2 + (r() - .5) * .8, g = 90 + r() * 90;
      ctx.strokeStyle = `rgba(${g * .55 | 0},${g | 0},${g * .35 | 0},.55)`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    const img = ctx.getImageData(0, 0, size, size); d.set(img.data);
  });
}

/* ------------------------------------------------------------------- ground */
/** Generic ground detail (dirt, dry grass, chaparral litter), greyscale-ish so
 *  the terrain's vertex colour carries the hue. */
export function groundDetail(size = 512) {
  const n = fbm(size, 16, 5, 71), r = rng(83);
  const tex = canvasTexture(size, (d, s, ctx) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const v = 150 + (n(x, y) - .5) * 110, o = (y * size + x) * 4;
      d[o] = v; d[o + 1] = v; d[o + 2] = v * .96; d[o + 3] = 255;
    }
    ctx.putImageData(new ImageData(d, size), 0, 0);
    for (let k = 0; k < 5000; k++) {
      const x = r() * size, y = r() * size, g = 120 + r() * 120;
      ctx.fillStyle = `rgba(${g},${g},${g * .9 | 0},.35)`;
      ctx.fillRect(x, y, 1 + r() * 2, 1 + r() * 2);
    }
    const img = ctx.getImageData(0, 0, size, size); d.set(img.data);
  });
  const normal = normalFrom(size, (x, y) => n(x, y), 4);
  return {color: tex, normal};
}

/* ----------------------------------------------------------------- wildland */
/** Paint with 2D canvas calls, then keep the pixels: returns the colour
 *  texture and a tileable normal map from the painted luminance (or from a
 *  separate height canvas when the painter provides one). */
function painted(size, paint, strength) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const hc = document.createElement('canvas'); hc.width = hc.height = size;
  const hctx = hc.getContext('2d');
  paint(ctx, hctx);
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 16; t.generateMipmaps = true; t.minFilter = T.LinearMipmapLinearFilter;
  const hd = hctx.getImageData(0, 0, size, size).data;
  const normal = normalFrom(size, (x, y) => hd[(y * size + x) * 4] / 255, strength);
  return {color: t, normal};
}
/** Draw `fn(x, y)` at a point and at its wrapped copies near the edges, so
 *  shapes that cross the border tile seamlessly. */
function wrapped(size, x, y, reach, fn) {
  for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
    const px = x + ox, py = y + oy;
    if (px < -reach || py < -reach || px > size + reach || py > size + reach) continue;
    fn(px, py);
  }
}

/** Southern California hillside ground cover, three tileable layers the
 *  ground shader mixes at metre scale:
 *    grass  golden dry wild oats and brome, combed by the wind (tile 4 m)
 *    brush  chaparral canopy seen from above: sage, chamise and toyon
 *           mounds with deep shade between them (tile 7 m)
 *    soil   decomposed granite: tan grit, pebbles and a few twigs (tile 3 m) */
export function wildland(size = 512) {
  const flow = fbm(size, 4, 3, 131), n = fbm(size, 16, 4, 137);
  const grassL = painted(size, (x, h) => {
    const r = rng(139);
    // Soil showing through first, then blades in layers, darkest (lowest) first.
    const img = x.createImageData(size, size), d = img.data;
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const v = n(px, py), o = (py * size + px) * 4;
      d[o] = 120 + v * 40; d[o + 1] = 100 + v * 32; d[o + 2] = 70 + v * 22; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    h.fillStyle = '#202020'; h.fillRect(0, 0, size, size);
    const straw = [[201, 169, 102], [184, 149, 90], [216, 191, 127], [156, 127, 74], [142, 138, 92], [226, 204, 150], [170, 150, 96]];
    for (let layer = 0; layer < 3; layer++) for (let k = 0; k < 8000; k++) {
      const px = r() * size, py = r() * size, a = flow(px & (size - 1), py & (size - 1)) * 3 + (r() - .5) * 2.2;
      const l = 4 + r() * 9, c = straw[(r() * straw.length) | 0], shade = .6 + layer * .2 + r() * .15;
      x.strokeStyle = `rgba(${c[0] * shade | 0},${c[1] * shade | 0},${c[2] * shade | 0},.85)`; x.lineWidth = .8 + r() * .9;
      h.strokeStyle = `rgba(${90 + layer * 60 + r() * 40 | 0},0,0,.9)`; h.lineWidth = x.lineWidth;
      const ex = Math.cos(a) * l, ey = Math.sin(a) * l, bx = (r() - .5) * 4, by = (r() - .5) * 4;
      wrapped(size, px, py, 20, (qx, qy) => {
        for (const g of [x, h]) { g.beginPath(); g.moveTo(qx, qy); g.quadraticCurveTo(qx + ex * .5 + bx, qy + ey * .5 + by, qx + ex, qy + ey); g.stroke(); }
      });
    }
  }, 2.2);
  const brushL = painted(size, (x, h) => {
    const r = rng(149);
    x.fillStyle = '#1c2414'; x.fillRect(0, 0, size, size);
    h.fillStyle = '#000'; h.fillRect(0, 0, size, size);
    // Species palettes: grey-green sage, dark chamise, glossy toyon, the odd dry
    // buckwheat rust.
    const kinds = [
      ['#6d7a55', '#7f8c66', '#5a6646', '#95a07c'],
      ['#3d4a28', '#4a5a31', '#34401f', '#5b6b3a'],
      ['#2f4526', '#3e5a30', '#27391f', '#4f6d3a'],
      ['#6e5a3a', '#83693f', '#5a4a30', '#98804f'],
    ];
    for (let k = 0; k < 520; k++) {
      const cx = r() * size, cy = r() * size, rad = 10 + r() * 30;
      const kind = kinds[r() < .08 ? 3 : r() < .35 ? 0 : r() < .7 ? 1 : 2];
      wrapped(size, cx, cy, rad + 4, (qx, qy) => {
        // Mound shadow, offset away from the sun (sun to the upper left).
        x.fillStyle = 'rgba(10,14,6,.55)'; x.beginPath(); x.ellipse(qx + rad * .25, qy + rad * .3, rad * 1.05, rad, 0, 0, 6.28); x.fill();
        const g = h.createRadialGradient(qx, qy, 0, qx, qy, rad);
        g.addColorStop(0, 'rgba(255,0,0,1)'); g.addColorStop(.7, 'rgba(170,0,0,.8)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        h.fillStyle = g; h.beginPath(); h.arc(qx, qy, rad, 0, 6.28); h.fill();
      });
      // Leaf dots over the mound: lit on the sun side, shaded on the other.
      const dots = rad * rad * .7;
      for (let i = 0; i < dots; i++) {
        const a = r() * 6.28, dd = Math.sqrt(r()) * rad, lx = Math.cos(a) * dd, ly = Math.sin(a) * dd;
        const lit = Math.max(0, Math.min(1, .55 - (lx + ly) / rad * .45 - dd / rad * .15));
        const c = kind[(r() * kind.length) | 0];
        x.fillStyle = c; x.globalAlpha = .9;
        wrapped(size, cx + lx, cy + ly, 4, (qx, qy) => { x.fillRect(qx, qy, 1.5 + r() * 2, 1.5 + r() * 2); });
        x.globalAlpha = (1 - lit) * .55; x.fillStyle = '#0d1208';
        wrapped(size, cx + lx, cy + ly, 4, (qx, qy) => { x.fillRect(qx, qy, 1.5 + r() * 2, 1.5 + r() * 2); });
        x.globalAlpha = 1;
      }
    }
  }, 5);
  const soilL = painted(size, (x, h) => {
    const r = rng(151), img = x.createImageData(size, size), d = img.data, hi = h.createImageData(size, size), hd = hi.data;
    const grit = fbm(size, 128, 2, 157);
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const v = n(px, py) * .6 + grit(px, py) * .4, o = (py * size + px) * 4;
      d[o] = 168 + (v - .5) * 50; d[o + 1] = 146 + (v - .5) * 44; d[o + 2] = 112 + (v - .5) * 36; d[o + 3] = 255;
      hd[o] = v * 120; hd[o + 3] = 255;
    }
    x.putImageData(img, 0, 0); h.putImageData(hi, 0, 0);
    for (let k = 0; k < 1500; k++) {
      const px = r() * size, py = r() * size, rw = 1 + r() * 4, rh = rw * (.6 + r() * .4), a = r() * 3.14, t = 120 + r() * 110;
      wrapped(size, px, py, 8, (qx, qy) => {
        x.fillStyle = 'rgba(40,30,20,.45)'; x.beginPath(); x.ellipse(qx + 1, qy + 1.2, rw, rh, a, 0, 6.28); x.fill();
        x.fillStyle = `rgb(${t},${t * .9 | 0},${t * .78 | 0})`; x.beginPath(); x.ellipse(qx, qy, rw, rh, a, 0, 6.28); x.fill();
        h.fillStyle = '#ff0000'; h.beginPath(); h.ellipse(qx, qy, rw, rh, a, 0, 6.28); h.fill();
      });
    }
    for (let k = 0; k < 90; k++) {
      const px = r() * size, py = r() * size, a = r() * 6.28, l = 8 + r() * 22;
      wrapped(size, px, py, 30, (qx, qy) => {
        x.strokeStyle = 'rgba(92,70,48,.8)'; x.lineWidth = 1 + r() * 1.2;
        x.beginPath(); x.moveTo(qx, qy); x.lineTo(qx + Math.cos(a) * l, qy + Math.sin(a) * l); x.stroke();
      });
    }
  }, 3);
  return {grass: grassL, brush: brushL, soil: soilL};
}

/** Irrigated lawn, seen close: a tileable blade texture that the shader uses
 *  for brightness only (the vertex colour keeps the hue). Tile = 2 m. */
export function lawn(size = 512) {
  return painted(size, (x, h) => {
    const r = rng(163), n = fbm(size, 8, 3, 167);
    const img = x.createImageData(size, size), d = img.data;
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const v = 90 + n(px, py) * 50, o = (py * size + px) * 4;
      d[o] = v * .8; d[o + 1] = v; d[o + 2] = v * .6; d[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    h.fillStyle = '#404040'; h.fillRect(0, 0, size, size);
    for (let k = 0; k < 26000; k++) {
      const px = r() * size, py = r() * size, a = r() * 6.28, l = 3 + r() * 6, g = 110 + r() * 120;
      x.strokeStyle = `rgba(${g * .78 | 0},${g | 0},${g * .55 | 0},.7)`; x.lineWidth = 1;
      h.strokeStyle = `rgba(${g},0,0,.7)`; h.lineWidth = 1;
      wrapped(size, px, py, 10, (qx, qy) => {
        for (const c of [x, h]) { c.beginPath(); c.moveTo(qx, qy); c.lineTo(qx + Math.cos(a) * l, qy + Math.sin(a) * l); c.stroke(); }
      });
    }
  }, 1.5);
}

/** Three independent tileable fBm fields (RGB), linear and stretched to fill
 *  0..1, for masks that need real thresholds (sRGB colour maps squash their
 *  noise into a narrow linear band). Alpha stays opaque: the 2D canvas is
 *  premultiplied, so anything in alpha would wipe the colour. */
export function noise(size = 256) {
  const f = [fbm(size, 4, 5, 171), fbm(size, 8, 4, 173), fbm(size, 16, 3, 179)];
  const v = new Float32Array(size * size * 3), lo = [1, 1, 1], hi = [0, 0, 0];
  for (let i = 0; i < size * size; i++) for (let c = 0; c < 3; c++) {
    const a = f[c](i % size, (i / size) | 0); v[i * 3 + c] = a; lo[c] = Math.min(lo[c], a); hi[c] = Math.max(hi[c], a);
  }
  return canvasTexture(size, d => {
    for (let i = 0; i < size * size; i++) {
      for (let c = 0; c < 3; c++) d[i * 4 + c] = (v[i * 3 + c] - lo[c]) / (hi[c] - lo[c]) * 255;
      d[i * 4 + 3] = 255;
    }
  }, {srgb: false});
}
