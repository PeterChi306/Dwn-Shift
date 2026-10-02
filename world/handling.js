/* The driver's hands (2026-10-01): keys or a stick in, a steering angle out.
 *
 * The angle is relative to where the car is GOING, not where it points: the
 * input sets how hard the front tyres bite (full input = their peak slip
 * angle), and with the hands off the wheels line up with the direction of
 * travel. So the same input means the same grip at 60 or 260 km/h (the old
 * speed-scaled lock gave ~1.5 degrees at 150 and the fronts never reached
 * their peak), and when the rear steps out the wheels are already pointing
 * into the slide — the countersteer a driver's hands and the caster give a
 * real car, and the thing that makes a drift holdable on a keyboard.
 *
 * At parking speeds it is plain geometric steering with the full rack.
 */
import {clamp} from './network.js';

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class Steering {
  constructor() {
    this.key = 0;              // the keyboard's ramped input, -1..1
    this.angle = 0;            // the front wheels, rad (left +)
    this.sensitivity = 1;      // the settings slider
    this.counter = 1;          // countersteer assist: how fully the wheels follow the slide, 0..1
    this.lock = .6;            // the rack's end stop, rad
  }
  reset() { this.key = 0; this.angle = 0; }
  /**
   * raw: keyboard -1/0/1 (left +); pad: a stick value (left +) or null.
   * speed: the car's forward speed (m/s, negative reversing); car: the vehicle.Car.
   */
  update(dt, {raw = 0, pad = null, speed = 0, car}) {
    const v = Math.abs(speed);
    let input;
    if (pad !== null) {
      const m = Math.abs(pad), dead = .06;
      input = m <= dead ? 0 : Math.sign(pad) * Math.pow((m - dead) / (1 - dead), 1.4);
      this.key = input;
    } else {
      // A key press winds on quickly when slow and gently at speed, so a tap
      // on the motorway is a lane change, not a swerve; letting go (or the
      // other key) unwinds fast.
      const opposing = raw === 0 || Math.sign(raw) !== Math.sign(this.key);
      const rate = opposing ? 9 : 2.6 + 6 / (1 + v / 14);
      this.key += clamp(raw - this.key, -dt * rate, dt * rate);
      input = Math.sign(this.key) * Math.pow(Math.abs(this.key), 1.2);
    }
    input = clamp(input * this.sensitivity, -1, 1);
    car.intent = input;
    // Low speed: the whole rack. Rolling: the input is a slip angle on top
    // of the direction of travel.
    const hi = speed > 0 ? smooth(4, 14, v) : 0;
    const bite = car.peakF * 1.08;
    const limit = this.lock * (1 - hi) + bite * hi;
    const follow = hi * this.counter * clamp(car.frontCourse || 0, -this.lock, this.lock);
    const target = clamp(follow + input * limit, -this.lock, this.lock);
    // A rack has a finite speed; quicker when catching a slide.
    const rate = Math.abs(car.beta || 0) > .12 ? 6 : 3.4;
    this.angle += clamp((target - this.angle) * (1 - Math.exp(-dt * 20)), -dt * rate, dt * rate);
    return this.angle;
  }
}
