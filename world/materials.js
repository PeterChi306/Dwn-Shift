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
import {asphalt, concrete, grass, groundDetail} from './textures.js';
import {exp} from 'three/tsl';
export const LAMP = 36;             // metres between street lamps on one side

export function makeMaterials() {
  const A = asphalt(), C = concrete(), grassTex = grass(), G = groundDetail();

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
  road.colorNode = Fn(() => {
    let c = texture(A.color, roadUV).rgb;
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
    return c;
  })();
  road.roughnessNode = mix(texture(A.rough, roadUV).g, float(.55), paint);
  // Street lighting after dark: pools under lamps every 36 m, staggered side
  // to side (lamps.js puts the posts in the same places, from the same arc
  // length). Junctions are lit all over. Night fades this in.
  const night = uniform(0);
  const lampAt = fract(v.div(LAMP * 2)).mul(LAMP * 2);          // 0 .. 72 m along the road
  const dA = lampAt.min(float(LAMP * 2).sub(lampAt)), dB = abs(lampAt.sub(LAMP));
  const side = h.add(.8);
  const poolA = exp(dA.mul(dA).add(u.sub(side).mul(u.sub(side))).div(-2 * 6.5 * 6.5));
  const poolB = exp(dB.mul(dB).add(u.add(side).mul(u.add(side))).div(-2 * 6.5 * 6.5));
  const lit = mix(poolA.add(poolB), float(.35), step(style, -.5)).mul(step(.5, abs(style).add(step(style, -.5))));
  // Light falling on the asphalt: scaled by its own colour, so pools read as
  // lit road, not glowing paint.
  road.emissiveNode = road.colorNode.mul(vec3(1, .88, .72)).mul(lit).mul(night).mul(1.6);
  road.normalNode = normalMap(texture(A.normal, roadUV), vec2(.55, .55));

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
    m.colorNode = scored ? base.mul(float(.65).add(smoothstep(float(0), float(.02), d).mul(float(.35)))) : base;
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
  const groundColor = Fn(() => {
    const p = positionWorld.xz;
    const fine = texture(G.color, p.div(6)).r;
    const mid = texture(G.color, p.div(37)).r;
    const broad = texture(G.color, p.div(230)).r;
    const base = vertexColor().rgb.mul(fine.mul(.45).add(.62)).mul(mid.mul(.3).add(.85)).mul(broad.mul(.35).add(.82));
    // Steep ground is rock, not smeared soil: road cuts and ridge faces get
    // layered sandstone bands (warped, so they are not rulered), darker in
    // the recesses, fading in from ~45 degrees.
    const steep = float(1).sub(smoothstep(.6, .78, normalWorld.y));
    const warp = texture(G.color, p.div(19)).r.mul(3.5);
    const band = fract(positionWorld.y.add(warp).div(1.7));
    const strata = mix(vec3(.46, .4, .33), vec3(.62, .55, .45), smoothstep(.15, .5, band).mul(float(1).sub(smoothstep(.7, .95, band))))
      .mul(texture(G.color, vec2(p.x.add(p.y), positionWorld.y).div(5)).r.mul(.45).add(.7));
    // Chaparral speckle on gentler hill ground: tiny dark shrub crowns, so a
    // hillside reads as brush from a distance instead of flat sand.
    const hillish = smoothstep(.02, .12, base.r.sub(base.g).add(.06)).mul(float(1).sub(steep));
    const speck = smoothstep(.62, .78, texture(G.color, p.div(2.3)).r).mul(hillish).mul(.35);
    return mix(base.mul(float(1).sub(speck)), strata, steep.mul(.9));
  });
  const ground = new T.MeshStandardNodeMaterial({roughness: 1, metalness: 0});
  ground.colorNode = groundColor();
  ground.normalNode = normalMap(texture(G.normal, positionWorld.xz.div(6)), vec2(.8, .8));
  ground.side = T.DoubleSide;             // tile skirts face either way

  // The far terrain is one coarse mesh under everything; where detailed tiles
  // exist it discards itself, so the two never z-fight.
  const detailRect = uniform(new T.Vector4(0, 0, 0, 0));
  const far = new T.MeshStandardNodeMaterial({roughness: 1, metalness: 0});
  far.colorNode = Fn(() => {
    const p = positionWorld.xz;
    If(p.x.greaterThan(detailRect.x).and(p.x.lessThan(detailRect.z)).and(p.y.greaterThan(detailRect.y)).and(p.y.lessThan(detailRect.w)), () => { Discard(); });
    return groundColor();
  })();

  const pier = std('#c4bfb4', C.color, 1 / 4, .9);

  return {night, road, junction: road, asphalt: road, crosswalk, sidewalk, verge, curb, parkway, gravel, concrete: concrete2, barrier,
    skirt, ground, far, detailRect, pier, textures: {asphalt: A, concrete: C, grass: grassTex, ground: G}};
}
