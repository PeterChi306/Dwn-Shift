/* The Pacific (2026-09-27): one big plane at sea level south of the beach.
 *
 * Opaque, lit like any other surface so the sky's environment probe gives
 * it the sunset and the night: deep blue-green offshore, turquoise over the
 * sand in the shallows, and white surf lines rolling in toward the shore.
 * The shoreline is world/coast.js shoreZ, mirrored here in TSL, so the surf
 * breaks exactly where the sand meets the water. Swell is in the normals
 * (a handful of travelling sine waves, derivatives worked out analytically),
 * which keeps the plane at four vertices.
 */
import * as T from 'three';
import {Fn, cameraPosition, positionWorld, vec3, float, sin, cos, time, smoothstep, mix, max, min, clamp, transformNormalToView, abs} from 'three/tsl';
import {SEA_Y, BEACH_Z} from './coast.js';

// Direction (x, z), wavelength (m), amplitude (slope scale), speed (m/s).
const WAVES = [
  [.12, -1, 38, .16, 5.2], [-.35, -1, 21, .1, 3.9], [.6, -.8, 11, .07, 2.6],
  [-.8, -.6, 6.5, .05, 2.0], [.2, -1, 3.1, .035, 1.4], [-.5, -.85, 1.7, .02, 1.0],
];

export function buildSea({scene}) {
  const mat = new T.MeshStandardNodeMaterial({metalness: 0});
  const x = positionWorld.x, z = positionWorld.z;
  // Mirrors coast.js shoreZ.
  const head = smoothstep(-2640, -2480, x).mul(float(1).sub(smoothstep(-1990, -1830, x))).mul(230);
  const shore = float(4045).add(sin(x.div(1100).add(.4)).mul(48)).add(sin(x.div(430).add(2.1)).mul(21)).add(head);
  const d = z.sub(shore);                                        // metres out from the waterline
  // Swell normal: sum of sine waves; slopes fade in the surf and far out.
  const normal = Fn(() => {
    let gx = float(0), gz = float(0);
    // A slow domain warp so crests wander instead of tiling into diamonds.
    const warp = sin(x.mul(.011).add(z.mul(.006))).mul(2.2).add(sin(x.mul(.0043).sub(z.mul(.009)).add(time.mul(.05))).mul(3.1));
    for (const [dx, dz, L, A, c] of WAVES) {
      const l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l, k = 2 * Math.PI / L;
      const ph = x.mul(ux * k).add(z.mul(uz * k)).sub(time.mul(c * k)).add(warp.mul(L < 10 ? .4 : 1));
      const s = cos(ph).mul(A);
      gx = gx.add(s.mul(ux)); gz = gz.add(s.mul(uz));
    }
    // Calmer in the surf, and with distance from the camera (fine ripples far
    // away only alias into a moire).
    const far = positionWorld.sub(cameraPosition).length();
    const calm = smoothstep(0, 18, d).mul(float(1).sub(smoothstep(120, 1600, far).mul(.72)));
    return transformNormalToView(vec3(gx.mul(calm).negate(), 1, gz.mul(calm).negate()).normalize());
  })();
  mat.normalNode = normal;
  // Surf: lines of foam moving shoreward, strongest a few metres out, plus the
  // wash right at the edge; broken up so they never read as stripes.
  const foam = Fn(() => {
    const breakup = sin(x.mul(.21).add(z.mul(.05))).mul(sin(x.mul(.047).sub(time.mul(.3)))).mul(.5).add(.5);
    const band = sin(d.mul(.32).add(time.mul(1.25))).mul(.5).add(.5);
    const lines = smoothstep(.8, .97, band).mul(float(1).sub(smoothstep(4, 46, d))).mul(breakup.mul(.7).add(.3));
    const wash = float(1).sub(smoothstep(-.5, 5, d)).mul(sin(time.mul(.9).add(x.mul(.02))).mul(.25).add(.75));
    return clamp(max(lines, wash), 0, 1);
  })();
  const deep = vec3(.018, .075, .11), mid = vec3(.03, .19, .24), shallow = vec3(.19, .48, .47);
  const water = mix(mix(shallow, mid, smoothstep(2, 70, d)), deep, smoothstep(60, 700, d));
  mat.colorNode = mix(water, vec3(.93, .95, .93), foam);
  mat.roughnessNode = mix(float(.07), float(.6), foam).add(smoothstep(0, 4, abs(d)).mul(0));
  const geo = new T.PlaneGeometry(120000, 70000);
  geo.rotateX(-Math.PI / 2);
  const mesh = new T.Mesh(geo, mat);
  mesh.position.set(0, SEA_Y, BEACH_Z + 35000 - 400);
  mesh.receiveShadow = true;
  mesh.userData.kind = 'sea';
  scene.add(mesh);
  void min;
  return {mesh};
}
