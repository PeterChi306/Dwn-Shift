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
/** LA asphalt: grey aggregate, sun-faded, with black crack sealant ("tar
 *  snakes") meandering across it and darker newer patches. One tile = 8 m. */
export function asphalt(size = 1024) {
  const grain = fbm(size, 64, 3, 11), blotch = fbm(size, 4, 4, 23), r = rng(77);
  // Tar snakes: random walks, drawn into a mask.
  const snake = new Float32Array(size * size);
  // A few, not a web: sealed cracks are scattered, mostly transverse or along
  // the wheel paths, a hand-width wide.
  for (let k = 0; k < 5; k++) {
    let x = r() * size, y = r() * size, a = r() < .5 ? r() * .6 - .3 : Math.PI / 2 + r() * .6 - .3;
    const len = 90 + r() * 260, base = 2.2 + r() * 1.6;
    for (let s = 0; s < len; s++) {
      a += (r() - .5) * .35;
      x += Math.cos(a); y += Math.sin(a);
      const w = base * (.8 + r() * .4);
      for (let oy = -3; oy <= 3; oy++) for (let ox = -3; ox <= 3; ox++) {
        const d = Math.hypot(ox, oy);
        if (d > w) continue;
        const i = ((Math.floor(y + oy) % size + size) % size) * size + ((Math.floor(x + ox) % size + size) % size);
        snake[i] = Math.max(snake[i], 1 - d / (w + .5));
      }
    }
  }
  // Rectangular repair patches, slightly darker and smoother.
  const patch = new Float32Array(size * size);
  for (let k = 0; k < 5; k++) {
    const w = 60 + r() * 180, h = 40 + r() * 120, x0 = r() * size, y0 = r() * size, tone = .6 + r() * .4;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) patch[(((y0 + y) | 0) % size) * size + (((x0 + x) | 0) % size)] = tone;
  }
  const specks = new Float32Array(size * size);
  for (let k = 0; k < size * size * .03; k++) specks[(r() * size * size) | 0] = r();
  const height = (x, y) => {
    const i = y * size + x;
    return grain(x, y) * .7 + specks[i] * .5 - snake[i] * .15;
  };
  const color = canvasTexture(size, d => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      let v = 96 + (grain(x, y) - .5) * 38 + (blotch(x, y) - .5) * 30 + specks[i] * 34;
      v = v * (1 - patch[i] * .22);
      v = v * (1 - snake[i] * .55);
      const o = i * 4;
      d[o] = v * .98; d[o + 1] = v * .98; d[o + 2] = v * 1.0; d[o + 3] = 255;
    }
  });
  // Roughness in G (three.js reads roughness from G): sealant and patches are smoother.
  const rough = canvasTexture(size, d => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, v = 235 - snake[i] * 120 - patch[i] * 25 - specks[i] * 20, o = i * 4;
      d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
    }
  }, {srgb: false});
  const normal = normalFrom(size, height, 3.2);
  return {color, rough, normal};
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
