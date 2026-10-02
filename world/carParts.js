/* The Aurora's workshop parts (2026-10-01).
 *
 * A build is a small JSON object (it travels to the other players in a lobby):
 *
 *   wing     stock swan-neck · none · ducktail · Absolut longtail (twin fins, no
 *            wing) · Attack boomerang · GT3 race wing · drift wing on tall uprights
 *   front    stock splitter · GT3 splitter with canards · street lip · none
 *   kit      stock · GT widebody (flared arches, wider track) · bolt-on riveted overfenders
 *   exhaust  twin centre (stock) · quad · single centre · side exit · straight pipes
 *   lights   white · selective yellow · ice blue · ONE-EYE: the left lamp pulled
 *            for an intake, a red laser out of the hole (the 2,000 hp street-build look)
 *   wheels   aero · forged · mesh · dish · lux, with rim and caliper colours
 *   stance   stock · lowered · slammed with camber
 *   glow     underglow colour or off;  livery: clean · twin stripes · side stripe · black roof
 *
 * applyBuild(vehicle, build) hides the stock pieces the build replaces (the
 * GLB keeps them as tagged meshes, see cars/auroraGlb.js), adds the new ones
 * in a `parts` group, swaps the wheels and sets the stance. It returns what
 * the physics should know: {aero} (downforce share for the tyres).
 */
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {uniform, mix, positionLocal, abs, smoothstep, float, vec3, step, materialColor} from 'three/tsl';
import {buildWheels} from './carWheels.js';

export const OPTIONS = {
  wing: [['stock', 'Swan-neck', 'The Aurora\'s own carbon wing'], ['none', 'No wing', 'Clean tail, top-speed trim'], ['ducktail', 'Ducktail', 'A kicked-up lip in body colour'],
    ['longtail', 'Absolut longtail', 'No wing: twin fins and a stretched tail, built for 400 km/h'], ['attack', 'Attack boomerang', 'A huge wing whose tips sweep up'],
    ['gt3', 'GT3 race wing', 'Full-width, swan-neck mounted, gurney flap'], ['drift', 'Drift wing', 'Two elements, high on tall uprights']],
  front: [['stock', 'Stock splitter', ''], ['gt3', 'GT3 splitter + canards', 'Extended blade and dive planes'], ['lip', 'Street lip', 'A thin lip and a red tow strap'], ['none', 'No splitter', '']],
  kit: [['stock', 'Stock body', ''], ['wide', 'GT widebody', 'Flared arches over a wider track'], ['fenders', 'Riveted overfenders', 'Bolt-on, boxy, every rivet showing']],
  exhaust: [['stock', 'Twin centre', ''], ['quad', 'Quad tips', ''], ['center', 'Single centre', 'One big pipe through the diffuser'], ['side', 'Side exit', 'Pipes out ahead of the rear wheels'], ['straight', 'Straight pipes', 'Burnt titanium, big flames']],
  lights: [['stock', 'LED white', ''], ['yellow', 'Selective yellow', ''], ['ice', 'Ice blue', ''], ['oneeye', 'One-eye laser', 'One lamp out for an intake, a red laser in its place']],
  wheels: [['aero', 'Aero centre-lock', ''], ['forged', 'Forged five-spoke', ''], ['mesh', 'Cross mesh', ''], ['dish', 'Deep dish', ''], ['lux', 'Multi-spoke', '']],
  stance: [['stock', 'Stock', ''], ['low', 'Lowered', '-25 mm'], ['slammed', 'Slammed + camber', '-45 mm, wheels tucked, negative camber']],
  livery: [['none', 'Clean', ''], ['stripes', 'Twin stripes', ''], ['side', 'Side stripe', ''], ['twotone', 'Black roof', '']],
};
export const RIMS = [['Black', '#0b0c0e'], ['Gunmetal', '#3b3f45'], ['Silver', '#c4c8cd'], ['Bronze', '#a7854b'], ['Gold', '#c9a24a'], ['White', '#e8e8e4'], ['Red', '#b3141a']];
export const CALIPERS = [['Blue', '#1f47ff'], ['Red', '#d3191c'], ['Yellow', '#f2c21a'], ['Black', '#1c1d20'], ['Orange', '#ff6a1a'], ['Lime', '#9bff2a']];
export const GLOWS = [['Off', null], ['Ice', '#36c8ff'], ['Violet', '#9b3cff'], ['Red', '#ff2238'], ['Green', '#2bff7a'], ['White', '#e8f0ff']];
export const STRIPES = [['White', '#f2f2ee'], ['Black', '#0b0c0e'], ['Red', '#c8141c'], ['Blue', '#1f47ff'], ['Gold', '#c9a24a']];

