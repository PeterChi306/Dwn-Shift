#!/usr/bin/env node
/* Handling lab (2026-10-01): the real vehicle.js + handling.js on a flat pad,
 * no browser. Scripted manoeuvres at several speeds, printing peak yaw rate,
 * body slip (beta), steady lateral g, whether it went past 34 degrees ("spun"
 * = a slide that big), end speed and heading. Use it before and after any
 * change to the tyres, the assists or the steering.
 *
 *   node tools/handling-lab.mjs                       all manoeuvres, grip mode
 *   node tools/handling-lab.mjs lane,hand '{"speeds":[60,150],"mode":"drift","tc":false}'
 *   ... '{"log":true}'                                 a trace per manoeuvre
 *
 * The drivetrain is a stub (hold speed, or a 600 kW power curve with `gas`),
 * so launch-feel bugs that involve game.js's clutch will not show here.
 */
import {register} from 'node:module';
const THREE = new URL('../vendor/three/three.core.js', import.meta.url).href;
register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){return s==='three'?{url:${JSON.stringify(THREE)},shortCircuit:true}:n(s,c);}`));
// Headless handling lab: flat pad, Aurora wheels, scripted manoeuvres.
const ROOT=new URL('../',import.meta.url).href;
const V=await import(ROOT+'world/vehicle.js');
const N=await import(ROOT+'world/network.js');
const H=await import(ROOT+'world/handling.js');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wheelsAt=(xf,xr,zf,zr,r)=>[{x:xf,y:r,z:zf,front:true},{x:-xf,y:r,z:zf,front:true},{x:xr,y:r,z:zr,front:false},{x:-xr,y:r,z:zr,front:false}];
async function run(name,script,{kmh=150,drive='rwd',mode='grip',tc=true,T=6,log=false}={}){
  const P=await V.createPhysics();
  // ground: big flat box
  P.world.createCollider(P.R.ColliderDesc.cuboid(5000,1,5000).setTranslation(0,-1,0).setFriction(.9));
  const car=new V.Car(P,wheelsAt(.91,.91,1.41,-1.41,.365),{radius:.365,mass:1390});
  car.place(0,0,0,0);car.drive=drive;if(car.setMode)car.setMode(mode);
  const st={v:0,brake:0,in:{gas:0,brake:0},autoSel:'D',engineOn:true,spinV:0,throttle:0};
  // settle
  const ctl=H?new H.Steering():null;
  let steer=0,keySteer=0;const dt=1/60;
  for(let i=0;i<60;i++)car.step(dt,st,0);
  // launch to speed instantly
  const v0=kmh/3.6;car.body.setLinvel({x:0,y:0,z:v0},true);st.v=v0;car.lastDrive=v0;
  const out={name,maxYaw:0,maxBeta:0,maxLatG:0,spun:false,minV:1e9,endHeading:0,trace:[]};
  let b0=0,tHold=v0,pv=null,ss=[],bs=[];
  for(let t=0;t<T;t+=dt){
    const cmd=script(t,st)||{};const raw=cmd.steer||0;
    // drivetrain stub: hold speed (or throttle), simple power limit
    const gas=cmd.gas??null;
    let acc=0;
    if(gas===null){acc=clamp((tHold-st.v)*2,-3,3);}else{const F=Math.min(9000,600000*gas/Math.max(5,Math.abs(st.v)));acc=F/1390-(.0004*st.v*st.v);}
    if(cmd.brake)acc-=9*cmd.brake;
    st.in.gas=gas??.4;st.throttle=st.in.gas;st.in.brake=cmd.brake||0;st.brake=cmd.brake||0;
    st.spinV=cmd.spin||0;st.tc=tc;
    st.v+=acc*dt;
    car.handbrake=cmd.hand?1:0;
    if(H){car.tc=tc;steer=ctl.update(dt,{raw,speed:st.v,car});}
    else{
      keySteer+=clamp(raw-keySteer,-dt*(raw?4.4:6),dt*(raw?4.4:6));
      let target=N.steeringTarget(keySteer,Math.abs(st.v),1);
      const over=Math.abs(car.rearSlip)-Math.abs(car.frontSlip);
      if(Math.abs(st.v)>6&&over>.03)target+=clamp(car.rearSlip*.55,-.18,.18)*(1-Math.min(1,Math.abs(keySteer)*1.6));
      steer+=clamp((target-steer)*(1-Math.exp(-dt*14)),-dt*2.6,dt*2.6);
    }
    car.step(dt,st,steer);
    const lv=car.body.linvel(),av=car.body.angvel(),h=car.heading;
    const sp=Math.hypot(lv.x,lv.z),beta=sp>2?Math.atan2(lv.x,lv.z)-h:0;const b=Math.atan2(Math.sin(beta),Math.cos(beta));
    const yaw=av.y;b0=b;
    out.maxYaw=Math.max(out.maxYaw,Math.abs(yaw));out.maxBeta=Math.max(out.maxBeta,Math.abs(b)*57.3);
    out.maxLatG=Math.max(out.maxLatG,Math.abs(yaw*sp)/9.81);out.minV=Math.min(out.minV,sp*3.6);
    if(Math.abs(b)>.6)out.spun=true;
    if(pv&&t>2.5&&t<4){const ax=(lv.x-pv.x)/dt,az=(lv.z-pv.z)/dt;ss.push(Math.abs(ax*Math.cos(h)-az*Math.sin(h))/9.81);bs.push(Math.abs(b)*57.3);}pv={x:lv.x,z:lv.z};
    if(log&&Math.round(t*60)%6===0)out.trace.push([+t.toFixed(2),+(steer*57.3).toFixed(1),+(b*57.3).toFixed(1),+yaw.toFixed(2),+(sp*3.6).toFixed(0),+(1-2*(car.rotation.x**2+car.rotation.z**2)).toFixed(2),car.grounded,car.skid.map(s=>+s.toFixed(1)).join("|")]);
  }
  out.ssG=ss.length?+(ss.reduce((a,b)=>a+b,0)/ss.length).toFixed(2):0;out.ssB=bs.length?+(bs.reduce((a,b)=>a+b,0)/bs.length).toFixed(1):0;out.endB=+(Math.abs(b0)*57.3).toFixed(1);out.endHeading=+(car.heading*57.3).toFixed(0);out.endKmh=+(Math.hypot(car.body.linvel().x,car.body.linvel().z)*3.6).toFixed(0);
  for(const k of ['maxYaw','maxBeta','maxLatG','minV'])out[k]=+out[k].toFixed(2);
  return out;
}
const S={
  tap30:t=>({steer:t>.5&&t<1.3?.3:0}),
  tapFull:t=>({steer:t>.5&&t<1.0?1:0}),
  holdFull:t=>({steer:t>.5?1:0}),
  holdHalf:t=>({steer:t>.5?.5:0}),
  lane:t=>({steer:t>.5&&t<.9?1:t>=.9&&t<1.3?-1:0}),
  hand:t=>({steer:t>.5&&t<2?1:0,hand:t>.5&&t<1.1}),
  gasTap:t=>({steer:t>.5&&t<1.3?.35:0,gas:1}),
  gasHalf:t=>({steer:t>.5?.5:0,gas:1}),
  gasLane:t=>({steer:t>.5&&t<.9?1:t>=.9&&t<1.3?-1:0,gas:1}),
  driftGas:t=>({steer:t>.3&&t<4?1:0,gas:t>.6?1:.3}),
  driftHB:t=>({steer:t>.3&&t<4?1:0,hand:t>.4&&t<.8,gas:t>.8?.8:.3}),
  driftExit:t=>({steer:t>.3&&t<3?1:0,hand:t>.4&&t<.8,gas:t<3?(t>.8?.8:.3):0}),
  powerRwd:t=>({steer:t>.3?.6:0,gas:t>1?1:.3,spin:t>1?4:0}),
};
const which=process.argv[2]||'all';const opts=JSON.parse(process.argv[3]||'{}');
const rows=[];
for(const [n,f] of Object.entries(S)){if(which!=='all'&&!which.split(',').includes(n))continue;
 for(const kmh of (opts.speeds||[80,150,230])){const o=await run(n,f,{kmh,...opts});rows.push(o);
  console.log(n.padEnd(9),String(kmh).padStart(4),'yaw',o.maxYaw,'β°',o.maxBeta,'ssG',o.ssG,'ssβ',o.ssB,'spun',o.spun,'minV',o.minV,'end',o.endKmh,'endβ',o.endB,'hdg',o.endHeading);
  if(opts.log)console.log(JSON.stringify(o.trace));}}
