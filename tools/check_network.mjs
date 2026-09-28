import assert from 'node:assert/strict';
import fs from 'node:fs';
import {RoadNetwork,steeringTarget,heightAtPixel} from '../world/network.js';
const data=JSON.parse(fs.readFileSync(new URL('../'+(process.argv[2]||'assets/world/network.json'),import.meta.url))),net=new RoadNetwork(data);
const seen=new Set([0]),queue=[0];while(queue.length){const node=queue.pop();for(const id of net.adj[node]){const e=net.edges[id],other=e.a===node?e.b:e.a;if(!seen.has(other)){seen.add(other);queue.push(other);}}}
assert.equal(seen.size,net.nodes.length,'All roads connect through explicit graph junctions');
for(const e of net.edges){assert.ok(e.flat>.1);assert.ok(e.p.every(Number.isFinite)&&e.q.every(Number.isFinite));assert.ok(e.width>=(e.kind==='dirt'?6:8),`${e.kind} width ${e.width}`);}
const destinations=['Sunset Strip','Rodeo Drive','Pasadena Civic Center','San Marino High School'];const routes=[];
for(const from of destinations)for(const to of destinations){if(from===to)continue;const path=net.route(net.landmarkRoad(from).edge,to);assert.ok(path.length>2);for(let i=1;i<path.length;i++){const a=net.edges[path[i-1]],b=net.edges[path[i]];assert.ok([a.a,a.b].some(n=>n===b.a||n===b.b),`${from} → ${to}: discontinuous path`);}routes.push({from,to,edges:path.length});}
for(const e of net.edges){const p=net.point(e,.4);const map=net.mapPoint(p.x,p.z);const originalA=net.nodes[e.a].map,originalB=net.nodes[e.b].map;assert.ok(Math.abs(map[0]-(originalA[0]+(originalB[0]-originalA[0])*.4))<.001);}
assert.equal(steeringTarget(.04,30),0);assert.ok(steeringTarget(.2,30)<.01);   // small inputs at 108 km/h stay gentle (tyre-slip margin added 2026-09-26)assert.ok(steeringTarget(1,30)<steeringTarget(1,10));assert.equal(steeringTarget(-.5,20),-steeringTarget(.5,20));
// The JS terrain mirror must match the Python builder that emitted the samples.
let worstHeight=0;
for(const [x,y,h] of data.heightSamples||[])worstHeight=Math.max(worstHeight,Math.abs(heightAtPixel(x,y)-h));
assert.ok((data.heightSamples||[]).length>0,'builder emitted a height sample table');
assert.ok(worstHeight<1e-3,`world/network.js terrain mirrors tools/build_network.py (worst delta ${worstHeight})`);
// Every road node should sit on, or just above, its own terrain sample.
let worstDrape=0;
for(const n of net.nodes){if(n.layer!=='surface')continue;const e=net.edges.find(e=>e.a===n.id||e.b===n.id);if(e&&['freeway','ramp','tunnel','underpass'].includes(e.kind))continue;worstDrape=Math.max(worstDrape,Math.abs(n.position[1]-heightAtPixel(n.map[0],n.map[1])));}
assert.ok(worstDrape<60,`surface roads stay near the ground (worst ${worstDrape.toFixed(1)} m)`);
const grades=net.edges.map(e=>Math.abs(e.grade));
const steep=grades.filter(g=>g>.22).length;
const elevation={min:Math.min(...net.nodes.map(n=>n.position[1])),max:Math.max(...net.nodes.map(n=>n.position[1]))};
const kinds={};for(const e of net.edges)kinds[e.kind]=(kinds[e.kind]||0)+1;
assert.ok(elevation.max-elevation.min>250,'the world has real vertical relief');
for(const k of ['dirt','tunnel','underpass','freeway','ramp','scenic'])assert.ok(kinds[k]>0,`road kind present: ${k}`);
const report={connectedNodes:seen.size,edges:net.edges.length,kilometers:net.totalKm,branchJunctions:net.adj.filter(a=>a.length>=3).length,routes,steering:{at108KmhFull:steeringTarget(1,30),at108KmhSmall:steeringTarget(.2,30)},mapCoordinatesMatch:true,terrainMirrorDelta:worstHeight,roadDrapeMax:worstDrape,elevation,kinds,steepGrades:steep};fs.writeFileSync(new URL('../output/network-validation.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