export const DEFAULT_BUILD = {wing: 'stock', front: 'stock', kit: 'stock', exhaust: 'stock', lights: 'stock', wheels: 'aero', rim: null, caliper: null, stance: 'stock', glow: null, livery: 'none', stripe: '#f2f2ee'};
export const PRESETS = [
  {id: 'stock', name: 'Factory', blurb: 'The Aurora as it left the line', build: {...DEFAULT_BUILD}},
  {id: 'gt3', name: 'GT3 R', blurb: 'Race car: widebody, big wing, splitter, forged wheels, stripes', paint: '#eeeeea',
    build: {...DEFAULT_BUILD, wing: 'gt3', front: 'gt3', kit: 'wide', exhaust: 'side', wheels: 'forged', rim: '#1c1d20', caliper: '#d3191c', stance: 'low', livery: 'stripes', stripe: '#c8141c'}, handling: 'grip'},
  {id: 'drift', name: 'Drift Missile', blurb: 'Slammed on dish wheels, overfenders, wing on stilts', paint: '#5b2bd6',
    build: {...DEFAULT_BUILD, wing: 'drift', front: 'lip', kit: 'fenders', exhaust: 'straight', wheels: 'dish', rim: '#16171a', caliper: '#f2c21a', stance: 'slammed', glow: '#9b3cff', livery: 'twotone'}, handling: 'drift'},
  {id: 'oneeye', name: '2,000 HP One-Eye', blurb: 'One lamp out for the intake, red laser, straight pipes', paint: '#121316',
    build: {...DEFAULT_BUILD, wing: 'attack', front: 'gt3', kit: 'wide', exhaust: 'straight', lights: 'oneeye', wheels: 'mesh', rim: '#0b0c0e', caliper: '#ff6a1a', stance: 'low', glow: '#ff2238', livery: 'side', stripe: '#c8141c'}, handling: 'grip'},
  {id: 'absolut', name: 'Absolut', blurb: 'Low drag: longtail and twin fins, no wing', paint: '#d9dde2',
    build: {...DEFAULT_BUILD, wing: 'longtail', front: 'stock', exhaust: 'center', wheels: 'aero', rim: '#3b3f45', caliper: '#1f47ff', livery: 'side', stripe: '#1f47ff'}},
];
export const sanitizeBuild = b => { const o = {...DEFAULT_BUILD}; if (b && typeof b === 'object') for (const k of Object.keys(DEFAULT_BUILD)) { const v = b[k]; if (OPTIONS[k]) { if (OPTIONS[k].some(q => q[0] === v)) o[k] = v; } else if (v === null || typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) o[k] = v; } return o; };

