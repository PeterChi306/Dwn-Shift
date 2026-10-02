/* Branching trees for the near field.
 *
 * A small L-system-ish grower: a trunk, limbs off it by phyllotaxis, twigs off
 * those, each a tapering curved tube, with leaf clusters (alpha cards) at the
 * twigs. Every card's normal points out of the crown, so the crown is lit as
 * one mass. Species follow the LA hills and streets:
 *   eucalyptus  tall, leaning, pale peeling trunk, forked leaders, sparse
 *               drooping blue-green leaves (the Griffith Park silhouette)
 *   pine        Aleppo pine: crooked dark trunk, upswept limbs, needle tufts
 *   oak         coast live oak: short trunk, wide crooked limbs, dense dark crown
 *   broad       street tree (ficus / sycamore): round crown on a clean trunk
 *   jacaranda   as broad, lighter and airier (its leaves carry the blossom)
 * Templates are in metres at instance scale 1. plants.js instances them.
 */
import * as T from 'three';

const rng = seed => () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
const V = T.Vector3;

export const SPECIES = {
  broad: {height: 7, trunk: 2.6, r: .22, lean: .04, depth: 3, kids: [7, 5, 3], angle: [.85, .75, .7], ratio: [.55, .6, .6], start: [.4, .25, .3],
    up: [.25, .2, .15], gravity: 0, leaves: 6, leafSize: 1.5, leafSpread: 1, droop: 0, crookedness: .12},
  jacaranda: {height: 7, trunk: 2.2, r: .2, lean: .06, depth: 3, kids: [6, 5, 3], angle: [1, .8, .7], ratio: [.62, .6, .6], start: [.35, .25, .3],
    up: [.3, .15, .1], gravity: .05, leaves: 5, leafSize: 1.5, leafSpread: 1, droop: 0, crookedness: .18},
  oak: {height: 7, trunk: 1.7, r: .4, lean: .08, depth: 3, kids: [6, 5, 4], angle: [1.15, .8, .7], ratio: [.95, .62, .6], start: [.55, .25, .3],
    up: [-.05, .05, .1], gravity: .12, leaves: 7, leafSize: 1.6, leafSpread: 1.1, droop: 0, crookedness: .3},
  eucalyptus: {height: 21, trunk: 10, r: .44, lean: .1, depth: 3, kids: [7, 5, 4], angle: [.6, .8, .85], ratio: [.6, .55, .6], start: [.5, .3, .3],
    up: [.4, .15, 0], gravity: .15, leaves: 6, leafSize: 2.1, leafSpread: 1.2, droop: 1, crookedness: .14, fork: 3},
  // Chaparral bush: many stems from the root crown, short twigs, dense small leaves.
  shrub: {height: 1.6, trunk: .25, r: .06, lean: .1, depth: 2, kids: [9, 4], angle: [.95, .7], ratio: [4.2, .45], start: [.05, .3],
    up: [.3, .25], gravity: .1, leaves: 9, leafSize: .9, leafSpread: .45, droop: 0, crookedness: .3},
  pine: {height: 12, trunk: 7.5, r: .34, lean: .12, depth: 3, kids: [10, 4, 3], angle: [1.1, .7, .6], ratio: [.48, .55, .5], start: [.4, .3, .3],
    up: [.3, .3, .2], gravity: .05, leaves: 5, leafSize: 1.7, leafSpread: .8, droop: 0, crookedness: .22, needles: true},
};

