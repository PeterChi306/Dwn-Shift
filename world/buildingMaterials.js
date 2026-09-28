/* Materials for buildings.
 *
 * Facades are one shader: windows are drawn from each face's uv in metres
 * (u along the wall, v up from the building's base) and binfo = (style,
 * floor height, bay width, seed). Glass is dark and glossy so it reflects
 * the sky, which is what makes a street glow at sunset; after dark a share
 * of the windows light up, each on its own hash so no two blocks match.
 */
import * as T from 'three';
import {signAtlas, COLS, ROWS} from './signs.js';
import {attribute, uv, vec2, vec3, float, abs, fract, floor, step, smoothstep, mix, sin, dot, texture,
  positionWorld, normalWorld, uniform, vertexColor, max, min, time} from 'three/tsl';

export function makeBuildingMaterials(tex) {
  const night = uniform(0);
  const bi = attribute('binfo', 'vec4');
  const style = bi.x, fh = bi.y.max(.1), bay = bi.z.max(.1), seed = bi.w;
  const u = uv().x, v = uv().y;
  const is = s => float(1).sub(step(.5, abs(style.sub(s))));
  const fy = fract(v.div(fh)), fx = fract(u.div(bay));
  const level = floor(v.div(fh)), column = floor(u.div(bay));
  const box = (x0, x1, y0, y1) => step(x0, fx).mul(step(fx, x1)).mul(step(y0, fy)).mul(step(fy, y1));
  const ground = float(1).sub(step(.5, level));             // 1 on the ground floor
  const upper = float(1).sub(ground);
  /* Styles (binfo.x):
   *  1 punched  2 shop (glass ground floor, punched above)  3 curtain wall
   *  4 ribbon   5 arched (Spanish)  6 deco (tall narrow, raised piers)
   *  7 brick    8 wood slats with big glass  9 clapboard  11 carport (dingbat)
   * 12 mixed-use (shopfront, then tall glazing)  13 tinted curtain (vertex colour = glass)
   * 14 sunshades (ribbon glazing behind vertical fins) */
  const punchedO = box(.2, .8, .27, .84), punchedI = box(.235, .765, .305, .81);
  const shopO = box(.03, .97, .04, .8), shopI = box(.055, .945, .065, .775);
  // Arch: a rectangle below the springing line and a half-disc above it.
  const archShape = (w, y0, y1) => {
    const cx = fx.sub(.5), r = float(w), spring = float(y1).sub(r.mul(bay).div(fh));
    const rect = step(abs(cx), r).mul(step(y0, fy)).mul(step(fy, spring));
    const dx = cx.mul(bay), dy = fy.sub(spring).mul(fh);
    const disc = step(dx.mul(dx).add(dy.mul(dy)), r.mul(bay).mul(r.mul(bay))).mul(step(spring, fy));
    return min(rect.add(disc), 1);
  };
  const archO = archShape(.24, .2, .86), archI = archShape(.21, .23, .83);
  const decoO = box(.34, .66, .12, .9), decoI = box(.36, .64, .14, .88);
  const slatGlass = step(.5, fract(column.mul(.5).add(seed.mul(.13))));   // every other bay glazed
  const tall = box(.03, .97, .06, .94), tallI = box(.05, .95, .08, .92);
  const outer = is(1).add(is(7)).add(is(9)).mul(punchedO)
    .add(is(2).mul(mix(punchedO, shopO, ground)))
    .add(is(3).add(is(13)).mul(box(.02, .98, .04, .96)))
    .add(is(4).mul(step(.23, fy).mul(step(fy, .9))))
    .add(is(5).mul(mix(archO, box(.06, .94, .04, .86), ground.mul(step(.5, fract(seed.mul(.31)))))))
    .add(is(6).mul(decoO))
    .add(is(8).mul(tall.mul(slatGlass)))
    .add(is(11).mul(upper.mul(punchedO)))
    .add(is(12).mul(mix(tall, shopO, ground)))
    .add(is(14).mul(step(.2, fy).mul(step(fy, .92))));
  const inner = is(1).add(is(7)).add(is(9)).mul(punchedI)
    .add(is(2).mul(mix(punchedI, shopI, ground)))
    .add(is(3).add(is(13)).mul(box(.04, .96, .06, .94)))
    .add(is(4).mul(step(.25, fy).mul(step(fy, .88)).mul(step(.03, fx))))
    .add(is(5).mul(mix(archI, box(.08, .92, .06, .84), ground.mul(step(.5, fract(seed.mul(.31)))))))
    .add(is(6).mul(decoI))
    .add(is(8).mul(tallI.mul(slatGlass)))
    .add(is(11).mul(upper.mul(punchedI)))
    .add(is(12).mul(mix(tallI, shopI, ground)))
    .add(is(14).mul(step(.22, fy).mul(step(fy, .9))));
  let glass = min(inner, 1);
  // Sunshade fins cut across the glazing: thin vertical blades every 1.2 m.
  const fin = is(14).mul(step(fract(u.div(1.2)), .14));
  glass = glass.mul(float(1).sub(fin));
  const frame = min(outer, 1).sub(glass).max(0);
  // Each window: its own hash for blinds and for being lit at night.
  const h = fract(sin(dot(vec3(level, column, seed), vec3(12.9898, 78.233, 37.719))).mul(43758.5453));
  const stucco = texture(tex.concrete.color, positionWorld.xz.add(positionWorld.y).div(4)).r.mul(.35).add(.72);
  const top = step(.9, normalWorld.y);                      // flat roofs: tar and gravel grey
  const plinth = step(v, .55).mul(float(1).sub(top));
  // Wall surface patterns.
  const course = floor(v.div(.075)), brickU = fract(u.div(.23).add(fract(course.mul(.5)))), brickV = fract(v.div(.075));
  const mortar = step(brickU, .06).add(step(brickV, .12)).min(1);
  const brickTone = fract(sin(course.mul(17.3).add(floor(u.div(.23).add(fract(course.mul(.5)))).mul(3.1))).mul(4375.5)).mul(.18).add(.9);
  const brick = mix(vertexColor().rgb.mul(brickTone), vec3(.72, .69, .63), mortar);
  const slat = fract(u.div(.14)), slatTone = fract(sin(floor(u.div(.14)).mul(91.7)).mul(3758.5)).mul(.2).add(.85);
  const wood = vertexColor().rgb.mul(slatTone).mul(smoothstep(0, .12, slat).mul(.35).add(.65));
  const board = fract(v.div(.2)), clap = vertexColor().rgb.mul(smoothstep(0, .18, board).mul(.22).add(.78));
  // Deco piers: a lighter raised strip between the windows of each bay.
  const pier = is(6).mul(step(abs(fx.sub(.5)), .44).oneMinus()).mul(.12);
  let surface = vertexColor().rgb.mul(stucco);
  surface = mix(surface, brick, is(7));
  surface = mix(surface, wood, is(8));
  surface = mix(surface, clap, is(9));
  surface = surface.add(pier);
  // Dingbat carports: the ground floor is an open, shadowed garage.
  const carport = is(11).mul(ground).mul(step(fy, .9)).mul(step(.08, fract(u.div(3.2))));
  surface = mix(surface, vec3(.06, .06, .07), carport);
  // Tinted glass curtain walls: the vertex colour is the glass, mullions pale.
  const tinted = is(13);
  const wallCol = mix(mix(surface.mul(float(1).sub(plinth.mul(.28).mul(float(1).sub(tinted)))), vec3(.42, .41, .39).mul(stucco), top), vec3(.78, .8, .8), tinted.mul(float(1).sub(top)));
  const blinds = step(.72, h).mul(.5).mul(float(1).sub(is(3))).mul(float(1).sub(is(13)));
  const glassCol = mix(mix(vec3(.05, .07, .09), vertexColor().rgb.mul(.55), tinted), vec3(.55, .5, .42), blinds);
  const frameCol = mix(mix(vec3(.92, .9, .86), vec3(.16, .14, .12), step(.5, fract(seed.mul(.37)))), vec3(.2, .2, .21), is(14).max(is(12)).mul(step(.4, fract(seed.mul(.73)))));
  const finCol = vec3(.86, .84, .8);
  const wall = new T.MeshStandardNodeMaterial({metalness: 0});
  wall.colorNode = mix(mix(mix(wallCol, frameCol, frame), glassCol, glass), finCol, fin.mul(step(.2, fy)).mul(step(fy, .92)));
  wall.roughnessNode = mix(mix(float(.88), float(.6), is(8)), float(.06), glass);
  wall.metalnessNode = mix(float(0), float(.85), glass);
  // Lit windows after dark: warm tungsten, a few cool LED, ground-floor shops brighter.
  // Not every room is lit, and a lit room is brightest mid-window, dimmer at
  // the edges (curtains, ceilings), so a facade is never a grid of flat panels.
  const shopFloor = ground.mul(is(2).add(is(12)).min(1));
  const lit = step(mix(float(.7), float(.2), shopFloor), h).mul(glass).mul(night);   // ~30% of rooms lit, most shops
  const lamp = mix(vec3(1, .66, .34), vec3(.78, .86, 1), step(.94, h));
  const falloff = smoothstep(0, .5, fy).mul(smoothstep(1, .55, fy)).mul(.6).add(.4);
  wall.emissiveNode = lamp.mul(lit).mul(falloff).mul(mix(float(.3), float(1.1), shopFloor)).mul(h.mul(h).mul(1.1).add(.25))
    // Carport ceiling lights.
    .add(vec3(1, .8, .55).mul(carport).mul(step(.75, fy)).mul(step(abs(fract(u.div(3.2)).sub(.5)), .12)).mul(night).mul(.8));

  const trim = new T.MeshStandardNodeMaterial({metalness: 0, roughness: .7});
  trim.colorNode = vertexColor().rgb;
  const awning = new T.MeshStandardNodeMaterial({metalness: 0, roughness: .9, side: T.DoubleSide});
  // Fabric stripes across the awning.
  awning.colorNode = mix(vertexColor().rgb, vec3(.93, .91, .86), step(.5, fract(u.div(.6))).mul(.85));

  // Clay barrel tile: rows down the slope, rounded barrels across it.
  const tile = new T.MeshStandardNodeMaterial({metalness: 0, roughness: .75, side: T.DoubleSide});
  const row = fract(v.div(.34)), barrel = sin(u.div(.26).mul(Math.PI * 2)).mul(.5).add(.5);
  tile.colorNode = vertexColor().rgb.mul(smoothstep(0, .12, row).mul(.25).add(.75)).mul(barrel.mul(.25).add(.8))
    .mul(texture(tex.concrete.color, positionWorld.xz.div(9)).r.mul(.4).add(.7));

  const billboard = new T.MeshStandardNodeMaterial({metalness: 0, roughness: .6});
  const ads = adAtlas();
  const index = bi.w, col = index.mod(2), rowI = floor(index.div(2));
  // Canvas row 0 is at the top; texture v runs up, so row r sits at v = (2 - r) / 3.
  const adUV = uv().mul(vec2(.5, 1 / 3)).add(vec2(col.mul(.5), float(2).sub(rowI).div(3)));
  billboard.colorNode = texture(ads, adUV).rgb;
  billboard.emissiveNode = texture(ads, adUV).rgb.mul(night.mul(1.4));

  // Shop signs: 48 fictional businesses (signs.js); neon and lightboxes after dark.
  const signs = new T.MeshStandardNodeMaterial({metalness: 0, roughness: .5, side: T.DoubleSide});
  const sAtlas = signAtlas();
  const sIdx = bi.w, sc = sIdx.mod(COLS), sr = floor(sIdx.div(COLS));
  const sUV = uv().mul(vec2(1 / COLS, 1 / ROWS)).add(vec2(sc.div(COLS), float(ROWS - 1).sub(sr).div(ROWS)));
  signs.colorNode = texture(sAtlas.color, sUV).rgb;
  signs.emissiveNode = texture(sAtlas.color, sUV).rgb.mul(texture(sAtlas.glow, sUV).r).mul(night.mul(2.2).add(.04));

  // Marquee boards: rows of bulbs that chase after dark.
  const marquee = new T.MeshStandardNodeMaterial({metalness: .2, roughness: .4});
  const bulb = float(1).sub(smoothstep(.18, .32, vec2(fract(u.div(.35)).sub(.5), fract(v.div(.35)).sub(.5)).length()));
  const chase = step(.5, fract(floor(u.div(.35)).mul(.25).sub(time.mul(1.6))));
  marquee.colorNode = mix(vertexColor().rgb, vec3(1, .93, .75), bulb.mul(.8));
  marquee.emissiveNode = vec3(1, .78, .42).mul(bulb).mul(night.mul(2.4).mul(chase.mul(.6).add(.4)).add(.03));

  // Parking lots: sealed asphalt with white stalls, 2.7 m apart, 5.5 m deep, both ends.
  const lot = new T.MeshStandardNodeMaterial({metalness: 0, roughness: .9});
  const lx = uv().x, lz = uv().y;
  const stall = step(fract(lz.div(2.7)), .045).mul(step(lx, 5.5).add(step(lx.negate(), -6.5).mul(step(lx, 12))).min(1));
  const lotTex = texture(tex.asphalt?.color ?? tex.concrete.color, positionWorld.xz.div(12)).r.mul(.3).add(.55);
  lot.colorNode = mix(vec3(.2, .2, .21).mul(lotTex), vec3(.85, .85, .8), stall);

  // Pools: turquoise, glossy, a little caustic shimmer and a glow at night.
  const pool = new T.MeshStandardNodeMaterial({metalness: 0, roughness: .05});
  const ripple = sin(positionWorld.x.mul(2.3).add(time.mul(1.7))).mul(sin(positionWorld.z.mul(2.9).sub(time.mul(1.3)))).mul(.5).add(.5);
  pool.colorNode = mix(vec3(.05, .45, .55), vec3(.35, .8, .85), ripple.mul(.35));
  pool.emissiveNode = vec3(.1, .55, .7).mul(night.mul(.9)).add(vec3(.02, .08, .09).mul(ripple));

  // Lit architecture: crown rings, lit roof edges, aviation beacons. Faint
  // by day, bright after dark (bloom makes them read from across the city).
  const glow = new T.MeshStandardNodeMaterial({metalness: 0, roughness: .4, side: T.DoubleSide});
  glow.colorNode = vertexColor().rgb.mul(.7);
  glow.emissiveNode = vertexColor().rgb.mul(night.mul(3.2).add(.06));
  return {wall, trim, awning, tile, billboard, signs, marquee, lot, pool, glow, night};
}

