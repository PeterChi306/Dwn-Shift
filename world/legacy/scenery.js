import * as T from 'three';
import {mergeGeometries} from '../vendor/BufferGeometryUtils.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {terrainHeight,clamp} from './network.js?v=3';

const V=(x,y,z)=>new T.Vector3(x,y,z);
const rng=seed=>()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const pick=(list,r)=>list[Math.floor(r()*list.length)%list.length];
const materials={},geometries={
 sign:new T.PlaneGeometry(1,1),box:new T.BoxGeometry(1,1,1),
 sphere:new T.IcosahedronGeometry(1,2),roof:new T.ConeGeometry(1,1,4),
 cylinder:new T.CylinderGeometry(1,1,1,10),
};

/* ---------------------------------------------------------------- textures --
 * Facades are textured and UV-scaled to real metres rather than assembled from
 * thousands of little window boxes. That is what lets every building carry its
 * own colour and window rhythm without the draw calls exploding.
 */
const TILE=3.6;            // one structural bay, metres
const FLOOR=3.5;           // one storey, metres
function canvas(size=256){const c=document.createElement('canvas');c.width=c.height=size;return [c,c.getContext('2d')];}
function finishTexture(c,repeatX=1,repeatY=1){
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;t.repeat.set(repeatX,repeatY);return t;
}
function noiseInto(ctx,size,amount){
 const data=ctx.getImageData(0,0,size,size),r=rng(8821);
 for(let i=0;i<data.data.length;i+=4){const n=(r()-.5)*amount;for(let k=0;k<3;k++)data.data[i+k]=clamp(data.data[i+k]+n,0,255);}
 ctx.putImageData(data,0,0);
}
/** One tile = one bay wide by one storey tall. Grey-scale so vertex colour tints
 *  the diffuse map; a matching emissive map lights the glazing after dark. */
function facadeMaps(kind){
 const size=256,[c,ctx]=canvas(size),[e,ectx]=canvas(size),r=rng(kind.length*977+31);
 ectx.fillStyle='#000000';ectx.fillRect(0,0,size,size);
 const panes=[];
 // Glazing with a sky-to-ground gradient, a reveal shadow and a frame.
 const glass=(x,y,w,h,cols=2,rows=1,frame='#ffffff',fw=6)=>{
  const g=ctx.createLinearGradient(0,y,0,y+h);
  g.addColorStop(0,'#93aab8');g.addColorStop(.34,'#4a5f6e');g.addColorStop(1,'#222c35');
  ctx.fillStyle=g;ctx.fillRect(x,y,w,h);
  ctx.fillStyle='rgba(0,0,0,.34)';ctx.fillRect(x,y,w,Math.max(3,h*.09));   // head reveal
  ctx.strokeStyle=frame;ctx.lineWidth=fw;ctx.strokeRect(x,y,w,h);
  ctx.lineWidth=Math.max(2,fw*.45);
  for(let i=1;i<cols;i++){ctx.beginPath();ctx.moveTo(x+w*i/cols,y);ctx.lineTo(x+w*i/cols,y+h);ctx.stroke();}
  for(let i=1;i<rows;i++){ctx.beginPath();ctx.moveTo(x,y+h*i/rows);ctx.lineTo(x+w,y+h*i/rows);ctx.stroke();}
  panes.push([x,y,w,h]);
 };
 const wall=()=>{ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size,size);};
 if(kind==='office'){
  wall();
  ctx.fillStyle='#e4e0d6';ctx.fillRect(0,0,size,size);
  glass(34,40,188,150,2,1,'#f2efe6',7);
  ctx.fillStyle='#d6d1c5';ctx.fillRect(20,196,216,26);           // spandrel
  ctx.fillStyle='#b9b4a8';ctx.fillRect(0,224,size,32);           // slab edge
  ctx.fillStyle='#cfcabf';ctx.fillRect(0,0,20,size);ctx.fillRect(236,0,20,size);
 }else if(kind==='glass'){
  ctx.fillStyle='#8fa8b6';ctx.fillRect(0,0,size,size);
  glass(8,6,240,206,3,2,'#aebcc4',5);
  ctx.fillStyle='#b4c2c8';ctx.fillRect(0,212,size,28);           // spandrel band
  ctx.fillStyle='#9fb0b8';ctx.fillRect(0,0,10,size);ctx.fillRect(246,0,10,size);
 }else if(kind==='brick'){
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size,size);
  for(let row=0;row<16;row++)for(let col=-1;col<9;col++){
   const shade=[236,246,228,240,232][Math.floor(r()*5)];
   ctx.fillStyle=`rgb(${shade},${shade-8},${shade-16})`;
   ctx.fillRect(col*32+(row%2)*16+1,row*16+1,30,14);
  }
  ctx.fillStyle='#f6f1e6';ctx.fillRect(40,44,176,14);            // lintel
  glass(52,60,152,116,2,2,'#f4efe4',7);
  ctx.fillStyle='#f6f1e6';ctx.fillRect(44,176,168,11);           // sill
  ctx.fillStyle='rgba(0,0,0,.10)';ctx.fillRect(44,187,168,5);
 }else if(kind==='stucco'){
  wall();noiseInto(ctx,size,22);
  ctx.fillStyle='#f4efe4';ctx.fillRect(56,58,144,132);           // surround
  glass(66,68,124,112,2,2,'#ffffff',8);
 }else if(kind==='house'){
  wall();noiseInto(ctx,size,18);
  ctx.fillStyle='#f6f2e8';ctx.fillRect(64,76,128,104);
  glass(74,86,108,84,2,2,'#ffffff',9);
 }else if(kind==='warehouse'){
  wall();
  for(let i=0;i<size;i+=16){ctx.fillStyle=i%32?'#f0f0f0':'#e2e2e2';ctx.fillRect(i,0,8,size);}
  ctx.fillStyle='#4b5259';ctx.fillRect(26,148,204,64);           // roller door
  ctx.fillStyle='#5b636a';ctx.fillRect(26,148,204,8);
  glass(34,44,188,56,4,1,'#e8e8e8',5);                           // clerestory
 }else if(kind==='storefront'){
  ctx.fillStyle='#e8e2d4';ctx.fillRect(0,0,size,size);
  glass(14,18,228,204,3,1,'#ded7c8',9);
  ctx.fillStyle='#e8e2d4';ctx.fillRect(0,0,size,14);ctx.fillRect(0,226,size,30);
  ctx.fillStyle='#d6cfc0';ctx.fillRect(0,0,12,size);ctx.fillRect(244,0,12,size);
 }else{
  wall();noiseInto(ctx,size,16);
 }
 // Warm interiors, unevenly occupied so a night facade is not a uniform grid.
 for(const [x,y,w,h] of panes){
  const lit=r();
  ectx.fillStyle=lit<.30?'#000000':lit<.62?'#ffd49a':lit<.85?'#ffe7c4':'#cfe0ff';
  ectx.fillRect(x+3,y+3,w-6,h-6);
 }
 return {map:finishTexture(c),emissive:finishTexture(e)};
}
function groundTexture(kind){
 const size=256,[c,ctx]=canvas(size),r=rng(kind.length*443+7);
 if(kind==='asphalt'){
  ctx.fillStyle='#7c7f77';ctx.fillRect(0,0,size,size);noiseInto(ctx,size,38);
  for(let i=0;i<50;i++){ctx.strokeStyle='#4a4f4a22';ctx.lineWidth=r()*1.4+.3;ctx.beginPath();ctx.moveTo(r()*size,r()*size);ctx.lineTo(r()*size,r()*size);ctx.stroke();}
 }else if(kind==='dirt'){
  ctx.fillStyle='#9c8059';ctx.fillRect(0,0,size,size);noiseInto(ctx,size,52);
  for(let i=0;i<120;i++){ctx.fillStyle=`rgba(${120+r()*60|0},${96+r()*44|0},${64+r()*30|0},.5)`;ctx.beginPath();ctx.arc(r()*size,r()*size,r()*4+.7,0,6.3);ctx.fill();}
 }else if(kind==='concrete'){
  ctx.fillStyle='#a9a79d';ctx.fillRect(0,0,size,size);noiseInto(ctx,size,26);
 }else{ // ground cover: dry grass and scrub
  ctx.fillStyle='#8d9068';ctx.fillRect(0,0,size,size);noiseInto(ctx,size,34);
  for(let i=0;i<260;i++){ctx.strokeStyle=`rgba(${88+r()*70|0},${104+r()*58|0},${58+r()*40|0},.55)`;ctx.lineWidth=1;const x=r()*size,y=r()*size;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+r()*4-2,y-r()*6);ctx.stroke();}
 }
 return finishTexture(c);
}

/** Box geometry whose UVs are scaled to real metres, per face. */
function slabGeometry(w,h,d,tileW=TILE,tileH=FLOOR){
 const g=new T.BoxGeometry(w,h,d);
 const uv=g.attributes.uv;
 // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z — four vertices each.
 const spans=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
 for(let f=0;f<6;f++){
  const [su,sv]=spans[f],ru=Math.max(1,Math.round(su/tileW)),rv=Math.max(1,Math.round(sv/tileH));
  for(let k=0;k<4;k++){const i=f*4+k;uv.setXY(i,uv.getX(i)*ru,uv.getY(i)*rv);}
 }
 return g;
}

/** Collects per-building geometry and merges it once per material per chunk. */
class MeshSet{
 constructor(){this.groups=new Map();this.color=new T.Color();}
 add(mat,geo,matrix,color){
  geo.applyMatrix4(matrix);
  const count=geo.attributes.position.count,arr=new Float32Array(count*3);
  this.color.set(color||'#ffffff');
  for(let i=0;i<count;i++){arr[i*3]=this.color.r;arr[i*3+1]=this.color.g;arr[i*3+2]=this.color.b;}
  geo.setAttribute('color',new T.BufferAttribute(arr,3));
  for(const key of Object.keys(geo.attributes))if(!['position','normal','uv','color'].includes(key))geo.deleteAttribute(key);
  if(geo.index)geo=geo.toNonIndexed();
  if(!this.groups.has(mat))this.groups.set(mat,[]);
  this.groups.get(mat).push(geo);
 }
 finish(parent){
  for(const [mat,list] of this.groups){
   if(!list.length)continue;
   const mesh=new T.Mesh(mergeGeometries(list),mat);
   mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);
   list.forEach(g=>g.dispose());
  }
 }
}