/* ---------------------------------------------------------------- shapes */
const V3 = (x, y, z) => new T.Vector3(x, y, z);
/** An airfoil across the span (x), chord along z (leading edge toward +z), `aoa` nose-down rad. */
function airfoil(span, chord, thick, aoa = .12, cx = 0, cy = 0, cz = 0) {
  const s = new T.Shape(), n = 14;
  // A cambered teardrop: thick near the front, a sharp trailing edge.
  const top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, zc = chord / 2 - t * chord, th = thick * 2.6 * Math.sqrt(t) * (1 - t) * (1 - t * .3), cam = thick * .9 * Math.sin(Math.PI * t);
    top.push([zc, cam + th * .55]); bot.push([zc, cam - th * .45]);
  }
  s.moveTo(top[0][0], top[0][1]); for (const p of top.slice(1)) s.lineTo(p[0], p[1]); for (const p of bot.reverse().slice(1)) s.lineTo(p[0], p[1]); s.closePath();
  const g = new T.ExtrudeGeometry(s, {depth: span, bevelEnabled: false, curveSegments: 2});
  g.translate(0, 0, -span / 2);
  // Shape x → car z, shape y → car y, extrude (z) → car x.
  g.applyMatrix4(new T.Matrix4().makeBasis(V3(0, 0, 1), V3(0, 1, 0), V3(-1, 0, 0)));
  g.rotateX(-aoa); g.translate(cx, cy, cz);
  return g;
}
/** A flat plate from a 2D outline in the car's z/y plane, `t` thick, centred on x. */
function plate(pts, t, x) {
  const s = new T.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) s.lineTo(p[0], p[1]); s.closePath();
  const g = new T.ExtrudeGeometry(s, {depth: t, bevelEnabled: true, bevelThickness: .003, bevelSize: .003, bevelSegments: 1});
  g.translate(0, 0, -t / 2);
  g.applyMatrix4(new T.Matrix4().makeBasis(V3(0, 0, 1), V3(0, 1, 0), V3(1, 0, 0)));     // shape x → z, y → y, extrude → x
  g.translate(x, 0, 0);
  return g;
}
const box = (sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0) => { const g = new T.BoxGeometry(sx, sy, sz); g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z); return g; };
/** A tube (open both ends) along -z: an exhaust tip. */
function tip(r, len, x, y, z, rOut = r * 1.08) {
  const pts = [V3(rOut, 0, 0), V3(rOut, len, 0), V3(r, len, 0), V3(r * .98, len * .1, 0)].map(p => new T.Vector2(p.x, p.y));
  const g = new T.LatheGeometry(pts, 28); g.rotateX(-Math.PI / 2); g.translate(x, y, z); return g;
}
/** An arch flare: a band swept round the wheel opening, standing out from the body at `x`. */
function flare(cx, cz, R, side, {out = .07, w = .09, t = .022, a0 = -.25, a1 = Math.PI + .25, square = 0} = {}) {
  const segs = 24, pos = [], idx = [];
  // Profile (in the arch's radial/x plane): a lip that bulges out and down.
  const prof = [[0, 0], [.02, out * .55], [w * .55, out], [w, out * .82], [w + .004, 0]];
  for (let i = 0; i <= segs; i++) {
    const a = a0 + (a1 - a0) * i / segs;
    let ux = Math.cos(a), uy = Math.sin(a);
    if (square) { const m = Math.max(Math.abs(ux), Math.abs(uy)); ux = ux * (1 - square) + ux / m * square; uy = uy * (1 - square) + uy / m * square; }
    for (const [r, o] of prof) pos.push(side * (cx + o), R * 0 + (R + r) * uy, cz + (R + r) * ux);
  }
  const n = prof.length;
  for (let i = 0; i < segs; i++) for (let k = 0; k < n - 1; k++) { const a = i * n + k, b = a + n; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(side > 0 ? idx : idx.map((v, i) => idx[i - i % 3 + (2 - i % 3)]));
  g.computeVertexNormals(); g.translate(0, 0, 0);
  void t; return g;
}

/* ------------------------------------------------------------- materials */
function partMaterials(vehicle) {
  const M = vehicle.body.mats || {};
  // Our own carbon: the body's carbon shader projects a weave from UVs these parts don't have.
  const carbon = new T.MeshPhysicalNodeMaterial({roughness: .32, metalness: .3, clearcoat: 1, clearcoatRoughness: .06});
  { const P = positionLocal.mul(46), weave = P.x.add(P.y).floor().add(P.z.sub(P.y).floor()).mod(2); carbon.colorNode = mix(vec3(.018, .019, .022), vec3(.045, .047, .052), weave); }
  const glowMat = c => new T.MeshBasicMaterial({color: c, toneMapped: false});
  return {
    carbon, paint: vehicle.body.paint, black: M.black || new T.MeshStandardMaterial({color: '#0a0b0c', roughness: .6}),
    satin: M.satin || new T.MeshStandardMaterial({color: '#8d9298', roughness: .32, metalness: .9}),
    chrome: M.chrome || new T.MeshStandardMaterial({color: '#d4d7db', roughness: .08, metalness: 1}),
    ti: M.ti || new T.MeshStandardMaterial({color: '#9a8a70', roughness: .25, metalness: 1}),
    // Burnt titanium: straw, purple and blue bands along the pipe.
    burnt: (() => { const m = new T.MeshPhysicalNodeMaterial({roughness: .22, metalness: 1, clearcoat: .4, side: T.DoubleSide}); const k = positionLocal.z.mul(9).add(positionLocal.x.mul(3)).sin().mul(.5).add(.5); m.colorNode = mix(mix(vec3(.78, .62, .32), vec3(.42, .26, .62), smoothstep(.2, .6, k)), vec3(.2, .32, .78), smoothstep(.6, .95, k)); return m; })(),
    rivet: new T.MeshStandardMaterial({color: '#c8ccd2', roughness: .2, metalness: 1}),
    red: new T.MeshStandardMaterial({color: '#c8141c', roughness: .6}),
    grille: new T.MeshStandardMaterial({color: '#060607', roughness: .9, metalness: .2}),
    glowMat,
  };
}

/* ---------------------------------------------------------------- parts */
function addWing(P, add, build, deckY) {
  const w = build.wing;
  if (w === 'ducktail') {
    // A body-colour lip on the tail's top edge, kicked up.
    const y = deckY(-2.12);
    add(plate([[-2.02, y - .01], [-2.26, y + .055], [-2.27, y + .035], [-2.05, y - .03]], 1.5, 0), P.paint);
  } else if (w === 'longtail') {
    // Jesko Absolut: no wing — the tail stretched out, two fins running back to it.
    const y = deckY(-2.12);
    add(plate([[-2.0, y - .02], [-2.44, y - .055], [-2.44, y - .1], [-2.0, y - .08]], 1.62, 0), P.paint);
    for (const s of [1, -1]) {
      const y0 = deckY(-1.15);
      add(plate([[-1.05, y0 - .02], [-1.5, deckY(-1.5) + .12], [-2.25, y + .2], [-2.44, y + .13], [-2.44, y - .06], [-1.05, y0 - .05]], .022, s * .66), P.carbon);
    }
  } else if (w === 'gt3' || w === 'attack') {
    const y = w === 'gt3' ? 1.3 : 1.24, z = -2.22, span = w === 'gt3' ? 1.92 : 1.3;
    add(airfoil(span, .34, .026, .14, 0, y, z), P.carbon);
    add(box(span, .045, .012, 0, y + .06, z - .17, -.9), P.carbon);                     // gurney flap
    if (w === 'attack') {
      // Boomerang tips: the plane sweeps up and back at each end.
      for (const s of [1, -1]) { const g = airfoil(.34, .3, .024, .14, 0, 0, 0); g.rotateZ(s * -.5); g.translate(s * .79, y + .08, z - .02); add(g, P.carbon); }
      for (const s of [1, -1]) add(plate([[z + .2, y + .02], [z - .2, y + .02], [z - .24, y + .26], [z + .1, y + .22]], .012, s * .95), P.carbon);
    } else for (const s of [1, -1]) add(plate([[z + .22, y - .12], [z - .24, y - .12], [z - .26, y + .14], [z + .18, y + .1]], .012, s * .965), P.carbon);
    // Swan necks: hung from the top of the wing down to the deck.
    for (const s of [1, -1]) { const d = deckY(-1.92); add(plate([[-1.86, d - .03], [-2.0, d + .1], [-2.12, y + .02], [-2.2, y + .06], [-2.3, y + .06], [-2.2, y - .02], [-2.08, d + .06], [-1.96, d - .03]], .016, s * .3), P.carbon); }
  } else if (w === 'drift') {
    const y = 1.4, z = -2.18;
    add(airfoil(1.82, .28, .024, .1, 0, y, z), P.carbon);
    add(airfoil(1.82, .16, .016, .45, 0, y + .07, z - .19), P.carbon);
    for (const s of [1, -1]) add(plate([[z + .2, y - .15], [z - .34, y - .15], [z - .34, y + .2], [z + .14, y + .16]], .014, s * .92), P.carbon);
    for (const s of [1, -1]) { const d = deckY(-2.05); add(plate([[-1.98, d - .03], [-2.12, d - .03], [-2.24, y - .02], [-2.12, y - .02]], .02, s * .48), P.black); }
  }
}
function addFront(P, add, build, noseZ) {
  if (build.front === 'gt3') {
    // The blade follows the nose's own outline, 9 cm proud of it.
    const outline = [];
    for (let i = 0; i <= 16; i++) { const x = -.92 + 1.84 * i / 16; outline.push([x, Math.max(1.95, noseZ(x)) + .09 - Math.abs(x) ** 4 * .05]); }
    const sh = new T.Shape(); sh.moveTo(-.92, 1.95); for (const [x, z] of outline) sh.lineTo(x, z); sh.lineTo(.92, 1.95); sh.closePath();
    const blade = new T.ExtrudeGeometry(sh, {depth: .016, bevelEnabled: true, bevelThickness: .002, bevelSize: .004, bevelSegments: 1});
    blade.rotateX(Math.PI / 2); blade.translate(0, .155, 0); add(blade, P.carbon);
    for (const s of [1, -1]) {
      const zc = noseZ(s * .9); add(plate([[zc - .2, .15], [zc + .08, .15], [zc + .08, .2], [zc - .16, .25]], .012, s * .9), P.carbon);           // splitter end fences
      for (const [y, l] of [[.34, .2], [.44, .16]]) { const g = box(.14, .012, l, 0, 0, 0, 0, 0, s * .28); g.translate(s * .92, y, noseZ(s * .86) - .12); add(g, P.carbon); }   // canards
    }
  } else if (build.front === 'lip') {
    add(box(1.2, .014, .08, 0, .155, 2.56), P.black);
    add(box(.045, .012, .12, .32, .2, 2.56, -.6), P.red);                                                 // tow strap
  }
}
function addKit(P, add, build, wheels) {
  if (build.kit === 'stock') return;
  const fenders = build.kit === 'fenders';
  for (const w of wheels) {
    const s = Math.sign(w.x);
    const g = flare(.99, 0, .43, s, fenders ? {out: .1, w: .08, square: .55, a0: -.05, a1: Math.PI + .05} : {out: .075, w: .1});
    g.translate(0, w.y, w.z); add(g, fenders ? P.black : P.paint);
    if (fenders) for (let i = 0; i < 9; i++) {
      const a = -.02 + (Math.PI + .04) * i / 8, rr = .47; let ux = Math.cos(a), uy = Math.sin(a); const m = Math.max(Math.abs(ux), Math.abs(uy)); ux = ux * .45 + ux / m * .55; uy = uy * .45 + uy / m * .55;
      const r = new T.CylinderGeometry(.011, .011, .012, 8); r.rotateZ(Math.PI / 2); r.translate(s * 1.075, w.y + rr * uy, w.z + rr * ux); add(r, P.rivet);
    }
  }
  // Skirts out to the new arches.
  for (const s of [1, -1]) add(box(.07, .1, 1.95, s * 1.04, .2, 0), fenders ? P.black : P.carbon);
}
function exhaustTips(build) {
  switch (build.exhaust) {
    case 'quad': return {tips: [[.07, .46, -2.12, .045], [-.07, .46, -2.12, .045], [.22, .46, -2.12, .045], [-.22, .46, -2.12, .045]], mat: 'ti'};
    case 'center': return {tips: [[0, .44, -2.14, .085]], mat: 'ti'};
    case 'side': return {tips: [[1.0, .22, -.86, .05, 'side'], [-1.0, .22, -.86, .05, 'side']], mat: 'burnt'};
    case 'straight': return {tips: [[.3, .36, -2.18, .068, 'long'], [-.3, .36, -2.18, .068, 'long']], mat: 'burnt'};
    default: return null;
  }
}

/** The left lamp pulled: its lens becomes a dark intake, a red laser shines out of it. */
function addLaser(P, add, group) {
  const src = V3(.77, .52, 2.2);
  const dot = new T.Mesh(new T.SphereGeometry(.022, 12, 8), P.glowMat('#ff1a24')); dot.position.copy(src); group.add(dot);
  const halo = new T.Mesh(new T.SphereGeometry(.05, 12, 8), new T.MeshBasicMaterial({color: '#ff1a24', transparent: true, opacity: .35, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false}));
  halo.position.copy(src); group.add(halo);
  // The beam: a long thin cone, brightest at the lamp, fading out.
  const L = 70, beam = new T.CylinderGeometry(.006, .03, L, 8, 12, true); beam.rotateX(Math.PI / 2); beam.translate(0, 0, L / 2);
  // Fade along the length with vertex colours (additive: darker is fainter).
  const fade = g => { const p = g.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const k = Math.pow(1 - p.getZ(i) / L, 1.6); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k; } g.setAttribute('color', new T.BufferAttribute(c, 3)); return g; };
  fade(beam);
  const mat = new T.MeshBasicMaterial({color: '#ff2030', vertexColors: true, transparent: true, opacity: .9, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, side: T.DoubleSide});
  const mesh = new T.Mesh(beam, mat); mesh.position.copy(src); mesh.rotation.x = .012; mesh.frustumCulled = false; mesh.renderOrder = 3; group.add(mesh);
  // A second, wider and fainter sheath reads as light scattering in the air.
  const sheath = new T.Mesh(fade(new T.CylinderGeometry(.015, .07, L, 10, 12, true).rotateX(Math.PI / 2).translate(0, 0, L / 2)),
    new T.MeshBasicMaterial({color: '#ff1020', vertexColors: true, transparent: true, opacity: .12, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, side: T.DoubleSide}));
  sheath.position.copy(src); sheath.rotation.x = .012; sheath.frustumCulled = false; group.add(sheath);
  group.userData.laser = [mesh, sheath, halo];
}

