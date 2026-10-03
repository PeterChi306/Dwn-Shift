import * as T from 'three';
import {pass,Fn,uv,uniform,smoothstep,length} from 'three/tsl';
import {bloom} from 'three/addons/tsl/display/BloomNode.js';
import {RoadNetwork,steeringTarget,clamp,angleDelta} from './world/network.js';
import {RoadModel} from './world/roads.js';
import {Ground} from './world/ground.js';
import {makeMaterials} from './world/materials.js';
import {Stream} from './world/stream.js';
import {Sky} from './world/sky.js';
import {createPhysics,Car,HANDLING} from './world/vehicle.js';import {Steering} from './world/handling.js';import {TyreAudio} from './world/tyreAudio.js';
import {makePlayerCar} from './world/cars.js';import {preloadCars} from './world/carModels.js';
import {PAINTS,AMBIENTS} from './world/carBody.js';
import {MODELS,modelById} from './world/carModels.js';
import {planWorkshop,WORKSHOP} from './world/workshop.js';import {WorkshopUI} from './world/workshopUi.js';import {applyBuild,sanitizeBuild,updateGlow} from './world/carParts.js';import {paintNight} from './world/carBody.js';import {Online} from './world/online.js';
import {Autopilot} from './world/autopilot.js';
import {Buildings} from './world/buildings.js';
import {makeBuildingMaterials} from './world/buildingMaterials.js';
import {Plants} from './world/plants.js';import {Grass} from './world/grass.js';
import {HeightPool} from './world/heightPool.js';
import {buildLamps,lampSpots} from './world/lamps.js';
import {buildFreewaySigns} from './world/freewaySigns.js';
import {buildTunnels,buildGalleries,inGallery} from './world/tunnels.js';
import {buildSea} from './world/sea.js';
import {Places} from './world/places.js';
import {planVenues,RaceTiming,venueOutlines} from './world/venues.js';import {planRestStop} from './world/reststop.js';
import {planHomes,HOMES,homePose} from './world/homes.js';
import {Walker} from './world/walker.js';
import {Soundscape} from './world/ambience.js';
import {Life} from './world/life.js';
import {CarFx} from './world/carFx.js';
import {SEA_Y} from './world/coast.js';
import {buildDisplayCars} from './world/displayCars.js';
import {Traffic} from './world/traffic.js';
import {Parked} from './world/parked.js';
import {Atlas,CLASSES} from './world/atlas.js';
import {Navigator} from './world/nav.js';
import {CITY} from './world/buildings.js';
const drive=window.DwnDrive,$=id=>document.getElementById(id),V=(x,y,z)=>new T.Vector3(x,y,z);
// One car (2026-10-01): the Aurora, customised at DWN Works. Every engine fits it.
const ALL_SOUNDS=[...new Set(MODELS.flatMap(m=>m.sounds))];modelById('aurora').sounds=ALL_SOUNDS;const modelForSound=id=>ALL_SOUNDS.includes(id)?'aurora':null;
const ui=document.createElement('section');ui.id='world';
ui.innerHTML=`<canvas id="worldCanvas" aria-label="Los Santerra driving world"></canvas><div class="world-vignette"></div><div class="world-underwater"></div>
<header class="world-top"><a class="world-brand" href="#">DWN<span>SHIFT</span><small>LOS SANTERRA / OPEN ROADS</small></a><div class="world-live"><i></i> FREE DRIVE <span id="worldTime">18:42</span></div><div class="world-top-actions"><button id="worldMapButton">MAP <span>TAB</span></button><button id="worldMenu">MENU <span>ESC</span></button></div></header>
<section class="world-location"><div class="world-eyebrow">LOS SANTERRA <span>CALIFORNIA</span></div><h1 id="worldDistrict">West Hollywood</h1><p><span id="worldStreet">Sunset Boulevard</span><time id="worldClock">18:42</time></p></section>
<div class="world-race" id="worldRace" hidden><b id="worldRaceTitle"></b><span class="world-tree" id="worldTree" hidden><i data-l="pre"></i><i data-l="stage"></i><i data-l="a1"></i><i data-l="a2"></i><i data-l="a3"></i><i data-l="go"></i><i data-l="red"></i></span><strong id="worldRaceMain"></strong><small id="worldRaceSub"></small></div><div class="world-prompt" id="worldPrompt" hidden></div><div class="world-toast" id="worldToast" role="status">Building Los Santerra…</div>
<aside class="world-nav glass"><div class="world-nav-head"><span id="worldNavTitle">EXPLORE LOS SANTERRA</span><span id="worldDistance">N ↑</span></div><canvas id="worldMap" width="552" height="320" aria-label="Local road network"></canvas><div class="world-nav-foot"><b id="worldNavGlyph"></b><span id="worldNext">Choose your own road</span><button id="worldExpandMap">↗ MAP</button></div></aside>
<div class="world-fob" id="worldFob" hidden><span class="fob-title">AURORA · KEY</span><button id="fobDoors"><i>⇡</i><b>DOORS</b><kbd>O</kbd></button><button id="fobStart"><i>⏻</i><b id="fobStartLbl">REMOTE START</b><kbd>R</kbd></button><small id="fobDist"></small></div><div class="world-start" id="worldStart" hidden><div class="ws-switches" id="wsSwitches">${[['master','MASTER','U'],['ign','IGNITION','O'],['pump','FUEL PUMP','P']].map(([k,n,key])=>`<button class="ws-sw" data-sw="${k}" title="${n} (${key})"><i class="ws-led"></i><span class="ws-tog"><i class="ws-nut"></i><i class="ws-bat"></i><i class="ws-guard"></i></span><b>${n}</b><kbd>${key}</kbd></button>`).join('')}</div><div class="ws-key" id="wsKey"><span data-k="off">OFF</span><span data-k="on">ON</span><span data-k="start">START</span></div><div class="ws-cap"><span class="ws-capbase"><i class="ws-cover"></i></span><b>STARTER COVER</b><kbd>I</kbd></div><div class="ws-hybrid"><button class="ws-sw ws-ev" data-ev="1" title="Hybrid: electric or engine (Y)"><i class="ws-led"></i><span class="ws-tog"><i class="ws-nut"></i><i class="ws-bat"></i></span><b id="wsEvLbl">EV · GAS</b><kbd>Y</kbd></button></div><p class="ws-hint" id="wsHint"></p></div><section class="world-dash forza"><div class="world-car"><span id="worldCar">PERFORMANCE COUPE</span><small id="worldEngine">HOLD I TO START</small></div><div class="world-signals"><i id="worldSigL">◀</i><i id="worldSigR">▶</i></div><canvas id="worldSpeedometer" width="560" height="560" aria-label="Tachometer and speed"></canvas><div class="world-dial-digital" hidden><strong id="worldSpeed">0</strong><small id="worldUnit">KM/H</small></div><div class="world-dial-gear" hidden><b id="worldGear">P</b></div><div class="world-bottom-rpm" hidden><span><b id="worldRpm">0.0</b></span><span id="worldTraction">FREE DRIVE</span></div><div class="world-revtrack" hidden><i id="worldRev"></i></div></section>
<footer class="world-controls"><span><kbd>W</kbd><kbd>S</kbd> PEDALS</span><span><kbd>A</kbd><kbd>D</kbd> STEER</span><span><kbd>Q</kbd><kbd>E</kbd> SHIFT</span><span><kbd>SPACE</kbd> HANDBRAKE</span><span><kbd>,</kbd><kbd>.</kbd> SIGNALS</span><span><kbd>H</kbd> HORN</span><span><kbd>V</kbd> COCKPIT</span><span>DRAG TO LOOK · SCROLL TO ZOOM</span><div class="world-prnd" id="worldQuickGear"><button data-selector="P">P</button><button data-selector="R">R</button><button data-selector="N">N</button><button data-selector="D">D</button></div><button id="worldCamera">CAMERA · CHASE</button><button id="worldNight">TIME · GOLDEN HOUR</button></footer>
<dialog id="worldDialog"><div class="world-dialog-top"><div><div class="world-eyebrow">DWNSHIFT / DRIVE OS</div><h2 id="worldDialogTitle">The city is yours.</h2></div><button id="worldClose" aria-label="Close menu">✕</button></div><nav class="world-tabs"><button data-tab="drive" class="selected">Drive</button><button data-tab="map">Map</button><button data-tab="garage">Garage</button><button data-tab="online">Online</button><button data-tab="sound">Car sound</button><button data-tab="settings">Settings</button></nav><div id="worldPanel"></div></dialog><button id="worldReturn" hidden>↗ ENTER 3D WORLD</button><div id="worldFade" aria-hidden="true"></div>`;
document.body.append(ui);
let grass=null,tunnels=null,active=false,paused=true,loaded=false,lampCount=0,nightUniform=null,pipeline,plants,buildings,buildingMats,renderer,scene,camera,sky,stream,model,ground,physics,car,net,vehicle,sun,hemi,head,loadStats=null;
const steering=new Steering(),tyreAudio=new TyreAudio();let yawAssist=.5,x=0,y=0,z=0,heading=0,steer=0,keySteer=0,hit=null,travelled=0,night=false,cameraMode=0,assist=false,quality='balanced',sensitivity=1;
let orbit=0,orbitTarget=0,pitch=0,pitchTarget=0,dragging=false,dragX=0,dragY=0,lookIdle=0,cameraHeading=0;
let last=0,lastHud=0,fps=0,frames=0,fpsTime=0,clockSeconds=15*3600+40*60,simTime=0,refreshTraffic=0,routeRefresh=0;
let destination=null,navPath=[],tab='drive',lastRouteEdge=-1;const traffic=[],lights=[],keys=new Set();
let mapIssues=false,mapZoom=1,mapCenter={x:0,z:0},atlasMap=null,nav=null,mapSel=null,mapHover=null,navInfo=null,lastMapView=null;
const clock=()=>`${String(Math.floor(clockSeconds/3600)%24).padStart(2,'0')}:${String(Math.floor(clockSeconds/60)%60).padStart(2,'0')}`;
function notify(message){$('worldToast').textContent=message;$('worldToast').classList.remove('quiet');clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('worldToast').classList.add('quiet'),4200);}
/** The loading screen: a step and a share of the bar, painted before the next heavy step runs. */
async function boot(pct,step){window.__bootStarted?.();const f=document.getElementById('bootFill'),t=document.getElementById('bootStep');if(f)f.style.width=pct+'%';if(t)t.textContent=step;await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));}
async function init(){try{await preloadCars();
 await boot(6,'Reading the road network…');
 const t0=performance.now();
 // Workers for bulk ground heights (plant seating), warming up while the page builds.
 const heightPool=new HeightPool(new URL('assets/world/roads.json',location.href).href);
 const response=await fetch('assets/world/roads.json',{cache:'no-store'});if(!response.ok)throw new Error('Road network could not load');net=new RoadNetwork(await response.json());
 // One road model; the ground, the meshes and the colliders all come from it.
 await boot(14,'Grading the roads and the ground…');model=new RoadModel(net);ground=new Ground(model);const pieces=model.buildPieces(ground);const t1=performance.now();
 renderer=new T.WebGPURenderer({canvas:$('worldCanvas'),antialias:true,powerPreference:'high-performance',reversedDepthBuffer:true});await renderer.init();
 // Instanced meshes small enough for a uniform buffer get their whole matrix array re-sent every
 // draw of every pass (5 MB a frame here); as instance attributes they upload only when they change.
 renderer.backend.capabilities.getUniformBufferLimit=()=>256;
 renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.toneMapping=T.AgXToneMapping;renderer.toneMappingExposure=1.0;
 scene=new T.Scene();scene.fog=new T.FogExp2('#c2c6bb',.00008);camera=new T.PerspectiveCamera(55,innerWidth/innerHeight,.15,30000);
 hemi=new T.HemisphereLight('#c6def0','#817363',1.4);sun=new T.DirectionalLight('#ffe3b9',3.2);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-120,right:120,top:120,bottom:-120,near:1,far:700});sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.0004;sun.shadow.normalBias=.05;scene.add(hemi,sun,sun.target);
 sky=new Sky(scene,renderer);
 // Post: bloom on the sun, sunset glare and lit windows, then tone mapping (AgX
 // keeps a sunset's oranges from clipping to flat yellow).
 {const scenePass=pass(scene,camera),color=scenePass.getTextureNode('output');pipeline=new T.RenderPipeline(renderer);
  // Speed streaks: the frame's edges sampled back toward the centre; the middle stays sharp.
  const streak=Fn(()=>{const c=uv().sub(.5),w=smoothstep(.1,.6,length(c)).mul(blurAmount).mul(.085);const acc=color.sample(uv()).toVar();for(let i=1;i<=6;i++)acc.addAssign(color.sample(uv().sub(c.mul(w.mul(i/6)))));return acc.div(7);});
  pipeline.outputNode=streak().add(bloom(scenePass,.16,.35,.92));}physics=await createPhysics();
 const materials=makeMaterials();stream=new Stream({scene,model,ground,pieces,materials,physics});grass=new Grass(scene,{occupied:()=>buildings?.occupied});stream.grass=grass;
 tunnels=buildTunnels({model,ground,scene,physics,textures:materials.textures});buildGalleries({model,scene,physics});buildSea({scene});
 // West Hollywood's buildings: planned clear of every road, one mesh per material.
 const tb0=performance.now();await boot(38,'Planning the city blocks…');places=new Places({model,ground});planVenues(places);planRestStop(places);planHomes(places);planWorkshop(places);buildings=new Buildings({model,ground,area:CITY});if(ground.pads)stream.worker.postMessage({type:'pads',pads:ground.pads});const tb1=performance.now();buildingMats=makeBuildingMaterials(materials.textures);
 {const boxes=[],cells=new Map();for(const lot of buildings.lots){const k=Math.floor(lot.x/1024)*65536+Math.floor(lot.z/1024);if(!cells.has(k))cells.set(k,new Set());cells.get(k).add(lot);}
  // One mesh per material per 1 km cell, so the blocks off screen are culled.
  for(const set of cells.values()){const built=buildings.build(l=>set.has(l));boxes.push(...built.boxes);for(const [mat,g] of built.geometries){const mesh=new T.Mesh(g,buildingMats[mat]);mesh.userData.kind='bld:'+mat;mesh.castShadow=!['billboard','signs','lot','pool','glow'].includes(mat);mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;scene.add(mesh);}}
  const tb2=performance.now();await boot(62,'Planting the palms and gardens…');plants=new Plants({model,ground,buildings,area:CITY,deferY:true});await plants.seat(heightPool);heightPool.dispose();plants.build(scene);const tb3=performance.now();lampCount=buildLamps({model,scene,area:CITY,night:materials.night});places.build({scene,physics,night:materials.night});fireLights=(places.kit?.fires||[]).slice(0,2).map(f=>{const L=new T.PointLight('#ff8a3c',0,18,2);L.position.set(f.x,f.y,f.z);scene.add(L);return L;});timing=new RaceTiming({notify,hud:r=>{const el=$('worldRace');raceVenue=r?.venue||null;document.body.classList.toggle('racing',!!r);if(!r){el.hidden=true;return;}el.hidden=false;$('worldRaceTitle').textContent=r.title;$('worldRaceMain').textContent=r.main;$('worldRaceSub').textContent=r.sub;const t=$('worldTree');t.hidden=r.venue!=='drag';if(r.tree)for(const k of ['pre','stage','a1','a2','a3','go','red'])t.querySelector('[data-l='+k+']').classList.toggle('on',!!r.tree[k]);}});fwySigns=buildFreewaySigns({model,scene,night:materials.night});nightUniform=materials.night;const tb4=performance.now();window.__loadTimes={plan:Math.round(tb1-tb0),buildMesh:Math.round(tb2-tb1),plants:Math.round(tb3-tb2),lamps:Math.round(tb4-tb3)};
  // A collider covers the building, not the lot: parking in front of a mini-mall stays drivable.
  physics.setBoxes('buildings',boxes.map(({lot,h,lx0=0,lx1=lot.depth,lz=0,w=lot.width})=>({x:lot.x+lot.fx*(lx0+lx1)/2-lot.fz*lz,z:lot.z+lot.fz*(lx0+lx1)/2+lot.fx*lz,y:lot.base+h/2-2,hx:(lx1-lx0)/2,hy:h/2+2,hz:w/2,yaw:Math.atan2(-lot.fz,lot.fx)})));}
 vehicle=makePlayerCar({model:savedModel(),paint:savedPaint(),ambient:savedAmbient()});scene.add(vehicle.object);displayCars=buildDisplayCars(scene,buildings.lots);car=tuneCar(new Car(physics,vehicle.wheels,{radius:vehicle.body.radius,mass:vehicle.body.mass}));setBuild(savedBuild(),false);carFx=new CarFx({scene,vehicle});syncSound();drive.extTyres=true;works=new WorkshopUI(ui,worksApi());online=makeOnline();walker=new Walker({scene,physics});life=new Life({scene,ground});drive.onFlame=(p,k)=>carFx?.flame(p,k);
 await boot(86,'Filling the streets with traffic…');npcs=new Traffic({scene,model,physics});npcs.setDensity(savedTraffic());parked=new Parked({scene,model,physics,traffic:npcs,lots:buildings.lots});atlasMap=new Atlas({net,model,lots:buildings.lots});for(const p of places.pois){const e=atlasMap.places.find(q=>q.name===p.name);if(e)Object.assign(e,p);else atlasMap.places.push(p);}atlasMap.extras=venueOutlines();nav=new Navigator({net,model,scene});
 head=new T.SpotLight('#e4efff',0,90,.5,.5,1.6);scene.add(head,head.target);
 loadStats={lamps:lampCount,freewaySigns:fwySigns?.count,plants:plants.stats,buildings:buildings.lots.length,model:Math.round(t1-t0),total:0,pieces:pieces.length,roadVertices:stream.roadVertices,piers:stream.pierCount,segments:model.segments.length,junctions:model.junctions.length};
 active=true;loaded=true;document.body.classList.add('world-active');boot(100,'Los Santerra');setTimeout(()=>document.getElementById('bootLoader')?.classList.add('done'),350);{const h=savedHome();if(h)spawnHome(h,true);else spawn('Sunset Strip');}setTimeOfDay(drive.state.night?'night':'golden');sky.update(x,z,0,clockSeconds/3600);sky.refreshEnvironment(true);openMenu();requestAnimationFrame(render);
 loadStats.total=Math.round(performance.now()-t0);notify('Los Santerra · Open streets, one connected city.');
 {const code=new URLSearchParams(location.search).get('lobby');if(code){online.join(code.toUpperCase());panel('online');}else online.connect();}
}catch(error){console.error(error);active=false;document.body.classList.remove('world-active');{const L=document.getElementById('bootLoader');if(L){L.classList.add('failed');document.getElementById('bootStep').textContent='Los Santerra could not start · '+error.message+' · a browser with WebGPU is needed.';}}}}
/** The road under or nearest to a point, with its graph edge (for names, districts and routing). */
function roadAt(px,pz,py=null){const r=model.nearest(px,pz,py);return r?{...r,edge:net.edges[r.e]}:null;}
function spawn(name){
 let px=x,pz=z;if(name){const l=net.landmark(name);px=(l.map[0]-768)*10;pz=(l.map[1]-512)*10;}
 const r=roadAt(px,pz,name?null:y);if(!r)return;hit=r;
 // Drive on the right: the right-hand side of travel is the section's +normal.
 const sec=model.sectionAt(r.seg,Math.min(Math.max(r.s,r.seg.cut[0]+4),r.seg.L-r.seg.cut[1]-4)),off=Math.min(1.9,sec.h*.45);
 x=sec.x+sec.nx*off;z=sec.z+sec.nz*off;y=sec.y;heading=Math.atan2(sec.tx,sec.tz);
 stream.update(x,z,1e9);car.place(x,y+.3,z,heading);
 steer=keySteer=0;steering.reset();cameraHeading=heading;orbit=orbitTarget=0;drive.resetMotion();drive.release();drive.setTunnel(r.seg.kind==='tunnel');
 camera.position.set(x-Math.sin(heading)*8,y+3,z-Math.cos(heading)*8);camOffset.set(-Math.sin(heading)*8,3,-Math.cos(heading)*8);
}
/** A player house: the car parked in its drive, nose to the street. */
function savedHome(){try{return localStorage.getItem('dwnHome')||null;}catch{return null;}}
function spawnHome(id,quiet=false){
 const h=HOMES.find(q=>q.id===id);if(!h||!h.park)return false;if(onFoot){walker.leave();onFoot=false;drive.setWalk?.(null);document.body.classList.remove('on-foot');if(document.pointerLockElement)document.exitPointerLock();}
 const p=homePose(h);x=p.x;z=p.z;y=p.y;heading=p.heading;stream.update(x,z,1e9);car.place(x,y+.35,z,heading);hit=roadAt(x,z)||hit;
 steer=keySteer=0;steering.reset();cameraHeading=heading;orbit=orbitTarget=0;drive.resetMotion();drive.release();drive.setTunnel(false);
 camera.position.set(x-Math.sin(heading)*8,y+3,z-Math.cos(heading)*8);camOffset.set(-Math.sin(heading)*8,3,-Math.cos(heading)*8);
 try{localStorage.setItem('dwnHome',id);}catch{}
 if(!quiet)notify(h.name+' · home · F to step out');return true;}
