/** Road geometry, routing and the MAP share these positions. Units: metres, Y up. */
import {coastal} from './coast.js';
export const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
export const angleDelta = a => Math.atan2(Math.sin(a),Math.cos(a));
export function steeringTarget(input,speed,sensitivity=1){
  const dead=.04, magnitude=Math.abs(input);
  // A gentler exponent keeps small and short inputs meaningful; 1.65 made the
  // first third of the stick travel do almost nothing, which read as vague.
  const u=magnitude<=dead?0:Math.sign(input)*Math.pow((magnitude-dead)/(1-dead),1.3);
  // Cap lateral acceleration rather than allowing the old speed-proportional yaw.
  // ~1.1 g of lateral demand at speed (was ~0.84 g, which read as understeer),
  // full 0.58 rad lock when parking.
  // Plus a hair for the tyres' own slip: front and rear slip angles nearly
  // cancel on a balanced car, so more lock than this only asks for a slide.
  const limit=Math.min(.58,Math.atan(11*2.82/(speed*speed+6))+.008);
  return u*limit*sensitivity;
}

/* ------------------------------------------------------------------ terrain --
 * This mirrors `height()` in tools/build_network.py exactly. The builder emits a
 * `heightSamples` table and tools/check_network.mjs asserts the two agree, so a
 * change to one side that is not mirrored fails the check rather than silently
 * floating the roads above the ground.
 */
const CRESTS=[
  [[[118,398],[196,332],[278,268],[360,234],[452,242],[521,216],[600,206],[681,186],[760,170],[828,192],[868,252]],248,94],
  [[[352,168],[438,132],[542,122],[648,146],[712,170]],208,78],
  [[[1108,52],[1232,30],[1356,48],[1468,84],[1560,122]],344,126],
  [[[852,398],[898,442],[946,412]],58,54],
  [[[1196,688],[1292,702],[1378,678]],64,60],
  [[[352,792],[432,806],[500,790]],50,50],
];
const MOUNT_LEE=[648,178];
const fract=v=>v-Math.floor(v);
const hash2=(a,b)=>fract(Math.sin(a*127.1+b*311.7)*43758.5453);
function vnoise(x,y){
  const ix=Math.floor(x),iy=Math.floor(y);
  let fx=x-ix,fy=y-iy;
  fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
  const n00=hash2(ix,iy),n10=hash2(ix+1,iy),n01=hash2(ix,iy+1),n11=hash2(ix+1,iy+1);
  const a=n00+(n10-n00)*fx;
  return a+((n01+(n11-n01)*fx)-a)*fy;
}
function crestDistance(x,y,points){
  let best=1e18;
  for(let i=0;i<points.length-1;i++){
    const ax=points[i][0],ay=points[i][1],dx=points[i+1][0]-ax,dy=points[i+1][1]-ay;
    const span=dx*dx+dy*dy;
    const t=span?clamp(((x-ax)*dx+(y-ay)*dy)/span,0,1):0;
    const qx=ax+t*dx,qy=ay+t*dy;
    best=Math.min(best,(x-qx)**2+(y-qy)**2);
  }
  return Math.sqrt(best);
}
/** Terrain height in metres for a reference-image pixel coordinate.
 *  Mirrors height() in tools/terrain.py — change one, change both. */
export function heightAtPixel(x,y){
  // Flat basin draining south-west, plus one long shallow swell. The old pair of
  // short-wavelength sines rolled the plain by ±8.5 m; the basin reads as flat.
  let h=6+.030*x+.016*(1024-y);
  h+=1.6*Math.sin(x*.0061+.7)*Math.cos(y*.0047-.4);
  let relief=0;
  for(const [points,amp,width] of CRESTS){
    const d=crestDistance(x,y,points);
    relief+=amp*Math.exp(-((d/width)**2));
  }
  const d=Math.hypot(x-MOUNT_LEE[0],y-MOUNT_LEE[1]);
  relief+=76*Math.exp(-((d/46)**2));
  h+=relief;
  const bite=Math.min(1,relief/70);
  if(bite>0){
    let detail=(vnoise(x/34,y/34)-.5)*2;
    detail+=(vnoise(x/13,y/13)-.5)*.9;
    h+=detail*15*bite;
  }
  return h;
}
/** World-space convenience wrapper. Origin is reference pixel (768, 512). */
export function terrainHeight(x,z){return heightAtPixel(x/10+768,z/10+512);}