/** Build one tree. Returns {wood, leaves} BufferGeometries and the crown centre. */
export function growTree(kind, seed) {
  const P = SPECIES[kind], r = rng(seed * 7919 + 17);
  const W = {pos: [], nor: [], uv: [], idx: []}, L = {pos: [], uv: [], idx: []};
  const up = new V(0, 1, 0);

  function tube(pts, radii, sides) {
    const base = W.pos.length / 3;
    let along = 0;
    for (let i = 0; i < pts.length; i++) {
      const t = (i < pts.length - 1 ? pts[i + 1].clone().sub(pts[i]) : pts[i].clone().sub(pts[i - 1])).normalize();
      const ref = Math.abs(t.y) < .9 ? up : new V(1, 0, 0);
      const n = new V().crossVectors(t, ref).normalize(), b = new V().crossVectors(t, n);
      if (i) along += pts[i].distanceTo(pts[i - 1]);
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * Math.PI * 2, d = n.clone().multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a));
        W.pos.push(pts[i].x + d.x * radii[i], pts[i].y + d.y * radii[i], pts[i].z + d.z * radii[i]);
        W.nor.push(d.x, d.y, d.z);
        W.uv.push(j / sides, along / (radii[0] * 12 + .5));
      }
    }
    for (let i = 1; i < pts.length; i++) for (let j = 0; j < sides; j++) {
      const a = base + (i - 1) * (sides + 1) + j, c = a + sides + 1;
      W.idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  /** A leaf card: `hang` cards hang from their top edge (eucalyptus). */
  function card(c, size, hang) {
    const yaw = r() * Math.PI * 2, pitch = hang ? (r() - .5) * .6 : (r() - .5) * 1.6, roll = (r() - .5) * .8;
    const m = new T.Matrix4().makeRotationFromEuler(new T.Euler(pitch, yaw, roll, 'YXZ'));
    const w = size * (hang ? .7 : 1), h = size;
    const corners = hang ? [[-w / 2, 0], [w / 2, 0], [w / 2, -h], [-w / 2, -h]] : [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
    const base = L.pos.length / 3;
    for (const [x, y] of corners) {
      const v = new V(x, y, 0).applyMatrix4(m).add(c);
      L.pos.push(v.x, v.y, v.z);
    }
    L.uv.push(0, 1, 1, 1, 1, 0, 0, 0);
    L.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  function branch(p0, dir, len, r0, depth) {
    const segs = depth === 0 ? 7 : depth === 1 ? 4 : 3, sides = depth === 0 ? 9 : depth === 1 ? 6 : 4;
    const pts = [p0.clone()], radii = [r0];
    let d = dir.clone(), p = p0.clone();
    const tip = depth === P.depth - 1 ? .12 : .35;
    for (let i = 1; i <= segs; i++) {
      const wob = new V(r() - .5, (r() - .5) * .4, r() - .5).multiplyScalar(P.crookedness * 2);
      d.add(wob).addScaledVector(up, P.up[depth] ?? .1).addScaledVector(up, -P.gravity * i / segs).normalize();
      p = p.clone().addScaledVector(d, len / segs);
      pts.push(p); radii.push(r0 * (1 - (1 - tip) * i / segs));
    }
    tube(pts, radii, sides);
    const at = t => { const f = t * segs, i = Math.min(segs - 1, Math.floor(f)), k = f - i; return {p: pts[i].clone().lerp(pts[i + 1], k), d: pts[i + 1].clone().sub(pts[i]).normalize(), r: radii[i] + (radii[i + 1] - radii[i]) * k}; };
    if (depth < P.depth - 1) {
      const n = P.kids[depth];
      // Eucalyptus: the trunk forks into leaders near the top.
      if (depth === 0 && P.fork) {
        for (let k = 0; k < P.fork; k++) {
          const s = at(.62 + r() * .15), a = k / P.fork * Math.PI * 2 + r();
          const nd = s.d.clone().add(new V(Math.cos(a), 0, Math.sin(a)).multiplyScalar(.45)).normalize();
          branch(s.p, nd, len * (.5 + r() * .15), s.r * .7, 1);
        }
      }
      let phase = r() * 6.28;
      for (let k = 0; k < n; k++) {
        const t = P.start[depth] + (1 - P.start[depth]) * (k + r() * .7) / n;
        const s = at(Math.min(.98, t));
        phase += 2.4;                                         // golden-angle phyllotaxis
        const ref = Math.abs(s.d.y) < .9 ? up : new V(1, 0, 0);
        const side = new V().crossVectors(s.d, ref).normalize().applyAxisAngle(s.d, phase);
        const ang = P.angle[depth] * (.8 + r() * .4);
        const nd = s.d.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang)).normalize();
        const l = len * P.ratio[depth] * (1.15 - t * .5) * (.8 + r() * .4);
        branch(s.p, nd, l, Math.max(.02, s.r * .62), depth + 1);
      }
    }
    if (depth >= P.depth - 1) {
      // Leaf clusters along the outer part of the twig and at its tip.
      for (let k = 0; k < P.leaves; k++) {
        const s = at(.35 + .65 * (k + r()) / P.leaves);
        const c = s.p.clone().add(new V(r() - .5, (r() - .5) * .6, r() - .5).multiplyScalar(P.leafSpread));
        card(c, P.leafSize * (.75 + r() * .5), P.droop > 0);
      }
    }
  }

  const lean = new V((r() - .5) * P.lean * 2, 1, (r() - .5) * P.lean * 2).normalize();
  branch(new V(0, -.3, 0), lean, P.trunk + .3, P.r, 0);

  const wood = new T.BufferGeometry();
  wood.setAttribute('position', new T.Float32BufferAttribute(W.pos, 3));
  wood.setAttribute('normal', new T.Float32BufferAttribute(W.nor, 3));
  wood.setAttribute('uv', new T.Float32BufferAttribute(W.uv, 2));
  wood.setIndex(W.idx);
  const leaves = new T.BufferGeometry();
  leaves.setAttribute('position', new T.Float32BufferAttribute(L.pos, 3));
  leaves.setAttribute('uv', new T.Float32BufferAttribute(L.uv, 2));
  leaves.setIndex(L.idx);
  // Crown centre = mean leaf position; normals point out of it, a bit upward.
  const c = new V(), lp = leaves.attributes.position;
  for (let i = 0; i < lp.count; i++) c.add(new V(lp.getX(i), lp.getY(i), lp.getZ(i)));
  c.divideScalar(Math.max(1, lp.count));
  const n = new Float32Array(lp.count * 3), v = new V();
  for (let i = 0; i < lp.count; i++) {
    v.set(lp.getX(i) - c.x, (lp.getY(i) - c.y) * 1.3 + .6, lp.getZ(i) - c.z).normalize();
    n.set([v.x, v.y, v.z], i * 3);
  }
  leaves.setAttribute('normal', new T.BufferAttribute(n, 3));
  wood.computeBoundingSphere(); leaves.computeBoundingSphere();
  return {wood, leaves, crown: c};
}

