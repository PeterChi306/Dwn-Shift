/* Sky, sun and fog on one clock.
 *
 * Built to look like a Southern California sunset, piece by piece:
 *   - toward the sun, the horizon goes white-gold, then deep orange, with a
 *     warm haze band low down (the basin's summer haze);
 *   - opposite the sun, the pink "belt of Venus" sits above the blue-grey
 *     shadow of the earth rising from the horizon;
 *   - overhead the blue deepens to violet;
 *   - clouds catch the light from below: gold near the sun, pink away from it,
 *     with dark lavender bellies;
 *   - after dusk, stars.
 * Colours are authored in display space and linearised, so tone mapping and
 * the environment probe both see proper radiance.
 */
import * as T from 'three';
import {Fn, uniform, vec2, vec3, float, positionLocal, normalize, dot, sin, fract, floor, mix, smoothstep,
  exp, pow, max, clamp, step, sRGBTransferEOTF} from 'three/tsl';
import {weather} from './rain.js';

const hash = Fn(([p]) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453)));
const noise = Fn(([p]) => {
  const i = floor(p), f = fract(p), u = f.mul(f).mul(float(3).sub(f.mul(2)));
  return mix(mix(hash(i), hash(i.add(vec2(1, 0))), u.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(1)), u.x), u.y);
});
const fbm = Fn(([p]) => noise(p).mul(.5).add(noise(p.mul(2.03)).mul(.26)).add(noise(p.mul(4.1)).mul(.14)).add(noise(p.mul(8.3)).mul(.1)));

/** How the light looks for a sun elevation (sin of altitude). Shared by the
 *  sky shader's constants and by the scene lights, so they always agree. */