/* ------------------------------------------------------------- hill detail --
 * terrainHeight is the map's broad landform (and must mirror tools/terrain.py).
 * Real hills are not smooth mounds: the Hollywood Hills are sharp ridges cut by
 * canyons. naturalHeight adds ridged, domain-warped detail, only where the
 * ground stands above the basin, so the flat city stays flat. JS-only: the
 * regrade (tools/clean_roads.mjs), the road model and the ground all use it.
 */
const lhash=(ix,iy)=>{let n=Math.imul(ix,374761393)+Math.imul(iy,668265263)|0;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;};
function lnoise(x,y){
  const ix=Math.floor(x),iy=Math.floor(y);let fx=x-ix,fy=y-iy;
  fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
  const a=lhash(ix,iy),b=lhash(ix+1,iy),c=lhash(ix,iy+1),d=lhash(ix+1,iy+1);
  return a+(b-a)*fx+((c+(d-c)*fx)-(a+(b-a)*fx))*fy;
}
const RIDGE=[[560,30],[250,15],[115,7],[52,2.6]];
export function hillDetail(x,z){
  const px=x/10+768,py=z/10+512;
  const basin=6+.030*px+.016*(1024-py);
  const m=clamp((heightAtPixel(px,py)-basin-12)/70,0,1);
  if(m<=0)return 0;
  // Warp so ridges wander like real spurs instead of running on a lattice.
  const wx=x+(lnoise(x/700,z/700)-.5)*420,wz=z+(lnoise(x/700+31,z/700+17)-.5)*420;
  let h=0;
  for(const [L,A] of RIDGE){const r=1-Math.abs(lnoise(wx/L,wz/L)*2-1);h+=(r*r-.36)*A;}
  return h*m*m*(3-2*m);
}
/** The ground before any road touches it: landform plus hill detail, then the
 *  coast (world/coast.js: the south basin eases down to a beach and the sea). */
export function baseNatural(x,z){return terrainHeight(x,z)+hillDetail(x,z);}
export function naturalHeight(x,z){return coastal(x,z,terrainHeight(x,z)+hillDetail(x,z));}

/** Minimal binary heap; the graph is now large enough that a linear scan hurts. */
class Heap{
  constructor(){this.a=[];}
  get size(){return this.a.length;}
  push(node,cost){const a=this.a;a.push({node,cost});let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p].cost<=a[i].cost)break;[a[p],a[i]]=[a[i],a[p]];i=p;}}
  pop(){const a=this.a,top=a[0],last=a.pop();if(a.length){a[0]=last;let i=0;for(;;){const l=i*2+1,r=l+1;let s=i;if(l<a.length&&a[l].cost<a[s].cost)s=l;if(r<a.length&&a[r].cost<a[s].cost)s=r;if(s===i)break;[a[s],a[i]]=[a[i],a[s]];i=s;}}return top;}
}