/* ------------------------------------------------------------- textures */
function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, repeat = false) {
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}

/** Leaf-cluster cards. `shape`: 'broad' (ovate leaves), 'euc' (long sickle
 *  leaves hanging on thin stalks, from the card's top edge), 'needle' (pine
 *  tufts: needles radiating from short shoots). */
export function clusterTexture(shape, hues, seed, blossom = null) {
  const [c, x] = canvas(256), r = rng(seed);
  const pick = () => hues[Math.floor(r() * hues.length)];
  if (shape === 'needle') {
    for (let k = 0; k < 16; k++) {
      const cx = 30 + r() * 196, cy = 30 + r() * 196, n = 40 + r() * 20, len = 26 + r() * 22;
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, l = len * (.6 + r() * .4);
        x.strokeStyle = pick(); x.lineWidth = 1.4 + r();
        x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l * .8); x.stroke();
      }
      x.fillStyle = '#4a3a24'; x.beginPath(); x.arc(cx, cy, 2.5, 0, 6.28); x.fill();
    }
  } else if (shape === 'euc') {
    // Twigs hanging from the top edge, long narrow leaves off them.
    for (let k = 0; k < 7; k++) {
      let px = 20 + r() * 216, py = 0;
      x.strokeStyle = '#7a5a3a'; x.lineWidth = 2;
      const pts = [];
      for (let s = 0; s < 10; s++) { px += (r() - .5) * 14; py += 22 + r() * 6; pts.push([px, py]); }
      x.beginPath(); x.moveTo(pts[0][0], 0); for (const [a, b] of pts) x.lineTo(a, b); x.stroke();
      for (const [a, b] of pts) for (const s of [-1, 1]) {
        if (r() < .25) continue;
        x.save(); x.translate(a, b); x.rotate(s * (.25 + r() * .5));
        const l = 26 + r() * 14, w = 4 + r() * 2;
        x.fillStyle = 'rgba(10,16,10,.35)'; x.beginPath(); x.ellipse(1, l / 2 + 1, w + .8, l / 2 + .8, s * .08, 0, 6.28); x.fill();
        x.fillStyle = pick(); x.beginPath(); x.ellipse(0, l / 2, w, l / 2, s * .08, 0, 6.28); x.fill();
        x.fillStyle = 'rgba(240,245,220,.12)'; x.beginPath(); x.ellipse(-w * .3, l * .4, w * .45, l * .38, 0, 0, 6.28); x.fill();
        x.restore();
      }
    }
  } else {
    // Twiggy clusters: a few stems, leaves off them, not a round blob.
    for (let k = 0; k < 9; k++) {
      const cx = 40 + r() * 176, cy = 40 + r() * 176, a0 = r() * 6.28;
      x.strokeStyle = '#5a4630'; x.lineWidth = 1.6;
      for (let s = 0; s < 3; s++) {
        const a = a0 + s * 2.1 + r() * .5, l = 40 + r() * 30;
        x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); x.stroke();
        for (let i = 0; i < 9; i++) {
          const t = .2 + i / 9 * .8, lx = cx + Math.cos(a) * l * t, ly = cy + Math.sin(a) * l * t;
          const w = 5 + r() * 3, h = 9 + r() * 5, rot = a + (i % 2 ? 1 : -1) * (.6 + r() * .5) + Math.PI / 2;
          x.save(); x.translate(lx, ly); x.rotate(rot);
          x.fillStyle = 'rgba(10,16,8,.4)'; x.beginPath(); x.ellipse(.8, h * .5 + 1, w + .7, h + .7, 0, 0, 6.28); x.fill();
          x.fillStyle = pick(); x.beginPath(); x.ellipse(0, h * .5, w, h, 0, 0, 6.28); x.fill();
          x.fillStyle = `rgba(255,250,210,${.06 + r() * .14})`; x.beginPath(); x.ellipse(-w * .3, h * .35, w * .5, h * .7, 0, 0, 6.28); x.fill();
          x.strokeStyle = 'rgba(20,28,12,.35)'; x.lineWidth = .7; x.beginPath(); x.moveTo(0, -h * .4); x.lineTo(0, h * 1.3); x.stroke();
          x.restore();
        }
      }
    }
    if (blossom) for (let i = 0; i < 220; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * 100;
      x.fillStyle = blossom[Math.floor(r() * blossom.length)];
      x.beginPath(); x.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 2.5 + r() * 3.5, 0, 6.28); x.fill();
    }
  }
  return tex(c);
}