/** Six fictional billboards in a 2 x 3 atlas. No real brands. */
function adAtlas() {
  const W = 2048, H = 1536, c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'), w = W / 2, h = H / 3;
  const ads = [
    {bg: ['#0e1a2b', '#3a1d4a'], title: 'SANTERRA', sub: 'A FILM BY NOBODY YOU KNOW · SUMMER', accent: '#f2c46d', font: 'bold 150px Georgia'},
    {bg: ['#f3efe6', '#e9dfcf'], title: 'pacific', sub: 'still water, bottled at the coast', accent: '#1f5f8b', font: 'italic 170px Georgia', dark: true},
    {bg: ['#d8452f', '#f08a3c'], title: 'SUNSET TOUR', sub: 'LIVE · THE ROXIE · SEPT 26–28', accent: '#fff1d6', font: 'bold 150px Helvetica'},
    {bg: ['#101010', '#2a2a2a'], title: 'NOIR', sub: 'eau de parfum', accent: '#e8e2d4', font: '300 190px Helvetica'},
    {bg: ['#1d6b5c', '#9ed0b8'], title: 'CANYON', sub: 'THE NEW ELECTRIC SUV · 0–60 IN 3.4', accent: '#ffffff', font: 'bold 160px Helvetica'},
    {bg: ['#f6d8e2', '#c3a7e0'], title: 'Glow', sub: 'skin, but make it golden hour', accent: '#5a2d6b', font: 'bold 180px Georgia', dark: true},
  ];
  ads.forEach((ad, i) => {
    const x = (i % 2) * w, y = Math.floor(i / 2) * h;
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, ad.bg[0]); g.addColorStop(1, ad.bg[1]);
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ad.accent; ctx.globalAlpha = .18;
    ctx.beginPath(); ctx.arc(x + w * .82, y + h * .5, h * .55, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = ad.dark ? '#1b1b1b' : '#ffffff'; ctx.font = ad.font; ctx.textBaseline = 'middle';
    ctx.fillText(ad.title, x + 60, y + h * .42, w - 120);
    ctx.fillStyle = ad.accent; ctx.font = 'bold 44px Helvetica';
    ctx.fillText(ad.sub, x + 64, y + h * .78, w - 128);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x, y + h - 10, w, 10);
  });
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