export class RoadNetwork {
  constructor(data){
    this.data=data;this.nodes=data.nodes;this.edges=data.edges;this.grid=new Map();this.adj=this.nodes.map(()=>[]);
    for(const e of this.edges){
      e.p=this.nodes[e.a].position;e.q=this.nodes[e.b].position;
      e.dx=e.q[0]-e.p[0];e.dz=e.q[2]-e.p[2];e.flat=Math.hypot(e.dx,e.dz);e.length=Math.hypot(e.flat,e.q[1]-e.p[1]);e.heading=Math.atan2(e.dx,e.dz);
      e.grade=e.flat>.01?(e.q[1]-e.p[1])/e.flat:0;
      this.adj[e.a].push(e.id);this.adj[e.b].push(e.id);
      const x0=Math.floor(Math.min(e.p[0],e.q[0])/160),x1=Math.floor(Math.max(e.p[0],e.q[0])/160);
      const z0=Math.floor(Math.min(e.p[2],e.q[2])/160),z1=Math.floor(Math.max(e.p[2],e.q[2])/160);
      for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){const key=`${x},${z}`;if(!this.grid.has(key))this.grid.set(key,[]);this.grid.get(key).push(e.id);}
    }
    this.totalKm=this.edges.reduce((sum,e)=>sum+e.length,0)/1000;
    this.buildChains();
  }
  /** Ordered edge runs per traced road, so scenery can walk a street continuously
   *  instead of restarting its spacing at every intersection-split edge. */
  buildChains(){
    const byRoad=new Map();
    for(const e of this.edges){if(!byRoad.has(e.road))byRoad.set(e.road,[]);byRoad.get(e.road).push(e);}
    this.chains=[];
    for(const [road,list] of byRoad){
      // Edges were emitted in order along the road; split wherever they stop meeting.
      let run=[list[0]];
      for(let i=1;i<list.length;i++){
        const prev=run[run.length-1],e=list[i];
        if(prev.b===e.a||prev.b===e.b||prev.a===e.a||prev.a===e.b)run.push(e);
        else{this.chains.push({road,edges:run});run=[e];}
      }
      this.chains.push({road,edges:run});
    }
    for(const chain of this.chains){
      let total=0;
      chain.starts=chain.edges.map(e=>{const s=total;total+=e.length;return s;});
      chain.length=total;
      const first=chain.edges[0];
      chain.kind=first.kind;chain.name=first.name;chain.width=first.width;
    }
  }
  nearby(x,z,radius=1){const found=new Set(),gx=Math.floor(x/160),gz=Math.floor(z/160);for(let a=-radius;a<=radius;a++)for(let b=-radius;b<=radius;b++)for(const id of this.grid.get(`${gx+a},${gz+b}`)||[])found.add(id);return [...found].map(id=>this.edges[id]);}
  project(e,x,z){const t=clamp(((x-e.p[0])*e.dx+(z-e.p[2])*e.dz)/(e.flat*e.flat),0,1);const p=this.point(e,t);return {edge:e,t,p,distance:Math.hypot(x-p.x,z-p.z),lateral:((x-p.x)*e.dz-(z-p.z)*e.dx)/e.flat};}
  nearest(x,z,y=null){let best=null,score=Infinity;for(const e of this.nearby(x,z,2)){const r=this.project(e,x,z);const penalty=y===null?0:Math.max(0,Math.abs(r.p.y-y)-2)*4;const value=r.distance+penalty;if(value<score){score=value;best=r;}}return best;}
  point(e,t,offset=0){return {x:e.p[0]+e.dx*t+e.dz/e.flat*offset,y:e.p[1]+(e.q[1]-e.p[1])*t,z:e.p[2]+e.dz*t-e.dx/e.flat*offset};}
  /** Position at an arc-length distance along a chain, with a lateral offset. */
  chainPoint(chain,distance,offset=0){
    let i=chain.edges.length-1;
    while(i>0&&chain.starts[i]>distance)i--;
    const e=chain.edges[i];
    const t=clamp((distance-chain.starts[i])/e.length,0,1);
    // Edges may be stored reversed relative to travel direction.
    const forward=i===0?(chain.edges.length>1?(e.b===chain.edges[1].a||e.b===chain.edges[1].b):true):(e.a===chain.edges[i-1].a||e.a===chain.edges[i-1].b);
    const u=forward?t:1-t;
    const p=this.point(e,u,forward?offset:-offset);
    return {p,edge:e,t:u,heading:forward?e.heading:e.heading+Math.PI};
  }
  mapPoint(x,z){return [x/10+768,z/10+512];}
  landmark(name){return this.data.landmarks.find(l=>l.name===name)||this.data.landmarks[0];}
  landmarkRoad(name){const l=this.landmark(name);return this.nearest((l.map[0]-768)*10,(l.map[1]-512)*10);}
  route(startEdge,destination){
    const end=this.landmarkRoad(destination).edge;
    const distance=new Float64Array(this.nodes.length).fill(Infinity),previous=new Array(this.nodes.length),done=new Uint8Array(this.nodes.length);
    const heap=new Heap();
    for(const n of [startEdge.a,startEdge.b]){distance[n]=0;heap.push(n,0);}
    let target=-1;
    while(heap.size){
      const {node:cur,cost}=heap.pop();
      if(done[cur])continue;
      done[cur]=1;
      if(cur===end.a||cur===end.b){target=cur;break;}
      for(const id of this.adj[cur]){
        const e=this.edges[id],next=e.a===cur?e.b:e.a;
        // Freeways are preferred; dirt is a last resort.
        const cost2=cost+e.length/(e.kind==='freeway'?1.4:e.kind==='dirt'?.45:1);
        if(cost2<distance[next]){distance[next]=cost2;previous[next]={node:cur,edge:id};heap.push(next,cost2);}
      }
    }
    const path=[];while(target>=0&&previous[target]){path.unshift(previous[target].edge);target=previous[target].node;}return [startEdge.id,...path,end.id].filter((id,i,a)=>i===0||id!==a[i-1]);
  }
}