/** The water (pool, spa) at a point, from the set pieces' volumes. */
function waterAt(px,pz){const W=places?.kit?.waters;if(!W)return null;for(const w of W){const dx=px-w.x,dz=pz-w.z;if(w.r!==undefined){if(dx*dx+dz*dz<w.r*w.r)return w;continue;}if(Math.abs(dx*w.fx+dz*w.fz)<w.hl&&Math.abs(-dx*w.fz+dz*w.fx)<w.hw)return w;}return null;}
function nearestHome(px,pz){let best=null,bd=Infinity;for(const h of HOMES){if(!h.pad)continue;const d=Math.hypot(h.pad.cx-px,h.pad.cz-pz);if(d<bd){bd=d;best=h;}}return bd<200?best:null;}
/** Out of the car and back in (F). */
let doorT=0;
/** The driver's door swings up as someone gets out or in, and shuts behind them. */
/* The key fob (2026-10-02): out of the car, O swings the doors up or down and
 * R starts or stops the engine from where you stand (it runs the car's own
 * start-up: race switches, cover, electronics); the hazards blink to answer. */
let fobDoors=false;
function fobBlink(){carFx?.setSignal?.('hazard');setTimeout(()=>{if(carFx?.signal==='hazard')carFx.setSignal('hazard');},1300);}
function fobToggleDoors(){fobDoors=!fobDoors;clearTimeout(doorT);carFx?.setDoors?.(fobDoors,'both');fobBlink();notify(fobDoors?'Doors up':'Doors down');}
function fobRemoteStart(){if(!onFoot)return;const p=walker.pos;if(Math.hypot(p.x-x,p.z-z)>150){notify('Too far from the car for the key');return;}const r=drive.remoteStart?.();fobBlink();notify(r==='off'?'Engine off':'Remote start');}
function swingDoor(){carFx?.setDoors?.(true,'L');clearTimeout(doorT);doorT=setTimeout(()=>carFx?.setDoors?.(false,'L'),1900);}
function toggleOnFoot(){
 if(!walker)return;
 if(!onFoot){
  if(Math.abs(drive.state.v)>1.5){notify('Stop the car to get out');return;}
  // Out through the driver's door (the car's left, +x in its own frame).
  const o=vehicle.object,d=o.localToWorld(V(1.55,0,-.1));const gy=physics.groundAt(d.x,y+3,d.z,8)??y;
  drive.release();swingDoor();walker.enter(d.x,gy,d.z,heading+Math.PI/2);onFoot=true;walkYaw=heading;fpPitch=0;orbit=orbitTarget=0;document.body.classList.add('on-foot');keys.clear();keySteer=0;
 }else{
  const p=walker.pos;if(Math.hypot(p.x-x,p.z-z)>4.5){notify('Walk back to the car to get in');return;}
  fobDoors=false;swingDoor();walker.leave();onFoot=false;drive.setWalk?.(null);document.body.classList.remove('on-foot');keys.clear();cameraHeading=heading;if(document.pointerLockElement)document.exitPointerLock();
 }
}
/* Online lobbies (world/online.js, the server is play.py): the hooks it needs
 * from the world, and the host's settings applied here. */
let lobbySet={},hostTravel=false;
function buildInfo(){return{sound:drive.car?.id,build:vehicle.build,paint:savedPaint()||modelById('aurora').paint,ambient:savedAmbient()||modelById('aurora').ambient,name:(()=>{try{return localStorage.getItem('dwnBuildName')||'Factory';}catch{return 'Factory';}})()};}
function makeOnline(){return new Online({scene,physics,root:ui,notify,
 makeCar:info=>{const v=makePlayerCar({model:'aurora',paint:info.paint||null,ambient:info.ambient||null});applyBuild(v,info.build);return v;},
 disposeCar:v=>v.object.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of [o.material].flat())m.dispose?.();}}),
 local:()=>{const s=drive.state,r=car.rotation,w=onFoot?walker.pos:null;let flags=(s.in.brake>.05||s.brake>.1?1:0)|(s.autoSel==='R'&&s.v<-.2?4:0)|(onFoot?8:0)|(car.handbrake?16:0);
  return{hour:clockSeconds/3600,buildInfo:buildInfo(),state:[+x.toFixed(2),+y.toFixed(2),+z.toFixed(2),+r.x.toFixed(4),+r.y.toFixed(4),+r.z.toFixed(4),+r.w.toFixed(4),+s.v.toFixed(2),+steer.toFixed(3),flags,Math.round((s.rpm||0)/100),+Math.max(...car.skid).toFixed(2),w?+w.x.toFixed(2):0,w?+w.y.toFixed(2):0,w?+w.z.toFixed(2):0,+walkYaw.toFixed(2),+(s.in?.gas||0).toFixed(2)]};},
 apply:applyLobby,onChange:onlineChanged,audio:()=>drive.audio?{ctx:drive.audio.ctx,out:drive.audio.out}:null,
 engine:id=>{const c=drive.cars?.find?.(q=>q.id===id);return c?{cyl:c.cyl||(/V12/.test(c.layout||'')?12:/V10/.test(c.layout||'')?10:/V6|I6/.test(c.layout||'')?6:/I4|4-rotor|rotor/.test(c.layout||'')?4:8),max:c.max||7500}:null;},
 inTunnel:(px,py,pz)=>{const r=model.nearest(px,pz,py);return !!(r&&r.seg.kind==='tunnel'&&r.d<r.h+3&&Math.abs(py-r.y)<8&&model.boredAt(r.seg,r.s))||!!underDeck(px,py,pz)||inGallery(model,px,py,pz);}});}
/* The Online panel is drawn once and only redrawn when what it shows has really
 * changed (status, lobbies, drivers, settings) — never while a button is held —
 * and a redraw keeps what you were typing, the caret and the focus. (2026-10-02:
 * it used to rebuild on every server message, and many times a second while the
 * server was unreachable, so you could neither type a name nor hit CREATE.) */
let olSig='',olPending=false,olPointer=false;
function onlineSig(){const O=online;if(!O)return '';const L=O.lobby;return JSON.stringify([O.status,O.error,O.lobbies,O.shareOn,O.share,L&&[L.code,L.host,L.name,L.max,L.players.map(q=>[q.id,q.name,q.build?.name]),O.isHost?L.settings?.meet||null:L.settings]]);}
function onlineChanged(){if(!$('worldDialog').open||tab!=='online')return;if(onlineSig()===olSig)return;if(olPointer){olPending=true;return;}redrawOnline();}
function redrawOnline(){const p=$('worldPanel'),keep={};p.querySelectorAll('input[id],select[id]').forEach(el=>{if(!el.disabled)keep[el.id]=el.type==='checkbox'?el.checked:el.value;});const f=document.activeElement,fid=f&&p.contains(f)?f.id:null,sel=fid&&typeof f.selectionStart==='number'?[f.selectionStart,f.selectionEnd]:null;
 panel('online');
 for(const [id,v] of Object.entries(keep)){const el=$(id);if(el&&!el.disabled){if(el.type==='checkbox')el.checked=v;else el.value=v;}}
 if($('olTraffic'))$('olTraffic').nextElementSibling.textContent=trafficLabel(+$('olTraffic').value);
 if(fid&&$(fid)){$(fid).focus({preventScroll:true});if(sel)try{$(fid).setSelectionRange(sel[0],sel[1]);}catch(_){}}}
addEventListener('pointerdown',e=>{if(e.target.closest?.('#worldPanel'))olPointer=true;},true);
addEventListener('pointerup',()=>{if(!olPointer)return;olPointer=false;if(olPending){olPending=false;setTimeout(onlineChanged,60);}},true);
/** The lobby's settings, from its host: traffic, the clock, collisions, the meet point. */
function applyLobby(set,why){
 if(why==='clock'){if(set.hour!=null&&Math.abs(((set.hour-clockSeconds/3600+36)%24)-12)>.05)setHour(+set.hour);return;}
 const prev=lobbySet;lobbySet={...lobbySet,...set};
 if(set.traffic!=null&&npcs)npcs.setDensity(+set.traffic);
 if(set.flow&&TIME_FLOWS.some(f=>f[0]===set.flow))timeFlow=set.flow;
 if(set.hour!=null&&(why!=='update'||set.hour!==prev.hour))setHour(+set.hour);
 const m=set.meet;if(m&&(why==='joined'||!prev.meet||prev.meet.x!==m.x||prev.meet.z!==m.z)){setDestination({name:'Meet · '+m.name,x:m.x,z:m.z});if(why==='update')notify('Car meet · '+m.name+' · route set');}
 if(why==='joined'){if(m){setTimeout(()=>travelTo(m.x,m.z,'Meet · '+m.name),300);}else hostTravel=true;}}