function addGlow(group, color) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.5, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const tex = new T.CanvasTexture(c);
  const m = new T.Mesh(new T.PlaneGeometry(3.2, 6), new T.MeshBasicMaterial({color, map: tex, transparent: true, opacity: .9, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false}));
  m.rotation.x = -Math.PI / 2; m.position.set(0, .04, .1); m.renderOrder = 2; group.add(m);
  const tube = new T.Mesh(new T.BoxGeometry(1.7, .02, 3.9), new T.MeshBasicMaterial({color, toneMapped: false})); tube.position.set(0, .13, .15); group.add(tube);
  group.userData.glow = m;
}

/** Stripes / two-tone, painted in the shader on top of the body colour (positionLocal). */
function setLivery(vehicle, build) {
  const paint = vehicle.body.paint;
  if (!paint.userData.livery) {
    const u = {kind: uniform(0), color: uniform(new T.Color('#f2f2ee'))};
    const base = paint.colorNode || materialColor, P = positionLocal, ax = abs(P.x);
    const top = step(.78, P.y), roof = step(.98, P.y).mul(step(P.z, .9)).mul(step(-1.15, P.z));
    const twin = smoothstep(.012, .0, abs(ax.sub(.17)).sub(.07)).mul(step(.7, P.y)).mul(top.max(step(P.y, 2)));
    const side = smoothstep(.01, 0, abs(P.y.sub(.5)).sub(.035)).mul(step(.85, ax));
    const k = u.kind;
    const mask = twin.mul(step(.5, k).mul(step(k, 1.5))).add(side.mul(step(1.5, k).mul(step(k, 2.5)))).add(roof.mul(step(2.5, k)));
    paint.colorNode = mix(base, u.color, mask.min(1));
    paint.userData.livery = u; paint.needsUpdate = true;
  }
  const u = paint.userData.livery;
  u.kind.value = {none: 0, stripes: 1, side: 2, twotone: 3}[build.livery] || 0;
  u.color.value.set(build.livery === 'twotone' ? '#0b0c0e' : build.stripe || '#f2f2ee');
}

