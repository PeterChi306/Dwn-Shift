/* Designs (2026-10-04, Peter: "multiple designs of your own ... for each car
 * design it'll be an individual car ... you can choose which one you want to
 * work on inside the workshop").
 *
 * A design is one car of yours: its name, the workshop build, paint, cabin
 * light, engine sound and handling (ten at most). One is ACTIVE: the car you drive and the
 * one DWN Works dresses; its values are mirrored to the old per-browser keys
 * (dwnBuild, dwnPaint:aurora, ...) so everything that read them still works,
 * and every change is captured back into it. The others are either STORED (a
 * line in the list) or PARKED: standing somewhere in the world as a real car
 * (the Mulholland basement, usually), with a collider, where you left it. Walk
 * up to a parked one and press F: you get in it, and the car you came in is
 * parked where it stands (or stored, if it is not somewhere it can be left).
 * Kept per browser: {active, list: [{id, name, build, paint, ambient, sound,
 * handling, park: null | {x, y, z, q, wy, stall, turn}}]}.
 */
import * as T from 'three';

export const MAX_DESIGNS = 10;
const KEY = 'dwnDesigns', MAX = MAX_DESIGNS;
const uid = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export class Designs {
  /** io: {capture(): the active car's {build, paint, ambient, sound, handling}, apply(d): put a design on the
   *  player car, factory(): a fresh design's values, makeCar(d): a vehicle (makePlayerCar + build), scene, physics,
   *  freeBay(taken): a park pose in an empty bay of the basement garage, or null} */
  constructor(io) {
    this.io = io; this.models = new Map(); this.applying = false;
    let s = null; try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
    if (!s || !Array.isArray(s.list) || !s.list.length) {
      let name = 'Aurora'; try { const n = localStorage.getItem('dwnBuildName'); if (n && !/^(Factory|Custom)$/.test(n)) name = n; } catch {}
      s = {active: null, list: [{id: uid(), name, ...io.capture(), park: null}]};
      s.active = s.list[0].id;
    }
    if (!s.list.some(d => d.id === s.active)) s.active = s.list[0].id;
    this.s = s;
    // The car you drive is with you, not parked.
    this.active.park = null; this.save();
  }
  get list() { return this.s.list; }
  get active() { return this.s.list.find(d => d.id === this.s.active); }
  get(id) { return this.s.list.find(d => d.id === id); }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch {} }
  /** The player car changed (workshop, garage): keep it in the active design. */
  capture() { if (this.applying) return; Object.assign(this.active, this.io.capture()); this.save(); }
  rename(id, name) { const d = this.get(id); if (!d) return; d.name = String(name || '').trim().slice(0, 28) || d.name; this.save(); }
  /** A new design: a copy of `from` (or the factory car), stored. */
  create(from = null) {
    if (this.list.length >= MAX) return null;
    const src = from ? this.get(from) : null;
    const base = src ? JSON.parse(JSON.stringify({build: src.build, paint: src.paint, ambient: src.ambient, sound: src.sound, handling: src.handling})) : this.io.factory();
    let n = this.list.length + 1, name = src ? src.name + ' II' : 'Design ' + n;
    while (this.list.some(d => d.name === name)) name = src ? name + 'I' : 'Design ' + (++n);
    const d = {id: uid(), name, ...base, park: null};
    this.list.push(d); this.save(); this.parkAll();
    return d;
  }
  remove(id) {
    if (id === this.s.active || this.list.length < 2) return false;
    this.unpark(id); this.s.list = this.list.filter(d => d.id !== id); this.save();
    return true;
  }
  /** Make `id` the car you drive. The current one is parked at `leave` (a pose), else in a free bay. */
  use(id, leave = null) {
    const next = this.get(id), prev = this.active;
    if (!next || next === prev) return false;
    this.capture();
    prev.park = leave; if (leave) this.place(prev);
    this.unpark(next.id); next.park = null;
    this.s.active = id;
    if (!leave) this.parkAll();                 // the one you left goes to a free bay
    this.applying = true;
    try { this.io.apply(next); } finally { this.applying = false; }
    this.capture();
    return true;
  }
  /** Where the parked ones stand (all of them: on load). */
  spawnParked() { for (const d of this.list) if (d.park && d.id !== this.s.active) this.place(d); this.parkAll(); }
  /** Every design you are not driving stands in a bay (2026-10-04: "the more designs you spawn, it will park at each space"). */
  parkAll() {
    if (!this.io.freeBay) return;
    const taken = (x, z) => [...this.models.values()].some(m => Math.hypot(m.v.object.position.x - x, m.v.object.position.z - z) < 2.2);
    for (const d of this.list) {
      if (d.id === this.s.active || d.park) continue;
      const P = this.io.freeBay(taken); if (!P) break;
      d.park = P; this.place(d);
    }
    this.save();
  }
  place(d) {
    this.unpark(d.id, false);
    const P = d.park, v = this.io.makeCar(d);
    v.object.position.set(P.x, P.y, P.z); v.object.quaternion.fromArray(P.q);
    v.wheels.forEach((w, i) => { w.pivot.position.y = P.wy?.[i] ?? w.y; });
    v.object.userData.noRain = false;
    this.io.scene.add(v.object);
    const yaw = 2 * Math.atan2(P.q[1], P.q[3]), turn = !!P.turn;
    this.io.physics?.setBoxes('design:' + d.id, [{x: P.x, y: P.y + .25, z: P.z, hx: turn ? 2.3 : 1.05, hy: .62, hz: turn ? 2.3 : 2.25, yaw, tag: 'metal'}]);
    this.models.set(d.id, {v, d, yaw});
  }
  unpark(id, clear = true) {
    const m = this.models.get(id);
    if (m) {
      this.io.scene.remove(m.v.object);
      m.v.object.traverse(o => { if (o.isMesh) { o.geometry.dispose(); for (const mt of [o.material].flat()) mt.dispose?.(); } });
      this.io.physics?.remove('design:' + id); this.models.delete(id);
    }
    if (clear) { const d = this.get(id); if (d) { d.park = null; this.save(); } }
  }
  /** The parked car nearest a point (for F), within `r` metres. */
  near(p, r = 3.4) {
    let best = null, bd = r;
    for (const m of this.models.values()) { const o = m.v.object.position, dd = Math.hypot(o.x - p.x, o.z - p.z); if (dd < bd && Math.abs(o.y - p.y) < 2.5) { bd = dd; best = m.d; } }
    return best;
  }
  /** Hidden when far; the one on a turntable turns. */
  update(dt, cam) {
    for (const m of this.models.values()) {
      const o = m.v.object, far = o.position.distanceTo(cam) > 320;
      o.visible = !far;
      if (!far && m.d.park.turn) { m.yaw += dt * .22; o.quaternion.setFromAxisAngle(_Y, m.yaw); }
    }
  }
}
const _Y = new T.Vector3(0, 1, 0);