export function skyState(elev) {
  const day = Math.min(1, Math.max(0, (elev + .12) / .37));
  const golden = Math.exp(-(((elev - .04) / .2) ** 2));
  const dusk = Math.exp(-(((elev + .05) / .09) ** 2));
  return {day, golden, dusk};
}

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer; this.hour = 18.4;
    this.sunDir = uniform(new T.Vector3(0, 1, .3));
    this.time = uniform(0);
    const sunDir = this.sunDir, time = this.time;
    const color = Fn(() => {
      const d = normalize(positionLocal).toVar();
      const elev = sunDir.y;
      const day = clamp(elev.add(.12).div(.37), 0, 1);
      const golden = exp(pow(elev.sub(.04).div(.2), 2).negate());
      const dusk = exp(pow(elev.add(.05).div(.09), 2).negate());
      const h = clamp(d.y, 0, 1), hSoft = pow(h, .45);
      const flatSun = normalize(vec3(sunDir.x, 0, sunDir.z));
      // Clamped: exactly opposite the sun float error takes it a hair below 0,
      // and pow() of a negative is NaN (a dashed line straight up the sky).
      const toward = clamp(dot(normalize(vec3(d.x, 0, d.z)), flatSun).mul(.5).add(.5), 0, 1);   // 1 facing the sun, 0 behind

      // Overhead: blue by day, deeper and a little violet at sunset, navy at night.
      const zenith = mix(mix(vec3(.012, .02, .05), vec3(.16, .2, .44), dusk.add(golden).min(1)), vec3(.13, .33, .66), day);
      // The horizon, facing away from the sun: pale blue by day; at sunset the
      // pink belt of Venus; after dusk a dusky mauve.
      const horizonAway = mix(mix(vec3(.05, .06, .12), vec3(.62, .45, .6), dusk.add(golden.mul(.8)).min(1)), vec3(.68, .79, .9), day.mul(float(1).sub(golden.mul(.75))));
      // The horizon toward the sun: gold to deep orange as it sinks.
      const horizonSun = mix(mix(vec3(.08, .07, .12), vec3(.98, .42, .16), dusk.add(golden).min(1)), vec3(.74, .83, .92), day.mul(float(1).sub(golden)));
      const horizon = mix(horizonAway, horizonSun, pow(toward, 2.2));
      const c = mix(horizon, zenith, hSoft).toVar();
      // Warm haze low over the basin, strongest toward the sun.
      const haze = exp(h.mul(-16)).mul(golden.mul(.45).add(.08)).mul(toward.mul(.7).add(.3));
      c.assign(mix(c, vec3(1, .62, .32), haze.mul(golden.add(.15).min(1))));
      // Earth's shadow: the blue-grey band rising opposite the sun at dusk.
      c.assign(mix(c, vec3(.3, .33, .46), float(1).sub(toward).mul(dusk).mul(smoothstep(.09, .0, h)).mul(.7)));

      // The sun: disc, tight glare, and a wide warm glow that grows as it sets.
      const sa = max(dot(d, sunDir), 0), visible = smoothstep(-.02, .03, d.y).mul(smoothstep(-.1, .02, elev));
      const sunCol = mix(vec3(1, .95, .85), vec3(1, .55, .2), golden);
      c.addAssign(sunCol.mul(pow(sa, 1200).mul(30).add(pow(sa, 90).mul(.7)).add(pow(sa, 9).mul(golden.mul(.22).add(.05)))).mul(visible));
      c.addAssign(vec3(1, .45, .2).mul(pow(sa, 3).mul(golden.mul(.14))).mul(smoothstep(.0, .2, float(1).sub(h))));

      // Moon opposite the sun, and stars once the sky is dark.
      const ma = max(dot(d, sunDir.negate()), 0), night = float(1).sub(day);
      c.addAssign(vec3(1, 1, .95).mul(smoothstep(.99935, .99965, ma)).add(vec3(.3, .36, .5).mul(pow(ma, 40)).mul(.25)).mul(night));
      const sp = floor(d.xz.div(d.y.add(.35)).mul(360)), s = hash(sp);
      c.addAssign(vec3(.9, .94, 1).mul(smoothstep(.9975, 1, s)).mul(night.mul(night)).mul(sin(time.mul(2).add(s.mul(90))).mul(.4).add(.6)).mul(step(0, d.y)));

      // Clouds: broad fair-weather cover plus fast high wisps, lit from below
      // at sunset — gold near the sun, pink away from it, lavender bellies.
      const p = d.xz.div(max(d.y.add(.1), .09)).mul(2.1).add(vec2(time.mul(.004), time.mul(.0016)));
      const cover = fbm(p), cloud = smoothstep(.52, .8, cover).mul(smoothstep(.02, .16, d.y));
      const thick = fbm(p.mul(2.4).add(vec2(time.mul(.006), 0)));
      const lit = mix(mix(vec3(.3, .32, .42), vec3(1, .99, .96), day.mul(float(1).sub(golden.mul(.6)))),
        mix(vec3(.96, .52, .6), vec3(1, .7, .35), pow(toward, 1.5)), golden.add(dusk.mul(.7)).min(1));
      const belly = mix(mix(vec3(.08, .09, .14), vec3(.56, .58, .64), day), vec3(.46, .34, .48), golden);
      c.assign(mix(c, mix(belly, lit, smoothstep(.3, .85, thick)), cloud.mul(.92)));
      const wisp = smoothstep(.6, .88, fbm(p.mul(1.5).add(vec2(time.mul(.01), time.mul(.003))))).mul(smoothstep(.06, .3, d.y));
      c.assign(mix(c, lit, wisp.mul(.32)));
      // Weather (2026-10-03): a low grey deck rolls over everything, darker
      // bellies moving fast under it, lit from inside by lightning.
      const oc = weather.cloud, fl = weather.flash;
      const deck = fbm(p.mul(.55).add(vec2(time.mul(.03), time.mul(.012)))), scud = fbm(p.mul(1.6).add(vec2(time.mul(.07), time.mul(.02))));
      const grey = mix(vec3(.018, .02, .026), vec3(.4, .43, .48), day.mul(.85).add(golden.mul(.1))).mul(deck.mul(.55).add(.62)).mul(float(1).sub(smoothstep(.55, .85, scud).mul(.28)));
      const bolt = pow(max(dot(d, weather.flashDir), 0), 4), storm = grey.add(vec3(.75, .8, 1).mul(fl).mul(deck.mul(1.2).add(.3)).mul(bolt.mul(1.6).add(.35)));
      c.assign(mix(c, storm, oc.mul(smoothstep(-.25, .02, d.y).mul(.15).add(.85))));
      return sRGBTransferEOTF(max(c, vec3(0)));
    });
    const mat = new T.MeshBasicNodeMaterial({side: T.BackSide, depthWrite: false, fog: false, toneMapped: false});
    mat.colorNode = color();
    this.mesh = new T.Mesh(new T.SphereGeometry(25000, 48, 28), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
    this.pmrem = new T.PMREMGenerator(renderer);
    this.envScene = new T.Scene();
    this.envMesh = new T.Mesh(new T.SphereGeometry(100, 32, 16), mat);
    this.envScene.add(this.envMesh);
  }

  /** Direction to the sun for an hour: rises east, sets west-north-west (summer
   *  in LA), riding south of overhead at noon. */
  sunDirection(hour) {
    // Sunrise ~5:55, sunset ~19:50 (LA in summer); golden hour ~19:00-19:45.
    const theta = (hour - 5.9) / 13.95 * Math.PI;
    return new T.Vector3(Math.cos(theta), Math.sin(theta) * .92, .32 * (1 - Math.sin(theta)) + .12).normalize();
  }

  refreshEnvironment(force = false) {
    const oc = weather.cloud.value;
    if (!force && Math.abs(this.hour - (this.envHour ?? -99)) < .15 && Math.abs(oc - (this.envCloud ?? -1)) < .08) return;
    this.envHour = this.hour; this.envCloud = oc;
    const target = this.pmrem.fromScene(this.envScene, 0, .1, 1000);
    this.envTarget?.dispose();
    this.envTarget = target;
    this.scene.environment = target.texture;
  }

  update(x, z, time, hour) {
    this.hour = hour;
    this.mesh.position.set(x, 0, z);
    this.time.value = time;
    this.sunDir.value.copy(this.sunDirection(hour));
    this.refreshEnvironment();
  }

  /** Sun, hemisphere bounce and fog follow the same clock as the sky. */
  applyLighting({sun, hemi, fog, position, tunnel = 0}) {
    // tunnel: 0 open air .. 1 deep in a bore (eased by the caller, so the light
    // fades in and out over a second instead of switching at the portal).
    const T0 = +tunnel, mixT = (open, dark) => open + (dark - open) * T0;
    const dir = this.sunDirection(this.hour), elev = dir.y, {day, golden, dusk} = skyState(elev);
    sun.position.copy(position).addScaledVector(dir, 300);
    sun.target.position.copy(position);
    // Low sun: deep gold light, long shadows; gone below the horizon.
    const warm = new T.Color('#fff4e6').lerp(new T.Color('#ff9a4a'), Math.min(1, golden * 1.1)).lerp(new T.Color('#ff6a3a'), dusk * .6);
    sun.color.copy(warm);
    // Noon in LA is hard light: a strong sun and comparatively little fill, or
    // the whole street goes flat and chalky under AgX.
    const high = Math.max(0, Math.min(1, (elev - .35) / .4));
    sun.intensity = mixT(Math.max(0, Math.min(1, (elev + .02) / .06)) * (1.2 + day * 2.4 + high * .6), .05);
    // Sky light: blue by day, lavender at sunset, deep blue at night.
    hemi.color.copy(new T.Color('#2a3350').lerp(new T.Color('#b58ea6'), Math.min(1, golden + dusk * .6)).lerp(new T.Color('#bcd4ec'), day * (1 - golden * .7)));
    hemi.groundColor.copy(new T.Color('#1d1a1c').lerp(new T.Color('#7a5a48'), golden).lerp(new T.Color('#8d7f6b'), day * (1 - golden)));
    hemi.intensity = mixT(.25 + day * (1.05 - high * .5), .12);
    // Fog lands on the horizon colour the sky shader paints (its average across bearings).
    const lin = (r, g, b) => new T.Color().setRGB(r, g, b, T.SRGBColorSpace);
    const horizon = lin(.05, .06, .12).lerp(lin(.82, .5, .42), Math.min(1, dusk + golden)).lerp(lin(.72, .81, .9), day * (1 - golden * .85));
    fog.color.copy(horizon);
    fog.density = .00005 + (1 - day) * .00005 - high * .00002;
    this.scene.environmentIntensity = mixT(.25 + day * (.85 - high * .35), .07);
    // Overcast and rain: the sun goes in, the light goes flat and grey, the fog closes in; lightning lights it all.
    const oc = weather.cloud.value, rain = weather.rain.value, fl = weather.flash.value;
    if (oc > .001) {
      sun.intensity *= 1 - oc * .9;
      hemi.color.lerp(new T.Color('#9aa3ae'), oc * day).lerp(new T.Color('#1c2028'), oc * (1 - day) * .5);
      hemi.groundColor.lerp(new T.Color('#2e2f31'), oc);
      hemi.intensity = mixT(hemi.intensity * (1 - oc * .2) + oc * day * .25, .12);
      fog.color.lerp(lin(.34, .36, .4).multiplyScalar(.12 + day * .88), oc);
      fog.density += oc * (.00014 + rain * .00042);
      this.scene.environmentIntensity *= 1 - oc * .25;
    }
    if (fl > 0) { hemi.intensity += fl * 3.2 * (1 - T0); hemi.color.lerp(new T.Color('#c9d6ff'), Math.min(1, fl)); }
    this.night = day * (1 - oc * .6) < .22;
    this.last = {hour: this.hour, elev, day, golden, dusk, sun: sun.intensity, hemi: hemi.intensity};
  }
}
