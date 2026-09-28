#!/usr/bin/env node
/* Map relief (2026-09-27): a shaded-relief PNG of the whole landform for the
 * in-game map (world/atlas.js draws roads, lots and labels over it).
 *
 *   node tools/build_relief.mjs      -> assets/world/relief.png (1536 x 1024, 10 m/px)
 *
 * Red channel: hillshade (light from the north-west); green: height above
 * the basin floor (for tinting hills); blue: slope. Stdlib only.
 */
import {writeFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {terrainHeight} from '../world/network.js';

const W = 1536, H = 1024, M = 10, X0 = -7680, Z0 = -5120;
const h = new Float32Array((W + 2) * (H + 2));
for (let j = 0; j < H + 2; j++) for (let i = 0; i < W + 2; i++) h[j * (W + 2) + i] = terrainHeight(X0 + (i - 1) * M, Z0 + (j - 1) * M);
const at = (i, j) => h[(j + 1) * (W + 2) + i + 1];
const px = Buffer.alloc(H * (W * 4 + 1));
const L = [-.5, .72, -.48], ll = Math.hypot(...L);
for (let j = 0; j < H; j++) {
  px[j * (W * 4 + 1)] = 0;
  for (let i = 0; i < W; i++) {
    const dx = (at(i + 1, j) - at(i - 1, j)) / (2 * M), dz = (at(i, j + 1) - at(i, j - 1)) / (2 * M);
    const n = [-dx, 1, -dz], nl = Math.hypot(...n), shade = Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / nl / ll);
    const basin = 6 + .03 * i + .016 * (1024 - j), rise = Math.max(0, Math.min(255, (at(i, j) - basin) * 1.6));
    const o = j * (W * 4 + 1) + 1 + i * 4;
    px[o] = Math.round(shade * 255); px[o + 1] = Math.round(rise); px[o + 2] = Math.round(Math.min(255, Math.hypot(dx, dz) * 400)); px[o + 3] = 255;
  }
}
const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(px, {level: 9})), chunk('IEND', Buffer.alloc(0))]);
writeFileSync(new URL('../assets/world/relief.png', import.meta.url), png);
console.log('wrote assets/world/relief.png', png.length, 'bytes');