/** Instanced repeated props. Per-instance colour keeps them to one draw call each. */
class Batch {
 constructor(){this.entries=new Map();}
 add(geo,mat,p,size,a=0,color=null){
  const key=geo.uuid+mat.uuid;
  if(!this.entries.has(key))this.entries.set(key,{geo,mat,items:[]});
  this.entries.get(key).items.push({p,size,a,color});
 }
 box(p,size,mat,a=0,color=null){this.add(geometries.box,mat,p,size,a,color);}
 finish(){
  const group=new T.Group(),d=new T.Object3D(),c=new T.Color();
  for(const {geo,mat,items} of this.entries.values()){
   const mesh=new T.InstancedMesh(geo,mat,items.length);
   let tinted=false;
   items.forEach((v,i)=>{
    d.position.set(v.p.x,v.p.y,v.p.z);d.rotation.set(0,v.a,0);d.scale.set(...v.size);d.updateMatrix();
    mesh.setMatrixAt(i,d.matrix);
    if(v.color){mesh.setColorAt(i,c.set(v.color));tinted=true;}
    else mesh.setColorAt(i,c.set('#ffffff'));
   });
   if(tinted&&mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
   mesh.castShadow=!mat.isMeshBasicMaterial;mesh.receiveShadow=true;
   group.add(mesh);
  }
  return group;
 }
}
function compact(root){
 root.updateMatrixWorld(true);const groups=new Map();
 root.traverse(o=>{
  if(!o.isMesh)return;
  let g=o.geometry.clone().applyMatrix4(o.matrixWorld);
  if(g.index)g=g.toNonIndexed();
  for(const key of Object.keys(g.attributes))if(!['position','normal'].includes(key))g.deleteAttribute(key);
  if(!groups.has(o.material))groups.set(o.material,[]);groups.get(o.material).push(g);
 });
 const out=new T.Group();
 for(const [m,gs] of groups){const mesh=new T.Mesh(mergeGeometries(gs),m);mesh.castShadow=true;mesh.receiveShadow=true;out.add(mesh);gs.forEach(g=>g.dispose());}
 return out;
}

/* --------------------------------------------------------------- districts --
 * Each labelled area on the reference gets its own building vocabulary and
 * colour range. This is the difference between "a city" and one repeated block.
 */
const ROOF_FLAT=['#6d6b61','#7b7970','#5f6058','#84806f'];
const ROOF_TILE=['#a8583c','#b5674a','#96503a','#bd7350','#8f4b37'];
const PROFILES={
 'Downtown Los Santerra':{paved:true,core:true,styles:['tower','midrise','midrise','oldtown','strip'],walls:['#93a8b4','#718b9c','#b7c2c6','#9aa69f','#7d94a6','#c4ccc8','#8894a0','#b0a894','#9d8f7c'],roofs:ROOF_FLAT,floors:[4,38],density:.86,signs:['MERIDIAN','SANTERRA TRUST','ONE WILSHIRE','APEX','THE BROADWAY','PACIFIC EXCHANGE']},
 'Pasadena':{paved:true,styles:['oldtown','oldtown','midrise'],walls:['#a8574a','#b8735a','#c9976a','#9c5f4e','#d2a877','#8f5240','#c98b62'],roofs:ROOF_TILE,floors:[2,5],density:.86,signs:['ARROYO BOOKS','COLORADO ARCADE','UNION COFFEE','OLD TOWN MERCANTILE','THE RAYMOND','GREEN STREET']},
 'Beverly Hills':{paved:true,styles:['luxury','luxury','estate'],walls:['#f2e9d8','#e8dcc4','#f6f1e6','#dfd3bb','#e6dccb','#efe4d2'],roofs:ROOF_TILE,floors:[2,4],density:.8,signs:['MAISON / RODEO','ATELIER NO. 8','BEVERLY & CO.','THE GALLERIA','CANON HOUSE']},
 'West Hollywood':{paved:true,styles:['strip','strip','midrise'],walls:['#e4d6c2','#d8b9a4','#c96f5a','#e8c9a0','#b98a6e','#efdcc2','#c99a97'],roofs:ROOF_FLAT,floors:[2,6],density:.88,neon:true,signs:['THE NIGHTJAR','SUNSET SOCIAL','PACIFIC SOUND','HOTEL MONARCH','PALOMA','WHISKY ROOM']},
 'Hollywood':{paved:true,styles:['strip','midrise','oldtown'],walls:['#e0cdae','#cf9e77','#c07a5e','#e9d7b6','#b08a6a','#d9b68d'],roofs:ROOF_FLAT,floors:[2,7],density:.88,neon:true,signs:['THE EGYPTIAN','VINE RECORDS','MUSSO & CO.','BOULEVARD THEATRE','STAR LANES']},
 'San Marino':{styles:['estate','estate'],walls:['#f0e6d2','#e9dcc0','#f5efe0','#e3d4b8','#efe0c8','#e7d9bd'],roofs:ROOF_TILE,floors:[1,2],density:.72,signs:[]},
 'Hancock Park':{styles:['estate','estate','luxury'],walls:['#efe3cc','#dcc9a8','#e7d8bc','#cbb694','#f2e8d4'],roofs:ROOF_TILE,floors:[1,3],density:.74,signs:['LARCHMONT LARDER','THE WINDSOR']},
 'Koreatown':{paved:true,styles:['midrise','midrise','strip'],walls:['#d9c7ae','#c98f6e','#a8b39a','#d8a86f','#bfae94','#e0cdb0','#b5766a'],roofs:ROOF_FLAT,floors:[3,9],density:.92,neon:true,signs:['WILTERN GRILL','SIXTH ST MARKET','KOREATOWN PLAZA','NIGHT OWL','OLYMPIC BBQ']},
 'Fairfax':{paved:true,styles:['strip','midrise'],walls:['#e8d9c0','#c9d6cf','#dfc2b0','#e4cfa8','#cdd9d2','#e9c9b4'],roofs:ROOF_FLAT,floors:[1,4],density:.86,signs:['CANTERS DELI','FARMERS MARKET','THE GROVE','MELROSE TRADING']},
 'Mid-City':{styles:['housing','housing','strip'],walls:['#e6d9c2','#cfd8c4','#dcc6b0','#c8d3d8','#e7ceb4','#bfcbb2'],roofs:ROOF_TILE,floors:[1,3],density:.82,signs:['CORNER MARKET','FIELDWORK','THE LOCAL']},
 'Culver City':{styles:['housing','strip','midrise'],walls:['#e8dcc6','#cdd6c6','#dfc4ae','#c6d2d6','#eacfb2'],roofs:ROOF_TILE,floors:[1,4],density:.82,signs:['CULVER STAGE','HELMS BAKERY','THE CITIZEN']},
 'Exposition Park':{styles:['civic','housing'],walls:['#e8e0cf','#d8cdb4','#efe8d8','#ded2bb'],roofs:ROOF_FLAT,floors:[1,4],density:.6,signs:['MUSEUM OF SCIENCE','ROSE GARDEN','MEMORIAL COLISEUM']},
 'Silver Lake':{styles:['hillhouse','hillhouse','strip'],walls:['#dcd6c8','#b9c0b2','#cfa78d','#e2dbcb','#9fb0ae','#d5c3ab'],roofs:ROOF_FLAT,floors:[1,3],density:.78,signs:['SUNSET JUNCTION','RESERVOIR CAFE','THE SILVERLAKE']},
 'Echo Park':{styles:['hillhouse','housing','strip'],walls:['#e0d7c2','#c4cbb6','#d9ab8e','#e6dfcd','#a8b8b4'],roofs:ROOF_TILE,floors:[1,3],density:.78,signs:['ECHO PARK LAKE','THE LOTUS','ALVARADO GROCERY']},
 'Eagle Rock':{styles:['housing','housing'],walls:['#e6dac4','#d2d8c4','#dec8b2','#cbd4d6','#e9d2b8'],roofs:ROOF_TILE,floors:[1,2],density:.76,signs:['EAGLE ROCK LANES','COLORADO DINER']},
 'Alhambra':{paved:true,styles:['midrise','housing'],walls:['#dcc9ab','#c9a98a','#d4bfa0','#b9a688','#e2d2b6'],roofs:ROOF_TILE,floors:[2,6],density:.86,signs:['MAIN ST GROCERY','VALLEY PLAZA']},
 'Monterey Park':{paved:true,styles:['midrise','housing'],walls:['#dccbad','#cbab8c','#d6c1a2','#bda98a','#e4d4b8'],roofs:ROOF_TILE,floors:[2,6],density:.86,signs:['GARVEY MARKET','ATLANTIC PLAZA','GOLDEN CITY']},
 'El Monte':{paved:true,styles:['industrial','industrial','housing'],walls:['#b9b5a8','#9fa89e','#c6bda8','#8e9a97','#cbb9a0'],roofs:ROOF_FLAT,floors:[1,3],density:.7,signs:['VALLEY FREIGHT','EL MONTE WORKS','RAIL YARD 7']},
 'East Los Santerra':{paved:true,styles:['industrial','housing','midrise'],walls:['#c4b9a4','#a8ab9e','#d0c2a8','#96a099','#c9b49a'],roofs:ROOF_FLAT,floors:[1,4],density:.78,signs:['WHITTIER SUPPLY','EASTSIDE MOTORS','CARNICERIA']},
 'Hollywood Hills':{styles:['hillhouse','hillhouse'],walls:['#e4ddcc','#c2c8ba','#d8bca4','#eae3d2','#aab8b2'],roofs:ROOF_FLAT,floors:[1,2],density:.35,signs:[]},
 'Verdugo Hills':{styles:['hillhouse'],walls:['#ded7c6','#c0c6b8','#d4b8a0'],roofs:ROOF_FLAT,floors:[1,2],density:.22,signs:[]},
 default:{paved:true,styles:['midrise','housing','strip'],walls:['#ddd0b8','#cbbda2','#e3d8c0','#c0b399','#d6c6ae','#c9cfc0'],roofs:ROOF_FLAT,floors:[1,5],density:.84,signs:['CORNER MARKET','FIELDWORK','THE LOCAL','SANTERRA SUPPLY']},
};
// Downtown is a compact core, not a plateau. The reference map puts a tight knot
// of real towers on Bunker Hill with four-to-twelve storey stock all around it,
// so both tower CHANCE and tower HEIGHT fall off from that centre. Without this
// the whole 3 km district drew towers and the skyline read as a wall.
const CORE={x:(900-768)*10,z:(640-512)*10,inner:430,outer:1250};
const profileFor=d=>PROFILES[d]||PROFILES.default;

export class Scenery {
 constructor(network,scene,renderer){
  this.net=network;this.scene=scene;this.renderer=renderer;
  this.chunks=new Map();this.specs=new Map();this.lampPositions=[];this.colliders=[];
  this.signTextures=new Map();this.night=false;this.ready=false;this.templates={};
  this.hour=18.7;this.lighting=null;
  this.initMaterials();this.buildRoads();this.buildTerrain();this.buildSky();this.planBuildings();this.buildSkyline();
 }