/** Apply a build to a player car made by makePlayerCar (the Aurora). */
export function applyBuild(vehicle, raw) {
  const build = sanitizeBuild(raw), body = vehicle.body;
  vehicle.build = build;
  // Stock pieces: hidden when the build replaces them.
  const hide = {
    wing: build.wing !== 'stock', fin: build.wing === 'longtail', splitter: build.front === 'none' || build.front === 'lip',
    exhaust: build.exhaust !== 'stock', lampL: build.lights === 'oneeye',
  };
  body.group.traverse(o => { if (o.isMesh && o.userData.part) o.visible = !hide[o.userData.part]; });
  // New pieces.
  if (vehicle.parts) { vehicle.object.remove(vehicle.parts); vehicle.parts.traverse(o => { if (o.isMesh) { o.geometry.dispose(); if (o.userData.own) o.material.dispose(); } }); }
  const group = new T.Group(); group.name = 'parts'; vehicle.parts = group;
  const P = partMaterials(vehicle), byMat = new Map();
  const add = (g, m) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); if (!g.attributes.normal) g.computeVertexNormals(); (byMat.get(m) || byMat.set(m, []).get(m)).push(g); };
  // The deck's height at z, measured off the real body (raycast straight down the centreline).
  const ray = new T.Raycaster(), paintMeshes = []; body.group.traverse(o => { if (o.isMesh && o.material === body.paint && !o.userData.part) paintMeshes.push(o); });
  body.group.updateMatrixWorld(true);
  const deckY = z => { ray.set(V3(0, 3, z), V3(0, -1, 0)); const hit = ray.intersectObjects(paintMeshes, false)[0]; return hit ? 3 - hit.distance : .95; };
  addWing(P, add, build, deckY);
  // The nose's front face at x (raycast back along the car at splitter height).
  const noseZ = x => { ray.set(V3(x, .24, 4), V3(0, 0, -1)); const hit = ray.intersectObjects(paintMeshes, false)[0]; return hit ? 4 - hit.distance : 2.2; };
  addFront(P, add, build, noseZ);
  addKit(P, add, build, vehicle.wheels);
  const ex = exhaustTips(build);
  if (ex) {
    for (const [x, y, z, r, kind] of ex.tips) {
      if (kind === 'side') { const g = tip(r, .14, 0, 0, 0); g.rotateY(Math.sign(x) * Math.PI / 2); g.translate(x - Math.sign(x) * .1, y, z); add(g, P[ex.mat]); }
      else add(tip(r, kind === 'long' ? .26 : .16, x, y, z + (kind === 'long' ? .1 : .06)), P[ex.mat]);
    }
    if (build.exhaust === 'center' || build.exhaust === 'quad') add(box(build.exhaust === 'center' ? .26 : .6, .13, .02, 0, .45, -2.06), P.black);
  }
  body.dims.exhausts.length = 0;
  for (const t of ex ? ex.tips : [[-.11, .47, -2.17], [.11, .47, -2.17]]) body.dims.exhausts.push(t[4] === 'side' ? [t[0] + Math.sign(t[0]) * .05, t[1], t[2]] : [t[0], t[1], t[2] - (t[4] === 'long' ? .12 : 0)]);
  if (build.lights === 'oneeye') {
    // The pulled lamp's lens, re-made as a black intake mesh.
    body.group.traverse(o => { if (o.isMesh && o.userData.part === 'lampL' && o.material === body.mats?.lamp) add(o.geometry.clone().translate(0, 0, -.012), P.grille); });
    addLaser(P, add, group);
  }
  for (const [m, gs] of byMat) { const mesh = new T.Mesh(mergeGeometries(gs), m); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); }
  if (build.glow) addGlow(group, build.glow);
  vehicle.object.add(group);
  // Lamp colour.
  const lamp = {stock: '#e8f2ff', yellow: '#ffd23a', ice: '#9fd6ff', oneeye: '#e8f2ff'}[build.lights];
  body.head.emissive.set(lamp); body.head.color.set(build.lights === 'yellow' ? '#ffe9a0' : '#dfe9f5');
  setLivery(vehicle, build);
  // Wheels: rebuilt in the chosen style, pushed out under wide arches, tucked and cambered when low.
  const style = build.wheels, key = [style, build.rim, build.caliper].join('|');
  if (vehicle.wheelKey !== key && body.wheelsSpec) {
    const fresh = buildWheels(body.wheelsSpec, body.radius, style, {rimColor: build.rim, caliper: build.caliper});
    vehicle.wheels.forEach((w, i) => {
      for (const c of [...w.pivot.children]) { w.pivot.remove(c); c.traverse(o => { if (o.isMesh) { o.geometry.dispose(); } }); }
      for (const c of [...fresh[i].pivot.children]) w.pivot.add(c);
      w.spin = fresh[i].spin;
    });
    vehicle.wheelKey = key;
  }
  const push = build.kit === 'wide' ? .045 : build.kit === 'fenders' ? .065 : 0;
  const drop = {stock: 0, low: .025, slammed: .045}[build.stance], camber = build.stance === 'slammed' ? [.05, .1] : build.stance === 'low' ? [.012, .02] : [0, 0];
  vehicle.wheels.forEach(w => { w.pivot.position.x = w.x + Math.sign(w.x) * push; w.pivot.rotation.z = Math.sign(w.x) * (w.front ? camber[0] : camber[1]); });
  body.group.position.y = -drop; group.position.y = -drop;
  if (body.interior?.group) body.interior.group.position.y = 0;
  return {build, aero: (build.wing === 'gt3' || build.wing === 'attack' || build.wing === 'drift' ? .7 : build.wing === 'stock' ? .35 : build.wing === 'longtail' ? .1 : 0) + (build.front === 'gt3' ? .3 : 0)};
}