/** Fast travel to just behind another player (their heading from the snapshot's rotation). */
function travelBehind(st,name){const h=2*Math.atan2(st.q.y,st.q.w);travelTo(st.x-Math.sin(h)*16,st.z-Math.cos(h)*16,name);}
function lobbyHost(){return online?.lobby?[...online.peers.values()].find(p=>p.id===online.lobby.host):null;}
/* DWN Works: stop on the bay ring, press E. The screen dresses the car live
 * (world/workshopUi.js + world/carParts.js); the camera circles it in the bay. */
function inBay(){const b=WORKSHOP.bay;return !!b&&!onFoot&&!inWorks&&Math.hypot(x-b.x,z-b.z)<b.r&&Math.abs(y-WORKSHOP.y)<3&&Math.abs(drive.state.v)<1.5;}
function worksApi(){return{build:()=>vehicle.build||savedBuild(),setBuild:b=>setBuild(b),paint:()=>savedPaint()||modelById('aurora').paint,setPaint,ambient:()=>savedAmbient()||modelById('aurora').ambient,setAmbient,
 sounds:()=>drive.cars.filter(c=>ALL_SOUNDS.includes(c.id)||c.custom),sound:()=>drive.car.id,setSound:id=>setSound(id),handling:()=>car.modeId,setHandling:id=>{try{localStorage.setItem('dwnHandling',id);}catch{}car.setMode(id);},modes:HANDLING,close:exitWorks};}
function enterWorks(){
 if(inWorks)return;const b=WORKSHOP.bay;inWorks=true;
 // Square on the ring, nose to the street, ready to drive out.
 car.place(b.x,WORKSHOP.y+.3,b.z,WORKSHOP.yaw);x=b.x;z=b.z;heading=WORKSHOP.yaw;drive.resetMotion();pause(true);
 document.body.classList.add('in-works');works.show('presets');}
function exitWorks(){if(!inWorks)return;inWorks=false;works.hide();camOverride=null;document.body.classList.remove('in-works');cameraHeading=heading;pause(false);try{localStorage.setItem('dwnBuild',JSON.stringify(vehicle.build));}catch{}notify('DWN Works · build saved · '+(localStorage.getItem('dwnBuildName')||'Custom'));}
// The clock is the one source of truth: sky, sun colour, fog, window lights and
// the dashboard's night palette all follow the hour. Night is derived from it,
// never the other way round (the old toggle snapped the clock back to 19:10,
// which is why every choice in the menu ended up at sunset again).
const TIME_PRESETS=[['dawn','Dawn',5.7],['sunrise','Sunrise',6.6],['morning','California morning',8.6],
 ['midday','Midday',12.4],['afternoon','Late afternoon',15.7],['golden','Golden hour',19.15],
 ['sunset','Sunset',19.7],['dusk','Blue hour',20.25],['night','After hours',22.5]];
// How fast the clock runs: game seconds per real second.
const TIME_FLOWS=[['still','Paused',0],['slow','Slow · 1 h in 30 min',2],['cinematic','Cinematic · 1 h in 2 min',30],['timelapse','Timelapse · 1 h in 10 s',360]];
let timeOfDay='golden',timeFlow='slow';
const isDark=h=>h<6.15||h>19.95;
function syncNight(){const dark=isDark(clockSeconds/3600);if(dark!==night){night=dark;}if(drive.state.night!==dark)drive.setNight(dark);$('worldNight').textContent='TIME · '+(TIME_PRESETS.find(p=>p[0]===timeOfDay)?.[1]||clock()).toUpperCase();}
function setHour(hour,key=null){
 clockSeconds=((hour%24+24)%24)*3600;
 timeOfDay=key||TIME_PRESETS.find(p=>Math.abs(p[2]-hour)<.04)?.[0]||'custom';
 syncNight();
 if(sky){sky.update(x,z,simTime,clockSeconds/3600);sky.refreshEnvironment(true);}
}
function setTimeOfDay(key){const preset=TIME_PRESETS.find(p=>p[0]===key)||TIME_PRESETS[5];setHour(preset[2],preset[0]);}
/** Toggled from outside (the simulator's own night switch): pick a sensible hour. */
/** The car, its paint and its cabin light: kept per browser (paint and light per car), chosen in the garage. */
function savedModel(){return 'aurora';}
/** The workshop build (world/carParts.js), kept per browser. */
function savedBuild(){try{return sanitizeBuild(JSON.parse(localStorage.getItem('dwnBuild')||'null'));}catch{return sanitizeBuild(null);}}
function setBuild(b,save=true){const r=applyBuild(vehicle,b);if(r.cabin)carFx?.attachCabin(vehicle.body.interior);if(car)car.aero=r.aero;if(save)try{localStorage.setItem('dwnBuild',JSON.stringify(r.build));}catch{}online?.sendBuild?.();return r.build;}
function savedPaint(id=savedModel()){try{return localStorage.getItem('dwnPaint:'+id)||null;}catch{return null;}}
function savedAmbient(id=savedModel()){try{return localStorage.getItem('dwnAmbient:'+id)||null;}catch{return null;}}
function setPaint(hex){if(vehicle?.body)vehicle.body.paint.color.set(hex);try{localStorage.setItem('dwnPaint:'+savedModel(),hex);}catch{}if(vehicle?.build?.finish==='paint')setBuild(vehicle.build,false);}
function setAmbient(hex){if(vehicle?.body)vehicle.body.ambient.color.value.set(hex);try{localStorage.setItem('dwnAmbient:'+savedModel(),hex);}catch{}}
/** Each body has its own sounds: the last one chosen for it, else its default. */
function soundFor(id){const m=modelById(id);let s=null;try{s=localStorage.getItem('dwnSound:'+id);}catch{}const ok=v=>v&&drive.cars.some(c=>c.id===v)&&(m.sounds.includes(v)||drive.cars.find(c=>c.id===v)?.custom);return ok(s)?s:m.sounds.find(v=>drive.cars.some(c=>c.id===v));}
function setSound(cid){const mb=modelForSound(cid)||savedModel();try{localStorage.setItem('dwnSound:'+mb,cid);}catch{}if(drive.car.id!==cid)drive.selectCar(cid);if(mb!==savedModel())setModel(mb);online?.sendBuild?.();}
/** Put the engine sound in line with the body (a sound tied to another body is swapped for this body's own). */
function syncSound(){if(drive.car?.custom)return;let s=null;try{s=localStorage.getItem('dwnSound:aurora');}catch{}const want=s&&drive.cars.some(c=>c.id===s)?s:'absolut';if(drive.car?.id!==want&&drive.cars.some(c=>c.id===want))drive.selectCar(want);}
/** Swap the car for another model where it stands: new body, wheels, chassis and effects. */
async function setModel(id){
 if(!car||id===savedModel()||setModel.busy)return;setModel.busy=true;try{localStorage.setItem('dwnModel',id);}catch{}
 // Build and compile the new car's shaders first, so the swap itself doesn't stall a frame.
 const next=makePlayerCar({model:id,paint:savedPaint(id),ambient:savedAmbient(id)});next.object.position.copy(vehicle.object.position);next.object.quaternion.copy(vehicle.object.quaternion);
 try{await renderer.compileAsync(next.object,camera,scene);}catch(e){console.warn(e);}
 scene.remove(vehicle.object);carFx.dispose();physics.world.removeVehicleController(car.controller);physics.world.removeRigidBody(car.body);
 vehicle.object.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of [o.material].flat())m.dispose();}});
 vehicle=next;scene.add(vehicle.object);
 car=tuneCar(new Car(physics,vehicle.wheels,{radius:vehicle.body.radius,mass:vehicle.body.mass}));car.place(x,y+.3,z,heading);carFx=new CarFx({scene,vehicle});syncSound();drive.resetMotion();setModel.busy=false;
 notify(modelById(id).name+' · '+modelById(id).tag);}
function lighting(on){if(on!==isDark(clockSeconds/3600))setTimeOfDay(on?'night':'golden');else syncNight();}
const audioView={ck:null,r:-1},gMeter={lat:0,lon:0};
document.addEventListener('pointerdown',e=>{if(e.target.closest?.('#fobDoors')){fobToggleDoors();return;}if(e.target.closest?.('#fobStart')){fobRemoteStart();return;}if(e.target.closest?.('#worldStart [data-ev]')){drive.toggleEdrive();return;}const sw=e.target.closest?.('#worldStart [data-sw]');if(sw){drive.raceSwitch(sw.dataset.sw);return;}});let raceVenue=null,glowLight=null;
let works=null,inWorks=false,online=null,life=null,fireLights=[],soundscape=new Soundscape(),stepIdx=0,wasSwim=false,airT=0,carWet=false,carWetT=0,indoor=0,indoorT=0,stillT=0,walkYaw=0,fpPitch=0,walker=null,onFoot=false,timing=null,lastExterior=0,carFx=null,places=null,wadeT=0,lastX=0,lastZ=0,flipped=0,tunnelMix=0,displayCars=null,npcs=null,fwySigns=null,parked=null;
const trafficLabel=d=>d<.02?'Off':d<.3?'Light':d<.6?'Normal':d<.85?'Busy':'Rush hour';
/** Traffic density 0..1, kept per browser. */
/** Handling mode (grip / drift / sim) and traction control, kept per browser. */
function savedHandling(){try{const v=localStorage.getItem('dwnHandling');return HANDLING[v]?v:'grip';}catch{return 'grip';}}
function savedTC(){try{return localStorage.getItem('dwnTC')!=='off';}catch{return true;}}
function tuneCar(c){c.setMode(savedHandling());c.tc=savedTC();c.yawAssist=yawAssist;return c;}
function savedTraffic(){try{const v=localStorage.getItem('dwnTraffic');return v===null?.5:+v;}catch{return .5;}}
/* Debug bot (?worldDebug=1): drives the real car through the real drivetrain
 * and physics, following the road model, and records what goes wrong. */