/** Bark, tileable: u wraps the trunk, v runs up it. */
export function barkTexture(kind) {
  const [c, x] = canvas(128, 256), r = rng(kind.length * 31 + 5);
  if (kind === 'eucalyptus') {
    // Smooth cream-grey bark with peeling tan and salmon strips.
    x.fillStyle = '#c8c0ae'; x.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 60; i++) {
      const w = 6 + r() * 26, h = 20 + r() * 90, px = r() * 128, py = r() * 256;
      x.fillStyle = ['#b9ad96', '#c9a98a', '#e8e4da', '#a89c86', '#cdb89c'][Math.floor(r() * 5)];
      x.globalAlpha = .5 + r() * .4;
      for (const ox of [-128, 0, 128]) for (const oy of [-256, 0, 256]) { x.beginPath(); x.ellipse(px + ox, py + oy, w / 2, h / 2, (r() - .5) * .2, 0, 6.28); x.fill(); }
    }
    x.globalAlpha = 1;
  } else {
    const base = kind === 'pine' ? '#4e3f33' : kind === 'oak' ? '#4a4238' : '#6e6252';
    x.fillStyle = base; x.fillRect(0, 0, 128, 256);
    // Furrows: dark vertical cracks, plates between them lit on one edge.
    for (let i = 0; i < (kind === 'pine' ? 22 : 34); i++) {
      let px = r() * 128;
      x.strokeStyle = 'rgba(20,14,10,.6)'; x.lineWidth = 1.5 + r() * 2.5;
      x.beginPath(); x.moveTo(px, 0);
      for (let y = 0; y <= 256; y += 16) { px += (r() - .5) * 8; x.lineTo(px, y); }
      x.stroke();
    }
    for (let i = 0; i < 90; i++) {
      x.fillStyle = `rgba(${150 + r() * 60 | 0},${130 + r() * 50 | 0},${110 + r() * 40 | 0},${.08 + r() * .12})`;
      x.fillRect(r() * 128, r() * 256, 4 + r() * 10, 3 + r() * 14);
    }
  }
  return tex(c, true);
}
