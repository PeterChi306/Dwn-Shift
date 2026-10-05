/* On foot (2026-09-27): park, press F, get out and walk round the house.
 *
 * A Rapier kinematic character controller on a capsule: it slides along
 * walls, climbs stairs by autostep, snaps to the ground going down, and
 * pushes nothing it should not. The body is a simple figure (legs and arms
 * swing with the stride, a little bob), built once; the camera follows it
 * from behind (world.js). Terrain colliders stream round whatever the
 * camera is following, so the ground is solid wherever you walk.
 */
import * as T from 'three';

const HALF = .55, RAD = .3;                  // capsule: 1.7 m tall
export class Walker {
  constructor({scene, physics}) {
    const R = physics.R, w = physics.world;
    this.R = R; this.world = w; this.physics = physics;
    this.water = null;          // {y, floor} of the water here, set by world.js each frame
    this.swimming = false; this.wading = 0; this.t = 0;
    this.body = w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -500, 0));
    this.collider = w.createCollider(R.ColliderDesc.capsule(HALF, RAD).setFriction(.5), this.body);
    this.collider.setEnabled(false);
    this.ctl = w.createCharacterController(.03);
    this.ctl.enableAutostep(.42, .18, true);
    this.ctl.enableSnapToGround(.5);
    this.ctl.setMaxSlopeClimbAngle(52 * Math.PI / 180);
    this.ctl.setMinSlopeSlideAngle(40 * Math.PI / 180);
    this.ctl.setApplyImpulsesToDynamicBodies(false);
    this.active = false; this.vy = 0; this.yaw = 0; this.phase = 0; this.speed = 0; this.grounded = false;
    this.pos = new T.Vector3(0, -500, 0);
    this.mesh = person(); this.mesh.visible = false; scene.add(this.mesh);
  }
  enter(x, y, z, yaw) {
    this.active = true; this.vy = 0; this.yaw = yaw; this.speed = 0;
    this.collider.setEnabled(true);
    this.body.setTranslation({x, y: y + HALF + RAD + .05, z}, true);
    this.body.setNextKinematicTranslation({x, y: y + HALF + RAD + .05, z});
    this.pos.set(x, y, z);
    this.mesh.visible = true;
  }
  /** Set down at a point (feet), keeping the way you face: the sky-deck elevator carries you this way. */
  place(x, y, z) {
    const t = {x, y: y + HALF + RAD + .02, z};
    this.body.setTranslation(t, true); this.body.setNextKinematicTranslation(t);
    this.pos.set(x, y, z); this.vy = 0; this.speed = 0; this.grounded = true;
    this.mesh.position.set(x, y, z);
  }
  leave() {
    this.active = false; this.mesh.visible = false;
    this.collider.setEnabled(false);
    this.body.setTranslation({x: 0, y: -500, z: 0}, true);
  }
  /** input: {fwd, right, run, crouch, jump} in -1..1; camYaw: the camera's heading. */
  update(dt, input, camYaw) {
    if (!this.active) return;
    this.t += dt;
    const t = this.body.translation(), feet = t.y - HALF - RAD, W = this.water;
    // Water: over your chest it carries you (swim, head out, slow strokes);
    // shallower it drags at your legs.
    const depth = W ? W.y - feet : 0;
    this.swimming = !!W && W.y - W.floor > 1.25 && depth > 1.2 - (this.swimming ? .25 : 0);
    this.wading = W && !this.swimming ? clamp01(depth / 1.1) : 0;
    if (this.swimming) return this.swim(dt, input, camYaw, t, W);
    // Wanted velocity, relative to where the camera looks.
    let fx = Math.sin(camYaw) * input.fwd - Math.cos(camYaw) * input.right, fz = Math.cos(camYaw) * input.fwd + Math.sin(camYaw) * input.right;
    const l = Math.hypot(fx, fz); if (l > 1) { fx /= l; fz /= l; }
    const top = (input.crouch ? 1.2 : input.run ? 6.2 : 2.8) * (1 - this.wading * .55), want = l > .05 ? top : 0;
    this.speed += (want - this.speed) * (1 - Math.exp(-dt * (want > this.speed ? 7 : 10)));
    if (l > .05) {
      const target = Math.atan2(fx, fz); let d = target - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * (1 - Math.exp(-dt * 12));
    }
    if (this.grounded && input.jump) this.vy = 4.6;
    this.vy -= 9.81 * dt;
    const dir = l > .05 ? [fx / Math.max(l, 1e-3), fz / Math.max(l, 1e-3)] : [0, 0];
    const move = {x: dir[0] * this.speed * dt, y: this.vy * dt, z: dir[1] * this.speed * dt};
    this.ctl.computeColliderMovement(this.collider, move);
    const m = this.ctl.computedMovement();
    this.grounded = this.ctl.computedGrounded();
    if (this.grounded && this.vy < 0) this.vy = -1;
    const nx = t.x + m.x, ny = t.y + m.y, nz = t.z + m.z;
    this.body.setNextKinematicTranslation({x: nx, y: ny, z: nz});
    // Fell off the world: back up where it started.
    this.pos.set(nx, ny - HALF - RAD, nz);
    // The figure: faces its way, legs and arms swing with the stride.
    this.phase += dt * this.speed * (input.run ? 2.2 : 2.9);
    const swing = Math.sin(this.phase) * Math.min(1, this.speed / 2.5) * (input.run ? .9 : .55), bob = Math.abs(Math.cos(this.phase)) * Math.min(1, this.speed / 3) * .05;
    this.mesh.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.mesh.rotation.y = this.yaw;
    const P = this.mesh.userData;
    P.legL.rotation.x = swing; P.legR.rotation.x = -swing;
    P.armL.rotation.x = -swing * .8; P.armR.rotation.x = swing * .8;
    P.torso.rotation.x = input.run ? .12 * Math.min(1, this.speed / 4) : 0;
    if (!this.grounded) { P.legL.rotation.x = .5; P.legR.rotation.x = -.2; }
    // Crouched: knees bent, the body down about 60 cm (others in a lobby see it too).
    this.crouchK = (this.crouchK || 0) + ((input.crouch ? 1 : 0) - (this.crouchK || 0)) * (1 - Math.exp(-dt * 9));
    if (this.crouchK > .01) { const k = this.crouchK; this.mesh.position.y -= k * .45; P.legL.rotation.x += -1.3 * k; P.legR.rotation.x += -1.1 * k; P.torso.rotation.x += .35 * k; }
  }
  /** Swimming: buoyancy holds the eyes ~25 cm over the surface with a gentle
   *  bob; breaststroke pace; Space kicks up. Push into the pool wall where the
   *  deck is within reach and you haul yourself out. */
  swim(dt, input, camYaw, t, W) {
    let fx = Math.sin(camYaw) * input.fwd - Math.cos(camYaw) * input.right, fz = Math.cos(camYaw) * input.fwd + Math.sin(camYaw) * input.right;
    const l = Math.hypot(fx, fz); if (l > 1) { fx /= l; fz /= l; }
    const want = l > .05 ? (input.run ? 1.9 : 1.15) : 0;
    this.speed += (want - this.speed) * (1 - Math.exp(-dt * 2.2));
    if (l > .05) { const d = Math.atan2(Math.sin(Math.atan2(fx, fz) - this.yaw), Math.cos(Math.atan2(fx, fz) - this.yaw)); this.yaw += d * (1 - Math.exp(-dt * 6)); }
    const target = W.y - 1.38 + Math.sin(this.t * 1.9) * .035 + (input.jump ? .22 : 0), feet = t.y - HALF - RAD;
    this.vy += ((target - feet) * 9 - this.vy * 4.5) * dt;
    const dir = l > .05 ? [fx / Math.max(l, 1e-3), fz / Math.max(l, 1e-3)] : [Math.sin(this.yaw), Math.cos(this.yaw)];
    const s = l > .05 ? this.speed : this.speed * .96;
    const move = {x: dir[0] * s * dt, y: this.vy * dt, z: dir[1] * s * dt};
    this.ctl.computeColliderMovement(this.collider, move);
    const m = this.ctl.computedMovement();
    // Blocked while pushing forward: is there a deck to climb onto?
    if (l > .3 && input.fwd > .3 && Math.hypot(m.x, m.z) < Math.hypot(move.x, move.z) * .35) {
      const px = t.x + dir[0] * .75, pz = t.z + dir[1] * .75;
      const hit = this.physics.surfaceAt(px, W.y + 1.4, pz, 2.2, this.collider);
      if (hit && hit.y > W.y - .3 && hit.y < W.y + .75) { this.enter(px, hit.y + .02, pz, this.yaw); this.climbed = true; this.swimming = false; return; }
    }
    const nx = t.x + m.x, ny = t.y + m.y, nz = t.z + m.z;
    this.body.setNextKinematicTranslation({x: nx, y: ny, z: nz});
    this.grounded = false;
    this.pos.set(nx, ny - HALF - RAD, nz);
    this.phase += dt * (1.4 + this.speed * 1.6);
    const P = this.mesh.userData, stroke = Math.sin(this.phase);
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z); this.mesh.rotation.y = this.yaw;
    P.torso.rotation.x = .9; P.armL.rotation.x = -1.6 + stroke * .9; P.armR.rotation.x = -1.6 + stroke * .9;
    P.legL.rotation.x = .9 + stroke * .4; P.legR.rotation.x = .9 - stroke * .4;
  }
}
const clamp01 = v => Math.max(0, Math.min(1, v));

