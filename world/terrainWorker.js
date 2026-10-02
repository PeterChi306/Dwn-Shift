/* Builds terrain tiles off the main thread, so crossing a tile boundary never
 * stalls a frame. It rebuilds the same road model and ground as the page
 * (all plain JS), from the same roads.json, so its tiles match exactly.
 */
import {RoadNetwork} from './network.js';
import {RoadModel} from './roads.js';
import {Ground} from './ground.js';
import {tileArrays, farBands} from './terrainCore.js';

let ground = null;
const queue = [];

let pads = null;
self.onmessage = async ({data}) => {
  if (data.type === 'pads') { pads = data.pads; if (ground) ground.pads = pads; return; }
  if (data.type === 'init') {
    const net = new RoadNetwork(await (await fetch(data.url, {cache: 'no-store'})).json());
    ground = new Ground(new RoadModel(net));
    if (pads) ground.pads = pads;
    self.postMessage({type: 'ready'});
    for (const q of queue.splice(0)) handle(q);
    return;
  }
  if (!ground) { queue.push(data); return; }
  handle(data);
};

function handle(data) {
  if (data.type === 'tile') {
    const a = tileArrays(ground, data.tx, data.tz, data.lod);
    self.postMessage({type: 'tile', key: data.key, lod: data.lod, arrays: a},
      [a.pos.buffer, a.nor.buffer, a.col.buffer, a.wild.buffer, a.index.buffer, a.solid.buffer, a.vertices.buffer, ...(a.grass ? [a.grass.buffer] : [])]);
  } else if (data.type === 'far') {
    const bands = farBands(ground), transfer = [];
    for (const a of bands) transfer.push(a.pos.buffer, a.nor.buffer, a.col.buffer, a.wild.buffer, a.index.buffer);
    self.postMessage({type: 'far', bands}, transfer);
  }
}