let bot=null,camOverride=null;
function botStep(dt,s){
 const c=bot.pilot.control(x,z,heading,s.v),m=bot.metrics;
 m.time+=dt;m.distance+=Math.abs(s.v)*dt;
 const err=c.speed-s.v;s.in.gas=clamp(err*.25,0,1);s.in.brake=clamp(-err*.2,0,1);
 m.maxOffRoad=Math.max(m.maxOffRoad,c.offRoad);if(c.offRoad>1.5)m.offRoadTime+=dt;
 const g=car.grounded;if(g<4)m.airTime+=dt;if(g===0)m.allWheelsOff+=dt;
 if(Math.abs(s.v)<1&&m.time>4){bot.still+=dt;if(bot.still>6){m.stuck.push([Math.round(x),Math.round(z),hit?.edge.name]);bot.still=0;spawn();bot.pilot.attach(x,z,y,heading);}}else bot.still=0;
 if(y<ground.height(x,z)-3)m.underground++;
 return c.steer;
}
/** Is there a road deck 3.5-16 m overhead? (an underpass, or under a bridge) */
function underDeck(px,py,pz){const list=model.near(px,pz);for(let k=0;k<list.length;k+=2){const seg=model.segments[list[k]];if(seg.kind==='tunnel')continue;const i=list[k+1],a=seg.pts[i],b=seg.pts[i+1];const dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;if(l2<1e-6)continue;const t=Math.max(0,Math.min(1,((px-a.x)*dx+(pz-a.z)*dz)/l2));const d=Math.hypot(px-a.x-dx*t,pz-a.z-dz*t),h=a.h+(b.h-a.h)*t+1,dy=a.y+(b.y-a.y)*t-py;if(d<h&&dy>3.5&&dy<16)return true;}return false;}
/** The underside of a tunnel roof or road deck over (px, pz) near the road level ry, or null. */
function roofOver(px,pz,ry){const r=model.nearest(px,pz,ry);if(r&&r.seg.kind==='tunnel'&&r.d<r.h+2.5&&Math.abs(ry-r.y)<4&&model.boredAt(r.seg,r.s))return r.y+6;if(underDeck(px,ry,pz))return ry+4.4;if(inGallery(model,px,ry,pz))return ry+6.2;return null;}
function step(dt){
 if(!active||paused||!loaded)return;simTime+=dt;{const rate=TIME_FLOWS.find(f=>f[0]===timeFlow)[2];if(rate){clockSeconds=(clockSeconds+dt*rate)%86400;if(timeOfDay!=='custom'&&rate>2)timeOfDay='custom';syncNight();}}const s=drive.state;
 let raw=onFoot?0:(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')?1:0);
 const gp=Array.from(navigator.getGamepads?.()||[]).find(Boolean);let pad=gp&&Math.abs(gp.axes[0])>.075?-gp.axes[0]:null;
 if(bot)pad=botStep(dt,s);
 // The hands: world/handling.js (velocity-relative steering, tuned in the handling lab).
 steer=steering.update(dt,{raw,pad,speed:s.v,car});keySteer=steering.key;
 car.drive=drive.car.awd?'awd':drive.car.fwd?'fwd':'rwd';car.handbrake=onFoot?1:keys.has('Space')?1:0;if(onFoot){s.in.gas=0;s.in.brake=0;}
 car.step(dt,s,steer);
 const p=car.position;x=p.x;y=p.y;z=p.z;heading=car.heading;
 if(onFoot){walker.water=waterAt(walker.pos.x,walker.pos.z);}
 if(onFoot){const k=c=>keys.has(c)?1:0;walker.update(dt,{fwd:k('KeyW')+k('ArrowUp')-k('KeyS')-k('ArrowDown'),right:k('KeyD')+k('ArrowRight')-k('KeyA')-k('ArrowLeft'),run:keys.has('ShiftLeft')||keys.has('ShiftRight'),jump:keys.has('Space')},walkYaw);if(walker.pos.y<ground.height(walker.pos.x,walker.pos.z)-6&&physics.groundAt(walker.pos.x,walker.pos.y+1,walker.pos.z,60)==null){/* only when truly falling through the world: inside a mountain tunnel the hill's surface is far overhead and that is fine */const r=model.nearest(walker.pos.x,walker.pos.z,walker.pos.y),gy=r&&r.d<r.h+6&&Math.abs(r.y-walker.pos.y)<12?r.y:ground.height(walker.pos.x,walker.pos.z);walker.enter(walker.pos.x,gy+.5,walker.pos.z,walker.yaw);}
  // Footsteps on whatever is underfoot; strokes and splashes in the pool; a thump landing a jump.
  const w=walker,idx=Math.floor(w.phase/Math.PI),surf=()=>w.wading>.05?'water':(physics.surfaceAt(w.pos.x,w.pos.y+.4,w.pos.z,1.2,w.collider)?.surface||'stone');
  if(idx!==stepIdx){stepIdx=idx;if(w.swimming)soundscape.step('swim',w.speed/1.9);else if(w.grounded&&w.speed>.4)soundscape.step(surf(),clamp(w.speed/6,0,1)*.7+.3);}
  if(w.swimming&&!wasSwim)soundscape.splash(.7);wasSwim=w.swimming;
  if(!w.grounded&&!w.swimming)airT+=dt;else{if(airT>.35&&w.grounded){soundscape.step(surf(),1);}airT=0;}
  if(w.climbed){w.climbed=false;soundscape.step('water',.8);}}
 // The car rolled into the pool: it wallows to a stop; a moment later, back to the drive.
 {const wv=waterAt(x,z);if(wv&&wv.r===undefined&&y<wv.y-.15){const lv=car.body.linvel(),k=Math.exp(-dt*(1.2+Math.min(wv.y-y,1.5)*2.5));car.body.setLinvel({x:lv.x*k,y:Math.max(lv.y,-2.5),z:lv.z*k},true);drive.state.v*=k;
  if(!carWet){carWet=true;soundscape.splash(1.5);notify('Splash · the car is in the pool');}carWetT+=dt;if(carWetT>3.5&&!onFoot){const h=nearestHome(x,z);carWet=false;carWetT=0;if(h){spawnHome(h.id,true);notify('Towed back to the drive · dripping');}}}else{carWet=false;carWetT=0;}}
 travelled+=Math.hypot(x-lastX,z-lastZ);lastX=x;lastZ=z;
 // Felt g (smoothed): + lon = pressed back (accelerating), + lat = pushed right (turning left).
 {const lv=car.body.linvel(),fx=Math.sin(heading),fz=Math.cos(heading);if(gMeter.vx!==undefined&&dt>1e-4){const ax=(lv.x-gMeter.vx)/dt,az=(lv.z-gMeter.vz)/dt,k=1-Math.exp(-dt*5);if(Math.hypot(ax,az)<60){gMeter.lon+=((ax*fx+az*fz)/9.81-gMeter.lon)*k;gMeter.lat+=((ax*fz-az*fx)/9.81-gMeter.lat)*k;}}gMeter.vx=lv.x;gMeter.vz=lv.z;}
 hit=roadAt(x,z,y)||hit;
 // On its roof or side for a moment: put it back on the road, upright.
 const r=car.rotation,upY=1-2*(r.x*r.x+r.z*r.z);if(upY<.35&&Math.abs(s.v)<4){flipped+=dt;if(flipped>1.5){flipped=0;if(bot)bot.metrics.flips.push([Math.round(x),Math.round(z)]);spawn();bot?.pilot.attach(x,z,y,heading);return;}}else flipped=0;
 // The Pacific: wading through the shallows drags the car down; once the
 // water is over the sills the map ends here, and it is back to the beach road.
 {const depth=SEA_Y-ground.height(x,z);if(depth>.15&&y<SEA_Y+.6){const lv=car.body.linvel(),k=Math.exp(-dt*(.6+Math.min(depth,1.2)*2.2));car.body.setLinvel({x:lv.x*k,y:lv.y,z:lv.z*k},true);
  if(depth>1.05){wadeT+=dt;if(wadeT>.5){wadeT=0;notify('The Pacific · the map ends at the water');spawn();return;}}else wadeT=0;}else wadeT=0;}
 // Off the edge of the world, or somehow under it: back to the nearest road.
 // (Not when the car is on a road at its own level: deep in a long tunnel the hill's surface is 25-300 m overhead,
 // and this check used to fire every frame there — respawning onto the tunnel, over and over: the car froze and flickered.)
 if(Math.abs(x)>7600||Math.abs(z)>5050||(y<ground.height(x,z)-25&&!(hit&&hit.d<hit.h+5&&Math.abs(y-hit.y)<6))){if(bot)bot.metrics.respawns.push([Math.round(x),Math.round(y),Math.round(z)]);spawn();bot?.pilot.attach(x,z,y,heading);}
 // Inside a bored tunnel, or under a deck (an underpass): tunnel light and acoustics.
 const tunnel=(hit?.seg.kind==='tunnel'&&hit.d<hit.h+1&&Math.abs(y-hit.y)<4&&model.boredAt(hit.seg,hit.s))||underDeck(x,y,z)||inGallery(model,x,y,z);if(s.tunnel!==tunnel)drive.setTunnel(tunnel);
 npcs?.update(dt,{x,y,z,heading,v:s.v},{x:camera.position.x,z:camera.position.z,fx:Math.sin(cameraHeading),fz:Math.cos(cameraHeading)});parked?.update(dt,{x:camera.position.x,z:camera.position.z},{x,z});
 timing?.update(dt,{x,z,v:s.v,kmh:Math.abs(s.v)*3.6});stillT=Math.abs(s.v)<.5?stillT+dt:0;
 navInfo=nav&&destination?nav.update(dt,{x,z,heading},hit?.edge):null;if(navInfo?.arrived){notify('You have arrived · '+navInfo.arrived);destination=null;navInfo=null;}navPath=nav?.dest?nav.path:[];
}
/* ---------------------------------------------------------------- camera
 * Six rigs (X cycles, Z looks back, wheel zooms, drag orbits). Speed is sold
 * by the camera as much as by the number on the dial: the chase cam sits low
 * and close, falls back under acceleration and tucks in under braking, the
 * field of view opens with speed, the image shivers faintly at high speed,
 * and the edges of the frame streak (radial blur in the post pipeline). */
const CAMS=[
 {name:'CHASE',dist:6.1,h:1.45,look:1.05,ahead:3.5,fov:60},
 {name:'CHASE FAR',dist:10.5,h:2.6,look:1.1,ahead:5,fov:56},
 {name:'COCKPIT',cockpit:true,fov:66},
 {name:'HOOD',hood:[0,1.12,1.0],fov:64},
 {name:'BUMPER',hood:[0,.52,2.45],fov:68},
 {name:'CINEMATIC',cine:true,fov:40},
 {name:'HELICOPTER',dist:26,h:15,look:0,ahead:12,fov:48},
];
const camOffset=V(0,3,-8);let cockpitZoom=1,zoom=1,lookBack=false,camV=0,camAcc=0,shakeT=0,cineAnchor=null,cineTimer=0,speedFx=1,shakeFx=1;const blurAmount=uniform(0);
function updateCamera(dt,s,position,forward,cam){
 const speed=Math.abs(s.v),kmh=speed*3.6;
 const gp=Array.from(navigator.getGamepads?.()||[]).find(Boolean);if(gp&&Math.abs(gp.axes[2]||0)>.12){orbitTarget-=gp.axes[2]*dt*1.7;lookIdle=0;}if(gp&&Math.abs(gp.axes[3]||0)>.12)pitchTarget=clamp(pitchTarget+gp.axes[3]*dt*.7,-.15,.75);
 lookIdle+=dt;if(!dragging&&lookIdle>2&&speed>2){orbitTarget*=Math.exp(-dt*.8);pitchTarget+=(0-pitchTarget)*(1-Math.exp(-dt*.8));}
 orbit+=angleDelta(orbitTarget-orbit)*(1-Math.exp(-dt*9));pitch+=(pitchTarget-pitch)*(1-Math.exp(-dt*9));
 // The chase camera trails the car's heading a little, so a turn shows the car's flank.
 // In a slide it swings toward the direction of travel, so a drift shows the car's flank.
 {const lv=car.body.linvel(),sp=Math.hypot(lv.x,lv.z),slide=sp>5&&s.v>0?angleDelta(Math.atan2(lv.x,lv.z)-heading)*.55*clamp((sp-5)/6,0,1):0;
  cameraHeading+=angleDelta(heading+slide-cameraHeading)*(1-Math.exp(-dt*(3.4+speed*.06)));}
 // Longitudinal g, smoothed: pushes the camera back when you floor it.
 const acc=(s.v-camV)/Math.max(dt,1e-3);camV=s.v;camAcc+=(clamp(acc,-14,10)-camAcc)*(1-Math.exp(-dt*3));
 const fx=speedFx;let desired,gaze,snap=false;
 if(onFoot){
  // On foot: first person, at eye height. Mouse look (click to capture the pointer, or drag);
  // a small bob with the stride. The body stays hidden so it never fills the view.
  const w=walker.pos,ch=walkYaw,bob=Math.abs(Math.cos(walker.phase))*Math.min(1,walker.speed/3)*.035;walker.mesh.visible=false;
  desired=V(w.x,w.y+1.62+bob,w.z);gaze=desired.clone().add(V(Math.sin(ch)*Math.cos(fpPitch),Math.sin(fpPitch),Math.cos(ch)*Math.cos(fpPitch)));
  camOffset.copy(desired).sub(position);snap=true;
 }else if(cam.cockpit&&carFx?.eye){
  // In the driver's seat: the eye rides with the body; the view leans a
  // little into the corner and can be dragged round to look out the side.
  const e=carFx.eye;desired=vehicle.object.localToWorld(V(e[0],e[1],e[2]));
  gaze=vehicle.object.localToWorld(V(e[0]-steer*1.2,e[1]-1.1,e[2]+(lookBack?-30:30)));
  if(orbit){const q=new T.Quaternion().setFromAxisAngle(V(0,1,0),orbit);gaze.sub(desired).applyQuaternion(q).add(desired);}
  snap=true;
 }else if(cam.hood){
  // Fitted to the body: over the bonnet's crown, or just ahead of the nose.
  const D=vehicle.body.dims,o=cam.name==='BUMPER'?[0,Math.max(.45,D.deck(D.Z1)*.9),D.Z1+.03]:[0,D.deck(D.GZ1+.12)+.34,D.GZ1+.12];desired=vehicle.object.localToWorld(V(o[0],o[1],lookBack?D.Z0-.3:o[2]));
  gaze=vehicle.object.localToWorld(V(0,o[1]-.05,(lookBack?-1:1)*40));
  if(orbit){const q=new T.Quaternion().setFromAxisAngle(V(0,1,0),orbit);gaze.sub(desired).applyQuaternion(q).add(desired);}
  snap=true;
 }else if(cam.cine){
  // A trackside camera ahead of the car; when the car has gone by, the next one.
  cineTimer-=dt;const far=cineAnchor&&cineAnchor.distanceTo(position)>70;
  if(!cineAnchor||far||cineTimer<0){const side=Math.random()<.5?-1:1,ahead=20+Math.min(speed*1.6,55);
   cineAnchor=position.clone().addScaledVector(forward,ahead).add(V(Math.cos(heading)*side*(7+Math.random()*5),0,-Math.sin(heading)*side*(7+Math.random()*5)));
   cineAnchor.y=Math.max(ground.height(cineAnchor.x,cineAnchor.z),y-3)+1.1+Math.random()*2.5;cineTimer=6+Math.random()*3;snap=true;camera.position.copy(cineAnchor);}
  desired=cineAnchor;gaze=position.clone().add(V(0,.7,0));
 }else{
  const ch=cameraHeading+orbit+(lookBack?Math.PI:0),z0=cam.dist*zoom;
  const dist=z0*(1+clamp(camAcc*.012*fx,-.1,.14))+Math.min(speed*.012,1.1)*fx*(cam.dist<12?1:0);
  const h=cam.h*Math.sqrt(zoom)+Math.sin(pitch)*z0;
  desired=V(x-Math.sin(ch)*dist,y+h,z-Math.cos(ch)*dist);
  // Inside a bore (or under a deck) the ground over the camera is the hill
  // or the bridge above: keep the camera down under the roof instead.
  const roof=roofOver(desired.x,desired.z,y);
  if(roof!==null)desired.y=Math.min(desired.y,roof-1.1);else desired.y=Math.max(desired.y,ground.height(desired.x,desired.z)+.7);
  gaze=V(x+Math.sin(ch)*cam.ahead,y+cam.look+Math.max(0,cam.h-4)*-.05,z+Math.cos(ch)*cam.ahead);
 }
 // Smooth the camera's OFFSET from the car, not its absolute position, or at
 // 200 km/h a lerp leaves it metres behind and the car shrinks into the distance.
 if(snap||cam.cine)camOffset.copy(desired).sub(position);else camOffset.lerp(desired.clone().sub(position),1-Math.exp(-dt*(cam.dist>20?4:10)));
 camera.position.copy(position).add(camOffset);if(cam.cine)camera.position.copy(desired);
 if(camOverride){camera.position.set(...camOverride[0]);gaze.set(...camOverride[1]);}
 camera.lookAt(gaze);
 // A faint high-frequency shiver above ~90 km/h: road texture through the car.
 shakeT+=dt;const shake=clamp((kmh-90)/180,0,1)*.0028*shakeFx*(cam.cine?0:1);
 if(shake){camera.rotateX(Math.sin(shakeT*31)*shake+Math.sin(shakeT*57.3)*shake*.6);camera.rotateY(Math.sin(shakeT*23.7)*shake*.7);camera.rotateZ(Math.sin(shakeT*17.1)*shake*.5);}
 const base=cam.fov*(cam.cockpit?cockpitZoom:1)+(cam.cine?Math.max(0,40-position.distanceTo(camera.position))*-.3:0);
 camera.fov=base+(cam.cine?0:Math.min(Math.max(kmh-20,0)*.07,17)*fx);camera.updateProjectionMatrix();
 blurAmount.value=cam.cine?0:clamp((kmh-70)/190,0,1)*fx;
}
function render(now){requestAnimationFrame(render);if(!active)return;const dt=Math.min((now-last)/1000||.016,.05);last=now;if(drive.state.night!==night)lighting(drive.state.night);
 const s=drive.state,forward=V(Math.sin(heading),0,Math.cos(heading)),position=V(x,y,z);
 // Body and wheels straight from the physics: pitch, roll and suspension travel included.
 const r=car.rotation;vehicle.object.position.copy(position);vehicle.object.quaternion.set(r.x,r.y,r.z,r.w);vehicle.object.updateMatrixWorld();
 const cam=onFoot?CAMS[0]:CAMS[cameraMode];vehicle.object.visible=onFoot||!cam.hood;
 // From the driver's seat the car's own cluster is the instrument: the screen dial steps aside.
 {const inCab=!!cam.cockpit&&!onFoot;if(inCab!==render.inCab){render.inCab=inCab;document.body.classList.toggle('in-cockpit',inCab);}}
 vehicle.wheels.forEach((w,i)=>{const ws=car.wheelState(i);w.pivot.position.y=w.y+(car.mount??car.rest)-ws.length;w.pivot.rotation.y=ws.steering;w.spin.rotation.x=ws.rotation;});
 online?.update(dt,{camera,night:!!(sky.night||s.tunnel),collisions:lobbySet.collisions!==false,me:{x,z}});
 if(hostTravel){const h=lobbyHost(),st=h&&online.sample(h,performance.now()/1000);if(st){hostTravel=false;travelBehind(st,h.name);}}
 if(inWorks){const c=works.camera(dt),o=vehicle.object;camOverride=[o.localToWorld(V(...c.from)).toArray(),o.localToWorld(V(...c.to)).toArray()];}
 updateCamera(dt,s,position,forward,cam);if(inWorks){camera.fov=42;camera.updateProjectionMatrix();blurAmount.value=0;}
 // The engine's microphone follows the camera: cockpit = driver's seat, cabin sealed; every outside view = outside the car, as far off as the camera is.
 if(!onFoot){const ck=!!cam.cockpit&&!inWorks,r=ck?0:Math.round(camera.position.distanceTo(position)*2)/2;if(ck!==audioView.ck||Math.abs(r-audioView.r)>.4){audioView.ck=ck;audioView.r=r;drive.setView?.({cockpit:ck,r});}}
 {const L=WORKSHOP.lights;if(L){const d=Math.hypot(camera.position.x-WORKSHOP.x,camera.position.z-WORKSHOP.z),n=sky.night?1:0;for(const l of L)l.intensity=d<120?(inWorks?140:60+n*60):0;}}
 {const n=nightUniform?.value??0;
  if(!soundscape.ready&&drive.audio)soundscape.init(drive.audio);
  if(onFoot){indoorT-=dt;if(indoorT<0){indoorT=.25;const p=walker.pos,hit=physics.world.castRay(new physics.R.Ray({x:p.x,y:p.y+1.75,z:p.z},{x:0,y:1,z:0}),7,true,undefined,undefined,walker.collider);indoor=hit?1:0;}
   const p=walker.pos,dx=x-p.x,dz=z-p.z,r=Math.hypot(dx,dz,y-p.y),rx=-Math.cos(walkYaw),rz=Math.sin(walkYaw);drive.setWalk?.({r:r*(1+indoor*.8),pan:(dx*rx+dz*rz)/Math.max(r,.5)});}
  {const c=camera.position,wv=onFoot?waterAt(c.x,c.z):null;document.body.classList.toggle('underwater',!!wv&&c.y<wv.y-.02);}
  const p=onFoot?walker.pos:position;soundscape.update(dt,{on:onFoot,x:p.x,y:p.y,z:p.z,yaw:onFoot?walkYaw:heading,day:sky.last?.day??1,night:n,sources:places?.kit?.sounds,indoor:onFoot?indoor:0});
  life?.update(dt,{camera,day:sky.last?.day??1,night:n});
  for(const L of fireLights){const d=camera.position.distanceTo(L.position);L.intensity=n>.12&&d<180?n*(26+7*Math.sin(simTime*13.1)+5*Math.sin(simTime*7.3+1)+4*Math.sin(simTime*23.7+2)):0;}}
 paintNight.value=Math.max(nightUniform?.value??0,s.tunnel?.5:0);if(!glowLight){glowLight=new T.PointLight('#ffffff',0,7,1.6);scene.add(glowLight);}updateGlow(vehicle,{time:performance.now()/1000,night:Math.max(nightUniform?.value??0,s.tunnel?.7:0),light:glowLight});carFx?.update(dt,{car,state:s,g:gMeter,info:drive.car,beam:!!(sky.night||s.tunnel),hour:clockSeconds/3600,day:sky.last?.day??1,cockpit:!!cam.cockpit&&!onFoot,steer,dialCanvas:$('worldSpeedometer')});if(carFx){$('worldSigL').classList.toggle('on',carFx.signalOn&&(carFx.signal==='left'||carFx.signal==='hazard'));$('worldSigR').classList.toggle('on',carFx.signalOn&&(carFx.signal==='right'||carFx.signal==='hazard'));}
 if(!tyreAudio.ready&&drive.audio)tyreAudio.init(drive.audio);tyreAudio.update(dt,{skid:car.skid,front:Math.abs(car.frontSlip)>Math.abs(car.rearSlip),beta:car.beta,speed:Math.hypot(car.body.linvel().x,car.body.linvel().z),spin:Math.max(0,(car.rearUse||0)-1)*2+Math.max(0,((s.spinV||0)-1)/4),muted:paused||onFoot,cabin:drive.inCabin});
 tunnelMix+=((s.tunnel?1:0)-tunnelMix)*(1-Math.exp(-dt*(s.tunnel?1.8:2.6)));const tunnel=tunnelMix>.5;stream.update(onFoot?walker.pos.x:x,onFoot?walker.pos.z:z);plants?.update(camera.position.x,camera.position.z);grass?.update(camera);displayCars?.update(camera.position.x,camera.position.z);sky.update(x,z,simTime,clockSeconds/3600);sky.applyLighting({sun,hemi,fog:scene.fog,position,tunnel:tunnelMix});{const n=Math.min(1,Math.max(0,(.24-sky.last.day)/.2));if(buildingMats)buildingMats.night.value=n;if(nightUniform)nightUniform.value=n;if(npcs)npcs.night=Math.max(n,tunnelMix);}
 if(vehicle.body){const braking=s.in.brake>.05||s.brake>.1||(s.v<-.2&&s.autoSel==='R');vehicle.body.tail.emissiveIntensity=braking?3.2:sky.night||tunnel?.9:.45;vehicle.body.head.emissiveIntensity=sky.night||tunnel?2.2:.6;if(vehicle.body.reverse)vehicle.body.reverse.emissiveIntensity=s.autoSel==='R'?2.6:0;if(vehicle.body.grille)vehicle.body.grille.emissiveIntensity=sky.night||tunnel?.55:0;}
 head.position.copy(position).addScaledVector(forward,2).add(V(0,.7,0));head.target.position.copy(position).addScaledVector(forward,35);head.intensity=sky.night||tunnel?90:0;
 pipeline.render();frames++;if(now-fpsTime>1000){fps=Math.round(frames*1000/(now-fpsTime));fpsTime=now;frames=0;}if(now-lastHud>60){hud();lastHud=now;}
}
/* Forza-style cluster: a round tachometer with a segmented rev arc (white,
 * amber near the limit, red past it), a red redline band, a glowing needle,
 * a shift flash, the gear large in the middle and the speed below it. */
/* The start panel (2026-10-02): how THIS engine starts, on screen until it runs.
 * Race cars: three toggles thrown in order (U O P) before the starter does
 * anything; the Sant'Agata cars: a red cover flipped up first; key cars: key
 * to ON (pumps prime), then hold it over to START. */
function startPanel(){
 {const f=$('worldFob');f.hidden=!onFoot||inWorks||paused;if(onFoot){const p=walker.pos,d=Math.hypot(p.x-x,p.z-z);$('fobDist').textContent=d<2.5?'at the car':Math.round(d)+' m to the car';const on=drive.state.engineOn||drive.state.powered;$('fobStartLbl').textContent=on?'ENGINE OFF':'REMOTE START';f.classList.toggle('running',!!on);f.classList.toggle('open',fobDoors);}}
 const el=$('worldStart'),st=drive.startInfo;if(!st)return;
 const show=!onFoot&&!inWorks&&!paused&&(st.edrive||(st.race||st.cap)&&(!(st.engineOn||st.powered)||st.cranking||performance.now()-(startPanel.ran||0)<1800));
 if(st.engineOn||st.powered){if(!startPanel.wasOn)startPanel.ran=performance.now();startPanel.wasOn=true;}else startPanel.wasOn=false;
 el.hidden=!show;if(!show)return;
 el.classList.toggle('race',st.race&&!(st.engineOn&&st.edrive));el.classList.toggle('hybrid',st.edrive);{const b=el.querySelector('.ws-ev');b.classList.toggle('on',!st.ev&&(st.engineOn||false));b.classList.toggle('ev',st.ev);$('wsEvLbl').textContent=!st.powered&&!st.engineOn?'HYBRID · OFF':st.ev?'EV MODE':'ENGINE ON';}el.classList.toggle('armed',st.ready);el.classList.toggle('has-cap',st.cap);el.classList.toggle('cap-open',st.capOpen);el.classList.toggle('keyed',st.key||st.twoStage);
 el.classList.toggle('running',st.engineOn||st.powered);el.classList.toggle('cranking',st.cranking);
 for(const b of el.querySelectorAll('[data-sw]'))b.classList.toggle('on',!!st.sw[b.dataset.sw]);
 const kp=st.cranking?'start':st.acc||st.engineOn?'on':'off';for(const k of el.querySelectorAll('[data-k]'))k.classList.toggle('on',k.dataset.k===kp);
 const next=!st.sw.master?'MASTER (U)':!st.sw.ign?'IGNITION (O)':!st.sw.pump?'FUEL PUMP (P)':null;
 $('wsHint').textContent=st.edrive&&(st.engineOn||st.powered)?(st.ev?`Silent EV · Y to ${st.fireLbl.toLowerCase()}`:'Engine running · Y for electric'):st.edrive&&!st.race&&!st.cap?'Hybrid: Y boots silent EV, I starts the engine':st.engineOn||st.powered?'Running':st.cranking?'Cranking…':st.race?(next?`Race car: switches in order. Next: ${next}`:'All systems live · hold I to start')
  :st.cap&&!st.capOpen?'Press I to flip the red cover up':st.twoStage&&!st.acc?(st.key?'Press I: key to ON, let the pumps prime':'Press I once: electronics on'):'Hold I to start';
}
function drawDial(){
 const cv=$('worldSpeedometer'),ctx=cv.getContext('2d'),s=drive.state,c=drive.car,W=cv.width,cx=W/2,cy=W/2,R=W*.43;
 const mph=s.units==='mph',speed=Math.round(Math.abs(s.v)*(mph?2.23694:3.6)),red=c.max||7000,top=Math.ceil((red+400)/1000)*1000;
 const rpm=clamp(s.rpm||0,0,top),a0=Math.PI*.75,a1=Math.PI*2.25,ang=v=>a0+(a1-a0)*v/top,now=performance.now();
 ctx.clearRect(0,0,W,W);
 // Backdrop: a dark disc with a soft edge, so it reads over sky or road.
 const bg=ctx.createRadialGradient(cx,cy,R*.2,cx,cy,R*1.18);bg.addColorStop(0,'rgba(8,12,16,.72)');bg.addColorStop(.82,'rgba(8,12,16,.55)');bg.addColorStop(1,'rgba(8,12,16,0)');
 ctx.fillStyle=bg;ctx.beginPath();ctx.arc(cx,cy,R*1.18,0,Math.PI*2);ctx.fill();
 // Track and redline band.
 ctx.lineCap='butt';ctx.lineWidth=R*.075;ctx.strokeStyle='rgba(255,255,255,.08)';ctx.beginPath();ctx.arc(cx,cy,R*.9,a0,a1);ctx.stroke();
 ctx.strokeStyle='rgba(235,52,40,.85)';ctx.beginPath();ctx.arc(cx,cy,R*.9,ang(red),a1);ctx.stroke();
 // Rev arc, in segments like an LED bar.
 const segs=48,lit=rpm/top*segs;
 for(let k=0;k<segs;k++){if(k>=lit)break;const u=k/segs,v=u*top,b0=a0+(a1-a0)*u+.006,b1=a0+(a1-a0)*(k+1)/segs-.006;
  ctx.strokeStyle=v>=red?'#ff3b2f':v>=red*.82?'#ffb23a':'#f4f6f2';ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=v>=red*.82?14:6;
  ctx.beginPath();ctx.arc(cx,cy,R*.9,b0,b1);ctx.stroke();}
 ctx.shadowBlur=0;
 // Ticks and numerals (x1000).
 for(let v=0;v<=top;v+=250){const a=ang(v),major=v%1000===0,r0=R*(major?.76:.8),r1=R*.84;
  ctx.strokeStyle=v>=red?'#ff5a4a':major?'rgba(255,255,255,.95)':'rgba(255,255,255,.45)';ctx.lineWidth=major?R*.022:R*.01;
  ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r0,cy+Math.sin(a)*r0);ctx.lineTo(cx+Math.cos(a)*r1,cy+Math.sin(a)*r1);ctx.stroke();
  if(major){ctx.fillStyle=v>=red?'#ff6b5a':'rgba(240,244,238,.9)';ctx.font=`600 ${R*.12}px Outfit, Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(v/1000),cx+Math.cos(a)*R*.64,cy+Math.sin(a)*R*.64);}}
 // Needle.
 const na=ang(rpm);ctx.save();ctx.translate(cx,cy);ctx.rotate(na);ctx.shadowColor='#ff6a2a';ctx.shadowBlur=18;
 const ng=ctx.createLinearGradient(0,0,R*.93,0);ng.addColorStop(0,'rgba(255,90,40,0)');ng.addColorStop(.35,'#ff6a2a');ng.addColorStop(1,'#ffd0a0');
 ctx.fillStyle=ng;ctx.beginPath();ctx.moveTo(R*.22,-R*.016);ctx.lineTo(R*.95,-R*.005);ctx.lineTo(R*.95,R*.005);ctx.lineTo(R*.22,R*.016);ctx.closePath();ctx.fill();ctx.restore();ctx.shadowBlur=0;
 // Shift flash: the whole outer ring pulses near the limiter.
 if(rpm>red*.95&&Math.floor(now/70)%2){ctx.strokeStyle='rgba(255,70,50,.9)';ctx.lineWidth=R*.03;ctx.shadowColor='#ff3b2f';ctx.shadowBlur=24;ctx.beginPath();ctx.arc(cx,cy,R*1.0,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;}
 // Gear, in a ring.
 const gear=s.mode==='auto'?(s.autoSel==='D'?String(s.autoGear||1):s.autoSel):String(s.gear||'N');
 ctx.strokeStyle='rgba(255,255,255,.14)';ctx.lineWidth=R*.012;ctx.beginPath();ctx.arc(cx,cy,R*.3,0,Math.PI*2);ctx.stroke();
 ctx.fillStyle=rpm>red*.95?'#ff5a4a':'#ffffff';ctx.font=`700 ${R*.36}px Outfit, Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(gear,cx,cy+R*.02);
 // Speed and units, below.
 ctx.fillStyle='#ffffff';ctx.font=`600 ${R*.3}px Outfit, Arial`;ctx.fillText(String(speed),cx,cy+R*.58);
 ctx.fillStyle='rgba(235,240,232,.6)';ctx.font=`600 ${R*.075}px Outfit, Arial`;ctx.fillText(mph?'MPH':'KM/H',cx,cy+R*.8);
 ctx.fillStyle='rgba(235,240,232,.45)';ctx.font=`600 ${R*.06}px Outfit, Arial`;ctx.fillText('RPM ×1000',cx,cy-R*.46);
 // Tunnel / assist state, a small tag at the bottom.
 if(s.tunnel){ctx.fillStyle='rgba(255,200,120,.8)';ctx.font=`600 ${R*.06}px Outfit, Arial`;ctx.fillText('TUNNEL',cx,cy+R*.96);}
}
/* The map: world/atlas.js draws it from the road network (the minimap
 * heading-up round the car, the atlas north-up with pan and zoom). */
function mapView(canvas,full){
 const w=canvas.width,h=canvas.height;
 if(full){const mpp=Math.max(15360/w,10240/h)/mapZoom;return {cx:mapCenter.x,cz:mapCenter.z,mpp,rot:0,w,h,route:navPath,car:{x,z,heading},dest:destination,hover:mapHover,selected:mapSel,issues:mapIssues};}
 const mpp=2.4+Math.min(3.2,Math.abs(drive.state.v)*.07),ahead=h*.18*mpp;
 return {cx:x+Math.sin(heading)*ahead,cz:z+Math.cos(heading)*ahead,mpp,rot:heading-Math.PI,w,h,route:navPath,car:{x,z,heading},dest:destination};
}
function drawMap(canvas,full=false){
 if(!atlasMap)return;
 if(full){const rect=canvas.getBoundingClientRect();if(rect.width&&rect.height){const W=Math.round(rect.width*1.5),H=Math.round(rect.height*1.5);if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}}}
 const view=mapView(canvas,full);if(full)lastMapView=view;
 atlasMap.draw(canvas.getContext('2d'),view);
 if(!full){const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,vig=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.3,w/2,h/2,Math.max(w,h)*.7);vig.addColorStop(0,'rgba(8,14,18,0)');vig.addColorStop(1,'rgba(8,14,18,.75)');ctx.fillStyle=vig;ctx.fillRect(0,0,w,h);}
}
const NAV_GLYPH={left:'↰',right:'↱','keep-left':'↖','keep-right':'↗',uturn:'↶','ramp-left':'↖','ramp-right':'↗',merge:'⤴',arrive:'◉'};
const fmtDist=m=>m>=1000?(m/1000).toFixed(1)+' km':m>=100?Math.round(m/10)*10+' m':Math.max(0,Math.round(m))+' m';
/** Where the car goes on fast travel: the nearest road to (px, pz), facing along it. */
function travelTo(px,pz,label){
 const fade=$('worldFade');fade.classList.add('on');closeMenu();
 {const h=HOMES.find(q=>q.name===label);if(h){setTimeout(()=>{spawnHome(h.id);setTimeout(()=>fade.classList.remove('on'),600);},420);return;}}
 if(onFoot){walker.leave();onFoot=false;document.body.classList.remove('on-foot');if(document.pointerLockElement)document.exitPointerLock();}
 setTimeout(()=>{const r=roadAt(px,pz);if(r){hit=r;const sec=model.sectionAt(r.seg,Math.min(Math.max(r.s,r.seg.cut[0]+4),r.seg.L-r.seg.cut[1]-4)),off=r.seg.kind==='freeway'?7.6:Math.min(1.9,sec.h*.45);
  x=sec.x+sec.nx*off;z=sec.z+sec.nz*off;y=sec.y;heading=Math.atan2(sec.tx,sec.tz);stream.update(x,z,1e9);car.place(x,y+.3,z,heading);steer=keySteer=0;steering.reset();cameraHeading=heading;orbit=orbitTarget=0;drive.resetMotion();drive.release();drive.setTunnel(r.seg.kind==='tunnel');
  camera.position.set(x-Math.sin(heading)*8,y+3,z-Math.cos(heading)*8);camOffset.set(-Math.sin(heading)*8,3,-Math.cos(heading)*8);}
  setTimeout(()=>{fade.classList.remove('on');notify('Fast travel · '+(label||'Los Santerra'));},700);},420);
}
function setDestination(d){destination=d;if(d){nav.set(d);notify('Route set · '+d.name);}else nav.clear();navPath=[];}
/** A name for any point on the map: the nearest road and its district. */
function describePoint(px,pz){const r=net.nearest(px,pz);return {name:r?.edge.name||'Open country',district:r?.edge.district||'Los Santerra'};}
function hud(){const s=drive.state,c=drive.car;if(c&&c.id!==hud.lastCar){hud.lastCar=c.id;const mb=modelForSound(c.id);if(mb){try{localStorage.setItem('dwnSound:'+mb,c.id);}catch{}if(mb!==savedModel())setModel(mb);}}{const pr=$('worldPrompt');let t='';if(onFoot){t=Math.hypot(walker.pos.x-x,walker.pos.z-z)<4.5?'<kbd>F</kbd> GET IN':'<kbd>W A S D</kbd> WALK · <kbd>SHIFT</kbd> RUN · <kbd>SPACE</kbd> JUMP · '+(document.pointerLockElement?'MOUSE TO LOOK':'CLICK TO LOOK');}else if(inBay())t='<kbd>E</kbd> ENTER DWN WORKS';else if(loaded&&!inWorks&&WORKSHOP.bay&&Math.hypot(x-WORKSHOP.bay.x,z-WORKSHOP.bay.z)<14&&Math.abs(drive.state.v)<8)t='DWN WORKS · STOP ON THE BLUE RING';else if(loaded&&stillT>2)t='<kbd>F</kbd> STEP OUT';if(pr.dataset.t!==t){pr.dataset.t=t;pr.innerHTML=t;pr.hidden=!t;}}$('worldDistrict').textContent=raceVenue==='drag'?'Eastside Dragway':raceVenue==='circuit'?'Pacific Raceway':hit?.edge.district||'Los Santerra';$('worldStreet').textContent=raceVenue==='drag'?'Quarter-mile strip':raceVenue==='circuit'?'Circuit':hit?.edge.name||'Open country';$('worldTime').textContent=clock();$('worldClock').textContent=clock();$('worldCar').textContent=c.name;$('worldEngine').textContent=s.engineOn?s.mode.toUpperCase()+' · ENGINE RUNNING':s.cranking?'STARTING…':s.powered?'ELECTRIC DRIVE':'HOLD I TO START';$('worldSpeed').textContent=Math.round(Math.abs(s.v)*(s.units==='mph'?2.23694:3.6));$('worldUnit').textContent=s.units==='mph'?'MPH':'KM/H';$('worldGear').textContent=s.mode==='auto'?(s.autoSel==='D'?s.autoGear:s.autoSel):(s.gear||'N');$('worldRpm').textContent=(s.rpm/1000).toFixed(1);$('worldRev').style.width=Math.min(100,s.rpm/c.max*100)+'%';$('worldTraction').textContent=s.tunnel?'TUNNEL ACOUSTICS':assist?'STEERING ASSIST':(car?.drifting>.5&&Math.abs(s.v)>5?'DRIFT · '+Math.round(Math.abs(car.beta)*57.3)+'°':HANDLING[car?.modeId]?.label.toUpperCase()+' HANDLING');$('worldNext').textContent=navInfo?.text||'Choose your own road';$('worldDistance').textContent=navInfo?fmtDist(navInfo.dist):'N ↑';$('worldNavGlyph').textContent=navInfo?NAV_GLYPH[navInfo.dir]||'↑':'';$('worldNavTitle').textContent=destination?(destination.name.toUpperCase()+' · '+fmtDist(navInfo?.remaining??0)):'EXPLORE LOS SANTERRA';$('worldQuickGear').hidden=s.mode!=='auto';document.querySelectorAll('[data-selector]').forEach(b=>b.classList.toggle('chosen',b.dataset.selector===s.autoSel));startPanel();drawDial();drawMap($('worldMap'));if($('worldAtlas'))drawMap($('worldAtlas'),true);}
function pause(on){paused=on;keys.clear();keySteer=0;drive.release();drive.pauseAudio(on);}
function openMenu(page='drive'){if(document.pointerLockElement)document.exitPointerLock();pause(true);if(!$('worldDialog').open)$('worldDialog').showModal();panel(page);}
function closeMenu(){if(!loaded)return;$('worldDialog').close();pause(false);}
function panel(page){tab=page;document.querySelectorAll('.world-tabs button').forEach(b=>b.classList.toggle('selected',b.dataset.tab===page));$('worldDialog').classList.toggle('map-mode',page==='map');const p=$('worldPanel');
 if(page==='drive'){p.innerHTML=`<div class="world-intro"><span class="world-eyebrow">LOS SANTERRA / SOUTHERN CALIFORNIA</span><h3>Every road leads somewhere.</h3><p>From the Sunset Strip to Pasadena's historic avenues.<br>Find a destination, take a turn, and make the drive your own.</p><div class="world-route"><span>West Hollywood</span><i>·</i><span>Beverly Hills</span><i>·</i><span>Pasadena</span><i>·</i><span>San Marino</span></div><button class="world-primary" id="worldResume">CONTINUE DRIVE &nbsp; ↗</button><div class="world-homes"><span class="world-eyebrow">YOUR HOMES · START HERE</span><div>${HOMES.map(h=>`<button data-home="${h.id}" class="${savedHome()===h.id?'chosen':''}"><b>${h.name}</b><small>${h.blurb}</small></button>`).join('')}</div></div><p class="world-tip">Hold <b>I</b> for ignition, select <b>D</b>, then use <b>W / S</b> and <b>A / D</b> or arrows. Drag the scene to look around. <b>Tab</b> opens the map.</p><div class="world-selectors"><label>Transmission<select id="worldTransmission"><option value="auto">Automatic</option><option value="manual">Sequential manual</option><option value="clutch">Manual + clutch</option></select></label><label>Selector<select id="worldSelector"><option>P</option><option>R</option><option>N</option><option>D</option></select></label></div></div>`;
  $('worldResume').onclick=closeMenu;document.querySelectorAll('[data-home]').forEach(b=>b.onclick=()=>{const fade=$('worldFade');fade.classList.add('on');closeMenu();setTimeout(()=>{spawnHome(b.dataset.home);setTimeout(()=>fade.classList.remove('on'),600);},420);});$('worldTransmission').value=drive.state.mode;$('worldTransmission').onchange=e=>{drive.setMode(e.target.value);panel('drive');};$('worldSelector').value=drive.state.autoSel;$('worldSelector').disabled=drive.state.mode!=='auto';$('worldSelector').onchange=e=>{drive.select(e.target.value);e.target.value=drive.state.autoSel;};
 }else if(page==='map'){
  const here=describePoint(x,z);
  p.innerHTML=`<div class="atlas-wrap"><div class="atlas-stage"><canvas id="worldAtlas" aria-label="Map of Los Santerra"></canvas>
   <div class="atlas-legend">${CLASSES.map(c=>`<span><i style="--c:${c.color}" class="${c.dash?'dash':''}"></i>${c.label}</span>`).join('')}<span><i class="pin"></i>Places</span><label class="atlas-issues"><input type="checkbox" id="atlasIssues" ${mapIssues?'checked':''}> Dead ends</label></div>
   <div class="atlas-zoom"><button id="worldZoomIn" aria-label="Zoom in">+</button><button id="worldZoomOut" aria-label="Zoom out">−</button><button id="worldMapMe" aria-label="Centre on car" title="Centre on car">◎</button><button id="worldMapFit" aria-label="Whole map" title="Whole map">⤢</button></div>
   <div class="atlas-card" id="atlasCard" hidden></div>
   <div class="atlas-hint">Click a place or any road · double-click to fast travel · drag to pan · scroll to zoom</div></div>
   <aside class="atlas-side"><div class="atlas-here"><span class="world-eyebrow">YOU ARE IN</span><b>${here.district}</b><small>${here.name}</small></div>
   <div class="atlas-route" id="atlasRoute">${destination?`<span class="world-eyebrow">ROUTE</span><b>${destination.name}</b><small>${navInfo?fmtDist(navInfo.remaining)+' to go':'calculating…'}</small><button id="worldClearRoute">END ROUTE</button>`:'<span class="world-eyebrow">NO ROUTE</span><small>Choose a destination on the map or below.</small>'}</div>
   <span class="world-eyebrow atlas-h">PLACES</span><div class="atlas-list" id="atlasPlaces"></div>
   <span class="world-eyebrow atlas-h">DISTRICTS</span><div class="atlas-list" id="atlasDistricts"></div></aside></div>`;
  const atlas=$('worldAtlas'),card=$('atlasCard');$('atlasIssues').onchange=e=>{mapIssues=e.target.checked;drawMap(atlas,true);};
  const item=(list,d,sub)=>{const row=document.createElement('div');row.className='atlas-item'+(destination?.name===d.name?' chosen':'');const km=fmtDist(Math.hypot(d.x-x,d.z-z));
   row.innerHTML=`<div><b>${d.name}</b><small>${sub} · ${km}</small></div><button class="go">ROUTE</button><button class="tp">TRAVEL</button>`;
   row.querySelector('.go').onclick=()=>{setDestination({name:d.name,x:d.x,z:d.z});panel('map');};row.querySelector('.tp').onclick=()=>travelTo(d.x,d.z,d.name);
   row.onmouseenter=()=>{mapHover=d;drawMap(atlas,true);};row.onmouseleave=()=>{mapHover=null;drawMap(atlas,true);};list.append(row);};
  const byDist=a=>[...a].sort((p,q)=>Math.hypot(p.x-x,p.z-z)-Math.hypot(q.x-x,q.z-z));
  for(const pl of byDist(atlasMap.places))item($('atlasPlaces'),pl,pl.kind==='landmark'?'Landmark':pl.kind[0].toUpperCase()+pl.kind.slice(1));
  for(const d of byDist(atlasMap.districts.filter(d=>!d.hills)))item($('atlasDistricts'),{...d,name:d.name.replace(/\B\w+/g,w=>w.toLowerCase())},'District');
  if($('worldClearRoute'))$('worldClearRoute').onclick=()=>{setDestination(null);panel('map');};
  const showCard=d=>{mapSel=d;if(!d){card.hidden=true;drawMap(atlas,true);return;}card.hidden=false;
   card.innerHTML=`<span class="world-eyebrow">${d.kind?d.kind.toUpperCase():d.district.toUpperCase()}</span><b>${d.name}</b><small>${fmtDist(Math.hypot(d.x-x,d.z-z))} away</small><div><button id="cardRoute">SET ROUTE</button><button id="cardTravel" class="world-primary">FAST TRAVEL</button></div>`;
   $('cardRoute').onclick=()=>{setDestination({name:d.name,x:d.x,z:d.z});panel('map');};$('cardTravel').onclick=()=>travelTo(d.x,d.z,d.name);drawMap(atlas,true);};
  const pick=e=>{const r=atlas.getBoundingClientRect(),sx=(e.clientX-r.left)*atlas.width/r.width,sy=(e.clientY-r.top)*atlas.height/r.height;const pl=atlasMap.placeAt(lastMapView,sx,sy,18);if(pl)return pl;const [wx,wz]=atlasMap.toWorld(lastMapView,sx,sy),road=net.nearest(wx,wz);if(!road||road.distance>80)return null;const d=describePoint(road.p.x,road.p.z);return {name:d.name,district:d.district,x:road.p.x,z:road.p.z};};
  $('worldZoomIn').onclick=()=>{mapZoom=clamp(mapZoom*1.4,1,40);drawMap(atlas,true);};$('worldZoomOut').onclick=()=>{mapZoom=clamp(mapZoom/1.4,1,40);drawMap(atlas,true);};
  $('worldMapFit').onclick=()=>{mapZoom=1;mapCenter={x:0,z:0};drawMap(atlas,true);};$('worldMapMe').onclick=()=>{mapZoom=Math.max(mapZoom,6);mapCenter={x,z};drawMap(atlas,true);};
  atlas.onwheel=e=>{e.preventDefault();const r=atlas.getBoundingClientRect(),sx=(e.clientX-r.left)*atlas.width/r.width,sy=(e.clientY-r.top)*atlas.height/r.height,[wx,wz]=atlasMap.toWorld(lastMapView,sx,sy);
   const z0=mapZoom;mapZoom=clamp(mapZoom*(e.deltaY<0?1.15:1/1.15),1,40);const k=z0/mapZoom;mapCenter={x:wx+(mapCenter.x-wx)*k,z:wz+(mapCenter.z-wz)*k};drawMap(atlas,true);};
  let start=null,moved=0;atlas.onpointerdown=e=>{start={x:e.clientX,y:e.clientY};moved=0;atlas.setPointerCapture(e.pointerId);};
  atlas.onpointermove=e=>{if(!start){const r=atlas.getBoundingClientRect(),pl=atlasMap.placeAt(lastMapView,(e.clientX-r.left)*atlas.width/r.width,(e.clientY-r.top)*atlas.height/r.height,18);if(pl!==mapHover){mapHover=pl;atlas.style.cursor=pl?'pointer':'grab';drawMap(atlas,true);}return;}
   const r=atlas.getBoundingClientRect(),k=lastMapView.mpp*atlas.width/r.width;mapCenter={x:mapCenter.x-(e.clientX-start.x)*k,z:mapCenter.z-(e.clientY-start.y)*k};moved+=Math.abs(e.clientX-start.x)+Math.abs(e.clientY-start.y);start={x:e.clientX,y:e.clientY};drawMap(atlas,true);};
  atlas.onpointerup=e=>{if(start&&moved<5)showCard(pick(e));start=null;};atlas.onpointercancel=()=>start=null;
  atlas.ondblclick=e=>{const d=pick(e);if(d)travelTo(d.x,d.z,d.name);};
  requestAnimationFrame(()=>drawMap(atlas,true));
 }else if(page==='garage'){p.innerHTML=`<div class="world-garage-hero"><div><span class="world-eyebrow">YOUR CAR</span><h3>Aurora</h3><p>Carbon hypercar. Wings, aero, body kits, exhausts, wheels, stance, lights and livery are fitted in person at <b>DWN Works</b> on Sunset Boulevard: drive in, stop on the blue ring, press <b>E</b>.</p></div><button class="world-primary" id="worldToWorks">TRAVEL TO DWN WORKS ↗</button></div><h4 class="world-sub">PAINT</h4><div class="world-paints"></div><h4 class="world-sub">CABIN LIGHT</h4><div class="world-paints world-ambients"></div><h4 class="world-sub">ENGINE & SOUND</h4><div class="world-garage"></div>`;const cur=modelById('aurora');
  $('worldToWorks').onclick=()=>{const m=WORKSHOP.meet;travelTo(m.x,m.z,'DWN Works');};
  for(const [name,hex] of PAINTS){const b=document.createElement('button');b.className='world-paint';b.title=name;b.style.setProperty('--paint',hex);b.classList.toggle('chosen',(savedPaint()||cur.paint)===hex);b.innerHTML=`<i></i>${name}`;b.onclick=()=>{setPaint(hex);panel('garage');};p.querySelector('.world-paints').append(b);}
  for(const [name,hex] of AMBIENTS){const b=document.createElement('button');b.className='world-paint';b.title=name;b.style.setProperty('--paint',hex);b.classList.toggle('chosen',(savedAmbient()||cur.ambient)===hex);b.innerHTML=`<i class="glow"></i>${name}`;b.onclick=()=>{setAmbient(hex);panel('garage');};p.querySelector('.world-ambients').append(b);}for(const c of drive.cars.filter(c=>cur.sounds.includes(c.id)||c.custom)){const b=document.createElement('button');b.textContent=c.name;b.classList.toggle('chosen',c.id===drive.car.id);b.onclick=()=>{setSound(c.id);panel('garage');};p.querySelector('.world-garage').append(b);}
 }else if(page==='online'){const O=online,esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const setForm=(S,dis)=>`<div class="online-form${dis?' locked':''}"><label>Traffic<input id="olTraffic" type="range" min="0" max="1" step="0.05" value="${S.traffic??npcs?.density??.5}" ${dis}><output>${trafficLabel(+(S.traffic??npcs?.density??.5))}</output></label>
   <label>Time of day<select id="olTime" ${dis}><option value="">Keep the clock</option>${TIME_PRESETS.map(t=>`<option value="${t[2]}" ${S.hour!=null&&Math.abs(S.hour-t[2])<.04?'selected':''}>${t[1]}</option>`).join('')}</select></label>
   <label>Time passes<select id="olFlow" ${dis}>${TIME_FLOWS.map(f=>`<option value="${f[0]}" ${(S.flow||timeFlow)===f[0]?'selected':''}>${f[1]}</option>`).join('')}</select></label>
   <label>Collisions between players<input id="olCollide" type="checkbox" ${S.collisions===false?'':'checked'} ${dis}></label></div>`;
  const readForm=()=>({traffic:+$('olTraffic').value,hour:$('olTime').value===''?clockSeconds/3600:+$('olTime').value,flow:$('olFlow').value,collisions:$('olCollide').checked});
  const status=O.p2p?'<span class="online-pill on">ONLINE · PEER-TO-PEER</span>':O.connected?'<span class="online-pill on">LOBBY SERVER CONNECTED</span>':O.status==='connecting'?'<span class="online-pill">CONNECTING…</span>':'<span class="online-pill off">OFFLINE</span> <button id="olRetry" class="online-mini">RETRY</button>';
  const invite=O.lobby?(O.share||location.origin+'/')+'?lobby='+O.lobby.code:'';
  queueMicrotask(()=>{olSig=onlineSig();});
  if(!O.inLobby){p.innerHTML=`<div class="online-wrap"><div class="online-top">${status}<label class="online-name">Your name<input id="olName" maxlength="20" value="${esc(O.name)}"></label></div>${O.error?`<p class="online-error">${esc(O.error)}</p>`:''}
   <div class="online-cols"><section><h4 class="world-sub">CREATE A LOBBY</h4><label class="online-field">Lobby name<input id="olLobbyName" maxlength="32" value="${esc(O.name)}'s cruise"></label><div class="online-row"><label class="online-field">Players<select id="olMax">${[2,3,4,5,6,7,8,9,10].map(n=>`<option ${n===10?'selected':''}>${n}</option>`).join('')}</select></label><label class="online-check"><input id="olPrivate" type="checkbox"> Private · code only</label></div>
    <span class="world-eyebrow">WORLD SETTINGS · YOU ARE THE HOST</span>${setForm({hour:null,collisions:true},'')}<button class="world-primary" id="olCreate">CREATE LOBBY</button></section>
   <section><h4 class="world-sub">JOIN WITH A CODE</h4><div class="online-row"><input id="olCode" class="online-code-in" maxlength="5" placeholder="ABCDE"><button id="olJoin">JOIN</button></div>
    <h4 class="world-sub">OPEN LOBBIES <button id="olRefresh" class="online-mini">REFRESH</button></h4><div class="online-list">${O.lobbies.length?O.lobbies.map(l=>`<div class="online-item"><div><b>${esc(l.name)}</b><small>${esc(l.host)} · ${l.players}/${l.max}</small></div><button data-join="${l.code}" ${l.players>=l.max?'disabled':''}>${l.players>=l.max?'FULL':'JOIN'}</button></div>`).join(''):'<p class="world-tip">No open lobbies yet. Create one, or join a private one with its code.</p>'}</div>
    <p class="world-tip">${O.p2p?`Lobbies here run in the host's browser: create one and send friends the code or the invite link (they can be anywhere). Open lobbies only list on a lobby server.`:O.shareOn?`Friends on your network open <b>${esc(O.share||location.origin)}</b>, then Menu › Online.`:`Lobbies are on this computer only. To let friends join, start the game with <b>python3 play.py --share</b> (same Wi-Fi), or put it online through a tunnel such as cloudflared.`}</p></section></div></div>`;
   $('olName').onchange=e=>O.setName(e.target.value);$('olRefresh').onclick=()=>O.refresh();if($('olRetry'))$('olRetry').onclick=()=>O.connect(true);
   $('olLobbyName').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('olCreate').click();}};
   $('olCode').oninput=e=>{const c=e.target.selectionStart;e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');try{e.target.setSelectionRange(c,c);}catch(_){}};
   $('olCode').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('olJoin').click();}};
   $('olTraffic').oninput=e=>e.target.nextElementSibling.textContent=trafficLabel(+e.target.value);
   $('olCreate').onclick=()=>{O.setName($('olName').value);O.create({name:$('olLobbyName').value,max:+$('olMax').value,private:$('olPrivate').checked,settings:readForm()});};
   $('olJoin').onclick=()=>{const c=$('olCode').value.trim().toUpperCase();if(c.length>=4){O.setName($('olName').value);O.join(c);}};
   document.querySelectorAll('[data-join]').forEach(b=>b.onclick=()=>{O.setName($('olName').value);O.join(b.dataset.join);});
   if(!O.connected&&O.status!=='connecting')O.connect();
  }else{const L=O.lobby,S=L.settings||{},host=O.isHost;
   queueMicrotask(()=>{olSig=onlineSig();});
   p.innerHTML=`<div class="online-wrap"><div class="online-lobby"><div><span class="world-eyebrow">${host?'YOUR LOBBY · YOU ARE THE HOST':'LOBBY'}${L.private?' · PRIVATE':''}</span><h3>${esc(L.name)}</h3><small>${L.players.length}/${L.max} drivers · press <b>Enter</b> in the world to chat</small></div><div class="online-code"><span class="world-eyebrow">INVITE CODE</span><b>${L.code}</b><button id="olCopy">COPY INVITE LINK</button></div></div>
    <div class="online-cols"><section><h4 class="world-sub">DRIVERS</h4><div class="online-list">${L.players.map(pl=>`<div class="online-item"><i class="online-dot" style="background:${O.color(pl.id)}"></i><div><b>${esc(pl.name)}${pl.id===O.id?' <em>YOU</em>':''}${pl.id===L.host?' <em class="host">HOST</em>':''}</b><small>Aurora · ${esc(pl.build?.name||'Factory')}</small></div>${pl.id!==O.id?`<button data-goto="${pl.id}">GO TO</button>`:''}${host&&pl.id!==O.id?`<button data-kick="${pl.id}" class="online-mini">KICK</button>`:''}</div>`).join('')}</div>
     <h4 class="world-sub">CAR MEET</h4>${S.meet?`<div class="online-item"><div><b>${esc(S.meet.name)}</b><small>${fmtDist(Math.hypot(S.meet.x-x,S.meet.z-z))} away</small></div><button id="olMeetRoute">ROUTE</button><button id="olMeetGo">TRAVEL</button></div>`:`<p class="world-tip">${host?'Pick a spot and everyone gets a route to it.':'The host has not set a meet point.'}</p>`}
     ${host?`<div class="online-row"><button id="olMeetHere">MEET AT MY LOCATION</button><button id="olMeetWorks">MEET AT DWN WORKS</button>${S.meet?'<button id="olMeetClear" class="online-mini">CLEAR</button>':''}</div>`:''}</section>
    <section><h4 class="world-sub">WORLD SETTINGS ${host?'':'<small>· SET BY THE HOST</small>'}</h4>${setForm(S,host?'':'disabled')}<button id="olLeave" class="online-leave">LEAVE LOBBY</button></section></div></div>`;
   $('olCopy').onclick=()=>{navigator.clipboard?.writeText(invite).then(()=>notify('Invite link copied · '+invite),()=>notify('Invite · '+invite));};
   $('olLeave').onclick=()=>{O.leave();lobbySet={};notify('Left the lobby');panel('online');};
   document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>{const pe=O.peers.get(b.dataset.goto),st=pe&&O.sample(pe,performance.now()/1000);if(st)travelBehind(st,pe.name);else notify('Waiting for their position…');});
   document.querySelectorAll('[data-kick]').forEach(b=>b.onclick=()=>O.kick(b.dataset.kick));
   if($('olMeetRoute'))$('olMeetRoute').onclick=()=>{setDestination({name:'Meet · '+S.meet.name,x:S.meet.x,z:S.meet.z});closeMenu();};
   if($('olMeetGo'))$('olMeetGo').onclick=()=>travelTo(S.meet.x,S.meet.z,'Meet · '+S.meet.name);
   if(host){const push=()=>O.setSettings({...S,...readForm()});
    $('olTraffic').oninput=e=>{e.target.nextElementSibling.textContent=trafficLabel(+e.target.value);};$('olTraffic').onchange=push;$('olTime').onchange=push;$('olFlow').onchange=push;$('olCollide').onchange=push;
    $('olMeetHere').onclick=()=>{const d=describePoint(x,z);O.setSettings({...S,meet:{x:+x.toFixed(1),z:+z.toFixed(1),name:d.name+' · '+d.district}});};
    $('olMeetWorks').onclick=()=>O.setSettings({...S,meet:{x:WORKSHOP.meet.x,z:WORKSHOP.meet.z,name:'DWN Works · Sunset Boulevard'}});
    if($('olMeetClear'))$('olMeetClear').onclick=()=>{const {meet,...rest}=S;void meet;O.setSettings(rest);setDestination(null);};}}
 }else if(page==='sound'){const values=drive.sound();p.innerHTML='<h3 id="worldSoundCar"></h3><p class="world-tip">Saved separately for every car, through your original sound workshop.</p><div class="world-settings" id="worldSound"></div><button id="worldWorkshop">OPEN FULL SOUND WORKSHOP ↗</button>';$('worldSoundCar').textContent=drive.car.name;for(const[key,title,id]of[['vol','Engine level','wsVol'],['pitch','Engine pitch','wsPitch'],['tone','Exhaust tone','wsTone']]){const src=$(id),label=document.createElement('label');label.textContent=title;const input=document.createElement('input');input.type='range';input.min=src.min;input.max=src.max;input.step=src.step;input.value=values[key];const out=document.createElement('output');out.textContent=values[key];input.oninput=()=>{drive.tune(key,+input.value);out.textContent=input.value;};label.append(input,out);$('worldSound').append(label);}$('worldWorkshop').onclick=()=>{$('worldDialog').close();pause(true);drive.openWorkshop();};
 }else{p.innerHTML=`<div class="world-settings"><label>Time of day<select id="worldLighting">${TIME_PRESETS.map(p=>`<option value="${p[0]}">${p[1]}</option>`).join('')}<option value="custom" hidden>Custom</option></select></label><label>Hour<input id="worldHour" type="range" min="0" max="23.95" step="0.05" value="${(clockSeconds/3600).toFixed(2)}"><output id="worldHourOut">${clock()}</output></label><label>Time passes<select id="worldFlow">${TIME_FLOWS.map(f=>`<option value="${f[0]}">${f[1]}</option>`).join('')}</select></label><label>Rendering<select id="worldQuality"><option value="balanced">Balanced · 1.5×</option><option value="high">High · 2×</option><option value="low">Performance · 1×</option></select></label><label>Camera<select id="worldCamSel">${CAMS.map((c,i)=>`<option value="${i}">${c.name[0]+c.name.slice(1).toLowerCase()}</option>`).join('')}</select></label><label>Speed effects<input id="worldSpeedFx" type="range" min="0" max="1.5" step="0.05" value="${speedFx}"></label><label>Camera shake<input id="worldShake" type="range" min="0" max="2" step="0.1" value="${shakeFx}"></label><label>Traffic<input id="worldTraffic" type="range" min="0" max="1" step="0.05" value="${npcs?.density??savedTraffic()}"><output id="worldTrafficOut">${trafficLabel(npcs?.density??savedTraffic())}</output></label><label>Steering sensitivity<input id="worldSensitivity" type="range" min="0.5" max="1.6" step="0.05" value="${steering.sensitivity}"></label><label>Handling<select id="worldHandling">${Object.entries(HANDLING).map(([k,m])=>`<option value="${k}">${m.label}</option>`).join('')}</select></label><label>Traction control<input id="worldTC" type="checkbox" ${savedTC()?'checked':''}></label><label>Stability assist<input id="worldYaw" type="range" min="0" max="1" step="0.05" value="${yawAssist}"></label><label>Countersteer assist<input id="worldCounter" type="range" min="0" max="1" step="0.05" value="${steering.counter}"></label><label>Steering assistance<input id="worldAssist" type="checkbox" ${assist?'checked':''}></label><p class="world-tip">Assistance follows your selected route or continues through the next junction. Brake before tight turns. Drag to orbit the camera, scroll to zoom, double-click to reset. <b>X</b> changes camera, hold <b>Z</b> to look back.</p><button id="worldReset">RECOVER TO NEAREST ROAD</button><button id="worldOnline">ONLINE LOBBIES · CREATE OR JOIN ↗</button></div>`;$('worldOnline').onclick=()=>panel('online');if(online?.inLobby&&!online.isHost)for(const id of ['worldLighting','worldHour','worldFlow','worldTraffic'])$(id).disabled=true;$('worldLighting').value=timeOfDay;$('worldLighting').onchange=e=>{setTimeOfDay(e.target.value);$('worldHour').value=clockSeconds/3600;$('worldHourOut').textContent=clock();};$('worldHour').oninput=e=>{setHour(+e.target.value);$('worldHourOut').textContent=clock();$('worldLighting').value=timeOfDay;};$('worldFlow').value=timeFlow;$('worldFlow').onchange=e=>timeFlow=e.target.value;$('worldQuality').value=quality;$('worldQuality').onchange=e=>{quality=e.target.value;renderer.setPixelRatio(Math.min(devicePixelRatio,quality==='high'?2:quality==='low'?1:1.5));};$('worldSensitivity').oninput=e=>steering.sensitivity=+e.target.value;$('worldHandling').value=savedHandling();$('worldHandling').onchange=e=>{try{localStorage.setItem('dwnHandling',e.target.value);}catch{}car.setMode(e.target.value);notify('Handling · '+HANDLING[e.target.value].label+({grip:' · planted, slides on the handbrake',drift:' · throttle and steering hold the angle',sim:' · fewer aids, real consequences'}[e.target.value]));};$('worldTC').onchange=e=>{try{localStorage.setItem('dwnTC',e.target.checked?'on':'off');}catch{}car.tc=e.target.checked;notify('Traction control · '+(e.target.checked?'on':'off · the rear will step out under power'));};$('worldTraffic').oninput=e=>{const d=+e.target.value;npcs?.setDensity(d);$('worldTrafficOut').textContent=trafficLabel(d);try{localStorage.setItem('dwnTraffic',d);}catch{}};$('worldCamSel').value=cameraMode;$('worldCamSel').onchange=e=>{cameraMode=+e.target.value-1;cycleCamera(1);};$('worldSpeedFx').oninput=e=>speedFx=+e.target.value;$('worldShake').oninput=e=>shakeFx=+e.target.value;$('worldYaw').oninput=e=>{yawAssist=+e.target.value;car.yawAssist=yawAssist;};$('worldCounter').oninput=e=>steering.counter=+e.target.value;$('worldAssist').onchange=e=>assist=e.target.checked;$('worldReset').onclick=()=>{spawn();closeMenu();};}
}
$('worldMenu').onclick=()=>openMenu();$('worldMapButton').onclick=$('worldExpandMap').onclick=()=>openMenu('map');$('worldClose').onclick=closeMenu;$('worldDialog').addEventListener('cancel',e=>{e.preventDefault();closeMenu();});document.querySelectorAll('.world-tabs button').forEach(b=>b.onclick=()=>panel(b.dataset.tab));$('worldNight').onclick=()=>{const i=TIME_PRESETS.findIndex(p=>p[0]===timeOfDay);setTimeOfDay(TIME_PRESETS[(i+1)%TIME_PRESETS.length][0]);};$('worldCamera').onclick=()=>cycleCamera(1);$('worldReturn').onclick=()=>{if(!loaded)return;active=true;document.body.classList.add('world-active');$('worldReturn').hidden=true;openMenu();};document.querySelectorAll('[data-selector]').forEach(b=>b.onclick=()=>drive.select(b.dataset.selector));
function cycleCamera(d){cameraMode=(cameraMode+d+CAMS.length)%CAMS.length;cineAnchor=null;orbit=orbitTarget=0;$('worldCamera').textContent='CAMERA · '+CAMS[cameraMode].name;notify('Camera · '+CAMS[cameraMode].name.toLowerCase()+'  ·  X to change, Z to look back');}
const steeringKeys=['KeyA','KeyD','ArrowLeft','ArrowRight'];
window.addEventListener('keydown',e=>{if(!active)return;if(online?.typing)return;if(e.code==='KeyH'&&!e.shiftKey&&!onFoot&&!inWorks&&!paused&&!e.target.matches?.('input,textarea')){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)drive.horn?.(true);return;}if(!e.repeat&&e.code==='KeyY'&&!onFoot&&!inWorks&&drive.startInfo?.edrive&&!e.target.matches?.('input,textarea')){e.preventDefault();e.stopImmediatePropagation();drive.toggleEdrive();return;}if(!e.repeat&&!onFoot&&!inWorks&&['KeyU','KeyO','KeyP'].includes(e.code)&&drive.startInfo?.race&&!e.target.matches?.('input,textarea')){e.preventDefault();e.stopImmediatePropagation();drive.raceSwitch({KeyU:'master',KeyO:'ign',KeyP:'pump'}[e.code]);return;}if(e.code==='Enter'&&!paused&&!inWorks&&online?.inLobby&&!e.target.matches('input,select,textarea')){e.preventDefault();e.stopImmediatePropagation();keys.clear();online.openChat();return;}if(inWorks){if(e.code==='Escape'||e.code==='Enter'){e.preventDefault();e.stopImmediatePropagation();exitWorks();}else if(!e.target.matches('input,select,textarea'))e.stopImmediatePropagation();return;}if(e.code==='KeyE'&&!e.repeat&&!paused&&inBay()&&!e.target.matches('input,select,textarea')){e.preventDefault();e.stopImmediatePropagation();enterWorks();return;}if(e.code==='Escape'){e.preventDefault();e.stopImmediatePropagation();if($('workshop').classList.contains('open')){drive.closeWorkshop();pause(false);}else if($('worldDialog').open)closeMenu();else openMenu();return;}if(e.target.matches('input,select,textarea'))return;if(e.code==='Tab'&&!paused){e.preventDefault();e.stopImmediatePropagation();openMenu('map');return;}if(paused){e.stopImmediatePropagation();return;}if(steeringKeys.includes(e.code)){keys.add(e.code);e.preventDefault();e.stopImmediatePropagation();}if(e.code==='Space'&&drive.state.mode!=='clutch'){keys.add('Space');e.preventDefault();e.stopImmediatePropagation();}if(e.code==='KeyT'){e.preventDefault();e.stopImmediatePropagation();}if(e.code==='KeyX'&&!e.repeat){e.preventDefault();e.stopImmediatePropagation();cycleCamera(e.shiftKey?-1:1);}if(e.code==='KeyZ'){e.preventDefault();e.stopImmediatePropagation();lookBack=true;}if(e.code==='KeyF'&&!e.repeat){e.preventDefault();e.stopImmediatePropagation();toggleOnFoot();return;}if(onFoot&&!e.repeat&&(e.code==='KeyO'||e.code==='KeyR')){e.preventDefault();e.stopImmediatePropagation();if(e.code==='KeyO')fobToggleDoors();else fobRemoteStart();return;}if(onFoot&&['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space','KeyQ','KeyE','KeyI'].includes(e.code)){keys.add(e.code);e.preventDefault();e.stopImmediatePropagation();return;}if(!e.repeat&&(e.code==='Comma'||e.code==='Period'||e.code==='Slash')){e.preventDefault();e.stopImmediatePropagation();carFx?.setSignal(e.code==='Comma'?'left':e.code==='Period'?'right':'hazard');}if(e.code==='KeyV'&&!e.repeat){e.preventDefault();e.stopImmediatePropagation();const ci=CAMS.findIndex(c=>c.cockpit);if(cameraMode===ci){cameraMode=lastExterior??0;}else{lastExterior=cameraMode;cameraMode=ci;}cycleCamera(0);}},true);
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='KeyH'){drive.horn?.(false);if(!e.shiftKey){e.preventDefault();e.stopImmediatePropagation();return;}}if(onFoot&&['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();return;}if(e.code==='KeyZ')lookBack=false;if(e.code==='Space'&&active&&drive.state.mode!=='clutch'){e.preventDefault();e.stopImmediatePropagation();}if(active&&steeringKeys.includes(e.code)){e.preventDefault();e.stopImmediatePropagation();}},true);
$('worldCanvas').addEventListener('pointerdown',e=>{if(paused)return;if(onFoot&&!document.pointerLockElement){try{$('worldCanvas').requestPointerLock()?.catch?.(()=>{});}catch(_){}}dragging=true;dragX=e.clientX;dragY=e.clientY;$('worldCanvas').setPointerCapture(e.pointerId);});document.addEventListener('mousemove',e=>{if(onFoot&&document.pointerLockElement===$('worldCanvas')){walkYaw-=e.movementX*.0023;fpPitch=clamp(fpPitch-e.movementY*.0023,-1.35,1.35);}});$('worldCanvas').addEventListener('pointermove',e=>{if(!dragging)return;if(onFoot){if(!document.pointerLockElement){walkYaw-=(e.clientX-dragX)*.004;fpPitch=clamp(fpPitch-(e.clientY-dragY)*.004,-1.35,1.35);}dragX=e.clientX;dragY=e.clientY;return;}orbitTarget-=(e.clientX-dragX)*.004;pitchTarget=clamp(pitchTarget+(e.clientY-dragY)*.003,-.15,.75);dragX=e.clientX;dragY=e.clientY;lookIdle=0;});$('worldCanvas').addEventListener('wheel',e=>{if(paused)return;e.preventDefault();if(CAMS[cameraMode]?.cockpit&&!onFoot)cockpitZoom=clamp(cockpitZoom*(e.deltaY>0?1.05:1/1.05),.55,1.4);else zoom=clamp(zoom*(e.deltaY>0?1.08:1/1.08),.6,2.4);},{passive:false});$('worldCanvas').addEventListener('dblclick',()=>{orbitTarget=0;pitchTarget=0;zoom=1;cockpitZoom=1;});for(const type of ['pointerup','pointercancel','lostpointercapture'])$('worldCanvas').addEventListener(type,()=>{dragging=false;});
window.addEventListener('blur',()=>{dragging=false;if(active&&loaded&&!inWorks&&!$('worldDialog').open&&!$('workshop').classList.contains('open'))openMenu();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&active&&loaded&&!$('worldDialog').open)openMenu();});new MutationObserver(()=>{if(active&&!inWorks&&!$('worldDialog').open&&!$('workshop').classList.contains('open'))pause(false);}).observe($('workshop'),{attributes:true,attributeFilter:['class']});
window.addEventListener('resize',()=>{if(!renderer)return;renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
window.DwnWorld={get active(){return active;},get paused(){return paused;},step,get diagnostics(){return{loaded,active,paused,fps,position:{x,y,z},heading,steer,orbit,travelled,road:hit?.edge.name,district:hit?.edge.district,roadId:hit?.edge.id,tunnel:drive.state.tunnel,nodes:net?.nodes.length,edges:net?.edges.length,networkKm:net?.totalKm,trafficTypes:[...new Set((npcs?.cars||[]).map(t=>t.type))],traffic:npcs?.count||0,tiles:stream?.tiles.size,colliders:physics?.bodies.size,load:loadStats,tunnels:tunnels&&{bores:tunnels.bores,length:tunnels.length,portals:tunnels.portals},grounded:car?.grounded,drawCalls:renderer?.info.render.calls,triangles:renderer?.info.render.triangles};}};
if(new URLSearchParams(location.search).has('worldDebug'))window.DwnWorldDebug={spawn,get renderer(){return renderer;},get pipeline(){return pipeline;},get fps(){return fps;},menu:openMenu,get stream(){return stream;},get model(){return model;},get ground(){return ground;},get buildings(){return buildings;},get plants(){return plants;},get grass(){return grass;},get sky(){return sky;},get car(){return car;},setClock(h){setHour(h);},setFlow(f){timeFlow=f;},get network(){return net;},get traffic(){return npcs;},get parked(){return parked;},get lamps(){return lampSpots;},navTo(px,pz,name){setDestination({name:name||"Waypoint",x:px,z:pz});},travel(px,pz,name){travelTo(px,pz,name);},get nav(){return nav;},get navInfo(){return navInfo;},mapAt(cx,cz,zoom){mapCenter={x:cx,z:cz};mapZoom=zoom;openMenu("map");},get signs(){return fwySigns;},get scene(){return scene;},get places(){return places;},get fx(){return carFx;},get vehicle(){return vehicle;},setModel,get walker(){return walker;},get online(){return online;},get works(){return works;},get sound(){return soundscape;},get life(){return life;},get timing(){return timing;},enterWorks,waterAt,get fireLights(){return fireLights;},setLook(yw,pt=0){walkYaw=yw;fpPitch=pt;},get onFoot(){return onFoot;},toggleOnFoot,spawnHome,get camera(){return camera;},setInput(v){keySteer=v;},resume(){closeMenu();},view(from,to){camOverride=from?[from,to]:null;},bot(on,seed=1){if(!on){bot=null;return;}bot={pilot:new Autopilot(model,seed),still:0,metrics:{time:0,distance:0,maxOffRoad:-99,offRoadTime:0,airTime:0,allWheelsOff:0,underground:0,stuck:[],respawns:[],flips:[]}};bot.pilot.attach(x,z,y,heading);},get botMetrics(){return bot?.metrics;},get pilot(){return bot?.pilot;},setPosition(px,py,pz,h){x=px;z=pz;y=py;heading=h;stream.update(x,z,1e9);car.place(px,py,pz,h);},steeringTarget};
init();