 initMaterials(){
  const std=(id,opts)=>materials[id]=new T.MeshStandardMaterial(opts);
  // Road surfaces
  std('road',{color:'#74776f',roughness:.95,map:groundTexture('asphalt')});
  materials.road.map.repeat.set(1,1);
  std('dirtRoad',{color:'#a98a62',roughness:1,map:groundTexture('dirt')});
  std('paint',{color:'#eae3cb',roughness:.7});
  std('yellow',{color:'#dcb25c',roughness:.7});
  std('sidewalk',{color:'#bab3a3',roughness:.95,map:groundTexture('concrete')});
  std('concrete',{color:'#a3a196',roughness:.92,map:groundTexture('concrete')});
  std('curb',{color:'#c3bda9',roughness:.9});
  std('dark',{color:'#2b3238',roughness:.5,metalness:.55});
  std('metal',{color:'#8d8f8c',roughness:.45,metalness:.7});
  std('glass',{color:'#3d5a61',roughness:.1,metalness:.7});
  std('water',{color:'#3f7386',roughness:.08,metalness:.65});
  std('grass',{color:'#7e9155',roughness:1,map:groundTexture('grass')});
  std('hedge',{color:'#4f6b3d',roughness:1});
  std('bark',{color:'#7a6549',roughness:.95});
  std('light',{color:'#ffe3ab',roughness:.4,emissive:'#ffe3ab',emissiveIntensity:3});
  std('neon',{color:'#e59ac0',roughness:.35,emissive:'#e59ac0',emissiveIntensity:2.2});
  std('signalNS',{color:'#a41910',roughness:.4,emissive:'#a41910',emissiveIntensity:2});
  std('signalEW',{color:'#69be84',roughness:.4,emissive:'#69be84',emissiveIntensity:2});
  std('white',{color:'#ffffff',roughness:.85});
  // Vertex-coloured prop materials so instanced props can carry any colour.
  std('prop',{color:'#ffffff',roughness:.85});
  std('roofProp',{color:'#ffffff',roughness:.9});
  // Facade materials: one per texture, tinted per building by vertex colour.
  for(const kind of ['office','glass','brick','stucco','house','warehouse','storefront','plain']){
   const {map,emissive}=facadeMaps(kind);
   materials['fa_'+kind]=new T.MeshStandardMaterial({map,emissiveMap:emissive,emissive:'#ffffff',emissiveIntensity:0,
    vertexColors:true,roughness:kind==='glass'?.16:.85,metalness:kind==='glass'?.32:0});
  }
  materials.glass.side=T.DoubleSide;
  this.makeTrees();
 }

