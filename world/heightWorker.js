/* Ground heights off the main thread (2026-09-27). Seating ~600k plants on the
 * shaped ground is ~9 s of Ground.height calls; a few of these workers do it
 * in parallel while the page plans buildings. Same roads.json, same Ground,
 * so the heights are exactly the page's. */
import {RoadNetwork} from './network.js';
import {RoadModel} from './roads.js';
import {Ground} from './ground.js';

let ground = null;
const queue = [];
self.onmessage = async ({data}) => {
  if (data.type === 'init') {
    ground = new Ground(new RoadModel(new RoadNetwork(await (await fetch(data.url, {cache: 'no-store'})).json())));
    for (const q of queue.splice(0)) handle(q);
    return;
  }
  if (!ground) { queue.push(data); return; }
  handle(data);
};
function handle({id, xz, pads}) {
  ground.pads = pads || null;
  const out = new Float32Array(xz.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = ground.height(xz[i * 2], xz[i * 2 + 1]);
  self.postMessage({id, heights: out}, [out.buffer]);
}
