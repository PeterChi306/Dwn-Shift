import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

const drive = window.DwnDrive;
const $w = id => document.getElementById(id);
const ui = document.createElement('section');
ui.id = 'world';
ui.innerHTML = `
<canvas id="worldCanvas" aria-label="3D driving world"></canvas>
<div class="world-vignette"></div>
<header class="world-top"><a class="world-brand" href="#">DWN<span>SHIFT</span><small>LOS ANGELES / VOLUME 01</small></a><div class="world-live"><i></i> FREE DRIVE <span id="worldTime">GOLDEN HOUR</span></div><button id="worldMenu">MENU <span>ESC</span></button></header>
<section class="world-location"><div class="world-eyebrow">THE SUNSET RUN <span id="worldChapter">01 / 04</span></div><h1 id="worldDistrict">West Hollywood</h1><p id="worldStreet">Sunset Boulevard · Eastbound</p></section>
<div class="world-toast" id="worldToast" role="status">Loading the California environment…</div>
<aside class="world-nav glass"><div class="world-nav-head"><span>↗ &nbsp; THE SUNSET RUN</span><span id="worldDistance">5.8 KM</span></div><canvas id="worldMap" width="460" height="260" aria-label="Route map and player position"></canvas><div class="world-nav-foot"><i></i><span id="worldNext">Hollywood Hills</span><small>CONNECTED ROUTE</small></div></aside>
<section class="world-dash glass"><div class="world-car"><span id="worldCar">TOURING</span><small id="worldEngine">ENGINE OFF · HOLD I TO START</small></div><div class="world-instruments"><div><strong id="worldSpeed">0</strong><small id="worldUnit">KM/H</small></div><div class="world-gear"><b id="worldGear">P</b><small>GEAR</small></div><div class="world-rpm"><b id="worldRpm">0.0</b><small>RPM × 1000</small></div></div><div class="world-revtrack"><i id="worldRev"></i></div><div class="world-dash-foot"><span id="worldTraction">REAR-WHEEL DRIVE</span><span id="worldFps">— FPS</span></div></section>
<footer class="world-controls"><span><kbd>W</kbd> THROTTLE</span><span><kbd>S</kbd> BRAKE</span><span><kbd>←</kbd><kbd>→</kbd> STEER</span><span><kbd>Q</kbd><kbd>E</kbd> SHIFT</span><button id="worldCamera">CAMERA · CHASE</button><button id="worldNight">NIGHT DRIVE</button></footer>
<dialog id="worldDialog"><div class="world-dialog-top"><div><div class="world-eyebrow">DWNSHIFT / DRIVE OS</div><h2 id="worldDialogTitle">Make the evening yours.</h2></div><button id="worldClose" aria-label="Close menu">✕</button></div><nav class="world-tabs"><button data-tab="drive" class="selected">Drive</button><button data-tab="garage">Garage</button><button data-tab="sound">Car sound</button><button data-tab="settings">Settings</button><button data-tab="map">Region</button></nav><div id="worldPanel"></div></dialog>
<button id="worldReturn" hidden>↗ ENTER 3D WORLD</button>`;
document.body.append(ui);
let renderer, scene, camera, sun, hemi, car, route, length;
let active = false, paused = true, lastTunnel = false, cameraMode = 0, night = false, assist = false;
let lastTime = 0, frames = 0, fpsTime = 0, fps = 0, nearest = 0, travelled = 0;
let steer = 0, heading = 0, x = 0, z = 0, y = 0, lastHud = 0;
let loaded = false, quality = 'balanced';
const keys = new Set(), samples = [], traffic = [], lamps = [], assetGroups = [], localLights = [];
let headlight;
const v3 = (x,y,z) => new THREE.Vector3(x,y,z);
const wrap = (v,n) => ((v%n)+n)%n;
const angle = a => Math.atan2(Math.sin(a),Math.cos(a));
const batches = new Map();
const mats = {};
const dummy = new THREE.Object3D();
let seed = 73;
const rnd = () => { seed=(seed*1664525+1013904223)>>>0;return seed/4294967296; };
const mat = (name,color,roughness=.8,metalness=0,emissive=0) => mats[name] = new THREE.MeshStandardMaterial({color,roughness,metalness,emissive:color,emissiveIntensity:emissive});
function box(p,size,m,rot=0) {
 const g=new THREE.BoxGeometry(...size);dummy.position.copy(p);dummy.rotation.set(0,rot,0);dummy.scale.set(1,1,1);dummy.updateMatrix();g.applyMatrix4(dummy.matrix);
 if(!batches.has(m))batches.set(m,[]);batches.get(m).push(g);
}
function flush() {
 for(const [m,geos] of batches) {
  // Spatially grouped chunks keep distant street detail out of draw calls.
  for(let i=0;i<geos.length;i+=160){const part=geos.slice(i,i+160),g=mergeGeometries(part);const mesh=new THREE.Mesh(g,m);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);part.forEach(g=>g.dispose());}
 }
 batches.clear();
}
function at(t,offset=0,height=0) {
 const p=route.getPointAt(wrap(t,1)),d=route.getTangentAt(wrap(t,1));p.x+=d.z*offset;p.z-=d.x*offset;p.y+=height;return p;
}
const yawAt=t=>{const d=route.getTangentAt(wrap(t,1));return Math.atan2(d.x,d.z);};
function district(t) {
 if(t<.22)return ['West Hollywood','Sunset Boulevard · Design district','Hollywood Hills'];
 if(t<.43)return ['Hollywood Hills','Laurel Crest · Scenic road','Laurel Tunnel'];
 if(t<.54)return ['Laurel Tunnel','East bore · Concrete reflections','Arroyo Freeway'];
 if(t<.8)return ['Arroyo Freeway','Route 110 · Southbound','Sunset Boulevard'];
 return ['West Hollywood','Canyon Drive · Sunset approach','Sunset Boulevard'];
}
function label(text,p,width=10,height=1.5,color='#f6e8c4',background='#18231f') {
 const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,1024,128);ctx.fillStyle=color;ctx.font='500 62px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,66);
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
 const m=new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide});const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),m);mesh.position.copy(p);scene.add(mesh);return mesh;
}
function ribbon(offset,width,m,height=0,start=0,end=1) {
 const pos=[],uv=[],idx=[];const steps=Math.ceil((end-start)*1600);
 for(let i=0;i<=steps;i++) {const t=start+(end-start)*i/steps;for(const edge of [-1,1]){const p=at(t,offset+edge*width/2,height);pos.push(p.x,p.y,p.z);uv.push(edge===-1?0:1,t*length/8);}if(i<steps){const a=i*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();const mesh=new THREE.Mesh(g,m);mesh.receiveShadow=true;scene.add(mesh);return mesh;
}
function noiseTexture() {
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),d=ctx.createImageData(256,256);
 for(let i=0;i<d.data.length;i+=4){const n=90+rnd()*38;d.data[i]=n;d.data[i+1]=n;d.data[i+2]=n;d.data[i+3]=255;}ctx.putImageData(d,0,0);
 const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=4;tex.repeat.set(3,1);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function buildRoad() {
 ribbon(0,28,mats.asphalt);ribbon(-.14,.1,mats.yellow,.025);ribbon(.14,.1,mats.yellow,.025);
 for(const side of [-1,1]) {
  ribbon(side*13,.15,mats.mark,.028);ribbon(side*14.4,.7,mats.concrete,.09);ribbon(side*16.1,2.7,mats.walk,.16);
  for(let d=0;d<length;d+=12)ribbon(side*6.5,.12,mats.mark,.03,d/length,Math.min((d+4)/length,1));
 }
 for(let d=0;d<length;d+=50){const t=d/length;if(t>.425&&t<.545)continue;for(const side of [-1,1]){
  const p=at(t,side*15.3),a=yawAt(t);box(p.clone().add(v3(0,4.5,0)),[.13,9,.13],mats.metal,a);const arm=at(t,side*13.5,8.9);box(arm,[3.8,.12,.16],mats.metal,a);box(at(t,side*11.9,8.85),[.9,.08,.4],mats.light,a);lamps.push(at(t,side*11.9,8.5));
 }}
 // Three deliberate urban crossings, including zebra stripes and traffic signals.
 for(const t of [.038,.105,.175,.9]) {
  const a=yawAt(t),p=at(t,0,.02);box(p,[115,.06,17],mats.asphalt,a);
  for(const shift of [-11,11])for(let j=-11;j<12;j+=2){const pp=at(t+shift/length,j,.04);box(pp,[1,.025,3],mats.mark,a);}
  for(const side of [-1,1]){box(at(t+12/length,side*14,3.4),[.16,6.8,.16],mats.metal,a);box(at(t+12/length,side*13.8,6),[.4,1.2,.4],mats.metal,a);box(at(t+12/length,side*13.8,5.7),[.25,.23,.43],mats.signal,a);}
 }
 // The covered section follows the same elevation and curvature as its road.
 for(let d=length*.43;d<length*.54;d+=8){const t=d/length,a=yawAt(t);box(at(t,0,7.5),[30,1,8.5],mats.tunnel,a);for(const side of [-1,1]){box(at(t,side*14.6,3.6),[1,7.2,8.5],mats.tunnel,a);box(at(t,side*13.95,1.1),[.08,.13,5.7],mats.blue,a);box(at(t,side*7,6.85),[.22,.08,3.7],mats.light,a);}}
 for(const t of [.43,.54]){const a=yawAt(t);box(at(t,0,8),[39,3,5],mats.concrete,a);for(const side of [-1,1])box(at(t,side*17,3.5),[6,7,7],mats.concrete,a);const sign=label('LAUREL TUNNEL  /  LIGHTS ON',at(t-.0005,0,7.9),19,1);sign.rotation.y=a+Math.PI;}
 for(let d=length*.56;d<length*.79;d+=12){const t=d/length,a=yawAt(t);for(const side of [-1,1]){box(at(t,side*14,1),[.5,1,12.2],mats.concrete,a);box(at(t,side*17,-5),[1.8,10,2.5],mats.concrete,a);}}
 for(const t of [.59,.7]){const a=yawAt(t);box(at(t,0,8.5),[30,.25,.25],mats.metal,a);for(const side of [-1,1])box(at(t,side*14,4.3),[.2,8.6,.2],mats.metal,a);const s=label('110 SOUTH   /   SUNSET BLVD   ↗',at(t,0,7.5),18,2.4,'#ecf0da','#164b3c');s.rotation.y=a+Math.PI;}
}
function buildCity() {
 const names=['CAFÉ SOL','MELROSE RECORDS','AUREL / ATELIER','THE PACIFIC','NIGHT / MARKET','FORM & FIELD','SUNDOWN','PALOMA','STUDIO 04','LAUREL SOCIAL'];
 for(let d=15;d<length;d+=32) {
  const t=d/length;if(t>.22&&t<.81)continue;
  if(t>.95)continue;
  for(const side of [-1,1]){
   if(t<.04&&side===1)continue;
   const a=yawAt(t),h=5+rnd()*13,w=23+rnd()*5,off=side*(28+rnd()*4);const material=[mats.stucco,mats.sand,mats.terra,mats.ivory][Math.floor(rnd()*4)];
   box(at(t,off,h/2),[18,h,w],material,a);box(at(t,off,h+.13),[19,.3,w+1],mats.ivory,a);box(at(t,off,h+1),[4,1.7,3],mats.metal,a);
   const front=off-side*9.1;
   for(let floor=2.4;floor<h-1;floor+=3)for(let j=-9;j<=9;j+=4){const p=at(t+j/length,front,floor);box(p,[.15,1.65,2.65],floor<3?mats.glass:mats.window,a);box(at(t+j/length,front-side*.1,floor+.9),[.25,.12,2.9],mats.ivory,a);}
   box(at(t,front-side*.9,3.7),[2,.18,w*.86],mats.awning,a);
   const sign=label(names[Math.floor(rnd()*names.length)],at(t,front-side*.18,4.65),w*.8,1.3,'#f8e6c0',side===1?'#27362f':'#372c29');sign.rotation.y=a-side*Math.PI/2;
   for(const j of [-10,10]){box(at(t+j/length,side*18,.5),[1.5,1,2],mats.concrete,a);box(at(t+j/length,side*18,1.1),[1.7,.6,2.1],mats.leaf,a);}
  }
 }
 // Distant LA skyline, placed beyond the playable street frontage.
 for(let i=0;i<100;i++){const px=200+rnd()*1300,pz=500+rnd()*900,h=12+rnd()*100;box(v3(px,h/2-8,pz),[18+rnd()*25,h,18+rnd()*30],i%2?mats.skyline:mats.stucco);}
 // Foothills with smooth normals, muted chaparral and layered silhouettes.
 for(let i=0;i<36;i++){const g=new THREE.SphereGeometry(1,24,12);const mesh=new THREE.Mesh(g,i%2?mats.hill:mats.hillfar);mesh.position.set(-1300+i*90,-30,1550+rnd()*550);mesh.scale.set(150+rnd()*180,100+rnd()*180,160+rnd()*250);scene.add(mesh);}
 for(let d=length*.23;d<length*.425;d+=40){const t=d/length;for(const side of [-1,1]){const g=new THREE.SphereGeometry(1,12,8);const m=new THREE.Mesh(g,mats.hill);m.position.copy(at(t,side*(45+rnd()*45),-14));m.scale.set(25+rnd()*20,16+rnd()*16,30);scene.add(m);}}
}
// Bake static Blender parts by material, preserving their authored transforms.
function compactAsset(root) {
 const groups=new Map();root.updateMatrixWorld(true);
 root.traverse(o=>{if(o.isMesh){let g=o.geometry.clone().applyMatrix4(o.matrixWorld);if(g.index)g=g.toNonIndexed();for(const key of Object.keys(g.attributes))if(!['position','normal'].includes(key))g.deleteAttribute(key);if(!groups.has(o.material))groups.set(o.material,[]);groups.get(o.material).push(g);}});
 const out=new THREE.Group();for(const [m,gs] of groups){const mesh=new THREE.Mesh(mergeGeometries(gs),m);mesh.castShadow=true;mesh.receiveShadow=true;out.add(mesh);gs.forEach(g=>g.dispose());}return out;
}
async function assets() {
 const loader=new GLTFLoader();
 const [hotel,coupe,palm]=await Promise.all(['aster-hotel','touring-coupe','california-palm'].map(name=>loader.loadAsync(`./assets/world/${name}.glb`)));
 hotel.scene=compactAsset(hotel.scene);coupe.scene=compactAsset(coupe.scene);
 hotel.scene.position.copy(at(.027,31));hotel.scene.rotation.y=yawAt(.027)-Math.PI/2;hotel.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(hotel.scene);
 car=coupe.scene;car.rotation.y=0;car.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(car);
 // Merge palm parts once, then instance each material across the world.
 const palmParts=new Map();palm.scene.updateMatrixWorld(true);palm.scene.traverse(o=>{if(o.isMesh){const g=o.geometry.clone().applyMatrix4(o.matrixWorld);if(!palmParts.has(o.material))palmParts.set(o.material,[]);palmParts.get(o.material).push(g);}});
 const placements=[];
 for(let d=8;d<length;d+=27){const t=d/length;if(t>.43&&t<.8)continue;for(const side of [-1,1])placements.push({p:at(t,side*19.5),s:.85+rnd()*.5,a:rnd()*6.28});}
 for(const [m,gs]of palmParts){m.side=THREE.DoubleSide;const geo=mergeGeometries(gs);gs.forEach(g=>g.dispose());const mesh=new THREE.InstancedMesh(geo,m,placements.length);placements.forEach((p,i)=>{dummy.position.copy(p.p);dummy.rotation.set(0,p.a,0);dummy.scale.setScalar(p.s);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.castShadow=true;scene.add(mesh);assetGroups.push(mesh);}
 // A small traffic pool reuses the Blender mesh and materials.
 for(let i=0;i<14;i++){const obj=coupe.scene.clone(true);scene.add(obj);traffic.push({obj,t:wrap(.055+i*.071,1),speed:12+(i%4)*2,lane:i%3===0?3.5:-9.5,dir:i%3===0?-1:1});}
}
function buildDetail(){
 // Joint lines, utility furniture and occasional sheltered bus stops.
 for(let d=20;d<length*.21;d+=8){const t=d/length,a=yawAt(t);for(const side of [-1,1])box(at(t,side*16.2,.168),[2.7,.012,.027],mats.concrete,a);}
 for(let d=30;d<length*.21;d+=58){const t=d/length,a=yawAt(t);
  box(at(t,17.1,.48),[.9,.95,.6],mats.metal,a);box(at(t+1/length,17.1,.45),[.7,.9,.5],mats.concrete,a);
  box(at(t,-17,.5),[.55,1,.55],mats.yellow,a);box(at(t,-17,.88),[.85,.18,.25],mats.yellow,a);
  for(const side of [-1,1]){box(at(t+5/length,side*17.1,.53),[.65,.12,2.2],mats.awning,a);box(at(t+5/length,side*17.4,.9),[.1,.65,2.2],mats.awning,a);for(const j of [4.3,5.7])box(at(t+j/length,side*17,.26),[.4,.52,.09],mats.metal,a);}
 }
 for(const t of [.065,.145]){const a=yawAt(t);for(const j of [-3,3])box(at(t+j/length,-17,1.7),[.12,3.1,.12],mats.metal,a);box(at(t,-17,3.25),[2,.16,7],mats.awning,a);box(at(t,-18,1.8),[.06,2.7,6.5],mats.glass,a);}
 // Hillside embankments support the elevated road in the landscape.
 for(const side of [-1,1]){const pos=[],idx=[];for(let i=0;i<=200;i++){const t=.215+i/200*.217;for(let j=0;j<4;j++){const p=at(t,side*[17.5,30,65,130][j]);p.y=j===0?p.y-.05:j===1?p.y+4:j===2?p.y-10:-12;pos.push(p.x,p.y,p.z);}if(i<200)for(let j=0;j<3;j++){const a=i*4+j;idx.push(a,a+4,a+1,a+1,a+4,a+5);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();const m=mats.hill.clone();m.side=THREE.DoubleSide;scene.add(new THREE.Mesh(g,m));}
 for(let d=length*.434;d<length*.537;d+=35){const t=d/length,a=yawAt(t);for(const side of [-1,1]){box(at(t,side*14,3.5),[.18,7,.25],mats.metal,a);box(at(t,side*13.9,2),[.12,2.5,1.3],mats.awning,a);box(at(t,side*13.8,3.6),[.15,.25,1.3],mats.signal,a);}}
}
async function init() {
 try {
  renderer=new THREE.WebGLRenderer({canvas:$w('worldCanvas'),antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
  scene=new THREE.Scene();scene.background=new THREE.Color('#afc0c2');scene.fog=new THREE.FogExp2('#b5bdb6',.00105);
  camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.15,3200);
  hemi=new THREE.HemisphereLight('#bedaff','#877158',2.5);scene.add(hemi);
  sun=new THREE.DirectionalLight('#ffe3b2',3.8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-65,right:65,top:65,bottom:-65,near:1,far:250});sun.shadow.bias=-.0004;sun.shadow.normalBias=.04;scene.add(sun,sun.target);
  mat('asphalt','#53565a',.91).map=noiseTexture();mat('mark','#e5dcc4');mat('yellow','#d9a850');mat('concrete','#9f9c8d');mat('walk','#c0b49f');mat('metal','#343d40',.45,.55);mat('light','#ffce8c',.3,0,3.5);mat('blue','#8bbdd2',.5,0,1.6);mat('signal','#73e5a1',.4,0,2);mat('tunnel','#464a49');mat('stucco','#a4937e');mat('sand','#c6aa86');mat('terra','#966f60');mat('ivory','#d5c6ac');mat('glass','#253f43',.15,.65);mat('window','#536e72',.22,.6,.06);mat('awning','#4c5b50');mat('leaf','#4b6344');mat('skyline','#7f8986');mat('hill','#797b58');mat('hillfar','#8c9580');
  const routeResponse=await fetch('./assets/world/route.json');if(!routeResponse.ok)throw new Error('Route data unavailable');const {points}=await routeResponse.json();
  route=new THREE.CatmullRomCurve3(points.map(p=>v3(...p)),true,'catmullrom',.35);route.arcLengthDivisions=5000;length=route.getLength();
  for(let i=0;i<2200;i++)samples.push(route.getPointAt(i/2200));
  const skyGeo=new THREE.SphereGeometry(6500,32,16);
  const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{night:{value:0}},vertexShader:`varying vec3 vWorld;void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 vWorld;uniform float night;void main(){vec3 d=normalize(vWorld);float h=pow(max(d.y,0.),.45);vec3 day=mix(vec3(.78,.77,.66),vec3(.25,.48,.65),h);vec3 dusk=mix(vec3(.13,.17,.23),vec3(.018,.035,.085),h);float sun=pow(max(dot(d,normalize(vec3(-.7,.34,-.45))),0.),1200.);gl_FragColor=vec4(mix(day,dusk,night)+vec3(1.,.75,.35)*sun*(1.-night),1.);}`});
  const sky=new THREE.Mesh(skyGeo,skyMat);sky.name='California sky';scene.add(sky);
  const environment=new THREE.Scene();environment.add(sky.clone());const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(environment,.04).texture;pmrem.dispose();scene.environmentIntensity=.65;
  for(let i=0;i<8;i++){const light=new THREE.PointLight('#ffd099',0,34,2);scene.add(light);localLights.push(light);}
  headlight=new THREE.SpotLight('#e5efff',0,75,.5,.55,1.5);scene.add(headlight,headlight.target);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(14000,14000),mats.hill);ground.rotation.x=-Math.PI/2;ground.position.y=-12;ground.receiveShadow=true;scene.add(ground);
  buildRoad();buildCity();buildDetail();flush();await assets();loaded=true;active=true;document.body.classList.add('world-active');respawn(.018);drive.setTunnel(false);setLighting(drive.state.night);$w('worldToast').textContent='Blender environment ready · Your original drivetrain, now on the road.';setTimeout(()=>$w('worldToast').classList.add('quiet'),5000);openMenu('drive');requestAnimationFrame(render);
 }catch(err){console.error('World initialization failed',err);$w('worldToast').textContent=`3D could not load: ${err.message}. The original simulator is available below.`;active=false;$w('worldReturn').hidden=false;$w('worldReturn').textContent='3D unavailable · Reload to retry';ui.classList.add('world-failed');}
}
function respawn(t=nearest/samples.length) {
 nearest=Math.floor(wrap(t,1)*samples.length);const p=at(t,-3.5);x=p.x;y=p.y;z=p.z;heading=yawAt(t);steer=0;drive.resetMotion();drive.release();camera.position.copy(at(t-10/length,-3.5,4.4));
}
function setLighting(on) {
 night=on;if(!scene)return;scene.getObjectByName('California sky').material.uniforms.night.value=on?1:0;scene.background.set(on?'#111c30':'#afc0c2');scene.fog.color.set(on?'#202c3c':'#b5bdb6');scene.fog.density=on?.0016:.00105;hemi.intensity=on?.65:2.5;sun.intensity=on?.4:3.8;sun.color.set(on?'#91b9ec':'#ffe3b2');renderer.toneMappingExposure=on?1.05:1.15;mats.window.emissive.set(on?'#ebc48d':'#536e72');mats.window.emissiveIntensity=on?.7:.06;$w('worldTime').textContent=on?'AFTER HOURS':'GOLDEN HOUR';$w('worldNight').textContent=on?'GOLDEN HOUR':'NIGHT DRIVE';
}
function step(dt) {
 if(!active||paused||!loaded)return;
 const s=drive.state;let input=(keys.has('ArrowLeft')?1:0)-(keys.has('ArrowRight')?1:0);
 const gp=Array.from(navigator.getGamepads?.()||[]).find(Boolean);if(gp&&Math.abs(gp.axes[0])>.09)input=-gp.axes[0];
 // Bicycle steering is additive; longitudinal speed, tire slip, gears and audio stay in game.js.
 let target=input*.48/(1+Math.abs(s.v)*.045);
 if(assist&&Math.abs(input)<.1){const ahead=at(nearest/samples.length+Math.max(12,Math.abs(s.v)*1.1)/length,-3.5);const desired=Math.atan2(ahead.x-x,ahead.z-z);target=THREE.MathUtils.clamp(angle(desired-heading)*1.5,-.32,.32);}
 steer+=(target-steer)*Math.min(1,dt*7);heading+=s.v/2.75*Math.tan(steer)*dt;x+=Math.sin(heading)*s.v*dt;z+=Math.cos(heading)*s.v*dt;travelled+=Math.abs(s.v)*dt;
 let best=Infinity,idx=nearest;for(let k=-24;k<=24;k++){const i=wrap(nearest+k,samples.length),p=samples[i],dist=(p.x-x)**2+(p.z-z)**2;if(dist<best){best=dist;idx=i;}}nearest=idx;const t=nearest/samples.length,p=samples[nearest],d=route.getTangentAt(t);y=p.y;
 const lateral=(x-p.x)*d.z-(z-p.z)*d.x;
 // Solid road-edge boundary, with speed loss on impact. No invisible teleporting through scenery.
 if(Math.abs(lateral)>13.4){const excess=lateral-Math.sign(lateral)*13.4;x-=d.z*excess;z+=d.x*excess;s.v*=Math.exp(-dt*3);}
 const tunnel=t>=.43&&t<=.54;if(tunnel!==lastTunnel||drive.state.tunnel!==tunnel){lastTunnel=tunnel;drive.setTunnel(tunnel);}
 for(const tr of traffic){tr.t=wrap(tr.t+tr.dir*tr.speed*dt/length,1);const p=at(tr.t,tr.lane);tr.obj.position.copy(p);tr.obj.rotation.y=yawAt(tr.t)+(tr.dir===1?0:Math.PI);if(p.distanceToSquared(v3(x,y,z))<6.5){s.v*=Math.exp(-dt*8);tr.t=wrap(tr.t+tr.dir*4/length,1);}}
}
window.DwnWorld={get active(){return active;},get paused(){return paused;},step,get diagnostics(){return {loaded,active,paused,fps,routeMeters:length,progress:nearest/samples.length,travelled,position:{x,y,z},steer,tunnel:lastTunnel,drawCalls:renderer?.info.render.calls,triangles:renderer?.info.render.triangles,assets:assetGroups.length};}};
function render(now) {
 requestAnimationFrame(render);if(!active)return;const dt=Math.min((now-lastTime)/1000||.016,.05);lastTime=now;
 if(drive.state.night!==night)setLighting(drive.state.night);
 const forward=v3(Math.sin(heading),0,Math.cos(heading)),pos=v3(x,y,z);car.position.copy(pos);car.rotation.y=heading+drive.state.yaw*.12;car.visible=cameraMode===0;
 const behind=cameraMode===0?-8.7:1.1;const height=cameraMode===0?3.7:1.3;const target=pos.clone().addScaledVector(forward,behind).add(v3(0,height,0));camera.position.lerp(target,1-Math.exp(-dt*8));camera.lookAt(pos.clone().addScaledVector(forward,24).add(v3(0,1.1+drive.state.joltRot*.1,0)));camera.fov=58+Math.min(Math.abs(drive.state.v)*.14,10);camera.updateProjectionMatrix();
 sun.position.copy(pos).add(v3(-70,90,-45));sun.target.position.copy(pos);if(lastTunnel){hemi.intensity=.35;sun.intensity=.1;}else{hemi.intensity=night?.65:2.5;sun.intensity=night?.4:3.8;}
 for(let i=0;i<localLights.length;i++){
  const t=wrap((Math.floor(nearest/samples.length*length/22)+(i-4))*22/length,1);const light=localLights[i];light.position.copy(at(t,lastTunnel?(i%2?7:-7):(i%2?12:-12),lastTunnel?6.3:8.3));light.intensity=(lastTunnel?110:night?95:0);
 }
 headlight.position.copy(pos).addScaledVector(forward,2).add(v3(0,.85,0));headlight.target.position.copy(pos).addScaledVector(forward,35);headlight.intensity=night||lastTunnel?65:0;
 renderer.render(scene,camera);frames++;if(now-fpsTime>1000){fps=Math.round(frames*1000/(now-fpsTime));frames=0;fpsTime=now;}
 if(now-lastHud>100){hud();lastHud=now;}
}
function hud(){
 const s=drive.state,c=drive.car,t=nearest/samples.length,area=district(t);$w('worldChapter').textContent=(t<.22||t>=.8?'01':t<.43?'02':t<.54?'03':'04')+' / 04';$w('worldDistrict').textContent=area[0];$w('worldStreet').textContent=area[1];$w('worldNext').textContent=area[2];$w('worldDistance').textContent=((1-t)*length/1000).toFixed(1)+' KM';$w('worldCar').textContent=c.name;$w('worldEngine').textContent=s.engineOn?'ENGINE RUNNING · '+s.mode.toUpperCase():s.cranking?'STARTING…':s.powered?'ELECTRIC DRIVE':'ENGINE OFF · HOLD I TO START';$w('worldSpeed').textContent=Math.round(Math.abs(s.v)*(s.units==='mph'?2.23694:3.6));$w('worldUnit').textContent=s.units==='mph'?'MPH':'KM/H';$w('worldGear').textContent=s.mode==='auto'?(s.autoSel==='D'?s.autoGear:s.autoSel):(s.gear||'N');$w('worldRpm').textContent=(s.rpm/1000).toFixed(1);$w('worldRev').style.width=Math.min(100,s.rpm/c.max*100)+'%';$w('worldFps').textContent=fps+' FPS';$w('worldTraction').textContent=lastTunnel?'TUNNEL ACOUSTICS ACTIVE':assist?'STEERING ASSIST ON':(c.layout||'FREE DRIVE');
 const ctx=$w('worldMap').getContext('2d');ctx.clearRect(0,0,460,260);const map=p=>[(p.x+1150)*.21+12,(p.z+700)*.125+7];ctx.strokeStyle='#536166';ctx.lineWidth=3;ctx.beginPath();samples.forEach((p,i)=>{const [a,b]=map(p);i?ctx.lineTo(a,b):ctx.moveTo(a,b);});ctx.closePath();ctx.stroke();ctx.strokeStyle='#bddec4';ctx.lineWidth=4;ctx.beginPath();for(let i=0;i<=nearest;i++){const[a,b]=map(samples[i]);i?ctx.lineTo(a,b):ctx.moveTo(a,b);}ctx.stroke();const[a,b]=map(v3(x,y,z));ctx.fillStyle='#efffdc';ctx.shadowColor='#d6eab3';ctx.shadowBlur=15;ctx.beginPath();ctx.arc(a,b,5,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
}
function pause(on){paused=on;keys.clear();drive.release();drive.pauseAudio(on);}
function openMenu(tab='drive'){pause(true);$w('worldDialog').showModal();panel(tab);}
function closeMenu(){if(!loaded)return;$w('worldDialog').close();pause(false);}
function panel(tab){
 document.querySelectorAll('.world-tabs button').forEach(b=>b.classList.toggle('selected',b.dataset.tab===tab));const p=$w('worldPanel');
 if(tab==='drive'){
  p.innerHTML=`<div class="world-intro"><span class="world-eyebrow">A CALIFORNIA EVENING, WITHOUT AN END.</span><h3>Take the long way home.</h3><p>Neon storefronts. Quiet hills. The sound of concrete.<br>A ${(length/1000).toFixed(1)} km connected drive through a fictional Los Angeles.</p><div class="world-route"><span>West Hollywood</span><i>→</i><span>The Hills</span><i>→</i><span>Laurel Tunnel</span><i>→</i><span>Freeway</span></div><button class="world-primary" id="worldResume">${travelled?'CONTINUE DRIVE':'ENTER THE DRIVE'} &nbsp; ↗</button><p class="world-tip">Hold <b>I</b> to start (some cars need a first press for ignition). Select <b>D</b> below, then use <b>W / S</b> and <b>← / →</b>.</p><div class="world-selectors"><label>Transmission<select id="worldTransmission"><option value="auto">Automatic</option><option value="manual">Sequential manual</option><option value="clutch">Manual + clutch</option></select></label><label>Selector<select id="worldSelector"><option>P</option><option>R</option><option>N</option><option>D</option></select></label><button id="worldLegacy">ORIGINAL SIMULATOR ↗</button></div></div>`;
  $w('worldResume').onclick=closeMenu;$w('worldTransmission').value=drive.state.mode;$w('worldTransmission').onchange=e=>{drive.setMode(e.target.value);panel('drive');};$w('worldSelector').value=drive.state.autoSel;$w('worldSelector').onchange=e=>drive.select(e.target.value);$w('worldSelector').disabled=drive.state.mode!=='auto';$w('worldLegacy').onclick=()=>{drive.setTunnel(false);$w('worldDialog').close();active=false;pause(false);document.body.classList.remove('world-active');$w('worldReturn').hidden=false;};
 }else if(tab==='garage'){
  p.innerHTML='<p class="world-tip">Your existing vehicles and their original engines. The 3D coupe is a shared body for this first slice.</p><div class="world-garage"></div>';
  for(const c of drive.cars){const b=document.createElement('button');b.textContent=c.name;b.classList.toggle('chosen',c.id===drive.car.id);b.onclick=()=>{drive.selectCar(c.id);respawn();panel('garage');};p.querySelector('.world-garage').append(b);}
 }else if(tab==='sound'){
  const s=drive.sound();p.innerHTML=`<h3 id="worldSoundCar"></h3><p class="world-tip">Saved separately for each car using the original workshop. Resume driving to audition changes.</p><div class="world-settings" id="worldSound"></div><button id="worldWorkshop">OPEN FULL SOUND WORKSHOP ↗</button>`;
  $w('worldSoundCar').textContent=drive.car.name;
  for(const [key,title,id] of [['vol','Engine level','wsVol'],['pitch','Engine pitch','wsPitch'],['tone','Exhaust tone','wsTone']]){const src=document.getElementById(id),label=document.createElement('label');label.textContent=title;const range=document.createElement('input');range.type='range';range.min=src.min;range.max=src.max;range.step=src.step;range.value=s[key];const out=document.createElement('output');out.textContent=s[key];range.oninput=()=>{drive.tune(key,+range.value);out.textContent=range.value;};label.append(range,out);$w('worldSound').append(label);}
  $w('worldWorkshop').onclick=()=>{$w('worldDialog').close();pause(true);drive.openWorkshop();};
 }else if(tab==='settings'){
  p.innerHTML=`<div class="world-settings"><label>Lighting<select id="worldLighting"><option value="day">Golden hour</option><option value="night">After hours</option></select></label><label>Rendering<select id="worldQuality"><option value="balanced">Balanced · 1.5× resolution</option><option value="high">High · 2× resolution</option><option value="low">Performance · 1× resolution</option></select></label><label>Steering assistance<input id="worldAssist" type="checkbox" ${assist?'checked':''}></label><p class="world-tip">Assistance follows the route. Pedals and transmission remain yours; steering input overrides it.</p><button id="worldReset">RETURN TO ROAD</button></div>`;
  $w('worldLighting').value=night?'night':'day';$w('worldLighting').onchange=e=>drive.setNight(e.target.value==='night');$w('worldQuality').value=quality;$w('worldQuality').onchange=e=>{quality=e.target.value;renderer.setPixelRatio(Math.min(devicePixelRatio,quality==='high'?2:quality==='low'?1:1.5));renderer.shadowMap.enabled=quality!=='low';};$w('worldAssist').onchange=e=>assist=e.target.checked;$w('worldReset').onclick=()=>{respawn();closeMenu();};
 }else{
  p.innerHTML=`<h3>One region. Many kinds of drive.</h3><div class="world-region"><div><b>01 / PLAYABLE NOW</b><h4>The Sunset Run</h4><p>West Hollywood → Hollywood Hills → Laurel Tunnel → Arroyo Freeway</p><span>${(length/1000).toFixed(1)} KM · ABOUT ${Math.round(length/1000/80*60)} MIN AT 80 KM/H</span></div><div><b>02 / PLANNED EXPANSION</b><h4>Pasadena & San Marino</h4><p>Historic avenues, garden estates, tree-lined streets and the high school.</p></div><div><b>03 / PLANNED EXPANSION</b><h4>Beverly Hills</h4><p>Luxury storefronts, landscaped boulevards and hillside residences.</p></div></div>`;
 }
}
$w('worldMenu').onclick=()=>openMenu();$w('worldClose').onclick=closeMenu;$w('worldDialog').addEventListener('cancel',e=>{e.preventDefault();closeMenu();});document.querySelectorAll('.world-tabs button').forEach(b=>b.onclick=()=>panel(b.dataset.tab));$w('worldNight').onclick=()=>drive.setNight(!night);$w('worldCamera').onclick=()=>{cameraMode=1-cameraMode;$w('worldCamera').textContent='CAMERA · '+(cameraMode?'BONNET':'CHASE');};$w('worldReturn').onclick=()=>{if(!loaded)return;active=true;document.body.classList.add('world-active');$w('worldReturn').hidden=true;openMenu();};
window.addEventListener('keydown',e=>{
 if(!active||e.target.matches('input,select,textarea'))return;
 if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(document.getElementById('workshop').classList.contains('open')){drive.closeWorkshop();pause(false);return;}if($w('worldDialog').open)closeMenu();else openMenu();return;}
 if(paused){e.stopImmediatePropagation();return;}
 if(e.code==='ArrowLeft'||e.code==='ArrowRight'){keys.add(e.code);e.preventDefault();e.stopImmediatePropagation();}
 if(e.code==='KeyT'){e.preventDefault();e.stopImmediatePropagation();} // Geometry owns tunnel state in 3D.
},true);
window.addEventListener('keyup',e=>{keys.delete(e.code);if(active&&(e.code==='ArrowLeft'||e.code==='ArrowRight')){e.preventDefault();e.stopImmediatePropagation();}},true);
window.addEventListener('blur',()=>{if(active&&loaded&&!$w('worldDialog').open)openMenu();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active&&loaded&&!$w('worldDialog').open)openMenu();});
new MutationObserver(()=>{if(active&&!$w('worldDialog').open&&!document.getElementById('workshop').classList.contains('open'))pause(false);}).observe(document.getElementById('workshop'),{attributes:true,attributeFilter:['class']});
window.addEventListener('resize',()=>{if(!renderer)return;renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
if(new URLSearchParams(location.search).has('worldDebug'))window.DwnWorldDebug={checkpoint:respawn,menu:openMenu};
init();