/** A simple figure: jeans, a white tee, a dark jacket, trainers. Faces +z. */
function person() {
  const g = new T.Group(), m = c => new T.MeshStandardMaterial({color: c, roughness: .8});
  const skin = m('#c99a78'), jeans = m('#2e3f5c'), tee = m('#ecebe6'), jacket = m('#20242a'), shoe = m('#f2f2ee'), hair = m('#1d1a18');
  const limb = (mat, w, h, d, x, y) => { const pivot = new T.Group(); pivot.position.set(x, y, 0); const b = new T.Mesh(new T.BoxGeometry(w, h, d), mat); b.position.y = -h / 2; b.castShadow = true; pivot.add(b); g.add(pivot); return pivot; };
  const legL = limb(jeans, .17, .86, .2, .11, .9), legR = limb(jeans, .17, .86, .2, -.11, .9);
  for (const leg of [legL, legR]) { const s = new T.Mesh(new T.BoxGeometry(.18, .1, .3), shoe); s.position.set(0, -.86, .05); leg.add(s); }
  const torso = new T.Group(); torso.position.y = .9; g.add(torso);
  const body = new T.Mesh(new T.BoxGeometry(.44, .62, .24), jacket); body.position.y = .33; body.castShadow = true; torso.add(body);
  const shirt = new T.Mesh(new T.BoxGeometry(.18, .5, .02), tee); shirt.position.set(0, .34, .125); torso.add(shirt);
  const head = new T.Mesh(new T.SphereGeometry(.12, 16, 12), skin); head.position.y = .8; head.scale.set(.9, 1.08, .95); head.castShadow = true; torso.add(head);
  const cap = new T.Mesh(new T.SphereGeometry(.125, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hair); cap.position.y = .83; torso.add(cap);
  const neck = new T.Mesh(new T.CylinderGeometry(.05, .05, .08, 8), skin); neck.position.y = .67; torso.add(neck);
  const arm = (x) => { const p = new T.Group(); p.position.set(x, .6, 0); const a = new T.Mesh(new T.BoxGeometry(.12, .6, .13), jacket); a.position.y = -.3; a.castShadow = true; p.add(a); const hnd = new T.Mesh(new T.BoxGeometry(.09, .1, .1), skin); hnd.position.y = -.64; p.add(hnd); torso.add(p); return p; };
  const armL = arm(.29), armR = arm(-.29);
  g.userData = {legL, legR, armL, armR, torso};
  return g;
}