 /** Three canopy species: coastal oak, jacaranda in bloom, and a hill conifer. */
 makeTrees(){
  const leafTexture=(a,b,c)=>{
   const [cv,ctx]=canvas(128),random=rng(9241);
   for(let i=0;i<42;i++){
    const ang=random()*Math.PI*2,rad=Math.sqrt(random())*48,px=64+Math.cos(ang)*rad,py=64+Math.sin(ang)*rad;
    ctx.save();ctx.translate(px,py);ctx.rotate(random()*6.28);
    const g=ctx.createLinearGradient(-10,0,10,0);g.addColorStop(0,a);g.addColorStop(.5,i%3?b:c);g.addColorStop(1,a);
    ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,0,5+random()*3,10+random()*5,0,0,6.28);ctx.fill();
    ctx.restore();
   }
   const t=new T.CanvasTexture(cv);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;
  };
  const canopy=(seed,count,spread,rise)=>{
   const leaves=[],dummy=new T.Object3D(),random=rng(seed);
   for(let i=0;i<count;i++){
    const a=random()*6.28,rad=Math.sqrt(random())*spread,px=Math.cos(a)*rad,pz=Math.sin(a)*rad;
    const py=rise+Math.sqrt(Math.max(0,1-rad*rad/(spread*spread+9)))*2.9+(random()-.5)*1.5;
    const g=new T.PlaneGeometry(1.7,1.7);
    dummy.position.set(px,py,pz);dummy.rotation.set(random()*3.14,random()*6.28,random()*6.28);
    dummy.scale.setScalar(.8+random()*.55);dummy.updateMatrix();g.applyMatrix4(dummy.matrix);leaves.push(g);
   }
   const merged=mergeGeometries(leaves);leaves.forEach(g=>g.dispose());return merged;
  };
  const wood=(seed,height,spread)=>{
   const parts=[],random=rng(seed);
   const trunk=new T.CylinderGeometry(.11,.26,height,10);trunk.translate(0,height/2,0);parts.push(trunk);
   for(let i=0;i<9;i++){
    const a=i*2.399,end=V(Math.cos(a)*spread,height+.6+(i%3)*.65,Math.sin(a)*spread),start=V(0,height*.62+i*.18,0);
    const dir=end.clone().sub(start),g=new T.CylinderGeometry(.025,.09,dir.length(),7);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(V(0,1,0),dir.normalize()));
    g.translate(...start.clone().add(end).multiplyScalar(.5).toArray());parts.push(g);
   }
   const merged=mergeGeometries(parts);parts.forEach(g=>g.dispose());return merged;
  };
  materials.oakLeaves=new T.MeshStandardMaterial({map:leafTexture('#283f20','#6a8646','#819654'),alphaTest:.48,side:T.DoubleSide,roughness:1,color:'#c4cfac'});
  materials.jacarandaLeaves=new T.MeshStandardMaterial({map:leafTexture('#3b2c5e','#8f7ccb','#a996dd'),alphaTest:.48,side:T.DoubleSide,roughness:1,color:'#cfc6e8'});
  materials.pineLeaves=new T.MeshStandardMaterial({map:leafTexture('#1f3323','#3f5c34','#4d6b3a'),alphaTest:.48,side:T.DoubleSide,roughness:1,color:'#a8b89c'});
  geometries.oak=canopy(5511,155,3.4,5.5);geometries.oakWood=wood(3311,6,2.6);
  geometries.jacaranda=canopy(7717,140,3.1,5.2);geometries.jacarandaWood=wood(4413,5.6,2.4);
  geometries.pine=canopy(9931,120,2.0,5.0);geometries.pineWood=wood(1123,7.5,1.5);
  // A simple shrub for gardens and verges.
  geometries.shrub=canopy(2207,26,1.1,.9);
 }

 /* ------------------------------------------------------------------ roads */
 ribbon(e,offset,width,mat,raise=.025,from=0,to=1){
  const p=this.net.point(e,from,offset),q=this.net.point(e,to,offset);
  const nx=e.dz/e.flat*width/2,nz=-e.dx/e.flat*width/2;
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute([p.x-nx,p.y+raise,p.z-nz,p.x+nx,p.y+raise,p.z+nz,q.x-nx,q.y+raise,q.z-nz,q.x+nx,q.y+raise,q.z+nz],3));
  g.setAttribute('uv',new T.Float32BufferAttribute([0,0,width/5,0,0,e.length*(to-from)/5,width/5,e.length*(to-from)/5],2));
  g.setIndex([0,2,1,1,2,3]);g.computeVertexNormals();
  return {g,mat};
 }
 buildRoads(){
  const chunks=new Map();
  const collect=(key,item)=>{if(!chunks.has(key))chunks.set(key,[]);chunks.get(key).push(item);};
  for(const e of this.net.edges){
   const mid=this.net.point(e,.5),key=`${Math.floor(mid.x/640)},${Math.floor(mid.z/640)}`;
   const dirt=e.kind==='dirt',tunnel=e.kind==='tunnel',under=e.kind==='underpass';
   collect(key,this.ribbon(e,0,e.width,dirt?materials.dirtRoad:materials.road));
   if(tunnel){
    collect(key,this.ribbon(e,0,e.width+1,materials.concrete,7.4));
    for(const side of [-1,1]){
     const a=this.net.point(e,0,side*(e.width/2+.2)),b=this.net.point(e,1,side*(e.width/2+.2));
     const g=new T.BufferGeometry();
     g.setAttribute('position',new T.Float32BufferAttribute([a.x,a.y,a.z,b.x,b.y,b.z,a.x,a.y+7.4,a.z,b.x,b.y+7.4,b.z],3));
     g.setAttribute('uv',new T.Float32BufferAttribute([0,0,e.length/8,0,0,1,e.length/8,1],2));
     g.setIndex([0,1,2,2,1,3]);g.computeVertexNormals();collect(key,{g,mat:materials.concrete});
    }
    materials.concrete.side=T.DoubleSide;
   }
   if(under)for(const side of [-1,1]){  // retaining walls holding back the cut
    const a=this.net.point(e,0,side*(e.width/2+.4)),b=this.net.point(e,1,side*(e.width/2+.4));
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute([a.x,a.y,a.z,b.x,b.y,b.z,a.x,a.y+6.5,a.z,b.x,b.y+6.5,b.z],3));
    g.setAttribute('uv',new T.Float32BufferAttribute([0,0,e.length/8,0,0,1,e.length/8,1],2));
    g.setIndex([0,1,2,2,1,3]);g.computeVertexNormals();collect(key,{g,mat:materials.concrete});
   }
   if(dirt)continue;                       // no paint or kerbs on a fire road
   const margin=Math.min(.42,12/e.length),wide=e.width>17;
   if(!['ramp','residential','street'].includes(e.kind))
    for(const off of [-.13,.13])collect(key,this.ribbon(e,off,.1,materials.yellow,.035,margin,1-margin));
   for(const side of [-1,1]){
    collect(key,this.ribbon(e,side*(e.width/2-.5),.12,materials.paint,.04,margin,1-margin));
    if(!['freeway','ramp','tunnel','underpass'].includes(e.kind)){
     collect(key,this.ribbon(e,side*(e.width/2+1.9),3.8,materials.sidewalk,.15,margin,1-margin));
     collect(key,this.ribbon(e,side*(e.width/2+.15),.35,materials.curb,.16,margin,1-margin));
    }
    if(wide)for(let d=12;d<e.length-12;d+=13)
     collect(key,this.ribbon(e,side*e.width/4,.13,materials.paint,.045,d/e.length,Math.min((d+4)/e.length,1-margin)));
   }
  }
  for(const [key,items] of chunks){
   const group=new T.Group(),byMat=new Map();
   for(const item of items){if(!byMat.has(item.mat))byMat.set(item.mat,[]);byMat.get(item.mat).push(item.g);}
   for(const [m,gs] of byMat){const mesh=new T.Mesh(mergeGeometries(gs),m);mesh.receiveShadow=true;group.add(mesh);gs.forEach(g=>g.dispose());}
   this.scene.add(group);
  }
 }

 /* ---------------------------------------------------------------- terrain */
 buildTerrain(){
  const g=new T.PlaneGeometry(19000,12500,600,420);g.rotateX(-Math.PI/2);
  const p=g.attributes.position,colors=[],color=new T.Color(),a=new T.Color(),b=new T.Color();
  const heights=new Float32Array(p.count);
  const verge=new Float32Array(p.count);   // 1 at a carriageway, 0 on open ground
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),z=p.getZ(i),natural=terrainHeight(x,z)-1.2;
   let y=natural,near=0;
   // The ground must sit below EVERY carriageway around it, so the deepest cut
   // wins. Taking the minimum is what lets an underpass cut through the street
   // crossing above it, and it costs nothing for an elevated freeway deck:
   // min(ground, deck) is simply the ground until the deck enters a hillside,
   // at which point the same rule notches a cutting for it.
   for(const e of this.net.nearby(x,z,1)){
    if(e.kind==='tunnel')continue;                        // bored, not cut
    const r=this.net.project(e,x,z);
    const fast=e.kind==='freeway'||e.kind==='ramp';
    // Ramps and underpasses change grade fastest, so they need the widest cut
    // relative to their carriageway or the hillside closes back over the deck.
    const flat=e.width/2+(e.kind==='ramp'?9:fast?4:e.kind==='underpass'?6:5);
    const reach=flat+(e.kind==='ramp'?46:e.kind==='freeway'?22:e.kind==='underpass'?40:['scenic','dirt'].includes(e.kind)?34:44);
    if(r.distance>=reach)continue;
    const deck=r.p.y-.22;
    let t=r.distance<=flat?0:(r.distance-flat)/(reach-flat);
    t=t*t*(3-2*t);
    y=Math.min(y,deck+(natural-deck)*t);
    if(deck<natural+2)near=Math.max(near,1-t);
   }
   p.setY(i,y);heights[i]=y;verge[i]=near;
  }
  g.computeVertexNormals();
  const normals=g.attributes.normal;
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),z=p.getZ(i),y=heights[i],slope=1-clamp(normals.getY(i),0,1);
   // Dry basin grass -> chaparral -> bare rock with altitude, rock on steep faces.
   // Irrigated basin green -> dry chaparral -> sun-bleached rock with altitude.
   const alt=clamp((y-30)/150,0,1);
   a.set('#7d9553');b.set('#97915d');color.copy(a).lerp(b,clamp(alt*1.5,0,1));
   color.lerp(a.set('#8d7f5c'),clamp((y-190)/190,0,1));
   const rock=clamp(slope*2.6,0,1)*.9+clamp((y-300)/220,0,1)*.55;
   color.lerp(b.set('#9a9086'),clamp(rock,0,1));
   const v=.9+.13*Math.sin(x*.0021)*Math.cos(z*.0017)+.07*Math.sin(x*.011+z*.009);
   color.multiplyScalar(v);
   colors.push(color.r,color.g,color.b);
  }
  g.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  const mesh=new T.Mesh(g,new T.MeshStandardMaterial({vertexColors:true,roughness:1,map:groundTexture('grass')}));
  mesh.material.map.repeat.set(950,620);
  mesh.receiveShadow=true;this.scene.add(mesh);
  // A backdrop range beyond the playable plane, hazed to read as distance.
  const r=rng(224),ridge=[];
  for(let i=0;i<26;i++){
   const geo=new T.SphereGeometry(1,28,18),pos=geo.attributes.position;
   for(let j=0;j<pos.count;j++){
    const x=pos.getX(j),y=pos.getY(j),z=pos.getZ(j);
    pos.setY(j,y*(1+.10*Math.sin(x*11+z*7)+.05*Math.cos(z*17)));
   }
   geo.computeVertexNormals();
   const m=new T.Matrix4().compose(
    new T.Vector3(-9200+i*760,-240,-5600-r()*900),
    new T.Quaternion(),
    new T.Vector3(1050+r()*640,430+r()*430,1180));
   geo.applyMatrix4(m);ridge.push(geo);
  }
  const back=new T.Mesh(mergeGeometries(ridge),new T.MeshStandardMaterial({color:'#6e8091',roughness:1,fog:true}));
  this.scene.add(back);ridge.forEach(g=>g.dispose());
 }

 /* -------------------------------------------------------------------- sky */
 /** Direction to the sun for a given hour. Sunrise east, sunset west, south bias. */
 sunDirection(hour){
  const t=(hour-6)/14,theta=t*Math.PI;
  return new T.Vector3(Math.cos(theta),Math.sin(theta),.35*(1-Math.sin(theta))+.28).normalize();
 }
 buildSky(){
  this.skyMaterial=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,
   uniforms:{sunDir:{value:new T.Vector3(0,1,.3)},time:{value:0}},
   vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:`varying vec3 direction;uniform vec3 sunDir;uniform float time;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.55+noise(p*2.1)*.27+noise(p*4.2)*.13+noise(p*8.1)*.05;}
void main(){
 vec3 d=normalize(direction);
 float elev=sunDir.y;
 float day=smoothstep(-.14,.20,elev);
 float golden=exp(-pow((elev-.02)/.30,2.));
 vec3 zenith=mix(vec3(.014,.028,.062),vec3(.15,.35,.62),day);
 vec3 horizon=mix(vec3(.055,.075,.135),vec3(.74,.81,.86),day);
 float h=pow(clamp(d.y,0.,1.),.42);
 vec3 color=mix(horizon,zenith,h);
 // Warm band stacked toward the sun's compass bearing at low elevation.
 vec3 flat3=normalize(vec3(sunDir.x,0.,sunDir.z));
 float align=max(dot(d,flat3),0.);
 color=mix(color,vec3(1.,.44,.19),golden*pow(align,2.)*(1.-h)*.82);
 color+=vec3(1.,.56,.26)*golden*pow(align,8.)*(1.-h)*.55;
 // Sun disc and halo, fading out as it sets.
 float sa=dot(d,sunDir);
 float above=smoothstep(-.11,.05,elev);
 color+=(vec3(1.,.92,.78)*(pow(max(sa,0.),90.)*.6+pow(max(sa,0.),8.)*.13)
        +vec3(4.,3.4,2.6)*smoothstep(.9994,.99975,sa))*above;
 // Moon opposite the sun, with a soft glow.
 vec3 moonDir=-sunDir;float ma=dot(d,moonDir);
 color+=(vec3(1.1,1.12,1.)*smoothstep(.99930,.99965,ma)+vec3(.32,.38,.55)*pow(max(ma,0.),40.)*.3)*(1.-day);
 // Stars, thinning out as the sky brightens.
 if(d.y>0.){
  vec2 sp=floor(d.xz/(d.y+.35)*340.);
  float s=hash(sp);
  float star=smoothstep(.9972,1.,s)*(1.-day);
  color+=vec3(.9,.94,1.)*star*(.55+.45*sin(time*2.+s*90.));
 }
 // Two cloud layers: broad cover, plus a faster wisp layer for depth.
 vec2 p=d.xz/max(d.y+.10,.09)*2.4+vec2(time*.004,time*.0016);
 float cover=fbm(p);
 float cloud=smoothstep(.50,.79,cover)*smoothstep(.015,.17,d.y);
 float detail=fbm(p*2.7+vec2(time*.007,0.));
 vec3 lit=mix(vec3(.40,.44,.52),vec3(1.,.985,.945),day);
 lit=mix(lit,vec3(1.,.63,.36),golden*pow(align,1.5)*.95);
 vec3 shade=mix(vec3(.09,.11,.17),vec3(.54,.565,.62),day);
 color=mix(color,mix(shade,lit,smoothstep(.34,.86,detail)),cloud*.9);
 float wisp=smoothstep(.62,.86,fbm(p*1.6+vec2(time*.010,time*.003)))*smoothstep(.05,.3,d.y);
 color=mix(color,lit,wisp*.28);
 gl_FragColor=vec4(color,1.);
}`});
  this.sky=new T.Mesh(new T.SphereGeometry(25000,48,28),this.skyMaterial);
  this.scene.add(this.sky);
  this.pmrem=new T.PMREMGenerator(this.renderer);
  this.refreshEnvironment(true);
 }
 /** The environment map is rebuilt only when the sun has moved appreciably. */
 refreshEnvironment(force=false){
  if(!force&&Math.abs(this.hour-(this.envHour??-99))<.35)return;
  this.envHour=this.hour;
  const env=new T.Scene(),copy=this.sky.clone();
  copy.material=this.skyMaterial;env.add(copy);
  // The sky shell sits at 25 km; fromScene's default far plane is 100, which
  // clipped it away entirely and left every PBR surface with a black probe.
  const target=this.pmrem.fromScene(env,.04,1,60000);
  if(this.envTarget)this.envTarget.dispose();
  this.envTarget=target;
  this.scene.environment=target.texture;
 }

 /** Sun, sky tint, hemisphere bounce and fog all follow the same clock. */
 applyLighting({sun,hemi,fog,position,tunnel,night}){
  const dir=this.sunDirection(this.hour),elev=dir.y;
  const day=clamp((elev+.14)/.34,0,1);
  const golden=Math.exp(-(((elev-.02)/.30)**2));
  sun.position.copy(position).addScaledVector(dir,260);
  sun.target.position.copy(position);
  const warm=new T.Color('#fff1d6').lerp(new T.Color('#ff8a3d'),golden*.8);
  sun.color.copy(night&&day<.05?new T.Color('#9fb6dd'):warm);
  sun.intensity=tunnel?.06:Math.max(day*3.6,day<.05?.22:.22);
  hemi.color.set(day>.3?'#bcd9f2':'#3d4c68');
  hemi.groundColor.set(day>.3?'#8d7f6b':'#2b2b2f');
  hemi.intensity=tunnel?.3:.62+day*1.55;
  // Fog has to land on the SAME colour the sky shader paints at the horizon, or
  // the distance fades to a band that does not match the sky behind it — which
  // is what made the night view read as a grey stripe under the stars. These two
  // constants are the sky shader's `horizon` endpoints, kept in step by hand.
  fog.color.copy(new T.Color(.055,.075,.135).lerp(new T.Color(.74,.81,.86),day))
   .lerp(new T.Color(1.,.44,.19),golden*.42);
  fog.density=.000075+(1-day)*.00009;
  this.lastLight={hour:this.hour,elev,day,golden,sun:sun.intensity,hemi:hemi.intensity,
   env:this.scene.environmentIntensity,exposure:this.renderer.toneMappingExposure,dir:dir.toArray()};
 }

 /* --------------------------------------------------------------- planning */
 /** Lots are laid out along whole streets, not per split edge, so spacing and
  *  frontage stay continuous through every intersection. */
 planBuildings(){
  const push=(x,z,spec)=>{const key=`${Math.floor(x/384)},${Math.floor(z/384)}`;if(!this.specs.has(key))this.specs.set(key,[]);this.specs.get(key).push(spec);};
  const r=rng(113);
  for(const chain of this.net.chains){
   if(['freeway','ramp','tunnel','dirt'].includes(chain.kind))continue;
   const residentialRoad=chain.kind==='residential',scenic=chain.kind==='scenic';
   const spacing=residentialRoad?30:scenic?74:chain.kind==='street'?34:38;
   for(let d=spacing*.5;d<chain.length-spacing*.5;d+=spacing){
    const hit=this.net.chainPoint(chain,d);
    if(hit.edge.kind==='underpass'||hit.edge.kind==='tunnel')continue;
    const district=hit.edge.district,profile=profileFor(district);
    for(const side of [-1,1]){
     const estate=district==='San Marino'||district==='Hancock Park'||residentialRoad;
     const setback=estate?20:district==='Hollywood Hills'||district==='Verdugo Hills'?16:3.5;
     const off=side*(chain.width/2+3.8+8+setback);
     const p=this.net.chainPoint(chain,d,off).p;
     // Skip a lot that another street already runs through.
     const nearby=this.net.nearby(p.x,p.z);
     if(nearby.some(other=>other.id!==hit.edge.id&&this.net.project(other,p.x,p.z).distance<other.width/2+11))continue;
     const roll=r();
     let type='building';
     // A canyon road is not a shopping street: sparse houses, no lots.
     if(scenic){if(roll>.3)continue;}
     else if(roll>profile.density){
      // The gaps are what break up the wall of identical frontage.
      const g=r();
      type=g<.34?'parking':g<.62?'pocketPark':g<.82?'yard':'skip';
     }
     if(type==='skip')continue;
     push(p.x,p.z,{type,p,a:hit.heading,side,district,seed:Math.floor(r()*1e7),estate,edge:hit.edge.id,width:chain.width,spacing});
     // Block interior: a lower second rank behind the frontage, so the city has depth.
     if(type==='building'&&!estate&&r()<.5){
      const q=this.net.chainPoint(chain,d+spacing*.35,side*(chain.width/2+3.8+setback+30+r()*16)).p;
      if(!this.net.nearby(q.x,q.z).some(other=>this.net.project(other,q.x,q.z).distance<other.width/2+11))
       push(q.x,q.z,{type:'building',p:q,a:hit.heading+(r()-.5)*.5,side,district,seed:Math.floor(r()*1e7),estate:false,edge:hit.edge.id,width:chain.width,spacing,rear:true});
     }
    }
   }
  }
  this.net.chains.forEach((chain,index)=>{
   const step=['freeway','ramp'].includes(chain.kind)?65:chain.kind==='dirt'?90:30;
   for(let d=step*.4;d<chain.length-step*.4;d+=step){
    const p=this.net.chainPoint(chain,d).p;
    push(p.x,p.z,{type:'street',chain:index,d,seed:(index*7919+Math.round(d))|0});
   }
  });
  for(const n of this.net.nodes)
   if(this.net.adj[n.id].length>=3&&n.layer==='surface')push(n.position[0],n.position[2],{type:'junction',node:n.id});
 }

 /** A simple massing model of every block in the city, built once and shown
  *  wherever the detailed streamed chunk is not loaded. Without it the view from
  *  the hills is an empty plain, because detail only streams ~1 km out. */
 buildSkyline(){
  this.skyline=new Map();
  // The stand-in city is the whole view from the hills, so at night it carries
  // the lights rather than going flat grey. Windows are generated in the shader
  // from world position: thousands of lit panes for no extra geometry, and they
  // stay put as chunks stream in and out because nothing depends on the mesh.
  const mat=new T.MeshLambertMaterial({vertexColors:true});
  mat.userData.night={value:0};
  mat.onBeforeCompile=shader=>{
   shader.uniforms.uNight=mat.userData.night;
   shader.vertexShader=shader.vertexShader
    .replace('#include <common>','#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vObjNormal;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\nvWorldPos=(modelMatrix*vec4(transformed,1.)).xyz;\nvObjNormal=normal;');
   shader.fragmentShader=shader.fragmentShader
    .replace('#include <common>','#include <common>\nuniform float uNight;\nvarying vec3 vWorldPos;\nvarying vec3 vObjNormal;\nfloat winHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}')
    .replace('#include <dithering_fragment>',`#include <dithering_fragment>
 if(uNight>0.001&&abs(vObjNormal.y)<0.5){
  // One cell per storey, per bay, on whichever facade axis this face runs along.
  vec2 face=abs(vObjNormal.x)>abs(vObjNormal.z)?vec2(vWorldPos.z,vWorldPos.y):vec2(vWorldPos.x,vWorldPos.y);
  vec2 cell=floor(vec2(face.x/4.2,face.y/3.6));
  float lit=winHash(vec3(cell,floor(vWorldPos.y/240.)));
  float on=step(0.62,lit);
  // Two lamp colours so the carpet is not one flat tint.
  vec3 warm=mix(vec3(1.,.82,.52),vec3(.78,.86,1.),step(0.86,fract(lit*37.)));
  gl_FragColor.rgb+=warm*on*uNight*1.15;
 }`);
  };
  this.skylineMaterial=mat;
  const color=new T.Color();
  for(const [key,specs] of this.specs){
   const boxes=[];
   for(const spec of specs){
    if(spec.type!=='building')continue;
    const {style,wall,depth,width,height,jitterZ,frontOffset}=this.massing(spec);
    const {p,a,side}=spec;
    const dxCentre=side*(depth/2+frontOffset);
    const cos=Math.cos(a),sin=Math.sin(a);
    const g=new T.BoxGeometry(depth,height,width);
    // Towers read as taller than their main mass once their setbacks are stacked.
    if(style==='tower')g.scale(1,1.45,1);
    g.applyMatrix4(new T.Matrix4().compose(
     new T.Vector3(p.x+cos*dxCentre+sin*jitterZ,p.y+(style==='tower'?height*1.45:height)/2,p.z-sin*dxCentre+cos*jitterZ),
     new T.Quaternion().setFromAxisAngle(V(0,1,0),a),new T.Vector3(1,1,1)));
    const count=g.attributes.position.count,arr=new Float32Array(count*3);
    color.set(wall);
    for(let i=0;i<count;i++){arr[i*3]=color.r;arr[i*3+1]=color.g;arr[i*3+2]=color.b;}
    g.setAttribute('color',new T.BufferAttribute(arr,3));
    g.deleteAttribute('uv');
    boxes.push(g.toNonIndexed());
    g.dispose();
   }
   if(!boxes.length)continue;
   const mesh=new T.Mesh(mergeGeometries(boxes),mat);
   mesh.matrixAutoUpdate=false;
   boxes.forEach(g=>g.dispose());
   this.scene.add(mesh);
   this.skyline.set(key,mesh);
  }
 }
 async load(){
  const loader=new GLTFLoader();
  for(const name of ['performance-coupe','traffic-sedan','traffic-suv','traffic-van','california-palm','aster-hotel']){
   const gltf=await loader.loadAsync(`assets/world/${name}.glb?fleet=3`);
   gltf.scene.traverse(o=>{if(o.isMesh&&o.material.name==='Brake LED'){o.material.toneMapped=false;o.material.emissiveIntensity=.35;}});
   this.templates[name]=compact(gltf.scene);
   if(name==='performance-coupe')this.playerSource=gltf.scene;
  }
  this.ready=true;
 }
 makeVehicle(type='performance-coupe',animated=false){
  if(!animated)return this.templates[type].clone(true);
  const source=this.playerSource.clone(true),original=[];
  source.updateMatrixWorld(true);source.traverse(o=>{if(o.name.startsWith('Wheel_'))original.push(o);});
  const wheels=[];
  for(const w of original){
   const p=new T.Vector3();w.getWorldPosition(p);
   const visual=compact(w);for(const m of visual.children)m.geometry.translate(-p.x,-p.y,-p.z);
   const pivot=new T.Group();pivot.name=w.name;pivot.position.copy(p);pivot.add(visual);
   w.removeFromParent();wheels.push(pivot);
  }
  const object=compact(source);for(const w of wheels)object.add(w);
  return {object,wheels};
 }

 /* ------------------------------------------------------------ vegetation */
 addTree(batch,p,a,kind='palm',scale=1){
  if(kind==='palm'&&this.ready){
   for(const mesh of this.templates['california-palm'].children)batch.add(mesh.geometry,mesh.material,p,[scale,scale,scale],a);
   return;
  }
  const species={oak:['oakWood','oak','oakLeaves'],jacaranda:['jacarandaWood','jacaranda','jacarandaLeaves'],pine:['pineWood','pine','pineLeaves']}[kind]||['oakWood','oak','oakLeaves'];
  batch.add(geometries[species[0]],materials.bark,p,[scale,scale,scale],a);
  batch.add(geometries[species[1]],materials[species[2]],p,[scale,scale,scale],a);
 }
 addShrub(batch,p,scale=1,color='#5d7a42'){
  batch.add(geometries.shrub,materials.oakLeaves,p,[scale,scale,scale],0,color);
 }

 sign(group,text,p,a,width=10,color='#ebdfc4',neon=false){
  const key=text+color+neon;let mat=this.signTextures.get(key);
  if(!mat){
   const c=document.createElement('canvas');c.width=1024;c.height=176;const ctx=c.getContext('2d');
   ctx.fillStyle=neon?'#141b22':'#f3ead6';ctx.fillRect(0,0,1024,176);
   ctx.strokeStyle=neon?color:'#6d6450';ctx.lineWidth=6;ctx.strokeRect(12,12,1000,152);
   ctx.fillStyle=neon?color:'#2c2a24';ctx.textAlign='center';ctx.textBaseline='middle';
   ctx.font='600 78px Georgia';
   if(neon){ctx.shadowColor=color;ctx.shadowBlur=26;}
   ctx.fillText(text,512,94,930);
   const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;
   mat=new T.MeshBasicMaterial({map:tex,side:T.DoubleSide});this.signTextures.set(key,mat);
  }
  if(!group.userData.signBatch)group.userData.signBatch=new Batch();
  group.userData.signBatch.add(geometries.sign,mat,p,[width,width/5.4,1],a);
 }

 /* -------------------------------------------------------------- buildings */
 /** Massing shared by the detailed building and its distant stand-in, so the
  *  skyline you see from the hills matches the blocks you drive through. The
  *  returned generator is deliberately handed back mid-sequence: the caller
  *  keeps drawing from it, which is what keeps the two in step. */
 massing(spec){
  const r=rng(spec.seed),profile=profileFor(spec.district);
  let style=spec.rear?(r()<.5?'midrise':'warehouseLow'):pick(profile.styles,r);
  const wall=pick(profile.walls,r);
  let depth,width,height,floors;
  const range=profile.floors;
  // How much of the high-rise core this lot sits in: 1 on Bunker Hill, 0 by the
  // edge of the district. Outside the core a 'tower' roll becomes ordinary stock.
  let core=0;
  if(profile.core&&spec.p){
   const d=Math.hypot(spec.p.x-CORE.x,spec.p.z-CORE.z);
   core=clamp((CORE.outer-d)/(CORE.outer-CORE.inner),0,1);
  }
  if(style==='tower'&&r()>.08+core*core*.78)style=r()<.6?'midrise':'oldtown';
  if(style==='tower'){
   // Squaring the roll gives many mid-rises and a few real high-rises, which is
   // what makes a skyline instead of a uniform wall of towers.
   floors=Math.round(range[0]+Math.pow(r(),2.1)*(range[1]-range[0])*(.3+core*.7));
   depth=20+r()*14;width=22+r()*18;height=floors*3.9;
  }else if(style==='estate'||style==='hillhouse'||style==='housing'){
   floors=1+(r()<.34?1:0);depth=14+r()*5;width=17+r()*8;height=floors*3.3+1.4;
  }else if(style==='industrial'||style==='warehouseLow'){
   floors=1;depth=26+r()*16;width=30+r()*22;height=8+r()*5;
  }else{
   // Biasing low with an occasional tall outlier gives a street a skyline.
   const roll=r();
   floors=Math.max(1,Math.round(range[0]+Math.pow(roll,1.7)*(range[1]-range[0])+(roll>.9?3:0)));
   depth=15+r()*9;width=20+r()*12;height=floors*FLOOR+1.2;
  }
  // Frontage jitter: no two neighbours share a setback line or a wall angle.
  const jitterZ=(r()-.5)*(spec.spacing?spec.spacing*.22:6);
  const frontOffset=(r()-.5)*3.2;
  return {r,profile,style,wall,depth,width,height,floors,jitterZ,frontOffset};
 }
 building(set,batch,group,spec){
  const {p,a,side,district}=spec;
  const {r,profile,style,wall,depth,width,height,jitterZ,frontOffset,floors}=this.massing(spec);
  const base=p.y;
  const ground=terrainHeight(p.x,p.z);
  const cos=Math.cos(a),sin=Math.sin(a);
  // Local frame: +dx runs away from the street on this side, +dz along the street.
  const place=(dx,dy,dz)=>new T.Matrix4().compose(
   new T.Vector3(p.x+cos*dx+sin*dz,base+dy,p.z-sin*dx+cos*dz),
   new T.Quaternion().setFromAxisAngle(V(0,1,0),a),new T.Vector3(1,1,1));
  const slab=(mat,dx,dy,dz,w,h,d,color,tileW,tileH)=>
   set.add(materials['fa_'+mat],slabGeometry(d,h,w,tileW||TILE,tileH||FLOOR),place(dx,dy+h/2,dz),color);
  // sx spans across the street (building depth), sz runs along it (frontage).
  const prop=(dx,dy,dz,sx,sy,sz,mat,color)=>{
   const m=place(dx,dy,dz),v=new T.Vector3();m.decompose(v,new T.Quaternion(),new T.Vector3());
   batch.box({x:v.x,y:v.y,z:v.z},[sx,sy,sz],mat,a,color);
  };
  const dxCentre=side*(depth/2+frontOffset);

  // Street-facing face of the main mass; props are measured forward from here.
  const front=side*frontOffset;
  const facade={tower:'glass',luxury:'stucco',oldtown:'brick',strip:'stucco',midrise:'office',
                estate:'house',hillhouse:'house',housing:'house',industrial:'warehouse',
                warehouseLow:'warehouse',civic:'stucco'}[style]||'plain';

  // --- main mass
  slab(facade,dxCentre,0,jitterZ,width,height,depth,wall);
  this.colliders.push({x:p.x+cos*dxCentre+sin*jitterZ,z:p.z-sin*dxCentre+cos*jitterZ,y:base,a,hx:depth/2+.5,hz:width/2+.5,height});
  // Plinth down to the ground on a slope, so nothing floats on the hills.
  if(ground<base-.6)slab('plain',dxCentre,ground-base,jitterZ,width+.4,base-ground+.4,depth+.4,'#9c968a',6,6);

  const roofColor=pick(profile.roofs,r);
  if(style==='tower'){
   // Setback shafts give the skyline a silhouette instead of one flat ceiling.
   let h=height,w=width,dp=depth;
   const setbacks=1+Math.floor(r()*2);
   for(let i=0;i<setbacks;i++){
    const nh=h*(.30+r()*.26);w*=.72+r()*.13;dp*=.74+r()*.12;
    slab('glass',dxCentre,h,jitterZ,w,nh,dp,wall);
    h+=nh;
   }
   prop(dxCentre,h+1.1,jitterZ,dp*.5,2.2,w*.5,materials.prop,'#4b5259');
   if(r()<.45){ // crown mast
    prop(dxCentre,h+2.2+6,jitterZ,.5,12,.5,materials.metal,'#b7bcbd');
    prop(dxCentre,h+2.2+12.6,jitterZ,.9,.9,.9,materials.light,'#ff6f5e');
   }
   prop(dxCentre,height*.5,jitterZ+width/2+.1,.5,height,.5,materials.prop,'#f2efe6');   // corner pier
   prop(dxCentre,height*.5,jitterZ-width/2-.1,.5,height,.5,materials.prop,'#f2efe6');
   // Podium at street level reads as an entrance rather than a blank wall.
   slab('storefront',dxCentre,0,jitterZ,width+3,5.4,depth+5,'#e9e3d5');
   prop(front-side*1.2,5.7,jitterZ,2.2,.5,width+3.4,materials.prop,'#d8d2c4');
  }else if(style==='estate'||style==='hillhouse'||style==='housing'){
   // Pitched roof, garden wall, driveway, planting.
   const m=place(dxCentre,height+1.5,jitterZ);
   m.multiply(new T.Matrix4().makeRotationY(Math.PI/4));
   // A four-sided cone rotated 45 degrees is a hip roof; its radius reaches the
   // corners, so it scales by depth/width times root-two-over-two, not by width.
   set.add(materials.fa_plain,new T.ConeGeometry(1,1,4).scale(depth*.75,3.1+r()*1.4,width*.75),m,roofColor);
   prop(dxCentre,height+.15,jitterZ,depth+1.1,.34,width+1.1,materials.roofProp,roofColor);   // eaves
   prop(front-side*1.5,1.15,jitterZ,3.2,.22,4.4,materials.prop,'#cfc8b6');         // porch slab
   for(const j of [-1.8,1.8])prop(front-side*2.9,1.6,jitterZ+j,.22,3.1,.22,materials.prop,'#efe9db');
   const lawnW=width+11;
   prop(front-side*9,.06,jitterZ,19,.12,lawnW,materials.grass,'#9bb06a');
   // Side hedges mark the property line; a full-height run at the kerb walled the
   // street off completely.
   if(r()<.65)for(const j of [-lawnW/2+1.4,lawnW/2-1.4])
    prop(front-side*6,.55,jitterZ+j,11,1.05,.85,materials.hedge,pick(['#4c6b3a','#5a7a44','#43613a'],r));
   prop(front-side*7,.07,jitterZ+width*.3,12,.14,3.4,materials.prop,'#b5b0a2');    // driveway
   for(let k=0;k<3;k++){
    const q=place(front-side*(5+r()*7),0,jitterZ+(r()-.5)*(width+8)),v=new T.Vector3();
    q.decompose(v,new T.Quaternion(),new T.Vector3());
    if(r()<.55)this.addTree(batch,{x:v.x,y:v.y,z:v.z},r()*6.28,r()<.4?'jacaranda':'oak',.85+r()*.5);
    else this.addShrub(batch,{x:v.x,y:v.y,z:v.z},1.1+r()*1.1,pick(['#4f6b3d','#5d7a42','#6b7f4a','#7a8850'],r));
   }
  }else if(style==='industrial'||style==='warehouseLow'){
   prop(dxCentre,height+.3,jitterZ,depth+.8,.6,width+.8,materials.roofProp,pick(ROOF_FLAT,r));
   for(let k=0;k<3;k++)prop(dxCentre+(r()-.5)*depth*.5,height+1.3,jitterZ+(r()-.5)*width*.6,2.4,1.6,2.4,materials.prop,'#9aa0a0');
   prop(front-side*3,.08,jitterZ,6,.16,width,materials.prop,'#9d9a90');      // loading apron
   for(let j=-width/2+4;j<width/2-2;j+=7)prop(front-side*.2,2.1,jitterZ+j,.3,4.2,4,materials.prop,'#6f7674');
  }else{
   // Commercial: storefront band, cornice, upper-floor rhythm, signage.
   slab('storefront',front-side*.45,0,jitterZ,width-1.2,4.6,.9,'#efe8d8');
   prop(front-side*1.5,4.9,jitterZ,3.1,.22,width-1.4,materials.prop,pick(['#8f3f3a','#2f5647','#6a4a7a','#2e4a6b','#8a6a2e'],r));  // awning
   prop(dxCentre,height+.3,jitterZ,depth+.9,.55,width+.9,materials.roofProp,style==='oldtown'||style==='luxury'?'#e8dfc9':pick(ROOF_FLAT,r));
   if(style==='oldtown'||style==='luxury'){
    for(let f=1;f<floors;f++)prop(front-side*.28,f*FLOOR+1.4,jitterZ,.42,.26,width,materials.prop,'#efe6d2'); // string course
    prop(dxCentre,height+.9,jitterZ,depth+1.5,.5,width+1.5,materials.prop,'#f2ead6');          // cornice
   }
   if(r()<.4)prop(dxCentre,height+1.4,jitterZ,3,2,2.6,materials.prop,'#6c7370');               // rooftop plant
   const names=profile.signs;
   if(names.length){
    const pos=place(front-side*1.55,5.45,jitterZ),v=new T.Vector3();
    pos.decompose(v,new T.Quaternion(),new T.Vector3());
    const neon=profile.neon&&r()>.45;
    this.sign(group,pick(names,r),{x:v.x,y:v.y,z:v.z},a-side*Math.PI/2,Math.min(width-1.5,14),neon?'#f5b6d6':'#efdfbe',neon);
    if(neon&&r()>.6){
     const bl=place(front-side*.9,height-2,jitterZ+width/2-1.2),bv=new T.Vector3();
     bl.decompose(bv,new T.Quaternion(),new T.Vector3());
     batch.box({x:bv.x,y:bv.y,z:bv.z},[1.1,6,1.1],materials.neon,a,pick(['#ff8fc4','#7fd8ff','#ffd27f'],r));
    }
   }
  }
 }

 /** Lots that are deliberately not buildings. Without these the frontage never breathes. */
 lot(set,batch,group,spec){
  const {p,a,side,seed,type}=spec,r=rng(seed);
  const cos=Math.cos(a),sin=Math.sin(a);
  const at=(dx,dz)=>({x:p.x+cos*dx+sin*dz,y:p.y,z:p.z-sin*dx+cos*dz});
  const box=(dx,dy,dz,sx,sy,sz,mat,color)=>{const q=at(dx,dz);batch.box({x:q.x,y:q.y+dy,z:q.z},[sx,sy,sz],mat,a,color);};
  if(type==='parking'){
   box(0,.07,0,26,.14,30,materials.prop,'#6f7269');
   for(let j=-12;j<=12;j+=3.2)box(0,.09,j,24,.03,.14,materials.prop,'#e8e2cf');
   for(const j of [-15.5,15.5])this.addTree(batch,at(6,j),a,r()<.5?'jacaranda':'oak',.9+r()*.3);
   box(-12,1.4,-14,.3,2.8,.3,materials.dark,a);
  }else if(type==='pocketPark'){
   box(0,.08,0,26,.16,30,materials.grass,pick(['#8fae5f','#7fa257','#9ab469'],r));
   for(let k=0;k<7;k++){
    const q=at((r()-.5)*22,(r()-.5)*26);
    if(r()<.55)this.addTree(batch,q,r()*6.28,pick(['oak','jacaranda','pine'],r),.9+r()*.7);
    else this.addShrub(batch,q,1.2+r()*1.4,pick(['#4f6b3d','#67824a','#7d9450','#a8b06a'],r));
   }
   box(-2,.5,0,1.8,.12,4.2,materials.prop,'#cfc7b4');
   for(let j=-6;j<=6;j+=6)box(4,.55,j,.6,1.1,1.8,materials.prop,'#8a6f4e');   // benches
  }else{ // yard: fenced back-of-house
   box(0,.07,0,24,.14,28,materials.prop,'#8d8778');
   for(let j=-12;j<=12;j+=4)box(-11,1.1,j,.18,2.2,3.6,materials.prop,'#a8a091');
   for(let k=0;k<3;k++)box(2+r()*6,1.3,(r()-.5)*20,3.4,2.6,2.4,materials.prop,pick(['#7d8a7a','#94806a','#6f7a80'],r));
   if(r()<.6)this.addTree(batch,at(8,10),a,'oak',1.1);
  }
 }

 /* ----------------------------------------------------------- street props */
 street(batch,group,spec){
  const chain=this.net.chains[spec.chain],hit=this.net.chainPoint(chain,spec.d);
  const e=hit.edge,p=hit.p,a=hit.heading,half=chain.width/2;
  const point=(off,h=0)=>{const q=this.net.chainPoint(chain,spec.d,off).p;q.y+=h;return q;};
  const tunnel=e.kind==='tunnel',freeway=e.kind==='freeway'||e.kind==='ramp',dirt=e.kind==='dirt';
  const r=rng(spec.seed);
  if(dirt){ // fire roads get scrub and boulders, not kerbs and lamps
   for(const side of [-1,1]){
    if(r()<.5)this.addShrub(batch,point(side*(half+2+r()*4)),1.2+r()*1.6,pick(['#6f7a4a','#87895a','#5d6b3f'],r));
    if(r()<.22)this.addTree(batch,point(side*(half+5+r()*4)),r()*6.28,'pine',1+r()*.6);
    if(r()<.3)batch.add(geometries.sphere,materials.prop,point(side*(half+2.5),-.3),[1+r(),.7+r()*.5,1+r()],r()*6.28,'#8d8577');
   }
   return;
  }
  for(const side of [-1,1]){
   const off=side*(half+1.1);
   batch.box(point(off,3.9),[.13,7.8,.13],materials.dark,a);
   batch.box(point(side*(half-.2),7.8),[2.6,.11,.14],materials.dark,a);
   batch.box(point(side*(half-1.4),7.72),[.8,.08,.35],materials.light,a);
   this.lampPositions.push(point(side*(half-1.4),7.6));
   if(freeway){
    batch.box(point(side*(half+.2),.65),[.45,1.3,30],materials.concrete,a);
    batch.box(point(side*(half-1),-4),[1.2,8,1.8],materials.concrete,a);
   }else if(!tunnel){
    const nearby=this.net.nearby(p.x,p.z),treeP=point(side*(half+5.5));
    if(!nearby.some(other=>other.id!==e.id&&this.net.project(other,treeP.x,treeP.z).distance<other.width/2+2)){
     const d=e.district;
     const kind=d==='San Marino'||d==='Hancock Park'?'oak'
      :d==='Beverly Hills'||d==='West Hollywood'||d==='Hollywood'||d==='Downtown Los Santerra'?'palm'
      :d==='Hollywood Hills'||d==='Verdugo Hills'?'pine'
      :r()<.3?'jacaranda':r()<.6?'oak':'palm';
     this.addTree(batch,treeP,a,kind,kind==='oak'?1.15:kind==='pine'?1.1:.95);
    }
    // Paved frontage between kerb and building line; a lawn there read as a
    // suburban verge in the middle of a downtown block.
    if(profileFor(e.district).paved)batch.box(point(side*(half+11),.12),[16,.2,30.5],materials.sidewalk,a);
    else if(r()<.45)this.addShrub(batch,point(side*(half+3.4)),.9+r()*.7,pick(['#55703e','#66804a','#7e8f4e'],r));
    if(spec.seed%3===0){
     batch.box(point(side*(half+2),.45),[.65,.9,.65],materials.dark,a);
     batch.box(point(side*(half+2),1),[.55,.13,.55],materials.metal,a);
    }
    if(r()<.12){ // parked car at the kerb
     batch.box(point(side*(half-1.5),.75),[1.9,1.4,4.4],materials.prop,pick(['#8d9aa6','#7a6f66','#9c9488','#5f6b74','#a8705f'],r),a);
    }
   }
  }
  if(tunnel){
   for(const side of [-1,1]){
    batch.box(point(side*(half+.5),3.6),[1,7.2,30.4],materials.concrete,a);
    batch.box(point(side*(half-.08),1),[.08,.1,28],materials.light,a);
   }
   batch.box(point(0,7.4),[e.width+2,1,30.5],materials.concrete,a);
   for(const side of [-1,1])batch.box(point(side*3,6.8),[.2,.08,4],materials.light,a);
  }
 }

 junction(batch,group,id){
  const n=this.net.nodes[id],adj=this.net.adj[id].map(i=>this.net.edges[i]);
  const w=Math.max(...adj.map(e=>e.width));
  if(w<17)return;
  for(const e of adj){
   const t=e.a===id?Math.min(14/e.length,.35):Math.max(0,1-14/e.length),a=e.heading;
   for(let off=-e.width/2+1;off<e.width/2-1;off+=2){
    const q=this.net.point(e,t,off);batch.box({...q,y:q.y+.04},[.85,.03,2.5],materials.paint,a);
   }
   const q=this.net.point(e,t,e.width/2+1);
   batch.box({...q,y:q.y+2.9},[.12,5.8,.12],materials.dark,a);
   batch.box({...q,y:q.y+5.4},[.4,1,.35],materials.dark,a);
   batch.box({...q,y:q.y+5.35},[.23,.24,.39],Math.abs(Math.sin(a))>.7?materials.signalEW:materials.signalNS,a);
  }
 }

 /* ---------------------------------------------------------- hero landmarks */
 landmark(group,set,batch,name){
  const hit=this.net.landmarkRoad(name),e=hit.edge;
  const p=this.net.point(e,hit.t,e.width/2+42),a=e.heading;
  const at=(dx,dy,dz)=>({x:p.x+Math.cos(a)*dx+Math.sin(a)*dz,y:p.y+dy,z:p.z-Math.sin(a)*dx+Math.cos(a)*dz});
  if(name==='Hollywood Sign'){
   // Glyphs are bars in a unit box: [cx, cy, w, h, roll]. Crude up close, but
   // this reads as HOLLYWOOD from the basin, which is the only place it matters.
   const G={
    H:[[-.36,0,.2,1,0],[.36,0,.2,1,0],[0,0,.55,.2,0]],
    O:[[-.36,0,.2,1,0],[.36,0,.2,1,0],[0,.4,.55,.2,0],[0,-.4,.55,.2,0]],
    L:[[-.36,0,.2,1,0],[.06,-.4,.66,.2,0]],
    Y:[[-.22,.28,.2,.62,.5],[.22,.28,.2,.62,-.5],[0,-.28,.2,.45,0]],
    W:[[-.34,0,.17,1,.22],[-.12,-.1,.17,.8,-.28],[.12,-.1,.17,.8,.28],[.34,0,.17,1,-.22]],
    D:[[-.36,0,.2,1,0],[.02,.4,.6,.2,0],[.02,-.4,.6,.2,0],[.34,0,.2,.7,0]],
   };
   const word='HOLLYWOOD',LW=12,LH=17,GAP=15.5;
   const l=this.net.landmark(name);
   const cx=(l.map[0]-768)*10,cz=(l.map[1]-512)*10;
   for(let i=0;i<word.length;i++){
    const ox=cx+(i-(word.length-1)/2)*GAP;
    const ground=terrainHeight(ox,cz);
    for(const [gx,gy,gw,gh,roll] of G[word[i]]){
     const m=new T.Matrix4().compose(
      new T.Vector3(ox+gx*LW,ground+LH/2+1.5+gy*LH,cz),
      new T.Quaternion().setFromEuler(new T.Euler(-.12,0,roll)),
      new T.Vector3(1,1,1));
     set.add(materials.fa_plain,new T.BoxGeometry(gw*LW,gh*LH,1.4),m,'#f6f3ea');
    }
    // Scaffold legs, as on the real sign.
    for(const j of [-1,1])batch.box({x:ox+j*LW*.3,y:ground+.9,z:cz+1.2},[.5,2.4,.5],materials.prop,0,'#7d796f');
   }
   return;
  }
  if(name==='Pasadena Civic Center'){
   set.add(materials.fa_stucco,slabGeometry(23,14,55,5,5),new T.Matrix4().makeTranslation(at(0,7,0).x,at(0,7,0).y,at(0,7,0).z),'#e6d9bd');
   batch.box(at(0,15,0),[12,30,12],materials.prop,a,'#efe4cb');
   batch.add(geometries.sphere,materials.roofProp,at(0,32,0),[7,6,7],0,'#7f9c8a');
   this.sign(group,'PASADENA CIVIC CENTER',at(0,10,-12),0,23);
  }else if(name==='San Marino High School'){
   set.add(materials.fa_house,slabGeometry(20,8,58,5,4),new T.Matrix4().makeTranslation(at(0,4,0).x,at(0,4,0).y,at(0,4,0).z),'#f0e6d2');
   batch.add(geometries.roof,materials.roofProp,at(0,9,0),[16,3.4,44],a+Math.PI/4,'#a8583c');
   this.sign(group,'SAN MARINO HIGH SCHOOL',at(0,5,-11),0,28);
  }else if(name==='Mount Lee Overlook'){
   batch.box(at(0,.5,0),[26,1,12],materials.prop,a,'#a9a396');          // viewing terrace
   for(let j=-11;j<=11;j+=2.6)batch.box(at(5.6,1.5,j),[.14,1.1,.14],materials.metal,a,'#9fa4a6');
   batch.box(at(5.6,2.1,0),[.16,.16,23],materials.metal,a,'#9fa4a6');
   for(const j of [-8,8])batch.box(at(-4,1.1,j),[.7,1.2,2.2],materials.prop,a,'#7d6a52');
   this.sign(group,'MOUNT LEE OVERLOOK',at(-7,2.6,0),a-Math.PI/2,9);
  }else if(name==='Exposition Park'){
   batch.box(at(0,.1,0),[120,.2,150],materials.grass,a,'#8fae5f');
   const r=rng(5150);
   for(let k=0;k<26;k++)this.addTree(batch,at((r()-.5)*110,0,(r()-.5)*140),r()*6.28,pick(['oak','jacaranda'],r),1+r()*.7);
   this.sign(group,'EXPOSITION PARK',at(0,3.4,-40),0,20);
  }else if(name==='Echo Park'){
   const lake=new T.Mesh(new T.CircleGeometry(62,48),materials.water);
   lake.rotation.x=-Math.PI/2;const c=at(0,.25,0);lake.position.set(c.x,c.y,c.z);lake.scale.y=1.5;
   group.add(lake);
   const r=rng(4460);
   for(let k=0;k<18;k++)this.addTree(batch,at(Math.cos(k)*72+(r()-.5)*12,0,Math.sin(k)*82+(r()-.5)*12),r()*6.28,'palm',1.1);
  }
 }

 /* ------------------------------------------------------------- streaming */
 update(x,z,time,night,hour){
  if(typeof hour==='number')this.hour=hour;
  this.sky.position.set(x,0,z);
  this.skyMaterial.uniforms.time.value=time;
  this.skyMaterial.uniforms.sunDir.value.copy(this.sunDirection(this.hour));
  this.refreshEnvironment();
  const dir=this.sunDirection(this.hour),day=clamp((dir.y+.14)/.34,0,1);
  const dark=day<.28;
  if(dark!==this.night)this.night=dark;
  const glow=clamp((.34-day)/.30,0,1);
  if(this.skylineMaterial)this.skylineMaterial.userData.night.value=glow;
  for(const kind of ['office','glass','brick','stucco','house','warehouse','storefront'])
   materials['fa_'+kind].emissiveIntensity=glow*(kind==='glass'?1.25:.95);
  this.scene.environmentIntensity=dark?.38:1.05;
  const green=Math.floor(time/13)%2===0;
  materials.signalEW.emissive.set(green?'#69be84':'#b52618');materials.signalEW.color.copy(materials.signalEW.emissive);
  materials.signalNS.emissive.set(green?'#b52618':'#69be84');materials.signalNS.color.copy(materials.signalNS.emissive);

  const cx=Math.floor(x/384),cz=Math.floor(z/384),wanted=[];
  for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++)wanted.push([cx+i,cz+j]);
  wanted.sort((a,b)=>(a[0]-cx)**2+(a[1]-cz)**2-(b[0]-cx)**2-(b[1]-cz)**2);
  for(const [key,c] of this.chunks){
   const [a,b]=key.split(',').map(Number);
   c.group.visible=Math.abs(a-cx)<=2&&Math.abs(b-cz)<=2;
   const stand=this.skyline.get(key);
   if(stand)stand.visible=!c.group.visible;
   if(Math.abs(a-cx)>4||Math.abs(b-cz)>4){
    this.scene.remove(c.group);
    c.group.traverse(o=>{if(o.isInstancedMesh)o.dispose();else if(o.isMesh)o.geometry.dispose();});
    this.chunks.delete(key);
    if(stand)stand.visible=true;
   }
  }
  let budget=2;
  for(const [a,b] of wanted){
   const key=`${a},${b}`;
   if(this.chunks.has(key)||!budget)continue;
   budget--;
   const batch=new Batch(),set=new MeshSet(),group=new T.Group();
   const start=this.colliders.length,startLamp=this.lampPositions.length;
   for(const spec of this.specs.get(key)||[]){
    if(spec.type==='building')this.building(set,batch,group,spec);
    else if(spec.type==='parking'||spec.type==='pocketPark'||spec.type==='yard')this.lot(set,batch,group,spec);
    else if(spec.type==='street')this.street(batch,group,spec);
    else this.junction(batch,group,spec.node);
   }
   for(const l of this.net.data.landmarks){
    const anchored=l.name==='Hollywood Sign';
    const p=anchored?{x:(l.map[0]-768)*10,z:(l.map[1]-512)*10}:this.net.landmarkRoad(l.name).p;
    if(Math.floor(p.x/384)===a&&Math.floor(p.z/384)===b)this.landmark(group,set,batch,l.name);
   }
   set.finish(group);
   group.add(batch.finish());
   if(group.userData.signBatch){group.add(group.userData.signBatch.finish());delete group.userData.signBatch;}
   this.scene.add(group);
   const stand=this.skyline.get(key);if(stand)stand.visible=false;
   this.chunks.set(key,{group,colliders:this.colliders.splice(start),lamps:this.lampPositions.splice(startLamp)});
  }
  this.lampPositions=[...this.chunks.values()].filter(c=>c.group.visible).flatMap(c=>c.lamps);
 }

 collision(x,y,z){
  for(const c of this.chunks.values()){
   if(!c.group.visible)continue;
   for(const b of c.colliders){
    if(y>b.y+b.height||y<b.y-3)continue;
    const dx=x-b.x,dz=z-b.z;
    const lx=dx*Math.cos(b.a)-dz*Math.sin(b.a),lz=dx*Math.sin(b.a)+dz*Math.cos(b.a);
    if(Math.abs(lx)<b.hx+1&&Math.abs(lz)<b.hz+2)return true;
   }
  }
  return false;
 }
}
