/* The player car: one of the models in carModels.js, as a body group plus four
 * wheel pivots, so the wheels can spin, steer and ride the suspension. */
import * as T from 'three';
import {buildModel} from './carModels.js';

/** Player car: body, cabin and wheel pivots at the wheel centres (chassis space). */
export function makePlayerCar({model = 'aurora', paint = null, ambient = null} = {}) {
  const body = buildModel(model, {paint, ambient});
  const object = new T.Group();
  object.add(body.group);
  for (const w of body.wheels) object.add(w.pivot);
  return {object, wheels: body.wheels, body};
}
