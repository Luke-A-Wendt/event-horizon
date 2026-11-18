import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';

const norm=v=>Math.hypot(...v),sub=(a,b)=>a.map((x,i)=>x-b[i]),dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
const unit=v=>v.map(x=>x/norm(v));
const angle=(a,b)=>Math.acos(Math.max(-1,Math.min(1,dot(a,b))));
const close=(a,b,tol,message)=>assert(norm(sub(a,b))<tol,message);
// Evaluate in the actual rendered hull frame, independently of any camera guide state.
// The conformal chart changes apparent hull size by two orders of magnitude.
function hullView(r,ship){
 const f=r.cameraFrame,relative=sub(f.observer,ship.position).map(x=>x/ship.radius);
 return [relative,f.forward,f.right,f.up].map(v=>ship.frame.map(axis=>dot(axis,v)));
}
for(const scene of ['bridge','bridge-nebulae'])for(const adjusted of [false,true]){
 const fixtureGL=fixture(adjusted?{width:400,height:720}:{width:900,height:650});
 const r=new BlackHoleRenderer(fixtureGL.canvas,{autoStart:false,bindControls:false,deferProgram:true});
 try{
  let clock=1000;r.now=()=>clock;
  r.loadScene(scene);r.sceneLoad=null;r.state.paused=true;
  const step=()=>{clock+=1000/30;r.advanceSimulation(clock);r.fillObjects();r.updateCameraFrame();};
  const ship=()=>r.getFocusFrame(r.bridgeObjectId);
  if(adjusted){
   r.rotate(.45,.2);r.zoom(1.2);r.target.lookYaw=.14;r.target.lookPitch=-.08;
   // Let the ordinary input damping settle before recording the local view.
   for(let i=0;i<110;i++)step();
  }
  let view=hullView(r,ship());const eye=unit(view[0]);
  if(!adjusted){
   if(scene==='bridge')assert(eye[2]<-.9999,'centred astern');
   else assert(Math.abs(eye[0])>.9999,'broadside');
  }else{assert(Math.abs(eye[1])>.1,'orbit input changed the view');assert(Math.abs(dot(eye,view[1]))<.999,'look input changed the aim');}
  const base=r.configCache.primaryBasis[2],b=r.configCache.bridgeRadius,gate=base.map(x=>x*b*.5);
  let lastNose=[...ship().frame[2]],lastRadius=norm(ship().position),crossings=0,paused=false,passSamples=[0,0];
  const turn={near:[],far:[]};
  r.state.paused=false;
  for(let i=0;i<3600&&crossings<3;i++){
   step();const frame=ship(),nose=frame.frame[2],radius=norm(frame.position),f=r.cameraFrame;
   const rv=hullView(r,frame);
   for(let k=0;k<4;k++)close(rv[k],view[k],2e-7,scene+' lost camera offset in the ship frame at '+(clock/1000)+' s');
   const delta=angle(lastNose,nose);
   assert(delta<.14,scene+' jumps '+delta+' radians between consecutive frames');
   if(delta>.00001){
    assert(Math.abs(radius-lastRadius)<b*1e-9||delta<.0001,scene+' stationary reversal translated '+(radius-lastRadius)/b+' throat radii at '+clock+' ms; yaw '+delta+' rad');
    const side=radius>b*.5?'near':'far';
    turn[side].push(delta);
    // The ship and the camera should pause together halfway through a turn.
    if(!paused&&Math.abs(dot(nose,base))<.3){
     const pos=[...frame.position],heading=[...nose],eye=[...f.observer];
     r.state.paused=true;for(let j=0;j<6;j++)step();
     close(ship().position,pos,b*1e-10,'paused translation');close(ship().frame[2],heading,1e-10,'paused yaw');
     close(r.cameraFrame.observer,eye,b*1e-10,'paused camera');r.state.paused=false;paused=true;
    }
   }
   if((radius-b*.5)*(lastRadius-b*.5)<0||radius===b*.5&&lastRadius!==radius)crossings++;
   if(!adjusted&&scene==='bridge'&&Math.abs(radius-lastRadius)>b*1e-10&&(radius-b*.5)*(radius-lastRadius)<0){
    const toward=sub(gate,f.observer);
    assert(dot(unit(toward),f.forward)>.999,scene+' throat missed at '+clock+' ms; projection '+dot(unit(toward),f.forward)+'; chart radius '+radius/b+'; dR '+(radius-lastRadius)/b+'; nose '+dot(nose,base));
    passSamples[Number(radius<b*.5)]++;
   }
   lastRadius=radius;lastNose=[...nose];
  }
  assert.equal(crossings,3,'two complete turns and a subsequent crossing');assert(paused);
  for(const samples of Object.values(turn)){
   const total=samples.reduce((s,x)=>s+x,0),peak=Math.max(...samples);
   assert(Math.abs(total-Math.PI)<.005,'one stationary half turn per endpoint');
   assert(samples.length>30&&samples[0]<peak*.2&&samples.at(-1)<peak*.2,'starts and finishes yaw gently');
  }
  if(!adjusted&&scene==='bridge')assert(passSamples.every(n=>n>40),'both approach directions covered');
 }finally{r.dispose();}
}
console.log('PASS: side/rear views, centred rear bridge approaches, ship-relative orbit/look/zoom, stationary eased turns, pause, and both crossing directions.');
