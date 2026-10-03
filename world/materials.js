/* Node materials for roads and ground (three.js WebGPU / TSL).
 *
 * Lane markings are painted in the road shader from each vertex's lateral
 * offset and arc length, not laid as separate strips: no z-fighting, no extra
 * geometry, and they stop at junctions by themselves because junction
 * polygons carry marking style -1. Textures are in world metres.
 */
import * as T from 'three';
import {Fn, attribute, uv, vec2, vec3, float, abs, fract, step, smoothstep, mix, max, min, round, fwidth, texture,
  positionWorld, uniform, If, Discard, vertexColor, normalMap, normalWorld} from 'three/tsl';
import {asphalt, concrete, grass, groundDetail, wildland, lawn, noise} from './textures.js';
import {exp} from 'three/tsl';
import {weather} from './rain.js';
export const LAMP = 36;             // metres between street lamps on one side

export function makeMaterials() {
  const wet = weather.wet;          // rain (2026-10-03): darker, glossier, puddled
  const A = asphalt(), C = concrete(), grassTex = grass(), G = groundDetail(), W = wildland(), L = lawn(), N = noise();

  /* ---- road surface + markings */
  const info = attribute('rinfo', 'vec3');
  const lanes = info.x, style = info.y, h = info.z;
  const u = uv().x, v = uv().y, au = abs(u);
  const aa = max(fwidth(u), .012);
  const line = (at, width) => float(1).sub(smoothstep(width.mul(.5).sub(aa), width.mul(.5).add(aa), abs(au.sub(at))));
  const dash = (on, period) => step(fract(v.div(period)), on / period);
  const is = s => float(1).sub(step(.5, abs(style.sub(s))));
  const LANE = 3.6;
  const travel = min(lanes.mul(LANE * .5), h.sub(.4));          // half of the travelled way

  // Dividers between lanes on one side: at |u| = off + k * LANE for 1 <= k < lanes/2.
  const divider = (off) => {
    const q = au.sub(off), kk = round(q.div(LANE));
    const onLine = float(1).sub(smoothstep(float(.06).sub(aa), float(.06).add(aa), abs(q.sub(kk.mul(LANE)))));
    return onLine.mul(step(.5, kk)).mul(step(kk, lanes.mul(.5).sub(.5))).mul(dash(3, 12));
  };
  const median = h.sub(lanes.mul(3.7 * .5)).sub(3).max(.6);      // freeway median half-width

  const edge = line(travel.add(.15), float(.14));
  const white = is(1).mul(edge)                                   // 1: two-lane street
    .add(is(5).mul(edge))                                         // 5: no-passing two-lane (canyon, tunnel)
    .add(is(2).mul(divider(0).add(edge)))                         // 2: multi-lane: dashed lanes + edges
    .add(is(3).mul(divider(median).add(line(median.add(lanes.mul(3.7 * .5)), float(.18)))))  // 3: freeway
    .add(is(4).mul(line(float(1.9), float(.16))));                // 4: single-lane ramp
  const yellow = is(1).mul(line(float(0), float(.13))).mul(dash(3, 9))   // dashed centre
    .add(is(5).mul(line(float(.18), float(.11))))                 // double solid centre
    .add(is(2).mul(line(float(.2), float(.11))))
    .add(is(3).mul(line(median, float(.16))));                    // freeway inside edge
  const paint = min(white.add(yellow), 1);

  const roadUV = uv().div(12);
  const road = new T.MeshStandardNodeMaterial({metalness: 0});
  // The masks (tar snakes, repairs) are sampled rotated and at other scales
  // than the surface, so their 12 m repeat never lines up down a long street.
  const rot = (s, a) => vec2(u.mul(Math.cos(a)).sub(v.mul(Math.sin(a))), u.mul(Math.sin(a)).add(v.mul(Math.cos(a)))).div(s);
  const snakes = texture(A.mask, rot(17, .61)).r, patches = texture(A.mask, rot(43, -.37).add(.29)).b;
  const patchIn = smoothstep(.32, .5, patches), patchEdge = smoothstep(.12, .3, patches).mul(float(1).sub(smoothstep(.34, .5, patches)));
  // Where water stands after rain: low spots from a slow noise, mostly off the crown of the lane.
  const puddle = smoothstep(.55, .68, texture(N, positionWorld.xz.div(17)).g).mul(smoothstep(.62, .48, texture(N, positionWorld.xz.div(5.3)).r).mul(.5).add(.5));
  road.colorNode = Fn(() => {
    // Two samples of the surface, one rotated, mixed by a slow noise: no grid.
    const mixer = smoothstep(.35, .65, texture(N, positionWorld.xz.div(140)).b);
    let c = mix(texture(A.color, roadUV).rgb, texture(A.color, rot(15, 1.13)).rgb, mixer);
    // Sealed cracks and saw-cut repairs: darker, the repair ringed by its cut.
    c = c.mul(float(1).sub(snakes.mul(.42))).mul(float(1).sub(patchIn.mul(.2))).mul(float(1).sub(patchEdge.mul(.3)));
    // Large-scale variation: sun fade and grime drift across the city.
    const drift = texture(G.color, positionWorld.xz.div(170)).r;
    c = c.mul(drift.mul(.35).add(.8)).mul(.74);   // aged LA asphalt is mid-grey, not chalk
    // A darker oil strip down the middle of each lane; wheel paths polished lighter.
    const inLane = abs(fract(au.div(LANE)).sub(.5));
    c = c.mul(float(.93).add(smoothstep(.08, .22, inLane).mul(.07)).add(smoothstep(.22, .3, inLane).mul(smoothstep(.42, .3, inLane)).mul(.05)));
    const medianMask = is(3).mul(step(au, median));
    c = mix(c, vec3(.42, .41, .39), medianMask);
    // Paint is worn where tyres cross it.
    const wear = texture(A.color, roadUV.mul(3.1)).r.mul(.9).add(.35).min(1);
    c = mix(c, vec3(.88, .87, .82), min(white, 1).mul(wear));
    c = mix(c, vec3(.86, .64, .2), min(yellow, 1).mul(wear));
    // Wet: asphalt goes much darker (paint less so), darker still in the puddles.
    return c.mul(float(1).sub(wet.mul(float(.46).sub(paint.mul(.24))))).mul(float(1).sub(puddle.mul(wet).mul(.28)));
  })();
  road.roughnessNode = mix(mix(texture(A.mask, roadUV).g.sub(snakes.mul(.4)).sub(patchIn.mul(.08)), float(.55), paint), mix(float(.2), float(.035), puddle), wet);
  // Street lighting after dark: pools under lamps every 36 m, staggered side
  // to side (lamps.js puts the posts in the same places, from the same arc
  // length). Junctions are lit all over. Night fades this in.
  const night = uniform(0);
  const lampAt = fract(v.div(LAMP * 2)).mul(LAMP * 2);          // 0 .. 72 m along the road
  const dA = lampAt.min(float(LAMP * 2).sub(lampAt)), dB = abs(lampAt.sub(LAMP));
  const side = h.add(.8);
  // Wet, each pool stretches along the road: the lamp's reflection in the water.
  const stretch = wet.mul(4).add(1);
  const poolA = exp(dA.mul(dA).div(stretch).add(u.sub(side).mul(u.sub(side))).div(-2 * 6.5 * 6.5));
  const poolB = exp(dB.mul(dB).div(stretch).add(u.add(side).mul(u.add(side))).div(-2 * 6.5 * 6.5));
  const lit = mix(poolA.add(poolB), float(.35), step(style, -.5)).mul(step(.5, abs(style).add(step(style, -.5))));
  // Light falling on the asphalt: scaled by its own colour, so pools read as
  // lit road, not glowing paint.
  road.emissiveNode = road.colorNode.mul(vec3(1, .88, .72)).mul(lit).mul(night).mul(wet.mul(2.2).add(1.6));
  const rough = float(.55).sub(wet.mul(.4));
  road.normalNode = normalMap(texture(A.normal, roadUV), vec2(rough, rough));

  /* ---- crosswalks: continental bars, their own quads over the junction */
  const crosswalk = new T.MeshStandardNodeMaterial({metalness: 0, roughness: .55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2});
  crosswalk.colorNode = Fn(() => {
    const bar = step(fract(u.add(h).div(1.2)), .55);
    If(bar.lessThan(.5), () => { Discard(); });
    const wear = texture(A.color, roadUV.mul(2.3)).r.mul(.8).add(.45).min(1);
    return vec3(.9, .89, .85).mul(wear);
  })();

  /* ---- pavement concrete, with 1.5 m score lines */
  const concreteMat = (tone, scored) => {
    const m = new T.MeshStandardNodeMaterial({metalness: 0, roughness: .85});
    const base = texture(C.color, uv().div(3)).rgb.mul(new T.Color(tone));
    // Distance (in slab fractions) to the nearest score line.
    const d = float(.5).sub(abs(fract(v.div(1.5)).sub(float(.5))));
    m.colorNode = (scored ? base.mul(float(.65).add(smoothstep(float(0), float(.02), d).mul(float(.35)))) : base).mul(float(1).sub(wet.mul(.32)));
    m.roughnessNode = mix(float(.85), float(.38), wet);
    m.normalNode = normalMap(texture(C.normal, uv().div(3)), vec2(.4, .4));
    return m;
  };
  const sidewalk = concreteMat('#ece6dc', true);
  const verge = concreteMat('#d9d4c8', false);                   // hard shoulder
  // Kerb faces: concrete, or LA fire-lane red where info.x is set.
  const curb = new T.MeshStandardNodeMaterial({metalness: 0, roughness: .8});
  curb.colorNode = mix(texture(C.color, uv().div(2)).rgb.mul(vec3(1, .98, .95)), vec3(.62, .11, .09), step(.5, info.x));
  curb.side = T.DoubleSide;
  const parkway = new T.MeshStandardNodeMaterial({metalness: 0, roughness: .95});
  parkway.colorNode = texture(grassTex, positionWorld.xz.div(3)).rgb.mul(texture(G.color, positionWorld.xz.div(40)).r.mul(.4).add(.75));

  const std = (color, map, repeat = 1 / 4, rough = .95) => {
    const m = new T.MeshStandardNodeMaterial({roughness: rough, metalness: 0});
    m.colorNode = map ? texture(map, uv().mul(repeat)).rgb.mul(new T.Color(color)) : vec3(new T.Color(color));
    return m;
  };
  const gravel = std('#c9b08a', G.color, 1 / 3);
  const concrete2 = std('#cbc6bb', C.color, 1 / 5, .9);
  concrete2.side = T.DoubleSide;
  const barrier = std('#dcd7cc', C.color, 1 / 4, .85);
  barrier.side = T.DoubleSide;
  const skirt = std('#8f8068', G.color, 1 / 3);
  skirt.side = T.DoubleSide;

  /* ---- ground: vertex colour (altitude/slope/biome palette) x detail */
  const wild = attribute('wild', 'float');
  // Mosaic weights for the hillside cover, shared by colour and normal.
  const cover = () => {
    const p = positionWorld.xz, vc = vertexColor().rgb;
    // The vertex palette already says how much chaparral a slope carries
    // (dark olive vs golden grass); noise at 20-60 m breaks it into stands.
    const vBrush = vc.r.sub(.39).div(-.3).clamp(0, 1);
    const a = texture(N, p.div(90)), b = texture(N, p.div(31).add(.37));
    const m = a.r.mul(.5).add(b.g.mul(.5));
    // Height blend: the edge of a stand follows the shrub mounds in the brush
    // texture, so it is ragged close up instead of a soft smear.
    const mound = texture(W.brush.color, p.div(7)).g.sub(.08).mul(1.6);
    const brush = smoothstep(.5, .545, m.add(vBrush.mul(.45)).sub(.1).add(mound.mul(fwidth(p.x).mul(-4).add(1).clamp(0, 1))));
    const soil = smoothstep(.58, .7, b.b.mul(.6).add(a.g.mul(.4))).mul(float(1).sub(brush)).mul(.85);
    return {brush, soil};
  };
  const groundColor = Fn(() => {
    const p = positionWorld.xz, vc = vertexColor().rgb;
    const fine = texture(G.color, p.div(6)).r;
    const mid = texture(G.color, p.div(37)).r;
    const broad = texture(G.color, p.div(230)).r;
    let base = vc.mul(fine.mul(.45).add(.62)).mul(mid.mul(.3).add(.85)).mul(broad.mul(.35).add(.82));
    // Irrigated lawn (flat, green, not wild): blades close up, keeping its hue.
    const lawnish = float(1).sub(wild).mul(smoothstep(0, .06, vc.g.sub(vc.r)));
    base = base.mul(mix(float(1), texture(L.color, p.div(2)).g.mul(2.6), lawnish.mul(.7)));
    // Hillsides: golden grass, chaparral stands and bare decomposed granite,
    // each a real texture, mixed at metre scale.
    const {brush, soil} = cover();
    const gr = texture(W.grass.color, p.div(4)).rgb, so = texture(W.soil.color, p.div(3)).rgb;
    // Two brush samples (one turned and larger) crossfaded by noise: the
    // mounds never line up into a repeating pattern of scales.
    const br = mix(texture(W.brush.color, p.div(7)).rgb, texture(W.brush.color, vec2(p.x.mul(.6).sub(p.y.mul(.8)), p.x.mul(.8).add(p.y.mul(.6))).div(10.3)).rgb,
      smoothstep(.35, .65, texture(N, p.div(47)).g));
    const wildC = mix(mix(gr.mul(vec3(.84, .8, .78)), so, soil), br, brush).mul(broad.mul(.3).add(.85)).mul(mid.mul(.2).add(.9));
    base = mix(base, wildC, wild);
    // Steep ground is rock, not smeared soil: road cuts and ridge faces get
    // layered sandstone bands (warped, so they are not rulered), darker in
    // the recesses, fading in from ~45 degrees.
    const steep = float(1).sub(smoothstep(.5, .62, normalWorld.y));
    const warp = texture(G.color, p.div(19)).r.mul(3.5);
    const band = fract(positionWorld.y.add(warp).div(1.7));
    const strata = mix(vec3(.2, .155, .11), vec3(.34, .27, .19), smoothstep(.15, .5, band).mul(float(1).sub(smoothstep(.7, .95, band))))
      .mul(texture(G.color, vec2(p.x.add(p.y), positionWorld.y).div(5)).r.mul(.45).add(.7))
      .mul(texture(W.soil.color, vec2(p.x.add(p.y), positionWorld.y).div(3)).r.mul(.8).add(.55));
    return mix(base, strata, steep.mul(.9));
  });
  const ground = new T.MeshStandardNodeMaterial({roughness: 1, metalness: 0});
  ground.colorNode = groundColor().mul(float(1).sub(wet.mul(.25)));
  ground.roughnessNode = mix(float(1), float(.72), wet);
  ground.normalNode = Fn(() => {
    const p = positionWorld.xz, {brush, soil} = cover();
    const wildN = mix(mix(texture(W.grass.normal, p.div(4)).rgb, texture(W.soil.normal, p.div(3)).rgb, soil), texture(W.brush.normal, p.div(7)).rgb, brush);
    return normalMap(mix(texture(G.normal, p.div(6)).rgb, wildN, wild), vec2(1, 1));
  })();
  ground.side = T.DoubleSide;             // tile skirts face either way

  // The far terrain is one coarse mesh under everything; where detailed tiles
  // exist it discards itself, so the two never z-fight.
  const detailRect = uniform(new T.Vector4(0, 0, 0, 0));
  const far = new T.MeshStandardNodeMaterial({roughness: 1, metalness: 0});
  far.colorNode = Fn(() => {
    const p = positionWorld.xz;
    If(p.x.greaterThan(detailRect.x).and(p.x.lessThan(detailRect.z)).and(p.y.greaterThan(detailRect.y)).and(p.y.lessThan(detailRect.w)), () => { Discard(); });
    return groundColor().mul(float(1).sub(wet.mul(.25)));
  })();

  const pier = std('#c4bfb4', C.color, 1 / 4, .9);

  return {night, road, junction: road, asphalt: road, crosswalk, sidewalk, verge, curb, parkway, gravel, concrete: concrete2, barrier,
    skirt, ground, far, detailRect, pier, textures: {asphalt: A, concrete: C, grass: grassTex, ground: G}};
}
